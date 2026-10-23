"use client";

/**
 * The Share sheet (the club's view, wave 3, B2, Oct 23, 2026; design
 * M_Share_Sheet.png, minus its story cards and Instagram rows, which are
 * week 1). The club page's Share page button opens it, the officers' half
 * pill and everyone else's square alike (SharePageButton, OfficerActions.tsx).
 * A vaul sheet on a phone (≤ 720px, the page's breakpoint), a small centred
 * dialog on a computer, built like the + sheet (PlusSheet.tsx):
 *
 * - "Share <club>", and "Made from your club page. No names or faces."
 * - The club's link picture, as people will see it when the link is sent
 *   (`/orgs/<h>/opengraph-image`, src/lib/og/club-card.tsx), scaled down.
 * - Send it: the phone's own share sheet (shareClubPage: the store apps'
 *   sheet, then the browser's). Only where there is one: a computer's
 *   browser without one gets Copy link alone.
 * - Copy link, with the address under it.
 * - QR for your table, for the owner and officers: the table card
 *   (`/orgs/<h>/table-card`, B3's page), to print or show on a screen.
 *
 * The page never mounts it for a hidden club (no page to share). Like the
 * + sheet, the sheet and the dialog are portals on <body>, outside the
 * page's `vibe-night-island`, so each carries the class itself.
 */
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { copyText } from "@/lib/feedback/request";
import { getPlugin } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

import { clubPageUrl, shareClubPage } from "./share-page";

/** Who is sharing: it picks the sheet's words, and only officers get the table card. */
export type ShareViewer = "officer" | "member" | "visitor";

/** Same breakpoint as the club page's phone layout. */
const PHONE_QUERY = "(max-width: 720px)";

/** A share sheet to hand the link to: the store apps' own, or the browser's. */
function hasSendSheet(): boolean {
  if (typeof window === "undefined") return false;
  if (appShellOnClient() !== null && getPlugin<object>("Share")) return true;
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** The address as the Copy link row shows it: no scheme, no "www.". */
function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

export function ShareSheet({
  handle,
  name,
  viewer,
  onClose,
}: {
  handle: string;
  name: string;
  viewer: ShareViewer;
  onClose: () => void;
}) {
  // Read once, when Share page is tapped (this only mounts after a tap).
  const [presentation] = useState<"sheet" | "dialog">(() =>
    typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches ? "sheet" : "dialog",
  );
  const [canSend] = useState(hasSendSheet);
  const [url] = useState(() => (typeof window === "undefined" ? "" : clubPageUrl(handle, window.location.origin)));
  const [pictureFailed, setPictureFailed] = useState(false);

  // One phone sheet at a time: a second tap while one is up would be
  // refused and fall through to a copy.
  const sending = useRef(false);
  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      await shareClubPage({ handle, name });
    } finally {
      sending.current = false;
    }
  };

  const title = `Share ${name.trim()}`;
  const sub =
    viewer === "visitor"
      ? "Made from the club page. No names or faces."
      : "Made from your club page. No names or faces.";

  const body = (
    <>
      {pictureFailed ? null : (
        <div style={previewFrameStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture route of our own, drawn on request */}
          <img
            src={`/orgs/${encodeURIComponent(handle)}/opengraph-image`}
            alt="The picture people see when you send the link"
            width={1200}
            height={630}
            onError={() => setPictureFailed(true)}
            style={previewImageStyle}
          />
        </div>
      )}
      {/* The computer's dialog puts focus on the first of these. */}
      <div data-share-rows="" style={{ padding: "4px 0 12px" }}>
        {canSend ? (
          <button type="button" className="vibe-press" onClick={() => void send()} style={rowStyle}>
            <RowFace icon={<SendGlyph />} label="Send it" sub="GroupMe, iMessage and more" />
          </button>
        ) : null}
        <button
          type="button"
          className="vibe-press"
          onClick={() =>
            void copyText(url, { success: "Link copied.", failure: `Couldn't copy the link. It's ${url}` })
          }
          style={rowStyle}
        >
          <RowFace icon={<LinkGlyph />} label="Copy link" sub={shownAddress(url)} />
        </button>
        {viewer === "officer" ? (
          <Link
            href={`/orgs/${encodeURIComponent(handle)}/table-card`}
            onClick={onClose}
            className="vibe-press"
            style={rowStyle}
          >
            <RowFace icon={<QrGlyph />} label="QR for your table" sub="Print or show on a screen" />
          </Link>
        ) : null}
      </div>
    </>
  );

  return presentation === "sheet" ? (
    <PhoneSheet title={title} sub={sub} onClose={onClose}>
      {body}
    </PhoneSheet>
  ) : (
    <DesktopDialog title={title} sub={sub} onClose={onClose}>
      {body}
    </DesktopDialog>
  );
}

function RowFace({ icon, label, sub }: { icon: ReactNode; label: string; sub: string }) {
  return (
    <>
      <span aria-hidden style={iconTileStyle}>
        {icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={rowLabelStyle}>{label}</span>
        <span style={rowSubStyle}>{sub}</span>
      </span>
    </>
  );
}

/** The phone's bottom sheet, as the + sheet's (PlusSheet.tsx), with its line under the title. */
function PhoneSheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={sheetOverlayStyle} />
        <Drawer.Content className="vibe-night-island" style={sheetContentStyle}>
          <Drawer.Handle style={sheetHandleStyle} />
          <div style={headerStyle}>
            <Drawer.Title style={titleStyle}>{title}</Drawer.Title>
            <CloseButton onClose={onClose} />
          </div>
          <Drawer.Description style={subStyle}>{sub}</Drawer.Description>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The computer's small dialog: Escape and the backdrop close it, focus goes
 * to its first row and back to Share page when it closes (the + sheet's).
 */
function DesktopDialog({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const subId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("[data-share-rows] button:not([disabled]), [data-share-rows] a[href]")
      ?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== rootRef.current) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={rootRef}
      className="vibe-night-island"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subId}
      onClick={(e) => {
        // A portal still bubbles React events to the button that opened it.
        e.stopPropagation();
        onClose();
      }}
      style={dialogBackdropStyle}
    >
      <div ref={panelRef} onClick={(e) => e.stopPropagation()} style={dialogPanelStyle}>
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          <CloseButton onClose={onClose} />
        </div>
        <p id={subId} style={subStyle}>
          {sub}
        </p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

// ─── Looks (theme tokens; they read as Night inside vibe-night-island) ────

const SANS = "DM Sans, sans-serif";

/** The link picture's frame: 1200×630 scaled to the sheet, a quiet tile until it arrives. */
const previewFrameStyle: CSSProperties = {
  margin: "4px 18px 12px",
  aspectRatio: "1200 / 630",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid var(--hairline)",
  background: "rgba(var(--scrim-rgb),0.06)",
};

const previewImageStyle: CSSProperties = { display: "block", width: "100%", height: "100%", objectFit: "cover" };

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: "100%",
  minHeight: 60,
  boxSizing: "border-box",
  padding: "10px 18px",
  background: "transparent",
  border: "none",
  borderTop: "1px solid var(--hairline)",
  color: "var(--charcoal)",
  fontFamily: SANS,
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const iconTileStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  background: "rgba(var(--scrim-rgb),0.07)",
  color: "var(--charcoal)",
};

const rowLabelStyle: CSSProperties = { fontSize: 15, fontWeight: 700, lineHeight: 1.3 };

const rowSubStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-muted)",
  overflowWrap: "anywhere",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 8px 0 18px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  minWidth: 0,
  fontFamily: "Fraunces, serif",
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const subStyle: CSSProperties = {
  margin: "0 18px 10px",
  fontFamily: SANS,
  fontSize: 13,
  lineHeight: 1.4,
  color: "var(--ink-muted)",
};

const closeButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink-2)",
  cursor: "pointer",
};

const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  zIndex: 10000,
};

const sheetContentStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: "92dvh",
  overflowY: "auto",
  background: "var(--paper)",
  color: "var(--charcoal)",
  borderTop: "1px solid var(--hairline)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
  zIndex: 10001,
  outline: "none",
};

const sheetHandleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.18)",
};

const dialogBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(0,0,0,0.5)",
};

const dialogPanelStyle: CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
  boxSizing: "border-box",
  paddingTop: 8,
  borderRadius: 18,
  background: "var(--paper)",
  color: "var(--charcoal)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  fontFamily: SANS,
};

// ─── Glyphs (decorative; every row has its words) ─────────────────────────

const glyph = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Two speech bubbles: a group chat. */
function SendGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z" />
      <path d="M16 8.5h2.5A1.5 1.5 0 0 1 20 10v6a1.5 1.5 0 0 1-1.5 1.5h0v3l-3.5-3h-4.5A1.5 1.5 0 0 1 9 16v-1" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  );
}

function QrGlyph() {
  return (
    <svg aria-hidden {...glyph}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 14h2M14 18v2M17 17h3v3h-3z" />
    </svg>
  );
}
