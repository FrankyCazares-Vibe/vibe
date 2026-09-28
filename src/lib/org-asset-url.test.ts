/**
 * Tests for `org-asset-url.ts`: which logo / banner / club-post media values
 * a route may store (S67 security wave, batch b).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/org-asset-url.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports "./posts/media-ownership"
 * extensionless, which is what Next and tsc expect; Node's type stripping
 * adds no extension. Same pattern as moderation/profile-filter.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("org-asset-url.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rqopjkimxbjkwdkpkbfq.supabase.co";

const { isAllowedMediaUrl, isSupabaseHttpsUrl, normalizeOrgAssetInput } = (await import(
  "./org-asset-url"
)) as typeof import("./org-asset-url");

const ORG = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OWN_KEY = `orgs/${ORG}/logo/2b7c1e0a-1111-4222-8333-944455556666.png`;
const OTHER_KEY = `orgs/${OTHER}/logo/2b7c1e0a-1111-4222-8333-944455556666.png`;
const URL_OK =
  "https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/x/logo-1.png";

test("normalizeOrgAssetInput takes only this club's own folder", () => {
  assert.equal(normalizeOrgAssetInput(OWN_KEY, ORG), OWN_KEY);
  assert.equal(normalizeOrgAssetInput(`  ${OWN_KEY}  `, ORG), OWN_KEY);
  assert.equal(normalizeOrgAssetInput(OTHER_KEY, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}/../${OTHER}/logo/x.png`, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}/`, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}/a b.png`, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}x/logo.png`, ORG), undefined);
});

test("normalizeOrgAssetInput refuses every key before the club exists", () => {
  assert.equal(normalizeOrgAssetInput(OWN_KEY, null), undefined);
  assert.equal(normalizeOrgAssetInput(URL_OK, null), URL_OK);
});

test("normalizeOrgAssetInput without an id still refuses malformed keys", () => {
  // Legacy callers: the database trigger scopes the folder; the shape is
  // checked here so a bad value is a 400, not a 500.
  assert.equal(normalizeOrgAssetInput(OTHER_KEY), OTHER_KEY);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}/../x.png`), undefined);
  assert.equal(normalizeOrgAssetInput("orgs/not-a-uuid/logo.png"), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}\\logo.png`), undefined);
});

test("normalizeOrgAssetInput clears, and refuses other hosts and junk", () => {
  assert.equal(normalizeOrgAssetInput(null, ORG), null);
  assert.equal(normalizeOrgAssetInput("", ORG), null);
  assert.equal(normalizeOrgAssetInput("   ", ORG), null);
  assert.equal(normalizeOrgAssetInput(42, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(URL_OK, ORG), URL_OK);
  assert.equal(normalizeOrgAssetInput(`${URL_OK}?x=1`, ORG), undefined);
  assert.equal(normalizeOrgAssetInput("https://evil.example/x.png", ORG), undefined);
  assert.equal(normalizeOrgAssetInput(URL_OK.replace("https", "http"), ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`clips/${ORG}/x.mp4`, ORG), undefined);
  assert.equal(normalizeOrgAssetInput(`orgs/${ORG}/${"a".repeat(1100)}`, ORG), undefined);
});

test("isAllowedMediaUrl scopes club post media to the club", () => {
  const post = `orgs/${ORG}/posts/2b7c1e0a-1111-4222-8333-944455556666.jpg`;
  assert.equal(isAllowedMediaUrl(post, ORG), true);
  assert.equal(isAllowedMediaUrl(post, OTHER), false);
  assert.equal(isAllowedMediaUrl(`orgs/${ORG}/../${OTHER}/x.jpg`, ORG), false);
  assert.equal(isAllowedMediaUrl(`clips/${ORG}/x.mp4`, ORG), false);
  assert.equal(isAllowedMediaUrl(URL_OK, ORG), true);
  assert.equal(isAllowedMediaUrl("https://evil.example/x.png", ORG), false);
  assert.equal(isAllowedMediaUrl("", ORG), false);
});

test("isSupabaseHttpsUrl pins the configured host", () => {
  assert.equal(isSupabaseHttpsUrl(URL_OK), true);
  assert.equal(isSupabaseHttpsUrl("https://other.supabase.co/x.png"), false);
  assert.equal(isSupabaseHttpsUrl("not a url"), false);
});
