"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import type { InboxClub, InboxResponse, RoomKind } from "@/lib/chat/types";
import { clampWeekOffset, sheetStartDay, weekOffsetOf, weekRange, weekRangeAt, type WeekRange } from "@/lib/chat/week";
import { vibeRequest } from "@/lib/feedback/request";

import { useNightTheme } from "../theme";
import { EmptyState, ThreadRow } from "../ThreadList";
import type { ThreadEntry } from "../types";
import { FONT, palette, SERIF } from "../v2-tokens";

import { ClubRow } from "./ClubRow";
import { HomeEmpty } from "./HomeEmpty";
import { allBadgeCount, badgeText, calendarUrl, HOME_FILTERS, type HomeFilter, mergeHomeRows, rsvpEntries, type WeekEntry } from "./home-rules";
import { MonthSheet } from "./MonthSheet";
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
 * device week, `weekRange`). The first two again every 30 s while visible
 * (a timer that counts from the LAST list read, whatever started it) and on
 * return to visible at most once per 30 s (`LIST_RESYNC_MS`); the calendar on
 * mount and on return to visible at most once per 5 min, never on the timer;
 * all three again when `refreshKey` changes (after a view closed, 11.10): the
 * two lists and the week on screen.
 *
 * S71 amendment 4: the week strip swipes. The home keeps `weekOffset` (0 =
 * the device's current week, −4 to +26) and one calendar read PER WEEK, kept
 * in a cache keyed by the week's Monday, so a week seen before is drawn at
 * once. A week comes on screen → it is read when it never was or when its
 * last read is older than 5 min (the cards on screen stay while that read is
 * out); the return to visible re-reads the week ON SCREEN by the same 5-min
 * rule. The home's refresh (`refreshKey`) and the month sheet closing read
 * the week on screen at once and make every other cached week due again
 * (`refreshWeek`), so the strip never keeps an RSVP's old answer next to the
 * sheet's new one. A failure is kept for its own week only. Tapping the title
 * or a day opens the month sheet (`MonthSheet`), which reads its own months.
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
  /** Bumped by the shell after a view closes: the list reads and the week on screen run again. */
  refreshKey: number;
  /** The dm/group lists as they arrive (null on a failure), so the shell can resolve `?to=` and name the open thread. */
  onThreads: (threads: ThreadEntry[] | null, requests: ThreadEntry[] | null) => void;
  onOpenClub: (orgHandle: string, roomId: string, roomKind: RoomKind) => void;
  onOpenThread: (threadId: string) => void;
  /** A week card: the room's id with the club's handle when the entry carries one. */
  onOpenRoom: (roomId: string, orgHandle: string | null) => void;
  onCompose: () => void;
};

/** One week of the cache: its cards (null until its first read answers) and that read's failure. */
type WeekSlot = { entries: WeekEntry[] | null; failure: LoadFailure | null };

/** The three reads and their schedule (11.1). */
function useHomeData(refreshKey: number, onThreads: MessagesHomeProps["onThreads"]) {
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [requests, setRequests] = useState<ThreadEntry[] | null>(null);
  const [threadsErr, setThreadsErr] = useState<LoadFailure | null>(null);
  const [clubs, setClubs] = useState<InboxClub[] | null>(null);
  const [clubsErr, setClubsErr] = useState<LoadFailure | null>(null);
  // The weeks read so far, keyed by the week's Monday 00:00 (its `getTime()`).
  const [weeks, setWeeks] = useState<Record<number, WeekSlot>>({});
  // `slide` is the way the last change went (+1 = to a later week), for the strip's slide-in.
  const [weekAt, setWeekAt] = useState<{ offset: number; slide: -1 | 0 | 1 }>({ offset: 0, slide: 0 });
  const weekOffset = weekAt.offset;
  // One clock for the whole list (1.2), reset on every list read.
  const [now, setNow] = useState(() => new Date());
  // The week on screen: `weekOffset` weeks from the week `now` falls in.
  const range = weekRangeAt(now, weekOffset);
  const weekKey = range.start.getTime();
  const threadsLoadedRef = useRef(false);
  const clubsLoadedRef = useRef(false);
  const listSeqRef = useRef(0);
  const listAtRef = useRef(0);
  // Per week: the newest read's number (an older answer is dropped) and when
  // that read started (`Date.now()`).
  const weekSeqRef = useRef(new Map<number, number>());
  const weekAtRef = useRef(new Map<number, number>());
  const weekOffsetRef = useRef(0);
  useEffect(() => {
    weekOffsetRef.current = weekOffset;
  }, [weekOffset]);
  // The 30-s list timer (11.1 "every 30 s while visible"), re-armed by every
  // list read so the 30 s count from the last read: a close's refetch, a
  // Retry or a return to visible does not double up with the timer's read.
  const listTimerRef = useRef<number | null>(null);
  const readListsRef = useRef<(() => Promise<void>) | null>(null);
  const armListTimer = useCallback(() => {
    if (listTimerRef.current !== null) window.clearTimeout(listTimerRef.current);
    listTimerRef.current = window.setTimeout(() => {
      listTimerRef.current = null;
      // Hidden: nothing now; the return to visible reads (at most once per 30 s).
      if (document.visibilityState === "visible") void readListsRef.current?.();
    }, LIST_RESYNC_MS);
  }, []);
  // `onThreads` is the shell's stable callback (a useCallback with no deps),
  // so `readLists` keeps one identity and the mount effect runs once.
  const readLists = useCallback(async () => {
    const seq = ++listSeqRef.current;
    listAtRef.current = Date.now();
    armListTimer();
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
  }, [onThreads, armListTimer]);
  useEffect(() => {
    readListsRef.current = readLists;
  }, [readLists]);
  // The timer dies with the screen.
  useEffect(
    () => () => {
      if (listTimerRef.current !== null) window.clearTimeout(listTimerRef.current);
      listTimerRef.current = null;
    },
    [],
  );

  // One week's read (Monday 00:00 to Sunday 23:59:59.999 local). The answer
  // goes to that week's slot whatever week is on screen by then; a refetch
  // that fails keeps the cards and stays quiet.
  const readWeek = useCallback(async (r: WeekRange) => {
    const key = r.start.getTime();
    const seq = (weekSeqRef.current.get(key) ?? 0) + 1;
    weekSeqRef.current.set(key, seq);
    weekAtRef.current.set(key, Date.now());
    const res = await vibeRequest<unknown>(calendarUrl(r.start, r.end), { cache: "no-store", quiet: true, failure: "Couldn't load your week." });
    if (weekSeqRef.current.get(key) !== seq) return;
    const entries = res.ok ? rsvpEntries(res.data) : null;
    if (entries) {
      setWeeks((prev) => ({ ...prev, [key]: { entries, failure: null } }));
    } else {
      const failure = asLoadFailure(res, "Couldn't load your week.");
      setWeeks((prev) => (prev[key]?.entries ? prev : { ...prev, [key]: { entries: null, failure } }));
    }
  }, []);

  /** Read `r` unless its last read started less than 5 min ago (or is still out). */
  const readWeekIfStale = useCallback(
    async (r: WeekRange) => {
      const at = weekAtRef.current.get(r.start.getTime()) ?? 0;
      if (Date.now() - at >= WEEK_RESYNC_MS) await readWeek(r);
    },
    [readWeek],
  );

  /**
   * A refresh of the week (S71 amendment 4, "the home's refresh re-reads the
   * week on screen"): `r` is read now, whatever its age, and every other
   * week of the cache is due again, so it is read the next time it comes on
   * screen (its cards stay drawn while that read is out). Without this the
   * strip kept an RSVP's old answer while the month sheet, which reads at
   * every open, showed the new one.
   */
  const refreshWeek = useCallback(
    async (r: WeekRange) => {
      weekAtRef.current.clear();
      await readWeek(r);
    },
    [readWeek],
  );

  // The first reads, and the list reads again on `refreshKey` (a view closed).
  // The reads answer in a callback after their `await`, never in the effect.
  useEffect(() => {
    const run = async () => {
      await readLists();
    };
    void run();
  }, [readLists, refreshKey]);

  // `refreshKey` moved (a view closed, a thread changed): the week on screen
  // again too. Not on the mount: the effect below reads the first week.
  const refreshSeenRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshSeenRef.current === refreshKey) return;
    refreshSeenRef.current = refreshKey;
    const run = async () => {
      await refreshWeek(weekRangeAt(new Date(), weekOffsetRef.current));
    };
    void run();
  }, [refreshKey, refreshWeek]);

  // The week on screen: on mount, after a swipe, and when the device's week
  // rolls over under offset 0 (`weekKey` is that week's Monday).
  useEffect(() => {
    const run = async () => {
      await readWeekIfStale(weekRange(new Date(weekKey)));
    };
    void run();
  }, [weekKey, readWeekIfStale]);

  // Return to visible: the lists at most once per 30 s, the week on screen
  // at most once per 5 min (11.1). The timer above is the only other list
  // reader; the two effects above and `refreshWeek` (the month sheet closing)
  // are the only other week readers.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - listAtRef.current >= LIST_RESYNC_MS) void readLists();
      void readWeekIfStale(weekRangeAt(new Date(), weekOffsetRef.current));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [readLists, readWeekIfStale]);

  const retryLists = useCallback(() => {
    setThreadsErr(null);
    setClubsErr(null);
    void readLists();
  }, [readLists]);
  // Retry on a week's failure line: the week on screen back to its loading state, and its read again.
  const retryWeek = useCallback(() => {
    setWeeks((prev) => {
      if (!prev[weekKey]?.failure) return prev;
      const next = { ...prev };
      delete next[weekKey];
      return next;
    });
    void readWeek(weekRange(new Date(weekKey)));
  }, [readWeek, weekKey]);
  /** Move the strip to `offset` (clamped to −4 … +26); a move to the week already on screen changes nothing. */
  const setWeekOffset = useCallback((offset: number) => {
    setWeekAt((prev) => {
      const next = clampWeekOffset(offset);
      return next === prev.offset ? prev : { offset: next, slide: next > prev.offset ? 1 : -1 };
    });
  }, []);
  const stepWeek = useCallback((delta: 1 | -1) => {
    setWeekAt((prev) => {
      const next = clampWeekOffset(prev.offset + delta);
      return next === prev.offset ? prev : { offset: next, slide: delta };
    });
  }, []);

  const slot = weeks[weekKey];
  return {
    threads,
    requests,
    threadsErr,
    clubs,
    clubsErr,
    week: slot?.entries ?? null,
    weekErr: slot?.failure ?? null,
    now,
    range,
    weekOffset,
    weekSlide: weekAt.slide,
    setWeekOffset,
    stepWeek,
    refreshWeek,
    retryLists,
    retryWeek,
  };
}

/**
 * The list's skeleton: `ListSkeleton`'s shape (discs + bars in the 11.0
 * scrims) at the home's own row height — a 44px disc in `11px 16px` = 66px,
 * the person row it resolves into (`ListSkeleton`'s 50px disc makes 74px
 * rows and a visible jump on resolve; VIS-S1-6).
 */
function HomeSkeleton() {
  return (
    <ul aria-hidden="true" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid rgba(var(--scrim-rgb),0.04)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.06)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: "55%", height: 14, background: "rgba(var(--scrim-rgb),0.08)", borderRadius: 6, marginBottom: 6 }} />
            <div style={{ width: "85%", height: 11, background: "rgba(var(--scrim-rgb),0.05)", borderRadius: 5 }} />
          </div>
        </li>
      ))}
    </ul>
  );
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
  // A week card or a plan of the month sheet: the room's id with the club's handle when the entry carries one.
  const openRoom = (e: WeekEntry) => (e.room_id ? onOpenRoom(e.room_id, e.org?.handle ?? null) : undefined);
  // The month sheet (S71 amendment 4): the day it opens on and the control
  // that was pressed (focus goes back to it on close); null = closed.
  const [sheet, setSheet] = useState<{ day: Date; opener: HTMLElement | null } | null>(null);
  const weekTitleRef = useRef<HTMLButtonElement | null>(null);
  // From the title: today when the week on screen holds it, else that week's Monday. From a day: that day.
  const openMonth = (day: Date | null, opener: HTMLElement | null) => setSheet({ day: day ?? sheetStartDay(d.now, d.range), opener });
  // Every way out of the sheet lands here: the strip moves to the picked
  // day's week (the bounds hold) and that week is read again, so the strip
  // and the sheet (which read its months when it opened) say the same.
  const closeMonth = (picked: Date) => {
    setSheet(null);
    const offset = clampWeekOffset(weekOffsetOf(d.now, picked));
    d.setWeekOffset(offset);
    void d.refreshWeek(weekRangeAt(d.now, offset));
  };

  let list: React.ReactNode;
  if (pending) {
    list = <HomeSkeleton />;
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

  // The tab bar (64px + the safe area, fixed) is outside the column, so the
  // list area — and the no-clubs block centred in it — ends above it.
  return (
    <main style={{ background: t.page, color: t.ink, minHeight: "calc(100dvh - 64px - env(safe-area-inset-bottom, 0px))", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
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
            border: `1px solid ${t.fieldBorder}`,
            background: t.raisedSurface,
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

      <YourWeek
        entries={d.week}
        failure={d.weekErr}
        onRetry={d.retryWeek}
        now={d.now}
        range={d.range}
        offset={d.weekOffset}
        slide={d.weekSlide}
        onStep={d.stepWeek}
        onThisWeek={() => d.setWeekOffset(0)}
        onOpenMonth={openMonth}
        onOpenRoom={openRoom}
        titleRef={weekTitleRef}
      />

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
                      // Requests: the tinted count pill of `W0_Home:62` (the
                      // page's ink at .12); on the active chip, which no mockup
                      // draws, the chip's own ink at .12 by the same rule.
                      background: f === "all" ? t.coral : active ? (night ? "rgba(12,11,11,0.12)" : "rgba(250,247,242,0.12)") : "rgba(var(--scrim-rgb),0.12)",
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

      <section aria-label={LIST_LABEL[filter]} style={{ flexGrow: 1, minHeight: 0, paddingTop: 2, paddingBottom: 24, display: "flex", flexDirection: "column" }}>
        {list}
      </section>

      {sheet ? <MonthSheet initialDay={sheet.day} opener={sheet.opener} now={d.now} night={night} onClose={closeMonth} onOpenRoom={openRoom} returnFocusTo={weekTitleRef} /> : null}

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
