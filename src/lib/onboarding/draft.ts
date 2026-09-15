/**
 * Onboarding draft: layer L1 of "save as they go"
 * (handoffs/2026-09-15-indy-campus-onboarding-plan.md §3.3).
 *
 * Every input on the onboarding screens, plus the current `step` and the
 * furthest step reached (`maxStep`), is kept in localStorage so a refresh, an
 * app switch, a rotation, or iOS reloading the tab after "Take Photo" loses
 * nothing. Layer L2 (the real columns, written by POST /api/me/onboarding-step
 * and the photo / join / follow routes) covers a device change; this layer
 * never talks to the server.
 *
 * RESTORE ORDER (§3.3): the server prefill is the base, this draft overrides
 * the TYPED fields, and the server wins for saved facts (claimed handle,
 * avatar, memberships, follows). {@link onboardingStartStep} picks the step to
 * open on.
 *
 * STORAGE CONTRACT, shared with the desktop page (public/html/onboarding.html
 * mirrors it in plain JS: same origin, same key, same schema; change both
 * together):
 *   key    `vibe_onb_draft_v1:<userId>`
 *   value  JSON `{ v: 1, step, maxStep, fields, at }`, where `at` is the save
 *          time in epoch milliseconds
 *   TTL    14 days from `at`; an expired or unreadable draft is removed when
 *          it is loaded
 *
 * Client-safe: no React, no server-only imports. Every storage touch is in
 * try/catch, because the accessor itself throws in some contexts (blocked site
 * data, sandboxed previews, quota errors) and onboarding must work with no
 * draft at all. Replay (`?replay=1`) must neither load nor save a draft; that
 * check lives in the callers.
 *
 * CLEARING: call {@link clearDraft} after a 2xx from onboarding-complete
 * (Finish or Skip) and on sign-out. A clear also drops any write a
 * {@link createDraftSaver} still has queued, so a debounce timer can't bring
 * the draft back a moment after Finish.
 */

export const ONBOARDING_DRAFT_VERSION = 1;
export const ONBOARDING_DRAFT_KEY_PREFIX = "vibe_onb_draft_v1:";
export const ONBOARDING_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Debounce for {@link createDraftSaver} (plan §3.3). */
export const ONBOARDING_DRAFT_SAVE_DELAY_MS = 300;

/** The six screens (plan §3.1), 1-based, in order. */
export const ONBOARDING_STEPS = Object.freeze({
  hello: 1,
  campus: 2,
  profile: 3,
  photo: 4,
  clubs: 5,
  people: 6,
} as const);
export const ONBOARDING_TOTAL_STEPS = 6;

/** A draft stamped further in the future than this is treated as corrupt (it would never expire). */
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_FIELDS = 64;
const MAX_STRING = 8000;
const MAX_LIST = 100;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** What one draft field may hold: text inputs, numbers, checkboxes, tag lists. */
export type OnboardingDraftValue = string | number | boolean | null | string[];
export type OnboardingDraftFields = Record<string, OnboardingDraftValue>;

export type OnboardingDraft = {
  v: typeof ONBOARDING_DRAFT_VERSION;
  /** The step the student is on (1-based). */
  step: number;
  /** The furthest step reached; always >= `step`. */
  maxStep: number;
  fields: OnboardingDraftFields;
  /** Save time, epoch milliseconds. */
  at: number;
};

/** What callers hand to {@link saveDraft}; `v` and `at` are stamped here. */
export type OnboardingDraftInput = Pick<OnboardingDraft, "step" | "maxStep" | "fields">;

/** The slice of the Web Storage API this module uses (injectable for tests). */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key"> & {
  readonly length: number;
};

export type DraftOptions = {
  /** Defaults to `globalThis.localStorage`; `null` means "no storage". */
  storage?: DraftStorage | null;
  /** Clock in epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
};

/**
 * Bumped by every {@link clearDraft}. A saver remembers the value when a write
 * is queued and drops the write if a clear happened since.
 */
let clearEpoch = 0;

function resolveStorage(opts?: DraftOptions): DraftStorage | null {
  if (opts && opts.storage !== undefined) return opts.storage;
  try {
    return (globalThis as { localStorage?: DraftStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function nowOf(opts?: DraftOptions): number {
  return opts?.now ? opts.now() : Date.now();
}

function removeQuietly(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

/** The storage key for a user's draft, or null for a missing / blank id. */
export function onboardingDraftKey(userId: unknown): string | null {
  if (typeof userId !== "string") return null;
  const id = userId.trim();
  if (!id || id.length > 200) return null;
  return `${ONBOARDING_DRAFT_KEY_PREFIX}${id}`;
}

function toStep(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= ONBOARDING_TOTAL_STEPS
    ? value
    : null;
}

/**
 * Keep only JSON-safe values of the allowed shapes. Unknown value types are
 * dropped, not fatal; a non-object `fields` is. Strings and lists are capped
 * so a runaway input can't fill the storage quota.
 */
function sanitizeFields(raw: unknown): OnboardingDraftFields | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: OnboardingDraftFields = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_FIELDS) break;
    if (UNSAFE_KEYS.has(key)) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, MAX_STRING);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      out[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value
        .filter((item): item is string => typeof item === "string")
        .slice(0, MAX_LIST)
        .map((item) => item.slice(0, MAX_STRING));
    } else {
      continue;
    }
    count++;
  }
  return out;
}

function readDraft(raw: string, now: number): OnboardingDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== ONBOARDING_DRAFT_VERSION) return null;
  const at = o.at;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (now - at >= ONBOARDING_DRAFT_TTL_MS || at - now > FUTURE_SKEW_MS) return null;
  const step = toStep(o.step);
  if (step === null) return null;
  const fields = sanitizeFields(o.fields);
  if (fields === null) return null;
  return {
    v: ONBOARDING_DRAFT_VERSION,
    step,
    maxStep: Math.max(step, toStep(o.maxStep) ?? step),
    fields,
    at,
  };
}

/**
 * The user's draft, or null when there is none, it expired (14 days), it is
 * unreadable, or storage is unavailable. Expired and unreadable drafts are
 * removed. Never throws.
 */
export function loadDraft(userId: string, opts?: DraftOptions): OnboardingDraft | null {
  const key = onboardingDraftKey(userId);
  if (!key) return null;
  const storage = resolveStorage(opts);
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null || raw === undefined) return null;
  const draft = readDraft(raw, nowOf(opts));
  if (!draft) removeQuietly(storage, key);
  return draft;
}

/**
 * Write the user's draft, stamping `v` and `at`. Returns false (never throws)
 * when the id or step is invalid, `fields` isn't an object, or storage refuses
 * the write (unavailable, quota).
 */
export function saveDraft(userId: string, draft: OnboardingDraftInput, opts?: DraftOptions): boolean {
  const key = onboardingDraftKey(userId);
  if (!key || !draft || typeof draft !== "object") return false;
  const step = toStep(draft.step);
  if (step === null) return false;
  const fields = sanitizeFields(draft.fields);
  if (fields === null) return false;
  const storage = resolveStorage(opts);
  if (!storage) return false;
  const record: OnboardingDraft = {
    v: ONBOARDING_DRAFT_VERSION,
    step,
    maxStep: Math.max(step, toStep(draft.maxStep) ?? step),
    fields,
    at: nowOf(opts),
  };
  try {
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a user's draft; with no id (sign-out without a loaded profile),
 * remove every onboarding draft on this origin. Also cancels writes any
 * {@link createDraftSaver} has queued. Never throws.
 */
export function clearDraft(userId?: string | null, opts?: DraftOptions): void {
  clearEpoch++;
  const storage = resolveStorage(opts);
  if (!storage) return;
  if (userId !== undefined && userId !== null) {
    const key = onboardingDraftKey(userId);
    if (key) removeQuietly(storage, key);
    return;
  }
  const keys: string[] = [];
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && key.startsWith(ONBOARDING_DRAFT_KEY_PREFIX)) keys.push(key);
    }
  } catch {
    /* enumeration failed: remove what we found */
  }
  for (const key of keys) removeQuietly(storage, key);
}

export type DraftSaver = {
  /** Queue `draft`, replacing anything queued; written after the debounce delay of quiet. */
  schedule(draft: OnboardingDraftInput): void;
  /** Write the queued draft now. True when a draft was written. */
  flush(): boolean;
  /** Drop the queued draft without writing it. */
  cancel(): void;
  /** True while a draft is queued. */
  hasPending(): boolean;
};

/**
 * A debounced writer for one user's draft (300 ms by default). Call
 * `schedule` on every input change, and `flush` before leaving the page (see
 * {@link flushDraftOnHide}). A {@link clearDraft} after `schedule` discards the
 * queued write.
 */
export function createDraftSaver(
  userId: string,
  opts: DraftOptions & { delayMs?: number } = {},
): DraftSaver {
  const delayMs =
    typeof opts.delayMs === "number" && Number.isFinite(opts.delayMs) && opts.delayMs >= 0
      ? opts.delayMs
      : ONBOARDING_DRAFT_SAVE_DELAY_MS;
  let queued: OnboardingDraftInput | null = null;
  let queuedEpoch = clearEpoch;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = (): boolean => {
    stopTimer();
    const draft = queued;
    queued = null;
    if (!draft || queuedEpoch !== clearEpoch) return false;
    return saveDraft(userId, draft, opts);
  };

  return {
    schedule(draft) {
      queued = draft;
      queuedEpoch = clearEpoch;
      stopTimer();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      stopTimer();
      queued = null;
    },
    hasPending() {
      return queued !== null;
    },
  };
}

/**
 * Flush on `visibilitychange` → hidden and on `pagehide` (iOS doesn't
 * reliably fire `beforeunload`). Returns an unsubscribe function; a no-op
 * outside the browser.
 */
export function flushDraftOnHide(saver: Pick<DraftSaver, "flush">): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "hidden") saver.flush();
  };
  const onPageHide = () => {
    saver.flush();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

/**
 * The step to open on (plan §3.3): the draft's step (never past its
 * `maxStep`) when there is a draft; otherwise the photo step when a campus
 * and a real handle are already saved, the profile step when only a campus
 * is, and the hello step for a fresh start.
 *
 * A campus counts as saved only when it is CONFIRMED (`campus_set_at` set,
 * `buildOnboardingPrefill().campusConfirmed`): a backfilled `campus_id` was a
 * silent default (plan §2.7), so that student still sees the campus screen.
 */
export function onboardingStartStep(
  draft: Pick<OnboardingDraft, "step" | "maxStep"> | null | undefined,
  saved: { campusId?: string | null; campusConfirmed?: boolean; hasRealHandle?: boolean },
): number {
  if (draft) return Math.min(draft.step, draft.maxStep);
  const campusSaved = Boolean(saved.campusId) && saved.campusConfirmed === true;
  if (campusSaved && saved.hasRealHandle) return ONBOARDING_STEPS.photo;
  if (campusSaved) return ONBOARDING_STEPS.profile;
  return ONBOARDING_STEPS.hello;
}
