import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT_CHARS = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;

type PublishPostBody = {
  content?: unknown;
  tags?: unknown;
  media_url?: unknown;
  media_thumbnail_url?: unknown;
};

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().replace(/^#+/, "");
    if (!t || t.length > MAX_TAG_LEN) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Publish a text/image post (P1-017). Returns the inserted row. */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: PublishPostBody;
  try {
    body = (await req.json()) as PublishPostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const mediaUrl = typeof body.media_url === "string" ? body.media_url.trim() : "";
  const mediaThumb =
    typeof body.media_thumbnail_url === "string" ? body.media_thumbnail_url.trim() : "";

  if (!content && !mediaUrl) {
    return NextResponse.json(
      { ok: false, error: "Post needs text or an image" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Content exceeds ${MAX_CONTENT_CHARS} characters` },
      { status: 400 },
    );
  }

  const tags = normalizeTags(body.tags);

  const { data: row, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      type: "post",
      content,
      tags,
      media_url: mediaUrl || null,
      media_thumbnail_url: mediaThumb || mediaUrl || null,
    })
    .select("id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at")
    .single();

  if (error || !row) {
    console.error("[publish-post]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, post: row });
}
