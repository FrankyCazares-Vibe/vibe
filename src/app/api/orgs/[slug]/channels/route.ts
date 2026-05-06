import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const CHANNEL_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;

type Params = { params: Promise<{ slug: string }> };
type CreateBody = {
  name?: unknown;
  topic?: unknown;
  is_private?: unknown;
  position?: unknown;
};

/**
 * GET /api/orgs/[slug]/channels — list visible channels for this org. RLS
 * filters out private channels for non-staff via can_view_org_channel().
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("channels")
    .select("id, name, topic, is_private, pinned, position, created_at, parent_channel_id")
    .eq("org_id", org.id)
    .order("pinned", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[orgs/[slug]/channels GET]", error);
    return NextResponse.json({ ok: false, error: "Failed to load channels" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, channels: data || [] });
}

/**
 * POST /api/orgs/[slug]/channels — create a channel. Admin/owner only.
 * Body: { name, topic?, is_private?, position? }
 *
 * `name` must be slug-shaped (lowercase, 2–31 chars, alphanumeric/_-) so it
 * renders cleanly as `#name`. Within an org, channel names must be unique.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
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

  const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : null;
  const isPrivate = body.is_private === true;
  const position = typeof body.position === "number" ? body.position : 100;

  if (!CHANNEL_NAME_RE.test(name)) {
    return NextResponse.json(
      { ok: false, error: "Channel name must be 2–31 chars, lowercase letters/numbers/_-" },
      { status: 400 }
    );
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Permission check via the helper (admin/owner only for create).
  const service = createSupabaseServiceClient();
  const { data: roleRow } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!roleRow || !["owner", "admin"].includes(roleRow.role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  // Check name uniqueness within the org.
  const { data: nameClash } = await service
    .from("channels")
    .select("id")
    .eq("org_id", org.id)
    .eq("name", name)
    .maybeSingle();
  if (nameClash) {
    return NextResponse.json({ ok: false, error: "Channel name already exists" }, { status: 409 });
  }

  const { data: created, error } = await service
    .from("channels")
    .insert({
      org_id: org.id,
      type: "org_channel",
      name,
      topic,
      is_private: isPrivate,
      position,
    })
    .select("id, name, topic, is_private, pinned, position, created_at")
    .single();
  if (error || !created) {
    console.error("[orgs/[slug]/channels POST]", error);
    return NextResponse.json({ ok: false, error: "Failed to create channel" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, channel: created }, { status: 201 });
}
