// Shared Playwright setup: signed-in seed cookie, every write stubbed in the
// browser (no database writes), dev badge hidden.
import { chromium } from "/Users/franciscocazares/.claude/skills/gstack/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const DIR = "/private/tmp/claude-501/-Users-franciscocazares-vibe/76ffacf4-23bb-4896-88fa-d5279cec7dfd/scratchpad/feed";

export async function open({ who = "blake", mobile = true, injectReposters = false } = {}) {
  const cookieStr = fs.readFileSync(`${DIR}/${who}.cookie`, "utf8").trim();
  const cookies = cookieStr.split("; ").map((kv) => {
    const i = kv.indexOf("=");
    return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: "localhost", path: "/" };
  });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        }
      : { viewport: { width: 1440, height: 900 } },
  );
  await ctx.addCookies(cookies);
  const log = [];
  // Simulated server truth for likes / saves / reposts (the real writes are stubbed).
  const sim = { liked: new Map(), saved: new Map(), reposted: new Map() };
  const writeRe = /\/api\/posts\/([0-9a-f-]{36})\/(like|save|repost)$/;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      const w = url.match(writeRe);
      if (w) {
        const key = w[2] === "like" ? "liked" : w[2] === "save" ? "saved" : "reposted";
        sim[key].set(w[1], m === "POST");
      }
      log.push(`STUB ${m} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, counted: false }) });
    }
    // The single-post read reflects the simulated writes, like the real server would.
    const single = url.match(/\/api\/posts\/([0-9a-f-]{36})(\?.*)?$/);
    if (single && m === "GET") {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      if (j && j.viewer) {
        const id = single[1];
        if (sim.liked.has(id)) {
          const was = j.viewer.liked;
          j.viewer.liked = sim.liked.get(id);
          if (j.counts && was !== j.viewer.liked) j.counts.likes += j.viewer.liked ? 1 : -1;
        }
        if (sim.saved.has(id)) j.viewer.saved = sim.saved.get(id);
      }
      return route.fulfill({ response: resp, body: JSON.stringify(j) });
    }
    if (injectReposters && /\/api\/feed(\?|$)/.test(url) && m === "GET") {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      if (j && Array.isArray(j.feed)) {
        const people = [
          { id: "11111111-1111-4111-8111-111111111111", name: "Maya Okafor", handle: "mayaokafor", avatar_url: null },
          { id: "22222222-2222-4222-8222-222222222222", name: "Jonah Reyes", handle: "jonahreyes", avatar_url: null },
          { id: "33333333-3333-4333-8333-333333333333", name: "Hana Sato", handle: "hanasato", avatar_url: null },
        ];
        j.feed.forEach((e, i) => {
          if (i === 0) { e.post.friend_reposters = people.slice(0, 1); e.post.friend_reposter_count = 1; }
          if (i === 1) { e.post.friend_reposters = people; e.post.friend_reposter_count = 7; }
          if (i === 2) { e.post.friend_reposters = people.slice(0, 2); e.post.friend_reposter_count = 2; }
        });
        log.push("INJECTED friend_reposters into first 3 feed posts");
      }
      return route.fulfill({ response: resp, body: JSON.stringify(j) });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log.push(`PAGEERROR ${e.message}`));
  return { browser, ctx, page, log, sim };
}

export async function hideBadge(page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
}
