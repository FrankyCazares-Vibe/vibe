"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type JSX } from "react";

import { storeUrlFor } from "@/lib/native/store-links";
import { useAppShell } from "@/lib/native/use-app-shell";
import {
  readDevicePush,
  turnOnDevicePush,
  type DevicePushStatus,
  type TurnOnResult,
} from "@/lib/pwa/device-push";
import { useIsStandalone, usePlatform } from "@/lib/pwa/use-standalone";

import {
  afterTurnOn,
  ASK_COPY,
  askPossible,
  dmShownFrom,
  DONE_MS,
  FIRST_DM_ASK_KEY,
  PUSH_ASK_KEY,
  pushAskView,
  snoozedAtFor,
  withSnooze,
  type AskPlacement,
  type PushAskView,
} from "./push-ask-view";

/**
 * The one push ask (plan §8.7, wave 3′b batch E1; B1–B6). Otto's Today pane,
 * the Campus banner slot and the line above a DM's composer only mount it;
 * push-ask-view.ts (pure, tested) decides whether it shows and what it says:
 * the push ask in the store app or the installed web app, "Get the app" in a
 * phone browser tab once the listing exists, nothing anywhere else.
 *
 * Renders NOTHING until the device status is known, and nothing when push
 * isn't available for this account (W2). `suppressed` renders nothing and
 * doesn't read (Campus passes it while its confirm banner or the tour shows).
 * `onVisibleChange` hears every change of "am I on screen", and `false` on
 * unmount if it was.
 *
 * The push button calls turnOnDevicePush() first thing in onClick: iOS only
 * shows the permission prompt when it starts inside the tap (B6). Storage
 * that can't be read or written means no ask (B5).
 */
export function PushAsk(p: {
  placement: AskPlacement;
  suppressed?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}): JSX.Element | null {
  const { placement, suppressed = false, onVisibleChange } = p;
  const shell = useAppShell();
  const standalone = useIsStandalone();
  const platform = usePlatform();
  // null = still reading (render nothing); "blocked" = storage unusable (B5).
  const [facts, setFacts] = useState<Facts | "blocked" | null>(null);
  // ask → (a tap's answer) done → gone; "Not now" goes straight to gone.
  const [phase, setPhase] = useState<"ask" | "done" | "gone">("ask");
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const busyRef = useRef(false);
  const markedRef = useRef(false);
  const reportedRef = useRef(false);
  const onVisibleRef = useRef(onVisibleChange);
  const rootRef = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const titleId = useId();
  const storeUrl = storeUrlFor(platform);
  // A computer, an in-app browser, a phone tab with no listing yet: no ask
  // can ever show, so don't even read the device (null platform = hydrating).
  const possible = askPossible({ placement, shell, standalone, platform, storeUrl });

  useEffect(() => {
    onVisibleRef.current = onVisibleChange;
  });

  // One read, once not suppressed (the device read is shared per page load).
  useEffect(() => {
    if (suppressed || !possible || facts !== null) return;
    let alive = true;
    readDevicePush().then(
      (status) => {
        if (!alive) return;
        const stored = readStored(placement);
        setFacts(stored ? { status, ...stored, now: Date.now() } : "blocked");
      },
      () => {
        if (alive) setFacts("blocked");
      },
    );
    return () => {
      alive = false;
    };
  }, [suppressed, possible, facts, placement]);

  const view: PushAskView =
    facts === null || facts === "blocked" || !possible
      ? NONE
      : pushAskView({
          placement,
          shell,
          standalone,
          platform,
          status: facts.status,
          snoozedAt: facts.snoozedAt,
          dmShown: facts.dmShown,
          storeUrl,
          now: facts.now,
        });
  const visible = !suppressed && phase !== "gone" && view.kind !== "none";
  const shownKind = visible ? view.kind : "none";

  // The DM ask shows once per device: mark it the first time it's on screen.
  useEffect(() => {
    if (placement !== "dm" || shownKind === "none" || markedRef.current) return;
    markedRef.current = true;
    try {
      window.localStorage.setItem(FIRST_DM_ASK_KEY, "1");
    } catch {
      /* the read probed a write a moment ago; at worst it shows once more */
    }
  }, [placement, shownKind]);

  useEffect(() => {
    if (reportedRef.current === visible) return;
    reportedRef.current = visible;
    onVisibleRef.current?.(visible);
  }, [visible]);

  useEffect(
    () => () => {
      if (!reportedRef.current) return;
      reportedRef.current = false;
      onVisibleRef.current?.(false);
    },
    [],
  );

  // "You're set." (or why not) stays a moment, then the ask goes. The Turn on
  // button just left the page, so its focus moves to that line, unless the
  // student has already moved on (typing a reply while the prompt was open).
  useEffect(() => {
    if (phase !== "done") return;
    const active = document.activeElement;
    if (!active || active === document.body || rootRef.current?.contains(active)) {
      statusRef.current?.focus();
    }
    const timer = window.setTimeout(() => setPhase("gone"), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // (TypeScript narrows `view` through `visible`: it is "push" or "get-app" below.)
  if (!visible) return null;

  const finish = (result: TurnOnResult | null) => {
    busyRef.current = false;
    setBusy(false);
    const next = afterTurnOn(result, platform);
    if (next.kind === "hide") {
      setPhase("gone");
      return;
    }
    setLine(next.line);
    if (next.kind === "done") setPhase((now) => (now === "gone" ? now : "done"));
  };

  const onTurnOn = () => {
    if (busyRef.current) return;
    // FIRST, before any state change or await (B6).
    const pending = turnOnDevicePush();
    busyRef.current = true;
    setBusy(true);
    setLine(null);
    pending.then(finish, () => finish(null));
  };

  const onNotNow = () => {
    if (placement !== "dm") {
      try {
        const raw = window.localStorage.getItem(PUSH_ASK_KEY);
        window.localStorage.setItem(PUSH_ASK_KEY, withSnooze(raw, placement, Date.now()));
      } catch {
        /* it still goes for now */
      }
    }
    setPhase("gone");
  };

  const s = STYLES[placement];
  const done = phase === "done";

  const action =
    view.kind === "push" ? (
      <button
        type="button"
        onClick={onTurnOn}
        aria-describedby={titleId}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        className={s.primaryClass}
        style={{ ...s.primary, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
      >
        {view.cta}
      </button>
    ) : (
      // A plain link: the store opens from the browser tab (never shown in the app).
      <a href={view.href} aria-describedby={titleId} className={s.primaryClass} style={s.primary}>
        {ASK_COPY.getAppCta}
      </a>
    );
  const notNow = (
    <button type="button" onClick={onNotNow} className={s.secondaryClass} style={s.secondary}>
      {ASK_COPY.notNow}
    </button>
  );
  // Mounted with the ask, so a screen reader hears the answer to a tap.
  const result = (
    <p
      ref={statusRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      style={{ ...s.result, margin: line ? s.resultMargin : 0, outline: "none" }}
    >
      {line ?? ""}
    </p>
  );

  if (placement === "dm") {
    return (
      <div ref={(el) => void (rootRef.current = el)} style={s.card}>
        {done ? null : (
          <div style={ROW_DM}>
            <p id={titleId} style={s.title}>
              {view.title}
            </p>
            {action}
            {notNow}
          </div>
        )}
        {result}
      </div>
    );
  }

  const card = (
    <section
      ref={(el) => void (rootRef.current = el)}
      aria-labelledby={done ? undefined : titleId}
      className={placement === "otto" ? "otto-room-section" : undefined}
      style={s.card}
    >
      {done ? null : (
        <>
          <div id={titleId} style={s.title}>
            {view.title}
          </div>
          {view.body ? <p style={s.body}>{view.body}</p> : null}
          <div style={ROW}>
            {action}
            {notNow}
          </div>
        </>
      )}
      {result}
    </section>
  );
  // Campus: the confirm banner's slot, so the banner's own outer spacing.
  return placement === "campus" ? <div style={{ padding: "10px 12px 0" }}>{card}</div> : card;
}

type Facts = {
  status: DevicePushStatus;
  snoozedAt: number | null;
  dmShown: boolean;
  now: number;
};

const NONE: PushAskView = { kind: "none" };
const PROBE_KEY = "vibe_push_ask_probe";

/**
 * This placement's stored state, or null when storage can't be read or
 * written (B5: then no ask, since "Not now" and "shown once" couldn't stick).
 */
function readStored(placement: AskPlacement): { snoozedAt: number | null; dmShown: boolean } | null {
  try {
    const ls = window.localStorage;
    const raw = ls.getItem(placement === "dm" ? FIRST_DM_ASK_KEY : PUSH_ASK_KEY);
    ls.setItem(PROBE_KEY, "1");
    ls.removeItem(PROBE_KEY);
    return {
      snoozedAt: snoozedAtFor(raw, placement),
      dmShown: placement === "dm" && dmShownFrom(raw),
    };
  } catch {
    return null;
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Otto: its dark glass (.otto-room-section and .otto-room-action in
// globals.css, keeping their hover) with 44 px targets. Campus: the confirm
// banner's cream card (CampusConfirmBanner.tsx). DM: one line in the
// message-request bar's strip above the composer (MessagesMobile.tsx).

type Look = {
  card: CSSProperties;
  title: CSSProperties;
  body: CSSProperties;
  primary: CSSProperties;
  primaryClass?: string;
  secondary: CSSProperties;
  secondaryClass?: string;
  result: CSSProperties;
  resultMargin: string;
};

const SANS = "DM Sans, sans-serif";

const buttonBase: CSSProperties = {
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const ROW: CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const ROW_DM: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const STYLES: Record<AskPlacement, Look> = {
  otto: {
    card: {},
    title: {
      fontFamily: "Fraunces, serif",
      fontSize: 16,
      fontWeight: 700,
      color: "#FAF7F2",
      letterSpacing: "-0.2px",
    },
    body: {
      margin: "4px 0 0",
      fontFamily: SANS,
      fontSize: 13,
      lineHeight: 1.45,
      color: "rgba(250,247,242,0.72)",
    },
    primaryClass: "otto-room-action otto-room-action--primary",
    primary: { minHeight: 44, padding: "0 18px", fontSize: 13, justifyContent: "center" },
    secondaryClass: "otto-room-action",
    secondary: {
      minHeight: 44,
      padding: "0 14px",
      fontSize: 13,
      background: "transparent",
      borderColor: "transparent",
    },
    result: { fontFamily: SANS, fontSize: 12.5, lineHeight: 1.4, color: "rgba(250,247,242,0.82)" },
    resultMargin: "10px 0 0",
  },
  campus: {
    card: {
      padding: 14,
      borderRadius: 18,
      background: "rgba(255,253,248,0.78)",
      border: "1px solid rgba(255,255,255,0.7)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)",
    },
    title: {
      fontFamily: "Fraunces, serif",
      fontSize: 16,
      fontWeight: 800,
      color: "#1C1C1E",
      letterSpacing: "-0.2px",
    },
    body: { margin: "4px 0 0", fontFamily: SANS, fontSize: 13, lineHeight: 1.4, color: "#5C5853" },
    primary: {
      ...buttonBase,
      background: "#1C1C1E",
      color: "#fff",
      border: "1px solid rgba(0,0,0,0.06)",
    },
    secondary: { ...buttonBase, padding: "0 10px", background: "transparent", color: "#5C5853", border: "none" },
    result: { fontFamily: SANS, fontSize: 12.5, lineHeight: 1.4, color: "#5C5853" },
    resultMargin: "10px 0 0",
  },
  dm: {
    card: {
      flexShrink: 0,
      padding: "6px 12px 6px 16px",
      background: "rgba(255,92,53,0.06)",
      borderTop: "1px solid rgba(28,28,30,0.08)",
      fontFamily: SANS,
    },
    title: {
      flex: "1 1 140px",
      margin: 0,
      fontSize: 13.5,
      fontWeight: 600,
      lineHeight: 1.35,
      color: "#1C1C1E",
    },
    body: {},
    primary: { ...buttonBase, padding: "0 16px", fontSize: 14, background: "#FF5C35", color: "#fff", border: "none" },
    secondary: { ...buttonBase, padding: "0 10px", background: "transparent", color: "#5C5853", border: "none" },
    result: { fontSize: 12.5, lineHeight: 1.4, color: "#5C5853" },
    resultMargin: "6px 0",
  },
};
