import { NextResponse } from "next/server";

import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { isSchoolSystem, legacyLabel } from "@/lib/iu/campuses";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { changeHandleForUser } from "@/lib/profile/handle-change";
import {
  ONBOARDING_STEP_ERROR_COPY,
  campusChangeDecision,
  sanitizeCampusStep,
  sanitizeProfileStep,
} from "@/lib/profile/onboarding-prefill";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

type StepUserRow = {
  school_verified?: boolean | null;
  otto_answers?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  campus_set_at?: unknown;
};

const STEP_LIMIT = 30;
const STEP_WINDOW_SEC = 600;

const BASE_COLUMNS = "school_verified,otto_answers";
/** The campus columns come from migration M1 (plan §5.1). */
const CAMPUS_COLUMNS = `${BASE_COLUMNS},school_system,campus_id,campus_set_at`;

function fail(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, code, error, ...extra }, { status });
}

function campusNotReady() {
  return fail(503, "campus_not_ready", "Campus setup isn't available yet. Try again soon.");
}

function rateLimited(result: RateLimitResult) {
  return NextResponse.json(
    { ok: false, code: "rate_limited", error: "Too many tries. Wait a few minutes and try again." },
    { status: 429, headers: { "retry-after": String(Math.max(1, result.retryAfterSec)) } },
  );
}

/**
 * Postgres (42703 "column users.campus_id does not exist") or PostgREST
 * (PGRST204 "Could not find the 'campus_id' column of 'users'") saying a
 * campus column isn't there: M1 isn't applied yet. Deliberately narrow: any
 * other missing column is a real fault and stays a 500.
 */
function isCampusSchemaMissing(error: { code?: string | null; message?: string | null }): boolean {
  return isMissingColumnError(error);
}

/**
 * Save one onboarding step as the student goes (plan §3.1 / §3.3, contract C3).
 *
 *   {step:"campus", campus_id}
 *   {step:"profile", name, handle, bio, major, department, year, interests, skills, looking_for}
 *   → 200 {ok:true} | {ok:false, code, field?, error}
 *
 * NOT CALLED BY ANY CLIENT YET. `users.school_system` / `campus_id` /
 * `campus_set_at` only exist once migration M1 is applied; until then the
 * campus step answers 503 `campus_not_ready` instead of a 500. A verified
 * user with no `school_system` after M1 is a data gap, not a pending
 * migration, and gets its own 503 `system_missing`. The profile step reads
 * no campus column and works either way.
 *
 * Order: 401 → rate limit (30 / 10 min per user; it also bounds handle
 * squatting, since onboarding claims skip the cooldown) → Terms → service-role
 * read of the caller's row → 403 `school_unverified` → validate (a body that
 * isn't a JSON object is 400 `invalid_json` here, after the 403) → write.
 *
 * Never writes `otto_answers`: only onboarding-complete marks onboarding done
 * (§3.1), so a refresh mid-flow never bounces the student out of onboarding.
 * Writes use the service role, scoped to the caller's id: the campus columns
 * have no UPDATE grant, and `handle` goes through changeHandleForUser.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return fail(401, "unauthorized", "Unauthorized");
  }

  const rl = await rateLimit(`onboarding-step:${user.id}`, {
    limit: STEP_LIMIT,
    windowSec: STEP_WINDOW_SEC,
  });
  if (!rl.allowed) return rateLimited(rl);

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  // Read the body now (it picks the columns to select), but only reject a bad
  // one after the verified check, in C3's order.
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = null;
  }

  const step = body && (body.step === "campus" || body.step === "profile") ? body.step : null;

  const service = createSupabaseServiceClient();
  const { data, error: readErr } = await service
    .from("users")
    .select(step === "campus" ? CAMPUS_COLUMNS : BASE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (readErr) {
    if (isCampusSchemaMissing(readErr)) return campusNotReady();
    console.error("[onboarding-step read]", readErr);
    return fail(500, "request_failed", "Request failed");
  }
  const row = data as StepUserRow | null;
  if (!row) {
    return fail(404, "profile_not_found", "Profile not found");
  }
  if (row.school_verified !== true) {
    return fail(403, "school_unverified", "Verify your school email first.");
  }
  if (!body) {
    return fail(400, "invalid_json", "Invalid JSON");
  }

  if (step === "campus") return saveCampusStep(service, user.id, row, body);
  if (step === "profile") return saveProfileStep(service, user.id, body);
  return fail(400, "step_invalid", "Unknown onboarding step.", { field: "step" });
}

/**
 * Campus rules (plan §2.4): the pick must be in the student's allowed set.
 * The 30-day rule keys on `campus_set_at`, not on the current campus (see
 * campusChangeDecision): a null stamp (first pick, backfill confirmation) and
 * any pick during onboarding are free; a student who has finished onboarding
 * and holds a stamp waits out 30 days to save a different campus, including
 * when a system change cleared `campus_id` but kept the stamp (critic B3).
 * Every write stamps `campus_set_at` (the chosen-and-confirmed marker and the
 * 30-day clock) and dual-writes the legacy `school` label for one release
 * (§5.5).
 */
async function saveCampusStep(
  service: ServiceClient,
  userId: string,
  row: StepUserRow,
  body: Record<string, unknown>,
) {
  const system = isSchoolSystem(row.school_system) ? row.school_system : null;
  if (!system) {
    // Verified but no system stamped: M1's backfill and school-email-apply
    // should make this unreachable, so it's a data gap, not the student's error.
    console.error("[onboarding-step campus] verified user without school_system");
    return fail(503, "system_missing", "We couldn't match your school email to a university yet. Try again later.");
  }

  const parsed = sanitizeCampusStep(body, system);
  if (!parsed.ok) {
    return fail(400, parsed.code, parsed.error, { field: parsed.field });
  }
  const campusId = parsed.value.campusId;

  const now = Date.now();
  const decision = campusChangeDecision({
    currentId: typeof row.campus_id === "string" ? row.campus_id : null,
    setAt: typeof row.campus_set_at === "string" ? row.campus_set_at : null,
    nextId: campusId,
    onboarded: isOttoOnboardingComplete(row.otto_answers),
    now,
  });
  // Same campus, already chosen: nothing to write, and the clock isn't re-armed.
  if (decision.kind === "noop") {
    return NextResponse.json({ ok: true });
  }
  if (decision.kind === "too_soon") {
    return fail(429, "campus_change_too_soon", "You changed your campus recently. Try again later.", {
      field: "campus_id",
      availableAt: decision.availableAt,
    });
  }

  const { error: upErr } = await service
    .from("users")
    .update({
      campus_id: campusId,
      campus_set_at: new Date(now).toISOString(),
      school: legacyLabel(campusId, system),
    })
    .eq("id", userId);
  if (upErr) {
    if (isCampusSchemaMissing(upErr)) return campusNotReady();
    // The DB trigger (campus_not_in_system, check_violation) or the campuses
    // FK disagreeing with the code's list: log it, and ask for another pick.
    if (
      upErr.code === "23514" ||
      upErr.code === "23503" ||
      /campus_not_in_system/i.test(upErr.message ?? "")
    ) {
      console.error("[onboarding-step campus write rejected]", upErr);
      return fail(400, "campus_invalid", ONBOARDING_STEP_ERROR_COPY.campus_invalid, {
        field: "campus_id",
      });
    }
    console.error("[onboarding-step campus write]", upErr);
    return fail(500, "request_failed", "Request failed");
  }

  return NextResponse.json({ ok: true });
}

/**
 * Profile step (plan §3.4 step 3): validate everything first, so a bad field
 * never leaves a half-saved step; then claim the handle (onboarding claims
 * skip the cooldown and leave `handle_changed_at` null until Finish); only
 * then write the other fields. A retry after a failed field write is safe:
 * re-claiming the same handle is a no-op.
 */
async function saveProfileStep(service: ServiceClient, userId: string, body: Record<string, unknown>) {
  const parsed = sanitizeProfileStep(body);
  if (!parsed.ok) {
    return fail(400, parsed.code, parsed.error, parsed.field ? { field: parsed.field } : {});
  }
  const { handle, patch } = parsed.value;

  const claim = await changeHandleForUser(userId, handle, { onboarding: true });
  if (!claim.ok) {
    if (claim.status === 409) {
      return fail(409, "handle_taken", ONBOARDING_STEP_ERROR_COPY.handle_taken, { field: "handle" });
    }
    if (claim.status === 400) {
      return fail(400, "handle_invalid", ONBOARDING_STEP_ERROR_COPY.handle_invalid, { field: "handle" });
    }
    if (claim.status === 429) {
      // Only reachable after onboarding is complete (the claim is free before).
      return fail(429, "handle_cooldown", claim.error, {
        field: "handle",
        ...(claim.cooldown_days_left !== undefined
          ? { cooldown_days_left: claim.cooldown_days_left }
          : {}),
      });
    }
    if (claim.status === 404) {
      return fail(404, "profile_not_found", "Profile not found");
    }
    return fail(500, "request_failed", "Request failed");
  }

  const { error: upErr } = await service.from("users").update(patch).eq("id", userId);
  if (upErr) {
    console.error("[onboarding-step profile write]", upErr);
    return fail(500, "request_failed", "Request failed");
  }

  return NextResponse.json({ ok: true });
}
