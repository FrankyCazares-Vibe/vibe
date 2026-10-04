"use client";

import type { ClubPaneProps } from "./contracts";

/**
 * A club open on desktop Messages: the header, the room chips, the thread,
 * the composer and the right panel (wave-3 contract 3.1, 3.3). A placeholder
 * for now: the FINAL props, nothing drawn. Wave 5 (W3-5-club) replaces the
 * body; the shell already mounts it with `key={orgHandle}` inside the pane
 * box, so nothing imports differently then.
 */
export function ClubPane(props: ClubPaneProps) {
  void props;
  return null;
}
