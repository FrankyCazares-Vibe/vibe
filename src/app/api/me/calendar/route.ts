import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org: { handle: string; name: string; verified: boolean } | null;
  } | null;
};

type PersonalRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  notes: string;
  color: string;
};

export type CalendarEntry =
  | {
      kind: "rsvp";
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      location: string;
      color: string;
      viewer_status: "going" | "maybe";
      org: { handle: string; name: string; verified: boolean } | null;
    }
  | {
      kind: "personal";
      id: string;
      title: string;
      starts_at: string;
      ends_at: string | null;
      location: string;
      notes: string;
      color: string;
    };

/**
 * Unified calendar feed — RSVP'd public events + personal calendar entries.
 *
 * Default window: from 30 days ago to 180 days ahead, so the LeftNav month
 * grid can show a few prior months without re-fetching.
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
  const from =
    url.searchParams.get("from") ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to =
    url.searchParams.get("to") ??
    new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const [rsvpRes, personalRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select(
        "status," +
          "event:events!inner(id,title,starts_at,ends_at,location," +
          "org:orgs(handle,name,verified)" +
          ")",
      )
      .eq("user_id", user.id)
      .in("status", ["going", "maybe"])
      .gte("event.starts_at", from)
      .lte("event.starts_at", to),
    supabase
      .from("personal_events")
      .select("id,title,starts_at,ends_at,location,notes,color")
      .eq("user_id", user.id)
      .gte("starts_at", from)
      .lte("starts_at", to),
  ]);

  if (rsvpRes.error) {
    console.error("[me/calendar rsvps]", rsvpRes.error);
  }
  if (personalRes.error) {
    console.error("[me/calendar personal]", personalRes.error);
  }

  const entries: CalendarEntry[] = [];

  for (const row of (rsvpRes.data as unknown as RsvpRow[]) ?? []) {
    if (!row.event) continue;
    const ev = row.event;
    entries.push({
      kind: "rsvp",
      id: ev.id,
      title: ev.title,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at,
      location: ev.location,
      color: row.status === "going" ? "#5BD18C" : "#FFB85A",
      viewer_status: row.status as "going" | "maybe",
      org: ev.org,
    });
  }

  for (const row of (personalRes.data as unknown as PersonalRow[]) ?? []) {
    entries.push({
      kind: "personal",
      id: row.id,
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      location: row.location,
      notes: row.notes,
      color: row.color,
    });
  }

  entries.sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
  );

  return NextResponse.json({ ok: true, entries });
}
