"use client";

import { useState } from "react";

import { CreateEventModal, type EligibleOrg, EventCard } from "@/app/campus/campus-home";
import { LoadFailed } from "@/components/feedback/LoadFailed";

import { useClubEvents } from "./club-page/ClubEventsProvider";
import { LinkedFlash, LinkedFocusStyle, useLinkedEvent } from "./linked-event";

/**
 * Org-scoped events section: the club page's Events tab. The list itself is
 * read once for the page by ClubEventsProvider (club-page/), which the
 * pinned Up next card reads too (the club's view, wave 2): events from this
 * org whatever the viewer's school, `/api/events?org_id=<id>`.
 *
 * Admins / owners get a "+ Create event" button at the top that opens
 * the same CreateEventModal used on /campus, pre-scoped to this org.
 *
 * `rsvpAtHomeOnly` (S67 wave 4, now on the provider): the club is on a
 * campus that isn't the viewer's home, so every card renders its RSVP off
 * with "RSVP works at home", the same state the campus Events tab shows
 * while visiting. The RSVP route refuses it anyway (403 `campus_visiting`);
 * the card turns that answer into "RSVP works on your home campus" if the
 * page guessed wrong.
 *
 * `?event=<id>` (Oct 19, 2026, critique D13): a calendar event opens here.
 * Once the list has loaded, the linked card scrolls into view and flashes
 * (linked-event.tsx); if neither this list nor the past one has it, a toast
 * says it isn't listed anymore. The provider passes the id as `include`
 * (Oct 19, 2026 repair): My Calendar reaches 180 days ahead and this list
 * stops at 60 days and 50 rows, so a January formal would otherwise be
 * "not listed" while it is still on. Only this list answers for the page:
 * the Up next card carries no anchor, so the scroll lands here.
 */
export function OrgEventsSection({
  orgId,
  orgName,
  orgHandle,
  orgVerified,
  viewerRole,
}: {
  orgId: string;
  orgName: string;
  orgHandle: string;
  orgVerified: boolean;
  viewerRole: string | null;
}) {
  const { events, loadErr, retry, refresh, remove, update, rev, rsvpAtHomeOnly } = useClubEvents();
  const [createOpen, setCreateOpen] = useState(false);

  const canManage = viewerRole === "owner" || viewerRole === "admin";
  // A failed first read can't say the linked event is gone.
  const linkedId = useLinkedEvent(
    "upcoming",
    events === null ? (loadErr ? "unknown" : null) : events.map((e) => e.id),
  );

  return (
    <section
      style={{
        padding: "clamp(12px, 3.6vw, 16px)",
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.55)",
          }}
        >
          Upcoming events
        </span>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              background:
                "linear-gradient(135deg,#FF7A4D 0%,#FF5C35 60%,#E04A26 100%)",
              // Dark words on the coral fill (4.8:1 at its darkest corner);
              // white was 3.1:1.
              color: "var(--on-coral, #160A06)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.02em",
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(255,92,53,0.36)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            + Create event
          </button>
        ) : null}
      </div>

      {events === null && loadErr ? (
        <LoadFailed
          tone="dark"
          failure={loadErr}
          onRetry={retry}
        />
      ) : events === null ? (
        <Skeleton />
      ) : events.length === 0 ? (
        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {canManage
            ? "No events scheduled yet — hit + Create event to add one."
            : "No events scheduled yet. Check back soon."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {linkedId ? <LinkedFocusStyle /> : null}
          {events.map((ev) => (
            // The anchor `?event=` scrolls to (EVENT_ANCHOR_ATTR).
            // Keyed on the Up next card's changes too (`rev.list`), so an
            // RSVP made there redraws this copy from the fresh list.
            <div
              key={`${ev.id}:${rev.list}`}
              data-event-anchor={ev.id}
              tabIndex={ev.id === linkedId ? -1 : undefined}
              // No `outline: none` (Oct 19, 2026 repair): LinkedFocusStyle
              // keeps a coral outline while the wrapper has focus, after the
              // flash has faded.
              style={{ position: "relative", borderRadius: 16 }}
            >
              {ev.id === linkedId ? <LinkedFlash /> : null}
              <EventCard
                ev={ev}
                onMutate={() => void refresh("list")}
                // An officer's Cancel / Delete / Edit (S68): the list changes
                // at once, no refetch.
                onRemoved={remove}
                onUpdated={(next) => update(next, "list")}
                visiting={rsvpAtHomeOnly}
              />
            </div>
          ))}
        </div>
      )}

      {createOpen ? (
        <CreateEventModal
          eligibleOrgs={
            [
              {
                id: orgId,
                name: orgName,
                handle: orgHandle,
                verified: orgVerified,
                role: viewerRole ?? "member",
              },
            ] as EligibleOrg[]
          }
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh("list");
          }}
        />
      ) : null}
    </section>
  );
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            height: 96,
            borderRadius: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}
