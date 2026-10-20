"use client";

import { useRef, useState } from "react";
import { Drawer } from "vaul";

import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import { isTap, startOfLocalDay } from "@/lib/chat/week";

import { vaulContentStyle, vaulOverlayStyle } from "../sheet-styles";
import { FONT, palette, SERIF } from "../v2-tokens";

import { sheetReturnFocus, type WeekEntry } from "./home-rules";
import { MonthBody } from "./MonthBody";
import { SLIDE_CSS } from "./YourWeek";

/**
 * The month sheet of the Messages home (S71 amendment 4, section 2; mockup
 * R3_Month): the month of your RSVPs, opened by the week's title (on today,
 * or on the Monday of the week on screen) or by a day of the strip (on that
 * day).
 *
 * Since the wave-3 split (contract 6.2) this file is the SHELL only: vaul,
 * the handle, the tab bar, the history entry, the focus rules, the close.
 * The calendar itself (the picked day, the month on screen, the per-month
 * read, everything from the header row to the footer line) is `MonthBody`,
 * which the desktop's month popover wraps too. The sheet draws the same
 * nodes in the same order as before the split; the list below still
 * describes the whole sheet.
 *
 * - The app's bottom sheet, as `CardSheet` / `RsvpSheet`: vaul, the scrim,
 *   the 40×5 handle (here a Close button), `var(--paper)`, radius 28. A plain `Drawer.Root`: the
 *   home is not inside a drawer (`NestedRoot` throws without one). It calls
 *   `useHideTabBar()` (the tab bar is above every sheet) and owns one history
 *   entry (`useLayerHistory`): Back closes the sheet and nothing else.
 * - A fixed height (580px, at most 88dvh), the content scrolling inside: a
 *   bottom sheet that hugged its content would move the grid under the
 *   finger whenever the picked day has more or fewer plans.
 * - Top to bottom: `October` `2026`, the `Today` pill, the two month
 *   chevrons; `Mon … Sun`; the grid (a mark under a day with plans — a
 *   coral dot when any is Going, a coral ring for Interested only, the
 *   calendar key since Oct 19, 2026, `dayDot`; today's coral ring; the
 *   picked day filled; other months' days blank; past days dim); the picked
 *   day (`Fri, Oct 9`, `Tomorrow · 1 plan`) and its plans by start; the
 *   line `Only events you RSVP'd to`.
 * - The grid swipes month to month (the week strip's rule, `useSwipe`) and
 *   the chevrons do the same, between the months of `monthBounds(now)`.
 *   Moving the month keeps the picked day. The grid is `data-vaul-no-drag`,
 *   so a swipe never drags the sheet; the rest of the sheet still does.
 * - One calendar read per month on screen (the grid's first Monday 00:00 to
 *   its last Sunday 23:59:59.999), kept by month while the sheet is open.
 *   While it is out the grid draws without dots; a failure shows
 *   `Couldn't load your calendar.` with Retry in the day's place.
 * - A plan whose entry has a `room_id` is a button: `onOpenRoom(entry)`. The
 *   shell opens the room through the history layer, which closes this sheet
 *   on the way (`onPop`) and gives the sheet's history entry to the room —
 *   so the sheet is never stepped back off and then pushed over
 *   (`MessagesMobile.openView`, `layer-stack.ts`).
 * - `onClose(picked)` on every way out (the handle, the scrim, the drag,
 *   Escape, Back, a plan): the home moves the strip to that day's week.
 * - The handle is a real button (`CloseHandle`, R3_Month:160): vaul's own
 *   `Drawer.Handle` is an `aria-hidden` div that does nothing on a tap, and
 *   the scrim is hidden from assistive tech, so without it a screen reader
 *   or a switch had no way out but Escape and Back.
 * - Focus on close is the sheet's own (`sheetReturnFocus`): the control that
 *   opened it, else the week's title, nothing when an event chat is opening.
 */
export type MonthSheetProps = {
  /** The day picked when the sheet opens. */
  initialDay: Date;
  /** The control that opened the sheet (a day of the strip, the week's title): focus returns to it on close. */
  opener: HTMLElement | null;
  now: Date;
  night: boolean;
  /** The sheet closed; `picked` is the day selected at that moment. */
  onClose: (picked: Date) => void;
  /** A plan with a room: the shell opens its event chat (and closes this sheet). */
  onOpenRoom: (entry: WeekEntry) => void;
  /** Where focus goes when the sheet closes and `opener` is gone (the strip moved to another week): the week's title. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

export function MonthSheet({ initialDay, opener, now, night, onClose, onOpenRoom, returnFocusTo }: MonthSheetProps) {
  useHideTabBar();
  const t = palette(night);
  // The day picked in the body, as the body last said it (`onPicked`): what `onClose` hands on.
  const [picked, setPicked] = useState(() => startOfLocalDay(initialDay));
  // The scrolling box around the body: the picked day's button is looked up in it when the sheet opens.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // True from the press of a plan row: the sheet is closing because its event chat is opening.
  const openingRoomRef = useRef(false);

  const close = () => onClose(picked);
  // The user's own ways out (the handle, the scrim, a drag, Escape): never a room opening.
  const closeByHand = () => {
    openingRoomRef.current = false;
    close();
  };
  const openRoom = (entry: WeekEntry) => {
    openingRoomRef.current = true;
    onOpenRoom(entry);
  };
  // Its own history entry while it is on screen (it is mounted only then).
  useLayerHistory(true, close);

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) closeByHand();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, background: t.scrim }} />
        <Drawer.Content
          style={{
            ...vaulContentStyle,
            background: t.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTop: `1px solid ${t.fieldBorder}`,
            boxShadow: night ? "0 -18px 44px rgba(0,0,0,0.6)" : "0 -18px 44px rgba(20,20,22,0.18)",
            height: 580,
            maxHeight: "88dvh",
            display: "flex",
            flexDirection: "column",
            fontFamily: FONT,
            color: t.ink,
          }}
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus lands on the picked day, not on the first control. The day
            // is the body's one pressed button (`aria-pressed`); none when the
            // picked day's month is not the one on screen.
            const pickedDay = bodyRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
            if (!pickedDay) return;
            e.preventDefault();
            pickedDay.focus();
          }}
          onCloseAutoFocus={(e) => {
            // Always the sheet's own answer. Left alone, Radix's modal handler
            // runs: it prevents the default (the focus scope's restore) and
            // focuses its trigger, and this sheet has none, so focus would
            // fall to <body>.
            e.preventDefault();
            sheetReturnFocus(opener, returnFocusTo?.current ?? null, openingRoomRef.current)?.focus({ preventScroll: true });
          }}
        >
          <style>{SLIDE_CSS}</style>
          <CloseHandle onClose={closeByHand} />
          <div ref={bodyRef} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", boxSizing: "border-box", paddingBottom: 14, display: "flex", flexDirection: "column" }}>
            <MonthBody
              initialDay={initialDay}
              now={now}
              night={night}
              onPicked={setPicked}
              onOpenRoom={openRoom}
              renderTitle={(label) => {
                // `October 2026` → the name in the title's serif, the year small and muted beside it (R3_Month:98).
                const cut = label.lastIndexOf(" ");
                return (
                  <Drawer.Title aria-live="polite" aria-atomic="true" style={{ margin: 0, marginRight: "auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 7, fontFamily: SERIF, fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: "-0.6px", whiteSpace: "nowrap" }}>
                    {label.slice(0, cut)}
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: 0, color: t.muted }}>{label.slice(cut + 1)}</span>
                  </Drawer.Title>
                );
              }}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The sheet's handle as a button (R3_Month:160, `Close the calendar, back to
 * your week`): the same 40×5 bar, 8px under the sheet's top edge, inside an
 * 88×44 target. The target takes the handle's 20px of the sheet and reaches
 * 24px above the sheet's edge, over the scrim (a tap there closes the sheet
 * anyway), so it covers nothing of the header under it.
 *
 * The sheet is still dragged from here (vaul's drag starts on any part of
 * the content). A drag that lets go without closing ends, with a mouse, in a
 * click on this button: that click is not a press (`isTap`), as `useSwipe`
 * does for a swipe. A keyboard or a screen reader press has no drag before it.
 */
function CloseHandle({ onClose }: { onClose: () => void }) {
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedAtRef = useRef(Number.NEGATIVE_INFINITY);
  return (
    <button
      type="button"
      aria-label="Close the calendar, back to your week"
      onPointerDown={(e) => {
        downRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const down = downRef.current;
        downRef.current = null;
        if (down && !isTap(e.clientX - down.x, e.clientY - down.y)) draggedAtRef.current = e.timeStamp;
      }}
      onPointerCancel={() => {
        downRef.current = null;
      }}
      onClick={(e) => {
        if (e.timeStamp - draggedAtRef.current < 400) return;
        onClose();
      }}
      style={{ position: "relative", alignSelf: "center", flexShrink: 0, width: 88, height: 44, marginTop: -24, padding: 0, border: "none", borderRadius: 14, background: "transparent", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {/* The bar as `Drawer.Handle` draws it in `CardSheet` / `RsvpSheet` (vaul's own sheet gives its handle `opacity: .7`). */}
      <span aria-hidden="true" style={{ position: "absolute", left: 24, bottom: 7, width: 40, height: 5, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.24)", opacity: 0.7 }} />
    </button>
  );
}
