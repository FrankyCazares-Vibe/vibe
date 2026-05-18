"use client";

import { useRouter } from "next/navigation";

import { PostViewerMobile } from "@/components/mobile/PostViewerMobile";

/**
 * Client island for /posts/[id]. Renders PostViewerMobile (already a
 * full-screen vaul drawer that handles fetch / comments / like / save
 * / repost / report end-to-end). Close routes back to /campus rather
 * than dismissing the modal in place — there's no underlying surface
 * to fall back to on a standalone share-link landing.
 */
export function PostPageClient({ postId }: { postId: string }) {
  const router = useRouter();
  return (
    <PostViewerMobile
      postId={postId}
      onClose={() => router.push("/campus")}
      onDeleted={() => router.push("/campus")}
    />
  );
}
