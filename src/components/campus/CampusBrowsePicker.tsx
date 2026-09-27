"use client";

import { useEffect, useId, useMemo, useRef, type CSSProperties, type JSX } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import {
  BROWSE_PICKER_FOOTER,
  BROWSE_PICKER_INTRO,
  browsePickerGroups,
  type BrowsePickerGroup,
  type BrowsePickerRow,
} from "./viewing-campus";

const FONT = "DM Sans, sans-serif";
const SERIF = "Fraunces, serif";

/**
 * The "Look around." campus picker (S67 wave 4, contracts C5, the canvas's
 * "Look around" board): every campus, both universities, grouped Shared ·
 * IU + Purdue, IU, Purdue, for BROWSING. The home campus is a different
 * thing (own university only, set in Settings; the DB trigger enforces it);
 * this sheet never changes it.
 *
 * `variant: "sheet"` is the phone's vaul bottom sheet, `"modal"` (the
 * default) the desktop's centred dialog. Tapping a row calls `onPick(id)`
 * and nothing else: the parent sets the viewed campus (home → back home) and
 * closes the sheet in the same handler. Scrim, swipe, Escape and the modal's
 * Close call `onClose` and/or `onOpenChange(false)` (pass either).
 *
 * `homeChangeAvailableAt` (ISO, when the 45-day lock lifts) puts the date on
 * the home row; `counts` (students per campus) is optional and only a 0 says
 * anything ("No students yet · still viewable"). Colours are the C0 tokens;
 * rows are ≥44px, the focus ring coral.
 */
export function CampusBrowsePicker({
  open,
  variant = "modal",
  homeId,
  viewingId = null,
  homeChangeAvailableAt = null,
  counts = null,
  onPick,
  onClose,
  onOpenChange,
}: {
  open: boolean;
  variant?: "sheet" | "modal";
  homeId: string | null;
  /** The campus on screen now, so its row can say "Viewing". */
  viewingId?: string | null;
  homeChangeAvailableAt?: string | null;
  counts?: Readonly<Record<string, number>> | null;
  onPick(campusId: string): void;
  onClose?(): void;
  /** Radix-style alternative to `onClose`: called with false on dismiss. */
  onOpenChange?(open: boolean): void;
}): JSX.Element | null {
  const close = () => {
    onClose?.();
    onOpenChange?.(false);
  };
  const groups = useMemo(
    () => browsePickerGroups({ homeId, viewingId, homeChangeAvailableAt, counts }),
    [homeId, viewingId, homeChangeAvailableAt, counts],
  );

  if (variant === "sheet") {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <Drawer.Portal>
          {/* Above the tab bar (z 9988) and the campus header, below the
              toasts (12000); the same tier as the feed's Post options sheet. */}
          <Drawer.Overlay style={OVERLAY} />
          <Drawer.Content style={SHEET} aria-describedby={undefined}>
            <Drawer.Handle style={HANDLE} />
            <div style={SHEET_SCROLL}>
              <Drawer.Title style={{ ...TITLE, paddingTop: 4 }}>
                Look around<span style={{ color: "var(--coral)" }}>.</span>
              </Drawer.Title>
              <PickerBody groups={groups} onPick={onPick} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!open) return null;
  return <PickerModal groups={groups} onPick={onPick} onClose={close} />;
}

/** Intro, the three groups, the footer: the same in both variants. */
function PickerBody({
  groups,
  onPick,
}: {
  groups: BrowsePickerGroup[];
  onPick(campusId: string): void;
}): JSX.Element {
  // Home is the viewed campus unless another row says "Viewing".
  const awayFromHome = groups.some((g) => g.rows.some((r) => r.isViewing));
  return (
    <>
      <style>{PICKER_CSS}</style>
      <p style={INTRO}>{BROWSE_PICKER_INTRO}</p>
      {groups.map((g) => {
        const full = g.rows.filter((r) => r.size === "full");
        const tiles = g.rows.filter((r) => r.size === "compact");
        return (
          <section key={g.key} aria-label={g.label} style={GROUP}>
            <h3 style={GROUP_LABEL}>{g.label}</h3>
            {full.map((r) => (
              <FullRow key={r.id} row={r} current={r.isViewing || (r.isHome && !awayFromHome)} onPick={onPick} />
            ))}
            {tiles.length > 0 ? (
              <div style={GRID}>
                {tiles.map((r) => (
                  <Tile key={r.id} row={r} current={r.isViewing || (r.isHome && !awayFromHome)} onPick={onPick} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
      <p style={FOOTER}>{BROWSE_PICKER_FOOTER}</p>
    </>
  );
}

/** "Indianapolis, Home, you can change it on Nov 9" / "View Bloomington, No students yet, still viewable". */
function rowLabel(row: BrowsePickerRow): string {
  const sub = row.sub ? `, ${row.sub.replace(/ · /g, ", ")}` : "";
  if (row.isHome) return `${row.name}${sub || ", your home campus"}`;
  if (row.isViewing) return `${row.name}, viewing now${sub}`;
  return `View ${row.name}${sub}`;
}

/** Home: the logo's open orbit, filled dot. Viewing: the same, open dot. Else an empty ring. */
function RowMark({ row, size }: { row: BrowsePickerRow; size: number }): JSX.Element {
  if (row.isHome || row.isViewing) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M20.5 14.5A9 9 0 1 1 15 3.5" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" />
        {row.isHome ? (
          <circle cx="19" cy="18" r="3" fill="var(--coral)" />
        ) : (
          <circle cx="19" cy="18" r="2.6" stroke="var(--coral)" strokeWidth="1.6" />
        )}
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: 999,
        border: "2px solid rgba(var(--scrim-rgb),0.18)",
      }}
    />
  );
}

function FullRow({
  row,
  current,
  onPick,
}: {
  row: BrowsePickerRow;
  current: boolean;
  onPick(campusId: string): void;
}): JSX.Element {
  const style = row.isHome ? HOME_ROW : row.isViewing ? { ...FULL_ROW, ...CORAL_EDGE } : FULL_ROW;
  return (
    <button
      type="button"
      className="vibe-browse-row"
      onClick={() => onPick(row.id)}
      aria-label={rowLabel(row)}
      aria-current={current ? "true" : undefined}
      style={style}
    >
      <RowMark row={row} size={18} />
      <span style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <span style={NAME}>{row.name}</span>
        {row.sub ? (
          <span style={row.isHome ? HOME_SUB : SUB}>{row.sub}</span>
        ) : null}
      </span>
      {row.isHome ? (
        <span style={HERE_PILL}>You&apos;re here</span>
      ) : row.isViewing ? (
        <span style={{ ...TRAILING, color: "var(--tag-ink)" }}>Viewing</span>
      ) : (
        <span style={TRAILING}>
          View <span aria-hidden="true">›</span>
        </span>
      )}
    </button>
  );
}

/** A 44px tile in the two-column grid; its sub-line (if any) lives in the tooltip and the label. */
function Tile({
  row,
  current,
  onPick,
}: {
  row: BrowsePickerRow;
  current: boolean;
  onPick(campusId: string): void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="vibe-browse-row"
      onClick={() => onPick(row.id)}
      aria-label={rowLabel(row)}
      aria-current={current ? "true" : undefined}
      title={row.sub ?? undefined}
      style={row.isViewing ? { ...TILE, ...CORAL_EDGE } : TILE}
    >
      <RowMark row={row} size={14} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.name}
      </span>
    </button>
  );
}

/** Desktop: a centred dialog over a scrim, portaled to <body> (the ReportSheet modal's pattern). */
function PickerModal({
  groups,
  onPick,
  onClose,
}: {
  groups: BrowsePickerGroup[];
  onPick(campusId: string): void;
  onClose(): void;
}): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // Latest onClose without re-running the mount effect (an inline arrow from
  // the parent would otherwise re-grab focus on every render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus moves in on open and back to the opener ("Campuses") on close;
  // Escape closes; Tab stays inside; the page behind doesn't scroll.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const stops = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"));
      const first = stops[0] ?? dialog;
      const last = stops[stops.length - 1] ?? dialog;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 11000 }}>
      {/* A plain div, not a button: Close inside the dialog is the real
          control, and Escape works from anywhere. */}
      <div
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.38)" }}
      />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={MODAL}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <h2 id={titleId} style={TITLE}>
            Look around<span style={{ color: "var(--coral)" }}>.</span>
          </h2>
          <button
            type="button"
            className="vibe-browse-close"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            style={CLOSE}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <PickerBody groups={groups} onPick={onPick} />
      </div>
    </div>,
    document.body,
  );
}

// ── Styles (C0 tokens only; coral tints are coral in both themes) ─────────

// Same scrim and tier as CampusMobile's Post options sheet: above the tab bar
// (9988), below the toasts (12000).
const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 10000,
};

const SHEET: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "var(--cream)",
  borderTopLeftRadius: 26,
  borderTopRightRadius: 26,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -12px 40px rgba(0,0,0,0.18)",
  zIndex: 10001,
  outline: "none",
  fontFamily: FONT,
  color: "var(--charcoal)",
};

const HANDLE: CSSProperties = {
  margin: "10px auto 4px",
  width: 40,
  height: 5,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.14)",
};

const SHEET_SCROLL: CSSProperties = {
  maxHeight: "calc(88dvh - 19px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxSizing: "border-box",
  padding: "0 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const MODAL: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%,-50%)",
  width: "min(440px, calc(100vw - 32px))",
  maxHeight: "min(86vh, 780px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxSizing: "border-box",
  padding: "18px 20px 0",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  background: "var(--cream)",
  border: "1px solid var(--hairline)",
  borderRadius: 20,
  boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
  outline: "none",
  fontFamily: FONT,
  color: "var(--charcoal)",
};

const TITLE: CSSProperties = {
  margin: 0,
  fontFamily: SERIF,
  fontWeight: 900,
  fontSize: 26,
  lineHeight: 1.15,
  letterSpacing: -0.8,
  color: "var(--charcoal)",
};

const CLOSE: CSSProperties = {
  marginLeft: "auto",
  marginTop: -8,
  marginRight: -10,
  flexShrink: 0,
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink-2)",
  cursor: "pointer",
};

// Sits 4px under the title, as drawn (the column gap is 12).
const INTRO: CSSProperties = {
  margin: "-8px 0 0",
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--ink-2)",
};

const GROUP: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const GROUP_LABEL: CSSProperties = {
  margin: 0,
  padding: "4px 4px 0",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.18em",
  color: "var(--ink-muted)",
};

const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
};

// Glass rows on the cream sheet, with the feed card's shadow so they read as
// tappable in Light (where the white edge nearly vanishes) and in Night.
const FULL_ROW: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: 52,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "6px 14px",
  borderRadius: 16,
  border: "1px solid var(--glass-border)",
  background: "var(--glass)",
  boxShadow: "var(--card-shadow)",
  color: "var(--charcoal)",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const CORAL_EDGE: CSSProperties = { border: "1.5px solid rgba(255,92,53,0.55)" };

const HOME_ROW: CSSProperties = {
  ...FULL_ROW,
  ...CORAL_EDGE,
  minHeight: 60,
  background: "rgba(255,92,53,0.06)",
  boxShadow: "none",
};

const TILE: CSSProperties = {
  ...FULL_ROW,
  minHeight: 44,
  gap: 8,
  padding: "0 12px",
  borderRadius: 14,
  fontSize: 13.5,
  fontWeight: 700,
};

const NAME: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const SUB: CSSProperties = { fontSize: 11.5, color: "var(--ink-muted)" };

const HOME_SUB: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--tag-ink)" };

const HERE_PILL: CSSProperties = {
  flexShrink: 0,
  height: 26,
  padding: "0 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  background: "var(--charcoal)",
  color: "var(--cream)",
  fontSize: 11.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const TRAILING: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--ink-2)",
  whiteSpace: "nowrap",
};

const FOOTER: CSSProperties = {
  margin: "auto 0 0",
  padding: "4px 0 22px",
  fontFamily: SERIF,
  fontStyle: "italic",
  fontSize: 13,
  color: "var(--ink-muted)",
  textAlign: "center",
};

/** What inline styles can't say: the hover edge and the coral focus ring. */
const PICKER_CSS = `
@media (hover: hover) {
  .vibe-browse-row:hover { border-color: rgba(255,92,53,0.45) !important; }
  .vibe-browse-close:hover { background: rgba(var(--scrim-rgb),0.06) !important; }
}
.vibe-browse-row:focus-visible,
.vibe-browse-close:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
`;
