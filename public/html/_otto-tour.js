/* eslint-disable */
/**
 * Otto Tour — a small spotlight-style guided tour.
 *
 * Loaded as a static script (`<script src="/html/_otto-tour.js"></script>`),
 * usable from both static HTML (profile.html) and React pages (campus, etc.).
 *
 * Usage:
 *   OttoTour.start([
 *     { selector: '#avatar', title: "This is you.", body: "Drop in a photo." },
 *     { selector: '#bio',    title: "A few lines.", body: "Tell people what you're into." },
 *   ], { onDone(), onSkip(), nextLabel? });
 *
 * Visual: a full-screen SVG mask dims the page except for a rounded cutout
 * around each target element. A coral speech bubble floats next to the cutout
 * with the step copy + Next/Skip controls.
 */
(function () {
  if (window.OttoTour) return;

  var ACTIVE_CLASS = 'otto-tour-active';
  var Z_BASE = 9990;

  function injectStyles() {
    if (document.getElementById('otto-tour-styles')) return;
    var css = [
      '.otto-tour-svg { position: fixed; inset: 0; z-index: ' + Z_BASE + '; pointer-events: auto; }',
      '.otto-tour-svg-fill { fill: rgba(10, 10, 20, 0.74); }',
      '.otto-tour-spot { fill: white; }',
      '.otto-tour-bubble {',
      '  position: fixed; z-index: ' + (Z_BASE + 2) + '; box-sizing: border-box;',
      '  max-width: 320px; min-width: 240px;',
      '  background: rgba(28, 28, 30, 0.96);',
      '  color: #faf7f2;',
      '  border: 1px solid rgba(255, 255, 255, 0.06);',
      '  border-radius: 18px;',
      '  padding: 18px 18px 14px;',
      '  font-family: "DM Sans", sans-serif;',
      '  box-shadow:',
      '    0 28px 64px rgba(0, 0, 0, 0.5),',
      '    0 0 0 1px rgba(255, 92, 53, 0.18),',
      '    0 0 36px rgba(255, 92, 53, 0.22);',
      '  opacity: 0; transform: translateY(8px);',
      '  transition: opacity 240ms cubic-bezier(.22,1,.36,1), transform 240ms cubic-bezier(.22,1,.36,1);',
      '}',
      '.otto-tour-bubble.visible { opacity: 1; transform: translateY(0); }',
      '.otto-tour-eyebrow {',
      '  font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;',
      '  color: #ff5c35; margin-bottom: 6px;',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '}',
      '.otto-tour-eyebrow .dot {',
      '  width: 6px; height: 6px; border-radius: 50%;',
      '  background: #ff5c35; box-shadow: 0 0 6px #ff5c35;',
      '}',
      '.otto-tour-title {',
      '  font-family: "Fraunces", serif; font-size: 18px; font-weight: 700;',
      '  letter-spacing: -0.4px; line-height: 1.2; margin: 0 0 6px;',
      '}',
      '.otto-tour-title .accent { color: #ff5c35; }',
      '.otto-tour-body {',
      '  font-size: 13px; line-height: 1.5;',
      '  color: rgba(250, 247, 242, 0.78); margin: 0 0 14px;',
      '}',
      '.otto-tour-row {',
      '  display: flex; align-items: center; justify-content: space-between; gap: 10px;',
      '}',
      '.otto-tour-progress {',
      '  font-size: 10px; font-weight: 700; letter-spacing: 0.16em;',
      '  color: rgba(250, 247, 242, 0.4);',
      '}',
      '.otto-tour-skip {',
      '  appearance: none; border: none; background: none;',
      '  font-family: "DM Sans", sans-serif; font-size: 11px; font-weight: 600;',
      '  color: rgba(250, 247, 242, 0.5); cursor: pointer; padding: 6px 10px;',
      '  letter-spacing: 0.06em;',
      '}',
      '.otto-tour-skip:hover { color: #faf7f2; }',
      '.otto-tour-next {',
      '  appearance: none; border: none; cursor: pointer;',
      '  font-family: "DM Sans", sans-serif; font-size: 12px; font-weight: 700;',
      '  letter-spacing: 0.08em;',
      '  padding: 9px 16px; border-radius: 999px;',
      '  background: #ff5c35; color: #faf7f2;',
      '  box-shadow: 0 6px 18px rgba(255, 92, 53, 0.4), inset 0 1px 0 rgba(255,255,255,0.18);',
      '  transition: transform 180ms ease, box-shadow 180ms ease;',
      '}',
      '.otto-tour-next:hover {',
      '  transform: translateY(-1px);',
      '  box-shadow: 0 10px 26px rgba(255, 92, 53, 0.55), inset 0 1px 0 rgba(255,255,255,0.25);',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .otto-tour-bubble, .otto-tour-bubble.visible { transition: none !important; }',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'otto-tour-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureSvgOverlay() {
    var existing = document.getElementById('otto-tour-svg');
    if (existing) return existing;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'otto-tour-svg';
    svg.classList.add('otto-tour-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.innerHTML = ''
      + '<defs>'
      +   '<mask id="otto-tour-mask">'
      +     '<rect class="otto-tour-svg-fill-mask" x="0" y="0" width="100%" height="100%" fill="white" />'
      +     '<rect class="otto-tour-spot" rx="12" ry="12" x="0" y="0" width="0" height="0" />'
      +   '</mask>'
      + '</defs>'
      + '<rect class="otto-tour-svg-fill" x="0" y="0" width="100%" height="100%" mask="url(#otto-tour-mask)" />';
    document.body.appendChild(svg);
    return svg;
  }

  function ensureBubble() {
    var bubble = document.getElementById('otto-tour-bubble');
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.id = 'otto-tour-bubble';
    bubble.className = 'otto-tour-bubble';
    bubble.setAttribute('role', 'dialog');
    document.body.appendChild(bubble);
    return bubble;
  }

  function findTarget(selector) {
    if (!selector) return null;
    try { return document.querySelector(selector); } catch (e) { return null; }
  }

  function rectFor(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    // Padding around the spot
    var pad = 10;
    return {
      x: Math.max(8, r.left - pad),
      y: Math.max(8, r.top - pad),
      w: r.width + pad * 2,
      h: r.height + pad * 2,
    };
  }

  function positionBubble(bubble, spot) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var bw = Math.min(320, Math.max(bubble.offsetWidth, 260));
    var bh = bubble.offsetHeight || 160;
    var gap = 16;

    // Prefer below the spot. If not enough room, try above. Otherwise, side.
    var top, left;
    if (spot.y + spot.h + gap + bh < vh - 16) {
      top = spot.y + spot.h + gap;
      left = clamp(spot.x + spot.w / 2 - bw / 2, 16, vw - bw - 16);
    } else if (spot.y - gap - bh > 16) {
      top = spot.y - gap - bh;
      left = clamp(spot.x + spot.w / 2 - bw / 2, 16, vw - bw - 16);
    } else if (spot.x + spot.w + gap + bw < vw - 16) {
      left = spot.x + spot.w + gap;
      top = clamp(spot.y + spot.h / 2 - bh / 2, 16, vh - bh - 16);
    } else {
      left = clamp(spot.x - gap - bw, 16, vw - bw - 16);
      top = clamp(spot.y + spot.h / 2 - bh / 2, 16, vh - bh - 16);
    }
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function renderBubble(bubble, step, idx, total, handlers) {
    var isLast = idx === total - 1;
    var nextLabel = isLast ? (step.endLabel || 'Got it') : (step.nextLabel || 'Next →');
    bubble.innerHTML = ''
      + '<div class="otto-tour-eyebrow"><span class="dot"></span>otto · ' + (idx + 1) + ' / ' + total + '</div>'
      + '<h3 class="otto-tour-title">' + step.title + '</h3>'
      + '<p class="otto-tour-body">' + step.body + '</p>'
      + '<div class="otto-tour-row">'
      +   '<button type="button" class="otto-tour-skip" data-act="skip">Skip tour</button>'
      +   '<button type="button" class="otto-tour-next" data-act="next">' + nextLabel + '</button>'
      + '</div>';
    bubble.onclick = function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      if (t.dataset.act === 'next') handlers.next();
      if (t.dataset.act === 'skip') handlers.skip();
    };
  }

  var _running = false;

  function start(steps, options) {
    if (_running) return;
    if (!steps || !steps.length) return;
    options = options || {};
    _running = true;
    injectStyles();
    document.body.classList.add(ACTIVE_CLASS);

    var svg = ensureSvgOverlay();
    var bubble = ensureBubble();
    var idx = 0;
    var onResize = function () { showStep(idx); };

    function teardown(reason) {
      _running = false;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      document.body.classList.remove(ACTIVE_CLASS);
      bubble.classList.remove('visible');
      setTimeout(function () {
        if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
        if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
      }, 260);
      if (reason === 'skip' && typeof options.onSkip === 'function') options.onSkip();
      if (reason === 'done' && typeof options.onDone === 'function') options.onDone();
    }

    function showStep(i) {
      idx = i;
      var step = steps[i];
      var el = findTarget(step.selector);
      // Scroll into view first; small RAF so layout settles before we measure.
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      requestAnimationFrame(function () {
        var spot = rectFor(el);
        if (!spot) {
          // Fallback: center the spot in the viewport so the bubble still
          // shows readable copy.
          spot = { x: window.innerWidth / 2 - 60, y: window.innerHeight / 2 - 60, w: 120, h: 120 };
        }
        var rect = svg.querySelector('.otto-tour-spot');
        rect.setAttribute('x', spot.x);
        rect.setAttribute('y', spot.y);
        rect.setAttribute('width', spot.w);
        rect.setAttribute('height', spot.h);
        renderBubble(bubble, step, i, steps.length, {
          next: function () {
            if (i + 1 >= steps.length) teardown('done');
            else showStep(i + 1);
          },
          skip: function () { teardown('skip'); },
        });
        positionBubble(bubble, spot);
        bubble.classList.add('visible');
      });
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    // Brief delay so the page can settle (post-warp arrival, fonts, layout).
    setTimeout(function () { showStep(0); }, 350);
  }

  window.OttoTour = { start: start, isRunning: function () { return _running; } };
})();
