import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { chatV2For } from "@/lib/chat/flag-server";
import { MiniInbox } from "@/components/desktop/messages/MiniInbox";

export const metadata = {
  title: "Messages · Vibe",
  robots: { index: false },
};

/**
 * `/messages/mini`: the new inbox at the size of the small Messages window
 * over the desktop profile. public/html/_miniMessenger.js frames this page;
 * it is the phone's Messages home (Your week, one row per club, the unread
 * marks, pinned first) without its header, and every tap opens the chat in
 * `/messages` in the whole tab.
 *
 * The gate is told `/messages`, not this address: a sign-in or Terms
 * redirect that starts here must come back to the full page, never to a
 * frame-sized one. The window sees the frame leave this address and sends
 * the whole tab after it.
 *
 * Without `chat_v2` the inbox routes answer 404, and the window keeps its
 * old list and never frames this page; a direct visit gets the link.
 */
export default async function MessagesMiniPage() {
  const { userId } = await enforceCampusAccess("/messages");
  const chatV2 = await chatV2For(userId);
  return <MiniInbox chatV2={chatV2} />;
}
