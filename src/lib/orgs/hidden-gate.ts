/**
 * The officer-route gate for a HIDDEN club (S67 security wave 2, Low
 * "officer-only club routes answer 403, not 404, for a hidden club").
 *
 * A hidden club does not exist to anybody outside it. An officer-only route
 * that answers a stranger "403 Staff only" has just told them the handle is a
 * real, hidden club; the org page, Discover and the join route all answer 404
 * for the same person. So every officer-only route asks this one question in
 * this one order:
 *
 *   1. hidden, and the caller is not a member of it  → "not_found" (404)
 *   2. the caller's role isn't one of `allowed`      → "forbidden" (403)
 *   3. otherwise                                     → "ok"
 *
 * A member who isn't an officer already knows the club exists, so they get
 * the honest 403. A platform admin who isn't a member gets the 404 too, the
 * same as `requireInviteOfficer` in `api/orgs/[slug]/invites/route.ts`, which
 * already followed this rule: admin tools work on hidden clubs through
 * `/api/admin/**`, never through the officer routes.
 *
 * PURE ON PURPOSE: only a type import, so `hidden-gate.test.ts` loads it under
 * plain `node --test` and the routes turn the answer into their own response
 * shape (each route family has its own error body).
 */

import type { OrgRole } from "./join-state";

export type OfficerGate = "ok" | "not_found" | "forbidden";

export function officerGate(args: {
  /** `orgs.hidden_at` is set. */
  hidden: boolean;
  /** The caller's `org_members.role`, or null when they are not a member. */
  role: OrgRole | null;
  /** The roles this route serves, e.g. `OFFICER_ROLES` or `["owner","admin"]`. */
  allowed: readonly OrgRole[];
}): OfficerGate {
  const { hidden, role, allowed } = args;
  if (hidden && role === null) return "not_found";
  if (role === null || !allowed.includes(role)) return "forbidden";
  return "ok";
}
