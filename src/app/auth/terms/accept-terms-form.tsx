"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MIN_AGE, TERMS_VERSION } from "@/lib/legal/terms";
import { openInBrowser } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";
import { clearDraft } from "@/lib/onboarding/draft";
import { pushLogoutBody } from "@/lib/pwa/device-push";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";

const GENERIC_ERROR = "Couldn't save your agreement. Please try again.";

/**
 * leaveDeviceClean behind our own guard. It promises never to throw and to be
 * done within ~3 s; this makes sure, so a push clean-up problem can't stop
 * Sign out: any error is dropped, and after 4 s we move on whatever it's
 * still doing.
 */
function leaveDeviceSafely(opts: { serverDelete: boolean }): Promise<void> {
  return Promise.race([
    Promise.resolve()
      .then(() => leaveDeviceClean(opts))
      .catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

/**
 * The Terms and Privacy links open in a new tab so the student can read them
 * and come back to the checkbox. The store apps have no new tab: the iPhone
 * app hands it to Safari and the Android app would load it over this page.
 * So there the page opens in the in-app browser sheet, on top of this one
 * (plan §6 S2D). The default is stopped first, so the app's own link handler
 * leaves this click alone (critic-s2s3.md item 4).
 */
function openLegalInApp(e: React.MouseEvent<HTMLAnchorElement>) {
  if (appShellOnClient() === null) return;
  e.preventDefault();
  void openInBrowser(e.currentTarget.href);
}

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
  const [signingOut, setSigningOut] = useState(false);

  // Sign out holds both buttons while the page navigates away; re-arm them if
  // the browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSigningOut(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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
    if (signingOut) return;
    setSigningOut(true);
    let signedOut = false;
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // This device's push address, so the route drops its row too, even
        // one another account left behind on this phone (plan §8 W7).
        body: JSON.stringify(pushLogoutBody()),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      signedOut = res.ok && data.ok === true;
    } catch {
      // Best-effort; the login page copes with a lingering session.
    }
    // Take this device off push, close what's still on screen and drop the
    // account's cached data: the student thinks they've signed out either
    // way. After a good logout the route already dropped every row, so no
    // server delete (plan §8 W7). After a failed one the session is likely
    // still alive, so delete this device's row ourselves (critic-w3 item 22).
    // It can't throw or navigate and is over within 4 s.
    await leaveDeviceSafely({ serverDelete: !signedOut });
    // Drop every onboarding draft on this browser (no id), same as the
    // Settings sign-out. Hard reload (same as Settings) so the cookie clear
    // is reflected everywhere and the next nav lands on /auth/login.
    clearDraft();
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
                onClick={openLegalInApp}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
                onClick={openLegalInApp}
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
            disabled={loading || signingOut || !agreed}
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
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            className="vibe-auth-link"
          >
            {signingOut ? "signing out…" : "sign out"}
          </button>
          {signingOut ? "" : "."}
        </p>
      </div>
    </div>
  );
}
