/**
 * School identity colours (S68, the desktop campus top bar and the LeftNav
 * profile card). Colours only, never a logo. These are the schools' own
 * colours, not Vibe's theme, so they are identical in Light and Night.
 *
 * Client-safe (no server-only imports).
 */
import type { Campus } from "@/lib/iu/campuses";

/** IU crimson. */
export const IU_CRIMSON = "#990000";
/** IU cream. */
export const IU_CREAM = "#EEEDEB";
/** Purdue black. */
export const PURDUE_BLACK = "#000000";
/** Purdue "Boilermaker" gold. */
export const PURDUE_GOLD = "#CFB991";

/**
 * Which school a campus wears:
 * - `shared`: both IU and Purdue call it home (Indianapolis, Fort Wayne)
 * - `iu` / `purdue`: a single-system campus
 * - `none`: no campus known (yet). Never guess a school.
 */
export type SchoolSkin = "shared" | "iu" | "purdue" | "none";

/** Classify a campus row (or nothing) into its {@link SchoolSkin}. */
export function schoolSkinFor(campus: Pick<Campus, "systems"> | null | undefined): SchoolSkin {
  if (!campus) return "none";
  const iu = campus.systems.includes("iu");
  const purdue = campus.systems.includes("purdue");
  if (iu && purdue) return "shared";
  if (iu) return "iu";
  if (purdue) return "purdue";
  return "none";
}

/**
 * The thin school strip's paint (the profile card's top edge): half crimson,
 * half gold for a shared campus, one colour otherwise, and null (no strip)
 * when the campus isn't known. Takes a skin or a campus row.
 */
export function schoolStripBackground(
  of: SchoolSkin | Pick<Campus, "systems"> | null | undefined,
): string | null {
  const skin = typeof of === "string" ? of : schoolSkinFor(of);
  if (skin === "shared") return `linear-gradient(90deg, ${IU_CRIMSON} 50%, ${PURDUE_GOLD} 50%)`;
  if (skin === "iu") return IU_CRIMSON;
  if (skin === "purdue") return PURDUE_GOLD;
  return null;
}

/** One zone of the top bar: IU, Purdue, or neutral before a campus is known. */
export type SchoolZone = "iu" | "purdue" | "none";

export type SchoolZonePalette = {
  background: string;
  /** Extra paint on the zone (Purdue's gold bottom hairline), or null. */
  shadow: string | null;
  /** The campus name, focus rings, button text. */
  ink: string;
  /** The shared / visiting sub-line and the stats line. */
  secondary: string;
  searchBg: string;
  searchBorder: string;
  /** Search text, icon and placeholder. */
  searchInk: string;
  /** Hover wash for the Campuses / search buttons and inactive tab pills. */
  hover: string;
  tabsTrack: string;
  activeBg: string;
  activeInk: string;
  inactiveInk: string;
};

export const SCHOOL_ZONE_PALETTES: Readonly<Record<SchoolZone, SchoolZonePalette>> = Object.freeze({
  iu: Object.freeze({
    background: IU_CRIMSON,
    shadow: null,
    ink: IU_CREAM,
    secondary: "rgba(238,237,235,0.82)",
    searchBg: "rgba(238,237,235,0.14)",
    searchBorder: "rgba(238,237,235,0.32)",
    searchInk: "rgba(238,237,235,0.9)",
    hover: "rgba(238,237,235,0.22)",
    tabsTrack: "rgba(0,0,0,0.22)",
    activeBg: IU_CREAM,
    activeInk: IU_CRIMSON,
    inactiveInk: IU_CREAM,
  }),
  purdue: Object.freeze({
    background: PURDUE_BLACK,
    shadow: "inset 0 -1px 0 rgba(207,185,145,0.45)",
    ink: PURDUE_GOLD,
    secondary: "rgba(207,185,145,0.82)",
    searchBg: "rgba(207,185,145,0.10)",
    searchBorder: "rgba(207,185,145,0.34)",
    searchInk: "rgba(207,185,145,0.92)",
    hover: "rgba(207,185,145,0.2)",
    tabsTrack: "rgba(207,185,145,0.12)",
    activeBg: PURDUE_GOLD,
    activeInk: PURDUE_BLACK,
    inactiveInk: PURDUE_GOLD,
  }),
  none: Object.freeze({
    background: "#1C1C1E",
    shadow: null,
    ink: "#FFFFFF",
    secondary: "rgba(255,255,255,0.7)",
    searchBg: "rgba(255,255,255,0.12)",
    searchBorder: "rgba(255,255,255,0.18)",
    searchInk: "rgba(255,255,255,0.9)",
    hover: "rgba(255,255,255,0.2)",
    tabsTrack: "rgba(255,255,255,0.08)",
    activeBg: "#FFFFFF",
    activeInk: "#1C1C1E",
    inactiveInk: "rgba(255,255,255,0.78)",
  }),
});
