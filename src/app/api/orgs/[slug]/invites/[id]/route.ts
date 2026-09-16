import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { expireStaleInvites } from "@/lib/orgs/membership";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { requireInviteOfficer } from "../route";

/**
 * DELETE /api/orgs/[slug]/invites/[id] — an officer takes an invite back
 * (spec `handoffs/2026-09-15-org-invites-audience-spec.md` §3.5 step 5, §4.3;
 * batch B23).
 *
 * The row is kept and marked `revoked` — never deleted — because the pair cap
 * in `../route.ts` counts ROWS in a 90-day window, whatever their outcome
 * (critic A6a). Deleting it would reset the count and reopen the exact
 * invite → revoke → invite notification loop the cap exists to close.
 *
 * The NOTIFICATION is deleted, though (spec §2.4): the student never accepted
 * or declined anything, so leaving "{officer} invited you to join {org}" in
 * Otto would point at an invite that no longer exists.
 *
 * ON A HIDDEN ORG this still works. Hiding revokes everything anyway (§3.4),
 * and a revoke only ever removes access — it is the send path that is blocked
 * at 409 `org_hidden`.
 */

type Params = { params: Promise<{ slug: string; id: string }> };

function fail(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * DELETE /api/orgs/[slug]/invites/[id]
 *
 * 200 `{ok:true}` · 200 `{ok:true, already:true}` when it was already revoked
 * 401 `unauthorized` · 403 `officers_only` / `terms_required`
 * 404 `not_found` (org) · `invite_not_found`
 * 409 `invite_not_pending` (accepted, declined or expired)
 * 500 `request_failed`
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  // A non-uuid can never be an invite id, and feeding it to PostgREST would
  // raise 22P02 and read as a 500 instead of "no such invite".
  if (!isUuid(id)) return fail(404, "invite_not_found", "That invite is gone.");

  const service = createSupabaseServiceClient();

  // The same gate the send path uses (`../route.ts`), so "who may act" and
  // "a hidden org is a 404 for non-members" are decided once, not three times.
  const gate = await requireInviteOfficer(service, slug, user.id);
  if ("response" in gate) return gate.response;
  const { org } = gate;

  // Flip anything the clock has already ended, so an expired invite answers
  // 409 `invite_not_pending` instead of being "revoked" after the fact.
  await expireStaleInvites(service, { orgId: org.id });

  const { data: inviteData, error: inviteErr } = await service
    .from("org_invites")
    .select("id, invitee_id, status")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (inviteErr) {
    console.error("[orgs/[slug]/invites/[id] load invite]", inviteErr);
    return fail(500, "request_failed", "Request failed");
  }
  const invite = (inviteData as { id: string; invitee_id: string; status: string } | null) ?? null;
  if (!invite) return fail(404, "invite_not_found", "That invite is gone.");
  if (invite.status === "revoked") return NextResponse.json({ ok: true, already: true });
  if (invite.status !== "pending") {
    return fail(409, "invite_not_pending", "That invite was already answered.");
  }

  const nowIso = new Date().toISOString();
  // `.eq("status","pending")` makes this the race-safe half of the check
  // above: if the student accepted or declined in between, 0 rows change and
  // we say so rather than overwriting their answer. `resolved_at` is required
  // by `org_invites_resolved_at_check` (critic B1).
  const { data: updated, error: updErr } = await service
    .from("org_invites")
    .update({ status: "revoked", resolved_at: nowIso, resolved_by: user.id })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id");
  if (updErr) {
    console.error("[orgs/[slug]/invites/[id] revoke]", updErr);
    return fail(500, "request_failed", "Failed to revoke the invite");
  }
  if (!updated || updated.length === 0) {
    return fail(409, "invite_not_pending", "That invite was already answered.");
  }

  // Best-effort, and logged: the invite IS revoked at this point, so a failed
  // cleanup must not tell the officer their tap did nothing. Every
  // `org_invite` row for this (student, org) goes, because an older invite's
  // notification would open the same dead banner.
  const { error: notifErr } = await service
    .from("notifications")
    .delete()
    .eq("user_id", invite.invitee_id)
    .eq("org_id", org.id)
    .eq("type", "org_invite");
  if (notifErr) {
    console.error("[orgs/[slug]/invites/[id] delete notification]", notifErr);
  }

  return NextResponse.json({ ok: true });
}
