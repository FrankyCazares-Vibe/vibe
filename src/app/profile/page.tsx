import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { profileNextPath } from "./profile-params";
import { ProfileSwitch } from "./ProfileSwitch";

export const metadata = {
  title: "Profile · Vibe",
  description: "Your profile",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Every gate below sends the student away and back, so it has to be told
  // WHICH profile view they asked for: a notification's /profile?post=<id>
  // came back as a bare /profile and the post was gone (profileNextPath).
  const next = profileNextPath(await searchParams);
  await enforceCampusAccess(next);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  return <ProfileSwitch />;
}
