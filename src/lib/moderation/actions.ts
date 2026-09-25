import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { stripeKeyLivemode } from "@/lib/billing/config";
import { billingCustomerForUser, forgetStripeCustomer } from "@/lib/billing/customers";
import { getStripe, isStripeResourceMissing, logBillingError } from "@/lib/billing/stripe";
import { isMissingPushSchema, warnMissingPushSchemaOnce } from "@/lib/push/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { isRestrictionPepperConfigured, restrictionIdentityKey } from "./access";
import { canonicalIdentity, canonicalSchoolIdentity } from "./identity";

/**
 * Suspend, ban and lift (plan §Admin API). The admin routes decide WHO may do
 * it and whether the request makes sense; everything a restriction actually
 * consists of happens here, once.
 *
 * THREE THINGS MAKE A RESTRICTION, AND ONLY THE FIRST ENFORCES ANYTHING:
 *   1. the `account_restrictions` row(s) — the source of truth. Every gate
 *      reads it (`getActiveRestriction`), the SQL helpers read it, and the
 *      school-email routes read it by identity key. Written FIRST.
 *   2. `app_metadata.restriction` — a MIRROR the proxy reads instead of the
 *      database, because src/proxy.ts must not query it on every request. It
 *      enforces nothing: the row still refuses every write without it. What a
 *      missing mirror costs is the NOTICE — since a ban no longer stops
 *      sign-in, this copy is the only thing that puts /account/suspended in
 *      front of the student. Without it they browse a normal-looking app and
 *      collect opaque 403s with nothing saying what happened, so the write is
 *      retried once before it is reported incomplete.
 *   3. Stripe teardown (bans only) — Franky's decision 7: a ban stops Vibe+,
 *      with no refund. A suspension leaves billing alone.
 *
 * A BAN DOES NOT STOP SIGN-IN (Franky, 2026-09-22). GoTrue's own `ban_duration`
 * is deliberately never set here, for a ban or a suspension. A banned student
 * signs in the way they always did and every page is /account/suspended: they
 * can read what happened, write to the appeal address, and delete their own
 * account and everything in it themselves. Locking them out of the door would
 * leave their data sitting here with no way for them to reach it.
 *
 * What makes a ban STICK is the row keyed on the scrambled school email. That
 * key is what school-email verification tests, so deleting the account and
 * signing up again cannot re-verify the same address — the person is not shut
 * out, the school identity is.
 *
 * BOTH RESTRICTING AND LIFTING CLEAR GoTrue's ban, unconditionally, every
 * time. Nothing in Vibe has ever set one, so the only way an account carries
 * one is Franky setting it by hand in the Supabase dashboard — which leaves no
 * `account_restrictions` row, so the restrict route sees a clean account and
 * lets the moderator ban it properly. Without the clear below, that student
 * would be restricted AND locked out of the one page this decision exists to
 * show them. One admin write makes the decision hold whatever state the
 * account arrived in.
 *
 * SO A FAILURE AFTER STEP 1 IS NOT A ROLLBACK. If the mirror or the ban call
 * fails, the student IS restricted — the row says so and every gate obeys it.
 * Undoing the row to "keep things consistent" would un-restrict someone
 * because a second system hiccuped. Those steps come back in `incomplete` so
 * the admin screen can name the one to retry.
 *
 * NOBODY IS SIGNED OUT, AND NOTHING WAITS FOR A TOKEN TO EXPIRE. The session a
 * restricted student is holding keeps working, so what stops them writing has
 * to be the restriction itself, read on every request: the proxy (the mirror
 * above), the gates in access.ts on every write route, and the policy ANDs in
 * 20260923090000_moderation_foundation.sql for anyone talking to PostgREST
 * directly. Those three are the wall; the mirror is only the fast path.
 *
 * NEVER LOG AN EMAIL. Addresses come in here (they are what the identity key
 * is made of) and none of them reaches a log line, a thrown message or a
 * `moderation_actions` row — only the keyed hash is stored, and only ids and
 * counts are printed.
 */

const LOG = "[moderation.actions]";

/** How GoTrue is told an account is not banned. Nothing here ever sets one. */
const LIFT_BAN_DURATION = "none";

/** `account_restrictions.note`'s CHECK caps it at 2000 characters. */
const NOTE_MAX = 2000;

const DAY_MS = 86_400_000;

/**
 * The steps that can fail without un-restricting anyone. `auth_ban` is always
 * a ban being TAKEN OFF, never put on — restricting and lifting both clear it
 * — so an admin screen showing it should say "couldn't reopen sign-in", not
 * "couldn't ban".
 */
export type RestrictionStep = "app_metadata" | "auth_ban" | "billing";

export type RestrictionFailureCode =
  /** No RESTRICTION_PEPPER, or the moderation tables aren't applied yet. 503. */
  | "not_configured"
  /** No such account. 404. */
  | "not_found"
  /** The account has no address to key a restriction on. */
  | "no_identity"
  /** The row write itself failed: nothing was applied. */
  | "request_failed";

export type RestrictionFailure = { ok: false; code: RestrictionFailureCode; error: string };

export type RestrictResult =
  | { ok: true; restrictionId: string; endsAt: string | null; incomplete: RestrictionStep[] }
  | RestrictionFailure;

export type LiftResult =
  | { ok: true; lifted: number; incomplete: RestrictionStep[] }
  | RestrictionFailure;

const fail = (code: RestrictionFailureCode, error: string): RestrictionFailure => ({
  ok: false,
  code,
  error,
});

/**
 * Postgres / PostgREST for "that table does not exist" — the matcher from
 * src/lib/premium/require-plus.ts:42-56, copied the way customers.ts and
 * access.ts copy it, because neither exports it.
 *
 * Code ships before the migration (plan §Database), so between the two deploys
 * `account_restrictions` isn't there. For a READ that means "nobody is
 * restricted" (access.ts). For a WRITE it means the admin cannot restrict
 * anyone yet, which is a 503 and a sentence saying so — never a silent success.
 */
function isMissingStore(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("could not find the table")) return true;
  return message.includes("relation") && message.includes("does not exist");
}

const NOT_CONFIGURED =
  "Restrictions aren't set up on this deploy yet. Nothing was changed.";

type AccountRow = { email: string | null; school_email: string | null };

type IdentityKey = { identity_key: string; key_kind: "school" | "personal" };

/**
 * The keys this account's restriction is filed under.
 *
 * The SCHOOL key is the one that matters: it is what school-email verification
 * tests, so deleting the account and signing up again cannot re-verify the same
 * address. The PERSONAL key is EVIDENCE ONLY in v1 and nothing tests it —
 * sign-up runs from the browser straight to GoTrue
 * (src/lib/supabase/browser.ts, src/app/auth/signup/page.tsx), so no Vibe route
 * ever sees an account being created and nothing can refuse a banned personal
 * address there. The admin screen must not imply otherwise.
 *
 * An account whose login address IS their school address yields one key, not
 * two: the school kind wins, because that is the one with teeth.
 */
function identityKeysFor(row: AccountRow): IdentityKey[] {
  const keys: IdentityKey[] = [];
  const seen = new Set<string>();

  const add = (canonical: string | null, kind: "school" | "personal") => {
    if (!canonical) return;
    const identity_key = restrictionIdentityKey(canonical);
    if (seen.has(identity_key)) return;
    seen.add(identity_key);
    keys.push({ identity_key, key_kind: kind });
  };

  add(row.school_email ? canonicalSchoolIdentity(row.school_email) : null, "school");
  add(row.email ? canonicalIdentity(row.email) : null, "personal");
  return keys;
}

/**
 * Write the proxy's copy of the restriction, or clear it (`restriction: null`).
 *
 * Only the service role can write `app_metadata`, and `getUser()` returns it
 * fresh on every request, so src/proxy.ts can redirect a restricted student
 * with no database read. It stores the END DATE as well as the kind, because
 * the proxy compares that date to now itself: a suspension that has run out
 * frees the student even if nothing ever came back to clear the mirror.
 *
 * TRIED TWICE. This is the only thing that puts the notice in front of a
 * banned student (header, step 2) and the only thing that stops sending a
 * lifted one back to it, and the failure worth another go is a dropped socket
 * on one request. Immediately, with no wait: a moderator is holding the screen,
 * and a GoTrue that is properly down will fail the second call just as fast.
 *
 * Returns false when both tries fail, and the caller records `app_metadata` in
 * `incomplete`. It never throws and never undoes the row.
 */
async function mirrorToAuth(
  service: SupabaseClient,
  userId: string,
  restriction: { kind: string; ends_at: string | null } | null,
): Promise<boolean> {
  const write = async (): Promise<boolean> => {
    try {
      const { error } = await service.auth.admin.updateUserById(userId, {
        app_metadata: { restriction },
      });
      if (error) {
        console.error(`${LOG} app_metadata mirror failed`, error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`${LOG} app_metadata mirror threw`, err instanceof Error ? err.message : err);
      return false;
    }
  };
  return (await write()) || (await write());
}

/**
 * Take GoTrue's own ban off an account. There is no other half to this: no
 * restriction sets one (see the header — a banned student has to be able to
 * sign in to read the notice, appeal and delete their own account).
 *
 * It runs on EVERY restrict and EVERY lift, whatever the kind, and even when a
 * lift lifted nothing. An account can only be carrying GoTrue's ban because
 * somebody set it by hand in the Supabase dashboard, and a hand-set ban leaves
 * no row for anything here to notice — so the only safe assumption is that one
 * might be there, and the only cost of being wrong is one admin write that
 * changes nothing. Skipping it on a restrict bans someone out of the notice;
 * skipping it on a lift tells someone they're free while sign-in still answers
 * `user_banned`. It is also what heals a half-lift (row lifted, ban left on).
 */
async function clearAuthBan(service: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { error } = await service.auth.admin.updateUserById(userId, {
      ban_duration: LIFT_BAN_DURATION,
    });
    if (error) {
      console.error(`${LOG} ban_duration failed`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${LOG} ban_duration threw`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Delete every `push_devices` row the restricted student has (wave 3′a batch
 * D). The dispatcher already skips a restricted recipient
 * (src/lib/push/dispatch.ts), so this is the second lock, not the first: no
 * phone stays on file for an account that can't use Vibe. It runs for a
 * suspension too, and `liftRestriction` needs nothing back — the student's
 * devices register again the next time they open the app.
 *
 * Never throws and never fails the restriction: the row above is already
 * written. A missing table (code ships before the migration) is nothing to
 * delete; any other error is logged by code only, never with an address.
 */
async function forgetPushDevices(service: SupabaseClient, userId: string): Promise<void> {
  try {
    const { error } = await service.from("push_devices").delete().eq("user_id", userId);
    if (!error) return;
    if (isMissingPushSchema(error)) warnMissingPushSchemaOnce("moderation.actions");
    else console.error(`${LOG} push devices`, error.code);
  } catch (err) {
    console.error(`${LOG} push devices`, err instanceof Error ? err.name : "unknown");
  }
}

/**
 * A ban stops Vibe+ (Franky's decision 7, no refund). Same sequence as account
 * deletion (src/app/api/me/route.ts:184-217), INCLUDING the livemode guard:
 * deleting a customer cancels every subscription it has, and doing that
 * against the wrong mode either fails loudly or silently leaves a live
 * subscription charging a banned student.
 *
 * Unlike deletion this is NOT allowed to stop the action — the row is already
 * written and the student is already banned — so a failure comes back false
 * and the admin is told to retry the billing step.
 *
 * The mapping row is dropped afterwards (the account still exists here, unlike
 * deletion), so a later re-subscribe makes a fresh customer instead of reusing
 * a deleted one.
 */
async function stopVibePlusForBan(userId: string): Promise<boolean> {
  let customer: Awaited<ReturnType<typeof billingCustomerForUser>>;
  try {
    customer = await billingCustomerForUser(userId);
  } catch (e) {
    logBillingError("moderation.ban: customer lookup", {}, e);
    return false;
  }
  // No customer, or no billing tables on this deploy: nothing is being charged.
  if (!customer) return true;

  const stripe = getStripe();
  const keyLivemode = stripeKeyLivemode();
  if (!stripe || customer.livemode !== keyLivemode) {
    // A TEST customer we can't reach only ever paid with test cards, so no real
    // money is moving; a LIVE one we can't reach is money, and that is a retry.
    if (!customer.livemode) return true;
    console.error(`${LOG} no live Stripe key for this live customer`, {
      customerLivemode: customer.livemode,
      keyLivemode,
    });
    return false;
  }

  try {
    await stripe.customers.del(customer.customerId);
  } catch (e) {
    // Already deleted (a retry, or by hand in the Dashboard): its subscriptions
    // went with it, which is the outcome we wanted.
    if (!isStripeResourceMissing(e)) {
      logBillingError("moderation.ban: customers.del", {}, e);
      return false;
    }
  }

  try {
    await forgetStripeCustomer(customer.customerId);
  } catch (e) {
    // The charging has stopped, which was the point. A stale mapping row heals
    // itself: getOrCreateStripeCustomer already replaces a deleted customer.
    logBillingError("moderation.ban: forget mapping", {}, e);
  }
  return true;
}

export type RestrictArgs = {
  userId: string;
  kind: "suspension" | "ban";
  /** 1-365 for a suspension; null for a ban, which never ends. */
  days: number | null;
  reasonCode: string;
  /** Private to admins. Never shown to the student. */
  note: string | null;
  /** The admin doing it. */
  actorId: string;
};

/**
 * Suspend or ban an account.
 *
 * FAILS CLOSED ON THE PEPPER. Without RESTRICTION_PEPPER there is no identity
 * key, and a restriction row keyed on nothing is worse than none: it looks
 * like a ban on the screen and cannot be reproduced when the same student
 * comes back with the same school email. The admin is told it isn't set up.
 * (RESTRICTION_PEPPER does not exist in this project today. It has to be in
 * .env.development.local for local acceptance and in Vercel BEFORE the admin
 * routes ship, or this route is dead in production. It can never be rotated —
 * see the header of identity.ts.)
 *
 * The caller checks that the target exists, is not the admin themselves and is
 * not another admin, and writes the `moderation_actions` row afterwards.
 */
export async function restrictUser(args: RestrictArgs): Promise<RestrictResult> {
  if (!isRestrictionPepperConfigured()) return fail("not_configured", NOT_CONFIGURED);
  if (args.kind === "suspension" && !(args.days && args.days > 0)) {
    // The table's own CHECK says a suspension must have an end date, so this
    // would be refused anyway — caught here with a sentence instead of a 23514.
    return fail("request_failed", "A suspension needs a number of days.");
  }

  const service = createSupabaseServiceClient();
  const { data: account, error: accountErr } = await service
    .from("users")
    .select("email, school_email")
    .eq("id", args.userId)
    .maybeSingle();
  if (accountErr) {
    console.error(`${LOG} account read`, accountErr.message);
    return fail("request_failed", "Request failed");
  }
  if (!account) return fail("not_found", "Not found");

  let keys: IdentityKey[];
  try {
    keys = identityKeysFor(account as AccountRow);
  } catch (err) {
    // restrictionIdentityKey throws RestrictionPepperError, which the guard
    // above already rules out, so anything here is a malformed canonical form.
    console.error(`${LOG} identity key`, err instanceof Error ? err.message : err);
    return fail("request_failed", "Request failed");
  }
  if (keys.length === 0) {
    return fail("no_identity", "That account has no email to key a restriction on.");
  }

  const startsAt = new Date();
  const endsAt =
    args.kind === "suspension"
      ? new Date(startsAt.getTime() + (args.days as number) * DAY_MS).toISOString()
      : null;

  // STEP 1, the one that enforces. Everything below is a mirror of it.
  const { data: inserted, error: insertErr } = await service
    .from("account_restrictions")
    .insert(
      keys.map((k) => ({
        ...k,
        user_id: args.userId,
        kind: args.kind,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt,
        reason_code: args.reasonCode,
        note: args.note ? args.note.slice(0, NOTE_MAX) : null,
        created_by: args.actorId,
      })),
    )
    .select("id, key_kind");
  if (insertErr) {
    if (isMissingStore(insertErr)) return fail("not_configured", NOT_CONFIGURED);
    console.error(`${LOG} restriction insert`, insertErr.message);
    return fail("request_failed", "Request failed");
  }

  const rows = (inserted ?? []) as Array<{ id: string; key_kind: string }>;
  const primary = rows.find((r) => r.key_kind === "school") ?? rows[0];
  if (!primary) {
    console.error(`${LOG} restriction insert returned no row`);
    return fail("request_failed", "Request failed");
  }

  const incomplete: RestrictionStep[] = [];
  if (!(await mirrorToAuth(service, args.userId, { kind: args.kind, ends_at: endsAt }))) {
    incomplete.push("app_metadata");
  }
  // Sign-in has to be OPEN for the student we just restricted, so take off any
  // GoTrue ban the account is carrying. Nothing here ever sets one; what does
  // is somebody banning by hand in the Supabase dashboard, and that leaves no
  // restriction row — so the account looks clean to the restrict route and gets
  // restricted properly, on top of a lockout nobody remembers. Unconditional
  // rather than clever: an account that has no ban costs one admin write.
  if (!(await clearAuthBan(service, args.userId))) incomplete.push("auth_ban");
  // Forget the student's push devices. Not a RestrictionStep: it enforces
  // nothing (the dispatcher already skips a restricted recipient) and never
  // fails the restriction.
  await forgetPushDevices(service, args.userId);
  // A ban stops the money and nothing else about the account: sign-in stays
  // open on purpose, so the row above plus the proxy are the whole enforcement.
  if (args.kind === "ban") {
    if (!(await stopVibePlusForBan(args.userId))) incomplete.push("billing");
  }

  return { ok: true, restrictionId: primary.id, endsAt, incomplete };
}

/**
 * Add the admin's lift note to the private note already on the row, so the
 * whole story sits where an appeal gets read: why it happened, then why it
 * ended. `account_restrictions` has no separate column for it and
 * `moderation_actions` records only that a note was written.
 *
 * If the combined text would break the column's 2000-character CHECK the
 * ORIGINAL is kept untouched: the reason someone was suspended is worth more
 * than the sentence about letting them back in.
 */
function withLiftNote(existing: string | null, note: string | null): string | null {
  if (!note) return existing;
  const line = `Lifted: ${note}`;
  const merged = existing ? `${existing}\n\n${line}` : line;
  return merged.length <= NOTE_MAX ? merged : existing;
}

export type LiftArgs = { userId: string; actorId: string; note: string | null };

/**
 * End every restriction in force on an account, early.
 *
 * IDEMPOTENT: lifting nothing is a success with `lifted: 0`. A suspension that
 * has already run out is left alone as history — it stopped biting on its own
 * the moment `ends_at` passed, because every check compares that date to now.
 *
 * DOES NOT NEED THE PEPPER, deliberately. Restricting fails closed without it;
 * letting somebody back in must not. This looks rows up by `user_id`, which is
 * on every row, so a missing secret can never strand a student.
 *
 * NOTHING IS UNDONE BEYOND THE RESTRICTION. A ban deleted the Stripe customer
 * with no refund; lifting it does not bring a subscription back, and the
 * student re-subscribes if they want it.
 */
export async function liftRestriction(args: LiftArgs): Promise<LiftResult> {
  const service = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await service
    .from("account_restrictions")
    .select("id, note")
    .eq("user_id", args.userId)
    .is("lifted_at", null)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  if (error) {
    if (isMissingStore(error)) return fail("not_configured", NOT_CONFIGURED);
    console.error(`${LOG} lift read`, error.message);
    return fail("request_failed", "Request failed");
  }

  const rows = (data ?? []) as Array<{ id: string; note: string | null }>;
  let lifted = 0;
  for (const row of rows) {
    // `.is("lifted_at", null)` again: two admins hitting lift at the same
    // moment both read the row, and only one of them actually changes it.
    const { data: updated, error: updateErr } = await service
      .from("account_restrictions")
      .update({
        lifted_at: new Date().toISOString(),
        lifted_by: args.actorId,
        note: withLiftNote(row.note, args.note),
      })
      .eq("id", row.id)
      .is("lifted_at", null)
      .select("id");
    if (updateErr) {
      console.error(`${LOG} lift update`, updateErr.message);
      return fail("request_failed", "Request failed");
    }
    lifted += (updated ?? []).length;
  }

  const incomplete: RestrictionStep[] = [];
  // Cleared even when nothing was lifted: a mirror left behind after the rows
  // are gone is the one state that keeps sending a free student to
  // /account/suspended, and clearing it costs one call.
  if (!(await mirrorToAuth(service, args.userId, null))) incomplete.push("app_metadata");
  // Same reasoning, one layer down: nothing here sets GoTrue's ban, but an
  // account can be carrying one set by hand in the Supabase dashboard, and
  // this is the call that takes it off. Unconditional, and on every lift —
  // telling someone they're free while sign-in answers `user_banned` is the
  // worst version of this page.
  if (!(await clearAuthBan(service, args.userId))) incomplete.push("auth_ban");

  return { ok: true, lifted, incomplete };
}

/** Every kind of thing a moderator can do, as stored in `moderation_actions.action`. */
export type ModerationAction =
  | "report_dismiss"
  | "report_action"
  | "post_remove"
  | "post_restore"
  | "comment_remove"
  | "comment_restore"
  | "message_remove"
  | "message_restore"
  | "org_hide"
  | "org_unhide"
  | "org_verify"
  | "org_unverify"
  | "user_suspend"
  | "user_ban"
  | "user_lift";

export type ModerationLogEntry = {
  actorId: string;
  action: ModerationAction;
  /** 'post' | 'comment' | 'message' | 'user' | 'org' | 'event' | 'channel' | 'report'. */
  targetType: string;
  /** Always the row's UUID — never a handle. Handles move; ids don't. */
  targetId: string;
  reportId?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Append one row to the moderation log.
 *
 * WRITTEN AFTER THE EFFECT, AND NEVER ALLOWED TO UNDO IT. By the time this
 * runs the post is already removed or the student is already suspended, so a
 * failed INSERT costs a line in the log, not the action. It comes back `false`
 * so the admin screen can say the trail is incomplete out loud instead of
 * pretending it isn't.
 *
 * `moderation_actions` has no client grants and no policies; only the service
 * role reaches it, and a trigger refuses UPDATE and DELETE — the log is what
 * an appeal is read against, so nothing may quietly edit it later.
 *
 * NOTHING PERSONAL IN `meta`. Ids, counts and flags only: never an email,
 * never a token, never the reported text (memory security model).
 */
export async function logModerationAction(
  service: SupabaseClient,
  entry: ModerationLogEntry,
): Promise<boolean> {
  try {
    const { error } = await service.from("moderation_actions").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      report_id: entry.reportId ?? null,
      // `reason` is NOT NULL DEFAULT '' in the migration: an action with no
      // sentence attached stores an empty one rather than a null.
      reason: entry.reason ?? "",
      meta: entry.meta ?? {},
    });
    if (error) {
      console.error(`${LOG} log insert`, entry.action, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${LOG} log insert threw`, entry.action, err instanceof Error ? err.message : err);
    return false;
  }
}

/** The three things a moderator can take down, and the table each one lives in. */
export type ModerationContentType = "post" | "comment" | "message";

const CONTENT_TABLES: Readonly<Record<ModerationContentType, string>> = {
  post: "posts",
  comment: "post_comments",
  message: "messages",
};

/** `removed_reason` is shown to the author, so it is a sentence, not an essay. */
const REASON_MAX = 500;

export type ContentFailureCode = "not_found" | "request_failed";

export type RemoveContentResult =
  | {
      ok: true;
      /** False when it was already down — the first removal's reason stands. */
      changed: boolean;
      alreadyRemoved: boolean;
      resolvedReports: number;
      logged: boolean;
    }
  | { ok: false; code: ContentFailureCode; error: string };

export type RestoreContentResult =
  | { ok: true; changed: boolean; logged: boolean }
  | { ok: false; code: ContentFailureCode; error: string };

/**
 * Close the reports a removal answers, as `actioned`.
 *
 * ALWAYS SCOPED TO THIS CONTENT, even when the screen names ids: a screen that
 * sent the wrong ones would otherwise close reports about something else on the
 * strength of an unrelated removal. No ids named = every report still open on
 * this piece of content, because leaving them open puts the same decision back
 * in the queue tomorrow.
 *
 * Best-effort: the content is already down by the time this runs, so a failure
 * costs a stale queue row, not the removal.
 *
 * Returns THE IDS IT REALLY CHANGED, not a count. The scoping above means the
 * ids a screen names and the ids that were closed are not the same list, and
 * the log row below is built from one of them — `moderation_actions` refuses
 * UPDATE and DELETE, so a row naming a report this action never touched is the
 * one kind of wrong entry nobody can ever correct.
 */
async function closeReportsForContent(
  service: SupabaseClient,
  args: { actorId: string; type: string; id: string; reportIds: string[]; note: string },
): Promise<string[]> {
  try {
    let query = service
      .from("reports")
      .update({
        status: "actioned",
        resolved_by: args.actorId,
        resolved_at: new Date().toISOString(),
        resolution_note: args.note,
      })
      .eq("status", "open")
      .eq("target_type", args.type)
      .eq("target_id", args.id);
    if (args.reportIds.length > 0) query = query.in("id", args.reportIds);
    const { data, error } = await query.select("id");
    if (error) {
      console.error(`${LOG} close reports`, error.message);
      return [];
    }
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  } catch (err) {
    console.error(`${LOG} close reports threw`, err instanceof Error ? err.message : err);
    return [];
  }
}

export type RemoveContentArgs = {
  type: ModerationContentType;
  id: string;
  /** Shown to the author. Write it the way you would say it to them. */
  reason: string;
  actorId: string;
  /** The reports this answers. Empty = every open report on this content. */
  reportIds?: string[];
};

/**
 * Take a post, comment or message down (Franky's decision 2).
 *
 * CHANGE BOTH TOGETHER. POST /api/admin/content/remove does not call this — it
 * carries its own copy of the same steps inline, and /restore mirrors
 * `restoreContent` the same way. Nothing calls these two today, so the routes
 * are the live ones; this pair is here for the next caller (a sweep, a job, a
 * second surface). They agree field for field as of the S64 integration pass,
 * including every key written into `moderation_actions.meta`. A change to one
 * that misses the other is a log row nobody can correct: that table refuses
 * UPDATE and DELETE. Better still, when a second caller does arrive, move the
 * route onto this pair and delete the inline copy.
 *
 * SOFT REMOVAL, ALWAYS. The row stays, with `removed_at`, `removed_by` and
 * `removed_reason` set: it disappears for everyone else, its author sees
 * "Removed by Vibe moderators" and the reason, and the evidence a report points
 * at is still there if the student appeals. Nothing here deletes anything.
 *
 * SERVICE ROLE, AND NO `removed_at IS NULL` FILTER ON THE READ: the queue has
 * to be able to act on a row the policies are already hiding.
 *
 * IDEMPOTENT. Removing something already removed is a success with
 * `changed: false` — the first removal's reason and timestamp are the true ones
 * — and it still closes any report left open.
 *
 * ORDER: write, then reports, then one log row. The log never undoes the effect.
 */
export async function removeContent(args: RemoveContentArgs): Promise<RemoveContentResult> {
  const table = CONTENT_TABLES[args.type];
  // A caller from plain JavaScript can still hand us anything; the type only
  // binds TypeScript. An unknown kind is a bug, not a 404.
  if (!table) return { ok: false, code: "request_failed", error: "Request failed" };
  const reason = args.reason.trim().slice(0, REASON_MAX);
  const reportIds = [...new Set(args.reportIds ?? [])];

  const service = createSupabaseServiceClient();
  const { data: row, error: readErr } = await service
    .from(table)
    .select("id, user_id, removed_at")
    .eq("id", args.id)
    .maybeSingle();
  if (readErr) {
    console.error(`${LOG} remove read`, args.type, readErr.message);
    return { ok: false, code: "request_failed", error: "Request failed" };
  }
  if (!row) return { ok: false, code: "not_found", error: "Not found" };

  const existing = row as { user_id: string | null; removed_at: string | null };
  const alreadyRemoved = Boolean(existing.removed_at);
  let changed = false;
  if (!alreadyRemoved) {
    const { data: updated, error: updateErr } = await service
      .from(table)
      .update({
        removed_at: new Date().toISOString(),
        removed_by: args.actorId,
        removed_reason: reason,
      })
      .eq("id", args.id)
      // Two admins on the same row: only one of them actually removes it.
      .is("removed_at", null)
      .select("id");
    if (updateErr) {
      console.error(`${LOG} remove update`, args.type, updateErr.message);
      return { ok: false, code: "request_failed", error: "Request failed" };
    }
    changed = (updated ?? []).length > 0;
  }

  const closedIds = await closeReportsForContent(service, {
    actorId: args.actorId,
    type: args.type,
    id: args.id,
    reportIds,
    note: reason,
  });
  const resolvedReports = closedIds.length;

  // Nothing happened at all (already down, no report left open) writes no log
  // row: a queue refreshed twice should not read as two removals.
  let logged = true;
  if (changed || resolvedReports > 0) {
    logged = await logModerationAction(service, {
      actorId: args.actorId,
      action: `${args.type}_remove` as ModerationAction,
      targetType: args.type,
      targetId: args.id,
      // A report this removal ACTUALLY closed, never one the caller merely
      // named — the scoping in closeReportsForContent refuses ids belonging to
      // other content on purpose.
      reportId: closedIds[0] ?? null,
      reason,
      meta: {
        changed,
        already_removed: alreadyRemoved,
        resolved_reports: resolvedReports,
        resolved_report_ids: closedIds,
        author_id: existing.user_id ?? null,
      },
    });
  }

  return { ok: true, changed, alreadyRemoved, resolvedReports, logged };
}

export type RestoreContentArgs = {
  type: ModerationContentType;
  id: string;
  actorId: string;
  /** For the log only — nobody is shown this one, so it is optional. */
  reason?: string | null;
};

/**
 * Put removed content back. Clears `removed_at`, `removed_by` and
 * `removed_reason`, so the post, comment or message is ordinary again and the
 * author's "Removed by Vibe moderators" notice goes away.
 *
 * IT DOES NOT REOPEN THE REPORTS. Restoring says the content was fine; the
 * reports about it were read and answered, and dragging them back into the
 * queue asks the same question twice. A moderator who wants them open again
 * says so on the reports themselves.
 *
 * IDEMPOTENT: restoring something that is not removed is a success with
 * `changed: false`, so a double tap on a slow connection is not an error.
 */
export async function restoreContent(args: RestoreContentArgs): Promise<RestoreContentResult> {
  const table = CONTENT_TABLES[args.type];
  if (!table) return { ok: false, code: "request_failed", error: "Request failed" };
  const reason = (args.reason ?? "").trim().slice(0, REASON_MAX);

  const service = createSupabaseServiceClient();
  // Service role: a removed row is invisible to every policy in the app,
  // including a platform admin's own session.
  const { data: row, error: readErr } = await service
    .from(table)
    .select("id, user_id, removed_at")
    .eq("id", args.id)
    .maybeSingle();
  if (readErr) {
    console.error(`${LOG} restore read`, args.type, readErr.message);
    return { ok: false, code: "request_failed", error: "Request failed" };
  }
  if (!row) return { ok: false, code: "not_found", error: "Not found" };

  const existing = row as { user_id: string | null; removed_at: string | null };
  if (!existing.removed_at) return { ok: true, changed: false, logged: true };

  const { data: updated, error: updateErr } = await service
    .from(table)
    .update({ removed_at: null, removed_by: null, removed_reason: null })
    .eq("id", args.id)
    .not("removed_at", "is", null)
    .select("id");
  if (updateErr) {
    console.error(`${LOG} restore update`, args.type, updateErr.message);
    return { ok: false, code: "request_failed", error: "Request failed" };
  }
  const changed = (updated ?? []).length > 0;
  if (!changed) return { ok: true, changed: false, logged: true };

  const logged = await logModerationAction(service, {
    actorId: args.actorId,
    action: `${args.type}_restore` as ModerationAction,
    targetType: args.type,
    targetId: args.id,
    reason,
    meta: { author_id: existing.user_id ?? null },
  });

  return { ok: true, changed, logged };
}
