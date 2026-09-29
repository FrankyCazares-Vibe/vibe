/**
 * The `chat_v2` flag: is the new club chat switched on here, and for whom
 * (handoffs/chat-redesign/wave-1-contracts.md section 2).
 *
 * PURE: no `server-only` and no imports at all, so `node --test` loads it
 * (flag.test.ts). Only erasable TypeScript. Same shape as the push switch
 * (src/lib/push/config.ts `pushAllowedFor`): every function takes `env` as a
 * parameter that defaults to `process.env`, so a test passes a fake one.
 *
 * Environment (server only, never NEXT_PUBLIC_; set for the Production
 * environment only, because Vercel Preview builds run against the production
 * database):
 *   CHAT_V2_ENABLED    exactly "true" turns the feature on at all; anything else is off for everyone.
 *                      It only counts on the live site and in `next dev` (chatV2MayRunHere).
 *   CHAT_V2_ALLOWLIST  "*" for everyone, or a comma list of user ids; blank is nobody
 *   CHAT_V2_CLUBS      a comma list of club (org) ids; every current member of a listed club is in
 *
 * THE SWITCH COMES FIRST, in every function. With `CHAT_V2_ENABLED` off the
 * three list readers answer false, false and no clubs, whatever the lists
 * hold (the push shape: `pushAllowedFor` checks `pushEnabled` itself). So a
 * route that asks one reader alone can never open the feature with the
 * switch off.
 *
 * The whole answer for a person,
 *   enabled AND (everyone OR listed user OR a member of a listed club),
 * needs a database read for its last part, so it lives in flag-server.ts
 * (`chatV2For`). Routes and screens ask that, never these pieces alone.
 *
 * Ids are compared trimmed and lower-case.
 */

/** The shape of every id in the database (users.id, orgs.id): a uuid. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * A place the new chat may run: the live site (`VERCEL_ENV` is "production")
 * or `next dev` on this machine. Everything else (a Vercel Preview build,
 * `next start`, a test run with no environment) is not. Preview builds run
 * against the production database, so a `CHAT_V2_ENABLED` copied there by
 * mistake must do nothing (the push shape: `pushSiteOrigin`).
 */
export function chatV2MayRunHere(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "development";
}

/**
 * The switch: exactly "true", in a place the new chat may run. "TRUE", "1",
 * " true" and unset are all off, and so is "true" on a Preview build.
 */
export function chatV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CHAT_V2_ENABLED === "true" && chatV2MayRunHere(env);
}

/**
 * The switch is on and the allow-list is the star: everyone is in. The star
 * must be the WHOLE value. A star inside a list ("<ids>,*") is not everyone;
 * `chatV2For` says so in the log.
 */
export function chatV2Everyone(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!chatV2Enabled(env)) return false;
  return (env.CHAT_V2_ALLOWLIST ?? "").trim() === "*";
}

/**
 * The switch is on and the allow-list names this person. Unset or blank is
 * nobody, so the founders-only test cannot widen by accident. The star is not
 * a name: with `*` this answers false and `chatV2Everyone` answers true.
 */
export function chatV2ListedUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!chatV2Enabled(env)) return false;
  const id = cleanId(userId);
  if (!id || id === "*") return false;
  return (env.CHAT_V2_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === id);
}

/**
 * The listed clubs' ids, and none while the switch is off: trimmed,
 * lower-case, each one once, in the order written. An entry that is not
 * shaped like an id (a handle, a stray word, a star) is left out: it could
 * never match a club, and sent to the database it would fail the whole read
 * and switch every listed club off with it. `chatV2For` says so in the log.
 */
export function chatV2ClubIds(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!chatV2Enabled(env)) return [];
  const seen = new Set<string>();
  for (const entry of (env.CHAT_V2_CLUBS ?? "").split(",")) {
    const id = entry.trim().toLowerCase();
    if (UUID_SHAPE.test(id)) seen.add(id);
  }
  return Array.from(seen);
}
