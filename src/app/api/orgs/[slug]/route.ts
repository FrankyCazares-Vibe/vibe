import { NextResponse } from "next/server";

import { REMOVED_PICTURE_MESSAGE } from "@/app/api/admin/images/_lib/removed-picture";
import { checkRemovedPicture } from "@/app/api/admin/images/_lib/removed-picture-store";
import {
  allowedCampusId,
  campusIdFromLegacyLabel,
  isSchoolSystem,
  legacyLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { campusScopeError } from "@/lib/iu/community-scope";
import { hasBlockedNewLinkLabel } from "@/lib/club-routes/link-labels";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { limitFor } from "@/lib/limits/budgets";
import {
  contentBlockedResponse,
  requireCanPublish,
  requireNotRestricted,
} from "@/lib/moderation/access";
import { checkChangedText } from "@/lib/moderation/text-filter";
import { normalizeOrgAssetInput, orgAssetProxyUrl } from "@/lib/org-asset-url";
import {
  loadFollowerCount,
  loadViewerFollow,
  publicFollowerCount,
  publicMemberCount,
  type OrgFollowState,
} from "@/lib/orgs/following";
import {
  isJoinPolicy,
  isOrgAudience,
  isOrgRole,
  orgJoinState,
  SETTINGS_ROLES,
  visibleInviterFirstName,
  type JoinPolicy,
  type OrgAudience,
} from "@/lib/orgs/join-state";
import { officerGate } from "@/lib/orgs/hidden-gate";
import { loadBoardReadable } from "@/lib/orgs/board-facts";
import { MOD_READONLY } from "@/lib/orgs/join-copy";
import { loadViewerOrgContext } from "@/lib/orgs/membership";
import { isPickableBackdrop } from "@/lib/orgs/backdrops";
import { normalizeMeetingTime } from "@/lib/orgs/meeting-time";
import {
  purgeDeletedClubMedia,
  type DeletedPostRow,
} from "@/lib/posts/delete-media-store";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The database's rule on `orgs.backdrop_preset` (Oct 22, 2026). Before
 * migration 20261026100000 it refuses the five new backgrounds; should the
 * code offer them first, the save is a 409 that says so, never a 500.
 */
const BACKDROP_CHECK = "orgs_backdrop_preset_check";

/** A save the backdrop CHECK refused: Postgres's 23514, naming that rule. */
function isBackdropCheckError(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  return (
    e.code === "23514" &&
    [e.message, e.details].some((text) => typeof text === "string" && text.includes(BACKDROP_CHECK))
  );
}

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
  followers_read_board?: unknown;
  meeting_time?: unknown;
};

type LinkRow = { label: string; url: string };

/** The columns every read of an org needs now (spec §4.2). */
const ORG_SELECT =
  "id, handle, name, description, logo_url, banner_url, is_public, backdrop_preset, verified, last_activity_at, links, philanthropy, school, campus_id, join_policy, audience";

const URL_RE = /^https?:\/\/[^\s]{3,}$/i;

/**
 * `orgs.followers_read_board` (club model, Franky, Oct 16; migration
 * 20261017100000): may the club's followers read its Board? On unless the
 * club's owner or an admin turns it off. A hidden club's Board is never
 * read by followers, whatever this says (the database's rule).
 */
const BOARD_SETTING = "followers_read_board";

/**
 * `orgs.meeting_time` (the club's view, wave 2; migration 20261023100000):
 * when the club says it meets, one line of its own words, '' for nothing.
 * PATCH asks for it and, on a database without it, reads again without it,
 * the way the Board setting is read in GET.
 */
const MEETING_TIME = "meeting_time";

/** The setting as the routes send it: true or false, null when this database has no such column. */
function boardSetting(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

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
 * read). `member_count` is null, never a fake 0, when its read failed, and
 * null below 5 for a viewer outside the club (`publicMemberCount`).
 * `board_readable` (club model) says whether THIS viewer may read the Board
 * now: a screen takes a follower's Board card from it, never from
 * `org_follow_state` plus `followers_read_board` (`loadBoardReadable`).
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
  // No `owner_id`: this route now reads with the SERVICE client, so RLS no
  // longer withholds a private org's row from non-members, and naming a
  // one-member club's owner to every signed-in student is exactly what
  // critic A4 kept out of the RLS policy. Nothing reads it here.
  const readOrg = (withBoardSetting: boolean) =>
    service
      .from("orgs")
      .select(`${ORG_SELECT}, ${withBoardSetting ? `${BOARD_SETTING}, ` : ""}hidden_at, created_at`)
      .eq("handle", slug)
      .maybeSingle();
  let { data: orgRow, error } = await readOrg(true);
  // A database without the Board setting yet (migration 20261017100000)
  // reads the club as before; the setting then answers null.
  if (error && isMissingColumnError(error, [BOARD_SETTING])) ({ data: orgRow, error } = await readOrg(false));
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

  const [ctx, memberCountRes, followRes, rawFollowerCount, boardReadable] = await Promise.all([
    loadViewerOrgContext(service, org.id, user.id),
    service
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id),
    loadViewerFollow(service, org.id, user.id),
    loadFollowerCount(service, org.id),
    loadBoardReadable(supabase, service, org.id, user.id),
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
    // A removed member of an open club asks, never one-tap rejoins
    // (S67 sec wave 2 #15; the join route decides the same way).
    removed: ctx.removed,
    // Two weeks after an officer's "no", `declined` (Oct 22, 2026), as the
    // join route and the club page decide it. Undefined from an older
    // stand-in reads as no decline.
    declinedAt: ctx.declinedAt,
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
      // A club setting, for its members and officers only (Settings and the
      // leave line read it): next to a follower's own `board_readable` it
      // would tell a barred or blocked follower what happened (wave-2 repair,
      // finding 15). Null for anyone else, and on a database without it.
      followers_read_board: ctx.role ? boardSetting(org.followers_read_board) : null,
      // May THIS viewer read the Board now (repair of review findings 4 and
      // 9): the database's own answer, so a follower an officer removed or
      // blocked gets the same false as a club with the switch off, and no
      // screen offers them a Board that answers 403. Null when unknown.
      board_readable: boardReadable,
      // Null, never 0, when the count couldn't be read (critic C27); null
      // below 5 for anyone outside the club (counts public from 5 up).
      member_count: memberCountRes.error ? null : publicMemberCount(memberCountRes.count, ctx.role),
      org_follow_state: orgFollowState,
      org_follow_source: followRes.row?.source ?? null,
      // Officers see the raw number; everyone else sees null below the floor.
      follower_count: publicFollowerCount(rawFollowerCount, ctx.role),
      viewer_role: ctx.role,
      pending_request: ctx.pendingRequest,
      hidden: !!hidden_at,
      join_state: decision.state,
      join_reason: decision.reason ?? null,
      // Only on `declined`: when they may ask again (ISO), else null.
      join_ask_again_at: decision.askAgainAt ?? null,
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
 * PATCH /api/orgs/[slug] — update org metadata, join policy, audience,
 * campus, `followers_read_board` (may followers read the Board; club
 * model, Oct 16) and `meeting_time` (when the club says it meets, up to 60
 * characters; the club's view, wave 2). Owner or admin only ("settings
 * officers", spec §3.1).
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

  // A club's name and description are the most-read published strings on the
  // site — Discover, search, every event card — so changing them is publishing,
  // and this save takes the publishing gate: Terms, a verified school email, no
  // restriction in force. `requireCanPublish` refuses on Terms first, so a
  // verified, unrestricted officer sees no change at all.
  //
  // THIS ROUTE IS THE ENFORCEMENT, and unlike posts it is the ONLY enforcement.
  // Since 20260928150000 it is also the only WRITER: authenticated lost its
  // column UPDATE grants on orgs, so the direct PostgREST path that skipped
  // this gate and the word filter is closed. `orgs_update`
  // (supabase/migrations/20260903100000_security_hardening.sql:77) is still
  // officer-only with no consent and no publish check, which is why the grants
  // had to go. The proxy's 403 on
  // non-GET /api/* is the fast path, not the wall — its own comment says so —
  // and it leans on the app_metadata mirror having been written. So a banned
  // officer has to be stopped here.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  const service = createSupabaseServiceClient();
  // `name`, `description`, `philanthropy`, `links` and `meeting_time` are read
  // for the word filter below, which only judges text the officer actually
  // changed. A database without `meeting_time` yet (20261023100000) reads
  // the club as before: saves without it work, saves with it answer 503.
  // `backdrop_preset` is read so a form re-sending the club's own background
  // is never refused for it (the background block below).
  const readOrg = (withMeeting: boolean) =>
    service
      .from("orgs")
      .select(
        `id, handle, owner_id, name, description, philanthropy, links, backdrop_preset, ${withMeeting ? `${MEETING_TIME}, ` : ""}join_policy, audience, hidden_at, campus_id`,
      )
      .eq("handle", slug)
      .maybeSingle();
  let meetingColumn = true;
  let { data: orgRow, error: orgErr } = await readOrg(true);
  if (orgErr && isMissingColumnError(orgErr, [MEETING_TIME])) {
    meetingColumn = false;
    ({ data: orgRow, error: orgErr } = await readOrg(false));
  }
  if (orgErr) {
    console.error("[orgs/[slug] PATCH load org]", orgErr);
    return fail(500, "load_failed", "Failed to update");
  }
  if (!orgRow) {
    return fail(404, "not_found", "Not found");
  }
  const org = orgRow as unknown as {
    id: string;
    handle: string;
    owner_id: string | null;
    name: string | null;
    description: string | null;
    philanthropy: string | null;
    backdrop_preset?: string | null;
    meeting_time?: string | null;
    links: unknown;
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  };

  // Owner-by-owner_id stays its own branch (see above): no roster read. For
  // anyone else, a stranger asking about a HIDDEN club gets the 404 a made-up
  // handle gets, not a 403 that confirms it exists (security wave 2,
  // `officerGate`); a failed roster read reads as "not a member", so it is
  // that same 404 on a hidden club and a 500 anywhere else, never a guessed
  // refusal.
  if (org.owner_id !== user.id) {
    const { data: membership, error: memberErr } = await service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberErr) console.error("[orgs/[slug] PATCH role]", memberErr);
    const roleValue = memberErr ? null : (membership as { role?: unknown } | null)?.role;
    const roleGate = officerGate({
      hidden: org.hidden_at !== null,
      role: isOrgRole(roleValue) ? roleValue : null,
      allowed: SETTINGS_ROLES,
    });
    if (roleGate === "not_found") return fail(404, "not_found", "Not found");
    if (memberErr) return fail(500, "load_failed", "Failed to update");
    if (roleGate === "forbidden") {
      return fail(403, "settings_officers_only", MOD_READONLY);
    }
  }

  // Renaming a club republishes it everywhere its name appears, so the word
  // filter sits on this save the same way it sits on create
  // (src/app/api/orgs/route.ts) — length first, filter second, `field` so the
  // settings form can point at the input, and never the matched word.
  //
  // ONLY WHAT CHANGED, for the reason text-filter.ts:21-26 spells out. The
  // settings form does NOT send only the fields an officer touched: the Edit
  // details modal puts `description` in the body on every single save
  // (src/app/orgs/[handle]/admin-actions.tsx:248 — unconditional; only
  // join_policy and audience are sent conditionally). With a plain `checkText`,
  // one club whose stored description happens to trip the list — today, or
  // after any future addition to it — could never save its links, philanthropy,
  // join policy or audience again, refused every time over text it never
  // touched and cannot see is the problem. `checkChangedText` waves through a
  // value that is already stored, so the filter only ever judges new writing.
  //
  // Who may rename (the Edit page's Name field, Oct 22, 2026): whoever passed
  // the gate above, the owner and the club's officers (`SETTINGS_ROLES`,
  // owner and admin), the same as every other field here. The 2-50 count is
  // JavaScript's `length` after trimming, so the field counts the same way.
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (v.length < 2 || v.length > 50) {
      return fail(400, "invalid_name", "Name must be 2–50 chars");
    }
    if (!checkChangedText(v, org.name).ok) return contentBlockedResponse("name");
    patch.name = v;
  }
  if (typeof body.description === "string") {
    const v = body.description.trim();
    if (v.length > 400) {
      return fail(400, "invalid_description", "Description too long (max 400)");
    }
    if (!checkChangedText(v, org.description).ok) {
      return contentBlockedResponse("description");
    }
    patch.description = v;
  }
  // ── The club's background ────────────────────────────────────────────────
  // The Look section (Oct 22, 2026): only a background the pickers offer
  // (src/lib/orgs/backdrops.ts, the one list). Anything else is a 400; it
  // used to be dropped without a word, so a save said "Saved" over a
  // background that never changed. The club's own key sent back unchanged
  // is left as it is, the way `checkChangedText` waves through stored text:
  // a club still on "cream" (never offered again) can save everything else
  // from a form that re-sends it.
  if (body.backdrop_preset !== undefined) {
    if (isPickableBackdrop(body.backdrop_preset)) {
      patch.backdrop_preset = body.backdrop_preset;
    } else if (body.backdrop_preset !== org.backdrop_preset) {
      return fail(400, "invalid_backdrop", "Pick one of the backgrounds.");
    }
  }
  if (body.logo_url !== undefined) {
    const v = normalizeOrgAssetInput(body.logo_url, org.id);
    if (v === undefined) {
      return fail(400, "invalid_asset", "Invalid logo_url");
    }
    patch.logo_url = v;
  }
  if (body.banner_url !== undefined) {
    const v = normalizeOrgAssetInput(body.banner_url, org.id);
    if (v === undefined) {
      return fail(400, "invalid_asset", "Invalid banner_url");
    }
    patch.banner_url = v;
  }
  // A logo or banner Vibe's moderators took down stays down. The takedown
  // clears the column but keeps the R2 object as evidence, so without this an
  // officer could send the same key back and the picture would be live again
  // (wave B follow-up P2). A new upload has a new random key and passes. The
  // log is read with the service role; a failed read refuses (fails closed).
  if (typeof patch.logo_url === "string" || typeof patch.banner_url === "string") {
    const removed = await checkRemovedPicture(service, "org", org.id, [patch.logo_url, patch.banner_url]);
    if (removed === "error") return fail(500, "load_failed", "Failed to update");
    if (removed === "removed") return fail(422, "picture_removed", REMOVED_PICTURE_MESSAGE);
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
    // Link labels print on the club page like its description does, so they
    // take the same word filter; only labels that aren't already stored are
    // judged, because the form re-sends the whole list on every save.
    if (hasBlockedNewLinkLabel(sanitized, org.links)) return contentBlockedResponse("links");
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
    const v = body.philanthropy.trim().slice(0, 500);
    // Published on the club page; the same "only what changed" filter as the
    // description above.
    if (!checkChangedText(v, org.philanthropy).ok) return contentBlockedResponse("philanthropy");
    patch.philanthropy = v;
  }

  // ── When it meets ────────────────────────────────────────────────────────
  // Wave 2 (C8): one line in the club's own words, shown on its page to
  // everyone, so the same "only what changed" filter as the description.
  // A string; "" clears it. Stored on a hidden club too: it is page text,
  // like the description, and nobody new sees it while the club is hidden.
  if (body.meeting_time !== undefined) {
    if (!meetingColumn) {
      return fail(503, "meeting_time_unavailable", "This isn't ready yet. Try again later.");
    }
    const meeting = normalizeMeetingTime(body.meeting_time);
    if (!meeting.ok) return fail(400, meeting.code, meeting.message);
    if (!checkChangedText(meeting.value, org.meeting_time).ok) return contentBlockedResponse("meeting_time");
    patch.meeting_time = meeting.value;
  }

  // ── The Board for followers ──────────────────────────────────────────────
  // Club model (Franky, Oct 16): followers read the club's Board unless its
  // owner or an admin turns that off here (the officer gate above). A
  // boolean, or the field left out. Stored on a hidden club too: it changes
  // nothing while the club is hidden, since a hidden club's Board is never
  // read by followers (the database's rule), and turning it off must work
  // whenever an officer wants it off.
  if (body.followers_read_board !== undefined) {
    if (typeof body.followers_read_board !== "boolean") {
      return fail(400, "invalid_followers_read_board", "Choose whether followers can read the Board.");
    }
    patch.followers_read_board = body.followers_read_board;
  }
  patch.updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 1) {
    return fail(400, "nothing_to_update", "Nothing to update");
  }

  // The Board setting comes back only when this save changed it: every other
  // save reads what it always did, so it works on a database without the
  // column. `meeting_time` comes back whenever the read above found the
  // column, so the page's copy of the club never loses it on another save.
  const boardChanged = BOARD_SETTING in patch;
  const meetingChanged = MEETING_TIME in patch;
  const runUpdate = (withMeeting: boolean) =>
    service
      .from("orgs")
      .update(patch)
      .eq("id", org.id)
      .select(`${ORG_SELECT}${withMeeting ? `, ${MEETING_TIME}` : ""}${boardChanged ? `, ${BOARD_SETTING}` : ""}`)
      .single();
  let { data: updated, error } = await runUpdate(meetingColumn);
  // The column went between the read and this write (a rollback): a save
  // that doesn't carry it is sent again without asking for it back. One
  // statement, so the failed attempt wrote nothing.
  if (error && meetingColumn && !meetingChanged && isMissingColumnError(error, [MEETING_TIME])) {
    ({ data: updated, error } = await runUpdate(false));
  }
  if (error || !updated) {
    if (boardChanged && isMissingColumnError(error, [BOARD_SETTING])) {
      return fail(503, "board_setting_unavailable", "This setting isn't ready yet. Try again later.");
    }
    if (meetingChanged && isMissingColumnError(error, [MEETING_TIME])) {
      return fail(503, "meeting_time_unavailable", "This isn't ready yet. Try again later.");
    }
    // A new background offered before the database takes it (the five new
    // keys with `NEW_BACKDROPS_LIVE` flipped before 20261026100000). One
    // statement, so nothing else in this save was written either.
    if ("backdrop_preset" in patch && isBackdropCheckError(error)) {
      console.warn("[orgs/[slug] PATCH] the database refused a background; is 20261026100000 applied?");
      return fail(409, "backdrop_not_ready", "That background isn't ready yet. Pick another one for now.");
    }
    console.error("[orgs/[slug] PATCH]", error);
    return fail(500, "update_failed", "Failed to update");
  }

  if (patch.audience !== undefined && nextAudience && nextAudience !== "both") {
    await revokeAudienceIneligibleInvites(service, org.id, nextAudience, user.id);
  }

  // Cast: the select is a string chosen above, which the client can't type.
  const saved = updated as unknown as { handle: string; logo_url: string | null; banner_url: string | null } & Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    org: {
      ...saved,
      logo_url: orgAssetProxyUrl(saved.handle, saved.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(saved.handle, saved.banner_url, "banner"),
      hidden: !!org.hidden_at,
    },
  });
}

/**
 * DELETE /api/orgs/[slug] — owner-only deletion. Cascades to org_members,
 * channels, join requests, invites, followers, removals, club notifications,
 * events (and their RSVPs) and, since 20260929110000_post_club_deletes.sql,
 * the club's POSTS (posts_org_id_fkey ON DELETE CASCADE; waveB-build call 1).
 *
 * S67 security wave 2, B2:
 *  - A club moderators have hidden can't be deleted by its owner ("You can't
 *    delete this club right now."): the cascade would erase its posts, chats
 *    and events while it is under review.
 *  - A post a moderator REMOVED is the record: the database detaches it from
 *    the club inside the delete itself (BEFORE DELETE trigger
 *    orgs_keep_removed_posts, same migration), so it survives the cascade,
 *    stays removed (visible to its author and admins only) and keeps its
 *    campus, even when the removal lands after this route read the club's
 *    posts. posts_update_own / posts_delete_own stop its author editing or
 *    deleting it.
 *  - This route is the only way to delete a club: authenticated holds no
 *    DELETE on orgs (same migration), so the checks below can't be skipped
 *    through the data API.
 *  - After the delete, the club's files go (best-effort, never fails the
 *    answer): the own files of each post that really went, then the club's
 *    R2 folder `orgs/<id>/` (logo, banner, post media, stale uploads),
 *    keeping every surviving post's files, a logo/banner a moderator took
 *    down, and anything an open report names
 *    (src/lib/posts/delete-media-store.ts). On a database still at SET NULL
 *    every post survives as a personal post and no file is touched.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  // `bigDelete`, shared with deleting an account (limits wave 3): before the
  // first read, so a refused caller costs nothing.
  const rl = await limitFor("bigDelete", user.id);
  if (!rl.allowed) return tooManyRequests(rl, "Too many tries. Try again in a few minutes.");

  // The delete runs on the service role (authenticated holds no DELETE on
  // orgs since 20260929110000_post_club_deletes.sql; orgs_delete is dormant),
  // so every rule lives here: a restricted owner is refused first (terms
  // first, as everywhere), then ownership, then the hidden-club refusal.
  const restrictedGate = await requireNotRestricted(user.id);
  if (restrictedGate) return restrictedGate;

  // Resolve + authorize explicitly: the service role would delete any club.
  const service = createSupabaseServiceClient();
  const { data: org, error: fetchErr } = await service
    .from("orgs")
    .select("id, owner_id, hidden_at")
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
    // Not the owner: a member hears "owner only"; a stranger asking about a
    // HIDDEN club hears what a made-up handle hears (`officerGate` with an
    // empty allow-list: nobody but the owner by owner_id gets through).
    const { data: membership, error: memberErr } = await service
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberErr) console.error("[orgs/[slug] DELETE role]", memberErr);
    const roleValue = memberErr ? null : (membership as { role?: unknown } | null)?.role;
    const gate = officerGate({
      hidden: org.hidden_at !== null,
      role: isOrgRole(roleValue) ? roleValue : null,
      allowed: [],
    });
    if (gate === "not_found") return fail(404, "not_found", "Not found");
    if (memberErr) return fail(500, "delete_failed", "Failed to delete");
    return fail(403, "owner_only", "Owner only");
  }

  // Hidden by moderators: under review, so its posts, chats and events stay.
  if (org.hidden_at !== null) {
    return fail(403, "club_hidden", "You can't delete this club right now.");
  }

  // The club's posts, read before the cascade takes them (their file refs).
  const { data: postRows, error: postsErr } = await service
    .from("posts")
    .select("id, user_id, org_id, media_url, media_thumbnail_url, removed_at")
    .eq("org_id", org.id);
  if (postsErr) {
    console.error("[orgs/[slug] DELETE posts read]", postsErr);
    return fail(500, "delete_failed", "Failed to delete");
  }
  const clubPosts = (postRows ?? []) as Array<DeletedPostRow & { removed_at: string | null }>;
  const removedPosts = clubPosts.filter((p) => p.removed_at !== null);
  const livePosts = clubPosts.filter((p) => p.removed_at === null);

  // Moderator-removed posts need no step here: the database detaches them
  // inside this delete (trigger orgs_keep_removed_posts), before the cascade.
  const { error } = await service.from("orgs").delete().eq("id", org.id);
  if (error) {
    console.error("[orgs/[slug] DELETE]", error);
    return fail(500, "delete_failed", "Failed to delete");
  }

  // Files only for the posts that really went with the club (CASCADE). A post
  // that is still there kept its files: under the old SET NULL that is every
  // post (touch nothing), and under CASCADE it is one a moderator removed
  // after the read above (the trigger kept it). A read error touches nothing.
  const survivors: DeletedPostRow[] = [];
  let checked = true;
  for (let i = 0; i < livePosts.length; i += 100) {
    const { data: left, error: leftErr } = await service
      .from("posts")
      .select("id, user_id, org_id, media_url, media_thumbnail_url")
      .in("id", livePosts.slice(i, i + 100).map((p) => p.id));
    if (leftErr) {
      console.error("[orgs/[slug] DELETE posts check]", leftErr);
      checked = false;
      break;
    }
    survivors.push(...((left ?? []) as DeletedPostRow[]));
  }
  const survived = new Set(survivors.map((p) => p.id));
  const gonePosts = livePosts.filter((p) => !survived.has(p.id));
  if (checked && (livePosts.length === 0 || gonePosts.length > 0)) {
    await purgeDeletedClubMedia(service, org.id, gonePosts, [...removedPosts, ...survivors]);
  } else {
    console.warn("[orgs/[slug] DELETE] club posts outlived the club; files left in place", org.id);
  }
  return NextResponse.json({ ok: true });
}
