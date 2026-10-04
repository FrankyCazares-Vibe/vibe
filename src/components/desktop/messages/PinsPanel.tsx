"use client";

import type { PinsPanelProps } from "./contracts";

/**
 * Pinned and Shared, the right panel of a direct message or a group chat on
 * desktop (wave-3 contract 3.1, 4d.5). A placeholder for now: the FINAL
 * props, nothing drawn. Wave 5 (W3-5-pins) replaces the body; the shell
 * already mounts it in its 288px box (a column beside the thread, or over it
 * when the window is narrow), so nothing imports differently then.
 */
export function PinsPanel(props: PinsPanelProps) {
  void props;
  return null;
}
