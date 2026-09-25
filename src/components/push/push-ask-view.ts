/**
 * The push ask's rules and copy (plan §8.7, wave 3′b batch E1; rulings
 * B1–B6, W2, W13; critic-w3.md item 26). `PushAsk.tsx` is the thin React
 * side; everything it decides that can be tested without a browser is here.
 *
 * ONE ASK, THREE PLACES (B1): Otto's Today pane, the Campus banner slot and
 * the line above the composer after a first DM sent on this device. The
 * placements only mount `<PushAsk>`; this file decides what it says.
 *
 * WHAT SHOWS WHERE
 * - The store app, or the installed web app on a phone, with this device's
 *   status `off` → the push ask (B2). Never on `on` / `denied` / `hidden` /
 *   `unsupported` / `needs-install`, never before the status is known, never
 *   on a computer.
 * - An iPhone or Android BROWSER TAB → "Get the app", only once that store's
 *   listing URL is set (B3), and only while this device isn't getting
 *   notifications some other way (status `off`, or `needs-install` on an
 *   iPhone). One message per platform (B4): an Android tab never gets the
 *   web-push ask; Settings keeps its own switch.
 * - In-app browsers (Instagram, TikTok…) show nothing yet (B3). On Android
 *   those land in "android-other" together with Edge, Opera, Firefox and
 *   plain web views, which the platform can't tell apart, so no Android
 *   "other" tab is asked either.
 * - `hidden` hides everything (W2): during the dark launch only founders on
 *   the allowlist ever see an ask.
 *
 * "NOT NOW" (B5): Otto and Campus snooze for 14 days, each on its own, in
 * `vibe_push_ask_v1` = `{otto?, campus?}` (epoch ms). The DM ask shows once
 * per device: `vibe_first_dm_ask_v1` = "1" the first time it shows. Storage
 * that can't be read or written means no ask at all (the component's job).
 *
 * Pure and client-safe: only `import type`, so `node --test` loads it with no
 * resolve hook (push-ask-view.test.ts).
 */

import type { AppShell } from "@/lib/native/detect";
import type { DevicePushStatus, TurnOnResult } from "@/lib/pwa/device-push";
import type { Platform } from "@/lib/pwa/display-mode";

export type AskPlacement = "otto" | "campus" | "dm";

export type PushAskInput = {
  placement: AskPlacement;
  /** useAppShell(): "ios-app" / "android-app" inside the store apps, else null. */
  shell: AppShell | null;
  /** useIsStandalone(): the installed web app (Home Screen / app window). */
  standalone: boolean;
  /** usePlatform(): null while the page hydrates. */
  platform: Platform | null;
  /** readDevicePush(); null until it answers. */
  status: DevicePushStatus | null;
  /** When "Not now" was last tapped at this placement (Otto / Campus), or null. */
  snoozedAt: number | null;
  /** The DM ask has already shown on this device. */
  dmShown: boolean;
  /** storeUrlFor(platform) from src/lib/native/store-links.ts. */
  storeUrl: string | null;
  now: number;
};

export type PushAskView =
  | { kind: "none" }
  | { kind: "push"; title: string; body: string; cta: string }
  | { kind: "get-app"; title: string; body: string; href: string };

export const PUSH_ASK_KEY = "vibe_push_ask_v1";
export const FIRST_DM_ASK_KEY = "vibe_first_dm_ask_v1";

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Not now" on Otto or Campus hides that ask for 14 days (B5). */
export const SNOOZE_MS = 14 * DAY_MS;
/** How long "You're set." (or why it didn't work) stays before the ask goes. */
export const DONE_MS = 4000;

export const ASK_COPY = {
  otto: {
    title: "Get these on your lock screen",
    body: "Otto can tell you about messages, follows and your clubs, even when Vibe is closed.",
  },
  campus: {
    title: "Turn on notifications",
    body: "Know when someone messages you or your clubs post.",
  },
  // One line and a button (the composer is right below it).
  dm: { title: "Know when they reply", body: "" },
  getApp: {
    title: "Vibe is better in the app",
    body: "Messages and club news on your lock screen.",
  },
  turnOn: "Turn on",
  getAppCta: "Get the app",
  notNow: "Not now",
  thanks: "You're set.",
  denied: "Notifications are blocked on this device. Vibe's Settings has the steps to turn them back on.",
  failed: "Couldn't turn on notifications. Try again.",
  appBuild: "Notifications aren't set up in this version of the app yet.",
  browser: "This browser can't get notifications.",
} as const;

const NONE: PushAskView = { kind: "none" };

/** A phone or tablet browser, installed or not (never the store apps or a computer). */
function isPhoneBrowser(p: Platform): boolean {
  return (
    p === "ios-safari" ||
    p === "ios-other-browser" ||
    p === "ios-in-app" ||
    p === "android-chrome" ||
    p === "android-samsung" ||
    p === "android-other"
  );
}

/** Browser tabs that may be sent to the store: no in-app browsers (B3), see the header. */
function getAppTab(p: Platform): boolean {
  return (
    p === "ios-safari" || p === "ios-other-browser" || p === "android-chrome" || p === "android-samsung"
  );
}

/** Within 14 days of "Not now". A time far off either way (a clock change) doesn't count. */
export function isSnoozed(snoozedAt: number | null, now: number): boolean {
  if (snoozedAt === null || !Number.isFinite(snoozedAt) || !Number.isFinite(now)) return false;
  return Math.abs(now - snoozedAt) < SNOOZE_MS;
}

/**
 * Could any ask ever show here, whatever the device status and storage say?
 * The store app, the installed web app on a phone, or a phone browser tab
 * with that store's listing URL. False while the platform is unknown. The
 * component skips the device read entirely when it's false (a computer, an
 * in-app browser, an iPhone tab before the App Store listing exists).
 */
export function askPossible(
  input: Pick<PushAskInput, "placement" | "shell" | "standalone" | "platform" | "storeUrl">,
): boolean {
  const { shell, standalone, platform } = input;
  if (platform === null) return false;
  if (shell !== null) return true;
  if (standalone) return isPhoneBrowser(platform);
  return getAppTab(platform) && input.storeUrl !== null && input.storeUrl !== "";
}

/** What the ask shows here and now (B1–B5). Never more than askPossible allows (tested). */
export function pushAskView(input: PushAskInput): PushAskView {
  const { placement, shell, standalone, platform, status } = input;
  // Hydrating, or the device read hasn't answered: nothing yet (B2, W2).
  if (platform === null || status === null) return NONE;
  if (placement === "dm" ? input.dmShown : isSnoozed(input.snoozedAt, input.now)) return NONE;

  // The store app, or the installed web app on a phone: the push ask (B2).
  if (shell !== null || (standalone && isPhoneBrowser(platform))) {
    if (status.kind !== "off") return NONE;
    const copy = ASK_COPY[placement];
    return { kind: "push", title: copy.title, body: copy.body, cta: ASK_COPY.turnOn };
  }

  // A phone browser tab: "Get the app", once the listing exists (B3, B4).
  if (standalone || !getAppTab(platform) || !input.storeUrl) return NONE;
  if (status.kind !== "off" && status.kind !== "needs-install") return NONE;
  return {
    kind: "get-app",
    title: ASK_COPY.getApp.title,
    body: ASK_COPY.getApp.body,
    href: input.storeUrl,
  };
}

// ── After the tap (B6) ──────────────────────────────────────────────────────

/**
 * What the ask does with turnOnDevicePush()'s answer (null = it rejected,
 * which it shouldn't): "done" shows `line` alone for DONE_MS, then goes;
 * "stay" keeps the buttons with `line` under them (null = say nothing: the
 * student dismissed the prompt); "hide" goes at once.
 */
export type AfterTurnOn =
  | { kind: "done"; line: string }
  | { kind: "stay"; line: string | null }
  | { kind: "hide" };

export function afterTurnOn(result: TurnOnResult | null, platform: Platform | null): AfterTurnOn {
  if (result === null) return { kind: "stay", line: ASK_COPY.failed };
  if (result.ok) return { kind: "done", line: ASK_COPY.thanks };
  const status = result.status;
  switch (status.kind) {
    case "on":
      return { kind: "done", line: ASK_COPY.thanks };
    case "denied":
      return { kind: "done", line: ASK_COPY.denied };
    case "unsupported":
      return { kind: "done", line: unsupportedLine(status.why, platform) };
    case "off":
      // "Not now" on the prompt says nothing; a timeout or a limit says why.
      return { kind: "stay", line: result.message ?? null };
    case "hidden":
    case "needs-install":
      return { kind: "hide" };
  }
}

/** Why this device can't get them after all (same words as the Settings card). */
function unsupportedLine(why: "browser" | "app-update" | "app-build", platform: Platform | null): string {
  if (why === "app-build") return ASK_COPY.appBuild;
  if (why === "browser") return ASK_COPY.browser;
  if (platform === "ios-app") return "Update Vibe from the App Store to turn on notifications.";
  if (platform === "android-app") return "Update Vibe from Google Play to turn on notifications.";
  return "Update the Vibe app to turn on notifications.";
}

// ── Storage values (the component does the try/catch) ───────────────────────

export type AskSnoozes = { otto?: number; campus?: number };

/** `vibe_push_ask_v1` as read; anything unreadable counts as no snooze. */
export function parseSnoozes(raw: string | null): AskSnoozes {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: AskSnoozes = {};
  for (const key of ["otto", "campus"] as const) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

/** The snooze for one placement; the DM ask has none (it shows once). */
export function snoozedAtFor(raw: string | null, placement: AskPlacement): number | null {
  if (placement === "dm") return null;
  return parseSnoozes(raw)[placement] ?? null;
}

/** The value to store after "Not now" at `placement`, keeping the other one. */
export function withSnooze(raw: string | null, placement: "otto" | "campus", now: number): string {
  return JSON.stringify({ ...parseSnoozes(raw), [placement]: now });
}

/** `vibe_first_dm_ask_v1` says the DM ask already showed on this device. */
export function dmShownFrom(raw: string | null): boolean {
  return raw === "1";
}
