// ══════════════════════════════════════════════════════════════════════════
// Vibe — service worker registration for the static desktop pages
//
// profile.html, messages.html and onboarding.html are hand-written pages, so
// the React root layout's <ServiceWorkerRegistrar /> never runs in them.
// profile.html is a top-level page of its own; the other two sit inside a
// React page's iframe. This is the registrar's twin for them. It registers the
// same /sw.js with exactly the same options, because a different scope or
// updateViaCache counts as a new registration and would re-register the
// worker every time a student moved between a React page and a static one.
//
// Production only. Static pages have no build env, so there is no
// NEXT_PUBLIC_SW_DEV switch here: localhost and preview deploys never
// register from these pages. Local testing of the worker goes through the
// React pages instead.
//
// Nothing here may throw or leave a rejected promise behind. Sentry records
// unhandled rejections, update() rejects whenever the laptop is offline, and
// register() rejects in private windows and some embedded browsers.
// ══════════════════════════════════════════════════════════════════════════

(function vibeServiceWorkerInit() {
  // The kill switch. The drill in scripts/pwa/sw-killswitch.js flips this to
  // true in the same commit that copies the killswitch over public/sw.js,
  // after NEXT_PUBLIC_SW_KILL=1 is set in Vercel. Without it these pages would
  // register the worker again on every load, and the drill could never reach
  // zero registrations.
  const SW_KILL = false;

  if (window.__vibeSwInit) return; // idempotent — a page that loads this twice
  window.__vibeSwInit = true;

  // Some embedded or sandboxed frames throw on merely reading the property.
  let sw = null;
  try {
    if ("serviceWorker" in navigator) sw = navigator.serviceWorker;
  } catch {}
  if (!sw) return;

  // Promise.resolve().then(fn) turns a synchronous throw (or an older
  // browser's non-promise return) into something the .catch below swallows.
  function quietly(fn) {
    return Promise.resolve().then(fn).catch(() => {});
  }

  // Same as the React kill branch: on every hostname, drop every registration
  // and every cache. Only the worker's offline page lives in CacheStorage, so
  // there is nothing of the student's to lose.
  if (SW_KILL) {
    quietly(() => sw.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => quietly(() => reg.unregister())))));
    if ("caches" in window) {
      quietly(() => caches.keys().then((keys) =>
        Promise.all(keys.map((key) => quietly(() => caches.delete(key))))));
    }
    return;
  }

  // Never inside Vibe's App Store / Google Play app, the same rule as the
  // React registrar. src/lib/native/detect.ts has both signals; keep this
  // regex in step with its APP_UA, since a static page can't import it.
  // The Android app shows the desktop pages, and so these iframes, whenever
  // the screen is 900px wide or more, and its web view does run service
  // workers: the worker would take offline over from the app's own offline
  // page. So drop any registration an earlier build left and stop. No
  // optional chaining: one syntax error would stop this whole file in an
  // older browser.
  let inApp = false;
  try {
    const cap = window.Capacitor;
    inApp =
      /VibeApp\/\d+\s*\((ios|android)\)/.test(navigator.userAgent) ||
      Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform() === true);
  } catch {}
  if (inApp) {
    quietly(() => sw.getRegistrations().then((regs) =>
      Promise.all(regs.map((reg) => quietly(() => reg.unregister())))));
    return;
  }

  if (location.hostname !== "www.connectvibe.app") return;

  const HOUR_MS = 60 * 60 * 1000;
  let registration = null;
  let lastCheck = 0;

  function register() {
    quietly(() => sw.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        // The navigation that loaded this page already asked the browser to
        // look for a newer sw.js, so the hour starts now.
        lastCheck = Date.now();
      }));
  }

  // After load, so the worker's install never competes with the page's own
  // scripts, fonts and first API calls.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  // A desktop tab can stay open for days. When the student comes back to it,
  // look for a new worker at most once an hour. (Inside the React pages'
  // iframes the parent's registrar does this too; the extra check is one
  // small uncached request.)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !registration) return;
    if (Date.now() - lastCheck < HOUR_MS) return;
    lastCheck = Date.now();
    quietly(() => registration.update());
  });
})();
