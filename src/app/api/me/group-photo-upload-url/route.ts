import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  GROUP_PHOTO_KEY_PREFIX,
  isR2Configured,
  signGroupPhotoPutUrl,
} from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB cap for group photos
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Body = {
  channelId?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
};

/**
 * Sign a short-lived R2 PUT for a group chat photo. The viewer must be a
 * member of the channel — we don't gate on admin role for v1, since the
 * user wants anyone in the group to be able to change the photo.
 *
 * After upload, the client PATCHes /api/me/threads/[id] with the returned
 * `objectKey` to set channels.photo_url.
 */
export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "Photo storage not configured" },
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

  // Verify membership.
  const { data: membership, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memErr) {
    console.error("[group-photo-upload-url membership]", memErr);
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const contentType =
    typeof body.contentType === "string"
      ? body.contentType.split(";")[0].trim().toLowerCase()
      : "";
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Unsupported image type (jpg, png, webp only)" },
      { status: 400 },
    );
  }

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : -1;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Image too large (max ${MAX_BYTES / (1024 * 1024)}MB)` },
      { status: 400 },
    );
  }

  const objectKey = `${GROUP_PHOTO_KEY_PREFIX}${channelId}/${randomUUID()}.${ext}`;
  try {
    const uploadUrl = await signGroupPhotoPutUrl(objectKey, { contentType });
    return NextResponse.json({ ok: true, uploadUrl, objectKey });
  } catch (err) {
    console.error("[group-photo-upload-url]", err);
    const message = err instanceof Error ? err.message : "Could not sign upload URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
