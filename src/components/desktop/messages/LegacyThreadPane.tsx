"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { palette } from "@/components/mobile/messages/v2-tokens";

import type { LegacyThreadPaneHandle, LegacyThreadPaneProps } from "./contracts";
import { fromFrame, paneSrc, parsePageEvent, shellMessage, type DmShellCommand } from "./dm-bridge";

/**
 * A direct message or a group chat on desktop (wave-3 contract 5.4): today's
 * thread from `public/html/messages.html`, shown thread-only ("pane mode") in
 * ONE iframe and driven by `postMessage`. The names both sides say, and the
 * guards on what this side hears, are in `dm-bridge.ts`.
 *
 * - The frame's `src` is `paneSrc()`, frozen at mount. It never carries a
 *   chat: every `src` change would reload the page, flash in Night and add
 *   an entry to the tab's history. Chats switch by `open`.
 * - The shell mounts this once and never unmounts it. `threadId` null means
 *   hidden and told to close. Hidden is `visibility: hidden`, never
 *   `display: none`: the page pins its scroll to the bottom by layout, and a
 *   frame with no layout would open every chat scrolled to the top.
 * - Commands wait until the page says `ready`. No `ready` within 8 s of
 *   mount (or of Retry): one line and a Retry that remounts the frame, never
 *   the old full layout. The listener stays on, so a `ready` that arrives
 *   late (the page's init awaits its bootstrap and its list first, which can
 *   pass 8 s on a slow connection) clears the line and sends what waited.
 * - Once focus is inside the frame the shell hears no keys and no clicks
 *   (map 04 trap 5.7): the page says `escape` itself, and every shell
 *   popover also closes on the window's `blur`.
 */

/** How long the page gets to say `ready` before the pane offers Retry. */
const READY_WAIT_MS = 8000;

/** The line of a frame that has not answered (the shell's own words for a chat that would not open, 3.5 rule 1). */
const NOT_READY: LoadFailure = { message: "Couldn't open this chat." };

export const LegacyThreadPane = forwardRef<LegacyThreadPaneHandle, LegacyThreadPaneProps>(function LegacyThreadPane(
  { threadId, night, onEvent },
  ref,
) {
  const t = palette(night);
  const [src] = useState(paneSrc);
  // Retry remounts the frame: a new key is a new document.
  const [frameKey, setFrameKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // The same answer as `ready`, for the listeners (they must not wait for a render).
  const readyRef = useRef(false);
  const queueRef = useRef<DmShellCommand[]>([]);
  const threadRef = useRef<string | null>(threadId);
  // The latest callback, so an inline arrow never re-binds the window's listener.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  /** Straight to the frame. The target origin is always our own. */
  const post = useCallback((command: DmShellCommand) => {
    const frame = frameRef.current?.contentWindow;
    if (frame) frame.postMessage(shellMessage(command), window.location.origin);
  }, []);

  /**
   * To the page, or to the queue until it is ready. A page that is not ready
   * has no chat open, so an `open` replaces whatever waited (it belonged to
   * the chat before) and a `close` only empties the queue.
   */
  const send = useCallback(
    (command: DmShellCommand) => {
      if (readyRef.current) {
        post(command);
        return;
      }
      if (command.type === "open") queueRef.current = [command];
      else if (command.type === "close") queueRef.current = [];
      else queueRef.current.push(command);
    },
    [post],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!fromFrame(e, window.location.origin, frameRef.current?.contentWindow ?? null)) return;
      const event = parsePageEvent(e.data);
      if (!event) return;
      if (event.type === "ready") {
        readyRef.current = true;
        setReady(true);
        setWaitedOut(false);
        const waiting = queueRef.current;
        queueRef.current = [];
        // A `ready` with nothing waiting is a page that loaded again by
        // itself: it has no chat open, so the open one is asked for again.
        const current = threadRef.current;
        if (current && !waiting.some((command) => command.type === "open")) post({ type: "open", channelId: current });
        for (const command of waiting) post(command);
      }
      onEventRef.current(event);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  useEffect(() => {
    threadRef.current = threadId;
    const frame = frameRef.current;
    if (threadId) {
      send({ type: "open", channelId: threadId });
      // The keyboard goes with the chat; the page then focuses its composer.
      frame?.contentWindow?.focus();
    } else {
      // Also stops the page's 2-second read, which follows the tab and not this frame.
      send({ type: "close" });
      // A hidden frame that kept the focus would swallow every key meant for the shell.
      if (frame && document.activeElement === frame) frame.blur();
    }
  }, [threadId, send]);

  // The 8 seconds, from mount and from every Retry. Nothing is torn down when they pass.
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setWaitedOut(true), READY_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [frameKey, ready]);

  const retry = useCallback(() => {
    const current = threadRef.current;
    readyRef.current = false;
    queueRef.current = current ? [{ type: "open", channelId: current }] : [];
    setReady(false);
    setWaitedOut(false);
    setFrameKey((key) => key + 1);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      jump: (messageId: string) => send({ type: "jump", messageId }),
      pinsChanged: () => {
        const current = threadRef.current;
        if (current) send({ type: "pins-changed", channelId: current });
      },
      setPanel: (open: boolean) => send({ type: "panel-state", open }),
      focus: () => {
        frameRef.current?.contentWindow?.focus();
      },
    }),
    [send],
  );

  const shown = threadId !== null;
  return (
    <div style={{ position: "absolute", inset: 0, visibility: shown ? "visible" : "hidden", pointerEvents: shown ? "auto" : "none" }}>
      <iframe
        key={frameKey}
        ref={frameRef}
        title="Messages"
        src={src}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          // The two lines that stop the white flash in Night: the page's own
          // cream shows while it loads, and `normal` matches the blank
          // document a frame starts on (MessagesSwitch has the long note).
          background: "var(--cream)",
          colorScheme: "normal",
        }}
      />
      {/* Offered only while NO `ready` has arrived; over the frame, so a half-loaded page never shows beside it. */}
      {waitedOut && !ready ? (
        <div style={{ position: "absolute", inset: 0, boxSizing: "border-box", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", background: t.page }}>
          <LoadFailed failure={NOT_READY} onRetry={retry} tone={night ? "dark" : "light"} />
        </div>
      ) : null}
    </div>
  );
});
