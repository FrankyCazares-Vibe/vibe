"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { CALENDAR_CHANGED_EVENT, emitCalendarChanged } from "@/components/LeftNav";
import { threadAvatar, threadTitle } from "@/components/mobile/messages/format";
import type { WeekEntry } from "@/components/mobile/messages/home/home-rules";
import { useHomeData } from "@/components/mobile/messages/home/MessagesHome";
import { ChatSurfaceContext } from "@/components/mobile/messages/surface";
import { useNightTheme } from "@/components/mobile/messages/theme";
import type { ThreadEntry } from "@/components/mobile/messages/types";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import type { InboxClub } from "@/lib/chat/types";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ClubPane } from "./ClubPane";
import type { ClubPaneProps, LegacyThreadPaneHandle, MessagesDesktopProps } from "./contracts";
import { desktopLayerOpen } from "./DesktopDialog";
import { knownChat, type OpenChat, panelMode, slimRows, type SlimRow } from "./desktop-rules";
import type { DmPageEvent } from "./dm-bridge";
import { InboxWide } from "./InboxWide";
import { LegacyThreadPane } from "./LegacyThreadPane";
import { NewChatDialog } from "./NewChatDialog";
import { PinsPanel } from "./PinsPanel";
import { SlimList } from "./SlimList";
import { type DesktopOpen, useDesktopOpen } from "./use-desktop-open";
import { WeekBand } from "./WeekBand";

/**
 * Messages on a laptop, for people with the `chat_desktop` switch
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 3.2, 3.5, 4.1, 5.4;
 * W3-4-shell). `MessagesSwitch` mounts it, client-only, inside
 * `CampusAppShell` once the viewport is known; the left nav and My Calendar
 * are not touched.
 *
 * The shell holds: the ONE `useHomeData` (the band, the wide list and the
 * slim list all draw from it, so going home and opening a chat never read
 * twice); what is open (`use-desktop-open.ts`: the address and history);
 * the one dm frame; the Pinned and Shared panel's open state; and
 * `refreshKey`.
 *
 *   WeekBand            76 tall at home, 44 folded while a chat is open
 *   body row            home:  InboxWide | the empty stage
 *                       open:  SlimList (232) | the pane | Pinned and Shared (288)
 *
 * The pane box is the same element at home and with a chat open, and the dm
 * frame (`LegacyThreadPane`) lives in it from its mount to the page's end:
 * an iframe that moves in the tree loads again. The frame is mounted once
 * BOTH list reads have settled (an answer or a failure: a failed inbox must
 * not leave a dm deep link without a frame), or at once when the address
 * names a chat or carries `?to=`.
 *
 * `refreshKey` moves (4.1) when a chat is closed or switched, when a dm or
 * group is created, when the page says `list-changed`, `read`, `activity`
 * or `closed`, and when `ClubPane` says the lists changed. The page's
 * chatter is gathered: a send is `activity` + `list-changed`, an arrival
 * `activity` + `read`, and each move is three reads.
 */

/** The Pinned and Shared panel's width (4d.5). */
const PINS_WIDTH = 288;

/** The page's `read` / `activity` / `list-changed` within this long are one list read. */
const PAGE_BUMP_MS = 600;

/** After the shell asked the page to open a chat again, the page's next "it is gone" within this long stands. */
const REOPEN_GAP_MS = 60_000;

/** The line of a chat that would not open (3.5 rule 1); here only the name a quiet read needs. */
const OPEN_FAILED = "Couldn't open this chat.";

/** `?to=` that could not be opened (the phone's line for the same link). */
const TO_FAILED = "Couldn't open that conversation.";

/** The toast of a chat lost while open (6.5). */
const CHAT_LOST = "That chat isn't available anymore.";

/** `?to=<handle>` of the live address, lower-cased; null when the address names a chat (that wins) or has none. The prop only when the address cannot be read. */
function liveTo(prop: string | undefined): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel")?.trim()) return null;
    return params.get("to")?.trim().toLowerCase() || null;
  } catch {
    return prop?.trim().toLowerCase() || null;
  }
}

/** True while the live address still carries `?to=` (3.5 rule 7). */
function addressHasTo(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("to");
  } catch {
    return false;
  }
}

/**
 * The chat on screen as one word, for "a chat was closed or switched". A
 * club is one chat whatever its room (a chip is not a switch); null at home
 * and while an id is still resolving.
 */
function chatKey(open: DesktopOpen): string | null {
  if (open.kind === "club") return `club:${open.orgHandle.toLowerCase()}`;
  if (open.kind === "dm") return `dm:${open.threadId}`;
  return null;
}

/** A dialog is up: a `DesktopDialog` / `DesktopPopover`, or one of the two older modals that are not counted there (3.5 rule 9). */
function layerUp(): boolean {
  return desktopLayerOpen() || document.querySelector('[aria-modal="true"]') !== null;
}

type ClubOrg = Parameters<ClubPaneProps["onOrg"]>[0];

/** The home's right side (3.2). */
function EmptyStage({ t }: { t: Palette }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, textAlign: "center" }}>
      <h2 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", color: t.ink }}>Pick up where you left off.</h2>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: t.muted }}>Choose a chat or a club from your list.</p>
    </div>
  );
}

const BAR = "rgba(var(--scrim-rgb),0.06)";

/** The pane while an id is still resolving into a club room or a dm (3.2): a header and a few bubbles, CSS variables only. */
function PaneSkeleton({ t }: { t: Palette }) {
  const bubble = (width: string, mine: boolean) => (
    <div style={{ alignSelf: mine ? "flex-end" : "flex-start", width, maxWidth: 520, height: 38, borderRadius: 18, background: BAR }} />
  );
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", borderBottom: `1px solid ${t.hairline}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: BAR, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ width: 160, maxWidth: "60%", height: 14, borderRadius: 6, background: BAR, marginBottom: 7 }} />
          <div style={{ width: 96, maxWidth: "40%", height: 11, borderRadius: 5, background: BAR }} />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, padding: 24 }}>
        {bubble("38%", false)}
        {bubble("27%", true)}
        {bubble("46%", false)}
        {bubble("22%", true)}
      </div>
    </div>
  );
}

export function MessagesDesktop({ initialHandle, initialChannelId }: MessagesDesktopProps) {
  const night = useNightTheme();
  const t = palette(night);
  // Moved after a chat closes or changes, and when the lists changed under us (4.1).
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  // The lists as the home last read them, for the callbacks that must not
  // change with every render (`known`, `onThreads`).
  const listsRef = useRef<{ threads: ThreadEntry[] | null; requests: ThreadEntry[] | null; clubs: InboxClub[] | null }>({ threads: null, requests: null, clubs: null });
  const known = useCallback((id: string) => knownChat(id, listsRef.current.threads, listsRef.current.requests, listsRef.current.clubs), []);
  const { open, filter, setFilter, openThread, openClub, openById, switchRoom, goHome, fail } = useDesktopOpen({ initialChannelId, known });
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // False once the shell is gone (another page, or the phone tree under
  // 900px): the two awaits below then answer into nothing. The hook guards
  // its own calls the same way (`onPage`); this covers what the shell does
  // around them (a toast, a bump, the frame's reopen).
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 3.5 rule 7. Read once, from the live address: a restored page's props
  // are the first address's.
  const [firstTo] = useState(() => liveTo(initialHandle));
  const pendingToRef = useRef<string | null>(firstTo);
  /**
   * `?to=<handle>` on the first `threads` answer (a failed first load still
   * resolves through the POST, which finds an existing dm too): a dm with
   * that person in the list, else `POST /api/me/threads { handle }`. The
   * chat then takes the arrival entry over (`use-desktop-open.ts`, rule 7),
   * so `to` leaves the address. Dropped when the address no longer carries
   * `to` (the person opened something else, or picked a filter, meanwhile).
   */
  const resolveTo = useCallback(
    async (threads: ThreadEntry[] | null) => {
      const handle = pendingToRef.current;
      if (!handle || !aliveRef.current) return;
      pendingToRef.current = null;
      if (!addressHasTo()) return;
      const existing = (threads ?? []).find((th) => th.type === "dm" && th.peer?.handle?.toLowerCase() === handle);
      if (existing) {
        openThread(existing.id);
        return;
      }
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", { json: { handle }, quiet: true, failure: TO_FAILED });
      // The shell left while the POST was out (a fresh `/messages?to=` may be on screen: its address is not ours to read).
      if (!aliveRef.current || !addressHasTo()) return;
      if (!r.ok) {
        // A refusal: its own sentence, and the home on `/messages`.
        fail(r.message);
        return;
      }
      const channelId = r.data?.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        fail(`${TO_FAILED} Try again.`);
        return;
      }
      bump();
      openThread(channelId);
    },
    [bump, fail, openThread],
  );
  // Stable (its deps never change): an inline arrow would re-run the home's reads on every render.
  const onThreads = useCallback(
    (threads: ThreadEntry[] | null, requests: ThreadEntry[] | null) => {
      listsRef.current = { ...listsRef.current, threads, requests };
      void resolveTo(threads);
    },
    [resolveTo],
  );

  const data = useHomeData(refreshKey, onThreads);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
    listsRef.current = { threads: data.threads, requests: data.requests, clubs: data.clubs };
  });

  // An RSVP made anywhere on the page (an event card, the club panel, My
  // Calendar): the week on screen is read again (1.2 S11).
  useEffect(() => {
    const onCalendar = () => {
      const d = dataRef.current;
      void d.refreshWeek(d.range);
    };
    window.addEventListener(CALENDAR_CHANGED_EVENT, onCalendar);
    return () => window.removeEventListener(CALENDAR_CHANGED_EVENT, onCalendar);
  }, []);

  // `contentWidth` (3.2): the body row's width, from the one observer of the
  // shell. In a layout effect, so the first answer lands before the first paint.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setContentWidth(Math.round(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The page's chatter, gathered into one move of `refreshKey`.
  const bumpTimerRef = useRef<number | null>(null);
  const bumpSoon = useCallback(() => {
    if (bumpTimerRef.current !== null) return;
    bumpTimerRef.current = window.setTimeout(() => {
      bumpTimerRef.current = null;
      bump();
    }, PAGE_BUMP_MS);
  }, [bump]);
  useEffect(
    () => () => {
      if (bumpTimerRef.current !== null) window.clearTimeout(bumpTimerRef.current);
      bumpTimerRef.current = null;
    },
    [],
  );

  // Pinned and Shared (4d.5; design point 10: hidden until asked for).
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinsToken, setPinsToken] = useState(0);
  const [missedId, setMissedId] = useState<string | null>(null);
  const pinsOpenRef = useRef(false);

  // What is open changed. A chat was closed or switched: the lists again
  // (4.1). And the panel is closed on every change (3.5's table). Worked out
  // while rendering, from the last key seen, so nothing paints in between.
  const key = chatKey(open);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    if (seenKey !== null) setRefreshKey((k) => k + 1);
    setPinsOpen(false);
    setMissedId(null);
  }

  // The frame's mount (5.4), latched: Retry on a failed list clears the
  // failure, and the frame must not go with it.
  const settled = (data.threads !== null || data.threadsErr !== null) && (data.clubs !== null || data.clubsErr !== null);
  const [frameOn, setFrameOn] = useState(() => open.kind !== "home" || firstTo !== null);
  if (!frameOn && (settled || open.kind !== "home")) setFrameOn(true);

  const paneRef = useRef<LegacyThreadPaneHandle | null>(null);
  // True for one commit: the frame is told `close`, then `open` again (the
  // pane sends `open` only when its `threadId` changes).
  const [frameHold, setFrameHold] = useState(false);
  useEffect(() => {
    if (!frameHold) return;
    const timer = window.setTimeout(() => setFrameHold(false), 0);
    return () => window.clearTimeout(timer);
  }, [frameHold]);
  const reopenRef = useRef<{ id: string; at: number } | null>(null);

  /**
   * The page says the open chat is gone (`open-failed`, `closed: lost`).
   * Its word rests on its own list read, and `GET /api/me/threads` can
   * answer 200 with a chat missing (a soft failure on the server): one short
   * list is not "this chat is gone". So the thread itself is asked. When it
   * still answers, the page is told to open the chat again, once; a second
   * "gone" within REOPEN_GAP_MS stands. When it refuses, or cannot be
   * asked, the page's word stands and `leave` runs.
   */
  const pageGaveUp = useCallback(async (threadId: string, leave: () => void) => {
    const r = await vibeRequest<unknown>(`/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=1`, {
      cache: "no-store",
      quiet: true,
      failure: OPEN_FAILED,
    });
    // The person moved on while the read was out, or the shell is gone: nothing to leave.
    const now = openRef.current;
    if (!aliveRef.current || now.kind !== "dm" || now.threadId !== threadId) return;
    const last = reopenRef.current;
    if (r.ok && !(last && last.id === threadId && Date.now() - last.at < REOPEN_GAP_MS)) {
      reopenRef.current = { id: threadId, at: Date.now() };
      setFrameHold(true);
      return;
    }
    leave();
  }, []);

  // The page is told after every change of the panel, its closing with its
  // chat included: the header button shows pressed while the panel is open,
  // and `open: true` closes the page's Chat info (5.3). After the pane's own
  // effect, so a `panel-state` never runs ahead of the `open` it belongs to.
  useEffect(() => {
    pinsOpenRef.current = pinsOpen;
    paneRef.current?.setPanel(pinsOpen);
  }, [pinsOpen]);

  // What the page says (5.4). `ready` and `opened` write nothing: the
  // address already names the chat. An event about a chat that is no longer
  // the open one is not acted on (a message already posted can cross a click
  // on another name).
  const [opened, setOpened] = useState<{ channelId: string; group: boolean } | null>(null);
  const onEvent = useCallback(
    (event: DmPageEvent) => {
      const now = openRef.current;
      const threadId = now.kind === "dm" ? now.threadId : null;
      switch (event.type) {
        case "opened":
          setOpened({ channelId: event.channelId, group: event.kind === "group" });
          return;
        case "open-failed":
          if (event.channelId === threadId) void pageGaveUp(event.channelId, () => fail(event.message));
          return;
        case "read":
        case "activity":
        case "list-changed":
          bumpSoon();
          return;
        case "closed":
          // Another chat's (declined, left a moment ago): only the lists changed.
          if (event.channelId !== threadId) {
            bumpSoon();
            return;
          }
          // Going home moves `refreshKey` by itself (a chat was closed).
          if (event.reason !== "lost") {
            goHome();
            return;
          }
          void pageGaveUp(event.channelId, () => {
            goHome();
            toast({ message: CHAT_LOST, tone: "error" });
          });
          return;
        case "escape":
          // 3.5 rule 9, from inside the frame: the page closed what it had first.
          if (threadId !== null && !layerUp()) goHome();
          return;
        case "info-opened":
          // One right panel at a time on a dm (1.3 K13).
          setPinsOpen(false);
          return;
        case "pins-toggle":
          if (event.channelId === threadId) setPinsOpen(!pinsOpenRef.current);
          return;
        case "pins-changed":
          if (event.channelId === threadId) setPinsToken((n) => n + 1);
          return;
        case "jump-missed":
          setMissedId(event.messageId);
          return;
        default:
          return;
      }
    },
    [bumpSoon, fail, goHome, pageGaveUp],
  );

  // The open chat as the slim list names it: from the lists; else, for a
  // club the inbox does not list, from the resolving read or from what
  // `ClubPane` reported; for a dm the lists do not hold (a request, a chat
  // made a moment ago), from the page's `opened`. Null while resolving.
  const [clubOrg, setClubOrg] = useState<ClubOrg | null>(null);
  const openChat = useMemo<OpenChat | null>(() => {
    if (open.kind === "club") {
      const handle = open.orgHandle.toLowerCase();
      const org =
        (data.clubs ?? []).find((c) => c.org.handle.toLowerCase() === handle)?.org ??
        (clubOrg && clubOrg.handle.toLowerCase() === handle ? clubOrg : null) ??
        open.initialPage?.room?.org ??
        null;
      return { kind: "club", orgId: org?.id ?? null, orgHandle: open.orgHandle, name: org?.name ?? open.orgHandle, logoUrl: org?.logo_url ?? null, roomId: open.roomId };
    }
    if (open.kind === "dm") {
      const thread = (data.threads ?? []).find((th) => th.id === open.threadId) ?? (data.requests ?? []).find((th) => th.id === open.threadId) ?? null;
      if (thread) return { kind: "dm", threadId: open.threadId, name: threadTitle(thread), avatarUrl: threadAvatar(thread).url, group: thread.type !== "dm" };
      return { kind: "dm", threadId: open.threadId, name: "", avatarUrl: null, group: opened?.channelId === open.threadId && opened.group };
    }
    return null;
  }, [open, data.clubs, data.threads, data.requests, clubOrg, opened]);
  const rows = useMemo(
    () => slimRows(data.clubs ?? [], data.threads ?? [], data.requests ?? [], openChat, data.now),
    [data.clubs, data.threads, data.requests, data.now, openChat],
  );

  const [newOpen, setNewOpen] = useState(false);
  const openNew = useCallback(() => setNewOpen(true), []);
  const closeNew = useCallback(() => setNewOpen(false), []);
  // A dm or a group was made: the lists again, and the chat opens. From the
  // home the dialog's own entry becomes the chat's (rule 2's replace).
  const onCreated = useCallback(
    (channelId: string) => {
      bump();
      openThread(channelId);
      setNewOpen(false);
    },
    [bump, openThread],
  );
  // A week card or a plan row of the month. The entry names its club when it
  // can (the phone's `openRoom`): the club opens at once, with no shell read,
  // and a club already open keeps its pane (its draft, its panel) and only
  // changes room. With no club named the room resolves like a deep link (one
  // read, reused as its first page).
  const onOpenRoom = useCallback(
    (entry: WeekEntry) => {
      if (!entry.room_id) return;
      const handle = entry.org?.handle;
      if (!handle) {
        openById(entry.room_id);
        return;
      }
      // The open club under its own spelling of the handle: the pane is keyed by it.
      const now = openRef.current;
      if (now.kind === "club" && now.orgHandle.toLowerCase() === handle.toLowerCase()) switchRoom(entry.room_id, "event");
      else openClub(handle, entry.room_id, "event");
    },
    [openById, openClub, switchRoom],
  );
  const onOpenRow = useCallback(
    (row: SlimRow) => {
      // The open row opens nothing; its target's room kind is a placeholder (desktop-rules.ts).
      if (row.open) return;
      if (row.target.kind === "club") openClub(row.target.orgHandle, row.target.roomId, row.target.roomKind);
      else openThread(row.target.threadId);
    },
    [openClub, openThread],
  );
  // `ClubPane`: a later 403 / 404 on the club or its room.
  const onLost = useCallback(
    (message: string) => {
      goHome();
      toast({ message, tone: "error" });
    },
    [goHome],
  );
  // Each space read reports the club again: keep the object while nothing in it moved.
  const onOrg = useCallback((org: ClubOrg) => {
    setClubOrg((was) =>
      was && was.id === org.id && was.handle === org.handle && was.name === org.name && was.logo_url === org.logo_url
        ? was
        : { id: org.id, handle: org.handle, name: org.name, logo_url: org.logo_url },
    );
  }, []);
  const closePins = useCallback(() => setPinsOpen(false), []);
  const onJump = useCallback((messageId: string) => {
    // A second miss of the same message is a new answer for the panel.
    setMissedId(null);
    paneRef.current?.jump(messageId);
  }, []);
  const onPinsChanged = useCallback(() => paneRef.current?.pinsChanged(), []);

  const home = open.kind === "home";
  // Fits: a column beside the thread. Does not: over the thread, since it was opened by a click (3.4).
  const pinsMode = open.kind === "dm" && pinsOpen ? panelMode(contentWidth, PINS_WIDTH, null, true) : "hidden";

  return (
    <ChatSurfaceContext.Provider value="desktop">
      <div style={{ minWidth: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: t.page, color: t.ink, fontFamily: FONT }}>
        <WeekBand data={data} folded={!home} night={night} onOpenRoom={onOpenRoom} />
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
          {/* The list is a flex item of this row by its own root: `flex: 0 1 520px` wide, `0 0 232px` tucked (3.2). */}
          {home ? (
            <InboxWide data={data} filter={filter} night={night} onFilter={setFilter} onOpenClub={openClub} onOpenThread={openThread} onNew={openNew} />
          ) : (
            <SlimList rows={rows} night={night} onHome={goHome} onOpen={onOpenRow} />
          )}
          {/* The pane: one box for the page's life, so the frame in it is never remounted. */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
            {home ? <EmptyStage t={t} /> : null}
            {open.kind === "resolving" ? <PaneSkeleton t={t} /> : null}
            {open.kind === "club" ? (
              // The club fills the pane: `ClubPane`'s root is the one item of this row (its own right panel is inside it).
              <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                <ClubPane
                  key={open.orgHandle}
                  orgHandle={open.orgHandle}
                  roomId={open.roomId}
                  roomKind={open.roomKind}
                  initialPage={open.initialPage}
                  night={night}
                  contentWidth={contentWidth}
                  onSwitchRoom={switchRoom}
                  onLost={onLost}
                  onOrg={onOrg}
                  onListsChanged={bump}
                  onRsvpChanged={emitCalendarChanged}
                />
              </div>
            ) : null}
            {frameOn ? <LegacyThreadPane ref={paneRef} threadId={open.kind === "dm" && !frameHold ? open.threadId : null} night={night} onEvent={onEvent} /> : null}
          </div>
          {/* The panel's 288px box: a column beside the thread, or over it (no scrim) at the row's right edge.
              One element in both modes, so a resize never remounts the panel. `PinsPanel`'s root is its one item. */}
          {open.kind === "dm" && pinsMode !== "hidden" ? (
            <div
              style={{
                display: "flex",
                minHeight: 0,
                width: PINS_WIDTH,
                background: t.page,
                ...(pinsMode === "side" ? { flex: `0 0 ${PINS_WIDTH}px`, position: "relative" } : { position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 2 }),
              }}
            >
              <PinsPanel
                threadId={open.threadId}
                title={rows.find((row) => row.open)?.name ?? ""}
                night={night}
                mode={pinsMode}
                refreshToken={pinsToken}
                missedId={missedId}
                onClose={closePins}
                onJump={onJump}
                onChanged={onPinsChanged}
              />
            </div>
          ) : null}
        </div>
        {newOpen ? <NewChatDialog night={night} onClose={closeNew} onCreated={onCreated} /> : null}
      </div>
    </ChatSurfaceContext.Provider>
  );
}
