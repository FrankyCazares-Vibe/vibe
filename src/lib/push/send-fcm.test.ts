/**
 * Tests for `send-fcm.ts` (the store apps' sender) and the pure answer maps
 * in `types.ts` that both senders use (handoffs/wave-plan-pwa/plan.md §7 2C;
 * critic-push.md items 3, 15, 16, 17 and 19).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/send-fcm.test.ts
 *
 * NO NETWORK. Every request goes to a fake `fetch` that answers the way
 * Google's token endpoint and FCM do (bodies per firebase.google.com/docs/
 * cloud-messaging/error-codes, fetched 2026-09-24). The clock is injected.
 *
 * THE REPO IS PUBLIC (critic-push.md item 16). The RSA key is generated when
 * the test runs; the service-account JSON is assembled in memory and its key
 * field's name is built at runtime, so no file here looks like a Google
 * credential to a secret scanner. The "tokens" are plain filler strings.
 *
 * WHY THE RESOLVE HOOK: send-fcm.ts imports "./config" and "./types" with no
 * extension. tsc and Next resolve that; Node's type stripping doesn't. The
 * hook retries a failed relative specifier with ".ts" (the pattern in
 * src/lib/pwa/display-mode.test.ts), and the modules load through a dynamic
 * `import()` so the hook is registered first.
 */

import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("send-fcm.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const senderSpecifier = "./send-fcm.ts";
const typesSpecifier = "./types.ts";
const {
  FCM_SCOPE,
  GOOGLE_TOKEN_URL,
  applyFcmDelivery,
  buildAssertion,
  resetFcmTokenCache,
  sendFcm,
} = (await import(senderSpecifier)) as typeof import("./send-fcm");
const {
  MAX_TTL_SEC,
  classifyFcmError,
  classifyWebPushStatus,
  isValidTopic,
  normalizeTtl,
  normalizeUrgency,
  webPushReason,
} = (await import(typesSpecifier)) as typeof import("./types");
type FcmMessage = import("./types").FcmMessage;

// ---------------------------------------------------------------------------
// Fixtures, all made at runtime
// ---------------------------------------------------------------------------

const { privateKey: rsaPrivate, publicKey: rsaPublic } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = rsaPrivate.export({ type: "pkcs8", format: "pem" }).toString();
const KEY_FIELD = ["private", "key"].join("_");
const PROJECT = "vibe-test-project";
const CLIENT_EMAIL = "push-sender@vibe-test-project.iam.gserviceaccount.com";
const ACCOUNT_B64 = Buffer.from(
  JSON.stringify({ project_id: PROJECT, client_email: CLIENT_EMAIL, [KEY_FIELD]: PEM }),
  "utf8",
).toString("base64");
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}
const ENV = env({ FCM_SERVICE_ACCOUNT_B64: ACCOUNT_B64 });

const SEND_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const DEVICE_TOKEN = `fake-device-token-${"x".repeat(140)}`;
const T0 = Date.UTC(2026, 8, 24, 12, 0, 0);

function message(): FcmMessage {
  return {
    token: DEVICE_TOKEN,
    notification: { title: "Maya", body: "secret lunch plans" },
    data: { url: "https://www.connectvibe.app/messages?channel=abc", tag: "dm:abc", kind: "dm" },
    android: { notification: { channel_id: "messages", icon: "ic_stat_vibe", tag: "dm:abc" } },
    apns: { headers: { "apns-collapse-id": "dm:abc" }, payload: { aps: { badge: 3, sound: "default" } } },
  };
}

type Answer = (() => Response) | Error;
type Call = { url: string; init: RequestInit };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const tokenOk = (token = "test-access-1", expiresIn = 3599): Answer => () =>
  json(200, { access_token: token, expires_in: expiresIn, token_type: "Bearer" });
const fcmOk = (): Answer => () => json(200, { name: `projects/${PROJECT}/messages/1` });
function fcmError(status: number, googleStatus: string, details: unknown[] = []): Answer {
  return () => json(status, { error: { code: status, message: "…", status: googleStatus, details } });
}
const fcmCode = (errorCode: string) => ({
  "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
  errorCode,
});

/** Answers token requests and sends from two queues, and records every call. */
function fakeFetch(answers: { token?: Answer[]; send?: Answer[] }) {
  const token = [...(answers.token ?? [])];
  const send = [...(answers.send ?? [])];
  const calls: { token: Call[]; send: Call[] } = { token: [], send: [] };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const queue = url === GOOGLE_TOKEN_URL ? token : url === SEND_URL ? send : null;
    if (!queue) throw new Error(`test fetch: unexpected URL ${url}`);
    (url === GOOGLE_TOKEN_URL ? calls.token : calls.send).push({ url, init: init ?? {} });
    const answer = queue.shift();
    if (!answer) throw new Error(`test fetch: no answer left for ${url}`);
    if (answer instanceof Error) throw answer;
    return answer();
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

/** Runs `fn` with console.error / console.warn captured, and returns what was logged. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string }> {
  const original = { error: console.error, warn: console.warn };
  const lines: string[] = [];
  const keep = (...args: unknown[]) => void lines.push(args.map((a) => JSON.stringify(a) ?? String(a)).join(" "));
  console.error = keep;
  console.warn = keep;
  try {
    return { value: await fn(), logged: lines.join("\n") };
  } finally {
    console.error = original.error;
    console.warn = original.warn;
  }
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The OAuth assertion
// ---------------------------------------------------------------------------

test("the assertion is an RS256 JWT for FCM's scope, signed by the service account", () => {
  const nowSec = Math.floor(T0 / 1000);
  const jwt = buildAssertion({ clientEmail: CLIENT_EMAIL, privateKey: PEM }, nowSec);
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(decodePart(header), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decodePart(claims), {
    iss: CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  assert.equal(FCM_SCOPE, "https://www.googleapis.com/auth/firebase.messaging");
  assert.equal(GOOGLE_TOKEN_URL, "https://oauth2.googleapis.com/token");

  const input = Buffer.from(`${header}.${claims}`, "utf8");
  assert.equal(verify("sha256", input, rsaPublic, Buffer.from(signature, "base64url")), true);
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
  assert.equal(verify("sha256", input, other, Buffer.from(signature, "base64url")), false);
});

// ---------------------------------------------------------------------------
// A send, end to end against the fake
// ---------------------------------------------------------------------------

test("a send swaps the assertion for a token, then posts {message} with the delivery fields", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({ token: [tokenOk()], send: [fcmOk()] });
  const original = message();
  const result = await sendFcm(original, { ttlSec: 86400, urgency: "high" }, { fetch: fake.fetch, now: () => T0, env: ENV });
  assert.deepEqual(result, { ok: true });

  const [tokenCall] = fake.calls.token;
  assert.equal(tokenCall.init.method, "POST");
  assert.equal(new Headers(tokenCall.init.headers).get("content-type"), "application/x-www-form-urlencoded");
  const form = new URLSearchParams(String(tokenCall.init.body));
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, s] = String(form.get("assertion")).split(".");
  assert.equal(decodePart(c).iss, CLIENT_EMAIL);
  assert.equal(verify("sha256", Buffer.from(`${h}.${c}`), rsaPublic, Buffer.from(s, "base64url")), true);

  const [sendCall] = fake.calls.send;
  assert.equal(sendCall.init.method, "POST");
  assert.equal(new Headers(sendCall.init.headers).get("authorization"), "Bearer test-access-1");
  const body = JSON.parse(String(sendCall.init.body)) as { message: FcmMessage };
  assert.deepEqual(Object.keys(body), ["message"]);
  assert.equal(body.message.token, DEVICE_TOKEN);
  assert.equal(body.message.android.ttl, "86400s");
  assert.equal(body.message.android.priority, "HIGH");
  assert.equal(body.message.android.notification?.channel_id, "messages");
  assert.deepEqual(body.message.apns.headers, {
    "apns-collapse-id": "dm:abc",
    "apns-expiration": String(Math.floor(T0 / 1000) + 86400),
    "apns-priority": "10",
  });
  assert.deepEqual(original, message(), "the caller's message is never changed");
});

test("one access token serves every send for 55 minutes, then a new one is fetched", async () => {
  resetFcmTokenCache();
  let now = T0;
  const fake = fakeFetch({ token: [tokenOk("test-access-1"), tokenOk("test-access-2")], send: [fcmOk(), fcmOk(), fcmOk()] });
  const deps = { fetch: fake.fetch, now: () => now, env: ENV };
  await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps);
  now = T0 + 54 * 60_000;
  await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps);
  assert.equal(fake.calls.token.length, 1);
  now = T0 + 56 * 60_000;
  await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps);
  assert.equal(fake.calls.token.length, 2);
  assert.equal(new Headers(fake.calls.send[2].init.headers).get("authorization"), "Bearer test-access-2");
});

test("sends started together on a cold instance share one token request", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({ token: [tokenOk()], send: [fcmOk(), fcmOk(), fcmOk(), fcmOk()] });
  const deps = { fetch: fake.fetch, now: () => T0, env: ENV };
  const results = await Promise.all(
    [1, 2, 3, 4].map(() => sendFcm(message(), { ttlSec: 60, urgency: "low" }, deps)),
  );
  assert.deepEqual(results, [{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
  assert.equal(fake.calls.token.length, 1);
  assert.equal(fake.calls.send.length, 4);
});

test("no service account: config, and nothing leaves the server", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({});
  for (const values of [{}, { FCM_SERVICE_ACCOUNT_B64: "bm90IGpzb24=" }]) {
    const result = await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, { fetch: fake.fetch, env: env(values) });
    assert.deepEqual(result, { ok: false, gone: false, retry: false, config: true });
  }
  assert.equal(fake.calls.token.length + fake.calls.send.length, 0);
});

// ---------------------------------------------------------------------------
// 401s: our access token, or Apple's key
// ---------------------------------------------------------------------------

test("a 401 UNAUTHENTICATED drops the cached token and retries once with a fresh one", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({
    token: [tokenOk("test-access-1"), tokenOk("test-access-2")],
    send: [fcmError(401, "UNAUTHENTICATED"), fcmOk()],
  });
  const { value } = await captureLogs(() =>
    sendFcm(message(), { ttlSec: 60, urgency: "normal" }, { fetch: fake.fetch, now: () => T0, env: ENV }),
  );
  assert.deepEqual(value, { ok: true });
  assert.equal(fake.calls.token.length, 2);
  assert.equal(new Headers(fake.calls.send[1].init.headers).get("authorization"), "Bearer test-access-2");
});

test("a second 401 in the same call is config, with no third try", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({
    token: [tokenOk("test-access-1"), tokenOk("test-access-2")],
    send: [fcmError(401, "UNAUTHENTICATED"), fcmError(401, "UNAUTHENTICATED")],
  });
  const { value } = await captureLogs(() =>
    sendFcm(message(), { ttlSec: 60, urgency: "normal" }, { fetch: fake.fetch, now: () => T0, env: ENV }),
  );
  assert.deepEqual(value, { ok: false, gone: false, retry: false, config: true, status: 401 });
  assert.equal(fake.calls.send.length, 2);
});

test("Apple refusing our APNs key (THIRD_PARTY_AUTH_ERROR) is config without a re-auth", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({
    token: [tokenOk()],
    send: [fcmError(401, "UNAUTHENTICATED", [fcmCode("THIRD_PARTY_AUTH_ERROR")])],
  });
  const { value } = await captureLogs(() =>
    sendFcm(message(), { ttlSec: 60, urgency: "normal" }, { fetch: fake.fetch, now: () => T0, env: ENV }),
  );
  assert.deepEqual(value, { ok: false, gone: false, retry: false, config: true, status: 401 });
  assert.equal(fake.calls.token.length, 1);
  assert.equal(fake.calls.send.length, 1);
});

// ---------------------------------------------------------------------------
// FCM's answers: delete only a dead token (critic-push.md item 17)
// ---------------------------------------------------------------------------

test("only a dead token is gone: UNREGISTERED, SENDER_ID_MISMATCH, or a 400 naming message.token", () => {
  const badRequest = (field: string) => ({
    "@type": "type.googleapis.com/google.rpc.BadRequest",
    fieldViolations: [{ field, description: "…" }],
  });
  const body = (status: string, details: unknown[]) => ({ error: { status, details } });
  const cases: [number, unknown, "gone" | "retry" | "config" | "failed"][] = [
    [404, body("NOT_FOUND", [fcmCode("UNREGISTERED")]), "gone"],
    [403, body("PERMISSION_DENIED", [fcmCode("SENDER_ID_MISMATCH")]), "gone"],
    [400, body("INVALID_ARGUMENT", [fcmCode("INVALID_ARGUMENT"), badRequest("message.token")]), "gone"],
    // A bad payload is ALSO INVALID_ARGUMENT: deleting on it would wipe every app device.
    [400, body("INVALID_ARGUMENT", [fcmCode("INVALID_ARGUMENT"), badRequest("message.android.ttl")]), "failed"],
    [400, body("INVALID_ARGUMENT", [fcmCode("INVALID_ARGUMENT")]), "failed"],
    [400, null, "failed"],
    [404, body("NOT_FOUND", []), "config"],
    [404, "not json", "config"],
    [403, body("PERMISSION_DENIED", []), "config"],
    [401, body("UNAUTHENTICATED", [fcmCode("THIRD_PARTY_AUTH_ERROR")]), "config"],
    [429, body("RESOURCE_EXHAUSTED", [fcmCode("QUOTA_EXCEEDED")]), "retry"],
    [500, body("INTERNAL", [fcmCode("INTERNAL")]), "retry"],
    [503, body("UNAVAILABLE", [fcmCode("UNAVAILABLE")]), "retry"],
    [502, null, "retry"],
    [409, null, "failed"],
  ];
  for (const [status, errorBody, kind] of cases) {
    const { result, reauth } = classifyFcmError(status, errorBody);
    const label = `${status} ${JSON.stringify(errorBody)}`;
    assert.equal(result.ok, false, label);
    assert.equal(result.status, status, label);
    assert.deepEqual(
      { gone: result.gone, retry: result.retry, config: result.config },
      { gone: kind === "gone", retry: kind === "retry", config: kind === "config" },
      label,
    );
    assert.equal(reauth, false, label);
  }
  assert.equal(classifyFcmError(401, body("UNAUTHENTICATED", [])).reauth, true);
  assert.equal(classifyFcmError(401, null).reauth, true);
});

test("the logged reason is FCM's code or Google's status, never free text", () => {
  assert.equal(classifyFcmError(404, { error: { status: "NOT_FOUND", details: [fcmCode("UNREGISTERED")] } }).reason, "UNREGISTERED");
  assert.equal(classifyFcmError(403, { error: { status: "PERMISSION_DENIED" } }).reason, "PERMISSION_DENIED");
  assert.equal(classifyFcmError(500, { error: { status: "internal error: token abc" } }).reason, "http_500");
  assert.equal(classifyFcmError(400, { error: { details: [fcmCode("x; drop table")] } }).reason, "http_400");
});

test("through sendFcm: UNREGISTERED is gone and 503 is retry", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({
    token: [tokenOk()],
    send: [fcmError(404, "NOT_FOUND", [fcmCode("UNREGISTERED")]), fcmError(503, "UNAVAILABLE")],
  });
  const deps = { fetch: fake.fetch, now: () => T0, env: ENV };
  const { value: gone } = await captureLogs(() => sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps));
  assert.deepEqual(gone, { ok: false, gone: true, retry: false, config: false, status: 404 });
  const { value: busy } = await captureLogs(() => sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps));
  assert.deepEqual(busy, { ok: false, gone: false, retry: true, config: false, status: 503 });
});

// ---------------------------------------------------------------------------
// Google's token endpoint and the network
// ---------------------------------------------------------------------------

test("a refused key is config, and Google isn't asked again for a minute", async () => {
  resetFcmTokenCache();
  let now = T0;
  const refused: Answer = () => json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
  const fake = fakeFetch({ token: [refused, tokenOk()], send: [fcmOk()] });
  const deps = { fetch: fake.fetch, now: () => now, env: ENV };
  const configOnly = { ok: false, gone: false, retry: false, config: true };

  const { value: first } = await captureLogs(() => sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps));
  assert.deepEqual(first, configOnly);
  now = T0 + 30_000;
  const { value: paused } = await captureLogs(() => sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps));
  assert.deepEqual(paused, configOnly);
  assert.equal(fake.calls.token.length, 1, "no second token request inside the pause");

  now = T0 + 61_000;
  assert.deepEqual(await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps), { ok: true });
  assert.equal(fake.calls.token.length, 2);
});

test("an answer without a token is config; Google busy or unreachable is retry", async () => {
  resetFcmTokenCache();
  const deps = (answers: Answer[]) => ({ fetch: fakeFetch({ token: answers }).fetch, now: () => T0, env: ENV });
  const run = (answers: Answer[]) =>
    captureLogs(() => sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps(answers)));

  const configOnly = { ok: false, gone: false, retry: false, config: true };
  assert.deepEqual((await run([() => json(200, { token_type: "Bearer" })])).value, configOnly);
  resetFcmTokenCache();
  assert.deepEqual((await run([() => new Response("<html>", { status: 200 })])).value, configOnly);
  resetFcmTokenCache();
  assert.deepEqual((await run([() => json(503, {})])).value, { ok: false, gone: false, retry: true, config: false });
  resetFcmTokenCache();
  assert.deepEqual((await run([() => json(429, {})])).value, { ok: false, gone: false, retry: true, config: false });
  resetFcmTokenCache();
  assert.deepEqual((await run([new TypeError("fetch failed")])).value, { ok: false, gone: false, retry: true, config: false });
});

test("no answer from FCM (timeout, reset) is retry, and the sender never throws", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({ token: [tokenOk()], send: [new DOMException("timed out", "TimeoutError")] });
  const { value } = await captureLogs(() =>
    sendFcm(message(), { ttlSec: 60, urgency: "normal" }, { fetch: fake.fetch, now: () => T0, env: ENV }),
  );
  assert.deepEqual(value, { ok: false, gone: false, retry: true, config: false });

  const broken = { ...message(), apns: undefined } as unknown as FcmMessage;
  const { value: failed } = await captureLogs(() =>
    sendFcm(broken, { ttlSec: 60, urgency: "normal" }, { fetch: fakeFetch({}).fetch, now: () => T0, env: ENV }),
  );
  assert.deepEqual(failed, { ok: false, gone: false, retry: false, config: false });
});

test("logs never carry the device token, an access token, the key or the message", async () => {
  resetFcmTokenCache();
  const fake = fakeFetch({
    token: [tokenOk("test-access-SECRET")],
    send: [
      fcmError(400, "INVALID_ARGUMENT", [fcmCode("INVALID_ARGUMENT")]),
      fcmError(404, "NOT_FOUND", [fcmCode("UNREGISTERED")]),
      new Error(`socket closed while sending to ${DEVICE_TOKEN}`),
    ],
  });
  const deps = { fetch: fake.fetch, now: () => T0, env: ENV };
  const { logged } = await captureLogs(async () => {
    for (let i = 0; i < 3; i += 1) await sendFcm(message(), { ttlSec: 60, urgency: "normal" }, deps);
  });
  assert.notEqual(logged, "", "failures are logged");
  for (const secret of [DEVICE_TOKEN, "test-access-SECRET", "PRIVATE KEY", "secret lunch plans", "Maya", CLIENT_EMAIL]) {
    assert.equal(logged.includes(secret), false, `log contains ${secret.slice(0, 24)}`);
  }
  assert.match(logged, /\[push\.fcm\]/);
});

// ---------------------------------------------------------------------------
// Delivery fields sendFcm owns
// ---------------------------------------------------------------------------

test("urgency maps to Android and APNs priority, unless the message already chose", () => {
  const nowSec = Math.floor(T0 / 1000);
  const low = applyFcmDelivery(message(), { ttlSec: 3600, urgency: "low" }, nowSec);
  assert.equal(low.android.priority, "NORMAL");
  assert.equal(low.apns.headers?.["apns-priority"], "5");
  const normal = applyFcmDelivery(message(), { ttlSec: 3600, urgency: "normal" }, nowSec);
  assert.equal(normal.android.priority, "NORMAL");
  assert.equal(normal.apns.headers?.["apns-priority"], "10");

  const chosen = message();
  chosen.android.priority = "HIGH";
  chosen.apns.headers = { "apns-priority": "5" };
  const kept = applyFcmDelivery(chosen, { ttlSec: 3600, urgency: "very-low" }, nowSec);
  assert.equal(kept.android.priority, "HIGH");
  assert.equal(kept.apns.headers?.["apns-priority"], "5");
});

test("the TTL is always at least a second and at most 28 days, on both platforms", () => {
  const nowSec = Math.floor(T0 / 1000);
  const zero = applyFcmDelivery(message(), { ttlSec: 0, urgency: "normal" }, nowSec);
  assert.equal(zero.android.ttl, "1s");
  assert.equal(zero.apns.headers?.["apns-expiration"], String(nowSec + 1));
  const huge = applyFcmDelivery(message(), { ttlSec: 1e12, urgency: "normal" }, nowSec);
  assert.equal(huge.android.ttl, `${MAX_TTL_SEC}s`);
  const noHeaders = { ...message(), apns: { payload: { aps: {} } } } as FcmMessage;
  const filled = applyFcmDelivery(noHeaders, { ttlSec: 90.9, urgency: "high" }, nowSec);
  assert.deepEqual(filled.apns.headers, { "apns-expiration": String(nowSec + 90), "apns-priority": "10" });
});

// ---------------------------------------------------------------------------
// The pure maps in types.ts that send-webpush.ts uses (it imports server-only,
// so it can't load here; its decisions live in these functions instead)
// ---------------------------------------------------------------------------

test("web push statuses: 404/410 gone, 401/403 config, 429/5xx retry, the rest our bug", () => {
  assert.deepEqual(classifyWebPushStatus(201), { ok: true });
  assert.deepEqual(classifyWebPushStatus(200), { ok: true });
  const kinds: [number, "gone" | "retry" | "config" | "failed"][] = [
    [404, "gone"], [410, "gone"],
    [401, "config"], [403, "config"],
    [429, "retry"], [500, "retry"], [502, "retry"], [503, "retry"],
    [400, "failed"], [413, "failed"], [301, "failed"], [0, "failed"],
  ];
  for (const [status, kind] of kinds) {
    assert.deepEqual(
      classifyWebPushStatus(status),
      { ok: false, gone: kind === "gone", retry: kind === "retry", config: kind === "config", status },
      String(status),
    );
  }
});

test("a push service's reason is kept only when it's a short code", () => {
  assert.equal(webPushReason('{"reason":"BadJwtToken"}'), "BadJwtToken");
  assert.equal(webPushReason('{"code":410,"errno":106,"error":"Gone","message":"…"}'), "errno_106");
  assert.equal(webPushReason('{"reason":"see https://web.push.apple.com/abc"}'), null);
  assert.equal(webPushReason("push subscription has unsubscribed or expired."), null);
  assert.equal(webPushReason("{not json"), null);
  assert.equal(webPushReason(undefined), null);
});

test("TTL, urgency and topic are made safe before a push service sees them", () => {
  assert.equal(normalizeTtl(86400), 86400);
  assert.equal(normalizeTtl(0), 1);
  assert.equal(normalizeTtl(-5), 1);
  assert.equal(normalizeTtl(59.9), 59);
  assert.equal(normalizeTtl(Number.POSITIVE_INFINITY), 3600);
  assert.equal(normalizeTtl(Number.NaN), 3600);
  assert.equal(normalizeTtl(MAX_TTL_SEC + 1), MAX_TTL_SEC);

  for (const u of ["very-low", "low", "normal", "high"] as const) assert.equal(normalizeUrgency(u), u);
  for (const u of ["HIGH", "urgent", "", undefined, 3]) assert.equal(normalizeUrgency(u), "normal");

  assert.equal(isValidTopic("dm-0123456789abcdef_ABCDEF-xyz01"), true);
  assert.equal(isValidTopic("a".repeat(32)), true);
  assert.equal(isValidTopic("a".repeat(33)), false);
  assert.equal(isValidTopic("dm:abc"), false);
  assert.equal(isValidTopic("abc="), false);
  assert.equal(isValidTopic(""), false);
  assert.equal(isValidTopic(undefined), false);
});
