/**
 * One item of GET /api/events, built in one place (S68 officer tools, B1):
 * the list uses it for every row, and PATCH /api/events/[id] answers with
 * the edited event in exactly the same shape, so a client can swap the card
 * in place.
 *
 * The key order is the one GET has always sent: the row (club rows with
 * `creator: null`), then going_count, interested_count, viewer_status,
 * is_creator, viewer_can_manage, org.
 */

import { orgAssetProxyUrl } from "@/lib/org-asset-url";

import { viewerCanManage, withoutClubCreator } from "./manage";

/** The columns every events read selects (plus the creator embed on GET). */
export const EVENT_ROW_COLUMNS =
  "id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at";

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
  },
) {
  const org = ctx.org;
  return {
    ...withoutClubCreator(row),
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
  };
}

export type EventListItem = ReturnType<typeof toEventListItem>;
