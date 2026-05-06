import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = {
  type?: unknown;
  content?: unknown;
  media_url?: unknown;
  media_thumbnail_url?: unknown;
};

const MAX_CONTENT = 2000;

/**
 * POST /api/orgs/[slug]/posts
 * Body: { type: 'post' | 'clip', content?, media_url?, media_thumbnail_url? }
 *
 * Creates a row in `public.posts` with `org_id` set to this org. The author
 * (`user_id`) is the current viewer — posts always have a real human author
 * so likes/comments/mentions still attribute correctly. The org tag is what
 * makes it surface on the org's profile + give the campus feed an
 * "Org · @handle" attribution.
 *
 * Permissions: owner / admin only. Mods can chat in channels but don't
 * speak as the org publicly.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { ok: false, error: "Only owner / admin can post as the org" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type === "clip" ? "clip" : "post";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const mediaUrl =
    typeof body.media_url === "string" ? body.media_url.trim() : "";
  const mediaThumb =
    typeof body.media_thumbnail_url === "string"
      ? body.media_thumbnail_url.trim()
      : "";

  if (!content && !mediaUrl) {
    return NextResponse.json(
      { ok: false, error: "Add text or media before posting" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json(
      { ok: false, error: `Content exceeds ${MAX_CONTENT} characters` },
      { status: 400 },
    );
  }
  if (type === "clip" && !mediaUrl) {
    return NextResponse.json(
      { ok: false, error: "Clip requires a video upload" },
      { status: 400 },
    );
  }

  const { data: row, error } = await service
    .from("posts")
    .insert({
      user_id: user.id,
      org_id: org.id,
      type,
      content,
      media_url: mediaUrl || null,
      media_thumbnail_url: mediaThumb || mediaUrl || null,
    })
    .select(
      "id, user_id, org_id, type, content, media_url, media_thumbnail_url, created_at"
    )
    .single();
  if (error || !row) {
    console.error("[orgs/[slug]/posts POST]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, post: row }, { status: 201 });
}
