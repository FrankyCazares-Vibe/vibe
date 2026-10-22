/**
 * The club backgrounds (Oct 22, 2026, Franky: "one shared list of the 10
 * tuned backgrounds"). The ONE list: the club page, the Edit page's Look
 * picker, the old desktop settings window and create dialog, the old chat
 * wallpapers and both org routes read it. A club stores only the key
 * (`orgs.backdrop_preset`, its CHECK in the database), never CSS: a CSS
 * string in a column was once a way to beacon readers' addresses (the cover
 * themes' lesson, src/lib/profile/cover-themes.ts).
 *
 * Every background is dark in Light and Night alike: the club page is a
 * night island, its words sit straight on the background. Each was measured
 * at its brightest spot (handoffs/2026-10-22-club-tools-arc/SETTINGS-MAP.md,
 * section B): main text 12.2:1 or better, the quiet grey (--ink-muted) 4.6:1
 * or better, coral labels 5.9:1 or better. The five older keys keep their
 * names in the database but were retuned (their washes were too bright for
 * the quiet text, 2.3-3.0:1); "sand-purple" shows as "Dusk", "deep-violet"
 * as "Violet". "cream" is a light background from the old chat: still a valid
 * stored key, never offered, and it shows as the default (Dusk) on the club
 * page.
 *
 * The five new ones (Rose, Cardinal, Lantern, Canal, Onyx) needed the
 * database CHECK widened: migration 20261026100000_club_backdrop_presets,
 * applied to production Oct 22, 2026 with Franky's yes, and then
 * {@link NEW_BACKDROPS_LIVE} turned on in the next deploy.
 *
 * Pure: no React, no `@/` imports, so `node --test` loads it directly.
 */

export type BackdropKey =
  | "cream"
  | "sand-purple"
  | "midnight"
  | "deep-violet"
  | "rose"
  | "cardinal"
  | "ember"
  | "lantern"
  | "forest"
  | "canal"
  | "onyx";

export type Backdrop = {
  key: Exclude<BackdropKey, "cream">;
  /** What officers see in the picker. */
  label: string;
  /** Needs migration 20261026100000 before it can be saved. */
  isNew: boolean;
  css: string;
};

/**
 * On since Oct 22, 2026: migration 20261026100000 is on production, so the
 * database takes the five new keys. Turning it off hides them again (clubs
 * already on one keep painting it); the database rule stays as it is.
 */
export const NEW_BACKDROPS_LIVE = true;

/** The default for a new club and for any key the page can't paint. */
export const DEFAULT_BACKDROP = "sand-purple" as const;

/** All ten, in picker order. */
export const BACKDROPS: readonly Backdrop[] = Object.freeze([
  {
    key: "sand-purple",
    label: "Dusk",
    isNew: false,
    css:
      "radial-gradient(120% 80% at 0% 0%, rgba(123,95,224,0.23) 0%, rgba(123,95,224,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.2) 0%, rgba(255,92,53,0) 55%), " +
      "radial-gradient(140% 100% at 70% 20%, rgba(255,140,90,0.06) 0%, rgba(255,140,90,0) 60%), " +
      "linear-gradient(180deg, #140F24 0%, #1A1430 50%, #1C1220 100%)",
  },
  {
    key: "midnight",
    label: "Midnight",
    isNew: false,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(60,90,200,0.39) 0%, rgba(60,90,200,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(180,120,255,0.27) 0%, rgba(180,120,255,0) 55%), " +
      "radial-gradient(140% 100% at 50% 50%, rgba(120,180,255,0.12) 0%, rgba(120,180,255,0) 60%), " +
      "linear-gradient(180deg, #07091A 0%, #0E1230 55%, #050614 100%)",
  },
  {
    key: "deep-violet",
    label: "Violet",
    isNew: false,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(138,90,255,0.31) 0%, rgba(138,90,255,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(80,40,200,0.26) 0%, rgba(80,40,200,0) 55%), " +
      "radial-gradient(140% 100% at 50% 50%, rgba(200,140,255,0.07) 0%, rgba(200,140,255,0) 60%), " +
      "linear-gradient(180deg, #0D061E 0%, #140B2A 50%, #0A0618 100%)",
  },
  {
    key: "rose",
    label: "Rose",
    isNew: true,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(235,70,150,0.26) 0%, rgba(235,70,150,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(150,60,220,0.21) 0%, rgba(150,60,220,0) 55%), " +
      "radial-gradient(140% 100% at 70% 25%, rgba(255,150,200,0.05) 0%, rgba(255,150,200,0) 60%), " +
      "linear-gradient(180deg, #16081A 0%, #1D0B22 55%, #130716 100%)",
  },
  {
    key: "cardinal",
    label: "Cardinal",
    isNew: true,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(200,30,50,0.38) 0%, rgba(200,30,50,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(140,20,60,0.35) 0%, rgba(140,20,60,0) 55%), " +
      "radial-gradient(140% 100% at 70% 25%, rgba(255,90,90,0.08) 0%, rgba(255,90,90,0) 60%), " +
      "linear-gradient(180deg, #16080A 0%, #1F0B0F 55%, #14070A 100%)",
  },
  {
    key: "ember",
    label: "Ember",
    isNew: false,
    css:
      "radial-gradient(120% 90% at 10% 0%, rgba(255,92,53,0.24) 0%, rgba(255,92,53,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,170,80,0.13) 0%, rgba(255,170,80,0) 55%), " +
      "radial-gradient(140% 100% at 70% 30%, rgba(180,40,40,0.13) 0%, rgba(180,40,40,0) 60%), " +
      "linear-gradient(180deg, #140A0C 0%, #1E0E11 55%, #16090C 100%)",
  },
  {
    key: "lantern",
    label: "Lantern",
    isNew: true,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(230,170,60,0.18) 0%, rgba(230,170,60,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,120,50,0.14) 0%, rgba(255,120,50,0) 55%), " +
      "radial-gradient(140% 100% at 60% 30%, rgba(255,210,120,0.04) 0%, rgba(255,210,120,0) 60%), " +
      "linear-gradient(180deg, #120E07 0%, #19130A 55%, #100C06 100%)",
  },
  {
    key: "forest",
    label: "Forest",
    isNew: false,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(70,160,110,0.21) 0%, rgba(70,160,110,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(40,100,140,0.19) 0%, rgba(40,100,140,0) 55%), " +
      "radial-gradient(140% 100% at 60% 30%, rgba(180,220,140,0.05) 0%, rgba(180,220,140,0) 60%), " +
      "linear-gradient(180deg, #0A1412 0%, #0D1C17 55%, #08110F 100%)",
  },
  {
    key: "canal",
    label: "Canal",
    isNew: true,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(30,170,170,0.2) 0%, rgba(30,170,170,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(40,90,200,0.18) 0%, rgba(40,90,200,0) 55%), " +
      "radial-gradient(140% 100% at 60% 30%, rgba(140,230,220,0.04) 0%, rgba(140,230,220,0) 60%), " +
      "linear-gradient(180deg, #061316 0%, #0A1A20 55%, #050F12 100%)",
  },
  {
    key: "onyx",
    label: "Onyx",
    isNew: true,
    css:
      "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 55%), " +
      "radial-gradient(110% 90% at 100% 100%, rgba(255,92,53,0.22) 0%, rgba(255,92,53,0) 55%), " +
      "radial-gradient(140% 100% at 60% 30%, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 60%), " +
      "linear-gradient(180deg, #0E0D0D 0%, #121111 55%, #0A0909 100%)",
  },
]);

/** The keys the database accepts today (its CHECK), the new ones once live. */
export function storableBackdropKeys(live: boolean = NEW_BACKDROPS_LIVE): readonly BackdropKey[] {
  return ["cream", ...BACKDROPS.filter((b) => live || !b.isNew).map((b) => b.key)];
}

/** The backgrounds offered in the pickers, in order. */
export function pickerBackdrops(live: boolean = NEW_BACKDROPS_LIVE): readonly Backdrop[] {
  return BACKDROPS.filter((b) => live || !b.isNew);
}

/** True for a key a route may save (not "cream": it is never offered again). */
export function isPickableBackdrop(key: unknown, live: boolean = NEW_BACKDROPS_LIVE): key is Backdrop["key"] {
  return typeof key === "string" && pickerBackdrops(live).some((b) => b.key === key);
}

/** The background to paint for a stored key: unknown or "cream" paints the default. */
export function backdropFor(key: unknown): Backdrop {
  return BACKDROPS.find((b) => b.key === key) ?? BACKDROPS.find((b) => b.key === DEFAULT_BACKDROP)!;
}

export function backdropCss(key: unknown): string {
  return backdropFor(key).css;
}

/**
 * The old chat wallpaper (CampusHome's chat pane and the old phone channel
 * view, both only while chat v2 is off): the same backgrounds, except that a
 * club still on "cream" keeps the light paper those panes were drawn for.
 */
export const LEGACY_CREAM_WALLPAPER =
  "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.45) 0%, rgba(255,222,180,0) 60%), " +
  "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.35) 0%, rgba(255,200,170,0) 60%), " +
  "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)";

export function legacyChatWallpaper(key: unknown): string {
  return key === "cream" ? LEGACY_CREAM_WALLPAPER : backdropCss(key);
}
