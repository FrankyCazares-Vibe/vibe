import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found · Vibe",
  openGraph: { title: "Vibe", description: "That page isn't here." },
  twitter: { title: "Vibe", description: "That page isn't here." },
};

/**
 * The app's own "not here" page, in the sign-in card's clothes, for every
 * `notFound()` in the app: an old or mistyped share link (a profile, a club,
 * a post) used to land on the framework's bare black page with no way in
 * (feature report 3, #17). It says nothing about WHY: a hidden club, a
 * removed post and a handle that never existed all read the same.
 */
export default function NotFound() {
  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>
        <h1 className="vibe-auth-headline">
          That page isn&apos;t here<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          The link may be old, mistyped, or for something that was taken down. Nothing of yours
          is affected.
        </p>
        <Link href="/campus" className="vibe-auth-submit" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          Go to Campus <span aria-hidden>&rarr;</span>
        </Link>
        <p className="vibe-auth-tail">
          Not signed in?{" "}
          <Link href="/auth/login" className="vibe-auth-link vibe-auth-link--tap">
            Sign in
          </Link>
          {" · "}
          <Link href="/" className="vibe-auth-link vibe-auth-link--tap">
            Home
          </Link>
        </p>
      </div>
    </div>
  );
}
