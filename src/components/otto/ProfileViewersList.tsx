"use client";

import { useCallback, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { UserCard, type UserCardProps } from "@/components/network/UserCard";
import { vibeRequest } from "@/lib/feedback/request";
import { dayLabelFromDate, dayLabelFromTimestamp } from "@/lib/metrics/day-label";
import type { ProfileViewerRow } from "@/lib/metrics/profile-viewers";

/**
 * One row = `UserCardData` plus the ledger's two time columns. The type is the
 * loader's own (src/lib/metrics/profile-viewers.ts), imported rather than
 * copied so a field added to `UserCardData` reaches this list instead of being
 * silently dropped on the way from the wire to <UserCard>. `import type` is
 * erased at build time, so no server module enters the client bundle.
 */
export type { ProfileViewerRow };

/** Matches the route's default page size (C2: limit 1..50, default 25). */
const PAGE_SIZE = 25;

const MORE_FAILURE = "Couldn't load more viewers.";

/**
 * "Who viewed you" — the Vibe+ half of Screen B (wave plan,
 * handoffs/2026-09-14-wave-plan-metrics-screens.md, contracts C1 + C2).
 *
 * The first page arrives inside GET /api/me/profile-views as `recent`, so the
 * screen paints with no second round trip; every page after it comes from GET
 * /api/me/profile-viewers with the same loader behind it, which is why the two
 * can never disagree about who looked. Both are owner-scoped and paid-only on
 * the server — this component is a renderer, never the gate.
 *
 * Rows go through <UserCard> (compact) instead of a bespoke row so the follow
 * buttons, the meta line and the "N you both follow" wording are the same ones
 * the rest of the app shows. The day label comes from the ledger's own grain:
 * one row per viewer per day, so "Tuesday", never "2 hours ago".
 *
 * Failure rule (wave plan §3): a failed "Show more" keeps every row already on
 * screen and puts a compact <LoadFailed> underneath. It never empties the list
 * and never reads as "nobody looked".
 */

export function ProfileViewersList({
  initialRows,
  initialHasMore,
  initialNextOffset,
}: {
  initialRows: ProfileViewerRow[];
  initialHasMore: boolean;
  /** Where page two starts — the server's `recent_next_offset`, in people consumed. */
  initialNextOffset: number;
}) {
  // Seeded from the parent's payload. The parent remounts this component with
  // a fresh key after a reload, so there is no effect syncing props into
  // state — the rows here are only ever appended to.
  const [rows, setRows] = useState<ProfileViewerRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // Paging cursor in PEOPLE CONSUMED, not rows on screen: hydration can drop
  // an id (deleted or hidden profile), so `rows.length` would re-ask for
  // people already shown, and a page whose ids were all dropped would never
  // advance. The server sends `next_offset` for exactly this reason.
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loading, setLoading] = useState(false);
  const [moreErr, setMoreErr] = useState<LoadFailure | null>(null);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setMoreErr(null);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    // Quiet: the button's own line says what happened, so a student who never
    // asked for a toast doesn't get one.
    const r = await vibeRequest<{
      users?: ProfileViewerRow[];
      has_more?: boolean;
      next_offset?: number;
    }>(`/api/me/profile-viewers?${params.toString()}`, {
      cache: "no-store",
      quiet: true,
      failure: MORE_FAILURE,
    });
    if (r.ok && Array.isArray(r.data.users)) {
      const more = r.data.users;
      setRows((prev) => {
        // The loader dedupes per person, but hydration can drop an id between
        // pages and shift the window; a duplicate id would crash the list on
        // its React key, so the same person never lands twice.
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...more.filter((row) => !seen.has(row.id))];
      });
      setHasMore(Boolean(r.data.has_more));
      setNextOffset(
        typeof r.data.next_offset === "number"
          ? r.data.next_offset
          : nextOffset + PAGE_SIZE,
      );
    } else {
      setMoreErr(asLoadFailure(r, MORE_FAILURE));
    }
    setLoading(false);
  }, [loading, nextOffset]);

  const onStateChange = useCallback(
    (id: string, next: UserCardProps["follow_state"]) => {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, follow_state: next } : row)),
      );
    },
    [],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {rows.map((row) => (
          <li key={row.id} style={{ minWidth: 0 }}>
            <UserCard
              {...row}
              compact
              trailing={dayLabelFor(row)}
              onStateChange={(next) => onStateChange(row.id, next)}
            />
          </li>
        ))}
      </ul>
      {moreErr ? (
        <LoadFailed
          failure={moreErr}
          onRetry={() => {
            void loadMore();
          }}
          tone="dark"
          compact
        />
      ) : null}
      {hasMore ? (
        <button
          type="button"
          onClick={() => {
            void loadMore();
          }}
          disabled={loading}
          style={{
            alignSelf: "flex-start",
            padding: "7px 14px",
            borderRadius: 999,
            border: "1px solid rgba(250,247,242,0.16)",
            background: "rgba(250,247,242,0.06)",
            color: "#faf7f2",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * `viewed_on` first, on the UTC calendar it was written on — the same calendar
 * the four tiles above this list are counted on (the route's window math is
 * UTC, and the ledger dedupes one row per viewer per UTC day). Labelling from
 * `first_viewed_at` in the reader's local time instead put "Yesterday" beside a
 * row the "Today" tile had just counted, for every view between midnight and
 * 4am UTC — 8pm to midnight on an Indianapolis evening, the busiest hours we
 * have. The timestamp stays the ordering key and the fallback for a row whose
 * date is unreadable. Both can return "", and then the row simply carries no
 * label rather than the words "Invalid Date".
 */
function dayLabelFor(row: ProfileViewerRow): string | null {
  const label =
    dayLabelFromDate(row.viewed_on) || dayLabelFromTimestamp(row.first_viewed_at);
  return label.length > 0 ? label : null;
}
