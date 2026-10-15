/**
 * The limiter core (src/lib/rate-limit.ts), limits plan Wave 1 (B1.4): the
 * time actually left as the retry, the deny cache, `failLocal`, the breaker,
 * its timeout and which database answers trip it (`toLimiterHit`), the
 * `reason` on every answer, the per-purpose network
 * code, and the rule that every window divides the day. No database: each
 * test builds its own limiter (`createRateLimiter`) around a stand-in for
 * `rate_limit_hit` and a clock it moves by hand.
 *
 * Run with:
 *   node --test src/lib/rate-limit.test.ts
 *
 * WHY THE RESOLVE HOOK: rate-limit.ts imports "server-only" and the service
 * client; each resolves to a small data: module (the service one throws, so
 * the default limiter's wiring can be checked without a database).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { LimiterHit, RateLimitOptions, RateLimitResult } from "./rate-limit";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("rate-limit.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { throw new Error('no database in this test'); }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const specifier = "./rate-limit.ts";
const rl = (await import(specifier)) as typeof import("./rate-limit");
const codeSpecifier = "./tally/network-code.ts";
const { limiterNetworkCode } = (await import(codeSpecifier)) as typeof import("./tally/network-code");

const SECRET = "a-test-secret-that-is-long-enough";
/** 12:00:30 UTC: 30 s into a 60 s, 600 s or 3600 s window. */
const T0 = Date.UTC(2026, 9, 15, 12, 0, 30);

type Answer = () => LimiterHit | Promise<LimiterHit>;
const ALLOW: LimiterHit = { counted: true, allowed: true };
const DENY: LimiterHit = { counted: true, allowed: false };
const DOWN: LimiterHit = { counted: false, transport: true, detail: "FetchError: fetch failed" };
const BROKEN: LimiterHit = { counted: false, transport: false, detail: "Could not find the function" };

/** A limiter around a stand-in for the database, with a clock and a log the test reads. */
function setup(timeoutMs?: number) {
  const s = { t: T0, calls: [] as string[], logs: [] as string[], answer: (() => ALLOW) as Answer };
  const limit = rl.createRateLimiter({
    hit: async (call) => {
      s.calls.push(call.key);
      return s.answer();
    },
    now: () => s.t,
    log: (...parts) => s.logs.push(parts.map(String).join(" ")),
    timeoutMs,
  });
  return { s, limit };
}

const result = (allowed: boolean, retryAfterSec: number, reason: RateLimitResult["reason"]) => ({
  allowed,
  retryAfterSec,
  reason,
});

test("networkBucket: IPv4 as is, IPv6 as its /64, mapped IPv4 as IPv4, junk unchanged", () => {
  const table: [string, string][] = [
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::ffff:cb00:7107", "203.0.113.7"],
    ["2001:db8:85a3:1234:aaaa:bbbb:cccc:dddd", "2001:db8:85a3:1234::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["2001:DB8:85A3:1234::9", "2001:db8:85a3:1234::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["[2001:db8:85a3:1234::9]", "2001:db8:85a3:1234::/64"],
    ["[2001:db8:85a3:1234::9]:443", "2001:db8:85a3:1234::/64"],
    ["unknown", "unknown"],
    ["not:an:address", "not:an:address"],
    ["1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8:9"],
    ["::ffff:300.1.1.1", "::ffff:300.1.1.1"],
  ];
  for (const [ip, bucket] of table) assert.equal(rl.networkBucket(ip), bucket, ip);
});

test("clientNetworkCode: the network's code for this purpose and day, never the address", (t) => {
  const before = process.env.SCHOOL_EMAIL_VERIFY_SECRET;
  t.after(() => {
    if (before === undefined) delete process.env.SCHOOL_EMAIL_VERIFY_SECRET;
    else process.env.SCHOOL_EMAIL_VERIFY_SECRET = before;
  });
  process.env.SCHOOL_EMAIL_VERIFY_SECRET = SECRET;
  const now = new Date(T0);
  const req = (ip: string) => new Request("https://example.test/", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
  const code = rl.clientNetworkCode(req("2001:db8:85a3:1234:aaaa::1"), "pw-reset-ip", now);
  assert.equal(code, limiterNetworkCode("pw-reset-ip", "2001:db8:85a3:1234::/64", "2026-10-15", SECRET));
  assert.match(code ?? "", /^[0-9a-f]{32}$/);
  // Another address in the same /64 is the same network.
  assert.equal(rl.clientNetworkCode(req("2001:db8:85a3:1234:ffff::2"), "pw-reset-ip", now), code);
  assert.notEqual(rl.clientNetworkCode(req("2001:db8:85a3:1234:aaaa::1"), "waitlist-ip", now), code);
  assert.notEqual(rl.clientNetworkCode(req("2001:db8:85a3:1234:aaaa::1"), "pw-reset-ip", new Date(T0 + 86_400_000)), code);
  const v4 = rl.clientNetworkCode(req("203.0.113.7"), "pw-reset-ip", now);
  assert.ok(v4 && !v4.includes("203.0.113"));
  assert.equal(rl.clientNetworkCode(req("203.0.113.7"), "Bad Purpose", now), null);
  process.env.SCHOOL_EMAIL_VERIFY_SECRET = "too-short";
  assert.equal(rl.clientNetworkCode(req("203.0.113.7"), "pw-reset-ip", now), null);
  delete process.env.SCHOOL_EMAIL_VERIFY_SECRET;
  assert.equal(rl.clientNetworkCode(req("203.0.113.7"), "pw-reset-ip", now), null);
});

test("isDayAlignedWindow: whole seconds that divide the day, a day at most", () => {
  for (const ok of [1, 60, 300, 600, 900, 3600, 21_600, 43_200, 86_400]) assert.ok(rl.isDayAlignedWindow(ok), String(ok));
  for (const bad of [0, -60, 7000, 1.5, 172_800, 604_800, Number.NaN]) assert.ok(!rl.isDayAlignedWindow(bad), String(bad));
});

test("secondsLeftInWindow: the time actually left, 1 at the last second, never 0", () => {
  assert.equal(rl.secondsLeftInWindow(T0, 600), 570);
  assert.equal(rl.secondsLeftInWindow(T0, 3600), 3570);
  assert.equal(rl.secondsLeftInWindow(T0, 86_400), 43_170);
  assert.equal(rl.secondsLeftInWindow(Date.UTC(2026, 9, 15, 12, 0, 0), 600), 600);
  assert.equal(rl.secondsLeftInWindow(Date.UTC(2026, 9, 15, 12, 9, 59, 999), 600), 1);
});

test("isTransportFailure: no answer and gateway errors, not the database's own errors", () => {
  for (const s of [0, 502, 503, 504, 520, 522, 524]) assert.ok(rl.isTransportFailure(s), String(s));
  for (const s of [200, 400, 401, 403, 404, 409, 429, 500]) assert.ok(!rl.isTransportFailure(s), String(s));
});

test("toLimiterHit: only no answer or a gateway is a transport failure; true allows, anything else refuses", () => {
  const ok = (data: unknown) => rl.toLimiterHit({ data, error: null, status: 200 });
  assert.deepEqual(ok(true), { counted: true, allowed: true });
  assert.deepEqual(ok(false), { counted: true, allowed: false });
  assert.deepEqual(ok(null), { counted: true, allowed: false });
  const failed = (status: number, message: string) => rl.toLimiterHit({ data: null, error: { message }, status });
  // A fetch error or our abort (postgrest-js answers status 0), and a gateway.
  assert.deepEqual(failed(0, "TypeError: fetch failed"), { counted: false, transport: true, detail: "TypeError: fetch failed" });
  assert.deepEqual(failed(503, "Service Unavailable"), { counted: false, transport: true, detail: "Service Unavailable" });
  // The database's own answers: a missing function (PGRST202) and a statement timeout (57014).
  assert.deepEqual(failed(404, "Could not find the function public.rate_limit_hit"), {
    counted: false,
    transport: false,
    detail: "Could not find the function public.rate_limit_hit",
  });
  assert.deepEqual(failed(500, "canceling statement due to statement timeout"), {
    counted: false,
    transport: false,
    detail: "canceling statement due to statement timeout",
  });
});

const PER_10_MIN: RateLimitOptions = { limit: 2, windowSec: 600 };

test("a refusal retries when the window actually ends, with reason 'limited'", async () => {
  const { s, limit } = setup();
  s.answer = () => DENY;
  assert.deepEqual(await limit("k", PER_10_MIN), result(false, 570, "limited"));
  const fresh = setup();
  fresh.s.t = Date.UTC(2026, 9, 15, 12, 9, 59, 500);
  fresh.s.answer = () => DENY;
  assert.deepEqual(await fresh.limit("k", PER_10_MIN), result(false, 1, "limited"));
});

test("counted and allowed: reason null", async () => {
  const { limit } = setup();
  assert.deepEqual(await limit("k", PER_10_MIN), result(true, 0, null));
});

test("deny cache: once the database says no, the same (key, limit, window) is refused here until the window ends", async () => {
  const { s, limit } = setup();
  s.answer = () => DENY;
  await limit("k", PER_10_MIN);
  s.t += 10_000;
  assert.deepEqual(await limit("k", PER_10_MIN), result(false, 560, "limited"));
  assert.equal(s.calls.length, 1, "the second ask never reached the database");
  // Another limit or window on the same key is another question.
  await limit("k", { limit: 3, windowSec: 600 });
  await limit("k", { limit: 2, windowSec: 3600 });
  assert.equal(s.calls.length, 3);
  // At the window's end the database is asked again.
  s.t = Date.UTC(2026, 9, 15, 12, 10, 0);
  s.answer = () => ALLOW;
  assert.deepEqual(await limit("k", PER_10_MIN), result(true, 0, null));
  assert.equal(s.calls.length, 4);
});

test("deny cache: not near a window's start (clock skew), and not across a window's edge", async () => {
  const early = setup();
  early.s.t = Date.UTC(2026, 9, 15, 12, 10, 1);
  early.s.answer = () => DENY;
  await early.limit("k", PER_10_MIN);
  await early.limit("k", PER_10_MIN);
  assert.equal(early.s.calls.length, 2, "a refusal 1 s into the window isn't cached");

  const edge = setup();
  edge.s.t = Date.UTC(2026, 9, 15, 12, 9, 59, 800);
  edge.s.answer = () => {
    edge.s.t += 400; // the answer comes back in the next window
    return DENY;
  };
  assert.deepEqual(await edge.limit("k", PER_10_MIN), result(false, 1, "limited"));
  edge.s.answer = () => ALLOW;
  assert.deepEqual(await edge.limit("k", PER_10_MIN), result(true, 0, null));
});

test("deny cache: capped at 5,000, the oldest going first", async () => {
  const { s, limit } = setup();
  s.answer = () => DENY;
  for (let i = 0; i <= 5000; i += 1) await limit(`k${i}`, PER_10_MIN);
  assert.equal(s.calls.length, 5001);
  await limit("k5000", PER_10_MIN);
  assert.equal(s.calls.length, 5001, "the newest is still cached");
  await limit("k0", PER_10_MIN);
  assert.equal(s.calls.length, 5002, "the oldest was let go, so the database is asked");
});

test("database down: default lets through, failClosed refuses for 60 s, both 'unavailable'", async () => {
  const { s, limit } = setup();
  s.answer = () => BROKEN;
  assert.deepEqual(await limit("k", PER_10_MIN), result(true, 0, "unavailable"));
  assert.deepEqual(await limit("k", { ...PER_10_MIN, failClosed: true }), result(false, 60, "unavailable"));
  assert.deepEqual(await limit("k", { ...PER_10_MIN, failClosed: true, failLocal: true }), result(false, 60, "unavailable"));
  assert.ok(s.logs.every((line) => line.startsWith("[rate-limit] rpc failed")));
});

test("failLocal: counts in memory on the same key, limit and window, and starts over when the window ends", async () => {
  const { s, limit } = setup();
  s.answer = () => BROKEN;
  const opts = { ...PER_10_MIN, failLocal: true };
  assert.deepEqual(await limit("k", opts), result(true, 0, "unavailable"));
  assert.deepEqual(await limit("k", opts), result(true, 0, "unavailable"));
  assert.deepEqual(await limit("k", opts), result(false, 570, "limited"));
  assert.deepEqual(await limit("other", opts), result(true, 0, "unavailable"), "another key, another count");
  assert.equal(s.calls.length, 4, "the database is still asked each time");
  s.t = Date.UTC(2026, 9, 15, 12, 10, 0);
  assert.deepEqual(await limit("k", opts), result(true, 0, "unavailable"));
});

test("breaker: 3 transport failures in 10 s skip the database for 15 s, with one log line and no key", async () => {
  const { s, limit } = setup();
  s.answer = () => DOWN;
  const closed = { ...PER_10_MIN, failClosed: true };
  for (let i = 0; i < 3; i += 1) {
    await limit("secret-key", closed);
    s.t += 1000;
  }
  const trips = s.logs.filter((line) => line.includes("breaker open"));
  assert.equal(trips.length, 1);
  assert.ok(!trips[0].includes("secret-key"));
  // Open: every limiter takes its failure path at once, without asking.
  assert.deepEqual(await limit("secret-key", closed), result(false, 60, "unavailable"));
  assert.deepEqual(await limit("x", PER_10_MIN), result(true, 0, "unavailable"));
  const local = { ...PER_10_MIN, failLocal: true };
  await limit("y", local);
  await limit("y", local);
  assert.deepEqual(await limit("y", local), result(false, 567, "limited"), "failLocal still counts while it's open");
  assert.equal(s.calls.length, 3);
  // 15 s after the trip (the third failure, at 12:00:32) it asks again.
  s.t += 13_999;
  await limit("x", PER_10_MIN);
  assert.equal(s.calls.length, 3, "still open 1 ms before");
  s.t += 1;
  s.answer = () => ALLOW;
  assert.deepEqual(await limit("x", PER_10_MIN), result(true, 0, null));
  assert.equal(s.calls.length, 4);
});

test("breaker: the database's own errors, hot keys, slow trickles and a success between never trip it", async () => {
  const cases: [string, (s: ReturnType<typeof setup>["s"], i: number) => void, RateLimitOptions][] = [
    ["database errors", (s) => (s.answer = () => BROKEN), PER_10_MIN],
    ["a hot key", (s) => (s.answer = () => DOWN), { ...PER_10_MIN, hotKey: true }],
    ["one every 6 s", (s) => ((s.answer = () => DOWN), (s.t += 6000)), PER_10_MIN],
    ["a success between", (s, i) => (s.answer = () => (i === 2 ? ALLOW : DOWN)), PER_10_MIN],
  ];
  for (const [name, step, opts] of cases) {
    const { s, limit } = setup();
    for (let i = 0; i < 5; i += 1) {
      step(s, i);
      await limit("k", opts);
    }
    assert.equal(s.calls.length, 5, name);
    assert.ok(!s.logs.some((line) => line.includes("breaker open")), name);
  }
});

// Its own timeout: the runner has none (`--test-timeout=0`), so without the
// race in rate-limit.ts this would hang `npm test` instead of failing it.
test("timeout: a database call that hangs is cut off, aborted, and counts toward the breaker", { timeout: 2000 }, async () => {
  const { s } = setup();
  const signals: AbortSignal[] = [];
  const hanging = rl.createRateLimiter({
    hit: (call) => {
      signals.push(call.signal);
      s.calls.push(call.key);
      return new Promise<LimiterHit>(() => {});
    },
    now: () => s.t,
    log: (...parts) => s.logs.push(parts.map(String).join(" ")),
    timeoutMs: 20,
  });
  const closed = { ...PER_10_MIN, failClosed: true };
  assert.deepEqual(await hanging("k", closed), result(false, 60, "unavailable"));
  assert.ok(signals[0].aborted);
  await hanging("k", closed);
  await hanging("k", closed);
  assert.equal(s.logs.filter((line) => line.includes("breaker open")).length, 1);
  await hanging("k", closed);
  assert.equal(s.calls.length, 3);
});

test("no key (no network code): the failure path, without asking the database or counting", async () => {
  const { s, limit } = setup();
  assert.deepEqual(await limit(null, PER_10_MIN), result(true, 0, "unavailable"));
  assert.deepEqual(await limit(null, { ...PER_10_MIN, failClosed: true }), result(false, 60, "unavailable"));
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await limit(null, { ...PER_10_MIN, failLocal: true }), result(true, 0, "unavailable"));
  }
  assert.equal(s.calls.length, 0);
});

test("a window that doesn't divide the day is never counted, and is logged once", async () => {
  const { s, limit } = setup();
  for (const windowSec of [7 * 86_400, 7000, 0]) {
    assert.deepEqual(await limit("k", { limit: 5, windowSec }), result(true, 0, "unavailable"));
    assert.deepEqual(await limit("k", { limit: 5, windowSec, failClosed: true }), result(false, 60, "unavailable"));
  }
  assert.equal(s.calls.length, 0);
  assert.equal(s.logs.length, 3);
});

test("rateLimit (this server's limiter): fails the old way when the database can't be reached", async (t) => {
  t.mock.method(console, "error", () => {});
  assert.deepEqual(await rl.rateLimit("k", PER_10_MIN), result(true, 0, "unavailable"));
  assert.deepEqual(await rl.rateLimit("k", { ...PER_10_MIN, failClosed: true }), result(false, 60, "unavailable"));
});

/**
 * Every `windowSec` in src/ (tests aside: they pass bad ones on purpose)
 * must divide the day. A value is a number (`600`, `86_400`, `60 * 60`), a
 * constant of one defined in the same file, or another object's
 * `.windowSec` passed along (its own literal is scanned where it's written).
 * Anything else fails here, so a new limiter can't slip past the rule.
 */
test("source scan: every windowSec in src/ divides 86,400 and is at most a day", () => {
  const srcDir = fileURLToPath(SRC_ROOT);
  const files = (readdirSync(srcDir, { recursive: true }) as string[]).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const numeric = (expr: string): number | null => {
    if (!/^[\d_]+(\s*\*\s*[\d_]+)*$/.test(expr)) return null;
    return expr.split("*").reduce((product, part) => product * Number(part.trim().replace(/_/g, "")), 1);
  };
  const seen: string[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(`${srcDir}${file}`, "utf8");
    if (!text.includes("windowSec")) continue;
    for (const match of text.matchAll(/\bwindowSec\s*:\s*([^,}\n;)]+)/g)) {
      const expr = match[1].trim();
      if (/^number\b/.test(expr) || /\.windowSec$/.test(expr)) continue;
      const line = text.slice(0, match.index).split("\n").length;
      let value = numeric(expr);
      if (value === null && /^[A-Z][A-Z0-9_]*$/.test(expr)) {
        const def = text.match(new RegExp(`\\bconst ${expr}\\s*=\\s*([^;\\n]+);`));
        value = def ? numeric(def[1].trim()) : null;
      }
      seen.push(`${file}:${line}`);
      if (value === null) problems.push(`${file}:${line} windowSec: ${expr} (not a number or a same-file constant)`);
      else if (!rl.isDayAlignedWindow(value)) problems.push(`${file}:${line} windowSec: ${expr} = ${value}`);
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(seen.length >= 50, `found only ${seen.length} windows; is the scan still reading src/?`);
});
