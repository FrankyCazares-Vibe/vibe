import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import {
  checkinBusyRefused,
  checkinFail,
  checkinFailed,
  closeWordResponse,
  doorResponse,
  isNotManager,
  noStore,
  notManagerResponse,
  openWordResponse,
  signedInViewer,
  stoppedResponse,
} from "@/lib/events/checkin-route";
import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The officers' door screen (contract 3.3, D7). All three answer the same
 * DoorResponse, `{ ok: true, door: DoorFeed }`: this 30-second step's code
 * and QR link and the next one's, the window, the database's clock and the
 * exact count. Every call runs on the officer's OWN client: the functions
 * check can_manage_event against auth.uid(), so a manager calling them
 * straight from the browser can do no more than this route does, and the
 * session's secret never leaves the database.
 *
 * The QR links are built on getSiteOriginForRequest (localhost in dev, the
 * canonical site otherwise), never the Host header: a forged Host must not
 * put another site's address on the club's screen.
 */

/** GET: the screen's read, every 10 seconds while it's visible. */
export async function GET(req: Request, ctx: RouteContext) {
  return noStore(await readDoor(req, ctx));
}

async function readDoor(req: Request, ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("eventCheckinDoor", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);
  return doorResponse(viewer.client, id, getSiteOriginForRequest(req));
}

/**
 * POST: Start check-in. Already open keeps the same secret, so a second
 * officer's device shows the same codes. A suspended officer can't start.
 */
export async function POST(req: Request, ctx: RouteContext) {
  return noStore(await startCheckin(req, ctx));
}

async function startCheckin(req: Request, ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("orgOfficer", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);
  const gate = await requireNotRestricted(viewer.userId);
  if (gate) return gate;

  const { data, error } = await viewer.client.rpc("event_checkin_open", { p_event_id: id });
  if (error) {
    console.error("[events/:id/checkin open]", error.code);
    return checkinFailed();
  }
  if (isNotManager(data)) return notManagerResponse(viewer.client, id);
  const refused = openWordResponse(data);
  if (refused) return refused;
  return doorResponse(viewer.client, id, getSiteOriginForRequest(req));
}

/**
 * DELETE: Stop check-in. Every code and link already shown stops working;
 * the check-ins stay.
 *
 * No restriction gate HERE: stopping only takes something away. That is not
 * the whole story for a suspended officer: src/proxy.ts refuses every
 * non-GET /api/ call from a restricted account before any route runs
 * (restrictedApiAllowed lists no check-in path), so on the real stack their
 * Stop gets the proxy's 403 account_restricted and check-in stays open until
 * another officer stops it or the window ends. Allowlisting it is the
 * orchestrator's call (contract D8 vs D12).
 *
 * Once close says `closed`, Stop answers 200 with a feed even when the door
 * read after it refuses (a club hidden since) or fails: a refusal from Stop
 * must only ever mean "not stopped".
 */
export async function DELETE(req: Request, ctx: RouteContext) {
  return noStore(await stopCheckin(req, ctx));
}

async function stopCheckin(req: Request, ctx: RouteContext): Promise<Response> {
  const { id: rawId } = await ctx.params;
  if (!isUuid(rawId)) return checkinFail(400, "invalid_event_id");
  // isUuid takes either case; the state read looks rows up in lower case.
  const id = rawId.toLowerCase();
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("orgOfficer", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const { data, error } = await viewer.client.rpc("event_checkin_close", { p_event_id: id });
  if (error) {
    console.error("[events/:id/checkin close]", error.code);
    return checkinFailed();
  }
  if (isNotManager(data)) return notManagerResponse(viewer.client, id);
  const refused = closeWordResponse(data);
  if (refused) return refused;
  return stoppedResponse(viewer.client, id, getSiteOriginForRequest(req));
}
