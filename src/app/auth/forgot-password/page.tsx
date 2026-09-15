"use client";

import Link from "next/link";
import { useState } from "react";

/** The per-IP limit resets in 15 minutes; the per-email one can take up to an hour, which Retry-After reports. */
const DEFAULT_RETRY_MINUTES = 15;

function tooManyRequestsCopy(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  const minutes =
    Number.isFinite(seconds) && seconds > DEFAULT_RETRY_MINUTES * 60
      ? Math.ceil(seconds / 60)
      : DEFAULT_RETRY_MINUTES;
  return `Too many reset requests. Try again in ${minutes} minutes.`;
}

const UNAVAILABLE_COPY =
  "Password reset isn't available right now. Try again in a few minutes.";

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
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">
                Personal email (the one you log in with)
              </span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@gmail.com"
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
      </div>
    </div>
  );
}

/** 16px keeps iOS Safari from zooming on focus. The shared input class is 16px too; this pins it for this page. */
const emailInputStyle: React.CSSProperties = {
  fontSize: 16,
};
