import { NextResponse } from "next/server";

import { PUSH_KINDS, type PushKind } from "@/lib/push/payload";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * PATCH /api/me/otto/settings
 * Body: partial OttoSettings — any subset of the known keys, plus
 * `push: {previews?: boolean, off?: PushKind[]}` from Settings →
 * Notifications (plan §8 W4).
 *
 * Partial JSON merge: read current `users.otto_settings`, lay the patch's
 * top-level keys over it (a shallow merge: a key the patch doesn't name is
 * kept), then merge `push` ONE level deeper, so a patch carrying only
 * `push.previews` keeps the stored `push.off`. `push.off` itself is a full
 * replacement list, never add/remove ops. Whitelist + type-check each key so
 * the JSON column can't accumulate garbage from a malicious client.
 *
 * Mentions have one key, `mention_pings` (W3, critic-w3 item 5): "mention"
 * is dropped from any incoming `push.off`, the same way unknown kinds are
 * (the send-time reader, parsePushPrefs, ignores those too). The read +
 * write isn't atomic, so two tabs saving at once can lose one; the limiter
 * (120 per 10 minutes) only keeps a stuck client from hammering the row.
 */

const VALID_CHATTINESS = new Set(["quiet", "moderate", "loud"]);
const TIME_RE = /^\d{2}:\d{2}$/;
const SETTINGS_LIMIT = { limit: 120, windowSec: 600 };
// Longer than any honest list (nine kinds today) but small enough to scan.
const MAX_OFF_ITEMS = 32;
// Kinds a student can switch off through `push.off`: every push kind but
// "mention", which lives in `mention_pings`.
const OFF_KINDS: ReadonlySet<string> = new Set(PUSH_KINDS.filter((k) => k !== "mention"));

type PushPatch = { previews?: boolean; off?: PushKind[] };

type PatchableSettings = {
  chattiness?: "quiet" | "moderate" | "loud";
  rsvp_day_before?: boolean;
  mention_pings?: boolean;
  milestone_pings?: boolean;
  daily_summary?: boolean;
  summary_time?: string;
  unanswered_dm_pings?: boolean;
  push?: PushPatch;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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

function sanitizePatch(raw: unknown): PatchableSettings | { error: string } {
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
      case "push": {
        const push = sanitizePush(v);
        if ("error" in push) return push;
        if (Object.keys(push).length > 0) out.push = push;
        break;
      }
      default:
        // Unknown key — silently drop rather than 400, so future clients
        // sending new toggles don't break old deployments.
        break;
    }
  }
  return out;
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const patch = sanitizePatch(raw);
  if ("error" in patch) {
    return NextResponse.json({ ok: false, error: patch.error }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, settings: null, noop: true });
  }

  // After validation and the no-op answer, so only a real save spends the budget.
  const rl = await rateLimit(`otto-settings:${user.id}`, SETTINGS_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many settings changes. Try again in a few minutes.");

  // otto_settings is private (no RLS read); read + write-return go through
  // the service role scoped to the signed-in user's id.
  const service = createSupabaseServiceClient();
  const cur = await service
    .from("users")
    .select("otto_settings")
    .eq("id", user.id)
    .maybeSingle();
  if (cur.error) {
    console.error("[otto/settings PATCH read]", cur.error);
    return NextResponse.json({ ok: false, error: "Could not load settings" }, { status: 500 });
  }
  const stored: Record<string, unknown> = isObject(cur.data?.otto_settings)
    ? cur.data.otto_settings
    : {};
  const next: Record<string, unknown> = { ...stored, ...patch };
  if (patch.push) {
    next.push = { ...(isObject(stored.push) ? stored.push : {}), ...patch.push };
  }

  const { data, error } = await service
    .from("users")
    .update({ otto_settings: next })
    .eq("id", user.id)
    .select("otto_settings")
    .single();
  if (error) {
    console.error("[otto/settings PATCH write]", error);
    return NextResponse.json({ ok: false, error: "Could not save settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data.otto_settings });
}
