/**
 * Tests for the profile word filter (`profile-filter.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/moderation/profile-filter.test.ts
 *
 * NO SLUR IS TYPED IN THIS FILE. Every blocked case is built from the encoded
 * list itself, the same rule text-filter.test.ts follows.
 *
 * WHY THE RESOLVE HOOK: the module imports "./text-filter" extensionless,
 * which is what Next and tsc expect; Node's type stripping adds no extension.
 * Same pattern as text-filter.test.ts. The module's only other import is a
 * TYPE (`SupabaseClient`), which type stripping erases — that is why this
 * loads at all, and why `blockedProfileField` takes its client as an argument.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("profile-filter.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { blockedAgainstStored, blockedProfileField, suspectProfileFields } = await import(
  "./profile-filter"
);
const { filterTerms } = await import("./text-filter-list");

/** One term off the encoded list, so no slur is written here. */
const BAD = filterTerms()[0].term;

/** The whole check, with no stored row to compare against. */
const blockedIn = (values: Record<string, unknown>): string | null =>
  blockedAgainstStored(values, {}, suspectProfileFields(values));

test("every free-text profile field is covered, not just name/bio/tagline", () => {
  for (const field of [
    "name",
    "bio",
    "tagline",
    "headline",
    "location_text",
    "major",
    "department",
  ]) {
    assert.equal(blockedIn({ [field]: `hey ${BAD} ok` }), field, field);
  }
});

test("an ordinary profile is not touched", () => {
  assert.equal(
    blockedIn({
      name: "Sam Rivera",
      bio: "Junior. Assessment season. Therapist in training.",
      headline: "Biology · Year 3",
      location_text: "Indianapolis",
      major: "Biology",
      interests: ["grape soda", "Dickinson", "scunthorpe united"],
      skills: ["classics", "bookkeeping"],
      work_experience: [{ title: "Barista", company: "Cafe", description: "Made coffee." }],
      current_on: [{ icon: "📚", text: "Reading Dickinson" }],
    }),
    null,
  );
});

test("one dirty entry in a list is caught, whatever else is in it", () => {
  assert.equal(blockedIn({ interests: ["hiking", BAD, "coffee"] }), "interests[1]");
  assert.equal(blockedIn({ skills: ["react", BAD] }), "skills[1]");
  assert.equal(
    blockedIn({ work_experience: [{ title: "Intern", description: BAD }] }),
    "work_experience[0]",
  );
  assert.equal(blockedIn({ current_on: [{ icon: "🔥", text: BAD }] }), "current_on[0]");
  assert.equal(
    blockedIn({ resume_docs: [{ name: BAD, type: "pdf", url: "/api/resume/x" }] }),
    "resume_docs[0]",
  );
});

test("a list refusal names the row, so the editor can point at it", () => {
  // Three jobs, five text keys apiece: "work_experience" on its own leaves the
  // student hunting fifteen strings. The row makes the 422 actionable.
  assert.equal(
    blockedIn({
      work_experience: [
        { title: "Barista", company: "Cafe", description: "Made coffee." },
        { title: "Intern", company: "Lab", description: `notes ${BAD} here` },
        { title: "Tutor", company: "Campus", description: "Calc I." },
      ],
    }),
    "work_experience[1]",
  );
  // A scalar still answers with the bare column name — nothing to index.
  assert.equal(blockedIn({ headline: `${BAD} year 3` }), "headline");
});

test("a value already on the row is always allowed through", () => {
  // The autosave rule: the desktop form re-sends the whole profile every
  // 1.2 s, so a stored value must never fail a save nobody made to it.
  const stored = { bio: BAD, interests: [BAD] };
  const suspects = suspectProfileFields({ bio: BAD, interests: [BAD] });
  assert.deepEqual(suspects.sort(), ["bio", "interests"]);
  assert.equal(blockedAgainstStored({ bio: BAD, interests: [BAD] }, stored, suspects), null);
  // Reordering a list is not an edit to any of its entries.
  assert.equal(
    blockedAgainstStored({ interests: ["new", BAD] }, { interests: [BAD, "old"] }, ["interests"]),
    null,
  );
  // But adding a second dirty entry is, and the refusal names which one.
  assert.equal(
    blockedAgainstStored({ interests: [BAD, `${BAD} two`] }, { interests: [BAD] }, ["interests"]),
    "interests[1]",
  );
});

test("clearing a field is never a moderation event", () => {
  assert.equal(blockedAgainstStored({ bio: "" }, { bio: BAD }, suspectProfileFields({ bio: "" })), null);
  assert.equal(blockedIn({ interests: [] }), null);
});

test("blockedProfileField reads the row only when something trips", async () => {
  let reads = 0;
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            reads += 1;
            return { data: { bio: BAD }, error: null };
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof blockedProfileField>[0];

  assert.equal(await blockedProfileField(client, "u1", { bio: "all clear" }), null);
  assert.equal(reads, 0, "a clean save must not pay for a users read");

  assert.equal(await blockedProfileField(client, "u1", { bio: BAD }), null);
  assert.equal(reads, 1, "the stored row answers 'was this already here?'");

  assert.equal(await blockedProfileField(client, "u1", { headline: BAD }), "headline");
  assert.equal(reads, 2);
});
