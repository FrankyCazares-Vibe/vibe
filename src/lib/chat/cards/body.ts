/**
 * The shape check of `POST /api/me/threads/[id]/cards`
 * (handoffs/chat-redesign/wave-2-contracts.md 4.2; the field names of 4.1.6).
 *
 * The RPC's rules of 3.3 / 3.4 in TypeScript, so a bad body gets a 400
 * `invalid_card` with a `field` before any policy call; the RPC's `P0C22` is
 * the second wall. Lengths count code points, as Postgres `char_length`
 * does. Unknown keys are ignored.
 *
 * PURE: `isUuid` (pgrest.ts, no imports) is the one runtime import, so
 * `node --test` loads it (body.test.ts).
 */

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
  if (typeof v !== "string") return { ok: false };
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
      if (typeof body.note !== "string") return bad("note");
      const trimmed = body.note.trim();
      if (chars(trimmed) > NOTE_MAX) return bad("note");
      note = trimmed === "" ? null : trimmed;
    }
    return { ok: true, value: { type, event_id: body.event_id, note } };
  }

  if (typeof body.question !== "string") return bad("question");
  const question = body.question.trim();
  const questionLength = chars(question);
  if (questionLength < 1 || questionLength > QUESTION_MAX) return bad("question");

  const raw = body.options;
  if (!Array.isArray(raw)) return bad("options");
  const min = type === "poll" ? 2 : 1;
  if (raw.length < min || raw.length > OPTIONS_MAX) return bad("options");

  const labels: string[] = [];
  const capacities: number[] = [];
  for (let n = 0; n < raw.length; n += 1) {
    const field = `options.${n}`;
    const opt: unknown = raw[n];
    if (!isRecord(opt) || typeof opt.label !== "string") return bad(field);
    const label = collapse(opt.label);
    const labelLength = chars(label);
    if (labelLength < 1 || labelLength > LABEL_MAX) return bad(field);
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
