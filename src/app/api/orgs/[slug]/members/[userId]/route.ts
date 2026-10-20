import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { contentBlockedResponse, requireNotRestricted } from "@/lib/moderation/access";
import { checkChangedText } from "@/lib/moderation/text-filter";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { forgetOrgRemoval, recordOrgRemoval } from "@/lib/orgs/membership";
import { isUuid } from "@/lib/pgrest";
import { normalizeClubTitle, storedClubTitle } from "@/lib/profile/club-flair";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; userId: string }> };
type PatchBody = { role?: unknown; title?: unknown };

/** The roles PATCH may set: officer (stored `admin`) or member. No `mod` since 20261021100000. */
const VALID_ROLES = ["admin", "member"] as const;

/** The `orgOfficer` refusal, the same line on every club officer route. */
const OFFICER_BUSY = "Too many club changes at once. Try again in a few minutes.";

/** Who may use this route at all: the owner and officers (`admin`). */
const STAFF_ROLES: readonly OrgRole[] = ["owner", "admin"];

/**
 * The rows each of them may act on (remove, title), by the target's role.
 * The owner row is never one; only the owner acts on an officer. Role changes
 * are the owner's alone (PATCH below; org_members_update says so in the
 * database too, 20261021100000). THE WRITE FILTERS ON THIS, not just the read
 * before it (S67 sec wave 2 integration): an officer's DELETE that raced the
 * owner making that member an officer matches 0 rows instead of removing an
 * officer.
 */
const ACTABLE_ROLES: Record<"owner" | "admin", readonly OrgRole[]> = {
  owner: ["admin", "member"],
  admin: ["member"],
};

/** An officer asking to change anyone's role (Franky, Oct 20: only the owner makes officers). */
const OWNER_ONLY_ROLES = "Only the owner can make or remove officers.";

/** 0 rows changed: why. Still a member (their role moved) or gone. */
async function standingAfterMiss(
  service: ReturnType<typeof createSupabaseServiceClient>,
  orgId: string,
  userId: string,
): Promise<"member" | "gone" | "error"> {
  const { data, error } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug]/members/[userId] re-read]", error);
    return "error";
  }
  return data ? "member" : "gone";
}

const MEMBER_NOT_FOUND = { ok: false, error: "Member not found" } as const;
const ROLE_CHANGED = {
  ok: false,
  error: "Their role just changed. Refresh and try again.",
} as const;

/**
 * Owner or admin of this org, or an answer to send. A HIDDEN club answers a
 * non-member 404, the same as a handle that was never registered (S67 sec
 * wave 2, hidden-club Low); a member who isn't staff gets the honest 403.
 */
async function requireStaff(slug: string, viewerId: string) {
  const service = createSupabaseServiceClient();
  const { data: org } = await service
    .from("orgs")
    .select("id, owner_id, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (!org) return { error: "Not found", status: 404 } as const;

  const { data: viewer } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", viewerId)
    .maybeSingle();
  const rawRole: unknown = viewer?.role;
  const role = isOrgRole(rawRole) ? rawRole : null;
  const gate = officerGate({ hidden: !!org.hidden_at, role, allowed: STAFF_ROLES });
  if (gate === "not_found") return { error: "Not found", status: 404 } as const;
  if (gate === "forbidden") return { error: "Admin only", status: 403 } as const;
  return { org, viewerRole: role as "owner" | "admin", service } as const;
}

type StaffGuard = Extract<Awaited<ReturnType<typeof requireStaff>>, { viewerRole: unknown }>;

/**
 * The title half of PATCH: `{title: "President"}` sets one, `{title: null}`
 * (or blank) clears it (club model spec D; review item 32). A title shows on
 * the member's public profile next to the club, if they show the club; the
 * role word never does.
 *
 * WHO: the owner titles anyone, themselves included; an officer titles
 * members and themselves. The same reach as roles ({@link ACTABLE_ROLES}),
 * plus your own row, and the write filters on it, so a title can't land on
 * someone whose role moved out of reach meanwhile.
 *
 * WHAT: one line, up to 32 characters, not using Vibe, Admin, Moderator,
 * Verified or Official (`normalizeClubTitle`), and past the word filter.
 * An unchanged title is let through, the way profile saves are. Who set it
 * and when is stamped on the row (`org_members_title_stamped` insists). The
 * member can hide it from their own Clubs settings (`show_title` on
 * `PATCH /api/me/clubs/[orgId]`), but never write one.
 */
async function patchTitle(guard: StaffGuard, actorId: string, userId: string, raw: unknown) {
  const checked = normalizeClubTitle(raw);
  if (!checked.ok) {
    return NextResponse.json(
      { ok: false, error: checked.error, code: checked.code },
      { status: 400 },
    );
  }
  if (!isUuid(userId)) return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });

  const failed = () =>
    NextResponse.json({ ok: false, error: "Failed to update title" }, { status: 500 });
  const { data: target, error: targetErr } = await guard.service
    .from("org_members")
    .select("role, title")
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (targetErr) {
    console.error("[orgs/[slug]/members/[userId] PATCH title load target]", targetErr);
    return failed();
  }
  if (!target) return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });

  const reach: readonly OrgRole[] =
    userId === actorId ? [guard.viewerRole] : ACTABLE_ROLES[guard.viewerRole];
  const targetRole: unknown = target.role;
  if (!isOrgRole(targetRole) || !reach.includes(targetRole)) {
    const error =
      targetRole === "owner"
        ? "Only the owner can change the owner's title"
        : "Only the owner can change an officer's title";
    return NextResponse.json({ ok: false, error }, { status: 403 });
  }
  if (!checkChangedText(checked.title, storedClubTitle(target.title)).ok) {
    return contentBlockedResponse("title");
  }

  const { data: changed, error } = await guard.service
    .from("org_members")
    .update({
      title: checked.title,
      title_set_by: actorId,
      title_set_at: new Date().toISOString(),
    })
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .in("role", [...reach])
    .select("title");
  if (error) {
    // `org_members_title_check` is the backstop for normalizeClubTitle. If
    // the two ever disagree, say "not allowed", not "something broke".
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json(
        { ok: false, error: "That title isn't allowed.", code: "title_invalid" },
        { status: 400 },
      );
    }
    console.error("[orgs/[slug]/members/[userId] PATCH title]", error);
    return failed();
  }
  const row = (changed ?? [])[0] as { title?: unknown } | undefined;
  if (!row) {
    const standing = await standingAfterMiss(guard.service, guard.org.id as string, userId);
    if (standing === "error") return failed();
    return standing === "gone"
      ? NextResponse.json(MEMBER_NOT_FOUND, { status: 404 })
      : NextResponse.json(ROLE_CHANGED, { status: 409 });
  }
  return NextResponse.json({ ok: true, title: storedClubTitle(row.title) });
}

/**
 * PATCH /api/orgs/[slug]/members/[userId] — change a member's role, OR give
 * them a title.
 * Body: { role: 'admin' | 'member' } or { title: string | null }
 * (one at a time; the title rules are on {@link patchTitle}).
 *
 * Permissions:
 *  - Titles: the owner or an officer ({@link patchTitle}).
 *  - Roles: THE OWNER ONLY. Making a member an officer (`admin`) or an
 *    officer a member again is the owner's call (Franky, Oct 20; the club's
 *    view, DECISIONS.md Round 1 call 1). An officer gets 403.
 *  - Cannot change the owner's row (transfer-ownership flow not in v1).
 *
 * The write re-asks the role rule ({@link ACTABLE_ROLES}) and returns the rows
 * it changed: 0 rows answers 409 when their row moved out of reach meanwhile,
 * 404 when they are no longer a member.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // One person per call, so a chapter's setup is many calls: `orgOfficer` is
  // sized for that. Before the staff guard, so a refused caller costs no
  // database read (limits wave 3).
  const rl = await limitFor("orgOfficer", user.id);
  if (!rl.allowed) return tooManyRequests(rl, OFFICER_BUSY);

  // The org_members policies refuse a suspended or banned officer
  // (NOT is_restricted_now()), but this route writes with the service role,
  // which skips them. Ask here (S67 sec wave 2).
  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  const guard = await requireStaff(slug, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if ("title" in body) {
    if ("role" in body) {
      return NextResponse.json(
        { ok: false, error: "Change the role or the title, one at a time." },
        { status: 400 },
      );
    }
    return patchTitle(guard, user.id, userId, body.title);
  }
  if (guard.viewerRole !== "owner") {
    return NextResponse.json({ ok: false, error: OWNER_ONLY_ROLES }, { status: 403 });
  }
  const role = typeof body.role === "string" ? body.role : "";
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { ok: false, error: "Role must be admin (Officer) or member" },
      { status: 400 }
    );
  }

  // Target row. Not a uuid is nobody (404, not a 500 from the cast).
  if (!isUuid(userId)) return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
  const { data: target, error: targetErr } = await guard.service
    .from("org_members")
    .select("role")
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (targetErr) {
    console.error("[orgs/[slug]/members/[userId] PATCH load target]", targetErr);
    return NextResponse.json({ ok: false, error: "Failed to update role" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { ok: false, error: "Owner role can't be changed here" },
      { status: 400 }
    );
  }

  // The check above read the target a moment ago; the write asks again. It
  // only touches a row the owner may still act on (never the owner's), and
  // says which rows it changed.
  const { data: changed, error } = await guard.service
    .from("org_members")
    .update({ role })
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .in("role", [...ACTABLE_ROLES[guard.viewerRole]])
    .select("user_id");
  if (error) {
    console.error("[orgs/[slug]/members/[userId] PATCH]", error);
    return NextResponse.json({ ok: false, error: "Failed to update role" }, { status: 500 });
  }
  if ((changed ?? []).length === 0) {
    const standing = await standingAfterMiss(guard.service, guard.org.id as string, userId);
    if (standing === "error") {
      return NextResponse.json({ ok: false, error: "Failed to update role" }, { status: 500 });
    }
    return standing === "gone"
      ? NextResponse.json(MEMBER_NOT_FOUND, { status: 404 })
      : NextResponse.json(ROLE_CHANGED, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/orgs/[slug]/members/[userId] — remove a member.
 * Permissions: the owner or an officer. Owner row is non-removable.
 * Officers cannot remove other officers (only the owner can). Since
 * 20260928100000 the database lets the data API delete only your OWN
 * membership (leaving), so this service-role route is the only way anyone is
 * removed, and every removal is recorded. The delete re-asks the role rule, like PATCH: 409 when
 * their role moved out of reach meanwhile, 404 when they are already gone.
 *
 * A REMOVAL IS RECORDED FIRST (S67 sec wave 2 #15). `org_removals` gets the
 * row BEFORE the membership is deleted, so:
 *   - the AFTER DELETE trigger sees it and, besides the club's chat rows
 *     (dropped on every leave), also drops their RSVPs to the club's events
 *     that haven't ended;
 *   - the join route makes them ask to come back instead of one tap, and the
 *     officers see "Removed before" on that request;
 *   - a crash between the two steps leaves a member with a stale record
 *     (member wins; the next removal re-stamps it), never a removed person
 *     with none. If the delete fails, the record is taken back.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug, userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await limitFor("orgOfficer", user.id);
  if (!rl.allowed) return tooManyRequests(rl, OFFICER_BUSY);

  // Same reason as PATCH: the service-role write skips the policy's
  // NOT is_restricted_now().
  const restricted = await requireNotRestricted(user.id);
  if (restricted) return restricted;

  const guard = await requireStaff(slug, user.id);
  if ("error" in guard) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  if (!isUuid(userId)) return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
  const { data: target, error: targetErr } = await guard.service
    .from("org_members")
    .select("role")
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (targetErr) {
    console.error("[orgs/[slug]/members/[userId] DELETE load target]", targetErr);
    return NextResponse.json({ ok: false, error: "Failed to remove" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { ok: false, error: "The owner can't be removed" },
      { status: 400 }
    );
  }
  if (target.role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can remove officers" },
      { status: 403 }
    );
  }

  const recorded = await recordOrgRemoval(guard.service, {
    orgId: guard.org.id as string,
    userId,
    removedBy: user.id,
  });
  if (!recorded.ok) {
    return NextResponse.json({ ok: false, error: "Failed to remove" }, { status: 500 });
  }

  // Same as PATCH: the delete only matches a row this officer may still act
  // on, and says what it deleted.
  const { data: deleted, error } = await guard.service
    .from("org_members")
    .delete()
    .eq("org_id", guard.org.id)
    .eq("user_id", userId)
    .in("role", [...ACTABLE_ROLES[guard.viewerRole]])
    .select("user_id");
  if (error) {
    console.error("[orgs/[slug]/members/[userId] DELETE]", error);
    // They are still a member: take the record back so a later voluntary
    // leave isn't treated as a removal.
    if (!recorded.missing) await forgetOrgRemoval(guard.service, guard.org.id as string, userId);
    return NextResponse.json({ ok: false, error: "Failed to remove" }, { status: 500 });
  }
  if ((deleted ?? []).length === 0) {
    // Nothing deleted. STILL A MEMBER (their role moved out of reach): take
    // the record back, as above. GONE (another officer removed them, or they
    // left, in the same instant): keep it. An officer did mean to remove
    // them, and forgetting here could erase the record another officer's
    // removal just wrote, handing the removed person a one-tap rejoin.
    const standing = await standingAfterMiss(guard.service, guard.org.id as string, userId);
    if (standing === "member" && !recorded.missing) {
      await forgetOrgRemoval(guard.service, guard.org.id as string, userId);
    }
    if (standing === "error") {
      return NextResponse.json({ ok: false, error: "Failed to remove" }, { status: 500 });
    }
    return standing === "gone"
      ? NextResponse.json(MEMBER_NOT_FOUND, { status: 404 })
      : NextResponse.json(ROLE_CHANGED, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
