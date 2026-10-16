import { NextResponse } from "next/server";

import { redactAddresses } from "@/lib/email/send-log-core";
import { clientNetworkCode, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { deleteWaitlistRow, findByTokenHash } from "@/lib/waitlist/store";
import { parseTokenRequest } from "@/lib/waitlist/tokens";
import type { WaitlistLeaveResponse } from "@/lib/waitlist/types";

const OK: WaitlistLeaveResponse = { ok: true };

/**
 * POST /api/waitlist/leave. Body: `{ token }`. "Take me off the list", the
 * second tap on `/waitlist/confirm`. Deletes the row and its waitlist
 * `email_sends` rows (the keyed hash of its address), whatever its state.
 *
 * ALWAYS `{ok:true}` for any token, known or not: it is the person's own
 * link, and an unknown one has nothing left to remove. Only a failure to
 * delete answers otherwise (500), so nobody is told they're off when they
 * aren't. 400 when there is no string token; 429 shared with status and
 * confirm.
 */
export async function POST(req: Request) {
  // On the network's scrambled code for the day, never the address. No code
  // (no secret) skips the count, as a limiter that's down does.
  const netCode = clientNetworkCode(req, "waitlist-token-net");
  const rl = await rateLimit(netCode === null ? null : `waitlist-token-net:${netCode}`, { limit: 60, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = parseTokenRequest(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  if (!parsed.hash) return NextResponse.json(OK);
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  }

  try {
    const service = createSupabaseServiceClient();
    const row = await findByTokenHash(service, parsed.hash);
    if (row) await deleteWaitlistRow(service, row.id, row.email);
    return NextResponse.json(OK);
  } catch (err) {
    console.error("[waitlist/leave]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
