import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { isAllowedMediaUrl } from "@/lib/org-asset-url";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };
type Body = {
  /** Accepted but ignored — clips are backlogged, everything is a post. */
  type?: unknown;
  content?: unknown;
  media_url?: unknown;
  media_thumbnail_url?: unknown;
};

const MAX_CONTENT = 2000;

/**
 * Who may speak AS the org in public. Owner and admin — mods run the chats,
 * they don't publish to the campus feed under the org's name.
 *
 * It lives here rather than in `join-state.ts` next to `OFFICER_ROLES` /
 * `INVITE_ROLES` / `SETTINGS_ROLES` because it is a different power that today
 * happens to have the same membership as the settings one: approving a request
 * somebody filed, adding a notification to a stranger's Otto, changing the join
 * policy and putting words in the org's mouth are four separate questions, and
 * collapsing them onto one array is how "let mods post" quietly becomes "let
 * mods change the audience". One constant either way, so moving it is one line.
 */
const POST_AS_ORG_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

/**
 * POST /api/orgs/[slug]/posts
 * Body: { content?, media_url?, media_thumbnail_url? }
 *
 * Clips are backlogged — every org post is created as `type='post'`. A
 * legacy `type: 'clip'` in the body is ignored rather than rejected so old
 * clients degrade to a normal post instead of erroring.
 *
 * Creates a row in `public.posts` with `org_id` set to this org. The author
 * (`user_id`) is the current viewer — posts always have a real human author
 * so likes/comments/mentions still attribute correctly. The org tag is what
 * makes it surface on the org's profile + give the campus feed an
 * "Org · @handle" attribution.
 *
 * Permissions: {@link POST_AS_ORG_ROLES} — owner / admin. Mods can chat in
 * channels but don't speak as the org publicly. Rate limited per author
 * (429), because one org post reaches the whole campus feed.
 *
 * A HIDDEN ORG CANNOT POST (spec §3.4). Hiding takes an org out of Discover,
 * search, the map, event lists and suggestions; letting its owner keep
 * publishing to the campus feed from behind that curtain would undo the whole
 * point. The check sits AFTER the role check on purpose, so a stranger poking
 * at the handle learns nothing about the org's state that a non-officer
 * would not already get from a plain 403.
 */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  // auth → rateLimit → Terms → service load → authorize (spec §4 conventions).
  // Nothing bounded an org's posting before this: an owner — or anything
  // holding an owner's session — could push to the campus feed in a loop, and
  // every post fans out to the whole campus. 20/hour is far past what a real
  // club posts and far short of a flood.
  const limit = await rateLimit(`org-post:${user.id}`, {
    limit: 20,
    windowSec: 3600,
  });
  if (!limit.allowed) {
    return tooManyRequests(limit, "You're posting too fast. Try again in a bit.");
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const viewerRole = viewer && isOrgRole(viewer.role) ? viewer.role : null;
  if (!viewerRole || !POST_AS_ORG_ROLES.includes(viewerRole)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only owner / admin can post as the org",
        code: "owner_admin_only",
      },
      { status: 403 },
    );
  }

  if (org.hidden_at) {
    return NextResponse.json(
      {
        ok: false,
        error: "This org is hidden, so it can't post.",
        code: "org_hidden",
      },
      { status: 409 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON", code: "invalid_body" }, { status: 400 });
  }

  const type = "post";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const mediaUrl =
    typeof body.media_url === "string" ? body.media_url.trim() : "";
  const mediaThumb =
    typeof body.media_thumbnail_url === "string"
      ? body.media_thumbnail_url.trim()
      : "";

  if (!content && !mediaUrl) {
    return NextResponse.json(
      { ok: false, error: "Add text or media before posting", code: "empty_post" },
      { status: 400 },
    );
  }
  // Media must be an org-scoped R2 key (`orgs/<orgId>/...`) or a Supabase-
  // hosted URL. Rejects `clips/` keys (user-owned) and third-party URLs.
  if (mediaUrl && !isAllowedMediaUrl(mediaUrl, org.id)) {
    return NextResponse.json({ ok: false, error: "Invalid media_url", code: "invalid_media_url" }, { status: 400 });
  }
  if (mediaThumb && !isAllowedMediaUrl(mediaThumb, org.id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid media_thumbnail_url", code: "invalid_media_thumbnail_url" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json(
      { ok: false, error: `Content exceeds ${MAX_CONTENT} characters`, code: "content_too_long" },
      { status: 400 },
    );
  }
  const { data: row, error } = await service
    .from("posts")
    .insert({
      user_id: user.id,
      org_id: org.id,
      type,
      content,
      media_url: mediaUrl || null,
      media_thumbnail_url: mediaThumb || mediaUrl || null,
    })
    .select(
      "id, user_id, org_id, type, content, media_url, media_thumbnail_url, created_at"
    )
    .single();
  if (error || !row) {
    console.error("[orgs/[slug]/posts POST]", error);
    return NextResponse.json(
      { ok: false, error: "Request failed", code: "post_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, post: withPostMediaUrls(row) },
    { status: 201 },
  );
}
