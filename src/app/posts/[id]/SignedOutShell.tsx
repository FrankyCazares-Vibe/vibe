"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * What a signed-out visitor gets at `/posts/[id]` (feature report 3, #5).
 *
 * The page used to answer a 307 to the login page, so iMessage, Discord and
 * Slack, which build a link's preview while signed out, followed it and
 * previewed the login page's generic card instead of the post. Now the page
 * answers 200 with the post's own preview tags (generateMetadata) and this
 * shell, the same for EVERY id (no existence read on the signed-out path, so
 * a 404-vs-200 split never tells strangers which ids exist).
 *
 * A person still lands on the login page as before: the browser is sent
 * there on mount, with this post as `next`; the card stays for the moment
 * before that, and for anyone whose browser runs no script.
 */
export function SignedOutShell({ postId }: { postId: string }) {
  const router = useRouter();
  const loginHref = `/auth/login?next=${encodeURIComponent(`/posts/${postId}`)}`;
  useEffect(() => {
    router.replace(loginHref);
  }, [router, loginHref]);
  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>
        <h1 className="vibe-auth-headline">
          Sign in to see this post<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Vibe is the social app for students at IU and Purdue. Sign in and this post opens right
          after.
        </p>
        <Link href={loginHref} className="vibe-auth-submit" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Sign in <span aria-hidden>&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
