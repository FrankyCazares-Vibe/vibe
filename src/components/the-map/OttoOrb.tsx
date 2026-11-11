import { OttoPlanet } from "@/components/otto/planet/OttoPlanet";

/**
 * @deprecated Draw Otto with `OttoPlanet` (src/components/otto/planet).
 *
 * The old orb, kept as a thin wrapper (Nov 10, 2026, the Otto build's
 * Wave 1) so its two users keep working: the-map page (220px) and
 * LyraConstellation (64px). Both sit on a dark sky in either theme, so the
 * wrapper is a `vibe-night-island`: Planet takes his Night drawing there
 * (the light ring), which a dark ring on a dark sky would lose. Still: no
 * idle loop on these pages.
 */
export function OttoOrb({ size = 48 }: { size?: number }) {
  return (
    <span
      className="vibe-night-island"
      style={{ display: "inline-flex", width: size, height: size, flex: "none" }}
    >
      <OttoPlanet size={size} live={false} />
    </span>
  );
}
