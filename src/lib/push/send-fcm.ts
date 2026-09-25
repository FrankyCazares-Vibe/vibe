/**
 * Send one push to one store-app device through Firebase Cloud Messaging
 * (HTTP v1), which also hands iPhone pushes to Apple (handoffs/wave-plan-pwa/
 * plan.md §7 2C; research-stores/wrapper-tech.md §4.2; critic-push.md items
 * 3, 14, 15, 17 and 19).
 *
 * No `server-only` and no runtime `@/` import ON PURPOSE: send-fcm.test.ts
 * loads this file under `node --test`, where server-only throws. It reads
 * only `process.env` (or an injected env) and `node:crypto`, and takes
 * `fetch` and `now` as injectables so the test never touches the network.
 * Nothing secret reaches a browser either way: the service account is not a
 * NEXT_PUBLIC_ variable, so a client bundle would read it as undefined.
 *
 * No new dependency: the OAuth2 service-account grant is one RS256 JWT
 * signed with node:crypto, swapped at Google's token endpoint for an access
 * token that lives about an hour. We reuse it for up to 55 minutes.
 *
 * NEVER LOGGED: the FCM token, the access token, the key, the assertion or
 * the message. Failures log the HTTP status and FCM's error code only.
 */

import { sign } from "node:crypto";

import { fcmConfig, type FcmConfig } from "./config";
import {
  classifyFcmError,
  normalizeTtl,
  normalizeUrgency,
  sendFailure,
  type FcmMessage,
  type PushSendOpts,
  type SendFailure,
  type SendResult,
} from "./types";

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Google's token endpoint, fixed: the one in the service-account JSON is ignored. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Google accepts an assertion that lives at most an hour. */
const ASSERTION_LIFETIME_SEC = 3600;
/** Reuse an access token for at most 55 minutes (it lives about 60). */
const TOKEN_REUSE_MAX_SEC = 55 * 60;
/** After our key or account is refused, don't ask Google again for a minute. */
const TOKEN_REFUSED_PAUSE_MS = 60_000;
/** Per request, token or send (critic-push.md item 14). */
const REQUEST_TIMEOUT_MS = 8000;

export type FcmDeps = {
  fetch?: typeof fetch;
  /** Milliseconds, like Date.now. */
  now?: () => number;
  env?: NodeJS.ProcessEnv;
};

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/**
 * The signed JWT Google swaps for an access token (RFC 7523; Google's
 * "OAuth 2.0 for Server to Server Applications"). RS256 = RSA PKCS#1 v1.5
 * over SHA-256, which is what `sign("sha256", …)` does with an RSA key.
 */
export function buildAssertion(
  account: Pick<FcmConfig, "clientEmail" | "privateKey">,
  nowSec: number,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + ASSERTION_LIFETIME_SEC,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), account.privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

/**
 * The delivery fields sendFcm owns, on a copy of the message (the caller's
 * object is never changed):
 * - `android.ttl` and `apns-expiration` from the TTL, so a push to a phone
 *   that's off for a day doesn't arrive stale four weeks later (FCM's default);
 * - Android priority and APNs priority from the urgency, unless the message
 *   already set them. Only "high" wakes an Android phone from Doze; "low"
 *   and "very-low" let iOS batch the push for battery (APNs priority 5).
 */
export function applyFcmDelivery(message: FcmMessage, opts: PushSendOpts, nowSec: number): FcmMessage {
  const ttl = normalizeTtl(opts.ttlSec);
  const urgency = normalizeUrgency(opts.urgency);
  const headers = message.apns.headers ?? {};
  return {
    ...message,
    android: {
      ...message.android,
      ttl: `${ttl}s`,
      priority: message.android.priority ?? (urgency === "high" ? "HIGH" : "NORMAL"),
    },
    apns: {
      ...message.apns,
      headers: {
        ...headers,
        "apns-expiration": String(nowSec + ttl),
        "apns-priority":
          headers["apns-priority"] ?? (urgency === "high" || urgency === "normal" ? "10" : "5"),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// The access token: one per server instance, shared by concurrent sends
// ---------------------------------------------------------------------------

type TokenOutcome = { ok: true; token: string } | { ok: false; result: SendFailure };

/** Which account a token belongs to. No secret in it. */
function accountKey(account: FcmConfig): string {
  return `${account.projectId} ${account.clientEmail}`;
}

let cachedToken: { key: string; token: string; reuseUntilMs: number } | null = null;
let refused: { key: string; untilMs: number; result: SendFailure } | null = null;
let inflight: { key: string; promise: Promise<TokenOutcome> } | null = null;

/** Forget every cached token and refusal. For tests only. */
export function resetFcmTokenCache(): void {
  cachedToken = null;
  refused = null;
  inflight = null;
}

/** `status` defaults to the result's; token-endpoint failures pass Google's own. */
function logFailure(result: SendFailure, reason: string, status = result.status): void {
  const fields = { status: status ?? null, reason };
  // Config and "our bug" failures need a person; gone and retry are routine.
  if (result.config || (!result.gone && !result.retry)) console.error("[push.fcm]", fields);
  else console.warn("[push.fcm]", fields);
}

/**
 * Our key or account was refused (a 4xx from Google, an unusable key, an
 * answer with no token): config, and a one-minute pause so a drain of 25
 * rows doesn't ask 25 times. Google busy or unreachable: retry, no pause,
 * because the row is re-claimed later anyway.
 */
function refuse(key: string, nowMs: number, reason: string, status?: number): TokenOutcome {
  // The result carries no status: a token endpoint's 400 isn't FCM's 400.
  const result = sendFailure("config");
  refused = { key, untilMs: nowMs + TOKEN_REFUSED_PAUSE_MS, result };
  logFailure(result, reason, status);
  return { ok: false, result };
}

async function requestAccessToken(
  account: FcmConfig,
  doFetch: typeof fetch,
  now: () => number,
): Promise<TokenOutcome> {
  const key = accountKey(account);
  const startedMs = now();
  let assertion: string;
  try {
    assertion = buildAssertion(account, Math.floor(startedMs / 1000));
  } catch {
    return refuse(key, startedMs, "key_unusable");
  }

  let res: Response;
  try {
    res = await doFetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    const result = sendFailure("retry");
    logFailure(result, "token_unreachable");
    return { ok: false, result };
  }

  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      const result = sendFailure("retry");
      logFailure(result, "token_busy", res.status);
      return { ok: false, result };
    }
    // 400 invalid_grant: a deleted or wrong key, or a clock far off.
    return refuse(key, startedMs, "token_refused", res.status);
  }

  const json = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  const token = typeof json?.access_token === "string" ? json.access_token : "";
  if (!token) return refuse(key, startedMs, "token_malformed", res.status);

  const lifetimeSec =
    typeof json?.expires_in === "number" && json.expires_in > 0
      ? json.expires_in
      : ASSERTION_LIFETIME_SEC;
  const reuseSec = Math.min(TOKEN_REUSE_MAX_SEC, Math.max(0, lifetimeSec - 300));
  cachedToken = { key, token, reuseUntilMs: startedMs + reuseSec * 1000 };
  refused = null;
  return { ok: true, token };
}

function accessToken(
  account: FcmConfig,
  doFetch: typeof fetch,
  now: () => number,
): Promise<TokenOutcome> {
  const key = accountKey(account);
  const nowMs = now();
  if (cachedToken && cachedToken.key === key && cachedToken.reuseUntilMs > nowMs) {
    return Promise.resolve({ ok: true, token: cachedToken.token });
  }
  if (refused && refused.key === key && refused.untilMs > nowMs) {
    return Promise.resolve({ ok: false, result: refused.result });
  }
  // Twenty devices sent in parallel on a cold instance share ONE token request.
  if (inflight && inflight.key === key) return inflight.promise;
  const promise = requestAccessToken(account, doFetch, now).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { key, promise };
  return promise;
}

/** A 401 means our cached token is no good: drop it, unless a newer one already replaced it. */
function dropToken(account: FcmConfig, token: string): void {
  if (cachedToken && cachedToken.key === accountKey(account) && cachedToken.token === token) {
    cachedToken = null;
  }
}

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

/**
 * Send one FCM message (critic-push.md item 3). Never throws.
 *
 * - No service account → `config`, before any network call.
 * - 200 → ok.
 * - A 401 that isn't Apple's (THIRD_PARTY_AUTH_ERROR) → drop the cached
 *   access token and try ONCE more in this call; a second 401 is config.
 * - Everything else per `classifyFcmError` (types.ts): gone only for a dead
 *   token, retry for 429 / 5xx, config for our key or project.
 * - No answer at all (timeout, reset) → retry. If FCM did take the first
 *   one, the repeat carries the same tag / collapse id and replaces it.
 */
export async function sendFcm(
  message: FcmMessage,
  opts: PushSendOpts,
  deps: FcmDeps = {},
): Promise<SendResult> {
  try {
    const account = fcmConfig(deps.env ?? process.env);
    if (!account) return sendFailure("config");
    const doFetch = deps.fetch ?? fetch;
    const now = deps.now ?? Date.now;

    const body = JSON.stringify({
      message: applyFcmDelivery(message, opts, Math.floor(now() / 1000)),
    });
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const auth = await accessToken(account, doFetch, now);
      if (!auth.ok) return auth.result;

      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        const result = sendFailure("retry");
        logFailure(result, "unreachable");
        return result;
      }
      if (res.ok) return { ok: true };

      const verdict = classifyFcmError(res.status, await res.json().catch(() => null));
      if (verdict.reauth && attempt === 1) {
        dropToken(account, auth.token);
        continue;
      }
      logFailure(verdict.result, verdict.reason);
      return verdict.result;
    }
    return sendFailure("config");
  } catch {
    // Nothing from the error is logged: it could carry the message or a token.
    const result = sendFailure("failed");
    logFailure(result, "unexpected");
    return result;
  }
}
