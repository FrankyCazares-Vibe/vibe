"use client";

import "../kit/sky.css";
import "../kit/desk.css";

import Link from "next/link";

import type { DeskClub, DeskItem, DeskKind } from "@/lib/otto/desk";
import { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

import { DeskIcon, DeskVerbButton, deskLine } from "./DeskRow";

/**
 * A Ready for you item on blueprint (Nov 10, 2026, the Otto build's Wave 2A;
 * board D1 "dk-draft"). Blueprint means "not done yet, waiting on you".
 *
 * - Open (the top item): who it is for ("Acting as <club>"), a small tag, the
 *   title with its date tile, "What will happen" with the model's real
 *   counts (only lines that are true today), then the verb. The verb is the
 *   frame's ONE coral fill, and only when the model marks the item
 *   `primary` (ready[0]); otherwise it is quiet.
 * - `open={false}`: the rest of Ready, folded to one row with a quiet button.
 *
 * Nothing here sends anything: a link verb opens a page, Accept is handed to
 * `onVerb` (the parent calls the existing approve route).
 */

const TAG: Partial<Record<DeskKind, string>> = {
  join_request: "Request",
  up_next: "Up next",
  setup_step: "Setup",
  draft: "Draft",
  follow_back: "Follower",
  unread_dm: "Message",
  reminder: "Reminder",
};

const MONTH = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, month: "short" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, day: "numeric" });

/** Kinds whose date is an event's date. Everything else (a request, a draft) shows its icon. */
const EVENT_DATED: ReadonlySet<DeskKind> = new Set<DeskKind>(["up_next", "event", "rsvp"]);

/** The date tile's two parts in campus time, or null when there is no usable date. */
function dateTile(iso: string | undefined): { month: string; day: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return { month: MONTH.format(ms), day: DAY.format(ms) };
}

/** "38 members get a notice" → the count in its own column; a line with no leading count reads plain. */
function splitCount(line: string): { n: string | null; rest: string } {
  const m = /^(\d[\d,]*)\s+(.+)$/.exec(line.trim());
  return m ? { n: m[1], rest: m[2] } : { n: null, rest: line };
}

/** Initials for a club with no picture: "Canal Run Club" → "CR". */
function initials(name: string): string {
  // Letters and digits only, so "SAE (local copy)" reads "SL", never "S(".
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function DeskClubMark({ club }: { club: DeskClub }) {
  return (
    <span className="dk-club" aria-hidden="true">
      {club.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 28px avatar from our own storage
        <img src={club.avatarUrl} alt="" width={28} height={28} loading="lazy" />
      ) : (
        initials(club.name)
      )}
    </span>
  );
}

export type DeskDraftProps = {
  item: DeskItem;
  /**
   * The club an officer is acting as; null for students. No longer drawn in
   * the card: the Acting as chip right above already says it (review).
   */
  actingAs?: DeskClub | null;
  /** The top item opens; the rest fold (default true). */
  open?: boolean;
  onVerb?: (item: DeskItem) => void;
  busy?: boolean;
  /** An optional true footnote under the buttons. */
  foot?: string;
};

export function DeskDraft({ item, open = true, onVerb, busy, foot }: DeskDraftProps) {
  const openLink =
    item.href && !(item.verb?.kind === "link" && item.verb.href === item.href) ? item.href : null;

  if (!open) {
    return (
      <article className="tx-host dk-draft mini" aria-label={item.title}>
        <i className="tx tx-blueprint" aria-hidden="true" />
        <div className="dk-row">
          <span className="dk-row-ic">
            <DeskIcon name={item.kind} />
          </span>
          <span className="dk-row-tx">
            <b>{item.title}</b>
            {deskLine(item) ? <span>{deskLine(item)}</span> : null}
          </span>
          {item.verb ? (
            <DeskVerbButton item={item} verb={item.verb} onVerb={onVerb} busy={busy} short />
          ) : item.href ? (
            <Link className="dk-btn" href={item.href} aria-label={`Open: ${item.title}`}>
              Open
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  // A calendar tile only ever means an event's date (a request on the 10th
  // is not an event on the 10th).
  const tile = EVENT_DATED.has(item.kind) ? dateTile(item.whenISO) : null;
  const tag = TAG[item.kind];
  const lines = (item.willHappen ?? []).filter((l) => l.trim().length > 0);
  // "Accept makes Emery member 39." says what "What will happen" lists right
  // under it; the list alone says it once.
  const detail = item.kind === "join_request" && lines.length > 0 ? undefined : item.detail;

  return (
    <article className="tx-host dk-draft" aria-label={item.title}>
      <i className="tx tx-blueprint" aria-hidden="true" />
      {tag ? (
        <div className="dk-draft-as">
          <em>{tag}</em>
        </div>
      ) : null}
      <div className="dk-draft-pre">
        {tile ? (
          <span className="dk-date" aria-hidden="true">
            <i>{tile.month}</i>
            <b>{tile.day}</b>
          </span>
        ) : (
          <span className="dk-row-ic">
            <DeskIcon name={item.kind} />
          </span>
        )}
        <div>
          <h3>{item.title}</h3>
          {detail || item.whenLabel ? (
            <p>
              {item.whenLabel}
              {detail && item.whenLabel ? <br /> : null}
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      {lines.length > 0 ? (
        <div className="dk-draft-what">
          <h4>What will happen</h4>
          <ul>
            {lines.map((line, i) => {
              const { n, rest } = splitCount(line);
              return n ? (
                <li key={i}>
                  <b>{n}</b>
                  <span>{rest}</span>
                </li>
              ) : (
                <li key={i} className="plain">
                  <span>{rest}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {item.verb || openLink ? (
        <div className="dk-draft-go">
          {item.verb ? (
            <DeskVerbButton item={item} verb={item.verb} primary={item.primary === true} onVerb={onVerb} busy={busy} />
          ) : null}
          {openLink ? (
            <Link className="dk-btn" href={openLink} aria-label={`Open: ${item.title}`}>
              Open
            </Link>
          ) : null}
        </div>
      ) : null}
      {foot ? <p className="dk-draft-foot">{foot}</p> : null}
    </article>
  );
}
