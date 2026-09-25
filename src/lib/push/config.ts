/**
 * Push notifications: is push switched on here, who may get it, and the keys
 * each transport needs (handoffs/wave-plan-pwa/plan.md §7 2C; critic-push.md
 * items 16, 21 and 25).
 *
 * No `server-only` and no imports at all, so `node --test` loads it
 * (config.test.ts) and so do the other pure push modules. Only erasable
 * TypeScript. Nothing here touches the network or a key's contents beyond
 * checking its shape; the senders sign with the keys.
 *
 * Environment (Production only, never Preview: Preview shares the production
 * database, so a preview holding these could push real students):
 *   PUSH_ENABLED                   exactly "true" turns push on; anything else is off
 *   PUSH_ALLOWLIST                 "*" for everyone, or a comma list of user ids; unset is nobody
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   Web Push public key (browsers subscribe with it)
 *   VAPID_PRIVATE_KEY              Web Push private key, Sensitive; NEVER rotate the pair
 *   VAPID_SUBJECT                  mailto: or https: contact, never localhost (Apple refuses it)
 *   FCM_SERVICE_ACCOUNT_B64        base64 of the FCM service-account JSON, Sensitive
 */

export const PUSH_SITE_ORIGIN = "https://www.connectvibe.app";

/** `next dev` on this Mac, against the LOCAL Supabase copy only. */
export const PUSH_DEV_ORIGIN = "http://localhost:3000";

/**
 * The one site a push may point at and a device may register from, or null
 * where push must not run at all.
 *
 * Production → the live site. `next dev` → localhost, so a local tap lands
 * locally. Everything else (a Preview deploy, `next start`, a test run) →
 * null. It doubles as the Preview guard: 2B refuses a device whose Origin
 * isn't this, and the dispatcher sends only to devices stored with it.
 */
export function pushSiteOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL_ENV === "production") return PUSH_SITE_ORIGIN;
  if (env.NODE_ENV === "development") return PUSH_DEV_ORIGIN;
  return null;
}

/**
 * Push runs here: the switch is exactly "true" AND this is a place push may
 * run (pushSiteOrigin). The second half means a PUSH_ENABLED copied onto
 * Preview by mistake still does nothing there.
 */
export function pushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUSH_ENABLED === "true" && pushSiteOrigin(env) !== null;
}

/**
 * This student may register a device and receive pushes. Push must be on,
 * AND PUSH_ALLOWLIST must be "*" or name them. Unset or blank is nobody, so
 * the founders-only test (plan §3 D6) can't widen by accident; going public
 * is a deliberate "*". The dispatcher re-checks this on every row, so
 * narrowing the list stops pushes at once.
 */
export function pushAllowedFor(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!pushEnabled(env)) return false;
  const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
  if (!id) return false;
  const list = (env.PUSH_ALLOWLIST ?? "").trim();
  if (list === "*") return true;
  return list
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === id);
}

// ---------------------------------------------------------------------------
// Web Push (VAPID) keys
// ---------------------------------------------------------------------------

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/**
 * The shapes `npx web-push generate-vapid-keys` prints: base64url without
 * padding. The public key is an uncompressed P-256 point (65 bytes, first
 * byte 0x04, so it always starts with "B"); the private key is 32 bytes.
 */
const VAPID_PUBLIC_KEY = /^B[A-Za-z0-9_-]{86}$/;
const VAPID_PRIVATE_KEY = /^[A-Za-z0-9_-]{43}$/;

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    h === "0.0.0.0" ||
    /^127\./.test(h)
  );
}

/**
 * VAPID's contact (RFC 8292 §2.1): a `mailto:` address or an `https:` URL on
 * a real domain. Apple answers 403 BadJwtToken to a localhost subject while
 * Google accepts it (web-push issue #947), so a localhost subject would work
 * in Chrome testing and fail on every iPhone. It is refused here instead.
 */
export function isVapidSubject(subject: string): boolean {
  if (typeof subject !== "string") return false;
  if (subject.startsWith("mailto:")) {
    const match = /^mailto:[^@\s/?#]+@([A-Za-z0-9.-]+)$/.exec(subject);
    return Boolean(match && match[1].includes(".") && !isLocalHost(match[1]));
  }
  if (subject.startsWith("https://")) {
    try {
      const url = new URL(subject);
      return url.protocol === "https:" && url.hostname.includes(".") && !isLocalHost(url.hostname);
    } catch {
      return false;
    }
  }
  return false;
}

/** The VAPID pair and subject, or null when any of the three is missing or malformed. */
export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  if (!VAPID_PUBLIC_KEY.test(publicKey)) return null;
  if (!VAPID_PRIVATE_KEY.test(privateKey)) return null;
  if (!isVapidSubject(subject)) return null;
  return { publicKey, privateKey, subject };
}

// ---------------------------------------------------------------------------
// FCM (both store apps) service account
// ---------------------------------------------------------------------------

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

/** Google's project-id rule: 6–30 characters, lowercase, starts with a letter. */
const GCP_PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SERVICE_ACCOUNT_EMAIL = /^[a-z0-9._-]+@[a-z0-9.-]+\.gserviceaccount\.com$/;

/**
 * Base64 (or base64url, with or without padding or line breaks) to UTF-8.
 * `atob` and TextDecoder rather than Buffer, so this file stays loadable
 * anywhere.
 */
function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The FCM service account, from FCM_SERVICE_ACCOUNT_B64 (the whole JSON file
 * Google gives you, base64'd with `base64 -i <file> | pbcopy` so the file
 * never lands in the repo folder). Null when it's missing or doesn't decode
 * to a project id, a service-account email and a private key.
 *
 * The key's contents are not checked here beyond its label; send-fcm.ts
 * signs with it, and /api/health/push reports whether it parses. The
 * token URL inside the JSON is deliberately ignored: the sender only ever
 * talks to Google's own token endpoint.
 */
export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT_B64?.trim() ?? "";
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Utf8(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const projectId = stringField(record, "project_id");
  const clientEmail = stringField(record, "client_email");
  // A key pasted through one JSON layer too many arrives with literal "\n"
  // pairs instead of line breaks; PEM needs the real thing.
  const privateKey = stringField(record, "private_key").replace(/\\n/g, "\n").trim();

  if (!GCP_PROJECT_ID.test(projectId)) return null;
  if (!SERVICE_ACCOUNT_EMAIL.test(clientEmail)) return null;
  if (!privateKey.includes("PRIVATE KEY")) return null;
  return { projectId, clientEmail, privateKey };
}

// ---------------------------------------------------------------------------
// Code ships before the migration
// ---------------------------------------------------------------------------

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);

/**
 * Postgres / PostgREST for "the push tables or claim_push_outbox() don't
 * exist yet" (critic-push.md item 25). Code deploys first, the migration
 * second; in between, "no push schema" must read as "no devices, nothing to
 * send", never a 500. The tables give 42P01 / PGRST205; the RPC gives
 * PGRST202 / 42883. Deliberately narrow: a missing COLUMN is a real fault
 * and still reports itself.
 */
export function isMissingPushSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && MISSING_SCHEMA_CODES.has(code)) return true;
  const text = typeof message === "string" ? message.toLowerCase() : "";
  if (text.includes("could not find the table") || text.includes("could not find the function")) {
    return true;
  }
  return (text.includes("relation") || text.includes("function")) && text.includes("does not exist");
}

const warnedMissingSchema = new Set<string>();

/**
 * Say "push schema missing" once per server instance per caller, not on every
 * like and DM (critic-push.md item 25). `tag` is the caller's log tag.
 */
export function warnMissingPushSchemaOnce(tag: string): void {
  if (warnedMissingSchema.has(tag)) return;
  warnedMissingSchema.add(tag);
  console.warn(`[${tag}] push tables aren't in this database yet; push is skipped until the migration runs`);
}
