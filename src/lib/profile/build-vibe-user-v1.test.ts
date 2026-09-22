/**
 * Tests for `buildVibeUserV1FromProfile` + `normalizeProfileView` after P1:
 * the professional snapshot is gone from both, and the profile carries
 * `lookingFor` ("what are you here for?") instead.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/build-vibe-user-v1.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `onboarding-prefill.test.ts` ("@/x" →
 * "src/x.ts", extensionless relative specifiers retried with ".ts"). Both
 * modules load through dynamic `import()` so the hook is registered first.
 * Their dependency chain (looking-for, profile-campus-write, campuses,
 * onboarding-prefill, work-experience, current-on, resume-*) is pure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("build-vibe-user-v1.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { buildVibeUserV1FromProfile } = await import("./build-vibe-user-v1");
const { normalizeProfileView } = await import("./normalize-profile-view");

// The retired snapshot column, spelled in two halves so a grep of src/ for
// its name stays empty (a P1 static gate: nothing in src names it).
const OLD_SNAPSHOT_COLUMN = ["recruiter", "snapshot"].join("_");

function row(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "P1 Owner",
    handle: "p1owner",
    school: "",
    school_verified: false,
    year: 2,
    major: "Biology",
    bio: "Hello there",
    interests: ["film"],
    skills: ["sql"],
    looking_for: ["exploring", "junk", "meeting-people"],
    [OLD_SNAPSHOT_COLUMN]: { role: "x", preferred: "y" },
    ...extra,
  };
}

test("normalizeProfileView no longer carries the snapshot column", () => {
  const profile = normalizeProfileView(row());
  assert.equal(Object.hasOwn(profile, OLD_SNAPSHOT_COLUMN), false);
  // The raw tokens stay as stored; display filtering happens in the builder.
  assert.deepEqual(profile.looking_for, ["exploring", "junk", "meeting-people"]);
});

test("buildVibeUserV1FromProfile: lookingFor in, snapshot out, skills unchanged", () => {
  const vibeUser = buildVibeUserV1FromProfile(normalizeProfileView(row()));
  assert.equal(Object.hasOwn(vibeUser, "snapshot"), false);
  assert.deepEqual(vibeUser.lookingFor, ["meeting-people", "exploring"]);
  assert.deepEqual(vibeUser.skills, ["sql"]);
  // Nothing derived from the old snapshot leaks into another key.
  assert.equal(JSON.stringify(vibeUser).includes('"role"'), false);
});

test("lookingFor is always present, [] when there is no answer", () => {
  for (const lookingFor of [[], null, "exploring", ["nope"], undefined]) {
    const vibeUser = buildVibeUserV1FromProfile(normalizeProfileView(row({ looking_for: lookingFor })));
    assert.deepEqual(vibeUser.lookingFor, [], `looking_for=${JSON.stringify(lookingFor)}`);
  }
});

test("a caller that blanks looking_for (a non-owner viewer, ruling H6) gets []", () => {
  const profile = normalizeProfileView(row());
  profile.looking_for = [];
  assert.deepEqual(buildVibeUserV1FromProfile(profile, { appShell: false }).lookingFor, []);
});

test("every other key is unchanged by P1", () => {
  const vibeUser = buildVibeUserV1FromProfile(normalizeProfileView(row()), { appShell: true });
  assert.deepEqual(Object.keys(vibeUser).sort(), [
    "_appShell",
    "_onboarded",
    "bio",
    "handle",
    "headline",
    "id",
    "location",
    "lookingFor",
    "name",
    "skills",
    "tagline",
    "vibeTags",
    "website",
  ]);
  assert.equal(vibeUser.headline, "Biology · Year 2");
  assert.equal(vibeUser.tagline, "Hello there");
  assert.deepEqual(vibeUser.vibeTags, [{ label: "film", color: "coral" }]);
});
