import type { JoinPolicy, OrgAudience } from "@/lib/orgs/join-state";

/** The club as the club page draws it (page.tsx shapes it on the server). */
export type ClubPageOrg = {
  id: string;
  handle: string;
  name: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  join_policy: JoinPolicy;
  audience: OrgAudience;
  hidden: boolean;
  campus_id: string | null;
  verified: boolean;
  backdrop_preset: string;
  links: Array<{ label: string; url: string }> | null;
  philanthropy: string;
  /** "Thursdays · 7 PM, the Lantern Room"; "" when unset or the column is missing. */
  meeting_time: string;
  last_activity_at: string | null;
  /**
   * Null when the count read failed: omitted, never rendered as 0 (C27).
   * Also null below 5 for anyone outside the club (`publicMemberCount`,
   * counts public from 5 up); members see the exact number.
   */
  member_count: number | null;
  /**
   * The count this viewer may see (`headerCount`): exact for the owner and
   * officers, null below 5 for everyone else, null when the read failed.
   */
  follower_count: number | null;
  dormant: boolean;
};
