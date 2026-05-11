import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

/**
 * Unified typeahead search across people, orgs, and events. Powers the
 * profile + campus search bars so a single dropdown can surface every
 * kind of entity Vibe knows about.
 *
 * - Auth required.
 * - `kinds=` optional CSV; defaults to "users,orgs,events". Lets a caller
 *   restrict the fan-out (e.g. mention pickers).
 * - Each kind capped at `limit` (default 6) so the dropdown stays short.
 * - Events scoped to the viewer's school via creator.school (mirrors
 *   /api/feed + /api/events). Past events are excluded.
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

  // Escape ILIKE wildcards in the user input so a literal `%` isn't a
  // free-form glob. % and _ are the only metacharacters in LIKE.
  const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
  const prefixPattern = `${safe}%`;
  const containsPattern = `%${safe}%`;

  const service = createSupabaseServiceClient();

  // Fan out everything in parallel. Each branch is independently typed so
  // a failure in one doesn't poison the others.
  const [usersPrefixRes, usersContainsRes, orgsRes, eventsRes, blockRowsRes, viewerRes] =
    await Promise.all([
      wantUsers
        ? supabase
            .from("users")
            .select("id,name,handle,school,major,year,avatar_url")
            .neq("id", user.id)
            .or(`name.ilike.${prefixPattern},handle.ilike.${prefixPattern}`)
            .limit(limit)
        : Promise.resolve({ data: [], error: null } as const),
      wantUsers
        ? supabase
            .from("users")
            .select("id,name,handle,school,major,year,avatar_url")
            .neq("id", user.id)
            .or(`name.ilike.${containsPattern},handle.ilike.${containsPattern}`)
            .limit(limit)
        : Promise.resolve({ data: [], error: null } as const),
      wantOrgs
        ? service
            .from("orgs")
            .select(
              "id,handle,name,description,logo_url,banner_url,is_public,verified,members:org_members(count)",
            )
            .or(`handle.ilike.${containsPattern},name.ilike.${containsPattern}`)
            .order("verified", { ascending: false })
            .limit(limit)
        : Promise.resolve({ data: [], error: null } as const),
      wantEvents
        ? supabase
            .from("events")
            .select(
              "id,title,description,starts_at,ends_at,location," +
                "creator:users!events_creator_id_fkey!inner(id,school)," +
                "org:orgs(id,handle,name,logo_url,verified)",
            )
            .gte("ends_at", new Date().toISOString())
            .or(`title.ilike.${containsPattern},description.ilike.${containsPattern}`)
            .order("starts_at", { ascending: true })
            .limit(limit)
        : Promise.resolve({ data: [], error: null } as const),
      wantUsers
        ? supabase
            .from("blocks")
            .select("blocker_id, blocked_id")
            .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)
        : Promise.resolve({ data: [], error: null } as const),
      wantEvents
        ? supabase.from("users").select("school").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
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
    const seen = new Set<string>();
    const lists = [
      (usersPrefixRes.data ?? []) as UserRow[],
      (usersContainsRes.data ?? []) as UserRow[],
    ];
    for (const list of lists) {
      for (const u of list) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        users.push(u);
        if (users.length >= limit) break;
      }
      if (users.length >= limit) break;
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
    for (let i = users.length - 1; i >= 0; i--) {
      if (hidden.has(users[i]!.id)) users.splice(i, 1);
    }

    // Annotate each result with the viewer's relationship state.
    if (users.length > 0) {
      const ids = users.map((u) => u.id);
      const [outRes, inRes] = await Promise.all([
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
      const outgoing = new Set((outRes.data ?? []).map((r) => r.following_id as string));
      const incoming = new Set((inRes.data ?? []).map((r) => r.follower_id as string));
      for (const u of users) {
        const a = outgoing.has(u.id);
        const b = incoming.has(u.id);
        u.rel = a && b ? "connected" : a ? "following" : b ? "followed_by" : "none";
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
    creator: { id: string; school: string | null } | null;
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
    const viewerSchool = ((viewerRes.data as { school?: string | null } | null)?.school ?? "").trim();
    const rows = (eventsRes.data ?? []) as unknown as EventRow[];
    for (const r of rows) {
      // Inner-join above already required `creator.school` to exist; if
      // the viewer has a school, restrict to peers at the same school.
      if (viewerSchool && r.creator?.school !== viewerSchool) continue;
      eventsOut.push({
        id: r.id,
        title: r.title,
        description: r.description,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        location: r.location,
        org: r.org
          ? {
              ...r.org,
              logo_url: orgAssetProxyUrl(r.org.handle, r.org.logo_url, "logo"),
            }
          : null,
      });
      if (eventsOut.length >= limit) break;
    }
  }

  return NextResponse.json({ ok: true, users, orgs: orgsOut, events: eventsOut });
}
