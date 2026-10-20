/**
 * GET /api/school-events (CONTRACT.md §3.1-3.2, §3.6, §8), run for real on
 * stand-ins: 401 signed out; 429 from the day budget (its key and numbers
 * from BUDGETS); the campus rule (home, visiting, `all`, bad ids); each
 * campus fetching only its own calendars (Bloomington since Oct 19, 2026);
 * no fetch at all on a campus without calendars or with the switch off (env,
 * a campus id, or the settings row);
 * every calendar failing still answers 200 with no events, never a 500; and
 * read-server.ts's guards: the plain User-Agent, the 2 h Data Cache and no
 * redirects on every fetch, the 10-minute memo, the last good list kept
 * under 24 h (also when Next serves an old copy), non-calendar and oversize
 * bodies refused and dropped from Next's cache, the log lines for a feed that
 * goes quiet or grows too big to cache, the switch row's timeout, the
 * dev-only fake clock.
 *
 * Run with:
 *   node --test src/app/api/school-events/route.test.ts
 *
 * WHY THE RESOLVE HOOK (the follower-board-routes.test.ts pattern): the
 * route imports `next/server` (resolvable under Node only as
 * `next/server.js`), `server-only`, `next/cache` (revalidateTag needs a
 * running Next), both Supabase clients and the limiter.
 * Those resolve to small data: modules that answer from one
 * `globalThis.__se` world; budgets, the campus helpers and every
 * school-events file are the real code. `fetch` is replaced, so no test ever
 * reaches a calendar site.
 *
 * WHY THE VERSION: read-server.ts keeps a memo per server instance. Each
 * `freshRoute()` loads the route with a new `?v=` and resolves read-server
 * with the same one, so every test starts with an empty memo.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__se";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "next/cache": stub(`export function revalidateTag(tag, profile) { ${W}.revalidated.push([tag, profile]); }`),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie(); }`),
  "@/lib/supabase/service": stub(
    `export function createSupabaseServiceClient() { return ${W}.service(); }\n` +
      `export function isSupabaseServiceConfigured() { return ${W}.serviceConfigured; }`,
  ),
  "@/lib/rate-limit": stub(
    `export async function rateLimit(key, opts) { ${W}.limits.push({ key, opts });\n` +
      `  return ${W}.allow ? { allowed: true, retryAfterSec: 0, reason: null } : { allowed: false, retryAfterSec: 4000, reason: 'limited' }; }\n` +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.', code) {\n" +
      "  return new Response(JSON.stringify(code ? { ok: false, code, error: message } : { ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier === "@/lib/school-events/read-server") {
      const version = (globalThis as unknown as { __se: { version: number } }).__se.version;
      return nextResolve(new URL(`lib/school-events/read-server.ts?v=${version}`, SRC_ROOT).href, context);
    }
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const { BUDGETS } = await import("@/lib/limits/budgets");
const { SCHOOL_FEEDS, feedsForCampus } = await import("@/lib/school-events/sources");
const INDY_FEEDS = feedsForCampus("indianapolis");
const IUB_FEEDS = feedsForCampus("iu-bloomington");
/** What a feed looks like on the wire: no feed address, no rules. */
const wire = (feeds: typeof SCHOOL_FEEDS) =>
  feeds.map(({ key, host, credit, calendar_url, role, label }) => ({ key, host, credit, calendar_url, role, label }));

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const FIXTURES = new URL("../../../lib/school-events/fixtures/", import.meta.url);
const ATHLETICS_ICS = readFileSync(new URL("athletics.ics", FIXTURES), "utf8");
const AFFAIRS_ICS = readFileSync(new URL("iu-student-affairs.ics", FIXTURES), "utf8");
const IUB_ATHLETICS_ICS = readFileSync(new URL("iub-athletics.ics", FIXTURES), "utf8");
const IUB_LIFE_ICS = readFileSync(new URL("iub-student-life.ics", FIXTURES), "utf8");
const IUB_FEATURED_ICS = readFileSync(new URL("iub-featured.ics", FIXTURES), "utf8");
const EMPTY_ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
/** Thu Oct 22 2026, 2:00 PM on campus: the Natatorium swim meet is at 3. */
const NOW = Date.parse("2026-10-22T18:00:00Z");

type Fetched = { url: string; init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } };
type World = {
  version: number;
  user: { id: string } | null;
  me: { data: unknown; error: unknown };
  meThrows: boolean;
  allow: boolean;
  limits: { key: string; opts: unknown }[];
  serviceConfigured: boolean;
  row: { data: unknown; error: unknown };
  rowReads: number;
  /** The signal the switch row's read was given (the timeout). */
  rowSignal: AbortSignal | null;
  /** When true, the row read never answers on its own; only its signal ends it. */
  rowHangs: boolean;
  usersReads: number;
  /** Every revalidateTag call: [tag, profile]. */
  revalidated: [string, unknown][];
  fetches: Fetched[];
  /** What a calendar answers: a Response, or throw to make fetch reject. */
  respond: (url: string) => Response;
  cookie: () => unknown;
  service: () => unknown;
};

/**
 * A chain that answers `answer()` from maybeSingle. `abortSignal` is kept;
 * with `hangs()` true the read only ends when that signal fires, answering
 * the error supabase-js gives for an aborted request.
 */
function chain(answer: () => unknown, onRead: () => void, onSignal: (s: AbortSignal) => void = () => {}, hangs = () => false) {
  const q: Record<string, unknown> = {};
  let signal: AbortSignal | null = null;
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.abortSignal = (s: AbortSignal) => {
    signal = s;
    onSignal(s);
    return q;
  };
  q.maybeSingle = async () => {
    onRead();
    if (!hangs()) return answer();
    return new Promise((resolve) => {
      signal?.addEventListener("abort", () => resolve({ data: null, error: { message: "AbortError: aborted" } }));
    });
  };
  return q;
}

function freshWorld(): World {
  const w: World = {
    version: ((globalThis as unknown as { __se?: World }).__se?.version ?? 0) + 1,
    user: { id: ME },
    me: { data: { school: "IU Indianapolis", campus_id: "indianapolis", school_system: "iu" }, error: null },
    meThrows: false,
    allow: true,
    limits: [],
    serviceConfigured: true,
    row: { data: null, error: null },
    rowReads: 0,
    rowSignal: null,
    rowHangs: false,
    usersReads: 0,
    revalidated: [],
    fetches: [],
    respond: (url) => {
      if (url.includes("iuindyjags.com")) return new Response(ATHLETICS_ICS, { status: 200 });
      if (url.endsWith("/group_id/24")) return new Response(AFFAIRS_ICS, { status: 200 });
      if (url.includes("iuhoosiers.com")) return new Response(IUB_ATHLETICS_ICS, { status: 200 });
      if (url.endsWith("/group_id/76")) return new Response(IUB_LIFE_ICS, { status: 200 });
      if (url.endsWith("/group_id/341")) return new Response(IUB_FEATURED_ICS, { status: 200 });
      return new Response(EMPTY_ICS, { status: 200 });
    },
    cookie: () => ({
      auth: { getUser: async () => ({ data: { user: w.user }, error: null }) },
      from: (table: string) => {
        assert.equal(table, "users");
        if (w.meThrows) throw new Error("boom");
        return chain(() => w.me, () => (w.usersReads += 1));
      },
    }),
    service: () => ({
      from: (table: string) => {
        assert.equal(table, "app_settings");
        return chain(
          () => w.row,
          () => (w.rowReads += 1),
          (s) => (w.rowSignal = s),
          () => w.rowHangs,
        );
      },
    }),
  };
  (globalThis as unknown as { __se: World }).__se = w;
  return w;
}

/** A new world, a stubbed fetch, the clock at NOW, quiet logs, and a route with its own read-server. */
async function setup(t: TestContext, env: Record<string, string | undefined> = {}) {
  const w = freshWorld();
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    w.fetches.push({ url, init: init as Fetched["init"] });
    return w.respond(url);
  });
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const warn = t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  const saved: Record<string, string | undefined> = {};
  for (const key of ["SCHOOL_EVENTS_OFF", "SCHOOL_EVENTS_FIXTURES", "NODE_ENV", ...Object.keys(env)]) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const route = (await import(`./route.ts?v=${w.version}`)) as { GET: (req: Request) => Promise<Response> };
  // Every page since Oct 19, 2026 says `cards=any`; `{ oldPage: true }` is a tab from before that.
  const get = async (query = "", { oldPage = false } = {}) => {
    const q = oldPage ? query : `${query}${query ? "&" : "?"}cards=any`;
    const res = await route.GET(new Request(`http://localhost/api/school-events${q}`));
    return { res, status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { w, get, warn, error };
}

const OFF = (campus_id: string | null) => ({ ok: true, school_on: false, campus_id, events: [], sources: [] });

// ── The route ────────────────────────────────────────────────────────────────

test("401 signed out: no limiter, no database read, no fetch", async (t) => {
  const { w, get } = await setup(t);
  w.user = null;
  const { res, status, body } = await get();
  assert.equal(status, 401);
  assert.deepEqual(body, { ok: false, code: "unauthorized", error: "Unauthorized" });
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual([w.limits.length, w.usersReads, w.fetches.length], [0, 0, 0]);
});

test("429 from the day budget: its key and numbers come from BUDGETS, nothing else runs", async (t) => {
  const { w, get } = await setup(t);
  w.allow = false;
  const { res, status, body } = await get();
  assert.equal(status, 429);
  assert.deepEqual(body, { ok: false, error: "Too many tries. Try again later." });
  assert.equal(res.headers.get("retry-after"), "4000");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(w.limits, [{ key: `budget-schoolEventsRead:${ME}`, opts: BUDGETS.schoolEventsRead }]);
  assert.deepEqual(BUDGETS.schoolEventsRead, { limit: 2000, windowSec: 86_400 });
  assert.deepEqual([w.usersReads, w.rowReads, w.fetches.length], [0, 0, 0]);
});

test("home Indianapolis: every calendar, merged around now, with their credits", async (t) => {
  const { w, get } = await setup(t);
  const { res, status, body } = await get();
  assert.equal(status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(body.ok, true);
  assert.equal(body.school_on, true);
  assert.equal(body.campus_id, "indianapolis");
  assert.deepEqual(body.sources, wire(INDY_FEEDS));
  const events = body.events as { id: string; title: string; starts_at: string; source: string }[];
  assert.ok(events.length > 0);
  // From 4 days ago up to 8 days ahead, soonest first.
  const starts = events.map((e) => Date.parse(e.starts_at));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.ok(starts.every((s) => s >= NOW - 4 * 86_400_000 && s < NOW + 8 * 86_400_000));
  assert.ok(events.some((e) => e.title === "IU Indy vs Ball State" && e.starts_at === "2026-10-22T19:00:00.000Z"));
  assert.ok(events.some((e) => e.title === "Graduate School Fair"));
  // Every fetch went to one of Indy's fixed feed addresses, each once; never a Bloomington one.
  assert.deepEqual(w.fetches.map((f) => f.url).sort(), INDY_FEEDS.map((f) => f.feed_url).sort());
  assert.equal(w.rowReads, 1);
});

test("home Bloomington (Oct 19, 2026): its three calendars only, games as 'IU vs ...', no Indy fetch", async (t) => {
  const { w, get } = await setup(t);
  w.me = { data: { school: "IU Bloomington", campus_id: "iu-bloomington", school_system: "iu" }, error: null };
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.school_on, true);
  assert.equal(body.campus_id, "iu-bloomington");
  assert.deepEqual(body.sources, wire(IUB_FEEDS));
  assert.deepEqual(w.fetches.map((f) => f.url).sort(), IUB_FEEDS.map((f) => f.feed_url).sort());
  const events = body.events as { title: string; source: string; featured: boolean; starts_at: string; url: string | null }[];
  assert.ok(events.some((e) => e.title === "IU vs Purdue" && e.starts_at === "2026-10-22T23:00:00.000Z"));
  assert.ok(events.every((e) => e.source.startsWith("iub-")));
  // Group 341 is a plain calendar here: nothing leads as "Featured by your school".
  assert.ok(events.every((e) => e.featured === false));
  assert.ok(events.filter((e) => e.source === "iub-athletics").every((e) => e.url === null || e.url.startsWith("https://iuhoosiers.com/")));
  // Visiting Indianapolis from Bloomington follows the campus on screen, and reads only Indy's calendars.
  const before = w.fetches.length;
  const visiting = await get("?campus=indianapolis");
  assert.equal(visiting.body.campus_id, "indianapolis");
  assert.deepEqual(visiting.body.sources, wire(INDY_FEEDS));
  assert.deepEqual(w.fetches.slice(before).map((f) => f.url).sort(), INDY_FEEDS.map((f) => f.feed_url).sort());
});

test("a page from before Oct 19, 2026 (no `cards=any`) is never sent a calendar its card can't draw", async (t) => {
  // Its card crashed on any calendar name but Indy's three, taking the whole app to the error page.
  const { w, get } = await setup(t);
  w.me = { data: { school: "IU Bloomington", campus_id: "iu-bloomington", school_system: "iu" }, error: null };
  assert.deepEqual((await get("", { oldPage: true })).body, OFF("iu-bloomington"));
  assert.ok(w.fetches.every((f) => !IUB_FEEDS.some((feed) => feed.feed_url === f.url)), "nothing fetched for it");
  // Indy answers that page exactly as before.
  const indy = await get("?campus=indianapolis", { oldPage: true });
  assert.equal(indy.body.school_on, true);
  assert.deepEqual(indy.body.sources, wire(INDY_FEEDS));
  // Any other value of `cards` is an old page too.
  assert.deepEqual((await get("?cards=1", { oldPage: true })).body, OFF("iu-bloomington"));
});

test("a campus without calendars, ?campus=all, or no campus: school_on false and no fetch at all", async (t) => {
  const { w, get } = await setup(t);
  w.me = { data: { school: "IU Kokomo", campus_id: "iu-kokomo", school_system: "iu" }, error: null };
  assert.deepEqual((await get()).body, OFF("iu-kokomo"));
  w.me = { data: { school: "IU Indianapolis", campus_id: "indianapolis", school_system: "iu" }, error: null };
  assert.deepEqual((await get("?campus=iu-kokomo")).body, OFF("iu-kokomo"));
  assert.deepEqual((await get("?campus=all")).body, OFF(null));
  w.me = { data: { school: null, campus_id: null, school_system: "iu" }, error: null };
  assert.deepEqual((await get()).body, OFF(null));
  assert.equal(w.fetches.length, 0);
  // None of these read the switch row either.
  assert.equal(w.rowReads, 0);
});

test("a bad ?campus= answers as GET /api/events does", async (t) => {
  const { w, get } = await setup(t);
  const unknown = await get("?campus=nowhere");
  assert.equal(unknown.status, 400);
  assert.deepEqual(unknown.body, { ok: false, code: "unknown_campus", error: "Unknown campus." });
  w.me = { data: { school: null, campus_id: "indianapolis", school_system: null }, error: null };
  const noSystem = await get("?campus=indianapolis");
  assert.equal(noSystem.status, 403);
  assert.equal(noSystem.body.code, "campus_not_in_system");
  assert.equal(w.fetches.length, 0);
});

test("the viewer row can't be read: no campus, school_on false, logged", async (t) => {
  const { w, get, error } = await setup(t);
  w.me = { data: null, error: { message: "timeout" } };
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.deepEqual(body, OFF(null));
  assert.equal(w.fetches.length, 0);
  assert.equal(error.mock.callCount(), 1);
});

test("anything thrown past sign-in answers the off body, logged once per instance", async (t) => {
  const { w, get, error } = await setup(t);
  w.meThrows = true;
  for (let i = 0; i < 3; i++) {
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.deepEqual(body, OFF(null));
  }
  assert.equal(error.mock.callCount(), 1);
});

test("the sign-in check throwing is a 401, never a 500, and nothing else runs", async (t) => {
  await t.test("the client can't be made (a missing env)", async (st) => {
    const { w, get } = await setup(st);
    w.cookie = () => {
      throw new Error("no supabase url");
    };
    const { res, status, body } = await get();
    assert.equal(status, 401);
    assert.deepEqual(body, { ok: false, code: "unauthorized", error: "Unauthorized" });
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.deepEqual([w.limits.length, w.usersReads, w.fetches.length], [0, 0, 0]);
  });
  await t.test("getUser itself throws", async (st) => {
    const { w, get } = await setup(st);
    w.cookie = () => ({
      auth: {
        getUser: async () => {
          throw new Error("auth down");
        },
      },
    });
    const { status } = await get();
    assert.equal(status, 401);
    assert.deepEqual([w.limits.length, w.fetches.length], [0, 0]);
  });
});

test("the limiter throwing answers the off body (no calendar data), never a 500", async (t) => {
  const { w, get } = await setup(t);
  // The stub records each count with limits.push; a push that throws stands
  // in for a limiter that throws instead of taking its own failure path.
  w.limits = {
    push() {
      throw new Error("rpc exploded");
    },
  } as unknown as World["limits"];
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.deepEqual(body, OFF(null));
  assert.equal(w.fetches.length, 0);
});

// ── The switch ───────────────────────────────────────────────────────────────

test("switch: SCHOOL_EVENTS_OFF=true hides everything, with no fetch and no row read", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "true" });
  assert.deepEqual((await get()).body, OFF("indianapolis"));
  assert.deepEqual([w.fetches.length, w.rowReads], [0, 0]);
});

test("switch: an unknown word in SCHOOL_EVENTS_OFF hides nothing (Oct 19, 2026: it used to hide every campus)", async (t) => {
  const { w, get, warn } = await setup(t, { SCHOOL_EVENTS_OFF: "iub-athletcs" });
  const { body } = await get();
  assert.equal(body.school_on, true);
  assert.deepEqual((body.sources as { key: string }[]).map((s) => s.key), ["athletics", "iu-student-affairs", "iu-featured"]);
  assert.equal(w.fetches.length, 3);
  assert.ok(warn.mock.calls.some((c) => String(c.arguments[1]).includes("unknown words ignored")));
});

test("switch: a campus id turns off that campus only; a Bloomington key never touches Indy", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "iu-bloomington" });
  // Indy is untouched.
  const indy = await get();
  assert.equal(indy.body.school_on, true);
  assert.deepEqual(indy.body.sources, wire(INDY_FEEDS));
  // Bloomington: every calendar off, so the school part hides, and nothing is fetched for it.
  const before = w.fetches.length;
  assert.deepEqual((await get("?campus=iu-bloomington")).body, OFF("iu-bloomington"));
  assert.equal(w.fetches.length, before);
});

test("switch: SCHOOL_EVENTS_OFF=iub-athletics drops Bloomington's games and their credit, nothing else", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "iub-athletics" });
  w.me = { data: { school: "IU Bloomington", campus_id: "iu-bloomington", school_system: "iu" }, error: null };
  const { body } = await get();
  assert.equal(body.school_on, true);
  assert.deepEqual((body.sources as { key: string }[]).map((s) => s.key), ["iub-student-life", "iub-featured"]);
  assert.ok((body.events as { kind: string }[]).every((e) => e.kind === "event"));
  assert.ok(w.fetches.every((f) => !f.url.includes("iuhoosiers.com")));
  // Indy's games stay on.
  const indy = await get("?campus=indianapolis");
  assert.ok((indy.body.events as { kind: string }[]).some((e) => e.kind === "game"));
});

test("switch: SCHOOL_EVENTS_OFF=athletics drops just that calendar and its credit", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "athletics" });
  const { body } = await get();
  assert.equal(body.school_on, true);
  assert.deepEqual(
    (body.sources as { key: string }[]).map((s) => s.key),
    ["iu-student-affairs", "iu-featured"],
  );
  assert.ok((body.events as { source: string }[]).every((e) => e.source !== "athletics"));
  assert.ok(w.fetches.every((f) => !f.url.includes("iuindyjags.com")));
});

test("switch: the app_settings row turns calendars off, remembered 30 s, last good kept on an error", async (t) => {
  const { w, get } = await setup(t);
  w.row = { data: { value: true }, error: null };
  assert.deepEqual((await get()).body, OFF("indianapolis"));
  assert.equal(w.fetches.length, 0);
  // Within 30 s the row isn't read again.
  w.row = { data: null, error: null };
  assert.deepEqual((await get()).body, OFF("indianapolis"));
  assert.equal(w.rowReads, 1);
  // After 30 s, an error keeps the last good value (off), not on.
  t.mock.timers.tick(31_000);
  w.row = { data: null, error: { message: "down" } };
  assert.deepEqual((await get()).body, OFF("indianapolis"));
  assert.equal(w.rowReads, 2);
  // The row deleted: on again.
  t.mock.timers.tick(31_000);
  w.row = { data: null, error: null };
  assert.equal((await get()).body.school_on, true);
  // A key list: those calendars off.
  t.mock.timers.tick(31_000);
  w.row = { data: { value: ["iu-featured"] }, error: null };
  assert.deepEqual(
    ((await get()).body.sources as { key: string }[]).map((s) => s.key),
    ["athletics", "iu-student-affairs"],
  );
});

test("switch: a row read that stalls gives up after 1.5 s and answers on (never a hung route)", async (t) => {
  const { w, get } = await setup(t);
  w.rowHangs = true;
  const started = performance.now();
  const { status, body } = await get();
  const took = performance.now() - started;
  assert.equal(status, 200);
  assert.equal(body.school_on, true);
  assert.ok(w.rowSignal instanceof AbortSignal);
  assert.ok(took >= 1400 && took < 4000, `took ${Math.round(took)} ms`);
});

test("switch: no service key or an unreadable row before any good read means on", async (t) => {
  await t.test("no service key", async (st) => {
    const { w, get } = await setup(st);
    w.serviceConfigured = false;
    assert.equal((await get()).body.school_on, true);
    assert.equal(w.rowReads, 0);
  });
  await t.test("the row errors on the first read", async (st) => {
    const { w, get } = await setup(st);
    w.row = { data: null, error: { message: "down" } };
    assert.equal((await get()).body.school_on, true);
    assert.equal(w.rowReads, 1);
  });
});

// ── Calendars failing ────────────────────────────────────────────────────────

test("every calendar throwing: 200 with no events (never a 500), one warning per calendar", async (t) => {
  const { w, get, warn } = await setup(t);
  w.respond = () => {
    throw new TypeError("fetch failed");
  };
  for (let i = 0; i < 2; i++) {
    t.mock.timers.tick(11 * 60_000);
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.equal(body.school_on, true);
    assert.deepEqual(body.events, []);
    assert.equal((body.sources as unknown[]).length, 3);
  }
  assert.equal(w.fetches.length, 6);
  assert.equal(warn.mock.callCount(), 3);
  assert.deepEqual(
    warn.mock.calls.map((c) => c.arguments),
    INDY_FEEDS.map((f) => ["[school-events]", f.key, "fetch_failed"]),
  );
});

test("a timeout, a non-200, a redirect, a body that isn't a calendar, or one too big each count as down", async (t) => {
  // The last field: whether Next would have stored it (a 200), so its cached copy must be dropped.
  const bodies: [string, () => Response, boolean][] = [
    ["timeout", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, false],
    ["status_503", () => new Response("busy", { status: 503 }), false],
    ["status_304", () => new Response(null, { status: 304 }), false],
    // A redirect is not followed (redirect: "manual"), so another site's text never gets parsed.
    ["status_302", () => new Response(null, { status: 302, headers: { location: "https://parked.example/cal.ics" } }), false],
    ["not_ics", () => new Response("<html>maintenance</html>", { status: 200 }), true],
    ["too_big", () => new Response("x", { status: 200, headers: { "content-length": String(9_000_000) } }), true],
    ["too_big", () => new Response("BEGIN:VCALENDAR\n" + "x".repeat(2_000_001), { status: 200 }), true],
  ];
  for (const [i, [reason, respond, dropped]] of bodies.entries()) {
    await t.test(`${i}: ${reason}`, async (st) => {
      const { w, get, warn } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
      w.respond = respond;
      const { status, body } = await get();
      assert.equal(status, 200);
      assert.equal(body.school_on, true);
      assert.deepEqual(body.events, []);
      assert.deepEqual(warn.mock.calls.at(-1)?.arguments, ["[school-events]", "athletics", reason]);
      assert.deepEqual(w.revalidated, dropped ? [["school-events:athletics", { expire: 0 }]] : []);
    });
  }
});

test("a refused 200 from Next's stored copy is dropped every time it's read, so it can't stick", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
  w.respond = () => new Response("<html>maintenance</html>", { status: 200 });
  await get();
  t.mock.timers.tick(11 * 60_000);
  await get();
  assert.equal(w.revalidated.length, 2);
  // Good answers never drop anything.
  w.respond = () => new Response(ATHLETICS_ICS, { status: 200 });
  t.mock.timers.tick(11 * 60_000);
  assert.ok(((await get()).body.events as unknown[]).length > 0);
  assert.equal(w.revalidated.length, 2);
});

test("Next serving a copy from over 24 h ago (the site down since) shows nothing; a younger one shows", async (t) => {
  const dated = (msAgo: number) => () =>
    new Response(ATHLETICS_ICS, { status: 200, headers: { date: new Date(NOW - msAgo).toUTCString() } });
  await t.test("23 h old: kept", async (st) => {
    const { w, get, warn } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
    w.respond = dated(23 * 3_600_000);
    assert.ok(((await get()).body.events as unknown[]).length > 0);
    assert.equal(warn.mock.callCount(), 0);
  });
  await t.test("25 h old: down", async (st) => {
    const { w, get, warn } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
    w.respond = dated(25 * 3_600_000);
    assert.deepEqual((await get()).body.events, []);
    assert.deepEqual(warn.mock.calls.at(-1)?.arguments, ["[school-events]", "athletics", "stale_copy"]);
  });
  await t.test("ahead of our clock, or unreadable: taken as now", async (st) => {
    const { w, get } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
    w.respond = dated(-3_600_000);
    assert.ok(((await get()).body.events as unknown[]).length > 0);
    st.mock.timers.tick(11 * 60_000);
    w.respond = () => new Response(ATHLETICS_ICS, { status: 200, headers: { date: "someday" } });
    assert.ok(((await get()).body.events as unknown[]).length > 0);
  });
});

test("log lines for a feed going quiet (rows in, none kept) or too big for Next's cache", async (t) => {
  const AWAY_ONLY =
    "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261023T220000Z\r\nSUMMARY:IU Indy Volleyball at Oakland\r\nLOCATION:Rochester\\, Mich.\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  await t.test("none kept: a good (empty) answer, said once", async (st) => {
    const { w, get, warn } = await setup(st);
    const ALL_DAY_ONLY = AWAY_ONLY.replace("DTSTART:20261023T220000Z", "DTSTART;VALUE=DATE:20261023");
    w.respond = (url) =>
      new Response(url.includes("iuindyjags.com") ? AWAY_ONLY : url.endsWith("/342") ? ALL_DAY_ONLY : AFFAIRS_ICS, { status: 200 });
    const { body } = await get();
    assert.ok((body.events as { source: string }[]).every((e) => e.source === "iu-student-affairs"));
    // Athletics is reported; Featured (whose few rows can all be all-day) is not.
    assert.deepEqual(warn.mock.calls.map((c) => c.arguments), [["[school-events]", "athletics", "none_kept"]]);
  });
  await t.test("by the featured flag, not the key: Bloomington's plain 'featured' group is reported", async (st) => {
    const { w, get, warn } = await setup(st, { SCHOOL_EVENTS_OFF: "iub-athletics,iub-student-life" });
    w.me = { data: { school: "IU Bloomington", campus_id: "iu-bloomington", school_system: "iu" }, error: null };
    const ALL_DAY_ONLY = AWAY_ONLY.replace("DTSTART:20261023T220000Z", "DTSTART;VALUE=DATE:20261023");
    w.respond = () => new Response(ALL_DAY_ONLY, { status: 200 });
    assert.deepEqual((await get()).body.events, []);
    assert.deepEqual(warn.mock.calls.map((c) => c.arguments), [["[school-events]", "iub-featured", "none_kept"]]);
  });
  await t.test("over about 1.5 MB: still shown, said once", async (st) => {
    const { w, get, warn } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
    w.respond = () => new Response(ATHLETICS_ICS.replace("BEGIN:VCALENDAR", `BEGIN:VCALENDAR\r\nX-PAD:${"x".repeat(1_600_000)}`), { status: 200 });
    assert.ok(((await get()).body.events as unknown[]).length > 0);
    assert.deepEqual(warn.mock.calls.map((c) => c.arguments), [["[school-events]", "athletics", "too_big_to_cache"]]);
  });
});

// ── read-server.ts: how the sites are asked ───────────────────────────────────

test("every fetch: the plain User-Agent (no email), text/calendar, the 2 h Data Cache with tags, a timeout", async (t) => {
  const { w, get } = await setup(t);
  await get();
  assert.equal(w.fetches.length, 3);
  for (const { url, init } of w.fetches) {
    const feed = SCHOOL_FEEDS.find((f) => f.feed_url === url);
    assert.ok(feed, url);
    assert.deepEqual(init.headers, { "user-agent": "Vibe/1 (+https://www.connectvibe.app)", accept: "text/calendar" });
    assert.ok(!JSON.stringify(init.headers).includes("@"));
    assert.deepEqual(init.next, { revalidate: 7200, tags: ["school-events", `school-events:${feed.key}`] });
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, undefined);
    assert.equal(init.method, undefined);
  }
});

test("the memo: no fetch within 10 minutes of the last try, one in-flight read shared", async (t) => {
  const { w, get } = await setup(t);
  await Promise.all([get(), get(), get()]);
  assert.equal(w.fetches.length, 3);
  t.mock.timers.tick(9 * 60_000);
  await get();
  assert.equal(w.fetches.length, 3);
  t.mock.timers.tick(2 * 60_000);
  await get();
  assert.equal(w.fetches.length, 6);
});

test("a calendar that goes down keeps its last good list under 24 h, then shows nothing", async (t) => {
  const { w, get } = await setup(t, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
  const ids = (body: Record<string, unknown>) => (body.events as { id: string }[]).map((e) => e.id);
  const good = ids((await get()).body);
  assert.ok(good.length > 0);
  w.respond = () => new Response("down", { status: 500 });
  t.mock.timers.tick(11 * 60_000);
  // The whole kept list is served; the 8-day window moves with the clock, so it may reach one game further.
  const kept = ids((await get()).body);
  assert.ok(good.every((id) => kept.includes(id)));
  assert.equal(w.fetches.length, 2);
  // Still down at 23 h 55 min: still the kept list (asked again, failed again).
  t.mock.timers.tick(23 * 60 * 60_000 + 55 * 60_000 - 11 * 60_000);
  assert.ok(ids((await get()).body).length > 0);
  assert.equal(w.fetches.length, 3);
  // 24 h 1 min after the last good read, inside the 10-minute memo: nothing, and no fetch.
  t.mock.timers.tick(6 * 60_000);
  assert.deepEqual((await get()).body.events, []);
  assert.equal(w.fetches.length, 3);
  // The next try fails too: still nothing.
  t.mock.timers.tick(11 * 60_000);
  assert.deepEqual((await get()).body.events, []);
  assert.equal(w.fetches.length, 4);
  // The site comes back: the list returns at the next try.
  w.respond = () => new Response(ATHLETICS_ICS, { status: 200 });
  t.mock.timers.tick(11 * 60_000);
  assert.ok(((await get()).body.events as unknown[]).length > 0);
});

test("an empty calendar (Featured, Oct 19) is a good answer, not a failure", async (t) => {
  const { warn, get } = await setup(t, { SCHOOL_EVENTS_OFF: "athletics,iu-student-affairs" });
  const { body } = await get();
  assert.equal(body.school_on, true);
  assert.deepEqual(body.events, []);
  assert.equal(warn.mock.callCount(), 0);
});

test("&now= fakes the clock in development only", async (t) => {
  await t.test("production ignores it", async (st) => {
    const { get } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured" });
    const events = (await get("?now=2026-11-07T21:00:00Z")).body.events as { title: string }[];
    assert.ok(!events.some((e) => e.title === "IU Indy vs UT Martin"));
  });
  await t.test("development uses it", async (st) => {
    const { get } = await setup(st, { SCHOOL_EVENTS_OFF: "iu-student-affairs,iu-featured", NODE_ENV: "development" });
    const events = (await get("?now=2026-11-07T21:00:00Z")).body.events as { title: string }[];
    assert.ok(events.some((e) => e.title === "IU Indy vs UT Martin"));
    // A junk value falls back to the real clock.
    const real = (await get("?now=soon")).body.events as { title: string }[];
    assert.ok(real.some((e) => e.title === "IU Indy vs Ball State"));
  });
});

test("SCHOOL_EVENTS_FIXTURES reads the fixture files in development, never the network", async (t) => {
  await t.test("1: the fixtures", async (st) => {
    const { w, get } = await setup(st, { NODE_ENV: "development", SCHOOL_EVENTS_FIXTURES: "1" });
    const { body } = await get();
    assert.equal(w.fetches.length, 0);
    const events = body.events as { title: string; source: string }[];
    assert.ok(events.some((e) => e.source === "athletics"));
    assert.ok(events.some((e) => e.source === "iu-student-affairs"));
  });
  await t.test("1 in Bloomington: the three iub-* fixtures (Oct 19, 2026), never the network", async (st) => {
    const { w, get } = await setup(st, { NODE_ENV: "development", SCHOOL_EVENTS_FIXTURES: "1" });
    w.me = { data: { school: "IU Bloomington", campus_id: "iu-bloomington", school_system: "iu" }, error: null };
    const events = (await get("?now=2026-10-22T22:00:00Z")).body.events as { title: string; source: string }[];
    assert.equal(w.fetches.length, 0);
    for (const key of ["iub-athletics", "iub-student-life", "iub-featured"]) assert.ok(events.some((e) => e.source === key), key);
    assert.ok(events.some((e) => e.title === "IU vs Purdue"));
  });
  await t.test("fail: every calendar down", async (st) => {
    const { w, get, warn } = await setup(st, { NODE_ENV: "development", SCHOOL_EVENTS_FIXTURES: "fail" });
    const { status, body } = await get();
    assert.equal(status, 200);
    assert.deepEqual(body.events, []);
    assert.equal(w.fetches.length, 0);
    assert.equal(warn.mock.callCount(), 3);
  });
  await t.test("ignored outside development", async (st) => {
    const { w, get } = await setup(st, { SCHOOL_EVENTS_FIXTURES: "1" });
    await get();
    assert.equal(w.fetches.length, 3);
  });
});
