import { NextResponse } from "next/server";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import {
  ONBOARDING_NEXT_PATH,
  SCHOOL_EMAIL_PATH,
  finishDecision,
  legacyCampusPatch,
  ottoAnswersForFinish,
} from "@/lib/onboarding/finish";
import { sanitizeOnboardingProfile } from "@/lib/profile/onboarding-prefill";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = {
  /** `2` selects the rules below; ABSENT keeps the legacy branch (see docblock). */
  v?: unknown;
  otto_answers?: unknown;
  profile?: unknown;
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
 * TWO BRANCHES, ON PURPOSE, FOR ONE RELEASE (§5.5 step 4, critic A1/A4):
 *
 *   {v:2, otto_answers, skip?}  — the wave-3 clients. Every identity fact is
 *     already saved by /api/me/onboarding-step, so this checks the ROW, not
 *     the body: verified, a real name, a real handle, and (unless `skip`) a
 *     campus in the student's system. It also starts the handle cooldown,
 *     which onboarding claims deliberately left unset (§3.3).
 *
 *   no `v`  — the phone and desktop bundles deployed TODAY, which keep calling
 *     this route their old way for days after the push. Their behaviour is
 *     unchanged: same body (`otto_answers` + optional `profile`), same
 *     validation, same response. They save the profile here and claim the
 *     handle separately through /api/me/handle. The one addition is invisible
 *     to them — the campus label they already send is also written to
 *     `campus_id`, so finishing on an old bundle doesn't land a student
 *     campus-less now that campus reads key on that column (§5.5 step 4).
 *
 * The only shared change is `next`: both branches now send a verified student
 * to `/campus?welcome=1` instead of `/profile`. Today's bundles append their
 * own `welcome=1`, and `/campus?welcome=1&welcome=1` is read with `get()`
 * (critic D8). The legacy `?otto=1` suffix is dropped — nothing reads it.
 *
 * Refuses (403 `terms_required`) until the user has accepted the Terms — the
 * /onboarding server page already redirects such users to /auth/terms, but the
 * API must hold the line on its own. Writes go through the service client:
 * `otto_answers` is no longer in the authenticated UPDATE grant
 * (20260906110000), so this route is the only way to mark Otto done and its
 * consent check cannot be skipped via PostgREST. `handle_changed_at` and the
 * campus columns have no UPDATE grant at all.
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

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body && (body.v === 2 || body.v === "2")) {
    return finishV2(user.id, body);
  }
  return finishLegacy(user.id, body);
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

  return NextResponse.json({ ok: true, next: ONBOARDING_NEXT_PATH });
}

/** The legacy branch's read: `school_verified` plus what the campus fill needs. */
const LEGACY_COLUMNS = "school_verified,school_system,campus_id";
const LEGACY_BASE_COLUMNS = "school_verified";

/**
 * No `v` — the bundles deployed today (plan §5.5 step 4, critic A1).
 *
 * Byte-compatible with what those bundles expect: the same `otto_answers` +
 * optional `profile` body, validated in the same order with the same strings,
 * and the same `{ok:true, next}` response. They validate name and handle on
 * the client and claim the handle through /api/me/handle after this call, so
 * this branch deliberately enforces neither, and never starts the handle
 * cooldown.
 *
 * ONE THING IS NEW, AND THE CLIENT CANNOT SEE IT: the campus. Those bundles
 * send it as a label in `profile.school`, which `sanitizeOnboardingProfile`
 * writes to the legacy column alone — so after wave 2 moved every campus read
 * onto `campus_id`, finishing on an old bundle would leave the student
 * campus-less in a campus-shaped app. `legacyCampusPatch` fills `campus_id`
 * from that same label — and only when doing so is safe (see its docblock).
 * `campus_set_at` stays null: the old picker preselects Indianapolis, so this
 * is a silent default and the student still gets asked to confirm it.
 *
 * Delete it once wave 3 has been live for a release (§5.5 step 7).
 */
async function finishLegacy(userId: string, body: Body) {
  const otto_answers = body.otto_answers;
  if (
    !otto_answers ||
    typeof otto_answers !== "object" ||
    Array.isArray(otto_answers)
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid otto_answers" },
      { status: 400 },
    );
  }

  const profilePatch = sanitizeOnboardingProfile(body.profile, userId);
  if (profilePatch === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid profile" },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();

  // Read before the write (today's read came after it, and its only job was
  // `next`). A failure here is tolerated exactly as it was: no campus fill,
  // and an unverified `next`. The save itself still happens.
  let { data: readRow, error: readErr } = await service
    .from("users")
    .select(LEGACY_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (readErr && isMissingColumnError(readErr)) {
    // Migration M1 not applied yet (§5.5): there is no `campus_id` to fill,
    // which is the pre-wave-2 world this branch already behaved correctly in.
    ({ data: readRow, error: readErr } = await service
      .from("users")
      .select(LEGACY_BASE_COLUMNS)
      .eq("id", userId)
      .maybeSingle());
  }
  const row = (readRow ?? null) as FinishUserRow | null;

  const updateRow = {
    otto_answers,
    ...profilePatch,
    ...(readErr ? {} : legacyCampusPatch(profilePatch.school, row)),
  };

  const { error: upErr } = await service
    .from("users")
    .update(updateRow)
    .eq("id", userId);

  if (upErr) {
    console.error("[onboarding-complete]", upErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const schoolVerified = row?.school_verified === true;

  return NextResponse.json({
    ok: true,
    next: schoolVerified ? ONBOARDING_NEXT_PATH : SCHOOL_EMAIL_PATH,
  });
}
