"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EventCard, type CampusEvent } from "@/app/campus/campus-home";
import { useCampusNow } from "@/components/campus/tonight/use-campus-now";
import { CHECKIN_ERRORS } from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

import { useClubEvents } from "./ClubEventsProvider";
import { pickUpNext, type UpNextPick } from "./up-next-steps";
import { UpNextSteps } from "./UpNextSteps";

/**
 * "Up next" (the club's view, wave 2, C9 item 7): the club's first upcoming
 * event, pinned above the tabs and drawn with the campus EventCard. It reads
 * the page's one events list (ClubEventsProvider), so an RSVP, an edit or a
 * cancel here shows in the Events tab too, and the other way round.
 *
 * Nothing while the list loads or when its read failed (the Events tab says
 * so), and nothing when no event is coming up, except a quiet line for the
 * officers who can post one with + (`officerHint`). No `data-event-anchor`
 * here: a `?event=` link scrolls to the Events tab's copy.
 *
 * THE OFFICERS' CARD (Oct 23, 2026; wave 3, B1). With `officerHint` (the
 * owner and officers of a club that isn't hidden) Up next is one card for
 * the whole night instead (UpNextSteps.tsx): the event the night is about,
 * which of its five steps it is on, and the next thing to do. Which event
 * is up-next-steps.ts's pick from this list and the officers' past read;
 * `latestPostAt` (the club's newest post) tells it a thank-you went up.
 * Members and visitors keep the event card above, unchanged.
 */
export function UpNext({
  officerHint,
  canPostEvents,
  latestPostAt,
  orgId,
  orgHandle,
}: {
  officerHint: boolean;
  canPostEvents: boolean;
  /** The club's newest post's `created_at`; null when it has none. */
  latestPostAt?: string | null;
  /** The club, for the officers' past read; else read off its events. */
  orgId?: string;
  orgHandle?: string;
}) {
  const { events } = useClubEvents();
  if (events === null) return null;
  if (officerHint) {
    return (
      <OfficerUpNext
        events={events}
        canPostEvents={canPostEvents}
        latestPostAt={latestPostAt}
        orgId={orgId}
        orgHandle={orgHandle}
      />
    );
  }
  const next = events[0];
  return next ? <UpNextEventCard next={next} /> : null;
}

/** The members' and visitors' Up next: the campus event card. */
function UpNextEventCard({ next }: { next: CampusEvent }) {
  const { refresh, remove, update, rev, rsvpAtHomeOnly } = useClubEvents();
  return (
    <section aria-label="Up next" style={{ marginTop: 18 }}>
      <UpNextEyebrow />
      <EventCard
        // Keyed on the Events tab's changes (`rev.upnext`), so an RSVP made
        // there redraws this copy from the fresh list.
        key={`${next.id}:${rev.upnext}`}
        ev={next}
        onMutate={() => void refresh("upnext")}
        onRemoved={remove}
        onUpdated={(n) => update(n, "upnext")}
        visiting={rsvpAtHomeOnly}
      />
    </section>
  );
}

function UpNextEyebrow() {
  return (
    <div
      style={{
        marginBottom: 8,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-muted)",
      }}
    >
      Up next
    </div>
  );
}

function NoEventHint({ canPostEvents }: { canPostEvents: boolean }) {
  return (
    <p
      style={{
        margin: "18px 0 0",
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px dashed var(--hairline)",
        color: "var(--ink-muted)",
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {/* Only a club Vibe checked can post events (the + sheet's New event
          is off otherwise): review F6. */}
      {canPostEvents ? "No event coming up. Post one with +." : "No event coming up. Events need a checked club."}
    </p>
  );
}

/**
 * The owner's and officers' Up next. It waits for the clock (0 until the
 * page is live in the browser) and for the past read's first answer, so the
 * card never opens on Going and jumps to Thank-you a moment later. The
 * minute clock moves it on by itself: Going becomes Check-in an hour before
 * the start, Thank-you an hour after the end.
 */
function OfficerUpNext({
  events,
  canPostEvents,
  latestPostAt,
  orgId,
  orgHandle,
}: {
  events: CampusEvent[];
  canPostEvents: boolean;
  latestPostAt: string | null | undefined;
  orgId: string | undefined;
  orgHandle: string | undefined;
}) {
  const { refresh } = useClubEvents();
  const now = useCampusNow(60_000);
  // The pick a dialog was opened on (review, Oct 23, 2026). While the event
  // form, the attendee list or the thank-you is open, the card stays on that
  // event though the clock or a re-read moves the night on: a new pick would
  // remount the card and throw the officer's draft away. Let go on close.
  const [held, setHeld] = useState<UpNextPick<CampusEvent> | null>(null);
  // The page's club, else the one its events belong to (every club event
  // carries it). With neither, there is no past read: nothing has ended.
  const clubId = orgId ?? events.find((e) => e.org_id)?.org_id ?? null;
  const { past, reread } = usePastEvents(clubId, events);

  const changed = useCallback(() => {
    reread();
    void refresh("upnext");
  }, [reread, refresh]);

  // Back from the door screen with the browser's Back button: the page comes
  // back from the back-forward cache with the counts it left with.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) changed();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [changed]);

  if (now === 0 || past === null) return null;
  const pick = held ?? pickUpNext({ upcoming: events, past, nowMs: now, latestPostAt });
  if (!pick) return <NoEventHint canPostEvents={canPostEvents} />;
  const handle = orgHandle ?? pick.event.org?.handle ?? null;
  // Every club event names its club; without one the card has no link to
  // share or page to post on, so the plain card stands in.
  if (!handle) return events[0] ? <UpNextEventCard next={events[0]} /> : null;
  return (
    <section aria-label="Up next" style={{ marginTop: 18 }}>
      <UpNextEyebrow />
      {/* Keyed on the event: another event's card starts with no dialog open. */}
      <UpNextSteps
        key={pick.event.id}
        pick={pick}
        nowMs={now}
        handle={handle}
        onChanged={changed}
        onHold={(on) => setHeld(on ? pick : null)}
      />
    </section>
  );
}

/**
 * The club's events that ended in the last 30 days, newest first (the
 * officers' read OrgPastEvents makes, five rows: the card only looks back
 * three days). Null until the first answer; a failed first read is an
 * empty list (the card still has the upcoming events), a failed re-read
 * keeps what it had. Read again whenever the upcoming list changes (an
 * event that ended while the page was open has left it by then) and on
 * `reread`. Only the newest read lands.
 */
function usePastEvents(
  orgId: string | null,
  upcoming: CampusEvent[],
): { past: CampusEvent[] | null; reread: () => void } {
  const [past, setPast] = useState<CampusEvent[] | null>(null);
  const [key, setKey] = useState(0);
  const seqRef = useRef(0);

  // The state is set in the answer's callback, never in the effect's own turn.
  useEffect(() => {
    if (!orgId) return;
    const seq = ++seqRef.current;
    void vibeRequest<{ events?: CampusEvent[] }>(
      `/api/events?org_id=${encodeURIComponent(orgId)}&when=past&limit=5`,
      { cache: "no-store", quiet: true, failure: CHECKIN_ERRORS.request_failed },
    ).then((r) => {
      if (seq !== seqRef.current) return;
      if (r.ok && Array.isArray(r.data.events)) setPast(r.data.events);
      else setPast((prev) => prev ?? []);
    });
    return () => {
      // Leaving, or a newer read: an answer still out is dropped.
      seqRef.current += 1;
    };
  }, [orgId, upcoming, key]);

  const reread = useCallback(() => setKey((k) => k + 1), []);
  return { past: orgId ? past : [], reread };
}
