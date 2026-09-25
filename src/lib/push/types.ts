/**
 * Push notifications: the shapes both senders speak, and the pure rules that
 * turn a push service's answer into "delete this device", "try again later"
 * or "our config is wrong" (handoffs/wave-plan-pwa/plan.md §7 2C;
 * critic-push.md items 3, 17 and 19).
 *
 * No imports, no `server-only`, only erasable TypeScript (no enum, no
 * namespace), so `node --test` loads it (send-fcm.test.ts). The dispatcher
 * (dispatch.ts) and the payload builder (payload.ts) code against these.
 */

export type PushUrgency = "very-low" | "low" | "normal" | "high";

/** How one push is delivered. The same options for both transports. */
export type PushSendOpts = {
  /** Seconds the push service may hold the message for a phone that is off. */
  ttlSec: number;
  urgency: PushUrgency;
  /**
   * Web Push only: at most 32 base64url characters. A later push with the
   * same topic replaces one that hasn't been delivered yet. An invalid topic
   * is dropped rather than failing the send.
   */
  topic?: string;
};

/**
 * What a send came to. The three flags never combine:
 * - `gone`: the device will never receive again (delete its row);
 * - `retry`: the push service couldn't take it right now (leave the row for re-claim);
 * - `config`: our side is wrong (keys, account, project). Never delete a device over it.
 * All three false is a failure that trying again won't fix (a payload bug).
 */
export type SendFailure = {
  ok: false;
  gone: boolean;
  retry: boolean;
  config: boolean;
  status?: number;
};
export type SendResult = { ok: true } | SendFailure;

export function sendFailure(
  kind: "gone" | "retry" | "config" | "failed",
  status?: number,
): SendFailure {
  const result: SendFailure = {
    ok: false,
    gone: kind === "gone",
    retry: kind === "retry",
    config: kind === "config",
  };
  if (typeof status === "number") result.status = status;
  return result;
}

// ---------------------------------------------------------------------------
// FCM HTTP v1. FcmMessage is the INNER message; sendFcm wraps it as
// `{ message }` (critic-push.md item 3). Field names are FCM's own.
// ---------------------------------------------------------------------------

export type FcmAndroidNotification = {
  channel_id?: string;
  icon?: string;
  color?: string;
  /** A later notification with the same tag replaces this one on the phone. */
  tag?: string;
};

export type FcmAndroid = {
  /** Set by sendFcm from `PushSendOpts.ttlSec`, e.g. "86400s". */
  ttl?: string;
  /** Set by sendFcm from the urgency unless the message already says. */
  priority?: "NORMAL" | "HIGH";
  notification?: FcmAndroidNotification;
};

export type FcmApnsHeaders = {
  /** At most 64 bytes; a later push with the same id replaces this one. */
  "apns-collapse-id"?: string;
  /** Set by sendFcm: UNIX seconds after which Apple stops trying. */
  "apns-expiration"?: string;
  /** Set by sendFcm from the urgency unless the message already says. */
  "apns-priority"?: "5" | "10";
};

export type FcmAps = {
  /** The app-icon count. Omit when unknown: never null, never negative. */
  badge?: number;
  "thread-id"?: string;
  sound?: string;
};

export type FcmApns = {
  headers?: FcmApnsHeaders;
  payload: { aps: FcmAps };
};

export type FcmMessage = {
  token: string;
  notification: { title: string; body: string };
  /** FCM refuses anything but strings here. */
  data: Record<string, string>;
  android: FcmAndroid;
  apns: FcmApns;
};

// ---------------------------------------------------------------------------
// Delivery options, made safe before they reach a push service.
// ---------------------------------------------------------------------------

/** 28 days: FCM's ceiling for a TTL, and web-push's own default. */
export const MAX_TTL_SEC = 2_419_200;

/**
 * TTL is always at least 1 (a 0 means "now or never", which drops every
 * push to a phone that is briefly offline) and never over 28 days. A value
 * that isn't a number means a bug upstream; an hour is the safe guess,
 * because a stale notification is worse than a late one.
 */
export function normalizeTtl(ttlSec: number): number {
  if (typeof ttlSec !== "number" || !Number.isFinite(ttlSec)) return 3600;
  return Math.min(MAX_TTL_SEC, Math.max(1, Math.floor(ttlSec)));
}

export function normalizeUrgency(urgency: unknown): PushUrgency {
  return urgency === "very-low" || urgency === "low" || urgency === "high"
    ? urgency
    : "normal";
}

/** The Topic header's rule (RFC 8030 §5.4); web-push throws on anything else. */
export function isValidTopic(topic: unknown): topic is string {
  return typeof topic === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(topic);
}

// ---------------------------------------------------------------------------
// Web Push answers (RFC 8030 §7; RFC 8292 §4.2). Only the status decides.
// ---------------------------------------------------------------------------

/**
 * - 2xx: delivered to the push service.
 * - 404 / 410: the subscription is dead. Delete it.
 * - 401 / 403: our VAPID key or JWT is wrong (Mozilla answers 401, the
 *   others 403). Every device would fail the same way, so never delete.
 * - 429 / 5xx: the service is busy. The row is re-claimed later.
 * - 400, 413 and anything else: our request is wrong (headers, TTL, size).
 *   Trying again sends the same bad request, so no retry.
 */
export function classifyWebPushStatus(status: number): SendResult {
  if (status >= 200 && status <= 299) return { ok: true };
  if (status === 404 || status === 410) return sendFailure("gone", status);
  if (status === 401 || status === 403) return sendFailure("config", status);
  if (status === 429 || (status >= 500 && status <= 599)) return sendFailure("retry", status);
  return sendFailure("failed", status);
}

/**
 * A short, log-safe reason from a push service's error body: Apple's JSON
 * `reason` ("BadJwtToken", "VapidPkHashMismatch") or Mozilla's `errno`.
 * Anything else is dropped: the body is never logged as it came.
 */
export function webPushReason(body: unknown): string | null {
  if (typeof body !== "string" || !body.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown; errno?: unknown };
    if (typeof parsed.reason === "string" && /^[A-Za-z]{1,40}$/.test(parsed.reason)) {
      return parsed.reason;
    }
    if (typeof parsed.errno === "number" && Number.isInteger(parsed.errno)) {
      return `errno_${parsed.errno}`;
    }
  } catch {
    // not JSON after all
  }
  return null;
}

// ---------------------------------------------------------------------------
// FCM HTTP v1 answers (firebase.google.com/docs/cloud-messaging/error-codes,
// fetched 2026-09-24; critic-push.md item 17). The status alone is NOT
// enough: a 400 covers both a bad token and a bad payload, and treating the
// second as the first would delete every app device in one drain.
// ---------------------------------------------------------------------------

export type FcmVerdict = {
  result: SendFailure;
  /** A 401 that a fresh OAuth access token may fix. Retried once, in the same call. */
  reauth: boolean;
  /** Log-safe: an FCM error code, a Google status, or "http_<status>". */
  reason: string;
};

type FcmErrorDetail = {
  "@type"?: unknown;
  errorCode?: unknown;
  fieldViolations?: unknown;
};

/** The parts of FCM's `{ error: { status, details[] } }` body the map reads. */
export function readFcmError(body: unknown): {
  errorCode: string | null;
  googleStatus: string | null;
  tokenViolation: boolean;
} {
  const error =
    body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  if (!error || typeof error !== "object") {
    return { errorCode: null, googleStatus: null, tokenViolation: false };
  }
  const { status, details } = error as { status?: unknown; details?: unknown };
  let errorCode: string | null = null;
  let tokenViolation = false;
  for (const detail of Array.isArray(details) ? (details as FcmErrorDetail[]) : []) {
    if (!detail || typeof detail !== "object") continue;
    if (errorCode === null && typeof detail.errorCode === "string") errorCode = detail.errorCode;
    const violations = Array.isArray(detail.fieldViolations) ? detail.fieldViolations : [];
    for (const v of violations as { field?: unknown }[]) {
      if (v && typeof v === "object" && v.field === "message.token") tokenViolation = true;
    }
  }
  return {
    errorCode: safeCode(errorCode),
    googleStatus: safeCode(typeof status === "string" ? status : null),
    tokenViolation,
  };
}

function safeCode(code: string | null): string | null {
  return code && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : null;
}

/**
 * Gone (delete the device) ONLY when FCM says the token itself is dead:
 * UNREGISTERED, SENDER_ID_MISMATCH (the token belongs to another Firebase
 * project), or a 400 whose field violation names `message.token`.
 * A bare 404 without UNREGISTERED is a wrong project or URL, so it's config.
 */
export function classifyFcmError(status: number, body: unknown): FcmVerdict {
  const { errorCode, googleStatus, tokenViolation } = readFcmError(body);
  const reason = errorCode ?? googleStatus ?? `http_${status}`;
  const verdict = (kind: "gone" | "retry" | "config" | "failed", reauth = false): FcmVerdict => ({
    result: sendFailure(kind, status),
    reauth,
    reason,
  });

  if (errorCode === "UNREGISTERED" || errorCode === "SENDER_ID_MISMATCH") return verdict("gone");
  if (status === 400) return tokenViolation ? verdict("gone") : verdict("failed");
  if (status === 401) {
    // THIRD_PARTY_AUTH_ERROR is Apple refusing our APNs key in Firebase.
    // Any other 401 is our own OAuth access token, stale or revoked.
    return errorCode === "THIRD_PARTY_AUTH_ERROR" ? verdict("config") : verdict("config", true);
  }
  if (status === 403 || status === 404) return verdict("config");
  if (status === 429 || (status >= 500 && status <= 599)) return verdict("retry");
  return verdict("failed");
}
