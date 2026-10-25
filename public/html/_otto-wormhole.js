/* eslint-disable */
/**
 * Otto's wormhole (Franky, Oct 25 2026): the way a new account meets Otto,
 * and the way it leaves onboarding for the app.
 *
 *   OttoWormhole.arrive({ anchor, bg, onReveal, onDone })
 *     Lightspeed streaks pour into a point, it flares, and Otto's solar
 *     system pops into being where `anchor` (the page's own Otto orb) sits:
 *     rings spin out, planets ride them, the orb lands. Then the void clears
 *     and `onReveal()` lets the page bring its words in ("i'm otto." ...).
 *
 *   OttoWormhole.depart({ anchor, collapse, color, onDone })
 *     The reverse: the step folds into Otto (`collapse`, the elements to
 *     fold), his rings pull in, streaks shoot outward, and a disc in the
 *     app's own page colour (`color`) swallows the screen. `onDone()` then
 *     navigates; Campus starts with Otto alone (first light).
 *
 * One file for both onboardings: the computer's static page loads it with a
 * script tag, the phone's React page with a script element (like the tour).
 * It only draws a layer above the page; the page hides and shows its own
 * content. A tap, a click or a key skips to the end. Reduced motion: no
 * streaks and nothing moves, the page simply fades.
 *
 * Motion: transform and opacity only. What arrives and settles moves on the
 * app's springs (src/lib/motion/springs.ts, sampled into CSS here because
 * the static page doesn't load the app's stylesheet; spring-curve.test.ts
 * pins them); the lightspeed streaks accelerate (ease-in), as light would.
 */
(function () {
  if (window.OttoWormhole) return;

  var SOFT = 'linear(0, 0.026 3%, 0.088 6%, 0.198 10%, 0.319 14%, 0.464 19%, 0.589 24%, 0.71 30%, 0.812 37%, 0.889 45%, 0.945 55%, 0.977 67%, 0.993 82%, 1)';
  var POP = 'linear(0, 0.144 3%, 0.462 6%, 0.901 10%, 1.175 14%, 1.236 19%, 1.12 24%, 0.977 30%, 0.943 37%, 0.993 45%, 1.013 55%, 0.997 67%, 1 82%, 1)';
  var STREAKS = 40;
  var COLORS = ['#FF5C35', '#C8B8FF', '#FFD9C9', '#FF8A66'];

  function reduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function injectStyles() {
    if (document.getElementById('owh-styles')) return;
    var css = [
      '.owh { position: fixed; inset: 0; z-index: 2147483000; overflow: hidden; pointer-events: auto; }',
      // The curves live on the page's folding elements too: they sit outside the overlay.
      '.owh, .owh-fold { --owh-soft: cubic-bezier(0.22, 1, 0.36, 1); --owh-pop: cubic-bezier(0.34, 1.56, 0.64, 1); }',
      '@supports (transition-timing-function: linear(0, 1)) { .owh, .owh-fold { --owh-soft: ' + SOFT + '; --owh-pop: ' + POP + '; } }',
      '.owh-void { position: absolute; inset: 0; }',
      '.owh-void.out { animation: owh-fade-out 480ms var(--owh-soft) forwards; }',
      '.owh-center { position: absolute; width: 0; height: 0; }',
      '.owh-ray { position: absolute; left: 0; top: 0; width: 0; height: 0; }',
      '.owh-ray i { position: absolute; left: 0; top: -1px; height: 2px; border-radius: 2px; transform-origin: 0 50%; opacity: 0; }',
      '.owh.arrive .owh-ray i { background: linear-gradient(90deg, var(--c), rgba(255,255,255,0)); animation: owh-in var(--t) cubic-bezier(0.55, 0, 0.9, 0.35) var(--w) both; }',
      '.owh.depart .owh-ray i { background: linear-gradient(90deg, rgba(255,255,255,0), var(--c)); animation: owh-out var(--t) cubic-bezier(0.5, 0, 0.85, 0.4) var(--w) both; }',
      '.owh-flare { position: absolute; left: -8px; top: -8px; width: 16px; height: 16px; border-radius: 50%; opacity: 0;',
      '  background: radial-gradient(circle, #fff 0%, #FFD9C9 30%, #FF5C35 55%, rgba(255,92,53,0) 72%); }',
      '.owh-flare.on { animation: owh-flare 760ms var(--owh-soft) both; }',
      '.owh-ring { position: absolute; border-radius: 50%; border: 1px solid var(--rc); opacity: 0; }',
      '.owh-ring b { position: absolute; top: -3px; left: 50%; margin-left: -3px; width: 6px; height: 6px; border-radius: 50%; background: var(--rc); box-shadow: 0 0 10px var(--rc); }',
      '.owh-ring.on { animation: owh-ring-in 700ms var(--owh-pop) var(--w) both, owh-spin var(--s) linear var(--w) infinite; }',
      '.owh-ring.pull { animation: owh-ring-pull 460ms var(--owh-soft) var(--w) both; }',
      '.owh-orb { position: absolute; transform: scale(0); opacity: 0; }',
      '.owh-orb.on { animation: owh-pop 600ms var(--owh-pop) both; }',
      '.owh-orb.hold { transform: none; opacity: 1; }',
      '.owh-disc { position: absolute; left: -10px; top: -10px; width: 20px; height: 20px; border-radius: 50%; transform: scale(0); }',
      '.owh-disc.on { animation: owh-swallow 560ms cubic-bezier(0.55, 0, 0.85, 0.3) forwards; }',
      '.owh-fold { animation: owh-fold 460ms var(--owh-soft) forwards; }',
      '@keyframes owh-in { 0% { transform: translateX(var(--d)) scaleX(1.1); opacity: 0; } 18% { opacity: 1; } 100% { transform: translateX(0) scaleX(0.02); opacity: 0; } }',
      '@keyframes owh-out { 0% { transform: translateX(0) scaleX(0.02); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateX(var(--d)) scaleX(1.4); opacity: 0; } }',
      '@keyframes owh-flare { 0% { transform: scale(0); opacity: 0; } 35% { transform: scale(7); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }',
      '@keyframes owh-ring-in { from { transform: scale(0) rotate(-140deg); opacity: 0; } to { transform: scale(1) rotate(0deg); opacity: 0.7; } }',
      '@keyframes owh-spin { from { rotate: 0deg; } to { rotate: 360deg; } }',
      '@keyframes owh-ring-pull { from { transform: scale(1) rotate(0deg); opacity: 0.7; } to { transform: scale(0) rotate(160deg); opacity: 0; } }',
      '@keyframes owh-pop { from { transform: scale(0) rotate(-40deg); opacity: 0; } to { transform: none; opacity: 1; } }',
      '@keyframes owh-swallow { from { transform: scale(0); } to { transform: scale(var(--k)); } }',
      '@keyframes owh-fold { to { transform: scale(0.86); opacity: 0; } }',
      '@keyframes owh-fade-out { to { opacity: 0; } }',
      '@keyframes owh-fade-in { from { opacity: 0; } to { opacity: 1; } }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'owh-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(cls, parent) {
    var n = document.createElement('div');
    n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  /**
   * The anchor's centre and size. An anchor scrolled off the screen (Finish
   * at the bottom of a long step) is drawn at the middle of the screen
   * instead (`moved`), so the light is never spent out of sight.
   */
  function centreOf(anchor) {
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    var vw = window.innerWidth, vh = window.innerHeight;
    var mid = { x: vw / 2, y: vh / 2.6 };
    if (!r || !(r.width > 0)) return { x: mid.x, y: mid.y, w: 120, h: 120, rect: null };
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x >= 0 && x <= vw && y >= 0 && y <= vh) return { x: x, y: y, w: r.width, h: r.height, rect: r };
    var rect = { left: mid.x - r.width / 2, top: mid.y - r.height / 2, width: r.width, height: r.height };
    return { x: mid.x, y: mid.y, w: r.width, h: r.height, rect: rect, moved: true };
  }

  /** Rays all round the centre, each with its own colour, length, distance, delay. */
  function addRays(centre, far) {
    for (var i = 0; i < STREAKS; i++) {
      var ray = el('owh-ray', centre);
      var a = (i / STREAKS) * 360 + (Math.random() - 0.5) * (360 / STREAKS);
      ray.style.transform = 'rotate(' + a.toFixed(1) + 'deg)';
      var bar = document.createElement('i');
      bar.style.width = (70 + Math.random() * 140).toFixed(0) + 'px';
      bar.style.setProperty('--c', COLORS[i % COLORS.length]);
      bar.style.setProperty('--d', (far * (0.55 + Math.random() * 0.5)).toFixed(0) + 'px');
      bar.style.setProperty('--t', (520 + Math.random() * 260).toFixed(0) + 'ms');
      bar.style.setProperty('--w', (Math.random() * 260).toFixed(0) + 'ms');
      ray.appendChild(bar);
    }
  }

  /** Three orbits, sized off the orb, each with a planet. */
  function addRings(centre, size) {
    var rings = [];
    var spec = [
      { r: size * 0.62, c: 'rgba(255,92,53,0.75)', s: '5.5s', w: 0 },
      { r: size * 0.95, c: 'rgba(200,184,255,0.7)', s: '8s', w: 90 },
      { r: size * 1.4, c: 'rgba(255,217,201,0.55)', s: '12s', w: 180 }
    ];
    spec.forEach(function (o) {
      var ring = el('owh-ring', centre);
      ring.style.width = ring.style.height = (o.r * 2).toFixed(0) + 'px';
      ring.style.left = ring.style.top = (-o.r).toFixed(0) + 'px';
      ring.style.setProperty('--rc', o.c);
      ring.style.setProperty('--s', o.s);
      ring.style.setProperty('--w', o.w + 'ms');
      ring.appendChild(document.createElement('b'));
      rings.push(ring);
    });
    return rings;
  }

  /** A copy of the page's orb at the same place, so the hand-over can't be seen. */
  function addOrb(overlay, at) {
    if (!at.rect || !at.anchor) return null;
    var clone = at.anchor.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    var wrap = el('owh-orb', overlay);
    wrap.style.left = at.rect.left + 'px';
    wrap.style.top = at.rect.top + 'px';
    wrap.style.width = at.rect.width + 'px';
    wrap.style.height = at.rect.height + 'px';
    clone.style.margin = '0';
    wrap.appendChild(clone);
    return wrap;
  }

  function makeOverlay(kind, bg) {
    injectStyles();
    var overlay = el('owh ' + kind, document.body);
    overlay.setAttribute('aria-hidden', 'true');
    var voidEl = el('owh-void', overlay);
    voidEl.style.background = bg || 'transparent';
    return { overlay: overlay, voidEl: voidEl };
  }

  var running = false;

  /** Otto arrives. */
  function arrive(opts) {
    opts = opts || {};
    var revealed = false;
    var finished = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      try { if (typeof opts.onReveal === 'function') opts.onReveal(); } catch (e) {}
    };
    var done = function () {
      if (finished) return;
      finished = true;
      running = false;
      reveal();
      try { if (typeof opts.onDone === 'function') opts.onDone(); } catch (e) {}
    };
    if (running || reduced()) { reveal(); done(); return; }
    running = true;

    var at = centreOf(opts.anchor);
    at.anchor = opts.anchor;
    var made;
    try { made = makeOverlay('arrive', opts.bg || '#0C0B0B'); } catch (e) { done(); return; }
    var overlay = made.overlay;
    var centre = el('owh-center', overlay);
    centre.style.left = at.x + 'px';
    centre.style.top = at.y + 'px';
    var far = Math.hypot(window.innerWidth, window.innerHeight) * 0.6;
    addRays(centre, far);
    var flare = el('owh-flare', centre);
    var rings = addRings(centre, Math.max(at.w, 90));
    var orb = addOrb(overlay, at);

    var timers = [];
    var later = function (ms, fn) { timers.push(setTimeout(fn, ms)); };
    var end = function () {
      timers.forEach(clearTimeout);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      done();
    };
    var skip = function () { end(); };
    overlay.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip, { once: true });

    later(430, function () { flare.classList.add('on'); });
    later(620, function () {
      rings.forEach(function (r) { r.classList.add('on'); });
      if (orb) orb.classList.add('on');
    });
    // The void clears and the page brings its words in under the last spin.
    later(1450, function () {
      made.voidEl.classList.add('out');
      rings.forEach(function (r) { r.style.transition = 'opacity 480ms var(--owh-soft)'; r.style.opacity = '0'; });
      reveal();
    });
    later(2000, function () {
      window.removeEventListener('keydown', skip);
      end();
    });
  }

  /** The account becomes the app. */
  function depart(opts) {
    opts = opts || {};
    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      try { if (typeof opts.onDone === 'function') opts.onDone(); } catch (e) {}
    };
    var color = opts.color || '#0C0B0B';
    var made;
    try { made = makeOverlay('depart', 'transparent'); } catch (e) { done(); return; }
    var overlay = made.overlay;

    if (reduced()) {
      made.voidEl.style.background = color;
      made.voidEl.style.animation = 'owh-fade-in 260ms linear both';
      setTimeout(done, 280);
      return;
    }

    var at = centreOf(opts.anchor);
    at.anchor = opts.anchor;
    // The step folds into Otto: each element shrinks toward his centre.
    (opts.collapse || []).forEach(function (node) {
      if (!node || !node.getBoundingClientRect) return;
      var r = node.getBoundingClientRect();
      node.style.transformOrigin = (at.x - r.left).toFixed(0) + 'px ' + (at.y - r.top).toFixed(0) + 'px';
      node.classList.add('owh-fold');
    });
    var orb = addOrb(overlay, at);
    // Otto stays where he is, or pops in mid-screen when his place is out of sight.
    if (orb) orb.classList.add(at.moved ? 'on' : 'hold');
    var centre = el('owh-center', overlay);
    centre.style.left = at.x + 'px';
    centre.style.top = at.y + 'px';
    var rings = addRings(centre, Math.max(at.w, 90));
    rings.forEach(function (r) { r.style.opacity = '0.7'; r.classList.add('pull'); });
    var far = Math.hypot(window.innerWidth, window.innerHeight) * 0.7;
    var disc = el('owh-disc', centre);
    disc.style.background = color;
    // Big enough from this centre to cover every corner.
    var reach = Math.max(
      Math.hypot(at.x, at.y), Math.hypot(window.innerWidth - at.x, at.y),
      Math.hypot(at.x, window.innerHeight - at.y), Math.hypot(window.innerWidth - at.x, window.innerHeight - at.y)
    );
    disc.style.setProperty('--k', (reach / 10 + 2).toFixed(1));

    setTimeout(function () {
      var flare = el('owh-flare', centre);
      flare.classList.add('on');
      addRays(centre, far);
    }, 300);
    setTimeout(function () { disc.classList.add('on'); }, 520);
    setTimeout(done, 1120);
  }

  window.OttoWormhole = { arrive: arrive, depart: depart };
})();
