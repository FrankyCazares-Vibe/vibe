import { lookingForForDisplay } from "@/lib/profile/looking-for";
import type { ProfileCampusColumns } from "@/lib/profile/normalize-profile-view";
import {
  campusBadgeForProfile,
  legacyCampusLabelForProfile,
} from "@/lib/profile/profile-campus-write";
import type { ProfileView } from "@/lib/profile/types";
import { workExperienceForVibeHtml } from "@/lib/profile/work-experience";

/**
 * A profile row plus, when the select asked for them, the campus columns.
 * They stay optional so a caller that reads only the legacy `school` label
 * still compiles and still gets a badge (the fallback in
 * `campusBadgeForProfile`).
 */
type ProfileForVibeUser = ProfileView & Partial<ProfileCampusColumns>;

const TAG_COLORS = ["coral", "purple", "sky", "gold", "mint", "lavender"] as const;

function taglineFromBio(bio: string): string {
  const t = bio.trim();
  if (!t) return "";
  const first = (t.split(/\n/)[0] ?? "").trim();
  if (first.length <= 220) return first;
  return `${first.slice(0, 217)}…`;
}

/**
 * The user's campus, or "" when they never picked one (or the stored value
 * names no campus in their university). Derived from `campus_id` +
 * `school_system`, falling back to the legacy `school` label for a row read
 * without the campus columns. `users.school` is still directly self-updatable
 * through PostgREST, so every render of it goes through the campus table
 * first — never trust the raw column for display.
 */
function campusLabelForDisplay(p: ProfileForVibeUser): string {
  return legacyCampusLabelForProfile(p) ?? "";
}

function headlineFromProfileParts(p: ProfileForVibeUser): string {
  // Major + year only. The campus badge already surfaces the campus on
  // the profile header, so injecting it here too was redundant
  // ("accounting · Kelley · Year 2"). Keep the chip tight.
  let h = p.major ?? "";
  if (p.year != null) {
    h = h ? `${h} · Year ${p.year}` : `Year ${p.year}`;
  }
  if (!h) h = campusLabelForDisplay(p);
  return h;
}

/**
 * Shape expected by `public/html/profile.html` (`vibe_user_v1` in localStorage).
 */
export function buildVibeUserV1FromProfile(
  profile: ProfileForVibeUser,
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
  const campusLabel = campusLabelForDisplay(profile);
  const location = profile.location_text.trim() || campusLabel;

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
    // "What are you here for?" — known tokens only, canonical order, always
    // present (`[]` when none). Routes that serve someone else's profile
    // blank `looking_for` before this runs (ruling H6: owner only).
    lookingFor: lookingForForDisplay(profile.looking_for),
    _onboarded: true,
  };

  if (profile.school_verified) {
    u.studentVerification = {
      status: "verified",
      // Badge from the campus model (plan §2.5): "IU Indianapolis" /
      // "Purdue Indianapolis" at a shared campus, the campus name elsewhere,
      // and "IU verified" / "Purdue verified" with no campus. The `??` is
      // unreachable here (campusBadgeForProfile only returns null for an
      // unverified row) and keeps the field a string for old clients.
      school: campusBadgeForProfile(profile) ?? "IU verified",
    };
  }

  if (opts?.appShell) u._appShell = true;

  if (profile.avatar_url) u.avatarPhoto = profile.avatar_url;

  if (profile.banner_url) {
    u.coverPhoto = profile.banner_url;
  } else if (profile.banner_gradient.trim()) {
    u.coverGradient = profile.banner_gradient.trim();
  }

  // Resume / portfolio docs — prefer the new multi-doc array. Fall
  // back to the legacy single `resume_url` so users who haven't
  // migrated still see their existing doc. The shape emitted matches
  // what profile.html + mobile already render: { name, type, url }.
  if (profile.resume_docs.length > 0) {
    u.resumePortfolio = profile.resume_docs.map((d) => ({
      name: d.name,
      type: d.type,
      url: d.url,
    }));
  } else if (profile.resume_url) {
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
      // Logo URL (optional, owner-uploaded). Mirrors the work-experience
      // logoUrl shape so profile.html + mobile both read it the same way.
      logoUrl: c.logoUrl ?? "",
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
