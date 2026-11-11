"use client";

import { DeskDone } from "@/components/otto/desk/DeskDone";
import { DeskDraft } from "@/components/otto/desk/DeskDraft";
import { DeskRow } from "@/components/otto/desk/DeskRow";
import { DeskList, DeskSection } from "@/components/otto/desk/DeskSection";
import { PushAsk } from "@/components/push/PushAsk";
import type { DeskItem } from "@/lib/otto/desk";

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
  const { desk, failed, loading, busyId } = state;
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

  const student = desk.role === "student";
  const readyPartial = student && (failed.includes("asking") || failed.includes("dms"));
  const scheduledPartial = student && failed.includes("upcoming");
  const sawFailed = failed.includes("activity");

  const reminders = desk.ready.filter((i) => i.kind === "reminder");
  const others = desk.ready.filter((i) => i.kind !== "reminder");
  const reminderRow = (item: DeskItem) => (
    <ReminderRow key={item.id} item={item} onDone={state.reminderDone} busy={busyId === item.id} />
  );

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
        >
          {desk.scheduled.length > 0 ? (
            <DeskList>
              {desk.scheduled.map((item) =>
                item.kind === "reminder" ? reminderRow(item) : <DeskRow key={item.id} item={item} />,
              )}
            </DeskList>
          ) : null}
          {scheduledPartial ? <p className="odm-note">{PART_FAILED}</p> : null}
        </DeskSection>

        <DeskSection title="Done this week" count={desk.done.length} empty={desk.empty.done}>
          <DeskList>
            {desk.done.map((item) => (
              <DeskDone key={item.id} item={item} />
            ))}
          </DeskList>
        </DeskSection>

        <div className="dk-pile">
          <PushAsk placement="otto" look="desk" />
        </div>
      </section>

      <section id={paneId("saw")} role="tabpanel" aria-labelledby={tabId("saw")} className="odm-pane">
        <DeskSection title="Otto saw" count={desk.saw.length} empty={sawFailed ? undefined : desk.empty.saw}>
          {desk.saw.length > 0 ? (
            <div className="odm-saw">
              <DeskList>
                {desk.saw.map((item) => (
                  <SawRow key={item.id} item={item} />
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
      </section>
    </>
  );
}
