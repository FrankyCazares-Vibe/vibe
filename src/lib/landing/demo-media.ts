/**
 * Where the landing's demo film lives ("A day on Vibe", S72).
 *
 * The film shows the founders' own photos with real people in them, and this
 * repo is public, so the film is never committed. It lives on Vercel Blob
 * (DEFAULT_DEMO_MEDIA_BASE), as vibe-demo-780.mp4 and vibe-demo-390.mp4 under
 * exactly those names, and every build reads it from there, `next dev`
 * included, with no env var to set.
 *
 * NEXT_PUBLIC_DEMO_MEDIA_BASE overrides that folder:
 * - "/landing-media/" reads the local copy in public/landing-media/, which
 *   .gitignore and .vercelignore keep out of every commit and deploy;
 * - any other https folder, or path on this site ("/…"), is read instead;
 * - anything else ("off", a typo) means no film (null): the section shows
 *   its poster as a still and no Play button, and a typo never points the
 *   page at a stranger's host over plain http. A backslash anywhere is
 *   refused too: browsers read "/\x" as "//x", another host.
 * NEXT_PUBLIC_* values are inlined when the app is BUILT, so a change on
 * Vercel needs a redeploy (.env.example).
 *
 * Pure: no React, no value imports, so `node --test` can load it
 * (demo-media.test.ts) and the client component can use it.
 */

export const DEMO_FILM_FILES = { large: "vibe-demo-780.mp4", small: "vibe-demo-390.mp4" } as const;

/** The Vercel Blob store the founders uploaded the film to (S72). Public on purpose: the page fetches it. */
export const DEFAULT_DEMO_MEDIA_BASE = "https://npzptkkzqxthhsnu.public.blob.vercel-storage.com/";

/** The folder the film is read from, always ending in "/", or null for no film. */
export function demoMediaBase(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_DEMO_MEDIA_BASE;
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
 * This build has a film. False (only when the env var turns it off): the
 * panels' captions carry no "watch it" link (it would scroll to a still and
 * play nothing), and "A day on Vibe" shows its poster as a labelled still.
 */
export const HAS_DEMO_FILM: boolean = DEMO_MEDIA_BASE !== null;
