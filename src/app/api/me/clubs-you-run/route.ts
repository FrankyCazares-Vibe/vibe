import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import type { ClubYouRun } from "@/lib/orgs/club-switch";
import { loadVisibleOrgCards } from "@/lib/orgs/following";
import { storedClubTitle } from "@/lib/profile/club-flair";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RunRow = { org_id: string; role: unknown; title: unknown };

const LIST_LIMIT = { limit: 60, windowSec: 60 };
/** Nobody runs this many clubs; the cap keeps the card read's URL short. */
const RUN_MAX = 50;
/** Pending requests read at most, across every club I run, counted in code. */
const REQUESTS_MAX = 1000;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/me/clubs-you-run — the clubs I'm the owner or an officer of, for
 * the phone's club switcher, the Profile tab's dot and the desktop "Clubs you
 * run" lines (wave 2, WAVE2-DESIGN.md C2). Only ever the signed-in person's
 * own rows.
 *
 * WHICH CLIENT. My memberships are a SERVICE read filtered to my id, the same
 * as `/api/me/clubs`. The pending requests are a service read too, limited to
 * clubs that read just proved I run, minus anyone in a block pair with me
 * (as `/api/orgs/[slug]/requests` lists them); only their number leaves the
 * server, never who asked. Clubs Vibe hid (the test clubs among them) are left out:
 * there is no page to switch to.
 *
 * `requests` is null when its read failed, so the dot and "n to review" stay
 * off rather than say 0 for a club that has people waiting.
 *
 * RESPONSES
 *   200 {ok, clubs:[{org_id, handle, name, logo_url, role, title, requests}]}
 *       owner rows first, then by name
 *   401 unauthorized · 429 · 500 request_failed
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`me-clubs-run:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const service = createSupabaseServiceClient();
  const runRes = await service
    .from("org_members")
    .select("org_id, role, title")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(RUN_MAX);
  if (runRes.error) {
    console.error("[me/clubs-you-run read]", runRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const rows = ((runRes.data ?? []) as RunRow[]).filter((r) => r.role === "owner" || r.role === "admin");
  if (rows.length === 0) return NextResponse.json({ ok: true, clubs: [] });

  const cards = await loadVisibleOrgCards(service, rows.map((r) => r.org_id));
  if (!cards.ok) return fail(500, "request_failed", "Request failed");
  const visible = rows.filter((r) => cards.byId.has(r.org_id));
  if (visible.length === 0) return NextResponse.json({ ok: true, clubs: [] });

  // The officers' request list leaves out anyone in a block pair with the
  // officer reading it, either way (blocks only, not mutes: the requests
  // route), so this count does too, or "1 to review" would tell an officer
  // that someone who blocked them asked. Blocks are read with MY client
  // (RLS shows both directions of my own). Either read failing: unknown.
  const [pendingRes, hiddenRes] = await Promise.all([
    service
      .from("org_join_requests")
      .select("org_id, user_id")
      .eq("status", "pending")
      .in("org_id", visible.map((r) => r.org_id))
      .limit(REQUESTS_MAX),
    loadHiddenUsers(supabase, user.id),
  ]);
  let pending: Map<string, number> | null = null;
  if (pendingRes.error || !hiddenRes.ok) {
    console.error("[me/clubs-you-run requests]", pendingRes.error ?? (hiddenRes.ok ? null : hiddenRes.error));
  } else {
    const blocked = hiddenRes.hidden.blocked;
    pending = new Map();
    for (const r of (pendingRes.data ?? []) as { org_id: string; user_id: string }[]) {
      if (blocked.has(r.user_id)) continue;
      pending.set(r.org_id, (pending.get(r.org_id) ?? 0) + 1);
    }
  }

  const clubs: ClubYouRun[] = visible
    .flatMap((r) => {
      const org = cards.byId.get(r.org_id);
      if (!org) return [];
      const role: ClubYouRun["role"] = r.role === "owner" ? "owner" : "admin";
      return [
        {
          org_id: org.id,
          handle: org.handle,
          name: org.name,
          logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
          role,
          title: storedClubTitle(r.title),
          requests: pending ? (pending.get(org.id) ?? 0) : null,
        },
      ];
    })
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  return NextResponse.json({ ok: true, clubs });
}
