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
  addedHandles,
  checkPostEdit,
  editedPostFrom,
  extractPostTags,
} = (await import(specifier)) as typeof import("./edit");

// The composer's copy, verbatim from `src/lib/composer/helpers.ts:81-94` at
// f23bc5d. That file can't load here (it touches `document` and `window`), so
// the parity test compares against this copy. If E1 has already rewritten
// `extractHashtags` to call `extractPostTags`, this copy is the record of the
// algorithm tags were published with.
function composerExtractHashtags(text: string): string[] {
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

// --- extractPostTags ---------------------------------------------------------

test("extractPostTags: lowercases and dedupes across case", () => {
  assert.deepEqual(extractPostTags("Go #IU and #iu and #Hoosiers!"), ["iu", "hoosiers"]);
});

test("extractPostTags: no tags gives an empty list", () => {
  assert.deepEqual(extractPostTags(""), []);
  assert.deepEqual(extractPostTags("no tags here # alone"), []);
});

test("extractPostTags: stops at 10 tags", () => {
  const text = Array.from({ length: 12 }, (_, i) => `#tag${i}`).join(" ");
  const tags = extractPostTags(text);
  assert.equal(tags.length, 10);
  assert.deepEqual(tags, Array.from({ length: 10 }, (_, i) => `tag${i}`));
});

test("extractPostTags: duplicates don't use up the 10", () => {
  const text = "#a #A #a " + Array.from({ length: 10 }, (_, i) => `#t${i}`).join(" ");
  const tags = extractPostTags(text);
  assert.equal(tags.length, 10);
  assert.equal(tags[0], "a");
  assert.equal(tags.includes("t8"), true);
  assert.equal(tags.includes("t9"), false);
});

test("extractPostTags: a tag longer than 32 characters keeps its first 32", () => {
  const long = "A".repeat(40);
  assert.deepEqual(extractPostTags(`#${long}`), ["a".repeat(32)]);
});

test("extractPostTags: stops at characters outside [A-Za-z0-9_]", () => {
  assert.deepEqual(extractPostTags("#rush-week #go_iu2026 #café"), ["rush", "go_iu2026", "caf"]);
});

test("extractPostTags matches the composer's extractHashtags on every sample", () => {
  const samples = [
    "",
    "plain text",
    "#One #two #ONE",
    "##double #x",
    "mid#word tag",
    "#" + "b".repeat(33) + " #c",
    Array.from({ length: 15 }, (_, i) => `#Tag${i % 12}`).join(" "),
    "emoji 🎉 #party\n#party2\t#PARTY",
  ];
  for (const s of samples) {
    assert.deepEqual(extractPostTags(s), composerExtractHashtags(s), `sample: ${JSON.stringify(s)}`);
  }
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
