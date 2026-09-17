/**
 * The campus picker's rules and copy, shared by Settings (`CampusCard` in
 * src/components/settings/SettingsClient.tsx) and the phone profile editor
 * (plan wave 3 B15; PM reads the same view in wave 4). Pure: no React, no DB,
 * no server-only imports, so it is unit-tested
 * (`settings-campus-card.test.ts`) and safe in client bundles.
 *
 * WHAT THE CARD SHOWS
 * - unverified: no school email proved a university yet, so there is nothing
 *   to pick from. The card links to /auth/school-email.
 * - pick: verified, no campus yet. The select opens on "Pick your campus".
 * - confirm: a campus is on the row but was never chosen or confirmed
 *   (`campus_set_at` is null, e.g. a backfilled campus). "Yes" re-sends the
 *   same `campus_id`, which stamps `campus_set_at`.
 * - set: chosen and stamped.
 *
 * A pick in the select never changes the mode by itself: the mode comes from
 * the saved row. Once onboarding is done, any campus save starts the 30-day
 * rule, so a pick is only staged and the card asks first
 * ({@link campusPickStep}: "Switch to Fort Wayne?"). Before onboarding is
 * done the rule can't bite yet, so a pick saves straight away.
 *
 * The campus is chosen within the university the verified school email
 * proved (`campusesForSystem`). Indianapolis is ONE community for IU and
 * Purdue students, listed first for both.
 *
 * THE 30-DAY RULE mirrors the server (`campusChangeDecision` in
 * onboarding-prefill.ts): once onboarding is done, a stamped campus can't
 * change to a different one for 30 days. Writes before onboarding is done
 * are free, so `locked` needs `onboarded` and {@link nextAvailableAfterWrite}
 * returns null for them. The server is still the authority: a 429
 * `campus_change_too_soon` locks the card too ({@link campusSaveFailure}).
 */

import {
  allowedCampusId,
  campusPickerSub,
  campusRowById,
  campusesForSystem,
  isSchoolSystem,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { CAMPUS_CHANGE_COOLDOWN_MS } from "@/lib/profile/onboarding-prefill";
import { campusChangeTooSoonCopy } from "@/lib/profile/profile-campus-write";

export type SettingsCampusInput = {
  schoolVerified: boolean;
  schoolSystem: SchoolSystem | null;
  campusId: string | null;
  campusConfirmed: boolean;
  /** ISO. When the 30-day rule lets a DIFFERENT campus be saved again; null = no clock running. */
  campusChangeAvailableAt: string | null;
  /** `isOttoOnboardingComplete(otto_answers)`, computed on the server. */
  onboarded: boolean;
};

export type SettingsCampusView = {
  mode: "unverified" | "pick" | "confirm" | "set";
  /** One per campus in the student's university, in picker order. */
  options: Array<{ id: string; label: string }>;
  /** The select's value: an allowed campus id, or "" (shows "Pick your campus"). */
  value: string;
  /** The picked campus's short name ("Indianapolis"), for "Is {shortName} still right?". */
  shortName: string | null;
  /** Sub-line under the select for the picked campus. */
  sub: string | null;
  /** The 30-day rule is running: the select is disabled. */
  locked: boolean;
  /** "You can change your campus again on October 15." while locked. */
  note: string | null;
};

/**
 * The line under the "Confirm your campus" callout (critic W3 L5): "Yes"
 * stamps `campus_set_at`, which starts the 30-day rule. The phone
 * `CampusConfirmBanner` (B14t) carries the same sentence verbatim.
 */
export const CAMPUS_CONFIRM_LOCK_COPY = "Confirming locks your campus for 30 days.";

/**
 * The second line of the "Switch to {shortName}?" prompt a pick shows before
 * it saves, once onboarding is done (review of B15: a pick used to start the
 * 30-day rule with no warning).
 */
export const CAMPUS_SWITCH_LOCK_COPY = "You can't change your campus again for 30 days.";

/** Settings' one-line failure for a campus save (`vibeRequest` `failure`). */
export const CAMPUS_SAVE_FAILURE_COPY = "Couldn't save your campus. Try again.";

/** Label for a campus option: its short name, marked when it isn't open yet. */
export function campusOptionLabel(c: { shortName: string; isOpen: boolean }): string {
  return c.isOpen ? c.shortName : `${c.shortName} — not open yet`;
}

/**
 * The Settings campus card (and the phone profile picker) for one student.
 * `now` is epoch ms and defaults to `Date.now()`.
 */
export function settingsCampusCardView(
  i: SettingsCampusInput,
  now: number = Date.now(),
): SettingsCampusView {
  const system = i.schoolVerified && isSchoolSystem(i.schoolSystem) ? i.schoolSystem : null;
  if (!system) {
    return { mode: "unverified", options: [], value: "", shortName: null, sub: null, locked: false, note: null };
  }

  const options = campusesForSystem(system).map((c) => ({ id: c.id, label: campusOptionLabel(c) }));
  // Only a campus in this university's set can be the value: anything else
  // would leave the select showing an option the student never picked.
  const value = allowedCampusId(i.campusId, system) ?? "";
  const row = value ? campusRowById(value) : null;

  const mode: SettingsCampusView["mode"] = !row ? "pick" : !i.campusConfirmed ? "confirm" : "set";

  const availableMs =
    typeof i.campusChangeAvailableAt === "string" ? Date.parse(i.campusChangeAvailableAt) : NaN;
  const locked = i.onboarded && Number.isFinite(availableMs) && availableMs > now;

  return {
    mode,
    options,
    value: row ? row.id : "",
    shortName: row ? row.shortName : null,
    sub: row ? campusPickerSub(row, system) : null,
    locked,
    note: locked && i.campusChangeAvailableAt ? campusChangeTooSoonCopy(i.campusChangeAvailableAt) : null,
  };
}

/**
 * After a successful campus write: when the 30-day rule next lets the student
 * pick a different campus (ISO), or null when no clock started (still in
 * onboarding). `now` is epoch ms and defaults to `Date.now()`.
 */
export function nextAvailableAfterWrite(onboarded: boolean, now: number = Date.now()): string | null {
  return onboarded ? new Date(now + CAMPUS_CHANGE_COOLDOWN_MS).toISOString() : null;
}

/** What a change on the card's select does ({@link campusPickStep}). */
export type CampusPickStep =
  /** Nothing to do: no university to pick from, the rule is running, or not an offered campus. */
  | { kind: "ignore" }
  /** Picked the saved campus again: drop any staged pick. */
  | { kind: "unstage" }
  /** Save now: onboarding isn't done, so the 30-day rule can't bite yet. */
  | { kind: "save" }
  /** Stage the pick and ask first: saving starts the 30-day rule. */
  | { kind: "stage"; title: string; body: string };

/**
 * What picking `next` in the select does, given the card's SAVED view.
 * Once onboarding is done every campus save starts the 30-day rule
 * (`decideProfileCampusWrite` stamps `campus_set_at` on any explicit write),
 * so the pick is staged behind "Switch to {shortName}?" (or "Make
 * {shortName} your campus?" when there is no campus yet) with Yes / Cancel.
 * A closed campus says so on the prompt too, since the student would wait 30
 * days to leave it.
 */
export function campusPickStep(
  view: SettingsCampusView,
  onboarded: boolean,
  next: string,
): CampusPickStep {
  if (view.mode === "unverified" || view.locked) return { kind: "ignore" };
  if (next === view.value) return { kind: "unstage" };
  const row = view.options.some((o) => o.id === next) ? campusRowById(next) : null;
  if (!row) return { kind: "ignore" };
  if (!onboarded) return { kind: "save" };
  return {
    kind: "stage",
    title: view.mode === "pick" ? `Make ${row.shortName} your campus?` : `Switch to ${row.shortName}?`,
    body: row.isOpen ? CAMPUS_SWITCH_LOCK_COPY : `${row.shortName} isn't open yet. ${CAMPUS_SWITCH_LOCK_COPY}`,
  };
}

/** Campus rejection codes whose server `error` is already the student's line (CAMPUS_WRITE_COPY). */
const CAMPUS_REJECT_CODES = new Set([
  "campus_invalid",
  "campus_not_in_system",
  "campus_change_too_soon",
  "school_unverified",
  "system_missing",
  "campus_not_ready",
  "campus_save_failed",
]);

/**
 * What the card says after a refused campus save, from a quiet `vibeRequest`
 * failure. `campus_change_too_soon` carries the dated line in `error` (the
 * server builds it with `campusChangeTooSoonCopy`; `vibeRequest` drops
 * `availableAt`) and locks the card. Other campus codes show the server's own
 * copy. Anything else (signed out, Terms, network, 5xx) shows the mapped
 * `message`, never a raw token like "Unauthorized", plus its Sign in / Review
 * Terms `action` when it has one: the request is quiet, so no toast carries
 * that link, and /settings has no Terms gate of its own.
 */
export function campusSaveFailure(r: {
  code: string | null;
  error: string | null;
  message: string;
  action?: { label: string; href: string };
}): { text: string; locked: boolean; action?: { label: string; href: string } } {
  if (r.code === "campus_change_too_soon") {
    return { text: r.error?.trim() || campusChangeTooSoonCopy(""), locked: true };
  }
  if (r.code && CAMPUS_REJECT_CODES.has(r.code) && r.error?.trim()) {
    return { text: r.error.trim(), locked: false };
  }
  return r.action
    ? { text: r.message, locked: false, action: r.action }
    : { text: r.message, locked: false };
}
