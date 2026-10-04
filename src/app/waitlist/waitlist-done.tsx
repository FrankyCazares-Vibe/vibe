"use client";

import Link from "next/link";

import { WAITLIST_RETENTION_DAYS } from "@/lib/waitlist/types";

const CLUB_HREF = "mailto:help@connectvibe.app?subject=Bring%20my%20club%20to%20Vibe";

/**
 * After a submit. The same words whatever happened on the server (new, on
 * the list already, confirmed, a member, a limit): the form can't be used to
 * learn who is on the list. The address shown is the one this person just
 * typed, so a typo is easy to spot.
 */
export function WaitlistDone({ email, onStartOver }: { email: string; onStartOver: () => void }) {
  return (
    <section className="vln-panel" aria-labelledby="vwl-done-title">
      <header className="vln-panel-head">
        <b>02</b>
        <span>Check your inbox</span>
      </header>
      {/* Focus lands here after a submit, so the change is announced. */}
      <h1 id="vwl-done-title" tabIndex={-1} style={{ outline: "none" }}>
        Check your school inbox.
      </h1>
      <p role="status">
        Unless <strong>{email}</strong> is already confirmed, a link from Vibe is on its way. Tap{" "}
        <strong>Confirm my spot</strong> in that email to hold your place.
      </p>
      <p>
        Already confirmed? You’re on the list, and we’ll email you an access code when it’s your turn. A spot lasts up
        to {WAITLIST_RETENTION_DAYS} days; after that you can join again.
      </p>
      <p>
        Already got your access code?{" "}
        <Link href="/auth/signup" className="vwl-quiet">
          Create your account
        </Link>
      </p>
      <p>Nothing after a few minutes? Check your junk folder.</p>
      <div className="vwl-actions">
        <button type="button" className="vwl-quiet" onClick={onStartOver}>
          Wrong address? Start over
        </button>
      </div>
      <div className="vwl-more">
        <p>
          Already have an account?{" "}
          <Link href="/auth/login" className="vwl-quiet">
            Log in
          </Link>
        </p>
        <p>
          Run a club?{" "}
          <a href={CLUB_HREF} className="vwl-quiet">
            Bring your club
          </a>
        </p>
      </div>
    </section>
  );
}
