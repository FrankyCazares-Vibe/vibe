"use client";

import "./desk-lists.css";

import { useRef, useState, type KeyboardEvent } from "react";

import { DESK_RANGES, inDeskRange, type DeskRange } from "@/lib/otto/desk-lists";

/**
 * The small "This week / 30 days / All" picker on Otto saw and Earlier (Otto
 * polish, Nov 11, 2026). A radio group in segments: the chosen step is ink
 * (never coral) and bold, so it doesn't lean on colour alone. Arrow keys move
 * the choice, as a radio group does; one tab stop. Each segment draws ~30px
 * tall and takes taps over 44px. The rows it filters: `inDeskRange`.
 */
export function DeskTimeFilter({
  value,
  onChange,
  label,
}: {
  value: DeskRange;
  onChange: (next: DeskRange) => void;
  /** What it filters, for screen readers: "Otto saw: time frame". */
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = DESK_RANGES.findIndex((r) => r.value === value);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + DESK_RANGES.length) % DESK_RANGES.length;
    onChange(DESK_RANGES[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="dk-range" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {DESK_RANGES.map((r, i) => (
        <button
          key={r.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={r.value === value}
          tabIndex={r.value === value ? 0 : -1}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A list's time frame: the picker's value and the rows inside it. Starts on
 * All, so nothing is hidden until the person picks. `now` is read once.
 */
export function useDeskRange<T extends { whenISO?: string }>(items: readonly T[], start: DeskRange = "all") {
  const [range, setRange] = useState<DeskRange>(start);
  const [now] = useState(() => Date.now());
  const inRange = items.filter((item) => inDeskRange(item, range, now));
  return { range, setRange, items: inRange };
}
