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
//     targetType is the wire CODE POST /api/me/reports takes:
//     post | comment | message | user | channel | org | event.
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
    /* A refusal the shared copy table can't speak for (see vibeOpenReportSheet
       below): it belongs beside the button that was just pressed, not in a
       toast that slides away while the sheet is still open. */
    .vsa-error{margin-top:10px;font-size:12.5px;line-height:1.45;color:#C0392B;}
    .vsa-error-act{display:inline-block;margin-left:6px;padding:0;border:none;background:none;
      font-family:inherit;font-size:12.5px;font-weight:700;color:#C0392B;text-decoration:underline;cursor:pointer;}
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

  // Is a sheet on screen right now? The post viewer asks before it acts on
  // Escape or a back gesture, so the sheet closes and the post underneath it
  // stays where it was (_postViewer.js).
  window.__vsaSheetOpen = function () {
    return overlay.classList.contains("show");
  };

  // Escape closes the sheet, and only the sheet. Capture phase on `document`,
  // so it runs before any page-level Escape handler bound on the same node
  // (the post viewer's, profile.html's modals), and stopPropagation keeps the
  // thing underneath open — otherwise Escape shut the post and left the
  // report sheet floating with nothing to say what it referred to.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!overlay.classList.contains("show")) return;
    e.stopPropagation();
    e.preventDefault();
    closeSheet();
  }, true);

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
  // The static twin of reportReasonOptions() in src/lib/moderation/reports.ts
  // — same codes, same ORDER and the same words, because a student who
  // reports a DM here and a post in the app must be picking from one list.
  // Three of these used to read differently ("Hate speech", "Self-harm or
  // violence", "Other"), which made the same queue row mean two things
  // depending on which half of the app filed it. Change both together; only
  // the label is cosmetic — the code is what goes on the wire.
  const REPORT_REASONS = [
    { code: "spam",       label: "Spam" },
    { code: "harassment", label: "Harassment or bullying" },
    { code: "sexual",     label: "Sexual content" },
    { code: "hate",       label: "Hate or a slur" },
    { code: "self_harm",  label: "Self-harm" },
    { code: "other",      label: "Something else" },
  ];

  // What each target type is called in the sheet's heading. The static twin of
  // headingFor() in src/components/safety/ReportSheet.tsx — "Report this post",
  // "Report this club", "Report this chat" — so a student who reports a DM here
  // and a post in the app reads the same sentence. (The app's own sheet names
  // the person on a `user` report; this half is never handed a name, so it says
  // "this person".) A club still stops reading as "Report this org" and a group
  // chat as "Report this channel": only the heading changes, and the raw CODE is
  // what goes on the wire as target_type. Change both together.
  //
  // NOT reportTargetLabel() from src/lib/moderation/reports.ts — that one writes
  // "a post" to drop into a sentence ("Someone reported a post on Vibe"), which
  // is the admin queue's and the alert email's job, not this heading's.
  const REPORT_HEADING_NOUNS = {
    post: "this post",
    comment: "this comment",
    message: "this message",
    user: "this person",
    channel: "this chat",
    org: "this club",
    event: "this event",
  };
  function reportHeadingNoun(t) {
    return Object.prototype.hasOwnProperty.call(REPORT_HEADING_NOUNS, String(t))
      ? REPORT_HEADING_NOUNS[String(t)]
      : "this";
  }

  // Does a server string read like a sentence a student should see? The
  // report route answers 400 with both kinds: sentences that matter ("You
  // can't report something of your own") and developer strings ("Invalid
  // target_id", "Invalid JSON"). This is the SHAPE test the static copy
  // table already applies before it passes any server string through
  // (isSentence in _persistence.js) — no wording is copied, only the guard,
  // because here it is the sheet and not the toast that speaks a 400.
  function studentSentence(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    return t.length > 0 && t.length <= 160
      && /^[A-Z]/.test(t)
      && t.split(/\s+/).length >= 3
      && /^[A-Za-z0-9 ,.'’"“”!?:()/&—–→…·-]+$/.test(t)
      && !/\b(json|uuid|null|undefined|ids?)\b/i.test(t);
  }

  window.vibeOpenReportSheet = function (targetType, targetId, onAfter) {
    if (!targetId) return;
    let selected = "";
    // Kept outside render() because picking a second reason re-renders the
    // sheet: without this, typing a paragraph and then changing your mind
    // about the reason threw the paragraph away.
    let note = "";
    // { line, action } or null. Every refusal is said here rather than in a
    // toast: the sheet is already on screen, and a toast sliding away behind
    // it would say one thing while the sheet said another.
    let inlineError = null;
    function render() {
      openSheet(`
        <div class="vsa-hdr">
          <div class="vsa-title">Report ${esc(reportHeadingNoun(targetType))}</div>
          <button class="vsa-x" type="button" onclick="window.__vsaCloseSheet()">×</button>
        </div>
        <div class="vsa-body">
          <p class="vsa-note" style="margin-bottom:10px">Reports go to Vibe admins only. The person you're reporting won't see this.</p>
          ${REPORT_REASONS.map((r) => `<button class="vsa-row${selected === r.code ? " selected" : ""}" data-code="${r.code}">${esc(r.label)}</button>`).join("")}
          <textarea class="vsa-text" id="vsaReportNote" placeholder="More detail (optional)" maxlength="1000"></textarea>
          <p class="vsa-error" id="vsaReportError" role="alert" style="display:none"></p>
        </div>
        <div class="vsa-foot">
          <button class="vsa-btn ghost" type="button" onclick="window.__vsaCloseSheet()">Cancel</button>
          <button class="vsa-btn danger" id="vsaReportSubmit" type="button" disabled>Submit report</button>
        </div>
      `);
      const noteEl = document.getElementById("vsaReportNote");
      if (noteEl) {
        noteEl.value = note;
        noteEl.addEventListener("input", () => { note = noteEl.value; });
      }
      const errEl = document.getElementById("vsaReportError");
      function showInline(line, action) {
        inlineError = line ? { line: String(line), action: action || null } : null;
        if (!errEl) return;
        errEl.textContent = "";                    // textContent: never HTML
        if (!inlineError) { errEl.style.display = "none"; return; }
        errEl.appendChild(document.createTextNode(inlineError.line));
        const act = inlineError.action;
        if (act && act.href) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "vsa-error-act";
          btn.textContent = act.label || "Open";
          btn.addEventListener("click", () => {
            // Out of the iframe, the way the shared toast's action goes.
            if (typeof window.__vibeTopNav === "function") window.__vibeTopNav(act.href);
            else window.location.href = act.href;
          });
          errEl.appendChild(btn);
        }
        errEl.style.display = "block";
      }
      if (inlineError) showInline(inlineError.line, inlineError.action);
      Array.from(overlay.querySelectorAll(".vsa-row[data-code]")).forEach((row) => {
        row.addEventListener("click", () => {
          selected = row.dataset.code || "";
          // A refusal belongs to the reason that was sent, not to the one
          // being picked now: without this, changing your mind after
          // "You can't report something of your own" repainted the same red
          // line under the new choice, as though it had been refused too.
          inlineError = null;
          render(); // simple re-render to update .selected
        });
      });
      const submit = document.getElementById("vsaReportSubmit");
      if (submit) {
        submit.disabled = !selected;
        submit.addEventListener("click", async () => {
          submit.disabled = true;
          submit.textContent = "Sending…";
          if (noteEl) note = noteEl.value || "";
          showInline("");
          const r = await window.vibeRequest("/api/me/reports", {
            method: "POST",
            json: {
              target_type: targetType,
              target_id: targetId,
              reason_code: selected,
              reason: note,
            },
            failure: "Couldn't send your report.",
            // No toast. The sheet stays open over it, so a toast would slide
            // away behind the thing the student is reading — and on a 400 it
            // would say the caller's fallback ("Couldn't send your report.
            // Try again.") beside the route's "You can't report that yet",
            // which is the opposite advice.
            quiet: true,
          });
          if (!r.ok) {
            // r.message is the shared copy table's own sentence (vibeRequest
            // applies it), so every wave-1 code — terms_required,
            // school_email_required, account_restricted — is said here in
            // exactly the words it is said everywhere else, with its link.
            // The one gap is the 400: the table shows the caller's fallback
            // for anything outside its short whitelist, and the report
            // route's 400s are the sentences that matter ("You can't report
            // something of your own", and until the moderation migration
            // reaches production, "You can't report that yet. Try again after
            // the next update."). Those get said as sent — but only when they
            // read like a sentence, so "Invalid target_id" never lands on a
            // student inside a safety flow.
            const own = r.status === 400 && studentSentence(r.error) ? r.error.trim() : "";
            showInline(own || r.message || "Couldn't send your report. Try again.",
              own ? null : r.action);
            // The sheet stays open with the reason and note kept, so Submit
            // can just be pressed again.
            submit.disabled = false;
            submit.textContent = "Submit report";
            return;
          }
          // The same words the app's own sheet says on a filed report
          // (ReportSheet.tsx) — a student who reports a DM here and a post
          // there is told the same thing, and a second press on the same
          // target answers 200 and writes nothing, so it reads the same then
          // too. The sheet closes, so this is the one line there is room for.
          showToast("Thanks — we're on it.");
          closeSheet();
          if (onAfter) onAfter({ reported: true });
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
