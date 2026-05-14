import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { MessagesSwitch } from "./MessagesSwitch";

export const metadata = {
  title: "Messages · Vibe",
  description: "DMs and channels",
};

type Props = {
  searchParams: Promise<{ to?: string | string[] }>;
};

/**
 * `/messages` — auth-gates on the server then hands off to the viewport
 * switch. Mobile gets a native MessagesMobile component; desktop keeps
 * the messages.html iframe inside CampusAppShell. ?to=<handle> is
 * preserved so deep links open the right thread.
 */
export default async function MessagesPage({ searchParams }: Props) {
  await enforceCampusAccess("/messages");
  const { to } = await searchParams;
  const handleRaw = Array.isArray(to) ? to[0] : to;
  const initialHandle = handleRaw?.toLowerCase();
  return <MessagesSwitch initialHandle={initialHandle} />;
}
