"use client";

import { useEffect, useRef, useState } from "react";

import { MONTH_SLIDE_CSS, MonthBody } from "@/components/mobile/messages/home/MonthBody";
import { FONT, palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import { clampMonth, monthBounds, monthName, monthOf } from "@/lib/chat/week";

import type { MonthPopoverProps } from "./contracts";
import { DesktopPopover } from "./DesktopDialog";

/**
 * The month of your RSVPs on a laptop (wave-3 contract 6.2, H4; W3-4-week):
 * `DesktopPopover` (336 wide, under `anchor`, no scrim) around `MonthBody`,
 * the ONE calendar the phone's `MonthSheet` wraps too. Nothing of the
 * calendar is here: the picked day, the month on screen, the per-month read,
 * the grid, the plans and every word are the body's.
 *
 * What this file owns:
 * - The shell's rules are the popover's (6.1): it closes on Esc, a press
 *   outside, the window's blur, Back (its one history entry) and a Tab past
 *   its ends; focus moves in on open and returns to `anchor` on every close.
 * - The anchor while the month is open: a click on it closes the month (the
 *   band's title is a toggle), and so does Esc pressed with focus on it. The
 *   popover hears neither by itself (the anchor is outside its box).
 * - The title: an `<h2>` for `October 2026` (the name in the serif, the year
 *   small and muted beside it), a live region, so the month is said when it
 *   changes. The same words name the dialog (`label`), kept in step with the
 *   month on screen.
 * - `onClose(picked)`: the last day the body said was picked (`onPicked`: a
 *   day of the grid, `Today`), or `null` when no day was picked while it was
 *   open. Called once, whatever closed it. The band then moves to that day's
 *   week and reads the week again (`WeekBand`).
 * - A plan row with a room: `onOpenRoom(entry)`. The shell opens the chat
 *   through the history layer, which closes this popover on the way (its
 *   `onPop`) and makes its entry the chat's (3.5 rule 2). Only when the
 *   shell left it open does the popover close itself (`openRoom`).
 * - The grid's slide-in classes: `<style>{MONTH_SLIDE_CSS}</style>`, once.
 * - The box around the body is a flex column (the body renders a fragment
 *   and its plan rows stretch only as flex items) with the bottom padding.
 */
export function MonthPopover({ anchor, initialDay, now, night, onClose, onOpenRoom }: MonthPopoverProps) {
  const t = palette(night);
  // The last day picked in the body; null until one is.
  const pickedRef = useRef<Date | null>(null);
  // Two ways out can land in one tick (a press outside, then the window's blur): one close.
  const closedRef = useRef(false);
  // The dialog's name: the month the body opens on (its own first month), then whatever its title last drew.
  const [label, setLabel] = useState(() => {
    const first = clampMonth(monthOf(initialDay), monthBounds(now));
    return `${monthName(first.month)} ${first.year}`;
  });
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(pickedRef.current);
  };
  // A plan with a room. The shell closes this popover on its way to the chat
  // (the layer's `onPop`, called before `onOpenRoom` returns). When it opened
  // nothing (the chat named is the one already open), the row still closes
  // the month: a press that changed nothing would read as broken.
  const openRoom: MonthPopoverProps["onOpenRoom"] = (entry) => {
    onOpenRoom(entry);
    close();
  };
  // The latest `close` for the anchor's own listeners.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // The anchor (the band's title) is outside the box, and `DesktopPopover`
  // leaves a press on it to the anchor. Chrome then puts focus on it, where
  // neither the box's `onKeyDown` nor the stray-key listener (focus is not on
  // `<body>`) hears Esc, and the shell's Esc stands down while a layer is
  // open. So while the month is open the anchor itself closes it: on a click
  // (the title is a toggle) and on Esc.
  //
  // Both are stopped here. React draws the closed band between this listener
  // and its own at the root, so a click that went on would reach the title's
  // `onClick` as "the month is closed" and open it again; an Esc that went on
  // could reach the shell with no layer left and close the chat too.
  useEffect(() => {
    if (!anchor) return;
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.stopPropagation();
      closeRef.current();
    };
    anchor.addEventListener("click", onClick);
    anchor.addEventListener("keydown", onKey);
    return () => {
      anchor.removeEventListener("click", onClick);
      anchor.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  return (
    <DesktopPopover anchor={anchor} label={label} onClose={close} width={336}>
      <style>{MONTH_SLIDE_CSS}</style>
      <div style={{ flexShrink: 0, boxSizing: "border-box", padding: "6px 0 14px", display: "flex", flexDirection: "column" }}>
        <MonthBody
          initialDay={initialDay}
          now={now}
          night={night}
          onPicked={(day) => {
            pickedRef.current = day;
          }}
          onOpenRoom={openRoom}
          renderTitle={(monthLabel) => <MonthTitle label={monthLabel} muted={t.muted} onLabel={setLabel} />}
        />
      </div>
    </DesktopPopover>
  );
}

/** `October` `2026`: the header row's first child (it pushes `Today` and the chevrons right), said when the month changes. It tells the popover its words, which name the dialog. */
function MonthTitle({ label, muted, onLabel }: { label: string; muted: string; onLabel: (label: string) => void }) {
  useEffect(() => {
    onLabel(label);
  }, [label, onLabel]);
  // `October 2026` → the name, then the year (cut at the last space, as the sheet's title is).
  const cut = label.lastIndexOf(" ");
  return (
    <h2 aria-live="polite" aria-atomic="true" style={{ margin: 0, marginRight: "auto", minWidth: 0, overflow: "hidden", display: "flex", alignItems: "baseline", gap: 6, fontFamily: SERIF, fontWeight: 800, fontSize: 20, lineHeight: "24px", letterSpacing: "-0.4px", whiteSpace: "nowrap" }}>
      {label.slice(0, cut)}
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: 0, color: muted }}>{label.slice(cut + 1)}</span>
    </h2>
  );
}
