#!/usr/bin/env node
/**
 * The app's icons: check them against the vector master, or redraw them.
 * Session 65 (PWA wave 1); rewritten Nov 21, 2026 for the new app icon,
 * "C Light": the whole "vibe." word in charcoal on cream, with the coral
 * full stop. Small files (tabs, Google, the notification badge) use "v."
 * from the same logo.
 *
 *   node scripts/gen-pwa-icons.mjs           check only (the default): writes nothing
 *   node scripts/gen-pwa-icons.mjs --write   redraw the five drawn icons, then check
 *
 * Exits 1 if any check fails.
 *
 * WHERE THE ICONS COME FROM. Every file is made in the marketing workspace
 * (vibe-marketing/brand/logo-graphics/app-icon/c-wordmark/light/, which this
 * repo doesn't track) and copied in. The two masters sit in
 * scripts/icon-source/, outside src/app/ on purpose: Next serves any icon.*
 * in src/app/ as a tab icon, and the master's letters run together at 16 px.
 *
 *   scripts/icon-source/icon.svg      the app icon, 1024, cream tile, full bleed
 *   scripts/icon-source/maskable.svg  the same with the word a little smaller,
 *                                     so a launcher's circle crop keeps it
 *                                     (it reaches 33% from the middle; the
 *                                     limit is 40%)
 *
 * DRAWN from the masters (sharp: draw at 1024, flatten onto white, shrink).
 * The copied files are exactly what this chain makes, byte for byte, so the
 * check compares pixels and expects no difference:
 *
 *   src/app/apple-icon.png             180  iPhone Home Screen (iOS ignores the manifest)
 *   public/icons/icon-192.png, -512    manifest purpose "any"
 *   public/icons/maskable-192.png, -512  manifest purpose "maskable"
 *
 * Any and maskable are separate files on purpose: web.dev says never to mark
 * one file "any maskable". Chrome won't offer Install without a 192 AND a 512.
 *
 * HAND-PLACED, so never redrawn here, only checked. "v." is fitted to each
 * file's pixel grid, which a plain shrink of the master can't do:
 *
 *   src/app/icon.png                   192  "v." tile on transparent; layout.tsx lists it first, Google Search uses it
 *   public/favicon-48.png              48   Google's favicon size
 *   src/app/favicon.ico = public/favicon.ico   16, 32 and 48 inside
 *   src/app/icon.svg = public/vibe-icon.svg    the tab icon; its faint edge hides in dark browser themes
 *   public/icons/badge-mono-96.png     96   Android's notification badge: white on
 *                                           transparent, Android paints it from the alpha alone
 *
 * Get them right before testers install: an installed iPhone icon never
 * changes (remove Vibe from the Home Screen and add it again), an installed
 * Android app picks up new icons only when Chrome re-mints it, and desktop
 * Chrome may need a reinstall.
 *
 * mobile/scripts/render-icon-source.mjs (the native apps, not shipped) still
 * expects the old white-square src/app/icon.svg. Don't run `npm run icons` in
 * mobile/ until the native icons are swapped too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (path) => resolve(ROOT, path);

const MASTER = "scripts/icon-source/icon.svg";
const MASKABLE = "scripts/icon-source/maskable.svg";

const WHITE = "#FFFFFF";

// The five icons drawn from a master.
const DRAWN = [
  { file: "src/app/apple-icon.png", size: 180, source: MASTER },
  { file: "public/icons/icon-192.png", size: 192, source: MASTER },
  { file: "public/icons/icon-512.png", size: 512, source: MASTER },
  { file: "public/icons/maskable-192.png", size: 192, source: MASKABLE },
  { file: "public/icons/maskable-512.png", size: 512, source: MASKABLE },
];

// Pairs that must be the same bytes: Next serves one, the layout and the
// static pages link the other.
const TWINS = [
  ["src/app/icon.svg", "public/vibe-icon.svg"],
  ["src/app/favicon.ico", "public/favicon.ico"],
];

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--write");
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}`);
  console.error("Usage: node scripts/gen-pwa-icons.mjs [--write]");
  process.exit(2);
}
const WRITE = args.includes("--write");

// ---- drawing ------------------------------------------------------------------

// librsvg draws the SVG at its own 1024 px and sharp shrinks it (lanczos).
// flatten() onto white is belt and braces: the masters are opaque already,
// and flatten drops the alpha channel, which App Store Connect refuses and a
// maskable icon must not have.
function draw(source, size) {
  return sharp(readFileSync(at(source)))
    .flatten({ background: WHITE })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ---- checks -------------------------------------------------------------------

const results = [];
function report(label, problems) {
  results.push({ label, ok: problems.length === 0 });
  console.log(problems.length === 0 ? `ok    ${label}` : `FAIL  ${label}: ${problems.join("; ")}`);
}

async function sizeProblems(path, size) {
  const meta = await sharp(path).metadata();
  return meta.width === size && meta.height === size ? [] : [`expected ${size}x${size}, got ${meta.width}x${meta.height}`];
}

async function checkDrawn({ file, size, source }) {
  const path = at(file);
  const problems = await sizeProblems(path, size);
  const meta = await sharp(path).metadata();
  if (meta.hasAlpha) problems.push("has an alpha channel (it must be opaque)");
  if (problems.length === 0) {
    // Pixels, not bytes: a newer libpng may pack the same picture differently.
    const want = await sharp(await draw(source, size)).raw().toBuffer();
    const have = await sharp(path).raw().toBuffer();
    if (want.length !== have.length) {
      problems.push(`not the same picture as ${source} draws`);
    } else {
      let max = 0;
      for (let i = 0; i < want.length; i += 1) max = Math.max(max, Math.abs(want[i] - have[i]));
      if (max > 0) problems.push(`differs from ${source} by up to ${max} of 255 (re-run with --write if the master changed)`);
    }
  }
  report(`${file}  ${size}x${size}, opaque, drawn from ${source}`, problems);
}

async function checkTile(file, size) {
  const path = at(file);
  const problems = await sizeProblems(path, size);
  report(`${file}  ${size}x${size}`, problems);
}

// Google's icon: a rounded tile, so its corners are see-through.
async function checkGoogleIcon(file, size) {
  const path = at(file);
  const problems = await sizeProblems(path, size);
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (data[3] !== 0) problems.push("top-left corner isn't transparent (expected a rounded tile)");
  const middle = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  if (data[middle + 3] !== 255) problems.push("the middle isn't opaque");
  report(`${file}  ${size}x${size}, rounded tile`, problems);
}

// Android paints the badge from its alpha alone, so an opaque badge shows as
// a solid white square. Anti-aliased edges are white at partial alpha.
async function checkBadge(file, size) {
  const path = at(file);
  const problems = await sizeProblems(path, size);
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let drawn = 0;
  let offWhite = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] === 0) continue;
    drawn += 1;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 250) offWhite += 1;
  }
  if (data[3] !== 0) problems.push("top-left corner isn't transparent");
  if (drawn === 0) problems.push("nothing drawn");
  if (offWhite > 0) problems.push(`${offWhite} drawn pixels aren't white`);
  report(`${file}  ${size}x${size}, white on transparent`, problems);
}

// An .ico is a 6-byte header, then one 16-byte entry per picture (a width of
// 0 means 256). Browsers pick the size they need, so all three must be there.
function checkIco(file, sizes) {
  const buf = readFileSync(at(file));
  const problems = [];
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    problems.push("not an .ico file");
  } else {
    const count = buf.readUInt16LE(4);
    const have = [];
    for (let i = 0; i < count; i += 1) have.push(buf[6 + 16 * i] || 256);
    const missing = sizes.filter((size) => !have.includes(size));
    if (missing.length > 0) problems.push(`no ${missing.join(", ")} px picture inside (has ${have.join(", ")})`);
  }
  report(`${file}  holds ${sizes.join(", ")} px`, problems);
}

// The tab icon must be the small "v." file, never the 1024 master: Next
// serves src/app/icon.svg as /icon.svg, and the whole word can't be read at
// 16 px.
function checkTabSvg(file) {
  const svg = readFileSync(at(file), "utf8");
  const problems = [];
  if (!/viewBox="0 0 64 64"/.test(svg)) problems.push('expected the 64-unit "v." tab icon, not the master');
  if (/<(?:image|text|script)\b|\bhref=/i.test(svg)) problems.push("has a picture, text, script or link inside");
  report(`${file}  the "v." tab icon`, problems);
}

function checkTwins([a, b]) {
  const same = Buffer.compare(readFileSync(at(a)), readFileSync(at(b))) === 0;
  report(`${a} and ${b} are the same file`, same ? [] : ["they differ: copy one over the other"]);
}

// ---- main ---------------------------------------------------------------------

if (WRITE) {
  for (const { file, size, source } of DRAWN) {
    writeFileSync(at(file), await draw(source, size));
    console.log(`wrote ${file}`);
  }
}

for (const icon of DRAWN) await checkDrawn(icon);
await checkGoogleIcon("src/app/icon.png", 192);
await checkTile("public/favicon-48.png", 48);
checkIco("src/app/favicon.ico", [16, 32, 48]);
checkTabSvg("src/app/icon.svg");
await checkBadge("public/icons/badge-mono-96.png", 96);
for (const pair of TWINS) checkTwins(pair);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed${WRITE ? "" : " (check only; nothing written)"}`);
if (failed > 0) process.exitCode = 1;
