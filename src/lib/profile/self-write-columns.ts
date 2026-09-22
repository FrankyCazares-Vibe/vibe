/**
 * The closed list of `public.users` columns a student's own profile save may
 * write.
 *
 * `POST /api/me/profile-sync` and `PATCH /api/me/profile` write the profile
 * with the SERVICE role (migration
 * 20260922130000_users_profile_detail_server_only takes skills, interests,
 * work_experience, pinned_post_id, looking_for and the old snapshot column
 * off the `authenticated` UPDATE grant). The service role passes every grant,
 * so the grant no longer catches a coding slip that writes a column no
 * student may touch (`school_verified`, `handle`, the campus columns...).
 * This list puts that net back: both routes refuse to write any key outside
 * it.
 *
 * It is exactly the union of the keys those two routes collect (the removed
 * professional snapshot is not one of them). Campus columns (written from
 * `campusDecision.patch`) and `handle` (written by `changeHandleForUser`) go
 * through their own statements and are deliberately NOT here. Adding a new
 * writable profile field means adding it here on purpose;
 * `self-write-columns.test.ts` pins the list.
 *
 * Pure: zero imports.
 */

export const SELF_PROFILE_WRITE_COLUMNS = Object.freeze([
  "name",
  "tagline",
  "website",
  "headline",
  "location_text",
  "bio",
  "major",
  "department",
  "year",
  "interests",
  "skills",
  "looking_for",
  "work_experience",
  "work_order_manual",
  "current_on",
  "resume_redactions",
  "resume_url",
  "resume_docs",
  "avatar_url",
  "banner_url",
  "banner_gradient",
] as const);

export type SelfProfileWriteColumn = (typeof SELF_PROFILE_WRITE_COLUMNS)[number];

const ALLOWED: ReadonlySet<string> = new Set(SELF_PROFILE_WRITE_COLUMNS);

/** The keys of `patch` that are not in the list, sorted. `[]` means safe. */
export function unexpectedSelfWriteKeys(patch: Record<string, unknown>): string[] {
  return Object.keys(patch)
    .filter((key) => !ALLOWED.has(key))
    .sort();
}
