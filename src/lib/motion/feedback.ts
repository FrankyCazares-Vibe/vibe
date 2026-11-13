import { useSyncExternalStore } from "react";

import { setClearMotion } from "@/lib/otto/clear-notifications";

/**
 * Happy feedback on Otto's desk (motion 1, Nov 12, 2026). The classes live in
 * src/components/otto/kit/motion.css; this moves them on and off the rows:
 *
 * - `deskFx(id)`, called in the click (before any await), finds the row:
 *   `[data-dk-id="<desk item id>"]` (DeskRow, DeskDraft, DeskDone carry it),
 *   else the row around what was clicked. `done()` lands the stamp, slides
 *   the row out and, once the caller drops the item, glides the rows below up
 *   into its place (FLIP, transform only). It also puts Planet in the sky in
 *   "done" for a moment (`useDeskDone`).
 * - `leaveRows` / `riseNew` / `pop`: a row fades and slides out, new rows rise
 *   in, a bar gives a soft pop.
 *
 * Reduced motion: nothing waits and nothing moves; the toasts carry the words.
 */

export const FX_MS = { stamp: 560, leave: 220, enter: 340, done: 1200 } as const;

/** Every desk row shape (ours, the panes', the side panel's); the outermost match is the row. */
const ROWS = "[data-dk-id], .dk-draft, .dk-row, .dk-done, .dk-clear-li, .otp-saw, .odc-saw";

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** What the person just clicked, while its handler runs. */
export function clicked(): Element | null {
  const e = typeof window === "undefined" ? undefined : (window as unknown as { event?: Event }).event;
  return e?.target instanceof Element ? e.target : null;
}

function outermost(el: Element | null, root?: Element): HTMLElement | null {
  let row = el?.closest<HTMLElement>(ROWS) ?? null;
  for (let up = row?.parentElement?.closest<HTMLElement>(ROWS); up && (!root || root.contains(up)); up = up.parentElement?.closest<HTMLElement>(ROWS)) row = up;
  return row;
}

/** The rows in `root`, outermost only (a folded draft holds a dk-row). */
function rowsIn(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ROWS)].filter((r) => {
    const up = r.parentElement?.closest(ROWS);
    return !up || !root.contains(up);
  });
}

/** The row for a desk item: the clicked one if it is that item's, else the first on the page. */
export function findRow(id: string, from: Element | null = clicked()): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const own = from?.closest<HTMLElement>(`[data-dk-id="${CSS.escape(id)}"]`);
  return own ?? document.querySelector<HTMLElement>(`[data-dk-id="${CSS.escape(id)}"]`) ?? outermost(from);
}

/** The list a row sits in (its section, tab pane or panel), where glides and rises are measured. */
export const rootOf = (el: Element): Element => el.closest("section, [role=tabpanel], aside, dialog") ?? el.parentElement ?? document.body;

function softCurve(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--vibe-spring-soft").trim() || "ease-out";
}

/** Once `gone` leaves the page, the rows that were around it glide from where they were. */
function flipWhenGone(gone: HTMLElement[], root: Element): void {
  const before = new Map(rowsIn(root).filter((r) => !gone.includes(r)).map((r) => [r, r.getBoundingClientRect().top]));
  const mo = new MutationObserver(() => {
    if (gone.some((g) => g.isConnected)) return;
    mo.disconnect();
    const ease = softCurve();
    before.forEach((top, row) => {
      if (!row.isConnected) return;
      const dy = top - row.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 320, easing: ease });
    });
  });
  mo.observe(root, { childList: true, subtree: true });
  window.setTimeout(() => mo.disconnect(), 2500);
}

/** A row that stayed (the caller kept the item) must never stay invisible. */
function cleanupLater(els: HTMLElement[], ms = 1000): void {
  window.setTimeout(() => {
    els.forEach((el) => {
      if (!el.isConnected) return;
      el.classList.remove("dk-done-now", "dk-leave", "dk-enter", "dk-land");
      el.querySelector(":scope > .dk-done-mark")?.remove();
    });
  }, ms);
}

const SVG = "http://www.w3.org/2000/svg";
/** The halftone stamp (DeskStamp's markup), laid over the row while it lands. */
function addMark(row: HTMLElement): void {
  if (row.querySelector(":scope > .dk-done-mark")) return;
  const mark = document.createElement("span");
  mark.className = "dk-done-mark";
  mark.setAttribute("aria-hidden", "true");
  const big = row.matches(".dk-draft:not(.mini)");
  const stamp = document.createElement("span");
  stamp.className = big ? "tx-host dk-stamp big" : "tx-host dk-stamp";
  const dots = document.createElement("i");
  dots.className = "tx tx-halftone";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "dk-tick");
  svg.setAttribute("viewBox", "0 0 16 16");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M3 8.5l3.2 3.2L13 4.8");
  svg.append(path);
  stamp.append(dots, svg);
  mark.append(stamp);
  row.append(mark);
}

export type DeskFx = { done: () => Promise<void> };

/** Call in the click handler, before any await. `done()` after the server said yes. */
export function deskFx(id: string): DeskFx {
  const row = findRow(id);
  return {
    async done() {
      pulseDone();
      if (!row || !row.isConnected || reducedMotion()) return;
      addMark(row);
      row.classList.add("dk-done-now");
      await wait(FX_MS.stamp);
      row.classList.add("dk-leave");
      await wait(FX_MS.leave);
      flipWhenGone([row], rootOf(row));
      cleanupLater([row]);
    },
  };
}

/** Slide rows out, then `then()` (which drops them). Instant under reduced motion. */
export function leaveRows(rows: HTMLElement[], then: () => void): void {
  const live = rows.filter((r) => r.isConnected);
  if (live.length === 0 || reducedMotion()) return then();
  live.forEach((r) => r.classList.add("dk-leave"));
  window.setTimeout(() => {
    flipWhenGone(live, rootOf(live[0]));
    then();
    cleanupLater(live);
  }, FX_MS.leave);
}

/** The rows `ids` names, or the row (or, for `all`, every row) around what was clicked. */
export function rowsFor(ids: readonly string[], all: boolean, at: Element | null = clicked()): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const byId = ids.map((id) => findRow(id, null)).filter((r): r is HTMLElement => !!r && r.matches("[data-dk-id]"));
  if (byId.length > 0 || !at) return byId;
  if (!all) {
    const one = outermost(at);
    return one ? [one] : [];
  }
  // Clear all takes only the rows that carry a × (never a Ready card in the same panel).
  return rowsIn(rootOf(at)).filter((r) => !r.contains(at) && !!r.querySelector(".dk-clear, .otp-saw-x"));
}

/** Rows that appear in `root` within `ms` (at most `max`, so a re-render isn't taken for news) rise in. */
export function riseNew(root: Element | null, opts: { ms?: number; max?: number } = {}): void {
  if (!root || reducedMotion()) return;
  const seen = new Set(rowsIn(root));
  const mo = new MutationObserver(() => {
    const fresh = rowsIn(root).filter((r) => !seen.has(r));
    if (fresh.length === 0) return;
    mo.disconnect();
    if (fresh.length > (opts.max ?? 3)) return;
    fresh.forEach((r) => r.classList.add("dk-enter"));
    cleanupLater(fresh, FX_MS.enter + 80);
  });
  mo.observe(root, { childList: true, subtree: true });
  window.setTimeout(() => mo.disconnect(), opts.ms ?? 4000);
}

/** One rise (and, with `land`, the stamp landing) on the rows carrying these ids. */
export function enterIds(ids: readonly string[], land = false): void {
  if (typeof document === "undefined" || reducedMotion()) return;
  const rows = ids.map((id) => document.querySelector<HTMLElement>(`[data-dk-id="${CSS.escape(id)}"]`)).filter((r): r is HTMLElement => !!r);
  rows.forEach((r) => r.classList.add("dk-enter", ...(land ? ["dk-land"] : [])));
  cleanupLater(rows, FX_MS.stamp + 120);
}

/** A soft pop (dk-pop) on `el`, once. */
export function pop(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  el.classList.remove("dk-pop");
  void (el as HTMLElement).offsetWidth; // restart the animation on a second pop
  el.classList.add("dk-pop");
  window.setTimeout(() => el.classList.remove("dk-pop"), 500);
}

// ── Planet's "done" moment ─────────────────────────────────────────────────

let doneNow = false;
let lastDoneAt = 0;
let doneTimer: number | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

/** Planet in the sky goes "done" for ~1.2 s. */
export function pulseDone(): void {
  lastDoneAt = Date.now();
  doneNow = true;
  emit();
  window.clearTimeout(doneTimer);
  doneTimer = window.setTimeout(() => {
    doneNow = false;
    emit();
  }, FX_MS.done);
}

/** True for a few seconds after a success (a Done row mounting then is the new one). */
export function justDone(ms = 4000): boolean {
  return lastDoneAt > 0 && Date.now() - lastDoneAt < ms;
}

export function useDeskDone(): boolean {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => doneNow,
    () => false,
  );
}

// ── Clearing (useUndoClear) ────────────────────────────────────────────────

setClearMotion({
  leave(deskIds, all, then) {
    const rows = rowsFor(deskIds, all);
    const root = rows[0] ? rootOf(rows[0]) : null;
    leaveRows(rows, () => then(root));
  },
  restored(root) {
    riseNew(root, { ms: 1500, max: 60 });
  },
});
