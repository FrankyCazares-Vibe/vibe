import "server-only";

import { randomUUID } from "node:crypto";

import {
  RESUME_BUCKET,
  normalizeResumeRef,
  resumeDocProxyPath,
} from "@/lib/profile/resume-doc-url";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export { resumeKeysReferenced } from "@/lib/profile/resume-doc-url";

/**
 * Server-only access to the PRIVATE `resumes` bucket. There are no
 * storage.objects policies on it (migration 20260904100000) — every
 * upload / sign / delete goes through the service role here, and the
 * only read path for browsers is GET /api/resume/<key>.
 */

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function humanizeResumeStorageError(message: string): string {
  const m = message.trim();
  if (/bucket\s+not\s+found/i.test(m)) {
    return (
      `Storage bucket "${RESUME_BUCKET}" does not exist on this Supabase project. ` +
      "Apply migrations (e.g. `npx supabase db push` after `supabase link`), " +
      "or run `supabase/migrations/20260904100000_private_resumes_bucket.sql` in the Dashboard SQL editor."
    );
  }
  return m;
}

function normalizeContentType(contentType: string): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  return ct === "image/jpg" ? "image/jpeg" : ct;
}

/**
 * Upload raw bytes as a new resume object owned by `userId`. Returns the
 * storage key (`<uid>/resume-<uuid>.<ext>`). Throws with a humanised
 * message on validation or storage failure.
 */
export async function uploadResumeObject(
  userId: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const ct = normalizeContentType(contentType);
  const ext = MIME_EXT[ct];
  if (!ext) throw new Error("Unsupported file type");
  if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) {
    throw new Error("Invalid file size");
  }
  const key = `${userId}/resume-${randomUUID()}.${ext}`;
  const { error } = await createSupabaseServiceClient()
    .storage.from(RESUME_BUCKET)
    .upload(key, bytes, { contentType: ct, upsert: false });
  if (error) {
    console.error("[resume-storage] upload", error);
    throw new Error(humanizeResumeStorageError(error.message));
  }
  return key;
}

/**
 * Upload a `data:<mime>;base64,…` payload (legacy desktop profile.html
 * sends `resume_url` this way). Returns the key, or null when the payload
 * is malformed / unsupported / too large / the upload fails.
 */
export async function uploadResumeDataUrl(
  userId: string,
  dataUrl: string,
): Promise<string | null> {
  const m = dataUrl.trim().match(/^data:([\w/+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const contentType = normalizeContentType(m[1]);
  if (!MIME_EXT[contentType]) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_RESUME_BYTES) return null;
  try {
    return await uploadResumeObject(userId, buf, contentType);
  } catch (e) {
    console.error("[resume-storage] data-url upload failed", e);
    return null;
  }
}

/**
 * Resolve a client-supplied `resume_url` for the row owned by `userId`.
 *   undefined   → field omitted (caller leaves the column alone)
 *   null        → clear
 *   data: URL   → upload to `resumes` → proxy path (null if upload fails)
 *   otherwise   → normalizeResumeRef (own proxy/legacy ref or external link)
 * Non-string, non-null values are treated as "omitted" so a malformed
 * client payload can't silently wipe an existing resume.
 */
export async function resolveResumeUrlInput(
  userId: string,
  value: unknown,
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return null;
  if (/^data:/i.test(t)) {
    const key = await uploadResumeDataUrl(userId, t);
    return key ? resumeDocProxyPath(key) : null;
  }
  return normalizeResumeRef(t, userId);
}

/** Short-TTL signed GET URL for a resume object. Throws on error. */
export async function signResumeGetUrl(key: string, expiresInSec = 300): Promise<string> {
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(key, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not sign resume URL");
  }
  return data.signedUrl;
}

/** Best-effort delete. Logs and swallows errors — never throws. */
export async function deleteResumeObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const { error } = await createSupabaseServiceClient()
      .storage.from(RESUME_BUCKET)
      .remove(keys);
    if (error) console.error("[resume-storage] remove", error.message, keys);
  } catch (e) {
    console.error("[resume-storage] remove threw", e, keys);
  }
}
