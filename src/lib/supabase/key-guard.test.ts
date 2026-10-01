/**
 * Tests for `key-guard.ts`: which Supabase key may ship to browsers.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/supabase/key-guard.test.ts
 *
 * The file has no imports, so it loads through a dynamic import of its ".ts"
 * path; the specifier goes through a variable because tsc refuses a literal
 * ".ts" specifier (the chat/flag.test.ts pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./key-guard.ts";
const { classifySupabaseKey, pickPublicSupabaseKey } = (await import(
  specifier
)) as typeof import("./key-guard");

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
/** A structurally real Supabase JWT with the given role (fake signature). */
function jwt(role: string): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ iss: "supabase", ref: "abcdefghijklmnopqrst", role, iat: 1, exp: 2 })}.fakesignature`;
}

const ANON = jwt("anon");
const SERVICE = jwt("service_role");
const PUBLISHABLE = "sb_publishable_TESTONLYabc123";
const SECRET = "sb_secret_TESTONLYabc123";

test("classify: each shape", () => {
  assert.equal(classifySupabaseKey(ANON), "anon");
  assert.equal(classifySupabaseKey(SERVICE), "secret");
  assert.equal(classifySupabaseKey(PUBLISHABLE), "publishable");
  assert.equal(classifySupabaseKey(SECRET), "secret");
  assert.equal(classifySupabaseKey(`  ${SERVICE}\n`), "secret", "trims");
});

test("classify: junk is unknown, never a throw", () => {
  for (const v of [undefined, null, "", "   ", "not-a-key", "a.b.c", "a.%%%.c", `${b64url({})}.${b64url({})}.x`, "sb_other_xyz"]) {
    assert.equal(classifySupabaseKey(v as string | null | undefined), "unknown", String(v));
  }
});

test("classify: a JWT with another role is unknown, not anon", () => {
  assert.equal(classifySupabaseKey(jwt("authenticated")), "unknown");
  assert.equal(classifySupabaseKey(jwt("supabase_admin")), "unknown");
});

test("pick: prefers the publishable variable, then the anon one", () => {
  const both = pickPublicSupabaseKey({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  });
  assert.equal(both.key, PUBLISHABLE);
  assert.equal(both.source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  assert.equal(both.ignoredSecretInAnonSlot, false);
  const onlyAnon = pickPublicSupabaseKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON });
  assert.equal(onlyAnon.key, ANON);
  assert.equal(onlyAnon.source, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
});

test("pick: THE S71 CASE — a service_role key in the anon slot is never chosen", () => {
  const r = pickPublicSupabaseKey({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
  });
  assert.equal(r.key, PUBLISHABLE);
  assert.equal(r.ignoredSecretInAnonSlot, true);
  assert.notEqual(r.key, SERVICE);
});

test("pick: a secret key in EITHER slot is never chosen", () => {
  const r = pickPublicSupabaseKey({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  });
  assert.equal(r.key, ANON);
});

test("pick: only a secret key set → the build refuses (throws), naming neither key", () => {
  for (const env of [
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET },
  ]) {
    assert.throws(
      () => pickPublicSupabaseKey(env),
      (e: Error) => /Refusing to build/.test(e.message) && !e.message.includes(SERVICE) && !e.message.includes(SECRET),
    );
  }
});

test("pick: nothing set → null, no throw (a bare CI build keeps working)", () => {
  assert.deepEqual(pickPublicSupabaseKey({}), { key: null, source: null, ignoredSecretInAnonSlot: false });
  assert.deepEqual(
    pickPublicSupabaseKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "  ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }),
    { key: null, source: null, ignoredSecretInAnonSlot: false },
  );
});

test("pick: an unrecognised key is used (we cannot prove it is a secret) and is trimmed", () => {
  const r = pickPublicSupabaseKey({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "  some-self-hosted-key  " });
  assert.equal(r.key, "some-self-hosted-key");
});
