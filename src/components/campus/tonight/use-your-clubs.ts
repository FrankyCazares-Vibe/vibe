"use client";

/**
 * useYourClubs(): the data behind "Your clubs" on the desktop Feed (C2,
 * CONTRACT.md §4). No new route: it makes the same two reads Messages home
 * makes (useHomeData, MessagesHome.tsx), in parallel, and merges them with
 * the pure `mergeYourClubs`. Neither read is campus-scoped: these are the
 * student's own clubs, also while visiting another campus.
 *
 * Reads on mount, then again when the tab comes back into view if the last
 * read is two minutes old or more (or right away while one of the two has
 * never answered). No polling timer on purpose: the Otto corner already
 * reads the inbox every 30 s for its badge, and a second one would double
 * that load for a side panel.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { FollowedBoard, FollowedBoardsResponse, InboxClub, InboxResponse } from "@/lib/chat/types";
import { vibeRequest } from "@/lib/feedback/request";
import { ORG_COPY } from "@/lib/orgs/join-copy";

import type { YourClubsState } from "./types";
import { yourClubsState } from "./your-clubs-view";

/** A return to the tab reads again only when the last read is this old. */
const RESYNC_MS = 120_000;

export function useYourClubs(): YourClubsState {
  const [state, setState] = useState<YourClubsState>({ status: "loading", rows: [] });
  // The last good answer of each read (null = never answered). A refresh
  // that fails keeps it, so a blip never empties the panel. yourClubsState
  // decides from these two: the empty state only when both have answered,
  // so one failed read can't tell a member to go join a club.
  const inboxRef = useRef<InboxClub[] | null>(null);
  const boardsRef = useRef<FollowedBoard[] | null>(null);
  // Only the newest read lands (a slow answer can't overwrite a newer one),
  // and an unmount drops whatever is still out.
  const seqRef = useRef(0);
  const atRef = useRef(0);

  const read = useCallback(async () => {
    const seq = ++seqRef.current;
    atRef.current = Date.now();
    // Quiet: a side panel never toasts. A 404 (the chat flag off for this
    // account) is just one more failed read.
    const [ir, br] = await Promise.all([
      vibeRequest<InboxResponse>("/api/me/inbox", { cache: "no-store", quiet: true, failure: "Couldn't load your clubs." }),
      vibeRequest<FollowedBoardsResponse>("/api/me/club-boards", {
        cache: "no-store",
        quiet: true,
        failure: ORG_COPY.board.followedLoadFailed,
      }),
    ]);
    if (seq !== seqRef.current) return;
    if (ir.ok && Array.isArray(ir.data?.clubs)) inboxRef.current = ir.data.clubs;
    if (br.ok && Array.isArray(br.data?.boards)) boardsRef.current = br.data.boards;
    setState(yourClubsState(inboxRef.current, boardsRef.current));
  }, []);

  // The first read. The answer lands in `read` after its await, never in the
  // effect itself.
  useEffect(() => {
    const run = async () => {
      await read();
    };
    void run();
    return () => {
      // Anything still out belongs to a panel that is gone.
      seqRef.current += 1;
    };
  }, [read]);

  // Back to the tab: fresh Board lines, at most once per two minutes, or
  // straight away while a read has never answered (a deploy blip hid the
  // panels; looking again is the cheapest way to bring them back).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const missing = inboxRef.current === null || boardsRef.current === null;
      if (missing || Date.now() - atRef.current >= RESYNC_MS) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [read]);

  return state;
}

/** How often the Board ages are re-read. They print minutes at the finest. */
const AGE_STEP_MS = 60_000;
/** The clock's value for the current minute: React needs one value between ticks. */
let ageNow = 0;

function readAgeNow(): number {
  const real = Date.now();
  if (Math.floor(real / AGE_STEP_MS) !== Math.floor(ageNow / AGE_STEP_MS)) ageNow = real;
  return ageNow;
}

function subscribeAgeNow(onChange: () => void): () => void {
  const timer = setInterval(onChange, AGE_STEP_MS);
  // Background tabs throttle timers: catch up the moment the tab is seen.
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function serverAgeNow(): number {
  return 0;
}

/**
 * The real clock for "3h" beside a Board line, re-read once a minute and on
 * a return to the tab. Not useCampusNow on purpose: in development that
 * clock runs from `?tonight_now` (a faked campus moment for Tonight), and a
 * post's age is a real-world fact that must not move with the fake. 0 on
 * the server and during hydration, so the first paint matches; callers draw
 * no age until it is known.
 */
export function useBoardNow(): number {
  return useSyncExternalStore(subscribeAgeNow, readAgeNow, serverAgeNow);
}
