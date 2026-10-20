/**
 * The calendar sync (Oct 19, 2026, critique D12): one local event per tick,
 * a channel message fires the other pages' local event, nothing echoes back,
 * a hidden tab waits for its return. Run with:
 *   node --test src/lib/calendar/calendar-sync.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SyncChannel, SyncHost } from "./calendar-sync";

// Node's type stripping needs the extension and tsc refuses it in a static
// import, so the module is loaded through a variable (metrics-count.test.ts).
const specifier = "./calendar-sync.ts";
const { CALENDAR_CHANNEL, CALENDAR_MESSAGE, createCalendarSync, isCalendarMessage, shouldRefreshOnReturn } = (await import(
  specifier
)) as typeof import("./calendar-sync");

/** A fake BroadcastChannel hub: a post reaches every OTHER channel of the same name. */
function makeHub() {
  const channels: { name: string; listeners: ((ev: { data: unknown }) => void)[]; closed: boolean }[] = [];
  let posts = 0;
  const open = (name: string): SyncChannel => {
    const me = { name, listeners: [] as ((ev: { data: unknown }) => void)[], closed: false };
    channels.push(me);
    return {
      postMessage(message) {
        posts += 1;
        for (const other of channels) {
          if (other === me || other.closed || other.name !== name) continue;
          for (const fn of other.listeners) fn({ data: message });
        }
      },
      addEventListener(_type, listener) {
        me.listeners.push(listener);
      },
      close() {
        me.closed = true;
      },
    };
  };
  return { open, posts: () => posts, names: () => channels.map((c) => c.name) };
}

/** A fake page: counts its local events; microtasks run on `flush()`. */
function makePage(hub: ReturnType<typeof makeHub> | null, opts: { hidden?: boolean; channelThrows?: boolean } = {}) {
  let fired = 0;
  let hidden = opts.hidden ?? false;
  const visible: (() => void)[] = [];
  const queue: (() => void)[] = [];
  const host: SyncHost = {
    dispatch: () => {
      fired += 1;
    },
    isHidden: () => hidden,
    onVisible: (fn) => {
      visible.push(fn);
    },
    openChannel: (name) => {
      if (opts.channelThrows) throw new Error("SecurityError");
      return hub ? hub.open(name) : null;
    },
    schedule: (fn) => {
      queue.push(fn);
    },
  };
  const sync = createCalendarSync(host);
  return {
    sync,
    fired: () => fired,
    flush: () => {
      while (queue.length) queue.shift()!();
    },
    show: () => {
      hidden = false;
      for (const fn of visible) fn();
    },
  };
}

test("a local emit fires the page's own event once, even when two places emit in the same tick", () => {
  const hub = makeHub();
  const page = makePage(hub);
  page.sync.emit();
  page.sync.emit();
  assert.equal(page.fired(), 0, "nothing until the tick ends");
  page.flush();
  assert.equal(page.fired(), 1);
  assert.equal(hub.posts(), 1, "one message on the channel");
  page.sync.emit();
  page.flush();
  assert.equal(page.fired(), 2, "a later emit fires again");
  assert.deepEqual(hub.names(), [CALENDAR_CHANNEL], "one channel per page, named vibe-calendar");
});

test("a channel message fires the other page's local event, and nothing echoes back", () => {
  const hub = makeHub();
  const tabA = makePage(hub);
  const frame = makePage(hub);
  tabA.sync.connect();
  frame.sync.connect();
  frame.sync.emit();
  frame.flush();
  assert.equal(frame.fired(), 1, "the frame that RSVP'd heard itself once");
  assert.equal(tabA.fired(), 1, "the page around it heard it once");
  tabA.flush();
  frame.flush();
  assert.equal(hub.posts(), 1, "the listener did not post back");
  assert.equal(frame.fired(), 1, "no echo reached the sender");
});

test("a page that only listens hears other pages once it is connected", () => {
  const hub = makeHub();
  const listener = makePage(hub);
  const writer = makePage(hub);
  writer.sync.emit();
  writer.flush();
  assert.equal(listener.fired(), 0, "not connected yet: the channel wasn't open");
  listener.sync.connect();
  writer.sync.emit();
  writer.flush();
  assert.equal(listener.fired(), 1);
});

test("a hidden tab waits and fires once when it is looked at again", () => {
  const hub = makeHub();
  const background = makePage(hub, { hidden: true });
  const writer = makePage(hub);
  background.sync.connect();
  writer.sync.emit();
  writer.flush();
  writer.sync.emit();
  writer.flush();
  assert.equal(background.fired(), 0);
  background.show();
  assert.equal(background.fired(), 1, "two messages, one read");
  background.show();
  assert.equal(background.fired(), 1, "a later return with nothing new fires nothing");
});

test("no BroadcastChannel, or one that throws: the page's own event still fires", () => {
  const none = makePage(null);
  none.sync.emit();
  none.flush();
  assert.equal(none.fired(), 1);
  const refused = makePage(makeHub(), { channelThrows: true });
  refused.sync.emit();
  refused.flush();
  assert.equal(refused.fired(), 1);
});

test("only the calendar message counts", () => {
  assert.equal(isCalendarMessage(CALENDAR_MESSAGE), true);
  assert.equal(isCalendarMessage({ type: "calendar-changed", v: 1 }), true);
  assert.equal(isCalendarMessage({ type: "calendar-changed", v: 2 }), false);
  assert.equal(isCalendarMessage({ type: "something-else", v: 1 }), false);
  assert.equal(isCalendarMessage("calendar-changed"), false);
  assert.equal(isCalendarMessage(null), false);
});

test("a return to the tab re-reads at most every 30 seconds", () => {
  assert.equal(shouldRefreshOnReturn(null, 1_000), true, "never read: read");
  assert.equal(shouldRefreshOnReturn(1_000, 1_000 + 29_999), false);
  assert.equal(shouldRefreshOnReturn(1_000, 1_000 + 30_000), true);
});
