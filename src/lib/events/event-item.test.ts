/**
 * One GET /api/events item (`event-item.ts`), with event check-in's three
 * fields (Oct 19 2026, contract 3.6): the keys every client already reads
 * keep their old order, and checkin_open, checked_in_count and
 * viewer_checked_in come last; without a check-in row they read "nothing
 * known" (false / null / false).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/event-item.test.ts
 *
 * The resolve hook maps "@/..." to src/ and lets the files import each other
 * extensionless, the manage.test.ts pattern; nothing is stubbed.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("event-item.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const spec = "./event-item.ts";
const { toEventListItem } = (await import(spec)) as typeof import("./event-item");
type EventListRow = import("./event-item").EventListRow;

const ME = "11111111-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ROW: EventListRow = {
  id: "eeeeeeee-0000-4000-8000-000000000001",
  org_id: ORG,
  creator_id: ME,
  title: "Fall Formal",
  description: "Dress up",
  starts_at: "2026-10-20T23:00:00+00:00",
  ends_at: "2026-10-21T02:00:00+00:00",
  location: "The Union",
  created_at: "2026-10-01T00:00:00+00:00",
  creator: { id: ME, name: null, handle: null, avatar_url: null, school: null, campus_id: null },
};
const CTX = {
  viewerId: ME,
  viewerIsOfficer: true,
  org: { id: ORG, handle: "sae", name: "SAE", logo_url: null, verified: true },
  goingCount: 12,
  interestedCount: 3,
  viewerStatus: "going" as const,
};

/** The keys GET has always sent, in its order (event-item.ts's header). */
const OLD_KEYS = [
  "id",
  "org_id",
  "creator_id",
  "title",
  "description",
  "starts_at",
  "ends_at",
  "location",
  "created_at",
  "creator",
  "going_count",
  "interested_count",
  "viewer_status",
  "is_creator",
  "viewer_can_manage",
  "org",
];
const CHECKIN_KEYS = ["checkin_open", "checked_in_count", "viewer_checked_in"];

test("the old keys keep their order, and the three check-in keys come last", () => {
  const item = toEventListItem(ROW, CTX);
  assert.deepEqual(Object.keys(item), [...OLD_KEYS, ...CHECKIN_KEYS]);
  const withRow = toEventListItem(ROW, { ...CTX, checkin: { open: true, count: 7, viewerCheckedIn: true } });
  assert.deepEqual(Object.keys(withRow), [...OLD_KEYS, ...CHECKIN_KEYS]);
});

test("without a check-in row: not open, no count, not checked in", () => {
  const item = toEventListItem(ROW, CTX);
  assert.equal(item.checkin_open, false);
  assert.equal(item.checked_in_count, null);
  assert.equal(item.viewer_checked_in, false);
  const undef = toEventListItem(ROW, { ...CTX, checkin: undefined });
  assert.deepEqual(
    [undef.checkin_open, undef.checked_in_count, undef.viewer_checked_in],
    [false, null, false],
    "PATCH's failed read passes undefined",
  );
});

test("with a row: its three values, the count as the database floored it", () => {
  const item = toEventListItem(ROW, { ...CTX, checkin: { open: true, count: 7, viewerCheckedIn: true } });
  assert.deepEqual([item.checkin_open, item.checked_in_count, item.viewer_checked_in], [true, 7, true]);
  // A student under 5 gets null from event_checkin_state; it stays null.
  const under = toEventListItem(ROW, { ...CTX, viewerIsOfficer: false, checkin: { open: true, count: null, viewerCheckedIn: false } });
  assert.deepEqual([under.checkin_open, under.checked_in_count, under.viewer_checked_in], [true, null, false]);
});

test("the old values are untouched by the check-in fields", () => {
  const before = toEventListItem(ROW, CTX);
  const after = toEventListItem(ROW, { ...CTX, checkin: { open: true, count: 9, viewerCheckedIn: true } });
  for (const key of OLD_KEYS) {
    assert.deepEqual((after as Record<string, unknown>)[key], (before as Record<string, unknown>)[key], key);
  }
  assert.equal(before.creator, null, "a club row ships no creator");
  assert.equal(before.viewer_can_manage, true);
  assert.equal(before.going_count, 12);
});
