import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const WINDOW_DAYS = 60;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_LOCATION = 200;

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
 * Upcoming events at the viewer's school. Each row carries:
 *   - org info (logo signed via proxy) when scoped to a community
 *   - going_count + interested_count
 *   - viewer_status: 'going' | 'maybe' | null  (mapped to UI labels)
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

  const nowIso = new Date().toISOString();
  const horizonIso = new Date(
    Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Inner-join the creator and filter on creator.school so we only show
  // events from peers at the same school. Mirror /api/feed's pattern.
  let q = supabase
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

  if (orgIdFilter) {
    // Org-scoped query: skip the school filter so visitors from other
    // schools can still see this org's events.
    q = q.eq("org_id", orgIdFilter);
  } else if (school) {
    q = q.eq("creator.school", school);
  } else {
    q = q.eq("creator_id", user.id);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[events GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data as unknown as EventRow[]) ?? [];
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

  return NextResponse.json({ ok: true, events, school });
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
    return NextResponse.json({ ok: false, error: orgErr.message }, { status: 500 });
  }
  if (mErr) {
    console.error("[events POST org membership]", mErr);
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
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
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, event: row });
}
