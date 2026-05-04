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

function parseResumeUrlStrict(val: unknown): string | null | "omit" {
  if (val === undefined || val === null) return "omit";
  if (typeof val !== "string") return null;
  const t = val.trim();
  if (!t) return "omit";
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

/** Maps Otto "quick profile" JSON from onboarding.html into `public.users` columns. */
export function sanitizeOnboardingProfile(
  input: unknown,
): SanitizedOnboardingProfile | null {
  if (input === undefined) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const o = input as OnboardingProfileInput;
  const out: SanitizedOnboardingProfile = {};

  if (typeof o.name === "string") {
    const t = o.name.trim().slice(0, 120);
    if (t) out.name = t;
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
    const r = parseResumeUrlStrict(o.resume_url);
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
