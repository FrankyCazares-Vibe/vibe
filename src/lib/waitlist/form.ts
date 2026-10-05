/**
 * The waitlist form, pure (BUILD.md section 3c). The `/waitlist` page checks
 * with it before posting and `POST /api/waitlist` checks again with the same
 * code, so the two always agree. No `server-only`, no `node:` imports.
 *
 * The limits match the CHECKs on `public.waitlist`
 * (supabase/migrations/20261003100000_waitlist.sql), counted in code points
 * the way Postgres `char_length` counts them.
 */

import {
  normalizeSchoolEmail,
  schoolEmailRejection,
  schoolSystemForEmail,
} from "../auth/school-email-domains";

/**
 * Which wording of the form's notice the person saw (`waitlist.notice_version`,
 * free text up to 40 characters). Raise it to the day the words change, in the
 * same commit as the notice or the tick text in src/app/waitlist/waitlist-form.tsx.
 * "2026-10-03" was the first wording; "2026-10-05" goes with Privacy Policy
 * section 11 as published that day.
 */
export const WAITLIST_NOTICE_VERSION = "2026-10-05";

export const WAITLIST_LIMITS = {
  name: 80,
  major: 80,
  clubs: 200,
  officerClub: 80,
  wish: 280,
  source: 40,
  email: 254,
} as const;

/** The onboarding year scale: "" is "Prefer not to say", "5" is "5th+ / grad". */
export const WAITLIST_YEAR_OPTIONS: readonly { value: "" | "1" | "2" | "3" | "4" | "5"; label: string }[] =
  Object.freeze([
    { value: "", label: "Prefer not to say" },
    { value: "1", label: "1st year" },
    { value: "2", label: "2nd year" },
    { value: "3", label: "3rd year" },
    { value: "4", label: "4th year" },
    { value: "5", label: "5th+ / grad" },
  ]);

/** What the form posts. `website` is the hidden honeypot: people leave it empty. */
export type WaitlistFormInput = {
  email: string;
  name: string;
  classYear: number | null;
  major?: string;
  clubs?: string;
  isOfficer: boolean;
  officerClub?: string;
  wish?: string;
  consentAge: boolean;
  consentInvite: boolean;
  consentNews: boolean;
  source?: string;
  website?: string;
};

/** A checked submit, ready to store. Blank optional text is null. */
export type WaitlistFormValue = {
  /** `normalizeSchoolEmail` form: trimmed, lowercased. The address mail goes to. */
  email: string;
  schoolSystem: "iu" | "purdue";
  name: string;
  classYear: number | null;
  major: string | null;
  clubs: string | null;
  isOfficer: boolean;
  /** Null unless `isOfficer`. */
  officerClub: string | null;
  wish: string | null;
  consentNews: boolean;
  source: string | null;
  /** True when the honeypot was filled in: answer as usual, store nothing. */
  honeypot: boolean;
};

export type WaitlistFormResult =
  | { ok: true; value: WaitlistFormValue }
  | { ok: false; field: keyof WaitlistFormInput | "form"; error: string };

const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;
// C0 and C1 controls, and the bidi overrides and isolates that can make a
// name read differently in the admin list than it was typed.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

/** Control characters replaced by a space, then trimmed. Anything that isn't a string is "". */
function cleanText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL_RE, " ").trim();
}

function codePoints(s: string): number {
  return Array.from(s).length;
}

/** The `?src=` tag, lowercased, or null when it isn't 1-40 of a-z, 0-9, _ and -. */
export function cleanSource(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return SOURCE_RE.test(v) ? v : null;
}

function parseYear(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5) return n;
  return undefined;
}

type TextField = "name" | "major" | "clubs" | "officerClub" | "wish";
const FIELD_WORDS: Record<TextField, string> = {
  name: "your name",
  major: "your major",
  clubs: "your clubs",
  officerClub: "your club's name",
  wish: "that line",
};

/**
 * Check a submit. The first problem found is returned with the field it
 * belongs to; `"form"` means the body wasn't an object at all. A bad
 * `source` is dropped (null), never an error. The honeypot never fails the
 * parse: the route answers a bot exactly as it answers a person.
 */
export function parseWaitlistForm(raw: unknown): WaitlistFormResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, field: "form", error: "Something went wrong. Refresh the page and try again." };
  }
  const r = raw as Record<string, unknown>;

  const typedEmail = cleanText(r.email);
  if (!typedEmail) return { ok: false, field: "email", error: "Add your school email." };
  if (typedEmail.length > WAITLIST_LIMITS.email) {
    return { ok: false, field: "email", error: "That email address is too long." };
  }
  const email = normalizeSchoolEmail(typedEmail);
  if (!email || email.length < 3) {
    return { ok: false, field: "email", error: "That doesn't look like an email address." };
  }
  const rejection = schoolEmailRejection(email, { context: "request" });
  if (rejection) return { ok: false, field: "email", error: rejection.error };
  const schoolSystem = schoolSystemForEmail(email);
  if (!schoolSystem) {
    return { ok: false, field: "email", error: "Use your school email." };
  }

  const text: Record<TextField, string> = {
    name: cleanText(r.name),
    major: cleanText(r.major),
    clubs: cleanText(r.clubs),
    officerClub: cleanText(r.officerClub),
    wish: cleanText(r.wish),
  };
  if (!text.name) return { ok: false, field: "name", error: "Add your name." };
  for (const field of Object.keys(text) as TextField[]) {
    const limit = WAITLIST_LIMITS[field];
    if (codePoints(text[field]) > limit) {
      return { ok: false, field, error: `Keep ${FIELD_WORDS[field]} under ${limit} characters.` };
    }
  }

  const classYear = parseYear(r.classYear);
  if (classYear === undefined) return { ok: false, field: "classYear", error: "Pick your year." };

  if (r.consentAge !== true) {
    return { ok: false, field: "consentAge", error: "Tick this to confirm you're 18 or older and have an IU or Purdue email address." };
  }
  if (r.consentInvite !== true) {
    return {
      ok: false,
      field: "consentInvite",
      error: "Tick this so we can email you when it's your turn.",
    };
  }

  const isOfficer = r.isOfficer === true;
  return {
    ok: true,
    value: {
      email,
      schoolSystem,
      name: text.name,
      classYear,
      major: text.major || null,
      clubs: text.clubs || null,
      isOfficer,
      officerClub: isOfficer ? text.officerClub || null : null,
      wish: text.wish || null,
      consentNews: r.consentNews === true,
      source: cleanSource(typeof r.source === "string" ? r.source : null),
      honeypot: cleanText(r.website) !== "",
    },
  };
}
