"use client";

import { useId } from "react";

import { EventAbout } from "@/components/mobile/messages/club/EventAbout";
import { FONT, palette, SERIF } from "@/components/mobile/messages/v2-tokens";

import type { EventPanelProps } from "./contracts";

/**
 * The right panel of an event chat on desktop Messages (handoffs/chat-redesign/
 * wave-3-desktop/contract.md 3.2, 3.3, C12, 4c.4, section 8 W3-5-club): the
 * panel chrome (the event's title and the hide button) around the phone's
 * `EventAbout`, unchanged: the hero with the state pill, Where, When, Who's
 * going and the RSVP pill.
 *
 * `ClubPane` mounts it in the club panel's place while the open room is an
 * event chat and a panel is on screen; with no panel on screen the same
 * block is the thread's header instead, so it is on screen once, always.
 * Everything on it is `event` (the open room's own read); it never fetches
 * and holds no state. `onRsvp` opens the RSVP dialog in the pane.
 *
 * Calm (3.2): in an event chat `EventAbout`'s live mark is the one thing
 * that glows; the chrome adds none. Every colour here is `palette(night)` or
 * a CSS variable. `EventAbout`'s own hero and pill inks are the phone's and
 * are not this file's to change.
 *
 * `mode` places it, the same way as the club's panel, so the two swap in one
 * place. `"side"`: a flex item, 320 wide, of the row it is mounted in.
 * `"overlay"`: the same column over the pane's right edge (absolute, right
 * 0, in the page's colour, a hairline at its left, no scrim); its nearest
 * positioned ancestor is the box `ClubPane` gives it. Either way it closes
 * on its own button (`onHide`).
 */

/** The panel's width (3.2: a club's right panel is 320). */
const PANEL_WIDTH = 320;

const PANEL_CSS = `
.vibe-event-panel-hide { background: transparent; transition: background 240ms ease; }
.vibe-event-panel-hide:hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-event-panel button:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
`;

export function EventPanel({ event, night, now, mode, onHide, onRsvp }: EventPanelProps) {
  const t = palette(night);
  const titleId = useId();
  const place: React.CSSProperties =
    mode === "overlay"
      ? { position: "absolute", top: 0, right: 0, bottom: 0, padding: "8px 12px 12px", background: t.page, borderLeft: `1px solid ${t.hairline}` }
      : { alignSelf: "stretch", height: "100%", padding: "8px 12px 12px 0" };
  return (
    <aside className="vibe-event-panel" aria-labelledby={titleId} style={{ flex: `0 0 ${PANEL_WIDTH}px`, width: PANEL_WIDTH, minHeight: 0, boxSizing: "border-box", display: "flex", color: t.ink, fontFamily: FONT, ...place }}>
      <style>{PANEL_CSS}</style>
      <div style={{ flexGrow: 1, minWidth: 0, minHeight: 0, borderRadius: 20, background: t.surface, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 48, flexShrink: 0, boxSizing: "border-box", padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id={titleId} style={{ margin: 0, minWidth: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: "18px", letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {event.title}
          </h2>
          <button
            type="button"
            className="vibe-event-panel-hide"
            onClick={(e) => {
              // Not the second click of a double click (as the club panel's): the header's toggle has just shown this panel and this button landed under the pointer.
              if (e.detail > 1) return;
              onHide();
            }}
            aria-label="Hide this panel"
            style={{ width: 36, height: 36, flexShrink: 0, marginRight: -8, padding: 0, border: "none", borderRadius: 999, color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
              <path d="M14.5 4.5v15" />
            </svg>
          </button>
        </div>
        {/* `EventAbout` brings its own 12px sides (the phone's): 6 more here puts it on the title's line. The column scrolls by itself. */}
        <div style={{ flex: "1 1 0", minHeight: 0, boxSizing: "border-box", padding: "0 6px 18px", overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column" }}>
          <EventAbout event={event} night={night} now={now} onRsvp={onRsvp} />
        </div>
      </div>
    </aside>
  );
}
