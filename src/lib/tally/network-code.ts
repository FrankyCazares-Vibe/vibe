/**
 * The page-open tally's per-network limit, without storing the network.
 *
 * WHY. Every other per-network limiter in the app fires on something a person
 * sends (a form, a reset request). This one fires when someone merely opens
 * the front page, so keying it on the address itself would put the IP address
 * of every visitor into `public.rate_limits`, people who never joined
 * included. The tally was approved as "no id" (Franky, Oct 12 2026), and that
 * has to hold for its limiter too.
 *
 * WHAT IT DOES. The limiter is keyed on a scrambled code made from the
 * network, the UTC day and a secret only the server holds (the same secret
 * and the same kind of keyed hash the email limiters use, `recipientRateKey`
 * in src/lib/email/send-log-core.ts). The day is part of the code, so
 * yesterday's row and today's cannot be matched to each other.
 *
 * With no secret set there is no code, and the route skips the per-network
 * limits: the all-networks ceiling still bounds a flood. It never falls back
 * to the address.
 *
 * THE OTHER LIMITERS (limits plan, Oct 15 2026). `limiterNetworkCode` is the
 * same idea for every other per-network limiter, under its own label and with
 * the limiter's purpose in it, so the waitlist's code for a network can't be
 * matched to the reset form's, or to the tally's. `networkDayCode` and its
 * label stay exactly as they are: changing either would change every code the
 * tally has already written (network-code.test.ts pins one). Nothing calls
 * the new one yet; Wave 2 moves the 10 per-network keys onto it through
 * `clientNetworkCode` in src/lib/rate-limit.ts.
 */
import { createHmac } from "node:crypto";

/** Names this use of the shared secret, so the code matches no other hash made with it. */
const CODE_LABEL = "vibe:tally-open-net:v1:";

/** Same floor as the email hash: a shorter secret is treated as missing. */
const MIN_SECRET_LENGTH = 16;

/** 128 bits of the hash: plenty to keep two networks apart, and a shorter key. */
const CODE_HEX_LENGTH = 32;

/** The UTC day, `YYYY-MM-DD`: the tally's own day (the SQL function counts by it too). */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The limiter key part for one network on one day, or null when the secret
 * is missing or too short, or there is no network to key on.
 */
export function networkDayCode(
  network: string,
  day: string,
  secret: string | null | undefined,
): string | null {
  const key = typeof secret === "string" ? secret.trim() : "";
  if (key.length < MIN_SECRET_LENGTH) return null;
  if (!network || !day) return null;
  return createHmac("sha256", key)
    .update(`${CODE_LABEL}${day}:${network}`)
    .digest("hex")
    .slice(0, CODE_HEX_LENGTH);
}

/** Names the limiters' use of the shared secret; the purpose follows it. */
const LIMITER_LABEL = "vibe:limiter-net:v1:";

/**
 * A limiter's purpose, e.g. `pw-reset-ip`: short, lowercase, and no colon, so
 * label, purpose, day and network can't run into one another.
 */
const PURPOSE_SHAPE = /^[a-z0-9-]{1,40}$/;

/** The day `utcDay` gives, and nothing else: a colon in it could shift where the network starts. */
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A per-network limiter's key part for one network, one UTC day and one
 * purpose, or null when the purpose or the day isn't the expected shape, the
 * secret is missing or too short, or there is no network to key on.
 *
 * Same secret floor and same 32 hex characters as `networkDayCode`. A
 * purpose that isn't the right shape is a bug in the caller: it gets no code
 * (the limiter then behaves as it does with no secret), never a code that
 * could match another label's. A limiter keyed on this must use a window
 * that divides the day (src/lib/rate-limit.ts checks), or the day's new code
 * would split its window in two.
 */
export function limiterNetworkCode(
  purpose: string,
  network: string,
  day: string,
  secret: string | null | undefined,
): string | null {
  if (!PURPOSE_SHAPE.test(purpose) || !DAY_SHAPE.test(day)) return null;
  const key = typeof secret === "string" ? secret.trim() : "";
  if (key.length < MIN_SECRET_LENGTH) return null;
  if (!network) return null;
  return createHmac("sha256", key)
    .update(`${LIMITER_LABEL}${purpose}:${day}:${network}`)
    .digest("hex")
    .slice(0, CODE_HEX_LENGTH);
}
