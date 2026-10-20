"use client";

import { useId } from "react";

import { personColor } from "@/components/mobile/messages/avatar";
import {
  authorName,
  countWord,
  emptyLine,
  postAriaLabel,
  repliesToggleText,
  roleWord,
  rsvpPill,
  rsvpWord,
  upNextAriaLabel,
  upNextLine,
} from "@/components/mobile/messages/club/helpers";
import { initialsOf } from "@/components/mobile/messages/format";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import { DELETED_POST_LINE } from "@/lib/chat/deleted-note";
import type { ChatMessage, EventRef, Person } from "@/lib/chat/types";
import { eventTime, rowTime, rowTimeSpoken } from "@/lib/chat/when";
import { ORG_COPY } from "@/lib/orgs/join-copy";

import type { ClubPanelProps } from "./contracts";
import { chatEntry } from "./desktop-rules";

/**
 * The club's right panel on desktop Messages (handoffs/chat-redesign/
 * wave-3-desktop/contract.md 3.2, 3.3, C2, C3, C11, C13, section 8
 * W3-5-panel; the board's step 1): a 320px column holding one card, top to
 * bottom:
 *
 *   `<club> events` and the hide button;
 *   the club's next event as a FLAT card (the state line, the title, the
 *   place and the time, `N going`, the RSVP pill), the one after it as a
 *   row, or `No events coming up.`;
 *   `Announcements`: the Board's last three posts, each a button that opens
 *   the Board; NOT drawn while the Board is the open room (C13: the same
 *   posts would be on screen twice);
 *   the members: five faces, the count, `See all`;
 *   for an owner or an admin only (`onManageRooms` not null; C11):
 *   `Manage club` and `Manage rooms`.
 *
 * It never fetches and holds no state: everything on it is `space` (the
 * space read made with `?panel=1`) and `faces` (the roster's first five),
 * and every action is handed up. So seeing a Board post here never marks
 * the Board read: the dot on the newest post is the Board room's own
 * `unread`, and it stays until the Board is opened.
 *
 * Calm (3.2): the live event's card is flat, coral words and nothing that
 * glows (the one glow of a club screen is not here); the unread mark is a
 * plain dot; every colour is `palette(night)` or a CSS variable.
 *
 * `mode` places it. `"side"`: a flex item, 320 wide, of the row it is
 * mounted in (the pane beside it narrows). `"overlay"`: the same column laid
 * over the pane's right edge (absolute, right 0, in the page's colour, a
 * hairline at its left, no scrim); its nearest positioned ancestor is the
 * 320px box `ClubPane` gives it, which is itself laid over the pane's right
 * edge. Either way it closes on its own button (`onHide`).
 *
 * An event's body and the Board's `See all` are links to the room's own
 * address, so Cmd / Ctrl / Shift / middle click open it in a new tab; a
 * plain left click is answered in place (`onOpenRoom`). Nothing on the panel
 * answers the second click of a double click, links and buttons alike: the
 * pane re-lays itself under the pointer (the Board opens and the Members
 * row's `See all` lands where the Board's stood; the header's toggle shows
 * the panel and its hide button lands under it).
 *
 * Opening the Board takes `Announcements` off the panel, the pressed control
 * with it: focus is put on the Members section first, so it stays in the
 * panel. The hide button takes the whole panel away; where focus goes then
 * is its caller's (`onHide`: `ClubPane` puts it on the header's toggle).
 */

const PANEL_CSS = `
.vibe-club-panel a:focus-visible, .vibe-club-panel button:focus-visible, .vibe-club-panel section:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-club-panel-row { background: transparent; transition: background 240ms ease; }
.vibe-club-panel-row:hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-club-panel-wash { background: rgba(var(--scrim-rgb), 0.07); transition: background 240ms ease; }
.vibe-club-panel-wash:hover { background: rgba(var(--scrim-rgb), 0.11); }
.vibe-club-panel-pill { background: rgba(var(--scrim-rgb), 0.05); transition: background 240ms ease; }
.vibe-club-panel-pill:hover { background: rgba(var(--scrim-rgb), 0.1); }
.vibe-club-panel-word:hover { text-decoration: underline; }
`;

/** The panel's width (3.2: the club's right panel is 320). */
const PANEL_WIDTH = 320;

/** A plain left click: the room opens in place. Anything else is the browser's (a new tab, a new window, the menu). */
const plainClick = (e: React.MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/** A link to a room, answered in place: `href` for the browser, `onClick` for the plain click. */
function roomLink(roomId: string, open: () => void): { href: string; onClick: (e: React.MouseEvent) => void } {
  return {
    href: chatEntry(roomId).url,
    onClick: (e) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      // The second click of a double click was aimed at what stood here before the pane moved: it opens nothing.
      if (e.detail > 1) return;
      open();
    },
  };
}

/** A button's click, but not the second click of a double click (as `roomLink`). A key press (`detail` 0) passes. */
function firstClick(run: () => void): (e: React.MouseEvent) => void {
  return (e) => {
    if (e.detail > 1) return;
    run();
  };
}

/** Two lines, then an ellipsis. */
const TWO_LINES: React.CSSProperties = { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" };

/** One line, then an ellipsis. */
const ONE_LINE: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** The words `See all` and the two heading links. */
const WORD: React.CSSProperties = { minHeight: 28, flexShrink: 0, margin: "0 -6px", padding: "0 6px", border: "none", borderRadius: 8, background: "transparent", display: "inline-flex", alignItems: "center", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, lineHeight: "18px", textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer" };

/** The hide button's mark: a window with its right column (the board's own icon). */
function PanelIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
      <path d="M14.5 4.5v15" />
    </svg>
  );
}

/** The Board's megaphone (`BoardStrip`'s and the Board chip's path), in the heading's own ink. */
function MegaphoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * The club's next event: a FLAT card (a wash, no border, nothing that
 * glows, live or not). The state line is the phone's Up next line
 * (`upNextLine`): `Live now` in coral while the event is on, else its time
 * (`Tomorrow · 7 PM`); `N going` at its right; the title; then the place.
 * The time is on the card once: beside the place while the event is live
 * (`<place> · <time>`, the state line saying `Live now`), on the state line
 * alone before it. Then the RSVP pill, which opens the RSVP dialog through
 * `onRsvp`. The
 * words above the pill are one link to the event's chat when the viewer may
 * enter it (`room_id`), else plain text. The pill is never inside the link.
 */
function EventCard({ event, t, now, onOpenRoom, onRsvp }: { event: EventRef; t: Palette; now: Date; onOpenRoom: ClubPanelProps["onOpenRoom"]; onRsvp: ClubPanelProps["onRsvp"] }) {
  const live = event.state === "live";
  const roomId = event.room_id;
  const pill = rsvpPill(event.viewer_status);
  const place = event.location.trim();
  const where = live ? [place, eventTime(event.starts_at, now)].filter(Boolean).join(" · ") : place;
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, lineHeight: "15px", color: live ? t.coralText : t.secondary, whiteSpace: "nowrap" }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{upNextLine(event, now)}</span>
        <span style={{ marginLeft: "auto", flexShrink: 0, fontWeight: 600, color: t.secondary }}>{`${event.going_count} going`}</span>
      </span>
      <span style={{ marginTop: 7, fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: "22px", letterSpacing: -0.3, color: t.ink, ...TWO_LINES }}>{event.title}</span>
      {where ? <span style={{ marginTop: 2, fontSize: 12.5, fontWeight: 500, lineHeight: "17px", color: t.secondary, ...TWO_LINES }}>{where}</span> : null}
    </>
  );
  const bodyStyle: React.CSSProperties = { minWidth: 0, borderRadius: 8, display: "flex", flexDirection: "column", textDecoration: "none", color: t.ink };
  return (
    <div style={{ flexShrink: 0, boxSizing: "border-box", padding: "12px 12px 10px", borderRadius: 18, background: "rgba(var(--scrim-rgb), 0.05)", display: "flex", flexDirection: "column" }}>
      {roomId ? (
        <a {...roomLink(roomId, () => onOpenRoom(roomId, "event"))} style={bodyStyle}>
          {body}
        </a>
      ) : (
        <div style={bodyStyle}>{body}</div>
      )}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="vibe-club-panel-pill"
          aria-label={pill.label}
          onClick={firstClick(() => onRsvp(event.id, event.viewer_status))}
          style={{ height: 34, boxSizing: "border-box", padding: event.viewer_status ? "0 12px 0 8px" : "0 14px", borderRadius: 999, border: `1px solid ${t.chipBorder}`, color: t.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          {event.viewer_status === "going" ? (
            <span aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 999, background: t.coral, color: t.coralButton.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          ) : event.viewer_status === "maybe" ? (
            <span aria-hidden="true" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 999, background: t.muted }} />
          ) : null}
          {pill.text}
        </button>
      </div>
    </div>
  );
}

/**
 * The event after the next one: one 56px row (the title, `upNextLine` and
 * the viewer's RSVP word as on the phone's Up next card, a chevron). A link
 * to its chat when the viewer may enter it; else a plain row with no chevron
 * (there is nothing to open). Spoken by the phone's own line for an event
 * tile (`upNextAriaLabel`).
 */
function EventRow({ event, t, now, onOpenRoom }: { event: EventRef; t: Palette; now: Date; onOpenRoom: ClubPanelProps["onOpenRoom"] }) {
  const roomId = event.room_id;
  const word = rsvpWord(event.viewer_status);
  const label = upNextAriaLabel(event, now);
  const style: React.CSSProperties = { marginTop: 4, height: 56, flexShrink: 0, boxSizing: "border-box", padding: "0 12px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: t.ink };
  const inner = (
    <>
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, lineHeight: "19px", letterSpacing: -0.2, ...ONE_LINE }}>{event.title}</span>
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.secondary, ...ONE_LINE }}>{word ? `${upNextLine(event, now)} · ${word}` : upNextLine(event, now)}</span>
      </span>
      {roomId ? <ChevronRight color={t.muted} /> : null}
    </>
  );
  return roomId ? (
    <a {...roomLink(roomId, () => onOpenRoom(roomId, "event"))} className="vibe-club-panel-row" aria-label={label} style={style}>
      {inner}
    </a>
  ) : (
    <div role="group" aria-label={label} style={style}>
      {inner}
    </div>
  );
}

/**
 * One Board post under `Announcements`: a button that opens the Board. The
 * byline (a 20px mark, the name, the role word, `rowTime`, and on the newest
 * post of an unread Board a plain coral dot), two lines of the post's text
 * (a card's one-line summary is already its `content`; a post with no words
 * shows none), then `N replies` when it has any. Spoken as the phone's post
 * (`postAriaLabel`), then the text, the replies, and `Open the Board`.
 */
function PostRow({ post, unread, t, now, onOpen }: { post: ChatMessage; unread: boolean; t: Palette; now: Date; onOpen: () => void }) {
  const name = authorName(post.users);
  const role = roleWord(post.author_role);
  // A deleted post (Oct 19, 2026) says so, quietly, where its words were.
  const text = post.deleted ? DELETED_POST_LINE : post.content.trim();
  const replies = (post.reply_count ?? 0) > 0 ? repliesToggleText(post.reply_count) : "";
  const disc = personColor(post.users?.id || post.user_id);
  const label = [
    postAriaLabel(name, post.author_role, rowTimeSpoken(post.created_at, now)) + (unread ? ", unread" : ""),
    text.replace(/[.\s]+$/, ""),
    replies,
    "Open the Board",
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <button
      type="button"
      className="vibe-club-panel-row"
      aria-label={label}
      onClick={firstClick(onOpen)}
      style={{ flexShrink: 0, margin: "0 -12px", padding: "8px 12px", border: "none", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, color: t.ink, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, lineHeight: "20px", whiteSpace: "nowrap", color: t.muted }}>
        <span
          aria-hidden="true"
          style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 999, background: post.users?.avatar_url ? `url(${post.users.avatar_url}) center/cover` : disc.bg, color: disc.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}
        >
          {post.users?.avatar_url ? null : initialsOf(post.users?.name || post.users?.handle || "?")}
        </span>
        <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        {role ? <span style={{ flexShrink: 0 }}>{role}</span> : null}
        <span style={{ marginLeft: "auto", flexShrink: 0 }}>{rowTime(post.created_at, now)}</span>
        {unread ? <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral }} /> : null}
      </span>
      {text ? <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: "19px", color: post.deleted ? t.muted : unread ? t.ink : t.secondary, fontStyle: post.deleted ? "italic" : undefined, overflowWrap: "anywhere", ...TWO_LINES }}>{text}</span> : null}
      {replies ? <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.muted }}>{replies}</span> : null}
    </button>
  );
}

/** The faces' spoken line: the names, then `and N more` for the members not drawn. */
function facesLabel(faces: Person[], memberCount: number): string {
  const names = faces.map((p) => p.name || p.handle).join(", ");
  const more = memberCount - faces.length;
  return more > 0 ? `${names} and ${more} more` : names;
}

/**
 * Up to five overlapping 28px marks (a photo, else initials on the person's
 * colour), each ringed in the card's own colour so the overlap reads. One
 * image to a screen reader: the names "and N more".
 */
function Faces({ faces, memberCount, t }: { faces: Person[]; memberCount: number; t: Palette }) {
  return (
    <div role="img" aria-label={facesLabel(faces, memberCount)} style={{ height: 32, flexShrink: 0, marginLeft: -2, display: "flex", alignItems: "center" }}>
      {faces.map((p, i) => {
        const disc = personColor(p.id);
        return (
          <span
            key={p.id}
            style={{ width: 32, height: 32, flexShrink: 0, boxSizing: "border-box", marginLeft: i === 0 ? 0 : -9, borderRadius: 999, border: `2px solid ${t.surface}`, background: p.avatar_url ? `url(${p.avatar_url}) center/cover` : disc.bg, color: disc.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700 }}
          >
            {p.avatar_url ? null : initialsOf(p.name || p.handle)}
          </span>
        );
      })}
    </div>
  );
}

export function ClubPanel({ space, activeRoomKind, night, now, mode, faces, onHide, onOpenRoom, onRsvp, onSeeMembers, onManageRooms }: ClubPanelProps) {
  const t = palette(night);
  const id = useId();
  const eventsId = `${id}-events`;
  const boardId = `${id}-board`;
  const boardAllId = `${id}-board-all`;
  const countId = `${id}-count`;
  const membersAllId = `${id}-members-all`;
  const membersId = `${id}-members`;

  const club = space.org.name;
  const first = space.up_next[0] ?? null;
  const second = space.up_next[1] ?? null;
  // The Board's posts come with the space read (`?panel=1`); a read made without it still has the latest one.
  const board = space.rooms.find((room) => room.kind === "board") ?? null;
  const posts = (space.board_recent ?? (space.board_latest ? [space.board_latest] : [])).slice(0, 3);
  // C13: with the Board open, its posts are in the thread beside the panel.
  const announcements = board !== null && activeRoomKind !== "board";
  const shown = (faces ?? []).slice(0, 5);
  // Opening the Board unmounts `Announcements` and the control that was pressed: focus waits on the Members section, not on `<body>`.
  const openBoard = (roomId: string) => {
    document.getElementById(membersId)?.focus({ preventScroll: true });
    onOpenRoom(roomId, "board");
  };

  const overlay = mode === "overlay";
  const place: React.CSSProperties = overlay
    ? { position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 2, padding: "8px 12px 12px", background: t.page, borderLeft: `1px solid ${t.hairline}` }
    : { alignSelf: "stretch", height: "100%", padding: "8px 12px 12px 0" };
  const heading: React.CSSProperties = { margin: 0, minWidth: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: "18px", letterSpacing: -0.2, ...ONE_LINE };
  const manage: React.CSSProperties = { flex: "1 1 0", minWidth: 0, height: 40, boxSizing: "border-box", padding: "0 10px", border: "none", borderRadius: 999, color: t.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 700, lineHeight: "18px", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer" };

  return (
    <aside className="vibe-club-panel" aria-labelledby={eventsId} style={{ flex: `0 0 ${PANEL_WIDTH}px`, width: PANEL_WIDTH, minHeight: 0, boxSizing: "border-box", display: "flex", color: t.ink, fontFamily: FONT, ...place }}>
      <style>{PANEL_CSS}</style>
      <div style={{ flexGrow: 1, minWidth: 0, minHeight: 0, borderRadius: 20, background: t.surface, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 48, flexShrink: 0, boxSizing: "border-box", padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id={eventsId} style={heading}>{`${club} events`}</h2>
          <button type="button" className="vibe-club-panel-row" onClick={firstClick(onHide)} aria-label="Hide this panel" style={{ width: 36, height: 36, flexShrink: 0, marginRight: -8, padding: 0, border: "none", borderRadius: 999, color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <PanelIcon />
          </button>
        </div>
        <div style={{ flex: "1 1 0", minHeight: 0, boxSizing: "border-box", padding: "0 18px 18px", overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column" }}>
          {/* The events: the panel's own heading names them (the `<aside>` is labelled by it), so no second landmark. */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
            {first ? (
              <>
                <EventCard event={first} t={t} now={now} onOpenRoom={onOpenRoom} onRsvp={onRsvp} />
                {second ? <EventRow event={second} t={t} now={now} onOpenRoom={onOpenRoom} /> : null}
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: "18px", color: t.muted }}>No events coming up.</p>
            )}
          </div>

          {announcements ? (
            <section aria-labelledby={boardId} style={{ marginTop: 22, flexShrink: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ minHeight: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h2 id={boardId} style={{ ...heading, display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ display: "inline-flex", color: t.secondary }}>
                    <MegaphoneIcon />
                  </span>
                  {ORG_COPY.board.title}
                </h2>
                <a {...roomLink(board.id, () => openBoard(board.id))} id={boardAllId} aria-labelledby={`${boardAllId} ${boardId}`} className="vibe-club-panel-word" style={{ ...WORD, color: t.secondary }}>
                  See all
                </a>
              </div>
              {posts.length > 0 ? (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {posts.map((post, i) => (
                    // The dot marks the newest post only, and only while the Board itself is unread.
                    <PostRow key={post.id} post={post} unread={i === 0 && board.unread} t={t} now={now} onOpen={() => openBoard(board.id)} />
                  ))}
                </div>
              ) : (
                <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 500, lineHeight: "18px", color: t.muted }}>{emptyLine("board", club)}</p>
              )}
            </section>
          ) : null}

          <section id={membersId} tabIndex={-1} aria-label="Members" style={{ marginTop: 18, minHeight: 36, flexShrink: 0, borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
            {shown.length > 0 ? <Faces faces={shown} memberCount={space.org.member_count} t={t} /> : null}
            <span id={countId} style={{ marginRight: "auto", minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: "18px", color: t.muted, ...ONE_LINE }}>{countWord(space.org.member_count, "member")}</span>
            <button type="button" id={membersAllId} aria-labelledby={`${membersAllId} ${countId}`} className="vibe-club-panel-word" onClick={firstClick(onSeeMembers)} style={{ ...WORD, color: t.secondary }}>
              See all
            </button>
          </section>

          {onManageRooms ? (
            // Owner and admin only (C11): the caller hands `onManageRooms` to nobody else, and both doors hang on it.
            <div style={{ marginTop: "auto", paddingTop: 18, flexShrink: 0, display: "flex", gap: 8 }}>
              <a href={`/campus?manage=${encodeURIComponent(space.org.handle)}`} className="vibe-club-panel-wash" style={manage}>
                Manage club
              </a>
              <button type="button" className="vibe-club-panel-wash" onClick={firstClick(onManageRooms)} style={manage}>
                Manage rooms
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
