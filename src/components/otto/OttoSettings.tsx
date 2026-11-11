"use client";

import "./kit/sky.css";
import "./kit/desk.css";
import "./kit/more.css";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { OttoSettings } from "@/app/api/me/otto/route";
import { vibeRequest } from "@/lib/feedback/request";
import { DEFAULT_LOOK, LOOK_STORAGE_KEY, type OttoLook } from "@/lib/otto/look";
import { setOttoLook, useOttoLook } from "@/lib/otto/use-otto-look";

import { OTTO_COLOUR_NAMES, OTTO_MOTION_NAMES, OttoLookSheet, useOttoLookSaver } from "./OttoLookSheet";
import { OttoPlanet } from "./planet/OttoPlanet";

/**
 * Otto's Settings tab on the desk (Nov 10, 2026, the Otto build's Wave 2A;
 * board D4 "Numbers and settings"): How chatty (three steps, the chosen one
 * ink with a tick), Notices (switches that show on/off by shape), and Otto's
 * look. Today's card lives on as OttoSettingsLegacy.tsx for `OTTO_DESK=off`.
 * The board's "Delete all chats" row waits for chats (Wave 3).
 *
 * HONEST ABOUT WHAT IS SENT. Of these switches only mentions reach anyone
 * today (`mention_pings`, the same key as Settings → Notifications). The rest
 * are kept for when those notices exist, and the card says so in one line
 * rather than letting a switch promise a message. Like milestones are listed
 * and off by default (DEFAULT_SETTINGS): the only vanity notice here.
 *
 * Saving is the old card's: each change shows at once, one trailing PATCH
 * 350ms after the last; a refused save rolls the whole flush back to what the
 * server last confirmed; flushes never overlap.
 */

type Props = { settings: OttoSettings };
type Chatty = OttoSettings["chattiness"];
type PresetKeys = "rsvp_day_before" | "milestone_pings" | "daily_summary" | "unanswered_dm_pings";

const CHATTINESS: Array<{ value: Chatty; label: string; say: string }> = [
  { value: "quiet", label: "Quiet", say: "Every notice below off. Mentions keep their own switch." },
  { value: "moderate", label: "Moderate", say: "RSVP reminders on. Like milestones and the summary off." },
  { value: "loud", label: "Loud", say: "Every notice below on." },
];

/**
 * A preset bulk-sets the switches; fine-tuning after is fine, and no step
 * lights when the switches match none. Mentions are in no preset: that key is
 * also Settings → Notifications' Mentions switch, so Quiet mustn't flip it.
 * Moderate, the default, leaves like milestones off, matching the defaults.
 */
const PRESETS: Record<Chatty, Pick<OttoSettings, PresetKeys>> = {
  quiet: { rsvp_day_before: false, milestone_pings: false, daily_summary: false, unanswered_dm_pings: false },
  moderate: { rsvp_day_before: true, milestone_pings: false, daily_summary: false, unanswered_dm_pings: false },
  loud: { rsvp_day_before: true, milestone_pings: true, daily_summary: true, unanswered_dm_pings: true },
};

const NOTICES: Array<{ key: PresetKeys | "mention_pings"; label: string }> = [
  { key: "rsvp_day_before", label: "RSVP reminders, the day before" },
  { key: "mention_pings", label: "When I’m mentioned" },
  { key: "milestone_pings", label: "Like milestones (10, 50, 100)" },
  { key: "daily_summary", label: "A daily summary at 9 AM" },
  { key: "unanswered_dm_pings", label: "DMs still unanswered after a day" },
];

/** The preset the switches match exactly, or null. */
function detectPreset(s: OttoSettings): Chatty | null {
  for (const { value } of CHATTINESS) {
    const p = PRESETS[value];
    if (
      p.rsvp_day_before === s.rsvp_day_before &&
      p.milestone_pings === s.milestone_pings &&
      p.daily_summary === s.daily_summary &&
      p.unanswered_dm_pings === s.unanswered_dm_pings
    ) {
      return value;
    }
  }
  return null;
}

export function OttoSettings({ settings }: Props) {
  const [state, setState] = useState<OttoSettings>(settings);
  const pendingRef = useRef<Partial<OttoSettings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConfirmedRef = useRef<OttoSettings>(settings);
  const inFlightRef = useRef(false);
  const chattyId = useId();
  const noticesId = useId();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function flush() {
    timerRef.current = null;
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
        lastConfirmedRef.current = { ...lastConfirmedRef.current, ...body, ...(r.data.settings ?? {}) };
      } else {
        // Undo every key this flush carried; changes queued behind it stay and go next.
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

  function setKey(k: PresetKeys | "mention_pings", v: boolean) {
    setState((s) => ({ ...s, [k]: v }));
    queuePatch({ [k]: v });
  }

  function applyPreset(name: Chatty) {
    setState((s) => ({ ...s, chattiness: name, ...PRESETS[name] }));
    queuePatch({ chattiness: name, ...PRESETS[name] });
  }

  const active = detectPreset(state);
  const say = CHATTINESS.find((c) => c.value === active)?.say ?? "Your own mix. Tweak the switches below.";

  return (
    <div className="dk-body otto-settings">
      <div className="dk-sec">
        <h3 id={chattyId}>How chatty</h3>
      </div>
      <div className="tx-host dk-card">
        <i className="tx tx-paper" aria-hidden="true" />
        <div className="dk-seg" role="radiogroup" aria-labelledby={chattyId}>
          {CHATTINESS.map((opt) => {
            const on = active === opt.value;
            return (
              <button key={opt.value} type="button" role="radio" aria-checked={on} onClick={() => applyPreset(opt.value)}>
                {on ? (
                  <svg className="dk-tick" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5l3.2 3.2L13 4.8" />
                  </svg>
                ) : null}
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="dk-seg-say">{say}</p>
      </div>

      <div className="dk-sec">
        <h3 id={noticesId}>Notices</h3>
      </div>
      <div className="tx-host dk-card list" role="group" aria-labelledby={noticesId}>
        <i className="tx tx-paper" aria-hidden="true" />
        {NOTICES.map((n) => {
          const on = state[n.key];
          return (
            // A label around the switch: tapping the words presses it too, and names it.
            <label key={n.key} className="dk-sw-row">
              <span>{n.label}</span>
              <button type="button" role="switch" aria-checked={on} className="dk-sw" onClick={() => setKey(n.key, !on)} />
            </label>
          );
        })}
        <p className="dk-sw-foot">Only mentions are sent today. The other switches keep your choice for later.</p>
      </div>

      <div className="tx-host dk-card list">
        <i className="tx tx-paper" aria-hidden="true" />
        <OttoLookRow account={settings.look} />
      </div>
    </div>
  );
}

/**
 * "Otto's look" (Nov 10, 2026): his colour and Still / Living, picked in
 * OttoLookSheet. The row shows this device's look (use-otto-look.ts) and his
 * still planet in it. It saves through its own PATCH, never this card's
 * queue, so a chattiness rollback can't undo a look.
 *
 * A device that has never stored a look takes the account's copy once, so a
 * new phone shows the colour picked on the computer. A device with its own
 * pick keeps it: an older account copy must never undo a newer pick.
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
    <div data-holds-reload={saving ? "" : "false"}>
      <button type="button" className="dk-row" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="dk-row-ic dk-look-ic" aria-hidden="true">
          <OttoPlanet size={28} colour={look.colour} />
        </span>
        <span className="dk-row-tx">
          <b>Otto&apos;s look</b>
          <span>
            {OTTO_COLOUR_NAMES[look.colour]} · {OTTO_MOTION_NAMES[look.motion]}
          </span>
        </span>
        <span className="dk-row-go" aria-hidden="true">
          <svg className="dk-ico" viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>
      {open ? <OttoLookSheet onClose={close} onPick={pick} saving={saving} /> : null}
    </div>
  );
}
