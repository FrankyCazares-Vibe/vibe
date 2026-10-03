# Sign-up today, and where a waitlist would gate it

Read-only map, Oct 3. Repo `/Users/franciscocazares/vibe` at `4c59568` (main) plus the
landing-night worktree. "Verified" means I checked it against the code or the LOCAL database
(docker psql). "Read only" means I read it but did not test it. Production was not touched.

## The short answer

- **Today, one door creates accounts.** The sign-up page runs in the browser and talks straight
  to Supabase with the public key. Because of that, no Next.js route and no `src/proxy.ts` rule can
  stop it. Anyone can skip the page and send the same request to Supabase themselves.
- **The safe wall is inside Supabase.** Turn on a "before user created" hook: a small Postgres
  function that Supabase runs before it creates any account. It looks the email up on a waitlist
  table and refuses anyone not marked invited. People who already have accounts never hit it,
  because it only runs when an account is created, not when someone signs in.
- **The founders, App Review, and club officers all get through the same way:** their sign-up
  emails are on the list. The founders and the review pair already have accounts. If Apple
  deletes the review account, the seed script must put that email on the list before it
  recreates the account.

## 1. Every way an account can be created today

| Path | Where | Can a proxy or route stop it? |
|---|---|---|
| Web sign-up | `src/app/auth/signup/page.tsx:207-221`. A client component calls `supabase.auth.signUp` with the browser client (`getSupabaseBrowserClient`) | **No.** The request goes from the browser to `<supabase>/auth/v1/signup`. Verified by reading the code |
| Same request without the page | Anyone with the public key (it ships to every browser) can POST to `/auth/v1/signup` | **No** |
| Store apps | `mobile/capacitor.config.ts`: `server.url = https://www.connectvibe.app`, `appStartPath /campus`. The app is a web view of the live site with no native sign-in, so signing up in the app is the same `/auth/signup` page | Same as web |
| Magic link / code sign-in, OAuth, anonymous | Not used. Grep of `src` and `scripts` finds no `signInWithOtp`, `signInWithOAuth`, `signInWithIdToken` or `signInAnonymously`. Locally, `supabase/config.toml:173` turns anonymous sign-in off and `:329-330` turns Apple off. **Production's settings live in the dashboard and were not checked** | Not an open path in our code. A hook would cover these too if someone turned them on |
| Confirming an email / typing the code | `src/app/auth/confirm/page.tsx:54` and `src/components/auth/ConfirmCodeForm.tsx:114` call `verifyOtp`. This confirms an account that already exists; it does not create one | n/a |
| Password reset | `src/app/api/auth/password-reset/route.ts:82` uses `admin.generateLink` with type `recovery`. Existing users only | n/a |
| Seed scripts (service key) | `scripts/seed-review-accounts.mjs:677`, `scripts/demo-seed.mjs:382`, `scripts/local-seed.mjs:217` call `admin.auth.admin.createUser` | Only someone holding the secret service key can run these |
| Database trigger | Verified in the local database: the only trigger on `auth.users` is `on_auth_user_created` (AFTER INSERT), which runs `public.handle_new_user()`. That function is defined in `supabase/migrations/20260906120000_terms_acceptances.sql:68-138` and makes the `public.users` row and the Terms record | Nothing gates creation today |

Sign-up settings in `supabase/config.toml` (these are LOCAL settings): `enable_signup = true` at
`:171` and `:216`, `enable_confirmations = false` at `:223`. The before-user-created hook block at
`:285-288` is commented out. Whether production requires email confirmation was **not checked**,
and it matters (see section 3, "Bypass checks").

## 2. What happens after an account exists, and patterns we can copy

- **Order of gates:** `enforceCampusAccess` in `src/lib/auth/campus-access.ts:19-49` checks:
  signed in, then Terms (`hasRecordedConsent`), then `school_verified`, then Otto. After sign-in,
  `src/lib/auth/post-login.ts:23-59` sends people to the school email step, then Otto, then home.
- **School email:** `src/app/api/auth/school-email/request/route.ts`. Requires a session and
  accepted Terms. Allowed domains come from `src/lib/auth/school-email-domains.ts`.
  `PURDUE_SIGNUPS_ENABLED = true` at `:44` is a constant in the code, so changing it takes a
  deploy. Each school address can belong to one account only (`schoolIdentityConflict`). A banned
  school address cannot verify again (`restrictionForSchoolIdentity`,
  `src/lib/moderation/access.ts:263`).
- **Suspended or banned:** the proxy redirects them (`src/proxy.ts:239-249`, reading
  `app_metadata.restriction`). Routes also check with `requireNotRestricted` and
  `requireCanPublish` (`access.ts:203`, `:217`). A waitlist does not change any of this.
- **The new-chat switch (`CHAT_V2_*`)**, in `src/lib/chat/flag.ts` and `flag-server.ts`: an env
  on/off switch plus a list of user ids or club ids, and it refuses when unsure. Worth copying is
  the shape: one master switch, then a list, and a failure means "no". It **cannot** gate sign-up
  itself, because it is keyed on user ids and those only exist after the account does.
- **Platform admin:** `users.is_platform_admin` can only be read with the service key
  (`20260927141000_users_platform_admin_flag_server_only.sql`; three users have it). The check is
  `requirePlatformAdmin` (`src/lib/auth/require-platform-admin.ts:21`). This is the gate a
  founders-only waitlist screen in `/admin` should use.
- **Club invites cannot bring new people in.** Verified in the local database: `org_invites` has
  `invitee_id uuid NOT NULL`, so an invite can only go to an existing account. Once a gate is on,
  an officer cannot pull a brand-new member past it. A founder has to add that person's email to
  the waitlist first.

## 3. The recommended gate

### The options, compared

1. **Before-user-created hook. Recommended.** Supabase calls a Postgres function before it
   creates any user. The function returns `{}` to allow it, or
   `{"error":{"http_code":403,"message":"..."}}` to refuse it. Per the Supabase docs (read through
   search_docs) this is available on the Free and Pro plans. The sign-up page keeps working as it
   does now, and the check runs on Supabase's side, so skipping the page does not get around it.
2. **Turn "Allow new users to sign up" off** (`enable_signup`; production dashboard). This is
   the tightest option, but public `signUp` then stops working for everyone, invited people
   included. Invited people would need a new server route that checks the invite, calls
   `admin.createUser` and sends its own confirmation email. The password-reset route at
   `api/auth/password-reset/route.ts:82` already does generateLink plus a Resend email, so the
   pattern exists. It is more code, and the sign-up page would have to be rewritten to go through
   the server. Keep it as the fallback.
3. **A BEFORE INSERT trigger on `auth.users` that raises an error.** It does block every path,
   but Supabase answers with a 500 "Database error saving new user", which looks like a crash.
   Avoid.
4. **A check at onboarding or at the school email step.** Anyone could still create an account:
   junk rows pile up, we pay for the confirmation emails, and people hit the wall only after
   making an account. At most, use it as a second check.
5. **The proxy or an API route.** Not possible: sign-up never passes through our server.

### Exact places to change (all migrations are applied by the main session)

- **New migration: `public.waitlist` table.** Columns: email (trimmed, lowercase, unique),
  school, year, club, role (student or officer), how they heard, status
  (`waiting`, `invited`, `joined`, `declined`), invited_at, invited_by, joined_user_id,
  created_at. Turn RLS on and grant nothing to `anon` or `authenticated`: the repo is public and
  this table is a list of personal emails. Grant `select` to `supabase_auth_admin`, or make the
  hook SECURITY DEFINER.
- **Same migration: hook function, e.g. `public.hook_waitlist_gate(event jsonb)`.** It allows
  the sign-up when `lower(event->'user'->>'email')` has a row with status `invited` or `joined`.
  It also allows everyone when a `signup_open` settings row is true, so launch day is one SQL
  update with no deploy and no dashboard trip. Otherwise it returns 403 with "Vibe is invite-only
  for now. Join the waitlist at connectvibe.app." Grant EXECUTE to `supabase_auth_admin` and
  revoke it from `anon`, `authenticated` and `public`, the same as `handle_new_user`.
- **`handle_new_user()`:** add one UPDATE that marks the waitlist row `joined` and stores the new
  user id. It runs in the same transaction as the insert, so it gives the data for free (who came
  from the list, and when).
- **Turn the hook on.** Locally: `supabase/config.toml:285-288`, `uri =
  "pg-functions://postgres/public/hook_waitlist_gate"`. In production: Dashboard > Auth > Hooks, or
  the Management API auth config. Main session only.
- **`src/app/auth/signup/page.tsx`.** Without an invite, show the waitlist form. With
  `?invite=<token>`, show today's form with the email filled in from the token's row and locked.
  `signUpErrorMessage` (`:67-102`) needs a branch for the hook's 403. Today that error falls
  through to "Something went wrong."
- **New `POST /api/waitlist`.** Uses the service key and `rateLimit` from `src/lib/rate-limit.ts`
  (per network), plus a honeypot field against bots. Do not build any public "is this email
  invited?" check: it would tell anyone who is on the list.
- **New founders-only waitlist tab in `src/app/admin/`**, behind `requirePlatformAdmin`: invite a
  row, which sends the invite email through `src/lib/email/resend-transactional.ts`, or decline
  it.
- **`scripts/seed-review-accounts.mjs`:** add the two review emails to the list (status
  `invited`) before `createUser` (`:677`). Whether `admin.createUser` triggers the hook at all is
  **not stated in the docs. Test it on the local stack** (local Supabase auth image is
  `gotrue:v2.189.0`). The same applies to `local-seed.mjs` and `demo-seed.mjs`, which create
  `@example.test` users.

### Who gets through

- **Existing accounts, including the founders and anyone signed up before the gate:** the hook
  never runs for them, because it only runs at creation. People who signed up but never confirmed
  or never verified a school email can still finish. If "100 testers" is meant as a hard number,
  count those in production first (not checked).
- **Club officers the founders invite:** the "Bring your club" email (landing-night
  `home-landing.tsx:33` and `:321`) leads to a founder adding the officer's personal email as an
  officer row and sending the invite. The officer signs up, verifies the school email, and
  creates the club (`POST /api/orgs` requires a verified school email and `requireCanPublish`).
  Their members need list rows too (see section 2). A later option is a few invite slots per
  officer.
- **App Review:** signs in with the seeded pair and never signs up
  (`handoffs/stores/review-notes.md:58-61`). If Apple deletes account 1, the re-run seed
  recreates it, so its email must be on the list. Add one sentence to the reviewer notes: Vibe is
  invite-only during a pilot, and new sign-ups join a waitlist. Possible risk, from memory and not
  verified: Apple's beta rule (2.2) says betas belong in TestFlight. Check the wording before
  Oct 16.
- **Someone who deletes their account and comes back:** their row is still `joined`, so they get
  in. Bans still hold through the school address check, unchanged.

### Bypass checks

- Sending the request to `/auth/v1/signup` directly with the public key: refused by the hook.
- Another sign-up method switched on later (code sign-in or OAuth): the docs say the hook runs
  before any new user is created. Still, keep those methods off in production and re-check the
  dashboard.
- **Using someone else's invited email:** this only fails if email confirmation is ON in
  production. Locally it is off (`config.toml:223`). **Check this in production before
  launch.**
- If the hook itself breaks (a missing table, a bad grant), sign-up fails rather than letting
  people through. Test both the refuse and the allow cases locally before it goes to production.
- The waitlist table must never be readable with the public key. After the migration, test it as
  a signed-in student: `GET /rest/v1/waitlist` should answer 401 or 403.

## 4. What a signed-out visitor sees at each entry

| Entry | Today | With the gate |
|---|---|---|
| Landing "Sign up" buttons: main `home-landing.tsx:20`, `landing-orbit.tsx:71`; landing-night `home-landing.tsx:209`, `:225`, `:315`, `:336` | Go to `/auth/signup` | "Join the waitlist", either a form on the page or `/waitlist` (email, school, year, club). A small "Got an invite? Open the link in your email." "Log in" stays. The copy at landing-night `:314`, "Sign up with your school email. It's free…", needs to become waitlist copy |
| `/auth/signup` with no invite | The account form | The waitlist form plus "Already have an account? Log in" |
| `/auth/signup?invite=…` | n/a | Today's form with the email filled in, then the usual steps: school email, then Otto |
| Store app, signed out | `/campus` sends them to login, and login links to sign-up (`login/page.tsx:374`) | Same pages, so the same waitlist form. App Review signs in and never sees it |
| After deleting an account (`account/suspended/suspended-actions.tsx:40`, `AFTER_DELETE = "/auth/signup"`) | The sign-up form | Would show the waitlist. Point it to `/` instead |
| Broken email link (`components/auth/EmailLinkProblem.tsx:231`) | "Start over" goes to sign-up | Should go to `/auth/login` or the resend option, so an invited person isn't sent to the waitlist |

Not in scope here: the line Franky asked to remove ("The real app with sample accounts. The three
founders play themselves.") is not in the landing-night `src/`. It shows up only in scratchpad
drafts under `landing-work/` (for example `v2-panels-with-screens/index.html`).

Notes as I went: `notes-01-create-paths.md`, `notes-02-after-account.md` in this folder.
