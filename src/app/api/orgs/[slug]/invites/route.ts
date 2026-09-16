import { NextResponse } from "next/server";

import { isDiscoverableAccount } from "@/lib/iu/community-scope";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  DECLINE_COOLDOWN_MS,
  canInvite,
  checkConstraintName,
  isJoinPolicy,
  isOrgAudience,
  isOrgRole,
  isUniqueViolation,
  orgJoinState,
  visibleInviterFirstName,
  type JoinPolicy,
  type OrgAudience,
  type OrgRole,
} from "@/lib/orgs/join-state";
import { expireStaleInvites, loadViewerOrgContext, notifyOrg } from "@/lib/orgs/membership";
import { isUuid } from "@/lib/pgrest";
import { isTriggerDefaultHandle } from "@/lib/profile/onboarding-prefill";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Officer → student org invites (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.5, §4.3; batch B23).
 *
 *   GET  /api/orgs/[slug]/invites   — the pending list, for officers
 *   POST /api/orgs/[slug]/invites   — send one
 *
 * WHO MAY SEND. {@link canInvite}, i.e. `INVITE_ROLES` in
 * `src/lib/orgs/join-state.ts` — owner and admin, NOT mod (critic C2). That
 * one array is also critic A8's fix: a mod could otherwise re-invite somebody
 * an owner had just removed or denied, and nothing records removals yet. Add
 * "mod" to `INVITE_ROLES` the day removals are recorded; nothing in this file
 * names a role.
 *
 * WHY EVERY QUERY USES THE SERVICE ROLE. M1c revoked the writes from
 * `authenticated`: `org_invites` is read-only for them, `org_members` INSERT
 * is gone and `org_join_requests` INSERT/UPDATE with it. The grant is the
 * boundary (security-model rule "grants not routes"), so this route is the one
 * that has to check policy, audience, hidden, blocks, Terms and the caps
 * before it writes anything.
 *
 * NOBODY IS EVER ADDED SILENTLY (spec §1 vs critic A11). The send path can
 * return "already invited", "they asked to join, approve the request", or a
 * fresh invite — it can never make somebody a member. `admitMember` is reached
 * only from `POST /api/orgs/[slug]/join`, which the student themselves calls.
 */

type Params = { params: Promise<{ slug: string }> };

// ── The knobs (one line each, on purpose) ───────────────────────────────────
//
// The THREE defaults pending Franky live one module away, in
// `src/lib/orgs/join-state.ts`: `INVITE_ROLES` (who may invite),
// `INVITE_ONLY_ORGS_IN_DISCOVERY` (are invite-only orgs listed) and
// `INVITE_LINKS_ENABLED` (shareable links, off in v1 — which is why this
// route's body takes a person, never a token). What follows is B23's own
// anti-abuse policy, exported so `../invite-candidates/route.ts` greys out a
// candidate for exactly the reason the send would refuse them, instead of
// letting an officer tap Invite and collect a 409.

/**
 * v1: only VERIFIED orgs may send invites (critic A6c). Any verified student
 * can create 5 orgs an hour and become owner of each, and the org's NAME is
 * free text rendered verbatim in "{officer} invited you to join {org}" — which
 * is the message field the spec deliberately left out, with no report path.
 * Verification is a human in the loop (`/api/admin/orgs/[slug]/verify`), and
 * SAE — the only real club — is already verified.
 */
export const INVITE_REQUIRES_VERIFIED_ORG = true;

/**
 * At most this many invites from one org to one person in
 * {@link PAIR_INVITE_WINDOW_DAYS} days, WHATEVER the outcome (critic A6a).
 *
 * The rate limits alone do not close the harassment loop: a revoke deletes the
 * notification, so invite → revoke → invite makes a fresh unread Otto row
 * every time, forever, inside 30/hour. A decline only buys
 * `DECLINE_COOLDOWN_DAYS`. This counts ROWS, so revoked and expired attempts
 * count too.
 */
export const PAIR_INVITE_MAX = 3;

/** The window {@link PAIR_INVITE_MAX} is counted over. */
export const PAIR_INVITE_WINDOW_DAYS = 90;

/** {@link PAIR_INVITE_WINDOW_DAYS} in milliseconds. */
export const PAIR_INVITE_WINDOW_MS = PAIR_INVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Per officer: 30 invites an hour. */
const LIMIT_PER_OFFICER = { limit: 30, windowSec: 3600 };
/** Per org: 100 invites a day, across all of its officers. */
const LIMIT_PER_ORG = { limit: 100, windowSec: 86400 };
/** Per invitee: 10 invites a day, across all orgs (critic A6b). */
const LIMIT_PER_INVITEE = { limit: 10, windowSec: 86400 };

/** Pending invites returned by the officer list. */
const LIST_LIMIT = 100;

// ── Shapes ──────────────────────────────────────────────────────────────────

export type InviteOrgRow = {
  id: string;
  handle: string;
  name: string | null;
  verified: boolean | null;
  hidden_at: string | null;
  join_policy: unknown;
  audience: unknown;
  campus_id: string | null;
  owner_id: string | null;
};

const ORG_COLUMNS =
  "id, handle, name, verified, hidden_at, join_policy, audience, campus_id, owner_id";

type InviteRow = {
  id: string;
  created_at: string;
  expires_at: string;
  invitee: { id: string; name: string | null; handle: string | null; avatar_url: string | null } | null;
  inviter: { id: string; name: string | null } | null;
};

const INVITE_SELECT =
  "id, created_at, expires_at," +
  " invitee:users!org_invites_invitee_id_fkey(id,name,handle,avatar_url)," +
  " inviter:users!org_invites_invited_by_fkey(id,name)";

type Body = { user_id?: unknown; handle?: unknown };

/**
 * The person being invited. `school_verified` and `otto_answers` are read
 * ONLY to run {@link isDiscoverableAccount}; `otto_answers` has no SELECT
 * grant for `authenticated` and neither ever leaves this route —
 * {@link publicTarget} is what goes on the wire.
 */
type TargetRow = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean | null;
  otto_answers: unknown;
};

const TARGET_COLUMNS = "id, name, handle, avatar_url, school_verified, otto_answers";

function fail(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

/**
 * The org's `join_policy` / `audience` as the narrowed unions
 * {@link orgJoinState} takes. Both columns carry CHECK constraints, so the
 * fallbacks below are unreachable in production; they exist so a value this
 * code does not understand can never widen what a stranger may do. `request`
 * is the middle policy and `both` is the column default.
 */
export function narrowInviteOrg(org: InviteOrgRow): {
  join_policy: JoinPolicy;
  audience: OrgAudience;
} {
  return {
    join_policy: isJoinPolicy(org.join_policy) ? org.join_policy : "request",
    audience: isOrgAudience(org.audience) ? org.audience : "both",
  };
}

/**
 * Load the org and prove the caller may invite for it — or hand back the
 * response to send instead.
 *
 * A HIDDEN ORG IS A 404 FOR NON-MEMBERS, not a 403 (spec §3.4): "officers
 * only" on a handle you cannot see would confirm the org exists.
 *
 * EXPORTED, and imported by `./[id]/route.ts` and
 * `../invite-candidates/route.ts`, so the three invite endpoints cannot drift
 * apart on who may act or on what a hidden org looks like from outside. A
 * route module is a plain TypeScript module: Next.js only ever calls the
 * HTTP-verb exports, and the generated route validator accepts a module with
 * extra exports (`.next/types/validator.ts` uses `extends`, not an exact
 * shape).
 */
export async function requireInviteOfficer(
  service: ReturnType<typeof createSupabaseServiceClient>,
  slug: string,
  userId: string,
): Promise<{ org: InviteOrgRow; role: OrgRole } | { response: NextResponse }> {
  const { data, error } = await service
    .from("orgs")
    .select(ORG_COLUMNS)
    .eq("handle", slug)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/invites load org]", error);
    return { response: fail(500, "request_failed", "Request failed") };
  }
  const org = (data as InviteOrgRow | null) ?? null;
  if (!org) return { response: fail(404, "not_found", "Not found") };

  const { data: member, error: memberErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberErr) {
    console.error("[orgs/[slug]/invites load role]", memberErr);
    return { response: fail(500, "request_failed", "Request failed") };
  }
  const roleValue = (member as { role?: unknown } | null)?.role;
  const role = isOrgRole(roleValue) ? roleValue : null;

  if (org.hidden_at && !role) return { response: fail(404, "not_found", "Not found") };
  if (!role || !canInvite(role)) {
    return {
      response: fail(403, "officers_only", "Only owners and admins can invite people."),
    };
  }
  return { org, role };
}

/** The viewer's live invite row for one person, or null. */
async function loadPendingInvite(
  service: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  inviteeId: string,
): Promise<{ id: string; created_at: string; expires_at: string } | null> {
  const { data, error } = await service
    .from("org_invites")
    .select("id, created_at, expires_at")
    .eq("org_id", orgId)
    .eq("invitee_id", inviteeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/invites load pending]", error);
    return null;
  }
  return (data as { id: string; created_at: string; expires_at: string } | null) ?? null;
}

// ── GET: the officer's pending list ─────────────────────────────────────────

/**
 * GET /api/orgs/[slug]/invites — pending invites, newest first, at most
 * {@link LIST_LIMIT}.
 *
 * 200 `{ok:true, invites:[{id, created_at, expires_at,
 *      invitee:{id,name,handle,avatar_url}, invited_by:{name}|null}]}`
 * 401 `unauthorized` · 403 `officers_only` · 404 `not_found` · 500
 * `request_failed`.
 *
 * `invited_by` is a FIRST NAME or null, and null renders as "an officer"
 * (critic A7): an officer this viewer has blocked or muted is never named back
 * at them. Stale rows are flipped to `expired` before the read, so the list
 * shows what is actually live rather than what the clock has not caught up to.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const service = createSupabaseServiceClient();
  const gate = await requireInviteOfficer(service, slug, user.id);
  if ("response" in gate) return gate.response;

  await expireStaleInvites(service, { orgId: gate.org.id });

  const nowIso = new Date().toISOString();
  const [listRes, hiddenRes] = await Promise.all([
    service
      .from("org_invites")
      .select(INVITE_SELECT)
      .eq("org_id", gate.org.id)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    loadHiddenUsers(supabase, user.id),
  ]);
  if (listRes.error) {
    console.error("[orgs/[slug]/invites GET]", listRes.error);
    return fail(500, "request_failed", "Failed to load invites");
  }
  // A failed blocks/mutes read must not name somebody this officer blocked, so
  // it falls back to hiding every inviter name rather than showing them all.
  const hidden: ReadonlySet<string> = hiddenRes.ok
    ? new Set(hiddenRes.hidden.ids)
    : new Set<string>();
  if (!hiddenRes.ok) {
    console.error("[orgs/[slug]/invites hidden-users]", hiddenRes.error);
  }

  const invites = ((listRes.data ?? []) as unknown as InviteRow[]).map((row) => {
    const name = hiddenRes.ok
      ? visibleInviterFirstName(row.inviter, hidden)
      : null;
    return {
      id: row.id,
      created_at: row.created_at,
      expires_at: row.expires_at,
      invitee: row.invitee
        ? {
            id: row.invitee.id,
            name: row.invitee.name,
            handle: row.invitee.handle,
            avatar_url: row.invitee.avatar_url,
          }
        : null,
      invited_by: name ? { name } : null,
    };
  });

  return NextResponse.json({ ok: true, invites });
}

// ── POST: send one ──────────────────────────────────────────────────────────

/**
 * POST /api/orgs/[slug]/invites — invite one person.
 *
 * Body: `{user_id}` OR `{handle}`, exactly one. No token and no code: v1 is
 * person-by-person (`INVITE_LINKS_ENABLED` is false).
 *
 * 200 `{ok:true, invite:{id, created_at, expires_at, invitee:{id,handle,name,avatar_url}}}`
 * 200 `{ok:true, already:true, invite:{…}}` — a live invite was already there
 * 400 `invalid_body` · `self_invite`
 * 401 `unauthorized`
 * 403 `officers_only` · `audience_mismatch` (+`audience`) · `terms_required`
 * 404 `not_found` (org) · `user_not_found`
 * 409 `org_hidden` · `org_unverified` · `already_member` ·
 *     `has_pending_request` (+`request_id`) · `recently_declined`
 *     (+`available_at`) · `invite_cap_reached` (+`available_at`)
 * 429 · 500 `request_failed`
 *
 * ORDER (spec §4 conventions): auth → per-officer rate limit → Terms → body →
 * service-role org load → officer check → hidden → verified → resolve the
 * person → blocks → their standing via {@link orgJoinState} → decline
 * cooldown and pair cap → per-org and per-invitee rate limits → insert →
 * notify.
 *
 * WHY THE ORG AND INVITEE LIMITS COME LATE. They sit AFTER every branch that
 * writes nothing (already a member, already invited, they have a pending
 * request), so a second tap on "Invite" cannot eat the org's daily budget or
 * the invitee's. The per-officer limit is first because it is the cheap brake
 * that protects the database from a stranger hammering the endpoint.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const perOfficer = await rateLimit(`org-invite:${user.id}`, LIMIT_PER_OFFICER);
  if (!perOfficer.allowed) {
    return tooManyRequests(perOfficer, "You've sent a lot of invites. Try again in an hour.");
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail(400, "invalid_body", "Invalid JSON");
  }
  const rawUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const rawHandle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  // Exactly one, so a client that sends both can never have us silently pick
  // the one it did not mean.
  if ((rawUserId && rawHandle) || (!rawUserId && !rawHandle)) {
    return fail(400, "invalid_body", "Provide exactly one of user_id or handle.");
  }
  if (rawUserId && !isUuid(rawUserId)) {
    return fail(400, "invalid_body", "Provide exactly one of user_id or handle.");
  }

  const service = createSupabaseServiceClient();
  const gate = await requireInviteOfficer(service, slug, user.id);
  if ("response" in gate) return gate.response;
  const { org } = gate;
  const orgName = org.name || "this org";

  if (org.hidden_at) {
    return fail(409, "org_hidden", "This org is hidden, so it can't invite anyone.");
  }
  if (INVITE_REQUIRES_VERIFIED_ORG && org.verified !== true) {
    return fail(
      409,
      "org_unverified",
      "Get this org verified before inviting people. Message Vibe to start that.",
    );
  }

  // ── Who are we inviting? ──────────────────────────────────────────────────
  //
  // ONE 404 for every "no". Not a real account, not verified, not onboarded, a
  // stranded `u<32hex>` handle, or a block in either direction with the sender
  // OR the owner (critic A7) — all `user_not_found`, so an officer can never
  // use this endpoint to discover that somebody blocked them.
  const targetQuery = service.from("users").select(TARGET_COLUMNS);
  const { data: targetData, error: targetErr } = await (rawUserId
    ? targetQuery.eq("id", rawUserId)
    : targetQuery.eq("handle", rawHandle)
  ).maybeSingle();
  if (targetErr) {
    console.error("[orgs/[slug]/invites load target]", targetErr);
    return fail(500, "request_failed", "Request failed");
  }
  const target = (targetData as TargetRow | null) ?? null;
  if (!target) return fail(404, "user_not_found", "No student with that handle.");
  if (target.id === user.id) {
    return fail(400, "self_invite", "You're already in this org.");
  }
  if (!isDiscoverableAccount(target) || isTriggerDefaultHandle(target.handle)) {
    return fail(404, "user_not_found", "No student with that handle.");
  }

  const blocked = await isBlockedWithOrg(service, target.id, [user.id, org.owner_id]);
  if (blocked === "error") return fail(500, "request_failed", "Request failed");
  if (blocked) return fail(404, "user_not_found", "No student with that handle.");

  // ── Their standing, through the one shared decision ───────────────────────
  //
  // Stale rows are flipped first so `pendingInvite` means "live invite" and a
  // long-expired row cannot answer `{already:true}` forever.
  await expireStaleInvites(service, { orgId: org.id, inviteeId: target.id });
  const context = await loadViewerOrgContext(service, org.id, target.id);
  if (!context.ok) {
    return fail(500, "request_failed", "Request failed");
  }
  // A verified-but-system-less account cannot be measured against an audience,
  // so it is not invitable (spec §3.5 step 1) rather than "audience mismatch".
  if (context.viewer.school_system === null) {
    return fail(404, "user_not_found", "No student with that handle.");
  }

  const narrowed = narrowInviteOrg(org);
  const decision = orgJoinState({
    org: {
      join_policy: narrowed.join_policy,
      audience: narrowed.audience,
      hidden_at: org.hidden_at,
      campus_id: org.campus_id,
    },
    viewer: context.viewer,
    role: context.role,
    pendingInvite: context.pendingInvite,
    pendingRequest: context.pendingRequest,
  });

  switch (decision.state) {
    case "member":
      return fail(409, "already_member", "They're already in this org.");
    case "audience_blocked":
      return fail(
        403,
        "audience_mismatch",
        `${orgName} is open to ${decision.audience === "purdue" ? "Purdue" : "IU"} students only.`,
        { audience: decision.audience },
      );
    case "invited": {
      // Idempotent: the officer (or another one) already invited them.
      const live = context.pendingInvite;
      return NextResponse.json({
        ok: true,
        already: true,
        invite: live
          ? {
              id: live.id,
              created_at: live.created_at,
              expires_at: live.expires_at,
              invitee: publicTarget(target),
            }
          : null,
      });
    }
    case "requested":
      // Critic A11: they asked first, so the officer approves the REQUEST.
      // Inviting here would make somebody a member without their asking
      // again, and would skip the request's own resolved_by audit.
      return fail(409, "has_pending_request", "They already asked to join. Approve their request.", {
        request_id: context.pendingRequest?.id ?? null,
      });
    case "can_join":
    case "can_request":
    case "invite_only":
      // The three invitable states. Officers may invite into open and request
      // orgs too (spec §3.5 step 8) — an invite is a nudge, not just a key.
      break;
    default:
      // `unverified`, `hidden` and `not_found` were all answered above, so
      // this is either a state B22 added after this route was written or a
      // row that contradicts itself. FAIL CLOSED: a write on a state we do
      // not understand is how an invite-only org quietly stops being one.
      console.error("[orgs/[slug]/invites unexpected state]", decision.state);
      return fail(500, "request_failed", "Request failed");
  }

  // ── The two caps that a rate limit cannot express ─────────────────────────
  const nowMs = Date.now();
  const [declinedRes, windowRes] = await Promise.all([
    service
      .from("org_invites")
      .select("resolved_at")
      .eq("org_id", org.id)
      .eq("invitee_id", target.id)
      .eq("status", "declined")
      .order("resolved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("org_invites")
      .select("created_at")
      .eq("org_id", org.id)
      .eq("invitee_id", target.id)
      .gte("created_at", new Date(nowMs - PAIR_INVITE_WINDOW_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(PAIR_INVITE_MAX),
  ]);
  if (declinedRes.error || windowRes.error) {
    console.error("[orgs/[slug]/invites caps]", declinedRes.error ?? windowRes.error);
    return fail(500, "request_failed", "Request failed");
  }

  const declinedAt = (declinedRes.data as { resolved_at: string | null } | null)?.resolved_at ?? null;
  const cooldownUntil = declinedAt ? new Date(declinedAt).getTime() + DECLINE_COOLDOWN_MS : null;
  if (cooldownUntil !== null && Number.isFinite(cooldownUntil) && cooldownUntil > nowMs) {
    return fail(409, "recently_declined", "They declined recently. You can invite them again later.", {
      available_at: new Date(cooldownUntil).toISOString(),
    });
  }

  const windowRows = (windowRes.data ?? []) as Array<{ created_at: string }>;
  if (windowRows.length >= PAIR_INVITE_MAX) {
    const oldest = new Date(windowRows[0]!.created_at).getTime();
    return fail(409, "invite_cap_reached", `${orgName} has invited them enough for now.`, {
      available_at: Number.isFinite(oldest)
        ? new Date(oldest + PAIR_INVITE_WINDOW_MS).toISOString()
        : null,
    });
  }

  // The last two limits, immediately before the write: everything above this
  // line either refuses or answers "already", so a second tap on Invite can
  // never spend the org's daily budget or this student's.
  const perOrg = await rateLimit(`org-invite-org:${org.id}`, LIMIT_PER_ORG);
  if (!perOrg.allowed) {
    return tooManyRequests(perOrg, `${orgName} has sent a lot of invites today. Try again tomorrow.`);
  }
  const perInvitee = await rateLimit(`org-invite-to:${target.id}`, LIMIT_PER_INVITEE);
  if (!perInvitee.allowed) {
    return tooManyRequests(perInvitee, "They've had a lot of invites today. Try again tomorrow.");
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  const { data: created, error: insertErr } = await service
    .from("org_invites")
    .insert({ org_id: org.id, invitee_id: target.id, invited_by: user.id })
    .select("id, created_at, expires_at")
    .single();

  if (insertErr) {
    // Critic B2: two officers inviting the same person at the same instant
    // race `org_invites_one_pending`. That is a normal outcome, not a 500.
    if (isUniqueViolation(insertErr)) {
      const live = await loadPendingInvite(service, org.id, target.id);
      return NextResponse.json({
        ok: true,
        already: true,
        invite: live ? { ...live, invitee: publicTarget(target) } : null,
      });
    }
    const constraint = checkConstraintName(insertErr);
    if (constraint === "org_invites_not_self_check") {
      return fail(400, "self_invite", "You're already in this org.");
    }
    console.error("[orgs/[slug]/invites insert]", insertErr);
    return fail(500, "request_failed", "Failed to send the invite");
  }

  const invite = created as { id: string; created_at: string; expires_at: string };

  // Otto is one of four ways they find out (org page banner, Orgs tab,
  // onboarding are the others), so a notification failure is logged inside
  // notifyOrg and never fails the invite that already landed.
  await notifyOrg(service, {
    type: "org_invite",
    userId: target.id,
    actorId: user.id,
    orgId: org.id,
  });

  return NextResponse.json({
    ok: true,
    invite: { ...invite, invitee: publicTarget(target) },
  });
}

/** What the sheet renders for the person invited. No email, ever. */
function publicTarget(target: {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
}) {
  return {
    id: target.id,
    name: target.name,
    handle: target.handle,
    avatar_url: target.avatar_url,
  };
}

/**
 * Is there a block, in EITHER direction, between this person and anybody who
 * speaks for the org — the sending officer or the owner (critic A7)?
 *
 * The owner is in the list because the invite arrives under the ORG's name: an
 * officer other than the one they blocked must not be a way around it.
 *
 * FAILS CLOSED, and says so: a read error returns `"error"` (the caller sends
 * 500) rather than `false`, unlike `users/search/route.ts:195-197`, which
 * surfaces unfiltered results when the blocks table cannot be read. Search
 * showing an extra row is a nuisance; an invite is a notification delivered to
 * somebody who asked not to hear from this person.
 */
async function isBlockedWithOrg(
  service: ReturnType<typeof createSupabaseServiceClient>,
  personId: string,
  orgSideIds: Array<string | null>,
): Promise<boolean | "error"> {
  const others = orgSideIds.filter((id): id is string => isUuid(id) && id !== personId);
  if (others.length === 0) return false;
  const [theyBlocked, blockedThem] = await Promise.all([
    service.from("blocks").select("blocked_id").eq("blocker_id", personId).in("blocked_id", others),
    service.from("blocks").select("blocker_id").eq("blocked_id", personId).in("blocker_id", others),
  ]);
  if (theyBlocked.error || blockedThem.error) {
    console.error("[orgs/[slug]/invites blocks]", theyBlocked.error ?? blockedThem.error);
    return "error";
  }
  return (theyBlocked.data?.length ?? 0) > 0 || (blockedThem.data?.length ?? 0) > 0;
}
