/**
 * Where the landing's demo film lives ("A day on Vibe", S72), and why there
 * is none today.
 *
 * Since Nov 22, 2026 the landing shows no film. The Oct 2 take showed the
 * app's crimson "IU Bloomington" bar, the SAE page, real people's photos and
 * real names. A screen recording of the app also isn't the look Franky wants
 * for Vibe's content. With no film, "A day on Vibe" shows its poster as a
 * labelled still, with no Play button. That poster is the Chess Club chat:
 * invented names, no photos and no school mark. The three panels also drop
 * their links to the film.
 *
 * A film never goes in this repo, which is public. NEXT_PUBLIC_DEMO_MEDIA_BASE
 * brings one back by naming the FOLDER that holds the two files under the
 * names in DEMO_FILM_FILES:
 * - unset or empty: no film (the default since Nov 22, 2026);
 * - "/landing-media/" reads the local copy in public/landing-media/, which
 *   .gitignore and .vercelignore keep out of every commit and deploy;
 * - any other https folder, or path on this site ("/…"), is read instead;
 * - anything else ("off", a typo) also means no film, so a typo never points
 *   the page at a stranger's host over plain http. A backslash anywhere is
 *   refused: browsers read "/\x" as "//x", another host.
 * Browsers keep a film file for 30 days, so a new film ships under new file
 * names. NEXT_PUBLIC_* values are inlined when the app is BUILT, so a change
 * on Vercel needs a redeploy (.env.example).
 *
 * Pure: no React, no value imports, so `node --test` can load it
 * (demo-media.test.ts) and the client component can use it.
 */

export const DEMO_FILM_FILES = { large: "vibe-demo-780.mp4", small: "vibe-demo-390.mp4" } as const;

/** The folder the film is read from, always ending in "/", or null for no film. */
export function demoMediaBase(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (value.includes("\\")) return null;
  const slash = (s: string) => (s.endsWith("/") ? s : `${s}/`);
  if (value.startsWith("/")) return value.startsWith("//") ? null : slash(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    return slash(url.href);
  } catch {
    return null;
  }
}

/** The film's folder for this build (read as the literal name, so Next inlines it). */
export const DEMO_MEDIA_BASE: string | null = demoMediaBase(process.env.NEXT_PUBLIC_DEMO_MEDIA_BASE);

/**
 * This build has a film: false unless the env var names a folder. While it's
 * false, the panels' captions carry no "watch it" link (it would scroll to a
 * still and play nothing), and "A day on Vibe" shows its poster as a
 * labelled still.
 */
export const HAS_DEMO_FILM: boolean = DEMO_MEDIA_BASE !== null;
