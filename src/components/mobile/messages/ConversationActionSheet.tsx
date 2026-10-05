"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer } from "vaul";

import { ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle, visuallyHiddenStyle } from "./sheet-styles";
import { MuteDurationSheet, SheetRow } from "./sheets";
import { type ThreadEntry } from "./types";

export function ConversationActionSheet({
  threadId,
  thread,
  clubRoom,
  pinned,
  muted,
  feedback,
  onFeedback,
  onPinned,
  onMuted,
  onClose,
  onOpenGroupSettings,
  onOpenPinned,
  onCleared,
  onLeftOrDeleted,
}: {
  threadId: string;
  thread: ThreadEntry | null;
  /** A club's room (club chat v1): it can't be left or deleted from the
   *  inbox, so neither row is drawn. */
  clubRoom: boolean;
  pinned: boolean;
  muted: boolean;
  feedback: string | null;
  onFeedback: (msg: string | null) => void;
  onPinned: (pinnedAt: string | null) => void;
  onMuted: (mutedUntil: string | null) => void;
  onClose: () => void;
  onOpenGroupSettings: () => void;
  /** Adds the row `Pinned messages` under `Pin to top` (wave-3 desktop
   *  contract 4d.6): the messages pinned for everyone in a dm or a group.
   *  Only the flag-on phone conversation passes it. With it, the chat-level
   *  row's other state reads `Unpin from top`, so it can't be taken for
   *  unpinning a message; without it that row stays `Unpin`. */
  onOpenPinned?: () => void;
  onCleared: () => void;
  onLeftOrDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  // Report, stacked on this sheet. On a 1:1 it reports the PERSON, not the
  // channel: a `channel` report has no owner column behind it, so it lands in
  // the queue with nobody attached and no action a moderator can take. Only a
  // GROUP is offered "Report this chat".
  const [reportTarget, setReportTarget] = useState<ReportTargetRef | null>(null);

  const isDm = thread?.type === "dm";
  const isGroup = thread?.type === "group" && !clubRoom;
  const peer = thread?.peer ?? null;

  const togglePin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const wantPin = !pinned;
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/pin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: wantPin }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Pin failed");
      onPinned(wantPin ? new Date().toISOString() : null);
      onFeedback(wantPin ? "Pinned" : "Unpinned");
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Pin failed");
    } finally {
      setBusy(false);
    }
  }, [busy, pinned, threadId, onPinned, onFeedback]);

  const unmute = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/mute`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Unmute failed");
      onMuted(null);
      onFeedback("Unmuted");
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Unmute failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onMuted, onFeedback]);

  const muteFor = useCallback(
    async (hours: number | null) => {
      if (busy) return;
      setBusy(true);
      setMuteSheetOpen(false);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/mute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duration_hours: hours }),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Mute failed");
        onMuted(j.muted_until ?? null);
        onFeedback("Muted");
      } catch (e) {
        onFeedback(e instanceof Error ? e.message : "Mute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId, onMuted, onFeedback],
  );

  const clearHistory = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Clear chat history? This only clears your view; the other side keeps their copy.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/clear`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Clear failed");
      onCleared();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onCleared, onFeedback]);

  const hideConversation = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Delete this conversation? It'll hide from your view, but the other side will still see it.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/hide`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Delete failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onLeftOrDeleted, onFeedback]);

  const leaveGroup = useCallback(async () => {
    if (busy || !thread) return;
    const groupName = thread.name || "this group";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Leave ${groupName}? You won't receive new messages.`)
    )
      return;
    // Fetch viewer id from the messages endpoint (the only one that
    // reliably returns it) — cheaper than a profile bootstrap.
    setBusy(true);
    try {
      const meR = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=1`,
        { cache: "no-store" },
      );
      const meJ = await meR.json();
      const viewerId =
        typeof meJ?.viewer_id === "string" ? (meJ.viewer_id as string) : null;
      if (!viewerId) throw new Error("Could not resolve your id");
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(viewerId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Leave failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setBusy(false);
    }
  }, [busy, thread, threadId, onLeftOrDeleted, onFeedback]);

  const blockPeer = useCallback(async () => {
    if (busy || !peer?.id) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Block @${peer.handle ?? "user"}? They won't be able to message you or find you in search, and while they are signed in they can't see your posts.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch("/api/me/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: peer.id }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Block failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Block failed");
    } finally {
      setBusy(false);
    }
  }, [busy, peer, onLeftOrDeleted, onFeedback]);

  // Auto-clear the feedback toast after a beat so the menu doesn't
  // pile up messages.
  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => onFeedback(null), 1800);
    return () => window.clearTimeout(t);
  }, [feedback, onFeedback]);

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>Conversation actions</Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          {feedback ? (
            <div
              style={{
                margin: "6px 16px 8px",
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(var(--scrim-rgb),0.06)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                color: "var(--charcoal)",
                textAlign: "center",
              }}
            >
              {feedback}
            </div>
          ) : null}

          <div style={{ padding: "4px 0 14px" }}>
            {isDm && peer?.handle ? (
              <SheetRow
                label="View profile"
                href={`/profile/${peer.handle}`}
                onClose={onClose}
              />
            ) : null}
            {isGroup ? (
              <SheetRow label="Group info" onClick={onOpenGroupSettings} />
            ) : null}
            <SheetRow
              label={pinned ? (onOpenPinned ? "Unpin from top" : "Unpin") : "Pin to top"}
              onClick={() => void togglePin()}
              disabled={busy}
            />
            {onOpenPinned ? (
              <SheetRow label="Pinned messages" onClick={onOpenPinned} />
            ) : null}
            {muted ? (
              <SheetRow
                label="Unmute"
                onClick={() => void unmute()}
                disabled={busy}
              />
            ) : (
              <SheetRow
                label="Mute…"
                onClick={() => setMuteSheetOpen(true)}
                disabled={busy}
              />
            )}
            <SheetRow
              label="Clear chat history"
              onClick={() => void clearHistory()}
              disabled={busy}
            />
            {isGroup ? (
              <SheetRow
                label="Leave group"
                danger
                onClick={() => void leaveGroup()}
                disabled={busy}
              />
            ) : null}
            {isDm && peer ? (
              <SheetRow
                label={`Report @${peer.handle ?? "user"}`}
                danger
                onClick={() =>
                  setReportTarget({
                    type: "user",
                    id: peer.id,
                    authorId: peer.id,
                    authorName: peer.name || (peer.handle ? `@${peer.handle}` : null),
                  })
                }
                disabled={busy}
              />
            ) : null}
            {isGroup ? (
              <SheetRow
                label="Report this chat"
                danger
                onClick={() =>
                  setReportTarget({
                    type: "channel",
                    id: threadId,
                    noun: "chat",
                  })
                }
                disabled={busy}
              />
            ) : null}
            {isDm && peer ? (
              <SheetRow
                label={`Block @${peer.handle ?? "user"}`}
                danger
                onClick={() => void blockPeer()}
                disabled={busy}
              />
            ) : null}
            {clubRoom ? null : (
              <SheetRow
                label="Delete conversation"
                danger
                onClick={() => void hideConversation()}
                disabled={busy}
              />
            )}
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>

          {muteSheetOpen ? (
            <MuteDurationSheet
              onClose={() => setMuteSheetOpen(false)}
              onPick={(h) => void muteFor(h)}
            />
          ) : null}

          {reportTarget ? (
            <ReportSheet
              variant="sheet"
              nested
              target={reportTarget}
              onClose={() => setReportTarget(null)}
              // Once the report is in, this menu has done its job: Done takes
              // both sheets down and leaves the student back in the
              // conversation. Cancel still lands back here.
              onCompleted={() => {
                setReportTarget(null);
                onClose();
              }}
              // Blocking from inside the sheet leaves this conversation
              // pointless, so it closes with the same handler Block uses.
              onBlocked={onLeftOrDeleted}
            />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
