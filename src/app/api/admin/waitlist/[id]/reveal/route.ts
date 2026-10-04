import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { redactAddresses } from "@/lib/email/send-log-core";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getWaitlistContact, readEmailViewers } from "@/lib/waitlist/store";
import type { AdminWaitlistRevealResponse } from "@/lib/waitlist/types";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/waitlist/[id]/reveal
 *
 * "Show email": one person's full address, for the user ids listed in
 * `app_settings.waitlist_email_viewers` only (production: Franky). Every
 * other admin gets 403 `not_allowed`, the same as the list's
 * `canReveal: false`.
 *
 * NO REVEAL WITHOUT ITS LOG ROW. `waitlist_reveal` is written first; if that
 * insert fails the address is not returned (500 `log_failed`), so the trail
 * of who saw which address is complete.
 *
 * RESPONSES
 *   200 {ok, email} · 400 invalid_id · 401 · 403 platform_admin_only ·
 *   403 not_allowed · 404 not_found · 429 · 500 log_failed · request_failed
 */
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return adminFail(400, "invalid_id", "Invalid id");

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  try {
    const viewers = await readEmailViewers(service);
    if (!viewers.includes(gate.userId)) {
      return adminFail(403, "not_allowed", "Full addresses are shown to some founders only.");
    }
    const row = await getWaitlistContact(service, id.toLowerCase());
    if (!row) return adminFail(404, "not_found", "Not found");
    const logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: "waitlist_reveal",
      targetType: "waitlist",
      targetId: row.id,
    });
    if (!logged) return adminFail(500, "log_failed", "The reveal couldn't be logged, so the address isn't shown.");
    const body: AdminWaitlistRevealResponse = { ok: true, email: row.email };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/waitlist/reveal]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
}
