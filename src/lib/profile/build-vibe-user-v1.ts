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
  // Major + year only. The school badge (iu.edu pill) already surfaces
  // the school on the profile header, so injecting it here too was
  // redundant ("accounting · Kelley · Year 2"). Keep the chip tight.
  let h = p.major ?? "";
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
  // Headline is now always derived from major + year (the chip format
  // the user agreed on). The stored users.headline column is only used
  // as a final fallback for legacy users who had a custom headline set
  // before this picker shipped AND have no major/year. The old precedence
  // (stored over derived) left users with stale "accounting · Kelley ·
  // Year 2" strings even after they picked a new major.
  const derivedHeadline = headlineFromProfileParts(profile);
  const headline = derivedHeadline || profile.headline.trim();
  const location = profile.location_text.trim() || profile.school || "";

  const baseSnap: Record<string, string> = {
    role: profile.major || "",
    seniority: profile.year != null ? `Year ${profile.year}` : "",
    locationSnap: profile.school || "",
    availability: "",
    preferred: preferredFromLookingFor(profile.looking_for),
    // Cap the joined string visually — the snapshot card has limited
    // horizontal real estate and 8 long skills overflow even with grid wrap.
    topSkills: profile.skills.slice(0, 5).join(", "),
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
  // Flag the manual-order override for both viewports. profile.html
  // reads `_workOrderManual` (with underscore); mobile reads it via
  // the camelCase key on the user object.
  if (profile.work_order_manual) u._workOrderManual = true;

  // "Working on" — pre-existing localStorage key on profile.html
  // (`user.currentlyOn`), now backed by users.current_on. Emitted as
  // the same camelCase key so existing consumers don't have to change.
  if (profile.current_on.length) {
    u.currentlyOn = profile.current_on.map((c) => ({
      icon: c.icon,
      text: c.text,
    }));
  }

  // Resume / portfolio redaction bars — backs the localStorage
  // `redactionBars` array in profile.html. Mobile reads it to render
  // overlays in the in-app document viewer.
  if (profile.resume_redactions.length) {
    u.resumeRedactions = profile.resume_redactions.map((b) => ({ ...b }));
  }

  return u;
}
