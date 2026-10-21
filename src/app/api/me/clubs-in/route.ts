import { NextResponse } from "next/server";

import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import type { ClubIn } from "@/lib/orgs/clubs-in";
import { loadVisibleOrgCards } from "@/lib/orgs/following";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type MemberRow = { org_id: string; role: unknown };

const LIST_LIMIT = { limit: 60, windowSec: 60 };
/** Nobody is in this many clubs; the cap keeps the card read's URL short (as `/api/me/clubs`). */
const MEMBER_OF_MAX = 100;

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * GET /api/me/clubs-in — the clubs I'm a plain member of, for the "Your
 * clubs" list in the desktop left menu's profile card (Oct 21, 2026, Franky:
 * members want a quick way to their club's page too). The clubs I run come
 * from `/api/me/clubs-you-run` (with their join-request counts); this read
 * is the rest, kept light: no titles, no follows, no mutes, no counts. Only
 * ever the signed-in person's own rows.
 *
 * WHICH CLIENT. My memberships are a SERVICE read filtered to my id, the same
 * as `/api/me/clubs` and `/api/me/clubs-you-run`. Clubs Vibe hid (the test
 * clubs among them) are left out: there is no page to go to. Clubs I hid
 * from my profile stay in: this list is only ever mine.
 *
 * RESPONSES
 *   200 {ok, clubs:[{org_id, handle, name, logo_url}]}  by name
 *   401 unauthorized · 429 · 500 request_failed
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthorized", "Unauthorized");

  const rl = await rateLimit(`me-clubs-in:${user.id}`, LIST_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a minute.");

  const service = createSupabaseServiceClient();
  const memberRes = await service
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("role", "member")
    .limit(MEMBER_OF_MAX);
  if (memberRes.error) {
    console.error("[me/clubs-in read]", memberRes.error);
    return fail(500, "request_failed", "Request failed");
  }
  const rows = ((memberRes.data ?? []) as MemberRow[]).filter((r) => r.role === "member");
  if (rows.length === 0) return NextResponse.json({ ok: true, clubs: [] });

  const cards = await loadVisibleOrgCards(service, rows.map((r) => r.org_id));
  if (!cards.ok) return fail(500, "request_failed", "Request failed");

  const clubs: ClubIn[] = rows
    .flatMap((r) => {
      const org = cards.byId.get(r.org_id);
      if (!org) return [];
      return [
        {
          org_id: org.id,
          handle: org.handle,
          name: org.name,
          logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return NextResponse.json({ ok: true, clubs });
}
