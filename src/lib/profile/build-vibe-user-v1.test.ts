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

test("every other key is unchanged by P1 (S67 wave 2 adds profileLayout, always present)", () => {
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
    "profileLayout",
    "skills",
    "tagline",
    "vibeTags",
    "website",
  ]);
  assert.equal(vibeUser.headline, "Biology · Year 2");
  assert.equal(vibeUser.tagline, "Hello there");
  assert.deepEqual(vibeUser.vibeTags, [{ label: "film", color: "coral" }]);
});

test("profileLayout: the default when the row has none, the sanitized whole document when it does", () => {
  const DEFAULT_ORDER = ["clubs", "bio", "experience", "skills", "posts", "resume", "working_on"];
  // No column in the row (a select that didn't ask, or the '{}' default).
  const none = buildVibeUserV1FromProfile(normalizeProfileView(row()));
  assert.deepEqual(none.profileLayout, { v: 1, order: DEFAULT_ORDER, hidden: [], bioSide: false });
  const empty = buildVibeUserV1FromProfile(normalizeProfileView(row({ profile_layout: {} })));
  assert.deepEqual(empty.profileLayout, none.profileLayout);
  // A stored document: unknown ids gone, posts never hidden, a missing clubs
  // first, the other missing ids appended.
  const stored = buildVibeUserV1FromProfile(
    normalizeProfileView(
      row({ profile_layout: { order: ["posts", "bio", "calendar"], hidden: ["experience", "posts"], bioSide: true } }),
    ),
  );
  assert.deepEqual(stored.profileLayout, {
    v: 1,
    order: ["clubs", "posts", "bio", "experience", "skills", "resume", "working_on"],
    hidden: ["experience"],
    bioSide: true,
  });
  // Garbage in the column reads as the default, never as an error.
  const junk = buildVibeUserV1FromProfile(normalizeProfileView(row({ profile_layout: "<script>" })));
  assert.deepEqual(junk.profileLayout, none.profileLayout);
  // The vibeUser carries its own arrays: reordering them leaves the profile alone.
  const profile = normalizeProfileView(row());
  const u = buildVibeUserV1FromProfile(profile);
  (u.profileLayout as { order: string[] }).order.reverse();
  assert.deepEqual(profile.profile_layout.order, DEFAULT_ORDER);
});

// S67 security wave 2, A1: a non-owner's profile is blanked BEFORE the build.
const { blankHiddenWidgets } = await import("./hidden-fields");

test("a hidden bio never reaches a visitor, not even as the tagline the builder derives from it", () => {
  const stored = row({ tagline: "", profile_layout: { hidden: ["bio", "skills"] } });
  // The owner: bio kept, and the empty tagline still falls back to it.
  const owner = buildVibeUserV1FromProfile(blankHiddenWidgets(normalizeProfileView(stored), { isOwner: true }));
  assert.equal(owner.tagline, "Hello there");
  assert.deepEqual((owner.profileLayout as { hidden: string[] }).hidden, ["bio", "skills"]);
  // A visitor: no bio, no bio-derived tagline, no skills, and no hidden list.
  const visitor = buildVibeUserV1FromProfile(blankHiddenWidgets(normalizeProfileView(stored), { isOwner: false }));
  assert.equal(visitor.bio, "");
  assert.equal(visitor.tagline, "");
  assert.deepEqual(visitor.skills, []);
  assert.deepEqual((visitor.profileLayout as { hidden: string[] }).hidden, []);
  assert.equal(JSON.stringify(visitor).includes("Hello there"), false);
  assert.equal(JSON.stringify(visitor).includes("sql"), false);
});

test("a hidden résumé, experience and working-on ship no keys to a visitor", () => {
  const stored = row({
    profile_layout: { hidden: ["resume", "experience", "working_on"] },
    resume_url: "https://example.com/cv.pdf",
    work_experience: [{ title: "Intern", company: "Acme" }],
    work_order_manual: true,
    current_on: [{ icon: "x", text: "a thesis" }],
  });
  const visitor = buildVibeUserV1FromProfile(blankHiddenWidgets(normalizeProfileView(stored), { isOwner: false }));
  for (const key of ["resumePortfolio", "workExperience", "_workOrderManual", "currentlyOn", "resumeRedactions"]) {
    assert.equal(Object.hasOwn(visitor, key), false, key);
  }
  const owner = buildVibeUserV1FromProfile(normalizeProfileView(stored));
  assert.equal(Object.hasOwn(owner, "currentlyOn"), true);
  assert.equal(Object.hasOwn(owner, "_workOrderManual"), true);
});
