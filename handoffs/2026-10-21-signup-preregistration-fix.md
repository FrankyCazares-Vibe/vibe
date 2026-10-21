# Sign-up pre-registration fix (built Oct 20 to 21, 2026)

Branch `claude/signup-inbox-first`, cut from wave 1 (`claude/club-wave-1-ae4772`) and meant to ship WITH it.
**Not on main, not on production.** Design and evidence: the shared side-session notes folder
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
  that the Terms tick is recorded again at confirmation, and lists the new notice emails. Dated `<SHIP DAY>`.

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

## What Franky must approve (production database: one bundle with wave 1's)
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
