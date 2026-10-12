/**
 * Tests for the page-open tally's pure rules (`open.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/tally/open.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const specifier = "./open.ts";
const {
  carriesSignInCookie,
  cleanTallyLabel,
  isAutomatedBrowserName,
  isTallyPage,
  openBeaconBody,
  readOpenBody,
  TALLY_BODY_MAX_CHARS,
  TALLY_OPEN_PATH,
  TALLY_PAGE_PATHS,
  TALLY_PAGES,
} = (await import(specifier)) as typeof import("./open");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

test("three pages are counted, by fixed names, and nothing else is a page", () => {
  assert.deepEqual([...TALLY_PAGES], ["home", "waitlist", "signup"]);
  assert.deepEqual(TALLY_PAGE_PATHS, { home: "/", waitlist: "/waitlist", signup: "/auth/signup" });
  for (const page of TALLY_PAGES) assert.equal(isTallyPage(page), true, page);
  for (const not of ["", "/", "Home", "campus", "home ", null, undefined, 1, {}, ["home"]]) {
    assert.equal(isTallyPage(not), false, String(not));
  }
});

test("a label is kept only as a short plain tag: lowercase letters, digits, dashes, 32 at most", () => {
  assert.equal(cleanTallyLabel("landing"), "landing");
  assert.equal(cleanTallyLabel("ig-vibe"), "ig-vibe");
  assert.equal(cleanTallyLabel("flyer-2026-10"), "flyer-2026-10");
  // Trimmed and lowercased first, the way the waitlist reads the same ?src=.
  assert.equal(cleanTallyLabel("  IG-Vibe "), "ig-vibe");
  assert.equal(cleanTallyLabel("a".repeat(32)), "a".repeat(32));
});

test("anything else is stored as no label, whole: never cut to fit, never free text", () => {
  for (const bad of [
    "",
    " ",
    "a".repeat(33),
    "ig_vibe",
    "ig vibe",
    "someone@iu.edu",
    "https://example.com",
    "<script>",
    "ünï",
    "a/b",
    "a.b",
    null,
    undefined,
    7,
    ["landing"],
    { src: "landing" },
  ]) {
    assert.equal(cleanTallyLabel(bad), "", String(bad));
  }
});

test("a sign-in cookie is spotted by its name alone, chunked or not", () => {
  assert.equal(carriesSignInCookie("sb-abcdefghij-auth-token=base64-xyz"), true);
  assert.equal(carriesSignInCookie("theme=night; sb-abcdefghij-auth-token.0=aaa; sb-abcdefghij-auth-token.1=bbb"), true);
  assert.equal(carriesSignInCookie("sb-127-auth-token=x"), true);
  assert.equal(carriesSignInCookie(" sb-localhost-auth-token = x "), true);
});

test("no cookie, other cookies, and the mid-sign-up verifier are not a sign-in", () => {
  assert.equal(carriesSignInCookie(null), false);
  assert.equal(carriesSignInCookie(undefined), false);
  assert.equal(carriesSignInCookie(""), false);
  assert.equal(carriesSignInCookie("theme=night; vibe_seen=1"), false);
  assert.equal(carriesSignInCookie("sb-abcdefghij-auth-token-code-verifier=abc"), false);
  // A value that merely contains the name is not the cookie.
  assert.equal(carriesSignInCookie("note=sb-abcdefghij-auth-token"), false);
  assert.equal(carriesSignInCookie("xsb-abc-auth-token=1"), false);
});

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test("a person's browser is counted, the apps' own browsers included", () => {
  for (const person of [
    IPHONE_SAFARI,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    // Where most teaser links are tapped: Instagram's, Snapchat's and TikTok's in-app browsers.
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,2; iOS 18_5; en_US; en; scale=3.00; 1179x2556; 770123456)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.50.0.40 (like Safari/8621.2.5.10.10, panda)",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 musical_ly_2023800040 BytedanceWebview/d8a21c6",
    // A phone whose model name holds the letters "bot" is still a person.
    "Mozilla/5.0 (Linux; Android 13; CUBOT NOTE 20 Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  ]) {
    assert.equal(isAutomatedBrowserName(person), false, person);
  }
});

test("a tool that says what it is isn't counted: crawlers, headless Chrome, speed tests", () => {
  for (const tool of [
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; GoogleOther)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  ]) {
    assert.equal(isAutomatedBrowserName(tool), true, tool);
  }
});

test("no name, or a name no browser has, isn't counted: every browser starts Mozilla/", () => {
  for (const notABrowser of [
    null,
    undefined,
    "",
    "   ",
    "curl/8.7.1",
    "python-requests/2.32.3",
    "node",
    "Go-http-client/2.0",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "vercel-screenshot/1.0",
  ]) {
    assert.equal(isAutomatedBrowserName(notABrowser), true, String(notABrowser));
  }
  assert.equal(isAutomatedBrowserName(`  ${IPHONE_SAFARI}  `), false);
});

test("the route skips a bot before the answer, and never passes the name on", () => {
  const route = readRoot("src/app/api/tally/open/route.ts");
  // Next's list of known bots and ours, both asked.
  assert.ok(route.includes("userAgent(req).isBot || isAutomatedBrowserName(req.headers.get(\"user-agent\"))"));
  assert.ok(route.includes("ours && !signedIn && !automated ? readOpenBody(text) : null"));
  // The background step is handed the open and the network's scrambled code
  // for the day (network-code.ts), never the address itself, and the only
  // header read by name besides is the cookie.
  assert.ok(route.includes("after(() => countOpen(open, networkCode))"));
  assert.equal(/rateLimit\(`[^`]*\$\{network\}/.test(route), false, "no limiter key holds the address");
  assert.equal(route.split("clientNetworkKey(req)").length - 1, 1, "the address is read once, to be scrambled");
  assert.equal(route.split("user-agent").length - 1, 1, "the name is read in one place");
  assert.equal(/console\.(?:log|warn|error)\([^)]*(?:automated|userAgent|user-agent)/.test(route), false);
});

test("a beacon post is read as a page and a cleaned label", () => {
  assert.deepEqual(readOpenBody('{"page":"home","src":"ig-vibe"}'), { page: "home", label: "ig-vibe" });
  assert.deepEqual(readOpenBody('{"page":"waitlist","src":"landing"}'), { page: "waitlist", label: "landing" });
  assert.deepEqual(readOpenBody('{"page":"signup"}'), { page: "signup", label: "" });
  // A label that isn't a plain tag: the open still counts, under no label.
  assert.deepEqual(readOpenBody('{"page":"home","src":"someone@iu.edu"}'), { page: "home", label: "" });
  assert.deepEqual(readOpenBody('{"page":"home","src":42}'), { page: "home", label: "" });
});

test("a post that isn't ours asks for nothing", () => {
  for (const bad of [
    null,
    undefined,
    "",
    "home",
    "{",
    "null",
    "[]",
    '"home"',
    '{"page":"campus"}',
    '{"page":"/"}',
    '{"src":"landing"}',
    '{"page":["home"]}',
    `{"page":"home","src":"${"a".repeat(TALLY_BODY_MAX_CHARS)}"}`,
  ]) {
    assert.equal(readOpenBody(bad), null, String(bad));
  }
});

test("the beacon sends the page and the ?src= of the address it loaded on, already cleaned", () => {
  assert.equal(openBeaconBody("home", "?src=ig-vibe"), '{"page":"home","src":"ig-vibe"}');
  assert.equal(openBeaconBody("waitlist", "?officer=1&src=club"), '{"page":"waitlist","src":"club"}');
  assert.equal(openBeaconBody("signup", ""), '{"page":"signup","src":""}');
  // The access code in an invite link never leaves the page: only `src` is read.
  assert.equal(openBeaconBody("signup", "?access_code=VIBE-7KQ2-9XMP"), '{"page":"signup","src":""}');
  assert.equal(openBeaconBody("home", "?src=someone%40iu.edu"), '{"page":"home","src":""}');
  // Whatever the beacon sends, the route reads back the same thing.
  assert.deepEqual(readOpenBody(openBeaconBody("home", "?src=IG-Vibe")), { page: "home", label: "ig-vibe" });
  assert.ok(openBeaconBody("signup", `?src=${"a".repeat(32)}`).length <= TALLY_BODY_MAX_CHARS);
});

test("the route lives where the beacon posts", () => {
  assert.equal(TALLY_OPEN_PATH, "/api/tally/open");
  assert.ok(readRoot("src/app/api/tally/open/route.ts").includes("export async function POST"));
});

test("the database keeps the same shapes: the three page names and the label rule", () => {
  const sql = readRoot("supabase/migrations/20261012180000_page_open_tally.sql");
  assert.ok(sql.includes("check (page in ('home', 'waitlist', 'signup'))"));
  assert.ok(sql.includes("check (label ~ '^[a-z0-9-]{0,32}$')"));
  assert.ok(sql.includes("p_page not in ('home', 'waitlist', 'signup')"));
});
