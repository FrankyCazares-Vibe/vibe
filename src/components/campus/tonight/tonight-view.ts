/**
 * "What's the vibe tonight?" (Oct 19 2026): the pure rules every Tonight
 * surface shares. The desktop panel, the phone card and sheet and the Events
 * tab all draw what `buildTonight` decides, so #1 is #1 everywhere.
 *
 * THE RANKING IS THE PRODUCT'S PROMISE. #1 is the school's own featured
 * pick, else tonight's home game (decision 7, Oct 19 2026: a game beats a
 * school event that's merely on now, on every campus), else the school event
 * on now, else the soonest one; then the other school events; then club
 * events. NEVER BY POPULARITY: `going_count` and
 * `interested_count` are read only to print "12 going" (from 5 up, the
 * counts-are-public floor), never to order anything. A test pins that.
 *
 * PURE: type imports plus campus-time, so node:test loads it as is.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.2, copy §5.7.
 */
import type { CampusEvent } from "@/app/campus/campus-home";
import type { SchoolEvent, SchoolSource } from "@/lib/school-events/types";

import {
  addCampusDays,
  campusClock,
  campusDay,
  campusHour,
  campusLongDay,
  campusShortDay,
  isCampusMidnight,
  type CampusDay,
} from "./campus-time";
import type {
  ComingUpEntry,
  ItemText,
  LeadReason,
  TonightFilter,
  TonightItem,
  TonightLead,
  TonightView,
  WeekTile,
} from "./types";

/** A club's count shows from 5 people up (the app-wide "counts public from 5" rule). */
export const TONIGHT_COUNT_FLOOR = 5;

const HOUR_MS = 3_600_000;
/** Longer than this and it's not a "tonight" thing (a week-long club drive) and gets no " to …" tail. */
const LONG_EVENT_MS = 12 * HOUR_MS;
/** A row whose end is missing or before its start is treated as two hours long, like a game. */
const DEFAULT_LENGTH_MS = 2 * HOUR_MS;
const NEXT_UP_MAX = 3;
const HOME_WEEK_MAX = 8;
/** From 5 PM on campus a game is "tonight's", before that "today's": the week tiles, the rule line and who leads. */
const EVENING_HOUR = 17;

/**
 * Every word the Tonight surfaces print (§5.7): plain English, the boards'
 * words, straight apostrophes like the live app. `reasons` and `filters` are
 * keyed by `LeadReason` and `TonightFilter`; `more` takes the count.
 */
export const TONIGHT_COPY = {
  title: "What's the vibe tonight?",
  tonight: "Tonight",
  alsoTonight: "Also tonight",
  alsoClubs: "Also tonight from clubs",
  clubsOnly: "Tonight from clubs",
  allInEvents: "All in Events",
  comingUp: "Coming up",
  schoolTag: "School event",
  reasons: { next: "Up next", live: "Happening now", featured: "Featured by your school" },
  more: (n: number): string => (n >= 1 ? `+${n} more tonight` : "Nothing else tonight"),
  nothingElse: "Nothing else tonight",
  empty: "Nothing on campus tonight yet.",
  nextUp: "Next up this week",
  homeWeek: "Home games this week",
  tickets: "Tickets",
  watch: "Watch on ESPN+",
  seeCalendar: "See it on the calendar",
  yourClubs: "Your clubs",
  seeAll: "See all",
  yourClubsSub: "Latest on each club's Board",
  findClubs: "Find clubs on campus",
  noClubs: "Join or follow a club to see its Board here.",
  // The same words as ORG_COPY.board.followedEmpty (src/lib/orgs/join-copy.ts).
  boardEmpty: "Nothing on the Board yet",
  filterGroup: "Show events from",
  filters: { all: "All", school: "School", clubs: "Clubs" },
  // "more": Tonight above may already list tonight's school events.
  noSchoolWeek: "No more school events this week",
  // The body under noSchoolWeek, one string for the phone and the desktop.
  // No campus named (Oct 19, 2026): Bloomington shows it too, and its
  // calendars are IU Athletics and IU Bloomington's.
  noSchoolWeekBody: "Home games and school events from this campus's calendars show here.",
  noClubsComing: "No club events coming up",
  actionSchool: "Opens its calendar page in a new tab.",
  actionClub: "Opens the event.",
  creditLead: "School events:",
} as const;

/** The count a club row may show: the raw number from 5 up, else null (no number at all). */
export function publicGoing(raw: number | null | undefined): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.trunc(raw);
  return n >= TONIGHT_COUNT_FLOOR ? n : null;
}

/** On right now: started, not ended (end exclusive). */
export function isLive(start: number, end: number, now: number): boolean {
  return start <= now && now < end;
}

/**
 * Part of tonight: not ended, starts before campus midnight, and either
 * starts today or is a short thing that began last night and is still on.
 * A long multi-day club event that began before today is not "tonight".
 */
export function isTonight(start: number, end: number, now: number, day: CampusDay): boolean {
  return end > now && start < day.end && (start >= day.start || end - start <= LONG_EVENT_MS);
}

/**
 * The word after a game's start time: " tip-off", " kickoff", " first serve",
 * " first pitch", else "". Football, baseball and softball added Oct 19, 2026
 * (Bloomington's feed has all three).
 */
export function sportTail(sport: string | null): string {
  if (!sport) return "";
  const s = sport.toLowerCase();
  if (s.includes("basketball")) return " tip-off";
  if (s.includes("volleyball")) return " first serve";
  if (s.includes("soccer") || s.includes("football")) return " kickoff";
  if (s.includes("baseball") || s.includes("softball")) return " first pitch";
  return "";
}

/**
 * The campus's athletics calendar among an answer's sources: the one with
 * role "athletics" (Oct 19, 2026), else, from a server older than that, the
 * key "athletics" (Indy's). Null when that calendar is off.
 */
export function athleticsSource(sources: readonly SchoolSource[]): SchoolSource | null {
  return sources.find((s) => s.role === "athletics") ?? sources.find((s) => s.key === "athletics") ?? null;
}

/** The words beside "Home games this week": "IU Athletics" in Bloomington, "IU Indy Athletics" in Indy. */
export function homeWeekLabel(sources: readonly SchoolSource[]): string {
  const athletics = athleticsSource(sources);
  return athletics?.label ?? (athletics?.key === "athletics" ? "IU Indy Athletics" : "");
}

/** Why #1 is #1, in the words the slot prints. */
export function reasonLabel(reason: LeadReason): string {
  return TONIGHT_COPY.reasons[reason];
}

// ── Items ─────────────────────────────────────────────────────────────────

/** Start and end in ms; null when the start doesn't parse (that row is skipped). */
function spanOf(startsAt: string, endsAt: string): { start: number; end: number } | null {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return null;
  const parsedEnd = Date.parse(endsAt);
  const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start + DEFAULT_LENGTH_MS;
  return { start, end };
}

/** " to 8:00 PM", " to midnight", or "" for a long event. */
function untilTail(start: number, end: number): string {
  if (end - start > LONG_EVENT_MS) return "";
  return isCampusMidnight(end) ? " to midnight" : ` to ${campusClock(end)}`;
}

/** Joins the non-empty parts with ", " (what a screen reader reads). */
function spokenList(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(", ");
}

/** Code-unit order: the same answer on every device (localeCompare depends on the device's ICU). */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A row before its words: just what sorting and the tonight test need. The
 * route sends up to 200 school events over 12 days and this runs every
 * minute on every Tonight surface, so the words (several Intl calls each)
 * are only worked out for the few rows that are actually shown.
 */
type Span =
  | { kind: "school"; ev: SchoolEvent; key: string; title: string; start: number; end: number }
  | { kind: "club"; ev: CampusEvent; key: string; title: string; start: number; end: number };

/** Soonest first, then title, then key: the one order every list uses (never a count). */
function byStart(a: Span, b: Span): number {
  return a.start - b.start || compareText(a.title, b.title) || compareText(a.key, b.key);
}

function schoolSpans(list: readonly SchoolEvent[]): Span[] {
  const out: Span[] = [];
  for (const ev of list) {
    const span = spanOf(ev.starts_at, ev.ends_at);
    if (span) out.push({ kind: "school", ev, key: `school:${ev.id}`, title: ev.title, ...span });
  }
  return out.sort(byStart);
}

function clubSpans(list: readonly CampusEvent[]): Span[] {
  const out: Span[] = [];
  for (const ev of list) {
    const span = spanOf(ev.starts_at, ev.ends_at);
    if (span) out.push({ kind: "club", ev, key: `club:${ev.id}`, title: ev.title, ...span });
  }
  return out.sort(byStart);
}

/** The words for one shown row, in campus time. */
function itemOf(s: Span, now: number): TonightItem {
  const { start, end } = s;
  const live = isLive(start, end, now);
  const time = campusClock(start);
  const day = campusShortDay(start);
  if (s.kind === "school") {
    const ev = s.ev;
    const game = ev.kind === "game";
    const sport = game ? ev.sport : null;
    const host = ev.host ?? "";
    const place = ev.location ?? "";
    const text: ItemText = {
      time,
      // A game's end in the feed is a guess (start + 2 h), so a game never prints one.
      timeTail: game ? sportTail(sport) : untilTail(start, end),
      day,
      place,
      byline: sport ? `${host} · ${sport}` : host,
      subline: game ? (sport ? `${sport} · Home` : "Home game") : "",
      // No counts on school events in v1: nobody can RSVP to them yet.
      count: "",
      spoken: spokenList([live ? TONIGHT_COPY.reasons.live : null, time, ev.title, "school event", host, sport, place]),
    };
    return { kind: "school", key: s.key, ev, live, text };
  }
  const ev = s.ev;
  // Printed only, from 5 up. Nothing in this file reads it to order rows.
  const going = publicGoing(ev.going_count);
  const club = ev.org?.name?.trim() ?? "";
  const place = (ev.location ?? "").trim();
  const count = going !== null ? `${going} going` : "";
  const text: ItemText = {
    time,
    timeTail: untilTail(start, end),
    day,
    place,
    byline: club,
    subline: "",
    count,
    spoken: spokenList([live ? TONIGHT_COPY.reasons.live : null, time, ev.title, club, place, count]),
  };
  return { kind: "club", key: s.key, ev, live, going, text };
}

/** The first one on now, else the first (the list is soonest first). */
function pickLead(list: Span[], now: number): Span | null {
  return list.find((s) => isLive(s.start, s.end, now)) ?? list[0] ?? null;
}

/**
 * Tonight on campus, for one filter: #1, the other school items, the club
 * items, "+N more", and (only when nothing is on) the next three this week.
 */
export function buildTonight(input: {
  school: SchoolEvent[];
  clubs: CampusEvent[];
  sources: SchoolSource[];
  filter?: TonightFilter;
  now: number;
}): TonightView {
  const { now, sources } = input;
  const filter = input.filter ?? "all";
  const day = campusDay(now);
  // The filter goes first, so a hidden kind can't lead or count.
  const schoolAll = filter === "clubs" ? [] : schoolSpans(input.school);
  const clubAll = filter === "school" ? [] : clubSpans(input.clubs);
  const tonight = (s: Span) => isTonight(s.start, s.end, now, day);
  const schoolTonight = schoolAll.filter(tonight);
  const clubTonight = clubAll.filter(tonight);

  // #1: the school's featured pick, else tonight's home game, else a school
  // item, else a club item. Only times and kinds decide it (pickLead); a
  // count is never looked at here.
  let leadSpan: Span | null = null;
  let reason: LeadReason = "next";
  const featured = pickLead(
    schoolTonight.filter((s) => s.kind === "school" && s.ev.featured),
    now,
  );
  if (featured) {
    leadSpan = featured;
    reason = "featured";
  } else {
    // Why the game first (decision 7, Oct 19, 2026, every campus): a home
    // game is the night's big shared thing, so it beats a talk or a fair
    // that's merely on now. The game on now, else the soonest one tonight.
    // Only a game from 5 PM ("a home game TONIGHT", the week tiles' own
    // split) or one on right now: an afternoon game that hasn't started
    // ranks like any school event, so a noon game no longer leads past a
    // hike that has been on since 9 AM.
    const game = pickLead(
      schoolTonight.filter(
        (s) =>
          s.kind === "school" &&
          s.ev.kind === "game" &&
          (campusHour(s.start) >= EVENING_HOUR || isLive(s.start, s.end, now)),
      ),
      now,
    );
    leadSpan = game ?? pickLead(schoolTonight, now) ?? pickLead(clubTonight, now);
    if (leadSpan) reason = isLive(leadSpan.start, leadSpan.end, now) ? "live" : "next";
  }
  const lead: TonightLead | null = leadSpan ? { ...itemOf(leadSpan, now), reason } : null;
  const school = schoolTonight.filter((s) => s !== leadSpan).map((s) => itemOf(s, now));
  const clubs = clubTonight.filter((s) => s !== leadSpan).map((s) => itemOf(s, now));

  // Nothing on tonight: the next three this week, both kinds, soonest first.
  let nextUp: TonightItem[] = [];
  if (!lead) {
    const weekEnd = addCampusDays(day, 7).start;
    nextUp = [...schoolAll, ...clubAll]
      .filter((s) => s.start >= day.end && s.start < weekEnd && s.end > now)
      .sort(byStart)
      .slice(0, NEXT_UP_MAX)
      .map((s) => itemOf(s, now));
  }

  // The calendars behind what's on screen, in the fixed source order.
  const used = new Set<string>();
  for (const item of [...(lead ? [lead] : []), ...school, ...nextUp]) {
    if (item.kind === "school") used.add(item.ev.source);
  }
  const credits = sources.filter((s) => used.has(s.key));

  return {
    dayKey: day.key,
    dayLabel: day.label,
    lead,
    school,
    clubs,
    more: school.length + clubs.length,
    nextUp,
    credits,
  };
}

// ── Words around #1 ───────────────────────────────────────────────────────

/**
 * The small line under #1 that says why it is first (the sheet and the Events
 * hero). No "your school can feature one" (Franky, Oct 19 2026): a school or
 * its licensing office could read that as the school taking part in Vibe.
 */
export function leadRuleLine(lead: TonightLead): string {
  if (lead.kind === "club") return "Nothing from your school tonight, so the soonest club event leads.";
  if (lead.reason === "featured") return "Your school featured this today. Never paid, never ranked by popularity.";
  if (lead.reason === "live") return "First because it's on right now.";
  // A game that hasn't started may lead past an earlier school event (decision 7), so
  // "starts soonest" could be false for it. "Tonight's" only from 5 PM, as on the
  // week tiles (Oct 19, 2026: a 3 PM swim meet said "tonight's" above a "TODAY 3:00 PM" tile).
  if (lead.ev.kind === "game") {
    const when = campusHour(Date.parse(lead.ev.starts_at)) >= EVENING_HOUR ? "tonight's" : "today's";
    return `First because it's ${when} home game.`;
  }
  return "First because it starts soonest.";
}

/**
 * The phone card read aloud as one button: "What's the vibe tonight, Sat,
 * Nov 7. Up next: IU Indy vs UT Martin, school event, Athletics, 5:00 PM,
 * James T. Morris Arena. Plus 3 more tonight. Opens the list."
 */
export function cardSpoken(view: TonightView): string {
  const head = `What's the vibe tonight, ${view.dayLabel}.`;
  const lead = view.lead;
  if (!lead) return `${head} ${TONIGHT_COPY.empty} Opens the list.`;
  const who =
    lead.kind === "school" ? ["school event", lead.ev.host] : [lead.text.byline];
  const what = spokenList([lead.ev.title, ...who, lead.text.time, lead.text.place, lead.text.count]);
  const more = view.more >= 1 ? `Plus ${view.more} more tonight.` : `${TONIGHT_COPY.nothingElse}.`;
  return `${head} ${reasonLabel(lead.reason)}: ${what}. ${more} Opens the list.`;
}

/**
 * The group headings under #1. `heroShown`: #1 is drawn as the big hero
 * (the Events tab draws only a SCHOOL #1 that way; a club #1 there is the
 * first club row, so it counts as a club row here). "Also tonight from
 * clubs" whenever something sits above the club rows (a hero or school
 * rows), else "Tonight from clubs". Null for a group with no rows.
 */
export function sectionHeadings(
  view: TonightView,
  heroShown: boolean,
): { school: string | null; clubs: string | null } {
  const clubLeadAsRow = !heroShown && view.lead?.kind === "club";
  const clubRows = view.clubs.length + (clubLeadAsRow ? 1 : 0);
  const somethingAbove = (heroShown && view.lead !== null) || view.school.length > 0;
  return {
    school: view.school.length > 0 ? TONIGHT_COPY.alsoTonight : null,
    clubs: clubRows === 0 ? null : somethingAbove ? TONIGHT_COPY.alsoClubs : TONIGHT_COPY.clubsOnly,
  };
}

/**
 * Whether the Events tab draws its Tonight block: with the school part on
 * it always does (empty or not); without it, only when something is on, so
 * a campus with no school calendar and a quiet night shows nothing new.
 */
export function tonightSectionVisible(view: TonightView | null, schoolOn: boolean): boolean {
  return view !== null && (schoolOn || view.lead !== null);
}

// ── The phone sheet's week and the Events tab's "Coming up" ───────────────

/** Home games from two days back to four days ahead (the sheet's tiles), soonest first, at most 8. */
export function buildHomeWeek(school: SchoolEvent[], now: number): WeekTile[] {
  const day = campusDay(now);
  const from = addCampusDays(day, -2).start;
  const to = addCampusDays(day, 5).start;
  // Times first, words only for the tiles that are drawn. By kind, not the
  // key "athletics" (Oct 19, 2026): only an athletics feed makes games, and
  // Bloomington's is "iub-athletics".
  const games = schoolSpans(school.filter((ev) => ev.kind === "game"))
    .filter((t) => t.start >= from && t.start < to)
    .slice(0, HOME_WEEK_MAX);
  const tiles: WeekTile[] = [];
  for (const t of games) {
    if (t.kind !== "school") continue;
    const ev = t.ev;
    const clock = campusClock(t.start);
    let state: WeekTile["state"];
    let label: string;
    let said: string;
    if (t.end <= now) {
      state = "final";
      label = "Final";
      said = "final";
    } else if (isLive(t.start, t.end, now)) {
      state = "live";
      label = "Now";
      said = "happening now";
    } else if (t.start < day.end) {
      state = "today";
      const word = campusHour(t.start) >= EVENING_HOUR ? "Tonight" : "Today";
      label = `${word} ${clock}`;
      said = `${word.toLowerCase()} ${clock}`;
    } else {
      state = "later";
      label = clock;
      said = clock;
    }
    const sport = ev.sport ?? "";
    tiles.push({
      key: t.key,
      ev,
      day: campusShortDay(t.start),
      state,
      label,
      sport,
      versus: ev.matchup ? `vs ${ev.matchup.away}` : ev.title,
      spoken: `${campusLongDay(t.start)}: ${spokenList([sport, ev.title, said])}`,
    });
  }
  return tiles;
}

/** School events after tonight, within the next 7 campus days, soonest first ("Coming up"). */
export function upcomingSchool(school: SchoolEvent[], now: number): SchoolEvent[] {
  const day = campusDay(now);
  const weekEnd = addCampusDays(day, 7).start;
  const out: SchoolEvent[] = [];
  for (const t of schoolSpans(school)) {
    if (t.kind === "school" && t.end > now && t.start >= day.end && t.start < weekEnd) out.push(t.ev);
  }
  return out;
}

/** Start in ms for sorting; an unparseable start sorts last. */
function startOf(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/**
 * "Coming up": every club event from /api/events (tonight's too: its card
 * stays the RSVP place) and the given school list (callers pass
 * `upcomingSchool(...)`), filtered, soonest first, then by title.
 */
export function mergeComingUp(input: {
  clubs: CampusEvent[];
  school: SchoolEvent[];
  sources: SchoolSource[];
  filter: TonightFilter;
}): ComingUpEntry[] {
  const out: Array<{ entry: ComingUpEntry; start: number; title: string }> = [];
  if (input.filter !== "school") {
    for (const ev of input.clubs) {
      out.push({ entry: { kind: "club", key: `club:${ev.id}`, ev }, start: startOf(ev.starts_at), title: ev.title });
    }
  }
  if (input.filter !== "clubs") {
    for (const ev of input.school) {
      const source = input.sources.find((s) => s.key === ev.source) ?? null;
      out.push({
        entry: { kind: "school", key: `school:${ev.id}`, ev, source },
        start: startOf(ev.starts_at),
        title: ev.title,
      });
    }
  }
  out.sort(
    (a, b) =>
      (a.start === b.start ? 0 : a.start < b.start ? -1 : 1) ||
      compareText(a.title, b.title) ||
      compareText(a.entry.key, b.entry.key),
  );
  return out.map((o) => o.entry);
}
