"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Clear with Undo (Otto polish, Nov 11, 2026; Franky: "maybe people also want
 * to clear notifications and stuff to clean up their things"). The × on an
 * Otto saw row and "Clear all" hide the rows at once and show "Cleared. Undo"
 * for ~5 s; only when that runs out does `clearNotifications` delete them for
 * good (DELETE /api/me/notifications, the caller's own rows only). Undo in
 * those 5 s puts them back and nothing is sent. Leaving the page sends what is
 * waiting at once (keepalive), since the toast already said "Cleared".
 *
 * `createUndoClear` is the plain core (tested under node --test);
 * `useUndoClear` is the React hook the desk and the side panel share.
 * Ids here are notification ids; a desk row's id is `notification:<id>`
 * (`noticeIdOf`).
 */

/**
 * `{ all: true, before }` clears every notification created at or before
 * `before` (the newest row the list loaded, ISO), so Clear all never takes a
 * row that arrived after the list was drawn or during the Undo window
 * (review, Nov 11: "Clear all deletes more than the person saw").
 */
export type ClearArg = { ids: string[] } | { all: true; before: string };

/** The newest of these ISO times (a list's `whenISO`s), or null when none parses. */
export function newestISO(isos: readonly (string | undefined | null)[]): string | null {
  let best = -Infinity;
  let out: string | null = null;
  for (const iso of isos) {
    const at = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(at) && at > best) {
      best = at;
      out = new Date(at).toISOString();
    }
  }
  return out;
}

/**
 * What Clear all sends for a list: everything up to its newest loaded row,
 * or (no row has a time) just the ids shown.
 */
export function clearAllArg(loaded: readonly { whenISO?: string }[], shownIds: string[]): ClearArg {
  const before = newestISO(loaded.map((i) => i.whenISO));
  return before ? { all: true, before } : { ids: shownIds };
}

/** How long the Undo stays before the delete is sent. */
export const UNDO_MS = 5000;

const NOTICE_PREFIX = "notification:";

/** A desk row's notification id, or null when the row isn't a notification. */
export function noticeIdOf(deskItemId: string): string | null {
  return deskItemId.startsWith(NOTICE_PREFIX) ? deskItemId.slice(NOTICE_PREFIX.length) || null : null;
}

/** Delete the person's own notifications for good. True when the server said ok. */
export async function clearNotifications(arg: ClearArg, opts: { keepalive?: boolean } = {}): Promise<boolean> {
  const all = "all" in arg && arg.all === true;
  const ids = all ? [] : (arg as { ids: string[] }).ids;
  if (!all && ids.length === 0) return true;
  const body = all ? { all: true, before: (arg as { before: string }).before } : { ids };
  try {
    const res = await fetch("/api/me/notifications", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      keepalive: opts.keepalive === true,
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return json?.ok === true;
  } catch {
    return false;
  }
}

// ── The core ────────────────────────────────────────────────────────────────

/** `all`: the batch holds a Clear all ("Cleared all."). */
export type UndoToast = { kind: "cleared"; count: number; all: boolean; key: number } | { kind: "failed"; key: number } | null;
export type UndoSnapshot = { hidden: ReadonlySet<string>; toast: UndoToast };

export type UndoClearDeps = {
  delayMs?: number;
  send?: (arg: ClearArg, opts: { keepalive?: boolean }) => Promise<boolean>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** After a delete the server took (the caller may refresh its counts). */
  onCommitted?: (arg: ClearArg) => void;
};

export type UndoClear = {
  subscribe: (fn: () => void) => () => void;
  getSnapshot: () => UndoSnapshot;
  /** Hide now, delete after the Undo window. `shown` = the ids on screen (what Clear all hides). */
  clear: (arg: ClearArg, shown?: readonly string[]) => void;
  /** Put back everything still waiting; nothing is sent. */
  undo: () => void;
  /** Send what is waiting now (leaving the page). */
  flush: (keepalive?: boolean) => void;
  /** Close the toast without undoing. */
  dismiss: () => void;
  /** Swap the after-delete callback (the hook keeps it current). */
  setOnCommitted: (fn: ((arg: ClearArg) => void) | undefined) => void;
};

export function createUndoClear(deps: UndoClearDeps = {}): UndoClear {
  const delay = deps.delayMs ?? UNDO_MS;
  const send = deps.send ?? clearNotifications;
  const setT = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let snap: UndoSnapshot = { hidden: new Set(), toast: null };
  // `ids` = every row this batch hides; `picked` = the ids cleared one by one
  // (sent as ids); `before` = a Clear all's cutoff (sent as { all, before }).
  let pending: { ids: Set<string>; picked: Set<string>; before: string | null } | null = null;
  let timer: unknown = null;
  let toastTimer: unknown = null;
  let key = 0;
  // A delete failed while a newer batch was still waiting: its "Cleared. Undo"
  // stays up, and the failure line shows once that batch is sent or undone.
  let owedFail = false;
  let onCommitted = deps.onCommitted;
  const subs = new Set<() => void>();
  const emit = (next: Partial<UndoSnapshot>) => {
    snap = { ...snap, ...next };
    subs.forEach((fn) => fn());
  };
  const stop = (h: unknown) => {
    if (h !== null) clearT(h);
  };
  const showFailed = (hidden?: Set<string>) => {
    owedFail = false;
    key += 1;
    emit({ ...(hidden ? { hidden } : {}), toast: { kind: "failed", key } });
    stop(toastTimer);
    toastTimer = setT(() => {
      toastTimer = null;
      if (snap.toast?.kind === "failed") emit({ toast: null });
    }, delay);
  };
  /** The "cleared" toast is done (sent or undone): show a failure owed, or nothing. */
  const closeCleared = () => {
    if (owedFail) showFailed();
    else if (snap.toast?.kind === "cleared") emit({ toast: null });
  };

  function commit(keepalive = false) {
    stop(timer);
    timer = null;
    const batch = pending;
    pending = null;
    if (!batch) return;
    closeCleared();
    const args: ClearArg[] = [];
    if (batch.before) args.push({ all: true, before: batch.before });
    if (batch.picked.size > 0) args.push({ ids: [...batch.picked] });
    void Promise.all(args.map((arg) => send(arg, { keepalive }).then((ok) => (ok && onCommitted?.(arg), ok)))).then(
      (oks) => {
        if (oks.every(Boolean)) return;
        // The delete didn't go through: the rows come back, and the toast says so.
        const hidden = new Set(snap.hidden);
        batch.ids.forEach((id) => hidden.delete(id));
        if (pending) {
          owedFail = true;
          emit({ hidden });
        } else showFailed(hidden);
      },
    );
  }

  return {
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    getSnapshot: () => snap,
    clear(arg, shown = []) {
      const all = "all" in arg && arg.all === true;
      const ids = all ? shown : (arg as { ids: string[] }).ids;
      const fresh = ids.filter((id) => !snap.hidden.has(id));
      if (!all && fresh.length === 0) return;
      pending ??= { ids: new Set(), picked: new Set(), before: null };
      const p = pending;
      fresh.forEach((id) => p.ids.add(id));
      if (all) {
        const before = (arg as { before: string }).before;
        p.before = p.before && Date.parse(p.before) > Date.parse(before) ? p.before : before;
      } else fresh.forEach((id) => p.picked.add(id));
      const hidden = new Set(snap.hidden);
      fresh.forEach((id) => hidden.add(id));
      stop(toastTimer);
      toastTimer = null;
      key += 1;
      emit({ hidden, toast: { kind: "cleared", count: p.ids.size, all: p.before !== null, key } });
      stop(timer);
      timer = setT(() => commit(false), delay);
    },
    undo() {
      stop(timer);
      timer = null;
      const batch = pending;
      pending = null;
      const hidden = new Set(snap.hidden);
      batch?.ids.forEach((id) => hidden.delete(id));
      emit({ hidden });
      if (owedFail) showFailed();
      else emit({ toast: null });
    },
    flush(keepalive = true) {
      commit(keepalive);
    },
    dismiss() {
      if (snap.toast?.kind === "cleared") commit(false);
      else emit({ toast: null });
    },
    setOnCommitted(fn) {
      onCommitted = fn;
    },
  };
}

// ── The hook ────────────────────────────────────────────────────────────────

/**
 * How cleared rows move (motion 1, Nov 12): src/lib/motion/feedback.ts sets
 * this when it loads (the desk hooks load it), so this file stays plain under
 * node --test. Unset, a clear is instant. `leave` slides the rows of these
 * desk ids out (or the one clicked), then calls `then` with their list;
 * `restored` makes Undo's rows rise back into that list.
 */
export type ClearMotion = {
  leave: (deskIds: string[], all: boolean, then: (root: Element | null) => void) => void;
  restored: (root: Element | null) => void;
};
let clearMotion: ClearMotion | null = null;
export function setClearMotion(m: ClearMotion | null): void {
  clearMotion = m;
}

const SERVER_SNAPSHOT: UndoSnapshot = { hidden: new Set(), toast: null };

/**
 * One Undo queue for a list of notifications. `hidden` holds the ids to leave
 * out (waiting or cleared); render `toast` as "Cleared. Undo" (or the failure
 * line). The queue sends what is waiting when the component goes away or the
 * page is hidden.
 */
export function useUndoClear(opts: { onCommitted?: (arg: ClearArg) => void; delayMs?: number } = {}) {
  const [store] = useState(() => createUndoClear({ delayMs: opts.delayMs }));
  // The latest onCommitted, read only when a delete lands (never during render).
  const onCommitted = opts.onCommitted;
  useEffect(() => store.setOnCommitted(onCommitted), [store, onCommitted]);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    const onHide = () => store.flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      store.flush(true);
    };
  }, [store]);
  // Motion 1 (Nov 12): cleared rows fade and slide out before they hide, and
  // Undo's rows rise back in, when the page has the motion (ClearMotion).
  const listRoot = useRef<Element | null>(null);
  const clear = useCallback(
    (arg: ClearArg, shown?: readonly string[]) => {
      if (!clearMotion) return store.clear(arg, shown);
      const all = "all" in arg && arg.all === true;
      const ids = (all ? (shown ?? []) : (arg as { ids: string[] }).ids).map((id) => `${NOTICE_PREFIX}${id}`);
      clearMotion.leave(ids, all, (root) => {
        if (root) listRoot.current = root;
        store.clear(arg, shown);
      });
    },
    [store],
  );
  const undo = useCallback(() => {
    clearMotion?.restored(listRoot.current);
    store.undo();
  }, [store]);
  return {
    hidden: snap.hidden,
    toast: snap.toast,
    isHidden: (id: string) => snap.hidden.has(id),
    clear,
    undo,
    dismiss: store.dismiss,
  };
}
