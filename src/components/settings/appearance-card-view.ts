/**
 * The Settings "How Vibe looks" card's rules and copy (S67 wave 3, contracts
 * C4). The card itself is AppearanceCard.tsx; this file holds everything it
 * decides that can be tested without a browser: the three options and their
 * order, the status line, the roving-radio keyboard rule, what a saved blob
 * reads as, and the "account wins on a new device" mount rule (with its
 * stale-render guard for Back/Forward).
 *
 * WORDS VS CODE: the product says Auto / Light / Night, in that order; the
 * code enum is `system | light | dark` (the localStorage `vibe_theme` value
 * and the `users.otto_settings.theme` key share it). "Night" never reaches
 * storage.
 *
 * Zero imports on purpose (the profile-layout.ts pattern), so the node test
 * loads it straight from its ".ts" path. The type is spelled here rather than
 * imported from src/lib/theme/theme.ts for the same reason; the two unions
 * are the same three words, and the test checks this file against theme.ts
 * (the words, the resolve rule) so they can't drift. The device key itself,
 * `THEME_STORAGE_KEY`, is theme.ts's alone: the card imports it from there.
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type ThemeOption = { pref: ThemePref; label: string; sub: string };

/** The tiles, in the order Franky chose (2026-09-26): Auto, Light, Night. */
export const THEME_OPTIONS: readonly ThemeOption[] = Object.freeze([
  { pref: "system", label: "Auto", sub: "follows your phone" },
  { pref: "light", label: "Light", sub: "always cream" },
  { pref: "dark", label: "Night", sub: "always dark" },
]);

export const COPY = {
  group: "How Vibe looks",
  intro:
    "Auto follows your phone. Your choice is saved to your account, so it carries to your other devices.",
  saveFailure: "Couldn't save how Vibe looks.",
} as const;

/** The three known words, or null. Anything else (an older value, garbage) is null. */
export function sanitizeThemePref(raw: unknown): ThemePref | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

/**
 * The theme a PATCH answer confirms: `settings.theme` from the saved blob.
 * Null when there's no blob (an older route drops the key and answers
 * `{settings: null, noop: true}`) or the key isn't one of the three: the card
 * treats both as "nothing saved" and reverts (the NotificationsCard rule).
 */
export function themeFromSettings(settings: unknown): ThemePref | null {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return null;
  return sanitizeThemePref((settings as Record<string, unknown>).theme);
}

/** What paints for a preference: Auto follows the phone, the other two are fixed. */
export function resolvedFor(pref: ThemePref, prefersDark: boolean): ResolvedTheme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

/** The product word for a preference. */
export function themeLabel(pref: ThemePref): string {
  return THEME_OPTIONS.find((o) => o.pref === pref)?.label ?? "Light";
}

/**
 * The status line in its three pieces, so the card can set the word in bold
 * (the canvas): "Right now: " + "Night" + ", because your phone is in dark
 * mode." The reason names the phone for Auto and the student for a fixed
 * pick, so the line always says why the app looks the way it does.
 */
export function statusParts(
  pref: ThemePref,
  prefersDark: boolean,
): { lead: string; word: "Light" | "Night"; reason: string } {
  const word = resolvedFor(pref, prefersDark) === "dark" ? "Night" : "Light";
  const reason =
    pref === "system"
      ? `, because your phone is in ${prefersDark ? "dark" : "light"} mode.`
      : ", because you picked it.";
  return { lead: "Right now: ", word, reason };
}

/** The whole status line as one string (what a screen reader hears). */
export function statusLine(pref: ThemePref, prefersDark: boolean): string {
  const { lead, word, reason } = statusParts(pref, prefersDark);
  return lead + word + reason;
}

/**
 * The radiogroup's keyboard rule: arrows move the choice (and select it, as a
 * native radio does), wrapping at the ends; Home/End jump. Null for any other
 * key, so the card leaves it to the browser.
 */
export function nextPref(current: ThemePref, key: string): ThemePref | null {
  const order = THEME_OPTIONS.map((o) => o.pref);
  const i = order.indexOf(current);
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return order[(i + 1) % order.length];
    case "ArrowLeft":
    case "ArrowUp":
      return order[(i - 1 + order.length) % order.length];
    case "Home":
      return order[0];
    case "End":
      return order[order.length - 1];
    default:
      return null;
  }
}

/**
 * Device key: how recent this device's `vibe_theme` is, in SERVER
 * milliseconds: the PATCH answer's `savedAt` for a confirmed pick, else the
 * page's `renderedAt` (at a tap, or when the account's value was mirrored or
 * matched on mount). Never moves back. It travels with `vibe_theme` (both
 * survive sign-out) and only feeds
 * `mountSync`'s stale-render check. Server clocks on both sides on purpose: a
 * phone a few seconds behind the server would otherwise read a render made
 * just before its own save as newer.
 */
export const THEME_SAVED_AT_KEY = "vibe_theme_at";

/** A stored stamp: a finite, positive number of milliseconds, else null. */
export function sanitizeStamp(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What the card does on mount (contracts C4: "the account wins on a new
 * device"). `account` is the saved `otto_settings.theme` (null when the page's
 * profile read failed), `device` the sanitized `localStorage.vibe_theme`.
 * - Account known: show it; `mirror` it into the device key (and apply it)
 *   when the device disagrees, null when they already match.
 * - Account unknown: show what the device has, else `fallback`; never mirror,
 *   so a failed read can't overwrite the device's choice with a default.
 * - A stale render: Next reuses a page's payload on browser Back/Forward, so
 *   Settings can remount with the account value from BEFORE this device's
 *   last pick. When the render (`renderedAt`, stamped before the page's read)
 *   is not newer than the device's stamp (`deviceSavedAt`), the device knows
 *   better: show its value and write nothing.
 * `stamp`: when the account wins, the device now matches it as of
 * `renderedAt`, so the card records that (never moving the stamp back); an
 * even older render reused later then reads as stale too.
 */
export function mountSync(
  account: ThemePref | null,
  device: ThemePref | null,
  fallback: ThemePref,
  renderedAt: number | null = null,
  deviceSavedAt: number | null = null,
): { show: ThemePref; mirror: ThemePref | null; stamp: number | null } {
  if (account === null) return { show: device ?? fallback, mirror: null, stamp: null };
  const staleRender =
    device !== null && deviceSavedAt !== null && renderedAt !== null && renderedAt <= deviceSavedAt;
  if (staleRender) return { show: device, mirror: null, stamp: null };
  return { show: account, mirror: device === account ? null : account, stamp: renderedAt };
}
