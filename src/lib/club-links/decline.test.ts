/**
 * The no on /c/welcome (sign-up pre-registration fix, Oct 21): "Not me" on a
 * setup link gives this account's place back so the person the link was made
 * for can still use it, and a second give-back turns the link off; "Not now"
 * on a members' link only stops the question.
 * Against a small in-memory fake of the service client: no database here.
 *
 * Run with:
 *   node --test src/lib/club-links/decline.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("decline.test.ts needs Node >= 22.15 (module.registerHooks)");
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const unused = (name: string) => `export function ${name}() { throw new Error("unused: ${name}"); }`;
// redeem.ts's other imports are never reached by a decline.
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "@/lib/auth/require-platform-admin": dataModule(unused("logModerationAction")),
  "@/lib/iu/campuses": dataModule([unused("allowedCampusId"), unused("isSchoolSystem"), unused("legacyLabel")].join("\n")),
  "@/lib/orgs/join-state": dataModule(unused("audienceAllows")),
  "@/lib/orgs/membership": dataModule([unused("admitMember"), unused("loadViewerOrgContext")].join("\n")),
  "@/lib/orgs/org-blocks": dataModule(unused("loadOrgBlocks")),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const storePath = "./store.ts";
const redeemPath = "./redeem.ts";
const { releaseSetupLinkPlace, SETUP_LINK_MAX_GIVE_BACKS } = (await import(storePath)) as typeof import("./store");
const { declineClubLink } = (await import(redeemPath)) as typeof import("./redeem");

type Row = Record<string, unknown>;
type Filter = ["eq" | "is", string, unknown];

/** A service client over two tables that applies eq/is filters and records every write. */
function fakeService(tables: { club_links: Row[]; club_link_uses: Row[] }, fail: Partial<Record<string, string>> = {}) {
  const writes: { table: string; op: string; filters: Filter[] }[] = [];
  const from = (table: keyof typeof tables) => {
    let op = "select";
    let patch: Row = {};
    const filters: Filter[] = [];
    const matches = (row: Row) =>
      filters.every(([kind, col, value]) => (kind === "is" ? (row[col] ?? null) === value : row[col] === value));
    const run = () => {
      const failure = fail[`${table}.${op}`];
      if (failure) return { data: null, error: { message: failure } };
      const hit = tables[table].filter(matches);
      if (op === "delete") tables[table] = tables[table].filter((row) => !matches(row));
      if (op === "update") hit.forEach((row) => Object.assign(row, patch));
      if (op !== "select") writes.push({ table, op, filters: [...filters] });
      return { data: hit.map((row) => ({ ...row })), error: null };
    };
    const chain = {
      select: () => chain,
      delete: () => ((op = "delete"), chain),
      update: (p: Row) => ((op = "update"), (patch = p), chain),
      eq: (col: string, value: unknown) => (filters.push(["eq", col, value]), chain),
      is: (col: string, value: unknown) => (filters.push(["is", col, value]), chain),
      maybeSingle: async () => {
        const r = run();
        return r.error ? r : { data: r.data?.[0] ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return chain;
  };
  return { service: { from } as never, tables, writes };
}

const SETUP = { id: "setup-1", kind: "setup", org_id: null, used_at: null } as const;
const link = (over: Row = {}) => ({ ...SETUP, ...over }) as unknown as import("./store").ClubLinkRow;

test("Not me on a setup link: this account's place goes, nobody else's", async () => {
  const fake = fakeService({
    club_links: [{ ...SETUP }],
    club_link_uses: [
      { id: "mine", link_id: "setup-1", user_id: "u1", claimed_at: "t", joined_at: null },
      { id: "other-link", link_id: "setup-2", user_id: "u1", claimed_at: "t", joined_at: null },
      { id: "someone-else", link_id: "setup-1", user_id: "u2", claimed_at: "t", joined_at: null },
    ],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "released");
  assert.deepEqual(fake.tables.club_link_uses.map((r) => r.id), ["other-link", "someone-else"]);
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "nothing");
});

test("a setup link that made its club: nothing is given back", async () => {
  const fake = fakeService({
    club_links: [{ ...SETUP, used_at: "t", org_id: "o1" }],
    club_link_uses: [{ id: "mine", link_id: "setup-1", user_id: "u1", claimed_at: "t", joined_at: "t" }],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "nothing");
  assert.equal(fake.tables.club_link_uses.length, 1);
  assert.equal(fake.writes.length, 0, "never reaches the delete");
});

test("the row that records making the club is never deleted, even mid-race", async () => {
  // The link read says not used, but Make me the owner landed a moment later.
  const fake = fakeService({
    club_links: [{ ...SETUP }],
    club_link_uses: [{ id: "mine", link_id: "setup-1", user_id: "u1", claimed_at: "t", joined_at: "t" }],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "nothing");
  assert.equal(fake.tables.club_link_uses.length, 1);
  assert.deepEqual(fake.writes[0]?.filters, [
    ["eq", "link_id", "setup-1"],
    ["eq", "user_id", "u1"],
    ["is", "joined_at", null],
  ]);
});

test("a members' link is never released by the setup helper", async () => {
  const fake = fakeService({
    club_links: [{ id: "m1", kind: "members", org_id: "o1", used_at: null }],
    club_link_uses: [{ id: "mine", link_id: "m1", user_id: "u1", claimed_at: "t", joined_at: null }],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "m1", "u1"), "nothing");
  assert.equal(fake.tables.club_link_uses.length, 1);
});

test("declineClubLink: setup releases; a failed release says so", async () => {
  const ok = fakeService({
    club_links: [{ ...SETUP }],
    club_link_uses: [{ id: "mine", link_id: "setup-1", user_id: "u1", claimed_at: "t", joined_at: null }],
  });
  assert.equal(await declineClubLink(ok.service, link(), "u1"), true);
  assert.equal(ok.tables.club_link_uses.length, 0);

  const broken = fakeService(
    { club_links: [{ ...SETUP }], club_link_uses: [{ id: "mine", link_id: "setup-1", user_id: "u1", joined_at: null }] },
    { "club_link_uses.delete": "boom" },
  );
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await declineClubLink(broken.service, link(), "u1"), false);
  } finally {
    console.error = quiet;
  }
  assert.equal(broken.tables.club_link_uses.length, 1);
});

test("declineClubLink: a members' link is waved off as before, its row kept", async () => {
  const fake = fakeService({
    club_links: [{ id: "m1", kind: "members", org_id: "o1", used_at: null }],
    club_link_uses: [{ id: "mine", link_id: "m1", user_id: "u1", claimed_at: "t", joined_at: null }],
  });
  assert.equal(await declineClubLink(fake.service, link({ id: "m1", kind: "members", org_id: "o1" }), "u1"), true);
  assert.equal(fake.tables.club_link_uses.length, 1);
  assert.equal(typeof fake.tables.club_link_uses[0].dismissed_at, "string");
  assert.deepEqual(fake.writes.map((w) => `${w.table}.${w.op}`), ["club_link_uses.update"]);
});

const held = (over: Row = {}) => ({ id: "mine", link_id: "setup-1", user_id: "u1", claimed_at: "t", joined_at: null, ...over });

test("the first give-back is noted (when, never who) and the link stays on", async () => {
  const fake = fakeService({ club_links: [{ ...SETUP, off_at: null, setup_marks: {} }], club_link_uses: [held()] });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "released");
  const [row] = fake.tables.club_links;
  const givenBack = (row.setup_marks as Row).given_back as string[];
  assert.equal(givenBack.length, 1);
  assert.ok(!Number.isNaN(Date.parse(givenBack[0])), "a time");
  assert.equal(JSON.stringify(row.setup_marks).includes("u1"), false, "no account id on the link");
  assert.equal(row.off_at, null, "still on: the president can still use it");
  const note = fake.writes.find((w) => w.table === "club_links");
  assert.deepEqual(note?.filters, [
    ["eq", "id", "setup-1"],
    ["is", "used_at", null],
  ]);
});

test(`the give-back that reaches ${SETUP_LINK_MAX_GIVE_BACKS} turns the link off, other marks kept`, async () => {
  assert.equal(SETUP_LINK_MAX_GIVE_BACKS, 2);
  const fake = fakeService({
    club_links: [{ ...SETUP, off_at: null, setup_marks: { given_back: ["2026-10-21T10:00:00.000Z"], other: "x" } }],
    club_link_uses: [held()],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "released");
  const [row] = fake.tables.club_links;
  assert.equal(((row.setup_marks as Row).given_back as string[]).length, 2);
  assert.equal((row.setup_marks as Row).other, "x");
  assert.equal(typeof row.off_at, "string", "turned off: a founder makes a new one");
});

test("a link a founder already cancelled keeps its cancel time", async () => {
  const fake = fakeService({
    club_links: [{ ...SETUP, off_at: "cancelled", setup_marks: { given_back: ["t0"] } }],
    club_link_uses: [held()],
  });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "released");
  assert.equal(fake.tables.club_links[0].off_at, "cancelled");
});

test("two taps at once give back once and are noted once", async () => {
  const fake = fakeService({ club_links: [{ ...SETUP, off_at: null, setup_marks: {} }], club_link_uses: [held()] });
  const results = await Promise.all([
    releaseSetupLinkPlace(fake.service, "setup-1", "u1"),
    releaseSetupLinkPlace(fake.service, "setup-1", "u1"),
  ]);
  assert.deepEqual([...results].sort(), ["nothing", "released"]);
  assert.equal(((fake.tables.club_links[0].setup_marks as Row).given_back as string[]).length, 1);
  assert.equal(fake.tables.club_links[0].off_at, null);
});

test("nothing given back, nothing noted", async () => {
  const fake = fakeService({ club_links: [{ ...SETUP, off_at: null, setup_marks: { given_back: ["t0"] } }], club_link_uses: [] });
  assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "nothing");
  assert.equal(fake.writes.some((w) => w.table === "club_links"), false);
  assert.equal(fake.tables.club_links[0].off_at, null);
});

test("a note that can't be written still gives the place back", async () => {
  const fake = fakeService(
    { club_links: [{ ...SETUP, off_at: null, setup_marks: {} }], club_link_uses: [held()] },
    { "club_links.update": "boom" },
  );
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await releaseSetupLinkPlace(fake.service, "setup-1", "u1"), "released");
  } finally {
    console.error = quiet;
  }
  assert.equal(fake.tables.club_link_uses.length, 0);
});
