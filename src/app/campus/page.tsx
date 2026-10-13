import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { enforceCampusAccess } from "@/lib/auth/campus-access";
import { chatDesktopFor } from "@/lib/chat/flag-desktop-server";
import { isPhoneRequest } from "@/lib/device-hint";

import { CampusSwitch } from "./CampusSwitch";

export const metadata = {
  title: "Campus · Vibe",
  description: "Your campus on Vibe: clubs, events, people and the map.",
};

/** The first value of a query setting, as it was asked. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/campus` — auth-gates on the server then hands off to the viewport switch.
 *
 * For people with the `chat_desktop` switch, Campus has no Chat tab: club
 * chat lives on `/messages`. An old link to it (`?tab=chat`, or the club
 * page's rooms list with `?tab=chat&org=<handle>&channel=<id>`) is sent
 * there from here, on the server, so the old screen never paints and Back
 * returns to the page before. `org=` is dropped: the room id names its club.
 * Right on both screens: `chat_desktop` implies `chat_v2`, and the phone
 * already redirects these links (CampusMobile).
 *
 * `firstGuessPhone` is the server's guess at the screen this device needs,
 * read from the request (src/lib/device-hint.ts). CampusSwitch builds that
 * screen here and the browser fetches only that one; the window's width has
 * the last word after load. Reading the headers costs nothing new: the root
 * layout already reads them on every request, for the browser rule's nonce.
 */
export default async function CampusPage({
  searchParams,
}: {
  searchParams: Promise<{
    school_verified?: string;
    tab?: string | string[];
    channel?: string | string[];
  }>;
}) {
  const { userId } = await enforceCampusAccess("/campus");
  const desktopChat = await chatDesktopFor(userId);
  const sp = await searchParams;
  if (desktopChat) {
    const channel = first(sp.channel)?.trim();
    if (first(sp.tab) === "chat" || channel) {
      redirect("/messages" + (channel ? "?channel=" + encodeURIComponent(channel) : ""));
    }
  }
  return (
    <CampusSwitch
      showSchoolVerifiedBanner={sp.school_verified === "1"}
      desktopChat={desktopChat}
      firstGuessPhone={isPhoneRequest(await headers())}
    />
  );
}
