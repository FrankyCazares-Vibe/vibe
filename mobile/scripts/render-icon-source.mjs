#!/usr/bin/env node
/**
 * Render the store apps' icon and splash sources from the one vector logo,
 * src/app/icon.svg, into mobile/resources/. `npm run icons` runs this, then
 * @capacitor/assets turns these files into every size Xcode and Android need.
 *
 *   icon-only.png        1024  the iPhone icon: the website's icon, opaque
 *   icon-foreground.png  1024  Android adaptive icon, art on transparent
 *   icon-background.png  1024  Android adaptive icon, plain white
 *   splash.png           2732  the launch screen: the mark on cream
 *   store/play-icon-512.png    the Play listing's hi-res icon
 *
 * App Store Connect refuses an app icon with an alpha channel, so every
 * opaque file is flattened AND written without an alpha channel at all, and
 * the checks at the end read each file back. The white square is the same as
 * the web icons' (scripts/gen-pwa-icons.mjs), so the home screen looks the
 * same whether Vibe came from the App Store or from Safari.
 *
 * sharp comes from the website's own dependencies (the repo root), not from
 * @capacitor/assets' older copy, so both icon scripts draw with one renderer.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(MOBILE, "..");
const sharp = createRequire(resolve(ROOT, "package.json"))("sharp");

const SOURCE = resolve(ROOT, "src/app/icon.svg");
const OUT = resolve(MOBILE, "resources");

const WHITE = "#FFFFFF";
const CREAM = "#FAF7F2";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// The splash mark's width as a share of the 2732 square. Android crops the
// square to each portrait and landscape screen, so the mark has to fit inside
// the narrowest crop (two thirds of the square) with room to spare.
const SPLASH_SIZE = 2732;
const SPLASH_MARK = 560;

// The only <rect> in icon.svg is its full-bleed white background.
function withoutBackground(svg) {
  const stripped = svg.replace(/<rect\b[^>]*\/>\s*/i, "");
  if (stripped === svg || /<rect\b/i.test(stripped)) {
    throw new Error("icon.svg: expected exactly one background <rect>. Has the file changed?");
  }
  return stripped;
}

async function opaque(svg, size, file) {
  await sharp(Buffer.from(svg))
    .flatten({ background: WHITE })
    .resize(size, size)
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, file));
}

async function foreground(svg, size, file) {
  // Same frame as icon.svg (no trim), so Android's adaptive-icon inset puts
  // the art exactly where the web's maskable icon has it.
  await sharp(Buffer.from(withoutBackground(svg)))
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, file));
}

async function background(size, file) {
  await sharp({ create: { width: size, height: size, channels: 3, background: WHITE } })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, file));
}

async function splash(svg, file) {
  // The mark alone (ring, dot and V), trimmed to its own edges and centred on
  // the site's cream, like the offline page.
  const mark = await sharp(Buffer.from(withoutBackground(svg)))
    .trim()
    .resize(SPLASH_MARK, SPLASH_MARK, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
  await sharp({ create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 3, background: CREAM } })
    .composite([{ input: mark, gravity: "center" }])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, file));
}

// Read every file back rather than trusting the pipeline.
async function check({ file, size, alpha }) {
  const path = resolve(OUT, file);
  const meta = await sharp(path).metadata();
  const problems = [];
  if (meta.width !== size || meta.height !== size) {
    problems.push(`expected ${size}x${size}, got ${meta.width}x${meta.height}`);
  }
  if (!alpha && meta.hasAlpha) problems.push("has an alpha channel");
  if (alpha && !meta.hasAlpha) problems.push("should be transparent around the art");
  const where = relative(MOBILE, path);
  if (problems.length === 0) {
    console.log(`ok    ${where}  ${meta.width}x${meta.height}  ${alpha ? "transparent" : "opaque, no alpha"}`);
    return true;
  }
  console.log(`FAIL  ${where}  ${problems.join("; ")}`);
  return false;
}

const OUTPUTS = [
  { file: "icon-only.png", size: 1024, alpha: false, draw: (svg) => opaque(svg, 1024, "icon-only.png") },
  { file: "icon-foreground.png", size: 1024, alpha: true, draw: (svg) => foreground(svg, 1024, "icon-foreground.png") },
  { file: "icon-background.png", size: 1024, alpha: false, draw: () => background(1024, "icon-background.png") },
  { file: "splash.png", size: SPLASH_SIZE, alpha: false, draw: (svg) => splash(svg, "splash.png") },
  { file: "store/play-icon-512.png", size: 512, alpha: false, draw: (svg) => opaque(svg, 512, "store/play-icon-512.png") },
];

const svg = readFileSync(SOURCE, "utf8");
mkdirSync(resolve(OUT, "store"), { recursive: true });
for (const output of OUTPUTS) await output.draw(svg);

let allGood = true;
for (const output of OUTPUTS) {
  if (!(await check(output))) allGood = false;
}
if (!allGood) process.exitCode = 1;
