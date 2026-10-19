import { NextResponse } from "next/server";

import {
  checkinBusyRefused,
  checkinFailed,
  myCheckinsFrom,
  noStore,
  signedInViewer,
} from "@/lib/events/checkin-route";
import type { MyEventCheckinsResponse } from "@/lib/events/event-checkin";
import { limitFor } from "@/lib/limits/budgets";

/**
 * GET /api/me/event-checkins: the events the viewer checked in at, for
 * Settings > Event check-ins (contract 3.5, D11). Newest event first, at
 * most 200. Read through event_checkin_mine on the viewer's own client,
 * which reads past RLS on purpose for the caller's own rows only: a
 * student can always see and remove their own check-in, even at a club
 * hidden since.
 */
export async function GET() {
  return noStore(await readMine());
}

async function readMine(): Promise<Response> {
  const viewer = await signedInViewer();
  if ("response" in viewer) return viewer.response;
  const rl = await limitFor("eventCheckinRead", viewer.userId);
  if (!rl.allowed) return checkinBusyRefused(rl);

  const { data, error } = await viewer.client.rpc("event_checkin_mine");
  if (error) {
    console.error("[me/event-checkins mine]", error.code);
    return checkinFailed();
  }
  const body: MyEventCheckinsResponse = { ok: true, checkins: myCheckinsFrom(data) };
  return NextResponse.json(body);
}
