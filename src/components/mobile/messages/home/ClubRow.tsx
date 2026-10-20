"use client";

import type { InboxClub, RoomKind } from "@/lib/chat/types";

import { clubGradient } from "../avatar";
import { initialsOf } from "../format";
import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";

import { clubChip, clubPreview, clubQuietLine, clubRowLabel, clubRowTime, newCountText } from "./home-rules";
import { PinIcon, ROW_FRAME, ROW_PICTURE, ROW_TEXT } from "./PersonRow";
import { InterestedRing } from "./RsvpMark";

/**
 * A club row of the Messages home (handoffs/chat-redesign/wave-2-contracts.md
 * 1.2 "Club row", 11.1; W2-S1) — `W0_Home:96-108, 121-134, 136-150, 163-172`.
 * 48px avatar (`logo_url` or initials on `clubGradient(org.id)`), the name
 * 16.5px/800 Fraunces, the time `rowTime(last_activity_at)`, the preview line
 * (SCREENS-L8, `clubPreview`), the chip line (`Live now · <title>` /
 * `<eventTimeShort> · <title>` + `Going` / `Interested`, `N new` at the right).
 * Tap → the club space on the Lounge, or on the Board when `board.unread`
 * and the Lounge has nothing new (11.1).
 *
 * Oct 19, 2026 (critique D4, handoffs/2026-10-19-critique/PLAN.md B5): a
 * club with no preview and no chip drew a one-line row exactly as tall as its
 * picture, so two such rows had pictures touching. Every row now has a second
 * line (`clubQuietLine` when there is nothing else to say) and the shared
 * row frame (`ROW_FRAME`, `ROW_TEXT`): at least 66px, the picture centred
 * with room above and below, the divider at the row's bottom edge.
 *
 * A club with BOTH a preview and an event chip keeps three lines (about 87px),
 * as the approved W0_Home board draws Salsa Club, Jag Robotics and Film
 * Society: dropping the preview there would hide an unread Board post, the
 * officers' line, behind any club's weekly event (B5 review, Oct 19, 2026).
 */
export function ClubRow({
  club,
  now,
  onOpen,
}: {
  club: InboxClub;
  now: Date;
  onOpen: (roomId: string, roomKind: RoomKind) => void;
}) {
  const night = useNightTheme();
  const t = palette(night);
  const preview = clubPreview(club);
  const chip = clubChip(club, now);
  const newText = newCountText(club.lounge.unread_count);
  const quiet = clubQuietLine(club, now);
  const openBoard = club.board.unread && club.lounge.unread_count === 0;
  // `N new` with no event chip sits at the right of the preview line, not
  // alone on a third line (VIS-S1-4): the row stays 66px like its neighbours.
  const pillOnPreview = !chip && !!newText && !!preview;
  const pill = newText ? (
    <span
      style={{
        marginLeft: "auto",
        height: 20,
        flexShrink: 0,
        boxSizing: "border-box",
        padding: "0 8px",
        borderRadius: 999,
        background: "rgba(var(--scrim-rgb),0.08)",
        color: t.secondary,
        fontSize: 11.5,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {newText}
    </span>
  ) : null;

  return (
    <li style={{ listStyle: "none" }}>
      <button
        type="button"
        onClick={() => (openBoard ? onOpen(club.board.room_id, "board") : onOpen(club.lounge.room_id, "lounge"))}
        aria-label={clubRowLabel(club, now)}
        style={{ ...ROW_FRAME, color: t.ink, fontFamily: FONT }}
      >
        <span
          aria-hidden="true"
          style={{
            width: ROW_PICTURE,
            height: ROW_PICTURE,
            flexShrink: 0,
            borderRadius: 999,
            background: club.org.logo_url ? `url(${club.org.logo_url}) center/cover` : clubGradient(club.org.id),
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SERIF,
            fontWeight: 800,
            fontSize: 18,
            color: "#FAF7F2",
          }}
        >
          {club.org.logo_url ? null : initialsOf(club.org.name)}
        </span>
        <span style={{ ...ROW_TEXT, borderBottom: `1px solid ${t.hairline}`, gap: 3 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                minWidth: 0,
                fontFamily: SERIF,
                fontWeight: 800,
                fontSize: 16.5,
                lineHeight: 1.25,
                letterSpacing: "-0.3px",
                color: t.ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {club.org.name}
            </span>
            {club.pinned_at ? <PinIcon color={t.muted} /> : null}
            <span
              style={{
                marginLeft: club.pinned_at ? 0 : "auto",
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 600,
                // The mockup brightens the time for an unread Board post only
                // (`W0_Home:101,126` vs `:141`); `N new` carries its own pill.
                color: club.board.unread ? t.secondary : t.muted,
              }}
            >
              {clubRowTime(club, now)}
            </span>
          </span>
          {preview ? (
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  fontSize: 13.5,
                  lineHeight: 1.35,
                  color: club.board.unread ? t.ink : t.secondary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {preview.dot ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      marginRight: 7,
                      borderRadius: 999,
                      background: t.coral,
                      verticalAlign: 1,
                    }}
                  />
                ) : null}
                {preview.prefix ? <b style={{ fontWeight: 700 }}>{preview.prefix}</b> : null}
                {preview.prefix ? " " : null}
                {preview.deleted ? <span style={{ fontStyle: "italic", color: t.muted }}>{preview.text}</span> : preview.text}
              </span>
              {pillOnPreview ? pill : null}
            </span>
          ) : quiet ? (
            // The quiet second line (D4): a club with nothing else to show still reads as two lines.
            <span style={{ minWidth: 0, fontSize: 13.5, lineHeight: 1.35, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {quiet}
            </span>
          ) : null}
          {chip || (newText && !pillOnPreview) ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1, minWidth: 0 }}>
              {chip ? (
                <span
                  style={{
                    height: 22,
                    minWidth: 0,
                    boxSizing: "border-box",
                    padding: chip.live ? "0 9px 0 8px" : "0 9px 0 7px",
                    borderRadius: 999,
                    border: chip.live ? "1px solid rgba(255,92,53,0.50)" : "1px solid rgba(var(--scrim-rgb),0.10)",
                    background: chip.live ? "rgba(255,92,53,0.14)" : "rgba(var(--scrim-rgb),0.05)",
                    // The live chip is a coral-tinted surface: the coral MARK
                    // (11.0), since coral TEXT on it is 4.0:1 in Light.
                    color: chip.live ? t.coralMark : t.secondary,
                    fontSize: 12,
                    fontWeight: chip.live ? 700 : 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: chip.live ? 6 : 5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  {chip.live ? (
                    <span aria-hidden="true" style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: t.coral }} />
                  ) : (
                    <CalendarIcon />
                  )}
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{chip.text}</span>
                </span>
              ) : null}
              {chip?.rsvp === "going" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: t.coralText, flexShrink: 0 }}>
                  <CheckIcon />
                  Going
                </span>
              ) : chip?.rsvp === "maybe" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: t.secondary, flexShrink: 0 }}>
                  {/* "Interested", not "Maybe", with the calendar key's coral ring (Oct 19, 2026, decision 12). */}
                  <InterestedRing coral={t.coral} />
                  Interested
                </span>
              ) : null}
              {pill}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** The 12px calendar on a next-event chip (`W0_Home:130`). */
function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

/** The Going check (`W0_Home:146`): a shape, not a colour alone (11.0). */
export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
