/**
 * Tests for `choose-password-path.ts`: where the "Choose your password"
 * screen sends people on, and the link every caller builds to it
 * (pre-registration fix, Oct 2026).
 *
 *  - a safe same-origin `next` is kept, query and all;
 *  - anything the open-redirect gate refuses (`//evil`, `/\evil`, `https:`,
 *    whitespace, nothing at all) falls back to POST_EMAIL_CONFIRM_PATH;
 *  - the choose screen and the Terms page are never a `next` (each can send
 *    back to the other), however the path is dressed up (dot segments,
 *    percent escapes, doubled slashes);
 *  - `choosePasswordHref` encodes `next` and adds `again=1` only when asked.
 *
 * Run with:
 *   node --test src/lib/auth/choose-password-path.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports its two pure neighbours through
 * the `@/` alias, which only the bundler knows; the hook maps it to `src/`.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("choose-password-path.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const specifier = "./choose-password-path.ts";
const { CHOOSE_PASSWORD_PATH, choosePasswordHref, resolveChooseNext } = (await import(specifier)) as typeof import("./choose-password-path");
const confirmSpecifier = "./email-confirm-redirect.ts";
const { POST_EMAIL_CONFIRM_PATH } = (await import(confirmSpecifier)) as typeof import("./email-confirm-redirect");

test("the choose screen lives at /auth/choose-password", () => {
  assert.equal(CHOOSE_PASSWORD_PATH, "/auth/choose-password");
});

test("resolveChooseNext keeps a safe same-origin next, query included", () => {
  for (const next of ["/onboarding", "/profile", "/messages?space=abc", POST_EMAIL_CONFIRM_PATH, "/auth/school-email", "/c/abc123"]) {
    assert.equal(resolveChooseNext(next), next, next);
  }
  // A path that only starts with the same letters is not the Terms page.
  assert.equal(resolveChooseNext("/auth/termsheet"), "/auth/termsheet");
});

test("resolveChooseNext takes the first of a repeated ?next=", () => {
  assert.equal(resolveChooseNext(["/profile", "/onboarding"]), "/profile");
  assert.equal(resolveChooseNext([]), POST_EMAIL_CONFIRM_PATH);
});

test("resolveChooseNext refuses what the open-redirect gate refuses", () => {
  const unsafe = [
    undefined,
    null,
    "",
    "//evil.example",
    "/\\evil.example",
    "\\evil.example",
    "https://evil.example/onboarding",
    "javascript:alert(1)",
    "onboarding",
    "/onboarding with space",
    "/onboarding\n",
    " /onboarding",
    "/\tevil",
  ];
  for (const next of unsafe) assert.equal(resolveChooseNext(next), POST_EMAIL_CONFIRM_PATH, JSON.stringify(next));
});

test("resolveChooseNext never sends to the choose screen or the Terms page (no loops)", () => {
  const loops = [
    "/auth/choose-password",
    "/auth/choose-password?next=%2Fprofile",
    "/auth/choose-password/",
    "/auth/choose-password#top",
    "/auth/terms",
    "/auth/terms?next=%2Fonboarding",
    "/auth/terms/",
    "/auth/terms#x",
    "/auth/./terms",
    "/auth/x/../terms",
    "/auth/%74erms",
    "/auth/choose%2Dpassword",
    // Next 308s any `//` in a path to the single-slash form.
    "/auth//terms",
    "/auth//choose-password",
    "/auth//choose-password?next=%2Fprofile",
    "/auth///terms/",
  ];
  for (const next of loops) assert.equal(resolveChooseNext(next), POST_EMAIL_CONFIRM_PATH, next);
});

test("resolveChooseNext keeps a doubled slash elsewhere as given", () => {
  // Only the check folds slashes; the kept next is returned untouched.
  assert.equal(resolveChooseNext("/profile//clubs"), "/profile//clubs");
});

test("the crafted Terms link from the review ends at the default, not a stray hop", () => {
  const href = choosePasswordHref("/auth//choose-password");
  assert.equal(href, `/auth/choose-password?next=${encodeURIComponent(POST_EMAIL_CONFIRM_PATH)}`);
});

test("choosePasswordHref encodes next and adds again=1 only when asked", () => {
  assert.equal(choosePasswordHref("/onboarding"), "/auth/choose-password?next=%2Fonboarding");
  assert.equal(
    choosePasswordHref("/messages?space=a&b=c"),
    "/auth/choose-password?next=%2Fmessages%3Fspace%3Da%26b%3Dc",
  );
  assert.equal(choosePasswordHref("/onboarding", { again: true }), "/auth/choose-password?next=%2Fonboarding&again=1");
  assert.equal(choosePasswordHref("/onboarding", { again: false }), "/auth/choose-password?next=%2Fonboarding");
  assert.equal(choosePasswordHref("/onboarding", {}), "/auth/choose-password?next=%2Fonboarding");
});

test("choosePasswordHref runs next through resolveChooseNext first", () => {
  const fallback = `/auth/choose-password?next=${encodeURIComponent(POST_EMAIL_CONFIRM_PATH)}`;
  assert.equal(choosePasswordHref(undefined), fallback);
  assert.equal(choosePasswordHref("//evil.example"), fallback);
  assert.equal(choosePasswordHref("/auth/terms?next=%2Fonboarding"), fallback);
  assert.equal(choosePasswordHref("/auth/choose-password", { again: true }), `${fallback}&again=1`);
  // The link it builds is itself a safe path, and its own next reads back unchanged.
  const href = choosePasswordHref("/profile?tab=clubs");
  const back = new URL(href, "https://x.invalid").searchParams.get("next");
  assert.equal(back, "/profile?tab=clubs");
  assert.equal(resolveChooseNext(back), "/profile?tab=clubs");
});
