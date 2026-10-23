/**
 * One item of GET /api/events, built in one place (S68 officer tools, B1):
 * the list uses it for every row, and PATCH /api/events/[id] answers with
 * the edited event in exactly the same shape, so a client can swap the card
 * in place.
 *
 * The key order is the one GET has always sent: the row (club rows with
 * `creator: null`), then going_count, interested_count, viewer_status,
 * is_creator, viewer_can_manage, org; then the three event check-in fields
 * (checkin_open, checked_in_count, viewer_checked_in, Oct 19 2026), last so
 * the old keys keep their places; then `visibility` ("everyone" | "members",
 * Oct 22, 2026, "Members only" events), the very last key for the same
 * reason. The row's own `visibility` is lifted out of its select-order place
 * and put there, read by `eventVisibilityOf` (missing or junk = "everyone").
 * Then `icon` (Oct 23, 2026, club view wave 3, batch B4): one of the twelve
 * keys of event-icons.ts or null (none: the calendar), lifted out the same
 * way and put after `visibility`, the new very last key, read by
 * `eventIconOf` (missing or junk = null).
 */

import { checkinListFields, type CheckinStateRow } from "@/lib/events/event-checkin";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";

import { eventIconOf } from "./event-icons";
import { viewerCanManage, withoutClubCreator } from "./manage";
import { eventVisibilityOf } from "./validate";

/**
 * The columns every events read selects (plus the creator embed on GET).
 * `visibility` (20261025100000), then `icon` (20261027100000, Oct 23, 2026),
 * last: the code needs both columns, so each migration is applied before
 * the code that reads it deploys (their headers say so).
 */
export const EVENT_ROW_COLUMNS =
  "id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at,visibility,icon";

export type EventListRow = {
  id: string;
  org_id: string | null;
  creator_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  created_at: string;
  /** "everyone" | "members" from the database; optional so older fixtures still type. */
  visibility?: string | null;
  /** One of event-icons.ts's keys or null (none); optional for the same reason. */
  icon?: string | null;
  // Club rows come back with `{ id }` only (the club creator embed) and leave
  // as `creator: null` (withoutClubCreator); org-less rows, in full.
  creator: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
    school: string | null;
    campus_id: string | null;
  } | null;
};

/** Org attribution, always resolved with the service role (see GET). */
export type EventOrgCard = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
};

export type EventViewerStatus = "going" | "maybe";

/** A count from an RPC row as a whole number: NaN, negatives or missing -> 0. */
export function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export function toEventListItem(
  row: EventListRow,
  ctx: {
    viewerId: string;
    /** A CURRENT owner/admin of row.org_id (viewerCanManage's rule). */
    viewerIsOfficer: boolean;
    org: EventOrgCard | null;
    goingCount: number;
    interestedCount: number;
    viewerStatus: EventViewerStatus | null;
    /**
     * The event's `event_checkin_state` row. Left out (or a failed read)
     * means "nothing known": not open, no count, not checked in. The from-5
     * floor is already applied by the database.
     */
    checkin?: CheckinStateRow;
  },
) {
  const org = ctx.org;
  // Out of the row's place, back in at the very end (see the header).
  const { visibility, icon, ...rest } = row;
  return {
    ...withoutClubCreator(rest),
    going_count: ctx.goingCount,
    interested_count: ctx.interestedCount,
    viewer_status: ctx.viewerStatus,
    // `is_creator` only hides Report on your own event (the report route
    // refuses its creator); it grants nothing.
    is_creator: row.creator_id === ctx.viewerId,
    viewer_can_manage: viewerCanManage({
      orgId: row.org_id,
      creatorId: row.creator_id,
      viewerId: ctx.viewerId,
      viewerIsOfficer: ctx.viewerIsOfficer,
    }),
    // Same shape the old `org:orgs(...)` embed produced, so no client changes.
    org: org ? { ...org, logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo") } : null,
    // After `org` on purpose: the three new keys come last.
    ...checkinListFields(ctx.checkin),
    // Then (Oct 22, 2026): who can see it, for the "Members only" chip.
    visibility: eventVisibilityOf(visibility),
    // After it (Oct 23, 2026): the event's icon, null for the calendar.
    icon: eventIconOf(icon),
  };
}

export type EventListItem = ReturnType<typeof toEventListItem>;
