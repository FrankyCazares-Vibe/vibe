import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logModerationAction } from "@/lib/auth/require-platform-admin";
import { allowedCampusId, isSchoolSystem, legacyLabel } from "@/lib/iu/campuses";
import { audienceAllows, type OrgAudience } from "@/lib/orgs/join-state";
import { admitMember, loadViewerOrgContext } from "@/lib/orgs/membership";
import { loadOrgBlocks } from "@/lib/orgs/org-blocks";

import {
  clubLinkState,
  dismissMembersLink,
  findClubLinkById,
  pendingClubLink,
  recordMembersLinkJoin,
  redeemSetupLink,
  type ClubLinkRow,
} from "./store";

/**
 * What a club link does for a signed-in account (the club's view, wave 1):
 * a setup link makes its club with them as owner; a members' link makes them
 * a member. Shared by POST /api/club-links/redeem (the link page's button)
 * and POST /api/me/onboarding-complete (a sign-up the link let in).
 *
 * The CALLER has already checked the account can publish (Terms, a verified
 * school email, no restriction): that is `requireCanPublish`. This file checks
 * the link and the club.
 */

export type RedeemOutcome =
  | { ok: true; kind: "setup"; handle: string; already: boolean }
  | { ok: true; kind: "members"; handle: string; already: boolean }
  | { ok: false; status: number; code: RedeemRefusal; message: string };

export type RedeemRefusal =
  | "link_used"
  | "link_expired"
  | "link_off"
  | "link_in_use"
  | "campus_required"
  | "audience"
  | "join_unavailable"
  | "failed";

const COPY: Record<RedeemRefusal, string> = {
  link_used: "That setup link has already been used. Ask Vibe for a new one.",
  link_expired: "That link has ended. Ask whoever shared it for a new one.",
  link_off: "That link has been turned off. Ask the club for a new one.",
  link_in_use: "Someone else is signing up with that setup link right now. Ask Vibe for a new one if it wasn't you.",
  campus_required: "Pick your campus in your profile first, then open the link again.",
  audience: "This club is open to students of the other university only.",
  join_unavailable: "You can't join this club through this link. Ask an officer.",
  failed: "Something went wrong. Try again in a minute.",
};

function refuse(status: number, code: RedeemRefusal): RedeemOutcome {
  return { ok: false, status, code, message: COPY[code] };
}

/** The link page's words for a link that no longer works. */
export function redeemRefusalCopy(code: RedeemRefusal): string {
  return COPY[code];
}

export async function redeemClubLink(
  service: SupabaseClient,
  link: ClubLinkRow,
  userId: string,
  /** Only from the onboarding path: the gate let this account in through the link before it ended. */
  opts: { claimed?: boolean } = {},
): Promise<RedeemOutcome> {
  return link.kind === "setup" ? redeemSetup(service, link, userId) : joinThroughLink(service, link, userId, opts);
}

async function redeemSetup(service: SupabaseClient, link: ClubLinkRow, userId: string): Promise<RedeemOutcome> {
  // The founder's own link may already have made this person's club (a
  // second tap, a second device): the database answers `already`.
  const { data: viewer, error } = await service
    .from("users")
    .select("school_system, campus_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !viewer) {
    if (error) console.error("[club-links] redeem setup viewer", error.message);
    return refuse(500, "failed");
  }
  const system = isSchoolSystem(viewer.school_system) ? viewer.school_system : null;
  const campusId = allowedCampusId(viewer.campus_id, system);
  if (!campusId) return refuse(400, "campus_required");

  const result = await redeemSetupLink(service, {
    linkId: link.id,
    userId,
    campusId,
    school: legacyLabel(campusId, system),
  });
  if (result.ok) {
    // The club is checked because a founder said so when making the link:
    // verification is a public claim, so it goes in the moderators' log
    // under that founder, as the Verify button's does.
    if (!result.already && link.checked && link.created_by) {
      await logModerationAction(service, {
        actorId: link.created_by,
        action: "org_verify",
        targetType: "org",
        targetId: result.orgId,
        meta: { handle: result.handle, via: "setup_link" },
      });
    }
    return { ok: true, kind: "setup", handle: result.handle, already: result.already };
  }
  switch (result.reason) {
    case "used":
      return refuse(409, "link_used");
    case "expired":
      return refuse(410, "link_expired");
    case "off":
    case "invalid":
      return refuse(410, "link_off");
    case "in_use":
      return refuse(409, "link_in_use");
    default:
      return refuse(500, "failed");
  }
}

async function joinThroughLink(
  service: SupabaseClient,
  link: ClubLinkRow,
  userId: string,
  opts: { claimed?: boolean },
): Promise<RedeemOutcome> {
  if (!link.org_id) return refuse(410, "link_off");
  const { data: org, error } = await service
    .from("orgs")
    .select("id, handle, verified, hidden_at, audience")
    .eq("id", link.org_id)
    .maybeSingle();
  if (error) {
    console.error("[club-links] join org", error.message);
    return refuse(500, "failed");
  }
  if (!org || org.hidden_at || !org.verified) return refuse(410, "link_off");

  const ctx = await loadViewerOrgContext(service, org.id, userId);
  if (!ctx.ok) return refuse(500, "failed");
  if (ctx.role) return { ok: true, kind: "members", handle: org.handle, already: true };

  // The link must still work: off, or past its end, unless this person's
  // sign-up came through it in time (they were promised the question).
  const state = clubLinkState(link);
  if (state === "off") return refuse(410, "link_off");
  if (state === "expired" && !opts.claimed) return refuse(410, "link_expired");

  if (ctx.viewer.school_system === null) return refuse(403, "failed");
  if (!audienceAllows(org.audience as OrgAudience, ctx.viewer.school_system)) return refuse(403, "audience");
  // An officer removed them, or an officer blocked them: a shared link
  // doesn't undo that. The words never name a block.
  if (ctx.removed) return refuse(403, "join_unavailable");
  const blocks = await loadOrgBlocks(service, org.id, userId);
  if (!blocks.ok) return refuse(500, "failed");
  if (blocks.blockedByOfficer) return refuse(403, "join_unavailable");

  // The officers shared the link: it admits like an invite, whatever the
  // club's join policy and wherever the person's campus is.
  const admitted = await admitMember(service, { orgId: org.id, userId, actorId: userId, via: "invite" });
  if (!admitted.ok) return refuse(500, "failed");
  await recordMembersLinkJoin(service, link.id, userId);
  return { ok: true, kind: "members", handle: org.handle, already: admitted.already };
}

/** "Not now" on the members' link question after sign-up. */
export async function declineClubLink(service: SupabaseClient, link: ClubLinkRow, userId: string): Promise<void> {
  if (link.kind === "members") await dismissMembersLink(service, link.id, userId);
}

/** The page that asks about a link waiting for a new account (members) or explains a setup link that failed. */
export const CLUB_LINK_WELCOME_PATH = "/c/welcome";

/** Where an owner's club setup list lives. */
export function clubSetupPath(handle: string): string {
  return `/orgs/${encodeURIComponent(handle)}/setup`;
}

/**
 * Where a sign-up goes when onboarding finishes, if a club link let it in:
 * a setup link makes the club now and opens its setup list; a members' link
 * opens the question "Join <club>?". Null when no link is waiting (the usual
 * next page then). Never throws: a failure here must not cost the person
 * their finished onboarding, so it falls back to the welcome page, which
 * asks again.
 */
export async function clubLinkNextAfterOnboarding(
  service: SupabaseClient,
  userId: string,
  /** Asked only when a setup link is waiting: may this account make a club? */
  canPublish: () => Promise<boolean>,
): Promise<string | null> {
  try {
    const pending = await pendingClubLink(service, userId);
    if (!pending) return null;
    if (pending.kind === "members" || !(await canPublish())) return CLUB_LINK_WELCOME_PATH;
    const link = await findClubLinkById(service, pending.linkId);
    if (!link) return null;
    const outcome = await redeemClubLink(service, link, userId, { claimed: true });
    return outcome.ok ? clubSetupPath(outcome.handle) : CLUB_LINK_WELCOME_PATH;
  } catch (e) {
    console.error("[club-links] after onboarding", e);
    return CLUB_LINK_WELCOME_PATH;
  }
}
