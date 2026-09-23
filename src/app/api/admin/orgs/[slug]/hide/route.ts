import { NextResponse } from "next/server";

import {
  adminFail,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = { hidden?: unknown };

/**
 * POST /api/admin/orgs/[slug]/hide
 * Body: { hidden: boolean }
 *
 * Hides or unhides an org. Platform-admin only — the same gate as the sibling
 * `verify` route, bootstrapped by setting `users.is_platform_admin = true` on
 * the founder's row.
 *
 * WHAT HIDING IS (spec §3.4). The org leaves Discover, search, the map, event
 * lists, people suggestions and onboarding. Nobody new can join it, be
 * invited to it, or post as it. NOTHING IS DELETED: its members keep the org
 * page and their chats, under a "This org is hidden" notice, and unhiding
 * puts it back. This is how the four test orgs were taken off the campus
 * without destroying the accounts, events and channels attached to them.
 *
 * HIDING REVOKES PENDING INVITES, AND UNHIDING DOES NOT BRING THEM BACK
 * (critic B6 — the spec's "unhiding restores everything" was not true of
 * invites). An invite is an officer saying "join us this month"; leaving one
 * pending against an org that admits nobody would give the student an Accept
 * button that answers 409. The invite rows become `revoked` with the admin on
 * `resolved_by`, and the matching `org_invite` notifications are deleted so
 * Otto stops pointing at an invitation that no longer exists.
 *
 * PENDING JOIN REQUESTS ARE LEFT ALONE. A request is the student's own
 * standing ask, not the org's promise, and the approve route already refuses
 * with 409 `org_hidden` while the org is hidden. Unhiding makes the queue
 * workable again exactly as the officers left it.
 *
 * `hidden_at` IS NOT REWRITTEN when an already-hidden org is hidden again:
 * the column records when it happened, and a double-tap in the dashboard
 * must not relabel a months-old decision as today's.
 *
 * Writes go through the service role because M1c gave `hidden_at` no UPDATE
 * grant at all — the grant is the boundary, so this route is the only way the
 * column ever changes.
 *
 * THE GATE IS THE SHARED ONE NOW (`requirePlatformAdmin`), not a third inline
 * copy of the same three statements. The limiter keeps its own key and its own
 * 30 per 10 minutes — an established number for this route — and moves after
 * validation, where the house rule puts every limiter.
 *
 * EVERY CHANGE IS LOGGED to `moderation_actions`: hiding a club is moderation,
 * and until now nothing recorded who did it. The log carries the org's UUID as
 * the target (handles can be changed; ids cannot) with the handle in `meta` so
 * the screen can still read the row out loud.
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
  if (typeof body.hidden !== "boolean") {
    return adminFail(400, "invalid_body", "hidden must be a boolean");
  }
  const hidden = body.hidden;

  const limit = await rateLimit(`admin-org-hide:${gate.userId}`, {
    limit: 30,
    windowSec: 600,
  });
  if (!limit.allowed) {
    return tooManyRequests(limit, "Too many changes at once. Try again shortly.");
  }

  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, handle, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  const orgId = org.id as string;
  const currentHiddenAt = (org.hidden_at as string | null) ?? null;
  const alreadyInState = hidden === !!currentHiddenAt;

  if (alreadyInState) {
    // Nothing to write. A repeat HIDE still sweeps invites: one sent in the
    // window between two taps would otherwise survive, and the whole point is
    // that a hidden org has no live invitations.
    const revokedInvites = hidden
      ? await revokePendingInvites(service, orgId, gate.userId)
      : 0;
    // A repeat that revoked nothing changed nothing, and an append-only log of
    // no-ops is noise; a repeat that swept invites did something real, so it
    // goes in the trail.
    const logged =
      revokedInvites > 0
        ? await logModerationAction(service, {
            actorId: gate.userId,
            action: "org_hide",
            targetType: "org",
            targetId: orgId,
            meta: {
              handle: org.handle as string,
              changed: false,
              revoked_invites: revokedInvites,
            },
          })
        : true;
    // Answer with the row as it stands so the dashboard settles on the truth
    // either way.
    return NextResponse.json({
      ok: true,
      org: { id: orgId, handle: org.handle as string, hidden_at: currentHiddenAt },
      hidden: !!currentHiddenAt,
      revoked_invites: revokedInvites,
      changed: false,
      logged,
    });
  }

  const { data, error } = await service
    .from("orgs")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", orgId)
    .select("id, handle, hidden_at")
    .single();
  if (error || !data) {
    console.error("[admin/orgs/[slug]/hide POST]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update hidden status", code: "update_failed" },
      { status: 500 }
    );
  }

  // ONLY AFTER THE ORG IS ACTUALLY HIDDEN. Revoking first and then failing the
  // UPDATE would leave the org visible with its invitations destroyed — a
  // destructive side effect of an operation that did not happen. The admin
  // would retry, see the same 500, and the officers' pending invites would be
  // gone for nothing.
  const revokedInvites = hidden
    ? await revokePendingInvites(service, orgId, gate.userId)
    : 0;

  const logged = await logModerationAction(service, {
    actorId: gate.userId,
    action: hidden ? "org_hide" : "org_unhide",
    targetType: "org",
    targetId: orgId,
    meta: {
      handle: (data as { handle: string }).handle,
      changed: true,
      revoked_invites: revokedInvites,
    },
  });

  return NextResponse.json({
    ok: true,
    org: data,
    hidden: !!(data as { hidden_at: string | null }).hidden_at,
    revoked_invites: revokedInvites,
    changed: true,
    logged,
  });
}

/**
 * Revoke every pending invite on an org and delete the notifications that
 * announced them. Returns how many were revoked.
 *
 * CALLED ONLY AFTER THE ORG IS HIDDEN, never before — see the call sites.
 *
 * ONE STATEMENT REVOKES AND NAMES WHAT IT REVOKED. `.select()` rides on the
 * UPDATE itself, so "the rows revoked" and "the rows whose notification is
 * deleted" are provably the same set. Reading the pending ids first and then
 * updating on the same filter (`status = 'pending'`) left a race: an invite
 * inserted between the two statements was revoked by the UPDATE but was not in
 * the id list, so its Otto row survived pointing at a dead invitation and the
 * returned count under-reported it.
 *
 * The delete is scoped by `user_id in (…)`. Deleting every `org_invite`
 * notification for the org instead would also wipe the rows of people who
 * already accepted or declined — their history, not a live prompt.
 *
 * Honest limit: PostgREST caps the rows an UPDATE *returns*, not the rows it
 * writes. Past that cap (far beyond any real org's pending invites) every
 * invite is still revoked, but the count and the notification sweep would only
 * cover the returned page — under-reporting, never over-reporting.
 *
 * Best-effort and logged, never thrown: the org is already hidden by the time
 * this runs, so a failure here costs a stale Otto row, not the operation. A
 * failure reports 0 rather than a guess.
 */
async function revokePendingInvites(
  service: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  adminId: string,
): Promise<number> {
  try {
    // `resolved_at` is set in the same statement as `status`:
    // `org_invites_resolved_at_check` rejects a resolved row without it
    // (critic B1).
    const { data: revoked, error: updErr } = await service
      .from("org_invites")
      .update({
        status: "revoked",
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
      })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .select("id, invitee_id");
    if (updErr) {
      console.error("[admin/orgs/[slug]/hide revoke invites]", updErr);
      return 0;
    }
    const rows = (revoked || []) as Array<{ id: string; invitee_id: string }>;
    if (rows.length === 0) return 0;

    const inviteeIds = [...new Set(rows.map((r) => r.invitee_id))];
    const { error: notifErr } = await service
      .from("notifications")
      .delete()
      .eq("org_id", orgId)
      .eq("type", "org_invite")
      .in("user_id", inviteeIds);
    if (notifErr) {
      // The invite is already revoked, so the Accept button is gone; the
      // stale Otto row is the smaller wrong, and it is logged.
      console.error("[admin/orgs/[slug]/hide delete invite notifications]", notifErr);
    }

    return rows.length;
  } catch (e) {
    console.error("[admin/orgs/[slug]/hide revokePendingInvites]", e);
    return 0;
  }
}
