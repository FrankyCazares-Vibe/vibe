/**
 * What an event's text and times must be, for a new event (POST /api/events)
 * and an edit (PATCH /api/events/[id]) alike (S68 officer tools, B1). One
 * function so the two can never drift: same trimming, same order of
 * refusals, same codes and sentences as POST always sent.
 *
 * Pure: no `@/` import, no server-only module, so
 * `node --test --experimental-strip-types` can load it (validate.test.ts).
 *
 * AN EDIT CHECKS ONLY WHAT CHANGED, in two places:
 *  - the word filter runs `checkChangedText`: a title stored before the list
 *    grew doesn't block fixing the room (src/lib/moderation/text-filter.ts
 *    explains why every edit surface does this);
 *  - a kept start may be in the past (an event under way can still be
 *    fixed); a moved start may not. And an edited event must still end in the
 *    future: ending it early would drop it from every list with no notice to
 *    the people who RSVP'd, which is what Cancel is for.
 */

import { checkChangedText } from "../moderation/text-filter";
import {
  EVENT_MAX_DESCRIPTION,
  EVENT_MAX_LOCATION,
  EVENT_MAX_TITLE,
  eventTimesProblem,
} from "./manage";

/** The fields POST accepts and PATCH may change, by their JSON names. */
export const EVENT_TEXT_FIELDS = ["title", "description", "location"] as const;
export type EventTextField = (typeof EVENT_TEXT_FIELDS)[number];

/** The stored event an edit starts from. Omit it for a new event. */
export type StoredEventFields = {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
};

/** Trimmed request values; times are still the raw strings. */
export type EventFields = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
};

/** What the database row gets. Times are ISO strings in UTC. */
export type ValidEventFields = {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
};

export type EventFieldsProblem =
  | { kind: "invalid"; status: 400; code: string; error: string }
  | { kind: "content_blocked"; status: 422; field: EventTextField };

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads the five fields from a parsed JSON object. For an edit, a field the
 * body leaves out keeps its stored value; a field that is present but isn't a
 * string reads as "" (as POST always has), so `{"title": 5}` is "Title is
 * required", not a silent no-op.
 */
export function readEventFields(
  body: Record<string, unknown>,
  stored?: StoredEventFields,
): EventFields {
  const pick = (key: keyof StoredEventFields): string =>
    stored && body[key] === undefined ? asTrimmed(stored[key]) : asTrimmed(body[key]);
  return {
    title: pick("title"),
    description: pick("description"),
    location: pick("location"),
    startsAt: pick("starts_at"),
    endsAt: pick("ends_at"),
  };
}

/**
 * The whole check, in POST's order: title required, the three length caps
 * (the database CHECKs' numbers, see manage.ts), the word filter (title,
 * description, location), then the times. `stored` present = an edit.
 */
export function checkEventFields(
  fields: EventFields,
  nowMs: number,
  stored?: StoredEventFields,
): { ok: true; value: ValidEventFields } | { ok: false; problem: EventFieldsProblem } {
  const invalid = (code: string, error: string) =>
    ({ ok: false, problem: { kind: "invalid", status: 400, code, error } }) as const;
  const { title, description, location } = fields;

  if (!title) return invalid("title_required", "Title is required");
  if (title.length > EVENT_MAX_TITLE) {
    return invalid("title_too_long", `Title exceeds ${EVENT_MAX_TITLE} characters`);
  }
  if (description.length > EVENT_MAX_DESCRIPTION) {
    return invalid("description_too_long", `Description exceeds ${EVENT_MAX_DESCRIPTION} characters`);
  }
  if (location.length > EVENT_MAX_LOCATION) {
    return invalid("location_too_long", `Location exceeds ${EVENT_MAX_LOCATION} characters`);
  }

  // `field` names the input for the composer to point at. The matched word
  // is never part of the answer (text-filter.ts).
  for (const field of EVENT_TEXT_FIELDS) {
    if (!checkChangedText(fields[field], stored ? stored[field] : undefined).ok) {
      return { ok: false, problem: { kind: "content_blocked", status: 422, field } };
    }
  }

  const start = Date.parse(fields.startsAt);
  const end = Date.parse(fields.endsAt);
  const keptStart = !!stored && Number.isFinite(start) && start === Date.parse(stored.starts_at);
  const times = eventTimesProblem(start, end, nowMs, { allowPastStart: keptStart });
  if (times) return invalid(times.code, times.error);
  if (stored && end <= nowMs) return invalid("invalid_times", "End time is in the past");

  return {
    ok: true,
    value: {
      title,
      description,
      location,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
    },
  };
}
