/**
 * The desktop profile's Saved tiles, Reposts line and composer gap (critique
 * batch B6, Oct 19, 2026). public/html/profile.html builds a Saved tile in
 * the block between `// saved-tiles:start` and `// saved-tiles:end`; this
 * file runs that block on a tiny fake DOM, beside the phone's rule
 * (savedTileThumb in ./saved-tile.ts), and pins the Reposts line and the CSS
 * as text.
 *
 * Run with:
 *   node --test src/lib/profile/static-profile-saved.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A specifier in a variable: Node needs the ".ts", and tsc refuses it in an
// import statement (TS5097), the same way static-profile-clubs.test.ts loads.
const savedTileSpecifier = "./saved-tile.ts";
const { savedTileThumb } = (await import(savedTileSpecifier)) as typeof import("./saved-tile");
type SavedTileMedia = import("./saved-tile").SavedTileMedia;

const REPO_ROOT = new URL("../../../", import.meta.url);
const html = readFileSync(new URL("public/html/profile.html", REPO_ROOT), "utf8");
const phone = readFileSync(new URL("src/components/mobile/ProfileMobile.tsx", REPO_ROOT), "utf8");

function region(start: string, end: string): string {
  assert.equal(html.split(start).length - 1, 1, `${start} must appear once in profile.html`);
  assert.equal(html.split(end).length - 1, 1, `${end} must appear once in profile.html`);
  return html.slice(html.indexOf(start) + start.length, html.indexOf(end));
}

function fnSource(src: string, name: string): string {
  const head = `function ${name}(`;
  assert.equal(src.split(head).length - 1, 1, `${head} must appear once`);
  const a = src.indexOf(head);
  let depth = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(a, i + 1);
  }
  throw new Error(`${name}: no closing brace`);
}

// --- A fake DOM: just what _buildSavedCell touches ----------------------------

class FakeEl {
  tagName: string;
  type = "";
  className = "";
  innerHTML = "";
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  listeners: Record<string, Array<() => void>> = {};
  private text = "";
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get classList() {
    return {
      add: (c: string) => {
        if (!this.className.split(" ").includes(c)) this.className = `${this.className} ${c}`.trim();
      },
      contains: (c: string) => this.className.split(" ").includes(c),
    };
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  appendChild(c: FakeEl) {
    this.children.push(c);
    return c;
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  set textContent(v: string) {
    this.text = v;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  find(cls: string): FakeEl | undefined {
    for (const c of this.children) {
      if (c.classList.contains(cls)) return c;
      const deep = c.find(cls);
      if (deep) return deep;
    }
    return undefined;
  }
}

const opened: Array<{ id: unknown; prefill: unknown }> = [];
const savedBlock = region("// saved-tiles:start", "// saved-tiles:end");
const { _buildSavedCell, _savedTileModel } = new Function(
  "document",
  "openPostViewer",
  "_savedPrefill",
  `${savedBlock}\nreturn { _buildSavedCell, _savedTileModel };`,
)(
  { createElement: (tag: string) => new FakeEl(tag) },
  (id: unknown, prefill: unknown) => opened.push({ id, prefill }),
  (post: { id: string }) => ({ id: post.id, prefill: true }),
) as {
  _buildSavedCell: (post: Record<string, unknown>) => FakeEl;
  _savedTileModel: (post: Record<string, unknown>) => { thumb: string; isVideo: boolean; text: string };
};

const PHOTO = { id: "p1", content: "Sunset on the canal", media_kind: "image", media_url: "/media/a.jpg", media_thumbnail_url: null };
const VIDEO_POSTER = { id: "p2", content: "", media_kind: "video", media_url: "/media/v.mp4", media_thumbnail_url: "/media/v.jpg" };
const VIDEO_BARE = { id: "p3", content: "Our first rehearsal", media_kind: "video", media_url: "/media/v2.mp4", media_thumbnail_url: null };
const TEXT = { id: "p4", content: "Who's going to the game tonight?", media_kind: null, media_url: null, media_thumbnail_url: null };

test("saved tile: a photo post fills the tile and is read out as a saved photo", () => {
  const cell = _buildSavedCell(PHOTO);
  assert.equal(cell.tagName, "BUTTON");
  assert.equal(cell.type, "button");
  assert.ok(cell.classList.contains("vibe-grid-thumb") && cell.classList.contains("saved-tile"), cell.className);
  assert.equal(cell.dataset.sourcePostId, "p1");
  assert.equal(cell.find("vibe-grid-bg")?.style.backgroundImage, 'url("/media/a.jpg")');
  assert.equal(cell.textContent, "Saved photo. Sunset on the canal");
  // The edit listener rewrites .post-thumb-body, spoken-only on a photo tile.
  const body = cell.find("post-thumb-body");
  assert.ok(body?.classList.contains("saved-tile-sr"));
  assert.equal(cell.find("vibe-grid-play"), undefined);
  cell.listeners.click?.[0]?.();
  assert.deepEqual(opened.at(-1), { id: "p1", prefill: { id: "p1", prefill: true } });
});

test("saved tile: a video shows its poster and the drawn play badge, never its file", () => {
  const withPoster = _buildSavedCell(VIDEO_POSTER);
  assert.ok(withPoster.classList.contains("vibe-grid-thumb"));
  assert.equal(withPoster.find("vibe-grid-bg")?.style.backgroundImage, 'url("/media/v.jpg")');
  assert.equal(withPoster.textContent.trim(), "Saved video.");
  const play = withPoster.find("vibe-grid-play");
  assert.match(play?.innerHTML ?? "", /^<svg [^>]*aria-hidden="true"/);
  // No poster: a text tile with the badge; the .mp4 is never a background.
  const bare = _buildSavedCell(VIDEO_BARE);
  assert.ok(bare.classList.contains("post-thumb-cell"), bare.className);
  assert.equal(bare.find("vibe-grid-bg"), undefined);
  assert.ok(bare.find("vibe-grid-play"));
  assert.equal(bare.find("post-thumb-body")?.textContent, "Our first rehearsal");
});

test("saved tile: a text post is a plain tile in the page's own colours", () => {
  const cell = _buildSavedCell(TEXT);
  assert.ok(cell.classList.contains("post-thumb-cell") && cell.classList.contains("saved-tile"));
  assert.doesNotMatch(cell.className, /theme-/);
  const body = cell.find("post-thumb-body");
  assert.equal(body?.textContent, "Who's going to the game tonight?");
  assert.equal(body?.dataset.empty, "Saved post");
  assert.equal(_buildSavedCell({ id: "p5", content: "x".repeat(300) }).find("post-thumb-body")?.textContent.length, 240);
});

test("saved tile: the desktop picks the same picture as the phone (savedTileThumb)", () => {
  const urls = [null, "", "/media/x.jpg"];
  const kinds = [null, "image", "video", undefined];
  for (const media_url of urls)
    for (const media_thumbnail_url of urls)
      for (const media_kind of kinds) {
        const p = { media_url, media_thumbnail_url, media_kind } as SavedTileMedia;
        assert.equal(_savedTileModel(p).thumb, savedTileThumb(p) ?? "", JSON.stringify(p));
        assert.equal(_savedTileModel(p).isVideo, media_kind === "video");
      }
  // The phone's old picture rule (by `type`, which every saved post has) is
  // gone. (A count of savedTileThumb calls used to sit here; it failed on a
  // rename and passed on a wrong use, so it went in the Oct 19 review.)
  assert.doesNotMatch(phone, /p\.type === "post" \? p\.media_url/);
});

test("saved CSS: the six typed-in pastels are gone; the text tile uses tokens", () => {
  assert.ok(!/\.post-thumb-cell\.theme-/.test(html), "a pastel theme rule is back");
  assert.ok(!html.includes("_savedThemeFor"), "_savedThemeFor is back");
  const cell = html.match(/\n\.post-thumb-cell \{([^}]*)\}/)?.[1] ?? "";
  assert.match(cell, /background:rgba\(var\(--scrim-rgb\),\.06\)/);
  assert.match(cell, /color:var\(--ink-post\)/);
  // The clamped text keeps its own height (a stretched -webkit-box paints
  // past its "…"): flex-start, never centred or stretched.
  assert.match(cell, /align-items:flex-start/);
  assert.match(cell, /container:saved-tile \/ size;/);
});

test("saved CSS: a text tile shows whole lines only, at every tile size", () => {
  // Review, Oct 19, 2026: at 761-880px wide a tile is 97-125px, and the old
  // clamp of 6 with max-height:100% cut the bottom line through its letters.
  const body = html.match(/\n\.post-thumb-cell \.post-thumb-body \{([^}]*)\}/)?.[1] ?? "";
  const px = Number(body.match(/font-size:(\d+(?:\.\d+)?)px/)?.[1]);
  const lh = Number(body.match(/line-height:(\d+(?:\.\d+)?);/)?.[1]);
  assert.ok(px > 0 && lh > 0, body);
  const line = px * lh;
  assert.doesNotMatch(body, /max-height:100%/);
  assert.doesNotMatch(body, /word-break:break-word/);
  assert.match(body, /overflow-wrap:anywhere/);
  // [the content height the rule starts at, its clamp]: the base, then each
  // container step. The clamp and max-height are the same whole number.
  const steps: Array<[number, number]> = [[Infinity, Number(body.match(/-webkit-line-clamp:(\d+)/)?.[1])]];
  assert.match(body, new RegExp(`max-height:calc\\(${lh}em \\* ${steps[0][1]}\\)`));
  for (const m of html.matchAll(/@container saved-tile \(max-height: (\d+(?:\.\d+)?)px\) \{ \.post-thumb-cell \.post-thumb-body \{ -webkit-line-clamp:(\d+);max-height:calc\(([\d.]+)em \* (\d+)\); \} \}/g)) {
    assert.equal(m[2], m[4], "clamp and max-height differ");
    assert.equal(Number(m[3]), lh);
    steps.push([Number(m[1]), Number(m[2])]);
  }
  assert.ok(steps.length >= 4, `only ${steps.length} steps`);
  // Walk every content height from 30 to 200px: the clamp picked there must
  // fit, and one more line must not (or it is the base's 6).
  for (let h = 30; h <= 200; h += 0.25) {
    const clamp = steps.filter(([max]) => h <= max).reduce((a, b) => (b[0] < a[0] ? b : a))[1];
    if (clamp > 2) assert.ok(clamp * line <= h + 0.1, `${clamp} lines don't fit ${h}px`);
    if (clamp < steps[0][1]) assert.ok((clamp + 1) * line > h - 0.1, `${clamp + 1} lines would fit ${h}px`);
  }
});

test("reposts line: the phone's drawn icon and 'Reposted 5d ago', no emoji", () => {
  // Not assert.doesNotMatch: its failure would print the whole page.
  assert.ok(!/&#128257;|\u{1F501}/u.test(html), "profile.html still has the repost emoji");
  const block = region("// repost-banner:start", "// repost-banner:end");
  // The same two paths as IconRepost in ProfileMobile.tsx.
  const iconFn = fnSource(phone, "IconRepost");
  const phonePaths = [...iconFn.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const deskPaths = [...block.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(phonePaths.length, 2);
  assert.deepEqual(deskPaths, phonePaths);
  const label = new Function(
    `${fnSource(html, "_formatRelativeDate")}\n${fnSource(block, "_repostedLabel")}\nreturn _repostedLabel;`,
  )() as (at: unknown) => string;
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.equal(label(ago(5 * 86400 + 60)), "Reposted 5d ago");
  assert.equal(label(ago(3 * 3600 + 5)), "Reposted 3h ago");
  assert.equal(label(ago(5)), "Reposted just now");
  assert.equal(label(null), "Reposted");
  assert.match(fnSource(html, "_buildRepostCard"), /_buildRepostBanner\(repost\.reposted_at\)/);
});

/** The markup right after the element that opens at `open`: its closing tag
 *  is found by counting <div> and </div> (comments skipped), then the next
 *  tag after any whitespace and comments is returned. */
function nextSiblingTag(src: string, open: string): string {
  assert.equal(src.split(open).length - 1, 1, `${open} must appear once`);
  const at = src.indexOf(open);
  const tag = /<!--[\s\S]*?-->|<div\b[^>]*>|<\/div>/g;
  tag.lastIndex = at;
  let depth = 0;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    if (m[0].startsWith("<!--")) continue;
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) {
      const rest = src.slice(tag.lastIndex).replace(/^(?:\s|<!--[\s\S]*?-->)+/, "");
      return rest.slice(0, rest.indexOf(">") + 1);
    }
  }
  throw new Error(`${open} never closes`);
}

test("composer and tabs: your own profile keeps a gap, the visitor view stays flush", () => {
  assert.match(html, /body:not\(\.viewer-mode\) \.profile-composer \+ \.content-tabs \{ margin-top:4px; \}/);
  // The rule only works while the tabs are the composer's very next element
  // (CSS '+'). Something moved in between would switch the gap off.
  assert.equal(nextSiblingTag(html, '<div class="profile-composer owner-only"'), '<div class="content-tabs">');
  // The walker itself: an element slipped in between is caught.
  const slipped = '<div class="profile-composer owner-only"><div>x</div></div>\n<!-- a -->\n<div class="drafts"><div></div></div><div class="content-tabs">';
  assert.equal(nextSiblingTag(slipped, '<div class="profile-composer owner-only"'), '<div class="drafts">');
});
