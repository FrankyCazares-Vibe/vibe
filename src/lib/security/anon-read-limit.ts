import "server-only";

import {
  clientNetworkCode,
  clientWideNetworkCode,
  rateLimit,
  tooManyRequests,
  type RateLimitOptions,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * The cap on signed-out reads (limits plan, Oct 15 2026, Wave 2 B2.3).
 *
 * WHAT IT COVERS. Signed out, five requests answer with someone's data: the
 * profile page `/profile/<h>` (name, tagline, bio and photo in its preview
 * card, and a 404 for a handle nobody has), the club page `/orgs/<h>`, the
 * post page `/posts/<id>` (author and text in its preview card), the profile
 * itself (`/api/users/<h>/bootstrap`) and the profile's grid
 * (`/api/users/<h>/posts`). Each is fine to read once. A script walking every
 * handle is what this slows down. The three pages are counted in
 * src/proxy.ts, the two data calls in their routes. A signed-in request is
 * never counted, anywhere.
 *
 * ONE VIEW, ONE COUNT (critique 15). Opening a profile signed out makes three
 * of those requests: the page, then the profile and the grid, from the
 * desktop page or the phone screen. Counted in one pot, a network's day
 * would be a third of what it says. Nothing short of a cookie can tell our
 * page's own data call from a script's copy of it, since every header can be
 * copied, and the Privacy Policy (section 7) says Vibe sets no cookie but
 * the sign-in one. So each kind of request has its own pot (`page`,
 * `profile`, `grid`), and a view takes one count from each pot it touches.
 * Every number below is in views.
 *
 * THE NUMBERS, per network and per pot: 300 an hour, 1,500 a day. On campus
 * Wi-Fi many phones leave through a few shared IPv4 addresses, and a phone
 * carrier can put thousands of people behind one (on IPv6 a device usually
 * has a /64, and so a pot, of its own). Only signed-out views count: share
 * links opened in Instagram's or iMessage's own browser, a QR code at a club
 * fair. 300 an hour is a demo day of 150 people each opening two links in
 * the same hour on one Wi-Fi (the page-open tally is sized the same way,
 * src/lib/tally/limits.ts); 1,500 a day is five hours like that. Everyone
 * signed in on that Wi-Fi is never held back. A script on one network gets
 * 1,500 profiles a day instead of all of them; one spread over many networks
 * meets the ceiling. For IPv6 the network is the /64, as for every limiter
 * (`networkBucket` in src/lib/rate-limit.ts).
 *
 * THE WIDER IPv6 NETWORK: 1,500 views an hour per /48, per pot. A /64 is
 * cheap: one /48 (a free tunnel, some homes) holds 65,536 of them, each with
 * its own 300 an hour, enough to spend the ceiling for everyone from one
 * place. So on IPv6 the /48 has an hour of its own, five times one
 * network's: spending the ceiling takes at least six /48s. A phone carrier
 * can hand many phones /64s out of one /48; only their signed-out views
 * count, and only in the same hour. IPv4 has no wider network here.
 *
 * THE CEILING: 9,000 views an hour across all networks, per pot. Many
 * addresses are cheap, so the per-network limits alone don't stop a flood.
 * Far above real signed-out traffic. When a flood spends it, every
 * signed-out visitor gets the 429 until the hour ends (Franky's call 7a;
 * signed-in students are never affected), and the log says so.
 *
 * THE ORDER (critique 13): (1) this server already knows the ceiling is
 * spent this hour: refuse with no database call at all; (2) the network's
 * hour, (3) its day, (4) on IPv6, its /48's hour, (5) the ceiling, in the
 * database. A request refused by its own network or /48 never reaches the
 * ceiling, so no one network, and no one /48, can spend it for everyone else.
 * Step 1 keeps a flood from many networks from costing two writes a request
 * once the ceiling is gone. It is this server's memory, best effort only:
 * the proxy may run on many servers and its memory is not to be relied on
 * (Next's proxy docs). The database is the control.
 *
 * NO ADDRESS. Keys hold `clientNetworkCode(req, "anon-read")` (and, for the
 * /48, `clientWideNetworkCode(req, "anon-read-wide")`): 32 hex characters
 * made from the network, the UTC day and a secret only the server holds, new
 * every day (src/lib/tally/network-code.ts). Never the address, the prefix,
 * the handle or the post id, so a row says only that some network opened N
 * signed-out pages of one kind in an hour or a day. With no secret set there
 * is no code: the network limits are skipped and only the ceiling applies
 * (said once in the log).
 *
 * AN HOUR AND A DAY ONLY (critique 14). A minute window would keep a
 * minute-by-minute record of each signed-out network in `public.rate_limits`.
 * The day is the UTC day the code changes on.
 *
 * FAILS OPEN. If the limiter can't count (the database is slow or down, its
 * breaker is open), the read goes through: a profile that won't load because
 * a counter is sick is the worse mistake here. The ceiling's failures don't
 * trip the breaker (`hotKey`). Anything this file throws lets the read
 * through too.
 *
 * THE SAME 429 FOR EVERY HANDLE. The check runs before the handle or post is
 * looked up, so one that exists and one that doesn't are refused alike, with
 * Retry-After. The log says a refusal at most once a minute per pot and
 * reason, as a count: never the network, the code, the handle or the path.
 */

/** Which pot: a page (the proxy), a profile (bootstrap) or a grid (posts). */
export type AnonReadKind = "page" | "profile" | "grid";

export const ANON_READS_PER_NETWORK_PER_HOUR = 300;
export const ANON_READS_PER_NETWORK_PER_DAY = 1500;
export const ANON_READS_PER_WIDE_NETWORK_PER_HOUR = 1500;
export const ANON_READS_ALL_NETWORKS_PER_HOUR = 9000;

const HOUR_SEC = 3600;
const DAY_SEC = 86_400;

/** The purposes in the network codes (`limiterNetworkCode`): their own, so no other limiter's code matches. */
export const ANON_READ_PURPOSE = "anon-read";
export const ANON_READ_WIDE_PURPOSE = "anon-read-wide";

/** A refusal is said at most this often per pot and reason, per server. */
const NOTE_EVERY_MS = 60_000;

type Drop = "network-hour" | "network-day" | "wide-hour" | "all-networks";

const DROP_WORDS: Record<Drop, string> = {
  "network-hour": `one network passed its ${ANON_READS_PER_NETWORK_PER_HOUR} for this hour`,
  "network-day": `one network passed its ${ANON_READS_PER_NETWORK_PER_DAY} for today`,
  "wide-hour": `one IPv6 /48 passed its ${ANON_READS_PER_WIDE_NETWORK_PER_HOUR} for this hour`,
  "all-networks": `all networks together passed ${ANON_READS_ALL_NETWORKS_PER_HOUR} this hour (a flood, or a real hour past the ceiling: raise it if it is real)`,
};

export type AnonReadDeps = {
  /** One count (`rateLimit` in production). */
  limit: (key: string | null, opts: RateLimitOptions) => Promise<RateLimitResult>;
  /** The request's network code, or null with no secret (`anonReadNetworkCode`). */
  networkCode: (req: Request) => string | null;
  /** The code of its IPv6 /48, or null on IPv4 or with no secret (`anonReadWideNetworkCode`). */
  wideNetworkCode?: (req: Request) => string | null;
  /** Milliseconds since the epoch; tests move it by hand. */
  now?: () => number;
  log?: (line: string) => void;
};

/** The keys of one pot. No address, prefix, handle or id in any of them. Exported for tests. */
export function anonReadKeys(kind: AnonReadKind, code: string | null, wideCode: string | null = null) {
  return {
    hour: code ? `anon-read-${kind}:${code}` : null,
    day: code ? `anon-read-${kind}-day:${code}` : null,
    wide: wideCode ? `anon-read-${kind}-wide:${wideCode}` : null,
    all: `anon-read-${kind}-all`,
  };
}

/** The request's network code for this limiter, today. */
export function anonReadNetworkCode(req: Request, now: Date = new Date()): string | null {
  return clientNetworkCode(req, ANON_READ_PURPOSE, now);
}

/** The code of the request's IPv6 /48 for this limiter, today; null on IPv4. */
export function anonReadWideNetworkCode(req: Request, now: Date = new Date()): string | null {
  return clientWideNetworkCode(req, ANON_READ_WIDE_PURPOSE, now);
}

/** Let through without a count: what the limiter itself answers when it can't count. */
const NOT_COUNTED: RateLimitResult = { allowed: true, retryAfterSec: 0, reason: "unavailable" };

/** A signed-out read limiter with its own note of a spent ceiling. One per server in production (`anonReadLimit`); tests make their own. */
export function createAnonReadLimiter(deps: AnonReadDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.warn(line));
  /** Per pot: until when this server knows the ceiling is spent. */
  const ceilingSpentUntil = new Map<AnonReadKind, number>();
  const notes = new Map<string, { at: number; held: number }>();
  let saidNoCode = false;

  /** The first refusal of a kind is said at once; the next minute's are held and added to the next line. */
  function note(kind: AnonReadKind, drop: Drop): void {
    const t = now();
    const id = `${kind}/${drop}`;
    const last = notes.get(id);
    if (last && Math.abs(t - last.at) < NOTE_EVERY_MS) {
      last.held += 1;
      return;
    }
    const n = (last?.held ?? 0) + 1;
    notes.set(id, { at: t, held: 0 });
    log(`[anon-read] ${kind}: ${DROP_WORDS[drop]}: ${n === 1 ? "a read was" : `${n} reads were`} refused`);
  }

  async function check(req: Request, kind: AnonReadKind): Promise<RateLimitResult> {
    const spentUntil = ceilingSpentUntil.get(kind) ?? 0;
    const start = now();
    if (start < spentUntil) {
      note(kind, "all-networks");
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((spentUntil - start) / 1000)), reason: "limited" };
    }

    const keys = anonReadKeys(kind, deps.networkCode(req), deps.wideNetworkCode?.(req) ?? null);
    if (keys.hour && keys.day) {
      const hour = await deps.limit(keys.hour, { limit: ANON_READS_PER_NETWORK_PER_HOUR, windowSec: HOUR_SEC });
      if (!hour.allowed) {
        note(kind, "network-hour");
        return hour;
      }
      const day = await deps.limit(keys.day, { limit: ANON_READS_PER_NETWORK_PER_DAY, windowSec: DAY_SEC });
      if (!day.allowed) {
        note(kind, "network-day");
        return day;
      }
      // IPv6 only: the /48 around the /64, so its 65,536 /64s share one hour.
      if (keys.wide) {
        const wide = await deps.limit(keys.wide, { limit: ANON_READS_PER_WIDE_NETWORK_PER_HOUR, windowSec: HOUR_SEC });
        if (!wide.allowed) {
          note(kind, "wide-hour");
          return wide;
        }
      }
    } else if (!saidNoCode) {
      saidNoCode = true;
      log("[anon-read] no network code (the secret is missing or short): only the all-networks ceiling applies");
    }

    // No network in this key: one count for everybody.
    const everyone = await deps.limit(keys.all, {
      limit: ANON_READS_ALL_NETWORKS_PER_HOUR,
      windowSec: HOUR_SEC,
      hotKey: true,
    });
    if (!everyone.allowed) {
      if (everyone.reason === "limited") ceilingSpentUntil.set(kind, now() + everyone.retryAfterSec * 1000);
      note(kind, "all-networks");
    }
    return everyone;
  }

  /** One signed-out read of `kind`. Never throws: anything unexpected lets the read through. */
  return async function anonRead(req: Request, kind: AnonReadKind): Promise<RateLimitResult> {
    try {
      return await check(req, kind);
    } catch (err) {
      log(`[anon-read] unexpected: ${err instanceof Error ? err.name : "unknown"}`);
      return NOT_COUNTED;
    }
  };
}

/** This server's signed-out read limiter. Call it only when nobody is signed in. */
export const anonReadLimit = createAnonReadLimiter({
  limit: rateLimit,
  networkCode: (req) => anonReadNetworkCode(req),
  wideNetworkCode: (req) => anonReadWideNetworkCode(req),
});

/**
 * The pages the proxy counts: `/profile/<h>`, `/orgs/<h>` and `/posts/<id>`,
 * one segment exactly, with any method but OPTIONS. Next renders these pages
 * for a POST, PUT, PATCH or DELETE just as for a GET (and a HEAD's status
 * alone says whether a handle exists), so each of those is a read too; an
 * OPTIONS gets no page. A trailing slash only earns Next's redirect to the
 * bare path, which is counted when it arrives. A move inside the app to one
 * of these pages counts the same, whatever headers it carries (any of them
 * could be copied); no signed-out page links to them with next/link, so no
 * prefetch spends a count. The caller checks that nobody is signed in.
 */
const READ_PAGE = /^\/(?:profile|orgs|posts)\/[^/]+$/;
/**
 * A club's link pictures (Oct 23, 2026: `src/app/orgs/[handle]/opengraph-image`
 * and `twitter-image`) count the same: each is a database read and a drawn
 * picture for anyone signed out, and its answer says whether a handle is a
 * visible club. Link-preview fetchers ask once per pasted link.
 */
const CLUB_PICTURE = /^\/orgs\/[^/]+\/(?:opengraph|twitter)-image$/;

export function isSignedOutReadPage(pathname: string, method: string): boolean {
  return method !== "OPTIONS" && (READ_PAGE.test(pathname) || CLUB_PICTURE.test(pathname));
}

/** What the data routes' 429 says; failure-copy.ts shows the same line, with Sign in, for this code. */
export const ANON_READ_LINE = "Vibe is getting a lot of visits from people who aren't signed in. Try again later, or sign in.";
export const ANON_READ_CODE = "anon_read_limited";

/** The data routes' 429: the usual JSON with its code and Retry-After, kept by no cache. The same for every handle. */
export function anonReadRefusal(result: RateLimitResult): Response {
  const res = tooManyRequests(result, ANON_READ_LINE, ANON_READ_CODE);
  res.headers.set("cache-control", "no-store");
  return res;
}

/**
 * The pages' 429: no script, no style, the browser's own light or dark.
 * Sign in comes back to the page asked for (`pathname`, which the visitor
 * already has), so nothing in it depends on whether the handle exists.
 */
export function anonReadPageHtml(pathname: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Try again soon · Vibe</title>
</head>
<body>
<main>
<h1>Try again soon</h1>
<p>Vibe is getting a lot of visits from people who aren&rsquo;t signed in, so it is showing fewer pages for a while. Try again later, or sign in to keep going.</p>
<p><a href="/auth/login?next=${encodeURIComponent(pathname)}">Sign in</a></p>
</main>
</body>
</html>
`;
}

/** The body and init the proxy builds its 429 page from (it adds the cookies and the browser code rule). */
export function anonReadPageRefusal(result: RateLimitResult, pathname: string): { body: string; init: ResponseInit } {
  return {
    body: anonReadPageHtml(pathname),
    init: {
      status: 429,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": String(Math.max(1, result.retryAfterSec)),
        "cache-control": "no-store",
      },
    },
  };
}
