import { NextResponse } from "next/server";

import {
  checkinBusyRefused,
  checkinFail,
  checkinFailed,
  isNotManager,
  markWordResponse,
  noStore,
  notManagerResponse,
  signedInViewer,
  unmarkWordResponse,
} from "@/lib/events/checkin-route";
import type { MarkResponse } from "@/lib/events/event-checkin";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/**
 * One person on an event's check-in record, for its officers (contract 3.4,
 * D8). Both run on the officer's own client; the functions check
 * can_manage_event against auth.uid() and the database keeps the rules:
 * only someone who said Going or Interested can be marked, from an hour
 * before the start to a day after the end, check-in open or not.
 */

/** Both ids, checked before anything else (the event's first), or the 400. */
async function readIds(ctx: RouteContext): Promise<{ id: string; userId: string } | { response: Response }> {
  const { id, userId } = await ctx.params;
  if (!isUuid(id)) return { response: checkinFail(400, "invalid_event_id") };
  if (!isUuid(userId)) return { response: checkinFail(400, "invalid_user_id") };
  // isUuid takes either case; the answer echoes the ids as the database has them.
  return { id: id.toLowerCase(), userId: userId.toLowerCase() };
}

/** PUT: Mark as here. A suspended officer can't mark. */
export async function PUT(_req: Request, ctx: RouteContext) {
  return noStore(await mark(ctx));
}

async function mark(ctx: RouteContext): Promise<Response> {
  const ids = await readIds(ctx);
  if ("response" in ids) return ids.response;
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("orgOfficer", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);
  const gate = await requireNotRestricted(viewer.userId);
  if (gate) return gate;

  const { data, error } = await viewer.client.rpc("event_checkin_mark", {
    p_event_id: ids.id,
    p_user_id: ids.userId,
  });
  if (error) {
    console.error("[events/:id/checkin mark]", error.code);
    return checkinFailed();
  }
  if (isNotManager(data)) return notManagerResponse(viewer.client, ids.id);
  const refused = markWordResponse(data);
  if (refused) return refused;
  const body: MarkResponse = { ok: true, user_id: ids.userId, checked_in: true };
  return NextResponse.json(body);
}

/**
 * DELETE: take one person's check-in off. Any time, and no restriction
 * gate here: it only takes something away. Idempotent. (A suspended
 * officer's call never gets this far: src/proxy.ts refuses every non-GET
 * /api/ call from a restricted account first.)
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  return noStore(await unmark(ctx));
}

async function unmark(ctx: RouteContext): Promise<Response> {
  const ids = await readIds(ctx);
  if ("response" in ids) return ids.response;
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("orgOfficer", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const { data, error } = await viewer.client.rpc("event_checkin_unmark", {
    p_event_id: ids.id,
    p_user_id: ids.userId,
  });
  if (error) {
    console.error("[events/:id/checkin unmark]", error.code);
    return checkinFailed();
  }
  if (isNotManager(data)) return notManagerResponse(viewer.client, ids.id);
  const refused = unmarkWordResponse(data);
  if (refused) return refused;
  const body: MarkResponse = { ok: true, user_id: ids.userId, checked_in: false };
  return NextResponse.json(body);
}
