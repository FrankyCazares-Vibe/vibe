import "server-only";

import { parse as legacyUrlParse } from "node:url";
import { getVapidHeaders, sendNotification, type RequestOptions } from "web-push";

import { vapidConfig, type VapidConfig } from "@/lib/push/config";
import {
  isAllowedWebPushEndpoint,
  isValidAuthSecret,
  isValidP256dh,
} from "@/lib/push/device-address";
import {
  classifyWebPushStatus,
  isValidTopic,
  normalizeTtl,
  normalizeUrgency,
  sendFailure,
  webPushReason,
  type PushSendOpts,
  type SendFailure,
  type SendResult,
} from "@/lib/push/types";

/**
 * Send one push to one browser (Chrome, Firefox, Edge, Safari and the
 * installed web app) through its push service (handoffs/wave-plan-pwa/
 * plan.md §7 2C; critic-push.md items 3, 14, 15, 18 and 20).
 *
 * `web-push` is pinned at exactly 3.6.7 (package.json): the facts below were
 * read from that version's source, and a newer one may change them.
 *
 * ONE VAPID JWT PER PUSH SERVICE, NOT PER SEND. web-push signs a fresh JWT
 * on every send when given `vapidDetails` (web-push-lib.js:278-286), and
 * Apple asks for no more than one per hour. So we sign once per push-service
 * origin with a 12-hour expiry and reuse it until an hour before it ends,
 * passing it as our own Authorization header with `vapidDetails: null` (the
 * only way web-push keeps a caller's header, :159-160). Never call
 * `webpush.setVapidDetails`: a global key would re-sign every send.
 *
 * NEVER LOGGED: the endpoint (it is a bearer capability: anyone holding it
 * can push to that browser), the keys, the payload, or web-push's error
 * object, which carries the endpoint (web-push-error.js). Failures log
 * `{status, host, reason}` only.
 */

export type WebPushDevice = { address: string; p256dh: string; auth: string };

/** web-push's JWT limit is 24 h; 12 h is its own default. */
const VAPID_JWT_LIFETIME_SEC = 12 * 60 * 60;
/** Stop reusing a JWT this long before it expires. */
const VAPID_REFRESH_MARGIN_SEC = 60 * 60;
/** Per send (critic-push.md item 14). */
const SEND_TIMEOUT_MS = 8000;
/** 4096-byte record minus the aes128gcm header, tag and padding (RFC 8291). */
const MAX_PAYLOAD_BYTES = 3993;

type CachedJwt = { authorization: string; signedAtSec: number; expiresAtSec: number };
const vapidJwtCache = new Map<string, CachedJwt>();

function jwtCacheKey(audience: string, vapid: VapidConfig): string {
  return `${audience} ${vapid.publicKey} ${vapid.subject}`;
}

/**
 * The Authorization header for one push service. The cache key holds the
 * public key and subject so a changed env re-signs; never the private key.
 * Push services are a handful of origins, but Windows hands out many
 * `*.notify.windows.com` hosts, so the map is capped.
 */
function vapidAuthorization(audience: string, vapid: VapidConfig, nowSec: number): string {
  const key = jwtCacheKey(audience, vapid);
  const hit = vapidJwtCache.get(key);
  if (hit && hit.expiresAtSec - VAPID_REFRESH_MARGIN_SEC > nowSec) return hit.authorization;

  const expiresAtSec = nowSec + VAPID_JWT_LIFETIME_SEC;
  const { Authorization } = getVapidHeaders(
    audience,
    vapid.subject,
    vapid.publicKey,
    vapid.privateKey,
    "aes128gcm",
    expiresAtSec,
  );
  if (vapidJwtCache.size >= 64) vapidJwtCache.clear();
  vapidJwtCache.set(key, { authorization: Authorization, signedAtSec: nowSec, expiresAtSec });
  return Authorization;
}

/**
 * After a 401/403, re-sign on the next send, so a JWT the service won't take
 * isn't reused for eleven hours. But only once the JWT is an hour old:
 * Apple's one-JWT-an-hour rule holds even while our config is wrong.
 */
function forgetVapidJwt(audience: string, vapid: VapidConfig, nowSec: number): void {
  const key = jwtCacheKey(audience, vapid);
  const hit = vapidJwtCache.get(key);
  if (hit && nowSec - hit.signedAtSec >= VAPID_REFRESH_MARGIN_SEC) vapidJwtCache.delete(key);
}

/**
 * The push service's origin (the JWT's `aud`), or null when we won't POST
 * to this endpoint. The allow-list check again, at send time (a row stored
 * before a rule tightened must not slip through), PLUS the one thing only
 * this file can check: web-push 3.6.7 sends with Node's legacy `url.parse`
 * (web-push-lib.js:274, :348), so that parser must see the same host, the
 * same scheme and no port. (Node prints its DEP0169 url.parse warning once
 * per process; web-push's own calls would print it anyway.)
 */
function endpointAudience(address: string): string | null {
  if (!isAllowedWebPushEndpoint(address)) return null;
  try {
    const whatwg = new URL(address);
    const legacy = legacyUrlParse(address);
    if (legacy.protocol !== "https:" || legacy.port) return null;
    if (legacy.hostname !== whatwg.hostname) return null;
    return whatwg.origin;
  } catch {
    return null;
  }
}

function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return "invalid";
  }
}

function logFailure(result: SendFailure, host: string, reason: string | null): void {
  const fields = { status: result.status ?? null, host, reason };
  // Config and "our bug" failures need a person; gone and retry are routine.
  if (result.config || (!result.gone && !result.retry)) console.error("[push.webpush]", fields);
  else console.warn("[push.webpush]", fields);
}

/**
 * Why a send threw. A WebPushError carries the push service's status. A
 * system error code (ECONNRESET, ETIMEDOUT, EAI_AGAIN…) or web-push's own
 * "Socket timeout" means no answer came, so trying later is safe. Anything
 * else was thrown before the request left (web-push refusing a key or the
 * payload), and sending it again would throw again.
 */
function failureFromThrow(err: unknown): { result: SendFailure; reason: string | null } {
  if (err && typeof err === "object") {
    const e = err as { statusCode?: unknown; body?: unknown; code?: unknown; message?: unknown };
    if (typeof e.statusCode === "number") {
      const result = classifyWebPushStatus(e.statusCode);
      if (!result.ok) return { result, reason: webPushReason(e.body) };
    }
    if (typeof e.code === "string" && /^E(?!RR_)[A-Z_]{2,30}$/.test(e.code)) {
      return { result: sendFailure("retry"), reason: e.code };
    }
    if (e.message === "Socket timeout") return { result: sendFailure("retry"), reason: "timeout" };
  }
  return { result: sendFailure("failed"), reason: "refused_locally" };
}

/**
 * Send one push to one browser. Never throws (critic-push.md item 3).
 *
 * - No VAPID config → `config`, before any network call.
 * - An endpoint we wouldn't store, or keys that can't encrypt → `gone`: the
 *   row can never be sent to, so the dispatcher deletes it.
 * - A payload over 3993 bytes or empty → failed (a payload.ts bug).
 * - Otherwise the push service's status, per `classifyWebPushStatus`.
 *
 * TTL, Urgency and Topic go ONLY as web-push options: it throws when one is
 * also in `headers`, and TTL is always explicit because web-push's default
 * is four weeks (web-push-lib.js:13).
 */
export async function sendWebPush(
  device: WebPushDevice,
  payload: string,
  opts: PushSendOpts,
): Promise<SendResult> {
  let host = "unknown";
  try {
    const vapid = vapidConfig(process.env);
    if (!vapid) return sendFailure("config");
    host = hostOf(device.address);

    const audience = endpointAudience(device.address);
    if (!audience) {
      const result = sendFailure("gone");
      logFailure(result, host, "endpoint_refused");
      return result;
    }
    if (!isValidP256dh(device.p256dh) || !isValidAuthSecret(device.auth)) {
      const result = sendFailure("gone");
      logFailure(result, host, "keys_invalid");
      return result;
    }
    const bytes = typeof payload === "string" ? Buffer.byteLength(payload, "utf8") : 0;
    if (bytes === 0 || bytes > MAX_PAYLOAD_BYTES) {
      const result = sendFailure("failed");
      logFailure(result, host, "payload_size");
      return result;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let authorization: string;
    try {
      authorization = vapidAuthorization(audience, vapid, nowSec);
    } catch {
      const result = sendFailure("config");
      logFailure(result, host, "vapid_unusable");
      return result;
    }

    // `vapidDetails: null` keeps OUR Authorization header (web-push accepts
    // any falsy value, web-push-lib.js:159-160). @types/web-push 3.6.4 only
    // allows an object or undefined there, hence the cast.
    const options = {
      vapidDetails: null,
      headers: { Authorization: authorization },
      TTL: normalizeTtl(opts.ttlSec),
      urgency: normalizeUrgency(opts.urgency),
      timeout: SEND_TIMEOUT_MS,
      ...(isValidTopic(opts.topic) ? { topic: opts.topic } : {}),
    } as unknown as RequestOptions;

    try {
      const res = await sendNotification(
        { endpoint: device.address, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload,
        options,
      );
      const result = classifyWebPushStatus(res.statusCode);
      if (!result.ok) logFailure(result, host, null);
      return result;
    } catch (err) {
      const { result, reason } = failureFromThrow(err);
      if (result.config) forgetVapidJwt(audience, vapid, Math.floor(Date.now() / 1000));
      logFailure(result, host, reason);
      return result;
    }
  } catch {
    // Nothing from the error is logged: it could carry the endpoint.
    const result = sendFailure("failed");
    logFailure(result, host, "unexpected");
    return result;
  }
}
