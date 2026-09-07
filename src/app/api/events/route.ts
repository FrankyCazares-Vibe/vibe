import { NextResponse } from "next/server";

import { campusOrFilter, resolveCampusScope } from "@/lib/iu/campus-scope";
import { ALL_CAMPUSES } from "@/lib/iu/campuses";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
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
  } | null;
  org: {
    id: string;
    handle: string;
    name: string;
    logo_url: string | null;
    verified: boolean;
  } | null;
};

type CreateEventBody = {
  title?: unknown;
  description?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  location?: unknown;
  org_id?: unknown;
};

/**
 * GET /api/events?limit=&org_id=&campus=<id|all>
 *
 * Upcoming events, hard-scoped to a campus. Each row carries:
 *   - org info (logo signed via proxy) when scoped to a community
 *   - going_count + interested_count
 *   - viewer_status: 'going' | 'maybe' | null  (mapped to UI labels)
 *
 * The response also carries `viewerCampus` + `campusScope` (see
 * lib/iu/campus-scope.ts for the shared query contract) and keeps the legacy
 * `school` field for existing clients.
 *
 * CAMPUS OF AN EVENT = the campus of its ORG, falling back to the creator's
 * campus only for org-less (legacy) events. Scoping by the creator alone
 * mis-filed any event an admin posted for a chapter on another campus.
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
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  // ?org_id=<uuid> — limit results to events scoped to a single org.
  // Used by the org profile page; bypasses the school filter so a
  // logged-in user from another school can still see public events.
  const orgIdFilter = (url.searchParams.get("org_id") ?? "").trim();

  const { data: me } = await supabase
    .from("users")
    .select("school")
    .eq("id", user.id)
    .single();
  const school = (me?.school ?? "").trim();

  const scope = resolveCampusScope(url.searchParams.get("campus"), school);
  if (!scope.ok) {
    return NextResponse.json(
      { ok: false, error: scope.error, viewerCampus: scope.viewerCampus },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Inner-join the creator so the org-less fallback can filter on
  // creator.school. Mirror /api/feed's embed pattern.
  const baseQuery = () =>
    supabase
      .from("events")
      .select(
        "id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at," +
          "creator:users!events_creator_id_fkey!inner(id,name,handle,avatar_url,school)," +
          "org:orgs(id,handle,name,logo_url,verified)",
      )
      .gte("ends_at", nowIso)
      .lte("starts_at", horizonIso)
      .order("starts_at", { ascending: true })
      .limit(limit);

  const failed = () =>
    NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

  let rows: EventRow[] = [];
  let campusScope = scope.scope;

  if (orgIdFilter) {
    // Org-scoped query: skip campus filtering entirely so a visitor from
    // another campus can still see this org's events on its profile page.
    campusScope = ALL_CAMPUSES;
    const { data, error } = await baseQuery().eq("org_id", orgIdFilter);
    if (error) {
      console.error("[events GET org-scoped]", error);
      return failed();
    }
    rows = (data as unknown as EventRow[]) ?? [];
  } else if (!scope.campusLabel) {
    // `?campus=all`, or a viewer who never picked a campus. Show everything.
    // (The old code fell back to `creator_id = me` here, so a user without a
    // campus only ever saw their OWN events — that is why the page looked
    // empty for all eight live accounts.)
    const { data, error } = await baseQuery();
    if (error) {
      console.error("[events GET unscoped]", error);
      return failed();
    }
    rows = (data as unknown as EventRow[]) ?? [];
  } else {
    const label = scope.campusLabel;
    // PostgREST cannot OR across two embedded relations in one request, so
    // this runs as two queries merged in memory:
    //   (A) events whose ORG sits on this campus  — the normal case
    //   (B) org-less events whose CREATOR does    — legacy rows only, since
    //       POST now requires an org_id
    // Each side is already ordered by starts_at and capped at `limit`, so
    // sorting the union and taking the first `limit` rows yields exactly what
    // a single query would have returned.
    //
    // Org ids are resolved with the service role on purpose: `orgs` RLS hides
    // private orgs from non-members, and dropping their events here would
    // silently shrink the campus list relative to the old creator.school
    // filter. Only ids leave this query; the events themselves are still read
    // under the viewer's own RLS.
    const service = createSupabaseServiceClient();
    const { data: campusOrgs, error: orgErr } = await service
      .from("orgs")
      .select("id")
      .or(campusOrFilter("school", label))
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
        .or(campusOrFilter("school", label), { referencedTable: "creator" }),
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
    const [allRsvps, mineRsvps] = await Promise.all([
      supabase.from("rsvps").select("event_id,status").in("event_id", eventIds),
      supabase
        .from("rsvps")
        .select("event_id,status")
        .in("event_id", eventIds)
        .eq("user_id", user.id),
    ]);
    for (const row of allRsvps.data ?? []) {
      const r = row as { event_id: string; status: string };
      if (r.status === "going") {
        goingByEvent.set(r.event_id, (goingByEvent.get(r.event_id) ?? 0) + 1);
      } else if (r.status === "maybe") {
        maybeByEvent.set(r.event_id, (maybeByEvent.get(r.event_id) ?? 0) + 1);
      }
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
    return {
      ...row,
      going_count: goingByEvent.get(row.id) ?? 0,
      interested_count: maybeByEvent.get(row.id) ?? 0,
      viewer_status: viewerStatusByEvent.get(row.id) ?? null,
      is_creator: isCreator,
      viewer_can_manage: isCreator || isOrgAdmin,
      org: row.org
        ? { ...row.org, logo_url: orgAssetProxyUrl(row.org.handle, row.org.logo_url, "logo") }
        : null,
    };
  });

  return NextResponse.json({
    ok: true,
    events,
    // `school` kept for existing clients; `viewerCampus` is the
    // canonical form (null when the account has no recognized campus).
    school,
    viewerCampus: scope.viewerCampus,
    campusScope,
  });
}

/**
 * Create an event. Currently any authenticated user can create one; org
 * scoping is opt-in via `org_id` (must belong to an org you own/admin —
 * verified server-side).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: CreateEventBody;
  try {
    body = (await req.json()) as CreateEventBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const startsAt = typeof body.starts_at === "string" ? body.starts_at.trim() : "";
  const endsAt = typeof body.ends_at === "string" ? body.ends_at.trim() : "";

  if (!title) {
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  }
  if (title.length > MAX_TITLE) {
    return NextResponse.json(
      { ok: false, error: `Title exceeds ${MAX_TITLE} characters` },
      { status: 400 },
    );
  }
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { ok: false, error: `Description exceeds ${MAX_DESCRIPTION} characters` },
      { status: 400 },
    );
  }
  if (location.length > MAX_LOCATION) {
    return NextResponse.json(
      { ok: false, error: `Location exceeds ${MAX_LOCATION} characters` },
      { status: 400 },
    );
  }
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json(
      { ok: false, error: "Start and end times are required" },
      { status: 400 },
    );
  }
  if (end < start) {
    return NextResponse.json(
      { ok: false, error: "End time must be after start" },
      { status: 400 },
    );
  }
  if (start < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json(
      { ok: false, error: "Start time is in the past" },
      { status: 400 },
    );
  }

  // Events must be posted on behalf of a verified org. Verified status
  // is platform-admin-controlled (see /admin) so this gates spam without
  // demanding an approval queue per event.
  const rawOrgId = typeof body.org_id === "string" ? body.org_id.trim() : "";
  if (!rawOrgId) {
    return NextResponse.json(
      { ok: false, error: "Events must be posted on behalf of a verified org" },
      { status: 400 },
    );
  }
  const [{ data: org, error: orgErr }, { data: membership, error: mErr }] = await Promise.all([
    supabase.from("orgs").select("id,verified").eq("id", rawOrgId).maybeSingle(),
    supabase
      .from("org_members")
      .select("role")
      .eq("org_id", rawOrgId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (orgErr) {
    console.error("[events POST org]", orgErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (mErr) {
    console.error("[events POST org membership]", mErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json({ ok: false, error: "Org not found" }, { status: 404 });
  }
  if (!org.verified) {
    return NextResponse.json(
      { ok: false, error: "Only verified orgs can post events" },
      { status: 403 },
    );
  }
  const role = membership?.role ?? null;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "You can't post events on behalf of that org" },
      { status: 403 },
    );
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
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: row });
}
