/**
 * Tests for the restriction identity helpers (`identity.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/moderation/identity.test.ts
 *
 * WHY THE RESOLVE HOOK: identity.ts imports "../auth/school-email-domains",
 * which imports "../iu/campuses", both extensionless as Next and tsc expect.
 * Node's type stripping adds no extensions, so an in-thread resolve hook
 * retries a failed relative specifier with ".ts" and the module under test
 * loads through a dynamic import after the hook is registered (the same
 * pattern as school-email-domains.test.ts and send-log-core.test.ts).
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("identity.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  IDENTITY_KEY_LABEL,
  MIN_RESTRICTION_PEPPER_LENGTH,
  RestrictionPepperError,
  canonicalIdentity,
  canonicalSchoolIdentity,
  isUsablePepper,
  restrictionIdentityKeyWith,
} = await import("./identity");

const PEPPER = "x".repeat(MIN_RESTRICTION_PEPPER_LENGTH);

test("a school address folds to one identity however it is typed", () => {
  const expected = "fracazar@iu.edu";
  for (const typed of [
    "fracazar@iu.edu",
    "FraCazar@IU.EDU",
    "  fracazar@iu.edu  ",
    "fracazar+2@iu.edu",
    "fracazar+anything+else@iu.edu",
    "fracazar@mail.iu.edu",
    "FraCazar+2@Mail.IU.edu.",
  ]) {
    assert.equal(canonicalSchoolIdentity(typed), expected, typed);
  }
});

test("each school domain folds only into itself", () => {
  assert.equal(canonicalSchoolIdentity("a@purdue.edu"), "a@purdue.edu");
  assert.equal(canonicalSchoolIdentity("a@mail.purdue.edu"), "a@purdue.edu");
  // The Purdue flag must not reach the fold: a ban keyed today has to stay
  // keyed the same way if PURDUE_SIGNUPS_ENABLED is ever flipped back.
  assert.notEqual(canonicalSchoolIdentity("a@purdue.edu"), canonicalSchoolIdentity("a@iu.edu"));
});

test("a non-school address is not a school identity", () => {
  for (const address of [
    "fgcazares04@gmail.com",
    "someone@example.com",
    // Retired IU domains stopped delivering, so nothing can ever be verified
    // on one and nothing should be keyed on one.
    "fracazar@iupui.edu",
    "fracazar@mail.iupui.edu",
  ]) {
    assert.equal(canonicalSchoolIdentity(address), null, address);
  }
});

test("a plus-tag on a non-school address is left alone", () => {
  // Vibe does not know whether this provider delivers +tags to one inbox, and
  // guessing would merge two unrelated people under one ban.
  assert.equal(canonicalIdentity("Someone+news@Example.com"), "someone+news@example.com");
  assert.notEqual(
    canonicalIdentity("someone+news@example.com"),
    canonicalIdentity("someone@example.com"),
  );
  // A subdomain of a personal host is a different host, not a fold.
  assert.equal(canonicalIdentity("a@mail.example.com"), "a@mail.example.com");
});

test("a malformed address has no identity", () => {
  for (const bad of ["", "   ", "no-at-sign", "@iu.edu", "a@@iu.edu", "a@", "+tag@iu.edu"]) {
    assert.equal(canonicalIdentity(bad), null, JSON.stringify(bad));
    assert.equal(canonicalSchoolIdentity(bad), null, JSON.stringify(bad));
  }
});

test("the identity key is stable and reveals nothing", () => {
  const canonical = canonicalSchoolIdentity("FraCazar+2@mail.iu.edu");
  assert.equal(canonical, "fracazar@iu.edu");
  const key = restrictionIdentityKeyWith(PEPPER, canonical as string);

  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, restrictionIdentityKeyWith(PEPPER, canonical as string));
  assert.equal(
    key,
    createHmac("sha256", PEPPER).update(`${IDENTITY_KEY_LABEL}${canonical}`).digest("hex"),
  );
  assert.ok(!key.includes("fracazar"));

  // A different pepper or a different address is a different key.
  assert.notEqual(key, restrictionIdentityKeyWith("y".repeat(40), canonical as string));
  assert.notEqual(key, restrictionIdentityKeyWith(PEPPER, "someone.else@iu.edu"));
});

test("no pepper is a typed error, not a weak key", () => {
  const canonical = "fracazar@iu.edu";
  for (const pepper of [undefined, null, "", "   ", "short", "x".repeat(MIN_RESTRICTION_PEPPER_LENGTH - 1)]) {
    assert.equal(isUsablePepper(pepper), false, String(pepper));
    assert.throws(() => restrictionIdentityKeyWith(pepper, canonical), RestrictionPepperError);
  }
  assert.equal(isUsablePepper(PEPPER), true);
  // A blank canonical form is a caller bug, and a separate error: hashing it
  // would store a key nothing can reproduce.
  assert.throws(() => restrictionIdentityKeyWith(PEPPER, "  "), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.ok(!(err instanceof RestrictionPepperError));
    return true;
  });
});
