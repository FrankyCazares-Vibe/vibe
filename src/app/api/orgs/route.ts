import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
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
  backdrop_preset?: unknown;
  logo_url?: unknown;
  banner_url?: unknown;
};

/**
 * GET /api/orgs?filter=mine|discover&q=<search>
 *
 * - filter=mine (default): orgs the viewer is a member of, with their role.
 * - filter=discover: public orgs the viewer is NOT in, optionally filtered by `q`.
 *
 * Both return [{ id, handle, name, photo, banner, is_public, backdrop_preset,
 * member_count, role? }].
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") === "discover" ? "discover" : "mine";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const includeDormant = url.searchParams.get("include_dormant") === "true";

  if (filter === "mine") {
    const { data, error } = await supabase
      .from("org_members")
      .select(
        "role, org:org_id(id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy)"
      )
      .eq("user_id", user.id);
    if (error) {
      console.error("[orgs GET mine]", error);
      return NextResponse.json({ ok: false, error: "Failed to load orgs" }, { status: 500 });
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
        } | null;
        if (!org) return null;
        return {
          ...org,
          logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
          banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
          role: row.role as string,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ ok: true, orgs });
  }

  // Discover: list ALL orgs (including ones the viewer's already in) so the
  // page can serve double duty as "find new" + "your joined orgs". The card
  // flips its CTA from Join/Request → Joined when `role` comes back set.
  // Private orgs are included so they can be requested. Service role bypasses
  // `orgs_select_visible` RLS, which would otherwise hide private orgs from
  // non-members.
  const { data: myMemberships } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id);
  const roleByOrg = new Map<string, string>();
  for (const m of myMemberships || []) {
    roleByOrg.set(m.org_id as string, m.role as string);
  }

  // Pending join requests block the viewer from re-requesting; they show as
  // "Requested" in the UI.
  const { data: myPending } = await supabase
    .from("org_join_requests")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("status", "pending");
  const pendingIds = new Set((myPending || []).map((r) => r.org_id as string));

  const service = createSupabaseServiceClient();
  // Discover ordering: verified first (top of the feed), then most-recently
  // active. Embed an aggregate org_members count for the card meta. The
  // `relation(count)` shape returns `[{ count: N }]` which we flatten below.
  let query = service
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, members:org_members(count)"
    )
    .order("verified", { ascending: false })
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(120);
  if (q) {
    query = query.or(`handle.ilike.%${q}%,name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[orgs GET discover]", error);
    return NextResponse.json({ ok: false, error: "Failed to load orgs" }, { status: 500 });
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
    return {
      ...rest,
      logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(o.handle, o.banner_url, "banner"),
      member_count: members?.[0]?.count ?? 0,
      pending_request: pendingIds.has(o.id),
      dormant,
      // Viewer's role on this org (null if not a member). Drives the
      // "Joined" / role chip vs Join/Request CTA on the discover card.
      role: roleByOrg.get(o.id) ?? null,
    };
  });
  const visible = includeDormant ? enriched : enriched.filter((o) => !o.dormant);
  return NextResponse.json({ ok: true, orgs: visible.slice(0, 60) });
}

/**
 * POST /api/orgs — create an org. Body:
 *   { handle, name, description?, is_public?, backdrop_preset?, logo_url?, banner_url? }
 *
 * On success creates the org row, an `org_members` row with role='owner' for
 * the creator, and default channels `#general` + `#announcements` (per
 * Stage 6 decision). Default channels are inserted via the service role so
 * they bypass channel RLS — safe because we re-validate viewer ownership
 * before doing it.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const isPublic = body.is_public !== false; // default true
  const backdrop: BackdropKey =
    typeof body.backdrop_preset === "string" &&
    (VALID_BACKDROPS as readonly string[]).includes(body.backdrop_preset)
      ? (body.backdrop_preset as BackdropKey)
      : "sand-purple";
  const logoUrl = typeof body.logo_url === "string" ? body.logo_url : null;
  const bannerUrl = typeof body.banner_url === "string" ? body.banner_url : null;

  // Org creation is gated on school-verified status. Unverified accounts can
  // still join existing orgs but can't spawn new ones — keeps the directory
  // from being polluted by drive-by signups.
  const service = createSupabaseServiceClient();
  const { data: viewerRow } = await service
    .from("users")
    .select("school_verified")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewerRow?.school_verified) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Verify your school email before creating an org. (Profile → School verification.)",
      },
      { status: 403 }
    );
  }

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { ok: false, error: "Handle must be 3–31 chars, lowercase letters/numbers/_- starting with a letter or digit" },
      { status: 400 }
    );
  }
  if (name.length < 2 || name.length > 50) {
    return NextResponse.json(
      { ok: false, error: "Name must be 2–50 characters" },
      { status: 400 }
    );
  }
  if (description.length > 400) {
    return NextResponse.json(
      { ok: false, error: "Description must be 400 characters or fewer" },
      { status: 400 }
    );
  }

  // Reject duplicate handle up front for a clean error (the unique constraint
  // would also catch it but with a less friendly message).
  const { data: existing } = await service
    .from("orgs")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, error: "That handle is taken" }, { status: 409 });
  }

  // Create the org via service role. Two reasons:
  //  1. We already authenticated the user above and own the `owner_id`
  //     server-side — no RLS guard adds safety here.
  //  2. After INSERT, the .select() runs through `orgs_select` RLS, which
  //     hides private orgs from non-members. The owner has no `org_members`
  //     row YET (we insert it next), so a user-session .select() returns
  //     null → caller sees a phantom 500. Service role bypasses that.
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .insert({
      handle,
      name,
      description,
      is_public: isPublic,
      backdrop_preset: backdrop,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      owner_id: user.id,
    })
    .select("id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy")
    .single();
  if (orgErr || !org) {
    console.error("[orgs POST insert org]", orgErr);
    return NextResponse.json({ ok: false, error: "Failed to create org" }, { status: 500 });
  }

  // Service role for the rest — owner row + default channels need to land
  // even if RLS gets stricter later.
  const { error: memberErr } = await service.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });
  if (memberErr) {
    console.error("[orgs POST insert owner member]", memberErr);
    return NextResponse.json({ ok: false, error: "Failed to add owner row" }, { status: 500 });
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
