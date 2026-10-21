/**
 * "Share page" on the club page (wave 2, C9 item 4): the club's own address,
 * through the phone's share sheet when there is one, else copied.
 *
 * The same order as the members' link (MembersLinkPanel.tsx): the store
 * apps' native sheet first (Android's web view has no navigator.share), then
 * the browser's sheet, then the clipboard. Closing a sheet says nothing; a
 * sheet that fails for another reason falls through to the copy, and when
 * the copy fails too the toast carries the link so it can still be typed.
 */
import { copyText } from "@/lib/feedback/request";
import { nativeShare } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

/** The club page's address on this site: origin + /orgs/<handle>. */
export function clubPageUrl(handle: string, origin: string): string {
  return `${origin}/orgs/${encodeURIComponent(handle)}`;
}

/** Call it straight from the tap, so the browser keeps the gesture. */
export async function shareClubPage(club: { handle: string; name: string }): Promise<void> {
  if (typeof window === "undefined") return;
  const url = clubPageUrl(club.handle, window.location.origin);
  const title = club.name;

  if (appShellOnClient() !== null && (await nativeShare({ title, url }))) return;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      // They closed the sheet: nothing to say.
      if ((err as { name?: unknown } | null)?.name === "AbortError") return;
    }
  }

  await copyText(url, {
    success: "Link copied.",
    failure: `Couldn't copy the link. It's ${url}`,
  });
}
