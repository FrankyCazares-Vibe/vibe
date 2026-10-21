"use client";

import { useCallback, useEffect, useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { parseSwitchedClub } from "@/lib/orgs/club-switch";

/**
 * The clubs I'm a plain member of (`GET /api/me/clubs-in`), for the "Your
 * clubs" list in the desktop left menu's profile card (Oct 21, 2026). The
 * clubs I run come from club-switch.ts's `useClubsYouRun`; this is the rest.
 *
 * The same shape of cache as the clubs I run: page memory only, two minutes,
 * never browser storage (a sign-out in one tab must not leave one person's
 * clubs for the next person: security pass L1 on club-switch.ts). LeftNav
 * mounts again on every page, so the cache is what makes the card show the
 * list at once after the first page.
 *
 * Safe to import from any client file: no window at import time.
 */

export const CLUBS_IN_CACHE_MS = 2 * 60 * 1000;

/** One club I'm a member of (not an officer or the owner). */
export type ClubIn = {
  org_id: string;
  handle: string;
  name: string;
  /** Through orgAssetProxyUrl. */
  logo_url: string | null;
};

// ── Shapes (pure) ───────────────────────────────────────────────────────────

/** One row of the route's answer, validated; junk → null. */
export function parseClubIn(raw: unknown): ClubIn | null {
  const club = parseSwitchedClub(raw);
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o || !club || typeof o.org_id !== "string" || !o.org_id) return null;
  return { org_id: o.org_id, ...club };
}

/** The route's body → its clubs; null when it isn't that shape. */
export function readClubsIn(raw: unknown): ClubIn[] | null {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.clubs)) return null;
  const seen = new Set<string>();
  return o.clubs.flatMap((c) => {
    const r = parseClubIn(c);
    if (!r || seen.has(r.handle)) return [];
    seen.add(r.handle);
    return [r];
  });
}

// ── A two-minute cache, then the route ─────────────────────────────────────

type CacheEntry = { at: number; clubs: ClubIn[] };
let memo: CacheEntry | null = null;
/** Bumped on every clear, so an answer already on its way can't refill it. */
let cacheGen = 0;
let inflight: Promise<LoadResult> | null = null;

type LoadResult = { ok: true; clubs: ClubIn[] } | { ok: false };

/** The cached clubs while fresh, else null. Exported for clubs-in.test.ts. */
export function readClubsInCache(now: number = Date.now()): ClubIn[] | null {
  if (!memo || now - memo.at < 0 || now - memo.at >= CLUBS_IN_CACHE_MS) return null;
  return memo.clubs;
}

/** The last answer even past its two minutes, or null once cleared (as club-switch.ts's readClubsYouRunLast). */
export function readClubsInLast(): ClubIn[] | null {
  return memo ? memo.clubs : null;
}

/** Forget the cached clubs; the next reader asks the route. */
export function clearClubsInCache(): void {
  memo = null;
  cacheGen += 1;
}

/** Exported for clubs-in.test.ts. */
export function writeClubsInCache(clubs: ClubIn[], now: number = Date.now()): void {
  memo = { at: now, clubs };
}

/**
 * The cache when fresh, else one ask of the route, shared by every caller
 * while it is on its way. Signed out reads as no clubs, empties the cache
 * and is never cached. Exported for clubs-in.test.ts.
 */
export function loadClubsIn(): Promise<LoadResult> {
  const cached = readClubsInCache();
  if (cached) return Promise.resolve({ ok: true, clubs: cached });
  if (inflight) return inflight;
  const gen = cacheGen;
  inflight = (async (): Promise<LoadResult> => {
    const r = await vibeRequest<unknown>("/api/me/clubs-in", {
      cache: "no-store",
      failure: "Couldn't load your clubs.",
      quiet: true,
    });
    if (!r.ok) {
      if (r.status !== 401) return { ok: false };
      clearClubsInCache();
      return { ok: true, clubs: [] };
    }
    const clubs = readClubsIn(r.data);
    if (!clubs) return { ok: false };
    if (gen === cacheGen) writeClubsInCache(clubs);
    return { ok: true, clubs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export type ClubsInState = {
  status: "idle" | "loading" | "ok" | "error";
  clubs: ClubIn[];
  /** Ask the route now, past the cache; the list on screen stays until the answer. */
  retry(): void;
  /** The same as retry (the "Your clubs" list asks fresh each time it opens). */
  refresh(): void;
};

type Held = { status: "idle" | "loading" | "ok" | "error"; clubs: ClubIn[] };
const IDLE: Held = { status: "idle", clubs: [] };

/** The clubs I'm a member of, from the cache when fresh. Asks only while `enabled`. */
export function useClubsIn(enabled: boolean): ClubsInState {
  const [held, setHeld] = useState<Held>(IDLE);
  const [ask, setAsk] = useState(0);

  // Off, the list goes (React's "adjust state while rendering", as useClubsYouRun).
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) setHeld(IDLE);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const cached = readClubsInCache();
      if (!cached) setHeld((h) => (h.status === "ok" ? h : { status: "loading", clubs: [] }));
      const r = cached ? ({ ok: true, clubs: cached } as const) : await loadClubsIn();
      if (cancelled) return;
      if (r.ok) setHeld({ status: "ok", clubs: r.clubs });
      else setHeld((h) => (h.status === "ok" ? h : { status: "error", clubs: [] }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ask]);

  const retry = useCallback(() => {
    clearClubsInCache();
    setAsk((n) => n + 1);
  }, []);
  const shown = enabled ? held : IDLE;
  return { status: shown.status, clubs: shown.clubs, retry, refresh: retry };
}
