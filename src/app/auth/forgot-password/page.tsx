"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The per-network limit resets in 15 minutes; the per-address ones can take
 * up to an hour or a day, which Retry-After reports
 * (src/lib/auth/password-reset-limits.ts).
 */
const DEFAULT_RETRY_MINUTES = 15;

const UNAVAILABLE_COPY =
  "Password reset isn't available right now. Try again in a few minutes.";

function tooManyRequestsCopy(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  const known = retryAfter !== null && Number.isFinite(seconds) && seconds > 0;
  // A wait shorter than the shortest limit isn't a limit at all: the server
  // couldn't count the request and refused it to be safe.
  if (known && seconds < DEFAULT_RETRY_MINUTES * 60) return UNAVAILABLE_COPY;
  // Over an hour is the per-address daily limit. It resets at midnight UTC,
  // which is evening in Indiana, so "tomorrow" could be too early: 24 hours
  // is the longest the wait can be.
  if (known && seconds > 60 * 60) {
    return "Too many reset requests. Try again in 24 hours.";
  }
  const minutes =
    known && seconds > DEFAULT_RETRY_MINUTES * 60
      ? Math.ceil(seconds / 60)
      : DEFAULT_RETRY_MINUTES;
  return `Too many reset requests. Try again in ${minutes} minutes.`;
}

/**
 * What to tell the student after POST /api/auth/password-reset, or null when
 * the request went through. Never the server's own text: a 503 carries a
 * config message meant for us, and a 5xx from the host may not be JSON.
 */
function resetRequestError(
  status: number,
  retryAfter: string | null,
  body: unknown,
): string | null {
  if (status === 429) return tooManyRequestsCopy(retryAfter);
  const ok =
    status >= 200 &&
    status < 300 &&
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === true;
  return ok ? null : UNAVAILABLE_COPY;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    setError(null);
    setSentTo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body: unknown = await res.json().catch(() => null);
      const failure = resetRequestError(
        res.status,
        res.headers.get("retry-after"),
        body,
      );
      if (failure) {
        setError(failure);
        return;
      }
      // The server answers the same way whether or not the account exists,
      // so this copy never claims an email was sent.
      setSentTo(address);
    } catch {
      setError("We couldn't reach Vibe. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/auth/login" className="vibe-auth-back">
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Reset password<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          We’ll email you a link to set a new password.
        </p>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          <label className="vibe-auth-field">
            {/* Reads exactly like the sign-in page's field: new students sign
                up with their school address, and the answer below is the same
                whether or not the address has an account, so this label is
                the only guidance they get. */}
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Email</span>
              <span className="vibe-auth-label-hint">the one you signed up with</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@iu.edu"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vibe-auth-input"
              style={emailInputStyle}
            />
          </label>

          {error ? (
            <p className="vibe-auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {sentTo ? (
            <div
              className="vibe-auth-banner vibe-auth-banner--success"
              role="status"
              style={{ overflowWrap: "anywhere" }}
            >
              If an account exists for {sentTo}, a reset link is on its way.
              Only the newest reset email works. Not there after a minute?
              Check Spam or Junk.
            </div>
          ) : null}

          <button type="submit" disabled={loading} className="vibe-auth-submit">
            {loading ? "Sending…" : "Send reset link"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          <Link href="/auth/login" className="vibe-auth-link">
            Back to log in
          </Link>
        </p>
        {/* The policy and the Terms, the same line the sign-in page ends on. */}
        <p className="vibe-auth-tail" style={{ marginTop: 28, fontSize: 12.5 }}>
          <Link href="/legal/privacy" className="vibe-auth-link--tap" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/legal/terms" className="vibe-auth-link--tap" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}

/** 16px keeps iOS Safari from zooming on focus. The shared input class is 16px too; this pins it for this page. */
const emailInputStyle: React.CSSProperties = {
  fontSize: 16,
};
