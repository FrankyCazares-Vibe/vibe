import { NextResponse } from "next/server";

import {
  checkedInFallback,
  checkinBusyRefused,
  checkinFail,
  checkinFailed,
  checkinTriesRefused,
  noStore,
  parseCheckinBody,
  readViewerState,
  selfWordOutcome,
  signedInViewer,
  viewerStateFailure,
} from "@/lib/events/checkin-route";
import type {
  CheckinDeleteResponse,
  CheckinPostResponse,
  CheckinStateResponse,
} from "@/lib/events/event-checkin";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/events/[id]/checkin: the viewer's check-in state for one event
 * (open?, am I in?, how many: from 5 up unless they run the event).
 * Contract 3.2. Read on the viewer's own client, so an event they may not
 * see is a 404 and the count's floor is the database's.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  return noStore(await readState(ctx));
}

async function readState(ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("eventCheckinRead", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const read = await readViewerState(viewer.client, id);
  if (!read.ok) return viewerStateFailure(read);
  const body: CheckinStateResponse = { ok: true, state: read.state };
  return NextResponse.json(body);
}

/**
 * POST /api/events/[id]/checkin: check in with the door's 4-digit code or
 * the QR link's token. Contract 3.2 and D2.
 *
 * ORDER. Ids, sign-in, then the body's SHAPE before the limiter (a typo
 * costs none of the day's 20 tries), then whether the service role is set
 * up at all, then the eventCheckin limiter (20 per account per UTC day,
 * fails closed: it is the only bound on guessing), then Terms and
 * restrictions, then the check itself.
 *
 * THE CHECK runs on the SERVICE client, in event_checkin_self_as, which
 * refuses every browser role: called from the browser over the database's
 * web interface it would skip this limiter. `p_user` is the signed-in
 * account, never anything from the body. No campus rule (D9): the code
 * proves the person is at the door.
 */
export async function POST(req: Request, ctx: RouteContext) {
  return noStore(await checkIn(req, ctx));
}

async function checkIn(req: Request, ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return checkinFail(400, "invalid_json");
  }
  const body = parseCheckinBody(raw);
  if (!body.ok) return checkinFail(body.status, body.code);

  // Before the limiter, not after it: the limiter counts (and the
  // restriction gate reads) through the service role, so without the key
  // the limiter fails closed first and this line would never be logged; the
  // missing key would look like load ("busy right now"). It reads only the
  // environment, not the database, so the limiter-first rule still holds.
  if (!isSupabaseServiceConfigured()) {
    console.error("[events/:id/checkin self] the service role isn't configured");
    return checkinFailed();
  }

  const rl = await limitFor("eventCheckin", viewer.userId);
  if (!rl.allowed) return checkinTriesRefused(rl);

  // Not requireCanPublish: checking in isn't publishing.
  const gate = await requireNotRestricted(viewer.userId);
  if (gate) return gate;

  const { data, error } = await createSupabaseServiceClient().rpc("event_checkin_self_as", {
    p_user: viewer.userId,
    p_event_id: id,
    p_code: body.code,
    p_token: body.token,
  });
  if (error) {
    console.error("[events/:id/checkin self]", error.code);
    return checkinFailed();
  }
  const outcome = selfWordOutcome(data);
  if ("response" in outcome) return outcome.response;

  // The check-in happened; if the state can't be read back, say so anyway.
  const read = await readViewerState(viewer.client, id);
  const res: CheckinPostResponse = {
    ok: true,
    already: outcome.already,
    state: read.ok ? read.state : checkedInFallback(id),
  };
  return NextResponse.json(res);
}

/**
 * DELETE /api/events/[id]/checkin: remove your own check-in. Idempotent.
 *
 * NOT GATED on Terms, a restriction, the window or a hidden club, on
 * purpose (the rsvp/route.ts DELETE rule): taking your own record back is
 * never what those gates protect. The table's own policy lets a person
 * delete only their own rows, and the `user_id` filter says the same.
 * (src/proxy.ts still refuses a restricted account's non-GET /api/ calls
 * before this runs, as it does RSVP DELETE: contract D12 keeps the proxy
 * unchanged.)
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  return noStore(await removeMine(ctx));
}

async function removeMine(ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("eventCheckinRemove", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const { error } = await viewer.client
    .from("event_checkins")
    .delete()
    .eq("event_id", id)
    .eq("user_id", viewer.userId);
  if (error) {
    console.error("[events/:id/checkin delete]", error.code);
    return checkinFailed();
  }
  // Null when the event can't be seen any more (a club hidden since, say).
  const read = await readViewerState(viewer.client, id);
  const res: CheckinDeleteResponse = { ok: true, state: read.ok ? read.state : null };
  return NextResponse.json(res);
}
