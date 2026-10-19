"use client";

/**
 * The school calendars for the campus on screen (Oct 19 2026): one read of
 * GET /api/school-events on mount and when the URL changes (visiting another
 * campus), and again when the tab comes back after 10 minutes.
 *
 * NEVER AN ERROR BOX. The school part is a bonus on top of the app: a failed
 * first read lands as "ready" with `on: false`, so every school part just
 * isn't drawn (no toast, no retry button). A failed LATER read keeps what is
 * on screen, because a calendar blip shouldn't make tonight's game vanish.
 *
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.4.
 */
import { useEffect, useRef, useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import type { SchoolEvent, SchoolEventsResponse, SchoolSource } from "@/lib/school-events/types";

import type { SchoolEventsState } from "./types";
import { devNowOverride } from "./use-campus-now";

/** The server's cache is 2 h; coming back to the tab re-reads after 10 min so a new day's list shows. */
const REFRESH_AFTER_MS = 10 * 60_000;

const LOADING: SchoolEventsState = { status: "loading", on: false, events: [], sources: [] };
const OFF: SchoolEventsState = { status: "ready", on: false, events: [], sources: [] };

/** Development only: the faked clock goes to the server too, so the fixtures line up with the page. */
function requestUrl(url: string): string {
  const fake = devNowOverride();
  if (fake === null) return url;
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("now", new Date(fake).toISOString());
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function isEvent(v: unknown): v is SchoolEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.source === "string" &&
    typeof e.title === "string" &&
    typeof e.starts_at === "string" &&
    typeof e.ends_at === "string" &&
    (e.kind === "game" || e.kind === "event")
  );
}

function isSource(v: unknown): v is SchoolSource {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.key === "string" && typeof s.credit === "string" && typeof s.calendar_url === "string";
}

/** A 200 that isn't the shape (an old server, a proxy page) reads as "off", never as a crash. */
function toState(body: SchoolEventsResponse | null | undefined): SchoolEventsState | null {
  if (!body || body.ok !== true || !Array.isArray(body.events) || !Array.isArray(body.sources)) return null;
  if (body.school_on !== true) return OFF;
  const sources = body.sources.filter(isSource);
  if (sources.length === 0) return OFF;
  return { status: "ready", on: true, events: body.events.filter(isEvent), sources };
}

/** `url`: view.url("/api/school-events") on desktop, withCampus(...) on the phone. */
export function useSchoolEvents(url: string): SchoolEventsState {
  // Kept with the URL it answers, so a campus change reads as loading at once
  // (no stale campus's games) without resetting state inside the effect.
  const [answer, setAnswer] = useState<{ url: string; state: SchoolEventsState } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    let lastReadAt = 0;
    const load = async () => {
      // Only the newest read lands: a late answer for an old URL is dropped.
      const seq = ++seqRef.current;
      lastReadAt = Date.now();
      const r = await vibeRequest<SchoolEventsResponse>(requestUrl(url), {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load school events.",
      });
      if (!alive || seq !== seqRef.current) return;
      const next = r.ok ? toState(r.data) : null;
      setAnswer((prev) => {
        if (next) return { url, state: next };
        // Failed: keep this URL's last good answer; with none, the school part is off.
        if (prev && prev.url === url && prev.state.status === "ready") return prev;
        return { url, state: OFF };
      });
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastReadAt < REFRESH_AFTER_MS) return;
      void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url]);

  if (!answer || answer.url !== url) return LOADING;
  return answer.state;
}
