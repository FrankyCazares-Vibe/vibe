/**
 * Tests for the waitlist pages' pure helpers (`view.ts`): the refusal copy,
 * the landing buttons, and the admin tab's filters, counts and selection.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/view.test.ts
 *
 * view.ts and types.ts have type-only imports (erased), so both load through
 * a dynamic import of their ".ts" paths, as in status.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { AdminWaitlistRow } from "./types";

const viewPath = "./view.ts";
const typesPath = "./types.ts";
const view = (await import(viewPath)) as typeof import("./view");
const types = (await import(typesPath)) as typeof import("./types");
const {
  CLUB_WAITLIST_HREF,
  EMPTY_WAITLIST_FILTERS,
  WAITLIST_BATCH_CAP,
  canBatchInvite,
  countWaitlistRows,
  daysUntilDeleted,
  filterWaitlistRows,
  gateRefusalCopy,
  isLeavingSoon,
  landingCta,
  leavingLabel,
  selectShown,
  tooLateForCode,
  WAITLIST_CODE_MIN_LEFT_HOURS,
} = view;

function row(over: Partial<AdminWaitlistRow> & { id: string }): AdminWaitlistRow {
  return {
    maskedEmail: "a*****@iu.edu",
    name: "Avery",
    schoolSystem: "iu",
    classYear: 2,
    major: "Informatics",
    clubs: "Chess Club, Film Society",
    isOfficer: false,
    officerClub: null,
    wish: null,
    source: "landing",
    origin: "form",
    newsOptIn: false,
    status: "waiting",
    createdAt: "2026-10-03T12:00:00Z",
    confirmedAt: "2026-10-03T12:05:00Z",
    codeIssuedAt: null,
    codeExpiresAt: null,
    deletesAt: null,
    batch: null,
    inviteCount: 0,
    joinedHandle: null,
    ...over,
  };
}

const ROWS: AdminWaitlistRow[] = [
  row({ id: "1" }),
  row({ id: "2", name: "Blake", schoolSystem: "purdue", maskedEmail: "b*****@purdue.edu", classYear: null, major: "Nursing", clubs: null, source: null, status: "unconfirmed" }),
  row({ id: "3", name: "Casey", isOfficer: true, officerClub: "Robotics", clubs: null, source: "club", status: "invited", batch: "officers-1" }),
  row({ id: "4", name: "Drew", schoolSystem: null, maskedEmail: "d*****@gmail.com", origin: "founder", major: null, classYear: 5, isOfficer: true, officerClub: "Film Society", source: null, status: "joined", joinedHandle: "drew" }),
  row({ id: "5", name: "Emery", classYear: 1, major: "Computer Science", clubs: "Robotics", wish: "Find study groups", status: "expired" }),
];

const ids = (rows: AdminWaitlistRow[]) => rows.map((r) => r.id);

test("the two paths match types.ts", () => {
  assert.equal(landingCta(true).href, types.SIGNUP_PATH);
  assert.ok(landingCta(false).href.startsWith(`${types.WAITLIST_PATH}?`));
  assert.ok(CLUB_WAITLIST_HREF.startsWith(`${types.WAITLIST_PATH}?`));
});

test("gateRefusalCopy: a sentence for every reason, none naming the hook", () => {
  const seen = new Set<string>();
  for (const reason of types.GATE_REFUSALS) {
    const copy = gateRefusalCopy(reason);
    assert.match(copy, /^[A-Z].*\.$/);
    assert.doesNotMatch(copy, /\[vibe:|hook|beta/i);
    seen.add(copy);
  }
  assert.equal(seen.size, types.GATE_REFUSALS.length);
  assert.match(gateRefusalCopy("access_code_required"), /opening in waves/);
  // The gate can't tell a typo from a code whose entry was deleted: both words.
  assert.match(gateRefusalCopy("access_code_invalid"), /don't recognise.*or it has expired/);
  assert.match(gateRefusalCopy("access_code_expired"), /expired/);
  assert.match(gateRefusalCopy("access_code_used"), /already been used/);
  assert.match(gateRefusalCopy("access_code_in_use"), /15 minutes/);
  assert.match(gateRefusalCopy("access_code_full"), /as many times/);
  assert.match(gateRefusalCopy("access_code_school_email"), /iu\.edu or purdue\.edu/);
});

test("landingCta: closed is the waitlist, tagged; open is today's sign-up", () => {
  assert.deepEqual(landingCta(false), { label: "Join the waitlist", href: "/waitlist?src=landing" });
  assert.deepEqual(landingCta(false, "door"), { label: "Join the waitlist", href: "/waitlist?src=landing" });
  assert.deepEqual(landingCta(true), { label: "Sign up", href: "/auth/signup" });
  assert.deepEqual(landingCta(true, "door"), { label: "Create your account", href: "/auth/signup" });
  assert.equal(CLUB_WAITLIST_HREF, "/waitlist?officer=1&src=club");
});

test("filterWaitlistRows: no filters keeps everything, in order", () => {
  assert.deepEqual(ids(filterWaitlistRows(ROWS, EMPTY_WAITLIST_FILTERS)), ["1", "2", "3", "4", "5"]);
});

test("filterWaitlistRows: each filter", () => {
  const f = (over: Partial<typeof EMPTY_WAITLIST_FILTERS>) => ids(filterWaitlistRows(ROWS, { ...EMPTY_WAITLIST_FILTERS, ...over }));
  assert.deepEqual(f({ status: "waiting" }), ["1"]);
  assert.deepEqual(f({ status: "expired" }), ["5"]);
  assert.deepEqual(f({ school: "purdue" }), ["2"]);
  assert.deepEqual(f({ school: "none" }), ["4"]);
  assert.deepEqual(f({ school: "iu" }), ["1", "3", "5"]);
  assert.deepEqual(f({ year: "none" }), ["2"]);
  assert.deepEqual(f({ year: "5" }), ["4"]);
  assert.deepEqual(f({ year: "2" }), ["1", "3"]);
  assert.deepEqual(f({ major: "  NURS " }), ["2"]);
  assert.deepEqual(f({ club: "robotics" }), ["3", "5"]);
  assert.deepEqual(f({ club: "film" }), ["1", "4"]);
  assert.deepEqual(f({ officersOnly: true }), ["3", "4"]);
  assert.deepEqual(f({ source: "none" }), ["2", "4"]);
  assert.deepEqual(f({ source: "club" }), ["3"]);
  assert.deepEqual(f({ text: "study" }), ["5"]);
  assert.deepEqual(f({ text: "gmail" }), ["4"]);
  assert.deepEqual(f({ text: "officers-1" }), ["3"]);
  assert.deepEqual(f({ text: "nobody" }), []);
  assert.deepEqual(f({ school: "iu", officersOnly: true, club: "robot" }), ["3"]);
});

test("countWaitlistRows: totals, statuses, schools, officers, sources", () => {
  const c = countWaitlistRows(ROWS);
  assert.equal(c.total, 5);
  assert.deepEqual(c.status, { unconfirmed: 1, waiting: 1, invited: 1, expired: 1, joined: 1 });
  assert.deepEqual(c.school, { iu: 3, purdue: 1, none: 1 });
  assert.equal(c.officers, 2);
  assert.deepEqual(c.sources, [
    { source: "landing", count: 2 },
    { source: "none", count: 2 },
    { source: "club", count: 1 },
  ]);
  const empty = countWaitlistRows([]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.sources, []);
});

test("canBatchInvite: only confirmed people with no code", () => {
  assert.deepEqual(ROWS.filter((r) => canBatchInvite(r)).map((r) => r.id), ["1"]);
});

test("selectShown: only invitable rows, never past the cap, keeps the old picks", () => {
  const many = Array.from({ length: 40 }, (_, i) => row({ id: `w${i}` }));
  const mixed = [row({ id: "u", status: "unconfirmed" }), ...many];
  const first = selectShown(mixed, new Set());
  assert.equal(first.size, WAITLIST_BATCH_CAP);
  assert.equal(first.has("u"), false);
  assert.ok(first.has("w0") && first.has("w24") && !first.has("w25"));
  const kept = selectShown(many, new Set(["x1", "x2"]));
  assert.equal(kept.size, WAITLIST_BATCH_CAP);
  assert.ok(kept.has("x1") && kept.has("x2") && kept.has("w22") && !kept.has("w23"));
  const full = new Set(Array.from({ length: 25 }, (_, i) => `y${i}`));
  assert.deepEqual([...selectShown(many, full)], [...full]);
  assert.equal(selectShown(many, new Set(), 3).size, 3);
});

test("waitlistBatchName (types.ts): a fixed word and a number, never free text", () => {
  const { waitlistBatchName, WAITLIST_BATCH_RE, WAITLIST_BATCH_PREFIXES } = types;
  assert.equal(waitlistBatchName("wave", "1"), "wave-1");
  assert.equal(waitlistBatchName("officers", 12), "officers-12");
  assert.equal(waitlistBatchName("test", " 999 "), "test-999");
  assert.equal(waitlistBatchName("clubs", "007"), "clubs-7");
  for (const [w, n] of [["wave", "0"], ["wave", "1000"], ["wave", ""], ["wave", "1.5"], ["wave", "-1"], ["sam", "1"], ["Wave", "1"]] as const) {
    assert.equal(waitlistBatchName(w, n), null, `${w} ${n}`);
  }
  assert.deepEqual([...WAITLIST_BATCH_PREFIXES], ["wave", "officers", "clubs", "friends", "test"]);
  for (const ok of ["wave-1", "friends-42", "test-999"]) assert.ok(WAITLIST_BATCH_RE.test(ok), ok);
  for (const bad of ["sam-smith", "wave", "wave-1000", "wave-1-sam", "officers-", "sae-wave-2"]) {
    assert.ok(!WAITLIST_BATCH_RE.test(bad), bad);
  }
});

test("leaving soon: within 5 days, never a joined row, soonest first", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const rows = [
    row({ id: "a", deletesAt: at(6) }),
    row({ id: "b", deletesAt: at(4.5) }),
    row({ id: "c", deletesAt: at(0.2), status: "invited" }),
    row({ id: "d", deletesAt: at(1), status: "joined" }),
    row({ id: "e", deletesAt: at(5) }),
    row({ id: "f" }),
  ];
  assert.deepEqual(rows.filter((r) => isLeavingSoon(r, now)).map((r) => r.id), ["b", "c", "e"]);
  // Calendar days in Indiana (now is 7 AM there): 4.5 days on is 7 PM on Nov 5, four days away.
  assert.deepEqual(rows.map((r) => daysUntilDeleted(r, now)), [6, 4, 0, 1, 5, null]);
  assert.equal(daysUntilDeleted(row({ id: "x", deletesAt: at(-2) }), now), 0);
  // 3 AM UTC on Nov 4 is still Nov 3 in Indiana: two days after Nov 1.
  assert.equal(daysUntilDeleted(row({ id: "y", deletesAt: "2026-11-04T03:00:00Z" }), now), 2);
  // 23 hours on, but past Indiana midnight: tomorrow.
  assert.equal(daysUntilDeleted(row({ id: "z", deletesAt: "2026-11-02T06:00:00Z" }), new Date("2026-11-01T07:00:00Z")), 1);
  const shown = filterWaitlistRows(rows, { ...EMPTY_WAITLIST_FILTERS, leavingSoon: true }, now);
  assert.deepEqual(ids(shown), ["c", "b", "e"]);
  assert.equal(countWaitlistRows(rows, now).leavingSoon, 3);
  assert.deepEqual(ids(filterWaitlistRows(rows, EMPTY_WAITLIST_FILTERS, now)), ["a", "b", "c", "d", "e", "f"]);
});

test("the last day: no code, \"Leaves within a day\", and Select shown skips it (with Leaving within 5 days on)", () => {
  assert.equal(WAITLIST_CODE_MIN_LEFT_HOURS, 24);
  // 7 AM in Indiana on Nov 1.
  const now = new Date("2026-11-01T12:00:00Z");
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  const rows = [
    row({ id: "past", deletesAt: at(-1) }),
    row({ id: "h20", deletesAt: at(20) }), // 3 AM Indiana on Nov 2: tomorrow's date, but under a day
    row({ id: "h23", deletesAt: at(23.9) }),
    row({ id: "h25", deletesAt: at(25) }),
    row({ id: "d3", deletesAt: at(72) }),
    row({ id: "unk" }),
  ];
  assert.deepEqual(rows.map((r) => tooLateForCode(r, now)), [true, true, true, false, false, false]);
  assert.deepEqual(rows.map((r) => canBatchInvite(r, now)), [false, false, false, true, true, true]);
  assert.deepEqual(rows.map((r) => leavingLabel(r, now)), [
    "Leaves within a day", "Leaves within a day", "Leaves within a day", "Leaves tomorrow", "Leaves in 3 days", null,
  ]);
  // A joined row is never flagged, even in its last day; an unconfirmed one can't be batched anyway.
  assert.equal(leavingLabel(row({ id: "j", deletesAt: at(2), status: "joined" }), now), null);
  assert.equal(canBatchInvite(row({ id: "u", deletesAt: at(48), status: "unconfirmed" }), now), false);

  // The filter puts the soonest first; Select shown passes over the three with under a day.
  const shown = filterWaitlistRows(rows, { ...EMPTY_WAITLIST_FILTERS, leavingSoon: true }, now);
  assert.deepEqual(ids(shown), ["past", "h20", "h23", "h25", "d3"]);
  assert.deepEqual([...selectShown(shown, new Set(), WAITLIST_BATCH_CAP, now)], ["h25", "d3"]);
  // ... and never past the cap, and keeps what was already picked.
  assert.deepEqual([...selectShown(shown, new Set(["x"]), 2, now)], ["x", "h25"]);
});

test("waitlistPastLine (types.ts): past the deletion moment counts as gone", () => {
  const { waitlistPastLine } = types;
  const base = { created_at: "2026-10-01T00:00:00Z", confirm_sent_at: "2026-10-01T00:00:05Z",
    confirmed_at: "2026-10-01T01:00:00Z", code_hash: null, origin: "form" };
  // Confirmed: 38 days after joining, Nov 8.
  assert.equal(waitlistPastLine(base, new Date("2026-11-07T23:59:00Z")), false);
  assert.equal(waitlistPastLine(base, new Date("2026-11-08T00:01:00Z")), true);
  // Unconfirmed, no code: 28 days after the last confirm email (Oct 5 -> Nov 2).
  const unconfirmed = { ...base, confirmed_at: null, confirm_sent_at: "2026-10-05T00:00:00Z" };
  assert.equal(waitlistPastLine(unconfirmed, new Date("2026-11-01T23:59:00Z")), false);
  assert.equal(waitlistPastLine(unconfirmed, new Date("2026-11-02T00:01:00Z")), true);
  assert.equal(waitlistPastLine({ ...unconfirmed, code_hash: "a".repeat(64) }, new Date("2026-11-02T00:01:00Z")), false);
  assert.equal(waitlistPastLine({ ...base, created_at: "nope" }, new Date("2027-01-01T00:00:00Z")), false);
});
