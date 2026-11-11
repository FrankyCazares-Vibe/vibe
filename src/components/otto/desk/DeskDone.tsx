"use client";

import "../kit/sky.css";
import "../kit/desk.css";

import Link from "next/link";

import type { DeskItem } from "@/lib/otto/desk";

import { DeskIcon, deskLine } from "./DeskRow";

/**
 * A finished thing (Nov 10, 2026, the Otto build's Wave 2A; board D1
 * "dk-done"): the halftone stamp (the only halftone on the desk) when the
 * model marks it `stamp: "done"`, else its kind's icon, then the title and one
 * quiet line. Still: no pop, no count-up. Sits in a `DeskList`.
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
        <b>{item.title}</b>
        {line ? <span>{line}</span> : null}
      </span>
      {dayRight && item.whenLabel ? <span className="dk-row-day">{item.whenLabel}</span> : null}
    </>
  );
  return item.href ? (
    <Link className="dk-done" href={item.href}>
      {body}
    </Link>
  ) : (
    <div className="dk-done">{body}</div>
  );
}
