"use client";

/**
 * useClubEvents(url): the club events the desktop Feed's Tonight panel
 * ranks (C2, CONTRACT.md §6.1). It is the same GET /api/events the Events
 * tab reads (campus-scoped on the server, hidden and unverified clubs
 * already dropped, counts attached); the panel filters it to tonight. The
 * Feed tab had no copy of that list, so this is its one extra read.
 *
 * `url` comes from the campus helper (`view.url("/api/events?limit=50")`),
 * so a visit to another campus reads that campus. Reads on mount, when the
 * url changes, and on a return to the tab after two minutes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { CampusEvent } from "@/app/campus/campus-home";
import { vibeRequest } from "@/lib/feedback/request";

/** A return to the tab reads again only when the last read is this old. */
const RESYNC_MS = 120_000;

export type ClubEventsState = { events: CampusEvent[] | null; failed: boolean };

/** What the hook remembers: the answer, and which url it answers (so a new url starts as loading). */
type Answer = { url: string; events: CampusEvent[]; failed: boolean };

const LOADING: ClubEventsState = { events: null, failed: false };

export function useClubEvents(url: string): ClubEventsState {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const seqRef = useRef(0);
  const atRef = useRef(0);
  // The last good list per url: a refresh that fails keeps it on screen
  // instead of blanking the club rows over a blip.
  const goodRef = useRef<{ url: string; events: CampusEvent[] } | null>(null);

  const read = useCallback(async (target: string) => {
    const seq = ++seqRef.current;
    atRef.current = Date.now();
    // Quiet: the panel is a side view; a failure just drops the club rows.
    const r = await vibeRequest<{ events?: CampusEvent[] }>(target, {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load events.",
    });
    if (seq !== seqRef.current) return;
    if (r.ok && Array.isArray(r.data?.events)) {
      goodRef.current = { url: target, events: r.data.events };
      setAnswer({ url: target, events: r.data.events, failed: false });
      return;
    }
    const kept = goodRef.current?.url === target ? goodRef.current.events : null;
    setAnswer(kept ? { url: target, events: kept, failed: false } : { url: target, events: [], failed: true });
  }, []);

  // On mount and on a new url. The answer lands in `read` after its await,
  // never in the effect itself.
  useEffect(() => {
    const run = async () => {
      await read(url);
    };
    void run();
    return () => {
      // A late answer for the old url (or an unmounted panel) is dropped.
      seqRef.current += 1;
    };
  }, [url, read]);

  // Back to the tab after two minutes: tonight's list may have changed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - atRef.current >= RESYNC_MS) void read(url);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [url, read]);

  // An answer for another url (the campus just changed) is not this one's:
  // loading until the new read lands, so one campus's events never sit
  // under another's name.
  if (!answer || answer.url !== url) return LOADING;
  return { events: answer.events, failed: answer.failed };
}
