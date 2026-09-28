import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { sniffImageFormat, stripImage } from "@/lib/media/strip-image";
import { requireCanPublish, requireNotRestricted } from "@/lib/moderation/access";
import { resumeDocProxyPath } from "@/lib/profile/resume-doc-url";
import { uploadResumeObject } from "@/lib/profile/resume-storage";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Longest edge each kind is stored at (the re-encode shrinks, never grows).
 * Sized for the largest place each shows: a cover spans a desktop screen, a
 * work logo is a small tile. Résumé images keep their size (null): they must
 * stay legible, and redaction bars are percentages of the page.
 */
const MAX_EDGE: Record<string, number | null> = {
  avatar: 1024,
  banner: 2560,
  resume: null,
  post: 2048,
  poster: 1920,
  logo: 512,
};

const ALLOWED: Record<string, string[]> = {
  avatar: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  banner: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  resume: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  post: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  poster: ["image/jpeg", "image/png", "image/webp"],
  // SVG omitted on purpose — would need DOMPurify-style sanitization to
  // strip embedded <script> before public hosting. Bitmaps only for v1.
  logo: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

const MAX_BYTES: Record<string, number> = {
  avatar: 6 * 1024 * 1024,
  banner: 6 * 1024 * 1024,
  resume: 8 * 1024 * 1024,
  post: 8 * 1024 * 1024,
  poster: 2 * 1024 * 1024,
  logo: 2 * 1024 * 1024,
};

const KIND_PATH_PREFIX: Record<string, string> = {
  avatar: "",
  banner: "",
  resume: "",
  post: "posts/",
  poster: "posters/",
  logo: "logos/",
};

function humanizeStorageError(message: string): string {
  const m = message.trim();
  if (/bucket\s+not\s+found/i.test(m)) {
    return (
      'Storage bucket "profiles" does not exist on this Supabase project. ' +
      "Apply migrations (e.g. `npx supabase db push` after `supabase link`), " +
      "or run `supabase/migrations/20260503120000_profile_extension_storage.sql` in the Dashboard SQL editor."
    );
  }
  return m;
}

/**
 * Multipart upload.
 *   - kind=resume → PRIVATE `resumes` bucket via the service role; the
 *     response `url` is the proxy path `/api/resume/<uid>/resume-<uuid>.<ext>`
 *     (store it as-is in resume_url / resume_docs[].url).
 *   - every other kind → public `profiles` bucket via the service role
 *     (key scoped to `user.id`); the response `url` is the public object
 *     URL. Writes are server-only: the owner INSERT/UPDATE/DELETE storage
 *     policies were dropped (20260904110000) so the Storage REST API
 *     cannot bypass this route's rate limit and per-kind size caps.
 *   - Rate limited per user (30 / 10 min). Unlike the presigned-PUT routes
 *     there is no signature to bind a size into: the bytes arrive here, so
 *     MAX_BYTES is enforced on the received buffer directly.
 *   - Every image (résumé images included) is RE-ENCODED before it is
 *     stored (S67 wave B, finding #8): the file's magic bytes must say JPEG,
 *     PNG, GIF or WebP, the pixels are decoded, turned upright and written
 *     back in the same format with NO metadata, so a phone photo's GPS
 *     position, camera and owner name never reach the public bucket. The
 *     stored type and extension come from the re-encoded bytes, not from
 *     what the browser declared. PDFs are stored as sent.
 *   - Gates: Terms and no restriction for every kind (a suspended or banned
 *     account can't mint public URLs on our host); post photos and video
 *     frames also need a verified school email, the rule publish-post
 *     applies anyway, so an unverified student can still set a profile
 *     photo, cover, work logo and résumé.
 *   - Error strings are a contract: avatar-upload.ts and onboarding.html
 *     match "Invalid file size" and "Unsupported file type" exactly.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`upload:profile-upload:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Same Terms body requireTermsAccepted sent, plus the restriction check.
  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") || "resume");
  const kind =
    kindRaw === "avatar" ||
    kindRaw === "banner" ||
    kindRaw === "resume" ||
    kindRaw === "post" ||
    kindRaw === "poster" ||
    kindRaw === "logo"
      ? kindRaw
      : null;
  if (!kind) {
    return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
  }
  // A post photo or a video's frame is only useful to publish-post, which
  // needs a verified school email; refuse here so no public file is left.
  if (kind === "post" || kind === "poster") {
    const publishGate = await requireCanPublish(user.id);
    if (publishGate) return publishGate;
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const max = MAX_BYTES[kind];
  if (buf.length === 0 || buf.length > max) {
    return NextResponse.json({ ok: false, error: "Invalid file size" }, { status: 400 });
  }

  let contentType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpg") contentType = "image/jpeg";
  if (!ALLOWED[kind].includes(contentType)) {
    return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 400 });
  }

  // Re-encode every image with no metadata (see the docblock). A PDF résumé
  // is stored as sent; nothing else may be a PDF (ALLOWED above). A "PDF"
  // whose bytes are really an image (a renamed photo) is treated as the image.
  let bytes: Buffer = buf;
  let ext = "pdf";
  if (contentType !== "application/pdf" || sniffImageFormat(buf)) {
    let out: Awaited<ReturnType<typeof stripImage>>;
    try {
      out = await stripImage(buf, { maxEdge: MAX_EDGE[kind] });
    } catch (e) {
      console.error("[profile-upload] re-encode", e);
      out = { ok: false, reason: "failed" };
    }
    if (!out.ok) {
      if (out.reason === "failed") {
        return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
      }
      const error = out.reason === "size" ? "Invalid file size" : "Unsupported file type";
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }
    // The bytes decide the type now, and it must still be one this kind
    // takes (a "JPEG" that is really a GIF can't become a video frame).
    if (!ALLOWED[kind].includes(out.contentType)) {
      return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 400 });
    }
    if (out.bytes.length === 0 || out.bytes.length > max) {
      return NextResponse.json({ ok: false, error: "Invalid file size" }, { status: 400 });
    }
    bytes = out.bytes;
    contentType = out.contentType;
    ext = out.ext;
  }

  if (kind === "resume") {
    try {
      const key = await uploadResumeObject(user.id, bytes, contentType);
      return NextResponse.json({ ok: true, url: resumeDocProxyPath(key), kind });
    } catch (e) {
      console.error("[profile-upload] resume", e);
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
        { status: 500 },
      );
    }
  }

  const path = `${user.id}/${KIND_PATH_PREFIX[kind]}${kind}-${randomUUID()}.${ext}`;
  const service = createSupabaseServiceClient();
  const { error: upErr } = await service.storage.from("profiles").upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (upErr) {
    console.error("[profile-upload]", upErr);
    return NextResponse.json(
      { ok: false, error: humanizeStorageError(upErr.message) },
      { status: 500 },
    );
  }

  const { data } = service.storage.from("profiles").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, kind });
}
