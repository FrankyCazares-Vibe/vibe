/**
 * Social and personal actions each count against a per-account budget
 * (limits plan, wave 3, B3.2), run for real on stand-ins:
 *   - repost, quote edit and un-repost on `repost`; block and unblock on
 *     `block`; mute, unmute, dismissing a suggestion, removing the personal
 *     email, declining a club invite, dismissing or doing an Otto reminder
 *     and deleting a calendar event on `prefs`; marking named notifications
 *     read on `markRead`; a new reminder or event on its own hourly budget;
 *     deleting the account on `bigDelete` (shared with deleting a club);
 *   - unfollow counts on `follow:<uid>` at the follow's own numbers;
 *   - each limiter runs right after getUser and before anything else: no
 *     database read, no Terms read, no publish gate, so a refused caller
 *     costs nothing, and a suspended account is limited too;
 *   - a refusal is a 429 with a plain line and the time left; an allowed
 *     call goes on as before;
 *   - mark-read refuses more than 200 ids with a 400 instead of cutting the
 *     list (critique #30); `{ all: true }`, which both Otto panels send by
 *     themselves on open, is never counted (Privacy Policy 3d).
 *
 * Run with:
 *   node --test src/lib/limits/social-limits.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/orgs/officer-limits.test.ts): the routes
 * import "next/server", "server-only" modules and the two Supabase clients;
 * each resolves to a small data: module that reads its fake from globalThis.
 * budgets.ts, pgrest and missing-column are the real code. Every other "@/"
 * import is a stand-in that writes its name to the log when it does
 * anything, so the log is everything a route did, in order.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("social-limits.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
/** A stand-in that writes `name` to the log and answers `value` (JS source). */
const logged = (name: string, value: string) => `(...a) => { globalThis.__vibeSocial.log.push('${name}'); return ${value}; }`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export class NextResponse extends Response {\n" +
      "  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }\n" +
      "}",
  ),
  "@/lib/supabase/server": dataModule(
    "export async function createSupabaseServerClient() { return globalThis.__vibeSocial.client('cookie'); }",
  ),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { return globalThis.__vibeSocial.client('service'); }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { const w = globalThis.__vibeSocial; w.log.push('limit:' + key); w.limits.push({ key, opts });\n" +
      "  return w.allow ? { allowed: true, retryAfterSec: 0, reason: null } : { allowed: false, retryAfterSec: 240, reason: 'limited' }; }\n" +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.', code) {\n" +
      "  return new Response(JSON.stringify(code ? { ok: false, code, error: message } : { ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }\n" +
      `export const clientNetworkCode = ${logged("network-code", "'code'")};`,
  ),
  "@/lib/legal/require-terms": dataModule(`export const requireTermsAccepted = ${logged("terms", "Promise.resolve(null)")};`),
  "@/lib/moderation/access": dataModule(
    `export const requireCanPublish = ${logged("publish-gate", "Promise.resolve(null)")};\n` +
      "export const contentBlockedResponse = () => Response.json({ ok: false }, { status: 400 });",
  ),
  "@/lib/moderation/text-filter": dataModule("export const checkText = () => ({ ok: true });"),
  "@/lib/orgs/hidden-org-access": dataModule(
    `export const postAccessForCaller = ${logged("post-access", "Promise.resolve({ ok: false, reason: 'not_found' })")};`,
  ),
  "@/lib/safety/pair-block": dataModule(`export const loadPairBlock = ${logged("pair-block", "Promise.resolve({ ok: true, blocked: false })")};`),
  "@/lib/orgs/membership": dataModule(`export const expireStaleInvites = ${logged("expire-invites", "Promise.resolve()")};`),
  "@/lib/push/dispatch": dataModule("export function kickPushDrain() {}"),
  "@/lib/auth/personal-email": dataModule(
    "export const normalizePersonalEmail = (s) => s;\nexport const isSchoolAddress = () => false;\n" +
      "export const personalEmailCode = () => '12345678';\nexport const verifyPersonalEmailCode = () => false;",
  ),
  "@/lib/auth/school-email-token": dataModule("export const isSchoolVerifySecretConfigured = () => true;"),
  "@/lib/email/resend-transactional": dataModule(`export const sendPersonalEmailCodeEmail = ${logged("send", "Promise.resolve()")};`),
  "@/lib/billing/config": dataModule("export const stripeKeyLivemode = () => false;"),
  "@/lib/billing/customers": dataModule(`export const billingCustomerForUser = ${logged("billing", "Promise.resolve(null)")};`),
  "@/lib/billing/stripe": dataModule(
    "export const getStripe = () => null;\nexport const isStripeResourceMissing = () => false;\nexport const logBillingError = () => {};",
  ),
  "@/lib/profile/storage-purge": dataModule(`export const purgeUserUploads = ${logged("purge", "Promise.resolve({})")};`),
  "@/lib/waitlist/store": dataModule(
    `export const forgetAllowlistAddress = ${logged("waitlist", "Promise.resolve()")};\n` +
      `export const forgetWaitlistForUser = ${logged("waitlist", "Promise.resolve()")};`,
  ),
};
/** The only "@/" modules that load for real. */
const REAL = new Set(["@/lib/limits/budgets", "@/lib/pgrest", "@/lib/db/missing-column"]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      if (!REAL.has(specifier)) throw new Error(`social-limits.test.ts: add a stand-in for ${specifier}`);
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    return nextResolve(specifier, context);
  },
});

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ROW = "33333333-3333-4333-8333-333333333333";

type Limit = { limit: number; windowSec: number };
type World = {
  log: string[];
  limits: { key: string; opts: unknown }[];
  allow: boolean;
  client: (label: string) => unknown;
};

/** A PostgREST stand-in: every `.from()` lands in the log; reads find nothing, writes succeed. */
function fakeClient(world: World, label: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "or", "gte", "lte", "order", "limit"]) {
    q[m] = () => q;
  }
  q.maybeSingle = async () => ({ data: null, error: null });
  q.single = async () => ({ data: { id: ROW }, error: null });
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(ok, bad);
  return {
    auth: {
      getUser: async () => {
        world.log.push("getUser");
        return { data: { user: { id: ME } }, error: null };
      },
    },
    from(table: string) {
      world.log.push(`${label}:${table}`);
      return q;
    },
  };
}

function install(allow: boolean): World {
  const world: World = { log: [], limits: [], allow, client: (label) => fakeClient(world, label) };
  (globalThis as Record<string, unknown>).__vibeSocial = world;
  return world;
}

// Specifiers in variables, so the type checker leaves the `.ts` paths alone.
const budgetsSpecifier = "./budgets.ts";
const { BUDGETS } = (await import(budgetsSpecifier)) as { BUDGETS: Record<string, Limit> };
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function handler(file: string, method: string): Promise<Handler> {
  const mod = (await import(`../../app/api/${file}`)) as Record<string, Handler>;
  assert.equal(typeof mod[method], "function", `${file} ${method}`);
  return mod[method];
}

/** The follow route's numbers, which unfollow now shares. */
const FOLLOW: Limit = { limit: 60, windowSec: 600 };

/**
 * One call per method. Where a route takes a handle, the case sends one, so
 * a limiter moved below the handle lookup would show that read in the log.
 */
type Case = { file: string; method: string; budget: string; body?: unknown; params?: Record<string, string> };
const CASES: Case[] = [
  { file: "posts/[id]/repost/route.ts", method: "POST", budget: "repost", body: { comment: "so good" }, params: { id: ROW } },
  { file: "posts/[id]/repost/route.ts", method: "PATCH", budget: "repost", body: { comment: "so good" }, params: { id: ROW } },
  { file: "posts/[id]/repost/route.ts", method: "DELETE", budget: "repost", params: { id: ROW } },
  { file: "me/block/route.ts", method: "POST", budget: "block", body: { handle: "ann" } },
  { file: "me/block/route.ts", method: "DELETE", budget: "block", body: { handle: "ann" } },
  { file: "me/mute/route.ts", method: "POST", budget: "prefs", body: { handle: "ann", duration_hours: 8 } },
  { file: "me/mute/route.ts", method: "DELETE", budget: "prefs", body: { handle: "ann" } },
  { file: "me/dismiss-suggestion/route.ts", method: "POST", budget: "prefs", body: { target_handle: "ann" } },
  { file: "me/notifications/mark-read/route.ts", method: "POST", budget: "markRead", body: { ids: [ROW] } },
  { file: "me/otto/reminders/route.ts", method: "POST", budget: "ottoReminderCreate", body: { title: "Call mom" } },
  { file: "me/otto/reminders/[id]/route.ts", method: "DELETE", budget: "prefs", params: { id: ROW } },
  { file: "me/otto/reminders/[id]/act/route.ts", method: "POST", budget: "prefs", params: { id: ROW } },
  { file: "me/personal-events/route.ts", method: "POST", budget: "personalEventCreate", body: { title: "Study", starts_at: "2026-10-20T15:00:00.000Z" } },
  { file: "me/personal-events/[id]/route.ts", method: "DELETE", budget: "prefs", params: { id: ROW } },
  { file: "me/follow/route.ts", method: "DELETE", budget: "follow", body: { target_handle: "ann" } },
  { file: "me/personal-email/route.ts", method: "DELETE", budget: "prefs" },
  { file: "me/route.ts", method: "DELETE", budget: "bigDelete", body: { confirm_handle: "ann" } },
  { file: "me/org-invites/[id]/route.ts", method: "POST", budget: "prefs", body: { action: "decline" }, params: { id: ROW } },
];
const keyFor = (c: Case) => (c.budget === "follow" ? `follow:${ME}` : `budget-${c.budget}:${ME}`);
const numbersFor = (c: Case) => (c.budget === "follow" ? FOLLOW : BUDGETS[c.budget]);
const label = (c: Case) => `${c.method} ${c.file}`;

async function run(c: Case, allow: boolean, body = c.body) {
  const world = install(allow);
  const init: RequestInit = { method: c.method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await (await handler(c.file, c.method))(new Request("http://vibe.test/api/x", init), {
    params: Promise.resolve(c.params ?? {}),
  });
  return { res, world };
}

// ── The tests ────────────────────────────────────────────────────────────────

test("each action counts on its budget right after getUser: a refusal reads and writes nothing", async () => {
  for (const c of CASES) {
    const { res, world } = await run(c, false);
    assert.equal(res.status, 429, label(c));
    assert.deepEqual(world.log, ["getUser", `limit:${keyFor(c)}`], label(c));
    assert.deepEqual(world.limits[0].opts, numbersFor(c), label(c));
    assert.equal(res.headers.get("retry-after"), "240", label(c));
    const body = (await res.json()) as { ok: boolean; error?: string; code?: string };
    assert.equal(body.ok, false, label(c));
    // A plain sentence of its own, not the generic line, and no code: the
    // club screens read a 429 without one as "too many" (orgErrorCopy).
    assert.match(body.error ?? "", /^[A-Z][^]*\.$/, label(c));
    assert.notEqual(body.error, "Too many requests. Try again shortly.", label(c));
    assert.equal(body.code, undefined, label(c));
  }
});

test("an allowed call goes on past the limiter as before", async () => {
  for (const c of CASES) {
    const { res, world } = await run(c, true);
    assert.notEqual(res.status, 429, label(c));
    assert.deepEqual(world.log.slice(0, 2), ["getUser", `limit:${keyFor(c)}`], label(c));
    assert.ok(world.log.length > 2, `${label(c)} stopped at the limiter: ${world.log.join(", ")}`);
    assert.equal(world.limits.length, 1, `${label(c)} counted more than once`);
  }
});

test("the limiter comes before the Terms read, the publish gate and the post check", async () => {
  const gated = (await run(CASES[0], true)).world.log;
  assert.deepEqual(gated, ["getUser", `limit:budget-repost:${ME}`, "publish-gate", "post-access"]);
  for (const file of ["me/otto/reminders/route.ts", "me/personal-events/route.ts", "me/org-invites/[id]/route.ts"]) {
    const c = CASES.find((x) => x.file === file);
    assert.ok(c, file);
    assert.equal((await run(c, true)).world.log[2], "terms", file);
  }
});

test("follow and unfollow share one key at the same numbers", async () => {
  const follow: Case = { file: "me/follow/route.ts", method: "POST", budget: "follow", body: { target_id: OTHER } };
  const followed = await run(follow, true);
  assert.equal(followed.res.status, 200);
  const unfollow = CASES.find((c) => c.file === "me/follow/route.ts" && c.method === "DELETE");
  assert.ok(unfollow);
  const unfollowed = await run(unfollow, true, { target_id: OTHER });
  assert.equal(unfollowed.res.status, 200);
  assert.deepEqual(followed.world.limits, [{ key: `follow:${ME}`, opts: FOLLOW }]);
  assert.deepEqual(unfollowed.world.limits, followed.world.limits);
  // One key, one sentence: a refused follow and a refused unfollow read the same.
  const lines = [];
  for (const [c, body] of [[follow, { target_id: OTHER }], [unfollow, { target_id: OTHER }]] as const) {
    const refused = await run(c, false, body);
    assert.equal(refused.res.status, 429, label(c));
    lines.push(((await refused.res.json()) as { error?: string }).error);
  }
  assert.deepEqual(lines, ["Too many tries. Try again in a few minutes.", "Too many tries. Try again in a few minutes."]);
});

test("mark-read takes up to 200 ids and refuses more with a 400, never a silent cut", async () => {
  const markRead = CASES.find((c) => c.file === "me/notifications/mark-read/route.ts");
  assert.ok(markRead);
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  const tooMany = await run(markRead, true, { ids: ids(201) });
  assert.equal(tooMany.res.status, 400);
  assert.equal(((await tooMany.res.json()) as { error?: string }).error, "Pass at most 200 ids");
  assert.deepEqual(tooMany.world.log, ["getUser", `limit:budget-markRead:${ME}`], "no row is touched");

  const most = await run(markRead, true, { ids: ids(200) });
  assert.equal(most.res.status, 200);
  assert.deepEqual(most.world.log, ["getUser", `limit:budget-markRead:${ME}`, "cookie:notifications"]);

  const all = await run(markRead, true, { all: true });
  assert.equal(all.res.status, 200);
});

test("mark-read { all: true } (the Otto panels' own call on open) is never counted, even with the budget spent", async () => {
  const markRead = CASES.find((c) => c.file === "me/notifications/mark-read/route.ts");
  assert.ok(markRead);
  for (const allow of [true, false]) {
    const { res, world } = await run(markRead, allow, { all: true });
    assert.equal(res.status, 200, String(allow));
    assert.deepEqual(world.limits, [], String(allow));
    assert.deepEqual(world.log, ["getUser", "cookie:notifications"], String(allow));
  }
  const odd = await run(markRead, false, { all: "yes" });
  assert.equal(odd.res.status, 429, "any other body counts");
});
