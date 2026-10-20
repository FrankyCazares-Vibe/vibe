import { NextResponse } from "next/server";

import { resolveCampusRequest, scopeViewerFromRow } from "@/lib/iu/campus-request";
import { campusScopeError } from "@/lib/iu/community-scope";
import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { readSchoolEvents, readSchoolSwitch } from "@/lib/school-events/read-server";
import { feedsForCampus } from "@/lib/school-events/sources";
import type { SchoolEventsResponse } from "@/lib/school-events/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/school-events[?campus=<id>] (signed in): the school's own
 * calendars for "What's the vibe tonight?" (CONTRACT.md §3.1-3.2).
 *
 * The campus follows GET /api/events' `?campus=` rule, so a student looking
 * around another campus gets that campus's answer. Indianapolis and (since
 * Oct 19, 2026) Bloomington have school calendars, each campus only its
 * own; everywhere else answers `school_on: false` and the screens hide every
 * school part.
 *
 * Never a 500 for a calendar problem: a calendar that is down is just
 * missing, and anything thrown past the sign-in check answers the
 * `school_on: false` body. The only database reads are the viewer's own
 * campus row and the switch row; nothing is written and nothing is stored
 * about who asked (the limiter counts per DAY on purpose, budgets.ts).
 *
 * `&cards=any` (Oct 19, 2026): the page can draw any calendar; without it
 * only Indy's three are sent (OLD_PAGE_KEYS below).
 *
 * Development only: `&now=<ISO>` fakes the clock, to see an evening at noon.
 */

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * The only calendars a page from before Oct 19, 2026 can draw. Why: that
 * page's school card knew just these three names and crashed on any other,
 * and with no boundary around the Events grid the whole app fell to the
 * error page. A tab opened before the Bloomington deploy and kept on screen
 * never reloads onto the new build, so it must never be sent "iub-*" rows.
 * Newer pages send `cards=any` (use-school-events.ts); without it the other
 * calendars are left out, and Bloomington answers off, as it did before.
 * Safe to delete (with the client's `cards=any`) a week or so after the deploy.
 */
const OLD_PAGE_KEYS: ReadonlySet<string> = new Set(["athletics", "iu-student-affairs", "iu-featured"]);

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
    // A campus with no calendar of its own answers off before the switch is
    // even read (Oct 19, 2026: the campus's feed list, no longer "is it Indy").
    if (campusId === null || feedsForCampus(campusId).length === 0) return off(campusId);

    const sw = await readSchoolSwitch();
    if (sw.all) return off(campusId);

    let skip = sw.sources;
    if (url.searchParams.get("cards") !== "any") {
      const unknownToOldPage = feedsForCampus(campusId).filter((f) => !OLD_PAGE_KEYS.has(f.key));
      if (unknownToOldPage.length > 0) skip = new Set([...skip, ...unknownToOldPage.map((f) => f.key)]);
    }

    const { events, sources } = await readSchoolEvents({ campusId, now: clockFor(url), skip });
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
