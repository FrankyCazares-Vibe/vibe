/**
 * Tests for the onboarding boot payload (`boot.ts`, plan §3.3–3.4, wave 2 B7).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/onboarding/boot.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. An in-thread resolve hook maps "@/x" to "src/x.ts"
 * and retries a failed relative specifier with ".ts" (same pattern as
 * `src/lib/profile/onboarding-prefill.test.ts`). The module loads through
 * dynamic `import()` so the hook is registered first.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

import type { OnboardingBoot } from "./boot";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("boot.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  campusOptionsForSystem,
  injectOnbBoot,
  jsonForScriptTag,
  onbBootScriptTag,
  preselectCampusId,
} = await import("./boot");

const PREFILL: OnboardingBoot["prefill"] = {
  name: "",
  handle: "",
  bio: "",
  major: "",
  department: "",
  year: null,
  interests: [],
  skills: [],
  looking_for: [],
  campusId: null,
  campusConfirmed: false,
  avatarUrl: null,
  hasRealHandle: false,
};

function boot(overrides: Partial<OnboardingBoot> = {}): OnboardingBoot {
  return {
    replay: false,
    userId: "00000000-0000-4000-8000-000000000001",
    system: "iu",
    prefill: PREFILL,
    singleCampusId: null,
    ...overrides,
  };
}

// ── campusOptionsForSystem ───────────────────────────────────────────────

test("campus options: shared communities come first, for both systems", () => {
  for (const system of ["iu", "purdue"] as const) {
    const options = campusOptionsForSystem(system);
    assert.equal(options[0].id, "indianapolis");
    assert.equal(options[1].id, "fort-wayne");
    assert.equal(options[0].shared, true);
    assert.equal(options[1].shared, true);
    assert.equal(options.filter((o) => o.shared).length, 2);
  }
});

test("campus options: only the viewer's own university's campuses", () => {
  const iu = campusOptionsForSystem("iu").map((o) => o.id);
  const purdue = campusOptionsForSystem("purdue").map((o) => o.id);

  assert.ok(iu.includes("iu-bloomington"));
  assert.ok(!iu.includes("purdue-west-lafayette"));
  assert.ok(!iu.includes("purdue-northwest"));

  assert.ok(purdue.includes("purdue-west-lafayette"));
  assert.ok(!purdue.includes("iu-bloomington"));

  // The shared communities are the whole overlap.
  assert.deepEqual(
    iu.filter((id) => purdue.includes(id)),
    ["indianapolis", "fort-wayne"],
  );
});

test("campus options: the shared sub-line names the OTHER university", () => {
  const iuIndy = campusOptionsForSystem("iu")[0];
  assert.equal(
    iuIndy.sharedWith,
    "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)",
  );

  const purdueIndy = campusOptionsForSystem("purdue")[0];
  assert.equal(
    purdueIndy.sharedWith,
    "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)",
  );

  // "formerly IUPUI" is said once, in the picker, and only for Indianapolis.
  const fortWayne = campusOptionsForSystem("iu")[1];
  assert.equal(fortWayne.sharedWith, "IU Fort Wayne · one community with Purdue Fort Wayne");
});

test("campus options: a single-system campus has no shared copy", () => {
  const bloomington = campusOptionsForSystem("iu").find((o) => o.id === "iu-bloomington");
  assert.ok(bloomington);
  assert.equal(bloomington.shared, false);
  assert.equal(bloomington.sharedWith, null);
  assert.equal(bloomington.shortName, "Bloomington");
  assert.equal(bloomington.name, "IU Bloomington");
});

test("campus options: only Indianapolis is open at launch", () => {
  for (const system of ["iu", "purdue"] as const) {
    const open = campusOptionsForSystem(system).filter((o) => o.isOpen).map((o) => o.id);
    assert.deepEqual(open, ["indianapolis"]);
  }
});

test("campus options: no system allows nothing", () => {
  assert.deepEqual(campusOptionsForSystem(null), []);
  assert.deepEqual(campusOptionsForSystem(undefined), []);
  assert.deepEqual(campusOptionsForSystem("harvard" as never), []);
});

// ── preselectCampusId ────────────────────────────────────────────────────

test("preselect: only @pfw.edu / @pnw.edu point at one campus", () => {
  assert.equal(preselectCampusId("a@pfw.edu", "purdue"), "fort-wayne");
  assert.equal(preselectCampusId("a@mail.pnw.edu", "purdue"), "purdue-northwest");
  // The addresses that prove a system but not a campus preselect nothing.
  assert.equal(preselectCampusId("a@iu.edu", "iu"), null);
  assert.equal(preselectCampusId("a@purdue.edu", "purdue"), null);
});

test("preselect: never offers a campus outside the stamped system", () => {
  // Purdue Northwest isn't in IU's allowed set, so a mismatched row gets
  // nothing rather than a campus the DB trigger would reject.
  assert.equal(preselectCampusId("a@pnw.edu", "iu"), null);
  // Fort Wayne is shared, so it stays valid for either system.
  assert.equal(preselectCampusId("a@pfw.edu", "iu"), "fort-wayne");
});

test("preselect: no email, no system, junk → null", () => {
  assert.equal(preselectCampusId("a@pfw.edu", null), null);
  assert.equal(preselectCampusId("", "purdue"), null);
  assert.equal(preselectCampusId("   ", "purdue"), null);
  assert.equal(preselectCampusId(null, "purdue"), null);
  assert.equal(preselectCampusId(undefined, "purdue"), null);
  assert.equal(preselectCampusId(42, "purdue"), null);
  assert.equal(preselectCampusId("not-an-email", "purdue"), null);
});

// ── jsonForScriptTag ─────────────────────────────────────────────────────

test("script JSON: a value can never close the script tag", () => {
  const nasty = jsonForScriptTag({ bio: "</script><script>alert(1)</script>" });
  assert.ok(!nasty.includes("</script"));
  assert.ok(!nasty.includes("<"));
  // Still valid JSON, and the original text survives the escaping.
  assert.equal(
    (JSON.parse(nasty) as { bio: string }).bio,
    "</script><script>alert(1)</script>",
  );
});

test("script JSON: line separators are escaped, undefined becomes null", () => {
  const out = jsonForScriptTag({ bio: "a b c" });
  assert.ok(!out.includes(" "));
  assert.ok(!out.includes(" "));
  assert.equal((JSON.parse(out) as { bio: string }).bio, "a b c");
  assert.equal(jsonForScriptTag(undefined), "null");
});

// ── the tag and its injection ────────────────────────────────────────────

test("boot tag: round-trips the payload the clients read", () => {
  const value = boot({ replay: true, singleCampusId: "fort-wayne", system: "purdue" });
  const tag = onbBootScriptTag(value);
  assert.ok(tag.startsWith('<script id="onbBoot" type="application/json">'));
  assert.ok(tag.endsWith("</script>"));

  const json = tag.slice(tag.indexOf(">") + 1, tag.lastIndexOf("</script>"));
  assert.deepEqual(JSON.parse(json), value);
});

test("boot tag: injected before </head>, once", () => {
  const html = "<!DOCTYPE html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>hi</body>\n</html>";
  const out = injectOnbBoot(html, boot());

  assert.equal(out.split('id="onbBoot"').length - 1, 1);
  assert.ok(out.indexOf('id="onbBoot"') < out.indexOf("</head>"));
  assert.ok(out.indexOf("<title>") < out.indexOf('id="onbBoot"'));
  // Nothing else about the page changes.
  assert.ok(out.includes("<body>hi</body>"));
});

test("boot tag: a page with no </head> still gets its data", () => {
  const out = injectOnbBoot("<div>only a fragment</div>", boot());
  assert.ok(out.startsWith('<script id="onbBoot"'));
  assert.ok(out.includes("<div>only a fragment</div>"));
});

test("boot tag: hostile prefill text can't break out of the tag", () => {
  const out = injectOnbBoot(
    "<head></head>",
    boot({ prefill: { ...PREFILL, bio: "</script><img src=x onerror=alert(1)>" } }),
  );
  // Exactly one closing tag: the one this module wrote.
  assert.equal(out.split("</script>").length - 1, 1);
  assert.ok(!out.includes("<img"));
});
