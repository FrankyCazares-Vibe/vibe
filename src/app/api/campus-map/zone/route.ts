import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_BUCKET = 60;

type UserRow = {
  id: string;
  name: string | null;
  handle: string | null;
  major: string | null;
  year: number | null;
  avatar_url: string | null;
};

/**
 * Drill-in for a zone (major or org). Splits people into three buckets:
 *   - `connected`  : you mutually-follow them
 *   - `mutuals`    : you share at least one mutual connection — sorted by
 *                    that count desc so the highest-overlap people surface
 *                    first
 *   - `discover`   : nobody in common, but they're in the same zone
 *
 * Each bucket is capped at MAX_BUCKET. Discover is the v1 hero — that's
 * where users find people they'd never bump into otherwise.
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
  const major = (url.searchParams.get("major") ?? "").trim();
  const orgHandle = (url.searchParams.get("org") ?? "").trim().toLowerCase();
  const forceDemo = url.searchParams.get("demo") === "1";
  if (!major && !orgHandle) {
    return NextResponse.json(
      { ok: false, error: "major or org required" },
      { status: 400 },
    );
  }

  if (forceDemo) {
    const seed = (major || orgHandle) + ":" + user.id;
    return NextResponse.json({
      ok: true,
      demo: true,
      ...buildDemoBuckets(seed),
    });
  }

  const { data: me } = await supabase
    .from("users")
    .select("id,school")
    .eq("id", user.id)
    .single();
  const school = (me?.school ?? "").trim();
  if (!school) {
    return NextResponse.json({ ok: true, connected: [], mutuals: [], discover: [] });
  }

  // Resolve candidate ids.
  let candidateIds: string[] = [];
  if (major) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("school", school)
      .eq("major", major)
      .neq("id", user.id);
    if (error) {
      console.error("[campus-map/zone major]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    candidateIds = (data ?? []).map((r) => (r as { id: string }).id);
  } else {
    const { data: org } = await supabase
      .from("orgs")
      .select("id")
      .eq("handle", orgHandle)
      .maybeSingle();
    if (!org) {
      return NextResponse.json({ ok: false, error: "Org not found" }, { status: 404 });
    }
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id);
    candidateIds = (members ?? [])
      .map((r) => (r as { user_id: string }).user_id)
      .filter((id) => id !== user.id);
  }

  if (candidateIds.length === 0) {
    // No real candidates → return demo people so the panel isn't empty
    // while the school spins up. Stable per-zone seed so the same zone
    // always shows the same demo cohort across reloads.
    const seed = (major || orgHandle) + ":" + user.id;
    return NextResponse.json({
      ok: true,
      demo: true,
      ...buildDemoBuckets(seed),
    });
  }

  // Viewer's connections (mutual follows).
  const [outRes, inRes] = await Promise.all([
    supabase.from("connections").select("following_id").eq("follower_id", user.id),
    supabase.from("connections").select("follower_id").eq("following_id", user.id),
  ]);
  const outIds = new Set(
    (outRes.data ?? []).map((r) => (r as { following_id: string }).following_id),
  );
  const inIds = new Set(
    (inRes.data ?? []).map((r) => (r as { follower_id: string }).follower_id),
  );
  const myConnections = new Set<string>();
  for (const id of outIds) if (inIds.has(id)) myConnections.add(id);

  // Mutual count per candidate: how many of MY connections follow them.
  const mutualCount = new Map<string, number>();
  if (myConnections.size > 0) {
    const { data: hop } = await supabase
      .from("connections")
      .select("following_id")
      .in("follower_id", Array.from(myConnections))
      .in("following_id", candidateIds);
    for (const row of hop ?? []) {
      const id = (row as { following_id: string }).following_id;
      mutualCount.set(id, (mutualCount.get(id) ?? 0) + 1);
    }
  }

  // Hydrate candidates' profiles in one query.
  const { data: profileRows, error: pErr } = await supabase
    .from("users")
    .select("id,name,handle,major,year,avatar_url")
    .in("id", candidateIds);
  if (pErr) {
    console.error("[campus-map/zone users]", pErr);
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  }
  const profiles = (profileRows as unknown as UserRow[]) ?? [];

  const connected: UserRow[] = [];
  const mutuals: Array<UserRow & { mutual_count: number }> = [];
  const discover: UserRow[] = [];

  for (const u of profiles) {
    if (myConnections.has(u.id)) {
      connected.push(u);
    } else if (mutualCount.has(u.id)) {
      mutuals.push({ ...u, mutual_count: mutualCount.get(u.id) ?? 0 });
    } else {
      discover.push(u);
    }
  }

  mutuals.sort((a, b) => b.mutual_count - a.mutual_count);
  // Stable shuffle for discover so "you'd never find them" feels less
  // alphabet-driven. Hash by user id so the order is consistent within a
  // session for one viewer.
  discover.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return NextResponse.json({
    ok: true,
    connected: connected.slice(0, MAX_BUCKET),
    mutuals: mutuals.slice(0, MAX_BUCKET),
    discover: discover.slice(0, MAX_BUCKET),
  });
}

const DEMO_FIRSTS = [
  "Maya", "Jordan", "Amara", "Sofia", "Diego", "Priya", "Liam", "Ava", "Ethan",
  "Mia", "Noah", "Zoe", "Aiden", "Layla", "Theo", "Nora", "Kai", "Ines",
  "Marcus", "Sam", "Riley", "Casey", "Drew", "Quinn", "Avery",
];
const DEMO_LASTS = [
  "Chen", "Thompson", "Roberts", "Kim", "Patel", "Garcia", "Lopez", "Nguyen",
  "Park", "Khan", "Singh", "Adams", "Brooks", "Rivera", "Walker", "Bennett",
  "Hayes", "Foster", "Ortiz", "Reyes",
];

function buildDemoBuckets(seed: string): {
  connected: ReturnType<typeof demoUser>[];
  mutuals: Array<ReturnType<typeof demoUser> & { mutual_count: number }>;
  discover: ReturnType<typeof demoUser>[];
} {
  // Deterministic pseudo-random sequence keyed on seed string. Same zone +
  // same viewer = same fake roster; bonkers across zones.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h * 31) + seed.charCodeAt(i)) | 0;
  let cursor = Math.abs(h) || 1;
  const next = () => {
    cursor = (cursor * 1103515245 + 12345) & 0x7fffffff;
    return cursor;
  };
  const pick = <T,>(arr: T[]): T => arr[next() % arr.length];

  const make = (i: number) => {
    const first = pick(DEMO_FIRSTS);
    const last = pick(DEMO_LASTS);
    return demoUser(`${first}-${last}-${i}`, `${first} ${last}`);
  };

  const connected = Array.from({ length: 4 }, (_, i) => make(i));
  const mutuals = Array.from({ length: 8 }, (_, i) => ({
    ...make(100 + i),
    mutual_count: (next() % 5) + 1,
  })).sort((a, b) => b.mutual_count - a.mutual_count);
  const discover = Array.from({ length: 12 }, (_, i) => make(200 + i));
  return { connected, mutuals, discover };
}

const DEMO_MAJORS_FOR_ROSTER = [
  "Computer Science", "Business", "Psychology", "Biology", "Communication",
  "Mechanical Engineering", "Economics", "Music", "Studio Art", "Marketing",
];

function demoUser(seed: string, name: string) {
  // Hash seed so the same person gets a stable major + year across reloads.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h * 31) + seed.charCodeAt(i)) | 0;
  const handle = name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14) +
    String(Math.abs(h) % 100);
  return {
    id: `demo-${seed}`,
    name,
    handle,
    major: DEMO_MAJORS_FOR_ROSTER[Math.abs(h) % DEMO_MAJORS_FOR_ROSTER.length],
    year: (Math.abs(h) % 4) + 1,
    avatar_url: null,
  };
}
