import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { limiterNetworkCode, utcDay } from "@/lib/tally/network-code";

/**
 * Fixed-window rate limiter backed by Postgres (`public.rate_limit_hit`).
 *
 * Why the DB and not memory: Vercel functions are stateless and fan out
 * across instances, so an in-process counter is trivially bypassed. A
 * single indexed row per (key, window) is cheap and shared.
 *
 * WHEN THE DATABASE CALL FAILS (error, no answer within 1.5 s, or the
 * breaker below is open), each limiter says what happens:
 *   - default: let it through, rather than taking the product down;
 *   - `failClosed: true`: refuse with a short retry, for limiters that ARE
 *     the security control, not just cost control (the typed IU code, where
 *     an open limiter would turn a DB hiccup into unlimited guesses);
 *   - `failLocal: true`: count in this server's memory instead, same key,
 *     limit and window, so an outage can't open the outside costs (uploads,
 *     pushes) wide. Nothing is written anywhere; each server counts on its
 *     own, and the count is gone when the server is.
 * `failClosed` wins if both are set.
 *
 * Three things keep a busy or sick database from costing more than it must,
 * all in this server's memory and all best effort:
 *   - DENY CACHE. Once the database says no for (key, limit, window), the
 *     same question is refused here until the window ends, without asking.
 *     Counts only go up inside a window, so the answer can't change. (A row
 *     cleared by hand doesn't lift a refusal a server already holds; the
 *     window's end does.)
 *   - TIMEOUT. The call gives up after 1.5 s, so a slow database can't stall
 *     every guarded route.
 *   - BREAKER. 3 failures to reach the database (no answer, a timeout, a
 *     gateway error) within 10 s, with no success between, and this server
 *     stops asking for 15 s: every limiter takes its failure path at once.
 *     One log line per trip, no keys. Errors the database itself answers
 *     with (a missing function, a statement timeout) don't count, and
 *     neither does a `hotKey` limiter's failure: a key everyone shares
 *     queues on its one row during a flood, which says nothing about the
 *     database as a whole.
 *
 * Every window must divide the day (60, 600, 3600, 86400 …). A per-network
 * key holds a code that changes at midnight UTC (`clientNetworkCode`), so a
 * longer or uneven window would be split in two; a window that breaks the
 * rule is refused as if the database were down, and logged.
 * rate-limit.test.ts scans src/ for every `windowSec`.
 */
export type RateLimitReason = "limited" | "unavailable";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — only meaningful when `allowed` is false. */
  retryAfterSec: number;
  /**
   * Why. "limited": the count is spent, here or in the database, and
   * `retryAfterSec` is the time left in the window. "unavailable": the
   * limiter couldn't count (the database failed, the breaker is open, there
   * was no key, the window broke the rule), whatever `allowed` says; a
   * refusal then retries in 60 s. null: counted, and allowed.
   */
  reason: RateLimitReason | null;
};

export type RateLimitOptions = {
  limit: number;
  /** Must divide 86,400 (see above). */
  windowSec: number;
  /** Refuse when the limiter can't count. Wins over `failLocal`. */
  failClosed?: boolean;
  /** Count in this server's memory when the limiter can't reach the database. */
  failLocal?: boolean;
  /** A key every caller shares (an all-networks ceiling): its failures never trip the breaker. */
  hotKey?: boolean;
};

/**
 * One count against `key`. A null key means there is nothing to count on
 * (no secret for a network code): the limiter then answers the way it does
 * when the database is down, and never falls back to a raw address.
 */
export async function rateLimit(
  key: string | null,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  return databaseLimiter(key, opts);
}

/** What one count in the database came back as. `detail` goes to the log; it never holds the key. */
export type LimiterHit =
  | { counted: true; allowed: boolean }
  | { counted: false; transport: boolean; detail: string };

/** The database call, injected so tests can stand in for it (`databaseHit` is the real one). */
export type LimiterHitFn = (call: {
  key: string;
  limit: number;
  windowSec: number;
  signal: AbortSignal;
}) => Promise<LimiterHit>;

export type LimiterDeps = {
  hit: LimiterHitFn;
  /** Milliseconds since the epoch; tests move it by hand. */
  now?: () => number;
  log?: (...parts: unknown[]) => void;
  timeoutMs?: number;
};

const DAY_SEC = 86_400;
const RPC_TIMEOUT_MS = 1500;
const FAIL_CLOSED_RETRY_SEC = 60;
const BREAKER_FAILURES = 3;
const BREAKER_SPAN_MS = 10_000;
const BREAKER_OPEN_MS = 15_000;
/** Ceiling for each of the two memory maps (denials, local counts). */
const MEMORY_CAP = 5000;
/**
 * A refusal in a window's first 2 s isn't cached: if this server's clock is
 * ahead of the database's, the database may still have been counting the
 * last window, and caching it would refuse the whole next one.
 */
const SKEW_MARGIN_MS = 2000;

/** True when the window is a whole number of seconds that divides the day. */
export function isDayAlignedWindow(windowSec: number): boolean {
  return Number.isInteger(windowSec) && windowSec >= 1 && windowSec <= DAY_SEC && DAY_SEC % windowSec === 0;
}

/** Seconds left in the current window, 1 to windowSec. Windows start on multiples of windowSec since the epoch, as in `rate_limit_hit`. */
export function secondsLeftInWindow(nowMs: number, windowSec: number): number {
  return windowSec - (Math.floor(nowMs / 1000) % windowSec);
}

/** No answer at all (a network error or our timeout), or a gateway in front of Postgres that couldn't reach it. */
export function isTransportFailure(status: number): boolean {
  if (status === 0 || status === 502 || status === 503 || status === 504) return true;
  return status >= 520 && status <= 530;
}

/** Map.set under MEMORY_CAP: expired entries go first, then the oldest. */
function setCapped<V extends { endMs: number }>(map: Map<string, V>, key: string, value: V, nowMs: number): void {
  map.delete(key);
  if (map.size >= MEMORY_CAP) {
    for (const [k, v] of map) if (v.endMs <= nowMs) map.delete(k);
    while (map.size >= MEMORY_CAP) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }
  map.set(key, value);
}

/** A limiter with its own deny cache, local counts and breaker. One per server in production (`rateLimit`); tests make their own. */
export function createRateLimiter(deps: LimiterDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((...parts: unknown[]) => console.error(...parts));
  const timeoutMs = deps.timeoutMs ?? RPC_TIMEOUT_MS;
  const denials = new Map<string, { endMs: number }>();
  const localCounts = new Map<string, { endMs: number; count: number }>();
  const warnedWindows = new Set<number>();
  let failures: number[] = [];
  let openUntil = 0;

  const windowEndMs = (t: number, windowSec: number) => (Math.floor(t / 1000 / windowSec) + 1) * windowSec * 1000;

  function countLocally(cacheKey: string, opts: RateLimitOptions, t: number): RateLimitResult {
    let entry = localCounts.get(cacheKey);
    if (!entry || entry.endMs <= t) {
      entry = { endMs: windowEndMs(t, opts.windowSec), count: 0 };
      setCapped(localCounts, cacheKey, entry, t);
    }
    entry.count += 1;
    if (entry.count <= opts.limit) return { allowed: true, retryAfterSec: 0, reason: "unavailable" };
    return { allowed: false, retryAfterSec: secondsLeftInWindow(t, opts.windowSec), reason: "limited" };
  }

  /** The failure path: refuse, count here, or let through. A null cacheKey has nothing to count on. */
  function unavailable(opts: RateLimitOptions, cacheKey: string | null, t: number): RateLimitResult {
    if (opts.failClosed) return { allowed: false, retryAfterSec: FAIL_CLOSED_RETRY_SEC, reason: "unavailable" };
    if (opts.failLocal && cacheKey) return countLocally(cacheKey, opts, t);
    return { allowed: true, retryAfterSec: 0, reason: "unavailable" };
  }

  function transportFailed(t: number): void {
    if (t < openUntil) return; // a call that was already in flight when it tripped
    failures = failures.filter((f) => t - f < BREAKER_SPAN_MS);
    failures.push(t);
    if (failures.length < BREAKER_FAILURES) return;
    failures = [];
    openUntil = t + BREAKER_OPEN_MS;
    log(
      `[rate-limit] breaker open: ${BREAKER_FAILURES} database failures in ${BREAKER_SPAN_MS / 1000}s, ` +
        `skipping the database for ${BREAKER_OPEN_MS / 1000}s`,
    );
  }

  /**
   * A refusal from the database: cached until its window ends, unless the
   * call crossed a window edge or began too near one. The retry is the time
   * left; a call that crossed an edge was most likely refused for the window
   * that just ended, so it may try again at once.
   */
  function refused(cacheKey: string, windowSec: number, start: number, end: number): RateLimitResult {
    const windowMs = windowSec * 1000;
    const windowStart = Math.floor(start / windowMs) * windowMs;
    if (Math.floor(end / windowMs) * windowMs !== windowStart) {
      return { allowed: false, retryAfterSec: 1, reason: "limited" };
    }
    if (start - windowStart >= SKEW_MARGIN_MS) {
      setCapped(denials, cacheKey, { endMs: windowStart + windowMs }, end);
    }
    return { allowed: false, retryAfterSec: secondsLeftInWindow(end, windowSec), reason: "limited" };
  }

  async function hitWithTimeout(key: string, opts: RateLimitOptions): Promise<LimiterHit | null> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<LimiterHit>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ counted: false, transport: true, detail: `no answer in ${timeoutMs}ms` });
      }, timeoutMs);
    });
    try {
      const call = { key, limit: opts.limit, windowSec: opts.windowSec, signal: controller.signal };
      return await Promise.race([deps.hit(call), timedOut]);
    } catch (err) {
      log("[rate-limit] unexpected", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return async function limit(key: string | null, opts: RateLimitOptions): Promise<RateLimitResult> {
    const start = now();
    if (!isDayAlignedWindow(opts.windowSec)) {
      if (!warnedWindows.has(opts.windowSec)) {
        warnedWindows.add(opts.windowSec);
        log(`[rate-limit] a ${opts.windowSec}s window doesn't divide the day; not counting it`);
      }
      return unavailable(opts, null, start);
    }
    if (key === null) return unavailable(opts, null, start);

    // Key last: limit and window are numbers, so no two triples share a string.
    const cacheKey = `${opts.windowSec}/${opts.limit}/${key}`;
    const denial = denials.get(cacheKey);
    if (denial) {
      if (start < denial.endMs) {
        return { allowed: false, retryAfterSec: secondsLeftInWindow(start, opts.windowSec), reason: "limited" };
      }
      denials.delete(cacheKey);
    }
    if (start < openUntil) return unavailable(opts, cacheKey, start);

    const outcome = await hitWithTimeout(key, opts);
    const end = now();
    if (outcome?.counted) {
      failures = [];
      if (outcome.allowed) return { allowed: true, retryAfterSec: 0, reason: null };
      return refused(cacheKey, opts.windowSec, start, end);
    }
    if (outcome) {
      log("[rate-limit] rpc failed", outcome.detail);
      if (outcome.transport && !opts.hotKey) transportFailed(end);
    }
    return unavailable(opts, cacheKey, end);
  };
}

/**
 * One `rate_limit_hit` answer as a LimiterHit. An error is a failure to
 * count; it is a transport one (the breaker's kind) only when nothing, or a
 * gateway, answered: postgrest-js reports a fetch error or our abort as
 * status 0. `true` allows; anything else refuses. Exported for tests.
 */
export function toLimiterHit(answer: {
  data: unknown;
  error: { message: string } | null;
  status: number;
}): LimiterHit {
  if (answer.error) {
    return { counted: false, transport: isTransportFailure(answer.status), detail: answer.error.message };
  }
  return { counted: true, allowed: answer.data === true };
}

/** The real count: `public.rate_limit_hit`, through the service role, cut off by `signal`. */
async function databaseHit(call: Parameters<LimiterHitFn>[0]): Promise<LimiterHit> {
  const answer = await createSupabaseServiceClient()
    .rpc("rate_limit_hit", {
      p_key: call.key,
      p_limit: call.limit,
      p_window_seconds: call.windowSec,
    })
    .abortSignal(call.signal);
  return toLimiterHit(answer);
}

/** This server's limiter: one deny cache, one set of local counts, one breaker. */
const databaseLimiter = createRateLimiter({ hit: databaseHit });

/** Best-effort client IP behind Vercel / proxies. Falls back to "unknown". */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/**
 * clientIp as a per-network rate-limit bucket: IPv4 as is, IPv6 as its /64.
 * One phone or laptop on IPv6 is usually handed a whole /64 and can pick a
 * new address inside it at will, so a per-address key gives it a fresh
 * budget per address. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) counts as the IPv4
 * address. Anything we can't parse ("unknown", junk) comes back unchanged.
 */
export function clientNetworkKey(req: Request): string {
  return networkBucket(clientIp(req));
}

/**
 * clientNetworkKey as a scrambled code for one limiter's `purpose` (a short
 * tag like `pw-reset-ip`) on `now`'s UTC day: the key part a per-network
 * limiter stores instead of the network (src/lib/tally/network-code.ts,
 * `limiterNetworkCode`, says how). The code changes at midnight UTC and
 * differs per purpose, so no two limiters' rows, and no two days', can be
 * matched to each other.
 *
 * Null when SCHOOL_EMAIL_VERIFY_SECRET is missing or short, or the purpose
 * isn't a plain tag. Pass the null straight to `rateLimit` as the key: the
 * limiter then takes its failure path (`failClosed` refuses, the rest let
 * through). It never falls back to the address. A request with no address
 * header is the "unknown" network, one shared bucket, as today.
 *
 * Not used by any route yet: Wave 2 moves the 10 per-network keys onto it.
 */
export function clientNetworkCode(
  req: Request,
  purpose: string,
  now: Date = new Date(),
): string | null {
  return limiterNetworkCode(
    purpose,
    clientNetworkKey(req),
    utcDay(now),
    process.env.SCHOOL_EMAIL_VERIFY_SECRET,
  );
}

/** See clientNetworkKey. Exported for tests. */
export function networkBucket(ip: string): string {
  let s = ip.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end > 0) s = s.slice(1, end);
  }
  if (!s.includes(":")) return ip;
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const groups = parseIpv6(s);
  if (!groups) return ip;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi, lo] = [groups[6], groups[7]];
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/** The eight 16-bit groups of an IPv6 address, or null when it isn't one. */
function parseIpv6(address: string): number[] | null {
  let head = address.toLowerCase();
  const tail: number[] = [];
  // A dotted IPv4 in the last 32 bits (::ffff:1.2.3.4, 64:ff9b::1.2.3.4).
  const lastColon = head.lastIndexOf(":");
  const last = head.slice(lastColon + 1);
  if (last.includes(".")) {
    const octets = last.split(".");
    if (
      octets.length !== 4 ||
      !octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)
    ) {
      return null;
    }
    const [a, b, c, d] = octets.map(Number);
    tail.push((a << 8) | b, (c << 8) | d);
    head = head.slice(0, lastColon + 1);
    if (!head.endsWith("::")) head = head.slice(0, -1);
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (![...left, ...right].every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const given = left.length + right.length + tail.length;
  if (halves.length === 1 ? given !== 8 : given > 7) return null;
  const zeros: number[] = new Array<number>(8 - given).fill(0);
  return [
    ...left.map((g) => parseInt(g, 16)),
    ...(halves.length === 2 ? zeros : []),
    ...right.map((g) => parseInt(g, 16)),
    ...tail,
  ];
}

/**
 * Standard 429 body + Retry-After header. `message` overrides the generic
 * copy. Only the retry is read, so a result shaped like ours without
 * `reason` (password-reset-limits.ts) fits too.
 */
export function tooManyRequests(
  result: Pick<RateLimitResult, "retryAfterSec">,
  message = "Too many requests. Try again shortly.",
) {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, result.retryAfterSec)),
      },
    },
  );
}
