// ══════════════════════════════════════════════════════════════════════════
// Vibe: "Vibe is open on my screen" for the static desktop profile
//
// The React pages check in with <ActivityTouch /> in the root layout
// (src/components/usage/ActivityTouch.tsx; the rules are in
// src/lib/usage/touch.ts). profile.html takes over the whole tab with no
// React in it, so this is that helper's twin, with the same rules: while
// signed in and on screen, POST /api/me/heartbeat at most once every four
// minutes per tab, trying on load, on coming back to the tab, and every 30 s.
// It feeds "active now" and the founders' day and week totals.
//
// What a check-in says: one word for the device kind, worked out here from
// the screen alone ("phone", "desktop" or "installed"), and "otto" when Otto
// has just been opened. Never the browser's name or details. Signed out,
// nothing leaves: only the sign-in cookie's NAME is looked at.
//
// `window.__vibeCountOpen('otto')` is always defined, inside a frame too
// (messages.html shows inside the React Messages page): _otto.js calls it
// when its panel opens on Otto. One open per feature per tab every ten
// minutes. The gaps live in sessionStorage, which a same-origin frame shares
// with its tab and the React pages share too (the same keys), so a tab's
// gaps are one set wherever it is. Inside a frame there is no check-in of
// its own: the page around it checks in for the tab.
//
// Keep the constants and the rules in step with touch.ts
// (src/lib/usage/static-usage-touch.test.ts runs this file and checks).
// ══════════════════════════════════════════════════════════════════════════

(function vibeUsageTouch() {
  if (window.__vibeUsageTouch) return; // idempotent: a page that loads this twice
  window.__vibeUsageTouch = true;

  const TOUCH_PATH = "/api/me/heartbeat";
  const TOUCH_EVERY_MS = 4 * 60 * 1000;
  const TOUCH_TICK_MS = 30 * 1000;
  const OPEN_EVERY_MS = 10 * 60 * 1000;
  const TOUCH_AT_KEY = "vibe_touch_at";
  const OPEN_AT_KEY_PREFIX = "vibe_open_at_";
  const PHONE_QUERY = "(max-width: 899px)";
  const COARSE_QUERY = "(pointer: coarse)";
  const OPENS = ["otto", "map"];
  // `sb-<project>-auth-token` or its `.0` / `.1` chunks (src/lib/tally/open.ts).
  const SIGN_IN_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

  const memory = {}; // stands in for sessionStorage where touching it throws
  let inFlight = null;

  function stamp(raw) {
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) && at > 0 ? at : null;
  }

  // The later of what storage and memory hold, or null for neither.
  function readAt(key) {
    let stored = null;
    try {
      stored = stamp(window.sessionStorage.getItem(key));
    } catch {
      stored = null;
    }
    const kept = typeof memory[key] === "number" ? memory[key] : null;
    if (stored === null) return kept;
    return kept === null ? stored : Math.max(stored, kept);
  }

  function writeAt(key, at) {
    memory[key] = at;
    try {
      window.sessionStorage.setItem(key, String(at));
    } catch {
      /* blocked or full: the note in memory holds the gap for this page */
    }
  }

  // None on record, the gap has passed, or the clock was set back.
  function due(now, last, every) {
    if (last === null) return true;
    if (now < last) return true;
    return now - last >= every;
  }

  function signedIn() {
    try {
      return String(document.cookie || "").split(";").some((part) => {
        const eq = part.indexOf("=");
        return SIGN_IN_COOKIE.test((eq < 0 ? part : part.slice(0, eq)).trim());
      });
    } catch {
      return false;
    }
  }

  function onScreen() {
    return document.visibilityState === "visible";
  }

  function matches(query) {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  }

  // The installed app: isStandalone in src/lib/pwa/display-mode.ts. iOS
  // reports a Home Screen app as fullscreen, which only counts where
  // `navigator.standalone` is a boolean (iPhone and iPad).
  function standalone() {
    const flag = navigator.standalone;
    if (flag === true) return true;
    if (matches("(display-mode: standalone)")) return true;
    return matches("(display-mode: fullscreen)") && typeof flag === "boolean";
  }

  // deviceClass in touch.ts: the screen alone.
  function device() {
    if (standalone()) return "installed";
    return matches(COARSE_QUERY) && matches(PHONE_QUERY) ? "phone" : "desktop";
  }

  // Never throws, never rejects: a missed check-in is retried by the next one.
  function send(body) {
    return fetch(TOUCH_PATH, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body,
    }).then(() => undefined, () => undefined);
  }

  function track(request) {
    const mine = request.then(() => {
      if (inFlight === mine) inFlight = null;
    });
    inFlight = mine;
  }

  function touch() {
    if (inFlight || !onScreen() || !signedIn()) return;
    const now = Date.now();
    if (!due(now, readAt(TOUCH_AT_KEY), TOUCH_EVERY_MS)) return;
    writeAt(TOUCH_AT_KEY, now); // stamped before the request leaves
    track(send(JSON.stringify({ device: device() })));
  }

  // An open of Otto or the map; it checks in as well.
  window.__vibeCountOpen = function (what) {
    if (OPENS.indexOf(what) === -1 || !onScreen() || !signedIn()) return;
    const key = OPEN_AT_KEY_PREFIX + what;
    const now = Date.now();
    if (!due(now, readAt(key), OPEN_EVERY_MS)) return;
    writeAt(key, now);
    writeAt(TOUCH_AT_KEY, now);
    const request = send(JSON.stringify({ device: device(), open: what }));
    if (!inFlight) track(request);
  };

  // Inside a frame, the page around it checks in for the tab.
  try {
    if (window.top !== window.self) return;
  } catch {
    return;
  }

  touch();
  document.addEventListener("visibilitychange", touch);
  // Back from the back-forward cache. An ordinary load is the call above.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) touch();
  });
  setInterval(touch, TOUCH_TICK_MS);
})();
