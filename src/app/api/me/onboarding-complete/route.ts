import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { clubLinkNextAfterOnboarding } from "@/lib/club-links/redeem";
import { requireCanPublish, requireNotRestricted } from "@/lib/moderation/access";
import {
  ONBOARDING_NEXT_PATH,
  finishDecision,
  ottoAnswersForFinish,
} from "@/lib/onboarding/finish";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = {
  /** Must be `2` (or "2"); anything else is 400 `update_required` (see docblock). */
  v?: unknown;
  otto_answers?: unknown;
  /** v:2 only — Skip: identity still required, campus optional (question 3). */
  skip?: unknown;
};

type FinishUserRow = {
  school_verified?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  name?: unknown;
  handle?: unknown;
  email?: unknown;
  handle_changed_at?: unknown;
};

const FINISH_COLUMNS =
  "school_verified,name,handle,email,handle_changed_at,school_system,campus_id";

const FINISH_LIMIT = 20;
const FINISH_WINDOW_SEC = 600;

/**
 * Mark onboarding done (plan 2026-09-15 §3.1 / §3.4, wave 2 B7).
 *
 * ONE BRANCH: {v:2, otto_answers, skip?}. Every identity fact is already saved
 * by /api/me/onboarding-step, so this checks the ROW, not the body: verified,
 * a real name, a real handle, and (unless `skip`) a campus in the student's
 * system. It also starts the handle cooldown, which onboarding claims
 * deliberately left unset (§3.3).
 *
 * THE LEGACY BRANCH IS GONE (S67 security wave B, B4; report Low "onboarding
 * reset"). A body without `v` used to take the pre-wave-3 path, which saved
 * ANY object as `otto_answers`, `{}` included, plus the whole profile with no
 * word filter. An empty `otto_answers` reads as "not onboarded", and while a
 * student is not onboarded the campus pick skips the 45-day lock and a handle
 * claim skips the 14-day cooldown (and clears its clock): so one call reset
 * both, as often as wanted. Every client has sent `v: 2` since 2026-09-17
 * (OnboardingMobile.tsx, public/html/onboarding.html, which /onboarding and
 * /onboarding/classic serve); the branch was scheduled for deletion (§5.5 step
 * 7). A body without `v: 2` now gets 400 `update_required` ("Refresh the page
 * to finish setting up."), which only an 11-day-old open tab could meet.
 * `ottoAnswersForFinish` never returns an empty object, so v:2 can't empty
 * `otto_answers` either. The lib exports the old branch used
 * (`legacyCampusPatch`, `sanitizeOnboardingProfile`) stay: tests import them.
 *
 * Refuses (403 `terms_required`) until the user has accepted the Terms, and
 * (403 `account_restricted`) while a suspension or ban is in force:
 * `requireNotRestricted` sends exactly `requireTermsAccepted`'s Terms 403 and
 * adds the restriction check from the database (the proxy's app_metadata
 * mirror already refuses a restricted session; this is the database truth).
 * The /onboarding server page already redirects users without consent to
 * /auth/terms, but the API must hold the line on its own. Writes go through
 * the service client: `otto_answers` is no longer in the authenticated UPDATE
 * grant (20260906110000), so this route is the only way to mark Otto done and
 * its consent check cannot be skipped via PostgREST. `handle_changed_at` and
 * the campus columns have no UPDATE grant at all.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body && typeof body === "object" && (body.v === 2 || body.v === "2")) {
    return finishV2(user.id, body);
  }
  return NextResponse.json(
    { ok: false, code: "update_required", error: "Refresh the page to finish setting up." },
    { status: 400 },
  );
}

function rateLimited(result: RateLimitResult) {
  return NextResponse.json(
    { ok: false, code: "rate_limited", error: "Too many tries. Wait a few minutes and try again." },
    { status: 429, headers: { "retry-after": String(Math.max(1, result.retryAfterSec)) } },
  );
}

/**
 * v:2 — Finish and Skip (plan §3.4). The rules live in `finishDecision`; this
 * does the read, the write, and the mapping to status codes.
 *
 * Nothing here trusts the body beyond `otto_answers` and `skip`: name, handle
 * and campus come from the row the step route wrote, so a client that skipped
 * a screen can't claim it filled one in.
 */
async function finishV2(userId: string, body: Body) {
  const rl = await rateLimit(`onboarding-finish:${userId}`, {
    limit: FINISH_LIMIT,
    windowSec: FINISH_WINDOW_SEC,
  });
  if (!rl.allowed) return rateLimited(rl);

  const skip = body.skip === true;

  const service = createSupabaseServiceClient();
  const { data, error: readErr } = await service
    .from("users")
    .select(FINISH_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (readErr) {
    // Migration M1 not applied yet (plan §5.5): the campus rule can't be
    // checked, so refuse rather than mark onboarding done without it.
    if (isMissingColumnError(readErr)) {
      return NextResponse.json(
        { ok: false, code: "campus_not_ready", error: "Campus setup isn't available yet. Try again soon." },
        { status: 503 },
      );
    }
    console.error("[onboarding-complete v2 read]", readErr);
    return NextResponse.json(
      { ok: false, code: "request_failed", error: "Request failed" },
      { status: 500 },
    );
  }

  const row = (data ?? null) as FinishUserRow | null;
  const decision = finishDecision({ row, skip });
  if (!decision.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: decision.code,
        error: decision.error,
        ...(decision.field ? { field: decision.field } : {}),
      },
      { status: decision.status },
    );
  }

  const otto = ottoAnswersForFinish(body.otto_answers, skip);
  if (!otto) {
    return NextResponse.json(
      { ok: false, code: "otto_answers_required", error: "Couldn't finish setting up.", field: "otto_answers" },
      { status: 400 },
    );
  }

  // The handle cooldown starts at Finish (§3.3), and only for a row whose
  // clock is still unset: a replay or a retry must not re-arm a cooldown the
  // student is already inside.
  const { error: upErr } = await service
    .from("users")
    .update({
      otto_answers: otto,
      ...(decision.stampHandleChangedAt ? { handle_changed_at: new Date().toISOString() } : {}),
    })
    .eq("id", userId);
  if (upErr) {
    console.error("[onboarding-complete v2 write]", upErr);
    return NextResponse.json(
      { ok: false, code: "request_failed", error: "Request failed" },
      { status: 500 },
    );
  }

  // A sign-up a club link let in (the club's view, wave 1) goes to its club:
  // a setup link's owner to the setup list, a members' link to "Join it?".
  const clubNext = await clubLinkNextAfterOnboarding(
    service,
    userId,
    async () => (await requireCanPublish(userId)) === null,
  );

  return NextResponse.json({ ok: true, next: clubNext ?? ONBOARDING_NEXT_PATH });
}
