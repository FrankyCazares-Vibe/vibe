import { sanitizeCurrentOn } from "@/lib/profile/current-on";
import { sanitizeResumeRedactions } from "@/lib/profile/resume-redactions";
import type { ProfileView } from "@/lib/profile/types";
import { sanitizeWorkExperience } from "@/lib/profile/work-experience";

function recruiterSnapshotFromRow(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

/** Coerce a DB row into ProfileView so the UI never calls .join on null/invalid fields. */
export function normalizeProfileView(row: Record<string, unknown>): ProfileView {
  const strArr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  };

  const yearRaw = row.year;
  const year =
    typeof yearRaw === "number" && Number.isInteger(yearRaw) ? yearRaw : null;

  return {
    id: String(row.id ?? ""),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    handle: String(row.handle ?? ""),
    school: String(row.school ?? ""),
    school_email:
      row.school_email != null && row.school_email !== ""
        ? String(row.school_email)
        : null,
    school_verified: row.school_verified === true,
    year,
    major: String(row.major ?? ""),
    department: String(row.department ?? ""),
    bio: String(row.bio ?? ""),
    tagline: String(row.tagline ?? ""),
    website: String(row.website ?? ""),
    headline: String(row.headline ?? ""),
    location_text: String(row.location_text ?? ""),
    banner_gradient: String(row.banner_gradient ?? ""),
    avatar_url:
      row.avatar_url != null && String(row.avatar_url).trim() !== ""
        ? String(row.avatar_url)
        : null,
    banner_url:
      row.banner_url != null && String(row.banner_url).trim() !== ""
        ? String(row.banner_url)
        : null,
    resume_url:
      row.resume_url != null && String(row.resume_url).trim() !== ""
        ? String(row.resume_url)
        : null,
    interests: strArr(row.interests),
    skills: strArr(row.skills),
    looking_for: strArr(row.looking_for),
    work_experience: sanitizeWorkExperience(row.work_experience),
    recruiter_snapshot: recruiterSnapshotFromRow(row.recruiter_snapshot),
    current_on: sanitizeCurrentOn(row.current_on),
    resume_redactions: sanitizeResumeRedactions(row.resume_redactions),
  };
}
