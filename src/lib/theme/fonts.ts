/**
 * The app's two faces (Oct 19, 2026): Fraunces for titles, DM Sans for
 * everything else, from ONE Google stylesheet link.
 *
 * Zero imports on purpose, like theme.ts: the three static pages
 * (public/html/{profile,messages,onboarding}.html) can't import this, so they
 * paste the same href. Change it here, then paste it into those three heads;
 * fonts.test.ts fails per file when one drifts.
 */

/**
 * Weight RANGES, not lists: Google serves the same variable files for
 * 300..800 / 400..900 as for single weights, and a list pins each block to
 * one weight, which is how bold snapped to semibold on the static pages.
 * DM Sans italic 400 is a separate file the browser fetches only on pages
 * that draw it. SOFT 100 makes every Fraunces title soft, upright and italic
 * (Franky, Oct 19, 2026); the soft italic costs 188 B more than the hard one.
 * Optical size stays at the default, so titles keep their width.
 */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300..800;1,400&family=Fraunces:ital,wght,SOFT@0,400..900,100;1,400,100&display=swap";

/**
 * The "vibe." logo's own face: Fraunces at opsz 144, SOFT 100, weight 900,
 * cut to the five letters it draws (". b e i v", 1,384 B), so the logo looks
 * the same as the landing everywhere. Self-hosted (CSP font-src 'self').
 * The version is in the name and the file is cached for a year
 * (next.config.ts), so a re-cut ships as -v2.
 */
export const WORDMARK_FONT_PATH = "/fonts/vibe-wordmark-v1.woff2";
