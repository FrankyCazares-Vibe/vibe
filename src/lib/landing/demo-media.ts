/**
 * Where the landing's demo film lives ("A day on Vibe", S72).
 *
 * The film shows the founders' own photos with real people in them, and this
 * repo is public, so the film is never committed. It is read from
 * NEXT_PUBLIC_DEMO_MEDIA_BASE, a folder URL (Vercel Blob once it's set up)
 * holding vibe-demo-780.mp4 and vibe-demo-390.mp4 under exactly those names.
 *
 * Unset:
 * - under `next dev`, /landing-media/: a local copy in public/landing-media/,
 *   which .gitignore keeps out of every commit;
 * - in a production build, no film at all (null). The section then shows its
 *   poster as a still and no Play button, rather than ask for a file that
 *   isn't there.
 *
 * A value must be an https URL or a path on this site ("/…"); anything else
 * is ignored (null), so a typo never points the page at a stranger's host
 * over plain http. A backslash anywhere is refused too: browsers read "/\x"
 * as "//x", another host. NEXT_PUBLIC_* values are inlined when the app is
 * BUILT, so a change on Vercel needs a redeploy (.env.example).
 *
 * Pure: no React, no value imports, so `node --test` can load it
 * (demo-media.test.ts) and the client component can use it.
 */

export const DEMO_FILM_FILES = { large: "vibe-demo-780.mp4", small: "vibe-demo-390.mp4" } as const;

/** The folder the film is read from, always ending in "/", or null for no film. */
export function demoMediaBase(raw: string | undefined, nodeEnv: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return nodeEnv === "production" ? null : "/landing-media/";
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
export const DEMO_MEDIA_BASE: string | null = demoMediaBase(process.env.NEXT_PUBLIC_DEMO_MEDIA_BASE, process.env.NODE_ENV);

/**
 * This build has a film. False: the panels' captions carry no "watch it"
 * link (it would scroll to a still and play nothing), and "A day on Vibe"
 * shows its poster as a labelled still.
 */
export const HAS_DEMO_FILM: boolean = DEMO_MEDIA_BASE !== null;
