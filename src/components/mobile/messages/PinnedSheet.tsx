"use client";

import { useRef, useState } from "react";
import { Drawer } from "vaul";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import type { PinnedMessage } from "@/lib/chat/types";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import { pinTextCut, type MessagePins } from "@/lib/chat/use-message-pins";
import { rowTime } from "@/lib/chat/when";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle } from "./sheet-styles";
import { FONT, palette, SERIF, type Palette } from "./v2-tokens";

/**
 * The phone's `Pinned messages` sheet (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4d.6): the messages pinned for everyone in a dm or a group,
 * newest pin first, opened from the conversation's "..." sheet. Only the
 * flag-on conversation mounts it (`ConversationView` with `messagePins`).
 *
 * - Each pin is a quote card: the one-line quote (`text`), else what the
 *   message carried (`Photo`, `Video`, `Shared post`), then the author and
 *   the message's time. An author the viewer cannot read is null: the time
 *   stands alone, no name is made up.
 * - A tap on a card whose message is among the ones the thread holds
 *   (`isLoaded`) calls `onJump`: the host closes the sheet and scrolls to
 *   it. Any other card opens in place to the whole message (`full_text`)
 *   with the line `That message is further back in the chat.`
 * - A quote that was cut (`pinTextCut`, never a length test) has `Show all`
 *   under it: the same opening in place, without a jump.
 * - Each card has `Unpin` (the hook's optimistic `unpin`: the card leaves at
 *   once, a refusal toasts and brings it back). For 400 ms after one, the
 *   cards and `Unpin` take no tap: the next card has moved under the finger.
 * - Nothing pinned: the phone's own line (the desktop panel's speaks of a
 *   mouse). A first read that failed: `LoadFailed` with Retry (`pins.reload`).
 *
 * A vaul sheet NESTED in the conversation's drawer (a plain root closing
 * inside it runs vaul's unlock; `ConversationView`'s note on its Report
 * sheet), with its own history entry while it is up (`useLayerHistory`, as
 * the other sheets of the new chat): Back closes the sheet and leaves the
 * conversation open under it.
 */
export type PinnedSheetProps = {
  /** The conversation's `useMessagePins` object: the list, its failure, `unpin`, `reload`. */
  pins: MessagePins;
  night: boolean;
  /** True when the thread on screen holds this message, so a tap can scroll to it. */
  isLoaded: (messageId: string) => boolean;
  /** A tap on a pin whose message is loaded: the host closes the sheet and scrolls to it. */
  onJump: (messageId: string) => void;
  onClose: () => void;
};

/** How long after an `Unpin` the cards take no tap (the list has just moved under the finger). */
const UNPIN_SETTLE_MS = 400;

/** What a pin with no words carried, as the quote stub and the reply pill say it. */
function carried(pin: PinnedMessage): string {
  if (pin.media_kind === "video") return "Video";
  if (pin.media_kind === "image") return "Photo";
  return pin.has_post ? "Shared post" : "Attachment";
}

export function PinnedSheet({ pins, night, isLoaded, onJump, onClose }: PinnedSheetProps) {
  // Its own history entry while it is on screen (it is mounted only then).
  useLayerHistory(true, onClose);
  const t = palette(night);
  // One clock for the sheet's life: it is up for seconds, and a time that
  // ticked under the finger would move nothing worth a re-render.
  const [now] = useState(() => new Date());
  // The cards opened in place, by message: "further" = a tap on a pin the
  // thread does not hold (the line shows), "all" = `Show all`.
  const [opened, setOpened] = useState<ReadonlyMap<string, "further" | "all">>(() => new Map());
  const open = (messageId: string, how: "further" | "all") =>
    setOpened((prev) => (prev.get(messageId) === "further" ? prev : new Map(prev).set(messageId, how)));

  // An unpin takes its card away at once and the next card slides under the
  // finger. For a moment after one, a tap on a card or on `Unpin` is the same
  // press landing twice and is dropped: it would unpin a second message for
  // everyone, or jump and close the sheet. `at` is the tap's own
  // `event.timeStamp` (no clock is read here).
  const lastUnpinRef = useRef(Number.NEGATIVE_INFINITY);
  const settled = (at: number) => at - lastUnpinRef.current >= UNPIN_SETTLE_MS;
  const unpin = (messageId: string, at: number) => {
    if (!settled(at)) return;
    lastUnpinRef.current = at;
    void pins.unpin(messageId);
  };
  const tap = (messageId: string, at: number) => {
    if (!settled(at)) return;
    if (isLoaded(messageId)) onJump(messageId);
    else open(messageId, "further");
  };

  const list = pins.pins;

  return (
    <Drawer.NestedRoot
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, background: t.scrim }} />
        <Drawer.Content
          style={{ ...vaulContentStyle, background: t.surface, fontFamily: FONT, color: t.ink }}
          aria-describedby={undefined}
        >
          <Drawer.Handle style={vaulHandleStyle} />
          <Drawer.Title
            style={{
              margin: 0,
              padding: "10px 18px 6px",
              fontFamily: SERIF,
              fontSize: 16,
              fontWeight: 800,
              color: t.ink,
            }}
          >
            Pinned messages
          </Drawer.Title>
          <div
            aria-busy={list === null && !pins.failure}
            style={{
              boxSizing: "border-box",
              minHeight: 120,
              maxHeight: "calc(88dvh - 64px)",
              overflowY: "auto",
              overscrollBehavior: "contain",
              padding: "6px 16px 16px",
            }}
          >
            {list === null ? (
              pins.failure ? (
                <LoadFailed failure={pins.failure} onRetry={pins.reload} tone={night ? "dark" : "light"} />
              ) : null
            ) : list.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "28px 8px",
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: t.secondary,
                }}
              >
                Nothing pinned yet. Press and hold a message to pin it.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((pin) => (
                  <PinCard
                    key={pin.message_id}
                    pin={pin}
                    t={t}
                    now={now}
                    opened={opened.get(pin.message_id) ?? null}
                    onTap={(at) => tap(pin.message_id, at)}
                    onShowAll={() => open(pin.message_id, "all")}
                    onUnpin={(at) => unpin(pin.message_id, at)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}

/** `Show all` and `Unpin`: a quiet word with a 44px target. */
function wordButtonStyle(color: string): React.CSSProperties {
  return {
    minHeight: 44,
    padding: "0 10px",
    border: "none",
    background: "transparent",
    color,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };
}

/** One pin: the quote and its byline (a button), the "further back" line, then `Show all` and `Unpin`. */
function PinCard({
  pin,
  t,
  now,
  opened,
  onTap,
  onShowAll,
  onUnpin,
}: {
  pin: PinnedMessage;
  t: Palette;
  now: Date;
  /** Opened in place: by a tap that could not jump ("further"), by `Show all` ("all"); null = the one-line quote. */
  opened: "further" | "all" | null;
  /** `at` = the tap's `event.timeStamp`, for the sheet's pause after an unpin. */
  onTap: (at: number) => void;
  onShowAll: () => void;
  onUnpin: (at: number) => void;
}) {
  // The whole message once opened; a photo, video or post with no words keeps its label.
  const whole = opened !== null && pin.full_text !== "";
  const words = whole ? pin.full_text : pin.text || carried(pin);
  // The author is null when the viewer cannot read that profile: the time alone.
  const name = pin.author ? pin.author.name || (pin.author.handle ? `@${pin.author.handle}` : "") : "";
  const time = rowTime(pin.created_at, now);
  const byline = name && time ? `${name} · ${time}` : name || time;

  return (
    <li
      style={{
        borderRadius: 16,
        border: `1px solid ${t.hairline}`,
        background: "rgba(var(--scrim-rgb),0.04)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={(e) => onTap(e.timeStamp)}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width: "100%",
          minHeight: 44,
          boxSizing: "border-box",
          padding: "12px 14px 4px",
          border: "none",
          background: "transparent",
          color: "inherit",
          fontFamily: "inherit",
          textAlign: "left",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span
          style={{
            fontSize: 14.5,
            lineHeight: 1.4,
            fontWeight: 500,
            color: t.ink,
            whiteSpace: whole ? "pre-wrap" : "normal",
            overflowWrap: "anywhere",
          }}
        >
          {words}
        </span>
        {byline ? <span style={{ fontSize: 12, fontWeight: 600, color: t.muted }}>{byline}</span> : null}
      </button>
      {opened === "further" ? (
        <p role="status" style={{ margin: 0, padding: "4px 14px 0", fontSize: 12.5, lineHeight: 1.4, color: t.secondary }}>
          That message is further back in the chat.
        </p>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 4px" }}>
        {opened === null && pinTextCut(pin) ? (
          <button type="button" onClick={onShowAll} style={{ ...wordButtonStyle(t.coralText), marginRight: "auto" }}>
            Show all
          </button>
        ) : null}
        <button type="button" onClick={(e) => onUnpin(e.timeStamp)} style={wordButtonStyle(t.secondary)}>
          Unpin
        </button>
      </div>
    </li>
  );
}
