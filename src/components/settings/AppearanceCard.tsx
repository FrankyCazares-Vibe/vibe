"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";
import {
  applyTheme,
  DEFAULT_THEME_PREF,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  watchSystemTheme,
} from "@/lib/theme/theme";

import {
  COPY,
  mountSync,
  nextPref,
  sanitizeStamp,
  sanitizeThemePref,
  statusParts,
  THEME_OPTIONS,
  THEME_SAVED_AT_KEY,
  themeFromSettings,
  type ThemeOption,
  type ThemePref,
} from "./appearance-card-view";

/**
 * Settings → "How Vibe looks" (S67 wave 3, contracts C4, the canvas
 * Appearance board). Three tiles in a radiogroup, Auto / Light / Night, each
 * with a small picture of the theme it picks; the chosen one wears a coral
 * border. Under them, a status line says what paints right now and why.
 *
 * A tap shows at once: the state, the device key (localStorage.vibe_theme)
 * and the page (`applyTheme`) all change before the PATCH to
 * /api/me/otto/settings goes out. A refused save, or a 200 without the saved
 * theme (an older route drops the key and answers `noop`), toasts and reverts
 * to the last confirmed value, the NotificationsCard rule. Taps while a save
 * is in flight queue behind it, latest wins.
 *
 * On mount the account's value wins over the device's (a new phone picks up
 * the choice made elsewhere): `mountSync` in appearance-card-view.ts, tested.
 * Except on a stale render: Next reuses a page's payload on Back/Forward, so
 * the card can remount with the account value from before this device's last
 * pick. The device keeps a server-time stamp (`vibe_theme_at`: the PATCH's
 * `savedAt`, else the page's `renderedAt`) and a render that isn't newer
 * shows the device's value and writes nothing. While the pick is Auto, the card's one watchSystemTheme listener repaints
 * when the phone's mode changes; the same listener keeps the status line
 * honest.
 *
 * `cardStyle` and `title` are SettingsClient's own chrome (CARD_GLASS and
 * SectionTitle), passed in like NotificationsCard's.
 */
export function AppearanceCard({
  initial,
  renderedAt,
  cardStyle,
  title,
}: {
  /** From settings/page.tsx: the saved otto_settings.theme; null when the profile read failed. */
  initial: ThemePref | null;
  /** From settings/page.tsx: server ms taken before the read that produced `initial`. */
  renderedAt: number;
  cardStyle: React.CSSProperties;
  title: React.ReactNode;
}) {
  const [pref, setPref] = useState<ThemePref>(initial ?? DEFAULT_THEME_PREF);
  // The latest state for the next tap without waiting on a render.
  const prefRef = useRef<ThemePref>(pref);
  // What the server last said is saved; a refused save rolls back to it.
  const lastConfirmedRef = useRef<ThemePref>(pref);
  const inFlightRef = useRef(false);
  // A tap made while a save was in flight; sent when that save settles.
  const pendingRef = useRef<ThemePref | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  // The account wins on a new device (C4): mirror it into the device key and
  // paint it when they disagree. A failed profile read (initial null), or a
  // render older than this device's last pick (Back/Forward), shows the
  // device's own value and writes nothing.
  useEffect(() => {
    // A new render arriving mid-save (a refresh) waits: the save settles the
    // screen on what the server confirms, and the render may predate it.
    if (inFlightRef.current) return;
    let device: ThemePref | null = null;
    let deviceAt: number | null = null;
    try {
      device = sanitizeThemePref(localStorage.getItem(THEME_STORAGE_KEY));
      deviceAt = sanitizeStamp(localStorage.getItem(THEME_SAVED_AT_KEY));
    } catch {
      /* unreadable storage reads as "no key" */
    }
    const sync = mountSync(initial, device, DEFAULT_THEME_PREF, renderedAt, deviceAt);
    lastConfirmedRef.current = sync.show;
    prefRef.current = sync.show;
    // The device key only exists after hydration (the server can't see it),
    // so this is the one place the state follows storage rather than a tap.
    setPref(sync.show);
    if (sync.mirror) paint(sync.mirror);
    recordStamp(sync.stamp);
  }, [initial, renderedAt]);

  // The phone's mode, through ONE watchSystemTheme listener: it repaints
  // while the pick is Auto and feeds the status line. The server snapshot is
  // null (it can't know the phone's mode), so the line waits for hydration
  // rather than guess "Light" and correct itself a frame later.
  const subscribeSystem = useCallback(
    (onStoreChange: () => void) =>
      watchSystemTheme(() => {
        if (prefRef.current === "system") applyTheme("system");
        onStoreChange();
      }),
    [],
  );
  const prefersDark = useSyncExternalStore<boolean | null>(
    subscribeSystem,
    systemPrefersDark,
    serverPrefersDark,
  );

  /** What the student sees: state, device key, page. For a tap and for a revert. */
  function show(next: ThemePref) {
    prefRef.current = next;
    setPref(next);
    paint(next);
  }

  function save(next: ThemePref) {
    if (inFlightRef.current) {
      pendingRef.current = next;
      return;
    }
    inFlightRef.current = true;
    void vibeRequest<{ settings?: unknown; savedAt?: unknown } | null>("/api/me/otto/settings", {
      method: "PATCH",
      json: { theme: next },
      failure: COPY.saveFailure,
    }).then((r) => {
      inFlightRef.current = false;
      // A 200 without the saved theme saved nothing (an older route drops
      // keys it doesn't know and answers `noop`), so it counts as a failure.
      const saved = r.ok ? themeFromSettings(r.data?.settings) : null;
      if (saved) {
        lastConfirmedRef.current = saved;
        // The server's time for the save: a Settings render from before it
        // (reused on Back) can no longer mirror over this pick.
        recordStamp(sanitizeStamp(r.ok ? r.data?.savedAt : null));
      } else if (r.ok) toast({ message: COPY.saveFailure, tone: "error" });
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued !== null && queued !== lastConfirmedRef.current) {
        save(queued);
        return;
      }
      // Nothing newer to send: the screen shows what's saved (a refused tap is undone).
      if (prefRef.current !== lastConfirmedRef.current) show(lastConfirmedRef.current);
    });
  }

  function pick(next: ThemePref) {
    if (next === prefRef.current) return;
    // Stamped now, not only when the save lands: Back before the PATCH
    // answers must already read this render as older than the pick.
    recordStamp(renderedAt);
    show(next);
    save(next);
  }

  // Arrows move the choice and the focus, as a native radio group does.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextPref(prefRef.current, e.key);
    if (next === null) return;
    e.preventDefault();
    pick(next);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-pref="${next}"]`)?.focus();
  }

  return (
    <section
      id="appearance"
      style={{ ...cardStyle, padding: 22, marginBottom: 16, scrollMarginTop: 24 }}
    >
      <style>{TILE_CSS}</style>
      {title}
      <p style={INTRO}>{COPY.intro}</p>
      <div ref={groupRef} role="radiogroup" aria-label={COPY.group} onKeyDown={onKeyDown} style={GRID}>
        {THEME_OPTIONS.map((option) => (
          <ThemeTile
            key={option.pref}
            option={option}
            selected={option.pref === pref}
            onPick={() => pick(option.pref)}
          />
        ))}
      </div>
      {/* Mounted with the card, so a screen reader hears the answer to a tap. */}
      <p role="status" aria-live="polite" style={STATUS}>
        {prefersDark === null ? null : <StatusText pref={pref} prefersDark={prefersDark} />}
      </p>
    </section>
  );
}

function serverPrefersDark(): boolean | null {
  return null;
}

/** The device key and the page, for a tap, a revert and the mount mirror.
 *  Blocked storage still repaints: this visit follows the tap even where the
 *  key can't be kept, and the account keeps the choice. */
function paint(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* blocked storage: nothing to keep on this device */
  }
  applyTheme(pref);
}

/** How recent the device key is, in server ms (`vibe_theme_at`). Only ever
 *  moves forward, so a late answer can't make an older render look fresh.
 *  Blocked storage keeps no stamp: the next mount then lets the account win. */
function recordStamp(at: number | null) {
  if (at === null) return;
  try {
    const current = sanitizeStamp(localStorage.getItem(THEME_SAVED_AT_KEY));
    if (current === null || at > current) localStorage.setItem(THEME_SAVED_AT_KEY, String(at));
  } catch {
    /* blocked storage: nothing to keep on this device */
  }
}

/** "Right now: **Night**, because your phone is in dark mode." (the canvas). */
function StatusText({ pref, prefersDark }: { pref: ThemePref; prefersDark: boolean }) {
  const { lead, word, reason } = statusParts(pref, prefersDark);
  return (
    <>
      {lead}
      <strong style={STATUS_WORD}>{word}</strong>
      {reason}
    </>
  );
}

function ThemeTile({
  option,
  selected,
  onPick,
}: {
  option: ThemeOption;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${option.label}, ${option.sub}`}
      // Roving focus: Tab lands on the chosen tile, arrows move from there.
      tabIndex={selected ? 0 : -1}
      data-pref={option.pref}
      className="vibe-theme-tile"
      onClick={onPick}
      style={selected ? TILE_ON : TILE_OFF}
    >
      <ThemePreview pref={option.pref} />
      <span style={TILE_TEXT}>
        <span style={TILE_LABEL}>
          {option.label}
          {selected ? <span aria-hidden="true" style={TILE_DOT} /> : null}
        </span>
        <span style={TILE_SUB}>{option.sub}</span>
      </span>
    </button>
  );
}

// The previews are pictures of each theme, so they keep their own colours
// whatever the page wears: the C0 LITERAL values on purpose, never var() (a
// var(--cream) swatch would go near-black in Night and the Light tile would lie).
type Side = "light" | "dark";
const SWATCH: Record<Side, { paper: string; ink: string; line: string; rim: string }> = {
  light: { paper: "#FAF7F2", ink: "#1C1C1E", line: "rgba(28,28,30,0.12)", rim: "rgba(28,28,30,0.08)" },
  dark: { paper: "#0C0B0B", ink: "#F6F1EA", line: "rgba(255,255,255,0.14)", rim: "rgba(255,255,255,0.10)" },
};
// Night's coral bloom, bottom-left like the feed's.
const NIGHT_BLOOM = "radial-gradient(50px 40px at 0% 100%, rgba(255,92,53,0.6), transparent 70%)";
// The first bar is a title (taller, ink), the rest are lines of text.
const HALF_BARS = ["80%", "100%"];
const FULL_BARS = ["60%", "90%", "70%"];

function ThemePreview({ pref }: { pref: ThemePref }) {
  if (pref === "system") {
    // Half each: the phone decides which one paints.
    return (
      <span aria-hidden="true" style={{ ...PREVIEW, border: `1px solid ${SWATCH.light.rim}` }}>
        <PreviewPage side="light" bars={HALF_BARS} />
        <PreviewPage side="dark" bars={HALF_BARS} />
      </span>
    );
  }
  const side: Side = pref === "dark" ? "dark" : "light";
  return (
    <span aria-hidden="true" style={{ ...PREVIEW, border: `1px solid ${SWATCH[side].rim}` }}>
      <PreviewPage side={side} bars={FULL_BARS} bloom={side === "dark"} />
    </span>
  );
}

function PreviewPage({ side, bars, bloom = false }: { side: Side; bars: string[]; bloom?: boolean }) {
  const s = SWATCH[side];
  return (
    <span
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        background: bloom ? `${NIGHT_BLOOM}, ${s.paper}` : s.paper,
      }}
    >
      {bars.map((width, i) => (
        <span
          key={i}
          style={{ height: i === 0 ? 8 : 6, width, borderRadius: 999, background: i === 0 ? s.ink : s.line }}
        />
      ))}
    </span>
  );
}

const PREVIEW: React.CSSProperties = {
  display: "flex",
  height: 54,
  boxSizing: "border-box",
  borderRadius: 10,
  overflow: "hidden",
};

// The card's own chrome reads the C0 tokens, so it flips with data-theme.
const INTRO: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--ink-2)",
  margin: "-8px 0 14px",
};

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const TILE_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 8,
  boxSizing: "border-box",
  width: "100%",
  minHeight: 44,
  margin: 0,
  borderRadius: 14,
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  textAlign: "left",
  cursor: "pointer",
};

// The chosen tile's 2px coral rim takes a pixel of padding back, so a pick
// doesn't nudge the picture.
const TILE_OFF: React.CSSProperties = {
  ...TILE_BASE,
  padding: 10,
  border: "1px solid rgba(var(--scrim-rgb),0.10)",
  background: "var(--paper)",
};

const TILE_ON: React.CSSProperties = {
  ...TILE_BASE,
  padding: 9,
  border: "2px solid var(--coral)",
  background: "var(--tag-bg)",
  boxShadow: "0 4px 12px color-mix(in srgb, var(--coral) 16%, transparent)",
};

const TILE_TEXT: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };

const TILE_LABEL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

const TILE_DOT: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  background: "var(--coral)",
};

const TILE_SUB: React.CSSProperties = { fontSize: 11, color: "var(--ink-muted)" };

const STATUS: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--ink-muted)",
  margin: "14px 0 0",
  // One line reserved, so the line filling in after mount doesn't push the page.
  minHeight: 18,
};

const STATUS_WORD: React.CSSProperties = { color: "var(--charcoal)", fontWeight: 700 };

// Focus ring per C0; no tap flash on phones.
const TILE_CSS = `
.vibe-theme-tile { -webkit-tap-highlight-color: transparent; transition: border-color 120ms ease, background-color 120ms ease; }
.vibe-theme-tile:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .vibe-theme-tile { transition: none; } }
`;
