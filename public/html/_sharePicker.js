// ══════════════════════════════════════════════════════════════════════════
// Vibe — shared "Send to..." picker for sharing posts/clips into DMs.
// Self-injects markup + CSS on first call. Pages just include this file
// and call `window.openSharePicker({ postId, kind, title?, posterUrl?, posterCss?, authorName? })`.
//
//   POST  /api/me/threads/[id]/messages with { content, attachment_id, attachment_kind }
//   GET   /api/me/threads                                  (the user's threads)
//
// Picker UX: list of viewer's threads + a multi-select. Optional caption
// text. "Send" posts an attachment-message to every selected thread.
// ══════════════════════════════════════════════════════════════════════════
(function vibeSharePickerInit() {
  if (window.__vibeSharePickerInjected) return;
  window.__vibeSharePickerInjected = true;

  const css = `
    .vsp-overlay{position:fixed;inset:0;background:rgba(28,28,30,.42);z-index:11000;display:none;align-items:flex-start;justify-content:center;padding-top:88px;}
    .vsp-overlay.show{display:flex;}
    .vsp-card{width:min(440px,92vw);max-height:78vh;background:white;border-radius:16px;border:1px solid rgba(28,28,30,.08);box-shadow:0 28px 80px rgba(0,0,0,.22);overflow:hidden;display:flex;flex-direction:column;font-family:'DM Sans',system-ui,sans-serif;}
    .vsp-hdr{padding:16px 18px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(28,28,30,.08);}
    .vsp-title{font-family:'Fraunces',serif;font-size:17px;font-weight:800;flex:1;}
    .vsp-x{background:none;border:none;color:#8A8580;cursor:pointer;font-size:18px;line-height:1;padding:4px 6px;}
    .vsp-preview{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(28,28,30,.08);background:#FAF7F2;}
    .vsp-poster{width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;background:#1C1C1E;}
    .vsp-poster img{width:100%;height:100%;object-fit:cover;display:block;}
    .vsp-pinfo{flex:1;min-width:0;}
    .vsp-plabel{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#FF5C35;margin-bottom:3px;}
    .vsp-ptitle{font-size:13px;font-weight:600;color:#1C1C1E;line-height:1.35;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
    .vsp-pauthor{font-size:11px;color:#8A8580;margin-top:3px;}
    .vsp-search{padding:10px 16px;border-bottom:1px solid rgba(28,28,30,.08);}
    .vsp-search input{width:100%;border:1.5px solid rgba(28,28,30,.08);border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;}
    .vsp-search input:focus{border-color:rgba(28,28,30,.2);}
    .vsp-list{flex:1;overflow-y:auto;min-height:120px;}
    .vsp-row{display:flex;align-items:center;gap:11px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(28,28,30,.04);}
    .vsp-row:hover{background:#FAF7F2;}
    .vsp-row.selected{background:rgba(255,92,53,.06);}
    .vsp-cb{width:18px;height:18px;border:1.5px solid rgba(28,28,30,.18);border-radius:6px;background:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .vsp-row.selected .vsp-cb{background:#FF5C35;border-color:#FF5C35;color:white;}
    .vsp-av{width:36px;height:36px;border-radius:10px;background:#1C1C1E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:12px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vsp-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vsp-rowinfo{flex:1;min-width:0;}
    .vsp-rowname{font-size:13.5px;font-weight:600;color:#1C1C1E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .vsp-rowsub{font-size:11px;color:#8A8580;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .vsp-empty{padding:32px 16px;text-align:center;color:#8A8580;font-size:12.5px;}
    .vsp-foot{padding:12px 16px;border-top:1px solid rgba(28,28,30,.08);display:flex;flex-direction:column;gap:10px;}
    .vsp-caption{width:100%;border:1.5px solid rgba(28,28,30,.08);border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;resize:none;min-height:32px;max-height:80px;}
    .vsp-cta{background:#FF5C35;color:white;border:none;border-radius:100px;padding:9px 18px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;align-self:flex-end;}
    .vsp-cta:disabled{opacity:.45;cursor:not-allowed;}
  `;
  const style = document.createElement("style");
  style.id = "vibe-share-picker-css";
  style.textContent = css;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "vsp-overlay";
  overlay.id = "vibeSharePickerOverlay";
  overlay.innerHTML = `
    <div class="vsp-card" onclick="event.stopPropagation()">
      <div class="vsp-hdr">
        <div class="vsp-title">Send to</div>
        <button class="vsp-x" type="button" onclick="window.closeSharePicker()">×</button>
      </div>
      <div class="vsp-preview" id="vspPreview"></div>
      <div class="vsp-search"><input id="vspSearch" type="text" placeholder="Search threads…" autocomplete="off"></div>
      <div class="vsp-list" id="vspList"><div class="vsp-empty">Loading your threads…</div></div>
      <div class="vsp-foot">
        <textarea class="vsp-caption" id="vspCaption" rows="1" placeholder="Add a message (optional)"></textarea>
        <button class="vsp-cta" id="vspCta" type="button" onclick="window.__vibeSharePickerSend()" disabled>Pick a chat to send</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) window.closeSharePicker();
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (!document.body.contains(overlay)) document.body.appendChild(overlay);
  });
  if (document.body) document.body.appendChild(overlay);

  const state = {
    open: false,
    post: null, // { postId, kind, title, posterUrl, posterCss, authorName }
    threads: [],
    filtered: [],
    selectedIds: new Set(),
  };

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

  function renderPreview() {
    const p = state.post;
    const el = document.getElementById("vspPreview");
    if (!p || !el) { if (el) el.innerHTML = ""; return; }
    let posterInner = "";
    if (p.posterUrl) {
      posterInner = `<img src="${esc(p.posterUrl)}" alt="">`;
    } else if (p.posterCss) {
      posterInner = `<div style="width:100%;height:100%;background:${p.posterCss};"></div>`;
    } else {
      posterInner = `<div style="width:100%;height:100%;background:#2D1B4E;"></div>`;
    }
    el.innerHTML = `
      <div class="vsp-poster">${posterInner}</div>
      <div class="vsp-pinfo">
        <div class="vsp-plabel">${p.kind === "clip" ? "Clip" : "Post"}</div>
        <div class="vsp-ptitle">${esc(p.title || "")}</div>
        ${p.authorName ? `<div class="vsp-pauthor">by ${esc(p.authorName)}</div>` : ""}
      </div>
    `;
  }

  function avatarHtml(thread) {
    const isGroup = thread.type === "group";
    if (isGroup && thread.photo_url) {
      return `<div class="vsp-av" style="background:${avBg(thread.id)}"><img src="${esc(thread.photo_url)}" alt=""></div>`;
    }
    if (isGroup) {
      return `<div class="vsp-av" style="background:${avBg(thread.id)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="9" r="3.5" stroke="white" stroke-width="1.5"/><circle cx="16" cy="9" r="3.5" stroke="white" stroke-width="1.5"/><path d="M3 19c0-2.5 2.4-4 5-4s5 1.5 5 4" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M11 19c0-2.5 2.4-4 5-4s5 1.5 5 4" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></div>`;
    }
    const peer = thread.peer || {};
    const seed = peer.id || peer.handle || thread.name;
    if (peer.avatar_url) {
      return `<div class="vsp-av" style="background:${avBg(seed)}"><img src="${esc(peer.avatar_url)}" alt=""></div>`;
    }
    return `<div class="vsp-av" style="background:${avBg(seed)}">${esc(initialsOf(peer.name || thread.name))}</div>`;
  }

  function renderList() {
    const el = document.getElementById("vspList");
    if (!el) return;
    if (state.filtered.length === 0) {
      el.innerHTML = '<div class="vsp-empty">No conversations yet — start one from someone\'s profile or the messages page.</div>';
      return;
    }
    el.innerHTML = state.filtered.map((t) => {
      const sel = state.selectedIds.has(t.id) ? "selected" : "";
      const sub = t.last_message?.content
        ? esc(t.last_message.content).slice(0, 80)
        : (t.type === "group" ? `${(t.members || []).length + 1} members` : "");
      const cb = state.selectedIds.has(t.id)
        ? '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 5.5L4.5 8L9 3" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
        : "";
      return `
        <div class="vsp-row ${sel}" data-cid="${esc(t.id)}">
          <div class="vsp-cb">${cb}</div>
          ${avatarHtml(t)}
          <div class="vsp-rowinfo">
            <div class="vsp-rowname">${esc(t.name || "Unknown")}</div>
            ${sub ? `<div class="vsp-rowsub">${sub}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");
    Array.from(el.querySelectorAll(".vsp-row")).forEach((row) => {
      row.addEventListener("click", () => {
        const cid = row.dataset.cid;
        if (state.selectedIds.has(cid)) state.selectedIds.delete(cid);
        else state.selectedIds.add(cid);
        renderList();
        renderCta();
      });
    });
  }

  function renderCta() {
    const btn = document.getElementById("vspCta");
    if (!btn) return;
    const n = state.selectedIds.size;
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? "Pick a chat to send" : (n === 1 ? "Send" : `Send to ${n}`);
  }

  async function loadThreads() {
    const el = document.getElementById("vspList");
    if (el) el.innerHTML = '<div class="vsp-empty">Loading your threads…</div>';
    try {
      const r = await fetch("/api/me/threads", { credentials: "include" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      // Combine threads + accepted requests; user can share into either.
      state.threads = [...(j.threads || []), ...(j.requests || [])];
      state.filtered = state.threads.slice();
      renderList();
    } catch (e) {
      console.error("[sharePicker.loadThreads]", e);
      if (el) el.innerHTML = '<div class="vsp-empty">Could not load threads.</div>';
    }
  }

  function applyFilter(q) {
    const term = (q || "").trim().toLowerCase();
    if (!term) {
      state.filtered = state.threads.slice();
    } else {
      state.filtered = state.threads.filter((t) => {
        const hay = [
          t.name,
          t.peer?.name,
          t.peer?.handle,
          ...(t.members || []).flatMap((m) => [m.name, m.handle]),
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(term);
      });
    }
    renderList();
  }

  window.openSharePicker = function(post) {
    if (!post || !post.postId) {
      console.warn("[openSharePicker] missing post id");
      return;
    }
    state.post = {
      postId: post.postId,
      kind: post.kind === "clip" ? "clip" : "post",
      title: post.title || "",
      posterUrl: post.posterUrl || null,
      posterCss: post.posterCss || null,
      authorName: post.authorName || "",
    };
    state.selectedIds = new Set();
    state.threads = [];
    state.filtered = [];
    state.open = true;

    // Ensure overlay is appended (covers async-load timing).
    if (!document.body.contains(overlay)) document.body.appendChild(overlay);
    overlay.classList.add("show");

    document.getElementById("vspSearch").value = "";
    document.getElementById("vspCaption").value = "";
    renderPreview();
    renderCta();
    loadThreads();

    // Wire search once.
    const search = document.getElementById("vspSearch");
    search.oninput = () => applyFilter(search.value);
  };

  window.closeSharePicker = function() {
    state.open = false;
    state.post = null;
    state.selectedIds = new Set();
    overlay.classList.remove("show");
  };

  window.__vibeSharePickerSend = async function() {
    if (!state.post || state.selectedIds.size === 0) return;
    const cta = document.getElementById("vspCta");
    cta.disabled = true;
    cta.textContent = "Sending…";
    const caption = (document.getElementById("vspCaption").value || "").trim();
    const ids = Array.from(state.selectedIds);
    let ok = 0; let fail = 0;
    for (const cid of ids) {
      try {
        const r = await fetch("/api/me/threads/" + encodeURIComponent(cid) + "/messages", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: caption,
            attachment_id: state.post.postId,
            attachment_kind: state.post.kind,
          }),
        });
        const j = await r.json();
        if (j.ok) ok++;
        else { fail++; console.warn("[sharePicker.send]", cid, j.error); }
      } catch (e) {
        fail++;
        console.error("[sharePicker.send]", cid, e);
      }
    }
    window.closeSharePicker();
    if (window.showToast) {
      window.showToast(fail > 0
        ? `Shared to ${ok} of ${ids.length} chats — ${fail} failed`
        : (ok === 1 ? "Sent" : `Sent to ${ok} chats`));
    }
  };
})();
