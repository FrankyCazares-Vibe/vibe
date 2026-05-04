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
  interests: string[];
  skills: string[];
  looking_for: string[];
  work_experience: WorkExperienceRow[];
  recruiter_snapshot: Record<string, string>;
};
