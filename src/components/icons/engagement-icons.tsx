/**
 * Vibe's own engagement icons: views, likes, comments, reposts, saves
 * (Oct 19, 2026, critique batch B9).
 *
 * WHY THIS FILE. The Otto stats page printed its counts as emoji (❤ 💬 ↻ 🔖).
 * The ↻ fell back to another font, the 🔖 was clipped, and the row looked
 * nothing like the feed. These are the feed's own glyphs, copied path for path
 * from campus-home.tsx (16-unit grid, stroke 1.4), so a post's counts look
 * the same wherever they appear.
 *
 * campus-home.tsx keeps its own copies for now: removing them is a later
 * chore, so that file isn't touched by two batches at once. Until then
 * engagement-icons.test.ts reads both files and fails if the paths drift.
 *
 * Every icon is decorative (aria-hidden) and draws in currentColor: the label
 * a screen reader needs ("7 views") belongs to the text beside the icon.
 */

type IconProps = {
  /** Rendered width and height in px; the drawing stays on its 16-unit grid. */
  size?: number;
};

type FillableIconProps = IconProps & {
  /** Solid fill, for the state where the viewer has liked or saved. */
  filled?: boolean;
};

export function EyeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function LikeIcon({ size = 16, filled = false }: FillableIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill={filled ? "currentColor" : "none"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommentIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H6L2.5 14V3.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Two arrows tracing a loop: the same two-arrow repost glyph the phone uses. */
export function RepostIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        d="M3 6.5V11a1.5 1.5 0 0 0 1.5 1.5H10M13 9.5V5A1.5 1.5 0 0 0 11.5 3.5H6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 1.5L3 3.5L5 5.5M11 14.5L13 12.5L11 10.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookmarkIcon({ size = 16, filled = false }: FillableIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
      fill={filled ? "currentColor" : "none"}
    >
      <path
        d="M3.5 2h9v12L8 11l-4.5 3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
