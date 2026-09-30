"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import type { InboxClub, InboxResponse, RoomKind } from "@/lib/chat/types";
import { weekRange, type WeekRange } from "@/lib/chat/week";
import { vibeRequest } from "@/lib/feedback/request";

import { useNightTheme } from "../theme";
import { EmptyState, ListSkeleton, ThreadRow } from "../ThreadList";
import type { ThreadEntry } from "../types";
import { FONT, palette, SERIF } from "../v2-tokens";

import { ClubRow } from "./ClubRow";
import { HomeEmpty } from "./HomeEmpty";
import { allBadgeCount, badgeText, HOME_FILTERS, type HomeFilter, mergeHomeRows, type WeekEntry } from "./home-rules";
import { PersonRow } from "./PersonRow";
import { YourWeek } from "./YourWeek";

/**
 * The Messages home (handoffs/chat-redesign/wave-2-contracts.md 11.1, 1.2,
 * 11.2, 11.9; W2-S1) — W0_Home, W0_EmptyWeek, W0_EmptyClubs. Mounted by
 * `MessagesMobile` with the flag on (2.1); the shell keeps the open view, the
 * deep links and the history (11.10); this screen keeps the three reads and
 * the list.
 *
 * Reads on mount, in parallel: `GET /api/me/threads?scope=chats`,
 * `GET /api/me/inbox`, `GET /api/me/calendar?from=<Monday>&to=<Sunday>` (the
 * device week, `weekRange`). The first two again every 30 s while visible and
 * on return to visible at most once per 30 s (`LIST_RESYNC_MS`); the calendar
 * on mount and on return to visible at most once per 5 min; the first two
 * again when `refreshKey` changes (after a view closed, 11.10).
 *
 * States: the skeleton until BOTH threads and inbox answered (the week has
 * its own); `inbox` failing alone → `Couldn't load your clubs.` in the list's
 * club position while threads still list; both failing → one `LoadFailed`;
 * a refetch failure keeps the rows and stays quiet.
 */

const LIST_RESYNC_MS = 30_000;
const WEEK_RESYNC_MS = 5 * 60_000;

export type MessagesHomeProps = {
  filter: HomeFilter;
  onFilter: (filter: HomeFilter) => void;
  /** Bumped by the shell after a view closes: the list reads run again. */
  refreshKey: number;
  /** The dm/group lists as they arrive (null on a failure), so the shell can resolve `?to=` and name the open thread. */
  onThreads: (threads: ThreadEntry[] | null, requests: ThreadEntry[] | null) => void;
  onOpenClub: (orgHandle: string, roomId: string, roomKind: RoomKind) => void;
  onOpenThread: (threadId: string) => void;
  /** A week card: the room's id with the club's handle when the entry carries one. */
  onOpenRoom: (roomId: string, orgHandle: string | null) => void;
  onCompose: () => void;
};

type CalendarBody = { ok?: boolean; entries?: unknown };

function isRsvpEntry(x: unknown): x is WeekEntry & { kind: "rsvp" } {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return e.kind === "rsvp" && typeof e.id === "string" && typeof e.title === "string" && typeof e.starts_at === "string";
}

function toWeekEntry(e: WeekEntry & { kind: "rsvp" }): WeekEntry {
  return {
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    viewer_status: e.viewer_status === "maybe" ? "maybe" : "going",
    org: e.org && typeof e.org === "object" ? { handle: e.org.handle, name: e.org.name } : null,
    org_id: typeof e.org_id === "string" ? e.org_id : null,
    room_id: typeof e.room_id === "string" ? e.room_id : null,
    room_state: e.room_state ?? null,
  };
}

/** The three reads and their schedule (11.1). */
function useHomeData(refreshKey: number, onThreads: MessagesHomeProps["onThreads"]) {
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [requests, setRequests] = useState<ThreadEntry[] | null>(null);
  const [threadsErr, setThreadsErr] = useState<LoadFailure | null>(null);
  const [clubs, setClubs] = useState<InboxClub[] | null>(null);
  const [clubsErr, setClubsErr] = useState<LoadFailure | null>(null);
  const [week, setWeek] = useState<WeekEntry[] | null>(null);
  const [weekErr, setWeekErr] = useState<LoadFailure | null>(null);
  // One clock for the whole list (1.2), reset on every list read.
  const [now, setNow] = useState(() => new Date());
  const [range, setRange] = useState<WeekRange>(() => weekRange(new Date()));
  const threadsLoadedRef = useRef(false);
  const clubsLoadedRef = useRef(false);
  const weekLoadedRef = useRef(false);
  const listSeqRef = useRef(0);
  const weekSeqRef = useRef(0);
  const listAtRef = useRef(0);
  const weekAtRef = useRef(0);
  // `onThreads` is the shell's stable callback (a useCallback with no deps),
  // so `readLists` keeps one identity and the mount effect runs once.
  const readLists = useCallback(async () => {
    const seq = ++listSeqRef.current;
    listAtRef.current = Date.now();
    const [tr, ir] = await Promise.all([
      vibeRequest<{ threads?: ThreadEntry[]; requests?: ThreadEntry[] }>("/api/me/threads?scope=chats", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your messages.",
      }),
      vibeRequest<InboxResponse>("/api/me/inbox", { cache: "no-store", quiet: true, failure: "Couldn't load your clubs." }),
    ]);
    if (seq !== listSeqRef.current) return;
    setNow(new Date());
    if (tr.ok && Array.isArray(tr.data.threads) && Array.isArray(tr.data.requests)) {
      threadsLoadedRef.current = true;
      setThreadsErr(null);
      setThreads(tr.data.threads);
      setRequests(tr.data.requests);
      onThreads(tr.data.threads, tr.data.requests);
    } else if (!threadsLoadedRef.current) {
      setThreadsErr(asLoadFailure(tr, "Couldn't load your messages."));
      onThreads(null, null);
    }
    if (ir.ok && Array.isArray(ir.data.clubs)) {
      clubsLoadedRef.current = true;
      setClubsErr(null);
      setClubs(ir.data.clubs);
    } else if (!clubsLoadedRef.current) {
      setClubsErr(asLoadFailure(ir, "Couldn't load your clubs."));
    }
  }, [onThreads]);

  const readWeek = useCallback(async () => {
    const seq = ++weekSeqRef.current;
    weekAtRef.current = Date.now();
    const at = new Date();
    const r = weekRange(at);
    const res = await vibeRequest<CalendarBody>(
      `/api/me/calendar?from=${encodeURIComponent(r.start.toISOString())}&to=${encodeURIComponent(r.end.toISOString())}`,
      { cache: "no-store", quiet: true, failure: "Couldn't load your week." },
    );
    if (seq !== weekSeqRef.current) return;
    if (res.ok && Array.isArray(res.data.entries)) {
      weekLoadedRef.current = true;
      setRange(r);
      setWeekErr(null);
      setWeek(res.data.entries.filter(isRsvpEntry).map(toWeekEntry));
    } else if (!weekLoadedRef.current) {
      setWeekErr(asLoadFailure(res, "Couldn't load your week."));
    }
  }, []);

  // The first reads, and the list reads again on `refreshKey` (a view closed).
  // The reads answer in a callback after their `await`, never in the effect.
  useEffect(() => {
    const run = async () => {
      await readLists();
    };
    void run();
  }, [readLists, refreshKey]);

  useEffect(() => {
    const run = async () => {
      await readWeek();
    };
    void run();
  }, [readWeek]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - listAtRef.current >= LIST_RESYNC_MS) void readLists();
      if (Date.now() - weekAtRef.current >= WEEK_RESYNC_MS) void readWeek();
    };
    const timer = window.setInterval(tick, LIST_RESYNC_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [readLists, readWeek]);

  const retryLists = useCallback(() => {
    setThreadsErr(null);
    setClubsErr(null);
    void readLists();
  }, [readLists]);
  const retryWeek = useCallback(() => {
    setWeekErr(null);
    void readWeek();
  }, [readWeek]);

  return { threads, requests, threadsErr, clubs, clubsErr, week, weekErr, now, range, retryLists, retryWeek };
}

const FILTER_LABEL: Record<HomeFilter, string> = { all: "All", chats: "Chats", clubs: "Clubs", requests: "Requests" };
const LIST_LABEL: Record<HomeFilter, string> = { all: "All chats, pinned first", chats: "Chats", clubs: "Clubs", requests: "Requests" };

export function MessagesHome({ filter, onFilter, refreshKey, onThreads, onOpenClub, onOpenThread, onOpenRoom, onCompose }: MessagesHomeProps) {
  const night = useNightTheme();
  const t = palette(night);
  const d = useHomeData(refreshKey, onThreads);
  const badge = useMemo(() => allBadgeCount(d.threads ?? [], d.clubs ?? [], d.now), [d.threads, d.clubs, d.now]);
  const requestCount = d.requests?.length ?? 0;
  // 11.1 States: the skeleton until BOTH threads and inbox answered.
  const pending = (d.threads === null && !d.threadsErr) || (d.clubs === null && !d.clubsErr);
  const bothFailed = !!d.threadsErr && !!d.clubsErr;
  const failedBox = (failure: LoadFailure) => (
    <div style={{ padding: "12px 16px 4px" }}>
      <LoadFailed failure={failure} tone={night ? "dark" : "light"} onRetry={d.retryLists} />
    </div>
  );
  const openClub = (club: InboxClub) => (roomId: string, roomKind: RoomKind) => onOpenClub(club.org.handle, roomId, roomKind);

  let list: React.ReactNode;
  if (pending) {
    list = <ListSkeleton />;
  } else if (bothFailed) {
    list = failedBox(d.threadsErr as LoadFailure);
  } else if (filter === "requests") {
    const rows = d.requests ?? [];
    list = d.threadsErr ? (
      failedBox(d.threadsErr)
    ) : rows.length === 0 ? (
      <EmptyState tab="requests" />
    ) : (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <ThreadRow key={r.id} thread={r} onTap={() => onOpenThread(r.id)} />
        ))}
      </ul>
    );
  } else if (filter === "chats") {
    const rows = d.threads ?? [];
    list = d.threadsErr ? (
      failedBox(d.threadsErr)
    ) : rows.length === 0 ? (
      <EmptyState tab="all" />
    ) : (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <PersonRow key={r.id} thread={r} now={d.now} onTap={() => onOpenThread(r.id)} />
        ))}
      </ul>
    );
  } else if (filter === "clubs") {
    const rows = d.clubs ?? [];
    list = d.clubsErr ? (
      failedBox(d.clubsErr)
    ) : rows.length === 0 ? (
      <HomeEmpty />
    ) : (
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
        {rows.map((c) => (
          <ClubRow key={c.org.id} club={c} now={d.now} onOpen={openClub(c)} />
        ))}
      </ul>
    );
  } else {
    const rows = mergeHomeRows(d.clubs ?? [], d.threads ?? []);
    list = (
      <>
        {d.clubsErr ? failedBox(d.clubsErr) : null}
        {d.threadsErr ? failedBox(d.threadsErr) : null}
        {rows.length === 0 && !d.threadsErr && !d.clubsErr ? (
          <EmptyState tab="all" />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
            {rows.map((r) =>
              r.kind === "club" ? (
                <ClubRow key={`c:${r.club.org.id}`} club={r.club} now={d.now} onOpen={openClub(r.club)} />
              ) : (
                <PersonRow key={`t:${r.thread.id}`} thread={r.thread} now={d.now} onTap={() => onOpenThread(r.thread.id)} />
              ),
            )}
          </ul>
        )}
      </>
    );
  }

  return (
    <main style={{ background: t.page, color: t.ink, minHeight: "100dvh", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          flexShrink: 0,
          boxSizing: "border-box",
          height: "calc(52px + env(safe-area-inset-top, 0px))",
          padding: "calc(env(safe-area-inset-top, 0px) + 4px) 10px 0 16px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <h1 style={{ margin: 0, marginRight: "auto", fontFamily: SERIF, fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "-0.8px", color: t.ink }}>Messages</h1>
        <button
          type="button"
          onClick={onCompose}
          aria-label="New message"
          style={{
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
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h8" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" />
          </svg>
        </button>
      </header>

      <YourWeek entries={d.week} failure={d.weekErr} onRetry={d.retryWeek} now={d.now} range={d.range} onOpenRoom={(e) => (e.room_id ? onOpenRoom(e.room_id, e.org?.handle ?? null) : undefined)} />

      <div role="tablist" aria-label="Show" style={{ flexShrink: 0, height: 45, boxSizing: "border-box", padding: "0 12px", display: "flex", alignItems: "center", gap: 2, borderTop: `1px solid ${t.hairline}` }}>
        {HOME_FILTERS.map((f) => {
          const active = f === filter;
          const count = f === "all" ? badge : f === "requests" ? requestCount : 0;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={f === "requests" && count > 0 ? `Requests, ${count} waiting` : undefined}
              onClick={() => onFilter(f)}
              style={{ height: 44, padding: "0 3px", border: "none", background: "transparent", display: "flex", alignItems: "center", cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}
            >
              <span
                style={{
                  height: 30,
                  minWidth: f === "all" ? 46 : undefined,
                  boxSizing: "border-box",
                  padding: count > 0 ? "0 8px 0 14px" : "0 14px",
                  borderRadius: 999,
                  border: active ? "1px solid transparent" : "1px solid rgba(var(--scrim-rgb),0.12)",
                  background: active ? t.activeChip.bg : "transparent",
                  color: active ? t.activeChip.ink : t.secondary,
                  fontSize: 13,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {FILTER_LABEL[f]}
                {count > 0 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      minWidth: 18,
                      height: 18,
                      boxSizing: "border-box",
                      padding: "0 5px",
                      borderRadius: 999,
                      // The All badge as today: coral, with the mockup's
                      // #140806 ink (`W0_Home:76`; white on coral is 3.0:1).
                      // Requests: the tinted count pill of `W0_Home:62`.
                      background: f === "all" ? t.coral : active ? "rgba(var(--scrim-rgb),0.14)" : "rgba(var(--scrim-rgb),0.12)",
                      color: f === "all" ? "#140806" : active ? t.activeChip.ink : t.ink,
                      fontSize: 11.5,
                      fontWeight: 800,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {badgeText(count)}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <section aria-label={LIST_LABEL[filter]} style={{ flexGrow: 1, minHeight: 0, paddingTop: 2, paddingBottom: 24 }}>
        {list}
      </section>

      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
          height: 36,
          pointerEvents: "none",
          zIndex: 5,
          background: "linear-gradient(180deg, transparent 0%, var(--cream-92) 100%)",
        }}
      />
    </main>
  );
}
