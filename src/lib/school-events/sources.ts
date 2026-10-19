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

/** The one campus with school calendars in v1 (IU Indy + Purdue Indy share it). */
export const SCHOOL_CAMPUS_ID = "indianapolis";

export type SchoolFeed = SchoolSource & { feed_url: string; feed_host: string; format: "sidearm" | "livewhale" };

export const SCHOOL_FEEDS: readonly SchoolFeed[] = Object.freeze([
  Object.freeze<SchoolFeed>({
    key: "athletics",
    host: "Athletics",
    credit: "From the IU Indy athletics calendar",
    calendar_url: "https://iuindyjags.com/calendar.aspx",
    feed_url: "https://iuindyjags.com/calendar.ashx/calendar.ics?sport_id=0",
    feed_host: "iuindyjags.com",
    format: "sidearm",
  }),
  Object.freeze<SchoolFeed>({
    key: "iu-student-affairs",
    host: "Student Affairs",
    credit: "From the IU Indianapolis Student Affairs calendar",
    calendar_url: "https://events.iu.edu/studentaffairs-indianapolis/",
    feed_url: "https://events.iu.edu/live/ical/events/group_id/24",
    feed_host: "events.iu.edu",
    format: "livewhale",
  }),
  Object.freeze<SchoolFeed>({
    key: "iu-featured",
    host: "IU Indianapolis",
    credit: "From the IU Indianapolis events calendar",
    calendar_url: "https://events.iu.edu/indianapolis/",
    feed_url: "https://events.iu.edu/live/ical/events/group_id/342",
    feed_host: "events.iu.edu",
    format: "livewhale",
  }),
]);

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

/** A home game's place: "Indianapolis, Ind., <venue>" (the feed escapes only the first comma). */
const HOME_LOCATION = /^Indianapolis,\s*Ind\.,?\s*(.*)$/i;
/** "[W] ", "[L] ", "[T] ", "[N] ": a past result. The score itself is never kept. */
const RESULT_PREFIX = /^\[[A-Z]\]\s*/;
const MATCHUP = /^IU Indy (.+?) (vs\.?|at) (.+?)(?: - (.+))?$/;
/**
 * IU Indy's own venues (every home "vs" row in the Oct 19 feed is at one).
 * Sidearm writes "at" for an away game, and three schools IU Indy plays are
 * in Indianapolis too (Butler, UIndy, Marian), so an "at" row there is
 * usually IU Indy visiting across town and is dropped. An "at" row at one of
 * these venues is a meet IU Indy hosts ("at Jaguar Invitational"), so it
 * stays. A new home venue has to be added here.
 */
const HOME_VENUES = new Set(["james t. morris arena", "the jungle", "iu natatorium", "michael a. carroll stadium"]);
const TICKETS_LINE = /^Tickets:\s*(\S+)/i;
const STREAM_LINE = /^Streaming Video:\s*(\S+)/i;
const TV_LINE = /^TV:\s*(.*)$/i;
const ESPN_PLUS = /(^|[\s,/])ESPN\+($|[\s,/])/i;

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

function readGame(ev: IcsEvent): GameRow | null {
  const home = HOME_LOCATION.exec(ev.location);
  // Home and timed only (v1): an away game, or an all-day / TBA row, never shows.
  if (!home || ev.allDay || !ev.uid) return null;
  const summary = ev.summary.replace(RESULT_PREFIX, "").trim();
  if (!summary) return null;
  const m = MATCHUP.exec(summary);
  const venue = home[1].trim();
  // "IU Indy X at Butler" in Indianapolis is a visit across town, not a home game (HOME_VENUES).
  if (m && m[2] === "at" && !HOME_VENUES.has(venue.toLowerCase())) return null;
  const tv = descriptionLine(ev.description, TV_LINE);
  const stream = descriptionLine(ev.description, STREAM_LINE);
  return {
    ev,
    venue: venue || "Indianapolis",
    sport: m ? sentenceCase(m[1]) : null,
    away: m ? m[3].trim() : null,
    promo: m && m[4] ? clip(m[4].trim(), TITLE_MAX) : null,
    title: m ? `IU Indy vs ${m[3].trim()}` : summary,
    tickets: underDomain(descriptionLine(ev.description, TICKETS_LINE), "ticketmaster.com"),
    // ESPN+ only when the feed says that's where it's on: a stream link alone may be a radio call.
    watch: tv !== null && ESPN_PLUS.test(tv) ? underDomain(stream, "espn.com") : null,
  };
}

/** "Xavier, Bellarmine, Eastern Illinois and 2 more". */
function opponentsText(names: string[]): string {
  const shown = names.slice(0, OPPONENTS_SHOWN).join(", ");
  return names.length > OPPONENTS_SHOWN ? `${shown} and ${names.length - OPPONENTS_SHOWN} more` : shown;
}

function gameEvent(rows: GameRow[], feed: SchoolFeed): SchoolEvent {
  const first = rows[0];
  const opponents: string[] = [];
  for (const row of rows) if (row.away && !opponents.includes(row.away)) opponents.push(row.away);
  const away = opponents.length ? clip(opponentsText(opponents), TITLE_MAX - "IU Indy vs ".length) : null;
  const start = first.ev.start;
  const end = first.ev.end;
  const endMs = end !== null && end > start && end - start <= GAME_END_MAX_MS ? end : start + GAME_DEFAULT_MS;
  return {
    id: `athletics:${first.ev.uid}`,
    source: feed.key,
    kind: "game",
    title: clip(away ? `IU Indy vs ${away}` : first.title, TITLE_MAX),
    matchup: away ? { home: "IU Indy", away } : null,
    sport: first.sport,
    promo: first.promo,
    starts_at: iso(start),
    ends_at: iso(endMs),
    location: first.venue,
    host: feed.host,
    url: sameHost(first.ev.url, feed.feed_host),
    tickets_url: rows.find((r) => r.tickets)?.tickets ?? null,
    watch_url: rows.find((r) => r.watch)?.watch ?? null,
    featured: false,
  };
}

/**
 * IU Indy HOME games, timed only. One meet listed once per opponent (the
 * swim meets) becomes one item: same start, same venue, same sport.
 */
export function normalizeAthletics(events: IcsEvent[], feed: SchoolFeed): SchoolEvent[] {
  const groups = new Map<string, GameRow[]>();
  const order: GameRow[][] = [];
  for (const ev of events) {
    const row = readGame(ev);
    if (!row) continue;
    // A row whose title didn't parse has no sport to match on, so it stands alone.
    const key = row.sport ? `${row.ev.start}|${row.venue}|${row.sport}` : null;
    const group = key ? groups.get(key) : undefined;
    if (group) {
      group.push(row);
      continue;
    }
    const fresh = [row];
    if (key) groups.set(key, fresh);
    order.push(fresh);
  }
  return order.map((rows) => gameEvent(rows, feed));
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

/** "CAMPUS CENTER" → "Campus Center". Mixed case, or 3 letters or fewer ("UC"), stays as written. */
function tidyPlace(place: string): string {
  if (/[a-z]/.test(place)) return place;
  const letters = place.match(/[A-Z]/g)?.length ?? 0;
  if (letters <= 3) return place;
  return place.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_w, lead: string, c: string) => lead + c.toUpperCase());
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
    // The LiveWhale id is the same in every IU group, so one event in two groups is one id. It is
    // also the same on every day of a multi-day event; mergeSchoolEvents keeps the right day.
    const lwid = (ev.x["X-LIVEWHALE-ID"] ?? "").trim() || ev.uid;
    const title = clip(ev.summary, TITLE_MAX);
    if (!lwid || !title) continue;
    const end = ev.end !== null && ev.end > ev.start ? ev.end : ev.start + EVENT_DEFAULT_MS;
    out.push({
      id: `iu:${lwid}`,
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
      featured: feed.key === "iu-featured",
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
