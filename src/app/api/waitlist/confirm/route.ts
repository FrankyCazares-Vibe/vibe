import { NextResponse } from "next/server";

import { redactAddresses } from "@/lib/email/send-log-core";
import { clientNetworkCode, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { confirmByManageHash, findLiveByTokenHash } from "@/lib/waitlist/store";
import { confirmWindowOpen, parseTokenRequest, waitlistPublicState } from "@/lib/waitlist/tokens";
import type { WaitlistConfirmResponse } from "@/lib/waitlist/types";

const UNKNOWN: WaitlistConfirmResponse = { ok: false, state: "unknown" };

/**
 * POST /api/waitlist/confirm. Body: `{ token }`. The "Confirm my spot" tap
 * on `/waitlist/confirm` (opening the page never confirms: mail scanners
 * open links).
 *
 * Sets `confirmed_at` only when it is empty and the newest confirm email is
 * under 7 days old. IDEMPOTENT: an already confirmed, invited or joined
 * person gets `{ok:true, state}` again. An entry past its line is unknown
 * and is never confirmed (store.ts `findLiveByTokenHash`): it counts as gone.
 *
 * RESPONSES
 *   200 {ok:true, state} · 200 {ok:false, state:"unknown" | "confirm_expired"}
 *   400 {ok:false, state:"unknown"} (no string token) · 429 (shared with
 *   status and leave) · 503 · 500
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
    const service = createSupabaseServiceClient();
    let row = await findLiveByTokenHash(service, parsed.hash);
    if (row && confirmWindowOpen(row, new Date())) {
      await confirmByManageHash(service, parsed.hash);
      row = await findLiveByTokenHash(service, parsed.hash);
    }
    const state = waitlistPublicState(row, new Date());
    let body: WaitlistConfirmResponse;
    if (state === "unknown") body = UNKNOWN;
    else if (state === "confirm_expired") body = { ok: false, state };
    else body = { ok: true, state };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[waitlist/confirm]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return NextResponse.json({ ...UNKNOWN, error: "Something went wrong. Try again." }, { status: 500 });
  }
}
