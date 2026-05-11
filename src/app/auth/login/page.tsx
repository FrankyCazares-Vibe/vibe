"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { getPostLoginDestination } from "@/lib/auth/post-login";
import { sanitizeLoginNextParam } from "@/lib/auth/login-next";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const urlError = searchParams.get("error");
  const schoolVerifiedHint = searchParams.get("school_verified") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data: signData, error: signErr } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
    if (signErr) {
      setLoading(false);
      setError(signErr.message);
      return;
    }
    if (!signData.session) {
      setLoading(false);
      setError("No session returned — check your email and password.");
      return;
    }
    const dest = await getPostLoginDestination(
      supabase,
      sanitizeLoginNextParam(searchParams.get("next")),
    );
    // Full navigation so middleware always sees the new auth cookies.
    window.location.assign(dest);
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
          Welcome back<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Use your <strong>personal email</strong> — the one you actually check.
          Your school <code className="vibe-auth-code">.edu</code> is verified
          separately.
        </p>

        {schoolVerifiedHint ? (
          <div className="vibe-auth-banner vibe-auth-banner--success">
            <strong>Campus email verified.</strong> Sign in with the personal
            email you used to sign up — we&apos;ll take you right back where you
            left off.
          </div>
        ) : null}

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
              <Link href="/auth/forgot-password" className="vibe-auth-label-link">
                Forgot?
              </Link>
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          {error ? <p className="vibe-auth-error">{error}</p> : null}
          {urlError === "auth_callback" ? (
            <p className="vibe-auth-error">
              That confirmation link is invalid or expired. Sign in if you
              already confirmed your email, or sign up again.
            </p>
          ) : null}

          <button type="submit" disabled={loading} className="vibe-auth-submit">
            {loading ? "Signing in…" : "Sign in"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          New to vibe?{" "}
          <Link href="/auth/signup" className="vibe-auth-link">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="vibe-auth-page">
          <p className="vibe-auth-loading">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
