/**
 * Source pins for the pre-registration fix (Oct 2026), read as text in the
 * `follower-gates.test.ts` style.
 *
 * The database removes the stored password at an address's first
 * confirmation (`auth_hooks.first_confirm_drops_password`), because whoever
 * chose it had not proven the inbox. These pins keep the pages that confirm
 * with a password in hand from drifting away from that:
 *
 *  - the sign-up page puts the typed password back after EVERY code (wave 1's
 *    `reclaimPassword` guess is gone), and records the tick only after the
 *    save worked, so consent always means a password chosen after the inbox
 *    was proven; and a new build's reload never drops that view and its
 *    in-memory password (the club link page draws it too);
 *  - the login code box puts back the password that sign-in matched;
 *  - ConfirmCodeForm runs the parent's step on success and goes nowhere it
 *    did not vet; when another tab of this browser confirmed first it goes
 *    straight on WITHOUT that step, so a stale tab's password never replaces
 *    one the other tab saved (/auth/terms catches an account left with none);
 *  - `/auth/terms` reads the flag only once consent is missing, and the hot
 *    gates (the proxy, campus access, onboarding) never read it.
 *
 * Run with:
 *   node --test src/lib/auth/confirm-paths-pins.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const SRC = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, SRC), "utf8");
const at = (src: string, needle: string, file: string, from = 0): number => {
  const i = src.indexOf(needle, from);
  assert.ok(i >= 0, `${file}: ${needle}`);
  return i;
};

/** The sign-up page's password save, exactly. */
const SAVE = "const { error: pwErr } = await getSupabaseBrowserClient().auth.updateUser({ password });";

/** `text` without its `//` and `/* … *\/` comments, so prose cannot pass or fail a pin. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** The text of the arrow function passed as `onConfirmed={async () => { … }}`, braces balanced. */
function onConfirmedBody(src: string, file: string): string {
  const open = at(src, "onConfirmed={async () => {", file) + "onConfirmed={async () => ".length;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  assert.fail(`${file}: onConfirmed body never closes`);
}

test("sign-up page: wave 1's reclaimPassword guess is gone", () => {
  const src = read("app/auth/signup/signup-form.tsx");
  assert.ok(!src.includes("reclaimPassword"), "no reclaimPassword left");
  // The guess read these to tell a fresh account from an older one.
  assert.ok(!/created_at\s*\?\?/.test(src) && !src.includes("confirmation_sent_at"), "no created/sent timing guess");
});

test("sign-up page: the password goes back on after every code, then the tick, never the other way round", () => {
  const src = read("app/auth/signup/signup-form.tsx");
  const body = onConfirmedBody(src, "signup-form");
  // The save is this one plain statement: a ternary or `&&` around it would
  // not read like this.
  const save = at(body, SAVE, "signup onConfirmed");
  // Nothing may decide to skip the save, except the (unreachable) no-password guard.
  const before = code(body.slice(0, save));
  const conditions = before.match(/\bif\s*\(([^)]*)\)/g) ?? [];
  assert.deepEqual(conditions, ["if (!password)"], "the only condition before the save is the no-password guard");
  assert.ok(!/\?|&&|\|\|/.test(before), "no ?, && or || before the save");
  const returns = before.match(/\breturn\b/g) ?? [];
  assert.equal(returns.length, 1, "one return before the save");
  assert.ok(/\bif \(!password\) return\b/.test(before), "and it is the no-password guard's");
  // At the body's own level, not inside a block or a function that may never run.
  assert.equal(before.split("{").length - before.split("}").length, 1, "the save is not nested");
  // A failed save answers the choose screen, and returns before any consent call.
  const failed = at(body, "if (pwErr) {", "signup onConfirmed", save);
  const consent = at(body, '"/api/me/accept-terms"', "signup onConfirmed");
  assert.ok(consent > failed, "accept-terms is posted after the save's error check");
  const errorBlock = body.slice(failed, consent);
  assert.ok(errorBlock.includes('pwErr.code === "same_password"'), "same_password counts as saved");
  assert.ok(errorBlock.includes("choosePasswordHref(POST_EMAIL_CONFIRM_PATH, { again: true })"), "a failed save goes to the choose screen");
  assert.equal(body.split('"/api/me/accept-terms"').length, 2, "one consent call");
  // The source is the server's call, never the page's.
  assert.ok(!/source/.test(body.slice(consent)), "no source sent from the client");
  assert.ok(body.slice(consent).includes("terms_version: TERMS_VERSION"));
});

test("sign-up page: a new build never reloads the pending view (the club link is not a quiet path)", () => {
  const src = read("app/auth/signup/signup-form.tsx");
  const view = at(src, "if (pending) {", "signup-form");
  const root = at(src, '<div className="vibe-auth-page" data-holds-reload="">', "signup-form", view);
  assert.ok(root < at(src, "<ConfirmCodeForm", "signup-form", view), "the hold is on the view's own root");
});

test("sign-up page: the may-already-have-an-account banner explains a reset", () => {
  const src = read("app/auth/signup/signup-form.tsx");
  const banner = at(src, "This email may already have an account.", "signup-form");
  const line = at(src, "Never made one? Forgot password sends a reset to this inbox.", "signup-form");
  assert.ok(line > banner && line - banner < 200, "the reset line sits with the banner");
  at(src, "href={signInHref}", "signup-form", banner);
  at(src, 'href="/auth/forgot-password"', "signup-form", banner);
});

test("login page: the code box puts back the password that sign-in matched", () => {
  const src = read("app/auth/login/page.tsx");
  at(src, 'const matchedPassword = useRef("");', "login");
  // Set only from an `email_not_confirmed` answer (GoTrue checks the password first), cleared otherwise.
  at(src, 'const unconfirmed = signErr.code === "email_not_confirmed";', "login");
  at(src, 'matchedPassword.current = unconfirmed ? password : "";', "login");
  const box = at(src, "<ConfirmCodeForm", "login");
  const body = onConfirmedBody(src.slice(box), "login");
  at(body, "matchedPassword.current", "login onConfirmed");
  at(body, "auth.updateUser({ password: pw })", "login onConfirmed");
  at(body, "choosePasswordHref(POST_EMAIL_CONFIRM_PATH, { again: true })", "login onConfirmed");
  // No box was ticked on this page: /auth/terms asks, not this page.
  assert.ok(!body.includes("accept-terms"), "no consent call from the login page");
});

test("ConfirmCodeForm: the parent's step runs on success only, its answer is vetted, and the shortcut skips it", () => {
  const src = read("components/auth/ConfirmCodeForm.tsx");
  const helper = at(src, "async function destinationAfterConfirm(", "ConfirmCodeForm");
  const helperBody = src.slice(helper, at(src, "\n}\n", "ConfirmCodeForm", helper));
  at(helperBody, "isSafeRelativePath(answer)", "destinationAfterConfirm");
  at(helperBody, "catch {", "destinationAfterConfirm");
  const component = src.slice(at(src, "export function ConfirmCodeForm(", "ConfirmCodeForm"));
  const calls = component.split("window.location.assign(await destinationAfterConfirm(onConfirmed));").length - 1;
  assert.equal(calls, 1, "only the success branch goes through the helper");
  // The "already confirmed in this browser" shortcut, from its check to the
  // wrong-code copy: it goes straight on and never runs the parent's step,
  // which would put this tab's older password over one another tab saved.
  const shortcutAt = at(component, "signedIn?.email_confirmed_at &&", "ConfirmCodeForm");
  const classify = at(component, "classifyEmailLinkProblem({", "ConfirmCodeForm", shortcutAt);
  const shortcut = code(component.slice(shortcutAt, classify));
  assert.ok(shortcut.includes("window.location.assign(POST_EMAIL_CONFIRM_PATH);"), "the shortcut goes straight to the next step");
  assert.ok(!/onConfirmed|destinationAfterConfirm|updateUser/.test(shortcut), "the shortcut never puts a password back");
  assert.equal(component.split("window.location.assign(POST_EMAIL_CONFIRM_PATH)").length - 1, 1, "only the shortcut skips the helper");
  // The helper's one call is the success branch's, after the wrong-code copy.
  assert.ok(at(component, "await destinationAfterConfirm(onConfirmed)", "ConfirmCodeForm") > classify);
  // onConfirmed is only ever run by the helper.
  assert.ok(!/await onConfirmed\(\)/.test(component));
});

test("/auth/terms reads the flag only once consent is missing", () => {
  const src = read("app/auth/terms/page.tsx");
  const consent = at(src, "if (hasRecordedConsent(", "terms page");
  const flag = at(src, "readPasswordFlag(", "terms page");
  assert.ok(flag > consent, "the flag read comes after the consent check");
  assert.ok(src.indexOf("passwordMissing(") > consent, "and so does the password check");
});

test("the hot gates never read the flag", () => {
  for (const file of ["proxy.ts", "lib/auth/campus-access.ts", "app/onboarding/page.tsx"]) {
    const src = read(file);
    for (const word of ["password_needed_at", "readPasswordFlag", "passwordMissing", "account_password_missing"]) {
      assert.ok(!src.includes(word), `${file} mentions ${word}`);
    }
  }
});
