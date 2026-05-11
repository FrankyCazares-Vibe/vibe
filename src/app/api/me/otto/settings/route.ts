import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PATCH /api/me/otto/settings
 * Body: partial OttoSettings — any subset of the known keys.
 *
 * Partial JSON merge: read current `users.otto_settings`, deep-merge the
 * incoming patch, write back. Whitelist + type-check each key so the JSON
 * column can't accumulate garbage from a malicious client.
 */

const VALID_CHATTINESS = new Set(["quiet", "moderate", "loud"]);
const TIME_RE = /^\d{2}:\d{2}$/;

type PatchableSettings = {
  chattiness?: "quiet" | "moderate" | "loud";
  rsvp_day_before?: boolean;
  mention_pings?: boolean;
  milestone_pings?: boolean;
  daily_summary?: boolean;
  summary_time?: string;
  unanswered_dm_pings?: boolean;
};

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

  const cur = await supabase
    .from("users")
    .select("otto_settings")
    .eq("id", user.id)
    .maybeSingle();
  if (cur.error) {
    console.error("[otto/settings PATCH read]", cur.error);
    return NextResponse.json({ ok: false, error: cur.error.message }, { status: 500 });
  }
  const next = { ...(cur.data?.otto_settings ?? {}), ...patch };

  const { data, error } = await supabase
    .from("users")
    .update({ otto_settings: next })
    .eq("id", user.id)
    .select("otto_settings")
    .single();
  if (error) {
    console.error("[otto/settings PATCH write]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data.otto_settings });
}
