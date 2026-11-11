"use client";

import "../kit/sky.css";
import "../kit/desk.css";

import Link from "next/link";
import type { ReactNode } from "react";

import type { DeskItem, DeskKind, DeskVerb } from "@/lib/otto/desk";

import { DeskLinkRow, DeskTitle } from "./DeskName";

/**
 * One desk row (Nov 10, 2026, the Otto build's Wave 2A; board D1 "dk-row"):
 * an icon square, the title and one quiet line (detail · when), then the
 * row's verb as a QUIET button, or a chevron when the whole row is a link.
 * Sits in a `DeskList` (dk-card list). The coral verb is DeskDraft's alone.
 *
 * Also exports the kind icons and `DeskVerbButton`, which the draft and the
 * folded rows share.
 */

const ICONS: Record<DeskKind | "clock" | "chevron", ReactNode> = {
  join_request: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19.5c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5M18.5 8v6M15.5 11h6" />
    </>
  ),
  up_next: <path d="M5 12h13M13 6l6 6-6 6" />,
  setup_step: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.9" />
    </>
  ),
  draft: <path d="M4 10v4h3l7 4.5v-13L7 10zM17.5 9.5a3.5 3.5 0 0 1 0 5" />,
  follow_back: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.4-3.9 4.3-5.8 7.5-5.8s6.1 1.9 7.5 5.8" />
    </>
  ),
  unread_dm: <path d="M4.5 5.5h15v10.5H10l-5.5 4.5z" />,
  reminder: <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />,
  event: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  rsvp: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
    </>
  ),
  post: <path d="M4 10v4h3l7 4.5v-13L7 10zM17.5 9.5a3.5 3.5 0 0 1 0 5" />,
  checkin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  cancelled: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  notification: (
    <>
      <path d="M2.5 12c2.4-4.2 5.6-6.3 9.5-6.3s7.1 2.1 9.5 6.3c-2.4 4.2-5.6 6.3-9.5 6.3S4.9 16.2 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
};

/** A 20px stroke icon for a desk kind (plus "clock" and "chevron"). Decorative. */
export function DeskIcon({ name }: { name: DeskKind | "clock" | "chevron" }) {
  return (
    <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name] ?? ICONS.notification}
    </svg>
  );
}

/** "detail · when", the row's one quiet line. */
export function deskLine(item: Pick<DeskItem, "detail" | "whenLabel">, withWhen = true): string {
  return [item.detail, withWhen ? item.whenLabel : undefined].filter(Boolean).join(" · ");
}

export type DeskVerbProps = {
  item: DeskItem;
  verb: DeskVerb;
  /** The frame's one coral fill (ready[0] only). */
  primary?: boolean;
  /** Runs a join_request verb; the parent calls the existing approve route. */
  onVerb?: (item: DeskItem) => void;
  busy?: boolean;
  /** A folded row: a link verb reads "Open" (its full label stays in the accessible name). */
  short?: boolean;
};

/** The verb as a button: a link, or Accept (handed to `onVerb`). Quiet unless `primary`. */
export function DeskVerbButton({ item, verb, primary, onVerb, busy, short }: DeskVerbProps) {
  const cls = primary ? "dk-btn primary" : "dk-btn";
  const label = `${verb.label}: ${item.title}`;
  if (verb.kind === "link") {
    // A folded row says only "Open", as on the board, so its title keeps the
    // room; the full verb stays in the accessible name.
    return (
      <Link className={cls} href={verb.href} aria-label={label}>
        {short ? "Open" : verb.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy || !onVerb}
      onClick={() => onVerb?.(item)}
    >
      {verb.label}
    </button>
  );
}

export type DeskRowProps = {
  item: DeskItem;
  onVerb?: (item: DeskItem) => void;
  busy?: boolean;
};

/**
 * A row: its verb (quiet), else the whole row opens `href` with a chevron, else
 * it just reads. A person's name in the title links to their profile.
 */
export function DeskRow({ item, onVerb, busy }: DeskRowProps) {
  const body = (
    <>
      <span className="dk-row-ic">
        <DeskIcon name={item.kind} />
      </span>
      <span className="dk-row-tx">
        <b>
          <DeskTitle item={item} />
        </b>
        {deskLine(item) ? <span>{deskLine(item)}</span> : null}
      </span>
    </>
  );
  if (item.verb) {
    return (
      <div className="dk-row">
        {body}
        <DeskVerbButton item={item} verb={item.verb} onVerb={onVerb} busy={busy} />
      </div>
    );
  }
  if (item.href) {
    return (
      <DeskLinkRow item={item} href={item.href} className="dk-row">
        {body}
        <span className="dk-row-go" aria-hidden="true">
          <DeskIcon name="chevron" />
        </span>
      </DeskLinkRow>
    );
  }
  return <div className="dk-row">{body}</div>;
}
