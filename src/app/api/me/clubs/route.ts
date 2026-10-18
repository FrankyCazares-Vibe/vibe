import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { encodeFollowCursor, loadVisibleOrgCards, PAGE_LIMIT_MAX } from "@/lib/orgs/following";
import { isOrgRole } from "@/lib/orgs/join-state";
import { compareProfileClubs, memberSinceMonth, storedClubTitle } from "@/lib/profile/club-flair";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type MemberRow = {
  org_id: string;
  role: unknown;
  title: unknown;
  show_title: unknown;
  show_on_profile: unknown;
  profile_rank: unknown;
  joined_at: unknown;
};
type FollowRow = { id: string; org_id: string; created_at: string };

const LIST_LIMIT = { limit: 60, windowSec: 60 };
/** Nobody is in this many clubs; the cap keeps the club read's URL short. */
const MEMBER_OF_MAX = 100;
/** One page of Following, the same size `/api/me/followed-orgs` pages by. */
const FOLLOWING_PAGE = PAGE_LIMIT_MAX;
/** Read whole, so no list of ids goes in the URL (review item 33). */
const MUTES_MAX = 500;
/** Muted clubs I neither follow nor belong to, newest mute first: one short list. */
const MUTED_ONLY_MAX = 50;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/me/clubs — the Clubs section of MY OWN profile (club model spec D
 * and E3; Franky's calls, Oct 16). Only ever the signed-in person's own rows.
 *
 *   - `member_of`: every club I'm in, with whether it shows on my profile
 *     (on by default), my order, my role, the title the officers gave me and
 *     whether I show it, the month I joined on Vibe and whether I muted its
 *     posts. Visitors see
 *     only the shown ones, through `/api/users/[handle]/bootstrap?clubs=1`.
 *   - `following`: clubs I follow but am not in, newest follow first. ONLY
 *     ME: no other route lists them. A club's owner and admins still see
 *     that I follow it, in their follower list.
 *   - `muted_only`: clubs whose posts I muted from the feed but neither
 *     follow nor belong to, newest mute first (up to 50), so the Unmute has a
 *     home besides the club's page (wave-2 repair, finding 7). Only me.
 *
 * Clubs Vibe hid (the test clubs among them) are left out of both lists:
 * a hidden club never shows on a profile, so there is nothing to manage.
 *
 * WHICH CLIENT. My memberships are a SERVICE read filtered to my id, the same
 * as `/api/me/followed-orgs`. My follow rows and my mutes are read with MY
 * client, and the `user_id` filter is not optional: `org_followers_select`
 * also returns the follower rows of every club I own or admin. Club cards are
 * service reads, because `orgs_select` hides a private club from a follower.
 *
 * PAGING. Following is the first page only. `following_next_cursor`, when
 * set, continues on `/api/me/followed-orgs?cursor=…` (same order, same
 * cursor); drop the rows there whose `member_role` is set.
 *
 * RESPONSES
 *   200 {ok, member_of:[{org_id, handle, name, logo_url, verified, role,
 *        title, show_title, since, show_on_profile, profile_rank, muted}],
 *        following:[{org_id, handle, name, logo_url, verified, followed_at,
 *        muted}], following_next_cursor, muted_only:[{org_id, handle, name,
 *        logo_url, verified, muted: true}]}
 *   401 unauthorized · 429 · 500 request_failed
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`me-clubs:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const service = createSupabaseServiceClient();
  const [membersRes, followsRes, mutesRes] = await Promise.all([
    service
      .from("org_members")
      .select("org_id, role, title, show_title, show_on_profile, profile_rank, joined_at")
      .eq("user_id", user.id)
      .limit(MEMBER_OF_MAX),
    supabase
      .from("org_followers")
      .select("id, org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(FOLLOWING_PAGE + 1),
    supabase
      .from("org_post_mutes")
      .select("org_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MUTES_MAX),
  ]);
  if (membersRes.error || followsRes.error || mutesRes.error) {
    console.error("[me/clubs read]", membersRes.error ?? followsRes.error ?? mutesRes.error);
    return fail(500, "request_failed", "Request failed");
  }

  const members = (membersRes.data ?? []) as MemberRow[];
  const memberIds = new Set(members.map((m) => m.org_id));
  const followRows = (followsRes.data ?? []) as FollowRow[];
  const page = followRows.slice(0, FOLLOWING_PAGE);
  const last = page[page.length - 1];
  const following_next_cursor =
    followRows.length > FOLLOWING_PAGE && last ? encodeFollowCursor(last.created_at, last.id) : null;
  const followOnly = page.filter((r) => !memberIds.has(r.org_id));
  const muteIds = ((mutesRes.data ?? []) as { org_id: string }[]).map((r) => r.org_id);
  const muted = new Set(muteIds);

  // Muted, and in neither list on screen: maybe followed past the first page,
  // so those follows are asked about by id (on MY client, my own rows).
  const pageIds = new Set(page.map((r) => r.org_id));
  const candidates = muteIds.filter((id) => !memberIds.has(id) && !pageIds.has(id)).slice(0, MUTED_ONLY_MAX);
  let mutedOnlyIds: string[] = [];
  if (candidates.length > 0) {
    const followedRes = await supabase
      .from("org_followers")
      .select("org_id")
      .eq("user_id", user.id)
      .in("org_id", candidates);
    if (followedRes.error) {
      console.error("[me/clubs muted follows]", followedRes.error);
      return fail(500, "request_failed", "Request failed");
    }
    const followed = new Set(((followedRes.data ?? []) as { org_id: string }[]).map((r) => r.org_id));
    mutedOnlyIds = candidates.filter((id) => !followed.has(id));
  }

  // Three card reads, so no id list in the URL grows past one list's cap.
  const [memberCards, followCards, mutedCards] = await Promise.all([
    loadVisibleOrgCards(service, [...memberIds]),
    loadVisibleOrgCards(service, followOnly.map((r) => r.org_id)),
    loadVisibleOrgCards(service, mutedOnlyIds),
  ]);
  if (!memberCards.ok || !followCards.ok || !mutedCards.ok) {
    return fail(500, "request_failed", "Request failed");
  }

  const member_of = members
    .flatMap((m) => {
      const org = memberCards.byId.get(m.org_id);
      if (!org || !isOrgRole(m.role)) return [];
      return [{ m, org, role: m.role }];
    })
    .sort((a, b) =>
      compareProfileClubs(
        { profile_rank: a.m.profile_rank, joined_at: a.m.joined_at, name: a.org.name },
        { profile_rank: b.m.profile_rank, joined_at: b.m.joined_at, name: b.org.name },
      ),
    )
    .map(({ m, org, role }) => ({
      org_id: org.id,
      handle: org.handle,
      name: org.name,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      verified: org.verified,
      role,
      title: storedClubTitle(m.title),
      show_title: m.show_title !== false,
      since: memberSinceMonth(m.joined_at),
      show_on_profile: m.show_on_profile !== false,
      profile_rank: typeof m.profile_rank === "number" ? m.profile_rank : null,
      muted: muted.has(org.id),
    }));

  const following = followOnly.flatMap((r) => {
    const org = followCards.byId.get(r.org_id);
    if (!org) return [];
    return [
      {
        org_id: org.id,
        handle: org.handle,
        name: org.name,
        logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
        verified: org.verified,
        followed_at: r.created_at,
        muted: muted.has(org.id),
      },
    ];
  });

  const muted_only = mutedOnlyIds.flatMap((id) => {
    const org = mutedCards.byId.get(id);
    if (!org) return [];
    return [
      {
        org_id: org.id,
        handle: org.handle,
        name: org.name,
        logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
        verified: org.verified,
        muted: true,
      },
    ];
  });

  return NextResponse.json({ ok: true, member_of, following, following_next_cursor, muted_only });
}
