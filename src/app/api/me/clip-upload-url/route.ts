import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { CLIP_KEY_PREFIX, isR2Configured, signClipPutUrl } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_BYTES = 200 * 1024 * 1024; // 200MB — bumped from 100MB to fit 2-min clips
const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

type Body = { contentType?: unknown; sizeBytes?: unknown };

/**
 * Issues a short-lived R2 PUT URL for the signed-in user to upload a clip
 * directly to storage. The composer then POSTs the returned objectKey to
 * `/api/me/publish-clip` to create the row.
 *
 * Object keys are scoped to the user (`clips/<user_id>/<uuid>.<ext>`) so
 * `/api/me/publish-clip` can verify ownership before inserting.
 */
export async function POST(req: Request) {
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const contentType =
    typeof body.contentType === "string"
      ? body.contentType.split(";")[0].trim().toLowerCase()
      : "";
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Unsupported video type (mp4, mov, webm only)" },
      { status: 400 },
    );
  }

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : -1;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Clip too large (max ${MAX_BYTES / (1024 * 1024)}MB)` },
      { status: 400 },
    );
  }

  const objectKey = `${CLIP_KEY_PREFIX}${user.id}/${randomUUID()}.${ext}`;
  try {
    const uploadUrl = await signClipPutUrl(objectKey, { contentType });
    return NextResponse.json({ ok: true, uploadUrl, objectKey });
  } catch (err) {
    console.error("[clip-upload-url]", err);
    const message = err instanceof Error ? err.message : "Could not sign upload URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
