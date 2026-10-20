"use client";

import { Arrow } from "@/components/brand/Arrow";
import { KineticWordmark } from "@/components/brand/KineticWordmark";
import {
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthError,
} from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";

import { ConfirmCodeForm } from "@/components/auth/ConfirmCodeForm";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { TurnstileBox, type TurnstileBoxHandle } from "@/components/auth/TurnstileBox";
import {
  captchaErrorMessage,
  captchaOptions,
  humanCheckWaitLabel,
  initialHumanCheck,
  isCaptchaError,
  type HumanCheck,
} from "@/lib/auth/captcha";
import {
  getAuthEmailCallbackUrl,
  getBrowserSiteOrigin,
} from "@/lib/auth/email-confirm-redirect";
import { parseRetryAfterSeconds } from "@/lib/auth/email-link-errors";
import {
  isPasswordTooLongError,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_TOO_LONG,
  passwordLengthProblem,
} from "@/lib/auth/password-rules";
import {
  clearPendingSignup,
  rememberPendingSignup,
} from "@/lib/auth/pending-signup";
import { isSchoolEmail } from "@/lib/auth/school-email-domains";
import {
  MIN_AGE,
  TERMS_METADATA_KEYS,
  TERMS_VERSION,
} from "@/lib/legal/terms";
import { openInBrowser } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { WORDMARK_FONT_PATH } from "@/lib/theme/fonts";
import {
  ACCESS_CODE_METADATA_KEY,
  ACCESS_CODE_URL_PARAM,
  formatAccessCode,
  GATE_PROBE_METADATA_KEY,
  readTypedAccessCode,
} from "@/lib/waitlist/access-code";
import { CLUB_CODE_METADATA_KEY } from "@/lib/club-links/code";
import { isClubLinkRefusal, parseGateRefusal, WAITLIST_PATH } from "@/lib/waitlist/types";
import { gateRefusalCopy } from "@/lib/waitlist/view";

/** GoTrue's per-address resend cooldown. */
const RESEND_COOLDOWN_SEC = 60;

const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const EMAIL_CAP =
  "We can't send confirmation emails right now. Try again in a few minutes.";
const TOO_MANY_TRIES =
  "Too many tries from this network. Wait a few minutes, then try again.";
const BAD_ADDRESS =
  "That email address doesn't look right. Check it for typos.";
const WEAK_PASSWORD =
  "Pick a stronger password — 8 to 72 characters, and not an easy one to guess.";
const PASSWORD_LENGTH = "Use 8 to 72 characters.";
const PASSWORD_CHARACTERS = "Mix in letters and numbers.";
const PASSWORD_PWNED =
  "That password has shown up in a data breach. Pick a different one.";
const SOMETHING_WENT_WRONG = "Something went wrong. Try again in a minute.";
const CODE_SHAPE = "Codes look like VIBE-7KQ2-M9XD. Check it against your invite email.";
const LOST_CODE_HREF = "mailto:help@connectvibe.app?subject=My%20Vibe%20access%20code";

/**
 * What to say when signUp fails. Never the browser's own text ("Load failed",
 * "Failed to fetch") or GoTrue's. A weak password says what to fix from
 * auth-js's `reasons` ("length" | "characters" | "pwned"), in that order when
 * there are several; with none it falls back to the general hint. `human` is
 * the "are you a person" box as it was when the request left.
 */
function signUpErrorMessage(err: AuthError, human: HumanCheck): string {
  // The waitlist gate (auth_hooks.hook_waitlist_gate) refused the access code:
  // a 403 whose message starts with its own tag. Checked first, and always
  // our own words for the reason, never the hook's message.
  const refusal = parseGateRefusal(err);
  if (refusal) return gateRefusalCopy(refusal);
  // A fetch that threw (offline, blocked) or a 502/503/504 from the gateway.
  if (isAuthRetryableFetchError(err)) return OFFLINE;
  // Supabase refused the "are you a person" check (`captcha_failed`): its own
  // sentence, with what to do. No account was made and no email was sent.
  if (isCaptchaError(err)) return captchaErrorMessage(human);
  const message = (err.message ?? "").trim();
  if (isAuthWeakPasswordError(err)) {
    const reasons: string[] = err.reasons ?? [];
    const fixes = [
      reasons.includes("length") ? PASSWORD_LENGTH : null,
      reasons.includes("characters") ? PASSWORD_CHARACTERS : null,
      reasons.includes("pwned") ? PASSWORD_PWNED : null,
    ].filter((fix): fix is string => fix !== null);
    return fixes.length ? fixes.join(" ") : WEAK_PASSWORD;
  }
  // GoTrue's 72-byte refusal is also `validation_failed` + "password": say
  // it's too long, not "pick a stronger one".
  if (isPasswordTooLongError(err)) return PASSWORD_TOO_LONG;
  if (
    err.code === "weak_password" ||
    (err.code === "validation_failed" && /password/i.test(message))
  ) {
    return WEAK_PASSWORD;
  }
  if (
    err.code === "email_address_invalid" ||
    (err.code === "validation_failed" && /email/i.test(message))
  ) {
    return BAD_ADDRESS;
  }
  // The project-wide email cap: same code as the per-address cooldown, but
  // no seconds, and nothing went to this address.
  if (err.code === "over_email_send_rate_limit") return EMAIL_CAP;
  if (err.status === 429 || err.code === "over_request_rate_limit") {
    return TOO_MANY_TRIES;
  }
  return SOMETHING_WENT_WRONG;
}

/**
 * The Terms and Privacy links open in a new tab so the half-filled form stays
 * put. The store apps have no new tab: the iPhone app hands it to Safari and
 * the Android app would load it over this form. So there the page opens in
 * the in-app browser sheet, on top of the form (plan §6 S2D). The default is
 * stopped first, so the app's own link handler leaves this click alone
 * (critic-s2s3.md item 4).
 */
function openLegalInApp(e: React.MouseEvent<HTMLAnchorElement>) {
  if (appShellOnClient() === null) return;
  e.preventDefault();
  void openInBrowser(e.currentTarget.href);
}

/**
 * The "Check your email" view shown after signUp sends (or recently sent) a
 * confirmation email. `rateLimitedUntil` (epoch ms) is set when this submit
 * hit the per-address cooldown instead of sending.
 */
type PendingSignup = {
  email: string;
  cooldownSec: number;
  rateLimitedUntil: number | null;
};

/**
 * A club link's sign-up (the club's view, wave 1; /c/<code>). The code rides
 * in `options.data.club_code` for the sign-up gate, which lets a school
 * address in through a live link while sign-up is closed; the page above the
 * form names the club. No access code is asked for unless the link says no.
 */
export type SignupClub = {
  code: string;
  kind: "setup" | "members";
  name: string;
};

/**
 * The sign-up form (page.tsx reads the switch and the link on the server).
 *
 * - `signupOpen`: sign-up is open for everyone. Closed (the pilot), the form
 *   asks for the access code from the invite email. The field is optional
 *   here so a founder on the allowlist can sign up without one; the
 *   database hook is the gate, and its refusal comes back as words below.
 * - `initialAccessCode`: from the email button's `?access_code=`. Sent even
 *   when sign-up is open, so the waitlist row still learns who joined.
 * - `probe`: the dev-only `?signup=closed`. Asks the hook to act closed.
 */
export function SignupForm({
  signupOpen,
  initialAccessCode,
  probe,
  club = null,
  header = null,
}: {
  signupOpen: boolean;
  initialAccessCode: string;
  probe: boolean;
  /** A club link's sign-up: send its code, and say so (see SignupClub). */
  club?: SignupClub | null;
  /** Replaces the headline and the line under it (the club link page's own). */
  header?: React.ReactNode;
}) {
  // Oct 19, 2026: fetch the logo face with the page, so the kinetic logo's
  // entrance isn't half over before its font (font-display block) arrives.
  // Here, not in page.tsx: from the async server page the hint reached the
  // stream after the <head> (local check), too late to help.
  preload(WORDMARK_FONT_PATH, { as: "font", type: "font/woff2" });
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [maybeExisting, setMaybeExisting] = useState(false);
  const [pending, setPending] = useState<PendingSignup | null>(null);
  const submitting = useRef(false);
  const [accessCode, setAccessCode] = useState(initialAccessCode);
  // Shown when closed, and also when the gate refused a page that thought
  // sign-up was open (the switch changed since it loaded).
  // A club link's sign-up needs no access code: the link is the way in.
  const [codeShown, setCodeShown] = useState(!signupOpen && !club);
  const codeInput = useRef<HTMLInputElement>(null);
  const [focusCode, setFocusCode] = useState(0);
  // The "are you a person" box (TurnstileBox). With no site key it is "off"
  // for good: no box, the button never waits, and signUp sends what it
  // always sent.
  const [human, setHuman] = useState<HumanCheck>(initialHumanCheck);
  const humanBox = useRef<TurnstileBoxHandle>(null);
  const humanWait = humanCheckWaitLabel(human);

  // The code came in the address: it's in the field now, so take it out of
  // the address bar, history and anything shared from this tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(ACCESS_CODE_URL_PARAM)) return;
    url.searchParams.delete(ACCESS_CODE_URL_PARAM);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  // After a refusal about the code, the cursor goes to the code (it is
  // rendered by then, even if it only just appeared), and to its end: a
  // field the link filled would otherwise take the missing half in front.
  // A cursor already in the field stays where the person put it.
  useEffect(() => {
    const el = codeInput.current;
    if (!focusCode || !el || document.activeElement === el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusCode]);

  // School email first (S75): the tip is for an address that is complete
  // and is NOT a school one. A hint, not a block: the Vibe team's own
  // accounts and the store review accounts sign up with other addresses.
  const typedEmail = email.trim();
  const otherEmailTyped = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(typedEmail) && !isSchoolEmail(typedEmail);
  // While sign-up is closed, the account just made spent the code: starting
  // over with another address would only meet "already used". Say so instead
  // of offering it (a founder sends a new code; the database allows that
  // while the first account is unconfirmed).
  const codeTied = codeShown && readTypedAccessCode(accessCode.trim()) !== null;
  const rateLimitedUntil = pending?.rateLimitedUntil ?? null;

  // "We just sent an email" points at the resend countdown below, so it goes
  // when that countdown ends. Checked against the deadline on return too:
  // iOS pauses timers while the student is off in their mail app.
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const clear = () =>
      setPending((p) =>
        p && p.rateLimitedUntil === rateLimitedUntil
          ? { ...p, rateLimitedUntil: null }
          : p,
      );
    const onVisible = () => {
      if (Date.now() >= rateLimitedUntil) clear();
    };
    const id = window.setTimeout(
      clear,
      Math.max(0, rateLimitedUntil - Date.now()),
    );
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [rateLimitedUntil]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // One signUp at a time, and none while the pending view is up. Every
    // signUp from this browser writes a new PKCE code verifier, which breaks
    // the ?code= link in an email that is already on its way. "Wrong
    // address? Start over" is the only way back to this form. And none while
    // the "are you a person" box is still checking (the button is disabled
    // then; this is the same rule for a submit that arrives any other way).
    if (submitting.current || pending || humanWait !== null) return;
    setError(null);
    setMaybeExisting(false);
    if (!agreed) {
      setError(
        `Confirm you're ${MIN_AGE} or older and agree to the Terms to create an account.`,
      );
      return;
    }
    // Validate the 8–72 rule instead of letting the input truncate. A
    // maxLength here silently cut a pasted password down to the cap (20
    // then), so a password manager could create (or reset to) a credential
    // the user never saw and could not reproduce at login. Never add one.
    const lengthProblem = passwordLengthProblem(password);
    if (lengthProblem) {
      setError(lengthProblem.message);
      return;
    }
    // A light check only: the hook decides. Typing is forgiving (case,
    // spaces, hyphens, O for 0); anything that still isn't a code (half of
    // one included) is caught here rather than spent on a round trip. With
    // sign-up open the field is hidden and nobody needs a code, so a link's
    // code that doesn't read is left out, not asked about.
    const typedCode = accessCode.trim();
    const code = typedCode ? readTypedAccessCode(typedCode) : null;
    if (typedCode && !code && codeShown) {
      setError(CODE_SHAPE);
      setFocusCode((n) => n + 1);
      return;
    }
    const address = email.trim();
    submitting.current = true;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          emailRedirectTo: getAuthEmailCallbackUrl(getBrowserSiteOrigin()),
          // { captchaToken } when the box has one, else nothing and the
          // request is the one it always was.
          ...captchaOptions(human),
          // Lands in auth.users.raw_user_meta_data; the on_auth_user_created
          // trigger copies it into users.terms_version / terms_accepted_at /
          // age_attested_at so the consent record is born with the row.
          // The access code rides along for the before-user-created hook,
          // which claims it, and the same trigger marks it redeemed.
          data: {
            [TERMS_METADATA_KEYS.version]: TERMS_VERSION,
            [TERMS_METADATA_KEYS.age]: true,
            ...(code ? { [ACCESS_CODE_METADATA_KEY]: formatAccessCode(code) } : {}),
            ...(club ? { [CLUB_CODE_METADATA_KEY]: club.code } : {}),
            ...(probe ? { [GATE_PROBE_METADATA_KEY]: true } : {}),
          },
        },
      });
      if (signErr) {
        const refusal = parseGateRefusal(signErr);
        if (refusal && club && isClubLinkRefusal(refusal)) {
          // The club link said no (used, ended, a personal address...): its
          // own words. The access code field stays away: the link was the
          // way in, and the words say what to do instead.
          setError(signUpErrorMessage(signErr, human));
          return;
        }
        if (refusal) {
          // Every field stays filled; the cursor goes to the code.
          setCodeShown(true);
          setError(signUpErrorMessage(signErr, human));
          setFocusCode((n) => n + 1);
          return;
        }
        if (signErr.code === "over_email_send_rate_limit") {
          const retryAfter = parseRetryAfterSeconds(signErr.message);
          if (retryAfter !== null) {
            // "…only request this after 57 seconds": this address got a
            // confirmation email in the last minute, so show the pending
            // view for it. GoTrue truncates, so it can say 0; clamp to 1.
            const sec = Math.max(1, retryAfter);
            rememberPendingSignup(address);
            setPending({
              email: address,
              cooldownSec: sec,
              rateLimitedUntil: Date.now() + sec * 1000,
            });
            return;
          }
          // Otherwise it's the project-wide cap ("Email rate limit
          // exceeded"): nothing went to this address, so don't claim it did.
        }
        // A confirmed account with this address, on a project that says so
        // outright instead of answering with an empty user.
        if (
          signErr.code === "user_already_exists" ||
          signErr.code === "email_exists"
        ) {
          setMaybeExisting(true);
          return;
        }
        setError(signUpErrorMessage(signErr, human));
        return;
      }
      if (data.session) {
        clearPendingSignup();
        router.push("/auth/school-email");
        router.refresh();
        return;
      }
      // A confirmed account with this address: GoTrue answers with a user
      // that has no identities and sends nothing, so "check your inbox"
      // would be a lie.
      if (data.user?.identities?.length === 0) {
        setMaybeExisting(true);
        return;
      }
      rememberPendingSignup(address);
      setPending({
        email: address,
        cooldownSec: RESEND_COOLDOWN_SEC,
        rateLimitedUntil: null,
      });
    } catch {
      // Thrown rather than returned (storage blocked, an unexpected bug).
      setError(SOMETHING_WENT_WRONG);
    } finally {
      submitting.current = false;
      setLoading(false);
      // A token works once: a new check after every try, good or bad. (Once
      // the "Check your email" view is up this form's box is gone, and the
      // resend button below has its own.)
      humanBox.current?.reset();
    }
  }

  // Back to the form with its values kept, so a typo is a one-field fix.
  function onStartOver() {
    clearPendingSignup();
    setPending(null);
    setError(null);
    setMaybeExisting(false);
  }

  if (pending) {
    return (
      <div className="vibe-auth-page">
        <Link href="/" className="vibe-auth-back">
          <Arrow direction="left" /> back
        </Link>

        <div className="vibe-auth-card">
          <div className="vibe-auth-brand vibe-auth-brand--kinetic">
            <KineticWordmark dotClassName="vibe-auth-dot" />
          </div>

          <h1 className="vibe-auth-headline">
            Check your email<span className="vibe-auth-dot">.</span>
          </h1>
          {/* School email first (S75): the email is a code and nothing to
              tap, for everyone, so a university's mail system has no link to
              scan before it delivers. */}
          <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
            We sent an 8-digit code to <strong>{pending.email}</strong> from
            noreply@connectvibe.app. Type it below to confirm your account.
            School inboxes can take a minute: check Junk too.
          </p>

          {/* No number here: the resend button below counts down live, and
              a second, static count would disagree with it. */}
          {rateLimitedUntil !== null ? (
            <div
              role="status"
              className="vibe-auth-banner vibe-auth-banner--info"
            >
              We just sent an email to this address. You can ask for another in
              a moment — see the countdown below.
            </div>
          ) : null}

          <ConfirmCodeForm initialEmail={pending.email} askEmail={false} />

          <div className="vibe-auth-recovery">
            <ResendConfirmation
              initialEmail={pending.email}
              autoStartCooldownSec={pending.cooldownSec}
            />
            {club?.kind === "setup" ? (
              // A setup link works once: this address holds it now.
              <p className="vibe-auth-tip" style={{ overflowWrap: "anywhere" }}>
                This setup link is now tied to <strong>{pending.email}</strong>.
                Wrong address? Ask whoever gave you the link for a new one.
              </p>
            ) : codeTied ? (
              <p className="vibe-auth-tip" style={{ overflowWrap: "anywhere" }}>
                Your access code is now tied to <strong>{pending.email}</strong>.
                Wrong address? Reply to your invite email and we&apos;ll send you
                a new code.
              </p>
            ) : (
              <div>
                <button
                  type="button"
                  className="vibe-auth-disclosure"
                  onClick={onStartOver}
                >
                  Wrong address? Start over
                </button>
              </div>
            )}
          </div>

          <p className="vibe-auth-tail">
            Confirmed on another device or app?{" "}
            <Link
              href="/auth/login?notice=confirmed"
              className="vibe-auth-link vibe-auth-link--tap"
              style={{ whiteSpace: "nowrap" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/" className="vibe-auth-back">
        <Arrow direction="left" /> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand vibe-auth-brand--kinetic">
          <KineticWordmark dotClassName="vibe-auth-dot" />
        </div>

        {header ?? (
          <>
            <h1 className="vibe-auth-headline">
              Create your account<span className="vibe-auth-dot">.</span>
            </h1>
            <p className="vibe-auth-sub">
              Use your <strong>school email</strong>, the one ending in{" "}
              <code className="vibe-auth-code">.edu</code>. We&apos;ll send it a
              code to confirm you&apos;re a student.
            </p>
          </>
        )}

        <div className="vibe-auth-steps" aria-hidden>
          <div className="vibe-auth-step vibe-auth-step--active">
            <span className="vibe-auth-step-num">1</span>
            <span className="vibe-auth-step-label">Account</span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">2</span>
            <span className="vibe-auth-step-label">Code</span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">3</span>
            <span className="vibe-auth-step-label">Profile</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          {codeShown ? (
            <label className="vibe-auth-field">
              <span className="vibe-auth-label-row">
                <span className="vibe-auth-label">Access code</span>
                <span className="vibe-auth-label-hint">from your invite email</span>
              </span>
              <input
                ref={codeInput}
                type="text"
                name="access-code"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
                placeholder="VIBE-XXXX-XXXX"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="vibe-auth-input"
                style={{
                  fontFamily: "var(--font-code)",
                  letterSpacing: "0.08em",
                }}
              />
            </label>
          ) : null}
          {codeShown ? (
            <p className="vibe-auth-tip" style={{ marginTop: -8 }}>
              Can&apos;t find it? Search your email for &ldquo;Your Vibe access
              code&rdquo;, or write to{" "}
              <a href={LOST_CODE_HREF} className="vibe-auth-link">
                help@connectvibe.app
              </a>{" "}
              and we&apos;ll send a new one.
            </p>
          ) : null}

          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">School email</span>
              <span className="vibe-auth-label-hint">your .edu</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@iu.edu"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMaybeExisting(false);
              }}
              aria-describedby={
                otherEmailTyped ? "signup-email-tip" : undefined
              }
              className="vibe-auth-input"
            />
          </label>
          {/* A hint, not a block (see otherEmailTyped). */}
          {otherEmailTyped ? (
            <p
              id="signup-email-tip"
              className="vibe-auth-tip"
              style={{ marginTop: -8 }}
            >
              Heads up: that isn&apos;t an IU or Purdue email. Use your school
              email here — you can add a personal one once you&apos;re in.
            </p>
          ) : null}

          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Password</span>
              <span className="vibe-auth-label-hint">{PASSWORD_HINT}</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
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
            <p id="signup-consent-note" className="vibe-auth-consent-note">
              Required — check the box above to create your account.
            </p>
          ) : null}
          {/* Said where it is agreed to (Privacy Policy, short version item
              6), not only inside the policy. */}
          <p className="vibe-auth-consent-note">
            Good to know: people can see that you viewed their profile or post.
          </p>

          {/* Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */}
          <TurnstileBox ref={humanBox} action="sign-up" onChange={setHuman} />

          {error ? <p role="alert" className="vibe-auth-error">{error}</p> : null}
          {maybeExisting ? (
            <div
              role="status"
              className="vibe-auth-banner vibe-auth-banner--info"
            >
              <strong>This email may already have an account.</strong>
              <span
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px 24px",
                  marginTop: 8,
                }}
              >
                <Link
                  href="/auth/login"
                  className="vibe-auth-link vibe-auth-link--tap"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/forgot-password"
                  className="vibe-auth-link vibe-auth-link--tap"
                >
                  Forgot password?
                </Link>
              </span>
            </div>
          ) : null}

          {/* Unticked consent keeps its own lock and wording. With it ticked,
              the button waits while the box is still checking, and says so. */}
          <button
            type="submit"
            disabled={loading || !agreed || humanWait !== null}
            className={`vibe-auth-submit${!agreed ? " vibe-auth-submit--locked" : ""}`}
          >
            {loading ? "Creating…" : agreed && humanWait !== null ? humanWait : "Create account"}
            {loading || (agreed && humanWait !== null) ? null : (
              <Arrow direction="right" style={{ marginLeft: 8 }} />
            )}
          </button>
        </form>

        {codeShown ? (
          <p className="vibe-auth-tail">
            No code yet?{" "}
            <Link href={WAITLIST_PATH} className="vibe-auth-link">
              Join the waitlist
            </Link>
          </p>
        ) : null}
        <p
          className="vibe-auth-tail"
          style={codeShown ? { marginTop: 8 } : undefined}
        >
          Already have an account?{" "}
          <Link href="/auth/login" className="vibe-auth-link">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
