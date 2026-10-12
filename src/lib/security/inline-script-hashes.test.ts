/**
 * Tests for `inline-script-hashes.ts`: the hash list for a hand-written page's
 * inline scripts, and the /offline.html browser code rule built from it (plan
 * handoffs/2026-10-11-browser-rule-plan.md, "inline-script-hashes").
 *
 * Run with:
 *   node --test src/lib/security/inline-script-hashes.test.ts
 *
 * The module imports only node:crypto, so it loads through a dynamic import
 * of its ".ts" path; the specifier goes through a variable because tsc
 * refuses a literal ".ts" specifier (TS5097).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./inline-script-hashes.ts";
const { inlineScriptHashes, offlinePageCsp } = (await import(specifier)) as typeof import("./inline-script-hashes");

// Hashes computed by hand: node -e 'crypto.createHash("sha256").update(s,"utf8").digest("base64")'
const HI = "'sha256-YyeTXEEDvdUn4SEEQwWcQj1xGgfkyT8LNTFXYzrV0nc='"; // console.log("hi");
const SPACED = "'sha256-wYD6gJuOAPxlJHFvhr2Zk0r9F+gmt8nwaf1uW8o5LTY='"; // "\n  var a = 1;\n"
const X_LF = "'sha256-c8s4WKaHqElMozIwUwFigvPa051Cz2LKTnndoqrH2aw='"; // "x\n"

test("one inline script and one with src → one hash, equal to the hand-computed value", () => {
  const html = `<!doctype html><html><head>
<script src="/html/_otto.js"></script>
<script>console.log("hi");</script>
</head><body></body></html>`;
  assert.deepEqual(inlineScriptHashes(html), [HI]);
});

test("the exact text between the tags is hashed: no trimming", () => {
  assert.deepEqual(inlineScriptHashes("<script>\n  var a = 1;\n</script>"), [SPACED]);
  assert.notDeepEqual(inlineScriptHashes("<script>var a = 1;</script>"), [SPACED]);
});

test("CRLF is hashed as LF, as the HTML parser hands it to the script", () => {
  assert.deepEqual(inlineScriptHashes("<script>x\r\n</script>"), [X_LF]);
  assert.deepEqual(inlineScriptHashes("<script>x\r</script>"), [X_LF]);
});

test("attributes: type and nonce don't matter, data-src is not src, bare src is src, any case", () => {
  assert.deepEqual(inlineScriptHashes(`<script type="module" nonce="n">console.log("hi");</script>`), [HI]);
  assert.deepEqual(inlineScriptHashes(`<script data-src="/x.js">console.log("hi");</script>`), [HI]);
  assert.deepEqual(inlineScriptHashes(`<script async src>console.log("hi");</script>`), []);
  assert.deepEqual(inlineScriptHashes(`<SCRIPT SRC="/a.js"></SCRIPT><Script>console.log("hi");</sCrIpT >`), [HI]);
});

test("a commented-out script is skipped; <scripts> is not a script tag; document order is kept", () => {
  const html = `<!-- <script>evil()</script> --><scripts>no</scripts>
<script>console.log("hi");</script><script>x
</script>`;
  assert.deepEqual(inlineScriptHashes(html), [HI, X_LF]);
});

test("no scripts, or an unclosed one → nothing to allow", () => {
  assert.deepEqual(inlineScriptHashes("<p>offline</p>"), []);
  assert.deepEqual(inlineScriptHashes("<script>never closed"), []);
});

test("the real public/offline.html has exactly 2 inline scripts to hash", () => {
  const html = readFileSync(new URL("../../../public/offline.html", import.meta.url), "utf8");
  const hashes = inlineScriptHashes(html);
  assert.equal(hashes.length, 2);
  for (const h of hashes) assert.match(h, /^'sha256-[A-Za-z0-9+/]{43}='$/);
  assert.notEqual(hashes[0], hashes[1]);
  // Every <script> on the page is inline, so each one needs (and has) a hash.
  assert.equal((html.match(/<script[\s>]/gi) ?? []).length, 2);
});

test("offlinePageCsp: the plan's directives, the hashes as the only script sources", () => {
  assert.equal(
    offlinePageCsp([HI, X_LF]),
    `default-src 'self'; script-src ${HI} ${X_LF}; style-src 'unsafe-inline'; img-src 'self' data:; ` +
      "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  );
  assert.ok(!offlinePageCsp([HI]).includes("unsafe-eval"));
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(offlinePageCsp([HI])));
});

test("offlinePageCsp with no hashes refuses all scripts instead of writing an empty list", () => {
  assert.match(offlinePageCsp([]), /script-src 'none';/);
});
