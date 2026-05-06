import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = { verified?: unknown };

/**
 * POST /api/admin/orgs/[slug]/verify
 * Body: { verified: boolean }
 *
 * Flips orgs.verified — the only knob that matters for Discover ranking
 * (verified orgs sit on top + are exempt from dormancy decay). Platform-
 * admin only; bootstrap by setting `users.is_platform_admin = true` on the
 * founder's row in Supabase SQL editor.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: viewerRow } = await service
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewerRow?.is_platform_admin) {
    return NextResponse.json(
      { ok: false, error: "Platform admin only" },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.verified !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "verified must be a boolean" },
      { status: 400 }
    );
  }

  const { data, error } = await service
    .from("orgs")
    .update({ verified: body.verified })
    .eq("handle", slug)
    .select("id, handle, verified")
    .single();
  if (error || !data) {
    console.error("[admin/orgs/[slug]/verify POST]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update verified status" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, org: data });
}
