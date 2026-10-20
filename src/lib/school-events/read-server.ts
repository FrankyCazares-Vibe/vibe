import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { revalidateTag } from "next/cache";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { ICS_MAX_CHARS } from "./ics";
import { feedsForCampus, mergeSchoolEvents, normalizeFeedWithCount, type SchoolFeed } from "./sources";
import { SCHOOL_ON, mergeSchoolSwitch, parseSchoolOffEnv, parseSchoolOffSetting, type SchoolSwitch } from "./switch";
import type { SchoolEvent, SchoolSource, SchoolSourceKey } from "./types";

/**
 * Reads the school calendars for GET /api/school-events (CONTRACT.md §3.6).
 *
 * Three layers keep the outside sites barely touched:
 *   1. a per-instance memo: within 10 minutes of the last try there is no
 *      fetch at all, so a dev hard refresh (which skips Next's cache) or a
 *      busy evening can't hammer the sites;
 *   2. one in-flight read per calendar, shared by every request waiting on it;
 *   3. Next's Data Cache (`next.revalidate` 2 h): it keeps 200 answers only
 *      and serves the stored copy while it refreshes in the background, so
 *      each site is read about once per 2 hours (the Jaguars robots.txt asks
 *      for 30 s between requests; this is far under). Not `use cache` or
 *      `unstable_cache`: this app has no Cache Components, and
 *      `unstable_cache` is on its way out.
 *
 * A calendar that fails (non-200 or a redirect, timeout, a thrown fetch, a
 * body too big or not iCal at all, or Next still serving a copy over 24 h
 * old) keeps its last good list for up to 24 h, else shows nothing; the
 * others are unaffected. A refused 200 is also dropped from Next's cache,
 * which would otherwise keep it. Nothing here throws to the route.
 *
 * Privacy: the requests carry no person's data, only a plain User-Agent
 * that names the app (never an email), and nothing read here is stored.
 */

/** Names the app and where it lives, so the sites can see who reads them. Never an email. */
export const SCHOOL_EVENTS_USER_AGENT = "Vibe/1 (+https://www.connectvibe.app)";

const FRESH_MS = 10 * 60_000;
const KEEP_GOOD_MS = 24 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 4000;
const REVALIDATE_SEC = 7200;
const SWITCH_MEMO_MS = 30_000;
/** The switch row's read gives up after this, like the limiter's own call (a stalled database must not hold the route). */
const ROW_TIMEOUT_MS = 1500;
/** About what Next's Data Cache will store: 2 MiB of JSON, with the body as base64 (4/3 its size). */
const CACHE_ITEM_MAX_CHARS = 1_500_000;

type Memo = {
  items: SchoolEvent[];
  /** When the site sent the copy `items` came from (its Date header, else when we read it); 0 for none. */
  goodAt: number;
  triedAt: number;
};

const memos = new Map<SchoolSourceKey, Memo>();
const inFlight = new Map<SchoolSourceKey, Promise<SchoolEvent[]>>();
const warned = new Set<string>();

/** One line per calendar per reason per instance: a site that stays down doesn't fill the log. */
function warnOnce(key: SchoolSourceKey, reason: string): void {
  const id = `${key}:${reason}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn("[school-events]", key, reason);
}

class FeedFailure extends Error {}

/** Dev only: "file" reads the fixtures, "fail" makes every calendar fail; null everywhere else. */
function fixtureMode(): "file" | "fail" | null {
  if (process.env.NODE_ENV !== "development") return null;
  const raw = (process.env.SCHOOL_EVENTS_FIXTURES ?? "").trim().toLowerCase();
  return raw === "1" ? "file" : raw === "fail" ? "fail" : null;
}

/** `src/lib/school-events/fixtures/<key>.ics`; a missing file is an empty calendar (iu-featured has none; the iub-* files are Oct 19, 2026). */
async function readFixture(key: SchoolSourceKey): Promise<string> {
  try {
    // `key` comes from the fixed feed list (sources.ts), never from a request.
    return await readFile(join(process.cwd(), "src", "lib", "school-events", "fixtures", `${key}.ics`), "utf8");
  } catch {
    return "BEGIN:VCALENDAR\nEND:VCALENDAR\n";
  }
}

/**
 * Next's Data Cache stores every 200 before this code can look at it, and
 * every instance reads that copy: a maintenance page, or a body that lies
 * about its size, would be served from it for 2 hours, and a cold instance
 * has no last good list to fall back on. So a 200 we refuse drops this
 * calendar's cached copy at once (`expire: 0`: the next read goes to the
 * site, never back to the bad copy).
 */
function dropCachedCopy(feed: SchoolFeed): void {
  try {
    revalidateTag(`school-events:${feed.key}`, { expire: 0 });
  } catch {
    // Outside a Next request (a script, a plain test) there is no cache to drop.
  }
}

/**
 * When the site sent this copy: its Date header. While a site is down, Next
 * keeps answering with the stored copy (headers and all) and retries in the
 * background, for as long as the site stays down; the Date header is the
 * only sign of how old that copy is. Missing, unreadable or ahead of our
 * clock: now.
 */
function sentAt(res: Response, now: number): number {
  const date = Date.parse(res.headers.get("date") ?? "");
  return Number.isFinite(date) && date < now ? date : now;
}

type FeedBody = { text: string; fetchedAt: number };

async function fetchFeed(feed: SchoolFeed): Promise<FeedBody> {
  let res: Response;
  try {
    res = await fetch(feed.feed_url, {
      headers: { "user-agent": SCHOOL_EVENTS_USER_AGENT, accept: "text/calendar" },
      // A redirect is refused (it lands as status_30x below), not followed:
      // a feed address that starts pointing at another site must not get its
      // text onto every screen of that campus. This also covers Next's
      // background refresh, which reuses these options. If a school moves
      // its feed, update feed_url in sources.ts.
      redirect: "manual",
      next: { revalidate: REVALIDATE_SEC, tags: ["school-events", `school-events:${feed.key}`] },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new FeedFailure(name === "TimeoutError" || name === "AbortError" ? "timeout" : "fetch_failed");
  }
  // Unread bodies are let go, so a refused answer doesn't hold its connection open.
  const refuse = (reason: string, cached: boolean): never => {
    res.body?.cancel().catch(() => {});
    if (cached) dropCachedCopy(feed);
    throw new FeedFailure(reason);
  };
  // Next caches only 200s, so a non-200 has no copy to drop.
  if (res.status !== 200) refuse(`status_${res.status}`, false);
  // Refuse a body that says up front it is too big (bytes; a character is at most 4), before reading it.
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > ICS_MAX_CHARS * 4) refuse("too_big", true);
  const text = await res.text();
  if (text.length > ICS_MAX_CHARS) refuse("too_big", true);
  // Next stores a fetch body as base64 in JSON and won't keep an item over 2 MiB, so a feed this
  // size is read from the site at every memo expiry. Still shown, but said once in the log.
  if (text.length > CACHE_ITEM_MAX_CHARS) warnOnce(feed.key, "too_big_to_cache");
  return { text, fetchedAt: sentAt(res, Date.now()) };
}

/** One calendar, fetched (or read from its fixture) and normalized. Throws FeedFailure with a reason. */
async function loadFeed(feed: SchoolFeed): Promise<{ items: SchoolEvent[]; fetchedAt: number }> {
  const mode = fixtureMode();
  if (mode === "fail") throw new FeedFailure("fixtures_fail");
  let body: FeedBody;
  try {
    body = mode === "file" ? { text: await readFixture(feed.key), fetchedAt: Date.now() } : await fetchFeed(feed);
  } catch (err) {
    throw err instanceof FeedFailure ? err : new FeedFailure("read_failed");
  }
  // A 200 that isn't a calendar (a maintenance page) must not wipe the last good list.
  // A real calendar with no events (Indy's Featured was empty on Oct 19) is a good answer.
  if (!/BEGIN:VCALENDAR/i.test(body.text)) {
    if (mode !== "file") dropCachedCopy(feed);
    throw new FeedFailure("not_ics");
  }
  const { parsed, events } = normalizeFeedWithCount(body.text, feed);
  // Rows came in but none passed: most likely the school changed its format (a new LOCATION
  // style hides every home game), or a CDN answered with a calendar of nothing usable. Still
  // a good answer, but said once in the log instead of going quiet. Not for a `featured`
  // calendar, whose few picks can all be all-day. By the flag, not the key (Oct 19, 2026):
  // Bloomington's "featured" group lists about 180 events and must be reported.
  if (parsed > 0 && events.length === 0 && !feed.featured) warnOnce(feed.key, "none_kept");
  return { items: events, fetchedAt: body.fetchedAt };
}

/** What a calendar shows when it can't be read: its last good list while under 24 h old, else nothing. */
function fallback(memo: Memo | undefined, now: number): SchoolEvent[] {
  return memo && now - memo.goodAt < KEEP_GOOD_MS ? memo.items : [];
}

async function refresh(feed: SchoolFeed): Promise<SchoolEvent[]> {
  try {
    const { items, fetchedAt } = await loadFeed(feed);
    const at = Date.now();
    // Next answering with a copy kept since before the site went down: past 24 h that is down too.
    if (at - fetchedAt >= KEEP_GOOD_MS) throw new FeedFailure("stale_copy");
    memos.set(feed.key, { items, goodAt: fetchedAt, triedAt: at });
    return items;
  } catch (err) {
    warnOnce(feed.key, err instanceof FeedFailure ? err.message : "unexpected");
    const at = Date.now();
    const prior = memos.get(feed.key);
    const items = fallback(prior, at);
    // Remember the try as well, so a site that is down is asked again only after 10 minutes.
    memos.set(feed.key, { items, goodAt: prior && items.length ? prior.goodAt : 0, triedAt: at });
    return items;
  }
}

function readFeed(feed: SchoolFeed): Promise<SchoolEvent[]> {
  const now = Date.now();
  const memo = memos.get(feed.key);
  if (memo && now - memo.triedAt < FRESH_MS) {
    // A list kept from before a failure still ages out at 24 h, even inside the 10 minutes.
    return Promise.resolve(memo.goodAt && now - memo.goodAt >= KEEP_GOOD_MS ? [] : memo.items);
  }
  let pending = inFlight.get(feed.key);
  if (!pending) {
    pending = refresh(feed).finally(() => inFlight.delete(feed.key));
    inFlight.set(feed.key, pending);
  }
  return pending;
}

/** What the screens get: the credit, the calendar page and the role and label (never the feed address). */
function toSource(feed: SchoolFeed): SchoolSource {
  return {
    key: feed.key,
    host: feed.host,
    credit: feed.credit,
    calendar_url: feed.calendar_url,
    role: feed.role,
    label: feed.label,
  };
}

/**
 * The campus's calendars not in `skip`, in parallel, merged around `now`
 * (the route's clock: real time, or the dev-only `&now=`). `sources` are the
 * calendars switched on, in fixed order, without their feed addresses.
 * Only `campusId`'s calendars are read (Oct 19, 2026: Bloomington never
 * fetches Indy's, and the other way round). Never throws: on anything
 * unexpected it answers no events.
 */
export async function readSchoolEvents(opts: {
  campusId: string;
  now: number;
  skip: ReadonlySet<SchoolSourceKey>;
}): Promise<{ events: SchoolEvent[]; sources: SchoolSource[] }> {
  const feeds = feedsForCampus(opts.campusId).filter((feed) => !opts.skip.has(feed.key));
  const sources = feeds.map(toSource);
  try {
    const lists = await Promise.all(feeds.map((feed) => readFeed(feed).catch(() => [] as SchoolEvent[])));
    return { events: mergeSchoolEvents(lists, opts.now), sources };
  } catch (err) {
    console.warn("[school-events] merge failed", err instanceof Error ? err.message : "unknown");
    return { events: [], sources };
  }
}

// ── The switch's fast half: the app_settings row ──────────────────────────────

let rowMemo: { value: SchoolSwitch; at: number } | null = null;
let rowInFlight: Promise<SchoolSwitch> | null = null;
let rowLastGood: SchoolSwitch | null = null;
let rowWarned = false;

/** The row's switch, or null when it can't be read (no service key, an error). */
async function readRow(): Promise<SchoolSwitch | null> {
  if (!isSupabaseServiceConfigured()) return null;
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("app_settings")
      .select("value")
      .eq("key", "school_events_off")
      // A timeout lands as an error: the last good value, or on.
      .abortSignal(AbortSignal.timeout(ROW_TIMEOUT_MS))
      .maybeSingle();
    if (error) return null;
    return parseSchoolOffSetting(data ? (data as { value?: unknown }).value : undefined);
  } catch {
    return null;
  }
}

/** The row, remembered 30 s per instance; on an error the last good value (none yet: on). */
function readRowSwitch(): Promise<SchoolSwitch> {
  const now = Date.now();
  if (rowMemo && now - rowMemo.at < SWITCH_MEMO_MS) return Promise.resolve(rowMemo.value);
  if (!rowInFlight) {
    rowInFlight = readRow()
      .then((value) => {
        if (value) rowLastGood = value;
        else if (!rowWarned && isSupabaseServiceConfigured()) {
          rowWarned = true;
          console.warn("[school-events] switch row unreadable, keeping the last good value");
        }
        const kept = value ?? rowLastGood ?? SCHOOL_ON;
        rowMemo = { value: kept, at: Date.now() };
        return kept;
      })
      .finally(() => {
        rowInFlight = null;
      });
  }
  return rowInFlight;
}

/**
 * The switch: `SCHOOL_EVENTS_OFF` merged with the `school_events_off` row,
 * off if either says off. When the env already turns everything off, the
 * row isn't read at all.
 */
export async function readSchoolSwitch(env: NodeJS.ProcessEnv = process.env): Promise<SchoolSwitch> {
  const fromEnv = parseSchoolOffEnv(env.SCHOOL_EVENTS_OFF);
  if (fromEnv.all) return fromEnv;
  return mergeSchoolSwitch(fromEnv, await readRowSwitch());
}
