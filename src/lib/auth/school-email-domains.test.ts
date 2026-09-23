/**
 * Tests for the school email allowlist (`school-email-domains.ts`).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/auth/school-email-domains.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't add file extensions,
 * but the module imports "../iu/campuses" extensionless, which is what Next's
 * bundler and tsc's `moduleResolution: "bundler"` expect. An in-thread
 * resolve hook retries a failed relative specifier with ".ts"; the module
 * under test loads through dynamic `import()` so the hook is registered first
 * (same pattern as `src/lib/iu/campuses.test.ts`).
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
  throw new Error("school-email-domains.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  DEFAULT_SCHOOL_EMAIL_DOMAINS,
  PURDUE_SIGNUPS_ENABLED,
  RETIRED_IU_DOMAINS,
  SCHOOL_IDENTITY_DOMAINS,
  SYSTEM_DOMAINS,
  allowedSchoolSystemForEmail,
  codeSchoolEmailDomains,
  hostMatches,
  isRetiredIuDomain,
  isSchoolEmail,
  normalizeSchoolEmail,
  parseSchoolEmailDomains,
  retiredIuDomainFor,
  schoolEmailDomains,
  schoolEmailDomainsLabel,
  schoolEmailRejection,
  schoolIdentityDomainFor,
  schoolSystemForEmail,
  schoolSystemPatch,
  singleCampusForEmail,
} = await import("./school-email-domains");

const PURDUE = { purdueEnabled: true } as const;
const NO_PURDUE = { purdueEnabled: false } as const;

/** Run `fn` with SCHOOL_EMAIL_DOMAINS set to `value`, then restore it. */
function withEnv(value: string | undefined, fn: () => void) {
  const before = process.env.SCHOOL_EMAIL_DOMAINS;
  if (value === undefined) delete process.env.SCHOOL_EMAIL_DOMAINS;
  else process.env.SCHOOL_EMAIL_DOMAINS = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.SCHOOL_EMAIL_DOMAINS;
    else process.env.SCHOOL_EMAIL_DOMAINS = before;
  }
}

// Hermetic: a SCHOOL_EMAIL_DOMAINS left in the developer's shell must not
// narrow the tests that don't set it through withEnv.
delete process.env.SCHOOL_EMAIL_DOMAINS;

// ── Wave 1 acceptance (plan §6, contract C2) ───────────────────────────────

test("acceptance: a subdomain of iu.edu is IU", () => {
  assert.equal(schoolSystemForEmail("a@mail.iu.edu"), "iu");
});

test("acceptance: purdue.edu is purdue while the flag is on, null when disabled", () => {
  assert.equal(PURDUE_SIGNUPS_ENABLED, true);
  assert.equal(schoolSystemForEmail("a@purdue.edu"), "purdue");
  assert.equal(schoolSystemForEmail("a@purdue.edu", NO_PURDUE), null);
});

test("acceptance: iupui.edu is a retired IU domain", () => {
  assert.equal(isRetiredIuDomain("a@iupui.edu"), true);
});

test("acceptance: pfw.edu points at the shared Fort Wayne campus", () => {
  assert.equal(singleCampusForEmail("a@pfw.edu"), "fort-wayne");
});

test("acceptance: SCHOOL_EMAIL_DOMAINS can't add iupui.edu", () => {
  assert.deepEqual(parseSchoolEmailDomains("iu.edu,iupui.edu"), ["iu.edu"]);
  assert.deepEqual(parseSchoolEmailDomains("iupui.edu"), ["iu.edu", "purdue.edu"]);
  withEnv("iu.edu, iupui.edu", () => {
    assert.deepEqual(schoolEmailDomains(), ["iu.edu"]);
    assert.equal(isSchoolEmail("a@iupui.edu"), false);
    assert.equal(allowedSchoolSystemForEmail("a@iupui.edu"), null);
  });
});

// ── System map ─────────────────────────────────────────────────────────────

test("system map: the code domains", () => {
  assert.deepEqual([...SYSTEM_DOMAINS.iu], ["iu.edu"]);
  // @pfw.edu / @pnw.edu are held back until their student address format is
  // confirmed: in the single-campus map, out of the allowlist.
  assert.deepEqual([...SYSTEM_DOMAINS.purdue], ["purdue.edu"]);
  assert.deepEqual([...DEFAULT_SCHOOL_EMAIL_DOMAINS], ["iu.edu", "purdue.edu"]);
  assert.deepEqual(codeSchoolEmailDomains(PURDUE), ["iu.edu", "purdue.edu"]);
  assert.deepEqual(codeSchoolEmailDomains(NO_PURDUE), ["iu.edu"]);
});

test("system map: every Purdue domain and subdomain maps to purdue, and to null when disabled", () => {
  for (const email of ["a@purdue.edu", "a@mail.purdue.edu", "A@PURDUE.EDU", "a@alumni.purdue.edu"]) {
    assert.equal(schoolSystemForEmail(email), "purdue", email);
    assert.equal(schoolSystemForEmail(email, NO_PURDUE), null, email);
  }
  // Held back on purpose, in both modes.
  for (const email of ["a@pfw.edu", "A@PFW.EDU", "a@pnw.edu", "a@mail.pnw.edu"]) {
    assert.equal(schoolSystemForEmail(email), null, email);
    assert.equal(schoolSystemForEmail(email, PURDUE), null, email);
  }
});

test("system map: lookalikes, retired, malformed and other schools are null", () => {
  for (const email of [
    "a@evil-iu.edu",
    "a@iu.edu.evil.com",
    "a@notpurdue.edu",
    "a@iupui.edu",
    "a@mail.iupui.edu",
    "a@indiana.edu",
    "a@uindy.edu",
    "a@gmail.com",
    "iu.edu",
    "@iu.edu",
    "a@b@iu.edu",
    "a@xn--iu-edu.iu.edu",
  ]) {
    assert.equal(schoolSystemForEmail(email, PURDUE), null, email);
  }
  assert.equal(schoolSystemForEmail("  A@IU.EDU. "), "iu");
});

// ── Retired domains ────────────────────────────────────────────────────────

test("retired: every retired IU domain and its subdomains, never iu.edu", () => {
  assert.equal(RETIRED_IU_DOMAINS.length, 9);
  for (const d of RETIRED_IU_DOMAINS) {
    assert.equal(isRetiredIuDomain(`a@${d}`), true, d);
    assert.equal(isRetiredIuDomain(`a@mail.${d}`), true, d);
    assert.equal(retiredIuDomainFor(`a@mail.${d}`), d);
  }
  assert.equal(isRetiredIuDomain("a@iu.edu"), false);
  assert.equal(isRetiredIuDomain("a@mail.iu.edu"), false);
  assert.equal(isRetiredIuDomain("a@purdue.edu"), false);
  assert.equal(isRetiredIuDomain("iupui.edu"), false); // an email, not a bare domain
});

test("retired: isSchoolEmail rejects them even from an explicit list", () => {
  assert.equal(isSchoolEmail("a@iupui.edu", ["iu.edu", "iupui.edu"]), false);
  assert.equal(isSchoolEmail("a@iu.edu", ["iu.edu", "iupui.edu"]), true);
});

// ── Env narrowing (critic C2) ──────────────────────────────────────────────

test("env: narrows only, and can't widen past the code map", () => {
  // pfw.edu is outside the code ceiling, so it is dropped rather than added.
  assert.deepEqual(parseSchoolEmailDomains("purdue.edu,pfw.edu"), ["purdue.edu"]);
  // A mixed list keeps only the entries inside the ceiling.
  assert.deepEqual(parseSchoolEmailDomains("iu.edu,purdue.edu", NO_PURDUE), ["iu.edu"]);
  // With Purdue disabled the same env value has nothing valid left, so the
  // code map wins rather than the env widening it.
  assert.deepEqual(parseSchoolEmailDomains("purdue.edu,pfw.edu", NO_PURDUE), ["iu.edu"]);
  withEnv("iu.edu", () => {
    assert.deepEqual(schoolEmailDomains(), ["iu.edu"]);
    assert.equal(isSchoolEmail("a@purdue.edu"), false);
    assert.notEqual(schoolEmailRejection("a@purdue.edu"), null);
  });
});

test("env: narrows to a subset or a subdomain of the code map", () => {
  assert.deepEqual(parseSchoolEmailDomains("purdue.edu", PURDUE), ["purdue.edu"]);
  assert.deepEqual(parseSchoolEmailDomains(" @Mail.IU.edu. , *.gmail.com", PURDUE), ["mail.iu.edu"]);
  withEnv("mail.iu.edu", () => {
    assert.equal(isSchoolEmail("a@mail.iu.edu"), true);
    assert.equal(isSchoolEmail("a@iu.edu"), false);
    assert.equal(allowedSchoolSystemForEmail("a@iu.edu"), null);
    assert.equal(allowedSchoolSystemForEmail("a@x.mail.iu.edu"), "iu");
    assert.equal(schoolEmailDomainsLabel(), "@mail.iu.edu");
  });
  withEnv("purdue.edu", () => {
    assert.equal(allowedSchoolSystemForEmail("a@purdue.edu", PURDUE), "purdue");
    assert.equal(allowedSchoolSystemForEmail("a@iu.edu", PURDUE), null);
    assert.deepEqual(schoolEmailDomains(NO_PURDUE), ["iu.edu"]);
  });
});

test("env: blank or unset falls back to the code map", () => {
  assert.deepEqual(parseSchoolEmailDomains(undefined), ["iu.edu", "purdue.edu"]);
  assert.deepEqual(parseSchoolEmailDomains(" , ,"), ["iu.edu", "purdue.edu"]);
  withEnv(undefined, () => {
    assert.deepEqual(schoolEmailDomains(), ["iu.edu", "purdue.edu"]);
    assert.equal(allowedSchoolSystemForEmail("a@iu.edu"), "iu");
  });
});

// ── Single-campus domains ──────────────────────────────────────────────────

test("single campus: pnw.edu, subdomains, and everything else", () => {
  assert.equal(singleCampusForEmail("a@pnw.edu"), "purdue-northwest");
  assert.equal(singleCampusForEmail("a@mail.pfw.edu"), "fort-wayne");
  assert.equal(singleCampusForEmail("a@iu.edu"), null);
  assert.equal(singleCampusForEmail("a@purdue.edu"), null);
  assert.equal(singleCampusForEmail("a@notpfw.edu"), null);
  assert.equal(singleCampusForEmail("not an email"), null);
});

// ── Label + copy (critic B4) ───────────────────────────────────────────────

test("label: flag-aware headline domains, explicit lists keep the old join", () => {
  withEnv(undefined, () => {
    assert.equal(schoolEmailDomainsLabel(), "@iu.edu or @purdue.edu");
    assert.equal(schoolEmailDomainsLabel(NO_PURDUE), "@iu.edu");
  });
  assert.equal(schoolEmailDomainsLabel(["iu.edu"]), "@iu.edu");
  assert.equal(schoolEmailDomainsLabel(["a.edu", "b.edu"]), "@a.edu or @b.edu");
  assert.equal(schoolEmailDomainsLabel(["a.edu", "b.edu", "c.edu"]), "@a.edu, @b.edu, or @c.edu");
});

test("copy: retired domains point to @iu.edu", () => {
  assert.deepEqual(schoolEmailRejection("a@iupui.edu"), {
    code: "retired_domain",
    error: "IU retired @iupui.edu addresses on Jan 1, 2026. Use your @iu.edu address.",
  });
  assert.deepEqual(schoolEmailRejection("a@mail.indiana.edu", PURDUE), {
    code: "retired_domain",
    error: "IU retired @indiana.edu addresses. Use your @iu.edu address.",
  });
});

test("copy: never mentions Purdue while Purdue is disabled", () => {
  withEnv(undefined, () => {
    for (const email of ["a@purdue.edu", "a@pfw.edu", "a@gmail.com", "a@uindy.edu"]) {
      const request = schoolEmailRejection(email, NO_PURDUE);
      const verify = schoolEmailRejection(email, { ...NO_PURDUE, context: "verify" });
      assert.equal(request?.code, "domain_not_allowed", email);
      assert.equal(request?.error, "Use your school email (@iu.edu).");
      assert.doesNotMatch(request?.error ?? "", /purdue/i);
      assert.doesNotMatch(verify?.error ?? "", /purdue/i);
      assert.match(verify?.error ?? "", /@iu\.edu/);
    }
  });
});

test("copy: names both universities once Purdue is on", () => {
  assert.equal(
    schoolEmailRejection("a@gmail.com", PURDUE)?.error,
    "Use your IU or Purdue school email (@iu.edu or @purdue.edu).",
  );
  assert.match(schoolEmailRejection("a@gmail.com", { ...PURDUE, context: "verify" })?.error ?? "", /IU or Purdue/);
  assert.equal(schoolEmailRejection("a@purdue.edu", PURDUE), null);
});

test("copy: accepted addresses have no rejection", () => {
  withEnv(undefined, () => {
    assert.equal(schoolEmailRejection("a@iu.edu"), null);
    assert.equal(schoolEmailRejection("a@mail.iu.edu"), null);
  });
  assert.equal(schoolEmailRejection("a@iu.edu", { domains: ["purdue.edu"] })?.code, "domain_not_allowed");
});

test("normalize: unchanged canonical form", () => {
  assert.equal(normalizeSchoolEmail("  Jane.Doe@Mail.IU.EDU. "), "jane.doe@mail.iu.edu");
  assert.equal(normalizeSchoolEmail("nope"), null);
});

// ── Apply decision: system change and the campus (Franky Q1, critic B3) ────

test("patch: first stamp and same-system re-verify touch only the system", () => {
  assert.deepEqual(schoolSystemPatch(null, "iu"), { school_system: "iu" });
  assert.deepEqual(schoolSystemPatch({}, "purdue"), { school_system: "purdue" });
  assert.deepEqual(schoolSystemPatch({ school_system: null, campus_id: null }, "iu"), { school_system: "iu" });
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: "iu-bloomington" }, "iu"),
    { school_system: "iu" },
  );
  // Same system with an id the campus lib doesn't know: still untouched.
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: "some-future-campus" }, "iu"),
    { school_system: "iu" },
  );
});

test("patch: a shared campus survives a system change", () => {
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: "indianapolis" }, "purdue"),
    { school_system: "purdue", school: "Purdue Indianapolis" },
  );
  assert.deepEqual(
    schoolSystemPatch({ school_system: "purdue", campus_id: "indianapolis" }, "iu"),
    { school_system: "iu", school: "IU Indianapolis" },
  );
  const fw = schoolSystemPatch({ school_system: "iu", campus_id: "fort-wayne" }, "purdue");
  assert.equal(fw.school_system, "purdue");
  assert.equal("campus_id" in fw, false);
});

test("patch: a single-system campus is cleared on a system change", () => {
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: "iu-bloomington" }, "purdue"),
    { school_system: "purdue", campus_id: null, school: "" },
  );
  assert.deepEqual(
    schoolSystemPatch({ school_system: "purdue", campus_id: "purdue-west-lafayette" }, "iu"),
    { school_system: "iu", campus_id: null, school: "" },
  );
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: "not-a-campus" }, "purdue"),
    { school_system: "purdue", campus_id: null, school: "" },
  );
});

test("patch: a system change with no campus re-derives the legacy label only", () => {
  assert.deepEqual(
    schoolSystemPatch({ school_system: "iu", campus_id: null }, "purdue"),
    { school_system: "purdue", school: "" },
  );
});

test("patch: campus_set_at is never part of the patch", () => {
  const rows = [
    null,
    { school_system: "iu", campus_id: "indianapolis" },
    { school_system: "iu", campus_id: "iu-kokomo" },
    { school_system: "purdue", campus_id: "purdue-northwest" },
    { school_system: null, campus_id: "iu-kokomo" },
  ];
  for (const row of rows) {
    for (const next of ["iu", "purdue"] as const) {
      const patch = schoolSystemPatch(row, next);
      assert.equal("campus_set_at" in patch, false);
      assert.equal(patch.school_system, next);
    }
  }
});

test("hostMatches: a domain and its subdomains, nothing else", () => {
  assert.equal(hostMatches("iu.edu", "iu.edu"), true);
  assert.equal(hostMatches("mail.iu.edu", "iu.edu"), true);
  assert.equal(hostMatches("a.b.iu.edu", "iu.edu"), true);
  // The dot matters: "notiu.edu" is somebody else's domain.
  assert.equal(hostMatches("notiu.edu", "iu.edu"), false);
  assert.equal(hostMatches("iu.edu.example.com", "iu.edu"), false);
});

test("identity domains: the fold ceiling ignores the Purdue flag", () => {
  // Restriction keys outlive launch flags (src/lib/moderation/identity.ts),
  // so both systems are always in the ceiling.
  assert.ok(SCHOOL_IDENTITY_DOMAINS.includes("iu.edu"));
  assert.ok(SCHOOL_IDENTITY_DOMAINS.includes("purdue.edu"));
  assert.ok(SCHOOL_IDENTITY_DOMAINS.includes("pfw.edu"));
  assert.ok(SCHOOL_IDENTITY_DOMAINS.includes("pnw.edu"));
  // And it never reaches past the code map.
  for (const retired of RETIRED_IU_DOMAINS) {
    assert.equal(SCHOOL_IDENTITY_DOMAINS.includes(retired), false, retired);
  }
});

test("schoolIdentityDomainFor: subdomains fold, everything else is null", () => {
  assert.equal(schoolIdentityDomainFor("a@iu.edu"), "iu.edu");
  assert.equal(schoolIdentityDomainFor("a@mail.iu.edu"), "iu.edu");
  assert.equal(schoolIdentityDomainFor("A@Mail.IU.EDU."), "iu.edu");
  assert.equal(schoolIdentityDomainFor("a@purdue.edu"), "purdue.edu");
  assert.equal(schoolIdentityDomainFor("a@mail.purdue.edu"), "purdue.edu");
  // Retired IU domains deliver nothing, so they are not identities.
  assert.equal(schoolIdentityDomainFor("a@iupui.edu"), null);
  assert.equal(schoolIdentityDomainFor("a@mail.iupui.edu"), null);
  // Personal and lookalike hosts never fold into a school domain.
  assert.equal(schoolIdentityDomainFor("a@gmail.com"), null);
  assert.equal(schoolIdentityDomainFor("a@notiu.edu"), null);
  assert.equal(schoolIdentityDomainFor("a@iu.edu.example.com"), null);
  assert.equal(schoolIdentityDomainFor("not-an-address"), null);
});

test("normalizeSchoolEmail keeps what the identity fold drops", () => {
  // Stated out loud because the two look interchangeable and are not: this is
  // the stored column, canonicalSchoolIdentity is the ban key.
  assert.equal(normalizeSchoolEmail("Fra+2@Mail.IU.edu"), "fra+2@mail.iu.edu");
});
