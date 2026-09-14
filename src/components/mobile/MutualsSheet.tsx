"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer } from "vaul";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import {
  UserRow,
  listStyle,
  type FollowState,
  type ListUser,
} from "@/components/mobile/NetworkMobile";
import { vibeRequest } from "@/lib/feedback/request";

/**
 * "You both follow" — the phone half of Screen D (wave plan,
 * handoffs/2026-09-14-wave-plan-metrics-screens.md, contract C6). It opens from
 * the "N you both follow" pill above the Connect button on a visited profile
 * (src/components/mobile/ProfileMobile.tsx) and lists exactly the people that
 * number counts: GET /api/users/<handle>/mutuals, whose ids come from the same
 * `loadMutualIds` the pill's count is defined as, so the pill and the sheet can
 * never disagree.
 *
 * It lives in its own file so ProfileMobile — already 5,500 lines — takes a
 * pill and a mount, nothing more.
 *
 * Rows are NetworkMobile's exported `UserRow`, not a second people row, so the
 * avatar link, the "@handle · major · N mutuals" meta and the Connect / Following
 * button behave exactly as they do on /network. A follow from inside the sheet
 * updates that row in place rather than refetching the page underneath it.
 *
 * Failure rule (wave plan §3): a refused read is never "no one". A failed first
 * page renders <LoadFailed> with Retry in the list's place; a failed "Show more"
 * keeps every row already on screen and puts a compact one underneath.
 *
 * One thing this list does that /network's tabs do not: acting on a row changes
 * the list's own membership. Every row here is someone YOU follow (that is half
 * of what "you both follow" means), so the only action a row offers is unfollow,
 * and an unfollow takes that person out of the server's set. Two consequences,
 * both handled below: the next page's offset has to be walked back by the number
 * of people who left (or the window slides and people are skipped silently), and
 * the pill that opened the sheet has to hear the new number (or it asserts a
 * count its own list disagrees with — wave plan rule 6).
 */

/** Matches the route's default page size (C6: limit 1..50, default 20). */
const PAGE_LIMIT = 20;

const FIRST_FAILURE = "Couldn't load who you both follow.";
const MORE_FAILURE = "Couldn't load more people.";

type MutualsPage = {
  users?: ListUser[];
  total?: number;
  has_more?: boolean;
};

/**
 * A row belongs to the "you both follow" set only while the viewer still follows
 * that person, so these two states are the set and every other one is a person
 * who has just left it (via the row's own Following ✓ button).
 */
function stillFollowed(state: FollowState | undefined): boolean {
  return state === "following" || state === "connected";
}

export function MutualsSheet({
  handle,
  onClose,
  onCount,
}: {
  /** The visited user's handle — the profile whose graph is being intersected. */
  handle: string;
  onClose: () => void;
  /**
   * The live size of this set, reported whenever the server answers with a
   * `total` and whenever a row leaves or rejoins the set from inside the sheet.
   * The pill that opened the sheet renders this instead of its bootstrap number,
   * so the two can never disagree. Never called on a failed read — an unknown
   * count must not overwrite a known one.
   */
  onCount?: (n: number) => void;
}) {
  // null = still loading or the first page failed. Never [] on a failure: [] is
  // the empty copy everywhere in this codebase ("No one you both follow yet."),
  // and a refused read must not read as nobody.
  const [rows, setRows] = useState<ListUser[] | null>(null);
  const [firstErr, setFirstErr] = useState<LoadFailure | null>(null);
  const [moreErr, setMoreErr] = useState<LoadFailure | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Where the next page starts, in ids consumed. The route has no `next_offset`;
  // it slices its id list by `offset..offset+limit` and only sets `has_more`
  // when `offset + pageIds.length < total`, which can only be true for a FULL
  // page. So whenever we are allowed to ask for more, the last page consumed
  // exactly PAGE_LIMIT ids — even if hydration dropped some of them and fewer
  // rows came back. Paging on `rows.length` instead would re-ask for people
  // already on screen the moment one id failed to hydrate.
  const [nextOffset, setNextOffset] = useState(PAGE_LIMIT);
  // The server's `total` for this set, as it stood when the FIRST page
  // answered. null until one does — a refused read leaves the pill's own
  // number standing. Deliberately not refreshed by later pages: an unfollow
  // performed in here is already subtracted below as a `removed` row, and the
  // server's later `total` has ALSO dropped that person, so taking the newer
  // number would count the same departure twice and the pill would undershoot
  // its own list.
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  /** Bumped by the first-page Retry, which re-runs the load effect. */
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFirstErr(null);
      // vibeRequest never throws. quiet: a failure renders LoadFailed inside
      // the sheet, and a 2xx without the array is a failure too.
      const r = await vibeRequest<MutualsPage>(
        `/api/users/${encodeURIComponent(handle)}/mutuals?limit=${PAGE_LIMIT}&offset=0`,
        { cache: "no-store", quiet: true, failure: FIRST_FAILURE },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.users)) {
        setRows(r.data.users);
        setHasMore(r.data.has_more === true);
        setNextOffset(PAGE_LIMIT);
        if (typeof r.data.total === "number") setTotal(r.data.total);
      } else {
        setFirstErr(asLoadFailure(r, FIRST_FAILURE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, retryTick]);

  // People who have left the set since the sheet opened, i.e. rows the viewer
  // unfollowed right here. They are gone from the server's list too, so the
  // list is that much shorter than it was when `nextOffset` was counted up.
  // (A row that arrived without a follow_state is not counted as a departure —
  // it was never established as being in the set.)
  const removed = (rows ?? []).filter(
    (u) => u.follow_state !== undefined && !stillFollowed(u.follow_state),
  ).length;

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setMoreErr(null);
    // Walk the offset back by the departures: asking for `nextOffset` against a
    // list that has shrunk by `removed` would step straight over that many
    // people, who would then have no way of appearing at all. Anyone the
    // walk-back re-serves is already on screen and the dedupe below drops them.
    const offset = Math.max(0, nextOffset - removed);
    const r = await vibeRequest<MutualsPage>(
      `/api/users/${encodeURIComponent(handle)}/mutuals?limit=${PAGE_LIMIT}&offset=${offset}`,
      { cache: "no-store", quiet: true, failure: MORE_FAILURE },
    );
    if (r.ok && Array.isArray(r.data.users)) {
      const more = r.data.users;
      setRows((prev) => {
        const base = prev ?? [];
        // Someone following (or unfollowing) mid-scroll shifts the window under
        // us; the same person landing twice would crash the list on its React
        // key, so an id already on screen is dropped instead.
        const seen = new Set(base.map((u) => u.id));
        return [...base, ...more.filter((u) => !seen.has(u.id))];
      });
      setHasMore(r.data.has_more === true);
      // `nextOffset` counts people passed in the list as it stood when the
      // sheet opened, which is why the walk-back above is applied at request
      // time and not stored: a full page always passes exactly PAGE_LIMIT more.
      setNextOffset((o) => o + PAGE_LIMIT);
      // `total` is NOT re-read here — see the note beside its declaration.
    } else {
      setMoreErr(asLoadFailure(r, MORE_FAILURE));
    }
    setLoading(false);
  }, [handle, loading, nextOffset, removed]);

  const onStateChange = useCallback((id: string, next: FollowState) => {
    setRows((prev) =>
      prev ? prev.map((u) => (u.id === id ? { ...u, follow_state: next } : u)) : prev,
    );
  }, []);

  // What the set actually contains right now: what the server last counted,
  // minus everyone who has left it since. Reported upward so the pill and this
  // list are the same set at all times (wave plan rule 6). `null` while no page
  // has answered — including after a failed first page, where reporting a 0
  // would be a refused read painting "nobody".
  const liveCount = total === null ? null : Math.max(0, total - removed);
  useEffect(() => {
    if (liveCount !== null) onCount?.(liveCount);
  }, [liveCount, onCount]);

  return (
    <Drawer.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content style={sheetContentStyle} aria-describedby={undefined}>
          <Drawer.Handle style={sheetHandleStyle} />
          <div
            style={{
              maxHeight: "calc(88dvh - 18px)",
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
            // Scrolling a long list shouldn't drag the sheet shut.
            data-vaul-no-drag
          >
            <Drawer.Title style={sheetHeadingStyle}>You both follow</Drawer.Title>
            <div style={{ padding: "4px 18px 18px" }}>
              {firstErr ? (
                <LoadFailed
                  failure={firstErr}
                  onRetry={() => {
                    setRows(null);
                    setRetryTick((t) => t + 1);
                  }}
                />
              ) : rows === null ? (
                <RowsSkeleton />
              ) : rows.length === 0 ? (
                <p style={{ ...sheetNoteStyle, padding: "12px 0 0" }}>
                  No one you both follow yet.
                </p>
              ) : (
                <>
                  <ul style={listStyle}>
                    {rows.map((u) => (
                      <UserRow key={u.id} user={u} onStateChange={onStateChange} />
                    ))}
                  </ul>
                  {moreErr ? (
                    <div style={{ marginTop: 8 }}>
                      <LoadFailed
                        failure={moreErr}
                        onRetry={() => {
                          void loadMore();
                        }}
                        compact
                      />
                    </div>
                  ) : null}
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() => {
                        void loadMore();
                      }}
                      disabled={loading}
                      style={{
                        display: "block",
                        margin: "10px auto 0",
                        padding: "8px 16px",
                        borderRadius: 999,
                        border: "1px solid rgba(28,28,30,0.12)",
                        background: "rgba(255,255,255,0.7)",
                        color: "#1C1C1E",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: loading ? "default" : "pointer",
                        opacity: loading ? 0.6 : 1,
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {loading ? "Loading…" : "Show more"}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Three placeholder rows while the first page is in flight — the same card
 *  geometry as UserRow so the list doesn't jump when the real rows land. */
function RowsSkeleton() {
  return (
    <ul style={listStyle} aria-hidden>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            background: "rgba(255,253,248,0.45)",
            border: "1px solid rgba(255,255,255,0.7)",
            borderRadius: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              background: "rgba(28,28,30,0.06)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: "55%",
                height: 14,
                background: "rgba(28,28,30,0.08)",
                borderRadius: 6,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: "75%",
                height: 11,
                background: "rgba(28,28,30,0.05)",
                borderRadius: 5,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Bottom-sheet chrome, copied from ProfileMobile's module-level sheet styles
// (they are module-private there, and this sheet must look identical to the ⋯
// menu it sits beside). The layers matter: globals.css .vibe-mobile-tabbar is
// z 9988 and the profile keeps the bar on screen, so anything lower gets its
// bottom rows painted over.
const sheetOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 10000,
};

const sheetContentStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "#FAF7F2",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: React.CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(28,28,30,0.18)",
};

const sheetHeadingStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 18px 6px",
  fontFamily: "Fraunces, serif",
  fontSize: 16,
  fontWeight: 800,
  color: "#1C1C1E",
};

const sheetNoteStyle: React.CSSProperties = {
  margin: 0,
  padding: "0 18px 12px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "#8A8580",
};
