"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import type { RoomKind, SpaceResponse, SpaceRoom, ThreadMessagesResponse } from "@/lib/chat/types";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { ROOM_FULL_READ_EVERY, ROOM_POLL_MS, useRoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest, type VibeResult } from "@/lib/feedback/request";

import { clubGradient } from "../avatar";
import { initialsOf } from "../format";
import { chatRefusalLine, toastSendFailure } from "../send-failure";
import { vaulOverlayStyle, visuallyHiddenStyle } from "../sheet-styles";
import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";
import { BoardStrip } from "./BoardStrip";
import { BoardView } from "./BoardView";
import { ClubEmpty } from "./ClubEmpty";
import { EventChat } from "./EventChat";
import { countWord, isEmptyRoom, isOfficer, roleWord } from "./helpers";
import { RoomChips } from "./RoomChips";
import { RoomComposer, type ReplyTarget } from "./RoomComposer";
import { RoomThread } from "./RoomThread";
import { UpNext } from "./UpNext";

/**
 * The club space (handoffs/chat-redesign/wave-2-contracts.md 11.3, 1.2;
 * mockups W0_Club, W0_Club_Light, W0_Board, W0_EmptyClub; MK:4, 5, 12; W2-S2).
 * Opened by a club row tap, `?channel=<id>` (2.3), or underneath an event
 * chat layer. Props are exactly 11.3's.
 *
 * - A full-screen view above the home: `Drawer.Root direction="right"`
 *   (overlay 1099 / content 1100) like `ConversationView`; the tab bar is
 *   hidden by the counted `useHideTabBar()` (SCREENS-H1).
 * - Reads: `GET /api/orgs/<handle>/space` on open, on return to visible, and
 *   every 20 s while visible (= 5 ticks of the room's 4-s poll, 9.3); the
 *   open room through `useRoomPoll` (11.5), keyed by the room's id, paused
 *   while the event chat layer is open (the layer polls its own room). A
 *   deep link with a room id starts the room's read at once (the space read
 *   follows); `initialRoomKind === "event"` → the space on its Lounge with
 *   `EventChat` on top (11.6).
 * - Layout: the 52px header + safe area (Back, the 40px avatar, the name,
 *   `Your hat: … · N members`, the club-page link), Up next, the chips, the
 *   Board strip (every room but the Board), the room (BoardView / RoomThread),
 *   the composer (RoomComposer: nothing while `viewer` is null).
 * - History (2.3): a chip tap `replaceState`s the room's id at the current
 *   depth; opening the layer `pushState`s depth 2 (unless the deep link's
 *   entry is already there); the layer's Back is `history.back()`; a
 *   `popstate` below depth 2 closes the layer. The space's own Back and swipe
 *   call `onClose` (S2-notes.md REQUESTS R1-R3).
 * - States: the header + chips + three bars skeleton until the space read
 *   answers; the read failing → `LoadFailed` (`Couldn't load this club.`,
 *   non-retryable on 403 `members_only` / 404, the code's sentence) with Back
 *   working; a LATER 403 (or 404: the club hidden or gone) clears the space,
 *   closes the event chat layer when one is open, then the view, with the
 *   code's toast (`Members only.`; S2-repair.md SEC3 / B2).
 * - The officer's brand new club (11.9.3): `ClubEmpty` in the Lounge's place
 *   and the dashed `Add your first event` in Up next.
 */
export type ClubSpaceProps = {
  orgHandle: string;
  initialRoomId: string | null;
  initialRoomKind: RoomKind | null;
  /**
   * The resolving thread GET's body (a `?channel=` deep link, a week card
   * without a club handle; 2.3): the first page of `initialRoomId`'s hook,
   * so the room is read once on arrival (9.3, SCREENS-L10; INT-ADJUDICATE-5).
   * For an event room it is the layer's first page (once).
   */
  initialPage?: ThreadMessagesResponse;
  onClose: () => void;
};

const SPACE_LINE = "Couldn't load this club.";
const BOARD_LINE = "Couldn't load the Board.";
const SPACE_REREAD_MS = ROOM_POLL_MS * ROOM_FULL_READ_EVERY;

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

type SpaceState = { data: SpaceResponse | null; failure: LoadFailure | null };

type HistoryState = { vibeChat?: unknown; depth?: unknown } | null;

function historyState(): HistoryState {
  try {
    return typeof window === "undefined" ? null : (window.history.state as HistoryState);
  } catch {
    return null;
  }
}

function roomUrl(id: string): string {
  return `/messages?channel=${encodeURIComponent(id)}`;
}

/** A chip tap: the same depth, the room's id (2.3). */
function replaceRoomHistory(id: string): void {
  try {
    const s = historyState();
    const depth = typeof s?.depth === "number" ? s.depth : 1;
    window.history.replaceState({ vibeChat: id, depth }, "", roomUrl(id));
  } catch {
    /* history unavailable */
  }
}

/** The event chat layer's open: depth 2, unless a deep link already pushed it (R2). */
function pushLayerHistory(id: string): void {
  try {
    const s = historyState();
    if (s && s.depth === 2 && s.vibeChat === id) return;
    window.history.pushState({ vibeChat: id, depth: 2 }, "", roomUrl(id));
  } catch {
    /* history unavailable */
  }
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * The space read's `LoadFailure`: 403 `members_only` / 404 `not_found` show
 * the code's sentence (1.3) without Retry (11.3 States); `describeFailure`
 * would map them to its generic lines (S2-repair.md C1). Anything else is
 * `asLoadFailure`'s (a 5xx keeps `Couldn't load this club. Try again.`).
 */
function spaceFailure(r: VibeResult<SpaceResponse>): LoadFailure {
  if (!r.ok && (r.status === 403 || r.status === 404)) {
    const line = chatRefusalLine(r);
    if (line) return { message: line, retryable: false };
  }
  return asLoadFailure(r, SPACE_LINE);
}

export function ClubSpace({ orgHandle, initialRoomId, initialRoomKind, initialPage, onClose }: ClubSpaceProps) {
  // Hooks first, always (react-hooks/rules-of-hooks).
  useHideTabBar();
  const night = useNightTheme();
  const t = palette(night);
  const [space, setSpace] = useState<SpaceState>({ data: null, failure: null });
  const [now, setNow] = useState<Date>(() => new Date());
  const [pickedRoomId, setPickedRoomId] = useState<string | null>(initialRoomKind === "event" ? null : initialRoomId);
  const [eventRoomId, setEventRoomId] = useState<string | null>(initialRoomKind === "event" ? initialRoomId : null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [scrollToken, setScrollToken] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  // Whether a space read has answered, for the later-403 rule; written only
  // in the read's callback. And a guard so the close runs once.
  const hadDataRef = useRef(false);
  const closedRef = useRef(false);
  // The same as `closedRef`, for the hook's option (no ref read in render).
  const [closedSpace, setClosedSpace] = useState(false);
  // The layer's room, for the close that must peel it first (written in an effect).
  const eventRoomIdRef = useRef(eventRoomId);
  useEffect(() => {
    eventRoomIdRef.current = eventRoomId;
  }, [eventRoomId]);
  // Set before a `history.back()` that pops the layer: the popstate handler
  // then `replaceState`s that room (the layer's Board strip, 2.3) and / or
  // closes the space (the later 403 with the layer open).
  const pendingRoomRef = useRef<string | null>(null);
  const pendingCloseRef = useRef(false);
  // The latest `onClose`, so an inline arrow from the parent never re-arms
  // the space read's effect (written in an effect, react-hooks/refs).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const rooms = space.data?.rooms ?? [];
  const lounge = rooms.find((r) => r.kind === "lounge") ?? null;
  const board = rooms.find((r) => r.kind === "board") ?? null;
  const picked = pickedRoomId ? (rooms.find((r) => r.id === pickedRoomId && r.kind !== "event") ?? null) : null;
  const activeRoom: SpaceRoom | null = picked ?? lounge ?? rooms.find((r) => r.kind !== "event") ?? null;
  // Before the space answers, a deep link's room reads at once (11.3 Reads).
  const hookRoomId = activeRoom?.id ?? (initialRoomKind !== "event" ? initialRoomId : null);
  const hookRoomKind: RoomKind | null = activeRoom?.kind ?? (initialRoomKind !== "event" ? initialRoomKind : null);
  const poll = useRoomPoll(hookRoomId, {
    enabled: eventRoomId === null && hookRoomId !== null && !closedSpace,
    line: hookRoomKind === "board" ? BOARD_LINE : undefined,
    // The deep link's page for the deep-linked room only (the hook reads it
    // once, at its mount); a chip tap keys a fresh read.
    initialPage: hookRoomId !== null && hookRoomId === initialRoomId ? initialPage : undefined,
  });

  // The space read: on open (and on Retry, through `retryToken`), every 20 s
  // while visible, on return to visible. The state is set in the read's
  // callback after the answer, never in the effect's body.
  const [retryToken, setRetryToken] = useState(0);
  useEffect(() => {
    let live = true;
    const read = async () => {
      if (closedRef.current) return;
      const r = await vibeRequest<SpaceResponse>(`/api/orgs/${encodeURIComponent(orgHandle)}/space`, {
        quiet: true,
        failure: SPACE_LINE,
        cache: "no-store",
      });
      if (!live || closedRef.current) return;
      if (!r.ok || !Array.isArray(r.data?.rooms)) {
        if (!hadDataRef.current) {
          setSpace({ data: null, failure: spaceFailure(r) });
        } else if (!r.ok && (r.status === 403 || r.status === 404)) {
          // A club I left while the space was open (11.3 States), or one
          // hidden or gone since: nothing of it stays on screen (the box
          // with the sentence, no Retry), the layer is popped first when
          // one is open (its depth-2 entry), then the view closes.
          closedRef.current = true;
          setClosedSpace(true);
          setSpace({ data: null, failure: spaceFailure(r) });
          setEventRoomId(null);
          toastSendFailure(r);
          const s = historyState();
          if (eventRoomIdRef.current !== null && s && s.depth === 2 && s.vibeChat) {
            pendingCloseRef.current = true;
            window.history.back();
          } else {
            onCloseRef.current();
          }
        }
        return;
      }
      hadDataRef.current = true;
      setSpace({ data: r.data, failure: null });
    };
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
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orgHandle, retryToken]);

  // The labels' clock.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (isVisible()) setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // History (2.3): a deep-linked event layer gets its depth-2 entry unless
  // MessagesMobile pushed it already; a popstate below depth 2 closes the
  // layer (the one closer for it).
  useEffect(() => {
    if (initialRoomKind === "event" && initialRoomId) pushLayerHistory(initialRoomId);
  }, [initialRoomKind, initialRoomId]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as HistoryState;
      const depth = typeof s?.depth === "number" ? s.depth : 0;
      if (depth >= 2) return;
      setEventRoomId(null);
      // The pop landed on the depth-1 entry: the room picked from inside the
      // layer is written on it now (never before the pop, which would
      // rewrite the depth-2 entry).
      const room = pendingRoomRef.current;
      if (room !== null) {
        pendingRoomRef.current = null;
        replaceRoomHistory(room);
      }
      if (pendingCloseRef.current) {
        pendingCloseRef.current = false;
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The deep link's resolving read is the event layer's first page ONCE (a
  // deep-linked event room, 2.3); every open from inside the space
  // (`openEvent`, counted) reads afresh.
  const [eventOpens, setEventOpens] = useState(0);
  const openEvent = useCallback((roomId: string) => {
    setEventRoomId(roomId);
    setEventOpens((n) => n + 1);
    pushLayerHistory(roomId);
  }, []);
  const closeEvent = useCallback(() => {
    const s = historyState();
    if (s && s.depth === 2 && s.vibeChat) window.history.back();
    else setEventRoomId(null);
  }, []);
  /** The Board strip inside the layer: the Board picked, the layer popped, the Board `replaceState`d after the pop (2.3). */
  const openBoardFromLayer = useCallback((boardId: string) => {
    setPickedRoomId(boardId);
    setReplyTo(null);
    setFocusToken(0);
    const s = historyState();
    if (s && s.depth === 2 && s.vibeChat) {
      pendingRoomRef.current = boardId;
      window.history.back();
    } else {
      setEventRoomId(null);
      replaceRoomHistory(boardId);
    }
  }, []);
  const pickRoom = useCallback(
    (room: SpaceRoom) => {
      if (room.kind === "event") {
        openEvent(room.id);
        return;
      }
      setPickedRoomId(room.id);
      setReplyTo(null);
      setFocusToken(0);
      replaceRoomHistory(room.id);
    },
    [openEvent],
  );

  const org = space.data?.org ?? null;
  const spaceViewer = space.data?.viewer ?? null;
  const officerEmpty = !!org && !!spaceViewer && isOfficer(spaceViewer.role) && org.member_count === 1 && (space.data?.up_next.length ?? 0) === 0;
  const loungeEmpty = officerEmpty && activeRoom?.kind === "lounge" && isEmptyRoom(poll.messages);
  const boardUnread = board?.unread ?? false;
  const boardLatest = space.data?.board_latest ?? null;

  return (
    <Drawer.Root
      open
      direction="right"
      handleOnly
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1099 }} />
        <Drawer.Content
          style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", background: t.page, color: t.ink, display: "flex", flexDirection: "column", zIndex: 1100, outline: "none", fontFamily: FONT }}
          aria-describedby={undefined}
        >
          <Drawer.Title style={visuallyHiddenStyle}>{org ? org.name : "Club space"}</Drawer.Title>
          <ClubHeader night={night} onClose={onClose} orgHandle={orgHandle} space={space.data} />
          {space.failure ? (
            <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px" }}>
              <LoadFailed
                failure={space.failure}
                tone={night ? "dark" : "light"}
                onRetry={() => {
                  setSpace({ data: null, failure: null });
                  setRetryToken((n) => n + 1);
                }}
              />
            </div>
          ) : !space.data || !org || !spaceViewer ? (
            <ClubBodySkeleton />
          ) : (
            <>
              <UpNext clubName={org.name} events={space.data.up_next} night={night} now={now} officerEmpty={officerEmpty} onOpenEvent={openEvent} />
              <RoomChips clubName={org.name} rooms={rooms} activeRoomId={activeRoom?.id ?? null} night={night} now={now} onPick={pickRoom} />
              {activeRoom?.kind !== "board" && boardLatest && board ? (
                <BoardStrip latest={boardLatest} unread={boardUnread} night={night} onOpen={() => pickRoom(board)} />
              ) : null}
              {activeRoom ? (
                <div key={activeRoom.id} style={{ flexGrow: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
                  {activeRoom.kind === "board" ? (
                    <BoardView poll={poll} roomId={activeRoom.id} night={night} now={now} onOpenEventChat={openEvent} scrollToken={scrollToken} paused={eventRoomId !== null} />
                  ) : (
                    <RoomThread
                      poll={poll}
                      roomId={activeRoom.id}
                      roomKind={activeRoom.kind}
                      clubName={org.name}
                      night={night}
                      now={now}
                      anchor="bottom"
                      onReply={setReplyTo}
                      onOpenEventChat={openEvent}
                      scrollToken={scrollToken}
                      emptyBlock={
                        loungeEmpty ? (
                          <ClubEmpty
                            orgHandle={orgHandle}
                            night={night}
                            onPostWelcome={() => {
                              if (board) pickRoom(board);
                              setFocusToken((n) => n + 1);
                            }}
                          />
                        ) : undefined
                      }
                    />
                  )}
                  <RoomComposer
                    roomId={activeRoom.id}
                    roomKind={activeRoom.kind}
                    roomName={activeRoom.name}
                    clubName={org.name}
                    orgHandle={orgHandle}
                    orgId={org.id}
                    viewer={poll.viewer}
                    viewerId={poll.viewerId}
                    night={night}
                    poll={poll}
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                    onSent={() => setScrollToken((n) => n + 1)}
                    officerLine={activeRoom.kind === "board" && !!poll.viewer?.can_post}
                    focusToken={focusToken}
                  />
                </div>
              ) : null}
            </>
          )}
          {eventRoomId && org ? (
            <EventChat
              orgHandle={orgHandle}
              club={{ id: org.id, name: org.name, logo_url: org.logo_url }}
              roomId={eventRoomId}
              initialPage={eventOpens === 0 && eventRoomId === initialRoomId ? initialPage : undefined}
              boardLatest={boardLatest}
              boardUnread={boardUnread}
              onOpenBoard={() => {
                if (board) openBoardFromLayer(board.id);
                else closeEvent();
              }}
              onClose={closeEvent}
            />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The 11.3 header, 52px + `env(safe-area-inset-top)`: Back (44px circle,
 * `aria-label="Back to Messages"`), the 40px club avatar (the logo, or
 * initials on `clubGradient`), the `<h1>` name 20px/800 Fraunces on one line,
 * `Your hat: … · N members`, and the club-page link (`aria-label="Open
 * <club>'s page"` → `/orgs/<handle>`; 14.15). Bars and discs while the space
 * read is out. Mockup chrome from `W0_Club:15-27` (MK:0.2).
 */
function ClubHeader({ night, onClose, orgHandle, space }: { night: boolean; onClose: () => void; orgHandle: string; space: SpaceResponse | null }) {
  const t = palette(night);
  const circle: React.CSSProperties = {
    width: 44,
    height: 44,
    flexShrink: 0,
    boxSizing: "border-box",
    borderRadius: 999,
    border: night ? "1px solid rgba(255,255,255,0.10)" : `1px solid ${t.hairline}`,
    background: night ? "rgba(22,21,21,0.86)" : t.surface,
    color: t.secondary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
  };
  const org = space?.org ?? null;
  return (
    <header style={{ flexShrink: 0, boxSizing: "border-box", height: "calc(52px + env(safe-area-inset-top, 0px))", padding: "calc(env(safe-area-inset-top, 0px) + 4px) 10px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" aria-label="Back to Messages" onClick={onClose} style={circle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      {org ? (
        <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: org.logo_url ? `url(${org.logo_url}) center/cover` : clubGradient(org.id), boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 800, fontSize: 15.5, color: "#FAF7F2" }}>
          {org.logo_url ? null : initialsOf(org.name)}
        </span>
      ) : (
        <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: SKELETON_DISC }} />
      )}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: space ? 3 : 6 }}>
        {space && org ? (
          <>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 800, fontSize: 20, lineHeight: 1.1, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.ink }}>{org.name}</h1>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.secondary }}>
              {`Your hat: ${roleWord(space.viewer.role)}`}
              <span style={{ color: t.muted }}>{` · ${countWord(org.member_count, "member")}`}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: "55%", height: 18, borderRadius: 6, background: SKELETON_BAR }} />
            <div style={{ width: "40%", height: 11, borderRadius: 5, background: SKELETON_BAR_SOFT }} />
          </>
        )}
      </div>
      {org ? (
        <Link href={`/orgs/${encodeURIComponent(orgHandle)}`} aria-label={`Open ${org.name}'s page`} style={circle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </Link>
      ) : (
        <span aria-hidden="true" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, background: SKELETON_DISC }} />
      )}
    </header>
  );
}

/** The chips row (45px, three pills) and three bars, until the space read answers (11.3 States). */
function ClubBodySkeleton() {
  return (
    <div aria-hidden="true" style={{ flexGrow: 1, minWidth: 0 }}>
      <div style={{ height: 45, boxSizing: "border-box", padding: "7px 12px 8px", display: "flex", gap: 5 }}>
        {[70, 74, 90].map((w, i) => (
          <div key={i} style={{ width: w, height: 30, borderRadius: 999, background: SKELETON_DISC }} />
        ))}
      </div>
      <div style={{ padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: ["85%", "60%", "72%"][i], height: 14, borderRadius: 6, background: i === 1 ? SKELETON_BAR_SOFT : SKELETON_BAR }} />
        ))}
      </div>
    </div>
  );
}
