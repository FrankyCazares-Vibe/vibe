import { NextResponse } from "next/server";

import { eventRefsFor, type EventRow } from "@/lib/chat/event-refs";
import { chatV2For } from "@/lib/chat/flag-server";
import type { CalendarRoomFields } from "@/lib/chat/types";
import { eventVisibilityOf, type EventVisibility } from "@/lib/events/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RsvpRow = {
  status: "going" | "maybe" | "no";
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org_id: string | null;
    visibility?: string | null;
    org: { handle: string; name: string; verified: boolean } | null;
  } | null;
};

type OrgCard = { handle: string; name: string; verified: boolean };

/**
 * The club's name and handle for RSVPs whose embed came back null, read with
 * the SERVICE client (Oct 19, 2026, critique B8 repair).
 *
 * Why: the `org:orgs(...)` embed runs under the viewer's client, and
 * `orgs_select` is `(is_public OR member) AND (hidden_at IS NULL OR member)`.
 * SAE is `is_public = false`, so a prospect who RSVPs to its rush event got
 * `org: null`, and with it no link to the club page, no club name in the day
 * panel and a plain tile on the phone. /api/events has the same trap and joins
 * attribution with the service client the same way.
 *
 * The hidden-club rule stays as it was: a hidden club is named only to its
 * own members, and those already get it from the embed. Only ids leave the
 * query; a failed read (or no service key) leaves `org` null, never a 500.
 */
async function orgCardsFor(rows: RsvpRow[]): Promise<Map<string, OrgCard>> {
  const out = new Map<string, OrgCard>();
  const ids = [
    ...new Set(
      rows
        .filter((row) => row.event && row.event.org_id && !row.event.org)
        .map((row) => row.event!.org_id as string),
    ),
  ];
  if (ids.length === 0) return out;
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("orgs")
      .select("id,handle,name,verified,hidden_at")
      .in("id", ids);
    if (error) {
      console.error("[me/calendar org attribution]", error);
      return out;
    }
    for (const row of (data as { id: string; handle: string; name: string; verified: boolean | null; hidden_at: string | null }[] | null) ?? []) {
      if (row.hidden_at) continue;
      out.set(row.id, { handle: row.handle, name: row.name, verified: row.verified === true });
    }
  } catch (err) {
    console.error("[me/calendar org attribution]", err instanceof Error ? err.message : err);
  }
  return out;
}

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
      // No colour (Oct 19, 2026, critique D13): the client paints an RSVP
      // by `viewer_status` (Going solid coral, Interested a coral outline),
      // so the old green and amber can't be mistaken for a personal colour.
      viewer_status: "going" | "maybe";
      org: { handle: string; name: string; verified: boolean } | null;
      /** Who can see it (Oct 22, 2026): "members" = the club's members only, the chip. */
      visibility: EventVisibility;
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
 *
 * Members only (Oct 22, 2026): the RSVPs are read on the viewer's client, so
 * `event_visible` drops a members-only event of a club they left (the inner
 * join leaves the row out); each `rsvp` entry carries `visibility`.
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
          "event:events!inner(id,title,starts_at,ends_at,location,org_id,visibility," +
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
  const [flagOn, orgById] = await Promise.all([chatV2For(user.id), orgCardsFor(rsvpRows)]);
  let refs: Awaited<ReturnType<typeof eventRefsFor>> = null;
  if (flagOn && rsvpRows.length > 0) {
    const events: EventRow[] = rsvpRows.map((row) => {
      const ev = row.event as NonNullable<RsvpRow["event"]>;
      return { id: ev.id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, location: ev.location, org_id: ev.org_id ?? null, visibility: ev.visibility ?? null };
    });
    try {
      refs = await eventRefsFor(events, user.id, { counts: false });
    } catch (err) {
      // The calendar never answers 500 for the three fields (7.3).
      refs = null;
      console.error("[me/calendar rooms]", err instanceof Error ? err.message : err);
    }
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
      viewer_status: row.status as "going" | "maybe",
      org: ev.org ?? (ev.org_id ? orgById.get(ev.org_id) ?? null : null),
      visibility: eventVisibilityOf(ev.visibility),
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
