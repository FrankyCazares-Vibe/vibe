"use client";

import type { JSX, ReactNode } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { ineligibleLine } from "@/components/orgs/tools/member-rules";
import type { RequestRow } from "@/components/orgs/tools/types";
import { ORG_COPY, shortDateText } from "@/lib/orgs/join-copy";

import { arcTool, displayName, requestsSub } from "./club-tools-arc";
import { panelOpener, type ArcCardProps } from "./ClubToolsLauncherCards";
import { ArcCardFrame, ArcNote, ArcPageLink, ArcPersonRow, ArcRise, ArcSkeleton, ghostStyle, pillStyle, primaryStyle } from "./ClubToolsLauncherParts";
import { useJoinRequests } from "./use-join-requests";

/**
 * The Arc's Join requests card (Oct 22, 2026): the people waiting, oldest
 * first, from the officer-only list (GET /api/orgs/[slug]/requests), each
 * with Approve and Decline (POST .../requests/[id]). The phone's Requests
 * screen (RequestsScreen.tsx) is the model: the "Removed before" tag, why
 * someone can't be let in when they can't (Approve isn't offered then, nor
 * on a hidden club, which takes nobody new), and the same answer to every
 * refusal (`requestRefusal`). A row leaves once it's answered; the count on
 * the planet follows (`onCount`), and the page is read again when the arc
 * closes (`onChanged`), so its member count and "needs you" line catch up.
 * The read and the answers are `useJoinRequests` (use-join-requests.ts).
 */

/** How many people the card shows; the rest are a tap away on the Requests page. */
const SHOWN = 4;

export function RequestsCard({
  club,
  onClose,
  onLeave,
  onPanel,
  onCount,
  onChanged,
}: ArcCardProps & { onCount: (n: number) => void; onChanged: () => void }): JSX.Element {
  // The read and the two answers live in useJoinRequests (Oct 23, 2026), so
  // the phone's Club tools tray asks and answers the same way.
  const { rows, failure, busy, act, retry } = useJoinRequests({
    handle: club.handle,
    clubName: club.name,
    onCount,
    onChanged,
  });

  let body: ReactNode;
  if (failure && !rows) {
    body = <LoadFailed failure={failure} tone="dark" compact onRetry={retry} />;
  } else if (!rows) {
    body = <ArcSkeleton rows={2} />;
  } else if (rows.length === 0) {
    body = (
      <ArcRise index={1}>
        <ArcNote>When someone asks to join, they show up here.</ArcNote>
      </ArcRise>
    );
  } else {
    body = (
      <>
        {club.hidden ? (
          <ArcRise index={1}>
            <ArcNote>This club is hidden, so nobody new can join it. You can still decline requests.</ArcNote>
          </ArcRise>
        ) : null}
        {rows.slice(0, SHOWN).map((row, i) => (
          <RequestLine
            key={row.id}
            row={row}
            index={i}
            hidden={club.hidden}
            busy={busy.has(row.id)}
            onApprove={() => void act(row, "approve")}
            onDecline={() => void act(row, "deny")}
          />
        ))}
      </>
    );
  }

  const more = rows && rows.length > SHOWN ? rows.length : 0;
  return (
    <ArcCardFrame
      tool={arcTool("requests")}
      title="Join requests"
      sub={rows ? requestsSub(rows.length) : "Who's waiting to get in"}
      onClose={onClose}
      footer={
        <ArcPageLink
          href={`/orgs/${encodeURIComponent(club.handle)}/tools/requests`}
          label={more ? `See all ${more.toLocaleString("en-US")} requests` : "Open Join requests"}
          onLeave={onLeave}
          onOpen={panelOpener(onPanel, { screen: "requests" })}
        />
      }
    >
      {body}
    </ArcCardFrame>
  );
}

/** One person waiting: their line, their note, why they can't be let in (if so), and the two answers. */
function RequestLine({
  row,
  index,
  hidden,
  busy,
  onApprove,
  onDecline,
}: {
  row: RequestRow;
  index: number;
  hidden: boolean;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}): JSX.Element {
  const who = displayName(row.name, row.handle);
  const asked = shortDateText(row.requested_at);
  const line = [row.handle ? `@${row.handle}` : null, asked ? `asked ${asked}` : null].filter(Boolean).join(" · ");
  const canApprove = !hidden && row.eligible !== false && row.can_approve !== false;
  return (
    <ArcPersonRow
      index={index}
      person={{
        id: row.user_id,
        name: who,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        line,
        tag: row.removed_before ? ORG_COPY.meta.removedBefore : null,
      }}
      below={
        <>
          {row.message ? (
            <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: 1.45, color: "var(--ink-body)", overflowWrap: "anywhere" }}>
              &ldquo;{row.message}&rdquo;
            </p>
          ) : null}
          {row.eligible === false ? (
            <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-2)" }}>{ineligibleLine(row.ineligible_reason)}</p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            {canApprove ? (
              <button
                type="button"
                className="vibe-arc-primary"
                disabled={busy}
                aria-label={`Approve ${who}`}
                onClick={onApprove}
                style={{ ...pillStyle, ...primaryStyle, flex: 1, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? ORG_COPY.buttons.busy : "Approve"}
              </button>
            ) : null}
            <button
              type="button"
              className="vibe-arc-ghost"
              disabled={busy}
              aria-label={`Decline ${who}`}
              onClick={onDecline}
              style={{ ...pillStyle, ...ghostStyle, flex: 1, opacity: busy ? 0.6 : 1 }}
            >
              Decline
            </button>
          </div>
        </>
      }
    />
  );
}
