/**
 * The caption cutter (Oct 19, 2026, critique decisions 3-5): a #tag lights up
 * only where the tag rule finds one AND the post saved it; mentions keep
 * their old rule; the segments always join back to the caption.
 *
 * Run with:
 *   node --test src/lib/feed/caption-segments.test.ts
 *
 * WHY THE RESOLVE HOOK: caption-segments.ts imports
 * "../posts/caption-tag-ranges" (which imports "./edit") without an extension
 * (what Next and tsc expect), and Node's type stripping adds none. Same hook
 * as tags.test.ts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("caption-segments.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./caption-segments";
const { captionSegments } = (await import(specifier)) as typeof import("./caption-segments");
const rangesSpecifier = "../posts/caption-tag-ranges";
const { captionTagRanges } = (await import(rangesSpecifier)) as typeof import("../posts/caption-tag-ranges");

const tagsOf = (text: string, saved: string[]) =>
  captionSegments(text, saved).flatMap((s) => (s.kind === "tag" ? [s.tag] : []));
const joined = (text: string, saved: string[]) => captionSegments(text, saved).map((s) => s.text).join("");

test("a saved tag lights up inside the caption, with its own casing kept", () => {
  const segs = captionSegments("Game night #GameDay at 8", ["gameday"]);
  assert.deepEqual(segs, [
    { kind: "text", text: "Game night " },
    { kind: "tag", text: "#GameDay", tag: "gameday" },
    { kind: "text", text: " at 8" },
  ]);
});

test("a #word the post didn't save stays plain (the 6th tag, an unsaved one)", () => {
  const text = "#one #two #three #four #five #six";
  assert.deepEqual(tagsOf(text, ["one", "two", "three", "four", "five"]), ["one", "two", "three", "four", "five"]);
  assert.deepEqual(tagsOf("#party tonight", []), []);
  assert.deepEqual(tagsOf("#party tonight", ["other"]), []);
});

test("the tag rule decides where a tag is: links, glued words, accents and long runs never light up", () => {
  // Even when an old post saved the cut-short or link tag under the old rule.
  assert.deepEqual(tagsOf("see x.com/page#section", ["section"]), []);
  assert.deepEqual(tagsOf("hello#world", ["world"]), []);
  assert.deepEqual(tagsOf("#café time", ["caf"]), []);
  assert.deepEqual(tagsOf(`#${"a".repeat(40)}`, ["a".repeat(32)]), []);
  assert.deepEqual(tagsOf("❤️#love", ["love"]), ["love"]);
  assert.deepEqual(tagsOf("#gameday!", ["gameday"]), ["gameday"]);
});

test("saved tags match in any case (the same rule as captionTagRanges)", () => {
  assert.deepEqual(tagsOf("#Hype", ["HYPE"]), ["hype"]);
});

test("the tags are captionTagRanges', the source the profile and the static twins copy (review r3)", () => {
  // edit.test.ts's PROBE table, read from that file as static-profile-tags.test.ts
  // does, so a new probe case checks the feed's reading too.
  const src = readFileSync(new URL("../posts/edit.test.ts", import.meta.url), "utf8");
  const head = "const PROBE: ReadonlyArray<[string, string[]]> = [";
  const a = src.indexOf(head);
  assert.ok(a >= 0, "edit.test.ts no longer has its PROBE table");
  const probe = new Function(`return [${src.slice(a + head.length, src.indexOf("\n];", a))}\n];`)() as [string, string[]][];
  assert.ok(probe.length >= 30, `PROBE read ${probe.length} cases`);
  const samples: [string, string[]][] = [
    ...probe,
    ["see x.com/a#bc then #bc", ["bc"]],
    ["#GameDay and #gameday, @maya #gameday", ["gameday"]],
    ["🎉#party ❤️#love 1️⃣#first", ["party", "love", "first"]],
  ];
  for (const [text, want] of samples) {
    // Save the caption's own tags plus one it doesn't show, as the server would.
    const saved = [...want, "notshown"];
    const ranges = captionTagRanges(text, saved);
    const segTags: { start: number; end: number; tag: string }[] = [];
    let at = 0;
    for (const s of captionSegments(text, saved)) {
      if (s.kind === "tag") segTags.push({ start: at, end: at + s.text.length, tag: s.tag });
      at += s.text.length;
    }
    // A mention never overlaps a tag (a tag can't sit glued to "@name"), so
    // every range comes through as one tag segment, in the same place.
    assert.deepEqual(segTags, ranges, text);
  }
});

test("mentions keep their old rule: 3 to 32 characters, not glued to a word", () => {
  const segs = captionSegments("hi @Maya_O and @ab, mail me@x.com", []);
  assert.deepEqual(
    segs.filter((s) => s.kind === "mention"),
    [{ kind: "mention", text: "@Maya_O", handle: "maya_o" }],
  );
});

test("mentions and tags side by side", () => {
  const segs = captionSegments("@maya #gameday", ["gameday"]);
  assert.deepEqual(segs.map((s) => s.kind), ["mention", "text", "tag"]);
});

test("the segments always join back to the caption", () => {
  for (const [text, saved] of [
    ["", []],
    ["plain words", []],
    ["#a #ab @abc https://x.com/#ab trailing", ["ab"]],
    ["emoji 👍🏽#nice and\nnew line #nice", ["nice"]],
  ] as [string, string[]][]) {
    assert.equal(joined(text, saved), text);
  }
  assert.deepEqual(captionSegments(null, ["x"]), []);
});
