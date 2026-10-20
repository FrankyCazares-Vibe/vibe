/**
 * The school calendars Vibe reads on Campus, and how each feed's rows become
 * SchoolEvent rows (CONTRACT.md §3.3-3.4). PURE: no network, no clock, no
 * environment; read-server.ts fetches and remembers.
 *
 * The list is fixed here, never taken from a request: the route can't be
 * talked into fetching some other address. The order is the credit order.
 */
import { clipText as clip, parseIcs, type IcsEvent } from "./ics";
import type { SchoolEvent, SchoolSource } from "./types";

/**
 * How one athletics feed writes its games (Oct 19, 2026: one set per campus,
 * since Bloomington's Sidearm feed words things differently from Indy's).
 */
export type GameRules = {
  /** A home game's LOCATION: "<city>, Ind." then the venue (the feed escapes only the first comma). */
  homePlace: RegExp;
  /** What every game title starts with, before the sport: "IU Indy ", "Indiana University ". */
  titlePrefix: string;
  /** The home side as Vibe prints it: "IU Indy", "IU" (Franky, Oct 19: "IU vs Purdue"). */
  homeLabel: string;
  /** The place shown when the feed names only the city (decision 7: "Bloomington"). */
  placeFallback: string;
  /**
   * Indy: an "at" row in Indianapolis is usually IU Indy visiting across town,
   * so it's dropped unless it's at one of these venues (a meet it hosts).
   * Null: "at" rows in the home city stay (Bloomington has no cross-town rival).
   */
  dropAtExceptVenues: ReadonlySet<string> | null;
  /** Where a "Tickets:" link may point: https on one of these domains or a subdomain. */
  ticketDomains: readonly string[];
  /** A game page on `from` is rewritten to `to` (Bloomington's feed links to admin.iuhoosiers.com, which 301s). */
  linkRewrite: { from: string; to: string } | null;
};

export type SchoolFeed = SchoolSource & {
  role: "athletics" | "calendar";
  label: string;
  /** The campus whose screens show it ("indianapolis", "iu-bloomington"); matches SCHOOL_CAMPUS_KEYS. */
  campus_id: string;
  /** Its rows may lead as "Featured by your school". Only Indy's Featured calendar, so far. */
  featured: boolean;
  feed_url: string;
  feed_host: string;
  format: "sidearm" | "livewhale";
  /** Sidearm feeds only. */
  game: GameRules | null;
};

/**
 * IU Indy's own venues (every home "vs" row in the Oct 19 feed is at one).
 * Sidearm writes "at" for an away game, and three schools IU Indy plays are
 * in Indianapolis too (Butler, UIndy, Marian), so an "at" row there is
 * usually IU Indy visiting across town and is dropped. An "at" row at one of
 * these venues is a meet IU Indy hosts ("at Jaguar Invitational"), so it
 * stays. A new home venue has to be added here.
 */
const INDY_HOME_VENUES = new Set(["james t. morris arena", "the jungle", "iu natatorium", "michael a. carroll stadium"]);

const INDY_GAMES: GameRules = Object.freeze({
  homePlace: /^Indianapolis,\s*Ind\.,?\s*(.*)$/i,
  titlePrefix: "IU Indy ",
  homeLabel: "IU Indy",
  placeFallback: "Indianapolis",
  dropAtExceptVenues: INDY_HOME_VENUES,
  ticketDomains: Object.freeze(["ticketmaster.com"]),
  linkRewrite: null,
});

/**
 * Bloomington (fixture of Oct 19, 2026): 282 rows; home games say
 * "Bloomington, Ind." alone (football, basketball, volleyball at their
 * arenas) or with a venue; every game URL is on admin.iuhoosiers.com, which
 * redirects to iuhoosiers.com; tickets are on iuhoosiers.evenue.net (and a
 * few on Ticketmaster); ranked opponents read "vs #5 Michigan State".
 */
const BLOOMINGTON_GAMES: GameRules = Object.freeze({
  homePlace: /^Bloomington,\s*Ind\.,?\s*(.*)$/i,
  titlePrefix: "Indiana University ",
  homeLabel: "IU",
  placeFallback: "Bloomington",
  dropAtExceptVenues: null,
  ticketDomains: Object.freeze(["ticketmaster.com", "iuhoosiers.evenue.net"]),
  linkRewrite: Object.freeze({ from: "admin.iuhoosiers.com", to: "iuhoosiers.com" }),
});

/**
 * Every calendar, both campuses. Within a campus the order is the credit
 * order. Indianapolis keeps its Oct 19 keys; Bloomington's three were added
 * Oct 19, 2026 (Franky: on now, with the same off switch as Indy).
 */
export const SCHOOL_FEEDS: readonly SchoolFeed[] = Object.freeze([
  Object.freeze<SchoolFeed>({
    key: "athletics",
    host: "Athletics",
    credit: "From the IU Indy athletics calendar",
    calendar_url: "https://iuindyjags.com/calendar.aspx",
    role: "athletics",
    label: "IU Indy Athletics",
    campus_id: "indianapolis",
    featured: false,
    feed_url: "https://iuindyjags.com/calendar.ashx/calendar.ics?sport_id=0",
    feed_host: "iuindyjags.com",
    format: "sidearm",
    game: INDY_GAMES,
  }),
  Object.freeze<SchoolFeed>({
    key: "iu-student-affairs",
    host: "Student Affairs",
    credit: "From the IU Indianapolis Student Affairs calendar",
    calendar_url: "https://events.iu.edu/studentaffairs-indianapolis/",
    role: "calendar",
    label: "IU Indianapolis Student Affairs",
    campus_id: "indianapolis",
    featured: false,
    feed_url: "https://events.iu.edu/live/ical/events/group_id/24",
    feed_host: "events.iu.edu",
    format: "livewhale",
    game: null,
  }),
  Object.freeze<SchoolFeed>({
    key: "iu-featured",
    host: "IU Indianapolis",
    credit: "From the IU Indianapolis events calendar",
    calendar_url: "https://events.iu.edu/indianapolis/",
    role: "calendar",
    label: "IU Indianapolis",
    campus_id: "indianapolis",
    featured: true,
    feed_url: "https://events.iu.edu/live/ical/events/group_id/342",
    feed_host: "events.iu.edu",
    format: "livewhale",
    game: null,
  }),
  Object.freeze<SchoolFeed>({
    key: "iub-athletics",
    host: "Athletics",
    credit: "From the IU Athletics calendar",
    calendar_url: "https://iuhoosiers.com/calendar.aspx",
    role: "athletics",
    label: "IU Athletics",
    campus_id: "iu-bloomington",
    featured: false,
    feed_url: "https://iuhoosiers.com/calendar.ashx/calendar.ics?sport_id=0",
    feed_host: "iuhoosiers.com",
    format: "sidearm",
    game: BLOOMINGTON_GAMES,
  }),
  // Why the calendar's home page (Oct 19, 2026): "/iubstudentlife/" had no
  // source (every group 76 row links to /live/events/..., never to a group
  // page), so the credit could have opened a 404. events.iu.edu is the host
  // the feed itself comes from. Swap in Student Life's own page once someone
  // has opened it by hand.
  Object.freeze<SchoolFeed>({
    key: "iub-student-life",
    host: "Student Life",
    credit: "From the IU Bloomington Student Life calendar",
    calendar_url: "https://events.iu.edu/",
    role: "calendar",
    label: "IU Bloomington Student Life",
    campus_id: "iu-bloomington",
    featured: false,
    feed_url: "https://events.iu.edu/live/ical/events/group_id/76",
    feed_host: "events.iu.edu",
    format: "livewhale",
    game: null,
  }),
  // Group 341 is IU Bloomington's "Featured Events", but it lists about 180
  // events, so it counts as a plain calendar (decision 7, Oct 19, 2026): it
  // never leads as "Featured by your school".
  Object.freeze<SchoolFeed>({
    key: "iub-featured",
    host: "IU Bloomington",
    credit: "From the IU Bloomington featured events calendar",
    calendar_url: "https://events.iu.edu/iub-featured/",
    role: "calendar",
    label: "IU Bloomington",
    campus_id: "iu-bloomington",
    featured: false,
    feed_url: "https://events.iu.edu/live/ical/events/group_id/341",
    feed_host: "events.iu.edu",
    format: "livewhale",
    game: null,
  }),
]);

const BY_CAMPUS = new Map<string, readonly SchoolFeed[]>();
for (const feed of SCHOOL_FEEDS) BY_CAMPUS.set(feed.campus_id, Object.freeze([...(BY_CAMPUS.get(feed.campus_id) ?? []), feed]));
const NO_FEEDS: readonly SchoolFeed[] = Object.freeze([]);

/** The calendars a campus's screens read, in credit order; [] for a campus with none (or null). */
export function feedsForCampus(campusId: string | null): readonly SchoolFeed[] {
  return (campusId !== null && BY_CAMPUS.get(campusId)) || NO_FEEDS;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A game's end is trusted up to 6 h after the start; past that (or missing) it's start + 2 h. */
const GAME_END_MAX_MS = 6 * HOUR_MS;
const GAME_DEFAULT_MS = 2 * HOUR_MS;
/** A school event over 12 h is a multi-day listing ("Sober October"), not something on tonight. */
const EVENT_MAX_MS = 12 * HOUR_MS;
/** A LiveWhale row with no usable end is taken as one hour long. */
const EVENT_DEFAULT_MS = HOUR_MS;
const TITLE_MAX = 120;
const OPPONENTS_SHOWN = 3;
const MERGE_MAX = 200;
const WINDOW_BACK_MS = 4 * DAY_MS;
const WINDOW_AHEAD_MS = 8 * DAY_MS;

function parseUrl(url: string | null): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    // https only, and no "user:pass@" trick that makes a link read as one host and go to another.
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * The link when it is https on exactly `host` or `www.<host>`, else null. A
 * feed's URL is outside input: a `javascript:` link or another site never
 * reaches a screen.
 */
export function sameHost(url: string | null, host: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  const want = host.toLowerCase();
  const got = u.hostname.toLowerCase();
  return got === want || got === `www.${want}` ? u.href : null;
}

/** The link when it is https on `domain` or any subdomain of it (am.ticketmaster.com, www.espn.com). */
function underDomain(url: string | null, domain: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  const got = u.hostname.toLowerCase();
  return got === domain || got.endsWith(`.${domain}`) ? u.href : null;
}

/** "Men's Basketball" → "Men's basketball": the first word as written, the rest lower case. */
function sentenceCase(text: string): string {
  const words = text.trim().split(/\s+/);
  return [words[0], ...words.slice(1).map((w) => w.toLowerCase())].join(" ");
}

/** What `label` captures on the first description line it matches, or null when no line does. */
function descriptionLine(description: string, label: RegExp): string | null {
  for (const line of description.split("\n")) {
    const m = label.exec(line.trim());
    if (m) return m[1] ?? "";
  }
  return null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ── Athletics (Sidearm) ───────────────────────────────────────────────────────

/** "[W] ", "[L] ", "[T] ", "[N] ": a past result. The score itself is never kept. */
const RESULT_PREFIX = /^\[[A-Z]\]\s*/;
/**
 * A ranked opponent's "#5 " or "(RV) " (receiving votes): the rank changes
 * every week and isn't part of the name. "(RV)" added Oct 19, 2026: the
 * Bloomington feed has "vs (RV) UCLA", and the ask to IU Athletics promises
 * no rankings.
 */
const RANK_PREFIX = /^(?:#\d+|\(RV\))\s+/i;
/**
 * A note after an opponent that isn't part of its name (Oct 19, 2026): how
 * many innings a finished game went ("(10 Innings)", a result) and the pool
 * length ("(SCM)"). "(Exhibition)" stays: it tells a student the game
 * doesn't count.
 */
const OPPONENT_NOTE = /\s*\((?:\d+\s+innings|SCM|SCY|LCM)\)$/i;
/** "Intrasquad (Wrestle-Offs)": the team against itself, so no "IU vs". */
const INTRASQUAD = /^intrasquad\b\s*/i;
const TICKETS_LINE = /^Tickets:\s*(\S+)/i;
const STREAM_LINE = /^Streaming Video:\s*(\S+)/i;
const TV_LINE = /^TV:\s*(.*)$/i;
const ESPN_PLUS = /(^|[\s,/])ESPN\+($|[\s,/])/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "<prefix><sport> vs|at <opponent>[ - <promo>]", built once per feed's rules. */
const matchupCache = new WeakMap<GameRules, RegExp>();
function matchupFor(rules: GameRules): RegExp {
  let re = matchupCache.get(rules);
  if (!re) {
    re = new RegExp(`^${escapeRegExp(rules.titlePrefix)}(.+?) (vs\\.?|at) (.+?)(?: - (.+))?$`);
    matchupCache.set(rules, re);
  }
  return re;
}

/** The first "Tickets:" link on one of the rules' ticket domains, else null. */
function ticketLink(description: string, rules: GameRules): string | null {
  const raw = descriptionLine(description, TICKETS_LINE);
  for (const domain of rules.ticketDomains) {
    const ok = underDomain(raw, domain);
    if (ok) return ok;
  }
  return null;
}

/** The game's own page, https on the feed's host, after the rules' host rewrite (admin. → the public site). */
function gamePage(url: string | null, feed: SchoolFeed, rules: GameRules): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  if (rules.linkRewrite && u.hostname.toLowerCase() === rules.linkRewrite.from) u.hostname = rules.linkRewrite.to;
  return sameHost(u.href, feed.feed_host);
}

type GameRow = {
  ev: IcsEvent;
  venue: string;
  sport: string | null;
  away: string | null;
  promo: string | null;
  title: string;
  tickets: string | null;
  watch: string | null;
};

function readGame(ev: IcsEvent, rules: GameRules): GameRow | null {
  const home = rules.homePlace.exec(ev.location);
  // Home and timed only (v1): an away game, a neutral site, or an all-day / TBA row, never shows.
  if (!home || ev.allDay || !ev.uid) return null;
  const summary = ev.summary.replace(RESULT_PREFIX, "").trim();
  if (!summary) return null;
  const m = matchupFor(rules).exec(summary);
  const venue = home[1].trim();
  // "IU Indy X at Butler" in Indianapolis is a visit across town, not a home game (INDY_HOME_VENUES).
  if (m && m[2] === "at" && rules.dropAtExceptVenues && !rules.dropAtExceptVenues.has(venue.toLowerCase())) return null;
  const tv = descriptionLine(ev.description, TV_LINE);
  const stream = descriptionLine(ev.description, STREAM_LINE);
  const sport = m ? sentenceCase(m[1]) : null;
  const opponent = m ? m[3].trim().replace(RANK_PREFIX, "").replace(OPPONENT_NOTE, "") : null;
  // "IU vs Intrasquad (Wrestle-Offs)" read oddly: "IU wrestling intrasquad (Wrestle-Offs)".
  const intrasquad = opponent !== null && sport !== null && INTRASQUAD.test(opponent);
  const away = intrasquad ? null : opponent;
  const title = intrasquad
    ? `${rules.homeLabel} ${sport.toLowerCase()} intrasquad ${opponent.replace(INTRASQUAD, "")}`.trim()
    : away
      ? `${rules.homeLabel} vs ${away}`
      : summary;
  return {
    ev,
    venue: venue || rules.placeFallback,
    sport,
    away,
    promo: m && m[4] ? clip(m[4].trim(), TITLE_MAX) : null,
    title,
    tickets: ticketLink(ev.description, rules),
    // ESPN+ only when the feed says that's where it's on: a stream link alone may be a radio call.
    watch: tv !== null && ESPN_PLUS.test(tv) ? underDomain(stream, "espn.com") : null,
  };
}

/** "Xavier, Bellarmine, Eastern Illinois and 2 more". */
function opponentsText(names: string[]): string {
  const shown = names.slice(0, OPPONENTS_SHOWN).join(", ");
  return names.length > OPPONENTS_SHOWN ? `${shown} and ${names.length - OPPONENTS_SHOWN} more` : shown;
}

function gameEvent(rows: GameRow[], feed: SchoolFeed, rules: GameRules): SchoolEvent {
  const first = rows[0];
  const opponents: string[] = [];
  for (const row of rows) if (row.away && !opponents.includes(row.away)) opponents.push(row.away);
  const lead = `${rules.homeLabel} vs `;
  const away = opponents.length ? clip(opponentsText(opponents), TITLE_MAX - lead.length) : null;
  const start = first.ev.start;
  const end = first.ev.end;
  const endMs = end !== null && end > start && end - start <= GAME_END_MAX_MS ? end : start + GAME_DEFAULT_MS;
  // The men's and women's teams in one meet: the plain sport ("Swimming and diving").
  const sports = new Set(rows.map((r) => r.sport));
  const sport = sports.size > 1 && first.sport ? capitalize(withoutGender(first.sport)) : first.sport;
  return {
    id: `${feed.key}:${first.ev.uid}`,
    source: feed.key,
    kind: "game",
    title: clip(away ? `${lead}${away}` : first.title, TITLE_MAX),
    matchup: away ? { home: rules.homeLabel, away } : null,
    sport,
    promo: first.promo,
    starts_at: iso(start),
    ends_at: iso(endMs),
    location: first.venue,
    host: feed.host,
    url: gamePage(first.ev.url, feed, rules),
    tickets_url: rows.find((r) => r.tickets)?.tickets ?? null,
    watch_url: rows.find((r) => r.watch)?.watch ?? null,
    featured: false,
  };
}

/** "Men's swimming and diving" → "swimming and diving"; no gender word: as written. */
function withoutGender(sport: string): string {
  return sport.replace(/^(?:men|women)['’]s\s+/i, "");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The campus's HOME games, timed only, read with the feed's own rules. One
 * meet listed once per opponent (the swim meets) becomes one item: same
 * start, same venue, same sport. A feed with no rules gives nothing.
 */
export function normalizeAthletics(events: IcsEvent[], feed: SchoolFeed): SchoolEvent[] {
  const rules = feed.game;
  if (!rules) return [];
  const groups = new Map<string, GameRow[]>();
  const order: GameRow[][] = [];
  for (const ev of events) {
    const row = readGame(ev, rules);
    if (!row) continue;
    // A row whose title didn't parse has no sport to match on, so it stands alone.
    // Why without "Men's"/"Women's" (Oct 19, 2026): both teams swim the same
    // meet, listed once per team, so the same title showed twice in a row
    // (Bloomington 4 times this fall, Indy's Ball State meet too).
    const key = row.sport ? `${row.ev.start}|${row.venue}|${withoutGender(row.sport).toLowerCase()}` : null;
    const group = key ? groups.get(key) : undefined;
    if (group) {
      group.push(row);
      continue;
    }
    const fresh = [row];
    if (key) groups.set(key, fresh);
    order.push(fresh);
  }
  return order.map((rows) => gameEvent(rows, feed, rules));
}

// ── IU (LiveWhale) ────────────────────────────────────────────────────────────

/** Tags that mark staff and travel items, or the recurring fitness series: none of them is a night out. */
const DROP_TAGS = new Set(["conference", "internal events", "travel required", "group fitness classes", "fitness classes"]);
const CANCELED_TITLE = /^CANCELL?ED:/i;

function isTrue(value: string | undefined): boolean {
  return value !== undefined && /^(1|true)$/i.test(value.trim());
}

function droppedByTags(tags: string | undefined): boolean {
  if (!tags) return false;
  return tags.split("|").some((tag) => {
    const t = tag.trim().toLowerCase();
    return DROP_TAGS.has(t) || t.startsWith("professional development");
  });
}

/**
 * Words that stay in capitals inside a Title-Cased place (Oct 19, 2026:
 * Bloomington writes "IU CINEMA", which read "Iu Cinema"). A list, not a
 * rule like "no vowels": that would also capitalize "St." and "Rd.".
 */
const KEEP_CAPS = new Set(["IU", "IUA", "IUB", "IUOA", "IUPUI", "IMU", "LGBTQ", "HPER", "SPEA"]);
/**
 * Small words stay lower case between other words: "SIDNEY AND LOIS ESKENAZI
 * MUSEUM OF ART" (Oct 19, 2026). Never right after a comma, where "IN" is
 * the state ("BLOOMINGTON, IN 47405" read "Bloomington, in 47405").
 */
const SMALL_WORDS = /(?<=[^,\s]\s+)(And|Of|The|At|For|In|On|To)(?=\s)/g;
/** A two-letter state after a comma, before a ZIP or the end: ", In 47405" → ", IN 47405". */
const STATE_AFTER_COMMA = /(,\s*)([A-Z][a-z])(?=\s+\d{5}|\s*$)/g;

/**
 * "CAMPUS CENTER" → "Campus Center", "IU CINEMA" → "IU Cinema", "MUSEUM OF
 * ART" → "Museum of Art", "IU AUDITORIUM - IUA" → "IU Auditorium - IUA".
 * Mixed case, or 3 letters or fewer ("UC"), stays as written.
 */
function tidyPlace(place: string): string {
  if (/[a-z]/.test(place)) return place;
  const letters = place.match(/[A-Z]/g)?.length ?? 0;
  if (letters <= 3) return place;
  return place
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_w, lead: string, c: string) => lead + c.toUpperCase())
    .replace(/[A-Za-z]+/g, (w) => (KEEP_CAPS.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .replace(SMALL_WORDS, (w) => w.toLowerCase())
    .replace(STATE_AFTER_COMMA, (_m, lead: string, state: string) => lead + state.toUpperCase());
}

/** A LiveWhale link's last part that starts with the event's number: "2432980-union-board-...", or just "2432980". */
const LINK_NUMBER = /^(\d+)(?:-|$)/;

/**
 * The event's number in its LiveWhale link, read from the START of the last
 * path part only (Oct 19, 2026). The first rule matched any number before a
 * dash anywhere at the end, so two slug-only links like
 * "homecoming-2026-parade" and "fall-2026-career-fair" both became "2026"
 * and the merge kept one of them; and a bare ".../events/2432980" got no
 * number, so it no longer matched its slugged copy in the other group.
 */
function linkNumber(url: string | null): string | null {
  if (!url) return null;
  try {
    const last = new URL(url.trim()).pathname.split("/").filter(Boolean).pop() ?? "";
    return LINK_NUMBER.exec(last)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * IU's calendars. Drops what isn't a campus happening a student can walk into:
 * cancelled (three ways of saying so), all-day, online-only, longer than 12 h,
 * and the staff / travel / fitness-class tags. RRULE is ignored: LiveWhale
 * writes the next occurrence as DTSTART, and the weekly series are fitness
 * classes, which the tags drop anyway.
 */
export function normalizeLiveWhale(events: IcsEvent[], feed: SchoolFeed): SchoolEvent[] {
  const out: SchoolEvent[] = [];
  for (const ev of events) {
    if (ev.status === "CANCELLED" || isTrue(ev.x["X-LIVEWHALE-CANCELED"])) continue;
    if (CANCELED_TITLE.test(ev.summary)) continue;
    if (ev.allDay || isTrue(ev.x["X-LIVEWHALE-ALL-DAY"])) continue;
    if (/^http/i.test(ev.location)) continue;
    if (ev.end !== null && ev.end - ev.start > EVENT_MAX_MS) continue;
    if (droppedByTags(ev.x["X-LIVEWHALE-TAGS"])) continue;
    const title = clip(ev.summary, TITLE_MAX);
    if (!title) continue;
    // Why the link's number, not X-LIVEWHALE-ID (Oct 19, 2026): an event
    // shared into a second IU group gets a NEW X-LIVEWHALE-ID there, so the
    // same evening showed twice (Bloomington's groups 76 and 341 share 80
    // events; Indy's 24 and 342 do the same). The number in the event's link
    // stays the same in every group, and on every day of a multi-day event
    // (mergeSchoolEvents keeps the right day). A link without one falls back
    // to the title and start, which still matches the other group's copy.
    const number = linkNumber(ev.url);
    const id = number ? `iu:${number}` : `iu:${title}@${iso(ev.start)}`;
    const end = ev.end !== null && ev.end > ev.start ? ev.end : ev.start + EVENT_DEFAULT_MS;
    out.push({
      id,
      source: feed.key,
      kind: "event",
      title,
      matchup: null,
      sport: null,
      promo: null,
      starts_at: iso(ev.start),
      ends_at: iso(end),
      location: ev.location ? tidyPlace(ev.location) : null,
      host: feed.host,
      url: sameHost(ev.url, feed.feed_host),
      tickets_url: null,
      watch_url: null,
      // The feed's flag, not its key (Oct 19, 2026): Bloomington's Featured
      // calendar is a plain one (decision 7).
      featured: feed.featured,
    });
  }
  return out;
}

// ── Together ──────────────────────────────────────────────────────────────────

/**
 * One feed body → its rows, and how many events the body held before the
 * filters. The count lets read-server.ts notice a feed whose rows all stop
 * matching (a format change on the school's side) instead of going quiet.
 * Never throws: a broken body is { parsed: 0, events: [] }.
 */
export function normalizeFeedWithCount(text: string, feed: SchoolFeed): { parsed: number; events: SchoolEvent[] } {
  try {
    const parsed = parseIcs(text);
    const events = feed.format === "sidearm" ? normalizeAthletics(parsed, feed) : normalizeLiveWhale(parsed, feed);
    return { parsed: parsed.length, events };
  } catch {
    return { parsed: 0, events: [] };
  }
}

/** One feed body → its rows. Never throws: a broken body is []. */
export function normalizeFeed(text: string, feed: SchoolFeed): SchoolEvent[] {
  return normalizeFeedWithCount(text, feed).events;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Two rows with one id: which one to keep. The same start is the same
 * occurrence listed twice (one event in both IU groups): the Featured copy
 * wins, else the first. Different starts are one event on several days
 * (LiveWhale writes a row per day, all with the same id): the day that is on
 * now or comes next wins, and once every day is over, the last one. So day 2
 * of a three-evening fair shows on day 2, not day 1's finished copy.
 */
function preferCopy(had: SchoolEvent, ev: SchoolEvent, now: number): SchoolEvent {
  const hadStart = Date.parse(had.starts_at);
  const evStart = Date.parse(ev.starts_at);
  if (hadStart === evStart) return ev.featured && !had.featured ? ev : had;
  const hadOver = Date.parse(had.ends_at) <= now;
  const evOver = Date.parse(ev.ends_at) <= now;
  if (hadOver !== evOver) return hadOver ? ev : had;
  if (hadOver) return evStart > hadStart ? ev : had;
  return evStart < hadStart ? ev : had;
}

/**
 * Every calendar's rows as one list: started from 4 days ago up to 8 days
 * ahead (ended ones included: the week tiles show "Final"), one row per id
 * (preferCopy: the Featured copy keeps the school's own pick; of a multi-day
 * event, today's day), soonest first, then by title and id so the order never
 * wobbles, at most 200. The window comes first, so a multi-day event whose
 * first day is long past still shows its later days.
 */
export function mergeSchoolEvents(lists: SchoolEvent[][], now: number): SchoolEvent[] {
  const from = now - WINDOW_BACK_MS;
  const to = now + WINDOW_AHEAD_MS;
  const byId = new Map<string, SchoolEvent>();
  for (const list of lists) {
    for (const ev of list) {
      const t = Date.parse(ev.starts_at);
      if (!(t >= from && t < to)) continue;
      const had = byId.get(ev.id);
      byId.set(ev.id, had ? preferCopy(had, ev, now) : ev);
    }
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at) || compare(a.title, b.title) || compare(a.id, b.id),
    )
    .slice(0, MERGE_MAX);
}
