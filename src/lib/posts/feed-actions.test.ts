/**
 * Tests for `feed-actions.ts`, the rows of the phone feed card's ⋯ sheet
 * (Delete on the card since Oct 14 2026).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/feed-actions.test.ts
 *
 * The module imports only join-copy.ts (type imports alone), so it loads
 * through a dynamic import of its ".ts" path with a resolve hook for "@/".
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("feed-actions.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const specifier = "./feed-actions.ts";
const {
  clubMutedLine,
  clubMuteUrl,
  clubUnmutedLine,
  deletesAsOfficer,
  feedClubOf,
  muteClubRowLabel,
  muteFailureLine,
  postSheetRows,
  unmuteFailureLine,
  withoutClubPosts,
} = (await import(specifier)) as typeof import("./feed-actions");

const base = { isOwner: false, viewerCanDelete: false, removed: false, canBlock: true };

test("your own post: Edit post, then Delete post", () => {
  assert.deepEqual(postSheetRows({ ...base, isOwner: true, viewerCanDelete: true }), [
    "send",
    "copy",
    "edit",
    "delete",
  ]);
});

test("your own post without the server's yes keeps Edit and drops Delete (fail closed)", () => {
  assert.deepEqual(postSheetRows({ ...base, isOwner: true }), ["send", "copy", "edit"]);
});

test("your own removed post: no Edit, no Delete", () => {
  assert.deepEqual(
    postSheetRows({ ...base, isOwner: true, viewerCanDelete: true, removed: true }),
    ["send", "copy"],
  );
});

test("someone else's post: Report and Block, never Edit or Delete", () => {
  assert.deepEqual(postSheetRows(base), ["send", "copy", "report", "block"]);
});

test("no author id: no Block author", () => {
  assert.deepEqual(postSheetRows({ ...base, canBlock: false }), ["send", "copy", "report"]);
});

test("a club officer on someone else's club post: Delete between Report and Block", () => {
  assert.deepEqual(postSheetRows({ ...base, viewerCanDelete: true }), [
    "send",
    "copy",
    "report",
    "delete",
    "block",
  ]);
});

test("nobody gets Delete on a removed post, officer included", () => {
  assert.equal(
    postSheetRows({ ...base, viewerCanDelete: true, removed: true }).includes("delete"),
    false,
  );
});

test("Send to chats and Copy link always lead", () => {
  for (const isOwner of [true, false]) {
    for (const viewerCanDelete of [true, false]) {
      for (const removed of [true, false]) {
        const rows = postSheetRows({ isOwner, viewerCanDelete, removed, canBlock: true });
        assert.deepEqual(rows.slice(0, 2), ["send", "copy"]);
      }
    }
  }
});

test("only an officer on someone else's post deletes as an officer", () => {
  assert.equal(deletesAsOfficer({ isOwner: false, viewerCanDelete: true }), true);
  assert.equal(deletesAsOfficer({ isOwner: true, viewerCanDelete: true }), false);
  assert.equal(deletesAsOfficer({ isOwner: false, viewerCanDelete: false }), false);
  assert.equal(deletesAsOfficer({ isOwner: true, viewerCanDelete: false }), false);
});

// ── Mute a club's posts (club model, Oct 16) ────────────────────────────────

test("someone else's club post: Mute after Copy link, before the danger rows", () => {
  assert.deepEqual(postSheetRows({ ...base, clubPost: true }), [
    "send",
    "copy",
    "mute",
    "report",
    "block",
  ]);
  assert.deepEqual(postSheetRows({ ...base, clubPost: true, viewerCanDelete: true }), [
    "send",
    "copy",
    "mute",
    "report",
    "delete",
    "block",
  ]);
});

test("a personal post never offers Mute, and neither does a missing club fact", () => {
  assert.equal(postSheetRows(base).includes("mute"), false);
  assert.equal(postSheetRows({ ...base, clubPost: false }).includes("mute"), false);
});

test("your own club post offers no Mute (a mute never hides what you wrote)", () => {
  const rows = postSheetRows({ ...base, isOwner: true, viewerCanDelete: true, clubPost: true });
  assert.deepEqual(rows, ["send", "copy", "edit", "delete"]);
});

test("feedClubOf: a card with a handle is a club; the name falls back to the @handle", () => {
  assert.deepEqual(feedClubOf({ handle: "sae", name: "SAE" }), { handle: "sae", name: "SAE" });
  assert.deepEqual(feedClubOf({ handle: " sae ", name: "  " }), { handle: "sae", name: "@sae" });
  assert.deepEqual(feedClubOf({ handle: "sae", name: null }), { handle: "sae", name: "@sae" });
  assert.equal(feedClubOf(null), null);
  assert.equal(feedClubOf(undefined), null);
  assert.equal(feedClubOf({ handle: "", name: "SAE" }), null);
  assert.equal(feedClubOf({ name: "SAE" }), null);
});

test("the mute address is the club route, its handle encoded", () => {
  assert.equal(clubMuteUrl("sae"), "/api/orgs/sae/mute");
  assert.equal(clubMuteUrl("a b"), "/api/orgs/a%20b/mute");
});

test("the words: the row, the toast, Undo's answer and both failures name the club", () => {
  const club = { handle: "sae", name: "SAE" };
  assert.equal(muteClubRowLabel(club), "Mute SAE's posts");
  assert.equal(clubMutedLine(club), "You won't see SAE's posts in your feed. The club isn't told.");
  assert.equal(clubUnmutedLine(club), "SAE's posts are back in your feed.");
  assert.equal(muteFailureLine(club), "Couldn't mute SAE's posts.");
  assert.equal(unmuteFailureLine(club), "Couldn't unmute SAE's posts.");
  // Never a promise about chats: the feed can't tell a member from a follower.
  assert.equal(/chat/i.test(clubMutedLine(club)), false);
});

test("withoutClubPosts: the muted club's cards leave at once, the viewer's own stay, nothing else moves", () => {
  const ME = "AAAAAAAA-0000-4000-8000-000000000001";
  const posts = [
    { id: "1", user_id: "b", org: { handle: "SAE", name: "SAE" } },
    { id: "2", user_id: "c", org: null },
    { id: "3", user_id: ME.toLowerCase(), org: { handle: "sae", name: "SAE" } },
    { id: "4", user_id: "d", org: { handle: "chess", name: "Chess" } },
  ];
  assert.deepEqual(withoutClubPosts(posts, { handle: "sae", name: "SAE" }, ME).map((p) => p.id), ["2", "3", "4"]);
  assert.deepEqual(withoutClubPosts(posts, { handle: "sae", name: "SAE" }, null).map((p) => p.id), ["2", "4"]);
  assert.equal(withoutClubPosts(posts, { handle: "finance", name: "Finance" }, ME), posts, "the same list when nothing goes");
});
