"use client";

import { useState } from "react";

import { parseReminder } from "@/lib/otto/parse-reminder";

import { OttoSection } from "./OttoSection";

type Props = {
  onCreated: (reminder: {
    id: string;
    title: string;
    body: string | null;
    remind_at: string | null;
    created_at: string;
  }) => void;
};

/**
 * Smart-ish reminder input. Client-side chrono parser turns natural language
 * ("study for midterm tomorrow", "in 2 hours", "monday at 3pm") into a
 * { title, remindAt } pair, then POSTs to /api/me/otto/reminders. The parsed
 * preview surfaces below the field so the user can see what Otto heard
 * before submitting — no LLM, no surprises.
 */
export function OttoTellInput({ onCreated }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = value.trim() ? parseReminder(value) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const { title, remindAt } = parseReminder(value);
    try {
      const res = await fetch("/api/me/otto/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          remind_at: remindAt ? remindAt.toISOString() : null,
        }),
      });
      const j = (await res.json()) as { ok: boolean; reminder?: typeof onCreated extends (r: infer T) => void ? T : never; error?: string };
      if (!j.ok || !j.reminder) {
        setErr(j.error || "Could not save");
        setBusy(false);
        return;
      }
      onCreated(j.reminder);
      setValue("");
    } catch (e) {
      console.error("[otto/tell] submit", e);
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OttoSection eyebrow="Tell otto something">
      <form className="otto-room-tell" onSubmit={submit}>
        <input
          type="text"
          className="otto-room-tell-input"
          value={value}
          placeholder="remind me to ___"
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          autoComplete="off"
          maxLength={240}
        />
        <button
          type="submit"
          className="otto-room-tell-submit"
          disabled={busy || !value.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
      {parsed?.remindAt ? (
        <p className="otto-room-tell-preview">
          otto heard: <strong>{parsed.title || "(no title)"}</strong> ·{" "}
          {parsed.remindAt.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : parsed ? (
        <p className="otto-room-tell-preview otto-room-tell-preview--muted">
          no time recognized — i&rsquo;ll keep it on your list.
        </p>
      ) : null}
      {err ? <p className="otto-room-tell-error">{err}</p> : null}
    </OttoSection>
  );
}
