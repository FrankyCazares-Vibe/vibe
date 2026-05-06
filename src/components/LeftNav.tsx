"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NavIdentityChip } from "@/components/nav-identity-chip";

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
  {
    href: "/otto",
    label: "otto",
    icon: (
      <span
        style={{
          display: "inline-flex",
          width: 16,
          height: 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#FF5C35",
            boxShadow: "0 0 6px #FF5C35",
          }}
        />
      </span>
    ),
  },
];

const visibleNavItems = navItems;

export default function LeftNav() {
  const pathname = usePathname();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Pull admin status from the bootstrap endpoint so the Admin link only
  // renders for platform admins. Cheap fetch (cached by the chip too) — no
  // duplicated DB hit since the response is shared with NavIdentityChip
  // via HTTP cache when both call /api/me/profile-bootstrap.
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
        /* unauthenticated / network — silently leave admin link hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        href="/campus"
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

      {isPlatformAdmin ? (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#8A8580",
              padding: "12px 12px 6px",
              marginTop: 6,
            }}
          >
            Platform
          </div>
          <Link
            href="/admin"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: pathname.startsWith("/admin") ? 700 : 600,
              color: pathname.startsWith("/admin") ? "#1C1C1E" : "#5C5853",
              textDecoration: "none",
              background: pathname.startsWith("/admin")
                ? "linear-gradient(180deg, rgba(240,200,74,0.32) 0%, rgba(240,200,74,0.14) 100%)"
                : "rgba(240,200,74,0.10)",
              border: "1px solid rgba(240,200,74,0.4)",
              boxShadow: pathname.startsWith("/admin")
                ? "inset 0 1px 0 rgba(255,255,255,0.6)"
                : "none",
              transition: "all 0.15s",
            }}
          >
            <ShieldIcon />
            Admin
          </Link>
        </>
      ) : null}

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

function ShieldIcon() {
  return (
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
  );
}
