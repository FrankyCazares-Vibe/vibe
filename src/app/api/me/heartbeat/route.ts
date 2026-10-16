import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isMissingFunction, readTouchBody } from "@/lib/usage/touch";

const NO_STORE = { "cache-control": "no-store" } as const;

/** The refused fallback (see THE MINUTE AFTER THE CHANGE) is logged once per server, not per check-in. */
let fallbackRefusedLogged = false;

/** THE 20-SECOND GATE (below): how long a check-in stands in for the next, and how many accounts one server keeps. */
const REPEAT_MS = 20_000;
const REPEAT_MAX = 10_000;
const DAY_MS = 86_400_000;
/** Account id -> when this server last checked it in. Oldest first; nothing older than REPEAT_MS is kept. */
const lastCheckIn = new Map<string, number>();

/** This server checked the account in under 20 s ago, on the same UTC day (a day's first check-in is never skipped). */
function checkedInJustNow(userId: string, now: number): boolean {
  const at = lastCheckIn.get(userId);
  return at !== undefined && now >= at && now - at < REPEAT_MS && Math.floor(at / DAY_MS) === Math.floor(now / DAY_MS);
}

/** Remembers a check-in that landed, then drops the stale and, past REPEAT_MAX, the oldest. */
function rememberCheckIn(userId: string, now: number): void {
  lastCheckIn.delete(userId);
  lastCheckIn.set(userId, now);
  for (const [id, at] of lastCheckIn) {
    if (lastCheckIn.size <= REPEAT_MAX && now - at < REPEAT_MS) break;
    lastCheckIn.delete(id);
  }
}

function failed(): NextResponse {
  return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500, headers: NO_STORE });
}

/**
 * POST /api/me/heartbeat: the check-in. "Vibe is open on this person's
 * screen", at most once every four minutes per tab, and an Otto or map open
 * when there is one.
 *
 * WHO CALLS IT. <ActivityTouch /> in the root layout (every React page; the
 * Campus header waits on the same request), `countOpen` where Otto and the
 * map are opened (src/lib/usage/touch-client.ts), and
 * public/html/_usageTouch.js on the static profile. An older open tab posts
 * with no body: that still counts, as an "unknown" device.
 *
 * THE BODY, 128 characters at most: {"device":"phone"|"desktop"|"installed",
 * "open"?:"otto"|"map"} (readTouchBody, src/lib/usage/touch.ts). Anything
 * else reads as no body. The account never comes from the body, and the
 * browser's name and details (its user agent) are not read here.
 *
 * WHY THE SERVICE ROLE. `public.usage_touch` (20261014150000) moves the
 * person's last-active time forward and, on their first check-in of a UTC
 * day or Monday week, adds one to the day totals. It refuses anon and
 * authenticated inside (42501), so no browser can call it, and it takes the
 * account from here: the id the sign-in server verified (`getUser()`).
 * Not auth.uid(), which is null under the service role; and an id taken
 * from a signed-in caller would let anyone stamp anyone.
 *
 * NO LIMITER HERE, on purpose. A per-account limiter key would keep an
 * hour-by-hour row for every active person in rate_limit_hit for days, a
 * record of when each person was online. The function is the throttle: it
 * skips the stamp while the last one is under a minute old (without
 * locking the person's row, 20261016120000), and a day's opens stop at ten
 * times that day's active people.
 *
 * THE 20-SECOND GATE (rate limits wave 3, Oct 16). A second check-in from
 * the same account within 20 s of one that landed on THIS server answers
 * 200 without calling the database. The stamp is then at most 80 s old,
 * well inside the five-minute "active now" window, and the tab's next
 * check-in moves it as usual. Only when nothing is opened: an Otto
 * or map open always goes through, or it would go uncounted. Never across
 * a UTC midnight, so a day's first check-in is not skipped. The memory is
 * this server's only, holds no more than 10,000 accounts and nothing older
 * than 20 s, and goes with the server: it is not a stored record.
 *
 * BEFORE THE CHANGE IS APPLIED the function is missing (PGRST202 / 42883),
 * and the route stamps the old way, with the person's own client: "active
 * now" keeps working (from every page now) and nothing is counted. To be
 * removed in a later cleanup, once production has the function.
 *
 * THE MINUTE AFTER THE CHANGE. Between the migration's commit and
 * PostgREST's schema reload the call can still answer PGRST202, and the old
 * write is then refused by the migration's column revoke (42501). Nothing is
 * stamped for that one call and the next check-in counts as usual. Do not
 * move the fallback to the service client: it would stamp without counting
 * and lose that person's first count of the day.
 *
 * RESPONSES
 *   200 { ok: true } · 401 · 500 { ok: false, error: "Request failed" }
 *   Always no-store. The browser ignores the answer: a missed check-in is
 *   retried by the next one.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // The body is 128 characters at most; a longer one is not read at all.
  const length = Number(req.headers.get("content-length") ?? "0");
  const raw = length > 128 ? "" : await req.text().catch(() => "");
  const { device, open } = readTouchBody(raw);

  const now = Date.now();
  if (open === null && checkedInJustNow(user.id, now)) {
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  let error: { code?: string; message?: string } | null;
  try {
    ({ error } = await createSupabaseServiceClient().rpc("usage_touch", {
      p_user: user.id,
      p_device: device,
      p_open: open,
    }));
  } catch (err) {
    console.error("[me/heartbeat]", err instanceof Error ? err.message : String(err));
    return failed();
  }
  if (!error) {
    rememberCheckIn(user.id, now);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (!isMissingFunction(error)) {
    console.error("[me/heartbeat] usage_touch", error.code ?? "unknown", error.message);
    return failed();
  }

  // The fallback, until the function is there. The route's one write of the
  // last-active time (touch.test.ts keeps it the only one in src/).
  const { error: oldErr } = await supabase
    .from("users")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", user.id);
  if (!oldErr) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (oldErr.code === "42501") {
    if (!fallbackRefusedLogged) {
      fallbackRefusedLogged = true;
      console.error("[me/heartbeat] the check-in is not in the schema cache yet and the old stamp is refused");
    }
    return failed();
  }
  console.error("[me/heartbeat] fallback", oldErr.code ?? "unknown", oldErr.message);
  return failed();
}
