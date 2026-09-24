"use client";

/**
 * ONE report sheet for the whole React app (moderation wave 2, batch G).
 *
 * WHY IT IS SHARED. Before this, four surfaces filed a report and three of
 * them sent `reason_code: "other"` with no picker, so the queue got a pile of
 * "Something else" with nothing to triage on. The fifth — ProfileMobile's own
 * sheet — had the picker but its own private copy of the codes. One drift
 * ("sexual_content" against a CHECK that says "sexual") files a report the
 * student thinks went through and nobody can see, so the reason list here
 * comes from `reportReasonOptions()` and is never re-typed.
 *
 * WHAT IT TALKS TO. `POST /api/me/reports` and nothing else — the only way a
 * report is filed (`authenticated` has no grant on the table). The route
 * answers 200 for a repeat report on the same thing and writes nothing, so a
 * second press reads as "Thanks — we're on it." and never as an error.
 *
 * WHO CAN REACH IT. An unverified student can report — the route refuses only
 * a restricted one. No caller may hide a report entry point behind the
 * school-email gate.
 *
 * WHY THE REFUSALS SHOW INLINE. `describeFailure` passes a 400 through as the
 * caller's own fallback line, and this route's 400s are sentences that matter
 * ("You can't report something of your own", and, until the migration reaches
 * production, "You can't report that yet. Try again after the next update.").
 * Every refusal is shown in the sheet itself and stays there: an error toast
 * auto-dismisses after 5–8 s, and saying the same sentence in the panel and in
 * a toast reads as two separate failures. Where the mapped copy carries an
 * action (Sign in, Review Terms, See details) that link is rendered in the
 * panel, so the button the toast existed for is still one tap away.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import type { ToastAction } from "@/lib/feedback/failure-copy";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  reportReasonOptions,
  type ReportReasonCode,
  type ReportTargetType,
} from "@/lib/moderation/reports";

/** What is being reported. `type` is the route's own vocabulary — never a
 *  label, never a prettified string. A whole chat is `channel`, one message is
 *  `message`, a club is `org`. */
export type ReportTargetRef = {
  type: ReportTargetType;
  id: string;
  /** The person behind it, for "Block this person". Leave it out and no block
   *  is offered — which is right for a club, a chat and an event. */
  authorId?: string | null;
  /** Their first name or handle, for the block copy. */
  authorName?: string | null;
  /** What the sheet calls the thing: "post", "comment", "message", "chat". */
  noun?: string;
};

const FONT = "DM Sans, sans-serif";
const SERIF = "Fraunces, serif";
const REASONS = reportReasonOptions();

/** Blocking a club, a chat or an event means nothing — there is no person. */
const NO_BLOCK: ReadonlySet<ReportTargetType> = new Set(["org", "channel", "event"]);

/**
 * A 400 whose body is a sentence a student can read, rather than a shape
 * complaint meant for a developer ("Invalid target_type"). Only those are
 * shown; everything else falls back to the mapped copy.
 */
function sentenceFor(status: number, error: string | null): string | null {
  if (status !== 400 || !error) return null;
  const text = error.trim();
  if (text.length < 12 || !text.includes(" ")) return null;
  if (/^invalid\b/i.test(text)) return null;
  return text;
}

/** A refusal as the sheet shows it: the sentence, and the link the toast
 *  would otherwise have carried. */
type ReportProblem = { text: string; action?: ToastAction };

/** Every bit of state and every request the two shells share. */
function useReportForm(target: ReportTargetRef, onBlocked?: (userId: string) => void) {
  const [reason, setReason] = useState<ReportReasonCode | "">("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ReportProblem | null>(null);
  const [sent, setSent] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const submit = useCallback(async () => {
    if (!reason || sending) return;
    setSending(true);
    setProblem(null);
    const r = await vibeRequest("/api/me/reports", {
      json: {
        target_type: target.type,
        target_id: target.id,
        reason_code: reason,
        reason: note.trim(),
      },
      failure: "Couldn't send your report.",
      // The sheet is the one place the refusal is said. No toast is raised on
      // top of it — the panel below carries the action link instead.
      quiet: true,
    });
    setSending(false);
    if (r.ok) {
      setSent(true);
      return;
    }
    // The reason and the note stay exactly as they are, so Submit can simply
    // be pressed again — the static twin behaves this way too.
    const inline = sentenceFor(r.status, r.error);
    setProblem(inline ? { text: inline } : { text: r.message, action: r.action });
  }, [reason, note, sending, target.id, target.type]);

  const block = useCallback(async () => {
    const id = target.authorId;
    if (!id || blocking) return;
    const who = target.authorName || "them";
    setBlocking(true);
    const r = await vibeRequest("/api/me/block", {
      json: { target_id: id },
      failure: `Couldn't block ${who}.`,
    });
    setBlocking(false);
    // A refusal already said why in a toast; the offer stays up for a retry.
    if (!r.ok) return;
    setBlocked(true);
    toast(`Blocked ${who}`);
    onBlocked?.(id);
  }, [target.authorId, target.authorName, blocking, onBlocked]);

  return {
    reason,
    setReason,
    note,
    setNote,
    sending,
    problem,
    sent,
    submit,
    block,
    blocking,
    blocked,
    canBlock: !!target.authorId && !NO_BLOCK.has(target.type) && !blocked,
  };
}

type ReportForm = ReturnType<typeof useReportForm>;

/**
 * The picker, the note and the buttons. Shared by both shells so the wording
 * can only be changed in one place, and sized for a 375px phone first.
 */
function ReportBody({
  form,
  target,
  onClose,
}: {
  form: ReportForm;
  target: ReportTargetRef;
  onClose: () => void;
}) {
  if (form.sent) {
    const who = target.authorName || "this person";
    return (
      <div style={{ padding: "4px 18px 18px" }}>
        <p style={{ margin: "0 0 6px", fontFamily: FONT, fontSize: 14, color: "#1C1C1E" }}>
          {"Thanks — we're on it."}
        </p>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, color: "#8A8580" }}>
          {/* Admins DO see the reporter's handle in the queue, so this cannot
              promise anonymity from them — only from the person reported. */}
          {"An admin reads every report. The person you reported won't be told who sent it."}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {form.canBlock ? (
            <button
              type="button"
              onClick={() => void form.block()}
              disabled={form.blocking}
              style={{ ...dangerButtonStyle, opacity: form.blocking ? 0.6 : 1 }}
            >
              {form.blocking ? "Blocking…" : `Block ${who}`}
            </button>
          ) : null}
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            {form.blocked ? "Close" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 4px" }}>
      <p style={{ margin: 0, padding: "0 18px 12px", fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, color: "#8A8580" }}>
        {"Reports go to Vibe admins only. The person you're reporting won't see this."}
      </p>
      <div
        role="radiogroup"
        aria-label="Reason"
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 18px" }}
      >
        {REASONS.map((option) => {
          const on = form.reason === option.code;
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => form.setReason(option.code)}
              disabled={form.sending}
              style={{
                display: "block",
                width: "100%",
                padding: "11px 14px",
                borderRadius: 10,
                border: on ? "1px solid #FF5C35" : "1px solid rgba(28,28,30,0.08)",
                background: on ? "rgba(255,92,53,0.06)" : "#fff",
                fontFamily: FONT,
                fontSize: 14,
                fontWeight: 600,
                color: "#1C1C1E",
                textAlign: "left",
                cursor: form.sending ? "default" : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div style={{ padding: "10px 18px 0" }}>
        <textarea
          value={form.note}
          onChange={(e) => form.setNote(e.target.value.slice(0, 1000))}
          placeholder="More detail (optional)"
          aria-label="More detail (optional)"
          maxLength={1000}
          rows={3}
          disabled={form.sending}
          // Scrolling the note must not drag the bottom sheet shut.
          data-vaul-no-drag
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1.5px solid rgba(28,28,30,0.08)",
            background: "#fff",
            fontFamily: FONT,
            // 16px keeps iOS Safari from zooming in on focus.
            fontSize: 16,
            lineHeight: 1.45,
            color: "#1C1C1E",
            outline: "none",
            resize: "none",
          }}
        />
      </div>
      {form.problem ? (
        <div
          role="alert"
          style={{
            margin: "10px 18px 0",
            padding: "8px 12px",
            borderRadius: 10,
            background: "rgba(196,43,28,0.07)",
            border: "1px solid rgba(196,43,28,0.18)",
            fontFamily: FONT,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "#8E2317",
          }}
        >
          {form.problem.text}
          {form.problem.action ? (
            <>
              {" "}
              <a
                href={form.problem.action.href}
                style={{ color: "#8E2317", fontWeight: 700, textDecoration: "underline" }}
              >
                {form.problem.action.label}
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 18px 14px" }}>
        <button type="button" onClick={onClose} style={ghostButtonStyle}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void form.submit()}
          disabled={!form.reason || form.sending}
          style={{
            ...dangerButtonStyle,
            opacity: form.reason && !form.sending ? 1 : 0.45,
            cursor: form.reason && !form.sending ? "pointer" : "default",
          }}
        >
          {form.sending ? "Sending…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}

/** "Report this comment", "Report Jordan" — the thing, in the student's words. */
function headingFor(target: ReportTargetRef): string {
  if (target.type === "user") return `Report ${target.authorName || "this person"}`;
  const noun =
    target.noun ??
    (target.type === "channel"
      ? "chat"
      : target.type === "org"
        ? "club"
        : target.type);
  return `Report this ${noun}`;
}

/**
 * The report sheet. `variant: "modal"` is the desktop dialog, `"sheet"` the
 * phone's bottom sheet; pass `nested` when it opens from inside another vaul
 * drawer, or closing it tears down the scroll lock the parent still needs.
 */
export function ReportSheet({
  target,
  variant = "modal",
  nested = false,
  onClose,
  onBlocked,
}: {
  target: ReportTargetRef;
  variant?: "modal" | "sheet";
  nested?: boolean;
  onClose: () => void;
  /** The block landed, with the blocked person's id: drop their content. */
  onBlocked?: (userId: string) => void;
}) {
  const form = useReportForm(target, onBlocked);
  const heading = headingFor(target);

  if (variant === "sheet") {
    const Root = nested ? Drawer.NestedRoot : Drawer.Root;
    return (
      <Root
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Drawer.Portal>
          <Drawer.Overlay style={overlayStyle} />
          <Drawer.Content style={sheetStyle} aria-describedby={undefined}>
            <Drawer.Handle style={handleStyle} />
            <div
              style={{
                maxHeight: "calc(88dvh - 18px)",
                overflowY: "auto",
                overscrollBehavior: "contain",
              }}
            >
              <Drawer.Title style={headingStyle}>{heading}</Drawer.Title>
              <ReportBody form={form} target={target} onClose={onClose} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Root>
    );
  }

  return <ReportModal heading={heading} form={form} target={target} onClose={onClose} />;
}

/** Desktop: a centered dialog over a scrim, portaled to <body> so no feed
 *  card's stacking context can clip it. Escape and the scrim both close it. */
function ReportModal({
  heading,
  form,
  target,
  onClose,
}: {
  heading: string;
  form: ReportForm;
  target: ReportTargetRef;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape closes it, Tab stays inside it, and the dialog takes focus on
  // mount: the menu item that opened it has just unmounted, so without this
  // focus falls to <body> and the next Tab walks the feed behind the scrim
  // while `aria-modal` tells a screen reader that content is not there.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const stops = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = stops[0] ?? dialog;
      const last = stops[stops.length - 1] ?? dialog;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll under the scrim — on a long thread the
    // student can otherwise wheel the feed away from where they opened this.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);
  // The portal target only exists in a browser; this whole shell is opened
  // from a click, so it never renders on the server anyway.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 11000 }}>
      {/* A plain div, not a button: a focusable scrim before the dialog in the
          DOM is the first thing Tab lands on. Cancel inside the dialog is the
          real close control, and Escape works from anywhere. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.38)",
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(420px, calc(100vw - 32px))",
          maxHeight: "min(86vh, 720px)",
          overflowY: "auto",
          background: "#FAF7F2",
          border: "1px solid rgba(28,28,30,0.08)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        }}
      >
        <h2 style={headingStyle}>{heading}</h2>
        <ReportBody form={form} target={target} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

// Bottom-sheet chrome, matching the phone's other sheets (cream surface,
// rounded top, safe-area-aware bottom, drag handle).
//
// LAYERS. This sheet always opens on top of a surface that is itself high in
// the stack — CampusMobile's PostActionsSheet (10000/10001),
// PostViewerMobile's full-screen drawer (10000), MessagesMobile's
// ConversationActionSheet — and every one of them portals to <body>, so they
// are siblings in the root stacking context and z-index alone decides. At
// 10000/10001 this sheet tied with its own parent: the scrim painted *under*
// the parent's content, so the parent was never dimmed and stayed
// hit-testable, and which content won came down to portal insertion order.
// 10400/10401 is the tier the siblings that stack on those sheets already use
// (SharePostSheet, EditPostSheet, PostAudienceSheet), for exactly this reason.
// Above the mobile tab bar (globals.css .vibe-mobile-tabbar, z 9988), below
// ToastHost (12000) so a refusal still shows over an open sheet.
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 10400,
};

const sheetStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "#FAF7F2",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10401,
  outline: "none",
};

const handleStyle: React.CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(28,28,30,0.18)",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px 18px 6px",
  fontFamily: SERIF,
  fontSize: 16,
  fontWeight: 800,
  color: "#1C1C1E",
};

const ghostButtonStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "1px solid rgba(28,28,30,0.12)",
  background: "transparent",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  color: "#1C1C1E",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 999,
  border: "none",
  background: "#C0392B",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  color: "#fff",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/**
 * The author's view of their own removed post or comment.
 *
 * NOT WIRED TO ANY DATA YET, ON PURPOSE. Wave 1 added `removed_at`,
 * `removed_by` and `removed_reason` to `posts`, `post_comments` and
 * `messages`, but every read route selects an explicit column list that omits
 * them, and none of those routes belongs to a wave-2 batch. So this renders
 * nothing today: `removedAt` is always undefined on the wire. The moment a
 * route adds the two columns to its select, the card appears for its author
 * and nobody else — the SELECT policies are `(removed_at is null AND …) OR
 * user_id = auth.uid()`, so a removed row reaches its author and no one else.
 *
 * Until then a student's own removed post still comes back in their feed and
 * renders as an ordinary post, with counts that exclude it and an audience of
 * one. That gap is wave 2's, and it is written down rather than papered over.
 */
export function RemovedContentCard({
  kind,
  removedAt,
  removedReason,
  compact = false,
}: {
  /** What was removed, for the sentence. */
  kind: "post" | "comment" | "message";
  /** ISO timestamp, or null/undefined when it is not removed — then the card
   *  renders nothing at all. */
  removedAt?: string | null;
  /** The moderator's reason, shown as written. Never the matched word from
   *  the text filter — the API never sends one. */
  removedReason?: string | null;
  compact?: boolean;
}): React.ReactElement | null {
  if (!removedAt) return null;
  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "14px 16px",
        borderRadius: 12,
        background: "rgba(28,28,30,0.04)",
        border: "1px solid rgba(28,28,30,0.08)",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 700, color: "#1C1C1E" }}>
        Removed by Vibe moderators
      </div>
      {removedReason ? (
        <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: "#5C5853" }}>
          {removedReason}
        </div>
      ) : null}
      {/* The Terms say nothing about a takedown — /legal/community is the page
          that does ("What happens after a report", and the appeal address),
          and the proxy lets a restricted student read it. The email is the
          same one the three static twins carry, so all four surfaces offer the
          author the same way to ask. */}
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: "#8A8580" }}>
        {`Only you can see this ${kind}. Questions: help@connectvibe.app. `}
        <a href="/legal/community" style={{ color: "#5C5853", textDecoration: "underline" }}>
          Community Guidelines
        </a>
      </div>
    </div>
  );
}
