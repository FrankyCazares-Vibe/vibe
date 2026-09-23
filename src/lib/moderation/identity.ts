/**
 * Restriction identity — pure helpers, no server-only import and no `@/`
 * import, so `node --test --experimental-strip-types` can load this file.
 *
 * WHY AN IDENTITY AT ALL (plan §Identity, Franky 2026-09-22 decision 1): a ban
 * has to survive the banned student deleting their account and signing up
 * again. Everything else Vibe stores hangs off `users.id`, which goes away
 * with the account, so a ban row is keyed on a KEYED HASH of the address
 * instead — never the address itself. `account_restrictions.identity_key`
 * holds that hash and nothing that can be read back into an email.
 *
 * THE SECRET IS NOT READ HERE. `restrictionIdentityKeyWith` takes the pepper
 * as an argument; `src/lib/moderation/access.ts` reads `RESTRICTION_PEPPER`
 * from the environment and is the only module that does. That keeps the secret
 * out of anything a client bundle could reach and keeps this file loadable by
 * the test runner.
 *
 * THE PEPPER CAN NEVER BE ROTATED. Rotating it re-keys every future hash and
 * orphans every `identity_key` already stored, which would quietly un-ban
 * everyone. There is no rotation story and none is planned; if one is ever
 * needed it means re-deriving keys from addresses Vibe deliberately does not
 * keep. Treat the value as permanent.
 */

import { createHmac } from "node:crypto";

import { schoolEmailHost, schoolIdentityDomainFor } from "../auth/school-email-domains";

/** Shortest pepper accepted. Below this the HMAC is not worth the ceremony. */
export const MIN_RESTRICTION_PEPPER_LENGTH = 32;

/**
 * Separates this use of the pepper from any other HMAC in the codebase, the
 * way `HASH_LABEL` does in src/lib/email/send-log-core.ts. Changing it has the
 * same effect as rotating the pepper, so it is frozen too.
 */
export const IDENTITY_KEY_LABEL = "restriction-identity-v1|";

/**
 * Thrown when `RESTRICTION_PEPPER` is missing or too short. A typed error, not
 * a string match: every caller that restricts an account has to fail closed on
 * it and tell the admin "restrictions aren't configured" rather than write a
 * row keyed on nothing.
 */
export class RestrictionPepperError extends Error {
  constructor(
    message = "RESTRICTION_PEPPER is not configured, so restrictions can't be keyed to an identity",
  ) {
    super(message);
    this.name = "RestrictionPepperError";
  }
}

/** True when `pepper` is long enough to key an identity hash with. */
export function isUsablePepper(pepper: string | null | undefined): boolean {
  return (pepper?.trim().length ?? 0) >= MIN_RESTRICTION_PEPPER_LENGTH;
}

/**
 * The canonical identity an address belongs to.
 *
 * For a SCHOOL address (the host folds into a school domain): lowercase, trim,
 * drop everything from the first `+` in the local part, and fold the host into
 * its school domain. `Fra.Cazar+2@MAIL.IU.EDU` → `fra.cazar@iu.edu`. That is
 * what makes "one student, one school email" true — today `x+1@iu.edu` and
 * `x@iu.edu` are two legal rows (users_school_email_key is a plain unique index
 * on the text), which is the `+2` loophole the bans research map found.
 *
 * For ANY OTHER address: lowercase and trim, and nothing else. A `+tag` on a
 * personal address is left exactly as typed, because Vibe has no idea whether
 * that provider treats tags as the same inbox, and guessing would merge two
 * unrelated people under one ban.
 *
 * Null when the address is malformed (no single `@`, empty local part,
 * non-ASCII or punycode host) — the same rules `schoolEmailHost` applies.
 *
 * Note the dot is NOT removed: Gmail ignores dots, IU and Purdue do not, and
 * this function has to be right for the school case first.
 */
export function canonicalIdentity(email: string): string | null {
  const host = schoolEmailHost(email);
  if (!host) return null;

  const local = email.trim().split("@")[0].toLowerCase();
  const schoolDomain = schoolIdentityDomainFor(email);
  if (!schoolDomain) return `${local}@${host}`;

  const untagged = local.split("+")[0];
  // "+tag@iu.edu" has nothing left to key on; treat it as malformed rather
  // than keying every tagged address on the same empty local part.
  if (!untagged) return null;
  return `${untagged}@${schoolDomain}`;
}

/**
 * The canonical identity when the address is a school address, else null.
 * This is what `key_kind = 'school'` rows are keyed on, and what the
 * school-email verification duplicate check compares.
 */
export function canonicalSchoolIdentity(email: string): string | null {
  if (!schoolIdentityDomainFor(email)) return null;
  return canonicalIdentity(email);
}

/**
 * HMAC-SHA256 of the canonical identity, hex. Stable: the same address always
 * gives the same key, and the key gives nothing back.
 *
 * Throws {@link RestrictionPepperError} when the pepper is missing or shorter
 * than {@link MIN_RESTRICTION_PEPPER_LENGTH}, and a plain Error when the
 * canonical form is empty — a caller that passes a raw address instead of a
 * canonical one has a bug, and hashing it anyway would store a key nothing
 * else can ever reproduce.
 */
export function restrictionIdentityKeyWith(
  pepper: string | null | undefined,
  canonical: string,
): string {
  if (!isUsablePepper(pepper)) throw new RestrictionPepperError();
  const value = canonical.trim();
  if (!value) throw new Error("restrictionIdentityKeyWith needs a canonical identity");
  return createHmac("sha256", (pepper as string).trim())
    .update(`${IDENTITY_KEY_LABEL}${value}`)
    .digest("hex");
}
