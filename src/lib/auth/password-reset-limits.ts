/**
 * The limits on POST /api/auth/password-reset: the numbers, the limiter keys
 * and the order they are asked in. The route (the only caller) supplies the
 * real limiter, `rateLimit` in src/lib/rate-limit.ts.
 *
 * Why they exist: a reset request is the one signed-out door that makes Vibe
 * send an email through its own sender, and every email Vibe sends comes out
 * of one shared daily allowance. Sign-up codes come out of it too, so a
 * script spending it here stops new students' codes from arriving.
 *
 * Three layers:
 *   1. per network, before anything else (refuses if the limiter is down);
 *   2. per address, by its hash, whether or not it has an account;
 *   3. reset emails as a whole, asked only when an email is about to be sent,
 *      so requests for addresses with no account can't spend it (refuses if
 *      the limiter is down).
 *
 * One more, for the "you sign in with a different email" note only
 * (src/lib/auth/signin-hint.ts): one note per typed address per day. The
 * note is asked this first and layer 3 second, because it is one more email
 * out of the same allowance.
 *
 * Each limit has its own key. The limiter stores one row per key and window
 * start, and an hour's window and a day's start at the same moment at
 * midnight UTC, so two limits sharing a key would share a count there.
 *
 * Pure: no imports, so the node test runner loads it.
 */

const HOUR_SEC = 3600;
const DAY_SEC = 86_400;

/** Requests one network may make per window: one script can't walk a list of addresses. */
export const RESET_REQUESTS_PER_NETWORK = 5;
/** The per-network window, 15 minutes: short, so a shared campus network is never stuck for long. */
export const RESET_NETWORK_WINDOW_SEC = 900;
/** Requests naming one address in an hour: nobody's inbox fills with reset emails. */
export const RESET_REQUESTS_PER_ADDRESS_PER_HOUR = 3;
/** Requests naming one address in a day: one student can't be mailed hour after hour. */
export const RESET_REQUESTS_PER_ADDRESS_PER_DAY = 5;
/** Reset emails to everyone in an hour: a burst can't empty the shared daily email allowance sign-up codes also depend on. */
export const RESET_EMAILS_PER_HOUR = 20;
/** Reset emails to everyone in a day: the most of that shared daily allowance resets may ever use. */
export const RESET_EMAILS_PER_DAY = 40;
/** "You sign in with a different email" notes to one address in a day: it says the same thing every time, so once is enough. */
export const RESET_HINTS_PER_ADDRESS_PER_DAY = 1;

/** One limiter question: `key` counts up to `limit` per `windowSec`. */
export type ResetLimit = {
  key: string;
  limit: number;
  windowSec: number;
  /** Refuse, not allow, when the limiter itself can't be reached. */
  failClosed: boolean;
};

/** The limiter's answer: the `allowed` and `retryAfterSec` of `RateLimitResult` in src/lib/rate-limit.ts. */
export type ResetLimitResult = { allowed: boolean; retryAfterSec: number };

/** Layer 1. `network` is `clientNetworkKey(req)`: IPv4 as is, IPv6 as its /64. */
export function resetNetworkLimit(network: string): ResetLimit {
  return {
    key: `pw-reset-net:${network}`,
    limit: RESET_REQUESTS_PER_NETWORK,
    windowSec: RESET_NETWORK_WINDOW_SEC,
    failClosed: true,
  };
}

/** Layer 2, the hour then the day. `emailKey` is the address's hash (`recipientRateKey`), never the address. */
export function resetAddressLimits(emailKey: string): ResetLimit[] {
  return [
    {
      key: `pw-reset-email:${emailKey}`,
      limit: RESET_REQUESTS_PER_ADDRESS_PER_HOUR,
      windowSec: HOUR_SEC,
      failClosed: false,
    },
    {
      key: `pw-reset-email-day:${emailKey}`,
      limit: RESET_REQUESTS_PER_ADDRESS_PER_DAY,
      windowSec: DAY_SEC,
      failClosed: false,
    },
  ];
}

/** Layer 3, the hour then the day, for everyone together (the waitlist's "waitlist-global" shape). */
export function resetSendLimits(): ResetLimit[] {
  return [
    {
      key: "pw-reset-global-hour",
      limit: RESET_EMAILS_PER_HOUR,
      windowSec: HOUR_SEC,
      failClosed: true,
    },
    {
      key: "pw-reset-global-day",
      limit: RESET_EMAILS_PER_DAY,
      windowSec: DAY_SEC,
      failClosed: true,
    },
  ];
}

/**
 * The note's own limit: one a day for the typed address (`emailKey` is its
 * hash, as in layer 2). Layer 2 lets an address be named 5 times a day, and
 * without this each of those would mail the same note again. Asked only when
 * a note is about to be sent, and before layer 3, so a repeat is refused here
 * and never counts against the reset emails. Refuses if the limiter is down,
 * as layer 3 does.
 */
export function resetHintLimit(emailKey: string): ResetLimit {
  return {
    key: `pw-reset-hint-day:${emailKey}`,
    limit: RESET_HINTS_PER_ADDRESS_PER_DAY,
    windowSec: DAY_SEC,
    failClosed: true,
  };
}

/**
 * Asks each limit in turn and stops at the first that refuses: its answer, or
 * null when all of them allow. Stopping matters because every ask counts, so
 * a request the hour refuses must not also use up the day.
 */
export async function firstRefusal(
  limits: readonly ResetLimit[],
  hit: (limit: ResetLimit) => Promise<ResetLimitResult>,
): Promise<ResetLimitResult | null> {
  for (const limit of limits) {
    const result = await hit(limit);
    if (!result.allowed) return result;
  }
  return null;
}
