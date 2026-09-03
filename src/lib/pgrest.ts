/**
 * Helpers for building PostgREST filter strings safely.
 *
 * PostgREST's `or=` / `and=` grammar treats `,` `.` `(` `)` `"` `\` as
 * syntax. Interpolating raw user text into `.or(\`name.ilike.%${q}%\`)`
 * therefore lets `q=zzzz,email.ilike.fgc` append a filter on any column —
 * a boolean oracle against private columns. These helpers strip the
 * syntax characters and quote the remainder.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict RFC-4122 UUID check. Use before interpolating any request-supplied id into a filter string. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Build a safe `.or()` ilike disjunction. Strips PostgREST syntax chars and
 * LIKE wildcards, then double-quotes the value per PostgREST quoting rules.
 * Returns null when nothing searchable remains (caller should return an
 * empty result set rather than querying).
 */
export function ilikeOrFilter(columns: string[], rawQuery: string): string | null {
  const q = rawQuery
    .trim()
    .replace(/[%_,.()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  if (!q) return null;
  const val = `"%${q}%"`;
  return columns.map((c) => `${c}.ilike.${val}`).join(",");
}

/**
 * Same as {@link ilikeOrFilter} but anchors the pattern to the start of the
 * value (`q%`) — used for prefix-biased ranking in typeahead search.
 */
export function ilikePrefixOrFilter(columns: string[], rawQuery: string): string | null {
  const q = rawQuery
    .trim()
    .replace(/[%_,.()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  if (!q) return null;
  const val = `"${q}%"`;
  return columns.map((c) => `${c}.ilike.${val}`).join(",");
}
