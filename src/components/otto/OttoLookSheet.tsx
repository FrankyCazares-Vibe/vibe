"use client";

/**
 * Otto's look (Nov 10, 2026, the Otto build's Wave 1): his colour and
 * whether he moves on his own. A bottom sheet on a phone and a centred
 * dialog on a computer, the CheckinSheet way: both portal to <body> and take
 * the page's theme tokens, so Light and Night both read.
 *
 * A tap applies at once: `setOttoLook` saves it on this device and every
 * Planet on the page repaints (use-otto-look.ts), then the look is PATCHed to
 * `users.otto_settings.look` so a new device can pick it up. Saves never
 * overlap and the last tap wins (useOttoLookSaver). A refused save keeps the
 * device's pick (a person who chose Still keeps a still Otto) and says the
 * account copy didn't save.
 *
 * Ink, not coral, for every control: the only coral in the frame is Otto's
 * own moon (the board's one-coral rule).
 *
 * Motion 1 (Nov 12): picking a colour gives the preview Otto a soft pop and
 * the check lands on the new swatch (kit/motion.css; still under reduced motion).
 */
import { motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import { vaulContentStyle, vaulHandleStyle, vaulOverlayStyle } from "@/components/mobile/messages/sheet-styles";
import { vibeRequest } from "@/lib/feedback/request";
import { pop } from "@/lib/motion/feedback";
import { SPRING_SOFT } from "@/lib/motion/springs";
import { OTTO_COLOURS, parseLook, type OttoColour, type OttoLook, type OttoMotion } from "@/lib/otto/look";
import { setOttoLook, useOttoLook } from "@/lib/otto/use-otto-look";
import { useIsMobile } from "@/lib/use-is-mobile";

import "./kit/planet.css";
import "./kit/motion.css";
import { OttoPlanet } from "./planet/OttoPlanet";

/** The names people see, in the club backdrops' order (look.ts). */
export const OTTO_COLOUR_NAMES: Record<OttoColour, string> = {
  dusk: "Dusk",
  midnight: "Midnight",
  violet: "Violet",
  rose: "Rose",
  cardinal: "Cardinal",
  ember: "Ember",
  lantern: "Lantern",
  forest: "Forest",
  canal: "Canal",
  onyx: "Onyx",
};

export const OTTO_MOTION_NAMES: Record<OttoMotion, string> = { still: "Still", living: "Living" };

export const LOOK_HELP =
  "Still keeps Otto from moving. Low Power Mode doesn't stop motion, so pick Still if you want him calm.";

// Above the phone tab bar (z 9988), below the toasts (12000): CheckinSheet's tier.
const Z_OVERLAY = 10400;
const Z_PANEL = 10401;

/**
 * Applies a look on this device at once and saves it to the account. One
 * PATCH at a time; a pick made while one is in flight waits, and only the
 * newest waiting pick is sent. `saving` is true from the first tap until the
 * last save settles (the caller sets `data-holds-reload` from it).
 */
export function useOttoLookSaver(): { pick: (look: OttoLook) => void; saving: boolean } {
  const [saving, setSaving] = useState(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef<OttoLook | null>(null);

  // Drains the queue: one PATCH at a time, always the newest waiting pick.
  const send = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      while (queuedRef.current) {
        const look = queuedRef.current;
        queuedRef.current = null;
        await vibeRequest("/api/me/otto/settings", {
          method: "PATCH",
          json: { look },
          failure: "Couldn't save Otto's look to your account. This device keeps it.",
        });
      }
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }, []);

  const pick = useCallback(
    (look: OttoLook) => {
      const next = parseLook(look);
      setOttoLook(next);
      queuedRef.current = next;
      setSaving(true);
      void send();
    },
    [send],
  );

  return { pick, saving };
}

type SheetProps = {
  onClose: () => void;
  /** From useOttoLookSaver, owned by the row that opened the sheet. */
  onPick: (look: OttoLook) => void;
  saving: boolean;
};

export function OttoLookSheet(props: SheetProps) {
  const isMobile = useIsMobile();
  useRestoreFocus();
  return isMobile ? <PhoneSheet {...props} /> : <ComputerDialog {...props} />;
}

/** Focus goes back to the row's button when the sheet closes. */
function useRestoreFocus(): void {
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}

function PhoneSheet({ onClose, onPick, saving }: SheetProps) {
  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: Z_OVERLAY }} />
        <Drawer.Content style={{ ...vaulContentStyle, zIndex: Z_PANEL }} aria-describedby={undefined}>
          <Drawer.Handle style={vaulHandleStyle} />
          <div
            data-holds-reload={saving ? "" : "false"}
            style={{ padding: "8px 18px 22px", maxHeight: "calc(88dvh - 18px)", overflowY: "auto", overscrollBehavior: "contain" }}
          >
            <Drawer.Title style={titleStyle}>Otto&apos;s look</Drawer.Title>
            <LookBody onPick={onPick} onDone={onClose} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ComputerDialog({ onClose, onPick, saving }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The caller's onClose can be a new function each render (every pick
  // re-renders the row), so the effect below reads it through a ref and runs
  // once: re-running it would pull focus off the swatch just pressed.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes it, Tab stays inside it, the page behind doesn't scroll.
  // Focus moves into the dialog once, when it opens.
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const stops = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
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
  }, []);

  // Opened from a click, so this never renders on the server.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-holds-reload={saving ? "" : "false"}
      style={{ position: "fixed", inset: 0, zIndex: Z_OVERLAY, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      {/* A plain div, not a button, so Tab never lands on the scrim. Black in
          both themes (CheckinSheet): a white scrim would wash Night out. */}
      <motion.div
        aria-hidden
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={SPRING_SOFT}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_SOFT}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          maxHeight: "min(86vh, 680px)",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: 22,
          borderRadius: 20,
          background: "var(--cream)",
          color: "var(--charcoal)",
          border: "1px solid var(--hairline)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          outline: "none",
        }}
      >
        <h2 id={titleId} style={{ ...titleStyle, padding: 0 }}>
          Otto&apos;s look
        </h2>
        <LookBody onPick={onPick} onDone={onClose} />
      </motion.div>
    </div>,
    document.body,
  );
}

function LookBody({ onPick, onDone }: { onPick: (look: OttoLook) => void; onDone: () => void }) {
  const look = useOttoLook();
  const colourLabel = useId();
  const motionLabel = useId();
  const helpId = useId();
  const preview = useRef<HTMLSpanElement>(null);
  // A check placed by a tap lands; the one there when the sheet opens just sits.
  const [picked, setPicked] = useState(false);
  const pickColour = (c: OttoColour) => {
    if (c !== look.colour) {
      pop(preview.current);
      setPicked(true);
    }
    onPick({ ...look, colour: c });
  };

  return (
    <>
      <div style={previewStyle}>
        {/* The preview follows the device's look, so it moves only when Living. */}
        <span ref={preview} style={{ display: "inline-flex" }}>
          <OttoPlanet size={72} live />
        </span>
      </div>

      <p id={colourLabel} style={labelStyle}>
        Colour
      </p>
      <div role="group" aria-labelledby={colourLabel} style={swatchGridStyle}>
        {OTTO_COLOURS.map((c) => {
          const on = look.colour === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => pickColour(c)}
              style={swatchButtonStyle}
            >
              <span style={{ ...swatchRingStyle, boxShadow: on ? "0 0 0 2px var(--charcoal)" : "none" }}>
                <span className={`sk-dot sk-${c}`} style={{ width: 36, height: 36 }} aria-hidden />
                {on ? <CheckBadge land={picked} /> : null}
              </span>
              <span style={{ ...swatchNameStyle, fontWeight: on ? 700 : 500 }}>{OTTO_COLOUR_NAMES[c]}</span>
            </button>
          );
        })}
      </div>

      <p id={motionLabel} style={labelStyle}>
        Otto&apos;s motion
      </p>
      <div role="group" aria-labelledby={motionLabel} aria-describedby={helpId} style={segmentedStyle}>
        {(["still", "living"] as const).map((m) => {
          const on = look.motion === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => onPick({ ...look, motion: m })}
              style={{
                ...segmentStyle,
                background: on ? "var(--charcoal)" : "transparent",
                color: on ? "var(--cream)" : "var(--charcoal)",
              }}
            >
              {OTTO_MOTION_NAMES[m]}
            </button>
          );
        })}
      </div>
      <p id={helpId} style={helpStyle}>
        {LOOK_HELP}
      </p>

      <button type="button" onClick={onDone} style={doneStyle}>
        Done
      </button>
    </>
  );
}

/** The chosen swatch's check: ink on the page colour, so it reads on every dot. */
function CheckBadge({ land = false }: { land?: boolean }) {
  return (
    <span aria-hidden className={land ? "dk-check-land" : undefined} style={checkBadgeStyle}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5.2 4.1 7.3 8 2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const titleStyle: CSSProperties = {
  margin: "0 0 6px",
  padding: "4px 0 0",
  fontFamily: "Fraunces, serif",
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
};

const previewStyle: CSSProperties = { display: "flex", justifyContent: "center", padding: "10px 0 14px" };

const labelStyle: CSSProperties = {
  margin: "4px 0 8px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--charcoal)",
};

const swatchGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "10px 4px",
  marginBottom: 18,
};

const swatchButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  minWidth: 44,
  minHeight: 44,
  padding: "2px 0",
  border: "none",
  background: "transparent",
  color: "var(--charcoal)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const swatchRingStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "50%",
};

const checkBadgeStyle: CSSProperties = {
  position: "absolute",
  right: -1,
  bottom: -1,
  width: 16,
  height: 16,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--cream)",
  color: "var(--charcoal)",
  boxShadow: "0 0 0 1.5px var(--charcoal)",
};

const swatchNameStyle: CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--charcoal)",
};

const segmentedStyle: CSSProperties = {
  display: "inline-flex",
  padding: 3,
  gap: 2,
  borderRadius: 999,
  border: "1px solid var(--hairline)",
};

const segmentStyle: CSSProperties = {
  minWidth: 88,
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 999,
  border: "none",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const helpStyle: CSSProperties = {
  margin: "10px 0 18px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  lineHeight: 1.5,
  color: "var(--ink-2)",
};

const doneStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 44,
  borderRadius: 999,
  border: "1px solid var(--hairline)",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
