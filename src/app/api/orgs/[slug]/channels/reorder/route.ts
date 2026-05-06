import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = { channel_ids?: unknown };

/**
 * POST /api/orgs/[slug]/channels/reorder
 * Body: { channel_ids: ["uuid-a", "uuid-b", ...] }
 *
 * Writes `position = index` for each id in order. Channels that exist in the
 * org but aren't listed are left alone — this lets the client send a partial
 * order (e.g. only the visible/non-pinned section) without disturbing
 * everything else.
 *
 * Permissions: owner/admin only.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(body.channel_ids) ||
    body.channel_ids.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { ok: false, error: "channel_ids must be an array of strings" },
      { status: 400 }
    );
  }
  const channelIds = body.channel_ids as string[];
  if (channelIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const service = createSupabaseServiceClient();

  const { data: org } = await service
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer || !["owner", "admin"].includes(viewer.role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  // Reject any id that doesn't belong to this org — protects against
  // accidentally writing positions onto someone else's channels.
  const { data: belongs } = await service
    .from("channels")
    .select("id")
    .eq("org_id", org.id)
    .in("id", channelIds);
  const valid = new Set((belongs || []).map((r) => r.id as string));
  const filtered = channelIds.filter((id) => valid.has(id));
  if (filtered.length !== channelIds.length) {
    return NextResponse.json(
      { ok: false, error: "One or more channel ids don't belong to this org" },
      { status: 400 }
    );
  }

  // No bulk-update-with-different-values shortcut in the JS client, so issue
  // one UPDATE per channel. Tens of channels max — fine. If this ever needs
  // to scale, swap to a stored procedure that accepts an ordered array.
  await Promise.all(
    filtered.map((id, idx) =>
      service.from("channels").update({ position: idx }).eq("id", id)
    )
  );

  return NextResponse.json({ ok: true });
}
