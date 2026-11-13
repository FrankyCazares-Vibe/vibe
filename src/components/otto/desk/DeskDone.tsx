"use client";

import "../kit/sky.css";
import "../kit/desk.css";
import "../kit/motion.css";

import { useEffect } from "react";

import { enterIds, justDone } from "@/lib/motion/feedback";
import type { DeskItem } from "@/lib/otto/desk";

import { DeskLinkRow, DeskTitle } from "./DeskName";
import { DeskIcon, deskLine } from "./DeskRow";

/**
 * A finished thing (Nov 10, 2026, the Otto build's Wave 2A; board D1
 * "dk-done"): the halftone stamp (the only halftone on the desk) when the
 * model marks it `stamp: "done"`, else its kind's icon, then the title and one
 * quiet line. Still at rest: no pop, no count-up. Sits in a `DeskList`.
 * Motion 1 (Nov 12): a row that arrives just after a success (an Accept, a
 * reminder done) rises in and its stamp lands, once (feedback.ts; never on a
 * page load, never under reduced motion).
 *
 * `dayRight` (the computer's Earlier column) puts the short date on the right
 * instead of in the second line. A row with `href` opens it.
 */

/** The done stamp: halftone dots behind a tick, tilted. `big` = 72px. Decorative. */
export function DeskStamp({ big = false }: { big?: boolean }) {
  return (
    <span className={big ? "tx-host dk-stamp big" : "tx-host dk-stamp"} aria-hidden="true">
      <i className="tx tx-halftone" />
      <svg className="dk-tick" viewBox="0 0 16 16" focusable="false">
        <path d="M3 8.5l3.2 3.2L13 4.8" />
      </svg>
    </span>
  );
}

export type DeskDoneProps = { item: DeskItem; dayRight?: boolean };

export function DeskDone({ item, dayRight = false }: DeskDoneProps) {
  // Mount only: the rows already there keep still when the desk reads again.
  useEffect(() => {
    if (justDone()) enterIds([item.id], true);
  }, [item.id]);
  const line = deskLine(item, !dayRight);
  const body = (
    <>
      {item.stamp === "done" ? (
        <DeskStamp />
      ) : (
        <span className="dk-row-ic">
          <DeskIcon name={item.kind} />
        </span>
      )}
      <span className="dk-row-tx">
        <b>
          <DeskTitle item={item} />
        </b>
        {line ? <span>{line}</span> : null}
      </span>
      {dayRight && item.whenLabel ? <span className="dk-row-day">{item.whenLabel}</span> : null}
    </>
  );
  return item.href ? (
    <DeskLinkRow item={item} href={item.href} className="dk-done" dataId={item.id}>
      {body}
    </DeskLinkRow>
  ) : (
    <div className="dk-done" data-dk-id={item.id}>
      {body}
    </div>
  );
}
