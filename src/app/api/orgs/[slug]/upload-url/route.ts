import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ORG_ASSET_KEY_PREFIX,
  isR2Configured,
  signOrgAssetPutUrl,
} from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = {
  kind?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const LIMITS = {
  banner: 10 * 1024 * 1024, // 10MB
  logo: 5 * 1024 * 1024, // 5MB
  "post-image": 15 * 1024 * 1024, // 15MB
  "post-video": 200 * 1024 * 1024, // 200MB
} as const;
type Kind = keyof typeof LIMITS;

const VALID_KINDS = new Set<Kind>(["banner", "logo", "post-image", "post-video"]);

/**
 * POST /api/orgs/[slug]/upload-url
 * Body: { kind: 'banner' | 'logo' | 'post-image' | 'post-video',
 *         contentType: string, sizeBytes: number }
 *
 * Returns: { uploadUrl, objectKey, publicUrl? }
 *
 * Permissions: owner / admin only. We check role directly here and via the
 * service client (RLS isn't sufficient since signed URLs aren't a row).
 */
export async function POST(req: Request, { params }: Params) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "Storage not configured" },
      { status: 503 },
    );
  }

  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer || !["owner", "admin"].includes(viewer.role)) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? (body.kind as Kind) : null;
  if (!kind || !VALID_KINDS.has(kind)) {
    return NextResponse.json(
      {
        ok: false,
        error: "kind must be banner, logo, post-image, or post-video",
      },
      { status: 400 },
    );
  }

  const contentType =
    typeof body.contentType === "string"
      ? body.contentType.split(";")[0].trim().toLowerCase()
      : "";
  const acceptingVideo = kind === "post-video";
  const ext = acceptingVideo ? VIDEO_TYPES[contentType] : IMAGE_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      {
        ok: false,
        error: acceptingVideo
          ? "Unsupported video type (mp4, mov, webm only)"
          : "Unsupported image type (jpg, png, webp, gif only)",
      },
      { status: 400 },
    );
  }

  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : -1;
  const limit = LIMITS[kind];
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > limit) {
    return NextResponse.json(
      {
        ok: false,
        error: `File too large (max ${Math.round(limit / 1024 / 1024)}MB)`,
      },
      { status: 400 },
    );
  }

  // Folder convention: orgs/<org_id>/<bucket>/<uuid>.<ext>
  // banner / logo replace the previous file logically (stale assets remain
  // in storage and can be GC'd later — out of scope for v1).
  const subdir =
    kind === "banner" ? "banner" : kind === "logo" ? "logo" : "posts";
  const objectKey = `${ORG_ASSET_KEY_PREFIX}${org.id}/${subdir}/${randomUUID()}.${ext}`;

  try {
    const uploadUrl = await signOrgAssetPutUrl(objectKey, { contentType });
    return NextResponse.json({ ok: true, uploadUrl, objectKey });
  } catch (err) {
    console.error("[orgs/[slug]/upload-url POST]", err);
    const message = err instanceof Error ? err.message : "Could not sign upload URL";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
