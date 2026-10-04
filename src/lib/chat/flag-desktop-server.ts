/**
 * Is `chat_desktop` on for this person? The question the two desktop pages
 * ask on the server (handoffs/chat-redesign/wave-3-desktop/contract.md
 * section 2):
 *
 *   enabled AND (everyone OR a listed user) AND chat_v2 on for that person
 *
 * The desktop parts are env reads (flag.ts, pure) and come first, so a
 * person the desktop switch leaves out costs no database read. The last part
 * is `chatV2For`, called and never copied: it fails closed and is not
 * cached, so this does too.
 *
 * In its OWN file on purpose. Two route tests replace `flag-server` with a
 * stub that exports only `chatV2For`, so nothing new may be exported from
 * there, and no gated route imports this file: the routes are gated by
 * `chat_v2` alone, which `chat_desktop` implies.
 */

import "server-only";

import { chatDesktopEveryone, chatDesktopListedUser } from "./flag";
import { chatV2For } from "./flag-server";

export async function chatDesktopFor(userId: string): Promise<boolean> {
  if (!chatDesktopEveryone(process.env) && !chatDesktopListedUser(userId, process.env)) return false;
  return chatV2For(userId);
}
