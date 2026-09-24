"use client";

import { useEffect } from "react";

import { downloadFile } from "@/lib/feedback/request";
import {
  anchorAction,
  appPathFromLink,
  exitApp,
  listenNative,
  NATIVE_BACK_EVENT,
  nativeLaunchUrl,
  openInBrowser,
  styleStatusBarForCream,
} from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

/** On `<html>` in the store apps only; globals.css paints cream behind the page with it. */
const APP_CLASS = "vibe-app";

/**
 * Marks "the link that launched the app has been opened" for this app
 * session. sessionStorage lasts as long as the app's web view does and
 * survives full page loads, which is exactly the span to cover
 * (critic-s2s3.md item 3).
 */
const LAUNCH_URL_KEY = "vibe.launchUrlHandled";

/**
 * The page a native link is already on its way to. The link that launched
 * the app arrives twice on an iPhone (the launch URL and the link event), and
 * a second `location.assign` to the same place cancels the first navigation,
 * which the shell shows as its error page. A full page load resets it.
 */
let pendingTarget: string | null = null;

function currentPath(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

/** Opens a link handed over by the phone, if it's one of Vibe's own pages. */
function openFromNative(url: string | null | undefined): void {
  const target = appPathFromLink(url);
  if (!target || target === currentPath() || target === pendingTarget) return;
  pendingTarget = target;
  window.location.assign(target);
  // A change of hash alone finishes at once without leaving the page, so
  // nothing is pending any more.
  if (currentPath() === target) pendingTarget = null;
}

/**
 * True the first time it's asked in an app session. Every full page load
 * mounts this component again, and the launch link never changes, so asking
 * for it on every load would pull the student back to it forever. When
 * storage is unavailable the answer is no: missing a launch link is better
 * than a loop.
 */
function claimLaunchUrl(): boolean {
  try {
    if (window.sessionStorage.getItem(LAUNCH_URL_KEY)) return false;
    window.sessionStorage.setItem(LAUNCH_URL_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Taps on links, in the app only (critic-s2s3.md item 4). A bubble listener
 * on `document`, added after hydration, so it runs after React's own handlers
 * (the App Router hangs them on `document` when the page hydrates). A link
 * Next's <Link> routed, or any handler that already dealt with the tap, has
 * called preventDefault() by then and is left alone.
 */
function onDocumentClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(el instanceof HTMLAnchorElement)) return;

  const action = anchorAction(
    el.href,
    el.getAttribute("target"),
    el.getAttribute("download"),
    window.location.origin,
  );
  if (action.kind === "ignore") return;
  e.preventDefault();

  if (action.kind === "in-place") {
    window.location.assign(action.href);
  } else if (action.kind === "browser") {
    void openInBrowser(action.href);
  } else {
    // downloadFile hands the file to the share sheet in the app, and toasts
    // this line when it can't.
    const failure = /\.ics$/i.test(action.filename)
      ? "Couldn't add that to your calendar."
      : "Couldn't download that file.";
    void downloadFile(action.href, action.filename, { failure });
  }
}

/** Android's back button: the page's own history first, then out of the app. */
function onBackButton(event: { canGoBack?: boolean } | undefined): void {
  if (!window.dispatchEvent(new Event(NATIVE_BACK_EVENT, { cancelable: true }))) return;
  if (event?.canGoBack) window.history.back();
  else exitApp();
}

/**
 * The web half of the App Store and Google Play apps (plan.md §6 S2B).
 * Mounted once in the root layout; renders nothing, and does nothing at all
 * in a browser, including an installed Home Screen app.
 *
 * In the app it marks `<html>` for the cream background, sets dark status-bar
 * text, opens links the phone hands over (Universal Links and App Links once
 * they exist), keeps new-window links inside the app, sends downloads to the
 * share sheet, and gives Android's back button the page's history.
 *
 * The shell clears its plugin listeners whenever a page starts loading, and
 * every full page load mounts this again, so each page registers its own.
 */
export function NativeBridge(): null {
  useEffect(() => {
    const shell = appShellOnClient();
    if (shell === null) return;
    const android = shell === "android-app";

    const root = document.documentElement;
    root.classList.add(APP_CLASS);
    styleStatusBarForCream(android);

    const stopLinks = listenNative<{ url?: string }>("App", "appUrlOpen", (e) =>
      openFromNative(e?.url),
    );
    // Not tied to this effect's lifetime: the launch link is claimed once, so
    // if a development re-mount cleaned up before it arrived, nothing else
    // would ever open it. openFromNative is safe to call late.
    if (claimLaunchUrl()) {
      nativeLaunchUrl()
        .then(openFromNative)
        .catch(() => {});
    }

    // iPhones have no back button; swipe-back is the shell's (S3B).
    const stopBack = android
      ? listenNative<{ canGoBack?: boolean }>("App", "backButton", onBackButton)
      : () => {};

    document.addEventListener("click", onDocumentClick);

    return () => {
      document.removeEventListener("click", onDocumentClick);
      stopBack();
      stopLinks();
      root.classList.remove(APP_CLASS);
    };
  }, []);

  return null;
}
