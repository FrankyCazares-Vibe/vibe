// Screenshot the REAL app on the local stack (demo cast, local data only), for reference while designing.
// Usage: node shot.mjs <name> <path> [w=1440] [h=900] [dark|light] [click text 1] [click text 2] ...
//   node shot.mjs phone-club /messages 390 844 dark "Chess Club"
// Signed in as the demo lead (franky@example.test). The server at :3102 has the new chat ON for everyone,
// and width < 900 shows the phone app. Each "click text" is clicked in order (main page, then any iframe).
// READ-ONLY: every non-GET request is blocked, so nothing can be sent or changed.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.claude/skills/gstack/node_modules/playwright-core");
const [name, url, w = "1440", h = "900", scheme = "dark", ...clicks] = process.argv.slice(2);
if (!name || !url) { console.error("usage: node shot.mjs <name> <path> [w] [h] [dark|light] [click text...]"); process.exit(2); }
const BASE = "http://localhost:3102";
const raw = execSync("node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs franky", { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = raw.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, colorScheme: scheme, deviceScaleFactor: Number(w) < 900 ? 2 : 1, hasTouch: Number(w) < 900, isMobile: Number(w) < 900 });
await ctx.addCookies(cookies);
await ctx.route("**/*", (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (req.method() !== "GET" && req.method() !== "HEAD" && req.method() !== "OPTIONS" && !(local && /\/auth\/v1\/token/.test(u.pathname))) return route.abort();
  return route.continue();
});
const page = await ctx.newPage();
await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
for (const text of clicks) {
  let done = false;
  for (const f of page.frames()) {
    const loc = f.getByText(text, { exact: false }).first();
    if (await loc.count().catch(() => 0)) { await loc.click({ timeout: 5000 }).then(() => { done = true; }).catch(() => {}); if (done) break; }
  }
  console.log(done ? `clicked "${text}"` : `could not find "${text}"`);
  await page.waitForTimeout(3000);
}
const out = new URL("./ref/" + name + ".png", import.meta.url).pathname;
await page.screenshot({ path: out });
console.log("saved", out, "at", page.url());
await browser.close();
