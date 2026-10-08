import "server-only";
import { createResendClient } from "@/lib/resend";
import { getSiteUrl } from "@/lib/auth/site-url";
import { sendLogged } from "@/lib/email/send-log";
import { maskEmail } from "@/lib/waitlist/admin-view";
import {
  WAITLIST_REPLY_TO,
  waitlistConfirmContent,
  waitlistDeliveryMode,
  waitlistDevLogLine,
  waitlistInviteContent,
  type WaitlistEmailContent,
} from "@/lib/waitlist/email-content";

function getFrom(): string {
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    throw new Error(
      "Set RESEND_FROM (e.g. Vibe <noreply@yourdomain.com>) to send transactional email.",
    );
  }
  return from;
}

// Brand tokens from docs/DESIGN_SYSTEM.md, matching the sign-in card and
// supabase/templates/confirmation.html. Fraunces / DM Sans load in Apple Mail;
// everything else falls back to Georgia / system sans.
const CREAM = "#FAF7F2";
const CHARCOAL = "#1C1C1E";
const BODY = "#5A564F";
const MUTED = "#8A8580";
const ACCENT = "#FF5C35";
const SERIF = "'Fraunces',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace";
// Invisible filler after the preheader so inbox previews stop there instead of
// reading on into the body.
const PREHEADER_PAD = "&#847;&zwnj;&nbsp;".repeat(90);

type BrandedEmail = {
  title: string;
  preheader: string;
  /** Rendered with the orange period, like every auth headline. */
  headline: string;
  /** Trusted HTML: callers pass fixed copy only. */
  intro: string;
  code?: { label: string; value: string; note: string };
  button?: { href: string; label: string; lead?: string };
  notes: string[];
  /** Where the footer's "Privacy policy" link lands. Fixed copy only. Default: the top of the policy. */
  privacyHref?: string;
};

const PRIVACY_URL = "https://www.connectvibe.app/legal/privacy";
/** Section 11, the waitlist's own notice: a person with no account lands on their part. */
const WAITLIST_PRIVACY_URL = `${PRIVACY_URL}#waitlist`;

/** Attribute-safe: the server-built URLs carry raw `&` between params. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Every interpolated value is fixed copy, digits, a waitlist access code, a
 * URL this server built, or (waitlist invite intro only) a typed name that
 * went through `escapeHtml` in src/lib/waitlist/email-content.ts.
 */
function brandedEmailHtml(e: BrandedEmail): string {
  // A waitlist access code (VIBE-7KQ2-M9XD, 14 characters) is twice as long
  // as a digit code: a smaller face keeps it on one line on a 375 px phone.
  const long = (e.code?.value.length ?? 0) > 10;
  const codeStyle = long
    ? "padding:12px 18px;font-size:24px;line-height:30px;letter-spacing:3px;white-space:nowrap"
    : "padding:12px 20px;font-size:30px;line-height:36px;letter-spacing:6px";
  const code = e.code
    ? `
            <p style="margin:0 0 10px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">${e.code.label}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="vibe-code${long ? " vibe-code-long" : ""}" bgcolor="#FFEEE8" style="background:#FFEEE8;border:1px solid #FFD6C8;border-radius:12px;${codeStyle};font-family:${MONO};font-weight:700;color:${CHARCOAL};">${e.code.value}</td>
              </tr>
            </table>
            <p style="margin:10px 0 26px;font-size:13px;line-height:20px;color:${MUTED};">${e.code.note}</p>`
    : "";
  const button = e.button
    ? `${e.button.lead ? `
            <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:${BODY};">${e.button.lead}</p>` : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vibe-btn">
              <tr>
                <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:12px;">
                  <a href="${escapeAttr(e.button.href)}" style="display:block;padding:16px 22px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${e.button.label} &rarr;</a>
                </td>
              </tr>
            </table>`
    : "";
  const notes = e.notes
    .map(
      (n, i) =>
        `<p style="margin:${i === 0 ? "26px 0 0;padding-top:20px;border-top:1px solid #F0EBE4" : "10px 0 0"};font-size:13px;line-height:20px;color:${i === 0 ? BODY : MUTED};">${n}</p>`,
    )
    .join("\n            ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>${e.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light only; }
  body { margin: 0; padding: 0; background: ${CREAM}; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font: inherit !important; }
  @media (max-width: 520px) {
    .vibe-card { padding: 30px 22px 26px !important; border-radius: 20px !important; }
    .vibe-headline { font-size: 28px !important; line-height: 32px !important; }
    .vibe-code { font-size: 26px !important; letter-spacing: 4px !important; padding: 12px 16px !important; }
    .vibe-code-long { font-size: 20px !important; letter-spacing: 2px !important; padding: 12px 14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM};">${e.preheader}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="background:${CREAM};">
  <tr>
    <td align="center" style="padding:32px 14px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td class="vibe-card" bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #EEE8DF;border-radius:24px;padding:40px 36px 34px;font-family:${SANS};color:${CHARCOAL};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#F4F2EF" style="background:#F4F2EF;border-radius:999px;padding:5px 12px;font-family:${SERIF};font-size:18px;line-height:22px;font-weight:800;letter-spacing:-0.5px;color:${CHARCOAL};">
                  <a href="${getSiteUrl()}" style="color:${CHARCOAL};text-decoration:none;">vibe<span style="color:${ACCENT};">.</span></a>
                </td>
              </tr>
            </table>
            <h1 class="vibe-headline" style="margin:22px 0 12px;font-family:${SERIF};font-size:34px;line-height:38px;font-weight:700;letter-spacing:-1px;color:${CHARCOAL};">${e.headline}<span style="color:${ACCENT};">.</span></h1>
            <p style="margin:0 0 26px;font-size:15px;line-height:23px;color:${BODY};">${e.intro}</p>${code}${button}
            ${notes}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 12px 0;font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};">
            <span style="font-family:${SERIF};font-weight:800;color:${CHARCOAL};">vibe<span style="color:${ACCENT};">.</span></span> &middot; Indianapolis<br>
            <a href="${escapeAttr(e.privacyHref ?? PRIVACY_URL)}" style="color:${MUTED};">Privacy policy</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * For students who installed Vibe (plan R16). The reset link opens a
 * browser, and on an iPhone the Home Screen app keeps its own sign-in, so
 * the new password is set in the browser and the app still needs it typed.
 * Worded to hold on every phone. Goes in both the HTML notes and the text
 * part, so it stays plain: no markup, no entities, no bare "<".
 */
const HOME_SCREEN_RESET_NOTE =
  "Using Vibe from your Home Screen? Set the new password on the page that opens, then open Vibe from your Home Screen and sign in with it.";

/**
 * Every attempt goes into the send log (send-log.ts); the log never
 * changes the outcome. A missing RESEND_API_KEY / RESEND_FROM throws inside
 * the send, so it is logged as `exception` and thrown here as before.
 */
export async function sendPasswordResetEmail(
  to: string,
  recoveryActionLink: string,
  userId: string | null = null,
): Promise<void> {
  const site = getSiteUrl();
  const outcome = await sendLogged("password_reset", to, userId, () =>
    createResendClient().emails.send({
      from: getFrom(),
      to: [to],
      subject: "Reset your Vibe password",
      html: brandedEmailHtml({
        title: "Reset your Vibe password",
        preheader: "Tap to choose a new Vibe password. Only the newest reset email works.",
        headline: "Reset your password",
        intro: "You asked to reset your Vibe password. Tap below to choose a new one.",
        button: { href: recoveryActionLink, label: "Set a new password" },
        notes: [
          "Only the newest reset email works. Any browser or phone is fine.",
          HOME_SCREEN_RESET_NOTE,
          "Didn't ask for this? You can ignore this email &mdash; your password won't change.",
        ],
      }),
      text: [
        "You asked to reset your Vibe password.",
        "",
        `Set a new password: ${recoveryActionLink}`,
        "",
        "Only the newest reset email works. Any browser or phone is fine.",
        HOME_SCREEN_RESET_NOTE,
        "Didn't ask for this? You can ignore this email. Your password won't change.",
        "",
        site,
      ].join("\n"),
    }),
  );
  if (!outcome.ok) {
    throw new Error(outcome.errorMessage || outcome.errorCode);
  }
}

/**
 * IU verification email: the typed code first (works on any device — the
 * student types it where they're signed in), the link second (only works in a
 * browser signed in to the requesting account). Plain-text part included for
 * clients and scanners that drop HTML.
 */
export async function sendSchoolVerificationEmail(
  to: string,
  verifyUrl: string,
  code: string,
  userId: string | null = null,
): Promise<void> {
  // Interpolated unescaped below; the caller passes schoolEmailCode() output.
  // A programming error, not a send attempt, so it is not logged.
  if (!/^\d+$/.test(code)) {
    throw new Error("School verification code must be digits only.");
  }
  // A code and nothing to tap, on purpose (S75): IU and Purdue student mail
  // is Microsoft 365, which opens and scans every link in a message from a
  // small sender before it delivers, and that is where the minutes went. So:
  // no link, no button, no web font, no image, no footer link; the code in
  // the subject. `verifyUrl` is no longer sent (the link route still answers
  // older emails). Keep this message this small.
  void verifyUrl;
  const outcome = await sendLogged("school_verification", to, userId, () =>
    createResendClient().emails.send({
      from: getFrom(),
      to: [to],
      subject: `${code} is your Vibe code`,
      html: codeOnlyEmailHtml(code, "Type it on the Vibe page where you asked for this email. It works for 30 minutes."),
      text: [
        `Your Vibe code is: ${code}`,
        "",
        "Type it on the Vibe page where you asked for this email. It works for 30 minutes.",
        "",
        "Never share this code. Vibe will never ask you for it. If you didn't start this, ignore this email.",
        "Questions: help@connectvibe.app",
      ].join("\n"),
    }),
  );
  if (!outcome.ok) {
    throw new Error(outcome.errorMessage || outcome.errorCode);
  }
}

/**
 * The code for a personal address someone is adding to their account
 * (school email first, S75). The same small, link-free message as the school
 * code. `code` is `personalEmailCode()` output: digits only.
 */
export async function sendPersonalEmailCodeEmail(
  to: string,
  code: string,
  userId: string | null = null,
): Promise<void> {
  if (!/^\d+$/.test(code)) {
    throw new Error("Personal email code must be digits only.");
  }
  const line = "Type it in Vibe to add this address to your account. It works for 30 minutes.";
  const outcome = await sendLogged("personal_email_code", to, userId, () =>
    createResendClient().emails.send({
      from: getFrom(),
      to: [to],
      subject: `${code} is your Vibe code`,
      html: codeOnlyEmailHtml(code, line),
      text: [
        `Your Vibe code is: ${code}`,
        "",
        line,
        "",
        "Never share this code. Vibe will never ask you for it. If you didn't start this, ignore this email.",
        "Questions: help@connectvibe.app",
      ].join("\n"),
    }),
  );
  if (!outcome.ok) {
    throw new Error(outcome.errorMessage || outcome.errorCode);
  }
}

/**
 * The whole HTML of a code email: a few lines of system-font text. Nothing
 * is fetched and nothing can be tapped (the twin of
 * supabase/templates/confirmation.html). `code` is digits only (the caller
 * checks); `line` is fixed copy.
 */
function codeOnlyEmailHtml(code: string, line: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Vibe code</title></head>` +
    `<body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#1c1c1e;">` +
    `<p style="margin:0 0 16px;">Your Vibe code is:</p>` +
    `<p style="margin:0 0 16px;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:30px;line-height:36px;font-weight:700;letter-spacing:4px;">${code}</p>` +
    `<p style="margin:0 0 16px;">${line}</p>` +
    `<p style="margin:0;color:#5a564f;font-size:14px;line-height:21px;">Never share this code. Vibe will never ask you for it. If you didn't start this, ignore this email. Questions: help@connectvibe.app</p>` +
    `</body></html>`
  );
}

// ---------------------------------------------------------------------------
// The waitlist's two emails (src/lib/waitlist/email-content.ts has the words)
// ---------------------------------------------------------------------------

/**
 * One waitlist email. Without a Resend key or From address outside
 * production, nothing is sent and nothing is logged to `email_sends`: one
 * `[waitlist-email:dev]` line in the dev-server log carries the link (and the
 * code) instead, so the flow can be finished by hand. In production without
 * them the send throws like the senders above (logged as `exception`).
 * Replies go to hello@. Throws when the send fails.
 */
async function sendWaitlistEmail(
  kind: "waitlist_confirm" | "waitlist_invite",
  to: string,
  content: WaitlistEmailContent,
  devLine: string,
): Promise<void> {
  const mode = waitlistDeliveryMode({
    nodeEnv: process.env.NODE_ENV,
    resendKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
  });
  if (mode === "dev-log") {
    console.info(devLine);
    return;
  }
  const outcome = await sendLogged(kind, to, null, () =>
    createResendClient().emails.send({
      from: getFrom(),
      to: [to],
      replyTo: WAITLIST_REPLY_TO,
      subject: content.subject,
      html: brandedEmailHtml({
        title: content.subject,
        preheader: content.preheader,
        headline: content.headline,
        intro: content.intro,
        code: content.code,
        button: content.button,
        notes: content.notes,
        privacyHref: WAITLIST_PRIVACY_URL,
      }),
      text: content.text,
    }),
  );
  if (!outcome.ok) {
    throw new Error(outcome.errorMessage || outcome.errorCode);
  }
}

/** "Confirm your spot on the Vibe waitlist": the form's one email. Works 7 days. */
export async function sendWaitlistConfirmEmail(
  to: string,
  confirmUrl: string,
  leaveUrl: string,
): Promise<void> {
  const content = waitlistConfirmContent({ confirmUrl, leaveUrl, site: getSiteUrl() });
  const devLine = waitlistDevLogLine({ kind: "waitlist_confirm", maskedTo: maskEmail(to), url: confirmUrl });
  await sendWaitlistEmail("waitlist_confirm", to, content, devLine);
}

/**
 * "Your Vibe access code": the code box with the day it stops working
 * (`expiresAt`, from waitlist_issue_code), a "Create your account" button to
 * `/auth/signup?access_code=…`, and a "Take me off the list" link
 * (`manageUrl`, the newest `?token=` link with `leave=1`).
 */
export async function sendWaitlistInviteEmail(
  to: string,
  name: string,
  code: string,
  expiresAt: string,
  signupUrl: string,
  manageUrl: string,
): Promise<void> {
  const content = waitlistInviteContent({ name, code, expiresAt, signupUrl, leaveUrl: manageUrl, site: getSiteUrl() });
  const devLine = waitlistDevLogLine({
    kind: "waitlist_invite",
    maskedTo: maskEmail(to),
    url: signupUrl,
    code: content.code?.value,
    leaveUrl: manageUrl,
  });
  await sendWaitlistEmail("waitlist_invite", to, content, devLine);
}
