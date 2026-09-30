/**
 * Tests for `stub.ts` (handoffs/chat-redesign/wave-2-contracts.md 8.1, 8.2).
 *
 * Run with:
 *   node --test src/lib/chat/stub.test.ts
 *
 * WHY THE RESOLVE HOOK: `stub.ts` imports one runtime value from
 * "./room-rules" with no extension, which Node's type stripping does not
 * resolve (the `orgs/following.test.ts` pattern).
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
if (typeof registerHooks !== "function") throw new Error("stub.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./stub.ts";
const { asStub, isHiddenFrom } = (await import(specifier)) as typeof import("./stub");

type ClubRole = import("./types").ClubRole;
type Room = import("./types").Room;
type RoomKind = import("./types").RoomKind;

const ROLES: (ClubRole | null)[] = ["owner", "admin", "mod", "member", null];
const KINDS: RoomKind[] = ["board", "lounge", "officers", "event", "room"];

function room(kind: RoomKind): Room {
  const event =
    kind === "event"
      ? { id: "e1", title: "Fall Formal", starts_at: "2026-10-08T23:30:00Z", ends_at: "2026-10-09T03:00:00Z" }
      : null;
  return { id: "r1", kind, name: kind, org_id: "o1", event };
}

const blocked = new Set(["blake", "casey"]);

test("a dm or a group never stubs: room null is false whatever else is true", () => {
  for (const role of ROLES) {
    for (const root of [null, "m1", undefined]) {
      assert.equal(isHiddenFrom({ user_id: "blake", thread_root_id: root }, blocked, null, role), false);
    }
  }
});

test("nobody outside the block set is hidden, in any room, at any role", () => {
  for (const kind of KINDS) {
    for (const role of ROLES) {
      assert.equal(isHiddenFrom({ user_id: "avery", thread_root_id: null }, blocked, room(kind), role), false);
      assert.equal(isHiddenFrom({ user_id: "avery", thread_root_id: "m1" }, blocked, room(kind), role), false);
    }
  }
  assert.equal(isHiddenFrom({ user_id: "blake" }, new Set(), room("lounge"), "member"), false, "an empty set");
});

test("a blocked person is hidden in every room but for an officer's top-level Board post", () => {
  for (const kind of KINDS) {
    for (const role of ROLES) {
      const officerPost = kind === "board" && (role === "owner" || role === "admin");
      assert.equal(
        isHiddenFrom({ user_id: "blake", thread_root_id: null }, blocked, room(kind), role),
        !officerPost,
        `${kind} top-level by ${role}`,
      );
      assert.equal(isHiddenFrom({ user_id: "blake", thread_root_id: "m1" }, blocked, room(kind), role), true, `${kind} reply by ${role}`);
    }
  }
});

test("the exception is for a current owner or admin only: a mod, a member, or no role at all stubs", () => {
  assert.equal(isHiddenFrom({ user_id: "casey", thread_root_id: null }, blocked, room("board"), "mod"), true);
  assert.equal(isHiddenFrom({ user_id: "casey", thread_root_id: null }, blocked, room("board"), "member"), true);
  assert.equal(isHiddenFrom({ user_id: "casey", thread_root_id: null }, blocked, room("board"), null), true, "left the club");
  assert.equal(isHiddenFrom({ user_id: "casey" }, blocked, room("board"), "admin"), false, "thread_root_id absent = top-level");
});

test("the stub is the exact shape of 8.1, every field at its pinned value", () => {
  const stub = asStub({ id: "m9", created_at: "2026-10-08T23:30:00.123456+00:00", thread_root_id: "m1" });
  assert.deepEqual(stub, {
    id: "m9",
    created_at: "2026-10-08T23:30:00.123456+00:00",
    thread_root_id: "m1",
    kind: "text",
    hidden: true,
    content: "",
    user_id: "",
    users: null,
    card: null,
    reactions: [],
    attachment: null,
    attachment_id: null,
    attachment_kind: null,
    media_url: null,
    media_kind: null,
    parent_message_id: null,
    parent_preview: null,
    reply_count: null,
    author_role: null,
    removed: null,
  });
  assert.deepEqual(Object.keys(stub).sort(), [
    "attachment",
    "attachment_id",
    "attachment_kind",
    "author_role",
    "card",
    "content",
    "created_at",
    "hidden",
    "id",
    "kind",
    "media_kind",
    "media_url",
    "parent_message_id",
    "parent_preview",
    "reactions",
    "removed",
    "reply_count",
    "thread_root_id",
    "user_id",
    "users",
  ]);
});

test("a stub keeps nothing of the row but the three fields; a missing thread_root_id is null", () => {
  const row = {
    id: "m2",
    created_at: "2026-10-08T23:30:00+00:00",
    content: "secret",
    user_id: "blake",
    kind: "poll",
    card_event_id: "e1",
    users: { id: "blake", handle: "blake", name: "Blake", avatar_url: null },
  };
  const stub = asStub(row);
  assert.equal(stub.thread_root_id, null);
  assert.equal(stub.content, "");
  assert.equal(stub.user_id, "");
  assert.equal(stub.users, null);
  assert.equal(stub.kind, "text", "never the card's kind");
  assert.equal(JSON.stringify(stub).includes("secret"), false);
  assert.equal(JSON.stringify(stub).includes("blake"), false);
  assert.notEqual(asStub(row).reactions, stub.reactions, "a fresh array each time");
});
