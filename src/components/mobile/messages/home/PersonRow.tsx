"use client";

import type { CSSProperties } from "react";

import { rowTime } from "@/lib/chat/when";

import { personColor } from "../avatar";
import { initialsOf, threadTitle } from "../format";
import { useNightTheme } from "../theme";
import type { ThreadEntry } from "../types";
import { FONT, palette } from "../v2-tokens";

import { personPreview, personRowLabel } from "./home-rules";

/**
 * A person / group row of the Messages home (handoffs/chat-redesign/
 * wave-2-contracts.md 1.2 "Person / group rows", 11.1, SCREENS-M7; W2-S1) —
 * `W0_Home:66-79, 81-94, 110-119, 152-161`. 48px avatar (a group's double
 * avatar), the name 15px/700, the time `rowTime(last_message.created_at)`
 * with the one clock the list passes as `now`, the 12px pin icon when
 * `pinned_at`, the preview `You: …` / `<Name>: …`, the unread pill. The row's
 * label is 1.2's: `<name>, <spoken time>[, unread][, pinned]`.
 *
 * The old `ThreadRow` stays with the old list; the Requests filter still
 * uses it (11.1).
 *
 * Oct 19, 2026 (critique D4 and decision 14, handoffs/2026-10-19-critique/
 * PLAN.md B5): people had a 44px picture beside the clubs' 48px one, and
 * their text started 4px further in. Every row of the list is now 48px and
 * shares `ROW_FRAME` / `ROW_TEXT`, so the pictures, the text and the
 * dividers line up from row to row.
 */
export function PersonRow({ thread, now, onTap }: { thread: ThreadEntry; now: Date; onTap: () => void }) {
  const night = useNightTheme();
  const t = palette(night);
  const unread = !!thread.unread;
  const title = threadTitle(thread);
  const preview = personPreview(thread);
  // A group member's `<Name>:` is bold (`W0_Home:92`); `You:` and the dm
  // peer's line are plain (`:117`, `:75`).
  const boldPrefix =
    thread.type !== "dm" && !preview.startsWith("You: ") && preview.indexOf(": ") > 0
      ? preview.slice(0, preview.indexOf(": ") + 1)
      : null;
  const body = boldPrefix ? preview.slice(boldPrefix.length + 1) : preview;
  const when = thread.last_message ? rowTime(thread.last_message.created_at, now) : "";

  return (
    <li style={{ listStyle: "none" }}>
      <button
        type="button"
        onClick={onTap}
        aria-label={personRowLabel(thread, now)}
        style={{ ...ROW_FRAME, color: t.ink, fontFamily: FONT }}
      >
        <PersonAvatar thread={thread} page={t.page} />
        <span style={{ ...ROW_TEXT, borderBottom: `1px solid ${t.hairline}`, gap: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                minWidth: 0,
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1.3,
                color: t.ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
            {thread.pinned_at ? <PinIcon color={t.muted} /> : null}
            <span
              style={{
                marginLeft: thread.pinned_at ? 0 : "auto",
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 600,
                color: unread ? t.secondary : t.muted,
              }}
            >
              {when}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 13.5,
                lineHeight: 1.35,
                fontWeight: unread ? 600 : 400,
                color: unread ? t.ink : t.secondary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {boldPrefix ? <b style={{ fontWeight: 700 }}>{boldPrefix}</b> : null}
              {boldPrefix ? " " : null}
              {body}
            </span>
            {unread ? (
              // The unread pill (`W0_Home:76`). `GET /api/me/threads` sends
              // `unread: boolean` and no count (S1-notes.md STOPPED), so the
              // pill carries no number; the row's label says "unread".
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  minWidth: 20,
                  height: 20,
                  boxSizing: "border-box",
                  padding: "0 6px",
                  borderRadius: 999,
                  background: t.coral,
                }}
              />
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The 12px pin (`W0_Home:71`), named for a reader who lands on it. */
export function PinIcon({ color }: { color: string }) {
  return (
    <svg
      role="img"
      aria-label="Pinned"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: "auto", flexShrink: 0 }}
    >
      <path d="M9 3h6l-1 6.5 3.5 3.5h-11L10 9.5z" />
      <path d="M12 13v8" />
    </svg>
  );
}

/**
 * The frame every row of the Messages home shares (ClubRow, PersonRow,
 * FollowedBoardRow; Oct 19, 2026, critique D4): at least 66px tall, so a 48px
 * picture always keeps 9px above and below it and two pictures never touch.
 * 14 + 48 + 12 puts every row's text, and its divider, at the same 74px.
 */
export const ROW_FRAME: CSSProperties = {
  width: "100%",
  minHeight: 66,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 0 0 14px",
  margin: 0,
  background: "transparent",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/**
 * The text column of a row (the caller adds its `borderBottom` and `gap`). It
 * stretches to the row's whole height and centres its lines, so the divider
 * is the row's bottom edge however few lines it holds. 9 + 9 keeps every
 * two-line row at exactly 66: name + preview, or a club's name + event chip.
 * A club with a preview AND a chip takes a third line, about 87px, as the
 * W0_Home board draws it (corrected Oct 19, 2026, B5 review).
 */
export const ROW_TEXT: CSSProperties = {
  alignSelf: "stretch",
  flexGrow: 1,
  minWidth: 0,
  boxSizing: "border-box",
  padding: "9px 16px 9px 0",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

/** The one picture size of the list (decision 14, Oct 19, 2026): the clubs' 48, not the people's old 44. */
export const ROW_PICTURE = 48;

/** 48px: the peer's photo or initials on `personColor`; a group's photo, or two 32px discs of its first two members. */
function PersonAvatar({ thread, page }: { thread: ThreadEntry; page: string }) {
  if (thread.type === "dm") {
    const url = thread.peer?.avatar_url ?? null;
    const c = personColor(thread.peer?.id ?? thread.id);
    return <Disc size={ROW_PICTURE} url={url} initials={initialsOf(thread.peer?.name || thread.peer?.handle)} bg={c.bg} ink={c.ink} font={15} />;
  }
  if (thread.photo_url) return <Disc size={ROW_PICTURE} url={thread.photo_url} initials="" bg="transparent" ink="transparent" font={15} />;
  const members = thread.members ?? [];
  if (members.length < 2) {
    const c = personColor(thread.id);
    return <Disc size={ROW_PICTURE} url={null} initials={initialsOf(thread.name)} bg={c.bg} ink={c.ink} font={15} />;
  }
  const [a, b] = members;
  const ca = personColor(a.id);
  const cb = personColor(b.id);
  return (
    <span aria-hidden="true" style={{ position: "relative", width: ROW_PICTURE, height: ROW_PICTURE, flexShrink: 0, display: "block" }}>
      <span style={{ position: "absolute", left: 0, top: 0 }}>
        <Disc size={32} url={a.avatar_url} initials={initialsOf(a.name || a.handle)} bg={ca.bg} ink={ca.ink} font={11} tucked />
      </span>
      <span style={{ position: "absolute", right: 0, bottom: 0, borderRadius: 999, boxShadow: `0 0 0 2px ${page}` }}>
        <Disc size={32} url={b.avatar_url} initials={initialsOf(b.name || b.handle)} bg={cb.bg} ink={cb.ink} font={11} />
      </span>
    </span>
  );
}

/**
 * One round picture. `tucked` is a group's back disc: the front disc covers
 * its lower right 16px, which hid half of the second initial ("BS" read "B"),
 * so its initials sit up and left, inside the part that shows (Oct 19, 2026,
 * B5 review).
 */
function Disc({ size, url, initials, bg, ink, font, tucked = false }: { size: number; url: string | null; initials: string; bg: string; ink: string; font: number; tucked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        padding: tucked ? TUCK_PADDING : 0,
        flexShrink: 0,
        borderRadius: 999,
        background: url ? `url(${url}) center/cover` : bg,
        color: ink,
        fontWeight: 700,
        fontSize: font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? null : initials}
    </span>
  );
}

/** The back disc's initials shift up-left by half of this padding (see `Disc`); the value was measured in the browser on Oct 19, 2026. */
const TUCK_PADDING = "0 6px 6px 0";
