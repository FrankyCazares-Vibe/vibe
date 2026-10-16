/**
 * The signed-out read cap (limits plan Wave 2, B2.3):
 * src/lib/security/anon-read-limit.ts, the two routes that call it and
 * src/proxy.ts. No database: each limiter test builds its own
 * (`createAnonReadLimiter`) around a stand-in for `rateLimit` that writes
 * down every key and option it is asked about, and a clock moved by hand.
 *
 *  1. Which pages the proxy counts (any method but OPTIONS: Next renders
 *     them for a POST as for a GET).
 *  2. The order: the ceiling this server knows is spent, then the network's
 *     hour, its day, on IPv6 its /48's hour, then the ceiling in the
 *     database. A refusal stops there.
 *  3. An hour and a day only, and the numbers; each pot has its own keys.
 *  4. No key and no log line holds an address, a handle or a code's input.
 *  5. No code: only the ceiling. Fails open, even when the limiter throws.
 *  6. The two 429s: Retry-After, no-store, a body that depends on nothing
 *     looked up; the screens show the line with Sign in (failure-copy.ts).
 *  7. Source: the proxy's matcher is unchanged and it counts only signed-out
 *     reads of the three pages, after updateSession, and refuses with the
 *     page; both routes count only signed out, after getUser and before the
 *     handle is looked up.
 *
 * Run with:
 *   node --test src/lib/security/anon-read-limit.test.ts
 *
 * WHY THE RESOLVE HOOK: the limiter imports "server-only" and, through
 * src/lib/rate-limit.ts, the service client; each resolves to a small data:
 * module (the service one throws: nothing here may reach a database).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { RateLimitOptions, RateLimitResult } from "../rate-limit";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("anon-read-limit.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
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

const specifier = "./anon-read-limit.ts";
const anon = (await import(specifier)) as typeof import("./anon-read-limit");
const rlSpecifier = "../rate-limit.ts";
const rl = (await import(rlSpecifier)) as typeof import("../rate-limit");
const copySpecifier = "../feedback/failure-copy.ts";
const { describeFailure } = (await import(copySpecifier)) as typeof import("../feedback/failure-copy");
const codeSpecifier = "../tally/network-code.ts";
const { networkDayCode, utcDay } = (await import(codeSpecifier)) as typeof import("../tally/network-code");

const CODE = "0123456789abcdef0123456789abcdef";
/** 12:00:30 UTC: 30 s into an hour. */
const T0 = Date.UTC(2026, 9, 15, 12, 0, 30);
const COUNTED: RateLimitResult = { allowed: true, retryAfterSec: 0, reason: null };
const limited = (retryAfterSec: number): RateLimitResult => ({ allowed: false, retryAfterSec, reason: "limited" });

type Which = "hour" | "day" | "wide" | "all";
type Call = { key: string | null; opts: RateLimitOptions };

/** Which of the keys a call is about, from its shape. */
function which(key: string | null): Which {
  if (key?.endsWith("-all")) return "all";
  if (key?.includes("-wide:")) return "wide";
  return key?.includes("-day:") ? "day" : "hour";
}

/** A stand-in for `rateLimit`: notes each call and answers per key, COUNTED unless told otherwise. */
function recorder(answers: Partial<Record<Which, RateLimitResult | (() => RateLimitResult)>> = {}) {
  const calls: Call[] = [];
  const limit = async (key: string | null, opts: RateLimitOptions): Promise<RateLimitResult> => {
    calls.push({ key, opts });
    const answer = answers[which(key)];
    return typeof answer === "function" ? answer() : (answer ?? COUNTED);
  };
  return { calls, limit };
}

/** A limiter with a fixed code (and /48 code: none, as on IPv4), a clock that moves only by hand, and its log kept. */
function makeLimiter(r: ReturnType<typeof recorder>, code: string | null = CODE, wideCode: string | null = null) {
  let t = T0;
  const lines: string[] = [];
  const check = anon.createAnonReadLimiter({
    limit: r.limit,
    networkCode: () => code,
    wideNetworkCode: () => wideCode,
    now: () => t,
    log: (line) => lines.push(line),
  });
  return { check, lines, advance: (ms: number) => (t += ms) };
}

const req = (headers: Record<string, string> = {}) => new Request("https://connectvibe.app/profile/someone", { headers });

// ── 1. Which pages the proxy counts ─────────────────────────────────────────

test("the proxy counts any signed-out read of one profile, club or post page (every method but OPTIONS), and nothing else", () => {
  const cases: Array<[string, string, boolean]> = [
    ["/profile/sae_frank", "GET", true],
    ["/profile/sae_frank", "HEAD", true],
    ["/orgs/sae", "GET", true],
    ["/posts/2b0c7a52-3c1e-4c55-9d6e-3f1a2b4c5d6e", "GET", true],
    // Next renders the page for these too: same preview card, same 404.
    ["/profile/sae_frank", "POST", true],
    ["/profile/sae_frank", "PUT", true],
    ["/profile/sae_frank", "PATCH", true],
    ["/profile/sae_frank", "DELETE", true],
    ["/orgs/sae", "POST", true],
    ["/posts/2b0c7a52-3c1e-4c55-9d6e-3f1a2b4c5d6e", "POST", true],
    ["/profile/sae_frank", "OPTIONS", false],
    ["/profile/sae_frank/", "POST", false],
    ["/profile", "GET", false],
    ["/profile/", "GET", false],
    ["/profile/sae_frank/", "GET", false],
    ["/profile/sae_frank/extra", "GET", false],
    ["/orgs", "GET", false],
    ["/posts", "GET", false],
    ["/profiles/sae_frank", "GET", false],
    ["/x/profile/sae_frank", "GET", false],
    ["/api/users/sae_frank/bootstrap", "GET", false],
    ["/html/profile.html", "GET", false],
    ["/campus", "GET", false],
  ];
  for (const [path, method, counted] of cases) {
    assert.equal(anon.isSignedOutReadPage(path, method), counted, `${method} ${path}`);
  }
});

// ── 2 and 3. The order, the windows, the numbers, the pots ──────────────────

test("one read: the network's hour, then its day, then the ceiling, an hour and a day only", async () => {
  const r = recorder();
  const { check } = makeLimiter(r);
  assert.deepEqual(await check(req(), "profile"), COUNTED);
  assert.deepEqual(r.calls, [
    { key: `anon-read-profile:${CODE}`, opts: { limit: 300, windowSec: 3600 } },
    { key: `anon-read-profile-day:${CODE}`, opts: { limit: 1500, windowSec: 86_400 } },
    { key: "anon-read-profile-all", opts: { limit: 9000, windowSec: 3600, hotKey: true } },
  ]);
});

test("each pot has keys of its own, so a profile view is one count in each pot it touches", async () => {
  const r = recorder();
  const { check } = makeLimiter(r);
  for (const kind of ["page", "profile", "grid"] as const) await check(req(), kind);
  const keys = r.calls.map((c) => c.key);
  assert.equal(new Set(keys).size, 9);
  for (const kind of ["page", "profile", "grid"]) {
    assert.equal(keys.filter((k) => k?.startsWith(`anon-read-${kind}`)).length, 3, kind);
  }
  assert.ok(r.calls.every((c) => c.opts.windowSec === 3600 || c.opts.windowSec === 86_400));
});

test("past the network's hour: refused there, with its retry; the day and the ceiling are not asked", async () => {
  const r = recorder({ hour: limited(1200) });
  const { check, lines } = makeLimiter(r);
  assert.deepEqual(await check(req(), "page"), limited(1200));
  assert.equal(r.calls.length, 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[anon-read\] page: one network passed its 300 for this hour: a read was refused$/);
});

test("past the network's day: refused there; the ceiling is not asked, so one network can't spend it", async () => {
  const r = recorder({ day: limited(40_000) });
  const { check } = makeLimiter(r);
  assert.deepEqual(await check(req(), "grid"), limited(40_000));
  assert.deepEqual(r.calls.map((c) => which(c.key)), ["hour", "day"]);
});

const WIDE = "fedcba9876543210fedcba9876543210";

test("on IPv6 the /48 has an hour of its own, between the network's day and the ceiling", async () => {
  const r = recorder();
  const { check } = makeLimiter(r, CODE, WIDE);
  assert.deepEqual(await check(req(), "page"), COUNTED);
  assert.deepEqual(r.calls, [
    { key: `anon-read-page:${CODE}`, opts: { limit: 300, windowSec: 3600 } },
    { key: `anon-read-page-day:${CODE}`, opts: { limit: 1500, windowSec: 86_400 } },
    { key: `anon-read-page-wide:${WIDE}`, opts: { limit: 1500, windowSec: 3600 } },
    { key: "anon-read-page-all", opts: { limit: 9000, windowSec: 3600, hotKey: true } },
  ]);
  // It takes six /48s to reach the ceiling.
  assert.equal(anon.ANON_READS_ALL_NETWORKS_PER_HOUR / anon.ANON_READS_PER_WIDE_NETWORK_PER_HOUR, 6);
});

test("past the /48's hour: refused there, so its many /64s can't spend the ceiling", async () => {
  const r = recorder({ wide: limited(900) });
  const { check, lines } = makeLimiter(r, CODE, WIDE);
  assert.deepEqual(await check(req(), "profile"), limited(900));
  assert.deepEqual(r.calls.map((c) => which(c.key)), ["hour", "day", "wide"]);
  assert.match(lines[0] ?? "", /^\[anon-read\] profile: one IPv6 \/48 passed its 1500 for this hour: a read was refused$/);
});

test("a spent ceiling is refused on this server with no database call until its hour ends", async () => {
  const r = recorder({ all: limited(600) });
  const { check, lines, advance } = makeLimiter(r);
  assert.deepEqual(await check(req(), "page"), limited(600));
  assert.equal(r.calls.length, 3);

  advance(1000);
  assert.deepEqual(await check(req(), "page"), limited(599));
  assert.equal(r.calls.length, 3, "no call at all: not the network's keys, not the ceiling");

  // Another pot still asks: its ceiling is its own.
  await check(req(), "grid");
  assert.equal(r.calls.length, 6);

  // One note per pot; the page's second refusal is held for a minute, then
  // the next line says how many.
  assert.equal(lines.length, 2);
  advance(60_000);
  await check(req(), "page");
  assert.match(lines.at(-1) ?? "", /all networks together passed 9000 this hour .*: 2 reads were refused$/);

  advance(600_000);
  r.calls.length = 0;
  await check(req(), "page");
  assert.equal(r.calls.length, 3, "the hour is over: the database is asked again");
});

// ── 5. No code, failures ────────────────────────────────────────────────────

test("no network code (no secret): only the ceiling is counted, and that is said once", async () => {
  const r = recorder();
  const { check, lines } = makeLimiter(r, null);
  await check(req(), "page");
  await check(req(), "profile");
  assert.deepEqual(r.calls.map((c) => c.key), ["anon-read-page-all", "anon-read-profile-all"]);
  assert.equal(lines.filter((l) => l.includes("no network code")).length, 1);
});

test("fails open: a limiter that can't count, or throws, lets the read through", async () => {
  const unavailable: RateLimitResult = { allowed: true, retryAfterSec: 0, reason: "unavailable" };
  const sick = makeLimiter(recorder({ hour: unavailable, day: unavailable, all: unavailable }));
  assert.deepEqual(await sick.check(req(), "profile"), unavailable);

  const throwing = makeLimiter(
    recorder({
      day: () => {
        throw new TypeError("boom 203.0.113.7");
      },
    }),
  );
  assert.deepEqual(await throwing.check(req(), "profile"), unavailable);
  assert.deepEqual(throwing.lines, ["[anon-read] unexpected: TypeError"]);
});

// ── 4. No address anywhere ──────────────────────────────────────────────────

const SECRET = "a-test-secret-that-is-long-enough";

test("the production code holds no address: 32 hex, per day, its own purpose; none without a secret", () => {
  const before = process.env.SCHOOL_EMAIL_VERIFY_SECRET;
  try {
    process.env.SCHOOL_EMAIL_VERIFY_SECRET = SECRET;
    const v4 = req({ "x-forwarded-for": "203.0.113.7" });
    const v6 = req({ "x-forwarded-for": "2001:db8:1234:5678:abcd::1" });
    const day1 = new Date(T0);
    const day2 = new Date(T0 + 86_400_000);
    const code = anon.anonReadNetworkCode(v4, day1);
    assert.match(code ?? "", /^[0-9a-f]{32}$/);
    assert.notEqual(anon.anonReadNetworkCode(v6, day1), code);
    assert.notEqual(anon.anonReadNetworkCode(v4, day2), code, "a new code every day");
    assert.notEqual(rl.clientNetworkCode(v4, "waitlist-net", day1), code, "no other limiter's code matches");
    assert.notEqual(networkDayCode("203.0.113.7", utcDay(day1), SECRET), code, "nor the page-open tally's");

    // The /48: none on IPv4 (mapped included); one per /48 on IPv6, its own
    // purpose, so it matches neither the /64's code nor another /48's.
    const wide = anon.anonReadWideNetworkCode(v6, day1);
    assert.match(wide ?? "", /^[0-9a-f]{32}$/);
    assert.equal(anon.anonReadWideNetworkCode(v4, day1), null);
    assert.equal(anon.anonReadWideNetworkCode(req({ "x-forwarded-for": "::ffff:203.0.113.7" }), day1), null);
    assert.equal(anon.anonReadWideNetworkCode(req({ "x-forwarded-for": "2001:db8:1234:ffff::9" }), day1), wide, "another /64 of the same /48");
    assert.notEqual(anon.anonReadWideNetworkCode(req({ "x-forwarded-for": "2001:db8:1235::1" }), day1), wide, "another /48");
    assert.notEqual(anon.anonReadNetworkCode(v6, day1), wide);
    assert.equal(rl.wideNetworkBucket("2001:DB8:0:1::1"), "2001:db8:0::/48");
    assert.equal(rl.wideNetworkBucket("203.0.113.7"), null);
    assert.equal(rl.wideNetworkBucket("unknown"), null);

    delete process.env.SCHOOL_EMAIL_VERIFY_SECRET;
    assert.equal(anon.anonReadNetworkCode(v4, day1), null, "no secret: no code, never the address");
    assert.equal(anon.anonReadWideNetworkCode(v6, day1), null, "nor a /48 code");
  } finally {
    if (before === undefined) delete process.env.SCHOOL_EMAIL_VERIFY_SECRET;
    else process.env.SCHOOL_EMAIL_VERIFY_SECRET = before;
  }
});

test("no key and no log line holds the address, the handle or the code's input", async () => {
  const before = process.env.SCHOOL_EMAIL_VERIFY_SECRET;
  try {
    process.env.SCHOOL_EMAIL_VERIFY_SECRET = SECRET;
    // Every read reaches the ceiling and is refused there, so all three keys
    // of each pot are asked and every refusal is said; the clock moves an
    // hour between networks, past the spent ceiling and the log's minute.
    const r = recorder({ all: limited(60) });
    const lines: string[] = [];
    let t = T0;
    const check = anon.createAnonReadLimiter({
      limit: r.limit,
      networkCode: (q) => anon.anonReadNetworkCode(q, new Date(t)),
      wideNetworkCode: (q) => anon.anonReadWideNetworkCode(q, new Date(t)),
      now: () => t,
      log: (line) => lines.push(line),
    });
    for (const ip of ["203.0.113.7", "2001:db8:1234:5678:abcd::1", "::ffff:198.51.100.9"]) {
      for (const kind of ["page", "profile", "grid"] as const) await check(req({ "x-forwarded-for": ip }), kind);
      t += 3_600_000;
    }
    // Three keys a read on IPv4, four on IPv6 (the /48).
    assert.equal(r.calls.length, 30);
    assert.equal(lines.length, 9);
    const KEY = /^anon-read-(?:page|profile|grid)(?:-day|-wide)?:[0-9a-f]{32}$|^anon-read-(?:page|profile|grid)-all$/;
    for (const { key } of r.calls) assert.match(key ?? "", KEY);
    const said = [...r.calls.map((c) => c.key), ...lines].join("\n");
    for (const leak of ["203.0.113", "2001:db8", "::/", "198.51.100", "someone", SECRET]) {
      assert.ok(!said.includes(leak), `"${leak}" reached a key or the log`);
    }
    assert.ok(lines.length > 0 && lines.every((l) => !/[0-9a-f]{32}/.test(l)), "the log names no code");
  } finally {
    if (before === undefined) delete process.env.SCHOOL_EMAIL_VERIFY_SECRET;
    else process.env.SCHOOL_EMAIL_VERIFY_SECRET = before;
  }
});

// ── 6. The two 429s ─────────────────────────────────────────────────────────

test("the data routes' 429: JSON with its code, Retry-After of at least 1, kept by no cache, the same body every time", async () => {
  const body = { ok: false, code: anon.ANON_READ_CODE, error: anon.ANON_READ_LINE };
  const a = anon.anonReadRefusal(limited(42));
  assert.equal(a.status, 429);
  assert.equal(a.headers.get("retry-after"), "42");
  assert.equal(a.headers.get("cache-control"), "no-store");
  assert.equal(a.headers.get("content-type"), "application/json");
  assert.deepEqual(await a.json(), body);
  const b = anon.anonReadRefusal(limited(0));
  assert.equal(b.headers.get("retry-after"), "1");
  assert.deepEqual(await b.json(), body);
});

test("the screens show that 429 as the line itself with Sign in back to the page, not 'going a little fast' and Retry", () => {
  const here = "/profile/someone?post=1";
  const shown = describeFailure({ status: 429, code: anon.ANON_READ_CODE, error: anon.ANON_READ_LINE, retryAfterSec: 1200 }, "Couldn't load this profile.", here);
  assert.deepEqual(shown, {
    message: anon.ANON_READ_LINE,
    action: { label: "Sign in", href: `/auth/login?next=${encodeURIComponent(here)}` },
  });
  // Any other 429 keeps the usual line.
  assert.match(describeFailure({ status: 429, code: null, error: null, retryAfterSec: 30 }, "x", "/").message, /^You're going a little fast/);
});

test("the pages' 429: no script or style, Retry-After, kept by no cache; Sign in comes back to the page asked for", () => {
  const a = anon.anonReadPageRefusal(limited(3000), "/profile/sae_frank");
  const b = anon.anonReadPageRefusal(limited(5), "/profile/sae_frank");
  assert.equal(a.init.status, 429);
  const headers = new Headers(a.init.headers);
  assert.equal(headers.get("retry-after"), "3000");
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(a.body, b.body, "nothing in the page depends on the verdict, or on what was looked up");
  assert.equal(a.body, anon.anonReadPageHtml("/profile/sae_frank"));
  assert.ok(a.body.includes('<a href="/auth/login?next=%2Fprofile%2Fsae_frank">Sign in</a>'));
  assert.ok(!/<script|<style|style=|\son\w+=/i.test(a.body));
  // A path can't break out of the link: it is encoded whole.
  const odd = anon.anonReadPageHtml(`/posts/"><script>x</script>`);
  assert.ok(!odd.includes("<script") && !odd.includes('"><'));
});

// ── 7. Where it is called: the proxy and the two routes ─────────────────────

const read = (path: string) => readFileSync(new URL(path, SRC_ROOT), "utf8");

/** Where `needle` is in `text`, failing if it is missing or there more than once. */
function onlyAt(text: string, needle: string, file: string): number {
  const at = text.indexOf(needle);
  assert.ok(at >= 0, `${file}: missing ${needle}`);
  assert.equal(text.indexOf(needle, at + 1), -1, `${file}: ${needle} more than once`);
  return at;
}

test("source: the proxy's matcher is unchanged", () => {
  const proxy = read("proxy.ts");
  const config = proxy.slice(proxy.indexOf("export const config"));
  assert.equal(
    config.trim(),
    [
      "export const config = {",
      "  matcher: [",
      String.raw`    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js$|offline\\.html$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|webm)$).*)",`,
      "  ],",
      "};",
    ].join("\n"),
  );
});

test("source: the proxy counts only signed-out reads of the three pages, after the session is read, and refuses with the page", () => {
  const file = "proxy.ts";
  const proxy = read(file);
  assert.equal(proxy.split("anonReadLimit(").length - 1, 1, "one call");
  const session = onlyAt(proxy, "await updateSession(request)", file);
  const guard = onlyAt(proxy, "if (!user && isSignedOutReadPage(pathname, request.method)) {", file);
  const call = onlyAt(proxy, 'const verdict = await anonReadLimit(request, "page");', file);
  assert.ok(session < guard, "after updateSession, so `user` is known");
  assert.match(proxy.slice(guard, call), /^if \(.*\) \{\s*$/, "the call is the first thing under the guard");
  // The refusal right under the call: no `false &&`, no other condition.
  const refuse = onlyAt(proxy, "    if (!verdict.allowed) {\n      const { body, init } = anonReadPageRefusal(verdict, pathname);\n", file);
  const sent = onlyAt(proxy, "return finish(forwardCookies(sessionResponse, new NextResponse(body, init)));", file);
  assert.match(proxy.slice(call, refuse), /^const verdict = await anonReadLimit\(request, "page"\);\n$/, "the refusal is the next line");
  assert.ok(refuse < sent && proxy.slice(refuse, sent).split("\n").length === 3, "and it returns the page at once");
});

test("source: both routes count only signed out, after getUser and before the handle is looked up", () => {
  const routes: Array<[string, string, string]> = [
    ["app/api/users/[handle]/bootstrap/route.ts", "viewer", "profile"],
    ["app/api/users/[handle]/posts/route.ts", "user", "grid"],
  ];
  for (const [file, who, kind] of routes) {
    const src = read(file);
    assert.equal(src.split("anonReadLimit(").length - 1, 1, `${file}: one call`);
    const getUser = onlyAt(src, "await supabase.auth.getUser()", file);
    const guard = onlyAt(src, `if (!${who}) {\n    const verdict = await anonReadLimit(req, "${kind}");`, file);
    onlyAt(src, "if (!verdict.allowed) return anonReadRefusal(verdict);", file);
    const lookup = src.indexOf('.eq("handle", handle)');
    assert.ok(getUser < guard && guard < lookup, `${file}: getUser, then the count, then the handle`);
  }
});

test("source: nothing else in src/ counts a signed-out read", () => {
  const srcDir = fileURLToPath(SRC_ROOT);
  const callers = (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .filter((f) => readFileSync(`${srcDir}${f}`, "utf8").includes("anonReadLimit("))
    .sort();
  assert.deepEqual(callers, [
    "app/api/users/[handle]/bootstrap/route.ts",
    "app/api/users/[handle]/posts/route.ts",
    "proxy.ts",
  ]);
});
