/**
 * Tests for `org-mutes.ts` (club model gap 2: mute a club's posts).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/org-mutes.test.ts
 *
 * The module has no runtime imports, so it loads without a resolve hook.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./org-mutes.ts";
const {
  MUTED_ORG_FILTER_CAP,
  MUTED_ORG_READ_LIMIT,
  ORG_POST_MUTES_TABLE,
  isMissingOrgMutesTable,
  loadMutedOrgSet,
  loadViewerMutedOrgIds,
  muteOrgPosts,
  mutedOrgOrFilter,
  postHiddenByOrgMute,
  unmuteOrgPosts,
  withoutMutedOrgs,
} = (await import(specifier)) as typeof import("./org-mutes");

type Client = Parameters<typeof loadViewerMutedOrgIds>[0];

const VIEWER = "df5ab44e-0000-4000-8000-000000000001";
const OTHER = "6979e030-690b-4092-bb91-fd6f00a6a988";
const SAE = "928c04bb-a5b6-45a8-84ed-e5bb77070134";
const CLUB = "c0fc0571-f007-4eca-8bc2-b41abccf06c7";

/** A uuid for test `n`, distinct per n. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/**
 * A fake PostgREST client. Every builder call is recorded as `[method,
 * ...args]`; awaiting the builder resolves to `result` (or rejects when
 * `result` is an Error).
 */
function fakeClient(result: Record<string, unknown> | Error) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "insert", "delete"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { client: client as unknown as Client, calls };
}

/** Runs a loader that logs on purpose without printing the log. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ── The query filter ────────────────────────────────────────────────────────

test("nothing muted means no filter at all", () => {
  assert.equal(mutedOrgOrFilter([], VIEWER), null);
  assert.equal(mutedOrgOrFilter(["not-a-uuid", ""], VIEWER), null);
});

test("the filter keeps personal posts and the viewer's own posts", () => {
  assert.equal(
    mutedOrgOrFilter([SAE, CLUB], VIEWER),
    `org_id.is.null,org_id.not.in.(${SAE},${CLUB}),user_id.eq.${VIEWER}`,
  );
});

test("the filter never becomes a plain not.in on org_id", () => {
  // NULL NOT IN (...) is never true in SQL, so a bare not.in would drop
  // every personal post. The null arm must always come first.
  const filter = mutedOrgOrFilter([SAE], VIEWER) ?? "";
  assert.match(filter, /^org_id\.is\.null,/);
});

test("junk is screened out, ids are lower-cased and deduped, order kept", () => {
  const filter = mutedOrgOrFilter(
    [CLUB.toUpperCase(), "x,org_id.eq.1", SAE, CLUB, "') or true --"],
    VIEWER,
  );
  assert.equal(filter, `org_id.is.null,org_id.not.in.(${CLUB},${SAE}),user_id.eq.${VIEWER}`);
});

test("the filter is capped, newest first", () => {
  const ids = Array.from({ length: MUTED_ORG_FILTER_CAP + 7 }, (_, i) => uuid(i + 1));
  const filter = mutedOrgOrFilter(ids, VIEWER) ?? "";
  const inner = /not\.in\.\(([^)]*)\)/.exec(filter)?.[1] ?? "";
  const kept = inner.split(",");
  assert.equal(kept.length, MUTED_ORG_FILTER_CAP);
  assert.deepEqual(kept, ids.slice(0, MUTED_ORG_FILTER_CAP));
});

test("a viewer id that isn't a uuid never reaches the filter grammar", () => {
  assert.equal(
    mutedOrgOrFilter([SAE], "x,user_id.neq.0"),
    `org_id.is.null,org_id.not.in.(${SAE})`,
  );
});

// ── The TypeScript backup check ─────────────────────────────────────────────

test("a muted club's post is hidden unless the viewer wrote it", () => {
  const muted = new Set([SAE]);
  assert.equal(postHiddenByOrgMute({ org_id: SAE, user_id: OTHER }, muted, VIEWER), true);
  assert.equal(postHiddenByOrgMute({ org_id: SAE, user_id: VIEWER }, muted, VIEWER), false);
  assert.equal(postHiddenByOrgMute({ org_id: SAE.toUpperCase(), user_id: OTHER }, muted, VIEWER), true);
});

test("personal posts and other clubs' posts are never hidden by a club mute", () => {
  const muted = new Set([SAE]);
  assert.equal(postHiddenByOrgMute({ org_id: null, user_id: OTHER }, muted, VIEWER), false);
  assert.equal(postHiddenByOrgMute({ user_id: OTHER }, muted, VIEWER), false);
  assert.equal(postHiddenByOrgMute({ org_id: CLUB, user_id: OTHER }, muted, VIEWER), false);
  assert.equal(postHiddenByOrgMute({ org_id: SAE, user_id: OTHER }, new Set(), VIEWER), false);
});

test("muted clubs leave the followed set, order kept", () => {
  const followed = [CLUB, SAE, uuid(9)];
  assert.deepEqual(withoutMutedOrgs(followed, new Set([SAE])), [CLUB, uuid(9)]);
  const copy = withoutMutedOrgs(followed, new Set());
  assert.deepEqual(copy, followed);
  assert.notEqual(copy, followed);
});

test("'no such table' is recognised only for org_post_mutes", () => {
  assert.equal(ORG_POST_MUTES_TABLE, "org_post_mutes");
  const msg = "Could not find the table 'public.org_post_mutes' in the schema cache";
  assert.equal(isMissingOrgMutesTable({ code: "PGRST205", message: msg }), true);
  assert.equal(
    isMissingOrgMutesTable({ code: "42P01", message: 'relation "public.org_post_mutes" does not exist' }),
    true,
  );
  assert.equal(isMissingOrgMutesTable({ code: "42P01", message: 'relation "public.mutes" does not exist' }), false);
  assert.equal(isMissingOrgMutesTable({ code: "42501", message: msg }), false);
  assert.equal(isMissingOrgMutesTable(null), false);
  assert.equal(isMissingOrgMutesTable(undefined), false);
});

// ── Reads ───────────────────────────────────────────────────────────────────

test("the viewer's mutes: own rows only, newest first, bounded", async () => {
  const { client, calls } = fakeClient({
    data: [{ org_id: SAE.toUpperCase() }, { org_id: CLUB }, { org_id: SAE }, { org_id: "junk" }, null],
    error: null,
  });
  const res = await loadViewerMutedOrgIds(client, VIEWER);
  assert.deepEqual(res, { ok: true, ids: [SAE, CLUB] });
  assert.deepEqual(calls, [
    ["from", "org_post_mutes"],
    ["select", "org_id"],
    ["eq", "user_id", VIEWER],
    ["order", "created_at", { ascending: false }],
    ["limit", MUTED_ORG_READ_LIMIT],
  ]);
});

test("the read limit can be set", async () => {
  const { client, calls } = fakeClient({ data: [], error: null });
  await loadViewerMutedOrgIds(client, VIEWER, { limit: 5 });
  assert.deepEqual(calls.at(-1), ["limit", 5]);
});

test("a failed read is reported, so the feed can fail closed", async () => {
  const err = { code: "42501", message: "permission denied for table org_post_mutes" };
  const { client } = fakeClient({ data: null, error: err });
  assert.deepEqual(await loadViewerMutedOrgIds(client, VIEWER), { ok: false, error: err });
  const thrown = fakeClient(new Error("network"));
  const res = await loadViewerMutedOrgIds(thrown.client, VIEWER);
  assert.equal(res.ok, false);
});

test("a missing table reads as nothing muted", async () => {
  const { client } = fakeClient({
    data: null,
    error: { code: "PGRST205", message: "Could not find the table 'public.org_post_mutes' in the schema cache" },
  });
  assert.deepEqual(await quietly(() => loadViewerMutedOrgIds(client, VIEWER)), { ok: true, ids: [] });
});

test("a bad viewer id never queries", async () => {
  const { client, calls } = fakeClient({ data: [], error: null });
  assert.equal((await loadViewerMutedOrgIds(client, "nope")).ok, false);
  assert.equal(calls.length, 0);
});

test("the muted marks ask only about the clubs on screen", async () => {
  const { client, calls } = fakeClient({ data: [{ org_id: SAE }], error: null });
  const res = await loadMutedOrgSet(client, VIEWER, [SAE, CLUB.toUpperCase(), "junk", SAE]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.ok ? [...res.ids] : null, [SAE]);
  assert.deepEqual(calls, [
    ["from", "org_post_mutes"],
    ["select", "org_id"],
    ["eq", "user_id", VIEWER],
    ["in", "org_id", [SAE, CLUB]],
  ]);
});

test("no clubs on screen means no read", async () => {
  const { client, calls } = fakeClient({ data: [], error: null });
  const res = await loadMutedOrgSet(client, VIEWER, []);
  assert.equal(res.ok && res.ids.size, 0);
  assert.equal(calls.length, 0);
});

test("the muted marks report a failed read", async () => {
  const { client } = fakeClient({ data: null, error: { code: "XX000", message: "boom" } });
  assert.equal((await loadMutedOrgSet(client, VIEWER, [SAE])).ok, false);
});

// ── Writes ──────────────────────────────────────────────────────────────────

test("a mute writes the two ids and nothing else", async () => {
  const { client, calls } = fakeClient({ data: null, error: null });
  assert.deepEqual(await muteOrgPosts(client, SAE, VIEWER), { ok: true, already: false });
  assert.deepEqual(calls, [
    ["from", "org_post_mutes"],
    ["insert", { user_id: VIEWER, org_id: SAE }],
  ]);
});

test("muting twice is fine", async () => {
  const { client } = fakeClient({ data: null, error: { code: "23505", message: "duplicate key" } });
  assert.deepEqual(await muteOrgPosts(client, SAE, VIEWER), { ok: true, already: true });
});

test("a failed mute is reported, and bad ids never write", async () => {
  const failed = fakeClient({ data: null, error: { code: "23503", message: "fk" } });
  assert.equal((await muteOrgPosts(failed.client, SAE, VIEWER)).ok, false);
  const bad = fakeClient({ data: null, error: null });
  assert.equal((await muteOrgPosts(bad.client, "x", VIEWER)).ok, false);
  assert.equal((await muteOrgPosts(bad.client, SAE, "x")).ok, false);
  assert.equal(bad.calls.length, 0);
});

test("an unmute deletes only the viewer's row for that club", async () => {
  const { client, calls } = fakeClient({ data: null, error: null, count: 1 });
  assert.deepEqual(await unmuteOrgPosts(client, SAE, VIEWER), { ok: true, removed: 1 });
  assert.deepEqual(calls, [
    ["from", "org_post_mutes"],
    ["delete", { count: "exact" }],
    ["eq", "user_id", VIEWER],
    ["eq", "org_id", SAE],
  ]);
});

test("unmuting with nothing muted removes nothing, and a failure is reported", async () => {
  const none = fakeClient({ data: null, error: null, count: 0 });
  assert.deepEqual(await unmuteOrgPosts(none.client, SAE, VIEWER), { ok: true, removed: 0 });
  const failed = fakeClient({ data: null, error: { code: "XX000", message: "boom" } });
  assert.equal((await unmuteOrgPosts(failed.client, SAE, VIEWER)).ok, false);
});
