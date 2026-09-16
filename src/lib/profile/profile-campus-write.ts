/**
 * Campus writes and campus read-outs for the profile routes (plan wave 2 B6,
 * §2.4 / §2.5 / §5.5, critic A4 + C1). Pure: no DB, no Next imports, so the
 * decision is unit-tested (`profile-campus-write.test.ts`).
 *
 * WHO CALLS THIS
 * - PATCH /api/me/profile and POST /api/me/profile-sync decide a campus write
 *   with {@link decideProfileCampusWrite}, from a SERVICE-role read of the
 *   caller's own row ({@link PROFILE_CAMPUS_READ_COLUMNS}).
 * - GET /api/me/profile-bootstrap reads {@link ownCampusFields}.
 * - build-vibe-user-v1 renders the badge with {@link campusBadgeForProfile}.
 *
 * TWO BODY SHAPES (critic A4: deployed phone and desktop bundles keep the old
 * shape for days after wave 2 ships)
 * - NEW: `campus_id`. An explicit choice. Full rules: allowed set, then the
 *   30-day rule (`campusChangeDecision`). Re-sending the current campus
 *   before it was ever stamped is the "Confirm your campus" tap, so it stamps
 *   `campus_set_at`.
 * - LEGACY: `school` (or `campus`), a label or legacy id. Old bundles send it
 *   on EVERY save once they know a campus, and "" after a "Not set" pick. So a
 *   label naming the campus already on the row, and "" / null, are NO-OPS:
 *   no write, no 400, no 429, no `campus_set_at` change. Only a label naming a
 *   DIFFERENT campus is an explicit change and goes through the rules.
 * If both keys are present, `campus_id` wins and the label is ignored (the
 * server derives the label itself).
 *
 * A campus rejection never fails the rest of a profile patch: the route
 * applies the other fields first and reports the campus result separately.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import {
  allowedCampusId,
  campusBadgeFor,
  campusIdFromLegacyLabel,
  campusRowById,
  isCampusAllowed,
  isSchoolSystem,
  legacyLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import {
  CAMPUS_CHANGE_COOLDOWN_MS,
  ONBOARDING_STEP_ERROR_COPY,
  campusChangeDecision,
} from "@/lib/profile/onboarding-prefill";

/**
 * Service-role columns the write decision needs. `campus_set_at` and
 * `otto_answers` have no `authenticated` SELECT grant, so this read must use
 * the service client, scoped to the caller's id.
 */
export const PROFILE_CAMPUS_READ_COLUMNS =
  "school,school_verified,school_system,campus_id,campus_set_at,otto_answers";

/** The M1 campus columns a bootstrap select adds (plan §5.1). */
export const PROFILE_CAMPUS_COLUMNS = "school_system,campus_id,campus_set_at";

/** The M1 columns another person's profile may carry (never `campus_set_at`). */
export const PUBLIC_PROFILE_CAMPUS_COLUMNS = "school_system,campus_id";

export const CAMPUS_WRITE_COPY = Object.freeze({
  campus_not_in_system: "That campus isn't part of your university.",
  campus_invalid: ONBOARDING_STEP_ERROR_COPY.campus_invalid,
  school_unverified: "Verify your school email first.",
  system_missing: "We couldn't match your school email to a university yet. Try again later.",
  campus_not_ready: "Campus setup isn't available yet. Try again soon.",
  campus_save_failed: "Couldn't save your campus. Try again.",
});

export type CampusWriteRejectCode =
  | "campus_invalid"
  | "campus_not_in_system"
  | "campus_change_too_soon"
  | "school_unverified"
  | "system_missing"
  | "campus_not_ready"
  | "campus_save_failed";

export type CampusWriteRejection = {
  status: 400 | 403 | 429 | 503;
  code: CampusWriteRejectCode;
  error: string;
  /** Only for `campus_change_too_soon` (ISO). */
  availableAt?: string;
};

/** The service-read row (every field optional: a missing column is `undefined`). */
export type CampusWriteRow = {
  school?: unknown;
  school_verified?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  campus_set_at?: unknown;
};

/** What the body asked for. */
export type CampusIntent =
  | { kind: "absent" }
  | { kind: "explicit"; raw: unknown }
  | { kind: "legacy"; raw: unknown };

/** Which campus shape a profile body carries (see the header). */
export function readCampusIntent(body: Record<string, unknown> | null | undefined): CampusIntent {
  if (!body || typeof body !== "object") return { kind: "absent" };
  if ("campus_id" in body && body.campus_id !== undefined) {
    return { kind: "explicit", raw: body.campus_id };
  }
  if ("school" in body && body.school !== undefined) return { kind: "legacy", raw: body.school };
  if ("campus" in body && body.campus !== undefined) return { kind: "legacy", raw: body.campus };
  return { kind: "absent" };
}

export type CampusWriteDecision =
  /** The body carried no campus. */
  | { kind: "absent" }
  /** A campus key that changes nothing (legacy "" / current label, or the same stamped campus). */
  | { kind: "noop" }
  /**
   * Write these columns with the service role, scoped to the caller.
   * `campus_set_at` is ABSENT on a repair write (an old bundle echoing the
   * label already on the row into a null `campus_id`): that fills the column
   * in without arming the 30-day clock or marking the campus confirmed.
   */
  | {
      kind: "write";
      patch: { campus_id: string; school: string; campus_set_at?: string };
    }
  | { kind: "reject"; rejection: CampusWriteRejection };

export type CampusWriteInput = {
  body: Record<string, unknown> | null | undefined;
  /** Service-role read of {@link PROFILE_CAMPUS_READ_COLUMNS}; null when the row is missing. */
  row: CampusWriteRow | null | undefined;
  /** `isOttoOnboardingComplete(row.otto_answers)`. */
  onboarded: boolean;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
};

function reject(
  status: CampusWriteRejection["status"],
  code: Exclude<CampusWriteRejectCode, "campus_change_too_soon">,
): CampusWriteDecision {
  return { kind: "reject", rejection: { status, code, error: CAMPUS_WRITE_COPY[code] } };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * "You can change your campus again on October 15." The date is the campus's
 * local calendar day (Indiana). Falls back to a generic line for a bad date.
 */
export function campusChangeTooSoonCopy(availableAt: string): string {
  const ms = Date.parse(availableAt);
  if (!Number.isFinite(ms)) return "You changed your campus recently. Try again later.";
  const day = new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  });
  return `You can change your campus again on ${day}.`;
}

/**
 * Decide a profile route's campus write (see the header for the two shapes).
 *
 * Order:
 * 1. No campus key → absent.
 * 2. Legacy "" / null → noop. Legacy value that isn't a string, or names no
 *    campus ("iu.edu", "IU Online") → 400 `campus_invalid`. Legacy label for
 *    the campus already on the row → noop (whatever the stamp says).
 *    Explicit `campus_id` that names no campus (or isn't a string) → 400
 *    `campus_invalid`; a legacy label under `campus_id` is accepted, as the
 *    onboarding step does.
 * 3. A campus is being chosen. The M1 columns must be on the row (else 503
 *    `campus_not_ready`); the student must be verified (403
 *    `school_unverified`) with a system (503 `system_missing`); the campus must
 *    be in that system's allowed set (400 `campus_not_in_system`).
 * 4. The 30-day rule (`campusChangeDecision` on `campus_set_at`): noop for the
 *    same stamped campus, 429 `campus_change_too_soon` with `availableAt`, or
 *    write `campus_id` + `campus_set_at = now` + the dual-written label.
 *
 * REPAIR (step 3.5). A row can carry a system and its legacy label with a NULL
 * `campus_id`: a legacy finish before verification writes `school` while
 * `legacyCampusPatch` declines to stamp a campus it can't validate yet (no
 * system), and the later school-email verification stamps only the system. The
 * bootstrap answers such a row with its label, so a deployed bundle echoes that
 * label back on its next save. That echo is not a choice, so it must not stamp
 * `campus_set_at`: it fills `campus_id` in from the row's OWN label and leaves
 * the marker null, which keeps the one-time "Confirm your campus" card and
 * keeps the student's first real pick free of the 30-day rule.
 */
export function decideProfileCampusWrite(input: CampusWriteInput): CampusWriteDecision {
  const intent = readCampusIntent(input.body);
  if (intent.kind === "absent") return { kind: "absent" };

  const row = input.row ?? {};
  const currentId = campusRowById(textOrNull(row.campus_id))?.id ?? null;
  const labelId = campusIdFromLegacyLabel(textOrNull(row.school));

  /** See REPAIR above: fill in `campus_id`, never stamp. */
  let repairFromRowLabel = false;
  let nextId: string | null;
  if (intent.kind === "legacy") {
    const raw = intent.raw;
    if (raw === null || (typeof raw === "string" && !raw.trim())) return { kind: "noop" };
    if (typeof raw !== "string") return reject(400, "campus_invalid");
    nextId = campusIdFromLegacyLabel(raw);
    if (!nextId) return reject(400, "campus_invalid");
    // Old bundles re-send the campus they were given on every save.
    if (nextId === currentId) return { kind: "noop" };
    // Before M1's columns exist there is no current campus to compare with,
    // so the legacy label on the row stands in for it.
    if (row.campus_id === undefined && nextId === labelId) return { kind: "noop" };
    // M1 applied, no campus on the row, and the label sent is the row's own:
    // an echo of what the bootstrap said, not a pick.
    if (currentId === null && nextId === labelId) repairFromRowLabel = true;
  } else {
    const raw = intent.raw;
    nextId =
      typeof raw === "string" ? (campusRowById(raw)?.id ?? campusIdFromLegacyLabel(raw)) : null;
    if (!nextId) return reject(400, "campus_invalid");
  }

  if (row.school_system === undefined || row.campus_set_at === undefined) {
    return reject(503, "campus_not_ready");
  }
  const system: SchoolSystem | null = isSchoolSystem(row.school_system) ? row.school_system : null;
  if (!system) {
    return row.school_verified === true
      ? reject(503, "system_missing")
      : reject(403, "school_unverified");
  }
  if (!isCampusAllowed(nextId, system)) return reject(400, "campus_not_in_system");

  // A repair (see REPAIR above) writes the pair the row already implies and
  // leaves `campus_set_at` alone, so it can neither confirm a campus the
  // student never picked nor start their 30-day cooldown.
  if (repairFromRowLabel) {
    return { kind: "write", patch: { campus_id: nextId, school: legacyLabel(nextId, system) } };
  }

  const now = input.now ?? Date.now();
  const decision = campusChangeDecision({
    currentId,
    setAt: textOrNull(row.campus_set_at),
    nextId,
    onboarded: input.onboarded,
    now,
  });
  if (decision.kind === "noop") return { kind: "noop" };
  if (decision.kind === "too_soon") {
    return {
      kind: "reject",
      rejection: {
        status: 429,
        code: "campus_change_too_soon",
        error: campusChangeTooSoonCopy(decision.availableAt),
        availableAt: decision.availableAt,
      },
    };
  }
  return {
    kind: "write",
    patch: {
      campus_id: nextId,
      campus_set_at: new Date(now).toISOString(),
      school: legacyLabel(nextId, system),
    },
  };
}

export type CampusRowRead =
  | { ok: true; row: CampusWriteRow & { otto_answers?: unknown } }
  | { ok: false };

/**
 * Read the caller's own campus columns for a write decision. SERVICE ROLE,
 * scoped to `userId`: `campus_set_at` and `otto_answers` have no
 * `authenticated` SELECT grant.
 *
 * Deploy safety (plan §5.5): before migration M1 those columns don't exist,
 * so a missing-column error (and only that) retries with the legacy columns.
 * The row then carries `campus_id: undefined`, which
 * {@link decideProfileCampusWrite} reads as "campus not available": an old
 * bundle re-sending its current label is still a no-op, and a real change
 * answers `campus_not_ready` instead of writing.
 */
export async function readCampusWriteRow(
  service: SupabaseClient,
  userId: string,
): Promise<CampusRowRead> {
  const { data, error } = await service
    .from("users")
    .select(PROFILE_CAMPUS_READ_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (!error) {
    return data ? { ok: true, row: data as CampusWriteRow } : { ok: false };
  }
  if (!isMissingColumnError(error)) {
    console.error("[profile campus read]", error);
    return { ok: false };
  }
  const legacy = await service
    .from("users")
    .select("school,school_verified,otto_answers")
    .eq("id", userId)
    .maybeSingle();
  if (legacy.error || !legacy.data) {
    console.error("[profile campus read legacy]", legacy.error);
    return { ok: false };
  }
  return { ok: true, row: legacy.data as CampusWriteRow };
}

/**
 * The campus columns could not be read (a missing row, or a failed read):
 * never fail the rest of the patch over it, so the campus half answers
 * `campus_not_ready` the way an unapplied M1 does.
 */
export function campusReadUnavailable(): CampusWriteDecision {
  return reject(503, "campus_not_ready");
}

/**
 * The campus UPDATE itself failed. The M1 trigger (`campus_not_in_system`,
 * raised as check_violation 23514) or the `campuses` foreign key (23503) mean
 * the database disagrees with this code's campus list, which is the student's
 * pick being wrong, not a fault; a missing column means M1 isn't applied.
 * Anything else is a real failure, reported as a campus-only save failure so
 * the rest of the patch still stands.
 */
export function campusWriteFailed(
  error: { code?: string | null; message?: string | null } | null | undefined,
): CampusWriteDecision {
  if (isMissingColumnError(error)) return reject(503, "campus_not_ready");
  if (
    error?.code === "23514" ||
    error?.code === "23503" ||
    /campus_not_in_system/i.test(error?.message ?? "")
  ) {
    return reject(400, "campus_not_in_system");
  }
  return reject(503, "campus_save_failed");
}

/**
 * When the student may next change campus: `campus_set_at` + 30 days while
 * that is still in the future, else null (a change is allowed now, or the
 * campus was never chosen). Informational; the write path re-decides.
 */
export function campusChangeAvailableAt(setAt: unknown, now: number = Date.now()): string | null {
  const stamp = textOrNull(setAt);
  if (!stamp) return null;
  const ms = Date.parse(stamp) + CAMPUS_CHANGE_COOLDOWN_MS;
  return Number.isFinite(ms) && ms > now ? new Date(ms).toISOString() : null;
}

/** The campus fields a profile carries (absent = the column wasn't selected). */
export type ProfileCampusFields = {
  school?: string | null;
  school_verified?: boolean | null;
  school_system?: string | null;
  campus_id?: string | null;
};

/**
 * The system to READ a profile's campus in: its own when the column carries
 * one, else "iu" — the only university the legacy label model ever knew, which
 * is what a select without the M1 columns (and the pre-campus badge) assumed.
 */
function displaySystem(p: ProfileCampusFields): SchoolSystem {
  return isSchoolSystem(p.school_system) ? p.school_system : "iu";
}

/**
 * The campus a profile DISPLAYS as: `campus_id` when it names a campus in that
 * system, else the campus its legacy `school` label names — checked against the
 * same system, so a stale "IU Bloomington" on a Purdue row resolves to nothing
 * rather than to the other university's campus.
 *
 * The fallback fires on "no campus_id", NOT on "no system". A verified row can
 * hold a known system, a null `campus_id` and its legacy label all at once (a
 * legacy finish before verification leaves the label, `legacyCampusPatch`
 * declines to stamp a campus while the system is still null, and
 * school-email-apply later stamps only the system). Gating the fallback on the
 * system dropped that profile's badge from "IU Indianapolis" to "IU verified"
 * and blanked the campus picker in every deployed editor.
 *
 * Display only: `ownCampusFields().campusId` stays honest to the column,
 * because every campus SCOPE read keys off `campus_id`. The row heals on the
 * next save — an old bundle echoes this label back and
 * {@link decideProfileCampusWrite} fills the column in without stamping.
 */
function displayCampusId(p: ProfileCampusFields): string | null {
  const system = displaySystem(p);
  return (
    allowedCampusId(p.campus_id, system) ??
    allowedCampusId(campusIdFromLegacyLabel(p.school), system)
  );
}

/**
 * Profile badge (plan §2.5): `campusBadgeFor(campus_id, school_system)`, with
 * the legacy-label fallback of {@link displayCampusId} behind it (a select
 * without the M1 columns, a verified row the backfill missed, or a row whose
 * label outran its `campus_id`). Verified with no campus at all → "IU verified"
 * / "Purdue verified"; unverified → null (no badge).
 */
export function campusBadgeForProfile(p: ProfileCampusFields): string | null {
  if (p.school_verified !== true) return null;
  return campusBadgeFor(displayCampusId(p), displaySystem(p));
}

/**
 * The legacy top-level `campus` the deployed bundles read from the own
 * bootstrap: the dual-written label for the current campus ("IU
 * Indianapolis"), or null. Old clients send it back on the next save, where it
 * maps to the same campus and is a no-op (or, for a row whose `campus_id` is
 * still null, the repair write). Same legacy-label fallback as the badge.
 */
export function legacyCampusLabelForProfile(p: ProfileCampusFields): string | null {
  return legacyLabel(displayCampusId(p), displaySystem(p)) || null;
}

export type OwnCampusFields = {
  schoolSystem: SchoolSystem | null;
  campusId: string | null;
  campusBadge: string | null;
  campusChangeAvailableAt: string | null;
  campusConfirmed: boolean;
};

/**
 * The own bootstrap's campus fields (plan wave 2 B6). Never includes
 * `school_email`. `campusId` is only reported when the COLUMN holds a campus in
 * the student's allowed set (a row that bypassed the trigger reads as no
 * campus) — deliberately no legacy-label fallback, since every campus scope
 * read keys off `campus_id`, so a client asking "which campus am I in?" gets
 * the truth even while `campusBadge` still renders the older label.
 */
export function ownCampusFields(
  row: ProfileCampusFields & { campus_set_at?: string | null },
  now: number = Date.now(),
): OwnCampusFields {
  const schoolSystem = isSchoolSystem(row.school_system) ? row.school_system : null;
  return {
    schoolSystem,
    campusId: allowedCampusId(row.campus_id, schoolSystem),
    campusBadge: campusBadgeForProfile(row),
    campusChangeAvailableAt: campusChangeAvailableAt(row.campus_set_at, now),
    campusConfirmed: textOrNull(row.campus_set_at) !== null,
  };
}
