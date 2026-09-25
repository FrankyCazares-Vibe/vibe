"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";

import {
  CAMPUS_CONFIRM_DISMISSED_KEY,
  campusConfirmBannerView,
  type CampusConfirmBannerView,
  type CampusConfirmState,
} from "@/components/mobile/campus-confirm-banner-view";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

/**
 * "Confirm your campus" / "Pick your campus" card for phone /campus (wave
 * plan B14t; open question Q12). CampusMobile mounts it directly above the
 * tab strip (CM, wave 4); this file ships first so the import exists.
 *
 * Shows only for a verified student with a university whose campus was never
 * chosen (`campus_confirmed` false), or who has no valid campus at all (a
 * university switch clears the campus but keeps `campus_set_at`, so
 * `campus_confirmed` alone would hide "Pick your campus"). Which card, and
 * when it's hidden, is decided by the pure `campusConfirmBannerView` (tested in
 * `campus-confirm-banner-view.test.ts`).
 *
 * - confirm: "Yes" re-sends the current campus, which stamps it (and starts
 *   the 30-day lock, said under the buttons). "Change" goes to Settings.
 * - pick: "Pick campus" goes to Settings; there's no campus to confirm.
 * - "Not now" hides it for this browser session.
 *
 * A failed load renders nothing: this is a nudge, never a blocker.
 *
 * `onVisibleChange` (wave 3′b) lets CampusMobile keep the push ask out of
 * this slot while the card shows: it's called once the load settles (true
 * or false, a failed load is false), then on every flip between a card and
 * nothing, and with false on unmount if the card was showing.
 */
export function CampusConfirmBanner({
  onVisibleChange,
}: {
  onVisibleChange?: (visible: boolean) => void;
} = {}): JSX.Element | null {
  const [view, setView] = useState<CampusConfirmBannerView | null>(null);
  // The onboarding-state read answered (ok or not); until then nothing is reported.
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await vibeRequest<CampusConfirmState>("/api/me/onboarding-state", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load your campus.",
      });
      if (cancelled) return;
      if (r.ok) setView(campusConfirmBannerView(r.data, readDismissed()));
      setSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = view !== null;
  const onVisibleChangeRef = useRef(onVisibleChange);
  // What the parent was last told: null = nothing yet.
  const reportedRef = useRef<boolean | null>(null);
  useEffect(() => {
    onVisibleChangeRef.current = onVisibleChange;
  }, [onVisibleChange]);
  useEffect(() => {
    if (!settled || reportedRef.current === visible) return;
    reportedRef.current = visible;
    onVisibleChangeRef.current?.(visible);
  }, [settled, visible]);
  useEffect(() => {
    const reported = reportedRef;
    const onChange = onVisibleChangeRef;
    return () => {
      if (reported.current === true) onChange.current?.(false);
    };
  }, []);

  if (!view) return null;

  const onNotNow = () => {
    try {
      sessionStorage.setItem(CAMPUS_CONFIRM_DISMISSED_KEY, "1");
    } catch {
      /* storage blocked: it still hides for this visit */
    }
    setView(null);
  };

  const onYes = async () => {
    if (busy || view.mode !== "confirm") return;
    setBusy(true);
    const r = await vibeRequest("/api/me/profile", {
      method: "PATCH",
      json: { campus_id: view.campusId },
      quiet: true,
      failure: "Couldn't confirm your campus.",
    });
    setBusy(false);
    if (r.ok) {
      setView(null);
      toast({ message: "Campus confirmed.", tone: "info" });
      return;
    }
    toast({ message: r.message, tone: "error", action: r.action });
  };

  return (
    <div style={{ padding: "10px 12px 0" }}>
      <section
        aria-label={view.title}
        style={{
          padding: 14,
          borderRadius: 18,
          background: "rgba(255,253,248,0.78)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 16,
            fontWeight: 800,
            color: "#1C1C1E",
            letterSpacing: "-0.2px",
          }}
        >
          {view.title}
        </div>
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            lineHeight: 1.4,
            color: "#5C5853",
          }}
        >
          {view.body}
        </p>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {view.mode === "confirm" ? (
            <>
              <button
                type="button"
                onClick={() => void onYes()}
                disabled={busy}
                aria-busy={busy || undefined}
                style={{ ...primaryButton, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
              >
                {busy ? "…" : "Yes"}
              </button>
              <Link href="/settings#campus" style={secondaryButton}>
                Change
              </Link>
            </>
          ) : (
            <Link href="/settings#campus" style={primaryButton}>
              Pick campus
            </Link>
          )}
          <button type="button" onClick={onNotNow} style={textButton}>
            Not now
          </button>
        </div>
        {view.mode === "confirm" ? (
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11.5,
              lineHeight: 1.4,
              color: "#8A8580",
            }}
          >
            {view.note}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** "Not now" was tapped earlier this session. Storage failure reads as no. */
function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(CAMPUS_CONFIRM_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

const buttonBase: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: "#1C1C1E",
  color: "#fff",
  border: "1px solid rgba(0,0,0,0.06)",
};

const secondaryButton: CSSProperties = {
  ...buttonBase,
  background: "rgba(255,255,255,0.78)",
  color: "#1C1C1E",
  border: "1px solid rgba(28,28,30,0.16)",
};

const textButton: CSSProperties = {
  ...buttonBase,
  padding: "0 10px",
  background: "transparent",
  color: "#5C5853",
  border: "none",
};
