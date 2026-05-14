import { enforceCampusAccess } from "@/lib/auth/campus-access";

import { MessagesSwitch } from "./MessagesSwitch";

export const metadata = {
  title: "Messages · Vibe",
  description: "DMs and channels",
};

type Props = {
  searchParams: Promise<{
    to?: string | string[];
    channel?: string | string[];
  }>;
};

/**
 * `/messages` — auth-gates on the server then hands off to the viewport
 * switch. Mobile gets a native MessagesMobile component; desktop keeps
 * the messages.html iframe inside CampusAppShell. Deep links:
 *   - ?to=<handle>      opens / creates a DM with that user
 *   - ?channel=<id>     opens the conversation view on that channel
 */
export default async function MessagesPage({ searchParams }: Props) {
  await enforceCampusAccess("/messages");
  const { to, channel } = await searchParams;
  const handleRaw = Array.isArray(to) ? to[0] : to;
  const initialHandle = handleRaw?.toLowerCase();
  const channelRaw = Array.isArray(channel) ? channel[0] : channel;
  const initialChannelId = channelRaw?.trim() || undefined;
  return (
    <MessagesSwitch
      initialHandle={initialHandle}
      initialChannelId={initialChannelId}
    />
  );
}
