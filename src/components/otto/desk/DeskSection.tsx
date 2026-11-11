"use client";

import "../kit/sky.css";
import "../kit/desk.css";

import { useId, type ReactNode } from "react";

import { DeskEmpty } from "./DeskEmpty";

/**
 * A desk section (Nov 10, 2026, the Otto build's Wave 2A; board D1 "dk-sec"):
 * a heading with its count, then the pile. With `count` 0 and an `empty`
 * line, the pile is Otto's empty line instead of `children`.
 *
 * `DeskList` is the paper card rows sit in (dk-card list).
 */

export type DeskSectionProps = {
  title: string;
  count: number;
  /** Otto's lowercase line for an empty pile (desk.empty.*). */
  empty?: string;
  /** Heading level: 2 on the desk pages (default), 3 when nested. */
  level?: 2 | 3;
  className?: string;
  id?: string;
  children?: ReactNode;
};

export function DeskSection({ title, count, empty, level = 2, className, id, children }: DeskSectionProps) {
  const headingId = useId();
  const H = level === 3 ? "h3" : "h2";
  const showEmpty = count === 0 && empty;
  return (
    <section id={id} className={className} aria-labelledby={headingId}>
      <div className="dk-sec">
        <H id={headingId}>{title}</H>
        <b>{count}</b>
      </div>
      <div className="dk-pile">{showEmpty ? <DeskEmpty line={empty} /> : children}</div>
    </section>
  );
}

/** The paper card desk rows sit in. */
export function DeskList({ children }: { children: ReactNode }) {
  return (
    <div className="tx-host dk-card list">
      <i className="tx tx-paper" aria-hidden="true" />
      {children}
    </div>
  );
}
