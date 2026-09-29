/**
 * Tests for `event-notice.ts`: a club's cancelled-event notice (S68 officer
 * tools, contracts C1 and C4). It's from the club, it's never hidden by a
 * block or mute of the officer (ruling 14), and its row never carries the
 * officer.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/event-notice.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// A variable specifier (the config.test.ts pattern): Node's type stripping
// needs the ".ts", and tsc would refuse it written into a static import.
const specifier = "./event-notice.ts";
const {
  cancelledLine,
  clubInitials,
  clubNameText,
  eventShortDate,
  eventTitleText,
  eventWhenText,
  isClubNotice,
  visibleActorFilter,
  withEventNotices,
} = (await import(specifier)) as typeof import("./event-notice");

// Sat Oct 3 2026, 7:00 PM in Indianapolis (EDT, UTC-4).
const STARTS = "2026-10-03T23:00:00Z";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** ICU may put a narrow no-break space before AM/PM; compare on plain spaces. */
const plain = (s: string | null) => (s === null ? null : s.replace(/\s/g, " "));

test("only event_cancelled is a club notice", () => {
  assert.equal(isClubNotice("event_cancelled"), true);
  for (const t of ["org_invite", "org_request_approved", "follow", "mention", "", null, undefined, 3]) {
    assert.equal(isClubNotice(t), false, String(t));
  }
});

test("the filter keeps club notices and drops everyone hidden, quoted", () => {
  assert.equal(
    visibleActorFilter([A, B]),
    `type.in.("event_cancelled"),actor_id.not.in.("${A}","${B}")`,
  );
  // A malformed id can't close the quote or the list.
  assert.equal(visibleActorFilter(['x"),or(y']), 'type.in.("event_cancelled"),actor_id.not.in.("x),or(y")');
});

test("dates are campus time, whatever zone the machine runs in", () => {
  assert.equal(plain(eventWhenText(STARTS)), "Sat, Oct 3, 7:00 PM");
  assert.equal(eventShortDate(STARTS), "Sat, Oct 3");
  // 1:30 AM UTC on the 4th is still the 3rd on campus.
  assert.equal(eventShortDate("2026-10-04T01:30:00Z"), "Sat, Oct 3");
  for (const bad of [null, undefined, "", "not a date"]) {
    assert.equal(eventWhenText(bad), null);
    assert.equal(eventShortDate(bad), null);
  }
});

test("the row line: title and time, with plain fallbacks", () => {
  assert.equal(plain(cancelledLine("Game Night", STARTS)), "cancelled Game Night · Sat, Oct 3, 7:00 PM");
  assert.equal(cancelledLine("  Game \n Night ", null), "cancelled Game Night");
  assert.equal(cancelledLine(null, null), "cancelled an event");
  assert.equal(eventTitleText("   "), "an event");
});

test("the club's name and initials, never empty", () => {
  assert.equal(clubNameText({ name: "Chess Club" }), "Chess Club");
  assert.equal(clubNameText(null), "A club");
  assert.equal(clubNameText({ name: "  " }), "A club");
  assert.equal(clubInitials({ name: "sigma alpha epsilon" }), "SA");
  assert.equal(clubInitials(null), "?");
});

type Row = { id: string; type: string; actor: { id: string } | null };

/** Just enough of a Supabase client for withEventNotices. */
function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const calls: Array<{ table: string; select: string; ids: string[] }> = [];
  const client = {
    from(table: string) {
      return {
        select(select: string) {
          return {
            async in(_col: string, ids: string[]) {
              calls.push({ table, select, ids });
              if (result instanceof Error) throw result;
              return result;
            },
          };
        },
      };
    },
  };
  return { client: client as never, calls };
}

const OFFICER = { id: "officer" };

test("club notices gain the event and lose the officer; other rows are untouched", async () => {
  const rows: Row[] = [
    { id: "n1", type: "event_cancelled", actor: OFFICER },
    { id: "n2", type: "like", actor: OFFICER },
  ];
  const { client, calls } = fakeClient({
    data: [{ id: "n1", event_title: "Game Night", event_starts_at: STARTS }],
    error: null,
  });
  const out = await withEventNotices(client, rows);
  assert.deepEqual(calls, [{ table: "notifications", select: "id,event_title,event_starts_at", ids: ["n1"] }]);
  assert.deepEqual(out[0], { id: "n1", type: "event_cancelled", actor: null, event_title: "Game Night", event_starts_at: STARTS });
  assert.deepEqual(out[1], { id: "n2", type: "like", actor: OFFICER, event_title: null, event_starts_at: null });
});

test("no club notice on the page, no second read (a database behind is never asked)", async () => {
  const { client, calls } = fakeClient(new Error("must not be called"));
  const out = await withEventNotices(client, [{ id: "n2", type: "follow", actor: OFFICER }]);
  assert.equal(calls.length, 0);
  assert.equal(out.length, 1);
});

test("a failed read keeps the notice, still without the officer", async () => {
  for (const result of [{ data: null, error: { message: "boom" } }, new Error("network")]) {
    const { client } = fakeClient(result);
    const original = console.error;
    console.error = () => {};
    try {
      const out = await withEventNotices(client, [{ id: "n1", type: "event_cancelled", actor: OFFICER }]);
      assert.deepEqual(out, [{ id: "n1", type: "event_cancelled", actor: null, event_title: null, event_starts_at: null }]);
    } finally {
      console.error = original;
    }
  }
});
