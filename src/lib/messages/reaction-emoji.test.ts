/**
 * Tests for `reaction-emoji.ts`, the chat reaction allow-list (security wave
 * S67, report risk #1).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/messages/reaction-emoji.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path (the pattern of `src/lib/auth/password-rules.test.ts`). tsc
 * refuses a literal ".ts" specifier, so it goes through a variable and the
 * types come from `typeof import`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./reaction-emoji.ts";
const { ALLOWED_EMOJIS, groupMessageReactions, isAllowedReactionEmoji } =
  (await import(specifier)) as typeof import("./reaction-emoji");

const MIGRATION = new URL(
  "../../../supabase/migrations/20260927110000_message_reactions_emoji_allowlist.sql",
  import.meta.url,
);

const hex = (s: string) =>
  Array.from(s)
    .map((c) => c.codePointAt(0)!.toString(16).toUpperCase())
    .join(" ");

test("the list is the seven emoji the route always allowed, byte for byte", () => {
  assert.deepEqual(
    ALLOWED_EMOJIS.map(hex),
    ["2764 FE0F", "1F44D", "1F44E", "1F602", "1F525", "1F62E", "1F622"],
  );
  assert.deepEqual([...ALLOWED_EMOJIS], ["❤️", "👍", "👎", "😂", "🔥", "😮", "😢"]);
});

test("the hover pickers' five emoji are all allowed", () => {
  // messages.html actionsFor and _miniMessenger.js paintMessages.
  for (const e of ["❤️", "👍", "👎", "😂", "🔥"]) {
    assert.equal(isAllowedReactionEmoji(e), true, e);
  }
});

test("anything else is refused", () => {
  const refused: unknown[] = [
    "<img src=x onerror=alert(1)>",
    "<b>x</b>",
    "'-alert(1)-'",
    "❤", // the heart without U+FE0F
    " 👍",
    "👍 ",
    "👍👍",
    "😀",
    "",
    null,
    undefined,
    128077,
    ["👍"],
    { emoji: "👍" },
  ];
  for (const v of refused) {
    assert.equal(isAllowedReactionEmoji(v), false, JSON.stringify(v));
  }
});

test("grouping counts per message and marks the viewer's own", () => {
  const groups = groupMessageReactions(
    [
      { message_id: "m1", emoji: "👍", user_id: "a" },
      { message_id: "m1", emoji: "👍", user_id: "viewer" },
      { message_id: "m1", emoji: "🔥", user_id: "b" },
      { message_id: "m2", emoji: "😂", user_id: "a" },
    ],
    "viewer",
  );
  assert.deepEqual(groups.get("m1"), [
    { emoji: "👍", count: 2, viewer_reacted: true },
    { emoji: "🔥", count: 1, viewer_reacted: false },
  ]);
  assert.deepEqual(groups.get("m2"), [{ emoji: "😂", count: 1, viewer_reacted: false }]);
  assert.equal(groups.has("m3"), false);
});

test("grouping drops unlisted emoji before counting", () => {
  const groups = groupMessageReactions(
    [
      { message_id: "m1", emoji: "<img src=x onerror=alert(1)>", user_id: "a" },
      { message_id: "m1", emoji: "❤️", user_id: "a" },
      { message_id: "m2", emoji: "<b>x</b>", user_id: "viewer" },
      { message_id: "m2", emoji: "❤", user_id: "b" },
    ],
    "viewer",
  );
  assert.deepEqual(groups.get("m1"), [{ emoji: "❤️", count: 1, viewer_reacted: false }]);
  // A message whose only reactions were bad has no group at all.
  assert.equal(groups.has("m2"), false);
});

test("grouping ties sort by the emoji string, most-used first", () => {
  const groups = groupMessageReactions(
    [
      { message_id: "m", emoji: "😢", user_id: "a" },
      { message_id: "m", emoji: "👍", user_id: "a" },
      { message_id: "m", emoji: "🔥", user_id: "a" },
      { message_id: "m", emoji: "🔥", user_id: "b" },
    ],
    "nobody",
  );
  assert.deepEqual(
    groups.get("m")!.map((g) => g.emoji),
    ["🔥", "👍", "😢"],
  );
});

test("an empty or odd input groups to nothing", () => {
  assert.equal(groupMessageReactions([], "v").size, 0);
  const odd = [null, { message_id: 7, emoji: "👍", user_id: "a" }] as unknown as Parameters<
    typeof groupMessageReactions
  >[0];
  assert.equal(groupMessageReactions(odd, "v").size, 0);
});

test("the database CHECK allows exactly this list", () => {
  // Every U& array in the migration (pre-flight, the CHECK, the post-check
  // probe) must decode to ALLOWED_EMOJIS, in order.
  const sql = readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");
  const arrays = [...sql.matchAll(/array\[((?:\s*U&'[^']*',?)+)\s*\]/gi)];
  assert.equal(arrays.length, 3, "pre-flight, CHECK and post-check lists");
  for (const [, body] of arrays) {
    const decoded = [...body.matchAll(/U&'([^']*)'/g)].map(([, lit]) =>
      lit.replace(/\\\+([0-9A-Fa-f]{6})|\\([0-9A-Fa-f]{4})/g, (_m, six, four) =>
        String.fromCodePoint(parseInt(six ?? four, 16)),
      ),
    );
    assert.deepEqual(decoded, [...ALLOWED_EMOJIS]);
  }
});
