/**
 * The school calendars' off switch (CONTRACT.md §3.7). ON BY DEFAULT
 * (Franky, Oct 19): nothing set anywhere means every calendar shows.
 *
 * Two ways to turn calendars off, and either one wins:
 *   - `SCHOOL_EVENTS_OFF` (server env, Production; never NEXT_PUBLIC_):
 *     applies from the next deploy;
 *   - the `public.app_settings` row `school_events_off`: applies in about
 *     30 s, no deploy (read in read-server.ts). Writing that row is a
 *     production write, so it needs Franky's OK at that moment. Shipping
 *     writes no row. Off (`true`, or a JSON array of words like
 *     '["iub-athletics"]'::jsonb or '["iu-bloomington"]'::jsonb):
 *       insert into public.app_settings (key, value) values ('school_events_off', 'true'::jsonb)
 *       on conflict (key) do update set value = excluded.value, updated_at = now();
 *     Back on:
 *       delete from public.app_settings where key = 'school_events_off';
 *     Before rolling production back to a build older than this rule
 *     (9117dc6 or before), delete a row that holds a Bloomington word: that
 *     build reads an unknown word as "everything off", Indy included.
 *
 * The words a list understands (Oct 19, 2026): a calendar key
 * (SCHOOL_SOURCE_KEYS) turns that calendar off; a campus id
 * (SCHOOL_CAMPUS_KEYS: "indianapolis", "iu-bloomington") turns off every
 * calendar of that campus; an off word ("true", "all", ...) turns off all.
 *
 * WHY AN UNKNOWN WORD IS IGNORED (Oct 19, 2026, was "all off"): with two
 * campuses, "all off" for a word this build doesn't know meant a Bloomington
 * name written on an older build (or after a rollback) hid Indianapolis too.
 * An unknown word now turns nothing off and is logged once; only a value
 * whose SHAPE is wrong (a number, an object, blank entries, only commas)
 * still turns everything off, since that can't be read as any list at all.
 *
 * PURE: no imports but types, no environment read here (the caller passes
 * the value in), so the tests load it straight from disk.
 */
import type { SchoolSourceKey } from "./types";

/**
 * Each campus's calendars, in credit order. sources.ts gives every feed the
 * same campus, and sources.test.ts checks the two agree.
 */
export const SCHOOL_CAMPUS_KEYS: Readonly<Record<string, readonly SchoolSourceKey[]>> = Object.freeze({
  indianapolis: Object.freeze<SchoolSourceKey[]>(["athletics", "iu-student-affairs", "iu-featured"]),
  "iu-bloomington": Object.freeze<SchoolSourceKey[]>(["iub-athletics", "iub-student-life", "iub-featured"]),
});

export const SCHOOL_SOURCE_KEYS: readonly SchoolSourceKey[] = Object.freeze(Object.values(SCHOOL_CAMPUS_KEYS).flat());

export type SchoolSwitch = { all: boolean; sources: ReadonlySet<SchoolSourceKey> };

/** Everything on. */
export const SCHOOL_ON: SchoolSwitch = Object.freeze({ all: false, sources: new Set<SchoolSourceKey>() });

/** Everything off. `sources` names every calendar too, so a caller that only checks the set is safe. */
const SCHOOL_ALL_OFF: SchoolSwitch = Object.freeze({ all: true, sources: new Set<SchoolSourceKey>(SCHOOL_SOURCE_KEYS) });

const ON_WORDS = new Set(["", "false", "0", "no", "off"]);
const OFF_WORDS = new Set(["true", "1", "yes", "on", "*", "all"]);

function isSourceKey(value: string): value is SchoolSourceKey {
  return (SCHOOL_SOURCE_KEYS as readonly string[]).includes(value);
}

/** A campus id's calendars, or null when the word isn't a campus with calendars. */
function campusKeys(value: string): readonly SchoolSourceKey[] | null {
  return Object.prototype.hasOwnProperty.call(SCHOOL_CAMPUS_KEYS, value) ? SCHOOL_CAMPUS_KEYS[value] : null;
}

/** These calendars off; every one named means all off. */
function offFor(keys: Iterable<SchoolSourceKey>): SchoolSwitch {
  const sources = new Set<SchoolSourceKey>(keys);
  if (SCHOOL_SOURCE_KEYS.every((k) => sources.has(k))) return SCHOOL_ALL_OFF;
  return sources.size === 0 ? SCHOOL_ON : { all: false, sources };
}

/**
 * A list of entries (from the env's commas or the setting's array). Known
 * keys and campus ids go off; unknown entries are ignored and reported. An
 * off word inside a list ("athletics,all") means all off.
 */
function offFromList(entries: string[]): { value: SchoolSwitch; unknown: string[] } {
  const keys: SchoolSourceKey[] = [];
  const unknown: string[] = [];
  for (const entry of entries) {
    if (OFF_WORDS.has(entry)) return { value: SCHOOL_ALL_OFF, unknown: [] };
    const campus = campusKeys(entry);
    if (campus) keys.push(...campus);
    else if (isSourceKey(entry)) keys.push(entry);
    else unknown.push(entry);
  }
  return { value: offFor(keys), unknown };
}

const warned = new Set<string>();

/** One warning per distinct bad value per server instance, so a typo can't flood the log. */
function warnOnce(kind: string, detail: string): void {
  const key = `${kind}:${detail}`;
  if (warned.has(key) || warned.size > 50) return;
  warned.add(key);
  console.warn("[school-events] switch", kind, detail);
}

/**
 * `SCHOOL_EVENTS_OFF`, trimmed and lower-cased. Unset, "", "false", "0",
 * "no", "off": on. "true", "1", "yes", "on", "*", "all": every calendar off.
 * A comma list of calendar keys and campus ids ("iub-athletics",
 * "iu-bloomington,iu-featured"): those off. An unknown word ("ture", a key
 * from a newer build) turns nothing off, with one warning. Only commas and
 * spaces (",") name nothing at all: every calendar off, with one warning.
 */
export function parseSchoolOffEnv(raw: string | undefined): SchoolSwitch {
  const value = (raw ?? "").trim().toLowerCase();
  if (ON_WORDS.has(value)) return SCHOOL_ON;
  if (OFF_WORDS.has(value)) return SCHOOL_ALL_OFF;
  const entries = value
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  // Something was set, but it names nothing (","): read it as a typo, so the switch fails toward hiding.
  if (entries.length === 0) {
    warnOnce("SCHOOL_EVENTS_OFF unreadable, all off", JSON.stringify(value.slice(0, 40)));
    return SCHOOL_ALL_OFF;
  }
  const { value: result, unknown } = offFromList(entries);
  if (unknown.length) warnOnce("SCHOOL_EVENTS_OFF unknown words ignored", unknown.join(","));
  return result;
}

/**
 * The `app_settings` row's jsonb value. `true`: all off. An array of
 * strings: those keys and campuses off (the env list's rules, so an unknown
 * word is ignored). `false`, null or no row (undefined): on, and so is `[]`
 * (it names nothing to turn off). Anything else ("true" as a string, a
 * number, an object, an array holding a non-string, or only blank strings
 * like [""]): all off.
 */
export function parseSchoolOffSetting(value: unknown): SchoolSwitch {
  if (value === undefined || value === null || value === false) return SCHOOL_ON;
  if (value === true) return SCHOOL_ALL_OFF;
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === "string")) {
      warnOnce("school_events_off unreadable, all off", "array");
      return SCHOOL_ALL_OFF;
    }
    const entries = (value as string[]).map((v) => v.trim().toLowerCase()).filter(Boolean);
    // [""] or ["  "]: someone meant to name a calendar and didn't, so hide rather than stay on.
    if (value.length > 0 && entries.length === 0) {
      warnOnce("school_events_off unreadable, all off", "blank keys");
      return SCHOOL_ALL_OFF;
    }
    const { value: result, unknown } = offFromList(entries);
    if (unknown.length) warnOnce("school_events_off unknown words ignored", unknown.join(","));
    return result;
  }
  warnOnce("school_events_off unreadable, all off", typeof value);
  return SCHOOL_ALL_OFF;
}

/** Off if either says off: all off from either side, else the calendars both name. */
export function mergeSchoolSwitch(a: SchoolSwitch, b: SchoolSwitch): SchoolSwitch {
  if (a.all || b.all) return SCHOOL_ALL_OFF;
  return offFor([...a.sources, ...b.sources]);
}
