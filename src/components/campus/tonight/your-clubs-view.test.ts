/**
 * Tests for `your-clubs-view.ts`, the pure half of "Your clubs" on the
 * desktop Feed (C2, CONTRACT.md §4 and §8): the merge of the member and
 * follower reads, member wins a duplicate, the order (newest Board post
 * first, nothing posted last, then name), no author name anywhere in the
 * output, the age steps and the spoken row label.
 *
 * Run with:
 *   node --test src/components/campus/tonight/your-clubs-view.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `rolling-strip-view.test.ts` — Node's type
 * stripping doesn't resolve the "@/…" alias or add file extensions. The
 * module under test imports one constant from src/lib/push/event-notice.ts,
 * which has type imports only, so nothing else loads.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

import type { FollowedBoard, InboxClub, OrgRef, Preview } from "@/lib/chat/types";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("your-clubs-view.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
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

const { YOUR_CLUBS_FOLD_MAX, YOUR_CLUBS_MAX, mergeYourClubs, relativeAge, spokenAge, yourClubLabel, yourClubsState } =
  await import("./your-clubs-view");

const BOARD_EMPTY = "Nothing on the Board yet";
const NOW = Date.parse("2026-11-07T22:00:00Z");

function org(id: string, name: string): OrgRef {
  return { id, handle: id, name, logo_url: null, banner_url: null, verified: true };
}

function preview(text: string, created_at: string, author_name = "Maya R."): Preview {
  return { id: `m-${created_at}`, text, author_name, created_at, kind: "text" };
}

function member(o: OrgRef, room: string, latest: Preview | null): InboxClub {
  return {
    org: o,
    viewer_role: "member",
    board: { room_id: room, latest, unread: true },
    lounge: { room_id: `${room}-lounge`, latest: preview("lounge chatter", "2026-11-07T21:59:00Z", "Dev O."), unread_count: 3 },
    next_event: null,
    last_activity_at: null,
    pinned_at: null,
    muted_until: null,
  };
}

function follower(o: OrgRef, room: string, latest: Preview | null): FollowedBoard {
  return { org: o, room_id: room, latest };
}

const salsa = org("o-salsa", "Salsa Club");
const film = org("o-film", "Film Society");
const climb = org("o-climb", "Climbing Club");
const chess = org("o-chess", "Chess Club");

test("merges member rows from the inbox and follower rows from club-boards", () => {
  const rows = mergeYourClubs(
    [member(salsa, "b-salsa", preview("Officer applications are open until Friday.", "2026-11-07T19:00:00Z"))],
    [follower(climb, "b-climb", preview("New members: sign the waiver.", "2026-11-07T21:40:00Z", ""))],
  );
  assert.deepEqual(rows, [
    { org: climb, room_id: "b-climb", role: "follower", latest: { text: "New members: sign the waiver.", created_at: "2026-11-07T21:40:00Z" } },
    { org: salsa, room_id: "b-salsa", role: "member", latest: { text: "Officer applications are open until Friday.", created_at: "2026-11-07T19:00:00Z" } },
  ]);
});

test("a club in both lists is listed once, as a member, with the member's Board", () => {
  const rows = mergeYourClubs(
    [member(salsa, "b-salsa", preview("member view", "2026-11-07T19:00:00Z"))],
    [follower(salsa, "b-salsa-follow", preview("follower view", "2026-11-07T21:00:00Z", ""))],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, "member");
  assert.equal(rows[0].room_id, "b-salsa");
  assert.equal(rows[0].latest?.text, "member view");
});

test("order: newest Board post first, nothing posted last, then by name", () => {
  const rows = mergeYourClubs(
    [
      member(chess, "b-chess", null),
      member(film, "b-film", preview("Vote for December's movie.", "2026-11-07T16:00:00Z")),
    ],
    [
      follower(climb, "b-climb", preview("waiver", "2026-11-07T21:40:00Z", "")),
      follower(salsa, "b-salsa", null),
      follower(org("o-art", "Art Collective"), "b-art", preview("same time as film", "2026-11-07T16:00:00Z", "")),
    ],
  );
  assert.deepEqual(
    rows.map((r) => r.org.name),
    ["Climbing Club", "Art Collective", "Film Society", "Chess Club", "Salsa Club"],
  );
});

test("an unreadable post time sorts with the clubs that have nothing posted", () => {
  const rows = mergeYourClubs(
    [member(film, "b-film", preview("broken time", "not a date")), member(salsa, "b-salsa", preview("ok", "2026-11-01T00:00:00Z"))],
    [follower(chess, "b-chess", null)],
  );
  assert.deepEqual(rows.map((r) => r.org.name), ["Salsa Club", "Chess Club", "Film Society"]);
});

test("no author name anywhere in the output (members and followers)", () => {
  const rows = mergeYourClubs(
    [member(salsa, "b-salsa", preview("hi", "2026-11-07T19:00:00Z", "Maya Rodriguez"))],
    [follower(climb, "b-climb", { ...preview("hey", "2026-11-07T20:00:00Z"), author_name: "Secret Officer" })],
  );
  const text = JSON.stringify(rows);
  assert.equal(text.includes("author"), false);
  assert.equal(text.includes("Maya"), false);
  assert.equal(text.includes("Secret Officer"), false);
  // Only the two fields the row needs, and nothing from the Lounge.
  for (const row of rows) assert.deepEqual(Object.keys(row.latest ?? {}).sort(), ["created_at", "text"]);
  assert.equal(text.includes("lounge"), false);
});

test("either read may be missing; both missing or empty is an empty list", () => {
  assert.deepEqual(mergeYourClubs(null, null), []);
  assert.deepEqual(mergeYourClubs([], []), []);
  assert.equal(mergeYourClubs(null, [follower(climb, "b-climb", null)]).length, 1);
  assert.equal(mergeYourClubs([member(salsa, "b-salsa", null)], null).length, 1);
});

test("the panel state: the empty state only when BOTH reads answered", () => {
  // Both failed: the panels hide.
  assert.deepEqual(yourClubsState(null, null), { status: "error", rows: [] });
  // The review's case: an SAE member who follows nothing else. The inbox
  // failed and club-boards (which leaves member clubs out) answered [].
  // "Join or follow a club" would be wrong, so the panels hide instead.
  assert.deepEqual(yourClubsState(null, []), { status: "error", rows: [] });
  // The mirror: no member clubs, the follow list unknown.
  assert.deepEqual(yourClubsState([], null), { status: "error", rows: [] });
  // One read failed but the other has clubs: those rows.
  const followedOnly = yourClubsState(null, [follower(climb, "b-climb", null)]);
  assert.equal(followedOnly.status, "ready");
  assert.deepEqual(followedOnly.rows.map((r) => r.org.name), ["Climbing Club"]);
  const memberOnly = yourClubsState([member(salsa, "b-salsa", null)], null);
  assert.equal(memberOnly.status, "ready");
  assert.deepEqual(memberOnly.rows.map((r) => r.role), ["member"]);
  // Both answered with no clubs: the true empty state.
  assert.deepEqual(yourClubsState([], []), { status: "ready", rows: [] });
});

test("half-built rows from a bad answer are skipped, a missing text reads as ''", () => {
  const bad = [
    { org: null, board: { room_id: "x", latest: null } },
    { org: salsa, board: null },
    member(film, "b-film", { ...preview("", "2026-11-07T19:00:00Z"), text: undefined as unknown as string }),
  ] as unknown as InboxClub[];
  const rows = mergeYourClubs(bad, [{ org: climb } as unknown as FollowedBoard]);
  assert.deepEqual(rows, [{ org: film, room_id: "b-film", role: "member", latest: { text: "", created_at: "2026-11-07T19:00:00Z" } }]);
});

test("caps: five rows in the panel, three tiles in the folded strip", () => {
  assert.equal(YOUR_CLUBS_MAX, 5);
  assert.equal(YOUR_CLUBS_FOLD_MAX, 3);
});

test("relativeAge steps: seconds, minutes, hours, days, weeks, then a campus date", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  assert.equal(relativeAge(ago(45_000), NOW), "45s");
  assert.equal(relativeAge(ago(0), NOW), "0s");
  assert.equal(relativeAge(ago(20 * 60_000), NOW), "20m");
  assert.equal(relativeAge(ago(59 * 60_000 + 59_000), NOW), "59m");
  assert.equal(relativeAge(ago(3 * 3_600_000), NOW), "3h");
  assert.equal(relativeAge(ago(2 * 86_400_000), NOW), "2d");
  assert.equal(relativeAge(ago(7 * 86_400_000), NOW), "1w");
  assert.equal(relativeAge(ago(34 * 86_400_000), NOW), "4w");
  // 5 weeks and up: the date, in campus time (Oct 3, 22:00 UTC is 6 PM on campus).
  assert.equal(relativeAge("2026-10-03T22:00:00Z", NOW), "Oct 3");
  // 03:30 UTC on Oct 3 is still Oct 2 on campus (EDT, UTC-4).
  assert.equal(relativeAge("2026-10-03T03:30:00Z", NOW), "Oct 2");
});

test("relativeAge: a post just past the minute tick reads 0s; far future or unreadable shows nothing", () => {
  // Posted 40 s after the panel's clock last ticked (or the device trails
  // the server a little): just posted, not blank.
  assert.equal(relativeAge(new Date(NOW + 5_000).toISOString(), NOW), "0s");
  assert.equal(relativeAge(new Date(NOW + 40_000).toISOString(), NOW), "0s");
  assert.equal(relativeAge(new Date(NOW + 120_000).toISOString(), NOW), "0s");
  // Beyond two minutes ahead it is a wrong date: nothing rather than a lie.
  assert.equal(relativeAge(new Date(NOW + 121_000).toISOString(), NOW), "");
  assert.equal(relativeAge(new Date(NOW + 3 * 86_400_000).toISOString(), NOW), "");
  assert.equal(relativeAge("nope", NOW), "");
  // Before the clock is known (now 0) nothing shows.
  assert.equal(relativeAge(new Date(NOW).toISOString(), 0), "");
});

test("spokenAge reads the same step aloud", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  assert.equal(spokenAge(ago(0), NOW), "just now");
  assert.equal(spokenAge(new Date(NOW + 40_000).toISOString(), NOW), "just now");
  assert.equal(spokenAge(ago(1_000), NOW), "1 second ago");
  assert.equal(spokenAge(ago(20 * 60_000), NOW), "20 minutes ago");
  assert.equal(spokenAge(ago(3_600_000), NOW), "1 hour ago");
  assert.equal(spokenAge(ago(3 * 3_600_000), NOW), "3 hours ago");
  assert.equal(spokenAge(ago(7 * 86_400_000), NOW), "1 week ago");
  assert.equal(spokenAge("2026-10-03T22:00:00Z", NOW), "on Oct 3");
  assert.equal(spokenAge("nope", NOW), "");
});

test("the row label: the board's words, no author, an empty Board said plainly", () => {
  const [salsaRow, photoRow, chessRow] = mergeYourClubs(
    [
      member(salsa, "b-salsa", preview("Officer applications are open until Friday.", new Date(NOW - 3 * 3_600_000).toISOString(), "Maya R.")),
      member(chess, "b-chess", null),
      member(film, "b-film", preview("   ", new Date(NOW - 6 * 3_600_000).toISOString())),
    ],
    null,
  );
  assert.equal(yourClubLabel(salsaRow, NOW, BOARD_EMPTY), "Salsa Club, on the Board 3 hours ago: Officer applications are open until Friday.");
  assert.equal(yourClubLabel(photoRow, NOW, BOARD_EMPTY), "Film Society, on the Board 6 hours ago");
  assert.equal(yourClubLabel(chessRow, NOW, BOARD_EMPTY), "Chess Club, nothing on the Board yet");
  // Before the clock is known (now 0) the age drops out instead of reading wrong.
  assert.equal(yourClubLabel(salsaRow, 0, BOARD_EMPTY), "Salsa Club, on the Board: Officer applications are open until Friday.");
});
