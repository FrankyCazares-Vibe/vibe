/**
 * Tests for `password-reset-limits.ts`, the limits on the forgot-password
 * route (src/app/api/auth/password-reset/route.ts).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/auth/password-reset-limits.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the pattern of `password-rules.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./password-reset-limits.ts";
const {
  RESET_EMAILS_PER_DAY,
  RESET_EMAILS_PER_HOUR,
  RESET_NETWORK_WINDOW_SEC,
  RESET_REQUESTS_PER_ADDRESS_PER_DAY,
  RESET_REQUESTS_PER_ADDRESS_PER_HOUR,
  RESET_REQUESTS_PER_NETWORK,
  firstRefusal,
  resetAddressLimits,
  resetNetworkLimit,
  resetSendLimits,
} = (await import(specifier)) as typeof import("./password-reset-limits");

type Limit = import("./password-reset-limits").ResetLimit;

const HOUR = 3600;
const DAY = 86_400;

/**
 * The limiter as the database runs it (`rate_limit_hit`): one count per key
 * and window start, every ask counts, allowed while the count is within the
 * limit. `clock.now` is seconds since the epoch.
 */
function fakeLimiter(clock: { now: number }) {
  const counts = new Map<string, number>();
  const asked: string[] = [];
  const hit = async (limit: Limit) => {
    asked.push(limit.key);
    const windowStart = Math.floor(clock.now / limit.windowSec) * limit.windowSec;
    const row = `${limit.key}|${windowStart}`;
    const count = (counts.get(row) ?? 0) + 1;
    counts.set(row, count);
    const allowed = count <= limit.limit;
    return { allowed, retryAfterSec: allowed ? 0 : limit.windowSec };
  };
  return { hit, asked };
}

/** How many of `tries` asks get through, all at the clock's current time. */
async function passes(limits: Limit[], hit: (l: Limit) => Promise<{ allowed: boolean; retryAfterSec: number }>, tries: number) {
  let through = 0;
  for (let i = 0; i < tries; i += 1) {
    if ((await firstRefusal(limits, hit)) === null) through += 1;
  }
  return through;
}

test("the numbers are exact", () => {
  assert.equal(RESET_REQUESTS_PER_NETWORK, 5);
  assert.equal(RESET_NETWORK_WINDOW_SEC, 900);
  assert.equal(RESET_REQUESTS_PER_ADDRESS_PER_HOUR, 3);
  assert.equal(RESET_REQUESTS_PER_ADDRESS_PER_DAY, 5);
  assert.equal(RESET_EMAILS_PER_HOUR, 20);
  assert.equal(RESET_EMAILS_PER_DAY, 40);
});

test("per network: 5 per 15 minutes on the network bucket, refusing when the limiter is down", () => {
  assert.deepEqual(resetNetworkLimit("2001:db8:1:2::/64"), {
    key: "pw-reset-net:2001:db8:1:2::/64",
    limit: 5,
    windowSec: 900,
    failClosed: true,
  });
});

test("per address: 3 an hour then 5 a day, on the hash and on two different keys", () => {
  assert.deepEqual(resetAddressLimits("abc123"), [
    { key: "pw-reset-email:abc123", limit: 3, windowSec: HOUR, failClosed: false },
    { key: "pw-reset-email-day:abc123", limit: 5, windowSec: DAY, failClosed: false },
  ]);
});

test("reset emails as a whole: 20 an hour then 40 a day, refusing when the limiter is down", () => {
  assert.deepEqual(resetSendLimits(), [
    { key: "pw-reset-global-hour", limit: 20, windowSec: HOUR, failClosed: true },
    { key: "pw-reset-global-day", limit: 40, windowSec: DAY, failClosed: true },
  ]);
});

test("no two limits share a key: an hour's window and a day's start together at midnight UTC", () => {
  const keys = [resetNetworkLimit("n"), ...resetAddressLimits("n"), ...resetSendLimits()].map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length);
  // One address's hash can never be read as another limit's key.
  assert.notEqual(resetAddressLimits("day:x")[0].key, resetAddressLimits("x")[1].key);
});

test("firstRefusal: null when every limit allows, each asked once and in order", async () => {
  const { hit, asked } = fakeLimiter({ now: 10 * DAY });
  assert.equal(await firstRefusal(resetSendLimits(), hit), null);
  assert.deepEqual(asked, ["pw-reset-global-hour", "pw-reset-global-day"]);
  assert.equal(await firstRefusal([], hit), null);
});

test("firstRefusal: stops at the first refusal and hands back its answer", async () => {
  const asked: string[] = [];
  const refusal = { allowed: false, retryAfterSec: HOUR };
  const result = await firstRefusal(resetAddressLimits("abc"), async (limit) => {
    asked.push(limit.key);
    return refusal;
  });
  assert.equal(result, refusal);
  assert.deepEqual(asked, ["pw-reset-email:abc"]);
});

test("a limiter that is down and refuses (60 seconds) is a refusal like any other", async () => {
  const down = async () => ({ allowed: false, retryAfterSec: 60 });
  assert.deepEqual(await firstRefusal([resetNetworkLimit("1.2.3.4")], down), { allowed: false, retryAfterSec: 60 });
  assert.deepEqual(await firstRefusal(resetSendLimits(), down), { allowed: false, retryAfterSec: 60 });
});

test("per network: the 6th request inside 15 minutes is refused, the next window is fresh", async () => {
  const clock = { now: 10 * DAY };
  const { hit } = fakeLimiter(clock);
  const limits = [resetNetworkLimit("1.2.3.4")];
  assert.equal(await passes(limits, hit, 8), 5);
  assert.deepEqual(await firstRefusal(limits, hit), { allowed: false, retryAfterSec: 900 });
  // Another network is not affected.
  assert.equal(await firstRefusal([resetNetworkLimit("5.6.7.8")], hit), null);
  clock.now += 900;
  assert.equal(await firstRefusal(limits, hit), null);
});

test("per address: 3 an hour, 5 a day, and a try the hour refuses does not use up the day", async () => {
  const clock = { now: 10 * DAY };
  const { hit } = fakeLimiter(clock);
  const limits = resetAddressLimits("abc");

  // Hour one: 3 of 10 get through, the rest are told to wait an hour.
  assert.equal(await passes(limits, hit, 10), 3);
  assert.deepEqual(await firstRefusal(limits, hit), { allowed: false, retryAfterSec: HOUR });

  // Hour two: only 2 more, because the day is at 5. The 7 refused tries
  // above did not count toward it.
  clock.now += HOUR;
  assert.equal(await passes(limits, hit, 2), 2);
  assert.deepEqual(await firstRefusal(limits, hit), { allowed: false, retryAfterSec: DAY });

  // Later the same day: still refused, and now by the day, not the hour.
  clock.now += 5 * HOUR;
  assert.deepEqual(await firstRefusal(limits, hit), { allowed: false, retryAfterSec: DAY });

  // Another address is not affected; the next day is fresh.
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
  assert.deepEqual(await firstRefusal(resetSendLimits(), hit), { allowed: false, retryAfterSec: DAY });
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
