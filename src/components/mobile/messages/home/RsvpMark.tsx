/**
 * The calendar key's marks in Messages (Oct 19, 2026, critique B8 repair,
 * decision 12): solid coral = Going, a coral ring = Interested. My Calendar
 * already drew the key this way while the Messages calendars still painted
 * Interested grey, and desktop /messages shows both on one screen, so the
 * same day carried two different marks. Every Messages calendar uses these
 * now: the week strip (YourWeek), the desktop week band (WeekBand), the
 * month grid (MonthBody, inside MonthSheet), and the Interested word on the
 * week cards, the month rows and the club rows.
 *
 * Shape as well as colour (a dot against a ring), never colour alone. The
 * ring has a faint coral wash inside, because a thin coral line alone on
 * white paper is a weak signal (the same reason as calChipStyle).
 */

type DayKind = "going" | "maybe" | null;

/** A day's 5px mark under its number: Going wins (`dayDot`). `glow` is a box-shadow for a live day. */
export function RsvpDayMark({ kind, coral, glow }: { kind: DayKind; coral: string; glow?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 5,
        height: 5,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999,
        background: kind === "going" ? coral : "transparent",
        border: kind === "maybe" ? `1.25px solid ${coral}` : "none",
        boxShadow: glow ?? "none",
      }}
    />
  );
}

/** The small ring before the word "Interested". */
export function InterestedRing({ coral, size = 7 }: { coral: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999,
        border: `1.5px solid ${coral}`,
        background: "var(--tag-bg)",
      }}
    />
  );
}
