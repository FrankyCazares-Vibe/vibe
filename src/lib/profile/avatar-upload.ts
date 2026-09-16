import { describeFailure, type ToastAction } from "@/lib/feedback/failure-copy";

/**
 * Client helper for saving a profile photo (plan §3.1 step 4, §3.4, wave 2
 * B11): upload the cropped blob, then point `users.avatar_url` at it.
 *
 *   1. `POST /api/me/profile-upload` (multipart: `file`, `kind=avatar`)
 *      → `{ ok: true, url }`. The route caps avatars at 6 MB and accepts
 *      jpeg / png / webp / gif, keyed on the part's content type.
 *   2. `PATCH /api/me/profile { avatar_url: url }` → `{ ok: true, profile }`.
 *      The route pins the URL to our Supabase host and writes it with the
 *      service role.
 *
 * `uploadAvatar` never throws, never toasts, and returns one line of §3.5
 * photo copy for the caller to render inline. Signed-out, Terms and
 * rate-limit refusals keep the shared failure-copy lines (and their Sign in /
 * Review Terms action), because "Try again" would be the wrong advice there.
 *
 * Pure except for `uploadAvatar`'s two requests, which go through an
 * injectable `fetchImpl` so the flow is unit-tested
 * (`avatar-upload.test.ts`). The static pages can't import this; onboarding.html
 * keeps its own copy of `PHOTO_ERROR_COPY`.
 */

/** §3.5 "Step 4 errors", verbatim. */
export const PHOTO_ERROR_COPY = {
  tooBig: "That photo is too big. Try another.",
  wrongType: "Use a JPG, PNG or WebP photo.",
  processFailed: "Couldn't process that photo. Try a different one.",
  uploadFailed: "That photo didn't upload. Try again.",
} as const;

/** What the photo step offers (`accept="image/jpeg,image/png,image/webp"`). */
export const AVATAR_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client-side cap. The route allows 6 MB, but Vercel refuses a function
 * request body over ~4.5 MB with a non-JSON 413 before the route runs, so
 * anything above 4 MB (leaving room for the multipart envelope) can't land
 * in production. A 768 px cropper output is ~100 KB.
 */
export const AVATAR_CLIENT_MAX_BYTES = 4 * 1024 * 1024;

export type AvatarUploadStage = "check" | "upload" | "save";

export type AvatarUploadResult =
  | { ok: true; url: string }
  | {
      ok: false;
      message: string;
      /** Where it stopped: the local check, the upload, or the profile save. */
      stage: AvatarUploadStage;
      /** HTTP status; 0 for the local check, a network failure or an abort. */
      status: number;
      /** Sign in / Review Terms, when that's the fix. */
      action?: ToastAction;
      /** The caller's own AbortSignal fired; usually nothing to show. */
      aborted?: true;
    };

export type AvatarFailureSignal = {
  status: number;
  code: string | null;
  error: string | null;
  retryAfterSec: number | null;
};

/** `image/JPG; charset=x` → `image/jpeg`; an untyped blob is taken as JPEG (the cropper's default output). */
export function normalizeAvatarContentType(type: unknown): string {
  const t = typeof type === "string" ? type.split(";")[0]!.trim().toLowerCase() : "";
  if (t === "" || t === "image/jpg") return "image/jpeg";
  return t;
}

/** The local check before any request: a readable size, an allowed type, under the cap. */
export function preflightAvatarBlob(
  blob: { size?: unknown; type?: unknown } | null | undefined,
): { ok: true; contentType: string } | { ok: false; message: string } {
  const size = blob?.size;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return { ok: false, message: PHOTO_ERROR_COPY.processFailed };
  }
  const contentType = normalizeAvatarContentType(blob?.type);
  if (!AVATAR_CONTENT_TYPES.includes(contentType)) {
    return { ok: false, message: PHOTO_ERROR_COPY.wrongType };
  }
  if (size > AVATAR_CLIENT_MAX_BYTES) {
    return { ok: false, message: PHOTO_ERROR_COPY.tooBig };
  }
  return { ok: true, contentType };
}

/**
 * One refused request → the student's line. The upload route's two 400
 * strings ("Invalid file size", "Unsupported file type") and Vercel's 413 get
 * their specific photo copy; 401, `terms_required` and 429 keep the shared
 * lines; everything else (5xx, a network failure, a bad PATCH) is "didn't
 * upload".
 */
export function avatarFailureMessage(
  stage: "upload" | "save",
  sig: AvatarFailureSignal,
  here = "/",
): { message: string; action?: ToastAction } {
  if (sig.status === 401 || sig.status === 429 || (sig.status === 403 && sig.code === "terms_required")) {
    return describeFailure(sig, PHOTO_ERROR_COPY.uploadFailed, here);
  }
  if (stage === "upload") {
    if (sig.status === 413) return { message: PHOTO_ERROR_COPY.tooBig };
    if (sig.status === 400 && sig.error === "Invalid file size") {
      return { message: PHOTO_ERROR_COPY.tooBig };
    }
    if (sig.status === 400 && sig.error === "Unsupported file type") {
      return { message: PHOTO_ERROR_COPY.wrongType };
    }
  }
  return { message: PHOTO_ERROR_COPY.uploadFailed };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type UploadAvatarOptions = {
  /** Test seam; defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
};

const EXT_FOR_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function currentPath(): string {
  if (typeof window === "undefined" || !window.location) return "/";
  return window.location.pathname + window.location.search;
}

/** The body as an object, or null for an empty body, an HTML error page, or a failed read. */
async function readObject(res: Response): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function signalOf(res: Response, obj: Record<string, unknown> | null): AvatarFailureSignal {
  const retry = res.headers.get("retry-after");
  return {
    status: res.status,
    code: typeof obj?.code === "string" ? obj.code : null,
    error: typeof obj?.error === "string" ? obj.error : null,
    retryAfterSec: retry && /^\d+$/.test(retry.trim()) ? Number(retry.trim()) : null,
  };
}

/**
 * Upload a cropped photo and make it the signed-in student's avatar.
 * Resolves `{ ok: true, url }` only once `PATCH /api/me/profile` has
 * accepted the URL (and, when it echoes the row, stored exactly that URL).
 *
 * A failed save after a successful upload leaves an unreferenced object in
 * the `profiles` bucket, the same as every other upload path today.
 */
export async function uploadAvatar(
  blob: Blob,
  opts: UploadAvatarOptions = {},
): Promise<AvatarUploadResult> {
  const pre = preflightAvatarBlob(blob);
  if (!pre.ok) return { ok: false, message: pre.message, stage: "check", status: 0 };

  const doFetch: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const { signal } = opts;
  const here = currentPath();

  const networkFailure = (stage: "upload" | "save"): AvatarUploadResult => ({
    ok: false,
    message: PHOTO_ERROR_COPY.uploadFailed,
    stage,
    status: 0,
    ...(signal?.aborted ? { aborted: true as const } : {}),
  });
  const refused = (stage: "upload" | "save", sig: AvatarFailureSignal): AvatarUploadResult => {
    const { message, action } = avatarFailureMessage(stage, sig, here);
    return { ok: false, message, stage, status: sig.status, ...(action ? { action } : {}) };
  };

  // 1. Upload. Re-wrap so the part carries the normalized type (an untyped
  //    blob would otherwise reach the route as "" and be refused).
  const form = new FormData();
  const typed = blob.type === pre.contentType ? blob : new Blob([blob], { type: pre.contentType });
  form.set("file", typed, `avatar.${EXT_FOR_TYPE[pre.contentType] ?? "jpg"}`);
  form.set("kind", "avatar");

  let upRes: Response;
  try {
    upRes = await doFetch("/api/me/profile-upload", {
      method: "POST",
      credentials: "same-origin",
      body: form,
      signal,
    });
  } catch {
    return networkFailure("upload");
  }
  const upObj = await readObject(upRes);
  if (!upRes.ok || upObj?.ok === false) return refused("upload", signalOf(upRes, upObj));
  const url = typeof upObj?.url === "string" ? upObj.url.trim() : "";
  if (!url) return { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "upload", status: upRes.status };

  // 2. Save the URL on the profile.
  let saveRes: Response;
  try {
    saveRes = await doFetch("/api/me/profile", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatar_url: url }),
      signal,
    });
  } catch {
    return networkFailure("save");
  }
  const saveObj = await readObject(saveRes);
  if (!saveRes.ok || saveObj?.ok === false) return refused("save", signalOf(saveRes, saveObj));

  // The route echoes the stored row (or `profile: null` when its re-read
  // failed). If it echoed a different avatar, the write didn't land.
  const profile = saveObj?.profile;
  if (profile !== null && typeof profile === "object" && !Array.isArray(profile)) {
    const stored = (profile as Record<string, unknown>).avatar_url;
    if (stored !== url) {
      return { ok: false, message: PHOTO_ERROR_COPY.uploadFailed, stage: "save", status: saveRes.status };
    }
  }

  return { ok: true, url };
}
