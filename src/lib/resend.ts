import { Resend } from "resend";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Server-only — API key never touches the client bundle. */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Shared Resend client for transactional mail (verification, reset, notifications — P1-006+). */
export function createResendClient(): Resend {
  const apiKey = requireEnv("RESEND_API_KEY");
  return new Resend(apiKey);
}

function formatResendError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Send-only keys authenticate successfully but cannot call read APIs (domains, email history, etc.).
 * Resend returns this specific error — it proves the key is valid without sending mail.
 */
function isSendOnlyApiKeyError(message: string): boolean {
  return /restricted.*send emails|only send emails/i.test(message);
}

/**
 * Validates the API key: Domains list when allowed; send-only keys OK when Resend reports that scope.
 * Never sends mail.
 */
export async function probeResendApi(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    const resend = createResendClient();

    const domainsAttempt = await resend.domains.list();
    if (!domainsAttempt.error) {
      return { ok: true };
    }

    const domainErrMsg = formatResendError(domainsAttempt.error);
    if (isSendOnlyApiKeyError(domainErrMsg)) {
      return { ok: true };
    }

    const emailsAttempt = await resend.emails.list({ limit: 1 });
    if (!emailsAttempt.error) {
      return { ok: true };
    }

    const emailErrMsg = formatResendError(emailsAttempt.error);
    return {
      ok: false,
      message: `${domainErrMsg} | fallback emails.list: ${emailErrMsg}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
