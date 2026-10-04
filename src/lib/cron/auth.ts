/**
 * Is this request Vercel Cron? Vercel calls each path in vercel.json "crons"
 * with GET and, when the project has a `CRON_SECRET` environment variable,
 * the header `Authorization: Bearer <CRON_SECRET>`. Nothing else may run a
 * cron route.
 *
 * Fails closed: no secret, or one shorter than {@link CRON_SECRET_MIN_LENGTH}
 * (Vercel asks for a random string of at least 16 characters), refuses every
 * call, so an unset variable can never turn into "Bearer undefined" passing.
 * The comparison is on SHA-256 digests with timingSafeEqual, so it takes the
 * same time whatever the header holds. Only `node:crypto`, so the unit test
 * loads it directly.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export const CRON_SECRET_MIN_LENGTH = 16;

/** "unconfigured" = the server has no usable CRON_SECRET (refused; worth a log line). */
export type CronAuthorization = "ok" | "denied" | "unconfigured";

export function cronAuthorization(
  header: string | null | undefined,
  secret: string | null | undefined,
): CronAuthorization {
  if (typeof secret !== "string" || secret.length < CRON_SECRET_MIN_LENGTH) return "unconfigured";
  if (typeof header !== "string" || header === "") return "denied";
  const got = createHash("sha256").update(header, "utf8").digest();
  const want = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  return timingSafeEqual(got, want) ? "ok" : "denied";
}
