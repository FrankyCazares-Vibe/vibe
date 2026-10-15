/**
 * The Usage tab's pure helpers: the shape `public.admin_usage_summary`
 * answers, how that answer is cleaned, and the small-group floor the route
 * puts on it before anything reaches the browser. No imports at all, so
 * `node --test` loads it as is.
 *
 * DAYS ARE UTC DATES and weeks start on Monday (UTC), the way the function
 * counts them (20261014120000_admin_usage_summary.sql). A day here starts at
 * 8 pm Indiana time in summer and 7 pm in winter; the tab says so.
 *
 * THESE ARE TOTALS, NOT PEOPLE: every value is a count, a day, a campus
 * name, a club's public name or a wave's batch name. No id, handle, email or
 * message is in the shape, and a field the function sends that isn't in it
 * is dropped here.
 *
 * THE DAY TOTALS are a second answer, from `public.admin_usage_tally`
 * (20261014150000_usage_day_tally.sql): people with Vibe open per UTC day
 * and per Monday week, sign-up weeks coming back, the device kind of each
 * person's first visit of the day, and Otto and map opens. They are counted
 * as they happen, from the day that migration is applied, so they start
 * there and nothing before it is rebuilt. Same rules: counts only, the
 * small grouped cells floored before they leave the server.
 */

/** How far back the tab reads: today and the 29 days before it. */
export const USAGE_DAYS = 30;

/** A count from 1 up to one below this is shown as "<5". Nought stays nought. */
export const SMALL_CELL_FLOOR = 5;

/** A count as the browser sees it: the number, or "<5" for 1 to 4. */
export type Cell = number | "<5";

/** Club chat said as a band, not a count. The dash is an en dash. */
export type ChatBand = "0" | "1–9" | "10+";

const DOOR_DAY_KEYS = ["signups", "school_verified", "waitlist_form", "waitlist_founder_add", "codes_sent"] as const;

const USED_TOTAL_KEYS = [
  "posts",
  "comments",
  "likes",
  "reposts",
  "saves",
  "events",
  "rsvps",
  "people_follows",
  "club_follows",
  "club_members",
  "club_chat_messages",
  "direct_messages",
  "group_messages",
] as const;

const USED_DAY_KEYS = [
  "posts",
  "comments",
  "likes",
  "reposts",
  "saves",
  "events",
  "rsvps",
  "people_follows",
  "club_relationships",
  "club_chat_messages",
  "direct_messages",
] as const;

type Counts<K extends string> = { [P in K]: number };
type School = "iu" | "purdue" | "unknown";

/**
 * The whole answer, with `C` the type of a count that can be small enough
 * to point at a few people and `B` the type of a club's chat activity. Raw,
 * both are numbers; for the browser, `Cell` and `ChatBand`.
 */
type UsageShape<C, B> = {
  /** The server's own day (UTC), so the tab never trusts the laptop's clock. */
  today: string;
  /** The first day in every `by_day`. */
  since: string;
  days: number;
  door: {
    accounts: number;
    accounts_confirmed: number;
    school_verified: number;
    onboarded: number;
    by_day: ({ day: string } & Counts<(typeof DOOR_DAY_KEYS)[number]>)[];
  };
  waves: { batch: string; signups: C }[];
  back: {
    active_now: number;
    active_1d: number;
    active_7d: number;
    active_30d: number;
    by_day: { day: string; active: number }[];
    by_week: { week: string; active: number }[];
    /** Sign-ups per Monday week, and how many of them did something the week after. */
    cohorts: { week: string; signups: C; returned: C }[];
  };
  used: {
    /** All time, the rows that still exist. */
    totals: Counts<(typeof USED_TOTAL_KEYS)[number]>;
    by_day: ({ day: string } & Counts<(typeof USED_DAY_KEYS)[number]>)[];
  };
  clubs: {
    visible: number;
    officer_did_something_7d: number;
    event_this_month: number;
    chat_7d: number;
    per_club: { name: string; members: C; chat_7d: B; chat_30d: B; events_this_month: C }[];
  };
  where: {
    by_school: { school: School; accounts: C }[];
    by_campus: { campus: string; accounts: C }[];
  };
};

/** What `admin_usage_summary` answers, every count a number. Never sent to the browser. */
export type UsageRaw = UsageShape<number, number>;

/** What the tab is sent: the small counts floored, club chat in bands. */
export type UsageView = UsageShape<Cell, ChatBand>;

/* ---------------------------------------------------------------- the day totals */

/**
 * The day totals' columns, as `public.admin_usage_tally` names them
 * (20261014150000_usage_day_tally.sql). The table says `unknown` for both a
 * school and a device; the function answers `unknown_school` and
 * `unknown_device` so one day row can hold both.
 */
export const TALLY_SCHOOL_KEYS = ["iu", "purdue", "unknown_school"] as const;
export const TALLY_DEVICE_KEYS = ["phone", "desktop", "installed", "unknown_device"] as const;
export const TALLY_DAY_KEYS = ["active", ...TALLY_SCHOOL_KEYS, ...TALLY_DEVICE_KEYS, "otto_open", "map_open"] as const;

/**
 * A day's two marks, true or false, not counts: the cap turned at least one
 * Otto (or map) open away that day. The writer leaves the mark the moment it
 * turns one away, so a day reads "hit the cap" even when more people became
 * active later and the day's final opens sit under ten per person.
 */
export const TALLY_CAP_KEYS = ["otto_capped", "map_capped"] as const;

/**
 * How many weeks each sign-up week is followed for: its own week, then the
 * next four. The writer keeps cohort rows 0 to 28 days on and no further, so
 * nothing is stored that the tab doesn't show.
 */
export const TALLY_COHORT_WEEKS = 5;

/**
 * A day's Otto or map opens stop at this many times that day's active
 * people (at least one). The same 10 as OPEN_CAP_PER_ACTIVE in
 * src/lib/usage/touch.ts and the writer's `10 * greatest(v_active, 1)`;
 * written out here because this file imports nothing. view.test.ts checks
 * the two agree.
 */
export const TALLY_OPEN_CAP_PER_ACTIVE = 10;

type TallySchoolKey = (typeof TALLY_SCHOOL_KEYS)[number];
type TallyDeviceKey = (typeof TALLY_DEVICE_KEYS)[number];
type TallyCapKey = (typeof TALLY_CAP_KEYS)[number];

/**
 * One UTC day. `active` and the two opens are exact; the school and device
 * splits are `C`, floored for the browser like the other grouped cells; the
 * cap marks are true or false.
 */
type TallyDay<C> = { day: string; active: number; otto_open: number; map_open: number } & {
  [K in TallySchoolKey | TallyDeviceKey]: C;
} & { [K in TallyCapKey]: boolean };

type TallyShape<C> = {
  /** The server's own day (UTC). */
  today: string;
  /** The first day in `by_day`. */
  since: string;
  days: number;
  /** The first UTC day anything was counted, or null before the first count. */
  started: string | null;
  /**
   * The Monday after the week `started` falls in: the first whole week
   * counted. The week counting began in is partial even when it began on a
   * Monday (anyone the old Campus beat stamped earlier that day was missed).
   * A week before it is partial, and a sign-up week's cell before it is null.
   */
  first_week: string | null;
  /** Every day of the window, oldest first, zero-filled by the function. */
  by_day: TallyDay<C>[];
  /** Monday weeks, oldest first, ending with this one (still running). */
  by_week: { week: string; active: number; partial: boolean }[];
  /**
   * Sign-up weeks, oldest first. `seen[k]` is how many of the people who
   * signed up that week had Vibe open k weeks later (0 = their own week);
   * null where that week hasn't come yet or wasn't counted in full.
   */
  cohorts: { week: string; seen: (C | null)[]; next_week_pct: number | null }[];
};

/** What `admin_usage_tally` answers, every count a number. Never sent to the browser. */
export type TallyRaw = TallyShape<number>;

/** What the tab is sent: the school, device and sign-up week cells floored. */
export type TallyView = TallyShape<Cell>;

/**
 * The day totals' own state, beside the summary's: `off` while the
 * function's migration (20261014150000) is not applied, `failed` when it
 * answered something the tab can't read (the rest of the tab still shows).
 */
export type TallyState = { state: "off" } | { state: "failed" } | { state: "on"; view: TallyView };

/** What GET /api/admin/usage answers. */
export type AdminUsage = {
  ok: true;
  /** False while the function's migration (20261014120000) is not applied: nothing is counted yet. */
  ready: boolean;
  view: UsageView | null;
  /** Always false: one jsonb answer, nothing is paged or cut. Kept so the tab reads like Numbers. */
  truncated: false;
  /** The day totals (20261014150000), always set, whatever `ready` says. */
  tally: TallyState;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCHOOLS: readonly string[] = ["iu", "purdue", "unknown"];
const NOT_PICKED = "not picked";

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

/** A whole number from 0 up, or null. A bigint can arrive as a string; both read the same here. */
function count(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function day(v: unknown): string | null {
  return typeof v === "string" && DAY_RE.test(v) ? v : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Every key in `keys` as a count, in a fresh object; null when one is missing or bad. */
function counts<K extends string>(o: Obj | null, keys: readonly K[]): Counts<K> | null {
  if (!o) return null;
  const out = {} as Counts<K>;
  for (const k of keys) {
    const n = count(o[k]);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

/**
 * A list's rows, each cleaned by `row`; a row it can't read is dropped
 * rather than shown as something it isn't. No list at all reads as an empty
 * one (`jsonb_agg` over nothing is null); a list that is something else
 * entirely is a wrong shape.
 */
function rows<T>(v: unknown, row: (o: Obj) => T | null): T[] | null {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const o = obj(item);
    const r = o ? row(o) : null;
    if (r !== null) out.push(r);
  }
  return out;
}

/** A dated series (`day` or `week` plus counts), oldest first. Dates compare as text. */
function series<D extends "day" | "week", K extends string>(
  v: unknown,
  dateKey: D,
  keys: readonly K[],
): (Record<D, string> & Counts<K>)[] | null {
  const dated = rows(v, (o) => {
    const d = day(o[dateKey]);
    const c = counts(o, keys);
    return d && c ? { d, row: { [dateKey]: d, ...c } as Record<D, string> & Counts<K> } : null;
  });
  return dated && dated.sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
}

/** Members most first, then by name. */
function byMembers(a: { name: string; members: number }, b: { name: string; members: number }): number {
  return b.members - a.members || a.name.localeCompare(b.name);
}

/** Accounts most first, "not picked" last whatever its count, then by name. */
function byAccounts(a: { campus: string; accounts: number }, b: { campus: string; accounts: number }): number {
  const unpicked = Number(a.campus === NOT_PICKED) - Number(b.campus === NOT_PICKED);
  return unpicked || b.accounts - a.accounts || a.campus.localeCompare(b.campus);
}

function toDoor(o: Obj | null): UsageRaw["door"] | null {
  const totals = counts(o, ["accounts", "accounts_confirmed", "school_verified", "onboarded"] as const);
  const by_day = series(o?.by_day, "day", DOOR_DAY_KEYS);
  return totals && by_day ? { ...totals, by_day } : null;
}

/** A test batch is left out by the function; one that slipped through is dropped here too. */
function toWaves(v: unknown): UsageRaw["waves"] | null {
  return rows(v, (o) => {
    const batch = text(o.batch);
    const signups = count(o.signups);
    return batch && !batch.startsWith("test-") && signups !== null ? { batch, signups } : null;
  });
}

function toBack(o: Obj | null): UsageRaw["back"] | null {
  const active = counts(o, ["active_now", "active_1d", "active_7d", "active_30d"] as const);
  const by_day = series(o?.by_day, "day", ["active"] as const);
  const by_week = series(o?.by_week, "week", ["active"] as const);
  const cohorts = series(o?.cohorts, "week", ["signups", "returned"] as const);
  return active && by_day && by_week && cohorts ? { ...active, by_day, by_week, cohorts } : null;
}

function toUsed(o: Obj | null): UsageRaw["used"] | null {
  const totals = counts(obj(o?.totals), USED_TOTAL_KEYS);
  const by_day = series(o?.by_day, "day", USED_DAY_KEYS);
  return totals && by_day ? { totals, by_day } : null;
}

function toClubs(o: Obj | null): UsageRaw["clubs"] | null {
  const totals = counts(o, ["visible", "officer_did_something_7d", "event_this_month", "chat_7d"] as const);
  const per_club = rows(o?.per_club, (r) => {
    const name = text(r.name);
    const c = counts(r, ["members", "chat_7d", "chat_30d", "events_this_month"] as const);
    return name && c ? { name, ...c } : null;
  });
  return totals && per_club ? { ...totals, per_club: per_club.sort(byMembers) } : null;
}

function toWhere(o: Obj | null): UsageRaw["where"] | null {
  if (!o) return null;
  const by_school = rows(o.by_school, (r) => {
    const accounts = count(r.accounts);
    return typeof r.school === "string" && SCHOOLS.includes(r.school) && accounts !== null
      ? { school: r.school as School, accounts }
      : null;
  });
  const by_campus = rows(o.by_campus, (r) => {
    const campus = text(r.campus);
    const accounts = count(r.accounts);
    return campus && accounts !== null ? { campus, accounts } : null;
  });
  return by_school && by_campus ? { by_school, by_campus: by_campus.sort(byAccounts) } : null;
}

/**
 * The function's answer, cleaned, or null when it isn't the shape at all (a
 * section, a total or the dates missing or not what they should be): the
 * route then fails loudly rather than show nought for "couldn't read it".
 * Inside a list, a row that can't be read is dropped. Series come back
 * oldest first, clubs most members first, campuses most accounts first with
 * "not picked" last. Only the fields the shape names are kept.
 */
export function toUsageRaw(raw: unknown): UsageRaw | null {
  const r = obj(raw);
  if (!r) return null;
  const today = day(r.today);
  const since = day(r.since);
  const days = count(r.days);
  const door = toDoor(obj(r.door));
  const waves = toWaves(r.waves);
  const back = toBack(obj(r.back));
  const used = toUsed(obj(r.used));
  const clubs = toClubs(obj(r.clubs));
  const where = toWhere(obj(r.where));
  if (!today || !since || days === null || !door || !waves || !back || !used || !clubs || !where) return null;
  return { today, since, days, door, waves, back, used, clubs, where };
}

/**
 * 1 to 4 reads "<5"; nought stays nought, 5 and up stay the number.
 *
 * THE FLOOR IS COSMETIC, NOT PRIVACY. It keeps a wave, a week, a campus or a
 * club of two or three from reading like a head count at a glance. It does
 * not anonymise anything: exact totals sit right next to the floored cells
 * (with one visible club, `used.totals.club_members` IS that club's member
 * count), and the Clubs tab already shows exact member counts. What keeps
 * people out of this tab is that the function returns counts only.
 */
export function floorCell(n: number): Cell {
  return n >= 1 && n < SMALL_CELL_FLOOR ? "<5" : n;
}

/** A club's messages as a band: none, a few, a lot. */
function chatBand(n: number): ChatBand {
  if (n <= 0) return "0";
  return n < 10 ? "1–9" : "10+";
}

/**
 * The answer as the browser gets it: waves, cohorts, schools, campuses and
 * per-club members and events floored, per-club chat in bands. Every other
 * number (the totals, the actives, the daily series) is passed as is. The
 * route applies this on the server, so a raw small cell never leaves it.
 */
export function toUsageView(raw: UsageRaw): UsageView {
  return {
    today: raw.today,
    since: raw.since,
    days: raw.days,
    door: { ...raw.door, by_day: raw.door.by_day.map((d) => ({ ...d })) },
    waves: raw.waves.map((w) => ({ batch: w.batch, signups: floorCell(w.signups) })),
    back: {
      ...raw.back,
      by_day: raw.back.by_day.map((d) => ({ ...d })),
      by_week: raw.back.by_week.map((w) => ({ ...w })),
      cohorts: raw.back.cohorts.map((c) => ({
        week: c.week,
        signups: floorCell(c.signups),
        returned: floorCell(c.returned),
      })),
    },
    used: { totals: { ...raw.used.totals }, by_day: raw.used.by_day.map((d) => ({ ...d })) },
    clubs: {
      ...raw.clubs,
      per_club: raw.clubs.per_club.map((c) => ({
        name: c.name,
        members: floorCell(c.members),
        chat_7d: chatBand(c.chat_7d),
        chat_30d: chatBand(c.chat_30d),
        events_this_month: floorCell(c.events_this_month),
      })),
    },
    where: {
      by_school: raw.where.by_school.map((s) => ({ school: s.school, accounts: floorCell(s.accounts) })),
      by_campus: raw.where.by_campus.map((c) => ({ campus: c.campus, accounts: floorCell(c.accounts) })),
    },
  };
}

/* ---------------------------------------------------------------- the day totals: reading */

const DAY_MS = 86_400_000;

/** A real calendar day as `YYYY-MM-DD`, or null: "2026-02-30" passes the pattern but not this. */
function calendarDay(v: unknown): string | null {
  const d = day(v);
  if (!d) return null;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === d ? d : null;
}

/** `d` moved by `n` days. `d` must be a real `YYYY-MM-DD`; the answer is one too. */
export function addUtcDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of `d`'s week, as the function counts weeks (Monday first, UTC). */
export function mondayOf(d: string): string {
  const sunday0 = new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay();
  return addUtcDays(d, -((sunday0 + 6) % 7));
}

/** A date that must be there: a real day, or an explicit null. Missing or anything else is undefined. */
function dayOrNull(o: Obj, key: string): string | null | undefined {
  if (!(key in o)) return undefined;
  if (o[key] === null) return null;
  return calendarDay(o[key]) ?? undefined;
}

/**
 * Next-week share for a sign-up week: of the people seen in their own week,
 * how many were seen the week after, as a whole percent. Only when both
 * weeks were counted in full and the first is at least the floor: "1 of 2"
 * as 50% would read like a trend.
 */
function nextWeekPct(seen: ReadonlyArray<number | null>): number | null {
  const [first, next] = seen;
  if (first === null || first === undefined || next === null || next === undefined) return null;
  return first >= SMALL_CELL_FLOOR ? Math.round((100 * next) / first) : null;
}

/** Each day's cap marks beside its counts: true only where the function said true. */
function withCapMarks<R extends { day: string }>(days: R[], raw: unknown[]): (R & Record<TallyCapKey, boolean>)[] {
  const marks = new Map<string, Obj>();
  for (const v of raw) {
    const o = obj(v);
    const d = o && day(o.day);
    if (o && d) marks.set(d, o);
  }
  return days.map((d) => {
    const o = marks.get(d.day);
    return { ...d, otto_capped: o?.otto_capped === true, map_capped: o?.map_capped === true };
  });
}

/**
 * `admin_usage_tally`'s answer, cleaned, or null when it isn't the shape (a
 * date, `started`, `first_week` or a whole list missing): the route then
 * shows "couldn't read the day totals", never a section of noughts. A day,
 * week or sign-up week row that can't be read is dropped; a sign-up week
 * needs exactly TALLY_COHORT_WEEKS cells.
 *
 * Two things are worked out HERE whatever the function says, so a slip in
 * the SQL can't show a number that means something else: a week before
 * `first_week` is `partial`, and a sign-up week's cell is null when its week
 * is after this one or before `first_week`. The first counted week misses
 * anyone already stamped earlier that week, so its cells would read low and
 * a next-week share could pass 100%. `next_week_pct` is computed here too.
 */
export function toTallyRaw(raw: unknown): TallyRaw | null {
  const r = obj(raw);
  if (!r) return null;
  const today = calendarDay(r.today);
  const since = calendarDay(r.since);
  const days = count(r.days);
  const started = dayOrNull(r, "started");
  const first_week = dayOrNull(r, "first_week");
  if (!today || !since || days === null || started === undefined || first_week === undefined) return null;
  if (!Array.isArray(r.by_day) || !Array.isArray(r.by_week) || !Array.isArray(r.cohorts)) return null;

  const counted = series(r.by_day, "day", TALLY_DAY_KEYS);
  const by_day = counted && withCapMarks(counted, r.by_day);
  const weeks = series(r.by_week, "week", ["active"] as const);
  if (!by_day || !weeks) return null;
  const by_week = weeks.map((w) => ({ ...w, partial: first_week === null || w.week < first_week }));

  const thisWeek = mondayOf(today);
  const cohorts = rows(r.cohorts, (o) => {
    const week = calendarDay(o.week);
    if (!week || mondayOf(week) !== week) return null;
    if (!Array.isArray(o.seen) || o.seen.length !== TALLY_COHORT_WEEKS) return null;
    const seen: (number | null)[] = [];
    for (let k = 0; k < TALLY_COHORT_WEEKS; k += 1) {
      const n = o.seen[k] === null ? null : count(o.seen[k]);
      if (n === null && o.seen[k] !== null) return null;
      const at = addUtcDays(week, 7 * k);
      seen.push(at > thisWeek || first_week === null || at < first_week ? null : n);
    }
    return { week, seen, next_week_pct: nextWeekPct(seen) };
  });
  if (!cohorts) return null;
  cohorts.sort((a, b) => a.week.localeCompare(b.week));

  return { today, since, days, started, first_week, by_day, by_week, cohorts };
}

/**
 * The day totals as the browser gets them: the school and device splits and
 * the sign-up week cells floored ("<5" for 1 to 4; null stays null), the
 * day's active people and the two opens exact, as in the step-1 view. The
 * floor is cosmetic, not privacy (see `floorCell`): the exact active count
 * sits beside the splits, and on a quiet day a total can be one person.
 */
export function toTallyView(raw: TallyRaw): TallyView {
  const splits = [...TALLY_SCHOOL_KEYS, ...TALLY_DEVICE_KEYS];
  return {
    ...raw,
    by_day: raw.by_day.map((d) => {
      const out: TallyView["by_day"][number] = { ...d };
      for (const k of splits) out[k] = floorCell(d[k]);
      return out;
    }),
    by_week: raw.by_week.map((w) => ({ ...w })),
    cohorts: raw.cohorts.map((c) => ({
      week: c.week,
      seen: c.seen.map((n) => (n === null ? null : floorCell(n))),
      next_week_pct: c.next_week_pct,
    })),
  };
}

/** The days counted: the rows from `started` on (none before the first count). */
export function fromStart<R extends { day: string }>(rows: ReadonlyArray<R>, started: string | null): R[] {
  return started === null ? [] : rows.filter((r) => r.day >= started);
}

/** The weeks counted, the partial first one included: every week whose Sunday is on or after `started`. */
export function weeksFromStart<R extends { week: string }>(rows: ReadonlyArray<R>, started: string | null): R[] {
  return started === null ? [] : rows.filter((r) => addUtcDays(r.week, 6) >= started);
}

/**
 * "hit the cap": the stop turned at least one of that day's Otto (or map)
 * opens away, by the writer's own mark. Not worked out from the day's final
 * counts: the stop is checked at each open against the people active so
 * far, so a day can be cut early and still end under ten per person.
 */
export function openCapped(day: Record<TallyCapKey, boolean>, key: "otto_open" | "map_open"): boolean {
  return key === "otto_open" ? day.otto_capped === true : day.map_capped === true;
}
