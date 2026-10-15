// The in-page half of the virtual-time recorder. capture.mjs installs pageShim() as an init script
// (it runs before any page script, on every document).
//
// WHY IT EXISTS (measured on Chromium 145): Emulation.setVirtualTimePolicy moves performance.now(),
// Date.now() and timers, but NOT the compositor's frame clock. So under virtual time alone
//   - requestAnimationFrame still fires at the real 60 Hz and hands callbacks a REAL timestamp,
//   - CSS animations / transitions / element.animate() still run on the REAL clock,
//   - native smooth scrolls (scrollTo({behavior:"smooth"}), scrollIntoView) still run on the REAL clock.
// The shim puts those three on the virtual clock:
//   1. requestAnimationFrame becomes a queue that Node flushes exactly once per captured frame,
//      with performance.now() (virtual) as the timestamp.
//   2. The document timeline is frozen from Node (CDP Animation.setPlaybackRate 0) and every running
//      animation is seeked forward by one frame per step.
//   3. Smooth scrolls are replaced by a requestAnimationFrame scroll with Chromium's own curve
//      (ease-in-out, duration = min(sqrt(distance), 42) / 60 s).
export function pageShim() {
  if (window.__vt) return;
  const queue = new Map();
  let nextId = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { queue.set(++nextId, cb); return nextId; };
  // Heartbeat: keep the browser producing real frames, each with one pixel repainted. Without it
  // Page.captureScreenshot waits forever on a screen where nothing moves (measured: with no repaint the
  // first screenshot of a still feed never came back). The pixel is a pseudo-element from an adopted
  // stylesheet (no DOM node, nothing for React hydration to trip on), in the top-left corner. Its two
  // colours are both 1/255 opaque and round to the SAME picture: the repaint is real, the pixel does not
  // flicker, and two frames of a still screen are byte for byte equal (the prototype's pixel flipped by
  // one level at random, which made every still frame look "new" to the dead-frame check in moves.mjs).
  const beatSheet = new CSSStyleSheet();
  beatSheet.replaceSync('html::after{content:"";position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;z-index:2147483647;background:rgba(0,0,0,0.004)}');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, beatSheet];
  let beats = 0;
  const beat = () => { beatSheet.cssRules[0].style.background = ++beats % 2 ? "rgba(1,1,1,0.004)" : "rgba(0,0,0,0.004)"; nativeRaf(beat); };
  nativeRaf(beat);
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  // The landing page's sky starts its own clock (performance.now()) on the call that gets its canvas' 2d context,
  // after the page hydrates, and lights the lights on that clock. When that is depends on how the scripts arrived,
  // so storyboard.mjs starts the film from this mark instead of from the first paint.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    if (window.__vtSkyAt == null && this.classList.contains("vln-sky")) window.__vtSkyAt = performance.now();
    return getContext.apply(this, args);
  };

  const seen = new WeakMap(); // Animation -> { t: virtual ms when first seen, c: its currentTime then, last }
  const seek = (now) => {
    let n = 0;
    for (const a of document.getAnimations()) {
      if (a.playState !== "running" || a.timeline !== document.timeline) continue;
      const cur = a.currentTime;
      if (cur === null) continue;
      const st = seen.get(a);
      // New, or the page itself seeked it since our last write: start counting from here.
      if (!st || Math.abs(Number(cur) - st.last) > 0.01) { seen.set(a, { t: now, c: Number(cur), last: Number(cur) }); n++; continue; }
      try {
        a.currentTime = st.c + (now - st.t) * (a.playbackRate || 1);
        st.last = Number(a.currentTime);
        n++;
      } catch {}
    }
    return n;
  };

  const vt = (window.__vt = {
    fps: 60, // the film's frame rate (capture.mjs films at 60)
    frames: 0,
    rafCalls: 0,
    animations: 0,
    /** One video frame: run the queued animation-frame callbacks once, then move CSS/WAAPI animations. */
    frame() {
      const now = performance.now();
      const run = [...queue.values()];
      queue.clear(); // callbacks that re-queue themselves run on the NEXT frame, as in a browser
      for (const cb of run) { try { cb(now); } catch (e) { reportError(e); } }
      vt.rafCalls += run.length;
      vt.animations = seek(now);
      vt.frames++;
      return now;
    },
    pending: () => queue.size,
  });

  // ---- 3. smooth scrolling on the virtual clock ----
  const bez = (p1x, p1y, p2x, p2y) => (x) => {
    let lo = 0, hi = 1, t = x;
    const f = (a, b, s) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
    for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; f(p1x, p2x, t) < x ? (lo = t) : (hi = t); }
    return f(p1y, p2y, t);
  };
  const easeInOut = bez(0.42, 0, 0.58, 1);
  const running = new WeakMap();
  let moving = 0; // how many smooth scrolls are on their way
  vt.scrolling = () => moving;
  const native = {
    elScrollTo: Element.prototype.scrollTo, elScroll: Element.prototype.scroll, elScrollBy: Element.prototype.scrollBy,
    intoView: Element.prototype.scrollIntoView, winScrollTo: window.scrollTo, winScrollBy: window.scrollBy,
  };
  const root = () => document.scrollingElement || document.documentElement;
  const jump = (el, left, top) => native.elScrollTo.call(el, { left, top, behavior: "instant" });

  /** Animate el to (left, top). ms = null uses Chromium's distance rule. Resolves when it lands. */
  vt.scroll = (el, left, top, ms = null, ease = easeInOut) => new Promise((done) => {
    const fromL = el.scrollLeft, fromT = el.scrollTop;
    const toL = Math.max(0, Math.min(left ?? fromL, el.scrollWidth - el.clientWidth));
    const toT = Math.max(0, Math.min(top ?? fromT, el.scrollHeight - el.clientHeight));
    const dist = Math.max(Math.abs(toL - fromL), Math.abs(toT - fromT));
    if (dist < 1) { jump(el, toL, toT); return done(); }
    const dur = ms ?? (Math.min(Math.sqrt(dist), 42) / 60) * 1000;
    const token = {};
    running.set(el, token);
    moving++;
    const end = () => { moving--; done(); };
    // A snap container would pull every in-between position to a snap point: switch snapping off while it moves.
    const snap = el.style.scrollSnapType;
    el.style.scrollSnapType = "none";
    // Counted in frames, not read off the clock: one tick is one film frame, and performance.now() is rounded to
    // 0.1 ms with a little noise, which put a scroll one pixel off on a handful of frames from take to take.
    // Every position is a whole number of REAL pixels (a third of a CSS px at 3x), so nothing is drawn between
    // two pixels.
    const steps = Math.max(1, Math.round((dur * vt.fps) / 1000));
    const px = (v) => Math.round(v * devicePixelRatio) / devicePixelRatio;
    let k = 0;
    const tick = () => {
      if (running.get(el) !== token) return end();
      const u = Math.min(1, ++k / steps), e = ease(u);
      jump(el, px(fromL + (toL - fromL) * e), px(fromT + (toT - fromT) * e));
      if (u < 1) return requestAnimationFrame(tick);
      el.style.scrollSnapType = snap;
      running.delete(el);
      end();
    };
    requestAnimationFrame(tick);
  });
  vt.ease = { inOut: easeInOut, quad: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2) };

  const wantsSmooth = (el, o) => o && typeof o === "object" && (o.behavior === "smooth" || (o.behavior !== "instant" && getComputedStyle(el).scrollBehavior === "smooth"));
  const patch = (proto, key, nativeFn, by) => {
    proto[key] = function (...args) {
      const self = this == null ? window : this; // a bare scrollTo() in strict code has no `this`
      const el = self === window ? root() : self;
      const o = args[0];
      if (!wantsSmooth(el, o)) return nativeFn.apply(self, args);
      vt.scroll(el, o.left == null ? null : (by ? el.scrollLeft : 0) + o.left, o.top == null ? null : (by ? el.scrollTop : 0) + o.top);
    };
  };
  patch(Element.prototype, "scrollTo", native.elScrollTo, false);
  patch(Element.prototype, "scroll", native.elScroll, false);
  patch(Element.prototype, "scrollBy", native.elScrollBy, true);
  patch(window, "scrollTo", native.winScrollTo, false);
  patch(window, "scroll", native.winScrollTo, false);
  patch(window, "scrollBy", native.winScrollBy, true);
  Element.prototype.scrollIntoView = function (arg) {
    if (!(arg && typeof arg === "object" && arg.behavior === "smooth")) return native.intoView.call(this, arg);
    // Find where the browser would land (instant), put everything back, then animate there.
    const chain = [];
    for (let p = this.parentElement; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth) chain.push(p);
    const before = chain.map((p) => [p.scrollLeft, p.scrollTop]);
    native.intoView.call(this, { ...arg, behavior: "instant" });
    const after = chain.map((p) => [p.scrollLeft, p.scrollTop]);
    chain.forEach((p, i) => jump(p, before[i][0], before[i][1]));
    chain.forEach((p, i) => { if (after[i][0] !== before[i][0] || after[i][1] !== before[i][1]) vt.scroll(p, after[i][0], after[i][1]); });
  };
}

/**
 * The second init script: what the camera adds to the page. Off camera, Next's dev badge and error overlay.
 * On camera, a soft dot where a finger lands: __demoDot(x, y) puts it down, __demoLift() lets it fade,
 * __demoClear() takes every dot away at once (a hard cut must not carry a fading dot onto the next screen).
 *
 * DRESSING. Rules that exist ONLY in the film. Each one covers a flaw the app still has on a 390 px phone in
 * Night (or, for rules 1 and 6, numbers that undersell it); the app itself is not changed, so each is also a thing
 * to look at in the app (the README lists them). The app styles these elements inline and without class names, so
 * the rules go by structure. 1 to 5 and 7 to 9 are style rules; 6 changes text, so it is an observer.
 */
export function pageDot() {
  const night = "rgb(12,11,11)"; // the Night page colour
  const css = document.createElement("style");
  css.textContent = [
    "nextjs-portal{display:none!important}",
    // 1. Campus header: the count line under the campus name ("13 at IU Bloomington"; " · N active now" only from 5 up) is left out.
    //    On screen for nine seconds it told a new student the app is nearly empty. The name stays.
    "header.vibe-campus-banner>div:nth-of-type(2)>div:nth-child(2){display:none!important}",
    // 2. The chip row (Feed / Events / Orgs / Map) is see-through: post text slid behind the chips while the feed scrolled.
    `#otto-mobile-tour-tabs{background:${night}!important}`,
    // 3. The tab bar is 96% opaque: lines under it ghosted through the tab labels.
    `nav.vibe-mobile-tabbar{background:${night}!important}`,
    // 4. Orgs list: "Tower…" (the "Following" pill beside the name took its room; the list is already headed FOLLOWING)
    //    and "@sae · Invite only · 3 me…". The handle line is set a touch tighter and the button beside it a touch
    //    narrower, so SAE's fits on one line; a longer one (Tower Floor 3's) runs onto a second line.
    'a[href^="/orgs/"]>div:nth-child(2)>div:first-child>span:nth-child(3){display:none!important}',
    'a[href^="/orgs/"]>div:nth-child(2)>div:nth-child(2){white-space:normal!important;text-wrap:pretty;font-size:11.5px!important;letter-spacing:0!important}',
    'a[href^="/orgs/"]+div button{padding:0 10px!important}',
    // 5. The DM field's picture button is a light grey disc in Night: give it the colours of the idle Send button.
    'button[aria-label="Attach a photo or video"]{background:rgba(var(--scrim-rgb),.18)!important;border-color:transparent!important;color:#fff!important}',
    // 7. Messages home, the "Live now" room card: the red dot's halo was cut flat on its left and top (its line is
    //    overflow:hidden). The line fits its card, so letting it overflow changes nothing else.
    '[role="group"][aria-label^="Event rooms"]>a>span:first-child{overflow:visible!important}',
    // 8. Feed, the "today." strip: the second chip ("Cookout on the Lawn  Tue") ran off the screen edge. Only the
    //    first chip is shown; the strip's dotted line runs on to the edge as it does after the last chip.
    ".vibe-strip-track .vibe-strip-chip~.vibe-strip-chip{display:none!important}",
    // 9. The DM and the Lounge: the round "⋯" (Message actions) beside every bubble. Hidden, its room kept, so no
    //    bubble moves.
    'button[aria-label="Message actions"]{visibility:hidden!important}',
    ".demo-dot{position:fixed;z-index:2147483646;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;",
    "background:rgba(255,255,255,.24);border:1px solid rgba(255,255,255,.5);box-shadow:0 0 18px rgba(255,255,255,.16);",
    "animation:demo-dot-in .14s ease-out both}",
    ".demo-dot.up{animation:demo-dot-out .26s ease-out both}",
    "@keyframes demo-dot-in{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}",
    "@keyframes demo-dot-out{from{transform:scale(1);opacity:1}to{transform:scale(1.3);opacity:0}}",
  ].join("");
  const add = () => document.head && !css.isConnected && document.head.appendChild(css);
  document.addEventListener("DOMContentLoaded", add);
  add();
  // 6. The small counts that read as "nearly empty" (the marketing rule: no number that makes Vibe look bigger or
  //    smaller than it is) are left out, each with its own "·" so no separator dangles and nothing leaves a gap:
  //    - Orgs list: "@sae · Invite only · 3 members" -> "@sae · Invite only" (the handle and the join mode stay);
  //    - an org's page: "@sae · 6 followers · 3 members" -> "@sae";
  //    - event cards (Events, the Lounge's card): the "4 going" pill or line is hidden (its room kept), and
  //      "Interested · 1" -> "Interested" (the buttons stay);
  //    - a club room's header: "Your hat: Member · 7 members" -> "Your hat: Member".
  //    The app draws these again whenever it re-renders, so this is an observer; each change is made only when the
  //    text still holds a count, so its own changes do not set it off again. It runs before storyboard.mjs's
  //    observer (it is made first), so the Orgs list's line-break fix measures the line without its count.
  const counts = () => {
    for (const line of document.querySelectorAll('a[href^="/orgs/"]>div:nth-child(2)>div:nth-child(2)')) {
      for (const n of line.childNodes) if (n.nodeType === 3 && /(\s|\n)·?\s*\d+ members?$/.test(n.data) && n.data.startsWith("@")) n.data = n.data.replace(/(?: · |\n)\d+ members?$/, "");
    }
    for (const el of document.querySelectorAll("span,div,button")) {
      if (el.children.length !== 0) continue;
      const t = el.textContent;
      if (/^\d+ going$/.test(t.trim())) { if (el.style.visibility !== "hidden") el.style.visibility = "hidden"; continue; }
      if (/^ · \d+ members?$/.test(t)) { if (el.style.display !== "none") el.style.display = "none"; continue; }
      if (el.tagName === "BUTTON" && /^(Interested|Going|Maybe) · \d+$/.test(t.trim())) {
        const word = t.trim().split(" · ")[0];
        const texts = [...el.childNodes].filter((n) => n.nodeType === 3);
        texts.forEach((n, i) => { n.data = i === 0 ? word : ""; });
        continue;
      }
      // An org's page: <span>·</span><span>6 followers</span> inside one wrapper; the wrapper goes, its dot with it.
      if (el.tagName === "SPAN" && /^\d+ (followers?|members?)$/.test(t.trim())) {
        const wrap = el.parentElement;
        if (wrap && wrap.children.length === 2 && wrap.children[0].textContent.trim() === "·" && wrap.style.display !== "none") wrap.style.display = "none";
      }
    }
  };
  new MutationObserver(counts).observe(document, { childList: true, subtree: true, characterData: true });
  window.__demoCounts = counts;
  window.__demoDot = (x, y) => {
    add();
    const d = document.createElement("div");
    d.className = "demo-dot";
    d.style.left = x + "px";
    d.style.top = y + "px";
    document.body.appendChild(d);
  };
  window.__demoLift = () => {
    for (const d of document.querySelectorAll(".demo-dot:not(.up)")) {
      d.classList.add("up");
      setTimeout(() => d.remove(), 300); // the page's clock is the film's clock, so this is 0.3 s of film
    }
  };
  window.__demoClear = () => { for (const d of document.querySelectorAll(".demo-dot")) d.remove(); };
  // Did the tap reach what it was aimed at? moves.mjs sets __demoWant before the touch and reads __demoClick after.
  document.addEventListener("click", (e) => { const want = window.__demoWant; if (want) window.__demoClick = want === e.target || want.contains(e.target); }, true);
}
