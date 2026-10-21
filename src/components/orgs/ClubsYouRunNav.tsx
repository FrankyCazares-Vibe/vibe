"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type CSSProperties, type JSX } from "react";

import { isClubPath } from "@/components/mobile/mobile-tab-active";
import { ClubLogo } from "@/components/profile/ClubFlair";
import { useClubsYouRun } from "@/lib/orgs/club-switch";

/**
 * "Clubs you run" in the desktop left menu (wave 2, WAVE2-DESIGN.md C5;
 * board R2_Club_Desktop): one line per club I'm the owner or an officer of,
 * above the founders' Admin link (which stays founders-only). A computer has
 * no switch: each line is just the club's page. A coral dot while that club
 * has join requests. Nothing at all until the list has a club, so for most
 * people this draws nothing. Asks once, through the switcher's two-minute
 * cache (club-switch.ts).
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
    <>
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
              <ClubLogo name={club.name} url={club.logo_url} size={22} />
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
    </>
  );
}

/** LeftNav's "Platform" eyebrow, the same look. */
const eyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  padding: "12px 12px 6px",
  marginTop: 6,
};

const listStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

/** LeftNav's own lines (padding, radius, type), so the menu reads as one list. */
const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 500,
  color: "var(--ink-muted)",
  textDecoration: "none",
  background: "none",
  transition: "all 0.15s",
  minWidth: 0,
};

const lineHereStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--charcoal)",
  background: "var(--paper)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
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
