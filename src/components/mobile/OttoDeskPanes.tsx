"use client";

import { DeskDone } from "@/components/otto/desk/DeskDone";
import { DeskDraft } from "@/components/otto/desk/DeskDraft";
import { DeskRow } from "@/components/otto/desk/DeskRow";
import {
  DeskClearButton,
  DeskClearToast,
  DeskList,
  DeskSection,
  useFew,
} from "@/components/otto/desk/DeskSection";
import { DeskTimeFilter, useDeskRange } from "@/components/otto/desk/DeskTimeFilter";
import { PushAsk } from "@/components/push/PushAsk";
import { clearAllArg, noticeIdOf, useUndoClear } from "@/lib/otto/clear-notifications";
import type { DeskItem, DeskModel } from "@/lib/otto/desk";
import { FEW } from "@/lib/otto/desk-lists";

import { DeskLoadFail, paneId, ReminderRow, SawRow, tabId } from "./OttoDeskParts";
import type { useOttoDesk } from "./use-otto-desk";

type DeskState = ReturnType<typeof useOttoDesk>;

const PART_FAILED = "Part of this couldn't load, so it may be missing something.";

/**
 * The phone desk's first two panes (Nov 10, 2026, the Otto build's Wave 2A):
 * Desk (Ready for you, Scheduled, Done this week, then the push ask) and Saw
 * (the newest notifications). The model decides every word and which item
 * gets the one coral button (`primary`, ready[0]); this file only lays the
 * piles out. Reminders get a quiet Done; Accept is the parent's.
 *
 * A pile whose source didn't load says so instead of Otto's empty line, so an
 * empty pile always means empty.
 */
export function OttoDeskPanes({ state }: { state: DeskState }) {
  const { desk, loading } = state;
  const deskFail = (
    <DeskLoadFail line="Your desk didn't load. Nothing was changed." onRetry={() => void state.retry()} busy={loading} />
  );

  if (!desk) {
    return (
      <>
        <section id={paneId("desk")} role="tabpanel" aria-labelledby={tabId("desk")} className="odm-pane">
          <div className="dk-pile">{deskFail}</div>
        </section>
        <section id={paneId("saw")} role="tabpanel" aria-labelledby={tabId("saw")} className="odm-pane">
          <div className="dk-pile">{deskFail}</div>
        </section>
      </>
    );
  }

  return <Panes desk={desk} state={state} />;
}

/** The two panes once the desk is here (hooks live below the not-loaded early return). */
function Panes({ desk, state }: { desk: DeskModel; state: DeskState }) {
  const { failed, loading, busyId } = state;
  const student = desk.role === "student";
  const readyPartial = student && (failed.includes("asking") || failed.includes("dms"));
  const scheduledPartial = student && failed.includes("upcoming");
  const sawFailed = failed.includes("activity");

  // Ready: the drafts, then the reminders on plain paper; a few, then Show all.
  const readyOrdered = [...desk.ready.filter((i) => i.kind !== "reminder"), ...desk.ready.filter((i) => i.kind === "reminder")];
  const readyFew = useFew(readyOrdered, FEW.ready);
  const others = readyFew.shown.filter((i) => i.kind !== "reminder");
  const reminders = readyFew.shown.filter((i) => i.kind === "reminder");
  const scheduledFew = useFew(desk.scheduled, FEW.list);
  const doneFew = useFew(desk.done, FEW.list);
  const reminderRow = (item: DeskItem) => (
    <ReminderRow key={item.id} item={item} onDone={state.reminderDone} busy={busyId === item.id} />
  );

  // Otto saw: × and Clear all hide at once and delete after the Undo; a time frame narrows it.
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

  return (
    <>
      <section
        id={paneId("desk")}
        role="tabpanel"
        aria-labelledby={tabId("desk")}
        className="odm-pane"
        style={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}
      >
        <DeskSection
          title="Ready for you"
          count={desk.ready.length}
          empty={readyPartial ? undefined : desk.empty.ready}
          foldKey="ready"
          more={readyFew.more}
        >
          {others.map((item, i) => (
            <DeskDraft
              key={item.id}
              item={item}
              actingAs={desk.actingAs}
              open={i === 0}
              onVerb={state.accept}
              busy={busyId === item.id}
            />
          ))}
          {reminders.length > 0 ? <DeskList>{reminders.map(reminderRow)}</DeskList> : null}
          {readyPartial ? <p className="odm-note">{PART_FAILED}</p> : null}
        </DeskSection>

        <DeskSection
          title="Scheduled"
          count={desk.scheduled.length}
          empty={scheduledPartial ? undefined : desk.empty.scheduled}
          foldKey="scheduled"
          more={scheduledFew.more}
        >
          {desk.scheduled.length > 0 ? (
            <DeskList>
              {scheduledFew.shown.map((item) =>
                item.kind === "reminder" ? reminderRow(item) : <DeskRow key={item.id} item={item} />,
              )}
            </DeskList>
          ) : null}
          {scheduledPartial ? <p className="odm-note">{PART_FAILED}</p> : null}
        </DeskSection>

        <DeskSection title="Done this week" count={desk.done.length} empty={desk.empty.done} foldKey="done" more={doneFew.more}>
          <DeskList>
            {doneFew.shown.map((item) => (
              <DeskDone key={item.id} item={item} />
            ))}
          </DeskList>
        </DeskSection>

        <div className="dk-pile">
          <PushAsk placement="otto" look="desk" />
        </div>
      </section>

      <section id={paneId("saw")} role="tabpanel" aria-labelledby={tabId("saw")} className="odm-pane">
        <DeskSection
          title="Otto saw"
          count={sawRange.items.length}
          empty={sawFailed ? undefined : sawLeft.length > 0 ? "nothing in this time frame." : desk.empty.saw}
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
          {sawRange.items.length > 0 ? (
            <div className="odm-saw">
              <DeskList>
                {sawFew.shown.map((item) => (
                  <div key={item.id} className="dk-clear-li">
                    <SawRow item={item} />
                    {noticeIdOf(item.id) ? <DeskClearButton item={item} onClear={clearOne} /> : null}
                  </div>
                ))}
              </DeskList>
            </div>
          ) : null}
          {sawFailed ? (
            desk.saw.length > 0 ? (
              <p className="odm-note">{PART_FAILED}</p>
            ) : (
              <DeskLoadFail line="What Otto saw didn't load." onRetry={() => void state.retry()} busy={loading} />
            )
          ) : null}
        </DeskSection>
        <DeskClearToast toast={undo.toast} onUndo={undo.undo} />
      </section>
    </>
  );
}
