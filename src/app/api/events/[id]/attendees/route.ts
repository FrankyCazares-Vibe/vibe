import { NextResponse } from "next/server";

import {
  parseCheckinStateRows,
  type AttendeeUser,
  type AttendeesResponse,
  type EventAttendee,
} from "@/lib/events/event-checkin";
import { limitFor } from "@/lib/limits/budgets";
import { isUuid } from "@/lib/pgrest";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

type RsvpRow = {
  status: "going" | "maybe" | "no";
  created_at: string;
  user: AttendeeUser | null;
};

type CheckinRow = { user_id: string; user: AttendeeUser | null };

/** The most check-in rows one read takes (far above any chapter event). */
const MAX_CHECKINS = 1000;

/**
 * The answers that mean "event check-in isn't in this database yet": PostgREST
 * can't find the table (PGRST205) or the function (PGRST202), or Postgres
 * can't (42P01, 42883: PostgREST's schema cache is behind). This build can
 * reach production before migration 20261019120000 does, and then nobody has
 * checked in anywhere, so "no check-ins" is the true answer and the RSVP list
 * keeps working. Every other error stays a 500 (contract 3.6).
 */
const NOT_INSTALLED = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);

function notInstalled(error: { code?: string } | null): boolean {
  return !!error && NOT_INSTALLED.has(error.code ?? "");
}

/**
 * Officers' data, read again every 20 s while check-in can happen: never
 * kept by a browser or anything between (contract 3.0, caching).
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A stable order for walk-ins (their rows carry no time): by name, then id. */
function byName(a: EventAttendee, b: EventAttendee): number {
  const an = (a.user.name ?? a.user.handle ?? "").toLowerCase();
  const bn = (b.user.name ?? b.user.handle ?? "").toLowerCase();
  return an.localeCompare(bn) || a.user.id.localeCompare(b.user.id);
}

/**
 * Attendees on an event, for whoever manages it: a CLUB event's CURRENT
 * owners/admins (never its creator as such, so a demoted or removed officer
 * loses the list the moment their role changes), an org-less event's creator.
 * Returns Going + Interested lists separately so the caller can split the UI.
 *
 * THE DATABASE DECIDES (security wave 2, #12): the gate is the same
 * public.can_manage_event() that rsvps_select_own_or_manager uses to show
 * these rows, so the route and the policy can't disagree. A TypeScript copy
 * that let the creator in would have answered 200 with an empty list.
 *
 * EVENT CHECK-IN (Oct 19 2026, contract 3.6): every Going and Interested row
 * says whether that person checked in; `walk_ins` are the people who checked
 * in without a Going or Interested RSVP; `checkin` is { open, count,
 * starts_at, ends_at }, with the exact count from event_checkin_state (the
 * event's managers get the real number) and the rows read as the fallback.
 * The check-in rows come from event_checkins under its own policy (your own
 * rows or the event's managers'), behind the same gate as the RSVPs. A
 * failed check-in read is a 500, like a failed RSVP read: a list that says
 * nobody checked in when people did is a wrong page. The one exception is a
 * database without check-in yet (NOT_INSTALLED): there nobody did.
 *
 * The id is lower-cased once it passes isUuid (which takes either case),
 * because the state rows are keyed by the database's lower-case ids.
 *
 * LIMIT. eventAttendeesRead (240 per 10 minutes per account) right after
 * sign-in, before any read: the officers' modal re-reads every 20 s while
 * check-in can happen.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id: rawId } = await ctx.params;
  // A malformed id would reach PostgREST as 22P02 and answer 500.
  if (!rawId || !isUuid(rawId)) {
    return json({ ok: false, error: "Missing event id" }, 400);
  }
  // A hand-typed upper-case id still finds its own state row below.
  const id = rawId.toLowerCase();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const rl = await limitFor("eventAttendeesRead", user.id);
  if (!rl.allowed) {
    // The shared 429 sets only its type and retry-after; this route's answers
    // all say no-store, refusals included.
    const limited = tooManyRequests(rl, "Too many check-in requests. Try again in a few minutes.");
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select("id,starts_at,ends_at")
    .eq("id", id)
    .maybeSingle();
  if (evErr) {
    console.error("[events/:id/attendees event]", evErr);
    return json({ ok: false, error: "Request failed" }, 500);
  }
  if (!ev) {
    return json({ ok: false, error: "Event not found" }, 404);
  }

  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_event", {
    p_event_id: id,
  });
  if (manageErr) {
    console.error("[events/:id/attendees can_manage_event]", manageErr);
    return json({ ok: false, error: "Request failed" }, 500);
  }
  if (canManage !== true) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  // The RSVPs, who checked in, and the check-in state: one round trip, all
  // on the viewer's client, all after the gate.
  const [rsvpRes, checkinRes, stateRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select(
        "status,created_at," +
          "user:users!rsvps_user_id_fkey!inner(id,name,handle,avatar_url,major,year)",
      )
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_checkins")
      .select("user_id,user:users!event_checkins_user_id_fkey!inner(id,name,handle,avatar_url,major,year)")
      .eq("event_id", id)
      .limit(MAX_CHECKINS),
    supabase.rpc("event_checkin_state", { p_event_ids: [id] }),
  ]);

  if (rsvpRes.error) {
    console.error("[events/:id/attendees rsvps]", rsvpRes.error);
    return json({ ok: false, error: "Request failed" }, 500);
  }
  // Codes only: these messages can carry ids.
  if (checkinRes.error && !notInstalled(checkinRes.error)) {
    console.error("[events/:id/attendees checkins]", { code: checkinRes.error.code });
    return json({ ok: false, error: "Request failed" }, 500);
  }
  if (stateRes.error && !notInstalled(stateRes.error)) {
    console.error("[events/:id/attendees checkin state]", { code: stateRes.error.code });
    return json({ ok: false, error: "Request failed" }, 500);
  }
  // Left with an error here only when check-in isn't installed: nobody has
  // checked in, and the log says why the lists show none.
  for (const err of [checkinRes.error, stateRes.error]) {
    if (err) console.error("[events/:id/attendees checkin not installed]", { code: err.code });
  }

  // Who checked in. A row whose person the viewer can't see is already gone
  // (the inner join, as for RSVPs), so `checkin.count` (the state's number,
  // every row) can be larger than the rows listed: a suspended student's
  // check-in still counts.
  const checkins = (checkinRes.error ? [] : ((checkinRes.data as unknown as CheckinRow[]) ?? [])).filter(
    (c): c is CheckinRow & { user: AttendeeUser } => !!c.user,
  );
  const hereIds = new Set(checkins.map((c) => c.user.id));

  const going: EventAttendee[] = [];
  const interested: EventAttendee[] = [];
  for (const r of (rsvpRes.data as unknown as RsvpRow[]) ?? []) {
    if (!r.user) continue;
    if (r.status !== "going" && r.status !== "maybe") continue;
    const row: EventAttendee = {
      status: r.status,
      created_at: r.created_at,
      checked_in: hereIds.has(r.user.id),
      user: r.user,
    };
    if (r.status === "going") going.push(row);
    else interested.push(row);
  }

  // Walk-ins: checked in without a Going or Interested RSVP (a "Can't go"
  // RSVP that came anyway counts as a walk-in).
  const listed = new Set([...going, ...interested].map((a) => a.user.id));
  const walk_ins: EventAttendee[] = checkins
    .filter((c) => !listed.has(c.user.id))
    .map((c) => ({ status: null, created_at: null, checked_in: true, user: c.user }))
    .sort(byName);

  const state = stateRes.error ? undefined : parseCheckinStateRows(stateRes.data).get(id);
  const event = ev as { starts_at: string; ends_at: string };
  const body: AttendeesResponse = {
    ok: true,
    going,
    interested,
    walk_ins,
    checkin: {
      open: state?.open ?? false,
      // The state's exact number (managers get it); the rows read if it has none.
      count: state?.count ?? checkins.length,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
    },
  };
  return json(body);
}
