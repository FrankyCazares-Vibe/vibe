/**
 * Reads the page for the rules in build-refresh.ts: is the person in the
 * middle of something? Browser only. It reads and counts; it never changes
 * the page, and nothing it reads is stored or sent anywhere.
 *
 * Elements are told apart by `tagName`, never `instanceof`: an element
 * inside a frame belongs to the frame's own window, so `instanceof
 * HTMLInputElement` is false for it out here.
 */

import { controlKind, pickerAfter, type PageSnapshot } from "./build-refresh";

/** Frames inside frames are followed this deep (the resume preview sits two down). */
const MAX_FRAME_DEPTH = 3;

/** Everything a person can type in or change. */
const CONTROLS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * A part of the page that says it holds unsaved work, for work no form
 * control shows: a tapped chip, a picked video, a post being sent. The
 * component sets it only while that is true (`data-holds-reload={dirty ||
 * undefined}`; a plain `false` is written out by React as "false", and is
 * read as off here too). It counts wherever it is drawn, scrolled out of
 * view included.
 */
const HOLDS = '[data-holds-reload]:not([data-holds-reload="false"])';

/** Dialogs and sheets (vaul's drawers are `role="dialog"` too), and open menus. */
const OVERLAYS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"], dialog[open], [data-vaul-drawer]';

/**
 * A drawer that is a whole screen, not a sheet over one. On a phone the
 * conversation, the club space and the event chat are vaul drawers, and each
 * is named by the address (`/messages?channel=<id>`), so a reload opens it
 * again. They carry this attribute and are not counted as open sheets;
 * without it a phone with a chat open would never reload. A sheet opened
 * inside one of them is its own element and still counts.
 */
const WHOLE_SCREEN = "[data-survives-reload]";

/**
 * A picked file, as the app shows it. Most composers empty their file input
 * the moment a file is picked and keep the file in memory, so the input says
 * nothing; what stays on the page is the preview, a `blob:` address in
 * `src`, `poster` or an inline background. The desktop feed composer is the
 * other way round for a video (its name on screen, the file still in the
 * input), so both are counted.
 */
const LOCAL_PREVIEWS = '[src^="blob:"], [poster^="blob:"], [style*="blob:"]';

/**
 * What each field held just before the person first typed in it, for this
 * page view. The DOM's own `defaultValue` cannot answer that here: React
 * rewrites it to the current text on every keystroke of a controlled field
 * (so a draft looks untouched), and a field the static pages fill in from
 * script looks typed-in for ever.
 */
const typedIn = new WeakMap<Element, string | null>();

/**
 * What a pick-list, checkbox, radio button or slider held when the person
 * pressed on it, before the change that follows. These controls have no
 * `beforeinput`, so this is the only look at the value as they found it.
 */
const found = new WeakMap<Element, string>();

/** How many times the person tapped, pressed a key or scrolled, in this page and its frames. */
let gestures = 0;

/**
 * The file input whose picker or camera is open over the page, in this page
 * or one of its frames; null when none is (the rule is `pickerAfter`).
 */
let picker: Element | null = null;

function kindOf(el: Element) {
  return controlKind(el.tagName, (el as HTMLInputElement).type ?? "");
}

function isTextField(el: Element): boolean {
  return kindOf(el) === "text";
}

/** What a control holds now, as text. */
function valueOf(el: Element): string {
  if (el.tagName === "SELECT") {
    return Array.from((el as HTMLSelectElement).selectedOptions, (o) => o.value).join("\n");
  }
  const kind = kindOf(el);
  if (kind === null) return el.textContent ?? "";
  const input = el as HTMLInputElement;
  if (input.type === "checkbox" || input.type === "radio") return input.checked ? "on" : "off";
  return input.value;
}

/**
 * The control an event belongs to: the input, pick-list or textarea itself,
 * the control behind a pressed label, or the whole editable region.
 */
function fieldOf(target: EventTarget | null): Element | null {
  const el = target as HTMLElement | null;
  if (!el || el.nodeType !== 1) return null;
  const kind = kindOf(el);
  if (kind === "text" || kind === "choice") return el;
  if (el.isContentEditable) {
    let host = el;
    while (host.parentElement?.isContentEditable) host = host.parentElement;
    return host;
  }
  // A row of a pick-list drawn open, or the label of a checkbox.
  const owner = el.closest("select") ?? (el.closest("label") as HTMLLabelElement | null)?.control;
  return owner && kindOf(owner) === "choice" ? owner : null;
}

/** A radio button's whole group (picking one clears another, with no event of its own). */
function groupOf(el: Element): Element[] {
  const radio = el as HTMLInputElement;
  if (radio.type !== "radio" || !radio.name) return [el];
  const all = Array.from(el.ownerDocument.querySelectorAll('input[type="radio"]'));
  return all.filter((r) => {
    const other = r as HTMLInputElement;
    return other.name === radio.name && other.form === radio.form;
  });
}

/**
 * The person's own tap, key press, wheel turn or scroll (`isTrusted`).
 * Counted so BuildRefresh can tell they are already doing something while an
 * answer is on its way, and the place a choice is seen before it changes.
 */
function onGesture(event: Event): void {
  if (!event.isTrusted) return;
  gestures += 1;
  picker = pickerAfter(picker, { type: event.type });
  const field = fieldOf(event.target);
  if (!field || kindOf(field) !== "choice") return;
  for (const el of groupOf(field)) {
    if (!found.has(el)) found.set(el, valueOf(el));
  }
}

/**
 * A click on a file input opens the device's picker or camera; `change` or
 * `cancel` on it is the answer. The click is heard trusted or not: the
 * attach buttons open their hidden input with `input.click()`, which is a
 * script's click. The press on the button itself came first, so it does not
 * end what it starts.
 */
function onPicker(event: Event): void {
  const el = event.target as Element | null;
  if (!el || el.nodeType !== 1) return;
  picker = pickerAfter(picker, { type: event.type, target: el, onFileInput: kindOf(el) === "file" });
}

/** How many gestures so far: a different number later means the person did something in between. */
export function gestureCount(): number {
  return gestures;
}

/**
 * Only the person's own typing and choosing counts (`isTrusted`), never a
 * script filling a field. `beforeinput` comes before the change, so the text
 * read there is the field as they found it. An `input` with no `beforeinput`
 * ahead of it (autofill, an old browser) has changed it already: assume it
 * was empty. A choice is noted with what `onGesture` saw, or null when it
 * saw nothing, which counts as changed.
 */
function onTyping(event: Event): void {
  if (!event.isTrusted) return;
  const field = fieldOf(event.target);
  if (!field) return;
  if (kindOf(field) === "choice") {
    if (event.type === "beforeinput") return;
    for (const el of groupOf(field)) {
      if (!typedIn.has(el)) typedIn.set(el, found.get(el) ?? null);
    }
    return;
  }
  if (event.type === "change" || typedIn.has(field)) return;
  typedIn.set(field, event.type === "beforeinput" ? valueOf(field) : "");
}

/** A frame's document, or null when it belongs to another site or is not there. */
function frameDocument(frame: Element): Document | null {
  try {
    return (frame as HTMLIFrameElement).contentDocument;
  } catch {
    return null;
  }
}

/** A frame finished loading (a new one, or the same one on another page): listen in it too. */
function onFrameLoad(event: Event): void {
  const frame = event.target as Element | null;
  if (frame?.tagName !== "IFRAME") return;
  const inner = frameDocument(frame);
  if (inner) watch(inner, 1);
}

/** Heard on the way down (capture), and never able to slow a scroll (passive). */
const QUIETLY = { capture: true, passive: true };

const TYPING = ["beforeinput", "input", "change"];
const GESTURES = ["pointerdown", "touchstart", "keydown", "wheel"];
const PICKING = ["click", "change", "cancel"];

function listen(doc: Document, on: boolean): void {
  const set = on ? doc.addEventListener.bind(doc) : doc.removeEventListener.bind(doc);
  for (const type of TYPING) set(type, onTyping, true);
  for (const type of PICKING) set(type, onPicker, true);
  for (const type of GESTURES) set(type, onGesture, QUIETLY);
  // Not capturing: only the page's own scroll arrives here, not every
  // scrolling box inside it (a chat that follows its newest message).
  set("scroll", onGesture);
  // `load` does not bubble, but a capturing listener hears a frame's.
  set("load", onFrameLoad, true);
}

/** Adding the same listener twice is a no-op, so this is safe to repeat. */
function watch(doc: Document, depth: number): void {
  listen(doc, true);
  if (depth >= MAX_FRAME_DEPTH) return;
  doc.querySelectorAll("iframe").forEach((frame) => {
    const inner = frameDocument(frame);
    if (inner) watch(inner, depth + 1);
  });
}

/**
 * Starts noting what the person types in, changes and touches, on this page
 * and in its same-origin frames. Returns the stop function.
 */
export function watchTyping(): () => void {
  // The window loses focus when the person clicks into a frame, which is
  // before they can type there: this catches a frame still loading, ahead
  // of its `load`.
  const onBlur = () => watch(document, 0);
  watch(document, 0);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("blur", onBlur);
    listen(document, false);
  };
}

/** `checkVisibility` under both spellings of its options (Chrome 105 knew only the older pair). */
const VISIBLE = {
  opacityProperty: true,
  visibilityProperty: true,
  checkOpacity: true,
  checkVisibilityCSS: true,
};

/**
 * Really on screen, not merely in the page: the static pages keep their
 * dialogs in the markup and hide them, and a closed sheet can sit just below
 * the window. When in doubt the answer is yes, because a wrong yes only
 * delays a reload and a wrong no could cost someone their work.
 */
function shown(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  // `display: none`, on it or anywhere above it.
  if (el.getClientRects().length === 0) return false;
  if (typeof el.checkVisibility === "function") {
    if (!el.checkVisibility(VISIBLE)) return false;
  } else if (view.getComputedStyle(el).visibility === "hidden") {
    return false;
  }
  const box = el.getBoundingClientRect();
  // No size of its own: a wrapper whose children are `position: fixed`.
  if (box.width === 0 || box.height === 0) return true;
  return box.bottom > 0 && box.right > 0 && box.top < view.innerHeight && box.left < view.innerWidth;
}

function countShown(doc: Document, selector: string, except?: string): number {
  let count = 0;
  doc.querySelectorAll(selector).forEach((el) => {
    if (except && el.matches(except)) return;
    if (shown(el)) count += 1;
  });
  return count;
}

/** Would a key press go into this element as text? */
function typesInto(el: Element | null): el is Element {
  if (!el) return false;
  return isTextField(el) || (el as HTMLElement).isContentEditable === true;
}

/**
 * The page as it is right now. `focused` follows the real focus down the
 * frames: every document remembers a last-focused element, but only the
 * chain from the top holds the cursor.
 */
export function takeSnapshot(doc: Document = document, focused = true, depth = 0): PageSnapshot {
  const active = focused ? doc.activeElement : null;

  const typed: PageSnapshot["typed"] = [];
  doc.querySelectorAll(CONTROLS).forEach((el) => {
    const before = typedIn.get(el);
    if (before !== undefined) typed.push({ before, now: valueOf(el) });
  });

  // Drawn at all, not "inside the window": the Save bar it sits on may be
  // scrolled away while the unsaved work is still there.
  let holding = 0;
  doc.querySelectorAll(HOLDS).forEach((el) => {
    if (el.getClientRects().length > 0) holding += 1;
  });

  let files = countShown(doc, LOCAL_PREVIEWS);
  // The device's picker or camera is open, in this page or any frame of it:
  // a file is on its way. Counted once, at the top.
  if (depth === 0 && picker) files += 1;
  doc.querySelectorAll('input[type="file"]').forEach((el) => {
    if (((el as HTMLInputElement).files?.length ?? 0) > 0) files += 1;
  });

  let playing = 0;
  doc.querySelectorAll("video, audio").forEach((el) => {
    const media = el as HTMLMediaElement;
    if (!media.paused && !media.ended) playing += 1;
  });

  const frames: PageSnapshot[] = [];
  if (depth < MAX_FRAME_DEPTH) {
    doc.querySelectorAll("iframe").forEach((frame) => {
      const inner = frameDocument(frame);
      if (!inner) return;
      watch(inner, depth + 1);
      frames.push(takeSnapshot(inner, active === frame, depth + 1));
    });
  }

  return {
    focused: typesInto(active) ? valueOf(active) : null,
    typed,
    files,
    holding,
    overlays: countShown(doc, OVERLAYS, WHOLE_SCREEN),
    busy: countShown(doc, '[aria-busy="true"]'),
    playing,
    frames,
  };
}
