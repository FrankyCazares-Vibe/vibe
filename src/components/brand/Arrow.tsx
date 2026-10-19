import type { CSSProperties } from "react";

/**
 * A small left or right arrow, drawn instead of typed (Oct 19, 2026). DM Sans
 * has no ← or →, so the typed glyphs fell back to whatever system font the
 * device had (Lucida Grande on a Mac) and looked different on every phone.
 *
 * 1em square in the text's own colour, so it sizes and tints with the words
 * around it. Decorative: hidden from screen readers, the words carry the
 * meaning ("back", "Sign in"). No hooks, so it renders on the server too.
 */
export function Arrow({
  direction,
  className,
  style,
}: {
  direction: "left" | "right";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Sits on the text's middle when the parent isn't a centring flexbox.
      style={{ display: "inline-block", flexShrink: 0, verticalAlign: "-0.125em", ...style }}
    >
      <path d={direction === "left" ? "M13.5 8h-11M7 3.5 2.5 8 7 12.5" : "M2.5 8h11M9 3.5 13.5 8 9 12.5"} />
    </svg>
  );
}
