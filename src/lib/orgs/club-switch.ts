"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { vibeRequest } from "@/lib/feedback/request";

/**
 * The phone's club switch (wave 2, WAVE2-DESIGN.md C1 and C2): which club the
 * Profile tab stands for, and the clubs I run that it can stand for.
 *
 * WHERE IT LIVES. The tab bar takes no props and every page mounts its own,
 * so the choice is in localStorage, per account (signing out removes it:
 * `ACCOUNT_KEYS` in src/lib/pwa/leave-device-clean.ts). Only this phone
 * remembers it; nothing goes to the server. Every storage touch is guarded
 * and a failure reads as "not switched", never the other way round.
 *
 * Safe to import from any client file: no window at import time. The server
 * and the first client render always see "not switched" (no hydration
 * mismatch); the stored club shows on the render after.
 */

export const PROFILE_AS_CLUB_KEY = "vibe.profile-as-club.v1";
export const PROFILE_AS_CLUB_EVENT = "vibe:profile-as-club";
/** Same-tab: a fresh clubs-you-run answer landed (the sheet refreshed). */
export const CLUBS_YOU_RUN_EVENT = "vibe:clubs-you-run";
export const CLUBS_YOU_RUN_CACHE_MS = 2 * 60 * 1000;

export type SwitchedClub = { handle: string; name: string; logo_url: string | null };

/** One club I'm the owner or an officer of (`GET /api/me/clubs-you-run`). */
export type ClubYouRun = {
  org_id: string;
  handle: string;
  name: string;
  /** Through orgAssetProxyUrl. */
  logo_url: string | null;
  /** "admin" is shown as "Officer". */
  role: "owner" | "admin";
  title: string | null;
  /** Pending join requests; null when that read failed. */
  requests: number | null;
};

// ── Shapes (pure) ───────────────────────────────────────────────────────────

/** Lenient on purpose (older clubs predate today's rule), strict enough for a URL path. */
const HANDLE_SHAPE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const NAME_MAX = 120;

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** A club handle, lower-cased; null when it isn't one. */
export function clubHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const h = raw.trim().toLowerCase();
  return HANDLE_SHAPE.test(h) ? h : null;
}

/** Same-origin paths and https links only; anything else draws the initial. */
function logoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return u.startsWith("https://") ? u : null;
}

function clubName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.trim();
  return n ? n.slice(0, NAME_MAX) : null;
}

/** A stored or passed switched club, validated; junk → null. */
export function parseSwitchedClub(raw: unknown): SwitchedClub | null {
  const o = obj(raw);
  const handle = o ? clubHandle(o.handle) : null;
  const name = o ? clubName(o.name) : null;
  if (!o || !handle || !name) return null;
  return { handle, name, logo_url: logoUrl(o.logo_url) };
}

/** One row of the route's answer, validated; junk → null. */
export function parseClubYouRun(raw: unknown): ClubYouRun | null {
  const o = obj(raw);
  const club = o ? parseSwitchedClub(o) : null;
  if (!o || !club || typeof o.org_id !== "string" || !o.org_id) return null;
  if (o.role !== "owner" && o.role !== "admin") return null;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : null;
  const n = o.requests;
  const requests = typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
  return { org_id: o.org_id, ...club, role: o.role, title, requests };
}

/** The route's body → its clubs; null when it isn't that shape. */
export function readClubsYouRun(raw: unknown): ClubYouRun[] | null {
  const o = obj(raw);
  if (!o || !Array.isArray(o.clubs)) return null;
  const seen = new Set<string>();
  return o.clubs.flatMap((c) => {
    const r = parseClubYouRun(c);
    if (!r || seen.has(r.handle)) return [];
    seen.add(r.handle);
    return [r];
  });
}

/** True when `a` and `b` name the same club (handles compare lower-cased). */
export function sameHandle(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = clubHandle(a);
  return x !== null && x === clubHandle(b);
}

// ── The remembered club ─────────────────────────────────────────────────────

function readRaw(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(PROFILE_AS_CLUB_KEY);
  } catch {
    return null;
  }
}

function parseRaw(raw: string | null): SwitchedClub | null {
  if (!raw) return null;
  try {
    return parseSwitchedClub(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The club the Profile tab stands for on this phone, or null (me). */
export function readSwitchedClub(): SwitchedClub | null {
  return parseRaw(readRaw());
}

function emit(name: string): void {
  try {
    window.dispatchEvent(new Event(name));
  } catch {
    // No window events (a test): nothing listens.
  }
}

/** Switch the Profile tab to `club`, or back to me with null. */
export function setSwitchedClub(club: SwitchedClub | null): void {
  if (typeof window === "undefined") return;
  const next = club ? parseSwitchedClub(club) : null;
  try {
    if (next) window.localStorage.setItem(PROFILE_AS_CLUB_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(PROFILE_AS_CLUB_KEY);
  } catch {
    // Blocked storage: the switch can't be kept, so the tab stays me.
  }
  clearClubsYouRunCache();
  emit(PROFILE_AS_CLUB_EVENT);
}

/**
 * useSyncExternalStore needs the same object back while nothing changed, so
 * the last parse is kept against the raw string it came from.
 */
let snapRaw: string | null | undefined;
let snapClub: SwitchedClub | null = null;

function switchedSnapshot(): SwitchedClub | null {
  const raw = readRaw();
  if (raw !== snapRaw) {
    snapRaw = raw;
    snapClub = parseRaw(raw);
  }
  return snapClub;
}

function subscribeSwitched(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PROFILE_AS_CLUB_KEY) onChange();
  };
  window.addEventListener(PROFILE_AS_CLUB_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PROFILE_AS_CLUB_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** `readSwitchedClub`, kept current (this tab and others); null on the server and at hydration. */
export function useSwitchedClub(): SwitchedClub | null {
  return useSyncExternalStore(subscribeSwitched, switchedSnapshot, () => null);
}

// ── Clubs you run: a two-minute cache, then the route ───────────────────────

type CacheEntry = { at: number; clubs: ClubYouRun[] };
let memo: CacheEntry | null = null;
/** Bumped on every clear, so an answer already on its way can't refill it. */
let cacheGen = 0;
let inflight: Promise<LoadResult> | null = null;

type LoadResult = { ok: true; clubs: ClubYouRun[] } | { ok: false };

/**
 * The cached clubs while fresh, else null. Page memory only, never
 * sessionStorage (security pass L1, Oct 21): sessionStorage is per tab, so a
 * sign-out in one tab would leave another tab's copy of one person's clubs
 * for the next person on that computer. Memory lasts as long as the page:
 * client navigations keep it, and signing out reloads the page
 * (SettingsClient's `window.location.href`), which drops it.
 */
export function readClubsYouRunCache(now: number = Date.now()): ClubYouRun[] | null {
  if (!memo || now - memo.at < 0 || now - memo.at >= CLUBS_YOU_RUN_CACHE_MS) return null;
  return memo.clubs;
}

function writeCache(clubs: ClubYouRun[]): void {
  memo = { at: Date.now(), clubs };
}

/** Forget the cached clubs (a switch, a signed-out answer); the next reader asks the route. */
export function clearClubsYouRunCache(): void {
  memo = null;
  cacheGen += 1;
}

const LOAD_FAILED = "Couldn't load your clubs.";

/**
 * The cache when fresh (unless `force`), else one ask of the route, shared by
 * every caller while it is on its way. Signed out reads as no clubs, empties
 * the cache and is never cached, so signing in shows them at once. Exported
 * for club-switch.test.ts.
 */
export function loadClubsYouRun(force: boolean): Promise<LoadResult> {
  if (!force) {
    const cached = readClubsYouRunCache();
    if (cached) return Promise.resolve({ ok: true, clubs: cached });
  }
  if (inflight) return inflight;
  const gen = cacheGen;
  inflight = (async (): Promise<LoadResult> => {
    const r = await vibeRequest<unknown>("/api/me/clubs-you-run", { cache: "no-store", failure: LOAD_FAILED, quiet: true });
    if (!r.ok) {
      if (r.status !== 401) return { ok: false };
      // Signed out: nobody's clubs stay in this page's memory.
      clearClubsYouRunCache();
      return { ok: true, clubs: [] };
    }
    const clubs = readClubsYouRun(r.data);
    if (!clubs) return { ok: false };
    if (gen === cacheGen) {
      writeCache(clubs);
      emit(CLUBS_YOU_RUN_EVENT);
    }
    return { ok: true, clubs };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export type ClubsYouRunState = {
  status: "idle" | "loading" | "ok" | "error";
  clubs: ClubYouRun[];
  /** Ask again after a failure. */
  retry(): void;
  /** Ask the route now, past the cache (the sheet, on open). */
  refresh(): void;
};

type Held = { status: "idle" | "loading" | "ok" | "error"; clubs: ClubYouRun[] };
const IDLE: Held = { status: "idle", clubs: [] };

/**
 * The clubs I run, from the cache when fresh. Asks only while `enabled`:
 * the tab bar enables it only when switched, so most pages never ask. A
 * refresh that fails keeps the list already on screen.
 */
export function useClubsYouRun(enabled: boolean): ClubsYouRunState {
  const [held, setHeld] = useState<Held>(IDLE);
  const [ask, setAsk] = useState({ n: 0, force: false });

  // Off, the list goes: switched on again later starts from the cache or the
  // route, never from what this component held before (React's "adjust state
  // while rendering", not an effect).
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) setHeld(IDLE);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const cached = ask.force ? null : readClubsYouRunCache();
      if (!cached) setHeld((h) => (h.status === "ok" ? h : { status: "loading", clubs: [] }));
      const r = cached ? ({ ok: true, clubs: cached } as const) : await loadClubsYouRun(ask.force);
      if (cancelled) return;
      if (r.ok) setHeld({ status: "ok", clubs: r.clubs });
      else setHeld((h) => (h.status === "ok" ? h : { status: "error", clubs: [] }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ask]);

  // Another reader on this page got a fresh answer (the sheet refreshed):
  // the tab's dot and the desktop lines follow it.
  useEffect(() => {
    if (!enabled) return;
    const onFresh = () => {
      const cached = readClubsYouRunCache();
      if (cached) setHeld({ status: "ok", clubs: cached });
    };
    window.addEventListener(CLUBS_YOU_RUN_EVENT, onFresh);
    return () => window.removeEventListener(CLUBS_YOU_RUN_EVENT, onFresh);
  }, [enabled]);

  const again = useCallback(() => setAsk((a) => ({ n: a.n + 1, force: true })), []);
  const shown = enabled ? held : IDLE;
  return { status: shown.status, clubs: shown.clubs, retry: again, refresh: again };
}
