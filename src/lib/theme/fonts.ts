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
 * cut to the five letters it draws (". b e i v", 1,392 B), so the logo looks
 * the same everywhere. Self-hosted (CSP font-src 'self'). The version is in
 * the name and the file is cached for a year (next.config.ts).
 *
 * v2 (Nov 18, 2026): the "per-pair fit" Franky picked on Nov 17. With v1 at
 * -0.03em the v ran into the i and the b into the e. v2 builds a spacing of
 * its own after each letter into the letter widths (v -0.004em, i -0.024em,
 * b -0.019em, e -0.034em, from v1), so the logo needs no letter spacing of
 * its own from 60 px up, and the KineticWordmark's one span per letter gets
 * the same fit. Made in vibe-marketing (tools/make-wordmark-font.mjs). v1
 * stays in public/fonts for pages and stylesheets cached before the switch.
 */
export const WORDMARK_FONT_PATH = "/fonts/vibe-wordmark-v2.woff2";

/**
 * The same face as a .woff: the @font-face fallback, and the file the share
 * and club cards draw with (Satori, behind next/og, can't read woff2).
 */
export const WORDMARK_WOFF_PATH = "/fonts/vibe-wordmark-v2.woff";

/**
 * The logo's letter spacing wherever it is drawn: 0 from 60 px up (the font
 * carries the fit), opening to +0.04em at 18 px, the smallest logo, so the
 * letters still read apart where there are few pixels (vibe-marketing
 * brand/fonts/check: e-small-sizes, f-ramp). globals.css holds it as
 * --wordmark-letter-spacing; the static pages paste it, and fonts.test.ts
 * fails per file when one drifts. Satori can't read clamp(), so the cards
 * set 0 (their logos are 68 px and up).
 */
export const WORDMARK_LETTER_SPACING = "clamp(0px, calc((60px - 1em) * 0.017), 0.04em)";
