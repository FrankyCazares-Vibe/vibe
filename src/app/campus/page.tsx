import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { CampusSwitch } from "./CampusSwitch";

export const metadata = {
  title: "Campus · Vibe",
  description: "Campus home — IU wedge.",
};

export default async function CampusPage({
  searchParams,
}: {
  searchParams: Promise<{ school_verified?: string }>;
}) {
  await enforceCampusAccess("/campus");
  const sp = await searchParams;
  return <CampusSwitch showSchoolVerifiedBanner={sp.school_verified === "1"} />;
}
