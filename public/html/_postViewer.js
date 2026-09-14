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
// Unsigned visitors (share links): modal still opens but Like/Save/Comment
// surface a "Sign in" toast instead of hitting the API.
//
// The engagement bar also carries the view count (free, everyone sees it) and,
// for the author only, the way into "Who saw this" / "Who saved this" — the
// paid audience sheet this file builds at the bottom. Counts are public,
// identities are private (handoffs/2026-09-14-wave-plan-metrics-screens.md).
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
    display: block; width: 100%; max-height: 540px; object-fit: contain;
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

  /* Six items now live on this row (the author sees all of them), and the
     counts render unabbreviated — "1203" is as wide as it reads. In a narrow
     window, or inside the app shell's iframe, the row wraps to a second line
     instead of squeezing the buttons into each other. */
  .vpv-actions {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
    padding: 10px 14px; border-top: 1px solid rgba(28,28,30,.08);
  }
  .vpv-act {
    background: transparent; border: none; flex-shrink: 0;
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
  /* A count nobody can act on is a label, not a button: the Views entry is
     disabled for everyone but the author, so it must stop pretending. */
  .vpv-act[disabled] { cursor: inherit; }
  .vpv-act[disabled]:hover { background: transparent; }
  .vpv-act[disabled]:active { transform: none; }
  /* The saves number hugs the bookmark so the pair reads as one control. */
  .vpv-act-count { padding-left: 2px; }
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

  /* ── Audience sheet ("Who saw this" / "Who saved this") ─────────────
     Its own overlay rather than the post modal's, because it opens ON TOP of
     an already-open post: z 10000 sits above .vpv-overlay (9999) and below
     .vpv-toast (10001), so a failure line is still readable over it. */
  .vpv-aud-overlay {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(28,28,30,.55);
    display: none; align-items: center; justify-content: center;
    padding: 24px; box-sizing: border-box;
    opacity: 0; transition: opacity .16s ease;
  }
  html.vpv-iframe .vpv-aud-overlay { background: rgba(28,28,30,.32); }
  .vpv-aud-overlay.show { display: flex; opacity: 1; }
  .vpv-aud-card {
    background: #FAF7F2; color: #1C1C1E;
    border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.35);
    width: min(420px, 100%); max-height: min(560px, calc(100vh - 48px));
    display: flex; flex-direction: column; overflow: hidden;
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }
  .vpv-aud-head {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 18px 20px 12px; border-bottom: 1px solid rgba(28,28,30,.08);
  }
  .vpv-aud-headtext { flex: 1; min-width: 0; }
  .vpv-aud-title { font-size: 15px; font-weight: 700; line-height: 1.2; }
  .vpv-aud-sub { font-size: 12px; color: #8A8580; margin-top: 3px; line-height: 1.2; }
  .vpv-aud-close {
    background: transparent; border: none; padding: 0 2px;
    font-size: 20px; line-height: 1; color: #8A8580; cursor: none;
  }
  .vpv-aud-body { flex: 1; overflow-y: auto; padding: 4px 20px 18px; }
  .vpv-aud-day {
    font-size: 11px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: #8A8580; padding: 12px 0 4px;
  }
  .vpv-aud-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; text-decoration: none; color: inherit;
  }
  .vpv-aud-av {
    width: 36px; height: 36px; border-radius: 50%;
    background: #1C1C1E; color: white;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 12px; overflow: hidden; flex-shrink: 0;
  }
  .vpv-aud-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vpv-aud-info { flex: 1; min-width: 0; }
  .vpv-aud-name {
    font-size: 13.5px; font-weight: 700; line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .vpv-aud-h { color: #8A8580; font-weight: 500; font-size: 12px; margin-left: 6px; }
  .vpv-aud-meta {
    font-size: 11.5px; color: #8A8580; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .vpv-aud-empty, .vpv-aud-loading {
    padding: 26px 0; text-align: center; color: #8A8580; font-size: 13px;
  }
  .vpv-aud-more {
    display: block; width: 100%; margin-top: 12px;
    background: transparent; border: 1px solid rgba(28,28,30,.14);
    border-radius: 999px; padding: 8px 0;
    font-family: inherit; font-size: 12.5px; font-weight: 700;
    color: #1C1C1E; cursor: none;
  }
  .vpv-aud-lock { padding: 28px 6px 12px; text-align: center; }
  .vpv-aud-lock-n { font-size: 34px; font-weight: 800; line-height: 1; }
  .vpv-aud-lock-label { font-size: 13px; color: #8A8580; margin-top: 6px; }
  .vpv-aud-lock-line { font-size: 14px; font-weight: 600; margin-top: 16px; }
  .vpv-aud-cta {
    display: inline-block; margin-top: 14px;
    background: #FF5C35; color: #FAF7F2; text-decoration: none;
    font-size: 12.5px; font-weight: 700; letter-spacing: .02em;
    padding: 8px 18px; border-radius: 999px;
  }

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
          <!-- Views: the count is free and everyone sees it. Only the author
               gets a click, and only because the server said so (is_owner) —
               the route re-checks ownership anyway. Disabled until then.
               Hidden until a real counts.views arrives: on a public share link
               the API is never called, and an eye next to "0" would be a wrong
               number stated confidently. Unknown shows nothing, like saves. -->
          <button class="vpv-act" id="vpvViews" onclick="window.__vpvOpenViewers()"
            disabled style="display:none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
              <circle cx="8" cy="8" r="2" stroke="#1C1C1E" stroke-width="1.4" fill="none"/>
            </svg>
            <span id="vpvViewCount"></span>
          </button>
          <button class="vpv-act" id="vpvSave" onclick="window.__vpvToggleSave()" title="Save">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path class="vpv-bookmark" d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11z"
                stroke="#1C1C1E" stroke-width="1.4" fill="none" stroke-linejoin="round"/>
            </svg>
          </button>
          <!-- The author's saves number, a sibling of the Save button rather
               than a span inside it: a button inside a button is invalid
               markup and unreachable by keyboard, and this one has its own job
               (open "Who saved this") while Save keeps toggling the author's
               own bookmark. Hidden entirely when the count is unknown. -->
          <button class="vpv-act vpv-act-count" id="vpvSaveCount" onclick="window.__vpvOpenSavers()"
            title="Who saved this" aria-label="Who saved this" style="display:none"></button>
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
      if (e.key !== "Escape") return;
      // The audience sheet sits on top of the post, so Escape closes it first
      // and leaves the post where it was. One handler, not two, because a
      // second listener registered later would fire after this one and shut
      // the post underneath.
      if (aud.open) { closeAudience(); return; }
      if (state.openId) window.__vpvClose();
    });
    window.addEventListener("popstate", () => {
      // Browser back / phone back gesture closes the modal instead of
      // navigating away from the page. The audience sheet pushed no history
      // entry of its own, so it goes with the post rather than being left
      // floating over the page.
      if (aud.open) closeAudience();
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
    mediaUrl: null,         // image src for posts
    posterUrl: null,
    liked:  false,
    saved:  false,
    likes:  0,
    comments: 0,
    // counts.views — the honest ledger tally, free to all. Null means the
    // number is unknown (the public share-link path never calls the API, and
    // a failed call leaves it unknown too); unknown hides the whole entry.
    views:  null,
    // counts.saves, or null when the server could not read it. Null is not 0:
    // an unknown number must never paint as "nobody saved this", so the
    // author's saves affordance hides instead of showing a zero.
    saves:  null,
    isOwner: false,         // the SERVER's is_owner, not a localStorage guess
    inflight: false,        // any toggle/post in progress
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  function isAppShell() {
    const u = (typeof vibeLoad === "function") ? vibeLoad("vibe_user_v1") : null;
    return Boolean(u && u._appShell);
  }
  // Treat anything that isn't a real UUID as a non-API row.
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

    // Counts and ownership belong to the post being opened, not the last one.
    // renderFromPrefill() is a partial paint — it never touches the bar — so
    // without this a prefilled open would carry the previous post's view count
    // and, worse, its owner affordances until the server answered.
    if (aud.open) closeAudience();
    state.isOwner = false;
    state.views = null;
    state.saves = null;
    resetCounts();
    paintOwnerAffordances();

    if (prefill) renderFromPrefill(prefill);
    else renderLoading();

    // Always fetch the canonical post + viewer state — prefill might be
    // stale on counts/liked/saved.
    if (!isAppShell() || !isRealPostId(state.openId)) {
      // Unsigned visitor or non-UUID id: render what we have, skip the API.
      if (!prefill) {
        document.getElementById("vpvName").textContent = "Sign in to view this post";
        document.getElementById("vpvBody").innerHTML = "";
      }
      renderCommentsList([]);
      return;
    }

    // Non-quiet: vibeRequest toasts the mapped line itself, so the student
    // no longer reads a raw server error.
    const postLine = "Couldn't load this post.";
    const pr = await window.vibeRequest(
      `/api/posts/${encodeURIComponent(state.openId)}`, { failure: postLine }
    );
    if (pr.ok && pr.data.ok && pr.data.post) {
      // Race guard: user may have closed and opened a different post.
      if (String(pr.data.post.id) !== state.openId) return;
      renderFromServer(pr.data);
    } else if (pr.ok) {
      // A 2xx with no post: no copy rule maps a 2xx, so say it here.
      window.vibeToast(postLine + " Try again.", { tone: "error" });
    }

    await loadComments();
  }

  // Also the Retry target. Quiet: the list itself carries the line, and a
  // post that failed alongside it has already toasted.
  async function loadComments() {
    const id = state.openId;
    if (!id) return;
    const line = "Couldn't load comments.";
    const r = await window.vibeRequest(
      `/api/posts/${encodeURIComponent(id)}/comments`, { failure: line, quiet: true }
    );
    // Closed the modal, or opened a different post, mid-flight.
    if (state.openId !== id) return;
    if (r.ok && Array.isArray(r.data.comments)) {
      renderCommentsList(r.data.comments);
      return;
    }
    // renderLoading() emptied the list, so without this it just stays blank.
    const wrap = document.getElementById("vpvComments");
    if (wrap) {
      window.vibeLoadFailed(wrap, window.vibeLoadFailure(r, line), loadComments,
        { compact: true });
    }
  }
  window.openPostViewer = openPostViewer;

  function closeViewer(viaPopstate) {
    // Never leave the audience sheet floating over a closed post.
    if (aud.open) closeAudience();
    state.openId = null;
    const overlay = document.getElementById("vpvOverlay");
    if (overlay) overlay.classList.remove("show");
    // Hiding the overlay doesn't stop a playing <video>; pause it so the
    // sound doesn't carry on after the modal closes.
    const vid = document.querySelector("#vpvBody video");
    if (vid) vid.pause();
    document.documentElement.style.overflow = "";
    // Pop the synthetic history entry only when the close was user-driven
    // (Esc / X / outside-click) — not when the user already hit back.
    if (!viaPopstate) {
      try {
        if (history.state && history.state.vpv) history.back();
      } catch (_) {
        // history can refuse in a sandboxed frame; the modal is already closed.
      }
    }
  }
  window.__vpvClose = closeViewer;

  // ── Render paths ──────────────────────────────────────────────────────
  // The engagement bar belongs to the post being opened. Both entry paths
  // need this: renderLoading() runs it, and so does the prefill path, which
  // paints only header and body — without it post B would wear post A's like
  // and comment counts until the server answered. The view and saves numbers
  // are not reset here: they are unknown until the server speaks, and
  // paintOwnerAffordances() hides them for exactly that reason.
  function resetCounts() {
    document.getElementById("vpvLikeCount").textContent = "0";
    document.getElementById("vpvCommentCount").textContent = "0";
    document.getElementById("vpvLike").classList.remove("on");
    document.getElementById("vpvSave").classList.remove("on");
  }

  function renderLoading() {
    document.getElementById("vpvAvatar").textContent = "·";
    document.getElementById("vpvName").textContent = "Loading…";
    document.getElementById("vpvSub").textContent = "";
    document.getElementById("vpvBody").innerHTML = "";
    resetCounts();
    document.getElementById("vpvComments").innerHTML = "";
    // Ownership and the two server-only numbers are unknown again until the
    // next answer, so the bar's owner-only affordances go back to their closed
    // state and the view count goes back to showing nothing at all.
    state.isOwner = false;
    state.views = null;
    state.saves = null;
    paintOwnerAffordances();
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
      type:                p.type || "post",
      media_kind:          p.media_kind || p.mediaKind || "",
      media_thumbnail_url: p.media_thumbnail_url || p.mediaThumbnailUrl || "",
    });
  }

  function renderFromServer(j) {
    const p = j.post;
    paintHeader({ author: p.author, created_at: p.created_at });
    paintBody({
      content:             p.content,
      tags:                p.tags || [],
      media_url:           p.media_url,
      type:                p.type,
      media_kind:          p.media_kind,
      media_thumbnail_url: p.media_thumbnail_url,
    });
    state.authorId = p.user_id || (p.author && p.author.id) || null;
    state.authorName = (p.author && p.author.name) || "";
    state.type     = p.type || "post";
    state.content = p.content || "";
    state.mediaUrl = p.media_url || null;
    // A video URL is no <img> poster for the share card; fall back to none.
    state.posterUrl = p.media_thumbnail_url || (p.media_kind === "video" ? null : p.media_url) || null;
    state.liked = !!(j.viewer && j.viewer.liked);
    state.saved = !!(j.viewer && j.viewer.saved);
    state.likes = (j.counts && j.counts.likes) || 0;
    state.comments = (j.counts && j.counts.comments) || 0;
    // counts.views is the honest ledger tally with the author's own rows
    // dropped (src/app/api/posts/[id]/route.ts) — not posts.view_count.
    // Anything that isn't a number stays unknown, and unknown hides the entry
    // rather than painting a 0 nobody measured.
    state.views = (j.counts && typeof j.counts.views === "number") ? j.counts.views : null;
    // counts.saves is OPTIONAL: the server omits the key rather than sending 0
    // when it could not read the count, so `absent` has to stay distinguishable
    // from `zero` all the way to the screen.
    state.saves = (j.counts && typeof j.counts.saves === "number") ? j.counts.saves : null;
    // The server decides who the author is — here and for the "..." menu
    // below. vibe_user_v1 is a localStorage blob the app shell writes, not the
    // session, so on a shared browser it can still hold the previous account
    // and would offer B a Delete on A's post (or hide it from the real
    // author). The routes re-check ownership either way.
    state.isOwner = j.is_owner === true;
    document.getElementById("vpvLikeCount").textContent = String(state.likes);
    document.getElementById("vpvCommentCount").textContent = String(state.comments);
    document.getElementById("vpvLike").classList.toggle("on", state.liked);
    document.getElementById("vpvSave").classList.toggle("on", state.saved);
    paintOwnerAffordances();

    // "..." menu — owner sees Delete; everyone else sees Report/Mute/Block.
    const isOwner = state.isOwner;
    const more = document.getElementById("vpvMore");
    const menu = document.getElementById("vpvMenu");
    if (more) more.classList.add("show");
    if (menu) {
      if (isOwner) {
        menu.innerHTML = `<button type="button" class="danger" onclick="window.__vpvDeletePost()">Delete post</button>`;
      } else {
        // Attribute-safe JS literals: JSON.stringify builds the JS string,
        // esc() makes it safe inside onclick="..." (decoded before eval).
        const authorId = String(state.authorId || "");
        const authorName = String(state.authorName || "");
        const safeId = esc(JSON.stringify(String(state.openId || "")));
        const safeAuthor = esc(JSON.stringify(authorId));
        const safeName = esc(JSON.stringify(authorName));
        const firstName = esc(authorName.split(' ')[0] || 'author');
        menu.innerHTML = `
          <button type="button" onclick="window.__vpvCloseMenu();window.vibeOpenReportSheet('post',${safeId})">Report post</button>
          ${authorId ? `<button type="button" onclick="window.__vpvCloseMenu();window.vibeOpenMuteSheet(${safeAuthor},${safeName})">Mute ${firstName}</button>` : ''}
          ${authorId ? `<button type="button" class="danger" onclick="window.__vpvCloseMenu();window.vibeBlock(${safeAuthor},${safeName}, () => window.__vpvClose())">Block ${firstName}</button>` : ''}
        `;
      }
    }
  }

  // The two owner-only bits of the engagement bar, painted from state:
  // the Views entry becomes clickable, and the saves number appears next to
  // Save. Everyone else keeps the view count as a plain label and sees no
  // saves number at all — counts are public, identities are private, and how
  // many people saved YOUR post is part of your own metrics.
  function paintOwnerAffordances() {
    const viewsBtn = document.getElementById("vpvViews");
    const viewsCount = document.getElementById("vpvViewCount");
    if (viewsBtn && viewsCount) {
      // Unknown is not zero. A public share link never calls /api/posts/:id,
      // so without this the eye would sit next to a "0" on a post with 500
      // real views — a wrong number, stated silently.
      const known = typeof state.views === "number";
      viewsBtn.style.display = known ? "" : "none";
      viewsCount.textContent = known ? String(state.views) : "";
      viewsBtn.disabled = !state.isOwner;
      // The name changes with the job, it never disappears: a screen reader
      // promising "Who saw this" on a dead button lies, but a bare "1,203,
      // button" says nothing at all. Owners get the action, everyone else
      // gets what the number means.
      if (state.isOwner) {
        viewsBtn.setAttribute("title", "Who saw this");
        viewsBtn.setAttribute("aria-label", "Who saw this");
      } else {
        viewsBtn.removeAttribute("title");
        if (known) {
          viewsBtn.setAttribute("aria-label",
            state.views === 1 ? "1 view" : String(state.views) + " views");
        } else {
          viewsBtn.removeAttribute("aria-label");
        }
      }
    }
    const savesBtn = document.getElementById("vpvSaveCount");
    if (savesBtn) {
      // Absent still means unknown; 0 now means "nothing to show". A naked
      // "0" beside the bookmark is the one unexplained number in the row, and
      // tapping it only ever opened a sheet that said "No one yet."
      const show = state.isOwner && typeof state.saves === "number" && state.saves > 0;
      savesBtn.style.display = show ? "" : "none";
      savesBtn.textContent = show ? String(state.saves) : "";
    }
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
  // already neutralized by the time we inject spans. The click goes through
  // __vibeTopNav: inside the /messages iframe a plain link would load the
  // profile in the frame, under a second sidebar.
  function formatBodyText(s) {
    const escaped = esc(s);
    return escaped.replace(
      /(^|[^A-Za-z0-9_@])@([a-z0-9_]{3,20})/gi,
      (_m, prefix, handle) =>
        `${prefix}<a class="vpv-mention" href="/profile/${encodeURIComponent(handle.toLowerCase())}" onclick="event.preventDefault();event.stopPropagation();window.__vibeTopNav(this.getAttribute('href'))">@${handle}</a>`,
    );
  }

  function paintBody({ content, tags, media_url, type, media_kind, media_thumbnail_url }) {
    const body = document.getElementById("vpvBody");
    const text = content ? `<div class="vpv-text">${formatBodyText(content)}</div>` : "";
    let media = "";
    if (media_url && type === "post" && media_kind === "video") {
      // Video posts (an R2 clips/ key behind the /media proxy). The API says
      // which player to use in media_kind; the thumbnail is the poster.
      const poster = media_thumbnail_url ? ` poster="${esc(media_thumbnail_url)}"` : "";
      media = `<video class="vpv-video" src="${esc(media_url)}"${poster} controls playsinline preload="metadata"></video>`;
    } else if (media_url && type === "post") {
      // Post images are stored as public URLs (Supabase profiles bucket)
      media = `<img class="vpv-image" src="${esc(media_url)}" alt="">`;
    }
    const tagBlock = (tags && tags.length)
      ? `<div class="vpv-tags">${tags.map(t => `<span class="vpv-tag">#${esc(t)}</span>`).join("")}</div>`
      : "";
    body.innerHTML = text + media + tagBlock;
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
    if (!isRealPostId(state.openId)) { toast("This post can't be interacted with"); return; }
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
    if (!isRealPostId(state.openId)) { toast("This post can't be interacted with"); return; }
    if (state.inflight) return;
    state.inflight = true;
    const wasSaved = state.saved;
    state.saved = !wasSaved;
    // state.saves is deliberately NOT bumped: counts.saves excludes the
    // author's own bookmark, so an author saving their own post moves
    // `viewer.saved` and nothing else. Optimistically adding one here would be
    // contradicted by the very next fetch.
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
      toast("This post can't be shared");
      return;
    }
    const title = (state.content || "").slice(0, 240);
    window.openSharePicker({
      postId: state.openId,
      kind: "post",
      title: title || "Post",
      posterUrl: state.posterUrl,
      authorName: state.authorName,
    });
  };

  window.__vpvToggleMenu = function (ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById("vpvMenu");
    if (!menu) return;
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
    if (!isRealPostId(state.openId)) { toast("This post can't be deleted"); return; }
    // Quick confirm — destructive action, can't undo.
    if (!window.confirm("Delete this post? This can't be undone.")) return;
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
      `[data-vibe-id="${id}"]`,           // .vibe-grid-thumb in the Saved grid
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
    // Re-run aggregators where they exist so empty states show up.
    if (typeof populateAllGrid === "function") populateAllGrid();
    if (typeof savePostsToStorage === "function") savePostsToStorage();
  }

  window.__vpvSubmitComment = async function () {
    if (!state.openId) return;
    const inp = document.getElementById("vpvCommentInput");
    const btn = document.getElementById("vpvCommentSubmit");
    const content = (inp && inp.value || "").trim();
    if (!content) return;
    if (!isAppShell()) { toast("Sign in to comment"); return; }
    if (!isRealPostId(state.openId)) { toast("This post can't be interacted with"); return; }
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
    if (!isRealPostId(state.openId)) { toast("This post can't be interacted with"); return; }
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

  // ══════════════════════════════════════════════════════════════════════
  // Audience sheet — "Who saw this" / "Who saved this"
  //
  // Screen C of the metrics wave, static twin of the React sheet
  // (handoffs/2026-09-14-wave-plan-metrics-screens.md). The author opens it
  // from the Views entry or from the saves number; everyone else never sees a
  // way in. Reads GET /api/me/posts/[id]/viewers and /savers, which answer a
  // free owner with a count and NO names at all, and a Vibe+ owner with rows.
  // So this file has two bodies: a lock over the number, or the people.
  //
  // Nothing here is a permission check. The routes 404 a post that is not
  // yours whatever this client believes.
  // ══════════════════════════════════════════════════════════════════════

  const AUD_LIMIT = 25;         // the routes' own default page size

  const aud = {
    open: false,
    kind: null,       // 'viewers' | 'savers'
    postId: null,
    rows: [],
    total: null,      // people, from the server — never counted off `rows`
    nextOffset: 0,
    hasMore: false,
    failed: false,    // a refused read is not "No one yet."
    seq: 0,           // the newest load owns the sheet
  };

  // ── Day labels (JS twin of src/lib/metrics/day-label.ts) ──────────────
  // Two clocks on purpose. `post_views.viewed_on` is a DATE written on the UTC
  // calendar, so reading it in local time drags a Tuesday view back to Monday
  // for anyone west of Greenwich; `bookmarks.created_at` is a real instant and
  // belongs on the reader's own clock. And the view ledger keeps one row per
  // person per day, so a day name is the finest honest grain there is —
  // never "2 hours ago".
  const AUD_LOCALE = "en-US";   // one campus, one voice
  const AUD_DAY_MS = 86400000;
  const AUD_WEEKDAY_DAYS = 6;   // past six days a weekday name stops being a date
  const AUD_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function audUtcMidnight(s) {
    const m = AUD_DATE_RE.exec(String(s || ""));
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const at = Date.UTC(y, mo - 1, d);
    const back = new Date(at);
    // Round-trip rejects "2026-02-31", which Date.UTC would roll into March.
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
      return null;
    }
    return at;
  }

  // "" for anything that isn't a YYYY-MM-DD — the row then carries no day
  // header rather than the words "Invalid Date".
  function dayLabelFromDate(yyyyMmDd) {
    const then = audUtcMidnight(yyyyMmDd);
    const today = audUtcMidnight(new Date().toISOString().slice(0, 10));
    if (then === null || today === null) return "";
    const days = Math.round((today - then) / AUD_DAY_MS);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    const at = new Date(then);
    if (days <= AUD_WEEKDAY_DAYS) {
      return at.toLocaleDateString(AUD_LOCALE, { weekday: "long", timeZone: "UTC" });
    }
    if (at.getUTCFullYear() === new Date(today).getUTCFullYear()) {
      return at.toLocaleDateString(AUD_LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });
    }
    return at.toLocaleDateString(AUD_LOCALE,
      { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  function audStartOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayLabelFromTimestamp(iso) {
    const then = new Date(iso);
    if (isNaN(then.getTime())) return "";
    const now = new Date();
    const days = Math.round((audStartOfLocalDay(now) - audStartOfLocalDay(then)) / AUD_DAY_MS);
    // A timestamp from the future (clock skew) reads as Today, not as "-1 days".
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days <= AUD_WEEKDAY_DAYS) return then.toLocaleDateString(AUD_LOCALE, { weekday: "long" });
    if (then.getFullYear() === now.getFullYear()) {
      return then.toLocaleDateString(AUD_LOCALE, { month: "short", day: "numeric" });
    }
    return then.toLocaleDateString(AUD_LOCALE, { month: "short", day: "numeric", year: "numeric" });
  }

  function audDayLabel(u) {
    return aud.kind === "savers"
      ? dayLabelFromTimestamp(u.saved_at)
      : dayLabelFromDate(u.viewed_on);
  }

  // ── Sheet shell ───────────────────────────────────────────────────────
  function ensureAudienceModal() {
    if (document.getElementById("vpvAudOverlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "vpv-aud-overlay";
    overlay.id = "vpvAudOverlay";
    overlay.innerHTML = `
      <div class="vpv-aud-card" role="dialog" aria-modal="true" aria-labelledby="vpvAudTitle">
        <div class="vpv-aud-head">
          <div class="vpv-aud-headtext">
            <div class="vpv-aud-title" id="vpvAudTitle">Who saw this</div>
            <div class="vpv-aud-sub" id="vpvAudSub"></div>
          </div>
          <button class="vpv-aud-close" aria-label="Close" onclick="window.__vpvCloseAudience()">&times;</button>
        </div>
        <div class="vpv-aud-body">
          <div id="vpvAudRows"></div>
          <div id="vpvAudMore"></div>
          <div id="vpvAudErr"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAudience();
    });
    // Escape is handled by the post modal's one keydown listener, which closes
    // this sheet first — see ensureModal().
  }

  function openAudience(kind) {
    // Client-side gate on the server's own answer. The affordances are hidden
    // for everyone else, so this only catches a stale click mid-close.
    if (!state.openId || !state.isOwner) return;
    if (!isAppShell()) { toast("Sign in to see this"); return; }
    if (!isRealPostId(state.openId)) { toast("This post has no stats yet"); return; }
    ensureAudienceModal();
    aud.open = true;
    aud.kind = kind;
    aud.postId = state.openId;
    aud.rows = [];
    aud.total = null;
    aud.nextOffset = 0;
    aud.hasMore = false;
    aud.failed = false;
    aud.seq++;
    document.getElementById("vpvAudTitle").textContent =
      kind === "savers" ? "Who saved this" : "Who saw this";
    document.getElementById("vpvAudSub").textContent = "";
    document.getElementById("vpvAudRows").innerHTML = `<div class="vpv-aud-loading">loading…</div>`;
    document.getElementById("vpvAudMore").innerHTML = "";
    document.getElementById("vpvAudErr").textContent = "";
    document.getElementById("vpvAudOverlay").classList.add("show");
    loadAudience(0);
  }

  function closeAudience() {
    aud.open = false;
    aud.seq++;   // any request still in flight stops owning the sheet
    const overlay = document.getElementById("vpvAudOverlay");
    if (overlay) overlay.classList.remove("show");
    // Identities are the private half, so they do not outlive the sheet that
    // was gated to show them: names, handles and avatars come straight back
    // out of the hidden DOM. openAudience() repaints from scratch anyway.
    aud.rows = [];
    const rowsEl = document.getElementById("vpvAudRows");
    if (rowsEl) rowsEl.innerHTML = "";
  }

  // ── Rows ──────────────────────────────────────────────────────────────
  // Same wording as the connections modal (public/html/profile.html): the
  // number is a DIRECTED intersection — people they follow whom you follow
  // too — so it says "you both follow" and never claims "mutuals".
  function audMetaLine(u) {
    const parts = [];
    if (u.major) parts.push(u.major);
    if (u.year) parts.push(String(u.year));
    if (u.mutual_count > 0) parts.push(u.mutual_count + " you both follow");
    return parts.join(" · ");
  }

  function audRowHTML(u) {
    const av = u.avatar_url
      ? `<div class="vpv-aud-av"><img src="${esc(u.avatar_url)}" alt=""></div>`
      : `<div class="vpv-aud-av">${esc(initials(u.name || u.handle))}</div>`;
    const handle = u.handle ? `<span class="vpv-aud-h">@${esc(u.handle)}</span>` : "";
    const meta = audMetaLine(u);
    const inner = `${av}
        <div class="vpv-aud-info">
          <div class="vpv-aud-name">${esc(u.name || u.handle || "Member")}${handle}</div>
          ${meta ? `<div class="vpv-aud-meta">${esc(meta)}</div>` : ""}
        </div>`;
    if (!u.handle) return `<div class="vpv-aud-row">${inner}</div>`;
    // Through __vibeTopNav for the same reason mentions are: inside the
    // /messages or /otto iframe a plain link loads the profile in the frame.
    const href = `/profile/${encodeURIComponent(u.handle)}`;
    return `<a class="vpv-aud-row" href="${esc(href)}"
      onclick="event.preventDefault();window.__vibeTopNav(this.getAttribute('href'))">${inner}</a>`;
  }

  function audPeopleLine(n) {
    return n === 1 ? "1 person" : String(n) + " people";
  }

  function paintAudience() {
    const rowsEl = document.getElementById("vpvAudRows");
    const moreEl = document.getElementById("vpvAudMore");
    const subEl  = document.getElementById("vpvAudSub");
    if (!rowsEl || !moreEl || !subEl) return;
    if (aud.rows.length === 0) {
      // A read that failed says so in the error box below; it must never
      // render as "No one yet.", which is a claim we cannot make.
      rowsEl.innerHTML = aud.failed ? "" : `<div class="vpv-aud-empty">No one yet.</div>`;
    } else {
      let html = "";
      let lastDay = null;
      aud.rows.forEach((u) => {
        const day = audDayLabel(u);
        if (day && day !== lastDay) {
          html += `<div class="vpv-aud-day">${esc(day)}</div>`;
          lastDay = day;
        }
        html += audRowHTML(u);
      });
      rowsEl.innerHTML = html;
    }
    // People, not views: `total` is distinct people after the author's own
    // rows and blocked/muted people come out, so it can sit below the number
    // on the Views entry. The two answer different questions; this line never
    // borrows the other one.
    subEl.textContent = aud.total === null ? "" : audPeopleLine(aud.total);
    moreEl.innerHTML = (!aud.failed && aud.hasMore)
      ? `<button class="vpv-aud-more" onclick="window.__vpvAudMore()">Show more</button>`
      : "";
  }

  function paintAudienceLock(total) {
    const rowsEl = document.getElementById("vpvAudRows");
    const moreEl = document.getElementById("vpvAudMore");
    const subEl  = document.getElementById("vpvAudSub");
    if (!rowsEl || !moreEl || !subEl) return;
    subEl.textContent = "";
    moreEl.innerHTML = "";
    if (total <= 0) {
      // A lock over nobody is a worse ad than no lock (OttoMetrics precedent).
      rowsEl.innerHTML = `<div class="vpv-aud-empty">No one yet.</div>`;
      return;
    }
    const label = aud.kind === "savers"
      ? (total === 1 ? "person saved this" : "people saved this")
      : (total === 1 ? "person saw this"   : "people saw this");
    // The top-level path, so /plus sends the student back to the page they
    // were on and not to /html/campus.html inside the shell's iframe.
    const here = (typeof _vibeTopHere === "function")
      ? _vibeTopHere()
      : location.pathname + location.search;
    const next = esc(encodeURIComponent(here));
    rowsEl.innerHTML = `<div class="vpv-aud-lock">
      <div class="vpv-aud-lock-n">${esc(String(total))}</div>
      <div class="vpv-aud-lock-label">${esc(label)}</div>
      <div class="vpv-aud-lock-line">Vibe+ shows you who.</div>
      <a class="vpv-aud-cta" href="/plus?next=${next}"
        onclick="event.preventDefault();window.__vibeTopNav(this.getAttribute('href'))">See Vibe+</a>
    </div>`;
  }

  // ── Load ──────────────────────────────────────────────────────────────
  // Quiet: a failure belongs in the sheet, next to the rows it is about, not
  // in a toast behind it. One vibeLoadFailed for the whole block, in its own
  // slot under the rows, so a failed "Show more" keeps what is already painted.
  async function loadAudience(offset) {
    const seq = ++aud.seq;
    const id = aud.postId;
    const kind = aud.kind;
    const line = kind === "savers"
      ? "Couldn't load who saved this."
      : "Couldn't load who saw this.";
    const errEl = document.getElementById("vpvAudErr");
    if (errEl) errEl.textContent = "";
    // A first page is the whole sheet, so a retry has to look like the first
    // open did: clearing the error box alone leaves an empty card for the
    // length of the round trip. Later pages keep the rows they already have.
    if (offset === 0) {
      const rowsEl = document.getElementById("vpvAudRows");
      if (rowsEl) rowsEl.innerHTML = `<div class="vpv-aud-loading">loading…</div>`;
    }
    const r = await window.vibeRequest(
      `/api/me/posts/${encodeURIComponent(id)}/${kind}?limit=${AUD_LIMIT}&offset=${offset}`,
      { failure: line, quiet: true },
    );
    // Closed the sheet, switched lists, or opened another post mid-flight.
    if (seq !== aud.seq || !aud.open) return;

    if (r.ok && r.data && r.data.ok) {
      if (r.data.premium === false || r.data.viewer_identities === "locked") {
        // Free: a count and nothing else came back — there are no names in
        // this response to leak, and there is nothing to page through.
        aud.failed = false;
        aud.rows = [];
        aud.hasMore = false;
        aud.total = Number(r.data.total) || 0;
        paintAudienceLock(aud.total);
        return;
      }
      // A paid answer with no `users` array is a shape we don't recognise, and
      // an unrecognised body is closer to a refused read than to an empty
      // list — so it falls through to the failure branch rather than painting
      // "No one yet." (same test the connections modal makes in profile.html).
      const users = Array.isArray(r.data.users) ? r.data.users : null;
      if (users) {
        aud.failed = false;
        aud.rows = offset === 0 ? users : aud.rows.concat(users);
        aud.total = Number(r.data.total) || 0;
        aud.hasMore = !!r.data.has_more;
        // next_offset counts ENTRIES the server consumed, not rows it sent:
        // people with no readable profile are dropped during hydration, so
        // paging on rows.length would re-ask for ids we already have — or, on
        // a page where every id was dropped, never advance at all.
        aud.nextOffset = typeof r.data.next_offset === "number"
          ? r.data.next_offset
          : offset + AUD_LIMIT;
        paintAudience();
        return;
      }
    }

    // Keep every row already on screen and say what failed underneath them.
    aud.failed = true;
    paintAudience();
    if (errEl) {
      window.vibeLoadFailed(errEl, window.vibeLoadFailure(r, line),
        () => loadAudience(offset), { compact: true });
    }
  }

  window.__vpvOpenViewers = function () { openAudience("viewers"); };
  window.__vpvOpenSavers  = function () { openAudience("savers"); };
  window.__vpvCloseAudience = closeAudience;
  window.__vpvAudMore = function () {
    if (!aud.open || aud.failed) return;
    loadAudience(aud.nextOffset);
  };
})();
