import type { CSSProperties } from "react";

/**
 * The "vibe." wordmark, arriving: the four letters land one after another and
 * the coral dot drops in last (Oct 13, 2026; the sign-in and sign-up cards and
 * the landing's top bar). Once per page load, transform and opacity only; with
 * reduced motion it is simply there. The CSS is the `vibe-kinetic` block at the
 * end of globals.css.
 *
 * Read as one word: the wrapper carries the name and the letters are hidden
 * from screen readers. No hooks, so it renders on the server.
 */
export function KineticWordmark({
  className = "",
  dotClassName = "",
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span className={`vibe-kinetic ${className}`.trim()} role="img" aria-label="vibe.">
      {"vibe".split("").map((letter, i) => (
        <span key={letter} className="vibe-kinetic-letter" style={{ "--i": i } as CSSProperties} aria-hidden="true">
          {letter}
        </span>
      ))}
      <span className={`vibe-kinetic-dot ${dotClassName}`.trim()} aria-hidden="true">
        .
      </span>
    </span>
  );
}
