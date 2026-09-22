import { NextResponse } from "next/server";

import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  extractMentionHandles,
  insertMentionNotifications,
  resolveMentionedUserIds,
} from "@/lib/mentions";
import { loadOrgRole } from "@/lib/orgs/following";
import { orgContentAccessAsService } from "@/lib/orgs/hidden-org-access";
import type { OrgRole } from "@/lib/orgs/join-state";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { addedHandles, checkPostEdit, extractPostTags } from "@/lib/posts/edit";
import { loadPostEngagementCounts } from "@/lib/posts/engagement-counts";
import { loadHonestViewRows } from "@/lib/posts/honest-views";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { CLIP_KEY_PREFIX, getR2S3Client, isR2Configured } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * The columns PATCH reads before an edit and returns after one. `edited_at`
 * is written only by the `posts_stamp_edited` trigger (migration
 * 20260916130000); this route reads it and never sends it. `org_id` marks a
 * club post, which only a current owner / admin of that club may edit.
 */
const EDIT_COLS =
  "id,user_id,org_id,type,status,content,tags,media_url,media_thumbnail_url,created_at,edited_at";

/**
 * Who may edit a club post: the same roles that may publish one as the club
 * (`POST_AS_ORG_ROLES` in orgs/[slug]/posts/route.ts). Editing a club post
 * puts words in the club's mouth just as publishing one does.
 */
const EDIT_AS_ORG_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Single post fetch for the viewer modal (P1-015). Returns the post + author
 * + counts (likes, comments, views, reposts, saves) + viewer-relative state
 * (liked, saved) + `is_owner`. One roundtrip on modal open instead of three.
 *
 * WHY `is_owner` IS COMPUTED HERE. Both post viewers used to be told who the
 * author was by their caller — `PostViewerMobile` takes a `canDelete` prop and
 * only ProfileMobile passes it, so on the feed and on a shared link the viewer
 * did not know it was looking at its own post. An owner-only affordance ("who
 * saw this") cannot be built on a flag the caller forgets to pass, so the
 * server that already knows says so.
 *
 * WHY `counts.views` IS NOT `posts.view_count`. The stored counter includes
 * the author refreshing their own post (`record_post_view` had no self-view
 * guard until 20260912100500; 71 of 149 live ledger rows were self-views), so
 * the number here is tallied from the `post_views` ledger with the author's
 * own rows dropped — the same figure the feed card shows. See
 * src/lib/posts/honest-views.ts.
 *
 * `counts.saves` is OPTIONAL: the key is omitted, never sent as 0, when the
 * bookmarks count cannot be read. Zero saves and an unreadable count are
 * different claims and the client has to be able to tell them apart.
 *
 * `counts.saves` COUNTS OTHER PEOPLE — the author's own bookmark is excluded
 * (see loadSaveCount) so it can never disagree by one with the savers list at
 * /api/me/posts/[id]/savers, which excludes it too. `viewer.saved` below is
 * the caller's OWN bookmark and carries no such exclusion, so for the author
 * the two move independently: an owner who taps Save flips `viewer.saved` to
 * true while `counts.saves` stays where it was. That is correct — "12 saves"
 * means twelve other people — but it means a client MUST NOT optimistically
 * bump `counts.saves` on a Save tap when `is_owner` is true, or the number it
 * paints will be contradicted by the very next fetch.
 *
 * `counts.likes` / `counts.reposts` COME FROM AN RPC (`post_engagement_counts`,
 * T1). `post_likes` and `post_reposts` return only the caller's own rows once
 * T1's policy file lands, so counting rows would read 0 or 1. The RPC returns
 * numbers only, for posts the caller can see. If it fails, both read 0, which
 * is what a failed count sent before.
 *
 * A HIDDEN CLUB'S POST IS "NOT FOUND" (rulings H7). `posts_select_authenticated`
 * lets any signed-in student read any published post by id, club posts
 * included, so the club's hidden status is checked here with the service role:
 * members of the club and platform admins still get the post, and so does its
 * author; everyone else gets the same 404 as a missing post. `org_id` is read
 * for that check only and never sent. `/api/feed` leaves the same posts out
 * for the same people, so no feed card opens to this 404.
 *
 * The check is `orgContentAccess` (src/lib/orgs/hidden-org-access.ts), the
 * same one the like, comment and media routes ask. It fails CLOSED: when the
 * club can't be read, or the service role isn't configured, the post is that
 * same 404 rather than a 500. A bad minute for the database shows a club post
 * as missing, never a hidden one as visible. An answer that was allowed only
 * because the caller is in a hidden club carries `Cache-Control: private,
 * no-store`, like the media route's.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("posts")
    .select(
      // `view_count` is read only as the fallback below and is stripped off
      // the post before it ships — nothing should render the inflated counter.
      // `edited_at` (null = never edited) drives the "Edited" marker.
      // `org_id` is read only for the hidden-club check and stripped too.
      "id,user_id,org_id,type,content,tags,media_url,media_thumbnail_url,view_count,created_at,edited_at," +
        // Explicit FK name disambiguates the posts→users embed; see /api/feed for context.
        "author:users!posts_user_id_fkey!inner(id,name,handle,school,major,year,avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[posts/:id GET]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }

  // The concatenated select string defeats Supabase's row typing
  // (GenericStringError); cast through unknown. `view_count` comes off here so
  // the inflated stored counter never reaches a client — `counts.views` below
  // is the honest number. `org_id` comes off too: the response keys stay
  // exactly what they were before the hidden-club check needed it.
  const {
    view_count: storedViewCount,
    org_id: orgId,
    ...postFields
  } = row as unknown as {
    view_count: number | null;
    org_id: string | null;
  } & Record<string, unknown>;
  const post = postFields as { id: string; user_id: string } & Record<string, unknown>;
  const authorId = String(post.user_id);

  // A hidden club's post answers exactly like a missing one (rulings H7).
  // Checked before any count is read. The author is never locked out of their
  // own words, even after leaving the club, so orgContentAccess (which knows
  // nothing about authors) is only asked about other people's club posts. It
  // fails closed: a failed read counts as hidden, and gets the same 404.
  let hiddenClub = false;
  if (orgId && authorId !== user.id) {
    const access = await orgContentAccessAsService(orgId, "[posts/:id GET club]");
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
    }
    hiddenClub = access.hidden;
  }

  // Counts + viewer state in parallel — small queries, cheap to fan out.
  // Likes and reposts come from the count RPC (see the docblock): the viewer
  // is `auth.uid()` there, so this must stay the cookie client.
  const [
    engagement,
    commentCountRes,
    viewerLikeRes,
    viewerSaveRes,
    viewRows,
    saveCount,
  ] = await Promise.all([
    loadPostEngagementCounts(supabase, [id]),
    supabase
      .from("post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id),
    supabase
      .from("post_likes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("user_id", user.id),
    supabase
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id)
      .eq("user_id", user.id),
    // Honest views: the ledger, with this post's author's own rows dropped.
    loadHonestViewRows([id], new Map([[id, authorId]])),
    loadSaveCount(id, authorId),
  ]);

  // `null` from the ledger means "we could not read it", not "nobody looked".
  // A single post is a secondary number on a screen whose job is the post
  // itself, so this makes the same call /api/feed:251 does and keeps showing
  // the stored counter rather than failing the fetch — which means the number
  // can fall back to one that still INCLUDES the author's own self-views. The
  // metrics screens make the opposite call (creator-stats 500s) because there
  // the number is the product.
  const views = viewRows === null ? (storedViewCount ?? 0) : viewRows.length;

  // `null` means the RPC failed (the helper logged why). Both numbers read 0,
  // today's answer to a failed count; the post itself still opens.
  if (engagement === null) {
    console.error("[posts/:id GET counts]");
  }
  const postCounts = engagement?.get(id) ?? { likes: 0, reposts: 0 };

  const res = NextResponse.json({
    ok: true,
    post: withPostMediaUrls(post),
    is_owner: authorId === user.id,
    counts: {
      likes:    postCounts.likes,
      comments: commentCountRes.count ?? 0,
      views,
      reposts:  postCounts.reposts,
      // Omitted, not zeroed, when the count could not be read.
      ...(saveCount === null ? {} : { saves: saveCount }),
    },
    viewer: {
      liked: (viewerLikeRes.count ?? 0) > 0,
      saved: (viewerSaveRes.count ?? 0) > 0,
    },
  });
  // A hidden club's post was served only because of who is asking, so the
  // answer stays out of any shared cache (the same header as the media route).
  if (hiddenClub) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/**
 * How many people saved this post. `null` means "we could not read it", which
 * the caller turns into an ABSENT key rather than a 0.
 *
 * Service role because `bookmarks` RLS is `bookmarks_all_own` — owner of the
 * bookmark — so a cookie-client count returns 1 or 0 (the caller's own save)
 * however many people saved it. Head-only: the count crosses the wire, never a
 * row, so no identity can escape here. Who saved it is the owner-only, paid
 * surface and lives in /api/me/posts/[id]/savers.
 *
 * The author's own bookmark is excluded, exactly as the savers list and
 * creator-stats exclude it, so the count and the list can never disagree by
 * one — and so "12 saves" means twelve other people, the same rule the view
 * numbers got in b3f23df.
 */
async function loadSaveCount(postId: string, authorId: string): Promise<number | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const { count, error } = await createSupabaseServiceClient()
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .neq("user_id", authorId);
  if (error) {
    console.error("[posts/:id GET saves]", error);
    return null;
  }
  return count ?? 0;
}

/**
 * The answer for someone who isn't the post's author: 403 "Not your post",
 * unless the post belongs to a hidden club they may not see. That one gets
 * the same 404 as a missing post, as GET gives, so an edit or delete attempt
 * can't confirm a hidden club's post still exists. Only callers who aren't
 * the author pay for the club read.
 */
async function notYourPost(orgId: unknown, logTag: string): Promise<NextResponse> {
  if (typeof orgId === "string" && orgId) {
    const access = await orgContentAccessAsService(orgId, logTag);
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
    }
  }
  return NextResponse.json({ ok: false, error: "Not your post" }, { status: 403 });
}

/**
 * Delete a post or clip. RLS (`posts_delete_own`) enforces author-only, and
 * the route checks first: someone else's post answers 403 "Not your post",
 * except a hidden club's post the caller may not see, which answers the same
 * 404 as a missing post (notYourPost).
 *
 * Side-effects:
 *  - post_likes / post_comments / bookmarks rows cascade automatically
 *    via ON DELETE CASCADE on their foreign keys.
 *  - Clip videos in R2 are deleted best-effort. Failures don't block the
 *    DB delete — orphaned R2 objects can be swept by a lifecycle policy
 *    later if needed.
 */
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Read first so we can also clean up R2 storage if it's a clip. The
  // SELECT respects RLS too, so a non-owner can't even see other users'
  // posts here — but the public read policy (posts_select_authenticated)
  // means any signed-in user CAN see them, so we re-check ownership
  // explicitly before issuing the delete.
  // `org_id` is read only so a stranger to a hidden club gets "not found".
  const { data: row, error: readErr } = await supabase
    .from("posts")
    .select("id,user_id,org_id,type,media_url")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[posts/:id DELETE read]", readErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return notYourPost(row.org_id, "[posts/:id DELETE club]");
  }

  const { error: delErr } = await supabase.from("posts").delete().eq("id", id);
  if (delErr) {
    console.error("[posts/:id DELETE]", delErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  // Best-effort R2 cleanup for any post whose media is an R2 video object.
  // The `clips/` prefix is legacy naming — it backs regular video posts.
  if (isR2Configured()) {
    const key = String(row.media_url || "").trim();
    if (key.startsWith(CLIP_KEY_PREFIX) && !key.includes("..")) {
      try {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const bucket = process.env.R2_BUCKET_NAME?.trim();
        if (bucket) {
          await getR2S3Client().send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          );
        }
      } catch (e) {
        // Don't fail the request — DB delete already succeeded. Log it
        // so we know if storage drifts from the DB.
        console.error("[posts/:id DELETE r2]", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/** A post row as PATCH reads and returns it ({@link EDIT_COLS}). */
type EditRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  type: string;
  status: string;
  content: string | null;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  created_at: string;
  edited_at: string | null;
};

/**
 * PATCH a post: edit its caption text, or publish a draft. Missing fields are
 * left alone. Plan `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md`
 * §7 E1.
 *
 * EDITS CHANGE CAPTION TEXT ONLY. `content` is trimmed, at most 2000
 * characters, and may be emptied only on a post with a photo or video
 * (`checkPostEdit`). Tags are NOT accepted from the client: whenever the text
 * changes they are re-derived server-side with `extractPostTags`, the same
 * function the composers use, so a `tags` field in the body is ignored. The
 * database limits which columns change, not their values: `authenticated`
 * may UPDATE only content, tags and status (migration 20260916130000), but
 * nothing there caps the text at 2000 characters, checks tag format or rate
 * limits. An author writing to PostgREST directly skips this route's rules;
 * CHECK constraints would close that (follow-up).
 *
 * CLUB POSTS (`org_id` set). Being the author isn't enough: the caller must
 * still be an owner / admin of the club, the same roles orgs/[slug]/posts
 * lets publish as the club. Anyone else gets 403 `owner_admin_only`, with
 * that route's message. A hidden club's post can still be edited by its
 * current owner / admin (it shows as the author's own post, plan Q4);
 * whether hiding should also freeze edits is Franky's call. Club posts never
 * send mention notifications, matching the org route, which sends none.
 *
 * "EDITED" IS STAMPED BY THE DATABASE, NOT HERE. The `posts_stamp_edited`
 * trigger sets `edited_at` when a PUBLISHED post's content actually changes.
 * Saving the same text writes nothing at all, and editing a draft doesn't
 * stamp. The row comes back with `edited_at` so a client can show the marker
 * straight away.
 *
 * STATUS. draft -> published publishes the post and fans out every @mention
 * in its final text, as publish-post does on a first publish. A published
 * post can't go back to draft: the same trigger refuses it (42501), so this
 * route answers 400 `already_published` before the UPDATE rather than letting
 * that surface as a 500.
 *
 * NEWLY ADDED MENTIONS NOTIFY ONCE. On a published post only the @handles an
 * edit adds are considered, and a person who already has a mention
 * notification from this author for this post is skipped, so removing a
 * handle and adding it back never re-notifies (plan Q17). That check reads
 * other people's notifications, which RLS (`notifications_select_own`) hides
 * from the author, so it uses the service role; if the service role isn't
 * configured or the read fails, nobody is notified. A missed mention beats a
 * duplicate one.
 *
 * MENTION ROWS ARE WRITTEN WITH THE SERVICE ROLE (T2 A4), on publish and on
 * edit, and only after the UPDATE succeeded. T2's migration takes INSERT on
 * `notifications` away from students, so a student can't forge a mention over
 * REST; this route is where a real one comes from. The actor is always the
 * signed-in author, never a body field. No service role: nobody is notified.
 *
 * KNOWN GAPS in mention-once. It is check-then-insert with no unique index on
 * notifications behind it, so two PATCHes landing together that add the same
 * handle can both notify (clients should disable Save while a PATCH is in
 * flight). And a recipient who deleted their mention notification is
 * notified again if the handle is removed and re-added. A unique partial
 * index on notifications(user_id, actor_id, post_id) where type = 'mention',
 * with the insert ignoring duplicates, would close the race (follow-up
 * migration); the deleted case stays open, since the row it checks is gone.
 *
 * Rate limit: 30 PATCHes per author per 10 minutes (429 with Retry-After).
 *
 * KNOWN GAP (critic W2 Low 8): this route's GET, /api/me/posts and
 * /api/users/[handle]/posts return `edited_at`. Readers that aren't edit
 * surfaces (club posts on /api/orgs/[slug]/profile, shared posts in DMs, the
 * /posts/[id] share page) don't select it yet, so an edited post shows no
 * marker there.
 */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Same order as publish-post: the limiter runs before the consent read.
  const rl = await rateLimit(`post-edit:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `"content" in body` throws on null or a primitive, so anything that isn't
  // a JSON object gets the same answer as JSON that doesn't parse.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `tags` is deliberately not read: tags are re-derived from the text.
  const body = parsed as { content?: unknown; status?: unknown };

  // Read the row first: ownership, the prior status and text (for the mention
  // diff), and whether it has media (a media post may lose its caption).
  const { data: priorRow, error: readErr } = await supabase
    .from("posts")
    .select(EDIT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[posts/:id PATCH read]", readErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!priorRow) {
    return NextResponse.json({ ok: false, error: "Post not found" }, { status: 404 });
  }
  const prior = priorRow as unknown as EditRow;
  if (prior.user_id !== user.id) {
    return notYourPost(prior.org_id, "[posts/:id PATCH club]");
  }

  // A club post speaks as the club, so writing it isn't enough: the author
  // must still be an owner / admin of that club (the org posts route's rule).
  // An officer who was removed or demoted can't reword the club's post. The
  // roster read needs the service role (RLS hides a club's members from
  // non-members); without it the role can't be checked, so refuse.
  if (prior.org_id) {
    if (!isSupabaseServiceConfigured()) {
      console.error("[posts/:id PATCH role] service role not configured");
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    const roleRes = await loadOrgRole(createSupabaseServiceClient(), prior.org_id, user.id);
    if (!roleRes.ok) {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (!roleRes.role || !EDIT_AS_ORG_ROLES.includes(roleRes.role)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Only owner / admin can post as the org",
          code: "owner_admin_only",
        },
        { status: 403 },
      );
    }
  }

  const patch: { content?: string; tags?: string[]; status?: "draft" | "published" } = {};

  if ("content" in body) {
    const c = checkPostEdit(body.content, !!prior.media_url);
    if (!c.ok) {
      return NextResponse.json({ ok: false, error: c.error }, { status: 400 });
    }
    // Unchanged text writes nothing, so a same-text save moves neither the
    // tags nor the trigger's "Edited" stamp. A legacy null caption counts as
    // "" here, so clearing an already-empty caption isn't an edit either.
    if (c.content !== (prior.content ?? "")) {
      patch.content = c.content;
      patch.tags = extractPostTags(c.content);
    }
  }

  let didPublish = false;
  if (typeof body.status === "string") {
    if (body.status !== "draft" && body.status !== "published") {
      return NextResponse.json(
        { ok: false, error: "Invalid status" },
        { status: 400 },
      );
    }
    // The `posts_stamp_edited` trigger refuses any status change on a
    // published post (42501). Answer it here, before the UPDATE, so the
    // client gets a 400 it can map instead of a 500.
    if (body.status === "draft" && prior.status === "published") {
      return NextResponse.json(
        {
          ok: false,
          error: "A published post can't go back to draft.",
          code: "already_published",
        },
        { status: 400 },
      );
    }
    patch.status = body.status;
    if (body.status === "published" && prior.status === "draft") {
      didPublish = true;
    }
  }

  if (Object.keys(patch).length === 0) {
    // Through the serializer: `prior.media_url` is a raw R2 key or URL.
    return NextResponse.json({ ok: true, post: withPostMediaUrls(prior) });
  }

  // `edited_at` is never in `patch`; the trigger owns it and the select
  // returns whatever it set.
  const { data: updated, error: upErr } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(EDIT_COLS)
    .single();
  if (upErr || !updated) {
    console.error("[posts/:id PATCH]", upErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const row = updated as unknown as EditRow;

  // Club posts send no mentions, on publish or on edit: orgs/[slug]/posts
  // fans out none when a club post goes up, so an edit adding @handles to one
  // stays quiet too (otherwise a handle added later would notify while one in
  // the original text never did). Club posts can't be drafts (the org route
  // inserts with the `published` default), so this only ever skips the edit
  // branch.
  const sendsMentions = prior.org_id == null;

  if (didPublish && sendsMentions) {
    // First-publish fan-out: the draft is being promoted to published this
    // very PATCH, so every @mention in its final text notifies, as
    // publish-post does. A draft was never visible, so none were sent before.
    const finalContent =
      typeof patch.content === "string" ? patch.content : (prior.content ?? "");
    if (finalContent) {
      const handles = extractMentionHandles(finalContent);
      if (handles.length > 0) {
        try {
          const ids = await resolveMentionedUserIds(supabase, handles, user.id);
          if (ids.length > 0) {
            // Written with the service role (T2 A4): students can't insert
            // notifications themselves. This runs only after the UPDATE
            // above succeeded, and the actor is the signed-in author.
            if (!isSupabaseServiceConfigured()) {
              console.error("[posts/:id PATCH mentions] service role not configured");
            } else {
              await insertMentionNotifications(createSupabaseServiceClient(), {
                actorId: user.id,
                targetUserIds: ids,
                kind: "post",
                postId: row.id,
              });
            }
          }
        } catch (e) {
          console.error("[posts/:id PATCH mentions]", e);
        }
      }
    }
  } else if (
    sendsMentions &&
    prior.status === "published" &&
    typeof patch.content === "string"
  ) {
    // An edit to a published post: only handles this edit ADDED, and only
    // people who don't already hold a mention notification from this author
    // for this post (so remove + re-add stays quiet).
    try {
      const handles = addedHandles(
        extractMentionHandles(prior.content ?? ""),
        extractMentionHandles(patch.content),
      );
      const ids = await resolveMentionedUserIds(supabase, handles, user.id);
      // No service role means the "already notified" check can't run, and
      // notifying without it could repeat a mention. Notify nobody instead.
      if (ids.length > 0 && isSupabaseServiceConfigured()) {
        // One service client for the "already notified" read and the insert
        // (T2 A4: the insert is service-role only).
        const service = createSupabaseServiceClient();
        const { data: existing, error: seenErr } = await service
          .from("notifications")
          .select("user_id")
          .eq("type", "mention")
          .eq("post_id", id)
          .eq("actor_id", user.id)
          .in("user_id", ids);
        if (seenErr) {
          console.error("[posts/:id PATCH mentions]", seenErr);
        } else {
          const already = new Set(
            ((existing ?? []) as { user_id: string | null }[]).map((n) => String(n.user_id)),
          );
          const fresh = ids.filter((uid) => !already.has(uid));
          if (fresh.length > 0) {
            await insertMentionNotifications(service, {
              actorId: user.id,
              targetUserIds: fresh,
              kind: "post",
              postId: row.id,
            });
          }
        }
      }
    } catch (e) {
      console.error("[posts/:id PATCH mentions]", e);
    }
  }

  return NextResponse.json({ ok: true, post: withPostMediaUrls(row) });
}
