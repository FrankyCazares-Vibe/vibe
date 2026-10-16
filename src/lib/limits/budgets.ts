import { rateLimit, type RateLimitOptions, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Named per-account budgets for the signed-in actions that had no limit
 * (security report, Oct 8, rows 7-11; wave 3, Oct 15). One name, one limit
 * and one window, so two routes that share a key can never disagree: the
 * limiter's deny cache keys on all three.
 *
 * Every number sits well above normal use: a student who pins, mutes and
 * reacts all evening never meets one. They stop a script looping one
 * account. Views, typing, read marks and the check-in have no budget here
 * on purpose: a per-account count of those would be an hour-by-hour record
 * of when someone is on Vibe (Privacy Policy 3d). They are bounded in the
 * database instead.
 *
 * Windows divide the day (src/lib/rate-limit.ts refuses any other).
 */
export const BUDGETS = {
  /** Mute, dismiss a suggestion, decline an invite, small settings. */
  prefs: { limit: 120, windowSec: 600 },
  /** Accept, clear, decline, hide, pin, mute a thread; leave or remove a member. */
  threadSettings: { limit: 120, windowSec: 600 },
  /** Rename a group, change its photo. */
  threadEdit: { limit: 20, windowSec: 600 },
  /** Add or remove a reaction on a message. */
  react: { limit: 120, windowSec: 600 },
  /** Repost and un-repost. */
  repost: { limit: 30, windowSec: 600 },
  /** Block and unblock. */
  block: { limit: 30, windowSec: 600 },
  /** Mark named notifications read (not `{ all: true }`, which Otto sends on its own when opened). */
  markRead: { limit: 60, windowSec: 600 },
  /** Create an Otto reminder. */
  ottoReminderCreate: { limit: 60, windowSec: 3600 },
  /** Create a personal calendar event. */
  personalEventCreate: { limit: 60, windowSec: 3600 },
  /** Club officer actions: rooms, members, roles, invites. A chapter's setup takes 100+ calls. */
  orgOfficer: { limit: 300, windowSec: 600 },
  /** Subscribe to a club's public rooms. */
  orgSubscribe: { limit: 30, windowSec: 600 },
  /** Delete an account or a club. */
  bigDelete: { limit: 5, windowSec: 600 },
} as const satisfies Record<string, Pick<RateLimitOptions, "limit" | "windowSec">>;

export type BudgetName = keyof typeof BUDGETS;

/** The limiter key for a budget: `budget-<name>:<account id>`. */
export function budgetKey(budget: BudgetName, userId: string): string {
  return `budget-${budget}:${userId}`;
}

/** One count against an account's named budget. Lets through if the limiter can't count, as before. */
export function limitFor(budget: BudgetName, userId: string): Promise<RateLimitResult> {
  return rateLimit(budgetKey(budget, userId), BUDGETS[budget]);
}
