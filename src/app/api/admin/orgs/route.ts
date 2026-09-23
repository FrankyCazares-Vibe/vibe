import { NextResponse } from "next/server";

import {
  ADMIN_READ_LIMIT,
  adminFail,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/orgs — list ALL orgs for the platform-admin dashboard.
 * Includes verified flag, member count, last activity, and computed dormant
 * status. Gated on `users.is_platform_admin = true`.
 *
 * HIDDEN ORGS STAY LISTED HERE, and only here (spec §3.4, §4.2). Hiding
 * removes an org from Discover, search, the map, event lists and suggestions
 * — /admin is the one screen that has to keep showing it, because /admin is
 * where it gets unhidden. Each row carries `hidden` (and `hidden_at`, the
 * moment it happened, which no other route returns) so the dashboard can
 * badge it and offer Hide / Unhide.
 *
 * `join_policy` and `audience` ride along so the dashboard says what an org
 * actually is — "Private" alone stopped being the whole story once an org
 * could be invite-only or open to one university.
 *
 * THE READ BYPASSES RLS (service role): `orgs_select` hides a hidden club from
 * everyone who isn't a member, platform admin or not, so a policy-backed read
 * would leave the one screen that can unhide a club unable to see it.
 *
 * The gate is the shared `requirePlatformAdmin` rather than a fourth inline
 * copy of the same three statements.
 *
 * It carries the same read limit as the rest of the admin API. There is
 * nothing to validate first, so the limiter sits right after the gate — and it
 * is the heaviest read here, up to 500 clubs and their member counts in one
 * unbounded scan.
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const rl = await rateLimit(`admin-orgs:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();

  const { data, error } = await service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, is_public, verified, last_activity_at, created_at, join_policy, audience, hidden_at, members:org_members(count)"
    )
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) {
    console.error("[admin/orgs GET]", error);
    return adminFail(500, "load_failed", "Failed to load");
  }

  type Row = {
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    is_public: boolean;
    verified: boolean;
    last_activity_at: string | null;
    created_at: string;
    join_policy: string | null;
    audience: string | null;
    hidden_at: string | null;
    members?: Array<{ count: number }> | null;
  };

  const DORMANT_MS = 60 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const orgs = (data as Row[] | null ?? []).map((o) => {
    const { members, ...rest } = o;
    const lastMs = o.last_activity_at ? Date.parse(o.last_activity_at) : null;
    const dormant = !o.verified && lastMs !== null && now - lastMs > DORMANT_MS;
    return {
      ...rest,
      join_policy: o.join_policy ?? "open",
      audience: o.audience ?? "both",
      hidden: !!o.hidden_at,
      member_count: members?.[0]?.count ?? 0,
      dormant,
    };
  });

  return NextResponse.json({ ok: true, orgs });
}
