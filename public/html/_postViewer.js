// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared post viewer modal (P1-015)
//
// Loaded on profile.html + campus.html. Injects its own CSS + markup once,
// then exposes window.openPostViewer(postId, prefill?) for callers to wire
// to .post-thumb-cell, .profile-post-card, and campus .post click handlers.
//
// Self-contained: hardcodes design-system colors instead of relying on each
// page's CSS variables, so the modal looks identical wherever it opens.
//
// Demo Maya / mock-user views: modal still opens but Like/Save/Comment
// surface a "Sign in to interact" toast instead of hitting the API.
// ══════════════════════════════════════════════════════════════════════════

(function () {
  if (window.__vibePostViewerLoaded) return;
  window.__vibePostViewerLoaded = true;

  // ── Styles ────────────────────────────────────────────────────────────
  const STYLE = `
  .vpv-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(28,28,30,.72);
    backdrop-filter: blur(8px);
    display: none; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
    opacity: 0; transition: opacity .18s ease;
  }
  /* Iframe context (CampusAppShell wraps /messages, /otto): position:fixed
     only covers the iframe viewport, so a dimmed backdrop leaves the React
     sidebar bright. Drop the dim — card's shadow + border read as modal. */
  html.vpv-iframe .vpv-overlay { background: transparent; backdrop-filter: none; }
  html.vpv-iframe .vpv-card { box-shadow: 0 28px 80px rgba(0,0,0,.32), 0 6px 20px rgba(0,0,0,.12); }
  .vpv-overlay.show { display: flex; opacity: 1; }
  .vpv-card {
    background: #FAF7F2; color: #1C1C1E;
    border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
    width: min(680px, 100%); max-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    overflow: hidden;
    transform: translateY(8px) scale(.985); transition: transform .18s ease;
  }
  .vpv-overlay.show .vpv-card { transform: translateY(0) scale(1); }
  .vpv-close {
    position: absolute; top: 18px; right: 22px;
    background: rgba(28,28,30,.55); color: white; border: none;
    border-radius: 999px; width: 34px; height: 34px;
    font-size: 18px; line-height: 1; cursor: none;
    display: flex; align-items: center; justify-content: center;
  }
  .vpv-more {
    position: absolute; top: 18px; right: 64px;
    background: rgba(28,28,30,.55); color: white; border: none;
    border-radius: 999px; width: 34px; height: 34px;
    font-size: 18px; line-height: 1; cursor: none;
    display: none; align-items: center; justify-content: center;
  }
  .vpv-more.show { display: flex; }
  .vpv-menu {
    position: absolute; top: 56px; right: 22px;
    background: white; color: #1C1C1E;
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
    padding: 6px; min-width: 160px;
    display: none; z-index: 1;
    font-family: 'DM Sans', sans-serif;
  }
  .vpv-menu.show { display: block; }
  .vpv-menu button {
    display: block; width: 100%; text-align: left;
    background: transparent; border: none;
    padding: 8px 12px; border-radius: 8px;
    font-family: inherit; font-size: 13px; font-weight: 600;
    color: #1C1C1E; cursor: none;
  }
  .vpv-menu button:hover { background: rgba(28,28,30,.06); }
  .vpv-menu button.danger { color: #C54323; }
  .vpv-menu button.danger:hover { background: rgba(197,67,35,.08); }
  .vpv-header {
    display: flex; align-items: center; gap: 12px;
    padding: 18px 22px 12px;
  }
  .vpv-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: #1C1C1E; color: white;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px; letter-spacing: .3px;
    overflow: hidden; flex-shrink: 0;
  }
  .vpv-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vpv-meta { flex: 1; min-width: 0; }
  .vpv-meta .vpv-name { font-weight: 700; font-size: 14px; line-height: 1.2; }
  .vpv-meta .vpv-sub  { font-size: 12px; color: #8A8580; margin-top: 2px; line-height: 1.2; }
  .vpv-meta .vpv-sub strong { color: #1C1C1E; font-weight: 600; }

  .vpv-body {
    padding: 6px 22px 18px;
    overflow-y: auto; flex: 1;
  }
  .vpv-text {
    font-size: 15px; line-height: 1.55; color: #1C1C1E;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .vpv-image {
    display: block; width: 100%; max-height: 540px; object-fit: cover;
    border-radius: 12px; margin-top: 12px;
    background: #EFEAE2;
  }
  .vpv-video {
    display: block; width: 100%; max-height: 70vh;
    border-radius: 12px; margin-top: 12px;
    background: #1C1C1E;
  }
  .vpv-video-stub {
    display: flex; align-items: center; justify-content: center;
    width: 100%; aspect-ratio: 1 / 1; max-height: 70vh;
    border-radius: 12px; margin-top: 12px;
    background: #1C1C1E url('') center/cover no-repeat;
    color: #FAF7F2; font-size: 13px; font-weight: 600; text-align: center;
    padding: 16px; box-sizing: border-box;
  }
  .vpv-tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
  .vpv-tag {
    font-size: 11px; font-weight: 600; color: #FF5C35;
    background: rgba(255,92,53,.08); padding: 3px 8px; border-radius: 999px;
  }
  .vpv-mention { color: #7B5FE0; font-weight: 600; text-decoration: none; }
  .vpv-mention:hover { text-decoration: underline; }

  .vpv-actions {
    display: flex; align-items: center; gap: 4px;
    padding: 10px 14px; border-top: 1px solid rgba(28,28,30,.08);
  }
  .vpv-act {
    background: transparent; border: none;
    font-family: inherit; font-size: 13px; font-weight: 600;
    color: #1C1C1E; padding: 8px 12px; border-radius: 999px;
    cursor: none; display: inline-flex; align-items: center; gap: 6px;
    transition: background .12s, color .12s, transform .08s;
  }
  .vpv-act:hover { background: rgba(28,28,30,.06); }
  .vpv-act:active { transform: scale(.97); }
  .vpv-act.on { color: #FF5C35; }
  .vpv-act.on .vpv-heart { fill: #FF5C35; stroke: #FF5C35; }
  .vpv-act.on .vpv-bookmark { fill: #1C1C1E; stroke: #1C1C1E; }
  .vpv-act svg { display: block; }
  .vpv-spacer { flex: 1; }

  .vpv-comments {
    border-top: 1px solid rgba(28,28,30,.08);
    padding: 14px 22px 0;
  }
  .vpv-comments-empty {
    padding: 20px 0 18px;
    text-align: center; color: #8A8580; font-size: 13px;
  }
  .vpv-comment {
    display: flex; gap: 10px; padding: 10px 0;
  }
  .vpv-comment + .vpv-comment { border-top: 1px solid rgba(28,28,30,.05); }
  .vpv-comment .vpv-avatar { width: 30px; height: 30px; font-size: 11px; }
  .vpv-cw { flex: 1; min-width: 0; }
  .vpv-cw .vpv-cn { font-size: 13px; font-weight: 700; color: #1C1C1E; }
  .vpv-cw .vpv-cn .vpv-ch { color: #8A8580; font-weight: 500; margin-left: 6px; font-size: 12px; }
  .vpv-cw .vpv-ct { font-size: 13.5px; line-height: 1.45; color: #1C1C1E; margin-top: 2px; word-wrap: break-word; }
  .vpv-cw .vpv-cd { font-size: 11px; color: #8A8580; margin-top: 4px; }
  .vpv-cmeta {
    display: flex; align-items: center; gap: 14px;
    margin-top: 6px; font-size: 11px; color: #8A8580;
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  .vpv-cact {
    display: inline-flex; align-items: center; gap: 4px;
    background: transparent; border: none; padding: 0;
    font: inherit; color: inherit; cursor: none;
    font-weight: 600;
  }
  .vpv-cact svg { display: block; }
  .vpv-cact.on { color: #E0245E; }
  .vpv-cact.on svg { fill: #E0245E; stroke: #E0245E; }
  .vpv-creply-form {
    display: flex; gap: 6px; margin-top: 8px;
  }
  .vpv-creply-form input {
    flex: 1; border: 1px solid rgba(28,28,30,.14);
    border-radius: 999px; padding: 6px 12px;
    font-family: inherit; font-size: 12.5px;
    background: white; color: #1C1C1E; outline: none;
  }
  .vpv-creply-form button {
    background: #1C1C1E; color: white; border: none;
    font-family: inherit; font-size: 11px; font-weight: 700;
    padding: 6px 12px; border-radius: 999px; cursor: none;
  }
  .vpv-creply-form button[disabled] { opacity: .4; }
  .vpv-creplies {
    margin-top: 10px; padding-left: 10px;
    border-left: 2px solid rgba(28,28,30,.06);
    display: flex; flex-direction: column; gap: 8px;
  }
  .vpv-creplies .vpv-comment { padding: 6px 0; border-top: none !important; }
  .vpv-creplies .vpv-comment .vpv-avatar { width: 24px; height: 24px; font-size: 10px; }

  .vpv-composer {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 18px 14px;
    border-top: 1px solid rgba(28,28,30,.08);
  }
  .vpv-composer textarea {
    flex: 1; resize: none; min-height: 36px; max-height: 120px;
    border: 1px solid rgba(28,28,30,.14); border-radius: 18px;
    padding: 8px 14px; font-family: inherit; font-size: 13.5px;
    background: white; color: #1C1C1E; outline: none;
  }
  .vpv-composer textarea:focus { border-color: rgba(28,28,30,.35); }
  .vpv-composer button {
    background: #1C1C1E; color: white; border: none;
    font-family: inherit; font-size: 12px; font-weight: 700;
    padding: 8px 16px; border-radius: 999px; cursor: none;
  }
  .vpv-composer button[disabled] { opacity: .4; cursor: default; }

  .vpv-toast {
    position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%) translateY(20px);
    background: #1C1C1E; color: white;
    padding: 10px 18px; border-radius: 999px;
    font-family: 'DM Sans', system-ui, sans-serif; font-size: 12.5px; font-weight: 600;
    z-index: 10001; opacity: 0; transition: opacity .18s, transform .18s;
    pointer-events: none;
  }
  .vpv-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;

  const styleEl = document.createElement("style");
  styleEl.id = "vpvStyles";
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // Mark iframed contexts so the modal CSS can branch (drop the dim).
  try {
    if (window.top && window.top !== window.self) {
      document.documentElement.classList.add("vpv-iframe");
    }
  } catch (_) { /* cross-origin guard */ }

  // ── Markup (injected once on first open) ──────────────────────────────
  function ensureModal() {
    if (document.getElementById("vpvOverlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "vpv-overlay";
    overlay.id = "vpvOverlay";
    overlay.innerHTML = `
      <div class="vpv-card" role="dialog" aria-modal="true" aria-label="Post">
        <button class="vpv-close" aria-label="Close" onclick="window.__vpvClose()">&times;</button>
        <button class="vpv-more" id="vpvMore" aria-label="More" onclick="window.__vpvToggleMenu(event)">⋯</button>
        <div class="vpv-menu" id="vpvMenu" role="menu" onclick="event.stopPropagation()">
          <button type="button" class="danger" onclick="window.__vpvDeletePost()">Delete post</button>
        </div>
        <div class="vpv-header">
          <div class="vpv-avatar" id="vpvAvatar">·</div>
          <div class="vpv-meta">
            <div class="vpv-name" id="vpvName">Loading…</div>
            <div class="vpv-sub" id="vpvSub"></div>
          </div>
        </div>
        <div class="vpv-body" id="vpvBody"></div>
        <div class="vpv-actions">
          <button class="vpv-act" id="vpvLike" onclick="window.__vpvToggleLike()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path class="vpv-heart" d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
            </svg>
            <span id="vpvLikeCount">0</span>
          </button>
          <button class="vpv-act" id="vpvComment" onclick="window.__vpvFocusComposer()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H6L2.5 14V3.5z"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
            </svg>
            <span id="vpvCommentCount">0</span>
          </button>
          <button class="vpv-act" id="vpvShare" onclick="window.__vpvShare()" title="Send to a chat">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L7.5 8.5M14 2L9.5 14L7.5 8.5M14 2L2 6.5L7.5 8.5"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="vpv-spacer"></div>
          <button class="vpv-act" id="vpvSave" onclick="window.__vpvToggleSave()" title="Save">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path class="vpv-bookmark" d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11z"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="vpv-comments" id="vpvComments"></div>
        <div class="vpv-composer">
          <textarea id="vpvCommentInput" placeholder="Add a comment…" rows="1" maxlength="1000"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
          <button id="vpvCommentSubmit" onclick="window.__vpvSubmitComment()">Post</button>
        </div>
      </div>
      <div class="vpv-toast" id="vpvToast"></div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) window.__vpvClose();
    });
    document.addEventListener("keydown", (e) => {
      if (state.openId && e.key === "Escape") window.__vpvClose();
    });
    window.addEventListener("popstate", () => {
      // Browser back / phone back gesture closes the modal instead of
      // navigating away from the page.
      if (state.openId) window.__vpvClose(/*viaPopstate=*/ true);
    });
  }

  // ── State ─────────────────────────────────────────────────────────────
  const state = {
    openId: null,           // post id of currently open modal
    authorId: null,         // post.user_id — drives the "..." menu visibility
    authorName: "",         // post author display name (for share preview)
    type:     "post",
    content: "",            // post body — used as the share-card title
    mediaUrl: null,         // image src for posts; thumbnail for clips
    posterUrl: null,
    liked:  false,
    saved:  false,
    likes:  0,
    comments: 0,
    inflight: false,        // any toggle/post in progress
  };

  function viewerUserId() {
    const u = (typeof vibeLoad === "function") ? vibeLoad("vibe_user_v1") : null;
    return (u && u.id) || null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function isAppShell() {
    if (window.viewingMockUser) return false;
    const u = (typeof vibeLoad === "function") ? vibeLoad("vibe_user_v1") : null;
    return Boolean(u && u._appShell);
  }
  // Treat anything that isn't a real UUID as a demo / hardcoded seed row.
  // The DB columns are uuid-typed, so passing 'p1' or 'v2' through to the
  // server bombs Postgres with "invalid input syntax for type uuid". The
  // modal still opens and renders the prefill; interactions just no-op.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isRealPostId(id) { return UUID_RE.test(String(id || "")); }
  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }
  function initials(name) {
    return (name || "").split(/\s+/).map(p => p[0]).filter(Boolean).join("").slice(0,2).toUpperCase() || "?";
  }
  function relTime(iso) {
    if (!iso) return "Just now";
    const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)        return "Just now";
    if (diff < 3600)      return Math.floor(diff/60)   + "m";
    if (diff < 86400)     return Math.floor(diff/3600) + "h";
    if (diff < 86400*7)   return Math.floor(diff/86400)+ "d";
    return new Date(iso).toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }
  function toast(msg) {
    const el = document.getElementById("vpvToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ── Open / Close ──────────────────────────────────────────────────────
  async function openPostViewer(postId, prefill) {
    if (!postId) return;
    ensureModal();
    // Bind the mention picker to the comment composer once the modal
    // exists. Idempotent (vibeBindMentionPicker no-ops on re-bind).
    const inp = document.getElementById("vpvCommentInput");
    if (inp && window.vibeBindMentionPicker) window.vibeBindMentionPicker(inp);
    state.openId = String(postId);
    const overlay = document.getElementById("vpvOverlay");
    overlay.classList.add("show");
    document.documentElement.style.overflow = "hidden";

    // Push a history entry so back gesture closes the modal — only when
    // not already in a popstate handler so we don't double-stack.
    try { history.pushState({ vpv: state.openId }, ""); } catch {}

    if (prefill) renderFromPrefill(prefill);
    else renderLoading();

    // Always fetch the canonical post + viewer state — prefill might be
    // stale on counts/liked/saved.
    if (!isAppShell() || !isRealPostId(state.openId)) {
      // Demo / hardcoded seed path: render whatever we have, skip API.
      // Same surface used for unsigned visitors and demo Maya cards.
      if (!prefill) {
        document.getElementById("vpvName").textContent = "Sign in to view this post";
        document.getElementById("vpvBody").innerHTML = "";
      }
      renderCommentsList([]);
      return;
    }

    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || !j.post) throw new Error((j && j.error) || "Could not load post");
      // Race guard: user may have closed and opened a different post.
      if (String(j.post.id) !== state.openId) return;
      renderFromServer(j);
    } catch (e) {
      toast(e && e.message ? e.message : "Could not load post");
    }

    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}/comments`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) return;
      if (state.openId) renderCommentsList(j.comments || []);
    } catch {}
  }
  window.openPostViewer = openPostViewer;

  function closeViewer(viaPopstate) {
    state.openId = null;
    const overlay = document.getElementById("vpvOverlay");
    if (overlay) overlay.classList.remove("show");
    document.documentElement.style.overflow = "";
    // Stop any playing clip so audio doesn't bleed into the next view.
    const v = document.getElementById("vpvVideo");
    if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch {} }
    // Pop the synthetic history entry only when the close was user-driven
    // (Esc / X / outside-click) — not when the user already hit back.
    if (!viaPopstate) {
      try {
        if (history.state && history.state.vpv) history.back();
      } catch {}
    }
  }
  window.__vpvClose = closeViewer;

  // ── Render paths ──────────────────────────────────────────────────────
  function renderLoading() {
    document.getElementById("vpvAvatar").textContent = "·";
    document.getElementById("vpvName").textContent = "Loading…";
    document.getElementById("vpvSub").textContent = "";
    document.getElementById("vpvBody").innerHTML = "";
    document.getElementById("vpvLikeCount").textContent = "0";
    document.getElementById("vpvCommentCount").textContent = "0";
    document.getElementById("vpvLike").classList.remove("on");
    document.getElementById("vpvSave").classList.remove("on");
    document.getElementById("vpvComments").innerHTML = "";
    const more = document.getElementById("vpvMore");
    const menu = document.getElementById("vpvMenu");
    if (more) more.classList.remove("show");
    if (menu) menu.classList.remove("show");
    const inp = document.getElementById("vpvCommentInput");
    if (inp) { inp.value = ""; inp.style.height = ""; }
  }

  function renderFromPrefill(p) {
    // Best-effort render from in-memory data (DB row from /api/feed or
    // /api/me/posts). Server fetch will replace counts shortly.
    paintHeader({
      author:    p.author || { name: p.authorName, handle: p.authorHandle, avatar_url: p.authorAvatar },
      created_at: p.created_at || p.createdAt,
    });
    paintBody({
      content:             p.content || p.body || "",
      tags:                p.tags || [],
      media_url:           p.media_url || p.mediaUrl || "",
      media_thumbnail_url: p.media_thumbnail_url || p.mediaThumbnailUrl || p.posterUrl || "",
      type:                p.type || "post",
    });
  }

  function renderFromServer(j) {
    const p = j.post;
    paintHeader({ author: p.author, created_at: p.created_at });
    paintBody({
      content:             p.content,
      tags:                p.tags || [],
      media_url:           p.media_url,
      media_thumbnail_url: p.media_thumbnail_url,
      type:                p.type,
    });
    state.authorId = p.user_id || (p.author && p.author.id) || null;
    state.authorName = (p.author && p.author.name) || "";
    state.type     = p.type || "post";
    state.content = p.content || "";
    state.mediaUrl = p.media_url || null;
    state.posterUrl = p.media_thumbnail_url || (p.type === "clip" ? null : p.media_url) || null;
    state.liked = !!(j.viewer && j.viewer.liked);
    state.saved = !!(j.viewer && j.viewer.saved);
    state.likes = (j.counts && j.counts.likes) || 0;
    state.comments = (j.counts && j.counts.comments) || 0;
    document.getElementById("vpvLikeCount").textContent = String(state.likes);
    document.getElementById("vpvCommentCount").textContent = String(state.comments);
    document.getElementById("vpvLike").classList.toggle("on", state.liked);
    document.getElementById("vpvSave").classList.toggle("on", state.saved);

    // "..." menu — owner sees Delete; everyone else sees Report/Mute/Block.
    const isOwner = state.authorId && viewerUserId() === state.authorId;
    const more = document.getElementById("vpvMore");
    const menu = document.getElementById("vpvMenu");
    if (more) more.classList.add("show");
    if (menu) {
      if (isOwner) {
        menu.innerHTML = `<button type="button" class="danger" onclick="window.__vpvDeletePost()">Delete post</button>`;
      } else {
        const safeId = String(state.openId || "").replace(/'/g, "\\'");
        const safeAuthor = String(state.authorId || "").replace(/'/g, "\\'");
        const safeName = String(state.authorName || "").replace(/'/g, "\\'");
        menu.innerHTML = `
          <button type="button" onclick="window.__vpvCloseMenu();window.vibeOpenReportSheet('${state.type === 'clip' ? 'post' : 'post'}','${safeId}')">Report ${state.type === 'clip' ? 'clip' : 'post'}</button>
          ${safeAuthor ? `<button type="button" onclick="window.__vpvCloseMenu();window.vibeOpenMuteSheet('${safeAuthor}','${safeName}')">Mute ${safeName ? safeName.split(' ')[0] : 'author'}</button>` : ''}
          ${safeAuthor ? `<button type="button" class="danger" onclick="window.__vpvCloseMenu();window.vibeBlock('${safeAuthor}','${safeName}', () => window.__vpvClose())">Block ${safeName ? safeName.split(' ')[0] : 'author'}</button>` : ''}
        `;
      }
    }

    // Clip rows: now that we know the canonical id + type, mint a signed
    // R2 GET URL and attach it to the <video> created by paintBody.
    if (p.type === "clip") _vpvLoadClipSrc(p.id);
  }

  function paintHeader({ author, created_at }) {
    const a = author || {};
    const av = document.getElementById("vpvAvatar");
    if (a.avatar_url) {
      av.innerHTML = `<img src="${esc(a.avatar_url)}" alt="">`;
    } else {
      av.textContent = initials(a.name || a.handle);
    }
    const name = a.name || a.handle || "Unknown";
    document.getElementById("vpvName").textContent = name;
    const handle = a.handle ? `@${a.handle}` : "";
    const when = relTime(created_at);
    const sub = [handle, when].filter(Boolean).join(" · ");
    document.getElementById("vpvSub").textContent = sub;
  }

  // Escape, then style @handles as orange links so mentions are visible
  // and clickable. Done after escaping so any HTML in the content is
  // already neutralized by the time we inject spans.
  function formatBodyText(s) {
    const escaped = esc(s);
    return escaped.replace(
      /(^|[^A-Za-z0-9_@])@([a-z0-9_]{3,20})/gi,
      (_m, prefix, handle) =>
        `${prefix}<a class="vpv-mention" href="/profile/${encodeURIComponent(handle.toLowerCase())}">@${handle}</a>`,
    );
  }

  function paintBody({ content, tags, media_url, media_thumbnail_url, type }) {
    const body = document.getElementById("vpvBody");
    const text = content ? `<div class="vpv-text">${formatBodyText(content)}</div>` : "";
    let media = "";
    if (type === "clip") {
      // P1-016: real <video> with native HTML5 controls. The poster paints
      // instantly from media_thumbnail_url; the signed R2 GET URL resolves
      // asynchronously via _vpvLoadClipSrc(). Demo Maya / mock clips have
      // no DB id — we still render the poster but skip the fetch.
      const poster = media_thumbnail_url ? `poster="${esc(media_thumbnail_url)}"` : "";
      media = `<video class="vpv-video" id="vpvVideo" ${poster}
        controls playsinline muted loop preload="metadata"></video>`;
    } else if (media_url && type === "post") {
      // Post images are stored as public URLs (Supabase profiles bucket)
      media = `<img class="vpv-image" src="${esc(media_url)}" alt="">`;
    }
    const tagBlock = (tags && tags.length)
      ? `<div class="vpv-tags">${tags.map(t => `<span class="vpv-tag">#${esc(t)}</span>`).join("")}</div>`
      : "";
    body.innerHTML = text + media + tagBlock;
  }

  // Fetch a fresh signed R2 URL and attach it to the open clip's <video>.
  // Demo / mock clips skip this (no DB row) — the poster image carries the UX.
  async function _vpvLoadClipSrc(postId) {
    if (!postId) return;
    if (!isAppShell()) return;
    if (!isRealPostId(postId)) return; // demo / hardcoded clips have no R2 object
    try {
      const r = await fetch(`/api/clips/${encodeURIComponent(postId)}/view-url`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || !j.url) {
        // Don't toast — the poster still shows; failing silent is gentler
        // than a noisy toast every time R2 is misconfigured in dev.
        return;
      }
      // Race guard: another open may have replaced #vpvVideo since we asked.
      if (state.openId !== String(postId)) return;
      const v = document.getElementById("vpvVideo");
      if (!v) return;
      v.src = j.url;
      // autoplay (muted) — IG/TikTok-native feel; user can unmute via controls.
      try { v.play().catch(() => {}); } catch {}
    } catch { /* silent */ }
  }

  function renderCommentsList(list) {
    const wrap = document.getElementById("vpvComments");
    if (!Array.isArray(list) || list.length === 0) {
      wrap.innerHTML = `<div class="vpv-comments-empty">No comments yet — be the first.</div>`;
      return;
    }
    wrap.innerHTML = list.map(renderCommentRow).join("");
  }

  function renderCommentRow(c) {
    const a = c.author || {};
    const av = a.avatar_url
      ? `<div class="vpv-avatar"><img src="${esc(a.avatar_url)}" alt=""></div>`
      : `<div class="vpv-avatar">${esc(initials(a.name || a.handle))}</div>`;
    const handle = a.handle ? `<span class="vpv-ch">@${esc(a.handle)}</span>` : "";
    const liked = !!c.viewer_liked;
    const likeCount = Number(c.like_count) > 0 ? Number(c.like_count) : 0;
    const heartFill = liked ? "currentColor" : "none";
    const heartSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="${heartFill}"><path d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="${heartFill}"/></svg>`;
    const repliesHtml = Array.isArray(c.replies) && c.replies.length > 0
      ? `<div class="vpv-creplies" id="vpv-replies-${esc(c.id)}">${c.replies.map(renderCommentRow).join("")}</div>`
      : `<div class="vpv-creplies" id="vpv-replies-${esc(c.id)}" style="display:none"></div>`;
    return `<div class="vpv-comment" data-comment-id="${esc(c.id)}">
      ${av}
      <div class="vpv-cw">
        <div class="vpv-cn">${esc(a.name || a.handle || "Unknown")}${handle}</div>
        <div class="vpv-ct">${esc(c.content)}</div>
        <div class="vpv-cmeta">
          <button class="vpv-cact${liked ? " on" : ""}" id="vpv-like-${esc(c.id)}" onclick="__vpvToggleCommentLike('${esc(c.id)}')" aria-label="Like comment">
            ${heartSvg}<span class="vpv-clikec">${likeCount > 0 ? likeCount : ""}</span>
          </button>
          <button class="vpv-cact" onclick="__vpvOpenReply('${esc(c.id)}', '${esc(a.handle || "")}')">Reply</button>
          <span style="margin-left:auto;color:#8A8580">${esc(relTime(c.created_at))}</span>
        </div>
        <div class="vpv-creply-form" id="vpv-reply-${esc(c.id)}" style="display:none">
          <input type="text" maxlength="1000" placeholder="Write a reply…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();__vpvSubmitReply('${esc(c.id)}', this.parentNode)}else if(event.key==='Escape'){__vpvCancelReply('${esc(c.id)}')}">
          <button type="button" onclick="__vpvSubmitReply('${esc(c.id)}', this.parentNode)">Post</button>
        </div>
        ${repliesHtml}
      </div>
    </div>`;
  }

  // ── Action handlers ───────────────────────────────────────────────────
  window.__vpvToggleLike = async function () {
    if (!state.openId) return;
    if (!isAppShell()) { toast("Sign in to like posts"); return; }
    if (!isRealPostId(state.openId)) { toast("This is a demo post — interactions disabled"); return; }
    if (state.inflight) return;
    state.inflight = true;
    const wasLiked = state.liked;
    state.liked = !wasLiked;
    state.likes += state.liked ? 1 : -1;
    if (state.likes < 0) state.likes = 0;
    document.getElementById("vpvLike").classList.toggle("on", state.liked);
    document.getElementById("vpvLikeCount").textContent = String(state.likes);
    try {
      const method = state.liked ? "POST" : "DELETE";
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}/like`, {
        method, credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not update like");
    } catch (e) {
      // Revert optimistic update
      state.liked = wasLiked;
      state.likes += wasLiked ? 1 : -1;
      if (state.likes < 0) state.likes = 0;
      document.getElementById("vpvLike").classList.toggle("on", state.liked);
      document.getElementById("vpvLikeCount").textContent = String(state.likes);
      toast(e && e.message ? e.message : "Could not update like");
    } finally {
      state.inflight = false;
    }
  };

  window.__vpvToggleSave = async function () {
    if (!state.openId) return;
    if (!isAppShell()) { toast("Sign in to save posts"); return; }
    if (!isRealPostId(state.openId)) { toast("This is a demo post — interactions disabled"); return; }
    if (state.inflight) return;
    state.inflight = true;
    const wasSaved = state.saved;
    state.saved = !wasSaved;
    document.getElementById("vpvSave").classList.toggle("on", state.saved);
    try {
      const method = state.saved ? "POST" : "DELETE";
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}/save`, {
        method, credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not update save");
      toast(state.saved ? "Saved" : "Removed from saved");
    } catch (e) {
      state.saved = wasSaved;
      document.getElementById("vpvSave").classList.toggle("on", state.saved);
      toast(e && e.message ? e.message : "Could not update save");
    } finally {
      state.inflight = false;
    }
  };

  window.__vpvFocusComposer = function () {
    const inp = document.getElementById("vpvCommentInput");
    if (inp) inp.focus();
  };

  window.__vpvShare = function () {
    if (typeof window.openSharePicker !== "function") {
      toast("Share isn't loaded on this page yet");
      return;
    }
    if (!state.openId || !isRealPostId(state.openId)) {
      toast("Can't share a demo post");
      return;
    }
    const title = (state.content || "").slice(0, 240);
    window.openSharePicker({
      postId: state.openId,
      kind: state.type === "clip" ? "clip" : "post",
      title: title || (state.type === "clip" ? "Clip" : "Post"),
      posterUrl: state.posterUrl,
      authorName: state.authorName,
    });
  };

  window.__vpvToggleMenu = function (ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById("vpvMenu");
    if (!menu) return;
    // For owners the only item is Delete — keep its label in sync with type.
    const delBtn = menu.querySelector("button.danger");
    if (delBtn && /^Delete /.test(delBtn.textContent || "")) {
      delBtn.textContent = state.type === "clip" ? "Delete clip" : "Delete post";
    }
    const wasOpen = menu.classList.contains("show");
    menu.classList.toggle("show", !wasOpen);
    if (!wasOpen) {
      const dismiss = () => {
        menu.classList.remove("show");
        document.removeEventListener("click", dismiss, true);
      };
      setTimeout(() => document.addEventListener("click", dismiss, true), 0);
    }
  };

  window.__vpvCloseMenu = function () {
    const menu = document.getElementById("vpvMenu");
    if (menu) menu.classList.remove("show");
  };

  window.__vpvDeletePost = async function () {
    if (!state.openId) return;
    if (!isAppShell()) { toast("Sign in to delete"); return; }
    if (!isRealPostId(state.openId)) { toast("Demo post — can't delete"); return; }
    // Quick confirm — destructive action, can't undo. Wording uses the
    // post type so the user knows whether they're nuking a clip or a post.
    const kindLabel = state.type === "clip" ? "clip" : "post";
    if (!window.confirm(`Delete this ${kindLabel}? This can't be undone.`)) return;
    const menu = document.getElementById("vpvMenu");
    if (menu) menu.classList.remove("show");
    if (state.inflight) return;
    state.inflight = true;
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}`, {
        method: "DELETE", credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error((j && j.error) || "Could not delete");
      // Remove from any visible grid/feed on the current page so the user
      // doesn't see a ghost card after the modal closes.
      _vpvScrubPostFromPage(state.openId);
      toast("Deleted");
      closeViewer();
    } catch (e) {
      toast(e && e.message ? e.message : "Could not delete");
    } finally {
      state.inflight = false;
    }
  };

  // Strip a deleted post from every surface that might be showing it.
  // Cheap and dumb: walk the DOM by data attributes the surfaces stamp.
  function _vpvScrubPostFromPage(postId) {
    const id = String(postId);
    const selectors = [
      `[data-post-id="${id}"]`,           // .profile-post-card, campus .post
      `[data-source-post-id="${id}"]`,    // .post-thumb-cell in All grid
      `[data-vibe-id="${id}"]`,           // .vibe-grid-thumb (clips)
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
    // Re-run aggregators where they exist so empty states show up.
    if (typeof populateAllGrid === "function") populateAllGrid();
    if (typeof savePostsToStorage === "function") savePostsToStorage();
    if (typeof saveVibesToStorage === "function") saveVibesToStorage();
  }

  window.__vpvSubmitComment = async function () {
    if (!state.openId) return;
    const inp = document.getElementById("vpvCommentInput");
    const btn = document.getElementById("vpvCommentSubmit");
    const content = (inp && inp.value || "").trim();
    if (!content) return;
    if (!isAppShell()) { toast("Sign in to comment"); return; }
    if (!isRealPostId(state.openId)) { toast("This is a demo post — interactions disabled"); return; }
    btn.disabled = true;
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(state.openId)}/comments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || !j.comment) throw new Error((j && j.error) || "Could not post comment");
      // Append to the thread (oldest-first ordering — new ones go to bottom)
      const wrap = document.getElementById("vpvComments");
      // Drop empty-state placeholder if present
      const empty = wrap.querySelector(".vpv-comments-empty");
      if (empty) empty.remove();
      wrap.insertAdjacentHTML("beforeend", renderCommentRow(j.comment));
      state.comments += 1;
      document.getElementById("vpvCommentCount").textContent = String(state.comments);
      inp.value = ""; inp.style.height = "";
    } catch (e) {
      toast(e && e.message ? e.message : "Could not post comment");
    } finally {
      btn.disabled = false;
    }
  };

  // ── Comment-level engagement (heart + reply) ─────────────────────────
  // Optimistic toggle for the per-comment heart. Mirrors __vpvToggleLike
  // but targets `comment_likes` and the inline button on the row.
  window.__vpvToggleCommentLike = async function (commentId) {
    if (!isAppShell()) { toast("Sign in to like comments"); return; }
    const btn = document.getElementById("vpv-like-" + commentId);
    if (!btn) return;
    const wasLiked = btn.classList.contains("on");
    const countEl = btn.querySelector(".vpv-clikec");
    const heartPath = btn.querySelector("svg path");
    const cur = parseInt((countEl && countEl.textContent) || "0", 10) || 0;
    const next = !wasLiked;
    const nextCount = Math.max(0, cur + (next ? 1 : -1));
    btn.classList.toggle("on", next);
    if (countEl) countEl.textContent = nextCount > 0 ? String(nextCount) : "";
    if (heartPath) {
      heartPath.setAttribute("fill", next ? "currentColor" : "none");
    }
    try {
      const r = await fetch("/api/comments/" + encodeURIComponent(commentId) + "/like", {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j && j.error) || "Could not update");
      }
    } catch (e) {
      // Rollback
      btn.classList.toggle("on", wasLiked);
      if (countEl) countEl.textContent = cur > 0 ? String(cur) : "";
      if (heartPath) heartPath.setAttribute("fill", wasLiked ? "currentColor" : "none");
      toast(e && e.message ? e.message : "Could not update like");
    }
  };

  window.__vpvOpenReply = function (commentId, authorHandle) {
    const form = document.getElementById("vpv-reply-" + commentId);
    if (!form) return;
    const visible = form.style.display !== "none";
    if (visible) {
      form.style.display = "none";
      return;
    }
    form.style.display = "flex";
    const input = form.querySelector("input");
    if (input) {
      if (!input.value && authorHandle) input.value = "@" + authorHandle + " ";
      try { input.focus(); } catch {}
    }
  };

  window.__vpvCancelReply = function (commentId) {
    const form = document.getElementById("vpv-reply-" + commentId);
    if (!form) return;
    form.style.display = "none";
    const input = form.querySelector("input");
    if (input) input.value = "";
  };

  window.__vpvSubmitReply = async function (commentId, formEl) {
    if (!state.openId) return;
    if (!isAppShell()) { toast("Sign in to reply"); return; }
    if (!isRealPostId(state.openId)) { toast("This is a demo post — interactions disabled"); return; }
    if (!formEl) return;
    const input = formEl.querySelector("input");
    const submit = formEl.querySelector("button");
    const text = (input && input.value || "").trim();
    if (!text) return;
    if (submit) submit.disabled = true;
    try {
      const r = await fetch("/api/posts/" + encodeURIComponent(state.openId) + "/comments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parent_comment_id: commentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok || !j.comment) throw new Error((j && j.error) || "Could not post reply");
      // The API resolves parent_comment_id up to the top-level ancestor,
      // so the reply lives under whichever comment the user clicked on
      // (the visible parent in the rendered tree).
      const targetParent = j.comment.parent_comment_id || commentId;
      const repliesWrap = document.getElementById("vpv-replies-" + targetParent);
      if (repliesWrap) {
        repliesWrap.style.display = "";
        repliesWrap.insertAdjacentHTML("beforeend", renderCommentRow(j.comment));
      }
      state.comments += 1;
      const countEl = document.getElementById("vpvCommentCount");
      if (countEl) countEl.textContent = String(state.comments);
      if (input) input.value = "";
      formEl.style.display = "none";
    } catch (e) {
      toast(e && e.message ? e.message : "Could not post reply");
    } finally {
      if (submit) submit.disabled = false;
    }
  };
})();
