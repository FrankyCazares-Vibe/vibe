import { NextResponse } from "next/server";

import { DISCOVERABLE_USER_COLUMNS, isDiscoverableAccount } from "@/lib/iu/community-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { ilikeOrFilter, ilikePrefixOrFilter, isUuid } from "@/lib/pgrest";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/**
 * Extra rows to pull per query so the stranded/unfinished accounts dropped
 * below don't eat into the page the caller asked for. Small on purpose: the
 * filter removes a handful of rows, not a proportion of the table.
 */
const FILTER_HEADROOM = 10;

/**
 * Typeahead user search by name or handle. Powers the profile/campus search
 * bar so visitors can find real Vibe users (not just the hardcoded mock
 * data the prototype ships with).
 *
 * - Auth required — same gate as everything else; no anonymous user lookup.
 * - ILIKE on name OR handle, prefix-biased so "ja" matches "James" first.
 * - Excludes the viewer's own row (you don't search for yourself).
 * - Returns only public columns — no email, no school_email.
 *
 * SEARCH STAYS GLOBAL (Franky's Q2, plan §2.4). Campus scoping covers clubs,
 * events, the map, trending and the feed's campus lane; profiles, people
 * search, follows and DMs reach every campus and both universities, so a
 * student can find a friend at Purdue West Lafayette and follow them.
 *
 * What search DOES drop is accounts that aren't real people yet: unverified
 * or not-onboarded (plan §2.4). That covers the 5 stranded `u<32hex>` rows
 * live today (plan §2.7 — none of them finished onboarding) without ever
 * hiding a student who did finish. `otto_answers` is a private column, so
 * that test runs through the service role on the ids this query already
 * found, never as a way to widen the search.
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
  if (scopeChannelId && !isUuid(scopeChannelId)) {
    return NextResponse.json({ ok: false, error: "Invalid channel_id" }, { status: 400 });
  }

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

  // Strip PostgREST filter syntax + LIKE wildcards and quote the value so
  // user text can never extend the `or=` expression onto other columns.
  const prefixFilter = ilikePrefixOrFilter(["name", "handle"], q);
  const containsFilter = ilikeOrFilter(["name", "handle"], q);
  if (!prefixFilter || !containsFilter) {
    return NextResponse.json({ ok: true, users: [] });
  }

  // Two-phase ranking: prefix matches first (better signal), then
  // contains-anywhere as a fallback. Easier than a custom sort and keeps
  // the round-trip count at one query each. `school_verified` is filtered
  // here because it's cheap and granted; the rest of the discoverable test
  // needs a private column and runs once, below, on the ids we found.
  const fetchLimit = limit + FILTER_HEADROOM;
  const [prefixRes, containsRes] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,handle,school,major,year,avatar_url")
      .neq("id", user.id)
      .eq("school_verified", true)
      .or(prefixFilter)
      .limit(fetchLimit),
    supabase
      .from("users")
      .select("id,name,handle,school,major,year,avatar_url")
      .neq("id", user.id)
      .eq("school_verified", true)
      .or(containsFilter)
      .limit(fetchLimit),
  ]);

  if (prefixRes.error || containsRes.error) {
    console.error("[users/search]", prefixRes.error ?? containsRes.error);
    return NextResponse.json(
      { ok: false, error: "Request failed" },
      { status: 500 },
    );
  }

  // Merge prefix-then-contains, de-duplicated, WITHOUT capping at `limit`
  // yet: the discoverable filter below removes rows, and capping first would
  // let one stranded account cost a real person their slot.
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const list of [prefixRes.data ?? [], containsRes.data ?? []]) {
    for (const u of list) {
      if (seen.has(u.id)) continue;
      // Channel scope filter — only members of the requested channel.
      if (allowedIds && !allowedIds.has(u.id as string)) continue;
      seen.add(u.id);
      merged.push(u);
    }
  }

  // Drop accounts that aren't finished people yet. The service role is the
  // only role that can read `otto_answers`; if it isn't available we'd be
  // choosing between showing the stranded accounts and showing nothing, so
  // say the request failed instead.
  const users: Array<Record<string, unknown>> = [];
  if (merged.length > 0) {
    if (!isSupabaseServiceConfigured()) {
      console.error("[users/search] service role not configured");
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    const { data: statusRows, error: statusErr } = await createSupabaseServiceClient()
      .from("users")
      .select(DISCOVERABLE_USER_COLUMNS)
      .in(
        "id",
        merged.map((u) => String(u.id)),
      );
    if (statusErr) {
      console.error("[users/search discoverable]", statusErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    const discoverable = new Set<string>();
    for (const row of statusRows ?? []) {
      const r = row as { id: string };
      if (isDiscoverableAccount(row)) discoverable.add(r.id);
    }
    for (const u of merged) {
      if (!discoverable.has(String(u.id))) continue;
      users.push(u);
      if (users.length >= limit) break;
    }
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
