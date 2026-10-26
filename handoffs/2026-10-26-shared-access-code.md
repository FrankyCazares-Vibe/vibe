# The shared access code (Sun Oct 25 to Mon Oct 26, 2026)

Franky, Oct 25, after an invite to Arash was slow to arrive: "build a mastr code, it tok a very long time to send".
Then: "Yes: apply the shared-code migration to production, push the app and the Privacy Policy, then make the code
(25 places, ends Oct 31 midnight) and give it to me."

## What it is
- One `VIBE-XXXX-XXXX` code Franky hands to friends (text, in person). It works on the normal sign-up page, in the
  same "Access code" box, while sign-up is closed.
- **School emails only** (iu.edu, purdue.edu or a subdomain: the club links' rule). **25 places.** **Ends Sat Oct 31
  at midnight Indianapolis time** (`2026-11-01 04:00+00`), when sign-up opens for everyone anyway.
- **A place is an account**, not a yes from the gate: an account whose metadata holds the code's hash (the Oct 3
  scrub puts it there) that is confirmed, or unconfirmed and under a day old. So failed sends (the email cap), retries
  and typos don't use places up, and a mistyped address gives its place back after a day. Sign-ups landing in the same
  instant can go a place or two over; someone with a confirmed account could free their place by editing their own
  metadata. The cap is a damage limit for five days, not a hard wall.
- It only skips the **first** email (the invite). Supabase still emails each person a verification code after they
  sign up: check Inbox AND Junk, as with every school-email test.
- The code itself is in no file and no commit (40 random bits behind a plain SHA-256 can be searched). Only its hash
  is on production. Franky has it from the session.

## What shipped
- **Database (production, applied Mon Oct 26 with Franky's yes):** `supabase/migrations/20261029100000_signup_master_code.sql`.
  `public.signup_master_codes` (hash, label, cap, approvals tally, end, off; RLS on, no grants to anon,
  authenticated or service_role; `created_at` pinned by a trigger so the 30-day limit can't be moved) and step 4b in
  `auth_hooks.hook_waitlist_gate`. Steps 0 to 5 otherwise byte-identical. Pre-flight read `0e5211f0` on production
  first; the post-check passed; after: gate md5 `8a0d16a7d7027252def84901f0e24555`, pin trigger
  `4966df683f47e0a1a708409ce5063018`, both equal to the local stack. History row renamed from the connector's
  `20261026192952` to `20261029100000`.
- **App (main 30f84183):** two new refusals with their words (`access_code_full`, `access_code_school_email`); a
  personal address puts the cursor in the email box; the "check your email" view says what to do for both kinds of
  code and shows Start over again (it can't be seen locally, where accounts confirm themselves).
- **Privacy Policy, dated Oct 25:** sections 3 (Making an account) and 11 (a new "A shared access code" paragraph and a
  table row). Page and text match, 1,319 of 1,319 sentences. Nothing new is collected about people: the code's row
  keeps no one; each account keeps the code's hash, as with any access code.

## Checked
- Three adversarial reviewers (security, regressions, rollout; the first run died on a dropped connection, the second
  finished): no bypass; 12 concurrent hook calls against a 3-place code let exactly 3 in; 213 existing gate checks
  (`scripts/sql/waitlist-gate-check.sql`) pass; retired IU domains and lookalikes refused. Six findings, all fixed.
- Local, through Supabase Auth: two school sign-ups in, Gmail refused (school email), third refused (full), a stale
  unconfirmed account gave its place back, then full again; no plain code kept in any account.
- Browser (local): both new messages show; the cursor goes to the email box. 4,062 tests, typecheck clean.

## Running it (counts only)
```sql
select m.label, m.max_uses, m.approvals, m.expires_at, m.off_at,
       (select count(*) from auth.users u
         where u.raw_user_meta_data ->> 'access_code_hash' = m.code_hash
           and (u.email_confirmed_at is not null
                or u.created_at > now() - interval '1 day')) as places_taken
  from public.signup_master_codes m;
```
- Turn it off: `update public.signup_master_codes set off_at = now() where label = 'friends before launch';`
- More places: `update public.signup_master_codes set max_uses = 40 where label = 'friends before launch';`
- A new code: generate locally (`generateAccessCode()` in `src/lib/waitlist/access-code.ts`), insert only
  `public.waitlist_code_hash('<code>')`. The end can be at most 30 days out.
- Rollback: the migration header (restore 20261021120000 section 2, drop the table and the trigger function, delete
  the history row).

## Notes for next time
- The `supabase` MCP server runs as `supabase_read_only_user` (it can't call `waitlist_code_hash`); writes and
  migrations go through the other Supabase connector with `project_id` `rqopjkimxbjkwdkpkbfq`, as `postgres`.
- `apply_migration`'s auto-timestamp row can sort before the repo's future-dated versions: find it by name.

## Live state (Mon Oct 26)
- Deploy for 30f84183 live (the live sign-up script carries the new words; the policy page shows the new paragraph
  and "October 25, 2026").
- Code row inserted 19:34 UTC (3:34 PM Indianapolis): label `friends before launch`, 25 places, 0 taken, 0 approvals,
  ends `2026-11-01 04:00+00`, not off. One row in the table. The hash was computed twice (local database and Node)
  and matched; the code was given to Franky in the session.
- Not yet proven on production end to end: no real sign-up has used the code (that would make an account). The first
  friend's sign-up is that test; read `places_taken` after it (query below).

## Owed
- Franky: text the code to friends; Arash can use it or his invite code (his invite went out Oct 25 at 5:48 PM; no
  sign-up had reached Supabase by then).
- After the first friend signs up: `places_taken` should read 1 (and their verification email arrives: Inbox and Junk).
- On launch weekend: if places run out early, raise `max_uses` (one line above) rather than making a second code.
