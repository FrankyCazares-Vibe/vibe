// Render .dc.html boards to PNG for a visual check. Usage:
//   node render.mjs <Board.dc.html> [width] [height] [scale]
// Reads project/<Board>, writes shots/<Board>.png (club view board). Size defaults to the
// board's own data-props $preview, else 1440x900.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.claude/skills/gstack/node_modules/playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const [name, wArg, hArg, sArg] = process.argv.slice(2);
if (!name) { console.error("usage: node render.mjs <Board.dc.html> [w] [h] [scale]"); process.exit(2); }
const file = path.join(here, "project", name);
const src = readFileSync(file, "utf8");
const m = src.match(/"\$preview"\s*:\s*\{\s*"width"\s*:\s*(\d+)\s*,\s*"height"\s*:\s*(\d+)/);
const width = Number(wArg) || (m ? Number(m[1]) : 1440);
const height = Number(hArg) || (m ? Number(m[2]) : 900);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(sArg) || 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(500);
const out = path.join(here, "shots", name.replace(/\.dc\.html$/, "") + ".png");
await page.screenshot({ path: out });
// Report anything that spills out of the frame: the canvas clips it.
const spill = await page.evaluate(({ width, height }) => {
  const bad = [];
  for (const el of document.querySelectorAll("x-dc *, body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.children.length === 0) {
      bad.push(`text wider than its box: <${el.tagName.toLowerCase()}> "${(el.textContent || "").trim().slice(0, 40)}"`);
    }
  }
  const root = document.querySelector("x-dc > div, body > div");
  const rr = root ? root.getBoundingClientRect() : null;
  return { root: rr ? { w: Math.round(rr.width), h: Math.round(rr.height) } : null, bad: bad.slice(0, 20), doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }, width, height };
}, { width, height });
console.log(JSON.stringify({ out, width, height, errors: errors.slice(0, 8), spill }, null, 1));
await browser.close();
