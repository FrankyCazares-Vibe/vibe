import { NextResponse } from "next/server";

import {
  allowedCampusId,
  campusIdFromLegacyLabel,
  isSchoolSystem,
  legacyLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { campusScopeError } from "@/lib/iu/community-scope";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { normalizeOrgAssetInput, orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  loadFollowerCount,
  loadViewerFollow,
  publicFollowerCount,
  type OrgFollowState,
} from "@/lib/orgs/following";
import {
  isJoinPolicy,
  isOrgAudience,
  isSettingsOfficer,
  isOrgRole,
  orgJoinState,
  visibleInviterFirstName,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { loadViewerOrgContext } from "@/lib/orgs/membership";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_BACKDROPS = [
  "cream",
  "sand-purple",
  "ember",
  "deep-violet",
  "forest",
  "midnight",
] as const;

type Params = { params: Promise<{ slug: string }> };

type UpdateBody = {
  name?: unknown;
  description?: unknown;
  backdrop_preset?: unknown;
  logo_url?: unknown;
  banner_url?: unknown;
  is_public?: unknown;
  join_policy?: unknown;
  audience?: unknown;
  links?: unknown;
  philanthropy?: unknown;
  campus?: unknown;
  campus_id?: unknown;
};

type LinkRow = { label: string; url: string };

/** The columns every read of an org needs now (spec §4.2). */
const ORG_SELECT =
  "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, school, campus_id, join_policy, audience";

const URL_RE = /^https?:\/\/[^\s]{3,}$/i;

/** The error shape every org route now speaks (spec §4 conventions). */
function fail(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, code, ...extra }, { status });
}

// Sanitize the public-facing links array. Drops anything malformed silently
// rather than 400-ing — keeps a typo from blocking the rest of the save.
function sanitizeLinks(input: unknown): LinkRow[] | null {
  if (input === null) return [];
  if (!Array.isArray(input)) return null;
  const out: LinkRow[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
    const url = typeof r.url === "string" ? r.url.trim().slice(0, 400) : "";
    if (!label || !URL_RE.test(url)) continue;
    out.push({ label, url });
    if (out.length >= 10) break; // hard cap
  }
  return out;
}

/**
 * Why an `audience` was refused, in words the editor can act on.
 *
 * The null case is the one that used to dead-end: when the OWNER has no
 * verified university, "pick an option that includes IU students" is advice
 * that fails again when followed — the only valid choice is "both". (Twin of
 * the creator-side copy in `orgs/route.ts`; a shared helper would have to live
 * in `src/lib/orgs/`, which another batch owns.)
 */
function audienceExcludesOwnerMessage(system: SchoolSystem | null): string {
  if (system === null) {
    return 'The owner has to be able to join. Pick "IU and Purdue students" until their school email names a university.';
  }
  return `The owner has to be able to join. Pick an option that includes ${
    system === "purdue" ? "Purdue" : "IU"
  } students.`;
}

/**
 * Narrowing the audience voids the invites it now excludes (spec §3.5 step 8):
 * the row is revoked and its Otto notification deleted, so nobody taps
 * "Accept invite" only to be told 403.
 *
 * ONLY A STUDENT WITH THE WRONG UNIVERSITY IS REVOKED. An invitee who hasn't
 * verified a school email yet (`school_system` null) is `unverified`, not
 * `audience_blocked` — their invite keeps waiting for them to verify, which is
 * exactly what an officer who invited them meant. `audience = 'both'` excludes
 * nobody, so it never reaches this function.
 *
 * Best-effort and logged: the audience change itself already landed, and
 * failing the whole PATCH afterwards would leave the officer unsure what saved.
 */
async function revokeAudienceIneligibleInvites(
  service: SupabaseClient,
  orgId: string,
  audience: Exclude<OrgAudience, "both">,
  actorId: string,
): Promise<void> {
  try {
    const { data: pending, error } = await service
      .from("org_invites")
      .select("id, invitee_id")
      .eq("org_id", orgId)
      .eq("status", "pending");
    if (error) {
      console.error("[orgs/[slug] PATCH audience invites load]", error);
      return;
    }
    const rows = (pending as Array<{ id: string; invitee_id: string }> | null) ?? [];
    if (rows.length === 0) return;

    const { data: invitees, error: usersErr } = await service
      .from("users")
      .select("id, school_system")
      .in("id", [...new Set(rows.map((r) => r.invitee_id))]);
    if (usersErr) {
      console.error("[orgs/[slug] PATCH audience invitees]", usersErr);
      return;
    }
    const systemById = new Map<string, SchoolSystem | null>();
    for (const row of invitees ?? []) {
      const u = row as { id: string; school_system: unknown };
      systemById.set(u.id, isSchoolSystem(u.school_system) ? u.school_system : null);
    }

    const doomed = rows.filter((r) => {
      const system = systemById.get(r.invitee_id) ?? null;
      return system !== null && system !== audience;
    });
    if (doomed.length === 0) return;

    const nowIso = new Date().toISOString();
    const { error: revokeErr } = await service
      .from("org_invites")
      .update({ status: "revoked", resolved_at: nowIso, resolved_by: actorId })
      .in(
        "id",
        doomed.map((r) => r.id),
      );
    if (revokeErr) {
      console.error("[orgs/[slug] PATCH audience revoke]", revokeErr);
      return;
    }
    const { error: notifErr } = await service
      .from("notifications")
      .delete()
      .eq("org_id", orgId)
      .eq("type", "org_invite")
      .in(
        "user_id",
        doomed.map((r) => r.invitee_id),
      );
    if (notifErr) {
      console.error("[orgs/[slug] PATCH audience notification cleanup]", notifErr);
    }
  } catch (e) {
    console.error("[orgs/[slug] PATCH audience invites]", e);
  }
}

/**
 * GET /api/orgs/[slug] — org detail, plus the ONE join decision (spec §3.2)
 * the button on every surface renders from.
 *
 * The org row is loaded with the SERVICE client (spec §4.2, critic A2): under
 * `orgs_select` a non-member can't read a private org at all, so this route
 * answered 404 for every private club and 404 is now decided HERE, from
 * `orgJoinState`, not by RLS.
 *
 * A hidden org is 404 for everybody but its members and a platform admin
 * (spec §3.4); an admin gets it with `join_state: "hidden"`, which is how
 * /admin renders the unhide control.
 *
 * Adds `join_policy`, `audience`, `hidden`, `join_state`, `join_reason` and
 * `pending_invite`; `viewer_role` and `pending_request` are unchanged.
 *
 * Club following (wave plan §4.2): `org_follow_state` ("following" |
 * "not_following"), `org_follow_source` (how the viewer's follow was made, or
 * null) and `follower_count` (null below `FOLLOWER_COUNT_FLOOR` unless the
 * viewer is this club's owner or admin, and null when the count couldn't be
 * read). `member_count` is null, never a fake 0, when its read failed.
 *
 * The follow reads run alongside the context read, but a failed follow read
 * is only reported AFTER the hidden-club 404: otherwise a DB hiccup would
 * answer a non-member 500 for a hidden club and 404 for a missing handle,
 * telling the two apart. For the same reason a failed context read answers a
 * hidden club with 404, not 500.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const service = createSupabaseServiceClient();
  const { data: orgRow, error } = await service
    .from("orgs")
    // No `owner_id`: this route now reads with the SERVICE client, so RLS no
    // longer withholds a private org's row from non-members, and naming a
    // one-member club's owner to every signed-in student is exactly what
    // critic A4 kept out of the RLS policy. Nothing reads it here.
    .select(`${ORG_SELECT}, hidden_at, created_at`)
    .eq("handle", slug)
    .maybeSingle();
  if (error) {
    console.error("[orgs/[slug] GET]", error);
    return fail(500, "load_failed", "Failed to load org");
  }
  if (!orgRow) {
    return fail(404, "not_found", "Not found");
  }
  const org = orgRow as unknown as {
    id: string;
    handle: string;
    logo_url: string | null;
    banner_url: string | null;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  } & Record<string, unknown>;

  const [ctx, memberCountRes, followRes, rawFollowerCount] = await Promise.all([
    loadViewerOrgContext(service, org.id, user.id),
    service
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id),
    loadViewerFollow(service, org.id, user.id),
    loadFollowerCount(service, org.id),
  ]);
  if (memberCountRes.error) {
    console.error("[orgs/[slug] GET member count]", memberCountRes.error);
  }
  if (!ctx.ok) {
    // A hidden club answers what a missing handle answers, even when the read
    // that would say "you're a member" failed: a 500 here would tell a
    // non-member the club exists. A member sees "not found" once; that's the
    // safe way to be wrong.
    if (org.hidden_at) {
      return fail(404, "not_found", "Not found");
    }
    // The least-privileged fallback would tell a member to verify their school
    // email. Say the read failed instead (`membership.ts` explains the flag).
    return fail(500, "load_failed", "Failed to load org");
  }

  const decision = orgJoinState({
    org,
    viewer: ctx.viewer,
    role: ctx.role,
    pendingInvite: ctx.pendingInvite,
    pendingRequest: ctx.pendingRequest,
  });
  if (decision.state === "not_found") {
    return fail(404, "not_found", "Not found");
  }
  if (!followRes.ok) {
    // A guessed follow state would offer "Follow" on a club the viewer
    // already follows. Say the read failed, the same rule as `ctx.ok` above,
    // but only after the 404 (see the docblock).
    return fail(500, "load_failed", "Failed to load org");
  }
  const orgFollowState: OrgFollowState = followRes.row ? "following" : "not_following";

  // Who invited them, unless the viewer has that officer blocked or muted
  // (critic A7) — then the banner says "an officer" instead of a name.
  let invitedByName: string | null = null;
  if (decision.state === "invited" && ctx.pendingInvite?.invited_by) {
    const inviterId = ctx.pendingInvite.invited_by;
    const [inviterRes, hiddenRes] = await Promise.all([
      service.from("users").select("id, name").eq("id", inviterId).maybeSingle(),
      loadHiddenUsers(supabase, user.id),
    ]);
    invitedByName = visibleInviterFirstName(
      (inviterRes.data as { id: string; name: string | null } | null) ?? null,
      hiddenRes.ok ? new Set(hiddenRes.hidden.ids) : [inviterId],
    );
  }

  const { hidden_at, ...rest } = org;
  return NextResponse.json({
    ok: true,
    org: {
      ...rest,
      logo_url: orgAssetProxyUrl(org.handle, org.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(org.handle, org.banner_url, "banner"),
      // Null, never 0, when the count couldn't be read (critic C27).
      member_count: memberCountRes.error ? null : (memberCountRes.count ?? null),
      org_follow_state: orgFollowState,
      org_follow_source: followRes.row?.source ?? null,
      // Officers see the raw number; everyone else sees null below the floor.
      follower_count: publicFollowerCount(rawFollowerCount, ctx.role),
      viewer_role: ctx.role,
      pending_request: ctx.pendingRequest,
      hidden: !!hidden_at,
      join_state: decision.state,
      join_reason: decision.reason ?? null,
      pending_invite:
        decision.state === "invited" && ctx.pendingInvite
          ? {
              id: ctx.pendingInvite.id,
              expires_at: ctx.pendingInvite.expires_at,
              invited_by_name: invitedByName,
            }
          : null,
    },
  });
}

/**
 * PATCH /api/orgs/[slug] — update org metadata, join policy, audience and
 * campus. Owner or admin only ("settings officers", spec §3.1).
 *
 * FOUR THINGS CHANGED HERE (spec §4.2, critic A3 + B4):
 *  0. It is RATE LIMITED (`org-settings:<uid>`, 30 / 10 min), like every other
 *     write in this batch — see the note at the top of the handler.
 *  1. The role check is EXPLICIT. It used to lean on the `orgs_update` policy,
 *     so a mod's save failed as a silent 500 with no explanation. Owner-by-
 *     `owner_id` is kept as its own branch, exactly as the live policy has it:
 *     an owner with a missing `org_members` row can still edit their own org.
 *  2. The write runs on the SERVICE client. `join_policy`, `audience` and
 *     `campus_id` have no UPDATE grant for `authenticated` (M1c), and M2
 *     revokes the legacy `is_public` and `school` grants too.
 *  3. Because RLS and the column grants no longer apply, THE WHITELIST BELOW
 *     IS THE ONLY BOUNDARY (critic B4). Never spread the body; never pass
 *     `verified`, `owner_id`, `handle` or `hidden_at` — hiding an org is a
 *     platform-admin action on its own route (§4.3), not a field on this one.
 *
 * `is_public` from a deployed bundle is mapped the way the database trigger
 * maps it: true → "open", false → "request", except that an invite-only org
 * stays invite-only (spec §2.2), so an old settings save can't quietly demote
 * SAE to request mode.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // This is now the batch's largest service-role write: the `orgs` patch, plus
  // — on every audience narrowing — an UPDATE across `org_invites` and a
  // DELETE across `notifications`. An officer looping narrow/widen would drive
  // those multi-table writes unbounded. 30 per 10 minutes is far above any
  // real settings session.
  const rl = await rateLimit(`org-settings:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgErr } = await service
    .from("orgs")
    .select("id, handle, owner_id, join_policy, audience, hidden_at, campus_id")
    .eq("handle", slug)
    .maybeSingle();
  if (orgErr) {
    console.error("[orgs/[slug] PATCH load org]", orgErr);
    return fail(500, "load_failed", "Failed to update");
  }
  if (!orgRow) {
    return fail(404, "not_found", "Not found");
  }
  const org = orgRow as {
    id: string;
    handle: string;
    owner_id: string | null;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  };

  const { data: membership } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const roleValue = (membership as { role?: unknown } | null)?.role;
  const role = isOrgRole(roleValue) ? roleValue : null;
  if (org.owner_id !== user.id && !isSettingsOfficer(role)) {
    return fail(403, "settings_officers_only", "Only owners and admins can change this.");
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (v.length < 2 || v.length > 50) {
      return fail(400, "invalid_name", "Name must be 2–50 chars");
    }
    patch.name = v;
  }
  if (typeof body.description === "string") {
    const v = body.description.trim();
    if (v.length > 400) {
      return fail(400, "invalid_description", "Description too long (max 400)");
    }
    patch.description = v;
  }
  if (
    typeof body.backdrop_preset === "string" &&
    (VALID_BACKDROPS as readonly string[]).includes(body.backdrop_preset)
  ) {
    patch.backdrop_preset = body.backdrop_preset;
  }
  if (body.logo_url !== undefined) {
    const v = normalizeOrgAssetInput(body.logo_url);
    if (v === undefined) {
      return fail(400, "invalid_asset", "Invalid logo_url");
    }
    patch.logo_url = v;
  }
  if (body.banner_url !== undefined) {
    const v = normalizeOrgAssetInput(body.banner_url);
    if (v === undefined) {
      return fail(400, "invalid_asset", "Invalid banner_url");
    }
    patch.banner_url = v;
  }

  // ── Join policy ──────────────────────────────────────────────────────────
  // New clients send `join_policy`; deployed ones send `is_public` on every
  // settings save (campus-home.tsx:1428). `join_policy` wins when both arrive.
  let nextPolicy: JoinPolicy | null = null;
  if (body.join_policy !== undefined) {
    if (!isJoinPolicy(body.join_policy)) {
      return fail(400, "invalid_join_policy", "Pick who can join: anyone, by request, or by invite.");
    }
    nextPolicy = body.join_policy;
  } else if (typeof body.is_public === "boolean") {
    nextPolicy = body.is_public
      ? "open"
      : org.join_policy === "invite"
        ? "invite"
        : "request";
  }
  // ── Audience ─────────────────────────────────────────────────────────────
  let nextAudience: OrgAudience | null = null;
  if (body.audience !== undefined) {
    if (!isOrgAudience(body.audience)) {
      return fail(400, "invalid_audience", "Pick who the org is open to.");
    }
    nextAudience = body.audience;
  }

  const policyChanges = !!nextPolicy && nextPolicy !== org.join_policy;
  const audienceChanges = !!nextAudience && nextAudience !== org.audience;

  // A hidden org is out of every list and nobody new can join it, so editing
  // WHO may join is meaningless until it is unhidden (spec §3.4). Its name,
  // description and links stay editable — "Edit details" is the one control
  // its officer bar keeps — and a deployed bundle re-sending the `is_public`
  // it already has changes nothing, so it doesn't trip this either.
  if ((policyChanges || audienceChanges) && org.hidden_at) {
    return fail(409, "org_hidden", "This org is hidden, so its join settings can't change.");
  }

  if (policyChanges && nextPolicy) patch.join_policy = nextPolicy;

  if (audienceChanges && nextAudience) {
    // The OWNER's university decides, not the editor's: an admin must not be
    // able to lock the owner out of their own org (spec §3.5 step 8).
    let ownerSystem: SchoolSystem | null = null;
    if (org.owner_id) {
      const { data: ownerRow } = await service
        .from("users")
        .select("school_system")
        .eq("id", org.owner_id)
        .maybeSingle();
      ownerSystem = isSchoolSystem(ownerRow?.school_system) ? ownerRow.school_system : null;
    }
    if (nextAudience !== "both" && nextAudience !== ownerSystem) {
      return fail(400, "audience_excludes_owner", audienceExcludesOwnerMessage(ownerSystem));
    }
    patch.audience = nextAudience;
  }

  if (body.links !== undefined) {
    const sanitized = sanitizeLinks(body.links);
    if (sanitized === null) {
      return fail(400, "invalid_links", "links must be an array");
    }
    patch.links = sanitized;
  }

  // ── Campus ───────────────────────────────────────────────────────────────
  // Officers can move an org between campuses (a chapter that actually meets
  // in Kokomo shouldn't be filed under its founder's campus), but only inside
  // their own university (plan §2.6). null / "" clears the stamp; a
  // campus-less org is then reachable by link, not through a campus list.
  const rawCampus =
    body.campus_id !== undefined
      ? body.campus_id
      : body.campus !== undefined
        ? body.campus
        : undefined;
  if (rawCampus !== undefined) {
    const { data: actorRow } = await service
      .from("users")
      .select("school_system")
      .eq("id", user.id)
      .maybeSingle();
    const actorSystem: SchoolSystem | null = isSchoolSystem(actorRow?.school_system)
      ? actorRow.school_system
      : null;

    if (rawCampus === null || rawCampus === "") {
      patch.campus_id = null;
      patch.school = "";
    } else {
      const known = typeof rawCampus === "string" ? campusIdFromLegacyLabel(rawCampus) : null;
      if (!known) {
        const { status, body: errBody } = campusScopeError({
          kind: "forbidden",
          reason: "unknown_campus",
        });
        return NextResponse.json(errBody, { status });
      }
      const campusId = allowedCampusId(known, actorSystem);
      if (!campusId) {
        const { status, body: errBody } = campusScopeError({
          kind: "forbidden",
          reason: "campus_not_in_system",
        });
        return NextResponse.json(errBody, { status });
      }
      patch.campus_id = campusId;
      // Dual-write the legacy label for one release (plan §5.5 step 4).
      patch.school = legacyLabel(campusId, actorSystem);
    }
  }

  if (typeof body.philanthropy === "string") {
    // Cap at 500 so the section card stays readable on phone widths
    // without the user scrolling for a paragraph.
    patch.philanthropy = body.philanthropy.trim().slice(0, 500);
  }
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 1) {
    return fail(400, "nothing_to_update", "Nothing to update");
  }

  const { data: updated, error } = await service
    .from("orgs")
    .update(patch)
    .eq("id", org.id)
    .select(ORG_SELECT)
    .single();
  if (error || !updated) {
    console.error("[orgs/[slug] PATCH]", error);
    return fail(500, "update_failed", "Failed to update");
  }

  if (patch.audience !== undefined && nextAudience && nextAudience !== "both") {
    await revokeAudienceIneligibleInvites(service, org.id, nextAudience, user.id);
  }

  return NextResponse.json({
    ok: true,
    org: {
      ...updated,
      logo_url: orgAssetProxyUrl(updated.handle, updated.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(updated.handle, updated.banner_url, "banner"),
      hidden: !!org.hidden_at,
    },
  });
}

/**
 * DELETE /api/orgs/[slug] — owner-only deletion. Cascades to org_members,
 * channels, join requests and invites via FK ON DELETE CASCADE.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // Resolve + authorize explicitly. An RLS-scoped delete silently affects 0
  // rows for non-owners and would still report success here.
  const service = createSupabaseServiceClient();
  const { data: org, error: fetchErr } = await service
    .from("orgs")
    .select("id, owner_id")
    .eq("handle", slug)
    .maybeSingle();
  if (fetchErr) {
    console.error("[orgs/[slug] DELETE lookup]", fetchErr);
    return fail(500, "delete_failed", "Failed to delete");
  }
  if (!org) {
    return fail(404, "not_found", "Not found");
  }
  if (org.owner_id !== user.id) {
    return fail(403, "owner_only", "Owner only");
  }

  const { error } = await service.from("orgs").delete().eq("id", org.id);
  if (error) {
    console.error("[orgs/[slug] DELETE]", error);
    return fail(500, "delete_failed", "Failed to delete");
  }
  return NextResponse.json({ ok: true });
}
