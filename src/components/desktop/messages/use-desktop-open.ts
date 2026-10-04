"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { asLoadFailure } from "@/components/feedback/LoadFailed";
import { type HomeFilter, homeUrl, parseHomeFilter } from "@/components/mobile/messages/home/home-rules";
import { channelOfEntry, SETTLE_MS } from "@/lib/chat/layer-stack";
import type { RoomKind, ThreadMessagesResponse } from "@/lib/chat/types";
import { adoptLayerEntry, clearLayersInto, clearLayersThen, isLayerPop } from "@/lib/chat/use-layer-history";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { desktopLayerOpen } from "./DesktopDialog";
import { chatEntry, type KnownChat } from "./desktop-rules";

/**
 * What is open on desktop Messages, and its address and history
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 3.5; W3-4-shell). The
 * twin of the phone's `MessagesMobileV2` driver, on the same tested helpers
 * (`layer-stack.ts`, `use-layer-history.ts`); no phone file is shared.
 *
 * The address is the truth: `/messages?channel=<id>` with the entry state
 * `{ vibeChat: <id>, depth: 1 }` (the phone's shape, `chatEntry`), or
 * `/messages[?tab=<filter>]` for the home. Every write goes through the TOP
 * window's patched `window.history` and through `clearLayersThen` /
 * `clearLayersInto`, so a dialog or popover still open (each has its own
 * entry) is closed first. Never the router: it would run the server page
 * again on every click. `useSearchParams` is read for one thing only: to
 * hear a move of the address that Next made by itself (rule 5).
 *
 * Nothing is written, opened or toasted once the shell is gone (`onPage`,
 * the phone's `onThisPage`): a read or a POST still out when the person
 * left for another page, or dragged the window under 900px, answers into a
 * dead instance while another tree owns the entry.
 *
 * The ten rules (3.5), by number:
 *  1. Mount. A leftover layer entry is stepped off first (`adoptLayerEntry`;
 *     its landing is a `popstate`, rule 5). Else the LIVE entry says what is
 *     open; the server prop only when the address cannot be read. An id is
 *     opened by what the lists already say (`known`), else by one thread
 *     read; then the entry the browser already holds becomes the chat's
 *     (`replaceState`). `homeBelow` = false.
 *  2. Home -> a chat. `clearLayersInto`: a push, or a replace when a layer's
 *     entry (the month popover, the New dialog) sat on the home's and has
 *     just become the chat's. Either way the home is underneath:
 *     `homeBelow` = true.
 *  3. A chat -> another chat, or a room chip: `replaceState`. Depth 1 always.
 *  4. The Messages control. Home underneath: `history.back()`, and if no
 *     `popstate` comes within 600 ms, the write below. Else the entry
 *     becomes the home's in place. Never a step back followed by a new entry.
 *  5. `popstate`. A layer closing is not ours. Off `/messages`: not ours.
 *     No id: the home. Another id: opened with no history write. The same
 *     for a move no `popstate` tells of: a Next link to `/messages` followed
 *     while the shell is up (the left nav's Messages) keeps this page, so
 *     the address is also compared with what is open whenever Next's own
 *     copy of the query changes.
 *  6. A filter at home: `replaceState` to `homeUrl(filter)`.
 *  7. `?to=<handle>` is resolved by the shell (it needs the lists). Its part
 *     here: while the home's address still carries `to`, opening a chat
 *     takes that entry over (rule 3's write), so `to` leaves the address and
 *     nothing is underneath.
 *  8. Deep link, refresh, Back and Forward are rules 1 and 5; server props
 *     are never read after mount.
 *  9. Esc: one `keydown` listener on the top window (below).
 * 10. The frame adds nothing to history (the page's side, 5.2 item 11), so
 *     rule 4's `history.back()` always lands on an entry of ours.
 */

export type DesktopOpen =
  | { kind: "home" }
  | { kind: "resolving"; id: string }
  | { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind | null; initialPage: ThreadMessagesResponse | null }
  | { kind: "dm"; threadId: string };

export type DesktopOpenApi = {
  open: DesktopOpen;
  /** From `?tab=`; kept while a chat is open. */
  filter: HomeFilter;
  setFilter: (filter: HomeFilter) => void;
  openThread: (threadId: string) => void;
  openClub: (orgHandle: string, roomId: string, roomKind: RoomKind | null) => void;
  /** A week card, a panel link: `known()` first, else the resolving read. */
  openById: (id: string) => void;
  /** Inside the open club. */
  switchRoom: (roomId: string, roomKind: RoomKind | null) => void;
  goHome: () => void;
  /** Home + an error toast; the address back to `/messages`. */
  fail: (message: string) => void;
};

const PAGE_PATH = "/messages";

/** How long the Messages control waits for its `popstate` before going home in place (the phone's number). */
const BACK_FALLBACK_MS = 600;

/** The line of a chat that would not open (rule 1). */
const OPEN_FAILED = "Couldn't open this chat.";

/** The id of the chat on screen (or being resolved); null at home. */
function openId(open: DesktopOpen): string | null {
  if (open.kind === "club") return open.roomId;
  if (open.kind === "dm") return open.threadId;
  if (open.kind === "resolving") return open.id;
  return null;
}

/** The address is this page's: a `popstate` that leaves `/messages` reaches the listener before Next unmounts the page. */
function pathIsPage(): boolean {
  try {
    return window.location.pathname === PAGE_PATH;
  } catch {
    return false;
  }
}

/**
 * What the LIVE entry says is open: `?channel=<id>` in the address, else a
 * `{ vibeChat, depth >= 1 }` state (the phone's depth-2 event entry reads as
 * open too). Null for the home; `undefined` when the address cannot be read
 * at all. Never the server prop: after a link out and Back, Next hands back
 * the page it rendered for the first address.
 */
function liveChannel(): string | null | undefined {
  try {
    return channelOfEntry(window.location.search, window.history.state);
  } catch {
    return undefined;
  }
}

/** The home filter the live address names. */
function liveFilter(): HomeFilter {
  try {
    return parseHomeFilter(new URLSearchParams(window.location.search).get("tab"));
  } catch {
    return "all";
  }
}

/** True while the live address still carries `?to=` (rule 7). */
function addressHasTo(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("to");
  } catch {
    return false;
  }
}

/** False only when the browser says there is no entry behind this one (the Navigation API; absent -> unknown -> true). */
function canGoBack(): boolean {
  try {
    const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
    return nav?.canGoBack !== false;
  } catch {
    return true;
  }
}

/** A field a person types in: Esc leaves it before it closes anything (rule 9). */
function isTextField(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function useDesktopOpen({
  initialChannelId,
  known,
}: {
  initialChannelId?: string;
  known: (id: string) => KnownChat | null;
}): DesktopOpenApi {
  // Read once, on mount (rule 8), and only the fallback: the live entry decides.
  const [firstChannelId] = useState(initialChannelId ?? null);
  const [filter, setFilterState] = useState<HomeFilter>(liveFilter);
  // An address that names a chat starts on the skeleton, never on the home for a frame.
  const [open, setOpenState] = useState<DesktopOpen>(() => {
    const live = liveChannel();
    const id = live === undefined ? firstChannelId : live;
    return id ? { kind: "resolving", id } : { kind: "home" };
  });
  const openRef = useRef<DesktopOpen>(open);
  const filterRef = useRef(filter);
  // True while the shell is mounted. The FIRST effect of the hook, so the
  // mount effects below already read it true. After the cleanup every
  // continuation still out (the resolving read, the Messages control's
  // timer, the shell's own awaits) finds `onPage()` false and does nothing:
  // the entry belongs to the next page, to a fresh `/messages`, or to the
  // phone tree.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  /** Still this shell's entry: mounted, and the address is `/messages`. */
  const onPage = useCallback(() => mountedRef.current && pathIsPage(), []);
  // The shell's latest answer to "what do the lists say about this id".
  const knownRef = useRef(known);
  useEffect(() => {
    knownRef.current = known;
  }, [known]);
  // Bumped by every open, close and `popstate`, so a resolving read still
  // out knows a later owner has taken over and drops its answer.
  const seqRef = useRef(0);
  // True while the home's own entry sits right under the open chat's (rule
  // 2): the Messages control may step back onto it. False for a deep link, a
  // refresh and `?to=`: nothing of ours is underneath, so the control turns
  // the entry into the home's in place and Back leaves the page.
  const homeBelowRef = useRef(false);
  // The chat whose entry sits right above the home's after a Back onto the
  // home: Forward onto it has the home underneath again.
  const aboveHomeRef = useRef<string | null>(null);
  // Set by rule 1 when a leftover layer entry is being stepped off: the
  // landing opens what is there, even when it names the id on the skeleton.
  const adoptedRef = useRef(false);

  const show = useCallback((view: DesktopOpen) => {
    openRef.current = view;
    setOpenState(view);
  }, []);

  /** The home on screen. No history write: the caller makes it, or a `popstate` already did. */
  const showHome = useCallback(
    (above: string | null) => {
      seqRef.current += 1;
      homeBelowRef.current = false;
      aboveHomeRef.current = above;
      show({ kind: "home" });
    },
    [show],
  );

  // Armed by a Messages control that called `history.back()`; any `popstate`
  // of ours disarms it. Still armed after BACK_FALLBACK_MS = nothing was
  // behind the entry after all: go home in place.
  const backTimerRef = useRef<number | null>(null);
  const clearBackTimer = useCallback(() => {
    if (backTimerRef.current === null) return;
    window.clearTimeout(backTimerRef.current);
    backTimerRef.current = null;
  }, []);
  useEffect(() => clearBackTimer, [clearBackTimer]);

  /** Rule 4: the Messages control, Esc, a chat that closed itself. */
  const goHome = useCallback(() => {
    // A dialog or popover still open on top (its own entry) closes first.
    clearLayersThen(() => {
      // One Back at a time: a second press before the first one's `popstate` would step back twice.
      if (backTimerRef.current !== null || openRef.current.kind === "home" || !onPage()) return;
      if (homeBelowRef.current && canGoBack()) {
        const view = openRef.current;
        window.history.back();
        backTimerRef.current = window.setTimeout(() => {
          backTimerRef.current = null;
          if (openRef.current !== view || !onPage()) return;
          clearLayersThen(() => window.history.replaceState(null, "", homeUrl(filterRef.current)));
          showHome(null);
        }, BACK_FALLBACK_MS);
        return;
      }
      // Nothing of ours underneath (a deep link, a refresh): the entry becomes the home's.
      window.history.replaceState(null, "", homeUrl(filterRef.current));
      showHome(null);
    });
  }, [onPage, showHome]);

  /**
   * A chat that would not open, or a `?to=` that was refused: the home and
   * an error toast. With the home's entry underneath (the chat was opened
   * by a click) it is rule 4's step back, so no second home entry is left
   * and the home keeps its filter; else the entry becomes `/messages`.
   */
  const fail = useCallback(
    (message: string) => {
      // A refusal that comes back after the shell is gone is nobody's: no toast, no write.
      if (!onPage()) return;
      toast({ message, tone: "error" });
      if (openRef.current.kind !== "home" && homeBelowRef.current) {
        goHome();
        return;
      }
      clearBackTimer();
      filterRef.current = "all";
      setFilterState("all");
      showHome(null);
      clearLayersThen(() => {
        if (onPage()) window.history.replaceState(null, "", PAGE_PATH);
      });
    },
    [clearBackTimer, goHome, onPage, showHome],
  );

  /**
   * Which pane `id` is, with no history write: what the lists already say,
   * else the skeleton and ONE thread read (`room` present = a club room, with
   * its club's handle and its kind, and the body is the room's first page;
   * no `room` = a dm or a group). `then(mine)` runs once the pane is known;
   * `mine()` is false when a later open, close or `popstate` took over.
   * Any failure: `fail`, with the failure's own line.
   */
  const reveal = useCallback(
    (id: string, then?: (mine: () => boolean) => void) => {
      const seq = ++seqRef.current;
      const mine = () => seqRef.current === seq && onPage();
      const hit = knownRef.current(id);
      if (hit) {
        show(hit.kind === "dm" ? { kind: "dm", threadId: id } : { kind: "club", orgHandle: hit.orgHandle, roomId: id, roomKind: hit.roomKind, initialPage: null });
        then?.(mine);
        return;
      }
      show({ kind: "resolving", id });
      const run = async () => {
        const r = await vibeRequest<ThreadMessagesResponse>(`/api/me/threads/${encodeURIComponent(id)}/messages?limit=50`, {
          cache: "no-store",
          quiet: true,
          failure: OPEN_FAILED,
        });
        if (!mine()) return;
        if (!r.ok || !r.data || typeof r.data !== "object" || !Array.isArray(r.data.messages)) {
          fail(asLoadFailure(r, OPEN_FAILED).message);
          return;
        }
        const room = r.data.room;
        show(room ? { kind: "club", orgHandle: room.org.handle, roomId: id, roomKind: room.kind, initialPage: r.data } : { kind: "dm", threadId: id });
        then?.(mine);
      };
      void run();
    },
    [fail, onPage, show],
  );

  /**
   * The history write of a chat opened by a click, made at once, in the
   * click's own tick (a write after an awaited read would follow a layer's
   * step back with a new entry: `layer-stack.ts`, the note on Chrome).
   * From the home it is rule 2; from a chat, rule 3; from a home whose
   * address still carries `?to=`, rule 7 (rule 3's write: the arrival entry
   * becomes the chat's and nothing is underneath). Its three callers ask
   * `onPage()` first: a `?to=` POST or a New dialog's create can answer
   * after the shell is gone.
   */
  const enter = useCallback((id: string) => {
    const { state, url } = chatEntry(id);
    if (openRef.current.kind === "home" && !addressHasTo()) {
      // The entry above the home is being written over: no Forward onto the old one.
      aboveHomeRef.current = null;
      clearLayersInto((mode) => {
        if (mode === "push") {
          window.history.pushState(state, "", url);
          homeBelowRef.current = true;
        } else {
          // A layer's entry sat ON the home's and is the chat's now: the home is underneath all the same.
          window.history.replaceState(state, "", url);
          homeBelowRef.current = true;
        }
      });
      return;
    }
    clearLayersThen(() => window.history.replaceState(state, "", url));
  }, []);

  const openThread = useCallback(
    (threadId: string) => {
      const now = openRef.current;
      if (!threadId || !onPage() || (now.kind === "dm" && now.threadId === threadId)) return;
      enter(threadId);
      seqRef.current += 1;
      show({ kind: "dm", threadId });
    },
    [enter, onPage, show],
  );

  const openClub = useCallback(
    (orgHandle: string, roomId: string, roomKind: RoomKind | null) => {
      const now = openRef.current;
      if (!roomId || !onPage() || (now.kind === "club" && now.roomId === roomId)) return;
      enter(roomId);
      seqRef.current += 1;
      show({ kind: "club", orgHandle, roomId, roomKind, initialPage: null });
    },
    [enter, onPage, show],
  );

  /** A room chip, event chips too: the same club, another room (rule 3). */
  const switchRoom = useCallback(
    (roomId: string, roomKind: RoomKind | null) => {
      const now = openRef.current;
      if (now.kind === "club") openClub(now.orgHandle, roomId, roomKind);
    },
    [openClub],
  );

  const openById = useCallback(
    (id: string) => {
      if (!id || !onPage() || openId(openRef.current) === id) return;
      enter(id);
      reveal(id);
    },
    [enter, onPage, reveal],
  );

  /** Rule 6. The filter is only ever written on the home's own entry; a chat's entry keeps its address. */
  const setFilter = useCallback((next: HomeFilter) => {
    if (!onPage()) return;
    filterRef.current = next;
    setFilterState(next);
    if (openRef.current.kind !== "home") return;
    // Through the layer stack as well: a popover closing on this same click
    // is still stepping back, and a bare write would land on ITS entry.
    clearLayersThen(() => {
      if (openRef.current.kind === "home" && onPage()) window.history.replaceState(null, "", homeUrl(next));
    });
  }, [onPage]);

  // Rule 5: Back, Forward, and the landing of rule 4's step back.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (isLayerPop(e)) return;
      clearBackTimer();
      // A pop that leaves `/messages` passes here too before Next unmounts the page.
      if (!onPage()) return;
      const id = liveChannel();
      if (id === undefined) return;
      const adopted = adoptedRef.current;
      adoptedRef.current = false;
      if (id === null) {
        // The home's entry. The one just left sits right above it. The
        // filter follows the address (it is the home's own entry).
        const next = liveFilter();
        filterRef.current = next;
        setFilterState(next);
        showHome(openId(openRef.current));
        return;
      }
      // The entry names what is on screen already (the phone's depth-2 event
      // entry over its depth-1 one, after the window crossed 900px).
      if (id === openId(openRef.current) && !adopted) return;
      // Forward from the home onto the entry just left: the home is
      // underneath. Any other landing: unknown, so the control goes home in place.
      homeBelowRef.current = openRef.current.kind === "home" && aboveHomeRef.current === id;
      reveal(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [clearBackTimer, onPage, reveal, showHome]);

  // Rule 5 again, for a move of the address this hook did not make and no
  // `popstate` tells of: a Next link to `/messages` followed while the shell
  // is up (the left nav's Messages is one). Next keeps the page across a
  // navigation that changes only the query, so nothing is remounted and the
  // screen would go on showing the chat under an address that names the
  // home. `search` is only the trigger: the LIVE entry is read, and after
  // every write and every `popstate` of ours it already agrees with what is
  // open, so those runs do nothing. (A run that lands while one of our own
  // writes still waits behind a layer's step back corrects itself: that
  // write moves `search` again.) No history write: the entry is Next's.
  const search = useSearchParams().toString();
  useEffect(() => {
    if (!onPage()) return;
    const id = liveChannel();
    if (id === undefined) return;
    const now = openRef.current;
    if (id === null) {
      const next = liveFilter();
      // Already the home, on the filter the address names (a `popstate` got here first, or the write was ours).
      if (now.kind === "home" && next === filterRef.current) return;
      clearBackTimer();
      filterRef.current = next;
      setFilterState(next);
      // A new entry on top of the stack: nothing sits above this home.
      if (now.kind !== "home") showHome(null);
      return;
    }
    if (id === openId(now)) return;
    clearBackTimer();
    // Unknown what is underneath: the Messages control goes home in place.
    homeBelowRef.current = false;
    reveal(id);
  }, [search, clearBackTimer, onPage, reveal, showHome]);

  // Rule 1: on arrival, and when Next restores this page (back from a club
  // page, a profile or a post).
  useEffect(() => {
    const arrive = () => {
      const live = liveChannel();
      const id = live === undefined ? firstChannelId : live;
      if (!id) return;
      homeBelowRef.current = false;
      // The chat opens on the entry the browser already holds.
      reveal(id, (mine) => {
        clearLayersThen(() => {
          if (mine()) window.history.replaceState(chatEntry(id).state, "", chatEntry(id).url);
        });
      });
    };
    // An entry left by a dialog or a popover (a reload with one open) is
    // stepped off first; its landing is a `popstate` that opens the chat.
    if (!adoptLayerEntry()) {
      arrive();
      return;
    }
    adoptedRef.current = true;
    // The landing never came (the stack forgets its step back after
    // SETTLE_MS): open what the address names rather than keep a skeleton.
    const timer = window.setTimeout(() => {
      if (!adoptedRef.current) return;
      adoptedRef.current = false;
      arrive();
    }, SETTLE_MS + BACK_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [firstChannelId, reveal]);

  // Rule 9: Esc, heard on the top window (the dm frame says `escape` itself).
  // On `window`, in the bubble phase: React's root is `document`, so an Esc
  // a dialog, a popover or a message's toolbar handled and stopped never
  // arrives. In order: a layer is open -> it closes itself and nothing
  // happens here; focus in a field -> leave the field and stop; a chat is
  // open -> home.
  //
  // "A layer is open" is also read when the key STARTS its path (the capture
  // listener, the first one of the dispatch). `RemoveConfirm` and the Report
  // dialog close on Esc without stopping the key and without counting as a
  // desktop layer, and their listeners sit on `document`: React has taken
  // them out of the page before the key reaches `window`, so looking for
  // `aria-modal` only then would find nothing and the same Esc would also
  // close the chat.
  useEffect(() => {
    const layerShowing = () => desktopLayerOpen() || document.querySelector('[aria-modal="true"]') !== null;
    let layerAtPress = false;
    const onKeyFirst = (e: KeyboardEvent) => {
      if (e.key === "Escape") layerAtPress = layerShowing();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;
      if (layerAtPress || desktopLayerOpen()) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // Esc that ends an IME composition, or a key held down, is not a second press.
      if (e.isComposing || e.repeat) return;
      if (isTextField(e.target)) {
        e.target.blur();
        return;
      }
      if (openRef.current.kind !== "home") goHome();
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKeyFirst, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [goHome]);

  return { open, filter, setFilter, openThread, openClub, openById, switchRoom, goHome, fail };
}
