import { NextResponse } from "next/server";

import { eventRefsFor, type EventRow } from "@/lib/chat/event-refs";
import { chatV2For } from "@/lib/chat/flag-server";
import type { CalendarRoomFields } from "@/lib/chat/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org_id: string | null;
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
    } & CalendarRoomFields
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
 *
 * Club chat, wave 2 (handoffs/chat-redesign/wave-2-contracts.md 7.3): every
 * `rsvp` entry carries `org_id`, `room_id` and `room_state`. With
 * `chat_v2` off for the caller, or when the refs could not be built, all
 * three are null; the calendar never answers 500 for them. Not gated.
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
          "event:events!inner(id,title,starts_at,ends_at,location,org_id," +
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

  // The room behind each RSVP'd event (7.3): `eventRefsFor` with no counts
  // (the calendar sends none). Flag off → the three fields null.
  const rsvpRows = ((rsvpRes.data as unknown as RsvpRow[]) ?? []).filter((row) => row.event !== null);
  const flagOn = await chatV2For(user.id);
  let refs: Awaited<ReturnType<typeof eventRefsFor>> = null;
  if (flagOn && rsvpRows.length > 0) {
    const events: EventRow[] = rsvpRows.map((row) => {
      const ev = row.event as NonNullable<RsvpRow["event"]>;
      return { id: ev.id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, location: ev.location, org_id: ev.org_id ?? null };
    });
    refs = await eventRefsFor(events, user.id, { counts: false });
    if (refs === null) console.error("[me/calendar rooms] event refs could not be built; the room fields are null");
  }

  for (const row of rsvpRows) {
    if (!row.event) continue;
    const ev = row.event;
    const ref = refs?.get(ev.id) ?? null;
    const rooms: CalendarRoomFields = ref
      ? { org_id: ev.org_id ?? null, room_id: ref.room_id, room_state: ev.org_id ? ref.state : null }
      : { org_id: null, room_id: null, room_state: null };
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
      ...rooms,
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
