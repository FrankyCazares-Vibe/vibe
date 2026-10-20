/**
 * Tests for `edit.ts`, the post edit rules (plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §6 E0).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/edit.test.ts
 *
 * The module has NO imports, so it loads through a dynamic import of its
 * ".ts" path, the same pattern as `src/lib/orgs/join-state.test.ts`. Node's
 * type stripping adds no extensions, and tsc (without
 * `allowImportingTsExtensions`) refuses a literal ".ts" specifier, so the
 * specifier goes through a variable and the types come from `typeof import`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./edit.ts";
const {
  EDITED_LABEL,
  POST_MAX_CHARS,
  POST_TAG_IN_TEXT_RE,
  POST_TAG_LINK_RE,
  POST_TAG_MAX,
  addedHandles,
  blankPostLinks,
  checkPostEdit,
  editedPostFrom,
  extractPostTags,
  isNewPostTag,
} = (await import(specifier)) as typeof import("./edit");

// The pre-Oct 19, 2026 extractor, verbatim (it was `extractHashtags` in
// src/lib/composer/helpers.ts at f23bc5d). Kept only as the record of how
// older posts' tags were written, and to prove the new rule only ever DROPS
// tags the old one stored, never invents one.
function legacyExtract(text: string): string[] {
  const matches = text.match(/#[A-Za-z0-9_]{1,32}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const t = m.replace(/^#+/, "").toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

// --- isNewPostTag (the write rule, Oct 19, 2026) -------------------------------

test("isNewPostTag: 2-32 of a-z 0-9 _ with at least one letter", () => {
  assert.equal(POST_TAG_MAX, 5);
  for (const ok of ["ab", "a1", "1a", "_a", "ab_", "go_iu2026", "z".repeat(32)]) {
    assert.equal(isNewPostTag(ok), true, ok);
  }
  const bad: unknown[] = [
    "", "a", "1", "12", "2026", "_", "__", "_1", "z".repeat(33), "Ab", "café", "a b", "a-b", "#ab", null, 7, ["ab"],
  ];
  for (const value of bad) assert.equal(isNewPostTag(value), false, JSON.stringify(value));
});

// --- extractPostTags -------------------------------------------------------------

/**
 * The critique's probe (handoffs/2026-10-19-critique/hashtags/
 * extractor-probe.jsonl), every case with its new expected result, plus the
 * edges of the "never inside a word or a link" rule. The static twin in
 * public/html/profile.html (critique batch B6) should pass this same table.
 */
const PROBE: ReadonlyArray<[string, string[]]> = [
  ["#" + "a".repeat(40), []], // long40: never cut short
  ["#" + "a".repeat(32), ["a".repeat(32)]],
  ["coffee at #café today", []], // runs on into an accented letter
  ["café #café", []], // the same, typed with a combining accent
  ["#t1 #t2 #t3 #t4 #t5 #t6 #t7 #t8 #t9 #t10 #t11 #t12", ["t1", "t2", "t3", "t4", "t5"]],
  ["hello#world", []], // glued to a word
  ["é#tag", []],
  ["2#tag", []],
  ["#a party", []], // one letter
  ["##hype", []], // after another #
  ["#gameday! #IU-Football", ["gameday", "iu"]], // punctuation ends a tag
  ["#GameDay #gameday", ["gameday"]],
  ["#🔥 #fire🔥", ["fire"]], // an emoji ends a tag
  ["see https://x.com/page#section", []], // a link's #fragment
  ["x.com/#top and x.com/a#bc", []], // "#bc" is 2 letters, so only the link rule refuses it
  // A link's #fragment after punctuation (review of B3, Oct 19, 2026): the
  // one-character rule alone saved every one of these.
  ["https://en.wikipedia.org/wiki/Indiana_(state)#History", []],
  ["https://iuhoosiers.com/sports/football/schedule?view=#game5", []],
  ["https://site.com/faq-#pricing", []],
  ["https://site.com/docs.#intro", []],
  ["https://site.com/?#top", []],
  ["en.wikipedia.org/wiki/Indiana_(state)#History #iu", ["iu"]], // no "https://"
  ["tickets iuhoosiers.com/tix #gameday", ["gameday"]], // a tag after a link still counts
  ["#gameday,iuhoosiers.com/tix", ["gameday"]], // a link starting later in the word
  ["#tagx.com/a #tag_x.com/b", []], // a link glued to a tag: dropped, never cut to "tag"
  ["#tag://x", ["tag"]],
  // Emoji tails (review of B3): U+FE0F and the keycap mark U+20E3 count as
  // combining marks, so without the exception these tags were lost.
  ["❤️#love", ["love"]],
  ["⚽️#gameday", ["gameday"]],
  ["1️⃣#first", ["first"]],
  ["👍🏽#nice", ["nice"]],
  ["cafe\u0301#xy", []], // a real combining accent: still glued to a word
  ["#top1️⃣", []], // runs on into a keycap: dropped, never cut short
  ["#2026 #1", []], // no letter
  ["(#rush),#bid", ["rush", "bid"]],
  ["#tag#other", ["tag"]],
  ["#tag٣", []], // runs on into a non-ASCII digit
  ["🎉#party\n#party2\t#PARTY", ["party", "party2"]],
  ["#__ #_a #ab_", ["_a", "ab_"]],
  ["", []],
  ["plain text # alone", []],
];

test("extractPostTags: the critique probe and the word / link edges", () => {
  for (const [text, want] of PROBE) {
    assert.deepEqual(extractPostTags(text), want, `text: ${JSON.stringify(text)}`);
  }
});

test("extractPostTags: lowercases and dedupes across case", () => {
  assert.deepEqual(extractPostTags("Go #IU and #iu and #Hoosiers!"), ["iu", "hoosiers"]);
});

test("extractPostTags: stops at 5; duplicates and refused tags don't use a place", () => {
  const six = Array.from({ length: 6 }, (_, i) => `#tag${i}`).join(" ");
  assert.deepEqual(extractPostTags(six), ["tag0", "tag1", "tag2", "tag3", "tag4"]);
  const noisy = "#ab #AB #1 #a #café #2026 x.com/p#q " + Array.from({ length: 5 }, (_, i) => `#t${i}`).join(" ");
  assert.deepEqual(extractPostTags(noisy), ["ab", "t0", "t1", "t2", "t3"]);
});

test("extractPostTags: every output passes the write rule, at most POST_TAG_MAX", () => {
  for (const [text] of PROBE) {
    const tags = extractPostTags(text);
    assert.ok(tags.length <= POST_TAG_MAX);
    for (const t of tags) assert.ok(isNewPostTag(t), t);
  }
});

test("extractPostTags: only ever drops tags the old rule stored, never invents one", () => {
  // Fewer than 10 #s each, so the old cap of 10 never decides.
  const samples = PROBE.map(([t]) => t).filter((t) => (t.match(/#/g) ?? []).length < 10);
  samples.push("emoji 🎉 #party\n#party2\t#PARTY", "#One #two #ONE", "mid#word tag");
  for (const s of samples) {
    const old = legacyExtract(s);
    for (const t of extractPostTags(s)) assert.ok(old.includes(t), `${t} in ${JSON.stringify(s)}`);
  }
});

test("POST_TAG_IN_TEXT_RE: the shared global regexes are never left mid-string", () => {
  // Why 7 tags (review of B3, Oct 19, 2026): the one real risk is a rewrite
  // that loops `exec` on the shared object and breaks at the cap of 5, which
  // leaves lastIndex partway in, so the NEXT caption is read from the middle.
  // Two tags never reach the cap, so that old test could never fail.
  const seven = "x.com/a #one #two #three #four #five #six #seven";
  assert.deepEqual(extractPostTags(seven), ["one", "two", "three", "four", "five"]);
  assert.deepEqual(extractPostTags("#ab"), ["ab"]);
  for (const re of [POST_TAG_IN_TEXT_RE, POST_TAG_LINK_RE]) {
    assert.equal(re.lastIndex, 0);
    assert.equal(re.flags, "gu");
  }
});

test("blankPostLinks: links become spaces, same length, everything else untouched", () => {
  const text = "go #iu https://x.com/a(b)#c and en.wikipedia.org/w#h #bid";
  const out = blankPostLinks(text);
  assert.equal(out.length, text.length);
  assert.equal(out, "go #iu https" + " ".repeat(15) + " and " + " ".repeat(20) + " #bid");
  assert.equal(blankPostLinks("no links #here"), "no links #here");
});

// --- checkPostEdit -------------------------------------------------------------

test("checkPostEdit: a non-string is Invalid content", () => {
  for (const bad of [undefined, null, 42, true, ["hi"], { content: "hi" }]) {
    assert.deepEqual(checkPostEdit(bad, true), { ok: false, error: "Invalid content" });
  }
});

test("checkPostEdit: trims the text it returns", () => {
  assert.deepEqual(checkPostEdit("  hello \n", false), { ok: true, content: "hello" });
});

test("checkPostEdit: whitespace only on a text post is an empty post", () => {
  assert.deepEqual(checkPostEdit("   \n\t ", false), {
    ok: false,
    error: "Post needs text, an image, or a video",
  });
  assert.deepEqual(checkPostEdit("", false), {
    ok: false,
    error: "Post needs text, an image, or a video",
  });
});

test("checkPostEdit: whitespace only on a photo or video post clears the caption", () => {
  assert.deepEqual(checkPostEdit("   \n\t ", true), { ok: true, content: "" });
});

test("checkPostEdit: 2000 characters is allowed, 2001 is not", () => {
  assert.equal(POST_MAX_CHARS, 2000);
  assert.deepEqual(checkPostEdit("x".repeat(2000), false), { ok: true, content: "x".repeat(2000) });
  assert.deepEqual(checkPostEdit("x".repeat(2001), true), {
    ok: false,
    error: "Post exceeds 2000 characters",
  });
});

test("checkPostEdit: the length limit applies after trimming", () => {
  const padded = "  " + "y".repeat(2000) + "  ";
  assert.deepEqual(checkPostEdit(padded, false), { ok: true, content: "y".repeat(2000) });
});

// --- addedHandles --------------------------------------------------------------

test("addedHandles: only handles new to the text", () => {
  assert.deepEqual(addedHandles(["sam", "alex"], ["sam", "jordan"]), ["jordan"]);
});

test("addedHandles: re-adding an existing handle adds nothing", () => {
  assert.deepEqual(addedHandles(["sam"], ["sam"]), []);
  assert.deepEqual(addedHandles(["sam", "alex"], ["alex", "sam"]), []);
});

test("addedHandles: compares without case and returns lowercase", () => {
  assert.deepEqual(addedHandles(["Sam"], ["sAM", "Jordan"]), ["jordan"]);
});

test("addedHandles: a handle listed twice comes back once", () => {
  assert.deepEqual(addedHandles([], ["jordan", "Jordan"]), ["jordan"]);
});

test("addedHandles: removing handles adds nothing", () => {
  assert.deepEqual(addedHandles(["sam", "alex"], []), []);
});

// --- editedPostFrom ------------------------------------------------------------

test("editedPostFrom: a full row", () => {
  assert.deepEqual(
    editedPostFrom({
      id: "p1",
      content: "new text #iu",
      tags: ["iu"],
      edited_at: "2026-09-16T12:00:00Z",
      media_url: "https://example.test/x.jpg",
    }),
    { id: "p1", content: "new text #iu", tags: ["iu"], edited_at: "2026-09-16T12:00:00Z" },
  );
});

test("editedPostFrom: junk input is null", () => {
  for (const junk of [undefined, null, "", "p1", 0, 42, true, [], [{ id: "p1" }], {}, { id: 7 }, { id: "" }, { content: "hi" }]) {
    assert.equal(editedPostFrom(junk), null, `junk: ${JSON.stringify(junk)}`);
  }
});

test("editedPostFrom: missing or wrong-typed fields fall back", () => {
  assert.deepEqual(editedPostFrom({ id: "p1" }), { id: "p1", content: "", tags: [], edited_at: null });
  assert.deepEqual(
    editedPostFrom({ id: "p1", content: 5, tags: "iu", edited_at: 1726488000000 }),
    { id: "p1", content: "", tags: [], edited_at: null },
  );
});

test("editedPostFrom: tags keeps only strings", () => {
  assert.deepEqual(editedPostFrom({ id: "p1", tags: ["iu", 3, null, "rush", { t: 1 }] })?.tags, ["iu", "rush"]);
});

test("editedPostFrom: a never-edited post has edited_at null", () => {
  assert.equal(editedPostFrom({ id: "p1", content: "x", tags: [], edited_at: null })?.edited_at, null);
});

// --- constants -------------------------------------------------------------------

test("EDITED_LABEL is the marker copy", () => {
  assert.equal(EDITED_LABEL, "Edited");
});
