import { NextResponse } from "next/server";

import { applySettingsPatch, sanitizePatch } from "@/lib/otto/settings";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * PATCH /api/me/otto/settings
 * Body: partial OttoSettings — any subset of the known keys, plus
 * `push: {previews?: boolean, off?: PushKind[]}` from Settings →
 * Notifications (plan §8 W4) and `theme: "light" | "dark" | "system"` from
 * Settings → Appearance (S67 wave 3), and `look: {colour?, motion?}`, Otto's
 * look, from the Otto page's look sheet (Nov 10, 2026; src/lib/otto/look.ts).
 * Answer: `{ok, settings, savedAt}` (the saved blob, server ms after the
 * write), or `{ok, settings: null, noop: true}` when nothing valid was sent.
 *
 * Partial JSON merge: read current `users.otto_settings`, lay the patch's
 * top-level keys over it (a shallow merge: a key the patch doesn't name is
 * kept), then merge `push` ONE level deeper, so a patch carrying only
 * `push.previews` keeps the stored `push.off`. `push.off` itself is a full
 * replacement list, never add/remove ops. `look` merges one level deeper the
 * same way. Whitelist + type-check each key so the JSON column can't
 * accumulate garbage from a malicious client. The allowlist and the merge
 * live in src/lib/otto/settings.ts (sanitizePatch, applySettingsPatch).
 *
 * Mentions have one key, `mention_pings` (W3, critic-w3 item 5): "mention"
 * is dropped from any incoming `push.off`, the same way unknown kinds are
 * (the send-time reader, parsePushPrefs, ignores those too). The read +
 * write isn't atomic, so two tabs saving at once can lose one; the limiter
 * (120 per 10 minutes) only keeps a stuck client from hammering the row.
 */

const SETTINGS_LIMIT = { limit: 120, windowSec: 600 };

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
  // A stored blob that isn't an object is treated as empty (applySettingsPatch).
  const next = applySettingsPatch(cur.data?.otto_settings, patch);

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

  // `savedAt` is the server's clock AFTER the write. The Appearance card
  // keeps it as the device's last pick and compares it with the Settings
  // page's own `renderedAt` (also server time, taken before its read), so a
  // page Next reuses on Back can't mirror a value older than the pick.
  return NextResponse.json({ ok: true, settings: data.otto_settings, savedAt: Date.now() });
}
