/**
 * Tests for `choose-password-copy.ts`: what the "Choose your password"
 * screen says when saving the password fails (pre-registration fix, Oct 2026).
 *
 *  - offline, too long, weak (breached / characters / length / other), the
 *    three Secure-password-change codes, a session that is gone, 429, and
 *    anything unknown each get our own sentence;
 *  - the server's or the browser's own message never comes through;
 *  - the two copies that send the student to Forgot password end in the
 *    phrase the form turns into a link;
 *  - the session check before the save: the same account carries on, another
 *    tab's account says "something changed" (ending in the reload phrase), no
 *    session says signed out, and a failed refresh is read like a failed save.
 *
 * Run with:
 *   node --test src/lib/auth/choose-password-copy.test.ts
 *
 * The errors are the real auth-js classes, so the `isAuth...Error` checks
 * see what `updateUser` hands back in the browser.
 *
 * WHY THE RESOLVE HOOK: the module imports password-rules through the `@/`
 * alias, which only the bundler knows; the hook maps it to `src/`.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("choose-password-copy.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// Specifiers in variables, so the type checker leaves the `.ts` paths alone.
const specifier = "./choose-password-copy.ts";
const copy = (await import(specifier)) as typeof import("./choose-password-copy");
const rulesSpecifier = "./password-rules.ts";
const { PASSWORD_TOO_LONG } = (await import(rulesSpecifier)) as typeof import("./password-rules");

const {
  CHARACTERS_PASSWORD_COPY,
  choosePasswordFailureMessage,
  OFFLINE_COPY,
  PWNED_PASSWORD_COPY,
  REAUTH_COPY,
  RELOAD_PHRASE,
  RESET_LINK_PHRASE,
  SAVE_FAILED_COPY,
  sessionCheckMessage,
  SHORT_PASSWORD_COPY,
  SIGNED_OUT_COPY,
  SWITCHED_COPY,
  TOO_MANY_COPY,
  WEAK_PASSWORD_COPY,
} = copy;

/** Every sentence the mapper may answer with: nothing else may ever come out. */
const OURS = new Set([
  CHARACTERS_PASSWORD_COPY,
  OFFLINE_COPY,
  PASSWORD_TOO_LONG,
  PWNED_PASSWORD_COPY,
  REAUTH_COPY,
  SAVE_FAILED_COPY,
  SHORT_PASSWORD_COPY,
  SIGNED_OUT_COPY,
  TOO_MANY_COPY,
  WEAK_PASSWORD_COPY,
]);

/** Every sentence the screen may show: the mapper's, plus the session check's own. */
const SHOWN = new Set([...OURS, SWITCHED_COPY]);

function says(error: unknown, expected: string) {
  const message = choosePasswordFailureMessage(error);
  assert.equal(message, expected);
  assert.ok(OURS.has(message), `not one of our sentences: ${message}`);
}

test("offline: a fetch that threw or a gateway error", () => {
  says(new AuthRetryableFetchError("Failed to fetch", 0), OFFLINE_COPY);
  says(new AuthRetryableFetchError("Bad Gateway", 502), OFFLINE_COPY);
});

test("too long: GoTrue's 72-byte refusal is not 'pick a stronger one'", () => {
  says(new AuthApiError("Password cannot be longer than 72 characters", 422, "validation_failed"), PASSWORD_TOO_LONG);
});

test("weak: breached first, then characters, then length, else the general line", () => {
  says(new AuthWeakPasswordError("Password is known to be weak", 422, ["pwned"]), PWNED_PASSWORD_COPY);
  says(new AuthWeakPasswordError("weak", 422, ["length", "characters", "pwned"]), PWNED_PASSWORD_COPY);
  says(new AuthWeakPasswordError("weak", 422, ["characters"]), CHARACTERS_PASSWORD_COPY);
  says(new AuthWeakPasswordError("weak", 422, ["length", "characters"]), CHARACTERS_PASSWORD_COPY);
  says(new AuthWeakPasswordError("Password should be at least 8 characters.", 422, ["length"]), SHORT_PASSWORD_COPY);
  says(new AuthWeakPasswordError("weak", 422, []), WEAK_PASSWORD_COPY);
  // The code without auth-js's class (no `reasons` in the body).
  says(new AuthApiError("weak", 422, "weak_password"), WEAK_PASSWORD_COPY);
});

test("Secure password change: all three codes send the student to a reset link", () => {
  for (const code of ["reauthentication_needed", "reauthentication_not_valid", "reauth_nonce_missing"]) {
    says(new AuthApiError("Password update requires reauthentication.", 400, code), REAUTH_COPY);
  }
});

test("a session that is gone says so, never 'Auth session missing!'", () => {
  says(new AuthSessionMissingError(), SIGNED_OUT_COPY);
  for (const code of ["session_not_found", "refresh_token_not_found", "refresh_token_already_used"]) {
    says(new AuthApiError("Session from session_id claim in JWT does not exist", 403, code), SIGNED_OUT_COPY);
  }
});

test("too many tries: a 429, or the rate-limit code", () => {
  says(new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"), TOO_MANY_COPY);
  says(new AuthApiError("Too many requests", 429, undefined), TOO_MANY_COPY);
  says({ code: "over_request_rate_limit" }, TOO_MANY_COPY);
});

test("anything else is our plain 'try again', never the server's words", () => {
  const unknown: unknown[] = [
    new AuthApiError("Database error saving user: secret detail", 500, "unexpected_failure"),
    new AuthApiError("New password should be different from the old password.", 422, "same_password"),
    new Error("Load failed"),
    new TypeError("Failed to fetch"),
    { message: "something odd" },
    "a string",
    42,
    null,
    undefined,
  ];
  for (const error of unknown) says(error, SAVE_FAILED_COPY);
});

test("the reset copies end in the phrase the form links to Forgot password", () => {
  assert.equal(RESET_LINK_PHRASE, "send yourself a reset link");
  for (const text of [REAUTH_COPY, SIGNED_OUT_COPY]) {
    assert.ok(text.endsWith(`${RESET_LINK_PHRASE}.`), text);
  }
  assert.equal(REAUTH_COPY, "To finish, send yourself a reset link.");
  // Only those two: no other failure is fixed by a reset email.
  for (const text of SHOWN) {
    if (text === REAUTH_COPY || text === SIGNED_OUT_COPY) continue;
    assert.ok(!text.includes(RESET_LINK_PHRASE), text);
  }
});

test("every sentence is a full sentence in plain words", () => {
  for (const text of SHOWN) {
    assert.match(text, /^[A-Z].*\.$/, text);
    assert.doesNotMatch(text, /GoTrue|Supabase|JWT|session_id|422|500/, text);
  }
});

const X = "00000000-0000-4000-8000-00000000000a";
const Y = "00000000-0000-4000-8000-00000000000b";

/** What the session check says, which must be null or one of the screen's sentences. */
function checks(session: { userId: string | null; error: unknown }, pageUserId: string, expected: string | null) {
  const message = sessionCheckMessage(session, pageUserId);
  assert.equal(message, expected);
  if (message !== null) assert.ok(SHOWN.has(message), `not one of our sentences: ${message}`);
}

test("session check: the account the page was drawn for carries on", () => {
  checks({ userId: X, error: null }, X, null);
  // An error beside a session that is still X's does not stop the save.
  checks({ userId: X, error: new Error("odd") }, X, null);
});

test("session check: another tab's account is never saved to", () => {
  checks({ userId: Y, error: null }, X, SWITCHED_COPY);
  checks({ userId: Y, error: new AuthRetryableFetchError("Failed to fetch", 0) }, X, SWITCHED_COPY);
  // A page drawn without an id never matches, not even an empty session id.
  checks({ userId: "", error: null }, "", SWITCHED_COPY);
  checks({ userId: X, error: null }, "", SWITCHED_COPY);
});

test("session check: no session says signed out; a failed refresh reads like a failed save", () => {
  checks({ userId: null, error: null }, X, SIGNED_OUT_COPY);
  checks({ userId: null, error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found") }, X, SIGNED_OUT_COPY);
  // Offline while the token refreshes is offline, not signed out.
  checks({ userId: null, error: new AuthRetryableFetchError("Failed to fetch", 0) }, X, OFFLINE_COPY);
  checks({ userId: null, error: new Error("Load failed") }, X, SAVE_FAILED_COPY);
});

test("the switched copy ends in the phrase the form turns into a reload button", () => {
  assert.equal(RELOAD_PHRASE, "reload this page");
  assert.equal(
    SWITCHED_COPY,
    "Something changed in another tab, so we did not save your password. To continue, reload this page.",
  );
  assert.ok(SWITCHED_COPY.endsWith(`${RELOAD_PHRASE}.`));
  // Only that one: a reload fixes nothing else, and it never offers a reset email.
  for (const text of OURS) assert.ok(!text.includes(RELOAD_PHRASE), text);
  assert.ok(!SWITCHED_COPY.includes(RESET_LINK_PHRASE));
});
