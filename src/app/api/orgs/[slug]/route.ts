import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const VALID_BACKDROPS = [
  "cream",
  "sand-purple",
  "ember",
  "deep-violet",
  "forest",
  "midnight",
] as const;

type Params = { params: Promise<{ slug: string }> };

type UpdateBody = {
  name?: unknown;
  description?: unknown;
  backdrop_preset?: unknown;
  logo_url?: unknown;
  banner_url?: unknown;
  is_public?: unknown;
  links?: unknown;
  philanthropy?: unknown;
};

type LinkRow = { label: string; url: string };

const URL_RE = /^https?:\/\/[^\s]{3,}$/i;

// Sanitize the public-facing links array. Drops anything malformed silently
// rather than 400-ing — keeps a typo from blocking the rest of the save.
function sanitizeLinks(input: unknown): LinkRow[] | null {
  if (input === null) return [];
  if (!Array.isArray(input)) return null;
  const out: LinkRow[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    const url = typeof r.url === "string" ? r.url.trim().slice(0, 400) : "";
    if (!label || !URL_RE.test(url)) continue;
    out.push({ label, url });
    if (out.length >= 10) break; // hard cap
  }
  return out;
}

/**
 * GET /api/orgs/[slug] — org detail with viewer's role + member count + pending
 * request status. RLS handles visibility (private orgs only return for members).
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: org, error } = await supabase
    .from("orgs")
    .select(
      "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, owner_id, created_at"
    )
    .eq("handle", slug)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug] GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to load org" }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Viewer's role + pending request, if any. Service role so we can read these
  // without leaking row data through RLS edge cases.
  const service = createSupabaseServiceClient();
  const [{ data: myMembership }, { data: pendingReq }, { count }] = await Promise.all([
    service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("org_join_requests")
      .select("id, status, requested_at")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle(),
    service
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id),
  ]);

  return NextResponse.json({
    ok: true,
    org: {
      ...org,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
      member_count: count ?? 0,
      viewer_role: myMembership?.role ?? null,
      pending_request: pendingReq ?? null,
    },
  });
}

/**
 * PATCH /api/orgs/[slug] — update org metadata.
 * Owner or admin only (RLS enforces).
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (v.length < 2 || v.length > 80) {
      return NextResponse.json({ ok: false, error: "Name must be 2–80 chars" }, { status: 400 });
    }
    patch.name = v;
  }
  if (typeof body.description === "string") {
    const v = body.description.trim();
    if (v.length > 400) {
      return NextResponse.json({ ok: false, error: "Description too long" }, { status: 400 });
    }
    patch.description = v;
  }
  if (
    typeof body.backdrop_preset === "string" &&
    (VALID_BACKDROPS as readonly string[]).includes(body.backdrop_preset)
  ) {
    patch.backdrop_preset = body.backdrop_preset;
  }
  if (typeof body.logo_url === "string" || body.logo_url === null) {
    patch.logo_url = body.logo_url;
  }
  if (typeof body.banner_url === "string" || body.banner_url === null) {
    patch.banner_url = body.banner_url;
  }
  if (typeof body.is_public === "boolean") {
    patch.is_public = body.is_public;
  }
  if (body.links !== undefined) {
    const sanitized = sanitizeLinks(body.links);
    if (sanitized === null) {
      return NextResponse.json({ ok: false, error: "links must be an array" }, { status: 400 });
    }
    patch.links = sanitized;
  }
  if (typeof body.philanthropy === "string") {
    patch.philanthropy = body.philanthropy.trim().slice(0, 1000);
  }
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data: org, error } = await supabase
    .from("orgs")
    .update(patch)
    .eq("handle", slug)
    .select("id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy")
    .single();
  if (error || !org) {
    console.error("[orgs/[slug] PATCH]", error);
    return NextResponse.json({ ok: false, error: "Failed to update" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    org: {
      ...org,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
    },
  });
}

/**
 * DELETE /api/orgs/[slug] — owner-only deletion. Cascades to org_members,
 * channels, and join requests via FK ON DELETE CASCADE.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("orgs").delete().eq("handle", slug);
  if (error) {
    console.error("[orgs/[slug] DELETE]", error);
    return NextResponse.json({ ok: false, error: "Failed to delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
