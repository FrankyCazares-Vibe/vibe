/**
 * What a push device may be, checked before anything is stored
 * (handoffs/wave-plan-pwa/plan.md §7 2B; critic-push.md items 20-22).
 *
 * A registered device is a promise to send this student's private messages
 * somewhere. For a browser that somewhere is an URL we will POST to from our
 * servers, so the endpoint check below is an SSRF guard as much as a shape
 * check: only the four browser push services, over https, written exactly the
 * way both URL parsers read it the same.
 *
 * WHY SO STRICT ABOUT THE STRING: web-push 3.6.7 sends to `url.parse(endpoint)`
 * (Node's legacy parser), and this file reads it with WHATWG `new URL()`. The
 * two disagree on backslashes, `@`, odd whitespace and extra slashes, which is
 * exactly where an attacker hides a second host. So an endpoint passes only if
 * it is plain printable ASCII with none of those characters AND `new URL(s)`
 * writes it back byte for byte. What's left is a string both parsers agree on.
 * (send-webpush.ts runs the same check again before every send.)
 *
 * Pure: no imports, no Node-only globals, so node:test loads it as it is and a
 * client module could import it without pulling anything in.
 */

export type PushTransport = "webpush" | "fcm";

export type PushPlatform =
  | "ios-app"
  | "android-app"
  | "ios-web"
  | "android-web"
  | "desktop-web"
  | "other";

export const PUSH_TRANSPORTS: readonly PushTransport[] = ["webpush", "fcm"];

export const PUSH_PLATFORMS: readonly PushPlatform[] = [
  "ios-app",
  "android-app",
  "ios-web",
  "android-web",
  "desktop-web",
  "other",
];

/** A browser endpoint longer than this isn't one any push service hands out. */
export const MAX_ENDPOINT_LENGTH = 1024;
/**
 * The `push_devices.address` column's own limit (2A's CHECK). 2048, not the
 * 4096 critic-push item 20 names: a longer value could never enter the unique
 * index (a btree entry tops out at 2704 bytes), so past 2048 it would reach the
 * database only to fail there as a 500. Real FCM tokens are about 160.
 */
export const MAX_ADDRESS_LENGTH = 2048;
/** The store app's version string, e.g. "1.0.3" or "1.0.3+42". */
export const MAX_APP_VERSION_LENGTH = 32;

/** Hosts matched whole. */
const EXACT_HOSTS: ReadonlySet<string> = new Set([
  "fcm.googleapis.com", // Chrome, Edge on Android, most Chromium browsers
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari and the Home Screen web app
]);

/**
 * Hosts matched by suffix, WITH the leading dot, so `evilpush.apple.com` and
 * `push.apple.com.evil.com` both miss. Apple and Windows hand out per-region
 * subdomains (`wns2-par02p.notify.windows.com`).
 */
const HOST_SUFFIXES: readonly string[] = [".push.apple.com", ".notify.windows.com"];

/** One DNS label, lower case (URL has already lower-cased the host). */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Printable ASCII, no space: rules out whitespace, controls and non-ASCII at once. */
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/** An FCM registration token, as the store apps get it from Firebase. */
const FCM_TOKEN = /^[A-Za-z0-9_:-]{100,2048}$/;

/** base64url without padding, or with the right amount of it. */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Letters, digits and `. _ + -`: every version scheme the apps would use. */
const APP_VERSION = /^[0-9A-Za-z._+-]+$/;

/** Is this host one of the browser push services? */
export function isAllowedWebPushHost(hostname: string): boolean {
  if (EXACT_HOSTS.has(hostname)) return true;
  for (const suffix of HOST_SUFFIXES) {
    if (!hostname.endsWith(suffix)) continue;
    const head = hostname.slice(0, -suffix.length);
    // `.push.apple.com` alone has an empty head: not a subdomain, no match.
    if (head.length > 0 && head.split(".").every((label) => DNS_LABEL.test(label))) {
      return true;
    }
  }
  return false;
}

/**
 * A browser push endpoint we are willing to POST to. See the file comment for
 * why every rule is here; each one closes a way the two parsers can disagree.
 */
export function isAllowedWebPushEndpoint(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > MAX_ENDPOINT_LENGTH) return false;
  if (!PRINTABLE_ASCII.test(s)) return false;
  // `@` is how userinfo hides a host; `\` is read as `/` by one parser and not
  // the other; a fragment is never part of an endpoint and web-push drops it.
  if (s.includes("@") || s.includes("\\") || s.includes("#")) return false;
  if (!s.startsWith("https://")) return false;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  // Written back byte for byte: no case folding, no percent-decoding in the
  // host, no dropped default port, no collapsed slashes.
  if (url.href !== s) return false;
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "" || url.port !== "") return false;
  // Every service puts the subscription in the path; a bare host is no endpoint.
  if (url.pathname.length <= 1) return false;
  return isAllowedWebPushHost(url.hostname);
}

/**
 * base64url → bytes, or null when it isn't clean base64url. Padding is allowed
 * only where it belongs (a length that's a multiple of 4). `atob` rather than
 * Buffer so the file stays loadable in a browser too.
 */
function decodeBase64Url(s: string): Uint8Array | null {
  if (!BASE64URL.test(s)) return null;
  if (s.includes("=") && s.length % 4 !== 0) return null;
  const bare = s.replace(/=+$/, "");
  if (bare.length % 4 === 1) return null;
  const std = bare.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The browser's P-256 public key: 65 bytes, the uncompressed-point form, which
 * always starts with 0x04. web-push refuses any other length when it encrypts
 * (its encryption-helper runs the same byte count).
 */
export function isValidP256dh(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 100) return false;
  const bytes = decodeBase64Url(s);
  return bytes !== null && bytes.length === 65 && bytes[0] === 0x04;
}

/** The browser's auth secret: exactly 16 bytes (RFC 8291 §3.2). */
export function isValidAuthSecret(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 32) return false;
  const bytes = decodeBase64Url(s);
  return bytes !== null && bytes.length === 16;
}

/** An FCM registration token: letters, digits, `_`, `:` and `-`, 100 to 2048 long. */
export function isValidFcmToken(s: unknown): s is string {
  return typeof s === "string" && FCM_TOKEN.test(s);
}

/** The store apps. They, and only they, register through FCM (2A's CHECK). */
export function isAppPlatform(p: PushPlatform): boolean {
  return p === "ios-app" || p === "android-app";
}

export type DeviceRegistration = {
  transport: PushTransport;
  address: string;
  /** Both set for webpush, both null for fcm. */
  p256dh: string | null;
  auth: string | null;
  platform: PushPlatform;
  appVersion: string | null;
};

export type DeviceRegistrationResult =
  | { ok: true; device: DeviceRegistration }
  | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The POST /api/me/push-devices body:
 * `{ transport, address, keys?: { p256dh, auth }, platform, app_version? }`.
 * The errors are for developers (a 400), not shown to students.
 */
export function parseDeviceRegistration(body: unknown): DeviceRegistrationResult {
  const fail = (error: string): DeviceRegistrationResult => ({ ok: false, error });
  if (!isPlainObject(body)) return fail("Body must be an object");

  const transport = body.transport;
  if (!PUSH_TRANSPORTS.includes(transport as PushTransport)) {
    return fail("transport must be webpush or fcm");
  }
  const platform = body.platform;
  if (!PUSH_PLATFORMS.includes(platform as PushPlatform)) return fail("Unknown platform");
  const t = transport as PushTransport;
  const p = platform as PushPlatform;
  if ((t === "fcm") !== isAppPlatform(p)) return fail("platform doesn't match transport");

  let appVersion: string | null = null;
  if (body.app_version !== undefined && body.app_version !== null) {
    const v = body.app_version;
    if (typeof v !== "string" || v.length > MAX_APP_VERSION_LENGTH || !APP_VERSION.test(v)) {
      return fail("Invalid app_version");
    }
    appVersion = v;
  }

  if (t === "fcm") {
    if (!isValidFcmToken(body.address)) return fail("Invalid device token");
    // The table requires the key columns empty for an app device.
    if (body.keys !== undefined && body.keys !== null) return fail("keys are for web push only");
    return {
      ok: true,
      device: { transport: t, address: body.address, p256dh: null, auth: null, platform: p, appVersion },
    };
  }

  if (!isAllowedWebPushEndpoint(body.address)) return fail("Unsupported push endpoint");
  const keys = body.keys;
  if (!isPlainObject(keys) || !isValidP256dh(keys.p256dh) || !isValidAuthSecret(keys.auth)) {
    return fail("Invalid subscription keys");
  }
  return {
    ok: true,
    device: {
      transport: t,
      address: body.address,
      p256dh: keys.p256dh,
      auth: keys.auth,
      platform: p,
      appVersion,
    },
  };
}

/**
 * The address named in a DELETE /api/me/push-devices body (`address`) or a
 * logout body (`push_address`), or null. Deliberately NOT the registration
 * rules: removing a device must keep working for a row stored under older,
 * looser rules, so any string the column could hold is accepted. It is only
 * ever used as an equality filter.
 */
export function addressFromBody(body: unknown, field: "address" | "push_address"): string | null {
  if (!isPlainObject(body)) return null;
  const v = body[field];
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_ADDRESS_LENGTH) return null;
  return v;
}

/**
 * The CSRF and Preview guard for registering a device (critic-push.md item 21).
 * The request must be JSON (a cross-site form can't send that without a CORS
 * preflight, which we never answer) and must come from `siteOrigin`, the one
 * origin pushes are sent for. `siteOrigin` is null on Preview and anywhere
 * else push isn't served, and then nothing may register at all: Preview shares
 * the production database, and a row registered there would get production
 * pushes.
 */
export function isAllowedRegistrationRequest(
  req: { contentType: string | null; origin: string | null },
  siteOrigin: string | null,
): boolean {
  if (!siteOrigin || !req.origin || req.origin !== siteOrigin) return false;
  const mediaType = (req.contentType ?? "").split(";")[0].trim().toLowerCase();
  return mediaType === "application/json";
}
