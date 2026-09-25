/**
 * The Settings "Notifications" card's rules and copy (plan §8 wave 3′a,
 * batch A; rulings W1–W4, W13, W14; critic-w3 items 3, 5, 16 and 23). The
 * card itself is NotificationsCard.tsx; this file holds everything it decides
 * that can be tested without a browser.
 *
 * TWO THINGS, SAID APART (W1)
 * - "Notifications on this device": the OS permission plus this device's
 *   `push_devices` row. Read and changed through `src/lib/pwa/device-push.ts`.
 * - "What to send": the per-kind switches and message previews, account-wide
 *   in `users.otto_settings`. Saved through PATCH /api/me/otto/settings.
 *
 * MENTIONS HAVE ONE KEY (W3, critic item 5): the Mentions switch reads and
 * writes `mention_pings`, never `push.off`. Turning it ON also sends the full
 * `push.off` (which never holds "mention"), so a stray "mention" left there
 * by an older save is cleared. The page strips "mention" from `off` before
 * it reaches the card, and the route drops it from any incoming `push.off`.
 *
 * `push.off` is a full replacement list and `push.previews` a boolean (W4);
 * the route merges `push` one level deep, so a previews-only patch keeps
 * `off`.
 *
 * Pure and client-safe: only `import type` from src/lib/push (critic item 3:
 * payload.ts pulls node:crypto, which would break a client bundle), so the
 * kind list is a literal here and the test checks it against PUSH_KINDS.
 */

import type { PushKind } from "@/lib/push/payload";
import type { DevicePushStatus, TurnOnResult } from "@/lib/pwa/device-push";
import type { Platform } from "@/lib/pwa/display-mode";

/** What the page hands the card (settings/page.tsx). `off` never holds "mention". */
export type NotificationPrefs = {
  previews: boolean;
  off: PushKind[];
  mentionPings: boolean;
};

/** A body for PATCH /api/me/otto/settings. */
export type SettingsPatch = {
  mention_pings?: boolean;
  push?: { previews?: boolean; off?: PushKind[] };
};

/** One tap on a "What to send" switch. */
export type PrefFlip = { kind: PushKind; on: boolean } | { previews: boolean };

/** Every kind that can push, in the card's order. Same set as PUSH_KINDS (tested). */
export const CARD_KINDS: readonly PushKind[] = [
  "dm",
  "group_message",
  "message_request",
  "follow",
  "like",
  "comment",
  "mention",
  "org_invite",
  "org_request_approved",
];

export type KindRow = { kind: PushKind; label: string; hint?: string };
export type KindGroup = { title: string; rows: readonly KindRow[] };

// Messages first (they're the urgent ones), likes and follows lower down.
// A DM or group @mention comes with its message, so "Mentions" only covers
// posts and club chats (dispatch.ts skips the rest as covered_by_message).
export const KIND_GROUPS: readonly KindGroup[] = [
  {
    title: "Messages",
    rows: [
      { kind: "dm", label: "Direct messages" },
      { kind: "group_message", label: "Group chats" },
      { kind: "message_request", label: "Message requests" },
    ],
  },
  {
    title: "Activity",
    rows: [
      { kind: "follow", label: "New followers" },
      { kind: "like", label: "Likes" },
      { kind: "comment", label: "Comments" },
      { kind: "mention", label: "Mentions", hint: "In posts and club chats" },
    ],
  },
  {
    title: "Clubs",
    rows: [
      { kind: "org_invite", label: "Club invites" },
      { kind: "org_request_approved", label: "Club requests approved" },
    ],
  },
];

export const COPY = {
  title: "Notifications",
  deviceLabel: "Notifications on this device",
  deviceHint: "Only this device. Each phone and browser has its own switch.",
  blocked: "Blocked",
  whatTitle: "What to send",
  whatHint: "These apply everywhere your notifications are on.",
  previewsLabel: "Show message previews",
  // Names always show (plan D2): never promise to hide who sent it.
  previewsHint: "Names always show. Turn this off to hide the words and club names.",
  prefsLoadFailed: "Couldn't load these right now. Reload the page to try again.",
  saveFailure: "Couldn't save your notification settings.",
  turnedOn: "Notifications are on for this device.",
  turnedOff: "Notifications are off for this device.",
  turnOnFailed: "Couldn't turn on notifications. Try again.",
  turnOffFailed: "Couldn't turn off notifications. Try again.",
} as const;

/** Is this kind's switch on? */
export function kindOn(prefs: NotificationPrefs, kind: PushKind): boolean {
  if (kind === "mention") return prefs.mentionPings;
  return !prefs.off.includes(kind);
}

/** The card's state after one tap. `off` stays in CARD_KINDS order, never with "mention". */
export function flipPrefs(prefs: NotificationPrefs, flip: PrefFlip): NotificationPrefs {
  if ("previews" in flip) return { ...prefs, previews: flip.previews };
  if (flip.kind === "mention") return { ...prefs, mentionPings: flip.on };
  const off = CARD_KINDS.filter(
    (k) => k !== "mention" && (k === flip.kind ? !flip.on : prefs.off.includes(k)),
  );
  return { ...prefs, off };
}

/**
 * What to send for one tap, given the state AFTER it (`next`, from flipPrefs).
 * A kind tap while Mentions is off also re-sends `mention_pings: false`: a
 * saved `push.off` holding "mention" (only a hand edit gets it there) reads
 * as Mentions off, and replacing that list would otherwise turn it back on.
 */
export function patchForFlip(next: NotificationPrefs, flip: PrefFlip): SettingsPatch {
  if ("previews" in flip) return { push: { previews: next.previews } };
  if (flip.kind === "mention") {
    return next.mentionPings
      ? { mention_pings: true, push: { off: [...next.off] } }
      : { mention_pings: false };
  }
  const push = { off: [...next.off] };
  return next.mentionPings ? { push } : { mention_pings: false, push };
}

/** `flips` played in order on top of `base`. */
export function applyFlips(base: NotificationPrefs, flips: readonly PrefFlip[]): NotificationPrefs {
  return flips.reduce(flipPrefs, base);
}

/**
 * One PATCH body for the taps queued since the last send, rebuilt on top of
 * what the server last confirmed (`base`), so a failed save only ever takes
 * its own taps with it: a later send never carries them.
 */
export function patchForFlips(base: NotificationPrefs, flips: readonly PrefFlip[]): SettingsPatch {
  let prefs = base;
  let patch: SettingsPatch = {};
  for (const flip of flips) {
    prefs = flipPrefs(prefs, flip);
    patch = mergePatches(patch, patchForFlip(prefs, flip));
  }
  return patch;
}

/**
 * Two patches as one. The later one wins key by key; `push` merges one
 * level, like the route does. Every `push.off` is the full list at the time
 * of its tap, so the later list is the current one.
 */
export function mergePatches(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = { ...a, ...b };
  if (a.push || b.push) out.push = { ...a.push, ...b.push };
  return out;
}

/**
 * The card's state from the saved `otto_settings` blob the route answers
 * with, or null when that isn't an object (the card treats it as a failed
 * save). The same reading as settings/page.tsx (parsePushPrefs, then
 * "mention" moved out of `off`); the test holds the two together.
 */
export function prefsFromSettings(settings: unknown): NotificationPrefs | null {
  if (!isObject(settings)) return null;
  const push = isObject(settings.push) ? settings.push : {};
  const rawOff: unknown[] = Array.isArray(push.off) ? push.off : [];
  return {
    previews: push.previews !== false,
    off: CARD_KINDS.filter((k) => k !== "mention" && rawOff.includes(k)),
    mentionPings: settings.mention_pings !== false && !rawOff.includes("mention"),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Device row ──────────────────────────────────────────────────────────────

/** Where the card is running: the store app, a Home Screen / app window, or a tab. */
export type DeviceEnv = {
  platform: Platform | null;
  standalone: boolean;
  /** storeUrlFor(platform) from src/lib/native/store-links.ts. */
  storeUrl: string | null;
};

const IOS_SETTINGS = "Open Settings → Notifications → Vibe on your iPhone and turn on Allow Notifications.";
const ANDROID_SETTINGS = "Open your phone's Settings → Apps → Vibe → Notifications and turn them on.";

/**
 * How to turn notifications back on after "Don't allow" (W14), in one or two
 * plain lines for THIS platform. There's no re-ask: browsers ignore a second
 * prompt. Every Android line names the phone's own settings (critic item
 * 16: on Android 12 and older the app can't even see a block from there).
 */
export function deniedHelp(env: Pick<DeviceEnv, "platform" | "standalone">): string {
  const { platform, standalone } = env;
  switch (platform) {
    case "ios-app":
      return IOS_SETTINGS;
    case "android-app":
      return ANDROID_SETTINGS;
    case "ios-safari":
    case "ios-other-browser":
    case "ios-in-app":
      // Web push on iPhone only exists in the Home Screen app, which has its
      // own entry under Settings → Notifications.
      return IOS_SETTINGS;
    case "android-chrome":
    case "android-samsung":
    case "android-other":
      return standalone
        ? ANDROID_SETTINGS
        : "Tap the icon left of the address bar and allow Notifications. If it's still off, check your phone's Settings → Apps → your browser.";
    case "desktop-chromium":
      // Chrome and Edge both keep it behind the icon left of the address
      // bar; an installed app window has no address bar, only its menu.
      return standalone
        ? "Open the app's ⋮ menu → App info → Site settings, and allow Notifications."
        : "Click the icon left of the address bar, set Notifications to Allow, then reload this page.";
    case "desktop-safari":
      return standalone
        ? "Open System Settings → Notifications → Vibe and turn on Allow notifications."
        : "In Safari, open Settings → Websites → Notifications, set connectvibe.app to Allow, then reload this page.";
    case "firefox":
      return "Click the icon left of the address bar, clear the Notifications block, then reload this page.";
    default:
      return "Allow notifications for this site in your browser's settings, then reload this page.";
  }
}

/**
 * An iPhone browser tab (W13): web push only works from the Home Screen app,
 * so the card never offers the prompt there. The App Store once its URL is
 * set; until then, short Add to Home Screen steps (Safari's Share sheet is
 * the one route every iPhone has).
 */
export function needsInstallView(env: Pick<DeviceEnv, "platform" | "storeUrl">): {
  text: string;
  link: { href: string; label: string } | null;
} {
  if (env.storeUrl) {
    return {
      text: "On iPhone, notifications come through the Vibe app.",
      link: { href: env.storeUrl, label: "Get Vibe on the App Store" },
    };
  }
  const steps =
    env.platform === "ios-safari"
      ? "Tap Share, then Add to Home Screen, and open Vibe from there."
      : "Open this page in Safari, tap Share, then Add to Home Screen, and open Vibe from there.";
  return { text: `On iPhone, notifications only work from your Home Screen. ${steps}`, link: null };
}

/** Why this device can't get notifications, by `why` (device-push.ts). */
export function unsupportedCopy(
  why: "browser" | "app-update" | "app-build",
  platform: Platform | null,
): string {
  if (why === "app-update") {
    if (platform === "ios-app") return "Update Vibe from the App Store to turn on notifications.";
    if (platform === "android-app") return "Update Vibe from Google Play to turn on notifications.";
    return "Update the Vibe app to turn on notifications.";
  }
  if (why === "app-build") return "Notifications aren't set up in this version of the app yet.";
  return "This browser can't get notifications. Open Vibe in Chrome, Safari, Edge or Firefox to turn them on.";
}

/** Every status the card shows (it renders nothing for "hidden", W2). */
export type ShownStatus = Exclude<DevicePushStatus, { kind: "hidden" }>;

/** What the device row shows on the right, and under it. */
export type DeviceView =
  | { kind: "switch"; on: boolean }
  | { kind: "blocked"; help: string }
  | { kind: "note"; text: string; link: { href: string; label: string } | null };

export function deviceView(status: ShownStatus, env: DeviceEnv): DeviceView {
  switch (status.kind) {
    case "on":
      return { kind: "switch", on: true };
    case "off":
      return { kind: "switch", on: false };
    case "denied":
      return { kind: "blocked", help: deniedHelp(env) };
    case "needs-install":
      return { kind: "note", ...needsInstallView(env) };
    case "unsupported":
      return { kind: "note", text: unsupportedCopy(status.why, env.platform), link: null };
  }
}

/**
 * The line under the device row after a turn-on tap, or null for none. "Not
 * now" on the prompt comes back as `off` with no message, and says nothing;
 * blocked, unsupported and needs-install already explain themselves in the
 * row. A `message` from device-push.ts (a timeout's "Try again in a moment.",
 * a 429's limit) is shown as it is.
 */
export function turnOnLine(result: TurnOnResult): string | null {
  if (result.ok) return COPY.turnedOn;
  if (result.message) return result.message;
  return null;
}
