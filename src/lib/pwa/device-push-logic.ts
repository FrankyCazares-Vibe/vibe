/**
 * The decisions behind "notifications on this device", kept apart from the
 * browser and app calls that carry them out (handoffs/wave-plan-pwa/plan.md
 * §8 W5/W6 and §8.2; critic-w3.md items 1, 2, 9 and 10, which pin every rule
 * below). device-push.ts reads the device, asks the server, and hands the
 * answers here; this file says what to do with them.
 *
 * Pure: no value imports, only erasable TypeScript, so `node --test` loads it
 * as it is (device-push-logic.test.ts). The WebCrypto digest in addressHash
 * is the one call out, and it exists in Node and every secure page.
 */

import type { PushPlatform } from "../push/device-address";
import type { Platform } from "./display-mode";

/** localStorage: who turned notifications on, on this device (W5). */
export const PUSH_DEVICE_KEY = "vibe_push_device_v1";
/** localStorage: when the last resync failed with a 429 or 5xx (W6). */
export const PUSH_SYNC_FAIL_KEY = "vibe_push_sync_fail_v1";

/** What the Settings card shows for this device (§8.2). */
export type DevicePushStatus =
  | { kind: "hidden" } // not available for this account, signed out, or the GET failed
  | { kind: "unsupported"; why: "browser" | "app-update" | "app-build" } // no Push API / old app binary without the plugin / no Firebase config in this build
  | { kind: "needs-install" } // iPhone browser tab (W13)
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" };

export type TurnOnResult = { ok: true } | { ok: false; status: DevicePushStatus; message?: string };

export type DeviceTransport = "webpush" | "fcm";

/** `vibe_push_device_v1`. `at` is the last successful POST (0 = unknown, W5's rebuild). */
export type DeviceRecord = {
  v: 1;
  user: string;
  transport: DeviceTransport;
  address: string;
  at: number;
};

/**
 * This device's live subscription (web) or token (app). "none" only when every
 * push manager asked answered null; a rejection, a timeout, a missing worker
 * registration or a missing digest is "unknown". The app is never "none": a
 * failed getToken can't prove there is no token (critic-w3.md item 1).
 */
export type CurrentDevice =
  | { k: "some"; address: string; hash: string }
  | { k: "none" }
  | { k: "unknown" };

/** GET /api/me/push-devices, read. */
export type ServerOk = {
  k: "ok";
  user: string;
  available: boolean;
  webpushKey: string | null;
  fcm: boolean;
  /** The first 16 hex of sha256(address) for each of the caller's devices. */
  devices: readonly string[];
};

/** `error.status` is the HTTP status, 0 for a network failure or an abort. */
export type ServerDevices = ServerOk | { k: "signed-out" } | { k: "error"; status: number };

export type ResyncAction = "none" | "post" | "rebuild" | "evict" | "forget" | "resubscribe";

export type ResyncInput = {
  record: DeviceRecord | null;
  current: CurrentDevice;
  /** null = not asked, which is right only when resyncNeedsServer() said so. */
  server: ServerDevices | null;
  now: number;
  /** The store app (FCM) rather than a browser (Web Push). */
  native: boolean;
};

const HOUR_MS = 60 * 60 * 1000;
/** A POST this recent whose row is gone means the sender just dropped it as dead. */
export const RECENT_POST_MS = 24 * HOUR_MS;
/** Re-POST at least this often, so `last_seen_at` stays well inside the 60-day expiry. */
export const REFRESH_MS = 7 * 24 * HOUR_MS;
/** After a 429 or 5xx, no resync for this long (W6). */
export const SYNC_BACKOFF_MS = 10 * 60 * 1000;
/** How many hex characters of the digest both sides compare (critic-w3.md item 9). */
export const HASH_CHARS = 16;

const HASH_PATTERN = /^[0-9a-f]{16}$/;
const MAX_ADDRESS_CHARS = 2048;
const MAX_USER_CHARS = 128;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The platform the server stores (device-address.ts PUSH_PLATFORMS). */
export function pushPlatformFor(p: Platform): PushPlatform {
  switch (p) {
    case "ios-app":
    case "android-app":
      return p;
    case "ios-safari":
    case "ios-other-browser":
    case "ios-in-app":
      return "ios-web";
    case "android-chrome":
    case "android-samsung":
    case "android-other":
      return "android-web";
    case "desktop-chromium":
    case "desktop-safari":
    case "firefox":
      return "desktop-web";
    default:
      return "other";
  }
}

/**
 * The VAPID public key (base64url, padding optional) as the bytes
 * `applicationServerKey` takes, or null when it isn't base64url.
 */
export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> | null {
  if (typeof s !== "string") return null;
  const bare = s.replace(/=+$/, "");
  if (bare === "" || !/^[A-Za-z0-9_-]+$/.test(bare) || bare.length % 4 === 1) return null;
  const b64 = bare.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Was this subscription made with the key we'd use now? Unreadable (null) or
 * missing counts as a match: only a key we can see is different is a reason
 * to throw a working subscription away.
 */
export function keysMatch(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!existing || typeof existing.byteLength !== "number") return true;
  const have = new Uint8Array(existing);
  if (have.length !== wanted.length) return false;
  for (let i = 0; i < have.length; i += 1) if (have[i] !== wanted[i]) return false;
  return true;
}

/**
 * The device's name on the server without the address itself: lowercase hex
 * of SHA-256 over the address's UTF-8 bytes, first 16 characters. The route
 * computes the same (critic-w3.md item 9). Null where WebCrypto isn't there
 * (a LAN address in dev is not a secure page); the caller then treats this
 * device as unknown, which never evicts anything.
 */
export async function addressHash(address: string): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") return null;
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(address));
    let hex = "";
    for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
    return hex.slice(0, HASH_CHARS);
  } catch {
    return null;
  }
}

/** The stored record (a JSON string or the parsed value), or null if it isn't one. */
export function parseDeviceRecord(raw: unknown): DeviceRecord | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isPlainObject(value) || value.v !== 1) return null;
  const { user, transport, address, at } = value;
  if (typeof user !== "string" || user === "" || user.length > MAX_USER_CHARS) return null;
  if (transport !== "webpush" && transport !== "fcm") return null;
  if (typeof address !== "string" || address === "" || address.length > MAX_ADDRESS_CHARS) return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return null;
  return { v: 1, user, transport, address, at };
}

/** A 200 from GET /api/me/push-devices, or null when the body isn't that shape. */
export function parseServerAnswer(body: unknown): ServerOk | null {
  if (!isPlainObject(body) || body.ok !== true) return null;
  const { user, available, webpush_key, fcm, devices } = body;
  if (typeof user !== "string" || user === "") return null;
  if (typeof available !== "boolean" || typeof fcm !== "boolean") return null;
  if (webpush_key !== null && typeof webpush_key !== "string") return null;
  if (!Array.isArray(devices)) return null;
  return {
    k: "ok",
    user,
    available,
    webpushKey: webpush_key === "" ? null : webpush_key,
    fcm,
    devices: devices.filter((d): d is string => typeof d === "string" && HASH_PATTERN.test(d)),
  };
}

/**
 * With no record, rows 1 and 2 decide without the server: nothing here, the
 * app (asking would mean getToken, which switches Firebase on for good, W6),
 * or a device we couldn't read. A record always asks: whose it is decides
 * row 5 even when the device can't be read (an app whose getToken fails on
 * every launch must still drop the last student's row).
 */
export function resyncNeedsServer(input: Pick<ResyncInput, "record" | "current" | "native">): boolean {
  if (input.record !== null) return true;
  return !input.native && input.current.k === "some";
}

/**
 * What one resync does (critic-w3.md item 1, the contract, with row 5 moved
 * ahead of row 2 by the orchestrator in the 3′a repair round). First match wins:
 *  1. no record and no device, or the app with no record → none
 *  2a. no record and a device we couldn't read → none
 *  3. signed out (401), or the server not asked → none; never evict on a 401
 *  4. the GET failed → none
 *  5. the record names another account → evict, even when the device couldn't
 *     be read (then with the record's address only)
 *  2. the device couldn't be read → none
 *  6. no record, and this device is one of the account's → rebuild
 *  7. no record, and it isn't → evict
 *  8. the subscription is gone → forget
 *  9. push isn't available for this account → none; never POST, never unsubscribe
 * 10. the address changed → post (then the old address is deleted)
 * 11. the server doesn't have it: posted under 24 h ago → web resubscribes
 *     (the sender dropped it as dead), the app waits; otherwise → post
 * 12. last POST over 7 days ago (or in the future) → post
 * 13. → none
 */
export function resyncAction(input: ResyncInput): ResyncAction {
  const { record, current, server, now, native } = input;
  if (!resyncNeedsServer(input)) return "none"; // rows 1, 2a
  if (server === null || server.k !== "ok") return "none"; // rows 3–4
  if (record !== null && record.user !== server.user) return "evict"; // row 5
  if (current.k === "unknown") return "none"; // row 2
  if (current.k !== "some") {
    // current is "none" here, so the record exists (row 1 took the rest).
    return record === null ? "none" : "forget"; // row 8
  }
  const known = server.devices.includes(current.hash);
  if (record === null) return known ? "rebuild" : native ? "none" : "evict"; // rows 6–7
  if (!server.available) return "none"; // row 9
  if (current.address !== record.address) return "post"; // row 10
  const age = now - record.at;
  if (!known) {
    if (age >= 0 && age < RECENT_POST_MS) return native ? "none" : "resubscribe";
    return "post"; // row 11
  }
  if (age < 0 || age > REFRESH_MS) return "post"; // row 12
  return "none"; // row 13
}

/** Evict removes the remembered address and the live one, whoever owns them (W5). */
export function evictAddresses(record: DeviceRecord | null, current: CurrentDevice): string[] {
  const out: string[] = [];
  if (record) out.push(record.address);
  if (current.k === "some" && !out.includes(current.address)) out.push(current.address);
  return out;
}

/** Only a 429 or a 5xx starts the 10-minute pause; an offline blip or an abort doesn't. */
export function failureStartsBackoff(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** True while the last failed resync is under 10 minutes old. */
export function backoffActive(failedAt: number | null, now: number): boolean {
  if (failedAt === null || !Number.isFinite(failedAt)) return false;
  const age = now - failedAt;
  return age >= 0 && age < SYNC_BACKOFF_MS;
}

/** What readDevicePush knows before it touches the push managers or the plugin. */
export type ReadGateInput = {
  server: ServerDevices;
  /** The store app (appShellOnClient() !== null). */
  app: boolean;
  /** getPlugin("FirebaseMessaging") is in this app build. */
  pluginPresent: boolean;
  /** An iPhone / iPad browser tab, not the Home Screen app (W13). */
  iosBrowserTab: boolean;
  /** Notification + a push manager exist (window.pushManager, or a service worker's). */
  webPushSupported: boolean;
};

/**
 * The states that don't depend on this device's permission or subscription,
 * or null to go on and read them. Hidden wins over everything (W2; critic-w3.md
 * item 2): no card, no ask and no prompt until the server says yes.
 */
export function readGate(input: ReadGateInput): DevicePushStatus | null {
  const { server } = input;
  if (server.k !== "ok" || !server.available) return { kind: "hidden" };
  if (input.app) {
    if (!server.fcm) return { kind: "hidden" };
    return input.pluginPresent ? null : { kind: "unsupported", why: "app-update" };
  }
  if (!server.webpushKey) return { kind: "hidden" };
  if (input.iosBrowserTab) return { kind: "needs-install" };
  return input.webPushSupported ? null : { kind: "unsupported", why: "browser" };
}

/**
 * The rest (critic-w3.md item 1): "on" only with the permission granted, a live
 * subscription or token, and a record naming THIS account. A record naming
 * someone else reads as off, so the next student never sees the last one's
 * device as theirs.
 */
export function readFinal(input: {
  permission: "granted" | "denied" | "default" | "prompt" | null;
  current: CurrentDevice;
  record: DeviceRecord | null;
  user: string;
}): DevicePushStatus {
  if (input.permission === "denied") return { kind: "denied" };
  if (input.permission !== "granted") return { kind: "off" };
  const mine = input.record !== null && input.record.user === input.user;
  return mine && input.current.k === "some" ? { kind: "on" } : { kind: "off" };
}

/**
 * A refused turn-on POST (critic-w3.md item 10): push isn't for this account
 * (403 push_unavailable) or the table isn't there yet (503) hides the card;
 * anything else leaves the switch off with a line saying why.
 */
export function turnOnRefusal(status: number, code: string | null): "hidden" | "off" {
  if (status === 503) return "hidden";
  return status === 403 && code === "push_unavailable" ? "hidden" : "off";
}
