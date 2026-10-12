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
// With the new chat (`chat_v2` from /api/me/features) Messages is a TAB OF
// OTTO'S PANEL (_otto.js, #ottoPanel), as on the shelled pages
// (OttoSidePanel.tsx + MiniMessenger.tsx: change one, change the other). The
// tab frames /messages?mini=1, the phone's Messages itself (Your week, one
// row per club, unread marks, pinned first), and a tap opens the chat in the
// panel, with its composer. The page in the frame sends the whole tab
// anywhere that is not Messages (src/components/desktop/messages/
// MiniFrame.tsx). The top-bar Messages icon opens Otto's panel on that tab;
// unread chats light Otto's ring too. Nothing below the "List view" line
// runs then. Without `chat_v2` (the switch off, or the answer not learned)
// the panel is the old list and chat, unchanged.
//
// Self-injects on DOMContentLoaded. Skips itself on /messages (and inside the /messages iframe) to avoid stacking.
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
  // A photo-only or shared-post last message carries no content; the kind
  // columns from /api/me/threads say what it was. "" when there is no last
  // message at all, so the caller keeps its own copy for that case.
  function lastMessageLabel(lm) {
    if (!lm) return "";
    const c = (lm.content || "").trim();
    if (c) return c;
    if (lm.media_kind === "video") return "Video";
    if (lm.media_kind === "image") return "Photo";
    if (lm.attachment_kind === "clip") return "Shared a clip";
    if (lm.attachment_kind === "post") return "Shared a post";
    return "Attachment";
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
  // In-conversation chat time — always hour:minute.
  function fmtChatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  // iMessage-style date+time separator label. Always ends in the time
  // ("Yesterday 7:05 PM", "Today 3:42 PM") so the user reads both the
  // relative day and the exact moment the conversation picked up.
  function fmtChatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    let day;
    if (diff === 0) day = "Today";
    else if (diff === 1) day = "Yesterday";
    else if (diff > 1 && diff < 7) day = d.toLocaleDateString([], { weekday: "long" });
    else {
      const sameYear = d.getFullYear() === now.getFullYear();
      day = d.toLocaleDateString(
        [],
        sameYear ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" },
      );
    }
    return day + " " + time;
  }
  // Same heuristic the legacy /messages page uses: emit on day change
  // or after a >1 hour gap so back-and-forth threads stay clean and a
  // fresh conversation block gets a fresh "Yesterday 9:21 PM" marker.
  const VMM_GAP_MS = 60 * 60 * 1000;
  function shouldShowSep(prevIso, currIso) {
    if (!currIso) return false;
    if (!prevIso) return true;
    const pa = new Date(prevIso), pb = new Date(currIso);
    if (Number.isNaN(pa.getTime()) || Number.isNaN(pb.getTime())) return false;
    const sameDay = pa.getFullYear() === pb.getFullYear() && pa.getMonth() === pb.getMonth() && pa.getDate() === pb.getDate();
    if (!sameDay) return true;
    return (pb.getTime() - pa.getTime()) > VMM_GAP_MS;
  }
  function meId() {
    try {
      const raw = localStorage.getItem("vibe_user_v1");
      const u = raw ? JSON.parse(raw) : null;
      return u && u.id ? u.id : null;
    } catch (_) { return null; }
  }
  // Club chat v1: a refusal is matched on its `code`, never on the status
  // or the sentence, and shows the sentence the server sent. The same words
  // as REFUSAL_SENTENCES in src/lib/chat/types.ts.
  const CHAT_REFUSALS = {
    board_officers_only: "Only officers post here.",
    room_closed: "This chat is closed.",
    room_posters_only: "Only some people can post here.",
    club_media_off: "Photos and videos are off in club chats for now.",
    board_post_missing: "That post is no longer there.",
    try_again: "Try again in a moment.",
  };
  function chatRefusalLine(body) {
    if (!body || typeof body.code !== "string") return "";
    if (!Object.prototype.hasOwnProperty.call(CHAT_REFUSALS, body.code)) return "";
    return (typeof body.error === "string" && body.error.trim()) || CHAT_REFUSALS[body.code];
  }

  // ── CSS (self-injected) ───────────────────────────────────────────────
  const style = document.createElement("style");
  style.id = "vibe-mini-messenger-css";
  style.textContent = `
    /* No floating button — pages provide their own trigger (nav-msg-btn).
       Panel sits at bottom-right; html.vmm-open slides Otto's corner ring
       left so it stays clickable while the panel is up. */
    .vmm-panel{position:fixed;bottom:24px;right:24px;width:420px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 44px);background:var(--paper, white);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.22),0 4px 16px rgba(0,0,0,.08);display:none;flex-direction:column;overflow:hidden;z-index:9995;font-family:'DM Sans',system-ui,sans-serif;border:1px solid rgba(var(--scrim-rgb, 28,28,30),.08);}
    .vmm-panel.show{display:flex;}
    html.vmm-open #ottoCorner{transform:translateX(-372px) !important;transition:transform .26s cubic-bezier(.2,.8,.2,1);}
    .vmm-hdr{padding:12px 14px;border-bottom:1px solid rgba(var(--scrim-rgb, 28,28,30),.08);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--paper, white);}
    .vmm-hdr-title{font-family:'Fraunces',serif;font-weight:800;font-size:15px;flex:1;color:var(--charcoal, #1C1C1E);}
    .vmm-hdr-back{background:none;border:none;color:var(--ink-muted, #6C6761);cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;border-radius:6px;}
    .vmm-hdr-back:hover{background:var(--cream, #FAF7F2);color:var(--charcoal, #1C1C1E);}
    .vmm-hdr-x{background:none;border:none;color:var(--ink-muted, #6C6761);cursor:pointer;font-size:18px;line-height:1;padding:6px 8px;border-radius:6px;}
    .vmm-hdr-x:hover{background:var(--cream, #FAF7F2);color:var(--charcoal, #1C1C1E);}
    .vmm-hdr-link{font-size:11px;font-weight:600;color:#FF5C35;text-decoration:none;padding:4px 8px;border-radius:6px;}
    .vmm-hdr-link:hover{background:var(--cream, #FAF7F2);}
    .vmm-search{padding:10px 14px;border-bottom:1px solid rgba(var(--scrim-rgb, 28,28,30),.06);}
    .vmm-search input{width:100%;background:var(--paper, #FFFFFF);border:1.5px solid rgba(var(--scrim-rgb, 28,28,30),.08);border-radius:10px;padding:8px 12px;font-family:inherit;font-size:13px;outline:none;}
    .vmm-search input:focus{border-color:rgba(var(--scrim-rgb, 28,28,30),.2);}
    .vmm-list{flex:1;overflow-y:auto;}
    .vmm-row{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(var(--scrim-rgb, 28,28,30),.04);}
    .vmm-row:hover{background:var(--cream, #FAF7F2);}
    .vmm-row.unread{background:rgba(255,92,53,.04);}
    .vmm-av{width:38px;height:38px;border-radius:11px;background:#1C1C1E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:13px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vmm-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vmm-info{flex:1;min-width:0;}
    .vmm-name{font-size:13.5px;font-weight:600;color:var(--charcoal, #1C1C1E);display:flex;align-items:center;gap:6px;}
    .vmm-prev{font-size:11.5px;color:var(--ink-muted, #6C6761);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .vmm-row.unread .vmm-prev{color:var(--charcoal, #1C1C1E);font-weight:600;}
    .vmm-time{font-size:10.5px;color:var(--ink-muted, #6C6761);flex-shrink:0;align-self:flex-start;padding-top:2px;}
    .vmm-empty{padding:32px 16px;text-align:center;color:var(--ink-muted, #6C6761);font-size:12.5px;}
    .vmm-date-sep{text-align:center;font-family:'DM Sans',sans-serif;font-size:10.5px;color:var(--ink-muted, #6C6761);margin:10px 0 6px;letter-spacing:.2px;}
    .vmm-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:9px;background:var(--cream, #FAF7F2);}
    .vmm-msg{display:flex;gap:7px;align-items:flex-end;}
    .vmm-msg.mine{flex-direction:row-reverse;}
    .vmm-msg.gt{margin-top:14px;}
    .vmm-msg-av{width:24px;height:24px;border-radius:7px;background:#2D1B4E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:9px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vmm-msg-av.h{visibility:hidden;}
    .vmm-msg-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vmm-bubble{
      /* No max-width here — that combined with inline-flex parent
         created circular sizing and collapsed bubbles to narrow strips.
         Cap lives on the message column via .vmm-msg > div below. */
      padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;
      overflow-wrap:anywhere;word-break:normal;
      background:linear-gradient(180deg,rgba(20,16,28,0.82) 0%,rgba(14,11,22,0.86) 100%);
      backdrop-filter:blur(20px) saturate(160%);
      -webkit-backdrop-filter:blur(20px) saturate(160%);
      border:1px solid rgba(255,255,255,0.08);
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),0 4px 12px rgba(20,8,40,0.18);
      color:rgba(255,255,255,0.96);
    }
    /* Cap the message column at 70% of the row so long messages wrap
       sensibly but short ones still hug their content. */
    .vmm-msg > div:not(.vmm-msg-av){max-width:70%;}
    .vmm-msg:not(.mine) .vmm-bubble{border-bottom-left-radius:4px;}
    .vmm-msg.mine .vmm-bubble{
      border-bottom-right-radius:4px;
      background:linear-gradient(180deg,rgba(255,92,53,0.22) 0%,rgba(255,92,53,0.06) 100%),linear-gradient(180deg,rgba(20,16,28,0.82) 0%,rgba(14,11,22,0.86) 100%);
      border-color:rgba(255,180,150,0.32);
    }
    .vmm-bubble-wrap{display:inline-flex;align-items:center;gap:6px;position:relative;max-width:100%;}
    .vmm-msg.mine .vmm-bubble-wrap{flex-direction:row-reverse;}
    /* Picker floats absolutely beside the bubble — was inline-flex
       before, which forced long bubbles to re-wrap when the pill
       appeared (visible reflow on hover). */
    .vmm-actions{display:none;position:absolute;top:50%;transform:translateY(-50%);z-index:5;align-items:center;gap:3px;padding:3px 6px;border-radius:999px;background:rgba(20,16,28,0.92);border:1px solid rgba(255,255,255,0.14);box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),0 4px 12px rgba(0,0,0,0.32);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);flex-shrink:0;white-space:nowrap;}
    .vmm-msg:not(.mine) .vmm-actions{left:calc(100% + 8px);top:50%;transform:translateY(-50%);}
    .vmm-msg.mine .vmm-actions{right:calc(100% + 8px);top:50%;transform:translateY(-50%);}
    /* Long messages — stack the picker ABOVE the bubble so it doesn't
       run off the panel's right edge. Override the side placement. */
    .vmm-msg.is-long:not(.mine) .vmm-actions{left:0;right:auto;top:auto;bottom:calc(100% + 6px);transform:none;}
    .vmm-msg.is-long.mine .vmm-actions{right:0;left:auto;top:auto;bottom:calc(100% + 6px);transform:none;}
    .vmm-bubble-wrap.show-actions .vmm-actions{display:inline-flex;}
    .vmm-act-emo{background:transparent;border:none;padding:0;width:24px;height:24px;font-size:13px;line-height:1;cursor:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;transition:background-color .14s ease, box-shadow .14s ease;}
    .vmm-act-emo.on{background:rgba(255,140,90,0.22);box-shadow:0 0 0 1.5px rgba(255,180,150,0.7), inset 0 1px 0 rgba(255,255,255,0.10);}
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
    .vmm-comp{padding:10px 12px;border-top:1px solid rgba(var(--scrim-rgb, 28,28,30),.08);background:var(--paper, white);display:flex;gap:8px;align-items:flex-end;flex-shrink:0;}
    .vmm-comp textarea{flex:1;border:none;background:none;font-family:inherit;font-size:13.5px;color:var(--charcoal, #1C1C1E);resize:none;outline:none;line-height:1.45;min-height:22px;max-height:96px;padding:4px 0;}
    .vmm-comp textarea::placeholder{color:var(--ink-muted, #6C6761);}
    .vmm-send{background:#FF5C35;color:white;border:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:filter .15s,transform .15s;}
    .vmm-send:hover{filter:brightness(1.05);}
    .vmm-send:disabled{background:rgba(var(--scrim-rgb, 28,28,30),.12);cursor:not-allowed;}
    /* Club chat v1: the quiet line that stands in for the composer in a room
       the viewer can't post in. The composer's own surface and tokens. */
    .vmm-quiet{padding:14px 16px;min-height:44px;box-sizing:border-box;border-top:1px solid rgba(var(--scrim-rgb, 28,28,30),.08);background:var(--paper, white);color:var(--ink-2, #5C5853);font-size:12.5px;font-weight:600;line-height:1.3;text-align:center;flex-shrink:0;}
    .vmm-typing{display:inline-flex;gap:4px;padding:8px 12px;background:var(--paper, white);border-radius:14px;border-bottom-left-radius:4px;align-items:center;align-self:flex-start;margin-top:4px;}
    .vmm-typing-dot{width:5px;height:5px;border-radius:50%;background:var(--ink-muted, #6C6761);opacity:.7;animation:vmmBounce 1.2s infinite;}
    .vmm-typing-dot:nth-child(2){animation-delay:.16s;}
    .vmm-typing-dot:nth-child(3){animation-delay:.32s;}
    @keyframes vmmBounce{0%,80%,100%{transform:translateY(0);opacity:.5;}40%{transform:translateY(-2px);opacity:1;}}
    /* The new inbox, framed. The frame's page paints its own background. */
    .vmm-frame{flex:1;min-height:0;width:100%;border:none;display:block;background:#141416;color-scheme:normal;}
    /* Otto's panel, its two tabs (the pills of OttoSidePanel.tsx PanelTabs). */
    .vmm-tabs{flex-shrink:0;display:flex;align-items:center;gap:6px;padding:10px 18px;border-bottom:0.5px solid rgba(255,255,255,.06);font-family:'DM Sans',system-ui,sans-serif;}
    .vmm-tab{height:30px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.72);font-family:inherit;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:none;}
    .vmm-tab[aria-selected="true"]{border-color:transparent;background:#FAF7F2;color:#141416;}
    .vmm-tab-n{min-width:18px;height:18px;box-sizing:border-box;padding:0 5px;border-radius:999px;background:#FF5C35;color:#140806;font-size:11.5px;font-weight:800;line-height:1;display:inline-flex;align-items:center;justify-content:center;}
    .vmm-tab-new{width:30px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);display:inline-flex;align-items:center;justify-content:center;cursor:none;padding:0;}
    .vmm-tab-open{height:30px;padding:0 10px;border-radius:999px;border:none;background:transparent;color:#FF8A66;font-family:inherit;font-size:12px;font-weight:700;cursor:none;}
    #ottoPanel.vmm-on-messages .otto-panel-body,#ottoPanel.vmm-on-messages .otto-panel-footer{display:none;}
    /* The pointer is inside the frame, which draws its own cursor: the
       page's dot and ring would sit frozen on the frame's edge. */
    html.vmm-over-frame #cursor,html.vmm-over-frame #cursorRing{opacity:0 !important;}
    .vmm-loading{padding:24px;text-align:center;color:var(--ink-muted, #6C6761);font-size:12px;}
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
    <div class="vmm-quiet" id="vmmQuiet" role="note" style="display:none"></div>
  `;

  // ── State (declared before any function that touches it is invoked) ───
  const state = {
    open: false,
    view: "list", // 'list' | 'chat' | 'inbox' (the framed new inbox)
    activeChannel: null,
    threads: [],
    filtered: [],
    msgs: [],
    // First-load flags: until these are set an empty list (or thread) means
    // "still loading", not "nothing here".
    listLoaded: false,
    chatLoaded: {},               // channelId → true once its messages painted
    // The first list load failed. Kept here because paintList runs again on
    // every search keystroke and on every return from a chat — without it
    // those repaint "Loading…" over the reason.
    listFailure: null,

    peerInfo: null,
    // Club chat v1, for the open chat: the kind of club room it is (null on
    // a dm or a group) and whether the viewer may post in it. From the list
    // entry first, then from the thread read. A server that sends neither
    // leaves the composer as it always was.
    roomKind: null,
    canPost: true,
    // The room's own who-can-post sentence, when the thread read sends one
    // (viewer.post_line): it is the quiet line then.
    postLine: "",
    listPollTimer: null,
    chatPollTimer: null,
    bgPollTimer: null,
    LIST_POLL_MS: 5000,
    CHAT_POLL_MS: 2000,
    BG_POLL_MS: 30000,
    // Quote-reply target for the active chat (cleared on send / cancel /
    // chat switch). Shape: { id, channelId, authorName, content }.
    replyTo: null,
    // Number of reaction toggles in flight. While > 0, polling-driven
    // loadMessages calls skip — keeps optimistic chips from being
    // clobbered by a stale poll racing with our POST.
    pendingReactions: 0,
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
  // Does this person have the new chat? Asked once per page; a failed ask
  // is asked again next time, and reads as "no" until then (the old panel).
  let featuresAsk = null;
  function hasNewChat() {
    if (!featuresAsk) {
      featuresAsk = fetch("/api/me/features", { credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (!j || !j.ok) { featuresAsk = null; return false; }
          return j.chat_v2 === true;
        })
        .catch(() => { featuresAsk = null; return false; });
    }
    return featuresAsk;
  }
  const mutedNow = (until, now) => !!until && new Date(until).getTime() > now;
  // The new inbox's unread number: `allBadgeCount` in
  // src/components/mobile/messages/home/home-rules.ts, by hand. Unread dms
  // and groups + clubs with an unread Board post or new Lounge messages; a
  // muted one is left out. null when either read failed (the dot stays).
  async function newInboxUnread() {
    const get = (url) => fetch(url, { credentials: "include", cache: "no-store" }).then((r) => r.json());
    const [t, c] = await Promise.all([get("/api/me/threads?scope=chats"), get("/api/me/inbox")]);
    if (!t || !t.ok || !Array.isArray(t.threads) || !c || !c.ok || !Array.isArray(c.clubs)) return null;
    const now = Date.now();
    const chats = t.threads.filter((x) => x.unread && !mutedNow(x.muted_until, now)).length;
    const clubs = c.clubs.filter((x) =>
      ((x.board && x.board.unread) || (x.lounge && x.lounge.unread_count > 0)) && !mutedNow(x.muted_until, now)).length;
    return chats + clubs;
  }
  async function refreshBadge() {
    try {
      if (await hasNewChat()) {
        const n = await newInboxUnread();
        if (n !== null) paintBadge(n);
        return;
      }
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
  // Update the host page's Messages icon (the dot-style unread indicator
  // on profile.html) so the user sees a notification mark without us
  // injecting a second button. Only buttons marked data-messages-badge:
  // the calendar, edit, settings and share icons are .nav-msg-btn too,
  // and a bare ".nav-msg-btn" put the unread dot on every one of them.
  let unreadChats = 0;
  function paintBadge(n) {
    unreadChats = n;
    // Otto's ring carries unread chats too (Messages is a tab of its panel);
    // only set by the new-chat path, so the old panel never lights it.
    const ring = document.getElementById("ottoCorner");
    if (ring) ring.classList.toggle("has-chats", ottoTabs && n > 0);
    const count = document.getElementById("vmmTabCount");
    if (count) { count.textContent = n > 99 ? "99+" : String(n); count.style.display = n > 0 ? "" : "none"; }
    const navBtns = document.querySelectorAll(".nav-msg-btn[data-messages-badge]");
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
    if (await hasNewChat()) {
      // Messages is a tab of Otto's panel. With a handle the frame's page
      // opens (or starts) that chat itself.
      if (typeof window.__ottoOpenPanel === "function") {
        ottoTab = "messages";
        pendingHandle = handle || null;
        window.__ottoOpenPanel();
        return;
      }
      // No Otto on this page: Messages itself.
      location.assign(handle ? "/messages?to=" + encodeURIComponent(handle) : "/messages");
      return;
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
      if (state.open && state.view === "list") loadThreadList({ fromPoll: true });
    }, state.LIST_POLL_MS);
  };

  window.closeMiniMessenger = function () {
    state.open = false;
    panel.classList.remove("show");
    document.documentElement.classList.remove("vmm-open");
    if (state.listPollTimer) { clearInterval(state.listPollTimer); state.listPollTimer = null; }
    if (state.chatPollTimer) { clearInterval(state.chatPollTimer); state.chatPollTimer = null; }
    state.activeChannel = null;
    removeFrame();
    refreshBadge();
  };

  // Toggle alias — useful for inline onclick="toggleMessenger()" handlers
  // that run before any host-page script has redefined toggleMessenger.
  window.toggleMessenger = function (handle) {
    // Otto's panel open on the Messages tab: the icon closes it.
    if (ottoOpen && ottoTab === "messages" && typeof window.__ottoClosePanel === "function") {
      window.__ottoClosePanel();
      return;
    }
    if (state.open) window.closeMiniMessenger();
    else window.openMiniMessenger(handle);
  };

  // ── Messages as a tab of Otto's panel (chat_v2) ───────────────────────
  // _otto.js says when its panel opens and closes ("vibe:otto-panel"). The
  // tab row goes under the panel's header; on the Messages tab the body and
  // the footer step aside for the frame. The frame lives only while its tab
  // shows: its page reads the lists every 30 s while "visible", and a frame
  // in a hidden panel still is.
  const MINI_SRC = "/messages?mini=1";
  const MINI_PATH = "/messages";
  let ottoTabs = false;        // this person has the new chat: the tabs exist
  let ottoOpen = false;
  let ottoTab = "otto";        // kept while the panel is closed
  let pendingHandle = null;    // a chat to open when the frame is made

  function removeFrame() {
    const f = document.getElementById("vmmFrame");
    if (f) f.remove();
    document.documentElement.classList.remove("vmm-over-frame");
  }
  // "Open": the chat on screen in the panel, in Messages itself.
  function openInMessages() {
    let url = MINI_PATH;
    try {
      const f = document.getElementById("vmmFrame");
      const q = new URLSearchParams(f.contentWindow.location.search);
      if (q.get("channel")) url += "?channel=" + encodeURIComponent(q.get("channel"));
    } catch (_) { /* the plain address */ }
    location.assign(url);
  }
  function makeFrame(ottoPanel) {
    const frame = document.createElement("iframe");
    frame.id = "vmmFrame";
    frame.className = "vmm-frame";
    frame.title = "Messages";
    frame.src = pendingHandle ? MINI_SRC + "&to=" + encodeURIComponent(pendingHandle) : MINI_SRC;
    pendingHandle = null;
    // A draft typed in the frame is not this page's typed text: the
    // new-build check (_buildRefresh.js) is told the frame is in use.
    frame.setAttribute("data-holds-reload", "");
    // The page left Messages by a full load (a sign-in or Terms redirect):
    // that belongs to the whole tab, not to a 380px frame.
    frame.addEventListener("load", () => {
      try {
        const at = frame.contentWindow.location;
        if (at.pathname !== MINI_PATH && at.href !== "about:blank") location.assign(at.href);
      } catch (_) { /* another origin: leave it */ }
    });
    frame.addEventListener("mouseenter", () => document.documentElement.classList.add("vmm-over-frame"));
    frame.addEventListener("mouseleave", () => document.documentElement.classList.remove("vmm-over-frame"));
    ottoPanel.insertBefore(frame, ottoPanel.querySelector(".otto-panel-body"));
  }
  function paintOttoTabs() {
    const ottoPanel = document.getElementById("ottoPanel");
    if (!ottoPanel) return;
    let row = document.getElementById("vmmTabs");
    if (!row) {
      row = document.createElement("div");
      row.id = "vmmTabs";
      row.className = "vmm-tabs";
      row.setAttribute("role", "tablist");
      row.setAttribute("aria-label", "Otto and Messages");
      row.innerHTML = `
        <button type="button" role="tab" class="vmm-tab" data-tab="otto">Otto</button>
        <button type="button" role="tab" class="vmm-tab" data-tab="messages">Messages<span class="vmm-tab-n" id="vmmTabCount" aria-hidden="true" style="display:none"></span></button>
        <span style="flex:1"></span>
        <button type="button" class="vmm-tab-new" id="vmmNew" aria-label="New message" title="New message">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z"/></svg>
        </button>
        <button type="button" class="vmm-tab-open" id="vmmOpen">Open</button>
      `;
      const header = ottoPanel.querySelector(".otto-panel-header");
      header.insertAdjacentElement("afterend", row);
      row.querySelectorAll(".vmm-tab").forEach((b) => b.addEventListener("click", () => { ottoTab = b.dataset.tab; paintOttoTabs(); }));
      // The pencil is out here, the compose sheet in the frame's page.
      row.querySelector("#vmmNew").addEventListener("click", () => {
        const f = document.getElementById("vmmFrame");
        try { f.contentWindow.postMessage({ source: "vibe-mini", type: "compose" }, location.origin); } catch (_) {}
      });
      row.querySelector("#vmmOpen").addEventListener("click", openInMessages);
    }
    const onMessages = ottoTab === "messages";
    row.querySelectorAll(".vmm-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === ottoTab)));
    row.querySelector("#vmmNew").style.display = onMessages ? "" : "none";
    row.querySelector("#vmmOpen").style.display = onMessages ? "" : "none";
    ottoPanel.classList.toggle("vmm-on-messages", onMessages);
    if (onMessages) {
      if (pendingHandle) removeFrame();
      if (!document.getElementById("vmmFrame")) makeFrame(ottoPanel);
    } else {
      removeFrame();
    }
    paintBadge(unreadChats);
  }
  document.addEventListener("vibe:otto-panel", async (e) => {
    const opening = !!(e.detail && e.detail.open);
    ottoOpen = opening;
    if (!opening) { removeFrame(); refreshBadge(); return; }
    if (!(await hasNewChat())) return;
    ottoTabs = true;
    if (ottoOpen) paintOttoTabs();
  });
  // The ring's dot needs the answer before the panel is ever opened.
  hasNewChat().then((yes) => { if (yes) { ottoTabs = true; paintBadge(unreadChats); } });

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
    document.getElementById("vmmQuiet").style.display = "none";
    paintList();
  }

  async function loadThreadList(opts) {
    const fromPoll = !!(opts && opts.fromPoll);
    const line = "Couldn't load your messages.";
    // Quiet: the panel's own list carries the line. A failed refresh keeps
    // the rows already on screen.
    const r = await window.vibeRequest("/api/me/threads", {
      failure: line, quiet: fromPoll || !state.listLoaded,
    });
    // A 2xx without the array is a failure too, not an empty inbox.
    if (!r.ok || !Array.isArray(r.data.threads)) {
      console.error("[mini.loadThreadList]", r.status, r.error);
      // Nothing loaded yet: say so instead of "No conversations yet", and
      // record it so paintList — not this branch — owns the pane.
      if (!state.listLoaded) {
        state.listFailure = window.vibeLoadFailure(r, line);
        if (state.view === "list") paintList();
      }
      return;
    }
    state.listLoaded = true;
    state.listFailure = null;
    state.threads = r.data.threads;
    state.filtered = state.threads.slice();
    const now = Date.now();
    const unread = state.threads.reduce((n, t) => {
      if (!t.unread) return n;
      if (t.muted_until && new Date(t.muted_until).getTime() > now) return n;
      return n + 1;
    }, 0);
    paintBadge(unread);
    if (state.view === "list") paintList();
  }

  function paintList() {
    const el = document.getElementById("vmmList");
    if (!el) return;
    // A failed first load owns the pane until a retry succeeds — otherwise
    // the next repaint turns "couldn't load" back into "Loading…".
    if (!state.listLoaded && state.listFailure) {
      window.vibeLoadFailed(el, state.listFailure,
        () => loadThreadList(), { compact: true });
      return;
    }
    // showListView paints before any fetch has landed, so an empty array
    // here is "still loading" until the first load actually succeeds.
    if (!state.listLoaded && state.threads.length === 0) {
      el.innerHTML = `<div class="vmm-loading">Loading…</div>`;
      return;
    }
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
    const prev = lastMessageLabel(t.last_message)
      || (t.is_request ? "New message request" : "No messages yet");
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
    state.roomKind = (t && t.room_kind) || null;
    state.canPost = !(t && t.can_post === false);
    state.postLine = "";
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
    paintComposer();
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
      if (state.activeChannel === channelId) loadMessages({ fromPoll: true });
    }, state.CHAT_POLL_MS);
  }

  async function loadMessages(opts) {
    const cid = state.activeChannel;
    if (!cid) return;
    // Skip polling-driven loads while a reaction toggle is in flight,
    // otherwise a stale poll lands a messages array without the new
    // chip and clobbers the optimistic flip.
    if (opts && opts.fromPoll && (state.pendingReactions || 0) > 0) return;
    const fromPoll = !!(opts && opts.fromPoll);
    const loaded = !!state.chatLoaded[cid];
    const line = "Couldn't load this conversation.";
    const r = await window.vibeRequest(
      `/api/me/threads/${encodeURIComponent(cid)}/messages?limit=50`,
      { failure: line, quiet: fromPoll || !loaded }
    );
    if (!r.ok || !Array.isArray(r.data.messages)) {
      console.error("[mini.loadMessages]", r.status, r.error);
      // Otherwise openChat's "Loading…" sits there forever — on a reopen too,
      // where the channel is already flagged loaded but openChat repainted the
      // placeholder. The pane still holding the placeholder (or a previous
      // failure box, so Retry updates the line) is what decides: a refetch
      // after a send or a reaction keeps the bubbles it has.
      const el = document.getElementById("vmmMsgs");
      if (!fromPoll && state.activeChannel === cid
          && el && el.querySelector(".vmm-loading, .vibe-load-failed")) {
        window.vibeLoadFailed(el, window.vibeLoadFailure(r, line),
          () => loadMessages(), { compact: true });
      }
      return;
    }
    state.chatLoaded[cid] = true;
    try {
      const j = r.data;
      // Club chat v1. No `viewer` or `room` in the answer: keep what the
      // list entry said. Only for the chat still on screen.
      if (state.activeChannel === cid) {
        if (j.viewer) {
          state.canPost = j.viewer.can_post !== false;
          state.postLine = typeof j.viewer.post_line === "string" ? j.viewer.post_line : "";
        }
        if (j.room && j.room.kind) state.roomKind = j.room.kind;
        paintComposer();
      }
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
        hidden: m.hidden === true,
      }));
      paintMessages();
    } catch (e) { console.error("[mini.loadMessages]", e); }
  }

  // Delegated hover-with-delay for the reaction picker. Without the
  // 250ms hide delay the picker vanishes the moment the cursor crosses
  // the gap from bubble to pill — by the time you reach the pill, it's
  // already gone.
  function installVmmActionsHover(el) {
    if (!el || el.dataset.actsMounted === "1") return;
    el.dataset.actsMounted = "1";
    let openWrap = null;
    let hideTimer = null;
    function show(wrap) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (openWrap && openWrap !== wrap) openWrap.classList.remove("show-actions");
      openWrap = wrap;
      wrap.classList.add("show-actions");
    }
    function queueHide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (openWrap) openWrap.classList.remove("show-actions");
        openWrap = null;
        hideTimer = null;
      }, 250);
    }
    el.addEventListener("mouseover", (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const hit = t.closest(".vmm-bubble-wrap, .vmm-actions");
      if (!hit) return;
      const owning = hit.classList.contains("vmm-actions") ? hit.closest(".vmm-bubble-wrap") : hit;
      if (owning) show(owning);
    });
    el.addEventListener("mouseout", (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const hit = t.closest(".vmm-bubble-wrap, .vmm-actions");
      if (!hit) return;
      const owning = hit.classList.contains("vmm-actions") ? hit.closest(".vmm-bubble-wrap") : hit;
      const next = e.relatedTarget;
      if (owning && next && next.nodeType === 1) {
        if (owning.contains(next)) return;
        const nextWrap = next.closest && next.closest(".vmm-bubble-wrap, .vmm-actions");
        if (nextWrap === owning) return;
      }
      queueHide();
    });
  }

  // One delegated click listener for every message button: the hover pill's
  // emoji ("pick") and Reply, and the reaction chips ("chip"). Each button
  // carries data-vmm-act / data-vmm-mid / data-vmm-emoji, which come back as
  // plain strings, so a stored reaction can never become code the way an
  // inline onclick="...('${...}')" string could (the browser decodes &#39;
  // back into a quote before an inline handler runs). The pill's buttons
  // stopped the click from bubbling and still do; the chips never did.
  function installVmmMessageClicks(el) {
    if (!el || el.dataset.clicksMounted === "1") return;
    el.dataset.clicksMounted = "1";
    el.addEventListener("click", (e) => {
      const t = e.target;
      const btn = t && t.closest ? t.closest("button[data-vmm-act]") : null;
      if (!btn || !el.contains(btn)) return;
      const act = btn.getAttribute("data-vmm-act");
      const messageId = btn.getAttribute("data-vmm-mid") || "";
      if (act === "pick" || act === "reply") e.stopPropagation();
      if (!messageId) return;
      if (act === "reply") {
        window.__vmmStartReply(messageId);
      } else if (act === "pick" || act === "chip") {
        const emoji = btn.getAttribute("data-vmm-emoji") || "";
        if (emoji) window.__vmmToggleReaction(messageId, emoji);
      }
    });
  }

  function paintMessages() {
    const el = document.getElementById("vmmMsgs");
    if (!el) return;
    installVmmActionsHover(el);
    installVmmMessageClicks(el);
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
    let lastIsoForSep = null;
    state.msgs.forEach((m, i) => {
      if (m.hidden) return;
      // Date+time separator: first row, day change, or >1h gap.
      if (m.created_at && shouldShowSep(lastIsoForSep, m.created_at)) {
        h += '<div class="vmm-date-sep">' + esc(fmtChatDate(m.created_at)) + '</div>';
      }
      if (m.created_at) lastIsoForSep = m.created_at;
      const gb = m.senderId !== lastSender;
      const showAv = !m.mine && (gb || i === 0);
      const gc = gb && lastSender !== null ? " gt" : "";
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
      } else if (typeof window.__profilePreviewExtract === "function" && window.__profilePreviewExtract(m.content || "")) {
        // Profile-share message → render the same rich card the full
        // /messages page uses. Theme follows mine (dark) vs peer (light)
        // so it reads against either bubble side.
        const profShare = window.__profilePreviewExtract(m.content || "");
        const theme = m.mine ? "dark" : "light";
        const card = window.__profilePreviewSkeletonHTML(profShare.handle, { theme });
        const caption = profShare.prefix
          ? `<div class="vmm-bubble" style="margin-bottom:4px">${esc(profShare.prefix)}</div>`
          : "";
        h += `<div class="vmm-msg${m.mine ? " mine" : ""}${gc}">${!m.mine ? av : ""}<div style="display:flex;flex-direction:column;align-items:${m.mine ? "flex-end" : "flex-start"};gap:3px;max-width:100%;">${caption}${card}</div></div>`;
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
        // Mark emojis the viewer has already reacted with — orange ring
        // gives an at-a-glance "I picked this one" cue. Click again to
        // remove the reaction.
        const myEmos = new Set(
          (m.reactions || []).filter((r) => r.viewer_reacted).map((r) => r.emoji),
        );
        // No inline onclick strings built from data: every button names its
        // action, message id and emoji in data- attributes, and one listener
        // on #vmmMsgs (installVmmMessageClicks) runs it. The chips below show
        // other members' stored reactions, so their emoji is escaped too.
        const mid = esc(m.id);
        const actBtns = emos.map((e) => {
          const cls = "vmm-act-emo" + (myEmos.has(e) ? " on" : "");
          return `<button type="button" class="${cls}" data-vmm-act="pick" data-vmm-mid="${mid}" data-vmm-emoji="${esc(e)}" aria-label="React with ${esc(e)}">${esc(e)}</button>`;
        }).join("");
        // No Reply where the viewer can't post: there is no composer to
        // reply in (club chat v1).
        const replyBtn = state.canPost
          ? `<span class="vmm-act-sep"></span><button type="button" class="vmm-act-reply" data-vmm-act="reply" data-vmm-mid="${mid}" aria-label="Reply">↩ Reply</button>`
          : "";
        const actions = `<div class="vmm-actions">${actBtns}${replyBtn}</div>`;
        const chips = (m.reactions && m.reactions.length > 0)
          ? '<div class="vmm-rxs">' + m.reactions.map((r) =>
              `<button type="button" class="vmm-rx${r.viewer_reacted ? " on" : ""}" data-vmm-act="chip" data-vmm-mid="${mid}" data-vmm-emoji="${esc(r.emoji)}"><span>${esc(r.emoji)}</span><span>${esc(r.count)}</span></button>`
            ).join("") + '</div>'
          : "";
        const wrap = `<div class="vmm-bubble-wrap"><div class="vmm-bubble">${esc(m.content)}</div>${actions}</div>`;
        const stack = `<div style="display:flex;flex-direction:column;align-items:${m.mine ? "flex-end" : "flex-start"};max-width:70%;min-width:0;">${stub}${wrap}${chips}</div>`;
        // Long messages get the picker stacked ABOVE the bubble — the
        // panel is narrow, so beside-placement runs off the right edge.
        const isLong = (m.content || "").length > 60 || /\n/.test(m.content || "");
        const longCls = isLong ? " is-long" : "";
        h += `<div class="vmm-msg${m.mine ? " mine" : ""}${gc}${longCls}">${!m.mine ? av : ""}${stack}</div>`;
      }
      lastSender = m.senderId;
    });
    el.innerHTML = h;
    // Hydrate any profile-share preview cards.
    if (typeof window.__profilePreviewHydrate === "function") {
      window.__profilePreviewHydrate(el);
    }
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
  // The composer, or in a room the viewer can't post in (a Board for anyone
  // but its officers, an event chat that has closed) the quiet line.
  function paintComposer() {
    if (state.view !== "chat") return;
    const comp = document.getElementById("vmmComp");
    const quiet = document.getElementById("vmmQuiet");
    if (!comp || !quiet) return;
    comp.style.display = state.canPost ? "" : "none";
    quiet.style.display = state.canPost ? "none" : "";
    // The reply pill sits outside the composer: drop a picked reply too.
    if (!state.canPost && state.replyTo) {
      state.replyTo = null;
      renderReplyPill();
    }
    quiet.textContent = state.postLine || (state.roomKind === "board"
      ? CHAT_REFUSALS.board_officers_only
      : CHAT_REFUSALS.room_closed);
  }
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
      const refused = j && !j.ok ? chatRefusalLine(j) : "";
      if (refused) {
        // Its own plain sentence, and the text stays in the box. The 2s
        // poll's thread read decides whether the composer stays.
        window.vibeToast(refused, { tone: "error" });
        return;
      }
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

  // ── Window-level handlers (called by installVmmMessageClicks) ────────
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
    state.pendingReactions = (state.pendingReactions || 0) + 1;
    try {
      const res = await fetch(`/api/me/threads/${encodeURIComponent(cid)}/messages/${encodeURIComponent(messageId)}/react`, {
        method: nextActive ? "POST" : "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("react " + res.status);
      // Refetch (direct, not from-poll) so the chip is sourced from server
      // truth before the next 2s poll cycle. The pending guard keeps
      // any racing poll from clobbering us in the meantime.
      await loadMessages();
    } catch (e) {
      console.error("[mini.react]", e);
      await loadMessages();
    } finally {
      state.pendingReactions = Math.max(0, (state.pendingReactions || 0) - 1);
    }
  };

  window.__vmmStartReply = function (messageId) {
    const cid = state.activeChannel;
    if (!cid || !messageId || !state.canPost) return;
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
