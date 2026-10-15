import assert from "node:assert/strict";
import test from "node:test";

// The house pattern (open.test.ts): `node --test` needs the .ts ending, the
// typecheck refuses one in a static import.
const specifier = "./network-code.ts";
const { limiterNetworkCode, networkDayCode, utcDay } = (await import(specifier)) as typeof import("./network-code");

const SECRET = "a-test-secret-that-is-long-enough";

test("networkDayCode: never holds the network it was made from", () => {
  for (const network of ["203.0.113.7", "2001:db8:85a3:1234", "unknown"]) {
    const code = networkDayCode(network, "2026-10-12", SECRET);
    assert.ok(code);
    assert.match(code, /^[0-9a-f]{32}$/);
    assert.ok(!code.includes(network));
  }
});

test("networkDayCode: the same network on the same day is the same code", () => {
  assert.equal(
    networkDayCode("203.0.113.7", "2026-10-12", SECRET),
    networkDayCode("203.0.113.7", "2026-10-12", SECRET),
  );
});

test("networkDayCode: another network, another day or another secret is another code", () => {
  const base = networkDayCode("203.0.113.7", "2026-10-12", SECRET);
  assert.notEqual(networkDayCode("203.0.113.8", "2026-10-12", SECRET), base);
  assert.notEqual(networkDayCode("203.0.113.7", "2026-10-13", SECRET), base);
  assert.notEqual(networkDayCode("203.0.113.7", "2026-10-12", `${SECRET}!`), base);
});

test("networkDayCode: no secret, a short secret or no network gives no code, never the address", () => {
  assert.equal(networkDayCode("203.0.113.7", "2026-10-12", undefined), null);
  assert.equal(networkDayCode("203.0.113.7", "2026-10-12", null), null);
  assert.equal(networkDayCode("203.0.113.7", "2026-10-12", "   "), null);
  assert.equal(networkDayCode("203.0.113.7", "2026-10-12", "too-short"), null);
  assert.equal(networkDayCode("", "2026-10-12", SECRET), null);
  assert.equal(networkDayCode("203.0.113.7", "", SECRET), null);
});

test("networkDayCode: the secret's surrounding spaces don't change the code", () => {
  assert.equal(
    networkDayCode("203.0.113.7", "2026-10-12", `  ${SECRET}\n`),
    networkDayCode("203.0.113.7", "2026-10-12", SECRET),
  );
});

test("utcDay: the UTC date, whatever the server's own time zone", () => {
  assert.equal(utcDay(new Date("2026-10-12T23:59:59.999Z")), "2026-10-12");
  assert.equal(utcDay(new Date("2026-10-13T00:00:00.000Z")), "2026-10-13");
});

test("networkDayCode: pinned, so the tally's codes can't change under it", () => {
  // Worked out once (Oct 15 2026) from the label, the day and the network.
  // If this fails, every count the tally has written today stops matching.
  assert.equal(networkDayCode("203.0.113.7", "2026-10-12", SECRET), "281353c8875c23749d2397a2b9cd59a7");
  assert.equal(networkDayCode("2001:db8:85a3:1234::/64", "2026-10-12", SECRET), "4fd3fc1b3e5578b520c1ddda2c30df0b");
});

test("limiterNetworkCode: pinned, a 32-hex code that never holds the network", () => {
  const code = limiterNetworkCode("pw-reset-ip", "203.0.113.7", "2026-10-12", SECRET);
  assert.equal(code, "8ebebb7968050684aa21151763ec7197");
  for (const network of ["203.0.113.7", "2001:db8:85a3:1234::/64", "unknown"]) {
    const c = limiterNetworkCode("waitlist-ip", network, "2026-10-12", SECRET);
    assert.ok(c);
    assert.match(c, /^[0-9a-f]{32}$/);
    assert.ok(!c.includes(network));
  }
});

test("limiterNetworkCode: another purpose, network, day or secret is another code", () => {
  const base = limiterNetworkCode("pw-reset-ip", "203.0.113.7", "2026-10-12", SECRET);
  assert.notEqual(limiterNetworkCode("waitlist-ip", "203.0.113.7", "2026-10-12", SECRET), base);
  assert.notEqual(limiterNetworkCode("pw-reset-ip", "203.0.113.8", "2026-10-12", SECRET), base);
  assert.notEqual(limiterNetworkCode("pw-reset-ip", "203.0.113.7", "2026-10-13", SECRET), base);
  assert.notEqual(limiterNetworkCode("pw-reset-ip", "203.0.113.7", "2026-10-12", `${SECRET}!`), base);
  assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", "2026-10-12", `  ${SECRET}\n`), base);
});

test("limiterNetworkCode: never the tally's code for the same network and day", () => {
  // Its own label, so a limiter row can't be matched to the tally's.
  const tally = networkDayCode("203.0.113.7", "2026-10-12", SECRET);
  for (const purpose of ["tally-open-net", "tally-open", "x"]) {
    assert.notEqual(limiterNetworkCode(purpose, "203.0.113.7", "2026-10-12", SECRET), tally);
  }
});

test("limiterNetworkCode: no secret, a short secret, no network or a bad purpose or day gives no code", () => {
  const day = "2026-10-12";
  assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", day, undefined), null);
  assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", day, null), null);
  assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", day, "   "), null);
  assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", day, "too-short"), null);
  assert.equal(limiterNetworkCode("pw-reset-ip", "", day, SECRET), null);
  for (const purpose of ["", "PW-reset", "pw:reset", "pw_reset", "pw reset", "a".repeat(41)]) {
    assert.equal(limiterNetworkCode(purpose, "203.0.113.7", day, SECRET), null, purpose);
  }
  assert.ok(limiterNetworkCode("a".repeat(40), "203.0.113.7", day, SECRET));
  for (const bad of ["", "2026-10-12:1", "2026-1-12", "today"]) {
    assert.equal(limiterNetworkCode("pw-reset-ip", "203.0.113.7", bad, SECRET), null, bad);
  }
});
