/**
 * ONE org join decision, used by every route and every surface (spec
 * `handoffs/2026-09-15-org-invites-audience-spec.md` §3.2, §3.3, §4.1; batch
 * B22).
 *
 * PURE ON PURPOSE. No imports at all — not Next, not Supabase, not even a
 * type from another module — so the decision order is unit-tested without a
 * database and can be imported from a server route, a server component or a
 * client component alike (`join-state.test.ts`). Everything that needs a
 * connection lives in `membership.ts` next door.
 *
 * WHY ONE FUNCTION. Before this, "can I join?" was `org.is_public` re-derived
 * in the join route, the org page, Discover, the phone Orgs tab and
 * onboarding. Five copies is five chances for the phone to offer a Join
 * button the server answers with 403. {@link orgJoinState} is the only place
 * the order below exists; a surface renders what it returns and a route acts
 * on what it returns.
 *
 * THE ORDER (spec §3.2) — first match wins:
 *   1. member                      → `member`
 *   2. hidden and not a member      → `hidden` for a platform admin, else `not_found`
 *   3. no verified school system    → `unverified`
 *   4. audience excludes them       → `audience_blocked`
 *   5. live invite                  → `invited`
 *   6. open, and not visiting       → `can_join`
 *   7. pending request              → `requested`
 *   8. invite-only                  → `invite_only`
 *   9. otherwise                    → `can_request` (`policy` | `visiting`)
 *
 * Why it is in that order:
 *   - Audience beats an invite: an invite sent before the officers narrowed
 *     the audience must not admit a student who is no longer eligible.
 *   - Open beats a leftover request: switching Request → Open must not strand
 *     the people who already asked.
 *   - A pending request beats invite-only (critic A11): the officer's sheet
 *     shows "Approve request", and the invite POST never admits anyone
 *     silently.
 *   - The visiting rule never applies to an invite: the officer picked them.
 *
 * TWO THINGS THIS FUNCTION DELIBERATELY DOES NOT ANSWER:
 *   - SIGNED OUT. Every input describes a signed-in viewer. `/orgs/[handle]`
 *     renders for anonymous visitors (`page.tsx:131-134`, `signedIn={!!user}`
 *     at `:213`), and handing this a synthetic `{school_system:null, …}` viewer
 *     returns `unverified` ("Verify your school email to join") where spec
 *     §5.1's last row wants "Sign in to join". Branch on `signedIn` FIRST and
 *     use {@link SIGNED_OUT} / {@link JoinDisplayState} in the copy layer, so
 *     the compiler makes the branch, not a reviewer.
 *   - "MAY THIS OFFICER ACT ON A HIDDEN ORG?" An officer of a hidden org is a
 *     member, so this returns `member` — correct for rendering, useless as a
 *     gate. Spec §3.4 wants 409 `org_hidden` on invite / approve / post EVEN
 *     for officers, so those routes read `org.hidden_at` themselves; routing
 *     that gate through this function alone would let an officer invite into a
 *     hidden org.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** How a non-member gets in. Mirrors `orgs.join_policy` (M1c). */
export type JoinPolicy = "open" | "request" | "invite";

/** Which verified universities may join. Mirrors `orgs.audience` (M1c). */
export type OrgAudience = "both" | "iu" | "purdue";

/** A row in `org_members.role`. */
export type OrgRole = "owner" | "admin" | "mod" | "member";

/**
 * The viewer's verified university (`users.school_system`), or null when they
 * have not verified a school email yet. Deliberately NOT the `SchoolSystem`
 * type from `@/lib/iu/campuses` — this module imports nothing — but the two
 * are the same union and assign to each other.
 */
export type ViewerSystem = "iu" | "purdue" | null;

/**
 * What a SIGNED-IN viewer may do about an org right now. There is no
 * "signed out" member on purpose — see the module header — so copy layers use
 * {@link JoinDisplayState}, which adds one.
 */
export type JoinState =
  | "member"
  | "invited"
  | "requested"
  | "can_join"
  | "can_request"
  | "invite_only"
  | "audience_blocked"
  | "unverified"
  | "hidden";

/**
 * The state of a viewer who is not signed in. {@link orgJoinState} can never
 * return it — nothing about an anonymous visitor is in the database — so it is
 * a separate value that copy layers (B25's `joinCopy`, the Discover row, the
 * phone Orgs tab) branch on before they call the decision at all.
 */
export const SIGNED_OUT = "signed_out";

/**
 * Every state a join button can render: the nine {@link JoinState} values plus
 * {@link SIGNED_OUT}. Type `joinCopy`'s first parameter with THIS and the
 * compiler refuses a copy table that forgets the signed-out row (spec §5.1).
 */
export type JoinDisplayState = JoinState | typeof SIGNED_OUT;

export type OrgJoinDecision = {
  /** `not_found` means "render and answer as if the org does not exist". */
  state: JoinState | "not_found";
  /** Only on `can_request`: why they must ask instead of tapping Join. */
  reason?: "policy" | "visiting";
  /** Only on `audience_blocked`: which university the org is open to. */
  audience?: "iu" | "purdue";
};

export type OrgJoinStateInput = {
  org: {
    join_policy: JoinPolicy;
    audience: OrgAudience;
    hidden_at: string | null;
    campus_id: string | null;
  };
  viewer: {
    school_system: ViewerSystem;
    campus_id: string | null;
    is_platform_admin: boolean;
  };
  /** The viewer's `org_members.role`, or null when they are not a member. */
  role: OrgRole | null;
  /** The viewer's live `org_invites` row, if any. Expiry is re-checked here. */
  pendingInvite: { id: string; expires_at: string } | null;
  /** The viewer's pending `org_join_requests` row, if any. */
  pendingRequest: { id: string } | null;
  /** Injected in tests; defaults to `new Date()`. */
  now?: Date;
};

// ── Settings that are one line to change ────────────────────────────────────

/**
 * Who may approve or deny a join request, and who sees the officer tools bar.
 * Matches today's live gate (`orgs/[slug]/requests/[id]/route.ts:57`).
 *
 * PENDING DEFAULT (Franky, being asked 2026-09-16). Change this array and
 * nothing else to move the approve gate.
 */
export const OFFICER_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin", "mod"]);

/**
 * Who may SEND and REVOKE invites. Owner and admin only — critic C2 overrides
 * the spec body's mod inclusion, because a mod could otherwise re-invite
 * somebody an owner had just removed or denied, and nothing records removals
 * yet (critic A8). Mods go back in once removals are recorded.
 *
 * PENDING DEFAULT (Franky, being asked 2026-09-16). To let mods invite, add
 * "mod" here — this array, and only this array, is the invite gate. Keep it
 * separate from {@link OFFICER_ROLES}: approving a request the student filed
 * is not the same power as adding a notification to a stranger's Otto.
 */
export const INVITE_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

/**
 * Who may change join policy and audience (spec §3.1 "settings officer").
 * Matches the live `orgs_update` policy and desktop's `canManage`.
 */
export const SETTINGS_ROLES: readonly OrgRole[] = Object.freeze(["owner", "admin"]);

/**
 * Do invite-only orgs appear in Discover, search, the map and onboarding for
 * students who were not invited? `true` shows them with an "Invite only"
 * label and no join button (spec Q1 recommendation): SAE is the only real
 * club, so hiding it would leave onboarding step 5 empty for every new
 * student, and a prospect seeing it is how they learn to talk to a brother.
 *
 * PENDING DEFAULT (Franky, being asked 2026-09-16). Flip to `false` and the
 * listing routes drop `join_policy = 'invite'` orgs for non-invitees. This is
 * the ONLY switch; no route hardcodes the answer.
 *
 * Hidden orgs are a different thing and are never listed for anyone.
 */
export const INVITE_ONLY_ORGS_IN_DISCOVERY = true;

/**
 * Shareable invite links / codes (`/orgs/sae?invite=…`). Off in v1: invites
 * are person-by-person, because a link posted to an Instagram story lets
 * anyone who sees it into an invite-only org, which is the opposite of "you
 * have to be invited" (spec Q3).
 *
 * PENDING DEFAULT (Franky, being asked 2026-09-16). Turning it on is not one
 * line of app code — it also needs an `org_invite_links` table, uses, expiry
 * and a revoke UI — but this flag is where the decision is recorded, and
 * every future link surface must read it.
 */
export const INVITE_LINKS_ENABLED = false;

/** How long a pending invite lives (`org_invites.expires_at` default). */
export const INVITE_TTL_DAYS = 30;

/** How long after a decline before the same org may invite again (spec §3.5). */
export const DECLINE_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `INVITE_TTL_DAYS` in milliseconds, for date arithmetic. */
export const INVITE_TTL_MS = INVITE_TTL_DAYS * DAY_MS;

/** `DECLINE_COOLDOWN_DAYS` in milliseconds. */
export const DECLINE_COOLDOWN_MS = DECLINE_COOLDOWN_DAYS * DAY_MS;

// ── Guards ──────────────────────────────────────────────────────────────────

export function isJoinPolicy(value: unknown): value is JoinPolicy {
  return value === "open" || value === "request" || value === "invite";
}

export function isOrgAudience(value: unknown): value is OrgAudience {
  return value === "both" || value === "iu" || value === "purdue";
}

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    value === "owner" || value === "admin" || value === "mod" || value === "member"
  );
}

/** Can this role approve or deny join requests? */
export function isOfficer(role: OrgRole | null | undefined): boolean {
  return role != null && OFFICER_ROLES.includes(role);
}

/** Can this role send or revoke invites? (critic C2: owner/admin in v1) */
export function canInvite(role: OrgRole | null | undefined): boolean {
  return role != null && INVITE_ROLES.includes(role);
}

/** Can this role change join policy and audience? */
export function isSettingsOfficer(role: OrgRole | null | undefined): boolean {
  return role != null && SETTINGS_ROLES.includes(role);
}

// ── Small rules ─────────────────────────────────────────────────────────────

/**
 * Spec §3.1: "audience allows" = `both` with ANY verified system, or an exact
 * match. An unverified student (`null`) is allowed by nothing — they are told
 * to verify (`unverified`), which is a different, friendlier state.
 *
 * Honest about what this is (critic A9): the check happens when they join. A
 * Purdue Indianapolis student holding an @iu.edu address reads as `iu`, and
 * re-verifying with the other university's address changes the answer.
 * Members are never re-checked. It is a label, not a boundary.
 */
export function audienceAllows(audience: OrgAudience, system: ViewerSystem): boolean {
  if (system === null) return false;
  return audience === "both" || audience === system;
}

/**
 * The visiting rule (plan §2.6): a student is visiting when BOTH campuses are
 * known and they differ. A campus-less org or a campus-less viewer is not
 * visiting — there is nothing to compare.
 */
export function isVisitingOrg(
  orgCampusId: string | null,
  viewerCampusId: string | null,
): boolean {
  return Boolean(orgCampusId) && Boolean(viewerCampusId) && orgCampusId !== viewerCampusId;
}

/**
 * Is this invite still live? Expiry is lazy in the database (spec §2.3): a
 * row can sit at `status = 'pending'` past `expires_at` until a writer flips
 * it, so every READER re-checks the clock here. An unparseable timestamp
 * counts as expired — the least-privilege answer for a data bug.
 */
export function inviteIsLive(
  invite: { expires_at: string } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!invite) return false;
  const expires = new Date(invite.expires_at).getTime();
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}

/** First word of a display name, or null when there is no usable name. */
export function firstNameOf(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/**
 * The name to show for whoever sent an invite — critic A7.
 *
 * Returns null whenever the viewer should NOT see a person: no inviter on the
 * row (their account was deleted, `invited_by` went null), or the viewer has
 * them blocked or muted. Callers render null as "an officer", so a blocked
 * officer never reaches the invitee by name through the org-page banner,
 * Discover's `pending_invite`, or the invite inbox — the three reads that
 * `loadHiddenUsers` does not already cover.
 *
 * Pass `hiddenUserIds` from `loadHiddenUsers(...).hidden.ids` (blocked in
 * either direction, plus active mutes), which is already a Set: a Set is used
 * as-is, so rendering a Discover page or an invite inbox stays O(rows) instead
 * of re-materialising the viewer's whole blocked-and-muted set once per row.
 * Anything else iterable is copied once, per call.
 */
export function visibleInviterFirstName(
  invitedBy: { id: string; name?: string | null } | null | undefined,
  hiddenUserIds?: ReadonlySet<string> | Iterable<string> | null,
): string | null {
  if (!invitedBy) return null;
  if (hiddenUserIds) {
    const hidden: ReadonlySet<string> =
      hiddenUserIds instanceof Set
        ? (hiddenUserIds as ReadonlySet<string>)
        : new Set<string>(hiddenUserIds);
    if (hidden.has(invitedBy.id)) return null;
  }
  return firstNameOf(invitedBy.name);
}

// ── Postgres error shapes (critic B2) ───────────────────────────────────────
//
// These two live in the PURE module, not next to the queries in
// `membership.ts`, for one reason: `membership.ts` starts with
// `import "server-only"`, which throws under plain `node --test` ("This module
// cannot be imported from a Client Component module"). B23 picks a user-facing
// status code out of them — 400 `self_invite` vs 500 vs 200 `{already:true}` —
// so the regex that makes that choice has to be reachable by a test.
// `membership.ts` re-exports both, so either import path works.

type PgLikeError = { code?: string | null; message?: string | null };

function asPgError(error: unknown): PgLikeError {
  return (error ?? {}) as PgLikeError;
}

/**
 * A unique-violation (23505). Two officers inviting the same person at the
 * same instant, or two taps on Join, race the partial unique indexes
 * (`org_invites_one_pending`, `org_join_requests_unique_pending`, and
 * `org_members`' own `(org_id, user_id)` key). That is a normal outcome, not
 * a 500: the caller maps it to `{already: true}` (critic B2).
 */
export function isUniqueViolation(error: unknown): boolean {
  return asPgError(error).code === "23505";
}

/**
 * The constraint a 23514 CHECK violation names, or null. `org_invites`' two
 * table CHECKs are named on purpose so B23 can tell them apart:
 * `org_invites_resolved_at_check` is a writer bug (500 — somebody flipped
 * `status` without setting `resolved_at`, critic B1) and
 * `org_invites_not_self_check` is the user's own doing (400 `self_invite`).
 * Non-23514 errors (a foreign-key 23503, say) return null, so a caller can
 * never mistake one for a CHECK it knows how to explain.
 */
export function checkConstraintName(error: unknown): string | null {
  const err = asPgError(error);
  if (err.code !== "23514") return null;
  const match = /constraint "?([a-z0-9_]+)"?/i.exec(err.message ?? "");
  return match?.[1] ?? null;
}

// ── The decision ────────────────────────────────────────────────────────────

/**
 * The spec §3.2 decision order, and the §3.3 matrix that falls out of it.
 *
 * Give it what the database says and it answers with one state. It never
 * throws, never reads the clock except through `now`, and never guesses: a
 * caller that cannot load something passes the least-privileged value (null
 * role, null system) and gets the least-privileged answer.
 */
export function orgJoinState(input: OrgJoinStateInput): OrgJoinDecision {
  const { org, viewer, role, pendingInvite, pendingRequest } = input;
  const now = input.now ?? new Date();

  // 1. A member is a member, in every policy, audience and hidden state.
  //    POST /join stays idempotent for them (200 {joined:true, role}).
  if (role) return { state: "member" };

  // 2. Hidden: gone for everyone but its members. A platform admin still sees
  //    that it exists (that is how /admin unhides it); everybody else gets the
  //    same answer as a handle that was never registered.
  if (org.hidden_at) {
    return { state: viewer.is_platform_admin ? "hidden" : "not_found" };
  }

  // 3. No verified school email → nothing to compare an audience against.
  //    "Verify your school email to join" beats every other message.
  if (viewer.school_system === null) return { state: "unverified" };

  // 4. Audience BEFORE invite, on purpose: an invite sent while the org was
  //    open to both universities must not admit an IU student after the
  //    officers narrowed it to Purdue. The invite is void; accept returns 403.
  if (!audienceAllows(org.audience, viewer.school_system)) {
    return {
      state: "audience_blocked",
      // `both` always allows a verified viewer, so the only way to get here is
      // a concrete university.
      audience: org.audience === "purdue" ? "purdue" : "iu",
    };
  }

  // 5. A live invite outranks the policy: the officers chose this person, so
  //    the visiting rule and invite-only both step aside.
  if (inviteIsLive(pendingInvite, now)) return { state: "invited" };

  // 6. Open, and at home → one tap. Deliberately ahead of a pending request so
  //    that flipping Request → Open does not strand the people who asked.
  const visiting = isVisitingOrg(org.campus_id, viewer.campus_id);
  if (org.join_policy === "open" && !visiting) return { state: "can_join" };

  // 7. They already asked. Idempotent: POST /join returns the same row.
  //    Ahead of invite-only (critic A11) so the officer sheet offers "Approve
  //    request" instead of an invite that would admit them without asking.
  if (pendingRequest) return { state: "requested" };

  // 8. Invite-only, no invite. Never files a request — that is the whole point
  //    of the policy, and a silent queue of hopefuls is not a feature.
  if (org.join_policy === "invite") return { state: "invite_only" };

  // 9. Request policy, or open-while-visiting (plan §2.6).
  return {
    state: "can_request",
    reason: org.join_policy === "open" ? "visiting" : "policy",
  };
}
