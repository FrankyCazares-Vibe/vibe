"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ComposeOverlay } from "./messages/ComposeOverlay";
import { ConversationView } from "./messages/ConversationView";
import { useNightTheme } from "./messages/theme";
import { EmptyState, ListSkeleton, TabPill, ThreadRow } from "./messages/ThreadList";
import { type Tab, type ThreadEntry } from "./messages/types";

/**
 * iOS-native /messages rebuild for mobile. Two screens, one component:
 *
 *   1. Thread list — All / Requests tabs, each row shows avatar +
 *      title + last-message preview + relative time + unread dot.
 *   2. Conversation view — full-screen sheet that slides over the list
 *      when a thread is tapped. Top bar with back chevron and peer
 *      identity, message bubbles (mine right/coral, theirs left/cream),
 *      sticky input bar at the bottom.
 *
 * The bottom tab bar is hidden while a conversation is open so the
 * input bar doesn't fight for space (matches Instagram / iMessage).
 *
 * Data:
 *   - GET /api/me/threads → { threads, requests }
 *   - GET /api/me/threads/[id]/messages → { messages }
 *   - POST /api/me/threads/[id]/messages → { ok, message }
 *   - POST /api/me/threads/[id]/read → mark as read on entry
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
