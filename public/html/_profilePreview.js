// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared profile-preview renderer for chat messages
//
// When a message body contains a /profile/<handle> URL (typically from the
// share-profile modal in profile.html), each chat surface (messages.html,
// _miniMessenger.js, campus channel chat) replaces the link with a rich
// preview card: banner + avatar + name + role + handle. Card is clickable
// straight to the profile.
//
// API on `window`:
//   __profilePreviewExtract(text) → { prefix, handle, url } | null
//   __profilePreviewSkeletonHTML(handle, opts?) → string
//   __profilePreviewHydrate(rootEl) → void (fetches + populates)
//
// Cache: per-page Map<handle, profile> so multi-message threads with the
// same shared profile only hit /api/users/<handle>/bootstrap once.
// ══════════════════════════════════════════════════════════════════════════

(function profilePreviewInit(){
  if (window.__profilePreviewInit) return; // idempotent — multi-page loaders
  window.__profilePreviewInit = true;

  const PROFILE_URL_RE = /(https?:\/\/[^\s]+\/profile\/([a-z0-9_]{1,40})|\/profile\/([a-z0-9_]{1,40}))/i;
  const cache = new Map(); // handle → profile JSON
  const inflight = new Map(); // handle → Promise

  // Default banner gradient — same one profile.html uses when no banner_url
  // and no banner_gradient are set. Keeps empty banners feeling intentional.
  const DEFAULT_BANNER =
    'linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%)';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function initialsOf(name, handle) {
    const src = (name || handle || '?').trim();
    return src.split(/\s+/).filter(Boolean).slice(0,2)
      .map(p => p[0]).join('').toUpperCase() || '?';
  }

  // Extract a profile URL from a free-text body. Returns the matched
  // handle, the full URL, and the prefix text (everything before the
  // URL, with trailing whitespace + arrow + colon trimmed).
  window.__profilePreviewExtract = function(text) {
    const t = String(text || '');
    const m = t.match(PROFILE_URL_RE);
    if (!m) return null;
    const url = m[1];
    const handle = (m[2] || m[3] || '').toLowerCase();
    if (!handle) return null;
    // Strip the URL + any "→" arrow + trailing whitespace from the prefix
    // so the caption reads cleanly above the card.
    let prefix = t.slice(0, m.index || 0);
    prefix = prefix.replace(/[\s→\-:]+$/u, '').trim();
    return { prefix, handle, url };
  };

  // Skeleton card. Real profile data is filled in by hydrate().
  // `opts.theme` controls dark/light surface colours so the card reads
  // on both peer (cream) and mine (charcoal) bubbles.
  window.__profilePreviewSkeletonHTML = function(handle, opts) {
    const safe = esc(handle);
    const theme = (opts && opts.theme) || 'light';
    return `<a class="msg-profile-attach msg-profile-attach--${theme}" href="/profile/${encodeURIComponent(handle)}" data-prof-handle="${safe}" target="_self" rel="noopener">
      <div class="msg-profile-banner" data-prof-banner style="background:${DEFAULT_BANNER}"></div>
      <div class="msg-profile-body">
        <div class="msg-profile-av" data-prof-av>${esc(initialsOf(handle, handle))}</div>
        <div class="msg-profile-text">
          <div class="msg-profile-name" data-prof-name>@${safe}</div>
          <div class="msg-profile-meta" data-prof-meta>&nbsp;</div>
        </div>
      </div>
    </a>`;
  };

  async function fetchProfile(handle) {
    if (cache.has(handle)) return cache.get(handle);
    if (inflight.has(handle)) return inflight.get(handle);
    const p = (async () => {
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(handle)}/bootstrap`, {
          credentials: 'include',
        });
        if (!r.ok) return null;
        const j = await r.json();
        if (!j || !j.ok || !j.vibeUser) return null;
        const v = j.vibeUser;
        const profile = {
          handle: v.handle || handle,
          name: v.name || null,
          avatar_url: v.avatarPhoto || v.avatar_url || null,
          banner_url: v.coverPhoto || v.banner_url || null,
          banner_gradient: v.banner_gradient || '',
          major: v.major || v.studentMeta && v.studentMeta.major || null,
          year: v.year || v.studentMeta && v.studentMeta.year || null,
          school: v.school || v.studentMeta && v.studentMeta.school || null,
        };
        cache.set(handle, profile);
        return profile;
      } catch {
        return null;
      } finally {
        inflight.delete(handle);
      }
    })();
    inflight.set(handle, p);
    return p;
  }

  function applyToCard(card, profile) {
    if (!card || !profile) return;
    const banner = card.querySelector('[data-prof-banner]');
    if (banner) {
      if (profile.banner_url) {
        banner.style.background =
          `url(${profile.banner_url}) center/cover no-repeat`;
      } else if (profile.banner_gradient) {
        banner.style.background = profile.banner_gradient;
      }
    }
    const av = card.querySelector('[data-prof-av]');
    if (av) {
      if (profile.avatar_url) {
        av.style.background = `url(${profile.avatar_url}) center/cover no-repeat`;
        av.textContent = '';
      } else {
        av.textContent = initialsOf(profile.name, profile.handle);
      }
    }
    const name = card.querySelector('[data-prof-name]');
    if (name) {
      name.textContent = profile.name
        ? `${profile.name}`
        : `@${profile.handle}`;
    }
    const meta = card.querySelector('[data-prof-meta]');
    if (meta) {
      const parts = [];
      if (profile.handle && profile.name) parts.push(`@${profile.handle}`);
      if (profile.major) parts.push(profile.major);
      if (profile.year) parts.push(`Year ${profile.year}`);
      meta.textContent = parts.length ? parts.join(' · ') : ' ';
    }
  }

  window.__profilePreviewHydrate = function(rootEl) {
    if (!rootEl) return;
    const cards = rootEl.querySelectorAll('[data-prof-handle]');
    cards.forEach(card => {
      const handle = card.getAttribute('data-prof-handle');
      if (!handle) return;
      // Skip if already hydrated (prof-name doesn't start with @ anymore
      // OR avatar has a background-image set).
      if (card.dataset.profHydrated === '1') return;
      const cached = cache.get(handle);
      if (cached) {
        applyToCard(card, cached);
        card.dataset.profHydrated = '1';
        return;
      }
      fetchProfile(handle).then(profile => {
        if (!profile) return;
        applyToCard(card, profile);
        card.dataset.profHydrated = '1';
      });
    });
  };

  // ── Inject CSS once. Same primitive used by messages.html and the mini
  //    messenger so we get a consistent look across surfaces.
  const style = document.createElement('style');
  style.textContent = `
    .msg-profile-attach {
      display: block; width: 280px; max-width: 100%;
      border-radius: 14px; overflow: hidden;
      background: white;
      border: 1px solid rgba(28,28,30,.08);
      box-shadow: 0 1px 3px rgba(0,0,0,.04);
      text-decoration: none; color: #1C1C1E;
      transition: transform .15s, box-shadow .15s;
    }
    .msg-profile-attach:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(0,0,0,.08);
    }
    .msg-profile-banner {
      width: 100%; height: 92px;
      background: linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%);
    }
    .msg-profile-body {
      padding: 0 14px 12px;
      display: flex; align-items: flex-end; gap: 10px;
      position: relative;
    }
    .msg-profile-av {
      width: 44px; height: 44px; border-radius: 999px;
      margin-top: -22px; flex-shrink: 0;
      background: linear-gradient(180deg, #FFD8B8 0%, #FFB890 100%);
      color: #7A3A18;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Fraunces', serif; font-weight: 800; font-size: 14px;
      border: 2.5px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,.08);
    }
    .msg-profile-text {
      flex: 1; min-width: 0; padding-bottom: 2px;
    }
    .msg-profile-name {
      font-family: 'Fraunces', serif; font-weight: 800; font-size: 15px;
      color: #1C1C1E; line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .msg-profile-meta {
      font-family: 'DM Sans', sans-serif; font-size: 11.5px;
      color: #8A8580; margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Dark variant — used inside "mine" bubbles in messages.html so the
       card reads against the dark backdrop instead of fighting it. */
    .msg-profile-attach--dark {
      background: #262528;
      border-color: rgba(255,255,255,.10);
      color: #F5F4F2;
    }
    .msg-profile-attach--dark .msg-profile-name { color: #fff; }
    .msg-profile-attach--dark .msg-profile-meta { color: rgba(255,255,255,.65); }
    .msg-profile-attach--dark .msg-profile-av { border-color: #262528; }
  `;
  document.head.appendChild(style);
})();
