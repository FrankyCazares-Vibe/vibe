"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { sanitizeSchoolVerifyNextParam } from "@/lib/auth/login-next";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const INCOMPLETE =
  "This link is incomplete. Type the 8-digit code from the email on the Vibe page where you asked for it, or send a new one.";
const LINK_FAILED = "We couldn't verify this link. Try again, or send a new code.";

/**
 * leaveDeviceClean behind our own guard. It promises never to throw and to be
 * done within ~3 s; this makes sure, so a push clean-up problem can't stop
 * the sign-out after it: any error is dropped, and after 4 s we move on
 * whatever it's still doing.
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
 * The link's token (and next), per tab, once it's out of the address bar. A
 * reload still verifies, and "Sign in here to finish" still comes back with
 * it, but the token never sits in the URL where history and error reports
 * would keep it.
 */
const LINK_KEY = "vibe.schoolVerifyLink.v1";

type VerifyLink = { token: string; next: string | null };

function rememberLink(link: VerifyLink): void {
  try {
    window.sessionStorage.setItem(LINK_KEY, JSON.stringify(link));
  } catch {
    // Private mode / blocked storage: a reload just loses the link.
  }
}

function readStoredLink(): VerifyLink | null {
  try {
    const raw = window.sessionStorage.getItem(LINK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<VerifyLink> | null;
    if (!v || typeof v.token !== "string" || !v.token) return null;
    return { token: v.token, next: typeof v.next === "string" ? v.next : null };
  } catch {
    return null;
  }
}

function forgetLink(): void {
  try {
    window.sessionStorage.removeItem(LINK_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** The link from this URL (moved into this tab's storage, out of the URL), else the one this tab kept. */
function takeVerifyLink(): VerifyLink | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    const link = { token, next: params.get("next") || null };
    rememberLink(link);
    window.history.replaceState(null, "", window.location.pathname);
    return link;
  }
  return readStoredLink();
}

/** This link as a same-origin path, the way the email built it. */
function verifySchoolPath(link: VerifyLink): string {
  const next = link.next ? `&next=${encodeURIComponent(link.next)}` : "";
  return `/auth/verify-school?token=${encodeURIComponent(link.token)}${next}`;
}

/** Login with this link as ?next=, so signing in comes straight back and finishes. */
function loginHrefFor(link: VerifyLink): string {
  return `/auth/login?next=${encodeURIComponent(verifySchoolPath(link))}`;
}

/**
 * Copy for a failed confirm. Only answers written for students are shown: a
 * 400 (expired or broken link, not an IU address) and a 409 (claimed by
 * another account). A 5xx or a non-JSON page ("Server misconfiguration.",
 * "Could not update profile.", a Vercel error page) reads as "couldn't reach
 * Vibe", same as /auth/school-email.
 */
function verifyErrorCopy(status: number, data: { error?: string } | null): string {
  if (!data || status >= 500) return OFFLINE;
  if ((status === 400 || status === 409) && data.error) return data.error;
  return LINK_FAILED;
}

/**
 * res.json() that never throws: a Vercel HTML 500/504 page (or an empty
 * body) comes back as null so the caller can say "couldn't reach Vibe".
 */
async function readJson<T extends object>(res: Response): Promise<T | null> {
  try {
    const v: unknown = await res.json();
    return typeof v === "object" && v !== null ? (v as T) : null;
  } catch {
    return null;
  }
}

function VerifySchoolInner() {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<
    "idle" | "working" | "login" | "forbidden" | "ok" | "err"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [nextRaw, setNextRaw] = useState<string | null>(null);
  // This exact link, for login's ?next= so signing in comes straight back.
  const [loginHref, setLoginHref] = useState("/auth/login");
  // 403 card: the account this browser is signed in to (best effort), and
  // the sign-out step in front of login.
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Success: the account the IU email was added to.
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);

  // The sign-out button stays disabled while the page navigates away; re-arm
  // it if the browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSigningOut(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const link = takeVerifyLink();
      if (!link) {
        // The mail app cut the link: no token to send.
        setStatus("err");
        setMessage(INCOMPLETE);
        return;
      }
      setNextRaw(link.next);
      setLoginHref(loginHrefFor(link));
      setStatus("working");
      try {
        const res = await fetch("/api/auth/school-email/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: link.token }),
        });

        if (res.status === 401 || res.status === 403) {
          // Confirm requires the requesting account's session. No automatic
          // redirect: an email app's in-app browser isn't signed in, and a
          // silent jump to login read as "the link is broken". The card says
          // why, and signing in returns to this exact link (same-origin path
          // only) so the token is consumed once they are signed in.
          setStatus(res.status === 401 ? "login" : "forbidden");
          if (res.status === 403) {
            // Name the account that's signed in here, so "the other account"
            // means something. A local read; the card works without it.
            void getSupabaseBrowserClient()
              .auth.getSession()
              .then(({ data }) => setSignedInAs(data.session?.user.email ?? null))
              .catch(() => {});
          }
          return;
        }

        const data = await readJson<{
          ok?: boolean;
          error?: string;
          message?: string;
        }>(res);
        if (!data || !res.ok || !data.ok) {
          // Expired, broken, or claimed by another account: this token has
          // nothing left to retry. Anything else keeps it for a reload.
          if (data && (res.status === 400 || res.status === 409)) forgetLink();
          setStatus("err");
          setMessage(verifyErrorCopy(res.status, data));
          return;
        }
        forgetLink();
        setStatus("ok");
        setMessage(data.message ?? "Verified.");

        const nextPath =
          sanitizeSchoolVerifyNextParam(link.next) ?? "/onboarding";
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (!authErr && user) {
          setVerifiedFor(user.email ?? null);
          if (nextPath === "/profile") {
            router.replace("/profile?school_verified=1");
          } else {
            router.replace(nextPath);
          }
          router.refresh();
          return;
        }

        const loginNext =
          nextPath === "/profile"
            ? "/profile?school_verified=1"
            : nextPath;
        router.replace(
          `/auth/login?next=${encodeURIComponent(loginNext)}&school_verified=1`,
        );
      } catch {
        setStatus("err");
        setMessage(OFFLINE);
      }
    })();
  }, [router]);

  /**
   * 403 card. Login shows a signed-in visitor "Continue", which would bring
   * the same wrong account straight back to this card, so sign this browser
   * out first. Local scope: only this browser, never the account's other
   * devices. auth-js keeps the session when the logout call fails for any
   * reason but an expired/unknown session, so only move on once it's gone.
   */
  async function onSignOutAndSignIn() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    let leaving = false;
    try {
      // Take this device off the wrong account's push first: delete its row,
      // unsubscribe, clear the screen and the cached account data. BEFORE
      // signOut, because the row delete needs the session signOut ends (plan
      // §8 W7). If signOut then fails, the device just stays off push until
      // it's turned back on. Can't throw or navigate; over within 4 s.
      await leaveDeviceSafely({ serverDelete: true });
      const { error } = await getSupabaseBrowserClient().auth.signOut({
        scope: "local",
      });
      if (error) {
        setSignOutError(
          "We couldn't sign you out. Check your connection and try again.",
        );
        return;
      }
      leaving = true;
      // Full navigation so login and the proxy see the cleared cookies.
      window.location.assign(new URL(loginHref, window.location.origin).href);
    } catch {
      setSignOutError(
        "We couldn't sign you out. Check your connection and try again.",
      );
    } finally {
      if (!leaving) setSigningOut(false);
    }
  }

  if (status === "working" || status === "idle") {
    return (
      <p style={{ textAlign: "center", marginTop: 48, color: "#8A8580" }}>
        Verifying your school email…
      </p>
    );
  }

  if (status === "login") {
    return (
      <div className="vibe-auth-page">
        <div className="vibe-auth-card">
          <div className="vibe-auth-brand" aria-hidden>
            vibe<span className="vibe-auth-dot">.</span>
          </div>
          <h1 className="vibe-auth-headline">
            Almost there<span className="vibe-auth-dot">.</span>
          </h1>
          <p className="vibe-auth-sub">
            This link has to open where you&apos;re signed in to Vibe. Email
            apps often open links in their own browser, which isn&apos;t
            signed in.
          </p>
          <div className="vibe-auth-form">
            <Link href={loginHref} className="vibe-auth-submit">
              Sign in here to finish
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            </Link>
            <p className="vibe-auth-tip">
              Or go back to the Vibe tab where you asked for the email and
              type the 8-digit code from the same email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="vibe-auth-page">
        <div className="vibe-auth-card">
          <div className="vibe-auth-brand" aria-hidden>
            vibe<span className="vibe-auth-dot">.</span>
          </div>
          <h1 className="vibe-auth-headline vibe-auth-headline--compact">
            This link is for a different Vibe account
            <span className="vibe-auth-dot">.</span>
          </h1>
          <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
            {signedInAs ? (
              <>
                This browser is signed in as <strong>{signedInAs}</strong>, but
                a different account asked for this email.
              </>
            ) : (
              <>
                This browser is signed in to Vibe, but a different account
                asked for this email.
              </>
            )}
          </p>
          <div className="vibe-auth-form">
            <button
              type="button"
              className="vibe-auth-submit"
              disabled={signingOut}
              onClick={() => void onSignOutAndSignIn()}
              style={{ textAlign: "center" }}
            >
              {signingOut
                ? "Signing out…"
                : "Sign out and sign in with the other account"}
            </button>
            {signOutError ? (
              <p role="alert" className="vibe-auth-error">
                {signOutError}
              </p>
            ) : null}
            <p className="vibe-auth-tip">
              Or type the 8-digit code from the same email in the account that
              asked for it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "err") {
    return (
      <div className="vibe-auth-page">
        <div className="vibe-auth-card">
          <div className="vibe-auth-brand" aria-hidden>
            vibe<span className="vibe-auth-dot">.</span>
          </div>
          <h1 className="vibe-auth-headline vibe-auth-headline--compact">
            Couldn&apos;t verify your school email
          </h1>
          <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
            {message}
          </p>
          <div className="vibe-auth-form">
            <Link href="/auth/school-email" className="vibe-auth-submit">
              Send a new code
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const nextPath = sanitizeSchoolVerifyNextParam(nextRaw) ?? "/onboarding";

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", paddingTop: 48 }}>
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 32,
          fontWeight: 900,
          color: "#1C5C2E",
          marginBottom: 16,
        }}
      >
        You&apos;re verified
      </h1>
      <p style={{ color: "#8A8580", marginBottom: verifiedFor ? 8 : 24 }}>
        {message}
      </p>
      {verifiedFor ? (
        <p
          style={{
            color: "#5C5956",
            fontSize: 14,
            marginBottom: 24,
            overflowWrap: "anywhere",
          }}
        >
          Added to the Vibe account <strong>{verifiedFor}</strong>.
        </p>
      ) : null}
      <p style={{ color: "#5C5956", fontSize: 14, marginBottom: 20 }}>
        {nextPath === "/profile"
          ? "Taking you to your profile…"
          : "Taking you to meet Otto — or sign in if this browser isn’t logged in yet."}
      </p>
      <p
        style={{
          color: "#8A8580",
          fontSize: 13,
          lineHeight: 1.55,
          marginBottom: 20,
        }}
      >
        School links often open in your email app&apos;s browser, which doesn&apos;t
        share cookies with Safari or Chrome. If we send you to log in, use your{" "}
        <strong>sign-up email and password</strong> — then we&apos;ll continue
        where you left off.
      </p>
      <Link
        href={
          nextPath === "/profile"
            ? "/profile?school_verified=1"
            : `/auth/login?next=${encodeURIComponent(nextPath)}&school_verified=1`
        }
        className="vibe-auth-link--tap"
        style={linkStyle}
      >
        Continue manually
      </Link>
    </div>
  );
}

export default function VerifySchoolPage() {
  return <VerifySchoolInner />;
}

const linkStyle: CSSProperties = {
  color: "#FF5C35",
  textDecoration: "none",
  fontSize: 16,
};
