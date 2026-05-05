import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  isR2Configured,
  MESSAGE_MEDIA_KEY_PREFIX,
  signMessageMediaPutUrl,
} from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB for images
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB for videos

const IMAGE_EXTS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_EXTS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

type Body = {
  channelId?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
};

/**
 * Sign a short-lived R2 PUT for an image/video uploaded inline in a chat.
 * Auth + channel-membership gated. The client uploads, then POSTs the
 * resulting `objectKey` + `kind` along with `/api/me/threads/[id]/messages`.
 */
export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "Media storage not configured" },
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  if (!channelId) {
    return NextResponse.json({ ok: false, error: "Missing channelId" }, { status: 400 });
  }

  // Membership gate.
  const { data: membership, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memErr) {
    console.error("[messages-upload-url membership]", memErr);
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const contentType =
    typeof body.contentType === "string"
      ? body.contentType.split(";")[0].trim().toLowerCase()
      : "";
  const isImage = !!IMAGE_EXTS[contentType];
  const isVideo = !!VIDEO_EXTS[contentType];
  if (!isImage && !isVideo) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported file type (jpg, png, webp, gif, mp4, mov, webm)",
      },
      { status: 400 },
    );
  }
  const ext = isImage ? IMAGE_EXTS[contentType] : VIDEO_EXTS[contentType];
  const kind: "image" | "video" = isImage ? "image" : "video";
  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : -1;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > max) {
    return NextResponse.json(
      { ok: false, error: `File too large (max ${max / (1024 * 1024)}MB for ${kind}s)` },
      { status: 400 },
    );
  }

  const objectKey = `${MESSAGE_MEDIA_KEY_PREFIX}${channelId}/${randomUUID()}.${ext}`;
  try {
    const uploadUrl = await signMessageMediaPutUrl(objectKey, { contentType });
    return NextResponse.json({ ok: true, uploadUrl, objectKey, kind });
  } catch (err) {
    console.error("[messages-upload-url]", err);
    const message = err instanceof Error ? err.message : "Could not sign upload URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
