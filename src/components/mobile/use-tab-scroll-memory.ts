"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { readScrollMemory, scrollMemoryKey, writeScrollMemory } from "./tab-scroll-memory";

export type TabScrollMemoryOptions = {
  /** Where a tab that was never read opens: the top unless the page says otherwise. */
  defaultTop?: () => number;
  /** Put the open tab back at its saved place when the page mounts (default
   *  true). Off when the address opened the page for something else (a #tag,
   *  an event, a post, a chat). Read once, at mount. */
  restoreOnMount?: boolean;
};

/** How long a restore waits for the page to grow tall enough. */
const MOUNT_WAIT_MS = 2500;
const SWITCH_WAIT_MS = 600;

/**
 * Each tab of a swipeable phone page keeps its own place (Franky, Oct 18
 * 2026). The panes sit side by side under ONE page scroll, so a Feed read
 * 3,000px down used to leave Orgs at 3,000px too: past the end of its
 * short list, a blank screen. Now the page remembers where each tab was,
 * puts a tab back there when it comes on screen (the top the first time),
 * and keeps the numbers for the browser tab's session, so coming back to
 * the page from a post or a profile lands on the same spot.
 *
 * A change of `pageKey` inside a mount (another campus) switches maps but
 * restores nothing: the page that changed it puts the scroll where it wants.
 * The third argument is `defaultTop` alone, or the options.
 */
export function useTabScrollMemory<T extends string>(
  tab: T,
  pageKey: string,
  options?: (() => number) | TabScrollMemoryOptions,
) {
  const opts = typeof options === "function" ? { defaultTop: options } : (options ?? {});
  const key = scrollMemoryKey(pageKey);
  const [mem] = useState(() => createMemory(key, tab, opts.restoreOnMount !== false));
  const defaultTopRef = useRef(opts.defaultTop);
  const defaultTop = opts.defaultTop;

  // Declared in this order on purpose: same-component layout effects run in
  // order, so a commit that changes both the key and the tab restores the
  // tab from the new key's map, with the newest defaultTop.
  useLayoutEffect(() => {
    mem.setKey(key);
    defaultTopRef.current = defaultTop;
  });
  useLayoutEffect(() => mem.mount(), [mem]);
  // Before paint, so the new pane never shows a frame at the old depth.
  useLayoutEffect(() => {
    mem.show(tab, () => defaultTopRef.current?.());
  }, [mem, tab]);
  useEffect(() => mem.listen(), [mem]);
  useEffect(() => mem.restoreOnMount(), [mem]);
}

function createMemory(firstKey: string, firstTab: string, restoreAtMount: boolean) {
  let key = firstKey;
  let tab = firstTab;
  let cache: { key: string; map: Record<string, number> } | null = null;
  // A restore waiting for the page to grow. While it waits, nothing saves
  // the tab: a place clamped by a short page is not where the person was.
  let pending: { tab: string; stop: () => void } | null = null;
  let alive = true;

  // Each key's map is read from storage the first time it is used, so
  // another campus never borrows this one's numbers.
  const map = () => {
    if (cache?.key !== key) cache = { key, map: readScrollMemory(key) };
    return cache.map;
  };
  const save = () => {
    const m = map();
    m[tab] = Math.max(0, Math.round(window.scrollY));
    writeScrollMemory(key, m);
  };

  // Puts the page at `top` once it is tall enough. Stops on the person's own
  // touch or wheel, another tab, a scroll that isn't ours and isn't a clamp
  // at the bottom (an event card scrolled into view), or after `ms`.
  const waitFor = (forTab: string, top: number, ms: number) => {
    pending?.stop();
    let frame = 0;
    let last = window.scrollY;
    const started = Date.now();
    // Frames stop in a page that's out of sight (the app sent to the back
    // mid-wait), and saving is paused while a wait runs: a timer ends it
    // even then, so a stalled wait never stops the page remembering.
    let timer = 0;
    const job = {
      tab: forTab,
      stop: () => {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        if (timer) window.clearTimeout(timer);
        timer = 0;
        window.removeEventListener("touchstart", job.stop);
        window.removeEventListener("wheel", job.stop);
        if (pending === job) pending = null;
      },
    };
    pending = job;
    timer = window.setTimeout(job.stop, ms + 50);
    window.addEventListener("touchstart", job.stop, { passive: true });
    window.addEventListener("wheel", job.stop, { passive: true });
    const step = () => {
      frame = 0;
      if (pending !== job || tab !== forTab) return job.stop();
      const room = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      if (Math.abs(y - last) > 1 && y < room - 1) return job.stop();
      last = y;
      if (room >= top - 1) {
        job.stop();
        window.scrollTo({ top, behavior: "instant" });
        return;
      }
      if (Date.now() - started >= ms) return job.stop();
      frame = window.requestAnimationFrame(step);
    };
    step();
  };

  return {
    setKey(next: string) {
      key = next;
    },
    /** Leaving the page saves the open tab's place now, in the layout phase,
     *  before the next page resets or clamps the scroll (a later scroll event
     *  would store the new page's top). */
    mount() {
      alive = true;
      return () => {
        alive = false;
        if (!pending) save();
      };
    },
    /** Every scroll is the open tab's place. Written on the next frame, once. */
    listen() {
      let frame = 0;
      const onScroll = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (alive && !pending) save();
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    /** A tab came on screen: the old one's place is already saved by the
     *  listener, so only the new one's needs putting back. A page too short
     *  for it (a pane still loading, a pager not yet fitted) waits a moment. */
    show(next: string, defaultTop: () => number | undefined) {
      if (next === tab) return;
      tab = next;
      pending?.stop();
      const top = map()[next] ?? defaultTop() ?? 0;
      window.scrollTo({ top, behavior: "instant" });
      if (Math.abs(window.scrollY - top) > 1) waitFor(next, top, SWITCH_WAIT_MS);
    },
    /** Coming back to the page: the lists load after mount, so the page may
     *  be too short for the saved place at first. */
    restoreOnMount() {
      if (!restoreAtMount) return;
      const saved = map()[tab];
      if (!saved) return;
      waitFor(tab, saved, MOUNT_WAIT_MS);
      return () => pending?.stop();
    },
  };
}
