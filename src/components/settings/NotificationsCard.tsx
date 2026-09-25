"use client";

import { useEffect, useRef, useState } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import { storeUrlFor } from "@/lib/native/store-links";
import {
  readDevicePush,
  turnOffDevicePush,
  turnOnDevicePush,
  type DevicePushStatus,
} from "@/lib/pwa/device-push";
import { useIsStandalone, usePlatform } from "@/lib/pwa/use-standalone";

import {
  applyFlips,
  COPY,
  deviceView,
  flipPrefs,
  KIND_GROUPS,
  kindOn,
  patchForFlips,
  prefsFromSettings,
  turnOnLine,
  type NotificationPrefs,
  type PrefFlip,
} from "./notifications-card-view";

/**
 * Settings → Notifications (plan §8 wave 3′a, batch A). Two halves, said
 * apart (W1): "Notifications on this device" (the OS permission and this
 * device's registration, through src/lib/pwa/device-push.ts) and "What to
 * send" (account-wide switches in users.otto_settings). The rules and copy
 * live in notifications-card-view.ts, which is unit-tested.
 *
 * The card renders NOTHING until the device read comes back, and nothing at
 * all when push isn't available for this account (W2): during the dark
 * launch only founders on the allowlist ever see it. It reads again whenever
 * the page comes back into view, since the student may have just changed the
 * setting in the phone's Settings app.
 *
 * `cardStyle` and `title` are SettingsClient's own chrome (CARD_GLASS and
 * SectionTitle), passed in so this card looks like its neighbours without
 * SettingsClient exporting its internals.
 */
export function NotificationsCard({
  pushPrefs,
  cardStyle,
  title,
}: {
  /** From settings/page.tsx; null when the profile read failed. */
  pushPrefs: NotificationPrefs | null;
  cardStyle: React.CSSProperties;
  title: React.ReactNode;
}) {
  // null = still reading: render nothing (W2, no flash of a card that hides).
  const [status, setStatus] = useState<DevicePushStatus | null>(null);
  // What the switches were last confirmed as, kept here so "What to send"
  // comes back with the student's latest saved choices if the card hides
  // and shows again (not the page's first answer, which a full `off` list
  // saved from it would then overwrite).
  const [confirmedPrefs, setConfirmedPrefs] = useState<NotificationPrefs | null>(pushPrefs);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const statusRef = useRef<DevicePushStatus | null>(null);
  const busyRef = useRef(false);
  // Bumped by every read and every tap, so a slow read that started before
  // a tap can't land on top of the tap's answer.
  const epochRef = useRef(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const scrolledRef = useRef(false);
  const platform = usePlatform();
  const standalone = useIsStandalone();

  useEffect(() => {
    let alive = true;
    const read = () => {
      // Mid-tap (an Android permission dialog hides the page for a moment),
      // the tap's own answer is the one to show.
      if (busyRef.current) return;
      const epoch = ++epochRef.current;
      void readDevicePush().then((next) => {
        if (!alive || epoch !== epochRef.current || busyRef.current) return;
        // Once the card shows, a background re-read answering "hidden" is
        // far more often a failed read (a phone waking up) than push being
        // switched off, so it keeps what's on screen. A tap's own answer
        // can still hide the card (finish, below).
        const current = statusRef.current;
        if (next.kind === "hidden" && current !== null && current.kind !== "hidden") return;
        statusRef.current = next;
        setStatus(next);
      });
    };
    read();
    const onVisibility = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const shown = status !== null && status.kind !== "hidden";

  // The card arrives after the page does, so the browser's own jump to
  // /settings#notifications found nothing to jump to: do it once, here.
  useEffect(() => {
    if (!shown || scrolledRef.current) return;
    scrolledRef.current = true;
    if (window.location.hash === "#notifications") {
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [shown]);

  if (status === null || status.kind === "hidden") return null;

  const begin = () => {
    busyRef.current = true;
    epochRef.current += 1;
    setBusy(true);
    setLine(null);
  };
  const finish = (next: DevicePushStatus, text: string | null) => {
    busyRef.current = false;
    statusRef.current = next;
    setBusy(false);
    setStatus(next);
    setLine(text);
  };

  const onDeviceSwitch = () => {
    if (busyRef.current) return;
    if (status.kind === "off") {
      // FIRST, before any state change or await: iOS only shows the
      // permission prompt when it starts inside the tap itself.
      const pending = turnOnDevicePush();
      begin();
      pending.then(
        (r) => finish(r.ok ? { kind: "on" } : r.status, turnOnLine(r)),
        () => finish(status, COPY.turnOnFailed),
      );
    } else if (status.kind === "on") {
      const pending = turnOffDevicePush();
      begin();
      pending.then(
        (off) => {
          if (off) finish({ kind: "off" }, COPY.turnedOff);
          // Half-done is possible (the server forgot it, the browser didn't):
          // show whatever the device says now.
          else void readDevicePush().then((now) => finish(now, COPY.turnOffFailed));
        },
        () => finish(status, COPY.turnOffFailed),
      );
    }
  };

  const view = deviceView(status, { platform, standalone, storeUrl: storeUrlFor(platform) });

  return (
    <section
      id="notifications"
      ref={sectionRef}
      style={{ ...cardStyle, padding: 22, marginBottom: 16, scrollMarginTop: 24 }}
    >
      <style>{SWITCH_CSS}</style>
      {title}

      <div style={BOX}>
        <SwitchRow
          id="notif-device"
          label={COPY.deviceLabel}
          hint={view.kind === "note" ? undefined : COPY.deviceHint}
          control={
            view.kind === "switch" ? (
              <Switch
                on={view.on}
                labelledBy="notif-device-label"
                describedBy="notif-device-hint"
                busy={busy}
                onToggle={onDeviceSwitch}
              />
            ) : view.kind === "blocked" ? (
              <span style={BLOCKED_PILL}>{COPY.blocked}</span>
            ) : null
          }
        />
        {view.kind === "blocked" ? <p style={NOTE}>{view.help}</p> : null}
        {view.kind === "note" ? (
          <>
            <p style={NOTE}>{view.text}</p>
            {view.link ? (
              <a href={view.link.href} style={STORE_LINK}>
                {view.link.label} <span aria-hidden style={{ marginLeft: 6 }}>→</span>
              </a>
            ) : null}
          </>
        ) : null}
      </div>
      {/* Mounted with the card, so a screen reader hears the answer to a tap. */}
      <p role="status" aria-live="polite" style={RESULT}>
        {line ?? ""}
      </p>

      <h3 style={SUBTITLE}>{COPY.whatTitle}</h3>
      <p style={DESCRIPTION}>{COPY.whatHint}</p>
      {confirmedPrefs ? (
        <WhatToSend initial={confirmedPrefs} onConfirmed={setConfirmedPrefs} />
      ) : (
        <p style={DESCRIPTION}>{COPY.prefsLoadFailed}</p>
      )}
    </section>
  );
}

/**
 * The account-wide switches. Saves the OttoSettings way: each tap shows at
 * once (optimistic), one PATCH goes 350 ms after the last tap, and flushes
 * never overlap. Taps are queued one by one and each PATCH is rebuilt from
 * what the server last confirmed, so a refused save rolls back only its own
 * taps (with one toast); taps queued behind it stay on screen and go next,
 * without the refused ones.
 */
function WhatToSend({
  initial,
  onConfirmed,
}: {
  initial: NotificationPrefs;
  /** Every confirmed save, so the card can remount with it. */
  onConfirmed: (saved: NotificationPrefs) => void;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  // The latest state for the next tap without waiting on a render.
  const prefsRef = useRef<NotificationPrefs>(initial);
  // Taps not sent yet, in order.
  const queueRef = useRef<PrefFlip[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server last said is saved: every PATCH is built on it, and a
  // refused one rolls back to it (plus the taps still queued).
  const lastConfirmedRef = useRef<NotificationPrefs>(initial);
  const inFlightRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function show(next: NotificationPrefs) {
    prefsRef.current = next;
    setPrefs(next);
  }

  function flush() {
    timerRef.current = null;
    // A flush already in flight picks up the queue when it settles.
    if (inFlightRef.current) return;
    const flips = queueRef.current;
    if (flips.length === 0) return;
    queueRef.current = [];
    inFlightRef.current = true;
    void vibeRequest<{ settings?: unknown } | null>("/api/me/otto/settings", {
      method: "PATCH",
      json: patchForFlips(lastConfirmedRef.current, flips),
      failure: COPY.saveFailure,
    }).then((r) => {
      inFlightRef.current = false;
      // A 200 without the saved blob saved nothing (an older route drops
      // keys it doesn't know and answers `noop`), so it counts as a failure.
      const saved = r.ok ? prefsFromSettings(r.data?.settings) : null;
      if (saved) {
        lastConfirmedRef.current = saved;
        onConfirmed(saved);
      } else if (r.ok) {
        toast({ message: COPY.saveFailure, tone: "error" });
      }
      // Success: what's saved, plus the taps still queued. Failure: this
      // flush's taps undone, the queued ones kept (they're sent next).
      show(applyFlips(lastConfirmedRef.current, queueRef.current));
      if (queueRef.current.length > 0 && !timerRef.current) flush();
    });
  }

  function flip(f: PrefFlip) {
    show(flipPrefs(prefsRef.current, f));
    queueRef.current = [...queueRef.current, f];
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 350);
  }

  return (
    <>
      {KIND_GROUPS.map((group) => (
        <div
          key={group.title}
          role="group"
          aria-labelledby={`notif-group-${group.title}`}
          style={{ marginTop: 12 }}
        >
          <div id={`notif-group-${group.title}`} style={GROUP_TITLE}>
            {group.title}
          </div>
          <div style={BOX}>
            {group.rows.map((row, i) => (
              <SwitchRow
                key={row.kind}
                id={`notif-${row.kind}`}
                label={row.label}
                hint={row.hint}
                divider={i > 0}
                control={
                  <Switch
                    on={kindOn(prefs, row.kind)}
                    labelledBy={`notif-${row.kind}-label`}
                    describedBy={row.hint ? `notif-${row.kind}-hint` : undefined}
                    onToggle={() => flip({ kind: row.kind, on: !kindOn(prefsRef.current, row.kind) })}
                  />
                }
              />
            ))}
          </div>
        </div>
      ))}
      <div style={{ ...BOX, marginTop: 16 }}>
        <SwitchRow
          id="notif-previews"
          label={COPY.previewsLabel}
          hint={COPY.previewsHint}
          control={
            <Switch
              on={prefs.previews}
              labelledBy="notif-previews-label"
              describedBy="notif-previews-hint"
              onToggle={() => flip({ previews: !prefsRef.current.previews })}
            />
          }
        />
      </div>
    </>
  );
}

/** Label and hint on the left, the control on the right (the BlockedRow layout). */
function SwitchRow({
  id,
  label,
  hint,
  control,
  divider,
}: {
  id: string;
  label: string;
  hint?: string;
  control: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        padding: "4px 0",
        borderTop: divider ? "1px solid rgba(28,28,30,0.06)" : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div id={`${id}-label`} style={ROW_LABEL}>
          {label}
        </div>
        {hint ? (
          <div id={`${id}-hint`} style={ROW_HINT}>
            {hint}
          </div>
        ) : null}
      </div>
      {control}
    </div>
  );
}

/**
 * A cream on/off switch: a real button with role="switch", named by its row
 * (aria-labelledby) and described by the row's hint. The button is 52×44 so
 * the hit area clears 44 px; the visible track is 44×26. While a tap is being
 * answered it stays focusable but inert (aria-disabled + aria-busy).
 */
function Switch({
  on,
  labelledBy,
  describedBy,
  busy = false,
  onToggle,
}: {
  on: boolean;
  labelledBy: string;
  describedBy?: string;
  busy?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : onToggle}
      className="vibe-notif-switch"
      style={{
        appearance: "none",
        border: "none",
        background: "transparent",
        padding: 0,
        margin: "0 -4px 0 0",
        width: 52,
        height: 44,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: busy ? "wait" : "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        aria-hidden
        className="vibe-notif-track"
        style={{
          position: "relative",
          width: 44,
          height: 26,
          borderRadius: 999,
          background: on ? "#FF5C35" : "rgba(28,28,30,0.28)",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span
          className="vibe-notif-thumb"
          style={{
            position: "absolute",
            top: 3,
            left: 3,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "#FFFFFF",
            boxShadow: "0 1px 3px rgba(28,28,30,0.28)",
            transform: on ? "translateX(18px)" : "none",
          }}
        />
      </span>
    </button>
  );
}

// The focus ring sits on the visible track (the button around it is only
// there for the hit area); motion is dropped for students who asked for less.
const SWITCH_CSS = `
.vibe-notif-switch { outline: none; }
.vibe-notif-switch:focus-visible .vibe-notif-track { outline: 2px solid #FF5C35; outline-offset: 3px; }
.vibe-notif-track, .vibe-notif-thumb { transition: background-color 160ms ease, transform 160ms ease; }
@media (prefers-reduced-motion: reduce) {
  .vibe-notif-track, .vibe-notif-thumb { transition: none; }
}
`;

// The BlockedRow look (SettingsClient), holding a stack of rows.
const BOX: React.CSSProperties = {
  padding: "2px 10px 2px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(28,28,30,0.06)",
};

const ROW_LABEL: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  color: "#1C1C1E",
  lineHeight: 1.3,
};

const ROW_HINT: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  color: "#8A8580",
  lineHeight: 1.4,
  marginTop: 2,
};

const NOTE: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  color: "#5C5853",
  lineHeight: 1.5,
  margin: "2px 0 10px",
};

const RESULT: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  color: "#5C5853",
  lineHeight: 1.5,
  margin: "8px 2px 0",
};

const SUBTITLE: React.CSSProperties = {
  fontFamily: "Fraunces, serif",
  fontSize: 17,
  fontWeight: 800,
  color: "#1C1C1E",
  letterSpacing: "-0.01em",
  margin: "18px 0 4px",
};

const DESCRIPTION: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  color: "#5C5853",
  lineHeight: 1.5,
  margin: 0,
};

const GROUP_TITLE: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#8A8580",
  margin: "0 0 6px 2px",
};

const BLOCKED_PILL: React.CSSProperties = {
  flexShrink: 0,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(184,48,48,0.25)",
  background: "rgba(184,48,48,0.06)",
  color: "#B83030",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 700,
};

// The orange pill (Campus tour's "Replay tour"), tall enough to tap.
const STORE_LINK: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  margin: "0 0 10px",
  padding: "0 18px",
  borderRadius: 999,
  background: "#FF5C35",
  color: "#FAF7F2",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 6px 18px rgba(255, 92, 53, 0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
};
