import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { postMediaProxyUrl } from "@/lib/post-media-url";
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
 * use the service-role Supabase client for the meta fetch (no viewer
 * context needed — author/content/media are public attributes for
 * any post that survived RLS at create time).
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!id) return { title: "Post · Vibe" };

  try {
    const service = createSupabaseServiceClient();
    const { data: row } = await service
      .from("posts")
      .select(
        "id,type,content,media_url,media_thumbnail_url,author:users!posts_user_id_fkey(name,handle)",
      )
      .eq("id", id)
      .maybeSingle();
    if (!row) return { title: "Post · Vibe" };
    // PostgREST embed shape varies by FK config — author can come back
    // as a single object or a 1-element array. Cast through unknown
    // and normalize once below.
    const raw = row as unknown as {
      id: string;
      type: "post" | "clip";
      content: string | null;
      media_url: string | null;
      media_thumbnail_url: string | null;
      author:
        | { name: string | null; handle: string | null }
        | { name: string | null; handle: string | null }[]
        | null;
    };
    const authorObj = Array.isArray(raw.author) ? raw.author[0] : raw.author;
    const post = {
      ...raw,
      author: authorObj ?? null,
    };

    const authorLabel =
      post.author?.name ||
      (post.author?.handle ? `@${post.author.handle}` : "Vibe");
    const content = (post.content ?? "").trim();
    const titleSnippet = content
      ? content.slice(0, 60) + (content.length > 60 ? "…" : "")
      : post.type === "clip"
        ? "Clip on Vibe"
        : "Post on Vibe";
    const title = `${authorLabel}: ${titleSnippet}`;
    const description =
      content.length > 140
        ? `${content.slice(0, 137)}…`
        : content || `${authorLabel} shared a ${post.type} on Vibe`;

    // Prefer the thumbnail (always an image) over the raw media URL,
    // which on clips is a video. Pre-sign via the proxy so previews
    // that don't pass auth headers can still render the image.
    const ogImage = postMediaProxyUrl(
      post.id,
      post.media_thumbnail_url ?? post.media_url,
      post.media_thumbnail_url ? "thumbnail" : "media",
    );

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
    return { title: "Post · Vibe" };
  }
}

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  if (!id) notFound();

  // Existence check on the server so we 404 cleanly instead of
  // mounting the viewer and letting it 404 client-side. Uses the
  // service client to skip RLS — the viewer's GET will still enforce
  // auth + visibility once the page mounts.
  const service = createSupabaseServiceClient();
  const { data: row } = await service
    .from("posts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  // Auth gate. OG meta (generateMetadata) renders without auth so
  // share-link previews work for cold visitors, but actually clicking
  // through requires a logged-in session — the viewer fetches via
  // /api/posts/[id] which is auth-only. Send unauthed users to login
  // with this URL as `next` so they bounce back after signing in.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/posts/${id}`)}`);
  }

  return <PostPageClient postId={id} />;
}
