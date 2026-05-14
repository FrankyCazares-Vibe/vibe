import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/orgs/[slug]/channels/subscribe-public
 *
 * Idempotently subscribes the viewer to every NON-private channel of
 * this org by upserting channel_members rows. Useful for:
 *
 *   - Members who joined before the auto-subscribe wiring landed.
 *   - Members who want to (re-)pick up newly-created public channels
 *     without admin intervention.
 *   - The "+ Join all public channels" button on /orgs/[handle].
 *
 * Requires the viewer to already be an org member. Returns the count
 * of newly-created subscriptions so the UI can render a meaningful
 * confirmation ("Joined 3 channels").
 */
export async function POST(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
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

  const service = createSupabaseServiceClient();
  const { data: membership } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Join the org first" },
      { status: 403 },
    );
  }

  const { data: channels } = await service
    .from("channels")
    .select("id")
    .eq("org_id", org.id)
    .eq("is_private", false);
  if (!channels || channels.length === 0) {
    return NextResponse.json({ ok: true, subscribed: 0 });
  }

  // Find which ones the user already has a channel_members row for so
  // we can return an accurate "subscribed" count for the toast.
  const ids = channels.map((c) => c.id as string);
  const { data: existing } = await service
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", user.id)
    .in("channel_id", ids);
  const existingSet = new Set(
    (existing ?? []).map((r) => r.channel_id as string),
  );
  const missing = ids.filter((id) => !existingSet.has(id));

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, subscribed: 0 });
  }

  const now = new Date().toISOString();
  const { error } = await service.from("channel_members").upsert(
    missing.map((cid) => ({
      channel_id: cid,
      user_id: user.id,
      role: "member",
      accepted_at: now,
    })),
    { onConflict: "channel_id,user_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[channels.subscribe-public]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, subscribed: missing.length });
}
