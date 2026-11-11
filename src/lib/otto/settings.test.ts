/**
 * Otto's settings blob (settings.ts, Nov 10, 2026): the PATCH allowlist and
 * the merges pulled out of the two Otto routes, behaviour unchanged, plus
 * the new `look` key.
 *
 * Run with:
 *   node --test src/lib/otto/settings.test.ts
 *
 * WHY THE RESOLVE HOOK: settings.ts imports "../push/payload", which imports
 * its own neighbours without an extension; tsc and Next resolve those, Node's
 * type stripping doesn't (the payload.test.ts pattern).
 */
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("settings.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const S = await import("./settings");

const DEFAULTS = {
  chattiness: "moderate",
  rsvp_day_before: true,
  mention_pings: true,
  // Off by default since Nov 10, 2026 (Wave 2A): the only vanity notice.
  milestone_pings: false,
  daily_summary: false,
  summary_time: "09:00",
  unanswered_dm_pings: false,
  look: { colour: "ember", motion: "living" },
};

test("the allowlist keeps every known key as it was", () => {
  const patch = {
    chattiness: "quiet",
    rsvp_day_before: false,
    mention_pings: false,
    milestone_pings: true,
    daily_summary: true,
    summary_time: "07:30",
    unanswered_dm_pings: true,
    theme: "dark",
    push: { previews: false, off: ["dm", "like"] },
  };
  // push.off comes back deduped in PUSH_KINDS order.
  assert.deepEqual(S.sanitizePatch(patch), { ...patch, push: { previews: false, off: ["like", "dm"] } });
});

test("unknown keys and push sub-keys are dropped, not refused", () => {
  assert.deepEqual(S.sanitizePatch({ shoe_size: 11, chattiness: "loud" }), { chattiness: "loud" });
  assert.deepEqual(S.sanitizePatch({ push: { previews: true, colour: "red" } }), { push: { previews: true } });
  assert.deepEqual(S.sanitizePatch({ push: {} }), {});
  // "mention" lives in mention_pings; unknown kinds never reach the column.
  assert.deepEqual(S.sanitizePatch({ push: { off: ["mention", "nope", "follow", "follow"] } }), {
    push: { off: ["follow"] },
  });
});

test("a bad value for a known key is refused, as before", () => {
  for (const bad of [
    null,
    "x",
    { chattiness: "shouty" },
    { rsvp_day_before: "yes" },
    { summary_time: "9:00" },
    { theme: "night" },
    { push: [] },
    { push: { previews: 1 } },
    { push: { off: "dm" } },
    { push: { off: new Array(33).fill("dm") } },
  ]) {
    const out = S.sanitizePatch(bad);
    assert.ok("error" in out, JSON.stringify(bad));
  }
});

test("look is sanitized by the look rules", () => {
  assert.deepEqual(S.sanitizePatch({ look: { colour: "canal", motion: "still" } }), {
    look: { colour: "canal", motion: "still" },
  });
  assert.deepEqual(S.sanitizePatch({ look: { motion: "still", glitter: true } }), { look: { motion: "still" } });
  assert.deepEqual(S.sanitizePatch({ look: {} }), {});
  for (const bad of [{ look: "canal" }, { look: [] }, { look: { colour: "pink" } }, { look: { motion: "wild" } }]) {
    assert.ok("error" in S.sanitizePatch(bad), JSON.stringify(bad));
  }
});

test("the push merge is unchanged: shallow, then push one level deeper", () => {
  const stored = { chattiness: "loud", theme: "dark", push: { previews: false, off: ["dm"] }, legacy: 1 };
  const patch = S.sanitizePatch({ push: { previews: true } });
  assert.ok(!("error" in patch));
  assert.deepEqual(S.applySettingsPatch(stored, patch), {
    chattiness: "loud",
    theme: "dark",
    push: { previews: true, off: ["dm"] },
    legacy: 1,
  });
  // push.off is a full replacement list.
  const off = S.sanitizePatch({ push: { off: ["like"] } });
  assert.ok(!("error" in off));
  assert.deepEqual(S.applySettingsPatch(stored, off).push, { previews: false, off: ["like"] });
  // Nothing stored (or junk stored): the patch alone.
  assert.deepEqual(S.applySettingsPatch(null, { chattiness: "quiet" }), { chattiness: "quiet" });
  assert.deepEqual(S.applySettingsPatch({ push: "junk" }, { push: { previews: true } }), { push: { previews: true } });
  // The stored blob itself is never changed.
  assert.deepEqual(stored.push, { previews: false, off: ["dm"] });
});

test("a look patch keeps the stored half it doesn't name, and junk stored reads as the default", () => {
  const stored = { look: { colour: "rose", motion: "living" } };
  assert.deepEqual(S.applySettingsPatch(stored, { look: { motion: "still" } }).look, { colour: "rose", motion: "still" });
  assert.deepEqual(S.applySettingsPatch({ look: "x" }, { look: { colour: "onyx" } }).look, {
    colour: "onyx",
    motion: "living",
  });
});

test("mergeSettings lays the stored blob over the defaults, as the Otto route did", () => {
  assert.deepEqual(S.mergeSettings(null), DEFAULTS);
  assert.deepEqual(S.mergeSettings("junk"), DEFAULTS);
  assert.deepEqual(
    S.mergeSettings({
      chattiness: "loud",
      rsvp_day_before: false,
      summary_time: "bad",
      daily_summary: "yes",
      theme: "dark",
      push: { previews: false },
      look: { colour: "midnight", motion: "still" },
    }),
    { ...DEFAULTS, chattiness: "loud", rsvp_day_before: false, look: { colour: "midnight", motion: "still" } },
  );
  assert.equal(S.mergeSettings({ chattiness: "shouty" }).chattiness, "moderate");
  assert.deepEqual(S.mergeSettings({ look: { colour: "pink" } }).look, { colour: "ember", motion: "living" });
  // Fresh objects: a caller can't change the defaults through a result.
  const a = S.mergeSettings(null);
  a.look.colour = "onyx";
  assert.equal(S.mergeSettings(null).look.colour, "ember");
});

test("like milestones are off by default, and a stored yes still wins", () => {
  assert.equal(S.DEFAULT_SETTINGS.milestone_pings, false);
  assert.equal(S.mergeSettings(null).milestone_pings, false);
  assert.equal(S.mergeSettings({}).milestone_pings, false);
  assert.equal(S.mergeSettings({ milestone_pings: true }).milestone_pings, true);
});
