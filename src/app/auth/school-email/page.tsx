"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { SCHOOL_DOMAINS_HEADLINE_LABEL } from "@/lib/auth/school-email-domains";
import { isIosPlatform } from "@/lib/pwa/display-mode";
import { useIsStandalone, usePlatform } from "@/lib/pwa/use-standalone";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * "@iu.edu or @purdue.edu", from the code map. Never the env-aware label:
 * this is a client bundle, so an env read would render one thing on the
 * server and another after hydration.
 */
const SCHOOL_DOMAINS_LABEL = SCHOOL_DOMAINS_HEADLINE_LABEL;

const CODE_LENGTH = 8;
const RESEND_COOLDOWN_SEC = 60;
const LOGIN_HREF = "/auth/login?next=/auth/school-email";
// The onboarding server page forwards anyone already onboarded onward. Left
// as a full page load (absolute URL) so that server page renders fresh.
const ONBOARDING_PATH = "/onboarding";
const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const SIGNED_OUT =
  "You were signed out. Sign in, then type the same code again. It works for at least 30 minutes after we sent it.";
const SIGNED_OUT_SEND = "You were signed out. Sign in to send your school email.";
// The one 5xx body from /request written for students (a failed send). Any
// other 5xx text can name server config, so it shows OFFLINE instead. Newer
// servers also send `code: "send_failed"` and `attemptedTo`; this exact text
// stays the fallback match for a server that predates them.
const SEND_FAILED = "We couldn't send the email right now. Try again in a minute.";

/**
 * The address the last email went to, per tab, so the code box is still here
 * after "You were signed out. Sign in" sends the student through login and
 * back. Never in a URL. Bound to the account that asked (a code only works
 * for that user id) and to the 30-minute code window.
 */
const SENT_KEY = "vibe.schoolEmailSent.v1";
const SENT_TTL_MS = 30 * 60 * 1000;

type SentRecord = { sentTo: string; userId: string; at: number };

function rememberSent(record: SentRecord): void {
  try {
    window.sessionStorage.setItem(SENT_KEY, JSON.stringify(record));
  } catch {
    // Private mode / blocked storage: the panel just won't survive a sign-in.
  }
}

function readSent(userId: string): SentRecord | null {
  try {
    const raw = window.sessionStorage.getItem(SENT_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<SentRecord> | null;
    if (
      !r ||
      typeof r.sentTo !== "string" ||
      r.userId !== userId ||
      typeof r.at !== "number" ||
      Date.now() - r.at > SENT_TTL_MS
    ) {
      return null;
    }
    return { sentTo: r.sentTo, userId: r.userId, at: r.at };
  } catch {
    return null;
  }
}

function forgetSent(): void {
  try {
    window.sessionStorage.removeItem(SENT_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
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

/**
 * The provider refused a send. Prominent and names the address, so a typo in
 * the name before "@" is visible at a glance. On the code panel it replaces
 * the green "We sent" banner, which it would contradict.
 */
function SendFailureLine({ failure }: { failure: { to: string; resend: boolean } }) {
  return (
    <div
      role="alert"
      className="vibe-auth-error"
      style={{ fontSize: 14, lineHeight: 1.5, padding: "12px 14px", overflowWrap: "anywhere" }}
    >
      <strong>
        {failure.resend ? (
          <>We couldn&apos;t send another email to {failure.to}.</>
        ) : (
          <>We couldn&apos;t send to {failure.to}.</>
        )}
      </strong>{" "}
      {failure.resend
        ? "The code in the last one works for 30 minutes after it was sent. Try sending again in a minute."
        : "Check the address for typos. If it's right, try again in a minute."}
    </div>
  );
}

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
  // A send the provider refused, named with the address it went to. `resend`
  // is true when it was "Send again" from the code panel.
  const [sendFailure, setSendFailure] = useState<{ to: string; resend: boolean } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // The signed-in account the IU email is going on, named on the page.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  // Set once an email went out: the form gives way to the code panel.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  // Set when the panel opened on a send limit instead of a send: nothing
  // went out just now, so the banner says why instead of "We sent".
  const [limitedNote, setLimitedNote] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const cooldownEndsAt = useRef<number | null>(null);
  const codeInFlight = useRef(false);
  const cooling = secondsLeft > 0;
  const justVerifiedAccount = searchParams.get("account_verified") === "1";
  // In the installed app the code is the way in: it verifies whoever is
  // signed in HERE. On an iPhone the email's link opens Safari, which keeps
  // its own sign-in (it may ask the student to sign in again), and this page
  // doesn't notice when it's done there (plan R16).
  const standalone = useIsStandalone();
  const platform = usePlatform();
  const linksOpenSafari = standalone && isIosPlatform(platform);

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

    // Signed in: show the page, and bring back the code panel if this tab
    // already sent an email for this account (e.g. back from signing in).
    const onSignedIn = (id: string, email: string | null) => {
      setUserId(id);
      setAccountEmail(email);
      const sent = readSent(id);
      if (sent) {
        setSchoolEmail(sent.sentTo);
        setSentTo(sent.sentTo);
        const left = Math.ceil(
          (sent.at + RESEND_COOLDOWN_SEC * 1000 - Date.now()) / 1000,
        );
        if (left > 0) {
          cooldownEndsAt.current = sent.at + RESEND_COOLDOWN_SEC * 1000;
          setSecondsLeft(left);
        }
      }
      setAuthChecked(true);
    };

    void (async () => {
      for (let i = 0; i < 20; i++) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          onSignedIn(user.id, user.email ?? null);
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
          onSignedIn(session.user.id, session.user.email ?? null);
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
          if (u2) onSignedIn(u2.id, u2.email ?? null);
          else router.replace(LOGIN_HREF);
        });
      }, 4000);
    })();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      unsub?.();
    };
  }, [router]);

  // Tick from the deadline, not by counting, so a tab that iOS paused while
  // the student was in Outlook shows the right number on return.
  useEffect(() => {
    if (!cooling) return;
    const tick = () => {
      const endsAt = cooldownEndsAt.current;
      const left =
        endsAt === null
          ? 0
          : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (left === 0) cooldownEndsAt.current = null;
      setSecondsLeft(left);
    };
    const id = window.setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [cooling]);

  // The buttons stay disabled while the page navigates away; re-arm them if
  // the browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      codeInFlight.current = false;
      setCodeBusy(false);
      setLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function onBack(e: React.MouseEvent<HTMLAnchorElement>) {
    // Modified clicks (new tab, new window) keep the plain /campus link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!hasInAppHistory()) return;
    e.preventDefault();
    router.back();
  }

  /** Send (or resend) the code + link email to `address`. */
  async function requestEmail(address: string) {
    if (loading) return;
    // A resend from the panel keeps the panel up whatever happens: the code
    // and link already in the inbox keep working, so never strand them.
    const fromPanel = sentTo !== null;
    setError(null);
    setSendFailure(null);
    if (!fromPanel) setSignedOut(false);
    setLoading(true);
    let leaving = false;
    try {
      const res = await fetch("/api/auth/school-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolEmail: address }),
      });
      if (res.status === 401) {
        setSignedOut(true);
        if (fromPanel) setCodeError(SIGNED_OUT);
        else setError(SIGNED_OUT_SEND);
        return;
      }
      const data = await readJson<{
        ok?: boolean;
        error?: string;
        code?: string;
        message?: string;
        alreadyVerified?: boolean;
        sentTo?: string;
        attemptedTo?: string;
      }>(res);
      // A Vercel HTML error page, an empty body, or a server failure.
      if (!data || res.status >= 500) {
        if (data && (data.code === "send_failed" || data.error === SEND_FAILED)) {
          const to =
            typeof data.attemptedTo === "string" && data.attemptedTo
              ? data.attemptedTo
              : address;
          setSendFailure({ to, resend: fromPanel });
        } else {
          setError(OFFLINE);
        }
        return;
      }
      if (res.status === 403 && data.code === "terms_required") {
        // Consent must be on record before verification (S53 A4); the
        // interstitial brings the user straight back here.
        leaving = true;
        router.replace("/auth/terms?next=/auth/school-email");
        return;
      }
      if (res.status === 429) {
        const note =
          data.error ?? "Too many emails for now. Try again later this hour.";
        if (fromPanel && limitedNote === null) {
          // The panel is up after a real send: its banner stays true.
          setError(note);
        } else {
          // No email went out now, but an earlier one may be in the inbox.
          // Open the code box for this address so "use the code from the
          // newest one" has somewhere to go.
          setSentTo(address);
          setLimitedNote(note);
          setCodeError(null);
        }
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't send the email. Try again.");
        return;
      }
      if (data.alreadyVerified) {
        // /onboarding forwards anyone already onboarded on to their profile.
        leaving = true;
        forgetSent();
        window.location.assign(new URL(ONBOARDING_PATH, window.location.origin).href);
        return;
      }
      const sent = typeof data.sentTo === "string" ? data.sentTo : address;
      const at = Date.now();
      setSentTo(sent);
      setSendFailure(null);
      setLimitedNote(null);
      setSignedOut(false);
      setCodeError(null);
      cooldownEndsAt.current = at + RESEND_COOLDOWN_SEC * 1000;
      setSecondsLeft(RESEND_COOLDOWN_SEC);
      if (userId) rememberSent({ sentTo: sent, userId, at });
    } catch {
      setError(OFFLINE);
    } finally {
      if (!leaving) setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void requestEmail(schoolEmail.trim());
  }

  function onResend() {
    if (!sentTo || cooling) return;
    void requestEmail(sentTo);
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo || codeInFlight.current) return;
    setCodeError(null);
    setSignedOut(false);
    if (code.length !== CODE_LENGTH) {
      setCodeError("Enter the 8-digit code from the email.");
      return;
    }
    codeInFlight.current = true;
    setCodeBusy(true);
    let leaving = false;
    try {
      const res = await fetch("/api/auth/school-email/confirm-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolEmail: sentTo, code }),
      });
      if (res.status === 401) {
        setSignedOut(true);
        setCodeError(SIGNED_OUT);
        return;
      }
      const data = await readJson<{ ok?: boolean; error?: string }>(res);
      // A Vercel HTML error page, an empty body, or a server failure (whose
      // text can name server config).
      if (!data || res.status >= 500) {
        setCodeError(OFFLINE);
        return;
      }
      if (!res.ok || !data.ok) {
        setCodeError(data.error ?? "We couldn't check your code. Try again.");
        return;
      }
      leaving = true;
      forgetSent();
      // Full navigation so the onboarding server page reads the fresh row.
      window.location.assign(new URL(ONBOARDING_PATH, window.location.origin).href);
    } catch {
      setCodeError(OFFLINE);
    } finally {
      // Stay disabled while the page navigates away.
      if (!leaving) {
        codeInFlight.current = false;
        setCodeBusy(false);
      }
    }
  }

  function onUseDifferentAddress() {
    // Keep the typed address in the field so a typo is one edit away.
    forgetSent();
    setSentTo(null);
    setLimitedNote(null);
    setCode("");
    setCodeError(null);
    setSignedOut(false);
    setError(null);
    setSendFailure(null);
    cooldownEndsAt.current = null;
    setSecondsLeft(0);
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
            One last verification: add your <strong>school email</strong> (
            {SCHOOL_DOMAINS_LABEL}) so we know you&apos;re actually on campus.
          </div>
        ) : null}

        <h1 className="vibe-auth-headline">
          Verify your campus<span className="vibe-auth-dot">.</span>
        </h1>
        {accountEmail ? (
          <p
            className="vibe-auth-sub"
            style={{ marginBottom: 10, overflowWrap: "anywhere" }}
          >
            Adding a school email to <strong>{accountEmail}</strong>.
          </p>
        ) : null}
        <p className="vibe-auth-sub">
          Drop in your <strong>school email</strong> — the{" "}
          <code className="vibe-auth-code vibe-auth-code--edu">
            {SCHOOL_DOMAINS_LABEL}
          </code>{" "}
          one, not the one you signed up with.{" "}
          {standalone ? (
            <>
              We&apos;ll email an 8-digit code to <em>that</em> inbox.
            </>
          ) : (
            <>
              We&apos;ll email a code and link to <em>that</em> inbox.
            </>
          )}
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

        {sentTo ? (
          <form onSubmit={onVerifyCode} className="vibe-auth-form">
            {sendFailure ? (
              <SendFailureLine failure={sendFailure} />
            ) : limitedNote ? (
              <div
                role="status"
                className="vibe-auth-banner vibe-auth-banner--info"
                style={{ overflowWrap: "anywhere" }}
              >
                {limitedNote} Have one at <strong>{sentTo}</strong>? Type the
                code from the newest one below.
              </div>
            ) : (
              <div
                role="status"
                className="vibe-auth-banner vibe-auth-banner--success"
                style={{ overflowWrap: "anywhere" }}
              >
                {standalone ? (
                  <>
                    We sent an 8-digit code to <strong>{sentTo}</strong>. Type
                    it below.
                  </>
                ) : (
                  <>
                    We sent a code and link to <strong>{sentTo}</strong>.
                  </>
                )}
              </div>
            )}

            <label className="vibe-auth-field">
              <span className="vibe-auth-label-row">
                <span className="vibe-auth-label">8-digit code</span>
              </span>
              {/* No maxLength: it silently truncates a paste like "1234 5678".
                  Non-digits are stripped and the value capped here instead. */}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                spellCheck={false}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
                }
                className="vibe-auth-input vibe-auth-code-input"
              />
            </label>

            {codeError ? (
              <p role="alert" className="vibe-auth-error">
                {codeError}
              </p>
            ) : null}
            {signedOut ? (
              <Link href={LOGIN_HREF} className="vibe-auth-secondary">
                Sign in
              </Link>
            ) : null}

            <button type="submit" disabled={codeBusy} className="vibe-auth-submit">
              {codeBusy ? "Verifying…" : "Verify with code"}
              {codeBusy ? null : (
                <span aria-hidden style={{ marginLeft: 8 }}>
                  →
                </span>
              )}
            </button>

            {error ? (
              <p role="alert" className="vibe-auth-error">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="vibe-auth-secondary"
              disabled={loading || cooling}
              onClick={onResend}
            >
              {loading
                ? "Sending…"
                : cooling
                  ? `Send again in ${secondsLeft}s`
                  : "Send again"}
            </button>

            {/* Always on the code panel, whichever banner is up, so the
                Safari line can't be pushed out by a send limit or failure. */}
            {linksOpenSafari ? (
              <p className="vibe-auth-tip">
                Links in the email open in your browser, not this app. Not there after a
                minute? Check Junk, and your school Outlook&apos;s Quarantine.
              </p>
            ) : (
              <p className="vibe-auth-tip">
                Not there after a minute? Check Junk, and your school
                Outlook&apos;s Quarantine. Opened it on your phone? Just type
                the code here.
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={onSubmit} className="vibe-auth-form">
            {sendFailure ? <SendFailureLine failure={sendFailure} /> : null}
            <label className="vibe-auth-field">
              <span className="vibe-auth-label-row">
                <span className="vibe-auth-label">School email</span>
                <span className="vibe-auth-label-hint vibe-auth-label-hint--edu">
                  {SCHOOL_DOMAINS_LABEL}
                </span>
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                placeholder="you@school.edu"
                value={schoolEmail}
                onChange={(e) => {
                  setSchoolEmail(e.target.value);
                  // Never leave the line next to an address that has changed.
                  setSendFailure(null);
                }}
                className="vibe-auth-input"
              />
            </label>

            {error ? (
              <p role="alert" className="vibe-auth-error">
                {error}
              </p>
            ) : null}
            {signedOut ? (
              <Link href={LOGIN_HREF} className="vibe-auth-secondary">
                Sign in
              </Link>
            ) : null}

            <button type="submit" disabled={loading} className="vibe-auth-submit">
              {loading ? "Sending…" : "Send my code"}
              {loading ? null : (
                <span aria-hidden style={{ marginLeft: 8 }}>
                  →
                </span>
              )}
            </button>
          </form>
        )}

        <p className="vibe-auth-tail">
          {sentTo ? (
            <button
              type="button"
              className="vibe-auth-disclosure"
              onClick={onUseDifferentAddress}
            >
              Use a different address
            </button>
          ) : (
            <>
              Wrong email used to sign up?{" "}
              <Link
                href="/auth/login"
                className="vibe-auth-link vibe-auth-link--tap"
              >
                Log back in
              </Link>
            </>
          )}
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
