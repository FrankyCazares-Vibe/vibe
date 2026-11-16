"use client";

/**
 * Your own comment, on the React screens (Franky, Nov 16, 2026): Delete any
 * time, Edit for 3 minutes after sending. The computer feed's comment list
 * (campus-home.tsx) and the phone's post viewer (PostViewerMobile.tsx) both
 * use these; the static popup (_postViewer.js) has its own copy.
 * The routes: DELETE / PATCH /api/comments/[id]. The window:
 * src/lib/comments/edit-window.ts.
 */

import { useEffect, useRef, useState } from "react";

import { commentEditMsLeft, COMMENT_MAX_CHARS } from "@/lib/comments/edit-window";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

/** True while the author may still edit; turns false on its own when the window shuts. */
export function useCommentEditable(createdAt: string | null | undefined, enabled: boolean): boolean {
  // Bumped once when the window shuts, so the row re-renders without Edit.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const left = commentEditMsLeft(createdAt);
    if (left <= 0) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [createdAt, enabled]);
  return enabled && commentEditMsLeft(createdAt) > 0;
}

/**
 * Deletes the comment after the browser's own confirm. Resolves to how many
 * comments left with it (the comment and its replies), or null when nothing
 * was deleted (cancelled, or refused: the toast already said why).
 */
export async function deleteOwnComment(id: string, hasReplies: boolean): Promise<number | null> {
  const ask = hasReplies
    ? "Delete this comment and its replies? This can't be undone."
    : "Delete this comment? This can't be undone.";
  if (typeof window === "undefined" || !window.confirm(ask)) return null;
  const r = await vibeRequest<{ removed?: number }>(`/api/comments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    failure: "Couldn't delete your comment.",
  });
  if (!r.ok) return null;
  toast({ message: "Comment deleted", tone: "info" });
  const n = Number(r.data.removed);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** "saved" with the server's text, "closed" when the window shut, or "failed". */
export type CommentEditResult =
  | { kind: "saved"; content: string }
  | { kind: "closed" }
  | { kind: "failed" };

export async function saveOwnCommentEdit(id: string, text: string): Promise<CommentEditResult> {
  const r = await vibeRequest<{ comment?: { content?: unknown } }>(
    `/api/comments/${encodeURIComponent(id)}`,
    { method: "PATCH", json: { content: text }, failure: "Couldn't save your comment." },
  );
  if (!r.ok) return r.status === 409 ? { kind: "closed" } : { kind: "failed" };
  const content = typeof r.data.comment?.content === "string" ? r.data.comment.content : text;
  return { kind: "saved", content };
}

const actionStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  fontWeight: 600,
};

/** The row's Edit (while the window is open) and Delete, as text buttons. */
export function OwnCommentActions({
  createdAt,
  onEdit,
  onDelete,
  busy = false,
}: {
  createdAt: string;
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const editable = useCommentEditable(createdAt, true);
  return (
    <>
      {editable ? (
        <button type="button" onClick={onEdit} disabled={busy} style={actionStyle}>
          Edit
        </button>
      ) : null}
      <button type="button" onClick={onDelete} disabled={busy} style={actionStyle}>
        Delete
      </button>
    </>
  );
}

/** The inline editor. Enter saves, Shift+Enter is a new line, Escape cancels. */
export function CommentEditBox({
  initial,
  onSave,
  onCancel,
  fontSize = 13,
}: {
  initial: string;
  /** Resolves true when the editor can close. */
  onSave: (text: string) => Promise<boolean>;
  onCancel: () => void;
  fontSize?: number;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  const save = async () => {
    const value = text.trim();
    if (!value) {
      toast({ message: "A comment can't be empty. Delete it instead.", tone: "error" });
      return;
    }
    if (value === initial.trim()) {
      onCancel();
      return;
    }
    setSaving(true);
    const done = await onSave(value);
    setSaving(false);
    if (done) onCancel();
  };

  const btn: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 999,
    border: "1px solid rgba(var(--scrim-rgb),0.18)",
    background: "transparent",
    color: "var(--charcoal)",
    cursor: "pointer",
  };

  return (
    <div style={{ margin: "4px 0 6px" }}>
      <textarea
        ref={ref}
        value={text}
        maxLength={COMMENT_MAX_CHARS}
        rows={2}
        aria-label="Edit your comment"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          minHeight: 44,
          fontFamily: "DM Sans, sans-serif",
          // The phone passes 16: iOS zooms the page into a smaller field.
          fontSize,
          lineHeight: 1.45,
          color: "var(--charcoal)",
          background: "var(--paper)",
          border: "1px solid rgba(var(--scrim-rgb),0.18)",
          borderRadius: 10,
          padding: "8px 10px",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
        <button type="button" onClick={onCancel} disabled={saving} style={btn}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{ ...btn, background: "var(--charcoal)", color: "var(--paper)", borderColor: "transparent", opacity: saving ? 0.6 : 1 }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
