"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CAMPUSES, SYSTEM_LABEL, campusRowById, isSharedCampus } from "@/lib/iu/campuses";
import { CAMPUS_CHANGE_COOLDOWN_DAYS } from "@/lib/profile/onboarding-prefill";

/**
 * Which campus the campus page is SHOWING (S67 wave 4, plan E, contracts C5),
 * as opposed to the student's HOME campus. Both shells (desktop
 * `campus-home.tsx`, phone `CampusMobile.tsx`) read it here and build every
 * campus fetch through {@link withCampus}, so the two can't drift.
 *
 * THE URL IS THE TRUTH. `?campus=<id>` names the campus being viewed; no
 * param (or the home id, or an id we don't know) means home. Home keeps the
 * bare URL, so nothing changes for a student who never looks around.
 *
 * WHAT "VISITING" MEANS HERE: a known campus is named and it isn't home. An
 * unknown home (still loading, or none picked) counts as "not this one", so
 * a named campus reads as visiting until home is known: the safe direction
 * (composer hidden, RSVP disabled) for the second it takes. The server keeps
 * its own rules: any verified student may READ any campus; RSVP away from
 * home is 403 `campus_visiting`; the home campus itself stays own-system only.
 *
 * Everything but {@link useViewingCampus} is pure (no DOM, no clock unless
 * passed in) and covered by `viewing-campus.test.ts`, which stubs React and
 * next/navigation. Import from client components only.
 */

/** The query param both shells and every campus API read. */
export const CAMPUS_PARAM = "campus";

/** Canonical campus id for anything a URL or a prop can carry, else null. */
export function canonicalCampusId(raw: string | null | undefined): string | null {
  return campusRowById(raw)?.id ?? null;
}

/** True when a known campus is on screen and it isn't the student's home. */
export function isVisitingCampus(viewingId: string | null, homeId: string | null): boolean {
  const viewing = canonicalCampusId(viewingId);
  return viewing !== null && viewing !== canonicalCampusId(homeId);
}

/**
 * The viewed campus for a raw `?campus=` value: that campus when we know it,
 * else home. `?campus=all` and junk fall back to home here (the server still
 * answers them its own way; this page never sends them).
 */
function resolveViewing(raw: string | null, homeId: string | null): { viewingId: string | null; isVisiting: boolean } {
  const home = canonicalCampusId(homeId);
  const viewingId = canonicalCampusId(raw) ?? home;
  return { viewingId, isVisiting: isVisitingCampus(viewingId, home) };
}

/**
 * `location.search` (with or without the leading "?") → the viewed campus.
 * `viewingId` is home when nothing (or home, or an unknown id) is named.
 */
export function parseViewingCampus(
  search: string,
  homeId: string | null,
): { viewingId: string | null; isVisiting: boolean } {
  return resolveViewing(new URLSearchParams(search ?? "").get(CAMPUS_PARAM), homeId);
}

/**
 * Every campus fetch goes through here. At home (nothing viewed, or the home
 * campus) the url comes back untouched; otherwise `?campus=<id>` is set,
 * replacing any campus already on it, and only path + search come back.
 */
export function withCampus(url: string, viewingId: string | null, homeId: string | null): string {
  const id = canonicalCampusId(viewingId);
  if (!id || id === canonicalCampusId(homeId)) return url;
  const u = new URL(url, "http://x");
  u.searchParams.set(CAMPUS_PARAM, id);
  return u.pathname + u.search;
}

/**
 * The page's own address with `?campus=` set to `campusId`, or removed when
 * it's null. Path, other params and the hash are kept.
 */
export function hrefWithViewing(href: string, campusId: string | null): string {
  const u = new URL(href, "http://x");
  if (campusId) u.searchParams.set(CAMPUS_PARAM, campusId);
  else u.searchParams.delete(CAMPUS_PARAM);
  return u.pathname + u.search + u.hash;
}

/** Whether a campus is open (only Indianapolis today). Unknown → false. */
export function isOpenCampus(id: string | null | undefined): boolean {
  return campusRowById(id)?.isOpen === true;
}

/**
 * The campus's everyday name ("Bloomington", "Fort Wayne"). Two campuses
 * share a short name ("Northwest"), so those two say their full name
 * ("IU Northwest", "Purdue Northwest"). Null for an unknown id.
 */
export function campusViewName(id: string | null | undefined): string | null {
  const row = campusRowById(id);
  if (!row) return null;
  const clash = CAMPUSES.some((c) => c.id !== row.id && c.shortName === row.shortName);
  return clash ? row.name : row.shortName;
}

/** Header eyebrow while visiting: "IU · JUST LOOKING", "IU + PURDUE · JUST LOOKING". */
export function visitingEyebrow(viewingId: string | null): string | null {
  const row = campusRowById(viewingId);
  if (!row) return null;
  const who = isSharedCampus(row)
    ? row.systems.map((s) => SYSTEM_LABEL[s].toUpperCase()).join(" + ")
    : SYSTEM_LABEL[row.systems[0]].toUpperCase();
  return `${who} · JUST LOOKING`;
}

/** The pill: "Viewing Bloomington · home is Indianapolis" ("Viewing Bloomington" when home is unknown). */
export function visitingBannerText(viewingId: string | null, homeId: string | null): string | null {
  const viewing = campusViewName(viewingId);
  if (!viewing) return null;
  const home = campusViewName(homeId);
  return home ? `Viewing ${viewing} · home is ${home}` : `Viewing ${viewing}`;
}

/** The dashed note in the composer's slot while visiting. */
export function visitingComposerNote(homeId: string | null): string {
  const home = campusViewName(homeId);
  return `You're just looking. New posts go to ${home ?? "your home campus"}.`;
}

/** The rest of the visiting copy (contracts C5), in one place for both shells and the org page. */
export const VISITING_COPY = Object.freeze({
  rsvpTitle: "RSVP works on your home campus",
  rsvpNote: "RSVP works at home",
  emptyFeed: "Nobody's posted here yet.",
  emptyEvents: "No events here yet.",
  emptyClubs: "No clubs here yet.",
});

// ── The "Look around." picker ────────────────────────────────────────────

export const BROWSE_PICKER_INTRO =
  "Browse any campus. Follow people and message them anywhere. RSVPs work on your home campus and in clubs you're a member of.";
export const BROWSE_PICKER_FOOTER = `home stays home for ${CAMPUS_CHANGE_COOLDOWN_DAYS} days after you pick it.`;
export const NO_STUDENTS_YET = "No students yet · still viewable";

export type BrowsePickerRow = {
  id: string;
  /** Short name; the group heading already says which university. */
  name: string;
  isHome: boolean;
  /** On screen now and not home (home carries its own "You're here"). */
  isViewing: boolean;
  /** "Home · you can change it on Nov 9", "No students yet · still viewable", or null. */
  sub: string | null;
  /** "full" = a 52px row with its sub-line; "compact" = a 44px tile in a two-column grid. */
  size: "full" | "compact";
};

export type BrowsePickerGroup = { key: "shared" | "iu" | "purdue"; label: string; rows: BrowsePickerRow[] };

const GROUP_LABEL: Record<BrowsePickerGroup["key"], string> = {
  shared: "SHARED · IU + PURDUE",
  iu: "IU",
  purdue: "PURDUE",
};

/**
 * "Nov 9": the day the home lock lifts, on Indiana's calendar. Null when the
 * date is unreadable or already past (then the row just says "Home").
 */
export function homeChangeDay(availableAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!availableAt) return null;
  const ms = Date.parse(availableAt);
  if (!Number.isFinite(ms) || ms <= now) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  });
}

/**
 * The picker's rows, grouped Shared · IU · Purdue in `CAMPUSES` order (all 11,
 * both universities; each shared campus listed once). Layout per the canvas:
 * shared campuses, the home campus and the first campus of a group of more
 * than two get full rows; the rest sit in a two-column grid. `counts` is
 * optional: a 0 reads "No students yet · still viewable"; unknown or more
 * than 0 says nothing (no numbers on the page).
 */
export function browsePickerGroups(opts: {
  homeId: string | null;
  viewingId?: string | null;
  homeChangeAvailableAt?: string | null;
  counts?: Readonly<Record<string, number>> | null;
  now?: number;
}): BrowsePickerGroup[] {
  const home = canonicalCampusId(opts.homeId);
  const viewing = canonicalCampusId(opts.viewingId ?? null);
  const day = homeChangeDay(opts.homeChangeAvailableAt, opts.now);
  const groups: BrowsePickerGroup[] = (["shared", "iu", "purdue"] as const).map((key) => ({
    key,
    label: GROUP_LABEL[key],
    rows: [],
  }));
  for (const c of CAMPUSES) {
    const key = isSharedCampus(c) ? "shared" : c.systems[0];
    const group = groups.find((g) => g.key === key);
    if (!group) continue;
    const isHome = c.id === home;
    const count = opts.counts?.[c.id];
    group.rows.push({
      id: c.id,
      name: c.shortName,
      isHome,
      isViewing: !isHome && c.id === viewing,
      sub: isHome ? (day ? `Home · you can change it on ${day}` : "Home") : count === 0 ? NO_STUDENTS_YET : null,
      size: "compact",
    });
  }
  for (const g of groups) {
    g.rows.forEach((r, i) => {
      if (g.key === "shared" || r.isHome || (i === 0 && g.rows.length > 2)) r.size = "full";
    });
  }
  return groups.filter((g) => g.rows.length > 0);
}

// ── The hook ─────────────────────────────────────────────────────────────

export type ViewingCampus = {
  /** The campus on screen: the named one, else home (null = no home and nothing named). */
  viewingId: string | null;
  /** Echo of the home id the shell passed in, canonicalised. */
  homeId: string | null;
  isVisiting: boolean;
  /** Look at a campus; null (or the home id) goes home and drops the param. */
  setViewing(id: string | null): void;
};

/**
 * The viewed campus for a shell. Each shell passes the home id it already
 * learns (desktop `useViewerCampus().campusId`, the phone its own read).
 * `setViewing` rewrites `?campus=` with `history.replaceState` (Next syncs
 * `useSearchParams` from it) and keeps a local copy for the tick before the
 * router catches up. Back/forward and a pasted link still win: once the URL
 * moves past the value the local copy was made against, the URL is read again.
 */
export function useViewingCampus(homeId: string | null): ViewingCampus {
  const searchParams = useSearchParams();
  const fromUrl = searchParams?.get(CAMPUS_PARAM) ?? null;
  const [local, setLocal] = useState<{ against: string | null; raw: string | null } | null>(null);
  // The URL moved on (the router caught up, back/forward, a link): drop the
  // local copy so a later return to the old URL can't resurrect it.
  if (local && local.against !== fromUrl) setLocal(null);
  const raw = local && local.against === fromUrl ? local.raw : fromUrl;
  const home = canonicalCampusId(homeId);
  const { viewingId, isVisiting } = resolveViewing(raw, home);

  const setViewing = useCallback(
    (id: string | null) => {
      const next = canonicalCampusId(id);
      const param = next && next !== home ? next : null;
      if (typeof window !== "undefined") {
        // `null` state on purpose: Next copies its own history state in, and
        // skips the useSearchParams sync when handed its own state object.
        window.history.replaceState(null, "", hrefWithViewing(window.location.href, param));
      }
      setLocal({ against: fromUrl, raw: param });
    },
    [home, fromUrl],
  );

  return { viewingId, homeId: home, isVisiting, setViewing };
}
