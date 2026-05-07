// ══════════════════════════════════════════════════════════════════════════
// Vibe — mini messenger (bottom-right floating chat panel)
//
// LinkedIn-style: a small floating button at bottom-right that opens a
// 360x520 panel with the user's threads. Click a thread → mini chat view
// with bubbles + a composer. Lives on every signed-in static page so the
// user can DM without leaving whatever they're doing (browsing campus,
// looking at a profile, etc.).
//
// Backend: same /api/me/threads endpoints the full /messages page uses.
// The mini intentionally only does text messages for v1 — file uploads,
// post sharing, group photo, member management all live on the full
// /messages page; the mini has an "Open in Messages" link to jump there.
//
// API:
//   window.openMiniMessenger(handle?)  — open the panel; with a handle,
//     find-or-create a 1:1 dm and jump straight to that chat
//   window.closeMiniMessenger()
//
// Self-injects on DOMContentLoaded if running in app shell. Skips itself
// on /messages and inside the /messages or /otto iframe to avoid stacking.
// ══════════════════════════════════════════════════════════════════════════
(function vibeMiniMessengerInit() {
  if (window.__vibeMiniMessengerInjected) return;
  window.__vibeMiniMessengerInjected = true;

  // Skip when the page is itself the messages page (or its iframe), or
  // any other surface where a floating chat panel doesn't make sense.
  function shouldSkip() {
    try {
      const path = location.pathname || "";
      if (path.startsWith("/html/messages.html")) return true;
      if (path.startsWith("/html/otto.html")) return true;
      // /messages inside CampusAppShell loads messages.html in an iframe;
      // the iframe-internal check above catches that. The parent
      // React route never includes us anyway.
    } catch (_) {}
    return false;
  }
  if (shouldSkip()) return;

  // ── Helpers ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function avBg(seed) {
    const palette = ["#2D1B4E", "#3B1A00", "#2a2800", "#1A1A00", "#1A3A5C", "#2D3748", "#3B0764", "#1F2937"];
    const s = String(seed || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  function initialsOf(name) {
    return String(name || "?").split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
  }
  function fmtRel(iso) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const d = Date.now() - t;
    if (d < 60000) return "now";
    if (d < 3600000) return Math.floor(d / 60000) + "m";
    if (d < 86400000) return Math.floor(d / 3600000) + "h";
    if (d < 604800000) return Math.floor(d / 86400000) + "d";
    return new Date(iso).toLocaleDateString();
  }
  function meId() {
    try {
      const raw = localStorage.getItem("vibe_user_v1");
      const u = raw ? JSON.parse(raw) : null;
      return u && u.id ? u.id : null;
    } catch (_) { return null; }
  }

  // ── CSS (self-injected) ───────────────────────────────────────────────
  const style = document.createElement("style");
  style.id = "vibe-mini-messenger-css";
  style.textContent = `
    /* No floating button — pages provide their own trigger (nav-msg-btn).
       Panel sits at bottom-right; html.vmm-open slides Otto's corner ring
       left so it stays clickable while the panel is up. */
    .vmm-panel{position:fixed;bottom:24px;right:24px;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 44px);background:white;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.22),0 4px 16px rgba(0,0,0,.08);display:none;flex-direction:column;overflow:hidden;z-index:9995;font-family:'DM Sans',system-ui,sans-serif;border:1px solid rgba(28,28,30,.08);}
    .vmm-panel.show{display:flex;}
    html.vmm-open #ottoCorner{transform:translateX(-372px) !important;transition:transform .26s cubic-bezier(.2,.8,.2,1);}
    .vmm-hdr{padding:12px 14px;border-bottom:1px solid rgba(28,28,30,.08);display:flex;align-items:center;gap:10px;flex-shrink:0;background:white;}
    .vmm-hdr-title{font-family:'Fraunces',serif;font-weight:800;font-size:15px;flex:1;color:#1C1C1E;}
    .vmm-hdr-back{background:none;border:none;color:#8A8580;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:6px;}
    .vmm-hdr-back:hover{background:#FAF7F2;color:#1C1C1E;}
    .vmm-hdr-x{background:none;border:none;color:#8A8580;cursor:pointer;font-size:18px;line-height:1;padding:6px 8px;border-radius:6px;}
    .vmm-hdr-x:hover{background:#FAF7F2;color:#1C1C1E;}
    .vmm-hdr-link{font-size:11px;font-weight:600;color:#FF5C35;text-decoration:none;padding:4px 8px;border-radius:6px;}
    .vmm-hdr-link:hover{background:#FAF7F2;}
    .vmm-search{padding:10px 14px;border-bottom:1px solid rgba(28,28,30,.06);}
    .vmm-search input{width:100%;border:1.5px solid rgba(28,28,30,.08);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:13px;outline:none;}
    .vmm-search input:focus{border-color:rgba(28,28,30,.2);}
    .vmm-list{flex:1;overflow-y:auto;}
    .vmm-row{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(28,28,30,.04);}
    .vmm-row:hover{background:#FAF7F2;}
    .vmm-row.unread{background:rgba(255,92,53,.04);}
    .vmm-av{width:38px;height:38px;border-radius:11px;background:#1C1C1E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vmm-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vmm-info{flex:1;min-width:0;}
    .vmm-name{font-size:13.5px;font-weight:600;color:#1C1C1E;display:flex;align-items:center;gap:6px;}
    .vmm-prev{font-size:11.5px;color:#8A8580;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .vmm-row.unread .vmm-prev{color:#1C1C1E;font-weight:600;}
    .vmm-time{font-size:10.5px;color:#8A8580;flex-shrink:0;align-self:flex-start;padding-top:2px;}
    .vmm-empty{padding:32px 16px;text-align:center;color:#8A8580;font-size:12.5px;}
    .vmm-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:4px;background:#FAF7F2;}
    .vmm-msg{display:flex;gap:7px;align-items:flex-end;}
    .vmm-msg.mine{flex-direction:row-reverse;}
    .vmm-msg.gt{margin-top:8px;}
    .vmm-msg-av{width:24px;height:24px;border-radius:7px;background:#2D1B4E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:9px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vmm-msg-av.h{visibility:hidden;}
    .vmm-msg-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vmm-bubble{
      max-width:78%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;word-break:break-word;
      background:linear-gradient(180deg,rgba(20,16,28,0.82) 0%,rgba(14,11,22,0.86) 100%);
      backdrop-filter:blur(20px) saturate(160%);
      -webkit-backdrop-filter:blur(20px) saturate(160%);
      border:1px solid rgba(255,255,255,0.08);
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),0 4px 12px rgba(20,8,40,0.18);
      color:rgba(255,255,255,0.96);
    }
    .vmm-msg:not(.mine) .vmm-bubble{border-bottom-left-radius:4px;}
    .vmm-msg.mine .vmm-bubble{
      border-bottom-right-radius:4px;
      background:linear-gradient(180deg,rgba(255,92,53,0.22) 0%,rgba(255,92,53,0.06) 100%),linear-gradient(180deg,rgba(20,16,28,0.82) 0%,rgba(14,11,22,0.86) 100%);
      border-color:rgba(255,180,150,0.32);
    }
    .vmm-bubble-wrap{display:inline-flex;align-items:center;gap:6px;position:relative;max-width:100%;}
    .vmm-msg.mine .vmm-bubble-wrap{flex-direction:row-reverse;}
    .vmm-actions{display:none;align-items:center;gap:3px;padding:3px 6px;border-radius:999px;background:rgba(20,16,28,0.92);border:1px solid rgba(255,255,255,0.14);box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),0 4px 12px rgba(0,0,0,0.32);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);flex-shrink:0;}
    .vmm-bubble-wrap:hover .vmm-actions{display:inline-flex;}
    .vmm-act-emo{background:transparent;border:none;padding:1px 3px;font-size:13px;line-height:1;cursor:none;}
    .vmm-act-sep{width:1px;height:14px;background:rgba(255,255,255,0.16);margin:0 2px;}
    .vmm-act-reply{background:transparent;border:none;padding:1px 4px;color:rgba(255,255,255,0.88);font-size:10.5px;font-weight:700;font-family:inherit;cursor:none;display:inline-flex;align-items:center;gap:3px;}
    .vmm-rxs{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;}
    .vmm-msg.mine .vmm-rxs{justify-content:flex-end;}
    .vmm-rx{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:999px;background:rgba(20,16,28,0.55);border:1px solid rgba(255,255,255,0.10);color:rgba(255,255,255,0.85);font-family:inherit;font-size:11px;font-weight:600;cursor:none;}
    .vmm-rx.on{background:rgba(255,140,90,0.22);border-color:rgba(255,180,150,0.55);color:#FFD0BF;}
    .vmm-quote{margin-bottom:4px;padding:5px 8px;border-left:3px solid rgba(255,140,90,0.55);background:rgba(20,16,28,0.45);border-radius:7px;font-family:inherit;font-size:11px;color:rgba(255,255,255,0.78);max-width:fit-content;}
    .vmm-quote-author{font-weight:700;font-size:10px;color:rgba(255,180,150,0.95);margin-bottom:1px;}
    .vmm-quote-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;}
    .vmm-reply-pill{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 12px 4px;border-radius:10px;border:1px solid rgba(255,255,255,0.10);border-left:3px solid rgba(255,140,90,0.85);background:linear-gradient(180deg,rgba(20,16,28,0.82) 0%,rgba(14,11,22,0.86) 100%);}
    .vmm-reply-pill-info{flex:1;min-width:0;}
    .vmm-reply-pill-author{font-family:inherit;font-size:10.5px;font-weight:700;color:rgba(255,180,150,0.95);}
    .vmm-reply-pill-body{font-family:inherit;font-size:11px;color:rgba(255,255,255,0.78);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .vmm-reply-pill-x{width:20px;height:20px;border-radius:999px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);font-size:11px;line-height:1;cursor:none;}
    .vmm-comp{padding:10px 12px;border-top:1px solid rgba(28,28,30,.08);background:white;display:flex;gap:8px;align-items:flex-end;flex-shrink:0;}
    .vmm-comp textarea{flex:1;border:none;background:none;font-family:inherit;font-size:13.5px;color:#1C1C1E;resize:none;outline:none;line-height:1.45;min-height:22px;max-height:96px;padding:4px 0;}
    .vmm-comp textarea::placeholder{color:#8A8580;}
    .vmm-send{background:#FF5C35;color:white;border:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:filter .15s,transform .15s;}
    .vmm-send:hover{filter:brightness(1.05);}
    .vmm-send:disabled{background:rgba(28,28,30,.12);cursor:not-allowed;}
    .vmm-typing{display:inline-flex;gap:4px;padding:8px 12px;background:white;border-radius:14px;border-bottom-left-radius:4px;align-items:center;align-self:flex-start;margin-top:4px;}
    .vmm-typing-dot{width:5px;height:5px;border-radius:50%;background:#8A8580;opacity:.7;animation:vmmBounce 1.2s infinite;}
    .vmm-typing-dot:nth-child(2){animation-delay:.16s;}
    .vmm-typing-dot:nth-child(3){animation-delay:.32s;}
    @keyframes vmmBounce{0%,80%,100%{transform:translateY(0);opacity:.5;}40%{transform:translateY(-2px);opacity:1;}}
    .vmm-loading{padding:24px;text-align:center;color:#8A8580;font-size:12px;}
  `;
  document.head.appendChild(style);

  // ── Markup (panel only — no floating button; pages supply their own trigger) ──
  const panel = document.createElement("div");
  panel.className = "vmm-panel";
  panel.id = "vmmPanel";
  panel.innerHTML = `
    <div class="vmm-hdr" id="vmmHdr"></div>
    <div class="vmm-search" id="vmmSearch" style="display:none">
      <input id="vmmSearchInput" type="text" placeholder="Search chats…" autocomplete="off">
    </div>
    <div class="vmm-list" id="vmmList"></div>
    <div class="vmm-msgs" id="vmmMsgs" style="display:none"></div>
    <div class="vmm-comp" id="vmmComp" style="display:none">
      <textarea id="vmmInput" rows="1" placeholder="Message…"></textarea>
      <button class="vmm-send" id="vmmSend" disabled title="Send">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M13 1L1 6l5 2 2 5 5-12z" fill="white" stroke="white" stroke-width=".3"/>
        </svg>
      </button>
    </div>
  `;

  // ── State (declared before any function that touches it is invoked) ───
  const state = {
    open: false,
    view: "list", // 'list' | 'chat'
    activeChannel: null,
    threads: [],
    filtered: [],
    msgs: [],
    peerInfo: null,
    listPollTimer: null,
    chatPollTimer: null,
    bgPollTimer: null,
    LIST_POLL_MS: 5000,
    CHAT_POLL_MS: 2000,
    BG_POLL_MS: 30000,
    // Quote-reply target for the active chat (cleared on send / cancel /
    // chat switch). Shape: { id, channelId, authorName, content }.
    replyTo: null,
  };

  function attachWhenReady() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", attachWhenReady);
      return;
    }
    document.body.appendChild(panel);
    bindHandlers();
    startBackgroundPoll();
  }
  attachWhenReady();

  // ── Background poll (always-on, while panel is closed) ─────────────────
  // Just refreshes the unread badge so the user sees a new-message
  // indicator without opening the panel.
  function startBackgroundPoll() {
    if (state.bgPollTimer) clearInterval(state.bgPollTimer);
    refreshBadge();
    state.bgPollTimer = setInterval(() => {
      if (document.hidden) return;
      if (!state.open) refreshBadge();
    }, state.BG_POLL_MS);
  }
  async function refreshBadge() {
    try {
      const r = await fetch("/api/me/threads", { credentials: "include" });
      const j = await r.json();
      if (!j || !j.ok) return;
      const threads = j.threads || [];
      const now = Date.now();
      const unread = threads.reduce((n, t) => {
        if (!t.unread) return n;
        // Skip muted channels — that's the whole point of mute.
        if (t.muted_until && new Date(t.muted_until).getTime() > now) return n;
        return n + 1;
      }, 0);
      paintBadge(unread);
    } catch (_) { /* ignore */ }
  }
  // Update any nav-msg-btn icons on the host page (the existing dot-style
  // unread indicator on profile.html etc.) so the user sees a notification
  // mark without us injecting a second button.
  function paintBadge(n) {
    const navBtns = document.querySelectorAll(".nav-msg-btn");
    navBtns.forEach((b) => {
      if (n > 0) b.classList.add("has-unread");
      else b.classList.remove("has-unread");
    });
  }

  // ── Open / close ───────────────────────────────────────────────────────
  window.openMiniMessenger = async function (handle) {
    // Defensive: if attachWhenReady hasn't run yet (e.g., script ran
    // before document.body existed), append now so the panel actually
    // shows up in the DOM.
    if (!document.body) {
      console.warn("[mini.open] document.body missing; deferring");
      document.addEventListener("DOMContentLoaded", () => window.openMiniMessenger(handle));
      return;
    }
    if (!document.body.contains(panel)) {
      document.body.appendChild(panel);
      bindHandlers();
    }
    state.open = true;
    panel.classList.add("show");
    document.documentElement.classList.add("vmm-open");
    if (handle) {
      // Find-or-create a DM and jump to it.
      try {
        const r = await fetch("/api/me/threads", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const j = await r.json();
        if (j && j.ok && j.channel_id) {
          await loadThreadList();
          openChat(j.channel_id);
          return;
        }
      } catch (e) { console.error("[mini.openByHandle]", e); }
    }
    showListView();
    loadThreadList();
    if (state.listPollTimer) clearInterval(state.listPollTimer);
    state.listPollTimer = setInterval(() => {
      if (document.hidden) return;
      if (state.open && state.view === "list") loadThreadList();
    }, state.LIST_POLL_MS);
  };

  window.closeMiniMessenger = function () {
    state.open = false;
    panel.classList.remove("show");
    document.documentElement.classList.remove("vmm-open");
    if (state.listPollTimer) { clearInterval(state.listPollTimer); state.listPollTimer = null; }
    if (state.chatPollTimer) { clearInterval(state.chatPollTimer); state.chatPollTimer = null; }
    state.activeChannel = null;
    refreshBadge();
  };

  // Toggle alias — useful for inline onclick="toggleMessenger()" handlers
  // that run before any host-page script has redefined toggleMessenger.
  window.toggleMessenger = function (handle) {
    if (state.open) window.closeMiniMessenger();
    else window.openMiniMessenger(handle);
  };

  // ── List view ──────────────────────────────────────────────────────────
  function showListView() {
    state.view = "list";
    state.activeChannel = null;
    if (state.chatPollTimer) { clearInterval(state.chatPollTimer); state.chatPollTimer = null; }
    document.getElementById("vmmHdr").innerHTML = `
      <div class="vmm-hdr-title">Messages</div>
      <a class="vmm-hdr-link" href="/messages">Open</a>
      <button class="vmm-hdr-x" type="button" onclick="window.closeMiniMessenger()">×</button>
    `;
    document.getElementById("vmmSearch").style.display = "";
    document.getElementById("vmmList").style.display = "";
    document.getElementById("vmmMsgs").style.display = "none";
    document.getElementById("vmmComp").style.display = "none";
    paintList();
  }

  async function loadThreadList() {
    try {
      const r = await fetch("/api/me/threads", { credentials: "include" });
      const j = await r.json();
      if (!j || !j.ok) return;
      state.threads = j.threads || [];
      state.filtered = state.threads.slice();
      const now = Date.now();
      const unread = state.threads.reduce((n, t) => {
        if (!t.unread) return n;
        if (t.muted_until && new Date(t.muted_until).getTime() > now) return n;
        return n + 1;
      }, 0);
      paintBadge(unread);
      if (state.view === "list") paintList();
    } catch (e) { console.error("[mini.loadThreadList]", e); }
  }

  function paintList() {
    const el = document.getElementById("vmmList");
    if (!el) return;
    if (state.threads.length === 0) {
      el.innerHTML = `<div class="vmm-empty">No conversations yet.<br><a href="/messages" style="color:#FF5C35;font-weight:600;text-decoration:none">Start one</a></div>`;
      return;
    }
    if (state.filtered.length === 0) {
      el.innerHTML = `<div class="vmm-empty">No matches.</div>`;
      return;
    }
    el.innerHTML = state.filtered.map(rowHtml).join("");
    Array.from(el.querySelectorAll(".vmm-row")).forEach((row) => {
      row.addEventListener("click", () => openChat(row.dataset.cid));
    });
  }

  function rowHtml(t) {
    const isGroup = t.type === "group";
    const peer = t.peer || {};
    const name = t.name || peer.name || "Unknown";
    const seed = isGroup ? t.id : (peer.id || peer.handle || name);
    let av;
    if (isGroup && t.photo_url) {
      av = `<div class="vmm-av" style="background:${avBg(seed)}"><img src="${esc(t.photo_url)}" alt=""></div>`;
    } else if (isGroup) {
      av = `<div class="vmm-av" style="background:${avBg(seed)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="9" r="3.5" stroke="white" stroke-width="1.5" fill="none"/><circle cx="16" cy="9" r="3.5" stroke="white" stroke-width="1.5" fill="none"/><path d="M3 19c0-2.5 2.4-4 5-4s5 1.5 5 4M11 19c0-2.5 2.4-4 5-4s5 1.5 5 4" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></div>`;
    } else if (peer.avatar_url) {
      av = `<div class="vmm-av" style="background:${avBg(seed)}"><img src="${esc(peer.avatar_url)}" alt=""></div>`;
    } else {
      av = `<div class="vmm-av" style="background:${avBg(seed)}">${esc(initialsOf(name))}</div>`;
    }
    const prev = t.last_message?.content || (t.is_request ? "New message request" : "No messages yet");
    const time = fmtRel(t.last_message?.created_at);
    return `<div class="vmm-row${t.unread ? " unread" : ""}" data-cid="${esc(t.id)}">
      ${av}
      <div class="vmm-info">
        <div class="vmm-name">${esc(name)}</div>
        <div class="vmm-prev">${esc(prev)}</div>
      </div>
      <div class="vmm-time">${esc(time)}</div>
    </div>`;
  }

  // ── Chat view ──────────────────────────────────────────────────────────
  async function openChat(channelId) {
    if (!channelId) return;
    state.view = "chat";
    state.activeChannel = channelId;
    // Switching chats: drop any pending reply target (it was tied to the
    // previous channel and the API would reject a cross-channel parent).
    state.replyTo = null;
    if (typeof renderReplyPill === "function") renderReplyPill();
    if (state.listPollTimer) { clearInterval(state.listPollTimer); state.listPollTimer = null; }

    // Resolve peer info from current threads list (or wait for next load).
    const t = state.threads.find((x) => x.id === channelId);
    const peer = t ? (t.peer || {}) : {};
    const isGroup = t ? t.type === "group" : false;
    const name = (t && t.name) || peer.name || "Chat";
    state.peerInfo = {
      name,
      avatar_url: !isGroup ? peer.avatar_url : null,
      handle: peer.handle,
      isGroup,
      photoUrl: isGroup ? (t && t.photo_url) : null,
      id: t ? t.id : channelId,
    };

    let avatarHtml;
    if (isGroup && state.peerInfo.photoUrl) {
      avatarHtml = `<div class="vmm-av" style="width:32px;height:32px;background:${avBg(state.peerInfo.id)}"><img src="${esc(state.peerInfo.photoUrl)}" alt=""></div>`;
    } else if (isGroup) {
      avatarHtml = `<div class="vmm-av" style="width:32px;height:32px;background:${avBg(state.peerInfo.id)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="9" r="3.5" stroke="white" stroke-width="1.5"/><circle cx="16" cy="9" r="3.5" stroke="white" stroke-width="1.5"/></svg></div>`;
    } else if (state.peerInfo.avatar_url) {
      avatarHtml = `<div class="vmm-av" style="width:32px;height:32px;background:${avBg(state.peerInfo.handle || state.peerInfo.id)}"><img src="${esc(state.peerInfo.avatar_url)}" alt=""></div>`;
    } else {
      avatarHtml = `<div class="vmm-av" style="width:32px;height:32px;background:${avBg(state.peerInfo.handle || state.peerInfo.id)}">${esc(initialsOf(name))}</div>`;
    }
    document.getElementById("vmmHdr").innerHTML = `
      <button class="vmm-hdr-back" type="button" id="vmmBack" title="Back to chats">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
      ${avatarHtml}
      <div class="vmm-hdr-title" style="font-size:13.5px;font-family:'DM Sans',system-ui,sans-serif;font-weight:700">${esc(name)}</div>
      <a class="vmm-hdr-link" href="/messages?to=${peer.handle ? encodeURIComponent(peer.handle) : ""}">Expand</a>
      <button class="vmm-hdr-x" type="button" onclick="window.closeMiniMessenger()">×</button>
    `;
    document.getElementById("vmmBack").addEventListener("click", showListView);
    document.getElementById("vmmSearch").style.display = "none";
    document.getElementById("vmmList").style.display = "none";
    document.getElementById("vmmMsgs").style.display = "";
    document.getElementById("vmmMsgs").innerHTML = `<div class="vmm-loading">Loading…</div>`;
    document.getElementById("vmmComp").style.display = "";
    document.getElementById("vmmInput").value = "";
    document.getElementById("vmmInput").focus();
    autoSize();
    updateSendDisabled();

    // Mark read.
    fetch(`/api/me/threads/${encodeURIComponent(channelId)}/read`, { method: "POST", credentials: "include" }).catch(() => {});
    await loadMessages();

    // Pin to bottom (newest) when opening a chat — paintMessages already
    // tried to, but we double up after the next frame in case layout is
    // still settling (avatar images loading, etc).
    requestAnimationFrame(() => {
      const el = document.getElementById("vmmMsgs");
      if (el) el.scrollTop = el.scrollHeight;
    });

    if (state.chatPollTimer) clearInterval(state.chatPollTimer);
    state.chatPollTimer = setInterval(() => {
      if (document.hidden) return;
      if (state.activeChannel === channelId) loadMessages();
    }, state.CHAT_POLL_MS);
  }

  async function loadMessages() {
    const cid = state.activeChannel;
    if (!cid) return;
    try {
      const r = await fetch(`/api/me/threads/${encodeURIComponent(cid)}/messages?limit=50`, { credentials: "include" });
      const j = await r.json();
      if (!j || !j.ok) return;
      state.msgs = (j.messages || []).map((m) => ({
        id: m.id,
        mine: m.user_id === meId(),
        content: m.content || "",
        created_at: m.created_at,
        media: m.media_url ? { url: m.media_url, kind: m.media_kind } : null,
        attachment: m.attachment_id ? { id: m.attachment_id, kind: m.attachment_kind } : null,
        senderName: (m.users && (m.users.name || m.users.handle)) || "",
        senderAvatar: m.users && m.users.avatar_url,
        senderId: m.user_id,
        senderHandle: m.users && m.users.handle,
        reactions: Array.isArray(m.reactions) ? m.reactions : [],
        parentPreview: m.parent_preview || null,
      }));
      paintMessages();
    } catch (e) { console.error("[mini.loadMessages]", e); }
  }

  function paintMessages() {
    const el = document.getElementById("vmmMsgs");
    if (!el) return;
    const wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 80;
    // Capture position BEFORE innerHTML reset, so if the user was reading
    // older messages we restore where they were instead of yanking them
    // back to the top (the default scrollTop after innerHTML replace).
    const prevScrollTop = el.scrollTop;
    if (state.msgs.length === 0) {
      el.innerHTML = `<div class="vmm-empty" style="margin:auto">Say hi 👋</div>`;
      return;
    }
    let h = "";
    let lastSender = null;
    state.msgs.forEach((m, i) => {
      const gb = m.senderId !== lastSender;
      const showAv = !m.mine && (gb || i === 0);
      const gc = gb && i > 0 ? " gt" : "";
      let av;
      if (m.senderAvatar) {
        av = `<div class="vmm-msg-av${showAv ? "" : " h"}" style="background:${avBg(m.senderHandle || m.senderId)}"><img src="${esc(m.senderAvatar)}" alt=""></div>`;
      } else {
        av = `<div class="vmm-msg-av${showAv ? "" : " h"}" style="background:${avBg(m.senderHandle || m.senderId)}">${esc(initialsOf(m.senderName))}</div>`;
      }
      let body = "";
      if (m.media) {
        body = m.media.kind === "video"
          ? `<video src="${esc(m.media.url)}" controls playsinline preload="metadata" style="max-width:240px;border-radius:10px;display:block;background:#000;"></video>`
          : `<img src="${esc(m.media.url)}" alt="" style="max-width:240px;border-radius:10px;display:block;">`;
        if (m.content) body += `<div class="vmm-bubble" style="margin-top:4px">${esc(m.content)}</div>`;
        h += `<div class="vmm-msg${m.mine ? " mine" : ""}${gc}">${!m.mine ? av : ""}<div style="display:flex;flex-direction:column;align-items:${m.mine ? "flex-end" : "flex-start"};gap:3px;">${body}</div></div>`;
      } else if (m.attachment) {
        h += `<div class="vmm-msg${m.mine ? " mine" : ""}${gc}">${!m.mine ? av : ""}<div class="vmm-bubble">${m.content ? esc(m.content) + "<br>" : ""}<a href="/messages" style="color:inherit;text-decoration:underline;font-size:11.5px">View ${m.attachment.kind === "clip" ? "clip" : "post"}</a></div></div>`;
      } else {
        // Quote-stub if this is a reply; reaction chips below; hover pill
        // with 5 reactions + Reply trigger.
        let stub = "";
        if (m.parentPreview) {
          const author = (m.parentPreview.author && (m.parentPreview.author.name || m.parentPreview.author.handle)) || "message";
          const txt = (m.parentPreview.content || "(media)").slice(0, 140);
          stub = `<div class="vmm-quote"><div class="vmm-quote-author">↩ ${esc(author)}</div><div class="vmm-quote-body">${esc(txt)}</div></div>`;
        }
        const emos = ["❤️","👍","👎","😂","🔥"];
        const actBtns = emos.map((e) =>
          `<button type="button" class="vmm-act-emo" onclick="event.stopPropagation();window.__vmmToggleReaction('${esc(m.id)}','${esc(e)}')" aria-label="React with ${esc(e)}">${e}</button>`
        ).join("");
        const actions = `<div class="vmm-actions">${actBtns}<span class="vmm-act-sep"></span><button type="button" class="vmm-act-reply" onclick="event.stopPropagation();window.__vmmStartReply('${esc(m.id)}')" aria-label="Reply">↩ Reply</button></div>`;
        const chips = (m.reactions && m.reactions.length > 0)
          ? '<div class="vmm-rxs">' + m.reactions.map((r) =>
              `<button type="button" class="vmm-rx${r.viewer_reacted ? " on" : ""}" onclick="window.__vmmToggleReaction('${esc(m.id)}','${esc(r.emoji)}')"><span>${r.emoji}</span><span>${r.count}</span></button>`
            ).join("") + '</div>'
          : "";
        const wrap = `<div class="vmm-bubble-wrap"><div class="vmm-bubble">${esc(m.content)}</div>${actions}</div>`;
        const stack = `<div style="display:flex;flex-direction:column;align-items:${m.mine ? "flex-end" : "flex-start"};max-width:100%;min-width:0;">${stub}${wrap}${chips}</div>`;
        h += `<div class="vmm-msg${m.mine ? " mine" : ""}${gc}">${!m.mine ? av : ""}${stack}</div>`;
      }
      lastSender = m.senderId;
    });
    el.innerHTML = h;
    if (wasAtBottom || state.msgs.length === 1) {
      // Defer to next frame so layout settles before we measure scrollHeight.
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    } else {
      // User was scrolled up — restore their reading position so polling
      // doesn't yank them back to the top.
      el.scrollTop = prevScrollTop;
    }
  }

  // ── Composer ───────────────────────────────────────────────────────────
  function autoSize() {
    const t = document.getElementById("vmmInput");
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 96) + "px";
  }
  function updateSendDisabled() {
    const t = document.getElementById("vmmInput");
    const b = document.getElementById("vmmSend");
    if (!t || !b) return;
    b.disabled = !t.value.trim();
  }
  async function sendCurrent() {
    const t = document.getElementById("vmmInput");
    const cid = state.activeChannel;
    const txt = (t.value || "").trim();
    if (!cid || !txt) return;
    const sendBtn = document.getElementById("vmmSend");
    sendBtn.disabled = true;
    const replyParent = state.replyTo && state.replyTo.channelId === cid
      ? state.replyTo.id
      : null;
    try {
      const r = await fetch(`/api/me/threads/${encodeURIComponent(cid)}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: txt,
          ...(replyParent ? { parent_message_id: replyParent } : {}),
        }),
      });
      const j = await r.json();
      if (!j || !j.ok) throw new Error((j && j.error) || "Send failed");
      t.value = "";
      autoSize();
      // Clear reply target on successful send.
      state.replyTo = null;
      renderReplyPill();
      await loadMessages();
      const el = document.getElementById("vmmMsgs");
      if (el) el.scrollTop = el.scrollHeight;
      loadThreadList();
    } catch (e) {
      console.error("[mini.send]", e);
      alert("Could not send: " + (e.message || e));
    } finally {
      updateSendDisabled();
    }
  }

  function renderReplyPill() {
    const root = document.getElementById("vmmRoot") || document.body;
    let pill = document.getElementById("vmmReplyPill");
    const r = state.replyTo;
    if (!r) {
      if (pill) pill.remove();
      return;
    }
    const composer = document.querySelector(".vmm-comp");
    if (!composer) return;
    if (!pill) {
      pill = document.createElement("div");
      pill.id = "vmmReplyPill";
      pill.className = "vmm-reply-pill";
      composer.parentNode.insertBefore(pill, composer);
    }
    pill.innerHTML = ''
      + '<div class="vmm-reply-pill-info">'
      +   '<div class="vmm-reply-pill-author">↩ Replying to ' + esc(r.authorName) + '</div>'
      +   '<div class="vmm-reply-pill-body">' + esc((r.content || '').slice(0, 200) || '(media)') + '</div>'
      + '</div>'
      + '<button type="button" class="vmm-reply-pill-x" onclick="window.__vmmCancelReply()" aria-label="Cancel reply">×</button>';
    // Prevent the unused-variable lint warning if root ends up unused.
    void root;
  }

  // ── Window-level handlers (called from message render onclicks) ──────
  window.__vmmToggleReaction = async function (messageId, emoji) {
    const cid = state.activeChannel;
    if (!cid || !messageId || !emoji) return;
    const msg = state.msgs.find((x) => x.id === messageId);
    if (!msg) return;
    msg.reactions = Array.isArray(msg.reactions) ? msg.reactions : [];
    const found = msg.reactions.find((r) => r.emoji === emoji);
    let nextActive;
    if (found && found.viewer_reacted) {
      const c = Math.max(0, found.count - 1);
      if (c === 0) msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji);
      else { found.count = c; found.viewer_reacted = false; }
      nextActive = false;
    } else if (found) {
      found.count += 1;
      found.viewer_reacted = true;
      nextActive = true;
    } else {
      msg.reactions.push({ emoji, count: 1, viewer_reacted: true });
      nextActive = true;
    }
    paintMessages();
    try {
      const res = await fetch(`/api/me/threads/${encodeURIComponent(cid)}/messages/${encodeURIComponent(messageId)}/react`, {
        method: nextActive ? "POST" : "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("react " + res.status);
    } catch (e) {
      console.error("[mini.react]", e);
      // Roll back via fresh fetch.
      loadMessages();
    }
  };

  window.__vmmStartReply = function (messageId) {
    const cid = state.activeChannel;
    if (!cid || !messageId) return;
    const msg = state.msgs.find((x) => x.id === messageId);
    if (!msg) return;
    state.replyTo = {
      id: messageId,
      channelId: cid,
      authorName: msg.senderName || "message",
      content: msg.content || "(media)",
    };
    renderReplyPill();
    const inp = document.getElementById("vmmInput");
    if (inp) inp.focus();
  };

  window.__vmmCancelReply = function () {
    state.replyTo = null;
    renderReplyPill();
  };

  function bindHandlers() {
    const t = document.getElementById("vmmInput");
    const b = document.getElementById("vmmSend");
    const search = document.getElementById("vmmSearchInput");
    if (t) {
      t.addEventListener("input", () => { autoSize(); updateSendDisabled(); });
      t.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
      });
    }
    if (b) b.addEventListener("click", sendCurrent);
    // Channel-scoped mention picker — only members of the active chat
    // surface as suggestions when @-typing in the mini composer.
    if (t && window.vibeBindMentionPicker) {
      window.vibeBindMentionPicker(t, { getChannelId: () => state.activeChannel });
    }
    if (search) {
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        if (!q) state.filtered = state.threads.slice();
        else state.filtered = state.threads.filter((x) => {
          const hay = [x.name, x.peer?.name, x.peer?.handle, ...((x.members || []).map((m) => m.name || m.handle))].filter(Boolean).join(" ").toLowerCase();
          return hay.includes(q);
        });
        paintList();
      });
    }
  }
})();
