/**
 * Tests for `following.ts` — the club follow rules and reads (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 F1).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/following.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. The hook maps "@/x" to "src/x.ts" (same pattern as
 * `src/lib/iu/community-scope.test.ts`). The module loads through dynamic
 * `import()` so the hook is registered first.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("following.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const specifier = "./following.ts";
const {
  CLIENT_FOLLOW_SOURCES,
  FOLLOWER_COUNT_FLOOR,
  FOLLOWER_LIST_ROLES,
  FOLLOW_SOURCES,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  canSeeFollowers,
  decodeFollowCursor,
  encodeFollowCursor,
  flattenCountEmbed,
  followKeysetOrFilter,
  isFollowSource,
  loadFollowerCount,
  loadOrgRole,
  loadViewerFollow,
  loadViewerFollowedOrgIds,
  loadVisibleOrgCards,
  normalizeFollowSource,
  parsePageLimit,
  publicFollowerCount,
} = (await import(specifier)) as typeof import("./following");

type Client = Parameters<typeof loadViewerFollowedOrgIds>[0];

const TS = "2026-05-06T06:24:44.908587+00:00";
const ID = "017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const VIEWER = "df5ab44e-0000-4000-8000-000000000001";
const ORG = "923896fb-0000-4000-8000-000000000002";

/**
 * A fake PostgREST client. Every builder call is recorded as `[method,
 * ...args]`; awaiting the builder (or calling `.maybeSingle()`) resolves to
 * `result`.
 */
function fakeClient(result: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit", "or", "notIn"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.maybeSingle = () => {
    calls.push(["maybeSingle"]);
    return Promise.resolve(result);
  };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { client: client as unknown as Client, calls };
}

/** Runs a loader that is expected to fail without printing its error log. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ── roles and sources ───────────────────────────────────────────────────────

test("only owners and admins see followers", () => {
  assert.deepEqual([...FOLLOWER_LIST_ROLES], ["owner", "admin"]);
  assert.equal(Object.isFrozen(FOLLOWER_LIST_ROLES), true);
  assert.equal(canSeeFollowers("owner"), true);
  assert.equal(canSeeFollowers("admin"), true);
  assert.equal(canSeeFollowers("mod"), false);
  assert.equal(canSeeFollowers("member"), false);
  assert.equal(canSeeFollowers(null), false);
  assert.equal(canSeeFollowers(undefined), false);
});

test("the source lists mirror the CHECK, and clients never get join", () => {
  assert.deepEqual([...FOLLOW_SOURCES], ["join", "profile", "discover", "onboarding"]);
  assert.deepEqual([...CLIENT_FOLLOW_SOURCES], ["profile", "discover", "onboarding"]);
  assert.equal(isFollowSource("join"), true);
  assert.equal(isFollowSource("map"), false);
  assert.equal(isFollowSource(null), false);
});

test("normalizeFollowSource keeps client sources and turns everything else into profile", () => {
  assert.equal(normalizeFollowSource("join"), "profile");
  assert.equal(normalizeFollowSource(undefined), "profile");
  assert.equal(normalizeFollowSource("map"), "profile");
  assert.equal(normalizeFollowSource(42), "profile");
  assert.equal(normalizeFollowSource("DISCOVER"), "profile");
  assert.equal(normalizeFollowSource("discover"), "discover");
  assert.equal(normalizeFollowSource("onboarding"), "onboarding");
  assert.equal(normalizeFollowSource("profile"), "profile");
});

// ── counts ──────────────────────────────────────────────────────────────────

test("publicFollowerCount hides small counts from everyone but officers", () => {
  assert.equal(FOLLOWER_COUNT_FLOOR, 5);
  assert.equal(publicFollowerCount(4, null), null);
  assert.equal(publicFollowerCount(5, null), 5);
  assert.equal(publicFollowerCount(1, "owner"), 1);
  assert.equal(publicFollowerCount(null, "admin"), null);
  assert.equal(publicFollowerCount(0, "admin"), 0);
  assert.equal(publicFollowerCount(4, "mod"), null);
  assert.equal(publicFollowerCount(4, "member"), null);
  assert.equal(publicFollowerCount(undefined, null), null);
  assert.equal(publicFollowerCount(Number.NaN, "owner"), null);
  assert.equal(publicFollowerCount(Number.POSITIVE_INFINITY, null), null);
});

test("flattenCountEmbed reads [{count}] and nothing else", () => {
  assert.equal(flattenCountEmbed([{ count: 3 }]), 3);
  assert.equal(flattenCountEmbed([{ count: 0 }]), 0);
  assert.equal(flattenCountEmbed(null), null);
  assert.equal(flattenCountEmbed(undefined), null);
  assert.equal(flattenCountEmbed([]), null);
  assert.equal(flattenCountEmbed([{ count: -1 }]), null);
  assert.equal(flattenCountEmbed([{ count: "3" }]), null);
  assert.equal(flattenCountEmbed({ count: 3 }), null);
  assert.equal(flattenCountEmbed([null]), null);
});

// ── paging ──────────────────────────────────────────────────────────────────

test("parsePageLimit defaults, floors and clamps", () => {
  assert.equal(PAGE_LIMIT_DEFAULT, 30);
  assert.equal(PAGE_LIMIT_MAX, 50);
  assert.equal(parsePageLimit(null), 30);
  assert.equal(parsePageLimit(""), 30);
  assert.equal(parsePageLimit("abc"), 30);
  assert.equal(parsePageLimit("0"), 30);
  assert.equal(parsePageLimit("-4"), 30);
  assert.equal(parsePageLimit("25"), 25);
  assert.equal(parsePageLimit("25.9"), 25);
  assert.equal(parsePageLimit("51"), 50);
  assert.equal(parsePageLimit("100000"), 50);
});

test("a cursor round-trips the raw timestamp exactly, microseconds included", () => {
  const raw = encodeFollowCursor(TS, ID);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const decoded = decodeFollowCursor(raw);
  assert.deepEqual(decoded, { ok: true, cursor: { t: TS, i: ID } });
  if (decoded.ok && decoded.cursor) assert.equal(decoded.cursor.t.endsWith("44.908587+00:00"), true);

  // PostgREST drops trailing zeros ("06:33:38.15764+00:00") and whole seconds.
  for (const t of ["2026-05-06T06:33:38.15764+00:00", "2026-05-06T06:33:38+00:00", "2026-05-06 06:33:38Z"]) {
    assert.deepEqual(decodeFollowCursor(encodeFollowCursor(t, ID)), { ok: true, cursor: { t, i: ID } });
  }
});

test("no cursor is the first page", () => {
  assert.deepEqual(decodeFollowCursor(null), { ok: true, cursor: null });
  assert.deepEqual(decodeFollowCursor(""), { ok: true, cursor: null });
});

test("decodeFollowCursor rejects anything it did not write", () => {
  // a non-uuid id
  assert.deepEqual(decodeFollowCursor(encodeFollowCursor(TS, "not-a-uuid")), { ok: false });
  assert.deepEqual(decodeFollowCursor(encodeFollowCursor(TS, `${ID},id.gt.0`)), { ok: false });
  // a timestamp smuggling PostgREST grammar
  assert.deepEqual(decodeFollowCursor(encodeFollowCursor(`${TS}",id.gt.`, ID)), { ok: false });
  assert.deepEqual(decodeFollowCursor(encodeFollowCursor("2026-05-06", ID)), { ok: false });
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // the right shape but not a real instant (month 13, hour 99)
  assert.deepEqual(
    decodeFollowCursor(b64(JSON.stringify({ t: "2026-13-45T99:99:99+00:00", i: ID }))),
    { ok: false },
  );
  // over 256 characters: a cursor that is otherwise valid, so only the length guard rejects it
  const long = b64(JSON.stringify({ t: TS, i: ID, pad: "x".repeat(300) }));
  assert.equal(long.length > 256, true);
  assert.match(long, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeFollowCursor(long), { ok: false });
  // not base64url, not JSON, the wrong JSON
  assert.deepEqual(decodeFollowCursor("garbage!"), { ok: false });
  assert.deepEqual(decodeFollowCursor("garbage"), { ok: false });
  assert.deepEqual(decodeFollowCursor(b64("not json")), { ok: false });
  assert.deepEqual(decodeFollowCursor(b64("null")), { ok: false });
  assert.deepEqual(decodeFollowCursor(b64(JSON.stringify([TS, ID]))), { ok: false });
  assert.deepEqual(decodeFollowCursor(b64(JSON.stringify({ t: 5, i: ID }))), { ok: false });
});

test("followKeysetOrFilter returns the exact quoted keyset string", () => {
  assert.equal(
    followKeysetOrFilter("first_followed_at", { t: TS, i: ID }),
    `first_followed_at.lt."${TS}",and(first_followed_at.eq."${TS}",id.lt.${ID})`,
  );
  assert.equal(
    followKeysetOrFilter("created_at", { t: TS, i: ID }),
    `created_at.lt."2026-05-06T06:24:44.908587+00:00",and(created_at.eq."2026-05-06T06:24:44.908587+00:00",id.lt.017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b)`,
  );
});

// ── reads ───────────────────────────────────────────────────────────────────

test("loadViewerFollowedOrgIds always filters on the viewer and orders newest first", async () => {
  const { client, calls } = fakeClient({
    data: [{ org_id: "a" }, { org_id: "b" }, { org_id: "a" }, { org_id: "c" }],
    error: null,
  });
  const res = await loadViewerFollowedOrgIds(client, VIEWER);
  assert.deepEqual(res, { ok: true, ids: ["a", "b", "c"] });
  assert.deepEqual(calls, [
    ["from", "org_followers"],
    ["select", "org_id"],
    ["eq", "user_id", VIEWER],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 1000],
  ]);

  const capped = fakeClient({ data: [], error: null });
  assert.deepEqual(await loadViewerFollowedOrgIds(capped.client, VIEWER, { limit: 50 }), {
    ok: true,
    ids: [],
  });
  assert.deepEqual(capped.calls.at(-1), ["limit", 50]);
  assert.ok(capped.calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === VIEWER));
});

test("loadViewerFollowedOrgIds reports a failed read instead of an empty list", async () => {
  const boom = { message: "boom" };
  const { client } = fakeClient({ data: null, error: boom });
  assert.deepEqual(await quietly(() => loadViewerFollowedOrgIds(client, VIEWER)), {
    ok: false,
    error: boom,
  });
});

test("loadViewerFollow reads one row by org and viewer", async () => {
  const row = { source: "discover", created_at: TS, first_followed_at: TS };
  const { client, calls } = fakeClient({ data: row, error: null });
  assert.deepEqual(await loadViewerFollow(client, ORG, VIEWER), { ok: true, row });
  assert.deepEqual(calls, [
    ["from", "org_followers"],
    ["select", "source, created_at, first_followed_at"],
    ["eq", "org_id", ORG],
    ["eq", "user_id", VIEWER],
    ["maybeSingle"],
  ]);
  const none = fakeClient({ data: null, error: null });
  assert.deepEqual(await loadViewerFollow(none.client, ORG, VIEWER), { ok: true, row: null });
  const failed = fakeClient({ data: null, error: { message: "x" } });
  const res = await quietly(() => loadViewerFollow(failed.client, ORG, VIEWER));
  assert.equal(res.ok, false);
});

test("loadOrgRole narrows the role and reports failures", async () => {
  const owner = fakeClient({ data: { role: "owner" }, error: null });
  assert.deepEqual(await loadOrgRole(owner.client, ORG, VIEWER), { ok: true, role: "owner" });
  assert.deepEqual(owner.calls.slice(0, 4), [
    ["from", "org_members"],
    ["select", "role"],
    ["eq", "org_id", ORG],
    ["eq", "user_id", VIEWER],
  ]);
  const none = fakeClient({ data: null, error: null });
  assert.deepEqual(await loadOrgRole(none.client, ORG, VIEWER), { ok: true, role: null });
  const failed = fakeClient({ data: null, error: { message: "x" } });
  assert.equal((await quietly(() => loadOrgRole(failed.client, ORG, VIEWER))).ok, false);
});

test("loadFollowerCount is a head count, and null (not 0) on a failed read", async () => {
  const ok = fakeClient({ count: 7, error: null });
  assert.equal(await loadFollowerCount(ok.client, ORG), 7);
  assert.deepEqual(ok.calls, [
    ["from", "org_followers"],
    ["select", "id", { count: "exact", head: true }],
    ["eq", "org_id", ORG],
  ]);
  const failed = fakeClient({ count: null, error: { message: "x" } });
  assert.equal(await quietly(() => loadFollowerCount(failed.client, ORG)), null);
  const missing = fakeClient({ count: null, error: null });
  assert.equal(await loadFollowerCount(missing.client, ORG), null);
});

test("loadVisibleOrgCards skips the query with no valid ids and filters hidden clubs", async () => {
  const empty = fakeClient({ data: [], error: null });
  const res = await loadVisibleOrgCards(empty.client, ["not-a-uuid", ""]);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.byId.size, 0);
  assert.deepEqual(empty.calls, []);

  const card = {
    id: ORG,
    handle: "sae",
    name: "SAE",
    logo_url: "orgs/x/logo.png",
    verified: true,
    is_public: false,
  };
  const { client, calls } = fakeClient({ data: [card], error: null });
  const got = await loadVisibleOrgCards(client, [ORG, ORG, "junk"]);
  assert.equal(got.ok, true);
  if (got.ok) assert.deepEqual(got.byId.get(ORG), card);
  assert.deepEqual(calls, [
    ["from", "orgs"],
    ["select", "id,handle,name,logo_url,verified,is_public"],
    ["in", "id", [ORG]],
    ["is", "hidden_at", null],
  ]);
  // hidden_at is filtered, never selected.
  assert.equal(String(calls[1][1]).includes("hidden_at"), false);

  const failed = fakeClient({ data: null, error: { message: "x" } });
  assert.equal((await quietly(() => loadVisibleOrgCards(failed.client, [ORG]))).ok, false);
});
