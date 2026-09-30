/**
 * Tests for the card routes' SQLSTATE → code table
 * (handoffs/chat-redesign/wave-2-contracts.md 3.2, 4.1.12, 4.3.11; the 3.10
 * rows for a missing function), `cards/_lib/rpc-refusal.ts` under the
 * routes. The test lives here because `npm test` globs `src/**` and a path
 * with `[id]` in it never matches (the brackets read as a character class).
 *
 * Run with:
 *   node --test src/lib/chat/cards/rpc-refusal.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("rpc-refusal.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
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

const specifier = "../../../app/api/me/threads/[id]/cards/_lib/rpc-refusal.ts";
const { POST_REFUSAL_STATUS, rpcRefusal } = (await import(specifier)) as typeof import("../../../app/api/me/threads/[id]/cards/_lib/rpc-refusal");
type Room = import("../types").Room;
type ClubRole = import("../types").ClubRole;

const ORG = "dddddddd-0000-4000-8000-000000000001";
const BOARD: Room = { id: "cccccccc-0000-4000-8000-000000000001", kind: "board", name: "Board", org_id: ORG, event: null };
const EVENT_ROOM: Room = { ...BOARD, kind: "event", name: "Fall Formal", event: { id: "e", title: "Fall Formal", starts_at: "2026-10-08T23:30:00+00:00", ends_at: "2026-10-09T03:00:00+00:00" } };

function opts(room: Room | null, role: ClubRole | null, field = "closes_at") {
  let asked = 0;
  return {
    opts: { room, roleOf: async () => { asked += 1; return role; }, invalidField: field, log: "cards.test" },
    asked: () => asked,
  };
}

test("the four statuses of the send refusals match messages/route.ts", () => {
  assert.deepEqual(POST_REFUSAL_STATUS, { board_officers_only: 403, board_post_missing: 409, thread_root_not_allowed: 400, room_closed: 403 });
});

test("P0C21: postRefusal(room, null, role) with its status; the role is read for it alone", async () => {
  const member = opts(BOARD, "member");
  assert.deepEqual(await rpcRefusal({ code: "P0C21", message: "chat-cards: not allowed to post here" }, member.opts), {
    status: 403, body: { ok: false, error: "Only officers post here.", code: "board_officers_only" },
  });
  assert.equal(member.asked(), 1);
  const officer = opts(BOARD, "owner");
  assert.deepEqual(await rpcRefusal({ code: "P0C21" }, officer.opts), { status: 403, body: { ok: false, error: "This chat is closed.", code: "room_closed" } });
  const closed = opts(EVENT_ROOM, "member");
  assert.deepEqual(await rpcRefusal({ code: "P0C21" }, closed.opts), { status: 403, body: { ok: false, error: "This chat is closed.", code: "room_closed" } });
  const noRoom = opts(null, null);
  assert.deepEqual(await rpcRefusal({ code: "P0C21" }, noRoom.opts), { status: 403, body: { ok: false, error: "This chat is closed.", code: "room_closed" } });
});

test("P0C22: 400 invalid_card with the field the route names", async () => {
  const create = opts(BOARD, "owner", "closes_at");
  assert.deepEqual(await rpcRefusal({ code: "P0C22" }, create.opts), { status: 400, body: { ok: false, error: "Check the card and try again.", code: "invalid_card", field: "closes_at" } });
  const vote = opts(BOARD, "owner", "option_id");
  assert.deepEqual(await rpcRefusal({ code: "P0C22" }, vote.opts), { status: 400, body: { ok: false, error: "Check the card and try again.", code: "invalid_card", field: "option_id" } });
  assert.equal(create.asked(), 0, "no role read");
});

test("P0C23 → 404 event_not_found, P0C24 → 404 not_found, P0C25 → 409 poll_closed, P0C26 → 409 slot_full", async () => {
  const o = opts(BOARD, "member");
  const table: [string, number, string, string][] = [
    ["P0C23", 404, "event_not_found", "That event isn't available."],
    ["P0C24", 404, "not_found", "That's not there anymore."],
    ["P0C25", 409, "poll_closed", "This one is closed."],
    ["P0C26", 409, "slot_full", "That spot just filled."],
  ];
  for (const [sqlstate, status, code, error] of table) {
    assert.deepEqual(await rpcRefusal({ code: sqlstate }, o.opts), { status, body: { ok: false, error, code } }, sqlstate);
    assert.deepEqual(await rpcRefusal({ code: ` ${sqlstate.toLowerCase()} ` }, o.opts), { status, body: { ok: false, error, code } }, `${sqlstate} lowercase`);
  }
  assert.equal(o.asked(), 0);
});

for (const code of ["PGRST202", "42883"]) {
  test(`a missing function (${code}) → 404 not_found (3.10, the card routes' row)`, async () => {
    assert.deepEqual(await rpcRefusal({ code, message: "Could not find the function" }, opts(BOARD, "owner").opts), {
      status: 404, body: { ok: false, error: "That's not there anymore.", code: "not_found" },
    });
  });
}

test("anything else → 503 try_again (42501, 22023, P0C29, a network error without a code, null)", async () => {
  const o = opts(BOARD, "owner");
  for (const error of [{ code: "42501", message: "not allowed" }, { code: "22023" }, { code: "P0C29" }, { message: "fetch failed" }, null, undefined, { code: 42 }]) {
    assert.deepEqual(await rpcRefusal(error as { code?: unknown } | null | undefined, o.opts), { status: 503, body: { ok: false, error: "Try again in a moment.", code: "try_again" } }, JSON.stringify(error));
  }
  assert.equal(o.asked(), 0);
});
