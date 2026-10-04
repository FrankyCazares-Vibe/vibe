// Browser walk on the LOCAL stack. Usage: node walk.mjs <who> <w> <h> <dark|light> '<json steps>'
// steps: {"goto":"/messages"} {"shot":"name"} {"click":"css or text=..."} {"frameClick":"css"} {"wait":800} {"key":"Escape"} {"back":1}
// {"eval":"js expr"} {"type":"text"} {"hover":"css"}
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.claude/skills/gstack/node_modules/playwright-core");
const [who = "franky", w = "1440", h = "900", scheme = "dark", stepsJson = "[]"] = process.argv.slice(2);
const BASE = process.env.WALK_BASE || "http://localhost:3104";
const out = new URL("./", import.meta.url).pathname;
const raw = execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" });
const cookies = raw.split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/" }; });
const browser = await chromium.launch({ headless: true });
const mobile = Number(w) < 900;
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, colorScheme: scheme, hasTouch: mobile, isMobile: mobile });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
page.on("response", (r) => { if (r.status() >= 400 && !/favicon|_next\/static|sentry/.test(r.url())) errors.push(`http ${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 120)}`); });
for (const s of JSON.parse(stepsJson)) {
  try {
    if (s.goto) { await page.goto(BASE + s.goto, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForTimeout(s.wait ?? 5000); }
    else if (s.shot) { await page.screenshot({ path: out + s.shot + ".png" }); console.log("shot", s.shot, "| url", page.url().replace(BASE, "")); }
    else if (s.click) { await page.locator(s.click).first().click({ timeout: 6000 }); await page.waitForTimeout(s.wait ?? 1500); console.log("clicked", s.click); }
    else if (s.dblclick) { await page.locator(s.dblclick).first().dblclick({ timeout: 6000 }); await page.waitForTimeout(s.wait ?? 1500); console.log("dblclicked", s.dblclick); }
    else if (s.hover) { await page.locator(s.hover).first().hover({ timeout: 6000 }); await page.waitForTimeout(s.wait ?? 600); console.log("hovered", s.hover); }
    else if (s.frameClick) { const f = page.frames().find((x) => /messages\.html/.test(x.url())); if (!f) { console.log("NO FRAME for", s.frameClick); } else { await f.locator(s.frameClick).first().click({ timeout: 6000 }); await page.waitForTimeout(s.wait ?? 1200); console.log("frame clicked", s.frameClick); } }
    else if (s.frameEval) { const f = page.frames().find((x) => /messages\.html/.test(x.url())); console.log("frameEval:", f ? JSON.stringify(await f.evaluate(s.frameEval)).slice(0, 900) : "NO FRAME"); }
    else if (s.key) { await page.keyboard.press(s.key); await page.waitForTimeout(s.wait ?? 800); console.log("key", s.key); }
    else if (s.type) { await page.keyboard.type(s.type, { delay: 20 }); await page.waitForTimeout(s.wait ?? 600); }
    else if (s.back) { await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(s.wait ?? 1500); console.log("back -> url", page.url().replace(BASE, "")); }
    else if (s.eval) { console.log("eval:", JSON.stringify(await page.evaluate(s.eval)).slice(0, 1200)); }
    else if (s.wait) { await page.waitForTimeout(s.wait); }
  } catch (e) { console.log("STEP FAILED", JSON.stringify(s).slice(0, 120), "->", String(e).split("\n")[0].slice(0, 200)); }
}
console.log("errors:", errors.length ? "\n  " + [...new Set(errors)].slice(0, 25).join("\n  ") : "none");
await browser.close();
