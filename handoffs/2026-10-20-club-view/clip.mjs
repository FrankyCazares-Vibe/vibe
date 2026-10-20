// node clip.mjs <Board.dc.html> <w> <h> <y0> <y1> <out.png>: screenshot one band of a board
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.claude/skills/gstack/node_modules/playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const [name, w, h, y0, y1, out] = process.argv.slice(2);
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: +w, height: +h } })).newPage();
await p.goto(pathToFileURL(path.join(here, "project", name)).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts && document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(here, "shots", out), clip: { x: 0, y: +y0, width: +w, height: +y1 - +y0 } });
await b.close();
