"use client";

import Link from "next/link";

import type { UpcomingRow } from "@/app/api/me/otto/route";
import { LoadFailed } from "@/components/feedback/LoadFailed";

import { OttoSection } from "./OttoSection";

type Props = {
  rows: UpcomingRow[];
  onDismissReminder: (id: string) => void;
  onActReminder: (id: string) => void;
  /** From the payload's `failed` list — the read was refused. */
  failed?: boolean;
};

const LOAD_FAILURE = "Couldn't load what's coming up. Try again.";

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

export function OttoUpcoming({ rows, onDismissReminder, onActReminder, failed }: Props) {
  return (
    <OttoSection eyebrow="Coming up">
      {/* A refused read is never "quiet week." The payload comes with the
          page, so Retry reloads it. */}
      {failed ? (
        <LoadFailed failure={{ message: LOAD_FAILURE }} tone="dark" />
      ) : rows.length === 0 ? (
        <p className="otto-room-empty">nothing on the horizon. quiet week.</p>
      ) : (
        <ul className="otto-room-list">
          {rows.map((r) =>
            r.kind === "event" ? (
              <li key={`e-${r.id}`} className="otto-room-row">
                <span className="otto-room-row-icon">▶</span>
                <div className="otto-room-row-body">
                  {/* There's no /events/<id> page yet (that link 404'd);
                      the campus Events tab is the closest real place. */}
                  <Link href="/campus?tab=events" className="otto-room-row-title">
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
