/**
 * The living bloom: the coral glow of the page backdrop, drifting very slowly
 * behind the content (Oct 13, 2026). One implementation for every screen that
 * paints `--feed-backdrop` / `--network-backdrop`; the CSS is the
 * `vibe-bloom-*` block at the end of globals.css.
 *
 * How to use it: give the page container the `VIBE_BLOOM_HOST` class INSTEAD
 * of an inline `background`, and render <VibeBloom /> as its FIRST child.
 *
 *   - Motion allowed: the host goes transparent and this element paints the
 *     page: a fixed, viewport-sized box at z-index -1 holding the flat base
 *     colour and two soft radial-gradient layers. Only those two layers move,
 *     by `transform` and `opacity`, so the compositor does the work and the
 *     page is never repainted.
 *   - `prefers-reduced-motion: reduce`: this element is `display: none` and
 *     the host paints the static gradient itself, exactly as before.
 *
 * Why z-index -1 and no stacking context on the host: the box sits in the
 * ROOT stacking context, under every block, every line of text and every
 * positioned thing on the page, so nothing above it changes order (tab bar,
 * sheets, toasts, the mini messenger, the cookie notice). For it to show, no
 * ancestor of the host may paint an opaque background: globals.css clears the
 * body and the phone shell while a bloom is mounted. A new wrapper with its
 * own background around a bloom screen would hide it.
 *
 * No hooks and no browser APIs, so it renders on the server as well.
 */

export const VIBE_BLOOM_HOST = "vibe-bloom-host";
export const VIBE_BLOOM_HOST_NETWORK = "vibe-bloom-host vibe-bloom-host--network";

type Props = {
  /**
   * `network`: the desktop Network page's own wash in Light (peach, sized in
   * percent). Night is the feed's bloom either way.
   */
  variant?: "feed" | "network";
  /**
   * The page is the column to the right of the 200px desktop LeftNav
   * (Settings, desktop Network): the glow is anchored to that column, as the
   * static backdrop was, not to the window's left edge.
   */
  column?: boolean;
};

export function VibeBloom({ variant = "feed", column = false }: Props) {
  const cls = [
    "vibe-bloom",
    variant === "network" ? "vibe-bloom--network" : "",
    column ? "vibe-bloom--column" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} aria-hidden="true">
      {/* b first: `a` is the first gradient of the static token, the one on top. */}
      <div className="vibe-bloom-glow vibe-bloom-glow--b" />
      <div className="vibe-bloom-glow vibe-bloom-glow--a" />
    </div>
  );
}
