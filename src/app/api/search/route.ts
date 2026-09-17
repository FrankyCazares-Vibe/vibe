import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { DISCOVERABLE_USER_COLUMNS, isDiscoverableAccount } from "@/lib/iu/community-scope";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";
import { ilikeOrFilter, ilikePrefixOrFilter } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
/**
 * Cap on the campus org-id list fed into `org_id=in.(…)`. Every uuid costs
 * ~37 characters of URL and PostgREST takes the whole query in the URL, so
 * `/api/events`' 1000 would be a ~37 KB request line that no proxy accepts —
 * the search would fail outright rather than degrade. At the cap, events on
 * the orgs past it are missed; a campus would need 200 clubs to reach it
 * (live: 5 orgs in total), and B8 owns the matching constant in
 * `/api/events`.
 */
const MAX_CAMPUS_ORGS = 200;
/**
 * Extra user rows to pull so the stranded/unfinished accounts dropped below
 * don't eat into the page the caller asked for (same reasoning and value as
 * `/api/users/search`). Small on purpose: the filter removes a handful of
 * rows, not a proportion of the table.
 */
const FILTER_HEADROOM = 10;

/**
 * Unified typeahead search across people, orgs, and events. Powers the
 * profile + campus search bars so a single dropdown can surface every
 * kind of entity Vibe knows about.
 *
 * - Auth required.
 * - `kinds=` optional CSV; defaults to "users,orgs,events". Lets a caller
 *   restrict the fan-out (e.g. mention pickers).
 * - Each kind capped at `limit` (default 6) so the dropdown stays short.
 * - People and orgs are GLOBAL (plan §2.4, Franky's Q2: profiles, people
 *   search, follows and DMs stay open across both universities).
 * - What people search DOES drop is accounts that aren't real people yet:
 *   unverified, not-onboarded, or still carrying the `u<32hex>` handle the
 *   signup trigger hands out (plan §2.7 line 149, "filter out of suggestions
 *   and search; don't delete" — 5 such rows live today, and typing a single
 *   "u" filled this dropdown with them). Same test and same helper as
 *   `/api/users/search` and the people rail, so the three discovery surfaces
 *   can't disagree about who exists. `otto_answers` is a private column, so
 *   the test runs through the service role on the ids this query already
 *   found — never as a way to widen the search — and none of those columns
 *   are echoed back.
 * - Events are scoped to the viewer's campus via the ORG's `campus_id`
 *   (plan wave 2 B10, §2.6) rather than the event creator's legacy school
 *   label: an event belongs to the org that runs it, so a club officer who
 *   moves campus doesn't drag the club's events with them. Events with no
 *   org — and orgs with no campus, which is every live org until M1b —
 *   therefore match no campus and don't appear (plan §2.8 row 4). Past events
 *   are excluded. Search always uses the viewer's HOME campus; there is no
 *   `?campus=` switch on a typeahead.
 * - Orgs returned via service role so private orgs the viewer isn't a
 *   member of still surface (matches /api/orgs?filter=discover).
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const kindsParam = (url.searchParams.get("kinds") || "users,orgs,events")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wantUsers = kindsParam.includes("users");
  const wantOrgs = kindsParam.includes("orgs");
  const wantEvents = kindsParam.includes("events");

  if (q.length < 1) {
    return NextResponse.json({ ok: true, users: [], orgs: [], events: [] });
  }

  // Strip PostgREST filter syntax + LIKE wildcards and quote the value so
  // user text can never extend the `or=` expression onto other columns.
  // The orgs branch runs on the service client, so this matters doubly.
  const usersPrefix = ilikePrefixOrFilter(["name", "handle"], q);
  const usersContains = ilikeOrFilter(["name", "handle"], q);
  const orgsContains = ilikeOrFilter(["handle", "name"], q);
  const eventsContains = ilikeOrFilter(["title", "description"], q);
  if (!usersPrefix || !usersContains || !orgsContains || !eventsContains) {
    return NextResponse.json({ ok: true, users: [], orgs: [], events: [] });
  }

  const service = createSupabaseServiceClient();

  /**
   * Events, campus-scoped through their org. Two reads have to land before
   * the event query can be built (the viewer's campus, then that campus's org
   * ids), so this branch is its own chain and still runs beside the others.
   *
   * ORG IDS COME FROM THE SERVICE ROLE ON PURPOSE, exactly as `/api/events`
   * resolves them: `orgs` RLS hides a private org from non-members, so an
   * `!inner` join under the viewer's own client would drop every private
   * org's events from search — 6 of the 9 live events, including the only
   * upcoming one. Just the ids leave that query. The events themselves are
   * still read under the viewer's RLS, and the org embed stays a plain (outer)
   * join, so a private org's name and logo are still withheld exactly as they
   * are today.
   *
   * A null id list means "don't filter": a pre-M1 database, or a read that
   * failed. That is the same widest answer those cases give today, and campus
   * scope is relevance, not secrecy (plan §2.4).
   *
   * COST, MEASURED AND ACCEPTED. This branch is 3 serial round trips where the
   * old label version was 1 (it fetched `limit` events and compared the
   * creator's label in JS afterwards). The alternatives were weighed and both
   * are worse: filtering after the fact would silently return fewer than
   * `limit` events for the viewer's campus whenever other campuses fill the
   * page, and resolving org ids in parallel with the viewer read means
   * fetching every org on Vibe on every keystroke. The other branches still
   * run beside this one, and `kinds=users,orgs` (the phone overlay) skips it
   * entirely.
   */
  const searchEvents = async () => {
    let orgIds: string[] | null = null;
    const { data: me, error: meErr } = await supabase
      .from("users")
      .select("campus_id,school_system")
      .eq("id", user.id)
      .maybeSingle();
    if (meErr) {
      if (!isMissingColumnError(meErr)) console.error("[search viewer]", meErr);
    } else {
      const scope = resolveCampusRequest(null, scopeViewerFromRow(me as Record<string, unknown>));
      if (scope.kind !== "forbidden") {
        const { data: campusOrgs, error: orgErr } = await service
          .from("orgs")
          .select("id")
          .in("campus_id", scopeCampusIds(scope))
          .limit(MAX_CAMPUS_ORGS);
        if (orgErr) {
          if (!isMissingColumnError(orgErr)) console.error("[search campus orgs]", orgErr);
        } else {
          orgIds = (campusOrgs ?? []).map((o) => (o as { id: string }).id);
        }
      }
    }
    // No org on this campus yet (true for every campus until M1b): no event
    // can be on it either, so don't ask.
    if (orgIds && orgIds.length === 0) {
      return { data: [], error: null } as const;
    }
    let eventsQuery = supabase
      .from("events")
      .select(
        "id,title,description,starts_at,ends_at,location," +
          "org:orgs(id,handle,name,logo_url,verified)",
      )
      .gte("ends_at", new Date().toISOString())
      .or(eventsContains)
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (orgIds) eventsQuery = eventsQuery.in("org_id", orgIds);
    return await eventsQuery;
  };

  // Fan out everything in parallel. Each branch is independently typed so
  // a failure in one doesn't poison the others. The two people queries pull
  // `limit + FILTER_HEADROOM` because the discoverable filter below removes
  // rows; `school_verified` is filtered here because it's cheap and granted,
  // while the rest of that test needs a private column.
  const fetchLimit = limit + FILTER_HEADROOM;
  const [usersPrefixRes, usersContainsRes, orgsRes, eventsRes, blockRowsRes] = await Promise.all([
    wantUsers
      ? supabase
          .from("users")
          .select("id,name,handle,school,major,year,avatar_url")
          .neq("id", user.id)
          .eq("school_verified", true)
          .or(usersPrefix)
          .limit(fetchLimit)
      : Promise.resolve({ data: [], error: null } as const),
    wantUsers
      ? supabase
          .from("users")
          .select("id,name,handle,school,major,year,avatar_url")
          .neq("id", user.id)
          .eq("school_verified", true)
          .or(usersContains)
          .limit(fetchLimit)
      : Promise.resolve({ data: [], error: null } as const),
    wantOrgs
      ? service
          .from("orgs")
          .select(
            "id,handle,name,description,logo_url,banner_url,is_public,verified,join_policy,audience,members:org_members(count)",
          )
          // The service client sees hidden clubs; search must not.
          .is("hidden_at", null)
          .or(orgsContains)
          .order("verified", { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [], error: null } as const),
    wantEvents ? searchEvents() : Promise.resolve({ data: [], error: null } as const),
    wantUsers
      ? supabase
          .from("blocks")
          .select("blocker_id, blocked_id")
          .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  // ── USERS ──────────────────────────────────────────────────────────
  type UserRow = {
    id: string;
    name: string | null;
    handle: string | null;
    school: string | null;
    major: string | null;
    year: string | null;
    avatar_url: string | null;
    rel?: string;
  };
  const users: UserRow[] = [];
  if (wantUsers) {
    // Merge prefix-then-contains, de-duplicated, WITHOUT capping at `limit`
    // yet: the discoverable filter below removes rows, and capping first would
    // let one stranded account cost a real person their slot.
    const seen = new Set<string>();
    const candidates: UserRow[] = [];
    for (const list of [
      (usersPrefixRes.data ?? []) as UserRow[],
      (usersContainsRes.data ?? []) as UserRow[],
    ]) {
      for (const u of list) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        candidates.push(u);
      }
    }

    // Filter out blocked-either-way users.
    const blockRows = (blockRowsRes.data ?? []) as Array<{
      blocker_id: string;
      blocked_id: string;
    }>;
    const hidden = new Set<string>();
    for (const b of blockRows) {
      if (b.blocker_id === user.id) hidden.add(b.blocked_id);
      else if (b.blocked_id === user.id) hidden.add(b.blocker_id);
    }
    const visible = candidates.filter((u) => !hidden.has(u.id));

    if (visible.length > 0) {
      // One round trip for all three follow-ups: who is a finished person
      // (service role — `otto_answers` has no `authenticated` grant), and the
      // viewer's relationship state. The relationship reads run on the
      // pre-filter ids, which is a superset, so they don't have to wait.
      const ids = visible.map((u) => u.id);
      const [statusRes, outRes, inRes] = await Promise.all([
        service.from("users").select(DISCOVERABLE_USER_COLUMNS).in("id", ids),
        supabase
          .from("connections")
          .select("following_id")
          .eq("follower_id", user.id)
          .in("following_id", ids),
        supabase
          .from("connections")
          .select("follower_id")
          .eq("following_id", user.id)
          .in("follower_id", ids),
      ]);
      if (statusRes.error) {
        // We can't tell the stranded accounts from the real ones, so show
        // nobody rather than show them. Orgs and events still answer.
        console.error("[search discoverable]", statusRes.error);
      } else {
        const discoverable = new Set<string>();
        for (const row of statusRes.data ?? []) {
          if (isDiscoverableAccount(row)) discoverable.add((row as { id: string }).id);
        }
        const outgoing = new Set((outRes.data ?? []).map((r) => r.following_id as string));
        const incoming = new Set((inRes.data ?? []).map((r) => r.follower_id as string));
        for (const u of visible) {
          if (!discoverable.has(u.id)) continue;
          const a = outgoing.has(u.id);
          const b = incoming.has(u.id);
          u.rel = a && b ? "connected" : a ? "following" : b ? "followed_by" : "none";
          users.push(u);
          if (users.length >= limit) break;
        }
      }
    }
  }

  // ── ORGS ───────────────────────────────────────────────────────────
  type OrgRow = {
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    banner_url: string | null;
    is_public: boolean;
    verified: boolean;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    members?: Array<{ count: number }> | null;
  };
  const orgsOut: Array<{
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    banner_url: string | null;
    is_public: boolean;
    verified: boolean;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    member_count: number;
  }> = [];
  if (wantOrgs) {
    const orgRows = (orgsRes.data ?? []) as unknown as OrgRow[];
    for (const o of orgRows) {
      orgsOut.push({
        id: o.id,
        handle: o.handle,
        name: o.name,
        description: o.description,
        logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
        banner_url: orgAssetProxyUrl(o.handle, o.banner_url, "banner"),
        is_public: o.is_public,
        verified: o.verified,
        join_policy: o.join_policy,
        audience: o.audience,
        member_count: o.members?.[0]?.count ?? 0,
      });
    }
  }

  // ── EVENTS ─────────────────────────────────────────────────────────
  type EventRow = {
    id: string;
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org: {
      id: string;
      handle: string;
      name: string;
      logo_url: string | null;
      verified: boolean;
    } | null;
  };
  const eventsOut: Array<{
    id: string;
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    location: string;
    org: {
      id: string;
      handle: string;
      name: string;
      logo_url: string | null;
      verified: boolean;
    } | null;
  }> = [];
  if (wantEvents) {
    const rows = (eventsRes.data ?? []) as unknown as EventRow[];
    for (const r of rows) {
      // The campus filter ran in the query (`org_id in (campus org ids)`), so
      // every row here is already on a campus in scope.
      eventsOut.push({
        id: r.id,
        title: r.title,
        description: r.description,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        location: r.location,
        org: r.org
          ? {
              id: r.org.id,
              handle: r.org.handle,
              name: r.org.name,
              logo_url: orgAssetProxyUrl(r.org.handle, r.org.logo_url, "logo"),
              verified: r.org.verified,
            }
          : null,
      });
      if (eventsOut.length >= limit) break;
    }
  }

  return NextResponse.json({ ok: true, users, orgs: orgsOut, events: eventsOut });
}
