import { NextResponse } from "next/server";

import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { isAllowedMediaUrl } from "@/lib/org-asset-url";
import { officerGate } from "@/lib/orgs/hidden-gate";
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
 * point. The check sits AFTER the role check on purpose, so only the club's
 * own officers ever learn it is hidden. A stranger asking about a hidden club
 * gets the 404 a made-up handle gets (security wave 2, `officerGate`).
 *
 * THE PUBLISHING GATE (security wave 2, report Low "the club-post route skips
 * the restriction, school-verified and word-filter checks"). This route writes
 * with the SERVICE role, so posts_insert_authenticated (consent +
 * can_publish_now) never runs: the route is the only enforcement. It takes
 * `requireCanPublish` (Terms, then no restriction in force, then a verified
 * school email; the Terms refusal is the same body `requireTermsAccepted`
 * sent) and runs the word filter on the text, like a personal post.
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

  const publishGate = await requireCanPublish(user.id);
  if (publishGate) return publishGate;

  const service = createSupabaseServiceClient();
  const { data: org, error: orgErr } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  const loadFailed = () =>
    NextResponse.json(
      { ok: false, error: "Request failed", code: "post_failed" },
      { status: 500 },
    );
  const notFound = () =>
    NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  if (orgErr) {
    console.error("[orgs/[slug]/posts POST org]", orgErr);
    return loadFailed();
  }
  if (!org) return notFound();

  const { data: viewer, error: viewerErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (viewerErr) console.error("[orgs/[slug]/posts POST role]", viewerErr);
  const viewerRole: OrgRole | null =
    !viewerErr && viewer && isOrgRole(viewer.role) ? viewer.role : null;

  // A failed membership read reads as "not a member": on a HIDDEN club that
  // is the stranger's 404 (a 500 would confirm the club exists); anywhere
  // else it is a 500, never a guessed "not allowed".
  const gate = officerGate({
    hidden: org.hidden_at !== null && org.hidden_at !== undefined,
    role: viewerRole,
    allowed: POST_AS_ORG_ROLES,
  });
  if (gate === "not_found") return notFound();
  if (viewerErr) return loadFailed();
  if (gate === "forbidden") {
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
  // Length first, then the word filter, the order the personal publish route
  // uses. The matched word is never echoed (contentBlockedResponse).
  if (content && !checkText(content).ok) return contentBlockedResponse("content");
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
