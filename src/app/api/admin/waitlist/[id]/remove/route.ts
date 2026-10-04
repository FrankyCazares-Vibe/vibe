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
import { deleteWaitlistRow, getWaitlistContact } from "@/lib/waitlist/store";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/waitlist/[id]/remove
 *
 * Take one person off the waitlist: the row and its waitlist `email_sends`
 * rows go (the same delete as their own "Take me off the list"). An account
 * the code already made is untouched. Logs `waitlist_remove`; `meta` holds
 * the row's origin, never the address.
 *
 * RESPONSES
 *   200 {ok, logged} · 400 invalid_id · 401 · 403 · 404 not_found · 429 ·
 *   500 request_failed
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
    const row = await getWaitlistContact(service, id.toLowerCase());
    if (!row) return adminFail(404, "not_found", "Not found");
    await deleteWaitlistRow(service, row.id, row.email);
    const logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: "waitlist_remove",
      targetType: "waitlist",
      targetId: row.id,
      meta: { origin: row.origin },
    });
    return NextResponse.json({ ok: true, logged });
  } catch (err) {
    console.error("[admin/waitlist/remove]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
}
