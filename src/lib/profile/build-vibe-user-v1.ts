import type { ProfileView } from "@/lib/profile/types";
import { workExperienceForVibeHtml } from "@/lib/profile/work-experience";

const TAG_COLORS = ["coral", "purple", "sky", "gold", "mint", "lavender"] as const;

function taglineFromBio(bio: string): string {
  const t = bio.trim();
  if (!t) return "";
  const first = (t.split(/\n/)[0] ?? "").trim();
  if (first.length <= 220) return first;
  return `${first.slice(0, 217)}…`;
}

function headlineFromProfileParts(p: ProfileView): string {
  const parts: string[] = [];
  if (p.major) parts.push(p.major);
  if (p.department) parts.push(p.department);
  let h = parts.join(" · ");
  if (p.year != null) {
    h = h ? `${h} · Year ${p.year}` : `Year ${p.year}`;
  }
  if (!h && p.school) h = p.school;
  return h;
}

function schoolLabelForBadge(p: ProfileView): string {
  if (p.school?.trim()) return p.school.trim();
  if (p.school_email?.includes("@")) {
    return p.school_email.split("@")[1] ?? "Student";
  }
  return "Student";
}

const LOOKING_LABELS: Record<string, string> = {
  "meeting-people": "Meeting people",
  "showing-work": "Showing work",
  "finding-clubs": "Finding clubs",
  exploring: "Exploring",
};

function preferredFromLookingFor(tokens: string[]): string {
  return tokens
    .map((t) => LOOKING_LABELS[t] ?? t)
    .filter(Boolean)
    .join(" · ");
}

/**
 * Shape expected by `public/html/profile.html` (`vibe_user_v1` in localStorage).
 */
export function buildVibeUserV1FromProfile(
  profile: ProfileView,
  opts?: { appShell?: boolean },
): Record<string, unknown> {
  const vibeTags = profile.interests.map((label, i) => ({
    label,
    color: TAG_COLORS[i % TAG_COLORS.length],
  }));

  const tagline = profile.tagline.trim() || taglineFromBio(profile.bio);
  const headline =
    profile.headline.trim() || headlineFromProfileParts(profile);
  const location = profile.location_text.trim() || profile.school || "";

  const baseSnap: Record<string, string> = {
    role: profile.major || "",
    seniority: profile.year != null ? `Year ${profile.year}` : "",
    locationSnap: profile.school || "",
    availability: "",
    preferred: preferredFromLookingFor(profile.looking_for),
    topSkills: profile.skills.slice(0, 8).join(", "),
  };
  const snapshot = { ...baseSnap, ...profile.recruiter_snapshot };

  const u: Record<string, unknown> = {
    id: profile.id,
    name: profile.name,
    handle: profile.handle,
    tagline,
    headline,
    location,
    website: profile.website.trim(),
    bio: profile.bio,
    vibeTags,
    skills: profile.skills.slice(),
    snapshot,
    _onboarded: true,
    _isDemo: false,
  };

  if (profile.school_verified) {
    u.studentVerification = {
      status: "verified",
      school: schoolLabelForBadge(profile),
    };
  }

  if (opts?.appShell) u._appShell = true;

  if (profile.avatar_url) u.avatarPhoto = profile.avatar_url;

  if (profile.banner_url) {
    u.coverPhoto = profile.banner_url;
  } else if (profile.banner_gradient.trim()) {
    u.coverGradient = profile.banner_gradient.trim();
  }

  if (profile.resume_url) {
    const lower = profile.resume_url.toLowerCase();
    const isImage =
      /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(lower) && !/\.pdf(\?|$)/i.test(lower);
    u.resumePortfolio = [
      {
        name: isImage ? "Portfolio" : "Resume",
        type: isImage ? "image" : "pdf",
        url: profile.resume_url,
      },
    ];
  }

  const we = workExperienceForVibeHtml(profile.work_experience);
  if (we.length) u.workExperience = we;

  return u;
}
