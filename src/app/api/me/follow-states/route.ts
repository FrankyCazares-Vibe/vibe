import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Bulk follow-state lookup. Given a list of user ids the caller already
 * knows about, return each one's current relationship to the viewer:
 * "self" | "none" | "following" | "followed_by" | "connected".
 *
 * Powers the profile.html nav search "Recently searched" chip refresh —
 * those chips are persisted in localStorage with whatever `rel` was true
 * the first time the user was searched, which becomes stale after a
 * follow / unfollow / block / unblock. One round-trip refreshes all
 * cached chips before the dropdown renders.
 *
 * Two ID-bounded queries (outgoing + incoming) replace N per-user
 * relationship calls. Also filters out anyone the viewer has blocked or
 * been blocked by — those rows are reported as `"none"` and the
 * `blocked_either_way` set is included so the caller can hide them.
 *
 * Query: ?ids=<uuid>,<uuid>,...   (capped at 50)
 */
const MAX_IDS = 50;

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const idsRaw = (url.searchParams.get("ids") || "").trim();
  if (!idsRaw) {
    return NextResponse.json({ ok: true, states: {}, blocked: [] });
  }
  // Loose UUID gate — Supabase will reject malformed ones, but we strip
  // junk early so a bad querystring can't blow up the route.
  const ids = Array.from(
    new Set(
      idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
    ),
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, states: {}, blocked: [] });
  }

  const [outRes, inRes, blockRes] = await Promise.all([
    supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", user.id)
      .in("following_id", ids),
    supabase
      .from("connections")
      .select("follower_id")
      .eq("following_id", user.id)
      .in("follower_id", ids),
    supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.in.(${ids.join(",")})),` +
          `and(blocked_id.eq.${user.id},blocker_id.in.(${ids.join(",")}))`,
      ),
  ]);

  const outgoing = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const incoming = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const blocked = new Set<string>();
  for (const r of blockRes.data ?? []) {
    const blocker = (r as { blocker_id: string }).blocker_id;
    const target = (r as { blocked_id: string }).blocked_id;
    blocked.add(blocker === user.id ? target : blocker);
  }

  const states: Record<string, string> = {};
  for (const id of ids) {
    if (id === user.id) {
      states[id] = "self";
      continue;
    }
    if (blocked.has(id)) {
      // Either party blocked — UI should treat them as effectively
      // unrelated AND surface the `blocked` array so chips can hide.
      states[id] = "none";
      continue;
    }
    const a = outgoing.has(id);
    const b = incoming.has(id);
    states[id] = a && b ? "connected" : a ? "following" : b ? "followed_by" : "none";
  }

  return NextResponse.json({
    ok: true,
    states,
    blocked: Array.from(blocked),
  });
}
