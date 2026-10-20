"use client";

import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  createLinkedEventBoard,
  EVENT_NOT_LISTED,
  type LinkedSource,
  type ListReport,
  readEventParam,
} from "@/lib/calendar/calendar-key";
import { toast } from "@/lib/feedback/toast";
import { SPRING_SOFT } from "@/lib/motion/springs";

/**
 * The club page opened at one event (Oct 19, 2026, critique D13, decision
 * 13): `/orgs/<handle>?event=<id>` is where a calendar event opens until Vibe
 * has a real event page. The upcoming list and the past list each call
 * `useLinkedEvent` once their first read has answered; the one holding the
 * event scrolls it to the middle of the screen, moves focus to it and
 * flashes a coral ring around it. When neither list has it, a quiet toast
 * says "That event isn't listed anymore." A list that couldn't load says
 * `unknown`, and then nothing is said (it can't tell).
 *
 * The two lists are separate components, so they meet here, on one board
 * per page (`createLinkedEventBoard` in calendar-key.ts, where the rule is
 * tested). Only the first settled answer may toast: an officer's Cancel or
 * Delete later in the same visit takes the card out of the list, and that
 * must not replace their own result toast (Oct 19, 2026 repair).
 */

const board = createLinkedEventBoard();

/** The page's `?event=` id, or null. The lists pass it to the API as `include`. */
export function useLinkedEventParam(): string | null {
  return readEventParam(useSearchParams().get("event"));
}

/** The `data-` attribute the lists put on each event's wrapper. */
export const EVENT_ANCHOR_ATTR = "data-event-anchor";

function reduceMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `ids`: the list's event ids once its first read answered, null while it
 * loads, or `"unknown"` when that read failed. Returns the linked id when
 * this list holds it (the list draws `<LinkedFlash />` on that one).
 */
export function useLinkedEvent(source: LinkedSource, ids: readonly string[] | "unknown" | null): string | null {
  const eventId = useLinkedEventParam();
  const holds = eventId !== null && Array.isArray(ids) && ids.includes(eventId);
  const report: ListReport | null = ids === null ? null : ids === "unknown" ? "unknown" : holds ? "found" : "missing";
  // Scrolled to once per link: a refresh after an RSVP doesn't move the page.
  const scrolledFor = useRef<string | null>(null);

  // This list is on the page for this link. Leaving takes its word back;
  // when both lists have left, the next visit starts over.
  useEffect(() => {
    if (!eventId) return;
    board.join(eventId, source);
    return () => board.leave(eventId, source);
  }, [eventId, source]);

  useEffect(() => {
    if (!eventId || !report) return;
    if (board.report(eventId, source, report)) {
      // Longer than an info toast's 2.4 s: the page just opened and the
      // student is still finding their place on it.
      toast({ message: EVENT_NOT_LISTED, tone: "info", durationMs: 4_500 });
    }
    if (report === "found" && scrolledFor.current !== eventId) {
      const el = document.querySelector<HTMLElement>(`[${EVENT_ANCHOR_ATTR}="${eventId}"]`);
      if (el) {
        scrolledFor.current = eventId;
        el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
        // Keyboard and screen-reader users land on the event too.
        el.focus({ preventScroll: true });
      }
    }
  }, [eventId, report, source]);

  return holds ? eventId : null;
}

/**
 * The linked card's focus mark (Oct 19, 2026 repair, WCAG 2.4.7). The card's
 * wrapper takes focus when the page opens at it, and the flash below fades
 * after 1.8 s, so a coral outline stays for as long as the wrapper itself
 * has focus. `:focus`, not `:focus-visible`: the wrapper is only ever focused
 * by this page (tabIndex -1), and after a mouse click on a calendar chip a
 * browser would not count the move as visible. It goes when focus moves on.
 * Each wrapper sets its own `borderRadius`, which the outline follows.
 */
export function LinkedFocusStyle() {
  return (
    <style>{`[${EVENT_ANCHOR_ATTR}]:focus{outline:2px solid var(--coral);outline-offset:3px}`}</style>
  );
}

/**
 * A coral ring that fades in around the linked event, holds, and fades out.
 * Opacity only, on the app's soft spring (src/lib/motion); with reduced
 * motion on, MotionRoot turns it into a plain fade. Put it inside a
 * `position: relative` wrapper.
 */
export function LinkedFlash({ radius = 16, inset = -4 }: { radius?: number; inset?: number | string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), 1800);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: on ? 1 : 0 }}
      transition={SPRING_SOFT}
      style={{
        position: "absolute",
        inset,
        borderRadius: radius + 4,
        border: "2px solid var(--coral)",
        boxShadow: "0 0 0 4px rgba(255,92,53,0.18), 0 0 18px rgba(255,92,53,0.35)",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
