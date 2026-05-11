"use client";

import { useEffect, useRef, useState } from "react";

import type { OttoSettings } from "@/app/api/me/otto/route";

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
 * Chattiness is a preset that bulk-sets every toggle below. Picking one is
 * a shortcut — fine-tuning individual toggles after is still allowed, the
 * preset just stays selected as a "starting point" label. If the live
 * toggle pattern doesn't match any preset, no preset highlights.
 */
const PRESETS: Record<
  OttoSettings["chattiness"],
  Pick<
    OttoSettings,
    | "rsvp_day_before"
    | "mention_pings"
    | "milestone_pings"
    | "daily_summary"
    | "unanswered_dm_pings"
  >
> = {
  quiet: {
    rsvp_day_before: false,
    mention_pings: true,
    milestone_pings: false,
    daily_summary: false,
    unanswered_dm_pings: false,
  },
  moderate: {
    rsvp_day_before: true,
    mention_pings: true,
    milestone_pings: true,
    daily_summary: false,
    unanswered_dm_pings: false,
  },
  loud: {
    rsvp_day_before: true,
    mention_pings: true,
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
      preset.mention_pings === s.mention_pings &&
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
 */
export function OttoSettings({ settings }: Props) {
  const [state, setState] = useState<OttoSettings>(settings);
  const pendingRef = useRef<Partial<OttoSettings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function queuePatch(patch: Partial<OttoSettings>) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const body = pendingRef.current;
      pendingRef.current = {};
      fetch("/api/me/otto/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch((e) => console.error("[otto/settings PATCH]", e));
    }, 350);
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
      </div>
    </OttoSection>
  );
}
