/**
 * Tests for `csp.ts`, the browser code rule (security report 2026-10-08, "No
 * browser rule limiting which code can run on Vibe's pages"; plan
 * handoffs/2026-10-11-browser-rule-plan.md): the two flavours, dev vs prod,
 * the env-derived hosts, the path → flavour map, the nonce, the DRIFT
 * TRIPWIRE for NIGHT_LOCK_SCRIPT_HASH, and the "are you a person" box's host
 * (app flavour only, and only once its site key is set).
 *
 * Run with:
 *   node --test src/lib/security/csp.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `rolling-strip-view.test.ts`: Node's type
 * stripping doesn't resolve the "@/…" alias (csp.ts imports demo-media.ts
 * through it) or add file extensions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks, createRequire } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
  createRequire: (from: string) => (id: string) => unknown;
};
if (typeof registerHooks !== "function") {
  throw new Error("csp.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const csp = await import("./csp");
const { buildCsp, cspEnvFromProcess, cspFlavor, makeNonce, NIGHT_LOCK_SCRIPT_HASH, CSP_HEADER, NONCE_HEADER } = csp;
type CspEnv = import("./csp").CspEnv;
const { NIGHT_LOCK_SCRIPT } = await import("@/lib/theme/theme");
const { DEFAULT_DEMO_MEDIA_BASE } = await import("@/lib/landing/demo-media");

/** Next's own nonce parser (app-render), so the header shape is checked against the real reader. */
const { getScriptNonceFromHeader } = createRequire(import.meta.url)(
  "next/dist/server/app-render/get-script-nonce-from-header.js",
) as { getScriptNonceFromHeader: (header: string) => string | undefined };

const PROD_ENV: CspEnv = {
  supabaseUrl: "https://rqopjkimxbjkwdkpkbfq.supabase.co",
  r2AccountId: "0123456789abcdef0123456789abcdef",
  sentryDsn: "https://abc123publickey@o4511312043704320.ingest.us.sentry.io/4511312043704321",
  demoMediaBase: DEFAULT_DEMO_MEDIA_BASE,
};
const SUPABASE = "https://rqopjkimxbjkwdkpkbfq.supabase.co";
const R2 = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
const SENTRY = "https://o4511312043704320.ingest.us.sentry.io";
const DEMO = "https://npzptkkzqxthhsnu.public.blob.vercel-storage.com";
const NONCE = "AAECAwQFBgcICQoLDA0ODw==";
/** Cloudflare's "are you a person" host, and PROD_ENV with the box switched on (their published test site key). */
const HUMAN_CHECK = "https://challenges.cloudflare.com";
const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";
const BOX_ON_ENV: CspEnv = { ...PROD_ENV, turnstileSiteKey: TURNSTILE_TEST_KEY };

/** directive name → its source list. */
function parse(header: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of header.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}
function src(header: string, directive: string): string[] {
  const list = parse(header).get(directive);
  assert.ok(list, `${directive} is missing from: ${header}`);
  return list;
}

const app = (dev: boolean, env: CspEnv = PROD_ENV, requestHost?: string) =>
  buildCsp({ flavor: "app", nonce: NONCE, env, dev, requestHost });
const stat = (dev: boolean, env: CspEnv = PROD_ENV, requestHost?: string) =>
  buildCsp({ flavor: "static", env, dev, requestHost });
const ALL = [app(false), app(true), stat(false), stat(true)];

test("NIGHT_LOCK_SCRIPT_HASH matches theme.ts (drift tripwire: recompute and paste when the script changes)", () => {
  const digest = createHash("sha256").update(NIGHT_LOCK_SCRIPT, "utf8").digest("base64");
  assert.equal(NIGHT_LOCK_SCRIPT_HASH, `'sha256-${digest}'`);
});

test("header names are the ones the proxy and the layout share", () => {
  assert.equal(CSP_HEADER, "Content-Security-Policy");
  assert.equal(NONCE_HEADER, "x-nonce");
});

test("app flavour: nonce, night-lock hash and strict-dynamic in script-src; no unsafe-inline there", () => {
  for (const header of [app(false), app(true)]) {
    const scripts = src(header, "script-src");
    assert.ok(scripts.includes(`'nonce-${NONCE}'`));
    assert.ok(scripts.includes(NIGHT_LOCK_SCRIPT_HASH));
    assert.ok(scripts.includes("'strict-dynamic'"));
    assert.ok(scripts.includes("https://cdnjs.cloudflare.com"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
  }
});

test("static flavour: unsafe-inline scripts, and no nonce, hash or strict-dynamic (any of them would void it)", () => {
  for (const header of [stat(false), stat(true)]) {
    const scripts = src(header, "script-src");
    assert.ok(scripts.includes("'unsafe-inline'"));
    assert.ok(scripts.includes("https://cdnjs.cloudflare.com"));
    assert.ok(!header.includes("'nonce-"));
    assert.ok(!header.includes("'sha256-"));
    assert.ok(!header.includes("'strict-dynamic'"));
  }
});

// With the "are you a person" box on, frame-src differs too: see the three tests after the frame-src one.
test("every directive except script-src is identical in the two flavours (the box off)", () => {
  for (const dev of [false, true]) {
    const a = parse(app(dev, PROD_ENV, "localhost:3000"));
    const s = parse(stat(dev, PROD_ENV, "localhost:3000"));
    assert.deepEqual([...a.keys()], [...s.keys()]);
    for (const [name, sources] of a) {
      if (name !== "script-src") assert.deepEqual(s.get(name), sources, name);
    }
  }
});

test("unsafe-eval only in development, both flavours", () => {
  assert.ok(src(app(true), "script-src").includes("'unsafe-eval'"));
  assert.ok(src(stat(true), "script-src").includes("'unsafe-eval'"));
  assert.ok(!app(false).includes("'unsafe-eval'"));
  assert.ok(!stat(false).includes("'unsafe-eval'"));
});

test("upgrade-insecure-requests only in production (dev is http://localhost)", () => {
  assert.ok(parse(app(false)).has("upgrade-insecure-requests"));
  assert.ok(parse(stat(false)).has("upgrade-insecure-requests"));
  assert.ok(!app(true).includes("upgrade-insecure-requests"));
  assert.ok(!stat(true).includes("upgrade-insecure-requests"));
});

test("directive order is the plan's, one line, no empty or trailing directive", () => {
  for (const header of ALL) {
    assert.ok(!/[\r\n]/.test(header));
    assert.ok(!header.trim().endsWith(";"));
    assert.ok(!/;\s*;/.test(header));
  }
  assert.deepEqual(
    [...parse(app(false)).keys()],
    [
      "default-src", "script-src", "style-src", "font-src", "img-src", "media-src", "connect-src",
      "frame-src", "worker-src", "manifest-src", "object-src", "base-uri", "form-action",
      "frame-ancestors", "upgrade-insecure-requests",
    ],
  );
  const a = parse(app(false));
  assert.deepEqual(a.get("default-src"), ["'self'"]);
  assert.deepEqual(a.get("style-src"), ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
  assert.deepEqual(a.get("font-src"), ["'self'", "data:", "https://fonts.gstatic.com"]);
  assert.deepEqual(a.get("worker-src"), ["'self'", "blob:"]);
  assert.deepEqual(a.get("object-src"), ["'none'"]);
  assert.deepEqual(a.get("base-uri"), ["'self'"]);
  assert.deepEqual(a.get("form-action"), ["'self'"]);
  assert.deepEqual(a.get("frame-ancestors"), ["'self'"]);
});

test("the env's hosts land where the browser uses them, as origins only", () => {
  const h = app(false);
  assert.deepEqual(src(h, "img-src"), ["'self'", "data:", "blob:", SUPABASE, R2, DEMO]);
  assert.deepEqual(src(h, "media-src"), ["'self'", "blob:", SUPABASE, R2, DEMO]);
  assert.deepEqual(src(h, "connect-src"), [
    "'self'", SUPABASE, "wss://rqopjkimxbjkwdkpkbfq.supabase.co", R2, SENTRY,
  ]);
  // The DSN's public key and project id never reach the header.
  assert.ok(!h.includes("abc123publickey"));
  assert.ok(!h.includes("4511312043704321"));
});

test("frame-src is 'self' only, both flavours (skeptic amendment 1: no storage origins in frames)", () => {
  for (const header of ALL) assert.deepEqual(src(header, "frame-src"), ["'self'"]);
});

test("no site key: Cloudflare's challenge host is nowhere in the header, either flavour", () => {
  for (const header of ALL) assert.ok(!header.includes("challenges.cloudflare.com"));
  for (const turnstileSiteKey of [undefined, "", "   ", "not a key", '"1x00000000000000000000AA"', "abc; script-src *"]) {
    for (const dev of [false, true]) {
      const env = { ...PROD_ENV, turnstileSiteKey };
      assert.equal(app(dev, env), app(dev), String(turnstileSiteKey));
      assert.equal(stat(dev, env), stat(dev), String(turnstileSiteKey));
    }
  }
});

test("site key set: the app flavour lets the challenge host frame and (as a fallback) run script; nothing else moves", () => {
  for (const dev of [false, true]) {
    const on = parse(app(dev, BOX_ON_ENV, "localhost:3000"));
    const off = parse(app(dev, PROD_ENV, "localhost:3000"));
    assert.deepEqual(on.get("frame-src"), ["'self'", HUMAN_CHECK]);
    const scripts = on.get("script-src") ?? [];
    assert.ok(scripts.includes(HUMAN_CHECK));
    // Still nonce + strict-dynamic, and the host adds no way to run inline script.
    assert.ok(scripts.includes(`'nonce-${NONCE}'`));
    assert.ok(scripts.includes("'strict-dynamic'"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.deepEqual(scripts.filter((s) => s !== HUMAN_CHECK), off.get("script-src"));
    assert.deepEqual([...on.keys()], [...off.keys()]);
    for (const [name, sources] of off) {
      if (name !== "script-src" && name !== "frame-src") assert.deepEqual(on.get(name), sources, name);
    }
    // The host is never somewhere the box does not need it, and the key never reaches the header.
    for (const name of ["connect-src", "img-src", "media-src", "style-src", "form-action", "frame-ancestors"]) {
      assert.ok(!(on.get(name) ?? []).includes(HUMAN_CHECK), name);
    }
    assert.ok(!app(dev, BOX_ON_ENV).includes(TURNSTILE_TEST_KEY));
  }
});

test("site key set: the static flavour does not change (no static page has a sign-in form)", () => {
  for (const dev of [false, true]) {
    assert.equal(stat(dev, BOX_ON_ENV), stat(dev));
    assert.ok(!stat(dev, BOX_ON_ENV).includes("challenges.cloudflare.com"));
    assert.deepEqual(src(stat(dev, BOX_ON_ENV), "frame-src"), ["'self'"]);
  }
});

test("a missing env var leaves its host out instead of writing an empty or broken entry", () => {
  for (const flavor of ["app", "static"] as const) {
    const h = buildCsp({ flavor, nonce: NONCE, env: {}, dev: false });
    assert.ok(!h.includes("supabase"));
    assert.ok(!h.includes("r2.cloudflarestorage.com"));
    assert.ok(!h.includes("sentry"));
    assert.ok(!h.includes("blob.vercel-storage.com"));
    assert.ok(!h.includes("wss:"));
    assert.deepEqual(src(h, "img-src"), ["'self'", "data:", "blob:"]);
    assert.deepEqual(src(h, "connect-src"), ["'self'"]);
  }
});

test("malformed env values are refused, never written into the header", () => {
  const h = app(false, {
    supabaseUrl: "https://evil.example; script-src *",
    r2AccountId: "abc; script-src *",
    sentryDsn: "not a url",
    demoMediaBase: "/landing-media/",
  });
  assert.ok(!h.includes("*"));
  assert.ok(!h.includes("evil"));
  assert.equal(src(h, "script-src").filter((s) => s === "*").length, 0);
  assert.deepEqual(src(h, "img-src"), ["'self'", "data:", "blob:"]);
});

test("img-src never holds a bare scheme or a wildcard; connect-src never holds the script CDN", () => {
  const envs: CspEnv[] = [PROD_ENV, {}, { supabaseUrl: "http://127.0.0.1:54321" }];
  for (const env of envs) {
    for (const flavor of ["app", "static"] as const) {
      for (const dev of [false, true]) {
        const h = buildCsp({ flavor, nonce: NONCE, env, dev, requestHost: "localhost:3000" });
        for (const s of src(h, "img-src")) {
          assert.ok(!["https:", "http:", "*"].includes(s), `img-src holds ${s}`);
          assert.ok(!s.includes("*"), `img-src holds ${s}`);
        }
        assert.ok(!src(h, "connect-src").some((s) => s.includes("cdnjs")));
      }
    }
  }
});

test("dev: the local Supabase gets its ws:// twin and the page's own host gets ws/wss for HMR", () => {
  const h = app(true, { supabaseUrl: "http://127.0.0.1:54321" }, "192.168.1.20:3000");
  assert.deepEqual(src(h, "connect-src"), [
    "'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321", "ws://192.168.1.20:3000", "wss://192.168.1.20:3000",
  ]);
  // Production never lists the request host, and a hostile Host header is refused.
  assert.ok(!app(false, PROD_ENV, "vibe.example").includes("vibe.example"));
  const hostile = app(true, {}, "evil.example; script-src *");
  assert.ok(!hostile.includes("evil"));
  assert.deepEqual(src(hostile, "connect-src"), ["'self'"]);
});

test("the app flavour refuses to build without a usable nonce (a blank page is worse than a loud error)", () => {
  assert.throws(() => buildCsp({ flavor: "app", env: PROD_ENV, dev: false }));
  assert.throws(() => buildCsp({ flavor: "app", nonce: "x' 'unsafe-inline", env: PROD_ENV, dev: false }));
});

test("Next reads our nonce back out of the header (get-script-nonce-from-header.js)", () => {
  const nonce = makeNonce();
  const header = buildCsp({ flavor: "app", nonce, env: PROD_ENV, dev: false });
  assert.equal(getScriptNonceFromHeader(header), nonce);
  assert.equal(getScriptNonceFromHeader(stat(false)), undefined);
});

test("cspFlavor: the static pages and the classic onboarding are static, every React page is app", () => {
  assert.equal(cspFlavor("/html/profile.html"), "static");
  assert.equal(cspFlavor("/html/messages.html?x"), "static");
  assert.equal(cspFlavor("/html/onboarding.html#step"), "static");
  assert.equal(cspFlavor("/onboarding/classic"), "static");
  assert.equal(cspFlavor("/onboarding/classic/"), "static");
  assert.equal(cspFlavor("/campus"), "app");
  assert.equal(cspFlavor("/"), "app");
  assert.equal(cspFlavor("/onboarding"), "app");
  assert.equal(cspFlavor("/onboarding/classical"), "app");
  assert.equal(cspFlavor("/onboarding/classic/extra"), "app");
  assert.equal(cspFlavor("/messages"), "app");
  assert.equal(cspFlavor("/html/_otto.js"), "app");
});

test("makeNonce: 16 random bytes as 24 characters of standard base64, fresh every call", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const n = makeNonce();
    assert.equal(n.length, 24);
    assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
    assert.equal(Buffer.from(n, "base64").length, 16);
    seen.add(n);
  }
  assert.equal(seen.size, 50);
  assert.notEqual(makeNonce(), makeNonce());
});

test("cspEnvFromProcess: maps the five variables; the film host defaults to the Blob store and 'off' drops it", () => {
  const base = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
  assert.deepEqual(
    cspEnvFromProcess({
      ...base,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE,
      R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      NEXT_PUBLIC_SENTRY_DSN: PROD_ENV.sentryDsn,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_KEY,
    }),
    {
      supabaseUrl: SUPABASE,
      r2AccountId: "0123456789abcdef0123456789abcdef",
      sentryDsn: PROD_ENV.sentryDsn,
      demoMediaBase: DEFAULT_DEMO_MEDIA_BASE,
      turnstileSiteKey: TURNSTILE_TEST_KEY,
    },
  );
  const bare = cspEnvFromProcess(base);
  assert.equal(bare.supabaseUrl, undefined);
  assert.equal(bare.r2AccountId, undefined);
  assert.equal(bare.sentryDsn, undefined);
  assert.equal(bare.turnstileSiteKey, undefined);
  // The variable alone switches the host on, end to end.
  const boxOn = cspEnvFromProcess({ ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_KEY });
  assert.deepEqual(src(app(false, boxOn), "frame-src"), ["'self'", HUMAN_CHECK]);
  assert.deepEqual(src(app(false, bare), "frame-src"), ["'self'"]);
  assert.equal(bare.demoMediaBase, DEFAULT_DEMO_MEDIA_BASE);
  assert.equal(cspEnvFromProcess({ ...base, NEXT_PUBLIC_DEMO_MEDIA_BASE: "off" }).demoMediaBase, undefined);
  const other = cspEnvFromProcess({ ...base, NEXT_PUBLIC_DEMO_MEDIA_BASE: "https://cdn.example.com/film" });
  assert.equal(other.demoMediaBase, "https://cdn.example.com/film/");
  assert.ok(src(app(false, other), "media-src").includes("https://cdn.example.com"));
  // The local copy is on this site: 'self' already covers it, so no host is added.
  const local = cspEnvFromProcess({ ...base, NEXT_PUBLIC_DEMO_MEDIA_BASE: "/landing-media/" });
  assert.deepEqual(src(app(false, local), "media-src"), ["'self'", "blob:"]);
});

test("cspEnvFromProcess() with no argument reads the real process env without throwing", () => {
  const env = cspEnvFromProcess();
  assert.equal(typeof env, "object");
  assert.doesNotThrow(() => buildCsp({ flavor: "app", nonce: makeNonce(), env, dev: false }));
});
