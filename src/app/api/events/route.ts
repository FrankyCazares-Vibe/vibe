import { NextResponse } from "next/server";

import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { ALL_CAMPUSES, isSchoolSystem, legacyLabel, type SchoolSystem } from "@/lib/iu/campuses";
import { campusScopeError, homeCampusIdFor } from "@/lib/iu/community-scope";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const WINDOW_DAYS = 60;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_LOCATION = 200;
// Safety cap on the campus org-id list we feed into `org_id in (...)`.
// Far above the real club count on any IU campus.
const MAX_CAMPUS_ORGS = 1000;
// Its own cap, because it guards a different thing: the hidden-org list is a
// SAFETY filter, and a silent truncation there would start listing hidden
// orgs' events. Four rows today. The two caps move independently on purpose.
const MAX_HIDDEN_ORGS = 1000;

type EventRow = {
  id: string;
  org_id: string | null;
  creator_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  created_at: string;
  creator: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
    school: string | null;
    campus_id: string | null;
  } | null;
};

/** Org attribution, resolved with the service role (see the GET docblock). */
type OrgCard = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
};

type CreateEventBody = {
  title?: unknown;
  description?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  location?: unknown;
  org_id?: unknown;
};

/** The error shape the org routes speak; events now carry a `code` too. */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/** A count from an RPC row as a whole number: NaN, negatives or missing → 0. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * GET /api/events?limit=&org_id=&campus=<id|all>
 *
 * Upcoming events, hard-scoped to a campus. Each row carries:
 *   - org info (logo signed via proxy) when scoped to a community
 *   - going_count + interested_count (from the `event_rsvp_counts` RPC:
 *     numbers only, never who)
 *   - viewer_status: 'going' | 'maybe' | null  (mapped to UI labels)
 *
 * The response also carries `viewerCampus` (legacy label, now derived from
 * `campus_id`), `viewerCampusId`, `viewerSystem` and `campusScope`, and keeps
 * the legacy `school` field for existing clients.
 *
 * CAMPUS OF AN EVENT = the campus of its ORG, falling back to the creator's
 * campus only for org-less (legacy) events. Scoping by the creator alone
 * mis-filed any event an admin posted for a chapter on another campus.
 *
 * SCOPING IS ON `campus_id` NOW (plan §2.4, wave 2 B8), never the legacy
 * `school` label, and `?campus=<id>` must be a campus in the viewer's own
 * university (403 `campus_not_in_system`, 400 `unknown_campus`). A viewer with
 * no home campus sees every campus in their university rather than an empty
 * page. The old "a campus-less org shows in every campus view" rule is retired.
 *
 * HIDDEN ORGS ARE DROPPED FROM EVERY LIST, members included (spec §3.4).
 *
 * NOTHING IS EMBEDDED FROM `orgs` UNDER THE VIEWER'S CLIENT (M1c header, the
 * contract written for B27; critic A5 is the same trap). `orgs_select` is
 * `(is_public OR member) AND (hidden_at IS NULL OR member)`, and SAE is
 * `is_public = false`, so an embedded `org:orgs(...)` comes back NULL for
 * every non-member — and both clients render attribution only when `org` is
 * truthy (`campus-home.tsx:7200` "by {org.name}" + the link to /orgs/[handle],
 * `:3951` the phone's subtitle + logo). An SAE rush event would have listed as
 * an unattributed personal event with no route to the club, which is the
 * opposite of spec §3.5 step 10 ("rush and recruitment events are how
 * invite-only orgs meet prospects"). So `{handle,name,logo_url,verified}` is
 * fetched with the SERVICE client and joined in TypeScript below.
 *
 * The same reasoning is why the hidden filter is an ID LIST and not "drop the
 * rows whose embed is null": a PRIVATE org's embed is null too, so that rule
 * would have deleted every private club's events from the campus list. Hidden
 * org ids are resolved with the service role and matched by id. Only ids leave
 * those queries; the events themselves stay under the viewer's RLS.
 *
 * Past events are hidden in v1 (we filter `ends_at >= now()`). When we add
 * a "Past" tab later, swap to a separate query path.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  // ?org_id=<uuid> — limit results to events scoped to a single org.
  // Used by the org profile page; bypasses the campus filter so a
  // logged-in user from another campus can still see this org's events.
  const orgIdFilter = (url.searchParams.get("org_id") ?? "").trim();

  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("school, campus_id, school_system")
    .eq("id", user.id)
    .maybeSingle();
  // A failure here fails OPEN on relevance only — no campus means "every
  // campus in no university", i.e. an empty list, and nothing about who may
  // join is decided in this route. Logged so a transient failure is visible;
  // `/api/orgs?filter=discover`, which DOES decide join state from these same
  // columns, 500s instead.
  if (meErr) console.error("[events GET viewer]", meErr);
  const school = ((me?.school as string | null) ?? "").trim();
  const viewer = scopeViewerFromRow(me as Record<string, unknown> | null);
  const viewerSystem: SchoolSystem | null = isSchoolSystem(viewer.system) ? viewer.system : null;
  const homeCampusId = homeCampusIdFor(viewer);
  const viewerCampus = legacyLabel(homeCampusId, viewerSystem) || null;

  const scope = resolveCampusRequest(url.searchParams.get("campus"), viewer);
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json({ ...body, viewerCampus }, { status });
  }

  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Inner-join the creator so the org-less fallback can filter on the
  // creator's campus. Mirror /api/feed's embed pattern.
  const baseQuery = () =>
    supabase
      .from("events")
      .select(
        // No `org:orgs(...)`: under the viewer's client that embed is null for
        // every org they are not in. Attribution is joined in below.
        "id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at," +
          "creator:users!events_creator_id_fkey!inner(id,name,handle,avatar_url,school,campus_id)",
      )
      .gte("ends_at", nowIso)
      .lte("starts_at", horizonIso)
      .order("starts_at", { ascending: true })
      .limit(limit);

  const failed = () => fail(500, "request_failed", "Request failed");

  const service = createSupabaseServiceClient();
  // Hidden orgs, resolved once. Four rows today (the test clubs). A failure
  // here is a hard failure on purpose: silently listing a hidden org's events
  // is exactly the bug this filter exists to prevent, and the list is one
  // indexed read. A TRUNCATION would be the same bug wearing a success code,
  // so we read one row past the cap and treat a full page as a failure too.
  const { data: hiddenOrgRows, error: hiddenErr } = await service
    .from("orgs")
    .select("id")
    .not("hidden_at", "is", null)
    .limit(MAX_HIDDEN_ORGS + 1);
  if (hiddenErr) {
    console.error("[events GET hidden orgs]", hiddenErr);
    return failed();
  }
  if ((hiddenOrgRows ?? []).length > MAX_HIDDEN_ORGS) {
    console.error("[events GET hidden orgs] cap reached", { cap: MAX_HIDDEN_ORGS });
    return failed();
  }
  const hiddenOrgIds = new Set((hiddenOrgRows ?? []).map((o) => (o as { id: string }).id));

  let rows: EventRow[] = [];
  let campusScope: string = scope.kind === "campus" ? scope.campusId : ALL_CAMPUSES;

  const answer = (events: unknown[]) =>
    NextResponse.json({
      ok: true,
      events,
      // `school` kept for existing clients; `viewerCampus` is the canonical
      // label (null when the account has no campus).
      school,
      viewerCampus,
      viewerCampusId: homeCampusId,
      viewerSystem,
      campusScope,
    });

  if (orgIdFilter) {
    // Org-scoped query: skip campus filtering entirely so a visitor from
    // another campus can still see this org's events on its profile page.
    campusScope = ALL_CAMPUSES;
    // A hidden org has no event list, for anybody (spec §3.4). Same answer as
    // an org id that matches nothing, so it says nothing about the org.
    if (!isUuid(orgIdFilter) || hiddenOrgIds.has(orgIdFilter)) {
      return answer([]);
    }
    const { data, error } = await baseQuery().eq("org_id", orgIdFilter);
    if (error) {
      console.error("[events GET org-scoped]", error);
      return failed();
    }
    rows = (data as unknown as EventRow[]) ?? [];
  } else {
    const campusIds = scopeCampusIds(scope);
    if (campusIds.length === 0) return answer([]);
    // PostgREST cannot OR across two embedded relations in one request, so
    // this runs as two queries merged in memory:
    //   (A) events whose ORG sits on one of these campuses — the normal case
    //   (B) org-less events whose CREATOR does — legacy rows only, since
    //       POST now requires an org_id. Under T1's `events_select_visible`
    //       policy (20260922110000) B returns only the viewer's own club-less
    //       events, or ones they RSVP'd to: 0 rows live.
    // Each side is already ordered by starts_at and capped at `limit`, so
    // sorting the union and taking the first `limit` rows yields exactly what
    // a single query would have returned.
    //
    // Org ids are resolved with the service role on purpose: `orgs` RLS hides
    // private orgs from non-members, and dropping their events here would
    // silently shrink the campus list. `hidden_at is null` is applied in the
    // SAME query, so a hidden org never contributes an id. Only ids leave
    // this query; the events themselves are still read under the viewer's RLS.
    const { data: campusOrgs, error: orgErr } = await service
      .from("orgs")
      .select("id")
      .in("campus_id", campusIds)
      .is("hidden_at", null)
      .limit(MAX_CAMPUS_ORGS);
    if (orgErr) {
      console.error("[events GET campus orgs]", orgErr);
      return failed();
    }
    const orgIds = (campusOrgs ?? []).map((o) => (o as { id: string }).id);

    const [byOrg, byCreator] = await Promise.all([
      orgIds.length > 0 ? baseQuery().in("org_id", orgIds) : null,
      baseQuery()
        .is("org_id", null)
        // Campus ids come from our own frozen table, never from user text, so
        // embedding them in the filter grammar is safe.
        .or(`campus_id.in.(${campusIds.join(",")})`, { referencedTable: "creator" }),
    ]);
    if (byOrg?.error || byCreator.error) {
      console.error("[events GET campus]", byOrg?.error ?? byCreator.error);
      return failed();
    }
    const merged = new Map<string, EventRow>();
    for (const row of [
      ...((byOrg?.data as unknown as EventRow[]) ?? []),
      ...((byCreator.data as unknown as EventRow[]) ?? []),
    ]) {
      merged.set(row.id, row);
    }
    rows = [...merged.values()]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, limit);
  }

  // Belt and braces: whatever branch produced the rows, an event whose org is
  // hidden never leaves this route.
  rows = rows.filter((r) => !r.org_id || !hiddenOrgIds.has(r.org_id));

  // Org attribution, with the SERVICE client (see the docblock). Hidden ids
  // are already out of `rows`, so nothing hidden can be named here. A failure
  // is fatal rather than silently unattributed: "by SAE" quietly becoming a
  // personal event is the exact degradation this join exists to prevent, and
  // an honest error state is recoverable where a wrong page is not.
  const orgById = new Map<string, OrgCard>();
  const orgIdsToName = [...new Set(rows.map((r) => r.org_id).filter((id): id is string => !!id))];
  if (orgIdsToName.length > 0) {
    const { data: orgCards, error: orgCardErr } = await service
      .from("orgs")
      .select("id,handle,name,logo_url,verified")
      .in("id", orgIdsToName);
    if (orgCardErr) {
      console.error("[events GET org attribution]", orgCardErr);
      return failed();
    }
    for (const row of (orgCards as OrgCard[] | null) ?? []) orgById.set(row.id, row);
  }

  const eventIds = rows.map((r) => r.id);

  const goingByEvent = new Map<string, number>();
  const maybeByEvent = new Map<string, number>();
  const viewerStatusByEvent = new Map<string, "going" | "maybe">();

  // Viewer's owner/admin org memberships — an org admin who didn't author
  // the event still gets manage rights over attendees + messaging.
  const myAdminOrgIds = new Set<string>();
  {
    const { data: mine } = await supabase
      .from("org_members")
      .select("org_id,role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"]);
    for (const row of mine ?? []) {
      const r = row as { org_id: string };
      if (r.org_id) myAdminOrgIds.add(r.org_id);
    }
  }

  if (eventIds.length > 0) {
    // Going / maybe counts come from the `event_rsvp_counts` RPC (T1,
    // migration 20260922100000): numbers only, for events the viewer can see.
    // Once T1's policy file lands, `rsvps` returns only the viewer's own rows
    // (plus the RSVPs of events they manage), so counting rows here would say
    // "0 going" or "1 going". `eventIds` is at most MAX_LIMIT = 200, under the
    // RPC's 1000-id cap, so this is one call. A failure is fatal: "12 going"
    // quietly turning into "0 going" is a wrong page, not a degraded one.
    // DEPLOY ORDER: migration 20260922100000 must be live BEFORE this code
    // ships. Without the RPC every signed-in GET here answers 500.
    const [countsRes, mineRsvps] = await Promise.all([
      supabase.rpc("event_rsvp_counts", { p_event_ids: eventIds }),
      supabase
        .from("rsvps")
        .select("event_id,status")
        .in("event_id", eventIds)
        .eq("user_id", user.id),
    ]);
    if (countsRes.error) {
      console.error("[events GET rsvp counts]", countsRes.error);
      return failed();
    }
    for (const row of Array.isArray(countsRes.data) ? countsRes.data : []) {
      const r = row as { event_id?: unknown; going_count?: unknown; maybe_count?: unknown };
      if (typeof r.event_id !== "string") continue;
      goingByEvent.set(r.event_id, toCount(r.going_count));
      maybeByEvent.set(r.event_id, toCount(r.maybe_count));
    }
    for (const row of mineRsvps.data ?? []) {
      const r = row as { event_id: string; status: string };
      if (r.status === "going" || r.status === "maybe") {
        viewerStatusByEvent.set(r.event_id, r.status);
      }
    }
  }

  const events = rows.map((row) => {
    const isCreator = row.creator_id === user.id;
    const isOrgAdmin = !!row.org_id && myAdminOrgIds.has(row.org_id);
    const org = row.org_id ? orgById.get(row.org_id) ?? null : null;
    return {
      ...row,
      going_count: goingByEvent.get(row.id) ?? 0,
      interested_count: maybeByEvent.get(row.id) ?? 0,
      viewer_status: viewerStatusByEvent.get(row.id) ?? null,
      is_creator: isCreator,
      viewer_can_manage: isCreator || isOrgAdmin,
      // Same shape the embed produced, so no client changes.
      org: org
        ? { ...org, logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo") }
        : null,
    };
  });

  return answer(events);
}

/**
 * Create an event on behalf of a verified org the viewer owns or admins.
 *
 * A HIDDEN ORG CANNOT POST EVENTS (spec §3.4), not even for its own officers:
 * the org is out of every list, so a new event would be invisible the moment
 * it was created. Same 404 as an org id that matches nothing.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: CreateEventBody;
  try {
    body = (await req.json()) as CreateEventBody;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const startsAt = typeof body.starts_at === "string" ? body.starts_at.trim() : "";
  const endsAt = typeof body.ends_at === "string" ? body.ends_at.trim() : "";

  if (!title) {
    return fail(400, "title_required", "Title is required");
  }
  if (title.length > MAX_TITLE) {
    return fail(400, "title_too_long", `Title exceeds ${MAX_TITLE} characters`);
  }
  if (description.length > MAX_DESCRIPTION) {
    return fail(
      400,
      "description_too_long",
      `Description exceeds ${MAX_DESCRIPTION} characters`,
    );
  }
  if (location.length > MAX_LOCATION) {
    return fail(400, "location_too_long", `Location exceeds ${MAX_LOCATION} characters`);
  }
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return fail(400, "invalid_times", "Start and end times are required");
  }
  if (end < start) {
    return fail(400, "invalid_times", "End time must be after start");
  }
  if (start < Date.now() - 5 * 60 * 1000) {
    return fail(400, "invalid_times", "Start time is in the past");
  }

  // Events must be posted on behalf of a verified org. Verified status
  // is platform-admin-controlled (see /admin) so this gates spam without
  // demanding an approval queue per event.
  const rawOrgId = typeof body.org_id === "string" ? body.org_id.trim() : "";
  if (!rawOrgId || !isUuid(rawOrgId)) {
    return fail(400, "org_required", "Events must be posted on behalf of a verified org");
  }
  // Service-role load, like every other org read: `orgs_select` would hide a
  // private org from a member whose row this route is about to check anyway,
  // and `hidden_at` has to be readable here.
  const service = createSupabaseServiceClient();
  const [{ data: org, error: orgErr }, { data: membership, error: mErr }] = await Promise.all([
    service.from("orgs").select("id,verified,hidden_at").eq("id", rawOrgId).maybeSingle(),
    service
      .from("org_members")
      .select("role")
      .eq("org_id", rawOrgId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (orgErr) {
    console.error("[events POST org]", orgErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (mErr) {
    console.error("[events POST org membership]", mErr);
    return fail(500, "request_failed", "Request failed");
  }
  if (!org || org.hidden_at) {
    return fail(404, "not_found", "Org not found");
  }
  if (!org.verified) {
    return fail(403, "org_unverified", "Only verified orgs can post events");
  }
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "admin") {
    return fail(403, "org_role_required", "You can't post events on behalf of that org");
  }
  const orgId: string = rawOrgId;

  const { data: row, error } = await supabase
    .from("events")
    .insert({
      creator_id: user.id,
      org_id: orgId,
      title,
      description,
      location,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
    })
    .select(
      "id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at",
    )
    .single();

  if (error || !row) {
    console.error("[events POST]", error);
    return fail(500, "request_failed", "Request failed");
  }

  return NextResponse.json({ ok: true, event: row });
}
