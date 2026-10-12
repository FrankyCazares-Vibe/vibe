import assert from "node:assert/strict";
import test from "node:test";

// The house pattern (open.test.ts): `node --test` needs the .ts ending, the
// typecheck refuses one in a static import.
const specifier = "./network-code.ts";
const { networkDayCode, utcDay } = (await import(specifier)) as typeof import("./network-code");

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
