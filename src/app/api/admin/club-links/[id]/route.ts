import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { cancelSetupLink } from "@/lib/club-links/store";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/admin/club-links/[id]: cancel a setup link that hasn't made its
 * club yet (a lost QR, a typo in the name). The row stays, marked cancelled;
 * a sign-up already let in through it can no longer make the club. 404 when
 * there is nothing live to cancel.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  if (!UUID_RE.test(id)) return adminFail(404, "not_found", "Not found");

  const limit = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!limit.allowed) return tooManyRequests(limit, "Too many changes at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  if (!(await cancelSetupLink(service, id))) {
    return adminFail(404, "not_found", "That link is already used or cancelled.");
  }
  return NextResponse.json({ ok: true });
}
