import "server-only";

import {
  sendWithLog,
  type EmailSendKind,
  type EmailSendRow,
  type ProviderResult,
  type SendOutcome,
} from "@/lib/email/send-log-core";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/** Longest a send waits on its log row, in ms (the race and the abort signal). */
const LOG_TIMEOUT_MS = 2000;

/**
 * The ONLY writer of `public.email_sends` (service role; clients hold no
 * grant and no policy). One row per attempt, with the address kept only as a
 * keyed hash (see `send-log-core.ts`).
 *
 * Logging never changes the send: a missing table, a missing service key or a
 * slow database costs one `[email-send-log] insert failed:` line and at most
 * 2 s, and the caller gets the provider's outcome either way.
 *
 * No log line here may interpolate `to`. `onLogError` only ever receives
 * redacted text or "timed out".
 */
export async function sendLogged(
  kind: EmailSendKind,
  to: string,
  userId: string | null,
  send: () => Promise<ProviderResult>,
): Promise<SendOutcome> {
  return sendWithLog({
    kind,
    to,
    userId,
    // Read directly: school-email-token.ts keeps getSecret private (and it
    // throws). A missing secret stores a NULL hash; the send still goes.
    secret: process.env.SCHOOL_EMAIL_VERIFY_SECRET?.trim() ?? null,
    send,
    insert: insertRow,
    onLogError: (m) => console.error("[email-send-log] insert failed:", m),
    logTimeoutMs: LOG_TIMEOUT_MS,
  });
}

async function insertRow(row: EmailSendRow): Promise<void> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  const { error } = await createSupabaseServiceClient()
    .from("email_sends")
    .insert(row)
    .abortSignal(AbortSignal.timeout(LOG_TIMEOUT_MS));
  if (error) throw new Error(error.message);
}
