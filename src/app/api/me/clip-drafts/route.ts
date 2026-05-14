import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lists the signed-in user's clip drafts, newest first. Each row
 * carries enough to render a thumbnail tile + resume the composer
 * without a second fetch. Hard cap of 50 — the drafts box is meant
 * for in-progress clips, not unlimited storage.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("posts")
    .select(
      "id,content,tags,media_url,media_thumbnail_url,edit_metadata,created_at",
    )
    .eq("user_id", user.id)
    .eq("type", "clip")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[clip-drafts GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, drafts: data ?? [] });
}
