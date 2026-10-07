"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { arrivalWrites, channelOfEntry } from "@/lib/chat/layer-stack";
import type { RoomKind, ThreadMessagesResponse } from "@/lib/chat/types";
import { useChatV2 } from "@/lib/chat/use-chat-v2";
import { adoptLayerEntry, clearLayersInto, clearLayersThen, isLayerPop } from "@/lib/chat/use-layer-history";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ClubSpace } from "./messages/club/ClubSpace";
import { ComposeOverlay } from "./messages/ComposeOverlay";
import { ConversationView } from "./messages/ConversationView";
import { type HomeFilter, homeUrl, parseHomeFilter } from "./messages/home/home-rules";
import { MINI_SOURCE } from "@/components/desktop/messages/MiniFrame";

import { MessagesHome } from "./messages/home/MessagesHome";
import { useNightTheme } from "./messages/theme";
import { EmptyState, ListSkeleton, TabPill, ThreadRow } from "./messages/ThreadList";
import { type Tab, type ThreadEntry } from "./messages/types";

/**
 * /messages on the phone (handoffs/chat-redesign/wave-2-contracts.md 2.1,
 * 2.3, 11.10; W2-S1). One export, three states of the `chat_v2` flag:
 *
 *   - `null` (the flag not answered yet): a bare header — `Messages` as
 *     today, the pencil, no pills — and the list skeleton, nothing else
 *     (`FlagPending`; SCREENS-L12). Never one list and then the other.
 *   - `true`: the Messages home (`messages/home/MessagesHome`) under the
 *     flag-on shell (`MessagesMobileV2`): the open view (a club space or a
 *     conversation), `?channel=` resolved through the thread GET, `?to=` as
 *     today, `?tab=` for the filter, one history entry per layer with the
 *     ONE `popstate` handler for the layers this file owns (2.3; the event
 *     chat layer inside `ClubSpace` is W2-S2's, S2-notes.md R1–R3).
 *   - `false` (or the flag read failing — fail closed): today's list,
 *     unchanged, in `MessagesMobileV1` below: All / Requests tabs, each row
 *     avatar + title + preview + relative time + unread dot, the conversation
 *     view sliding over it, no history writes (MM:5.3).
 *
 * Desktop never asks the flag (`MessagesSwitch.tsx` keeps the iframe).
 *
 * Data:
 *   - GET /api/me/features → { ok, chat_v2 } (the flag, once per mount)
 *   - GET /api/me/threads → { threads, requests } (the old list)
 *   - GET /api/me/threads?scope=chats, /api/me/inbox, /api/me/calendar (the home)
 *   - GET /api/me/threads/[id]/messages → { room, ... } (a ?channel= deep link)
 *   - POST /api/me/threads → resolve ?to=<handle> to a DM channel
 */

// Coming back to the app re-syncs the thread list at most this often: iOS
// fires visibilitychange for every glance at the lock screen.
const LIST_RESYNC_MS = 30_000;

export function MessagesMobile({
  initialHandle,
  initialChannelId,
  mini = false,
}: {
  initialHandle?: string;
  initialChannelId?: string;
  /** The small Messages window over a desktop page (MiniFrame): the home has no header; the window's own pencil opens compose. */
  mini?: boolean;
}) {
  // The one hook before the fork; each branch is its own component with its
  // own hooks, so no list mounts under another (2.1).
  const chatV2 = useChatV2();
  if (chatV2 === null) return <FlagPending />;
  if (chatV2) return <MessagesMobileV2 initialHandle={initialHandle} initialChannelId={initialChannelId} mini={mini} />;
  return <MessagesMobileV1 initialHandle={initialHandle} initialChannelId={initialChannelId} />;
}

/**
 * While the flag is unknown (2.1): the old header's chrome with `Messages`
 * at 28px/900 and the pencil, NO pills, and `ListSkeleton`. The flag answers
 * within one request; the pencil has nothing to open until then.
 */
function FlagPending() {
  const night = useNightTheme();
  return (
    <main style={{ background: "var(--feed-backdrop)", minHeight: "100dvh" }}>
      <header
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px",
          background: night ? "var(--tabbar-bg)" : "rgba(250, 247, 242, 0.86)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 900, letterSpacing: "-0.8px", color: "var(--charcoal)", margin: 0 }}>Messages</h1>
          <span
            role="button"
            aria-label="New message"
            aria-disabled="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "1px solid rgba(var(--scrim-rgb),0.10)",
              background: night ? "var(--paper-70)" : "rgba(255,255,255,0.78)",
              color: "var(--charcoal)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path d="M14.5 3.5l4 4-10 10H4v-4.5l10.5-9.5z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
              <path d="M13 5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      </header>
      <div style={{ padding: "8px 0 24px" }}>
        <ListSkeleton />
      </div>
    </main>
  );
}

/** 11.10: the open view above the home. The event chat layer's id lives inside `ClubSpace`. */
type OpenView =
  /** `initialPage`: a resolving read's body (2.3), so the deep-linked room is read once (INT-ADJUDICATE-5). */
  | { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind; initialPage?: ThreadMessagesResponse }
  | { kind: "thread"; threadId: string };

type HistoryMark = { vibeChat?: unknown; depth?: unknown };

/** 2.3's state on a history entry: `{ vibeChat: <id>, depth: n }`; 0 for an entry that is not a layer. */
function depthOf(state: unknown): number {
  const s = state as HistoryMark | null;
  if (!s || typeof s !== "object" || typeof s.vibeChat !== "string") return 0;
  const n = Number(s.depth);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const channelUrl = (id: string) => `/messages?channel=${encodeURIComponent(id)}`;

/**
 * What the LIVE entry says is open (S71 amendment 3, B): `?channel=<id>` in
 * the address, else a `{ vibeChat, depth >= 1 }` state. Never the server
 * prop: after a link out and Back, Next hands back the page it rendered for
 * the first address, while the address and the state are the room's.
 * `undefined` when the address cannot be read at all.
 */
function liveChannel(state: unknown): string | null | undefined {
  let search: string;
  try {
    search = window.location.search;
  } catch {
    return undefined;
  }
  return channelOfEntry(search, state);
}

/** False only when the browser says there is no entry behind this one (the Navigation API; absent → unknown → true). */
function canGoBack(): boolean {
  try {
    const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
    return nav?.canGoBack !== false;
  } catch {
    return true;
  }
}

/** How long a header Back waits for its `popstate` before closing in place (nothing was behind the entry). */
const BACK_FALLBACK_MS = 600;

/**
 * The flag-on shell (2.1 `true`; 2.3; 11.10). Keeps the open view, the
 * compose overlay, the deep links and the history; `MessagesHome` keeps the
 * reads and the list and reports the dm/group lists up for `?to=` and the
 * open conversation's entry.
 *
 * History (2.3, open point 14.21): opening a layer from the home is one
 * `pushState({ vibeChat: <id>, depth: 1 }, "", "/messages?channel=<id>")`;
 * Back and the drawer's swipe call `history.back()`; the `popstate` handler
 * below is the one place that unmounts a depth-1 layer (it reads
 * `event.state?.depth ?? 0` and closes when that is below 1). The event chat
 * layer (depth 2) is pushed and popped by `ClubSpace` (W2-S2; S2-notes.md
 * R1–R3), so a `popstate` at depth 1 is not this handler's. A deep link
 * opens on the entry the browser already holds (`replaceState` depth 1; for
 * an event room a `pushState` depth 2 follows), so Back from a deep-linked
 * space leaves `/messages`, Back from a deep-linked event chat lands on the
 * space.
 *
 * S71 amendment 3 (audit F06, F07):
 * - A sheet, the "+" tray or a confirm on the new screens has its own entry
 *   on top of the room's (`src/lib/chat/use-layer-history.ts`): Back closes
 *   it alone. A `popstate` that was one of those closing is not this
 *   handler's (`isLayerPop`), and every history write or `history.back()`
 *   here goes through `clearLayersThen`, so a sheet still open is closed
 *   first and leaves no entry behind.
 * - What is open follows the LIVE entry, not the server prop: on mount (the
 *   first load, and Next restoring this page after a link out to a club
 *   page, a profile or a post) and on a `popstate` with nothing open, the
 *   room named by `?channel=<id>` or by a `{ vibeChat, depth >= 1 }` state
 *   is opened again (`openFromEntry`); an event room's depth-2 entry opens
 *   the space with the event chat on top and writes nothing. `initialHandle`
 *   counts only while the address still carries `?to=`; `initialChannelId`
 *   only when the address cannot be read.
 * - A header Back whose `history.back()` brings no `popstate` (nothing was
 *   behind the entry) closes in place after BACK_FALLBACK_MS.
 */
function MessagesMobileV2({ initialHandle, initialChannelId, mini = false }: { initialHandle?: string; initialChannelId?: string; mini?: boolean }) {
  const searchParams = useSearchParams();
  const [filter, setFilterState] = useState<HomeFilter>(() => parseHomeFilter(searchParams.get("tab")));
  const [open, setOpen] = useState<OpenView | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // The small window's pencil sits in the window's own title bar, outside
  // this frame: it asks for compose with a message (MINI_SOURCE).
  useEffect(() => {
    if (!mini) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: unknown; type?: unknown } | null;
      if (data && data.source === MINI_SOURCE && data.type === "compose") setComposeOpen(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mini]);
  // Bumped after a view closes: the home reads its lists again (11.10).
  const [refreshKey, setRefreshKey] = useState(0);
  const [lists, setLists] = useState<{ threads: ThreadEntry[] | null; requests: ThreadEntry[] | null }>({ threads: null, requests: null });
  // Read once, on mount (2.3): a later render of the page never re-opens
  // them. The channel is the fallback only; the live entry decides (B).
  const [firstChannelId] = useState(initialChannelId ?? null);
  const pendingHandleRef = useRef<string | null>(initialHandle ? initialHandle.toLowerCase() : null);
  const filterRef = useRef(filter);
  const openRef = useRef<OpenView | null>(null);
  const listsRef = useRef(lists);
  // Bumped by every deep link the page acts on and by every open or close
  // the user makes, so a lookup still in flight knows a later owner has
  // taken over and drops its answer.
  const deepLinkSeqRef = useRef(0);
  // True while the open depth-1 layer sits on a deep link's entry with no
  // entry behind it (a fresh tab from a push tap): `history.back()` would be
  // a no-op there, so Back closes in place. `history.length` cannot tell at
  // Back time — it counts forward entries too, and the event layer's Back
  // leaves one.
  const noBackRef = useRef(false);
  // This page's own path while the shell is mounted. A `popstate` that
  // leaves `/messages` still reaches the handler below before Next unmounts
  // the page, and a lookup can answer after it: neither may open a room or
  // write on another page's history entry.
  const pagePathRef = useRef<string | null>(null);
  useEffect(() => {
    pagePathRef.current = window.location.pathname;
    return () => {
      pagePathRef.current = null;
    };
  }, []);
  const onThisPage = useCallback(() => pagePathRef.current !== null && window.location.pathname === pagePathRef.current, []);

  const setFilter = useCallback((f: HomeFilter) => {
    filterRef.current = f;
    setFilterState(f);
    // The depth-0 entry carries the filter, so the URL after the last close
    // is `/messages` or `/messages?tab=<filter>` (2.3).
    if (!openRef.current) window.history.replaceState(window.history.state, "", homeUrl(f));
  }, []);

  /** A layer opened from the home: one entry at depth 1 (a swap when one is already open). */
  const openView = useCallback((view: OpenView) => {
    deepLinkSeqRef.current += 1;
    const id = view.kind === "club" ? view.roomId : view.threadId;
    const mark = { vibeChat: id, depth: 1 };
    const swap = openRef.current !== null;
    if (swap) {
      // A sheet of the view being swapped out has its own entry on top: it
      // goes first (`clearLayersThen` runs at once when there is none).
      clearLayersThen(() => window.history.replaceState(mark, "", channelUrl(id)));
    } else {
      // From the home. The home's month sheet (S71 amendment 4) has its own
      // entry on top of the home's: a plan row opens its room with the sheet
      // up, and that entry BECOMES the room's (`replaceState`). Never a step
      // back off the sheet and then a push: Chrome would mark the home's
      // entry to be skipped by its Back button (`layer-stack.ts`, the note
      // on the history-manipulation intervention; ClubSpace's `openEvent`
      // does the same over the "+" tray). No sheet open: a push, as before.
      clearLayersInto((mode) => {
        if (mode === "replace") window.history.replaceState(mark, "", channelUrl(id));
        else window.history.pushState(mark, "", channelUrl(id));
        noBackRef.current = false;
      });
    }
    openRef.current = view;
    setComposeOpen(false);
    setOpen(view);
  }, []);

  // Armed by a header Back that called `history.back()`; any `popstate`
  // disarms it. Still armed after BACK_FALLBACK_MS = nothing was behind the
  // entry (a reload or a restore of a fresh tab's deep link): close in place.
  const backTimerRef = useRef<number | null>(null);
  const clearBackTimer = useCallback(() => {
    if (backTimerRef.current === null) return;
    window.clearTimeout(backTimerRef.current);
    backTimerRef.current = null;
  }, []);
  useEffect(() => clearBackTimer, [clearBackTimer]);

  /** The home again with nothing open; the URL back to the home's. */
  const closeInPlace = useCallback(() => {
    clearBackTimer();
    deepLinkSeqRef.current += 1;
    noBackRef.current = false;
    openRef.current = null;
    setOpen(null);
    setRefreshKey((k) => k + 1);
    window.history.replaceState(null, "", homeUrl(filterRef.current));
  }, [clearBackTimer]);

  /** Back / the swipe on a depth-1 layer: `history.back()`; `popstate` closes (2.3). */
  const closeLayer = useCallback(() => {
    // A sheet or the tray still open on top (its own entry) closes first.
    clearLayersThen(() => {
      // One Back at a time: a second tap before the first one's `popstate`
      // would step back twice.
      if (backTimerRef.current !== null || openRef.current === null) return;
      // A deep link in a fresh tab has nowhere to go back to (`noBackRef`,
      // or the browser saying so): close in place instead of leaving the
      // view stuck.
      if (depthOf(window.history.state) < 1 || noBackRef.current || !canGoBack()) {
        closeInPlace();
        return;
      }
      const view = openRef.current;
      window.history.back();
      backTimerRef.current = window.setTimeout(() => {
        backTimerRef.current = null;
        if (view !== null && openRef.current === view && onThisPage()) closeInPlace();
      }, BACK_FALLBACK_MS);
    });
  }, [closeInPlace, onThisPage]);

  /**
   * Open what the live entry names (2.3, 11.10; S71 amendment 3, B): on
   * arrival, and on a restored entry with nothing open. The thread GET
   * decides the view; the home is not needed for it to open. The read
   * failing (any non-200): the home on All, the URL `/messages`, the toast
   * (N6).
   */
  const openFromEntry = useCallback((id: string) => {
    const seq = ++deepLinkSeqRef.current;
    // Still this lookup's to answer: no later open, close or pop took over,
    // the page is this one, and the LIVE entry still names this room. A Back
    // pressed while the read was out lands on another entry (the home's):
    // opening there would write the room onto that entry and lose the home.
    const stillMine = () => {
      if (deepLinkSeqRef.current !== seq || !onThisPage()) return false;
      const live = liveChannel(window.history.state);
      return live === undefined || live === id;
    };
    const run = async () => {
      const r = await vibeRequest<ThreadMessagesResponse>(`/api/me/threads/${encodeURIComponent(id)}/messages?limit=50`, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't open this chat.",
      });
      if (!stillMine()) return;
      if (!r.ok || !r.data || typeof r.data !== "object" || !Array.isArray(r.data.messages)) {
        filterRef.current = "all";
        setFilterState("all");
        clearLayersThen(() => {
          if (stillMine()) window.history.replaceState(null, "", "/messages");
        });
        toast({ message: asLoadFailure(r, "Couldn't open this chat.").message, tone: "error" });
        return;
      }
      const room = r.data.room;
      const view: OpenView = room
        ? { kind: "club", orgHandle: room.org.handle, roomId: id, roomKind: room.kind, initialPage: r.data }
        : { kind: "thread", threadId: id };
      clearLayersThen(() => {
        if (!stillMine()) return;
        // The layer opens on the entry the browser already holds (2.3); with
        // no entry behind it, Back closes in place (`closeLayer`).
        noBackRef.current = window.history.length <= 1;
        // An event room's own depth-2 entry, already the live one (back
        // from a profile, a reload inside the event chat), has the space's
        // entry under it: nothing is written and Back peels as before.
        const writes = arrivalWrites(window.history.state, id, !!room && room.kind === "event");
        if (writes !== "none") window.history.replaceState({ vibeChat: id, depth: 1 }, "", channelUrl(id));
        if (writes === "space+layer") {
          // The space on its Lounge underneath, the event chat layer on top
          // (S2-notes.md R2: ClubSpace pushes depth 2 only when this is absent).
          window.history.pushState({ vibeChat: id, depth: 2 }, "", channelUrl(id));
        }
        openRef.current = view;
        setComposeOpen(false);
        setOpen(view);
      });
    };
    void run();
  }, [onThisPage]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // A sheet, the "+" tray or a confirm closing (each has its own entry,
      // `use-layer-history.ts`): not a room-level move, nothing closes here.
      if (isLayerPop(e)) return;
      clearBackTimer();
      if (!openRef.current) {
        // A restored entry with nothing open (Forward after a close; the
        // landing after a leftover sheet entry was stepped off): the screen
        // follows the entry (B). Only an entry of this page: a pop that
        // leaves `/messages` passes here too. A lookup still out for the
        // entry that was just left (Back pressed again while a restored room
        // was loading) is dropped first: its answer must not open that room
        // on this entry.
        deepLinkSeqRef.current += 1;
        const id = onThisPage() ? liveChannel(e.state) : null;
        if (id) openFromEntry(id);
        return;
      }
      // The event chat layer's Back (or Forward onto it): ClubSpace's (R1).
      if (depthOf(e.state) >= 1) return;
      deepLinkSeqRef.current += 1;
      openRef.current = null;
      setOpen(null);
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [clearBackTimer, onThisPage, openFromEntry]);

  /** Resolve a handle → a dm's id (an existing thread, else `POST /api/me/threads`) and open it. */
  const openDmByHandle = useCallback(
    async (handle: string, threads: ThreadEntry[] | null, failure: string) => {
      const lower = handle.toLowerCase();
      const seq = ++deepLinkSeqRef.current;
      const existing = (threads ?? []).find((t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower);
      if (existing) {
        openView({ kind: "thread", threadId: existing.id });
        return;
      }
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", { json: { handle: lower }, failure });
      // A refusal has toasted why; compose stays open for another pick.
      if (!r.ok) return;
      const channelId = r.data.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        toast({ message: `${failure} Try again.`, tone: "error" });
        return;
      }
      // A newer ?to= or ?channel= arrived while this one resolved: that one
      // has opened (or will).
      if (deepLinkSeqRef.current !== seq) return;
      setRefreshKey((k) => k + 1);
      openView({ kind: "thread", threadId: channelId });
    },
    [openView],
  );

  // The dm/group lists as the home reads them. `?to=` resolves on the first
  // answer (a failed first load still resolves through the POST, which finds
  // an existing dm too, so the link never waits on a Retry).
  const onThreads = useCallback(
    (threads: ThreadEntry[] | null, requests: ThreadEntry[] | null) => {
      listsRef.current = { threads, requests };
      setLists({ threads, requests });
      const handle = pendingHandleRef.current;
      if (!handle) return;
      pendingHandleRef.current = null;
      void openDmByHandle(handle, threads, "Couldn't open that conversation.");
    },
    [openDmByHandle],
  );

  // On arrival, and when Next restores this page (back from a club page, a
  // profile or a post): open what the LIVE entry says (B), once the flag
  // answered true (this component exists only then). The server prop is
  // only the fallback for an address that cannot be read.
  useEffect(() => {
    try {
      // A restored page's props are the first address's: `?to=` counts only
      // while the live address still carries it.
      if (!new URLSearchParams(window.location.search).has("to")) pendingHandleRef.current = null;
    } catch {
      /* keep the prop */
    }
    // An entry left by a sheet (a reload with one open; back from a page
    // reached with the tray open) is stepped off first: its landing is a
    // `popstate` with nothing open, which opens the room (`onPop`).
    if (adoptLayerEntry()) return;
    const live = liveChannel(window.history.state);
    const id = live === undefined ? firstChannelId : live;
    if (id) openFromEntry(id);
  }, [firstChannelId, openFromEntry]);

  // A week card or a club row names the room and, when it can, the club.
  // Without a handle the room resolves as a deep link does (one read).
  const openRoom = useCallback(
    (roomId: string, orgHandle: string | null, roomKind: RoomKind) => {
      if (orgHandle) {
        openView({ kind: "club", orgHandle, roomId, roomKind });
        return;
      }
      const seq = ++deepLinkSeqRef.current;
      const run = async () => {
        const r = await vibeRequest<ThreadMessagesResponse>(`/api/me/threads/${encodeURIComponent(roomId)}/messages?limit=50`, {
          cache: "no-store",
          quiet: true,
          failure: "Couldn't open this chat.",
        });
        if (deepLinkSeqRef.current !== seq) return;
        if (!r.ok || !r.data || typeof r.data !== "object") {
          toast({ message: asLoadFailure(r, "Couldn't open this chat.").message, tone: "error" });
          return;
        }
        const room = r.data.room;
        const page = Array.isArray(r.data.messages) ? r.data : undefined;
        openView(room ? { kind: "club", orgHandle: room.org.handle, roomId, roomKind: room.kind, initialPage: page } : { kind: "thread", threadId: roomId });
      };
      void run();
    },
    [openView],
  );

  const openThreadEntry = useMemo(
    () =>
      open?.kind === "thread"
        ? (lists.threads?.find((t) => t.id === open.threadId) ?? lists.requests?.find((t) => t.id === open.threadId) ?? null)
        : null,
    [open, lists],
  );

  return (
    <>
      <MessagesHome
        mini={mini}
        filter={filter}
        onFilter={setFilter}
        refreshKey={refreshKey}
        onThreads={onThreads}
        onOpenClub={(orgHandle, roomId, roomKind) => openView({ kind: "club", orgHandle, roomId, roomKind })}
        onOpenThread={(threadId) => openView({ kind: "thread", threadId })}
        onOpenRoom={(roomId, orgHandle) => openRoom(roomId, orgHandle, "event")}
        onCompose={() => setComposeOpen(true)}
      />

      {open?.kind === "club" ? (
        <ClubSpace
          key={open.roomId}
          orgHandle={open.orgHandle}
          initialRoomId={open.roomId}
          initialRoomKind={open.roomKind}
          initialPage={open.initialPage}
          onClose={closeLayer}
        />
      ) : null}

      {/* Keyed on the thread: a deep link that switches threads under an
          open view mounts a fresh one, so no draft, menu or in-flight send
          of the old thread carries into the new one. */}
      {open?.kind === "thread" ? (
        <ConversationView
          key={open.threadId}
          threadId={open.threadId}
          thread={openThreadEntry}
          messagePins
          survivesReload
          onThreadsChanged={() => setRefreshKey((k) => k + 1)}
          onClose={closeLayer}
        />
      ) : null}

      {composeOpen ? (
        <ComposeOverlay
          onCancel={() => setComposeOpen(false)}
          onPick={(handle) => void openDmByHandle(handle, listsRef.current.threads, "Couldn't start that conversation.")}
        />
      ) : null}
    </>
  );
}

/**
 * Today's list, unchanged (the flag `false`; 2.1). Two screens, one
 * component: the thread list (All / Requests) and the conversation view that
 * slides over it when a thread is tapped. No history writes (MM:5.3).
 */
function MessagesMobileV1({
  initialHandle,
  initialChannelId,
}: {
  initialHandle?: string;
  initialChannelId?: string;
}) {
  // The header's translucent cream has no Night token yet (see the header).
  const night = useNightTheme();
  const [tab, setTab] = useState<Tab>("all");
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [requests, setRequests] = useState<ThreadEntry[] | null>(null);
  // The first list load's failure, shown in the list's place. A refetch
  // that fails keeps the rows already on screen instead.
  const [listErr, setListErr] = useState<LoadFailure | null>(null);
  const listLoadedRef = useRef(false);
  const listSeqRef = useRef(0);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // The ?to= handle the page last opened, so a re-render doesn't open it
  // again but a new one (a later link while mounted) does.
  const lastHandledHandleRef = useRef<string | null>(null);
  // Bumped by every deep link the page acts on (?channel= and ?to=), so a
  // ?to= lookup still in flight knows a later link has taken over.
  const deepLinkSeqRef = useRef(0);

  /** Resolve a handle → DM channel id, creating the thread if needed. */
  const openOrCreateDmFromHandle = useCallback(
    async (handle: string) => {
      const lower = handle.toLowerCase();
      // Cheap path: already have a thread with this peer.
      const existing = (threads ?? []).find(
        (t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower,
      );
      if (existing) {
        setComposeOpen(false);
        setOpenThreadId(existing.id);
        return;
      }
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", {
        json: { handle: lower },
        failure: "Couldn't start that conversation.",
      });
      // A refusal has toasted why; compose stays open for another pick.
      if (!r.ok) return;
      const channelId = r.data.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        toast({ message: "Couldn't start that conversation. Try again.", tone: "error" });
        return;
      }
      await refetchThreadsRef.current?.();
      setComposeOpen(false);
      setOpenThreadId(channelId);
    },
    [threads],
  );

  // Stable handle to the refetcher so callbacks can refresh without a
  // dep-chain rewrite. Filled in below once `refetchThreads` exists.
  const refetchThreadsRef = useRef<
    ((mode?: "first" | "refresh" | "quiet") => Promise<void>) | null
  >(null);
  // When the list last started a load (Date.now()), so a return to the app
  // doesn't reload a list that was just fetched.
  const listFetchedAtRef = useRef(0);

  // "first" is the page's own load and its Retry: a failure shows in the
  // list's place, with no toast. "refresh" follows something the student
  // did (closing a thread, accepting a request): a failure keeps both
  // lists on screen and toasts. "quiet" is a re-sync nobody asked for
  // (coming back to the app): a failure keeps the rows and says nothing.
  // Until one load has worked there are no rows to keep, so every failure
  // is a first-load failure.
  const refetchThreads = useCallback(
    async (mode: "first" | "refresh" | "quiet" = "refresh") => {
      const seq = ++listSeqRef.current;
      listFetchedAtRef.current = Date.now();
      const r = await vibeRequest<{ threads?: ThreadEntry[]; requests?: ThreadEntry[] }>(
        "/api/me/threads",
        {
          cache: "no-store",
          quiet: mode !== "refresh" || !listLoadedRef.current,
          failure: "Couldn't load your messages.",
        },
      );
      // A newer load has started; its answer is the one to paint.
      if (seq !== listSeqRef.current) return;
      if (r.ok && Array.isArray(r.data.threads) && Array.isArray(r.data.requests)) {
        listLoadedRef.current = true;
        setListErr(null);
        setThreads(r.data.threads);
        setRequests(r.data.requests);
        return;
      }
      if (!listLoadedRef.current) {
        setListErr(asLoadFailure(r, "Couldn't load your messages."));
      } else if (r.ok && mode === "refresh") {
        // A 2xx without the lists: vibeRequest didn't toast that one.
        toast({ message: "Couldn't load your messages. Try again.", tone: "error" });
      }
    },
    [],
  );

  useEffect(() => {
    refetchThreadsRef.current = refetchThreads;
    void refetchThreads("first");
  }, [refetchThreads]);

  // Coming back to the app (lock screen, another app, a notification)
  // re-syncs the list quietly: messages may have landed while it was
  // hidden. At most once every LIST_RESYNC_MS since the last load.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - listFetchedAtRef.current < LIST_RESYNC_MS) return;
      void refetchThreadsRef.current?.("quiet");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ?channel=<id> deep link — opens the conversation view on that
  // thread immediately. The ConversationView handles its own message
  // fetch via /api/me/threads/[id]/messages which works for org
  // channels via the can_view_org_channel RPC even if the thread
  // isn't in the user's threads list yet. A different id while the page
  // is mounted (a notification tap that soft-navigates) opens that one;
  // the same id on a re-render doesn't reopen it.
  const lastHandledChannelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialChannelId) return;
    if (lastHandledChannelRef.current === initialChannelId) return;
    lastHandledChannelRef.current = initialChannelId;
    deepLinkSeqRef.current += 1;
    setComposeOpen(false);
    setOpenThreadId(initialChannelId);
  }, [initialChannelId]);

  // ?to=<handle> deep link — resolve to a channel id once the first list
  // load has settled, then open that conversation. Handles both existing
  // threads (peer.handle matches) and brand-new ones (POST to
  // /api/me/threads). A failed first load still resolves it through the
  // POST, which finds an existing DM too, so the link never waits on a
  // Retry; the ref keeps a later successful load from posting again for
  // the same handle, while a new handle opens its own conversation.
  useEffect(() => {
    if (!initialHandle) return;
    if (threads === null && !listErr) return; // wait for the first load to settle
    const lower = initialHandle.toLowerCase();
    if (lastHandledHandleRef.current === lower) return;
    lastHandledHandleRef.current = lower;
    const seq = ++deepLinkSeqRef.current;
    setComposeOpen(false);
    const existing = (threads ?? []).find(
      (t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower,
    );
    if (existing) {
      setOpenThreadId(existing.id);
      return;
    }
    // Create / resolve the DM channel server-side. A refusal toasts why
    // and the student lands on the thread list.
    (async () => {
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", {
        json: { handle: lower },
        failure: "Couldn't open that conversation.",
      });
      if (!r.ok) return;
      const channelId = r.data.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        toast({ message: "Couldn't open that conversation. Try again.", tone: "error" });
        return;
      }
      await refetchThreads();
      // A newer ?to= or ?channel= arrived while this one resolved: that
      // one has opened (or will).
      if (deepLinkSeqRef.current !== seq) return;
      setOpenThreadId(channelId);
    })();
  }, [initialHandle, threads, listErr, refetchThreads]);

  const visibleThreads = useMemo(() => {
    if (tab === "requests") return requests ?? [];
    return threads ?? [];
  }, [tab, threads, requests]);

  // Threads with an unread message — the server's flag, because only the
  // server knows the viewer's last_read_at. A muted thread keeps its dot
  // but stays out of the badge: mute promises silence (desktop's copy
  // says so, and the server documents muted_until as badge silence).
  const unreadCount = useMemo(
    () =>
      (threads ?? []).filter(
        (t) =>
          t.unread && !(t.muted_until && new Date(t.muted_until) > new Date()),
      ).length,
    [threads],
  );

  return (
    <main
      style={{
        // The campus Feed's backdrop (contracts C0): cream with a coral
        // bloom in Light, near-black in Night.
        background: "var(--feed-backdrop)",
        minHeight: "100dvh",
      }}
    >
      <header
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 6px",
          // Cream at .86 has no token yet (a --cream-86 step in globals.css
          // would replace this ternary): Light keeps the literal, Night the
          // nearest step, the tab bar's cream.
          background: night ? "var(--tabbar-bg)" : "rgba(250, 247, 242, 0.86)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          borderBottom: "1px solid rgba(var(--scrim-rgb),0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.8px",
              color: "var(--charcoal)",
              margin: 0,
            }}
          >
            Messages
          </h1>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            aria-label="New message"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "1px solid rgba(var(--scrim-rgb),0.10)",
              // White at .78: same no-token-yet story (--paper-78).
              background: night ? "var(--paper-70)" : "rgba(255,255,255,0.78)",
              color: "var(--charcoal)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              WebkitTapHighlightColor: "transparent",
              boxShadow: night
                ? "inset 0 1px 0 rgba(255,255,255,0.04)"
                : "inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path
                d="M14.5 3.5l4 4-10 10H4v-4.5l10.5-9.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinejoin="round"
              />
              <path
                d="M13 5l4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 12,
            paddingBottom: 8,
          }}
        >
          <TabPill
            label="All"
            active={tab === "all"}
            onClick={() => setTab("all")}
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          <TabPill
            label="Requests"
            active={tab === "requests"}
            onClick={() => setTab("requests")}
            badge={requests?.length || undefined}
          />
        </div>
      </header>

      <div style={{ padding: "8px 0 24px" }}>
        {threads === null ? (
          listErr ? (
            <div style={{ padding: "16px 16px 0" }}>
              <LoadFailed
                failure={listErr}
                tone={night ? "dark" : "light"}
                onRetry={() => {
                  setListErr(null);
                  void refetchThreads("first");
                }}
              />
            </div>
          ) : (
            <ListSkeleton />
          )
        ) : visibleThreads.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {visibleThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                onTap={() => setOpenThreadId(t.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Keyed on the thread: a deep link that switches threads under an
          open view mounts a fresh one, so no draft, menu, pin/mute mirror
          or in-flight send of the old thread carries into the new one. */}
      {openThreadId ? (
        <ConversationView
          key={openThreadId}
          threadId={openThreadId}
          thread={
            threads?.find((t) => t.id === openThreadId) ??
            requests?.find((t) => t.id === openThreadId) ??
            null
          }
          onThreadsChanged={() => void refetchThreads()}
          onClose={() => {
            setOpenThreadId(null);
            void refetchThreads();
          }}
        />
      ) : null}

      {composeOpen ? (
        <ComposeOverlay
          onCancel={() => setComposeOpen(false)}
          onPick={(handle) => void openOrCreateDmFromHandle(handle)}
        />
      ) : null}
    </main>
  );
}

export { ConversationView } from "./messages/ConversationView";
