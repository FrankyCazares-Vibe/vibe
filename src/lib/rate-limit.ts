import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Fixed-window rate limiter backed by Postgres (`public.rate_limit_hit`).
 *
 * Why the DB and not memory: Vercel functions are stateless and fan out
 * across instances, so an in-process counter is trivially bypassed. A
 * single indexed row per (key, window) is cheap and shared.
 *
 * Fail-open: if the RPC errors (migration not applied, DB hiccup) we log
 * and allow the request rather than taking the product down.
 */
export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — only meaningful when `allowed` is false. */
  retryAfterSec: number;
};

export async function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSec,
    });
    if (error) {
      console.error("[rate-limit] rpc failed", error.message);
      return { allowed: true, retryAfterSec: 0 };
    }
    const allowed = data === true;
    return { allowed, retryAfterSec: allowed ? 0 : opts.windowSec };
  } catch (err) {
    console.error("[rate-limit] unexpected", err);
    return { allowed: true, retryAfterSec: 0 };
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

/** Standard 429 body + Retry-After header. */
export function tooManyRequests(result: RateLimitResult) {
  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests. Try again shortly." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, result.retryAfterSec)),
      },
    },
  );
}
