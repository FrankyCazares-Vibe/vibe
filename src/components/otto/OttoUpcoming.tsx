"use client";

import Link from "next/link";

import type { UpcomingRow } from "@/app/api/me/otto/route";

import { OttoSection } from "./OttoSection";

type Props = {
  rows: UpcomingRow[];
  onDismissReminder: (id: string) => void;
  onActReminder: (id: string) => void;
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OttoUpcoming({ rows, onDismissReminder, onActReminder }: Props) {
  return (
    <OttoSection eyebrow="Coming up">
      {rows.length === 0 ? (
        <p className="otto-room-empty">nothing on the horizon. quiet week.</p>
      ) : (
        <ul className="otto-room-list">
          {rows.map((r) =>
            r.kind === "event" ? (
              <li key={`e-${r.id}`} className="otto-room-row">
                <span className="otto-room-row-icon">▶</span>
                <div className="otto-room-row-body">
                  <Link href={`/events/${r.id}`} className="otto-room-row-title">
                    {r.title}
                  </Link>
                  <p className="otto-room-row-meta">
                    {whenLabel(r.starts_at)}
                    {r.location ? <span> · {r.location}</span> : null}
                    <span className="otto-room-pill otto-room-pill--rsvp">
                      {r.viewer_status === "going" ? "RSVP'd" : "Maybe"}
                    </span>
                  </p>
                </div>
              </li>
            ) : (
              <li key={`r-${r.id}`} className="otto-room-row">
                <span className="otto-room-row-icon">◆</span>
                <div className="otto-room-row-body">
                  <p className="otto-room-row-title">{r.title}</p>
                  <p className="otto-room-row-meta">
                    {whenLabel(r.remind_at)}
                    {r.body ? <span> · {r.body}</span> : null}
                  </p>
                </div>
                <div className="otto-room-row-actions">
                  <button
                    type="button"
                    className="otto-room-action otto-room-action--primary"
                    onClick={() => onActReminder(r.id)}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="otto-room-action"
                    onClick={() => onDismissReminder(r.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </OttoSection>
  );
}
