"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { activeMobileTab, type MobileTabHref } from "@/components/mobile/mobile-tab-active";
import { SPRING_SNAPPY } from "@/lib/motion/springs";

/**
 * Bottom tab bar — the only mobile chrome. Renders from any mobile page
 * (MobileShell wraps every forked route; CampusAppShell also renders it
 * for the routes that still use the legacy shell-with-media-query path
 * during the migration to per-route forks).
 *
 * iOS-native pattern: per-screen headers live inside each page so they
 * can match that page's vibe (e.g. campus's crimson banner, otto's
 * hero, profile's cover). No top brand bar, no slide-in hamburger sheet
 * — those were holdover web patterns. Settings + Admin are reached
 * from the Profile tab.
 *
 * Visibility is owned by the `.vibe-mobile-tabbar` class — `display:
 * none` by default, `display: grid` only inside @media (max-width:
 * 899px). Desktop never shows it. Server pages can render it
 * directly: it is `display: none` above 899px, so it needs no
 * useIsMobile fork (see /orgs/[handle], /plus).
 *
 * Which tab lights lives in `mobile-tab-active.ts`: the five tabs by
 * exact match or subpath, plus the routes filed under one of them (a
 * club page under Campus, /plus under Profile).
 */

type MobileTab = {
  href: MobileTabHref;
  label: string;
  icon: React.ReactNode;
};

const MOBILE_TABS: MobileTab[] = [
  {
    href: "/campus",
    label: "Campus",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M11 2L20 6.5V9H2V6.5L11 2Z"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinejoin="round"
        />
        <rect x="3" y="9" width="3.2" height="8.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="9.4" y="9" width="3.2" height="8.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="15.8" y="9" width="3.2" height="8.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M2 17.2h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/network",
    label: "Network",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <circle cx="11" cy="6" r="3.2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="4" cy="16" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="16" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M7.5 7.5L4.5 13.5M14.5 7.5L17.5 13.5M7 16h8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/otto",
    label: "otto",
    icon: (
      <span
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#FF5C35",
            boxShadow: "0 0 8px rgba(255,92,53,0.55)",
          }}
        />
      </span>
    ),
  },
  {
    href: "/messages",
    label: "Messages",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M2 4A1.6 1.6 0 0 1 3.6 2.4h14.8A1.6 1.6 0 0 1 20 4v10A1.6 1.6 0 0 1 18.4 15.6H6.5L2 19V4z"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <circle cx="11" cy="7.5" r="3.4" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3.5 19c.7-3.6 3.8-5.8 7.5-5.8s6.8 2.2 7.5 5.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

/** The tab lit by the last bar on screen in this page load (null: none
 *  lit; undefined: no bar yet). A cold load (server HTML included) shows its
 *  lit icon as is; a bar that lights a different tab (a tap to another tab)
 *  settles its icon in; one that lights the same tab (a club page inside
 *  Campus, then Back) doesn't. */
let lastLitHref: MobileTabHref | null | undefined;

export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const activeHref = activeMobileTab(pathname);
  const settle = lastLitHref !== undefined && activeHref !== lastLitHref;
  useEffect(() => {
    lastLitHref = activeHref;
  }, [activeHref]);

  return (
    <nav className="vibe-mobile-tabbar" aria-label="Primary">
      {MOBILE_TABS.map((item) => {
        const active = item.href === activeHref;
        // The Otto tab is the final spotlight target on the network leg
        // of the Otto tour — anchor it with a stable id so the engine
        // can find it.
        const id = item.href === "/otto" ? "otto-mobile-tour-network-otto" : undefined;
        return (
          <Link
            key={item.href}
            id={id}
            href={item.href}
            className={
              active
                ? "vibe-mobile-tab vibe-mobile-tab--active vibe-press"
                : "vibe-mobile-tab vibe-press"
            }
            // "page" only on the tab's own page. A club page sits inside
            // Campus, and /profile/<handle> inside Profile, without being
            // that page, so there the lit tab is just "true".
            aria-current={active ? (pathname === item.href ? "page" : "true") : undefined}
          >
            {/* The lit tab's icon settles in from 0.9 (Oct 18, 2026, motion
                pass). Keyed on the state, so it plays when a tab lights in
                this bar, and on the bar a tab tap mounts (each page mounts
                its own), but not on a cold load or on a new bar that lights
                the tab that was already lit. The coral mark above stays
                the CSS one: it can't slide between bars that aren't the same
                element. */}
            <motion.span
              key={active ? "on" : "off"}
              className="vibe-mobile-tab-icon"
              initial={active && settle ? { scale: 0.9 } : false}
              animate={{ scale: 1 }}
              transition={SPRING_SNAPPY}
            >
              {item.icon}
            </motion.span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
