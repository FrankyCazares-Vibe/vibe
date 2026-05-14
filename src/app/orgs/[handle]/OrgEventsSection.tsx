"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type CampusEvent,
  CreateEventModal,
  type EligibleOrg,
  EventCard,
} from "@/app/campus/campus-home";

/**
 * Org-scoped events section. Lives on the org profile page (desktop +
 * mobile). Fetches `/api/events?org_id=<id>` so events from this org
 * are shown regardless of viewer's school.
 *
 * Admins / owners get a "+ Create event" button at the top that opens
 * the same CreateEventModal used on /campus, pre-scoped to this org.
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
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const canManage = viewerRole === "owner" || viewerRole === "admin";

  const refetch = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/events?org_id=${encodeURIComponent(orgId)}&limit=50`,
        { cache: "no-store" },
      );
      const j = await r.json();
      setEvents(
        j?.ok && Array.isArray(j.events) ? (j.events as CampusEvent[]) : [],
      );
    } catch {
      setEvents([]);
    }
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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
              color: "#fff",
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

      {events === null ? (
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
          {events.map((ev) => (
            <EventCard key={ev.id} ev={ev} onMutate={refetch} />
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
            void refetch();
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
