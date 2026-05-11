"use client";

import Image from "next/image";
import Link from "next/link";

import type { AskingRow } from "@/app/api/me/otto/route";

import { OttoSection } from "./OttoSection";

type Props = {
  rows: AskingRow[];
  onFollowBack: (userId: string) => Promise<void>;
  onPassFollower: (userId: string) => void;
  onDismissReminder: (id: string) => void;
  onActReminder: (id: string) => void;
};

export function OttoRequests({
  rows,
  onFollowBack,
  onPassFollower,
  onDismissReminder,
  onActReminder,
}: Props) {
  return (
    <OttoSection eyebrow="Asking for you">
      {rows.length === 0 ? (
        <p className="otto-room-empty">no one&rsquo;s waiting on you right now.</p>
      ) : (
        <ul className="otto-room-list">
          {rows.map((r) => {
            if (r.kind === "unread_dms") {
              return (
                <li key="dms" className="otto-room-row">
                  <span className="otto-room-row-icon">▶</span>
                  <div className="otto-room-row-body">
                    <p className="otto-room-row-title">
                      {r.count} unread DM{r.count === 1 ? "" : "s"}
                    </p>
                    <p className="otto-room-row-meta">
                      messages waiting on a reply.
                    </p>
                  </div>
                  <div className="otto-room-row-actions">
                    <Link
                      href="/messages"
                      className="otto-room-action otto-room-action--primary"
                    >
                      Open inbox →
                    </Link>
                  </div>
                </li>
              );
            }
            if (r.kind === "follower") {
              return (
                <li key={`f-${r.user_id}`} className="otto-room-row">
                  <span className="otto-room-row-avatar">
                    {r.avatar_url ? (
                      <Image
                        src={r.avatar_url}
                        alt=""
                        width={32}
                        height={32}
                        className="otto-room-avatar-img"
                      />
                    ) : (
                      <span className="otto-room-avatar-fallback">
                        {(r.name?.[0] ?? r.handle?.[0] ?? "?").toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="otto-room-row-body">
                    <p className="otto-room-row-title">
                      {r.name || (r.handle ? `@${r.handle}` : "Someone")} wants to connect
                    </p>
                    {r.handle ? (
                      <p className="otto-room-row-meta">@{r.handle}</p>
                    ) : null}
                  </div>
                  <div className="otto-room-row-actions">
                    <button
                      type="button"
                      className="otto-room-action otto-room-action--primary"
                      onClick={() => {
                        void onFollowBack(r.user_id);
                      }}
                    >
                      Connect
                    </button>
                    <button
                      type="button"
                      className="otto-room-action"
                      onClick={() => onPassFollower(r.user_id)}
                    >
                      Pass
                    </button>
                  </div>
                </li>
              );
            }
            return (
              <li key={`r-${r.id}`} className="otto-room-row">
                <span className="otto-room-row-icon">◆</span>
                <div className="otto-room-row-body">
                  <p className="otto-room-row-title">{r.title}</p>
                  {r.body ? <p className="otto-room-row-meta">{r.body}</p> : null}
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
                    Pass
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OttoSection>
  );
}
