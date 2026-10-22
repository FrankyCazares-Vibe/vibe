import { NextResponse } from "next/server";

import { hydrateUserCards } from "@/lib/connections/queries";
import { isSchoolSystem } from "@/lib/iu/campuses";
import { isDiscoverableAccount } from "@/lib/iu/community-scope";
import { followerInvite, type FollowerInvite, type InviteFact } from "@/lib/orgs/follower-invite";
import {
  canSeeFollowers,
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
  isFollowSource,
  loadFollowerCount,
  loadOrgRole,
  parsePageLimit,
} from "@/lib/orgs/following";
import {
  canInvite,
  isOrgAudience,
  isOrgRole,
  type OrgAudience,
  type OrgRole,
} from "@/lib/orgs/join-state";
import { loadRemovedUserIds } from "@/lib/orgs/membership";
import { inviteRefusedIds, loadOrgSideIds } from "@/lib/orgs/org-blocks";
import { isUuid } from "@/lib/pgrest";
import { isTriggerDefaultHandle } from "@/lib/profile/onboarding-prefill";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  INVITE_REQUIRES_VERIFIED_ORG,
  PAIR_INVITE_MAX,
  PAIR_INVITE_WINDOW_MS,
} from "../invites/route";

type Params = { params: Promise<{ slug: string }> };

type FollowerRow = {
  id: string;
  user_id: string;
  source: string;
  first_followed_at: string;
};

/** A paging officer, not a scraper. */
const LIST_LIMIT = { limit: 60, windowSec: 60 };

/** The error shape every org route speaks (`join/route.ts`). */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

type InviteAccountRow = {
  id: string;
  handle: string | null;
  school_system: unknown;
  school_verified: boolean | null;
  otto_answers: unknown;
};

type BlockRow = { blocker_id: string; blocked_id: string };

/**
 * Where each non-member on this page stands for an invite (Oct 22, 2026;
 * handoffs/2026-10-22-club-tools-arc/PLAN.md B3), by user id, or null when
 * any read failed. The same reads `invite-candidates`' `loadStandings` makes,
 * for the same reason each one is there: their accounts (school, finished
 * sign-up), this club's invites to them inside the pair window, their
 * pending requests, the blocks the invite POST refuses (ruling 14:
 * `inviteRefusedIds` over the officer's side), and who of the requesters an
 * officer removed before. `followerInvite` turns them into the row.
 *
 * FAILS CLOSED, BUT ONLY FOR THE BUTTONS. Without the blocks read we can't
 * tell who must not be offered an invite, so a failed read gives every row
 * `invite: null` (no button) and says so once; the list itself still loads.
 * No `expireStaleInvites` (the sheet's followers mode skips it too):
 * `inviteIsLive` reads the clock, so opening the screen stays a write-free GET.
 */
async function loadFollowerInvites(
  service: ServiceClient,
  org: { id: string; owner_id: string | null },
  viewerId: string,
  audience: OrgAudience,
  role: OrgRole,
  ids: string[],
): Promise<Map<string, FollowerInvite> | null> {
  const out = new Map<string, FollowerInvite>();
  if (ids.length === 0) return out;
  try {
    const windowStart = new Date(Date.now() - PAIR_INVITE_WINDOW_MS).toISOString();
    const [accountsRes, invitesRes, requestsRes, theyBlockedRes, officers] = await Promise.all([
      service
        .from("users")
        .select("id, handle, school_system, school_verified, otto_answers")
        .in("id", ids),
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
      service.from("blocks").select("blocker_id, blocked_id").in("blocker_id", ids).eq("blocked_id", viewerId),
      loadOrgSideIds(service, org.id, viewerId),
    ]);
    const firstErr = accountsRes.error ?? invitesRes.error ?? requestsRes.error ?? theyBlockedRes.error;
    if (firstErr || !officers.ok) {
      console.error("[orgs/[slug]/followers invite standing]", firstErr ?? (officers.ok ? null : officers.error));
      return null;
    }

    // The sender, the owner and every officer: the people whose block of a
    // follower refuses an invite (ruling 14), as invite-candidates builds it.
    const blockerSide = Array.from(new Set([viewerId, org.owner_id, ...officers.ids].filter(isUuid)));
    const requestByUser = new Map<string, string>();
    for (const r of (requestsRes.data ?? []) as Array<{ id: string; user_id: string }>) {
      requestByUser.set(r.user_id, r.id);
    }
    const [blockedThemRes, removedRes] = await Promise.all([
      service.from("blocks").select("blocker_id, blocked_id").in("blocked_id", ids).in("blocker_id", blockerSide),
      loadRemovedUserIds(service, org.id, Array.from(requestByUser.keys())),
    ]);
    if (blockedThemRes.error || !removedRes.ok) {
      console.error(
        "[orgs/[slug]/followers invite blocks]",
        blockedThemRes.error ?? (removedRes.ok ? null : removedRes.error),
      );
      return null;
    }
    const refused = inviteRefusedIds(viewerId, blockerSide, [
      ...((theyBlockedRes.data ?? []) as BlockRow[]),
      ...((blockedThemRes.data ?? []) as BlockRow[]),
    ]);

    const invitesByUser = new Map<string, InviteFact[]>();
    for (const row of (invitesRes.data ?? []) as Array<InviteFact & { invitee_id: string }>) {
      invitesByUser.set(row.invitee_id, [...(invitesByUser.get(row.invitee_id) ?? []), row]);
    }

    const now = new Date();
    for (const a of (accountsRes.data ?? []) as unknown as InviteAccountRow[]) {
      const id = a.id.toLowerCase();
      out.set(
        a.id,
        followerInvite(
          {
            verified: a.school_verified === true,
            system: isSchoolSystem(a.school_system) ? a.school_system : null,
            finished: isDiscoverableAccount(a) && !isTriggerDefaultHandle(a.handle),
            refused: refused.has(id),
            invites: invitesByUser.get(a.id) ?? [],
            requestId: requestByUser.get(a.id) ?? null,
            removedBefore: removedRes.ids.has(id),
          },
          { audience, role, now, pairMax: PAIR_INVITE_MAX, pairWindowMs: PAIR_INVITE_WINDOW_MS },
        ),
      );
    }
    return out;
  } catch (e) {
    console.error("[orgs/[slug]/followers invite standing]", e);
    return null;
  }
}

/**
 * GET /api/orgs/[slug]/followers?limit=&cursor= — who follows this club, for
 * its owner and admins only (wave plan §4.2, batch F1). Students are told
 * officers can see this next to Follow on request and invite-only clubs.
 *
 * WHO: `canSeeFollowers` (owner, admin), the same roles as the
 * `org_followers_select` policy. A member gets 403. A hidden club is 404 to anyone
 * who isn't a member.
 *
 * WHICH CLIENT: the org, the list, the roles and the count are all SERVICE
 * reads (the COUNTS RULE in migration `20260916120000`). The user client is
 * used for the session, for blocks and mutes, and for the person cards.
 *
 * BLOCKS FAIL CLOSED (critic C3). Anyone with a block either way, or muted by
 * the officer, is dropped in the query, before the limit, so a page is never
 * short for it. If the block read fails the whole list is a 500: a list that
 * quietly shows a blocked person is worse than no list.
 *
 * ORDER: `first_followed_at desc, id desc`, cursor on both (critic C5).
 * Never `created_at`, which an unfollow/refollow can re-roll to the top.
 *
 * `follower_count` is the RAW number (officers see small counts) and null
 * when the count read failed. It includes blocked followers; the list doesn't.
 *
 * INVITE STATE (Oct 22, 2026; PLAN.md B3). Club tools > Followers offers
 * Invite on each row that isn't a member, with the same states as the
 * "Invite people" sheet, so each non-member row carries `invite` (see
 * `loadFollowerInvites` and src/lib/orgs/follower-invite.ts). `can_invite`
 * and `blocked_reason` are the sheet's two top-level fields, read the same
 * way: false with `org_hidden` / `org_unverified` means every Invite would
 * 409, so the screen says so once and draws none. Those reads are skipped
 * then, and when this officer may see followers but not invite (`canInvite`;
 * the same roles today). `invite_read_failed: true` means the standings
 * couldn't be read: every `invite` is null and the screen draws no Invite,
 * but the list is still the list. Members always carry `invite: null`.
 *
 * RESPONSES
 *   200 {ok, followers:[{…UserCard, follows_since, org_follow_source,
 *        member_role, invite:{state, eligible, reason, available_at,
 *        request_id, removed_before, can_approve}|null}], next_cursor,
 *        follower_count, can_invite, blocked_reason, invite_read_failed}
 *   400 invalid_cursor · 401 unauthorized · 403 officers_only ·
 *   404 not_found · 429 · 500 request_failed
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`org-followers:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, hidden_at, verified, owner_id, audience")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug]/followers load org]", orgErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (!orgRow) return fail(404, "not_found", "Not found");
  const org = orgRow as {
    id: string;
    handle: string;
    hidden_at: string | null;
    verified: boolean | null;
    owner_id: string | null;
    audience: unknown;
  };

  const roleRes = await loadOrgRole(service, org.id, user.id);
  if (!roleRes.ok) return fail(500, "request_failed", "Request failed");
  if (org.hidden_at && !roleRes.role) return fail(404, "not_found", "Not found");
  if (!canSeeFollowers(roleRes.role)) {
    return fail(403, "officers_only", "Only owners and admins can see who follows this club.");
  }

  // Who may be invited from this screen: the sheet's org-level gate, word for
  // word (invite-candidates GET), then this officer's own permission.
  const role = roleRes.role as OrgRole;
  const blocked_reason: "org_hidden" | "org_unverified" | null = org.hidden_at
    ? "org_hidden"
    : INVITE_REQUIRES_VERIFIED_ORG && org.verified !== true
      ? "org_unverified"
      : null;
  const mayInvite = canInvite(role) && blocked_reason === null;
  const audience: OrgAudience = isOrgAudience(org.audience) ? org.audience : "both";

  const url = new URL(req.url);
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return fail(400, "invalid_cursor", "Invalid cursor");

  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[orgs/[slug]/followers hidden users]", hiddenRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const hiddenIds = hiddenRes.hidden.ids;

  let query = service
    .from("org_followers")
    .select("id, user_id, source, first_followed_at")
    .eq("org_id", org.id);
  if (hiddenIds.length > 0) query = query.notIn("user_id", hiddenIds);
  if (decoded.cursor) {
    query = query.or(followKeysetOrFilter("first_followed_at", decoded.cursor));
  }
  const { data: rowsData, error: rowsErr } = await query
    .order("first_followed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (rowsErr) {
    console.error("[orgs/[slug]/followers list]", rowsErr);
    return fail(500, "request_failed", "Request failed");
  }

  const rows = (rowsData ?? []) as FollowerRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor =
    rows.length > limit && last ? encodeFollowCursor(last.first_followed_at, last.id) : null;
  const pageUserIds = page.map((r) => r.user_id);

  // The invite standings run beside the cards and roles, over the whole
  // page: a member's answer is simply never used, and it saves a round trip.
  const [cards, membersRes, follower_count, invites] = await Promise.all([
    hydrateUserCards(supabase, user.id, pageUserIds),
    pageUserIds.length === 0
      ? Promise.resolve({ data: [] as { user_id: string; role: string }[], error: null })
      : service
          .from("org_members")
          .select("user_id, role")
          .eq("org_id", org.id)
          .in("user_id", pageUserIds),
    loadFollowerCount(service, org.id),
    mayInvite
      ? loadFollowerInvites(service, org, user.id, audience, role, pageUserIds)
      : Promise.resolve(new Map<string, FollowerInvite>()),
  ]);
  if (membersRes.error) {
    console.error("[orgs/[slug]/followers members]", membersRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  // The hydrator swallows its own read errors and drops what it couldn't
  // load, so a short result is a failed read, not a shorter page.
  if (cards.length !== pageUserIds.length) {
    console.error("[orgs/[slug]/followers cards]", {
      expected: pageUserIds.length,
      got: cards.length,
    });
    return fail(500, "request_failed", "Request failed");
  }

  const roleByUser = new Map<string, OrgRole>();
  for (const m of (membersRes.data ?? []) as { user_id: string; role: unknown }[]) {
    if (isOrgRole(m.role)) roleByUser.set(m.user_id, m.role);
  }
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const followers = page.flatMap((row) => {
    const card = cardById.get(row.user_id);
    if (!card) return [];
    return [
      {
        ...card,
        follows_since: row.first_followed_at,
        org_follow_source: isFollowSource(row.source) ? row.source : null,
        member_role: roleByUser.get(row.user_id) ?? null,
        invite: roleByUser.has(row.user_id) ? null : (invites?.get(row.user_id) ?? null),
      },
    ];
  });

  return NextResponse.json({
    ok: true,
    followers,
    next_cursor,
    follower_count,
    can_invite: mayInvite,
    blocked_reason,
    invite_read_failed: mayInvite && invites === null,
  });
}
