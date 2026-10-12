# Session 75 close (Oct 11, 2026): the browser code rule is live, and what comes next

Read this first in session 76. The long record of S75 (Oct 7 to 10: the mini
messenger, the privacy follow-ups, school email first, the yearly check-in, both
audits and their fix batches) is `handoffs/2026-10-07-session-75-mini-messenger.md`.
This file is the last day and the plan forward.

## START HERE — session 76

**Where things stand.** The app is live at www.connectvibe.app behind the
waitlist. 20 accounts. The two audits from Oct 8 are mostly worked through:
every "broken feature" item that could be fixed without a signed-in walk is
fixed, and from the security report the one High, the share links, the
flip-backs and now the browser code rule are done. Franky's own list below
hasn't moved since Oct 8: those are the real blockers now, not code.

**Model rule (Franky, Oct 8):** Fable 5.1 only for the sentinels and the heavy
audits; everything else on Opus 5.5 with ultracode. S75's last day ran on Fable
because Franky never switched back after the audits; the build agents were
pointed at Opus explicitly. Open S76 on Opus.

**First ten minutes of S76:**
1. `git branch -r | grep claude/` (cloud handoffs live on their branch). On Oct 11
   the only one, `claude/relaxed-davinci-9d11h3`, held nothing main lacks.
2. Ask Franky the questions under "Franky's own list". Every one of them has been
   open since Oct 8 and most gate the launch more than any code does.
3. Run the one-line GRANT under "The database function" below on production
   (the Oct 8 "active now" function still denies anon, a crash button for
   anyone with the public key; the tool was refused it on Oct 11).
4. Open Settings on his phone and check the new card says a sensible number
   (see "Where you're signed in" below). If it says it couldn't count, the
   database function isn't applied: `supabase/migrations/20261011100000_my_session_count.sql`.

## What shipped on Oct 11 (`9fdd61b`)

**The browser code rule (Content-Security-Policy), every page.** Security
report 2026-10-08, Medium: "No browser rule limiting which code can run on
Vibe's pages, and the sign-in proof is readable by page code". Plan and the
amendments the skeptic made to it: `handoffs/2026-10-11-browser-rule-plan.md`.
In plain terms: every page now tells the browser which code may run and where
the page may send data, so one script-injection bug no longer becomes a copied
sign-in.

- Policy: `src/lib/security/csp.ts` (pure, tested). Wired in `src/proxy.ts`.
  React pages get a fresh nonce per request plus `'strict-dynamic'`; Next
  stamps its own scripts, `src/app/layout.tsx` reads `x-nonce` for the theme
  boot script, the Night lock script (`MiniFrame.tsx`) is allowed by hash.
- The static desktop pages (`/html/profile.html`, `/html/messages.html`,
  `/onboarding/classic`) keep `'unsafe-inline'` for scripts: they carry 8+3+3
  inline script blocks and about 280 inline `on*=` handlers (161 in
  profile.html, 74 in messages.html, ~44 templated in the `_*.js` files). Every
  OTHER directive on them is as tight as the React pages'. Moving those
  scripts into files and converting the handlers is the owed second half
  (about a day plus a full desktop walk).
- `/offline.html` gets a hash rule from `next.config.ts` (it skips the proxy;
  the config throws at build if the page doesn't have exactly 2 inline
  scripts). `/sw.js` has none, on purpose (comment in next.config.ts).
- Outside hosts, and nothing else: Supabase (fetch, websocket, storage
  images), R2 (`https://<account>.r2.cloudflarestorage.com`: browser uploads
  and the 307 targets of the four media proxies), Sentry ingest, the landing's
  film store on Vercel Blob, Google Fonts, pdf.js on cdnjs. `img-src` is tight:
  a counts-only read on Oct 11 showed every stored image URL in production is
  a storage key or on the Supabase host, so nothing live breaks, and the
  IP-beacon channel of the report's "A profile owner can secretly see who
  looked at their profile" is closed at the browser (the sanitizer pins for
  `work_experience[].logo_url`, `current_on[].logoUrl` and external résumé
  links are still owed; the fields still accept the URL, the browser just
  won't load it).
- Every route renders per request now (the root layout reads headers()).
  `next build`: 214 dynamic, 7 static, all seven icons/manifest/robots/preview
  images. The comment in `src/lib/native/server.ts` that forbade this is
  rewritten; do not make a page static again (Next's inline scripts would
  ship without their nonce and the page would render blank).
- A violation on a React page reaches Sentry as a warning (`csp: <directive>
  blocked <origin>`), five per page load, browser extensions filtered out,
  never a path or query. The static pages load no Sentry: a slip there shows
  only in a browser console, which is why they were walked by hand.
- Dev: `'unsafe-eval'` and the HMR websocket are allowed only when
  NODE_ENV=development; `upgrade-insecure-requests` only in production.

**The session cookie is Secure in production.** `src/lib/supabase/cookie-options.ts`,
used by all three Supabase clients. `httpOnly` stays false on purpose
(`browser.ts` reads the cookie through document.cookie; the comment in that
file explains what moving every browser-side call behind /api would take).
Known: a local `next start` over plain http (NODE_ENV=production) will lose
the cookie in Safari; use `next dev`.

**Where you're signed in (Settings, above Sign out).** "You have N active
sign-ins." and "Sign out of other devices". `GET`/`DELETE /api/me/sessions`
(`src/app/api/me/sessions/route.ts`), card `src/components/settings/SessionsCard.tsx`,
function `public.my_session_count()` in `supabase/migrations/20261011100000_my_session_count.sql`
(CODE FIRST; the route answers `count: null` and the card says it couldn't
count while the function is missing). The number is SIGN-INS, not devices: with
no Supabase Pro nothing ever expires an `auth.sessions` row, so a phone that
signed in three times counts three (69 rows for 18 accounts on Oct 11). The
button ends every other sign-in (auth-js scope "others") and forgets their push
devices; this one stays. The ordinary Sign out already ended every session
(global scope) and still does. A restricted student may still use the button.
Verified locally: 2 sign-ins → button → "This is your only active sign-in.",
button disabled.

**vercel.json: a handoff-only push no longer redeploys** (`ignoreCommand`,
compared against the last deployed commit, `VERCEL_GIT_PREVIOUS_SHA`). So the
rule "handoff commits wait for the next code push" is retired: commit and push
handoffs whenever. First version compared only the newest commit and would
have skipped deploying code beneath a handoff commit; the reviewers caught it
before the push.

**Three small comment fixes** the reviewers asked for (next.config.ts X-Frame-Options
comment: five same-origin iframe sites, résumés are never framed; native/server.ts;
the sessions route's accepted auth-js edge case).

## Not done, on purpose or owed

- **Session time limits** (30 days max, 7 idle) are Supabase Pro switches.
  Franky, Oct 11: not going on Pro. So a copied sign-in still lasts until its
  owner signs out; the new card is the student's way to do that.
- **The static pages' inline scripts → files, handlers → addEventListener**, so
  the static flavour can drop `'unsafe-inline'`. Counts above. Do profile.html
  first (the signed-in desktop app and the public viewer), then messages.html
  (the chat_v2-off fallback only), then onboarding.html.
- **The sanitizer pins** from the "who looked" finding (`src/lib/profile/work-experience.ts`,
  `current-on.ts`, `resume-doc-url.ts`) and a DB trigger like `orgs_check_asset_refs`.
- **Admin TOTP** for the three founder accounts (later; needs Supabase MFA on
  the free plan, which exists, plus a sign-in step in the app).
- A request for a missing image-like path (`/x.png`) skips the proxy, so the
  React not-found page it renders carries no rule. Same as before; noted.
- Vercel preview deployments inject the vercel.live toolbar script, which the
  rule refuses. Production never has it.

## Live verification (Oct 11, after the deploy)

Build `dpl_55rMaML34WWa17FS2iWbmdvu4WqX`, live 45 s after the push.

- `/auth/login`: the rule is on the response; all 19 Next scripts carry the
  header's nonce (one distinct value, zero scripts without one). Production has
  no `'unsafe-eval'`, has `upgrade-insecure-requests`, and the R2 and Sentry
  origins are present (so `R2_ACCOUNT_ID` and the DSN are set on Vercel).
- `/` and `/legal/privacy`: the rule, nonce flavour. `/api/version`: none.
  `/offline.html`: the two-hash rule. `/html/profile.html?app=1&handle=…`
  signed out: the static flavour (`'unsafe-inline'` for scripts only).
- Walked signed out in the browser: landing (film and stills), login, the
  Privacy Policy, the public profile viewer. Zero policy refusals in the
  console (only the expected 401/404 API answers for a signed-out visitor on an
  unknown handle).
- Not walked live: anything signed in (no live credentials in this session).
  Franky's phone walk covers it: Settings → the new card, and devtools →
  Application → Cookies → the `sb-…` cookie shows Secure.

## The database function, applied on production (Oct 11, after the deploy)

`public.my_session_count()` is live, recorded as `20261011100000` in
`supabase_migrations.schema_migrations` (applied through the Supabase connector,
body minus begin/commit; pre-flight `fn_absent` = t; owner postgres, security
definer, EXECUTE for anon, authenticated and service_role). The Settings card
counts for real now.

**A slip caught the same hour, half corrected.** The standing rule since
Sept 22 (`20260922090000_guard_function_privileges.sql`, memory "Security
model"): never leave a public function that some role cannot EXECUTE, because
on Supabase's Postgres image a denied call crashes the backend and drops every
connection; refuse INSIDE the function instead. My first version of
`my_session_count()` revoked anon; so did `users_active_count(text[])` from
Oct 8 (the "active now" number). Anyone holding the public anon key can call
either through PostgREST, so a denied one is a crash button.

- `my_session_count()`: CORRECTED on production and locally (anon and
  service_role may execute; anon gets 0). The file carries the correction.
- `users_active_count(text[])`: corrected locally and in its file, **NOT on
  production**: the session's database tool refused the GRANT (a permission
  rule), so this is the first thing for S76, or for Franky in the Supabase SQL
  editor right now. Anon gets only the public "active now" number from it,
  which is public by the product's own rule (counts public, identities private):

```sql
grant execute on function public.users_active_count(text[]) to anon, service_role;
```

Then the check that belongs in every migration's post-check from now on
(it answered 1 on Oct 11, that one function; expect 0 after the grant):

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger')
   and not has_function_privilege('anon', p.oid, 'EXECUTE');
```

## What's next — the discussion for Franky

The code side is in good shape for a hand-picked tester wave. What decides the
launch now is the list under "Franky's own list". My recommendation for the
order of the remaining engineering, in one line each:

1. **Email budgets + sign-up captcha** (security report #5/#6): anyone can burn
   the hourly email allowance and block every sign-up code. Cheap to close
   (Supabase has a Turnstile switch; the forgot-password route gets a per-IP
   limit). Do this before the testers arrive.
2. **Rate limits on the unlimited routes** (#7/#11) and the **upload caps and
   type pinning** (#8/#9/#10): a day together.
3. **The Terms draft** (#14): the words students agree to still say "draft"
   and name no company. Needs Franky's thoughts on `legal-2026-09-29/12-results.md`
   first (stopped since Sept 30).
4. **The static pages' second half** of the browser rule (above).
5. The **feature report's signed-in items** (#6, #19, #20, #21) and the chat
   profile card (#7): Franky's phone walk first, then fixes.
6. The **Next.js patch bump** (#13) with a full walk after.
7. A **live pentest** on staging before the store submission (Franky's budget).

Not engineering, but earlier than all of it: ten clubs, the LLC bank account
and EIN, the Terms, and Apple's answer.

## Franky's own list (unchanged since Oct 8; each one gates something)

- **The live sign-up test** with James's or Rylan's school email: time the code
  email (target about 30 s; it used to take 20 minutes), check the Settings
  card afterwards, check the sign-in cookie shows "Secure" in devtools.
- **Vercel Cron → Run** on both crons once (`waitlist-purge`, `school-checkin`)
  and read the log.
- **Supabase Auth switches** (dashboard, free plan): secure password change,
  change-notification emails, emails per hour. Not the session limits (Pro).
- **Resend**: the timeline check and the upgrade decision.
- **The real-phone walk** of the new chat and the mini messenger (desktop).
- **The lawyer file for James**: the 2258A/NCMEC runbook, the legal-hold table
  follow-up, the moderators' rule ("action, never dismiss" for CSAM and
  intimate-image reports), how a kept chat file is retrieved by key.
- **The duplicate sign-up decision** (refuse in the auth hook: a DB change and a
  policy line) and **his thoughts on the Terms review**.
- **Apple**: everything store-related waits for the acceptance (push, review
  note, review accounts).

## Local environment (Oct 11)

- Local Supabase up (docker, `supabase_db_vibe`); the new function is applied
  locally. Seed accounts: `blake@example.test` (non-admin), `avery_owner`
  (admin), password `vibe-local-1234`. `node scripts/local-seed.mjs` refreshes
  stale events but signs the seed accounts out.
- `preview_start` name "vibe" (port 3000). The dev server shows the rule with
  `'unsafe-eval'` and `ws://localhost:3000` added; production doesn't.
- `.env.development.local` has empty R2 vars, so the dev rule carries no R2
  origin; production does (`R2_ACCOUNT_ID` is set on Vercel).
- Pre-existing console error on the phone campus feed: a `<button>` nested in a
  `<button>` in `FeedCard` (`src/app/campus/campus-home.tsx`, the "More
  actions" button inside the card button) — React warns about hydration. Not
  from this change; worth a five-minute fix in S76.

## Gotchas learned on Oct 11

- Next reads the nonce from the REQUEST's Content-Security-Policy header, not
  the response's. The proxy sets both request headers before `updateSession`
  builds `NextResponse.next({ request })`; that is what carries them to the
  render. Verified: all 31 Next scripts on /auth/login carry the header's nonce.
- `'unsafe-inline'` is ignored by browsers the moment a nonce or hash is in the
  same directive. The static flavour therefore has NO nonce and NO hash.
- CSP checks the final URL of a redirect, so the media proxies' 307 targets
  (R2) must be on img-src/media-src/connect-src even though the page only ever
  asks /api.
- `ignoreCommand` exit 0 = skip the build. Diffing `HEAD^ HEAD` only sees the
  newest commit.
- A workflow's builders can be pointed at a model (`model: 'opus'`) when the
  session itself is on Fable; the reviewers inherited Fable. Nine agents,
  62 minutes, one real finding (vercel.json) and a handful of comment nits.
