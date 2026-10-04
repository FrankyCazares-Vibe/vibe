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
 *
 * The file also holds the second switch, `chat_desktop`: Messages on a
 * laptop (handoffs/chat-redesign/wave-3-desktop/contract.md section 2). Same
 * rules, same place it may run, two variables and no clubs list:
 *   CHAT_DESKTOP_ENABLED    exactly "true", and only where `chatV2MayRunHere`
 *   CHAT_DESKTOP_ALLOWLIST  "*" for everyone, or a comma list of user ids; blank is nobody
 * It never widens `chat_v2`: the whole answer for a person is
 *   enabled AND (everyone OR listed user) AND chat_v2 on for that person,
 * because the routes the desktop screens read answer 404 without `chat_v2`.
 * `chatDesktopAnswer` takes the `chat_v2` answer as a parameter, so it stays
 * pure; flag-desktop-server.ts (`chatDesktopFor`) is the one that asks for it.
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

// ---------------------------------------------------------------------------
// chat_desktop: Messages on a laptop
// ---------------------------------------------------------------------------

/**
 * The desktop switch: exactly "true", in a place the new chat may run. Its
 * own variable, so the phone never waits for the laptop and a Preview build
 * holding it by mistake does nothing.
 */
export function chatDesktopEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CHAT_DESKTOP_ENABLED === "true" && chatV2MayRunHere(env);
}

/**
 * The desktop switch is on and its allow-list is the star. The star must be
 * the WHOLE value, as for `chat_v2`. This is not yet "on for everyone": the
 * person still needs `chat_v2` (`chatDesktopAnswer`).
 */
export function chatDesktopEveryone(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!chatDesktopEnabled(env)) return false;
  return (env.CHAT_DESKTOP_ALLOWLIST ?? "").trim() === "*";
}

/**
 * The desktop switch is on and its allow-list names this person. Unset or
 * blank is nobody. The star is not a name: with `*` this answers false and
 * `chatDesktopEveryone` answers true.
 */
export function chatDesktopListedUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!chatDesktopEnabled(env)) return false;
  const id = cleanId(userId);
  if (!id || id === "*") return false;
  return (env.CHAT_DESKTOP_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === id);
}

/**
 * The whole desktop answer for a person, given their `chat_v2` answer
 * (`chatV2For`, which the caller has already asked): on only when `chat_v2`
 * is on for them AND the desktop switch lets them in. With `chatV2On` false
 * this is false whatever the desktop variables hold.
 */
export function chatDesktopAnswer(userId: string, chatV2On: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!chatDesktopEnabled(env)) return false;
  if (chatV2On !== true) return false;
  return chatDesktopEveryone(env) || chatDesktopListedUser(userId, env);
}
