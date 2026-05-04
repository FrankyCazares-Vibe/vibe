import { NextResponse } from "next/server";

import { CLIP_KEY_PREFIX } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT_CHARS = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;
const MAX_DURATION_SEC = 120;

type Body = {
  object_key?: unknown;
  content?: unknown;
  tags?: unknown;
  poster_url?: unknown;
  duration_sec?: unknown;
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

/**
 * Records a clip row after the browser has uploaded the video to R2.
 *
 * The DB stores the R2 object key (not a URL) per the storage rules in
 * `src/lib/r2.ts` — viewers fetch a fresh signed GET URL on demand. Poster
 * frames live in the public `profiles` bucket and we store the public URL
 * directly in `media_thumbnail_url` so grid renders are zero-roundtrip.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const objectKey = typeof body.object_key === "string" ? body.object_key.trim() : "";
  const expectedPrefix = `${CLIP_KEY_PREFIX}${user.id}/`;
  if (!objectKey.startsWith(expectedPrefix) || objectKey.includes("..")) {
    return NextResponse.json(
      { ok: false, error: "Object key does not belong to this user" },
      { status: 400 },
    );
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Caption exceeds ${MAX_CONTENT_CHARS} characters` },
      { status: 400 },
    );
  }

  const duration =
    typeof body.duration_sec === "number" && Number.isFinite(body.duration_sec)
      ? body.duration_sec
      : null;
  if (duration !== null && duration > MAX_DURATION_SEC + 1) {
    return NextResponse.json(
      { ok: false, error: `Clip exceeds ${MAX_DURATION_SEC}s` },
      { status: 400 },
    );
  }

  const posterUrl =
    typeof body.poster_url === "string" && body.poster_url.trim().length > 0
      ? body.poster_url.trim()
      : null;

  const tags = normalizeTags(body.tags);

  const { data: row, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      type: "clip",
      content,
      tags,
      media_url: objectKey,
      media_thumbnail_url: posterUrl,
    })
    .select("id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at")
    .single();

  if (error || !row) {
    console.error("[publish-clip]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, post: row });
}
