/**
 * The "you sign in with a different email" note (Franky, Oct 13 2026).
 *
 * Forgot password sends its reset to the address an account SIGNS IN with,
 * and answers the same neutral sentence for every other address. 15 of the 20
 * accounts sign in with a different address than their school email, so a
 * student who typed the school address got that sentence and no email at all.
 *
 * The fix: when the typed address is a PROVEN second address of exactly one
 * account (its verified school email, or the personal email it added), that
 * inbox gets a short note naming the sign-in address with most of it hidden,
 * "g•••@gmail.com". The screen still shows the same neutral sentence.
 *
 * This file is every pure piece: the mask, who gets a note, and the words.
 * The reads and the limits are in src/app/api/auth/password-reset/route.ts;
 * the sender is `sendSigninHintEmail` in src/lib/email/resend-transactional.ts.
 *
 * Pure: no imports, so the node test runner loads it.
 */

// ---------------------------------------------------------------------------
// The mask
// ---------------------------------------------------------------------------

/** Always three dots, so the mask never says how long the name is. */
const MASK_DOTS = "•••";
/** The longest address a mailbox can have. */
const ADDRESS_MAX = 254;
/** One letter or one digit, in any alphabet: nothing that could be markup. */
const FIRST_CHARACTER_RE = /^[\p{L}\p{N}]$/u;
/** A plain host: labels of a-z, 0-9 and "-", with at least one dot. */
const HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Trimmed, lowercased, no trailing dots: how two addresses are compared here. */
function canonical(address: string): string {
  return address.trim().toLowerCase().replace(/\.+$/, "");
}

/**
 * `gina.lee+vibe@Gmail.com` becomes `g•••@gmail.com`: the first character of
 * the name, three dots, then the whole part after the @.
 *
 * Never more than that one character of the name, whatever comes in. Null
 * when the address cannot be masked safely (not text, not exactly one "@",
 * a space or a control character anywhere, a name that does not start with a
 * letter or a digit, a host that is not a plain one): the caller then sends
 * no note at all.
 */
export function maskSignInEmail(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const value = canonical(address);
  if (!value || value.length > ADDRESS_MAX) return null;
  if (/[\s\p{Cc}]/u.test(value)) return null;
  const parts = value.split("@");
  if (parts.length !== 2) return null;
  const [name, host] = parts;
  // By code point, so half of an emoji or a rare letter is never cut out.
  const first = Array.from(name)[0];
  if (!first || !FIRST_CHARACTER_RE.test(first) || !HOST_RE.test(host)) return null;
  return `${first}${MASK_DOTS}@${host}`;
}

/**
 * True only for text `maskSignInEmail` could have made. The email's words
 * check it, so a whole address can never be put in the note by mistake.
 */
export function isMaskedSignInEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const cut = value.indexOf(`${MASK_DOTS}@`);
  if (cut < 0) return false;
  const first = value.slice(0, cut);
  const host = value.slice(cut + MASK_DOTS.length + 1);
  return FIRST_CHARACTER_RE.test(first) && HOST_RE.test(host);
}

// ---------------------------------------------------------------------------
// Who gets a note
// ---------------------------------------------------------------------------

/**
 * What one private column is searched for, or null for "do not look there".
 *
 * `stored` is how that column would hold the typed address (the route's
 * `normalizeSchoolEmail` or `normalizePersonalEmail`; null when the address
 * cannot be in the column at all). The column is searched only when the
 * typed address IS that stored form, character for character.
 *
 * Why: "name@iu.edu." (a dot on the end) is stored as "name@iu.edu", so
 * searching for the stored form found the account. The note was then handed
 * to the email service for the dotted address, which it is expected to
 * refuse (never tried live), while the once-a-day count is kept on the
 * address with its end dots taken off (`canonicalRecipient`). So the
 * student's one note for the day was spent, most likely with nothing
 * delivered, and the plain address typed afterwards got silence. A stranger
 * could switch the note off for anyone that way, one request a day. Now a
 * spelling that is not the stored one finds nobody, counts nothing and
 * sends nothing, and the note still goes to exactly what was typed.
 */
export function hintLookupKey(typed: unknown, stored: unknown): string | null {
  if (typeof typed !== "string" || typeof stored !== "string") return null;
  return stored !== "" && stored === typed ? stored : null;
}

/**
 * The `users` rows that hold the typed address, by the column that matched.
 * Each list comes from one exact-match read by the route (never a pattern),
 * and only for a key `hintLookupKey` let through.
 */
export type HintLookup = {
  /**
   * Rows whose `users.email` is the typed address. That column is a copy of
   * the sign-in email made when the account was created, and nothing keeps
   * it in step afterwards, so it is a hint and the sign-in system decides.
   */
  signIn: readonly { id: string }[];
  /** Rows whose `school_email` is the typed address. */
  school: readonly { id: string; school_verified?: boolean | null }[];
  /** Rows whose `personal_email` is the typed address. */
  personal: readonly { id: string; personal_email_verified_at?: string | null }[];
};

/** Why no note goes out. Never shown to anyone: for the tests and the reader. */
export type HintSkip =
  /** Another account signs in with it: a reset email is the answer, not a note. */
  | "sign_in_address"
  /** No account holds it. */
  | "unknown"
  /** An account holds it but never proved it. */
  | "unverified"
  /** More than one account holds it: we cannot say whose note it would be. */
  | "ambiguous"
  /** We could not tell whether the account is suspended or banned. */
  | "restriction_unknown"
  /** The account is suspended or banned. */
  | "restricted"
  /** The sign-in system gave no sign-in address for the account. */
  | "no_sign_in_address"
  /** The account signs in with the typed address itself. */
  | "same_address"
  /** The sign-in address cannot be masked safely. */
  | "unmaskable";

export type HintCandidate =
  | { ok: true; userId: string }
  | { ok: false; reason: HintSkip };

/**
 * Step one: the one account whose proven second address is the typed one.
 * The route needs the account before it can ask the two things step two
 * reads (is it restricted, what does it sign in with).
 */
export function hintCandidate(lookup: HintLookup): HintCandidate {
  const holders = new Set<string>();
  const proven = new Set<string>();
  for (const row of lookup.school) {
    if (!row.id) continue;
    holders.add(row.id);
    if (row.school_verified === true) proven.add(row.id);
  }
  for (const row of lookup.personal) {
    if (!row.id) continue;
    holders.add(row.id);
    if (typeof row.personal_email_verified_at === "string" && row.personal_email_verified_at) {
      proven.add(row.id);
    }
  }

  if (holders.size === 0) {
    return { ok: false, reason: lookup.signIn.length > 0 ? "sign_in_address" : "unknown" };
  }
  // Counted over everyone who holds it, proven or not: two accounts with a
  // claim on one inbox is a state we do not guess about.
  if (holders.size > 1) return { ok: false, reason: "ambiguous" };
  const [userId] = [...holders];
  // Somebody else's sign-in address is never the subject of a note. The same
  // account's own row is let through: its copy can be out of date (a sign-in
  // email changed by hand), and step two asks the sign-in system and sends
  // nothing when the account really does sign in with the typed address.
  if (lookup.signIn.some((row) => row.id !== userId)) {
    return { ok: false, reason: "sign_in_address" };
  }
  if (!proven.has(userId)) return { ok: false, reason: "unverified" };
  return { ok: true, userId };
}

export type HintDecision =
  | { action: "send"; userId: string; masked: string }
  | { action: "none"; reason: HintSkip };

/**
 * Step two, the whole rule: send the note, or do nothing and why.
 *
 * `restricted` is null when the restriction read failed, and `signInEmail`
 * is null when the sign-in system could not be read. Both mean no note: a
 * bad minute for the database must not mail a banned account, and a note
 * with no address in it helps nobody.
 */
export function signinHintDecision(input: {
  /** What was typed into Forgot password. */
  typed: string;
  lookup: HintLookup;
  restricted: boolean | null;
  signInEmail: string | null;
}): HintDecision {
  const none = (reason: HintSkip): HintDecision => ({ action: "none", reason });

  const candidate = hintCandidate(input.lookup);
  if (!candidate.ok) return none(candidate.reason);
  if (input.restricted === null) return none("restriction_unknown");
  if (input.restricted) return none("restricted");

  const signIn = typeof input.signInEmail === "string" ? input.signInEmail : "";
  if (!signIn.trim()) return none("no_sign_in_address");
  // The reset email already went to this inbox, or should have: a note
  // telling someone to use the address they just typed would be nonsense.
  if (canonical(signIn) === canonical(input.typed)) return none("same_address");

  const masked = maskSignInEmail(signIn);
  if (!masked) return none("unmaskable");
  return { action: "send", userId: candidate.userId, masked };
}

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

export const SIGNIN_HINT_SUBJECT = "Your Vibe sign-in email";

export type SigninHintEmail = { subject: string; text: string; html: string };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The whole email, for a school inbox or a personal one.
 *
 * School inboxes are Microsoft 365, which holds a message from a small
 * sender for minutes when it has anything to open (S75). So this is the
 * shape of the code emails: a few lines of system-font text, nothing to tap,
 * nothing fetched, and no address in it but the masked one. Keep it this
 * small.
 *
 * Throws when `masked` is not a masked address: a programming error, the
 * same as a code email given something that is not digits.
 */
export function signinHintEmail(masked: string): SigninHintEmail {
  if (!isMaskedSignInEmail(masked)) {
    throw new Error("The sign-in note needs a masked address.");
  }
  const asked =
    "Someone asked to reset the password of the Vibe account that uses this email address.";
  const different = "That account signs in with a different email:";
  const how =
    'To reset the password, open Vibe, tap "Forgot?" on the sign-in page and type that email in full.';
  const ignore = "If this wasn't you, ignore this email. Nothing has changed.";

  const paragraph = (words: string, style = "margin:0 0 16px;") =>
    `<p style="${style}">${escapeHtml(words)}</p>`;

  return {
    subject: SIGNIN_HINT_SUBJECT,
    text: [asked, "", `${different} ${masked}`, "", how, "", ignore].join("\n"),
    html:
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${SIGNIN_HINT_SUBJECT}</title></head>` +
      `<body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#1c1c1e;">` +
      paragraph(asked) +
      paragraph(different, "margin:0 0 4px;") +
      paragraph(masked, "margin:0 0 16px;font-weight:700;") +
      paragraph(how) +
      paragraph(ignore, "margin:0;color:#5a564f;font-size:14px;line-height:21px;") +
      `</body></html>`,
  };
}
