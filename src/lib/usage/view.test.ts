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

/* ---------------------------------------------------------------- the day totals */

const {
  TALLY_COHORT_WEEKS,
  TALLY_DAY_KEYS,
  TALLY_OPEN_CAP_PER_ACTIVE,
  addUtcDays,
  fromStart,
  mondayOf,
  openCapped,
  toTallyRaw,
  toTallyView,
  weeksFromStart,
} = (await import(specifier)) as typeof import("./view");

// Wednesday Oct 28; counting began Wednesday Oct 14, so the first whole week is Oct 19.
const T_DAYS = ["2026-10-26", "2026-10-27", "2026-10-28"];
const n5 = (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown) => [a, b, c, d, e];

/** A whole answer the way `admin_usage_tally` sends it, every day count `n`. */
function tally(n: number) {
  return {
    today: "2026-10-28",
    since: "2026-10-26",
    days: 3,
    started: "2026-10-14",
    first_week: "2026-10-19",
    by_day: T_DAYS.map((day) => ({ day, ...every([...TALLY_DAY_KEYS], n), otto_capped: false, map_capped: false })),
    by_week: [
      { week: "2026-10-12", active: n },
      { week: "2026-10-19", active: n },
      { week: "2026-10-26", active: n },
    ],
    cohorts: [
      { week: "2026-10-12", seen: n5(null, n, n, null, null) },
      { week: "2026-10-19", seen: n5(n, n, null, null, null) },
      { week: "2026-10-26", seen: n5(n, null, null, null, null) },
    ],
  };
}

/** `tally(7)` with the value at a dotted path replaced (or removed, for `undefined` with `drop`). */
function tallyWith(path: string, value: unknown, drop = false): unknown {
  const a = structuredClone(tally(7)) as unknown as Json;
  const keys = path.split(".");
  let o = a;
  for (const k of keys.slice(0, -1)) o = o[k] as Json;
  if (drop) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
  return a;
}

test("the day totals: the same 10 as the browser's cap, five weeks per sign-up week, the columns", async () => {
  const touchSpecifier = "./touch.ts";
  const touch = (await import(touchSpecifier)) as typeof import("./touch");
  assert.equal(TALLY_OPEN_CAP_PER_ACTIVE, touch.OPEN_CAP_PER_ACTIVE);
  assert.equal(TALLY_COHORT_WEEKS, 5);
  assert.deepEqual(
    [...TALLY_DAY_KEYS],
    ["active", "iu", "purdue", "unknown_school", "phone", "desktop", "installed", "unknown_device", "otto_open", "map_open"],
  );
});

test("dates: Monday weeks and day sums in UTC", () => {
  assert.equal(mondayOf("2026-10-14"), "2026-10-12");
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
  assert.equal(addUtcDays("2026-10-28", 7), "2026-11-04");
  assert.equal(addUtcDays("2026-03-01", -1), "2026-02-28");
});

test("a clean day-totals answer reads back, with partial weeks and the next-week share worked out", () => {
  const raw = toTallyRaw(tally(7));
  assert.ok(raw);
  assert.deepEqual(raw.by_day, tally(7).by_day);
  assert.deepEqual(
    raw.by_week.map((w) => `${w.week} ${w.active} ${w.partial}`),
    ["2026-10-12 7 true", "2026-10-19 7 false", "2026-10-26 7 false"],
  );
  assert.deepEqual(raw.cohorts, [
    { week: "2026-10-12", seen: [null, 7, 7, null, null], next_week_pct: null },
    { week: "2026-10-19", seen: [7, 7, null, null, null], next_week_pct: 100 },
    { week: "2026-10-26", seen: [7, null, null, null, null], next_week_pct: null },
  ]);
  assert.equal(raw.started, "2026-10-14");
  assert.equal(raw.first_week, "2026-10-19");
});

test("before the first count: started and first_week null, every week partial, every cell null", () => {
  const a = tallyWith("started", null) as Json;
  a.first_week = null;
  const raw = toTallyRaw(a);
  assert.ok(raw);
  assert.equal(raw.started, null);
  assert.ok(raw.by_week.every((w) => w.partial));
  assert.ok(raw.cohorts.every((c) => c.seen.every((n) => n === null) && c.next_week_pct === null));
  assert.deepEqual(fromStart(raw.by_day, raw.started), []);
  assert.deepEqual(weeksFromStart(raw.by_week, raw.started), []);
});

test("not the day totals' shape: null, so the route says it couldn't read them", () => {
  for (const bad of [null, undefined, "on", 3, [], {}]) assert.equal(toTallyRaw(bad), null, String(bad));
  assert.equal(toTallyRaw(tallyWith("started", undefined, true)), null, "no started key");
  assert.equal(toTallyRaw(tallyWith("first_week", undefined, true)), null, "no first_week key");
  const cases: [string, unknown][] = [
    ["today", "2026-02-30"],
    ["since", "Oct 26"],
    ["days", -1],
    ["started", "Oct 14"],
    ["started", undefined],
    ["first_week", 20261019],
    ["by_day", {}],
    ["by_day", null],
    ["by_week", undefined],
    ["cohorts", null],
    ["cohorts", "2026-10-19"],
  ];
  for (const [path, value] of cases) {
    assert.equal(toTallyRaw(tallyWith(path, value)), null, `${path} = ${JSON.stringify(value)}`);
  }
});

test("a day, week or sign-up week row that can't be read is dropped; fields not in the shape too", () => {
  const day = (d: string, active: unknown) => ({ day: d, ...every([...TALLY_DAY_KEYS], 1), active, user_id: "df5ab44e" });
  let raw = toTallyRaw(tallyWith("by_day", [day("2026-10-28", 3), day("2026-10-27", -1), day("Oct 26", 2), null]));
  assert.deepEqual(raw?.by_day.map((d) => `${d.day} ${d.active}`), ["2026-10-28 3"]);
  assert.ok(!JSON.stringify(raw).includes("df5ab44e"));

  raw = toTallyRaw(
    tallyWith("cohorts", [
      { week: "2026-10-19", seen: [7, 7, null, null] }, // four cells, not five
      { week: "2026-10-20", seen: n5(7, 7, null, null, null) }, // not a Monday
      { week: "2026-10-26", seen: n5(-1, null, null, null, null) }, // not a count
      { week: "2026-10-26", seen: "7,7" },
      { week: "2026-10-19", seen: n5("6", "3", null, null, null), next_week_pct: 99, user_id: "x" },
    ]),
  );
  assert.deepEqual(raw?.cohorts, [{ week: "2026-10-19", seen: [6, 3, null, null, null], next_week_pct: 50 }]);
});

test("a cell the function shouldn't have counted is nulled here: before the first whole week, or still to come", () => {
  const raw = toTallyRaw(
    tallyWith("cohorts", [
      { week: "2026-10-12", seen: n5(9, 9, 9, 9, 9) },
      { week: "2026-10-26", seen: n5(9, 9, 9, 9, 9) },
    ]),
  );
  assert.deepEqual(raw?.cohorts.map((c) => c.seen), [
    [null, 9, 9, null, null],
    [9, null, null, null, null],
  ]);
  // The apply week's own sign-ups can't read over 100% back: their first week is partial, so no share.
  assert.equal(raw?.cohorts[0].next_week_pct, null);
});

test("the next-week share needs both weeks counted and at least 5 the first week", () => {
  const share = (a: unknown, b: unknown) =>
    toTallyRaw(tallyWith("cohorts", [{ week: "2026-10-19", seen: n5(a, b, null, null, null) }]))?.cohorts[0]
      .next_week_pct;
  assert.equal(share(4, 4), null);
  assert.equal(share(5, 2), 40);
  assert.equal(share(6, 4), 67);
  assert.equal(share(5, 0), 0);
  assert.equal(share(5, null), null);
  assert.equal(share(null, 5), null);
});

test("the day totals' floor: school, device and sign-up week cells; active and opens exact; nulls kept", () => {
  const expected: [number, number | "<5"][] = [
    [0, 0],
    [1, "<5"],
    [4, "<5"],
    [5, 5],
    [12, 12],
  ];
  for (const [n, cell] of expected) {
    const raw = toTallyRaw(tally(n));
    assert.ok(raw);
    const v = toTallyView(raw);
    const d = v.by_day[0];
    for (const k of ["iu", "purdue", "unknown_school", "phone", "desktop", "installed", "unknown_device"] as const) {
      assert.equal(d[k], cell, `${k} ${n}`);
    }
    assert.equal(d.active, n);
    assert.equal(d.otto_open, n);
    assert.equal(d.map_open, n);
    assert.ok(v.by_week.every((w) => w.active === n));
    assert.deepEqual(v.cohorts[1].seen, [cell, cell, null, null, null]);
    assert.deepEqual(raw, toTallyRaw(tally(n)), "the raw answer is left as it was");
  }
});

test("from the start: days before the first count and weeks that ended before it are left out", () => {
  const rows = T_DAYS.map((day) => ({ day }));
  assert.deepEqual(fromStart(rows, "2026-10-27").map((r) => r.day), ["2026-10-27", "2026-10-28"]);
  assert.deepEqual(fromStart(rows, "2026-10-01").length, 3);
  const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"].map((week) => ({ week }));
  // Counting began Wed Oct 14: the week of Oct 12 is kept (partial), Oct 5 ended before it.
  assert.deepEqual(weeksFromStart(weeks, "2026-10-14").map((w) => w.week), ["2026-10-12", "2026-10-19"]);
  assert.deepEqual(weeksFromStart(weeks, "2026-10-18").map((w) => w.week), ["2026-10-12", "2026-10-19"]);
  assert.deepEqual(weeksFromStart(weeks, "2026-10-19").map((w) => w.week), ["2026-10-19"]);
});

test("hit the cap: the writer's own mark, read as true only when it says true", () => {
  const marked = (otto: unknown, map: unknown) =>
    toTallyRaw(tallyWith("by_day", [{ ...tally(7).by_day[2], otto_capped: otto, map_capped: map }]))?.by_day[0];
  // A day cut early: 15 Otto opens with 2 active is under 10 per person, yet the stop turned some away.
  const day = { ...tally(7).by_day[2], active: 2, otto_open: 15, otto_capped: true, map_capped: false };
  const raw = toTallyRaw(tallyWith("by_day", [day]));
  assert.ok(raw);
  assert.equal(openCapped(raw.by_day[0], "otto_open"), true);
  assert.equal(openCapped(raw.by_day[0], "map_open"), false);
  assert.equal(openCapped(toTallyView(raw).by_day[0], "otto_open"), true, "the mark reaches the browser");
  // Not the final counts: a day at exactly the stop with no mark is not flagged.
  const full = toTallyRaw(tallyWith("by_day", [{ ...day, otto_open: 20, otto_capped: false }]));
  assert.equal(full && openCapped(full.by_day[0], "otto_open"), false);
  // Anything but true is false, and a day without the marks still reads.
  for (const v of ["true", 1, null, undefined]) {
    const d = marked(v, v);
    assert.ok(d);
    assert.equal(d.otto_capped, false, String(v));
    assert.equal(d.map_capped, false, String(v));
  }
  assert.deepEqual(marked(true, true) && [marked(true, true)?.otto_capped, marked(true, true)?.map_capped], [true, true]);
});
