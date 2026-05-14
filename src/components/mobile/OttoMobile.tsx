"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ActivityRow,
  AskingRow,
  OttoPayload,
  OttoSettings as OttoSettingsT,
  UpcomingRow,
} from "@/app/api/me/otto/route";
import { OttoActivity } from "@/components/otto/OttoActivity";
import { OttoMetrics } from "@/components/otto/OttoMetrics";
import { OttoRequests } from "@/components/otto/OttoRequests";
import { OttoSettings } from "@/components/otto/OttoSettings";
import { OttoTellInput } from "@/components/otto/OttoTellInput";
import { OttoUpcoming } from "@/components/otto/OttoUpcoming";
import { OttoOrb } from "@/components/the-map/OttoOrb";

type Tab = "today" | "stats";
const TAB_ORDER: Tab[] = ["today", "stats"];

/**
 * iOS-native rebuild of /otto for mobile. Compact hero + swipeable
 * Today / Stats tabs. Reuses the existing OttoActivity / OttoUpcoming /
 * OttoRequests / OttoTellInput / OttoSettings / OttoMetrics components
 * inside the panes — they're all single-column-friendly already.
 *
 * State logic mirrors OttoPageClient: optimistic mutations, hero
 * counts derive from local state, ?tab=stats URL deep-link respected.
 */
export function OttoMobile({ initial }: { initial: OttoPayload }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "stats" ? "stats" : "today",
  );

  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  const setActiveTab = useCallback((next: Tab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "today") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* SSR / non-browser env */
    }
  }, []);

  const [activity] = useState<ActivityRow[]>(initial.activity);
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>(initial.upcoming);
  const [asking, setAsking] = useState<AskingRow[]>(initial.asking);
  const [settings] = useState<OttoSettingsT>(initial.settings);

  const reminderCount =
    upcoming.filter((u) => u.kind === "reminder").length +
    asking.filter((r) => r.kind === "reminder").length;
  const unreadDmRow = asking.find((r) => r.kind === "unread_dms");
  const unreadCount = unreadDmRow?.kind === "unread_dms" ? unreadDmRow.count : 0;

  const dismissReminder = useCallback(async (id: string) => {
    setUpcoming((u) => u.filter((r) => !(r.kind === "reminder" && r.id === id)));
    setAsking((a) => a.filter((r) => !(r.kind === "reminder" && r.id === id)));
    try {
      await fetch(`/api/me/otto/reminders/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("[otto-mobile] dismissReminder", e);
    }
  }, []);

  const actReminder = useCallback(async (id: string) => {
    setUpcoming((u) => u.filter((r) => !(r.kind === "reminder" && r.id === id)));
    setAsking((a) => a.filter((r) => !(r.kind === "reminder" && r.id === id)));
    try {
      await fetch(`/api/me/otto/reminders/${id}/act`, { method: "POST" });
    } catch (e) {
      console.error("[otto-mobile] actReminder", e);
    }
  }, []);

  const followBack = useCallback(async (userId: string) => {
    setAsking((a) =>
      a.filter((r) => !(r.kind === "follower" && r.user_id === userId)),
    );
    try {
      await fetch("/api/me/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: userId }),
      });
    } catch (e) {
      console.error("[otto-mobile] followBack", e);
    }
  }, []);

  const passFollower = useCallback((userId: string) => {
    setAsking((a) =>
      a.filter((r) => !(r.kind === "follower" && r.user_id === userId)),
    );
  }, []);

  const handleCreated = useCallback(
    (reminder: {
      id: string;
      title: string;
      body: string | null;
      remind_at: string | null;
      created_at: string;
    }) => {
      if (reminder.remind_at) {
        setUpcoming((u) =>
          [
            ...u,
            {
              kind: "reminder" as const,
              id: reminder.id,
              title: reminder.title,
              body: reminder.body,
              remind_at: reminder.remind_at!,
            },
          ].sort((a, b) => {
            const at = a.kind === "event" ? a.starts_at : a.remind_at;
            const bt = b.kind === "event" ? b.starts_at : b.remind_at;
            return at.localeCompare(bt);
          }),
        );
      } else {
        setAsking((a) => [
          {
            kind: "reminder" as const,
            id: reminder.id,
            title: reminder.title,
            body: reminder.body,
            created_at: reminder.created_at,
          },
          ...a,
        ]);
      }
    },
    [],
  );

  // Programmatic scroll to the active tab pane when tab changes.
  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (idx < 0) return;
    const target = el.clientWidth * idx;
    if (Math.abs(el.scrollLeft - target) < 4) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTo({ left: target, behavior: "smooth" });
    const t = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 420);
    return () => window.clearTimeout(t);
  }, [tab]);

  return (
    <main
      style={{
        background:
          "radial-gradient(140% 90% at 50% 0%, rgba(255,92,53,0.20) 0%, rgba(255,92,53,0) 55%), " +
          "radial-gradient(120% 80% at 100% 100%, rgba(198,160,255,0.20) 0%, rgba(198,160,255,0) 60%), " +
          "linear-gradient(180deg, #1A1A1F 0%, #0E0E13 100%)",
        minHeight: "100dvh",
        color: "#fff",
      }}
    >
      {/* Compact hero — orb + name + tagline + counts pill row */}
      <header
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 18px) 18px 14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 84,
            height: 84,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: -14,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,92,53,0.32) 0%, rgba(255,92,53,0) 70%)",
              filter: "blur(8px)",
            }}
          />
          <OttoOrb size={72} />
        </div>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: "-0.8px",
            margin: 0,
            color: "#fff",
          }}
        >
          otto<span style={{ color: "#FF5C35" }}>.</span>
        </h1>
        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            color: "rgba(255,255,255,0.68)",
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          your campus compass
        </p>
        <p
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 14,
            fontStyle: "italic",
            color: "rgba(255,255,255,0.78)",
            margin: "2px 0 0",
            textAlign: "center",
          }}
        >
          &ldquo;here&rsquo;s what caught my eye.&rdquo;
        </p>

        <div
          aria-label="otto status"
          style={{
            display: "flex",
            gap: 8,
            marginTop: 6,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <CountChip label="nudges" value={initial.counts.nudges} />
          <CountChip label="reminders" value={reminderCount} />
          <CountChip label="unread" value={unreadCount} />
        </div>
      </header>

      {/* Tab strip — Today / Stats */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 18px 10px",
          justifyContent: "center",
        }}
      >
        <TabPill
          label="Today"
          active={tab === "today"}
          onClick={() => setActiveTab("today")}
        />
        <TabPill
          label="Stats"
          active={tab === "stats"}
          onClick={() => setActiveTab("stats")}
        />
      </div>

      {/* Swipeable panes */}
      <div
        ref={tabScrollRef}
        onScroll={(e) => {
          if (isProgrammaticScrollRef.current) return;
          const el = e.currentTarget;
          const w = el.clientWidth;
          if (w === 0) return;
          const idx = Math.round(el.scrollLeft / w);
          const next = TAB_ORDER[idx];
          if (next && next !== tab) setActiveTab(next);
        }}
        className="vibe-no-scrollbar"
        style={{
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          width: "100%",
        }}
      >
        <section
          aria-labelledby="otto-today-heading"
          style={paneStyle}
        >
          <h2 id="otto-today-heading" style={visuallyHidden}>
            Today
          </h2>
          <OttoActivity rows={activity} />
          <OttoUpcoming
            rows={upcoming}
            onDismissReminder={dismissReminder}
            onActReminder={actReminder}
          />
          <OttoRequests
            rows={asking}
            onFollowBack={followBack}
            onPassFollower={passFollower}
            onDismissReminder={dismissReminder}
            onActReminder={actReminder}
          />
          <OttoTellInput onCreated={handleCreated} />
          <OttoSettings settings={settings} />
        </section>
        <section aria-labelledby="otto-stats-heading" style={paneStyle}>
          <h2 id="otto-stats-heading" style={visuallyHidden}>
            Stats
          </h2>
          <OttoMetrics />
        </section>
      </div>
    </main>
  );
}

const paneStyle: React.CSSProperties = {
  flex: "0 0 100%",
  scrollSnapAlign: "start",
  padding: "4px 14px 32px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const visuallyHidden: React.CSSProperties = {
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

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 18px",
        borderRadius: 999,
        border: active
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(255,255,255,0.14)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.62)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 5,
        padding: "5px 11px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.10)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: "rgba(255,255,255,0.85)",
        letterSpacing: "0.02em",
      }}
    >
      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 14,
          color: "#fff",
        }}
      >
        {value}
      </span>
      {label}
    </span>
  );
}
