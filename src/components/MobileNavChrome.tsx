"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CalendarWidget, VIBE_NAV_ITEMS } from "@/components/LeftNav";
import { NavIdentityChip } from "@/components/nav-identity-chip";

/**
 * Mobile-only chrome rendered by CampusAppShell below the 900px breakpoint.
 *
 * Pattern: slim top bar with a hamburger + brand, bottom tab bar with the
 * five primary destinations, and a slide-in left sheet for the calendar
 * widget and the admin / sign-out tail of the desktop LeftNav.
 *
 * Visibility is fully driven by the `.vibe-mobile-only` CSS gate in
 * globals.css so the JSX can render unconditionally without hydration
 * mismatches.
 */
export function MobileNavChrome() {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Sheet closes whenever the route changes — covers in-sheet link taps and
  // the browser back button. The ref guard avoids the initial-mount close
  // (the sheet starts closed anyway) and keeps eslint happy about not
  // setting state synchronously on every render.
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    closeSheet();
  }, [pathname, closeSheet]);

  // Lock the page scroll while the sheet is open so the body underneath
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
        {VIBE_NAV_ITEMS.map((item) => {
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

        {isPlatformAdmin ? (
          <>
            <div className="vibe-mobile-sheet-divider" />
            <Link
              href="/admin"
              onClick={closeSheet}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: "#5C5853",
                textDecoration: "none",
                background: "rgba(240,200,74,0.10)",
                border: "1px solid rgba(240,200,74,0.4)",
              }}
            >
              Admin
            </Link>
          </>
        ) : null}

        <div className="vibe-mobile-sheet-divider" />

        <CalendarWidget />
      </aside>
    </div>
  );
}
