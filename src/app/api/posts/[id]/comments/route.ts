import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT = 1000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type RouteContext = { params: Promise<{ id: string }> };
type CommentBody = { content?: unknown };

/** Flat comment thread, oldest-first so the conversation reads top-to-bottom. */
export async function GET(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const { data, error } = await supabase
    .from("post_comments")
    .select(
      "id,post_id,user_id,content,created_at," +
        "author:users!inner(id,name,handle,avatar_url)",
    )
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[posts/:id/comments GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, comments: data ?? [] });
}

/** Insert a comment. Returns the row with the author joined for instant render. */
export async function POST(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CommentBody;
  try {
    body = (await req.json()) as CommentBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ ok: false, error: "Comment is empty" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json(
      { ok: false, error: `Comment exceeds ${MAX_CONTENT} characters` },
      { status: 400 },
    );
  }

  const { data: row, error } = await supabase
    .from("post_comments")
    .insert({ post_id: id, user_id: user.id, content })
    .select(
      "id,post_id,user_id,content,created_at," +
        "author:users!inner(id,name,handle,avatar_url)",
    )
    .single();

  if (error || !row) {
    console.error("[posts/:id/comments POST]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, comment: row });
}
