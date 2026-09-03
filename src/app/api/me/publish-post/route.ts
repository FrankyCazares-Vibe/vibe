import { NextResponse } from "next/server";

import {
  extractMentionHandles,
  insertMentionNotifications,
  resolveMentionedUserIds,
} from "@/lib/mentions";
import { CLIP_KEY_PREFIX } from "@/lib/r2";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT_CHARS = 2000;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 32;
const MAX_VIDEO_POST_DURATION_SEC = 600; // 10 min cap for non-clip videos

type PublishPostBody = {
  content?: unknown;
  tags?: unknown;
  media_url?: unknown;
  media_thumbnail_url?: unknown;
  // X-style video posts: caller uploads to R2 via /api/me/clip-upload-url
  // first, then passes the returned object key here. We store the key in
  // `media_url` (same column clips use) so the renderer can detect a
  // video by checking for the `clips/` prefix.
  video_object_key?: unknown;
  duration_sec?: unknown;
};

const TAG_RE = /^[\p{L}\p{N}_]+$/u;
const MAX_MEDIA_REF_LEN = 2048;

/**
 * True when `value` is safe to store as a post media reference for `userId`:
 * an https URL (max 2048 chars) or an R2 key under clips/<userId>/.
 */
function isOwnedMediaRef(value: string, userId: string): boolean {
  if (value.length > MAX_MEDIA_REF_LEN || value.includes("..")) return false;
  if (value.startsWith(CLIP_KEY_PREFIX)) {
    return value.startsWith(`${CLIP_KEY_PREFIX}${userId}/`);
  }
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().replace(/^#+/, "");
    if (!t || t.length > MAX_TAG_LEN) continue;
    // Hashtags are rendered unescaped in a few prototype templates; keep
    // them to word characters so a tag can never carry markup.
    if (!TAG_RE.test(t)) continue;
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

  const rl = await rateLimit(`publish-post:${user.id}`, { limit: 20, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

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
  const videoObjectKey =
    typeof body.video_object_key === "string" ? body.video_object_key.trim() : "";

  // Reject obvious mismatches up front: only one media slot per post.
  if (mediaUrl && videoObjectKey) {
    return NextResponse.json(
      { ok: false, error: "A post can include either an image or a video, not both" },
      { status: 400 },
    );
  }

  // Validate video object key: must be in clips/<viewer.id>/ so a user
  // can't publish another user's upload as their own post. Same gate as
  // /api/me/publish-clip.
  if (videoObjectKey) {
    const expectedPrefix = `${CLIP_KEY_PREFIX}${user.id}/`;
    if (!videoObjectKey.startsWith(expectedPrefix) || videoObjectKey.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "Object key does not belong to this user" },
        { status: 400 },
      );
    }
  }

  // `media_url` / `media_thumbnail_url` are rendered by the feed and signed
  // by /api/posts/[id]/media, so they get the same ownership gate: either
  // an https URL (Supabase Storage public object) or a clips/<me>/ key.
  // Anything else (another user's clip key, javascript:, data:) is rejected.
  for (const [label, value] of [
    ["media_url", mediaUrl],
    ["media_thumbnail_url", mediaThumb],
  ] as const) {
    if (!value) continue;
    if (!isOwnedMediaRef(value, user.id)) {
      return NextResponse.json(
        { ok: false, error: `${label} must be an https URL or one of your own uploads` },
        { status: 400 },
      );
    }
  }

  const duration =
    typeof body.duration_sec === "number" && Number.isFinite(body.duration_sec)
      ? body.duration_sec
      : null;
  if (videoObjectKey && duration !== null && duration > MAX_VIDEO_POST_DURATION_SEC + 1) {
    return NextResponse.json(
      { ok: false, error: `Video exceeds ${MAX_VIDEO_POST_DURATION_SEC}s` },
      { status: 400 },
    );
  }

  if (!content && !mediaUrl && !videoObjectKey) {
    return NextResponse.json(
      { ok: false, error: "Post needs text, an image, or a video" },
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

  // For video posts: store the R2 key in media_url, the public poster
  // URL in media_thumbnail_url. Image posts: media_url holds the public
  // image URL (legacy behavior).
  const finalMediaUrl = videoObjectKey || (mediaUrl || null);
  const finalThumb = videoObjectKey
    ? mediaThumb || null
    : mediaThumb || mediaUrl || null;

  const { data: row, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      type: "post",
      content,
      tags,
      media_url: finalMediaUrl,
      media_thumbnail_url: finalThumb,
    })
    .select("id,user_id,type,content,tags,media_url,media_thumbnail_url,created_at")
    .single();

  if (error || !row) {
    console.error("[publish-post]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // @mention fan-out — best-effort; failures don't block the publish.
  if (content) {
    const handles = extractMentionHandles(content);
    if (handles.length > 0) {
      try {
        const ids = await resolveMentionedUserIds(supabase, handles, user.id);
        if (ids.length > 0) {
          await insertMentionNotifications(supabase, {
            actorId: user.id,
            targetUserIds: ids,
            kind: "post",
            postId: row.id as string,
          });
        }
      } catch (e) {
        console.error("[publish-post mentions]", e);
      }
    }
  }

  return NextResponse.json({ ok: true, post: row });
}
