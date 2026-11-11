/**
 * Otto's settings blob, `users.otto_settings` (JSON): the allowlist a PATCH
 * may write, how a patch lands on what is stored, and the read-side merge
 * with the defaults. Pulled out of `src/app/api/me/otto/settings/route.ts`
 * (sanitizePatch, the merge) and `src/app/api/me/otto/route.ts`
 * (mergeSettings) on Nov 10, 2026, behaviour unchanged, plus one new key:
 * `look` ({colour, motion}, Otto's look, src/lib/otto/look.ts). The column
 * is JSON, so the new key needs no migration.
 *
 * Pure: relative imports only, no React, no Next, so `node --test` loads it
 * (with the extension hook; settings.test.ts).
 */

import { PUSH_KINDS, type PushKind } from "../push/payload";

import { DEFAULT_LOOK, isOttoColour, isOttoMotion, parseLook, type OttoLook } from "./look";

// ── The read side (GET /api/me/otto) ────────────────────────────────────────

export type OttoSettings = {
  chattiness: "quiet" | "moderate" | "loud";
  rsvp_day_before: boolean;
  mention_pings: boolean;
  milestone_pings: boolean;
  daily_summary: boolean;
  summary_time: string; // "HH:MM"
  unanswered_dm_pings: boolean;
  look: OttoLook;
};

export const DEFAULT_SETTINGS: Readonly<OttoSettings> = Object.freeze({
  chattiness: "moderate",
  rsvp_day_before: true,
  mention_pings: true,
  // Nov 10, 2026 (Wave 2A): off unless the person turns it on. Like counts are
  // the one vanity notice on the board, and nothing sends it yet anyway.
  milestone_pings: false,
  daily_summary: false,
  summary_time: "09:00",
  unanswered_dm_pings: false,
  look: DEFAULT_LOOK,
});

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The stored blob laid over the defaults, every key type-checked. A stored
 *  look goes through parseLook (unknown colour → Ember, unknown motion → Living). */
export function mergeSettings(raw: unknown): OttoSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS, look: { ...DEFAULT_LOOK } };
  const r = raw as Record<string, unknown>;
  const D = DEFAULT_SETTINGS;
  return {
    chattiness: r.chattiness === "quiet" || r.chattiness === "loud" ? r.chattiness : D.chattiness,
    rsvp_day_before: typeof r.rsvp_day_before === "boolean" ? r.rsvp_day_before : D.rsvp_day_before,
    mention_pings: typeof r.mention_pings === "boolean" ? r.mention_pings : D.mention_pings,
    milestone_pings: typeof r.milestone_pings === "boolean" ? r.milestone_pings : D.milestone_pings,
    daily_summary: typeof r.daily_summary === "boolean" ? r.daily_summary : D.daily_summary,
    summary_time:
      typeof r.summary_time === "string" && /^\d{2}:\d{2}$/.test(r.summary_time) ? r.summary_time : D.summary_time,
    unanswered_dm_pings: typeof r.unanswered_dm_pings === "boolean" ? r.unanswered_dm_pings : D.unanswered_dm_pings,
    look: parseLook(r.look),
  };
}

// ── The write side (PATCH /api/me/otto/settings) ────────────────────────────

const VALID_CHATTINESS = new Set(["quiet", "moderate", "loud"]);
// Settings → Appearance (S67 wave 3, contracts C4): the code enum. "system"
// is the product's Auto, "dark" its Night.
const VALID_THEMES = new Set(["light", "dark", "system"]);
const TIME_RE = /^\d{2}:\d{2}$/;
// Longer than any honest list (nine kinds today) but small enough to scan.
const MAX_OFF_ITEMS = 32;
// Kinds a student can switch off through `push.off`: every push kind but
// "mention", which lives in `mention_pings`.
const OFF_KINDS: ReadonlySet<string> = new Set(PUSH_KINDS.filter((k) => k !== "mention"));

export type PushPatch = { previews?: boolean; off?: PushKind[] };
export type LookPatch = Partial<OttoLook>;

export type PatchableSettings = {
  chattiness?: "quiet" | "moderate" | "loud";
  rsvp_day_before?: boolean;
  mention_pings?: boolean;
  milestone_pings?: boolean;
  daily_summary?: boolean;
  summary_time?: string;
  unanswered_dm_pings?: boolean;
  theme?: "light" | "dark" | "system";
  push?: PushPatch;
  look?: LookPatch;
};

/** `push` from the body, or an error. Unknown sub-keys are dropped. */
function sanitizePush(raw: unknown): PushPatch | { error: string } {
  if (!isObject(raw)) return { error: "Invalid push" };
  const out: PushPatch = {};
  if ("previews" in raw) {
    if (typeof raw.previews !== "boolean") return { error: "Invalid push.previews" };
    out.previews = raw.previews;
  }
  if ("off" in raw) {
    if (!Array.isArray(raw.off) || raw.off.length > MAX_OFF_ITEMS) {
      return { error: "Invalid push.off" };
    }
    const wanted = new Set(raw.off.filter((k): k is string => typeof k === "string"));
    // Known kinds only, deduped, in PUSH_KINDS order so the stored list is stable.
    out.off = PUSH_KINDS.filter((k) => OFF_KINDS.has(k) && wanted.has(k));
  }
  return out;
}

/** `look` from the body, or an error. The parseLook rules: one of the ten
 *  colours, "still" or "living"; anything else is refused rather than saved as
 *  the default, so a bad client can't quietly reset a person's pick. Unknown
 *  sub-keys are dropped; a sub-key not sent keeps the stored one. */
function sanitizeLook(raw: unknown): LookPatch | { error: string } {
  if (!isObject(raw)) return { error: "Invalid look" };
  const out: LookPatch = {};
  if ("colour" in raw) {
    if (!isOttoColour(raw.colour)) return { error: "Invalid look.colour" };
    out.colour = raw.colour;
  }
  if ("motion" in raw) {
    if (!isOttoMotion(raw.motion)) return { error: "Invalid look.motion" };
    out.motion = raw.motion;
  }
  return out;
}

/** The allowlist: each known key type-checked, unknown keys dropped. */
export function sanitizePatch(raw: unknown): PatchableSettings | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Body must be an object" };
  const r = raw as Record<string, unknown>;
  const out: PatchableSettings = {};
  for (const [k, v] of Object.entries(r)) {
    switch (k) {
      case "chattiness":
        if (typeof v !== "string" || !VALID_CHATTINESS.has(v)) return { error: "Invalid chattiness" };
        out.chattiness = v as PatchableSettings["chattiness"];
        break;
      case "rsvp_day_before":
      case "mention_pings":
      case "milestone_pings":
      case "daily_summary":
      case "unanswered_dm_pings":
        if (typeof v !== "boolean") return { error: `Invalid ${k}` };
        out[k] = v;
        break;
      case "summary_time":
        if (typeof v !== "string" || !TIME_RE.test(v)) return { error: "Invalid summary_time (HH:MM)" };
        out.summary_time = v;
        break;
      case "theme":
        if (typeof v !== "string" || !VALID_THEMES.has(v)) return { error: "Invalid theme" };
        out.theme = v as PatchableSettings["theme"];
        break;
      case "push": {
        const push = sanitizePush(v);
        if ("error" in push) return push;
        if (Object.keys(push).length > 0) out.push = push;
        break;
      }
      case "look": {
        const look = sanitizeLook(v);
        if ("error" in look) return look;
        if (Object.keys(look).length > 0) out.look = look;
        break;
      }
      default:
        // Unknown key: silently drop rather than 400, so future clients
        // sending new toggles don't break old deployments.
        break;
    }
  }
  return out;
}

/**
 * A sanitized patch laid over the stored blob: a shallow merge (a key the
 * patch doesn't name is kept), then `push` and `look` ONE level deeper, so a
 * patch carrying only `push.previews` keeps the stored `push.off`, and one
 * carrying only `look.motion` keeps the stored colour. `push.off` itself is a
 * full replacement list.
 */
export function applySettingsPatch(stored: unknown, patch: PatchableSettings): Record<string, unknown> {
  const base: Record<string, unknown> = isObject(stored) ? stored : {};
  const next: Record<string, unknown> = { ...base, ...patch };
  if (patch.push) {
    next.push = { ...(isObject(base.push) ? base.push : {}), ...patch.push };
  }
  if (patch.look) {
    next.look = parseLook({ ...(isObject(base.look) ? base.look : {}), ...patch.look });
  }
  return next;
}
