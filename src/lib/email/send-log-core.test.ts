/**
 * Tests for the email send log core (`send-log-core.ts`, E1a).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/email/send-log-core.test.ts
 *
 * WHY THE RESOLVE HOOK: the core imports "../auth/school-email-domains"
 * (ruling M15: the known school domains come from there), which imports
 * "../iu/campuses", both extensionless as Next and tsc expect. Node's type
 * stripping adds no extensions, so an in-thread resolve hook retries a failed
 * relative specifier with ".ts", and the module loads through a dynamic
 * import after the hook is registered (same as school-email-domains.test.ts).
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
  throw new Error("send-log-core.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  EMAIL_SEND_KINDS,
  HASH_LABEL,
  KNOWN_SCHOOL_EMAIL_DOMAINS,
  PUBLIC_EMAIL_PROVIDER_DOMAINS,
  buildEmailSendRow,
  canonicalRecipient,
  outcomeFromException,
  outcomeFromProvider,
  recipientDomain,
  recipientHash,
  recipientRateKey,
  redactAddresses,
  sendWithLog,
} = await import("./send-log-core");
const { RETIRED_IU_DOMAINS, SYSTEM_DOMAINS } = await import(
  "../auth/school-email-domains"
);

type Row = import("./send-log-core").EmailSendRow;

const S = "local-e1-secret-0123456789";
const HEX64 = /^[0-9a-f]{64}$/;
const RESEND_422 =
  "Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.";

test("the kinds match the DB CHECK and the label is fixed", () => {
  assert.deepEqual([...EMAIL_SEND_KINDS], ["school_verification", "password_reset"]);
  assert.equal(HASH_LABEL, "email-send-v1|");
});

test("canonicalRecipient trims, lowercases and drops trailing host dots", () => {
  assert.equal(canonicalRecipient(" Foo@IU.EDU. "), "foo@iu.edu");
  assert.equal(canonicalRecipient("a@b@IU.edu.."), "a@b@iu.edu");
  assert.equal(canonicalRecipient("  NoAt. "), "noat.");
  assert.equal(canonicalRecipient(""), "");
});

test("recipientDomain keeps school and big-provider domains only (M15)", () => {
  assert.equal(recipientDomain("a@IU.edu"), "iu.edu");
  assert.equal(recipientDomain("a@purdue.edu"), "purdue.edu");
  assert.equal(recipientDomain("a@mail.iu.edu"), "iu.edu");
  assert.equal(recipientDomain("a@iupui.edu"), "iupui.edu");
  assert.equal(recipientDomain(" X@GMAIL.COM. "), "gmail.com");
  for (const d of ["outlook.com", "hotmail.com", "icloud.com", "yahoo.com"]) {
    assert.equal(recipientDomain(`someone@${d}`), d);
  }
  // A personal domain names the student: never stored.
  assert.equal(recipientDomain("me@lastname.dev"), "other");
  assert.equal(recipientDomain("e1-student-a@example.test"), "other");
  // Suffixes match on a label boundary only, and providers match exactly.
  assert.equal(recipientDomain("a@notiu.edu"), "other");
  assert.equal(recipientDomain("a@iu.edu.evil.com"), "other");
  assert.equal(recipientDomain("a@mail.gmail.com"), "other");
  assert.equal(recipientDomain("nope"), "unknown");
  assert.equal(recipientDomain("a@"), "unknown");
  assert.equal(recipientDomain("a@..."), "unknown");
  assert.equal(recipientDomain(""), "unknown");
  for (const a of ["a@IU.edu", "nope", "a@", "x@y@z.com", "me@lastname.dev"]) {
    assert.ok(!recipientDomain(a).includes("@"));
  }
});

test("the known school domains come from school-email-domains.ts", () => {
  const expected = [...Object.values(SYSTEM_DOMAINS).flat(), ...RETIRED_IU_DOMAINS];
  assert.deepEqual([...KNOWN_SCHOOL_EMAIL_DOMAINS], expected);
  assert.ok(KNOWN_SCHOOL_EMAIL_DOMAINS.includes("iu.edu"));
  assert.ok(KNOWN_SCHOOL_EMAIL_DOMAINS.includes("purdue.edu"));
  assert.deepEqual(
    [...PUBLIC_EMAIL_PROVIDER_DOMAINS],
    ["gmail.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com"],
  );
});

test("recipientHash is a keyed, canonical, 64-hex HMAC", () => {
  const vector = createHmac("sha256", S).update("email-send-v1|foo@iu.edu").digest("hex");
  const h = recipientHash("Foo@IU.edu", S);
  assert.equal(h, recipientHash("foo@iu.edu", S));
  assert.equal(h, vector);
  assert.match(h ?? "", HEX64);
  assert.notEqual(h, recipientHash("foo@iu.edu", `${S}-other`));
  assert.equal(recipientHash("foo@iu.edu", ` ${S} `), h);
  assert.equal(recipientHash("foo@iu.edu", undefined), null);
  assert.equal(recipientHash("foo@iu.edu", null), null);
  assert.equal(recipientHash("foo@iu.edu", ""), null);
  assert.equal(recipientHash("foo@iu.edu", "x".repeat(15)), null);
  assert.equal(recipientHash("foo@iu.edu", `  ${"x".repeat(15)}  `), null);
  assert.match(recipientHash("foo@iu.edu", "x".repeat(16)) ?? "", HEX64);
});

test("recipientRateKey never holds the address", () => {
  assert.equal(recipientRateKey("Foo@IU.edu", S), recipientHash("foo@iu.edu", S));
  const unkeyed = recipientRateKey("Foo@IU.edu", undefined);
  assert.match(unkeyed, /^u[0-9a-f]{64}$/);
  assert.equal(unkeyed, recipientRateKey("foo@iu.edu", ""));
  assert.ok(!unkeyed.includes("@"));
  assert.ok(!recipientRateKey("foo@iu.edu", S).includes("@"));
});

test("redactAddresses leaves no @", () => {
  const out = redactAddresses(RESEND_422);
  assert.ok(out.includes("[address]"));
  assert.ok(!out.includes("@"));
  assert.ok(!out.includes("example.com"));
  assert.ok(!redactAddresses("a @ b").includes("@"));
  assert.equal(redactAddresses("send to Foo@IU.edu failed"), "send to [address] failed");
  assert.equal(redactAddresses("no address here"), "no address here");
});

test("outcomeFromProvider reads Resend's shape and never throws", () => {
  assert.deepEqual(outcomeFromProvider({ data: { id: "abc" }, error: null }), {
    ok: true,
    providerMessageId: "abc",
  });
  assert.deepEqual(outcomeFromProvider({ data: null, error: null }), {
    ok: true,
    providerMessageId: null,
  });
  assert.deepEqual(
    outcomeFromProvider({
      error: { name: "daily_quota_exceeded", message: "m", statusCode: 429 },
    }),
    { ok: false, errorCode: "daily_quota_exceeded", errorMessage: "m", httpStatus: 429 },
  );
  const nullStatus = outcomeFromProvider({
    error: { name: "application_error", message: "net", statusCode: null },
  });
  assert.equal(nullStatus.ok, false);
  assert.equal(!nullStatus.ok && nullStatus.httpStatus, null);
  const odd = outcomeFromProvider({ error: { message: "m", statusCode: 42 } });
  assert.deepEqual(odd, { ok: false, errorCode: "unknown", errorMessage: "m", httpStatus: null });
  const nonInt = outcomeFromProvider({ error: { name: "x", statusCode: 429.5 } });
  assert.deepEqual(nonInt, { ok: false, errorCode: "x", errorMessage: "", httpStatus: null });
  assert.deepEqual(outcomeFromProvider(undefined), { ok: true, providerMessageId: null });
  assert.deepEqual(outcomeFromProvider(null), { ok: true, providerMessageId: null });
  assert.deepEqual(outcomeFromProvider({ data: { id: "" } }), {
    ok: true,
    providerMessageId: null,
  });
});

test("outcomeFromException covers errors and non-errors", () => {
  assert.deepEqual(outcomeFromException(new Error("boom")), {
    ok: false,
    errorCode: "exception",
    errorMessage: "boom",
    httpStatus: null,
  });
  const plain = outcomeFromException("nope");
  assert.equal(!plain.ok && plain.errorMessage, "nope");
  const weird = outcomeFromException(Object.create(null));
  assert.equal(weird.ok, false);
});

test("buildEmailSendRow redacts, caps and never throws", () => {
  const long = `Bounced for Foo@IU.edu: ${"x".repeat(2000)}`;
  const row = buildEmailSendRow({
    kind: "school_verification",
    userId: "00000000-0000-4000-8000-000000000001",
    to: "Foo@IU.edu",
    secret: S,
    outcome: { ok: false, errorCode: "c".repeat(300), errorMessage: long, httpStatus: 422 },
  });
  assert.ok((row.error_message ?? "").length <= 500);
  assert.ok(!(row.error_message ?? "").includes("@"));
  assert.ok((row.error_code ?? "").length <= 100);
  assert.equal(row.http_status, 422);
  assert.equal(row.ok, false);
  assert.equal(row.recipient_domain, "iu.edu");
  assert.equal(row.recipient_hash, recipientHash("foo@iu.edu", S));
  assert.equal(row.provider_message_id, null);

  const ok = buildEmailSendRow({
    kind: "password_reset",
    userId: null,
    to: "me@lastname.dev",
    secret: undefined,
    outcome: { ok: true, providerMessageId: "mock-1" },
  });
  assert.equal(ok.error_message, null);
  assert.equal(ok.error_code, null);
  assert.equal(ok.http_status, null);
  assert.equal(ok.provider_message_id, "mock-1");
  assert.equal(ok.recipient_hash, null);
  assert.equal(ok.recipient_domain, "other");

  const empty = buildEmailSendRow({
    kind: "password_reset",
    userId: null,
    to: "",
    secret: S,
    outcome: { ok: false, errorCode: "exception", errorMessage: "", httpStatus: null },
  });
  assert.equal(empty.recipient_domain, "unknown");
  assert.equal(empty.error_message, null);
  assert.equal(empty.error_code, "exception");

  // A cut never leaves half an emoji behind.
  const emoji = buildEmailSendRow({
    kind: "password_reset",
    userId: null,
    to: "a@iu.edu",
    secret: S,
    outcome: { ok: false, errorCode: "x", errorMessage: `${"y".repeat(499)}😀`, httpStatus: null },
  });
  assert.equal(emoji.error_message, "y".repeat(499));
});

function recorder() {
  const rows: Row[] = [];
  const errors: string[] = [];
  return { rows, errors, onLogError: (m: string) => void errors.push(m) };
}

test("sendWithLog: a success is logged once", async () => {
  const r = recorder();
  const out = await sendWithLog({
    kind: "school_verification",
    to: "e1-a@iu.edu",
    userId: "u1",
    secret: S,
    send: async () => ({ data: { id: "mock-1" }, error: null }),
    insert: async (row) => void r.rows.push(row),
    onLogError: r.onLogError,
  });
  assert.deepEqual(out, { ok: true, providerMessageId: "mock-1" });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].provider_message_id, "mock-1");
  assert.equal(r.rows[0].user_id, "u1");
  assert.equal(r.errors.length, 0);
});

test("sendWithLog: a failed insert keeps the outcome and names no address", async () => {
  const r = recorder();
  const out = await sendWithLog({
    kind: "school_verification",
    to: "e1-a@iu.edu",
    userId: null,
    secret: S,
    send: async () => ({ error: { name: "daily_quota_exceeded", message: "q", statusCode: 429 } }),
    insert: async () => {
      throw new Error("insert into email_sends for e1-a@iu.edu failed");
    },
    onLogError: r.onLogError,
  });
  assert.deepEqual(out, {
    ok: false,
    errorCode: "daily_quota_exceeded",
    errorMessage: "q",
    httpStatus: 429,
  });
  assert.equal(r.errors.length, 1);
  assert.ok(!r.errors[0].includes("e1-a"));
  assert.ok(!r.errors[0].includes("@"));
});

test("sendWithLog: a hung insert times out fast", async () => {
  const r = recorder();
  const started = Date.now();
  const out = await sendWithLog({
    kind: "password_reset",
    to: "e1-a@iu.edu",
    userId: null,
    secret: S,
    send: async () => ({ data: { id: "mock-2" }, error: null }),
    insert: () => new Promise(() => {}),
    onLogError: r.onLogError,
    logTimeoutMs: 50,
  });
  assert.ok(Date.now() - started < 500);
  assert.equal(out.ok, true);
  assert.deepEqual(r.errors, ["timed out"]);
});

test("sendWithLog: a thrown send is an exception outcome and still logged", async () => {
  const r = recorder();
  const out = await sendWithLog({
    kind: "password_reset",
    to: "e1-a@iu.edu",
    userId: null,
    secret: S,
    send: async () => {
      throw new Error("boom");
    },
    insert: async (row) => void r.rows.push(row),
    onLogError: r.onLogError,
  });
  assert.deepEqual(out, { ok: false, errorCode: "exception", errorMessage: "boom", httpStatus: null });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].error_code, "exception");
  assert.equal(r.rows[0].error_message, "boom");
});

test("sendWithLog never rejects, even when everything around it throws", async () => {
  const out = await sendWithLog({
    kind: "password_reset",
    to: "e1-a@iu.edu",
    userId: null,
    secret: S,
    send: () => {
      throw new Error("sync boom");
    },
    insert: () => {
      throw new Error("sync insert");
    },
    onLogError: () => {
      throw new Error("reporter");
    },
  });
  assert.equal(out.ok, false);
  const quiet = await sendWithLog({
    kind: "password_reset",
    to: "e1-a@iu.edu",
    userId: null,
    secret: S,
    send: async () => ({ data: { id: "m" }, error: null }),
    insert: async () => Promise.reject(new Error("no onLogError given")),
  });
  assert.equal(quiet.ok, true);
});
