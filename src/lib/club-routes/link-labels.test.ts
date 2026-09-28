/**
 * Tests for `link-labels.ts`: the "only new link labels" word-filter rule
 * (security wave 2, A5b; moved from the old gate.test.ts, integration I1).
 * The gate's own cases now live in src/lib/orgs/hidden-gate.test.ts.
 *
 * Run with:
 *   node --test src/lib/club-routes/link-labels.test.ts
 *
 * WHY THE RESOLVE HOOK: link-labels.ts imports "../moderation/text-filter"
 * extensionless, which is what Next and tsc expect; Node's type stripping adds
 * no extension. Same pattern as src/lib/moderation/text-filter.test.ts.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("link-labels.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { hasBlockedNewLinkLabel } = await import("./link-labels");
const { filterTerms } = await import("../moderation/text-filter-list");

test("link labels: clean labels pass, a new blocked label is refused", () => {
  const term = filterTerms()[0]!.term;
  assert.equal(hasBlockedNewLinkLabel([{ label: "Instagram", url: "https://x.test/a" }], []), false);
  assert.equal(hasBlockedNewLinkLabel([], null), false);
  assert.equal(
    hasBlockedNewLinkLabel(
      [{ label: "Site", url: "https://x.test" }, { label: `the ${term}`, url: "https://x.test/b" }],
      [{ label: "Site", url: "https://x.test" }],
    ),
    true,
  );
});

test("link labels: a label already stored passes, so old data never blocks a save", () => {
  const term = filterTerms()[0]!.term;
  const stored = [{ label: `the ${term}`, url: "https://x.test/b" }];
  assert.equal(hasBlockedNewLinkLabel([{ label: `the ${term}`, url: "https://x.test/b" }], stored), false);
  // Junk in the stored column is "nothing stored", not a crash.
  assert.equal(hasBlockedNewLinkLabel([{ label: `the ${term}`, url: "https://x" }], "oops"), true);
  assert.equal(hasBlockedNewLinkLabel([{ label: `the ${term}`, url: "https://x" }], [null, 3, { label: 7 }]), true);
});
