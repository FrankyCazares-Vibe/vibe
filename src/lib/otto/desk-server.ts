import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadClubSetup } from "@/lib/club-links/setup";
import { parseCheckinStateRows, type CheckinStateRow } from "@/lib/events/event-checkin";
import { isSchoolSystem } from "@/lib/iu/campuses";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { loadVisibleOrgCards } from "@/lib/orgs/following";
import { OFFICER_ROLES, audienceAllows, canApproveRequest, isOrgAudience, type OrgRole } from "@/lib/orgs/join-state";
import { orgSideIds } from "@/lib/orgs/org-blocks";
import { ORG_REMOVALS_TABLE, isMissingRemovalsTable, removedIdSet } from "@/lib/orgs/removals";

import {
  DONE_DAYS,
  EARLIER_DAYS,
  buildDesk,
  chooseActingClub,
  type DeskClub,
  type DeskClubEvent,
  type DeskClubFacts,
  type DeskInput,
  type DeskModel,
  type DeskMyEvent,
} from "./desk";

/**
 * Otto's desk, the server half (Wave 2A): the reads behind `buildDesk`.
 * GET /api/me/otto passes in what it already read (notifications, followers,
 * unread DMs, reminders) and this adds the rest.
 *
 * WHICH CLIENT. The person's own client wherever the database already says
 * what they may see (their RSVPs and check-ins, the club's events and posts,
 * their drafts, the RSVP and check-in count functions, which give officers
 * exact numbers). The service role only where the club routes already use
 * it, for the clubs they run: the membership and join-request rows, the
 * requesters' school system (eligibility, never sent on), the member count
 * and when members joined (never who), and the setup list.
 *
 * Every read is scoped to the signed-in person or to a club the first read
 * proved they own or are an officer of. Only titles, counts and the
 * requester's name and handle leave the server.
 *
 * A failed read fails the whole desk (`ok: false`, the route names "desk" in
 * `failed`): a desk missing its join requests would say "nothing needs you"
 * while people wait. The check-in counts are the one exception, as on the
 * events list: none shown is honest.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_MAX = 50;
const REQUESTS_MAX = 50;
const EVENTS_MAX = 60;
const POSTS_MAX = 30;
const JOINS_MAX = 500;
const DRAFTS_MAX = 5;
const MINE_MAX = 30;

type Fail = { ok: false; where: string; error: unknown };
type Ok<T> = { ok: true; value: T };

/** A count from an RPC row as a whole number (event-item.ts's toCount, kept light here). */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Who among `ids` an officer removed from the club before (membership.ts's
 * loadRemovedUserIds, read here so this file doesn't pull in push sending).
 */
async function loadRemoved(service: SupabaseClient, orgId: string, ids: string[]): Promise<Ok<Set<string>> | Fail> {
  const res = await service.from(ORG_REMOVALS_TABLE).select("user_id").eq("org_id", orgId).in("user_id", ids);
  if (res.error) {
    if (isMissingRemovalsTable(res.error)) return { ok: true, value: new Set() };
    return fail("requests removals", res.error);
  }
  return { ok: true, value: removedIdSet(ids, res.data as Array<{ user_id?: unknown }>) };
}

function fail(where: string, error: unknown): Fail {
  console.error(`[otto desk ${where}]`, error);
  return { ok: false, where, error };
}

/** The route's own reads, handed in so nothing is read twice. */
export type DeskRouteFacts = Pick<DeskInput, "followers" | "unreadDms" | "reminders" | "notifications" | "missing">;

export type DeskLoadArgs = {
  /** The person's own client. */
  supabase: SupabaseClient;
  service: SupabaseClient;
  userId: string;
  /** People in a block pair with the person (their requests stay hidden, as on Club tools). */
  blocked: ReadonlySet<string>;
  /** `?club=`: a handle, "me" for the person's own desk, or null for the first club. */
  clubParam: string | null;
  route: DeskRouteFacts;
  now: Date;
};

type RunClub = DeskClub & { rawRole: OrgRole };

/** The clubs the person owns or is an officer of, owner rows first, then by name (clubs-you-run). */
async function loadClubsYouRun(service: SupabaseClient, userId: string): Promise<Ok<RunClub[]> | Fail> {
  const runRes = await service
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .limit(RUN_MAX);
  if (runRes.error) return fail("clubs", runRes.error);
  const rows = ((runRes.data ?? []) as { org_id: string; role: unknown }[]).filter(
    (r) => r.role === "owner" || r.role === "admin",
  );
  if (rows.length === 0) return { ok: true, value: [] };
  const cards = await loadVisibleOrgCards(service, rows.map((r) => r.org_id));
  if (!cards.ok) return fail("clubs cards", cards.error);
  const clubs = rows.flatMap((r): RunClub[] => {
    const org = cards.byId.get(r.org_id);
    if (!org) return [];
    const owner = r.role === "owner";
    return [
      {
        orgId: org.id,
        name: org.name,
        handle: org.handle,
        role: owner ? "owner" : "officer",
        avatarUrl: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
        rawRole: owner ? "owner" : "admin",
      },
    ];
  });
  clubs.sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
  return { ok: true, value: clubs };
}

/**
 * Which of `ids` somebody on the club side (owner or officer) blocked: the
 * approve route refuses them (409 approve_unavailable, org-blocks.ts
 * `blockedByOfficer`). Fails closed: on a read error every one counts as
 * blocked, so the desk offers Review, never an Accept it can't keep.
 */
async function loadBlockedByClub(service: SupabaseClient, orgId: string, ownerId: unknown, ids: string[]): Promise<Set<string>> {
  const all = new Set(ids.map((id) => id.toLowerCase()));
  const members = await service.from("org_members").select("user_id, role").eq("org_id", orgId).in("role", [...OFFICER_ROLES]);
  if (members.error) {
    console.error("[otto desk requests club side]", { code: members.error.code });
    return all;
  }
  const side = orgSideIds(ownerId, (members.data ?? []) as Array<{ user_id?: unknown; role?: unknown }>, "");
  if (side.length === 0) return new Set();
  const rows = await service.from("blocks").select("blocked_id").in("blocker_id", side).in("blocked_id", ids);
  if (rows.error) {
    console.error("[otto desk requests blocks]", { code: rows.error.code });
    return all;
  }
  return new Set(
    ((rows.data ?? []) as { blocked_id?: unknown }[])
      .map((r) => (typeof r.blocked_id === "string" ? r.blocked_id.toLowerCase() : ""))
      .filter(Boolean),
  );
}

/**
 * Which of `ids` the person's own client can read in `users`: a restricted
 * account's row doesn't come back (the moderation policy), so only these
 * names may link to a profile on the desk (polish 1, Nov 11). Fails closed:
 * on a read error nobody is linked; the row itself still shows.
 */
async function loadSeenByViewer(viewer: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const res = await viewer.from("users").select("id").in("id", ids);
  if (res.error) {
    console.error("[otto desk requests profiles]", { code: res.error.code });
    return new Set();
  }
  return new Set(
    ((res.data ?? []) as { id?: unknown }[])
      .map((r) => (typeof r.id === "string" ? r.id.toLowerCase() : ""))
      .filter(Boolean),
  );
}

/**
 * Pending join requests as Club tools > Join requests lists them: block
 * pairs left out, and Accept offered only where the approve route would say
 * yes today (school email verified, the club's "Open to" allows them, no
 * officer blocked them since, and this officer may let back someone removed
 * before).
 */
async function loadRequests(
  service: SupabaseClient,
  viewer: SupabaseClient,
  club: RunClub,
  org: { audience: unknown; owner_id: unknown },
  blocked: ReadonlySet<string>,
): Promise<Ok<DeskClubFacts["requests"]> | Fail> {
  const res = await service
    .from("org_join_requests")
    .select("id, user_id, requested_at, users:user_id(id, name, handle)")
    .eq("org_id", club.orgId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(REQUESTS_MAX);
  if (res.error) return fail("requests", res.error);
  type Row = { id: string; user_id: string; requested_at: string; users: { id: string; name: string | null; handle: string | null } | null };
  const rows = ((res.data ?? []) as unknown as Row[]).filter((r) => !blocked.has(r.user_id));
  if (rows.length === 0) return { ok: true, value: [] };

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [systemsRes, removedRes, blockedByClub, linkable] = await Promise.all([
    service.from("users").select("id, school_system").in("id", ids),
    loadRemoved(service, club.orgId, ids),
    loadBlockedByClub(service, club.orgId, org.owner_id, ids),
    loadSeenByViewer(viewer, ids),
  ]);
  if (systemsRes.error) return fail("requests systems", systemsRes.error);
  if (!removedRes.ok) return removedRes;
  const systems = new Map<string, "iu" | "purdue" | null>();
  for (const p of (systemsRes.data ?? []) as { id: string; school_system: unknown }[]) {
    systems.set(p.id, isSchoolSystem(p.school_system) ? p.school_system : null);
  }
  const audience = isOrgAudience(org.audience) ? org.audience : "both";
  return {
    ok: true,
    value: rows.map((r) => {
      const system = systems.get(r.user_id) ?? null;
      const removed = removedRes.value.has(r.user_id.toLowerCase());
      return {
        id: r.id,
        person: { id: r.user_id, name: r.users?.name ?? null, handle: r.users?.handle ?? null },
        requestedAt: r.requested_at,
        linkable: linkable.has(r.user_id.toLowerCase()),
        canAccept:
          system !== null &&
          audienceAllows(audience, system) &&
          !blockedByClub.has(r.user_id.toLowerCase()) &&
          canApproveRequest(club.rawRole, removed),
      };
    }),
  };
}

/**
 * The club's events with going/interested and check-in counts: the upcoming
 * ones (soonest first) and, separately, those that ended in the last 30 days
 * (newest first), so a busy past month never crowds out what's coming up.
 */
async function loadClubEvents(supabase: SupabaseClient, orgId: string, nowMs: number): Promise<Ok<DeskClubEvent[]> | Fail> {
  const since = new Date(nowMs - EARLIER_DAYS * DAY_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const COLS = "id, title, starts_at, ends_at, location, visibility, created_at";
  const [upRes, pastRes] = await Promise.all([
    supabase.from("events").select(COLS).eq("org_id", orgId).gte("ends_at", nowIso).order("starts_at", { ascending: true }).limit(EVENTS_MAX),
    supabase
      .from("events")
      .select(COLS)
      .eq("org_id", orgId)
      .gte("ends_at", since)
      .lt("ends_at", nowIso)
      .order("ends_at", { ascending: false })
      .limit(EVENTS_MAX),
  ]);
  if (upRes.error) return fail("events", upRes.error);
  if (pastRes.error) return fail("past events", pastRes.error);
  type Row = { id: string; title: string; starts_at: string; ends_at: string; location: string | null; visibility: string | null; created_at: string | null };
  const seen = new Set<string>();
  const rows = [...((upRes.data ?? []) as Row[]), ...((pastRes.data ?? []) as Row[])].filter((r) =>
    seen.has(r.id) ? false : (seen.add(r.id), true),
  );
  if (rows.length === 0) return { ok: true, value: [] };
  const ids = rows.map((r) => r.id);
  const [countsRes, checkinRes] = await Promise.all([
    supabase.rpc("event_rsvp_counts", { p_event_ids: ids }),
    supabase.rpc("event_checkin_state", { p_event_ids: ids }),
  ]);
  if (countsRes.error) return fail("events rsvp counts", countsRes.error);
  // As on the events list: no check-in shown is honest, a broken desk isn't.
  if (checkinRes.error) console.error("[otto desk checkin state]", { code: checkinRes.error.code });
  const checkins = checkinRes.error ? new Map<string, CheckinStateRow>() : parseCheckinStateRows(checkinRes.data);
  const going = new Map<string, number>();
  const maybe = new Map<string, number>();
  for (const raw of Array.isArray(countsRes.data) ? countsRes.data : []) {
    const r = raw as { event_id?: unknown; going_count?: unknown; maybe_count?: unknown };
    if (typeof r.event_id !== "string") continue;
    going.set(r.event_id, toCount(r.going_count));
    maybe.set(r.event_id, toCount(r.maybe_count));
  }
  return {
    ok: true,
    value: rows.map((r) => {
      const c = checkins.get(r.id);
      return {
        id: r.id,
        title: r.title,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        location: r.location ?? "",
        visibility: r.visibility,
        created_at: r.created_at,
        going_count: going.get(r.id) ?? 0,
        interested_count: maybe.get(r.id) ?? 0,
        checkin_open: c?.open === true,
        checked_in_count: c ? c.count : null,
      };
    }),
  };
}

/** Everything the desk shows about the club the officer is acting as. */
async function loadClubFacts(args: DeskLoadArgs, club: RunClub): Promise<Ok<DeskClubFacts> | Fail> {
  const { supabase, service, userId, blocked } = args;
  const nowMs = args.now.getTime();
  const since = new Date(nowMs - EARLIER_DAYS * DAY_MS).toISOString();

  const orgRes = await service
    .from("orgs")
    .select("id, owner_id, audience, logo_url, banner_url, description")
    .eq("id", club.orgId)
    .maybeSingle();
  if (orgRes.error || !orgRes.data) return fail("club", orgRes.error ?? "missing");
  const org = orgRes.data as { id: string; owner_id: unknown; audience: unknown; logo_url: string | null; banner_url: string | null; description: string | null };

  const [membersRes, joinsRes, requests, events, postsRes, draftsRes, setup] = await Promise.all([
    service.from("org_members").select("id", { count: "exact", head: true }).eq("org_id", club.orgId),
    service
      .from("org_members")
      .select("joined_at")
      .eq("org_id", club.orgId)
      .gte("joined_at", since)
      .order("joined_at", { ascending: false })
      .limit(JOINS_MAX),
    loadRequests(service, supabase, club, org, blocked),
    loadClubEvents(supabase, club.orgId, nowMs),
    supabase
      .from("posts")
      .select("id, content, created_at")
      .eq("org_id", club.orgId)
      .eq("status", "published")
      .is("removed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(POSTS_MAX),
    supabase
      .from("posts")
      .select("id, content, created_at")
      .eq("user_id", userId)
      .eq("status", "draft")
      .or(`org_id.is.null,org_id.eq.${club.orgId}`)
      .order("created_at", { ascending: false })
      .limit(DRAFTS_MAX),
    loadClubSetup(service, org),
  ]);
  if (membersRes.error) return fail("member count", membersRes.error);
  if (joinsRes.error) return fail("joins", joinsRes.error);
  if (!requests.ok) return requests;
  if (!events.ok) return events;
  if (postsRes.error) return fail("posts", postsRes.error);
  if (draftsRes.error) return fail("drafts", draftsRes.error);

  type PostRow = { id: string; content: string | null; created_at: string };
  const posts = ((postsRes.data ?? []) as PostRow[]).map((p) => ({ id: p.id, excerpt: p.content ?? "", createdAt: p.created_at }));
  return {
    ok: true,
    value: {
      memberCount: typeof membersRes.count === "number" ? membersRes.count : null,
      requests: requests.value,
      // loadClubSetup is null for a club with no setup list, and for a read it couldn't make.
      setup: setup ? setup.steps.map((s) => ({ id: s.id, done: s.done })) : null,
      drafts: ((draftsRes.data ?? []) as PostRow[]).map((d) => ({ id: d.id, excerpt: d.content ?? "", createdAt: d.created_at })),
      events: events.value,
      // Newest first; nothing in 30 days means no post after any event Up next asks about.
      latestPostAt: posts[0]?.createdAt ?? null,
      posts,
      joins: ((joinsRes.data ?? []) as { joined_at: string }[]).map((j) => j.joined_at),
    },
  };
}

type MyFacts = Pick<DeskInput, "going" | "checkedIn" | "rsvpsMade">;

/** A student's own events: Going in the next week, check-ins and RSVPs of the last 30 days. */
async function loadMyFacts(args: DeskLoadArgs): Promise<Ok<MyFacts> | Fail> {
  const { supabase, service, userId } = args;
  const nowMs = args.now.getTime();
  const nowIso = args.now.toISOString();
  const weekOut = new Date(nowMs + DONE_DAYS * DAY_MS).toISOString();
  const since = new Date(nowMs - EARLIER_DAYS * DAY_MS).toISOString();
  const EVENT = "event:events!inner(id,title,starts_at,ends_at,location,visibility,org_id)";

  const [goingRes, madeRes, mineRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select(`status,${EVENT}`)
      .eq("user_id", userId)
      .eq("status", "going")
      .gte("event.ends_at", nowIso)
      .lte("event.starts_at", weekOut)
      .order("event(starts_at)", { ascending: true })
      .limit(MINE_MAX),
    supabase
      .from("rsvps")
      .select(`status,created_at,${EVENT}`)
      .eq("user_id", userId)
      .in("status", ["going", "maybe"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MINE_MAX),
    supabase.rpc("event_checkin_mine"),
  ]);
  if (goingRes.error) return fail("going", goingRes.error);
  if (madeRes.error) return fail("rsvps made", madeRes.error);
  if (mineRes.error) return fail("check-ins", mineRes.error);

  type Ev = { id: string; title: string; starts_at: string; ends_at: string; location: string | null; visibility: string | null; org_id: string | null };
  type RsvpRow = { status: string; created_at?: string; event: Ev | null };
  const going = ((goingRes.data ?? []) as unknown as RsvpRow[]).filter((r) => r.event);
  const made = ((madeRes.data ?? []) as unknown as RsvpRow[]).filter((r) => r.event);

  // Club handles for links, from clubs everyone may see (a hidden club's event links to Events).
  const orgIds = [...going, ...made].map((r) => r.event?.org_id).filter((id): id is string => !!id);
  const cards = await loadVisibleOrgCards(service, orgIds);
  if (!cards.ok) return fail("rsvp clubs", cards.error);
  const toMine = (e: Ev): DeskMyEvent => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    location: e.location,
    visibility: e.visibility,
    orgHandle: e.org_id ? (cards.byId.get(e.org_id)?.handle ?? null) : null,
  });

  type MineRow = { event_id: string; title: string; starts_at: string; ends_at: string; org_handle: string | null };
  const sinceMs = Date.parse(since);
  const mineRows = ((Array.isArray(mineRes.data) ? mineRes.data : []) as MineRow[])
    .filter((r) => Date.parse(r.starts_at) >= sinceMs - DAY_MS)
    .slice(0, MINE_MAX);
  // event_checkin_mine names every club, hidden ones too: link only to clubs
  // everyone may see, as the RSVP rows do (a failed read links to Events).
  const mineHandles = [...new Set(mineRows.map((r) => r.org_handle).filter((h): h is string => !!h))];
  const shownHandles = new Set<string>();
  if (mineHandles.length > 0) {
    const vis = await service.from("orgs").select("handle").in("handle", mineHandles).is("hidden_at", null);
    if (vis.error) console.error("[otto desk check-in clubs]", { code: vis.error.code });
    for (const o of (vis.error ? [] : (vis.data ?? [])) as { handle?: unknown }[]) {
      if (typeof o.handle === "string") shownHandles.add(o.handle);
    }
  }
  const checkedIn = mineRows.map((r) => ({
    id: r.event_id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    orgHandle: r.org_handle && shownHandles.has(r.org_handle) ? r.org_handle : null,
  }));

  return {
    ok: true,
    value: {
      going: going.map((r) => toMine(r.event as Ev)),
      checkedIn,
      rsvpsMade: made.map((r) => ({
        ...toMine(r.event as Ev),
        rsvpAt: r.created_at ?? "",
        status: r.status === "maybe" ? ("maybe" as const) : ("going" as const),
      })),
    },
  };
}

/**
 * The whole desk for the signed-in person. An officer acts as the club `?club=`
 * names (or their first club); "me", or nobody who runs a club, gets the
 * student desk with their clubs still listed for the Acting as switch.
 */
export async function loadDesk(args: DeskLoadArgs): Promise<{ ok: true; desk: DeskModel } | { ok: false }> {
  const clubsRes = await loadClubsYouRun(args.service, args.userId);
  if (!clubsRes.ok) return { ok: false };
  const runClubs = clubsRes.value;
  const clubs: DeskClub[] = runClubs.map(({ rawRole: _r, ...c }) => {
    void _r;
    return c;
  });
  const chosen = chooseActingClub(clubs, args.clubParam);
  const acting = chosen ? (runClubs.find((c) => c.orgId === chosen.orgId) ?? null) : null;

  const empty: MyFacts = { going: [], checkedIn: [], rsvpsMade: [] };
  let club: DeskClubFacts | null = null;
  let mine = empty;
  if (acting) {
    const facts = await loadClubFacts(args, acting);
    if (!facts.ok) return { ok: false };
    club = facts.value;
  } else {
    const facts = await loadMyFacts(args);
    if (!facts.ok) return { ok: false };
    mine = facts.value;
  }

  const input: DeskInput = { clubs, actingAs: chosen, club, ...args.route, ...mine };
  return { ok: true, desk: buildDesk(input, args.now) };
}
