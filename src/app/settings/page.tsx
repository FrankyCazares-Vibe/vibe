import { redirect } from "next/navigation";

import { CampusAppShell } from "@/components/campus-app-shell";
import { SettingsClient } from "@/components/settings/SettingsClient";
import type { NotificationPrefs } from "@/components/settings/notifications-card-view";
import { isOttoOnboardingComplete } from "@/lib/auth/post-login";
import { ownCampusFields } from "@/lib/profile/profile-campus-write";
import type { SettingsCampusInput } from "@/lib/profile/settings-campus-card";
import { parsePushPrefs } from "@/lib/push/payload";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const metadata = {
  title: "Settings · Vibe",
  description: "Account, sign out, and account deletion",
};

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/settings")}`);
  }

  // email / school_email are private columns (no RLS read); the self-read
  // goes through the service role scoped to the signed-in user's id. So do
  // campus_set_at and otto_answers (no `authenticated` SELECT grant): they
  // only feed the campus card's derived fields below and never reach the
  // client raw. otto_settings (also private) only feeds the Notifications
  // card's pushPrefs below, never the raw blob.
  const { data: profile, error: profileErr } = await createSupabaseServiceClient()
    .from("users")
    .select(
      "id,email,name,handle,handle_changed_at,school,school_email,school_verified,school_system,campus_id,campus_set_at,otto_answers,otto_settings,year,major,created_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) console.error("[settings profile read]", profileErr);

  // Campus card (plan wave 3 B15). A failed read passes null, which the card
  // renders as a load failure instead of "Verify your school email".
  let campus: SettingsCampusInput | null = null;
  if (profile && !profileErr) {
    const own = ownCampusFields({
      school: (profile.school as string | null) ?? null,
      school_verified: Boolean(profile.school_verified),
      school_system: (profile.school_system as string | null) ?? null,
      campus_id: (profile.campus_id as string | null) ?? null,
      campus_set_at: (profile.campus_set_at as string | null) ?? null,
    });
    campus = {
      schoolVerified: Boolean(profile.school_verified),
      schoolSystem: own.schoolSystem,
      campusId: own.campusId,
      campusConfirmed: own.campusConfirmed,
      campusChangeAvailableAt: own.campusChangeAvailableAt,
      onboarded: isOttoOnboardingComplete(profile.otto_answers),
    };
  }

  // Notifications card, "What to send" (plan §8 W3, critic-w3 item 5).
  // Mentions have one key, mention_pings: parsePushPrefs folds it into `off`,
  // so it comes back out here, and `off` never carries "mention" to the
  // client (the card would otherwise save it into push.off). A stray
  // "mention" already in push.off still reads as off, and the card's next
  // Mentions-on save clears it. A failed read passes null: the card then
  // hides its switches rather than show defaults it could save over the
  // student's real choices (every kind save sends the full `off` list).
  let pushPrefs: NotificationPrefs | null = null;
  if (profile && !profileErr) {
    const prefs = parsePushPrefs(profile.otto_settings);
    pushPrefs = {
      previews: prefs.previews,
      off: [...prefs.off].filter((k) => k !== "mention"),
      mentionPings: !prefs.off.has("mention"),
    };
  }

  // No consent gate here on purpose (S53 A4): someone who declines the
  // Terms must still be able to reach account deletion. The page's own
  // writes (handle change, deletion) are gated per-API instead.

  return (
    <CampusAppShell>
      <SettingsClient
        profile={{
          id: String(profile?.id ?? user.id),
          name: (profile?.name as string | null) ?? null,
          handle: (profile?.handle as string | null) ?? null,
          handle_changed_at:
            (profile?.handle_changed_at as string | null) ?? null,
          email: (profile?.email as string | null) ?? user.email ?? null,
          school_email: (profile?.school_email as string | null) ?? null,
          school_verified: Boolean(profile?.school_verified),
          year: (profile?.year as number | null) ?? null,
          major: (profile?.major as string | null) ?? null,
          created_at: (profile?.created_at as string | null) ?? null,
        }}
        campus={campus}
        pushPrefs={pushPrefs}
      />
    </CampusAppShell>
  );
}
