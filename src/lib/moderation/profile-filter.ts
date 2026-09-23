/**
 * The profile word filter — one behaviour, in one place.
 *
 * `PATCH /api/me/profile` and `POST /api/me/profile-sync` write the same
 * `users` columns from the same two forms, and each carried its own copy of
 * this check. The copies had already drifted (one asked `checkChangedText`,
 * the other `sameStoredText`), and both checked only name, bio and tagline —
 * so a slur pasted into `headline`, `location_text`, `major` or `interests`
 * saved with a 200 and rendered on the profile, `headline` right beside the
 * name. Every free-text column a student writes and another student reads is
 * listed below, and both routes call this.
 *
 * ONLY WHAT CHANGED IS CHECKED (see text-filter.ts). Both forms re-send the
 * WHOLE profile on every autosave — the desktop editor every 1.2 s — so a
 * stored value that trips today's list must never fail a save the student
 * never made to it. Otherwise nothing on the profile can be saved again,
 * including the field that is the problem, and the student cannot see which
 * field that is. A value already on the row is always allowed through.
 *
 * The stored row is read only when a submitted value actually trips the
 * filter, which is close to never: an ordinary save pays for no extra read.
 * If the row can't be read, every value counts as changed — the check stays
 * on rather than falling open.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkChangedText, checkText } from "./text-filter";

/**
 * A KNOWN TRADE-OFF, the same shape as the one text-filter-list.ts records for
 * "a chink of light". Widening past name/bio/tagline puts PLACE NAMES and
 * EMPLOYER NAMES in front of a list that carries short word-boundary terms
 * which are also real proper nouns: Coon Rapids is a Minnesota suburb, Dyke
 * Industries is a building-products company and Dyke, Iowa is a town. A
 * student from one of those, or with a job at one, saves that text today and
 * is refused tomorrow.
 *
 * Two things soften it and neither removes it: the refusal names the ROW for a
 * list column (`work_experience[1]`), not just the section, so a student with
 * three jobs isn't hunting fifteen strings; and a value already on the row is
 * always allowed through, so it bites once, at the moment they type it.
 *
 * It is still a real false refusal. Dropping `location_text` from the scalars
 * or `work_experience` from the lists is a one-line change if Franky would
 * rather not take it.
 */

/** Free-text columns holding one value. */
const SCALAR_FIELDS = [
  "name",
  "bio",
  "tagline",
  "headline",
  "location_text",
  "major",
  "department",
] as const;

/**
 * Free-text columns holding a LIST. `interests` and `skills` are arrays of
 * strings; `work_experience`, `current_on` and `resume_docs` are arrays of
 * objects whose text lives under the keys below. Every entry is checked on
 * its own, so one clean interest can't carry a dirty one in beside it.
 *
 * `website`, `avatar_url`, `banner_url`, `resume_url` and the work /
 * current-on / resume-doc URLs are deliberately NOT here. A URL is validated
 * as a URL elsewhere, and the filter's separator-stripping pass would read a
 * path like `/in/first-last-1a2b` as one long word, which is a
 * false-positive machine — and a false positive on a profile field is a
 * student who cannot save.
 */
const LIST_FIELDS = [
  "interests",
  "skills",
  "work_experience",
  "current_on",
  "resume_docs",
] as const;

/** Text keys inside a `work_experience` row, a `current_on` item, a resume doc. */
const ROW_TEXT_KEYS = [
  "title",
  "company",
  "dates",
  "location",
  "description",
  "text",
  "name",
] as const;

/** The columns {@link blockedProfileField} reads back to answer "was this already stored?". */
const STORED_COLUMNS = [...SCALAR_FIELDS, ...LIST_FIELDS].join(",");

const isScalarField = (field: string): boolean =>
  (SCALAR_FIELDS as readonly string[]).includes(field);

/** One piece of text out of a list column, and which row of the list it sat in. */
type ListEntry = { index: number; text: string };

/**
 * Every trimmed, non-empty string a list column's value holds, each tagged
 * with its row. The row is what makes a refusal actionable: a student with
 * three jobs and five text keys apiece would otherwise be told only
 * "work_experience" and left to guess which of fifteen strings is the problem.
 */
function listEntries(value: unknown): ListEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ListEntry[] = [];
  value.forEach((item, index) => {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push({ index, text: t });
      return;
    }
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    for (const key of ROW_TEXT_KEYS) {
      const v = row[key];
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (t) out.push({ index, text: t });
    }
  });
  return out;
}

/**
 * The fields in `values` whose SUBMITTED text trips the filter. Says nothing
 * about whether the save is refused — that needs the stored row.
 */
export function suspectProfileFields(values: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const field of SCALAR_FIELDS) {
    const v = values[field];
    if (typeof v === "string" && !checkText(v).ok) out.push(field);
  }
  for (const field of LIST_FIELDS) {
    if (listEntries(values[field]).some((entry) => !checkText(entry.text).ok)) out.push(field);
  }
  return out;
}

/**
 * Of the fields already known to trip, the first one this save is actually
 * CHANGING. `stored` is the row as it stands; `{}` (an unreadable row) means
 * nothing counts as stored, so everything counts as changed.
 *
 * A scalar answers with the column name (`"headline"`). A list answers with
 * the column AND the row inside it (`"work_experience[1]"`, `"interests[3]"`),
 * which is what goes out as the 422's `field` so the editor can point at the
 * row rather than the whole section.
 */
export function blockedAgainstStored(
  values: Record<string, unknown>,
  stored: Record<string, unknown>,
  suspects: readonly string[],
): string | null {
  for (const field of suspects) {
    if (isScalarField(field)) {
      const before = typeof stored[field] === "string" ? (stored[field] as string) : null;
      if (!checkChangedText(values[field] as string, before).ok) return field;
      continue;
    }
    // A list entry is "unchanged" when the same text is already somewhere in
    // the stored list. Position doesn't matter: reordering interests is not
    // an edit to any of them.
    const already = new Set(listEntries(stored[field]).map((entry) => entry.text));
    for (const { index, text } of listEntries(values[field])) {
      if (!already.has(text) && !checkText(text).ok) return `${field}[${index}]`;
    }
  }
  return null;
}

/**
 * Run the filter over the free-text profile fields this request is changing,
 * and name the first one that fails — the `field` of the 422
 * `content_blocked` the route answers with. A list column names its row too:
 * `"work_experience[1]"`.
 *
 * `service` is the caller's service-role client: the private columns on
 * `users` have no read grant, and this needs the stored row to tell an edit
 * from an autosave.
 */
export async function blockedProfileField(
  service: SupabaseClient,
  userId: string,
  values: Record<string, unknown>,
): Promise<string | null> {
  const suspects = suspectProfileFields(values);
  if (suspects.length === 0) return null;

  const { data, error } = await service
    .from("users")
    .select(STORED_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // The ONLY signal that this module has quietly degraded to "refuse every
    // value the list trips on". Fail-closed is the right side to fall on, but
    // if the cause is a renamed or dropped column out of the twelve above it
    // is not one student's bad minute — it is every save, forever, for every
    // student whose profile already holds a listed term. So the line says what
    // it costs, not just that something failed.
    console.error(
      "[profile word filter] users row unreadable — the 'unchanged values are allowed' rule is OFF for this save",
      { userId, columns: STORED_COLUMNS, error },
    );
  }

  return blockedAgainstStored(values, (data ?? {}) as Record<string, unknown>, suspects);
}
