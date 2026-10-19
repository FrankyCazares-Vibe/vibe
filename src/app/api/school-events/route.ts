import { NextResponse } from "next/server";

import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { campusScopeError } from "@/lib/iu/community-scope";
import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { readSchoolEvents, readSchoolSwitch } from "@/lib/school-events/read-server";
import { SCHOOL_CAMPUS_ID } from "@/lib/school-events/sources";
import type { SchoolEventsResponse } from "@/lib/school-events/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/school-events[?campus=<id>] (signed in): the school's own
 * calendars for "What's the vibe tonight?" (CONTRACT.md §3.1-3.2).
 *
 * The campus follows GET /api/events' `?campus=` rule, so a student looking
 * around another campus gets that campus's answer. Only Indianapolis has
 * school calendars in v1; everywhere else answers `school_on: false` and the
 * screens hide every school part.
 *
 * Never a 500 for a calendar problem: a calendar that is down is just
 * missing, and anything thrown past the sign-in check answers the
 * `school_on: false` body. The only database reads are the viewer's own
 * campus row and the switch row; nothing is written and nothing is stored
 * about who asked (the limiter counts per DAY on purpose, budgets.ts).
 *
 * Development only: `&now=<ISO>` fakes the clock, to see an evening at noon.
 */

const NO_STORE = { "cache-control": "private, no-store" };

let loggedThrow = false;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** The answer that hides every school part on screen. */
function off(campusId: string | null) {
  const body: SchoolEventsResponse = { ok: true, school_on: false, campus_id: campusId, events: [], sources: [] };
  return json(body);
}

/** The dev-only fake clock, else the real one. */
function clockFor(url: URL): number {
  if (process.env.NODE_ENV === "development") {
    const faked = Date.parse(url.searchParams.get("now") ?? "");
    if (Number.isFinite(faked)) return faked;
  }
  return Date.now();
}

/** Logs the first throw of this instance only, so a broken dependency can't flood the log. */
function logThrowOnce(where: string, err: unknown): void {
  if (loggedThrow) return;
  loggedThrow = true;
  console.error(where, err instanceof Error ? err.message : err);
}

export async function GET(req: Request) {
  // The sign-in check can throw too (a missing env, a cookie store that
  // isn't there). That is "can't confirm who you are", so a 401, never a
  // 500: the screens treat any failed read as "no school part".
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  let userId: string;
  try {
    supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return json({ ok: false, code: "unauthorized", error: "Unauthorized" }, 401);
    }
    userId = user.id;
  } catch (err) {
    logThrowOnce("[school-events GET auth]", err);
    return json({ ok: false, code: "unauthorized", error: "Unauthorized" }, 401);
  }

  let campusId: string | null = null;
  try {
    // Inside the try: the limiter lets through on its own failures, and a
    // throw past it answers the off body (no calendar data), never a 500.
    const rl = await limitFor("schoolEventsRead", userId);
    if (!rl.allowed) {
      const res = tooManyRequests(rl, "Too many tries. Try again later.");
      res.headers.set("cache-control", NO_STORE["cache-control"]);
      return res;
    }

    const url = new URL(req.url);
    const { data: me, error: meErr } = await supabase
      .from("users")
      .select("school, campus_id, school_system")
      .eq("id", userId)
      .maybeSingle();
    // No campus row means no campus to show calendars for; the rest of the page is unaffected.
    if (meErr) {
      console.error("[school-events GET viewer]", meErr.message ?? meErr);
      return off(null);
    }
    const viewer = scopeViewerFromRow(me as Record<string, unknown> | null);
    const scope = resolveCampusRequest(url.searchParams.get("campus"), viewer);
    if (scope.kind === "forbidden") {
      const { status, body } = campusScopeError(scope);
      return json(body, status);
    }

    campusId = scope.kind === "campus" ? scope.campusId : null;
    if (campusId !== SCHOOL_CAMPUS_ID) return off(campusId);

    const sw = await readSchoolSwitch();
    if (sw.all) return off(campusId);

    const { events, sources } = await readSchoolEvents({ now: clockFor(url), skip: sw.sources });
    const body: SchoolEventsResponse = {
      ok: true,
      school_on: sources.length > 0,
      campus_id: campusId,
      events,
      sources,
    };
    return json(body);
  } catch (err) {
    logThrowOnce("[school-events GET]", err);
    return off(campusId);
  }
}
