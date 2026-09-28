/**
 * Tests for `org-blocks.ts` (S67 security wave 2 #15: blocks keep people out
 * of a club, one-directionally).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/org-blocks.test.ts
 *
 * The module imports `./join-state` without an extension, which Node's type
 * stripping doesn't resolve, so a resolve hook adds ".ts" (same pattern as
 * `following.test.ts`). The module loads through dynamic `import()` so the
 * hook is registered first.
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
  throw new Error("org-blocks.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const specifier = "./org-blocks.ts";
const {
  inviteRefusedByBlocks,
  inviteRefusedIds,
  inviteSideIds,
  isBlockedWithOrg,
  loadInviteBlocks,
  loadOrgBlocks,
  loadOrgSideIds,
  orgSideIds,
  summarizeOrgBlocks,
} = (await import(specifier)) as typeof import("./org-blocks");

type Client = Parameters<typeof loadOrgBlocks>[0];

const ORG = "923896fb-0000-4000-8000-000000000002";
const STUDENT = "6979e030-690b-4092-bb91-fd6f00a6a988";
const OWNER = "c3b9dbb5-df1f-4674-9a9b-134a487ae1a2";
const ADMIN = "be3e2af2-f457-4414-8f22-8746bdf9bf59";
const MOD = "8dc49662-65fd-437f-9692-20741e00a298";
const MEMBER = "017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const STUDENT2 = "5a1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

type Result = { data: unknown; error: unknown };
type Call = unknown[];

/**
 * A fake PostgREST client. Each `from()` starts a fresh chain; awaiting it
 * (or `.maybeSingle()`) asks `answer(table, calls)` for the result, so one
 * fake can tell the two `blocks` reads apart by their filters.
 */
function fakeClient(answer: (table: string, calls: Call[]) => Result) {
  const log: Array<{ table: string; calls: Call[] }> = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "order", "limit", "or"]) {
        builder[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = () => Promise.resolve(answer(table, calls));
      builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve(answer(table, calls)).then(ok, bad);
      return builder;
    },
  };
  return { client: client as unknown as Client, log };
}

const hasEq = (calls: Call[], col: string) => calls.some((c) => c[0] === "eq" && c[1] === col);

/** A club with an owner, an admin, a mod and a plain member, and some blocks. */
function clubWith(blocks: Array<{ blocker_id: string; blocked_id: string }>, opts: { fail?: string } = {}) {
  return fakeClient((table, calls) => {
    if (opts.fail === table) return { data: null, error: { message: "boom" } };
    if (table === "orgs") return { data: { owner_id: OWNER }, error: null };
    if (table === "org_members") {
      const rows = [
        { user_id: OWNER, role: "owner" },
        { user_id: ADMIN, role: "admin" },
        { user_id: MOD, role: "mod" },
      ];
      return { data: rows, error: null };
    }
    if (table === "blocks") {
      if (hasEq(calls, "blocker_id")) {
        const who = calls.find((c) => c[0] === "eq" && c[1] === "blocker_id")![2];
        return { data: blocks.filter((b) => b.blocker_id === who).map((b) => ({ blocked_id: b.blocked_id })), error: null };
      }
      const who = calls.find((c) => c[0] === "eq" && c[1] === "blocked_id")![2];
      return { data: blocks.filter((b) => b.blocked_id === who).map((b) => ({ blocker_id: b.blocker_id })), error: null };
    }
    return { data: null, error: { message: `unexpected table ${table}` } };
  });
}

// ── pure ────────────────────────────────────────────────────────────────────

test("orgSideIds: owner plus owner/admin/mod rows, never plain members or the person", () => {
  const side = orgSideIds(
    OWNER,
    [
      { user_id: OWNER, role: "owner" },
      { user_id: ADMIN.toUpperCase(), role: "admin" },
      { user_id: MOD, role: "mod" },
      { user_id: MEMBER, role: "member" },
      { user_id: "not-a-uuid", role: "admin" },
      { user_id: STUDENT, role: "admin" },
    ],
    STUDENT,
  );
  assert.deepEqual(side.sort(), [OWNER, ADMIN, MOD].sort());
});

test("orgSideIds: a missing owner still leaves the officers", () => {
  assert.deepEqual(orgSideIds(null, [{ user_id: MOD, role: "mod" }], STUDENT), [MOD]);
});

test("summarizeOrgBlocks: an officer blocking the student keeps them out", () => {
  const r = summarizeOrgBlocks([OWNER, MOD], [], [MOD]);
  assert.deepEqual(r, { blockedByOfficer: true, personBlocked: [] });
});

test("summarizeOrgBlocks: the student blocking an officer does NOT keep them out", () => {
  const r = summarizeOrgBlocks([OWNER, MOD], [MOD.toUpperCase()], []);
  assert.deepEqual(r, { blockedByOfficer: false, personBlocked: [MOD] });
});

test("summarizeOrgBlocks: rows about people off the org side never count", () => {
  const r = summarizeOrgBlocks([OWNER], [MEMBER], [MEMBER, null, 7]);
  assert.deepEqual(r, { blockedByOfficer: false, personBlocked: [] });
});

// ── reads ───────────────────────────────────────────────────────────────────

test("loadOrgBlocks: a mod's block counts (the whole officer list, not just the owner)", async () => {
  const { client } = clubWith([{ blocker_id: MOD, blocked_id: STUDENT }]);
  const r = await loadOrgBlocks(client, ORG, STUDENT);
  assert.deepEqual(r, { ok: true, blockedByOfficer: true, personBlocked: [] });
});

test("loadOrgBlocks: a block from a plain member is not the club's", async () => {
  const { client } = clubWith([{ blocker_id: MEMBER, blocked_id: STUDENT }]);
  const r = await loadOrgBlocks(client, ORG, STUDENT);
  assert.deepEqual(r, { ok: true, blockedByOfficer: false, personBlocked: [] });
});

test("loadOrgBlocks: the student's own block of an admin is reported, not refused", async () => {
  const { client } = clubWith([{ blocker_id: STUDENT, blocked_id: ADMIN }]);
  const r = await loadOrgBlocks(client, ORG, STUDENT);
  assert.deepEqual(r, { ok: true, blockedByOfficer: false, personBlocked: [ADMIN] });
});

test("loadOrgBlocks: officers are read by role from org_members", async () => {
  const { client, log } = clubWith([]);
  await loadOrgBlocks(client, ORG, STUDENT);
  const members = log.find((q) => q.table === "org_members")!;
  assert.ok(members.calls.some((c) => c[0] === "in" && c[1] === "role"));
  const roles = members.calls.find((c) => c[0] === "in" && c[1] === "role")![2];
  assert.deepEqual(roles, ["owner", "admin", "mod"]);
});

test("loadOrgBlocks FAILS CLOSED on any read error", async () => {
  for (const table of ["orgs", "org_members", "blocks"]) {
    const { client } = clubWith([], { fail: table });
    const r = await loadOrgBlocks(client, ORG, STUDENT);
    assert.equal(r.ok, false, table);
  }
});

test("loadOrgBlocks / loadOrgSideIds refuse a bad id without a query", async () => {
  const { client, log } = clubWith([]);
  assert.equal((await loadOrgBlocks(client, "nope", STUDENT)).ok, false);
  assert.equal((await loadOrgSideIds(client, ORG, "x")).ok, false);
  assert.equal(log.length, 0);
});

test("isBlockedWithOrg: either direction with the given ids; error is 'error'", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const theyBlocked = clubWith([{ blocker_id: STUDENT, blocked_id: OWNER }]);
    assert.equal(await isBlockedWithOrg(theyBlocked.client, STUDENT, [ADMIN, OWNER]), true);
    const blockedThem = clubWith([{ blocker_id: ADMIN, blocked_id: STUDENT }]);
    assert.equal(await isBlockedWithOrg(blockedThem.client, STUDENT, [ADMIN, null]), true);
    const none = clubWith([]);
    assert.equal(await isBlockedWithOrg(none.client, STUDENT, [ADMIN, OWNER]), false);
    assert.equal(await isBlockedWithOrg(none.client, STUDENT, [STUDENT, null]), false);
    const broken = clubWith([], { fail: "blocks" });
    assert.equal(await isBlockedWithOrg(broken.client, STUDENT, [ADMIN]), "error");
  } finally {
    console.error = quiet;
  }
});

// ── invites (waveA-build ruling 14) ─────────────────────────────────────────

test("inviteSideIds: the org side plus the sender, lower case, once, never the invitee", () => {
  assert.deepEqual(inviteSideIds([OWNER, ADMIN], ADMIN.toUpperCase(), STUDENT).sort(), [OWNER, ADMIN].sort());
  assert.deepEqual(inviteSideIds([OWNER], MEMBER, STUDENT).sort(), [OWNER, MEMBER].sort());
  assert.deepEqual(inviteSideIds([OWNER, "junk"], STUDENT.toUpperCase(), STUDENT), [OWNER]);
});

test("inviteRefusedByBlocks: any officer's block of the invitee refuses", () => {
  assert.equal(inviteRefusedByBlocks({ blockedByOfficer: true, personBlocked: [] }, ADMIN), true);
});

test("inviteRefusedByBlocks: the invitee blocking the SENDER refuses", () => {
  assert.equal(inviteRefusedByBlocks({ blockedByOfficer: false, personBlocked: [ADMIN] }, ADMIN.toUpperCase()), true);
});

test("inviteRefusedByBlocks: the invitee blocking the owner or another officer does NOT refuse", () => {
  assert.equal(inviteRefusedByBlocks({ blockedByOfficer: false, personBlocked: [OWNER, MOD] }, ADMIN), false);
  assert.equal(inviteRefusedByBlocks({ blockedByOfficer: false, personBlocked: [] }, ADMIN), false);
});

test("loadInviteBlocks: invitee blocked the OWNER, an admin sends: allowed (a victim isn't locked out)", async () => {
  const { client } = clubWith([{ blocker_id: STUDENT, blocked_id: OWNER }]);
  assert.deepEqual(await loadInviteBlocks(client, ORG, ADMIN, STUDENT), { ok: true, refused: false });
});

test("loadInviteBlocks: invitee blocked the owner, the OWNER sends: refused (sender pair)", async () => {
  const { client } = clubWith([{ blocker_id: STUDENT, blocked_id: OWNER }]);
  assert.deepEqual(await loadInviteBlocks(client, ORG, OWNER, STUDENT), { ok: true, refused: true });
});

test("loadInviteBlocks: the sender blocked the invitee, or the invitee blocked the sender: refused", async () => {
  const a = clubWith([{ blocker_id: ADMIN, blocked_id: STUDENT }]);
  assert.deepEqual(await loadInviteBlocks(a.client, ORG, ADMIN, STUDENT), { ok: true, refused: true });
  const b = clubWith([{ blocker_id: STUDENT, blocked_id: ADMIN }]);
  assert.deepEqual(await loadInviteBlocks(b.client, ORG, ADMIN, STUDENT), { ok: true, refused: true });
});

test("loadInviteBlocks: the owner or a mod blocked the invitee, an admin sends: refused", async () => {
  for (const blocker of [OWNER, MOD]) {
    const { client } = clubWith([{ blocker_id: blocker, blocked_id: STUDENT }]);
    assert.deepEqual(await loadInviteBlocks(client, ORG, ADMIN, STUDENT), { ok: true, refused: true }, blocker);
  }
});

test("loadInviteBlocks: a plain member's block of the invitee is not the club's", async () => {
  const { client } = clubWith([{ blocker_id: MEMBER, blocked_id: STUDENT }]);
  assert.deepEqual(await loadInviteBlocks(client, ORG, ADMIN, STUDENT), { ok: true, refused: false });
});

test("loadInviteBlocks: the sender is asked even when off the officer list (role moved mid-request)", async () => {
  const { client, log } = clubWith([{ blocker_id: STUDENT, blocked_id: MEMBER }]);
  assert.deepEqual(await loadInviteBlocks(client, ORG, MEMBER, STUDENT), { ok: true, refused: true });
  const blockReads = log.filter((q) => q.table === "blocks");
  for (const q of blockReads) {
    const ids = q.calls.find((c) => c[0] === "in")![2] as string[];
    assert.ok(ids.includes(MEMBER) && ids.includes(OWNER) && !ids.includes(STUDENT));
  }
});

test("loadInviteBlocks FAILS CLOSED; a bad sender id costs no query", async () => {
  for (const table of ["orgs", "org_members", "blocks"]) {
    const { client } = clubWith([], { fail: table });
    assert.equal((await loadInviteBlocks(client, ORG, ADMIN, STUDENT)).ok, false, table);
  }
  const { client, log } = clubWith([]);
  assert.equal((await loadInviteBlocks(client, ORG, "nope", STUDENT)).ok, false);
  assert.equal(log.length, 0);
});

// ── the invite picker (reviewer F1: hidden == refused) ──────────────────────

const PICKER_SIDE = [OWNER, ADMIN, MOD];
const row = (blocker_id: string, blocked_id: string) => ({ blocker_id, blocked_id });

test("inviteRefusedIds: a student who blocked the OWNER stays in an admin's picker", () => {
  assert.deepEqual([...inviteRefusedIds(ADMIN, PICKER_SIDE, [row(STUDENT, OWNER)])], []);
  assert.deepEqual([...inviteRefusedIds(ADMIN, PICKER_SIDE, [row(STUDENT, MOD)])], []);
  // ...but not in the OWNER's own picker (sender pair).
  assert.deepEqual([...inviteRefusedIds(OWNER, PICKER_SIDE, [row(STUDENT, OWNER)])], [STUDENT]);
});

test("inviteRefusedIds: blocked the sender, or blocked by the owner, a mod or the sender: hidden", () => {
  assert.deepEqual([...inviteRefusedIds(ADMIN, PICKER_SIDE, [row(STUDENT, ADMIN)])], [STUDENT]);
  for (const blocker of [OWNER, MOD, ADMIN]) {
    assert.deepEqual([...inviteRefusedIds(ADMIN, PICKER_SIDE, [row(blocker, STUDENT)])], [STUDENT], blocker);
  }
});

test("inviteRefusedIds: stray rows never count; never the sender; case and junk tolerated", () => {
  const got = inviteRefusedIds(ADMIN.toUpperCase(), PICKER_SIDE, [
    row(MEMBER, STUDENT), // a plain member's block is not the club's
    row(STUDENT, STUDENT2), // between two candidates
    row(STUDENT2, STUDENT),
    row(STUDENT, STUDENT), // a stray self row
    { blocker_id: "junk", blocked_id: STUDENT },
    { blocker_id: MOD },
    row(STUDENT2.toUpperCase(), ADMIN.toUpperCase()),
  ]);
  assert.deepEqual([...got], [STUDENT2]);
  assert.equal(inviteRefusedIds("nope", PICKER_SIDE, [row(OWNER, STUDENT)]).size, 0);
});

test("inviteRefusedIds agrees with the send's one-at-a-time answer, and with the picker's two reads", () => {
  const pairs: Array<[string, string]> = [
    [STUDENT, ADMIN], [ADMIN, STUDENT], [STUDENT, OWNER], [OWNER, STUDENT], [STUDENT, MOD],
    [MOD, STUDENT], [MEMBER, STUDENT], [STUDENT2, ADMIN], [OWNER, STUDENT2], [STUDENT, STUDENT2],
    [STUDENT2, STUDENT], [STUDENT2, OWNER],
  ];
  const members = [
    { user_id: OWNER, role: "owner" },
    { user_id: ADMIN, role: "admin" },
    { user_id: MOD, role: "mod" },
    { user_id: MEMBER, role: "member" },
  ];
  const candidates = [STUDENT, STUDENT2];
  let checked = 0;
  for (const sender of [ADMIN, OWNER]) {
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const rows = pairs.filter((_, i) => mask & (1 << i)).map(([a, b]) => row(a, b));
      const batch = inviteRefusedIds(sender, PICKER_SIDE, rows);
      // What the picker actually reads: candidate -> sender, and side -> candidate.
      const read = rows.filter(
        (r) =>
          (candidates.includes(r.blocker_id) && r.blocked_id === sender) ||
          (candidates.includes(r.blocked_id) && PICKER_SIDE.includes(r.blocker_id)),
      );
      const fromReads = inviteRefusedIds(sender, PICKER_SIDE, read);
      for (const c of candidates) {
        const side = inviteSideIds(orgSideIds(OWNER, members, c), sender, c);
        const one = inviteRefusedByBlocks(
          summarizeOrgBlocks(
            side,
            rows.filter((r) => r.blocker_id === c).map((r) => r.blocked_id),
            rows.filter((r) => r.blocked_id === c).map((r) => r.blocker_id),
          ),
          sender,
        );
        assert.equal(batch.has(c), one, `sender ${sender} mask ${mask} candidate ${c}`);
        assert.equal(fromReads.has(c), one, `reads: sender ${sender} mask ${mask} candidate ${c}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 2 * 4096 * 2);
});
