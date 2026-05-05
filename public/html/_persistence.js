// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared persistence layer  (loaded on every page)
//
// Multiple localStorage keys mirror how real platforms scope data per resource.
// Add new keys to VIBE_KEYS as we touch each page. Schema grows incrementally.
//
// Each page should call vibeInit() near the top of its inline <script>, then
// branch on the returned user object (null → empty state, _isDemo → swap UI).
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

// ── Demo seed ─────────────────────────────────────────────────────────────
// Populates Maya Chen across keys so the demo site feels real on every page.
// Triggered from the landing page "View demo site" button OR ?demo=1 URL param.
function seedDemoData() {
  vibeSave(VIBE_KEYS.user, {
    name:     "Maya Chen",
    tagline:  "I make things feel right before they look right.",
    headline: "Senior Product Designer · Figma",
    location: "Seoul → SF",
    vibeTags: ["Product Design", "Systems thinker", "Quiet collaborator", "Calm UI"],
    _isDemo:  true
  });
  // Don't seed posts/vibes — Maya's hardcoded markup stays as the demo source
  // until she edits it, at which point savePostsToStorage / saveVibesToStorage
  // captures the DOM and the keys become authoritative. Same pattern as
  // workExperience and vibeTags above (vibeTags here only because it's
  // simpler to seed than walk markup).
  // Future keys (connections, messages, etc.) seeded as those pages adopt.
}

// ── Exit demo → back to landing ───────────────────────────────────────────
function exitDemoMode() {
  vibeClearAll();
  window.location.href = '/';
}

// ── Per-page init entry point ─────────────────────────────────────────────
// Handles ?clear=1 and ?demo=1 URL params, returns the current user (or null).
// Pages call this first, then run their own page-specific init logic.
function vibeInit() {
  const params = new URLSearchParams(location.search);
  if (params.get('clear') === '1') vibeClearAll();
  if (params.get('demo')  === '1' && !vibeLoad(VIBE_KEYS.user)) seedDemoData();
  return vibeLoad(VIBE_KEYS.user);
}

// ── Floating "demo mode · exit" pill ──────────────────────────────────────
// Optional UI helper for pages that don't have a natural inline place to put
// a demo-exit affordance (everything except profile.html, which has the
// "Exit demo profile" button in its top nav). Idempotent — safe to call twice.
function vibeShowDemoPill() {
  if (document.getElementById('vibeDemoExitPill')) return;

  const style = document.createElement('style');
  style.textContent = `
    #vibeDemoExitPill {
      position: fixed; top: 18px; right: 24px; z-index: 90;
      background: #1C1C1E; color: white;
      border: none; border-radius: 100px;
      padding: 9px 16px 9px 14px; font-family: 'DM Sans', sans-serif;
      font-size: 12px; font-weight: 600; letter-spacing: .2px;
      cursor: none; display: inline-flex; align-items: center; gap: 9px;
      box-shadow: 0 6px 18px rgba(0,0,0,.18);
      transition: background .18s, transform .18s;
    }
    #vibeDemoExitPill:hover { background: #FF5C35; transform: translateY(-1px); }
    #vibeDemoExitPill .vibe-demo-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #FF5C35;
      box-shadow: 0 0 8px rgba(255,92,53,.8);
      animation: vibeDemoPulse 2s ease-in-out infinite;
    }
    #vibeDemoExitPill:hover .vibe-demo-dot { background: white; box-shadow: none; }
    @keyframes vibeDemoPulse {
      0%,100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.25); opacity: .8; }
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'vibeDemoExitPill';
  btn.innerHTML = '<span class="vibe-demo-dot"></span> Demo mode · Exit';
  btn.onclick = exitDemoMode;
  document.body.appendChild(btn);
}

// ── Pre-paint guard for sidebar identity ──────────────────────────────────
// _persistence.js loads synchronously in <head>, before any body content.
// We add an html class + inject CSS so the hardcoded "Maya Chen / MC" in
// every page's sidebar profile chip stays invisible until vibeHydrateSidebar
// runs at DOMContentLoaded. Without this, every page nav flashes Maya for
// a frame before the user's real identity paints.
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
// Each non-profile page has a sidebar profile chip with hardcoded demo data.
// This replaces the chip with the rich card layout (banner + avatar + name +
// clamped 2-line subtitle) — same visual as the React NavIdentityChip — and
// fills it from vibe_user_v1.
function vibeHydrateSidebar() {
  const user = vibeLoad(VIBE_KEYS.user);
  if (!user) return;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function _bannerCss(u) {
    const photo = u.coverPhoto;
    if (typeof photo === 'string' && /^https?:\/\//.test(photo)) {
      return 'url("' + photo.replace(/"/g, '%22') + '") center / cover no-repeat';
    }
    const g = u.coverGradient;
    if (typeof g === 'string' && g.trim()) return g.trim();
    return 'linear-gradient(135deg, #EDE9E2 0%, #D8D2C8 45%, #C9C2B8 100%)';
  }

  const initials = (user.name || '').split(/\s+/)
    .map(p => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
  const name = user.name || (user._onboarded ? 'Your name' : 'Maya Chen');
  const headline = (user.headline || '').trim();
  const tagline = (user.tagline || '').trim();
  const subtitle = headline || tagline
    || (user._onboarded && !user.name ? 'Set up your profile' : 'My profile');
  const banner = _bannerCss(user);
  const avatarInner = user.avatarPhoto && /^(data|blob|https?):/.test(user.avatarPhoto)
    ? '<img src="' + _esc(user.avatarPhoto) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">'
    : _esc(initials);

  const links = document.querySelectorAll('.left-nav a[href="/profile"].nav-item');
  links.forEach(link => {
    // Re-style the link as a card and replace its content with the rich chip.
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
          '<div style="font-family:\'DM Sans\',sans-serif;font-size:12.5px;font-weight:600;color:#1C1C1E;line-height:1.38;letter-spacing:-0.01em;overflow-wrap:anywhere;word-break:break-word;">' + _esc(name) + '</div>' +
          '<div style="font-family:\'DM Sans\',sans-serif;font-size:11px;color:#8A8580;line-height:1.4;margin-top:4px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;">' + _esc(subtitle) + '</div>' +
        '</div>' +
      '</div>';
  });

  // Reveal — drop the pre-paint guard now that identity is painted.
  // requestAnimationFrame waits one frame so the new content lands first.
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('vibe-pre-paint-sidebar');
  });
}
document.addEventListener('DOMContentLoaded', vibeHydrateSidebar);

// ── Console debugging API ─────────────────────────────────────────────────
window.vibePersist = {
  load:             vibeLoad,
  save:             vibeSave,
  clear:            vibeClear,
  clearAll:         vibeClearAll,
  seedDemoData:     seedDemoData,
  exitDemoMode:     exitDemoMode,
  init:             vibeInit,
  showDemoPill:     vibeShowDemoPill,
  hydrateSidebar:   vibeHydrateSidebar,
  KEYS:             VIBE_KEYS
};
