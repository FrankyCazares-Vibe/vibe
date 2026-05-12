import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { NetworkSwitch } from "./NetworkSwitch";

export const metadata = {
  title: "Network · Vibe",
  description: "Connections, following, followers, and people to know",
};

export default async function NetworkPage() {
  await enforceCampusAccess("/network");
  return <NetworkSwitch />;
}
