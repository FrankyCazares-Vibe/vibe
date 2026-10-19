"use client";

/**
 * "Check in" from an event card (contract 4.1): the 4-digit code box, as a
 * bottom sheet on a phone and a centred dialog on a desktop. The card
 * doesn't know which screen it is on, so this asks the viewport itself, the
 * same `useIsMobile` split EventReportAction makes (campus-home.tsx).
 *
 * Both shapes portal to <body>. React still bubbles a portal's events up
 * its own tree, into the card, so pointer moves stop here: otherwise the
 * card's MouseSpotlight tilts the card behind the sheet.
 *
 * Theme tokens only (its own surface, not the dark Events scene), so Night
 * mode follows. On a check-in it hands the state up and closes; the card's
 * slot then reads "You're checked in".
 */
import { motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle } from "@/components/mobile/messages/sheet-styles";
import { CHECKIN_COPY, type CheckinViewerState } from "@/lib/events/event-checkin";
import { SPRING_SOFT } from "@/lib/motion/springs";
import { useIsMobile } from "@/lib/use-is-mobile";

import { CheckinCodeForm } from "./CheckinCodeForm";

type Props = {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
  onCheckedIn: (state: CheckinViewerState) => void;
};

// Above the phone tab bar (z 9988) and every sheet it can open over, below
// the toasts (12000) so a refusal still shows: ReportSheet's tier.
const Z_OVERLAY = 10400;
const Z_PANEL = 10401;

const stopPointer = (e: React.PointerEvent) => e.stopPropagation();

export function CheckinSheet(props: Props) {
  const isMobile = useIsMobile();
  useRestoreFocus();
  return isMobile ? <PhoneSheet {...props} /> : <DesktopDialog {...props} />;
}

/**
 * Focus goes back to whatever opened the sheet (the card's "Check in"
 * pill) when it closes. A layout effect, so it notes the opener before the
 * code field's own focus effect runs.
 */
function useRestoreFocus(): void {
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      // After a check-in the pill has turned into "You're checked in"; a
      // detached opener just takes nothing.
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}

function PhoneSheet({ eventId, eventTitle, onClose, onCheckedIn }: Props) {
  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: Z_OVERLAY }} onPointerMove={stopPointer} />
        <Drawer.Content
          style={{ ...vaulContentStyle, zIndex: Z_PANEL }}
          // The event's name describes the sheet; without one there is nothing to point at.
          {...(eventTitle ? {} : { "aria-describedby": undefined })}
          onPointerMove={stopPointer}
        >
          <Drawer.Handle style={vaulHandleStyle} />
          <div style={{ padding: "8px 18px 22px", maxHeight: "calc(88dvh - 18px)", overflowY: "auto", overscrollBehavior: "contain" }}>
            <Drawer.Title style={titleStyle}>{CHECKIN_COPY.sheetTitle}</Drawer.Title>
            {eventTitle ? <Drawer.Description style={eventLineStyle}>{eventTitle}</Drawer.Description> : null}
            <p style={leadStyle}>{CHECKIN_COPY.sheetLead}</p>
            <CheckinCodeForm
              eventId={eventId}
              eventTitle={eventTitle}
              autoFocus
              onCheckedIn={(state) => {
                onCheckedIn(state);
                onClose();
              }}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DesktopDialog({ eventId, eventTitle, onClose, onCheckedIn }: Props) {
  const titleId = useId();
  const eventLineId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes it and Tab stays inside it (the ReportModal pattern), and
  // the page behind doesn't scroll under the scrim.
  useEffect(() => {
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const stops = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = stops[0] ?? panel;
      const last = stops[stops.length - 1] ?? panel;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
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

  // Opened from a click, so this never renders on the server.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onPointerMove={stopPointer}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_OVERLAY,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* A plain div, not a button: a focusable scrim would be the first
          thing Tab lands on. Escape and the scrim both close it. */}
      <motion.div
        aria-hidden
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING_SOFT}
        // Black, not rgba(var(--scrim-rgb),0.45): in Night --scrim-rgb is
        // white, and that would wash the page out instead of dimming it. The
        // phone sheet's overlay (sheet-styles.ts) is black for the same reason.
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={eventTitle ? eventLineId : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_SOFT}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 400,
          maxHeight: "min(86vh, 640px)",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: 22,
          borderRadius: 20,
          background: "var(--cream)",
          color: "var(--charcoal)",
          border: "1px solid var(--hairline)",
          // A black shadow reads as depth in both themes (sheet-styles.ts does the same).
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          outline: "none",
        }}
      >
        <h2 id={titleId} style={{ ...titleStyle, padding: 0 }}>
          {CHECKIN_COPY.sheetTitle}
        </h2>
        {eventTitle ? (
          <p id={eventLineId} style={eventLineStyle}>
            {eventTitle}
          </p>
        ) : null}
        <p style={leadStyle}>{CHECKIN_COPY.sheetLead}</p>
        <CheckinCodeForm
          eventId={eventId}
          eventTitle={eventTitle}
          autoFocus
          onCheckedIn={(state) => {
            onCheckedIn(state);
            onClose();
          }}
        />
      </motion.div>
    </div>,
    document.body,
  );
}

const titleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  padding: "4px 0 0",
  fontFamily: "Fraunces, serif",
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
};

/**
 * The event's name, under the title in both shapes: codes are per event, so
 * a student who opened the wrong card sees it before typing (a wrong code
 * costs one of the day's 20 tries).
 */
const eventLineStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const leadStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--ink-2)",
};
