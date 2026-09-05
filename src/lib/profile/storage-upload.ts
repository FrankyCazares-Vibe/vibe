import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Upload base64 data URL to the public `profiles` bucket (avatar / banner
 *  only — resumes go to the private `resumes` bucket via
 *  lib/profile/resume-storage.ts); returns public URL or null.
 *
 *  Server-only: writes use the service role. The bucket's owner-write RLS
 *  policies were dropped (20260904110000) so the only way into `profiles`
 *  is through server routes that enforce rate limits + size caps. The
 *  object key is still scoped to `userId`. */
export async function uploadProfileDataUrl(
  userId: string,
  dataUrl: string,
  kind: "avatar" | "banner",
): Promise<string | null> {
  const m = dataUrl.trim().match(/^data:([\w/+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const rawCt = m[1].split(";")[0].toLowerCase();
  const contentType = rawCt === "image/jpg" ? "image/jpeg" : rawCt;
  const ext = MIME_EXT[contentType];
  if (!ext) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buf.length > MAX_IMAGE_BYTES || buf.length === 0) return null;
  const path = `${userId}/${kind}-${randomUUID()}.${ext}`;
  const service = createSupabaseServiceClient();
  const { error } = await service.storage.from("profiles").upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("[storage] profiles upload", error);
    return null;
  }
  const { data } = service.storage.from("profiles").getPublicUrl(path);
  return data.publicUrl;
}

/** Keep remote URL or upload data URL. Returns undefined if field omitted from patch. */
export async function inlineOrUploadProfileUrl(
  userId: string,
  value: unknown,
  kind: "avatar" | "banner",
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return null;
  if (t.startsWith("https://") || t.startsWith("http://")) {
    try {
      const u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return t.slice(0, 2048);
    } catch {
      return null;
    }
  }
  if (t.startsWith("data:")) {
    return uploadProfileDataUrl(userId, t, kind);
  }
  return null;
}
