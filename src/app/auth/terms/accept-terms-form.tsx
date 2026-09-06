"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_AGE, TERMS_VERSION } from "@/lib/legal/terms";

const GENERIC_ERROR = "Couldn't save your agreement. Please try again.";

/**
 * Client half of the `/auth/terms` interstitial: the same 18+ / Terms /
 * Privacy checkbox as signup, plus a Continue button that records the
 * agreement server-side and then moves on to `next`.
 */
export function AcceptTermsForm({ next }: { next: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agreed) {
      setError(
        `Confirm you're ${MIN_AGE} or older and agree to the Terms to continue.`,
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/me/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_version: TERMS_VERSION }),
      });
      if (res.status === 401) {
        // Session expired under us — bounce through login and come back.
        const returnTo = `/auth/terms?next=${encodeURIComponent(next)}`;
        router.replace(`/auth/login?next=${encodeURIComponent(returnTo)}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? GENERIC_ERROR);
        setLoading(false);
        return;
      }
      // Keep the button in its busy state while we navigate; the server
      // pages re-read terms_accepted_at, so refresh to drop any stale RSC.
      router.push(next);
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
      setLoading(false);
    }
  }

  async function onSignOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Best-effort; the login page copes with a lingering session.
    }
    // Hard reload (same as Settings) so the cookie clear is reflected
    // everywhere and the next nav lands on /auth/login.
    window.location.href = "/auth/login";
  }

  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          One quick thing<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          We now record your agreement to the{" "}
          <strong>Terms of Service</strong> and{" "}
          <strong>Privacy Policy</strong>, and that you&apos;re{" "}
          <strong>{MIN_AGE} or older</strong> — the age the Terms require.
          One tap and you won&apos;t see this again.
        </p>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          <label
            className={`vibe-auth-consent${agreed ? " vibe-auth-consent--checked" : ""}`}
          >
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby="terms-consent-note"
            />
            <span>
              I&apos;m <strong>{MIN_AGE} or older</strong> and I agree to the{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {!agreed ? (
            <p id="terms-consent-note" className="vibe-auth-consent-note">
              Required — check the box above to continue.
            </p>
          ) : null}

          {error ? <p className="vibe-auth-error">{error}</p> : null}

          <button
            type="submit"
            disabled={loading || !agreed}
            className={`vibe-auth-submit${!agreed ? " vibe-auth-submit--locked" : ""}`}
          >
            {loading ? "Saving…" : "Continue"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          Don&apos;t agree? You can{" "}
          <Link href="/settings#delete-account" className="vibe-auth-link">
            delete your account
          </Link>{" "}
          instead, or{" "}
          <button type="button" onClick={onSignOut} className="vibe-auth-link">
            sign out
          </button>
          .
        </p>
      </div>
    </div>
  );
}
