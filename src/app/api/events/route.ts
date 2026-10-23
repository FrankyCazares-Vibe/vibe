import { NextResponse } from "next/server";

import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { scopeCampusIds } from "@/lib/iu/campus-scope";
import { ALL_CAMPUSES, isSchoolSystem, legacyLabel, type SchoolSystem } from "@/lib/iu/campuses";
import { campusScopeError, homeCampusIdFor } from "@/lib/iu/community-scope";
import { parseCheckinStateRows, type CheckinStateRow } from "@/lib/events/event-checkin";
import {
  EVENT_ROW_COLUMNS,
  toCount,
  toEventListItem,
  type EventListRow,
  type EventOrgCard,
} from "@/lib/events/event-item";
import { checkEventFields, readEventFields } from "@/lib/events/validate";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const WINDOW_DAYS = 60;
// The club page's Past events block (event check-in, Oct 19 2026): events
// that ended in the last 30 days, at most 20 of them.
const PAST_DAYS = 30;
const MAX_PAST_LIMIT = 20;

// The creator embed. A CLUB event ships no creator identity (the app shows the
// club, not the officer who typed it), but keeps an id-only INNER join: under
// users RLS that still drops a club event whose creator can't be seen (a
// suspended or banned officer), which is today's behaviour and Franky's
// product call 8 (security wave 2). An org-less event keeps the full card: the
// campus filter reads creator.campus_id and the card shows "by @handle".
const CLUB_CREATOR_EMBED = "creator:users!events_creator_id_fkey!inner(id)";
const PERSONAL_CREATOR_EMBED =
  "creator:users!events_creator_id_fkey!inner(id,name,handle,avatar_url,school,campus_id)";
// Safety cap on the campus org-id list we feed into `org_id in (...)`.
// Far above the real club count on any IU campus.
const MAX_CAMPUS_ORGS = 1000;
// Its own cap, because it guards a different thing: the hidden-org list is a
// SAFETY filter, and a silent truncation there would start listing hidden
// orgs' events. Four rows today. The two caps move independently on purpose.
const MAX_HIDDEN_ORGS = 1000;

// The row and item shapes live in src/lib/events/event-item.ts, shared with
// PATCH /api/events/[id] (which answers with one item of this list).
type EventRow = EventListRow;
/** Org attribution, resolved with the service role (see the GET docblock). */
type OrgCard = EventOrgCard;

/** The error shape the org routes speak; events now carry a `code` too. */
function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
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
 * `school` label. Since S67 `?campus=<id>` may be ANY known campus, either
 * university: a verified student may look around anywhere (the rule and why
 * are in the header of `src/lib/iu/campus-scope.ts`; do not restore the old
 * own-university 403 here). Only a viewer with no university at all is
 * refused (403 `campus_not_in_system`, the clamp in `resolveCampusRequest`);
 * an unknown id is 400 `unknown_campus`. `?campus=all` is still the viewer's
 * own university. A viewer with no home campus sees every campus in their
 * university rather than an empty page. RSVPing is a separate question: it
 * works at home only (`/api/events/[id]/rsvp`, 403 `campus_visiting`). The
 * old "a campus-less org shows in every campus view" rule is retired.
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
 * Past events stay out of every list (we filter `ends_at >= now()`), with
 * one exception: `?org_id=<uuid>&when=past` (event check-in, Oct 19 2026) is
 * the club page's Past events block, the events of that one club that ended
 * in the last 30 days, newest first, at most 20. It is where "N were there"
 * shows once a card has gone. Without `org_id`, `when` is ignored; the
 * hidden-club and uuid rules of the org branch apply the same.
 *
 * `?org_id=<uuid>&include=<event uuid>` (Oct 19, 2026, critique B8 repair):
 * the club page opened at one event from My Calendar
 * (`/orgs/<handle>?event=<id>`). My Calendar reads 180 days ahead and both
 * club lists are capped (60 days and 50 rows upcoming, 20 rows past), so a
 * January formal or a busy club's older practice wasn't in either list and
 * the page said "That event isn't listed anymore." `include` adds that one
 * event when it belongs to this club and to the view asked for (upcoming:
 * not ended yet; past: ended), whatever its date or the row cap. It is read
 * with the VIEWER's client, so it is only ever an event they could already
 * see, and every later rule here (hidden clubs, attribution, counts) applies
 * to it the same. Without `org_id`, or not a uuid, it is ignored.
 *
 * EVENT CHECK-IN. Every item also carries checkin_open, checked_in_count
 * (the database's from-5 floor already applied; exact for the event's
 * officers) and viewer_checked_in, from the `event_checkin_state` RPC. A
 * failed read there leaves them "nothing known" instead of failing the list:
 * no check-in shown is honest, a broken list isn't.
 *
 * MEMBERS ONLY (Oct 22, 2026). Every event row here is read on the VIEWER's
 * client, so `event_visible` (20261025100000) leaves a members-only event
 * out for everyone but its club's members and platform admins: members see
 * theirs in the campus list and Tonight too. Each item carries
 * `visibility` ("everyone" | "members") for the chip. The service-role
 * reads above only resolve ids and names, never rows.
 *
 * EVENT ICONS (Oct 23, 2026, club view wave 3, batch B4). Every item also
 * carries `icon`, its very last key: one of the twelve keys of
 * src/lib/events/event-icons.ts, or null for none (the card draws the
 * calendar). Read off the same row (events.icon, 20261027100000).
 *
 * CACHING. Every answer, refusals included, says Cache-Control: no-store
 * (contract 3.0): each one is per viewer (their RSVPs, whether they checked
 * in, and an officer's exact check-in counts), so nothing between may keep it.
 */
export async function GET(req: Request) {
  const res = await listEvents(req);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** GET's body; every return here leaves through GET's no-store line. */
async function listEvents(req: Request): Promise<Response> {
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
  // ?when=past only means something on one club's page (see the docblock).
  const past = !!orgIdFilter && url.searchParams.get("when") === "past";

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
  const pastFloorIso = new Date(Date.now() - PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Inner-join the creator (see CLUB_CREATOR_EMBED / PERSONAL_CREATOR_EMBED):
  // club queries take the id-only embed, the org-less fallback the full one so
  // it can filter on the creator's campus. Mirror /api/feed's embed pattern.
  // `pastView`: the club page's Past events (ended in the last 30 days,
  // newest first); otherwise the upcoming list, unchanged.
  const baseQuery = (creatorEmbed: string, pastView: boolean) => {
    const query = supabase
      .from("events")
      .select(
        // No `org:orgs(...)`: under the viewer's client that embed is null for
        // every org they are not in. Attribution is joined in below.
        `${EVENT_ROW_COLUMNS},${creatorEmbed}`,
      );
    if (pastView) {
      return query
        .lt("ends_at", nowIso)
        .gte("ends_at", pastFloorIso)
        .order("starts_at", { ascending: false })
        .limit(Math.min(limit, MAX_PAST_LIMIT));
    }
    return query
      .gte("ends_at", nowIso)
      .lte("starts_at", horizonIso)
      .order("starts_at", { ascending: true })
      .limit(limit);
  };

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
    const { data, error } = await baseQuery(CLUB_CREATOR_EMBED, past).eq("org_id", orgIdFilter);
    if (error) {
      console.error("[events GET org-scoped]", error);
      return failed();
    }
    rows = (data as unknown as EventRow[]) ?? [];
    // `include` (see the docblock): the one linked event the caps left out.
    // Not fatal: a failed read leaves the list as it was.
    const includeId = (url.searchParams.get("include") ?? "").trim().toLowerCase();
    if (isUuid(includeId) && !rows.some((r) => r.id === includeId)) {
      const extraQuery = supabase
        .from("events")
        .select(`${EVENT_ROW_COLUMNS},${CLUB_CREATOR_EMBED}`)
        .eq("id", includeId)
        .eq("org_id", orgIdFilter);
      const { data: extra, error: extraErr } = await (past
        ? extraQuery.lt("ends_at", nowIso)
        : extraQuery.gte("ends_at", nowIso)
      ).limit(1);
      if (extraErr) {
        console.error("[events GET include]", extraErr);
      } else if (Array.isArray(extra) && extra.length > 0) {
        // Same order as the list it joins: upcoming soonest first, past newest first.
        const byStart = (a: EventRow, b: EventRow) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0);
        rows = [...rows, ...(extra as unknown as EventRow[])].sort((a, b) => (past ? byStart(b, a) : byStart(a, b)));
      }
    }
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
    //
    // `verified` too (security report #11): only a verified club may put an
    // event in front of a whole campus, and POST already refuses the rest. An
    // unverified club's events (made before this rule, or a club whose badge
    // was taken away) still show on that club's own page (the org-scoped
    // branch above), just not in the campus-wide list.
    const { data: campusOrgs, error: orgErr } = await service
      .from("orgs")
      .select("id")
      .in("campus_id", campusIds)
      .is("hidden_at", null)
      .eq("verified", true)
      .limit(MAX_CAMPUS_ORGS);
    if (orgErr) {
      console.error("[events GET campus orgs]", orgErr);
      return failed();
    }
    const orgIds = (campusOrgs ?? []).map((o) => (o as { id: string }).id);

    const [byOrg, byCreator] = await Promise.all([
      // Never the past view: `when` means nothing without `org_id`.
      orgIds.length > 0 ? baseQuery(CLUB_CREATOR_EMBED, false).in("org_id", orgIds) : null,
      baseQuery(PERSONAL_CREATOR_EMBED, false)
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
  // Event check-in per event id; empty when the read failed (see below).
  let checkinById = new Map<string, CheckinStateRow>();

  // Viewer's CURRENT owner/admin org memberships. A club event is managed by
  // them, whoever made it; its creator gets nothing for having made it (a
  // demoted officer would otherwise see "Manage attendees" and then a 403).
  // Same rule as public.can_manage_event, via viewerCanManage.
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
    //
    // Event check-in (20261019120000) rides in the same round trip, on the
    // viewer's client so the database decides who sees an exact count. Unlike
    // the RSVP counts, a failure here is NOT fatal: the cards just show no
    // check-in, which is honest, and it means the list keeps working if this
    // code ships before the migration does.
    const [countsRes, mineRsvps, checkinRes] = await Promise.all([
      supabase.rpc("event_rsvp_counts", { p_event_ids: eventIds }),
      supabase
        .from("rsvps")
        .select("event_id,status")
        .in("event_id", eventIds)
        .eq("user_id", user.id),
      supabase.rpc("event_checkin_state", { p_event_ids: eventIds }),
    ]);
    if (countsRes.error) {
      console.error("[events GET rsvp counts]", countsRes.error);
      return failed();
    }
    if (checkinRes.error) {
      // The code only: the message can carry ids.
      console.error("[events GET checkin state]", { code: checkinRes.error.code });
    } else {
      checkinById = parseCheckinStateRows(checkinRes.data);
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

  // One item per row, built by the same function PATCH /api/events/[id] uses.
  const events = rows.map((row) =>
    toEventListItem(row, {
      viewerId: user.id,
      viewerIsOfficer: !!row.org_id && myAdminOrgIds.has(row.org_id),
      org: row.org_id ? orgById.get(row.org_id) ?? null : null,
      goingCount: goingByEvent.get(row.id) ?? 0,
      interestedCount: maybeByEvent.get(row.id) ?? 0,
      viewerStatus: viewerStatusByEvent.get(row.id) ?? null,
      checkin: checkinById.get(row.id),
    }),
  );

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

  // Ten an hour per account (security wave 2, #11). Same shape as org-create;
  // an officer posting a week of rush events stays far under it.
  const rl = await rateLimit(`event-create:${user.id}`, { limit: 10, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Putting an event in front of a campus is publishing: Terms, a verified
  // school email, no restriction in force. Exactly where the Terms gate stood,
  // and `requireCanPublish` still refuses on Terms first, so nothing an
  // unrestricted, verified officer does changes.
  //
  // THIS GATE TAKES SOMETHING AWAY, and it is Franky's decision 4 in
  // handoffs/wave-plan-moderation/plan.md ("creating chats/events … require a
  // verified school email"), not a word-filter side effect: an officer whose
  // `users.school_verified` is false — signed up on a personal address, or a
  // row written before the flag existed — clicks Create event and gets a 403
  // `school_email_required` where they got a 200 yesterday. The composer
  // (src/app/campus/campus-home.tsx:9117) still throws `data.error` raw, so
  // until it runs `describeFailure` that 403 is a dead end with no "Verify"
  // action. THE COMPOSER FIX SHIPS BEFORE THIS DOES.
  //
  // THIS ROUTE IS THE ONLY WAY TO CREATE AN EVENT (security wave 2, #11).
  // The insert below runs with the SERVICE role, and
  // 20260928130000_events_insert_service_only.sql revokes INSERT on events
  // from signed-in clients, because the word filter only exists here: a direct
  // PostgREST insert skipped it (and the verified-club, length and date
  // checks). So every check below is the whole gate. What the database still
  // enforces on every writer, this one included, are the CHECKs in
  // 20260928110000_club_events_rules.sql (title 1..120, description <= 2000,
  // location <= 200, at most 14 days long): the same numbers as
  // src/lib/events/manage.ts, so a request that passes here never trips one.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  // JSON that parses to null, a number or an array is no body at all (it
  // used to throw on `body.title` and answer a bare 500).
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  const body = parsed as Record<string, unknown>;

  // Title, lengths, the word filter, then the times: one function shared with
  // PATCH /api/events/[id] (src/lib/events/validate.ts), so an edit can never
  // pass something a create refuses. Same codes and sentences as before.
  //  - The word filter, same as posts, comments and club profiles. An event
  //    is the most public thing a club writes: it lands in the campus feed,
  //    in Otto's "Heads up" panel and in a calendar file. Every value here is
  //    new (no stored event), so each is checked whole. `field` names the
  //    input for the composer to point at.
  //  - Start and end: both real, end not before start, start not in the past
  //    (5 minutes' grace), at most 14 days long (the database's
  //    events_max_duration CHECK). An event ending in 2099 used to sit at the
  //    top of the campus list forever.
  //  - Who can see it (Oct 22, 2026): `visibility` "everyone" (the default
  //    when left out) or "members", the club's members only; anything else
  //    is 400 invalid_visibility. The database decides who sees a
  //    members-only event (event_visible, 20261025100000), so the officer
  //    check below is all this route adds.
  //  - Its icon (Oct 23, 2026): `icon` one of the twelve keys of
  //    event-icons.ts, or null / left out for none (the calendar); anything
  //    else is 400 invalid_icon. An enum, never word-filtered.
  const checked = checkEventFields(readEventFields(body), Date.now());
  if (!checked.ok) {
    const p = checked.problem;
    return p.kind === "content_blocked"
      ? contentBlockedResponse(p.field)
      : fail(p.status, p.code, p.error);
  }
  const fields = checked.value;

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

  // SERVICE role on purpose (see the top of this handler): every check has run,
  // and creator_id is the signed-in user, never a value from the body.
  const { data: row, error } = await service
    .from("events")
    .insert({
      creator_id: user.id,
      org_id: orgId,
      title: fields.title,
      description: fields.description,
      location: fields.location,
      starts_at: fields.starts_at,
      ends_at: fields.ends_at,
      visibility: fields.visibility,
      icon: fields.icon,
    })
    .select(EVENT_ROW_COLUMNS)
    .single();

  if (error || !row) {
    console.error("[events POST]", error);
    return fail(500, "request_failed", "Request failed");
  }

  return NextResponse.json({ ok: true, event: row });
}
