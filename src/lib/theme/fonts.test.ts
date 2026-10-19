/**
 * DRIFT TRIPWIRE for the font link (Oct 19, 2026). The app loads its fonts
 * from ONE Google stylesheet, GOOGLE_FONTS_HREF in fonts.ts. The three static
 * pages can't import it, so they paste the same href; when one drifts, its
 * bold snaps to the wrong weight or its titles change shape, and nothing else
 * notices. Each failure names the file to fix.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/theme/fonts.test.ts
 *
 * fonts.ts has no imports, so it loads through a dynamic import of its ".ts"
 * path (the theme.test.ts pattern; the specifier goes through a variable
 * because tsc refuses a literal ".ts" specifier).
 */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import type * as FontsModule from "./fonts";

const specifier = "./fonts.ts";
const { GOOGLE_FONTS_HREF, WORDMARK_FONT_PATH } = (await import(specifier)) as typeof FontsModule;

const REPO_ROOT = new URL("../../../", import.meta.url);
const STATIC_PAGES = [
  "public/html/profile.html",
  "public/html/messages.html",
  "public/html/onboarding.html",
];
/** The class each static page draws its "vibe." logo with. */
const LOGO_SELECTOR: Record<string, string> = {
  "public/html/profile.html": ".nav-logo",
  "public/html/messages.html": ".nav-logo",
  "public/html/onboarding.html": ".onb-logo",
};

/** Every Google css2 href in a chunk of HTML, as written (raw `&`). */
function googleHrefs(html: string): string[] {
  const found: string[] = [];
  const re = /\bhref\s*=\s*(["'])(https:\/\/fonts\.googleapis\.com\/css2[^"']*)\1/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) found.push(m[2]);
  return found;
}

/** One CSS value, normalised: single spaces, none around commas, '"' quotes. */
function normValue(v: string): string {
  return v.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").replace(/'/g, '"');
}

/** The declarations of a CSS block body as { property: normalised value }. */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = normValue(part.slice(i + 1));
  }
  return out;
}

/** Every innermost `selector { body }` rule in some CSS, comments removed. */
function cssRules(css: string): { selector: string; decls: Record<string, string> }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { selector: string; decls: Record<string, string> }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    // A statement such as `@import …;` can sit before a rule; keep what follows it.
    const selector = (m[1].split(";").pop() ?? "").trim().replace(/\s+/g, " ");
    rules.push({ selector, decls: declarations(m[2]) });
  }
  return rules;
}

/** The CSS inside a page's <style> tags. */
function styleCss(html: string): string {
  const parts: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style\s*>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) parts.push(m[1]);
  return parts.join("\n");
}

/** The "Vibe Wordmark" @font-face blocks in some CSS, as declaration maps. */
function wordmarkFaces(css: string): Record<string, string>[] {
  return cssRules(css)
    .filter((r) => r.selector === "@font-face" && r.decls["font-family"] === '"Vibe Wordmark"')
    .map((r) => r.decls);
}

test("GOOGLE_FONTS_HREF: one css2 link with both families and display=swap", () => {
  assert.ok(GOOGLE_FONTS_HREF.startsWith("https://fonts.googleapis.com/css2?"));
  assert.ok(GOOGLE_FONTS_HREF.includes("family=DM+Sans:"), "DM Sans is in the link");
  assert.ok(GOOGLE_FONTS_HREF.includes("family=Fraunces:"), "Fraunces is in the link");
  assert.ok(GOOGLE_FONTS_HREF.endsWith("&display=swap"));
  assert.ok(!GOOGLE_FONTS_HREF.includes("&amp;"), "raw '&', the way the static pages paste it");
});

for (const file of STATIC_PAGES) {
  test(`drift: ${file} <head> loads GOOGLE_FONTS_HREF, once`, async () => {
    const html = await readFile(new URL(file, REPO_ROOT), "utf8");
    const open = html.search(/<head[\s>]/i);
    const close = html.search(/<\/head\s*>/i);
    assert.ok(open >= 0 && close > open, `${file}: no <head>…</head> found`);
    const hrefs = googleHrefs(html.slice(open, close));
    assert.equal(
      hrefs.length,
      1,
      `${file}: expected exactly one fonts.googleapis.com/css2 link in <head>, found ${hrefs.length}.`,
    );
    assert.equal(
      hrefs[0],
      GOOGLE_FONTS_HREF,
      `${file}: the font link differs from GOOGLE_FONTS_HREF. Paste the string ` +
        `from src/lib/theme/fonts.ts verbatim (raw '&', not '&amp;').`,
    );
    assert.equal(
      googleHrefs(html).length,
      1,
      `${file}: a second fonts.googleapis.com/css2 link sits outside <head>.`,
    );
  });

  // Oct 19, 2026: the whole face, not just the file path. A page whose face
  // drops to 800, swaps in Georgia first or loses its unicode-range draws a
  // different logo, and so does a logo rule back on plain Fraunces.
  test(`drift: ${file} declares the wordmark face like globals.css`, async () => {
    const html = await readFile(new URL(file, REPO_ROOT), "utf8");
    const css = await readFile(new URL("src/app/globals.css", REPO_ROOT), "utf8");
    const [want] = wordmarkFaces(css);
    const faces = wordmarkFaces(styleCss(html));
    assert.equal(
      faces.length,
      1,
      `${file}: expected one "Vibe Wordmark" @font-face in its <style>, found ${faces.length}. ` +
        `Copy the block from src/app/globals.css.`,
    );
    for (const prop of ["src", "font-weight", "font-style", "font-display", "unicode-range"]) {
      assert.equal(
        faces[0][prop],
        want[prop],
        `${file}: the "Vibe Wordmark" @font-face ${prop} differs from src/app/globals.css.`,
      );
    }
  });

  test(`drift: ${file} draws its logo in the wordmark face`, async () => {
    const html = await readFile(new URL(file, REPO_ROOT), "utf8");
    const logo = LOGO_SELECTOR[file];
    const rules = cssRules(styleCss(html)).filter(
      (r) => r.selector.split(",").some((sel) => sel.trim() === logo) && r.decls["font-family"],
    );
    assert.ok(rules.length > 0, `${file}: no ${logo} rule sets a font-family.`);
    for (const r of rules) {
      assert.ok(
        r.decls["font-family"].startsWith('"Vibe Wordmark",'),
        `${file}: ${logo} uses ${r.decls["font-family"]}; it must start with "Vibe Wordmark".`,
      );
      assert.equal(r.decls["font-weight"], "900", `${file}: ${logo} must be font-weight 900.`);
      assert.equal(r.decls["letter-spacing"], "-0.03em", `${file}: ${logo} must use letter-spacing -0.03em.`);
    }
  });
}

test("drift: the root layout takes the link from fonts.ts, not a literal", async () => {
  const tsx = await readFile(new URL("src/app/layout.tsx", REPO_ROOT), "utf8");
  assert.ok(
    !tsx.includes("fonts.googleapis.com/css2"),
    "src/app/layout.tsx: a literal Google css2 link; use GOOGLE_FONTS_HREF.",
  );
  assert.ok(tsx.includes("GOOGLE_FONTS_HREF"), "src/app/layout.tsx: GOOGLE_FONTS_HREF is not used.");
});

test("drift: globals.css declares the wordmark face at WORDMARK_FONT_PATH", async () => {
  const css = await readFile(new URL("src/app/globals.css", REPO_ROOT), "utf8");
  const faces = wordmarkFaces(css);
  assert.equal(faces.length, 1, `src/app/globals.css: expected one "Vibe Wordmark" @font-face, found ${faces.length}.`);
  const face = faces[0];
  assert.equal(
    face.src,
    `url("${WORDMARK_FONT_PATH}") format("woff2")`,
    `src/app/globals.css: the "Vibe Wordmark" @font-face must load ${WORDMARK_FONT_PATH}.`,
  );
  assert.equal(face["font-weight"], "900");
  assert.equal(face["font-style"], "normal");
  assert.equal(face["font-display"], "block", "block, not swap: the logo must never flash in Georgia.");
  // The five letters the file holds: . b e i v
  assert.equal(face["unicode-range"], "U+2E,U+62,U+65,U+69,U+76");
});

test("the wordmark file exists, is a woff2 and stays tiny", async () => {
  const url = new URL(`public${WORDMARK_FONT_PATH}`, REPO_ROOT);
  const { size } = await stat(url);
  assert.ok(size < 4096, `public${WORDMARK_FONT_PATH}: ${size} B, expected under 4,096 B (five glyphs).`);
  const head = (await readFile(url)).subarray(0, 4).toString("latin1");
  assert.equal(head, "wOF2", `public${WORDMARK_FONT_PATH}: not a woff2 file.`);
});
