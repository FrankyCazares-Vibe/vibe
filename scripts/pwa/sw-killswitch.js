/* Vibe service worker KILL SWITCH.
 *
 * Not served from here. It only goes live when it is copied over
 * public/sw.js, which it replaces completely. Use it when a shipped worker is
 * hurting students (blank page loads, a stuck offline page, wrong
 * notifications) and every browser needs to be back to "no service worker".
 *
 * It lives in scripts/ because it has to be committed: every clone and every
 * cofounder's machine needs it on the day it's needed. Not docs/: on a Mac
 * that is the same folder as the private, gitignored DOCS/, so git would
 * quietly leave it out.
 *
 * THE DRILL (one deploy):
 *   1. Vercel → Settings → Environment Variables → Production:
 *      NEXT_PUBLIC_SW_KILL=1. It is inlined at build time, so set it BEFORE
 *      pushing step 2 (.env* files are gitignored; it can't ride in the commit).
 *   2. One commit with two changes:
 *        cp scripts/pwa/sw-killswitch.js public/sw.js
 *        public/html/_sw.js: flip `const SW_KILL = false;` to `true`
 *   3. Push and wait for the deploy.
 *
 * WHAT HAPPENS. On any Vibe page load the browser re-checks /sw.js. That
 * check bypasses the old worker's fetch handler and the HTTP cache, so even a
 * worker that breaks every page gets replaced. The new bytes install, skip
 * waiting and activate. Activation deletes every cache, unregisters, and
 * reloads the windows the old worker controlled so they load straight from
 * the network. After that the React registrar (NEXT_PUBLIC_SW_KILL) and
 * public/html/_sw.js (SW_KILL) unregister leftovers instead of registering
 * again. Without both flags every page load would re-register /sw.js, and
 * this file would install and remove itself over and over.
 * A phone that never opens Vibe keeps the old worker until it does (or until
 * a push arrives more than 24 hours after its last check).
 *
 * CHECK in DevTools on www.connectvibe.app after two reloads:
 *   (await navigator.serviceWorker.getRegistrations()).length === 0
 *   (await caches.keys()).length === 0
 *
 * UNDO once the fix is ready, in the same order: delete NEXT_PUBLIC_SW_KILL
 * in Vercel first (or the next build still inlines it), then push one commit
 * that restores the real public/sw.js with a NEW, higher SW_VERSION and flips
 * SW_KILL back to false. Unregistering also ended every push subscription,
 * so students turn notifications on again.
 *
 * Keep it this small. No fetch handler: every request goes straight to the
 * network. No push handler: a leftover push does nothing.
 */

// Unused on purpose. Once copied, this IS public/sw.js, and that file always
// carries a SW_VERSION line (sw.js's rule 1; checks may look for it).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
const SW_VERSION = "kill-switch";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Deleting the caches and unregistering are the real work; the reload
      // below is a bonus, so every step swallows its own failure.
      const names = await caches.keys().catch(() => []);
      await Promise.all(names.map((name) => caches.delete(name).catch(() => false)));
      await self.registration.unregister().catch(() => false);

      // Without includeUncontrolled: only windows the old worker controlled
      // are reloaded. A page that registers this file afresh (a flag was
      // missed) isn't controlled, so it can never be caught in a reload loop.
      // navigate() rejects for anything else, and Safari's support for it is
      // unconfirmed, hence one catch per window.
      const windows = await self.clients.matchAll({ type: "window" }).catch(() => []);
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)));
    })(),
  );
});
