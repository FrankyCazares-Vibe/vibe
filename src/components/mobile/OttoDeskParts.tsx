"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useAnimate } from "motion/react";

import { DeskClubMark } from "@/components/otto/desk/DeskDraft";
import { DeskIcon } from "@/components/otto/desk/DeskRow";
import type { DeskClub, DeskItem } from "@/lib/otto/desk";
import { SPRING_SNAPPY } from "@/lib/motion/springs";

/**
 * The phone desk's own small parts (Nov 10, 2026, the Otto build's Wave 2A),
 * built from the kit's classes (desk.css) and placed by otto-desk-mobile.css:
 * the Desk | Saw | Stats | Settings strip, the Acting as chip, a reminder row
 * with Done, an "Otto saw" row, and the calm card for a desk that didn't load.
 * The reminder bar is ReminderBar.tsx.
 */

export type DeskTab = "desk" | "saw" | "stats" | "settings";
export const DESK_TABS: DeskTab[] = ["desk", "saw", "stats", "settings"];
const TAB_LABEL: Record<DeskTab, string> = { desk: "Desk", saw: "Saw", stats: "Stats", settings: "Settings" };

export const tabId = (t: DeskTab) => `otto-desk-tab-${t}`;
export const paneId = (t: DeskTab) => `otto-desk-pane-${t}`;

/**
 * The four tabs in a raised well; the open one is ink. The ink pill slides
 * from the old tab (x + scaleX, SPRING_SNAPPY), as every phone strip does
 * (CampusMobile's TabStrip); useAnimate follows reduce motion.
 */
export function DeskTabs({ active, onChange }: { active: DeskTab; onChange: (t: DeskTab) => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const buttons = useRef<Partial<Record<DeskTab, HTMLButtonElement | null>>>({});
  const pill = useRef<HTMLSpanElement | null>(null);
  const shown = useRef(active);
  useLayoutEffect(() => {
    const from = buttons.current[shown.current];
    const to = buttons.current[active];
    shown.current = active;
    if (!from || !to || from === to || !pill.current || !to.offsetWidth) return;
    animate(
      pill.current,
      { x: [from.offsetLeft - to.offsetLeft, 0], scaleX: [from.offsetWidth / to.offsetWidth, 1] },
      SPRING_SNAPPY,
    );
  }, [active, animate]);

  return (
    <div className="odm-strip">
      <div ref={scope} className="odm-seg" role="tablist" aria-label="Otto">
        {DESK_TABS.map((t) => {
          const on = t === active;
          return (
            <button
              key={t}
              ref={(el) => {
                buttons.current[t] = el;
              }}
              id={tabId(t)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={paneId(t)}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = DESK_TABS[(DESK_TABS.indexOf(t) + step + DESK_TABS.length) % DESK_TABS.length];
                onChange(next);
                buttons.current[next]?.focus();
              }}
            >
              {on ? <span ref={pill} className="odm-seg-pill" aria-hidden="true" /> : null}
              <span className="odm-seg-tx">{TAB_LABEL[t]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Acting as <club>" (or You), opening the switch sheet. Officers only. */
export function ActingAsChip({ actingAs, onOpen }: { actingAs: DeskClub | null; onOpen: () => void }) {
  return (
    <div className="odm-as-row">
      <button type="button" className="odm-as" onClick={onOpen} aria-haspopup="dialog">
        {actingAs ? (
          <DeskClubMark club={actingAs} />
        ) : (
          <span className="odm-you" aria-hidden="true">
            <DeskIcon name="follow_back" />
          </span>
        )}
        <span>
          Acting as <b>{actingAs ? actingAs.name : "You"}</b>
        </span>
        <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

/** A reminder: its title, "Reminder · Thu", and a quiet Done (today's act route). */
export function ReminderRow({ item, onDone, busy }: { item: DeskItem; onDone: (item: DeskItem) => void; busy: boolean }) {
  return (
    <div className="dk-row">
      <span className="dk-row-ic">
        <DeskIcon name="reminder" />
      </span>
      <span className="dk-row-tx">
        <b>{item.title}</b>
        {item.whenLabel ? <span>{item.whenLabel}</span> : null}
      </span>
      <button
        type="button"
        className="dk-btn odm-row-btn"
        onClick={() => onDone(item)}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={`Done: ${item.title}`}
      >
        Done
      </button>
    </div>
  );
}

/** Otto saw: what happened, and when. No button, no arrow (board D4); the row opens it. */
export function SawRow({ item }: { item: DeskItem }) {
  const body = (
    <>
      <span className="dk-row-ic">
        <DeskIcon name={item.kind} />
      </span>
      <span className="dk-row-tx">
        <b>{item.title}</b>
        {item.detail ? <span>{item.detail}</span> : null}
      </span>
      {item.whenLabel ? <span className="dk-row-day">{item.whenLabel}</span> : null}
    </>
  );
  return item.href ? (
    <Link className="dk-row" href={item.href}>
      {body}
    </Link>
  ) : (
    <div className="dk-row">{body}</div>
  );
}

/** The calm failure card: a thin edge, what happened, one way on. */
export function DeskLoadFail({ line, onRetry, busy }: { line: string; onRetry?: () => void; busy?: boolean }) {
  const [tapped, setTapped] = useState(false);
  return (
    <div className="tx-host dk-card dk-fail" role="status">
      <i className="tx tx-paper" aria-hidden="true" />
      <div className="dk-fail-tag">Couldn&rsquo;t load</div>
      <p>{line}</p>
      {onRetry ? (
        <div className="dk-fail-go">
          <button
            type="button"
            className="dk-btn odm-retry"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => {
              setTapped(true);
              onRetry();
            }}
          >
            {busy && tapped ? "Trying…" : "Try again"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
