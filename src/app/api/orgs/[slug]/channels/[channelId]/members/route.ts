import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; channelId: string }> };
type PostBody = { user_id?: unknown; handle?: unknown };

async function requireChannelStaff(slug: string, channelId: string, viewerId: string) {
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) return { error: "Not found", status: 404 } as const;

  const { data: channel } = await service
    .from("channels")
    .select("id, org_id, is_private")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || channel.org_id !== org.id) {
    return { error: "Channel not found", status: 404 } as const;
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (!viewer || !["owner", "admin"].includes(viewer.role)) {
    return { error: "Admin only", status: 403 } as const;
  }

  return { org, channel, service } as const;
}

/**
 * GET /api/orgs/[slug]/channels/[channelId]/members — list users explicitly
 * granted access to a private channel (in addition to staff, who always
 * pass `can_view_org_channel`). Owner/admin only — exposing the access list
 * to regular members would leak who else has been invited.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireChannelStaff(slug, channelId, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { data, error } = await guard.service
    .from("org_channel_members")
    .select(
      "user_id, added_at, users:user_id(id, name, handle, avatar_url, school_verified)"
    )
    .eq("channel_id", channelId)
    .order("added_at", { ascending: true });
  if (error) {
    console.error("[channel/members GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load members" },
      { status: 500 }
    );
  }

  const rows = (data || []).map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    return {
      user_id: r.user_id as string,
      added_at: r.added_at as string,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
    };
  });

  return NextResponse.json({ ok: true, members: rows });
}

/**
 * POST /api/orgs/[slug]/channels/[channelId]/members
 * Body: { user_id } OR { handle } — the latter is a convenience for the UI's
 * member typeahead so the client doesn't have to resolve the handle first.
 *
 * Validation:
 *  - The target user must already be a member of the org. Granting access
 *    to a non-member is meaningless (they wouldn't pass `is_org_member`).
 *  - The channel must belong to the org and ideally be private (granting
 *    access to a public channel is harmless but not useful).
 */
export async function POST(req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireChannelStaff(slug, channelId, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let targetUserId: string | null = null;
  if (typeof body.user_id === "string") {
    targetUserId = body.user_id;
  } else if (typeof body.handle === "string" && body.handle.trim()) {
    const { data: u } = await guard.service
      .from("users")
      .select("id")
      .eq("handle", body.handle.trim().toLowerCase())
      .maybeSingle();
    if (!u) {
      return NextResponse.json(
        { ok: false, error: "No user with that handle" },
        { status: 404 }
      );
    }
    targetUserId = u.id as string;
  }
  if (!targetUserId) {
    return NextResponse.json(
      { ok: false, error: "Provide user_id or handle" },
      { status: 400 }
    );
  }

  // Target must be an org member.
  const { data: orgMember } = await guard.service
    .from("org_members")
    .select("user_id")
    .eq("org_id", guard.org.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!orgMember) {
    return NextResponse.json(
      { ok: false, error: "User must join the org first" },
      { status: 400 }
    );
  }

  // Idempotent: if they already have access, return ok.
  const { data: existing } = await guard.service
    .from("org_channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, granted: true });
  }

  const { error } = await guard.service.from("org_channel_members").insert({
    channel_id: channelId,
    user_id: targetUserId,
    added_by: user.id,
  });
  if (error) {
    console.error("[channel/members POST]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to grant access" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, granted: true });
}
