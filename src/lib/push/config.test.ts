/**
 * Tests for `config.ts`: where push may run, who may get it, and the shapes
 * of the VAPID and FCM credentials (handoffs/wave-plan-pwa/plan.md §7 2C;
 * critic-push.md items 16, 21 and 25).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/config.test.ts
 *
 * config.ts has no imports, so it loads through a dynamic import of its
 * ".ts" path. The specifier goes through a variable because tsc refuses a
 * literal ".ts" specifier (the billing/config.test.ts pattern).
 *
 * THE REPO IS PUBLIC (critic-push.md item 16). Every key below is generated
 * when the test runs and never written anywhere: no PEM, no key string and no
 * service-account file is committed. The service-account JSON is assembled
 * in memory, and its key field's name is built at runtime too, so no file in
 * the repo looks like a Google credential to a secret scanner.
 */

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";

const specifier = "./config.ts";
const {
  PUSH_DEV_ORIGIN,
  PUSH_SITE_ORIGIN,
  fcmConfig,
  isMissingPushSchema,
  isVapidSubject,
  pushAllowedFor,
  pushEnabled,
  pushSiteOrigin,
  vapidConfig,
  warnMissingPushSchemaOnce,
} = (await import(specifier)) as typeof import("./config");

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

const PROD = { VERCEL_ENV: "production", NODE_ENV: "production" };
const DEV = { NODE_ENV: "development" };
const PREVIEW = { VERCEL_ENV: "preview", NODE_ENV: "production" };

const ALICE = "df5ab44e-0000-4000-8000-000000000001";
const BOB = "0b0b0b0b-0000-4000-8000-000000000002";

// ---------------------------------------------------------------------------
// Where push may run
// ---------------------------------------------------------------------------

test("the push site is the live www origin", () => {
  assert.equal(PUSH_SITE_ORIGIN, "https://www.connectvibe.app");
  assert.equal(PUSH_DEV_ORIGIN, "http://localhost:3000");
});

test("production gets the live site, next dev gets localhost, everything else gets nothing", () => {
  assert.equal(pushSiteOrigin(env(PROD)), PUSH_SITE_ORIGIN);
  assert.equal(pushSiteOrigin(env(DEV)), PUSH_DEV_ORIGIN);
  assert.equal(pushSiteOrigin(env(PREVIEW)), null, "Preview shares the production database");
  assert.equal(pushSiteOrigin(env({ NODE_ENV: "production" })), null, "next start on a laptop");
  assert.equal(pushSiteOrigin(env({ NODE_ENV: "test" })), null);
  assert.equal(pushSiteOrigin(env({})), null);
});

test("push is on only for exactly \"true\", and only where push may run", () => {
  assert.equal(pushEnabled(env({ ...PROD, PUSH_ENABLED: "true" })), true);
  assert.equal(pushEnabled(env({ ...DEV, PUSH_ENABLED: "true" })), true);
  for (const value of ["TRUE", "True", "1", "yes", " true", "true ", "", undefined]) {
    assert.equal(pushEnabled(env({ ...PROD, PUSH_ENABLED: value })), false, `PUSH_ENABLED=${value}`);
  }
  assert.equal(pushEnabled(env({ ...PREVIEW, PUSH_ENABLED: "true" })), false, "copied onto Preview");
  assert.equal(pushEnabled(env({ PUSH_ENABLED: "true" })), false);
});

// ---------------------------------------------------------------------------
// Who may get it
// ---------------------------------------------------------------------------

test("an unset or blank allow-list is nobody, even with push on", () => {
  assert.equal(pushAllowedFor(ALICE, env({ ...PROD, PUSH_ENABLED: "true" })), false);
  assert.equal(pushAllowedFor(ALICE, env({ ...PROD, PUSH_ENABLED: "true", PUSH_ALLOWLIST: "  " })), false);
  assert.equal(pushAllowedFor(ALICE, env({ ...PROD, PUSH_ENABLED: "true", PUSH_ALLOWLIST: ",," })), false);
});

test("\"*\" is everyone, but never while push is off", () => {
  assert.equal(pushAllowedFor(ALICE, env({ ...PROD, PUSH_ENABLED: "true", PUSH_ALLOWLIST: "*" })), true);
  assert.equal(pushAllowedFor(BOB, env({ ...PROD, PUSH_ENABLED: "true", PUSH_ALLOWLIST: " * " })), true);
  assert.equal(pushAllowedFor(ALICE, env({ ...PROD, PUSH_ALLOWLIST: "*" })), false);
  assert.equal(pushAllowedFor(ALICE, env({ ...PREVIEW, PUSH_ENABLED: "true", PUSH_ALLOWLIST: "*" })), false);
});

test("a comma list names exactly its ids, ignoring spaces and case", () => {
  const list = env({ ...PROD, PUSH_ENABLED: "true", PUSH_ALLOWLIST: ` ${ALICE.toUpperCase()} , other-id ` });
  assert.equal(pushAllowedFor(ALICE, list), true);
  assert.equal(pushAllowedFor(BOB, list), false);
  assert.equal(pushAllowedFor(ALICE.slice(0, 8), list), false, "a prefix is not a match");
  assert.equal(pushAllowedFor("", list), false);
  assert.equal(pushAllowedFor("   ", list), false);
});

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

/** A fresh P-256 pair in web-push's format: base64url, no padding. */
function vapidPair(): { publicKey: string; privateKey: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(String(jwk.x), "base64url"),
    Buffer.from(String(jwk.y), "base64url"),
  ]);
  return { publicKey: point.toString("base64url"), privateKey: String(jwk.d) };
}

function vapidEnv(overrides: Record<string, string | undefined> = {}) {
  const pair = vapidPair();
  return env({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: pair.publicKey,
    VAPID_PRIVATE_KEY: pair.privateKey,
    VAPID_SUBJECT: "mailto:help@connectvibe.app",
    ...overrides,
  });
}

test("a generated VAPID pair and a real subject make a config", () => {
  const values = vapidEnv();
  const config = vapidConfig(values);
  assert.deepEqual(config, {
    publicKey: values.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: values.VAPID_PRIVATE_KEY,
    subject: "mailto:help@connectvibe.app",
  });
  assert.equal(vapidConfig(vapidEnv({ VAPID_SUBJECT: "https://www.connectvibe.app" }))?.subject, "https://www.connectvibe.app");
});

test("any missing or malformed VAPID piece is no config at all", () => {
  const good = vapidEnv();
  const pub = String(good.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const priv = String(good.VAPID_PRIVATE_KEY);
  const cases: Record<string, Record<string, string | undefined>> = {
    "no public key": { NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined },
    "no private key": { VAPID_PRIVATE_KEY: undefined },
    "no subject": { VAPID_SUBJECT: undefined },
    "a padded public key": { NEXT_PUBLIC_VAPID_PUBLIC_KEY: `${pub}=` },
    "a short public key": { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub.slice(0, 86) },
    "a compressed-looking public key": { NEXT_PUBLIC_VAPID_PUBLIC_KEY: `A${pub.slice(1)}` },
    "a standard-base64 private key": { VAPID_PRIVATE_KEY: `${priv.slice(0, 42)}+` },
    "a private key one character short": { VAPID_PRIVATE_KEY: priv.slice(0, 42) },
  };
  for (const [label, overrides] of Object.entries(cases)) {
    assert.equal(vapidConfig(env({ ...good, ...overrides })), null, label);
  }
});

test("surrounding whitespace in the env is trimmed", () => {
  const good = vapidEnv();
  const padded = env({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: ` ${good.NEXT_PUBLIC_VAPID_PUBLIC_KEY}\n`,
    VAPID_PRIVATE_KEY: `${good.VAPID_PRIVATE_KEY} `,
    VAPID_SUBJECT: " mailto:help@connectvibe.app ",
  });
  assert.equal(vapidConfig(padded)?.privateKey, good.VAPID_PRIVATE_KEY);
});

test("the VAPID subject is mailto: or https: on a real domain, never localhost (Apple refuses it)", () => {
  for (const ok of ["mailto:help@connectvibe.app", "https://www.connectvibe.app", "https://connectvibe.app/contact"]) {
    assert.equal(isVapidSubject(ok), true, ok);
  }
  for (const bad of [
    "mailto:dev@localhost",
    "mailto:dev@app.localhost",
    "mailto:dev@127.0.0.1",
    "mailto:help",
    "mailto:@connectvibe.app",
    "https://localhost",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://[::1]",
    "http://www.connectvibe.app",
    "help@connectvibe.app",
    "",
  ]) {
    assert.equal(isVapidSubject(bad), false, bad);
  }
});

// ---------------------------------------------------------------------------
// FCM service account
// ---------------------------------------------------------------------------

/** The key field's name, built at runtime (see the file header). */
const KEY_FIELD = ["private", "key"].join("_");
const TEST_PROJECT = "vibe-test-project";
const TEST_EMAIL = "push-sender@vibe-test-project.iam.gserviceaccount.com";

function rsaPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function accountB64(fields: Record<string, unknown>, encoding: "base64" | "base64url" = "base64"): string {
  return Buffer.from(JSON.stringify(fields), "utf8").toString(encoding);
}

function accountFields(pem: string): Record<string, unknown> {
  return { project_id: TEST_PROJECT, client_email: TEST_EMAIL, [KEY_FIELD]: pem, token_uri: "https://example.invalid/token" };
}

test("a service account decodes to its project, email and key", () => {
  const pem = rsaPem();
  const config = fcmConfig(env({ FCM_SERVICE_ACCOUNT_B64: accountB64(accountFields(pem)) }));
  assert.deepEqual(config, { projectId: TEST_PROJECT, clientEmail: TEST_EMAIL, privateKey: pem.trim() });
  assert.equal(Object.keys(config ?? {}).includes("tokenUri"), false, "the JSON's token URL is never used");
});

test("line-wrapped base64, base64url and a key with escaped newlines all decode", () => {
  const pem = rsaPem();
  const wrapped = accountB64(accountFields(pem)).replace(/(.{76})/g, "$1\n");
  assert.equal(fcmConfig(env({ FCM_SERVICE_ACCOUNT_B64: wrapped }))?.projectId, TEST_PROJECT);
  const url = accountB64(accountFields(pem), "base64url");
  assert.equal(fcmConfig(env({ FCM_SERVICE_ACCOUNT_B64: url }))?.clientEmail, TEST_EMAIL);
  const escaped = accountB64(accountFields(pem.replace(/\n/g, "\\n")));
  assert.equal(fcmConfig(env({ FCM_SERVICE_ACCOUNT_B64: escaped }))?.privateKey, pem.trim());
});

test("anything that isn't a whole service account is no config", () => {
  const pem = rsaPem();
  const good = accountFields(pem);
  const cases: Record<string, string | undefined> = {
    unset: undefined,
    blank: "   ",
    "not base64 JSON": "not-json-at-all",
    "a JSON array": accountB64([good] as unknown as Record<string, unknown>),
    "no project": accountB64({ ...good, project_id: undefined }),
    "an uppercase project": accountB64({ ...good, project_id: "Vibe-Test" }),
    "a project with a slash": accountB64({ ...good, project_id: "vibe/../other" }),
    "no email": accountB64({ ...good, client_email: undefined }),
    "a personal email": accountB64({ ...good, client_email: "franky@gmail.com" }),
    "no key": accountB64({ ...good, [KEY_FIELD]: undefined }),
    "a key that isn't PEM": accountB64({ ...good, [KEY_FIELD]: "abc" }),
  };
  for (const [label, value] of Object.entries(cases)) {
    assert.equal(fcmConfig(env({ FCM_SERVICE_ACCOUNT_B64: value })), null, label);
  }
});

// ---------------------------------------------------------------------------
// Missing schema (code ships before the migration)
// ---------------------------------------------------------------------------

test("a missing table or claim function reads as missing schema", () => {
  for (const code of ["42P01", "PGRST205", "PGRST202", "42883"]) {
    assert.equal(isMissingPushSchema({ code, message: "" }), true, code);
  }
  assert.equal(isMissingPushSchema({ message: "Could not find the table 'public.push_devices' in the schema cache" }), true);
  assert.equal(isMissingPushSchema({ message: "Could not find the function public.claim_push_outbox(p_limit) in the schema cache" }), true);
  assert.equal(isMissingPushSchema({ message: 'relation "public.push_outbox" does not exist' }), true);
  assert.equal(isMissingPushSchema({ message: "function public.claim_push_outbox(integer) does not exist" }), true);
});

test("a missing column, another error, or no error is not missing schema", () => {
  assert.equal(isMissingPushSchema({ code: "42703", message: 'column "last_ok_at" does not exist' }), false);
  assert.equal(isMissingPushSchema({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(isMissingPushSchema({ code: "42501", message: "not allowed" }), false);
  for (const nothing of [null, undefined, "42P01", 42, {}]) {
    assert.equal(isMissingPushSchema(nothing), false, JSON.stringify(nothing));
  }
});

test("the missing-schema warning is said once per caller", () => {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    warnMissingPushSchemaOnce("push.test-a");
    warnMissingPushSchemaOnce("push.test-a");
    warnMissingPushSchemaOnce("push.test-b");
  } finally {
    console.warn = original;
  }
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[push\.test-a\] /);
  assert.match(lines[1], /^\[push\.test-b\] /);
});
