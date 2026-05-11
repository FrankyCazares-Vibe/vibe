"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import type {
  ActivityRow,
  AskingRow,
  OttoPayload,
  OttoSettings as OttoSettingsT,
  UpcomingRow,
} from "@/app/api/me/otto/route";

import { OttoActivity } from "./OttoActivity";
import { OttoHero } from "./OttoHero";
import { OttoMetrics } from "./OttoMetrics";
import { OttoRequests } from "./OttoRequests";
import { OttoSettings } from "./OttoSettings";
import { OttoTellInput } from "./OttoTellInput";
import { OttoUpcoming } from "./OttoUpcoming";

type Props = { initial: OttoPayload };

type Tab = "today" | "stats";

/**
 * Owns the live state for Otto's Room. Every mutation runs optimistically —
 * the user sees instant feedback and we reconcile only if the server fails.
 *
 * Two tabs share the hero: "Today" (activity + upcoming + asking + tell-otto
 * + settings) and "Stats" (the metrics block). Tab state is URL-backed via
 * ?tab=stats so the side panel's "full breakdown →" link can deep-link
 * straight to the right view.
 *
 * Counts (the hero stats line) recompute purely from local state so they
 * stay honest after dismissals + creates without a re-fetch.
 */
export function OttoPageClient({ initial }: Props) {
  // Tab state seeded from URL ?tab=stats so the side panel's deep-link works.
  // After mount, the tab state is owned by local React; we update the URL via
  // history.replaceState on click (no Next router round-trip, no back-button
  // accumulation). Back/forward across tab toggles isn't a flow we care about.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "stats" ? "stats" : "today",
  );

  const setActiveTab = useCallback((next: Tab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "today") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* SSR / non-browser env — ignore. */
    }
  }, []);

  const [activity] = useState<ActivityRow[]>(initial.activity);
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>(initial.upcoming);
  const [asking, setAsking] = useState<AskingRow[]>(initial.asking);
  const [settings] = useState<OttoSettingsT>(initial.settings);

  // Hero counts: nudges = unread notifications still in the feed; reminders =
  // every active reminder (dated upcoming + undated asking); unread = DMs
  // (this one isn't currently re-derived after dismissal — that would need
  // peeking into asking for the unread_dms row).
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
      console.error("[otto] dismissReminder", e);
    }
  }, []);

  const actReminder = useCallback(async (id: string) => {
    setUpcoming((u) => u.filter((r) => !(r.kind === "reminder" && r.id === id)));
    setAsking((a) => a.filter((r) => !(r.kind === "reminder" && r.id === id)));
    try {
      await fetch(`/api/me/otto/reminders/${id}/act`, { method: "POST" });
    } catch (e) {
      console.error("[otto] actReminder", e);
    }
  }, []);

  const followBack = useCallback(async (userId: string) => {
    setAsking((a) => a.filter((r) => !(r.kind === "follower" && r.user_id === userId)));
    try {
      await fetch("/api/me/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: userId }),
      });
    } catch (e) {
      console.error("[otto] followBack", e);
    }
  }, []);

  const passFollower = useCallback((userId: string) => {
    // "Pass" is local-only at v1 — we drop the row from this session's
    // asking list, but the underlying follower row stays put. A future pass
    // can persist a pass-list table or surface it differently.
    setAsking((a) => a.filter((r) => !(r.kind === "follower" && r.user_id === userId)));
  }, []);

  const handleCreated = useCallback(
    (reminder: { id: string; title: string; body: string | null; remind_at: string | null; created_at: string }) => {
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

  return (
    <div className="otto-room">
      <div className="otto-room-stars" aria-hidden />
      <main className="otto-room-main">
        <OttoHero
          counts={{
            nudges: initial.counts.nudges,
            reminders: reminderCount,
            unread: unreadCount,
          }}
        />

        <nav className="otto-room-tabs" role="tablist" aria-label="Otto's Room">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "today"}
            className={`otto-room-tab ${tab === "today" ? "is-active" : ""}`}
            onClick={() => setActiveTab("today")}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "stats"}
            className={`otto-room-tab ${tab === "stats" ? "is-active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            Stats
          </button>
        </nav>

        {tab === "today" ? (
          <>
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
          </>
        ) : (
          <OttoMetrics />
        )}
      </main>
    </div>
  );
}
