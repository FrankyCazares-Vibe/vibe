/**
 * Tests for the club event rules (`manage.ts`), security wave 2 batch A4.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/manage.test.ts
 *
 * The resolve hook lets this file import "./manage" extensionless, which is
 * what Next and tsc expect (same pattern as reports.test.ts).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("manage.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  EVENT_MAX_DESCRIPTION,
  EVENT_MAX_DURATION_DAYS,
  EVENT_MAX_DURATION_MS,
  EVENT_MAX_LOCATION,
  EVENT_MAX_TITLE,
  eventTimesProblem,
  viewerCanManage,
  withoutClubCreator,
} = await import("./manage");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-01T12:00:00.000Z");

test("viewerCanManage: a club event follows the CURRENT officer role, not the creator", () => {
  const club = { orgId: "org-1", creatorId: "emery", viewerId: "emery" };
  // Demoted creator: made the event, is no longer an owner/admin.
  assert.equal(viewerCanManage({ ...club, viewerIsOfficer: false }), false);
  // Current officer who didn't make it.
  assert.equal(viewerCanManage({ ...club, viewerId: "avery", viewerIsOfficer: true }), true);
  // Creator who is still an officer.
  assert.equal(viewerCanManage({ ...club, viewerIsOfficer: true }), true);
  // A stranger.
  assert.equal(viewerCanManage({ ...club, viewerId: "blake", viewerIsOfficer: false }), false);
});

test("viewerCanManage: an org-less event is managed by its creator only", () => {
  assert.equal(viewerCanManage({ orgId: null, creatorId: "u1", viewerId: "u1", viewerIsOfficer: false }), true);
  assert.equal(viewerCanManage({ orgId: null, creatorId: "u1", viewerId: "u2", viewerIsOfficer: true }), false);
  assert.equal(viewerCanManage({ orgId: null, creatorId: null, viewerId: "u1", viewerIsOfficer: false }), false);
});

test("withoutClubCreator: club events drop the creator, org-less events keep it", () => {
  const creator = { id: "u1", handle: "emery_admin" };
  const club = withoutClubCreator({ id: "e1", org_id: "org-1", creator_id: "u1", creator });
  assert.equal(club.creator, null);
  assert.equal(club.creator_id, "u1");
  assert.equal(club.id, "e1");
  const personal = withoutClubCreator({ id: "e2", org_id: null, creator_id: "u1", creator });
  assert.deepEqual(personal.creator, creator);
});

test("eventTimesProblem: accepts a normal two-hour event and the 14-day edge", () => {
  assert.equal(eventTimesProblem(NOW + DAY, NOW + DAY + 2 * HOUR, NOW), null);
  assert.equal(eventTimesProblem(NOW, NOW + EVENT_MAX_DURATION_MS, NOW), null);
  // Inside the 5-minute grace (the form took a moment to submit).
  assert.equal(eventTimesProblem(NOW - 4 * 60_000, NOW + HOUR, NOW), null);
  // Zero-length is allowed, as the database's ends_at >= starts_at allows it.
  assert.equal(eventTimesProblem(NOW + HOUR, NOW + HOUR, NOW), null);
});

test("eventTimesProblem: refuses missing, reversed, past and over-long events", () => {
  assert.match(eventTimesProblem(Number.NaN, NOW, NOW)?.error ?? "", /required/);
  assert.match(eventTimesProblem(NOW + 2 * HOUR, NOW + HOUR, NOW)?.error ?? "", /after start/);
  assert.match(eventTimesProblem(NOW - 6 * 60_000, NOW + HOUR, NOW)?.error ?? "", /in the past/);
  const tooLong = eventTimesProblem(NOW, NOW + EVENT_MAX_DURATION_MS + 1, NOW);
  assert.equal(tooLong?.code, "invalid_times");
  assert.equal(tooLong?.error, "An event can last at most 14 days");
  // The 2099 "pin it to the top forever" event.
  assert.notEqual(eventTimesProblem(NOW, Date.parse("2099-01-01T00:00:00Z"), NOW), null);
});

test("the route's caps are the database CHECKs' numbers (20260928110000)", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260928110000_club_events_rules.sql", import.meta.url),
    "utf8",
  );
  assert.equal(EVENT_MAX_DURATION_DAYS, 14);
  assert.ok(sql.includes(`(ends_at - starts_at) <= interval '${EVENT_MAX_DURATION_DAYS} days'`));
  assert.ok(sql.includes(`char_length(title) <= ${EVENT_MAX_TITLE}`));
  assert.ok(sql.includes(`char_length(description) <= ${EVENT_MAX_DESCRIPTION}`));
  assert.ok(sql.includes(`char_length(location) <= ${EVENT_MAX_LOCATION}`));
});
