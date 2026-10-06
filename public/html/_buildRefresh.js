// ══════════════════════════════════════════════════════════════════════════
// Vibe: "is a newer build live?" for the static desktop profile
//
// The React pages keep an open tab on the newest build with <BuildRefresh />
// in the root layout (src/components/build/BuildRefresh.tsx; the rules are in
// src/lib/build/build-refresh.ts). profile.html is the one page that helper
// cannot reach: /profile hops to it and it takes over the whole tab, with no
// React in it. This is the helper's twin for that page, with the same rules:
// ask GET /api/version when the person comes back to the tab, at most once
// every two minutes with the page load counting as the first, and reload
// only when another build is live and nobody is in the middle of something.
//
// A static file cannot have a build id written into it. The React page that
// hopped here left its own in sessionStorage (`vibe_build_loaded`), and that
// is "my build". Nothing there (local dev, storage blocked, the store apps):
// this file does nothing at all, not even a request.
//
// Stricter than the React helper where this page is harder to read: edit
// mode always holds the reload, and so does anything drawn over the page
// (none of this page's popups say they are dialogs, so any fixed layer that
// is not the page's own furniture counts as one).
//
// Keep the constants and the rules in step with build-refresh.ts
// (src/lib/build/static-build-refresh.test.ts runs this file and checks).
// ══════════════════════════════════════════════════════════════════════════

(function vibeBuildRefresh() {
  if (window.__vibeBuildRefresh) return; // idempotent: a page that loads this twice
  window.__vibeBuildRefresh = true;

  // Inside a React page's frame, that page's helper reads this one too.
  try {
    if (window.top !== window.self) return;
  } catch {
    return;
  }

  const VERSION_PATH = "/api/version";
  const ASK_EVERY_MS = 2 * 60 * 1000;
  const ANSWER_WITHIN_MS = 1500;
  const LOADED_BUILD_KEY = "vibe_build_loaded";
  const RELOADED_FOR_KEY = "vibe_build_reloaded_for";

  // Always on this page and not a popup: the top bar, Otto's corner button,
  // the "back to your profile" banner. Any other fixed layer holds the
  // reload, so a new one that is missing here only ever delays it.
  const FURNITURE = "nav, #ottoCorner, #viewerBackBanner";
  // What says it is open or busy. `.vibe-more-menu` is this page's "..." menu,
  // the one popup here that is not a fixed layer.
  const MARKED = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"], dialog[open], [data-holds-reload]:not([data-holds-reload="false"]), [aria-busy="true"], .vibe-more-menu';
  const LOCAL_PREVIEWS = '[src^="blob:"], [poster^="blob:"], [style*="blob:"]';
  const NO_TEXT = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];

  function cleanBuildId(value) {
    if (typeof value !== "string") return "";
    const id = value.trim();
    if (id.length === 0 || id.length > 128) return "";
    return /^[\x21-\x7e]+$/.test(id) ? id : "";
  }

  // Merely touching sessionStorage throws where storage is blocked.
  function stored(key) {
    try {
      return cleanBuildId(window.sessionStorage.getItem(key));
    } catch {
      return "";
    }
  }

  const mine = stored(LOADED_BUILD_KEY);
  if (!mine) return;

  let checkedAt = Date.now(); // the page load counts as an ask
  let leaving = false;
  let gestures = 0;
  let picking = null; // the file input whose picker or camera is open over the page
  const changed = []; // { el, before }: what the person typed in or changed

  function isTextField(el) {
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && NO_TEXT.indexOf(el.type) === -1;
  }

  function textOf(el) {
    return isTextField(el) ? el.value : el.textContent || "";
  }

  // Only the person's own typing and choosing (`isTrusted`). Text is noted
  // with what the field held before (`beforeinput` comes first). A pick-list
  // or a checkbox has no such moment, so any change to one counts until the
  // next page load.
  function onChange(event) {
    const el = event.target;
    if (!event.isTrusted || !el || el.nodeType !== 1) return;
    if (changed.some((c) => c.el === el)) return;
    if (isTextField(el) || el.isContentEditable) {
      if (event.type !== "change") changed.push({ el, before: event.type === "beforeinput" ? textOf(el) : "" });
    } else if (event.type !== "beforeinput" && (el.tagName === "SELECT" || el.tagName === "INPUT")) {
      changed.push({ el, before: null });
    }
  }

  // A pressed file input opens the device's file picker or camera, and until
  // it answers nothing on the page gives it away. Heard trusted or not: the
  // "+ Photo" buttons open their hidden input with `input.click()`. It ends
  // when that input says `change` or `cancel`.
  function onPicker(event) {
    const el = event.target;
    if (!el || el.nodeType !== 1) return;
    if (event.type !== "click") {
      if (el === picking) picking = null;
    } else if (el.tagName === "INPUT" && el.type === "file") {
      picking = el;
    }
  }

  function onGesture(event) {
    if (!event.isTrusted) return;
    gestures += 1;
    // A tap or a key press: the person is back on the page, so no picker is
    // open (how it ends in a browser too old to send `cancel`).
    if (event.type !== "wheel" && event.type !== "scroll") picking = null;
  }

  // Really on screen: drawn, not hidden or see-through, inside the window.
  function shown(el) {
    if (el.getClientRects().length === 0) return false;
    if (typeof el.checkVisibility === "function" &&
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return true;
    return box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
  }

  function anyShown(selector) {
    return Array.from(document.querySelectorAll(selector)).some(shown);
  }

  // A popup: a fixed layer that can be clicked and is not page furniture.
  // The custom cursor and a fading toast take no clicks and do not count.
  function popupShowing() {
    return Array.from(document.querySelectorAll("body *")).some((el) => {
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed" || style.pointerEvents === "none") return false;
      return !el.matches(FURNITURE) && shown(el);
    });
  }

  // Nobody is in the middle of something. When in doubt the answer is no:
  // a wrong no only delays a reload, a wrong yes could cost someone their work.
  function idle() {
    if (!document.body || document.body.classList.contains("edit-mode")) return false;
    if (picking) return false; // a file is on its way
    const active = document.activeElement;
    if (active && (isTextField(active) || active.isContentEditable) && textOf(active).trim() !== "") return false;
    if (changed.some((c) => c.el.isConnected && (c.before === null || textOf(c.el).trim() !== c.before.trim()))) return false;
    if (Array.from(document.querySelectorAll('input[type="file"]')).some((el) => el.files && el.files.length > 0)) return false;
    if (Array.from(document.querySelectorAll("video, audio")).some((el) => !el.paused && !el.ended)) return false;
    if (anyShown(LOCAL_PREVIEWS) || anyShown(MARKED)) return false;
    return !popupShowing();
  }

  // The build the site is serving now, or "". No cookie and no Referer go
  // with it; an answer slower than ANSWER_WITHIN_MS is dropped.
  function askLiveBuild() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ANSWER_WITHIN_MS);
    return fetch(VERSION_PATH, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: abort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => cleanBuildId(body && body.build))
      .catch(() => "")
      .then((live) => {
        clearTimeout(timer);
        return live;
      });
  }

  function onAnswer(live, gesturesAtAsk) {
    if (leaving || !live || live === mine || live === stored(RELOADED_FOR_KEY)) return;
    // Left again, or already tapping and scrolling, while the answer came.
    if (document.visibilityState !== "visible" || gestures !== gesturesAtAsk) return;
    if (!idle()) return;
    // The loop guard, written BEFORE the reload. No guard, no reload.
    try {
      window.sessionStorage.setItem(RELOADED_FOR_KEY, live);
      if (window.sessionStorage.getItem(RELOADED_FOR_KEY) !== live) return;
    } catch {
      return;
    }
    leaving = true;
    // The address bar shows /profile by now, so this goes back through the
    // React page, which leaves the new build's id for the next load of this one.
    window.location.reload();
  }

  function onReturn() {
    if (leaving || document.visibilityState !== "visible" || navigator.onLine === false) return;
    const now = Date.now();
    const since = now - checkedAt;
    if (since >= 0 && since < ASK_EVERY_MS) return; // a clock set backwards asks
    checkedAt = now;
    const gesturesAtAsk = gestures;
    askLiveBuild().then((live) => onAnswer(live, gesturesAtAsk)).catch(() => {});
  }

  const quietly = { capture: true, passive: true };
  ["beforeinput", "input", "change"].forEach((type) => document.addEventListener(type, onChange, true));
  ["click", "change", "cancel"].forEach((type) => document.addEventListener(type, onPicker, true));
  ["pointerdown", "touchstart", "keydown", "wheel"].forEach((type) => document.addEventListener(type, onGesture, quietly));
  document.addEventListener("scroll", onGesture); // the page's own scroll only
  document.addEventListener("visibilitychange", onReturn);
  // Back from the back-forward cache, old code and all.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) onReturn();
  });
})();
