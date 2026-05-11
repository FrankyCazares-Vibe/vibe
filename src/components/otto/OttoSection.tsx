"use client";

import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  children: ReactNode;
  /** Optional right-aligned slot for "view all" links etc. */
  trailing?: ReactNode;
  /** When true the section spans both columns of the parent grid (full-width row). */
  wide?: boolean;
};

/**
 * Shared frosted-glass shell for every Otto-page section. The eyebrow uses
 * the same DM Sans uppercase + 0.18em tracking as the auth + onboarding
 * cards, so the whole post-landing system reads as one voice.
 *
 * The thin coral divider is what carries the visual rhythm between
 * sections — it's the same coral 1px line used in the landing's CTA strip.
 */
export function OttoSection({ eyebrow, children, trailing, wide }: Props) {
  return (
    <section className={`otto-room-section${wide ? " otto-room-section--wide" : ""}`}>
      <header className="otto-room-section-header">
        <span className="otto-room-section-eyebrow">
          <span className="otto-room-section-eyebrow-dot" />
          {eyebrow}
        </span>
        {trailing ? <div className="otto-room-section-trailing">{trailing}</div> : null}
      </header>
      <div className="otto-room-section-body">{children}</div>
    </section>
  );
}
