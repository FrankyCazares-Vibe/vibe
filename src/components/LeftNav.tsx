"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { NavIdentityChip } from "@/components/nav-identity-chip";

/** Site-wide event so any component can ping the calendar to refetch. */
export const CALENDAR_CHANGED_EVENT = "vibe:calendar-changed";
export function emitCalendarChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CALENDAR_CHANGED_EVENT));
  }
}

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
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
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

      <div
        style={{
          height: "1px",
          background: "rgba(28,28,30,0.08)",
          margin: "12px 0",
        }}
      />

      <CalendarWidget />
    </aside>
  );
}

export type CalEntry =
  | {
      kind: "rsvp";
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      location: string;
      color: string;
      viewer_status: "going" | "maybe";
      org: { handle: string; name: string; verified: boolean } | null;
    }
  | {
      kind: "personal";
      id: string;
      title: string;
      starts_at: string;
      ends_at: string | null;
      location: string;
      notes: string;
      color: string;
    };

const CAL_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const CAL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymdKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildMonthCells(year: number, month: number): Array<{
  date: Date;
  key: string;
  otherMonth: boolean;
}> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; key: string; otherMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrev - i);
    cells.push({ date: d, key: ymdKey(d), otherMonth: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    cells.push({ date: d, key: ymdKey(d), otherMonth: false });
  }
  while (cells.length < 42) {
    const offset = cells.length - (firstDay + daysInMonth) + 1;
    const d = new Date(year, month + 1, offset);
    cells.push({ date: d, key: ymdKey(d), otherMonth: true });
  }
  return cells;
}

function CalendarWidget() {
  const [entries, setEntries] = useState<CalEntry[] | null>(null);
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [modalOpen, setModalOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/me/calendar", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.entries)) {
        setEntries(data.entries as CalEntry[]);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/calendar", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setEntries(
          data?.ok && Array.isArray(data.entries) ? (data.entries as CalEntry[]) : [],
        );
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for RSVP / personal-event changes from anywhere in the app so
  // the calendar mirror stays in sync without remounting.
  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener(CALENDAR_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CALENDAR_CHANGED_EVENT, handler);
  }, [reload]);

  const byDay = useMemo(() => {
    const out: Record<string, CalEntry[]> = {};
    for (const e of entries ?? []) {
      const k = ymdKey(new Date(e.starts_at));
      (out[k] ??= []).push(e);
    }
    return out;
  }, [entries]);

  const totalCount = entries?.length ?? 0;
  const todayKey = ymdKey(today);
  const monthLabel = `${CAL_MONTHS[view.month].slice(0, 3)} ${view.year}`;
  const cells = buildMonthCells(view.year, view.month);

  const changeMonth = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 4px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "Fraunces, serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "-0.1px",
            color: "#1C1C1E",
          }}
          title="Open full calendar"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M1 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M4 1v2M10 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          My Calendar
          {totalCount > 0 ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 9,
                fontWeight: 800,
                background: "#FF5C35",
                color: "#fff",
                padding: "1px 6px",
                borderRadius: 999,
                marginLeft: 3,
              }}
            >
              {totalCount}
            </span>
          ) : null}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 2px",
          }}
        >
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            style={calNavBtnStyle}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#1C1C1E",
              fontFamily: "DM Sans, sans-serif",
              textAlign: "center",
              flex: 1,
            }}
          >
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            style={calNavBtnStyle}
          >
            ›
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 1,
          }}
        >
          {CAL_DAYS.map((d, i) => (
            <div
              key={`d-${i}`}
              style={{
                fontSize: 8,
                fontWeight: 800,
                color: "#8A8580",
                textAlign: "center",
                padding: "2px 0",
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              {d}
            </div>
          ))}
          {cells.map((cell, i) => {
            const hasEvent = !!byDay[cell.key];
            const isToday = cell.key === todayKey;
            const dayBg = isToday ? "#1C1C1E" : "transparent";
            const dayColor = isToday ? "#fff" : cell.otherMonth ? "#8A8580" : "#1C1C1E";
            const dayOpacity = cell.otherMonth ? 0.35 : 1;
            return (
              <button
                key={`c-${i}`}
                type="button"
                onClick={() => setModalOpen(true)}
                aria-label={cell.date.toDateString()}
                style={{
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: isToday ? 800 : 600,
                  fontFamily: "DM Sans, sans-serif",
                  color: dayColor,
                  background: dayBg,
                  opacity: dayOpacity,
                  cursor: "pointer",
                  position: "relative",
                  padding: 0,
                  transition: "background 120ms ease",
                }}
              >
                {cell.date.getDate()}
                {hasEvent ? (
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: isToday ? "#fff" : "#FF5C35",
                      position: "absolute",
                      bottom: 2,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {modalOpen ? (
        <CalendarModal
          entries={entries ?? []}
          onClose={() => setModalOpen(false)}
          onChange={() => void reload()}
        />
      ) : null}
    </>
  );
}

function CalendarModal({
  entries,
  onClose,
  onChange,
}: {
  entries: CalEntry[];
  onClose: () => void;
  onChange: () => void;
}) {
  const today = new Date();
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const byDay = useMemo(() => {
    const out: Record<string, CalEntry[]> = {};
    for (const e of entries) {
      const k = ymdKey(new Date(e.starts_at));
      (out[k] ??= []).push(e);
    }
    return out;
  }, [entries]);

  const changeMonth = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  const cells = buildMonthCells(view.year, view.month);
  const monthLabel = `${CAL_MONTHS[view.month]} ${view.year}`;
  const todayKey = ymdKey(today);
  const selectedEntries = selected ? byDay[selected] ?? [] : [];
  const selectedDateLabel = selected
    ? new Date(`${selected}T00:00:00`).toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Lock body scroll while the modal is up so the page underneath doesn't
  // creep when the user wheels inside the day grid.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.18)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 920,
          maxHeight: "90vh",
          background: "#FFFFFF",
          borderRadius: 22,
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.10)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 22px",
            borderBottom: "1px solid rgba(28,28,30,0.08)",
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 800,
              fontSize: 22,
              color: "#1C1C1E",
              flex: 1,
            }}
          >
            My Calendar
          </div>
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            style={calModalNavBtn}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 700,
              color: "#1C1C1E",
              minWidth: 140,
              textAlign: "center",
            }}
          >
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            style={calModalNavBtn}
            aria-label="Next month"
          >
            ›
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-label="Export calendar"
              title="Export calendar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(28,28,30,0.12)",
                background: exportOpen ? "rgba(28,28,30,0.06)" : "#FFFFFF",
                color: "#1C1C1E",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "background 120ms ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 11.5V13a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13v-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Export
            </button>
            {exportOpen ? (
              <ExportPopover onClose={() => setExportOpen(false)} />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              background: "#FF5C35",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(255,92,53,0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New Event
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              ...calModalNavBtn,
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>

        {/* Body: grid + side panel */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            gap: 0,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Month grid */}
          <div
            style={{
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 6,
              }}
            >
              {CAL_DAYS.map((d, i) => (
                <div
                  key={`md-${i}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#8A8580",
                    textAlign: "center",
                    padding: "4px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                  }}
                >
                  {d}
                </div>
              ))}
              {cells.map((cell, i) => {
                const dayEntries = byDay[cell.key] ?? [];
                const isToday = cell.key === todayKey;
                const isSelected = cell.key === selected;
                const cellBorder = isSelected
                  ? "2px solid #1C1C1E"
                  : "1px solid rgba(28,28,30,0.08)";
                return (
                  <button
                    key={`mc-${i}`}
                    type="button"
                    onClick={() => setSelected(cell.key)}
                    style={{
                      minHeight: 84,
                      borderRadius: 12,
                      padding: "6px 7px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      background: cell.otherMonth ? "rgba(28,28,30,0.02)" : "#FFFFFF",
                      border: cellBorder,
                      // Compensate for selected's heavier border so cells stay aligned.
                      margin: isSelected ? "-1px" : 0,
                      opacity: cell.otherMonth ? 0.45 : 1,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      transition: "border-color 120ms ease",
                    }}
                  >
                    {isToday ? (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "#1C1C1E",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "Fraunces, serif",
                          fontSize: 13,
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                      >
                        {cell.date.getDate()}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontFamily: "Fraunces, serif",
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#1C1C1E",
                          lineHeight: 1,
                          padding: "4px 0 0 2px",
                        }}
                      >
                        {cell.date.getDate()}
                      </div>
                    )}
                    {/* Spacer pushes pills to the bottom. */}
                    <div style={{ flex: 1 }} />
                    {dayEntries.slice(0, 2).map((e) => (
                      <div
                        key={`${cell.key}-${e.id}`}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: "#fff",
                          background: e.color,
                          borderRadius: 6,
                          padding: "2px 5px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEntries.length > 2 ? (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#8A8580",
                        }}
                      >
                        +{dayEntries.length - 2} more
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side panel: selected day details OR no-selection empty state. */}
          <div
            style={{
              borderLeft: "1px solid rgba(28,28,30,0.08)",
              padding: 18,
              overflow: "auto",
              background: "#FAF7F2",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {selected === null ? (
              <>
                <div
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontWeight: 800,
                    fontSize: 18,
                    color: "#1C1C1E",
                  }}
                >
                  Events
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#8A8580",
                    marginTop: 2,
                  }}
                >
                  Click a day to see events
                </div>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    color: "#8A8580",
                    fontSize: 13,
                    textAlign: "center",
                    padding: "20px 0",
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.3 }}>
                    <rect x="3" y="6" width="30" height="27" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
                    <path d="M3 14h30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M11 3v6M25 3v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Select a day to see
                  <br />
                  or add events
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: "#8A8580",
                  }}
                >
                  {selectedDateLabel}
                </div>
                {selectedEntries.length === 0 ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#8A8580",
                      lineHeight: 1.5,
                      padding: "20px 0",
                      textAlign: "center",
                    }}
                  >
                    Nothing scheduled.
                    <br />
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      style={{
                        marginTop: 10,
                        background: "transparent",
                        border: "none",
                        color: "#FF5C35",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      + Add an event
                    </button>
                  </div>
                ) : (
                  selectedEntries.map((e) => (
                    <CalModalEventCard
                      key={`${e.kind}-${e.id}`}
                      entry={e}
                      onDeleted={onChange}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {showAdd ? (
          <AddPersonalEventForm
            defaultDate={selected ?? ymdKey(today)}
            onClose={() => setShowAdd(false)}
            onCreated={() => {
              setShowAdd(false);
              onChange();
            }}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function ExportRow({
  glyph,
  title,
  sub,
  onClick,
}: {
  glyph: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        borderRadius: 10,
        fontFamily: "inherit",
        width: "100%",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "rgba(28,28,30,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#1C1C1E",
        }}
      >
        {glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C1C1E" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#8A8580" }}>{sub}</div>
      </div>
    </button>
  );
}

function ExportPopover({ onClose }: { onClose: () => void }) {
  const trigger = (label: string) => () => {
    // All three options use the same .ics bundle — Apple Calendar, Outlook,
    // and Google Calendar's web UI all accept it on import. We expose three
    // labels so the user knows the right path on their device.
    const a = document.createElement("a");
    a.href = "/api/me/calendar/ics";
    a.download = "vibe-calendar.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
    if (label === "google") {
      // Google's import flow lives at calendar.google.com — pop it open.
      window.open(
        "https://calendar.google.com/calendar/u/0/r/settings/export",
        "_blank",
        "noopener",
      );
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 38,
        right: 0,
        zIndex: 20,
        width: 280,
        background: "#FFFFFF",
        border: "1px solid rgba(28,28,30,0.08)",
        borderRadius: 14,
        boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
        padding: 8,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#8A8580",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          padding: "6px 12px 4px",
        }}
      >
        Export to
      </div>
      <ExportRow
        glyph={
          <svg width="16" height="20" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-56.5.9-116.6 44.2-116.6 132.3 0 26 4.8 52.9 14.3 80.6 12.7 36.5 58.6 126.2 106.5 124.8 25-.6 42.7-17.7 75.2-17.7 31.6 0 47.9 17.7 75.8 17.7 48.3-.7 89.8-82.2 101.9-118.8-64.7-30.6-57.5-89.7-57.5-91.5zM246.1 65.3c30.5-36.2 27.7-69.2 26.8-81.3-26.9 1.6-58 18.4-75.7 39-19.5 22.1-31 49.4-28.5 81 29.2 2.2 55.8-12.8 77.4-38.7z" />
          </svg>
        }
        title="Apple Calendar"
        sub="Open the file with Calendar.app"
        onClick={trigger("apple")}
      />
      <ExportRow
        glyph={
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="4" width="18" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 8h18" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <text x="12" y="17" fontSize="7" fontWeight="700" textAnchor="middle" fill="currentColor">G</text>
          </svg>
        }
        title="Google Calendar"
        sub="Opens import settings + downloads .ics"
        onClick={trigger("google")}
      />
      <ExportRow
        glyph={
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 9l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Outlook"
        sub="Import the file in Outlook"
        onClick={trigger("outlook")}
      />
    </div>
  );
}

function CalModalEventCard({
  entry,
  onDeleted,
}: {
  entry: CalEntry;
  onDeleted: () => void;
}) {
  const start = new Date(entry.starts_at);
  const time = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: start.getMinutes() ? "2-digit" : undefined,
  });
  const isPersonal = entry.kind === "personal";
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!isPersonal || busy) return;
    if (!confirm(`Delete "${entry.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/personal-events/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDeleted();
    } catch (e) {
      console.error("[calendar] delete personal", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(28,28,30,0.08)",
        borderLeft: `4px solid ${entry.color}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 14,
          color: "#1C1C1E",
        }}
      >
        {entry.title}
      </div>
      <div style={{ fontSize: 11, color: "#8A8580", fontWeight: 600 }}>
        {time}
        {entry.location ? ` · ${entry.location}` : ""}
      </div>
      {entry.kind === "rsvp" && entry.org ? (
        <div style={{ fontSize: 11, color: "#8A8580" }}>
          {entry.org.name}
        </div>
      ) : null}
      {entry.kind === "personal" && entry.notes ? (
        <div
          style={{
            fontSize: 12,
            color: "#1C1C1E",
            opacity: 0.7,
            marginTop: 2,
            whiteSpace: "pre-wrap",
            lineHeight: 1.4,
          }}
        >
          {entry.notes}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {entry.kind === "rsvp" ? (
          <a
            href={`/api/events/${entry.id}/ics`}
            download
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#FF5C35",
              textDecoration: "none",
            }}
          >
            Add to calendar app
          </a>
        ) : null}
        {isPersonal ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "#C42B1C",
              fontSize: 11,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AddPersonalEventForm({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState("#FF5C35");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!date || !time) {
      setError("Pick a date and time.");
      return;
    }
    setBusy(true);
    try {
      const startsAt = new Date(`${date}T${time}:00`).toISOString();
      const res = await fetch("/api/me/personal-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          starts_at: startsAt,
          location: location.trim(),
          notes: notes.trim(),
          color,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save event");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.22)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#FFFFFF",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 32px 96px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 18,
            color: "#1C1C1E",
          }}
        >
          New event
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder="What is it?"
          style={addEventInput}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={addEventInput}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={addEventInput}
          />
        </div>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value.slice(0, 200))}
          placeholder="Where? (optional)"
          style={addEventInput}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
          placeholder="Notes (optional)"
          rows={3}
          style={{ ...addEventInput, resize: "vertical", minHeight: 64 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#8A8580",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Color
          </span>
          {EVENT_COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Pick ${c}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: c,
                border:
                  color === c
                    ? "2px solid #1C1C1E"
                    : "2px solid rgba(28,28,30,0.15)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
        {error ? (
          <div
            style={{
              fontSize: 12,
              color: "#C42B1C",
              background: "rgba(196,43,28,0.08)",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.12)",
              background: "transparent",
              color: "#1C1C1E",
              fontWeight: 600,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background:
                title.trim() && !busy ? "#FF5C35" : "rgba(28,28,30,0.18)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: busy || !title.trim() ? "default" : "pointer",
              boxShadow:
                title.trim() && !busy
                  ? "0 4px 14px rgba(255,92,53,0.3)"
                  : "none",
            }}
          >
            {busy ? "Saving…" : "Save event"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const EVENT_COLOR_PRESETS = ["#FF5C35", "#5BD18C", "#5A9CFF", "#9B7BFF", "#FFB85A", "#1C1C1E"];

const addEventInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(28,28,30,0.14)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  color: "#1C1C1E",
  background: "#fff",
  boxSizing: "border-box",
};

const calNavBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "#8A8580",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  flexShrink: 0,
  fontFamily: "DM Sans, sans-serif",
};

const calModalNavBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "rgba(28,28,30,0.04)",
  border: "none",
  cursor: "pointer",
  color: "#1C1C1E",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
  fontFamily: "DM Sans, sans-serif",
};

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
