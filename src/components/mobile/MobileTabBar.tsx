"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
 * 899px). Desktop never renders it.
 */

type MobileTab = {
  href: string;
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

export function MobileTabBar() {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <nav className="vibe-mobile-tabbar" aria-label="Primary">
      {MOBILE_TABS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "vibe-mobile-tab vibe-mobile-tab--active"
                : "vibe-mobile-tab"
            }
            aria-current={active ? "page" : undefined}
          >
            <span className="vibe-mobile-tab-icon">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
