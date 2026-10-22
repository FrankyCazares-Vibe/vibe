import { NextResponse } from "next/server";

import { isSchoolSystem } from "@/lib/iu/campuses";
import { requireNotRestricted } from "@/lib/moderation/access";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { ORG_COPY } from "@/lib/orgs/join-copy";
import {
  OFFICER_ROLES,
  audienceAllows,
  canApproveRequest,
  isOrgAudience,
  isOrgRole,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { admitMember, loadRemovedUserIds, notifyOrg } from "@/lib/orgs/membership";
import { isBlockedWithOrg, loadOrgBlocks } from "@/lib/orgs/org-blocks";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; id: string }> };
type Body = { action?: unknown };

/**
 * POST /api/orgs/[slug]/requests/[id] — approve or deny a pending join request.
 * Body: { action: 'approve' | 'deny' }
 * Permissions: the org's owner or an officer (`OFFICER_ROLES`).
 *
 * On approve the request is re-checked against the org's CURRENT rules before
 * anybody is let in (spec §4.2, §3.2). THREE 409 codes, in this order:
 *   - the org is hidden           → 409 `org_hidden`. A hidden org admits
 *     nobody new, not even through a queue filed before it was hidden.
 *   - they have verified no school email → 409 `school_unverified` (§3.2
 *     row 3). Its own code, never folded into the audience answer — see the
 *     comment at the check.
 *   - the audience excludes them  → 409 `audience_mismatch` (+ `audience`).
 *     Requests are not re-filed when officers narrow "Open to", so the check
 *     has to happen at approve time or the setting would only bind new
 *     arrivals.
 *
 * SHIPS WITH B27 (critic A10). This is the first code anywhere to insert an
 * `org_request_approved` notification, and the three DEPLOYED Otto renderers
 * fall through to a blank verb for a type they don't know
 * (`OttoSidePanel.tsx:846`, `OttoActivity.tsx:59` → "{officer} did something",
 * `_otto.js:781`). Until B27 teaches them the type, an approved student gets a
 * broken Otto row that opens the OFFICER's profile instead of the org.
 *
 * Admission goes through `admitMember` (B22), which is the ONE way anybody
 * becomes a member. That closes a real gap: this route used to insert the
 * `org_members` row itself and never subscribed the new member to the org's
 * public channels, so a student approved here landed in an org with no chats
 * and nothing told them or the officer (`join/route.ts` did it; this route
 * did not).
 *
 * The student is now also TOLD (`org_request_approved`). Before this, an
 * approval was silent: the officer tapped Approve and the student found out
 * only by revisiting the org page.
 *
 * DENIAL IS A RECORD, AND THE STUDENT'S SIDE READS IT (critic A8; Oct 22,
 * 2026). A denial writes `status = 'denied'` with `resolved_at` and
 * `resolved_by`, and that row is the only memory the system has that an
 * officer said no. `loadViewerOrgContext` reads the newest one as
 * `declinedAt`, and for `REQUEST_COOLDOWN_DAYS` (14) after it `orgJoinState`
 * answers `declined`: the club page says "Not this time. You can ask again
 * on <day>." and POST /join refuses a new request with 409
 * `recently_declined`. The invite route deliberately does NOT read it (an
 * officer may still invite somebody they turned down; an earlier version of
 * this comment said it checked 30 days, which it never did).
 *
 * Do not "clean up" denied rows, and do not null `resolved_at` on them. A
 * student who CANCELS deletes their pending row instead (DELETE /join), so a
 * cancel never starts the wait.
 *
 * S67 SECURITY WAVE 2 (#15 and the hidden-club Low):
 *   - a non-member asking about a HIDDEN club gets 404, never 403;
 *   - a request from somebody in a block pair with THIS officer (either way)
 *     is hidden from them in the list, so here it is 404
 *     `request_not_found` for approve and deny alike;
 *   - approve re-checks whether the owner or any officer has blocked the
 *     requester since they asked: 409 `approve_unavailable`, copy that never
 *     names the block (deny still works, so the queue can be cleared);
 *   - letting back somebody an officer REMOVED takes the invite roles
 *     (`canApproveRequest`): 403 `removed_needs_admin` otherwise (nobody,
 *     since mods became officers; kept in case the two lists part);
 *   - a suspended or banned officer can neither approve nor deny: 403
 *     `account_restricted` (`requireNotRestricted`, ruling 16).
 */
export async function POST(req: Request, { params }: Params) {
  const { slug, id: requestId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  // Generous on purpose: a rush week's queue is approved in one sitting, and
  // the cap is here to bound the notification insert below, not to pace an
  // officer doing ordinary work.
  const limit = await rateLimit(`org-request-resolve:${user.id}`, {
    limit: 60,
    windowSec: 600,
  });
  if (!limit.allowed) {
    return tooManyRequests(limit, "Too many requests handled at once. Try again shortly.");
  }

  // Terms AND no suspension or ban in force, for approve and deny alike
  // (waveA-build ruling 16). The writes below use the service role, which
  // skips the database's is_restricted_now(), and the proxy's restriction
  // check is only the fast path (session app_metadata; skipped on a GoTrue
  // blip). Same `terms_required` 403 as before, plus `account_restricted`.
  const accessGate = await requireNotRestricted(user.id);
  if (accessGate) return accessGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", code: "invalid_body" },
      { status: 400 },
    );
  }
  const action = body.action === "approve" || body.action === "deny" ? body.action : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action must be 'approve' or 'deny'", code: "invalid_action" },
      { status: 400 }
    );
  }

  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select("id, name, audience, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  const audience: OrgAudience = isOrgAudience(org.audience) ? org.audience : "both";

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const viewerRole = viewer && isOrgRole(viewer.role) ? viewer.role : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role: viewerRole, allowed: OFFICER_ROLES });
  if (gate === "not_found") {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }
  if (gate === "forbidden") {
    return NextResponse.json(
      { ok: false, error: "Staff only", code: "officers_only" },
      { status: 403 },
    );
  }

  const { data: reqRow } = await service
    .from("org_join_requests")
    .select("id, user_id, org_id, status")
    .eq("id", requestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!reqRow) {
    return NextResponse.json(
      { ok: false, error: "Request not found", code: "request_not_found" },
      { status: 404 },
    );
  }
  // A block either way between this officer and the requester: the request
  // is hidden from this officer (list route), so it doesn't exist for them.
  const pairBlocked = await isBlockedWithOrg(service, reqRow.user_id as string, [user.id]);
  if (pairBlocked === "error") {
    return NextResponse.json(
      { ok: false, error: "Request failed", code: "load_failed" },
      { status: 500 },
    );
  }
  if (pairBlocked) {
    return NextResponse.json(
      { ok: false, error: "Request not found", code: "request_not_found" },
      { status: 404 },
    );
  }
  if (reqRow.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "Request already resolved", code: "request_not_pending" },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  if (action === "approve") {
    if (org.hidden_at) {
      return NextResponse.json(
        {
          ok: false,
          error: "This org is hidden, so nobody new can join it.",
          code: "org_hidden",
        },
        { status: 409 },
      );
    }

    // Re-check the audience against what the org is set to NOW, not what it
    // was when the request was filed.
    const { data: requester, error: requesterErr } = await service
      .from("users")
      .select("school_system")
      .eq("id", reqRow.user_id)
      .maybeSingle();
    if (requesterErr) {
      console.error("[requests/[id] POST load requester]", requesterErr);
      return NextResponse.json(
        { ok: false, error: "Request failed", code: "load_failed" },
        { status: 500 },
      );
    }
    const rawSystem = (requester as { school_system?: unknown } | null)?.school_system;
    const system = isSchoolSystem(rawSystem) ? rawSystem : null;
    const orgName = (org.name as string | null) || "This org";

    // UNVERIFIED IS ITS OWN ANSWER, CHECKED FIRST — spec §3.2 rows 3 then 4,
    // the same order `orgJoinState` uses and the same order the sibling list
    // route uses to pick `ineligible_reason`.
    //
    // `audienceAllows` answers false for BOTH of these, so asking it first and
    // calling everything it refuses `audience_mismatch` tells a machine that a
    // student who has verified nothing is the wrong university — and ships
    // `audience: "both"` alongside, which B19 renders from the §5.1 table as
    // "open to IU and Purdue students only". That sentence is false, it
    // contradicts `ineligible_reason: "unverified"` that the list route
    // already returned for this same person a moment earlier on the officer's
    // screen, and it hides the one thing the student can actually fix.
    //
    // `school_unverified` is the code `POST /join` uses for the same condition
    // (spec §3.2 row 3); it is 409 rather than /join's 403 because here the
    // caller is an officer and the unverified account is somebody else's.
    if (system === null) {
      return NextResponse.json(
        {
          ok: false,
          error: `${orgName} is open to students with a verified school email.`,
          code: "school_unverified",
        },
        { status: 409 },
      );
    }
    if (!audienceAllows(audience, system)) {
      return NextResponse.json(
        {
          ok: false,
          error: `${orgName} is open to ${audience === "purdue" ? "Purdue" : "IU"} students only.`,
          code: "audience_mismatch",
          audience,
        },
        { status: 409 },
      );
    }

    // Blocks and removals, re-checked now: either can postdate the request.
    const [blocks, removed] = await Promise.all([
      loadOrgBlocks(service, org.id as string, reqRow.user_id as string),
      loadRemovedUserIds(service, org.id as string, [reqRow.user_id as string]),
    ]);
    if (!blocks.ok || !removed.ok) {
      console.error("[requests/[id] POST blocks/removals]", {
        blocks: blocks.ok ? null : blocks.error,
        removals: removed.ok ? null : removed.error,
      });
      return NextResponse.json(
        { ok: false, error: "Request failed", code: "load_failed" },
        { status: 500 },
      );
    }
    if (blocks.blockedByOfficer) {
      return NextResponse.json(
        { ok: false, error: ORG_COPY.errors.approveUnavailable, code: "approve_unavailable" },
        { status: 409 },
      );
    }
    if (!canApproveRequest(viewerRole, removed.ids.size > 0)) {
      return NextResponse.json(
        { ok: false, error: ORG_COPY.errors.removedNeedsAdmin, code: "removed_needs_admin" },
        { status: 403 },
      );
    }

    const admitted = await admitMember(service, {
      orgId: org.id as string,
      userId: reqRow.user_id as string,
      actorId: user.id,
      via: "request",
    });
    if (!admitted.ok) {
      return NextResponse.json(
        { ok: false, error: "Failed to add member", code: "admit_failed" },
        { status: 500 },
      );
    }
  }

  // On approve, `admitMember` has already resolved any pending request for
  // this (org, user) pair, so this usually rewrites a row that is already
  // `approved`. It stays because it is the only statement that names THIS
  // request id: the resolve inside `admitMember` is best-effort and logged,
  // and a queue row left `pending` after a successful admission would sit in
  // the officer's Requests tab forever, offering Approve for somebody who is
  // already a member.
  //
  // On DENY it is the whole operation, and it is also the durable record the
  // invite route reads (see the header).
  const { error: updErr } = await service
    .from("org_join_requests")
    .update({
      status: action === "approve" ? "approved" : "denied",
      resolved_at: nowIso,
      resolved_by: user.id,
    })
    .eq("id", requestId);
  if (updErr) {
    console.error("[requests/[id] POST update status]", { action, error: updErr });
    // Deny: nothing happened, so say so. Approve: the student IS a member —
    // `admitMember` returned ok — and telling the officer it failed would
    // send them to press Approve again on somebody already in the org. The
    // stale queue row is the smaller wrong, and it is logged.
    if (action === "deny") {
      return NextResponse.json(
        { ok: false, error: "Failed to update request", code: "update_failed" },
        { status: 500 }
      );
    }
  }

  if (action === "approve") {
    // Best-effort, and last on purpose: the membership is the outcome, Otto
    // is how they hear about it. `notifyOrg` logs and never throws.
    await notifyOrg(service, {
      type: "org_request_approved",
      userId: reqRow.user_id as string,
      actorId: user.id,
      orgId: org.id as string,
    });
  }

  return NextResponse.json({ ok: true });
}
