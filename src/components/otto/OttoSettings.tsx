"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OttoSettings } from "@/app/api/me/otto/route";
import { vibeRequest } from "@/lib/feedback/request";
import { DEFAULT_LOOK, LOOK_STORAGE_KEY, type OttoLook } from "@/lib/otto/look";
import { setOttoLook, useOttoLook } from "@/lib/otto/use-otto-look";

import { OTTO_COLOUR_NAMES, OTTO_MOTION_NAMES, OttoLookSheet, useOttoLookSaver } from "./OttoLookSheet";
import { OttoSection } from "./OttoSection";

type Props = {
  settings: OttoSettings;
};

const CHATTINESS: Array<{ value: OttoSettings["chattiness"]; label: string }> = [
  { value: "quiet", label: "Quiet" },
  { value: "moderate", label: "Moderate" },
  { value: "loud", label: "Loud" },
];

/**
 * Chattiness is a preset that bulk-sets the toggles below. Picking one is
 * a shortcut — fine-tuning individual toggles after is still allowed, the
 * preset just stays selected as a "starting point" label. If the live
 * toggle pattern doesn't match any preset, no preset highlights.
 *
 * "Ping on mentions" is left out of every preset: `mention_pings` is also
 * the one key behind the Mentions switch in Settings → Notifications (plan
 * §8 W3), so picking "Quiet" must not quietly turn mention pushes back on.
 * The "which preset is active" check ignores it for the same reason.
 */
const PRESETS: Record<
  OttoSettings["chattiness"],
  Pick<
    OttoSettings,
    | "rsvp_day_before"
    | "milestone_pings"
    | "daily_summary"
    | "unanswered_dm_pings"
  >
> = {
  quiet: {
    rsvp_day_before: false,
    milestone_pings: false,
    daily_summary: false,
    unanswered_dm_pings: false,
  },
  moderate: {
    rsvp_day_before: true,
    milestone_pings: true,
    daily_summary: false,
    unanswered_dm_pings: false,
  },
  loud: {
    rsvp_day_before: true,
    milestone_pings: true,
    daily_summary: true,
    unanswered_dm_pings: true,
  },
};

const TOGGLES: Array<{ key: keyof OttoSettings; label: string }> = [
  { key: "rsvp_day_before", label: "Ping me about RSVPs the day before" },
  { key: "mention_pings", label: "Ping on mentions" },
  { key: "milestone_pings", label: "Ping on like milestones (10 / 50 / 100)" },
  { key: "daily_summary", label: "Daily summary at 9 AM" },
  { key: "unanswered_dm_pings", label: "Ping on unanswered DMs >24h" },
];

/** Returns the chattiness preset that exactly matches the toggle state, or null. */
function detectPreset(s: OttoSettings): OttoSettings["chattiness"] | null {
  for (const [name, preset] of Object.entries(PRESETS) as Array<
    [OttoSettings["chattiness"], (typeof PRESETS)[OttoSettings["chattiness"]]]
  >) {
    if (
      preset.rsvp_day_before === s.rsvp_day_before &&
      preset.milestone_pings === s.milestone_pings &&
      preset.daily_summary === s.daily_summary &&
      preset.unanswered_dm_pings === s.unanswered_dm_pings
    ) {
      return name;
    }
  }
  return null;
}

/**
 * Settings card with debounced PATCH on change. Each toggle / chattiness
 * choice updates local state immediately (optimistic), then a single
 * trailing-edge PATCH fires 350ms after the last change so a user toggling
 * a few in a row only triggers one network roundtrip.
 *
 * One PATCH can carry several keys (a preset sets five), so a refused save
 * rolls the whole card back to the last settings the server confirmed and
 * shows one toast for that flush. Flushes never overlap: changes made while
 * one is in flight wait for it, so confirmations land in order. Shared by
 * Otto's Room (desktop) and OttoMobile.
 */
export function OttoSettings({ settings }: Props) {
  const [state, setState] = useState<OttoSettings>(settings);
  const pendingRef = useRef<Partial<OttoSettings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The rollback target: the settings the server last confirmed as saved.
  const lastConfirmedRef = useRef<OttoSettings>(settings);
  const inFlightRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function flush() {
    timerRef.current = null;
    // A flush already in flight picks up the queue when it settles.
    if (inFlightRef.current) return;
    const body = pendingRef.current;
    if (Object.keys(body).length === 0) return;
    pendingRef.current = {};
    inFlightRef.current = true;
    void vibeRequest<{ settings?: Partial<OttoSettings> | null }>("/api/me/otto/settings", {
      method: "PATCH",
      json: body,
      failure: "Couldn't save your Otto settings.",
    }).then((r) => {
      inFlightRef.current = false;
      if (r.ok) {
        lastConfirmedRef.current = {
          ...lastConfirmedRef.current,
          ...body,
          ...(r.data.settings ?? {}),
        };
      } else {
        // Undo every key this flush carried, not just the last one tapped.
        // Changes queued behind it stay on screen; they're sent next.
        setState({ ...lastConfirmedRef.current, ...pendingRef.current });
      }
      if (Object.keys(pendingRef.current).length > 0 && !timerRef.current) flush();
    });
  }

  function queuePatch(patch: Partial<OttoSettings>) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 350);
  }

  function setKey<K extends keyof OttoSettings>(k: K, v: OttoSettings[K]) {
    setState((s) => ({ ...s, [k]: v }));
    queuePatch({ [k]: v } as Partial<OttoSettings>);
  }

  function applyPreset(name: OttoSettings["chattiness"]) {
    const preset = PRESETS[name];
    const next: OttoSettings = { ...state, chattiness: name, ...preset };
    setState(next);
    queuePatch({ chattiness: name, ...preset });
  }

  const activePreset = detectPreset(state);

  return (
    <OttoSection eyebrow="How chatty should I be">
      <div className="otto-room-settings">
        <div className="otto-room-chatty">
          <span className="otto-room-chatty-label">Chattiness</span>
          <div className="otto-room-segmented" role="radiogroup" aria-label="Chattiness">
            {CHATTINESS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={activePreset === opt.value}
                className={`otto-room-segment ${
                  activePreset === opt.value ? "is-active" : ""
                }`}
                onClick={() => applyPreset(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {activePreset === null ? (
          <p className="otto-room-chatty-hint">Custom — tweak the toggles below.</p>
        ) : null}

        <ul className="otto-room-toggles">
          {TOGGLES.map((t) => {
            const v = state[t.key] as boolean;
            return (
              <li key={t.key} className="otto-room-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => setKey(t.key, e.target.checked as never)}
                  />
                  <span>{t.label}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <OttoLookRow account={settings.look} />
      </div>
    </OttoSection>
  );
}

/**
 * "Otto's look" (Nov 10, 2026): his colour and Still / Living, picked in
 * OttoLookSheet. The row shows this device's look (use-otto-look.ts). It
 * saves through its own PATCH, never this card's queue, so a chattiness
 * rollback can't undo a look.
 *
 * A device that has never stored a look takes the account's copy once, so a
 * new phone shows the colour picked on the computer. A device with its own
 * pick keeps it: a Settings page Next reuses on Back could carry an older
 * account copy, and that must never undo a newer pick (the theme's lesson).
 */
function OttoLookRow({ account }: { account: OttoLook }) {
  const look = useOttoLook();
  const { pick, saving } = useOttoLookSaver();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    let stored: string | null;
    try {
      stored = window.localStorage.getItem(LOOK_STORAGE_KEY);
    } catch {
      return;
    }
    if (stored !== null) return;
    if (account.colour === DEFAULT_LOOK.colour && account.motion === DEFAULT_LOOK.motion) return;
    setOttoLook(account);
  }, [account]);

  return (
    <div className="otto-room-chatty" data-holds-reload={saving ? "" : "false"}>
      <span className="otto-room-chatty-label">Otto&apos;s look</span>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} style={lookButtonStyle}>
        <span className={`sk-dot sk-${look.colour}`} style={{ width: 18, height: 18 }} aria-hidden />
        <span>
          {OTTO_COLOUR_NAMES[look.colour]} · {OTTO_MOTION_NAMES[look.motion]}
        </span>
        <span aria-hidden style={{ opacity: 0.6 }}>
          ›
        </span>
      </button>
      {open ? <OttoLookSheet onClose={close} onPick={pick} saving={saving} /> : null}
    </div>
  );
}

// The Otto room is dark in both themes, so the row takes the room's own
// light-on-dark ink (the .otto-room-segmented look), not the page tokens.
const lookButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 14px 0 10px",
  borderRadius: 999,
  border: "1px solid rgba(250, 247, 242, 0.14)",
  background: "rgba(250, 247, 242, 0.06)",
  color: "#faf7f2",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
