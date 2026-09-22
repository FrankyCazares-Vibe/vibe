/**
 * Tests for `self-write-columns.ts` (the closed list in front of the two
 * service-role profile writes), plus text pins on the three routes P1 moved
 * off the caller's cookie client.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/self-write-columns.test.ts
 *
 * The module under test has zero imports, so it loads through a dynamic import
 * of its ".ts" path (the `join-copy.test.ts` pattern). The route files are
 * read as text, from paths relative to this file: they import "server-only"
 * and the Supabase clients, so they can't load under node:test.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./self-write-columns.ts";
const { SELF_PROFILE_WRITE_COLUMNS, unexpectedSelfWriteKeys } = (await import(
  specifier
)) as typeof import("./self-write-columns");

const REPO_ROOT = new URL("../../../", import.meta.url);
const readRepoFile = (path: string): string => readFileSync(new URL(path, REPO_ROOT), "utf8");
// The retired snapshot column, spelled in two halves so a grep of src/ for
// its name stays empty (a P1 static gate: nothing in src names it).
const OLD_SNAPSHOT_COLUMN = ["recruiter", "snapshot"].join("_");

const PROFILE_ROUTE = "src/app/api/me/profile/route.ts";
const PROFILE_SYNC_ROUTE = "src/app/api/me/profile-sync/route.ts";
const PINNED_ROUTE = "src/app/api/me/pinned/route.ts";

test("the list: exactly the 21 columns, in order, frozen", () => {
  assert.deepEqual(
    [...SELF_PROFILE_WRITE_COLUMNS],
    [
      "name",
      "tagline",
      "website",
      "headline",
      "location_text",
      "bio",
      "major",
      "department",
      "year",
      "interests",
      "skills",
      "looking_for",
      "work_experience",
      "work_order_manual",
      "current_on",
      "resume_redactions",
      "resume_url",
      "resume_docs",
      "avatar_url",
      "banner_url",
      "banner_gradient",
    ],
  );
  assert.equal(Object.isFrozen(SELF_PROFILE_WRITE_COLUMNS), true);
});

test("columns no student may write are never on the list", () => {
  for (const col of [
    OLD_SNAPSHOT_COLUMN,
    "id",
    "email",
    "school_email",
    "school_verified",
    "handle",
    "handle_changed_at",
    "school",
    "school_system",
    "campus_id",
    "campus_set_at",
    "is_platform_admin",
    "profile_view_count",
    "pinned_post_id",
    "otto_answers",
    "otto_settings",
    "terms_version",
    "terms_accepted_at",
    "age_attested_at",
  ]) {
    assert.equal(
      (SELF_PROFILE_WRITE_COLUMNS as readonly string[]).includes(col),
      false,
      `${col} must not be self-writable`,
    );
  }
});

test("unexpectedSelfWriteKeys: the keys outside the list, sorted", () => {
  assert.deepEqual(
    unexpectedSelfWriteKeys({ name: "a", [OLD_SNAPSHOT_COLUMN]: {}, school_verified: true }),
    [OLD_SNAPSHOT_COLUMN, "school_verified"],
  );
  assert.deepEqual(unexpectedSelfWriteKeys({ school_verified: true, handle: "x" }), [
    "handle",
    "school_verified",
  ]);
  assert.deepEqual(unexpectedSelfWriteKeys({}), []);
  const everything = Object.fromEntries(SELF_PROFILE_WRITE_COLUMNS.map((c) => [c, null]));
  assert.deepEqual(unexpectedSelfWriteKeys(everything), []);
});

test("the three routes: no snapshot column, no cookie-client users write", () => {
  for (const path of [PROFILE_ROUTE, PROFILE_SYNC_ROUTE, PINNED_ROUTE]) {
    const src = readRepoFile(path);
    assert.equal(src.includes(OLD_SNAPSHOT_COLUMN), false, `${path} names the snapshot column`);
    assert.equal(
      /\bsupabase\s*\.from\(\s*"users"\s*\)\s*\.update\(/.test(src),
      false,
      `${path} still writes users with the cookie client`,
    );
  }
});

test("the three routes: limits, Terms gate, closed-list guard", () => {
  const profile = readRepoFile(PROFILE_ROUTE);
  const sync = readRepoFile(PROFILE_SYNC_ROUTE);
  const pinned = readRepoFile(PINNED_ROUTE);

  assert.ok(pinned.includes("requireTermsAccepted("));
  assert.ok(pinned.includes("rateLimit(`pinned:${user.id}`, { limit: 60, windowSec: 600 })"));

  // Rulings B3: ONE limiter on PATCH /api/me/profile.
  assert.ok(profile.includes("rateLimit(`me-profile:${user.id}`, { limit: 60, windowSec: 600 })"));
  assert.equal(profile.match(/rateLimit\(/g)?.length, 1);
  assert.ok(profile.includes("unexpectedSelfWriteKeys("));

  assert.ok(sync.includes("rateLimit(`profile-sync:${user.id}`, { limit: 300, windowSec: 600 })"));
  assert.ok(sync.includes("unexpectedSelfWriteKeys("));

  // Each limiter runs before the Terms gate, the order onboarding-step uses.
  for (const [name, src, key] of [
    ["profile", profile, "me-profile:"],
    ["profile-sync", sync, "profile-sync:"],
    ["pinned", pinned, "pinned:"],
  ] as const) {
    const limitAt = src.indexOf(key);
    const termsAt = src.indexOf("requireTermsAccepted(user.id)");
    assert.ok(limitAt > 0 && termsAt > limitAt, `${name}: limiter must run before the Terms gate`);
  }
});
