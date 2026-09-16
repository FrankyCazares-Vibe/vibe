import { NextResponse } from "next/server";

import {
  allowedCampusIdsFor,
  CAMPUS_PARAM_ALL,
  scopeCampusIds,
} from "@/lib/iu/campus-scope";
import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import {
  ALL_CAMPUSES,
  allowedCampusId,
  campusIdFromLegacyLabel,
  isSchoolSystem,
  legacyLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { campusScopeError, homeCampusIdFor } from "@/lib/iu/community-scope";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { normalizeOrgAssetInput, orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  INVITE_ONLY_ORGS_IN_DISCOVERY,
  isJoinPolicy,
  isOrgAudience,
  isOrgRole,
  orgJoinState,
  visibleInviterFirstName,
  type JoinPolicy,
  type OrgAudience,
  type OrgRole,
} from "@/lib/orgs/join-state";
import { ilikeOrFilter } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,30}$/;
const VALID_BACKDROPS = [
  "cream",
  "sand-purple",
  "ember",
  "deep-violet",
  "forest",
  "midnight",
] as const;
type BackdropKey = (typeof VALID_BACKDROPS)[number];

type CreateBody = {
  handle?: unknown;
  name?: unknown;
  description?: unknown;
  is_public?: unknown;
  join_policy?: unknown;
  audience?: unknown;
  backdrop_preset?: unknown;
  logo_url?: unknown;
  banner_url?: unknown;
  campus?: unknown;
  campus_id?: unknown;
};

/** The error shape every org route now speaks (spec §4 conventions). */
function fail(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

/**
 * Why an `audience` was refused, in words the creator can act on.
 *
 * The null case is the one that used to dead-end: a creator with no verified
 * university was told to "pick an option that includes IU students", and
 * picking `iu` failed again with the same sentence. Their only valid choice is
 * "both". (Twin of the owner-side copy in `orgs/[slug]/route.ts` — the two are
 * intentionally identical apart from whose email it is; a shared helper would
 * have to live in `src/lib/orgs/`, which another batch owns.)
 */
function audienceExcludesOwnerMessage(system: SchoolSystem | null): string {
  if (system === null) {
    return 'The owner has to be able to join. Pick "IU and Purdue students" until your school email names a university.';
  }
  return `The owner has to be able to join. Pick an option that includes ${
    system === "purdue" ? "Purdue" : "IU"
  } students.`;
}

/**
 * GET /api/orgs?filter=mine|discover&q=<search>&campus=<id|all>
 *
 * - filter=mine (default): orgs the viewer is a member of, with their role.
 *   Never campus-filtered — membership beats geography — and hidden orgs are
 *   INCLUDED with `hidden: true`, because their members keep the page, the
 *   chats and the rail entry (spec §3.4).
 * - filter=discover: every VISIBLE org on the scoped campus, whether or not
 *   the viewer is in it, each carrying the one join decision (§3.2) the
 *   button renders from.
 *
 * Both return `viewerCampus` (legacy label, now derived from `campus_id`),
 * `viewerCampusId`, `viewerSystem` and `campusScope`.
 *
 * CAMPUS SCOPING IS ON `campus_id` NOW (plan §2.4, wave 2 B8), not the legacy
 * `orgs.school` label:
 *   - no `?campus=` → the viewer's home campus; with no home campus, every
 *     campus in their university (an empty club list reads as a broken app);
 *   - `?campus=<id>` → that campus, but only inside the viewer's own
 *     university: 403 `campus_not_in_system`, or 400 `unknown_campus`;
 *   - `?campus=all` → every campus in their university.
 * The legacy "an org with no campus shows in every campus view" rule is
 * retired (plan §2.4, §2.8 row 4): a campus-less org is reachable by link and
 * from its members' profiles, not through a campus list.
 *
 * TEXT SEARCH WIDENS TO THE UNIVERSITY, NOT TO EVERYTHING (plan §2.4 row
 * "Explicit org text search"). A student typing a club's name already knows
 * which club they want, so browsing's hard campus filter would read as a bug —
 * but widening past their own university would offer a Purdue West Lafayette
 * club to an IU student who can never join it. `?campus=` pins the search.
 *
 * HIDDEN ORGS ARE GONE FROM DISCOVER for everyone, members included (§3.4),
 * and `include_dormant=true` cannot bring them back: the filter is in the
 * query, not in the dormancy pass.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") === "discover" ? "discover" : "mine";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const includeDormant = url.searchParams.get("include_dormant") === "true";

  // `campus_id` and `school_system` carry an `authenticated` SELECT grant
  // (M1), so the viewer reads their own scoping columns on their own client.
  const { data: me, error: meErr } = await supabase
    .from("users")
    .select("school, campus_id, school_system")
    .eq("id", user.id)
    .maybeSingle();
  if (meErr) {
    console.error("[orgs GET viewer]", meErr);
    // Discover DECIDES from these columns: with `me` null every row comes back
    // `unverified`, so a fully verified student would be told to verify their
    // school email on every club while the join route (which reads the viewer
    // with the service role) admits them. That is the silent degradation
    // `loadViewerOrgContext`'s `ok` flag exists to stop, so say the read
    // failed. `filter=mine` doesn't decide anything from them — the columns
    // only label the campus — so it still answers.
    if (filter === "discover") {
      return fail(500, "load_failed", "Failed to load orgs");
    }
  }
  const viewer = scopeViewerFromRow(me as Record<string, unknown> | null);
  const viewerSystem: SchoolSystem | null = isSchoolSystem(viewer.system)
    ? viewer.system
    : null;
  const homeCampusId = homeCampusIdFor(viewer);
  // Legacy field, now derived from `campus_id` instead of the `school`
  // string: same value for every backfilled row, and finally correct for a
  // Purdue student ("Purdue Indianapolis", not "IU …").
  const viewerCampus = legacyLabel(homeCampusId, viewerSystem) || null;

  const rawCampusParam = url.searchParams.get("campus");
  const scope = resolveCampusRequest(rawCampusParam, viewer);
  if (scope.kind === "forbidden") {
    const { status, body } = campusScopeError(scope);
    return NextResponse.json({ ...body, viewerCampus }, { status });
  }

  if (filter === "mine") {
    const { data, error } = await supabase
      .from("org_members")
      .select(
        "role, org:org_id(id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, school, campus_id, join_policy, audience, hidden_at)"
      )
      .eq("user_id", user.id);
    if (error) {
      console.error("[orgs GET mine]", error);
      return fail(500, "load_failed", "Failed to load orgs");
    }
    const orgs = (data || [])
      .map((row) => {
        const org = row.org as unknown as {
          id: string;
          handle: string;
          name: string;
          description: string;
          logo_url: string | null;
          banner_url: string | null;
          is_public: boolean;
          backdrop_preset: string;
          verified: boolean;
          last_activity_at: string | null;
          links: unknown;
          philanthropy: string;
          school: string;
          campus_id: string | null;
          join_policy: JoinPolicy;
          audience: OrgAudience;
          hidden_at: string | null;
        } | null;
        if (!org) return null;
        const { hidden_at, ...rest } = org;
        return {
          ...rest,
          logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
          banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
          // The one fact the rail and the phone chats list need: this org is
          // hidden, so it is out of every list but this one (spec §3.4).
          hidden: !!hidden_at,
          role: row.role as string,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // Membership beats geography: an org you already joined stays in your
    // list even if it sits on another campus. Report scope "all" so the
    // client doesn't render a switcher that would do nothing here.
    return NextResponse.json({
      ok: true,
      orgs,
      viewerCampus,
      viewerCampusId: homeCampusId,
      viewerSystem,
      campusScope: ALL_CAMPUSES,
    });
  }

  // ── Discover ─────────────────────────────────────────────────────────────
  // Lists ALL visible orgs, including ones the viewer is already in, so the
  // page serves double duty as "find new" + "your clubs". The service role is
  // deliberate: `orgs_select` hides private orgs from non-members, and a
  // private club has to be listed for anyone to request it (critic A2's twin).
  // Every row's visibility is decided HERE, in this route, not by RLS.
  const service = createSupabaseServiceClient();

  const [myMembershipsRes, myPendingRes, myInvitesRes] = await Promise.all([
    supabase.from("org_members").select("org_id, role").eq("user_id", user.id),
    // Pending join requests block re-requesting; they render as "Requested".
    supabase
      .from("org_join_requests")
      .select("id, org_id")
      .eq("user_id", user.id)
      .eq("status", "pending"),
    // Invites are read with the service role: `org_invites` grants
    // `authenticated` SELECT, but the service client is what every other org
    // read in this file uses and it can't be narrowed by a policy change.
    service
      .from("org_invites")
      .select("id, org_id, expires_at, invited_by")
      .eq("invitee_id", user.id)
      .eq("status", "pending"),
  ]);

  // A failed read here doesn't empty the page, it mislabels buttons: a joined
  // org would render "Join", a filed request would render "Request". Both are
  // recoverable (the server re-decides on the tap) and neither is worth a 500,
  // so they are logged and the page still answers.
  if (myMembershipsRes.error) console.error("[orgs GET discover memberships]", myMembershipsRes.error);
  if (myPendingRes.error) console.error("[orgs GET discover requests]", myPendingRes.error);

  const roleByOrg = new Map<string, OrgRole>();
  for (const m of myMembershipsRes.data || []) {
    const role = (m as { role?: unknown }).role;
    if (isOrgRole(role)) roleByOrg.set((m as { org_id: string }).org_id, role);
  }

  const requestByOrg = new Map<string, { id: string }>();
  for (const r of myPendingRes.data || []) {
    const row = r as { id: string; org_id: string };
    requestByOrg.set(row.org_id, { id: row.id });
  }

  type InviteRow = {
    id: string;
    org_id: string;
    expires_at: string;
    invited_by: string | null;
  };
  const inviteRows = (myInvitesRes.data as InviteRow[] | null) ?? [];
  if (myInvitesRes.error) {
    // An invite we can't read renders as "no invite", which understates what
    // the student may do. Logged, not fatal: the rest of Discover is still
    // right, and the org page re-decides from the same source.
    console.error("[orgs GET discover invites]", myInvitesRes.error);
  }
  const inviteByOrg = new Map<string, InviteRow>();
  for (const row of inviteRows) inviteByOrg.set(row.org_id, row);

  // Only pay for inviter names when there IS an invite (the 99% case has
  // none). Critic A7: an officer the viewer blocked or muted must not reach
  // them by name through `pending_invite.invited_by_name`, so the names go
  // through `visibleInviterFirstName` with the viewer's hidden set.
  const inviterIds = [
    ...new Set(inviteRows.map((r) => r.invited_by).filter((id): id is string => !!id)),
  ];
  const inviterById = new Map<string, { id: string; name: string | null }>();
  let hiddenUserIds = new Set<string>();
  if (inviterIds.length > 0) {
    const [namesRes, hiddenRes] = await Promise.all([
      service.from("users").select("id, name").in("id", inviterIds),
      loadHiddenUsers(supabase, user.id),
    ]);
    for (const row of namesRes.data ?? []) {
      const u = row as { id: string; name: string | null };
      inviterById.set(u.id, u);
    }
    if (hiddenRes.ok) {
      hiddenUserIds = new Set(hiddenRes.hidden.ids);
    } else {
      // Fail closed on the NAME only: an unreadable block list means every
      // inviter renders as "an officer", never as a person the viewer blocked.
      console.error("[orgs GET discover hidden-users]", hiddenRes.error);
      hiddenUserIds = new Set(inviterIds);
    }
  }

  // Browsing is scoped to one campus; an explicit text search widens to the
  // viewer's own university (see the docblock).
  const param = (rawCampusParam ?? "").trim();
  const pinnedCampus = param.length > 0 && param.toLowerCase() !== CAMPUS_PARAM_ALL;
  const searchWidens = q !== "" && !pinnedCampus;
  const campusIds = searchWidens
    ? allowedCampusIdsFor(viewerSystem)
    : scopeCampusIds(scope);
  const campusScope =
    !searchWidens && scope.kind === "campus" ? scope.campusId : ALL_CAMPUSES;

  const emptyList = () =>
    NextResponse.json({
      ok: true,
      orgs: [],
      viewerCampus,
      viewerCampusId: homeCampusId,
      viewerSystem,
      campusScope,
    });

  if (campusIds.length === 0) return emptyList();

  // Discover ordering: verified first (top of the feed), then most-recently
  // active. Embed an aggregate org_members count for the card meta. The
  // `relation(count)` shape returns `[{ count: N }]`, flattened below.
  let query = service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, school, campus_id, join_policy, audience, members:org_members(count)"
    )
    .is("hidden_at", null)
    .in("campus_id", campusIds)
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(120);

  if (q) {
    const searchFilter = ilikeOrFilter(["handle", "name"], q);
    if (!searchFilter) return emptyList();
    query = query.or(searchFilter);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[orgs GET discover]", error);
    return fail(500, "load_failed", "Failed to load orgs");
  }
  type DiscoverRow = {
    id: string;
    handle: string;
    name: string;
    description: string;
    logo_url: string | null;
    banner_url: string | null;
    is_public: boolean;
    backdrop_preset: string;
    verified: boolean;
    last_activity_at: string | null;
    links: unknown;
    philanthropy: string;
    school: string;
    campus_id: string | null;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    members?: Array<{ count: number }> | null;
  };
  const DORMANT_MS = 60 * 24 * 60 * 60 * 1000; // 60 days; mirror migration
  const now = Date.now();
  const allRows = (data as DiscoverRow[] | null) || [];
  const enriched = allRows.map((o) => {
    const { members, ...rest } = o;
    const lastMs = o.last_activity_at ? Date.parse(o.last_activity_at) : null;
    // NULL last_activity_at means we have no signal yet — treat that as
    // "fresh" rather than "dormant". A brand-new org with no messages
    // shouldn't immediately default-hide; dormancy only kicks in after we
    // have an old timestamp to compare against.
    const dormant =
      !o.verified && lastMs !== null && now - lastMs > DORMANT_MS;
    const role = roleByOrg.get(o.id) ?? null;
    const invite = inviteByOrg.get(o.id) ?? null;
    const request = requestByOrg.get(o.id) ?? null;
    // ONE decision, the same one the join route acts on (spec §3.2). Every
    // row in this list is visible, so `hidden_at` is null and the
    // platform-admin branch of `orgJoinState` can never fire here.
    const decision = orgJoinState({
      org: {
        join_policy: o.join_policy,
        audience: o.audience,
        hidden_at: null,
        campus_id: o.campus_id,
      },
      viewer: {
        school_system: viewerSystem,
        campus_id: viewer.campusId ?? null,
        is_platform_admin: false,
      },
      role,
      pendingInvite: invite,
      pendingRequest: request,
    });
    return {
      ...rest,
      logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(o.handle, o.banner_url, "banner"),
      member_count: members?.[0]?.count ?? 0,
      pending_request: !!request,
      dormant,
      // Viewer's role on this org (null if not a member). Drives the
      // "Joined" / role chip vs Join/Request CTA on the discover card.
      role,
      join_state: decision.state,
      join_reason: decision.reason ?? null,
      pending_invite:
        decision.state === "invited" && invite
          ? {
              id: invite.id,
              expires_at: invite.expires_at,
              invited_by_name: visibleInviterFirstName(
                invite.invited_by ? inviterById.get(invite.invited_by) ?? null : null,
                hiddenUserIds,
              ),
            }
          : null,
    };
  });

  // Invite-only orgs stay listed, labelled, with no join button (spec Q1).
  // ONE constant decides it — `INVITE_ONLY_ORGS_IN_DISCOVERY` in
  // `src/lib/orgs/join-state.ts`. Flip it to false and they leave every list
  // except for the people who were actually invited and the members.
  const listed = INVITE_ONLY_ORGS_IN_DISCOVERY
    ? enriched
    : enriched.filter(
        (o) => o.join_policy !== "invite" || o.join_state === "invited" || !!o.role,
      );

  // Invited first (an invite is the strongest thing on this page), then the
  // query's verified/recent order, with orgs the viewer cannot join at all
  // last. Array#sort is stable, so the query order survives inside each band.
  const band = (state: string) => (state === "invited" ? 0 : state === "audience_blocked" ? 2 : 1);
  const ordered = [...listed].sort((a, b) => band(a.join_state) - band(b.join_state));

  const visible = includeDormant ? ordered : ordered.filter((o) => !o.dormant);
  return NextResponse.json({
    ok: true,
    orgs: visible.slice(0, 60),
    viewerCampus,
    viewerCampusId: homeCampusId,
    viewerSystem,
    campusScope,
  });
}

/**
 * POST /api/orgs — create an org. Body:
 *   { handle, name, description?, join_policy?, audience?, campus_id?,
 *     backdrop_preset?, logo_url?, banner_url?, campus?, is_public? }
 *
 * `join_policy` ("open" | "request" | "invite") replaces `is_public` for new
 * clients (spec §2.2). A legacy body carrying only `is_public` still works:
 * false → "request", true → "open". The column itself is derived by the
 * `orgs_sync_join_policy` trigger, so this route never writes it.
 *
 * `audience` ("both" | "iu" | "purdue") is who may join, checked against each
 * student's verified school email WHEN THEY JOIN (critic A9 — it is a label,
 * not a boundary). An audience that would lock the creator out of their own
 * org is refused: 400 `audience_excludes_owner`.
 *
 * `campus_id` (or the legacy `campus`, an id or a label) must be a campus in
 * the CREATOR's university — 403 `campus_not_in_system`, 400 `unknown_campus`
 * (plan §2.6). Omit it and the org inherits the creator's home campus. The
 * legacy `orgs.school` label is dual-written for one release (plan §5.5).
 *
 * A CREATOR WITH NO HOME CAMPUS IS REFUSED, 400 `campus_required`, rather
 * than handed an org nobody will ever see. Under plan §2.4 a campus-less org
 * is in no Discover list, no search, no map and no onboarding step 5, and
 * since no deployed client sends `campus_id` on create OR on PATCH there is no
 * in-app way for the owner to repair it: 201 + invisible + unfixable, with no
 * error to tell them. 7 of the 14 school-verified accounts have a null
 * `campus_id` today, so this is the common case, not an edge — and the plan's
 * own rule for exactly that population is "prompted, not guessed" (§2.8 row
 * 12). They set a campus on their profile (`PATCH /api/me/profile`) and try
 * again. An EXPLICIT `campus_id: null` is still honoured: a client that asks
 * for a campus-less org gets `campus_id: null` back in the 201 and knows what
 * it made.
 *
 * On success: the org row, an `org_members` row with role='owner', and
 * default channels `#general` + `#announcements`.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const rl = await rateLimit(`org-create:${user.id}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const backdrop: BackdropKey =
    typeof body.backdrop_preset === "string" &&
    (VALID_BACKDROPS as readonly string[]).includes(body.backdrop_preset)
      ? (body.backdrop_preset as BackdropKey)
      : "sand-purple";
  // Asset values must be our own R2 keys or Supabase-hosted URLs — never an
  // arbitrary third-party URL that the asset proxy would then redirect to.
  const logoUrl = normalizeOrgAssetInput(body.logo_url ?? null);
  const bannerUrl = normalizeOrgAssetInput(body.banner_url ?? null);
  if (logoUrl === undefined || bannerUrl === undefined) {
    return fail(400, "invalid_asset", "Invalid logo_url or banner_url");
  }

  // New clients send `join_policy`; deployed ones still send `is_public`
  // (campus-home.tsx:899). Same mapping the trigger uses for a legacy insert.
  let joinPolicy: JoinPolicy = "open";
  if (body.join_policy !== undefined) {
    if (!isJoinPolicy(body.join_policy)) {
      return fail(400, "invalid_join_policy", "Pick who can join: anyone, by request, or by invite.");
    }
    joinPolicy = body.join_policy;
  } else if (body.is_public === false) {
    joinPolicy = "request";
  }

  let audience: OrgAudience = "both";
  if (body.audience !== undefined) {
    if (!isOrgAudience(body.audience)) {
      return fail(400, "invalid_audience", "Pick who the org is open to.");
    }
    audience = body.audience;
  }

  // Org creation is gated on school-verified status. Unverified accounts can
  // still join existing orgs but can't spawn new ones — keeps the directory
  // from being polluted by drive-by signups.
  const service = createSupabaseServiceClient();
  const { data: viewerRow } = await service
    .from("users")
    .select("school_verified, school, school_system, campus_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewerRow?.school_verified) {
    return fail(
      403,
      "school_unverified",
      "Verify your school email before creating an org. (Profile → School verification.)",
    );
  }
  const creatorSystem: SchoolSystem | null = isSchoolSystem(viewerRow.school_system)
    ? viewerRow.school_system
    : null;

  // The owner has to be able to join their own org (spec §3.5 step 8). A
  // creator with no verified university may only pick "both": either concrete
  // audience would exclude them the moment they verified the other one.
  if (audience !== "both" && audience !== creatorSystem) {
    return fail(400, "audience_excludes_owner", audienceExcludesOwnerMessage(creatorSystem));
  }

  if (!HANDLE_RE.test(handle)) {
    return fail(
      400,
      "invalid_handle",
      "Handle must be 3–31 chars, lowercase letters/numbers/_- starting with a letter or digit",
    );
  }
  if (name.length < 2 || name.length > 50) {
    return fail(400, "invalid_name", "Name must be 2–50 characters");
  }
  if (description.length > 400) {
    return fail(400, "invalid_description", "Description must be 400 characters or fewer");
  }

  // Campus stamp. An explicit campus wins (an Indianapolis student may be
  // founding the Kokomo chapter) but must be in the creator's own university;
  // otherwise inherit the creator's home campus. "" / null = campus-less,
  // which is now reachable by link only, never through a campus list.
  const rawCampus =
    body.campus_id !== undefined
      ? body.campus_id
      : body.campus !== undefined
        ? body.campus
        : undefined;
  let campusId: string | null = null;
  if (rawCampus === undefined) {
    campusId = allowedCampusId(viewerRow.campus_id, creatorSystem);
    if (!campusId) {
      // No home campus to inherit (or one outside the creator's university).
      // Refuse instead of minting an org that is listed nowhere and that no
      // deployed surface can give a campus to later — see the docblock.
      return fail(
        400,
        "campus_required",
        "Pick your campus in your profile before creating an org.",
      );
    }
  } else if (rawCampus !== null && rawCampus !== "") {
    const known = typeof rawCampus === "string" ? campusIdFromLegacyLabel(rawCampus) : null;
    if (!known) {
      const { status, body: errBody } = campusScopeError({
        kind: "forbidden",
        reason: "unknown_campus",
      });
      return NextResponse.json(errBody, { status });
    }
    campusId = allowedCampusId(known, creatorSystem);
    if (!campusId) {
      const { status, body: errBody } = campusScopeError({
        kind: "forbidden",
        reason: "campus_not_in_system",
      });
      return NextResponse.json(errBody, { status });
    }
  }
  // Dual-write the legacy label for one release (plan §5.5 step 4). Nothing
  // in `src/` reads `orgs.school` any more; it goes with the M3 cleanup.
  const school = legacyLabel(campusId, creatorSystem);

  // Reject duplicate handle up front for a clean error (the unique constraint
  // would also catch it but with a less friendly message).
  const { data: existing } = await service
    .from("orgs")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (existing) {
    return fail(409, "handle_taken", "That handle is taken");
  }

  // Create the org via service role. Three reasons:
  //  1. We already authenticated the user above and own the `owner_id`
  //     server-side — no RLS guard adds safety here.
  //  2. `join_policy`, `audience` and `campus_id` have no UPDATE/INSERT grant
  //     for `authenticated` (M1c, critic D3): the service role is the only
  //     writer by design.
  //  3. After INSERT, a user-session `.select()` runs through `orgs_select`,
  //     which hides a private org from non-members. The owner has no
  //     `org_members` row YET, so it would return null → a phantom 500.
  //
  // `is_public` is deliberately NOT sent: the `orgs_sync_join_policy` trigger
  // derives it from `join_policy` (spec §2.2).
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .insert({
      handle,
      name,
      description,
      join_policy: joinPolicy,
      audience,
      backdrop_preset: backdrop,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      owner_id: user.id,
      school,
      campus_id: campusId,
    })
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, school, campus_id, join_policy, audience"
    )
    .single();
  if (orgErr || !org) {
    console.error("[orgs POST insert org]", orgErr);
    return fail(500, "create_failed", "Failed to create org");
  }

  // Service role for the rest — owner row + default channels need to land
  // even if RLS gets stricter later (M1c revoked `org_members` INSERT from
  // `authenticated` outright).
  const { error: memberErr } = await service.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });
  if (memberErr) {
    console.error("[orgs POST insert owner member]", memberErr);
    return fail(500, "create_failed", "Failed to add owner row");
  }

  // Auto-create default channels: #general (position 0) and #announcements (position 1).
  // Both public so all members can see/post by default.
  const defaults = [
    { name: "general", position: 0, is_private: false },
    { name: "announcements", position: 1, is_private: false },
  ];
  const { error: channelsErr } = await service.from("channels").insert(
    defaults.map((d) => ({
      org_id: org.id,
      type: "org_channel" as const,
      name: d.name,
      position: d.position,
      is_private: d.is_private,
    }))
  );
  if (channelsErr) {
    console.error("[orgs POST insert default channels]", channelsErr);
    // Non-fatal — the org exists, admins can create channels manually.
  }

  return NextResponse.json({ ok: true, org }, { status: 201 });
}
