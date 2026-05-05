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
    @keyframes ottoRingBreathe { 0%,100% { transform: scale(1); opacity: .25; } 50% { transform: scale(1.4); opacity: 0; } }
    @keyframes ottoSynapse { 0%,100% { opacity: .15; } 50% { opacity: 1; } }
    @keyframes ottoPanelIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes ottoBackdropIn { from { opacity: 0; } to { opacity: 1; } }

    #ottoCorner {
      position: fixed; bottom: 24px; right: 24px; z-index: 9990;
      cursor: none;
    }
    /* Notification dot — hidden by default, JS adds .has-unread when
       /api/me/notifications/count returns > 0. */
    #ottoCorner .otto-notif {
      position: absolute; top: -2px; right: -2px;
      width: 11px; height: 11px; border-radius: 50%;
      background: #FF5C35; border: 2px solid #FAF7F2;
      z-index: 2; box-shadow: 0 0 8px rgba(255,92,53,.5);
      display: none;
    }
    #ottoCorner.has-unread .otto-notif { display: block; }
    #ottoCorner .otto-shell {
      width: 52px; height: 52px; border-radius: 50%;
      background: #1C1C1E; border: 0.5px solid rgba(255,92,53,.3);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
      transition: transform .18s, box-shadow .18s;
    }
    #ottoCorner:hover .otto-shell {
      transform: translateY(-2px) scale(1.04);
      box-shadow: 0 12px 32px rgba(255,92,53,.25);
    }
    #ottoCorner .otto-viz {
      position: relative; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
    }
    #ottoCorner .otto-pulse-o { animation: ottoRingBreathe 2.8s ease-out infinite; position: absolute; inset: 4px; border-radius: 50%; border: 1px solid #FF5C35; }
    #ottoCorner .otto-orbit   { animation: ottoSpinSlow 8s linear infinite; position: absolute; inset: 0; border-radius: 50%; border: 0.5px solid rgba(255,92,53,.3); }
    #ottoCorner .otto-orbit-dot { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 3px; height: 3px; border-radius: 50%; background: #FF5C35; }
    #ottoCorner .otto-core    { animation: ottoPulseCore 2.4s ease-in-out infinite; width: 9px; height: 9px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 10px #FF5C35; }

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
    #ottoPanel .otto-mini { position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; }
    #ottoPanel .otto-mini .otto-orbit { animation: ottoSpinSlow 8s linear infinite; position: absolute; inset: 0; border-radius: 50%; border: 0.5px solid rgba(255,92,53,.4); }
    #ottoPanel .otto-mini .otto-orbit-dot { position: absolute; top: -1px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: #FF5C35; }
    #ottoPanel .otto-mini .otto-core { animation: ottoPulseCore 2.4s ease-in-out infinite; width: 10px; height: 10px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 10px #FF5C35; }
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
    #ottoPanel .otto-draft-tag { margin-left: auto; font-size: 9px; padding: 2px 8px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 700; letter-spacing: .5px; }
    #ottoPanel .otto-draft-tag.skip { background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); font-weight: 500; }
    #ottoPanel .otto-draft-text { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.78); }
    #ottoPanel .otto-draft.skip .otto-draft-text { color: rgba(255,255,255,.5); }
    #ottoPanel .otto-draft-actions { display: flex; gap: 6px; margin-top: 11px; }
    #ottoPanel .otto-btn-primary { font-size: 11px; padding: 6px 14px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPanel .otto-btn-primary:hover { background: #ff7055; }
    #ottoPanel .otto-btn-ghost { font-size: 11px; padding: 6px 14px; border: 0.5px solid rgba(255,255,255,.18); color: rgba(255,255,255,.78); border-radius: 100px; cursor: none; background: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
    #ottoPanel .otto-btn-ghost:hover { border-color: rgba(255,255,255,.4); color: white; }

    #ottoPanel .otto-divider { height: 0.5px; background: rgba(255,255,255,.06); margin: 22px 0 16px; }
    #ottoPanel .otto-section-eyebrow { font-size: 10px; font-weight: 600; letter-spacing: 1.2px; color: rgba(255,255,255,.42); text-transform: uppercase; margin-bottom: 12px; }
    #ottoPanel .otto-activity { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.72); padding: 7px 0; display: flex; gap: 9px; }
    #ottoPanel .otto-activity-arrow { color: #FF5C35; font-weight: 600; flex-shrink: 0; }

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
    .otto-posted-badge { position: absolute; top: -10px; left: 18px; font-size: 10px; padding: 4px 10px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(255,92,53,.3); z-index: 2; }
    .otto-syndicated-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; padding: 4px 10px; background: rgba(255,92,53,.1); color: #FF5C35; border-radius: 100px; font-weight: 600; letter-spacing: .3px; margin-left: auto; flex-shrink: 0; }
    .otto-syndicated-dot { width: 5px; height: 5px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 4px #FF5C35; animation: ottoPulseCore 2.4s ease-in-out infinite; }

    /* Corner glow during ask state */
    #ottoCorner.otto-glow .otto-shell { border-color: #FF5C35; box-shadow: 0 6px 20px rgba(0,0,0,.2), 0 0 0 4px rgba(255,92,53,.18); }

    /* Frame 2 — ask bubble */
    #ottoAskBubble { position: fixed; bottom: 92px; right: 24px; z-index: 9991; background: #1C1C1E; border-radius: 16px; padding: 14px 16px; max-width: 300px; box-shadow: 0 8px 28px rgba(0,0,0,.25); border: 0.5px solid rgba(255,92,53,.3); color: white; font-family: 'DM Sans', sans-serif; animation: ottoBubbleIn .25s cubic-bezier(.2,.8,.2,1); }
    #ottoAskBubble .oab-arrow { position: absolute; bottom: -6px; right: 22px; width: 12px; height: 12px; background: #1C1C1E; border-right: 0.5px solid rgba(255,92,53,.3); border-bottom: 0.5px solid rgba(255,92,53,.3); transform: rotate(45deg); }
    #ottoAskBubble .oab-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    #ottoAskBubble .oab-mini-otto { position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
    #ottoAskBubble .oab-mini-otto .otto-orbit { animation: ottoSpinSlow 8s linear infinite; position: absolute; inset: 0; border-radius: 50%; border: 0.5px solid rgba(255,92,53,.4); }
    #ottoAskBubble .oab-mini-otto .otto-orbit-dot { position: absolute; top: -1px; left: 50%; transform: translateX(-50%); width: 3px; height: 3px; border-radius: 50%; background: #FF5C35; }
    #ottoAskBubble .oab-mini-otto .otto-core { animation: ottoPulseCore 2.4s ease-in-out infinite; width: 7px; height: 7px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 6px #FF5C35; }
    #ottoAskBubble .oab-name { font-family: 'Fraunces', serif; font-size: 12px; font-weight: 700; color: white; letter-spacing: -.2px; }
    #ottoAskBubble .oab-q { font-family: 'Fraunces', serif; font-style: italic; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.92); margin-bottom: 12px; }
    #ottoAskBubble .oab-platforms { display: flex; gap: 5px; margin-bottom: 12px; }
    #ottoAskBubble .oab-tile { width: 16px; height: 16px; border-radius: 4px; }
    #ottoAskBubble .oab-actions { display: flex; gap: 6px; align-items: center; }
    #ottoAskBubble .oab-yes { font-size: 11px; padding: 7px 14px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; flex: 1; transition: background .15s; }
    #ottoAskBubble .oab-yes:hover { background: #ff7055; }
    #ottoAskBubble .oab-skip { font-size: 11px; padding: 7px 14px; color: rgba(255,255,255,.55); border-radius: 100px; cursor: none; background: none; border: none; font-family: 'DM Sans', sans-serif; transition: color .15s; }
    #ottoAskBubble .oab-skip:hover { color: rgba(255,255,255,.85); }

    /* Frames 3 & 4 — publish panel (thinking + drafts) */
    #ottoPubBackdrop { position: fixed; inset: 0; z-index: 9996; background: rgba(20,20,22,.35); backdrop-filter: blur(2px); animation: ottoBackdropIn .22s ease-out; }
    #ottoPubPanel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 9997; width: 380px; max-width: 92vw; background: #141416; color: white; border-left: 0.5px solid rgba(255,92,53,.15); box-shadow: -16px 0 48px rgba(0,0,0,.4); display: flex; flex-direction: column; font-family: 'DM Sans', sans-serif; animation: ottoPubPanelIn .26s cubic-bezier(.2,.8,.2,1); }
    #ottoPubPanel .opp-header { padding: 22px 22px 18px; border-bottom: 0.5px solid rgba(255,255,255,.06); display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
    #ottoPubPanel .opp-mini { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
    #ottoPubPanel .opp-mini .otto-orbit { animation: ottoSpinSlow 8s linear infinite; position: absolute; inset: 0; border-radius: 50%; border: 0.5px solid rgba(255,92,53,.4); }
    #ottoPubPanel .opp-mini .otto-orbit-dot { position: absolute; top: -1px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: #FF5C35; }
    #ottoPubPanel .opp-mini .otto-core { animation: ottoPulseCore 2.4s ease-in-out infinite; width: 9px; height: 9px; border-radius: 50%; background: #FF5C35; box-shadow: 0 0 8px #FF5C35; }
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
    #ottoPubPanel .opp-draft-tag { margin-left: auto; font-size: 9px; padding: 2px 8px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 700; letter-spacing: .5px; display: inline-flex; align-items: center; gap: 4px; }
    #ottoPubPanel .opp-draft-tag.skip { background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); font-weight: 500; }
    #ottoPubPanel .opp-draft-tag.approved { background: #2ECC71; }
    #ottoPubPanel .opp-draft-text { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.85); white-space: pre-wrap; word-wrap: break-word; }
    #ottoPubPanel .opp-draft.skip .opp-draft-text { color: rgba(255,255,255,.5); }
    #ottoPubPanel .opp-draft-edit { width: 100%; background: rgba(255,255,255,.04); border: 0.5px solid rgba(255,92,53,.4); border-radius: 8px; padding: 10px 12px; color: white; font-family: 'DM Sans', sans-serif; font-size: 12.5px; line-height: 1.6; resize: vertical; min-height: 90px; }
    #ottoPubPanel .opp-draft-edit:focus { outline: none; border-color: #FF5C35; }
    #ottoPubPanel .opp-draft-actions { display: flex; gap: 6px; margin-top: 11px; align-items: center; }
    #ottoPubPanel .opp-btn-primary { font-size: 11px; padding: 6px 14px; background: #FF5C35; color: white; border-radius: 100px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPubPanel .opp-btn-primary:hover { background: #ff7055; }
    #ottoPubPanel .opp-btn-ghost { font-size: 11px; padding: 6px 14px; border: 0.5px solid rgba(255,255,255,.18); color: rgba(255,255,255,.78); border-radius: 100px; cursor: none; background: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
    #ottoPubPanel .opp-btn-ghost:hover { border-color: rgba(255,255,255,.4); color: white; }
    #ottoPubPanel .opp-approved-flag { font-size: 11px; color: #2ECC71; font-weight: 600; display: flex; align-items: center; gap: 6px; }

    #ottoPubPanel .opp-footer { padding: 14px 22px; border-top: 0.5px solid rgba(255,255,255,.06); flex-shrink: 0; display: flex; gap: 8px; align-items: center; }
    #ottoPubPanel .opp-approve-all { flex: 1; padding: 11px; background: #FF5C35; color: white; border-radius: 100px; font-size: 12.5px; font-weight: 600; cursor: none; border: none; font-family: 'DM Sans', sans-serif; transition: background .15s; }
    #ottoPubPanel .opp-approve-all:hover { background: #ff7055; }
    #ottoPubPanel .opp-skip-all { padding: 11px 16px; color: rgba(255,255,255,.55); cursor: none; background: none; border: none; font-family: 'DM Sans', sans-serif; font-size: 12.5px; font-weight: 500; transition: color .15s; }
    #ottoPubPanel .opp-skip-all:hover { color: white; }

    /* Frame 5 — toast */
    #ottoPubToast { position: fixed; bottom: 92px; right: 24px; z-index: 9991; background: #1C1C1E; border-radius: 14px; padding: 12px 16px 12px 12px; max-width: 340px; box-shadow: 0 8px 28px rgba(0,0,0,.25); border: 0.5px solid rgba(46,204,113,.3); color: white; font-family: 'DM Sans', sans-serif; display: flex; align-items: center; gap: 10px; animation: ottoToastIn .25s cubic-bezier(.2,.8,.2,1); }
    #ottoPubToast.out { animation: ottoToastOut .3s forwards; }
    #ottoPubToast .opt-check { width: 22px; height: 22px; border-radius: 50%; background: rgba(46,204,113,.18); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    #ottoPubToast .opt-text { font-family: 'Fraunces', serif; font-style: italic; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.92); }
  `;
  document.head.appendChild(style);

  // ── Inject corner ring ─────────────────────────────────────────────────
  const corner = document.createElement('button');
  corner.id = 'ottoCorner';
  corner.setAttribute('aria-label', 'Open Otto');
  corner.style.cssText = 'background:none;border:none;padding:0;';
  corner.innerHTML = `
    <div class="otto-notif"></div>
    <div class="otto-shell">
      <div class="otto-viz">
        <div class="otto-pulse-o"></div>
        <div class="otto-orbit"><div class="otto-orbit-dot"></div></div>
        <div class="otto-core"></div>
      </div>
    </div>
  `;
  corner.onclick = openOttoPanel;
  document.body.appendChild(corner);

  // ── Build panel HTML (lazy — only when first opened) ───────────────────
  let panel = null;
  let backdrop = null;

  function buildPanel() {
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
          <div class="otto-mini">
            <div class="otto-orbit"><div class="otto-orbit-dot"></div></div>
            <div class="otto-core"></div>
          </div>
          <div style="flex:1;">
            <div class="otto-panel-name">otto</div>
            <div class="otto-panel-sub">your agent · online</div>
          </div>
          <button class="otto-panel-close" aria-label="Close">×</button>
        </div>
        <div class="otto-platform-pills">
          <div class="otto-platform-pill">LinkedIn</div>
          <div class="otto-platform-pill">Instagram</div>
          <div class="otto-platform-pill">X</div>
          <div class="otto-platform-pill">TikTok</div>
        </div>
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

  function openOttoPanel() {
    if (!panel) buildPanel();
    else {
      backdrop.style.display = '';
      panel.style.display = '';
    }
    renderPanelBody();
    // Pull real notifications + mark them read after the user has seen
    // them. Best-effort — silent on failure (we still rendered the
    // briefing / drafts above).
    if (_isAppShellUser()) {
      _ottoFetchNotifications().then(list => {
        _ottoRenderNotifications(list);
        if (list && list.some(n => !n.read_at)) {
          _ottoMarkAllRead();
        }
      }).catch(() => {});
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
    const latest = (typeof vibeLoad === 'function') ? vibeLoad('vibe_otto_lastpost_v1') : null;
    body.innerHTML = renderDraftsHTML(latest) + `
      <div class="otto-divider"></div>
      <div class="otto-section-eyebrow">activity</div>
      <div class="otto-notif-list" id="ottoNotifList">
        <div class="otto-notif-empty">loading…</div>
      </div>
    `;
    bindCursorOn(body);
  }

  // ── Notifications wiring (P1-021) ──────────────────────────────────
  function _isAppShellUser() {
    if (typeof vibeLoad !== 'function') return false;
    const u = vibeLoad('vibe_user_v1');
    return Boolean(u && u._appShell);
  }

  async function _ottoFetchNotifications() {
    const r = await fetch('/api/me/notifications?limit=30', { credentials: 'include' });
    if (!r.ok) return [];
    const j = await r.json().catch(() => ({}));
    return (j && j.ok && Array.isArray(j.notifications)) ? j.notifications : [];
  }

  async function _ottoFetchUnreadCount() {
    const r = await fetch('/api/me/notifications/count', { credentials: 'include' });
    if (!r.ok) return 0;
    const j = await r.json().catch(() => ({}));
    return (j && j.ok && typeof j.unread === 'number') ? j.unread : 0;
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
    if (n > 0) corner.classList.add('has-unread');
    else corner.classList.remove('has-unread');
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
    if (!list || list.length === 0) {
      wrap.innerHTML = '<div class="otto-notif-empty">no activity yet — go say hi to someone.</div>';
      return;
    }
    wrap.innerHTML = list.map(_ottoRenderNotifRow).join('');
    bindCursorOn(wrap);
  }

  function _ottoRenderNotifRow(n) {
    const a = n.actor || {};
    const initials = (a.name || a.handle || '?').split(/\s+/)
      .map(p => p[0]).filter(Boolean).join('').slice(0,2).toUpperCase();
    const av = a.avatar_url
      ? `<div class="otto-notif-av"><img src="${_ottoEsc(a.avatar_url)}" alt=""></div>`
      : `<div class="otto-notif-av">${_ottoEsc(initials)}</div>`;
    const name = _ottoEsc(a.name || ('@' + (a.handle || 'someone')));
    let verb;
    if (n.type === 'follow')        verb = 'connected with you';
    else if (n.type === 'like')     verb = 'liked your post';
    else if (n.type === 'comment')  verb = 'commented on your post';
    else                            verb = '';
    const snippet = (n.post && n.post.content)
      ? `<div class="otto-notif-snippet">"${_ottoEsc(n.post.content.slice(0, 120))}"</div>`
      : '';
    const click = a.handle
      ? ` onclick="window.location.href='/profile/${encodeURIComponent(a.handle)}'"`
      : '';
    const cls = 'otto-notif-row' + (n.read_at ? '' : ' unread');
    return `<div class="${cls}"${click}>
      ${av}
      <div class="otto-notif-body">
        <div><span class="otto-notif-actor">${name}</span> <span class="otto-notif-text">${verb}</span></div>
        ${snippet}
        <div class="otto-notif-time">${_ottoEsc(_ottoRelTime(n.created_at))}</div>
      </div>
    </div>`;
  }

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
    backdrop.style.display = 'none';
    panel.style.display = 'none';
  }

  // Esc closes the panel
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && panel.style.display !== 'none') closeOttoPanel();
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
    badge.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>posted';
    pcard.appendChild(badge);

    // Frame 2 — Otto bubble after a 1.5s beat
    setTimeout(() => showAskBubble(text), 1500);
  }

  function showAskBubble(text) {
    if (!pubFlowActive) return;
    corner.classList.add('otto-glow');
    pubBubble = document.createElement('div');
    pubBubble.id = 'ottoAskBubble';
    pubBubble.innerHTML = `
      <div class="oab-arrow"></div>
      <div class="oab-meta">
        <div class="oab-mini-otto">
          <div class="otto-orbit"><div class="otto-orbit-dot"></div></div>
          <div class="otto-core"></div>
        </div>
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
        <div class="opp-mini">
          <div class="otto-orbit"><div class="otto-orbit-dot"></div></div>
          <div class="otto-core"></div>
        </div>
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
    tag.innerHTML = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="white" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>APPROVED`;
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
      <div class="opt-check"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8 L7 12 L13 4" stroke="#2ECC71" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
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
