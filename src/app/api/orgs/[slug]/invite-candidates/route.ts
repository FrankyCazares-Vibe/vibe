import { NextResponse } from "next/server";

import { isSchoolSystem } from "@/lib/iu/campuses";
import { isDiscoverableAccount } from "@/lib/iu/community-scope";
import {
  DECLINE_COOLDOWN_MS,
  audienceAllows,
  inviteIsLive,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { expireStaleInvites } from "@/lib/orgs/membership";
import { ilikeOrFilter, ilikePrefixOrFilter, isUuid } from "@/lib/pgrest";
import { isTriggerDefaultHandle } from "@/lib/profile/onboarding-prefill";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  INVITE_REQUIRES_VERIFIED_ORG,
  PAIR_INVITE_MAX,
  PAIR_INVITE_WINDOW_MS,
  narrowInviteOrg,
  requireInviteOfficer,
} from "../invites/route";

/**
 * GET /api/orgs/[slug]/invite-candidates?q= — the people picker behind the
 * "Invite people" sheet (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §4.3, §5.1; batch B23).
 *
 * NOBODY IS HIDDEN FOR BEING INELIGIBLE. A student the org may not invite
 * comes back greyed out WITH A REASON — "open to IU students only", "declined,
 * you can invite again Oct 4" — because an officer who types a friend's handle
 * and gets "No one found" concludes Vibe is broken, not that the setting they
 * chose is doing its job. The only people actually dropped are the ones an
 * officer must never learn about from this endpoint: strangers to the platform
 * (unverified, not onboarded, still on the trigger's `u<32hex>` handle) and
 * anybody with a block in either direction against the officer or the owner
 * (critic A7).
 *
 * EVERY STATE THIS RETURNS MATCHES A BRANCH IN `../invites/route.ts`. The
 * decline cooldown, the 90-day pair cap and the verified-org gate are imported
 * from there rather than restated, so a change to the policy moves the grey-out
 * and the 409 together. That is the whole reason those constants are exported.
 *
 * NO EMAILS. `school_system`, `school_verified` and `otto_answers` are read to
 * make the decision and never put on the wire; the row that goes out is the
 * same public shape `users/search` returns, plus major and year.
 */

type Params = { params: Promise<{ slug: string }> };

/** `q` shorter than this returns nothing: one letter matches half the campus. */
const Q_MIN = 2;
const Q_MAX = 40;

/** Results per search (spec §4.3). */
const MAX_RESULTS = 20;

/**
 * Extra rows pulled per query so the not-a-real-account filter below doesn't
 * eat into the page — same trick, and the same reason, as
 * `users/search/route.ts:15`.
 */
const FILTER_HEADROOM = 10;

/** 60 searches a minute: a debounced typeahead, not a scraper. */
const LIMIT_SEARCH = { limit: 60, windowSec: 60 };

const CANDIDATE_COLUMNS =
  "id, name, handle, avatar_url, major, year, school_system, school_verified, otto_answers";

type CandidateRow = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: number | null;
  school_system: unknown;
  school_verified: boolean | null;
  otto_answers: unknown;
};

/** What the sheet's right-hand button says. Mirrors `../invites/route.ts`. */
type CandidateState =
  | "member"
  | "invited"
  | "requested"
  | "declined_recently"
  | "invite_cap_reached"
  | "none";

/** Why an otherwise findable student cannot be invited right now. */
type IneligibleReason = "audience_iu" | "audience_purdue" | "unverified" | null;

function fail(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/orgs/[slug]/invite-candidates?q=
 *
 * 200 `{ok:true, can_invite:boolean, blocked_reason:"org_hidden"|"org_unverified"|null,
 *      users:[{id,name,handle,avatar_url,major,year, state, eligible, reason,
 *              available_at?, request_id?}]}`
 * 401 `unauthorized` · 403 `officers_only` · 404 `not_found` · 429 ·
 * 500 `request_failed`
 *
 * `can_invite` is about the ORG, not the person: false with `org_unverified`
 * or `org_hidden` means every Invite button in the sheet would 409, so the
 * sheet says so once at the top instead of failing 20 times.
 *
 * FIELD PRECEDENCE B25 MUST HONOUR — `state` FIRST, `eligible` SECOND.
 * `eligible` here answers one question only ("would an invite sent RIGHT NOW
 * pass the audience check?"), and it is computed independently of `state`
 * rather than through `orgJoinState`'s §3.2 order, where `audience_blocked`
 * outranks both `member` and `invited`. Two rows come back looking
 * contradictory, and both are correct:
 *   - `{state:"member", eligible:false, reason:"audience_iu"}` — a Purdue
 *     student who joined before the officers narrowed the audience. Spec §3.5
 *     step 8: existing members stay. Render "Member", never "Not eligible".
 *   - `{state:"invited", eligible:false}` — somebody re-verified with the other
 *     university's address after being invited. The invite is void (§3.2 row 4
 *     puts audience ahead of invite, and accepting returns 403), so render
 *     "Invited" and leave the row disabled; do not offer to invite again.
 * So: branch on `state` first and only read `eligible`/`reason` on `state:
 * "none"`. Sorting or filtering on `eligible` alone mislabels current members.
 * `reason:"unverified"` is a third case the sibling POST answers as 404
 * `user_not_found` (it never confirms an account it will not invite); the grey
 * row exists so the officer sees why their friend cannot be added.
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const limitRes = await rateLimit(`org-invite-search:${user.id}`, LIMIT_SEARCH);
  if (!limitRes.allowed) {
    return tooManyRequests(limitRes, "Too many searches. Try again in a minute.");
  }

  const service = createSupabaseServiceClient();
  const gate = await requireInviteOfficer(service, slug, user.id);
  if ("response" in gate) return gate.response;
  const { org } = gate;
  const audience: OrgAudience = narrowInviteOrg(org).audience;

  const blockedReason: "org_hidden" | "org_unverified" | null = org.hidden_at
    ? "org_hidden"
    : INVITE_REQUIRES_VERIFIED_ORG && org.verified !== true
      ? "org_unverified"
      : null;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, Q_MAX);
  if (q.length < Q_MIN) {
    return NextResponse.json({
      ok: true,
      can_invite: blockedReason === null,
      blocked_reason: blockedReason,
      users: [],
    });
  }

  const prefixFilter = ilikePrefixOrFilter(["name", "handle"], q);
  const containsFilter = ilikeOrFilter(["name", "handle"], q);
  if (!prefixFilter || !containsFilter) {
    return NextResponse.json({
      ok: true,
      can_invite: blockedReason === null,
      blocked_reason: blockedReason,
      users: [],
    });
  }

  // Prefix matches first (better signal), then contains-anywhere — the same
  // two-phase ranking `users/search` uses, so typing a handle finds the person
  // who owns it before the people who merely contain it.
  const fetchLimit = MAX_RESULTS + FILTER_HEADROOM;
  const [prefixRes, containsRes] = await Promise.all([
    service
      .from("users")
      .select(CANDIDATE_COLUMNS)
      .neq("id", user.id)
      .eq("school_verified", true)
      .or(prefixFilter)
      .limit(fetchLimit),
    service
      .from("users")
      .select(CANDIDATE_COLUMNS)
      .neq("id", user.id)
      .eq("school_verified", true)
      .or(containsFilter)
      .limit(fetchLimit),
  ]);
  if (prefixRes.error || containsRes.error) {
    console.error("[orgs/[slug]/invite-candidates search]", prefixRes.error ?? containsRes.error);
    return fail(500, "request_failed", "Request failed");
  }

  const seen = new Set<string>();
  const candidates: CandidateRow[] = [];
  for (const list of [prefixRes.data ?? [], containsRes.data ?? []]) {
    for (const raw of list as unknown as CandidateRow[]) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      // Not a finished student account, or still carrying the trigger's
      // placeholder handle — these are the stranded rows, not people.
      if (!isDiscoverableAccount(raw) || isTriggerDefaultHandle(raw.handle)) continue;
      candidates.push(raw);
      if (candidates.length >= MAX_RESULTS) break;
    }
    if (candidates.length >= MAX_RESULTS) break;
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      can_invite: blockedReason === null,
      blocked_reason: blockedReason,
      users: [],
    });
  }

  const ids = candidates.map((c) => c.id);
  // Blocks are checked against BOTH the searching officer and the owner
  // (critic A7): the invite arrives under the org's name, so a second officer
  // must not be a way around a block on the first. The owner stays in this
  // list even when they are themselves a search hit — dropping them there
  // would quietly stop checking the owner for everybody else in the page.
  const orgSide = Array.from(new Set([user.id, org.owner_id].filter(isUuid)));

  // Stale invites become `expired` before anything is counted, so a row the
  // clock ended yesterday cannot show as "Invited" or eat a slot in the cap.
  await expireStaleInvites(service, { orgId: org.id });

  const windowStart = new Date(Date.now() - PAIR_INVITE_WINDOW_MS).toISOString();
  const [membersRes, invitesRes, requestsRes, theyBlockedRes, blockedThemRes] = await Promise.all([
    service.from("org_members").select("user_id, role").eq("org_id", org.id).in("user_id", ids),
    service
      .from("org_invites")
      .select("invitee_id, status, created_at, expires_at, resolved_at")
      .eq("org_id", org.id)
      .in("invitee_id", ids)
      .gte("created_at", windowStart),
    service
      .from("org_join_requests")
      .select("id, user_id")
      .eq("org_id", org.id)
      .in("user_id", ids)
      .eq("status", "pending"),
    orgSide.length > 0
      ? service.from("blocks").select("blocker_id").in("blocker_id", ids).in("blocked_id", orgSide)
      : Promise.resolve({ data: [] as Array<{ blocker_id: string }>, error: null }),
    orgSide.length > 0
      ? service.from("blocks").select("blocked_id").in("blocked_id", ids).in("blocker_id", orgSide)
      : Promise.resolve({ data: [] as Array<{ blocked_id: string }>, error: null }),
  ]);

  const readErr =
    membersRes.error ??
    invitesRes.error ??
    requestsRes.error ??
    theyBlockedRes.error ??
    blockedThemRes.error;
  if (readErr) {
    // FAIL CLOSED. If the blocks read failed we cannot tell who asked not to
    // hear from this org, and the picker's whole job is to produce a tap that
    // sends a notification. Say the request failed.
    console.error("[orgs/[slug]/invite-candidates standing]", readErr);
    return fail(500, "request_failed", "Request failed");
  }

  const blocked = new Set<string>();
  for (const row of (theyBlockedRes.data ?? []) as Array<{ blocker_id: string }>) {
    blocked.add(row.blocker_id);
  }
  for (const row of (blockedThemRes.data ?? []) as Array<{ blocked_id: string }>) {
    blocked.add(row.blocked_id);
  }

  const roleByUser = new Map<string, string>();
  for (const row of (membersRes.data ?? []) as Array<{ user_id: string; role: string }>) {
    roleByUser.set(row.user_id, row.role);
  }
  const requestByUser = new Map<string, string>();
  for (const row of (requestsRes.data ?? []) as Array<{ id: string; user_id: string }>) {
    requestByUser.set(row.user_id, row.id);
  }

  type InviteFact = {
    status: string;
    created_at: string;
    expires_at: string;
    resolved_at: string | null;
  };
  const invitesByUser = new Map<string, InviteFact[]>();
  for (const row of (invitesRes.data ?? []) as Array<InviteFact & { invitee_id: string }>) {
    const list = invitesByUser.get(row.invitee_id);
    if (list) list.push(row);
    else invitesByUser.set(row.invitee_id, [row]);
  }

  const now = new Date();
  const nowMs = now.getTime();

  const users = candidates
    .filter((c) => !blocked.has(c.id))
    .map((c) => {
      const system = isSchoolSystem(c.school_system) ? c.school_system : null;
      const eligible = audienceAllows(audience, system);
      const reason: IneligibleReason = eligible
        ? null
        : system === null
          ? "unverified"
          : audience === "purdue"
            ? "audience_purdue"
            : "audience_iu";

      const facts = invitesByUser.get(c.id) ?? [];
      let state: CandidateState = "none";
      let availableAt: string | null = null;
      let requestId: string | null = null;

      if (roleByUser.has(c.id)) {
        state = "member";
      } else if (facts.some((f) => f.status === "pending" && inviteIsLive(f, now))) {
        state = "invited";
      } else if (requestByUser.has(c.id)) {
        // Critic A11: the officer approves the REQUEST they filed; the invite
        // POST answers 409 `has_pending_request` for exactly this row. The id
        // goes out with it so the sheet's button can POST
        // /api/orgs/[slug]/requests/[id] {action:"approve"} — without it B25
        // would have to guess, or fall back to an invite that must not admit.
        state = "requested";
        requestId = requestByUser.get(c.id) ?? null;
      } else {
        const declinedAt = facts
          .filter((f) => f.status === "declined" && f.resolved_at)
          .map((f) => new Date(f.resolved_at as string).getTime())
          .filter((ms) => Number.isFinite(ms))
          .sort((a, b) => b - a)[0];
        const cooldownUntil =
          declinedAt === undefined ? null : declinedAt + DECLINE_COOLDOWN_MS;
        if (cooldownUntil !== null && cooldownUntil > nowMs) {
          state = "declined_recently";
          availableAt = new Date(cooldownUntil).toISOString();
        } else if (facts.length >= PAIR_INVITE_MAX) {
          const oldest = facts
            .map((f) => new Date(f.created_at).getTime())
            .filter((ms) => Number.isFinite(ms))
            .sort((a, b) => a - b)[0];
          state = "invite_cap_reached";
          availableAt =
            oldest === undefined ? null : new Date(oldest + PAIR_INVITE_WINDOW_MS).toISOString();
        }
      }

      return {
        id: c.id,
        name: c.name,
        handle: c.handle,
        avatar_url: c.avatar_url,
        major: c.major,
        year: c.year,
        state,
        eligible,
        reason,
        ...(availableAt ? { available_at: availableAt } : {}),
        ...(requestId ? { request_id: requestId } : {}),
      };
    });

  return NextResponse.json({
    ok: true,
    can_invite: blockedReason === null,
    blocked_reason: blockedReason,
    users,
  });
}
