/**
 * The shape check of `POST /api/me/threads/[id]/cards`
 * (handoffs/chat-redesign/wave-2-contracts.md 4.2; the field names of 4.1.6).
 *
 * The RPC's rules of 3.3 / 3.4 in TypeScript, so a bad body gets a 400
 * `invalid_card` with a `field` before any policy call; the RPC's `P0C22` is
 * the second wall. Lengths count code points, as Postgres `char_length`
 * does. Unknown keys are ignored.
 *
 * TEXT THAT POSTGRES OR A SCREEN CANNOT TAKE (S71 amendment 2, section 4):
 * a NUL (U+0000) in the question, a label or the note is that field's 400
 * (Postgres refuses NUL in `text`, so it used to fail later as a 503
 * `try_again`, forever); a question or a label that is VISIBLY BLANK
 * (nothing left once whitespace and invisible characters are removed) is
 * refused like an empty one, and a visibly blank note is stored as `null`
 * like a blank one. Text with something visible in it keeps its invisible
 * characters: nothing is stripped from real text.
 *
 * PURE: `isUuid` (pgrest.ts, no imports) and `INVISIBLE` (text-filter.ts,
 * no server-only import) are the runtime imports, so `node --test` loads it
 * (body.test.ts).
 */

import { INVISIBLE } from "@/lib/moderation/text-filter";
import { isUuid } from "@/lib/pgrest";

export type CleanCardBody =
  | {
      type: "poll";
      question: string;
      options: { label: string }[];
      anonymous: boolean;
      multi: boolean;
      closes_at: string | null;
    }
  | { type: "signup"; question: string; options: { label: string; capacity: number }[]; closes_at: string | null }
  | { type: "event"; event_id: string; note: string | null };

type Result = { ok: true; value: CleanCardBody } | { ok: false; field: string };

const QUESTION_MAX = 200;
const LABEL_MAX = 80;
const NOTE_MAX = 200;
const CAPACITY_MAX = 50;
const OPTIONS_MAX = 10;

const bad = (field: string): Result => ({ ok: false, field });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Characters, as Postgres counts them. */
const chars = (s: string) => Array.from(s).length;

/** Whitespace of every kind, runs included, becomes one space; the ends are trimmed. */
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Text Postgres cannot store, so the insert could only ever answer "try
 * again": a NUL anywhere, or half of a surrogate pair on its own (not valid
 * UTF-8 once encoded).
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const hasNul = (s: string) => s.includes("\u0000") || LONE_SURROGATE.test(s);

/**
 * Characters that draw nothing yet are neither `\s` nor in the word filter's
 * `INVISIBLE` class: the Hangul fillers (U+115F, U+1160, U+3164, U+FFA0) and
 * the Braille blank (U+2800).
 */
const BLANK_LETTERS = /[\u115F\u1160\u3164\uFFA0\u2800]/g;

/**
 * Nothing would show: empty once whitespace, `INVISIBLE`, `BLANK_LETTERS` and
 * every Unicode format, control, separator and combining-mark character are
 * removed (zero-width joiners, direction marks, variation selectors, tags).
 * Only a test: the stored text is never stripped.
 */
export const isVisiblyBlank = (s: string) =>
  s.replace(INVISIBLE, "").replace(BLANK_LETTERS, "").replace(/[\p{Cf}\p{Cc}\p{Z}\p{M}]/gu, "").replace(/\s+/g, "") === "";

/** `true` / `false`, or absent (false); anything else is a bad field. */
function readFlag(v: unknown): boolean | null {
  if (v === undefined) return false;
  return typeof v === "boolean" ? v : null;
}

/**
 * `closes_at`: absent or null → null; a string that `Date.parse`s and is
 * after `now` → kept exactly as sent (the RPC and the screens read the
 * same text); else the field is bad.
 */
function readClosesAt(v: unknown, now: Date): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string" || hasNul(v)) return { ok: false };
  const ms = Date.parse(v);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return { ok: false };
  return { ok: true, value: v };
}

export function readCreateCardBody(body: unknown, now: Date): Result {
  if (!isRecord(body)) return bad("type");
  const type = body.type;
  if (type !== "poll" && type !== "signup" && type !== "event") return bad("type");

  if (type === "event") {
    if (!isUuid(body.event_id)) return bad("event_id");
    let note: string | null = null;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string" || hasNul(body.note)) return bad("note");
      // A visibly blank note is no note, at any length (as a blank one is).
      const trimmed = body.note.trim();
      if (!isVisiblyBlank(trimmed)) {
        if (chars(trimmed) > NOTE_MAX) return bad("note");
        note = trimmed;
      }
    }
    return { ok: true, value: { type, event_id: body.event_id, note } };
  }

  if (typeof body.question !== "string" || hasNul(body.question)) return bad("question");
  const question = body.question.trim();
  const questionLength = chars(question);
  if (questionLength < 1 || questionLength > QUESTION_MAX || isVisiblyBlank(question)) return bad("question");

  const raw = body.options;
  if (!Array.isArray(raw)) return bad("options");
  const min = type === "poll" ? 2 : 1;
  if (raw.length < min || raw.length > OPTIONS_MAX) return bad("options");

  const labels: string[] = [];
  const capacities: number[] = [];
  for (let n = 0; n < raw.length; n += 1) {
    const field = `options.${n}`;
    const opt: unknown = raw[n];
    if (!isRecord(opt) || typeof opt.label !== "string" || hasNul(opt.label)) return bad(field);
    const label = collapse(opt.label);
    const labelLength = chars(label);
    if (labelLength < 1 || labelLength > LABEL_MAX || isVisiblyBlank(label)) return bad(field);
    labels.push(label);
    if (type === "poll") {
      if (opt.capacity !== undefined) return bad(field);
    } else {
      const capacity = opt.capacity;
      if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY_MAX) {
        return bad(field);
      }
      capacities.push(capacity);
    }
  }

  if (type === "signup") {
    const closesAt = readClosesAt(body.closes_at, now);
    if (!closesAt.ok) return bad("closes_at");
    const options = labels.map((label, n) => ({ label, capacity: capacities[n] }));
    return { ok: true, value: { type, question, options, closes_at: closesAt.value } };
  }

  // The rules' order (4.2): the two flags, then closes_at.
  const anonymous = readFlag(body.anonymous);
  if (anonymous === null) return bad("anonymous");
  const multi = readFlag(body.multi);
  if (multi === null) return bad("multi");
  const closesAt = readClosesAt(body.closes_at, now);
  if (!closesAt.ok) return bad("closes_at");
  const options = labels.map((label) => ({ label }));
  return { ok: true, value: { type, question, options, anonymous, multi, closes_at: closesAt.value } };
}
