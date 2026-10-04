/**
 * The rules of pinned MESSAGES (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4d.3): the cap, the one-line quote of a pin, the "Clear chat
 * history" filter and the set a screen asks "is this message pinned?".
 *
 * PURE: no import, so the three pin routes, `pins-read.ts`, the hook
 * `use-message-pins.ts` and a client component may all import it, and
 * `node --test` loads it as it is (pin-rules.test.ts).
 *
 * Three other things are already called "pin" and none of them is this one:
 * `channel_members.pinned_at` (MY pinned chats, "Pin to top"),
 * `/api/me/threads/[id]/pin` (the route that sets it) and `channels.pinned`
 * (a room pinned in the old Campus rail). Here a pin is a row of
 * `chat_message_pins`: one message, pinned for everyone in a dm or group chat.
 *
 * Nothing here throws for a bad input: a date that cannot be read counts as
 * "not after" (the pin stays hidden rather than shown by mistake).
 */

/**
 * Pinned messages per chat. The PUT route answers 409 `pin_limit` at the cap;
 * its sentence in `REFUSAL_SENTENCES` names the same number. Two people
 * pinning the 20th at the same moment may leave 21: accepted (4d.3).
 */
export const PIN_CAP = 20;

/** The longest `pinQuote`, counted the way `String.length` counts. */
const QUOTE_MAX = 140;

/**
 * A pinned message as ONE line for its quote card (`PinnedMessage.text`):
 * every run of whitespace (line breaks too) becomes one space, the ends are
 * trimmed, and a longer text is cut so the answer is at most 140 characters
 * and ends with "…". "" for no content (a photo, a video or a shared post
 * with no words). The cut never splits an emoji's surrogate pair and leaves
 * no space before the "…".
 */
export function pinQuote(content: string | null): string {
  if (!content) return "";
  const line = content.replace(/\s+/g, " ").trim();
  if (line.length <= QUOTE_MAX) return line;
  let head = line.slice(0, QUOTE_MAX - 1);
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1); // half of a pair: drop it
  return `${head.trimEnd()}…`;
}

/**
 * One `timestamptz` string as [whole milliseconds, the microseconds past
 * them], or null when it cannot be read. Postgres keeps six digits and
 * `Date.parse` only three; the thread read compares in SQL
 * (`created_at > cleared_at`, message-read.ts), so the same two rows must not
 * compare differently here because they share a millisecond.
 */
function instant(iso: string): [number, number] | null {
  const m = /^(.*\d{2}:\d{2}:\d{2})\.(\d+)(.*)$/.exec(iso);
  if (!m) {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : [ms, 0];
  }
  const digits = `${m[2]}000000`;
  const ms = Date.parse(`${m[1]}.${digits.slice(0, 3)}${m[3]}`);
  return Number.isNaN(ms) ? null : [ms, Number(digits.slice(3, 6))];
}

/**
 * Whether a message is newer than the viewer's "Clear chat history" mark
 * (`channel_members.cleared_at`): the thread read's own rule, strictly after.
 * No mark = every message counts. A message written at the mark itself, or a
 * date that cannot be read, is NOT after: the pin list drops it and the PUT
 * route answers 404 `not_found`.
 */
export function afterCleared(createdAt: string, clearedAt: string | null): boolean {
  if (clearedAt === null) return true;
  const made = instant(createdAt);
  const mark = instant(clearedAt);
  if (!made || !mark) return false;
  return made[0] === mark[0] ? made[1] > mark[1] : made[0] > mark[0];
}

/**
 * The ids of a chat's pinned messages, for "Pin" or "Unpin" on a row. null
 * (the list has not answered yet, or pins are unavailable) is the empty set.
 */
export function pinnedIds(pins: { message_id: string }[] | null): ReadonlySet<string> {
  return new Set((pins ?? []).map((pin) => pin.message_id));
}
