import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Typeahead user search by name or handle. Powers the profile/campus search
 * bar so visitors can find real Vibe users (not just the hardcoded mock
 * data the prototype ships with).
 *
 * - Auth required — same gate as everything else; no anonymous user lookup.
 * - ILIKE on name OR handle, prefix-biased so "ja" matches "James" first.
 * - Excludes the viewer's own row (you don't search for yourself).
 * - Returns only public columns — no email, no school_email.
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

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  // Optional: scope results to members of a specific channel. Used by
  // the @mention picker in the chat composer so groups can only tag
  // people who are actually in the chat. Verifies the viewer is in the
  // channel themselves before honoring it (prevents leaking membership).
  const scopeChannelId = (url.searchParams.get("channel_id") || "").trim();

  if (q.length < 1) {
    return NextResponse.json({ ok: true, users: [] });
  }

  let allowedIds: Set<string> | null = null;
  if (scopeChannelId) {
    const { data: viewerMember } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("channel_id", scopeChannelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!viewerMember) {
      return NextResponse.json({ ok: true, users: [] });
    }
    const { data: members } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", scopeChannelId)
      .neq("user_id", user.id);
    allowedIds = new Set((members ?? []).map((m) => m.user_id as string));
    if (allowedIds.size === 0) {
      return NextResponse.json({ ok: true, users: [] });
    }
  }

  // Escape ILIKE wildcards in the user input so a literal `%` isn't a
  // free-form glob. % and _ are the only metacharacters in LIKE.
  const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
  const pattern = `${safe}%`;
  const containsPattern = `%${safe}%`;

  // Two-phase ranking: prefix matches first (better signal), then
  // contains-anywhere as a fallback. Easier than a custom sort and keeps
  // the round-trip count at one query each.
  const [prefixRes, containsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,handle,school,major,year,avatar_url")
      .neq("id", user.id)
      .or(`name.ilike.${pattern},handle.ilike.${pattern}`)
      .limit(limit),
    supabase
      .from("users")
      .select("id,name,handle,school,major,year,avatar_url")
      .neq("id", user.id)
      .or(`name.ilike.${containsPattern},handle.ilike.${containsPattern}`)
      .limit(limit),
  ]);

  if (prefixRes.error || containsRes.error) {
    console.error("[users/search]", prefixRes.error ?? containsRes.error);
    return NextResponse.json(
      { ok: false, error: (prefixRes.error ?? containsRes.error)!.message },
      { status: 500 },
    );
  }

  const seen = new Set<string>();
  const users: Array<Record<string, unknown>> = [];
  for (const list of [prefixRes.data ?? [], containsRes.data ?? []]) {
    for (const u of list) {
      if (seen.has(u.id)) continue;
      // Channel scope filter — only members of the requested channel.
      if (allowedIds && !allowedIds.has(u.id as string)) continue;
      seen.add(u.id);
      users.push(u);
      if (users.length >= limit) break;
    }
    if (users.length >= limit) break;
  }

  // Filter blocked-either-way users out of search results so neither
  // party surfaces in the other's discovery flow.
  if (users.length > 0) {
    try {
      const { data: blockRows } = await supabase
        .from("blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
      const hidden = new Set<string>();
      for (const b of blockRows ?? []) {
        const blocker = b.blocker_id as string;
        const blocked = b.blocked_id as string;
        if (blocker === user.id) hidden.add(blocked);
        else if (blocked === user.id) hidden.add(blocker);
      }
      for (let i = users.length - 1; i >= 0; i--) {
        if (hidden.has(users[i]!.id as string)) users.splice(i, 1);
      }
    } catch {
      /* blocks table may not be migrated yet; surface unfiltered. */
    }
  }

  // Annotate each result with the viewer's relationship state so the
  // dropdown can render Connect / Pending / Message correctly.
  // Two batched queries — outgoing (viewer→target) and incoming
  // (target→viewer) — combine to none / following / followed_by /
  // connected. Cheaper than N separate getFollowState calls.
  if (users.length > 0) {
    const ids = users.map((u) => String(u.id));
    const [outRes, inRes] = await Promise.all([
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
    ]);
    const outgoing = new Set((outRes.data ?? []).map((r) => r.following_id as string));
    const incoming = new Set((inRes.data ?? []).map((r) => r.follower_id as string));
    for (const u of users) {
      const a = outgoing.has(u.id as string);
      const b = incoming.has(u.id as string);
      u.rel = a && b ? "connected" : a ? "following" : b ? "followed_by" : "none";
    }
  }

  return NextResponse.json({ ok: true, users });
}
