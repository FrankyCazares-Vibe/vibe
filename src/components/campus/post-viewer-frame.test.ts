// The campus feed's post popup frame (Nov 16, 2026): PostViewerFrame.tsx and
// public/html/post-viewer.html talk over postMessage with names each file
// writes by hand, and the popup (_postViewer.js) hands a page its delete,
// edit and close through window events. These checks fail the day one side
// changes without the other.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const tsx = read("src/components/campus/PostViewerFrame.tsx");
const html = read("public/html/post-viewer.html");
const viewer = read("public/html/_postViewer.js");
const proxy = read("src/proxy.ts");

test("both sides use the same source, version and frame address", () => {
  assert.match(tsx, /const SOURCE = "vibe-post-viewer";/);
  assert.match(html, /var SOURCE = 'vibe-post-viewer';/);
  assert.match(html, /source: SOURCE, v: 1, type: type/);
  assert.match(tsx, /source: SOURCE, v: 1, type: "open"/);
  assert.match(tsx, /POST_VIEWER_FRAME_SRC = "\/html\/post-viewer\.html\?app=1"/);
});

test("every message the page sends is one the feed handles", () => {
  const sent = [...html.matchAll(/say\('([a-z]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(sent, ["closed", "deleted", "edited", "ready"]);
  for (const type of sent) assert.match(tsx, new RegExp(`case "${type}":`), `feed misses "${type}"`);
  assert.match(html, /d\.type !== 'open'/);
});

test("messages are same-origin only, both ways", () => {
  assert.match(html, /e\.origin !== location\.origin \|\| e\.source !== parentWin/);
  assert.match(html, /postMessage\([^;]*location\.origin\)/);
  assert.match(tsx, /e\.origin !== window\.location\.origin/);
  assert.match(tsx, /e\.source !== frameRef\.current\.contentWindow/);
  assert.match(tsx, /window\.location\.origin\);/);
  assert.doesNotMatch(html + tsx, /postMessage\([^)]*["']\*["']\)/);
});

test("the popup's events: a page can take over the delete, and every close is announced", () => {
  assert.match(viewer, /new CustomEvent\("vibe:post-deleted",\s*\{ detail: \{ id \}, cancelable: true \}\)/);
  assert.match(viewer, /if \(handled\) return;/);
  assert.match(viewer, /new CustomEvent\("vibe:post-viewer-closed"/);
  assert.match(viewer, /new CustomEvent\("vibe:post-edited"/);
  for (const ev of ["vibe:post-deleted", "vibe:post-edited", "vibe:post-viewer-closed"]) {
    assert.ok(html.includes(`addEventListener('${ev}'`), `post-viewer.html doesn't listen for ${ev}`);
  }
  // React owns the feed's cards: the frame page always takes the delete.
  assert.match(html, /'vibe:post-deleted', function \(e\) \{[\s\S]{0,200}e\.preventDefault\(\);/);
});

test("the proxy serves the page to signed-in people only, in app mode", () => {
  assert.match(proxy, /"\/html\/post-viewer\.html": "\/campus"/);
  assert.match(proxy, /const APP_HTML = new Set\(\[[^\]]*"\/html\/post-viewer\.html"/);
});

test("the page loads the popup and what it calls", () => {
  for (const s of ["_persistence.js", "_postViewer.js", "_sharePicker.js", "_safetyActions.js", "_mentionPicker.js"]) {
    assert.ok(html.includes(`<script src="/html/${s}"`), `post-viewer.html misses ${s}`);
  }
});
