"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { toastSendFailure } from "@/components/mobile/messages/send-failure";
import { vibeRequest } from "@/lib/feedback/request";

import { pinnedIds } from "./pin-rules";
import type { MessagePinsResponse, PinMessageResponse, PinnedMessage } from "./types";

/**
 * `useMessagePins(threadId, { enabled, pollMs? })`: the pinned MESSAGES of a
 * dm or a group chat, for the desktop Pinned and Shared panel and the
 * phone's `Pinned messages` sheet (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4d.4; the routes are 4.3).
 *
 * Not "Pin to top": that pins a CHAT in my own list
 * (`/api/me/threads/<id>/pin`). A pin here is for everyone in the chat.
 *
 * - reads `GET /api/me/threads/<id>/message-pins` when `enabled` and on
 *   `reload()`; with `pollMs` (20000 on the open panel) again every `pollMs`
 *   while the page is visible, and at once when it becomes visible;
 * - a 404 (the switch is off for this person, or the table is not in this
 *   database yet) sets `available` false: every pin control hides, and the
 *   timer stops asking until `reload()`. So does `pins_chats_only` (a club
 *   room). Before the first answer `available` is still true and `pins` is
 *   null: a screen shows a pin control only on `available && pins !== null`
 *   (see `MessagePins.available`);
 * - the FIRST read failing is `failure` (`LoadFailed` with Retry =
 *   `reload`); a later read that fails is silent and the list stays;
 * - `pin` / `unpin` are optimistic: `isPinned` answers the new state at
 *   once, and an unpinned message leaves `pins` at once (a newly pinned one
 *   joins with the next read: its quote comes from the server). A refusal
 *   toasts the server's sentence and reverts. Either way the list is read
 *   again;
 * - the state is tagged with its chat, so another `threadId` reads as
 *   "nothing yet" without a reset inside an effect; an answer that outlived
 *   its chat or its mount is dropped by generation (`useRoomPoll`'s idiom).
 */

export type MessagePins = {
  /** Newest pin first; null until the first answer. */
  pins: PinnedMessage[] | null;
  /**
   * False after a 404 (or `pins_chats_only`): this chat has no pins for this
   * person. TRUE before the first answer too, and again for every new
   * `threadId`: it means "not known to be unavailable", not "ready". So:
   * - a pin CONTROL (`Pin message`, the hover pin, the header's pin button,
   *   `Pinned messages`) is shown only when `available && pins !== null`.
   *   Until the list has answered nobody may press one: on a database
   *   without the table the PUT would answer 404 and toast;
   * - the "not available" line is shown on `!available` alone. (Starting
   *   false instead would flash that line on every open.)
   */
  available: boolean;
  /** The first read's failure; null once a read answered. */
  failure: LoadFailure | null;
  isPinned: (messageId: string) => boolean;
  /** Optimistic; a refusal toasts its sentence and reverts. True when the server said yes. */
  pin: (messageId: string) => Promise<boolean>;
  unpin: (messageId: string) => Promise<boolean>;
  reload: () => void;
};

/**
 * Whether a pin's one-line quote was CUT (so `Show all` has more to show):
 * `text` is not the whole message on one line. NOT a length test: a message
 * with line breaks or runs of spaces is longer than its quote and still
 * whole ("Bring:\n\ncups,  ice" reads "Bring: cups, ice"). The one place
 * this rule lives; the panel and the phone's sheet both call it.
 */
export function pinTextCut(pin: Pick<PinnedMessage, "text" | "full_text">): boolean {
  return pin.text !== pin.full_text.replace(/\s+/g, " ").trim();
}

/** The first read's failure line. */
export const PINS_LOAD_LINE = "Couldn't load pinned messages.";
const PIN_LINE = "Couldn't pin that message.";
const UNPIN_LINE = "Couldn't unpin that message.";

/**
 * My pin or unpin of one message, until the list says the same. `token`
 * names the call (a second tap on the same message replaces the first);
 * `settledAt` is null while the request is out, then the number of list
 * reads started by the time it answered: a read started later has seen it.
 */
type Pending = { pinned: boolean; token: number; settledAt: number | null };

type PinsState = {
  threadId: string | null;
  pins: PinnedMessage[] | null;
  available: boolean;
  failure: LoadFailure | null;
  pending: ReadonlyMap<string, Pending>;
};

const NOTHING_PENDING: ReadonlyMap<string, Pending> = new Map();
const EMPTY: PinsState = { threadId: null, pins: null, available: true, failure: null, pending: NOTHING_PENDING };

function listUrl(threadId: string): string {
  return `/api/me/threads/${encodeURIComponent(threadId)}/message-pins`;
}

function pinUrl(threadId: string, messageId: string): string {
  return `/api/me/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/pin`;
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useMessagePins(threadId: string | null, options: { enabled: boolean; pollMs?: number }): MessagePins {
  const { enabled, pollMs } = options;

  const [state, setState] = useState<PinsState>(EMPTY);
  // The latest state, for the reads and writes that decide on it outside a
  // render; every write goes through `commit`.
  const stateRef = useRef(state);
  // Bumped on every chat change and unmount: an answer that comes back with
  // another generation is dropped.
  const genRef = useRef(0);
  // Counts the list reads started; `appliedRef` is the newest one whose
  // answer is on screen (a slow older read never overwrites a newer one).
  const readSeqRef = useRef(0);
  const appliedRef = useRef(0);
  const tokenRef = useRef(0);

  const commit = useCallback((next: PinsState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** The state of chat `id`, or a fresh one when the state on hand is another chat's. */
  const stateOf = useCallback(
    (id: string): PinsState => (stateRef.current.threadId === id ? stateRef.current : { ...EMPTY, threadId: id }),
    [],
  );

  const read = useCallback(
    async (id: string, gen: number) => {
      const seq = (readSeqRef.current += 1);
      const r = await vibeRequest<MessagePinsResponse>(listUrl(id), {
        cache: "no-store",
        quiet: true,
        failure: PINS_LOAD_LINE,
      });
      if (genRef.current !== gen || seq < appliedRef.current) return;
      const prev = stateOf(id);
      // No pins in this chat for this person: the switch is off, the table
      // is not there yet, or it is a club room. Nothing to retry on a timer.
      if (!r.ok && (r.status === 404 || r.code === "pins_chats_only")) {
        appliedRef.current = seq;
        commit({ ...EMPTY, threadId: id, available: false });
        return;
      }
      if (!r.ok || !Array.isArray(r.data?.pins)) {
        if (prev.pins === null) commit({ ...prev, failure: asLoadFailure(r, PINS_LOAD_LINE) });
        return;
      }
      appliedRef.current = seq;
      // A write this read was started after is in the list now: its overlay goes.
      const pending = new Map<string, Pending>();
      for (const [messageId, mine] of prev.pending) {
        if (mine.settledAt === null || mine.settledAt >= seq) pending.set(messageId, mine);
      }
      commit({ threadId: id, pins: r.data.pins, available: true, failure: null, pending });
    },
    [commit, stateOf],
  );

  // The schedule: one read when the chat opens (or `enabled` turns true),
  // then every `pollMs` while visible.
  useEffect(() => {
    if (!threadId || !enabled) return;
    const gen = (genRef.current += 1);
    void read(threadId, gen);
    const leave = () => {
      genRef.current += 1;
    };
    if (!pollMs || pollMs <= 0) return leave;

    const tick = () => {
      if (!isVisible()) return;
      const now = stateRef.current;
      if (now.threadId === threadId && !now.available) return;
      void read(threadId, gen);
    };
    const timer = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      leave();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [threadId, enabled, pollMs, read]);

  /** Pin (`true`) or unpin one message: the overlay first, then the request, then the list again. */
  const write = useCallback(
    async (messageId: string, pinned: boolean): Promise<boolean> => {
      if (!threadId || !enabled) return false;
      const id = threadId;
      const gen = genRef.current;
      const before = stateOf(id);
      if (!before.available) return false;
      const token = (tokenRef.current += 1);
      commit({ ...before, pending: new Map(before.pending).set(messageId, { pinned, token, settledAt: null }) });

      const r = await vibeRequest<PinMessageResponse>(pinUrl(id, messageId), {
        method: pinned ? "PUT" : "DELETE",
        quiet: true,
        failure: pinned ? PIN_LINE : UNPIN_LINE,
      });

      // The overlay is settled even when the chat was left meanwhile (it must
      // not outlive its request); a newer tap on the same message owns it now
      // and is left alone.
      const after = stateRef.current;
      if (after.threadId === id && after.pending.get(messageId)?.token === token) {
        const pending = new Map(after.pending);
        if (r.ok) pending.set(messageId, { pinned, token, settledAt: readSeqRef.current });
        else pending.delete(messageId);
        commit({ ...after, pending });
      }
      // The person's own action failed: said even when they have moved on.
      if (!r.ok) toastSendFailure(r);
      // Read again either way, while this chat is still the one on screen: a
      // refusal often means the list is old (the cap was reached by someone
      // else, the message is gone).
      if (genRef.current === gen) void read(id, gen);
      return r.ok;
    },
    [threadId, enabled, commit, read, stateOf],
  );

  const pin = useCallback((messageId: string) => write(messageId, true), [write]);
  const unpin = useCallback((messageId: string) => write(messageId, false), [write]);

  const reload = useCallback(() => {
    if (!threadId || !enabled) return;
    void read(threadId, genRef.current);
  }, [threadId, enabled, read]);

  // Another chat's state (or a hook that is off) reads as "nothing yet".
  const current = enabled && state.threadId === threadId ? state : EMPTY;
  const { pins: listed, pending } = current;

  const pins = useMemo(
    () => (listed === null ? null : listed.filter((p) => pending.get(p.message_id)?.pinned !== false)),
    [listed, pending],
  );
  const ids = useMemo(() => pinnedIds(listed), [listed]);
  const isPinned = useCallback(
    (messageId: string) => pending.get(messageId)?.pinned ?? ids.has(messageId),
    [ids, pending],
  );

  return { pins, available: current.available, failure: current.failure, isPinned, pin, unpin, reload };
}
