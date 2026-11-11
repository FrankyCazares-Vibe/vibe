"use client";

import "./kit/sky.css";
import "./kit/desk.css";
import "./otto-desk-computer.css";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { OttoPayload } from "@/app/api/me/otto/route";
import { DESK_AS_KEY } from "@/components/mobile/use-otto-desk";
import { useSwitchedClub } from "@/lib/orgs/club-switch";
import { panelClubParam } from "@/lib/otto/panel-desk";

import { OttoSky } from "./desk/OttoSky";
import { OttoDeskActingAs } from "./OttoDeskActingAs";
import { OttoDeskAsk } from "./OttoDeskAsk";
import { OttoDeskColumns } from "./OttoDeskColumns";
import { OttoMetrics } from "./OttoMetrics";
import { OttoPageLegacy } from "./OttoPageLegacy";
import { OttoSettings } from "./OttoSettings";
import { useOttoDesk } from "./use-otto-desk";

/**
 * `/otto` on a computer: Otto's desk (Wave 2A, Nov 10, 2026; board D3).
 * A band of his sky with soft hills on top, then paper in three columns:
 * Ready for you | Scheduled + Otto saw | Done this week + Earlier, the
 * reminder box under the first two, and "Acting as" for people who run a
 * club. Nothing dims the page. Tabs Desk | Stats | Settings; `?tab=stats`
 * still opens Stats (the side panel links to it) and `?club=` keeps the club.
 *
 * `desk={false}` (OTTO_DESK=off, src/lib/otto/desk-flag.ts) draws today's
 * page unchanged (OttoPageLegacy.tsx).
 */

type Props = { initial: OttoPayload; desk?: boolean };
type Tab = "desk" | "stats" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "desk", label: "Desk" },
  { id: "stats", label: "Stats" },
  { id: "settings", label: "Settings" },
];

const tabId = (t: Tab) => `odc-tab-${t}`;
const panelId = (t: Tab) => `odc-panel-${t}`;

/** The desk's saved pick on this device, guarded (blocked storage reads as none). */
function readDeskAs(): string | null {
  try {
    return window.localStorage.getItem(DESK_AS_KEY);
  } catch {
    return null;
  }
}

function tabOf(raw: string | null): Tab {
  return raw === "stats" || raw === "settings" ? raw : "desk";
}

export function OttoPageClient({ initial, desk: deskOn = true }: Props) {
  if (!deskOn) return <OttoPageLegacy initial={initial} />;
  return <OttoDeskPage initial={initial} />;
}

function OttoDeskPage({ initial }: { initial: OttoPayload }) {
  const searchParams = useSearchParams();
  const urlClub = searchParams.get("club");
  const [tab, setTab] = useState<Tab>(tabOf(searchParams.get("tab")));
  const d = useOttoDesk(initial, urlClub);
  const { desk, load } = d;

  const setActiveTab = useCallback((next: Tab) => {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "desk") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* no window */
    }
  }, []);

  // The tabs pattern: one Tab stop, arrows and Home/End move between tabs.
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const onTabKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const i = TABS.findIndex((t) => t.id === tab);
      const to =
        e.key === "ArrowRight" ? (i + 1) % TABS.length
        : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
        : e.key === "Home" ? 0
        : e.key === "End" ? TABS.length - 1
        : -1;
      if (to < 0) return;
      e.preventDefault();
      const next = TABS[to].id;
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    },
    [tab, setActiveTab],
  );

  // No `?club=` in the link: the desk's own pick on this device (DESK_AS_KEY,
  // the phone's and the side panel's too), else the club this browser last
  // switched to (club-switch.ts), when it is "me" or a club you run. The side
  // panel reads the same order (panelClubParam), so the two agree.
  const switched = useSwitchedClub();
  const triedSwitch = useRef(false);
  useEffect(() => {
    if (triedSwitch.current || urlClub || !desk) return;
    const runs = (h: string | null) => !!h && desk.clubs.some((c) => c.handle.toLowerCase() === h);
    const saved = panelClubParam(readDeskAs(), null);
    const want = saved === "me" || runs(saved) ? saved : null;
    if (!want && !switched) return;
    triedSwitch.current = true;
    const target = want ?? switched!.handle.toLowerCase();
    if (target === "me") {
      if (desk.actingAs) void load("me");
      return;
    }
    if (runs(target) && desk.actingAs?.handle.toLowerCase() !== target) void load(target);
  }, [switched, urlClub, desk, load]);

  return (
    <div className="odc-page">
      <main className="odc-main" aria-busy={d.loading || undefined}>
        <h1 className="odc-sr">Otto</h1>
        <OttoSky
          variant="band"
          say={desk ? desk.say : "couldn't load your desk. try again in a sec."}
        />
        <div className="odc-bar">
          <div className="odc-tabs" role="tablist" aria-label="Otto">
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                id={tabId(t.id)}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={panelId(t.id)}
                tabIndex={tab === t.id ? 0 : -1}
                className={tab === t.id ? "odc-tab on" : "odc-tab"}
                onClick={() => setActiveTab(t.id)}
                onKeyDown={onTabKey}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Stats counts the acting club's posts too, so the switch stays there. */}
          {desk && tab !== "settings" ? (
            <OttoDeskActingAs desk={desk} busy={d.loading} onPick={(c) => void d.pickClub(c)} />
          ) : null}
        </div>

        <div id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)}>
        {tab === "stats" ? (
          <div className="odc-wide">
            <OttoMetrics club={desk?.actingAs ?? null} />
          </div>
        ) : tab === "settings" ? (
          <div className="odc-wide">
            <OttoSettings settings={initial.settings} />
          </div>
        ) : desk ? (
          <OttoDeskColumns
            desk={desk}
            failed={d.failed}
            busyId={d.busyId}
            onAccept={(item) => void d.accept(item)}
            onReminderDone={(item) => void d.reminderDone(item)}
            ask={<OttoDeskAsk className="odc-ask" onSaved={d.reminderSaved} />}
          />
        ) : (
          <div className="tx-host dk-card dk-fail odc-fail" role="alert">
            <i className="tx tx-paper" aria-hidden="true" />
            <p>
              <b>Your desk didn&rsquo;t load.</b> Everything on it is still where it was.
            </p>
            <div className="dk-fail-go">
              <button type="button" className="dk-btn" disabled={d.loading} onClick={() => void d.reload()}>
                Try again
              </button>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
