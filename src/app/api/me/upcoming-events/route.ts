import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org: {
      handle: string;
      name: string;
      verified: boolean;
    } | null;
  } | null;
};

/**
 * Events the viewer has RSVP'd to (Going + Interested) that haven't ended
 * yet. Drives Otto's "Coming up" panel — replaces the old hardcoded list.
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

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("rsvps")
    .select(
      "status," +
        "event:events!inner(id,title,starts_at,ends_at,location," +
        "org:orgs(handle,name,verified)" +
        ")",
    )
    .eq("user_id", user.id)
    .in("status", ["going", "maybe"])
    .gte("event.ends_at", nowIso)
    .order("event(starts_at)", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[me/upcoming-events]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
    }));

  return NextResponse.json({ ok: true, upcoming });
}
