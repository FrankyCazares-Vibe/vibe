"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { CALENDAR_CHANGED_EVENT } from "@/components/LeftNav";
import { clubGradient } from "@/components/mobile/messages/avatar";
import { BoardStrip } from "@/components/mobile/messages/club/BoardStrip";
import { BoardView } from "@/components/mobile/messages/club/BoardView";
import { EventAbout } from "@/components/mobile/messages/club/EventAbout";
import { hatLine, roleWord } from "@/components/mobile/messages/club/helpers";
import { RoomChips } from "@/components/mobile/messages/club/RoomChips";
import { RoomComposer, type ReplyTarget } from "@/components/mobile/messages/club/RoomComposer";
import { RoomThread } from "@/components/mobile/messages/club/RoomThread";
import { RsvpSheet } from "@/components/mobile/messages/club/RsvpSheet";
import { initialsOf } from "@/components/mobile/messages/format";
import { chatRefusalLine } from "@/components/mobile/messages/send-failure";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import { BOARD_POSTER_ROLES } from "@/lib/chat/room-rules";
import type { EventRef, Person, RoomKind, SpaceResponse, SpaceRoom, ThreadMessagesResponse, ThreadRoom } from "@/lib/chat/types";
import { ROOM_FULL_READ_EVERY, ROOM_POLL_MS, useRoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest, type VibeResult } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ClubPanel } from "./ClubPanel";
import type { ClubPaneProps, RosterResponse } from "./contracts";
import { panelMode } from "./desktop-rules";
import { EventPanel } from "./EventPanel";
import { MembersDialog } from "./MembersDialog";
import { RoomsDialog } from "./RoomsDialog";

/**
 * A club open on desktop Messages (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.2, 3.3, 4.1, 4c.4, 6.5, section 8 W3-5-club; the board's
 * steps 1 and 2). The shell mounts it with `key={orgHandle}` as the one item
 * of the pane box and writes all history itself: this file only asks
 * (`onSwitchRoom`, `onLost`).
 *
 *   header        ONE row: the club's mark, its name (a link to its page) and
 *                 the hat line at the left; every room's chip, the `+` (owner
 *                 and admin) and the panel toggle at the right. Chips that do
 *                 not fit beside the name drop under it; the two buttons stay
 *                 top right.
 *   Board strip   only while no right panel is on screen and the open room is
 *                 not the Board.
 *   the room      `RoomView`, keyed by the room's id: the ONE room reader of
 *                 desktop Messages, the thread (or the Board) and the composer.
 *   right panel   `EventPanel` while the open room is an event chat, else
 *                 `ClubPanel`; a column beside the room, or over its right
 *                 edge on a narrow window (`panelMode`, 320 wide).
 *
 * Nothing on screen twice (3.2): ONE boolean, `panelOn`, decides the hat line
 * (the member count and `Manage club` are in it only while no panel shows
 * them), the Board strip, and where an event's Where / When / RSVP block
 * sits (the panel, or the top of the thread: never both, never nowhere).
 *
 * The room arrives three ways and all three are props: a click (`roomKind`
 * from the list, no first page), the shell's resolving read (`initialPage`,
 * which belongs to `roomId`), or a change of `roomId` on the mounted pane (a
 * chip, a week card of this club). The room's kind is the thread read's once
 * it answered, else the space's, else the prop.
 *
 * Reads (4.1): the space with `?panel=1` on open, every 20 s while visible,
 * on return to visible, after an RSVP made anywhere on the page (the dialog
 * or an event card: `CALENDAR_CHANGED_EVENT`), a moment after the Board is
 * opened or left, and when the Rooms dialog reports a change; the roster's visible
 * members once, for the panel's five faces. The panel's Board posts are the
 * space read's: nothing here reads the Board unless it is the open room.
 *
 * Rules kept from the phone's `ClubSpace` and `EventChat` (repeated, not
 * imported): a first space read that fails shows `LoadFailed` in the room's
 * place; a LATER 403 or 404 means the club is gone for this person, and the
 * shell is told with the refusal's own sentence; an event chat the viewer
 * lost (a `Not going`) says `You left the event chat.` and lands on the
 * Lounge; a room the thread read refuses and the space does not list is
 * reported lost. A closed event chat opened by link has no chip: it shows
 * its thread and the closed tile.
 */

const SPACE_LINE = "Couldn't load this club.";
const BOARD_LINE = "Couldn't load the Board.";
const EVENT_LINE = "Couldn't load this event chat.";
/** The faces' read is quiet: the line is only the name the request helper needs. */
const ROSTER_LINE = "Couldn't load the members.";
/** The toast of a room lost while open (6.5). */
const CHAT_LOST = "That chat isn't available anymore.";
const SPACE_REREAD_MS = ROOM_POLL_MS * ROOM_FULL_READ_EVERY;
/** The Board marks itself read as it opens and as it is left; the space is asked after that write has had time to land. */
const BOARD_SETTLE_MS = 1200;

/** The right panel's width (3.2) and the key its shown / hidden choice is kept under, per device (S7): written by a Show, and by a Hide of a panel that had room beside the thread. */
const PANEL_WIDTH = 320;
const PANEL_KEY = "vibe_chat_panel";

/** The pane's side inset: the mark, the strip and the thread's rows start on one line. */
const EDGE = 24;
/** The header's first line: the chips' own row height (`RoomChips`). */
const ROW = 45;

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

const CLUB_CSS = `
.vibe-club-btn { background: transparent; transition: background 240ms ease; }
.vibe-club-btn:hover { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-club-btn[aria-pressed="true"] { background: rgba(var(--scrim-rgb), 0.07); }
.vibe-club-btn:focus-visible, .vibe-club-link:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-club-link { text-decoration: none; border-radius: 4px; }
.vibe-club-link:hover { text-decoration: underline; text-underline-offset: 3px; }
`;

const NO_ROOMS: SpaceRoom[] = [];

type SpaceState = { data: SpaceResponse | null; failure: LoadFailure | null };
type PanelPref = "1" | "0" | null;
type RsvpTarget = { eventId: string; current: EventRef["viewer_status"] };

/** What the open room's reader knows that the pane around it needs: told upward by `RoomView`. */
type RoomReport = {
  roomId: string;
  /** The thread read's own word; null until it answered. */
  kind: RoomKind | null;
  /** An event chat's event (Where, When, who is going, my RSVP). */
  event: ThreadRoom["event"];
  /** A read after the first was refused: the viewer is out of the room. */
  lost: boolean;
  /** The FIRST read was refused (not a failure a second try can change): its sentence. */
  refused: string | null;
};

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function readPanelPref(): PanelPref {
  try {
    const value = window.localStorage.getItem(PANEL_KEY);
    return value === "1" || value === "0" ? value : null;
  } catch {
    return null;
  }
}

function storePanelPref(value: "1" | "0"): void {
  try {
    window.localStorage.setItem(PANEL_KEY, value);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

/**
 * The space read's `LoadFailure`, as on the phone: 403 `members_only` and
 * 404 `not_found` show the code's own sentence with no Retry; anything else
 * is `asLoadFailure`'s (a 5xx keeps `Couldn't load this club. Try again.`).
 */
function spaceFailure(r: VibeResult<SpaceResponse>): LoadFailure {
  if (!r.ok && (r.status === 403 || r.status === 404)) {
    const line = chatRefusalLine(r);
    if (line) return { message: line, retryable: false };
  }
  return asLoadFailure(r, SPACE_LINE);
}

export function ClubPane({ orgHandle, roomId, roomKind, initialPage, night, contentWidth, onSwitchRoom, onLost, onOrg, onListsChanged, onRsvpChanged }: ClubPaneProps) {
  const t = palette(night);
  const [space, setSpace] = useState<SpaceState>({ data: null, failure: null });
  const [retryToken, setRetryToken] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
  // Null while the roster loads and after it failed (the panel then draws no faces).
  const [faces, setFaces] = useState<Person[] | null>(null);
  const [report, setReport] = useState<RoomReport | null>(null);
  // Moved to make the open room read again (after an RSVP).
  const [reloadToken, setReloadToken] = useState(0);
  // The panel: the stored choice, and whether it was opened by a click in this visit (3.4 `panelMode`).
  const [pref, setPref] = useState<PanelPref>(readPanelPref);
  const [openedHere, setOpenedHere] = useState(false);
  const [rsvp, setRsvp] = useState<RsvpTarget | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);

  // Whether a space read has answered, for the later-403 rule; and a guard so
  // the shell is told "lost" once (no read is made after it).
  const hadDataRef = useRef(false);
  const goneRef = useRef(false);
  // The latest callbacks, so an inline arrow from the shell never re-arms the
  // space read's effect (written in an effect).
  const onLostRef = useRef(onLost);
  const onOrgRef = useRef(onOrg);
  useEffect(() => {
    onLostRef.current = onLost;
    onOrgRef.current = onOrg;
  }, [onLost, onOrg]);

  // The space read: on open (and on Retry, through `retryToken`), every 20 s
  // while visible, on return to visible; `readSpaceRef` asks for one more
  // (an RSVP, the Board opened or left, the Rooms dialog). The state is set
  // in the read's callback after the answer, never in the effect's body.
  const readSpaceRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let live = true;
    const read = async () => {
      if (goneRef.current) return;
      const r = await vibeRequest<SpaceResponse>(`/api/orgs/${encodeURIComponent(orgHandle)}/space?panel=1`, {
        quiet: true,
        failure: SPACE_LINE,
        cache: "no-store",
      });
      if (!live || goneRef.current) return;
      if (!r.ok || !Array.isArray(r.data?.rooms)) {
        if (!hadDataRef.current) {
          setSpace({ data: null, failure: spaceFailure(r) });
        } else if (!r.ok && (r.status === 403 || r.status === 404)) {
          // A club I left while it was open, or one hidden or gone since:
          // the shell goes home with the refusal's own sentence (`Members only.`).
          goneRef.current = true;
          onLostRef.current(chatRefusalLine(r) ?? r.message);
        }
        return;
      }
      hadDataRef.current = true;
      setSpace({ data: r.data, failure: null });
      // Names a club the inbox does not list; the shell keeps its object while nothing moved.
      onOrgRef.current(r.data.org);
    };
    readSpaceRef.current = () => void read();
    void read();
    const timer = window.setInterval(() => {
      if (isVisible()) void read();
    }, SPACE_REREAD_MS);
    const onVisibility = () => {
      if (isVisible()) void read();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      readSpaceRef.current = () => undefined;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orgHandle, retryToken]);

  // An RSVP made anywhere on the page (4.1; map 03 T16): the dialog reaches
  // here through the shell's `onRsvpChanged`, an event CARD in the thread
  // writes by itself and only emits. Either way the panel's event, its count
  // and the event chat's chip are the space's, so it is read again at once.
  useEffect(() => {
    const onCalendar = () => readSpaceRef.current();
    window.addEventListener(CALENDAR_CHANGED_EVENT, onCalendar);
    return () => window.removeEventListener(CALENDAR_CHANGED_EVENT, onCalendar);
  }, []);

  // The faces (C3): ONE roster read per club open, without the people in a
  // block with the viewer (`?visible=1`); the first five rows that have a
  // handle, as `Person` (3.3). A failure leaves `faces` null and says nothing.
  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await vibeRequest<Partial<RosterResponse>>(`/api/orgs/${encodeURIComponent(orgHandle)}/members?visible=1`, {
        quiet: true,
        failure: ROSTER_LINE,
        cache: "no-store",
      });
      if (!live || !r.ok || !Array.isArray(r.data?.members)) return;
      const five: Person[] = [];
      for (const row of r.data.members) {
        if (!row.handle) continue;
        five.push({ id: row.user_id, handle: row.handle, name: row.name ?? row.handle, avatar_url: row.avatar_url });
        if (five.length === 5) break;
      }
      setFaces(five);
    })();
    return () => {
      live = false;
    };
  }, [orgHandle]);

  // The labels' clock: a minute is enough for `Tonight`, `Soon`, `N more days`.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (isVisible()) setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const data = space.data;
  const rooms = data?.rooms ?? NO_ROOMS;
  const listed = rooms.find((r) => r.id === roomId) ?? null;
  const loungeId = rooms.find((r) => r.kind === "lounge")?.id ?? null;
  const board = rooms.find((r) => r.kind === "board") ?? null;
  // What the open room's reader last said; nothing of a room that is no longer the open one.
  const live = report !== null && report.roomId === roomId ? report : null;
  // The thread read knows the room; before it answers, the space; before that, the shell's word.
  const kind: RoomKind | null = live?.kind ?? listed?.kind ?? roomKind;
  const event = kind === "event" ? (live?.event ?? null) : null;
  // "Officers" is owner and admin (4c.2): `Manage club`, `Manage rooms` and the `+` are theirs, never a mod's.
  const role = data?.viewer.role ?? null;
  const officer = role !== null && BOARD_POSTER_ROLES.includes(role);

  // Where the right panel is. `panelOn` is the ONE "a panel is on screen"
  // that the hat line, `Manage club`, the Board strip and the event block
  // all read. Until the shell's first measure `contentWidth` is 0 and the
  // answer is "hidden"; nothing is stored from that frame (only a click stores).
  const mode = panelMode(contentWidth, PANEL_WIDTH, pref, openedHere);
  const shownMode = mode === "hidden" ? null : mode;
  const panelOn = shownMode !== null;
  const showPanel = useCallback(() => {
    setOpenedHere(true);
    setPref("1");
    storePanelPref("1");
  }, []);
  // Hiding is kept as the device's choice only when the panel had room beside
  // the thread. Closing an overlay is how the thread comes back on a narrow
  // window, not "I do not want the panel": it ends this visit's open and
  // stores nothing, so a wider window still shows the panel by default (S7).
  // The panel's own hide button leaves with the panel: when focus was inside
  // the panel it goes to the header's toggle first, never to `<body>`.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelBoxRef = useRef<HTMLDivElement>(null);
  const hidePanel = useCallback(() => {
    if (panelBoxRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
    setOpenedHere(false);
    if (mode !== "side") return;
    setPref("0");
    storePanelPref("0");
  }, [mode]);

  // The Board opened or left (4.1; map 03 T7): the space is 20 s behind, so
  // the panel's posts and the Board's dot are asked for again, once the
  // room's own "read" mark has had a moment to land.
  const onBoard = kind === "board";
  const wasOnBoardRef = useRef(onBoard);
  useEffect(() => {
    if (wasOnBoardRef.current === onBoard) return;
    wasOnBoardRef.current = onBoard;
    const id = window.setTimeout(() => readSpaceRef.current(), BOARD_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [onBoard]);

  // An event chat the viewer lost while it was open (a `Not going`, by the
  // database's own trigger): the line, the lists and the space again (the
  // chip is gone), and the club's Lounge. Once per time the room is open:
  // the guard covers the moment between asking the shell and the new
  // `roomId`, and is cleared with it (the pane is keyed by the club, so the
  // same event chat can be joined, opened and left again in one visit).
  const left = kind === "event" && live !== null && live.lost;
  const leftRoomRef = useRef<string | null>(null);
  useEffect(() => {
    leftRoomRef.current = null;
  }, [roomId]);
  useEffect(() => {
    if (!left || loungeId === null || goneRef.current || leftRoomRef.current === roomId) return;
    leftRoomRef.current = roomId;
    toast({ message: "You left the event chat.", tone: "info" });
    onListsChanged();
    readSpaceRef.current();
    onSwitchRoom(loungeId, "lounge");
  }, [left, loungeId, roomId, onListsChanged, onSwitchRoom]);

  // A room the thread read refuses. The first read's refusal carries its own
  // sentence; a later one (any room but an event chat, above) is the chat
  // lost while open. The space is asked again at once, and when it does not
  // list the room either, the shell is told: home, with that line. A room the
  // space still lists keeps its own `LoadFailed`. Held back while the Rooms
  // dialog is open: an officer who deleted the open room there is still
  // working in that dialog, and it lives in this pane.
  const lostLine = live === null ? null : (live.refused ?? (live.lost && kind !== "event" ? CHAT_LOST : null));
  useEffect(() => {
    if (lostLine !== null) readSpaceRef.current();
  }, [lostLine]);
  useEffect(() => {
    if (lostLine === null || data === null || roomsOpen || goneRef.current) return;
    if (data.rooms.some((r) => r.id === roomId)) return;
    goneRef.current = true;
    onLostRef.current(lostLine);
  }, [lostLine, data, roomsOpen, roomId]);

  const pickRoom = useCallback((room: SpaceRoom) => onSwitchRoom(room.id, room.kind), [onSwitchRoom]);
  const openEventChat = useCallback((id: string) => onSwitchRoom(id, "event"), [onSwitchRoom]);
  const openRsvp = useCallback((eventId: string, current: EventRef["viewer_status"]) => setRsvp({ eventId, current }), []);
  // ONE handler for the dialog's life: `RsvpSheet` keeps its history entry by it.
  const closeRsvp = useCallback(() => setRsvp(null), []);
  // An RSVP made in the dialog (T16): the thread's event cards and the event
  // block are the room's, and the week band and My Calendar are the shell's.
  // The panel's event and counts are the space's: the shell's `onRsvpChanged`
  // emits `CALENDAR_CHANGED_EVENT` (3.3), and the listener above reads it.
  const rsvpChanged = useCallback(() => {
    setReloadToken((n) => n + 1);
    onRsvpChanged();
  }, [onRsvpChanged]);
  const openMembers = useCallback(() => setMembersOpen(true), []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);
  const openRooms = useCallback(() => setRoomsOpen(true), []);
  const closeRooms = useCallback(() => setRoomsOpen(false), []);
  const roomsChanged = useCallback(() => readSpaceRef.current(), []);

  const org = data?.org ?? null;
  const boardLatest = data?.board_latest ?? null;

  return (
    // The one item of the shell's pane box. No ancestor of the thread here
    // may take a `transform`, `filter` or `contain`: the remove confirm is
    // `position: fixed` in the tree and must be placed against the window.
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", display: "flex", color: t.ink, fontFamily: FONT }}>
      <style>{CLUB_CSS}</style>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ClubHeader
          t={t}
          night={night}
          now={now}
          orgHandle={orgHandle}
          space={data}
          roomId={roomId}
          panelOn={panelOn}
          officer={officer}
          onPick={pickRoom}
          onManageRooms={openRooms}
          onTogglePanel={panelOn ? hidePanel : showPanel}
          toggleRef={toggleRef}
        />
        {space.failure ? (
          <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: `16px ${EDGE + 12}px` }}>
            <LoadFailed
              failure={space.failure}
              tone={night ? "dark" : "light"}
              onRetry={() => {
                setSpace({ data: null, failure: null });
                setRetryToken((n) => n + 1);
              }}
            />
          </div>
        ) : (
          <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: `0 ${EDGE}px`, display: "flex", flexDirection: "column" }}>
            {!panelOn && kind !== "board" && boardLatest && board ? (
              <BoardStrip latest={boardLatest} unread={board.unread} night={night} onOpen={() => pickRoom(board)} />
            ) : null}
            <RoomView
              key={roomId}
              roomId={roomId}
              kindHint={listed?.kind ?? roomKind}
              storedName={listed?.name ?? null}
              clubName={org?.name ?? null}
              orgHandle={orgHandle}
              orgId={org?.id ?? null}
              initialPage={initialPage}
              night={night}
              now={now}
              panelOn={panelOn}
              reloadToken={reloadToken}
              onReport={setReport}
              onOpenEventChat={openEventChat}
              onRsvp={openRsvp}
            />
          </div>
        )}
      </div>
      {/* The panel's place: a column beside the room, or laid over its right edge (no scrim) above the thread's
          hover toolbars. One element in both modes, so a resize never remounts the panel. While it is still
          empty (the space, or an event chat's first read, is out) it takes no click from the room under it. */}
      {shownMode ? (
        <div
          ref={panelBoxRef}
          style={{
            display: "flex",
            minHeight: 0,
            width: PANEL_WIDTH,
            pointerEvents: (kind === "event" ? event : data) ? undefined : "none",
            ...(shownMode === "side" ? { flex: `0 0 ${PANEL_WIDTH}px`, position: "relative" } : { position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 6 }),
          }}
        >
          {kind === "event" ? (
            event ? (
              <EventPanel event={event} night={night} now={now} mode={shownMode} onHide={hidePanel} onRsvp={() => openRsvp(event.id, event.viewer_status)} />
            ) : null
          ) : data ? (
            <ClubPanel
              space={data}
              activeRoomKind={kind}
              night={night}
              now={now}
              mode={shownMode}
              faces={faces}
              onHide={hidePanel}
              onOpenRoom={onSwitchRoom}
              onRsvp={openRsvp}
              onSeeMembers={openMembers}
              onManageRooms={officer ? openRooms : null}
            />
          ) : null}
        </div>
      ) : null}
      {rsvp ? <RsvpSheet eventId={rsvp.eventId} current={rsvp.current} night={night} onClose={closeRsvp} onChanged={rsvpChanged} /> : null}
      {membersOpen && org ? <MembersDialog orgHandle={orgHandle} clubName={org.name} night={night} onClose={closeMembers} /> : null}
      {roomsOpen && org ? <RoomsDialog orgHandle={orgHandle} clubName={org.name} night={night} onClose={closeRooms} onChanged={roomsChanged} /> : null}
    </div>
  );
}

type ClubHeaderProps = {
  t: Palette;
  night: boolean;
  now: Date;
  orgHandle: string;
  /** Null until the space read answers: bars and discs. */
  space: SpaceResponse | null;
  roomId: string;
  panelOn: boolean;
  officer: boolean;
  onPick: (room: SpaceRoom) => void;
  onManageRooms: () => void;
  onTogglePanel: () => void;
  /** The panel toggle: the pane puts focus on it when the panel's own hide button leaves with the panel. */
  toggleRef: React.RefObject<HTMLButtonElement | null>;
};

/**
 * The club's header, ONE row (section 8, 6.5; the board's steps 1 and 2).
 * Left: the 40px mark, the name as a link to the club's page, the hat line.
 * Right: the chips of every room, then the `+` (owner and admin: the Rooms
 * dialog) and the panel toggle.
 *
 * The name block and the chips are the two items of a wrapping row: chips
 * that do not fit beside the name drop to their own row under it (and wrap
 * there, `RoomChips`' desktop form), with nothing measured. The two buttons
 * sit outside that row, so they stay top right whatever the chips do.
 *
 * The hat line by state: a panel on screen shows the member count and
 * `Manage club` itself, so the line is the hat alone; with no panel on
 * screen it is `hatLine` and, for an owner or an admin, `Manage club`. The
 * link is the plain address `/campus?manage=<handle>` and nothing beside it
 * (a `tab` or a `channel` there would be redirected before the door is read).
 */
function ClubHeader({ t, night, now, orgHandle, space, roomId, panelOn, officer, onPick, onManageRooms, onTogglePanel, toggleRef }: ClubHeaderProps) {
  const org = space?.org ?? null;
  const round: React.CSSProperties = { flexShrink: 0, boxSizing: "border-box", padding: 0, borderRadius: 999, border: `1px solid ${t.fieldBorder}`, color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
  const oneLine: React.CSSProperties = { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <header style={{ flexShrink: 0, boxSizing: "border-box", padding: `10px ${EDGE + 12}px 4px`, display: "flex", alignItems: "flex-start", gap: 6 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 12 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: ROW, display: "flex", alignItems: "center", gap: 12 }}>
          {org ? (
            // The gradients are dark in both themes: the initials take the theme's light colour (the page in Light, the ink in Night).
            <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: org.logo_url ? `url(${org.logo_url}) center/cover` : clubGradient(org.id), boxShadow: `inset 0 0 0 1px ${t.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 800, fontSize: 15.5, color: night ? t.ink : t.page }}>
              {org.logo_url ? null : initialsOf(org.name)}
            </span>
          ) : (
            <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: SKELETON_DISC }} />
          )}
          {space && org ? (
            <div style={{ flex: "0 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <h1 style={{ margin: 0, minWidth: 0, display: "flex", fontFamily: SERIF, fontWeight: 800, fontSize: 20, lineHeight: 1.1, letterSpacing: -0.4 }}>
                <Link href={`/orgs/${encodeURIComponent(orgHandle)}`} className="vibe-club-link" aria-label={`Open ${org.name}'s page`} style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, color: t.ink }}>
                  <span style={oneLine}>{org.name}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </h1>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.secondary }}>
                <span style={oneLine}>{panelOn ? `Your hat: ${roleWord(space.viewer.role)}` : hatLine(space.viewer.role, org.member_count)}</span>
                {!panelOn && officer ? (
                  <>
                    <span aria-hidden="true" style={{ flexShrink: 0, whiteSpace: "pre" }}>{" · "}</span>
                    <a href={`/campus?manage=${encodeURIComponent(orgHandle)}`} className="vibe-club-link" style={{ flexShrink: 0, color: t.ink, fontWeight: 700 }}>
                      Manage club
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div aria-hidden="true" style={{ flex: "0 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ width: "62%", height: 18, borderRadius: 6, background: SKELETON_BAR }} />
              <div style={{ width: "44%", height: 11, borderRadius: 5, background: SKELETON_BAR_SOFT }} />
            </div>
          )}
        </div>
        {space && org ? (
          // An event chat is the open room like any other: its chip is drawn selected (`RoomChips`, desktop).
          <RoomChips clubName={org.name} rooms={space.rooms} activeRoomId={roomId} night={night} now={now} onPick={onPick} />
        ) : (
          <div aria-hidden="true" style={{ flexShrink: 0, height: ROW, display: "flex", alignItems: "center", gap: 5 }}>
            {[70, 74, 90].map((w, i) => (
              <div key={i} style={{ width: w, height: 30, borderRadius: 999, background: SKELETON_DISC }} />
            ))}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, height: ROW, display: "flex", alignItems: "center", gap: 6 }}>
        {officer ? (
          <button type="button" className="vibe-club-btn" aria-label="Manage rooms" aria-haspopup="dialog" onClick={onManageRooms} style={{ ...round, width: 30, height: 30 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : null}
        <button
          ref={toggleRef}
          type="button"
          className="vibe-club-btn"
          aria-label={panelOn ? "Hide this panel" : "Show the club panel"}
          aria-pressed={panelOn}
          onClick={(e) => {
            // Not the second click of a double click: the panel's own hide button has just left and the header has widened, so this toggle is under the pointer and would show the panel again.
            if (e.detail > 1) return;
            onTogglePanel();
          }}
          style={{ ...round, width: 36, height: 36 }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
            <path d="M14.5 4.5v15" />
          </svg>
        </button>
      </div>
    </header>
  );
}

type RoomViewProps = {
  roomId: string;
  /** The room's kind before its own read answers: the space's word, else the shell's. */
  kindHint: RoomKind | null;
  /** The room's stored name from the space (a slug for an extra room; `RoomComposer` makes it words). */
  storedName: string | null;
  /** From the space; before it answers, the thread read's own `room.org`. */
  clubName: string | null;
  orgHandle: string;
  orgId: string | null;
  /** The shell's resolving read of this very room, used as its first page (read once, at the mount). */
  initialPage: ThreadMessagesResponse | null;
  night: boolean;
  now: Date;
  /** A right panel is on screen: an event chat's Where / When / RSVP block is there, not here. */
  panelOn: boolean;
  /** Moved by the pane: read the room again now. */
  reloadToken: number;
  onReport: (report: RoomReport) => void;
  onOpenEventChat: (roomId: string) => void;
  onRsvp: (eventId: string, current: EventRef["viewer_status"]) => void;
};

/**
 * The open room (4.1): mounted with `key={roomId}`, so one reader is alive at
 * a time and a chip starts a fresh one. The hook reads the first page (or
 * takes the shell's), polls every 4 s and marks the room read on mount, on
 * arrivals and on leaving; it is the only thing here that does, so the Board
 * is marked read only while the Board is the open room.
 *
 * The Board draws `BoardView`; every other kind `RoomThread`, bottom-anchored
 * with no header. The ONE exception (4c.4): an event chat while no right
 * panel is on screen gets `EventAbout` as the thread's header, top-anchored,
 * exactly as on the phone, so Where, When, Who's going and the RSVP button
 * are never off screen on a narrow laptop. With a panel on screen the same
 * block is in `EventPanel` and not here.
 */
function RoomView({ roomId, kindHint, storedName, clubName, orgHandle, orgId, initialPage, night, now, panelOn, reloadToken, onReport, onOpenEventChat, onRsvp }: RoomViewProps) {
  const poll = useRoomPoll(roomId, {
    enabled: true,
    initialPage: initialPage ?? undefined,
    line: kindHint === "board" ? BOARD_LINE : kindHint === "event" ? EVENT_LINE : undefined,
  });
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [scrollToken, setScrollToken] = useState(0);

  const { room, viewer, viewerId, failure, lostAccess, reload } = poll;
  const kind: RoomKind | null = room?.kind ?? kindHint;
  const event = room?.kind === "event" ? room.event : null;
  // A refusal a second try cannot change (403, 404): not a failure with Retry, and not one with its own action (Sign in).
  const refused = failure !== null && failure.retryable === false && !failure.action ? failure.message : null;

  // The pane's header, strip and panel follow what this read knows.
  const readKind = room?.kind ?? null;
  useEffect(() => {
    onReport({ roomId, kind: readKind, event, lost: lostAccess, refused });
  }, [onReport, roomId, readKind, event, lostAccess, refused]);

  // The pane asked for the room again (an RSVP changed what its cards and its event say).
  const seenTokenRef = useRef(reloadToken);
  useEffect(() => {
    if (seenTokenRef.current === reloadToken) return;
    seenTokenRef.current = reloadToken;
    void reload();
  }, [reloadToken, reload]);

  const club = clubName ?? room?.org.name ?? "";
  // An event chat is named by its event's title, as on the phone; every other room by its stored name.
  const name = kind === "event" ? event?.title || room?.name || storedName || "" : (storedName ?? room?.name ?? "");
  // Until the first read names the room, the thread and the composer draw nothing kind-specific (a skeleton, nothing).
  const shownKind: RoomKind = kind ?? "room";
  const about = event !== null && !panelOn;

  return (
    <div style={{ flexGrow: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
      {kind === "board" ? (
        <BoardView poll={poll} roomId={roomId} night={night} now={now} onOpenEventChat={onOpenEventChat} scrollToken={scrollToken} />
      ) : (
        <RoomThread
          poll={poll}
          roomId={roomId}
          roomKind={shownKind}
          clubName={club}
          night={night}
          now={now}
          anchor={about ? "top" : "bottom"}
          header={about ? <EventAbout event={event} night={night} now={now} onRsvp={() => onRsvp(event.id, event.viewer_status)} /> : undefined}
          onReply={setReplyTo}
          onOpenEventChat={onOpenEventChat}
          scrollToken={scrollToken}
        />
      )}
      <RoomComposer
        roomId={roomId}
        roomKind={shownKind}
        roomName={name}
        clubName={club}
        orgHandle={orgHandle}
        orgId={orgId ?? room?.org.id ?? null}
        viewer={viewer}
        viewerId={viewerId}
        night={night}
        poll={poll}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={() => setScrollToken((n) => n + 1)}
        officerLine={kind === "board" && !!viewer?.can_post}
      />
    </div>
  );
}
