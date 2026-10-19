import { NextResponse } from "next/server";

import {
  checkinBusyRefused,
  checkinFail,
  checkinFailed,
  clearOutcome,
  isNotManager,
  noStore,
  notManagerResponse,
  signedInViewer,
} from "@/lib/events/checkin-route";
import type { ClearResponse } from "@/lib/events/event-checkin";
import { limitFor } from "@/lib/limits/budgets";
import { isUuid } from "@/lib/pgrest";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/events/[id]/checkin/marks: an officer clears every check-in
 * of the event (contract 3.4, decision 5: kept until the club deletes
 * them). Any time, on the officer's own client (event_checkin_clear checks
 * can_manage_event against auth.uid()). No restriction gate here: it only
 * takes something away. (A suspended officer's call never gets this far:
 * src/proxy.ts refuses every non-GET /api/ call from a restricted account
 * first.) Answers how many went.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  return noStore(await clearAll(ctx));
}

async function clearAll(ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("orgOfficer", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const { data, error } = await viewer.client.rpc("event_checkin_clear", { p_event_id: id });
  if (error) {
    console.error("[events/:id/checkin clear]", error.code);
    return checkinFailed();
  }
  if (isNotManager(data)) return notManagerResponse(viewer.client, id);
  const outcome = clearOutcome(data);
  if ("response" in outcome) return outcome.response;
  const body: ClearResponse = { ok: true, cleared: outcome.cleared };
  return NextResponse.json(body);
}
