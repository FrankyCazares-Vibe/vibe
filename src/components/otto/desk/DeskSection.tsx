"use client";

import "../kit/sky.css";
import "../kit/desk.css";
import "./desk-lists.css";
import "./desk-fold-motion.css";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { prefersReducedMotion } from "@/components/otto/otto-motion";
import { fewOf, readFolds, writeFold } from "@/lib/otto/desk-lists";
import type { UndoToast } from "@/lib/otto/clear-notifications";
import type { DeskItem } from "@/lib/otto/desk";

import { DeskEmpty } from "./DeskEmpty";

/**
 * A desk section (Nov 10, 2026, the Otto build's Wave 2A; board D1 "dk-sec"):
 * a heading with its count, then the pile. With `count` 0 and an `empty`
 * line, the pile is Otto's empty line instead of `children`.
 *
 * Polish 1 (Nov 11, Franky's walk): with `foldKey` the heading is a real
 * button (aria-expanded) that folds the pile, remembered on this device;
 * `tools` sit at the heading's end while it is open (the time picker, Clear
 * all); `more` (from `useFew`) adds "Show all N" under the pile.
 *
 * `DeskList` is the paper card rows sit in (dk-card list), flat since polish 1.
 * `DeskClearToast` is "Cleared. Undo" for useUndoClear.
 */

// ── Folds, remembered on this device ─────────────────────────────────────────

const foldSubs = new Set<() => void>();
let foldSnap: Record<string, true> | null = null;
const NO_FOLDS: Record<string, true> = {};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function folds(): Record<string, true> {
  foldSnap ??= readFolds(storage());
  return foldSnap;
}
function subscribeFolds(fn: () => void) {
  foldSubs.add(fn);
  return () => foldSubs.delete(fn);
}

/** Whether a section is folded, and a setter that remembers it. Server and first paint: open. */
export function useDeskFold(key: string | undefined): [boolean, (folded: boolean) => void] {
  const map = useSyncExternalStore(subscribeFolds, folds, () => NO_FOLDS);
  const set = (folded: boolean) => {
    if (!key) return;
    foldSnap = writeFold(storage(), key, folded);
    foldSubs.forEach((fn) => fn());
  };
  return [key ? map[key] === true : false, set];
}

// ── Show all ─────────────────────────────────────────────────────────────────

export type DeskMore = { count: number; all: boolean; onToggle: () => void };

/** The rows to draw, and the "Show all" control's state (null when the list is short). */
export function useFew<T>(items: readonly T[], few: number): { shown: readonly T[]; more: DeskMore | null } {
  const [all, setAll] = useState(false);
  const { shown } = fewOf(items, few, all);
  const extra = fewOf(items, few, false).more;
  return { shown, more: extra > 0 ? { count: items.length, all, onToggle: () => setAll((a) => !a) } : null };
}

// ── The section ──────────────────────────────────────────────────────────────

export type DeskSectionProps = {
  title: string;
  count: number;
  /** Otto's lowercase line for an empty pile (desk.empty.*). */
  empty?: string;
  /** Heading level: 2 on the desk pages (default), 3 when nested. */
  level?: 2 | 3;
  className?: string;
  id?: string;
  /** Makes the heading a fold button; the key remembers it on this device ("ready", "saw"…). */
  foldKey?: string;
  /** Small controls at the heading's end, shown while the section is open. */
  tools?: ReactNode;
  /** From useFew: "Show all N" / "Show fewer" under the pile. */
  more?: DeskMore | null;
  /** A quiet control at the pile's foot, across from Show all ("Clear all"). */
  foot?: ReactNode;
  children?: ReactNode;
};

/** How long folding rows take to fade out before the pile closes (desk-fold-motion.css dk-fold-out). */
const FOLD_OUT_MS = 140;
/** The unfold's rise with its stagger, after which the pile drops data-fold. */
const FOLD_IN_MS = 520;

const Chevron = () => (
  <svg className="dk-ico dk-fold-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function DeskSection({ title, count, empty, level = 2, className, id, foldKey, tools, more, foot, children }: DeskSectionProps) {
  const headingId = useId();
  const pileId = useId();
  const [folded, setFolded] = useDeskFold(foldKey);
  const H = level === 3 ? "h3" : "h2";
  const showEmpty = count === 0 && empty;

  // Motion 1 (Nov 12): unfolding, the rows fade and rise in a beat after one
  // another; folding, they fade up and out quickly, then the pile closes.
  // No height moves (desk-fold-motion.css). Reduce motion: it just opens and closes.
  const [fold, setFold] = useState<"in" | "out" | null>(null);
  const foldTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(foldTimer.current), []);
  const toggleFold = () => {
    window.clearTimeout(foldTimer.current);
    if (folded) {
      setFold("in");
      setFolded(false);
      // Then the rows are just rows again (a row leaving after Accept plays its own motion).
      foldTimer.current = window.setTimeout(() => setFold(null), FOLD_IN_MS);
    } else if (fold === "out") {
      setFold(null);
    } else if (prefersReducedMotion()) {
      setFold(null);
      setFolded(true);
    } else {
      setFold("out");
      foldTimer.current = window.setTimeout(() => {
        setFold(null);
        setFolded(true);
      }, FOLD_OUT_MS);
    }
  };
  return (
    <section id={id} className={className} aria-labelledby={headingId}>
      <div className={foldKey ? "dk-sec dk-sec-fold" : "dk-sec"}>
        {foldKey ? (
          <H id={headingId}>
            <button
              type="button"
              className="dk-fold"
              aria-expanded={!folded && fold !== "out"}
              aria-controls={pileId}
              onClick={toggleFold}
            >
              <span>{title}</span>
              <b>{count}</b>
              <Chevron />
            </button>
          </H>
        ) : (
          <>
            <H id={headingId}>{title}</H>
            <b>{count}</b>
          </>
        )}
        {tools && !folded ? <div className="dk-sec-tools">{tools}</div> : null}
      </div>
      <div id={pileId} className="dk-pile" hidden={folded} data-fold={fold ?? undefined}>
        {showEmpty ? <DeskEmpty line={empty} /> : children}
        {(more || foot) && !showEmpty ? (
          <div className="dk-pile-foot">
            {more ? (
              <button type="button" className="dk-more" aria-controls={pileId} onClick={more.onToggle}>
                {more.all ? "Show fewer" : `Show all ${more.count}`}
              </button>
            ) : null}
            {foot}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The paper card desk rows sit in: flat paper since polish 1 (no grain). */
export function DeskList({ children }: { children: ReactNode }) {
  return <div className="dk-card list">{children}</div>;
}

/**
 * "Cleared. Undo" (useUndoClear's toast; "Cleared 3." / "Cleared all." as the
 * batch grows), or the line for a clear that didn't go through. `slotClass`
 * places it (the side panel keeps it inside the panel, by the × pressed). Ink, never coral; it never takes focus unless the control the
 * person pressed went away with the row (then Undo is the next stop).
 */
export function DeskClearToast({ toast, onUndo, slotClass }: { toast: UndoToast; onUndo: () => void; slotClass?: string }) {
  const undo = useRef<HTMLButtonElement>(null);
  const key = toast?.key;
  const kind = toast?.kind;
  useEffect(() => {
    if (kind !== "cleared") return;
    const raf = requestAnimationFrame(() => {
      const at = document.activeElement;
      if (!at || at === document.body || !at.isConnected) undo.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [key, kind]);
  return (
    <div className={slotClass ?? "dk-toast-slot"} role="status" aria-live="polite">
      {toast?.kind === "cleared" ? (
        <div className="dk-toast" key={toast.key}>
          <span>{toast.all ? "Cleared all." : toast.count > 1 ? `Cleared ${toast.count.toLocaleString("en-US")}.` : "Cleared."}</span>
          <button ref={undo} type="button" className="dk-toast-undo" onClick={onUndo}>
            Undo
          </button>
        </div>
      ) : toast?.kind === "failed" ? (
        <div className="dk-toast" key={toast.key}>
          <span>That didn&rsquo;t clear. It&rsquo;s back on your list.</span>
        </div>
      ) : null}
    </div>
  );
}

/** The × on an Otto saw row: clears it (Undo for ~5 s). Drawn ~28px, a 44px target. */
export function DeskClearButton({ item, onClear }: { item: DeskItem; onClear: (item: DeskItem) => void }) {
  return (
    <button type="button" className="dk-clear" aria-label={`Clear: ${item.title}`} onClick={() => onClear(item)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </button>
  );
}
