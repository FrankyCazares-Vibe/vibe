"use client";

import { useEffect, useRef } from "react";

import { createLayerStack, type LayerStack, type PopKind } from "./layer-stack";

/**
 * One history entry per sheet on the new chat's screens (S71 amendment 3, A =
 * audit F06; handoffs/chat-redesign/wave-2-contracts.md 2.3, 17.1 row 11,
 * 17.5 item 19): Back — the browser's, Android's hardware button (it falls
 * through to `history.back()`, `NativeBridge.tsx`), the iPhone's edge swipe —
 * closes the sheet and nothing else; the next Back closes the event chat,
 * then the space, then the home is left.
 *
 * The rules live in `layer-stack.ts` (no DOM, tested there). This file gives
 * it the page: ONE stack per page (module level, so the two existing
 * `popstate` owners can ask it about a pop), `window.history` through Next's
 * patched `pushState` (it copies `__NA` and the router tree onto the entry;
 * a pop onto an entry without them reloads the page) and, with no URL
 * argument, no router work: a sheet never changes the address.
 *
 * - `useLayerHistory(open, onPop, canPop?)`: every sheet, the "+" tray and
 *   the remove confirm. `open` true → the entry is pushed. The layer closing
 *   by its own control (`open` false, or the component unmounting) → one
 *   `history.back()` at the end of the tick, while the entry is still the
 *   live one; a layer that opens in the same commit (the tray's pick) takes
 *   the entry over instead, so there is no step back and no second push.
 *   Back → `onPop()` (set your own state closed; never call history from
 *   it). While `canPop()` is false (a card is posting) Back is answered by a
 *   step forward onto the same entry.
 * - `isLayerPop(event)`: for `MessagesMobile` (depth 1) and `ClubSpace`
 *   (depth 2). True = this pop was a sheet closing: do nothing.
 * - `clearLayersThen(fn)`: every room-level history write or `history.back()`
 *   of those two owners goes through it, so a sheet on top is closed first
 *   and no entry of it is left to eat a later Back. Nothing open → `fn()` at
 *   once.
 * - `clearLayersInto(write)`: the owner that puts its own entry on top of
 *   the room (the event chat opened with the tray up). `write("replace")`:
 *   the tray's entry is the live one and becomes the owner's by
 *   `replaceState`; `write("push")`: no sheet entry is there, push as usual.
 * - `adoptLayerEntry()`: the shell's mount. True when the live entry was a
 *   sheet's with no sheet (a reload; back from a page reached with the tray
 *   open): a step back is on its way and the shell re-opens the room when it
 *   lands (`isLayerPop` false on that landing).
 *
 * Nothing here runs unless a flag-ON screen calls it: importing the file has
 * no effect, and the stack and its listener are made on the first call.
 */

let stack: LayerStack | null = null;
let lastEvent: PopStateEvent | null = null;
let lastKind: PopKind = "other";

function layerStack(): LayerStack | null {
  if (typeof window === "undefined") return null;
  if (stack) return stack;
  stack = createLayerStack({
    state: () => {
      try {
        return window.history.state as unknown;
      } catch {
        return null;
      }
    },
    push: (state) => window.history.pushState(state, ""),
    go: (delta) => window.history.go(delta),
    later: (fn) => {
      window.setTimeout(fn, 0);
    },
    timer: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
  });
  // The stack sees every pop even when no owner asks about it.
  window.addEventListener("popstate", (e) => {
    popKind(e);
  });
  return stack;
}

/** One answer per event, whoever asks first (the listeners' order does not matter). */
function popKind(e: PopStateEvent): PopKind {
  if (e === lastEvent) return lastKind;
  const s = layerStack();
  lastEvent = e;
  lastKind = s ? s.handlePop(e.state) : "other";
  return lastKind;
}

/** True when this `popstate` was a sheet closing: the room owners do nothing. */
export function isLayerPop(e: PopStateEvent): boolean {
  return popKind(e) === "layer";
}

/** Close every sheet on top (state and history entries), then run `fn`; at once when none is open. */
export function clearLayersThen(fn: () => void): void {
  const s = layerStack();
  if (s) s.clearThen(fn);
  else fn();
}

/**
 * Close every sheet on top, then let the owner write its own entry: by
 * `replaceState` over the sheet's entry when one is the live one
 * (`"replace"`), by `pushState` when none is (`"push"`). Never a step back
 * followed by a push (Chrome would mark the entries below as skippable for
 * its Back button; `layer-stack.ts`).
 */
export function clearLayersInto(write: (mode: "push" | "replace") => void): void {
  const s = layerStack();
  if (s) s.clearInto(write);
  else write("push");
}

/** On the shell's mount: true when a leftover sheet entry is being stepped off (the landing re-opens the room). */
export function adoptLayerEntry(): boolean {
  return layerStack()?.adopt() ?? false;
}

export function useLayerHistory(open: boolean, onPop: () => void, canPop?: () => boolean): void {
  // The latest callbacks, so an inline arrow never re-pushes the entry.
  const onPopRef = useRef(onPop);
  const canPopRef = useRef(canPop);
  useEffect(() => {
    onPopRef.current = onPop;
    canPopRef.current = canPop;
  }, [onPop, canPop]);

  useEffect(() => {
    if (!open) return;
    const s = layerStack();
    if (!s) return;
    const id = s.open({
      onPop: () => onPopRef.current(),
      canPop: () => canPopRef.current?.() ?? true,
    });
    return () => s.close(id);
  }, [open]);
}
