"use client";

import { useState, useSyncExternalStore } from "react";

import { ReportSheet } from "@/components/safety/ReportSheet";

/**
 * This page's own phone breakpoint — the width at which globals.css swaps the
 * 2-column grid for the tab strip above (`@media (max-width: 720px)`). The
 * report shell is picked off the same number, so the centered desktop dialog
 * never opens on a screen that is already showing the phone layout. NOT
 * `useIsMobile` (899px): 180px of viewport between the two would give a
 * bottom sheet on a page still in its desktop grid.
 */
const PHONE_QUERY = "(max-width: 720px)";

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isPhoneNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(PHONE_QUERY).matches;
}

/** Server always renders the desktop shell; the client reads the real
 *  viewport on the first paint after hydration. */
function serverSnapshot(): boolean {
  return false;
}

/**
 * Wraps the org profile's main 2-column content grid.
 *
 * Desktop  → renders both columns side-by-side (2fr / 1fr) — same as
 *            the original inline grid.
 * Mobile   → renders a 2-pill tab strip (Posts / About) above the
 *            grid. Active tab drives `data-tab` on the grid;
 *            globals.css hides the inactive column via attribute
 *            selector. Same DOM on both viewports, no remounting
 *            scroll position when switching.
 *
 * The two columns are passed in as ReactNode props so the server
 * page can render them with its full data context — this client
 * shell just owns the tab state.
 *
 * `reportable` is the one exception: the club's id and whether the viewer owns
 * it, so the About column can end with a quiet "Report this club". It is
 * OPTIONAL and defaults to nothing, because both live in the server page
 * (src/app/orgs/[handle]/page.tsx) and this shell is handed ReactNodes only.
 * Without it the row is simply absent — no half-wired button that files a
 * report against an id nobody passed.
 */
export function OrgContent({
  mainColumn,
  eventsColumn,
  aboutColumn,
  reportable,
}: {
  mainColumn: React.ReactNode;
  eventsColumn: React.ReactNode;
  aboutColumn: React.ReactNode;
  /** The club being viewed, and whether this viewer runs it. Omit and no
   *  Report row shows; `viewerIsOwner` hides it from the club's own officers,
   *  who would otherwise get the route's 400 "You can't report something of
   *  your own" — every other surface in the app keeps Report off your own
   *  things rather than letting the route refuse it. */
  reportable?: { id: string; viewerIsOwner?: boolean } | null;
}) {
  const [tab, setTab] = useState<"posts" | "events" | "about">("posts");
  const [reportOpen, setReportOpen] = useState(false);
  const phone = useSyncExternalStore(subscribePhone, isPhoneNow, serverSnapshot);
  const canReport = !!reportable && !reportable.viewerIsOwner;

  return (
    <div className="vibe-org-content" data-tab={tab}>
      {/* Tab strip — display:none on desktop via globals.css. */}
      <div
        className="vibe-org-tabbar"
        style={{
          display: "none",
          gap: 6,
          marginTop: 18,
        }}
      >
        <OrgTabPill
          label="Posts"
          active={tab === "posts"}
          onClick={() => setTab("posts")}
        />
        <OrgTabPill
          label="Events"
          active={tab === "events"}
          onClick={() => setTab("events")}
        />
        <OrgTabPill
          label="About"
          active={tab === "about"}
          onClick={() => setTab("about")}
        />
      </div>

      {/* Events row — desktop renders it full-width above the 2-col
          grid. Mobile shows it only when the Events tab is active
          (via attribute selector on the parent). */}
      <div
        className="vibe-org-events-row"
        style={{ marginTop: 24 }}
      >
        {eventsColumn}
      </div>

      <div
        className="vibe-org-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 24,
          marginTop: 24,
        }}
      >
        <div
          className="vibe-org-main"
          style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}
        >
          {mainColumn}
        </div>

        <aside
          className="vibe-org-about"
          style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}
        >
          {aboutColumn}
          {canReport ? (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{
                alignSelf: "flex-start",
                padding: "8px 0",
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.55)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "underline",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Report this club
            </button>
          ) : null}
        </aside>
      </div>

      {reportOpen && canReport && reportable ? (
        // A club has no person behind it to block, so the sheet offers none.
        // Bottom sheet on the phone, centered dialog on the desktop grid —
        // the same split this component already makes for its own layout.
        <ReportSheet
          variant={phone ? "sheet" : "modal"}
          target={{ type: "org", id: reportable.id, noun: "club" }}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </div>
  );
}

function OrgTabPill({
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
          ? "1px solid rgba(255,255,255,0.32)"
          : "1px solid rgba(255,255,255,0.10)",
        background: active ? "rgba(255,255,255,0.16)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.65)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.02em",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
