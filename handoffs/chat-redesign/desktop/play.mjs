// Check an INTERACTIVE board: screenshot, click things in order, screenshot after each click.
// Usage: node play.mjs <Board.dc.html> <W> <H> "<css selector or text=Visible text>" ["<next>" ...]
// Writes shots/<Board>.step0.png, .step1.png, ... and prints what each click hit.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.claude/skills/gstack/node_modules/playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const [name, w = "1440", h = "900", ...steps] = process.argv.slice(2);
if (!name) { console.error('usage: node play.mjs <Board.dc.html> <W> <H> "<selector>" ...'); process.exit(2); }
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pathToFileURL(path.join(here, "project", name)).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(500);
const base = path.join(here, "shots", name.replace(/\.dc\.html$/, ""));
await page.screenshot({ path: base + ".step0.png" });
let i = 0;
for (const s of steps) {
  i++;
  const loc = page.locator(s).first();
  const n = await loc.count();
  if (!n) { console.log(`step ${i}: NOTHING matches ${s}`); continue; }
  const before = await page.evaluate(() => document.body.innerText.length + ":" + document.querySelectorAll("*").length);
  await loc.click({ timeout: 4000 }).catch((e) => console.log(`step ${i}: click failed: ${String(e).slice(0, 120)}`));
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => document.body.innerText.length + ":" + document.querySelectorAll("*").length);
  await page.screenshot({ path: base + `.step${i}.png` });
  console.log(`step ${i}: clicked ${s}; page ${before === after ? "did NOT change (text and element counts equal; check the picture)" : "changed"}; saved ${base}.step${i}.png`);
}
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
