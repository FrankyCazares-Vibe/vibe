"use client";

import { EventCard } from "@/app/campus/campus-home";

import { useClubEvents } from "./ClubEventsProvider";

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
 */
export function UpNext({ officerHint }: { officerHint: boolean }) {
  const { events, refresh, remove, update, rev, rsvpAtHomeOnly } = useClubEvents();
  if (events === null) return null;
  const next = events[0];
  if (!next) {
    return officerHint ? (
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
        No event coming up. Post one with +.
      </p>
    ) : null;
  }
  return (
    <section aria-label="Up next" style={{ marginTop: 18 }}>
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
