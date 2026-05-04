import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileHtmlBridge } from "./profile-html-bridge";

export const metadata = {
  title: "Profile · Vibe",
  description: "Your profile",
};

export default async function ProfilePage() {
  await enforceCampusAccess("/profile");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent("/profile")}`);
  }

  return <ProfileHtmlBridge />;
}
