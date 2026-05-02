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
    html: `
      <p>You asked to reset your password on Vibe.</p>
      <p><a href="${recoveryActionLink}">Set a new password</a></p>
      <p style="color:#666;font-size:14px">If you didn't request this, you can ignore this email.</p>
      <p style="color:#666;font-size:14px">${site}</p>
    `,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function sendSchoolVerificationEmail(
  to: string,
  verifyUrl: string,
): Promise<void> {
  const resend = createResendClient();
  const site = getSiteUrl();
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: "Verify your school email on Vibe",
    html: `
      <p>Confirm this email is your campus (.edu) address for Vibe.</p>
      <p><a href="${verifyUrl}">Verify school email</a></p>
      <p style="color:#666;font-size:14px">Link expires in 48 hours. If you didn't start this, ignore this email.</p>
      <p style="color:#666;font-size:14px">${site}</p>
    `,
  });
  if (error) {
    throw new Error(error.message);
  }
}
