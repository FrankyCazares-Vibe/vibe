import { NextResponse } from "next/server";

import { CLIP_KEY_PREFIX, isR2Configured, signClipGetUrl } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VIEW_TTL_SEC = 5 * 60;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Mints a short-lived (5 min) signed R2 GET URL for a clip post. The DB
 * stores the R2 object key (not a URL) per the rules in src/lib/r2.ts —
 * each viewer needs to ask for a fresh signed URL on demand. Same auth
 * gate as posts_select_authenticated: any signed-in user can read.
 *
 * View tracking (clip_views table) is a future ticket — this route just
 * issues the URL. Callers should treat the response as the "open clip"
 * intent if/when we add analytics.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing clip id" }, { status: 400 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "Clip storage not configured" },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("posts")
    .select("id,type,media_url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[clips/:id/view-url GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Clip not found" }, { status: 404 });
  }
  if (row.type !== "clip") {
    return NextResponse.json({ ok: false, error: "Not a clip" }, { status: 400 });
  }
  const objectKey = String(row.media_url || "").trim();
  if (!objectKey.startsWith(CLIP_KEY_PREFIX)) {
    // Defensive: a clip row must point at a clips/ object. If not, the
    // upload pipeline broke somewhere — surface it instead of silently
    // signing whatever string is in the column.
    return NextResponse.json(
      { ok: false, error: "Clip storage key invalid" },
      { status: 500 },
    );
  }

  try {
    const url = await signClipGetUrl(objectKey, VIEW_TTL_SEC);
    return NextResponse.json({
      ok: true,
      url,
      expiresAt: new Date(Date.now() + VIEW_TTL_SEC * 1000).toISOString(),
    });
  } catch (err) {
    console.error("[clips/:id/view-url sign]", err);
    const message = err instanceof Error ? err.message : "Could not sign URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
