/**
 * Tests for `device-address.ts`: which push devices may be stored
 * (handoffs/wave-plan-pwa/plan.md §7 2B; critic-push.md items 20-22).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/device-address.test.ts
 *
 * Every key below is made at run time (critic-push.md item 16): no committed
 * file holds anything key-shaped. The endpoints are the shapes each push
 * service hands out, with made-up tokens.
 */

import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { test } from "node:test";
import { parse as legacyParse } from "node:url";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097). A variable specifier keeps both happy (detect.test.ts).
const specifier = "./device-address.ts";
const {
  addressFromBody,
  isAllowedRegistrationRequest,
  isAllowedWebPushEndpoint,
  isAllowedWebPushHost,
  isValidAuthSecret,
  isValidFcmToken,
  isValidP256dh,
  parseDeviceRegistration,
} = (await import(specifier)) as typeof import("./device-address");

const b64url = (bytes: Buffer) => bytes.toString("base64url");
const token = (n: number) => randomBytes(n).toString("base64url").slice(0, n);

function p256dh(): string {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return b64url(ecdh.getPublicKey()); // uncompressed: 0x04 + X + Y, 65 bytes
}
const AUTH = b64url(randomBytes(16));
const FCM_TOKEN = `${token(22)}:APA91b${token(134)}`;

const FCM = `https://fcm.googleapis.com/fcm/send/${FCM_TOKEN}`;
const MOZILLA = `https://updates.push.services.mozilla.com/wpush/v2/gAAAAA${token(120)}`;
const APPLE = `https://web.push.apple.com/Q${token(100)}`;
const WINDOWS = `https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB${token(60)}%2b${token(40)}%3d`;

test("the endpoint of each browser push service passes", () => {
  for (const endpoint of [FCM, MOZILLA, APPLE, WINDOWS]) {
    assert.equal(isAllowedWebPushEndpoint(endpoint), true, endpoint);
  }
  assert.equal(isAllowedWebPushEndpoint(`https://api.push.apple.com/3/device/${token(40)}`), true);
});

test("look-alike hosts and subdomain tricks are refused", () => {
  const hosts = [
    "fcm.googleapis.com.evil.com",
    "web.push.apple.com.evil.com",
    "updates.push.services.mozilla.com.evil.com",
    "wns2.notify.windows.com.evil.com",
    "evilfcm.googleapis.com",
    "evil-fcm.googleapis.com",
    "a.fcm.googleapis.com",
    "googleapis.com",
    "evilpush.apple.com",
    "push.apple.com",
    "notify.windows.com",
    "evilnotify.windows.com",
    "push.services.mozilla.com",
    "a.updates.push.services.mozilla.com",
    "fcm.googleapis.com.",
    "web.push.apple.com.",
    "evil.com",
    "localhost",
    "127.0.0.1",
    "169.254.169.254",
  ];
  for (const host of hosts) {
    assert.equal(isAllowedWebPushEndpoint(`https://${host}/x/${token(20)}`), false, host);
  }
});

test("the host allow-list itself matches suffixes with their leading dot", () => {
  assert.equal(isAllowedWebPushHost("fcm.googleapis.com"), true);
  assert.equal(isAllowedWebPushHost("a.b.push.apple.com"), true);
  assert.equal(isAllowedWebPushHost(".push.apple.com"), false);
  assert.equal(isAllowedWebPushHost("a..push.apple.com"), false);
  assert.equal(isAllowedWebPushHost("-a.push.apple.com"), false);
  assert.equal(isAllowedWebPushHost("a_b.push.apple.com"), false);
  assert.equal(isAllowedWebPushHost("xpush.apple.com"), false);
  assert.equal(isAllowedWebPushHost("FCM.googleapis.com"), false);
});

test("userinfo can't smuggle in a host, either way round", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com@evil.com/fcm/send/x",
    "https://evil.com@fcm.googleapis.com/fcm/send/x",
    "https://user:pass@fcm.googleapis.com/fcm/send/x",
    "https://:@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com%40evil.com/fcm/send/x",
    "https://fcm.googleapis.com/fcm/send/a@b",
  ]) {
    assert.equal(isAllowedWebPushEndpoint(endpoint), false, endpoint);
  }
});

test("only https, spelled the one canonical way", () => {
  const rest = `fcm.googleapis.com/fcm/send/${FCM_TOKEN}`;
  for (const endpoint of [
    `http://${rest}`,
    `HTTPS://${rest}`,
    `Https://${rest}`,
    `https:${rest}`,
    `https:/${rest}`,
    `https:///${rest}`,
    `//${rest}`,
    rest,
    `wss://${rest}`,
    `ftp://${rest}`,
    `javascript://${rest}`,
  ]) {
    assert.equal(isAllowedWebPushEndpoint(endpoint), false, endpoint);
  }
});

test("no explicit port, not even the default one", () => {
  for (const port of ["443", "8443", "0", "80", ""]) {
    const endpoint = `https://fcm.googleapis.com:${port}/fcm/send/${FCM_TOKEN}`;
    assert.equal(isAllowedWebPushEndpoint(endpoint), false, endpoint);
  }
});

test("the strings the two URL parsers read differently are refused", () => {
  for (const endpoint of [
    "https://evil.com\\@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com\\.evil.com/fcm/send/x",
    "https://fcm.googleapis.com\\fcm\\send\\x",
    "https://fcm.google\tapis.com/fcm/send/x",
    "https://fcm.googleapis.com/fcm/send/x\n",
    "https://fcm.googleapis.com/fcm/send/x\r\nHost: evil.com",
    " https://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com/fcm/send/x ",
    "https://fcm.googleapis.com/fcm/send/\u0000x",
    "https://FCM.googleapis.com/fcm/send/x",
    "https://fcm%2Egoogleapis.com/fcm/send/x",
    "https://fcm．googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com/fcm/./send/x",
    "https://fcm.googleapis.com/fcm/send/../../x",
    "https://fcm.googleapis.com/fcm/send/x#frag",
    "https://fcm.googleapis.com/fcm/send/é",
    "https://[::1]/fcm/send/x",
  ]) {
    assert.equal(isAllowedWebPushEndpoint(endpoint), false, JSON.stringify(endpoint));
  }
});

test("a bare host, an empty string and non-strings are refused", () => {
  assert.equal(isAllowedWebPushEndpoint("https://fcm.googleapis.com/"), false);
  assert.equal(isAllowedWebPushEndpoint("https://fcm.googleapis.com"), false);
  assert.equal(isAllowedWebPushEndpoint(""), false);
  for (const v of [undefined, null, 42, {}, [], [FCM], { toString: () => FCM }]) {
    assert.equal(isAllowedWebPushEndpoint(v), false, String(v));
  }
});

test("endpoints are capped at 1024 characters", () => {
  const head = "https://fcm.googleapis.com/fcm/send/";
  assert.equal(isAllowedWebPushEndpoint(head + "a".repeat(1024 - head.length)), true);
  assert.equal(isAllowedWebPushEndpoint(head + "a".repeat(1025 - head.length)), false);
});

test("whatever passes, Node's legacy parser (web-push's) reads the same host", () => {
  const candidates = [
    FCM, MOZILLA, APPLE, WINDOWS,
    "https://fcm.googleapis.com/fcm/send/x?y=1",
    "https://fcm.googleapis.com/fcm/send/x;y",
    "https://fcm.googleapis.com/fcm/send/%2F..%2Fx",
    "https://fcm.googleapis.com/fcm/send/x'\"<>`{}|^",
    "https://fcm.googleapis.com/fcm/send/!$&()*+,=:",
    "https://fcm.googleapis.com//fcm/send/x",
    "https://evil.com\\@fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.com/x",
    "https:///fcm.googleapis.com/x",
    "https://fcm.googleapis.com:443/x",
  ];
  let passed = 0;
  for (const s of candidates) {
    if (!isAllowedWebPushEndpoint(s)) continue;
    passed += 1;
    const legacy = legacyParse(s);
    assert.equal(legacy.hostname, new URL(s).hostname, s);
    assert.equal(legacy.port, null, s);
    assert.equal(legacy.protocol, "https:", s);
    assert.equal(legacy.auth, null, s);
  }
  assert.ok(passed >= 4, "the real endpoints are among those checked");
});

test("p256dh: 65 bytes, uncompressed point, base64url", () => {
  const key = p256dh();
  assert.equal(key.length, 87);
  assert.equal(isValidP256dh(key), true);
  assert.equal(isValidP256dh(`${key}=`), true, "padded form");
  assert.equal(isValidP256dh(`${key}==`), false, "too much padding");
  const raw = Buffer.from(key, "base64url");
  assert.equal(isValidP256dh(b64url(raw.subarray(0, 64))), false, "64 bytes");
  assert.equal(isValidP256dh(b64url(Buffer.concat([raw, Buffer.from([1])]))), false, "66 bytes");
  const compressedMarker = Buffer.from(raw);
  compressedMarker[0] = 0x02;
  assert.equal(isValidP256dh(b64url(compressedMarker)), false, "not 0x04");
  assert.equal(isValidP256dh(key.slice(0, 86) + "+"), false, "standard alphabet");
  assert.equal(isValidP256dh(key.slice(0, 86) + "/"), false, "standard alphabet");
  assert.equal(isValidP256dh(` ${key}`), false);
  assert.equal(isValidP256dh(key.slice(0, 85)), false, "length % 4 === 1");
  for (const v of [undefined, null, 65, {}, ""]) assert.equal(isValidP256dh(v), false);
});

test("auth: exactly 16 bytes", () => {
  assert.equal(AUTH.length, 22);
  assert.equal(isValidAuthSecret(AUTH), true);
  assert.equal(isValidAuthSecret(`${AUTH}==`), true, "padded form");
  assert.equal(isValidAuthSecret(`${AUTH}=`), false, "wrong padding");
  for (const n of [0, 12, 15, 17, 32]) {
    assert.equal(isValidAuthSecret(b64url(randomBytes(n))), false, `${n} bytes`);
  }
  assert.equal(isValidAuthSecret("a".repeat(21) + "!"), false);
  for (const v of [undefined, null, 16, {}, ""]) assert.equal(isValidAuthSecret(v), false);
});

test("FCM token shape", () => {
  assert.equal(isValidFcmToken(FCM_TOKEN), true);
  assert.equal(isValidFcmToken("a".repeat(100)), true);
  assert.equal(isValidFcmToken("a".repeat(99)), false);
  assert.equal(isValidFcmToken("a".repeat(2048)), true);
  assert.equal(isValidFcmToken("a".repeat(2049)), false, "past the column's CHECK");
  for (const bad of [".", "/", "+", "=", " ", "\n", "@", "%", "é"]) {
    assert.equal(isValidFcmToken(FCM_TOKEN.slice(0, 120) + bad + FCM_TOKEN.slice(121)), false, bad);
  }
  assert.equal(isValidFcmToken(FCM), false, "a web endpoint isn't a token");
  for (const v of [undefined, null, 1e120, {}, []]) assert.equal(isValidFcmToken(v), false);
});

test("a browser registration: endpoint plus both keys", () => {
  const key = p256dh();
  const r = parseDeviceRegistration({
    transport: "webpush",
    address: FCM,
    keys: { p256dh: key, auth: AUTH },
    platform: "desktop-web",
  });
  assert.deepEqual(r, {
    ok: true,
    device: {
      transport: "webpush",
      address: FCM,
      p256dh: key,
      auth: AUTH,
      platform: "desktop-web",
      appVersion: null,
    },
  });
  const noKeys = { transport: "webpush", address: APPLE, platform: "ios-web" };
  assert.equal(parseDeviceRegistration(noKeys).ok, false);
  assert.equal(parseDeviceRegistration({ ...noKeys, keys: null }).ok, false);
  assert.equal(parseDeviceRegistration({ ...noKeys, keys: { p256dh: key } }).ok, false);
  assert.equal(parseDeviceRegistration({ ...noKeys, keys: { p256dh: AUTH, auth: key } }).ok, false);
  assert.equal(parseDeviceRegistration({ ...noKeys, keys: [key, AUTH] }).ok, false);
  const withKeys = { ...noKeys, keys: { p256dh: key, auth: AUTH } };
  assert.equal(parseDeviceRegistration(withKeys).ok, true);
  assert.equal(parseDeviceRegistration({ ...withKeys, address: "https://evil.com/x" }).ok, false);
  assert.equal(parseDeviceRegistration({ ...withKeys, address: FCM_TOKEN }).ok, false);
});

test("a store-app registration: an FCM token and no keys", () => {
  const r = parseDeviceRegistration({
    transport: "fcm",
    address: FCM_TOKEN,
    platform: "ios-app",
    app_version: "1.0.3+42",
  });
  assert.deepEqual(r, {
    ok: true,
    device: {
      transport: "fcm",
      address: FCM_TOKEN,
      p256dh: null,
      auth: null,
      platform: "ios-app",
      appVersion: "1.0.3+42",
    },
  });
  const base = { transport: "fcm", address: FCM_TOKEN, platform: "android-app" };
  assert.equal(parseDeviceRegistration({ ...base, keys: null }).ok, true);
  assert.equal(parseDeviceRegistration({ ...base, keys: { p256dh: p256dh(), auth: AUTH } }).ok, false);
  assert.equal(parseDeviceRegistration({ ...base, address: FCM }).ok, false, "an endpoint isn't a token");
});

test("transport and platform must be known and agree with each other", () => {
  const web = { address: FCM, keys: { p256dh: p256dh(), auth: AUTH } };
  const app = { address: FCM_TOKEN };
  for (const platform of ["ios-web", "android-web", "desktop-web", "other"]) {
    assert.equal(parseDeviceRegistration({ ...web, transport: "webpush", platform }).ok, true, platform);
    assert.equal(parseDeviceRegistration({ ...app, transport: "fcm", platform }).ok, false, platform);
  }
  for (const platform of ["ios-app", "android-app"]) {
    assert.equal(parseDeviceRegistration({ ...app, transport: "fcm", platform }).ok, true, platform);
    assert.equal(parseDeviceRegistration({ ...web, transport: "webpush", platform }).ok, false, platform);
  }
  for (const transport of ["apns", "WEBPUSH", "", null, undefined, "constructor", ["fcm"]]) {
    assert.equal(parseDeviceRegistration({ ...app, transport, platform: "ios-app" }).ok, false);
  }
  for (const platform of ["ios", "iOS-app", "", null, undefined, "toString"]) {
    assert.equal(parseDeviceRegistration({ ...web, transport: "webpush", platform }).ok, false);
  }
  for (const body of [null, undefined, "x", 1, [], [web]]) {
    assert.equal(parseDeviceRegistration(body).ok, false);
  }
});

test("app_version: optional, short, plain", () => {
  const base = { transport: "fcm", address: FCM_TOKEN, platform: "ios-app" };
  const version = (v: unknown) => {
    const r = parseDeviceRegistration({ ...base, app_version: v });
    return r.ok ? r.device.appVersion : "refused";
  };
  assert.equal(version(undefined), null);
  assert.equal(version(null), null);
  assert.equal(version("1.0.0"), "1.0.0");
  assert.equal(version("a".repeat(32)), "a".repeat(32));
  assert.equal(version("a".repeat(33)), "refused");
  assert.equal(version(""), "refused");
  assert.equal(version("1.0 beta"), "refused");
  assert.equal(version("1.0<script>"), "refused");
  assert.equal(version(1), "refused");
});

test("the address to remove: any string the column could hold, under its own field", () => {
  assert.equal(addressFromBody({ address: FCM }, "address"), FCM);
  assert.equal(addressFromBody({ address: "old-looser-row" }, "address"), "old-looser-row");
  assert.equal(addressFromBody({ push_address: FCM_TOKEN }, "push_address"), FCM_TOKEN);
  assert.equal(addressFromBody({ address: FCM }, "push_address"), null);
  assert.equal(addressFromBody({ address: "" }, "address"), null);
  assert.equal(addressFromBody({ address: "a".repeat(2048) }, "address"), "a".repeat(2048));
  assert.equal(addressFromBody({ address: "a".repeat(2049) }, "address"), null);
  for (const v of [null, undefined, "x", [], { address: 1 }, { address: [FCM] }]) {
    assert.equal(addressFromBody(v, "address"), null);
  }
});

test("registering needs JSON from the one origin pushes are sent for", () => {
  const site = "https://www.connectvibe.app";
  const ok = (contentType: string | null, origin: string | null, s: string | null = site) =>
    isAllowedRegistrationRequest({ contentType, origin }, s);
  assert.equal(ok("application/json", site), true);
  assert.equal(ok("application/json; charset=utf-8", site), true);
  assert.equal(ok("Application/JSON", site), true);
  for (const ct of [null, "", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/jsonp", "application/json-patch+json"]) {
    assert.equal(ok(ct, site), false, String(ct));
  }
  for (const origin of [null, "", "null", "https://connectvibe.app", "http://www.connectvibe.app", `${site}/`, `${site}:443`, "https://vibe-git-branch.vercel.app", "https://www.connectvibe.app.evil.com"]) {
    assert.equal(ok("application/json", origin), false, String(origin));
  }
  // Preview and anywhere push isn't served: nothing registers.
  assert.equal(ok("application/json", site, null), false);
  assert.equal(ok("application/json", "null", null), false);
  assert.equal(ok("application/json", "http://localhost:3000", "http://localhost:3000"), true);
});
