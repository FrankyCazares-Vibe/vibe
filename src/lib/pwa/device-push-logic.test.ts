/**
 * Tests for `device-push-logic.ts`: the resync table that keeps "notifications
 * on this device" honest across sign-outs, shared phones and server hiccups
 * (handoffs/wave-plan-pwa/plan.md §8 W5/W6; critic-w3.md item 1, which asks
 * for every row, and items 2, 9 and 10).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/pwa/device-push-logic.test.ts
 *
 * The subject loads through a variable specifier: a literal ".ts" import
 * breaks `tsc` (TS5097), and the module has no value imports, so no resolve
 * hook is needed.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

const specifier = "./device-push-logic.ts";
const logic = (await import(specifier)) as typeof import("./device-push-logic");
const {
  addressHash,
  backoffActive,
  base64UrlToBytes,
  evictAddresses,
  failureStartsBackoff,
  keysMatch,
  parseDeviceRecord,
  parseServerAnswer,
  pushPlatformFor,
  readFinal,
  readGate,
  resyncAction,
  resyncNeedsServer,
  turnOnRefusal,
  RECENT_POST_MS,
  REFRESH_MS,
  SYNC_BACKOFF_MS,
} = logic;

type Input = import("./device-push-logic").ResyncInput;
type Server = import("./device-push-logic").ServerOk;

const NOW = 1_790_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const ADDR = "https://fcm.googleapis.com/fcm/send/abc";
const NEW_ADDR = "https://fcm.googleapis.com/fcm/send/xyz";
const HASH = "0123456789abcdef";
const OTHER_HASH = "fedcba9876543210";

const record = (over: Partial<NonNullable<Input["record"]>> = {}) => ({
  v: 1 as const,
  user: ME,
  transport: "webpush" as const,
  address: ADDR,
  at: NOW - DAY * 2,
  ...over,
});
const some = (address = ADDR, hash = HASH) => ({ k: "some" as const, address, hash });
const server = (over: Partial<Server> = {}): Server => ({
  k: "ok",
  user: ME,
  available: true,
  webpushKey: "BKey",
  fcm: true,
  devices: [HASH],
  ...over,
});
const run = (over: Partial<Input>) =>
  resyncAction({ record: null, current: { k: "none" }, server: server(), now: NOW, native: false, ...over });

test("row 1: no record and no subscription → none, and no GET", () => {
  const input = { record: null, current: { k: "none" as const }, native: false };
  assert.equal(resyncNeedsServer(input), false);
  assert.equal(run({ ...input, server: null }), "none");
});

test("row 1: the app with no record → none, no getToken and no GET", () => {
  assert.equal(resyncNeedsServer({ record: null, current: { k: "unknown" }, native: true }), false);
  assert.equal(resyncNeedsServer({ record: null, current: some(), native: true }), false);
  assert.equal(run({ record: null, current: some(), native: true }), "none");
});

test("row 2a: no record and a device that couldn't be read → none, and no GET", () => {
  assert.equal(resyncNeedsServer({ record: null, current: { k: "unknown" }, native: false }), false);
  assert.equal(run({ record: null, current: { k: "unknown" }, server: null }), "none");
});

test("row 2: my record and a device that couldn't be read → none (after the GET)", () => {
  assert.equal(resyncNeedsServer({ record: record(), current: { k: "unknown" }, native: false }), true);
  assert.equal(resyncNeedsServer({ record: record({ transport: "fcm" }), current: { k: "unknown" }, native: true }), true);
  assert.equal(run({ record: record(), current: { k: "unknown" } }), "none");
  assert.equal(run({ record: record(), current: { k: "unknown" }, server: server({ devices: [] }) }), "none");
  assert.equal(run({ record: record({ transport: "fcm" }), current: { k: "unknown" }, native: true }), "none");
  assert.equal(run({ record: record({ user: THEM }), current: { k: "unknown" }, server: { k: "signed-out" } }), "none");
  assert.equal(run({ record: record({ user: THEM }), current: { k: "unknown" }, server: { k: "error", status: 500 } }), "none");
});

test("row 5 before row 2: another account's record with an unreadable device → evict", () => {
  // The app whose getToken fails on every launch: B signed in, A's row must go.
  const theirs = record({ user: THEM, transport: "fcm" });
  assert.equal(run({ record: theirs, current: { k: "unknown" }, native: true }), "evict");
  assert.equal(run({ record: record({ user: THEM }), current: { k: "unknown" } }), "evict");
  assert.deepEqual(evictAddresses(theirs, { k: "unknown" }), [ADDR]);
});

test("row 3: signed out (401) with a record → none, never evict or forget", () => {
  assert.equal(resyncNeedsServer({ record: record(), current: some(), native: false }), true);
  assert.equal(run({ record: record(), current: some(), server: { k: "signed-out" } }), "none");
  assert.equal(run({ record: record(), current: { k: "none" }, server: { k: "signed-out" } }), "none");
  assert.equal(run({ record: null, current: some(), server: { k: "signed-out" } }), "none");
  assert.equal(run({ record: record(), current: some(), server: null }), "none");
});

test("row 4: the GET failed → none (a 429, a 500 or an offline blip alike)", () => {
  for (const status of [429, 500, 503, 0]) {
    assert.equal(run({ record: record(), current: some(), server: { k: "error", status } }), "none");
    assert.equal(run({ record: null, current: some(), server: { k: "error", status } }), "none");
  }
});

test("row 5: a record naming another account → evict, whatever else holds", () => {
  const theirs = record({ user: THEM });
  assert.equal(run({ record: theirs, current: some() }), "evict");
  assert.equal(run({ record: theirs, current: { k: "none" } }), "evict");
  assert.equal(run({ record: theirs, current: some(NEW_ADDR, OTHER_HASH) }), "evict");
  assert.equal(run({ record: theirs, current: some(), server: server({ available: false }) }), "evict");
  const app = record({ user: THEM, transport: "fcm" });
  assert.equal(run({ record: app, current: some(), native: true }), "evict");
});

test("row 6: no record but the server lists this device → rebuild (Safari's storage wipe)", () => {
  assert.equal(run({ record: null, current: some() }), "rebuild");
  assert.equal(run({ record: null, current: some(), server: server({ available: false }) }), "rebuild");
});

test("row 7: no record and not this account's device → evict", () => {
  assert.equal(run({ record: null, current: some(), server: server({ devices: [] }) }), "evict");
  assert.equal(
    run({ record: null, current: some(), server: server({ devices: [OTHER_HASH], available: false }) }),
    "evict",
  );
});

test("row 8: my record but the subscription is gone → forget", () => {
  assert.equal(run({ record: record(), current: { k: "none" } }), "forget");
  assert.equal(run({ record: record(), current: { k: "none" }, server: server({ available: false }) }), "forget");
});

test("row 9: push not available (kill switch, allowlist) with a record → none, never POST", () => {
  const off = server({ available: false });
  assert.equal(run({ record: record(), current: some(), server: off }), "none");
  assert.equal(run({ record: record(), current: some(NEW_ADDR, OTHER_HASH), server: off }), "none");
  assert.equal(run({ record: record({ at: NOW - DAY * 30 }), current: some(), server: off }), "none");
  assert.equal(run({ record: record(), current: some(), server: server({ available: false, devices: [] }) }), "none");
});

test("row 10: the address rotated → post", () => {
  assert.equal(run({ record: record(), current: some(NEW_ADDR, HASH) }), "post");
  assert.equal(run({ record: record(), current: some(NEW_ADDR, OTHER_HASH) }), "post");
  const app = record({ transport: "fcm", at: NOW - 1000 });
  assert.equal(run({ record: app, current: some(NEW_ADDR, OTHER_HASH), native: true }), "post");
});

test("row 11: the server lost it: recent POST → web resubscribes, app waits; older → post", () => {
  const gone = server({ devices: [OTHER_HASH] });
  const recent = record({ at: NOW - RECENT_POST_MS + 1000 });
  assert.equal(run({ record: recent, current: some(), server: gone }), "resubscribe");
  assert.equal(
    run({ record: record({ ...recent, transport: "fcm" }), current: some(), server: gone, native: true }),
    "none",
  );
  const older = record({ at: NOW - RECENT_POST_MS - 1000 });
  assert.equal(run({ record: older, current: some(), server: gone }), "post");
  assert.equal(run({ record: record({ ...older, transport: "fcm" }), current: some(), server: gone, native: true }), "post");
  assert.equal(run({ record: record({ at: 0 }), current: some(), server: gone }), "post");
});

test("row 12: last POST over 7 days ago, or in the future → post", () => {
  assert.equal(run({ record: record({ at: NOW - REFRESH_MS - 1 }), current: some() }), "post");
  assert.equal(run({ record: record({ at: 0 }), current: some() }), "post");
  assert.equal(run({ record: record({ at: NOW + DAY }), current: some() }), "post");
});

test("row 13: all in order → none", () => {
  assert.equal(run({ record: record(), current: some() }), "none");
  assert.equal(run({ record: record({ at: NOW - REFRESH_MS + 1000 }), current: some() }), "none");
  const app = record({ transport: "fcm" });
  assert.equal(run({ record: app, current: some(), native: true }), "none");
});

test("evict removes the remembered address and the live one, each once", () => {
  assert.deepEqual(evictAddresses(record(), some()), [ADDR]);
  assert.deepEqual(evictAddresses(record(), some(NEW_ADDR)), [ADDR, NEW_ADDR]);
  assert.deepEqual(evictAddresses(record(), { k: "none" }), [ADDR]);
  assert.deepEqual(evictAddresses(null, some(NEW_ADDR)), [NEW_ADDR]);
  assert.deepEqual(evictAddresses(null, { k: "unknown" }), []);
});

test("backoff: a 429 or 5xx starts it, an offline blip (status 0) doesn't", () => {
  assert.equal(failureStartsBackoff(429), true);
  assert.equal(failureStartsBackoff(500), true);
  assert.equal(failureStartsBackoff(503), true);
  assert.equal(failureStartsBackoff(0), false);
  assert.equal(failureStartsBackoff(401), false);
  assert.equal(failureStartsBackoff(403), false);
  assert.equal(failureStartsBackoff(400), false);
});

test("backoff lasts 10 minutes and ignores a failure stamped in the future", () => {
  assert.equal(backoffActive(null, NOW), false);
  assert.equal(backoffActive(NOW - 1000, NOW), true);
  assert.equal(backoffActive(NOW - SYNC_BACKOFF_MS + 1, NOW), true);
  assert.equal(backoffActive(NOW - SYNC_BACKOFF_MS, NOW), false);
  assert.equal(backoffActive(NOW + 60_000, NOW), false);
  assert.equal(backoffActive(Number.NaN, NOW), false);
});

test("addressHash: lowercase hex of sha256 over UTF-8, first 16, same as the server's", async () => {
  for (const address of [ADDR, "tok:ÄÖ-é_ü", "a".repeat(2048)]) {
    const expected = createHash("sha256").update(address, "utf8").digest("hex").slice(0, 16);
    assert.equal(await addressHash(address), expected);
  }
  assert.match((await addressHash(ADDR)) ?? "", /^[0-9a-f]{16}$/);
});

test("addressHash is null where WebCrypto is missing (an insecure dev origin)", async () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    assert.equal(await addressHash(ADDR), null);
  } finally {
    if (real) Object.defineProperty(globalThis, "crypto", real);
  }
});

test("parseDeviceRecord takes the stored JSON or the value, and refuses anything else", () => {
  const good = record();
  assert.deepEqual(parseDeviceRecord(JSON.stringify(good)), good);
  assert.deepEqual(parseDeviceRecord({ ...good, extra: 1 }), good);
  assert.deepEqual(parseDeviceRecord({ ...good, at: 0 }), { ...good, at: 0 });
  for (const bad of [
    null,
    "",
    "{",
    "[]",
    { ...good, v: 2 },
    { ...good, user: "" },
    { ...good, transport: "apns" },
    { ...good, address: "" },
    { ...good, address: "x".repeat(2049) },
    { ...good, at: -1 },
    { ...good, at: "1" },
    { ...good, at: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(parseDeviceRecord(bad), null, JSON.stringify(bad));
  }
});

test("parseServerAnswer reads the GET and keeps only well-formed hashes", () => {
  const body = { ok: true, available: true, webpush_key: "BKey", fcm: false, user: ME, devices: [HASH, "nope", 7, "ABCDEF0123456789"] };
  assert.deepEqual(parseServerAnswer(body), {
    k: "ok",
    user: ME,
    available: true,
    webpushKey: "BKey",
    fcm: false,
    devices: [HASH],
  });
  assert.equal(parseServerAnswer({ ...body, webpush_key: null })?.webpushKey, null);
  assert.equal(parseServerAnswer({ ...body, webpush_key: "" })?.webpushKey, null);
  assert.equal(parseServerAnswer({ ...body, ok: false }), null);
  assert.equal(parseServerAnswer({ ...body, user: "" }), null);
  assert.equal(parseServerAnswer({ ...body, available: "yes" }), null);
  assert.equal(parseServerAnswer({ ...body, devices: null }), null);
  assert.equal(parseServerAnswer(null), null);
});

test("pushPlatformFor maps every browser and both apps onto the server's platforms", () => {
  assert.equal(pushPlatformFor("ios-app"), "ios-app");
  assert.equal(pushPlatformFor("android-app"), "android-app");
  for (const p of ["ios-safari", "ios-other-browser", "ios-in-app"] as const) assert.equal(pushPlatformFor(p), "ios-web");
  for (const p of ["android-chrome", "android-samsung", "android-other"] as const) {
    assert.equal(pushPlatformFor(p), "android-web");
  }
  for (const p of ["desktop-chromium", "desktop-safari", "firefox"] as const) assert.equal(pushPlatformFor(p), "desktop-web");
  assert.equal(pushPlatformFor("other"), "other");
});

test("base64UrlToBytes decodes a VAPID-shaped key and refuses what isn't base64url", () => {
  const raw = new Uint8Array(65).map((_, i) => (i === 0 ? 4 : (i * 37) % 256));
  const key = Buffer.from(raw).toString("base64url");
  assert.equal(key.length, 87);
  assert.deepEqual(base64UrlToBytes(key), raw);
  assert.deepEqual(base64UrlToBytes(key + "="), raw);
  assert.deepEqual(base64UrlToBytes("AQID"), new Uint8Array([1, 2, 3]));
  for (const bad of ["", "===", "ab+c", "ab/c", "a b", "A"]) assert.equal(base64UrlToBytes(bad), null, bad);
});

test("keysMatch: a visible different key is the only mismatch", () => {
  const wanted = new Uint8Array([4, 1, 2]);
  assert.equal(keysMatch(new Uint8Array([4, 1, 2]).buffer, wanted), true);
  assert.equal(keysMatch(new Uint8Array([4, 1, 3]).buffer, wanted), false);
  assert.equal(keysMatch(new Uint8Array([4, 1]).buffer, wanted), false);
  assert.equal(keysMatch(null, wanted), true);
  assert.equal(keysMatch(undefined, wanted), true);
});

const gate = (over: Partial<import("./device-push-logic").ReadGateInput> = {}) =>
  readGate({
    server: server(),
    app: false,
    pluginPresent: false,
    iosBrowserTab: false,
    webPushSupported: true,
    ...over,
  });

test("readGate: hidden until the server says this account may have push", () => {
  assert.deepEqual(gate({ server: { k: "signed-out" } }), { kind: "hidden" });
  assert.deepEqual(gate({ server: { k: "error", status: 500 } }), { kind: "hidden" });
  assert.deepEqual(gate({ server: server({ available: false }) }), { kind: "hidden" });
  assert.deepEqual(gate({ server: server({ webpushKey: null }) }), { kind: "hidden" });
  assert.deepEqual(gate({ app: true, pluginPresent: true, server: server({ fcm: false }) }), { kind: "hidden" });
  // Hidden beats needs-install and unsupported: no card at all for the rest.
  assert.deepEqual(gate({ server: server({ available: false }), iosBrowserTab: true }), { kind: "hidden" });
  assert.deepEqual(gate({ server: server({ available: false }), webPushSupported: false }), { kind: "hidden" });
});

test("readGate: the app needs the plugin; an iPhone tab needs the install; else the Push API", () => {
  assert.equal(gate({ app: true, pluginPresent: true, webPushSupported: false }), null);
  assert.deepEqual(gate({ app: true, pluginPresent: false }), { kind: "unsupported", why: "app-update" });
  // The app doesn't need a VAPID key.
  assert.equal(gate({ app: true, pluginPresent: true, server: server({ webpushKey: null }) }), null);
  assert.deepEqual(gate({ iosBrowserTab: true, webPushSupported: false }), { kind: "needs-install" });
  assert.deepEqual(gate({ webPushSupported: false }), { kind: "unsupported", why: "browser" });
  assert.equal(gate(), null);
});

test("readFinal: on only with permission, a live device and a record naming this account", () => {
  const read = (over: Partial<Parameters<typeof readFinal>[0]>) =>
    readFinal({ permission: "granted", current: some(), record: record(), user: ME, ...over });
  assert.deepEqual(read({}), { kind: "on" });
  assert.deepEqual(read({ permission: "denied" }), { kind: "denied" });
  assert.deepEqual(read({ permission: "denied", record: null, current: { k: "none" } }), { kind: "denied" });
  assert.deepEqual(read({ permission: "default" }), { kind: "off" });
  assert.deepEqual(read({ permission: "prompt" }), { kind: "off" });
  assert.deepEqual(read({ permission: null }), { kind: "off" });
  assert.deepEqual(read({ record: null }), { kind: "off" });
  assert.deepEqual(read({ record: record({ user: THEM }) }), { kind: "off" });
  assert.deepEqual(read({ current: { k: "none" } }), { kind: "off" });
  assert.deepEqual(read({ current: { k: "unknown" } }), { kind: "off" });
});

test("turnOnRefusal: push_unavailable (403) and a missing table (503) hide the card", () => {
  assert.equal(turnOnRefusal(403, "push_unavailable"), "hidden");
  assert.equal(turnOnRefusal(503, "push_unavailable"), "hidden");
  assert.equal(turnOnRefusal(503, null), "hidden");
  assert.equal(turnOnRefusal(403, "terms_required"), "off");
  assert.equal(turnOnRefusal(403, "wrong_origin"), "off");
  assert.equal(turnOnRefusal(429, null), "off");
  assert.equal(turnOnRefusal(500, null), "off");
  assert.equal(turnOnRefusal(0, null), "off");
});
