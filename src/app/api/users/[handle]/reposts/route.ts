import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ handle: string }> };

type EmbeddedOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
} | null;

type EmbeddedAuthor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
} | null;

type EmbeddedPost = {
  id: string;
  user_id: string;
  org_id: string | null;
  type: "post" | "clip";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  view_count: number | null;
  created_at: string;
  author: EmbeddedAuthor;
  org: EmbeddedOrg;
};

type RepostRow = {
  post_id: string;
  user_id: string;
  comment: string | null;
  created_at: string;
  post: EmbeddedPost | null;
};

/**
 * Reposts by a user, newest first. Each row carries the embedded original
 * post so the profile pane can render it inline (matching the campus feed
 * repost banner shape).
 */
export async function GET(req: Request, ctx: RouteContext) {
  const { handle: rawHandle } = await ctx.params;
  const handle = (rawHandle || "").trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: target, error: tErr } = await supabase
    .from("users")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (tErr) {
    console.error("[users/:handle/reposts target]", tErr);
    return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const { data, error } = await supabase
    .from("post_reposts")
    .select(
      "post_id,user_id,comment,created_at," +
        "post:posts!inner(" +
        "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at," +
        "author:users!posts_user_id_fkey(id,name,handle,avatar_url)," +
        "org:orgs(id,handle,name,logo_url,verified,is_public)" +
        ")",
    )
    .eq("user_id", target.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Table may not exist yet on a stale deploy — degrade to empty list.
    console.error("[users/:handle/reposts]", error);
    return NextResponse.json({ ok: true, reposts: [] });
  }

  const reposts = ((data as unknown as RepostRow[]) ?? [])
    .filter((r) => r.post)
    .map((r) => {
      const p = r.post as EmbeddedPost;
      const org = p.org ?? null;
      return {
        post_id: r.post_id,
        comment: r.comment,
        reposted_at: r.created_at,
        post: {
          ...p,
          view_count: p.view_count ?? 0,
          media_url: postMediaProxyUrl(p.id, p.media_url, "media"),
          media_thumbnail_url: postMediaProxyUrl(
            p.id,
            p.media_thumbnail_url,
            "thumbnail",
          ),
          org: org
            ? { ...org, logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo") }
            : null,
        },
      };
    });

  return NextResponse.json({ ok: true, reposts });
}
