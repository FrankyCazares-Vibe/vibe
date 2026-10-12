/**
 * The "are you a person" check on the three forms that talk to Supabase's
 * sign-in service straight from the browser: sign-up, sign-in and "send a new
 * email" (launch checklist audit 2026-10-12, item 18, step B). The box is
 * Cloudflare Turnstile; Supabase checks its token (`options.captchaToken`).
 *
 * OFF UNTIL THE KEY IS SET. With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset (or not
 * shaped like a key): no box, no Cloudflare script, no Cloudflare host in the
 * browser code rule (csp.ts asks this file), and the three forms send exactly
 * what they sent before. Local sign-in and production both run like that
 * until the key is added.
 *
 * TWO SWITCHES, IN THIS ORDER.
 *  1. The site key (on Vercel, then a new deploy: NEXT_PUBLIC_* is built in).
 *     The box shows and each request carries a token. Supabase ignores a
 *     token it did not ask for, so this step alone locks nobody out.
 *  2. Supabase > Authentication > Attack Protection > Captcha, with the
 *     SECRET key. From then on a request without a good token is refused with
 *     `captcha_failed`. Flipped before step 1 is live, nobody can sign in.
 *     Before flipping it, see the box pass in a phone browser AND inside the
 *     iPhone and Android apps (.env.example has the list).
 *
 * TO TURN IT OFF, THE OTHER WAY ROUND: Supabase's switch FIRST (it is
 * instant), then the key. NEVER remove or change the key while Supabase's
 * switch is on: a build with no key (or one pasted with its quotes, which
 * reads as no key) has no box, so every sign-in, sign-up and new email is
 * refused, and no reload fixes it (HUMAN_CHECK_NO_BOX below is what the
 * student is told).
 *
 * What Supabase guards with it (auth, internal/api/api.go, verifyCaptcha):
 * /signup, /resend, /token with a password, and /recover, /otp, /magiclink
 * (which Vibe never calls). NOT /verify (the typed 8-digit code), not a
 * session refresh, and not a call made with the service role (forgot
 * password, the waitlist): those need no box.
 *
 * A token works ONCE and lasts five minutes. So the box is reset after every
 * attempt, and Turnstile runs the check again by itself when a token runs out.
 *
 * Pure: no imports, safe on the server, in the browser, in the proxy and in
 * `node --test` (captcha.test.ts). The half that touches the page is
 * src/components/auth/TurnstileBox.tsx.
 */

/** Where Turnstile's script and its challenge frame come from. csp.ts lets in exactly this origin. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
/** `render=explicit`: nothing is drawn until TurnstileBox asks, into its own element. */
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

/** Cloudflare's box is 300px wide at its narrowest and 65px tall. */
export const TURNSTILE_MIN_WIDTH = 300;
export const TURNSTILE_HEIGHT = 65;
/** Its compact box, 150 by 140: the only one Cloudflare draws in less than 300px. */
export const TURNSTILE_COMPACT_HEIGHT = 140;
/** The narrowest column the 300px box is shrunk into (to 80%, where its words are still readable). */
export const TURNSTILE_SHRINK_FLOOR = 240;
/** How long the box may sit on "checking" before the form stops waiting for it. */
export const HUMAN_CHECK_PATIENCE_MS = 20_000;

/** Real keys look like 0x4AAAAAAA…, Cloudflare's test keys like 1x00000000000000000000AA. */
const SITE_KEY_SHAPE = /^[0-9A-Za-z_-]{10,128}$/;

/**
 * A usable site key, or null. Null is "the box is off", and so is anything
 * that is not shaped like a key (pasted with its quotes, a stray space
 * inside): a value like that must never reach Cloudflare or the header.
 */
export function readTurnstileSiteKey(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return SITE_KEY_SHAPE.test(value) ? value : null;
}

/** This build's site key, or null when the box is off. The name is written out so Next can build it into the page. */
export function turnstileSiteKey(): string | null {
  return readTurnstileSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** Cloudflare's label for which form a check came from (its analytics only; Supabase does not read it). */
export type HumanCheckAction = "sign-in" | "sign-up" | "resend";

export type HumanCheckStatus =
  | "off" // no site key: there is no box, and the form never waits
  | "checking" // the box is loading or running: the button waits
  | "needs_tap" // Cloudflare wants the person to tick the box: the button waits
  | "ready" // a token is in hand
  | "unavailable"; // the box could not load, or took too long: the form stops waiting

/** What a form knows about its box. `token` is set only when `status` is "ready". */
export type HumanCheck = { status: HumanCheckStatus; token: string | null };

export const HUMAN_CHECK_OFF: HumanCheck = { status: "off", token: null };

/** A form's first state: waiting when this build has a box, "off" when it has none. */
export function initialHumanCheck(siteKey: string | null = turnstileSiteKey()): HumanCheck {
  return siteKey ? { status: "checking", token: null } : HUMAN_CHECK_OFF;
}

export const HUMAN_CHECK_CHECKING_LABEL = "Checking you're a person…";
export const HUMAN_CHECK_TAP_LABEL = "Tick the box above first";

/**
 * What the form's button says while it waits for the box, or null when it
 * need not wait. The reason is ON the button, so it is never just dead.
 *
 * "unavailable" does not wait, on purpose: a blocked script must not lock a
 * student out by itself. The request then goes without a token. While
 * Supabase's switch is off that works as before; once it is on, Supabase
 * refuses it and the form says why (captchaErrorMessage).
 */
export function humanCheckWaitLabel(check: HumanCheck): string | null {
  if (check.status === "checking") return HUMAN_CHECK_CHECKING_LABEL;
  if (check.status === "needs_tap") return HUMAN_CHECK_TAP_LABEL;
  return null;
}

/** Spread into a Supabase auth call's `options`. Empty without a token, so an "off" form sends what it always sent. */
export function captchaOptions(check: HumanCheck): { captchaToken?: string } {
  return check.status === "ready" && check.token ? { captchaToken: check.token } : {};
}

/**
 * Supabase refused the check: 400 `captcha_failed` ("captcha protection:
 * request disallowed (…)") for a missing, spent, expired or failed token, and
 * a 500 "captcha verification process failed" when Supabase could not reach
 * Cloudflare, which carries no code of its own.
 */
export function isCaptchaError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return err?.code === "captcha_failed" || /captcha/i.test(err?.message ?? "");
}

export const HUMAN_CHECK_REFUSED =
  "We couldn't confirm you're a person that time. Give the check a second to finish, then try again.";
export const HUMAN_CHECK_MISSING =
  "We couldn't check that you're a person, so that didn't go through. Turn off any ad blocker for Vibe, reload this page, then try again.";
/**
 * Supabase asked for a check and this page has no box. Either the tab was
 * built before the box existed (a reload fixes that), or the site key is
 * missing from the live build while Supabase's switch is on (no reload fixes
 * that: see TO TURN IT OFF at the top). So it says both things to do.
 */
export const HUMAN_CHECK_NO_BOX =
  "Vibe needs to check you're a person, and this page couldn't run that check. Reload the page. If it still doesn't work, email help@connectvibe.app.";

/**
 * What to say after isCaptchaError, from the box's state when the request
 * left. "off": this page has no box (HUMAN_CHECK_NO_BOX). "unavailable": the
 * box never loaded, so no token went. Anything else: a token went and was
 * refused (spent, or it ran out on the way).
 */
export function captchaErrorMessage(check: HumanCheck): string {
  if (check.status === "off") return HUMAN_CHECK_NO_BOX;
  if (check.status === "unavailable") return HUMAN_CHECK_MISSING;
  return HUMAN_CHECK_REFUSED;
}

/** Why the box itself is not working. "script" and "slow" are ours; the rest come from Turnstile's error codes. */
export type TurnstileProblem = "script" | "blocked" | "setup" | "clock" | "browser" | "slow" | "failed";

/** Turnstile's client error codes that mean OUR set-up is wrong (bad or disabled key, this site not on its list). */
const SETUP_CODES = new Set([
  "110100", "110110", "110200", "110420", "110430", "400020", "400021", "400030", "400040", "400070",
]);

/**
 * Sorts a code from Turnstile's error-callback (a string or a number; see
 * Cloudflare's "Client-side errors" page). Anything not named here is
 * "failed": Turnstile retries those by itself, and so can the student.
 */
export function turnstileProblem(code: unknown): TurnstileProblem {
  const text = String(code ?? "").trim();
  if (SETUP_CODES.has(text)) return "setup";
  if (text === "200100") return "clock";
  if (text === "110500" || text === "110510") return "browser";
  if (text === "200500") return "blocked";
  return "failed";
}

const NOT_LOADED =
  "The check that you're a person didn't load. Check your connection and turn off any ad blocker for Vibe.";

/**
 * One plain line per problem: what happened, and what to do about it.
 * TurnstileBox puts a "Try again" button straight after it, so none of them
 * ends by saying "try again" itself.
 */
export const TURNSTILE_PROBLEM_COPY: Record<TurnstileProblem, string> = {
  script: NOT_LOADED,
  blocked: NOT_LOADED,
  setup:
    "Something is wrong with the check on our side. You can carry on. If that doesn't work, email help@connectvibe.app.",
  clock: "The check that you're a person needs the right time. Set your device's date and time to automatic.",
  browser: "This browser can't run the check that you're a person. Update it, or open Vibe in another browser.",
  slow: "The check that you're a person is taking too long. Turn off any ad blocker for Vibe, or reload this page.",
  failed: "The check that you're a person didn't finish.",
};

/** The two boxes Cloudflare is asked for: "flexible" fills its element (never under 300px); "compact" is 150 by 140. */
export type TurnstileSize = "flexible" | "compact";

/**
 * How the box sits in its column: which of Cloudflare's boxes, how much it is
 * shrunk (1 is not at all), and the height it then takes up on the page.
 */
export type TurnstileFit = { size: TurnstileSize; scale: number; height: number };

/** The box before its column has been measured, and in any column of 300px or more: full size. */
export const TURNSTILE_FIT_FULL: TurnstileFit = { size: "flexible", scale: 1, height: TURNSTILE_HEIGHT };

/**
 * Fits the box to a column `width` pixels wide.
 *
 * The auth card's form column is the screen's width MINUS 106: 16 a side from
 * auth/layout.tsx, 14 from .vibe-auth-page, the card's 1px border and its 22px
 * padding. That is 269 on a 375px iPhone, 284 at 390, 296 at 402 and 254 on a
 * 360px Android. So every phone under 406px wide is short of Cloudflare's
 * 300, and left to Cloudflare they would all get the compact box: a 150 by
 * 140 square at the left of the form. Instead:
 *  - 300 and up: the box fills the column.
 *  - 240 to 299: the same 300px box, shrunk to the column (TurnstileBox does
 *    it with a CSS scale). It still spans the form, 52 to 65px tall.
 *  - under 240 (a 320px phone: 214): the compact box. Shrunk any further the
 *    300px one's words would be too small to read.
 *
 * `drawn` is the kind of box already on the page, if there is one. Cloudflare
 * can't swap a drawn box for the other kind, so a turned phone keeps its box
 * and only the scale follows the new width.
 */
export function turnstileFit(width: number, drawn: TurnstileSize | null = null): TurnstileFit {
  const compact = drawn ? drawn === "compact" : width < TURNSTILE_SHRINK_FLOOR;
  if (compact) return { size: "compact", scale: 1, height: TURNSTILE_COMPACT_HEIGHT };
  // No usable width (a hidden section): nothing to shrink to.
  if (width >= TURNSTILE_MIN_WIDTH || !(width > 0)) return TURNSTILE_FIT_FULL;
  const scale = width / TURNSTILE_MIN_WIDTH;
  return { size: "flexible", scale, height: Math.ceil(TURNSTILE_HEIGHT * scale) };
}
