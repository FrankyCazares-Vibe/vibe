/**
 * Tests for `campus-confirm-banner-view.ts`, the pure state behind
 * `CampusConfirmBanner` (wave plan B14t; critic W3 L8 stand-in: the banner
 * has no screen until CM mounts it in wave 4, so its render check is
 * deferred there and these cases pin which card shows, and when).
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/mobile/campus-confirm-banner-view.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `src/lib/onboarding/finish.test.ts` — Node's
 * type stripping doesn't resolve the "@/…" alias or add file extensions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("campus-confirm-banner-view.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  CAMPUS_CONFIRM_DISMISSED_KEY,
  CAMPUS_CONFIRM_LOCK_NOTE,
  campusConfirmBannerView,
} = await import("./campus-confirm-banner-view");

/** Franky today: verified IU, Indianapolis backfilled, never confirmed. */
const unconfirmed = {
  ok: true,
  school_verified: true,
  otto_complete: true,
  school_system: "iu",
  campus_id: "indianapolis",
  campus_confirmed: false,
};

test("confirm: verified, campus set, not confirmed", () => {
  assert.deepEqual(campusConfirmBannerView(unconfirmed, false), {
    mode: "confirm",
    campusId: "indianapolis",
    title: "Confirm your campus",
    body: "Is Indianapolis still right?",
    note: "Confirming locks your campus for 30 days.",
  });
});

test("confirm uses shortName and the canonical id", () => {
  const v = campusConfirmBannerView(
    { ...unconfirmed, school_system: "purdue", campus_id: " Purdue-West-Lafayette " },
    false,
  );
  assert.equal(v?.mode, "confirm");
  assert.ok(v && v.mode === "confirm");
  assert.equal(v.campusId, "purdue-west-lafayette");
  assert.equal(v.body, "Is West Lafayette still right?");
});

test("pick: verified with no campus", () => {
  assert.deepEqual(campusConfirmBannerView({ ...unconfirmed, campus_id: null }, false), {
    mode: "pick",
    title: "Pick your campus",
    body: "Your campus decides the clubs, events and map you see.",
  });
});

test("pick: an unknown or other-university campus id never reads as confirm", () => {
  assert.equal(campusConfirmBannerView({ ...unconfirmed, campus_id: "nowhere" }, false)?.mode, "pick");
  assert.equal(
    campusConfirmBannerView({ ...unconfirmed, campus_id: "iu-bloomington", school_system: "purdue" }, false)
      ?.mode,
    "pick",
  );
});

test("hidden: already confirmed", () => {
  assert.equal(campusConfirmBannerView({ ...unconfirmed, campus_confirmed: true }, false), null);
});

test("pick: confirmed but no campus (switched universities keeps campus_set_at)", () => {
  assert.equal(
    campusConfirmBannerView(
      { school_verified: true, school_system: "purdue", campus_id: null, campus_confirmed: true },
      false,
    )?.mode,
    "pick",
  );
  assert.equal(
    campusConfirmBannerView({ ...unconfirmed, campus_id: "nowhere", campus_confirmed: true }, false)?.mode,
    "pick",
  );
  assert.equal(
    campusConfirmBannerView({ ...unconfirmed, campus_id: null, campus_confirmed: true }, true),
    null,
  );
});

test("hidden: not verified, or no university", () => {
  assert.equal(campusConfirmBannerView({ ...unconfirmed, school_verified: false }, false), null);
  assert.equal(campusConfirmBannerView({ ...unconfirmed, school_verified: "true" }, false), null);
  assert.equal(campusConfirmBannerView({ ...unconfirmed, school_system: null }, false), null);
  assert.equal(campusConfirmBannerView({ ...unconfirmed, school_system: "uindy" }, false), null);
});

test("hidden: Not now this session", () => {
  assert.equal(campusConfirmBannerView(unconfirmed, true), null);
  assert.equal(campusConfirmBannerView({ ...unconfirmed, campus_id: null }, true), null);
  assert.equal(CAMPUS_CONFIRM_DISMISSED_KEY, "vibe_campus_confirm_dismissed");
});

test("hidden: a failed load (no data)", () => {
  assert.equal(campusConfirmBannerView(null, false), null);
  assert.equal(campusConfirmBannerView(undefined, false), null);
});

test("the lock line matches Settings (B15) word for word", () => {
  assert.equal(CAMPUS_CONFIRM_LOCK_NOTE, "Confirming locks your campus for 30 days.");
  const settings = readFileSync(
    new URL("lib/profile/settings-campus-card.ts", SRC_ROOT),
    "utf8",
  );
  assert.ok(
    settings.includes(JSON.stringify(CAMPUS_CONFIRM_LOCK_NOTE)),
    "settings-campus-card.ts should carry the same lock line",
  );
});
