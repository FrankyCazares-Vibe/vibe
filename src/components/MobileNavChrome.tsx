"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CalendarWidget } from "@/components/LeftNav";
import { NavIdentityChip } from "@/components/nav-identity-chip";

/**
 * Mobile-only chrome rendered by CampusAppShell below the 900px breakpoint.
 *
 * Instagram-style bottom tab bar: Campus / Network / Otto / Messages /
 * Profile. Settings + Admin + Calendar live in the slide-out left sheet
 * (hamburger top-left). The desktop LeftNav has Settings inline; on mobile
 * we make room for a Profile tab instead — that was the missing piece.
 *
 * Visibility is fully driven by the `.vibe-mobile-only` CSS gate in
 * globals.css so the JSX can render unconditionally without hydration
 * mismatches.
 */

type MobileTab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** When true, only an exact match counts as active (prevents `/profile`
   *  from lighting up on `/profile/foo` … wait, we actually WANT that.
   *  Used for `/` style roots only.) */
  exact?: boolean;
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

const SETTINGS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

export function MobileNavChrome() {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Sheet closes whenever the route changes — covers in-sheet link taps and
  // the browser back button. The ref guard skips the initial-mount close
  // (the sheet starts closed anyway).
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    closeSheet();
  }, [pathname, closeSheet]);

  // Lock page scroll while the sheet is open so the body underneath
  // doesn't drift when the user swipes inside the sheet's calendar.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  // Same admin probe as LeftNav. Cheap — same endpoint, browser caches it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/profile-bootstrap", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && data.isPlatformAdmin === true) {
          setIsPlatformAdmin(true);
        }
      } catch {
        /* signed-out / offline — just leave admin hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <div className="vibe-mobile-only">
      <header className="vibe-mobile-topbar">
        <button
          type="button"
          className="vibe-mobile-topbar-burger"
          onClick={() => setSheetOpen(true)}
          aria-label="Open navigation"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <Link href="/campus" className="vibe-mobile-topbar-brand">
          vibe<span className="vibe-mobile-topbar-brand-dot">.</span>
        </Link>
      </header>

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

      <div
        className={
          sheetOpen
            ? "vibe-mobile-sheet-backdrop vibe-mobile-sheet-backdrop--open"
            : "vibe-mobile-sheet-backdrop"
        }
        onClick={closeSheet}
        aria-hidden={!sheetOpen}
      />
      <aside
        className={
          sheetOpen ? "vibe-mobile-sheet vibe-mobile-sheet--open" : "vibe-mobile-sheet"
        }
        role="dialog"
        aria-label="Navigation"
        aria-hidden={!sheetOpen}
      >
        <div className="vibe-mobile-sheet-header">
          <Link href="/campus" className="vibe-mobile-sheet-brand" onClick={closeSheet}>
            vibe<span style={{ color: "#FF5C35" }}>.</span>
          </Link>
          <button
            type="button"
            className="vibe-mobile-sheet-close"
            onClick={closeSheet}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>

        <NavIdentityChip />

        <div className="vibe-mobile-sheet-divider" />

        <Link
          href="/settings"
          onClick={closeSheet}
          className="vibe-mobile-sheet-link"
        >
          {SETTINGS_ICON}
          Settings
        </Link>

        {isPlatformAdmin ? (
          <Link
            href="/admin"
            onClick={closeSheet}
            className="vibe-mobile-sheet-link vibe-mobile-sheet-link--admin"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 1l5.5 1.8v4.4c0 3.6-2.4 6.4-5.5 7.3-3.1-.9-5.5-3.7-5.5-7.3V2.8L8 1z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
                fill="rgba(240,200,74,0.25)"
              />
              <path
                d="M5.7 8.2l1.7 1.7L10.7 6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            Admin
          </Link>
        ) : null}

        <div className="vibe-mobile-sheet-divider" />

        <CalendarWidget />
      </aside>
    </div>
  );
}
