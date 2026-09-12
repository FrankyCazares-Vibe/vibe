"use client";

import { OttoOrb } from "@/components/the-map/OttoOrb";

type Props = {
  /**
   * A count is `null` when the section behind it didn't load. The hero
   * prints an em dash there instead of a 0 — "0 nudges" is a claim about
   * campus, and a read that was refused can't make it. Same rule, same
   * dash, as the phone hero's chips in `OttoMobile`.
   */
  counts: { nudges: number | null; reminders: number | null; unread: number | null };
};

/**
 * Otto's hero: orb at full scale, name, "watcher" voice line, then the
 * stats triad. Reuses the existing `.vibe-landing-sun-*` halo + breathing
 * animation so the orb on this page reads as the *same* Otto from the
 * landing, just at home instead of mid-pitch.
 */
export function OttoHero({ counts }: Props) {
  return (
    <header className="otto-room-hero">
      <div className="otto-room-hero-orb">
        <div className="vibe-landing-sun-disc otto-room-hero-orb-inner">
          <span className="vibe-landing-sun-halo" aria-hidden />
          <span className="vibe-landing-sun-halo vibe-landing-sun-halo-2" aria-hidden />
          <span className="vibe-landing-sun-halo vibe-landing-sun-halo-3" aria-hidden />
          <div className="vibe-landing-sun-otto">
            <OttoOrb size={88} />
          </div>
        </div>
      </div>

      <div className="otto-room-hero-copy">
        <h1 className="otto-room-hero-name">
          otto<span className="vibe-landing-typewriter-dot">.</span>
        </h1>
        <p className="otto-room-hero-tagline">your campus compass.</p>
        <p className="otto-room-hero-voice">
          &ldquo;here&rsquo;s what caught my eye.&rdquo;
        </p>
      </div>

      <div className="otto-room-hero-stats" aria-label="otto status">
        <span>{counts.nudges ?? "—"} nudges</span>
        <span>{counts.reminders ?? "—"} reminders</span>
        <span>{counts.unread ?? "—"} unread</span>
      </div>
    </header>
  );
}
