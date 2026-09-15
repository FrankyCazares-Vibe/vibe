"use client";

import { useEffect, useRef, useState, type JSX } from "react";

import {
  getAuthEmailCallbackUrl,
  getBrowserSiteOrigin,
} from "@/lib/auth/email-confirm-redirect";
import { INBOX_TIP, parseRetryAfterSeconds } from "@/lib/auth/email-link-errors";
import { rememberPendingSignup } from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const DEFAULT_COOLDOWN_SEC = 60;
const SEND_FAILED = "Couldn't send right now. Try again in a minute.";

/**
 * "Send a new email" for an account that still needs confirming.
 *
 * GoTrue's /resend answers 200 for unknown and already-confirmed addresses
 * alike, so the copy never claims an email went out. The Supabase client is
 * only created on tap: the confirm page must make no auth call on load.
 *
 * Renders no <form> (it sits inside the login form); Enter in the email
 * field sends without submitting the outer form, and `form=""` detaches the
 * field from any outer form so a half-typed address here can't block its
 * submit.
 *
 * With `hideEmailField` the parent owns the address (one field shared with
 * the code box above): no field or "Sending to" line here, and a send uses
 * `initialEmail` as it is at the tap.
 */
export function ResendConfirmation({
  initialEmail,
  autoStartCooldownSec,
  hideEmailField,
}: {
  initialEmail?: string | null;
  autoStartCooldownSec?: number;
  hideEmailField?: boolean;
}): JSX.Element {
  const seedEmail = initialEmail?.trim() ?? "";
  const [email, setEmail] = useState(seedEmail);
  const [editing, setEditing] = useState(!seedEmail);
  const [touched, setTouched] = useState(false);
  const [seenSeed, setSeenSeed] = useState(seedEmail);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil(autoStartCooldownSec ?? 0)),
  );
  const cooldownEndsAt = useRef<number | null>(null);
  const cooling = secondsLeft > 0;

  // A parent that learns the address after mount (typed on login, read from
  // storage) updates the field, unless the student already edited it.
  if (seedEmail !== seenSeed) {
    setSeenSeed(seedEmail);
    if (!touched) {
      setEmail(seedEmail);
      setEditing(!seedEmail);
    }
  }

  // Anchor an auto-started cooldown to a deadline once mounted. Declared
  // before the ticking effect so the deadline exists when it first runs.
  useEffect(() => {
    if (cooldownEndsAt.current === null && (autoStartCooldownSec ?? 0) > 0) {
      cooldownEndsAt.current =
        Date.now() + Math.ceil(autoStartCooldownSec ?? 0) * 1000;
    }
  }, [autoStartCooldownSec]);

  // Tick from the deadline, not by counting, so a tab that iOS paused while
  // the student was in their mail app shows the right number on return.
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

  function startCooldown(sec: number) {
    cooldownEndsAt.current = Date.now() + sec * 1000;
    setSecondsLeft(sec);
  }

  async function onSend() {
    if (sending || cooling) return;
    const target = (hideEmailField ? seedEmail : email).trim();
    setError(null);
    setSentTo(null);
    setRateLimited(false);
    if (!target.includes("@")) {
      if (!hideEmailField) setEditing(true);
      setError("Enter the email you signed up with.");
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: sendErr } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: {
          emailRedirectTo: getAuthEmailCallbackUrl(getBrowserSiteOrigin()),
        },
      });
      if (sendErr) {
        const retryAfter =
          sendErr.code === "over_email_send_rate_limit"
            ? parseRetryAfterSeconds(sendErr.message)
            : null;
        if (retryAfter !== null) {
          // The per-address cooldown ("…after 57 seconds"). GoTrue truncates,
          // so it can say 0 in the last sub-second: clamp to 1 so the
          // countdown and its message actually show.
          startCooldown(Math.max(1, retryAfter));
          setRateLimited(true);
        } else {
          // Anything else, including the project-wide email cap, which uses
          // the same code but says "Email rate limit exceeded" with no
          // seconds: it won't clear in 60s, so don't claim "we just sent one".
          setError(SEND_FAILED);
          if (sendErr.code === "over_email_send_rate_limit") {
            startCooldown(DEFAULT_COOLDOWN_SEC);
          }
        }
        return;
      }
      rememberPendingSignup(target);
      setEmail(target);
      setEditing(false);
      setSentTo(target);
      startCooldown(DEFAULT_COOLDOWN_SEC);
    } catch {
      setError(SEND_FAILED);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="vibe-auth-form vibe-auth-embed">
      {hideEmailField ? null : editing ? (
        <label className="vibe-auth-field">
          <span className="vibe-auth-label-row">
            <span className="vibe-auth-label">Personal email</span>
            <span className="vibe-auth-label-hint">
              the one you signed up with
            </span>
          </span>
          <input
            form=""
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => {
              setTouched(true);
              setEmail(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void onSend();
            }}
            className="vibe-auth-input"
          />
        </label>
      ) : (
        <p className="vibe-auth-tip">
          Sending to <strong>{email}</strong>{" "}
          <button
            type="button"
            className="vibe-auth-disclosure"
            onClick={() => {
              setTouched(true);
              setEditing(true);
            }}
          >
            Change
          </button>
        </p>
      )}

      {/* Roles on the messages themselves: an always-present live wrapper
          would be an empty flex item adding a stray gap. */}
      {sentTo ? (
        <div role="status" className="vibe-auth-banner vibe-auth-banner--info">
          If {sentTo} has an account that still needs confirming, a new email
          is on its way. Only the newest email works.
        </div>
      ) : null}
      {rateLimited && cooling ? (
        <div role="status" className="vibe-auth-banner vibe-auth-banner--info">
          We just sent one. You can ask again in {secondsLeft}s.
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="vibe-auth-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="vibe-auth-secondary"
        disabled={sending || cooling}
        onClick={() => void onSend()}
      >
        {sending
          ? "Sending…"
          : cooling
            ? `Send again in ${secondsLeft}s`
            : "Send a new email"}
      </button>

      <p className="vibe-auth-tip">{INBOX_TIP}</p>
    </div>
  );
}
