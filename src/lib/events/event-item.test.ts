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
/** Oct 22, 2026 ("Members only" events), then Oct 23, 2026 (event icons, then event covers): the last three keys. */
const VISIBILITY_KEYS = ["visibility", "icon", "cover_url"];

test("the old keys keep their order, the three check-in keys come next, then visibility, icon and cover_url", () => {
  const item = toEventListItem(ROW, CTX);
  assert.deepEqual(Object.keys(item), [...OLD_KEYS, ...CHECKIN_KEYS, ...VISIBILITY_KEYS]);
  const withRow = toEventListItem(ROW, { ...CTX, checkin: { open: true, count: 7, viewerCheckedIn: true } });
  assert.deepEqual(Object.keys(withRow), [...OLD_KEYS, ...CHECKIN_KEYS, ...VISIBILITY_KEYS]);
  // The row read with EVENT_ROW_COLUMNS carries `visibility` after created_at;
  // it leaves its select-order place and lands last.
  const read = { id: ROW.id, org_id: ORG, creator_id: ME, title: ROW.title, description: ROW.description,
    starts_at: ROW.starts_at, ends_at: ROW.ends_at, location: ROW.location, created_at: ROW.created_at,
    visibility: "members", icon: "food", cover_key: null, creator: ROW.creator };
  assert.deepEqual(Object.keys(toEventListItem(read, CTX)), [...OLD_KEYS, ...CHECKIN_KEYS, ...VISIBILITY_KEYS]);
});

test("visibility: \"members\" stays; missing, null or junk reads \"everyone\"", () => {
  assert.equal(toEventListItem({ ...ROW, visibility: "members" }, CTX).visibility, "members");
  assert.equal(toEventListItem({ ...ROW, visibility: "everyone" }, CTX).visibility, "everyone");
  assert.equal(toEventListItem(ROW, CTX).visibility, "everyone", "a row without the column");
  assert.equal(toEventListItem({ ...ROW, visibility: null }, CTX).visibility, "everyone");
  assert.equal(toEventListItem({ ...ROW, visibility: "Members" }, CTX).visibility, "everyone");
});

test("EVENT_ROW_COLUMNS names visibility, then icon, then cover_key, last", async () => {
  const { EVENT_ROW_COLUMNS } = (await import(spec)) as typeof import("./event-item");
  assert.deepEqual(EVENT_ROW_COLUMNS.split(",").slice(-3), ["visibility", "icon", "cover_key"]);
});

// ── The cover photo (Oct 23, 2026, event covers, batch B1) ─────────────────

const COVER = `orgs/${ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`;

test("cover_url: the event's cover address, built from the key's file name; the key itself is never sent", () => {
  const item = toEventListItem({ ...ROW, cover_key: COVER }, CTX);
  assert.equal(item.cover_url, `/api/events/${ROW.id}/cover?v=3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`);
  assert.equal("cover_key" in item, false, "no cover_key key at all");
  assert.equal(JSON.stringify(item).includes(COVER), false, "the key appears nowhere in the item");
  assert.equal(JSON.stringify(item).includes(`orgs/${ORG}/events`), false);
});

test("cover_url: missing, null, or a key that isn't this club's cover reads null (the icon shows)", () => {
  assert.equal(toEventListItem(ROW, CTX).cover_url, null, "a row without the column");
  assert.equal(toEventListItem({ ...ROW, cover_key: null }, CTX).cover_url, null);
  for (const junk of [
    "",
    `orgs/eeeeeeee-0000-4000-8000-000000000002/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    `orgs/${ORG}/banner/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    "https://example.com/a.jpg",
  ]) {
    assert.equal(toEventListItem({ ...ROW, cover_key: junk }, CTX).cover_url, null, junk);
  }
  assert.equal(toEventListItem({ ...ROW, org_id: null, cover_key: COVER }, CTX).cover_url, null, "an org-less event");
});

test("icon (Oct 23, 2026): one of the twelve keys stays; missing, null or junk reads null (the calendar)", () => {
  assert.equal(toEventListItem({ ...ROW, icon: "food" }, CTX).icon, "food");
  assert.equal(toEventListItem({ ...ROW, icon: "party" }, CTX).icon, "party");
  assert.equal(toEventListItem(ROW, CTX).icon, null, "a row without the column");
  assert.equal(toEventListItem({ ...ROW, icon: null }, CTX).icon, null);
  for (const junk of ["Food", " food", "", "calendar", "<svg>"]) {
    assert.equal(toEventListItem({ ...ROW, icon: junk }, CTX).icon, null, junk);
  }
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
