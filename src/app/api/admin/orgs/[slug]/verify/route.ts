import { NextResponse } from "next/server";

import {
  adminFail,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = { verified?: unknown };

/**
 * POST /api/admin/orgs/[slug]/verify
 * Body: { verified: boolean }
 *
 * Flips orgs.verified — the only knob that matters for Discover ranking
 * (verified orgs sit on top + are exempt from dormancy decay). Platform-
 * admin only; bootstrap by setting `users.is_platform_admin = true` on the
 * founder's row in Supabase SQL editor.
 *
 * `[slug]` IS THE HANDLE, not a slug column — there isn't one. The lookup is
 * `.eq('handle', …)`, same as the sibling hide route, and the log records the
 * org's UUID with the handle alongside it in `meta`.
 *
 * THE GATE IS THE SHARED ONE (`requirePlatformAdmin`), and the limiter matches
 * its sibling's 30 per 10 minutes. It had none before, which made it the one
 * admin write with no ceiling at all.
 *
 * EVERY CHANGE IS LOGGED to `moderation_actions`. Verification is a claim Vibe
 * makes about a club in public, so who made it belongs in the trail.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return adminFail(400, "invalid_body", "Invalid JSON");
  }
  if (typeof body.verified !== "boolean") {
    return adminFail(400, "invalid_body", "verified must be a boolean");
  }
  const verified = body.verified;

  const limit = await rateLimit(`admin-org-verify:${gate.userId}`, {
    limit: 30,
    windowSec: 600,
  });
  if (!limit.allowed) {
    return tooManyRequests(limit, "Too many changes at once. Try again shortly.");
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("orgs")
    .update({ verified })
    .eq("handle", slug)
    .select("id, handle, verified")
    .single();
  if (error || !data) {
    // `.single()` on nothing is PGRST116 — a club that isn't there, not a
    // failure to write. It answered 500 before, which sent the dashboard
    // looking for a bug instead of a typo in the handle.
    if (error?.code === "PGRST116") return adminFail(404, "not_found", "Not found");
    console.error("[admin/orgs/[slug]/verify POST]", error);
    return adminFail(500, "update_failed", "Failed to update verified status");
  }

  const org = data as { id: string; handle: string; verified: boolean };
  const logged = await logModerationAction(service, {
    actorId: gate.userId,
    action: verified ? "org_verify" : "org_unverify",
    targetType: "org",
    targetId: org.id,
    meta: { handle: org.handle },
  });

  return NextResponse.json({ ok: true, org: data, logged });
}
