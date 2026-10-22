import { NextResponse } from "next/server";

import { eventVisibilityOf } from "@/lib/events/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
/** `?days=` ceiling: the strip asks for 14, nobody needs more than two months. */
const MAX_DAYS = 60;

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    visibility?: string | null;
    org: {
      handle: string;
      name: string;
      verified: boolean;
    } | null;
  } | null;
};

/**
 * Events the viewer has RSVP'd to (Going + Interested) that haven't ended
 * yet. Drives Otto's "Coming up" panel — replaces the old hardcoded list —
 * and, since S67 wave 1, the Feed tab's rolling strip.
 *
 * `?days=<n>` (optional, 1–60) keeps only events that START within the next
 * n days; the strip passes 14 so a far-off RSVP doesn't take one of its three
 * slots. Absent, junk or non-positive means no horizon, which is what Otto's
 * panel and every deployed caller get today.
 *
 * Read on the viewer's client, so a members-only event of a club they left
 * is not here (`event_visible`, Oct 22, 2026); each row carries `visibility`.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const daysRaw = url.searchParams.get("days");
  const daysNum = daysRaw === null ? NaN : Number(daysRaw);
  const days = Number.isFinite(daysNum) && daysNum > 0 ? Math.min(MAX_DAYS, Math.ceil(daysNum)) : null;
  const horizonIso = days === null ? null : new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("rsvps")
    .select(
      "status," +
        "event:events!inner(id,title,starts_at,ends_at,location,visibility," +
        "org:orgs(handle,name,verified)" +
        ")",
    )
    .eq("user_id", user.id)
    .in("status", ["going", "maybe"])
    .gte("event.ends_at", nowIso);
  // Same embedded-column filter shape as the `ends_at` one above; the
  // `!inner` join makes it drop the row rather than null the event.
  if (horizonIso) query = query.lte("event.starts_at", horizonIso);
  const { data, error } = await query
    .order("event(starts_at)", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[me/upcoming-events]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const rows = (data as unknown as RsvpRow[]) ?? [];
  const upcoming = rows
    .filter((r) => r.event)
    .map((r) => ({
      id: (r.event as NonNullable<RsvpRow["event"]>).id,
      title: (r.event as NonNullable<RsvpRow["event"]>).title,
      starts_at: (r.event as NonNullable<RsvpRow["event"]>).starts_at,
      ends_at: (r.event as NonNullable<RsvpRow["event"]>).ends_at,
      location: (r.event as NonNullable<RsvpRow["event"]>).location,
      org: (r.event as NonNullable<RsvpRow["event"]>).org,
      viewer_status: r.status as "going" | "maybe",
      // Last (Oct 22, 2026): "members" = the club's members only, for the chip.
      visibility: eventVisibilityOf((r.event as NonNullable<RsvpRow["event"]>).visibility),
    }));

  return NextResponse.json({ ok: true, upcoming });
}
