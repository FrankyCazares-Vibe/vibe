/* Vibe service worker, served at /sw.js with scope "/".
 *
 * Small on purpose. Every student's feed, profile and messages are personal,
 * so this worker never keeps copies of any of it. The rules:
 *
 * 1. Bump SW_VERSION on EVERY edit to this file or to public/offline.html.
 *    Browsers only install a new worker when these bytes change, and the
 *    cached offline page only refreshes when a new worker installs.
 * 2. The URL is permanent. A browser holding the old worker keeps checking
 *    the old URL; if that 404s, it keeps the old worker forever. Both
 *    registrars (ServiceWorkerRegistrar.tsx, public/html/_sw.js) pass exactly
 *    { scope: "/", updateViaCache: "none" }; other options re-register.
 * 3. It caches ONE file, /offline.html. A cached page would skip the proxy's
 *    session refresh, login bounce and suspension gate, show one student's
 *    data to the next person on a shared phone, and pin an installed app to
 *    an old build.
 * 4. Only same-origin GET navigations outside /api/ are handled, and only so
 *    a failed load shows the offline page. Everything else (API calls,
 *    assets, Supabase, R2, fonts, Sentry, every POST) gets no respondWith,
 *    so the browser handles it as if this worker weren't here.
 * 5. Kill switch: scripts/pwa/sw-killswitch.js replaces this file, deletes
 *    every cache and unregisters itself. Its header has the drill.
 */

const SW_VERSION = "2026-09-24-3";

const OFFLINE_URL = "/offline.html";
const OFFLINE_CACHE = "vibe-offline-" + SW_VERSION;
const FALLBACK_URL = "/campus";
const DEFAULT_TITLE = "Vibe";
const DEFAULT_BODY = "You have new activity";

// ── Lifecycle ────────────────────────────────────────────────────────────────
// skipWaiting + claim is safe because nothing but the offline page is cached:
// an old tab can't be handed an answer the new worker disagrees with.

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([self.skipWaiting(), precacheOfflinePage()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await deleteCachesExceptOffline();
      await self.clients.claim();
    })(),
  );
});

// A failed precache must never fail the install (a worker that can't install
// can't be replaced by a fix either); offlineResponse() then uses the inline
// page. A redirected answer is refused: browsers won't use one for a
// navigation, and a restricted account's redirect would store the notice.
async function precacheOfflinePage() {
  try {
    const res = await fetch(OFFLINE_URL, { cache: "reload", redirect: "error" });
    if (!res.ok || res.redirected || res.type !== "basic") return;
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.put(OFFLINE_URL, res);
  } catch {
    // Offline during install; the inline page covers it.
  }
}

async function deleteCachesExceptOffline() {
  const names = await caches.keys().catch(() => []);
  await Promise.all(
    names
      .filter((name) => name !== OFFLINE_CACHE)
      .map((name) => caches.delete(name).catch(() => false)),
  );
}

// ── Fetch: the network for page loads, the offline page only if it fails ────

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // .ics downloads and résumé PDFs arrive as navigations; an offline page
    // for a download means nothing, so the browser takes them. It already
    // started a navigation preload for this request, and waiting on it
    // (ignoring the result) stops Chrome warning that it was cancelled.
    // The browser may then fetch the address again itself, so the server can
    // see these GETs twice; both are reads, so that costs time, not safety.
    event.waitUntil(Promise.resolve(event.preloadResponse).catch(() => {}));
    return;
  }
  event.respondWith(handleNavigation(event));
});

// Never rejects: respondWith(rejected) is a network error, a blank page.
async function handleNavigation(event) {
  let preloaded;
  try {
    // A Promise wherever preload exists, but it resolves undefined when
    // preload wasn't on for this fetch (enable() not run yet, or it failed).
    preloaded = await event.preloadResponse;
  } catch {
    // A failed preload still gets a real network try below.
  }
  if (preloaded) return preloaded;
  try {
    return await fetch(event.request);
  } catch {
    return offlineResponse();
  }
}

async function offlineResponse() {
  const cached = await caches
    .match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
    .catch(() => undefined);
  return cached || inlineOfflineResponse();
}

// Only when the precache failed. Same promise as the real page: neutral
// words and no names (it shows to whoever holds the phone), and it reloads.
function inlineOfflineResponse() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vibe · Offline</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;
background:#FAF7F2;color:#1C1C1E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<main style="padding:24px"><h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px">You're offline</h1>
<p style="color:#5C5853;margin:0 0 20px">Vibe will reload when you're back.</p>
<button type="button" onclick="location.reload()" style="font:inherit;font-weight:700;padding:10px 18px;
border:0;border-radius:999px;background:#FF5C35;color:#FAF7F2">Try again</button></main>
<script>addEventListener("online", function () { location.reload(); });</script></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ── Push ─────────────────────────────────────────────────────────────────────
// Payload (plan R13): {"web_push":8030,"notification":{"title","body",
// "navigate","tag","app_badge"},"app_badge":N,"mutable":false}. iOS 18.4+
// shows that itself and never runs this handler; Chrome, Firefox, Edge and
// iOS 16.4–18.3 do. Every push shows something: a silent one gets the
// permission revoked. Unreadable data (DevTools' plain-text test push
// included) shows the default title and body.

self.addEventListener("push", (event) => {
  const payload = readPayload(event.data);
  const n = isObject(payload && payload.notification) ? payload.notification : {};
  const title = nonEmptyString(n.title);
  const body = typeof n.body === "string" ? n.body : null;
  const url = sameOriginUrl(n.navigate);
  const tag = nonEmptyString(n.tag);
  const options = {
    body: body !== null ? body : title ? "" : DEFAULT_BODY,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-mono-96.png",
    data: { url: url || FALLBACK_URL },
  };
  // The same tag replaces the earlier notification quietly (no renotify),
  // so 40 likes on one post buzz once.
  if (tag) options.tag = tag;
  // Safari may open `navigate` itself and skip notificationclick, so it only
  // ever carries an address already checked to be ours.
  if (url) options.navigate = url;

  const badge = payload ? readBadge(payload.app_badge, n.app_badge) : null;
  event.waitUntil(
    Promise.all([
      self.registration
        .showNotification(title || DEFAULT_TITLE, options)
        // If a browser refuses these options, the plain default still counts
        // as showing something; a push that shows nothing is a silent one.
        .catch(() =>
          self.registration.showNotification(DEFAULT_TITLE, {
            body: DEFAULT_BODY,
            data: { url: FALLBACK_URL },
          }),
        ),
      badge === null ? null : setBadge(badge),
    ]),
  );
});

function readPayload(data) {
  try {
    const parsed = data ? data.json() : null;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Top level first (iOS 26+ reads it there), then inside `notification`
// (iOS 18.4–18.x). A whole number or a numeric string; anything else is null.
function readBadge(...candidates) {
  for (const value of candidates) {
    const count = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (Number.isInteger(count) && count >= 0) return count;
  }
  return null;
}

// Optional everywhere (Android draws its own dot), so it never fails the
// push. setAppBadge(0) clears the badge.
async function setBadge(count) {
  try {
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
  } catch {
    // Not permitted here.
  }
}

// ── Notification tap ─────────────────────────────────────────────────────────
// The address is trusted only when it's on this origin; anything else would
// make a tampered payload an open redirect out of the installed app.

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  notification.close();
  const data = isObject(notification.data) ? notification.data : {};
  const url =
    sameOriginUrl(data.url) ||
    sameOriginUrl(notification.navigate) ||
    sameOriginUrl(FALLBACK_URL);
  event.waitUntil(openInApp(url));
});

async function openInApp(url) {
  // A window already showing this address only needs bringing forward, so
  // any top-level window counts here, controlled by this worker or not.
  const every = await topLevelWindows(true);
  const already = every.find((client) => client.url === url);
  if (already) return already.focus().catch(() => {});

  // Chromium lets one tap do ONE window action: focus() and openWindow() each
  // use it up. So a window is focused only when it can then be moved to the
  // address, and navigate() rejects for a window this worker doesn't control
  // (a hard-reloaded tab, a page opened before the worker first installed).
  // With no controlled window, a new one opens while the tap is still unspent.
  const [client] = await topLevelWindows(false); // most recently focused first
  if (client) {
    try {
      await client.focus(); // first, while the tap still counts as a gesture
      // Resolves null when the window ends up somewhere it can't see.
      if (await client.navigate(url)) return;
    } catch {
      // Fall through to a new window.
    }
  }
  // Chromium refuses this after the focus() above; it's there for engines
  // that allow both, and for the no-window case, where nothing was spent.
  await self.clients.openWindow(url).catch(() => null);
}

// Nested frames are clients too. The desktop /messages page iframes
// /html/messages.html, and navigating that frame would load the whole app
// inside it, so only top-level windows qualify.
async function topLevelWindows(includeUncontrolled) {
  const all = await self.clients
    .matchAll({ type: "window", includeUncontrolled })
    .catch(() => []);
  return all.filter((client) => client.frameType === "top-level");
}

// ── Messages from the page ───────────────────────────────────────────────────
// SIGNED_OUT comes from leaveDeviceClean (wave 3). Nothing personal is cached,
// so this is a precaution.

self.addEventListener("message", (event) => {
  if (isObject(event.data) && event.data.type === "SIGNED_OUT") {
    event.waitUntil(deleteCachesExceptOffline());
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// Absolute or relative in; an absolute same-origin href out, or null.
function sameOriginUrl(value) {
  if (typeof value !== "string" || value === "") return null;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.href : null;
  } catch {
    return null;
  }
}
