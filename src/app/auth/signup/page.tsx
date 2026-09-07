"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getAuthEmailCallbackUrl } from "@/lib/auth/email-confirm-redirect";
import {
  MIN_AGE,
  TERMS_METADATA_KEYS,
  TERMS_VERSION,
} from "@/lib/legal/terms";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!agreed) {
      setError(
        `Confirm you're ${MIN_AGE} or older and agree to the Terms to create an account.`,
      );
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthEmailCallbackUrl(siteOrigin),
        // Lands in auth.users.raw_user_meta_data; the on_auth_user_created
        // trigger copies it into users.terms_version / terms_accepted_at /
        // age_attested_at so the consent record is born with the row.
        data: {
          [TERMS_METADATA_KEYS.version]: TERMS_VERSION,
          [TERMS_METADATA_KEYS.age]: true,
        },
      },
    });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    if (data.session) {
      router.push("/auth/school-email");
      router.refresh();
      return;
    }
    setMessage(
      "Check this inbox for a confirmation link. Once you click it, we’ll ask for your campus .edu next.",
    );
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/" className="vibe-auth-back">
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Create your account<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Use your <strong>personal email</strong> — the one you actually check.
          Your school <code className="vibe-auth-code">.edu</code> is verified
          separately in the next step.
        </p>

        <div className="vibe-auth-steps" aria-hidden>
          <div className="vibe-auth-step vibe-auth-step--active">
            <span className="vibe-auth-step-num">1</span>
            <span className="vibe-auth-step-label">Account</span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">2</span>
            <span className="vibe-auth-step-label">
              <code className="vibe-auth-code">.edu</code>
            </span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">3</span>
            <span className="vibe-auth-step-label">Otto</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Personal email</span>
              <span className="vibe-auth-label-hint">not your .edu</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@gmail.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Password</span>
              <span className="vibe-auth-label-hint">8–20 characters</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={20}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          <label
            className={`vibe-auth-consent${agreed ? " vibe-auth-consent--checked" : ""}`}
          >
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby="signup-consent-note"
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
            <p id="signup-consent-note" className="vibe-auth-consent-note">
              Required — check the box above to create your account.
            </p>
          ) : null}

          {error ? <p className="vibe-auth-error">{error}</p> : null}
          {message ? (
            <div className="vibe-auth-banner vibe-auth-banner--success">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !agreed}
            className={`vibe-auth-submit${!agreed ? " vibe-auth-submit--locked" : ""}`}
          >
            {loading ? "Creating…" : "Create account"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          Already have an account?{" "}
          <Link href="/auth/login" className="vibe-auth-link">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
