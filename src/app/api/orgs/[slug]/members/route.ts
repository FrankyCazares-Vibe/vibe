import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { refusalBody } from "@/lib/chat/types";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/orgs/[slug]/members — list members with role + minimal profile.
 * Any member of the org can see the roster. Non-members get 403.
 *
 * Returns: [{ user_id, role, joined_at, title, name, handle, avatar_url, school_verified }]
 * (`title` null when none was given, or on a database without the column)
 * sorted by role precedence (owner → admin → mod → member) then joined_at.
 *
 * THE ORG IS LOADED WITH THE SERVICE ROLE (spec §4.2). It used to be read
 * with the VIEWER's client, so `org_members_select` decided whether the row
 * came back at all and a non-member of a private org got "Not found" — the
 * wrong answer twice over: it says the org does not exist when it does, and
 * it hides the one fact the caller needed, that this roster is members-only.
 * M1c narrowed `orgs_select` further still, so under the user client even an
 * INVITED student would have been told SAE does not exist.
 *
 * Hidden orgs are the one case where 404 is the truth (spec §3.4): for
 * anybody who is not a member they are gone, and a 403 here would confirm the
 * handle exists.
 *
 * PLATFORM ADMINS ARE EXEMPT FROM THE HIDDEN 404, matching the other two
 * hidden gates that land with this batch (`profile/route.ts`,
 * `asset/[kind]/route.ts`) — three gates in one batch answering the same
 * question two different ways is how a rule rots. Hiding conceals an org from
 * students, not from the screen where it gets unhidden, and `orgJoinState`
 * already encodes the exception (`hidden` for an admin, `not_found` for
 * everyone else).
 *
 * The exemption is from the HIDDEN gate only, NOT from members-only: an admin
 * who is not a member still gets 403 `members_only`, the same answer they get
 * on a visible org. A roster is the members' list of each other, and nothing
 * in /admin asks for one — so this route costs the extra `is_platform_admin`
 * read only on the hidden-and-not-a-member path, and grants nothing new.
 *
 * `?visible=1` (wave-3-desktop/contract.md 4.2, decision K4): the same list
 * without the people in a block with the viewer, either way: the read the
 * club thread and an event's "going" already apply. The faces row and the
 * Members dialog of desktop Messages ask for it. When the block read fails
 * the answer is 503 `try_again`, never the unfiltered list. WITHOUT the
 * parameter the answer is the whole roster, as before: Campus settings and
 * the Rooms dialog list every member (an officer deciding who may enter a
 * room must see them all). The row shape is the same either way.
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Not found", code: "not_found" },
      { status: 404 },
    );
  }

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewer) {
    if (org.hidden_at && !(await isPlatformAdmin(service, user.id))) {
      return NextResponse.json(
        { ok: false, error: "Not found", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Members only", code: "members_only" },
      { status: 403 },
    );
  }

  // `title` (club model; critique #12, repair of review findings 10 and 14):
  // the title an owner or admin gave a member ("President"), shown to the
  // club's members here whatever the member chose for their public profile
  // (`show_title` is about the profile only, and stays theirs). A database
  // without the column (20261017100000) lists members as before, title null.
  const readMembers = (withTitle: boolean) =>
    service
      .from("org_members")
      .select(
        `user_id, role, joined_at, ${withTitle ? "title, " : ""}users:user_id(id, name, handle, avatar_url, school_verified)`
      )
      .eq("org_id", org.id);
  let { data, error } = await readMembers(true);
  if (error && isMissingColumnError(error, ["title"])) ({ data, error } = await readMembers(false));
  if (error) {
    console.error("[orgs/[slug]/members GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load members", code: "load_failed" },
      { status: 500 },
    );
  }

  const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, mod: 2, member: 3 };
  const rows = ((data || []) as unknown as Record<string, unknown>[]).map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    return {
      user_id: r.user_id as string,
      role: r.role as string,
      joined_at: r.joined_at as string,
      title: typeof r.title === "string" && r.title.trim() !== "" ? r.title : null,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
    };
  });
  rows.sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 99;
    const rb = ROLE_RANK[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.joined_at || "").localeCompare(b.joined_at || "");
  });

  if (new URL(req.url).searchParams.get("visible") === "1") {
    // The viewer's own pairs, on their cookie client (`blocks_select_either`).
    const blocked = await blockedIdsFor(supabase, user.id);
    if (!blocked) {
      return NextResponse.json(refusalBody("try_again"), { status: 503 });
    }
    return NextResponse.json({ ok: true, members: rows.filter((row) => !blocked.has(row.user_id)) });
  }

  return NextResponse.json({ ok: true, members: rows });
}

/**
 * Is this viewer a platform admin? Only ever called on the hidden-org path, so
 * an ordinary roster request is unchanged.
 *
 * Fails CLOSED on any error: the point of hidden is that a bad minute for the
 * database does not put the org back in front of a stranger.
 */
async function isPlatformAdmin(
  service: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("users")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/members hidden check]", error);
    return false;
  }
  return (data as { is_platform_admin?: unknown } | null)?.is_platform_admin === true;
}
