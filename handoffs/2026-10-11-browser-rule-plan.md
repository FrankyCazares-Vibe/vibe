# The browser code rule (Content-Security-Policy) — build plan, S75, 2026-10-11

Plain English: every page Vibe sends will carry a note telling the browser which
code may run and where the page may send data. Today there is none (security
report 2026-10-08, "No browser rule limiting which code can run on Vibe's pages").
Franky's call (Oct 11): no Supabase Pro, so no session time limits; everything
else ships now. Phones and desktops get the same rule in one deploy.

## Facts the plan rests on (checked 2026-10-11)

- React pages (`src/app/**`) have ONE inline script of our own: `THEME_BOOT_SCRIPT`
  in `src/app/layout.tsx:95`, plus `NIGHT_LOCK_SCRIPT` in
  `src/components/desktop/messages/MiniFrame.tsx:100` (server-rendered when
  `/messages?mini=1`). Everything else is Next's own inline scripts (which Next
  stamps with the request nonce itself) and scripts created with
  `document.createElement("script")` (allowed under `'strict-dynamic'`):
  `/html/_otto-tour.js`, `/html/_mentionPicker.js`, and pdf.js from
  `https://cdnjs.cloudflare.com` (`src/lib/pdfjs-cdn.ts`).
- The static desktop pages `public/html/profile.html` (8 inline scripts, 161
  inline `on*=` handlers), `messages.html` (3 / 74), `onboarding.html` (3 / 0 but
  templated handlers in the JS files: ~44 across `_postViewer.js`,
  `_miniMessenger.js`, `_safetyActions.js`, `_sharePicker.js`, `_otto.js`,
  `_profilePreview.js`) cannot take a nonce rule yet. They get a looser rule
  (`'unsafe-inline'` for scripts) with every OTHER directive as tight as the
  React pages. Paths: `/html/*.html` (through the proxy) and
  `/onboarding/classic` (a route handler that serves onboarding.html).
- `/offline.html` skips the proxy (matcher). It has two inline scripts and no
  handlers → hash-based rule from `next.config.ts` `headers()`.
- `/sw.js` skips the proxy and keeps NO CSP (a policy on the worker script
  governs the worker's own fetches; no allow-list worked out — existing note).
- Outside hosts the browser talks to:
  - Supabase: `NEXT_PUBLIC_SUPABASE_URL` (prod `https://rqopjkimxbjkwdkpkbfq.supabase.co`,
    dev `http://127.0.0.1:54321`) — fetch + realtime websocket + public storage
    images (avatars, banners, post media).
  - R2: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` (env `R2_ACCOUNT_ID`,
    server-side var, readable in the proxy) — presigned PUT uploads from the
    browser (`campus-home.tsx`, `messages.html` XHR), and every media proxy
    307s there: `/api/posts/[id]/media`, `/api/resume/[...path]`,
    `/api/orgs/[slug]/asset/[kind]`, `/api/me/threads/.../media`. CSP checks the
    redirect target, so img/media/frame/connect need this origin.
  - Sentry ingest: origin of `NEXT_PUBLIC_SENTRY_DSN` (prod
    `https://o4511312043704320.ingest.us.sentry.io`; unset in dev).
  - Landing demo media: `src/lib/landing/demo-media.ts` `DEMO_MEDIA_BASE`
    (default `https://npzptkkzqxthhsnu.public.blob.vercel-storage.com/`, env
    `NEXT_PUBLIC_DEMO_MEDIA_BASE` overrides) — images + the 30 s film.
  - Google Fonts: `https://fonts.googleapis.com` (stylesheet), `https://fonts.gstatic.com` (files).
  - pdf.js: `https://cdnjs.cloudflare.com` (script; worker via a `blob:` wrapper
    that `importScripts` the CDN file; PDF bytes fetched by XHR from the R2 signed URL).
  - Stripe: reached only by `window.location.assign(url)` (navigation, not CSP-governed).
  - Nothing else: no analytics, no `<embed>/<object>/<base>`, no `javascript:`
    links, no `eval`/`new Function`, no third-party iframes. Vibe frames only
    itself (`/html/messages.html`, `/onboarding/classic`, `/messages?mini=1`,
    resume previews on signed URLs).
- Stored image URLs in production (counts only, 2026-10-11): every non-empty
  value is a storage key (served via our /api proxies) or on the Supabase
  host. Zero outside hosts in users.avatar_url/banner_url, orgs.logo_url/
  banner_url, posts.media_url/media_thumbnail_url, channels.photo_url,
  messages.media_url, work_experience[].logo_url, current_on[].logoUrl,
  resume_docs[].url, users.resume_url. A tight `img-src` breaks nothing live
  and closes the IP-beacon channel of the report's "A profile owner can secretly
  see who looked at their profile" (the sanitizer fixes there stay owed).
- Session cookie: `@supabase/ssr` defaults (`httpOnly:false`, no `secure`) in
  `src/lib/supabase/{browser,server,middleware}.ts`. `httpOnly` must stay false
  (the browser client reads the cookie). `secure` goes on in production.
- Sign out: `POST /api/auth/logout` already ends EVERY session (auth-js default
  scope "global"). What's missing is a visible "where am I signed in" with a
  "sign out of the others" action. Production: 69 sessions for 18 of 20 accounts.
  auth-js supports `signOut({ scope: "others" })`.

## The policy (one builder, two flavours)

`src/lib/security/csp.ts` (pure, no imports from `server-only`, runs in the
proxy runtime and in tests):

```
app flavour (React pages):
  default-src 'self';
  script-src 'self' 'nonce-<N>' '<NIGHT_LOCK_SCRIPT_HASH>' 'strict-dynamic' https://cdnjs.cloudflare.com [dev: 'unsafe-eval'];
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  img-src 'self' data: blob: <supabase> <r2> <demoMedia>;
  media-src 'self' blob: <supabase> <r2> <demoMedia>;
  connect-src 'self' <supabase> <supabase as ws(s)://> <r2> <sentry> [dev: ws://<request host> wss://<request host>];
  frame-src 'self' <supabase> <r2>;
  worker-src 'self' blob:;
  manifest-src 'self';
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';
  [prod: upgrade-insecure-requests]

static flavour (/html/*.html, /onboarding/classic): identical except
  script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com [dev: 'unsafe-eval']
  (no nonce, no hash, no strict-dynamic — 'unsafe-inline' is ignored by browsers
  when a nonce or hash is present, which would silently break the handlers).
```

Any `<origin>` whose env var is missing is simply left out (dev has no Sentry).
Hosts are origins only (`https://host`), never paths. Build the header as one
line; no trailing semicolon issues; directive order as above.

Exports (exact names, so the proxy and tests can be written in parallel):

```ts
export type CspFlavor = "app" | "static";
export type CspEnv = {
  supabaseUrl?: string;        // NEXT_PUBLIC_SUPABASE_URL
  r2AccountId?: string;        // R2_ACCOUNT_ID
  sentryDsn?: string;          // NEXT_PUBLIC_SENTRY_DSN
  demoMediaBase?: string;      // NEXT_PUBLIC_DEMO_MEDIA_BASE, else the default in demo-media.ts (import DEFAULT_DEMO_MEDIA_BASE from "@/lib/landing/demo-media" — check that module is import-safe for the proxy: no server-only, no node APIs; if not, copy the constant and add a parity test)
};
export function cspEnvFromProcess(env: NodeJS.ProcessEnv = process.env): CspEnv;
/** "static" for /html/*.html and /onboarding/classic (trailing slash tolerated), else "app". Never null: the proxy decides what is a page. */
export function cspFlavor(pathname: string): CspFlavor;
/** 16 random bytes, base64 (standard alphabet), via globalThis.crypto.getRandomValues. */
export function makeNonce(): string;
export function buildCsp(opts: { flavor: CspFlavor; nonce?: string; env: CspEnv; dev: boolean; requestHost?: string }): string;
/** 'sha256-…' of NIGHT_LOCK_SCRIPT (src/lib/theme/theme.ts). A constant; csp.test.ts recomputes it with node:crypto and fails when the script drifts. */
export const NIGHT_LOCK_SCRIPT_HASH: string;
export const CSP_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";
```

`src/lib/security/inline-script-hashes.ts` (plain TS, `node:crypto`, relative
imports only — `next.config.ts` imports it the way it imports
`./src/lib/supabase/key-guard`): `inlineScriptHashes(html: string): string[]`
returns `'sha256-<base64>'` for every `<script>…</script>` WITHOUT a `src`
attribute, hashing the exact text between the tags (no trimming — the browser
hashes the raw contents). `offlinePageCsp(hashes: string[]): string` builds:
`default-src 'self'; script-src <hashes>; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`.
Test: a fixture with two scripts (one with src) → one hash, equal to a
hand-computed value; and `inlineScriptHashes(readFileSync("public/offline.html"))`
has length 2.

## Wiring

`src/proxy.ts`:
1. At the top of `proxy()`: `const page = !pathname.startsWith("/api/") && !isFileRequest(pathname);`
   `const flavor = page ? cspFlavor(pathname) : null;`
   `const nonce = flavor === "app" ? makeNonce() : undefined;`
   `const csp = flavor ? buildCsp({ flavor, nonce, env: cspEnvFromProcess(), dev: process.env.NODE_ENV === "development", requestHost: request.nextUrl.host }) : null;`
2. For the app flavour, BEFORE `updateSession(request)`: set the REQUEST headers
   `content-security-policy` = csp and `x-nonce` = nonce on `request.headers`
   (Next reads the nonce from the request's CSP header in
   `app-render.js` `getScriptNonceFromHeader`, and our layout reads `x-nonce`).
   `updateSession` builds `NextResponse.next({ request })`, which forwards the
   mutated headers. If `request.headers.set` throws (immutable guard), build a
   new `NextRequest(request, { headers })` — but try the plain set first and
   leave a comment saying which one is in use and why.
3. Every response that IS the page (the three `return sessionResponse` sites)
   gets the RESPONSE header `Content-Security-Policy: <csp>`. Redirects and the
   restricted JSON don't need it. A tiny `finish(res)` helper, used at those sites.
4. `restrictedApiAllowed`: add `pathname === "/api/me/sessions" && method === "DELETE"`
   (a restricted student may still sign out their other devices — protecting
   themselves, like block and mute).
5. Update the header comment ("What it does") with item 5: the browser code rule.
   Do NOT touch the `matcher`.

`next.config.ts`: replace the "No CSP yet" comment; add a `/offline.html` header
rule with `offlinePageCsp(inlineScriptHashes(readFileSync("public/offline.html","utf8")))`;
note why `/sw.js` has none. Everything else unchanged.

`src/app/layout.tsx`: `const nonce = (await headers()).get("x-nonce") ?? undefined;`
(import from `next/headers`; RootLayout becomes async) and `<script nonce={nonce} …>`.
Rewrite the NativeBridge comment that says this layout never reads headers():
it now does, on purpose — a nonce rule needs every page rendered per request
(Next's own inline scripts get the nonce only at render time; a prerendered
page would ship them nonce-less and the browser would refuse them).

`instrumentation-client.ts`: after `Sentry.init`, when `typeof document !== "undefined"`,
listen for `securitypolicyviolation` and `Sentry.captureMessage` once per
(effectiveDirective, blocked origin) per page load, capped at 5 per load:
message `csp: <effectiveDirective> blocked <origin | "inline" | "eval" | "data" | "blob">`,
level "warning", tags `{ csp_directive, csp_blocked }`. Only the ORIGIN of
`blockedURI` (never a path or query — signed URLs carry keys; profile paths
carry handles). Same channel the Privacy Policy already names for errors.

`src/lib/supabase/cookie-options.ts`: `export const SESSION_COOKIE_OPTIONS = { secure: process.env.NODE_ENV === "production" } as const;`
with a comment (Secure in production; dev is http://localhost, and Safari drops
Secure cookies there; httpOnly stays false because `browser.ts` reads the
cookie). Pass `cookieOptions: SESSION_COOKIE_OPTIONS` in `browser.ts`,
`server.ts`, `middleware.ts`.

## Where you're signed in (Settings)

- Migration `supabase/migrations/20261011100000_my_session_count.sql`, house
  style (PLAIN ENGLISH / WHAT IT DOES / DOES NOT / LIVE STATE / DEPLOY ORDER /
  HOW TO APPLY BY HAND / ROLLBACK — copy the shape of
  `20261008120000_users_last_active_private.sql`):
  `public.my_session_count()` returns integer, `language sql`, `security definer`,
  `stable`, `set search_path = ''`, body `select count(*)::integer from auth.sessions where user_id = auth.uid();`
  then `revoke all on function … from public, anon; grant execute … to authenticated; notify pgrst, 'reload schema';`
  DEPLOY ORDER: code first (the route answers `count: null` while the function
  is missing), then apply.
- `src/app/api/me/sessions/route.ts`:
  `GET` → `{ ok: true, count: number | null }` via the USER's client
  `supabase.rpc("my_session_count")`; a missing function (PGRST202 / 42883 /
  "Could not find the function") → `count: null`, no error log spam (one
  `console.warn` with the code). `cache-control: no-store`.
  `DELETE` → body optional `{ push_address }` (same shape as `/api/auth/logout`,
  parse with the same tolerance); rate limit `sessions:others:${user.id}`
  10 per hour (fail-open like the others); delete this student's OTHER push
  devices with the service client (`push_devices` where `user_id` = me and
  `address <> push_address`; with no address given delete all of theirs — the
  live device re-registers on next open, exactly as `/api/auth/logout` does);
  then `await supabase.auth.signOut({ scope: "others" })`; GoTrue error →
  502 `{ ok:false, code:"signout_failed", error:"Couldn't sign out your other devices." }`;
  success `{ ok: true }`. Signed out → 401 `{ ok:false, code:"unauthorized" }`.
  Read `src/app/api/auth/logout/route.ts` and `src/app/api/me/personal-email/route.ts`
  for the house conventions (`json`/`fail` helpers, `isMissingPushSchema`).
- `src/components/settings/SessionsCard.tsx`: `export function SessionsCard()`.
  Copy the card look from `CampusAccountCard` in `PersonalEmail.tsx` (its own
  glass style constant, "Fraunces" title, "DM Sans" body). Title "Where you're
  signed in". Body: "You're signed in on N devices or browsers." (`…` while
  loading; when `count` is null: "We couldn't count your devices right now.";
  1 → "You're signed in on this device only." and the button disabled). Hint
  line: "Sign out below and every one of them ends. This button keeps this one
  and ends the rest." Button "Sign out of other devices" → `vibeRequest("/api/me/sessions", { method: "DELETE", json: pushLogoutBody(), failure: "Couldn't sign out your other devices." })`
  → on ok `toast("Signed out everywhere else.")` and re-fetch the count.
  Mount it in `SettingsClient.tsx` directly above `<SignOutCard />` (one import,
  one JSX line — the only edits to that file).

## Also in this deploy
- `vercel.json` `ignoreCommand` so a handoff-only push no longer redeploys (done by hand).

## Not in this deploy (owed, for the handoff)
- Moving the static pages' inline scripts into files and converting the ~280
  inline handlers so the static flavour can drop `'unsafe-inline'`.
- Session time limits + inactivity sign-out (Supabase Pro; Franky: not now).
- The sanitizer pins for `work_experience[].logo_url`, `current_on[].logoUrl`,
  external résumé links (report finding) — CSP now blocks the load, the fields
  still accept the URL.
- Admin TOTP.

## Amendments applied while building (the skeptic's review, 2026-10-11)

These override the sections above where they differ. The code follows them.

1. **frame-src is `'self'` only** in both flavours. Vibe frames only its own
   pages (five same-origin iframe sites); résumés are drawn by pdf.js into
   `<img>`, never framed. Storage origins stay out so a stored URL can't frame
   a Supabase or R2 object.
2. **vercel.json ignoreCommand** compares against the last deployed commit:
   `git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- ':!handoffs' || exit 1`.
   The first version (`HEAD^ HEAD`) looked at the newest commit only, so a push
   ending in a handoff commit would have skipped deploying the code beneath it.
3. **The count is sign-ins, not devices.** Without Pro nothing expires an
   `auth.sessions` row: every sign-in on the same phone adds one until a
   sign-out there (69 rows for 18 accounts on Oct 11). The card says:
   "You have N active sign-ins." / "This is your only active sign-in." /
   "We couldn't count your sign-ins right now.", hint "Every time you sign in
   on a device or browser counts once until you sign out there. This button
   keeps this one and ends the rest.", button "Sign out of other devices"
   (disabled at 1). Do not change it back to "devices".
4. **The Sentry listener drops browser-extension noise** (chrome-extension:,
   moz-extension:, safari-web-extension:, safari-extension:) before counting.
5. **GET /api/me/sessions treats Postgres 42501** (permission denied: the
   function was created by a role that can't read auth.sessions) like a
   missing function → `count: null`.
6. **next.config.ts reads public/offline.html from process.cwd()** and throws
   at config load unless exactly 2 inline scripts are found.
7. **The dev ws:// entry uses the Host header**, not nextUrl.host.

Known, accepted, for the next session's list:
- A request for a missing image-like path (`/x.png`) skips the proxy (the
  matcher), so the React not-found page it renders carries no rule. Same as
  before this deploy; not worth a change today.
- Vercel preview deployments inject the vercel.live toolbar script, which the
  app flavour refuses; production never has it.
- auth-js swallows a 401/403/404 on `signOut({scope:"others"})`; the card
  re-reads the count straight after, so the number shown is right.
