"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import type { UserCardData } from "@/lib/connections/queries";
import { vibeRequest } from "@/lib/feedback/request";
import { dayLabelFromDate, dayLabelFromTimestamp } from "@/lib/metrics/day-label";
import { useAppShell } from "@/lib/native/use-app-shell";

/**
 * "Who saw this" / "Who saved this" — the body of Screen C (wave plan,
 * handoffs/2026-09-14-wave-plan-metrics-screens.md, contract C3).
 *
 * One component, two surfaces: the phone mounts it inside
 * src/components/mobile/PostAudienceSheet.tsx and the desktop post page mounts
 * it inside its own modal. Everything that differs between them arrives as
 * `renderRow` and `tone`, so the paging, the free/paid split and the failure
 * rules are written once and cannot drift apart between viewports.
 *
 * THE SERVER IS THE GATE, NOT THIS FILE. A free owner's response carries no
 * `users` key at all — not a blurred list, not a truncated one — so there is
 * no identity here to hide (src/app/api/me/posts/[id]/viewers/route.ts). This
 * component renders the count and the lock; it never decides who may see a
 * name. Zero names free (wave plan rule 1).
 *
 * `total` IS PEOPLE, AND IT IS NOT THE VIEWS CHIP. The route's `total` counts
 * distinct people after the author's own rows and blocked/muted viewers come
 * out, while `counts.views` on the post itself counts view rows (one per
 * person per UTC day, nobody hidden). They are different questions, so this
 * sheet says its own number and never echoes the chip it was opened from.
 *
 * A REFUSED READ NEVER PAINTS A 0 (wave plan rule 3). A failed first page
 * renders <LoadFailed> with Retry in the list's place — not "No one yet.", not
 * a zero. A failed later page keeps every row already on screen and puts a
 * compact <LoadFailed> under them.
 *
 * Day grouping is the finest honest grain: the view ledger stores one row per
 * viewer per day and `viewed_on` is a DATE, so a heading says "Tuesday" and
 * never "2 hours ago" (src/lib/metrics/day-label.ts).
 *
 * Mount it per (postId, kind) — the callers give it a `key` of both. Rows here
 * are only ever appended to, so there is no effect copying a changed prop back
 * into state; a different post or a different question is a different list.
 */

/** A row on the paid branch: the shared people-card fields plus the ledger's
 *  own time column — `viewed_on` (a UTC DATE) for viewers, `saved_at` (a
 *  timestamp) for savers. Exactly one of the two is present per `kind`. */
export type PostAudienceUser = UserCardData & {
  viewed_on?: string;
  saved_at?: string;
};

export type PostAudienceKind = "viewers" | "savers";

/** Matches the routes' default page size (C3: limit 1..50, default 25). */
const PAGE_SIZE = 25;

const COPY: Record<
  PostAudienceKind,
  { failure: string; moreFailure: string; verb: string }
> = {
  viewers: {
    failure: "Couldn't load who saw this.",
    moreFailure: "Couldn't load more viewers.",
    verb: "saw this",
  },
  savers: {
    failure: "Couldn't load who saved this.",
    moreFailure: "Couldn't load more savers.",
    verb: "saved this",
  },
};

/**
 * Where the lock sends a student, and back again afterwards. /plus validates
 * `next` with isSafeRelativePath and the value carries a query string of its
 * own (a post opened from /campus?tab=feed), so it is encoded rather than
 * concatenated. Read at click time, not at module scope: this component is
 * mounted from three different paths.
 */
function plusHref(): string {
  const here =
    typeof window === "undefined"
      ? "/"
      : window.location.pathname + window.location.search;
  return `/plus?next=${encodeURIComponent(here)}`;
}

export function PostAudienceList({
  postId,
  kind,
  renderRow,
  tone = "light",
}: {
  postId: string;
  kind: PostAudienceKind;
  /** The caller's people row — <UserRow> on the phone, <UserCard> on desktop.
   *  Rows are rendered inside a <ul>, so this must return an <li>. */
  renderRow: (user: PostAudienceUser, key: string) => ReactNode;
  /** "light" on the cream sheet, "dark" on Otto's glass. */
  tone?: "light" | "dark";
}) {
  const [rows, setRows] = useState<PostAudienceUser[]>([]);
  const [premium, setPremium] = useState(false);
  // null until the first page lands: "we do not know yet" is not 0 people.
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Paging cursor in PEOPLE CONSUMED, not rows on screen: hydration can drop
  // an id (a deleted account), so `rows.length` would re-ask for people
  // already shown, and a page whose ids were all dropped would never advance.
  // The routes send `next_offset` for exactly this reason.
  const [nextOffset, setNextOffset] = useState(0);
  const [firstErr, setFirstErr] = useState<LoadFailure | null>(null);
  const [moreErr, setMoreErr] = useState<LoadFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped by Retry to run the first page again.
  const [attempt, setAttempt] = useState(0);
  // Inside the store apps Vibe+ isn't for sale (handoffs/wave-plan-pwa/
  // plan.md §5 SD1), so a free owner gets the count and nothing else. Null
  // for the one frame the page hydrates, but the lock only paints after the
  // first page lands, so it never flashes.
  const inApp = useAppShell() !== null;

  const copy = COPY[kind];

  // False once the sheet is gone, so an in-flight "Show more" stops before it
  // writes state. Set on mount as well as cleared on unmount, because a
  // StrictMode double-mount runs the cleanup once before the real mount.
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // First page on mount — the same shape the rest of this surface uses (see
  // PostViewerMobile's post fetch): an async IIFE inside the effect with a
  // cancelled flag, so a sheet dismissed mid-flight sets nothing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
      // Quiet: this list renders its own line, so a student who never asked
      // for a toast doesn't get one.
      const r = await vibeRequest<{
        premium?: boolean;
        users?: PostAudienceUser[];
        total?: number;
        has_more?: boolean;
        next_offset?: number;
      }>(`/api/me/posts/${encodeURIComponent(postId)}/${kind}?${params.toString()}`, {
        cache: "no-store",
        quiet: true,
        failure: copy.failure,
      });
      if (cancelled) return;

      const data = r.ok ? r.data : null;
      const isPlus = data?.premium === true;
      const users = Array.isArray(data?.users) ? data.users : null;
      // On the paid branch the route 500s rather than sending `users: []`, so
      // a `premium: true` payload WITHOUT the array is a broken shape, not an
      // empty list: it fails instead of saying "no one yet".
      if (typeof data?.total !== "number" || (isPlus && users === null)) {
        setFirstErr(asLoadFailure(r, copy.failure));
        return;
      }
      setFirstErr(null);
      setPremium(isPlus);
      setTotal(data.total);
      setRows(users ?? []);
      setHasMore(data.has_more === true);
      setNextOffset(
        typeof data.next_offset === "number" ? data.next_offset : (users?.length ?? 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, kind, copy.failure, attempt]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreErr(null);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    const r = await vibeRequest<{
      users?: PostAudienceUser[];
      has_more?: boolean;
      next_offset?: number;
    }>(`/api/me/posts/${encodeURIComponent(postId)}/${kind}?${params.toString()}`, {
      cache: "no-store",
      quiet: true,
      failure: copy.moreFailure,
    });
    // Same rule as the first-page effect: a sheet dismissed mid-flight sets
    // nothing. "Show more" is the one async path here that isn't inside an
    // effect, so it carries its own flag instead of a cleanup function.
    if (!aliveRef.current) return;
    if (r.ok && Array.isArray(r.data.users)) {
      const more = r.data.users;
      setRows((prev) => {
        // The loaders dedupe per person, but hydration can drop an id between
        // pages and shift the window; a duplicate id would crash the list on
        // its React key, so the same person never lands twice.
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...more.filter((row) => !seen.has(row.id))];
      });
      setHasMore(r.data.has_more === true);
      setNextOffset(
        typeof r.data.next_offset === "number"
          ? r.data.next_offset
          : nextOffset + PAGE_SIZE,
      );
    } else {
      setMoreErr(asLoadFailure(r, copy.moreFailure));
    }
    setLoadingMore(false);
  }, [loadingMore, nextOffset, postId, kind, copy.moreFailure]);

  const dark = tone === "dark";
  const faint = dark ? "rgba(250,247,242,0.62)" : "#8A8580";
  const ink = dark ? "#FAF7F2" : "#1C1C1E";

  // A refused read is the only thing that outranks the rows: nothing below
  // this point may paint a number nobody counted.
  if (firstErr) {
    return (
      <LoadFailed
        failure={firstErr}
        tone={tone}
        onRetry={() => {
          setFirstErr(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  if (total === null) {
    return <p style={{ ...noteStyle, color: faint }}>Loading…</p>;
  }

  if (total === 0) {
    // Ahead of the lock on purpose: a lock over nobody is a worse ad than no
    // lock at all, and it is the same claim on either tier.
    return <p style={{ ...noteStyle, color: faint }}>No one yet.</p>;
  }

  // The sheet's own number, on BOTH tiers. `total` is people; the chip this
  // sheet was opened from counts view rows (one per person per UTC day,
  // nobody hidden), so 25 rows under a chip that says 200 reconciles only if
  // the sheet says what it is counting. The routes ask the client to print
  // this line (src/app/api/me/posts/[id]/viewers/route.ts).
  const peopleLine = `${total} ${total === 1 ? "person" : "people"} ${copy.verb}.`;

  if (!premium) {
    // The count is free on every tier and in every shell; the line under it
    // and the button are the pitch, which only a browser gets.
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ ...headlineStyle, color: ink }}>{peopleLine}</p>
        {inApp ? null : (
          <>
            <p style={{ ...noteStyle, color: faint }}>Vibe+ shows you who.</p>
            <Link
              href={plusHref()}
              style={{
                alignSelf: "flex-start",
                marginTop: 2,
                padding: "7px 14px",
                borderRadius: 999,
                background: "#FF5C35",
                color: "#FAF7F2",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              See Vibe+
            </Link>
          </>
        )}
      </div>
    );
  }

  const groups = groupByDay(kind, rows);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ ...headlineStyle, color: ink }}>{peopleLine}</p>

      {/* A number with no rows is a shape the route documents, not a bug: it
          drops ids whose `users` row it can't hydrate (a deleted or suspended
          account) while `total` still counts those people. Without this the
          sheet would be a title over empty space, which reads as broken. */}
      {rows.length === 0 ? (
        <p style={{ ...noteStyle, color: faint }}>
          {hasMore
            ? "No one on this page has a profile we can show."
            : `We can't show ${total === 1 ? "them" : "any of them"} right now.`}
        </p>
      ) : null}

      {groups.map((group, i) => (
        <div
          key={`${group.label}-${i}`}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {group.label ? (
            <div
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: faint,
              }}
            >
              {group.label}
            </div>
          ) : null}
          {/* The same list reset the phone's people rows use
              (NetworkMobile's exported `listStyle`), spelled out here so a
              component shared with the desktop modal doesn't depend on a
              phone screen. The rows themselves are the caller's <li>. */}
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
            {group.rows.map((row) => renderRow(row, row.id))}
          </ul>
        </div>
      ))}

      {moreErr ? (
        <LoadFailed
          compact
          tone={tone}
          failure={moreErr}
          onRetry={() => {
            void loadMore();
          }}
        />
      ) : null}

      {/* One affordance at a time: while a page has failed, the failure box's
          own Retry IS the "show more" button, and stacking both would put two
          controls with the same action one on top of the other. */}
      {hasMore && !moreErr ? (
        <button
          type="button"
          onClick={() => {
            void loadMore();
          }}
          disabled={loadingMore}
          style={{
            alignSelf: "flex-start",
            padding: "7px 14px",
            borderRadius: 999,
            border: dark
              ? "1px solid rgba(250,247,242,0.16)"
              : "1px solid rgba(28,28,30,0.12)",
            background: dark ? "rgba(250,247,242,0.06)" : "rgba(255,255,255,0.7)",
            color: ink,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: loadingMore ? "wait" : "pointer",
            opacity: loadingMore ? 0.6 : 1,
          }}
        >
          {loadingMore ? "Loading…" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

const noteStyle = {
  margin: 0,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

/** The sheet's "N people saw this" line — one style, both tiers, so the free
 *  lock and the paid list state the same number the same way. */
const headlineStyle = {
  margin: 0,
  fontFamily: "Fraunces, serif",
  fontSize: 17,
  fontWeight: 800,
} as const;

type DayGroup = { label: string; rows: PostAudienceUser[] };

/**
 * Consecutive runs, not a keyed bucket: both routes already order newest
 * first, so a run of rows sharing a label IS a day. Grouping on the label the
 * row will actually show also makes it impossible for a heading to disagree
 * with its rows — the failure mode of bucketing by a raw `saved_at`, which is
 * a UTC timestamp read on a local clock.
 *
 * A row whose date won't parse gets an empty label and renders without a
 * heading rather than under the words "Invalid Date".
 */
function groupByDay(kind: PostAudienceKind, rows: PostAudienceUser[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const row of rows) {
    const label = dayLabelFor(kind, row);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/**
 * `viewed_on` is a DATE written on the UTC calendar, `saved_at` a real
 * instant — so they are read by different clocks on purpose. Labelling a UTC
 * date in local time moves it a day backwards for everyone west of Greenwich
 * (src/lib/metrics/day-label.ts).
 */
function dayLabelFor(kind: PostAudienceKind, row: PostAudienceUser): string {
  if (kind === "viewers") return row.viewed_on ? dayLabelFromDate(row.viewed_on) : "";
  return row.saved_at ? dayLabelFromTimestamp(row.saved_at) : "";
}
