/**
 * Tests for `password-reset-limits.ts`, the limits on the forgot-password
 * route (src/app/api/auth/password-reset/route.ts).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/auth/password-reset-limits.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the pattern of `password-rules.test.ts`. So does the page's
 * copy (password-reset-copy.ts), run at the end against these limits.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./password-reset-limits.ts";
const {
  RESET_EMAILS_PER_DAY,
  RESET_EMAILS_PER_HOUR,
  RESET_HINTS_PER_ADDRESS_PER_DAY,
  RESET_NETWORK_WINDOW_SEC,
  RESET_REQUESTS_PER_ADDRESS_PER_DAY,
  RESET_REQUESTS_PER_NETWORK,
  firstRefusal,
  resetAddressLimits,
  resetHintLimit,
  resetNetworkLimit,
  resetRefusalCode,
  resetSendLimits,
} = (await import(specifier)) as typeof import("./password-reset-limits");
const copySpecifier = "./password-reset-copy.ts";
const { UNAVAILABLE_COPY, resetRequestError } = (await import(copySpecifier)) as typeof import("./password-reset-copy");

type Limit = import("./password-reset-limits").ResetLimit;

const HOUR = 3600;
const DAY = 86_400;

type Answer = { allowed: boolean; retryAfterSec: number; reason: "limited" | "unavailable" | null };

/**
 * The limiter as the database runs it (`rate_limit_hit`): one count per key
 * and window start, every ask counts, allowed while the count is within the
 * limit, and a refusal's retry is the time left in its window, as
 * `rateLimit` answers since Wave 1. `clock.now` is seconds since the epoch.
 * A null key counts nothing and takes the failure path, as `rateLimit` does:
 * failClosed refuses for 60 seconds, anything else lets it through.
 */
function fakeLimiter(clock: { now: number }) {
  const counts = new Map<string, number>();
  const asked: Array<string | null> = [];
  const hit = async (limit: Limit): Promise<Answer> => {
    asked.push(limit.key);
    if (limit.key === null) {
      return limit.failClosed
        ? { allowed: false, retryAfterSec: 60, reason: "unavailable" }
        : { allowed: true, retryAfterSec: 0, reason: "unavailable" };
    }
    const windowStart = Math.floor(clock.now / limit.windowSec) * limit.windowSec;
    const row = `${limit.key}|${windowStart}`;
    const count = (counts.get(row) ?? 0) + 1;
    counts.set(row, count);
    if (count <= limit.limit) return { allowed: true, retryAfterSec: 0, reason: null };
    return { allowed: false, retryAfterSec: limit.windowSec - (clock.now % limit.windowSec), reason: "limited" };
  };
  return { hit, asked };
}

const refusedFor = (retryAfterSec: number): Answer => ({ allowed: false, retryAfterSec, reason: "limited" });

/** How many of `tries` asks get through, all at the clock's current time. */
async function passes(limits: Limit[], hit: (l: Limit) => Promise<Answer>, tries: number) {
  let through = 0;
  for (let i = 0; i < tries; i += 1) {
    if ((await firstRefusal(limits, hit)) === null) through += 1;
  }
  return through;
}

test("the numbers are exact", () => {
  assert.equal(RESET_REQUESTS_PER_NETWORK, 5);
  assert.equal(RESET_NETWORK_WINDOW_SEC, 900);
  assert.equal(RESET_REQUESTS_PER_ADDRESS_PER_DAY, 3);
  assert.equal(RESET_EMAILS_PER_HOUR, 20);
  assert.equal(RESET_EMAILS_PER_DAY, 40);
  assert.equal(RESET_HINTS_PER_ADDRESS_PER_DAY, 1);
});

test("per network: 5 per 15 minutes on the network's code, refusing when the limiter is down", () => {
  const code = "0123456789abcdef0123456789abcdef";
  assert.deepEqual(resetNetworkLimit(code), {
    key: `pw-reset-net:${code}`,
    limit: 5,
    windowSec: 900,
    failClosed: true,
  });
});

test("per network with no code: a null key, never the address, and still failClosed", async () => {
  // The limiter answers a null key the way it answers a database that is
  // down (src/lib/rate-limit.ts), so failClosed makes it a refusal.
  assert.deepEqual(resetNetworkLimit(null), { key: null, limit: 5, windowSec: 900, failClosed: true });
  const { hit } = fakeLimiter({ now: 10 * DAY });
  assert.deepEqual(await firstRefusal([resetNetworkLimit(null)], hit), { allowed: false, retryAfterSec: 60, reason: "unavailable" });
});

test("per address: 3 a UTC day on the hash, and no hour of its own", () => {
  assert.deepEqual(resetAddressLimits("abc123"), [
    { key: "pw-reset-email-day:abc123", limit: 3, windowSec: DAY, failClosed: false },
  ]);
});

test("reset emails as a whole: 20 an hour then 40 a day, refusing when the limiter is down", () => {
  assert.deepEqual(resetSendLimits(), [
    { key: "pw-reset-global-hour", limit: 20, windowSec: HOUR, failClosed: true },
    { key: "pw-reset-global-day", limit: 40, windowSec: DAY, failClosed: true },
  ]);
});

test("the sign-in note: one a day per address, on the hash and its own key, refusing when the limiter is down", () => {
  assert.deepEqual(resetHintLimit("abc123"), {
    key: "pw-reset-hint-day:abc123",
    limit: 1,
    windowSec: DAY,
    failClosed: true,
  });
});

test("no two limits share a key: an hour's window and a day's start together at midnight UTC", () => {
  const keys = [resetNetworkLimit("n"), ...resetAddressLimits("n"), resetHintLimit("n"), ...resetSendLimits()].map((l) => l.key);
  assert.ok(keys.every((key) => key !== null));
  assert.equal(new Set(keys).size, keys.length);
  // One address's hash can never be read as another limit's key.
  assert.notEqual(resetAddressLimits("x")[0].key, resetHintLimit("x").key);
  assert.notEqual(resetAddressLimits("x")[0].key, resetNetworkLimit("x").key);
});

test("firstRefusal: null when every limit allows, each asked once and in order", async () => {
  const { hit, asked } = fakeLimiter({ now: 10 * DAY });
  assert.equal(await firstRefusal(resetSendLimits(), hit), null);
  assert.deepEqual(asked, ["pw-reset-global-hour", "pw-reset-global-day"]);
  assert.equal(await firstRefusal([], hit), null);
});

test("firstRefusal: stops at the first refusal and hands back its answer", async () => {
  const asked: Array<string | null> = [];
  const refusal = refusedFor(HOUR);
  const result = await firstRefusal(resetSendLimits(), async (limit) => {
    asked.push(limit.key);
    return refusal;
  });
  assert.equal(result, refusal);
  assert.deepEqual(asked, ["pw-reset-global-hour"]);
});

test("a limiter that is down and refuses (60 seconds) is a refusal like any other", async () => {
  const down = async () => ({ allowed: false, retryAfterSec: 60 });
  assert.deepEqual(await firstRefusal([resetNetworkLimit("c0de")], down), { allowed: false, retryAfterSec: 60 });
  assert.deepEqual(await firstRefusal([resetNetworkLimit(null)], down), { allowed: false, retryAfterSec: 60 });
  assert.deepEqual(await firstRefusal(resetSendLimits(), down), { allowed: false, retryAfterSec: 60 });
});

test("per network: the 6th request inside 15 minutes is refused, the next window is fresh", async () => {
  const clock = { now: 10 * DAY };
  const { hit } = fakeLimiter(clock);
  const limits = [resetNetworkLimit("code-a")];
  assert.equal(await passes(limits, hit, 8), 5);
  assert.deepEqual(await firstRefusal(limits, hit), refusedFor(900));
  // Another network (another code) is not affected.
  assert.equal(await firstRefusal([resetNetworkLimit("code-b")], hit), null);
  clock.now += 900;
  assert.equal(await firstRefusal(limits, hit), null);
});

test("per address: 3 a day, and the 4th, in the same hour or a later one, is told the day's real wait", async () => {
  // 14:05 UTC: the reviewer's case. Before this, the hour answered the 4th
  // ("52 minutes"), and coming back then met the day.
  const clock = { now: 10 * DAY + 14 * HOUR + 5 * 60 };
  const { hit } = fakeLimiter(clock);
  const limits = resetAddressLimits("abc");
  const untilMidnight = () => 11 * DAY - clock.now;

  assert.equal(await passes(limits, hit, 3), 3);
  clock.now += 3 * 60;
  assert.deepEqual(await firstRefusal(limits, hit), refusedFor(untilMidnight()));

  // An hour later: still the day, with the time left in it.
  clock.now += HOUR;
  assert.deepEqual(await firstRefusal(limits, hit), refusedFor(untilMidnight()));

  // Another address is not affected; the next UTC day is fresh.
  assert.equal(await firstRefusal(resetAddressLimits("other"), hit), null);
  clock.now = 11 * DAY;
  assert.equal(await passes(limits, hit, 10), 3);
});

test("reset emails as a whole: 20 an hour, 40 a day, whoever they are for", async () => {
  const clock = { now: 10 * DAY };
  const { hit } = fakeLimiter(clock);

  assert.equal(await passes(resetSendLimits(), hit, 50), 20);
  clock.now += HOUR;
  assert.equal(await passes(resetSendLimits(), hit, 50), 20);
  // The day is spent: nothing more goes out in any later hour of it, and it
  // is the day that says no (the new hour has room).
  clock.now += HOUR;
  assert.equal(await passes(resetSendLimits(), hit, 5), 0);
  assert.deepEqual(await firstRefusal(resetSendLimits(), hit), refusedFor(DAY - 2 * HOUR));
  clock.now = 11 * DAY;
  assert.equal(await passes(resetSendLimits(), hit, 50), 20);
});

test("the first hour of a UTC day counts right: hour and day rows stay apart", async () => {
  // 10 * DAY is midnight UTC, where both windows start at the same second.
  const clock = { now: 10 * DAY + 60 };
  const { hit } = fakeLimiter(clock);
  assert.equal(await passes(resetAddressLimits("abc"), hit, 10), 3);
  assert.equal(await passes(resetSendLimits(), hit, 50), 20);
});

test("the sign-in note: once a day per address, and a repeat never counts against the reset emails", async () => {
  const clock = { now: 10 * DAY + 60 };
  const { hit, asked } = fakeLimiter(clock);
  // The order the route asks in: the note's own limit, then the reset emails.
  const limits = (emailKey: string) => [resetHintLimit(emailKey), ...resetSendLimits()];

  assert.equal(await firstRefusal(limits("abc"), hit), null);
  // Four more requests the same day (more than the per-address 3): refused
  // by the note's own limit, so the reset emails are not asked again.
  assert.equal(await passes(limits("abc"), hit, 4), 0);
  assert.deepEqual(await firstRefusal(limits("abc"), hit), refusedFor(DAY - 60));
  assert.equal(asked.filter((key) => key === "pw-reset-global-hour").length, 1);
  assert.equal(asked.filter((key) => key === "pw-reset-global-day").length, 1);

  // Another address is not affected; the next day is fresh.
  assert.equal(await firstRefusal(limits("other"), hit), null);
  clock.now = 11 * DAY;
  assert.equal(await firstRefusal(limits("abc"), hit), null);
});

test("the sign-in note comes out of the reset emails: a spent budget sends none", async () => {
  const clock = { now: 10 * DAY };
  const { hit } = fakeLimiter(clock);
  assert.equal(await passes(resetSendLimits(), hit, 20), 20);
  assert.deepEqual(await firstRefusal([resetHintLimit("abc"), ...resetSendLimits()], hit), refusedFor(HOUR));
});

// ── The forgot-password page's line, from the route's 429 ───────────────────

/** What the page shows for a refusal: the route's 429 (its code and Retry-After) through the page's copy. */
function pageLine(answer: import("./password-reset-limits").ResetLimitResult): string | null {
  const body = { ok: false, code: resetRefusalCode(answer), error: "Too many requests. Try again shortly." };
  return resetRequestError(429, String(Math.max(1, answer.retryAfterSec)), body);
}

test("the page: a spent per-network count says the minutes left, never 'not available'", async () => {
  // 8 minutes into a quarter hour: 7 left.
  const clock = { now: 10 * DAY + 8 * 60 };
  const { hit } = fakeLimiter(clock);
  const limits = [resetNetworkLimit("code-a")];
  assert.equal(await passes(limits, hit, 5), 5);
  const sixth = await firstRefusal(limits, hit);
  assert.ok(sixth);
  assert.equal(pageLine(sixth), "Too many reset requests. Try again in 7 minutes.");
});

test("the page: an address's 4th request is told the day's wait, and late in the UTC day the minutes left", async () => {
  const clock = { now: 10 * DAY + 14 * HOUR + 5 * 60 };
  const { hit } = fakeLimiter(clock);
  const limits = resetAddressLimits("abc");
  assert.equal(await passes(limits, hit, 3), 3);
  const fourth = await firstRefusal(limits, hit);
  assert.ok(fourth);
  assert.equal(pageLine(fourth), "Too many reset requests. Try again in 24 hours.");

  clock.now = 10 * DAY + 23 * HOUR + 50 * 60;
  const late = await firstRefusal(limits, hit);
  assert.ok(late);
  assert.equal(pageLine(late), "Too many reset requests. Try again in 10 minutes.");
});

test("the page: a limiter that couldn't count says so, whatever its retry", async () => {
  const { hit } = fakeLimiter({ now: 10 * DAY });
  const noCode = await firstRefusal([resetNetworkLimit(null)], hit);
  assert.ok(noCode);
  assert.equal(resetRefusalCode(noCode), "limiter_unavailable");
  assert.equal(pageLine(noCode), UNAVAILABLE_COPY);
  assert.equal(resetRefusalCode(refusedFor(60)), "rate_limited");
});

test("the page: whole minutes rounded up, one is 'a minute'; an answer with no code keeps the old reading", () => {
  const line = (retry: string, code?: string) => resetRequestError(429, retry, { ok: false, ...(code ? { code } : {}) });
  assert.equal(line("61", "rate_limited"), "Too many reset requests. Try again in 2 minutes.");
  assert.equal(line("30", "rate_limited"), "Too many reset requests. Try again in a minute.");
  assert.equal(line("420"), UNAVAILABLE_COPY);
  assert.equal(line("1200"), "Too many reset requests. Try again in 20 minutes.");
  assert.equal(resetRequestError(200, null, { ok: true }), null);
});
