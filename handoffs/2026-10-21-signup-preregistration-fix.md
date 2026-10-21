# Sign-up pre-registration fix (built Oct 20 to 21, 2026)

Branch `claude/signup-inbox-first`, cut from wave 1 (`claude/club-wave-1-ae4772`) and shipped WITH it.
**SHIPPED Oct 21, 2026** (see "Shipped" below). Design and evidence: the shared side-session notes folder
(`prereg-design.md`, `prereg-critic.md`, `prereg-gotrue.md`, `prereg-map-flows.md`, `prereg-prod.md`,
`prereg-testing.md`).

## The problem, in plain English
Supabase keeps the password of whoever signs a school address up FIRST, as long as nobody has confirmed it yet. A
later sign-up for the same address only re-sends the code. So someone could sign up a student's address with a
password of their own; when the real student later signs up and types the emailed code, the stranger's password
still works and they get into the student's account. Sign-up is closed today, but access codes and wave 1's club
links already let people in, and sign-up opens to everyone on Oct 31. Reproduced locally before the fix.

## What the fix does
- **In the database (the real fix):** the first time an account is confirmed after Vibe emailed it a code or a link,
  a trigger removes the stored password, the starter name and the Terms tick that whoever signed up first chose.
  This happens inside Supabase's own write, before any session exists, so it works on every path: the sign-up page,
  the login page, the public code page, Supabase's own reset link (even if a mail scanner opens it), the app's
  Forgot password, an admin confirm. Admin-made accounts, seeds and review accounts are never touched (nothing
  was emailed to them).
- **On the pages:** the sign-up page and the login code box put back the password the person just typed, right
  after the code, and the sign-up page records their Terms tick again. An honest student sees nothing new.
  Anyone who confirms somewhere else gets one "Choose your password" screen (password + Terms box).
- **Supabase's own emails:** its reset, sign-in link and change-email emails become notices with no link and no
  code (template files in `supabase/templates/`). Vibe's own Forgot password is untouched.
- **No sign-in email changes:** Vibe never changes a sign-in email, so the database now refuses Supabase's
  self-service email change (it could have moved someone's own account onto a student's address).
- **Club links (wave 1):** a setup link no longer makes the club by itself after onboarding; it asks
  "Set up <club>?" once, with "Not me", which frees the link for the real president (a link freed twice is
  turned off, so a QR passed around can't keep letting people in: `SETUP_LINK_MAX_GIVE_BACKS` in store.ts).
- **Privacy Policy:** says confirming removes any earlier password, that we note when an account still needs one,
  that the Terms tick is recorded again at confirmation, and lists the new notice emails. Dated October 21, 2026.

## Proven (locally)
- Types clean; the whole test suite passes.
- SQL check of the trigger (`scripts/sql/first-confirm-check.sql`) passes.
- `scripts/prereg-e2e.mjs`: Tier A through the shared local Auth; Tier B through a second local Auth with email
  confirmation ON (production's setting): the attacker's sign-up, the student's own sign-up and code, the
  attacker's original code typed by the student, a mail scanner opening Supabase's reset link, a failed save,
  sign-out. All pass. Wave 1's club-link and the waitlist gate tests still pass.
- Browser walk at 375px, Night and Light, against Auth with confirmation ON: a pre-registered address signed up
  through the real sign-up page lands on onboarding with no extra screen; the stranger's password is refused,
  the student's works, the planted name is gone, the Terms tick is recorded again. The public code page leads to
  "Choose your password", then onboarding.

Production read Oct 21 (counts only, no records): 20 accounts, 0 confirmed without a password, 0 pending email
changes, all 20 passwords standard bcrypt (database password encryption off), 1 unconfirmed account (left alone),
2 triggers on auth.users, wave 1 not applied. Production's Auth was v2.197.0 on Oct 20 (same behaviour as the local
v2.189.0 on every path here).

To rehearse with confirmation ON again: `prereg-testing.md` section 2 in the side-session notes (a second local Auth
container, a small proxy, codes from Mailpit), then `node --no-warnings scripts/prereg-e2e.mjs --rehearsal
http://127.0.0.1:54331 --app <dev server>`.

## Shipped (Oct 21, 2026, about 01:30 to 01:50 Indianapolis time, Franky's yes in chat)
- **Database, in order:** wave 1's `20261021100000_club_officers`, `20261021110000_club_links`,
  `20261021120000_club_links_gate`, then A `20261022100000_password_needed_column`; after the deploy was live,
  B `20261022110000_first_confirm_drops_password` and C `20261022120000_no_self_service_email_change`. Each through
  the connector's apply_migration, each `schema_migrations` row renamed to its file's version (six rows, nothing
  else from today).
- **Code:** both Privacy Policy copies dated October 21, 2026 (checker PASS, 3674 tests pass), then
  `claude/signup-inbox-first` fast-forwarded onto main as `64004a1` (from `e91c92b`). Vercel production built it.
  Checked live before B: the policy shows the new date, `/c/<code>` serves, `/c/welcome` and
  `/auth/choose-password` exist, and the live sign-up and login bundles carry the "set the password right after the
  code" step.
- **Production Auth** was still v2.197.0 on the day, so nothing to re-read.
- **Fingerprints on production after:** gate `0e5211f051c1add744b9f70e06851e2e`, B `0dee9fac626997a918ba22447598c427`,
  C `0acc73dc7e7a8606ac52b2c2a0efe825`, every `club_link_*` function and `account_password_missing` equal to the
  local stack's. Five triggers on auth.users, all on: club_link_scrub_code, first_confirm_drops_password,
  no_self_service_email_change, on_auth_user_created, waitlist_scrub_access_code.
- **Counts after (no records read):** 20 accounts, 0 confirmed without a password, 0 owing a password, 0 email
  changes pending, 0 club links besides Franky's test link.
- **One slip, fixed the same morning:** the first apply of `club_links` dropped the comments inside three function
  bodies (claim, redeem_setup, pending). Same behaviour, but their fingerprints differed from the repo's, so they
  were replaced with the file's exact text (CREATE OR REPLACE keeps the grants) and that fix's own bookkeeping row
  was removed. The fingerprints now match.
- **Security advisor after:** nothing new beyond the expected: the two club-link tables are service-role only (RLS on,
  no policy, like 24 others), and `club_link_pending`, `club_link_redeem_setup` and `account_password_missing` are
  callable by the API roles under the standing rule and refuse them inside. A signed-out call to each returned
  42501 "not allowed" on production; the club_links table refused too.
- **Franky's test setup link:** "Vibe Test Club" (handle `vibe-test-club`, checked), one use, 7 days (ends Oct 28),
  made with SQL, so it shows in Admin › Clubs with no maker. The link itself was given to him in chat, not written
  here. Seen live at 375px: "Set up Vibe Test Club", Checked by Vibe, the sign-up form. After his test, hide the
  club (or cancel the link if unused) from Admin › Clubs.

## What Franky must approve (production database: one bundle with wave 1's), as planned before the ship
Wave 1's three files, then these three:
1. `20261022100000_password_needed_column.sql` (inert: a private column, the "confirm" consent source, a helper).
2. `20261022110000_first_confirm_drops_password.sql` (the trigger).
3. `20261022120000_no_self_service_email_change.sql` (refuses Supabase's self-service email change).

**Order on the day (no staged rollout):**
1. His yes. Read production's Auth version (`/auth/v1/health`); if newer than v2.197.0, re-read the source first.
2. Apply wave 1's three files and A.
3. Set the Privacy Policy date (both policies on this branch) to today; merge to main; check the live bundle.
4. The SAME DAY, after the deploy is live: apply B and C. Never B before the code (new students would end with no
   password), never the code days before B (the policy would describe something not yet true).
5. The dashboard steps below.
6. His live test with James's or Rylan's school address (their OK): sign up, sign out, sign in. Then hand out club
   links. `signup_open` flips Oct 29/31 only after all of this.

**Rollback:** drop B's trigger FIRST (one statement in its header), then roll the code back if needed. Never roll the
code back while B is live. B's header has the counts-only check and the one-statement fix for accounts wiped while
old code was live.

## Dashboard (Franky, about ten minutes, before club links go out and before launch night)
- Read back Authentication > Emails > Confirm signup: code only, no link.
- Paste the three notices (`supabase/templates/recovery.html`, `magic_link.html`, `email_change.html`, with their
  subjects from `supabase/config.toml`) into Reset password, Magic link and Change email address.
- Read the Redirect URLs list and Site URL: no wildcard on a host anyone can deploy to (`*.vercel.app` etc.).
- Read, change nothing: Confirm email ON (must stay ON), Secure email change ON, Secure password change, the
  before-user-created hook ON.
- Before the Change-email paste, production most likely still sends Supabase's default change email with a link;
  once C is applied that link is dead. Read production's current copy first, then paste.
- **Keep "Password changed" and "Email changed" notification emails OFF through launch.** His owed list (Oct 11,
  13, 18) says to turn them on: with this fix, every new student would get a "password changed" email right after
  confirming. Revisit in November. Secure password change can go on any time.

## Calls (each with a recommendation)
1. Yes to the six files on production, in the order above. **Recommend yes.**
2. Terms at confirmation: count the box ticked on the sign-up page minutes earlier as the fresh tick (LEAN), or show
   it again under the code (STRICT). **Recommend LEAN**; note it for James's lawyer file.
3. A 24-hour purge of unconfirmed accounts. **Recommend not now** (not needed for safety; the policy says kept).
4. Raise the 40-an-hour email cap before Oct 29 (already owed). **Recommend yes.**

## Runbook lines
- Never confirm a student by hand (dashboard Confirm user, or `email_confirm: true` without a password): it now
  leaves them with no password. Send them Forgot password.
- Never set a password with SQL: the trigger refuses a write that skips Supabase's own password update.
- Never turn on "Confirm email: off" (autoconfirm) in production while pending accounts exist.

## Not done / known
- Reading production's dashboard settings (only Franky can).
- The local stack sends the old email templates until it is restarted (not restarted: it's shared).
- `--with-rollback` in Tier B (rehearses dropping the trigger) was not run on the shared local database.

## Next
Ship with wave 1 (handoff `2026-10-20-club-view-wave-1.md`), then wave 2.
