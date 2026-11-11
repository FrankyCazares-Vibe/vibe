"use client";

import "./otto-hero.css";

import { OttoPlanet } from "@/components/otto/planet/OttoPlanet";

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
 * Otto's hero: Planet at full scale (88px, 64px on a narrow window), name,
 * "watcher" voice line, then the stats triad. Planet brings his own glow
 * (m-aura) and his idle loop (`live`, the moon's 16 s lap) when the
 * person's look is Living. The room is dark in both themes, so the orb's
 * box is a `vibe-night-island`: his Night drawing, the light ring. The
 * page's own restyle is the Otto build's Wave 2.
 */
export function OttoHero({ counts }: Props) {
  return (
    <header className="otto-room-hero">
      <div className="otto-room-hero-orb vibe-night-island">
        <OttoPlanet size={88} live />
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
