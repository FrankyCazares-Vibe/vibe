import { NextResponse } from "next/server";

import { redactAddresses } from "@/lib/email/send-log-core";
import { clientNetworkCode, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { findLiveByTokenHash } from "@/lib/waitlist/store";
import { parseTokenRequest, waitlistPublicState } from "@/lib/waitlist/tokens";
import type { WaitlistStatusResponse } from "@/lib/waitlist/types";

const UNKNOWN: WaitlistStatusResponse = { ok: false, state: "unknown" };

/**
 * POST /api/waitlist/status. Body: `{ token }` (the `?token=` of a waitlist
 * email). What `/waitlist/confirm` shows when it opens: the state only,
 * never a name or an address. READ ONLY: opening a link (a mail scanner
 * does) changes nothing; confirming is `/api/waitlist/confirm`, a tap.
 *
 * A POST, not a GET, so the token never sits in a URL our server logs. An
 * entry past its line reads as unknown even before the purge deletes it
 * (store.ts `findLiveByTokenHash`): it counts as gone.
 *
 * RESPONSES
 *   200 {ok:true, state} · 200 {ok:false, state:"unknown"} (no such token)
 *   400 {ok:false, state:"unknown"} (no string token) · 429 (60 an hour per
 *   network, shared with confirm and leave) · 503 · 500
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
    return NextResponse.json(UNKNOWN, { status: 400 });
  }
  const parsed = parseTokenRequest(raw);
  if (!parsed.ok) return NextResponse.json(UNKNOWN, { status: 400 });
  if (!parsed.hash) return NextResponse.json(UNKNOWN);
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ...UNKNOWN, error: "Not available right now." }, { status: 503 });
  }

  try {
    const row = await findLiveByTokenHash(createSupabaseServiceClient(), parsed.hash);
    const state = waitlistPublicState(row, new Date());
    const body: WaitlistStatusResponse = state === "unknown" ? UNKNOWN : { ok: true, state };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[waitlist/status]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return NextResponse.json({ ...UNKNOWN, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
