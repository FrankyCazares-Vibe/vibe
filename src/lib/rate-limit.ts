import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Fixed-window rate limiter backed by Postgres (`public.rate_limit_hit`).
 *
 * Why the DB and not memory: Vercel functions are stateless and fan out
 * across instances, so an in-process counter is trivially bypassed. A
 * single indexed row per (key, window) is cheap and shared.
 *
 * Fail-open by default: if the RPC errors (migration not applied, DB hiccup)
 * we log and allow the request rather than taking the product down.
 *
 * `failClosed: true` flips that for limiters that ARE the security control,
 * not just cost control — e.g. the typed IU code, where an open limiter would
 * turn a DB hiccup into unlimited guesses. Those callers deny with a short
 * retry instead.
 */
export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — only meaningful when `allowed` is false. */
  retryAfterSec: number;
};

export async function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number; failClosed?: boolean },
): Promise<RateLimitResult> {
  const onFailure: RateLimitResult = opts.failClosed
    ? { allowed: false, retryAfterSec: 60 }
    : { allowed: true, retryAfterSec: 0 };
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSec,
    });
    if (error) {
      console.error("[rate-limit] rpc failed", error.message);
      return onFailure;
    }
    const allowed = data === true;
    return { allowed, retryAfterSec: allowed ? 0 : opts.windowSec };
  } catch (err) {
    console.error("[rate-limit] unexpected", err);
    return onFailure;
  }
}

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

/** Standard 429 body + Retry-After header. `message` overrides the generic copy. */
export function tooManyRequests(
  result: RateLimitResult,
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
