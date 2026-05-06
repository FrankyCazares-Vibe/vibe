// ══════════════════════════════════════════════════════════════════════════
// Vibe — @mention typeahead picker for textareas.
//
// Self-injects a single absolutely-positioned popover used across every
// composer that opts in via `window.vibeBindMentionPicker(textareaEl)`.
// Pages just attach the picker to whichever textareas should support
// mentions (chat composer, mini messenger, post composer, etc.).
//
// Detection: looks for `@<word>` immediately before the caret with no
// space between the @ and the word. Querying:
//   GET /api/users/search?q=<word>
// Selecting a result replaces the @<typed> with @<handle> + a trailing
// space so the user can keep typing.
//
// Keyboard:
//   ↑/↓ — move highlight  •  Enter/Tab — select  •  Esc — close
// Mouse: hover highlights, click selects, click-outside closes.
// ══════════════════════════════════════════════════════════════════════════
(function vibeMentionPickerInit() {
  if (window.__vibeMentionPickerInjected) return;
  window.__vibeMentionPickerInjected = true;

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

  // Popover element + CSS — single instance, repositioned per textarea.
  const style = document.createElement("style");
  style.id = "vibe-mention-picker-css";
  style.textContent = `
    /* z-index above the custom cursor (.cursor at 9999) so the popover
       isn't visually covered by the cursor element. cursor:default
       overrides the page's cursor:none so the SYSTEM cursor shows up
       inside the popover (the custom cursor is hidden behind us). */
    .vmp-popover{position:fixed;background:white;border:1px solid rgba(28,28,30,.08);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.18);min-width:240px;max-width:320px;max-height:280px;overflow-y:auto;z-index:100000;display:none;font-family:'DM Sans',system-ui,sans-serif;cursor:default;}
    .vmp-popover.show{display:block;}
    .vmp-row{display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer !important;border-bottom:1px solid rgba(28,28,30,.04);}
    .vmp-row:last-child{border-bottom:none;}
    .vmp-row.active,.vmp-row:hover{background:#FAF7F2;}
    .vmp-av{width:30px;height:30px;border-radius:9px;background:#1C1C1E;color:white;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:11px;font-weight:700;flex-shrink:0;overflow:hidden;}
    .vmp-av img{width:100%;height:100%;object-fit:cover;display:block;}
    .vmp-info{flex:1;min-width:0;}
    .vmp-name{font-size:13px;font-weight:600;color:#1C1C1E;}
    .vmp-handle{font-size:11px;color:#8A8580;}
    .vmp-empty{padding:16px 14px;color:#8A8580;font-size:12px;text-align:center;}
  `;
  document.head.appendChild(style);

  const popover = document.createElement("div");
  popover.className = "vmp-popover";
  popover.id = "vmpPopover";
  function attach() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", attach);
      return;
    }
    if (!document.body.contains(popover)) document.body.appendChild(popover);
  }
  attach();

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    activeTextarea: null,
    matchStart: -1,        // index in textarea.value where the @ sits
    matchEnd: -1,          // index after the typed word (caret position)
    results: [],
    highlight: 0,
    abort: null,
    debounce: null,
  };

  function close() {
    popover.classList.remove("show");
    state.activeTextarea = null;
    state.matchStart = -1;
    state.matchEnd = -1;
    state.results = [];
    state.highlight = 0;
    state.boundOpts = null;
    if (state.abort) { state.abort.abort(); state.abort = null; }
    if (state.debounce) { clearTimeout(state.debounce); state.debounce = null; }
    // Restore the page's custom cursor element when we're done.
    Array.from(document.querySelectorAll(".cursor, .cursor-ring")).forEach((el) => {
      el.style.display = "";
    });
  }

  // Position the popover ABOVE the textarea (anchored to its top-left).
  // Caret-precise positioning with a mirror div is overkill for v1.
  function position(textarea) {
    const r = textarea.getBoundingClientRect();
    const popH = popover.offsetHeight || 240;
    const top = Math.max(8, r.top - popH - 6);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 320 - 8));
    popover.style.top = top + "px";
    popover.style.left = left + "px";
  }

  function paint() {
    if (state.results.length === 0) {
      popover.innerHTML = `<div class="vmp-empty">No matches</div>`;
      return;
    }
    popover.innerHTML = state.results.map((u, i) => {
      const name = u.name || ("@" + (u.handle || ""));
      const initials = initialsOf(name);
      const av = u.avatar_url
        ? `<img src="${esc(u.avatar_url)}" alt="">`
        : esc(initials);
      return `<div class="vmp-row${i === state.highlight ? " active" : ""}" data-i="${i}">
        <div class="vmp-av" style="background:${avBg(u.handle || u.id || name)}">${av}</div>
        <div class="vmp-info">
          <div class="vmp-name">${esc(name)}</div>
          ${u.handle ? `<div class="vmp-handle">@${esc(u.handle)}</div>` : ""}
        </div>
      </div>`;
    }).join("");
    Array.from(popover.querySelectorAll(".vmp-row")).forEach((row) => {
      // mousedown fires before textarea blur, so the textarea keeps focus
      // when the user clicks; preventDefault stops the default focus shift.
      // We also bind click as a belt-and-suspenders for touch / synthetic
      // events that might not deliver mousedown reliably.
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(row.dataset.i) || 0;
        select(idx);
      };
      row.addEventListener("mousedown", fire);
      row.addEventListener("click", fire);
      row.addEventListener("touchstart", fire, { passive: false });
    });
  }

  // Replace the @<typed> token in the textarea with @<handle> + a space.
  function select(idx) {
    const u = state.results[idx];
    const ta = state.activeTextarea;
    if (!u || !ta || state.matchStart < 0) { close(); return; }
    const handle = u.handle || "";
    if (!handle) { close(); return; }
    const before = ta.value.slice(0, state.matchStart);
    const after = ta.value.slice(state.matchEnd);
    const replaced = "@" + handle + " ";
    ta.value = before + replaced + after;
    const caret = before.length + replaced.length;
    ta.setSelectionRange(caret, caret);
    ta.focus();
    // Trigger an input event so callers' own oninput handlers fire
    // (e.g. autosize, send-button enable).
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  }

  // Detect "@<word>" immediately before the caret with no space between
  // the @ and the word. Returns { start, end, query } or null.
  function detect(textarea) {
    const v = textarea.value || "";
    const caret = textarea.selectionStart || 0;
    if (caret === 0) return null;
    // Walk back from caret to find an @ that starts a token.
    let i = caret - 1;
    while (i >= 0) {
      const ch = v.charAt(i);
      if (ch === "@") {
        const before = i > 0 ? v.charAt(i - 1) : "";
        // Must not be preceded by a word char (avoids emails like a@b).
        if (!/[A-Za-z0-9_]/.test(before)) {
          const query = v.slice(i + 1, caret);
          // Only if query is empty OR a valid handle prefix.
          if (/^[a-z0-9_]{0,20}$/i.test(query)) {
            return { start: i, end: caret, query };
          }
        }
        return null;
      }
      // Stop searching if we hit whitespace — the user backspaced past
      // the @ or moved the caret out of a mention region.
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }

  async function fetchSuggestions(query) {
    if (state.abort) state.abort.abort();
    state.abort = new AbortController();
    try {
      if (query.length === 0) {
        state.results = [];
        paint();
        return;
      }
      // Channel-scoped search: when the binding provided a getChannelId
      // (chat composer in a group), pass it so the API filters down to
      // the channel's actual members.
      const opts = state.boundOpts || {};
      let channelId = "";
      try { channelId = opts.getChannelId ? (opts.getChannelId() || "") : ""; }
      catch (_) { channelId = ""; }
      const url =
        "/api/users/search?q=" + encodeURIComponent(query) + "&limit=8" +
        (channelId ? "&channel_id=" + encodeURIComponent(channelId) : "");
      const r = await fetch(url, { credentials: "include", signal: state.abort.signal });
      const j = await r.json();
      if (!j || !j.ok) {
        state.results = [];
      } else {
        state.results = (j.users || []).filter((u) => u.handle);
      }
      state.highlight = 0;
      paint();
      if (state.activeTextarea) position(state.activeTextarea);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      console.error("[mentionPicker.fetch]", e);
    }
  }

  function onInput(textarea) {
    const m = detect(textarea);
    if (!m) { close(); return; }
    state.activeTextarea = textarea;
    state.matchStart = m.start;
    state.matchEnd = m.end;
    state.boundOpts = textarea.__vmpOpts || null;
    popover.classList.add("show");
    position(textarea);
    // Hide the page's custom cursor element while the popover is up.
    // The picker's CSS sets cursor:default so the SYSTEM cursor takes
    // over inside the popover; without hiding the custom cursor first
    // the user sees the orange dot bleed through above the system cursor.
    Array.from(document.querySelectorAll(".cursor, .cursor-ring")).forEach((el) => {
      el.style.display = "none";
    });
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => fetchSuggestions(m.query), 140);
  }

  function onKeydown(textarea, e) {
    if (!popover.classList.contains("show")) return;
    if (state.activeTextarea !== textarea) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.highlight = Math.min(state.results.length - 1, state.highlight + 1);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.highlight = Math.max(0, state.highlight - 1);
      paint();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (state.results.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      select(state.highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  // Click anywhere outside the textarea + popover → close.
  document.addEventListener("mousedown", (e) => {
    if (!popover.classList.contains("show")) return;
    const ta = state.activeTextarea;
    if (!ta) return;
    if (popover.contains(e.target)) return;
    if (ta === e.target) return;
    close();
  });

  // ── Public API ─────────────────────────────────────────────────────────
  // opts.getChannelId() — return the active channel id at fetch time so
  // the picker can scope to channel members only (used by chat composers
  // so a stray @stranger in a group can't be tagged).
  window.vibeBindMentionPicker = function (textarea, opts) {
    if (!textarea) return;
    // Allow re-binding to update opts (e.g., active channel changed).
    textarea.__vmpOpts = opts || null;
    if (textarea.__vmpBound) return;
    textarea.__vmpBound = true;
    textarea.addEventListener("input", () => onInput(textarea));
    textarea.addEventListener("keydown", (e) => onKeydown(textarea, e), true);
    textarea.addEventListener("blur", () => {
      setTimeout(() => {
        if (!popover.matches(":hover")) close();
      }, 120);
    });
  };
  window.vibeMentionPickerClose = close;
})();
