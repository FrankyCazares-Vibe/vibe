import type { CurrentOnItem } from "@/lib/profile/current-on";
import type { ResumeDocRow } from "@/lib/profile/resume-docs";
import type { RedactionBar } from "@/lib/profile/resume-redactions";
import type { WorkExperienceRow } from "@/lib/profile/work-experience";

/** Subset of `public.users` passed to the profile UI and API responses. */
export type ProfileView = {
  id: string;
  email: string;
  name: string;
  handle: string;
  school: string;
  school_email: string | null;
  school_verified: boolean;
  year: number | null;
  major: string;
  department: string;
  bio: string;
  tagline: string;
  website: string;
  headline: string;
  location_text: string;
  banner_gradient: string;
  avatar_url: string | null;
  banner_url: string | null;
  resume_url: string | null;
  /** Multi-doc array. Empty means "fall back to resume_url" for
   *  backwards compat. See lib/profile/resume-docs.ts. */
  resume_docs: ResumeDocRow[];
  interests: string[];
  skills: string[];
  looking_for: string[];
  work_experience: WorkExperienceRow[];
  /** When true, preserve the stored array order of work_experience instead of
   *  auto-sorting by parsed end date. Flipped by drag/up-down reorder editors. */
  work_order_manual: boolean;
  recruiter_snapshot: Record<string, string>;
  current_on: CurrentOnItem[];
  resume_redactions: RedactionBar[];
};
