/**
 * The phone profile card's caption parts and spoken names (critique B6
 * review, Oct 19, 2026): profile-caption.ts and savedTileLabel.
 *
 * Run with:
 *   node --test src/lib/profile/profile-caption.test.ts
 *
 * WHY THE RESOLVE HOOK: profile-caption.ts imports "../feed/caption-segments"
 * with no extension (what Next and tsc expect), and Node's type stripping
 * adds none. Same hook as tags.test.ts.
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
if (typeof registerHooks !== "function") throw new Error("profile-caption.test.ts needs Node >= 22.15 (module.registerHooks)");
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const captionSpecifier = "./profile-caption.ts";
const { profileCaptionParts, postOpenLabel, spokenCaption, tagFeedHref, SPOKEN_CAPTION_MAX } = (await import(
  captionSpecifier
)) as typeof import("./profile-caption");
const tileSpecifier = "./saved-tile.ts";
const { savedTileLabel } = (await import(tileSpecifier)) as typeof import("./saved-tile");

const kinds = (text: string, tags: string[]) => profileCaptionParts(text, tags).map((p) => [p.kind, p.text]);

test("caption parts: '#tag@name' is one tag and plain text, never a mention glued to it", () => {
  assert.deepEqual(kinds("#tag@name", ["tag"]), [
    ["tag", "#tag"],
    ["text", "@name"],
  ]);
});

test("caption parts: '@a #tag' (a short @word is text, as on the feed) and '@ava #tag'", () => {
  // 3 to 32 after the @, the feed's own rule (captionSegments). The card's
  // old rule coloured "@a" too.
  assert.deepEqual(kinds("@a #tag", ["tag"]), [
    ["text", "@a "],
    ["tag", "#tag"],
  ]);
  assert.deepEqual(kinds("@ava #tag", ["tag"]), [
    ["mention", "@ava"],
    ["text", " "],
    ["tag", "#tag"],
  ]);
});

test("caption parts: '#Tag #tag' are both links to the same lower-case filter", () => {
  const parts = profileCaptionParts("#Tag #tag", ["tag"]);
  assert.deepEqual(
    parts.filter((p) => p.kind === "tag").map((p) => [p.text, p.href]),
    [
      ["#Tag", "/campus?tab=feed&tag=tag"],
      ["#tag", "/campus?tab=feed&tag=tag"],
    ],
  );
});

test("caption parts: a link's #fragment and an unsaved #word stay plain", () => {
  assert.deepEqual(kinds("tix at x.com/page#gameday #gameday #extra", ["gameday"]), [
    ["text", "tix at x.com/page#gameday "],
    ["tag", "#gameday"],
    ["text", " #extra"],
  ]);
});

test("caption parts: keys are unique, the parts join back, only tags carry a link", () => {
  const samples: Array<[string, string[]]> = [
    ["#a1 #a1 #a1 @maya @maya", ["a1"]],
    ["@ava@bob #x_y#x_y", ["x_y"]],
    ["🎉#party\n#party @ivy", ["party"]],
    ["plain words", []],
  ];
  for (const [text, tags] of samples) {
    const parts = profileCaptionParts(text, tags);
    const keys = parts.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, `duplicate key in ${JSON.stringify(text)}: ${keys}`);
    assert.equal(parts.map((p) => p.text).join(""), text);
    for (const p of parts) assert.equal(p.href !== null, p.kind === "tag", JSON.stringify(p));
  }
  assert.deepEqual(profileCaptionParts("", ["x"]), []);
  assert.deepEqual(profileCaptionParts(null, ["x"]), []);
  assert.equal(tagFeedHref("a b"), "/campus?tab=feed&tag=a%20b");
});

test("open button: says the caption first, then when; no caption says what the post is", () => {
  assert.equal(postOpenLabel({ content: "Game night\nat 8 #iu" }, "2d ago"), "Open post: Game night at 8 #iu, 2d ago");
  assert.equal(postOpenLabel({ content: "  ", media_kind: "image" }, "Oct 11"), "Open photo post, Oct 11");
  assert.equal(postOpenLabel({ content: null, media_kind: "video" }, "3h ago"), "Open video post, 3h ago");
  assert.equal(postOpenLabel({ content: "" }, ""), "Open post");
  // Two posts made the same day no longer sound the same.
  assert.notEqual(postOpenLabel({ content: "First" }, "2d ago"), postOpenLabel({ content: "Second" }, "2d ago"));
});

test("open button: a long caption is cut at a word, with an ellipsis", () => {
  const long = "word ".repeat(40).trim();
  const said = spokenCaption(long);
  assert.ok(said.length <= SPOKEN_CAPTION_MAX + 1, said);
  assert.ok(said.endsWith("word…"), said);
  // One long run with no space is cut at the limit.
  assert.equal(spokenCaption("x".repeat(100)), `${"x".repeat(SPOKEN_CAPTION_MAX)}…`);
  assert.equal(spokenCaption("short"), "short");
});

test("saved tile name: 'Saved photo. <caption>' / 'Saved video.', the desktop's words", () => {
  assert.equal(savedTileLabel({ content: " Sunset on the canal " }, false), "Saved photo. Sunset on the canal");
  assert.equal(savedTileLabel({ content: "" }, true), "Saved video.");
  assert.equal(savedTileLabel({ content: null }, false), "Saved photo.");
  assert.equal(savedTileLabel({ content: "y".repeat(300) }, false).length, "Saved photo. ".length + 120);
});
