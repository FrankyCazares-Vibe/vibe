"use client";

/**
 * "All · School · Clubs" above the Events tab's Tonight block (Oct 19 2026,
 * boards D2_Events / P2_Events). One filter for the whole tab: the caller
 * hands the same value to Tonight AND to "Coming up". The caller renders it
 * only while the school part is on, so a campus without a school calendar
 * never shows a "School" chip that would always come up empty.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §6.3.
 */
import { TONIGHT_COPY } from "./tonight-view";
import type { EventFilterChipsProps, TonightFilter } from "./types";

import "./tonight.css";
import "./tonight-events.css";

/** Fixed order, All first: All is the default and the way back. */
const CHIP_ORDER: readonly TonightFilter[] = ["all", "school", "clubs"];

export function EventFilterChips({ value, onChange }: EventFilterChipsProps) {
  return (
    <div role="group" aria-label={TONIGHT_COPY.filterGroup} className="tonight-chips">
      {CHIP_ORDER.map((key) => {
        const on = key === value;
        return (
          <button
            key={key}
            type="button"
            // aria-pressed, not a radio group: each chip is a plain toggle
            // button, and a screen reader says "pressed" on the one that's on.
            aria-pressed={on}
            className="tonight-chip vibe-press vibe-toggle"
            // Tapping the chip that's already on changes nothing, so it
            // never sends the caller a no-op update.
            onClick={() => {
              if (!on) onChange(key);
            }}
          >
            {TONIGHT_COPY.filters[key]}
          </button>
        );
      })}
    </div>
  );
}
