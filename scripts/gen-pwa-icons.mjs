#!/usr/bin/env node
/**
 * Render the installable app's icons from the one vector logo. Session 65,
 * PWA wave 1.
 *
 *   node scripts/gen-pwa-icons.mjs
 *
 * Writes five PNGs into public/icons/, then reads each one back and prints
 * its pixel size. Exits 1 if any of them isn't what the manifest promises.
 *
 *   icon-192.png, icon-512.png           manifest purpose "any"
 *   maskable-192.png, maskable-512.png   manifest purpose "maskable"
 *   badge-mono-96.png                    the Android notification badge (wave 2)
 *
 * Chrome won't offer Install without a 192 AND a 512 icon, and until now we
 * only had a 192 (src/app/icon.png). The logo in src/app/icon.svg already
 * sits inside the maskable safe zone (it reaches 0.68 of the half-width; the
 * limit is 0.8) on a full-bleed white square, so "any" and "maskable" are the
 * same art on the same white. They're still separate files because the
 * manifest lists them as separate entries: web.dev says never to mark one
 * file "any maskable".
 *
 * The badge is different. Android draws it from the alpha channel alone, as a
 * silhouette in the status bar, so every fill and stroke becomes white, the
 * white background square is dropped, and the art is cropped to its own edges
 * so it fills the 96px square instead of floating in the middle two-thirds.
 *
 * Idempotent. Re-run after any change to icon.svg and commit the PNGs. Get
 * them right before testers install: an installed Android app only picks up
 * new icons when Chrome re-mints it, and desktop Chrome never does.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "src/app/icon.svg");
const OUT_DIR = resolve(ROOT, "public/icons");

const WHITE = "#FFFFFF";
const TRANSPARENT = { r: 255, g: 255, b: 255, alpha: 0 };

const BADGE_SIZE = 96;
// Breathing room around the badge art, per side. Android masks the badge to
// a 24dp status-bar slot, so the silhouette should nearly fill the square.
const BADGE_PAD = 4;

// ---- colour icons (any + maskable) ------------------------------------------

// librsvg rasterises the SVG at its own 1254px (width="1254" at 72 dpi) and
// sharp downsamples from there, which keeps the thin ring smooth at 192.
// flatten() onto white is belt and braces: a maskable icon must have no
// transparent pixel anywhere, even if the background rect ever goes away.
async function renderColour(svg, size, file) {
  await sharp(Buffer.from(svg))
    .flatten({ background: WHITE })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT_DIR, file));
}

// ---- monochrome badge -------------------------------------------------------

// Rewrite the logo as white on nothing. Throws if icon.svg has changed shape
// in a way the rewrite doesn't understand, rather than shipping a badge with
// a stray colour or a solid square in it.
function toMonochrome(svg) {
  // The only <rect> is the full-bleed background square.
  const noBackground = svg.replace(/<rect\b[^>]*\/>\s*/i, "");
  if (noBackground === svg) {
    throw new Error("icon.svg: no background <rect> to drop. Has the file changed?");
  }
  if (/<rect\b/i.test(noBackground)) {
    throw new Error("icon.svg: more than one <rect>. Which one is the background?");
  }
  // Every painted colour becomes white. fill="none" isn't a hex colour, so the
  // ring keeps its hollow middle.
  const white = noBackground.replace(/\b(fill|stroke)="#[0-9a-f]{3,8}"/gi, `$1="${WHITE}"`);
  const leftover = (white.match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter(
    (c) => c.toUpperCase() !== WHITE,
  );
  if (leftover.length > 0) {
    throw new Error(`icon.svg: colours the rewrite missed: ${leftover.join(", ")}`);
  }
  return white;
}

async function renderBadge(svg, file) {
  // trim() cuts away the transparent margin (it matches the top-left pixel),
  // leaving just the ring, dot and V; contain + extend centre them with padding.
  const art = await sharp(Buffer.from(toMonochrome(svg))).trim().png().toBuffer();
  const inner = BADGE_SIZE - 2 * BADGE_PAD;
  await sharp(art)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({
      top: BADGE_PAD,
      bottom: BADGE_PAD,
      left: BADGE_PAD,
      right: BADGE_PAD,
      background: TRANSPARENT,
    })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT_DIR, file));
}

// ---- check what was written ---------------------------------------------------

// Read each file back rather than trusting the pipeline: the manifest and
// scripts/check-pwa.mjs promise these exact sizes, and a maskable icon with a
// see-through pixel shows the launcher's backdrop through it.
async function check({ file, size, kind }) {
  const path = resolve(OUT_DIR, file);
  const meta = await sharp(path).metadata();
  const problems = [];
  if (meta.width !== size || meta.height !== size) {
    problems.push(`expected ${size}x${size}, got ${meta.width}x${meta.height}`);
  }
  if (kind === "colour") {
    const { isOpaque } = await sharp(path).stats();
    if (!isOpaque) problems.push("has transparent pixels");
  } else {
    // Badge: transparent corners, something drawn, and everything drawn is
    // white (anti-aliased edges are white at partial alpha, not grey).
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
  }
  const label = kind === "colour" ? "opaque" : "white on transparent";
  const where = relative(ROOT, path);
  if (problems.length === 0) {
    console.log(`ok    ${where}  ${meta.width}x${meta.height}  ${label}`);
    return true;
  }
  console.log(`FAIL  ${where}  ${problems.join("; ")}`);
  return false;
}

// ---- main -------------------------------------------------------------------

const OUTPUTS = [
  { file: "icon-192.png", size: 192, kind: "colour" },
  { file: "icon-512.png", size: 512, kind: "colour" },
  { file: "maskable-192.png", size: 192, kind: "colour" },
  { file: "maskable-512.png", size: 512, kind: "colour" },
  { file: "badge-mono-96.png", size: BADGE_SIZE, kind: "badge" },
];

const svg = readFileSync(SOURCE, "utf8");
mkdirSync(OUT_DIR, { recursive: true });

for (const { file, size, kind } of OUTPUTS) {
  if (kind === "colour") await renderColour(svg, size, file);
  else await renderBadge(svg, file);
}

let allGood = true;
for (const output of OUTPUTS) {
  if (!(await check(output))) allGood = false;
}
if (!allGood) process.exitCode = 1;
