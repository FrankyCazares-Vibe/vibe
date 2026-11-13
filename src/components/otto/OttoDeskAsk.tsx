"use client";

import "./kit/motion.css";

import { useRef, useState, type FormEvent } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { pop, riseNew } from "@/lib/motion/feedback";
import { parseReminder } from "@/lib/otto/parse-reminder";
import { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

/**
 * The computer desk's ask bar (Wave 2A, Nov 10, 2026; board D3 "dk-ask").
 * It is TODAY'S REMINDER BOX, nothing more: "remind me to…", parsed on this
 * device (parse-reminder.ts, no model) and saved through the existing
 * POST /api/me/otto/reminders. It never says "ask otto": there is no model
 * to ask yet, and nothing delivers a reminder, so the line under the field
 * says only what gets saved and when it is for.
 *
 * Motion 1 (Nov 12): once saved, the bar gives a soft pop and the new row
 * rises into the desk when it reloads (feedback.ts; still under reduced motion).
 */

const WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function OttoDeskAsk({ onSaved, className }: { onSaved: () => void; className?: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const text = value.trim();
  const parsed = text ? parseReminder(text) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text || busy) return;
    const { title, remindAt } = parseReminder(text);
    setBusy(true);
    const r = await vibeRequest("/api/me/otto/reminders", {
      method: "POST",
      json: { title, remind_at: remindAt ? remindAt.toISOString() : null },
      failure: "Couldn't save that reminder.",
    });
    setBusy(false);
    if (!r.ok) return;
    setValue("");
    pop(form.current);
    riseNew(form.current?.closest("main") ?? document.body);
    onSaved();
  }

  const title = parsed?.title?.trim() || null;
  const hint = !parsed
    ? null
    : parsed.remindAt
      ? `Saves ${title ? `“${title}”` : "a reminder"} for ${WHEN.format(parsed.remindAt)}.`
      : `Saves ${title ? `“${title}”` : "a reminder"} with no date.`;

  return (
    <form ref={form} className={["dk-ask", className].filter(Boolean).join(" ")} onSubmit={submit}>
      <div className="odc-ask-row">
        <input
          type="text"
          className="dk-ask-in"
          value={value}
          placeholder="Remind me to…"
          aria-label="Remind me to"
          aria-describedby={hint ? "odc-ask-hint" : undefined}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          autoComplete="off"
          maxLength={240}
        />
        <button
          type="submit"
          className={text ? "dk-ask-go on" : "dk-ask-go"}
          aria-label="Save reminder"
          disabled={busy || !text}
        >
          <svg className="dk-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
      {hint ? (
        <p id="odc-ask-hint" className="odc-ask-hint" aria-live="polite">
          {hint}
        </p>
      ) : null}
    </form>
  );
}
