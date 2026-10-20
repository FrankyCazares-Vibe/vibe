/**
 * A new club's setup list (the club's view, wave 1; the R2_Setup board, "Get
 * <club> ready."), pure: what is done, from the club's own data and the two
 * marks its officers leave. Shared by the setup page, the club page's
 * "Finish setting up" line and the tests, so: no imports, erasable
 * TypeScript only.
 *
 * Only a club a setup link made has a setup list in wave 1 (the marks live
 * on that link, `club_links.setup_marks`). A club that set itself up gets
 * one with "Start a club on your own" (week 3).
 */

export const SETUP_STEP_IDS = [
  "photo",
  "about",
  "who_can_join",
  "officers",
  "first_event",
  "members_link",
] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** The marks officers can leave: the two steps the club's data can't show. */
export const SETUP_MARKS = ["who_can_join", "officers_skipped"] as const;
export type SetupMark = (typeof SETUP_MARKS)[number];

export function isSetupMark(value: unknown): value is SetupMark {
  return typeof value === "string" && (SETUP_MARKS as readonly string[]).includes(value);
}

export type SetupFacts = {
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  /** Officers other than the owner. */
  officerCount: number;
  /** Events the club has made, any time. */
  eventCount: number;
  hasMembersLink: boolean;
  /** `club_links.setup_marks`: { "<mark>": "<when>" }. */
  marks: Record<string, unknown>;
};

export type SetupStep = { id: SetupStepId; done: boolean };

export type SetupProgress = {
  steps: SetupStep[];
  done: number;
  total: number;
  complete: boolean;
};

function marked(marks: Record<string, unknown>, mark: SetupMark): boolean {
  return typeof marks[mark] === "string" && marks[mark] !== "";
}

export function setupProgress(f: SetupFacts): SetupProgress {
  const doneBy: Record<SetupStepId, boolean> = {
    photo: !!f.logoUrl && !!f.bannerUrl,
    about: !!f.description && f.description.trim().length > 0,
    who_can_join: marked(f.marks, "who_can_join"),
    officers: f.officerCount > 0 || marked(f.marks, "officers_skipped"),
    first_event: f.eventCount > 0,
    members_link: f.hasMembersLink,
  };
  const steps = SETUP_STEP_IDS.map((id) => ({ id, done: doneBy[id] }));
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
