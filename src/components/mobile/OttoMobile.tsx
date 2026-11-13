"use client";

import "@/components/otto/kit/sky.css";
import "@/components/otto/kit/desk.css";
import "./otto-desk-mobile.css";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { OttoPayload } from "@/app/api/me/otto/route";
import { useTabScrollMemory } from "@/components/mobile/use-tab-scroll-memory";
import { OttoMetrics } from "@/components/otto/OttoMetrics";
import { OttoSettings } from "@/components/otto/OttoSettings";
import { OttoSky } from "@/components/otto/desk/OttoSky";
import { arriveFrom, moveFrom, prefersReducedMotion } from "@/components/otto/otto-motion";
import { RISE_PX } from "@/lib/motion/springs";
import { ClubSwitcherSheet } from "@/components/orgs/ClubSwitcherSheet";
import { DeskClubMark } from "@/components/otto/desk/DeskDraft";
import { deskFoldNote } from "@/lib/otto/desk";

import { OttoDeskPanes } from "./OttoDeskPanes";
import { ActingAsChip, DESK_TABS, DeskTabs, paneId, tabId, type DeskTab } from "./OttoDeskParts";
import { OttoMobileLegacy } from "./OttoMobileLegacy";
import { ReminderBar } from "./ReminderBar";
import { useOttoDesk } from "./use-otto-desk";

/**
 * The phone's Otto tab. With the desk on (the default; `OTTO_DESK=off` turns
 * it off, src/lib/otto/desk-flag.ts) it is Otto's desk; with it off, today's
 * page, unchanged (OttoMobileLegacy.tsx). `desk` comes from the page
 * (OttoSwitch reads the switch); without it, a payload that carries the desk
 * (or names it in `failed`) means the switch is on.
 */
export function OttoMobile({ initial, desk }: { initial: OttoPayload; desk?: boolean }) {
  const on = desk ?? (initial.desk !== undefined || (initial.failed ?? []).includes("desk"));
  return on ? <OttoDeskMobile initial={initial} /> : <OttoMobileLegacy initial={initial} />;
}

/** The parts under the sky that move when it comes or goes. */
const GLIDERS = ":scope > .odm-as-row, :scope > .odm-strip, :scope > .odm-panes";
/** The tall sky drops this far as it fades back in. */
const RISE_SKY = 8;
/** Where the parts under the sky fade up from when it comes or goes: never from nothing, so the screen never dips to
 *  an empty frame (from 0 it read as a blink, repair walk). */
const SETTLE_FROM = 0.35;

const ASK_FOOT = "Otto's desk shows what this club needs. Your Profile tab doesn't change.";

/**
 * Otto's desk on a phone (Nov 10, 2026, the Otto build's Wave 2A; board D1,
 * D4). His warm sky on top with his one line, soft hills, then the paper:
 * Ready for you, Scheduled, Done this week. Swipe or tap to Saw, Stats and
 * Settings. The reminder bar sits above the tab bar everywhere.
 *
 * THE FOLD. The tall sky scrolls away with the page; once the big Otto has
 * gone under the top edge, the short bar (28px Otto, "otto.", what's ready)
 * fades in, fixed at the top. Opacity and position only, nothing resizes;
 * reduced motion makes it simply appear. The tall sky's own observer stops
 * Otto once it is off screen (OttoSky).
 *
 * HONESTY. Nothing here says Otto did, drafted or sent anything: the model
 * (src/lib/otto/desk.ts) words every line, Accept goes through the club's
 * existing approve route, and the bar saves a reminder.
 */
function OttoDeskMobile({ initial }: { initial: OttoPayload }) {
  const searchParams = useSearchParams();
  const asked = searchParams.get("tab");
  const [tab, setTab] = useState<DeskTab>(DESK_TABS.includes(asked as DeskTab) ? (asked as DeskTab) : "desk");
  useTabScrollMemory(tab, "/otto");
  const state = useOttoDesk(initial);
  const { desk } = state;
  const [sheet, setSheet] = useState(false);

  // Motion 1 (Nov 12): only Desk has the tall sky, so moving to or from it
  // moves the chip, the strip and the panes up or down. Their places are
  // read before the change and they glide there (a FLIP) instead of jumping.
  const mainRef = useRef<HTMLElement | null>(null);
  const before = useRef<Map<Element, number> | null>(null);
  const tabNow = useRef(tab);
  const setActiveTab = useCallback((next: DeskTab) => {
    if ((next === "desk") !== (tabNow.current === "desk") && mainRef.current) {
      before.current = new Map(
        [...mainRef.current.querySelectorAll(GLIDERS)].map((el) => [el, el.getBoundingClientRect().top]),
      );
    }
    tabNow.current = next;
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "desk") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* not in a browser */
    }
  }, []);

  // Only the Desk tab has the tall sky; Saw, Stats and Settings sit under the
  // short bar from the top (D4), so their numbers and switches aren't pushed
  // below a sky that talks about the desk.
  const tall = tab === "desk";

  // The fold: the bottom of the tall sky passing beneath the short bar.
  const markRef = useRef<HTMLSpanElement | null>(null);
  const foldRef = useRef<HTMLDivElement | null>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const mark = markRef.current;
    if (!tall || !mark || typeof IntersectionObserver === "undefined") return;
    const h = Math.max(1, Math.round(foldRef.current?.offsetHeight ?? 60));
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) setFolded(!e.isIntersecting && e.boundingClientRect.top < h);
      },
      { rootMargin: `-${h}px 0px 0px 0px` },
    );
    io.observe(mark);
    return () => io.disconnect();
  }, [tall]);
  const barOn = folded || !tall;

  // After the scroll memory has put the new tab at its place (its layout
  // effects run first). The sky comes or goes in one frame (no height is
  // animated), so the parts under it don't travel the whole way from their
  // old place (that read as an empty band, then a drift, in the repair
  // review): they fade in and settle the last 8px (RISE_PX) in the
  // direction they moved, the page re-composing like a page move. Coming
  // back to Desk, the tall sky fades down into place.
  const skyRef = useRef<HTMLDivElement | null>(null);
  const glidedTab = useRef(tab);
  useLayoutEffect(() => {
    const from = glidedTab.current;
    glidedTab.current = tab;
    const was = before.current;
    before.current = null;
    if (from === tab) return;
    if (tab === "desk" && from !== "desk" && skyRef.current) moveFrom(skyRef.current, { y: -RISE_SKY, opacity: 0 });
    if (!was) return;
    for (const [el, top] of was) {
      if (!el.isConnected || !(el instanceof HTMLElement)) continue;
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) >= 1) moveFrom(el, { y: Math.sign(dy) * RISE_PX, opacity: SETTLE_FROM });
    }
  }, [tab]);

  // Swipe between panes; a tap scrolls the strip there (legacy behaviour).
  const panesRef = useRef<HTMLDivElement | null>(null);
  const programmatic = useRef(false);
  useEffect(() => {
    const el = panesRef.current;
    if (!el) return;
    const target = el.clientWidth * DESK_TABS.indexOf(tab);
    if (Math.abs(el.scrollLeft - target) < 4) return;
    programmatic.current = true;
    // A tap to the next tab slides the strip over (the panes glide in the
    // direction of travel). A longer jump, or one in or out of Desk (where
    // the sky comes or goes and the panes re-compose anyway), lands at once
    // and the new pane arrives from its side: smooth-scrolling through two
    // or three panes read as a blur of text over text (repair review).
    // Reduce motion jumps straight there.
    const from = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const to = DESK_TABS.indexOf(tab);
    // A swipe already past halfway (from === to) just finishes as it was.
    const swiped = from === to;
    const glide = !prefersReducedMotion() && (swiped || (Math.abs(to - from) === 1 && from !== 0 && to !== 0));
    // With reduce motion a swipe is left to the strip's own snap (an instant
    // jump mid-fling flung it a tab too far).
    if (glide || !swiped) el.scrollTo({ left: target, behavior: glide ? "smooth" : "auto" });
    if (!glide && !swiped && from !== 0 && to !== 0) arriveFrom(document.getElementById(paneId(tab)), to > from ? 1 : -1);
    const t = window.setTimeout(() => {
      programmatic.current = false;
    }, 420);
    return () => window.clearTimeout(t);
  }, [tab]);

  const say = desk ? desk.say : "my desk didn't load. try again in a sec.";
  // The sky line's rule: never "all clear" over a read that failed (desk.ts).
  const note = desk ? deskFoldNote(desk, state.failed) : undefined;
  const youWaiting = desk?.actingAs ? (desk.youWaiting ?? 0) : 0;

  return (
    <main ref={mainRef} className="odm">
      {tall ? (
        <div ref={skyRef} className="odm-top">
          <OttoSky variant="tall" say={say} />
          <span ref={markRef} className="odm-mark" aria-hidden="true" />
        </div>
      ) : (
        <div className="odm-top-short" aria-hidden="true" />
      )}
      <div ref={foldRef} className={barOn ? "odm-fold on" : "odm-fold"} aria-hidden={!barOn} inert={!barOn}>
        <OttoSky variant="short" say={say} note={note} />
      </div>

      {desk && desk.clubs.length > 0 ? (
        <ActingAsChip
          actingAs={desk.actingAs}
          youWaiting={youWaiting}
          onOpen={() => setSheet(true)}
          onYou={() => state.actAs(null)}
          busy={state.loading}
        />
      ) : null}
      <DeskTabs active={tab} onChange={setActiveTab} />

      <div
        ref={panesRef}
        className="odm-panes"
        aria-busy={state.loading || undefined}
        onScroll={(e) => {
          if (programmatic.current) return;
          const el = e.currentTarget;
          if (el.clientWidth === 0) return;
          const next = DESK_TABS[Math.round(el.scrollLeft / el.clientWidth)];
          if (next && next !== tab) setActiveTab(next);
        }}
      >
        <OttoDeskPanes state={state} />
        <section id={paneId("stats")} role="tabpanel" aria-labelledby={tabId("stats")} className="odm-pane">
          <OttoMetrics club={desk?.actingAs ?? null} />
        </section>
        <section id={paneId("settings")} role="tabpanel" aria-labelledby={tabId("settings")} className="odm-pane">
          <OttoSettings settings={initial.settings} />
        </section>
      </div>

      <ReminderBar onSaved={state.reminderSaved} />
      {desk && desk.clubs.length > 0 ? (
        <ClubSwitcherSheet
          open={sheet}
          onClose={() => setSheet(false)}
          onPick={(club) => state.actAs(club?.handle ?? null)}
          current={desk.actingAs?.handle ?? null}
          title="Acting as."
          footnote={ASK_FOOT}
          meSide={youWaiting > 0 ? `${youWaiting} waiting` : null}
          clubPicture={(c) => (
            <span className="odm-sheet-mark">
              <DeskClubMark club={{ orgId: c.org_id, name: c.name, handle: c.handle, role: c.role === "owner" ? "owner" : "officer", avatarUrl: c.logo_url }} />
            </span>
          )}
        />
      ) : null}
    </main>
  );
}
