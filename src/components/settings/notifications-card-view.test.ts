/**
 * Tests for `notifications-card-view.ts`: the Settings Notifications card's
 * kinds, switch states, save patches and per-platform copy (plan §8 wave 3′a
 * batch A; W1–W4, W13, W14; critic-w3 items 3, 5 and 16).
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/settings/notifications-card-view.test.ts
 *
 * The card can't import payload.ts (node:crypto in a client bundle, critic
 * item 3), so it keeps its own kind list; this test holds it to PUSH_KINDS
 * and its reading of a saved blob to parsePushPrefs + the page's rule.
 *
 * WHY THE RESOLVE HOOK: payload.ts imports "../moderation/text-filter" with no
 * extension, which Node's type stripping can't resolve (the payload.test.ts
 * pattern). The modules load through variable specifiers, after the hook is
 * registered: Node needs the ".ts" on disk and tsc refuses a literal one.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("notifications-card-view.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./notifications-card-view.ts";
const V = (await import(specifier)) as typeof import("./notifications-card-view");
const payloadSpecifier = "../../lib/push/payload.ts";
const P = (await import(payloadSpecifier)) as typeof import("../../lib/push/payload");

type Prefs = import("./notifications-card-view").NotificationPrefs;
type Platform = import("../../lib/pwa/display-mode").Platform;

const ALL_ON: Prefs = { previews: true, off: [], mentionPings: true };

/** settings/page.tsx's rule, spelled out: parsePushPrefs, then "mention" moved out of `off`. */
function pageDerive(settings: unknown): Prefs {
  const prefs = P.parsePushPrefs(settings);
  return {
    previews: prefs.previews,
    off: [...prefs.off].filter((k) => k !== "mention"),
    mentionPings: !prefs.off.has("mention"),
  };
}

const sorted = (xs: readonly string[]) => [...xs].sort();

test("the card's kinds are exactly the kinds that can push (critic item 3)", () => {
  assert.deepEqual(sorted(V.CARD_KINDS), sorted(P.PUSH_KINDS));
  assert.equal(new Set(V.CARD_KINDS).size, V.CARD_KINDS.length);
});

test("the groups list every kind once, in the card's order", () => {
  const listed = V.KIND_GROUPS.flatMap((g) => g.rows.map((r) => r.kind));
  assert.deepEqual(listed, [...V.CARD_KINDS]);
  assert.deepEqual(
    V.KIND_GROUPS.map((g) => [g.title, g.rows.map((r) => r.label)]),
    [
      ["Messages", ["Direct messages", "Group chats", "Message requests"]],
      ["Activity", ["New followers", "Likes", "Comments", "Mentions"]],
      ["Clubs", ["Club invites", "Club requests approved"]],
    ],
  );
  const mention = V.KIND_GROUPS.flatMap((g) => g.rows).find((r) => r.kind === "mention");
  assert.equal(mention?.hint, "In posts and club chats");
});

test("the previews hint never promises to hide who sent it", () => {
  assert.match(V.COPY.previewsHint, /^Names always show\./);
  assert.doesNotMatch(V.COPY.previewsHint, /hide (the )?(name|sender|who)/i);
});

test("kindOn: Mentions reads mention_pings, the rest read push.off", () => {
  const prefs: Prefs = { previews: true, off: ["like", "dm"], mentionPings: false };
  assert.equal(V.kindOn(prefs, "mention"), false);
  assert.equal(V.kindOn(prefs, "like"), false);
  assert.equal(V.kindOn(prefs, "dm"), false);
  assert.equal(V.kindOn(prefs, "comment"), true);
  assert.equal(V.kindOn({ ...prefs, mentionPings: true }, "mention"), true);
});

test("flipPrefs: a kind goes in or out of `off`, in card order", () => {
  const a = V.flipPrefs(ALL_ON, { kind: "like", on: false });
  assert.deepEqual(a.off, ["like"]);
  const b = V.flipPrefs(a, { kind: "dm", on: false });
  assert.deepEqual(b.off, ["dm", "like"]);
  const c = V.flipPrefs(b, { kind: "like", on: true });
  assert.deepEqual(c.off, ["dm"]);
  // Turning off what's already off changes nothing.
  assert.deepEqual(V.flipPrefs(c, { kind: "dm", on: false }).off, ["dm"]);
  assert.equal(c.previews, true);
  assert.equal(c.mentionPings, true);
});

test("flipPrefs: Mentions and previews never touch `off` (W3)", () => {
  const base: Prefs = { previews: true, off: ["follow"], mentionPings: true };
  const m = V.flipPrefs(base, { kind: "mention", on: false });
  assert.deepEqual(m, { previews: true, off: ["follow"], mentionPings: false });
  const p = V.flipPrefs(base, { previews: false });
  assert.deepEqual(p, { previews: false, off: ["follow"], mentionPings: true });
});

test("patchForFlip: a kind sends the full `off` list; previews send only previews (W4)", () => {
  const next: Prefs = { previews: true, off: ["dm", "like"], mentionPings: true };
  assert.deepEqual(V.patchForFlip(next, { kind: "like", on: false }), { push: { off: ["dm", "like"] } });
  assert.deepEqual(V.patchForFlip({ ...next, previews: false }, { previews: false }), {
    push: { previews: false },
  });
});

test("patchForFlip: Mentions writes mention_pings, and ON also clears push.off (W3, critic 5)", () => {
  const off: Prefs = { previews: true, off: ["like"], mentionPings: false };
  assert.deepEqual(V.patchForFlip(off, { kind: "mention", on: false }), { mention_pings: false });
  const on: Prefs = { ...off, mentionPings: true };
  assert.deepEqual(V.patchForFlip(on, { kind: "mention", on: true }), {
    mention_pings: true,
    push: { off: ["like"] },
  });
});

test("no patch ever puts \"mention\" in push.off", () => {
  let prefs: Prefs = ALL_ON;
  for (const kind of V.CARD_KINDS) {
    for (const on of [false, true, false]) {
      const flip = { kind, on };
      prefs = V.flipPrefs(prefs, flip);
      assert.ok(!prefs.off.includes("mention"), `${kind} ${on}`);
      assert.ok(!(V.patchForFlip(prefs, flip).push?.off ?? []).includes("mention"), `${kind} ${on}`);
    }
  }
});

test("mergePatches: the later tap wins key by key, push merges one level", () => {
  const a = { push: { off: ["like" as const] } };
  const b = { push: { previews: false } };
  assert.deepEqual(V.mergePatches(a, b), { push: { off: ["like"], previews: false } });
  const c = { push: { off: ["like" as const, "dm" as const] } };
  assert.deepEqual(V.mergePatches(V.mergePatches(a, b), c), {
    push: { off: ["like", "dm"], previews: false },
  });
  assert.deepEqual(V.mergePatches({ mention_pings: true, push: { off: [] } }, { mention_pings: false }), {
    mention_pings: false,
    push: { off: [] },
  });
  assert.deepEqual(V.mergePatches({ mention_pings: false }, { mention_pings: true }), { mention_pings: true });
});

test("patchForFlip: a kind tap while Mentions is off keeps mention_pings false (a hand-edited push.off)", () => {
  // push.off held "mention" with mention_pings unset: the page reads Mentions as off.
  const shown = pageDerive({ push: { off: ["mention", "like"] } });
  assert.equal(shown.mentionPings, false);
  const next = V.flipPrefs(shown, { kind: "dm", on: false });
  assert.deepEqual(V.patchForFlip(next, { kind: "dm", on: false }), {
    mention_pings: false,
    push: { off: ["dm", "like"] },
  });
  // With Mentions on, a kind tap leaves mention_pings alone.
  const on = V.flipPrefs(ALL_ON, { kind: "dm", on: false });
  assert.deepEqual(V.patchForFlip(on, { kind: "dm", on: false }), { push: { off: ["dm"] } });
});

test("applyFlips: taps played in order on the confirmed state", () => {
  const confirmed: Prefs = { previews: true, off: ["dm"], mentionPings: true };
  assert.deepEqual(V.applyFlips(confirmed, []), confirmed);
  assert.deepEqual(
    V.applyFlips(confirmed, [{ kind: "like", on: false }, { previews: false }, { kind: "dm", on: true }]),
    { previews: false, off: ["like"], mentionPings: true },
  );
  assert.deepEqual(V.applyFlips(confirmed, [{ kind: "mention", on: false }, { kind: "mention", on: true }]), confirmed);
});

test("patchForFlips: one body per send, built on the confirmed state only", () => {
  const confirmed: Prefs = { previews: true, off: ["dm"], mentionPings: true };
  assert.deepEqual(V.patchForFlips(confirmed, [{ kind: "like", on: false }, { previews: false }]), {
    push: { off: ["dm", "like"], previews: false },
  });
  // A refused send's taps (here: "follow" off) never ride along with the next one.
  const refused = V.applyFlips(confirmed, [{ kind: "follow", on: false }]);
  assert.deepEqual(refused.off, ["dm", "follow"]);
  assert.deepEqual(V.patchForFlips(confirmed, [{ kind: "like", on: false }]), { push: { off: ["dm", "like"] } });
  // Mentions off then a kind tap, and the other way round.
  assert.deepEqual(V.patchForFlips(confirmed, [{ kind: "mention", on: false }, { kind: "like", on: false }]), {
    mention_pings: false,
    push: { off: ["dm", "like"] },
  });
  const mentionOff: Prefs = { ...confirmed, mentionPings: false };
  assert.deepEqual(V.patchForFlips(mentionOff, [{ kind: "like", on: false }, { kind: "mention", on: true }]), {
    mention_pings: true,
    push: { off: ["dm", "like"] },
  });
});

test("prefsFromSettings reads a saved blob exactly the way the page does", () => {
  const blobs: unknown[] = [
    {},
    { mention_pings: true },
    { mention_pings: false },
    { push: { previews: false } },
    { push: { off: ["like", "dm", "nonsense", 7, null] } },
    { push: { off: ["mention", "follow"] }, mention_pings: true },
    { push: { off: ["mention"] }, mention_pings: false, chattiness: "quiet" },
    { push: "garbage" },
    { push: { off: "like", previews: "no" } },
    { push: [] },
  ];
  for (const blob of blobs) {
    const got = V.prefsFromSettings(blob);
    const want = pageDerive(blob);
    assert.ok(got, JSON.stringify(blob));
    assert.equal(got.previews, want.previews, JSON.stringify(blob));
    assert.equal(got.mentionPings, want.mentionPings, JSON.stringify(blob));
    assert.deepEqual(sorted(got.off), sorted(want.off), JSON.stringify(blob));
    assert.ok(!got.off.includes("mention"));
  }
});

test("prefsFromSettings: no blob means the save didn't happen", () => {
  for (const bad of [null, undefined, "x", 3, [], true]) assert.equal(V.prefsFromSettings(bad), null);
});

// ── Device row ──────────────────────────────────────────────────────────────

const PLATFORMS: Array<Platform | null> = [
  "ios-app",
  "android-app",
  "ios-safari",
  "ios-other-browser",
  "ios-in-app",
  "android-chrome",
  "android-samsung",
  "android-other",
  "desktop-chromium",
  "desktop-safari",
  "firefox",
  "other",
  null,
];
const STORE = "https://apps.apple.com/us/app/vibe/id0000000000";

test("denied help: one or two short lines for every platform (W14)", () => {
  for (const platform of PLATFORMS) {
    for (const standalone of [false, true]) {
      const help = V.deniedHelp({ platform, standalone });
      assert.ok(help.length > 20 && help.length <= 160, `${platform} ${standalone}: ${help}`);
      assert.ok((help.match(/[.?!](\s|$)/g) ?? []).length <= 2, `${platform} ${standalone}: ${help}`);
    }
  }
});

test("denied help: Android always points at the phone's own settings (critic item 16)", () => {
  for (const platform of ["android-app", "android-chrome", "android-samsung", "android-other"] as const) {
    for (const standalone of [false, true]) {
      assert.match(V.deniedHelp({ platform, standalone }), /Settings → Apps/, `${platform} ${standalone}`);
    }
  }
});

test("denied help: each platform gets its own place to look", () => {
  const iphone = /Settings → Notifications → Vibe/;
  assert.match(V.deniedHelp({ platform: "ios-app", standalone: false }), iphone);
  assert.match(V.deniedHelp({ platform: "ios-safari", standalone: true }), iphone);
  assert.match(V.deniedHelp({ platform: "desktop-chromium", standalone: false }), /address bar/);
  // An installed Chrome / Edge app window has no address bar, only its menu.
  assert.equal(
    V.deniedHelp({ platform: "desktop-chromium", standalone: true }),
    "Open the app's ⋮ menu → App info → Site settings, and allow Notifications.",
  );
  assert.match(V.deniedHelp({ platform: "firefox", standalone: false }), /address bar/);
  assert.match(V.deniedHelp({ platform: "desktop-safari", standalone: false }), /^In Safari/);
  assert.match(V.deniedHelp({ platform: "desktop-safari", standalone: true }), /System Settings/);
  assert.match(V.deniedHelp({ platform: "android-chrome", standalone: false }), /address bar/);
  assert.doesNotMatch(V.deniedHelp({ platform: "android-chrome", standalone: true }), /address bar/);
});

test("needs install: the App Store once it's set, else Add to Home Screen steps (W13)", () => {
  const store = V.needsInstallView({ platform: "ios-safari", storeUrl: STORE });
  assert.deepEqual(store.link, { href: STORE, label: "Get Vibe on the App Store" });
  const safari = V.needsInstallView({ platform: "ios-safari", storeUrl: null });
  assert.equal(safari.link, null);
  assert.match(safari.text, /Add to Home Screen/);
  assert.doesNotMatch(safari.text, /Open this page in Safari/);
  const chrome = V.needsInstallView({ platform: "ios-other-browser", storeUrl: null });
  assert.match(chrome.text, /Open this page in Safari/);
});

test("unsupported: plain lines by why, the right store for an app update", () => {
  assert.match(V.unsupportedCopy("app-update", "ios-app"), /App Store/);
  assert.match(V.unsupportedCopy("app-update", "android-app"), /Google Play/);
  assert.match(V.unsupportedCopy("app-update", null), /Update the Vibe app/);
  assert.match(V.unsupportedCopy("app-build", "ios-app"), /this version of the app/);
  assert.match(V.unsupportedCopy("browser", "firefox"), /This browser/);
});

test("deviceView: a switch only for on/off; never a switch where there's no prompt to show", () => {
  const env = { platform: "ios-safari" as const, standalone: false, storeUrl: null };
  assert.deepEqual(V.deviceView({ kind: "on" }, env), { kind: "switch", on: true });
  assert.deepEqual(V.deviceView({ kind: "off" }, env), { kind: "switch", on: false });
  assert.equal(V.deviceView({ kind: "denied" }, env).kind, "blocked");
  const appWindow = { platform: "desktop-chromium" as const, standalone: true, storeUrl: null };
  assert.deepEqual(V.deviceView({ kind: "denied" }, appWindow), {
    kind: "blocked",
    help: V.deniedHelp(appWindow),
  });
  assert.match(V.deniedHelp(appWindow), /App info/);
  assert.equal(V.deviceView({ kind: "needs-install" }, env).kind, "note");
  for (const why of ["browser", "app-update", "app-build"] as const) {
    const view = V.deviceView({ kind: "unsupported", why }, env);
    assert.equal(view.kind, "note");
    assert.ok(view.kind === "note" && view.link === null);
  }
});

test("turnOnLine: success says so, 'not now' says nothing, a message is shown as is", () => {
  assert.equal(V.turnOnLine({ ok: true }), V.COPY.turnedOn);
  assert.equal(V.turnOnLine({ ok: false, status: { kind: "off" } }), null);
  assert.equal(V.turnOnLine({ ok: false, status: { kind: "denied" } }), null);
  assert.equal(
    V.turnOnLine({ ok: false, status: { kind: "off" }, message: "Try again in a moment." }),
    "Try again in a moment.",
  );
});
