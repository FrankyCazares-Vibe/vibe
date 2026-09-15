/**
 * Deploy safety for columns that arrive with a migration (plan §5.5).
 *
 * Until the migration is applied, Postgres answers a select of a missing
 * column with 42703 ("column users.campus_id does not exist") and PostgREST
 * answers an update with PGRST204 ("Could not find the 'campus_id' column of
 * 'users' in the schema cache"). Callers fall back to legacy columns only for
 * THOSE errors: the message has to name one of the columns in question, so an
 * unrelated 42703 (e.g. a trigger's `record "new" has no field …`) still
 * surfaces as a real failure instead of silently skipping the new columns.
 */

export type DbErrorLike =
  | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }
  | null
  | undefined;

/** The columns migration M1 (20260916100000_campuses_school_system) adds to users. */
export const M1_USER_COLUMNS = ["school_system", "campus_id", "campus_set_at"] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isMissingColumnError(
  error: DbErrorLike,
  columns: readonly string[] = M1_USER_COLUMNS,
): boolean {
  if (!error || columns.length === 0) return false;
  if (error.code && error.code !== "42703" && error.code !== "PGRST204") return false;

  const names = columns.map(escapeRegExp).join("|");
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  const postgres = new RegExp(`column\\s+(?:"?\\w+"?\\.)?"?(?:${names})"?\\s+does not exist`, "i");
  const postgrest = new RegExp(`could not find the '(?:${names})' column`, "i");
  return postgres.test(text) || postgrest.test(text);
}
