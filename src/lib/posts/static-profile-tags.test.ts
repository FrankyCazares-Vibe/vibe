/**
 * The static pages' copies of the post tag rule (critique batch B6, Oct 19,
 * 2026). public/html/profile.html and public/html/_postViewer.js each carry
 * a block between `// tags-twin:start` and `// tags-twin:end` that copies
 * POST_TAG_IN_TEXT_RE, POST_TAG_LINK_RE and extractPostTags from edit.ts, and
 * captionTagRanges from caption-tag-ranges.ts. This file runs every copy
 * beside the TypeScript on the same inputs, including edit.test.ts's own
 * PROBE table (read out of that file, so a new probe case reaches the twins
 * without being copied here). It also checks the two caption renderers that
 * use the twin: links only for saved tags, everything else escaped.
 *
 * ONE TABLE FOR EVERY COPY (review, Oct 19, 2026). The feed, the open post
 * and the desktop row cut captions with captionSegments
 * (src/lib/feed/caption-segments.ts, B1), and the phone profile card with
 * profileCaptionParts (src/lib/profile/profile-caption.ts), which is
 * captionSegments. Both are pinned here beside captionTagRanges and the two
 * static twins, on the samples and the fuzz, so a tag rule changed in one
 * place only goes red.
 *
 * Run with:
 *   node --test src/lib/posts/static-profile-tags.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

// Same hook as tags.test.ts: caption-tag-ranges.ts imports "./edit" with no
// extension (what Next and tsc expect); Node's type stripping adds none.
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("static-profile-tags.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const editSpecifier = "./edit.ts";
const edit = (await import(editSpecifier)) as typeof import("./edit");
const rangesSpecifier = "./caption-tag-ranges.ts";
const { captionTagRanges } = (await import(rangesSpecifier)) as typeof import("./caption-tag-ranges");
const segmentsSpecifier = "../feed/caption-segments.ts";
const { captionSegments } = (await import(segmentsSpecifier)) as typeof import("../feed/caption-segments");
const partsSpecifier = "../profile/profile-caption.ts";
const { profileCaptionParts } = (await import(partsSpecifier)) as typeof import("../profile/profile-caption");

/** The tag ranges a segment list implies (positions add up from the start). */
function rangesOfSegments(segs: ReadonlyArray<{ kind: string; text: string; tag?: string }>): Range[] {
  const out: Range[] = [];
  let at = 0;
  for (const s of segs) {
    if (s.kind === "tag") out.push({ start: at, end: at + s.text.length, tag: s.tag as string });
    at += s.text.length;
  }
  return out;
}
/** captionSegments and the phone card's parts, as ranges, beside captionTagRanges. */
function assertAllTypeScriptAgree(s: string, saved: string[], why: string) {
  const want = captionTagRanges(s, saved);
  const segs = captionSegments(s, saved);
  assert.deepEqual(rangesOfSegments(segs), want, `captionSegments ${why}`);
  assert.equal(segs.map((x) => x.text).join(""), s, `captionSegments joins back ${why}`);
  const parts = profileCaptionParts(s, saved);
  assert.deepEqual(
    rangesOfSegments(parts.map((p) => ({ kind: p.kind, text: p.text, tag: p.href ? decodeURIComponent(p.href.split("tag=")[1]) : undefined }))),
    want,
    `profileCaptionParts ${why}`,
  );
}

type Range = { start: number; end: number; tag: string };
type Twin = {
  VIBE_POST_TAG_MAX: number;
  VIBE_POST_TAG_IN_TEXT_RE: RegExp;
  VIBE_POST_TAG_LINK_RE: RegExp;
  vibeIsNewPostTag: (t: unknown) => boolean;
  vibeBlankPostLinks: (t: string) => string;
  vibeExtractPostTags: (t: unknown) => string[];
  vibeCaptionTagRanges: (t: unknown, tags: unknown) => Range[];
};
const TWIN_NAMES = [
  "VIBE_POST_TAG_MAX",
  "VIBE_POST_TAG_IN_TEXT_RE",
  "VIBE_POST_TAG_LINK_RE",
  "vibeIsNewPostTag",
  "vibeBlankPostLinks",
  "vibeExtractPostTags",
  "vibeCaptionTagRanges",
];

const REPO_ROOT = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, REPO_ROOT), "utf8");
const PAGES = {
  "profile.html": read("public/html/profile.html"),
  "_postViewer.js": read("public/html/_postViewer.js"),
};

/** The text between two markers that each appear exactly once. */
function region(src: string, start: string, end: string, where: string): string {
  assert.equal(src.split(start).length - 1, 1, `${start} must appear once in ${where}`);
  assert.equal(src.split(end).length - 1, 1, `${end} must appear once in ${where}`);
  const a = src.indexOf(start);
  const b = src.indexOf(end);
  assert.ok(b > a, `${end} comes before ${start} in ${where}`);
  return src.slice(a + start.length, b);
}

/** One function's source, by brace matching from `function <name>(`. */
function fnSource(src: string, name: string, where: string): string {
  const head = `function ${name}(`;
  assert.equal(src.split(head).length - 1, 1, `${head} must appear once in ${where}`);
  const a = src.indexOf(head);
  let depth = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(a, i + 1);
  }
  throw new Error(`${name}: no closing brace in ${where}`);
}

const twinSources = Object.fromEntries(
  Object.entries(PAGES).map(([where, src]) => [where, region(src, "// tags-twin:start", "// tags-twin:end", where)]),
) as Record<keyof typeof PAGES, string>;
const twins = Object.fromEntries(
  Object.entries(twinSources).map(([where, src]) => [
    where,
    new Function(`${src}\nreturn { ${TWIN_NAMES.join(", ")} };`)() as Twin,
  ]),
) as Record<keyof typeof PAGES, Twin>;

/** edit.test.ts's PROBE table, evaluated from that file's own text. */
function probeFromEditTest(): Array<[string, string[]]> {
  const src = readFileSync(new URL("./edit.test.ts", import.meta.url), "utf8");
  const head = "const PROBE: ReadonlyArray<[string, string[]]> = [";
  const a = src.indexOf(head);
  assert.ok(a >= 0, "edit.test.ts no longer has its PROBE table");
  const b = src.indexOf("\n];", a);
  const body = src.slice(a + head.length, b);
  return new Function(`return [${body}\n];`)() as Array<[string, string[]]>;
}
const PROBE = probeFromEditTest();

/** Inputs for the side-by-side runs: the probe, plus links, emoji, newlines. */
const SAMPLES: string[] = [
  ...PROBE.map(([t]) => t),
  "Go #IU and #iu and #Hoosiers!",
  "see x.com/a#bc then #bc",
  "#ab@name and @name#ab",
  "line one #one\nline two #Two\n#three",
  "<b>#bold</b> & #amp_ok",
  "#gameday,iuhoosiers.com/tix #gameday",
  "🎉#party ❤️#love 1️⃣#first",
];

test("tag twins: the regexes are edit.ts's, character for character", () => {
  for (const [where, twin] of Object.entries(twins)) {
    assert.equal(twin.VIBE_POST_TAG_IN_TEXT_RE.source, edit.POST_TAG_IN_TEXT_RE.source, `${where} IN_TEXT source`);
    assert.equal(twin.VIBE_POST_TAG_IN_TEXT_RE.flags, edit.POST_TAG_IN_TEXT_RE.flags, `${where} IN_TEXT flags`);
    assert.equal(twin.VIBE_POST_TAG_LINK_RE.source, edit.POST_TAG_LINK_RE.source, `${where} LINK source`);
    assert.equal(twin.VIBE_POST_TAG_LINK_RE.flags, edit.POST_TAG_LINK_RE.flags, `${where} LINK flags`);
    assert.equal(twin.VIBE_POST_TAG_MAX, edit.POST_TAG_MAX, `${where} cap`);
  }
});

test("tag twins: edit.test.ts's PROBE table gives the same tags", () => {
  assert.ok(PROBE.length >= 30, `PROBE read ${PROBE.length} cases`);
  for (const [where, twin] of Object.entries(twins)) {
    for (const [text, want] of PROBE) {
      assert.deepEqual(twin.vibeExtractPostTags(text), want, `${where}: ${JSON.stringify(text)}`);
    }
  }
});

test("tag twins: the write rule and the link blanking agree with edit.ts", () => {
  const values: unknown[] = ["ab", "a", "1", "2026", "_a", "__", "a".repeat(32), "a".repeat(33), "Ab", "café", null, 7, ["ab"]];
  for (const [where, twin] of Object.entries(twins)) {
    for (const v of values) assert.equal(twin.vibeIsNewPostTag(v), edit.isNewPostTag(v), `${where}: ${JSON.stringify(v)}`);
    for (const s of SAMPLES) assert.equal(twin.vibeBlankPostLinks(s), edit.blankPostLinks(s), `${where}: ${JSON.stringify(s)}`);
  }
});

test("captionTagRanges: only saved tags, every place they sit, positions on the original text", () => {
  const text = "Go #GameDay at x.com/a#gameday, then #gameday! #extra";
  const ranges = captionTagRanges(text, ["gameday"]);
  assert.deepEqual(ranges.map((r) => text.slice(r.start, r.end)), ["#GameDay", "#gameday"]);
  assert.ok(ranges.every((r) => r.tag === "gameday"));
  // A tag the post didn't save is plain text, even if it looks like one.
  assert.deepEqual(captionTagRanges("#six #seven", ["six"]).map((r) => r.tag), ["six"]);
  // An old stored tag the new rule wouldn't write still links ("#2026").
  assert.deepEqual(captionTagRanges("class of #2026", ["2026"]).map((r) => r.start), [9]);
  // One the text can't show any more ("caf" from an old "#café") has none.
  assert.deepEqual(captionTagRanges("coffee #café", ["caf"]), []);
  // After an emoji's surrogate pair the index is still UTF-16.
  const party = "🎉#party";
  assert.deepEqual(captionTagRanges(party, ["party"]), [{ start: 2, end: 8, tag: "party" }]);
  for (const bad of [null, 7, ["#ab"]]) assert.deepEqual(captionTagRanges(bad, ["ab"]), []);
  for (const bad of [null, "ab", [], [7]]) assert.deepEqual(captionTagRanges("#ab", bad), []);
});

test("tag twins: vibeCaptionTagRanges matches captionTagRanges on every sample", () => {
  for (const [where, twin] of Object.entries(twins)) {
    for (const s of SAMPLES) {
      for (const saved of [edit.extractPostTags(s), ["gameday", "iu", "one", "two", "ab", "party"], ["2026", "tag"], []]) {
        assert.deepEqual(twin.vibeCaptionTagRanges(s, saved), captionTagRanges(s, saved), `${where}: ${JSON.stringify(s)}`);
        assertAllTypeScriptAgree(s, saved, JSON.stringify(s));
      }
    }
  }
});

test("tag twins: random captions give the same tags and ranges (fuzz)", () => {
  const parts = ["#", "#ab", "#Tag", " ", "\n", "x.com/", "://", "é", "́", "️", "🎉", "_", "1", "a", "@me", ",", "/", ".", "#tag_1"];
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 1500; n++) {
    let s = "";
    const len = 1 + Math.floor(rand() * 12);
    for (let i = 0; i < len; i++) s += parts[Math.floor(rand() * parts.length)];
    const saved = edit.extractPostTags(s).concat(["ab", "tag"]);
    for (const [where, twin] of Object.entries(twins)) {
      assert.deepEqual(twin.vibeExtractPostTags(s), edit.extractPostTags(s), `${where} extract ${JSON.stringify(s)}`);
      assert.deepEqual(twin.vibeCaptionTagRanges(s, saved), captionTagRanges(s, saved), `${where} ranges ${JSON.stringify(s)}`);
    }
    assertAllTypeScriptAgree(s, saved, `fuzz ${JSON.stringify(s)}`);
  }
});

// --- The renderers that use the twin -------------------------------------------

const profileHtml = PAGES["profile.html"];
const esc = new Function(`${fnSource(profileHtml, "_esc", "profile.html")}\nreturn _esc;`)() as (s: string) => string;
const profileCaptionHTML = new Function(
  "_esc",
  `${twinSources["profile.html"]}\n${fnSource(profileHtml, "_profileCaptionHTML", "profile.html")}\nreturn _profileCaptionHTML;`,
)(esc) as (text: string, tags: unknown) => string;

const viewerJs = PAGES["_postViewer.js"];
const viewerFormat = new Function(
  [
    twinSources["_postViewer.js"],
    fnSource(viewerJs, "esc", "_postViewer.js"),
    fnSource(viewerJs, "formatMentions", "_postViewer.js"),
    fnSource(viewerJs, "formatBodyText", "_postViewer.js"),
    "return formatBodyText;",
  ].join("\n"),
)() as (text: string, tags: unknown) => string;

test("profile caption: saved tags are links to the tag filter, the rest is escaped text", () => {
  const html = profileCaptionHTML("Big win <3 #GameDay\n#extra & x.com/a#gameday", ["gameday"]);
  assert.equal(
    html,
    'Big win &lt;3 <a class="ppost-tag-link" href="/campus?tab=feed&amp;tag=gameday" data-tag="gameday">#GameDay</a>' +
      "<br>#extra &amp; x.com/a#gameday",
  );
  // No tags saved: the old escape-and-<br> output, unchanged.
  assert.equal(profileCaptionHTML("a\n<b>#x</b>", []), "a<br>&lt;b&gt;#x&lt;/b&gt;");
  assert.equal(profileCaptionHTML("", ["ab"]), "");
});

test("profile page: the chip row is gone from new cards and the tag link is styled", () => {
  // _profileMapDbRow and the publish path hand _renderPostCard no chips.
  const mapRow = fnSource(profileHtml, "_profileMapDbRow", "profile.html");
  assert.match(mapRow, /tagsHTML: ''/);
  assert.match(mapRow, /_profileCaptionHTML\(row\.content/);
  assert.doesNotMatch(mapRow, /class="ppost-tag"/);
  const local = fnSource(profileHtml, "_publishProfilePostLocal", "profile.html");
  assert.match(local, /serverPost\.tags/);
  assert.doesNotMatch(local, /class="ppost-tag"/);
  assert.match(profileHtml, /\.ppost-tag-link \{[^}]*color:var\(--tag-ink\)/);
  // The capture listener that keeps a tag tap from also opening the post.
  assert.match(profileHtml, /closest\('a\.ppost-tag-link'\)[\s\S]{0,200}stopPropagation\(\)[\s\S]{0,300}\}, true\);/);
});

test("post viewer: saved tags are links inside the text, no chip row", () => {
  const html = viewerFormat("Hi @avery_b #IU go #iu #not", ["iu"]);
  assert.match(html, /<a class="vpv-mention" href="\/profile\/avery_b"/);
  const links = [...html.matchAll(/<a class="vpv-tag-link" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(links, [
    ["/campus?tab=feed&amp;tag=iu", "#IU"],
    ["/campus?tab=feed&amp;tag=iu", "#iu"],
  ]);
  assert.ok(html.endsWith(" #not"), html);
  // A mention glued to a tag stays plain, as it was before tags were links.
  assert.doesNotMatch(viewerFormat("#ab@avery_b", ["ab"]), /vpv-mention/);
  assert.equal(viewerFormat("<i>x</i> #ab", []), "&lt;i&gt;x&lt;/i&gt; #ab");
  assert.doesNotMatch(viewerJs, /vpv-tags|tagChipsHtml|repaintTags/);
});
