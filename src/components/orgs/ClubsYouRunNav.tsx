"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type CSSProperties, type JSX } from "react";

import { isClubPath } from "@/components/mobile/mobile-tab-active";
import { ClubLogo } from "@/components/profile/ClubFlair";
import { useClubsYouRun } from "@/lib/orgs/club-switch";

/**
 * "Clubs you run" on a computer (wave 2, WAVE2-DESIGN.md C5; board
 * R2_Club_Desktop): one line per club I'm the owner or an officer of. Since
 * Oct 21, 2026 (Franky: the separate menu block pushed the card out of
 * sight) it sits INSIDE the left menu's profile card, under my name, instead
 * of as its own block above Admin. A computer has no switch: each line is
 * just the club's page. A coral dot while that club has join requests.
 * Nothing at all until the list has a club, so for most people the card is
 * unchanged. Asks once, through the switcher's two-minute cache
 * (club-switch.ts).
 */
/** LeftNav shows from 900px up (CampusAppShell mounts it at every width and hides it below). */
const DESKTOP_QUERY = "(min-width: 900px)";

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isDesktopNow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;
}

export function ClubsYouRunNav(): JSX.Element | null {
  const pathname = usePathname() ?? "";
  // Asks only where the menu shows (review F3): a phone, where LeftNav is
  // mounted but hidden, never asks. "Not desktop" on the server and while
  // hydrating, so the first render and the server agree and nothing is asked
  // before the width is known.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktopNow, () => false);
  const runs = useClubsYouRun(desktop);
  if (runs.status !== "ok" || runs.clubs.length === 0) return null;

  return (
    <div style={sectionStyle}>
      <div style={eyebrowStyle}>Clubs you run</div>
      <nav aria-label="Clubs you run" style={listStyle}>
        {runs.clubs.map((club) => {
          const here = isClubPath(pathname, club.handle);
          const waiting = (club.requests ?? 0) > 0;
          return (
            <Link
              key={club.org_id}
              href={`/orgs/${encodeURIComponent(club.handle)}`}
              aria-current={here ? "page" : undefined}
              style={here ? { ...lineStyle, ...lineHereStyle } : lineStyle}
            >
              <ClubLogo name={club.name} url={club.logo_url} size={20} />
              <span style={nameStyle}>{club.name}</span>
              {waiting ? (
                <>
                  <span aria-hidden="true" style={dotStyle} />
                  <span style={srOnlyStyle}>, join requests to review</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** The card's lower part: a hairline under my name, the card's own paper. */
const sectionStyle: CSSProperties = {
  borderTop: "1px solid var(--hairline)",
  padding: "6px 4px",
  background: "var(--paper)",
};

/** LeftNav's "Platform" eyebrow, a size down for the card. */
const eyebrowStyle: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  padding: "4px 6px 4px",
};

const listStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };

/** The card's type (12.5px names), so the lines read as part of it. */
const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 6px",
  borderRadius: 8,
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--ink-2)",
  textDecoration: "none",
  background: "none",
  transition: "background 0.15s, color 0.15s",
  minWidth: 0,
};

const lineHereStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--charcoal)",
  background: "var(--row-hover)",
};

const nameStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const dotStyle: CSSProperties = {
  flexShrink: 0,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--coral)",
};

const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
