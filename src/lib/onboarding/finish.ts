/**
 * Finish / Skip rules for `POST /api/me/onboarding-complete` with `{v:2}`
 * (plan 2026-09-15 §3.1 "Finish", §3.4 "Finish / Skip", question 3 option B).
 *
 * Pure: the route does the service-role read and the write; everything that
 * decides whether onboarding may be marked done lives here so it can be tested
 * without a database.
 *
 * WHAT v:2 ENFORCES, against the row and not the body — every identity fact is
 * already saved by `POST /api/me/onboarding-step`, so a client can't talk its
 * way past a step it skipped:
 *   - the school email is verified;
 *   - a real name (not the `handle_new_user` email-prefix fallback);
 *   - a real handle (not the `u<32 hex>` placeholder);
 *   - a campus in the student's system — required at Finish, OPTIONAL on Skip.
 *
 * Skip (Franky, question 3, option B) still requires the identity: skipping
 * otherwise leaves the auto handle and the email-prefix name, which is exactly
 * the 5 stranded accounts polluting suggestions today.
 *
 * Bodies WITHOUT `v` keep the legacy behaviour in the route for one release
 * (§5.5 step 4): the phone and desktop bundles deployed today send no version.
 */

import {
  allowedCampusId,
  campusIdFromLegacyLabel,
  isCampusAllowed,
  isSchoolSystem,
  legacyLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import {
  ONBOARDING_STEP_ERROR_COPY,
  isTriggerDefaultHandle,
  isTriggerDefaultName,
} from "@/lib/profile/onboarding-prefill";

/**
 * Where both branches send the student after onboarding (plan §3.4).
 *
 * The bundles deployed today append their own `welcome=1` to whatever `next`
 * says, giving `/campus?welcome=1&welcome=1`. That is a valid URL and
 * `campus-home.tsx` reads the param with `get()`, which returns the first
 * value (critic D8). The legacy `?otto=1` suffix is dropped: nothing reads it.
 */
export const ONBOARDING_NEXT_PATH = "/campus?welcome=1";

/** Where an unverified caller is sent instead (unchanged from today). */
export const SCHOOL_EMAIL_PATH = "/auth/school-email";

export type FinishErrorCode =
  | "profile_not_found"
  | "school_unverified"
  | "name_required"
  | "handle_required"
  | "campus_required"
  | "campus_invalid"
  | "otto_answers_required";

/**
 * Student-facing copy. The shared codes reuse the step route's table so a
 * client shows the same sentence wherever the rule bites (plan §3.5).
 */
export const FINISH_ERROR_COPY: Readonly<Record<FinishErrorCode, string>> = Object.freeze({
  profile_not_found: "Profile not found",
  school_unverified: "Verify your school email first.",
  name_required: ONBOARDING_STEP_ERROR_COPY.name_required,
  handle_required: ONBOARDING_STEP_ERROR_COPY.handle_required,
  campus_required: "Pick your campus to continue.",
  campus_invalid: ONBOARDING_STEP_ERROR_COPY.campus_invalid,
  otto_answers_required: "Couldn't finish setting up.",
});

/** The `public.users` columns {@link finishDecision} reads. */
export type FinishRow = {
  school_verified?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  name?: unknown;
  handle?: unknown;
  email?: unknown;
  handle_changed_at?: unknown;
};

export type FinishInput = {
  row: FinishRow | null | undefined;
  /** `{skip:true}`: the campus is optional, the identity is not (question 3). */
  skip: boolean;
};

export type FinishDecision =
  | {
      ok: true;
      /**
       * Start the 14-day handle cooldown now (plan §3.3): onboarding claims
       * leave `handle_changed_at` null so Back-and-edit is free, and Finish is
       * where the clock starts. Only ever stamps a row whose clock is unset, so
       * a replay or a retry can't re-arm a cooldown the student is already in.
       */
      stampHandleChangedAt: boolean;
    }
  | {
      ok: false;
      status: number;
      code: FinishErrorCode;
      field?: "name" | "handle" | "campus_id" | "otto_answers";
      error: string;
    };

function fail(
  status: number,
  code: FinishErrorCode,
  field?: "name" | "handle" | "campus_id" | "otto_answers",
): FinishDecision {
  return field
    ? { ok: false, status, code, field, error: FINISH_ERROR_COPY[code] }
    : { ok: false, status, code, error: FINISH_ERROR_COPY[code] };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * May this row be marked onboarded? Pure (see the file header for the rules).
 *
 * A campus outside the student's system is `campus_invalid` rather than
 * `campus_required`: the row holds something, it just isn't theirs to keep, so
 * the client sends them back to the campus screen with the right sentence.
 */
export function finishDecision(input: FinishInput): FinishDecision {
  const row = input.row;
  if (!row) return fail(404, "profile_not_found");
  if (row.school_verified !== true) return fail(403, "school_unverified");

  const name = text(row.name);
  if (!name || isTriggerDefaultName(name, row.email)) return fail(400, "name_required", "name");

  const handle = text(row.handle);
  if (!handle || isTriggerDefaultHandle(handle)) return fail(400, "handle_required", "handle");

  const system: SchoolSystem | null = isSchoolSystem(row.school_system) ? row.school_system : null;
  const campusId = text(row.campus_id);
  if (!input.skip) {
    if (!campusId) return fail(400, "campus_required", "campus_id");
    if (!isCampusAllowed(campusId, system)) return fail(400, "campus_invalid", "campus_id");
  }

  return { ok: true, stampHandleChangedAt: text(row.handle_changed_at) === "" };
}

/** What {@link legacyCampusPatch} needs from the row it may fill in. */
export type LegacyCampusRow = {
  school_system?: unknown;
  campus_id?: unknown;
};

/** Campus columns to merge OVER a legacy finish's sanitized profile patch. */
export type LegacyCampusColumns = { campus_id?: string; school?: string };

/**
 * The campus columns a LEGACY finish should write, given the label its body
 * carried and the row as it stands. Merged over the sanitized patch, so it can
 * add `campus_id` and correct the `school` that came with it.
 *
 * WHY THIS EXISTS. Both bundles deployed today send the campus as a label in
 * `profile.school` (`OnboardingMobile.tsx:331`, `onboarding.html:847`), and
 * `sanitizeOnboardingProfile` writes only that column. From the wave-2 push
 * until wave 3 replaces those bundles — days, per §5.5 — every student who
 * finished onboarding would land with a label and `campus_id` null, while
 * every campus read has just moved to `campus_id`: no clubs, no events, no
 * map, an empty campus lane. §5.5 step 4 says a wave-2 write writes BOTH
 * columns, and this is that rule applied to the one writer that only had the
 * label. Invisible to the client: the request, the response and every status
 * code stay exactly as they are.
 *
 * THE RULES, each one there to make the write unable to hurt:
 * - No label in this save → {}. A finish that sends no campus changes none.
 * - The row already HAS a campus → keep it, and rewrite `school` to that
 *   campus's label so the pair can't disagree. The old picker's silent
 *   Indianapolis default must never move a student who actually chose a campus
 *   (through the step route), and leaving the label behind would just relocate
 *   the same lie into every display-only reader left until M3 (critic C1).
 * - Otherwise the label must resolve to a campus in the student's OWN system.
 *   This is what keeps the write safe: `users_campus_in_system` raises on a
 *   campus outside the system — and on ANY campus when `school_system` is
 *   null, since `null = any(systems)` is null — which would turn a 200 finish
 *   into a 500. A campus that fails the check is simply not written.
 *
 * `campus_set_at` is deliberately never stamped: today's picker preselects
 * Indianapolis (`OnboardingMobile.tsx:179`), so this is a silent default,
 * exactly like the rows M1 backfilled (§2.7). Leaving the marker null is what
 * earns the student the one-time "Confirm your campus" card, and keeps their
 * first real pick free of the 30-day rule.
 */
export function legacyCampusPatch(
  label: unknown,
  row: LegacyCampusRow | null | undefined,
): LegacyCampusColumns {
  if (typeof label !== "string" || !label.trim()) return {};
  const system = isSchoolSystem(row?.school_system) ? row.school_system : null;

  const current = allowedCampusId(row?.campus_id, system);
  if (current) {
    const keep = legacyLabel(current, system);
    return keep ? { school: keep } : {};
  }
  // A campus_id the student may not keep (only reachable by bypassing the DB
  // trigger) is treated as unset, so the label still gets its chance.
  if (text(row?.campus_id)) return {};

  const campusId = allowedCampusId(campusIdFromLegacyLabel(label), system);
  if (!campusId) return {};
  return { campus_id: campusId, school: legacyLabel(campusId, system) };
}

/**
 * The `otto_answers` value a v:2 finish writes, or null when the body can't
 * mark onboarding done (→ 400 `otto_answers_required`).
 *
 * Any non-empty object is taken as-is: `isOttoOnboardingComplete` only asks
 * that the jsonb has at least one key, and Otto owns the shape. A SKIP with no
 * answers (a student who never reached a question) still has to leave a
 * non-empty value, or every app page would send them back here forever — it
 * gets the explicit `{skipped:true}` marker instead of a made-up Otto config.
 */
export function ottoAnswersForFinish(
  raw: unknown,
  skip: boolean,
): Record<string, unknown> | null {
  const isObject = !!raw && typeof raw === "object" && !Array.isArray(raw);
  if (isObject && Object.keys(raw as Record<string, unknown>).length > 0) {
    return raw as Record<string, unknown>;
  }
  if (skip && (raw === undefined || raw === null || isObject)) return { skipped: true };
  return null;
}
