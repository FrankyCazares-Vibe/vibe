"use client";

import Link from "next/link";

import type { ActivityRow } from "@/app/api/me/otto/route";

import { OttoSection } from "./OttoSection";

type Props = { rows: ActivityRow[] };

function relative(t: string): string {
  const then = new Date(t).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Renders a single notification row as a natural-language line in Otto's
 * voice. Most notification.type values map cleanly to an English verb;
 * unrecognized types fall back to "did something" so we never crash.
 */
function describe(n: ActivityRow): string {
  const actor = n.actor?.name?.split(" ")[0] || n.actor?.handle || "someone";
  switch (n.type) {
    case "like":
    case "post_like":
      return `${actor} liked your post`;
    case "comment":
    case "post_comment":
      return `${actor} commented on your post`;
    case "comment_like":
      return `${actor} liked your comment`;
    case "comment_reply":
      return `${actor} replied to your comment`;
    case "follow":
    case "new_follower":
      return `${actor} followed you`;
    case "mention":
    case "post_mention":
      return `${actor} mentioned you`;
    case "message_mention":
      return `${actor} mentioned you in a chat`;
    case "repost":
    case "post_repost":
      return `${actor} reposted your post`;
    case "save":
    case "post_save":
      return `${actor} saved your post`;
    default:
      return `${actor} did something`;
  }
}

export function OttoActivity({ rows }: Props) {
  return (
    <OttoSection
      eyebrow="Otto saw"
      wide
      trailing={
        <Link href="/notifications" className="otto-room-section-link">
          view all activity →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="otto-room-empty">nothing new on campus yet.</p>
      ) : (
        <ul className="otto-room-list">
          {rows.map((n) => (
            <li key={n.id} className="otto-room-row">
              <span className="otto-room-row-dot" aria-hidden />
              <div className="otto-room-row-body">
                <p className="otto-room-row-line">
                  {describe(n)}
                  {n.post_excerpt ? (
                    <span className="otto-room-row-excerpt"> — {n.post_excerpt}</span>
                  ) : n.comment_excerpt ? (
                    <span className="otto-room-row-excerpt"> — {n.comment_excerpt}</span>
                  ) : null}
                </p>
              </div>
              <time className="otto-room-row-time" dateTime={n.created_at}>
                {relative(n.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </OttoSection>
  );
}
