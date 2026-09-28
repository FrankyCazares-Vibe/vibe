import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { getActiveRestriction } from "@/lib/moderation/access";
import { withPostMediaUrls } from "@/lib/post-media-url";
import { postPreviewIsPublic, type RestrictionState } from "@/lib/profile/hidden-fields";
import { loadPairBlock } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { PostPageClient } from "./PostPageClient";

type Params = { params: Promise<{ id: string }> };

/**
 * Public post share page — `/posts/[id]`. Share-link target both
 * inside the app (Copy link from the post 3-dot menu) and outside
 * (paste into iMessage / Discord / Twitter, etc).
 *
 * The page itself reuses PostViewerMobile (full-screen vaul-drawer
 * style) on both viewports. The viewer fetches its own data via
 * /api/posts/[id], so we don't have to plumb a full payload through
 * the page. SSR's job is just OG meta + a 404 if the post doesn't
 * exist or has been deleted.
 *
 * OG meta is built via `generateMetadata` so iMessage / Discord
 * previews render the post's author + content snippet + image. We
 * use the service-role Supabase client for the meta fetch, so NO RLS
 * stands behind it: this function restates the rules the database applies
 * to signed-in students (S67 security wave 2, A1; report #7). A post a
 * moderator removed, a hidden club's post, and a post whose author is
 * suspended or banned (or whose restriction can't be read) all get the
 * generic card below: no author, no text, no image. Public clubs' posts keep
 * their preview (product call 3). Every failure falls back to generic.
 */
const GENERIC_POST_METADATA: Metadata = { title: "Post · Vibe" };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!id) return GENERIC_POST_METADATA;

  try {
    const service = createSupabaseServiceClient();
    const { data: row, error } = await service
      .from("posts")
      .select(
        "id,type,content,media_url,media_thumbnail_url,user_id,org_id,removed_at," +
          "author:users!posts_user_id_fkey(name,handle),org:orgs!posts_org_id_fkey(hidden_at)",
      )
      .eq("id", id)
      .eq("status", "published")
      .is("removed_at", null)
      .maybeSingle();
    if (error || !row) return GENERIC_POST_METADATA;
    const gate = row as unknown as {
      user_id: string;
      org_id: string | null;
      removed_at: string | null;
      org: { hidden_at: string | null } | { hidden_at: string | null }[] | null;
    };
    const orgObj = Array.isArray(gate.org) ? gate.org[0] : gate.org;
    const restriction = await getActiveRestriction(gate.user_id);
    const author: RestrictionState = !restriction.ok
      ? "unknown"
      : restriction.restriction
        ? "restricted"
        : "none";
    const isPublic = postPreviewIsPublic({
      removedAt: gate.removed_at,
      orgId: gate.org_id,
      orgHiddenAt: orgObj ? orgObj.hidden_at : undefined,
      author,
    });
    if (!isPublic) return GENERIC_POST_METADATA;
    // A signed-in viewer in a block pair with the author gets the generic
    // card too: otherwise the tab title shows them the words RLS now hides
    // from them (S67 wave 2, A2). A failed block read is generic as well.
    const viewerClient = await createSupabaseServerClient();
    const {
      data: { user: viewer },
    } = await viewerClient.auth.getUser();
    if (viewer && viewer.id !== gate.user_id) {
      const pair = await loadPairBlock(service, viewer.id, gate.user_id);
      if (!pair.ok || pair.blocked) return GENERIC_POST_METADATA;
    }
    // PostgREST embed shape varies by FK config — author can come back
    // as a single object or a 1-element array. Cast through unknown
    // and normalize once below.
    const raw = row as unknown as {
      id: string;
      type: string;
      content: string | null;
      media_url: string | null;
      media_thumbnail_url: string | null;
      author:
        | { name: string | null; handle: string | null }
        | { name: string | null; handle: string | null }[]
        | null;
    };
    const authorObj = Array.isArray(raw.author) ? raw.author[0] : raw.author;
    const post = withPostMediaUrls({
      ...raw,
      author: authorObj ?? null,
    });

    const authorLabel =
      post.author?.name ||
      (post.author?.handle ? `@${post.author.handle}` : "Vibe");
    const content = (post.content ?? "").trim();
    const titleSnippet = content
      ? content.slice(0, 60) + (content.length > 60 ? "…" : "")
      : "Post on Vibe";
    const title = `${authorLabel}: ${titleSnippet}`;
    const description =
      content.length > 140
        ? `${content.slice(0, 137)}…`
        : content || `${authorLabel} shared a ${post.type} on Vibe`;

    // Prefer the thumbnail (always an image) over the media URL, which
    // on clips is a video. Both are already proxy URLs (R2 keys routed
    // through /api/posts/[id]/media), so previews that don't pass auth
    // headers can still render the image.
    const ogImage = post.media_thumbnail_url ?? post.media_url;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
      twitter: {
        card: ogImage ? "summary_large_image" : "summary",
        title,
        description,
        images: ogImage ? [ogImage] : undefined,
      },
    };
  } catch {
    return GENERIC_POST_METADATA;
  }
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  if (!id) notFound();

  // Auth gate FIRST (S67 security wave 2, A1). OG meta (generateMetadata)
  // renders without auth so share-link previews work for cold visitors, but
  // actually clicking through requires a logged-in session — the viewer
  // fetches via /api/posts/[id] which is auth-only. Send unauthed users to
  // login with this URL as `next` so they bounce back after signing in.
  // Checked before the existence read so a signed-out visitor gets the same
  // redirect for every id: a 404-vs-redirect split told strangers which post
  // ids exist (removed ones included).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/posts/${id}`)}`);
  }

  // Existence check on the server so we 404 cleanly instead of
  // mounting the viewer and letting it 404 client-side. Uses the
  // service client to skip RLS — the viewer's GET will still enforce
  // auth + visibility once the page mounts. Deliberately NO removed_at
  // filter: GET /api/posts/[id] serves a removed post to its AUTHOR so they
  // can read the removal notice here; filtering would 404 them first.
  const service = createSupabaseServiceClient();
  const { data: row } = await service
    .from("posts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  return <PostPageClient postId={id} />;
}
