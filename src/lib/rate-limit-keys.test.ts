/**
 * No limiter key holds an address (limits plan, Wave 2, B2.1).
 *
 * Since Oct 15 2026 every per-network limit counts on the network's
 * scrambled code for the day (`clientNetworkCode` in src/lib/rate-limit.ts),
 * so `public.rate_limits` holds no IP address. This file is what fails if a
 * key slips back:
 *   - no `rateLimit` key in src/, and no key-shaped template (`prefix:${…}`),
 *     is built from `clientNetworkKey(`, `clientIp(`, `networkBucket(`, a
 *     `${network}`, or a header read straight (`headers.get(`,
 *     `x-forwarded-for`, `x-real-ip`);
 *   - the 10 per-network limits each make their code for their own prefix,
 *     and pass a null key, never the address, when there is no code;
 *   - the waitlist form makes its codes before `after()`, and the background
 *     step is handed a code, never the address (run for real, on stand-ins);
 *   - the school-email request, failClosed on both limits since this wave,
 *     says "couldn't send" when the limiter can't count, not "you've asked
 *     for 3 emails" (critique #7; run for real, on stand-ins);
 *   - so do personal email and the school check-in, on all four calls, and
 *     a lockout says the minutes actually left (run for real, on stand-ins).
 *
 * Run with:
 *   node --test src/lib/rate-limit-keys.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/auth/school-code-confirm.test.ts): the
 * two routes import "next/server", the limiter, the Supabase clients, the
 * store and the sender; each resolves to a small data: module that reads its
 * fake from globalThis.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SRC_ROOT = new URL("../", import.meta.url);
const SRC_DIR = fileURLToPath(SRC_ROOT);

/** What a key must never be built from: the address, or its unscrambled network. */
const RAW = ["clientNetworkKey(", "clientIp(", "networkBucket(", "${network}", "x-forwarded-for", "x-real-ip"];
/** Inside a key, any header read at all: a key is an account id, a hash, a code or a fixed word, never a header. */
const KEY_RAW = [...RAW, "headers.get("];

/** The code only: block comments, then whole-line `//` comments (a URL in a string keeps its slashes). */
const codeOnly = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (file: string) => codeOnly(readFileSync(new URL(file, SRC_ROOT), "utf8"));
/** Case aside, so `X-Forwarded-For` counts too. */
const rawPieces = (text: string, pieces: readonly string[] = RAW) =>
  pieces.filter((piece) => text.toLowerCase().includes(piece.toLowerCase()));
const keyRawPieces = (key: string) => rawPieces(key, KEY_RAW);

/** Index of the quote closing the string or template that opens at `start`; a template's `${…}` is skipped whole. */
function stringEnd(src: string, start: number): number {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i += 1) {
    if (src[i] === "\\") i += 1;
    else if (src[i] === quote) return i;
    else if (quote === "`" && src[i] === "$" && src[i + 1] === "{") i = groupEnd(src, i + 1);
  }
  return src.length;
}

/** Index of the bracket closing the one at `open`, strings skipped. */
function groupEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") i = stringEnd(src, i);
    else if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch) && --depth === 0) return i;
  }
  return src.length;
}

/** The first argument of the call whose "(" is at `open`: up to its first top-level comma, or the ")". */
function firstArgument(src: string, open: number): string {
  let depth = 0;
  for (let i = open + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") i = stringEnd(src, i);
    else if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch) && depth-- === 0) return src.slice(open + 1, i);
    else if (ch === "," && depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

/** Every `rateLimit(` key in `code`, and every key-shaped template (`prefix:${…}`), wherever it is built. */
function keysIn(code: string): string[] {
  const keys: string[] = [];
  for (const m of code.matchAll(/\brateLimit\(/g)) keys.push(firstArgument(code, m.index + m[0].length - 1));
  for (const m of code.matchAll(/`[a-z0-9-]+:\$\{/g)) keys.push(code.slice(m.index, stringEnd(code, m.index) + 1));
  return keys;
}

test("the scan catches the old keys, and passes the new ones", () => {
  const old = [
    "await rateLimit(`school-email-ip:${clientNetworkKey(req)}`, { limit: 60, windowSec: 3600 });",
    "const network = clientNetworkKey(req);\nconst n = await rateLimit(`waitlist-net:${network}`, { limit: 30 });",
    "return { key: `pw-reset-net:${network}`, limit: 5 };",
    "rateLimit(`x-ip:${networkBucket(clientIp(req))}`, opts)",
    'rateLimit(`tally-open-net:${req.headers.get("x-forwarded-for")}`, opts)',
    'rateLimit(`tally-open-net:${req.headers.get("X-Real-IP")}`, opts)',
    "const hdr = 'x-forwarded-for';\nrateLimit(`x:${req.headers.get(hdr)}`, opts)",
  ];
  for (const sample of old) assert.ok(keysIn(sample).some((key) => keyRawPieces(key).length > 0), sample);

  const now =
    'const netCode = clientNetworkCode(req, "waitlist-net");\n' +
    "const n = await rateLimit(netCode === null ? null : `waitlist-net:${netCode}`, { limit: 30, windowSec: 3600 });";
  assert.deepEqual(keysIn(now), ["netCode === null ? null : `waitlist-net:${netCode}`", "`waitlist-net:${netCode}`"]);
  assert.ok(keysIn(now).every((key) => keyRawPieces(key).length === 0));
});

test("no rateLimit key in src/, and no key-shaped template, is built from an address", () => {
  const files = (readdirSync(SRC_DIR, { recursive: true }) as string[]).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const problems: string[] = [];
  let calls = 0;
  for (const file of files) {
    const code = codeOnly(readFileSync(`${SRC_DIR}${file}`, "utf8"));
    for (const key of keysIn(code)) {
      if (key.startsWith("key: string")) continue; // rateLimit's own signature
      calls += 1;
      const raw = keyRawPieces(key);
      if (raw.length) problems.push(`${file}: ${key.slice(0, 120)} (${raw.join(", ")})`);
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(calls >= 100, `found only ${calls} keys; is the scan still reading src/?`);
});

/** The per-network limits made in a route (prefix, the files that make its code). Its prefix is its purpose. */
const NETWORK_LIMITS: Array<[prefix: string, files: string[]]> = [
  ["school-email-ip", ["app/api/auth/school-email/request/route.ts"]],
  ["school-code-ip", ["app/api/auth/school-email/confirm-code/route.ts"]],
  ["personal-email-send-net", ["app/api/me/personal-email/route.ts"]],
  ["personal-email-code-net", ["app/api/me/personal-email/route.ts"]],
  ["school-checkin-code-net", ["app/api/me/school-checkin/route.ts"]],
  ["school-checkin-send-net", ["app/api/me/school-checkin/route.ts"]],
  ["waitlist-net", ["app/api/waitlist/route.ts"]],
  ["waitlist-confirm-net", ["app/api/waitlist/route.ts"]],
  [
    "waitlist-token-net",
    ["app/api/waitlist/confirm/route.ts", "app/api/waitlist/status/route.ts", "app/api/waitlist/leave/route.ts"],
  ],
];

test("the 10 per-network limits: each makes its code for its own prefix, and no code is a null key", () => {
  for (const [prefix, files] of NETWORK_LIMITS) {
    for (const file of files) {
      const code = read(file);
      const made = code.match(new RegExp(`const (\\w+) = clientNetworkCode\\(req, "${prefix}"\\);`));
      assert.ok(made, `${file}: no clientNetworkCode(req, "${prefix}")`);
      const name = made[1];
      assert.ok(code.includes(`${name} === null ? null : \`${prefix}:\${${name}}\``), `${file}: the ${prefix} key`);
    }
  }
  // The reset form's goes through password-reset-limits.ts.
  assert.ok(read("app/api/auth/password-reset/route.ts").includes('resetNetworkLimit(clientNetworkCode(req, "pw-reset-net"))'));
  assert.ok(read("lib/auth/password-reset-limits.ts").includes("networkCode === null ? null : `pw-reset-net:${networkCode}`"));
  assert.equal(NETWORK_LIMITS.length + 1, 10);
});

test("those routes never read the address at all", () => {
  const files = new Set([
    "app/api/auth/password-reset/route.ts",
    "lib/auth/password-reset-limits.ts",
    ...NETWORK_LIMITS.flatMap(([, list]) => list),
  ]);
  for (const file of files) assert.deepEqual(rawPieces(read(file)), [], file);
});

// ---------------------------------------------------------------------------
// Two routes run for real against stand-ins: the waitlist form, then the
// school-email request. The stand-ins below serve both.
// ---------------------------------------------------------------------------

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("rate-limit-keys.test.ts needs Node >= 22.15 (module.registerHooks)");
const dataModule = (js: string) => `data:text/javascript,${encodeURIComponent(js)}`;
const STUBS: Record<string, string> = {
  "next/server": dataModule(
    "export const after = (fn) => { globalThis.__rlk.events.push('after'); globalThis.__rlk.afters.push(fn); };\n" +
      // A class, so the check-in route's `instanceof NextResponse` works.
      "export class NextResponse { static json(body, init) { const r = new NextResponse(); r.status = (init && init.status) || 200; r.body = body; return r; } }",
  ),
  // The address helpers throw: the route must never read the address.
  "@/lib/rate-limit": dataModule(
    "export function clientNetworkCode(req, purpose) { globalThis.__rlk.events.push('code:' + purpose); return globalThis.__rlk.code(purpose); }\n" +
      "export function clientNetworkKey() { throw new Error('the address was read'); }\n" +
      "export function clientIp() { throw new Error('the address was read'); }\n" +
      "export async function rateLimit(key, opts) {\n" +
      "  globalThis.__rlk.keys.push(key);\n" +
      "  globalThis.__rlk.opts.push(opts);\n" +
      "  return globalThis.__rlk.answers.shift() ?? { allowed: true, retryAfterSec: 0, reason: null };\n" +
      "}\n" +
      "export const tooManyRequests = (result, message) => ({ status: 429, body: { ok: false, error: message } });",
  ),
  "@/lib/auth/site-url": dataModule("export const getSiteOriginForRequest = () => 'http://localhost:3102';"),
  "@/lib/email/resend-transactional": dataModule(
    "export async function sendWaitlistConfirmEmail(to) { globalThis.__rlk.sent.push(to); }\n" +
      "export async function sendSchoolVerificationEmail(to) { globalThis.__rlk.sent.push(to); }\n" +
      "export async function sendPersonalEmailCodeEmail(to) { globalThis.__rlk.sent.push(to); }\n" +
      "export async function sendSchoolCheckinEmail(to) { globalThis.__rlk.sent.push(to); }",
  ),
  "@/lib/email/send-log-core": dataModule("export const recipientRateKey = () => 'addr';\nexport const redactAddresses = (s) => s;"),
  // Every read finds nothing (the school-email request's profile and address
  // lookups, personal email's "is it taken"), but the check-in's own row.
  "@/lib/supabase/service": dataModule(
    "const chain = { select: () => chain, eq: () => chain, neq: () => chain,\n" +
      "  limit: async () => ({ data: [], error: null }),\n" +
      "  maybeSingle: async () => ({ data: globalThis.__rlk.row ?? null, error: null }) };\n" +
      "export const createSupabaseServiceClient = () => ({ from: () => chain });\n" +
      "export const isSupabaseServiceConfigured = () => true;",
  ),
  "@/lib/supabase/server": dataModule(
    "export async function createSupabaseServerClient() {\n" +
      "  return { auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) } };\n" +
      "}",
  ),
  "@/lib/auth/post-login": dataModule("export const isOttoOnboardingComplete = () => true;"),
  "@/lib/auth/personal-email": dataModule(
    "export const normalizePersonalEmail = (s) => (typeof s === 'string' && s.includes('@') ? s.trim().toLowerCase() : null);\n" +
      "export const isSchoolAddress = (s) => /@iu\\.edu$/.test(s);\n" +
      "export const personalEmailCode = () => '12345678';\nexport const verifyPersonalEmailCode = () => false;",
  ),
  "@/lib/auth/school-checkin": dataModule(
    "export const checkinStage = () => 'waiting';\nexport const checkinCode = () => '12345678';\nexport const verifyCheckinCode = () => false;",
  ),
  "@/lib/auth/school-email-apply": dataModule("export async function schoolIdentityRestrictionGate() { return null; }"),
  "@/lib/auth/school-email-domains": dataModule("export const schoolEmailRejection = () => null;"),
  "@/lib/auth/school-email-token": dataModule(
    "export const isSchoolVerifySecretConfigured = () => true;\n" +
      "export const normalizeSchoolEmail = (s) => s.trim().toLowerCase();\n" +
      "export const SCHOOL_CODE_LENGTH = 8;\nexport const SCHOOL_CODE_WINDOW_SEC = 1800;\n" +
      "export const schoolEmailCode = () => '12345678';\nexport const signSchoolEmailToken = () => 'tok';",
  ),
  "@/lib/legal/require-terms": dataModule("export async function requireTermsAccepted() { return null; }"),
  "@/lib/moderation/access": dataModule("export async function schoolIdentityConflict() { return { ok: true, takenBy: null }; }"),
  "@/lib/waitlist/admin-view": dataModule(
    "export const remainingBudget = (used, cap) => cap - used;\nexport const waitlistEmailKey = (email) => 'ek:' + email;",
  ),
  "@/lib/waitlist/email-content": dataModule(
    "export const waitlistConfirmUrl = (site, t) => site + '/c/' + t;\nexport const waitlistLeaveUrl = (site, t) => site + '/l/' + t;",
  ),
  "@/lib/waitlist/form": dataModule("export const parseWaitlistForm = (raw) => ({ ok: true, value: raw });"),
  "@/lib/waitlist/request-guard": dataModule(
    "export const WAITLIST_UNAVAILABLE = 'unavailable';\nexport const waitlistPostRefusal = () => null;\nexport const waitlistStoreRefusal = () => null;",
  ),
  "@/lib/waitlist/signup-open": dataModule("export async function readSignupSwitch() { return { ok: true, open: false }; }"),
  "@/lib/waitlist/store": dataModule(
    "export async function accountExistsFor() { return false; }\n" +
      "export async function dropWaitlistEntryIfDue() { return false; }\n" +
      "export async function findByEmailKey() { return null; }\n" +
      "export async function insertFormRow() { return 'inserted'; }\n" +
      "export async function purgeExpiredWaitlistIfDue() {}\n" +
      "export async function readWaitlistBudget() { return { used: 0, cap: 50 }; }\n" +
      "export async function renewConfirmToken() { return true; }",
  ),
  "@/lib/waitlist/tokens": dataModule("export const mintManageToken = () => ({ token: 't', hash: 'h' });"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const waitlistSpecifier = "../app/api/waitlist/route.ts";
const waitlist = (await import(waitlistSpecifier)) as { POST: (req: Request) => Promise<{ status: number; body: unknown }> };

type Limit = { allowed: boolean; retryAfterSec: number; reason: "limited" | "unavailable" | null };

/** The stand-ins' shared state for one request: the codes it gets, and the limiter's answers in order (then allowed). */
function install(code: (purpose: string) => string | null, answers: Limit[] = []) {
  const state = {
    events: [] as string[],
    afters: [] as Array<() => Promise<void>>,
    keys: [] as Array<string | null>,
    opts: [] as Array<{ failClosed?: boolean }>,
    sent: [] as string[],
    /** The users row a `maybeSingle` finds (the check-in's); null finds nothing. */
    row: null as Record<string, unknown> | null,
    answers,
    code,
  };
  (globalThis as Record<string, unknown>).__rlk = state;
  return state;
}

/** One form submit from 203.0.113.7, then everything Next would run after the answer. */
async function submit(code: (purpose: string) => string | null) {
  const state = install(code);
  const answer = await waitlist.POST(
    new Request("http://localhost:3102/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ email: "ann@example.com" }),
    }),
  );
  const atAnswer = [...state.events];
  for (const fn of state.afters.splice(0)) await fn();
  return { answer, state, atAnswer };
}

test("waitlist: both codes are made before after(), and the background step is handed a code, never the address", async () => {
  const CODES: Record<string, string> = { "waitlist-net": "a".repeat(32), "waitlist-confirm-net": "b".repeat(32) };
  const { answer, state, atAnswer } = await submit((purpose) => CODES[purpose] ?? null);
  assert.equal(answer.status, 200);
  assert.deepEqual(atAnswer, ["code:waitlist-net", "code:waitlist-confirm-net", "after"]);
  // Nothing after the answer makes a code: it was handed one.
  assert.deepEqual(state.events, atAnswer);
  assert.deepEqual(state.keys, [
    `waitlist-net:${CODES["waitlist-net"]}`,
    "waitlist-global",
    "waitlist-email:addr",
    `waitlist-confirm-net:${CODES["waitlist-confirm-net"]}`,
  ]);
  assert.ok(state.keys.every((key) => !String(key).includes("203.0.113")));
  assert.deepEqual(state.sent, ["ann@example.com"]);
});

test("waitlist: no code is a null key, so that count is skipped, never keyed on the address", async () => {
  const { answer, state } = await submit(() => null);
  assert.equal(answer.status, 200);
  assert.deepEqual(state.keys, [null, "waitlist-global", "waitlist-email:addr", null]);
  assert.deepEqual(state.sent, ["ann@example.com"]);
});

// ---------------------------------------------------------------------------
// The school-email request: both limits fail closed, and say why (critique #7)
// ---------------------------------------------------------------------------

const requestSpecifier = "../app/api/auth/school-email/request/route.ts";
const schoolEmail = (await import(requestSpecifier)) as {
  POST: (req: Request) => Promise<{ status: number; body: { ok: boolean; error?: string } }>;
};
const CODE = "c".repeat(32);
const LIMITER_DOWN = "Couldn't send the email right now. Try again in a minute.";
const ALLOWED: Limit = { allowed: true, retryAfterSec: 0, reason: null };
const DOWN: Limit = { allowed: false, retryAfterSec: 60, reason: "unavailable" };
const SPENT: Limit = { allowed: false, retryAfterSec: 1200, reason: "limited" };

/** One "send me a code" from a signed-in student, with the per-user and per-network answers in that order. */
async function askForCode(answers: Limit[], code: string | null = CODE) {
  const state = install(() => code, answers);
  const res = await schoolEmail.POST(
    new Request("http://localhost:3102/api/auth/school-email/request", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ schoolEmail: "ann@iu.edu" }),
    }),
  );
  return { res, state };
}

test("school-email request: per account then per network code, both failClosed, and a send when both allow", async () => {
  const { res, state } = await askForCode([]);
  assert.equal(res.status, 200);
  assert.deepEqual(state.keys, ["school-email:u-1", `school-email-ip:${CODE}`]);
  assert.deepEqual(state.opts.map((o) => o.failClosed), [true, true]);
  assert.deepEqual(state.sent, ["ann@iu.edu"]);
  // No code: a null key (the limiter then refuses, failClosed), never the address.
  assert.deepEqual((await askForCode([], null)).state.keys, ["school-email:u-1", null]);
});

test("school-email request: a limiter that couldn't count says so on either limit, not 'you've asked too often'", async () => {
  for (const answers of [[DOWN], [ALLOWED, DOWN]]) {
    const { res, state } = await askForCode(answers);
    assert.equal(res.status, 429);
    assert.equal(res.body.error, LIMITER_DOWN);
    assert.deepEqual(state.sent, []);
  }
});

test("school-email request: a spent count keeps its own line", async () => {
  const perUser = await askForCode([SPENT]);
  assert.equal(perUser.res.status, 429);
  assert.match(perUser.res.body.error ?? "", /^You've asked for 3 emails this hour\./);
  assert.equal(perUser.state.keys.length, 1, "the network count is never spent on an account over its own");
  const perNetwork = await askForCode([ALLOWED, SPENT]);
  assert.match(perNetwork.res.body.error ?? "", /^Lots of verification emails from this network/);
  assert.deepEqual(perNetwork.state.sent, []);
});

// ---------------------------------------------------------------------------
// Personal email and the school check-in: on all four calls both limits fail
// closed, a limiter that couldn't count says so, and a lockout says the
// minutes actually left (run for real, on stand-ins)
// ---------------------------------------------------------------------------

type Answered = { status: number; body: { ok: boolean; code?: string; error?: string } };
type Handler = (req: Request) => Promise<Answered>;
const personalSpecifier = "../app/api/me/personal-email/route.ts";
const personal = (await import(personalSpecifier)) as Record<"POST" | "PUT", Handler>;
const checkinSpecifier = "../app/api/me/school-checkin/route.ts";
const checkin = (await import(checkinSpecifier)) as Record<"POST" | "PUT", Handler>;

const SEND_DOWN = "Couldn't send the code right now. Try again in a minute.";
const CHECK_DOWN = "Couldn't check your code right now. Try again in a minute.";
/** 61 seconds left in the window: the lockout must say 2 minutes, not the window's 15. */
const SPENT_61: Limit = { allowed: false, retryAfterSec: 61, reason: "limited" };

type Call = {
  name: string;
  handler: Handler;
  method: string;
  body?: unknown;
  /** The per-account key, then the per-network prefix. */
  keys: [string, string];
  /** The per-account line for SPENT_61, the per-network line, the down line. */
  lines: [string, string, string];
  /** The status when both limits allow (a send, or the stand-in's wrong code). */
  through: number;
};

const CALLS: Call[] = [
  {
    name: "personal email, send",
    handler: personal.POST,
    method: "POST",
    body: { email: "ann@gmail.com" },
    keys: ["personal-email-send:u-1", "personal-email-send-net"],
    lines: ["You've asked for a few codes. Try again in an hour.", "Lots of requests from this network. Try again later.", SEND_DOWN],
    through: 200,
  },
  {
    name: "personal email, code",
    handler: personal.PUT,
    method: "PUT",
    body: { email: "ann@gmail.com", code: "12345678" },
    keys: ["personal-email-code:u-1", "personal-email-code-net"],
    lines: ["Too many tries. Wait 2 minutes, then ask for a new code.", "Lots of tries from this network. Try again later this hour.", CHECK_DOWN],
    through: 400,
  },
  {
    name: "check-in, code",
    handler: checkin.POST,
    method: "POST",
    body: { code: "12345678" },
    keys: ["school-checkin-code:u-1", "school-checkin-code-net"],
    lines: ["Too many tries. Wait 2 minutes, then try again.", "Lots of tries from this network. Try again later this hour.", CHECK_DOWN],
    through: 400,
  },
  {
    name: "check-in, send again",
    handler: checkin.PUT,
    method: "PUT",
    keys: ["school-checkin-send:u-1", "school-checkin-send-net"],
    lines: [
      "We've sent it a few times today. Try again tomorrow, or add a personal email instead.",
      "Lots of requests from this network. Try again later.",
      SEND_DOWN,
    ],
    through: 200,
  },
];

/** One call from a signed-in student whose check-in is open, with the limiter's answers in order. */
async function run(c: Call, answers: Limit[], code: string | null = CODE) {
  const state = install(() => code, answers);
  state.row = { email: "ann@iu.edu", school_checkin_sent_at: "2026-10-01T00:00:00.000Z", school_grace_ends_at: null };
  const init: RequestInit = { method: c.method, headers: { "x-forwarded-for": "203.0.113.7" } };
  if (c.body !== undefined) init.body = JSON.stringify(c.body);
  const res = await c.handler(new Request("http://localhost:3102/api/me/x", init));
  return { res, state };
}

for (const c of CALLS) {
  test(`${c.name}: per account then per network code, both failClosed; no code is a null key`, async () => {
    const { res, state } = await run(c, []);
    assert.equal(res.status, c.through);
    assert.deepEqual(state.keys, [c.keys[0], `${c.keys[1]}:${CODE}`]);
    assert.deepEqual(state.opts.map((o) => o.failClosed), [true, true]);
    assert.deepEqual((await run(c, [], null)).state.keys, [c.keys[0], null]);
  });

  test(`${c.name}: a limiter that couldn't count says so on either limit; a spent one says which, and the minutes left`, async () => {
    for (const answers of [[DOWN], [ALLOWED, DOWN]]) {
      const { res } = await run(c, answers);
      assert.equal(res.status, 429);
      assert.equal(res.body.error, c.lines[2]);
    }
    const perUser = await run(c, [SPENT_61]);
    assert.equal(perUser.res.status, 429);
    assert.equal(perUser.res.body.error, c.lines[0]);
    assert.equal(perUser.state.keys.length, 1, "the network count is never spent on an account over its own");
    const perNetwork = await run(c, [ALLOWED, SPENT]);
    assert.equal(perNetwork.res.body.error, c.lines[1]);
    assert.deepEqual(perNetwork.state.sent, []);
  });
}
