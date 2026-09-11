// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared persistence layer  (loaded on every page)
//
// Multiple localStorage keys mirror how real platforms scope data per resource.
// Add new keys to VIBE_KEYS as we touch each page. Schema grows incrementally.
//
// Each page should call vibeInit() near the top of its inline <script>, then
// branch on the returned user object (null → empty state / bounce, object → hydrate).
// ══════════════════════════════════════════════════════════════════════════

const VIBE_KEYS = {
  user:          'vibe_user_v1',
  posts:         'vibe_posts_v1',
  vibes:         'vibe_vibes_v1',
  relationships: 'vibe_relationships_v1', // map of slug → 'connected'|'pending'|'following'
  // Future: messages, opportunities — add as pages adopt.
};

// ── Generic load / save / clear helpers ───────────────────────────────────
function vibeLoad(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch(e) { return null; }
}
function vibeSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function vibeClear(key) { try { localStorage.removeItem(key); } catch(e) {} }
function vibeClearAll() { Object.values(VIBE_KEYS).forEach(vibeClear); }

// ── Per-page init entry point ─────────────────────────────────────────────
// Handles ?clear=1 and ?embedded=1 URL params, returns the current user (or null).
// Pages call this first, then run their own page-specific init logic.
function vibeInit() {
  const params = new URLSearchParams(location.search);
  if (params.get('clear') === '1') vibeClearAll();
  if (params.get('embedded') === '1') {
    // Set the marker class as soon as possible; if body isn't ready yet,
    // wait for it. CSS rules gated on `body.vibe-embedded` then suppress
    // the static-prototype sidebar so the parent React shell's sidebar shows.
    function _markEmbedded() {
      if (document.body) document.body.classList.add('vibe-embedded');
      else document.addEventListener('DOMContentLoaded', () =>
        document.body && document.body.classList.add('vibe-embedded'));
    }
    _markEmbedded();
  }
  return vibeLoad(VIBE_KEYS.user);
}

// In an embedded iframe, cross-route navigation (e.g., `/profile/<handle>`)
// must escape the iframe so the React shell's URL updates too. Same-origin
// iframe = window.top works without cross-origin throws. Code paths that
// might iframe-escape should use window.__vibeTopNav(url) instead of
// window.location.href = url. Pass { replace: true } for a gate redirect,
// where the page being left shouldn't stay in history.
window.__vibeTopNav = function(url, opts) {
  const replace = !!(opts && opts.replace);
  try {
    if (window.top && window.top !== window.self) {
      if (replace) window.top.location.replace(url);
      else window.top.location.href = url;
      return;
    }
  } catch (_) {}
  if (replace) window.location.replace(url);
  else window.location.href = url;
};
window.__vibeTopReplaceState = function(state, title, url) {
  try {
    if (window.top && window.top !== window.self) {
      window.top.history.replaceState(state, title, url);
      return;
    }
  } catch (_) {}
  window.history.replaceState(state, title, url);
};

// The top-level page's path + query. Inside the /messages iframe that's
// /messages?…, not /html/messages.html?app=1, so a Sign in / Terms `next`
// brings the student back to the page they were on. Falls back to this
// document when the top window can't be read.
function _vibeTopHere() {
  try {
    return window.top.location.pathname + window.top.location.search;
  } catch (_) {
    return window.location.pathname + window.location.search;
  }
}

// ── Failure feedback (static twin of src/lib/feedback/*) ─────────────────
// A refused action must say so in one short line (silent-failure design,
// handoffs/2026-09-11-silent-failure-design.md). React routes use
// vibeRequest + <ToastHost />; the static pages get the same helpers here:
//   window.vibeToast(message, { tone: 'info'|'error', action: { label, href }, durationMs })
//   window.vibeRequest(url, { method, json, body, headers, failure, success, quiet })
//     → Promise<{ ok: true, status, data } | { ok: false, status, code, error, message, action? }>
//     Never throws; branch on r.ok. `failure` is the caller's own line.
//   window.vibeCopy(text, success) → Promise<boolean>
//   window.vibeLoadFailure(r, line) → { message, action? }  (a failed first load's line)
//   window.vibeLoadFailed(el, failure, onRetry, { tone: 'light'|'dark', compact })
//     → the box it put in `el`, or null when `el` is missing
// The toast renders inside this document even in an iframe (both iframes
// fill the view, so bottom-center is where the student is looking). Only
// navigation escapes, through __vibeTopNav.
(function vibeFeedbackInit() {
  // Copy table: a copy of src/lib/feedback/failure-copy.ts, first match
  // wins. Change both together.
  const GENERIC = ['unauthorized', 'forbidden', 'request failed', 'unavailable',
    'not found', 'invalid json', 'bad request', 'internal server error'];
  const PASS_400 = ['Comment is empty', 'Message too long', 'Empty message'];
  function sentence(line) {
    const s = String(line || '').trim() || 'Something went wrong.';
    return /[.!?]$/.test(s) ? s : s + '.';
  }
  function isSentence(err) {
    if (typeof err !== 'string') return false;
    const s = err.trim();
    return s.length > 0 && s.length <= 160 && GENERIC.indexOf(s.toLowerCase()) < 0
      && /^[A-Z]/.test(s) && s.split(/\s+/).length >= 3
      && /^[A-Za-z0-9 ,.'’"“”!?:()/&—–→…·-]+$/.test(s) && !/\b(json|uuid|null|undefined|ids?)\b/i.test(s);
  }
  function retryLine(sec) {
    if (sec > 0 && sec < 60) {
      const n = Math.ceil(sec);
      return 'Try again in ' + n + (n === 1 ? ' second.' : ' seconds.');
    }
    return sec >= 120 ? 'Try again later.' : 'Try again in a minute.';
  }
  function describeFailure(sig, fallback, here) {
    const st = sig.status, err = sig.error;
    const next = encodeURIComponent(here || '/');
    if (st === 0) return { message: "Couldn't reach Vibe. Check your connection and try again." };
    if (st === 401) return { message: "You've been signed out. Sign in and try again.", action: { label: 'Sign in', href: '/auth/login?next=' + next } };
    if (st === 403 && sig.code === 'terms_required') return { message: 'Accept the Terms first, then try again.', action: { label: 'Review Terms', href: '/auth/terms?next=' + next } };
    if (st === 429) return { message: "You're going a little fast. " + retryLine(sig.retryAfterSec) };
    if (st === 403 && err === 'Unavailable') return { message: "You can't connect with this person." };
    if (st === 403 && isSentence(err)) return { message: err.trim() };
    if (st === 403 && err) return { message: "You don't have access to do that." };
    if (st === 404) return { message: "That's no longer available." };
    if (st === 409 && isSentence(err)) return { message: err.trim() };
    if (st === 400) return { message: err && (PASS_400.indexOf(err) >= 0 || /exceeds \d+ characters/.test(err)) ? err : sentence(fallback) };
    const s = sentence(fallback);
    return { message: /try again/i.test(s) ? s : s + ' Try again.' };
  }

  // ── Toast: one at a time, same message within 1.5 s dropped ──
  const DEDUPE_MS = 1500;
  let el = null;
  let hideT = 0;
  let clearT = 0;
  let lastMsg = '';
  let lastAt = 0;

  function hide() {
    clearTimeout(hideT);
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,8px)';
    el.style.pointerEvents = 'none';
    // Empty it after the fade so the next toast is fresh content in the
    // live region (and gets announced).
    clearTimeout(clearT);
    clearT = setTimeout(() => { if (el && el.style.opacity === '0') el.textContent = ''; }, 250);
  }

  // Created on first use: this file runs in <head>, before <body> exists.
  // z 11600: above page modals (≤10000) and _safetyActions' #vsa-toast,
  // below the custom cursor. Never profile's ✓ #save-toast.
  function toastEl() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = 'vibe-toast';
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);' +
      'transform:translate(-50%,8px);z-index:11600;display:flex;align-items:center;gap:10px;' +
      'width:max-content;max-width:min(520px,calc(100vw - 32px));box-sizing:border-box;' +
      'border-radius:22px;background:#1C1C1E;color:#FAF7F2;' +
      "font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;line-height:1.4;" +
      'cursor:pointer;opacity:0;pointer-events:none;' +
      'transition:opacity .2s ease,transform .22s cubic-bezier(.22,1,.36,1);';
    el.addEventListener('click', hide);
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  window.vibeToast = function(message, opts) {
    const msg = String(message == null ? '' : message).trim();
    if (!msg) return;
    const now = Date.now();
    if (msg === lastMsg && now - lastAt < DEDUPE_MS) return;
    lastMsg = msg;
    lastAt = now;
    const o = opts || {};
    const isError = o.tone === 'error';
    const action = o.action && o.action.href ? o.action : null;
    const t = toastEl();
    clearTimeout(clearT);
    t.setAttribute('role', isError ? 'alert' : 'status');
    t.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    t.style.padding = action ? '7px 7px 7px 16px' : '11px 18px';
    t.style.border = isError ? '1px solid rgba(255,92,53,.45)' : '1px solid rgba(255,255,255,.08)';
    t.style.boxShadow = isError
      ? '0 12px 36px rgba(0,0,0,.22),0 0 20px rgba(255,92,53,.18)'
      : '0 12px 36px rgba(0,0,0,.18)';
    t.textContent = '';
    if (isError) {
      const dot = document.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#FF5C35;box-shadow:0 0 8px rgba(255,92,53,.6);flex-shrink:0;';
      t.appendChild(dot);
    }
    const text = document.createElement('span');
    text.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
    text.textContent = msg;
    t.appendChild(text);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label || 'Open';
      btn.style.cssText =
        'flex-shrink:0;margin:0;padding:6px 12px;border:none;border-radius:999px;' +
        "background:#FF5C35;color:#FAF7F2;font-family:'DM Sans',sans-serif;font-size:12px;" +
        'font-weight:700;letter-spacing:.02em;line-height:1.4;white-space:nowrap;cursor:pointer;';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        hide();
        // Out of the iframe: Terms / Sign in replace the whole shell.
        window.__vibeTopNav(action.href);
      });
      t.appendChild(btn);
    }
    void t.offsetWidth; // flush so the first show animates in
    t.style.opacity = '1';
    t.style.transform = 'translate(-50%,0)';
    t.style.pointerEvents = 'auto';
    clearTimeout(hideT);
    hideT = setTimeout(hide, o.durationMs || (isError ? (action ? 8000 : 5000) : 2400));
  };

  // ── Request: same result shape as src/lib/feedback/request.ts ──
  function parseRetryAfter(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d+$/.test(s)) return Number(s);
    const at = Date.parse(s);
    return isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }
  function failed(sig, failure, quiet) {
    const d = describeFailure(sig, failure, _vibeTopHere());
    if (!quiet) window.vibeToast(d.message, { tone: 'error', action: d.action });
    const r = { ok: false, status: sig.status, code: sig.code, error: sig.error, message: d.message };
    if (d.action) r.action = d.action;
    return r;
  }
  window.vibeRequest = async function(url, opts) {
    const o = opts || {};
    let res;
    try {
      const headers = new Headers(o.headers || {});
      const init = { method: o.method, credentials: 'same-origin', headers: headers };
      if (o.json !== undefined) {
        headers.set('content-type', 'application/json');
        init.body = JSON.stringify(o.json);
      } else if (o.body != null) {
        init.body = o.body;
      }
      // A body with no method would be a GET-with-body, which fetch rejects
      // before sending (and would read as "can't reach Vibe"). Default POST.
      if (!init.method && init.body != null) init.method = 'POST';
      res = await fetch(url, init);
    } catch (_) {
      return failed({ status: 0, code: null, error: null, retryAfterSec: null }, o.failure, o.quiet);
    }
    let body = null;
    try {
      const text = await res.text();
      body = text ? JSON.parse(text) : null;
    } catch (_) {
      body = null; // HTML error page or a dropped read
    }
    const obj = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    if (!res.ok || (obj && obj.ok === false)) {
      return failed({
        status: res.status,
        code: obj && typeof obj.code === 'string' ? obj.code : null,
        error: obj && typeof obj.error === 'string' ? obj.error : null,
        retryAfterSec: parseRetryAfter(res.headers.get('retry-after')),
      }, o.failure, o.quiet);
    }
    if (o.success) window.vibeToast(o.success);
    return { ok: true, status: res.status, data: body == null ? {} : body };
  };

  // ── Copy: Clipboard API, then the textarea fallback; says which ──
  window.vibeCopy = async function(text, success) {
    const value = String(text == null ? '' : text);
    let copied = false;
    try {
      // The first await in the call, so the click's user activation still counts.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }
    if (!copied && document.body) {
      const active = document.activeElement;
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:12pt;border:0;padding:0;';
      document.body.appendChild(ta);
      try {
        ta.select();
        ta.setSelectionRange(0, value.length);
        copied = document.execCommand('copy');
      } catch (_) {
        copied = false;
      }
      ta.remove();
      if (active && active.focus) active.focus();
    }
    window.vibeToast(copied ? (success || 'Link copied') : "Couldn't copy the link.", { tone: copied ? 'info' : 'error' });
    return copied;
  };

  // ── Load failure: a failed first load says so where the list goes ──
  // Twin of src/components/feedback/LoadFailed.tsx (empty-states design §3).
  // The caller loads with { quiet: !loaded }. With nothing on screen yet, a
  // failure goes through vibeLoadFailed and the pane's empty state stays
  // hidden; with rows loaded, the rows stay.
  window.vibeLoadFailure = function(r, line) {
    if (r && r.ok === false && r.message) {
      return r.action ? { message: r.message, action: r.action } : { message: r.message };
    }
    // A 2xx whose body lacked the expected list. No copy rule maps a 2xx, so
    // this is the caller's line plus "Try again.", the same line a 5xx gets.
    return { message: describeFailure({ status: 200, code: null, error: null, retryAfterSec: null }, line, '').message };
  };

  // Empties `el` and puts one role=alert box in it: the message (textContent,
  // so no escaping) and one coral pill, the mapped action (Sign in / Review
  // Terms) when there is one, else Retry. Elements are made per call, never
  // at load: this file runs in <head>.
  window.vibeLoadFailed = function(el, failure, onRetry, opts) {
    if (!el || typeof el.appendChild !== 'function') return null;
    const o = opts || {};
    const dark = o.tone === 'dark';
    const compact = !!o.compact;
    const f = failure || {};
    const action = f.action && f.action.href ? f.action : null;

    const box = document.createElement('div');
    box.className = 'vibe-load-failed';
    box.setAttribute('role', 'alert');
    // grid-column:1/-1 because `el` is emptied first, so the box is its only
    // child: in a grid list (profile's Saved pane, repeat(3,1fr)) it spans the
    // row instead of filling one cell. Ignored outside a grid. LoadFailed.tsx
    // leaves it off: it renders among siblings, and its callers place it.
    box.style.cssText =
      'display:flex;align-items:center;max-width:100%;box-sizing:border-box;grid-column:1/-1;' +
      (compact
        ? 'flex-direction:row;flex-wrap:wrap;justify-content:space-between;gap:8px 12px;' +
          'padding:10px 12px;border-radius:12px;font-size:13px;text-align:left;'
        : 'flex-direction:column;justify-content:center;gap:12px;' +
          'padding:20px 16px;border-radius:16px;font-size:14px;text-align:center;') +
      'border:1px dashed ' + (dark ? 'rgba(255,255,255,.14)' : 'rgba(28,28,30,.14)') + ';' +
      'color:' + (dark ? 'rgba(255,255,255,.7)' : '#5C5853') + ';' +
      "font-family:'DM Sans',sans-serif;font-weight:500;line-height:1.45;";

    const text = document.createElement('span');
    text.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
    text.textContent = String(f.message || '').trim() || 'Something went wrong. Try again.';
    box.appendChild(text);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action ? (action.label || 'Open') : 'Retry';
    // cursor:inherit rather than the React pill's pointer: these pages hide
    // the native cursor behind their own dot, and their phone rules already
    // force pointer on buttons.
    btn.style.cssText =
      'flex-shrink:0;margin:0;border:none;border-radius:999px;' +
      (compact ? 'padding:5px 12px;font-size:12px;' : 'padding:7px 16px;font-size:13px;') +
      "background:#FF5C35;color:#FAF7F2;font-family:'DM Sans',sans-serif;" +
      'font-weight:700;letter-spacing:.02em;line-height:1.4;white-space:nowrap;cursor:inherit;';
    btn.addEventListener('click', e => {
      // Kept from click-outside handlers: a retry usually repaints `el`,
      // detaching this button before the click reaches document.
      e.preventDefault();
      e.stopPropagation();
      // Out of the iframe: Terms / Sign in replace the whole shell.
      if (action) window.__vibeTopNav(action.href);
      else if (typeof onRetry === 'function') onRetry();
      else location.reload();
    });
    box.appendChild(btn);

    el.textContent = '';
    el.appendChild(box);
    return box;
  };

  // messages.html and onboarding.html have no toast of their own, so their
  // guarded `if (window.showToast)` calls went nowhere. Plain assignment on
  // purpose: profile.html's later top-level `function showToast` still
  // replaces it, so profile keeps its ✓ save toast.
  window.showToast = window.showToast || (m => window.vibeToast(m));
})();

// ── Pre-paint guard for sidebar identity ──────────────────────────────────
// _persistence.js loads synchronously in <head>, before any body content.
// When a cached user exists we hide the static sidebar profile chip until
// vibeHydrateSidebar repaints it at DOMContentLoaded, so the placeholder
// never flashes before the real identity. With no cached user we do nothing.
(function vibePrePaintSidebar() {
  try {
    const raw = localStorage.getItem(VIBE_KEYS.user);
    if (!raw) return;
    if (!JSON.parse(raw)) return;
    document.documentElement.classList.add('vibe-pre-paint-sidebar');
    const style = document.createElement('style');
    style.id = 'vibePrePaintStyle';
    style.textContent = `
      html.vibe-pre-paint-sidebar .left-nav a[href="/profile"].nav-item .mini-avatar,
      html.vibe-pre-paint-sidebar .left-nav a[href="/profile"].nav-item .mini-av,
      html.vibe-pre-paint-sidebar .left-nav a[href="/profile"].nav-item > div:not(.mini-avatar):not(.mini-av) {
        visibility: hidden;
      }
    `;
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('readystatechange', () => {
      if (document.head && !document.getElementById('vibePrePaintStyle')) document.head.appendChild(style);
    });
  } catch (e) {}
})();

// ── Sidebar identity hydration (auto-runs on every page) ──────────────────
// Replaces the static placeholder chip with the rich card layout (banner + avatar +
// name + clamped 2-line subtitle) — same visual as React NavIdentityChip.
// Paints instantly from localStorage, then refreshes from /api/me/profile-
// bootstrap and repaints so cover/headline updates show up even on pages
// that haven't been through ProfileHtmlBridge.
function _vibeEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _vibeBannerCss(u) {
  const photo = u.coverPhoto;
  if (typeof photo === 'string' && /^https?:\/\//.test(photo)) {
    return 'url("' + photo.replace(/"/g, '%22') + '") center / cover no-repeat';
  }
  const g = u.coverGradient;
  if (typeof g === 'string' && g.trim()) return g.trim();
  return 'linear-gradient(135deg, #EDE9E2 0%, #D8D2C8 45%, #C9C2B8 100%)';
}

function _vibePaintSidebarChips(user) {
  if (!user) return;
  const initials = (user.name || '').split(/\s+/)
    .map(p => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
  const name = user.name || 'Your name';
  const headline = (user.headline || '').trim();
  const tagline = (user.tagline || '').trim();
  const subtitle = headline || tagline
    || (!user.name ? 'Set up your profile' : 'My profile');
  const banner = _vibeBannerCss(user);
  const avatarInner = user.avatarPhoto && /^(data|blob|https?):/.test(user.avatarPhoto)
    ? '<img src="' + _vibeEsc(user.avatarPhoto) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">'
    : _vibeEsc(initials);

  const links = document.querySelectorAll('.left-nav a[href="/profile"].nav-item');
  links.forEach(link => {
    link.style.cssText =
      'display:block;border-radius:12px;overflow:hidden;text-decoration:none;' +
      'border:1px solid rgba(28,28,30,0.08);box-shadow:0 4px 16px rgba(0,0,0,0.05);' +
      'background:white;padding:0;margin-bottom:2px;';
    link.innerHTML =
      '<div aria-hidden style="height:48px;width:100%;background:' + banner + ';"></div>' +
      '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 10px 12px;background:white;">' +
        '<div class="mini-av" style="width:36px;height:36px;border-radius:10px;background:#1C1C1E;display:flex;align-items:center;justify-content:center;font-family:Fraunces,serif;font-size:12px;font-weight:700;color:white;flex-shrink:0;overflow:hidden;">' +
          avatarInner +
        '</div>' +
        '<div style="min-width:0;flex:1;padding-top:1px;">' +
          '<div style="font-family:\'DM Sans\',sans-serif;font-size:12.5px;font-weight:600;color:#1C1C1E;line-height:1.38;letter-spacing:-0.01em;overflow-wrap:anywhere;word-break:break-word;">' + _vibeEsc(name) + '</div>' +
          '<div style="font-family:\'DM Sans\',sans-serif;font-size:11px;color:#8A8580;line-height:1.4;margin-top:4px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;">' + _vibeEsc(subtitle) + '</div>' +
        '</div>' +
      '</div>';
  });
}

function vibeHydrateSidebar() {
  const cached = vibeLoad(VIBE_KEYS.user);
  if (!cached) return;

  // Fast path: paint immediately from cache so there's no flash.
  _vibePaintSidebarChips(cached);
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('vibe-pre-paint-sidebar');
  });

  // Truth path: refresh from the server so cover/headline updates show up
  // even when localStorage is stale (e.g., user updated their banner from
  // profile.html and then navigated to /messages without round-tripping
  // through ProfileHtmlBridge again).
  fetch('/api/me/profile-bootstrap', { credentials: 'include' })
    .then(async r => {
      // Consent gate (S53 A4): the static ?app=1 shells have no server page
      // in front of them, so the bootstrap is where a signed-in user with no
      // consent record gets caught. Send them to the interstitial and back.
      if (r.status === 403) {
        const j = await r.json().catch(() => null);
        if (j && j.code === 'terms_required') {
          // Top-level path and navigation: from inside the /messages iframe
          // the Terms page must replace the whole shell, and accepting has
          // to land back on /messages, not the bare static URL.
          window.__vibeTopNav('/auth/terms?next=' + encodeURIComponent(_vibeTopHere()), { replace: true });
        }
        return null;
      }
      return r.ok ? r.json() : null;
    })
    .then(d => {
      if (!d || !d.ok || !d.vibeUser) return;
      // Preserve any local-only fields by merging server truth on top.
      const merged = Object.assign({}, cached, d.vibeUser);
      vibeSave(VIBE_KEYS.user, merged);
      _vibePaintSidebarChips(merged);
    })
    .catch(() => { /* best-effort refresh; cached paint already happened */ });
}
document.addEventListener('DOMContentLoaded', vibeHydrateSidebar);

// ── Console debugging API ─────────────────────────────────────────────────
window.vibePersist = {
  load:             vibeLoad,
  save:             vibeSave,
  clear:            vibeClear,
  clearAll:         vibeClearAll,
  init:             vibeInit,
  hydrateSidebar:   vibeHydrateSidebar,
  KEYS:             VIBE_KEYS
};
