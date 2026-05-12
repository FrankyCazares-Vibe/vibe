// ══════════════════════════════════════════════════════════════════════════
// Vibe — Block / Mute / Report shared helpers.
//
// Self-injecting modals + window-scoped helpers used by profile.html,
// _postViewer.js, and messages.html (chat panel) so every surface that
// surfaces "..." actions on another user routes through the same UI +
// API calls.
//
// Exposes:
//   window.vibeBlock(targetId, displayName, onAfter)
//   window.vibeUnblock(targetId, onAfter)
//   window.vibeOpenMuteSheet(targetId, displayName, currentUntil, onAfter)
//   window.vibeUnmute(targetId, onAfter)
//   window.vibeOpenReportSheet(targetType, targetId, onAfter)
//   window.vibeFetchRelationship(target_id_or_handle) → Promise<{blocking,muting,mute_until}>
//
// `onAfter` is an optional callback that fires after the API call
// returns successfully — handy for re-rendering whichever menu opened
// the sheet.
// ══════════════════════════════════════════════════════════════════════════
(function vibeSafetyActionsInit() {
  if (window.__vibeSafetyActionsInjected) return;
  window.__vibeSafetyActionsInjected = true;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showToast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    if (window.showFeedToast) { window.showFeedToast(msg); return; }
    // Fallback: tiny ephemeral toast.
    let toast = document.getElementById("vsa-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vsa-toast";
      toast.style.cssText =
        "position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1C1C1E;color:white;padding:11px 18px;border-radius:100px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;z-index:11500;box-shadow:0 12px 36px rgba(0,0,0,.18);transition:opacity .25s;";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toast.__hideT);
    toast.__hideT = setTimeout(() => { toast.style.opacity = "0"; }, 2400);
  }

  // ── Shared modal shell (one DOM, reused by Mute + Report) ──────────────
  const styleEl = document.createElement("style");
  styleEl.id = "vibe-safety-actions-css";
  styleEl.textContent = `
    /* No backdrop dim — most pages we're running on are inside an iframe
       (CampusAppShell) where position:fixed only covers the iframe and
       the parent React sidebar stays bright; dimming looks broken. The
       card's strong shadow + border carries enough modal weight. */
    .vsa-overlay{position:fixed;inset:0;background:transparent;z-index:11000;display:none;align-items:center;justify-content:center;padding:24px;}
    .vsa-overlay.show{display:flex;}
    .vsa-card{width:min(420px,92vw);background:white;border-radius:16px;border:1px solid rgba(28,28,30,.08);box-shadow:0 28px 80px rgba(0,0,0,.28),0 4px 16px rgba(0,0,0,.08);overflow:hidden;display:flex;flex-direction:column;font-family:'DM Sans',system-ui,sans-serif;}
    .vsa-hdr{padding:16px 20px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(28,28,30,.08);}
    .vsa-title{font-family:'Fraunces',serif;font-size:17px;font-weight:800;flex:1;color:#1C1C1E;}
    .vsa-x{background:none;border:none;color:#8A8580;cursor:pointer;font-size:18px;line-height:1;padding:4px 6px;}
    .vsa-body{padding:14px 20px 18px;}
    .vsa-row{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-radius:10px;border:1px solid rgba(28,28,30,.08);cursor:pointer;font-size:13.5px;font-weight:600;color:#1C1C1E;margin-bottom:8px;background:white;transition:background .12s,border-color .12s;}
    .vsa-row:hover{background:#FAF7F2;border-color:rgba(28,28,30,.18);}
    .vsa-row.danger{color:#C0392B;}
    .vsa-row.selected{background:rgba(255,92,53,.06);border-color:#FF5C35;color:#1C1C1E;}
    .vsa-row .vsa-row-sub{display:block;font-size:11px;color:#8A8580;font-weight:500;margin-top:2px;}
    .vsa-text{width:100%;border:1.5px solid rgba(28,28,30,.08);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:13px;outline:none;resize:vertical;min-height:80px;margin-top:8px;}
    .vsa-text:focus{border-color:rgba(28,28,30,.2);}
    .vsa-foot{padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid rgba(28,28,30,.08);}
    .vsa-btn{padding:8px 18px;border-radius:100px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;border:none;}
    .vsa-btn.ghost{background:none;border:1px solid rgba(28,28,30,.12);color:#1C1C1E;}
    .vsa-btn.ghost:hover{background:#FAF7F2;}
    .vsa-btn.primary{background:#FF5C35;color:white;}
    .vsa-btn.primary:hover{filter:brightness(1.05);}
    .vsa-btn.primary:disabled{opacity:.45;cursor:not-allowed;}
    .vsa-btn.danger{background:#C0392B;color:white;}
    .vsa-btn.danger:hover{filter:brightness(1.05);}
    .vsa-note{font-size:12.5px;color:#8A8580;line-height:1.5;}
  `;
  document.head.appendChild(styleEl);

  const overlay = document.createElement("div");
  overlay.className = "vsa-overlay";
  overlay.id = "vsaOverlay";
  overlay.innerHTML = `<div class="vsa-card" onclick="event.stopPropagation()"></div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSheet();
  });
  function attach() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", attach);
      return;
    }
    if (!document.body.contains(overlay)) document.body.appendChild(overlay);
  }
  attach();

  function paintSheet(html) {
    const card = overlay.querySelector(".vsa-card");
    if (card) card.innerHTML = html;
  }
  function openSheet(html) {
    if (!document.body.contains(overlay)) document.body.appendChild(overlay);
    paintSheet(html);
    overlay.classList.add("show");
  }
  function closeSheet() {
    overlay.classList.remove("show");
  }
  window.__vsaCloseSheet = closeSheet;

  // ── Block ──────────────────────────────────────────────────────────────
  window.vibeBlock = function (targetId, displayName, onAfter) {
    if (!targetId) return;
    const name = displayName || "this person";
    if (!confirm("Block " + name + "?\n\nThey won't be able to message you, see your posts, or find you in search. You also won't see their content.")) return;
    fetch("/api/me/block", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok) {
          // Block tears down any existing follow edges (server side).
          // Surface that in the toast so the user knows they'll need to
          // re-Connect if they unblock later. Also reset the on-page
          // Connect button if there is one (profile viewer mode).
          if (j.removed_connection) {
            showToast("Blocked " + name + " — connection removed");
            if (typeof window.setVibeRelState === "function") {
              window.setVibeRelState("none");
            }
          } else {
            showToast("Blocked " + name);
          }
          if (onAfter) onAfter({ blocking: true, removed_connection: !!j.removed_connection });
        } else {
          showToast("Couldn't block: " + ((j && j.error) || "unknown"));
        }
      })
      .catch((e) => {
        console.error("[vibeBlock]", e);
        showToast("Couldn't block — try again");
      });
  };

  window.vibeUnblock = function (targetId, onAfter) {
    if (!targetId) return;
    fetch("/api/me/block", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok) {
          showToast("Unblocked");
          if (onAfter) onAfter({ blocking: false });
        } else {
          showToast("Couldn't unblock: " + ((j && j.error) || "unknown"));
        }
      })
      .catch((e) => { console.error("[vibeUnblock]", e); });
  };

  // ── Mute ───────────────────────────────────────────────────────────────
  const MUTE_OPTIONS = [
    { hours: 1,   label: "1 hour" },
    { hours: 8,   label: "8 hours" },
    { hours: 24,  label: "24 hours" },
    { hours: 168, label: "7 days" },
    { hours: 0,   label: "Until I unmute" },
  ];

  window.vibeOpenMuteSheet = function (targetId, displayName, currentUntil, onAfter) {
    if (!targetId) return;
    const name = displayName || "this person";
    const isMuted = !!currentUntil || currentUntil === null;
    // currentUntil:
    //   undefined → not currently muted (offer durations)
    //   null      → muted forever (offer Unmute or change duration)
    //   string    → muted until specific time
    const rows = MUTE_OPTIONS.map((o, i) =>
      `<button class="vsa-row" data-hours="${o.hours}">${esc(o.label)}</button>`
    ).join("");
    const unmuteBtn = isMuted
      ? `<button class="vsa-row danger" id="vsaUnmuteBtn">Unmute now</button>`
      : "";
    openSheet(`
      <div class="vsa-hdr">
        <div class="vsa-title">Mute ${esc(name)}</div>
        <button class="vsa-x" type="button" onclick="window.__vsaCloseSheet()">×</button>
      </div>
      <div class="vsa-body">
        <p class="vsa-note" style="margin-bottom:12px">You won't see their posts in your feed or get notifications from them. They won't know.</p>
        ${rows}
        ${unmuteBtn}
      </div>
    `);
    Array.from(overlay.querySelectorAll(".vsa-row[data-hours]")).forEach((row) => {
      row.addEventListener("click", () => {
        const hours = Number(row.dataset.hours) || 0;
        fetch("/api/me/mute", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_id: targetId,
            duration_hours: hours > 0 ? hours : null,
          }),
        })
          .then((r) => r.json())
          .then((j) => {
            if (j && j.ok) {
              showToast(hours > 0 ? "Muted for " + (hours === 168 ? "7 days" : hours + "h") : "Muted");
              closeSheet();
              if (onAfter) onAfter({ muting: true, mute_until: j.until });
            } else {
              showToast("Couldn't mute: " + ((j && j.error) || "unknown"));
            }
          });
      });
    });
    const ub = document.getElementById("vsaUnmuteBtn");
    if (ub) ub.addEventListener("click", () => {
      window.vibeUnmute(targetId, onAfter);
      closeSheet();
    });
  };

  window.vibeUnmute = function (targetId, onAfter) {
    if (!targetId) return;
    fetch("/api/me/mute", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok) {
          showToast("Unmuted");
          if (onAfter) onAfter({ muting: false, mute_until: null });
        } else {
          showToast("Couldn't unmute: " + ((j && j.error) || "unknown"));
        }
      })
      .catch((e) => { console.error("[vibeUnmute]", e); });
  };

  // ── Report ─────────────────────────────────────────────────────────────
  const REPORT_REASONS = [
    { code: "spam",       label: "Spam" },
    { code: "harassment", label: "Harassment or bullying" },
    { code: "sexual",     label: "Sexual content" },
    { code: "hate",       label: "Hate speech" },
    { code: "self_harm",  label: "Self-harm or violence" },
    { code: "other",      label: "Other" },
  ];

  window.vibeOpenReportSheet = function (targetType, targetId, onAfter) {
    if (!targetId) return;
    let selected = "";
    function render() {
      openSheet(`
        <div class="vsa-hdr">
          <div class="vsa-title">Report this ${esc(targetType || "post")}</div>
          <button class="vsa-x" type="button" onclick="window.__vsaCloseSheet()">×</button>
        </div>
        <div class="vsa-body">
          <p class="vsa-note" style="margin-bottom:10px">Reports go to admins only. The person you're reporting won't see this.</p>
          ${REPORT_REASONS.map((r) => `<button class="vsa-row${selected === r.code ? " selected" : ""}" data-code="${r.code}">${esc(r.label)}</button>`).join("")}
          <textarea class="vsa-text" id="vsaReportNote" placeholder="More detail (optional)" maxlength="1000"></textarea>
        </div>
        <div class="vsa-foot">
          <button class="vsa-btn ghost" type="button" onclick="window.__vsaCloseSheet()">Cancel</button>
          <button class="vsa-btn danger" id="vsaReportSubmit" type="button" disabled>Submit report</button>
        </div>
      `);
      Array.from(overlay.querySelectorAll(".vsa-row[data-code]")).forEach((row) => {
        row.addEventListener("click", () => {
          selected = row.dataset.code || "";
          render(); // simple re-render to update .selected
        });
      });
      const submit = document.getElementById("vsaReportSubmit");
      if (submit) {
        submit.disabled = !selected;
        submit.addEventListener("click", () => {
          submit.disabled = true;
          submit.textContent = "Sending…";
          const note = (document.getElementById("vsaReportNote") || {}).value || "";
          fetch("/api/me/reports", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_type: targetType,
              target_id: targetId,
              reason_code: selected,
              reason: note,
            }),
          })
            .then((r) => r.json())
            .then((j) => {
              if (j && j.ok) {
                showToast("Report submitted. Thanks for telling us.");
                closeSheet();
                if (onAfter) onAfter({ reported: true });
              } else {
                showToast("Couldn't submit: " + ((j && j.error) || "unknown"));
                submit.disabled = false;
                submit.textContent = "Submit report";
              }
            });
        });
      }
    }
    render();
  };

  // ── Read viewer's relationship state with another user ────────────────
  window.vibeFetchRelationship = async function (idOrHandle) {
    try {
      const r = await fetch(
        "/api/me/relationships?with=" + encodeURIComponent(idOrHandle),
        { credentials: "include" },
      );
      const j = await r.json();
      if (!j || !j.ok) return null;
      return {
        blocking: !!j.blocking,
        muting: !!j.muting,
        mute_until: j.mute_until || null,
      };
    } catch (e) {
      console.error("[vibeFetchRelationship]", e);
      return null;
    }
  };
})();
