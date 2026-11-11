"use client";

import type { ReactNode } from "react";

import { clearAllArg, noticeIdOf, useUndoClear } from "@/lib/otto/clear-notifications";
import type { DeskItem, DeskModel } from "@/lib/otto/desk";
import { FEW } from "@/lib/otto/desk-lists";

import { DeskDone } from "./desk/DeskDone";
import { DeskDraft } from "./desk/DeskDraft";
import { DeskLinkRow, DeskTitle } from "./desk/DeskName";
import { DeskIcon, DeskRow, deskLine } from "./desk/DeskRow";
import { DeskClearButton, DeskClearToast, DeskList, DeskSection, useFew } from "./desk/DeskSection";
import { DeskTimeFilter, useDeskRange } from "./desk/DeskTimeFilter";

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

function Saw({ items, onClear }: { items: readonly DeskItem[]; onClear: (item: DeskItem) => void }) {
  return (
    <div className="dk-card odc-saw-card">
      {items.map((item) => {
        const body = (
          <>
            <DeskIcon name={item.kind} />
            <span className="odc-saw-tx">
              <span>
                <DeskTitle item={item} />
              </span>
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
        const row = item.href ? (
          <DeskLinkRow item={item} href={item.href} className="odc-saw">
            {body}
          </DeskLinkRow>
        ) : (
          <p className="odc-saw">{body}</p>
        );
        return noticeIdOf(item.id) ? (
          <div key={item.id} className="dk-clear-li">
            {row}
            <DeskClearButton item={item} onClear={onClear} />
          </div>
        ) : (
          <div key={item.id} className="dk-clear-li">
            {row}
          </div>
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
  const { ready, scheduled, done, empty } = desk;
  // A pile whose source didn't load says so instead of Otto's empty line, so
  // an empty pile always means empty (review M1; the phone does the same).
  const student = desk.role === "student";
  const readyPartial = student && (failed.includes("asking") || failed.includes("dms"));
  const scheduledPartial = student && failed.includes("upcoming");
  const sawFailed = failed.includes("activity");
  const note = <p className="odc-note">{PART_FAILED}</p>;

  // Ready: the drafts, then the reminders on plain paper (as on the phone); a few, then Show all.
  const readyOrdered = [...ready.filter((i) => i.kind !== "reminder"), ...ready.filter((i) => i.kind === "reminder")];
  const readyFew = useFew(readyOrdered, FEW.ready);
  const readyDrafts = readyFew.shown.filter((i) => i.kind !== "reminder");
  const readyReminders = readyFew.shown.filter((i) => i.kind === "reminder");
  const scheduledFew = useFew(scheduled, FEW.list);
  const doneFew = useFew(done, FEW.list);

  // Otto saw: cleared rows leave at once and go for good after the Undo; a time frame narrows it.
  const undo = useUndoClear();
  const sawLeft = desk.saw.filter((i) => !undo.isHidden(noticeIdOf(i.id) ?? ""));
  const sawRange = useDeskRange(sawLeft);
  const sawFew = useFew(sawRange.items, FEW.list);
  const clearOne = (item: DeskItem) => {
    const id = noticeIdOf(item.id);
    if (id) undo.clear({ ids: [id] });
  };
  const clearAll = () => {
    const ids = sawRange.items.map((i) => noticeIdOf(i.id)).filter((x): x is string => !!x);
    // All on the picker: every notification up to the newest one loaded (also the ones past the list's end,
    // never one that came after the desk loaded). Otherwise what the frame shows.
    if (sawRange.range === "all") undo.clear(clearAllArg(desk.saw, ids), ids);
    else undo.clear({ ids });
  };
  const sawClearable = sawRange.items.some((i) => noticeIdOf(i.id));

  const earlierRange = useDeskRange(desk.earlier);
  const earlierFew = useFew(earlierRange.items, FEW.list);

  return (
    <div className="odc-cols">
      <div className="odc-col odc-c1">
        <DeskSection
          title="Ready for you"
          count={ready.length}
          empty={readyPartial ? undefined : empty.ready}
          foldKey="ready"
          more={readyFew.more}
        >
          {readyDrafts.map((item, i) => (
            <ReadyItem key={item.id} item={item} index={i} desk={desk} {...h} />
          ))}
          {readyReminders.length > 0 ? (
            <DeskList>
              {readyReminders.map((item) => (
                <ReminderRow key={item.id} item={item} {...h} />
              ))}
            </DeskList>
          ) : null}
          {readyPartial ? note : null}
        </DeskSection>
      </div>
      <div className="odc-col odc-c2">
        <DeskSection
          title="Scheduled"
          count={scheduled.length}
          empty={scheduledPartial ? undefined : empty.scheduled}
          foldKey="scheduled"
          more={scheduledFew.more}
        >
          {scheduled.length > 0 ? (
            <DeskList>
              {scheduledFew.shown.map((item) =>
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
        <DeskSection
          title="Otto saw"
          count={sawRange.items.length}
          empty={sawFailed ? undefined : sawLeft.length > 0 ? "nothing in this time frame." : empty.saw}
          foldKey="saw"
          tools={
            sawLeft.length > 0 ? (
              <DeskTimeFilter value={sawRange.range} onChange={sawRange.setRange} label="Otto saw: time frame" />
            ) : null
          }
          more={sawFew.more}
          foot={
            sawClearable ? (
              <button type="button" className="dk-clear-all" onClick={clearAll}>
                Clear all
              </button>
            ) : null
          }
        >
          {sawRange.items.length > 0 ? <Saw items={sawFew.shown} onClear={clearOne} /> : null}
          {sawFailed ? (desk.saw.length > 0 ? note : <p className="odc-note">What Otto saw didn&rsquo;t load. Try again in a bit.</p>) : null}
        </DeskSection>
      </div>
      <div className="odc-col odc-c3">
        <DeskSection title="Done this week" count={done.length} empty={empty.done} foldKey="done" more={doneFew.more}>
          <DeskList>
            {doneFew.shown.map((item) => (
              <DeskDone key={item.id} item={item} />
            ))}
          </DeskList>
        </DeskSection>
        {desk.earlier.length > 0 ? (
          <DeskSection
            title="Earlier"
            count={earlierRange.items.length}
            empty={earlierRange.range === "week" ? "this week's are under done this week." : "nothing in this time frame."}
            foldKey="earlier"
            tools={<DeskTimeFilter value={earlierRange.range} onChange={earlierRange.setRange} label="Earlier: time frame" />}
            more={earlierFew.more}
          >
            <DeskList>
              {earlierFew.shown.map((item) => (
                <DeskDone key={item.id} item={item} dayRight />
              ))}
            </DeskList>
          </DeskSection>
        ) : null}
      </div>
      {ask}
      <DeskClearToast toast={undo.toast} onUndo={undo.undo} />
    </div>
  );
}
