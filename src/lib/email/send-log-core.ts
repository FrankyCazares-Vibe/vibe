/**
 * Email send log, pure core (E1a, handoffs/wave-plan-week1/E1.md §A2).
 *
 * One row per transactional send attempt (school verification, password
 * reset, moderation alert) goes into `public.email_sends`, so "did we try, and
 * what did the provider say?" has an answer without the Resend dashboard. The
 * only writer is `send-log.ts`, which wraps {@link sendWithLog} with the
 * service client.
 *
 * NO PLAINTEXT ADDRESS, ANYWHERE. A row keeps:
 * - `recipient_hash`: HMAC-SHA256 keyed by SCHOOL_EMAIL_VERIFY_SECRET over
 *   `HASH_LABEL + canonical address`. `scripts/email-send-lookup.mjs`
 *   computes the same hash from an address typed on stdin.
 * - `recipient_domain`: the domain only when it says nothing about the person
 *   (ruling M15): a known school domain from `school-email-domains.ts`, or
 *   one of a short list of large public providers. Anything else is
 *   `"other"`, because `me@lastname.dev` names the student, and the row keeps
 *   its domain after account deletion forgets the hash.
 * - provider text with every address redacted (the DB refuses any "@").
 *
 * Loads under `node --experimental-strip-types` (erasable TypeScript only).
 * Its one relative import is extensionless, so the test and the lookup script
 * register the ".ts" resolve hook that `school-email-domains.test.ts` uses.
 */

import { createHash, createHmac } from "node:crypto";

import { RETIRED_IU_DOMAINS, SYSTEM_DOMAINS } from "../auth/school-email-domains";

/**
 * Every kind of transactional send, and the same list as
 * `email_sends_kind_check` in the database — a kind missing there is a row the
 * store refuses, which costs the send its log line.
 *
 * `moderation_alert` is the "New report on Vibe" email to the platform admins
 * (src/lib/moderation/alerts.ts). It logs like any other: a keyed hash and a
 * coarse domain, never an address, and never a word of what was reported.
 */
export const EMAIL_SEND_KINDS = [
  "school_verification",
  "password_reset",
  "moderation_alert",
] as const;
export type EmailSendKind = (typeof EMAIL_SEND_KINDS)[number];

/** Separates this use of SCHOOL_EMAIL_VERIFY_SECRET from the token and code HMACs. */
export const HASH_LABEL = "email-send-v1|";

/** Same bar as `isSchoolVerifySecretConfigured` (school-email-token.ts). */
const MIN_SECRET_LENGTH = 16;

/**
 * Every school domain Vibe knows, for every system whatever the Purdue flag,
 * plus the retired IU domains (a reset can still go to an old @iupui.edu
 * login, and "iupui.edu" in the log explains why it never arrived).
 */
export const KNOWN_SCHOOL_EMAIL_DOMAINS: readonly string[] = Object.freeze([
  ...Object.values(SYSTEM_DOMAINS).flat(),
  ...RETIRED_IU_DOMAINS,
]);

/** Large public providers (ruling M15). Adding one is a one-line change. */
export const PUBLIC_EMAIL_PROVIDER_DOMAINS: readonly string[] = Object.freeze([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "yahoo.com",
]);

/** `recipient_domain` for an address with no usable host. */
export const DOMAIN_UNKNOWN = "unknown";
/** `recipient_domain` for a real host that isn't on either list. */
export const DOMAIN_OTHER = "other";

export type ProviderResult = {
  data?: { id?: unknown } | null;
  error?: { name?: unknown; message?: unknown; statusCode?: unknown } | null;
};

export type SendOutcome =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; errorCode: string; errorMessage: string; httpStatus: number | null };

export type EmailSendRow = {
  kind: EmailSendKind;
  user_id: string | null;
  recipient_domain: string;
  recipient_hash: string | null;
  provider_message_id: string | null;
  ok: boolean;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
};

/**
 * Trimmed and lowercased; with an "@", trailing dots come off the host after
 * the LAST "@". Matches `normalizeSchoolEmail` for school addresses and the
 * reset route's `trim().toLowerCase()` for the rest.
 */
export function canonicalRecipient(address: string): string {
  const lower = (typeof address === "string" ? address : "").trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at < 0) return lower;
  return lower.slice(0, at + 1) + lower.slice(at + 1).replace(/\.+$/, "");
}

/** The canonical host after the last "@", or "" when there is none. */
function canonicalHost(address: string): string {
  const canonical = canonicalRecipient(address);
  const at = canonical.lastIndexOf("@");
  return at < 0 ? "" : canonical.slice(at + 1);
}

/** True when `host` is `domain` or a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * What `recipient_domain` stores (ruling M15). A known school domain, or a
 * subdomain of one, stores the school domain itself ("mail.iu.edu" ->
 * "iu.edu"). A listed public provider stores its exact host. Any other real
 * host is "other"; no "@" or an empty host is "unknown". Never contains "@".
 */
export function recipientDomain(address: string): string {
  const host = canonicalHost(address);
  if (!host) return DOMAIN_UNKNOWN;
  const school = KNOWN_SCHOOL_EMAIL_DOMAINS.find((d) => hostMatches(host, d));
  if (school) return school;
  if (PUBLIC_EMAIL_PROVIDER_DOMAINS.includes(host)) return host;
  return DOMAIN_OTHER;
}

/**
 * HMAC-SHA256(secret.trim(), HASH_LABEL + canonical address) as 64 lowercase
 * hex, or null when the secret is missing or shorter than 16 chars.
 */
export function recipientHash(
  address: string,
  secret: string | null | undefined,
): string | null {
  const key = typeof secret === "string" ? secret.trim() : "";
  if (key.length < MIN_SECRET_LENGTH) return null;
  return createHmac("sha256", key)
    .update(HASH_LABEL + canonicalRecipient(address))
    .digest("hex");
}

/**
 * A rate-limit key part for an address that never holds the address: the
 * keyed hash when the secret is set, else "u" + an unkeyed SHA-256.
 * Equal to `recipient_hash` on purpose (E1 A2), so the lookup hash also finds
 * the reset limiter row. That row outlives account deletion until
 * rate_limit_hit's cleanup; see KNOWN RESIDUAL in 20260922104000_email_sends.sql.
 */
export function recipientRateKey(
  address: string,
  secret: string | null | undefined,
): string {
  const keyed = recipientHash(address, secret);
  if (keyed) return keyed;
  return (
    "u" +
    createHash("sha256").update(HASH_LABEL + canonicalRecipient(address)).digest("hex")
  );
}

/**
 * Every address becomes "[address]", then any "@" left becomes " at ", so the
 * output never contains "@" (the DB CHECKs depend on it). Backticks are not in
 * the excluded set on purpose: Resend's 422 wraps `email@example.com` in them,
 * and the whole token, backticks included, becomes "[address]".
 */
export function redactAddresses(text: string): string {
  return String(text ?? "")
    .replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+/g, "[address]")
    .replace(/@/g, " at ");
}

/** `text.slice(0, max)` that never ends on half of a surrogate pair. */
function clip(text: string, max: number): string {
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function httpStatusOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

/**
 * Resend's `{ data, error }` as an outcome. Total: any shape, never throws.
 * A network failure arrives as `name: "application_error", statusCode: null`.
 */
export function outcomeFromProvider(
  result: ProviderResult | null | undefined,
): SendOutcome {
  const r: ProviderResult | null =
    result !== null && typeof result === "object" ? result : null;
  const error = r?.error;
  if (error !== null && typeof error === "object") {
    const { name, message, statusCode } = error;
    return {
      ok: false,
      errorCode: typeof name === "string" && name ? name : "unknown",
      errorMessage: typeof message === "string" ? message : "",
      httpStatus: httpStatusOrNull(statusCode),
    };
  }
  const data = r?.data;
  const id = data !== null && typeof data === "object" ? data.id : undefined;
  return { ok: true, providerMessageId: typeof id === "string" && id ? id : null };
}

/** A thrown send (missing RESEND_API_KEY / RESEND_FROM, a bug) as an outcome. */
export function outcomeFromException(err: unknown): SendOutcome {
  let errorMessage: string;
  try {
    errorMessage = err instanceof Error ? err.message : String(err);
  } catch {
    errorMessage = "unprintable error";
  }
  return { ok: false, errorCode: "exception", errorMessage, httpStatus: null };
}

/** The row for one attempt. Never throws, including on `to = ""`. */
export function buildEmailSendRow(input: {
  kind: EmailSendKind;
  userId: string | null;
  to: string;
  secret: string | null | undefined;
  outcome: SendOutcome;
}): EmailSendRow {
  const { kind, userId, to, secret, outcome } = input;
  const base = {
    kind,
    user_id: userId,
    recipient_domain: recipientDomain(to),
    recipient_hash: recipientHash(to, secret),
  };
  if (outcome.ok) {
    const id = outcome.providerMessageId;
    return {
      ...base,
      provider_message_id: id ? clip(redactAddresses(id), 200) || null : null,
      ok: true,
      error_code: null,
      error_message: null,
      http_status: null,
    };
  }
  const message = clip(redactAddresses(outcome.errorMessage), 500);
  return {
    ...base,
    provider_message_id: null,
    ok: false,
    error_code: clip(redactAddresses(outcome.errorCode), 100) || "unknown",
    error_message: message || null,
    http_status: httpStatusOrNull(outcome.httpStatus),
  };
}

const TIMED_OUT = Symbol("timed out");

function errorText(err: unknown): string {
  try {
    return redactAddresses(err instanceof Error ? err.message : String(err));
  } catch {
    return "unprintable error";
  }
}

/**
 * Send, then log the attempt. Logging never changes the outcome, never
 * throws, and never waits longer than `logTimeoutMs` (default 2000): the
 * timeout resolves, it never rejects, and it is cleared afterwards.
 * `onLogError` gets redacted text or the fixed string "timed out".
 */
export async function sendWithLog(opts: {
  kind: EmailSendKind;
  to: string;
  userId: string | null;
  secret: string | null | undefined;
  send: () => Promise<ProviderResult>;
  insert: (row: EmailSendRow) => Promise<unknown>;
  onLogError?: (message: string) => void;
  logTimeoutMs?: number;
}): Promise<SendOutcome> {
  let outcome: SendOutcome;
  try {
    outcome = outcomeFromProvider(await opts.send());
  } catch (err) {
    outcome = outcomeFromException(err);
  }

  const report = (message: string) => {
    try {
      opts.onLogError?.(message);
    } catch {
      // A broken reporter must not turn a logged send into a failed one.
    }
  };
  const ms =
    typeof opts.logTimeoutMs === "number" &&
    Number.isFinite(opts.logTimeoutMs) &&
    opts.logTimeoutMs >= 0
      ? opts.logTimeoutMs
      : 2000;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const row = buildEmailSendRow({
      kind: opts.kind,
      userId: opts.userId,
      to: opts.to,
      secret: opts.secret,
      outcome,
    });
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(resolve, ms, TIMED_OUT);
    });
    const settled = await Promise.race([Promise.resolve(opts.insert(row)), timeout]);
    if (settled === TIMED_OUT) report("timed out");
  } catch (err) {
    report(errorText(err));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return outcome;
}
