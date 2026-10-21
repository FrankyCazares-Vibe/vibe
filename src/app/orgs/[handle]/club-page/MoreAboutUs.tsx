"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { ReportSheet } from "@/components/safety/ReportSheet";

import { usePhone } from "./use-phone";

/**
 * "More about us ›" (the club's view, wave 2, C9 item 3): every link,
 * philanthropy and the club's facts, handed in as server-rendered
 * `children`, then "Report this club". A bottom sheet on phones (the page's
 * own 720px), a centred dialog on wider screens.
 *
 * Both are portaled to <body>, outside the page's <main>, so each carries
 * `vibe-night-island` itself: the club page is dark in Light and Night, and
 * its sheet reads the same way.
 *
 * `reportable` moved here from the old About column (OrgContent), same
 * rules, decided by the server page: null signed out or when the membership
 * read failed; `viewerIsOwner` hides the row from the club's own officers,
 * who would otherwise get the route's 400 "You can't report something of
 * your own". The report itself opens once this sheet has closed.
 */
export function MoreAboutUs({
  reportable,
  children,
}: {
  reportable: { id: string; viewerIsOwner?: boolean } | null;
  children: ReactNode;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const canReport = !!reportable && !reportable.viewerIsOwner;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const body = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>
      {canReport ? (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReportOpen(true);
          }}
          style={reportRowStyle}
        >
          Report this club
        </button>
      ) : null}
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={triggerStyle}
      >
        More about us <span aria-hidden>›</span>
      </button>

      {open && phone ? (
        <Drawer.Root
          open
          onOpenChange={(o) => {
            if (!o) setOpen(false);
          }}
        >
          <Drawer.Portal>
            <Drawer.Overlay style={overlayStyle} />
            <Drawer.Content className="vibe-night-island" style={sheetStyle} aria-describedby={undefined}>
              <Drawer.Handle style={handleStyle} />
              <div style={{ maxHeight: "calc(88dvh - 18px)", overflowY: "auto", overscrollBehavior: "contain", padding: "4px 18px 20px" }}>
                <Drawer.Title style={titleStyle}>More about us</Drawer.Title>
                {body}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      ) : null}
      {open && !phone ? <CentredDialog onClose={close}>{body}</CentredDialog> : null}

      {reportOpen && canReport && reportable ? (
        // A club has no person behind it to block, so the sheet offers none.
        <ReportSheet
          variant={phone ? "sheet" : "modal"}
          target={{ type: "org", id: reportable.id, noun: "club" }}
          onClose={() => {
            setReportOpen(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** Desktop: centred over a scrim. Escape and the scrim close it, Tab stays
 *  inside, and it takes focus on open (ReportSheet's ReportModal pattern). */
function CentredDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const stops = Array.from(
        dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      );
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
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="vibe-night-island" style={{ ...overlayStyle, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <h2 id={titleId} style={{ ...titleStyle, flex: 1, padding: 0 }}>
            More about us
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} style={closeStyle}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: 44,
  padding: "0 2px",
  background: "transparent",
  border: "none",
  color: "var(--charcoal)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  fontWeight: 700,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 10000,
};

const sheetStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 10001,
  background: "var(--paper)",
  color: "var(--charcoal)",
  fontFamily: "var(--font-body)",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  borderTop: "1px solid var(--hairline)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  outline: "none",
};

const dialogStyle: CSSProperties = {
  width: "100%",
  maxWidth: 480,
  maxHeight: "min(80vh, 720px)",
  overflowY: "auto",
  boxSizing: "border-box",
  padding: "18px 22px 20px",
  borderRadius: 20,
  background: "var(--paper)",
  color: "var(--charcoal)",
  fontFamily: "var(--font-body)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  outline: "none",
};

const handleStyle: CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(var(--scrim-rgb),0.18)",
};

const titleStyle: CSSProperties = {
  margin: "8px 0 14px",
  fontFamily: "var(--font-display)",
  fontSize: 20,
  fontWeight: 800,
  color: "var(--charcoal)",
};

const closeStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid var(--hairline)",
  background: "transparent",
  color: "var(--ink-2)",
  cursor: "pointer",
};

const reportRowStyle: CSSProperties = {
  display: "block",
  minHeight: 44,
  marginTop: 14,
  padding: "0 2px",
  background: "transparent",
  border: "none",
  color: "var(--ink-muted)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "underline",
  textAlign: "left",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
