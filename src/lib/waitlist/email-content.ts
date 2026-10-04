/**
 * The waitlist's two emails as words and links, pure (BUILD.md section 3d).
 * `src/lib/email/resend-transactional.ts` wraps these in the branded
 * template and sends them; this file decides what they say, where their
 * links go, and whether a send happens at all. No `server-only`, no `node:`
 * and no `@/` imports, so the node test runner loads it.
 *
 * Copy rules: never name another app, no numbers about Vibe's size or the
 * list, no "beta", no place in line.
 */

import { ACCESS_CODE_TTL_DAYS, ACCESS_CODE_URL_PARAM, formatAccessCode, normalizeAccessCode } from "./access-code";
import { SIGNUP_PATH, WAITLIST_CONFIRM_PATH, WAITLIST_RETENTION_DAYS } from "./types";

/** Codes end at a moment, read in Indiana: "Saturday, October 17 at 2:14 PM EDT". */
const CODE_ENDS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Indiana/Indianapolis",
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * When a code stops working, in words, or null for a value that isn't a
 * date. The minutes are cut, never rounded up, so the words are never later
 * than the real end. Odd spaces some ICU builds put before "PM" become plain
 * ones (the text part stays plain).
 */
export function codeEndsText(expiresAt: string | null | undefined): string | null {
  const ms = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(ms)) return null;
  return CODE_ENDS.format(ms).replace(/[\u00a0\u202f]/g, " ");
}

/**
 * How long a confirm link works, in the email's words. The rule itself is
 * `CONFIRM_WINDOW_DAYS` in tokens.ts (kept out of here: tokens.ts imports
 * `node:crypto`); email-content.test.ts checks the two agree.
 */
export const CONFIRM_DAYS_IN_COPY = 7;

/** Replies to waitlist mail reach the founders. */
export const WAITLIST_REPLY_TO = "hello@connectvibe.app";

/** Marks the dev-only console line that stands in for a waitlist email. */
export const WAITLIST_DEV_LOG_TAG = "[waitlist-email:dev]";

/**
 * Send through Resend, print the email to the dev-server log, or refuse.
 * - "send": a Resend key and a From address are both set (any environment).
 * - "dev-log": not production and one of them is missing. Nothing is sent and
 *   no send-log row is written; one {@link WAITLIST_DEV_LOG_TAG} line carries
 *   the link (and the code) so the flow can be finished by hand.
 * - "unconfigured": production without them. The sender throws, like the
 *   password-reset and school-email senders do. A code never reaches a
 *   production log.
 */
export type WaitlistDeliveryMode = "send" | "dev-log" | "unconfigured";

export function waitlistDeliveryMode(env: {
  nodeEnv: string | undefined;
  resendKey: string | undefined;
  resendFrom: string | undefined;
}): WaitlistDeliveryMode {
  if (env.resendKey?.trim() && env.resendFrom?.trim()) return "send";
  return env.nodeEnv === "production" ? "unconfigured" : "dev-log";
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function base(site: string): string {
  return site.trim().replace(/\/+$/, "");
}

/** `/waitlist/confirm?token=`: shows the state; only tapping the button confirms. */
export function waitlistConfirmUrl(site: string, token: string): string {
  return `${base(site)}${WAITLIST_CONFIRM_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * "Take me off the list": the same page, with `leave=1` as a hint to open
 * on the leave button. Opening it removes nothing; the page asks for a tap.
 */
export function waitlistLeaveUrl(site: string, token: string): string {
  return `${waitlistConfirmUrl(site, token)}&leave=1`;
}

/**
 * `/auth/signup?access_code=VIBE-XXXX-XXXX`. Never `?code=`: supabase-js
 * reads that as a sign-in callback. Opening it spends nothing. Throws on a
 * value that is not a valid code (a programming error).
 */
export function waitlistSignupUrl(site: string, code: string): string {
  const normalized = normalizeAccessCode(code);
  if (!normalized) throw new Error("waitlistSignupUrl: not an access code");
  return `${base(site)}${SIGNUP_PATH}?${ACCESS_CODE_URL_PARAM}=${encodeURIComponent(formatAccessCode(normalized))}`;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** For text a person typed (a name) going into HTML. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** What `brandedEmailHtml` takes, plus the subject and the plain-text part. */
export type WaitlistEmailContent = {
  subject: string;
  preheader: string;
  headline: string;
  /** Trusted HTML: fixed copy, or typed text through {@link escapeHtml}. */
  intro: string;
  code?: { label: string; value: string; note: string };
  button: { href: string; label: string; lead?: string };
  /** Trusted HTML, like `intro`. */
  notes: string[];
  /** The plain-text part: no markup, no entities. */
  text: string;
};

function leaveNote(lead: string, leaveUrl: string): string {
  return `${lead} <a href="${escapeHtml(leaveUrl)}" style="color:inherit;">Take me off the list</a>.`;
}

/** "Confirm your spot": the only email the form sends. No typed text in it. */
export function waitlistConfirmContent(input: { confirmUrl: string; leaveUrl: string; site: string }): WaitlistEmailContent {
  const days = CONFIRM_DAYS_IN_COPY;
  const spot = `A spot lasts up to ${WAITLIST_RETENTION_DAYS} days. If we haven't sent your code by then, you can join again.`;
  return {
    subject: "Confirm your spot on the Vibe waitlist",
    preheader: `One tap confirms your spot. The link works for ${days} days.`,
    headline: "Confirm your spot",
    intro:
      "Thanks for joining the Vibe waitlist. Tap below to confirm this is your school email and hold your spot. We'll email you when it's your turn.",
    button: { href: input.confirmUrl, label: "Confirm my spot" },
    notes: [
      `The link works for ${days} days. Opening it changes nothing until you tap the button on the page.`,
      spot,
      "Didn't sign up? You can ignore this email.",
      leaveNote("Changed your mind?", input.leaveUrl),
    ],
    text: [
      "Thanks for joining the Vibe waitlist.",
      "",
      `Confirm my spot: ${input.confirmUrl}`,
      "",
      `The link works for ${days} days. Opening it changes nothing until you tap the button on the page. We'll email you when it's your turn.`,
      spot,
      "Didn't sign up? You can ignore this email.",
      "",
      `Changed your mind? Take me off the list: ${input.leaveUrl}`,
      "",
      base(input.site),
    ].join("\n"),
  };
}

/**
 * "Your Vibe access code": a founder let this person in. `expiresAt` is the
 * code's real end from `waitlist_issue_code` (14 days, or sooner when the
 * entry is deleted first); the email names it. An unreadable one falls back
 * to "for up to 14 days", never longer than the truth.
 */
export function waitlistInviteContent(input: {
  name: string;
  code: string;
  expiresAt: string;
  signupUrl: string;
  leaveUrl: string;
  site: string;
}): WaitlistEmailContent {
  const normalized = normalizeAccessCode(input.code);
  if (!normalized) throw new Error("waitlistInviteContent: not an access code");
  const code = formatAccessCode(normalized);
  const name = String(input.name ?? "").trim();
  const ends = codeEndsText(input.expiresAt);
  const works = ends ? `Your code works once, until ${ends}.` : `Your code works once, for up to ${ACCESS_CODE_TTL_DAYS} days.`;
  const any = "Use your personal email (the one you check) for the account; you'll verify your school email right after.";
  const spend = "The button just opens the page; your code only counts once your account is made.";
  const reply = "Questions, or the code stopped working? Reply to this email.";
  return {
    subject: "Your Vibe access code",
    // No code here: the preheader shows on lock screens and in inbox lists.
    preheader: "Your spot on Vibe is ready. Create your account with your access code.",
    headline: "You're in",
    intro: `${name ? `Hi ${escapeHtml(name)}, y` : "Y"}our spot on Vibe is ready. Create your account with the access code below.`,
    code: { label: "Your access code", value: code, note: works },
    button: {
      lead: "Or tap below. The sign-up page opens with your code filled in.",
      href: input.signupUrl,
      label: "Create your account",
    },
    notes: [any, spend, reply, leaveNote("Not for you anymore?", input.leaveUrl)],
    text: [
      `${name ? `Hi ${name}, y` : "Y"}our spot on Vibe is ready.`,
      "",
      `Your access code: ${code}`,
      works,
      "",
      `Create your account: ${input.signupUrl}`,
      "",
      any,
      spend,
      reply,
      "",
      `Not for you anymore? Take me off the list: ${input.leaveUrl}`,
      "",
      base(input.site),
    ].join("\n"),
  };
}

/** The dev-log line: kind, masked address, link, and the code when there is one. */
export function waitlistDevLogLine(input: {
  kind: "waitlist_confirm" | "waitlist_invite";
  maskedTo: string;
  url: string;
  code?: string;
  leaveUrl?: string;
}): string {
  const parts = [WAITLIST_DEV_LOG_TAG, input.kind, input.maskedTo, input.url];
  if (input.code) parts.push(input.code);
  if (input.leaveUrl) parts.push(`leave=${input.leaveUrl}`);
  return parts.join(" ");
}
