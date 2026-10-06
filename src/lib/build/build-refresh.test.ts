/**
 * Tests for `build-refresh.ts`: when an open tab asks whether a newer build
 * is live, what counts as one, the loop guard, and when a reload is safe.
 *
 * Run with:
 *   node --test src/lib/build/build-refresh.test.ts
 *
 * The subject loads through a variable specifier: a literal ".ts" import
 * breaks `tsc` (TS5097), and the module has no imports, so no resolve hook
 * is needed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./build-refresh.ts";
const rules = (await import(specifier)) as typeof import("./build-refresh");
const {
  ANSWER_WITHIN_MS,
  ASK_EVERY_MS,
  blockedBy,
  BUILD_ID,
  cleanBuildId,
  controlKind,
  isDraft,
  LOADED_BUILD_KEY,
  noteLoadedBuild,
  pickerAfter,
  quietPath,
  readReloadedFor,
  reloadTarget,
  rememberReload,
  RELOADED_FOR_KEY,
  safeToReload,
  shouldAsk,
  VERSION_PATH,
} = rules;

type Snapshot = import("./build-refresh").PageSnapshot;

const A = "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3";
const B = "dpl_9Qx2LkTrVb4mNc7ZsHy1JdWfEa6u";
const T0 = 1_780_000_000_000;

/** A page with nobody doing anything. */
function idle(over: Partial<Snapshot> = {}): Snapshot {
  return { focused: null, typed: [], files: 0, holding: 0, overlays: 0, busy: 0, playing: 0, frames: [], ...over };
}

/** A tab that came back, online, on the feed, long after its last ask. */
function ask(over: Partial<Parameters<typeof shouldAsk>[0]> = {}) {
  return { mine: A, visible: true, online: true, path: "/campus", now: T0 + ASK_EVERY_MS, checkedAt: T0, ...over };
}

/** sessionStorage, as much of it as the guard uses. */
function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

test("the constants: one ask per two minutes, a public path, a short wait", () => {
  assert.equal(ASK_EVERY_MS, 120_000);
  assert.equal(VERSION_PATH, "/api/version");
  // Short: a reload seconds after coming back lands under the person's fingers.
  assert.ok(ANSWER_WITHIN_MS > 0 && ANSWER_WITHIN_MS <= 2000);
  // No NEXT_PUBLIC_BUILD_ID under `node --test`: the local-dev case.
  assert.equal(BUILD_ID, cleanBuildId(process.env.NEXT_PUBLIC_BUILD_ID));
});

test("cleanBuildId: a Vercel id passes, trimmed", () => {
  assert.equal(cleanBuildId(A), A);
  assert.equal(cleanBuildId(`  ${A}\n`), A);
  assert.equal(cleanBuildId("local-a"), "local-a");
});

test("cleanBuildId: anything else is \"\" (can't tell)", () => {
  for (const bad of [undefined, null, 0, 42, true, {}, [], "", "   ", "two words", "tab\tinside", "x".repeat(129), "naïve"]) {
    assert.equal(cleanBuildId(bad), "", JSON.stringify(bad));
  }
  assert.equal(cleanBuildId("x".repeat(128)), "x".repeat(128));
});

test("quietPath: sign-in, onboarding and the waitlist never reload themselves", () => {
  for (const path of ["/auth", "/auth/login", "/auth/signup", "/auth/verify-school", "/onboarding", "/onboarding/classic", "/waitlist", "/waitlist/confirm"]) {
    assert.equal(quietPath(path), true, path);
  }
  for (const path of ["/", "/campus", "/messages", "/profile/blake", "/legal/privacy", "/authors", "/waitlisted", "/orgs/auth"]) {
    assert.equal(quietPath(path), false, path);
  }
});

test("shouldAsk: back on the tab, two minutes or more after the last ask", () => {
  assert.equal(shouldAsk(ask()), true);
  assert.equal(shouldAsk(ask({ now: T0 + 3 * 60 * 60 * 1000 })), true);
});

test("shouldAsk: never on a fresh page, and at most once every two minutes", () => {
  // checkedAt starts as the page load, so the first seconds are covered.
  assert.equal(shouldAsk(ask({ now: T0 })), false);
  assert.equal(shouldAsk(ask({ now: T0 + 5000 })), false);
  assert.equal(shouldAsk(ask({ now: T0 + ASK_EVERY_MS - 1 })), false);
});

test("shouldAsk: no build id, hidden, offline or a quiet page all mean no", () => {
  assert.equal(shouldAsk(ask({ mine: "" })), false);
  assert.equal(shouldAsk(ask({ visible: false })), false);
  assert.equal(shouldAsk(ask({ online: false })), false);
  assert.equal(shouldAsk(ask({ path: "/auth/signup" })), false);
});

test("shouldAsk: a clock set backwards asks instead of going silent", () => {
  assert.equal(shouldAsk(ask({ now: T0 - 60 * 60 * 1000 })), true);
});

test("reloadTarget: another build is live", () => {
  assert.equal(reloadTarget({ mine: A, live: B, reloadedFor: "" }), B);
  // A rollback: the live build is an older one, and the tab follows it.
  assert.equal(reloadTarget({ mine: B, live: A, reloadedFor: "" }), A);
});

test("reloadTarget: the same build, or nothing to compare, stays", () => {
  assert.equal(reloadTarget({ mine: A, live: A, reloadedFor: "" }), "");
  assert.equal(reloadTarget({ mine: A, live: "", reloadedFor: "" }), "");
  assert.equal(reloadTarget({ mine: "", live: B, reloadedFor: "" }), "");
  assert.equal(reloadTarget({ mine: "", live: "", reloadedFor: "" }), "");
});

test("reloadTarget: the loop guard, once per build and again for the next one", () => {
  const C = "dpl_third";
  // Reloaded for B already and still on A: stay put.
  assert.equal(reloadTarget({ mine: A, live: B, reloadedFor: B }), "");
  // A third build goes live: that one is new.
  assert.equal(reloadTarget({ mine: A, live: C, reloadedFor: B }), C);
  // The guard from an earlier reload does not hold back the usual case.
  assert.equal(reloadTarget({ mine: B, live: C, reloadedFor: B }), C);
});

test("blockedBy: an idle page is safe", () => {
  assert.equal(blockedBy(idle()), null);
  assert.equal(blockedBy(idle({ frames: [idle(), idle({ frames: [idle()] })] })), null);
});

test("blockedBy: the cursor in a field that has text in it", () => {
  assert.equal(blockedBy(idle({ focused: "half a mess" })), "typing");
  // Text nobody typed on this page view still counts while the cursor is in it.
  assert.equal(blockedBy(idle({ focused: "Franky", typed: [] })), "typing");
});

test("blockedBy: the cursor in an empty field holds nothing back", () => {
  // The desktop direct-message box takes the cursor whenever a chat opens.
  assert.equal(blockedBy(idle({ focused: "" })), null);
  assert.equal(blockedBy(idle({ focused: "  \n" })), null);
  assert.equal(blockedBy(idle({ frames: [idle({ focused: "" })] })), null);
  // Not in a field at all.
  assert.equal(blockedBy(idle({ focused: null })), null);
});

test("blockedBy: a draft is text the person typed and has not sent", () => {
  assert.equal(blockedBy(idle({ typed: [{ before: "", now: "hello" }] })), "draft");
  // A saved profile field they changed, or emptied to retype.
  assert.equal(blockedBy(idle({ typed: [{ before: "Franky", now: "Frank" }] })), "draft");
  assert.equal(blockedBy(idle({ typed: [{ before: "Franky", now: "" }] })), "draft");
  // One draft among fields that are back as they were.
  assert.equal(
    blockedBy(idle({ typed: [{ before: "", now: "" }, { before: "a", now: "b" }] })),
    "draft",
  );
});

test("blockedBy: a field back to what it held is not a draft", () => {
  // Typed and sent: the composer is empty again.
  assert.equal(blockedBy(idle({ typed: [{ before: "", now: "" }] })), null);
  // Typed and undone, in a field that came prefilled.
  assert.equal(blockedBy(idle({ typed: [{ before: "Franky", now: "Franky" }] })), null);
  // Spaces and a stray newline are not a draft.
  assert.equal(blockedBy(idle({ typed: [{ before: "", now: "  \n" }] })), null);
  assert.equal(blockedBy(idle({ typed: [{ before: "hi", now: " hi " }] })), null);
});

test("controlKind: what can be typed into", () => {
  assert.equal(controlKind("TEXTAREA"), "text");
  for (const type of ["text", "search", "email", "url", "tel", "password", "number", "date", "time", ""]) {
    assert.equal(controlKind("INPUT", type), "text", type);
  }
  // A type the browser does not know is drawn as a text box.
  assert.equal(controlKind("INPUT", "something-new"), "text");
  // Tag and type in any case (a frame's XHTML document keeps lower case).
  assert.equal(controlKind("textarea"), "text");
  assert.equal(controlKind("input", "TEXT"), "text");
});

test("controlKind: what is picked, ticked or dragged", () => {
  // The phone profile's Major, Year and Campus pick-lists.
  assert.equal(controlKind("SELECT", "select-one"), "choice");
  assert.equal(controlKind("SELECT", "select-multiple"), "choice");
  for (const type of ["checkbox", "radio", "range", "color"]) {
    assert.equal(controlKind("INPUT", type), "choice", type);
  }
  assert.equal(controlKind("input", "Checkbox"), "choice");
});

test("controlKind: a file input is its own kind, and the rest hold nothing", () => {
  assert.equal(controlKind("INPUT", "file"), "file");
  for (const type of ["button", "hidden", "image", "reset", "submit"]) {
    assert.equal(controlKind("INPUT", type), null, type);
  }
  // A button's own `type` is "submit"; a chip is a button and holds nothing.
  for (const tag of ["BUTTON", "DIV", "A", "LABEL", "OPTION", "FORM"]) {
    assert.equal(controlKind(tag, "submit"), null, tag);
  }
});

test("isDraft: changed from what the person found", () => {
  assert.equal(isDraft({ before: "", now: "hello" }), true);
  assert.equal(isDraft({ before: "Accounting", now: "Biology" }), true);
  assert.equal(isDraft({ before: "off", now: "on" }), true);
  // Back as it was, or only spaces apart.
  assert.equal(isDraft({ before: "Accounting", now: "Accounting" }), false);
  assert.equal(isDraft({ before: "on", now: "on" }), false);
  assert.equal(isDraft({ before: "hi", now: " hi\n" }), false);
});

test("isDraft: nobody saw it before the change, so it counts", () => {
  assert.equal(isDraft({ before: null, now: "Biology" }), true);
  assert.equal(isDraft({ before: null, now: "" }), true);
});

test("blockedBy: a changed pick-list, checkbox or radio is a draft like typed text", () => {
  // The phone profile editor with only the Major pick-list changed.
  assert.equal(blockedBy(idle({ typed: [{ before: "Accounting", now: "Biology" }] })), "draft");
  assert.equal(blockedBy(idle({ typed: [{ before: "off", now: "on" }] })), "draft");
  assert.equal(blockedBy(idle({ typed: [{ before: null, now: "Year 2" }] })), "draft");
  // A radio group: one cleared, one picked.
  assert.equal(blockedBy(idle({ typed: [{ before: "on", now: "off" }, { before: "off", now: "on" }] })), "draft");
  // Put back the way it was: nothing to lose.
  assert.equal(blockedBy(idle({ typed: [{ before: "Accounting", now: "Accounting" }] })), null);
  assert.equal(blockedBy(idle({ typed: [{ before: "on", now: "on" }, { before: "off", now: "off" }] })), null);
});

test("pickerAfter: a pressed file input holds until it answers or the person is back", () => {
  const photo = { name: "avatar input" };
  const other = { name: "banner input" };
  // Nothing open; a click anywhere else opens nothing.
  assert.equal(pickerAfter(null, { type: "click", target: other, onFileInput: false }), null);
  // The attach button's `input.click()`, or the person's own press on the input.
  const open = pickerAfter<object>(null, { type: "click", target: photo, onFileInput: true });
  assert.equal(open, photo);
  // The phone profile in edit mode, photo tapped, nothing chosen yet: it counts as a file.
  assert.equal(blockedBy(idle({ files: open ? 1 : 0 })), "file");
  // A wheel turn, a scroll made by script, a click elsewhere: still open.
  for (const type of ["wheel", "scroll", "beforeinput", "input", "load"]) {
    assert.equal(pickerAfter(open, { type }), photo, type);
  }
  assert.equal(pickerAfter(open, { type: "click", target: other, onFileInput: false }), photo);
  // Another input's change is not this one's answer.
  assert.equal(pickerAfter(open, { type: "change", target: other }), photo);
  assert.equal(pickerAfter(open, { type: "cancel", target: other }), photo);
  // It answered: a file chosen, or closed with none.
  assert.equal(pickerAfter(open, { type: "change", target: photo }), null);
  assert.equal(pickerAfter(open, { type: "cancel", target: photo }), null);
  // No `cancel` in an older browser: the person's next tap or key press ends it.
  for (const type of ["pointerdown", "touchstart", "keydown"]) {
    assert.equal(pickerAfter(open, { type }), null, type);
  }
  // A second input pressed while the first never answered: the newest one.
  assert.equal(pickerAfter(open, { type: "click", target: other, onFileInput: true }), other);
});

test("safeToReload: an idle, visible page nobody has touched since the ask", () => {
  const moment = { visible: true, path: "/campus", touched: false, page: idle() };
  assert.equal(safeToReload(moment), true);
  // Hidden again by the time the answer came.
  assert.equal(safeToReload({ ...moment, visible: false }), false);
  // Moved to a quiet page meanwhile.
  assert.equal(safeToReload({ ...moment, path: "/auth/login" }), false);
  // In the middle of something.
  assert.equal(safeToReload({ ...moment, page: idle({ overlays: 1 }) }), false);
  assert.equal(safeToReload({ ...moment, page: idle({ holding: 1 }) }), false);
});

test("safeToReload: never under the person's fingers", () => {
  // They tapped, typed or scrolled while a slow answer was on its way.
  assert.equal(safeToReload({ visible: true, path: "/campus", touched: true, page: idle() }), false);
});

test("noteLoadedBuild: leaves this tab's build for the static profile page", () => {
  const store = fakeStore();
  noteLoadedBuild(() => store, A);
  assert.equal(store.data.get(LOADED_BUILD_KEY), A);
  // The next page load is another build: one id, the newest.
  noteLoadedBuild(() => store, B);
  assert.deepEqual([...store.data.entries()], [[LOADED_BUILD_KEY, B]]);
  // Its own key: the loop guard is left alone.
  assert.notEqual(LOADED_BUILD_KEY, RELOADED_FOR_KEY);
});

test("noteLoadedBuild: no build id clears the note, and blocked storage never throws", () => {
  const store = fakeStore({ [LOADED_BUILD_KEY]: A, [RELOADED_FOR_KEY]: B });
  noteLoadedBuild(() => store, "");
  assert.deepEqual([...store.data.entries()], [[RELOADED_FOR_KEY, B]]);
  const blocked = () => {
    throw new Error("SecurityError");
  };
  assert.doesNotThrow(() => noteLoadedBuild(blocked, A));
  assert.doesNotThrow(() => noteLoadedBuild(() => ({ getItem: () => null, setItem: blocked }), A));
});

test("blockedBy: a picked file, an open sheet, a save in flight, a film playing", () => {
  assert.equal(blockedBy(idle({ files: 1 })), "file");
  // A part of the page that says it holds unsaved work (`data-holds-reload`).
  assert.equal(blockedBy(idle({ holding: 1 })), "unsaved");
  assert.equal(blockedBy(idle({ overlays: 1 })), "overlay");
  assert.equal(blockedBy(idle({ busy: 1 })), "busy");
  assert.equal(blockedBy(idle({ playing: 1 })), "playing");
});

test("blockedBy: reports the first reason, in a fixed order", () => {
  const all = idle({ focused: "x", typed: [{ before: "", now: "x" }], files: 1, holding: 1, overlays: 1, busy: 1, playing: 1 });
  assert.equal(blockedBy(all), "typing");
  assert.equal(blockedBy({ ...all, focused: null }), "draft");
  assert.equal(blockedBy({ ...all, focused: null, typed: [] }), "file");
  assert.equal(blockedBy({ ...all, focused: null, typed: [], files: 0 }), "unsaved");
  const rest = { ...all, focused: null, typed: [], files: 0, holding: 0 };
  assert.equal(blockedBy(rest), "overlay");
  assert.equal(blockedBy({ ...rest, overlays: 0 }), "busy");
  assert.equal(blockedBy({ ...rest, overlays: 0, busy: 0 }), "playing");
});

test("blockedBy: a frame counts exactly like the page around it", () => {
  // The old direct-message composer and onboarding are frames.
  assert.equal(blockedBy(idle({ frames: [idle({ focused: "hey" })] })), "typing");
  assert.equal(blockedBy(idle({ frames: [idle({ typed: [{ before: "", now: "hey" }] })] })), "draft");
  assert.equal(blockedBy(idle({ frames: [idle(), idle({ files: 2 })] })), "file");
  assert.equal(blockedBy(idle({ frames: [idle({ holding: 1 })] })), "unsaved");
  assert.equal(blockedBy(idle({ frames: [idle({ overlays: 1 })] })), "overlay");
  assert.equal(blockedBy(idle({ frames: [idle({ busy: 1 })] })), "busy");
  assert.equal(blockedBy(idle({ frames: [idle({ playing: 1 })] })), "playing");
  // A frame inside a frame.
  assert.equal(blockedBy(idle({ frames: [idle({ frames: [idle({ playing: 1 })] })] })), "playing");
  // A frame from another site is never in the list, so it cannot block or throw.
  assert.equal(blockedBy(idle({ frames: [] })), null);
});

test("readReloadedFor: the stored build, or \"\"", () => {
  assert.equal(readReloadedFor(() => fakeStore()), "");
  assert.equal(readReloadedFor(() => fakeStore({ [RELOADED_FOR_KEY]: B })), B);
  // Junk in the slot reads as nothing.
  assert.equal(readReloadedFor(() => fakeStore({ [RELOADED_FOR_KEY]: "not an id" })), "");
});

test("readReloadedFor: blocked storage reads as \"\" and never throws", () => {
  const blocked = () => {
    throw new Error("SecurityError");
  };
  assert.equal(readReloadedFor(blocked), "");
  assert.equal(
    readReloadedFor(() => ({ getItem: blocked, setItem: () => {} })),
    "",
  );
});

test("rememberReload: writes the build first and says it stuck", () => {
  const store = fakeStore({ [RELOADED_FOR_KEY]: A });
  assert.equal(rememberReload(() => store, B), true);
  // One id, the newest; the older one is gone.
  assert.deepEqual([...store.data.entries()], [[RELOADED_FOR_KEY, B]]);
  assert.equal(readReloadedFor(() => store), B);
});

test("rememberReload: no guard, no reload", () => {
  const blocked = () => {
    throw new Error("SecurityError");
  };
  // Storage that cannot be opened, that refuses the write, or that drops it.
  assert.equal(rememberReload(blocked, B), false);
  assert.equal(rememberReload(() => ({ getItem: () => null, setItem: blocked }), B), false);
  assert.equal(rememberReload(() => ({ getItem: () => null, setItem: () => {} }), B), false);
});

test("the whole walk: reload once for B, never twice, again for C", () => {
  const store = fakeStore();
  const open = () => store;
  const C = "dpl_third";
  // B goes live; the page is idle: reload, guard written first.
  let target = reloadTarget({ mine: A, live: B, reloadedFor: readReloadedFor(open) });
  assert.equal(target, B);
  assert.equal(blockedBy(idle()), null);
  assert.equal(rememberReload(open, target), true);
  // The reload landed on the old page again: B is not a reason twice.
  assert.equal(reloadTarget({ mine: A, live: B, reloadedFor: readReloadedFor(open) }), "");
  // It landed on B: nothing to do.
  assert.equal(reloadTarget({ mine: B, live: B, reloadedFor: readReloadedFor(open) }), "");
  // C goes live while a draft is open: the target is known, the page says wait.
  target = reloadTarget({ mine: B, live: C, reloadedFor: readReloadedFor(open) });
  assert.equal(target, C);
  assert.equal(blockedBy(idle({ typed: [{ before: "", now: "half a post" }] })), "draft");
  assert.equal(readReloadedFor(open), B);
  // The draft is sent: the next ask reloads for C.
  assert.equal(blockedBy(idle({ typed: [{ before: "", now: "" }] })), null);
  assert.equal(rememberReload(open, target), true);
  assert.equal(readReloadedFor(open), C);
});
