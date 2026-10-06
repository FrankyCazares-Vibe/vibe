"use client";

import { useEffect } from "react";

import {
  ANSWER_WITHIN_MS,
  BUILD_ID,
  cleanBuildId,
  noteLoadedBuild,
  readReloadedFor,
  reloadTarget,
  rememberReload,
  safeToReload,
  shouldAsk,
  VERSION_PATH,
} from "@/lib/build/build-refresh";
import { gestureCount, takeSnapshot, watchTyping } from "@/lib/build/page-snapshot";
import { appShellOnClient } from "@/lib/native/detect";

/**
 * Keeps an open tab on the newest build. Mounted once in the root layout;
 * renders nothing. The older static pages that show inside a Next page as a
 * same-origin frame (Messages, onboarding) are covered from here. The
 * desktop profile is the one static page that takes over the whole tab, so
 * it runs a small twin of this check, public/html/_buildRefresh.js.
 *
 * When the person comes back to the tab (it becomes visible, or the page
 * returns from the back-forward cache) it asks GET /api/version, at most
 * once every two minutes with the page load counting as the first. If the
 * answer is another build and the page is idle, it reloads. If the person is
 * in the middle of something (build-refresh.ts `blockedBy`), or has already
 * tapped, typed or scrolled by the time the answer lands, it does nothing,
 * and a later return to the tab asks again.
 *
 * - The reload only ever follows an answer that has just arrived, so it
 *   cannot happen offline or against a site that is down.
 * - It cannot loop: the build it reloads for is written to sessionStorage
 *   first, and the same build is never the reason twice.
 * - No timer: a tab nobody returns to asks for nothing.
 * - Every failure (offline, an error page, a slow answer, blocked storage)
 *   ends in "do nothing".
 */
export function BuildRefresh(): null {
  useEffect(() => {
    const session = () => window.sessionStorage;

    // Not inside the store apps. NativeBridge sends the app to a page when a
    // link or a notification opens it, and a second navigation on top of
    // that one is what the shell shows as its error page. It needs a pass on
    // a real phone before it is switched on there.
    const mine = appShellOnClient() === null ? BUILD_ID : "";

    // For the static desktop profile, which has no build id of its own:
    // this tab's build, or nothing where the check is off.
    noteLoadedBuild(session, mine);

    // No build id: local dev, or a build Vercel gave none. Nothing to
    // compare, so nothing is listened for and nothing is ever asked.
    if (!mine) return;

    let active = true;
    let leaving = false;
    // The page load counts as an ask: a fresh page is the newest build.
    let checkedAt = Date.now();
    const stopWatching = watchTyping();

    const onAnswer = (live: string, gesturesAtAsk: number) => {
      if (!active || leaving) return;
      const target = reloadTarget({
        mine,
        live,
        reloadedFor: readReloadedFor(session),
      });
      if (!target) return;
      const safe = safeToReload({
        visible: document.visibilityState === "visible",
        path: window.location.pathname,
        touched: gestureCount() !== gesturesAtAsk,
        page: takeSnapshot(),
      });
      if (!safe) return;
      if (!rememberReload(session, target)) return;
      leaving = true;
      window.location.reload();
    };

    const onReturn = () => {
      if (!active || leaving) return;
      const now = Date.now();
      const due = shouldAsk({
        mine,
        visible: document.visibilityState === "visible",
        online: navigator.onLine !== false,
        path: window.location.pathname,
        now,
        checkedAt,
      });
      if (!due) return;
      checkedAt = now;
      const gesturesAtAsk = gestureCount();
      askLiveBuild()
        .then((live) => onAnswer(live, gesturesAtAsk))
        .catch(() => {});
    };

    // `persisted`: the page was brought back whole from the back-forward
    // cache, old code and all. An ordinary load fires pageshow too, with
    // persisted false, and is left alone.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn();
    };

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      active = false;
      stopWatching();
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}

/**
 * The build the site is serving right now, or "" when that cannot be told.
 * No cookie goes with the request and none comes back, and it does not say
 * which page it came from (no Referer): the answer is the same for
 * everyone, signed in or not.
 */
async function askLiveBuild(): Promise<string> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), ANSWER_WITHIN_MS);
  try {
    const res = await fetch(VERSION_PATH, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: abort.signal,
    });
    if (!res.ok) return "";
    const body = (await res.json()) as { build?: unknown } | null;
    return cleanBuildId(body?.build);
  } catch {
    return "";
  } finally {
    window.clearTimeout(timer);
  }
}
