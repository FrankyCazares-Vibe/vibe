import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const CHANNEL_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,30}$/;
const MIN_POSITION = 0;
const MAX_POSITION = 10000;

type Params = { params: Promise<{ slug: string; channelId: string }> };
type PatchBody = {
  name?: unknown;
  topic?: unknown;
  is_private?: unknown;
  position?: unknown;
  pinned?: unknown;
};

async function requireStaff(slug: string, channelId: string, viewerId: string) {
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
 * PATCH /api/orgs/[slug]/channels/[channelId]
 * Body: { name?, topic?, is_private?, position? }
 * Permissions: owner/admin only.
 *
 * Renames must stay slug-shaped + unique within the org.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, channelId, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const v = body.name.trim().toLowerCase();
    if (!CHANNEL_NAME_RE.test(v)) {
      return NextResponse.json(
        { ok: false, error: "Channel name must be 2–31 chars, lowercase letters/numbers/_-" },
        { status: 400 }
      );
    }
    // Uniqueness within the org (excluding self).
    const { data: clash } = await guard.service
      .from("channels")
      .select("id")
      .eq("org_id", guard.org.id)
      .eq("name", v)
      .neq("id", channelId)
      .maybeSingle();
    if (clash) {
      return NextResponse.json({ ok: false, error: "Channel name already exists" }, { status: 409 });
    }
    patch.name = v;
  }

  if (typeof body.topic === "string" || body.topic === null) {
    patch.topic = typeof body.topic === "string" ? body.topic.slice(0, 200) : null;
  }
  if (typeof body.is_private === "boolean") {
    patch.is_private = body.is_private;
  }
  if (body.position !== undefined) {
    const pos = body.position;
    if (
      typeof pos !== "number" ||
      !Number.isInteger(pos) ||
      pos < MIN_POSITION ||
      pos > MAX_POSITION
    ) {
      return NextResponse.json(
        { ok: false, error: `position must be an integer ${MIN_POSITION}–${MAX_POSITION}` },
        { status: 400 }
      );
    }
    patch.position = pos;
  }
  if (typeof body.pinned === "boolean") {
    patch.pinned = body.pinned;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data: updated, error } = await guard.service
    .from("channels")
    .update(patch)
    .eq("id", channelId)
    .select("id, name, topic, is_private, pinned, position, created_at, parent_channel_id")
    .single();
  if (error || !updated) {
    console.error("[orgs/[slug]/channels/[channelId] PATCH]", error);
    return NextResponse.json({ ok: false, error: "Failed to update channel" }, { status: 500 });
  }

  // Public → private flip: drop the legacy auto-subscription rows. Every
  // org member got a `channel_members` row while the channel was public;
  // leaving them would keep read access through older policies. Owner /
  // admin still auto-pass via can_view_org_channel; everyone else must be
  // re-added to the explicit allow list.
  if (patch.is_private === true && guard.channel.is_private === false) {
    const { error: purgeErr } = await guard.service
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId);
    if (purgeErr) {
      console.error("[orgs/[slug]/channels/[channelId] PATCH purge-members]", purgeErr);
    }
  }
  return NextResponse.json({ ok: true, channel: updated });
}

/**
 * DELETE /api/orgs/[slug]/channels/[channelId]
 * Permissions: owner/admin only. Cascades to messages (FK ON DELETE CASCADE
 * on messages.channel_id, set up in the original Phase 1 schema).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireStaff(slug, channelId, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { error } = await guard.service.from("channels").delete().eq("id", channelId);
  if (error) {
    console.error("[orgs/[slug]/channels/[channelId] DELETE]", error);
    return NextResponse.json({ ok: false, error: "Failed to delete channel" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
