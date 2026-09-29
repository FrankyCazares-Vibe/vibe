/**
 * Tests for the cancel notice rules (`cancel-notice.ts`), S68 officer tools
 * B1, and for the migration that makes the rows possible
 * (20260930100000_event_cancel_notices.sql).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/cancel-notice.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

// Extensionless "./cancel-notice", as Next and tsc expect (manage.test.ts's hook).
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("cancel-notice.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  EVENT_CANCELLED_TYPE,
  NOTICE_TITLE_FALLBACK,
  NOTICE_TITLE_MAX,
  cancelNoticeRows,
  cancelRecipientIds,
  cancelSendsNotices,
  noticeTitle,
} = await import("./cancel-notice");

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

test("an event that already ended gets no notice; upcoming and under-way ones do", () => {
  // Ended an hour ago, and ending exactly now: no notice.
  assert.equal(cancelSendsNotices("2026-10-01T11:00:00+00:00", NOW), false);
  assert.equal(cancelSendsNotices("2026-10-01T12:00:00.000Z", NOW), false);
  // Under way (ends later today) and upcoming: notice.
  assert.equal(cancelSendsNotices("2026-10-01T12:00:01.000Z", NOW), true);
  assert.equal(cancelSendsNotices("2026-10-08T20:00:00+00:00", NOW), true);
  // An end that can't be read never sends anything.
  assert.equal(cancelSendsNotices("", NOW), false);
  assert.equal(cancelSendsNotices("not a date", NOW), false);
});

test("recipients: going and maybe, once each, never the officer, never 'no'", () => {
  const ids = cancelRecipientIds(
    [
      { user_id: "a", status: "going" },
      { user_id: "b", status: "maybe" },
      { user_id: "c", status: "no" },
      { user_id: "officer", status: "going" },
      { user_id: "a", status: "going" },
      { user_id: null, status: "going" },
      { user_id: "", status: "maybe" },
      { user_id: "d", status: "GOING" },
      { status: "going" },
    ],
    "officer",
  );
  assert.deepEqual(ids, ["a", "b"]);
  assert.deepEqual(cancelRecipientIds([], "officer"), []);
});

test("rows: the C1 shape, from the club, one per recipient", () => {
  const event = {
    id: "e1",
    org_id: "org-1",
    title: "  Rush night  ",
    starts_at: "2026-10-03T23:00:00+00:00",
    ends_at: "2026-10-04T02:00:00+00:00",
  };
  const rows = cancelNoticeRows(event, ["a", "b"], "officer");
  assert.deepEqual(rows, [
    {
      user_id: "a",
      actor_id: "officer",
      type: "event_cancelled",
      org_id: "org-1",
      event_title: "Rush night",
      event_starts_at: "2026-10-03T23:00:00+00:00",
    },
    {
      user_id: "b",
      actor_id: "officer",
      type: "event_cancelled",
      org_id: "org-1",
      event_title: "Rush night",
      event_starts_at: "2026-10-03T23:00:00+00:00",
    },
  ]);
  // Nothing that points at a post, comment or message.
  for (const key of ["post_id", "comment_id", "message_id"]) assert.ok(!(key in rows[0]));
  assert.deepEqual(cancelNoticeRows(event, [], "officer"), []);
  assert.equal(EVENT_CANCELLED_TYPE, "event_cancelled");
});

test("title: trimmed, at most 120 code points (Postgres counting), never blank", () => {
  assert.equal(noticeTitle("  Rush  "), "Rush");
  assert.equal(noticeTitle("x".repeat(130)).length, NOTICE_TITLE_MAX);
  // 121 emoji: JS .length is 242, Postgres char_length is 121. Keep 120 whole ones.
  const emoji = noticeTitle("🎉".repeat(121));
  assert.equal(Array.from(emoji).length, NOTICE_TITLE_MAX);
  assert.ok(!/[\uD800-\uDBFF]$/.test(emoji), "no half surrogate pair at the end");
  assert.equal(noticeTitle("   "), NOTICE_TITLE_FALLBACK);
});

test("the migration: every old type kept, 'event_cancelled' added, C1's shape CHECK", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260930100000_event_cancel_notices.sql", import.meta.url),
    "utf8",
  );
  // The latest earlier definition (20260916103000_org_join_policy_invites.sql).
  const prior = readFileSync(
    new URL("../../../supabase/migrations/20260916103000_org_join_policy_invites.sql", import.meta.url),
    "utf8",
  );
  const priorCheck = prior.slice(prior.lastIndexOf("add constraint notifications_type_check"));
  const priorTypes = [...priorCheck.slice(0, priorCheck.indexOf(";")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(priorTypes, [
    "follow", "connection", "like", "comment", "mention", "org_invite", "org_request_approved",
  ]);
  const add = sql.slice(sql.indexOf("add constraint notifications_type_check"));
  const newTypes = [...add.slice(0, add.indexOf(";")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(newTypes, [...priorTypes, EVENT_CANCELLED_TYPE]);

  const flat = sql.replace(/\s+/g, " ");
  assert.ok(flat.includes(
    "check (type <> 'event_cancelled' or (org_id is not null and event_title is not null and event_starts_at is not null))",
  ));
  assert.ok(flat.includes(`char_length(event_title) <= ${NOTICE_TITLE_MAX}`));
  assert.ok(flat.includes("add column event_title text"));
  assert.ok(flat.includes("add column event_starts_at timestamptz"));
  // No grant is widened.
  assert.ok(!/^\s*grant\b/im.test(sql), "the migration must not grant anything");
});
