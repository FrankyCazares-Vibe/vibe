import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  GROUP_PHOTO_KEY_PREFIX,
  isR2Configured,
  signGroupPhotoPutUrl,
} from "@/lib/r2";
import { requireCanPublish } from "@/lib/moderation/access";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
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
 * Rate limited per user. The declared `sizeBytes` is bound into the
 * signature (Content-Length), so the client must PUT exactly the bytes it
 * declared or R2 rejects the upload. The answer carries the normalized
 * `contentType` the link was signed for; the client sends that exact
 * string as the PUT's Content-Type.
 *
 * After upload, the client PATCHes /api/me/threads/[id] with the returned
 * `objectKey` to set channels.photo_url.
 *
 * Held to what that save holds (rate limits, wave 1): the requireCanPublish
 * gate, a `group` channel, and a current membership, the same checks in the
 * same order as threads/[id]/route.ts PATCH. Before this, Terms and any
 * channel_members row were enough, so a suspended account, or the member of
 * a DM or a club room, could mint paid-for uploads the save would refuse.
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

  // failLocal: when the limiter's database call fails, this server counts on
  // its own instead of letting every upload through (rate limits, wave 1).
  const rl = await rateLimit(`upload:group-photo-upload-url:${user.id}`, {
    limit: 20,
    windowSec: 600,
    failLocal: true,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  // Terms, no restriction and a verified school email: the save takes the
  // same gate, so a key it would refuse is never paid for.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

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

  // Only a group chat has a photo to change. A DM or a club room answers
  // what the save answers (404 when the caller can't see it, 400 otherwise).
  const { data: chan, error: chanErr } = await supabase
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (chanErr) {
    console.error("[group-photo-upload-url chan]", chanErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!chan) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (chan.type !== "group") {
    return NextResponse.json(
      { ok: false, error: "Only group chats can be edited" },
      { status: 400 },
    );
  }

  // A current membership: leaving a group deletes the row.
  const { data: membership, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memErr) {
    console.error("[group-photo-upload-url membership]", memErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
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
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid file size" }, { status: 400 });
  }
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Image too large (max ${MAX_BYTES / (1024 * 1024)}MB)` },
      { status: 400 },
    );
  }

  const objectKey = `${GROUP_PHOTO_KEY_PREFIX}${channelId}/${randomUUID()}.${ext}`;
  try {
    const uploadUrl = await signGroupPhotoPutUrl(objectKey, {
      contentType,
      contentLength: sizeBytes,
    });
    return NextResponse.json({ ok: true, uploadUrl, objectKey, contentType });
  } catch (err) {
    console.error("[group-photo-upload-url]", err);
    const message = err instanceof Error ? err.message : "Could not sign upload URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
