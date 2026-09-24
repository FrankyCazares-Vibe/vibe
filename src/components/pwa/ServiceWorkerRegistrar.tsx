"use client";

import { useEffect } from "react";

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

/**
 * Registers the service worker (public/sw.js) once per page load. Mounted
 * once in the root layout; renders nothing.
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
        .catch(() => {});
    };

    // The browser checks /sw.js on navigations, but an installed app that is
    // only ever resumed may not navigate for days. This is how it picks up a
    // fix, or the kill switch, anyway.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !registration) return;
      if (Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
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
