import {
  allowedCampusId,
  campusIdFromLegacyLabel,
  campusRowById,
  normalizeCampusLabel,
  type SchoolSystem,
} from "@/lib/iu/campuses";
import { HANDLE_FORMAT_RE, validateHandle } from "@/lib/profile/handle";
import { normalizeResumeRef } from "@/lib/profile/resume-doc-url";
import { sanitizeWorkExperience, type WorkExperienceRow } from "@/lib/profile/work-experience";

const LOOKING_FOR = [
  "meeting-people",
  "showing-work",
  "finding-clubs",
  "exploring",
] as const;

type LookingFor = (typeof LOOKING_FOR)[number];

function isLookingFor(s: string): s is LookingFor {
  return (LOOKING_FOR as readonly string[]).includes(s);
}

export type OnboardingProfileInput = {
  name?: unknown;
  /** Self-declared IU campus — a campus id or its canonical label. */
  school?: unknown;
  campus?: unknown;
  major?: unknown;
  department?: unknown;
  year?: unknown;
  bio?: unknown;
  interests?: unknown;
  skills?: unknown;
  resume_url?: unknown;
  looking_for?: unknown;
  work_experience?: unknown;
};

/** Values safe to pass to `public.users` update (incl. jsonb). */
export type SanitizedOnboardingProfile = Record<
  string,
  string | number | null | string[] | WorkExperienceRow[]
>;

/** Onboarding uploads through /api/me/profile-upload (kind=resume), which
 *  returns a `/api/resume/<key>` proxy path; pasted links are external
 *  http(s) URLs. With `ownerId` both go through normalizeResumeRef so an
 *  own-bucket ref must carry the caller's owner prefix. */
function parseResumeUrlStrict(val: unknown, ownerId?: string): string | null | "omit" {
  if (val === undefined || val === null) return "omit";
  if (typeof val !== "string") return null;
  const t = val.trim();
  if (!t) return "omit";
  if (ownerId) return normalizeResumeRef(t, ownerId);
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return t.slice(0, 2048);
  } catch {
    return null;
  }
}

function sanitizeStringArrayField(
  val: unknown,
  maxItems: number,
  maxEach: number,
): string[] | null {
  if (!Array.isArray(val)) return null;
  const out: string[] = [];
  for (const item of val) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, maxEach);
    if (t) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Maps Otto "quick profile" JSON from onboarding.html into `public.users`
 *  columns. `ownerId` (the signed-in user's id) scopes `resume_url`. */
export function sanitizeOnboardingProfile(
  input: unknown,
  ownerId?: string,
): SanitizedOnboardingProfile | null {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const o = input as OnboardingProfileInput;
  const out: SanitizedOnboardingProfile = {};

  if (typeof o.name === "string") {
    const t = o.name.trim().slice(0, 120);
    if (t) out.name = t;
  }

  // Self-declared campus. Accepted under `school` (the column name) or
  // `campus` (what the pickers call it). An id or a label both work; an
  // explicit empty value clears the field; anything else is invalid, which
  // matches this sanitizer's convention of returning null so the caller
  // 400s the whole request.
  if ("school" in o || "campus" in o) {
    const raw = o.school !== undefined ? o.school : o.campus;
    if (raw === undefined) {
      /* key present but undefined (never from JSON) — treat as absent */
    } else if (raw === null || (typeof raw === "string" && !raw.trim())) {
      out.school = "";
    } else {
      const label = normalizeCampusLabel(raw);
      if (label === null) return null;
      out.school = label;
    }
  }

  if (typeof o.major === "string") {
    const t = o.major.trim().slice(0, 200);
    if (t) out.major = t;
  }

  if (typeof o.department === "string") {
    const t = o.department.trim().slice(0, 200);
    if (t) out.department = t;
  }

  if ("year" in o) {
    if (o.year === null || o.year === "") {
      out.year = null;
    } else if (typeof o.year === "number" && Number.isInteger(o.year)) {
      if (o.year < 1 || o.year > 12) return null;
      out.year = o.year;
    } else if (typeof o.year === "string" && o.year.trim()) {
      const n = parseInt(o.year, 10);
      if (!Number.isInteger(n) || n < 1 || n > 12) return null;
      out.year = n;
    }
  }

  if (typeof o.bio === "string") {
    const t = o.bio.trim().slice(0, 4000);
    if (t) out.bio = t;
  }

  if (o.interests !== undefined && o.interests !== null) {
    const arr = sanitizeStringArrayField(o.interests, 40, 80);
    if (arr === null) return null;
    if (arr.length > 0) out.interests = arr;
  }

  if (o.skills !== undefined && o.skills !== null) {
    const arr = sanitizeStringArrayField(o.skills, 60, 80);
    if (arr === null) return null;
    if (arr.length > 0) out.skills = arr;
  }

  if ("resume_url" in o && o.resume_url !== undefined && o.resume_url !== null) {
    const r = parseResumeUrlStrict(o.resume_url, ownerId);
    if (r === null) return null;
    if (r !== "omit") out.resume_url = r;
  }

  if (o.looking_for !== undefined) {
    if (!Array.isArray(o.looking_for)) return null;
    const tags = new Set<string>();
    for (const item of o.looking_for) {
      if (typeof item === "string" && isLookingFor(item.trim())) {
        tags.add(item.trim());
      }
    }
    if (tags.size > 0) {
      out.looking_for = [...tags];
    }
  }

  if ("work_experience" in o && o.work_experience !== undefined && o.work_experience !== null) {
    const wx = sanitizeWorkExperience(o.work_experience);
    if (wx.length > 0) {
      out.work_experience = wx;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// ONBOARDING STEPS (plan §3.3–3.4, contract C3): POST /api/me/onboarding-step
// ─────────────────────────────────────────────────────────────────────────
//
// `sanitizeOnboardingProfile` above keeps its exact behaviour for
// /api/me/onboarding-complete until wave 2. Everything below is new and only
// used by the per-step route and the onboarding page's prefill.

/** Every error code the step validators can return (C3). */
export type OnboardingStepErrorCode =
  | "name_required"
  | "handle_required"
  | "handle_invalid"
  | "handle_reserved"
  | "campus_invalid"
  | "profile_invalid";

/**
 * Server copy for step errors (plan §3.5). `handle_taken` comes from the
 * claim, not the validator, but shares this table so the route and clients
 * agree.
 */
export const ONBOARDING_STEP_ERROR_COPY: Readonly<
  Record<OnboardingStepErrorCode | "handle_taken", string>
> = Object.freeze({
  name_required: "Add your name. It's how people recognize you.",
  handle_required: "Pick a handle so friends can find you.",
  handle_invalid: "3–20 letters, numbers or _.",
  handle_reserved: "That handle is reserved.",
  handle_taken: "That handle is taken. Try another.",
  campus_invalid: "Pick one of your university's campuses.",
  profile_invalid: "Some of those details couldn't be saved. Check them and try again.",
});

/** Body fields of `{ step: "profile" }`, in form order (errors report the first bad one). */
export type ProfileStepField =
  | "name"
  | "handle"
  | "bio"
  | "major"
  | "department"
  | "year"
  | "interests"
  | "skills"
  | "looking_for";

/**
 * Columns the profile step writes AFTER the handle is claimed. `name` is
 * always present. Other keys appear only when the body carried them, and an
 * explicit empty value clears the column (unlike `sanitizeOnboardingProfile`,
 * which drops empties): Back-and-edit must be able to erase a saved bio.
 * Never `handle` (claimed separately), `school` / campus (the campus step),
 * or `otto_answers` (only onboarding-complete marks onboarding done, §3.1).
 */
export type ProfileStepPatch = {
  name: string;
  bio?: string;
  major?: string;
  department?: string;
  year?: number | null;
  interests?: string[];
  skills?: string[];
  looking_for?: string[];
};

export type ProfileStepResult =
  | { ok: true; value: { handle: string; patch: ProfileStepPatch } }
  | {
      ok: false;
      code: Exclude<OnboardingStepErrorCode, "campus_invalid">;
      field?: ProfileStepField;
      error: string;
    };

export type CampusStepResult =
  | { ok: true; value: { campusId: string } }
  | { ok: false; code: "campus_invalid"; field: "campus_id"; error: string };

function profileStepFail(
  code: Exclude<OnboardingStepErrorCode, "campus_invalid">,
  field?: ProfileStepField,
): ProfileStepResult {
  return field
    ? { ok: false, code, field, error: ONBOARDING_STEP_ERROR_COPY[code] }
    : { ok: false, code, error: ONBOARDING_STEP_ERROR_COPY[code] };
}

/**
 * Validate the body of `{ step: "profile" }` (C3): name and handle are
 * required, then bio, major, department, year, interests, skills and
 * looking_for are optional. Pure: no DB. The handle comes back normalized
 * (trimmed, lowercased) for `changeHandleForUser(uid, handle, { onboarding:
 * true })`; whether it is TAKEN is only known at the claim (409
 * `handle_taken`). Unknown body keys (`step`, `school`, `otto_answers`, …)
 * are ignored.
 */
export function sanitizeProfileStep(input: unknown): ProfileStepResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return profileStepFail("profile_invalid");
  }
  const o = input as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  if (!name) return profileStepFail("name_required", "name");

  const rawHandle = typeof o.handle === "string" ? o.handle.trim().toLowerCase() : "";
  if (!rawHandle) return profileStepFail("handle_required", "handle");
  // Same rules as validateHandle, split by cause: HANDLE_FORMAT_RE covers the
  // 3–20 length and the character set, so once it passes the only remaining
  // validateHandle failure is the reserved list.
  if (!HANDLE_FORMAT_RE.test(rawHandle)) return profileStepFail("handle_invalid", "handle");
  const handle = validateHandle(rawHandle);
  if (!handle.ok) return profileStepFail("handle_reserved", "handle");

  const patch: ProfileStepPatch = { name };

  for (const [field, max] of [
    ["bio", 4000],
    ["major", 200],
    ["department", 200],
  ] as const) {
    if (!(field in o) || o[field] === undefined) continue;
    const val = o[field];
    if (val === null) patch[field] = "";
    else if (typeof val === "string") patch[field] = val.trim().slice(0, max);
    else return profileStepFail("profile_invalid", field);
  }

  if ("year" in o && o.year !== undefined) {
    const val = o.year;
    if (val === null || val === "") {
      patch.year = null;
    } else {
      const n =
        typeof val === "number"
          ? val
          : typeof val === "string" && /^\s*\d{1,2}\s*$/.test(val)
            ? parseInt(val, 10)
            : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 12) return profileStepFail("profile_invalid", "year");
      patch.year = n;
    }
  }

  for (const [field, maxItems] of [
    ["interests", 40],
    ["skills", 60],
  ] as const) {
    if (!(field in o) || o[field] === undefined) continue;
    const val = o[field];
    if (val === null) {
      patch[field] = [];
      continue;
    }
    const arr = sanitizeStringArrayField(val, maxItems, 80);
    if (arr === null) return profileStepFail("profile_invalid", field);
    patch[field] = arr;
  }

  if ("looking_for" in o && o.looking_for !== undefined) {
    const val = o.looking_for;
    if (val === null) {
      patch.looking_for = [];
    } else if (!Array.isArray(val)) {
      return profileStepFail("profile_invalid", "looking_for");
    } else {
      const tags = new Set<string>();
      for (const item of val) {
        if (typeof item === "string" && isLookingFor(item.trim())) tags.add(item.trim());
      }
      patch.looking_for = [...tags];
    }
  }

  return { ok: true, value: { handle: handle.handle, patch } };
}

/**
 * Validate the body of `{ step: "campus", campus_id }` (C3) against the
 * student's verified system: the campus must be in that system's allowed set
 * (plan §2.4). `campus_id` may be a campus id or, from a pre-migration
 * client, a legacy `school` label or id ("IU Indianapolis", "bloomington").
 * The returned id is canonical; write it, never the raw input. A null system
 * allows nothing.
 */
export function sanitizeCampusStep(
  input: unknown,
  system: SchoolSystem | null | undefined,
): CampusStepResult {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).campus_id
      : undefined;
  const campusId =
    typeof raw === "string"
      ? (allowedCampusId(raw, system) ?? allowedCampusId(campusIdFromLegacyLabel(raw), system))
      : null;
  if (!campusId) {
    return {
      ok: false,
      code: "campus_invalid",
      field: "campus_id",
      error: ONBOARDING_STEP_ERROR_COPY.campus_invalid,
    };
  }
  return { ok: true, value: { campusId } };
}

/** Settled 09-12 §3 (plan §2.4): a home campus changes at most once per 30 days. */
export const CAMPUS_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type CampusChangeInput = {
  /** `users.campus_id` now (null / "" = no campus, e.g. cleared by a system change). */
  currentId: string | null | undefined;
  /** `users.campus_set_at` now: the 30-day clock. Null = never chosen. */
  setAt: string | null | undefined;
  /** The validated, canonical campus id being saved. */
  nextId: string;
  /** `isOttoOnboardingComplete(otto_answers)`. */
  onboarded: boolean;
  /** Epoch ms; defaults to `Date.now()`. */
  now?: number;
};

export type CampusChangeDecision =
  /** Same campus, already stamped: write nothing and don't re-arm the clock. */
  | { kind: "noop" }
  /** Write `campus_id` and stamp `campus_set_at` now. */
  | { kind: "write" }
  /** 429 `campus_change_too_soon`, with `availableAt` (ISO). */
  | { kind: "too_soon"; availableAt: string };

/**
 * The 30-day home-campus rule for a campus-step save (plan §2.4). Pure.
 *
 * The clock is `campus_set_at`, NOT the current campus. A null stamp is a
 * first pick (or the confirmation of a backfilled campus) and is free; a
 * student still in onboarding is never blocked. A student who has finished
 * onboarding and holds a stamp waits out 30 days before saving a DIFFERENT
 * campus, including when `campus_id` is null because a system change cleared
 * it: the stamp survives a system change (critic B3, Franky's answer to
 * question 1), so bouncing between @iu.edu and @purdue.edu can't skip the
 * clock. Saving the campus already on the row with a stamp is a no-op.
 */
export function campusChangeDecision(input: CampusChangeInput): CampusChangeDecision {
  const currentId =
    typeof input.currentId === "string" && input.currentId.trim() ? input.currentId.trim() : null;
  const setAt = typeof input.setAt === "string" && input.setAt.trim() ? input.setAt.trim() : null;

  if (setAt && currentId === input.nextId) return { kind: "noop" };

  if (setAt && currentId !== input.nextId && input.onboarded) {
    const availableAtMs = Date.parse(setAt) + CAMPUS_CHANGE_COOLDOWN_MS;
    const now = input.now ?? Date.now();
    if (Number.isFinite(availableAtMs) && availableAtMs > now) {
      return { kind: "too_soon", availableAt: new Date(availableAtMs).toISOString() };
    }
  }

  return { kind: "write" };
}

/** The placeholder handle `handle_new_user` gives every account: 'u' || uuid without dashes. */
export const TRIGGER_DEFAULT_HANDLE_RE = /^u[0-9a-f]{32}$/;

/** True for the trigger's `u<32 hex>` placeholder handle (never a claimed one). */
export function isTriggerDefaultHandle(handle: unknown): boolean {
  return typeof handle === "string" && TRIGGER_DEFAULT_HANDLE_RE.test(handle.trim());
}

/**
 * True when `name` is the trigger's fallback: `split_part(email, '@', 1)`,
 * the text before the first "@" (the whole address when there is none).
 * Exact match after trimming, since that is what the trigger writes; a name
 * the student typed differently is theirs.
 */
export function isTriggerDefaultName(name: unknown, email: unknown): boolean {
  if (typeof name !== "string" || typeof email !== "string") return false;
  const n = name.trim();
  const e = email.trim();
  if (!n || !e) return false;
  const at = e.indexOf("@");
  return n === (at === -1 ? e : e.slice(0, at));
}

/**
 * `public.users` columns {@link buildOnboardingPrefill} reads. The campus
 * columns are deliberately absent until migration M1 is applied; the page
 * appends {@link ONBOARDING_PREFILL_CAMPUS_COLUMNS} then (wave 2, B7). Until
 * then the campus comes from the legacy `school` label, unconfirmed.
 */
export const ONBOARDING_PREFILL_COLUMNS =
  "email,name,handle,bio,major,department,year,interests,skills,looking_for,avatar_url,school";

/** The M1 campus columns the prefill reads once they exist (plan §5.1). */
export const ONBOARDING_PREFILL_CAMPUS_COLUMNS = "campus_id,campus_set_at";

export type OnboardingPrefillRow = {
  email?: unknown;
  name?: unknown;
  handle?: unknown;
  bio?: unknown;
  major?: unknown;
  department?: unknown;
  year?: unknown;
  interests?: unknown;
  skills?: unknown;
  looking_for?: unknown;
  /** Absent (undefined) before M1; then the legacy `school` label is used. */
  campus_id?: unknown;
  campus_set_at?: unknown;
  /** Legacy label ("IU Indianapolis"), read only when `campus_id` is absent. */
  school?: unknown;
  avatar_url?: unknown;
};

/** What the onboarding screens start from (plan §3.3 restore order: the base layer). */
export type OnboardingPrefill = {
  /** "" when the stored name is the trigger's email-prefix fallback. */
  name: string;
  /** "" when the stored handle is the trigger's `u<hex>` placeholder. */
  handle: string;
  bio: string;
  major: string;
  department: string;
  year: number | null;
  interests: string[];
  skills: string[];
  looking_for: string[];
  /**
   * A known campus id, else null. From `campus_id` when the row carries that
   * column (even as null), else mapped from the legacy `school` label. Not
   * checked against the system here.
   */
  campusId: string | null;
  /**
   * `campus_set_at` is set: the student chose or confirmed a campus. False
   * for backfilled rows (`campus_id` set silently, plan §2.7) and for a
   * campus mapped from the legacy label, so those still see the campus
   * screen. Same meaning as the bootstrap's `campusConfirmed` (B6).
   */
  campusConfirmed: boolean;
  avatarUrl: string | null;
  /** A claimed handle is on the row (drives the start step, §3.3). */
  hasRealHandle: boolean;
};

function prefillText(val: unknown, max: number): string {
  return typeof val === "string" ? val.trim().slice(0, max) : "";
}

/**
 * Build the onboarding prefill from a `public.users` row, blanking the
 * `handle_new_user` trigger defaults (plan §3.4 step 3): a name equal to the
 * email's local part and a `u<32 hex>` handle. Pure; a missing row gives an
 * all-blank prefill.
 */
export function buildOnboardingPrefill(row: OnboardingPrefillRow | null | undefined): OnboardingPrefill {
  const r = row ?? {};
  const rawName = prefillText(r.name, 120);
  const rawHandle = prefillText(r.handle, 64);
  const hasRealHandle = rawHandle !== "" && !isTriggerDefaultHandle(rawHandle);
  const year =
    typeof r.year === "number" && Number.isInteger(r.year) && r.year >= 1 && r.year <= 12
      ? r.year
      : null;
  const lookingFor = Array.isArray(r.looking_for)
    ? [
        ...new Set(
          r.looking_for
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter(isLookingFor),
        ),
      ]
    : [];
  const avatar = prefillText(r.avatar_url, 2048);
  const campusId =
    r.campus_id !== undefined
      ? typeof r.campus_id === "string"
        ? (campusRowById(r.campus_id)?.id ?? null)
        : null
      : typeof r.school === "string"
        ? campusIdFromLegacyLabel(r.school)
        : null;
  const campusConfirmed = typeof r.campus_set_at === "string" && r.campus_set_at.trim() !== "";
  return {
    name: isTriggerDefaultName(rawName, r.email) ? "" : rawName,
    handle: hasRealHandle ? rawHandle : "",
    bio: prefillText(r.bio, 4000),
    major: prefillText(r.major, 200),
    department: prefillText(r.department, 200),
    year,
    interests: sanitizeStringArrayField(r.interests, 40, 80) ?? [],
    skills: sanitizeStringArrayField(r.skills, 60, 80) ?? [],
    looking_for: lookingFor,
    campusId,
    campusConfirmed,
    avatarUrl: avatar || null,
    hasRealHandle,
  };
}
