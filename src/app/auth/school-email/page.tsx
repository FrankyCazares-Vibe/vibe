"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * True when the previous history entry is a Vibe page, so "← back" can step
 * back to it instead of leaving the app.
 */
function hasInAppHistory(): boolean {
  // The Navigation API only lists same-origin entries, so this is exact.
  const nav = (window as Window & { navigation?: { canGoBack?: boolean } }).navigation;
  if (typeof nav?.canGoBack === "boolean") return nav.canGoBack;
  // Elsewhere: something to go back to, and a referrer that's ours.
  if (window.history.length <= 1 || !document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

function SchoolEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [schoolEmail, setSchoolEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const justVerifiedAccount = searchParams.get("account_verified") === "1";

  // Strip the param after we've consumed it so the success banner doesn't
  // re-appear on refresh.
  useEffect(() => {
    if (!justVerifiedAccount) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("account_verified");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [justVerifiedAccount, router, searchParams]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let timeoutId: number | undefined;
    let unsub: (() => void) | undefined;

    void (async () => {
      for (let i = 0; i < 20; i++) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          setAuthChecked(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 75));
      }

      if (cancelled) return;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_evt, session) => {
        if (cancelled) return;
        if (session?.user) {
          setAuthChecked(true);
          subscription.unsubscribe();
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      });
      unsub = () => subscription.unsubscribe();

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        subscription.unsubscribe();
        void supabase.auth.getUser().then(({ data: { user: u2 } }) => {
          if (cancelled) return;
          if (u2) setAuthChecked(true);
          else router.replace("/auth/login?next=/auth/school-email");
        });
      }, 4000);
    })();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      unsub?.();
    };
  }, [router]);

  function onBack(e: React.MouseEvent<HTMLAnchorElement>) {
    // Modified clicks (new tab, new window) keep the plain /campus link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!hasInAppHistory()) return;
    e.preventDefault();
    router.back();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/school-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolEmail: schoolEmail.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        message?: string;
      };
      if (res.status === 403 && data.code === "terms_required") {
        // Consent must be on record before verification (S53 A4); the
        // interstitial brings the user straight back here.
        router.replace("/auth/terms?next=/auth/school-email");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }
      setMessage(data.message ?? "Check your inbox.");
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="vibe-auth-page">
        <p className="vibe-auth-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      {/* Back to wherever the student came from inside Vibe; with nothing
          to go back to (they opened the email link) it's /campus, never
          "/", which is the logged-out landing page. */}
      <Link href="/campus" className="vibe-auth-back" onClick={onBack}>
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        {justVerifiedAccount ? (
          <div className="vibe-auth-banner vibe-auth-banner--success">
            <strong>You&apos;re confirmed.</strong> Your login email is set.
            One last verification: add your <strong>IU email</strong> (@iu.edu
            or @iupui.edu) so we know you&apos;re actually on campus.
          </div>
        ) : null}

        <h1 className="vibe-auth-headline">
          Verify your campus<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Drop in your <strong>IU email</strong> — the{" "}
          <code className="vibe-auth-code vibe-auth-code--edu">@iu.edu</code>{" "}
          or{" "}
          <code className="vibe-auth-code vibe-auth-code--edu">@iupui.edu</code>{" "}
          one, not the one you signed up with. We&apos;ll email a verification
          link to <em>that</em> inbox.
        </p>

        <div className="vibe-auth-steps" aria-hidden>
          <div className="vibe-auth-step vibe-auth-step--done">
            <span className="vibe-auth-step-num">✓</span>
            <span className="vibe-auth-step-label">Account</span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step vibe-auth-step--active vibe-auth-step--edu">
            <span className="vibe-auth-step-num">2</span>
            <span className="vibe-auth-step-label">
              <code className="vibe-auth-code vibe-auth-code--edu">iu.edu</code>
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
              <span className="vibe-auth-label">School email</span>
              <span className="vibe-auth-label-hint vibe-auth-label-hint--edu">
                @iu.edu or @iupui.edu
              </span>
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="you@iu.edu"
              value={schoolEmail}
              onChange={(e) => setSchoolEmail(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          {error ? <p className="vibe-auth-error">{error}</p> : null}
          {message ? (
            <div className="vibe-auth-banner vibe-auth-banner--success">
              {message}
            </div>
          ) : null}

          <button type="submit" disabled={loading} className="vibe-auth-submit">
            {loading ? "Sending…" : "Send verification link"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          Wrong email used to sign up?{" "}
          <Link href="/auth/login" className="vibe-auth-link">
            Log back in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SchoolEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="vibe-auth-page">
          <p className="vibe-auth-loading">Loading…</p>
        </div>
      }
    >
      <SchoolEmailInner />
    </Suspense>
  );
}
