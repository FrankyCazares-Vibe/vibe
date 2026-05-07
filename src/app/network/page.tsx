import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { CampusAppShell } from "@/components/campus-app-shell";
import { NetworkPageClient } from "@/components/network/NetworkPageClient";

export const metadata = {
  title: "Network · Vibe",
  description: "Connections, following, followers, and people to know",
};

export default async function NetworkPage() {
  await enforceCampusAccess("/network");
  return (
    <CampusAppShell>
      <NetworkPageClient />
    </CampusAppShell>
  );
}
