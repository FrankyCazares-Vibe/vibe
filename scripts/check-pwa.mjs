#!/usr/bin/env node
// Is the installable app (PWA) wired up? A plain pass/fail list.
//
//   node scripts/check-pwa.mjs                              http://localhost:3000
//   node scripts/check-pwa.mjs https://www.connectvibe.app  the live site
//
// Exit codes: 0 every check passed, 1 at least one failed, 2 bad option.
//
// GET ONLY. Every request is an anonymous GET with no cookie, so this is safe
// to point at production: it writes nothing and signs nobody in. Redirects are
// NOT followed (redirect: "manual"), because a redirect on /sw.js or
// /offline.html is exactly the bug worth seeing: the worker would install the
// suspension notice or a login page as its offline screen.
//
// Locally, run it against `next dev` (the local Supabase copy), never against
// `next start` on this Mac: `next start` reads .env.local, which is the LIVE
// database.
//
// What it checks, in order:
//   1. The proxy matcher in src/proxy.ts (read from disk, no network). The
//      anonymous GETs below pass whether or not the proxy skips a file (no
//      session means no cookie either way), so this is the only check that
//      would notice a matcher typo switching the proxy off for the whole site.
//   2. /manifest.webmanifest: the fields in plan R1, exactly the four icons
//      in R2, the two shortcuts.
//   3. Every icon, decoded with sharp: real pixel size, and no see-through
//      pixels in a maskable icon (the launcher crops it to any shape).
//   4. /sw.js and /offline.html: 200, no redirect, no cookie, cache headers.
//      The offline page must stand alone: only it is cached, so an image,
//      font or stylesheet it asks for is missing exactly when it's shown.
//   5. / and the one static page an anonymous visitor may load: the manifest
//      link and the iOS home-screen tags.
//
// Against the live site this answers "did the deploy carry it". It can't say
// whether a phone installs the app or the worker runs: that's a browser pass.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE = "http://localhost:3000";
// Vibe's own production origin. A link to it from the offline page isn't a
// third-party dependency, even when the page under test is on localhost.
const CANONICAL_ORIGIN = "https://www.connectvibe.app";
// `next dev` compiles a route on its first request, which can take a while.
const TIMEOUT_MS = 60_000;
const USER_AGENT = "vibe-check-pwa/1 (scripts/check-pwa.mjs)";

// Keep in step with src/app/manifest.ts (plan R1, R2 and critic-w1 item 12).
const CREAM = "#FAF7F2";
const EXPECTED_MANIFEST = {
  id: "/",
  name: "Vibe",
  short_name: "Vibe",
  description: "Your campus, your career, one profile.",
  start_url: "/campus",
  scope: "/",
  display: "standalone",
};
const EXPECTED_ICONS = [
  { src: "/icons/icon-192.png", size: 192, purpose: "any" },
  { src: "/icons/icon-512.png", size: 512, purpose: "any" },
  { src: "/icons/maskable-192.png", size: 192, purpose: "maskable" },
  { src: "/icons/maskable-512.png", size: 512, purpose: "maskable" },
];
const EXPECTED_SHORTCUTS = [
  { name: "Messages", url: "/messages" },
  { name: "My profile", url: "/profile" },
];
// The wave-2 notification badge. Not in the manifest on purpose.
const BADGE = { src: "/icons/badge-mono-96.png", size: 96 };

// Paths the proxy must skip, and paths it must still see (critic-w1 item 3).
// The last two pin "exact root file": a nested or longer name is not ours.
const PROXY_SKIPS = ["/sw.js", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"];
const PROXY_RUNS = [
  "/", "/campus", "/api/me", "/html/profile.html", "/html/_sw.js",
  "/account/suspended", "/offline", "/foo/sw.js", "/sw.jsx",
];

// ---------------------------------------------------------------------------
// Results.

const results = [];

function check(label, ok, detail) {
  results.push({ label, ok: Boolean(ok), detail: ok ? "" : detail ?? "" });
  return Boolean(ok);
}

function fail(label, detail) {
  return check(label, false, detail);
}

// ---------------------------------------------------------------------------
// Options.

const USAGE = [
  "Usage: node scripts/check-pwa.mjs [baseUrl]",
  `  baseUrl  where to look (default ${DEFAULT_BASE}), e.g. ${CANONICAL_ORIGIN}`,
];

function usage(code) {
  for (const line of USAGE) {
    if (code) console.error(line);
    else console.log(line);
  }
  process.exit(code);
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) usage(0);
if (args.length > 1) usage(2);

let BASE;
try {
  BASE = new URL(args[0] ?? DEFAULT_BASE);
} catch {
  usage(2);
}
if (BASE.protocol !== "http:" && BASE.protocol !== "https:") usage(2);
if (typeof fetch !== "function") {
  console.error("This needs Node 20 or newer (global fetch).");
  process.exit(2);
}
const ORIGIN = BASE.origin;

// ---------------------------------------------------------------------------
// 1. The proxy matcher, straight from the source file.

function checkProxyMatcher() {
  const file = join(REPO_ROOT, "src", "proxy.ts");
  const sources = [];
  try {
    const text = readFileSync(file, "utf8");
    // Every double-quoted string in the `matcher: [...]` array, in order.
    // JSON.parse turns the TS escapes (`\\.`) into the pattern Next sees.
    const start = text.search(/matcher\s*:\s*\[/);
    if (start < 0) return fail("proxy matcher found in src/proxy.ts", "no `matcher: [` in the file");
    const item = /\s*("(?:[^"\\]|\\.)*")\s*,?/y;
    item.lastIndex = text.indexOf("[", start) + 1;
    for (let m = item.exec(text); m; m = item.exec(text)) sources.push(JSON.parse(m[1]));
    if (!sources.length) return fail("proxy matcher found in src/proxy.ts", "the array holds no plain string");
  } catch (err) {
    return fail("proxy matcher readable", err instanceof Error ? err.message : String(err));
  }

  // Next anchors each entry at both ends; the proxy runs if any entry matches.
  let patterns;
  try {
    patterns = sources.map((source) => new RegExp(`^(?:${source})$`));
  } catch (err) {
    return fail("proxy matcher is a valid pattern", err instanceof Error ? err.message : String(err));
  }
  const proxied = (path) => patterns.some((re) => re.test(path));
  for (const path of PROXY_SKIPS) {
    check(`proxy skips ${path}`, !proxied(path), "the matcher sends it through the proxy");
  }
  for (const path of PROXY_RUNS) {
    check(`proxy still runs on ${path}`, proxied(path), "the matcher skips it (a stray `|` or a missing `$`?)");
  }
  return true;
}

// ---------------------------------------------------------------------------
// HTTP. One anonymous GET per URL, never following a redirect.

async function get(path, { binary = false, accept = "*/*" } = {}) {
  const url = new URL(path, ORIGIN);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept, "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    return { res, body };
  } catch (err) {
    // A refused connection says so in `cause` (ECONNREFUSED), not `message`.
    const why = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
    const hint = why === "ECONNREFUSED" ? " (is `next dev` running there?)" : "";
    fail(`GET ${path}`, `request failed: ${why}${hint}`);
    return null;
  }
}

/** 200 and not a redirect. Everything after it assumes the real file came back. */
function served(label, got) {
  if (!got) return false;
  const { status, headers } = got.res;
  if (status >= 300 && status < 400) {
    return fail(`${label} is not redirected`, `${status} to ${headers.get("location") ?? "(no location)"}`);
  }
  return check(`${label} answers 200`, status === 200, `got ${status}`);
}

/** Cookie NAMES only: a value could be someone's session and never gets printed. */
function noCookie(label, res) {
  const lines = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  const names = lines.map((line) => line.split("=")[0].trim());
  return check(`${label} sets no cookie`, lines.length === 0, `set-cookie: ${names.join(", ")}`);
}

/** `Cache-Control` as a set of directive names, so order and spacing don't matter. */
function cacheDirectives(res) {
  const value = res.headers.get("cache-control") ?? "";
  return new Set(
    value
      .split(",")
      .map((part) => part.split("=")[0].trim().toLowerCase())
      .filter(Boolean),
  );
}

function contentType(res) {
  return (res.headers.get("content-type") ?? "").toLowerCase();
}

// ---------------------------------------------------------------------------
// HTML, read with regexes. Good enough for tags Next and our own files write;
// not a general parser.

/** Attributes of one tag's inner text, names lower-cased. */
function attrsOf(text) {
  const out = {};
  const re = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of text.matchAll(re)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Every `<name ...>` tag in the html, as attribute objects. */
function tagsNamed(html, name) {
  const re = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, "gi");
  return [...html.matchAll(re)].map((m) => attrsOf(m[1]));
}

function relHas(tag, token) {
  return (tag.rel ?? "").toLowerCase().split(/\s+/).includes(token);
}

function metaContent(html, name) {
  return tagsNamed(html, "meta")
    .filter((tag) => (tag.name ?? "").toLowerCase() === name)
    .map((tag) => tag.content ?? "");
}

/** The document head, or the whole thing if there's no `</head>`. */
function headOf(html) {
  const end = html.search(/<\/head>/i);
  return end < 0 ? html : html.slice(0, end);
}

function sameText(a, b) {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

// ---------------------------------------------------------------------------
// 2. The manifest.

async function checkManifest() {
  const path = "/manifest.webmanifest";
  const got = await get(path, { accept: "application/manifest+json" });
  if (!served(path, got)) return;
  noCookie(path, got.res);
  const type = contentType(got.res);
  check(`${path} is application/manifest+json`, type.startsWith("application/manifest+json"), `got "${type}"`);

  let manifest;
  try {
    manifest = JSON.parse(got.body);
  } catch (err) {
    fail(`${path} is JSON`, err instanceof Error ? err.message : String(err));
    return;
  }

  for (const [key, want] of Object.entries(EXPECTED_MANIFEST)) {
    const have = manifest[key];
    check(`manifest ${key} is ${JSON.stringify(want)}`, have === want, `got ${JSON.stringify(have)}`);
  }
  for (const key of ["background_color", "theme_color"]) {
    const have = manifest[key];
    check(`manifest ${key} is ${CREAM}`, sameText(have, CREAM), `got ${JSON.stringify(have)}`);
  }
  // Plan R1 leaves it out, so the installed app turns with the device.
  check("manifest has no orientation", !("orientation" in manifest), `got ${JSON.stringify(manifest.orientation)}`);
  const mode = manifest.launch_handler?.client_mode;
  check(
    'manifest launch_handler.client_mode is ["navigate-existing","auto"]',
    JSON.stringify(mode) === JSON.stringify(["navigate-existing", "auto"]),
    `got ${JSON.stringify(mode)}`,
  );

  // Exactly the four icons, `any` and `maskable` as separate entries (never
  // one "any maskable" file: the padding that suits one ruins the other).
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  check("manifest lists exactly 4 icons", icons.length === 4, `got ${icons.length}`);
  for (const want of EXPECTED_ICONS) {
    const sizes = `${want.size}x${want.size}`;
    const have = icons.find((icon) => icon?.src === want.src);
    const ok = have && have.type === "image/png" && have.sizes === sizes && have.purpose === want.purpose;
    check(
      `manifest icon ${want.src} is ${sizes} image/png purpose "${want.purpose}"`,
      ok,
      have ? `got ${JSON.stringify(have)}` : "missing",
    );
  }
  for (const icon of icons) {
    if (!EXPECTED_ICONS.some((want) => want.src === icon?.src)) {
      fail(`manifest icon ${icon?.src} is expected`, "not one of the four in plan R2");
    }
  }

  const shortcuts = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
  for (const want of EXPECTED_SHORTCUTS) {
    const have = shortcuts.find((shortcut) => shortcut?.url === want.url);
    check(`manifest shortcut "${want.name}" opens ${want.url}`, have?.name === want.name, have ? `named ${JSON.stringify(have.name)}` : "missing");
    const icon = have?.icons?.find?.((i) => i?.src === "/icons/icon-192.png");
    check(
      `manifest shortcut "${want.name}" carries the 192 icon`,
      icon && icon.sizes === "192x192" && icon.type === "image/png",
      icon ? `got ${JSON.stringify(icon)}` : "no /icons/icon-192.png entry",
    );
  }
}

// ---------------------------------------------------------------------------
// 3. The icon files themselves.

async function checkIcon(src, size, { opaque = false, transparent = false } = {}) {
  const got = await get(src, { binary: true, accept: "image/png" });
  if (!served(src, got)) return;
  const type = contentType(got.res);
  check(`${src} is image/png`, type.startsWith("image/png"), `got "${type}"`);

  let meta;
  let stats;
  try {
    const image = sharp(got.body);
    meta = await image.metadata();
    stats = await image.stats();
  } catch (err) {
    fail(`${src} decodes`, err instanceof Error ? err.message : String(err));
    return;
  }
  check(
    `${src} is a ${size}x${size} PNG`,
    meta.format === "png" && meta.width === size && meta.height === size,
    `got ${meta.format} ${meta.width}x${meta.height}`,
  );
  if (opaque) {
    // A launcher crops a maskable icon to a circle, squircle or square. A
    // see-through pixel shows the wallpaper through the logo's background.
    check(`${src} has no see-through pixels`, stats.isOpaque, "some pixels are transparent; plan R2 wants full-bleed white");
  }
  if (transparent) {
    // Android paints a notification badge from its alpha alone, so an opaque
    // badge shows up as a solid white square.
    check(`${src} has a transparent background`, !stats.isOpaque, "every pixel is opaque");
  }
}

async function checkIcons() {
  for (const icon of EXPECTED_ICONS) {
    await checkIcon(icon.src, icon.size, { opaque: icon.purpose === "maskable" });
  }
  await checkIcon(BADGE.src, BADGE.size, { transparent: true });
}

// ---------------------------------------------------------------------------
// 4. The service worker and its offline page.

async function checkServiceWorker() {
  const path = "/sw.js";
  const got = await get(path, { accept: "*/*" });
  if (!served(path, got)) return;
  const { res } = got;
  noCookie(path, res);
  // A worker served with a type the browser can't read never registers. One
  // value only: two header rules would be joined with ", " (critic-w1 14).
  const type = contentType(res);
  check(
    `${path} has one JavaScript content type`,
    !type.includes(",") && /^(?:application|text)\/javascript(?:;|$)/.test(type),
    `got "${type}"`,
  );
  const cache = cacheDirectives(res);
  check(
    `${path} cache-control has no-cache and no-store`,
    cache.has("no-cache") && cache.has("no-store"),
    `got "${res.headers.get("cache-control") ?? ""}"`,
  );
  check(
    `${path} has no content-security-policy`,
    !res.headers.has("content-security-policy"),
    "a CSP on the worker script governs the worker's own fetches (plan R12)",
  );
}

/** Script bodies emptied, so `new URL(...)` or a `<` in code isn't read as CSS or a tag. */
function withoutScriptBodies(html) {
  return html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
}

/** A data: URI, or a `#fragment` inside this same document (SVG `url(#g)`, `<use href="#v">`). */
function isInline(value) {
  return /^\s*(?:data:|#)/i.test(value);
}

function checkSelfContained(label, html) {
  const page = html.replace(/<!--[\s\S]*?-->/g, "");
  const markup = withoutScriptBodies(page);

  // Anything the page would load. Same-origin counts too: only this file is
  // cached, so a same-origin image or font is broken exactly when the page
  // is on screen. A link someone taps (<a href>) is fine.
  const loads = [];
  for (const m of markup.matchAll(/<([a-zA-Z][\w:-]*)(?=[\s/>])([^>]*)>/g)) {
    const tag = m[1].toLowerCase();
    const attrs = attrsOf(m[2]);
    for (const name of ["src", "srcset", "poster", "href", "xlink:href"]) {
      if (!(name in attrs) || isInline(attrs[name])) continue;
      if ((name === "href" || name === "xlink:href") && (tag === "a" || tag === "area")) continue;
      loads.push(`<${tag} ${name}="${attrs[name]}">`);
    }
  }
  for (const m of markup.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!isInline(m[2])) loads.push(`url(${m[2]})`);
  }
  if (/@import\b/i.test(markup)) loads.push("@import");
  check(`${label} loads nothing from the network`, loads.length === 0, loads.slice(0, 5).join(", "));

  // No other origin anywhere, scripts included. Inline SVG's xmlns values
  // look like URLs but are only names, so they're dropped first.
  const names = page.replace(/\sxmlns(?::[\w-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
  const foreign = [];
  for (const m of names.matchAll(/https?:\/\/[^\s"'<>()`\\]+/gi)) {
    let origin = m[0];
    try {
      origin = new URL(m[0]).origin;
    } catch {
      // Not a parseable URL: report it as written.
    }
    if (origin !== ORIGIN && origin !== CANONICAL_ORIGIN) foreign.push(m[0]);
  }
  check(`${label} names no other origin`, foreign.length === 0, foreign.slice(0, 5).join(", "));
}

async function checkOfflinePage() {
  const path = "/offline.html";
  const got = await get(path, { accept: "text/html" });
  if (!served(path, got)) return;
  const { res, body } = got;
  noCookie(path, res);
  const type = contentType(res);
  check(`${path} is text/html`, type.startsWith("text/html"), `got "${type}"`);
  const cache = cacheDirectives(res);
  check(`${path} cache-control has no-cache`, cache.has("no-cache"), `got "${res.headers.get("cache-control") ?? ""}"`);
  checkSelfContained(path, body);
}

// ---------------------------------------------------------------------------
// 5. The pages that link it all.

async function checkHomePage() {
  const path = "/";
  const got = await get(path, { accept: "text/html" });
  if (!served(path, got)) return;
  const { res, body } = got;
  const links = tagsNamed(body, "link");

  // Next links the manifest itself because src/app/manifest.ts exists; it may
  // append a query, hence "starts with".
  check(
    `${path} links the manifest`,
    links.some((tag) => relHas(tag, "manifest") && (tag.href ?? "").startsWith("/manifest.webmanifest")),
    'no <link rel="manifest" href="/manifest.webmanifest...">',
  );
  check(
    `${path} keeps its apple-touch-icon`,
    links.some((tag) => relHas(tag, "apple-touch-icon")),
    'no <link rel="apple-touch-icon"> (iOS ignores manifest icons)',
  );

  // Next 16.3 writes `appleWebApp.capable` as mobile-web-app-capable, so the
  // Apple spelling comes from `other` in the layout (critic-w1 item 8).
  const metas = [
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-title", "Vibe"],
    ["apple-mobile-web-app-status-bar-style", "default"],
  ];
  for (const [name, want] of metas) {
    const have = metaContent(body, name);
    check(
      `${path} has <meta name="${name}" content="${want}">`,
      have.includes(want),
      have.length ? `got ${JSON.stringify(have)}` : "missing",
    );
  }

  // Next's PWA guide says DENY. Vibe frames its own pages (next.config.ts).
  const frame = res.headers.get("x-frame-options") ?? "";
  check(`${path} x-frame-options is SAMEORIGIN`, sameText(frame, "SAMEORIGIN"), `got "${frame}"`);
}

/** Exactly `count` tags in `list` pass `test`: a second copy is a bug too. */
function exactly(label, list, test, count = 1) {
  const found = list.filter(test);
  return check(label, found.length === count, `found ${found.length}`);
}

async function checkStaticPage() {
  // The only static page an anonymous visitor can load (src/proxy.ts, the
  // public profile viewer). `zzzz` needn't exist: the tags are in the file.
  // profile.html, messages.html and onboarding.html share the same three lines.
  const path = "/html/profile.html?app=1&handle=zzzz";
  const got = await get(path, { accept: "text/html" });
  if (!served(path, got)) return;
  const head = headOf(got.body);
  const links = tagsNamed(head, "link");
  const label = "/html/profile.html head";

  exactly(
    `${label} has one <link rel="manifest" href="/manifest.webmanifest">`,
    links,
    (tag) => relHas(tag, "manifest") && tag.href === "/manifest.webmanifest",
  );
  exactly(
    `${label} has one <meta name="theme-color" content="${CREAM}">`,
    tagsNamed(head, "meta"),
    (tag) => sameText(tag.name, "theme-color") && sameText(tag.content, CREAM),
  );
  exactly(
    `${label} has one <script src="/html/_sw.js" defer>`,
    tagsNamed(head, "script"),
    (tag) => tag.src === "/html/_sw.js" && "defer" in tag,
  );
  exactly(`${label} has one apple-touch-icon`, links, (tag) => relHas(tag, "apple-touch-icon"));

  // The static pages' registrar has to register exactly like the React one
  // (plan R9), or moving between the two re-registers the worker.
  const script = "/html/_sw.js";
  const js = await get(script);
  if (!served(script, js)) return;
  const type = contentType(js.res);
  check(`${script} is JavaScript`, /^(?:application|text)\/javascript(?:;|$)/.test(type), `got "${type}"`);
  check(
    `${script} registers /sw.js with scope "/" and updateViaCache "none"`,
    /\.register\(\s*["']\/sw\.js["']/.test(js.body) &&
      /\bscope\s*:\s*["']\/["']/.test(js.body) &&
      /\bupdateViaCache\s*:\s*["']none["']/.test(js.body),
    "register options differ from plan R9",
  );
  check(`${script} has the SW_KILL flag`, /\bSW_KILL\s*=\s*(?:true|false)\b/.test(js.body), "no `SW_KILL = false` (critic-w1 item 4)");
}

// ---------------------------------------------------------------------------
// Run, then one line per check. Failures are repeated at the bottom so a long
// list doesn't hide them.

console.log(`check-pwa: ${ORIGIN}`);
checkProxyMatcher();
await checkManifest();
await checkIcons();
await checkServiceWorker();
await checkOfflinePage();
await checkHomePage();
await checkStaticPage();

for (const r of results) {
  console.log(r.ok ? `  ok    ${r.label}` : `  FAIL  ${r.label}: ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log("");
  console.log("Failed:");
  for (const r of failed) console.log(`  - ${r.label}: ${r.detail}`);
  process.exit(1);
}
