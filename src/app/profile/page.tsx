import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { ProfileMain } from "./profile-main";

export const metadata = {
  title: "Profile · Vibe",
  description: "Your profile",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ school_verified?: string }>;
}) {
  await enforceCampusAccess("/profile");
  const sp = await searchParams;
  return (
    <ProfileMain showSchoolVerifiedBanner={sp.school_verified === "1"} />
  );
}
