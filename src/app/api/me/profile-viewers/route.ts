import { NextResponse } from "next/server";

import { loadProfileViewers } from "@/lib/metrics/profile-viewers";
import { requirePlus } from "@/lib/premium/require-plus";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

/**
 * GET /api/me/profile-viewers?limit&offset — the full "Who viewed you" list,
 * ninety days back, paginated.
 *
 * The paid half of the profile-views screen, split out because
 * /api/me/profile-views has a real free half (the counts) and so cannot just
 * 403 — see the note on `requirePlus` in src/lib/premium/require-plus.ts. This
 * route has no free half: identities are the whole payload, so a free account
 * gets the 403 and nothing else, and the client turns `code: "plus_required"`
 * into "That's a Vibe+ feature." plus a See Vibe+ action
 * (src/lib/feedback/failure-copy.ts).
 *
 * Both this route and the `recent` block of /api/me/profile-views are pages of
 * ONE loader (src/lib/metrics/profile-viewers.ts) — same window, same dedupe,
 * same ordering — so "Show more" continues the list it is under instead of
 * quietly repeating or skipping someone.
 *
 * Check order, per the wave plan (handoffs/2026-09-14-wave-plan-metrics-screens.md C2):
 * auth → rateLimit → entitlement. Rate-limiting before the entitlement read
 * keeps a signed-in stranger from using this as a free way to hammer the
 * service-role entitlements lookup; it is an identity list, which is the
 * enumeration surface the design doc requires a limiter on.
 *
 * A refused read is a 500. `users: []` here would read as "nobody has looked
 * at you" to the one person paying to find out.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`profile-viewers:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl);

  const plusGate = await requirePlus(user.id);
  if (plusGate) return plusGate;

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const page = await loadProfileViewers(supabase, user.id, { limit, offset });
  if (!page) {
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    users: page.users,
    total: page.total,
    has_more: page.has_more,
    // Clients page on this, not on users.length — see ProfileViewersPage.
    next_offset: page.next_offset,
  });
}
