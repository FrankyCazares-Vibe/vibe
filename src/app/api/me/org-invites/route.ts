import { NextResponse } from "next/server";

import { isOrgAudience, visibleInviterFirstName } from "@/lib/orgs/join-state";
import { expireStaleInvites } from "@/lib/orgs/membership";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/me/org-invites — the student's invite inbox (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §4.3; batch B23).
 *
 * Drives the "You're invited" group at the top of the Orgs tab and the pin in
 * onboarding step 5. It answers one question — "who is waiting on me?" — so it
 * returns only LIVE invites: pending, unexpired, and on an org that still
 * exists and is not hidden.
 *
 * THE SERVICE ROLE IS NOT A SHORTCUT HERE, IT IS THE ONLY WAY. M1c narrowed
 * `orgs_select` to "public or member" AND "not hidden or member" (critic A4),
 * so an invited NON-MEMBER cannot read the invite-only org they were invited
 * to. Under the user client the org embed would come back null on every row
 * and this endpoint would return an empty inbox — silently, with no error. The
 * migration header says the same thing for B27's notification reads; this is
 * the same trap one route over.
 *
 * ACCEPT IS NOT HERE. Accepting is `POST /api/orgs/[slug]/join` (spec §3.5
 * step 3), which is why every row carries the org's handle. One admit path,
 * one place that re-checks hidden, audience and expiry.
 */

/** Live invites shown at once. Nobody has 50 pending club invites. */
const LIMIT = 50;

const SELECT =
  "id, created_at, expires_at," +
  " org:orgs!org_invites_org_id_fkey(id,handle,name,logo_url,verified,audience,hidden_at)," +
  " inviter:users!org_invites_invited_by_fkey(id,name)";

type Row = {
  id: string;
  created_at: string;
  expires_at: string;
  org: {
    id: string;
    handle: string;
    name: string | null;
    logo_url: string | null;
    verified: boolean | null;
    audience: unknown;
    hidden_at: string | null;
  } | null;
  inviter: { id: string; name: string | null } | null;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();

  // Flip anything the clock has ended before reading, so the inbox never shows
  // an invite whose Accept button would answer "this invite expired".
  await expireStaleInvites(service, { inviteeId: user.id });

  const nowIso = new Date().toISOString();
  const [listRes, hiddenRes] = await Promise.all([
    service
      .from("org_invites")
      .select(SELECT)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    loadHiddenUsers(supabase, user.id),
  ]);
  if (listRes.error) {
    console.error("[me/org-invites GET]", listRes.error);
    return NextResponse.json(
      { ok: false, error: "Failed to load invites", code: "request_failed" },
      { status: 500 },
    );
  }
  if (!hiddenRes.ok) console.error("[me/org-invites hidden-users]", hiddenRes.error);
  const hidden: ReadonlySet<string> = hiddenRes.ok ? new Set(hiddenRes.hidden.ids) : new Set<string>();

  const invites = ((listRes.data ?? []) as unknown as Row[])
    // A hidden org is gone for everyone who is not already a member, and an
    // invitee is not one (spec §3.4). A null org means the org was deleted
    // out from under the invite.
    .filter((row) => row.org !== null && row.org.hidden_at === null)
    .map((row) => {
      const org = row.org!;
      // Null renders as "an officer": a student who blocked or muted the
      // person who sent this must not have them named back at them (critic
      // A7). A failed blocks read hides every name rather than risking one.
      const inviterName = hiddenRes.ok ? visibleInviterFirstName(row.inviter, hidden) : null;
      return {
        id: row.id,
        created_at: row.created_at,
        expires_at: row.expires_at,
        org: {
          id: org.id,
          handle: org.handle,
          name: org.name,
          logo_url: org.logo_url,
          verified: org.verified === true,
          audience: isOrgAudience(org.audience) ? org.audience : "both",
        },
        invited_by: inviterName ? { name: inviterName } : null,
      };
    });

  return NextResponse.json({ ok: true, invites });
}
