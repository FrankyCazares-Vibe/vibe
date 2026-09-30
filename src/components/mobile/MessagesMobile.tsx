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
import type { RoomKind, ThreadMessagesResponse } from "@/lib/chat/types";
import { useChatV2 } from "@/lib/chat/use-chat-v2";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ClubSpace } from "./messages/club/ClubSpace";
import { ComposeOverlay } from "./messages/ComposeOverlay";
import { ConversationView } from "./messages/ConversationView";
import { type HomeFilter, homeUrl, parseHomeFilter } from "./messages/home/home-rules";
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
}: {
  initialHandle?: string;
  initialChannelId?: string;
}) {
  // The one hook before the fork; each branch is its own component with its
  // own hooks, so no list mounts under another (2.1).
  const chatV2 = useChatV2();
  if (chatV2 === null) return <FlagPending />;
  if (chatV2) return <MessagesMobileV2 initialHandle={initialHandle} initialChannelId={initialChannelId} />;
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
 * space. `initialChannelId` and `initialHandle` are read once, on mount.
 */
function MessagesMobileV2({ initialHandle, initialChannelId }: { initialHandle?: string; initialChannelId?: string }) {
  const searchParams = useSearchParams();
  const [filter, setFilterState] = useState<HomeFilter>(() => parseHomeFilter(searchParams.get("tab")));
  const [open, setOpen] = useState<OpenView | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Bumped after a view closes: the home reads its lists again (11.10).
  const [refreshKey, setRefreshKey] = useState(0);
  const [lists, setLists] = useState<{ threads: ThreadEntry[] | null; requests: ThreadEntry[] | null }>({ threads: null, requests: null });
  // Read once, on mount (2.3): a later render of the page never re-opens them.
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
    if (openRef.current) window.history.replaceState(mark, "", channelUrl(id));
    else {
      window.history.pushState(mark, "", channelUrl(id));
      noBackRef.current = false;
    }
    openRef.current = view;
    setComposeOpen(false);
    setOpen(view);
  }, []);

  /** The home again with nothing open; the URL back to the home's. */
  const closeInPlace = useCallback(() => {
    deepLinkSeqRef.current += 1;
    noBackRef.current = false;
    openRef.current = null;
    setOpen(null);
    setRefreshKey((k) => k + 1);
    window.history.replaceState(null, "", homeUrl(filterRef.current));
  }, []);

  /** Back / the swipe on a depth-1 layer: `history.back()`; `popstate` closes (2.3). */
  const closeLayer = useCallback(() => {
    // A deep link in a fresh tab has nowhere to go back to (`noBackRef`):
    // close in place instead of leaving the view stuck.
    if (depthOf(window.history.state) >= 1 && !noBackRef.current) window.history.back();
    else closeInPlace();
  }, [closeInPlace]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (depthOf(e.state) >= 1) {
        // Forward onto a layer's entry with nothing open (the layer was
        // closed by Back): the entry is stale, the URL goes back to the
        // home's. Otherwise the event chat layer's Back: ClubSpace's (R1).
        if (!openRef.current) window.history.replaceState(null, "", homeUrl(filterRef.current));
        return;
      }
      if (!openRef.current) return;
      deepLinkSeqRef.current += 1;
      openRef.current = null;
      setOpen(null);
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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

  // ?channel=<id> on arrival (2.3, 11.10): the thread GET decides the view
  // once the flag answered true (this component exists only then). The
  // home is not needed for the view to open. The read failing (any
  // non-200): the home on All, the URL `/messages`, the toast (N6).
  useEffect(() => {
    if (!firstChannelId) return;
    const id = firstChannelId;
    const seq = ++deepLinkSeqRef.current;
    const run = async () => {
      const r = await vibeRequest<ThreadMessagesResponse>(`/api/me/threads/${encodeURIComponent(id)}/messages?limit=50`, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't open this chat.",
      });
      if (deepLinkSeqRef.current !== seq) return;
      if (!r.ok || !r.data || typeof r.data !== "object" || !Array.isArray(r.data.messages)) {
        filterRef.current = "all";
        setFilterState("all");
        window.history.replaceState(null, "", "/messages");
        toast({ message: asLoadFailure(r, "Couldn't open this chat.").message, tone: "error" });
        return;
      }
      const room = r.data.room;
      // The layer opens on the entry the browser already holds (2.3); with
      // no entry behind it, Back closes in place (`closeLayer`).
      noBackRef.current = window.history.length <= 1;
      window.history.replaceState({ vibeChat: id, depth: 1 }, "", channelUrl(id));
      if (room && room.kind === "event") {
        // The space on its Lounge underneath, the event chat layer on top
        // (S2-notes.md R2: ClubSpace pushes depth 2 only when this is absent).
        window.history.pushState({ vibeChat: id, depth: 2 }, "", channelUrl(id));
      }
      const view: OpenView = room
        ? { kind: "club", orgHandle: room.org.handle, roomId: id, roomKind: room.kind, initialPage: r.data }
        : { kind: "thread", threadId: id };
      openRef.current = view;
      setComposeOpen(false);
      setOpen(view);
    };
    void run();
  }, [firstChannelId]);

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
