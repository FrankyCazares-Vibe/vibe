/**
 * The history layer of the new chat's sheets, without a DOM (S71 amendment 3,
 * A = audit F06; handoffs/chat-redesign/wave-2-contracts.md 2.3, 17.1 row 11,
 * 17.5 item 19: Back peels ONE layer — the sheet, then the event chat, then
 * the space, then the home).
 *
 * The room entries keep their exact shape, `{ vibeChat, depth }` (the shell
 * owns depth 1, `ClubSpace` the event chat at depth 2). A sheet, the "+" tray
 * or a confirm gets its OWN entry on top: the room entry's marks plus
 * `sheet: <n>` (1 for the first sheet over a room, 2 for one over that).
 *
 * This file is the stack and the answer to "who owns this pop":
 *
 *   - `open(handle)`: a layer came on screen → one entry is pushed.
 *   - `close(id)`: the layer closed by its own control (or unmounted) → its
 *     entry is taken off with one step back at the end of the tick, but only
 *     while the live entry is still one of this module's (after a link out
 *     it is another page's, and stepping back would undo the navigation). A
 *     layer that OPENS in that same tick takes the entry over instead (the
 *     tray closing as a sheet opens; React's dev double mount).
 *   - `handlePop(state)`: every `popstate` is shown here once. `"layer"` = a
 *     sheet closing (Back on a sheet, or a step back this module made itself):
 *     the room owners do nothing. `"other"` = a room-level move: theirs.
 *     Back on a sheet calls its `onPop`; while `canPop()` is false (a card is
 *     posting) the module goes FORWARD onto the entry Back just left and
 *     nothing closes.
 *   - `clearThen(fn)`: for the room owners. Closes every layer on top (their
 *     `onPop`, their entries), then runs `fn` — at once when nothing is open.
 *   - `clearInto(write)`: for an owner that puts its own entry on top (the
 *     event chat opened with the tray up): the tray's entry becomes the
 *     owner's by `replaceState` instead of a step back and a push.
 *   - `adopt()`: the live entry carries a `sheet` mark no layer owns (a
 *     reload with a sheet open; a link out with the tray open, then Back) →
 *     step back off it, so the first Back afterwards is not a dead press.
 *
 * A traversal is asynchronous: its `popstate` comes later. Until it has, any
 * history work asked of this module waits in a queue, so a push never lands
 * under a step back that is still on its way.
 *
 * NEVER A STEP BACK FOLLOWED BY A NEW ENTRY (the repair of amendment 3's
 * review). Chrome's history-manipulation intervention (Chromium,
 * `docs/history_manipulation_intervention.md`): after a same-document
 * back/forward, earlier taps no longer count "for creating new entries until
 * a new activation is received", and an entry added then marks every
 * same-document entry to be skipped by the browser's Back button (script
 * `history.back()` is not affected) until the next tap. A step back and then
 * a `pushState` with no tap in between would therefore make the toolbar /
 * system Back jump past the space and the home. So: a layer replacing
 * another keeps its entry, the posting guard traverses instead of pushing,
 * and an owner's entry over the tray is a `replaceState`. Read from the
 * doc, not seen in a browser.
 *
 * No imports and only erasable TypeScript: `node --test` loads it as is.
 */

/** What a `popstate` was: a sheet closing (owners do nothing) or a room-level move. */
export type PopKind = "layer" | "other";

export type LayerHandle = {
  /** Back took this layer's entry (or an owner cleared the layers): close the layer's own state. It never touches history. */
  onPop: () => void;
  /** False while the layer must stay (a card is posting): Back puts the entry back and closes nothing. */
  canPop?: () => boolean;
};

export type LayerEnv = {
  /** `window.history.state`. */
  state: () => unknown;
  /** `window.history.pushState(state, "")` — Next's patched one, same URL. */
  push: (state: Record<string, unknown>) => void;
  /** `window.history.go(delta)`. */
  go: (delta: number) => void;
  /** Run once every listener of the current event is done (`setTimeout(fn, 0)`). */
  later: (fn: () => void) => void;
  /** A watchdog timer; returns its cancel. Optional (the tests drive it by hand). */
  timer?: (fn: () => void, ms: number) => () => void;
};

export type EntryMarks = { vibeChat: string | null; depth: number; sheet: number };

/** A traversal this module started must be answered by a `popstate` within this; if not, it is forgotten. */
export const SETTLE_MS = 1500;

/** The chat marks on a history entry's state; zeros for an entry that carries none. */
export function readMarks(state: unknown): EntryMarks {
  const s = state as { vibeChat?: unknown; depth?: unknown; sheet?: unknown } | null;
  if (!s || typeof s !== "object") return { vibeChat: null, depth: 0, sheet: 0 };
  const vibeChat = typeof s.vibeChat === "string" ? s.vibeChat : null;
  const d = Number(s.depth);
  const n = Number(s.sheet);
  return {
    vibeChat,
    depth: vibeChat !== null && Number.isFinite(d) && d > 0 ? d : 0,
    sheet: Number.isInteger(n) && n > 0 ? n : 0,
  };
}

/** A sheet entry's state: the room entry's own marks plus `sheet: n`. */
export function sheetState(base: { vibeChat: string | null; depth: number }, n: number): Record<string, unknown> {
  return base.vibeChat !== null ? { vibeChat: base.vibeChat, depth: base.depth, sheet: n } : { sheet: n };
}

/**
 * What an entry says is open (amendment 3, B = audit F07): `?channel=<id>` in
 * its address, else its `{ vibeChat, depth >= 1 }` state. Null for the home.
 */
export function channelOfEntry(search: string, state: unknown): string | null {
  let id: string | undefined;
  try {
    id = new URLSearchParams(search).get("channel")?.trim();
  } catch {
    id = undefined;
  }
  if (id) return id;
  const m = readMarks(state);
  return m.depth >= 1 ? m.vibeChat : null;
}

/**
 * The history writes of opening room `id` on the entry the browser already
 * holds (2.3; amendment 3, B):
 *   - `"space"`: `replaceState({ vibeChat: id, depth: 1 })` (a room of the
 *     space, a dm);
 *   - `"space+layer"`: that, then `pushState` depth 2 (an event room: the
 *     space underneath, the event chat on top);
 *   - `"none"`: an event room whose own depth-2 entry is the live one (back
 *     from a profile; a reload inside the event chat). The space's entry is
 *     already under it; a second pair would leave a Back that does nothing.
 */
export function arrivalWrites(state: unknown, id: string, eventRoom: boolean): "none" | "space" | "space+layer" {
  if (!eventRoom) return "space";
  const m = readMarks(state);
  return m.depth === 2 && m.vibeChat === id ? "none" : "space+layer";
}

/**
 * The event chat closed by a Back that landed on the space's own entry: the
 * room that entry must name now, or null to leave it as it is (amendment 3
 * repair, B).
 *
 * A space opened by a Your-week card or by an event deep link keeps the EVENT
 * room's id on its depth-1 entry. With the event chat closed the screen shows
 * a room of the space (the Lounge), and an entry still naming the event would
 * re-open the event chat on the way back from a club page or a profile. So
 * the entry is rewritten to the room on screen (`replaceState`, same depth),
 * as the Board strip's pick already is.
 *
 * Only that case: the landed entry is the space's (depth 1, no sheet mark)
 * and names the layer that just closed (`spaceEntryNamesLayer`).
 * `activeRoomId` null (the space has not answered yet): nothing can be
 * written now; the caller writes it when the room is known.
 */
export function spaceEntryNamesLayer(landed: unknown, layerId: string | null): boolean {
  const m = readMarks(landed);
  return layerId !== null && m.depth === 1 && m.sheet === 0 && m.vibeChat === layerId;
}

export function spaceEntryAfterLayer(landed: unknown, layerId: string | null, activeRoomId: string | null): string | null {
  if (!spaceEntryNamesLayer(landed, layerId)) return null;
  return activeRoomId !== null && activeRoomId !== layerId ? activeRoomId : null;
}

export type LayerStack = ReturnType<typeof createLayerStack>;

export function createLayerStack(env: LayerEnv) {
  type Live = { id: number; handle: LayerHandle; pushed: boolean };
  let live: Live[] = [];
  // The room entry's marks under the lowest pushed layer.
  let base: { vibeChat: string | null; depth: number } | null = null;
  // Entries of this module still on top of the pushed layers' whose layer has
  // closed: until the end of the tick a layer opening may take one over (the
  // tray closing as a sheet opens); what is left then is stepped off.
  let orphans = 0;
  let settling = false;
  // One per traversal this module started whose `popstate` has not come yet:
  // what the owners are told about it when it does.
  let expected: PopKind[] = [];
  const queue: (() => void)[] = [];
  let stopWatch: (() => void) | null = null;
  let nextId = 1;

  const pushedCount = () => live.reduce((n, l) => n + (l.pushed ? 1 : 0), 0);
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* one layer's callback never stops the others */
    }
  };

  const drain = () => {
    while (expected.length === 0 && queue.length > 0) {
      const fn = queue.shift();
      if (fn) safely(fn);
    }
  };

  /** History work: now when nothing is in flight, else after the traversals in flight have landed. */
  const run = (fn: () => void) => {
    if (expected.length === 0 && queue.length === 0) safely(fn);
    else queue.push(fn);
  };

  const traverse = (delta: number, kind: PopKind) => {
    expected.push(kind);
    stopWatch?.();
    stopWatch = env.timer
      ? env.timer(() => {
          stopWatch = null;
          expected = [];
          drain();
        }, SETTLE_MS)
      : null;
    try {
      env.go(delta);
    } catch {
      expected.pop();
      if (expected.length === 0) drain();
    }
  };

  /** True when the live entry is the room's this module's entries sit on (or one of those entries). */
  const onBase = (m: EntryMarks) => base !== null && m.vibeChat === base.vibeChat && m.depth === base.depth;

  /** The ownerless entries the LIVE entry still accounts for (after a link out it is another page's: none). */
  const liveOrphans = () => {
    const m = readMarks(env.state());
    return onBase(m) ? Math.max(0, Math.min(orphans, m.sheet - pushedCount())) : 0;
  };

  /** Take `n` of this module's entries off the top — as many of them as the live entry says are there. */
  const popEntries = (n: number) => {
    if (pushedCount() === 0 && orphans === 0) base = null;
    const k = Math.min(n, readMarks(env.state()).sheet);
    if (k > 0) traverse(-k, "layer");
  };

  /** The end of the tick a layer closed in: the entries nobody took over are stepped off. */
  const settle = () => {
    settling = false;
    run(() => {
      const k = liveOrphans();
      orphans = 0;
      popEntries(k);
    });
  };

  const dropAll = (): number => {
    const gone = live;
    live = [];
    let pushed = 0;
    for (let i = gone.length - 1; i >= 0; i--) {
      if (gone[i].pushed) pushed += 1;
      safely(gone[i].handle.onPop);
    }
    return pushed;
  };

  return {
    /**
     * A layer came on screen: it gets one entry (after any traversal in
     * flight). An entry a layer left behind in this same tick is taken over
     * as it is (same marks, same number): nothing is stepped back and nothing
     * is pushed. Otherwise the entry is pushed. Returns the id for `close`.
     */
    open(handle: LayerHandle): number {
      const entry: Live = { id: nextId++, handle, pushed: false };
      live.push(entry);
      run(() => {
        if (!live.includes(entry)) return;
        if (liveOrphans() > 0) {
          orphans = liveOrphans() - 1;
          entry.pushed = true;
          return;
        }
        orphans = 0;
        const below = pushedCount();
        if (below === 0 || base === null) {
          const m = readMarks(env.state());
          base = { vibeChat: m.vibeChat, depth: m.depth };
        }
        env.push(sheetState(base, below + 1));
        entry.pushed = true;
      });
      return entry.id;
    },

    /**
     * The layer closed by its own control, or unmounted. Its entry is taken
     * off with one step back at the end of the tick, unless a layer opening
     * in the same tick took it over. A layer Back already took is unknown
     * here: nothing happens.
     */
    close(id: number): void {
      const i = live.findIndex((l) => l.id === id);
      if (i < 0) return;
      const [entry] = live.splice(i, 1);
      if (!entry.pushed) return;
      orphans += 1;
      if (settling) return;
      settling = true;
      env.later(settle);
    },

    /** For the room owners: every layer on top is closed (state and entries), then `fn` runs. */
    clearThen(fn: () => void): void {
      const k = dropAll() + orphans;
      orphans = 0;
      if (k > 0) run(() => popEntries(k));
      run(fn);
    },

    /**
     * For a room owner that puts its OWN entry on top (the event chat opened
     * with the tray up): every layer is closed, and the owner is told how to
     * write. `"replace"`: one of this module's entries is the live one and is
     * the owner's to overwrite (`replaceState`), so the tray's entry BECOMES
     * the event chat's. `"push"`: no entry of this module is there.
     */
    clearInto(write: (mode: "push" | "replace") => void): void {
      const k = dropAll() + orphans;
      orphans = 0;
      run(() => {
        base = null;
        const top = Math.min(k, readMarks(env.state()).sheet);
        if (top === 0) {
          write("push");
          return;
        }
        if (top === 1) {
          write("replace");
          return;
        }
        traverse(-(top - 1), "layer");
        queue.unshift(() => write("replace"));
      });
    },

    /** Every `popstate`, once. */
    handlePop(state: unknown): PopKind {
      const own = expected.shift();
      if (own !== undefined) {
        if (expected.length === 0) {
          stopWatch?.();
          stopWatch = null;
          if (queue.length > 0) env.later(drain);
        }
        return own;
      }
      const m = readMarks(state);
      const n = pushedCount();
      if (n + orphans > 0) {
        if (onBase(m) && m.sheet < n + orphans) {
          // Back took entries off the top: the ownerless ones first.
          orphans = Math.max(0, m.sheet - n);
          if (m.sheet >= n) {
            if (n === 0 && orphans === 0) base = null;
            return "layer";
          }
          // Back on a sheet: `n - m.sheet` of the layers' entries came off.
          const pushed = live.filter((l) => l.pushed);
          const victims = pushed.slice(m.sheet);
          if (victims.some((v) => (v.handle.canPop ? !v.handle.canPop() : false))) {
            // A layer that must stay (a card is posting): forward again onto
            // the entry Back just left. It is still there, so no entry is
            // made (see the note on Chrome at the top of the file).
            traverse(n - m.sheet, "layer");
            return "layer";
          }
          live = live.filter((l) => !victims.includes(l));
          if (pushedCount() === 0) base = null;
          for (let i = victims.length - 1; i >= 0; i--) safely(victims[i].handle.onPop);
          return "layer";
        }
        if (!onBase(m)) {
          // The room entry itself was left (a jump of several entries): the layers go with it.
          dropAll();
          orphans = 0;
          base = null;
        }
      }
      const extra = m.sheet - pushedCount() - orphans;
      if (extra > 0) {
        // Landed on a sheet entry no layer owns (Forward onto a closed sheet): step off it.
        traverse(-extra, "other");
        return "layer";
      }
      return "other";
    },

    /** On the shell's mount: true when the live entry was a sheet's with no layer (a step back is on its way; its landing is an "other" pop). */
    adopt(): boolean {
      if (expected.includes("other")) return true;
      if (expected.length > 0) return false;
      const extra = readMarks(env.state()).sheet - pushedCount() - orphans;
      if (extra <= 0) return false;
      traverse(-extra, "other");
      return true;
    },

    /** Layers on screen (pushed or waiting to be). */
    size: (): number => live.length,
    /** Traversals this module started that have not landed. */
    inFlight: (): number => expected.length,
  };
}
