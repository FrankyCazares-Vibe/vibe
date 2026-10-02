/**
 * Tests for `layer-stack.ts` (S71 amendment 3, A = audit F06: Back with a
 * sheet open closes ONLY the sheet; contract 2.3, 17.1 row 11, 17.5 item 19).
 *
 * A small fake of the browser's session history stands in for `window.history`:
 * `push` truncates the forward entries, `go` is asynchronous (its `popstate`
 * is delivered by `flush()`), exactly the two facts the stack is built around.
 *
 * The fake also keeps Chrome's history-manipulation intervention (Chromium,
 * docs/history_manipulation_intervention.md): a tap is honoured for creating
 * entries until a traversal lands; an entry added after that with no new tap
 * marks every entry skippable for the browser's Back button (`trapped()`),
 * and a tap clears the marks.
 *
 * Run with:
 *   node --test src/lib/chat/layer-stack.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./layer-stack.ts";
const { arrivalWrites, channelOfEntry, createLayerStack, readMarks, sheetState, spaceEntryAfterLayer, spaceEntryNamesLayer, SETTLE_MS } = (await import(
  specifier
)) as typeof import("./layer-stack");

type Kind = "layer" | "other";

const HOME = null;
const SPACE = { vibeChat: "lounge", depth: 1 };
const EVENT = { vibeChat: "event", depth: 2 };

function browser(entries: unknown[], at = entries.length - 1) {
  const list = [...entries];
  let index = at;
  const tasks: (() => void)[] = [];
  const kinds: Kind[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  // Chrome's intervention: is the last tap still honoured, and are the
  // entries marked to be skipped by the browser's Back button.
  let honoured = false;
  let skippable = false;
  let pushes = 0;
  const added = () => {
    pushes += 1;
    if (!honoured) skippable = true;
  };
  const stack = createLayerStack({
    state: () => list[index],
    push: (s) => {
      list.splice(index + 1);
      list.push(s);
      index += 1;
      added();
    },
    go: (delta) => {
      tasks.push(() => move(delta));
    },
    later: (fn) => {
      tasks.push(fn);
    },
    timer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
  });
  /** A traversal landing: the `popstate` every owner is shown. */
  function move(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= list.length) return;
    index = next;
    honoured = false;
    kinds.push(stack.handlePop(list[index]));
  }
  const flush = () => {
    while (tasks.length > 0) tasks.shift()?.();
  };
  return {
    stack,
    kinds,
    timers,
    flush,
    /** The person's Back / Forward: not one of the stack's own traversals. */
    back: (n = 1) => {
      tasks.push(() => move(-n));
      flush();
    },
    forward: () => {
      tasks.push(() => move(1));
      flush();
    },
    /** A navigation by someone else (Next's router): a new entry on top. */
    navigate: (state: unknown) => {
      list.splice(index + 1);
      list.push(state);
      index += 1;
      added();
    },
    /** The person touches the page: the tap that opens a tray, picks a card, presses a button. */
    tap: () => {
      honoured = true;
      skippable = false;
    },
    /** True when the browser's own Back button would jump past this page's entries. */
    trapped: () => skippable,
    /** Entries added so far (pushState by anyone). */
    pushes: () => pushes,
    /** An owner's `replaceState` on the live entry. */
    replace: (state: unknown) => {
      list[index] = state;
    },
    /** Whatever is on its way is lost (a traversal that never lands). */
    lose: () => {
      tasks.length = 0;
    },
    state: () => list[index],
    length: () => list.length,
    index: () => index,
  };
}

function layer(canPop?: () => boolean) {
  const seen = { pops: 0 };
  return { seen, handle: { onPop: () => void (seen.pops += 1), canPop } };
}

test("readMarks: the room marks and the sheet mark, zeros for anything else", () => {
  assert.deepEqual(readMarks(null), { vibeChat: null, depth: 0, sheet: 0 });
  assert.deepEqual(readMarks("x"), { vibeChat: null, depth: 0, sheet: 0 });
  assert.deepEqual(readMarks({ depth: 2 }), { vibeChat: null, depth: 0, sheet: 0 }, "a depth without a room is no layer");
  assert.deepEqual(readMarks({ vibeChat: "r", depth: 1 }), { vibeChat: "r", depth: 1, sheet: 0 });
  assert.deepEqual(readMarks({ vibeChat: "r", depth: 2, sheet: 1, __NA: true }), { vibeChat: "r", depth: 2, sheet: 1 });
  assert.deepEqual(readMarks({ vibeChat: "r", depth: 1, sheet: "2" }), { vibeChat: "r", depth: 1, sheet: 2 });
  assert.equal(readMarks({ vibeChat: "r", depth: 1, sheet: -1 }).sheet, 0);
  assert.equal(readMarks({ vibeChat: "r", depth: 1, sheet: 1.5 }).sheet, 0);
});

test("sheetState: the room entry's marks plus the sheet's number; the room's shape is not touched", () => {
  assert.deepEqual(sheetState({ vibeChat: "r", depth: 1 }, 1), { vibeChat: "r", depth: 1, sheet: 1 });
  assert.deepEqual(sheetState({ vibeChat: null, depth: 0 }, 2), { sheet: 2 });
});

test("opening a sheet pushes ONE entry on top of the room's, which stays exactly `{ vibeChat, depth }`", () => {
  const b = browser([HOME, SPACE]);
  b.stack.open(layer().handle);
  assert.equal(b.length(), 3);
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 1 });
  b.back();
  assert.deepEqual(b.state(), SPACE, "the room entry underneath is as it was");
});

test("Back with a sheet open closes ONLY the sheet: the pop is the layer's, the room owners do nothing", () => {
  const b = browser([HOME, SPACE]);
  const sheet = layer();
  b.stack.open(sheet.handle);
  b.back();
  assert.deepEqual(b.kinds, ["layer"]);
  assert.equal(sheet.seen.pops, 1);
  assert.equal(b.stack.size(), 0);
  assert.equal(b.index(), 1, "on the space's entry, not the home's");
  // The next Back is the space's own.
  b.back();
  assert.deepEqual(b.kinds, ["layer", "other"]);
  assert.equal(sheet.seen.pops, 1);
});

test("closing by its own control steps back once: no stale entry, onPop not called, the owners told nothing is theirs", () => {
  const b = browser([HOME, SPACE]);
  const sheet = layer();
  const id = b.stack.open(sheet.handle);
  b.stack.close(id);
  assert.equal(b.stack.inFlight(), 0, "the step back waits for the end of the tick (a layer opening now would take the entry)");
  assert.equal(b.index(), 2);
  b.flush();
  assert.deepEqual(b.kinds, ["layer"]);
  assert.equal(sheet.seen.pops, 0);
  assert.equal(b.index(), 1);
  assert.equal(b.stack.inFlight(), 0);
  // One Back from here leaves the space: the sheet left nothing behind to eat it.
  b.back();
  assert.equal(b.index(), 0);
  assert.deepEqual(b.kinds, ["layer", "other"]);
});

test("closing twice, or closing a layer Back already took, does nothing", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.back();
  b.stack.close(id);
  b.stack.close(id);
  b.flush();
  assert.equal(b.index(), 1);
  assert.deepEqual(b.kinds, ["layer"]);
});

test("while posting (canPop false) Back does not close the sheet and does not leave: forward again onto the SAME entry, none added", () => {
  const b = browser([HOME, SPACE]);
  let posting = true;
  const sheet = layer(() => !posting);
  b.tap(); // Post
  b.stack.open(sheet.handle);
  assert.equal(b.pushes(), 1);
  b.back();
  assert.deepEqual(b.kinds, ["layer", "layer"], "Back, then the module's own step forward: neither is the room owners'");
  assert.equal(sheet.seen.pops, 0);
  assert.equal(b.stack.size(), 1);
  assert.equal(b.stack.inFlight(), 0);
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 1 }, "the sheet's entry is the live one again");
  assert.equal(b.length(), 3, "the same three entries");
  assert.equal(b.pushes(), 1, "no entry was added inside the popstate (Chrome's trap pattern)");
  assert.equal(b.trapped(), false);
  b.back();
  assert.equal(sheet.seen.pops, 0, "a second Back while posting: the same");
  assert.equal(b.index(), 2);
  posting = false;
  b.back();
  assert.equal(sheet.seen.pops, 1);
  assert.equal(b.index(), 1);
  assert.deepEqual(b.kinds, ["layer", "layer", "layer", "layer", "layer"]);
  assert.equal(b.trapped(), false);
});

test("while posting, a Back over two sheets goes forward over both", () => {
  const b = browser([HOME, SPACE]);
  const under = layer();
  const over = layer(() => false);
  b.stack.open(under.handle);
  b.stack.open(over.handle);
  b.back(2);
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 2 });
  assert.deepEqual([under.seen.pops, over.seen.pops], [0, 0]);
  assert.equal(b.stack.size(), 2);
  assert.equal(b.length(), 4);
});

test("while posting, a step forward that never lands is forgotten; closing the sheet then steps back from nowhere", () => {
  const b = browser([HOME, SPACE]);
  const sheet = layer(() => false);
  const id = b.stack.open(sheet.handle);
  // Back lands (shown to the stack by hand: the helper would flush); the module's step forward is lost.
  const kind = b.stack.handlePop(SPACE);
  assert.equal(kind, "layer");
  assert.equal(b.stack.inFlight(), 1);
  b.lose();
  b.timers.filter((t) => t.live)[0].fn();
  assert.equal(b.stack.inFlight(), 0);
  // The fake's live entry is still the sheet's here; put it where a real Back left it.
  b.replace(SPACE);
  b.stack.close(id);
  b.flush();
  assert.equal(b.stack.inFlight(), 0, "the live entry carries no sheet mark: no step back");
});

test("the tray closes and a sheet opens in the same commit: the sheet takes the tray's entry (no step back, no push)", () => {
  const b = browser([HOME, SPACE]);
  const tray = layer();
  const sheet = layer();
  b.tap(); // "+"
  const trayId = b.stack.open(tray.handle);
  b.tap(); // Poll
  // One commit: the tray's cleanup, then the sheet's mount.
  b.stack.close(trayId);
  b.stack.open(sheet.handle);
  assert.equal(b.index(), 2);
  assert.equal(b.stack.inFlight(), 0, "no traversal");
  b.flush();
  assert.deepEqual(b.kinds, [], "no popstate at all");
  assert.equal(b.stack.inFlight(), 0);
  assert.equal(b.length(), 3);
  assert.equal(b.pushes(), 1, "the tray's push only");
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 1 });
  assert.equal(tray.seen.pops, 0);
  assert.equal(b.trapped(), false, "the browser's Back button still sees the space and the home");
  // Back now closes the sheet, only the sheet.
  b.back();
  assert.equal(sheet.seen.pops, 1);
  assert.equal(b.index(), 1);
  assert.equal(b.stack.size(), 0);
  // And the sheet closing by its own control leaves nothing behind either.
  b.tap();
  const again = b.stack.open(layer().handle);
  b.stack.close(again);
  b.flush();
  assert.equal(b.index(), 1);
  b.back();
  assert.equal(b.state(), HOME);
});

test("what the old order did (a step back, then a push with no new tap) is what Chrome punishes", () => {
  // The fake's own rule, so the tests above mean something.
  const b = browser([HOME, SPACE]);
  b.tap();
  b.navigate({ vibeChat: "lounge", depth: 1, sheet: 1 });
  assert.equal(b.trapped(), false, "a push right after a tap is fine");
  b.back();
  b.navigate({ vibeChat: "lounge", depth: 1, sheet: 1 });
  assert.equal(b.trapped(), true, "a push after a traversal with no new tap marks the entries");
  b.tap();
  assert.equal(b.trapped(), false, "the next tap clears the marks");
});

test("a sheet closed by its own control, then another opened by a NEW tap: a step back, a tap, a push", () => {
  const b = browser([HOME, SPACE]);
  b.tap();
  const first = b.stack.open(layer().handle);
  b.tap(); // the ✕
  b.stack.close(first);
  b.flush();
  assert.equal(b.index(), 1);
  b.tap(); // "+" again
  b.stack.open(layer().handle);
  assert.equal(b.pushes(), 2);
  assert.equal(b.trapped(), false);
});

test("Back pressed in the tick a layer closed in takes the left-over entry: a layer pop, and no second step", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.stack.close(id);
  // The person's Back lands before the end-of-tick step.
  assert.equal(b.stack.handlePop(SPACE), "layer");
  b.replace(SPACE); // (the fake's live entry, where that Back left it)
  b.flush();
  assert.equal(b.stack.inFlight(), 0);
  assert.deepEqual(b.kinds, []);
});

test("an owner clearing in the tick a layer closed in steps its entry off once", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.stack.close(id);
  let at = -1;
  b.stack.clearThen(() => {
    at = b.index();
  });
  b.flush();
  assert.equal(at, 1, "the owner's work ran on the room's entry");
  assert.equal(b.index(), 1);
  assert.deepEqual(b.kinds, ["layer"], "one step back, not two");
  assert.equal(b.stack.inFlight(), 0);
});

test("two layers close in one tick and one opens: it takes the lower entry, the upper one is stepped off", () => {
  const b = browser([HOME, SPACE]);
  const under = b.stack.open(layer().handle);
  const over = b.stack.open(layer().handle);
  b.stack.close(over);
  b.stack.close(under);
  const sheet = layer();
  b.stack.open(sheet.handle);
  b.flush();
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 1 });
  assert.equal(b.index(), 2);
  assert.deepEqual(b.kinds, ["layer"]);
  b.back();
  assert.equal(sheet.seen.pops, 1);
  assert.deepEqual(b.state(), SPACE);
});

test("React's dev double mount (open, close, open at once) ends with one entry", () => {
  const b = browser([HOME, SPACE]);
  b.tap();
  const first = b.stack.open(layer().handle);
  b.stack.close(first);
  const sheet = layer();
  b.stack.open(sheet.handle);
  b.flush();
  assert.equal(b.length(), 3);
  assert.equal(b.index(), 2);
  assert.equal(b.stack.size(), 1);
  assert.deepEqual(b.kinds, [], "the second mount takes the first one's entry");
  assert.equal(b.pushes(), 1);
  assert.equal(b.trapped(), false);
  b.back();
  assert.equal(sheet.seen.pops, 1);
  assert.equal(b.index(), 1);
});

test("a layer closed before its queued push ran pushes nothing", () => {
  const b = browser([HOME, SPACE]);
  const first = b.stack.open(layer().handle);
  b.stack.close(first);
  const second = b.stack.open(layer().handle);
  b.stack.close(second);
  b.flush();
  assert.equal(b.index(), 1);
  assert.equal(b.stack.size(), 0);
  assert.deepEqual(b.kinds, ["layer"]);
});

test("a sheet inside the event chat: Back peels the sheet, then the event chat, then the space", () => {
  const b = browser([HOME, SPACE, EVENT]);
  const sheet = layer();
  b.stack.open(sheet.handle);
  assert.deepEqual(b.state(), { vibeChat: "event", depth: 2, sheet: 1 });
  b.back();
  assert.deepEqual(b.state(), EVENT);
  b.back();
  assert.deepEqual(b.state(), SPACE);
  b.back();
  assert.equal(b.state(), HOME);
  assert.deepEqual(b.kinds, ["layer", "other", "other"]);
  assert.equal(sheet.seen.pops, 1);
});

test("a sheet over a sheet: Back takes the top one only", () => {
  const b = browser([HOME, SPACE]);
  const under = layer();
  const over = layer();
  b.stack.open(under.handle);
  b.stack.open(over.handle);
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 2 });
  b.back();
  assert.deepEqual([under.seen.pops, over.seen.pops], [0, 1]);
  assert.deepEqual(b.state(), { vibeChat: "lounge", depth: 1, sheet: 1 });
  b.back();
  assert.deepEqual([under.seen.pops, over.seen.pops], [1, 1]);
  assert.deepEqual(b.kinds, ["layer", "layer"]);
});

test("clearThen with nothing open runs at once; with a sheet open it closes the sheet first, then runs", () => {
  const b = browser([HOME, SPACE]);
  let ran = 0;
  b.stack.clearThen(() => void (ran += 1));
  assert.equal(ran, 1, "no sheet: today's behaviour, synchronously");

  const sheet = layer(() => false); // even a posting sheet goes when the room itself closes
  b.stack.open(sheet.handle);
  let at = -1;
  b.stack.clearThen(() => {
    at = b.index();
  });
  assert.equal(sheet.seen.pops, 1, "the layer's state closes at once");
  assert.equal(at, -1, "the owner's work waits for the step back");
  b.flush();
  assert.equal(at, 1, "it ran on the room's own entry");
  assert.deepEqual(b.kinds, ["layer"]);
  assert.equal(b.stack.size(), 0);
});

test("the space closed under an open sheet (a 403): the sheet's entry goes first, then the space's; nothing dangles", () => {
  const b = browser([HOME, SPACE]);
  const sheet = layer();
  const id = b.stack.open(sheet.handle);
  // The owner's close: clear, then its own history.back().
  b.stack.clearThen(() => b.back());
  // The sheet's component unmounts in the same commit.
  b.stack.close(id);
  b.flush();
  assert.equal(b.index(), 0);
  assert.deepEqual(b.kinds, ["layer", "other"]);
  assert.equal(b.stack.inFlight(), 0);
});

test("unmounting after the page navigated away never steps back (a link tapped with the tray open)", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.navigate({ __NA: true }); // Next pushed the club page's entry
  b.stack.close(id);
  b.flush();
  assert.equal(b.index(), 3, "still on the club page");
  assert.equal(b.stack.inFlight(), 0);
  assert.deepEqual(b.kinds, []);
});

test("adopt: back from that page onto the sheet's leftover entry, or a reload on it: one step off it, landing as a room-level pop", () => {
  const b = browser([HOME, SPACE, { vibeChat: "lounge", depth: 1, sheet: 1 }]);
  assert.equal(b.stack.adopt(), true);
  assert.equal(b.stack.adopt(), true, "a second mount effect while the step is on its way starts no second one");
  assert.equal(b.stack.inFlight(), 1);
  b.flush();
  assert.deepEqual(b.state(), SPACE);
  assert.deepEqual(b.kinds, ["other"], "the shell re-opens the room from this landing");
  // The first Back after it is not a dead press: it leaves the space.
  b.back();
  assert.equal(b.state(), HOME);
});

test("adopt on a room entry, or on the home, does nothing", () => {
  assert.equal(browser([HOME, SPACE]).stack.adopt(), false);
  assert.equal(browser([HOME]).stack.adopt(), false);
});

test("Forward onto a closed sheet's entry bounces off it", () => {
  const b = browser([HOME, SPACE]);
  b.stack.open(layer().handle);
  b.back();
  b.forward();
  assert.deepEqual(b.state(), SPACE);
  assert.deepEqual(b.kinds, ["layer", "layer", "other"]);
  assert.equal(b.stack.size(), 0);
});

test("a jump past the room entry with a sheet open: the layer closes, the pop is the room owners'", () => {
  const b = browser([HOME, SPACE]);
  const sheet = layer(() => false);
  b.stack.open(sheet.handle);
  b.back(2);
  assert.equal(b.state(), HOME);
  assert.deepEqual(b.kinds, ["other"]);
  assert.equal(sheet.seen.pops, 1);
  assert.equal(b.stack.size(), 0);
});

test("a room entry whose marks were lost still gets a sheet entry, and Back on it is the layer's", () => {
  const b = browser([HOME, { __NA: true }]);
  const sheet = layer();
  b.stack.open(sheet.handle);
  assert.deepEqual(b.state(), { sheet: 1 });
  b.back();
  assert.deepEqual(b.kinds, ["layer"]);
  assert.equal(sheet.seen.pops, 1);
});

test("a step back that never lands is forgotten after SETTLE_MS and the waiting work runs", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.stack.close(id);
  b.lose(); // the popstate never comes
  let ran = 0;
  b.stack.clearThen(() => void (ran += 1));
  assert.equal(ran, 0);
  const watchdog = b.timers.filter((t) => t.live);
  assert.equal(watchdog.length, 1);
  assert.equal(watchdog[0].ms, SETTLE_MS);
  watchdog[0].fn();
  assert.equal(b.stack.inFlight(), 0);
  assert.equal(ran, 1);
});

test("a chip tapped with the tray open: the room's id is written on the space's entry, never on the tray's", () => {
  const b = browser([HOME, SPACE]);
  const tray = layer();
  const id = b.stack.open(tray.handle);
  // ClubSpace.pickRoom: the state changes at once, the history write goes through clearThen.
  b.stack.clearThen(() => b.replace({ vibeChat: "board", depth: 1 }));
  b.stack.close(id); // the old room's composer unmounts in the same commit
  b.flush();
  assert.equal(tray.seen.pops, 1);
  assert.equal(b.index(), 1);
  assert.deepEqual(b.state(), { vibeChat: "board", depth: 1 });
  assert.deepEqual(b.kinds, ["layer"]);
  b.back();
  assert.equal(b.state(), HOME, "one Back leaves the space: no entry of the tray is left");
});

test("the header's Back with the tray open: the tray's entry first, then the space's", () => {
  const b = browser([HOME, SPACE]);
  const tray = layer();
  b.stack.open(tray.handle);
  // MessagesMobile.closeLayer.
  b.stack.clearThen(() => b.back());
  b.flush();
  assert.equal(tray.seen.pops, 1);
  assert.equal(b.state(), HOME);
  assert.deepEqual(b.kinds, ["layer", "other"]);
});

test("an event chip tapped with the tray open: the tray's entry BECOMES the event chat's (no step back, no push)", () => {
  const b = browser([HOME, SPACE]);
  const tray = layer();
  b.tap(); // "+"
  b.stack.open(tray.handle);
  b.tap(); // the chip
  // ClubSpace.openEvent → clearLayersInto.
  const modes: string[] = [];
  b.stack.clearInto((mode) => {
    modes.push(mode);
    if (mode === "replace") b.replace(EVENT);
    else b.navigate(EVENT);
  });
  assert.deepEqual(modes, ["replace"], "at once: nothing to wait for");
  assert.equal(tray.seen.pops, 1, "the tray's own state closes");
  assert.equal(b.stack.inFlight(), 0);
  b.flush();
  assert.equal(b.length(), 3);
  assert.equal(b.pushes(), 1, "the tray's push only");
  assert.deepEqual(b.state(), EVENT);
  assert.deepEqual(b.kinds, []);
  assert.equal(b.trapped(), false);
  assert.equal(b.stack.size(), 0);
  b.back();
  assert.deepEqual(b.state(), SPACE);
  assert.deepEqual(b.kinds, ["other"], "Back from the event chat is the room owners'");
  b.back();
  assert.equal(b.state(), HOME);
});

test("clearInto with nothing open tells the owner to push, at once", () => {
  const b = browser([HOME, SPACE]);
  const modes: string[] = [];
  b.tap();
  b.stack.clearInto((mode) => {
    modes.push(mode);
    b.navigate(EVENT);
  });
  assert.deepEqual(modes, ["push"]);
  assert.deepEqual(b.state(), EVENT);
  assert.equal(b.length(), 3);
  assert.equal(b.trapped(), false);
});

test("clearInto over two sheets: one step back, then the lower entry is the owner's to replace", () => {
  const b = browser([HOME, SPACE]);
  const under = layer();
  const over = layer();
  b.stack.open(under.handle);
  b.stack.open(over.handle);
  const modes: string[] = [];
  b.stack.clearInto((mode) => {
    modes.push(mode);
    b.replace(EVENT);
  });
  assert.deepEqual(modes, [], "waits for the step back");
  assert.deepEqual([under.seen.pops, over.seen.pops], [1, 1]);
  b.flush();
  assert.deepEqual(modes, ["replace"]);
  assert.equal(b.index(), 2);
  assert.deepEqual(b.state(), EVENT);
  assert.deepEqual(b.kinds, ["layer"]);
  b.back();
  assert.deepEqual(b.state(), SPACE);
});

test("clearInto after the page navigated away from the tray's entry tells the owner to push", () => {
  const b = browser([HOME, SPACE]);
  b.stack.open(layer().handle);
  b.navigate({ __NA: true });
  const modes: string[] = [];
  b.stack.clearInto((mode) => void modes.push(mode));
  assert.deepEqual(modes, ["push"], "the live entry is not one of this module's: nothing of another page is overwritten");
});

test("clearInto in the tick a layer closed in takes that layer's left-over entry", () => {
  const b = browser([HOME, SPACE]);
  const id = b.stack.open(layer().handle);
  b.stack.close(id);
  const modes: string[] = [];
  b.stack.clearInto((mode) => {
    modes.push(mode);
    b.replace(EVENT);
  });
  b.flush();
  assert.deepEqual(modes, ["replace"]);
  assert.equal(b.index(), 2);
  assert.deepEqual(b.kinds, [], "no step back");
});

// ── B (audit F07): the screen follows the live entry ─────────────────────────

test("channelOfEntry: the address first, then a { vibeChat, depth >= 1 } state, else the home", () => {
  assert.equal(channelOfEntry("?channel=room1", null), "room1");
  assert.equal(channelOfEntry("?tab=clubs&channel=%20room1%20", { vibeChat: "other", depth: 1 }), "room1", "the address wins, trimmed");
  assert.equal(channelOfEntry("", { vibeChat: "room2", depth: 1, __NA: true }), "room2");
  assert.equal(channelOfEntry("?tab=clubs", { vibeChat: "ev", depth: 2, sheet: 1 }), "ev", "a sheet's leftover entry names its room");
  assert.equal(channelOfEntry("?channel=", { vibeChat: "room2", depth: 1 }), "room2", "an empty param is no channel");
  assert.equal(channelOfEntry("", null), null);
  assert.equal(channelOfEntry("?to=blake", { __NA: true }), null);
  assert.equal(channelOfEntry("", { vibeChat: "room2", depth: 0 }), null, "depth 0 is not a layer");
});

test("arrivalWrites: a room or a dm replaces the live entry; an event room adds its layer entry, unless that entry is the live one", () => {
  assert.equal(arrivalWrites(null, "lounge", false), "space");
  assert.equal(arrivalWrites({ vibeChat: "lounge", depth: 1 }, "lounge", false), "space");
  assert.equal(arrivalWrites(null, "ev", true), "space+layer", "a fresh deep link to an event room");
  assert.equal(arrivalWrites({ vibeChat: "ev", depth: 1 }, "ev", true), "space+layer", "the week card's space entry");
  assert.equal(arrivalWrites({ vibeChat: "ev", depth: 2 }, "ev", true), "none", "back from a profile onto the event chat's own entry");
  assert.equal(arrivalWrites({ vibeChat: "other", depth: 2 }, "ev", true), "space+layer");
});

// ── B, repair: the space's entry after the event chat closed ─────────────────

test("spaceEntryAfterLayer: a space entered through an event keeps the event's id on its entry; closing the event chat rewrites it to the room on screen", () => {
  // The week card / an event deep link: depth 1 carries the EVENT id.
  assert.equal(spaceEntryNamesLayer({ vibeChat: "ev", depth: 1 }, "ev"), true);
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1, __NA: true }, "ev", "lounge"), "lounge");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1 }, "ev", "board"), "board", "the room on screen, whichever it is");
  // After the rewrite the way back from a club page opens the space only.
  assert.equal(arrivalWrites({ vibeChat: "lounge", depth: 1 }, "lounge", false), "space");
});

test("spaceEntryAfterLayer: an entry that already names a room of the space is left as it is", () => {
  // The space entered by its Lounge, the event chat opened by a chip.
  assert.equal(spaceEntryAfterLayer({ vibeChat: "lounge", depth: 1 }, "ev", "lounge"), null);
  assert.equal(spaceEntryNamesLayer({ vibeChat: "lounge", depth: 1 }, "ev"), false);
  // The Board picked from inside the layer wrote itself already.
  assert.equal(spaceEntryAfterLayer({ vibeChat: "board", depth: 1 }, "ev", "board"), null);
});

test("spaceEntryAfterLayer: only the space's own entry, and only when there is a room to name", () => {
  assert.equal(spaceEntryAfterLayer(null, "ev", "lounge"), null, "the pop left the space (the home's entry)");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 2 }, "ev", "lounge"), null, "still the layer's entry");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1, sheet: 1 }, "ev", "lounge"), null, "a sheet's entry is never rewritten");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1 }, null, "lounge"), null, "no layer was open");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1 }, "ev", null), null, "the space has not answered: written later");
  assert.equal(spaceEntryNamesLayer({ vibeChat: "ev", depth: 1 }, "ev"), true, "…and the caller remembers to");
  assert.equal(spaceEntryAfterLayer({ vibeChat: "ev", depth: 1 }, "ev", "ev"), null);
});
