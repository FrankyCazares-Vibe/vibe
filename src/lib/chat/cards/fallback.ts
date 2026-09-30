/**
 * The text stored in `messages.content` for a card (wave-2 contract 5.1):
 * what the old screens, previews, search, the old inbox and reports show for
 * a poll, a sign-up or an Event card, since none of them reads `card`.
 *
 *   Poll: <question>
 *   Sign-up: <title>
 *   Event: <title> · <Thu Oct 8, 7:30 PM>[ — <note>]
 *
 * PURE: imports only `../when` (the campus zone and `eventWhen`), so
 * `node --test` loads it (fallback.test.ts). The route builds it from the
 * cleaned body of `readCreateCardBody` (a blank question cannot reach it, so
 * the text is never empty) and hands it to the RPC as `p_content`, whose
 * `char_length(...) between 1 and 300` is the second wall: the cut counts
 * code points, as Postgres does.
 */

import { CAMPUS_TIME_ZONE, eventWhen } from "../when";

export type FallbackInput =
  | { type: "poll"; question: string }
  | { type: "signup"; question: string }
  | { type: "event"; title: string; starts_at: string; note: string | null };

/** The most characters stored; the 300th becomes `…` when the text is cut. */
export const FALLBACK_MAX = 300;

/** Whitespace of every kind, runs included, becomes one space; the ends are trimmed. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function cardFallbackContent(input: FallbackInput, zone: string = CAMPUS_TIME_ZONE): string {
  let text: string;
  if (input.type === "poll") {
    text = `Poll: ${input.question}`;
  } else if (input.type === "signup") {
    text = `Sign-up: ${input.question}`;
  } else {
    const when = eventWhen(input.starts_at, zone);
    text = `Event: ${input.title} · ${when}`;
    if (input.note !== null && input.note.trim() !== "") text += ` — ${input.note}`;
  }
  const chars = Array.from(collapse(text));
  if (chars.length <= FALLBACK_MAX) return chars.join("");
  return `${chars.slice(0, FALLBACK_MAX - 1).join("")}…`;
}
