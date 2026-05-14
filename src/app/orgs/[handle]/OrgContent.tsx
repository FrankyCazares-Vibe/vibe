"use client";

import { useState } from "react";

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
 */
export function OrgContent({
  mainColumn,
  aboutColumn,
}: {
  mainColumn: React.ReactNode;
  aboutColumn: React.ReactNode;
}) {
  const [tab, setTab] = useState<"posts" | "about">("posts");

  return (
    <>
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
          label="About"
          active={tab === "about"}
          onClick={() => setTab("about")}
        />
      </div>

      <div
        className="vibe-org-grid"
        data-tab={tab}
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
        </aside>
      </div>
    </>
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
