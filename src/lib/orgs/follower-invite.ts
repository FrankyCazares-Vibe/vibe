import {
  DECLINE_COOLDOWN_MS,
  audienceAllows,
  canApproveRequest,
  inviteIsLive,
  type OrgAudience,
  type OrgRole,
} from "./join-state";

/**
 * Where one follower stands for an invite, for Club tools > Followers (Club
 * tools Arc + joining made clear, Oct 22, 2026; handoffs/2026-10-22-club-tools-arc/
 * PLAN.md B3). Each non-member row on that screen gets the same button the
 * "Invite people" sheet would give them: Invite, Invited, Approve request,
 * Declined until a date, Invited enough until a date, or Not eligible with
 * the reason. `GET /api/orgs/[slug]/followers` reads the facts and calls
 * this; the screen hands the answer to `inviteRowButton` (join-copy.ts),
 * exactly as the sheet does.
 *
 * THE SAME DECISION AS THE SHEET'S. This is `candidateView` in
 * `src/app/api/orgs/[slug]/invite-candidates/route.ts`, same order (a live
 * invite, then a pending request, then the decline cooldown, then the pair
 * cap), the same cooldown constant, and the pair cap's two numbers passed in
 * from `../invites/route.ts` by the caller (a route module can't load under
 * `node --test`). A change to one must move the other: the test file holds
 * the cases side by side. (Lifting `candidateView` onto this function is a
 * follow-up for that route's owner; this batch doesn't own it.)
 *
 * ONE DIFFERENCE, ON PURPOSE. The sheet's followers list leaves out the
 * people an invite would be refused for (not a finished student account, the
 * trigger's placeholder handle, a block the send refuses: waveA-build ruling
 * 14), because a suggestion list can quietly skip someone. The Followers
 * screen can't: it lists everyone who follows. So those rows come back here
 * as "Not eligible" with NO reason line (`reason: null`), the same line an
 * account that never finished signing up gets, so the screen never says
 * which of the two it is and never tells an officer about somebody's block.
 * An unverified account still says so ("They haven't verified a school email
 * yet."), and an audience mismatch still names the school: both are true and
 * neither is a block.
 *
 * `state` FIRST, `eligible` only on "none" (the invite-candidates docblock):
 * a person invited before an officer's block reads "Invited", and one who
 * asked to join reads "Approve request" unless approving would be refused
 * (`can_approve: false`, which the screen shows as Requested with the
 * requests list's own line, never naming a block).
 *
 * PURE: only join-state.ts, so the test loads it with plain `node --test`.
 */

export type FollowerInviteState =
  | "invited"
  | "requested"
  | "declined_recently"
  | "invite_cap_reached"
  | "none";

export type FollowerInviteReason = "audience_iu" | "audience_purdue" | "unverified" | null;

/** What a non-member follower row carries as `invite` on the wire. */
export type FollowerInvite = {
  state: FollowerInviteState;
  eligible: boolean;
  reason: FollowerInviteReason;
  available_at: string | null;
  request_id: string | null;
  /** On a requested row: an officer removed them before. */
  removed_before: boolean;
  /** On a requested row: would approving be accepted for THIS officer? null otherwise. */
  can_approve: boolean | null;
};

/** One `org_invites` row from this club to this person, inside the pair window. */
export type InviteFact = {
  status: string;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
};

/** What the route read about one follower. */
export type FollowerFacts = {
  /** `users.school_verified === true`. */
  verified: boolean;
  /** `users.school_system`, or null when it isn't one we know. */
  system: "iu" | "purdue" | null;
  /**
   * A finished student account the send would look up at all:
   * `isDiscoverableAccount` and not on the trigger's `u<32hex>` handle.
   */
  finished: boolean;
  /** A block the send refuses (`inviteRefusedIds`): never shown as such. */
  refused: boolean;
  invites: readonly InviteFact[];
  /** Their pending request's id, or null. */
  requestId: string | null;
  removedBefore: boolean;
};

export type FollowerInviteContext = {
  audience: OrgAudience;
  /** The officer looking. */
  role: OrgRole;
  now: Date;
  /** `PAIR_INVITE_MAX` and `PAIR_INVITE_WINDOW_MS` from `../invites/route.ts`. */
  pairMax: number;
  pairWindowMs: number;
};

export function followerInvite(f: FollowerFacts, ctx: FollowerInviteContext): FollowerInvite {
  const nowMs = ctx.now.getTime();
  const audienceOk = audienceAllows(ctx.audience, f.system);
  const reason: FollowerInviteReason =
    !f.verified || f.system === null
      ? "unverified"
      : !audienceOk
        ? ctx.audience === "purdue"
          ? "audience_purdue"
          : "audience_iu"
        : null;
  const eligible = reason === null && f.finished && !f.refused;

  const out: FollowerInvite = {
    state: "none",
    eligible,
    reason,
    available_at: null,
    request_id: null,
    removed_before: false,
    can_approve: null,
  };

  if (f.invites.some((x) => x.status === "pending" && inviteIsLive(x, ctx.now))) {
    out.state = "invited";
    return out;
  }
  if (f.requestId) {
    // Critic A11: they asked first, so the officer approves the REQUEST.
    out.state = "requested";
    out.request_id = f.requestId;
    out.removed_before = f.removedBefore;
    out.can_approve = canApproveRequest(ctx.role, f.removedBefore) && !f.refused;
    return out;
  }

  const declinedAt = f.invites
    .filter((x) => x.status === "declined" && x.resolved_at)
    .map((x) => new Date(x.resolved_at as string).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a)[0];
  const cooldownUntil = declinedAt === undefined ? null : declinedAt + DECLINE_COOLDOWN_MS;
  if (cooldownUntil !== null && cooldownUntil > nowMs) {
    out.state = "declined_recently";
    out.available_at = new Date(cooldownUntil).toISOString();
    return out;
  }
  if (f.invites.length >= ctx.pairMax) {
    const oldest = f.invites
      .map((x) => new Date(x.created_at).getTime())
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)[0];
    out.state = "invite_cap_reached";
    out.available_at = oldest === undefined ? null : new Date(oldest + ctx.pairWindowMs).toISOString();
  }
  return out;
}
