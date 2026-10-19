/**
 * A small iCalendar (RFC 5545) reader for the school calendars on Campus
 * ("What's the vibe tonight?", Oct 19 2026). PURE: no imports and erasable
 * TypeScript only, so `node --test` loads it straight from disk.
 *
 * Why by hand and not a library: we read three known feeds (Sidearm for
 * athletics, LiveWhale for IU) and need about a dozen properties. These feeds
 * are outside input, so every limit below (body size, event count, field
 * lengths) is a guard against a feed that goes wrong, not a style choice.
 *
 * Left out on purpose: RRULE (LiveWhale already writes the next occurrence as
 * its own DTSTART), VTIMEZONE blocks (the runtime's own zone database is more
 * trustworthy than a feed's copy of it), DURATION, attendees.
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §3.5.
 */

/** A bigger body is refused whole: no school calendar comes near 2 million characters. */
export const ICS_MAX_CHARS = 2_000_000;
/** Reading stops after this many events, so one runaway feed can't fill memory. */
export const ICS_MAX_EVENTS = 2000;

/** Campus time (the same zone as CAMPUS_TIME_ZONE in src/lib/push/event-notice.ts; copied, since this file imports nothing). */
const DEFAULT_ZONE = "America/Indiana/Indianapolis";
const SUMMARY_MAX = 300;
const LOCATION_MAX = 200;
const DESCRIPTION_MAX = 4000;
const UID_MAX = 300;
const URL_MAX = 2000;
const X_VALUE_MAX = 2000;
/** The only X- properties anyone reads (sources.ts). The rest of a feed's extras are not kept. */
const X_KEYS = ["X-LIVEWHALE-ID", "X-LIVEWHALE-TAGS", "X-LIVEWHALE-CANCELED", "X-LIVEWHALE-ALL-DAY"];
const DAY_MS = 86_400_000;

export type IcsEvent = {
  uid: string;
  /** Unescaped, entities decoded, tags stripped, bidi/control characters removed, at most 300. */
  summary: string;
  /** The same cleaning, at most 200. */
  location: string;
  /** Unescaped only (sources.ts reads links out of it line by line), at most 4000. */
  description: string;
  /** Unescaped and entities decoded; NOT host-checked here (sources.ts does that). */
  url: string | null;
  /** ms, UTC. */
  start: number;
  /** ms, UTC; null when the row has no readable end. */
  end: number | null;
  allDay: boolean;
  /** Upper case, or null. */
  status: string | null;
  /** The first of each X_KEYS property the row carries. */
  x: Record<string, string>;
};

type Prop = { name: string; params: Map<string, string>; value: string };

/** iCal TEXT escapes: `\\` `\;` `\,` and `\n` / `\N` (a newline). Anything else is left as written. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_whole, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // A no-break space reads as a space everywhere we show text.
  nbsp: " ",
  // LiveWhale titles are written in a rich-text editor, so curly quotes and
  // dashes can arrive by name ("Women&rsquo;s Night &ndash; Free Food").
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

/**
 * HTML entities, because LiveWhale writes them into plain-text fields
 * (`&amp;` inside URLs, `&#160;` between words). One pass, so `&amp;lt;`
 * becomes `&lt;`, never `<`. 160 (no-break space) becomes a plain space; 0,
 * surrogate halves and out-of-range numbers are dropped (they can't be
 * printed and only ever come from a broken feed). Unknown names stay as written.
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,7}|[a-zA-Z]{2,8});/g, (whole, body: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (code === 160) return " ";
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      if (code >= 0xd800 && code <= 0xdfff) return "";
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Drops characters that can't be shown or that change how a line reads:
 * C0/C1 controls, and the bidi marks, embeddings, overrides and isolates
 * (a feed could otherwise flip a title's direction on screen). Zero-width
 * space and the byte-order mark go too. The zero-width joiner stays, since
 * emoji are built with it. A loop rather than a regex, so no control
 * characters sit in source.
 */
function stripInvisible(value: string): string {
  let out = "";
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) continue;
    if (c === 0x061c || c === 0x200b || c === 0x200e || c === 0x200f || c === 0xfeff) continue;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) continue;
    out += ch;
  }
  return out;
}

/**
 * Cut to `max` characters with an ellipsis, never splitting a surrogate pair
 * (half an emoji prints as a box). Exported so sources.ts cuts titles the same way.
 */
export function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  let cut = max - 1;
  const last = value.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return value.slice(0, cut).trimEnd() + "…";
}

/** One line of display text: unescape, decode, strip tags, drop invisibles, squeeze spaces, cap. */
function cleanText(raw: string, max: number): string {
  let s = decodeEntities(unescapeText(raw));
  // Tags become a space so "Night<br>Market" reads "Night Market".
  s = s.replace(/<[^<>]*>/g, " ");
  // Line breaks become spaces before the invisible pass, which would glue words.
  s = s.replace(/[\t\n\r]+/g, " ");
  s = stripInvisible(s).replace(/\s+/g, " ").trim();
  return clipText(s, max);
}

// ── Time zones ────────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** One formatter per zone, made once; null for a zone the runtime doesn't know. */
function formatterFor(zone: string): Intl.DateTimeFormat | null {
  const known = formatters.get(zone);
  if (known !== undefined) return known;
  let fmt: Intl.DateTimeFormat | null = null;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    fmt = null;
  }
  // A feed can name any zone it likes; only remember a bounded number of them.
  if (formatters.size < 64) formatters.set(zone, fmt);
  return fmt;
}

/** The zone's offset from UTC at instant `ms`, in ms (EDT is −4 h). */
function offsetAt(ms: number, fmt: Intl.DateTimeFormat): number {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(ms)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const hour = p.hour === 24 ? 0 : p.hour;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * A wall-clock time in `zone` → ms UTC. DST-safe: a time that happens twice
 * (Nov 1 2026, 1:30 AM in New York) takes the FIRST one, while daylight time
 * still holds; a time that never happens (the spring-forward hour) takes the
 * offset from before the jump, which lands an hour later on the clock, as
 * RFC 5545 says. NaN for a zone the runtime doesn't know.
 */
export function zonedWallTimeToUtc(
  y: number,
  month1: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  zone: string,
): number {
  const fmt = formatterFor(zone);
  if (!fmt) return NaN;
  const wall = Date.UTC(y, month1 - 1, d, h, mi, s);
  if (!Number.isFinite(wall)) return NaN;
  const before = offsetAt(wall - DAY_MS, fmt);
  const after = offsetAt(wall + DAY_MS, fmt);
  let best = NaN;
  for (const off of before === after ? [before] : [before, after]) {
    const t = wall - off;
    if (offsetAt(t, fmt) === off && !(t >= best)) best = t;
  }
  return Number.isNaN(best) ? wall - before : best;
}

// ── Lines and properties ──────────────────────────────────────────────────────

/** Split at `sep` outside double quotes (parameter values may quote a `;` or `:`). */
function splitOutsideQuotes(text: string, sep: string): string[] {
  const out: string[] = [];
  let quoted = false;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (c === sep && !quoted) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out;
}

/** `NAME;P1=a;P2="b:c":value` → its parts, or null when the line has no name or no colon. */
function readLine(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ";");
  const name = rawName.trim().toUpperCase();
  if (!name) return null;
  const params = new Map<string, string>();
  for (const raw of rawParams) {
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim().toUpperCase();
    let value = raw.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!params.has(key)) params.set(key, value);
  }
  return { name, params, value: line.slice(colon + 1) };
}

function validDate(y: number, month1: number, d: number): boolean {
  if (y < 1900 || y > 2200 || month1 < 1 || month1 > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, month1, 0)).getUTCDate();
}

/**
 * DTSTART / DTEND → ms. Eight digits or VALUE=DATE: all day, midnight in the
 * zone. A trailing Z: UTC. TZID (quoted or not): that zone, or `zone` when
 * the runtime doesn't know it. No TZID ("floating"): `zone`.
 */
function readTime(prop: Prop | undefined, zone: string): { ms: number; allDay: boolean } | null {
  if (!prop) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(prop.value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!validDate(y, mo, d)) return null;
  const tzid = (prop.params.get("TZID") ?? "").trim();
  const inZone = tzid && formatterFor(tzid) ? tzid : zone;
  const dateOnly = (prop.params.get("VALUE") ?? "").toUpperCase() === "DATE" || m[4] === undefined;
  if (dateOnly) return { ms: zonedWallTimeToUtc(y, mo, d, 0, 0, 0, inZone), allDay: true };
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = m[6] === undefined ? 0 : Math.min(Number(m[6]), 59);
  if (h > 23 || mi > 59) return null;
  if (m[7]) return { ms: Date.UTC(y, mo - 1, d, h, mi, s), allDay: false };
  return { ms: zonedWallTimeToUtc(y, mo, d, h, mi, s, inZone), allDay: false };
}

// ── Events ────────────────────────────────────────────────────────────────────

function textOf(props: Map<string, Prop>, name: string): string {
  return props.get(name)?.value ?? "";
}

/** A finished VEVENT → an IcsEvent, or null when it has no readable start. */
function toEvent(props: Map<string, Prop>, zone: string): IcsEvent | null {
  const start = readTime(props.get("DTSTART"), zone);
  if (!start || !Number.isFinite(start.ms)) return null;
  const end = readTime(props.get("DTEND"), zone);
  const x: Record<string, string> = {};
  for (const key of X_KEYS) {
    const prop = props.get(key);
    if (prop) x[key] = clipText(stripInvisible(unescapeText(prop.value)).trim(), X_VALUE_MAX);
  }
  const url = stripInvisible(decodeEntities(unescapeText(textOf(props, "URL")))).trim();
  const status = stripInvisible(unescapeText(textOf(props, "STATUS"))).trim().toUpperCase();
  return {
    uid: clipText(stripInvisible(unescapeText(textOf(props, "UID"))).trim(), UID_MAX),
    summary: cleanText(textOf(props, "SUMMARY"), SUMMARY_MAX),
    location: cleanText(textOf(props, "LOCATION"), LOCATION_MAX),
    description: clipText(unescapeText(textOf(props, "DESCRIPTION")), DESCRIPTION_MAX),
    // An over-long URL is dropped, not cut: half a link is a wrong link.
    url: url && url.length <= URL_MAX ? url : null,
    start: start.ms,
    end: end && Number.isFinite(end.ms) ? end.ms : null,
    allDay: start.allDay,
    status: status || null,
    x,
  };
}

/**
 * The VEVENTs of an iCal body, in feed order. Never throws: junk, an empty
 * body or one over ICS_MAX_CHARS is []. Lines are unfolded first (CRLF or LF,
 * then a newline followed by a space or tab joins the next line on). Nested
 * blocks inside an event (VALARM) are skipped, even one left unclosed; an
 * event missing its END:VEVENT ends where the next one begins. The first
 * copy of a property wins, and a row without a valid start is dropped.
 */
export function parseIcs(text: string, defaultZone: string = DEFAULT_ZONE): IcsEvent[] {
  try {
    if (typeof text !== "string" || text.length === 0 || text.length > ICS_MAX_CHARS) return [];
    const zone = formatterFor(defaultZone) ? defaultZone : formatterFor(DEFAULT_ZONE) ? DEFAULT_ZONE : "UTC";
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const out: IcsEvent[] = [];
    /** Keeps a finished event; false once the event cap is reached. */
    const keep = (done: Map<string, Prop>): boolean => {
      const ev = toEvent(done, zone);
      if (ev) out.push(ev);
      return out.length < ICS_MAX_EVENTS;
    };
    let props: Map<string, Prop> | null = null;
    // How many blocks (VALARM) are open inside the current event. Only a
    // count: a broken feed can't be trusted to close them, so the event's own
    // BEGIN/END decide where it starts and stops, whatever this says.
    let nested = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const prop = readLine(line);
      if (!prop) continue;
      const block = prop.value.trim().toUpperCase();
      if (props === null) {
        if (prop.name === "BEGIN" && block === "VEVENT") {
          props = new Map();
          nested = 0;
        }
        continue;
      }
      if (prop.name === "BEGIN") {
        if (block !== "VEVENT") {
          nested += 1;
          continue;
        }
        // A new event before this one closed (its END:VEVENT is missing):
        // keep this one and start fresh, instead of reading every later event
        // as a block nested inside it.
        if (!keep(props)) break;
        props = new Map();
        nested = 0;
        continue;
      }
      if (prop.name === "END") {
        // END:VEVENT ends the event even with a VALARM left open (its END
        // missing), so one bad row can't swallow the rest of the calendar. A
        // broken feed's END:VCALENDAR ends it too.
        if (block === "VEVENT" || block === "VCALENDAR") {
          const done = props;
          props = null;
          nested = 0;
          if (!keep(done)) break;
        } else if (nested > 0) {
          nested -= 1;
        }
        // An END for a block that was never opened is ignored.
        continue;
      }
      if (nested > 0) continue;
      if (!props.has(prop.name)) props.set(prop.name, prop);
    }
    return out;
  } catch {
    return [];
  }
}
