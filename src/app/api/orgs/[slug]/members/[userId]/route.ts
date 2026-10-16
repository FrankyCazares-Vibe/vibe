import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { requireNotRestricted } from "@/lib/moderation/access";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { isOrgRole, type OrgRole } from "@/lib/orgs/join-state";
import { forgetOrgRemoval, recordOrgRemoval } from "@/lib/orgs/membership";
import { isUuid } from "@/lib/pgrest";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string; userId: string }> };
type PatchBody = { role?: unknown };

const VALID_ROLES = ["admin", "mod", "member"] as const;

/** The `orgOfficer` refusal, the same line on every club officer route. */
const OFFICER_BUSY = "Too many club changes at once. Try again in a few minutes.";

/** Who may change roles or remove members here (the route's own rule). */
const STAFF_ROLES: readonly OrgRole[] = ["owner", "admin"];

/**
 * The rows each officer may change or remove, by the target's role. The owner
 * row is never one; only the owner acts on an admin (in the database too,
 * org_members_update). THE WRITE FILTERS ON THIS, not just the read before it
 * (S67 sec wave 2 integration): an admin's PATCH/DELETE that raced the owner
 * promoting that member to admin matches 0 rows instead of acting on an admin.
 */
const ACTABLE_ROLES: Record<"owner" | "admin", readonly OrgRole[]> = {
  owner: ["admin", "mod", "member"],
  admin: ["mod", "member"],
};

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

/**
 * PATCH /api/orgs/[slug]/members/[userId] — change a member's role.
 * Body: { role: 'admin' | 'mod' | 'member' }
 *
 * Permissions:
 *  - Admin/owner only.
 *  - Cannot change the owner's row (transfer-ownership flow not in v1).
 *  - Admins cannot demote/promote each other; only the owner can manage admins.
 *
 * The write re-asks the role rule ({@link ACTABLE_ROLES}) and returns the rows
 * it changed: 0 rows answers 409 when their role moved out of this officer's
 * reach meanwhile, 404 when they are no longer a member.
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
  const role = typeof body.role === "string" ? body.role : "";
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { ok: false, error: "Role must be admin, mod, or member" },
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
  if (target.role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can demote admins" },
      { status: 403 }
    );
  }
  if (role === "admin" && guard.viewerRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the owner can promote to admin" },
      { status: 403 }
    );
  }

  // The checks above read the target a moment ago; the write asks again. It
  // only touches a row whose role this officer may still act on, and says
  // which rows it changed.
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
 * Permissions: admin/owner. Owner row is non-removable.
 * Admins cannot remove other admins (only owner can). Since 20260928100000
 * the database lets the data API delete only your OWN membership (leaving),
 * so this service-role route is the only way anyone is removed, and every
 * removal is recorded. The delete re-asks the role rule, like PATCH: 409 when
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
      { ok: false, error: "Only the owner can remove admins" },
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
