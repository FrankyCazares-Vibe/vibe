"use client";

import "@/components/otto/kit/motion.css";

import { useRef, useState, type FormEvent } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { pop, riseNew } from "@/lib/motion/feedback";
import { parseReminder } from "@/lib/otto/parse-reminder";

export type SavedReminder = {
  id: string;
  title: string;
  body: string | null;
  remind_at: string | null;
  created_at: string;
};

const WHEN = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The bar at the bottom of Otto's phone desk (Nov 10, 2026, the Otto build's
 * Wave 2A; board D1 "dk-ask"). HONESTY: it is today's reminder box, nothing
 * more. There is no AI model yet, so it never says "ask otto": it saves a
 * reminder ("remind me to…"), dated when the words name a time (on-device
 * parser, parse-reminder.ts), and says under the field what it will save
 * before you send it. Nothing delivers a reminder yet; it sits on the desk.
 *
 * Fixed above the tab bar on every tab and scroll position
 * (otto-desk-mobile.css). The send button is quiet until there is text, and
 * never coral.
 *
 * Motion 1 (Nov 12): once saved, the bar gives a soft pop and the new row
 * rises into the desk (feedback.ts; nothing moves under reduced motion).
 */
export function ReminderBar({ onSaved }: { onSaved: (r: SavedReminder) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const text = value.trim();
  const parsed = text ? parseReminder(value) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text || busy) return;
    const { title, remindAt } = parseReminder(value);
    setBusy(true);
    const r = await vibeRequest<{ reminder?: SavedReminder }>("/api/me/otto/reminders", {
      method: "POST",
      json: { title, remind_at: remindAt ? remindAt.toISOString() : null },
      failure: "Couldn't save that reminder.",
    });
    setBusy(false);
    if (!r.ok || !r.data.reminder) return;
    setValue("");
    pop(bar.current);
    riseNew(bar.current?.closest("main") ?? document.body);
    onSaved(r.data.reminder);
  }

  return (
    <form className="odm-ask" onSubmit={submit}>
      <div ref={bar} className="dk-ask">
        <input
          className="dk-ask-in"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Remind me to…"
          aria-label="Add a reminder"
          aria-describedby={parsed ? "otto-desk-ask-hint" : undefined}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={240}
          disabled={busy}
        />
        <button
          type="submit"
          className={text ? "dk-ask-go on" : "dk-ask-go"}
          aria-label="Save reminder"
          disabled={busy || !text}
          aria-busy={busy || undefined}
        >
          <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
      {parsed ? (
        <p id="otto-desk-ask-hint" className="odm-ask-hint" aria-live="polite">
          {parsed.remindAt ? (
            <>
              Saves <b>{parsed.title || "a reminder"}</b> for {WHEN.format(parsed.remindAt)}
            </>
          ) : (
            <>
              No time found. Saves <b>{parsed.title || "a reminder"}</b> with no date.
            </>
          )}
        </p>
      ) : null}
    </form>
  );
}
