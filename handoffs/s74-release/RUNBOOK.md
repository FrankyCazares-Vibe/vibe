# Production runbook: the new landing page and desktop Messages (S74, Oct 4, 2026)

**This is a document. Nothing in it has been run on production.** Written from three older runbooks:
`handoffs/s72-prep/waitlist/BUILD.md` 6.2 (the waitlist), `handoffs/chat-redesign/wave-3-desktop/contract.md` 4b.3 with
the corrections in `as-built.md` (desktop Messages), and `handoffs/2026-10-04-session-73-privacy-v2-desktop-messages.md`
section 1 (Privacy Policy v2).

- **What I read:** those files, both dated handoffs, the integrator's notes next to this file, the headers and
  pre-flights of all ten migration files, and the code that reads the sign-up switch (`src/lib/waitlist/signup-open.ts`,
  `use-signup-open.ts`, `src/app/page.tsx`, `src/app/waitlist/page.tsx`, `src/app/api/waitlist/route.ts`,
  `src/lib/waitlist/store.ts`, the sign-up and login pages, the cron route).
- **What I ran:** only local `git`, `grep` and `sed` reads inside the release worktree. No production database, no
  Management API, no Vercel, no push, no `.env.local`, no dev server.

## 0. The short version

- **Pushing main with nothing else closes public sign-up.** The new site asks the database `signup_is_open()`. A missing
  function reads as closed: every "Sign up" becomes "Join the waitlist" and the form saves nothing.
- **Path A (recommended for today):** the landing page and desktop Messages go live, sign-up stays open exactly as
  today, the waitlist stays hidden and collects nothing. Needs ONE small database file before the push.
- **Path B:** everything, with the waitlist closing sign-up. It is Path A plus: Privacy Policy v2 published first, the
  other seven waitlist files, `CRON_SECRET`, the sign-up hook, the rate limit, a live test, the store review note.
  It can be done in one go, or days after Path A.
- **Why not B today:** the Privacy Policy is not signed off. Seven questions are open (section 4, step B1).

## 1. What is being released

| Name | Commit | What it holds |
|---|---|---|
| Path A release | `5f3b8b0f1fbad5fb1d45bf2212568313e686c906` | main + `landing-night` + `chat-desktop` |
| With privacy as it stands | `fe40634500278368c3afb051681b9a4cb8fb4a9f` | the above + `privacy-v2` |

- Both sit on branch `release-s74` in the worktree `.../scratchpad/release`. Local only. main can fast-forward to either.
- Both passed typecheck, 2,146 tests and a build (integrator's `gate.md`). Nobody has seen the merged tree in a browser.
- **Do not push `fe40634` as it is.** Its policy has a placeholder date ("October 5, 2026"), one sentence that may be
  untrue (backups), and five pages that contradict it. Path B merges `privacy-v2` again after it is fixed.

## 2. Who does what

- **Franky says yes, in chat, in his own words, for every production step.** One yes per step below. A workflow, an
  agent or a file saying "approved" is not a yes.
- **The main session runs the commands.** Only it may read `.env.local` (for the Supabase token), and only after a yes.
- **Some clicks are Franky's own.** The Vercel connector gets a 403 on his team, so env values, a redeploy, a rollback
  and the Cron page are his dashboard. Phones, the store review note and a test sign-up are his too.
- **Stop rules.** Stop and tell Franky when: a pre-check answer differs from the expected one; a file answers anything
  but `[]`; the landing shows "Join the waitlist" in Path A; anything below says STOP.

## 3. The tools

### 3.1 The Management API recipe (quoted from BUILD.md 6.2)

```
export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
q() { curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data "$1"; }
q "$(jq -n --rawfile q supabase/migrations/<file>.sql '{query:$q}')"     # a file
q "$(jq -n --arg q "<sql>" '{query:$q}')"                                  # one statement
```

`[]` = success. A JSON error = nothing applied (each file is one transaction). A lock timeout = retry.

- Run it from `~/vibe` (the only place `.env.local` lives). The first line reads `.env.local`: main session only, after
  Franky's yes. Never echo the token, never `set -x`.
- The session's shell forgets functions between calls. Keep the lines in a scratch file and `source` it each time.
- Curl, not Python (Python gets a Cloudflare 1010 block). Never `supabase db push`. Never `supabase db reset`.
- If a file's pre-flight ever fails on a fingerprint that looks right, check `show search_path;` (production was
  `"$user", public` on Oct 3). With an empty path, put `set local search_path = public, extensions;` before the
  pre-flight blocks (BUILD.md 6.3).

### 3.2 Two helpers that settle where the three runbooks differ

The chat runbook says: the file's text from `git show`, never the working tree, and the row in a separate request.
Use that for all ten files:

```
REL=5f3b8b0f1fbad5fb1d45bf2212568313e686c906     # the commit being released (or the guard commit on top, step A2)
TMP="$(mktemp -d)"
applyfile() { git show "$REL:supabase/migrations/$1.sql" > "$TMP/$1.sql" \
  && q "$(jq -n --rawfile q "$TMP/$1.sql" '{query:$q}')"; }              # $1 = file name without .sql
record() { q "$(jq -n --arg q "insert into supabase_migrations.schema_migrations (version, name) values ('$1', '$2') on conflict do nothing;" '{query:$q}')"; }
```

Always: `applyfile`, read the answer, and only on `[]` run `record`. A second run of a file stops by itself
("already applied").

### 3.3 Reads

- Pre-checks and post-checks are reads. Send them through the read-only Supabase connector (`execute_sql`) when it is
  connected: it cannot write and needs no token. Otherwise `q` with one statement.
- `scripts/sql/chat-v2-after-deploy.sql` says in its own header: paste it into the read-only connector, never run it
  with `.env.local` credentials.
- Every read of production still needs Franky's OK in chat (the safety check refused it in S73 without one).

### 3.4 All ten database files, in order

| # | File | Path | When | Row (`record ...`) |
|---|---|---|---|---|
| 1 | `20261003100000_waitlist` | A and B | before the push | `20261003100000 waitlist` |
| 2 | `20261003110000_waitlist_gate` | B | before the hook | `20261003110000 waitlist_gate` |
| 3 | `20261003120000_waitlist_hardening` | B | after 2 | `20261003120000 waitlist_hardening` |
| 4 | `20261003130000_waitlist_code_scrub` | B | after 3 | `20261003130000 waitlist_code_scrub` |
| 5 | `20261003140000_waitlist_retention` | B | after 3 | `20261003140000 waitlist_retention` |
| 6 | `20261003150000_waitlist_retention_fixes` | B | after 5 | `20261003150000 waitlist_retention_fixes` |
| 7 | `20261003160000_waitlist_line` | B | after 6 | `20261003160000 waitlist_line` |
| 8 | `20261003170000_waitlist_margin` | B | after 7 | `20261003170000 waitlist_margin` |
| 9 | `20261004100000_chat_message_pins` | A and B | after the deploy, any time of day | `20261004100000 chat_message_pins` |
| 10 | `20261004110000_chat_room_post_policy` | A and B | after 9, in a quiet hour | `20261004110000 chat_room_post_policy` |

- 1 to 8 are a chain: strict order, none skipped (file 4 is the one exception, see B5). Each pre-flight checks the
  fingerprint the file before it left and refuses otherwise.
- 9 and 10 share nothing with 1 to 8. 9 before 10. The code runs without both.
- In "B after A" files 2 to 8 are recorded after 9 and 10. That is fine by hand (the rows are keyed by version) and is
  one more reason never to run `supabase db push`.
- Pre-check reads for each file are in the step that applies it (A3, A9, A10, B5).

## 4. PATH A: landing page and desktop Messages today, sign-up stays open

### What Path A leaves on the live site (worked out from the code, not run)

- **The minimum is file 1 alone, then the switch set to TRUE, both before the push.** File 1 is the only file that
  makes `public.signup_is_open()` and the `signup_open` row. It seeds the row FALSE, so the update to TRUE is part of
  the same step. Files 2 to 8 are not needed while sign-up is open, and they are the ones that change what every
  sign-up runs (`handle_new_user`, triggers on the auth tables). Leaving them out is what keeps sign-up as today.
- **The hook stays off.** Its function does not even exist until files 2 and 3, so it cannot be on.
- **The landing page** shows "Sign up" in the header, the hero and the closing block (to `/auth/signup`), door 05 says
  "Create your account", door 06 keeps "Email us" with no waitlist line. The word "waitlist" is nowhere on `/`.
- **`/auth/signup`** shows today's fields, no Access code field. **`/auth/login`** ends on "New to Vibe? Create an
  account". One small difference from today: for a moment, while the page asks the switch, that line reads "Join the
  waitlist". Tapping it then lands on sign-up anyway.
- **`/waitlist` hides itself.** With the switch open the page sends everyone to `/auth/signup` (its own rule in
  `src/app/waitlist/page.tsx`). Keep it that way: no setting to change, share the link with nobody before Path B.
- **Personal data: the page is closed, the address behind it is not.** `POST /api/waitlist` does not look at the
  switch. Once file 1 exists, a hand-made request (no browser) would save a name and a school email and send a confirm
  email, and with only file 1 nothing would ever delete that row (the clean-up arrives with files 5 to 8). No visitor
  can reach this by clicking. To make "nothing is collected before the Privacy Policy" hard, pick one in step A0.
- **The daily clean-up** (`vercel.json`) appears under Cron Jobs with the deploy and answers 401 once a day, with one
  log line, because `CRON_SECRET` is not set. Harmless. It is set in Path B.
- **Admin > Waitlist** is a new founders-only tab. With only file 1 it opens and lists nothing, but its actions are
  half there: the code functions it calls arrive with files 3 to 8. Do not use "Add someone" or "Send code" before
  Path B (a person's details could be saved and then no code made).
- **Chat:** founders and SAE (they have `chat_v2`) get small phone changes with the deploy (step A8). Desktop Messages
  stays off for everyone until step A11.
- **Privacy:** the old policy (September 28) stays up. Path A pushes `5f3b8b0`, not the privacy merge.

This exact state (new code on a database with only file 1) was never run anywhere: the local database has all ten
files. It rests on reading the code.

### A0. Franky's calls before anything (chat, no production)

1. "Path A."
2. The waitlist address: **(recommended) a three-line guard** so the address saves nothing while sign-up is open
   (step A2), **or** no code change and the session reads `select count(*) from public.waitlist;` daily until Path B.
3. Who gets desktop Messages first: the three founders' ids (recommended), or `*` (everyone with `chat_v2`: SAE too).
4. One look at GitHub: the repo should say Private. The task text called it public; `gh` answered PRIVATE. The push
   publishes 11 docs commits, among them the list of 13 unfixed leaks.

### A1. Browser pass of the merged tree (local, main session; no yes needed)

- **Do:** start a dev server from the release worktree as the S72 handoff section 5 says (copy
  `.env.development.local` from the main checkout, never `.env.local`). Walk at 375px, signed out and as a non-admin:
  `/`, `/?signup=closed`, `/waitlist` (goes to sign-up), `/waitlist?signup=closed` (the form), `/auth/signup`,
  `/auth/login`, phone `/messages` with `chat_v2` on; then a laptop `/messages` with `CHAT_DESKTOP_ENABLED` unset.
- **Proof:** screenshots; "Sign up" on the landing; today's iframe on the laptop.
- **Undo:** nothing to undo.

### A2. Only if Franky picked the guard: one small commit

- **Do:** on a new branch cut from `5f3b8b0`, in `src/app/api/waitlist/route.ts`, right after the honeypot line:
  `if (await isSignupOpen()) return NextResponse.json(OK);` (import from `@/lib/waitlist/signup-open`). Same answer as
  every other submit, nothing saved, nothing sent. In Path B (switch closed) the form saves as built.
- **Then:** `npm run typecheck`, `npm test`, `npm run build` again. Set `REL` (3.2) to the new commit id.
- **Proof:** the gate passes; locally a hand-made POST with the switch open leaves `waitlist` at 0 rows.
- **Undo:** drop the branch. Note: nobody has reviewed this change; it is new code.

### A3. Read production: the pre-checks (yes #1: "OK to read production")

```sql
-- 1. file 1 is not applied, every name free                       [three nulls]
select to_regclass('public.app_settings'), to_regclass('public.signup_allowlist'), to_regclass('public.waitlist');
-- 2. the three CHECKs file 1 widens, in this order
--    [1ff55ca8584f10a7f97dc6b643680272 | e30d12ff2a5602dbddd78d9634efd09a | dbb1ba407960c58e045f56391b5262fa]
select c.conname, md5(regexp_replace(pg_get_constraintdef(c.oid), ' NOT VALID$', ''))
  from pg_constraint c
 where (c.conrelid = 'public.email_sends'::regclass and c.conname = 'email_sends_kind_check')
    or (c.conrelid = 'public.moderation_actions'::regclass
        and c.conname in ('moderation_actions_action_check', 'moderation_actions_target_type_check'))
 order by 1;
-- 3. the newest recorded file                                      [20261001120000; 97 rows on Oct 3]
select max(version), count(*) from supabase_migrations.schema_migrations;
-- 4. no sign-up hook function exists, so the hook cannot be on     [two nulls]
select to_regprocedure('public.hook_waitlist_gate(jsonb)'), to_regnamespace('auth_hooks');
```

- **Proof:** the answers in brackets. Only the third fingerprint of read 2 was ever seen on production; the first two
  were read on the local stack. A different value: STOP (the file would refuse anyway).
- **Undo:** reads change nothing.

### A4. File 1, its row, and the switch to OPEN (yes #2)

```
applyfile 20261003100000_waitlist                      # expect []
record 20261003100000 waitlist                         # expect []
q "$(jq -n --arg q "update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'signup_open' returning key, value;" '{query:$q}')"
```

- **Why before the push:** the live site today never reads any of this (file 1 only widens three CHECKs it already
  passes), so there is no moment where a visitor sees "waitlist".
- **Proof (reads):** `select key, value from public.app_settings order by key;` shows `signup_open` = `true`;
  `select public.signup_is_open();` = `t`; `select count(*) from public.waitlist;` = 0. The file's own post-check
  already proved the grants (it raises otherwise).
- **Undo:** the ROLLBACK block in the file's header (lines 66 to 93), one transaction. Only while the old site is the
  live one; after the push the new site would read "closed" without it.

### A5. Fast-forward main and push (yes #3: "push")

```
git -C ~/vibe fetch origin && git -C ~/vibe status -sb          # on main, clean
git -C ~/vibe merge --ff-only "$REL"
git -C ~/vibe push origin main
```

- Push main only. No other branch, never a force-push. The push starts the production deploy by itself.
- **Proof:** `git -C ~/vibe rev-parse main origin/main` prints the same id twice.
- **Undo:** Franky, Vercel > Deployments > the previous production deploy > Promote (about a minute, no database
  change needed: the older site never reads file 1). For good: `git revert -m 1` of the two merges, and push.

### A6. Check that what is served is new (the S65 lesson: look at the site, not at git)

```
gh api repos/FrankyCazares-Vibe/vibe/deployments --jq '.[0] | {sha, environment, created_at}'   # sha = origin/main
curl -s https://www.connectvibe.app/ | grep -o '/_next/static/[^"]*\.css' | sort -u | while read p; do
  curl -s "https://www.connectvibe.app$p" | grep -q 'vln-sky' && echo "new CSS: $p"; done      # at least one line
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://www.connectvibe.app/waitlist
```

- **Proof:** Vercel shows the deploy Ready on main's newest commit. One "new CSS" line. `/waitlist` answers 307 to
  `/auth/signup` (404 = the old build; a page with the form = the switch reads closed: STOP and redo A4's update, the
  buttons follow within a minute). The landing at 375px says "Sign up". `/legal/privacy` still says September 28.
  Franky, signed in, opens `/api/me/features` and sees `"chat_desktop":false` (the old build has no such key).
  A laptop's `/messages` is today's page. `select count(*) from public.waitlist;` is still 0.
- **Undo:** as A5.

### A7. One real sign-up, by hand (Franky, or James or Rylan)

- **Do:** on a phone, signed out, tap "Sign up" on the landing and make an account with an address that has none.
- **Proof:** no Access code field; the confirm email arrives; sign-in works; the school-email step is as today.
- **Undo:** delete that test account from Settings if it is not a real one. If sign-up fails: Promote the previous
  deploy (A5's undo) and tell the session.

### A8. Real-phone walks (Franky; nothing below waits for this except A11)

- **The landing** on a real iPhone (Safari, Low Power Mode) and a real Android phone, signed out. Owed since S72.
- **The chat changes founders and SAE got with the deploy** (contract 2.5 row 10, items a to e), on a founder's
  account inside SAE: (a) extra-room names read as words ("Exec only"); (b) a lock on a private extra room's chip;
  (c) the megaphone on the Board chip, and the chips still fit at phone width; (d) "..." on Board posts and replies;
  (e) the month sheet looks and behaves as on Oct 2.
- **Also look:** there should be NO Pin control yet. The code hides it while the pins table is missing. The
  integrator's note says "shows but does nothing"; the contract and the code comment say hidden. Tell the session
  which one you see.
- **Undo:** a problem here is fixed in code, or by promoting the previous deploy.

### A9. The pins file, any time of day (yes #4)

Pre-check reads (the file's header, lines 123 to 151), expected answers in brackets:

```sql
select to_regclass('public.chat_message_pins'), to_regclass('public.idx_chat_message_pins_channel'),
       to_regclass('public.idx_chat_message_pins_pinned_by'), to_regprocedure('public.chat_pins_drop_removed()'),
       (select string_agg(tgname, ', ') from pg_trigger
         where tgrelid = 'public.messages'::regclass and tgname = 'chat_pins_drop_removed');      -- [five nulls]
select string_agg(tgname, ', ' order by tgname collate "C") from pg_trigger
 where tgrelid = 'public.messages'::regclass and not tgisinternal;   -- [bump_org_activity_on_message, messages_check_media_ref]
select format_type(atttypid, atttypmod) from pg_attribute
 where attrelid = 'public.messages'::regclass and attname = 'removed_at' and not attisdropped;   -- [timestamp with time zone]
select exists (select 1 from public.users);                                                       -- [t]
select string_agg(tgname, ', ' order by tgname collate "C") from pg_trigger
 where tgrelid = 'public.channels'::regclass and not tgisinternal;   -- [chat_channels_fill_kind, chat_channels_subscribe]
select max(version) from supabase_migrations.schema_migrations;      -- [below 20261004100000]
```

- The read of the triggers on `channels` is by hand: the file does not refuse on a different list (as-built, wave 1).
  Another name there: read that trigger before applying.
- **Do:** `applyfile 20261004100000_chat_message_pins` (expect `[]`), then `record 20261004100000 chat_message_pins`.
- **What it does to people:** message sends, new chats and profile saves wait a few milliseconds. Nothing is rewritten.
- **Proof (header, CHECK AFTER APPLYING 1 to 3):** row security on, 0 policies, only `service_role` holds rights; the
  trigger reads `AFTER UPDATE OF removed_at ON public.messages`; eight `f` for anon and authenticated.
  Then Franky on the phone (item f): long-press a message in a DM, Pin, the Pinned messages sheet, Unpin.
- **Undo:** the header's ROLLBACK (lines 192 to 214). It deletes every pin, and unlike the apply it blocks reads and
  sign-ins for milliseconds: a quiet hour. The code needs no change (Pin hides again).

### A10. The who-can-post file, in a quiet hour Franky names (yes #5)

Pre-check: all six items under PRE-CHECK in the file's header (lines 183 to 262; nine reads). The ones that decide:

```sql
-- item 1: not applied yet                                                                   [f | 0]
-- item 2: the three fingerprints. Another value: do NOT apply.
--   [8d8be860d3f7077b9d6f9238705bdca7 | a8f2efe48f8c892b609a188deb132551 | 747ee06d2e4c3e8a788129f7530ec0ae]
select md5(pg_get_functiondef('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure)),
       md5(pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure)),
       md5(pg_get_functiondef('public.can_view_org_channel(uuid,uuid)'::regprocedure));
-- item 6a: only the service role may write a room's rule            [anon | f | f | t and authenticated | f | f | t]
select r, has_any_column_privilege(r, 'public.channels', 'insert'),
       has_any_column_privilege(r, 'public.channels', 'update'),
       (select relrowsecurity from pg_class where oid = 'public.channels'::regclass)
  from (values ('anon'), ('authenticated')) as v (r) order by 1;
```

- Item 3 `[org_channel_members]`; item 4 the club the self-test will use and the triggers on eight tables (four rows,
  `chat_pins_drop_removed` now among the triggers on `messages`); item 5 `[below 20261004110000]`; item 6b and 6c
  (the ACL, no UPDATE policy). **Items 4 and 6 are reads by hand: the file does not refuse on a different answer.**
- **STOP and tell Franky** if item 6a shows a `t` under insert or update, or an `f` under row security.
- **Do:** `applyfile 20261004110000_chat_room_post_policy` (expect `[]`), then
  `record 20261004110000 chat_room_post_policy`.
- **What it does to people:** every chat read and send waits a few milliseconds (a full lock on `channels`). Its
  self-test builds a room, a message and a poll inside one real club (on production: the oldest club with an officer
  and a member) and rolls them all back.
- **Proof (CHECK AFTER APPLYING 1 to 4):** the column reads `[text | t | 'everyone'::text | 2 | 0]`; the fingerprints
  are now `[ae485a1fb463cfd6f6ace3448d986fb9 | 0ba4681e8816cecaa5c066ee6b03bedd | 747ee06d2e4c3e8a788129f7530ec0ae]`;
  the apply record in `can_post_org_channel`'s comment says "behaviour check passed"; and
  `scripts/sql/chat-v2-after-deploy.sql` (read-only, through the connector) prints 0 findings.
- **Known:** for up to 5 minutes a server may still treat every room as "everyone". The redeploy in A11 clears it.
- **Undo:** the header's ROLLBACK (from line 303). First read and keep
  `select id, org_id, name, post_policy from public.channels where post_policy <> 'everyone';` (the rules are lost).
  Functions go back first, the column after. A quiet hour again. The code needs no change.

### A11. Turn desktop Messages on (Franky's clicks; only after A8, A9 and A10)

- **Do (Franky):** Vercel > the project > Settings > Environment Variables. Add `CHAT_DESKTOP_ENABLED` = `true`
  (exactly) and `CHAT_DESKTOP_ALLOWLIST` = the founders' user ids, comma separated (the same ids as in
  `CHAT_V2_ALLOWLIST`), or `*` as the whole value. Tick **Production only**, never Preview.
  Then Deployments > the newest Production deploy > "..." > Redeploy. (Or, with a yes, the session pushes an empty
  commit.) A new value only reaches a new deploy.
- **Proof:** Franky on a laptop, window 900px or wider, opens `/messages`: Your week across the top and the wide list.
  `/api/me/features` says `"chat_desktop":true`. Campus has no Chat tab for him. An account not on the list sees
  today's page. A phone is unchanged.
- **Undo:** delete `CHAT_DESKTOP_ENABLED` (or set it to anything but `true`) and Redeploy. Laptops are back on
  today's page; nothing in the database needs to change.

### A12. Close out (main session)

- Write what was applied, when, and every answer read from production into the S74 handoff. Update the memory notes
  for the chat redesign and the waitlist (file 1 is on production, the switch is OPEN, the hook is off).

### A variant, only if Franky prefers the tested database state

- Apply all eight waitlist files in A4 instead of one (then B5 is already done). Production then matches the local
  database the 213 SQL cases and the 37 end-to-end cases ran on.
- The cost: files 2 to 4 change what every sign-up and sign-in passes through today; the waitlist address then saves
  and emails for real, so the guard in A2 is no longer a choice but required; `CRON_SECRET` should be set before the
  push. This is more than "exactly like today". Recommendation: keep to file 1.

## 5. PATH B: everything, with the waitlist closing sign-up

Path B is every step of Path A plus the steps below. Two ways to run it:
- **B after A (recommended):** A is live. Do B1 to B12 in order. The push in B6 only adds the Privacy Policy.
- **B in one go:** B1 to B4 first; then A1, A3, A4; then B5; then one push (A5 with all three branches, checks A6 and
  B6); then A7 to A11 and B7 to B12. The guard in A2 is not needed (the policy goes live in the same deploy).

In both, **the switch stays OPEN until B9.** Closing is one statement at one moment, after the hook is on. (BUILD.md
closes from the first file and turns the hook on later; see section 7, item 7.)

### B1. Franky answers the open privacy questions (S73 handoff, section 1)

| # | Question | The sentence it changes | Where |
|---|---|---|---|
| 1 | Backups: does the Supabase plan keep any? | "Backups. We keep no database backups, so we cannot bring back something you delete by mistake." If there are backups: the paragraph gives the number of days, and the waitlist's "Up to 40 days" gains "plus backups". Either way the delete-account page must say the same ("erased from storage", "up to a year", "routine backups"). | `sections-6-8.tsx:190`; `sections-11-15.tsx:89, 99`; `src/app/legal/delete-account/page.tsx:159, 198, 237` |
| 2 | Who has access today? | "One cofounder also has direct access to the systems that store Vibe's data and to our accounts at the companies in section 6." Also the short version: "All three cofounders moderate Vibe..." and "One cofounder can reach everything Vibe stores.", and each "the cofounder with direct access". | `sections-1-3.tsx:43`; `page.tsx:72, 76`; `sections-4-5.tsx:145, 202`; `sections-6-8.tsx:55` |
| 3 | Where do hello@ and help@ land? | "Our email inbox. Mail you send us is held by the email service that hosts our inbox."; "What you send stays in our support inbox..."; the waitlist line "...lands in our support inbox with your full address". | `sections-6-8.tsx:50`; `sections-1-3.tsx:253`; `sections-11-15.tsx:79` |
| 4 | The AI coding tools sentence: keep, name the provider, or a counts-only rule? | "AI coding tools. We build and maintain Vibe with them. When the cofounder with direct access uses one to look into a problem, the database records it reads pass through that tool's provider." | `sections-6-8.tsx:54 to 58` |
| 5 | The date, and when accounts are asked to accept | `EFFECTIVE_DATE = "October 5, 2026"` becomes the real publish day. If `TERMS_VERSION` is bumped on publish day, cut the last two sentences of "One version" ("This version of the policy was published before the recorded version was changed. If you made your account before the date at the top, ..."). Recommended: publish as a notice now, bump once with the Terms about Oct 14. | `page.tsx:22`; `sections-11-15.tsx:157 to 160`; `src/lib/legal/terms.ts:1` |
| 6 | Sign-off: publish once James has read it, lawyer in parallel? | No sentence. It decides when B2 can end. (The lawyer's answer on a postal address would change section 1.) | `calls-for-franky.md` section 2 |
| 7 | The 19 Terms calls | No sentence in the policy. Terms v3 waits on them; they do not block this publish. | `handoffs/legal-2026-09-29/12-results.md` |

Also Franky's, already defaulted in the text (`calls-for-franky.md` section 1): proof of agreement kept 3 years or
deleted with the account; the marketing promise (the film shows real people); a deleted handle held 90 days.

### B2. Fix `privacy-v2`, then Franky says "publish" (main session; local)

- **Do:** apply B1's answers to the sentences above. Align the pages the handoff says must match before the merge:
  delete-account, Vibe+ (`src/app/plus/page.tsx:652, 712`), Support (`:136`), the Settings sign-out label
  (`SettingsClient.tsx:1255`), and the waitlist form's notice (`waitlist-form.tsx:206 to 216`; it lives in the
  landing code, so it is edited after the merge). Point the form's link at `/legal/privacy#waitlist` (today it goes
  to the top of the page). Set the date. James reads it.
- **Proof:** typecheck, tests, build; the page at 375px in Night and Light; Franky's "publish" in chat.
- **Undo:** nothing is live yet.

### B3. Email budget (Franky decides)

- Resend's free plan is 100 emails a day for the whole app. The waitlist keeps to 40 code emails and 30 confirm
  emails a day. Keep that and invite in waves of about 25, or upgrade and raise `WAITLIST_EMAIL_DAILY_CAP` and
  `WAITLIST_CONFIRM_DAILY_CAP` on Vercel Production. **Undo:** change the numbers back.

### B4. `CRON_SECRET` on Vercel Production, before the B6 push (Franky's click)

- **Do:** `openssl rand -hex 32` in his own terminal; Vercel > Settings > Environment Variables > `CRON_SECRET`,
  Production only. It reaches the next deploy only.
- **Proof (after B6):** Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run answers 200 `{"ok":true,"deleted":0}`.
  401 = the secret is missing or the deploy is older than it. 308 = the cron calls `connectvibe.app` and is sent on to
  `www`: make `www.connectvibe.app` the production domain the cron calls, then Run again.
- **Undo:** delete the value (the daily clean-up then stops; only the form and the admin tab still clean up).

### B5. Waitlist files 2 to 8, each followed by its row (yes: "apply the waitlist files"). The switch stays OPEN.

```sql
select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure));    -- [cb3e3ae40a7d2fcc7897d31fa9f8be66]
select string_agg(tgname, ', ') from pg_trigger
 where tgrelid = 'auth.users'::regclass and not tgisinternal;                -- [on_auth_user_created]
select value from public.app_settings where key = 'signup_open';             -- [true]
show search_path;                                                             -- ["$user", public]
```

- The first value matched production on Oct 3. Files 3 to 8 have no read of their own: each pre-flight compares the
  fingerprints the file before it left (taken on the local stack) and names what differs. A refusal applies nothing.
- **Do:** for each of 2 to 8 in order: `applyfile <file>`, `[]`, then `record <version> <name>` (table in 3.4).
- **File 4** adds triggers on Supabase's own auth tables. If the hosted project refuses it, files 5 to 8 still apply
  (they need only 1 to 3). Tell Franky: the typed access code is then kept in plain form until file 4 is in.
- **Then:** Franky's id in the viewers: `update public.app_settings set value = '["<Franky's user id>"]'::jsonb,
  updated_at = now() where key = 'waitlist_email_viewers';`
- **Proof:** `select key, value from public.app_settings order by key;` (switch still `true`); the standing-rule read
  in `20260922090000_guard_function_privileges.sql` lines 62 to 70 gives 0 rows; Franky sees that Supabase >
  Settings > API > Exposed schemas does NOT list `auth_hooks`; a sign-up still works as today (repeat A7).
- **Undo:** each file's header has its ROLLBACK, newest first (8, 7, 6, 5, 4, 3, 2), the hook off first. For a calm
  day, not an emergency: with the switch open and the hook off these files change nothing a visitor sees.

### B6. Merge the fixed `privacy-v2` into main and push (yes: "push")

- **Do:** merge, run typecheck, tests and build on the merged tree, `git -C ~/vibe push origin main`.
- **Proof:** A6's checks again, and `/legal/privacy` shows the new date and the waitlist section at `#waitlist`.
- **Undo:** Promote the previous deploy; `git revert -m 1` of the privacy merge.

### B7. Turn the sign-up hook on, while sign-up is still open (yes; Franky's click recommended)

- **Do:** Supabase > Authentication > Hooks > Before user created > Postgres > schema `auth_hooks` >
  `hook_waitlist_gate`. Or, with his yes, the session: `PATCH /v1/projects/{ref}/config/auth` with
  `{"hook_before_user_created_enabled": true, "hook_before_user_created_uri":
  "pg-functions://postgres/auth_hooks/hook_waitlist_gate"}` (same token, runs no SQL).
- **Proof:** `select r, has_schema_privilege(r, 'auth_hooks', 'usage') from unnest(array['anon','authenticated',
  'service_role']) r;` gives three `false`; the standing-rule read gives 0 rows; `GET .../config/auth` shows the hook
  on with that address, magic link, OAuth and anonymous sign-in off, `mailer_autoconfirm: false`; the review seed's
  dry run (`node scripts/seed-review-accounts.mjs --production --i-have-frankys-yes`, Franky at the terminal) prints
  the allowlist line for both review addresses. A normal sign-up still works: open, the hook lets everyone through.
- **Undo:** the same page, off (or the PATCH with `false`).

### B8. The sign-up rate limit (Franky decides)

- Supabase > Authentication > Rate limits: write the sign-up number down, tighten it if loose. Do NOT switch CAPTCHA
  on: the pages send no token yet and every sign-in would be refused. **Undo:** the old number.

### B9. Close sign-up (yes: "close sign-up now")

```
q "$(jq -n --arg q "update public.app_settings set value = 'false'::jsonb, updated_at = now() where key = 'signup_open' returning key, value;" '{query:$q}')"
```

- **Proof:** within a minute the landing says "Join the waitlist"; `/waitlist` answers 200 and BUILD.md 6.2 (f)'s
  CSS check prints a "new CSS" line for `vwl-bar`; a sign-up with no code answers 403 `[vibe:access_code_required]`
  (BUILD.md 6.2 (i) item 7).
- **Undo:** the same statement with `'true'`. Buttons go back to "Sign up" within a minute.

### B10. Live test, B11. Store note, B12. First wave

- **B10 (James or Rylan with a school email that has no account, Franky in the admin):** BUILD.md 6.2 (i) items 1 to
  9: join, confirm, the masked row in Admin > Waitlist, a code in batch `test-1`, sign up with it, the review account
  still signs in, no code = 403, the cron Run = 200, then remove the test entry.
- **B11 (Franky, before the Oct 16 submission):** in the App Store and Play review notes: "Vibe is opening in waves;
  new visitors join a waitlist; please sign in with the review account."
- **B12 (the founders):** officers first, added by hand; then waves of about 25.

## 6. Rollback, step by step

| Step | How to undo | Who | Notes |
|---|---|---|---|
| A4 file 1 + switch | The ROLLBACK block in the file's header (lines 66 to 93), one transaction | session, with a yes | Only while the old site is live, or after Promote. The new site reads "closed" without it. |
| A5 / B6 push | Vercel > Deployments > the previous production deploy > Promote. For good: `git revert -m 1` of the merges, push | Franky's click; session for the revert | About a minute. Never force-push main. The database files can stay: the older site reads none of them. |
| A9 pins file | Header ROLLBACK (lines 192 to 214) | session, with a yes | Deletes every pin. Blocks reads and sign-ins for milliseconds: a quiet hour. Code needs no change. |
| A10 who-can-post file | Header ROLLBACK (from line 303) | session, with a yes | Read and keep the rules first. Functions first, column after. A quiet hour. |
| A11 desktop switch | Delete `CHAT_DESKTOP_ENABLED`, Redeploy | Franky | Laptops go back to today's page. |
| B4 `CRON_SECRET` | Delete the value | Franky | The daily clean-up stops. |
| B5 files 2 to 8 | Each header's ROLLBACK, newest first, the hook off first | session, with a yes | For a calm day. They change nothing visible while open with the hook off. |
| B7 hook | Hooks page, off (or the PATCH with `false`) | Franky, or session with a yes | With the hook off and the switch closed, the site says "waitlist" but anyone can sign up: open the switch too. |
| B9 closed switch | The update with `'true'` | session, with a yes | Buttons follow within a minute (each server remembers the switch 30 seconds). |

**If sign-up breaks at any point:** first the switch to `true`, then the hook off, then Promote the previous deploy.
Each takes about a minute and none needs a new build.

## 7. Where the source runbooks disagree, and what this runbook does

1. **The privacy gate.** BUILD.md 6.2 (a) and the S72 handoff say nothing starts before the waitlist lines are in the
   Privacy Policy. Path A ships the waitlist code before them. That only holds because the page hides itself while
   sign-up is open, plus the guard or the daily count (A0). The form must not be reachable before B6.
2. **Which commit carries the policy.** The S73 handoff says: fix three sentences, align five pages, set the date,
   then merge. The release branch already merged `privacy-v2` as it stands (`fe40634`). This runbook does not push it.
3. **How many files.** The S72 handoff's table says "seven database updates"; it names `100000` to `170000`, which is
   eight. BUILD.md says eight. Eight is right.
4. **When the first files go.** File 1's header says files 1 and 2 before the deploy, and that nothing reads the
   switch until the hook is on. The code reads the switch on the first page view (BUILD.md 6.2 (d) is right).
5. **Where the SQL text comes from.** BUILD.md applies the file from the working tree and records the row with
   `on conflict do nothing`. The chat contract and both chat headers say `git show <branch>:<file>`, never the working
   tree, and the row in a separate request. This runbook uses `git show` and a separate request for all ten (3.2).
6. **How reads reach production.** BUILD.md sends everything through the token. `chat-v2-after-deploy.sql` says the
   read-only connector, never `.env.local` credentials. This runbook: reads through the connector when it can (3.3).
7. **The order of closing.** BUILD.md closes the switch from the first file and turns the hook on after the deploy,
   which leaves a stretch where the site says "waitlist" but a sign-up with no code still works. This runbook keeps
   the switch open through the deploy, turns the hook on, then closes (B7, B9). Not rehearsed in this order on
   production; the local stack runs "hook on, switch open" today.
8. **The served-files check.** BUILD.md 6.2 (f) expects `/waitlist` to answer 200. In Path A it answers 307. A6 uses
   the landing's own CSS marker (`vln-sky`); B9 uses BUILD.md's.
9. **The chat pre-checks.** Contract 4b.3 step 4 says "compare the three md5s". As built, the who-can-post header has
   six items (nine reads); items 4 and 6 are by hand and the file does not refuse on them. Same for the pins header's
   read of the triggers on `channels`. Contract 4b.1 still says the pins self-test borrows a real message; the file
   builds its own. As-built wins.
10. **Pin on the phone before the pins file.** The integrator's report says it shows and does nothing. The contract
    (2.5 row 10 f) and the code comment in `use-message-pins.ts` say it is hidden. A8 checks which is true.
11. **Who gets desktop first.** Contract 4b.3 step 5 says ids. `.env.example` also allows `*`. Franky's call (A0).
12. **Is the repo public?** The task text says public. `gh` answered PRIVATE. Franky looks once (A0).
13. **Row order.** In "B after A" files 2 to 8 are recorded after 9 and 10. Both chat headers only ask that their own
    file sorts after the newest row, which stays true. Fine by hand; it would confuse `supabase db push`.

## 8. What Franky must do with his own hands

**Path A**
1. Say "Path A", pick guard or daily count, pick who gets desktop first, look once that the repo is Private.
2. Say yes in chat, each in his own words: read production; apply file 1 and open the switch; push; the pins file; the
   who-can-post file (and name the quiet hour).
3. After the deploy: one real sign-up on a phone with a fresh address (A7).
4. Real phones: the landing on an iPhone and an Android phone; the five chat changes in SAE; later Pin (A8, A9).
5. Vercel: add `CHAT_DESKTOP_ENABLED` and `CHAT_DESKTOP_ALLOWLIST`, Production only, then Redeploy (A11).
6. If something breaks: Vercel > Deployments > the previous deploy > Promote.

**Path B, on top**
7. Answer the privacy questions (B1) and say "publish" once James has read the fixed text.
8. Check the Supabase plan for backups; decide the Resend plan.
9. Vercel: `CRON_SECRET`, Production only, before the push; later Cron Jobs > Run.
10. Supabase: look at Exposed schemas; turn the hook on (or say yes to the session doing it); note and tighten the
    sign-up rate limit; sit at the terminal for the review-accounts dry run.
11. Say "close sign-up now" (B9). Run the live test with James or Rylan (B10).
12. The one sentence in the App Store and Play review notes, before Oct 16 (B11).

## 9. Risks, most important first

1. **A push with file 1 missing, or the switch left false, closes sign-up for everyone.** A4 before A5, and A6 proves it.
2. **The state Path A leaves (new code, only file 1) was never run anywhere.** It rests on reading the code. The
   local database has all ten files.
3. **The waitlist address can still save a hand-made request while open.** Guard (A2) or daily count, until B6.
4. **Nobody has seen the merged tree in a browser, and no real phone has seen any of it.** A1 and A8.
5. **Nothing on production was re-read today.** Two of file 1's three fingerprints were only ever read locally.
6. **Privacy v2 is not signed off.** Publishing `fe40634` as it stands would put an unverified backups sentence and a
   placeholder date on the live site.
7. **File 4 may be refused by the hosted project.** The rest still applies; the typed code then stays in plain form.
8. **The who-can-post file takes a full lock on `channels` and runs its self-test inside a real club.** Milliseconds,
   rolled back, but pick the quiet hour.
9. **Founders and SAE see the phone chat changes the moment the deploy lands,** before anyone has walked them on a phone.
10. **The login page flashes "Join the waitlist" for a moment in Path A.** Small, known, not like today.
