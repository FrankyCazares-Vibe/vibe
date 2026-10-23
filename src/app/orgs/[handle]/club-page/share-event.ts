/**
 * "Share the event" on the officers' Up next card (Oct 23, 2026; wave 3,
 * B1): the club's link to one event (`/orgs/<handle>?event=<id>`, which
 * lands on its card), with one line of words, "Blitz Night · Thu, Oct 29,
 * 7 PM · The Lantern Room".
 *
 * The same order as Share page (share-page.ts): the store apps' native sheet
 * first (Android's web view has no navigator.share), then the browser's
 * sheet, then the clipboard. Closing a sheet says nothing; a sheet that
 * fails for another reason falls through to the copy, and when the copy
 * fails too the toast carries the link so it can still be typed. The copy
 * holds the words and the link, so a paste into a group chat reads whole.
 */
import { copyText } from "@/lib/feedback/request";
import { nativeShare } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";

import { clubEventPath, eventShareText } from "./up-next-steps";

/** Call it straight from the tap, so the browser keeps the gesture. */
export async function shareClubEvent(ev: {
  handle: string;
  eventId: string;
  title: string;
  /** "Thu, Oct 29, 7 PM" (eventShareWhen). */
  when: string;
  place: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}${clubEventPath(ev.handle, ev.eventId)}`;
  const text = eventShareText({ title: ev.title, when: ev.when, place: ev.place });
  const title = ev.title;

  if (appShellOnClient() !== null && (await nativeShare({ title, text, url }))) return;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      // They closed the sheet: nothing to say.
      if ((err as { name?: unknown } | null)?.name === "AbortError") return;
    }
  }

  await copyText(text ? `${text}\n${url}` : url, {
    success: "Link copied.",
    failure: `Couldn't copy the link. It's ${url}`,
  });
}
