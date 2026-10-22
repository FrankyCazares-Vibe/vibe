"use client";

/**
 * "You're going to 2 members-only events" in a leave confirm (Franky, Oct 22,
 * 2026: "if it's a members only event and they leave, provide a popup warning
 * about it being removed or cancelled on your end"; PLAN-3.md). One hook and
 * one block for the three confirms: the club page's ⋯ (OrgMenu), Club tools ›
 * Club settings (SettingsScreen, phone and the computer's panel) and desktop
 * Settings › Danger (campus-home).
 *
 * `useLeavePreview` asks `GET /api/orgs/<handle>/join?leave_preview=1` once
 * when the confirm opens. Quiet on purpose: while it loads, or if it fails,
 * the confirm reads exactly as before and Leave works (the route drops the
 * RSVPs either way). Every word is `leaveWarningView`'s (join-copy.ts).
 *
 * Theme tokens only, in the confirms' danger ink: the block follows Night and
 * Light, and a host that is dark in both looks (desktop Settings' glass)
 * passes `night` to take the Night column on this element only
 * (`.vibe-night-island`). Fits 375px: titles truncate, the day never does.
 */
import { useEffect, useState, type CSSProperties, type JSX } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import {
  CAMPUS_TIME_ZONE,
  ORG_COPY,
  leaveRsvpEventsOf,
  leaveWarningView,
  type LeaveRsvpEvent,
} from "@/lib/orgs/join-copy";

/** The viewer's members-only RSVPs this leave would take away; empty until (and unless) the read lands. */
export function useLeavePreview(handle: string): readonly LeaveRsvpEvent[] {
  const [events, setEvents] = useState<readonly LeaveRsvpEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    void vibeRequest<{ events?: unknown }>(`/api/orgs/${encodeURIComponent(handle)}/join?leave_preview=1`, {
      cache: "no-store",
      quiet: true,
      failure: ORG_COPY.menu.leaveRsvpsLoadFailed,
    }).then((r) => {
      if (!cancelled && r.ok) setEvents(leaveRsvpEventsOf(r.data.events));
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return events;
}

export function LeaveWarning({
  events,
  night = false,
  style,
}: {
  events: readonly LeaveRsvpEvent[];
  /** The host is dark in both looks: read the Night tokens here. */
  night?: boolean;
  /** Placement only (a margin); the look is the block's own. */
  style?: CSSProperties;
}): JSX.Element | null {
  const view = leaveWarningView(events, CAMPUS_TIME_ZONE);
  if (!view) return null;
  // role="alert", not "note" (review, Oct 22, 2026): the block arrives after
  // the confirm has opened (the ⋯ one with focus already on Cancel), so a
  // screen reader already on the buttons would never hear it; an alert is
  // read out the moment it appears.
  return (
    <div role="alert" className={night ? "vibe-night-island" : undefined} style={{ ...boxStyle, ...style }}>
      <p style={titleStyle}>{view.title}</p>
      <p style={bodyStyle}>{view.body}</p>
      <ul style={listStyle}>
        {view.items.map((item) => (
          <li key={item.key} style={itemStyle}>
            <span style={eventTitleStyle}>{item.title}</span>
            {item.date ? <span style={dateStyle}>{` · ${item.date}`}</span> : null}
          </li>
        ))}
        {view.more ? <li style={{ ...itemStyle, color: "var(--ink-muted)" }}>{view.more}</li> : null}
      </ul>
    </div>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────

const boxStyle: CSSProperties = {
  boxSizing: "border-box",
  minWidth: 0,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid var(--error-ink)",
  background: "transparent",
  fontFamily: "DM Sans, sans-serif",
  textAlign: "left",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.35,
  color: "var(--error-ink)",
  overflowWrap: "anywhere",
};

const bodyStyle: CSSProperties = { margin: "2px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--ink-2)" };

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const itemStyle: CSSProperties = {
  display: "flex",
  minWidth: 0,
  fontSize: 13,
  lineHeight: 1.4,
  color: "var(--charcoal)",
};

const eventTitleStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const dateStyle: CSSProperties = { flexShrink: 0, whiteSpace: "pre", color: "var(--ink-muted)" };
