/**
 * Tests for the Usage tab's pure helpers (`view.ts`): how the function's
 * answer is cleaned, and the small-group floor the route puts on it.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/view.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./view.ts";
const { SMALL_CELL_FLOOR, USAGE_DAYS, toUsageRaw, toUsageView } = (await import(specifier)) as typeof import("./view");

// The contract's keys, written out here so a key dropped from view.ts fails a test.
const TOTAL_KEYS = [
  "posts",
  "comments",
  "likes",
  "reposts",
  "saves",
  "events",
  "rsvps",
  "people_follows",
  "club_follows",
  "club_members",
  "club_chat_messages",
  "direct_messages",
  "group_messages",
];
const USED_DAY_KEYS = [
  "posts",
  "comments",
  "likes",
  "reposts",
  "saves",
  "events",
  "rsvps",
  "people_follows",
  "club_relationships",
  "club_chat_messages",
  "direct_messages",
];
const DAYS = ["2026-10-12", "2026-10-13", "2026-10-14"];

const every = (keys: string[], n: number) => Object.fromEntries(keys.map((k) => [k, n]));

/** A whole, clean answer with every count set to `n`, the way the function sends it. */
function answer(n: number) {
  return {
    today: "2026-10-14",
    since: "2026-10-12",
    days: 3,
    door: {
      accounts: n,
      accounts_confirmed: n,
      school_verified: n,
      onboarded: n,
      by_day: DAYS.map((day) => ({
        day,
        ...every(["signups", "school_verified", "waitlist_form", "waitlist_founder_add", "codes_sent"], n),
      })),
    },
    waves: [{ batch: "wave-1", signups: n }],
    back: {
      active_now: n,
      active_1d: n,
      active_7d: n,
      active_30d: n,
      by_day: DAYS.map((day) => ({ day, active: n })),
      by_week: [
        { week: "2026-10-05", active: n },
        { week: "2026-10-12", active: n },
      ],
      cohorts: [{ week: "2026-10-05", signups: n, returned: n }],
    },
    used: { totals: every(TOTAL_KEYS, n), by_day: DAYS.map((day) => ({ day, ...every(USED_DAY_KEYS, n) })) },
    clubs: {
      visible: n,
      officer_did_something_7d: n,
      event_this_month: n,
      chat_7d: n,
      per_club: [{ name: "Night Owls Run Club", members: n, chat_7d: n, chat_30d: n, events_this_month: n }],
    },
    where: {
      by_school: [{ school: "iu", accounts: n }],
      by_campus: [{ campus: "Indianapolis", accounts: n }],
    },
  };
}

type Json = { [k: string]: unknown };

/** `answer(7)` with the value at a dotted path (array items by index) replaced. */
function withValue(path: string, value: unknown): unknown {
  const a = structuredClone(answer(7)) as unknown as Json;
  const keys = path.split(".");
  let o = a;
  for (const k of keys.slice(0, -1)) o = o[k] as Json;
  o[keys[keys.length - 1]] = value;
  return a;
}

/** Every leaf of a value as [path, value], array items as `[]`. */
function leaves(v: unknown, path = ""): [string, unknown][] {
  if (Array.isArray(v)) return v.flatMap((x) => leaves(x, `${path}[]`));
  if (v !== null && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  }
  return [[path, v]];
}

test("the window is 30 days and the floor is 5", () => {
  assert.equal(USAGE_DAYS, 30);
  assert.equal(SMALL_CELL_FLOOR, 5);
});

test("a clean answer reads back exactly as it was sent", () => {
  assert.deepEqual(toUsageRaw(answer(7)), answer(7));
  assert.deepEqual(toUsageRaw(answer(0)), answer(0));
});

test("counts that arrive as text read as numbers, and fields the shape doesn't name are dropped", () => {
  const a = structuredClone(answer(7)) as unknown as Json & ReturnType<typeof answer>;
  (a.door as Json).accounts = "40";
  (a.used.totals as Json).posts = "12";
  (a.clubs.per_club[0] as Json).members = "9";
  a.email = "someone@iu.edu";
  (a.door.by_day[0] as Json).handle = "someone";
  (a.clubs.per_club[0] as Json).owner_id = "df5ab44e";
  (a.back as Json).referrer = "instagram";
  const raw = toUsageRaw(a);
  assert.ok(raw);
  assert.equal(raw.door.accounts, 40);
  assert.equal(raw.used.totals.posts, 12);
  assert.equal(raw.clubs.per_club[0].members, 9);
  const sent = JSON.stringify(raw);
  for (const word of ["email", "someone", "handle", "owner_id", "df5ab44e", "referrer", "instagram"]) {
    assert.ok(!sent.includes(word), `${word} was kept`);
  }
});

test("not the shape at all: null, so the route fails rather than show noughts", () => {
  for (const bad of [null, undefined, "ready", 42, [], {}]) assert.equal(toUsageRaw(bad), null, String(bad));
  const cases: [string, unknown][] = [
    ["today", "Oct 14"],
    ["since", undefined],
    ["days", -1],
    ["days", 1.5],
    ["door", undefined],
    ["door", []],
    ["door.accounts", "many"],
    ["door.accounts", ""],
    ["door.onboarded", null],
    ["door.by_day", {}],
    ["waves", "wave-1"],
    ["back", null],
    ["back.active_7d", -2],
    ["back.cohorts", 5],
    ["used.totals", undefined],
    ["used.totals.group_messages", undefined],
    ["used.totals.likes", 2.5],
    ["clubs.visible", undefined],
    ["clubs.per_club", "Night Owls Run Club"],
    ["where", null],
    ["where.by_campus", {}],
  ];
  for (const [path, value] of cases) {
    assert.equal(toUsageRaw(withValue(path, value)), null, `${path} = ${JSON.stringify(value)}`);
  }
});

test("a list that isn't there reads as empty (jsonb_agg over nothing is null)", () => {
  for (const path of ["waves", "clubs.per_club", "where.by_school", "where.by_campus", "back.cohorts"]) {
    for (const value of [null, undefined]) {
      const raw = toUsageRaw(withValue(path, value));
      assert.ok(raw, path);
      const [section, list] = path.includes(".") ? path.split(".") : [path, ""];
      const got = list ? (raw[section as keyof typeof raw] as Json)[list] : raw[section as keyof typeof raw];
      assert.deepEqual(got, [], path);
    }
  }
});

test("inside a list, a row that can't be read is dropped and the rest kept", () => {
  const day = (d: string, signups: unknown) => ({
    day: d,
    signups,
    school_verified: 0,
    waitlist_form: 0,
    waitlist_founder_add: 0,
    codes_sent: 0,
  });
  let raw = toUsageRaw(withValue("door.by_day", [day("2026-10-14", 2), day("Oct 13", 1), day("2026-10-12", -1), null]));
  assert.deepEqual(raw?.door.by_day.map((r) => `${r.day} ${r.signups}`), ["2026-10-14 2"]);

  raw = toUsageRaw(
    withValue("waves", [
      { batch: "wave-1", signups: 5 },
      { batch: "test-1", signups: 2 }, // a test wave never shows
      { batch: "", signups: 1 },
      { batch: "wave-2", signups: "lots" },
      null,
      "wave-3",
    ]),
  );
  assert.deepEqual(raw?.waves, [{ batch: "wave-1", signups: 5 }]);

  const club = (name: string, members: unknown) => ({ name, members, chat_7d: 0, chat_30d: 0, events_this_month: 0 });
  raw = toUsageRaw(withValue("clubs.per_club", [club("", 3), club("Chess", 1.5), club("Chess", 6)]));
  assert.deepEqual(raw?.clubs.per_club.map((c) => c.name), ["Chess"]);

  raw = toUsageRaw(
    withValue("where.by_school", [
      { school: "ivy", accounts: 2 },
      { school: "iu", accounts: 3 },
      { school: null, accounts: 1 },
    ]),
  );
  assert.deepEqual(raw?.where.by_school, [{ school: "iu", accounts: 3 }]);
});

test("series read oldest first; clubs most members first; campuses most accounts first, not picked last", () => {
  let raw = toUsageRaw(
    withValue("back.by_week", [
      { week: "2026-10-12", active: 1 },
      { week: "2026-09-28", active: 3 },
      { week: "2026-10-05", active: 2 },
    ]),
  );
  assert.deepEqual(raw?.back.by_week.map((w) => w.week), ["2026-09-28", "2026-10-05", "2026-10-12"]);

  raw = toUsageRaw(withValue("back.by_day", [...DAYS].reverse().map((day) => ({ day, active: 1 }))));
  assert.deepEqual(raw?.back.by_day.map((d) => d.day), DAYS);

  const club = (name: string, members: number) => ({ name, members, chat_7d: 0, chat_30d: 0, events_this_month: 0 });
  raw = toUsageRaw(withValue("clubs.per_club", [club("B club", 5), club("A club", 5), club("C club", 20)]));
  assert.deepEqual(raw?.clubs.per_club.map((c) => c.name), ["C club", "A club", "B club"]);

  raw = toUsageRaw(
    withValue("where.by_campus", [
      { campus: "not picked", accounts: 50 },
      { campus: "IU Kokomo", accounts: 4 },
      { campus: "Indianapolis", accounts: 33 },
      { campus: "IU Bloomington", accounts: 4 },
    ]),
  );
  assert.deepEqual(raw?.where.by_campus.map((c) => c.campus), [
    "Indianapolis",
    "IU Bloomington",
    "IU Kokomo",
    "not picked",
  ]);
});

/** The view of an answer with every count set to `n`. */
function viewOf(n: number) {
  const raw = toUsageRaw(answer(n));
  assert.ok(raw);
  return toUsageView(raw);
}

test("the floor: nought stays nought, 1 to 4 read <5, 5 and up stay the number", () => {
  const expected: [number, number | "<5"][] = [
    [0, 0],
    [1, "<5"],
    [2, "<5"],
    [4, "<5"],
    [5, 5],
    [6, 6],
    [250, 250],
  ];
  for (const [n, cell] of expected) {
    const v = viewOf(n);
    assert.equal(v.waves[0].signups, cell, `wave ${n}`);
    assert.equal(v.back.cohorts[0].signups, cell, `cohort ${n}`);
    assert.equal(v.back.cohorts[0].returned, cell, `returned ${n}`);
    assert.equal(v.clubs.per_club[0].members, cell, `members ${n}`);
    assert.equal(v.clubs.per_club[0].events_this_month, cell, `events ${n}`);
    assert.equal(v.where.by_school[0].accounts, cell, `school ${n}`);
    assert.equal(v.where.by_campus[0].accounts, cell, `campus ${n}`);
  }
});

test("club chat reads as a band: 0, 1–9 (an en dash), 10+", () => {
  const expected: [number, string][] = [
    [0, "0"],
    [1, "1–9"],
    [9, "1–9"],
    [10, "10+"],
    [250, "10+"],
  ];
  for (const [n, band] of expected) {
    const club = viewOf(n).clubs.per_club[0];
    assert.equal(club.chat_7d, band, `7 days ${n}`);
    assert.equal(club.chat_30d, band, `30 days ${n}`);
  }
});

test("only the named cells are floored: every other count is passed as is", () => {
  const floored = new Set([
    "waves[].signups",
    "back.cohorts[].signups",
    "back.cohorts[].returned",
    "clubs.per_club[].members",
    "clubs.per_club[].events_this_month",
    "where.by_school[].accounts",
    "where.by_campus[].accounts",
  ]);
  const banded = new Set(["clubs.per_club[].chat_7d", "clubs.per_club[].chat_30d"]);
  const seen = new Set<string>();
  for (const [path, value] of leaves(viewOf(3))) {
    if (floored.has(path)) assert.equal(value, "<5", path);
    else if (banded.has(path)) assert.equal(value, "1–9", path);
    else if (typeof value === "number") assert.equal(value, 3, path);
    else assert.equal(typeof value, "string", path); // a day, a week or a name
    seen.add(path);
  }
  // The small totals beside them stay exact, which is why the floor is cosmetic.
  for (const path of ["door.onboarded", "back.active_now", "used.totals.club_members", "clubs.visible", "clubs.chat_7d"]) {
    assert.ok(seen.has(path), path);
  }
  for (const path of [...floored, ...banded]) assert.ok(seen.has(path), path);
});

test("the view is a copy: the raw answer is left as it was", () => {
  const raw = toUsageRaw(answer(3));
  assert.ok(raw);
  const before = structuredClone(raw);
  const view = toUsageView(raw);
  assert.deepEqual(raw, before);
  assert.notEqual(view.door.by_day, raw.door.by_day);
  assert.notEqual(view.used.totals, raw.used.totals);
});
