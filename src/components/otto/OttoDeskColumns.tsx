"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { DeskItem, DeskModel } from "@/lib/otto/desk";

import { DeskDone } from "./desk/DeskDone";
import { DeskDraft } from "./desk/DeskDraft";
import { DeskIcon, DeskRow, deskLine } from "./desk/DeskRow";
import { DeskList, DeskSection } from "./desk/DeskSection";

/**
 * The computer desk's three columns (Wave 2A, Nov 10, 2026; board D3):
 * Ready for you | Scheduled + Otto saw | Done this week + Earlier. The top
 * Ready item opens on blueprint (its verb is the frame's one coral fill when
 * the model marks it `primary`); the rest fold to one row each. "Otto saw"
 * only tells: no button, no arrow. Earlier (8-30 days) is the computer's
 * alone. The ask bar sits under columns 1 and 2 (`ask`). The board's
 * "That's everything." is left out: the model caps each list, so the page
 * cannot know it is true.
 */

type Handlers = {
  onAccept: (item: DeskItem) => void;
  onReminderDone: (item: DeskItem) => void;
  busyId: string | null;
};

/** A reminder: its title and label, and a quiet Done (nothing delivers reminders yet). */
function ReminderRow({ item, onReminderDone, busyId }: { item: DeskItem } & Handlers) {
  const busy = busyId === item.id;
  return (
    <div className="dk-row">
      <span className="dk-row-ic">
        <DeskIcon name="reminder" />
      </span>
      <span className="dk-row-tx">
        <b>{item.title}</b>
        {deskLine(item) ? <span>{deskLine(item)}</span> : null}
      </span>
      <button
        type="button"
        className="dk-btn"
        aria-label={`Done: ${item.title}`}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => onReminderDone(item)}
      >
        Done
      </button>
    </div>
  );
}

function ReadyItem({ item, index, desk, ...h }: { item: DeskItem; index: number; desk: DeskModel } & Handlers) {
  return (
    <DeskDraft
      item={item}
      actingAs={desk.actingAs}
      open={index === 0}
      onVerb={h.onAccept}
      busy={h.busyId === item.id}
      foot={index === 0 && item.verb?.kind === "join_request" ? "Nothing changes until you tap Accept." : undefined}
    />
  );
}

function Saw({ items }: { items: DeskItem[] }) {
  return (
    <div className="tx-host dk-card odc-saw-card">
      <i className="tx tx-paper" aria-hidden="true" />
      {items.map((item) => {
        const body = (
          <>
            <DeskIcon name={item.kind} />
            <span className="odc-saw-tx">
              <span>{item.title}</span>
              {item.detail || item.whenLabel ? (
                <span className="odc-saw-sub">
                  {item.detail}
                  {item.detail && item.whenLabel ? " · " : null}
                  {item.whenLabel ? <time dateTime={item.whenISO}>{item.whenLabel}</time> : null}
                </span>
              ) : null}
            </span>
          </>
        );
        return item.href ? (
          <Link key={item.id} className="odc-saw" href={item.href}>
            {body}
          </Link>
        ) : (
          <p key={item.id} className="odc-saw">
            {body}
          </p>
        );
      })}
    </div>
  );
}

const PART_FAILED = "Part of this couldn't load, so it may be missing something.";

export function OttoDeskColumns({
  desk,
  ask,
  failed = [],
  ...h
}: { desk: DeskModel; ask: ReactNode; failed?: readonly string[] } & Handlers) {
  const { ready, scheduled, done, saw, earlier, empty } = desk;
  // A pile whose source didn't load says so instead of Otto's empty line, so
  // an empty pile always means empty (review M1; the phone does the same).
  const student = desk.role === "student";
  const readyPartial = student && (failed.includes("asking") || failed.includes("dms"));
  const scheduledPartial = student && failed.includes("upcoming");
  const sawFailed = failed.includes("activity");
  const note = <p className="odc-note">{PART_FAILED}</p>;
  return (
    <div className="odc-cols">
      <div className="odc-col odc-c1">
        <DeskSection title="Ready for you" count={ready.length} empty={readyPartial ? undefined : empty.ready}>
          {/* Reminders sit on plain paper after the rest, as on the phone. */}
          {ready
            .filter((item) => item.kind !== "reminder")
            .map((item, i) => (
              <ReadyItem key={item.id} item={item} index={i} desk={desk} {...h} />
            ))}
          {ready.some((item) => item.kind === "reminder") ? (
            <DeskList>
              {ready
                .filter((item) => item.kind === "reminder")
                .map((item) => (
                  <ReminderRow key={item.id} item={item} {...h} />
                ))}
            </DeskList>
          ) : null}
          {readyPartial ? note : null}
        </DeskSection>
      </div>
      <div className="odc-col odc-c2">
        <DeskSection title="Scheduled" count={scheduled.length} empty={scheduledPartial ? undefined : empty.scheduled}>
          {scheduled.length > 0 ? (
          <DeskList>
            {scheduled.map((item) =>
              item.kind === "reminder" ? (
                <ReminderRow key={item.id} item={item} {...h} />
              ) : (
                <DeskRow key={item.id} item={item} onVerb={h.onAccept} busy={h.busyId === item.id} />
              ),
            )}
          </DeskList>
          ) : null}
          {scheduledPartial ? note : null}
        </DeskSection>
        <DeskSection title="Otto saw" count={saw.length} empty={sawFailed ? undefined : empty.saw}>
          {saw.length > 0 ? <Saw items={saw} /> : null}
          {sawFailed ? (saw.length > 0 ? note : <p className="odc-note">What Otto saw didn&rsquo;t load. Try again in a bit.</p>) : null}
        </DeskSection>
      </div>
      <div className="odc-col odc-c3">
        <DeskSection title="Done this week" count={done.length} empty={empty.done}>
          <DeskList>
            {done.map((item) => (
              <DeskDone key={item.id} item={item} />
            ))}
          </DeskList>
        </DeskSection>
        {earlier.length > 0 ? (
          <DeskSection title="Earlier" count={earlier.length}>
            <DeskList>
              {earlier.map((item) => (
                <DeskDone key={item.id} item={item} dayRight />
              ))}
            </DeskList>
          </DeskSection>
        ) : null}
      </div>
      {ask}
    </div>
  );
}
