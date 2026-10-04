"use client";

import { useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import type { PinnedMessage, SharedItem, SharedResponse } from "@/lib/chat/types";
import { pinTextCut, useMessagePins } from "@/lib/chat/use-message-pins";
import { rowTime } from "@/lib/chat/when";
import { vibeRequest } from "@/lib/feedback/request";

import type { PinsPanelProps } from "./contracts";

/**
 * Pinned and Shared, the right panel of a direct message or a group chat on
 * desktop (handoffs/chat-redesign/wave-3-desktop/contract.md 4d.5, section 8
 * W3-5-pins; the board's step 5). The shell mounts it in its 288px box (a
 * column beside the thread, or over it when the window is narrow) while the
 * page's pin button has it open; it is unmounted on every change of chat.
 *
 * - `Pinned`: the messages pinned for everyone in the chat, newest pin first
 *   (`useMessagePins`, read again every 20 s while the tab is visible and
 *   whenever `refreshToken` moves: the page pinned or unpinned something).
 *   Each pin is a quote card: the one-line quote (`text`), else what the
 *   message carried (`Photo`, `Video`, `Shared post`), then the author and
 *   the message's time. An author the viewer cannot read is null: the time
 *   stands alone. A click asks the page to scroll to the message (`onJump`).
 * - The page holds only the newest messages. When it could not jump
 *   (`missedId` is this pin's message) the card opens in place to the whole
 *   message (`full_text`) with `That message is further back in the chat.`
 *   A quote that was cut (`pinTextCut`, never a length test) opens the same
 *   way from `Show all`, without a jump.
 * - `Unpin` shows on hover and on focus (the hook's optimistic `unpin`: the
 *   card leaves at once, a refusal toasts and brings it back). When the
 *   request has answered the shell is told (`onChanged`), so the page's own
 *   pin buttons stay in step.
 * - `Shared`: the photos, videos and shared posts sent in the chat, newest
 *   first, in two columns (`GET /api/me/threads/<id>/shared`, read when the
 *   panel opens; `Show more` asks for the ones before the last tile while
 *   the answer says `has_more`). A photo or a video opens its proxy URL in a
 *   new tab, a post opens `/posts/<id>` in a new tab (1.3 K2).
 * - No pins in this chat for this person (the hook's `available` is false):
 *   one line, and nothing to press but the hide button. A first read that
 *   failed: `LoadFailed` with Retry, inside the open panel.
 *
 * Not "Pin chat": that pins a CHAT in my own list. A pin here is a MESSAGE,
 * for everyone in the chat.
 *
 * The root is the one flex item of the shell's box. Every control is a real
 * `<button>` or `<a>` (Tab reaches each one; `Unpin` appears as its card
 * takes focus).
 */

/** The first `Shared` read's failure line, and a `Show more` that failed. */
const SHARED_LOAD_LINE = "Couldn't load shared photos, videos and posts.";
const NOT_AVAILABLE = "Pinned messages aren't available yet.";

/**
 * The focus ring sits inside a control, but outside two kinds: a tile (its
 * picture is positioned and paints over an inside ring) and `LoadFailed`'s
 * pill (coral itself). Both selectors outrank the line above them.
 */
const PINS_CSS = `
.vibe-pins button, .vibe-pins a { -webkit-tap-highlight-color: transparent; }
.vibe-pins button:focus-visible, .vibe-pins a:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
.vibe-pins .vibe-pins-tile:focus-visible, .vibe-pins [role="alert"] button:focus-visible { outline-offset: 2px; }
.vibe-pins-hide { background: transparent; transition: background 240ms ease; }
.vibe-pins-hide:hover { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-pins-card { background: rgba(var(--scrim-rgb), 0.05); transition: background 240ms ease; }
.vibe-pins-card:hover { background: rgba(var(--scrim-rgb), 0.08); }
.vibe-pins-unpin { opacity: 0; transition: opacity 160ms ease; }
.vibe-pins-card:hover .vibe-pins-unpin, .vibe-pins-card:focus-within .vibe-pins-unpin { opacity: 1; }
@media (hover: none) { .vibe-pins-unpin { opacity: 1; } }
.vibe-pins-word:hover { text-decoration: underline; }
.vibe-pins-tile { transition: opacity 240ms ease; }
.vibe-pins-tile:hover { opacity: 0.86; }
.vibe-pins-more { background: transparent; transition: background 240ms ease; }
.vibe-pins-more:hover:not(:disabled) { background: rgba(var(--scrim-rgb), 0.06); }
`;

/** The `Shared` read of one chat. `items` null = the first read failed (`failure` says how). */
type Shared = {
  threadId: string;
  items: SharedItem[] | null;
  hasMore: boolean;
  failure: LoadFailure | null;
  /** A `Show more` that failed: its line takes the button's place, with Retry. */
  moreFailure: LoadFailure | null;
};

function sharedUrl(threadId: string, before: string | null): string {
  const base = `/api/me/threads/${encodeURIComponent(threadId)}/shared`;
  return before ? `${base}?before=${encodeURIComponent(before)}` : base;
}

/** What a pin with no words carried, as the phone's sheet says it. */
function carried(pin: PinnedMessage): string {
  if (pin.media_kind === "video") return "Video";
  if (pin.media_kind === "image") return "Photo";
  return pin.has_post ? "Shared post" : "Attachment";
}

const headingStyle: React.CSSProperties = { margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: "18px", letterSpacing: "-0.2px" };
const quietLineStyle: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.5 };
/** A grey block in a card's or a tile's place while its read is out. */
const ghostStyle: React.CSSProperties = { borderRadius: 14, background: "rgba(var(--scrim-rgb), 0.05)" };

export function PinsPanel({ threadId, title, night, mode, refreshToken, missedId, onClose, onJump, onChanged }: PinsPanelProps) {
  const t = palette(night);
  const pins = useMessagePins(threadId, { enabled: true, pollMs: 20000 });
  const { reload } = pins;

  // The page pinned or unpinned something: read the list again. The hook
  // makes the first read itself, so the token the panel mounted with is not one.
  const tokenRef = useRef(refreshToken);
  useEffect(() => {
    if (tokenRef.current === refreshToken) return;
    tokenRef.current = refreshToken;
    reload();
  }, [refreshToken, reload]);

  // The bylines' clock. The panel can stay open for an evening: a minute's step keeps `Yesterday` honest.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // `Shared`: one read when the panel opens (and on Retry), tagged with its
  // chat so another `threadId` reads as "nothing yet".
  const [shared, setShared] = useState<Shared | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreRef = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await vibeRequest<SharedResponse>(sharedUrl(threadId, null), { cache: "no-store", quiet: true, failure: SHARED_LOAD_LINE });
      if (!alive) return;
      if (!r.ok || !Array.isArray(r.data?.items)) {
        setShared({ threadId, items: null, hasMore: false, failure: asLoadFailure(r, SHARED_LOAD_LINE), moreFailure: null });
        return;
      }
      setShared({ threadId, items: r.data.items, hasMore: r.data.has_more === true, failure: null, moreFailure: null });
    })();
    return () => {
      alive = false;
    };
  }, [threadId, attempt]);
  const mine = shared && shared.threadId === threadId ? shared : null;

  const retryShared = () => {
    setShared(null);
    setAttempt((n) => n + 1);
  };

  /** The tiles before the last one on screen. An empty answer says `has_more: false` and is the end. */
  const showMore = async () => {
    if (!mine?.items || !mine.hasMore || moreRef.current) return;
    const last = mine.items[mine.items.length - 1];
    if (!last) return;
    const id = threadId;
    moreRef.current = true;
    setLoadingMore(true);
    const r = await vibeRequest<SharedResponse>(sharedUrl(id, last.created_at), { cache: "no-store", quiet: true, failure: SHARED_LOAD_LINE });
    moreRef.current = false;
    if (!aliveRef.current) return;
    setLoadingMore(false);
    setShared((prev) => {
      if (!prev || prev.threadId !== id || !prev.items) return prev;
      if (!r.ok || !Array.isArray(r.data?.items)) return { ...prev, moreFailure: asLoadFailure(r, SHARED_LOAD_LINE) };
      const have = new Set(prev.items.map((item) => item.message_id));
      const older = r.data.items.filter((item) => !have.has(item.message_id));
      return { ...prev, items: [...prev.items, ...older], hasMore: r.data.has_more === true, moreFailure: null };
    });
  };

  // The shell clears `missedId` on the next jump and on a change of chat, not
  // when the panel closes: the id the panel MOUNTS with is the answer to a
  // click made before it was hidden, and opens nothing here. It counts again
  // once the shell has moved it (a jump clears it, then the page answers).
  const [staleMissed, setStaleMissed] = useState(missedId);
  if (staleMissed !== null && missedId !== staleMissed) setStaleMissed(null);
  const missed = missedId === staleMissed ? null : missedId;

  // The quotes opened by `Show all`. A missed jump opens its card by itself (`missed`).
  const [shownAll, setShownAll] = useState<ReadonlySet<string>>(() => new Set());
  const showAll = (messageId: string) => setShownAll((prev) => new Set(prev).add(messageId));

  const scrollRef = useRef<HTMLDivElement>(null);
  const unpin = (messageId: string, byKey: boolean) => {
    // The card leaves at once and takes the focused `Unpin` with it: by keyboard, focus stays in the list.
    if (byKey) scrollRef.current?.focus();
    // Told when the request has answered, whatever it said and even if the
    // panel has closed meanwhile: the page reads its own pin list again.
    void pins.unpin(messageId).then(() => onChanged());
  };

  const list = pins.pins;
  const tone = night ? "dark" : "light";
  const busy = pins.available && ((list === null && !pins.failure) || mine === null);

  return (
    <aside
      className="vibe-pins"
      data-mode={mode}
      aria-label={title ? `Pinned and shared with ${title}` : "Pinned and shared"}
      style={{ flex: 1, minWidth: 0, minHeight: 0, boxSizing: "border-box", padding: "8px 12px 12px 0", display: "flex", color: t.ink, fontFamily: FONT }}
    >
      <style>{PINS_CSS}</style>
      {/* The board's rounded panel. Its hairline is the panel's edge in both modes: over the thread the box has no border of its own. */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, boxSizing: "border-box", borderRadius: 20, border: `1px solid ${t.hairline}`, background: "rgba(var(--scrim-rgb), 0.035)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 48, flexShrink: 0, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={headingStyle}>Pinned</h2>
          <button
            type="button"
            className="vibe-pins-hide"
            onClick={onClose}
            aria-label="Hide this panel"
            style={{ width: 36, height: 36, flexShrink: 0, marginRight: -8, padding: 0, border: "none", borderRadius: 999, color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
              <path d="M14.5 4.5v15" />
            </svg>
          </button>
        </div>
        <div
          ref={scrollRef}
          tabIndex={-1}
          aria-busy={busy}
          style={{ flex: "1 1 0", minHeight: 0, boxSizing: "border-box", padding: "0 16px 16px", overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", outline: "none" }}
        >
          {!pins.available ? (
            <p style={{ ...quietLineStyle, color: t.secondary }}>{NOT_AVAILABLE}</p>
          ) : (
            <>
              {list === null ? (
                pins.failure ? (
                  <LoadFailed failure={pins.failure} onRetry={reload} tone={tone} compact />
                ) : (
                  <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ ...ghostStyle, height: 58 }} />
                    <div style={{ ...ghostStyle, height: 58 }} />
                  </div>
                )
              ) : list.length === 0 ? (
                <p style={{ ...quietLineStyle, color: t.secondary }}>Nothing pinned yet. Hover a message and press the pin.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((pin) => (
                    <PinCard
                      key={pin.message_id}
                      pin={pin}
                      t={t}
                      now={now}
                      opened={missed === pin.message_id ? "further" : shownAll.has(pin.message_id) ? "all" : null}
                      onJump={() => onJump(pin.message_id)}
                      onShowAll={() => showAll(pin.message_id)}
                      onUnpin={(byKey) => unpin(pin.message_id, byKey)}
                    />
                  ))}
                </ul>
              )}

              <div style={{ marginTop: 22, minHeight: 28, display: "flex", alignItems: "center" }}>
                <h2 style={headingStyle}>Shared</h2>
              </div>
              <div style={{ marginTop: 8 }}>
                {mine === null ? (
                  <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                    <div style={{ ...ghostStyle, aspectRatio: "1 / 1" }} />
                    <div style={{ ...ghostStyle, aspectRatio: "1 / 1" }} />
                  </div>
                ) : mine.items === null ? (
                  mine.failure ? <LoadFailed failure={mine.failure} onRetry={retryShared} tone={tone} compact /> : null
                ) : mine.items.length === 0 ? (
                  <p style={{ ...quietLineStyle, color: t.secondary }}>Photos, videos and posts sent here will show up in this spot.</p>
                ) : (
                  <>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
                      {mine.items.map((item) => (
                        <SharedTile key={item.message_id} item={item} t={t} />
                      ))}
                    </ul>
                    {mine.moreFailure ? (
                      <div style={{ marginTop: 10 }}>
                        <LoadFailed failure={mine.moreFailure} onRetry={() => void showMore()} tone={tone} compact />
                      </div>
                    ) : mine.hasMore ? (
                      <button
                        type="button"
                        className="vibe-pins-more"
                        onClick={() => void showMore()}
                        disabled={loadingMore}
                        aria-busy={loadingMore}
                        style={{ marginTop: 10, width: "100%", height: 36, padding: 0, border: `1px solid ${t.hairline}`, borderRadius: 999, color: t.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: loadingMore ? "default" : "pointer", opacity: loadingMore ? 0.6 : 1 }}
                      >
                        Show more
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/** `Show all` and `Unpin`: a quiet word. */
function wordStyle(color: string): React.CSSProperties {
  return { height: 24, padding: "0 8px", border: "none", borderRadius: 8, background: "transparent", color, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" };
}

/** One pin: the quote and its byline (a button that jumps), `Unpin` over the byline's row, then the "further back" line or `Show all`. */
function PinCard({
  pin,
  t,
  now,
  opened,
  onJump,
  onShowAll,
  onUnpin,
}: {
  pin: PinnedMessage;
  t: Palette;
  now: Date;
  /** Opened in place: the page could not jump to it ("further"), or by `Show all` ("all"); null = the one-line quote. */
  opened: "further" | "all" | null;
  onJump: () => void;
  onShowAll: () => void;
  /** `byKey`: pressed from the keyboard (the click carries no pointer). */
  onUnpin: (byKey: boolean) => void;
}) {
  // The whole message once opened; a photo, video or post with no words keeps its label.
  const whole = opened !== null && pin.full_text !== "";
  const words = whole ? pin.full_text : pin.text || carried(pin);
  // The author is null when the viewer cannot read that profile: the time alone.
  const name = pin.author ? pin.author.name || (pin.author.handle ? `@${pin.author.handle}` : "") : "";
  const time = rowTime(pin.created_at, now);
  const byline = name && time ? `${name} · ${time}` : name || time;

  return (
    <li className="vibe-pins-card" style={{ borderRadius: 14 }}>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={onJump}
          style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "none", borderRadius: 14, background: "transparent", color: t.ink, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: "19px", whiteSpace: whole ? "pre-wrap" : "normal", overflowWrap: "anywhere" }}>{words}</span>
          {/* The row `Unpin` sits on: always drawn, and short enough to leave it room. */}
          <span style={{ minHeight: 15, maxWidth: "100%", boxSizing: "border-box", paddingRight: 52, fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{byline}</span>
        </button>
        <button
          type="button"
          className="vibe-pins-unpin vibe-pins-word"
          onClick={(e) => {
            // The next card moves under the pointer as this one leaves: the
            // second click of a double click would unpin it too, for everyone.
            if (e.detail > 1) return;
            onUnpin(e.detail === 0);
          }}
          style={{ ...wordStyle(t.secondary), position: "absolute", right: 4, bottom: 5 }}
        >
          Unpin
        </button>
      </div>
      {opened === "further" ? (
        <p role="status" style={{ margin: 0, padding: "0 12px 10px", fontSize: 12, lineHeight: 1.4, color: t.secondary }}>
          That message is further back in the chat.
        </p>
      ) : opened === null && pinTextCut(pin) ? (
        <div style={{ padding: "0 4px 6px" }}>
          <button type="button" className="vibe-pins-word" onClick={onShowAll} style={wordStyle(t.coralText)}>
            Show all
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** A picture or a first frame that fills its box (the tile, or a post's thumbnail strip). */
const fillStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
const oneLineStyle: React.CSSProperties = { fontSize: 11.5, lineHeight: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/**
 * One shared thing, a link that opens in a new tab: a photo or a video (its
 * first frame under a play mark) opens the proxy URL; a post (its thumbnail,
 * the author, the first line) opens `/posts/<id>`. A picture that does not
 * load leaves the tile with its word.
 */
function SharedTile({ item, t }: { item: SharedItem; t: Palette }) {
  const [failed, setFailed] = useState(false);
  const tile: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    aspectRatio: "1 / 1",
    borderRadius: 14,
    overflow: "hidden",
    background: "rgba(var(--scrim-rgb), 0.05)",
    boxShadow: "inset 0 0 0 1px rgba(var(--scrim-rgb), 0.06)",
    color: t.ink,
    textDecoration: "none",
  };

  const post = item.attachment;
  if (post) {
    // The thumbnail, else the post's own image. A video post's `media_url` is the video, never a poster.
    const poster = post.media_thumbnail_url || (post.type !== "clip" ? post.media_url : null);
    const author = post.author ? post.author.name || (post.author.handle ? `@${post.author.handle}` : "") : "";
    const firstLine = (post.content ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";
    const top = author || firstLine || "Shared post";
    const under = author ? firstLine : "";
    return (
      <li>
        <a className="vibe-pins-tile" href={`/posts/${encodeURIComponent(post.id)}`} target="_blank" rel="noopener noreferrer" style={tile}>
          <span aria-hidden="true" style={{ position: "relative", flex: "1 1 0", minHeight: 0, background: "rgba(var(--scrim-rgb), 0.06)" }}>
            {poster && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} style={fillStyle} />
            ) : null}
          </span>
          <span style={{ flexShrink: 0, minWidth: 0, boxSizing: "border-box", padding: "7px 9px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ ...oneLineStyle, fontWeight: 700 }}>{top}</span>
            {under ? <span style={{ ...oneLineStyle, fontWeight: 500, color: t.secondary }}>{under}</span> : null}
          </span>
        </a>
      </li>
    );
  }

  if (!item.media_url) return null;
  const video = item.media_kind === "video";
  const word = video ? "Video" : "Photo";
  return (
    <li>
      <a className="vibe-pins-tile" href={item.media_url} target="_blank" rel="noopener noreferrer" aria-label={word} style={tile}>
        {failed ? (
          <span style={{ margin: "auto", fontSize: 12, fontWeight: 600, color: t.muted }}>{word}</span>
        ) : video ? (
          <video src={item.media_url} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" onError={() => setFailed(true)} style={fillStyle} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.media_url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} style={fillStyle} />
        )}
        {video && !failed ? (
          <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", width: 30, height: 30, margin: "-15px 0 0 -15px", borderRadius: 999, background: t.surface, color: t.ink, boxShadow: `0 0 0 1px ${t.hairline}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        ) : null}
      </a>
    </li>
  );
}
