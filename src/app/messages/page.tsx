import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { chatDesktopFor } from "@/lib/chat/flag-desktop-server";

import { MessagesSwitch } from "./MessagesSwitch";

export const metadata = {
  title: "Messages · Vibe",
  description: "DMs and channels",
};

type Props = {
  searchParams: Promise<{
    to?: string | string[];
    channel?: string | string[];
    tab?: string | string[];
  }>;
};

/** The first value of a query setting, as it was asked. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/messages` — auth-gates on the server then hands off to the viewport
 * switch. Mobile gets a native MessagesMobile component; desktop keeps
 * the messages.html iframe inside CampusAppShell, or, for people with the
 * `chat_desktop` switch, gets the React MessagesDesktop. Deep links:
 *   - ?to=<handle>      opens / creates a DM with that user
 *   - ?channel=<id>     opens the conversation view on that channel
 *   - ?tab=<filter>     the phone's inbox filter (read on the client)
 *
 * The gate is told the WHOLE address, so a sign-in or Terms redirect comes
 * back to the chat that was asked for. It used to be a bare `/messages`, and
 * a signed-out tap on a chat link landed on the inbox.
 *
 * `desktopChat` is worked out here, on the server, and handed down as a prop:
 * a client hook would put a placeholder in front of every laptop without the
 * switch while it asked.
 */
export default async function MessagesPage({ searchParams }: Props) {
  const { to, channel, tab } = await searchParams;
  const handleRaw = first(to);
  const channelRaw = first(channel);
  const tabRaw = first(tab);

  const asked = new URLSearchParams();
  if (handleRaw) asked.set("to", handleRaw);
  if (channelRaw) asked.set("channel", channelRaw);
  if (tabRaw) asked.set("tab", tabRaw);
  const query = asked.toString();
  const path = query ? `/messages?${query}` : "/messages";

  const { userId } = await enforceCampusAccess(path);
  const desktopChat = await chatDesktopFor(userId);

  const initialHandle = handleRaw?.toLowerCase();
  const initialChannelId = channelRaw?.trim() || undefined;
  return (
    <MessagesSwitch
      initialHandle={initialHandle}
      initialChannelId={initialChannelId}
      desktopChat={desktopChat}
    />
  );
}
