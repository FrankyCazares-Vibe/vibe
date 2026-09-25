/**
 * Tests for `push-ask-view.ts`: which ask shows where, the snoozes, and what
 * a tap's answer does (plan §8.7, wave 3′b batch E1; B1–B6, W2, critic-w3.md
 * item 26).
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/push/push-ask-view.test.ts
 *
 * The subject has only `import type`, so it loads with no resolve hook; the
 * variable specifier keeps tsc from seeing a literal ".ts" import (TS5097).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { DevicePushStatus } from "@/lib/pwa/device-push";
import type { Platform } from "@/lib/pwa/display-mode";

const specifier = "./push-ask-view.ts";
const m = (await import(specifier)) as typeof import("./push-ask-view");

const NOW = Date.UTC(2026, 8, 25, 12);
const DAY = 24 * 60 * 60 * 1000;
const APP_STORE = "https://apps.apple.com/us/app/vibe/id000";
const PLAY = "https://play.google.com/store/apps/details?id=app.example";

const OFF: DevicePushStatus = { kind: "off" };
const ALL_STATUSES: DevicePushStatus[] = [
  { kind: "hidden" },
  { kind: "unsupported", why: "browser" },
  { kind: "unsupported", why: "app-update" },
  { kind: "unsupported", why: "app-build" },
  { kind: "needs-install" },
  { kind: "denied" },
  { kind: "off" },
  { kind: "on" },
];
const PLACEMENTS = ["otto", "campus", "dm"] as const;

type Input = Parameters<typeof m.pushAskView>[0];

function input(over: Partial<Input>): Input {
  return {
    placement: "otto",
    shell: null,
    standalone: false,
    platform: "ios-safari",
    status: OFF,
    snoozedAt: null,
    dmShown: false,
    storeUrl: null,
    now: NOW,
    ...over,
  };
}

const kindOf = (over: Partial<Input>) => m.pushAskView(input(over)).kind;

test("the store apps: the push ask only when this device is off (B2)", () => {
  for (const shell of ["ios-app", "android-app"] as const) {
    const platform: Platform = shell;
    for (const placement of PLACEMENTS) {
      for (const status of ALL_STATUSES) {
        const want = status.kind === "off" ? "push" : "none";
        assert.equal(kindOf({ shell, platform, placement, status }), want, `${shell} ${placement} ${status.kind}`);
      }
      // Never "Get the app" inside the app, even with a store URL.
      assert.equal(kindOf({ shell, platform, placement, storeUrl: APP_STORE }), "push");
    }
  }
});

test("the installed web app on a phone: the push ask only when off", () => {
  const phones: Platform[] = ["ios-safari", "ios-other-browser", "android-chrome", "android-samsung", "android-other"];
  for (const platform of phones) {
    for (const status of ALL_STATUSES) {
      const want = status.kind === "off" ? "push" : "none";
      assert.equal(kindOf({ standalone: true, platform, status, storeUrl: PLAY }), want, `${platform} ${status.kind}`);
    }
  }
});

test("computers never get an ask, installed or not, store URL or not", () => {
  const desktops: Platform[] = ["desktop-chromium", "desktop-safari", "firefox", "other"];
  for (const platform of desktops) {
    for (const standalone of [true, false]) {
      for (const status of ALL_STATUSES) {
        for (const placement of PLACEMENTS) {
          assert.equal(kindOf({ platform, standalone, status, placement, storeUrl: APP_STORE }), "none");
        }
      }
    }
  }
});

test("nothing before the platform or the status is known", () => {
  assert.equal(kindOf({ platform: null, shell: "ios-app" }), "none");
  assert.equal(kindOf({ status: null, shell: "ios-app", platform: "ios-app" }), "none");
  assert.equal(kindOf({ status: null, storeUrl: APP_STORE }), "none");
});

test("an iPhone tab: Get the app only with the App Store URL, never the prompt (B3, W13)", () => {
  for (const platform of ["ios-safari", "ios-other-browser"] as const) {
    for (const placement of PLACEMENTS) {
      const view = m.pushAskView(input({ platform, placement, status: { kind: "needs-install" }, storeUrl: APP_STORE }));
      assert.deepEqual(view, {
        kind: "get-app",
        title: "Vibe is better in the app",
        body: "Messages and club news on your lock screen.",
        href: APP_STORE,
      });
      // No listing yet: nothing at all (not the Home Screen steps; Settings has those).
      assert.equal(kindOf({ platform, placement, status: { kind: "needs-install" }, storeUrl: null }), "none");
    }
  }
});

test("an Android tab: Get the app once the Play URL is set, never the web-push ask (B4)", () => {
  for (const platform of ["android-chrome", "android-samsung"] as const) {
    for (const status of ALL_STATUSES) {
      const want = status.kind === "off" || status.kind === "needs-install" ? "get-app" : "none";
      assert.equal(kindOf({ platform, status, storeUrl: PLAY }), want, `${platform} ${status.kind}`);
      // Until the listing exists: nothing, whatever the status (Settings keeps its switch).
      assert.equal(kindOf({ platform, status, storeUrl: null }), "none");
    }
  }
});

test("hidden (the dark launch) hides every ask everywhere (W2)", () => {
  const platforms: Platform[] = ["ios-app", "android-app", "ios-safari", "android-chrome", "desktop-chromium"];
  for (const platform of platforms) {
    const shell = platform === "ios-app" || platform === "android-app" ? platform : null;
    for (const standalone of [true, false]) {
      for (const placement of PLACEMENTS) {
        const over = { platform, shell, standalone, placement, status: { kind: "hidden" } as const };
        assert.equal(kindOf({ ...over, storeUrl: APP_STORE }), "none");
      }
    }
  }
});

test("in-app browsers show nothing yet (B3)", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(kindOf({ platform: "ios-in-app", status, storeUrl: APP_STORE }), "none");
    assert.equal(kindOf({ platform: "android-other", status, storeUrl: PLAY }), "none");
  }
});

test("Otto and Campus snooze for 14 days each (B5)", () => {
  const app = { shell: "ios-app" as const, platform: "ios-app" as const };
  for (const placement of ["otto", "campus"] as const) {
    assert.equal(kindOf({ ...app, placement, snoozedAt: NOW - 1000 }), "none");
    assert.equal(kindOf({ ...app, placement, snoozedAt: NOW - 14 * DAY + 1000 }), "none");
    assert.equal(kindOf({ ...app, placement, snoozedAt: NOW - 14 * DAY }), "push");
    assert.equal(kindOf({ ...app, placement, snoozedAt: NOW - 30 * DAY }), "push");
    // Same for Get the app.
    const tab = { platform: "android-chrome" as const, storeUrl: PLAY, placement };
    assert.equal(kindOf({ ...tab, snoozedAt: NOW - DAY }), "none");
    assert.equal(kindOf({ ...tab, snoozedAt: NOW - 15 * DAY }), "get-app");
    // dmShown means nothing here.
    assert.equal(kindOf({ ...app, placement, dmShown: true }), "push");
  }
});

test("a snooze stamped far off in either direction (a clock change) doesn't stick", () => {
  assert.equal(m.isSnoozed(NOW + DAY, NOW), true);
  assert.equal(m.isSnoozed(NOW + 20 * DAY, NOW), false);
  assert.equal(m.isSnoozed(Number.NaN, NOW), false);
  assert.equal(m.isSnoozed(null, NOW), false);
});

test("the DM ask shows once per device and ignores the snooze (B5)", () => {
  const app = { shell: "android-app" as const, platform: "android-app" as const, placement: "dm" as const };
  assert.deepEqual(m.pushAskView(input(app)), {
    kind: "push",
    title: "Know when they reply",
    body: "",
    cta: "Turn on",
  });
  assert.equal(kindOf({ ...app, dmShown: true }), "none");
  assert.equal(kindOf({ ...app, snoozedAt: NOW - 1000 }), "push");
  assert.equal(kindOf({ platform: "ios-safari", placement: "dm", status: { kind: "needs-install" }, storeUrl: APP_STORE, dmShown: true }), "none");
});

test("the copy for each placement (plan §8.7 E1)", () => {
  const app = { shell: "ios-app" as const, platform: "ios-app" as const };
  assert.deepEqual(m.pushAskView(input({ ...app, placement: "otto" })), {
    kind: "push",
    title: "Get these on your lock screen",
    body: "Otto can tell you about messages, follows and your clubs, even when Vibe is closed.",
    cta: "Turn on",
  });
  assert.deepEqual(m.pushAskView(input({ ...app, placement: "campus" })), {
    kind: "push",
    title: "Turn on notifications",
    body: "Know when someone messages you or your clubs post.",
    cta: "Turn on",
  });
});

test("after the tap: thanks, blocked and can't all show a line, then go (B6)", () => {
  assert.deepEqual(m.afterTurnOn({ ok: true }, "ios-app"), { kind: "done", line: "You're set." });
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "on" } }, "ios-app"), {
    kind: "done",
    line: "You're set.",
  });
  const denied = m.afterTurnOn({ ok: false, status: { kind: "denied" } }, "ios-safari");
  assert.equal(denied.kind, "done");
  assert.match(denied.kind === "done" ? denied.line : "", /Settings has the steps/);
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "unsupported", why: "app-build" } }, "ios-app"), {
    kind: "done",
    line: "Notifications aren't set up in this version of the app yet.",
  });
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "unsupported", why: "app-update" } }, "ios-app"), {
    kind: "done",
    line: "Update Vibe from the App Store to turn on notifications.",
  });
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "unsupported", why: "app-update" } }, "android-app"), {
    kind: "done",
    line: "Update Vibe from Google Play to turn on notifications.",
  });
});

test("after the tap: other failures keep the buttons and say why; hidden goes at once", () => {
  // The prompt dismissed: nothing to say.
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "off" } }, "android-chrome"), {
    kind: "stay",
    line: null,
  });
  assert.deepEqual(
    m.afterTurnOn({ ok: false, status: { kind: "off" }, message: "Try again in a moment." }, "ios-app"),
    { kind: "stay", line: "Try again in a moment." },
  );
  assert.deepEqual(m.afterTurnOn(null, "ios-app"), {
    kind: "stay",
    line: "Couldn't turn on notifications. Try again.",
  });
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "hidden" } }, "ios-app"), { kind: "hide" });
  assert.deepEqual(m.afterTurnOn({ ok: false, status: { kind: "needs-install" } }, "ios-safari"), {
    kind: "hide",
  });
});

test("storage: the snooze record reads leniently and keeps the other placement", () => {
  assert.deepEqual(m.parseSnoozes(null), {});
  assert.deepEqual(m.parseSnoozes("not json"), {});
  assert.deepEqual(m.parseSnoozes("[1,2]"), {});
  assert.deepEqual(m.parseSnoozes("null"), {});
  assert.deepEqual(m.parseSnoozes(JSON.stringify({ otto: "1", campus: -5, dm: NOW })), {});
  assert.deepEqual(m.parseSnoozes(JSON.stringify({ otto: NOW, campus: NOW - DAY })), {
    otto: NOW,
    campus: NOW - DAY,
  });

  const one = m.withSnooze(null, "otto", NOW);
  assert.deepEqual(JSON.parse(one), { otto: NOW });
  const both = m.withSnooze(one, "campus", NOW + 5);
  assert.deepEqual(JSON.parse(both), { otto: NOW, campus: NOW + 5 });
  assert.deepEqual(JSON.parse(m.withSnooze("garbage", "campus", NOW)), { campus: NOW });

  assert.equal(m.snoozedAtFor(both, "otto"), NOW);
  assert.equal(m.snoozedAtFor(both, "campus"), NOW + 5);
  assert.equal(m.snoozedAtFor(both, "dm"), null);
  assert.equal(m.snoozedAtFor(null, "otto"), null);
});

test("storage: the DM key is shown only on exactly \"1\"; key names are fixed", () => {
  assert.equal(m.dmShownFrom("1"), true);
  assert.equal(m.dmShownFrom(null), false);
  assert.equal(m.dmShownFrom("0"), false);
  assert.equal(m.dmShownFrom("true"), false);
  // leave-device-clean.ts removes these two at sign-out (plan §8.2): same names.
  assert.equal(m.PUSH_ASK_KEY, "vibe_push_ask_v1");
  assert.equal(m.FIRST_DM_ASK_KEY, "vibe_first_dm_ask_v1");
  assert.equal(m.SNOOZE_MS, 14 * DAY);
});

test("askPossible: no device read where no ask can ever show", () => {
  const base = { placement: "otto" as const, shell: null, standalone: false, storeUrl: null };
  // Computers, installed or not, store URL or not.
  for (const platform of ["desktop-chromium", "desktop-safari", "firefox", "other"] as const) {
    for (const standalone of [true, false]) {
      assert.equal(m.askPossible({ ...base, platform, standalone, storeUrl: APP_STORE }), false, platform);
    }
  }
  // In-app browsers.
  assert.equal(m.askPossible({ ...base, platform: "ios-in-app", storeUrl: APP_STORE }), false);
  assert.equal(m.askPossible({ ...base, platform: "android-other", storeUrl: PLAY }), false);
  // A phone tab before its listing exists.
  assert.equal(m.askPossible({ ...base, platform: "ios-safari" }), false);
  assert.equal(m.askPossible({ ...base, platform: "android-chrome" }), false);
  // Hydrating.
  assert.equal(m.askPossible({ ...base, platform: null, shell: "ios-app" }), false);
  // Where an ask can show.
  assert.equal(m.askPossible({ ...base, platform: "ios-app", shell: "ios-app" }), true);
  assert.equal(m.askPossible({ ...base, platform: "android-app", shell: "android-app", placement: "dm" }), true);
  assert.equal(m.askPossible({ ...base, platform: "ios-safari", standalone: true }), true);
  assert.equal(m.askPossible({ ...base, platform: "android-chrome", storeUrl: PLAY }), true);
  assert.equal(m.askPossible({ ...base, platform: "ios-other-browser", storeUrl: APP_STORE }), true);
});

test("pushAskView never shows an ask askPossible rules out", () => {
  const platforms: (Platform | null)[] = [
    null, "ios-app", "android-app", "ios-safari", "ios-other-browser", "ios-in-app", "android-chrome",
    "android-samsung", "android-other", "desktop-chromium", "desktop-safari", "firefox", "other",
  ];
  for (const platform of platforms) {
    for (const shell of [null, "ios-app", "android-app"] as const) {
      for (const standalone of [true, false]) {
        for (const storeUrl of [null, APP_STORE]) {
          for (const placement of PLACEMENTS) {
            const env = { placement, shell, standalone, platform, storeUrl };
            if (m.askPossible(env)) continue;
            for (const status of ALL_STATUSES) {
              assert.equal(kindOf({ ...env, status }), "none", JSON.stringify({ ...env, status }));
            }
          }
        }
      }
    }
  }
});
