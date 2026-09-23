import "server-only";

import { NextResponse } from "next/server";

import { termsRequiredResponse } from "@/lib/legal/require-terms";
import { CONSENT_COLUMNS, hasRecordedConsent } from "@/lib/legal/terms";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { canonicalSchoolIdentity, isUsablePepper, restrictionIdentityKeyWith } from "./identity";

/**
 * The route gates for moderation (plan §Access helpers).
 *
 * Mirrors src/lib/legal/require-terms.ts and src/lib/premium/require-plus.ts:
 * a `*Response()` per refusal, and a `require*()` that returns the response to
 * send or `null` when the caller may proceed. Both read with the service
 * client, because the columns involved (consent, school_verified) and the
 * whole `account_restrictions` table are service-role only.
 *
 * TWO GATES, NOT ONE:
 * - `requireNotRestricted` — Terms on record and no restriction in force.
 *   Profile edits (onboarding has to keep working before verification), likes,
 *   follows, RSVPs, saves, views and REPORTS. An unverified student can report;
 *   a restricted one cannot.
 * - `requireCanPublish` — the above plus a verified school email. Posts,
 *   comments, reposts, messages, chat and event creation.
 * Blocks and mutes are gated by NEITHER, deliberately: a restricted student can
 * still protect themselves from someone.
 *
 * THESE ARE NOT THE ONLY LAYER, and the database ANDs are not either:
 * - Profile writes, chat and DM creation and the report route all run through
 *   `createSupabaseServiceClient()`, where RLS does not apply at all. For that
 *   traffic THESE HELPERS ARE THE ENFORCEMENT.
 * - The policy ANDs Batch A adds matter against a signed-in student calling
 *   PostgREST directly with the anon key — the attack
 *   supabase/migrations/20260922140000_hidden_club_content_rls.sql:6-22
 *   already documents — and they are the only thing covering the up-to-one-hour
 *   window where a banned student's existing JWT still works
 *   (supabase/config.toml:160, jwt_expiry = 3600).
 * Both layers, each for its own reason. Neither one alone is the boundary.
 */

export type RestrictionKind = "suspension" | "ban";

export type ActiveRestriction = {
  id: string;
  kind: RestrictionKind;
  /** Null for a ban: permanent. */
  ends_at: string | null;
  reason_code: string | null;
  starts_at: string;
};

/** The columns a gate and the suspended page need. `note` is private to admins. */
const RESTRICTION_COLUMNS = "id, kind, starts_at, ends_at, reason_code";

/**
 * Postgres / PostgREST for "that table does not exist" — the matcher from
 * src/lib/premium/require-plus.ts:42-56, copied the way
 * src/lib/billing/customers.ts:46-51 copies it, because neither exports it.
 *
 * WHY IT MATTERS HERE: the deploy order is code first, migration second (plan
 * §Database). Between the two, `account_restrictions` does not exist, and
 * "no restriction store yet" has to read as "nobody is restricted" — which is
 * exactly true — instead of 500ing every post, like and follow on the site.
 * Deliberately narrow: a missing COLUMN is a real fault and still reports itself.
 */
function isMissingRestrictionStore(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("could not find the table")) return true;
  return message.includes("relation") && message.includes("does not exist");
}

export type RestrictionLookup =
  | { ok: true; restriction: ActiveRestriction | null }
  | { ok: false; error: string };

/**
 * The restriction in force on an account right now, or null.
 *
 * In force = not lifted, started, and either permanent or not yet expired. An
 * expired suspension needs no job to clear it: it simply stops matching, the
 * same read-time expiry `isPlusActive` uses.
 *
 * Newest first, and a ban outranks a suspension of the same age, so an account
 * carrying both shows as banned.
 */
export async function getActiveRestriction(userId: string): Promise<RestrictionLookup> {
  const nowIso = new Date().toISOString();
  const { data, error } = await createSupabaseServiceClient()
    .from("account_restrictions")
    .select(RESTRICTION_COLUMNS)
    .eq("user_id", userId)
    .is("lifted_at", null)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingRestrictionStore(error)) return { ok: true, restriction: null };
    console.error("[moderation.access] restriction read", error.message);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as ActiveRestriction[];
  if (rows.length === 0) return { ok: true, restriction: null };
  const ban = rows.find((r) => r.kind === "ban");
  return { ok: true, restriction: ban ?? rows[0] };
}

/** The 403 for a restriction in force. `account_restricted` → /account/suspended. */
export function accountRestrictedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Your account is restricted", code: "account_restricted" },
    { status: 403 },
  );
}

/** The 403 for publishing without a verified school email. */
export function schoolEmailRequiredResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Verify your school email to post", code: "school_email_required" },
    { status: 403 },
  );
}

/**
 * The 422 the word filter returns. `field` names which input a multi-field
 * form should point at (name, bio, tagline). The matched word is NEVER
 * included: see src/lib/moderation/text-filter.ts.
 */
export function contentBlockedResponse(field?: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "That includes words that aren't allowed on Vibe",
      code: "content_blocked",
      ...(field ? { field } : {}),
    },
    { status: 422 },
  );
}

type AccessRow = { school_verified?: unknown };

type AccessState =
  | { ok: true; schoolVerified: boolean; restriction: ActiveRestriction | null }
  | { ok: false; response: NextResponse };

/**
 * One service-role read of `users` (consent columns + school_verified) plus one
 * restriction read. Both gates below share it, so neither costs more than the
 * other.
 *
 * ORDER OF REFUSALS: Terms, then restriction, then school email. A restricted
 * student must never be told to "verify your school email" — that sends them
 * into a flow that cannot help them and reads as the app hiding what happened.
 */
async function readAccess(userId: string): Promise<AccessState> {
  const failed = () => ({
    ok: false as const,
    response: NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 }),
  });

  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select(`${CONSENT_COLUMNS}, school_verified`)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[moderation.access] users read", error.message);
    return failed();
  }
  // The same 403 body require-terms.ts sends, from the same function: one
  // `terms_required` response, not two that can drift apart.
  if (!hasRecordedConsent(data)) return { ok: false, response: termsRequiredResponse() };

  const lookup = await getActiveRestriction(userId);
  // A restriction read that FAILED is not "no restriction": fail closed, the
  // way require-plus does, or a bad minute for the database un-bans everyone.
  if (!lookup.ok) return failed();
  if (lookup.restriction) return { ok: false, response: accountRestrictedResponse() };

  return {
    ok: true,
    schoolVerified: Boolean((data as AccessRow | null)?.school_verified),
    restriction: null,
  };
}

/**
 * Terms on record and no restriction in force. Returns the response to send,
 * or `null` when the caller may proceed.
 *
 * THE TERMS HALF IS EXACTLY `requireTermsAccepted` (src/lib/legal/require-terms.ts:27-38)
 * — same columns, same predicate, same 403 body. Any route swapping that call
 * for this one keeps the behaviour it had and gains the restriction check.
 * A route that had NO terms gate gains one: POST /api/me/follow is the case to
 * look at before migrating it.
 */
export async function requireNotRestricted(userId: string): Promise<NextResponse | null> {
  const state = await readAccess(userId);
  return state.ok ? null : state.response;
}

/**
 * The above AND a verified school email (Franky 2026-09-22 decision 4).
 * For posts, comments, reposts, messages, and chat and event creation.
 *
 * Six of twenty production accounts are unverified and none of them has ever
 * posted, commented or messaged, so this takes nothing away from anyone — it
 * closes the hole where a brand-new account with only a personal email can
 * publish, which is what makes a ban on a school email worth anything.
 */
export async function requireCanPublish(userId: string): Promise<NextResponse | null> {
  const state = await readAccess(userId);
  if (!state.ok) return state.response;
  return state.schoolVerified ? null : schoolEmailRequiredResponse();
}

/**
 * THE ONLY PLACE `RESTRICTION_PEPPER` IS READ. identity.ts stays pure so the
 * test runner can load it and so no client bundle can ever reach the secret;
 * this module supplies it.
 *
 * Throws `RestrictionPepperError` when the value is missing or shorter than 32
 * characters. Every caller that writes a restriction has to fail closed on
 * that and tell the admin restrictions aren't configured — a row keyed on a
 * weak or absent secret is worse than no row, because it looks like a ban and
 * cannot be reproduced.
 *
 * The value must be in Vercel BEFORE the admin routes ship, and it can never
 * be rotated: see the header of identity.ts.
 */
export function restrictionIdentityKey(canonical: string): string {
  return restrictionIdentityKeyWith(process.env.RESTRICTION_PEPPER, canonical);
}

/** True when a restriction can be keyed at all. */
export function isRestrictionPepperConfigured(): boolean {
  return isUsablePepper(process.env.RESTRICTION_PEPPER);
}

export type IdentityRestrictionCheck =
  | { ok: true; restricted: boolean }
  | { ok: false; reason: "unconfigured" | "unavailable" };

/**
 * Is this school address banned, whatever account is asking? The check that
 * makes a ban survive "delete the account and sign up again": the address is
 * the only thing that carries over, and only its keyed hash is stored.
 *
 * WITH NO PEPPER the answer depends on whether any school restriction exists:
 * none → nobody is banned, so verification proceeds; some → we cannot tell
 * which, so the caller must refuse (503). Never "allow because we couldn't
 * check".
 *
 * Callers: the school-email request and confirm routes (Batch D), which turn
 * `restricted: true` into 403 `school_email_restricted`.
 */
export async function restrictionForSchoolIdentity(
  email: string,
): Promise<IdentityRestrictionCheck> {
  const canonical = canonicalSchoolIdentity(email);
  // Not a school address at all: not something this check can answer, and the
  // allowlist has already refused it by the time anyone asks.
  if (!canonical) return { ok: true, restricted: false };

  const service = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const activeSchoolRows = () =>
    service
      .from("account_restrictions")
      .select("id")
      .eq("key_kind", "school")
      .is("lifted_at", null)
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`);

  if (!isRestrictionPepperConfigured()) {
    const { data, error } = await activeSchoolRows().limit(1);
    if (error) {
      if (isMissingRestrictionStore(error)) return { ok: true, restricted: false };
      console.error("[moderation.access] school identity probe", error.message);
      return { ok: false, reason: "unavailable" };
    }
    if ((data ?? []).length === 0) return { ok: true, restricted: false };
    return { ok: false, reason: "unconfigured" };
  }

  const { data, error } = await activeSchoolRows()
    .eq("identity_key", restrictionIdentityKey(canonical))
    .limit(1);
  if (error) {
    if (isMissingRestrictionStore(error)) return { ok: true, restricted: false };
    console.error("[moderation.access] school identity read", error.message);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, restricted: (data ?? []).length > 0 };
}

export type SchoolIdentityConflict =
  | { ok: true; takenBy: string | null }
  | { ok: false; error: string };

/**
 * Is this school address already verified on ANOTHER account, comparing
 * canonical form to canonical form? This is what closes the `+2` loophole:
 * `fracazar@iu.edu` and `fracazar+2@iu.edu` are one student, and until now
 * they were two legal rows.
 *
 * WHY THIS IS A SCAN AND NOT A LOOKUP: `users.school_email` holds whatever
 * `normalizeSchoolEmail` produced at verification time, protected by a plain
 * unique index (`users_school_email_key` on the raw text). There is no stored
 * canonical column and no expression index, so no single `.eq()` can answer
 * this. It reads every verified row and canonicalises each one in memory —
 * fine at 20 accounts, fine at a few thousand, and NOT fine forever.
 *
 * THE REAL FIX, when it is worth it, is a Batch A change, not a bigger loop
 * here: an IMMUTABLE SQL canonicaliser plus a unique expression index on it.
 * Note before proposing it that such an index can FAIL to build against
 * existing production rows if two accounts already hold the same canonical
 * address — check first, then decide who keeps it.
 *
 * `excludeUserId` is the account doing the verifying, so re-verifying your own
 * address is never a conflict. Fails closed: an error is not "free to take".
 */
export async function schoolIdentityConflict(
  email: string,
  excludeUserId: string,
): Promise<SchoolIdentityConflict> {
  const canonical = canonicalSchoolIdentity(email);
  if (!canonical) return { ok: true, takenBy: null };

  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select("id, school_email")
    .eq("school_verified", true)
    .not("school_email", "is", null)
    .neq("id", excludeUserId)
    .limit(5000);
  if (error) {
    console.error("[moderation.access] school identity scan", error.message);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as Array<{ id: string; school_email: string | null }>;
  for (const row of rows) {
    if (!row.school_email) continue;
    if (canonicalSchoolIdentity(row.school_email) === canonical) {
      return { ok: true, takenBy: row.id };
    }
  }
  return { ok: true, takenBy: null };
}
