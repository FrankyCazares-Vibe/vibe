"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { roomDisplayName } from "@/lib/chat/room-names";
import type { ChatMessage, RoomKind, ViewerInRoom } from "@/lib/chat/types";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { fillCopy, joinOutcome, joinPressFailure, ORG_COPY, orgErrorCopy, orgHeaderView, type OrgAction, type OrgRelation } from "@/lib/orgs/join-copy";

import { CardTray, type CardTrayKind } from "../compose/CardTray";
import { ComposeSheets } from "../compose/ComposeSheets";
import { quotedBody } from "../format";
import { toastSendFailure } from "../send-failure";
import { useChatSurface } from "../surface";
import { FONT, palette } from "../v2-tokens";
import { composerPlaceholder, FOLLOWER_POST_LINE, followerRelation, isFollower, refusedSend, sendLabel } from "./helpers";

/**
 * The composer of a club room (handoffs/chat-redesign/wave-2-contracts.md
 * 11.3, 11.4, 11.5, 1.2; mockups `W0_Club:153-159`, `W0_Board:136-150`,
 * `W0_Room:155-170`, MK:0.2): 64px — the "+" 44px circle, the 44px pill
 * input (16px, the iOS zoom guard of 11.0), the 44px gradient send.
 *
 * - While `viewer` is null NOTHING is drawn in the composer's place (no
 *   composer flashes in a Board; SCREENS-L9).
 * - `viewer.can_post === false` → the quiet tile: the Board's member sentence
 *   `Only officers post on the Board. You can reply to any post.` (14.16);
 *   else the server's own line when it sent one (`viewer.post_line`: an extra
 *   room whose who-can-post rule leaves this viewer reading only; wave-3
 *   desktop contract 4c.4); else `This chat is closed.`
 *   (= `REFUSAL_SENTENCES.room_closed`).
 * - The "+" only when `can_post`: it opens W2-S3's `CardTray` in flow above
 *   the row, and a pick mounts `ComposeSheets` (`onPosted` → `append`,
 *   `onReload` → `reload`, the "+" as `returnFocusTo`).
 * - Sending (11.5): `POST …/messages { content, parent_message_id? }` with an
 *   optimistic `temp_` row appended to the hook's oldest-first state
 *   (`append`), replaced by the answer (`replace`), removed on failure with
 *   the toast (`remove`); `board_officers_only` / `room_closed` /
 *   `room_posters_only` → the quiet tile until the next full read hands a new
 *   `viewer` (the refusal is remembered against the `viewer` object's
 *   identity, so no effect resets it). After `room_posters_only` that read is
 *   asked for at once (`refusedSend`, helpers.ts): only it brings the
 *   `post_line` the tile should say.
 * - The officer's `Everyone in <club> sees this` line above the row on the
 *   Board (`officerLine`); the reply pill (a quote) above the row when the
 *   thread picked a message to reply to.
 *
 * - History (S71 amendment 3, A): the tray has its own entry while it is open
 *   (`useLayerHistory`; on the desktop surface the popover's own, not a
 *   second one from here), and each sheet takes its own inside `CardSheet`, so
 *   Back closes the tray or the sheet and nothing under it. A pick closes the
 *   tray and opens the sheet in one commit; the stack orders the two.
 *
 * The tray's scrim is absolute over the room column: the room mounts this
 * inside a `position: relative` box; the footer sits at z-index 2 over it.
 *
 * - The room's name as words (wave-3 desktop contract 4c.3, C14): an extra
 *   room's and the Officers room's stored name is a slug (`exec-only`); the
 *   ONE line `shownName` turns it into `Exec only` for the placeholder, the
 *   tray's caption and the three sheets' room line, on both surfaces. An
 *   event chat's name is the event's title and is never rewritten.
 * - The "+" is handed to the tray as `anchorRef` (6.3): on the desktop
 *   surface the tray is a popover that opens from it; the phone ignores it.
 *
 * - A FOLLOWER (club model, Franky's calls of Oct 16; `viewer.standing`):
 *   only members type, react or vote, so a follower reading the Board gets
 *   no composer, no "+" and no tray: `FollowerTile`, the quiet line `Only
 *   members post here.` and the one membership control the club offers them
 *   (Join, Request to join, Accept invite; or the state as a quiet word).
 */

export type ReplyTarget = {
  parent: NonNullable<ChatMessage["parent_preview"]>;
  authorName: string;
};

export type RoomComposerProps = {
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgHandle: string;
  /** The club's id: the 14px club dot beside `<club> · <room>` on every sheet (the mockups draw it; INT-ADJUDICATE-4). */
  orgId?: string | null;
  viewer: ViewerInRoom | null;
  viewerId: string | null;
  night: boolean;
  poll: Pick<RoomPoll, "append" | "replace" | "remove" | "reload">;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /** After a send or a posted card: the thread scrolls the new row into view. */
  onSent?: () => void;
  /** The Board, for an officer: the line above the row. */
  officerLine?: boolean;
  /** Bumped by the room to focus the input (ClubEmpty's `Post a welcome on the Board`). */
  focusToken?: number;
  /** A follower joined from the tile under the Board: the space and the room read again as a member's. */
  onJoined?: () => void;
};

const SEND_FAILURE = "Couldn't send your message.";

function Megaphone({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function Lock({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * The quiet tile in the composer's place (11.3, 11.6): the Board's member
 * tile grows with its two sentences (`W0_Board:148-149`, footer `10px 12px
 * 14px`); the closed chat's is a fixed 44px in an `8px 12px 12px` footer
 * (`W0_Room:168`, MK:6).
 */
export function ClosedTile({ text, night, board = false }: { text: string; night: boolean; board?: boolean }) {
  const t = palette(night);
  return (
    <footer style={{ flexShrink: 0, boxSizing: "border-box", padding: board ? "10px 12px calc(env(safe-area-inset-bottom, 0px) + 14px)" : "8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", background: t.page, borderTop: `1px solid ${t.hairline}`, fontFamily: FONT }}>
      <div
        role="note"
        style={{
          ...(board ? { minHeight: 44, padding: "10px 14px" } : { height: 44, padding: "0 14px" }),
          boxSizing: "border-box",
          borderRadius: 16,
          border: `1px solid ${t.hairline}`,
          background: t.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: board ? "flex-start" : "center",
          gap: board ? 10 : 8,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          color: t.secondary,
        }}
      >
        {board ? <Megaphone color={t.muted} size={15} /> : <Lock color={t.muted} />}
        <span>{text}</span>
      </div>
    </footer>
  );
}

export function RoomComposer({
  roomId,
  roomKind,
  roomName,
  clubName,
  orgHandle,
  orgId = null,
  viewer,
  viewerId,
  night,
  poll,
  replyTo,
  onCancelReply,
  onSent,
  officerLine = false,
  focusToken = 0,
  onJoined,
}: RoomComposerProps) {
  const t = palette(night);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sheet, setSheet] = useState<CardTrayKind | null>(null);
  // The `viewer` object a refused send was answered against: `can_post` reads
  // false until the next full read hands a new one (11.4, 11.5).
  const [refusedViewer, setRefusedViewer] = useState<ViewerInRoom | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);

  // The input exists only once `viewer` answered with `can_post`: the focus
  // waits for that, and a plain chip tap resets the token to 0 (ClubSpace).
  const ready = viewer !== null && viewer.can_post;
  useEffect(() => {
    if (focusToken > 0 && ready) inputRef.current?.focus();
  }, [focusToken, ready]);

  const canPost = viewer !== null && viewer.can_post && refusedViewer !== viewer;
  // The tray's own history entry, only while it is drawn (it is not once the
  // composer turns into the closed tile). On the desktop surface the tray is
  // a `DesktopPopover`, which holds its own entry: a second one here would
  // make one layer two entries (wave-3 desktop contract 6.1).
  const desktop = useChatSurface() === "desktop";
  useLayerHistory(trayOpen && canPost && !desktop, () => setTrayOpen(false));

  if (viewer === null) return null;
  if (isFollower(viewer)) return <FollowerTile orgHandle={orgHandle} clubName={clubName} night={night} onJoined={onJoined} />;
  if (!canPost) {
    if (roomKind === "board") return <ClosedTile night={night} board text="Only officers post on the Board. You can reply to any post." />;
    // The server's sentence for a room this viewer may read but not post in (4c.4); the lock is the tile's default mark.
    if (viewer.post_line) return <ClosedTile night={night} text={viewer.post_line} />;
    return <ClosedTile night={night} text="This chat is closed." />;
  }

  const shownName = roomKind === "room" || roomKind === "officers" ? roomDisplayName(roomName) : roomName;
  const placeholder = composerPlaceholder(roomKind, shownName);
  const text = draft.trim();
  const canSend = text.length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    const reply = replyTo;
    const tempId = `temp_${Date.now()}`;
    const temp: ChatMessage = {
      id: tempId,
      content: text,
      created_at: new Date().toISOString(),
      user_id: viewerId ?? "me",
      attachment_id: null,
      attachment_kind: null,
      media_url: null,
      media_kind: null,
      parent_message_id: reply?.parent.id ?? null,
      users: null,
      attachment: null,
      parent_preview: reply?.parent ?? null,
      reactions: [],
      kind: "text",
      thread_root_id: null,
      card: null,
      reply_count: roomKind === "board" ? 0 : null,
      author_role: viewer.role,
      hidden: false,
      removed: null,
    };
    poll.append(temp);
    setDraft("");
    setSending(true);
    onSent?.();
    const r = await vibeRequest<{ message?: ChatMessage | null }>(`/api/me/threads/${encodeURIComponent(roomId)}/messages`, {
      json: { content: text, ...(reply ? { parent_message_id: reply.parent.id } : {}) },
      failure: SEND_FAILURE,
      quiet: true,
    });
    setSending(false);
    if (!r.ok) {
      toastSendFailure(r);
      poll.remove(tempId);
      setDraft(text);
      const refused = refusedSend(r.code);
      if (refused.tile) setRefusedViewer(viewer);
      // `room_posters_only`: the remembered `viewer` has no `post_line`, so
      // the true line (`Only officers post here.`) is read now, not in 20 s.
      if (refused.reread) void poll.reload();
      return;
    }
    const sent = r.data.message;
    if (sent) poll.replace(tempId, sent);
    else {
      poll.remove(tempId);
      void poll.reload();
    }
    if (reply) onCancelReply();
  };

  const circle: React.CSSProperties = {
    width: 44,
    height: 44,
    flexShrink: 0,
    boxSizing: "border-box",
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <>
      <CardTray
        roomKind={roomKind}
        roomName={shownName}
        clubName={clubName}
        anchorRef={plusRef}
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        onPick={(kind) => {
          setTrayOpen(false);
          setSheet(kind);
        }}
      />
      <footer
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
          boxSizing: "border-box",
          padding: "8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)",
          background: t.page,
          borderTop: `1px solid ${t.hairline}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: FONT,
        }}
      >
        {officerLine ? (
          <div style={{ boxSizing: "border-box", padding: "0 4px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, lineHeight: "16px", color: t.muted }}>
            <Megaphone color={t.muted} />
            Everyone in {clubName} sees this
          </div>
        ) : null}
        {replyTo ? (
          <div style={{ boxSizing: "border-box", padding: "2px 6px 2px 12px", borderRadius: 14, border: `1px solid ${t.hairline}`, background: t.surface, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: t.secondary }}>Replying to {replyTo.authorName}</span>
              <span style={{ fontSize: 12.5, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{quotedBody(replyTo.parent)}</span>
            </span>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} style={{ ...circle, border: "none", background: "transparent", color: t.muted }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          <button
            ref={plusRef}
            type="button"
            aria-label={trayOpen ? "Close the tray" : "Add a poll, sign-up or event"}
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen((o) => !o)}
            // Open: the disc inverts (the active chip's pair, `W0_Tray:93`) and the plus turns into the X (VIS-S3-3; INT-ADJUDICATE-6).
            style={{
              ...circle,
              border: `1px solid ${trayOpen ? t.activeChip.bg : t.fieldBorder}`,
              background: trayOpen ? t.activeChip.bg : t.surface,
              color: trayOpen ? t.activeChip.ink : t.ink,
              transition: "transform 160ms ease, background 160ms ease, color 160ms ease",
              // Desktop: the turn is the icon's, not the button's. The popover is placed by the "+"'s measured box, and a turned 44px box measures about 62px: the popover would move on its next placement.
              transform: trayOpen && !desktop ? "rotate(45deg)" : "none",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={desktop ? { transition: "transform 160ms ease", transform: trayOpen ? "rotate(45deg)" : "none" } : undefined}><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <label style={{ flexGrow: 1, minWidth: 0, height: 44, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", borderRadius: 999, border: `1px solid ${t.fieldBorder}`, background: t.surface }}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={placeholder}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="send"
              style={{ flexGrow: 1, minWidth: 0, height: 40, padding: 0, border: "none", outline: "none", background: "transparent", color: t.ink, fontFamily: "inherit", fontSize: 16 }}
            />
          </label>
          <button
            type="submit"
            aria-label={sendLabel(roomKind)}
            aria-disabled={!canSend}
            style={{ ...circle, border: "none", background: canSend ? t.coralButton.bg : "rgba(var(--scrim-rgb),0.07)", color: canSend ? t.coralButton.ink : t.muted, cursor: canSend ? "pointer" : "default" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </button>
        </form>
      </footer>
      <ComposeSheets
        kind={sheet}
        roomId={roomId}
        roomKind={roomKind}
        roomName={shownName}
        clubName={clubName}
        orgHandle={orgHandle}
        orgId={orgId}
        onClose={() => setSheet(null)}
        onPosted={(message) => {
          setSheet(null);
          poll.append(message);
          onSent?.();
        }}
        onReload={() => {
          setSheet(null);
          void poll.reload();
        }}
        returnFocusTo={plusRef}
      />
    </>
  );
}

/** The membership control the tile offers: the club page's own (`orgHeaderView`), never Decline (it would need the invite's id). */
function membershipAction(rel: OrgRelation): OrgAction | null {
  return orgHeaderView(rel).membership.find((a) => a.kind !== "decline") ?? null;
}

/**
 * The footer under a FOLLOWER's Board (club model): `Only members post
 * here.` and the club's membership control, read from `GET
 * /api/orgs/<handle>` once (the space read does not carry the join state).
 * The words are `ORG_COPY`'s through `orgHeaderView`, so the tile says what
 * the club page says. The tap goes through the one door, `POST
 * /api/orgs/<handle>/join` (asking to join also follows, which a follower
 * already does), read by `joinOutcome`, the function `OrgJoinControl` uses:
 * joined → `onJoined` (the screens read again as a member's; the welcome
 * toast only for an accepted invite); a request filed → `Requested`;
 * `invite_only` / `audience_mismatch` / `school_unverified` → that state
 * (the refusal's school when it names one); anything else toasts its line.
 * Not `OrgJoinControl` itself:
 * its pills there are the org page's white glass (unreadable in Light) and
 * its row form puts the Following toggle beside Join. Until the club read
 * answers, or if it fails, the line stands alone (the header links to the
 * club page).
 */
function FollowerTile({ orgHandle, clubName, night, onJoined }: { orgHandle: string; clubName: string; night: boolean; onJoined?: () => void }) {
  const t = palette(night);
  const [rel, setRel] = useState<OrgRelation | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await vibeRequest<{ org?: unknown }>(`/api/orgs/${encodeURIComponent(orgHandle)}`, { quiet: true, failure: "Couldn't load this club.", cache: "no-store" });
      if (live && r.ok) setRel(followerRelation(r.data.org));
    })();
    return () => {
      live = false;
    };
  }, [orgHandle]);

  const action = rel ? membershipAction(rel) : null;
  const press = async (a: OrgAction) => {
    if (!rel || busy || a.disabled || (a.kind !== "join" && a.kind !== "request" && a.kind !== "accept")) return;
    const failure = joinPressFailure(a.kind);
    setBusy(true);
    const r = await vibeRequest<{ joined?: unknown; pending?: unknown; role?: unknown; org_follow_state?: unknown }>(`/api/orgs/${encodeURIComponent(rel.handle)}/join`, { method: "POST", json: {}, quiet: true, failure });
    setBusy(false);
    // What the answer means is OrgJoinControl's own (`joinOutcome`).
    const out = joinOutcome(rel, a.kind, r);
    if (out.kind === "change") {
      setRel({ ...rel, ...out.next, audience: out.audience });
      if (out.welcome) toast({ message: fillCopy(ORG_COPY.control.welcome, { org: rel.orgName.trim() || clubName || "the club" }), tone: "info" });
      // A 409 `recently_declined` (Oct 22, 2026): Request just turned into
      // "Not this time", so say the day, as the club page does.
      if (out.notice) toast({ message: out.notice, tone: "info" });
      if (out.next.state === "member") onJoined?.();
      return;
    }
    if (out.kind === "unclear") toast({ message: out.message, tone: "error" });
    else if (r.ok) return;
    else if (r.status === 429) toast({ message: r.message, tone: "error" });
    else if (r.code === "not_found") toast({ message: ORG_COPY.errors.notFound, tone: "error" });
    else {
      const known = orgErrorCopy(r.code);
      toast({ message: known ?? r.message, tone: "error", action: known ? undefined : r.action });
    }
  };

  const pill: React.CSSProperties = { minHeight: 44, flexShrink: 0, marginLeft: "auto", boxSizing: "border-box", padding: "0 16px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none", WebkitTapHighlightColor: "transparent" };
  let control: React.ReactNode = null;
  if (action && action.href) {
    control = (
      <Link href={action.href} style={{ ...pill, border: `1px solid ${t.fieldBorder}`, background: t.surface, color: t.ink }}>
        {action.label}
      </Link>
    );
  } else if (action && action.kind === "status") {
    control = <span style={{ ...pill, border: `1px solid ${t.hairline}`, background: "rgba(var(--scrim-rgb),0.05)", color: t.secondary }}>{action.label}</span>;
  } else if (action) {
    control = (
      <button type="button" aria-busy={busy || undefined} aria-disabled={busy || undefined} onClick={() => void press(action)} style={{ ...pill, border: "none", background: t.coralButton.bg, color: t.coralButton.ink, cursor: busy ? "default" : "pointer" }}>
        {busy ? ORG_COPY.buttons.busy : action.label}
      </button>
    );
  }

  return (
    <footer style={{ flexShrink: 0, boxSizing: "border-box", padding: "10px 12px calc(env(safe-area-inset-bottom, 0px) + 14px)", background: t.page, borderTop: `1px solid ${t.hairline}`, fontFamily: FONT }}>
      <div style={{ minHeight: 44, boxSizing: "border-box", padding: "8px 8px 8px 14px", borderRadius: 16, border: `1px solid ${t.hairline}`, background: t.surface, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px" }}>
        <div role="note" style={{ flex: "1 1 150px", minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <Megaphone color={t.muted} size={15} />
          <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>{FOLLOWER_POST_LINE}</span>
            {action?.sub ? <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: t.muted }}>{action.sub}</span> : null}
          </span>
        </div>
        {control}
      </div>
    </footer>
  );
}
