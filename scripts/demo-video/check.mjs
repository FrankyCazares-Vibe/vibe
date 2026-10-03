#!/usr/bin/env node
// check.mjs — does the framed film show the same picture as the master on every frame?
//
//   node scripts/demo-video/check.mjs <master.mp4> <framed 1080x1920.mp4>
//
// The first cut of the framed film repeated every third frame through every scroll (see cut.sh): each of those
// frames showed the picture of the frame before. The master did not, and a look at stills cannot see it. So this
// compares the two films frame by frame: while the master is moving, frame i of the framed film must look like
// frame i of the master, not like frame i-1. A frame that looks more like the one before is "late".
// Both films are read once, shrunk to the phone's 390x844 in grey, side by side. Exit 1 when frames are late.
import { spawn } from "node:child_process";

const [master, framed] = process.argv.slice(2);
if (!master || !framed) { console.error("check: give the master and the framed film"); process.exit(2); }
const W = 390, H = 844;
// The phone screen inside the 1080x1920 canvas (cut.sh: 810 wide, centred).
const SCREEN = "crop=810:1752:135:84";
const ff = spawn("/opt/homebrew/bin/ffmpeg", ["-v", "error", "-i", master, "-i", framed, "-filter_complex",
  `[0:v]scale=${W}:${H}:flags=area,format=gray[m];[1:v]${SCREEN},scale=${W}:${H}:flags=area,format=gray[f];[m][f]hstack`,
  "-f", "rawvideo", "-pix_fmt", "gray", "-"], { stdio: ["ignore", "pipe", "inherit"] });

/** Mean difference, in grey levels, between two pictures (the rounded corners and the border are left out). */
function apart(a, ax, b, bx) {
  let sum = 0, n = 0;
  for (let y = 40; y < H - 40; y += 2) {
    const row = y * 2 * W;
    for (let x = 14; x < W - 14; x += 2) { sum += Math.abs(a[row + ax + x] - b[row + bx + x]); n++; }
  }
  return sum / n;
}

const size = 2 * W * H;
let buf = Buffer.alloc(0), prev = null, frames = 0, moving = 0;
const late = [];
for await (const chunk of ff.stdout) {
  buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
  while (buf.length >= size) {
    const frame = Buffer.from(buf.subarray(0, size));
    buf = buf.subarray(size);
    if (prev) {
      const motion = apart(frame, 0, prev, 0); // the master against its own frame before
      if (motion > 0.6) {
        moving++;
        const now = apart(frame, W, frame, 0); // framed i against master i
        const before = apart(frame, W, prev, 0); // framed i against master i-1
        if (before < now * 0.8) late.push(frames);
      }
    }
    prev = frame;
    frames++;
  }
}
const code = await new Promise((done) => ff.on("close", done));
if (code !== 0 || frames === 0) { console.error("check: ffmpeg could not read the two films"); process.exit(2); }
// A hard cut is one frame of "motion" and can read either way; a real fault is dozens of frames.
if (late.length > 6) {
  console.error(`check: the framed film runs late on ${late.length} of ${moving} moving frames (first at ${(late[0] / 60).toFixed(2)} s). It repeats frames the master does not: look at the fps=60 note in cut.sh.`);
  process.exit(1);
}
console.log(`check: ${frames} frames, ${moving} of them moving; the framed film is late on ${late.length}. In step.`);
