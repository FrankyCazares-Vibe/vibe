import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { expireStaleInvites } from "@/lib/orgs/membership";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/me/org-invites/[id] — the student declines an org invite (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.5 step 4, §4.3; batch
 * B23).
 *
 * DECLINE IS THE ONLY ACTION HERE. Accepting is
 * `POST /api/orgs/[slug]/join` — one admit path for every row type, which is
 * the one place hidden, audience and expiry are re-checked and `admitMember`
 * runs. A second accept here would be a second chance to forget one of them.
 *
 * The row is marked `declined`, never deleted: the 14-day re-invite cooldown
 * and the 90-day pair cap in `/api/orgs/[slug]/invites` both read it, and a
 * deleted row would hand the org an immediate second attempt.
 *
 * The notification is marked READ rather than deleted. The student did answer
 * — unlike a revoke, where the invite they were told about no longer exists —
 * so the row stays true and simply stops nagging.
 */

type Params = { params: Promise<{ id: string }> };
type Body = { action?: unknown };

function fail(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * POST /api/me/org-invites/[id]
 * Body: `{action:"decline"}`
 *
 * 200 `{ok:true}` · 200 `{ok:true, already:true}` when it was already declined
 * 400 `invalid_action` · `invalid_body`
 * 401 `unauthorized` · 403 `terms_required`
 * 404 `invite_not_found` — including every invite that is not this student's,
 *     so the endpoint can never confirm somebody else's invite exists
 * 409 `invite_not_pending` — accepted, revoked or expired
 * 500 `request_failed`
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail(400, "invalid_body", "Invalid JSON");
  }
  if (body.action !== "decline") {
    return fail(400, "invalid_action", "action must be 'decline'");
  }

  // A non-uuid would raise 22P02 in PostgREST and read as a 500.
  if (!isUuid(id)) return fail(404, "invite_not_found", "That invite is gone.");

  const service = createSupabaseServiceClient();

  // Expiry is lazy (spec §2.3), so flip this student's stale rows first:
  // declining an invite that ended last week should say "already answered",
  // not record a decline that starts a 14-day cooldown the org never earned.
  await expireStaleInvites(service, { inviteeId: user.id });

  const { data: inviteData, error: inviteErr } = await service
    .from("org_invites")
    .select("id, org_id, status")
    .eq("id", id)
    .eq("invitee_id", user.id)
    .maybeSingle();
  if (inviteErr) {
    console.error("[me/org-invites/[id] load]", inviteErr);
    return fail(500, "request_failed", "Request failed");
  }
  const invite = (inviteData as { id: string; org_id: string; status: string } | null) ?? null;
  if (!invite) return fail(404, "invite_not_found", "That invite is gone.");
  if (invite.status === "declined") return NextResponse.json({ ok: true, already: true });
  if (invite.status !== "pending") {
    return fail(409, "invite_not_pending", "That invite was already answered.");
  }

  const nowIso = new Date().toISOString();
  // `.eq("status","pending")` keeps a double tap, or an officer revoking at the
  // same instant, from overwriting whichever answer landed first.
  // `resolved_at` is required by `org_invites_resolved_at_check` (critic B1).
  const { data: updated, error: updErr } = await service
    .from("org_invites")
    .update({ status: "declined", resolved_at: nowIso, resolved_by: user.id })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id");
  if (updErr) {
    console.error("[me/org-invites/[id] decline]", updErr);
    return fail(500, "request_failed", "Failed to decline the invite");
  }
  if (!updated || updated.length === 0) {
    // Somebody else resolved it between the read and the write. Re-read so a
    // student who tapped twice sees "already", not a 409 they can't act on.
    const { data: after } = await service
      .from("org_invites")
      .select("status")
      .eq("id", invite.id)
      .maybeSingle();
    const status = (after as { status?: unknown } | null)?.status;
    if (status === "declined") return NextResponse.json({ ok: true, already: true });
    return fail(409, "invite_not_pending", "That invite was already answered.");
  }

  // Best-effort and logged: the decline has landed, so a failed cleanup must
  // not tell the student their tap did nothing.
  const { error: notifErr } = await service
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("user_id", user.id)
    .eq("org_id", invite.org_id)
    .eq("type", "org_invite")
    .is("read_at", null);
  if (notifErr) {
    console.error("[me/org-invites/[id] mark read]", notifErr);
  }

  return NextResponse.json({ ok: true });
}
