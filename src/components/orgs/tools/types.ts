/**
 * The shapes Club tools pass around (the club's view, wave 2, C10). Type
 * only, so the pure helpers next to it still load under plain `node --test`.
 * The row shapes mirror the officer-only routes they come from; names and
 * photos only ever reach a page through those routes.
 */
import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

/** The club and who is looking, read on the server by `loadOfficerClub`. */
export type ToolsClub = {
  id: string;
  handle: string;
  name: string;
  logoUrl: string | null;
  /** Checked by Vibe: the members' link needs it. */
  verified: boolean;
  hidden: boolean;
  joinPolicy: JoinPolicy;
  audience: OrgAudience;
  ownerId: string | null;
  /** The viewer's role: only the owner and officers (`admin`) get this far. */
  role: "owner" | "admin";
  viewerId: string;
};

/** A row of GET /api/orgs/[slug]/members. */
export type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  title: string | null;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean;
};

export type IneligibleReason = "audience_iu" | "audience_purdue" | "unverified";

/** A row of GET /api/orgs/[slug]/requests. */
export type RequestRow = {
  id: string;
  user_id: string;
  status: string;
  message: string | null;
  requested_at: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  school_verified: boolean;
  eligible?: boolean;
  ineligible_reason?: IneligibleReason | null;
  removed_before?: boolean;
  can_approve?: boolean;
};

/** A row of GET /api/orgs/[slug]/followers. */
export type FollowerRow = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  follows_since: string | null;
  org_follow_source: string | null;
  member_role: string | null;
};
