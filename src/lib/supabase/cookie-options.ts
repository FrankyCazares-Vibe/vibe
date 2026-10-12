/**
 * The options every Supabase client in the app stamps on the sign-in cookie
 * (`sb-<project>-auth-token`, and its `.0`/`.1` chunks).
 *
 * PURE: no imports, so the browser client, the server client, the proxy and
 * `node --test` can all load it, and the browser and the server always agree.
 * One object, three callers (`browser.ts`, `server.ts`, `middleware.ts`): if
 * only one client set the flag, the next token refresh written by another
 * client would quietly drop it again.
 *
 * Why (security report 2026-10-08, findings #3 and #4: "the sign-in cookie is
 * readable by page code ... and there is no browser rule"; build plan
 * `handoffs/2026-10-11-browser-rule-plan.md`, shipped with the browser code
 * rule): the cookie carries the refresh token, and Franky (Oct 11: no Supabase
 * Pro) left sessions with no time limit, so a copied cookie stays good until
 * its owner signs out. `secure` keeps the browser from ever sending it over
 * plain http (a first `http://` request on hostile cafe wifi, a typed-in
 * address before the HSTS redirect). It does NOT stop page code reading it;
 * that is the Content-Security-Policy's job in the same deploy.
 *
 * Production only: dev runs on `http://localhost:3000` and on
 * `http://192.168.x.x:3000` for phones on the LAN. Safari drops Secure cookies
 * on plain-http localhost and every browser drops them on a LAN IP, so turning
 * it on in dev would sign everyone out of the dev server. (A local
 * `next start` over plain http is NODE_ENV=production and will lose the
 * cookie on those two; use `next dev` for local testing.)
 *
 * `httpOnly` STAYS FALSE (the library default) on purpose: `browser.ts` calls
 * `createBrowserClient` with no `cookies` option, so @supabase/ssr reads and
 * writes the session through `document.cookie` (the `isBrowser()` branch of
 * `createStorageFromOptions` in node_modules/@supabase/ssr/dist/main/cookies.js).
 * An httpOnly cookie is invisible to `document.cookie`, so chat realtime,
 * uploads and every other browser-side call would run signed out, and the
 * browser's own token refresh (which cannot write httpOnly at all) would fight
 * the server's copy. Taking the cookie out of page code's reach means moving
 * every browser-side Supabase call behind /api first: owed, not this deploy.
 *
 * How the option is consumed (checked in @supabase/ssr 0.6.1, 2026-10-11):
 *  - `cookieOptions?: CookieOptionsWithName` is the option name on both
 *    `createServerClient` (dist/main/createServerClient.d.ts) and
 *    `createBrowserClient` (dist/main/createBrowserClient.d.ts).
 *  - `CookieOptionsWithName = { name?: string } & Partial<SerializeOptions>`
 *    (dist/main/types.d.ts), so a partial object is valid. We leave `name`
 *    out: setting it would also change the auth storage key.
 *  - Every write merges it OVER the defaults:
 *    `{ ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions, maxAge }`
 *    (dist/main/cookies.js, `setItem`/`removeItem` and `applyServerStorage`),
 *    where DEFAULT_COOKIE_OPTIONS is `{ path: "/", sameSite: "lax",
 *    httpOnly: false, maxAge: 400 days }` (dist/main/utils/constants.js).
 *    So path, SameSite=Lax, httpOnly=false and the 400-day max-age are all
 *    unchanged; only Secure is added. Removals (sign-out) carry the same
 *    flags, so they match the cookie they are clearing.
 */
export const SESSION_COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
} as const;
