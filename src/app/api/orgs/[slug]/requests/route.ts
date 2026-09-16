import { NextResponse } from "next/server";

import { isSchoolSystem } from "@/lib/iu/campuses";
import {
  audienceAllows,
  isOfficer,
  isOrgAudience,
  isOrgRole,
  type OrgAudience,
  type ViewerSystem,
} from "@/lib/orgs/join-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * Why a requester can't be approved. `audience_iu` / `audience_purdue` name
 * the ORG's setting ("{org} is open to IU students only"), matching the
 * `reason` field of `GET /api/orgs/[slug]/invite-candidates` (spec §4.3) so
 * one copy table in B25 serves both surfaces.
 */
type IneligibleReason = "audience_iu" | "audience_purdue" | "unverified";

/**
 * GET /api/orgs/[slug]/requests — list pending join requests for officers
 * (owner/admin/mod) of an org. Includes the requesting user's profile.
 *
 * ELIGIBILITY IS SHOWN, NOT HIDDEN (spec §4.2, §5.2). Audience is re-checked
 * when the request is approved, not when it was filed, so a request that was
 * legal in April is refused in May once the officers narrow the org to "IU
 * students only". Approve would then 409 with `audience_mismatch` and the
 * officer would have no idea why. Each row therefore carries `eligible` and
 * `ineligible_reason`, and B19 renders "Not eligible (Purdue student)" with
 * the Approve button hidden instead of offering a button the server refuses.
 *
 * The two answers line up one-for-one with what approve would say, so the same
 * person never gets two different explanations on the same screen:
 *   `unverified`                    → approve 409 `school_unverified`
 *   `audience_iu` / `audience_purdue` → approve 409 `audience_mismatch`
 *
 * WHAT IS DELIBERATELY NOT HERE: the requester's school email, their
 * `school_system` value, or any field today's shape does not already return.
 * The officer needs to know that Vibe will refuse, and why in one phrase —
 * not which address the student verified with.
 *
 * A HIDDEN ORG STILL LISTS. Members keep direct access to a hidden org
 * (spec §3.4) and its officers may still read the queue; approving is what
 * the approve route blocks, with 409 `org_hidden`.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select("id, audience")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  // A junk value in the column reads as the most permissive real setting the
  // CHECK constraint allows, `both`, which is also what the column defaults
  // to. Never guess a restriction that is not on the row.
  const audience: OrgAudience = isOrgAudience(org.audience) ? org.audience : "both";

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const viewerRole = viewer && isOrgRole(viewer.role) ? viewer.role : null;
  if (!isOfficer(viewerRole)) {
    return NextResponse.json(
      { ok: false, error: "Staff only", code: "officers_only" },
      { status: 403 },
    );
  }

  const { data, error } = await service
    .from("org_join_requests")
    .select(
      "id, user_id, status, message, requested_at, users:user_id(id, name, handle, avatar_url, school_verified)"
    )
    .eq("org_id", org.id)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });
  if (error) {
    console.error("[orgs/[slug]/requests GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load requests", code: "load_failed" },
      { status: 500 },
    );
  }

  const rows = data || [];

  // `school_system` is a private users column (service role only), so it is
  // read here in ONE query for the whole page rather than embedded in the
  // join above — the embed runs under the same service client but would put
  // a private column in the same object as the public profile fields, one
  // careless spread away from shipping it to the browser.
  const systems = new Map<string, ViewerSystem>();
  const requesterIds = [...new Set(rows.map((r) => r.user_id as string))];
  if (requesterIds.length > 0) {
    const { data: people, error: peopleErr } = await service
      .from("users")
      .select("id, school_system")
      .in("id", requesterIds);
    if (peopleErr) {
      // Fail the request rather than render every student as "unverified":
      // an officer acting on that would deny people who are perfectly
      // eligible, and nothing on the screen would say the data was missing.
      console.error("[orgs/[slug]/requests GET school_system]", peopleErr);
      return NextResponse.json(
        { ok: false, error: "Failed to load requests", code: "load_failed" },
        { status: 500 },
      );
    }
    for (const p of people || []) {
      const row = p as { id: string; school_system: unknown };
      systems.set(row.id, isSchoolSystem(row.school_system) ? row.school_system : null);
    }
  }

  const requests = rows.map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    const system = systems.get(r.user_id as string) ?? null;
    // Unverified comes first: it is the friendlier, fixable answer, and it is
    // also the decision order `orgJoinState` uses (spec §3.2 rows 3 then 4).
    let ineligibleReason: IneligibleReason | null = null;
    if (system === null) ineligibleReason = "unverified";
    else if (!audienceAllows(audience, system)) {
      ineligibleReason = audience === "purdue" ? "audience_purdue" : "audience_iu";
    }
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      status: r.status as string,
      message: r.message as string | null,
      requested_at: r.requested_at as string,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
      eligible: ineligibleReason === null,
      ineligible_reason: ineligibleReason,
    };
  });

  return NextResponse.json({ ok: true, audience, requests });
}
