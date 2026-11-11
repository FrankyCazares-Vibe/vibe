// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared Otto companion  (loaded on every non-Otto page)
//
// Renders Otto's persistent presence: a small pulsing corner ring (bottom-right)
// and a dark slide-out panel that opens when the ring is clicked. The panel
// shows the briefing quote, ready drafts, and recent activity — quick review
// without leaving the current page. For the full command center, the panel
// links to /otto.
//
// Self-suppresses on otto.html (Otto is already the page there) and on landing
// (no user yet — pre-auth gate). Requires _persistence.js to be loaded first.
// ══════════════════════════════════════════════════════════════════════════

(function ottoCompanionInit(){
  // ── Otto as Planet (Nov 10, 2026, the Otto build's Wave 1) ────────────
  // The static twin of src/components/otto/planet/OttoPlanet.tsx: the same
  // parts in PLANET_PARTS order, drawn by /html/_otto-planet.css (a byte copy
  // of src/components/otto/kit/planet.css; planet-static-drift.test.ts holds
  // both). His look (colourway, Still/Living) is this device's
  // localStorage.vibe_otto_look, the key src/lib/otto/use-otto-look.ts
  // writes. This part runs before the sign-in check below, so the page's own
  // Ottos (profile.html's loading state) wear the look signed out too.
  const OTTO_COLOURS = ['dusk', 'midnight', 'violet', 'rose', 'cardinal', 'ember', 'lantern', 'forest', 'canal', 'onyx'];
  function readOttoLook() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('vibe_otto_look') || 'null'); } catch { raw = null; }
    const ok = raw && typeof raw === 'object';
    return {
      colour: ok && OTTO_COLOURS.indexOf(raw.colour) >= 0 ? raw.colour : 'ember',
      motion: ok && (raw.motion === 'still' || raw.motion === 'living') ? raw.motion : 'living',
    };
  }
  // `live` asks for the idle loop (the hero and the computer's corner only);
  // it shows when the look is Living and never below 40px, like OttoPlanet.
  // The ask is kept in data-otto-live so a new look can turn it on or off.
  function planetHTML(size, opts) {
    const o = opts || {};
    const look = readOttoLook();
    let cls = 'm-otto m-planet sk-' + look.colour;
    if (o.live && look.motion === 'living' && size >= 40) cls += ' m-live';
    if (o.state && o.state !== 'rest') cls += ' ' + o.state;
    return '<span class="' + cls + '"' + (o.live ? ' data-otto-live' : '') + ' aria-hidden="true" style="width:' + size + 'px;height:' + size + 'px">'
      + '<i class="m-aura"></i><i class="m-x1"></i>'
      + '<i class="m-body"><i class="m-tex"></i><i class="m-face"><i class="m-eye l"></i><i class="m-eye r"></i></i></i>'
      + '<i class="m-x2"></i><i class="m-x3"></i><i class="m-mark"></i></span>';
  }
  function applyOttoLook(root) {
    const look = readOttoLook();
    let planets = [];
    try { planets = (root || document).querySelectorAll('.m-planet'); } catch { return; }
    planets.forEach(function (el) {
      Array.prototype.slice.call(el.classList).forEach(function (c) { if (c.indexOf('sk-') === 0) el.classList.remove(c); });
      el.classList.add('sk-' + look.colour);
      if (el.hasAttribute('data-otto-live')) {
        el.classList.toggle('m-live', look.motion === 'living' && (parseFloat(el.style.width) || el.offsetWidth) >= 40);
      }
    });
  }
  window.__vibeOttoPlanet = planetHTML;
  window.__vibeOttoApplyLook = applyOttoLook;
  applyOttoLook(document);
  window.addEventListener('vibe:otto-look', function () { applyOttoLook(document); });
  window.addEventListener('storage', function (e) { if (!e || e.key === 'vibe_otto_look' || e.key === null) applyOttoLook(document); });

  // Suppress on Otto's own page or when no user exists.
  const path = (location.pathname || '').toLowerCase();
  if (
    path === "/otto" ||
    path.endsWith("/otto.html") ||
    path === "/" ||
    path.endsWith("/landing.html")
  )
    return;
  const user = (typeof vibeLoad === 'function') ? vibeLoad('vibe_user_v1') : null;
  if (!user) return;

  // ── Inject styles ──────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ottoPulseCore { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.15); opacity: 1; } }
    @keyframes ottoSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes ottoSynapse { 0%,100% { opacity: .15; } 50% { opacity: 1; } }
    @keyframes ottoPanelIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes ottoBackdropIn { from { opacity: 0; } to { opacity: 1; } }

    #ottoCorner {
      position: fixed; bottom: 24px; right: 24px; z-index: 9990;
      cursor: none;
    }
    /* Something unseen (Nov 11 2026, Wave 2B): the count, ink on the page
       colour, still, as the React corner's .otto-corner-count. His coral
       moon at the ring's raised end (the wait pose) is the one coral thing
       that says something waits. Hidden at 0; _ottoPaintCorner fills it
       from the notifications count plus unread chats (_miniMessenger.js). */
    #ottoCorner .otto-notif {
      position: absolute; top: -5px; right: -5px; z-index: 2;
      box-sizing: border-box; min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: 999px; border: 2px solid var(--cream, #FAF7F2);
      background: var(--charcoal, #1C1C1E); color: var(--cream, #FAF7F2);
      font: 800 10px/16px "DM Sans", sans-serif; letter-spacing: .02em;
      align-items: center; justify-content: center; pointer-events: none;
      display: none;
    }
    #ottoCorner.has-unread .otto-notif, #ottoCorner.has-chats .otto-notif { display: flex; }
    /* The computer's corner Otto: the board's 64px paper puck, the React
       corner's twin (src/components/network/otto-corner.css, OttoCorner.tsx).
       It follows the page's Light or Night, so Otto here wears the page's
       look; the moon's cut-out ring is the puck's paper. Live (the moon's
       16 s lap) when the look is Living; waiting (the ask bubble) puts the
       moon at the ring's raised end. */
    #ottoCorner .otto-shell {
      width: 64px; height: 64px; border-radius: 50%; box-sizing: border-box;
      background: var(--paper, #FFFFFF);
      border: 1px solid var(--hairline, var(--border, rgba(28,28,30,.08)));
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--card-shadow, var(--shadow, 0 4px 14px rgba(0,0,0,.08)));
      transition: box-shadow .3s ease;
    }
    #ottoCorner:hover .otto-shell {
      box-shadow: var(--card-shadow, var(--shadow, 0 4px 14px rgba(0,0,0,.08))), 0 12px 32px rgba(255,92,53,.22);
    }
    #ottoCorner .m-planet { --m-surface: var(--paper, #FFFFFF); }
    /* Every other Otto this file draws sits on dark chrome, so each wrapper
       is a .vibe-night-island (the kit's Night drawing in both looks) and
       the moon's cut-out ring is the surface behind him (--m-surface). */
    #ottoPanel .m-planet, #ottoPubPanel .m-planet { --m-surface: #141416; }
    #ottoAskBubble .m-planet, #ottoPubToast .m-planet { --m-surface: #1C1C1E; }

    #ottoBackdrop {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(20,20,22,.42);
      backdrop-filter: blur(2px);
      animation: ottoBackdropIn .22s ease-out;
    }

    #ottoPanel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 9999;
      width: 380px; max-width: 92vw;
      background: #141416; color: white;
      border-left: 0.5px solid rgba(255,92,53,.15);
      box-shadow: -16px 0 48px rgba(0,0,0,.4);
      display: flex; flex-direction: column;
      font-family: 'DM Sans', sans-serif;
      animation: ottoPanelIn .26s cubic-bezier(.2,.8,.2,1);
    }

    #ottoPanel .otto-panel-header {
      padding: 22px 22px 18px;
      border-bottom: 0.5px solid rgba(255,255,255,.06);
      position: relative; overflow: hidden; flex-shrink: 0;
    }
    #ottoPanel .otto-panel-header-bg {
      position: absolute; top: 0; right: 0; width: 220px; height: 100%; opacity: .35; pointer-events: none;
    }
    #ottoPanel .otto-panel-header-bg .otto-syn { animation: ottoSynapse 2s ease-in-out infinite; }
    #ottoPanel .otto-panel-header-bg .otto-syn.s2 { animation-delay: .3s; }
    #ottoPanel .otto-panel-header-bg .otto-syn.s3 { animation-delay: .6s; }
    #ottoPanel .otto-panel-header-bg .otto-syn.s4 { animation-delay: .9s; }
    #ottoPanel .otto-panel-header-bg .otto-syn.s5 { animation-delay: 1.2s; }
    #ottoPanel .otto-panel-header-row { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }
    #ottoPanel .otto-mini { position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #ottoPanel .otto-panel-name { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; color: white; letter-spacing: -.3px; line-height: 1; }
    #ottoPanel .otto-panel-sub { font-size: 10px; color: rgba(255,255,255,.42); letter-spacing: .8px; text-transform: uppercase; margin-top: 4px; font-weight: 500; }
    #ottoPanel .otto-panel-close {
      font-size: 22px; color: rgba(255,255,255,.45); cursor: none; line-height: 1;
      background: none; border: none; padding: 4px 8px; transition: color .15s;
    }
    #ottoPanel .otto-panel-close:hover { color: white; }

    #ottoPanel .otto-platform-pills { display: flex; gap: 6px; margin-top: 16px; position: relative; z-index: 1; flex-wrap: wrap; }
    #ottoPanel .otto-platform-pill { font-size: 10px; padding: 3px 10px; background: rgba(255,92,53,.12); color: #FF8B6B; border-radius: 100px; letter-spacing: .3px; font-weight: 500; }

    #ottoPanel .otto-panel-body { flex: 1; overflow-y: auto; padding: 20px 22px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
    #ottoPanel .otto-panel-body::-webkit-scrollbar { width: 6px; }
    #ottoPanel .otto-panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 3px; }

    #ottoPanel .otto-briefing {
      font-family: 'Fraunces', serif; font-style: italic;
      font-size: 14px; line-height: 1.6; color: rgba(255,255,255,.88);
      padding: 14px 16px;
      background: rgba(255,92,53,.06);
      border-left: 1.5px solid #FF5C35;
      border-radius: 0 8px 8px 0;
      margin-bottom: 20px;
    }

    #ottoPanel .otto-draft { border: 0.5px solid rgba(255,255,255,.08); border-radius: 10px; padding: 13px 15px; margin-bottom: 10px; background: rgba(255,255,255,.02); }
    #ottoPanel .otto-draft.recommended { border-color: rgba(255,92,53,.35); background: rgba(255,92,53,.05); }
    #ottoPanel .otto-draft.skip { border-color: rgba(255,255,255,.06); background: rgba(255,255,255,.01); opacity: .65; }
    #ottoPanel .otto-draft-meta { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; }
    #ottoPanel .otto-platform-square { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
    #ottoPanel .otto-draft-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.72); letter-spacing: .6px; }
    #ottoPanel .otto-draft-tag { margin-left: auto; font-size: 9px; padding: 2px 8px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 700; letter-spacing: .5px; }
    #ottoPanel .otto-draft-tag.skip { background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); font-weight: 500; }
    #ottoPanel .otto-draft-text { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.78); }
    #ottoPanel .otto-draft.skip .otto-draft-text { color: rgba(255,255,255,.5); }
    #ottoPanel .otto-draft-actions { display: flex; gap: 6px; margin-top: 11px; }
    #ottoPanel .otto-btn-primary { font-size: 11px; padding: 6px 14px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPanel .otto-btn-primary:hover { background: #ff7055; }
    #ottoPanel .otto-btn-ghost { font-size: 11px; padding: 6px 14px; border: 0.5px solid rgba(255,255,255,.18); color: rgba(255,255,255,.78); border-radius: 100px; cursor: none; background: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
    #ottoPanel .otto-btn-ghost:hover { border-color: rgba(255,255,255,.4); color: white; }

    #ottoPanel .otto-divider { height: 0.5px; background: rgba(255,255,255,.06); margin: 22px 0 16px; }
    #ottoPanel .otto-section-eyebrow { font-size: 10px; font-weight: 600; letter-spacing: 1.2px; color: rgba(255,255,255,.42); text-transform: uppercase; margin-bottom: 12px; }
    #ottoPanel .otto-activity { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.72); padding: 7px 0; display: flex; gap: 9px; }
    #ottoPanel .otto-activity-arrow { color: #FF5C35; font-weight: 600; flex-shrink: 0; }

    /* Stats summary at top of the activity section. */
    #ottoPanel .otto-stats-grid {
      display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:18px;
    }
    #ottoPanel .otto-stat-tile {
      background:rgba(255,255,255,.04); border:0.5px solid rgba(255,255,255,.06);
      border-radius:10px; padding:10px 8px; text-align:center;
      transition:background .15s, border-color .15s;
    }
    #ottoPanel .otto-stat-tile:hover {
      background:rgba(255,92,53,.06); border-color:rgba(255,92,53,.25);
      cursor:none;
    }
    #ottoPanel .otto-stat-num  { font-family:'Fraunces',serif; font-size:20px; font-weight:800; color:white; line-height:1; }
    #ottoPanel .otto-stat-label{ font-size:9.5px; font-weight:600; color:rgba(255,255,255,.55); letter-spacing:.6px; text-transform:uppercase; margin-top:4px; }

    /* "Your metrics" block — reuses the stats-grid layout, but adds a
       coral-accent variant for the profile-views tile and a deep-link
       footer that points to /otto's Stats tab. */
    #ottoPanel .otto-stat-tile--accent {
      background:rgba(255,92,53,.14);
      border-color:rgba(255,140,90,.45);
    }
    #ottoPanel .otto-stat-tile--accent .otto-stat-num { color:#FFB89C; }
    #ottoPanel .otto-metrics-foot {
      margin-top:8px; text-align:right;
    }
    #ottoPanel .otto-metrics-foot a {
      font-family:'DM Sans',sans-serif; font-size:11px; font-weight:600;
      color:rgba(255,180,150,.85); text-decoration:none;
      letter-spacing:.04em;
    }
    #ottoPanel .otto-metrics-foot a:hover { color:#FF5C35; }
    #ottoPanel .otto-metrics-fallback {
      font-family:'Fraunces',serif; font-style:italic; font-size:12px;
      color:rgba(255,255,255,.5); padding:8px 0;
    }

    /* Notification filter pills (P1-021). */
    #ottoPanel .otto-notif-filters {
      display:flex; gap:6px; margin:0 0 12px; flex-wrap:wrap;
    }
    #ottoPanel .otto-notif-filter {
      font-family:'DM Sans',sans-serif; font-size:11px; font-weight:600;
      padding:5px 11px; border-radius:100px;
      border:0.5px solid rgba(255,255,255,.12);
      background:transparent; color:rgba(255,255,255,.55);
      cursor:none; transition:all .15s; letter-spacing:.2px;
    }
    #ottoPanel .otto-notif-filter:hover { color:white; border-color:rgba(255,255,255,.28); }
    #ottoPanel .otto-notif-filter.on {
      background:#FF5C35; color:var(--on-coral, #160A06); border-color:#FF5C35;
    }

    /* Real notification rows (P1-021). */
    #ottoPanel .otto-notif-row {
      display:flex; gap:10px; padding:10px 0; align-items:flex-start;
      border-top:0.5px solid rgba(255,255,255,.05);
      cursor:none;
    }
    #ottoPanel .otto-notif-row:first-of-type { border-top:none; }
    #ottoPanel .otto-notif-row:hover { background:rgba(255,255,255,.02); }
    #ottoPanel .otto-notif-row.unread .otto-notif-actor::after {
      content:""; display:inline-block; width:6px; height:6px; border-radius:50%;
      background:#FF5C35; box-shadow:0 0 6px #FF5C35; margin-left:6px; vertical-align:middle;
    }
    #ottoPanel .otto-notif-av {
      width:34px; height:34px; border-radius:50%; flex-shrink:0;
      background:#1C1C1E; color:white; display:flex; align-items:center; justify-content:center;
      font-size:12px; font-weight:700; overflow:hidden;
    }
    #ottoPanel .otto-notif-av img { width:100%; height:100%; object-fit:cover; display:block; }
    #ottoPanel .otto-notif-body { flex:1; min-width:0; font-size:12.5px; line-height:1.5; }
    #ottoPanel .otto-notif-actor { color:white; font-weight:600; }
    #ottoPanel .otto-notif-text { color:rgba(255,255,255,.78); }
    #ottoPanel .otto-notif-snippet {
      color:rgba(255,255,255,.55); font-size:11.5px; margin-top:3px;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
    }
    #ottoPanel .otto-notif-time { color:rgba(255,255,255,.4); font-size:11px; margin-top:3px; font-weight:500; }
    #ottoPanel .otto-notif-empty {
      padding:24px 0; text-align:center;
      color:rgba(255,255,255,.5); font-size:12.5px; font-style:italic;
    }

    #ottoPanel .otto-panel-footer {
      padding: 14px 22px; border-top: 0.5px solid rgba(255,255,255,.06); flex-shrink: 0;
    }
    #ottoPanel .otto-open-full {
      display: block; width: 100%; padding: 10px;
      background: rgba(255,255,255,.04); border: 0.5px solid rgba(255,255,255,.1);
      border-radius: 100px; color: white; text-align: center;
      font-size: 12px; font-weight: 600; letter-spacing: .2px;
      text-decoration: none; cursor: none;
      transition: all .15s; font-family: 'DM Sans', sans-serif;
    }
    #ottoPanel .otto-open-full:hover { background: rgba(255,92,53,.15); border-color: rgba(255,92,53,.4); }

    /* ── POST-PUBLISH FLOW (mockup 06) ─────────────────────────────────── */
    @keyframes ottoBubbleIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ottoToastIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes ottoToastOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
    @keyframes ottoPubPanelIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    /* Frame 1 — post freshly published */
    .otto-just-posted { position: relative; box-shadow: inset 0 0 0 1.5px #FF5C35, 0 0 0 4px rgba(255,92,53,.08); border-radius: 12px; transition: box-shadow .35s; }
    .otto-posted-badge { position: absolute; top: -10px; left: 18px; font-size: 10px; padding: 4px 10px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(255,92,53,.3); z-index: 2; }
    .otto-syndicated-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; padding: 4px 10px; background: rgba(255,92,53,.1); color: var(--tag-ink, #B83A1A); border-radius: 100px; font-weight: 600; letter-spacing: .3px; margin-left: auto; flex-shrink: 0; }
    .otto-syndicated-dot { width: 5px; height: 5px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 4px #FF5C35; animation: ottoPulseCore 2.4s ease-in-out infinite; }

    /* Ask state: the corner Otto waits (his moon at the ring's raised end);
       no coral glow on the puck, the moon is the one coral thing. */

    /* Frame 2 — ask bubble */
    #ottoAskBubble { position: fixed; bottom: 92px; right: 24px; z-index: 9991; background: #1C1C1E; border-radius: 16px; padding: 14px 16px; max-width: 300px; box-shadow: 0 8px 28px rgba(0,0,0,.25); border: 0.5px solid rgba(255,92,53,.3); color: white; font-family: 'DM Sans', sans-serif; animation: ottoBubbleIn .25s cubic-bezier(.2,.8,.2,1); }
    #ottoAskBubble .oab-arrow { position: absolute; bottom: -6px; right: 22px; width: 12px; height: 12px; background: #1C1C1E; border-right: 0.5px solid rgba(255,92,53,.3); border-bottom: 0.5px solid rgba(255,92,53,.3); transform: rotate(45deg); }
    #ottoAskBubble .oab-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    #ottoAskBubble .oab-mini-otto { position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #ottoAskBubble .oab-name { font-family: 'Fraunces', serif; font-size: 12px; font-weight: 700; color: white; letter-spacing: -.2px; }
    #ottoAskBubble .oab-q { font-family: 'Fraunces', serif; font-style: italic; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.92); margin-bottom: 12px; }
    #ottoAskBubble .oab-platforms { display: flex; gap: 5px; margin-bottom: 12px; }
    #ottoAskBubble .oab-tile { width: 16px; height: 16px; border-radius: 4px; }
    #ottoAskBubble .oab-actions { display: flex; gap: 6px; align-items: center; }
    #ottoAskBubble .oab-yes { font-size: 11px; padding: 7px 14px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; flex: 1; transition: background .15s; }
    #ottoAskBubble .oab-yes:hover { background: #ff7055; }
    #ottoAskBubble .oab-skip { font-size: 11px; padding: 7px 14px; color: rgba(255,255,255,.55); border-radius: 100px; cursor: none; background: none; border: none; font-family: 'DM Sans', sans-serif; transition: color .15s; }
    #ottoAskBubble .oab-skip:hover { color: rgba(255,255,255,.85); }

    /* Frames 3 & 4 — publish panel (thinking + drafts) */
    #ottoPubBackdrop { position: fixed; inset: 0; z-index: 9996; background: rgba(20,20,22,.35); backdrop-filter: blur(2px); animation: ottoBackdropIn .22s ease-out; }
    #ottoPubPanel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 9997; width: 380px; max-width: 92vw; background: #141416; color: white; border-left: 0.5px solid rgba(255,92,53,.15); box-shadow: -16px 0 48px rgba(0,0,0,.4); display: flex; flex-direction: column; font-family: 'DM Sans', sans-serif; animation: ottoPubPanelIn .26s cubic-bezier(.2,.8,.2,1); }
    #ottoPubPanel .opp-header { padding: 22px 22px 18px; border-bottom: 0.5px solid rgba(255,255,255,.06); display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
    #ottoPubPanel .opp-mini { position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #ottoPubPanel .opp-name { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 700; color: white; letter-spacing: -.2px; line-height: 1; }
    #ottoPubPanel .opp-sub { font-size: 10px; color: #FF5C35; letter-spacing: .8px; text-transform: uppercase; margin-top: 4px; font-weight: 600; }
    #ottoPubPanel .opp-sub.muted { color: rgba(255,255,255,.42); font-weight: 500; }
    #ottoPubPanel .opp-close { font-size: 22px; color: rgba(255,255,255,.45); cursor: none; line-height: 1; background: none; border: none; padding: 4px 8px; transition: color .15s; }
    #ottoPubPanel .opp-close:hover { color: white; }
    #ottoPubPanel .opp-body { flex: 1; overflow-y: auto; padding: 22px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
    #ottoPubPanel .opp-body::-webkit-scrollbar { width: 6px; }
    #ottoPubPanel .opp-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 3px; }

    /* Thinking state */
    #ottoPubPanel .opp-thinking-quote { font-family: 'Fraunces', serif; font-style: italic; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,.88); text-align: center; margin: 16px 0 28px; padding: 0 8px; }
    #ottoPubPanel .opp-progress { display: flex; flex-direction: column; gap: 10px; }
    #ottoPubPanel .opp-pp-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
    #ottoPubPanel .opp-pp-tile { width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; }
    #ottoPubPanel .opp-pp-name { flex: 1; font-size: 12.5px; color: rgba(255,255,255,.8); font-weight: 500; }
    #ottoPubPanel .opp-pp-status { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: .3px; }
    #ottoPubPanel .opp-pp-status.ready { color: #2ECC71; }
    #ottoPubPanel .opp-pp-status.drafting { color: #FF5C35; }
    #ottoPubPanel .opp-pp-status.queued { color: rgba(255,255,255,.4); font-weight: 500; }
    #ottoPubPanel .opp-pp-row.queued { opacity: .5; }
    #ottoPubPanel .opp-pp-row.queued .opp-pp-name { color: rgba(255,255,255,.5); }
    #ottoPubPanel .opp-spinner { width: 12px; height: 12px; border: 1.5px solid rgba(255,92,53,.25); border-top-color: #FF5C35; border-radius: 50%; animation: ottoSpinSlow 0.7s linear infinite; }

    /* Drafts state */
    #ottoPubPanel .opp-briefing { font-family: 'Fraunces', serif; font-style: italic; font-size: 14px; line-height: 1.6; color: rgba(255,255,255,.88); padding: 14px 16px; background: rgba(255,92,53,.06); border-left: 1.5px solid #FF5C35; border-radius: 0 8px 8px 0; margin-bottom: 18px; }
    #ottoPubPanel .opp-draft { border: 0.5px solid rgba(255,255,255,.08); border-radius: 10px; padding: 13px 15px; margin-bottom: 10px; background: rgba(255,255,255,.02); transition: all .2s; }
    #ottoPubPanel .opp-draft.recommended { border-color: rgba(255,92,53,.35); background: rgba(255,92,53,.05); }
    #ottoPubPanel .opp-draft.skip { border-color: rgba(255,255,255,.06); background: rgba(255,255,255,.01); opacity: .65; }
    #ottoPubPanel .opp-draft.approved { border-color: rgba(46,204,113,.4); background: rgba(46,204,113,.06); }
    #ottoPubPanel .opp-draft-meta { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; }
    #ottoPubPanel .opp-platform-square { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
    #ottoPubPanel .opp-draft-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.72); letter-spacing: .6px; }
    #ottoPubPanel .opp-draft-tag { margin-left: auto; font-size: 9px; padding: 2px 8px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 700; letter-spacing: .5px; display: inline-flex; align-items: center; gap: 4px; }
    #ottoPubPanel .opp-draft-tag.skip { background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); font-weight: 500; }
    #ottoPubPanel .opp-draft-tag.approved { background: #2ECC71; }
    #ottoPubPanel .opp-draft-text { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.85); white-space: pre-wrap; word-wrap: break-word; }
    #ottoPubPanel .opp-draft.skip .opp-draft-text { color: rgba(255,255,255,.5); }
    #ottoPubPanel .opp-draft-edit { width: 100%; background: rgba(255,255,255,.04); border: 0.5px solid rgba(255,92,53,.4); border-radius: 8px; padding: 10px 12px; color: white; font-family: 'DM Sans', sans-serif; font-size: 12.5px; line-height: 1.6; resize: vertical; min-height: 90px; }
    #ottoPubPanel .opp-draft-edit:focus { outline: none; border-color: #FF5C35; }
    #ottoPubPanel .opp-draft-actions { display: flex; gap: 6px; margin-top: 11px; align-items: center; }
    #ottoPubPanel .opp-btn-primary { font-size: 11px; padding: 6px 14px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPubPanel .opp-btn-primary:hover { background: #ff7055; }
    #ottoPubPanel .opp-btn-ghost { font-size: 11px; padding: 6px 14px; border: 0.5px solid rgba(255,255,255,.18); color: rgba(255,255,255,.78); border-radius: 100px; cursor: none; background: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
    #ottoPubPanel .opp-btn-ghost:hover { border-color: rgba(255,255,255,.4); color: white; }
    #ottoPubPanel .opp-approved-flag { font-size: 11px; color: #2ECC71; font-weight: 600; display: flex; align-items: center; gap: 6px; }

    #ottoPubPanel .opp-footer { padding: 14px 22px; border-top: 0.5px solid rgba(255,255,255,.06); flex-shrink: 0; display: flex; gap: 8px; align-items: center; }
    #ottoPubPanel .opp-approve-all { flex: 1; padding: 11px; background: #FF5C35; color: var(--on-coral, #160A06); border-radius: 100px; font-size: 12.5px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPubPanel .opp-approve-all:hover { background: #ff7055; }
    #ottoPubPanel .opp-skip-all { padding: 11px 16px; color: rgba(255,255,255,.55); cursor: none; background: none; border: none; font-family: 'DM Sans', sans-serif; font-size: 12.5px; font-weight: 500; transition: color .15s; }
    #ottoPubPanel .opp-skip-all:hover { color: white; }

    /* Frame 5 — toast */
    #ottoPubToast { position: fixed; bottom: 92px; right: 24px; z-index: 9991; background: #1C1C1E; border-radius: 14px; padding: 12px 16px 12px 12px; max-width: 340px; box-shadow: 0 8px 28px rgba(0,0,0,.25); border: 0.5px solid rgba(46,204,113,.3); color: white; font-family: 'DM Sans', sans-serif; display: flex; align-items: center; gap: 10px; animation: ottoToastIn .25s cubic-bezier(.2,.8,.2,1); }
    #ottoPubToast.out { animation: ottoToastOut .3s forwards; }
    #ottoPubToast .opt-otto { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #ottoPubToast .opt-text { font-family: 'Fraunces', serif; font-style: italic; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.92); }
  `;
  document.head.appendChild(style);

  // ── The desk panel (Nov 11, 2026, the Otto build's Wave 2B) ─────────────
  // The twin of src/components/network/OttoSidePanel.tsx: a column at the
  // right that stops above the corner Otto. Nothing dims the page behind it
  // (Franky's call): no backdrop, the page stays readable and clickable.
  // Fluted glass (the kit's tx-flute) is the surface, ribs over a near-solid
  // page colour with NO backdrop-filter; every word sits on a paper card.
  // It follows the page's Light or Night through the page's own tokens.
  // OTTO_DESK=off (otto_desk false from /api/me/features) keeps the old
  // dark panel above, unchanged.
  const deskStyle = document.createElement('style');
  deskStyle.textContent = `
    @keyframes ottoDeskIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
    @keyframes ottoCornerPop { 0% { transform: scale(1); } 40% { transform: scale(1.08); } 100% { transform: scale(1); } }
    #ottoCorner.otto-pop .otto-shell { animation: ottoCornerPop 700ms var(--vibe-spring-pop, cubic-bezier(.34,1.56,.64,1)) 1; }
    #ottoCorner:focus-visible { outline: none; }
    #ottoCorner:focus-visible .otto-shell { outline: 2px solid var(--charcoal, #1C1C1E); outline-offset: 3px; }

    #ottoPanel.op-desk {
      top: 16px; right: 16px; bottom: 104px; width: 376px; max-width: calc(100vw - 32px);
      box-sizing: border-box; padding: 12px; gap: 10px; isolation: isolate;
      border-radius: 20px; border: 1px solid var(--hairline, rgba(28,28,30,.08));
      /* solid: with no blur, the page's words must not ghost through the ribs */
      background: var(--cream, #FAF7F2);
      color: var(--charcoal, #1C1C1E);
      box-shadow: var(--card-shadow, 0 4px 14px rgba(0,0,0,.08)), 0 18px 48px rgba(28,20,12,.18);
      animation: ottoDeskIn .32s var(--vibe-spring-soft, cubic-bezier(.22,1,.36,1));
      outline: none;
    }
    :root[data-theme="dark"] #ottoPanel.op-desk { box-shadow: var(--card-shadow), 0 18px 48px rgba(0,0,0,.55); }
    #ottoPanel.op-desk > .tx-flute {
      position: absolute; inset: 0; z-index: -1; display: block; pointer-events: none; border-radius: inherit;
      background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--charcoal, #1C1C1E) 10%, transparent) 0, transparent 4px, color-mix(in srgb, var(--charcoal, #1C1C1E) 5%, transparent) 11px, color-mix(in srgb, var(--charcoal, #1C1C1E) 10%, transparent) 12px);
    }
    :root[data-theme="dark"] #ottoPanel.op-desk > .tx-flute {
      background: repeating-linear-gradient(90deg, rgba(255,255,255,.13) 0, rgba(255,255,255,.02) 4px, rgba(0,0,0,.1) 11px, rgba(255,255,255,.13) 12px);
    }
    #ottoPanel.op-desk .m-planet { --m-surface: var(--paper, #FFFFFF); }
    #ottoPanel.op-desk a, #ottoPanel.op-desk button { cursor: none; font-family: 'DM Sans', sans-serif; }
    #ottoPanel.op-desk :is(a, button):focus-visible { outline: 2px solid var(--charcoal, #1C1C1E); outline-offset: 2px; }

    /* The React panel's parts (OttoSidePanel.tsx on the desk's dk- parts,
       src/components/otto/kit/desk.css), by hand: keep the two in step. */
    #ottoPanel.op-desk { --op-raise: #F2EFE9; --op-line-2: rgba(28,28,30,.15); }
    :root[data-theme="dark"] #ottoPanel.op-desk { --op-raise: #1F1D1C; --op-line-2: rgba(255,255,255,.16); }

    /* Paper: the header, each card, the section labels, the footer. */
    #ottoPanel.op-desk .op-paper {
      background: var(--paper, #FFFFFF); color: var(--charcoal, #1C1C1E);
      border: 1px solid var(--hairline, rgba(28,28,30,.08)); border-radius: 18px;
      box-shadow: var(--card-shadow, 0 4px 14px rgba(0,0,0,.08));
    }
    #ottoPanel.op-desk .otto-panel-header {
      flex: none; overflow: visible; padding: 10px 6px 12px 12px; border-radius: 16px;
      display: flex; align-items: flex-start; gap: 10px;
    }
    #ottoPanel.op-desk .op-mini { width: 28px; height: 28px; flex: none; display: flex; margin-top: 2px; }
    #ottoPanel.op-desk .op-head-tx { flex: 1; min-width: 0; }
    #ottoPanel.op-desk .otto-panel-name {
      margin: 0; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; letter-spacing: -.03em;
      line-height: 1.1; color: var(--charcoal, #1C1C1E);
    }
    #ottoPanel.op-desk .op-say {
      margin: 4px 0 0; font-family: 'Fraunces', serif; font-style: italic; font-weight: 400; letter-spacing: -.005em;
      font-size: 15px; line-height: 1.35; color: var(--ink-2, #5C5853);
    }
    #ottoPanel.op-desk .otto-panel-close {
      width: 44px; height: 44px; flex: none; margin-top: -6px; padding: 0; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; color: var(--ink-2, #5C5853);
    }
    #ottoPanel.op-desk .otto-panel-close svg { width: 18px; height: 18px; }
    #ottoPanel.op-desk .otto-panel-close:hover { color: var(--charcoal, #1C1C1E); background: var(--op-raise); }
    #ottoPanel.op-desk .op-as { margin: 6px 0 0; font-size: 13px; line-height: 1.3; color: var(--ink-2, #5C5853); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #ottoPanel.op-desk .op-as[hidden] { display: none; }
    #ottoPanel.op-desk .op-as b { color: var(--charcoal, #1C1C1E); font-weight: 700; }

    #ottoPanel.op-desk .otto-panel-body {
      flex: 1; min-height: 0; padding: 0 4px 2px; margin: 0 -4px; display: flex; flex-direction: column; gap: 10px;
      overscroll-behavior: contain;
      scrollbar-color: color-mix(in srgb, var(--charcoal, #1C1C1E) 22%, transparent) transparent;
    }
    #ottoPanel.op-desk .otto-panel-body > * { flex: none; }
    #ottoPanel.op-desk .otto-panel-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--charcoal, #1C1C1E) 22%, transparent); }
    #ottoPanel.op-desk .op-card { padding: 14px 16px; }
    /* A section's label is its own paper tab on the glass. */
    #ottoPanel.op-desk .op-sec {
      width: fit-content; max-width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 8px;
      padding: 6px 8px 6px 12px; border-radius: 999px; background: var(--paper, #FFFFFF); border: 1px solid var(--hairline, rgba(28,28,30,.08));
    }
    #ottoPanel.op-desk .op-sec h3 { margin: 0; font-size: 14px; font-weight: 700; line-height: 1.2; letter-spacing: -.005em; color: var(--charcoal, #1C1C1E); }
    #ottoPanel.op-desk .op-sec b {
      min-width: 22px; height: 22px; box-sizing: border-box; padding: 0 7px; border-radius: 999px; background: var(--op-raise);
      color: var(--ink-2, #5C5853); font-size: 12px; font-weight: 700; line-height: 22px; font-variant-numeric: tabular-nums; text-align: center;
    }
    #ottoPanel.op-desk .op-pile { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    #ottoPanel.op-desk .op-pile > * { flex: none; }
    #ottoPanel.op-desk .op-empty { padding: 16px 18px; }
    #ottoPanel.op-desk .op-empty p {
      margin: 0; font-family: 'Fraunces', serif; font-style: italic; font-size: 17px; line-height: 1.4; color: var(--ink-2, #5C5853);
    }
    #ottoPanel.op-desk .op-loading { padding: 16px 18px; }
    #ottoPanel.op-desk .op-loading p { margin: 0; font-size: 16px; line-height: 1.4; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-ico { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    #ottoPanel.op-desk .op-ic {
      width: 40px; height: 40px; flex: none; border-radius: 12px; background: var(--op-raise); color: var(--ink-2, #5C5853);
      display: flex; align-items: center; justify-content: center;
    }

    /* Ready on blueprint (dk-draft): the top item opens (its tag, title,
       "What will happen", its verb); the next folds to one row (.mini). */
    #ottoPanel.op-desk .op-draft {
      position: relative; isolation: isolate; overflow: hidden; background: var(--paper, #FFFFFF);
      border: 1px dashed var(--op-line-2); border-radius: 18px; box-shadow: var(--card-shadow, none);
      padding: 12px; display: flex; flex-direction: column; gap: 8px; color: var(--charcoal, #1C1C1E);
    }
    #ottoPanel.op-desk .op-draft::before, #ottoPanel.op-desk .op-draft::after {
      content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      --op-grid: color-mix(in srgb, var(--charcoal, #1C1C1E) 9%, transparent);
      background: linear-gradient(var(--op-grid) 1px, transparent 1px) 0 0/96px 96px, linear-gradient(90deg, var(--op-grid) 1px, transparent 1px) 0 0/96px 96px;
    }
    #ottoPanel.op-desk .op-draft::after {
      inset: -24px; --op-grid: color-mix(in srgb, var(--charcoal, #1C1C1E) 4%, transparent);
      background: linear-gradient(var(--op-grid) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, var(--op-grid) 1px, transparent 1px) 0 0/24px 24px;
    }
    /* the grid stops above the button row */
    #ottoPanel.op-desk .op-draft:not(.mini)::before, #ottoPanel.op-desk .op-draft:not(.mini)::after {
      -webkit-mask-image: linear-gradient(#000 calc(100% - 168px), transparent calc(100% - 112px));
      mask-image: linear-gradient(#000 calc(100% - 168px), transparent calc(100% - 112px));
    }
    #ottoPanel.op-desk .op-draft-as { display: flex; }
    #ottoPanel.op-desk .op-draft-as em {
      font-size: 12px; font-weight: 700; font-style: normal; line-height: 1; letter-spacing: .06em; text-transform: uppercase;
      color: var(--ink-2, #5C5853); padding: 5px 8px; border: 1px dashed var(--op-line-2); border-radius: 999px; background: var(--paper, #FFFFFF);
    }
    #ottoPanel.op-desk .op-draft-pre { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; background: var(--op-raise); }
    #ottoPanel.op-desk .op-draft-pre > div { min-width: 0; }
    #ottoPanel.op-desk .op-draft-pre h3 { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.25; color: var(--charcoal, #1C1C1E); overflow-wrap: anywhere; }
    #ottoPanel.op-desk .op-draft-pre p { margin: 2px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-date {
      width: 46px; height: 50px; flex: none; box-sizing: border-box; border-radius: 12px; background: var(--paper, #FFFFFF);
      border: 1px solid var(--hairline, rgba(28,28,30,.08)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    }
    #ottoPanel.op-desk .op-date i { font-size: 12px; font-weight: 700; font-style: normal; line-height: 1; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-date b { font-size: 20px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; color: var(--charcoal, #1C1C1E); }
    #ottoPanel.op-desk .op-what h4 { margin: 0 0 6px; font-size: 12px; font-weight: 700; line-height: 1; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-what ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; }
    #ottoPanel.op-desk .op-what li { display: grid; grid-template-columns: 34px 1fr; gap: 8px; font-size: 15px; line-height: 1.35; color: var(--charcoal, #1C1C1E); }
    #ottoPanel.op-desk .op-what li b { font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
    #ottoPanel.op-desk .op-what li.plain { grid-template-columns: 1fr; padding-left: 42px; }
    #ottoPanel.op-desk .op-go { display: flex; gap: 8px; }
    #ottoPanel.op-desk .op-foot { margin: 4px 0 0; font-size: 13px; line-height: 1.35; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-draft.mini { padding: 2px 8px 2px 12px; }
    #ottoPanel.op-desk .op-draft.mini .op-row { min-height: 60px; gap: 10px; }
    #ottoPanel.op-desk .op-draft.mini .op-btn { padding: 0 14px; }

    /* A row (dk-row): icon square, two lines, then a quiet button. */
    #ottoPanel.op-desk .op-list { padding: 2px 6px 2px 14px; }
    #ottoPanel.op-desk .op-row {
      display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px 0; box-sizing: border-box;
      color: var(--charcoal, #1C1C1E); text-decoration: none;
    }
    #ottoPanel.op-desk .op-row + .op-row { border-top: 1px solid var(--hairline, rgba(28,28,30,.08)); }
    #ottoPanel.op-desk .op-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    #ottoPanel.op-desk .op-tx b {
      font-size: 16px; font-weight: 600; line-height: 1.25; color: var(--charcoal, #1C1C1E);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ottoPanel.op-desk .op-tx span {
      font-size: 14px; line-height: 1.3; color: var(--ink-2, #5C5853); font-variant-numeric: tabular-nums;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ottoPanel.op-desk .op-btn {
      height: 44px; box-sizing: border-box; padding: 0 18px; border-radius: 999px;
      border: 1px solid var(--op-line-2); background: transparent;
      color: var(--charcoal, #1C1C1E); font-size: 14px; font-weight: 600; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; text-decoration: none; flex: none;
      transition: transform .32s var(--vibe-spring-soft, ease);
    }
    #ottoPanel.op-desk .op-btn:active { transform: scale(.97); }
    #ottoPanel.op-desk .op-btn:disabled { opacity: .6; transform: none; }
    /* The frame's one coral fill: the top Ready item's verb (plus his moon). */
    #ottoPanel.op-desk .op-btn.primary { flex: 1; background: #FF5C35; border-color: #FF5C35; color: var(--on-coral, #160A06); font-weight: 700; }

    /* Otto saw: quiet rows, tell only. Each row: its own link stretched under it, the person's name lifted above
       as their profile link (ink, never coral), and a quiet × that clears it (polish 1; OttoSidePanel.tsx SawRow). */
    #ottoPanel.op-desk .op-saw-card { padding: 2px 6px 2px 14px; }
    #ottoPanel.op-desk .op-saw {
      position: relative; display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 11px 0;
      font-size: 14px; line-height: 1.35; color: var(--charcoal, #1C1C1E); text-decoration: none;
    }
    #ottoPanel.op-desk .op-saw + .op-saw { border-top: 1px solid var(--hairline, rgba(28,28,30,.08)); }
    #ottoPanel.op-desk .op-saw > .op-ico { width: 18px; height: 18px; margin-top: 1px; color: var(--ink-muted, #6C6761); }
    #ottoPanel.op-desk .op-cover { position: absolute; inset: 0; z-index: 0; border-radius: 8px; }
    #ottoPanel.op-desk .op-cover:hover ~ .op-saw-tx .op-saw-t { text-decoration: underline; text-underline-offset: 2px; }
    #ottoPanel.op-desk .op-saw-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
    #ottoPanel.op-desk .op-saw-sub { font-size: 13px; color: var(--ink-2, #5C5853); font-variant-numeric: tabular-nums; }
    #ottoPanel.op-desk .op-name {
      position: relative; z-index: 1; color: inherit; text-decoration: none; border-radius: 4px; padding: 0 2px; margin: 0 -2px;
      transition: background-color .15s ease, color .15s ease;
    }
    #ottoPanel.op-desk .op-name:hover, #ottoPanel.op-desk .op-name:focus-visible {
      color: var(--charcoal, #1C1C1E); text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 3px;
      background: color-mix(in srgb, var(--charcoal, #1C1C1E) 9%, transparent);
    }
    #ottoPanel.op-desk .op-saw-x {
      position: relative; z-index: 1; flex: none; width: 44px; height: 44px; margin: -11px -2px -11px 0; padding: 0; border: 0;
      background: none; color: var(--ink-muted, #6C6761); display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .15s, color .15s;
    }
    #ottoPanel.op-desk .op-saw-x::before { content: ""; position: absolute; left: 8px; top: 8px; width: 28px; height: 28px; border-radius: 50%; transition: background-color .15s; }
    #ottoPanel.op-desk .op-saw-x svg { position: relative; width: 16px; height: 16px; }
    #ottoPanel.op-desk .op-saw:hover .op-saw-x, #ottoPanel.op-desk .op-saw:focus-within .op-saw-x { opacity: 1; }
    #ottoPanel.op-desk .op-saw-x:hover { color: var(--charcoal, #1C1C1E); }
    #ottoPanel.op-desk .op-saw-x:hover::before { background: var(--op-raise); }
    #ottoPanel.op-desk .op-saw-x:focus-visible { outline: none; }
    #ottoPanel.op-desk .op-saw-x:focus-visible::before { outline: 2px solid var(--charcoal, #1C1C1E); outline-offset: 1px; }
    @media (hover: none) { #ottoPanel.op-desk .op-saw-x { opacity: 1; } }
    #ottoPanel.op-desk .op-saw-foot { display: flex; justify-content: flex-end; border-top: 1px solid var(--hairline, rgba(28,28,30,.08)); margin-right: -6px; }
    #ottoPanel.op-desk .op-saw-all {
      min-height: 44px; padding: 0 12px; border: 0; border-radius: 12px; background: none;
      color: var(--ink-2, #5C5853); font-size: 13px; font-weight: 600;
    }
    #ottoPanel.op-desk .op-saw-all:hover { color: var(--charcoal, #1C1C1E); background: var(--op-raise); }
    /* "Cleared. Undo" in the panel, above the way on (the desk's dk-toast, by hand); empty, it takes no room. */
    #ottoPanel.op-desk .op-toast-slot { flex: none; display: flex; }
    #ottoPanel.op-desk .op-toast-slot:empty { margin-top: -10px; }
    #ottoPanel.op-desk .op-toast {
      flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 48px; box-sizing: border-box;
      padding: 2px 6px 2px 18px; border-radius: 999px; background: var(--charcoal, #1C1C1E); color: var(--cream, #FAF7F2);
      font-size: 15px; font-weight: 500; line-height: 1.3; box-shadow: 0 10px 30px rgba(0,0,0,.22);
    }
    #ottoPanel.op-desk .op-toast > span { padding: 12px 12px 12px 0; }
    #ottoPanel.op-desk .op-toast-undo {
      min-height: 44px; padding: 0 14px; border: 0; border-radius: 999px; background: none; color: var(--cream, #FAF7F2);
      font-size: 15px; font-weight: 700; line-height: 1; text-decoration: underline; text-underline-offset: 3px;
    }
    #ottoPanel.op-desk .op-toast-undo:hover { background: color-mix(in srgb, var(--cream, #FAF7F2) 14%, transparent); }
    #ottoPanel.op-desk .op-toast-undo:focus-visible { outline: 2px solid var(--cream, #FAF7F2); outline-offset: -3px; }
    #ottoPanel.op-desk .op-note { margin: 0; padding: 10px 14px; font-size: 13px; line-height: 1.4; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-fail {
      display: flex; flex-direction: column; gap: 10px;
      border-color: color-mix(in srgb, var(--error-ink, #C0392B) 46%, var(--hairline, rgba(28,28,30,.08)));
    }
    #ottoPanel.op-desk .op-fail p { margin: 0; font-size: 15px; line-height: 1.4; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-fail b { color: var(--charcoal, #1C1C1E); font-weight: 700; }

    /* The two ways on: the desk and its Stats. */
    #ottoPanel.op-desk .otto-panel-footer { flex: none; padding: 4px; border-radius: 16px; display: flex; gap: 4px; }
    #ottoPanel.op-desk .op-link-sub { font-size: 12px; font-weight: 500; color: var(--ink-2, #5C5853); }
    #ottoPanel.op-desk .op-link-sub:empty { display: none; }
    #ottoPanel.op-desk .op-link {
      flex: 1; min-width: 0; min-height: 48px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
      font-size: 14px; font-weight: 600; color: var(--charcoal, #1C1C1E); text-decoration: none; text-align: center; padding: 0 8px;
    }
    #ottoPanel.op-desk .op-link:hover { background: var(--op-raise); }

    /* Otto | Messages (the row _miniMessenger.js adds): the board's paper
       pill, 44px tabs, the picked one raised with an ink underline, a quiet
       count. The Messages tab's contents are the frame, as before. */
    #ottoPanel.op-desk .vmm-tabs {
      padding: 4px; gap: 4px; border-radius: 999px; border: 1px solid var(--hairline, rgba(28,28,30,.08));
      background: var(--paper, #FFFFFF); box-shadow: var(--card-shadow, none);
    }
    #ottoPanel.op-desk .vmm-tabs > span { display: none; }
    #ottoPanel.op-desk .vmm-tab {
      flex: 1; height: 44px; position: relative; justify-content: center; border: 0; border-radius: 999px;
      background: none; color: var(--ink-2, #5C5853); font-size: 14px; font-weight: 500;
    }
    #ottoPanel.op-desk .vmm-tab[aria-selected="true"] {
      background: var(--op-raise); color: var(--charcoal, #1C1C1E); font-weight: 700;
    }
    #ottoPanel.op-desk .vmm-tab[aria-selected="true"]::after {
      content: ""; position: absolute; left: 50%; bottom: 5px; width: 20px; height: 2px; margin-left: -10px; border-radius: 2px; background: var(--charcoal, #1C1C1E);
    }
    #ottoPanel.op-desk .vmm-tab .vmm-tab-ic { display: block; width: 18px; height: 18px; }
    #ottoPanel.op-desk .vmm-tab-n { min-width: 20px; height: 20px; padding: 0 6px; font-size: 12px; font-weight: 700; background: var(--op-raise); color: var(--ink-2, #5C5853); font-variant-numeric: tabular-nums; }
    #ottoPanel.op-desk .vmm-tab[aria-selected="true"] .vmm-tab-n { background: var(--paper, #FFFFFF); }
    /* The frame's two controls: small quiet icons (visually 32px), each a 44px target (polish 1). */
    #ottoPanel.op-desk .vmm-tab-new, #ottoPanel.op-desk .vmm-tab-open {
      width: 44px; height: 44px; flex: none; position: relative; margin: 0; padding: 0; border: 0; border-radius: 0;
      background: none; color: var(--ink-muted, #6C6761); display: flex; align-items: center; justify-content: center;
    }
    #ottoPanel.op-desk .vmm-tab-new { margin-left: -2px; }
    #ottoPanel.op-desk .vmm-tab-open { margin-right: -4px; }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open)::before {
      content: ""; position: absolute; left: 6px; top: 6px; width: 32px; height: 32px; border-radius: 50%; background: transparent; transition: background-color .15s;
    }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open) svg { position: relative; width: 16px; height: 16px; }
    #ottoPanel.op-desk .vmm-open-ic { display: block; }
    #ottoPanel.op-desk .vmm-open-tx { display: none; }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open):hover { color: var(--charcoal, #1C1C1E); }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open):hover::before { background: var(--op-raise); }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open):focus-visible { outline: none; }
    #ottoPanel.op-desk :is(.vmm-tab-new, .vmm-tab-open):focus-visible::before { outline: 2px solid var(--charcoal, #1C1C1E); outline-offset: 1px; }
    #ottoPanel.op-desk .vmm-frame { flex: 1; border-radius: 16px; border: 1px solid var(--hairline, rgba(28,28,30,.08)); background: var(--cream, #FAF7F2); }

    @media (prefers-reduced-motion: reduce) {
      #ottoPanel.op-desk, #ottoCorner.otto-pop .otto-shell { animation: none; }
      #ottoPanel.op-desk .op-btn, #ottoPanel.op-desk .op-name, #ottoPanel.op-desk .op-saw-x, #ottoPanel.op-desk .op-saw-x::before { transition: none; }
    }
  `;
  document.head.appendChild(deskStyle);

  // ── Inject corner ring ─────────────────────────────────────────────────
  const corner = document.createElement('button');
  corner.id = 'ottoCorner';
  corner.type = 'button';
  corner.setAttribute('aria-label', 'Open Otto');
  corner.setAttribute('aria-expanded', 'false');
  corner.style.cssText = 'background:none;border:none;padding:0;';
  corner.innerHTML = `
    <div class="otto-notif" aria-hidden="true"></div>
    <div class="otto-shell">${planetHTML(46, { live: true })}</div>
  `;
  // The same button opens the panel and closes it (the panel stops above it).
  corner.onclick = function () {
    if (panel && panel.style.display !== 'none') closeOttoPanel();
    else openOttoPanel();
  };
  document.body.appendChild(corner);

  // ── The corner's state (Wave 2B): the React corner's twin ───────────────
  // Something unseen (Otto's news, from the 30 s count poll, plus unread
  // chats, from _miniMessenger.js) shows the count in ink and puts Otto in
  // his wait pose: his coral moon parked at the ring's raised end. The count
  // ticking up pops the puck once (still under reduced motion).
  let _ottoUnreadN = 0;
  let _ottoChatsN = 0;
  let _ottoShownN = 0;
  let _ottoPublishWait = false;   // the post-publish ask bubble is up
  const _ottoBornAt = Date.now();
  function _ottoPaintCorner() {
    const total = _ottoUnreadN + _ottoChatsN;
    const open = !!(panel && panel.style.display !== 'none');
    corner.classList.toggle('has-unread', _ottoUnreadN > 0);
    corner.classList.toggle('has-chats', _ottoChatsN > 0);
    const n = corner.querySelector('.otto-notif');
    if (n) n.textContent = total > 9 ? '9+' : (total > 0 ? String(total) : '');
    const planet = corner.querySelector('.m-planet');
    if (planet) planet.classList.toggle('wait', total > 0 || _ottoPublishWait);
    corner.setAttribute('aria-expanded', String(open));
    // Points at the panel only while it shows, as the React corner does.
    if (open) corner.setAttribute('aria-controls', 'ottoPanel');
    else corner.removeAttribute('aria-controls');
    corner.setAttribute('aria-label', open ? 'Close Otto'
      : total > 0 ? 'Open Otto · ' + _ottoUnreadN + ' new' + (_ottoChatsN > 0 ? ', ' + _ottoChatsN + ' unread ' + (_ottoChatsN === 1 ? 'chat' : 'chats') : '')
      : 'Open Otto');
    // Not on the cold load (something already unseen when the page opens).
    if (total > _ottoShownN && Date.now() - _ottoBornAt > 5000) {
      corner.classList.remove('otto-pop');
      void corner.offsetWidth;
      corner.classList.add('otto-pop');
      setTimeout(() => corner.classList.remove('otto-pop'), 720);
    }
    _ottoShownN = total;
  }
  // _miniMessenger.js tells the corner how many chats are unread (0 when
  // Messages isn't a tab of this panel).
  window.__ottoSetChats = function (n) {
    _ottoChatsN = Math.max(0, Number(n) || 0);
    _ottoPaintCorner();
  };

  // ── Build panel HTML (lazy — only when first opened) ───────────────────
  let panel = null;
  let backdrop = null;
  let _ottoDeskMode = false;     // the panel built is the desk panel (Wave 2B)

  // The off switch (Wave 2B): OTTO_DESK=off answers otto_desk: false from
  // /api/me/features, and the panel keeps the old dark layout. It's an off
  // button, so the desk panel shows unless the answer says false (a failed
  // read, or a route from before the field, is "on").
  let _ottoDeskFlag = null;      // null until the answer is in
  let _ottoDeskFlagAsk = null;
  function _ottoLearnDeskFlag() {
    if (_ottoDeskFlagAsk) return _ottoDeskFlagAsk;
    const ask = fetch('/api/me/features', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => !(j && j.ok === true && j.otto_desk === false))
      .catch(() => true);
    // A hung read still counts as on: the panel never waits on it for long.
    const wait = new Promise(res => setTimeout(() => res(true), 4000));
    _ottoDeskFlagAsk = Promise.race([ask, wait])
      .then(on => { _ottoDeskFlag = on; _ottoDropStalePanel(); return on; });
    return _ottoDeskFlagAsk;
  }
  // A panel built before the answer came in, of the other kind, is dropped
  // once it's closed: the next open builds the right one.
  function _ottoDropStalePanel() {
    if (!panel || _ottoDeskFlag === null || _ottoDeskMode === _ottoDeskFlag) return;
    if (panel.style.display !== 'none') return;
    panel.remove(); panel = null;
    if (backdrop) { backdrop.remove(); backdrop = null; }
  }
  // Asked up front where the corner shows (not on /messages, where it's
  // hidden and the panel never opens); an open before the answer waits for it.
  if (_isAppShellUser() && getComputedStyle(corner).display !== 'none') _ottoLearnDeskFlag();

  function buildPanel() {
    _ottoDeskMode = _ottoDeskFlag !== false;
    if (_ottoDeskMode) buildDeskPanel();
    else buildLegacyPanel();
  }

  // The desk panel: header, then (from _miniMessenger.js) the Otto |
  // Messages tabs, the mini desk, and the two ways on. Non-modal: no
  // backdrop, no focus trap; Escape or the corner closes it.
  function buildDeskPanel() {
    backdrop = null;
    panel = document.createElement('aside');
    panel.id = 'ottoPanel';
    panel.className = 'op-desk';
    panel.setAttribute('aria-labelledby', 'ottoPanelName');
    panel.tabIndex = -1;
    // The footer is a <div role="navigation">, not a <nav>: the static pages
    // style every <nav> as their fixed top bar (profile.html), which pulled
    // the two links to the top of the page (walk fix, Nov 11).
    panel.innerHTML = `
      <i class="tx tx-flute" aria-hidden="true"></i>
      <div class="otto-panel-header op-paper">
        <span class="op-mini">${planetHTML(28)}</span>
        <div class="op-head-tx">
          <h2 class="otto-panel-name" id="ottoPanelName">otto</h2>
          <p class="op-say" id="ottoSay"></p>
          <p class="op-as" id="ottoAs" hidden></p>
        </div>
        <button type="button" class="otto-panel-close" aria-label="Close Otto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="otto-panel-body"></div>
      <div class="op-toast-slot" role="status" aria-live="polite"></div>
      <div class="otto-panel-footer op-paper" role="navigation" aria-label="Otto's desk">
        <a class="op-link" data-op-link="desk" href="/otto" target="_top"><span>Open your desk →</span><span class="op-link-sub" id="ottoDeskMore"></span></a>
        <a class="op-link" data-op-link="stats" href="/otto?tab=stats" target="_top"><span>Full breakdown →</span></a>
      </div>
    `;
    panel.querySelector('.otto-panel-close').onclick = closeOttoPanel;
    document.body.appendChild(panel);
    bindCursorOn(panel);
  }

  // Today's dark panel, unchanged: OTTO_DESK=off brings it back.
  function buildLegacyPanel() {
    backdrop = document.createElement('div');
    backdrop.id = 'ottoBackdrop';
    backdrop.onclick = closeOttoPanel;

    panel = document.createElement('aside');
    panel.id = 'ottoPanel';
    panel.innerHTML = `
      <div class="otto-panel-header">
        <svg class="otto-panel-header-bg" viewBox="0 0 220 110">
          <line class="otto-syn"    x1="22" y1="22" x2="88" y2="55"  stroke="#FF5C35" stroke-width="0.5"/>
          <line class="otto-syn s2" x1="88" y1="55" x2="176" y2="33" stroke="#FF5C35" stroke-width="0.5"/>
          <line class="otto-syn s3" x1="88" y1="55" x2="198" y2="77" stroke="#FF5C35" stroke-width="0.5"/>
          <line class="otto-syn s4" x1="22" y1="88" x2="88" y2="55"  stroke="#FF5C35" stroke-width="0.5"/>
          <line class="otto-syn s5" x1="176" y1="33" x2="198" y2="77" stroke="#FF5C35" stroke-width="0.5"/>
          <circle cx="22"  cy="22" r="2" fill="#FF5C35" class="otto-syn"/>
          <circle cx="88"  cy="55" r="3" fill="#FF5C35"/>
          <circle cx="176" cy="33" r="2" fill="#FF5C35" class="otto-syn s2"/>
          <circle cx="198" cy="77" r="2" fill="#FF5C35" class="otto-syn s3"/>
          <circle cx="22"  cy="88" r="2" fill="#FF5C35" class="otto-syn s4"/>
        </svg>
        <div class="otto-panel-header-row">
          <div class="otto-mini vibe-night-island">${planetHTML(42)}</div>
          <div style="flex:1;">
            <div class="otto-panel-name">otto</div>
            <div class="otto-panel-sub">your agent · online</div>
          </div>
          <button class="otto-panel-close" aria-label="Close">×</button>
        </div>
        <!-- Platform pills (LinkedIn / IG / X / TikTok) removed alongside
             the drafts UI — no purpose without the cross-posting feature. -->

      </div>

      <div class="otto-panel-body"></div>

      <div class="otto-panel-footer">
        <a href="/otto" class="otto-open-full">Open Otto's command center →</a>
      </div>
    `;

    panel.querySelector('.otto-panel-close').onclick = closeOttoPanel;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    // Re-bind cursor hover for the newly-added interactive elements (pages
    // with a custom cursor toggle hover state on a/button/etc. via listeners
    // bound at page-load time — those didn't see these new elements).
    const cur  = document.getElementById('cursor');
    const ring = document.getElementById('cursorRing');
    if (cur && ring) {
      panel.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('mouseenter', () => { cur.classList.add('hover'); ring.classList.add('hover'); });
        el.addEventListener('mouseleave', () => { cur.classList.remove('hover'); ring.classList.remove('hover'); });
      });
      corner.addEventListener('mouseenter', () => { cur.classList.add('hover'); ring.classList.add('hover'); });
      corner.addEventListener('mouseleave', () => { cur.classList.remove('hover'); ring.classList.remove('hover'); });
    }
  }

  // Exposed on window so other surfaces (profile hero, etc.) can open
  // the panel without poking at file-internal closures.
  window.__ottoOpenPanel = openOttoPanel;
  function openOttoPanel() {
    // The first open waits for the off switch's answer, so OTTO_DESK=off
    // never flashes the desk panel (or its "didn't load") on its way out.
    if (_ottoDeskFlag === null && !panel && _isAppShellUser()) {
      _ottoLearnDeskFlag().then(() => { if (!panel || panel.style.display === 'none') openOttoPanel(); });
      return;
    }
    // An Otto open for the use totals (_usageTouch.js; rules in
    // src/lib/usage/touch.ts), unless the panel is opening on its Messages
    // tab (a "Message" button, or the tab it was left on: _miniMessenger.js).
    if (typeof window.__vibeCountOpen === 'function' && !(typeof window.__vibeOttoTab === 'function' && window.__vibeOttoTab() === 'messages')) window.__vibeCountOpen('otto');
    if (!panel) buildPanel();
    else {
      if (backdrop) backdrop.style.display = '';
      panel.style.display = '';
    }
    renderPanelBody();
    _ottoPaintCorner();
    // Messages is a tab of this panel on pages that load _miniMessenger.js:
    // it hears the panel open and close.
    document.dispatchEvent(new CustomEvent('vibe:otto-panel', { detail: { open: true } }));
    if (_ottoDeskMode) {
      // Non-modal: focus moves in (Escape or the corner brings it back),
      // and the page behind stays usable.
      try { panel.focus({ preventScroll: true }); } catch {}
      if (_isAppShellUser()) {
        // A desk that failed last time opens on "opening…" again, not on the old failure.
        if (!_ottoDesk && _ottoDeskSettled) { _ottoDeskSettled = false; _ottoRenderDesk(); }
        _ottoLoadDesk();
        if (!_ottoLastCount) _ottoFetchUnreadCount().then(_ottoSetUnread).catch(() => {});
      }
      return;
    }
    // Pull real notifications + mark them read after the user has seen
    // them. A failure says so in the activity section itself instead of
    // leaving "loading…" or claiming nothing has happened yet.
    if (_isAppShellUser()) {
      _ottoLoadNotifications();
      // Metrics block — profile views + creator stats, rendered alongside
      // the notification load. Either half can be missing on its own and
      // the grid still renders; both gone is a real failure and says so.
      _ottoLoadMetrics();
      // The count poll's first fetch runs 1.5s after page load, before this
      // panel exists, so a failure then had nowhere to paint. Without this
      // the briefing sits at "loading your activity…" until a later 30s tick
      // happens to fail too.
      if (!_ottoLastCount) _ottoFetchUnreadCount().then(_ottoSetUnread).catch(() => {});
    }
  }

  // Re-renders the side-panel body (briefing + drafts + activity placeholder).
  // The activity section is replaced with real notifications by
  // _ottoRenderNotifications once the API responds; until then it shows
  // a small "loading" line so the section isn't empty mid-fetch.
  function renderPanelBody() {
    if (!panel) return;
    const body = panel.querySelector('.otto-panel-body');
    if (!body) return;
    if (_ottoDeskMode) { _ottoRenderDesk(); return; }
    body.innerHTML = `
      <div class="otto-briefing" id="ottoBriefing">"loading your activity…"</div>
      <div class="otto-stats-grid" id="ottoStatsGrid">
        ${_ottoStatTileHTML('follow',     0, 'Follows')}
        ${_ottoStatTileHTML('connection', 0, 'Connections')}
        ${_ottoStatTileHTML('like',       0, 'Likes')}
        ${_ottoStatTileHTML('comment',    0, 'Comments')}
      </div>
      <div class="otto-divider"></div>
      <div class="otto-section-eyebrow">your metrics</div>
      <div class="otto-stats-grid" id="ottoMetricsGrid">
        <div class="otto-metrics-fallback" id="ottoMetricsFallback">loading metrics…</div>
      </div>
      <div class="otto-metrics-foot"><a href="/otto?tab=stats">full breakdown in /otto →</a></div>
      <div class="otto-divider"></div>
      <div class="otto-section-eyebrow">activity</div>
      <div class="otto-notif-filters">
        <button class="otto-notif-filter on" data-notif-filter="all">All</button>
        <button class="otto-notif-filter" data-notif-filter="follow">Follows</button>
        <button class="otto-notif-filter" data-notif-filter="connection">Connections</button>
        <button class="otto-notif-filter" data-notif-filter="like">Likes</button>
        <button class="otto-notif-filter" data-notif-filter="comment">Comments</button>
      </div>
      <div class="otto-notif-list" id="ottoNotifList">
        <div class="otto-notif-empty">loading…</div>
      </div>
    `;
    bindCursorOn(body);
    // Repaint stats from the cached count if we have one — feels instant
    // when the panel opens twice in a row.
    if (_ottoLastCount) _ottoApplyStats(_ottoLastCount);
    // Wire filter pill clicks — re-render list from cache, no refetch.
    body.querySelectorAll('.otto-notif-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.otto-notif-filter').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        _ottoActiveFilter = btn.dataset.notifFilter || 'all';
        _ottoRenderNotifications(_ottoLastList);
      });
    });
    // Stat tiles double as filter shortcuts — clicking "Likes" jumps
    // to the Likes filter pill state and re-renders.
    body.querySelectorAll('.otto-stat-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const t = tile.dataset.statType;
        if (!t) return;
        body.querySelectorAll('.otto-notif-filter').forEach(b => {
          b.classList.toggle('on', b.dataset.notifFilter === t);
        });
        _ottoActiveFilter = t;
        _ottoRenderNotifications(_ottoLastList);
      });
    });
  }

  function _ottoStatTileHTML(type, n, label) {
    return `<div class="otto-stat-tile" data-stat-type="${type}">
      <div class="otto-stat-num" data-stat-num="${type}">${n}</div>
      <div class="otto-stat-label">${label}</div>
    </div>`;
  }

  function _ottoApplyStats(count) {
    if (!panel) return;
    const t = (count && count.totals) || {};
    const map = { follow: 'Follows', connection: 'Connections', like: 'Likes', comment: 'Comments' };
    Object.keys(map).forEach(k => {
      const el = panel.querySelector(`[data-stat-num="${k}"]`);
      if (el) el.textContent = String(t[k] || 0);
    });
    const briefing = panel.querySelector('#ottoBriefing');
    if (briefing) briefing.textContent = '"' + _ottoBriefingLine(count) + '"';
  }

  function _ottoBriefingLine(count) {
    const total = (count.totals.follow || 0) + (count.totals.connection || 0)
                + (count.totals.like || 0)   + (count.totals.comment || 0);
    if (total === 0)        return "quiet around here. go say hi to someone.";
    if (count.unread > 0)   return count.unread + ' new since you last looked.';
    return "all caught up — here's what's been happening.";
  }

  // ── The mini desk (Wave 2B) ─────────────────────────────────────────
  // The twin of OttoSidePanel.tsx's MiniDesk and src/lib/otto/panel-desk.ts:
  // the desk's model from /api/me/otto (`desk`, src/lib/otto/desk.ts), the
  // top 2 Ready items (only ready[0]'s verb is the coral one, `primary`;
  // reminders are plain rows with a quiet Done), a few "Otto saw" rows, then
  // the whole desk and its Stats. Same honesty as the desk: every line is
  // the model's, and nothing here says Otto did, sent or will send anything.
  // It acts as the desk's own pick on this device (vibe.otto-desk-as.v1),
  // else the club switch's (vibe.profile-as-club.v1); there's no switcher.
  const OTTO_PANEL_READY = 2;
  const OTTO_PANEL_SAW = 3;
  const OTTO_PART_FAILED = "Part of this couldn't load, so it may be missing something.";
  let _ottoDesk = null;          // the last desk model that loaded
  let _ottoDeskMissing = [];     // the route's `failed` for that desk
  let _ottoDeskSettled = false;  // a load has answered (desk or not)
  let _ottoDeskSeq = 0;
  let _ottoDeskBusy = null;      // the item id whose Accept or Done is in flight

  function _ottoClubParam(raw) {
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return /^[a-z0-9_.-]{1,64}$/.test(v) ? v : null;
  }
  function _ottoSavedClub() {
    let deskAs = null, switched = null;
    try { deskAs = localStorage.getItem('vibe.otto-desk-as.v1'); } catch {}
    try {
      const raw = JSON.parse(localStorage.getItem('vibe.profile-as-club.v1') || 'null');
      switched = raw && typeof raw.handle === 'string' ? raw.handle : null;
    } catch {}
    return _ottoClubParam(deskAs) || _ottoClubParam(switched);
  }

  async function _ottoLoadDesk() {
    const n = ++_ottoDeskSeq;
    const club = _ottoSavedClub();
    const r = await window.vibeRequest('/api/me/otto' + (club ? '?club=' + encodeURIComponent(club) : ''), {
      failure: "Couldn't load your desk.", quiet: true,
    });
    if (n !== _ottoDeskSeq) return;
    _ottoDeskSettled = true;
    if (r.ok && r.data && r.data.ok && r.data.desk && typeof r.data.desk === 'object') {
      _ottoDesk = r.data.desk;
      _ottoDeskMissing = Array.isArray(r.data.failed) ? r.data.failed : [];
      _ottoRenderDesk();
      // "Otto saw" is the notifications: shown, so read (as the old panel).
      if (_ottoUnreadN > 0 || (_ottoLastCount && _ottoLastCount.unread > 0)) _ottoMarkAllRead();
      return;
    }
    // A failed refresh keeps the desk already on screen.
    if (!_ottoDesk) _ottoRenderDesk();
  }

  function _ottoDeskLine(item) {
    return [item.detail, item.whenLabel].filter(Boolean).join(' · ');
  }
  function _ottoHref(h) {
    // Same-site paths only: "//host" and "/\host" both leave the site.
    return typeof h === 'string' && h.startsWith('/') && h[1] !== '/' && h[1] !== '\\' ? h : null;
  }
  function _ottoTx(item) {
    const line = _ottoDeskLine(item);
    return `<span class="op-tx"><b>${_ottoEsc(item.title)}</b>${line ? `<span>${_ottoEsc(line)}</span>` : ''}</span>`;
  }

  // The verb as a button: a link, or Accept (the existing approve route).
  // Coral only when the model marks it `primary` (ready[0]).
  function _ottoVerbHTML(item, primary, short) {
    const v = item.verb;
    if (!v) return '';
    const cls = 'op-btn' + (primary ? ' primary' : '');
    const label = _ottoEsc(v.label + ': ' + item.title);
    if (v.kind === 'link') {
      const href = _ottoHref(v.href);
      return href ? `<a class="${cls}" href="${_ottoEsc(href)}" target="_top" aria-label="${label}">${_ottoEsc(short ? 'Open' : v.label)}</a>` : '';
    }
    if (v.kind === 'join_request') {
      const busy = _ottoDeskBusy === item.id;
      return `<button type="button" class="${cls}" data-op-accept="${_ottoEsc(item.id)}" aria-label="${label}"${busy ? ' disabled aria-busy="true"' : ''}>${_ottoEsc(v.label)}</button>`;
    }
    return '';
  }

  // The desk's kind icons (DeskIcon in src/components/otto/desk/DeskRow.tsx), by hand.
  const OTTO_ICONS = {
    join_request: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5M18.5 8v6M15.5 11h6"/>',
    up_next: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    setup_step: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.3 2.3 4.7-4.9"/>',
    draft: '<path d="M4 10v4h3l7 4.5v-13L7 10zM17.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    follow_back: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.4-3.9 4.3-5.8 7.5-5.8s6.1 1.9 7.5 5.8"/>',
    unread_dm: '<path d="M4.5 5.5h15v10.5H10l-5.5 4.5z"/>',
    reminder: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    event: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    rsvp: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    post: '<path d="M4 10v4h3l7 4.5v-13L7 10zM17.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    checkin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    cancelled: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    notification: '<path d="M2.5 12c2.4-4.2 5.6-6.3 9.5-6.3s7.1 2.1 9.5 6.3c-2.4 4.2-5.6 6.3-9.5 6.3S4.9 16.2 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  };
  function _ottoIco(kind) {
    const paths = Object.prototype.hasOwnProperty.call(OTTO_ICONS, kind) ? OTTO_ICONS[kind] : OTTO_ICONS.notification;
    return `<svg class="op-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
  }
  // DeskDraft's small tag over the top item, and the kinds whose date is an event's date.
  const OTTO_TAG = { join_request: 'Request', up_next: 'Up next', setup_step: 'Setup', draft: 'Draft', follow_back: 'Follower', unread_dm: 'Message', reminder: 'Reminder' };
  const OTTO_EVENT_DATED = { up_next: 1, event: 1, rsvp: 1 };
  function _ottoDateTile(iso) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms)) return '';
    try {
      const tz = 'America/Indiana/Indianapolis';
      const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(ms);
      const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(ms);
      return `<span class="op-date" aria-hidden="true"><i>${_ottoEsc(month)}</i><b>${_ottoEsc(day)}</b></span>`;
    } catch { return ''; }
  }
  function _ottoRowHTML(item, end) {
    return `<div class="op-row"><span class="op-ic">${_ottoIco(item.kind)}</span>${_ottoTx(item)}${end || ''}</div>`;
  }

  // One Ready item, as the React panel draws it: the top one opens on
  // blueprint (its tag, title, "What will happen", its verb); the next folds
  // to one row on blueprint; a reminder is a plain row with a quiet Done
  // (nothing delivers reminders yet).
  function _ottoReadyHTML(item, i) {
    if (item.kind === 'reminder') {
      const busy = _ottoDeskBusy === item.id;
      const done = `<button type="button" class="op-btn" data-op-done="${_ottoEsc(item.id)}" aria-label="${_ottoEsc('Done: ' + item.title)}"${busy ? ' disabled aria-busy="true"' : ''}>Done</button>`;
      return `<div class="op-paper op-list">${_ottoRowHTML(item, done)}</div>`;
    }
    const href = _ottoHref(item.href);
    const openLink = href && !(item.verb && item.verb.kind === 'link' && item.verb.href === item.href)
      ? `<a class="op-btn" href="${_ottoEsc(href)}" target="_top" aria-label="${_ottoEsc('Open: ' + item.title)}">Open</a>` : '';
    if (i > 0) {
      const go = item.verb ? _ottoVerbHTML(item, false, true) : openLink;
      return `<article class="op-draft mini" aria-label="${_ottoEsc(item.title)}">${_ottoRowHTML(item, go)}</article>`;
    }
    const tag = OTTO_TAG[item.kind] ? `<div class="op-draft-as"><em>${OTTO_TAG[item.kind]}</em></div>` : '';
    const tile = OTTO_EVENT_DATED[item.kind] ? _ottoDateTile(item.whenISO) : '';
    const lines = (Array.isArray(item.willHappen) ? item.willHappen : []).filter(l => typeof l === 'string' && l.trim());
    // "What will happen" says it once: a request with lines drops its detail.
    const detail = item.kind === 'join_request' && lines.length ? '' : (item.detail || '');
    const sub = [item.whenLabel, detail].filter(Boolean).map(_ottoEsc).join('<br>');
    const pre = `<div class="op-draft-pre">${tile || `<span class="op-ic">${_ottoIco(item.kind)}</span>`}<div><h3>${_ottoEsc(item.title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
    const what = lines.length
      ? `<div class="op-what"><h4>What will happen</h4><ul>${lines.map(l => {
          const m = /^(\d[\d,]*)\s+(.+)$/.exec(l.trim());
          return m ? `<li><b>${_ottoEsc(m[1])}</b><span>${_ottoEsc(m[2])}</span></li>` : `<li class="plain"><span>${_ottoEsc(l)}</span></li>`;
        }).join('')}</ul></div>` : '';
    const verb = _ottoVerbHTML(item, item.primary === true, false);
    const go = verb || openLink ? `<div class="op-go">${verb}${openLink}</div>` : '';
    const foot = item.verb && item.verb.kind === 'join_request' ? '<p class="op-foot">Nothing changes until you tap Accept.</p>' : '';
    return `<article class="op-draft" aria-label="${_ottoEsc(item.title)}">${tag}${pre}${what}${go}${foot}</article>`;
  }

  // The title with the person's name as their profile link (DeskTitle in
  // src/components/otto/desk/DeskName.tsx): the first time the name shows.
  function _ottoTitleHTML(item) {
    const a = item.actor;
    const href = a && typeof a.name === 'string' && a.name ? _ottoHref(a.href) : null;
    const at = href ? String(item.title).indexOf(a.name) : -1;
    if (at < 0) return _ottoEsc(item.title);
    const t = String(item.title);
    return _ottoEsc(t.slice(0, at))
      + `<a class="op-name" href="${_ottoEsc(href)}" target="_top" aria-label="${_ottoEsc(a.name)}'s profile">${_ottoEsc(a.name)}</a>`
      + _ottoEsc(t.slice(at + a.name.length));
  }

  // One Otto saw row (SawRow in OttoSidePanel.tsx): the row's own link
  // stretched under it, the name lifted above it, and a quiet × that clears it.
  function _ottoSawHTML(item) {
    const href = _ottoHref(item.href);
    const sub = [item.detail, item.whenLabel].filter(Boolean).map(_ottoEsc).join(' · ');
    const cover = href ? `<a class="op-cover" href="${_ottoEsc(href)}" target="_top" aria-label="${_ottoEsc(item.title)}"></a>` : '';
    const x = `<button type="button" class="op-saw-x" data-op-clear="${_ottoEsc(item.id)}" aria-label="Clear: ${_ottoEsc(item.title)}" title="Clear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg></button>`;
    return `<div class="op-saw">${cover}${_ottoIco(item.kind)}<span class="op-saw-tx"><span class="op-saw-t">${_ottoTitleHTML(item)}</span>${sub ? `<span class="op-saw-sub">${sub}</span>` : ''}</span>${x}</div>`;
  }

  // Clear with Undo (polish 1): the rows go at once and "Cleared. Undo" shows
  // in the panel for 5 s; only then are they deleted (DELETE
  // /api/me/notifications, the person's own rows only). One batch, as
  // createUndoClear in src/lib/otto/clear-notifications.ts: each clear joins
  // it and restarts the window, the line counts ("Cleared 2."), and Undo puts
  // back the whole batch (review, Nov 11: one hold per × lost its Undo).
  // Clear all sends { all, before: the newest row loaded }, never a row that
  // came after the panel loaded. Undo or a failed delete puts them back.
  // Leaving the page inside the window deletes them then.
  const OTTO_UNDO_MS = 5000;
  const _ottoHidden = new Set();      // desk ids cleared here
  let _ottoBatch = null;              // { rows, picked, before, timer }
  let _ottoOwedFail = false;          // a delete failed while a newer batch waited
  let _ottoToastT = 0;
  function _ottoNewestISO(items) {
    let best = -Infinity, out = null;
    (items || []).forEach(it => {
      const at = it && it.whenISO ? Date.parse(it.whenISO) : NaN;
      if (Number.isFinite(at) && at > best) { best = at; out = new Date(at).toISOString(); }
    });
    return out;
  }
  function _ottoToast(kind) {
    const slot = panel && panel.querySelector('.op-toast-slot');
    clearTimeout(_ottoToastT);
    if (kind === 'failed') _ottoOwedFail = false;
    if (!slot) return;
    if (!kind) { slot.innerHTML = ''; return; }
    if (kind === 'failed') {
      slot.innerHTML = '<div class="op-toast"><span>That didn’t clear. It’s back on your list.</span></div>';
      _ottoToastT = setTimeout(() => { slot.innerHTML = ''; }, OTTO_UNDO_MS);
      return;
    }
    const b = _ottoBatch;
    const n = b ? b.rows.size : 0;
    const line = b && b.before ? 'Cleared all.' : n > 1 ? 'Cleared ' + n.toLocaleString('en-US') + '.' : 'Cleared.';
    slot.innerHTML = `<div class="op-toast"><span>${line}</span><button type="button" class="op-toast-undo">Undo</button></div>`;
    const undo = slot.querySelector('.op-toast-undo');
    undo.addEventListener('click', _ottoUndo);
    bindCursorOn(slot);
    // The × pressed went away with its row: Undo is the next stop.
    requestAnimationFrame(() => {
      const at = document.activeElement;
      if (undo.isConnected && (!at || at === document.body || !at.isConnected)) undo.focus({ preventScroll: true });
    });
  }
  function _ottoCloseCleared() { _ottoToast(_ottoOwedFail ? 'failed' : null); }
  function _ottoSend(body, leaving) {
    if (leaving) {
      try {
        fetch('/api/me/notifications', { method: 'DELETE', credentials: 'same-origin', keepalive: true,
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      } catch (_) { /* the page is going */ }
      return Promise.resolve(true);
    }
    return window.vibeRequest('/api/me/notifications', { method: 'DELETE', json: body, quiet: true, failure: "Couldn't clear that." })
      .then(r => !!(r && r.ok));
  }
  function _ottoCommit(leaving) {
    const b = _ottoBatch;
    _ottoBatch = null;
    if (!b) return;
    clearTimeout(b.timer);
    _ottoCloseCleared();
    const bodies = [];
    if (b.before) bodies.push({ all: true, before: b.before });
    if (b.picked.size) bodies.push({ ids: [...b.picked] });
    Promise.all(bodies.map(x => _ottoSend(x, leaving))).then(oks => {
      if (oks.every(Boolean)) return;
      b.rows.forEach(id => _ottoHidden.delete(id));
      _ottoRenderDesk();
      if (_ottoBatch) _ottoOwedFail = true; else _ottoToast('failed');
    });
  }
  // rows = the desk ids to hide now; before = a Clear all's cutoff (else they are cleared one by one).
  function _ottoClearHold(rows, before) {
    const fresh = rows.filter(id => !_ottoHidden.has(id));
    if (!fresh.length && !before) return;
    const b = _ottoBatch || (_ottoBatch = { rows: new Set(), picked: new Set(), before: null, timer: 0 });
    fresh.forEach(id => {
      b.rows.add(id);
      _ottoHidden.add(id);
      if (!before && String(id).startsWith('notification:')) b.picked.add(_ottoNoticeId(id));
    });
    if (before && !(b.before && Date.parse(b.before) > Date.parse(before))) b.before = before;
    _ottoRenderDesk();
    clearTimeout(b.timer);
    b.timer = setTimeout(() => _ottoCommit(false), OTTO_UNDO_MS);
    _ottoToast('cleared');
  }
  function _ottoUndo() {
    const b = _ottoBatch;
    _ottoBatch = null;
    if (b) {
      clearTimeout(b.timer);
      b.rows.forEach(id => _ottoHidden.delete(id));
      _ottoRenderDesk();
    }
    _ottoCloseCleared();
  }
  window.addEventListener('pagehide', () => _ottoCommit(true));
  function _ottoNoticeId(id) {
    return String(id).startsWith('notification:') ? String(id).slice('notification:'.length) : String(id);
  }

  // A section: its label on a paper tab, then the pile.
  function _ottoSecHTML(id, title, count, inner) {
    return `<section aria-labelledby="${id}"><div class="op-sec"><h3 id="${id}">${title}</h3><b>${count}</b></div><div class="op-pile">${inner}</div></section>`;
  }
  function _ottoNoteHTML(text) { return `<p class="op-paper op-note">${_ottoEsc(text)}</p>`; }
  function _ottoEmptyHTML(line) { return `<div class="op-paper op-empty"><p>${_ottoEsc(line)}</p></div>`; }

  // The two ways on keep the club the panel shows (panelLinks).
  function _ottoPaintLinks(d) {
    if (!panel) return;
    const club = d && d.actingAs ? _ottoClubParam(d.actingAs.handle)
      : d && Array.isArray(d.clubs) && d.clubs.length > 0 ? 'me' : null;
    const q = club ? 'club=' + encodeURIComponent(club) : '';
    const deskA = panel.querySelector('[data-op-link="desk"]');
    const statsA = panel.querySelector('[data-op-link="stats"]');
    if (deskA) deskA.href = q ? '/otto?' + q : '/otto';
    if (statsA) statsA.href = q ? '/otto?tab=stats&' + q : '/otto?tab=stats';
    const more = panel.querySelector('#ottoDeskMore');
    const n = d && Array.isArray(d.ready) ? Math.max(0, d.ready.length - OTTO_PANEL_READY) : 0;
    if (more) more.textContent = n > 0 ? (n === 1 ? '1 more on your desk' : n.toLocaleString('en-US') + ' more on your desk') : '';
  }

  function _ottoRenderDesk() {
    if (!panel || !_ottoDeskMode) return;
    const body = panel.querySelector('.otto-panel-body');
    if (!body) return;
    const d = _ottoDesk;
    const say = panel.querySelector('#ottoSay');
    const as = panel.querySelector('#ottoAs');
    if (say) say.textContent = d ? String(d.say || '') : _ottoDeskSettled ? "couldn't load your desk. try again in a sec." : 'opening your desk…';
    if (as) {
      as.innerHTML = d && d.actingAs && d.actingAs.name ? 'Acting as <b>' + _ottoEsc(d.actingAs.name) + '</b>' : '';
      as.hidden = !as.innerHTML;
    }
    _ottoPaintLinks(d);
    if (!d) {
      body.innerHTML = _ottoDeskSettled
        ? `<div class="op-paper op-card op-fail" role="alert"><p><b>Your desk didn’t load.</b> Everything on it is still where it was.</p>
            <div class="op-go"><button type="button" class="op-btn" data-op-retry>Try again</button></div></div>`
        : '<div class="op-paper op-loading"><p role="status">Opening your desk…</p></div>';
      const retry = body.querySelector('[data-op-retry]');
      if (retry) retry.addEventListener('click', () => { retry.disabled = true; _ottoLoadDesk(); });
      bindCursorOn(body);
      return;
    }
    const empty = d.empty || {};
    const ready = Array.isArray(d.ready) ? d.ready : [];
    const saw = (Array.isArray(d.saw) ? d.saw : []).filter(it => !_ottoHidden.has(it.id));
    const missing = new Set(_ottoDeskMissing);
    const readyPartial = d.role === 'student' && (missing.has('asking') || missing.has('dms'));
    const sawFailed = missing.has('activity');
    const shown = ready.slice(0, OTTO_PANEL_READY);
    const readyHTML = (shown.length ? shown.map(_ottoReadyHTML).join('')
      : readyPartial ? '' : _ottoEmptyHTML(empty.ready || 'nothing needs you right now.'))
      + (readyPartial ? _ottoNoteHTML(OTTO_PART_FAILED) : '');
    const shownSaw = saw.slice(0, OTTO_PANEL_SAW);
    const sawHTML = (shownSaw.length ? `<div class="op-paper op-saw-card">${shownSaw.map(_ottoSawHTML).join('')}<div class="op-saw-foot"><button type="button" class="op-saw-all" data-op-clear-all>Clear all</button></div></div>`
      : sawFailed ? '' : _ottoEmptyHTML(empty.saw || 'quiet so far.'))
      + (sawFailed ? _ottoNoteHTML(shownSaw.length ? OTTO_PART_FAILED : "What Otto saw didn't load. Try again in a bit.") : '');
    body.innerHTML = _ottoSecHTML('opReadyH', 'Ready for you', ready.length, readyHTML)
      + _ottoSecHTML('opSawH', 'Otto saw', saw.length, sawHTML);
    bindCursorOn(body);
    body.querySelectorAll('[data-op-accept]').forEach(btn => {
      btn.addEventListener('click', () => _ottoAccept(btn.getAttribute('data-op-accept')));
    });
    body.querySelectorAll('[data-op-done]').forEach(btn => {
      btn.addEventListener('click', () => _ottoReminderDone(btn.getAttribute('data-op-done')));
    });
    body.querySelectorAll('[data-op-clear]').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-op-clear');
        _ottoClearHold([id], null);
        // From the keyboard, focus moves on to the row now in its place (or the panel), not to the page.
        if (e.detail === 0) {
          const xs = panel.querySelectorAll('.op-saw-x');
          (xs[Math.min(i, xs.length - 1)] || panel).focus({ preventScroll: true });
        }
      });
    });
    const all = body.querySelector('[data-op-clear-all]');
    if (all) all.addEventListener('click', () => {
      // Everything up to the newest row loaded; with no times, just the rows shown, one by one.
      const before = _ottoNewestISO(d.saw);
      _ottoClearHold(saw.map(it => it.id), before);
    });
  }

  // Accept a join request through the route Club tools uses; the desk is
  // read again afterwards, so "member N" stays the server's count.
  async function _ottoAccept(id) {
    const item = _ottoDesk && (_ottoDesk.ready || []).find(x => x.id === id);
    const v = item && item.verb;
    if (!v || v.kind !== 'join_request' || _ottoDeskBusy) return;
    _ottoDeskBusy = id;
    _ottoRenderDesk();
    const r = await window.vibeRequest(
      '/api/orgs/' + encodeURIComponent(v.orgSlug) + '/requests/' + encodeURIComponent(v.requestId),
      { method: 'POST', json: { action: 'approve' }, failure: "Couldn't accept that request." },
    );
    _ottoDeskBusy = null;
    if (r.ok) window.vibeToast("Accepted. They're a member now.");
    _ottoRenderDesk();
    _ottoLoadDesk();
  }

  // A reminder's Done: the route the desk uses, then the desk again.
  async function _ottoReminderDone(id) {
    const rid = typeof id === 'string' && id.startsWith('reminder:') ? id.slice('reminder:'.length) : null;
    if (!rid || _ottoDeskBusy) return;
    _ottoDeskBusy = id;
    _ottoRenderDesk();
    await window.vibeRequest('/api/me/otto/reminders/' + encodeURIComponent(rid) + '/act', {
      method: 'POST', failure: "Couldn't mark that reminder done.",
    });
    _ottoDeskBusy = null;
    _ottoRenderDesk();
    _ottoLoadDesk();
  }

  // ── Notifications wiring (P1-021) ──────────────────────────────────
  // Cache the last fetched list so filter clicks don't refetch — they
  // just re-render the existing array through _ottoActiveFilter.
  let _ottoLastList = [];
  let _ottoNotifFailed = false;  // the last activity load failed
  let _ottoLastCount = null;     // { unread, totals: {...} }
  let _ottoActiveFilter = 'all';
  // Surfaces (profile hero, etc.) that want to repaint when the count
  // changes register a callback here. Otto pushes to all subscribers
  // after each successful poll.
  const _ottoCountSubs = new Set();
  window.__ottoSubscribeCount = function (cb) {
    if (typeof cb !== 'function') return () => {};
    _ottoCountSubs.add(cb);
    if (_ottoLastCount) { try { cb(_ottoLastCount); } catch {} }
    return () => _ottoCountSubs.delete(cb);
  };

  function _isAppShellUser() {
    if (typeof vibeLoad !== 'function') return false;
    const u = vibeLoad('vibe_user_v1');
    return Boolean(u && u._appShell);
  }

  // One failed Otto section says so where its rows would go, instead of
  // reading as "nothing has happened yet". The panel is dark glass and each
  // section is a narrow column, so: dark + compact.
  function _ottoSectionFailed(sel, r, line, onRetry) {
    if (!panel) return;
    const el = panel.querySelector(sel);
    if (!el) return;
    window.vibeLoadFailed(el, window.vibeLoadFailure(r, line), onRetry,
      { tone: 'dark', compact: true });
  }

  async function _ottoFetchNotifications() {
    // Quiet: the activity section carries the line, not a toast.
    const line = "Couldn't load your activity.";
    const r = await window.vibeRequest('/api/me/notifications?limit=30', {
      failure: line, quiet: true,
    });
    if (r.ok && r.data.ok && Array.isArray(r.data.notifications)) {
      _ottoNotifFailed = false;
      return r.data.notifications;
    }
    _ottoNotifFailed = true;
    _ottoSectionFailed('#ottoNotifList', r, line, _ottoLoadNotifications);
    return null;
  }

  function _ottoLoadNotifications() {
    return _ottoFetchNotifications().then(list => {
      if (!list) return;            // the section already says it failed
      _ottoRenderNotifications(list);
      // The badge's count can hold unread rows the list leaves out (an
      // invite or an approval for a club hidden since); mark-read {all}
      // clears those too, so an unread count is reason enough.
      const countUnread = _ottoLastCount ? _ottoLastCount.unread : 0;
      if (list.some(n => !n.read_at) || countUnread > 0) _ottoMarkAllRead();
    }).catch(() => {});
  }

  // Fetch profile-views + creator-stats in parallel. Either half can be
  // missing on its own and the grid still renders what it has; only both
  // failing replaces the grid with the reason.
  async function _ottoFetchMetrics() {
    const line = "Couldn't load your metrics.";
    const [pvr, csr] = await Promise.all([
      window.vibeRequest('/api/me/profile-views', { failure: line, quiet: true }),
      window.vibeRequest('/api/me/creator-stats', { failure: line, quiet: true }),
    ]);
    const pv = (pvr.ok && pvr.data.ok) ? pvr.data : null;
    const cs = (csr.ok && csr.data.ok) ? csr.data : null;
    if (!pv && !cs) {
      _ottoSectionFailed('#ottoMetricsGrid', pvr.ok ? csr : pvr, line, _ottoLoadMetrics);
      return null;
    }
    // The failed half's result rides along so the grid can say which half
    // refused, instead of painting its tiles as 0.
    return { pv, cs, pvr, csr };
  }

  function _ottoLoadMetrics() {
    return _ottoFetchMetrics().then(_ottoRenderMetrics).catch(() => {});
  }

  function _ottoFormatN(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(n / 1000) + 'k';
  }

  function _ottoRenderMetrics(data) {
    if (!panel) return;
    const grid = panel.querySelector('#ottoMetricsGrid');
    if (!grid) return;
    // Both halves failed: _ottoFetchMetrics already put the reason, and a
    // Retry, in the grid. Painting "not available yet" over it would turn a
    // failed load back into a shrug.
    if (!data) return;
    // One half failed: its tiles are NOT painted as 0 — a refused read is not
    // a zero. The half that loaded renders, and the failed half says so in
    // the same grid with its own Retry.
    const tiles = [];
    if (data.pv) {
      const pvc = data.pv.counts || {};
      tiles.push({ n: pvc.thirty_days || 0, label: 'Profile views (30d)', accent: true });
    }
    if (data.cs) {
      const cst = data.cs.totals || {};
      tiles.push(
        { n: cst.views || 0,   label: 'Post views' },
        { n: cst.likes || 0,   label: 'Likes' },
        { n: cst.reposts || 0, label: 'Reposts' },
      );
    }
    grid.innerHTML = tiles.map(t => (
      '<div class="otto-stat-tile' + (t.accent ? ' otto-stat-tile--accent' : '') + '">' +
        '<div class="otto-stat-num">' + _ottoFormatN(t.n) + '</div>' +
        '<div class="otto-stat-label">' + t.label + '</div>' +
      '</div>'
    )).join('');
    if (!data.pv || !data.cs) {
      const box = document.createElement('div');
      grid.appendChild(box);
      const failed = data.pv ? data.csr : data.pvr;
      const half = data.pv ? "Couldn't load your post stats." : "Couldn't load your profile views.";
      window.vibeLoadFailed(box, window.vibeLoadFailure(failed, half), _ottoLoadMetrics,
        { tone: 'dark', compact: true });
    }
  }

  async function _ottoFetchUnreadCount() {
    // Quiet: this polls every 30s in the background. A failure with a count
    // already cached keeps that count; with none, the briefing line — which
    // otherwise sits at "loading your activity…" forever — says so.
    const line = "Couldn't load your activity.";
    const r = await window.vibeRequest('/api/me/notifications/count', {
      failure: line, quiet: true,
    });
    const j = r.ok ? r.data : null;
    if (!j || !j.ok) {
      if (!_ottoLastCount) {
        _ottoSectionFailed('#ottoBriefing', r, line, () => {
          _ottoFetchUnreadCount().then(_ottoSetUnread).catch(() => {});
        });
      }
      return 0;
    }
    // Cache the full count payload so both the side-panel stats grid
    // and any subscribed surface (profile hero) can repaint without
    // a second roundtrip.
    _ottoLastCount = {
      unread: typeof j.unread === 'number' ? j.unread : 0,
      totals: j.totals || { follow:0, connection:0, like:0, comment:0 },
    };
    _ottoApplyStats(_ottoLastCount);
    _ottoCountSubs.forEach(cb => { try { cb(_ottoLastCount); } catch {} });
    return _ottoLastCount.unread;
  }

  async function _ottoMarkAllRead() {
    try {
      await fetch('/api/me/notifications/mark-read', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      _ottoSetUnread(0);
    } catch {}
  }

  function _ottoSetUnread(n) {
    if (!corner) return;
    _ottoUnreadN = Math.max(0, Number(n) || 0);
    _ottoPaintCorner();
  }

  function _ottoRelTime(iso) {
    if (!iso) return '';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return 'just now';
    if (d < 3600) return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    if (d < 86400*7) return Math.floor(d/86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' });
  }

  function _ottoEsc(s) {
    return String(s || '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[ch]));
  }

  function _ottoRenderNotifications(list) {
    const wrap = document.getElementById('ottoNotifList');
    if (!wrap) return;
    _ottoLastList = Array.isArray(list) ? list : [];
    // A failed load owns this section until a retry succeeds: the filter
    // pills re-render from the (empty) cache, and that would quietly swap
    // "couldn't load" for "no activity yet".
    if (_ottoNotifFailed && _ottoLastList.length === 0) return;
    const filtered = (_ottoActiveFilter && _ottoActiveFilter !== 'all')
      ? _ottoLastList.filter(n => n.type === _ottoActiveFilter)
      : _ottoLastList;
    if (filtered.length === 0) {
      const msg = (_ottoActiveFilter && _ottoActiveFilter !== 'all')
        ? `no ${_ottoActiveFilter}s yet.`
        : 'no activity yet — go say hi to someone.';
      wrap.innerHTML = `<div class="otto-notif-empty">${msg}</div>`;
      return;
    }
    wrap.innerHTML = filtered.map(_ottoRenderNotifRow).join('');
    bindCursorOn(wrap);
  }

  // A cancelled-event notice's start, in campus time: "Fri, Oct 3, 7:00 PM"
  // (src/lib/push/event-notice.ts eventWhenText). '' for a bad date.
  function _ottoEventWhen(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || !isFinite(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Indiana/Indianapolis',
    });
  }

  // A club's cancelled-event notice (S68). It's from the club: the club's
  // picture, name and link, never the officer who cancelled (the route sends
  // no actor for it). Club name and event title are officer text, escaped.
  function _ottoRenderClubNoticeRow(n) {
    const org = n.org || {};
    const clubName = String(org.name || '').trim() || 'A club';
    const initials = clubName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(p => Array.from(p)[0] || '').join('').toUpperCase() || '?';
    const av = org.logo_url
      ? `<div class="otto-notif-av"><img src="${_ottoEsc(org.logo_url)}" alt=""></div>`
      : `<div class="otto-notif-av">${_ottoEsc(initials)}</div>`;
    const title = String(n.event_title || '').replace(/\s+/g, ' ').trim() || 'an event';
    const when = _ottoEventWhen(n.event_starts_at);
    const click = ` onclick="window.__ottoOpenNotif('${_ottoEsc(n.id)}')"`;
    const cls = 'otto-notif-row' + (n.read_at ? '' : ' unread');
    return `<div class="${cls}"${click} data-notif-id="${_ottoEsc(n.id)}">
      ${av}
      <div class="otto-notif-body">
        <div><span class="otto-notif-actor">${_ottoEsc(clubName)}</span> <span class="otto-notif-text">cancelled <strong style="color:white;font-weight:600">${_ottoEsc(title)}</strong>${when ? ' · ' + _ottoEsc(when) : ''}</span></div>
        <div class="otto-notif-time">${_ottoEsc(_ottoRelTime(n.created_at))}</div>
      </div>
    </div>`;
  }

  function _ottoRenderNotifRow(n) {
    if (n.type === 'event_cancelled') return _ottoRenderClubNoticeRow(n);
    const a = n.actor || {};
    const initials = (a.name || a.handle || '?').split(/\s+/)
      .map(p => p[0]).filter(Boolean).join('').slice(0,2).toUpperCase();
    const av = a.avatar_url
      ? `<div class="otto-notif-av"><img src="${_ottoEsc(a.avatar_url)}" alt=""></div>`
      : `<div class="otto-notif-av">${_ottoEsc(initials)}</div>`;
    const name = _ottoEsc(a.name || ('@' + (a.handle || 'someone')));
    let verb;
    switch (n.type) {
      case 'follow':     verb = 'started following you';        break;
      case 'connection': verb = "you're now connected";         break;
      case 'like':       verb = 'liked your post';              break;
      case 'comment':    verb = 'commented on your post';       break;
      case 'mention':    verb = n.message_id ? 'mentioned you in a chat' : 'mentioned you'; break;
      // The club name is free text an officer typed, and the verb lands in
      // innerHTML below, so it's escaped here (the other verbs are fixed).
      case 'org_invite':
        verb = 'invited you to join ' + _ottoEsc((n.org && n.org.name) || 'a club');
        break;
      case 'org_request_approved':
        verb = 'approved your request to join ' + _ottoEsc((n.org && n.org.name) || 'a club');
        break;
      // To an owner or officer (Oct 22, 2026): the requester is the actor.
      // OttoSidePanel.tsx's twin; without the club it's still one of theirs.
      case 'org_join_request':
        verb = 'asked to join ' + _ottoEsc((n.org && n.org.name) || 'your club');
        break;
      default:           verb = '';
    }
    // Snippet content varies by type — for comments we want to show
    // *what they said*; for likes the post body gives the context.
    let snippetText = '';
    if (n.type === 'comment' && n.comment && n.comment.content) {
      snippetText = n.comment.content;
    } else if ((n.type === 'like' || n.type === 'mention' || n.type === 'comment') && n.post && n.post.content) {
      snippetText = n.post.content;
    }
    const snippet = snippetText
      ? `<div class="otto-notif-snippet">"${_ottoEsc(snippetText.slice(0, 140))}"</div>`
      : '';
    // Click routing depends on type: like/comment open the post; follow/
    // connection go to the actor's profile. Inline onclick can't easily
    // call a window function with a complex arg, so we delegate via
    // window.__ottoOpenNotif which looks up the row by id from the cache.
    const click = ` onclick="window.__ottoOpenNotif('${_ottoEsc(n.id)}')"`;
    const cls = 'otto-notif-row' + (n.read_at ? '' : ' unread');
    return `<div class="${cls}"${click} data-notif-id="${_ottoEsc(n.id)}">
      ${av}
      <div class="otto-notif-body">
        <div><span class="otto-notif-actor">${name}</span> <span class="otto-notif-text">${verb}</span></div>
        ${snippet}
        <div class="otto-notif-time">${_ottoEsc(_ottoRelTime(n.created_at))}</div>
      </div>
    </div>`;
  }

  // Click delegate: route the row to the post viewer (likes/comments)
  // or the actor's profile (follows/connections). Closes Otto first so
  // the modal isn't stacked behind the panel.
  window.__ottoOpenNotif = function (notifId) {
    const n = (_ottoLastList || []).find(x => x.id === notifId);
    if (!n) return;
    closeOttoPanel();
    // A join request opens where it's answered: Club tools > Join requests
    // (OttoSidePanel.tsx's twin).
    if (n.type === 'org_join_request') {
      window.location.href = (n.org && n.org.handle)
        ? '/orgs/' + encodeURIComponent(n.org.handle) + '/tools/requests'
        : '/campus?tab=orgs';
      return;
    }
    // Club rows open the club, not the officer who sent them. Without the
    // club (it couldn't be read) the Orgs tab is the closest place.
    if (n.type === 'org_invite' || n.type === 'org_request_approved' || n.type === 'event_cancelled') {
      window.location.href = (n.org && n.org.handle)
        ? '/orgs/' + encodeURIComponent(n.org.handle)
        : '/campus?tab=orgs';
      return;
    }
    // Mention in a chat → jump to /messages (the channel is found
     // via the message's channel_id). Mention in a post → open the post.
    if (n.type === 'mention' && n.message_id && !n.post) {
      window.location.href = '/messages';
      return;
    }
    if ((n.type === 'like' || n.type === 'comment' || n.type === 'mention') && n.post && n.post.id) {
      const postId = n.post.id;
      // If the shared post viewer modal is loaded on this page, open
      // it directly — no navigation. Otherwise, send the user to their
      // own profile with ?post=<id> and let that page auto-open it.
      if (typeof window.openPostViewer === 'function') {
        try {
          window.openPostViewer(postId, {
            id: postId, type: n.post.type || 'post',
            content: n.post.content || '',
            media_thumbnail_url: n.post.media_thumbnail_url || '',
            tags: [], media_url: '',
            created_at: n.created_at, author: null,
          });
          return;
        } catch {}
      }
      window.location.href = '/profile?post=' + encodeURIComponent(postId);
      return;
    }
    if (n.actor && n.actor.handle) {
      window.location.href = '/profile/' + encodeURIComponent(n.actor.handle);
    }
  };

  // Poll the unread count every 30s so the dot stays current without
  // the user having to refresh. Visibility-gated so a backgrounded tab
  // doesn't burn CPU.
  function _ottoStartPolling() {
    if (!_isAppShellUser()) return;
    _ottoFetchUnreadCount().then(_ottoSetUnread).catch(() => {});
    setInterval(() => {
      if (document.hidden) return;
      _ottoFetchUnreadCount().then(_ottoSetUnread).catch(() => {});
    }, 30 * 1000);
  }
  // Defer the first poll so the corner ring is mounted by the time we
  // try to add the .has-unread class.
  setTimeout(_ottoStartPolling, 1500);

  function renderDraftsHTML(latest) {
    if (!latest || !latest.text) {
      return `
        <div class="otto-briefing">"haven't seen a post yet — when you publish something, your platform drafts will live here."</div>
        <div style="text-align:center;padding:6px 0 4px;font-size:11.5px;color:rgba(255,255,255,.45);font-style:italic;line-height:1.55;">try the composer over in feed →</div>
      `;
    }
    const v = generateVariants(latest.text);
    return `
      <div class="otto-briefing">"drafted three from your last post. linkedin's the strongest. i'd skip x — your audience isn't there."</div>

      <div class="otto-draft recommended">
        <div class="otto-draft-meta">
          <div class="otto-platform-square" style="background:#0A66C2;"></div>
          <span class="otto-draft-label">LINKEDIN</span>
          <span class="otto-draft-tag">PICK</span>
        </div>
        <div class="otto-draft-text">${escapeHTML(v.linkedin)}</div>
        <div class="otto-draft-actions">
          <button class="otto-btn-primary">Approve</button>
          <button class="otto-btn-ghost">Edit</button>
        </div>
      </div>

      <div class="otto-draft">
        <div class="otto-draft-meta">
          <div class="otto-platform-square" style="background:linear-gradient(135deg,#E1306C,#C13584);"></div>
          <span class="otto-draft-label">INSTAGRAM</span>
        </div>
        <div class="otto-draft-text">${escapeHTML(v.instagram)}</div>
        <div class="otto-draft-actions">
          <button class="otto-btn-primary">Approve</button>
          <button class="otto-btn-ghost">Edit</button>
        </div>
      </div>

      <div class="otto-draft skip">
        <div class="otto-draft-meta">
          <div class="otto-platform-square" style="background:rgba(255,255,255,.5);"></div>
          <span class="otto-draft-label" style="color:rgba(255,255,255,.5);">X</span>
          <span class="otto-draft-tag skip">i'd skip</span>
        </div>
        <div class="otto-draft-text">${escapeHTML(v.x)}</div>
      </div>
    `;
  }

  function closeOttoPanel() {
    if (!panel) return;
    const focusWasIn = panel.contains(document.activeElement) || document.activeElement === document.body;
    if (backdrop) backdrop.style.display = 'none';
    panel.style.display = 'none';
    _ottoPaintCorner();
    document.dispatchEvent(new CustomEvent('vibe:otto-panel', { detail: { open: false } }));
    // Focus goes back to the corner that opened it.
    if (_ottoDeskMode && focusWasIn) { try { corner.focus({ preventScroll: true }); } catch {} }
    _ottoDropStalePanel();
  }
  window.__ottoClosePanel = closeOttoPanel;

  // Esc closes the panel. The desk panel leaves the page usable, so only an
  // Escape from the panel or the corner is its own (one meant for a sheet or
  // a field on the page is not); the old panel's backdrop covered the page.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || !panel || panel.style.display === 'none') return;
    const at = document.activeElement;
    if (_ottoDeskMode && !(panel.contains(at) || at === corner)) return;
    closeOttoPanel();
  });

  // Bind cursor hover for the corner ring at init time too (in case panel
  // is never opened, the ring still gets hover feedback)
  const cur  = document.getElementById('cursor');
  const ring = document.getElementById('cursorRing');
  if (cur && ring) {
    corner.addEventListener('mouseenter', () => { cur.classList.add('hover'); ring.classList.add('hover'); });
    corner.addEventListener('mouseleave', () => { cur.classList.remove('hover'); ring.classList.remove('hover'); });
  }

  // ── POST-PUBLISH FLOW (mockup 06) ─────────────────────────────────────
  // Called by feed.html submitPostB() once the new post card is in the DOM.
  // Drives the 5-frame storyboard: posted badge → ask bubble → thinking
  // panel → drafts panel → toast + syndicated badge on the post.
  const PLATFORM_META = {
    linkedin:  { name: 'LinkedIn',  bg: '#0A66C2' },
    instagram: { name: 'Instagram', bg: 'linear-gradient(135deg,#E1306C,#C13584)' },
    x:         { name: 'X',         bg: '#000' }
  };
  let pubFlowActive = false;
  let pubBubble = null;
  let pubPanel = null;
  let pubBackdrop = null;
  let pubToast = null;
  let pubPcard = null;
  let pubApproved = new Set();

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function bindCursorOn(el) {
    const c = document.getElementById('cursor');
    const r = document.getElementById('cursorRing');
    if (!c || !r) return;
    el.querySelectorAll('a, button, textarea').forEach(b => {
      if (b._ottoCursorBound) return;
      b._ottoCursorBound = true;
      b.addEventListener('mouseenter', () => { c.classList.add('hover'); r.classList.add('hover'); });
      b.addEventListener('mouseleave', () => { c.classList.remove('hover'); r.classList.remove('hover'); });
    });
  }

  // Generate platform-specific variants from the user's post text.
  // Demo logic: LinkedIn keeps the original; Instagram lowercases + casual outro;
  // X gets a short version that opens a thought.
  function generateVariants(text) {
    const t = text.trim();
    let ig = t.toLowerCase();
    if (ig.length > 220) ig = ig.slice(0, 217) + '...';
    ig = ig.replace(/[.!?]+\s*$/, '') + ' →';
    let firstSent = (t.match(/^[^.!?]+[.!?]/) || [t])[0].trim();
    if (firstSent.length > 220) firstSent = firstSent.slice(0, 217) + '...';
    if (!/[.!?]$/.test(firstSent)) firstSent += '.';
    const x = firstSent + ' thoughts?';
    return { linkedin: t, instagram: ig, x: x };
  }

  function publishFlow(pcard, text) {
    if (pubFlowActive || !pcard || !text) return;
    pubFlowActive = true;
    pubPcard = pcard;
    pubApproved = new Set();
    // Persist so the standard side-panel can show drafts for THIS post
    if (typeof vibeSave === 'function') {
      vibeSave('vibe_otto_lastpost_v1', { text: text, ts: Date.now() });
    }

    // Frame 1 — coral border + "posted" badge
    pcard.classList.add('otto-just-posted');
    const badge = document.createElement('div');
    badge.className = 'otto-posted-badge';
    badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>posted';
    pcard.appendChild(badge);

    // Frame 2 — Otto bubble after a 1.5s beat
    setTimeout(() => showAskBubble(text), 1500);
  }

  function showAskBubble(text) {
    if (!pubFlowActive) return;
    corner.classList.add('otto-glow');
    _ottoPublishWait = true;
    _ottoPaintCorner();
    pubBubble = document.createElement('div');
    pubBubble.id = 'ottoAskBubble';
    pubBubble.innerHTML = `
      <div class="oab-arrow"></div>
      <div class="oab-meta">
        <div class="oab-mini-otto vibe-night-island">${planetHTML(24, { state: 'wait' })}</div>
        <span class="oab-name">otto</span>
      </div>
      <div class="oab-q">"want me to send this to your other 3 platforms?"</div>
      <div class="oab-platforms">
        <div class="oab-tile" style="background:#0A66C2;"></div>
        <div class="oab-tile" style="background:linear-gradient(135deg,#E1306C,#C13584);"></div>
        <div class="oab-tile" style="background:#000;"></div>
      </div>
      <div class="oab-actions">
        <button class="oab-yes">Yes, draft them</button>
        <button class="oab-skip">Skip</button>
      </div>
    `;
    document.body.appendChild(pubBubble);
    bindCursorOn(pubBubble);
    pubBubble.querySelector('.oab-yes').onclick = () => {
      closeBubble();
      showThinkingPanel(text);
    };
    pubBubble.querySelector('.oab-skip').onclick = () => {
      closeBubble();
      finalizeFlow();
    };
  }

  function closeBubble() {
    corner.classList.remove('otto-glow');
    _ottoPublishWait = false;
    _ottoPaintCorner();
    pubBubble?.remove();
    pubBubble = null;
  }

  function showThinkingPanel(text) {
    const variants = generateVariants(text);

    pubBackdrop = document.createElement('div');
    pubBackdrop.id = 'ottoPubBackdrop';
    pubBackdrop.onclick = cancelFlow;
    document.body.appendChild(pubBackdrop);

    pubPanel = document.createElement('aside');
    pubPanel.id = 'ottoPubPanel';
    pubPanel.innerHTML = `
      <div class="opp-header">
        <div class="opp-mini vibe-night-island">${planetHTML(42, { state: 'think' })}</div>
        <div style="flex:1;">
          <div class="opp-name">otto</div>
          <div class="opp-sub">thinking...</div>
        </div>
        <button class="opp-close" aria-label="Close">×</button>
      </div>
      <div class="opp-body">
        <div class="opp-thinking-quote">"drafting your post for three platforms..."</div>
        <div class="opp-progress">
          <div class="opp-pp-row" data-p="linkedin">
            <div class="opp-pp-tile" style="background:#0A66C2;"></div>
            <div class="opp-pp-name">LinkedIn</div>
            <div class="opp-pp-status drafting"><div class="opp-spinner"></div><span>drafting</span></div>
          </div>
          <div class="opp-pp-row queued" data-p="instagram">
            <div class="opp-pp-tile" style="background:linear-gradient(135deg,#E1306C,#C13584);"></div>
            <div class="opp-pp-name">Instagram</div>
            <div class="opp-pp-status queued"><span>queued</span></div>
          </div>
          <div class="opp-pp-row queued" data-p="x">
            <div class="opp-pp-tile" style="background:#000;"></div>
            <div class="opp-pp-name">X</div>
            <div class="opp-pp-status queued"><span>queued</span></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(pubPanel);
    bindCursorOn(pubPanel);
    pubPanel.querySelector('.opp-close').onclick = cancelFlow;

    // Step the platforms one at a time
    setTimeout(() => updateProgress('linkedin', 'ready'),    1100);
    setTimeout(() => updateProgress('instagram', 'drafting'), 1250);
    setTimeout(() => updateProgress('instagram', 'ready'),    2400);
    setTimeout(() => updateProgress('x', 'drafting'),         2550);
    setTimeout(() => updateProgress('x', 'ready'),            3300);
    setTimeout(() => morphToDrafts(variants),                 3700);
  }

  function updateProgress(platform, state) {
    if (!pubPanel) return;
    const row = pubPanel.querySelector(`.opp-pp-row[data-p="${platform}"]`);
    if (!row) return;
    row.classList.remove('queued');
    const status = row.querySelector('.opp-pp-status');
    if (state === 'ready') {
      status.className = 'opp-pp-status ready';
      status.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="#2ECC71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>ready</span>`;
    } else if (state === 'drafting') {
      status.className = 'opp-pp-status drafting';
      status.innerHTML = `<div class="opp-spinner"></div><span>drafting</span>`;
    }
  }

  function morphToDrafts(variants) {
    if (!pubPanel) return;
    const sub = pubPanel.querySelector('.opp-sub');
    pubPanel.querySelector('.opp-mini .m-planet')?.classList.remove('think');
    sub.classList.add('muted');
    sub.textContent = '3 drafts ready';

    const body = pubPanel.querySelector('.opp-body');
    body.innerHTML = `
      <div class="opp-briefing">"linkedin's the strongest. i'd skip x — your audience isn't there."</div>

      <div class="opp-draft recommended" data-p="linkedin">
        <div class="opp-draft-meta">
          <div class="opp-platform-square" style="background:#0A66C2;"></div>
          <span class="opp-draft-label">LINKEDIN</span>
          <span class="opp-draft-tag">PICK</span>
        </div>
        <div class="opp-draft-text">${escapeHTML(variants.linkedin)}</div>
        <div class="opp-draft-actions">
          <button class="opp-btn-primary opp-approve">Approve</button>
          <button class="opp-btn-ghost opp-edit">Edit</button>
        </div>
      </div>

      <div class="opp-draft" data-p="instagram">
        <div class="opp-draft-meta">
          <div class="opp-platform-square" style="background:linear-gradient(135deg,#E1306C,#C13584);"></div>
          <span class="opp-draft-label">INSTAGRAM</span>
        </div>
        <div class="opp-draft-text">${escapeHTML(variants.instagram)}</div>
        <div class="opp-draft-actions">
          <button class="opp-btn-primary opp-approve">Approve</button>
          <button class="opp-btn-ghost opp-edit">Edit</button>
        </div>
      </div>

      <div class="opp-draft skip" data-p="x">
        <div class="opp-draft-meta">
          <div class="opp-platform-square" style="background:rgba(255,255,255,.5);"></div>
          <span class="opp-draft-label" style="color:rgba(255,255,255,.5);">X</span>
          <span class="opp-draft-tag skip">i'd skip</span>
        </div>
        <div class="opp-draft-text">${escapeHTML(variants.x)}</div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'opp-footer';
    footer.innerHTML = `
      <button class="opp-approve-all">Approve all <span class="opp-approve-count">2</span> →</button>
      <button class="opp-skip-all">Skip all</button>
    `;
    pubPanel.appendChild(footer);
    bindCursorOn(pubPanel);

    pubPanel.querySelectorAll('.opp-draft').forEach(d => {
      const platform = d.dataset.p;
      d.querySelector('.opp-approve')?.addEventListener('click', () => {
        approveDraft(d, platform);
        updateApproveCount();
      });
      d.querySelector('.opp-edit')?.addEventListener('click', () => editDraft(d));
    });
    footer.querySelector('.opp-approve-all').onclick = () => {
      pubPanel.querySelectorAll('.opp-draft:not(.skip):not(.approved)').forEach(d => approveDraft(d, d.dataset.p));
      finalizeFlow();
    };
    footer.querySelector('.opp-skip-all').onclick = cancelFlow;
  }

  function approveDraft(d, platform) {
    if (d.classList.contains('approved')) return;
    d.classList.add('approved');
    pubApproved.add(platform);
    let tag = d.querySelector('.opp-draft-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'opp-draft-tag';
      d.querySelector('.opp-draft-meta').appendChild(tag);
    }
    tag.classList.add('approved');
    tag.classList.remove('skip');
    tag.innerHTML = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>APPROVED`;
    const actions = d.querySelector('.opp-draft-actions');
    if (actions) actions.innerHTML = `<span class="opp-approved-flag">✓ scheduled to post</span>`;
  }

  function editDraft(d) {
    const textEl = d.querySelector('.opp-draft-text');
    if (!textEl || textEl.tagName === 'TEXTAREA') return;
    const ta = document.createElement('textarea');
    ta.className = 'opp-draft-edit';
    ta.value = textEl.textContent;
    textEl.replaceWith(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    bindCursorOn(d);
    const commit = () => {
      const newEl = document.createElement('div');
      newEl.className = 'opp-draft-text';
      newEl.textContent = ta.value;
      if (ta.parentNode) ta.replaceWith(newEl);
    };
    ta.addEventListener('blur', commit, { once: true });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.blur(); }
    });
  }

  function updateApproveCount() {
    if (!pubPanel) return;
    const remaining = pubPanel.querySelectorAll('.opp-draft:not(.skip):not(.approved)').length;
    const btn = pubPanel.querySelector('.opp-approve-all');
    const span = pubPanel.querySelector('.opp-approve-count');
    if (span) span.textContent = remaining;
    if (btn) {
      if (remaining === 0) {
        btn.innerHTML = 'Done →';
        btn.onclick = finalizeFlow;
      }
    }
  }

  function cancelFlow() {
    closePubPanel();
    finalizeFlow();
  }

  function closePubPanel() {
    pubPanel?.remove(); pubPanel = null;
    pubBackdrop?.remove(); pubBackdrop = null;
  }

  function finalizeFlow() {
    closePubPanel();
    closeBubble();
    const approved = [...pubApproved];

    if (pubPcard) {
      pubPcard.classList.remove('otto-just-posted');
      pubPcard.querySelector('.otto-posted-badge')?.remove();

      if (approved.length > 0) {
        const header = pubPcard.querySelector('.pc2-header');
        if (header && !header.querySelector('.otto-syndicated-badge')) {
          const sb = document.createElement('div');
          sb.className = 'otto-syndicated-badge';
          sb.innerHTML = `<span class="otto-syndicated-dot"></span><span>otto · ${approved.length} platform${approved.length > 1 ? 's' : ''}</span>`;
          header.appendChild(sb);
        }
        showSyndicatedToast(approved);
      }
    }

    pubFlowActive = false;
    pubPcard = null;
    pubApproved = new Set();
  }

  function showSyndicatedToast(approved) {
    const names = approved.map(p => PLATFORM_META[p].name);
    const joined = names.length === 1 ? names[0]
                 : names.length === 2 ? names.join(' & ')
                 : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
    const verb = names.length === 1 ? 'it does' : 'they do';
    pubToast?.remove();
    pubToast = document.createElement('div');
    pubToast.id = 'ottoPubToast';
    pubToast.innerHTML = `
      <div class="opt-otto vibe-night-island">${planetHTML(28, { state: 'done' })}</div>
      <div class="opt-text">"shipped to ${escapeHTML(joined)}. I'll watch how ${verb}."</div>
    `;
    document.body.appendChild(pubToast);
    setTimeout(() => {
      if (!pubToast) return;
      pubToast.classList.add('out');
      setTimeout(() => { pubToast?.remove(); pubToast = null; }, 320);
    }, 4500);
  }

  // Expose for debugging + external invocation (feed.html submitPostB)
  window.otto = { open: openOttoPanel, close: closeOttoPanel, publishFlow };
})();
