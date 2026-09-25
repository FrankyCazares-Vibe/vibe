"use client";

import { useEffect } from "react";

import { appShellOnClient } from "@/lib/native/detect";
import { resyncDevicePush } from "@/lib/pwa/device-push";
import { isStandalone } from "@/lib/pwa/display-mode";
// Imported for its side effect: it attaches the beforeinstallprompt and
// appinstalled listeners as soon as the root layout's code loads, before
// any component that wants the install offer has mounted.
import "@/lib/pwa/install-prompt";

/** Never rename or move it; public/sw.js explains why. */
const SW_URL = "/sw.js";

/**
 * Exactly what public/html/_sw.js passes too. register() is only a no-op
 * when the URL AND the options match; anything else re-registers on every
 * page load.
 */
const SW_OPTIONS: RegistrationOptions = { scope: "/", updateViaCache: "none" };

/**
 * The only host that registers without a flag. Vercel previews share the
 * production database, and localhost runs `next dev`, so neither gets a
 * worker unless NEXT_PUBLIC_SW_DEV=1 is set on purpose.
 */
const PRODUCTION_HOST = "www.connectvibe.app";

/** An installed app can stay open for days; check for a new worker at most hourly. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** The icon count is asked for at most once a minute (plan.md §8 W10). */
const BADGE_REFRESH_MS = 60 * 1000;

type BadgeNavigator = Navigator & {
  standalone?: unknown;
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Registers the service worker (public/sw.js) once per page load. Mounted
 * once in the root layout; renders nothing. Once register() has settled it
 * also resyncs this browser's push device (plan.md §8 W5/W6), and in the
 * installed web app it keeps the icon's count current (W10).
 *
 * Every promise here ends in .catch(() => {}): the Sentry client records
 * unhandled rejections, and update() rejects whenever the phone is offline,
 * which is exactly when an installed app resumes. register() rejects in
 * private windows and some in-app browsers. None of that is actionable.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;

    // Kill switch (scripts/pwa/sw-killswitch.js has the drill). It runs on every
    // host so no stray registration survives anywhere.
    if (process.env.NEXT_PUBLIC_SW_KILL === "1") {
      unregisterAll(container);
      deleteAllCaches();
      return;
    }

    // Never inside the store apps (plan.md §6 S2A; critic-s2s3.md item 8).
    // The iPhone app's web view has no service worker at all, so this is for
    // Android's, which does: the worker would take offline over from
    // Capacitor's own offline page. Unregister rather than just return, so a
    // worker an earlier build registered in the app doesn't stay behind.
    if (appShellOnClient() !== null) {
      unregisterAll(container);
      return;
    }

    const allowed =
      window.location.hostname === PRODUCTION_HOST || process.env.NEXT_PUBLIC_SW_DEV === "1";
    if (!allowed) {
      // A worker left over from an earlier NEXT_PUBLIC_SW_DEV=1 session
      // shouldn't keep answering localhost:3000.
      unregisterAll(container);
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let lastCheck = Date.now();
    let active = true;
    let lastBadge = 0;
    let badgeStopped = false;
    let cancelIdle: (() => void) | null = null;

    // The icon's count (plan.md §8 W10): the installed web app only, and only
    // with permission, since WebKit refuses setAppBadge without it
    // (critic-w3.md item 25). A 401 means nobody is signed in on this page,
    // so it stops asking until the next load.
    const refreshBadge = () => {
      if (badgeStopped || !badgeAllowed()) return;
      if (Date.now() - lastBadge < BADGE_REFRESH_MS) return;
      lastBadge = Date.now();
      fetch("/api/me/badge", { credentials: "same-origin", cache: "no-store" })
        .then(async (res) => {
          if (res.status === 401) {
            badgeStopped = true;
            return;
          }
          if (!res.ok || !active) return;
          const total = readTotal(await res.json());
          if (total !== null) await showBadge(total);
        })
        .catch(() => {});
    };

    // Once register() has SETTLED, success or failure (critic-w3.md item 24):
    // on iOS 18.4+ a subscription can live on window.pushManager with no
    // worker at all, so a failed register must not skip W5's evict. When the
    // page is idle, so it never competes with it.
    const afterRegister = () => {
      if (!active) return;
      cancelIdle = whenIdle(() => {
        cancelIdle = null;
        if (!active) return;
        void resyncDevicePush();
        refreshBadge();
      });
    };

    // After `load`, so registering (and the worker's first fetch of
    // /offline.html) never competes with the page's own first paint.
    const register = () => {
      container
        .register(SW_URL, SW_OPTIONS)
        .then((reg) => {
          if (!active) return;
          registration = reg;
          lastCheck = Date.now();
        })
        .catch(() => {})
        .then(afterRegister);
    };

    // The browser checks /sw.js on navigations, but an installed app that is
    // only ever resumed may not navigate for days. This is how it picks up a
    // fix, or the kill switch, anyway. Coming back is also when the icon's
    // count is most likely stale.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refreshBadge();
      if (!registration || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      cancelIdle?.();
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

function unregisterAll(container: ServiceWorkerContainer): void {
  container
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((reg) => reg.unregister().catch(() => false))),
    )
    .catch(() => {});
}

function deleteAllCaches(): void {
  if (typeof caches === "undefined") return;
  caches
    .keys()
    .then((names) => Promise.all(names.map((name) => caches.delete(name).catch(() => false))))
    .catch(() => {});
}

/** `run` when the page is idle (within 5 s), or on the next task where there's no idle callback. */
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1);
  return () => window.clearTimeout(id);
}

function badgeAllowed(): boolean {
  try {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    const matches = (query: string) =>
      typeof window.matchMedia === "function" && window.matchMedia(query).matches;
    return isStandalone({
      navigatorStandalone: nav.standalone,
      matchStandalone: matches("(display-mode: standalone)"),
      matchFullscreen: matches("(display-mode: fullscreen)"),
    });
  } catch {
    return false;
  }
}

/** `total` from GET /api/me/badge, or null when it isn't a whole number. */
function readTotal(body: unknown): number | null {
  const total = (body as { total?: unknown } | null)?.total;
  return typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : null;
}

async function showBadge(total: number): Promise<void> {
  const nav = navigator as BadgeNavigator;
  if (total === 0 && typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
  else await nav.setAppBadge?.(total);
}
