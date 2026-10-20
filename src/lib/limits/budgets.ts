import { rateLimit, type RateLimitOptions, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Named per-account budgets for the signed-in actions that had no limit
 * (security report, Oct 8, rows 7-11; wave 3, Oct 15). One name, one limit
 * and one window, so two routes that share a key can never disagree: the
 * limiter's deny cache keys on all three.
 *
 * Every number sits well above normal use: a student who pins, mutes and
 * reacts all evening never meets one. They stop a script looping one
 * account. Views, typing, read marks and the usage check-in (the heartbeat)
 * have no budget here on purpose: a per-account count of those would be an
 * hour-by-hour record of when someone is on Vibe (Privacy Policy 3d). They
 * are bounded in the database instead. (Event check-in, below, is another
 * thing: checking in AT AN EVENT.)
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
  /**
   * Read the school calendars on Campus (GET /api/school-events). A DAY window on
   * purpose: the count says only that an account opened Campus that day, never
   * when (Privacy Policy, abuse counts). Normal use is a few dozen a day.
   */
  schoolEventsRead: { limit: 2000, windowSec: 86_400 },
  /**
   * Check in at an event with the door code or the QR link (POST
   * /api/events/[id]/checkin). THE bound on guessing a 4-digit code: at most
   * 2 codes work at once, so 20 tries is at most a 0.4% chance a day. Fails
   * closed: a limiter that can't count must not mean unlimited guesses. A
   * DAY window on purpose: the count says only that an account tried to
   * check in that day, never when or where.
   */
  eventCheckin: { limit: 20, windowSec: 86_400, failClosed: true },
  /** Remove your own event check-in. Day window, as above. */
  eventCheckinRemove: { limit: 60, windowSec: 86_400 },
  /** Read event check-in state: a card, the check-in page, Settings' list. Day window, as above. */
  eventCheckinRead: { limit: 1000, windowSec: 86_400 },
  /** The officers' door screen: one read every 10 s per open screen, so two screens fit. */
  eventCheckinDoor: { limit: 180, windowSec: 600 },
  /** An event's attendee list for its officers (re-read every 20 s while check-in can happen). */
  eventAttendeesRead: { limit: 240, windowSec: 600 },
  /**
   * Open a post's "Reposted by" list (GET /api/posts/[id]/reposters, Oct 19,
   * 2026). One read per tap, so a few dozen a day is heavy use; 600 stops a
   * script walking every post for who-follows-whom. A DAY window on purpose,
   * as the school calendars: the count says only that an account opened a
   * list that day, never when.
   */
  repostersRead: { limit: 600, windowSec: 86_400 },
  /**
   * Use a club link: make the club a setup link names, or join through a
   * members' link (POST /api/club-links/redeem, Oct 21, 2026). A person uses
   * one or two; 20 an hour stops a script trying codes, which 80 random bits
   * already make hopeless. Fails closed, as check-in does.
   */
  clubLinkRedeem: { limit: 20, windowSec: 3600, failClosed: true },
} as const satisfies Record<string, Pick<RateLimitOptions, "limit" | "windowSec" | "failClosed">>;

export type BudgetName = keyof typeof BUDGETS;

/** The limiter key for a budget: `budget-<name>:<account id>`. */
export function budgetKey(budget: BudgetName, userId: string): string {
  return `budget-${budget}:${userId}`;
}

/**
 * One count against an account's named budget. Lets through if the limiter
 * can't count, as before, unless the budget says `failClosed`.
 */
export function limitFor(budget: BudgetName, userId: string): Promise<RateLimitResult> {
  return rateLimit(budgetKey(budget, userId), BUDGETS[budget]);
}
