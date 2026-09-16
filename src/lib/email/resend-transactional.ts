import "server-only";
import { createResendClient } from "@/lib/resend";
import { getSiteUrl } from "@/lib/auth/site-url";

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
};

/** Attribute-safe: the server-built URLs carry raw `&` between params. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Every interpolated value is fixed copy, digits, or a URL this server built. */
function brandedEmailHtml(e: BrandedEmail): string {
  const code = e.code
    ? `
            <p style="margin:0 0 10px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">${e.code.label}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="vibe-code" bgcolor="#FFEEE8" style="background:#FFEEE8;border:1px solid #FFD6C8;border-radius:12px;padding:12px 20px;font-family:${MONO};font-size:30px;line-height:36px;font-weight:700;letter-spacing:6px;color:${CHARCOAL};">${e.code.value}</td>
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
            <a href="https://www.connectvibe.app/legal/privacy" style="color:${MUTED};">Privacy policy</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(
  to: string,
  recoveryActionLink: string,
): Promise<void> {
  const resend = createResendClient();
  const site = getSiteUrl();
  const { error } = await resend.emails.send({
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
        "Didn't ask for this? You can ignore this email &mdash; your password won't change.",
      ],
    }),
    text: [
      "You asked to reset your Vibe password.",
      "",
      `Set a new password: ${recoveryActionLink}`,
      "",
      "Only the newest reset email works. Any browser or phone is fine.",
      "Didn't ask for this? You can ignore this email. Your password won't change.",
      "",
      site,
    ].join("\n"),
  });
  if (error) {
    throw new Error(error.message);
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
): Promise<void> {
  // Interpolated unescaped below; the caller passes schoolEmailCode() output.
  if (!/^\d+$/.test(code)) {
    throw new Error("School verification code must be digits only.");
  }
  const resend = createResendClient();
  const site = getSiteUrl();
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: "Verify your school email on Vibe",
    html: brandedEmailHtml({
      title: "Verify your school email on Vibe",
      preheader: `Your Vibe code is ${code}. It works for 30 minutes.`,
      headline: "Verify your school email",
      intro: "Type this code on the Vibe page where you asked for this email.",
      code: {
        label: "Your verification code",
        value: code,
        note: "It works for 30 minutes. Never share it &mdash; Vibe will never ask you for it.",
      },
      button: {
        lead: "Or tap below while you're signed in to Vibe on this device. The link works for 48 hours.",
        href: verifyUrl,
        label: "Verify school email",
      },
      notes: [
        "Opened this in the Outlook app? Typing the code is the easiest way.",
        "Didn't start this? You can ignore this email.",
      ],
    }),
    text: [
      `Your Vibe verification code: ${code}`,
      "",
      "Type it on the Vibe page where you asked for this email. It works for 30 minutes.",
      "",
      "Or tap Verify school email while you're signed in to Vibe on this device. The link works for 48 hours.",
      `Verify school email: ${verifyUrl}`,
      "",
      "Never share this code. Vibe will never ask you for it.",
      "",
      "If you didn't start this, ignore this email.",
      "",
      site,
    ].join("\n"),
  });
  if (error) {
    throw new Error(error.message);
  }
}
