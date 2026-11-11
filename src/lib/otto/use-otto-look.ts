"use client";

import { useSyncExternalStore } from "react";

import { DEFAULT_LOOK, LOOK_EVENT, LOOK_STORAGE_KEY, parseLook, type OttoLook } from "./look";

/**
 * Otto's look on this device, kept current (Wave 1 of the Otto build). The
 * `vibe_theme` way (src/lib/theme/theme.ts): one localStorage key, read
 * behind try/catch, and a window event so every Otto on the page repaints
 * when the person picks a new colour. Other tabs follow through the
 * `storage` event.
 *
 * No boot script on purpose: a new pre-paint script would change the pinned
 * script hashes. So the server and the first client render draw the default
 * (Ember, Living) and the stored look shows on the render after hydration.
 *
 * Saving to the account (`users.otto_settings.look`) is the caller's job,
 * like the Appearance card does for the theme.
 */

function readRaw(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LOOK_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The look stored on this device, validated; the default when missing or unreadable. */
export function readOttoLook(): OttoLook {
  const raw = readRaw();
  return raw === null ? { ...DEFAULT_LOOK } : parseLook(raw);
}

/** Saves `look` on this device and tells every Otto on the page. */
export function setOttoLook(look: OttoLook): void {
  if (typeof window === "undefined") return;
  const next = parseLook(look);
  try {
    window.localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: this page still repaints below, the next load is the default.
  }
  try {
    window.dispatchEvent(new CustomEvent<OttoLook>(LOOK_EVENT, { detail: next }));
  } catch {
    // No window events: nothing listens.
  }
}

// useSyncExternalStore wants the same object back while nothing changed, so
// the last parse is kept against the raw string it came from. A failed write
// (blocked storage) still repaints this page through `eventLook`.
let snapRaw: string | null | undefined;
let snapLook: OttoLook = DEFAULT_LOOK;
let eventLook: OttoLook | null = null;

function snapshot(): OttoLook {
  if (eventLook) return eventLook;
  const raw = readRaw();
  if (raw !== snapRaw) {
    snapRaw = raw;
    snapLook = raw === null ? DEFAULT_LOOK : parseLook(raw);
  }
  return snapLook;
}

function serverSnapshot(): OttoLook {
  return DEFAULT_LOOK;
}

function subscribe(onChange: () => void): () => void {
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<unknown>).detail;
    // The stored value wins when the write went through; the event's look only
    // stands in when storage is blocked (readRaw() is null then).
    eventLook = readRaw() === null && detail ? parseLook(detail) : null;
    onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LOOK_STORAGE_KEY) {
      eventLook = null;
      onChange();
    }
  };
  window.addEventListener(LOOK_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOOK_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

/** Otto's look on this device; the default on the server and at hydration. */
export function useOttoLook(): OttoLook {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
