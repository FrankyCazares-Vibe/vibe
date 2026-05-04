"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIdentityChip } from "@/components/nav-identity-chip";
import { isGlobalFeedSurfaceEnabled } from "@/lib/feature-flags";

const navItems = [
  {
    href: "/campus",
    label: "Campus",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1L15 5V7H1V5L8 1Z"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinejoin="round"
        />
        <rect
          x="2"
          y="7"
          width="2.5"
          height="6"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
        />
        <rect
          x="6.75"
          y="7"
          width="2.5"
          height="6"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
        />
        <rect
          x="11.5"
          y="7"
          width="2.5"
          height="6"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
        />
        <path
          d="M1 13h14"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/feed",
    label: "Feed",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="2" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="2" fill="currentColor" />
        <rect x="1" y="9" width="6" height="6" rx="2" fill="currentColor" />
        <rect x="9" y="9" width="6" height="6" rx="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "My Profile",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M1 15c0-3.866 3.134-6 7-6s7 2.134 7 6"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/network",
    label: "Network",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="2.5" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle
          cx="13.5"
          cy="12"
          r="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M5.5 4.5L2.5 10M10.5 4.5L13.5 10M5.8 12h4.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/messages",
    label: "Messages",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v8A1.5 1.5 0 0113.5 12H5L1 15V2.5z"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const visibleNavItems = isGlobalFeedSurfaceEnabled()
  ? navItems
  : navItems.filter((item) => item.href !== "/feed");

export default function LeftNav() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        padding: "20px 14px",
        borderRight: "1px solid rgba(28,28,30,0.08)",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        background: "#FAF7F2",
      }}
    >
      <Link
        href="/profile"
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "22px",
          fontWeight: "900",
          color: "#1C1C1E",
          letterSpacing: "-1px",
          display: "block",
          marginBottom: "24px",
          textDecoration: "none",
        }}
      >
        vibe<span style={{ color: "#FF5C35" }}>.</span>
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" &&
              pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: isActive ? "600" : "500",
                color: isActive ? "#1C1C1E" : "#8A8580",
                textDecoration: "none",
                background: isActive ? "white" : "none",
                boxShadow: isActive ? "0 4px 24px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          height: "1px",
          background: "rgba(28,28,30,0.08)",
          margin: "12px 0",
        }}
      />

      <NavIdentityChip />

      <button
        type="button"
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "12px",
          background: "#FF5C35",
          color: "white",
          fontFamily: "DM Sans, sans-serif",
          fontSize: "14px",
          fontWeight: "700",
          border: "none",
          cursor: "not-allowed",
          marginTop: "auto",
          paddingTop: "10px",
          opacity: 0.65,
        }}
        disabled
      >
        + Post (soon)
      </button>
    </aside>
  );
}
