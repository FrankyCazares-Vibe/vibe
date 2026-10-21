"use client";

import { useSearchParams } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ClubTab = "posts" | "events" | "board";

const TABS: ReadonlyArray<{ id: ClubTab; label: string }> = [
  { id: "posts", label: "Posts" },
  { id: "events", label: "Events" },
  { id: "board", label: "Board" },
];

/**
 * The tab the address asks for (the club's view, wave 2, C9):
 * `?tab=posts|events|board`, and `?event=<id>` (a calendar link; Oct 19,
 * 2026, critique D13) always means Events, or the card it scrolls to would
 * be hidden. Anything else opens on Posts.
 */
export function tabFromAddress(tab: string | null, event: string | null): ClubTab {
  if (event) return "events";
  return tab === "events" || tab === "board" ? tab : "posts";
}

/**
 * The club page's tabs, Posts | Events | Board, on phone and desktop alike
 * (underline style; globals.css `.vibe-club-tab`). The panels are handed in
 * as ReactNodes so the server page renders them with its full data context;
 * this shell owns only which one shows.
 *
 * Every panel stays mounted and the others are `hidden`, at every width: the
 * Events tab's two lists both answer a `?event=` link (linked-event.tsx),
 * and a switch back keeps a list where the student left it. The address
 * picks the first tab; a later move to `?tab=…` on the same page (Club
 * tools' "Past events and who came") switches it too.
 *
 * "Report this club" lived in the old About column; it is in More about us
 * now (club-page/MoreAboutUs.tsx), with the same rules.
 */
export function OrgContent({
  posts,
  events,
  board,
}: {
  posts: ReactNode;
  events: ReactNode;
  board: ReactNode;
}) {
  const params = useSearchParams();
  const wanted = tabFromAddress(params.get("tab"), params.get("event"));
  const [seen, setSeen] = useState<ClubTab>(wanted);
  const [tab, setTab] = useState<ClubTab>(wanted);
  if (wanted !== seen) {
    setSeen(wanted);
    setTab(wanted);
  }
  const baseId = useId();
  const tabRefs = useRef<Partial<Record<ClubTab, HTMLButtonElement | null>>>({});

  // Arrow keys move along the tabs (WAI-ARIA tabs, automatic activation).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    let to = -1;
    if (e.key === "ArrowRight") to = (at + 1) % TABS.length;
    else if (e.key === "ArrowLeft") to = (at - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = TABS.length - 1;
    if (to < 0) return;
    e.preventDefault();
    const next = TABS[to].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const panels: Record<ClubTab, ReactNode> = { posts, events, board };
  return (
    <div className="vibe-org-content" data-tab={tab}>
      <div role="tablist" aria-label="Club page" className="vibe-club-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-${t.id}-tab`}
            aria-selected={tab === t.id}
            aria-controls={`${baseId}-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="vibe-club-tab"
            onClick={() => setTab(t.id)}
            onKeyDown={onKeyDown}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${baseId}-${t.id}`}
          aria-labelledby={`${baseId}-${t.id}-tab`}
          hidden={tab !== t.id}
          className="vibe-club-panel"
          // `display` follows `hidden` too, so an inline flex never shows a
          // panel the attribute hides.
          style={{
            marginTop: 16,
            display: tab === t.id ? "flex" : "none",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
