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
