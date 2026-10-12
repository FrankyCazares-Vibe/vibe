/**
 * Tests for `captcha.ts`, the pure half of the "are you a person" check
 * (launch checklist audit 2026-10-12, item 18, step B).
 *
 * Run with:
 *   node --test src/lib/auth/captcha.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the pattern of `password-rules.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./captcha.ts";
const {
  HUMAN_CHECK_CHECKING_LABEL,
  HUMAN_CHECK_MISSING,
  HUMAN_CHECK_NO_BOX,
  HUMAN_CHECK_OFF,
  HUMAN_CHECK_PATIENCE_MS,
  HUMAN_CHECK_REFUSED,
  HUMAN_CHECK_TAP_LABEL,
  TURNSTILE_COMPACT_HEIGHT,
  TURNSTILE_FIT_FULL,
  TURNSTILE_HEIGHT,
  TURNSTILE_MIN_WIDTH,
  TURNSTILE_ORIGIN,
  TURNSTILE_PROBLEM_COPY,
  TURNSTILE_SCRIPT_URL,
  TURNSTILE_SHRINK_FLOOR,
  captchaErrorMessage,
  captchaOptions,
  humanCheckWaitLabel,
  initialHumanCheck,
  isCaptchaError,
  readTurnstileSiteKey,
  turnstileFit,
  turnstileProblem,
  turnstileSiteKey,
} = (await import(specifier)) as typeof import("./captcha");
type HumanCheck = import("./captcha").HumanCheck;

/** Cloudflare's published test site key ("always passes"). */
const TEST_KEY = "1x00000000000000000000AA";

const OFF: HumanCheck = { status: "off", token: null };
const CHECKING: HumanCheck = { status: "checking", token: null };
const NEEDS_TAP: HumanCheck = { status: "needs_tap", token: null };
const READY: HumanCheck = { status: "ready", token: "tok.en" };
const UNAVAILABLE: HumanCheck = { status: "unavailable", token: null };
const ALL = [OFF, CHECKING, NEEDS_TAP, READY, UNAVAILABLE];

test("no site key means the box is off: unset, blank or not shaped like a key", () => {
  for (const raw of [undefined, null, "", "   ", "abc", '"1x00000000000000000000AA"', "1x0000 0000", "key; script-src *"]) {
    assert.equal(readTurnstileSiteKey(raw), null, String(raw));
  }
  assert.equal(readTurnstileSiteKey(TEST_KEY), TEST_KEY);
  assert.equal(readTurnstileSiteKey(`  ${TEST_KEY}\n`), TEST_KEY);
  assert.equal(readTurnstileSiteKey("0x4AAAAAAABkMYinukE8nzYS"), "0x4AAAAAAABkMYinukE8nzYS");
});

test("turnstileSiteKey reads NEXT_PUBLIC_TURNSTILE_SITE_KEY, and unset is off", () => {
  const before = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    assert.equal(turnstileSiteKey(), null);
    assert.deepEqual(initialHumanCheck(), HUMAN_CHECK_OFF);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = TEST_KEY;
    assert.equal(turnstileSiteKey(), TEST_KEY);
    assert.deepEqual(initialHumanCheck(), CHECKING);
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = before;
  }
});

test("a form with no box starts off; one with a box starts waiting", () => {
  assert.deepEqual(HUMAN_CHECK_OFF, OFF);
  assert.deepEqual(initialHumanCheck(null), OFF);
  assert.deepEqual(initialHumanCheck(TEST_KEY), CHECKING);
});

test("the button waits only while the box is checking or wants a tick, and says which", () => {
  assert.equal(humanCheckWaitLabel(OFF), null);
  assert.equal(humanCheckWaitLabel(READY), null);
  // A box that could not load must never leave a dead button.
  assert.equal(humanCheckWaitLabel(UNAVAILABLE), null);
  assert.equal(humanCheckWaitLabel(CHECKING), HUMAN_CHECK_CHECKING_LABEL);
  assert.equal(humanCheckWaitLabel(NEEDS_TAP), HUMAN_CHECK_TAP_LABEL);
});

test("only a ready box adds a token; every other state sends what the form always sent", () => {
  assert.deepEqual(captchaOptions(READY), { captchaToken: "tok.en" });
  for (const check of [OFF, CHECKING, NEEDS_TAP, UNAVAILABLE]) {
    assert.deepEqual(captchaOptions(check), {});
    assert.ok(!("captchaToken" in captchaOptions(check)));
  }
  // A token left over on a state that is not "ready" is never sent.
  assert.deepEqual(captchaOptions({ status: "checking", token: "old" }), {});
  assert.deepEqual(captchaOptions({ status: "ready", token: null }), {});
  assert.deepEqual(captchaOptions({ status: "ready", token: "" }), {});
});

test("Supabase's captcha refusals are recognised, and nothing else is", () => {
  assert.ok(isCaptchaError({ code: "captcha_failed", message: "captcha protection: request disallowed (timeout-or-duplicate)" }));
  assert.ok(isCaptchaError({ code: "captcha_failed" }));
  // The 500 when Supabase can't reach Cloudflare has no code of its own.
  assert.ok(isCaptchaError({ code: "unexpected_failure", message: "captcha verification process failed" }));
  assert.ok(isCaptchaError({ message: "Captcha protection: request disallowed (no captcha_token found)" }));
  for (const err of [
    null,
    undefined,
    {},
    { code: "invalid_credentials", message: "Invalid login credentials" },
    { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" },
    { code: null, message: null },
  ]) {
    assert.equal(isCaptchaError(err), false, JSON.stringify(err));
  }
});

test("a refused check says what to do, by the state the box was in", () => {
  assert.equal(captchaErrorMessage(OFF), HUMAN_CHECK_NO_BOX);
  assert.equal(captchaErrorMessage(UNAVAILABLE), HUMAN_CHECK_MISSING);
  assert.equal(captchaErrorMessage(READY), HUMAN_CHECK_REFUSED);
  assert.equal(captchaErrorMessage(CHECKING), HUMAN_CHECK_REFUSED);
  assert.equal(captchaErrorMessage(NEEDS_TAP), HUMAN_CHECK_REFUSED);
});

test("a page with no box says to reload AND where to write, because a reload does not always fix it", () => {
  // An old tab is fixed by a reload. A live build with no site key while
  // Supabase's switch is on is not, so the sentence must not stop at "reload".
  assert.match(HUMAN_CHECK_NO_BOX, /Reload the page\./);
  assert.match(HUMAN_CHECK_NO_BOX, /If it still doesn't work, email help@connectvibe\.app\.$/);
  assert.doesNotMatch(HUMAN_CHECK_NO_BOX, /out of date/i);
});

test("Turnstile's error codes sort into the problems the box can explain", () => {
  for (const code of ["110100", "110110", "110200", "400020", "400021", "400070", 110200, " 110200 "]) {
    assert.equal(turnstileProblem(code), "setup", String(code));
  }
  assert.equal(turnstileProblem("200100"), "clock");
  assert.equal(turnstileProblem(200100), "clock");
  assert.equal(turnstileProblem("110500"), "browser");
  assert.equal(turnstileProblem("110510"), "browser");
  assert.equal(turnstileProblem("200500"), "blocked");
  for (const code of ["300030", "600010", "110600", "110620", "102042", "", undefined, null, {}, "nonsense"]) {
    assert.equal(turnstileProblem(code), "failed", String(code));
  }
});

/**
 * The auth card's form column for a screen `screen` pixels wide: 16 a side
 * from src/app/auth/layout.tsx, 14 from .vibe-auth-page, the card's 1px
 * border and its 22px padding (globals.css, max-width 540px). Measured on the
 * real /auth/login and /auth/signup at 375px: 269.
 */
const formColumn = (screen: number) => screen - 2 * (16 + 14 + 1 + 22);

test("the form column on a phone is the screen minus 106, so under 300 on every phone below 406px", () => {
  assert.equal(formColumn(375), 269);
  assert.equal(formColumn(390), 284);
  assert.equal(formColumn(402), 296);
  assert.equal(formColumn(360), 254);
  assert.equal(formColumn(320), 214);
  assert.equal(formColumn(406), TURNSTILE_MIN_WIDTH);
});

test("300px and up: the box fills the column at full size", () => {
  assert.equal(TURNSTILE_MIN_WIDTH, 300);
  assert.equal(TURNSTILE_HEIGHT, 65);
  for (const width of [300, 300.4, 324, 362, 1200]) {
    assert.deepEqual(turnstileFit(width), { size: "flexible", scale: 1, height: 65 }, String(width));
  }
  assert.deepEqual(TURNSTILE_FIT_FULL, { size: "flexible", scale: 1, height: 65 });
});

test("240 to 299px (every iPhone and a 360px Android): the same box, shrunk to the column, never the compact one", () => {
  assert.equal(TURNSTILE_SHRINK_FLOOR, 240);
  for (const screen of [375, 390, 393, 402, 360]) {
    const width = formColumn(screen);
    const fit = turnstileFit(width);
    assert.equal(fit.size, "flexible", String(screen));
    // Shrunk, the 300px box is exactly as wide as the column.
    assert.ok(Math.abs(TURNSTILE_MIN_WIDTH * fit.scale - width) < 1e-9, String(screen));
    assert.ok(fit.scale >= 0.8 && fit.scale < 1, String(screen));
    // The room kept for it covers the shrunk box and wastes under a pixel.
    assert.ok(fit.height >= TURNSTILE_HEIGHT * fit.scale && fit.height - TURNSTILE_HEIGHT * fit.scale < 1, String(screen));
    assert.ok(fit.height < TURNSTILE_COMPACT_HEIGHT / 2, String(screen));
  }
  assert.equal(turnstileFit(269).height, 59);
  assert.equal(turnstileFit(254).height, 56);
  assert.deepEqual(turnstileFit(240), { size: "flexible", scale: 0.8, height: 52 });
  assert.equal(turnstileFit(299.5).size, "flexible");
});

test("under 240px (a 320px phone): the compact box, 150 by 140, not shrunk", () => {
  for (const width of [formColumn(320), 239.9, 150, 0]) {
    assert.deepEqual(turnstileFit(width), { size: "compact", scale: 1, height: 140 }, String(width));
  }
});

test("a drawn box keeps its kind when the phone is turned; only the shrink follows the column", () => {
  // Drawn full in landscape (362), then turned upright (269): shrunk, not swapped.
  assert.deepEqual(turnstileFit(362, "flexible"), TURNSTILE_FIT_FULL);
  assert.equal(turnstileFit(269, "flexible").size, "flexible");
  assert.ok(Math.abs(turnstileFit(269, "flexible").scale - 269 / 300) < 1e-9);
  // Narrower than the floor, a drawn box still follows, since it can't be swapped.
  assert.equal(turnstileFit(214, "flexible").size, "flexible");
  assert.ok(Math.abs(turnstileFit(214, "flexible").scale - 214 / 300) < 1e-9);
  // Drawn compact, then widened: it stays the compact box at its own size.
  assert.deepEqual(turnstileFit(362, "compact"), { size: "compact", scale: 1, height: 140 });
  // No usable width (a section that was closed again): nothing to shrink to, and never a scale of 0.
  for (const width of [0, -1, Number.NaN]) {
    assert.deepEqual(turnstileFit(width, "flexible"), TURNSTILE_FIT_FULL, String(width));
  }
});

test("the script comes from the one origin csp.ts lets in, drawn only when asked", () => {
  assert.equal(TURNSTILE_ORIGIN, "https://challenges.cloudflare.com");
  assert.equal(TURNSTILE_SCRIPT_URL, "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  assert.ok(HUMAN_CHECK_PATIENCE_MS >= 10_000 && HUMAN_CHECK_PATIENCE_MS <= 60_000);
});

test("words a student reads: one for every state, plain, and no em dashes", () => {
  const words = [
    HUMAN_CHECK_CHECKING_LABEL,
    HUMAN_CHECK_TAP_LABEL,
    HUMAN_CHECK_REFUSED,
    HUMAN_CHECK_MISSING,
    HUMAN_CHECK_NO_BOX,
    ...Object.values(TURNSTILE_PROBLEM_COPY),
  ];
  for (const text of words) {
    assert.ok(text.trim().length > 0);
    assert.ok(!/[—–]/.test(text), text);
    assert.ok(!/captcha|turnstile|cloudflare|token/i.test(text), text);
  }
  // The box puts a "Try again" button right after each of these.
  for (const text of Object.values(TURNSTILE_PROBLEM_COPY)) assert.ok(!/try again\.?$/i.test(text.trim()), text);
  assert.deepEqual(
    Object.keys(TURNSTILE_PROBLEM_COPY).sort(),
    ["blocked", "browser", "clock", "failed", "script", "setup", "slow"],
  );
  for (const check of ALL) assert.equal(typeof captchaErrorMessage(check), "string");
});
