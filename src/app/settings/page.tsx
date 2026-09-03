import { redirect } from "next/navigation";

import { CampusAppShell } from "@/components/campus-app-shell";
import { SettingsClient } from "@/components/settings/SettingsClient";
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
  // goes through the service role scoped to the signed-in user's id.
  const { data: profile } = await createSupabaseServiceClient()
    .from("users")
    .select(
      "id,email,name,handle,handle_changed_at,school,school_email,school_verified,year,major,created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

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
          school: (profile?.school as string | null) ?? null,
          school_email: (profile?.school_email as string | null) ?? null,
          school_verified: Boolean(profile?.school_verified),
          year: (profile?.year as number | null) ?? null,
          major: (profile?.major as string | null) ?? null,
          created_at: (profile?.created_at as string | null) ?? null,
        }}
      />
    </CampusAppShell>
  );
}
