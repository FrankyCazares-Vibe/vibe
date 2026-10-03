// Encodes the frames stills.sh cut into the landing's web stills: AVIF and
// WebP at two widths, and one JPEG for a browser with neither.
//   node scripts/demo-video/stills.mjs <frames-folder> <out-folder>
import path from "node:path";

import sharp from "sharp";

const [from, out] = process.argv.slice(2);
if (!from || !out) {
  console.error("Usage: node scripts/demo-video/stills.mjs <frames-folder> <out-folder>");
  process.exit(2);
}
const jobs = [];
const enc = (name, w, kinds) => {
  const base = sharp(path.join(from, `${name}.png`)).resize({ width: w, kernel: "lanczos3" });
  const to = (ext) => path.join(out, `${name}-${w}.${ext}`);
  if (kinds.includes("avif")) jobs.push(base.clone().avif({ quality: 52, effort: 7 }).toFile(to("avif")));
  if (kinds.includes("webp")) jobs.push(base.clone().webp({ quality: 78, effort: 6, smartSubsample: true }).toFile(to("webp")));
  if (kinds.includes("jpg")) jobs.push(base.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(to("jpg")));
};
for (const name of ["still-orgs", "still-events", "still-dm"]) {
  enc(name, 480, ["avif", "webp"]);
  enc(name, 960, ["avif", "webp"]);
  enc(name, 720, ["jpg"]);
}
enc("film-poster", 390, ["avif", "webp"]);
enc("film-poster", 780, ["avif", "webp", "jpg"]);
for (const r of await Promise.all(jobs)) console.log(r.format, `${r.width}x${r.height}`, r.size);
