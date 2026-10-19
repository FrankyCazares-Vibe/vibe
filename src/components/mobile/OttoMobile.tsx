"use client";

import { useAnimate } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  ActivityRow,
  AskingRow,
  OttoPayload,
  OttoSettings as OttoSettingsT,
  UpcomingRow,
} from "@/app/api/me/otto/route";
import { OttoActivity } from "@/components/otto/OttoActivity";
import { useTabScrollMemory } from "@/components/mobile/use-tab-scroll-memory";
import { OttoMetrics } from "@/components/otto/OttoMetrics";
import { OttoRequests } from "@/components/otto/OttoRequests";
import { OttoSettings } from "@/components/otto/OttoSettings";
import { OttoTellInput } from "@/components/otto/OttoTellInput";
import { OttoUpcoming } from "@/components/otto/OttoUpcoming";
import { PushAsk } from "@/components/push/PushAsk";
import { OttoOrb } from "@/components/the-map/OttoOrb";
import { vibeRequest } from "@/lib/feedback/request";
import { SPRING_SNAPPY } from "@/lib/motion/springs";
import { followFailureLine, personName } from "@/lib/people/follow-label";

type Tab = "today" | "stats";
const TAB_ORDER: Tab[] = ["today", "stats"];

/** Puts a row the student cleared back at `index`, unless it's already back. */
function restoreAt<T>(list: T[], row: T, index: number): T[] {
  if (list.includes(row)) return list;
  const next = list.slice();
  next.splice(Math.min(index, next.length), 0, row);
  return next;
}

/**
 * iOS-native rebuild of /otto for mobile. Compact hero + swipeable
 * Today / Stats tabs. Reuses the existing OttoActivity / OttoUpcoming /
 * OttoRequests / OttoTellInput / OttoSettings / OttoMetrics components
 * inside the panes — they're all single-column-friendly already.
 *
 * State logic mirrors OttoPageClient: optimistic mutations (a row the
 * server refuses to clear goes back where it was, with a toast), hero
 * counts derive from local state, ?tab=stats URL deep-link respected.
 */
export function OttoMobile({ initial }: { initial: OttoPayload }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "stats" ? "stats" : "today",
  );

  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  // Each tab keeps its own place under the one page scroll (Oct 18, 2026).
  useTabScrollMemory(tab, "/otto");

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

  // The sections /api/me/otto couldn't read. Each says so in its own place
  // instead of showing its empty copy, and the chip above it shows "—"
  // rather than a 0 that would read as a real count. A payload from before
  // the field existed carries nothing, which reads as "nothing failed".
  const failed = initial.failed ?? [];
  const activityFailed = failed.includes("activity");
  const upcomingFailed = failed.includes("upcoming");
  const askingFailed = failed.includes("asking");
  // The unread-DM read is its own section server-side — it fails without
  // taking followers or reminders with it — but its row sits in "Asking for
  // you", so that list is incomplete either way.
  const dmsFailed = failed.includes("dms");

  const reminderCount =
    upcoming.filter((u) => u.kind === "reminder").length +
    asking.filter((r) => r.kind === "reminder").length;
  const unreadDmRow = asking.find((r) => r.kind === "unread_dms");
  const unreadCount = unreadDmRow?.kind === "unread_dms" ? unreadDmRow.count : 0;

  // Done / Dismiss / Pass clear the reminder straight away. If the server
  // refuses, it goes back where it was (snapshot from this render, never a
  // refetch) and vibeRequest's toast says why.
  const clearReminder = useCallback(
    async (
      id: string,
      url: string,
      method: "POST" | "DELETE",
      failure: string,
    ) => {
      const isIt = (r: UpcomingRow | AskingRow) =>
        r.kind === "reminder" && r.id === id;
      const upIndex = upcoming.findIndex(isIt);
      const askIndex = asking.findIndex(isIt);
      const upRow = upIndex >= 0 ? upcoming[upIndex] : null;
      const askRow = askIndex >= 0 ? asking[askIndex] : null;
      setUpcoming((u) => u.filter((r) => !isIt(r)));
      setAsking((a) => a.filter((r) => !isIt(r)));
      const res = await vibeRequest(url, { method, failure });
      if (res.ok) return;
      if (upRow) setUpcoming((u) => restoreAt(u, upRow, upIndex));
      if (askRow) setAsking((a) => restoreAt(a, askRow, askIndex));
    },
    [upcoming, asking],
  );

  const dismissReminder = useCallback(
    (id: string) =>
      clearReminder(
        id,
        `/api/me/otto/reminders/${id}`,
        "DELETE",
        "Couldn't dismiss that reminder.",
      ),
    [clearReminder],
  );

  const actReminder = useCallback(
    (id: string) =>
      clearReminder(
        id,
        `/api/me/otto/reminders/${id}/act`,
        "POST",
        "Couldn't mark that reminder done.",
      ),
    [clearReminder],
  );

  // Follow back clears the row straight away; a refused follow (a block,
  // the rate limit) puts it back where it was so it can be tapped again.
  const followBack = useCallback(
    async (userId: string) => {
      const isIt = (r: AskingRow) =>
        r.kind === "follower" && r.user_id === userId;
      const index = asking.findIndex(isIt);
      const row = index >= 0 ? asking[index] : null;
      setAsking((a) => a.filter((r) => !isIt(r)));
      const res = await vibeRequest("/api/me/follow", {
        method: "POST",
        json: { target_id: userId },
        failure: followFailureLine("follow", row?.kind === "follower" ? personName(row) : null),
      });
      if (!res.ok && row) setAsking((a) => restoreAt(a, row, index));
    },
    [asking],
  );

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
          <CountChip
            label="nudges"
            value={activityFailed ? null : initial.counts.nudges}
          />
          <CountChip
            label="reminders"
            value={upcomingFailed || askingFailed ? null : reminderCount}
          />
          <CountChip
            label="unread"
            value={askingFailed || dmsFailed ? null : unreadCount}
          />
        </div>
      </header>

      {/* Tab strip — Today / Stats */}
      <TabStrip active={tab} onChange={setActiveTab} />

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
          <PushAsk placement="otto" />
          <OttoActivity rows={activity} failed={activityFailed} />
          <OttoUpcoming
            rows={upcoming}
            onDismissReminder={dismissReminder}
            onActReminder={actReminder}
            failed={upcomingFailed}
          />
          <OttoRequests
            rows={asking}
            onFollowBack={followBack}
            onPassFollower={passFollower}
            onDismissReminder={dismissReminder}
            onActReminder={actReminder}
            failed={askingFailed || dmsFailed}
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

const TAB_LABEL: Record<Tab, string> = { today: "Today", stats: "Stats" };

function TabStrip({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  // The glass pill slides to the new tab (motion pass, Oct 18 2026), the
  // same way as the campus strip (CampusMobile TabStrip): it lives in the
  // active button and, when that changes, starts from the old button's box
  // (x + scaleX, SPRING_SNAPPY) and settles into its own. By hand rather
  // than Motion's layoutId, so every phone strip moves alike and a tab
  // change that also moves the page (useTabScrollMemory) can't throw it.
  // useAnimate follows reduce motion (the pill just appears).
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const buttonsRef = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const shownRef = useRef(active);
  useLayoutEffect(() => {
    const from = buttonsRef.current[shownRef.current];
    const to = buttonsRef.current[active];
    shownRef.current = active;
    const pill = pillRef.current;
    if (!from || !to || from === to || !pill || !to.offsetWidth) return;
    animate(
      pill,
      { x: [from.offsetLeft - to.offsetLeft, 0], scaleX: [from.offsetWidth / to.offsetWidth, 1] },
      SPRING_SNAPPY,
    );
  }, [active, animate]);

  return (
    <div
      ref={scope}
      style={{
        display: "flex",
        gap: 6,
        padding: "6px 18px 10px",
        justifyContent: "center",
        // Keeps the z-order below inside the strip.
        isolation: "isolate",
      }}
    >
      {TAB_ORDER.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            ref={(el) => {
              buttonsRef.current[t] = el;
            }}
            type="button"
            onClick={() => onChange(t)}
            className="vibe-press"
            style={{
              position: "relative",
              // The open tab sits over the other, so its pill slides over
              // that one's ring; the words (zIndex 2) stay on top.
              zIndex: isActive ? 1 : undefined,
              padding: "8px 18px",
              borderRadius: 999,
              // The open tab's ring and glass are the pill below.
              border: isActive
                ? "1px solid transparent"
                : "1px solid rgba(255,255,255,0.08)",
              background: "transparent",
              color: isActive ? "#fff" : "rgba(255,255,255,0.62)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {isActive ? (
              <span
                ref={pillRef}
                aria-hidden
                style={{
                  position: "absolute",
                  inset: -1,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.14)",
                  boxSizing: "border-box",
                  transformOrigin: "0 50%",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <span style={{ position: "relative", zIndex: 2 }}>{TAB_LABEL[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** `null` when the section behind the count didn't load — "—", not a 0. */
function CountChip({ label, value }: { label: string; value: number | null }) {
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
        {value ?? "—"}
      </span>
      {label}
    </span>
  );
}
