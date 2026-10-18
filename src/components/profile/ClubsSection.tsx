"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties, type JSX } from "react";
import { Drawer } from "vaul";

import { LoadFailed, asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ClubLogo, VerifiedTick } from "./ClubFlair";
import {
  CLUBS_COPY,
  clubSheetActions,
  fillClubCopy,
  moveClub,
  myClubSubline,
  patchMember,
  readFollowedPage,
  readMyClubs,
  shownClubSubline,
  shownFromMine,
  showsNewTitleMark,
  type ClubSheetAction,
  type ClubStanding,
  type MemberPatch,
  type MyClubs,
  type ShownClub,
} from "./clubs-model";

/**
 * The Clubs section of the phone profile (batch 2E; club model spec D;
 * Franky's rules, Oct 18 2026). Since Oct 18 it is a sub-section of the
 * Portfolio tab (widget id `clubs` in users.profile_layout, first unless
 * the owner moves it), drawn like the others there: a title, then its rows
 * in one card.
 *
 *   - Anyone's profile: "Member of", the clubs they show, from the public
 *     bootstrap (`?clubs=1`). Nothing at all when they show none.
 *   - Your own: every club you're in (hidden ones marked) with a ⋯ sheet to
 *     hide or show it, hide your title, move it, or mute its posts; then
 *     "Following", which only you see, each with Mute and Unfollow; then
 *     "Muted", the clubs you muted from the feed but don't follow, so the
 *     Unmute has a home (wave-2 repair, finding 7). Data from
 *     `/api/me/clubs`, writes to `PATCH /api/me/clubs/[orgId]` and
 *     `DELETE /api/orgs/<handle>/follow`, more Following from
 *     `/api/me/followed-orgs`.
 */

// ── My clubs: the owner's data and writes ───────────────────────────────────

export type MyClubsStore = {
  status: "loading" | "failed" | "ready";
  failure: LoadFailure | null;
  data: MyClubs | null;
  /** What visitors see of my clubs, for my own flair chips. */
  shown: ShownClub[];
  /** Clubs with a write on its way: their sheet rows wait. */
  pending: ReadonlySet<string>;
  /** A reorder on its way: the Move rows wait. */
  ordering: boolean;
  loadingMore: boolean;
  /** Something is saving: BuildRefresh holds its reload (`data-holds-reload`). */
  busy: boolean;
  retry: () => void;
  loadMore: () => void;
  toggleShow: (orgId: string) => void;
  toggleTitle: (orgId: string) => void;
  move: (orgId: string, dir: -1 | 1) => void;
  toggleMute: (orgId: string) => void;
  unfollow: (orgId: string) => void;
};

function clubUrl(orgId: string): string {
  return `/api/me/clubs/${encodeURIComponent(orgId)}`;
}

/** The owner's clubs. Loads only when `enabled` (your own profile). */
export function useMyClubs(enabled: boolean): MyClubsStore {
  const [data, setData] = useState<MyClubs | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [loadTry, setLoadTry] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [ordering, setOrdering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const line = CLUBS_COPY.loadFailed;
      const r = await vibeRequest<unknown>("/api/me/clubs", {
        cache: "no-store",
        failure: line,
        quiet: true,
      });
      if (cancelled) return;
      const parsed = r.ok ? readMyClubs(r.data) : null;
      if (!parsed) {
        setFailure(asLoadFailure(r, line));
        return;
      }
      setFailure(null);
      setData(parsed);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loadTry]);

  const shown = useMemo(() => (data ? shownFromMine(data.member_of) : []), [data]);

  const mark = (orgId: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(orgId);
      else next.delete(orgId);
      return next;
    });

  const applyMember = (orgId: string, patch: MemberPatch) =>
    setData((d) => (d ? { ...d, member_of: patchMember(d.member_of, orgId, patch) } : d));

  const applyFollowed = (orgId: string, muted: boolean) =>
    setData((d) =>
      d
        ? {
            ...d,
            following: d.following.map((f) => (f.org_id === orgId ? { ...f, muted } : f)),
            muted_only: d.muted_only.map((f) => (f.org_id === orgId ? { ...f, muted } : f)),
          }
        : d,
    );

  /** One optimistic write: shows the change now, puts it back if refused. */
  const write = async (
    orgId: string,
    body: Record<string, unknown>,
    show: () => void,
    undo: () => void,
    failureLine: string,
    success?: string,
  ) => {
    if (pending.has(orgId)) return;
    mark(orgId, true);
    show();
    const r = await vibeRequest(clubUrl(orgId), {
      method: "PATCH",
      json: body,
      failure: failureLine,
      success,
    });
    if (!r.ok) undo();
    mark(orgId, false);
  };

  const toggleShow = (orgId: string) => {
    const club = data?.member_of.find((m) => m.org_id === orgId);
    if (!club) return;
    const next = !club.show_on_profile;
    void write(
      orgId,
      { show_on_profile: next },
      () => applyMember(orgId, { show_on_profile: next }),
      () => applyMember(orgId, { show_on_profile: club.show_on_profile }),
      fillClubCopy(next ? CLUBS_COPY.showFailed : CLUBS_COPY.hideFailed, { org: club.name }),
    );
  };

  const toggleTitle = (orgId: string) => {
    const club = data?.member_of.find((m) => m.org_id === orgId);
    if (!club || !club.title) return;
    const next = !club.show_title;
    void write(
      orgId,
      { show_title: next },
      () => applyMember(orgId, { show_title: next }),
      () => applyMember(orgId, { show_title: club.show_title }),
      CLUBS_COPY.titleFailed,
    );
  };

  const toggleMute = (orgId: string) => {
    const member = data?.member_of.find((m) => m.org_id === orgId);
    const followed = member
      ? undefined
      : (data?.following.find((f) => f.org_id === orgId) ?? data?.muted_only.find((f) => f.org_id === orgId));
    const club = member ?? followed;
    if (!club) return;
    const next = !club.muted;
    const vars = { org: club.name };
    const set = (muted: boolean) =>
      member ? applyMember(orgId, { muted }) : applyFollowed(orgId, muted);
    void write(
      orgId,
      { muted: next },
      () => set(next),
      () => set(club.muted),
      fillClubCopy(next ? CLUBS_COPY.muteFailed : CLUBS_COPY.unmuteFailed, vars),
      fillClubCopy(
        next ? (member ? CLUBS_COPY.mutedMember : CLUBS_COPY.muted) : CLUBS_COPY.unmuted,
        vars,
      ),
    );
  };

  /**
   * Unfollow from the Following sheet: the club's follow route, the one the
   * club page's Following ✓ uses. Waits for the server; a club whose posts I
   * muted moves to Muted, so the Unmute stays in reach.
   */
  const unfollow = (orgId: string) => {
    const club = data?.following.find((f) => f.org_id === orgId);
    if (!club || pending.has(orgId)) return;
    mark(orgId, true);
    void (async () => {
      const r = await vibeRequest(`/api/orgs/${encodeURIComponent(club.handle)}/follow`, {
        method: "DELETE",
        failure: CLUBS_COPY.unfollowFailed,
        success: fillClubCopy(CLUBS_COPY.unfollowed, { org: club.name }),
      });
      mark(orgId, false);
      if (!r.ok) return;
      setData((d) =>
        d
          ? {
              ...d,
              following: d.following.filter((f) => f.org_id !== orgId),
              muted_only: club.muted && !d.muted_only.some((f) => f.org_id === orgId) ? [club, ...d.muted_only] : d.muted_only,
            }
          : d,
      );
    })();
  };

  /**
   * Moves a club one place. The first move numbers every club (0, 1, 2…),
   * later ones change two. A refused write reloads the list, so the screen
   * never shows an order the server doesn't have.
   */
  const move = (orgId: string, dir: -1 | 1) => {
    if (!data || ordering) return;
    const res = moveClub(data.member_of, orgId, dir);
    if (!res) return;
    setData({ ...data, member_of: res.list });
    setOrdering(true);
    void (async () => {
      const results = await Promise.all(
        res.writes.map((w) =>
          vibeRequest(clubUrl(w.org_id), {
            method: "PATCH",
            json: { profile_rank: w.profile_rank },
            failure: CLUBS_COPY.orderFailed,
            quiet: true,
          }),
        ),
      );
      const refused = results.find((r) => !r.ok);
      if (refused && !refused.ok) {
        toast({ message: refused.message, tone: "error", action: refused.action });
        setLoadTry((n) => n + 1);
      }
      setOrdering(false);
    })();
  };

  const loadMore = () => {
    const cursor = data?.next_cursor;
    if (!data || !cursor || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      const r = await vibeRequest<unknown>(
        `/api/me/followed-orgs?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store", failure: CLUBS_COPY.loadMoreFailed },
      );
      setLoadingMore(false);
      if (!r.ok) return;
      const page = readFollowedPage(r.data, new Set());
      if (!page) {
        toast({ message: CLUBS_COPY.loadMoreFailed, tone: "error" });
        return;
      }
      // Clubs I'm in, and any already listed, stay out (`readFollowedPage`).
      setData((d) => {
        if (!d) return d;
        const have = new Set([...d.member_of, ...d.following].map((c) => c.org_id));
        return {
          ...d,
          following: [...d.following, ...page.following.filter((f) => !have.has(f.org_id))],
          next_cursor: page.next_cursor,
        };
      });
    })();
  };

  return {
    status: data ? "ready" : failure ? "failed" : "loading",
    failure,
    data,
    shown,
    pending,
    ordering,
    loadingMore,
    busy: pending.size > 0 || ordering,
    retry: () => {
      setFailure(null);
      setLoadTry((n) => n + 1);
    },
    loadMore,
    toggleShow,
    toggleTitle,
    move,
    toggleMute,
    unfollow,
  };
}

// ── The section ─────────────────────────────────────────────────────────────

type ClubsSectionProps =
  | { mode: "visitor"; clubs: readonly ShownClub[] | null }
  /** `note`: a short line after the title, e.g. while the owner has the
   *  whole section hidden (it still draws for them, so its lists stay reachable). */
  | { mode: "owner"; store: MyClubsStore; note?: string };

export function ClubsSection(props: ClubsSectionProps): JSX.Element | null {
  return props.mode === "visitor" ? (
    <VisitorClubs clubs={props.clubs} />
  ) : (
    <OwnerClubs store={props.store} note={props.note} />
  );
}

/** Someone else's profile: the clubs they show. Nothing when there are none. */
function VisitorClubs({ clubs }: { clubs: readonly ShownClub[] | null }): JSX.Element | null {
  const titleId = useId();
  if (!clubs || clubs.length === 0) return null;
  return (
    <section style={sectionStyle} aria-labelledby={titleId}>
      <h2 id={titleId} style={titleStyle}>{CLUBS_COPY.title}</h2>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>{CLUBS_COPY.memberOf}</div>
        <ul style={listStyle}>
          {clubs.map((club) => (
            <li key={club.handle} style={rowStyle}>
              <ClubRowLink club={club} sub={shownClubSubline(club)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type SheetTarget = { orgId: string; standing: ClubStanding };

const SEEN_TITLES_KEY = "vibe.club-titles-seen.v1";

/** The title I last opened each club's sheet on (`titleIsNew`), in this browser; empty when storage fails. */
function readSeenTitles(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SEEN_TITLES_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** My own profile: every club I'm in, then the ones I only follow, then the muted ones. */
function OwnerClubs({ store, note }: { store: MyClubsStore; note?: string }): JSX.Element {
  const titleId = useId();
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  // Read once; the marks only draw after the clubs load, so a first render
  // without storage draws the same skeleton.
  const [seenTitles, setSeenTitles] = useState<Record<string, string>>(() =>
    typeof window === "undefined" ? {} : readSeenTitles(),
  );
  const data = store.data;
  const openSheet = (target: SheetTarget) => {
    setSheet(target);
    const title = target.standing === "member" ? data?.member_of.find((m) => m.org_id === target.orgId)?.title : null;
    if (!title || seenTitles[target.orgId] === title) return;
    const next = { ...seenTitles, [target.orgId]: title };
    setSeenTitles(next);
    try {
      window.localStorage.setItem(SEEN_TITLES_KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: the mark comes back next visit, nothing worse.
    }
  };
  return (
    <section style={sectionStyle} aria-labelledby={titleId}>
      <h2 id={titleId} style={titleStyle}>
        {CLUBS_COPY.title}
        {note ? <span style={titleNoteStyle}> · {note}</span> : null}
      </h2>
      <div style={cardStyle}>
        {store.status === "failed" && store.failure ? (
          <LoadFailed compact failure={store.failure} onRetry={store.retry} />
        ) : !data ? (
          <ClubsSkeleton />
        ) : (
          <>
            <div style={eyebrowStyle}>{CLUBS_COPY.memberOf}</div>
            {data.member_of.length === 0 ? (
              <p style={emptyStyle}>{CLUBS_COPY.emptyMemberOf}</p>
            ) : (
              <>
                <p style={noteStyle}>{CLUBS_COPY.memberOfNote}</p>
                <ul style={listStyle}>
                  {data.member_of.map((club) => (
                    <li key={club.org_id} style={rowStyle}>
                      <ClubRowLink
                        club={club}
                        sub={myClubSubline(club)}
                        dim={!club.show_on_profile}
                        tags={[
                          club.show_on_profile ? null : CLUBS_COPY.hiddenTag,
                          club.muted ? CLUBS_COPY.mutedTag : null,
                          showsNewTitleMark(club, seenTitles) ? CLUBS_COPY.newTitleTag : null,
                        ]}
                      />
                      <MoreButton
                        name={club.name}
                        onClick={() => openSheet({ orgId: club.org_id, standing: "member" })}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div style={{ ...eyebrowStyle, marginTop: 18 }}>
              {CLUBS_COPY.following}
              <span style={onlyYouStyle}> · {CLUBS_COPY.onlyYou}</span>
            </div>
            {data.following.length === 0 && !data.next_cursor ? (
              <p style={emptyStyle}>{CLUBS_COPY.emptyFollowing}</p>
            ) : (
              <ul style={listStyle}>
                {data.following.map((club) => (
                  <li key={club.org_id} style={rowStyle}>
                    <ClubRowLink club={club} tags={[club.muted ? CLUBS_COPY.mutedTag : null]} />
                    <MoreButton
                      name={club.name}
                      onClick={() => openSheet({ orgId: club.org_id, standing: "following" })}
                    />
                  </li>
                ))}
              </ul>
            )}
            {data.next_cursor ? (
              <button
                type="button"
                onClick={store.loadMore}
                disabled={store.loadingMore}
                style={showMoreStyle}
              >
                {store.loadingMore ? CLUBS_COPY.loadingMore : CLUBS_COPY.showMore}
              </button>
            ) : null}

            {data.muted_only.length > 0 ? (
              <>
                <div style={{ ...eyebrowStyle, marginTop: 18 }}>{CLUBS_COPY.mutedGroup}</div>
                <p style={noteStyle}>{CLUBS_COPY.mutedGroupNote}</p>
                <ul style={listStyle}>
                  {data.muted_only.map((club) => (
                    <li key={club.org_id} style={rowStyle}>
                      <ClubRowLink club={club} tags={[club.muted ? CLUBS_COPY.mutedTag : null]} />
                      <MoreButton
                        name={club.name}
                        onClick={() => openSheet({ orgId: club.org_id, standing: "muted" })}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
      {sheet && data ? (
        <ClubOptionsSheet store={store} target={sheet} onClose={() => setSheet(null)} />
      ) : null}
    </section>
  );
}

/** Logo, name and tick, a second line, and any marks; opens the club's page. */
function ClubRowLink({
  club,
  sub,
  tags = [],
  dim = false,
}: {
  club: { handle: string; name: string; logo_url: string | null; verified: boolean };
  sub?: string;
  tags?: readonly (string | null)[];
  dim?: boolean;
}): JSX.Element {
  const marks = tags.filter((t): t is string => !!t);
  return (
    <Link href={`/orgs/${encodeURIComponent(club.handle)}`} style={rowLinkStyle}>
      <span style={{ display: "inline-flex", flexShrink: 0, opacity: dim ? 0.5 : 1 }}>
        <ClubLogo name={club.name} url={club.logo_url} size={40} />
      </span>
      <span style={rowTextStyle}>
        <span style={nameLineStyle}>
          <span style={{ ...nameStyle, opacity: dim ? 0.6 : 1 }}>{club.name}</span>
          {club.verified ? <VerifiedTick /> : null}
        </span>
        {sub ? <span style={subStyle}>{sub}</span> : null}
        {marks.length > 0 ? (
          <span style={marksStyle}>
            {marks.map((m) => (
              <span key={m} style={markStyle}>{m}</span>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** The ⋯ on a row: 44 px, so a thumb finds it. */
function MoreButton({ name, onClick }: { name: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={fillClubCopy(CLUBS_COPY.options, { org: name })}
      style={moreButtonStyle}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </button>
  );
}

/**
 * One club's choices on my own profile. Moves keep the sheet open, so a club
 * can climb several places; every other choice closes it.
 */
function ClubOptionsSheet({
  store,
  target,
  onClose,
}: {
  store: MyClubsStore;
  target: SheetTarget;
  onClose: () => void;
}): JSX.Element | null {
  const data = store.data;
  const member = target.standing === "member" ? data?.member_of.find((m) => m.org_id === target.orgId) : undefined;
  const club =
    member ??
    (target.standing === "following" ? data?.following : data?.muted_only)?.find((f) => f.org_id === target.orgId);
  if (!data || !club) return null;
  const actions = clubSheetActions(data.member_of, target.orgId, target.standing);
  const busy = store.pending.has(target.orgId);
  const vars = { org: club.name };

  const row = (action: ClubSheetAction): JSX.Element => {
    if (action === "open") {
      return (
        <Link
          key={action}
          href={`/orgs/${encodeURIComponent(club.handle)}`}
          onClick={onClose}
          style={{ ...sheetRowStyle, display: "block", textDecoration: "none" }}
        >
          {CLUBS_COPY.open}
        </Link>
      );
    }
    const moving = action === "move_up" || action === "move_down";
    const label =
      action === "toggle_show"
        ? member?.show_on_profile
          ? CLUBS_COPY.hide
          : CLUBS_COPY.show
        : action === "toggle_title"
          ? member?.show_title
            ? CLUBS_COPY.hideTitle
            : CLUBS_COPY.showTitle
          : action === "move_up"
            ? CLUBS_COPY.moveUp
            : action === "move_down"
              ? CLUBS_COPY.moveDown
              : action === "unfollow"
                ? CLUBS_COPY.unfollow
                : club.muted
                  ? CLUBS_COPY.unmute
                  : CLUBS_COPY.mute;
    const run = () => {
      if (action === "toggle_show") store.toggleShow(target.orgId);
      else if (action === "toggle_title") store.toggleTitle(target.orgId);
      else if (action === "move_up") store.move(target.orgId, -1);
      else if (action === "move_down") store.move(target.orgId, 1);
      else if (action === "unfollow") store.unfollow(target.orgId);
      else store.toggleMute(target.orgId);
      if (!moving) onClose();
    };
    return (
      <Fragment key={action}>
        <button
          type="button"
          onClick={run}
          disabled={moving ? store.ordering : busy}
          style={{ ...sheetRowStyle, opacity: (moving ? store.ordering : busy) ? 0.5 : 1 }}
        >
          {label}
        </button>
        {action === "toggle_mute" && !club.muted ? (
          <p style={sheetNoteStyle}>
            {fillClubCopy(member ? CLUBS_COPY.muteNoteMember : CLUBS_COPY.muteNote, vars)}
          </p>
        ) : null}
      </Fragment>
    );
  };

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content style={sheetContentStyle} aria-describedby={undefined}>
          <Drawer.Handle style={sheetHandleStyle} />
          <Drawer.Title style={sheetHeadingStyle}>{club.name}</Drawer.Title>
          <div style={{ padding: "4px 0 12px" }}>
            {actions.map(row)}
            <button type="button" onClick={onClose} style={{ ...sheetRowStyle, fontWeight: 700 }}>
              {CLUBS_COPY.cancel}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ClubsSkeleton(): JSX.Element {
  return (
    <ul aria-hidden="true" style={listStyle}>
      {[0, 1].map((i) => (
        <li key={i} style={{ ...rowStyle, opacity: 0.6 }}>
          <span style={{ ...skeletonStyle, width: 40, height: 40, borderRadius: "50%" }} />
          <span style={rowTextStyle}>
            <span style={{ ...skeletonStyle, width: "55%", height: 13 }} />
            <span style={{ ...skeletonStyle, width: "35%", height: 10, marginTop: 7 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
// The card matches ProfileMobile's `Section` (white in Light, --paper in
// Night). The sheet matches its ⋯ menu: cream surface, layers 10000/10001,
// above the tab bar (9988) and under ToastHost (12000).

/** A Portfolio sub-section: no box of its own, the pane's gutters. */
const sectionStyle: CSSProperties = { minWidth: 0, color: "var(--charcoal)" };

/** The rows' card. Its top padding is short: the first row brings a hairline. */
const cardStyle: CSSProperties = {
  padding: "12px 14px 6px",
  background: "var(--paper)",
  borderRadius: 16,
  border: "1px solid rgba(var(--scrim-rgb),0.06)",
  boxShadow: "var(--card-shadow)",
  minWidth: 0,
};

/** PortfolioSubsection's title (ProfileMobile.tsx), so the tab reads as one list. */
const titleStyle: CSSProperties = {
  margin: "0 0 10px",
  fontFamily: "Fraunces, serif",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: "-0.2px",
  color: "var(--charcoal)",
};

/** The owner's note after the title ("Hidden · only you see it"). */
const titleNoteStyle: CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0,
  color: "var(--ink-muted)",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 6px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
};

const onlyYouStyle: CSSProperties = {
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "none",
};

const noteStyle: CSSProperties = {
  margin: "0 0 4px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "var(--ink-muted)",
};

const emptyStyle: CSSProperties = { ...noteStyle, margin: "2px 0 0", color: "var(--ink-2)" };

const listStyle: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  padding: "8px 0",
  borderTop: "1px solid var(--hairline)",
};

const rowLinkStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 12,
  color: "inherit",
  textDecoration: "none",
  WebkitTapHighlightColor: "transparent",
};

const rowTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const nameLineStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minWidth: 0 };

const nameStyle: CSSProperties = {
  minWidth: 0,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const subStyle: CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-2)",
  overflowWrap: "anywhere",
};

const marksStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 };

const markStyle: CSSProperties = {
  padding: "1px 7px",
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.06)",
  color: "var(--ink-muted)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};

const moreButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink-muted)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const showMoreStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 44,
  marginTop: 8,
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.12)",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const skeletonStyle: CSSProperties = {
  display: "block",
  flexShrink: 0,
  borderRadius: 6,
  background: "rgba(var(--scrim-rgb),0.08)",
};

const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 10000,
};

const sheetContentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "var(--cream)",
  color: "var(--charcoal)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.18)",
};

const sheetHeadingStyle: CSSProperties = {
  margin: 0,
  padding: "10px 18px 6px",
  fontFamily: "Fraunces, serif",
  fontSize: 16,
  fontWeight: 800,
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sheetRowStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 18px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid rgba(var(--scrim-rgb),0.04)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 500,
  color: "var(--charcoal)",
  textAlign: "left",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const sheetNoteStyle: CSSProperties = {
  margin: 0,
  padding: "0 18px 12px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--ink-muted)",
};
