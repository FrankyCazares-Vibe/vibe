import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSchoolSystem } from "@/lib/iu/campuses";
import {
  checkConstraintName,
  isOrgRole,
  isUniqueViolation,
  type OrgRole,
  type ViewerSystem,
} from "@/lib/orgs/join-state";
import { kickPushDrain } from "@/lib/push/dispatch";

/**
 * The database side of org membership: what a viewer's standing with an org
 * is, and the one way anybody becomes a member (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §4.1, §3.5; batch B22).
 *
 * SERVICE ROLE, ALWAYS. Every function here takes a
 * `createSupabaseServiceClient()` as its first argument, because M1c took the
 * writes away from `authenticated`:
 *   - `INSERT` on `org_members` is revoked and `org_members_insert` is dropped;
 *   - `INSERT`/`UPDATE` on `org_join_requests` are revoked (SELECT stays);
 *   - `org_invites` is read-only for `authenticated`;
 *   - `orgs.join_policy`, `.audience` and `.hidden_at` have no UPDATE grant.
 * The grant is the boundary, so the ROUTE has to check policy, audience,
 * hidden, campus, rate limit and Terms before calling anything here. Nothing
 * in this file authorises; it only executes a decision
 * {@link import("./join-state").orgJoinState} already made.
 *
 * NOTHING HERE THROWS on a query error. Each function either reports the
 * failure in its return value (`ok: false`) or logs it and moves on, so one
 * dead best-effort write never costs a student their membership.
 */

// ── Postgres error helpers (critic B2) ──────────────────────────────────────

/**
 * Both helpers live in the pure `join-state.ts` so `node --test` can reach
 * them — `import "server-only"` at the top of this file throws outside a
 * server bundle — and are re-exported here because B23 reads them next to the
 * queries that raise them.
 */
export { checkConstraintName, isUniqueViolation };

// ── Reading a viewer's standing ─────────────────────────────────────────────

export type ViewerRow = {
  school_system: ViewerSystem;
  campus_id: string | null;
  is_platform_admin: boolean;
};

export type PendingInvite = {
  id: string;
  expires_at: string;
  created_at: string;
  /** The officer who sent it; null once their account is deleted. */
  invited_by: string | null;
};

export type PendingRequest = {
  id: string;
  status: string;
  requested_at: string | null;
};

export type ViewerOrgContext = {
  role: OrgRole | null;
  pendingInvite: PendingInvite | null;
  pendingRequest: PendingRequest | null;
  viewer: ViewerRow;
  /**
   * False when any of the four reads failed. The other four fields are then
   * the least-privileged answer (no role, no invite, no request, unverified),
   * which is safe to act on but WRONG to render: a real member would be told
   * to verify their school email. Routes check this and return 500 rather
   * than show a member the door. Ignoring it degrades silently — that is the
   * whole reason the flag is here.
   */
  ok: boolean;
  error: unknown;
};

/** The empty, least-privileged viewer (used when the read fails). */
const NO_VIEWER: ViewerRow = Object.freeze({
  school_system: null,
  campus_id: null,
  is_platform_admin: false,
});

/**
 * Everything {@link import("./join-state").orgJoinState} needs about one
 * viewer and one org, in a single round trip (four queries in parallel).
 *
 * Returns the spec's four fields plus `ok`/`error`, so
 * `const { role, pendingInvite, pendingRequest, viewer } = await
 * loadViewerOrgContext(...)` reads exactly as §4.1 wrote it while a caller
 * that cares can still tell "not a member" from "the query failed".
 *
 * Expiry is NOT flipped here (this is a read). A pending-but-expired invite
 * comes back as a row and `orgJoinState` ignores it on the clock; a writer
 * calls {@link expireStaleInvites} before acting.
 */
export async function loadViewerOrgContext(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<ViewerOrgContext> {
  const [memberRes, inviteRes, requestRes, viewerRes] = await Promise.all([
    service
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("org_invites")
      .select("id, expires_at, created_at, invited_by")
      .eq("org_id", orgId)
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("org_join_requests")
      .select("id, status, requested_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle(),
    service
      .from("users")
      .select("school_system, campus_id, is_platform_admin")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const failure =
    memberRes.error ?? inviteRes.error ?? requestRes.error ?? viewerRes.error ?? null;
  if (failure) console.error("[orgs/membership loadViewerOrgContext]", failure);

  const roleValue = (memberRes.data as { role?: unknown } | null)?.role;
  const viewerRow = viewerRes.data as {
    school_system?: unknown;
    campus_id?: unknown;
    is_platform_admin?: unknown;
  } | null;

  return {
    role: isOrgRole(roleValue) ? roleValue : null,
    pendingInvite: (inviteRes.data as PendingInvite | null) ?? null,
    pendingRequest: (requestRes.data as PendingRequest | null) ?? null,
    viewer: viewerRow
      ? {
          // A junk system in the column reads as unverified, never as a match.
          school_system: isSchoolSystem(viewerRow.school_system)
            ? viewerRow.school_system
            : null,
          campus_id:
            typeof viewerRow.campus_id === "string" && viewerRow.campus_id
              ? viewerRow.campus_id
              : null,
          is_platform_admin: viewerRow.is_platform_admin === true,
        }
      : NO_VIEWER,
    ok: !failure,
    error: failure,
  };
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Subscribe a new member to every non-private channel of their org, so the
 * org's chats appear in `/messages` immediately.
 *
 * Moved verbatim from `POST /api/orgs/[slug]/join` (`join/route.ts:76-93`) so
 * that the request-approval path gets it too — today an approved student
 * joins with no chats at all, and nothing tells them (spec §4.2).
 *
 * Best-effort on purpose: org membership alone already grants RLS read access
 * through `can_view_org_channel`, so a failure here costs the thread list, not
 * the membership. It is logged, never thrown.
 */
export async function subscribePublicChannels(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<void> {
  try {
    const { data: channels, error } = await service
      .from("channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_private", false);
    if (error) {
      console.error("[orgs/membership subscribePublicChannels load]", error);
      return;
    }
    if (!channels || channels.length === 0) return;
    const now = new Date().toISOString();
    const { error: upsertErr } = await service.from("channel_members").upsert(
      channels.map((c) => ({
        channel_id: (c as { id: string }).id,
        user_id: userId,
        role: "member",
        accepted_at: now,
      })),
      { onConflict: "channel_id,user_id", ignoreDuplicates: true },
    );
    if (upsertErr) {
      console.error("[orgs/membership subscribePublicChannels upsert]", upsertErr);
    }
  } catch (e) {
    console.error("[orgs/membership subscribePublicChannels]", e);
  }
}

export type AdmitVia = "join" | "request" | "invite";

/**
 * THE one way a person becomes a member (spec §3.5 step 3). Every route that
 * admits somebody — instant join, accepted invite, approved request — comes
 * through here, so the follow-up work can never be forgotten in one of them:
 *
 *   1. insert `org_members` (role `member`). A 23505 means they were already
 *      in, so it returns `already: true` instead of a 500 (critic B2);
 *   2. subscribe the org's public channels;
 *   3. resolve a pending invite to `accepted` (with `resolved_at`, critic B1);
 *   4. resolve a pending request to `approved`, so a leftover row cannot
 *      strand them (spec §3.2 row 6);
 *   5. mark their `org_invite` notification read, so Otto stops nagging.
 *
 * Steps 2-5 are best-effort and logged: once step 1 lands the person IS a
 * member, and reporting failure would tell the caller to show an error over a
 * join that actually worked.
 *
 * AUTHORISATION IS THE CALLER'S JOB. This function does not look at policy,
 * audience, hidden or campus — the route does that through `orgJoinState`.
 *
 * `actorId` is whoever caused the admission: the student themselves on join
 * and accept, the approving officer on a request. It is written to
 * `resolved_by` on both resolved rows.
 */
export async function admitMember(
  service: SupabaseClient,
  args: { orgId: string; userId: string; actorId: string; via: AdmitVia },
): Promise<{ ok: true; already: boolean } | { ok: false }> {
  const { orgId, userId, actorId, via } = args;

  let already = false;
  const { error: insertErr } = await service
    .from("org_members")
    .insert({ org_id: orgId, user_id: userId, role: "member" });
  if (insertErr) {
    if (!isUniqueViolation(insertErr)) {
      console.error("[orgs/membership admitMember insert]", { via, error: insertErr });
      return { ok: false };
    }
    already = true;
  }

  await subscribePublicChannels(service, orgId, userId);

  const nowIso = new Date().toISOString();

  // The invite is spent: they are in the org now, and a row left `pending`
  // would block the next invite through `org_invites_one_pending`. Only a
  // LIVE invite becomes `accepted` — an expired one was not accepted by
  // anybody, so it keeps waiting for {@link expireStaleInvites} to record it
  // truthfully as `expired`. Nothing reads it in the meantime: the person is
  // a member, and `member` wins every decision.
  //
  // `resolved_by` is the INVITEE, not `actorId`, on every path. An invite is
  // spent by the person whose membership it became, and on `via:"request"` the
  // actor is the approving officer — writing them here would file an audit row
  // saying an officer accepted somebody else's invite, which is the same false
  // record the expiry rule above exists to avoid.
  const { error: inviteErr } = await service
    .from("org_invites")
    .update({ status: "accepted", resolved_at: nowIso, resolved_by: userId })
    .eq("org_id", orgId)
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .gt("expires_at", nowIso);
  if (inviteErr) {
    console.error("[orgs/membership admitMember resolve invite]", { via, error: inviteErr });
  }

  const { error: requestErr } = await service
    .from("org_join_requests")
    .update({ status: "approved", resolved_at: nowIso, resolved_by: actorId })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (requestErr) {
    console.error("[orgs/membership admitMember resolve request]", { via, error: requestErr });
  }

  const { error: notifErr } = await service
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("type", "org_invite")
    .is("read_at", null);
  if (notifErr) {
    console.error("[orgs/membership admitMember mark invite read]", { via, error: notifErr });
  }

  return { ok: true, already };
}

/**
 * Flip invites that are past `expires_at` but still marked `pending`
 * (spec §2.3: expiry is lazy, so a WRITER flips the rows before acting).
 *
 * CRITIC B1: the flip must set `resolved_at` too, or
 * `org_invites_resolved_at_check` raises 23514.
 *
 * ONE STATEMENT, and `resolved_at` = the moment expiry was NOTICED. The
 * migration's column comment suggests `resolved_at = expires_at`; that costs a
 * read plus one UPDATE per distinct `expires_at`, and `expires_at` defaults to
 * `now() + interval '30 days'` evaluated per insert transaction, so every
 * invite sent by a separate request has its own microsecond-distinct value.
 * Grouping by it therefore degenerates to one round trip PER INVITE: a
 * 100-person rush class would make the first officer to open the invite list
 * wait for 100 serial Vercel→Supabase calls. Nothing is lost by using `now()`
 * instead — the true expiry moment is still on the row, in `expires_at`, and
 * `resolved_at` now carries the one fact that was not already recorded.
 *
 * At least one of `orgId` / `inviteeId` is required: an unfiltered sweep over
 * every org's invites is never what a route wants, and this is the service
 * role. Never throws.
 *
 * The `<=` matches {@link import("./join-state").inviteIsLive}: an invite is
 * live while `expires_at > now`, so it is stale the instant they are equal,
 * and readers and this writer can never disagree about a boundary row.
 */
export async function expireStaleInvites(
  service: SupabaseClient,
  filter: { orgId?: string; inviteeId?: string },
): Promise<void> {
  const { orgId, inviteeId } = filter;
  if (!orgId && !inviteeId) {
    console.error("[orgs/membership expireStaleInvites] refused an unfiltered sweep");
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    let query = service
      .from("org_invites")
      .update({ status: "expired", resolved_at: nowIso })
      .eq("status", "pending")
      .lte("expires_at", nowIso);
    if (orgId) query = query.eq("org_id", orgId);
    if (inviteeId) query = query.eq("invitee_id", inviteeId);

    const { error } = await query;
    if (error) console.error("[orgs/membership expireStaleInvites]", error);
  } catch (e) {
    console.error("[orgs/membership expireStaleInvites]", e);
  }
}

export type OrgNotificationType = "org_invite" | "org_request_approved";

/**
 * Tell a student something happened in an org: they were invited, or their
 * request was approved. Rows go in with the SERVICE role, `user_id` = the
 * student and `actor_id` = the officer (`notifications_insert_as_actor` stays
 * mention-only).
 *
 * LOGS, NEVER THROWS (spec §3.5 step 1): a notification that fails must not
 * fail the invite. The invite row is the record; Otto is one of four ways the
 * student finds out (org page banner, Orgs tab, onboarding, an officer saying
 * "open vibe").
 *
 * MIGRATION LAG IS MATCHED EXACTLY, NOT LOOSELY. M1c is applied to production,
 * so both lag branches below are dead there and only fire on an environment
 * whose database is behind (a local stack, a Supabase branch). They match by
 * error code through `isMissingColumnError` and by CONSTRAINT NAME — never by
 * the bare word "org_id", which also appears in
 * `… violates foreign key constraint "notifications_org_id_fkey"`, the error a
 * deleted org raises. Swallowing that one would stop a whole class of invite
 * notifications from arriving while the log insisted the schema was behind.
 */
export async function notifyOrg(
  service: SupabaseClient,
  row: {
    type: OrgNotificationType;
    userId: string;
    actorId: string;
    orgId: string;
  },
): Promise<void> {
  // Nobody needs Otto to tell them about their own tap.
  if (row.userId === row.actorId) return;
  try {
    const { error } = await service.from("notifications").insert({
      user_id: row.userId,
      actor_id: row.actorId,
      type: row.type,
      org_id: row.orgId,
    });
    if (!error) {
      // The notifications trigger queued this row's push; drain it after the
      // response. kickPushDrain uses after(), so it needs a request scope:
      // both callers (the invites POST and the requests/[id] POST) are route
      // handlers. It returns at once and never throws, so a push problem
      // can't fail the invite or the approval either.
      kickPushDrain();
      return;
    }
    if (isMissingColumnError(error, ["org_id"])) {
      console.error("[orgs/membership notifyOrg] skipped, notifications.org_id is not deployed", {
        type: row.type,
        message: error.message,
      });
      return;
    }
    if (checkConstraintName(error) === "notifications_type_check") {
      console.error("[orgs/membership notifyOrg] skipped, notifications_type_check is not widened", {
        type: row.type,
        message: error.message,
      });
      return;
    }
    console.error("[orgs/membership notifyOrg]", { type: row.type, error });
  } catch (e) {
    console.error("[orgs/membership notifyOrg]", e);
  }
}
