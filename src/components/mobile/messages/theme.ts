"use client";

import { useSyncExternalStore } from "react";

import { currentTheme, THEME_EVENT } from "@/lib/theme/theme";

// Inline styles for the bottom-sheet primitives so every sheet in this
// file gets the same iOS-native look (cream surface, rounded top,
// safe-area-aware bottom, drag handle). vaul owns the open/close
// animation, drag-to-dismiss, focus trap, and scroll lock.

// Night (S67 wave 3): the thread's chrome and bubbles already have a dark
// palette for org backdrops, so in Night a cream-scene thread (a DM or a
// group) wears that same palette on the near-black paper. `data-theme` on
// <html> is the truth; applyTheme announces every change with THEME_EVENT.
// Light has no event to miss: the boot script sets the attribute first.
function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

export function useNightTheme(): boolean {
  return useSyncExternalStore(
    subscribeTheme,
    () => currentTheme() === "dark",
    () => false,
  );
}
