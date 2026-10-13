import { headers } from "next/headers";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { isPhoneRequest } from "@/lib/device-hint";

import { NetworkSwitch } from "./NetworkSwitch";

export const metadata = {
  title: "Network · Vibe",
  description: "Connections, following, followers, and people to know",
};

export default async function NetworkPage() {
  await enforceCampusAccess("/network");
  // The server's guess at the screen this device needs (device-hint.ts):
  // NetworkSwitch builds that one here and the browser fetches only that one.
  return <NetworkSwitch firstGuessPhone={isPhoneRequest(await headers())} />;
}
