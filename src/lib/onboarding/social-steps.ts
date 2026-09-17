/**
 * The pure half of onboarding's two social steps: "Follow clubs" (step 5) and
 * "follow a few people" (step 6). Wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S item 3,
 * with critic `wave-plan-sections/critic-W3.md` L2, L3 and M7.
 *
 * PURE AND CLIENT-SAFE. No fetch, no React, no server code. The only runtime
 * import is `@/lib/iu/campuses` (itself import-free); everything from
 * `join-copy` / `join-state` is `import type`, which type stripping erases.
 * So `social-steps.test.ts` loads it under plain `node --test`, the phone step
 * components (`src/components/mobile/onboarding/Step*.tsx`) render from it,
 * and the static desktop onboarding (`public/html/onboarding.html`, B13)
 * mirrors every export in plain JS, checked by a parity script on one fixture
 * set. Change a rule here and B13's mirror has to follow.
 *
 * CLUBS. Rows come from `GET /api/orgs?filter=discover` (never with `q`: that
 * widens to the whole university). The buttons a row shows are NOT decided
 * here: `relationFor` builds the `OrgRelation` that F5a's
 * `orgRowView(rel, "onboarding")` and `<OrgJoinControl variant="onboarding">`
 * read, so onboarding can't drift from the other club surfaces. Following is
 * derived exactly as plan §4.2 says: `org_follow_state === "following"`, or a
 * member (a member always follows). Never the PERSON `follow_state`.
 *
 * PEOPLE. Rows come from `GET /api/me/suggested-connections` (`suggestions`).
 * `groupPeople` buckets them by the server's `reason_v2`. ON PURPOSE (critic
 * L3) this differs from the People screen's groups (B14t, `NetworkMobile`):
 * onboarding's list is short, so `mutuals` and `new_on_vibe` share one "More
 * people on Vibe" bucket instead of "Friends of friends" / "New on Vibe".
 *
 * The group labels are duplicated from `ONB_COPY.people` (a lib must not import
 * a component folder); `social-steps.test.ts` asserts they stay equal.
 */

import { SYSTEM_LABEL, campusRowById, type SchoolSystem } from "@/lib/iu/campuses";
import type { OrgDisplayState, OrgRelation } from "@/lib/orgs/join-copy";
import type { JoinState, OrgRole } from "@/lib/orgs/join-state";

// ── Clubs ───────────────────────────────────────────────────────────────────

export type ClubRowInput = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified?: boolean;
  join_policy: "open" | "request" | "invite";
  audience: "both" | "iu" | "purdue";
  join_state: JoinState;
  join_reason: "policy" | "visiting" | null;
  role: OrgRole | null;
  pending_invite: { id: string; expires_at: string; invited_by_name: string | null } | null;
  org_follow_state?: "following" | "not_following";
};

/** A tap's answer, kept by the step until the list reloads. */
export type ClubLocal = { state?: OrgDisplayState; following?: boolean; role?: OrgRole | null };

const JOIN_STATES: readonly JoinState[] = [
  "member",
  "invited",
  "requested",
  "can_join",
  "can_request",
  "invite_only",
  "audience_blocked",
  "unverified",
  "hidden",
];
const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "mod", "member"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A trimmed, non-empty string, or null. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Discover rows, typed. Drops a row missing `id`, `handle` or `name`, a row
 * whose `join_state` isn't one of the nine states (there'd be no control to
 * render), and a repeated `id` (first wins). A non-array is `[]`.
 *
 * Defaults for a malformed field: an unknown `join_policy` reads as "request"
 * (the answer that promises least, as in `stateAfterDecline`), an unknown
 * `audience` as "both", an unknown `org_follow_state` is left out.
 */
export function parseClubRows(raw: unknown): ClubRowInput[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rows: ClubRowInput[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const id = text(r.id);
    const handle = text(r.handle);
    const name = text(r.name);
    const joinState = oneOf(r.join_state, JOIN_STATES);
    if (!id || !handle || !name || !joinState || seen.has(id)) continue;
    seen.add(id);

    const invite = asRecord(r.pending_invite);
    const inviteId = invite ? text(invite.id) : null;
    const inviteExpires = invite ? text(invite.expires_at) : null;
    const followState = oneOf(r.org_follow_state, ["following", "not_following"] as const);

    const row: ClubRowInput = {
      id,
      handle,
      name,
      logo_url: text(r.logo_url),
      verified: r.verified === true,
      join_policy: oneOf(r.join_policy, ["open", "request", "invite"] as const) ?? "request",
      audience: oneOf(r.audience, ["both", "iu", "purdue"] as const) ?? "both",
      join_state: joinState,
      join_reason: oneOf(r.join_reason, ["policy", "visiting"] as const),
      role: oneOf(r.role, ORG_ROLES),
      pending_invite:
        invite && inviteId && inviteExpires
          ? { id: inviteId, expires_at: inviteExpires, invited_by_name: text(invite.invited_by_name) }
          : null,
    };
    if (followState) row.org_follow_state = followState;
    rows.push(row);
  }
  return rows;
}

/** Plan §4.2: following, or a member (members always follow). */
export function isFollowingOrg(r: ClubRowInput): boolean {
  return r.org_follow_state === "following" || r.role != null || r.join_state === "member";
}

/**
 * Where a row sits in the list: an invite first (the strongest thing on the
 * step), then clubs you can simply join, then by-request, then invite-only,
 * and clubs you already follow or belong to last (nothing left to do there).
 */
export function clubBand(r: ClubRowInput): 0 | 1 | 2 | 3 | 4 {
  if (r.join_state === "invited") return 0;
  if (isFollowingOrg(r)) return 4;
  if (r.join_policy === "open") return 1;
  if (r.join_policy === "request") return 2;
  return 3;
}

/**
 * Stable sort by {@link clubBand}: the server's verified/recent order survives
 * inside each band. The step orders ONCE on load, so a row never jumps away
 * from the thumb that just tapped Follow on it.
 */
export function orderClubRows(rows: ClubRowInput[]): ClubRowInput[] {
  return rows
    .map((row, index) => ({ row, index, band: clubBand(row) }))
    .sort((a, b) => a.band - b.band || a.index - b.index)
    .map((entry) => entry.row);
}

/**
 * The `OrgRelation` F5a's `orgRowView` / `OrgJoinControl` render, with this
 * step's own answers (`local`) on top of the loaded row. A member always
 * follows, whatever `local.following` says.
 */
export function relationFor(r: ClubRowInput, local: ClubLocal | undefined): OrgRelation {
  const state: OrgDisplayState = local?.state ?? r.join_state;
  return {
    handle: r.handle,
    orgName: r.name,
    state,
    following: state === "member" ? true : (local?.following ?? isFollowingOrg(r)),
    role: local?.role ?? r.role,
    reason: r.join_reason,
    audience: r.audience,
    joinPolicy: r.join_policy,
  };
}

/** True when any row, with this step's taps applied, is followed or joined. */
export function anyClubFollowed(rows: ClubRowInput[], local: Record<string, ClubLocal>): boolean {
  return rows.some((r) => relationFor(r, local[r.id]).following);
}

// ── People ──────────────────────────────────────────────────────────────────

export type SuggestionInput = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  campus_id?: string | null;
  school_system?: "iu" | "purdue" | null;
  reason_v2?: string;
};

export type PeopleGroup = {
  key: "clubs" | "campus" | "major" | "system" | "more";
  label: string;
  people: SuggestionInput[];
};

/** Mirrors `ONB_COPY.people.group*` (`onb-copy.ts`); the test checks `groupPeople` labels against it. */
const PEOPLE_GROUP_LABELS = Object.freeze({
  clubs: "From your clubs",
  campus: "At {campus}",
  campusFallback: "On your campus",
  major: "Same major",
  system: "Elsewhere at {system}",
  more: "More people on Vibe",
});

/**
 * `{ suggestions }` rows, typed (critic L2: the step passes
 * `r.data.suggestions`). Drops a row with no `id`, a row with neither a name
 * nor a handle (nothing to show), and a repeated `id` (first wins). A
 * non-array is `[]`.
 */
export function parseSuggestions(raw: unknown): SuggestionInput[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const people: SuggestionInput[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const id = text(r.id);
    const name = text(r.name);
    const handle = text(r.handle);
    if (!id || (!name && !handle) || seen.has(id)) continue;
    seen.add(id);
    const person: SuggestionInput = {
      id,
      name,
      handle,
      avatar_url: text(r.avatar_url),
      major: text(r.major),
      campus_id: text(r.campus_id),
      school_system: oneOf(r.school_system, ["iu", "purdue"] as const),
    };
    const reason = text(r.reason_v2);
    if (reason) person.reason_v2 = reason;
    people.push(person);
  }
  return people;
}

const GROUP_ORDER: readonly PeopleGroup["key"][] = ["clubs", "campus", "major", "system", "more"];

/**
 * Buckets suggestions by `reason_v2`, in the order clubs, campus, major,
 * system, more. Server order is kept inside a group; empty groups are dropped.
 *
 * - `from_your_clubs` → "From your clubs"
 * - `same_campus` → "At {campus}": the viewer's campus short name, else the
 *   first row's campus; neither → "On your campus"
 * - `same_major` → "Same major"
 * - `same_system` → "Elsewhere at IU|Purdue": the viewer's system, else the
 *   row's. With neither, that row goes to "More people on Vibe".
 * - anything else (`mutuals`, `new_on_vibe`, missing) → "More people on Vibe"
 */
export function groupPeople(
  list: SuggestionInput[],
  o: { system: SchoolSystem | null; campusShortName: string | null },
): PeopleGroup[] {
  const buckets: Record<PeopleGroup["key"], SuggestionInput[]> = {
    clubs: [],
    campus: [],
    major: [],
    system: [],
    more: [],
  };
  for (const person of list) {
    switch (person.reason_v2) {
      case "from_your_clubs":
        buckets.clubs.push(person);
        break;
      case "same_campus":
        buckets.campus.push(person);
        break;
      case "same_major":
        buckets.major.push(person);
        break;
      case "same_system":
        if (o.system ?? person.school_system) buckets.system.push(person);
        else buckets.more.push(person);
        break;
      default:
        buckets.more.push(person);
    }
  }

  const labelFor = (key: PeopleGroup["key"], people: SuggestionInput[]): string => {
    const first = people[0];
    switch (key) {
      case "clubs":
        return PEOPLE_GROUP_LABELS.clubs;
      case "campus": {
        const campus =
          (o.campusShortName ?? "").trim() || campusRowById(first?.campus_id)?.shortName || "";
        return campus
          ? PEOPLE_GROUP_LABELS.campus.replace("{campus}", () => campus)
          : PEOPLE_GROUP_LABELS.campusFallback;
      }
      case "major":
        return PEOPLE_GROUP_LABELS.major;
      case "system": {
        // Every row in this bucket has a system (the viewer's or its own).
        const system = o.system ?? first?.school_system ?? "iu";
        return PEOPLE_GROUP_LABELS.system.replace("{system}", SYSTEM_LABEL[system]);
      }
      case "more":
        return PEOPLE_GROUP_LABELS.more;
    }
  };

  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: labelFor(key, buckets[key]),
    people: buckets[key],
  }));
}

/** 0 → "empty", 1–2 → "sparse", 3 or more → "full". */
export function listState(n: number): "empty" | "sparse" | "full" {
  if (!(n >= 1)) return "empty";
  return n < 3 ? "sparse" : "full";
}
