import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  isUniqueViolation,
  orgJoinState,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { admitMember, expireStaleInvites, loadViewerOrgContext } from "@/lib/orgs/membership";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

type Body = { message?: unknown };

/** The error shape every org route now speaks (spec §4 conventions). */
function fail(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

/**
 * POST /api/orgs/[slug]/join — THE one door into an org (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.2, §3.5 step 3,
 * §4.2; batch B8).
 *
 * Accepting an invite, tapping Join and asking to join all arrive here, so
 * there is exactly one place that decides who gets in and exactly one place
 * that admits them. The decision is {@link orgJoinState} (B22, spec §3.2) and
 * the admission is {@link admitMember} (B22); this route only loads what they
 * need and turns their answer into HTTP.
 *
 * ORDER (spec §4 conventions): auth → rate limit → Terms → SERVICE-ROLE org
 * load → decide → act.
 *
 * WHY THE ORG LOAD MOVED TO THE SERVICE CLIENT (critic A2). It used to run on
 * the viewer's own client, and `orgs_select` hides a private org from
 * non-members — so "Request to join" on every private club answered 404 "Not
 * found" before it ever reached the insert. Nobody could request anything.
 * M1c narrowed that policy further (hidden orgs), so the user client would be
 * wrong twice over. The service role loads the row; this route decides what
 * the viewer is allowed to know about it.
 *
 * RESPONSES
 *   200 {ok, joined:true, role, via:"join"|"invite"}   admitted
 *   200 {ok, joined:true, role, already:true}          already a member
 *   200 {ok, pending:true, request, reason?}           request filed / already filed
 *   403 school_unverified | audience_mismatch (+audience) | invite_only | terms_required
 *   404 not_found          the handle, or a hidden org to anybody but an admin
 *   409 org_hidden         a platform admin (or an officer) on a hidden org
 *   429                    30 attempts per 10 minutes, per user
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // Plan §2.6: join had neither a limit nor a Terms gate. 30 per 10 minutes
  // is far above a human tapping Join and low enough that a script can't walk
  // the club directory filing requests.
  const rl = await rateLimit(`org-join:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* allow empty body */
  }

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, name, join_policy, audience, hidden_at, campus_id")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/join load org]", orgErr);
    return fail(500, "load_failed", "Failed to load org");
  }
  if (!orgRow) {
    return fail(404, "not_found", "Not found");
  }
  const org = orgRow as {
    id: string;
    handle: string;
    name: string;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  };

  // Expiry is lazy in the database (spec §2.3), and this route is a writer.
  // Flip this viewer's stale invite in this org BEFORE reading it, so a row
  // that sat `pending` past `expires_at` is recorded truthfully — and, more
  // practically, so it stops occupying `org_invites_one_pending` and blocking
  // the next invite an officer sends.
  await expireStaleInvites(service, { orgId: org.id, inviteeId: user.id });

  const ctx = await loadViewerOrgContext(service, org.id, user.id);
  if (!ctx.ok) {
    // The least-privileged fallback is safe to ACT on but wrong to answer
    // with: a real member would be told to verify their school email.
    return fail(500, "load_failed", "Failed to load org");
  }

  const decision = orgJoinState({
    org,
    viewer: ctx.viewer,
    role: ctx.role,
    pendingInvite: ctx.pendingInvite,
    pendingRequest: ctx.pendingRequest,
  });

  switch (decision.state) {
    // Idempotent: a second tap, or a second device, gets the same answer.
    case "member":
      return NextResponse.json({
        ok: true,
        joined: true,
        role: ctx.role,
        already: true,
      });

    case "not_found":
      return fail(404, "not_found", "Not found");

    // Only a platform admin reaches this state (everyone else got not_found),
    // and even an officer of a hidden org may not add anyone to it (§3.4).
    case "hidden":
      return fail(409, "org_hidden", "This org is hidden, so nobody new can join it.");

    case "unverified":
      return fail(
        403,
        "school_unverified",
        "Verify your school email to join.",
      );

    case "audience_blocked":
      return fail(
        403,
        "audience_mismatch",
        decision.audience === "purdue"
          ? `${org.name} is open to Purdue students only.`
          : `${org.name} is open to IU students only.`,
        { audience: decision.audience },
      );

    // Invite-only with no invite NEVER files a request: that is the whole
    // point of the policy (spec §3.2 row 8).
    case "invite_only":
      return fail(403, "invite_only", "This org is invite only. Officers invite members.");

    case "requested":
      return NextResponse.json({ ok: true, pending: true, request: ctx.pendingRequest });

    case "invited":
    case "can_join": {
      const via = decision.state === "invited" ? "invite" : "join";
      const admitted = await admitMember(service, {
        orgId: org.id,
        userId: user.id,
        actorId: user.id,
        via,
      });
      if (!admitted.ok) {
        return fail(500, "join_failed", "Failed to join");
      }
      return NextResponse.json({
        ok: true,
        joined: true,
        role: "member",
        via,
        ...(admitted.already ? { already: true } : {}),
      });
    }

    // `request` policy, or `open` while visiting another campus (plan §2.6).
    case "can_request": {
      const message =
        typeof body.message === "string" ? body.message.trim().slice(0, 500) : null;
      const { data: created, error: reqErr } = await service
        .from("org_join_requests")
        .insert({ org_id: org.id, user_id: user.id, message })
        .select("id, status, requested_at")
        .single();
      if (reqErr || !created) {
        // Two taps at once race `org_join_requests_unique_pending`. That is a
        // duplicate, not a failure (critic B2): read the winner back.
        if (isUniqueViolation(reqErr)) {
          const { data: existing } = await service
            .from("org_join_requests")
            .select("id, status, requested_at")
            .eq("org_id", org.id)
            .eq("user_id", user.id)
            .eq("status", "pending")
            .maybeSingle();
          if (existing) {
            return NextResponse.json({ ok: true, pending: true, request: existing });
          }
        }
        console.error("[orgs/[slug]/join request insert]", reqErr);
        return fail(500, "request_failed", "Failed to request join");
      }
      return NextResponse.json({
        ok: true,
        pending: true,
        request: created,
        reason: decision.reason,
      });
    }
  }
}

/**
 * DELETE /api/orgs/[slug]/join — self-leave. Owners can't leave (they have to
 * transfer ownership first), which is blocked here for a friendly error.
 *
 * The org load runs on the service client like every other org route now
 * (spec §4.2): leaving a private or hidden org must not 404 on the lookup.
 * The DELETE itself stays on the viewer's own client — `org_members_delete`
 * is the boundary for removing your own row, and M1c left it alone.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const service = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, owner_id")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/join DELETE load org]", orgErr);
    return fail(500, "load_failed", "Failed to leave");
  }
  if (!org) {
    return fail(404, "not_found", "Not found");
  }
  if (org.owner_id === user.id) {
    return fail(
      400,
      "owner_cannot_leave",
      "Owners must transfer ownership before leaving",
    );
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", org.id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[orgs/[slug]/join DELETE]", error);
    return fail(500, "leave_failed", "Failed to leave");
  }
  return NextResponse.json({ ok: true });
}
