// LOCAL STACK ONLY: a dev server on :3100 started from the checkout under test (.env.development.local -> 127.0.0.1:54321).
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const PW = "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
export const { chromium } = await import(PW);
export const BASE = "http://localhost:3100";
export const SHOTS = "/Users/franciscocazares/vibe/handoffs/2026-10-19-critique/shots";
mkdirSync(SHOTS, { recursive: true });
const cookieCache = new Map();
export function cookieHeader(who) {
  if (!cookieCache.has(who)) {
    cookieCache.set(who, execSync(`node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs ${who}`, { cwd: "/Users/franciscocazares/vibe", encoding: "utf8" }));
  }
  return cookieCache.get(who);
}
export function cookiesFor(who) {
  return cookieHeader(who).split("; ").map((p) => { const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }; });
}
export async function api(who, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { cookie: cookieHeader(who), "content-type": "application/json", origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
export async function ctx(browser, who, { phone, dark }) {
  const c = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    userAgent: phone ? IPHONE_UA : undefined,
    isMobile: !!phone, hasTouch: !!phone, deviceScaleFactor: phone ? 2 : 1,
    colorScheme: dark ? "dark" : "light",
  });
  await c.addCookies(cookiesFor(who));
  await c.addInitScript(() => {
    const css = "nextjs-portal{display:none!important}";
    const add = () => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
  });
  return c;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, ms = 15000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return Date.now() - t0;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
