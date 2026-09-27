import { campusRowById, isSchoolSystem } from "@/lib/iu/campuses";
import { CAMPUS_CHANGE_COOLDOWN_DAYS } from "@/lib/profile/onboarding-prefill";

/**
 * Pure state for `CampusConfirmBanner` (wave plan B14t), kept out of the
 * component so node tests can load it (no React, no "server-only").
 *
 * The banner nudges a verified student whose campus was never CHOSEN
 * (`campus_confirmed` false: a silent backfill, or no campus at all) to
 * confirm or pick one. It reads `GET /api/me/onboarding-state`.
 */

/** sessionStorage key "Not now" sets; the banner stays hidden for the tab's session. */
export const CAMPUS_CONFIRM_DISMISSED_KEY = "vibe_campus_confirm_dismissed";

/**
 * Said under the confirm callout (critic W3 L5): "Yes" stamps
 * `campus_set_at`, which starts the 45-day campus lock for an onboarded
 * student (30 until S67). The same sentence as B15's
 * `CAMPUS_CONFIRM_LOCK_COPY` in `src/lib/profile/settings-campus-card.ts`,
 * built from the same day count; the test compares the two.
 */
export const CAMPUS_CONFIRM_LOCK_NOTE = `Confirming locks your campus for ${CAMPUS_CHANGE_COOLDOWN_DAYS} days.`;

/** The onboarding-state fields the banner reads. Values are untrusted JSON. */
export type CampusConfirmState = {
  school_verified?: unknown;
  school_system?: unknown;
  campus_id?: unknown;
  campus_confirmed?: unknown;
};

export type CampusConfirmBannerView =
  | {
      mode: "confirm";
      /** Canonical campus id, sent back as `{campus_id}` by "Yes". */
      campusId: string;
      title: string;
      body: string;
      note: string;
    }
  | {
      mode: "pick";
      title: string;
      body: string;
    };

/**
 * What the banner shows, or null for nothing: a failed load (pass null),
 * an unverified student, no university, an already-confirmed valid campus,
 * or a "Not now" this session.
 *
 * A `campus_id` the static table doesn't know is treated as no campus: the
 * student gets "Pick your campus", never "Is null still right?".
 */
export function campusConfirmBannerView(
  state: CampusConfirmState | null | undefined,
  dismissed: boolean,
): CampusConfirmBannerView | null {
  if (!state || dismissed) return null;
  if (state.school_verified !== true) return null;
  if (!isSchoolSystem(state.school_system)) return null;

  const row = campusRowById(typeof state.campus_id === "string" ? state.campus_id : null);
  const hasCampus = row !== null && row.systems.includes(state.school_system);
  // `campus_confirmed` hides the banner only when there IS a valid campus to
  // be confirmed. A student who switched universities keeps `campus_set_at`
  // while re-verifying clears a campus the new school doesn't share, so
  // confirmed-with-no-campus still gets "Pick your campus" (matches B15's
  // Settings card, which checks for a missing campus first).
  if (hasCampus && state.campus_confirmed === true) return null;
  if (hasCampus) {
    return {
      mode: "confirm",
      campusId: row.id,
      title: "Confirm your campus",
      body: `Is ${row.shortName} still right?`,
      note: CAMPUS_CONFIRM_LOCK_NOTE,
    };
  }
  return {
    mode: "pick",
    title: "Pick your campus",
    body: "Your campus decides the clubs, events and map you see.",
  };
}
