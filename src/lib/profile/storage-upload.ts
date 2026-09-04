import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

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
 *  lib/profile/resume-storage.ts); returns public URL or null. */
export async function uploadProfileDataUrl(
  supabase: SupabaseClient,
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
  const { error } = await supabase.storage.from("profiles").upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("[storage] profiles upload", error);
    return null;
  }
  const { data } = supabase.storage.from("profiles").getPublicUrl(path);
  return data.publicUrl;
}

/** Keep remote URL or upload data URL. Returns undefined if field omitted from patch. */
export async function inlineOrUploadProfileUrl(
  supabase: SupabaseClient,
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
    return uploadProfileDataUrl(supabase, userId, t, kind);
  }
  return null;
}
