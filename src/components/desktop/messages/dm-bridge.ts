/**
 * The dm bridge's protocol (handoffs/chat-redesign/wave-3-desktop/contract.md
 * 5.3; W3-1-pure): the names both sides say, the guards the shell runs on
 * what it hears, and the frame's one URL. A direct message or a group chat on
 * desktop is today's page (`public/html/messages.html`) shown thread-only in
 * ONE iframe ("pane mode", 5.1) and driven by `postMessage`.
 *
 * No React, no DOM: `node --test` loads it (dm-bridge.test.ts). The page is
 * plain JavaScript and cannot import this file; it writes the same names by
 * hand (5.2 items 1 and 2), so a change here is a change there and a bump of
 * `DM_BRIDGE_VERSION`.
 */

/** The protocol's version: the `v` of every message, and the frame URL's cache-buster. */
export const DM_BRIDGE_VERSION = 1;

/**
 * The frame's URL, always exactly this (5.1). `app=1` is required by the
 * proxy; `embedded=1` and `pane=1` put the page in pane mode. It NEVER carries
 * `to` or `channel` and never changes after mount: chats switch by `open`.
 */
export function paneSrc(): string {
  return `/html/messages.html?app=1&embedded=1&pane=1&v=${DM_BRIDGE_VERSION}`;
}

/** page -> shell: `{ source: "vibe-dm", v: 1, type, ... }`. */
export type DmPageEvent =
  | { type: "ready" }
  | { type: "opened"; channelId: string; kind: "dm" | "group"; isRequest: boolean }
  /** Not in the list after one reload, or the server refused. */
  | { type: "open-failed"; channelId: string; message: string }
  | { type: "read"; channelId: string }
  | { type: "activity"; channelId: string; reason: "sent" | "received" }
  | { type: "list-changed" }
  /** `lost`: not the viewer's doing (removed from the group, the read began to answer 403 / 404). */
  | { type: "closed"; channelId: string; reason: "declined" | "blocked" | "deleted" | "left" | "lost" }
  /** Esc in the page with nothing of its own to close (5.2 item 12). */
  | { type: "escape" }
  /** The page opened its Chat info: the shell closes Pinned and Shared. */
  | { type: "info-opened" }
  | { type: "pins-toggle"; channelId: string }
  | { type: "pins-changed"; channelId: string }
  | { type: "jump-missed"; messageId: string };

/** shell -> page: `{ source: "vibe-shell", v: 1, type, ... }`. */
export type DmShellCommand =
  /** wantedId = id; close the page's own overlays; openT(id); unknown id: one `__dmLoadList()` then retry ONLY if wantedId is still id, then `open-failed`. */
  | { type: "open"; channelId: string }
  /** wantedId = null, active = null, clear pollTimer, hide `#cContent`, close Chat info and every other overlay. */
  | { type: "close" }
  /** Scroll `[data-mid]` into view and flash it, else `jump-missed`. */
  | { type: "jump"; messageId: string }
  /** An unpin made in the panel: refetch the pinned ids. */
  | { type: "pins-changed"; channelId: string }
  /** The header button shows pressed while the panel is open; `open: true` also closes the page's Chat info. */
  | { type: "panel-state"; open: boolean };

const CLOSED_REASONS = ["declined", "blocked", "deleted", "left", "lost"] as const;

/** An id on the wire: a string that is not empty. */
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * What the page said, or null: null unless `source === "vibe-dm"`, `v === 1`
 * and every field of that type has the right type. The answer is a fresh
 * object holding the pinned fields only, so nothing else the page (or a
 * script inside it) put on the message reaches the shell.
 */
export function parsePageEvent(data: unknown): DmPageEvent | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "vibe-dm" || d.v !== DM_BRIDGE_VERSION) return null;
  switch (d.type) {
    case "ready":
    case "list-changed":
    case "escape":
    case "info-opened":
      return { type: d.type };
    case "opened":
      if (!id(d.channelId) || (d.kind !== "dm" && d.kind !== "group") || typeof d.isRequest !== "boolean") return null;
      return { type: "opened", channelId: d.channelId, kind: d.kind, isRequest: d.isRequest };
    case "open-failed":
      if (!id(d.channelId) || typeof d.message !== "string") return null;
      return { type: "open-failed", channelId: d.channelId, message: d.message };
    case "read":
    case "pins-toggle":
    case "pins-changed":
      return id(d.channelId) ? { type: d.type, channelId: d.channelId } : null;
    case "activity":
      if (!id(d.channelId) || (d.reason !== "sent" && d.reason !== "received")) return null;
      return { type: "activity", channelId: d.channelId, reason: d.reason };
    case "closed": {
      const reason = CLOSED_REASONS.find((r) => r === d.reason);
      return id(d.channelId) && reason ? { type: "closed", channelId: d.channelId, reason } : null;
    }
    case "jump-missed":
      return id(d.messageId) ? { type: "jump-missed", messageId: d.messageId } : null;
    default:
      return null;
  }
}

/** A command as it goes on the wire: the command's own fields under the shell's `source` and `v`. */
export function shellMessage(command: DmShellCommand): { source: "vibe-shell"; v: 1 } & DmShellCommand {
  return { ...command, source: "vibe-shell", v: DM_BRIDGE_VERSION };
}

/**
 * True only for a `message` event that came from our own frame: the same
 * origin AND the frame's own window. A frame that is not mounted yet (no
 * window) vouches for nothing: an event whose `source` is null must not pass
 * as "equal to the missing window".
 */
export function fromFrame(event: { origin: string; source: unknown }, ownOrigin: string, frameWindow: unknown): boolean {
  if (frameWindow === null || frameWindow === undefined) return false;
  return event.origin === ownOrigin && event.source === frameWindow;
}
