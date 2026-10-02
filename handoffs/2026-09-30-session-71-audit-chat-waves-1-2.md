> **Session 72 starts at `2026-10-02-session-71-close-and-next-up.md`** (the short state and what is owed). This file is the full record of S71.

# Session 71 (2026-09-30, Mac): audit of chat waves 1 and 2, and a live key leak

**Read this before the S70 cloud handoff's Mac checklist.** This session read the four latest handoffs on `main`, then found the real newest one on the cloud branch (`git show origin/claude/relaxed-davinci-9d11h3:handoffs/2026-09-30-session-70-chat-wave-2-cloud.md`). It then ran two read-only audits, each finding checked by an independent skeptic:

- **Wave 1** (live since Sept 30): 9 lenses plus 4 gap probes, 35 agents; 89 findings kept, 1 refuted.
- **Wave 2** (the cloud branch, never run against a database): 8 lenses plus 4 gap probes, 34 agents; 93 findings kept, 0 refuted.

The audits changed no app code; the key fix in Part 1 was written afterwards (pushed as `a85b750`). Nothing was written to production. Migration B was run on the LOCAL database only, inside transactions that rolled back; afterwards there were 0 card tables and 0 card functions. `main` = `d48ade0`. The branch is untouched at `da22efa`. The S70 Mac checklist is still entirely open.

## WAVE 2 IS ON PRODUCTION (Oct 2, 00:44–00:48 UTC; Franky: "yes go to production")

- **Pre-check (read-only, all as expected):** `chat_polls` / `chat_removals` absent; the three fingerprints `747ee06d… / 8d8be860… / 0e7baa97…`; 0 card rows; no trigger on `channel_members`; `PostgreSQL 17.6 … gcc 15.2.0` (= the local stack); B's standing-rule scan: no offender (`rls_auto_enable()` returns `event_trigger`, excluded); 21 club rooms, 5 clubs; the function of C absent, the index present, anon has no SELECT on `messages`. The Vercel Preview of the merge candidate `57577c1` built.
- **Migration B** `20261001110000_chat_v2_cards` applied through the Management API at 00:44:21 UTC (HTTP 201, 0.8 s). The file sent = `git show origin/…:` of the branch head, md5 `000e32ab5b21a02eafd5f29615d847a9`; its SQL is line-for-line the locally proven rehearsal 2 (1,225 non-comment lines; only `rollback;` → `commit;`). APPLY RECORD on production: `2026-10-02 00:44 UTC: tables 5, functions 5, trigger 1; file md5 000e32ab…; probe: skipped: no club has a Lounge, a Board, an upcoming event, an owner or admin and a member below admin; notes: none`. 5 tables (RLS on, no client privilege, 0 rows), 5 functions, the trigger. Recorded in `schema_migrations`.
- **Migration C** `20261001120000_chat_latest_per_room` applied at 00:45:05 UTC (HTTP 201), md5 `ee0f9cfdf05bc7a16162f2bfd2226faa`: `chat_latest_per_channel` is invoker / stable / `search_path ""`, EXECUTE for anon, authenticated and service_role, not PUBLIC. Recorded. `schema_migrations` max = `20261001120000` (97 rows).
- **Merge:** `main` fast-forwarded to `57577c1` and pushed at 00:45:43 UTC; Vercel production deploy success at 00:47:37 UTC. B's md5 on `main` = the md5 applied.
- **After-deploy check on production:** `0 findings in 0 clubs; 5 clubs, 21 club rooms checked`.
- **Live, signed out:** `/`, `/auth/login`, `/legal/privacy`, `/support` 200; every chat route old and new 401; the login page's code carries one publishable key, no JWT-shaped key, no secret key.
- **Live, as Franky (GET only):** `chat_v2` false (the flag is not set yet); the thread list 200 with 18 threads, club rooms named `Club · Room`, no event room listed, previews on exactly the three rooms that hold a message (Finance Club Lounge and Board, SAE Lounge; the other eight rooms are empty in the database): the per-room function answers on production; Kelley Floor Board `can_post` false; a Lounge thread 200 with today's keys, 0 stubs; `/api/me/inbox` 404 (flag off); the calendar 200.
- **Also shipped in this merge:** the week header is just "Your week", centred (Franky).
- **Defaults taken for the three open calls of 17.5:** the fonts line stays (true 800 weight app-wide, 17.3 row 10); the Retry pill's dark ink stays (row 11); the screenshot commits were not squashed (it would not make the repo lighter: audit F21). Each is a one-line change if Franky wants the other answer.
- **THE FLAG IS ON (Oct 2, 00:56 UTC).** Franky added the three variables in Vercel (Production only) and the deploy of `a98ca3f` carried them. As Franky on production (GET only): `GET /api/me/features` → `chat_v2: true`; `GET /api/me/inbox` 200 with his 5 clubs (Finance Club Board + Lounge previews, SAE Lounge preview and next event "philo event", three empty clubs); `GET /api/orgs/sae/space?events=1` 200 (role owner; Lounge, Board, Officers, four event rooms, the custom room; upcoming: philo event). Note: an allow-listed person sees the new chat for ALL their clubs, not only SAE; members who are not on the list keep the old screens and see cards as their fallback text. The values: `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=df5ab44e-174f-4c53-a8bc-261c1c67e10b,5ecad222-7b3d-4049-9175-0b6096e38012,e3afb560-217e-4448-9a13-f10756a740ef` (Franky, James, Rylan; checked on production), `CHAT_V2_CLUBS=923896fb-c21e-4727-a164-037ba4e3d606` (SAE; one member today, Franky), then a redeploy.
- **Production has an upcoming event** for the phone test: SAE's "philo event", Oct 2 22:00 UTC, one RSVP.

**Still owed after go-live:** the real-phone walk (long-press on cards, the sheets, Board replies, Back while posting, the keyboard, Android Back, the iPhone swipe: contract 17.9 / 17.10 lists); F10 on a device; the wave-1 fixes M2–M5 and the Support page's Block wording (M1 / F04: with this merge blocked people ARE hidden from each other in club rooms, except an officer's Board post); the per-event Event-card cap; Report / Remove on text Board posts and replies before Oct 26 (17.2 L3); Terms v3 inputs.

## OCT 2, LATER: the week swipes, and a month calendar (amendment 4; Franky's first phone test)

Franky tried the new chat on his phone: "everything seems to work", and asked for two things that were in his Option 3 pick and had been cut from wave 2: swipe the week strip to see next week, and tap a day to open the whole calendar "kind of like a modal". Built the same day (one builder, two reviewers, one repair, then the orchestrator's browser walk), commit `00257b5` on `main`. Contract **17.11**; the order is `handoffs/chat-redesign/wave-2-build/S71-amendment-4.md`, notes `S71d-build-notes.md` / `S71d-repair-notes.md`.

- **The week strip:** swipe left = next week, right = the week before (4 weeks back to 26 ahead). The title stays centred and alone: `Your week` / `Next week` / `Last week` / `Oct 12 – 18`. A `This week` pill appears only when you are on another week. Two faint chevrons at the strip's edges say it moves (one line to turn off: `EDGE_HINTS_AT_REST` in `YourWeek.tsx`). On another week a card says the weekday (`Sun 7 PM`).
- **The month sheet:** tap the title or any day. Dots on days with RSVPs, today ringed, the picked day's plans listed, a plan opens its event chat, `Today` pill, month arrows or a swipe on the grid. Back closes only the sheet. Closing on a day of another week moves the strip to that week. It is a bottom sheet like the app's others; the mockup (`R3_Month`) hung it from the top.
- **Scope:** phone only, behind `chat_v2`. No route, no SQL, no migration (the calendar route already takes any range). Nothing a flag-off user reaches changed.
- **Gates:** `tsc` exit 0; `npm test` 1,839 / 1,839 (25 new); eslint clean on the changed files. Walked at 375px on the local stack in Light and Night with real drags and the real Back (the list is in 17.11); flag-off account unchanged.
- **Production:** `main` fast-forwarded `c0e4db2` → `00257b5`, pushed, Vercel deploy success at 14:42 UTC. Checked live as Franky at 375px (reads only): the title `Your week`, the two edge chevrons, `Next week` → `Next week, October 5 to 11` with the `This week` pill, a day tap opens the sheet (`October 2026 … Tue, Oct 6 · No plans`, history `sheet: 1`), Back closes only the sheet, `scrollWidth` 375.
- **Not walked (needs Franky's phone):** a real finger: the swipe next to the iPhone's edge-back gesture, the sheet's drag-to-close against the grid's swipe, a 320px-wide phone.

## Part 1. FIXED the same evening: the live site shipped the database master key

The code for `https://www.connectvibe.app/auth/login` (chunk `2szoa-o94f9it.js`) inlines a Supabase JWT with `role: service_role` for project `rqopjkimxbjkwdkpkbfq`, in the slot for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Its sha256 matches `SUPABASE_SERVICE_ROLE_KEY` in the Mac's `.env.local`, so it is the real, working master key. Anyone can copy it and read or change every row: emails, DMs, club messages, resumes, private fields.

- The Mac's `.env.local` is right. Only Vercel Production (and possibly Preview) is wrong.
- The Vercel project also carries integration-made new-style keys (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, green lightning icon, added Sep 1). The app does not read them.
- **How long:** the Vercel row `NEXT_PUBLIC_SUPABASE_ANON_KEY` reads "Added Apr 30" (set by hand: lock icon, no integration bolt; type Secret; Production and Preview), and the key inside was created the same day. So it was most likely wrong from the first deploy. Vercel may show the original add date even after edits, so treat it as "possibly since the site first went live". Only 24 h of Supabase logs survive; they show no use from outside Vercel.
- **Side effect worth knowing:** `server.ts` and `middleware.ts` used that same value as the "anon" key, so every SIGNED-OUT server request ran with master privileges (RLS bypassed). After the fix they run as the real anon role, like local dev always did. Smoke-test signed-out pages after the deploy: landing, a public profile, `/posts/<id>`, `/orgs/<handle>`, login, password reset.
- **Why the Vercel row cannot just be edited:** a Secret-type variable cannot hold a `NEXT_PUBLIC_` value ("can't be changed to Config"). Delete and recreate it as Config, or (done in code, below) stop depending on it.
- **The code fix (S71, built and tested, NOT pushed until Franky says yes):** `src/lib/supabase/key-guard.ts` + `next.config.ts` + `env.ts`. At BUILD time the public key is chosen from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (set by the Supabase–Vercel integration) then `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a secret-kind key (service_role JWT or `sb_secret_`) is never chosen, a build with nothing safe refuses, and `env.ts` refuses to use a secret key at runtime. Next copies any `NEXT_PUBLIC_*` variable the code mentions into the browser files, so the swap uses `next.config.ts` `env`, not a runtime check.
  - **Proof:** a real `next build` with a fake master key planted in the bad variable. Control (today's code): the fake key is in 1 browser file and 7 server files. Patched: 0 and 0, and the publishable key is in 1 and 7. Only-secret-set refuses to build; nothing set still builds. `npm test` 1383/1383 (9 new), typecheck and eslint clean.
  - **Local compatibility test** (`scratchpad/keytest.mjs`, local stack): supabase-js 2.105 and @supabase/ssr 0.6.1 pass 10/10 checks with `sb_publishable_` and `sb_secret_` (anon read, password sign-in, session cookie getUser, RLS read, service read, `auth.admin.listUsers`, `storage.listBuckets`), identical to the legacy keys. Not tested: the hosted gateway itself.
  - **Known consequence:** Preview builds (non-`main` branches) will REFUSE to build until their `NEXT_PUBLIC_SUPABASE_ANON_KEY` is fixed or a Preview `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exists (the integration's one is Production-only). That is the fail-closed direction.
- **DONE (Sept 30, evening):**
  1. `a85b750` pushed and deployed (Vercel success). The live login page's code carries no JWT-shaped key and no real `sb_secret_` key, only a `sb_publishable_` one. The hosted Supabase gateway accepted that publishable key in both header forms (200).
  2. Franky made a new Supabase secret key `vercel`, put it in the Vercel row `SUPABASE_SERVICE_ROLE_KEY` (server-only), redeployed, and walked the app signed in and signed out: working.
  3. Franky disabled Supabase's legacy JWT API keys. **Disabled at 2026-10-01T02:50:30 UTC.** Verified from outside: the leaked service_role key now gets HTTP 401 "Legacy API keys are disabled" on `/auth/v1/settings` and `/rest/v1/`. Live pages `/`, `/auth/login`, `/legal/privacy`, `/support` return 200.
- **Still to do (small):**
  - Franky's Mac `.env.local`: replace `NEXT_PUBLIC_SUPABASE_ANON_KEY` with a publishable key and `SUPABASE_SERVICE_ROLE_KEY` with a secret key (a `mac` one is best). Until then, anything run against production from the Mac (scripts) fails with 401. `.env.development.local` (local stack) is unaffected.
  - Vercel row `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Secret type, Production + Preview) still holds the old, now-dead master key; the build ignores it and logs a warning. Delete it and recreate it as type **Config** with the publishable key, for Production and Preview. Until then Preview builds (non-`main` branches) REFUSE to build, because the integration's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is Production-only.
  - Vercel integration rows `SUPABASE_ANON_KEY` and `SUPABASE_JWT_SECRET` (and the Postgres rows) are unused by the code. The two legacy ones are now dead keys; remove them when tidying.
  - **Exposure window and disclosure:** the wrong value was added Apr 30; the leak ran until the Sept 30 deploy and was killed at 02:50 UTC Oct 1. Only 24 h of Supabase logs existed (no outside use seen). Franky and James decide whether this counts as a possible data exposure for the Terms / privacy page and for anyone who must be told.
  - **After the fix**, signed-out server requests run as the real anon role (before, as service_role). The signed-out walk found nothing broken; watch for any public page that quietly relied on the old power.
  - The reviewer agents for the fix stalled (no result); the fix rests on the real-build proof, the local key test and the live checks above, not on an independent code review. A reviewer pass over `key-guard.ts` and the `next.config.ts` `env` swap would still be worth one slot.

## Done since the audit (Oct 1), on the wave 2 branch `claude/relaxed-davinci-9d11h3`

- `00e3f00` F01: migration B's step-8 self-test and the check script compared booleans as `true/false` (Postgres prints `t/f`); fixed.
- `ac731f0` F02 + F03 (Franky: "both"): migration B gains a fifth service-role-only table `chat_removals`; the officer/mod remove route writes `removed_by = null` and records the remover there. Event edits (title/time) and cancels rewrite the Event card's stored text ("Event cancelled: <title>"). Contract **section 17.7** has the details, the new flag-off rows, the superseded counts and two open points (a per-event cap on Event cards; pin two more things in 7.1).
- **Numbers the Mac practice run must expect now** (they supersede the S70 handoff's 27 / 1,704 / 4 tables / ~130): migration B 1,771 lines; **31** pinned constants (want_select + 25 want_con_* + 5 want_fn_*), all still EMPTY in the file; rehearsal 1 prints 31 NOTICE lines and stops with `chat-cards: constants are empty`; APPLY RECORD `tables 5, functions 5, trigger 1`; check script `all 181 cases passed`; `npm test` 1,700.
- Verified by the orchestrator at `ac731f0`: tsc clean, 1,700/1,700 tests, fresh rehearsal 1 = 31 constants, full rolled-back run passes with 181 cases, local database identical before and after.
- **Next (step 2 of the Mac checklist):** merge `origin/main` into the branch (conflict-free; fixes the handoff's `--ff-only`), pg_dump the local database, re-run `node scripts/local-seed.mjs` the same UTC day (its fixture event ends 2026-10-05 01:00 UTC), rehearsal 1 → paste the 31 constants → rehearsal 2 → the real LOCAL apply (`docker exec … psql`; psql is not installed on the Mac) → the three check scripts → commit the constants. Production stays untouched until Franky's yes.

## Step 2 DONE (Oct 1): migration B applied to the LOCAL database

On branch `claude/relaxed-davinci-9d11h3` (head `49ee404`, pushed):
- `5205a4a` merged `main` into the branch (conflict-free), so the handoff's later `--ff-only` merge works.
- Local database dumped first (`scratchpad/step2/local-before-B.dump`, session-only); seed re-run the same UTC day.
- Rehearsal 1 printed 31 constants and stopped as designed; they and the version (`PostgreSQL 17.6 … gcc 15.2.0`, the same build as production) are pasted and committed (`49ee404`), with the COST section filled from rolled-back fixtures (reply count 0.5-0.8 ms on 100 posts / 2,000 replies; one vote 0.5 ms; the whole file ~90 ms; locks SHARE ROW EXCLUSIVE on messages, channels, users, channel_members, no ACCESS EXCLUSIVE on a live table).
- Rehearsal 2 green; the real LOCAL apply committed (APPLY RECORD `tables 5, functions 5, trigger 1`, probe passed, md5 `d5a05bb3…` of the pre-COST file).
- Checks on the migrated local database: `chat-v2-rooms-check` 200/200; `chat-v2-after-deploy` 0 findings (12 clubs, 45 rooms); `chat-v2-cards-check` all 181 passed, no warnings; the seed added its 3 cards once and changed nothing the second time.
- Code: `tsc` clean; `npm test` 1,709/1,709; a local `next build` of the branch compiles cleanly with a proper public key (the 4 new routes in the output).
- New fact for the rollback text: on Supabase a `DROP TRIGGER` makes supautils lock 23 auth/storage/realtime tables (sign-ins wait); written into B's ROLLBACK paragraph.
- **The branch's Vercel Preview builds now FAIL on purpose**: the key guard (from main) refuses Preview's `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which still holds the dead service key, and the integration's publishable key is Production-only. Reproduced locally (same refusal). Fix = the Vercel clean-up in Part 1 (recreate the row as Config with the publishable key for Production AND Preview). Production builds are unaffected.

**Next, in order:** (3) the HTTP pass against the local database with a local `next dev` and the seed accounts (contract 13.3 step 2 + 17.5 + 17.7's new rows); (4) `GET /api/me/features` with the flag on locally; (5) the browser walk at 375px, flag ON and OFF, Light and Night, as blake and avery; then production: the read-only PRE-CHECK → **Franky's yes** → apply B at a quiet hour (Management API; md5 of the pushed file) → record it → merge the branch to `main` → the after-deploy check → the Production-only flag env for the three founders + SAE → redeploy → first phone test (create an upcoming event first: none exists on production).

## Step 3 DONE (Oct 1): the HTTP pass, and what it found

Branch head `ef40404` (pushed). Details: contract **section 17.8**.
- **First real run of the cloud's routes**, local `next dev` + local database, flag on for avery / blake / emery, off for casey / drew: remove route + `chat_removals` 18/18; inbox / space / calendar / Event card refresh 20/21; regression 27/28; cards / votes / blocking 29/33; a verifier re-ran every non-pass and 10 extra checklist cases.
- **Bug found and fixed: shared preview windows.** One busy room pushed other rooms' newest message out of the Messages lists (also in the old list that is LIVE: a DM request can leave Requests while other DMs are busy). Fix = **migration C** `20261001120000_chat_latest_per_room.sql` (one function, the newest k rows per room, caller's RLS) + one helper used by the thread list, the Messages home, Otto and the badge; a database without C keeps today's query. Applied to the LOCAL database; live proof: the blank previews are back.
- **Bug found and fixed:** a NUL / broken character in a card answered "try again" forever; invisible-only questions and options were accepted. Now clear 400s.
- **My mistake, caught by the builder:** the first order for C revoked the function from `anon`, which breaks the standing rule (a refused function crashes this Postgres image; it crashed the LOCAL database once, a second of recovery). Corrected before review: anon keeps EXECUTE and is refused at the table.
- Gates: tsc clean, `npm test` 1,736/1,736, eslint clean, `chat-latest-check` 44/44, the three older SQL checks unchanged.
- **The production apply list is now B then C** (both need Franky's yes).
- The local test server (`vibe-wave2` in `.claude/launch.json`, port 3101, a local-only `.env.development.local` in the scratch worktree) is stopped by the app when the Mac idles: restart it with `preview_start`.

**Next:** step 4, the browser walk at 375px, flag ON (blake, avery) and OFF (casey), Light and Night (contract 13.3 step 4, 17.5 items 13-29); then production.

## Step 4, first pass DONE (Oct 1): the browser walk at phone size

Branch head `5f19643`. Details: contract **section 17.9**. Screenshots on the Mac: `handoffs/chat-redesign/s71-walk/` (not committed).
- **Right on real data:** Messages home (Night + Light), the club space, the Board as a member (no composer, the officer sentence), an event chat and back out one layer at a time, the "+" tray, a poll typed, posted and voted through the screen, the owner's Board composer, an officer Remove through the message menu (database: `removed_by` NULL + the `chat_removals` row), the author's "Removed by a club officer" card, the blocked pair hidden both ways, and with the flag OFF the old list, old thread and Campus › Chat unchanged. No sideways overflow anywhere; no console error from the new screens.
- **Confirmed bug (audit F06):** Back with a sheet open closes the whole club space and loses the draft. Not fixed yet.
- **Not walked yet:** long-press on cards, Take a spot, the RSVP / sign-up / share-event sheets, Board replies, the Officers room, Light inside the club, the keyboard, Safari, the store apps, a real phone; audit F05 and F07–F10 not re-tested.

**Next, in order:**
1. Fix the screen bugs the audit found and the walk confirmed (F06 first; then F05, F07, F08, F09, F10), then walk the "not walked" list.
2. Production, with **Franky's yes**: the read-only PRE-CHECK → apply **B, then C** at a quiet hour (Management API; the md5 of the pushed file for B) → record both in `schema_migrations` → merge the branch to `main` → the after-deploy check → the Production-only flag env for the three founders + SAE → redeploy → create an upcoming event on production → the first real phone test.
3. Small Vercel leftover: none (the ANON row is recreated as Config; Preview builds succeed).

## Screen bugs FIXED (Oct 1): F05, F06, F07, F08, F09

Branch head `6d79e20` (pushed). Details: contract **section 17.10**.
- **F06** Back with a sheet open now closes only the sheet (then the event chat, the space, the home). **F07** Back from the club page / a profile returns to the room. **F05** messages you watched arrive are read (0 new, was 3 new). **F08** no silently skipped messages after a locked phone. **F09** the event chat opens at the newest message and follows.
- Proof: tsc clean, `npm test` 1,814/1,814, no new lint error; walked by the orchestrator with real clicks and the browser's real Back (the sequence that failed before now passes).
- **F10 not done** (the keyboard height inside the store apps): needs a real device.
- **Still to walk** (two live sessions, a throttle, or a phone): Back while a poll is posting, a space closed under an open sheet, the 60-message gap after a hidden page, the keyboard, Android's system Back, the iPhone edge swipe; plus long-press on cards, Take a spot, the RSVP / sign-up / share-event sheets, Board replies, the Officers room, Light inside the club.

**Next:** production, with **Franky's yes**: read-only PRE-CHECK → apply **B, then C** at a quiet hour → record both → merge the branch to `main` → the after-deploy check → the Production-only flag env for the three founders + SAE → redeploy → create an upcoming event on production → the first real phone test (which is also where the list above gets walked on a real phone).

## The short list: what to do, in order

**Part 1 is done** (the leaked key was killed Sept 30 at 02:50 UTC Oct 1; small clean-ups remain, listed there).

**Wave 1 fixes worth shipping now** (small; details in Part 2):
- M3: the old inboxes treat a club room as a DM with a random member. The server sends `peer` for every channel type; send it only for DMs.
- M4: "Clear chat history" on a club room fakes success, then everything comes back. Hide it on club rooms and refuse in the route.
- M5: desktop Campus › Chat never marks a club room read.
- M2: a hidden club's officers can still delete its events through the raw API, which cascades away the event chat. Add a `hidden_at` check to `events_delete_manager` and `posts_delete_club_officer`.
- M1 together with wave-2 F04: the live Support page and the block confirm promise that blocking hides someone's content. That is false in club rooms today. After wave 2 it is still false for an officer's Board post, even with the flag OFF, which is what Apple's reviewer sees on Oct 16. Fix the wording now; decide F04 before the submission.

**Wave 2, before the Mac checklist's step 2 (migration B):**
- **F01 (high) — FIXED on the branch, commit `00e3f00` (pushed to `claude/relaxed-davinci-9d11h3`, Sept 30 evening).** Proof: local database, one rolled-back transaction per run. The unpatched file aborts at step 8 (`signup_shape=signup/f/t/0:1`); the patched file passes the behaviour check, writes its APPLY RECORD, and the check script ends "all 164 cases passed"; the database afterwards equals the database before (no card tables or functions, 63 messages, 51 channels). The one `WARNING` line in that output was the test harness's own nested `begin;`, not a chat-cards warning. The 27 step-7 constants are untouched (still empty on the branch: they are pasted in the Mac rehearsal, step 2 of the checklist). Original finding: migration B's step-8 self-test compares booleans as `true/false` against Postgres's `t/f`. It aborts every real run that has a fixture club, which means rehearsal 2 locally, and production as soon as SAE gets a posting member. `chat-v2-cards-check.sql` fails at case A2 on every run. The fix is `::text` casts at migration `:1415` and at check `:352, :357-358, :373, :415, :803-809`. With the casts: "behaviour check passed", "all 164 cases passed", and the 27 rehearsal-1 constants stay valid.
- **F22:** the seed's fixture event ends 2026-10-05 01:00 UTC. Re-run `node scripts/local-seed.mjs` on the same UTC day as rehearsal 2, or step 8 quietly skips.
- **F23:** `psql` is not installed on the Mac. The tested local apply is `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select set_config('chat_cards.file_md5','<md5>',false)" -f - < supabase/migrations/20261001110000_chat_v2_cards.sql`.
- **F02:** after an officer or mod removes a message, its author can read `removed_by` on their own row and learn who removed it. Move the remover to a service-role-only table before B is applied.
- **F03:** an Event card's text keeps the old day and time after the event is moved or cancelled, in every old screen and in the home previews. Decide the fallback format before the first card exists (drop the time, or rewrite on event PATCH/DELETE).
- **F19:** the handoff's step 7 `git merge --ff-only` refuses, because `main` moved to `d48ade0` (4 legal docs commits). `git merge origin/main` on the branch, or a rebase, is conflict-free (merge-tree clean). Do that first.
- **F21:** squashing the screenshot commits does not make the repo lighter, and the commit list in 17.5 is wrong. See the item.

**Wave 2, inside the Mac windows (screens):** F05–F10 are real data-flow and history bugs the mocked screenshots could not show:
- a live-read room still counts as unread;
- back with a sheet open closes the whole space;
- back from a club page lands on the home;
- a locked phone skips messages sent meanwhile;
- the event chat opens at its oldest message;
- in the store apps, screens stay squashed after the keyboard closes.

**Before Oct 26:** F12–F17.
- A removed message can no longer be reported by anyone, and Vibe keeps no record.
- Admins can't see a reported poll's options.
- An @mention push opens the club page instead of the chat.
- One busy club wipes other clubs' previews on the home.
- The 1,000-row cut in the old inbox (the same finding as wave-1 M6).
- Chat polling could use up the Supabase free-plan data allowance.

**Terms v3 inputs** (the legal review on `main` predates both waves): wave-1 L3 and L10, wave-2 F11, F40, F41, F42 and F56.

**Where the two audits overlap:**
- wave-1 M6 = wave-2 F16 (the 1,000-row inbox cut);
- wave-1 M1 ≈ wave-2 F04 (the block wording);
- wave-1 L3 = wave-2 F41 (legal facts);
- wave-1 N1–N9 (non-chat open items) still stand: f2 Oct 4, f9 Oct 9, the paperwork, and push dark on production.

**Facts the Mac session needs** (verified read-only on production, Sept 30):
- The PRE-CHECK passes today.
- Flag env values: `CHAT_V2_ALLOWLIST` = the three founders' ids; `CHAT_V2_CLUBS` = SAE `923896fb-c21e-4727-a164-037ba4e3d606`.
- No production event ends after Oct 1, so create one before the first phone test.
- Never use `supabase db push`: `billing_stripe` and `push_notifications` are not applied on production.
- Full list: the end of Part 3.

## Part 2. Wave 1 (live on production since Sept 30): what was missed

### New: high

**H1. The live site gives every visitor the database master key** (now)

Anyone on the internet can open the login page, view its code, and copy the Supabase master (service_role) key. No account is needed. That key skips every privacy rule: it can read every user's email, private profile fields, DMs, club messages and resumes, and it can change or delete any row. The 24 hours of logs we can see show no use from outside Vercel, but older logs are gone. Chat wave 1 did not cause this; the Vercel production setting is wrong.

- Evidence: Anonymous GET of https://www.connectvibe.app/auth/login loads /_next/static/immutable/chunks/2szoa-o94f9it.js. That chunk inlines a JWT with role service_role (signature prefix M_30XO), which comes from getSupabaseAnonKey() at src/lib/supabase/env.ts:11-17 via src/lib/supabase/browser.ts:13. The same value feeds src/lib/supabase/server.ts:19 and src/lib/supabase/middleware.ts:19. Edge logs show about 57k createServerClient requests with apikey role service_role in 24 h. The real anon key (prefix 2n6M1o) is still enabled. Local .env.local is correct, so the wrong value is only in Vercel Production. This breaks the rule in handoffs/2026-04-30-session-28-phase1-supabase-r2-vercel.md:40.
- Fix: These steps need Franky's hands, today. (1) In Supabase, create new publishable and secret keys, then disable the legacy JWT keys (or roll the JWT secret, which signs everyone out). Changing only the Vercel value is not enough, because old copies of the page code stay cached in browsers and CDNs. (2) In Vercel Production and Preview, set NEXT_PUBLIC_SUPABASE_ANON_KEY to the publishable/anon key and SUPABASE_SERVICE_ROLE_KEY to the new secret key, then redeploy. (3) Verify: the key in the login chunk decodes to role anon, and edge logs for createServerClient show anon. (4) Add a guard in env.ts that throws if the public key is a service_role or sb_secret_ key. (5) Decide with James whether this counts as a possible data exposure.
- Source: prod-health-1

### New: medium

**M1. The Support page promises blocking hides someone's messages, but it does nothing in club chats** (now)

A student who blocks a classmate in the same club still sees that classmate's messages in the Lounge, Board and event chats, and the classmate still sees theirs. The live Support page promises the opposite. Wave 1 put every club member into the club's shared chats, so this safety promise now fails for anyone in a club. Blocking inside club chats is planned for wave 2.

- Evidence: src/app/support/page.tsx:136-138. Club rooms skip the block check: src/app/api/me/threads/[id]/messages/route.ts:415-432 (only DMs and groups call dmSendBlocked, at :420). The read side always sets hidden to false (src/lib/chat/message-read.ts:577). Contract section 12 point 2. Production has 0 blocks today.
- Fix: Reword the Block paragraph now. For example, add: 'Club chats are the exception for now: you'll both still see each other's messages in a club you share.' Update it again when wave-2 blocking ships, and keep the exception for officers' Board posts in the wording.
- Source: caches-docs-1

**M2. Officers of a club that moderators hid can still delete its events through the raw API, which now also wipes each event's chat** (now)

When moderators hide a club to investigate it, the club's owner or an admin can still delete its events with one direct database request. Since wave 1, that also deletes each event's chat and every message in it, so evidence under review can disappear. The app's own button refuses this; only the database rule lacks the check. Nothing is exposed on production today: the only hidden clubs are test clubs with no event-chat messages.

- Evidence: events_delete_manager has no hidden_at check (supabase/migrations/20260928110000_club_events_rules.sql:442-449). The route refuses correctly (src/app/api/events/[id]/route.ts:101-116). channels.event_id is ON DELETE CASCADE (supabase/migrations/20261001100000_chat_v2_rooms.sql:710). Reproduced locally and rolled back: DELETE 1, leaving 0 rooms and 0 messages. posts_delete_club_officer has the same missing check.
- Fix: Small migration: add `and not exists (select 1 from public.orgs o where o.id = events.org_id and o.hidden_at is not null)` to the club branch of events_delete_manager, and the same to posts_delete_club_officer. Add a behaviour case to scripts/sql/chat-v2-rooms-check.sql.
- Source: lifecycle-1

**M3. The old inboxes treat each club room as a 1:1 chat with a random member: wrong profile link, a stranger's photo, and Expand opens a DM with them** (now)

Every club member now has the Board and Lounge in the old Messages lists. On the phone, the room header shows some other member's @handle and links to that person's profile. In the desktop chat bubble the room shows that member's face, and clicking Expand opens (or creates) a private DM with them instead of the club room, which can hand a stranger an empty chat or a message request. Production is only spared because SAE has one member.

- Evidence: src/app/api/me/threads/route.ts:606-612 sets peer on every channel type (sent at :810). Phone: src/components/mobile/MessagesMobile.tsx:1550, 1667-1711, 1809. Desktop chat bubble: public/html/_miniMessenger.js:510, 518-520, 551, 556-557, 580. Expand goes through public/html/messages.html:3572-3583 and 3622-3627 to POST /api/me/threads, which creates the DM (threads/route.ts:354-399). Share picker: public/html/_sharePicker.js:139-152. Group chats already had the same bug before wave 1.
- Fix: Server: send peer: null (and peer_last_read_at: null) for every entry that is not a dm. That fixes all old screens at once, and groups too. Clients, as a second wall: the phone header uses peer only for type dm; the chat bubble treats any non-dm as a group and points Expand at /messages?channel=<id>; the share picker shows the group or club look.
- Source: old-clients-1, signals-3, regressions-2

**M4. 'Clear chat history' on a club room looks like it worked, then every message comes back** (now)

Any member can tap Clear chat history on the club's Board or Lounge, on desktop or phone. The chat empties, then desktop refills it within 2 seconds and the phone refills it on reopen, because club rooms ignore the setting. The desktop confirm also talks about the room as if it were a person ('SAE · Board will still see their copy'). Each tap saves a stamp in the database, and if a later wave starts honouring that stamp, those members would suddenly lose the room's history.

- Evidence: src/app/api/me/threads/[id]/clear/route.ts:27-31 has no club-room check. The reads ignore the stamp for club rooms: src/lib/messages/channel-access.ts:111-117 and src/lib/chat/message-read.ts:736. Desktop offers Clear at public/html/messages.html:3113 (Delete is gated at :3114); confirm text at :3310-3317; 2 s poll at :1790 and :2574-2577. Phone offers it at src/components/mobile/MessagesMobile.tsx:2626-2630 (Delete is gated at :2676). Contract 10.3 hid Delete, not Clear. Only planning notes mention it (code-map.md:14, wave-plan.md:96).
- Fix: Now: hide Clear on club rooms in both screens (the same one-line gate as Delete) and have the clear route refuse club rooms with club_room. In the wave-2 contract, decide that cleared_at is ignored in club rooms for good. The column can also be written directly through the data API, so the route guard alone is not enough to keep old stamps from ever hiding history.
- Source: routes-untouched-1, old-clients-5, signals-7, regressions-3, caches-docs-11

**M5. Reading a club room in desktop Campus > Chat never marks it read, so the Messages dot stays lit** (now)

On desktop, a member who reads the Lounge or Board in Campus > Chat still sees that room bold and unread in Messages, and the Messages dot on the profile page stays on. With an active Lounge the dot is almost always lit, which hides real DMs. The phone is not affected.

- Evidence: ChannelChat in src/app/campus/campus-home.tsx (from :15960; polls at :16066-16112) never calls /api/me/threads/[id]/read, and the file contains no '/read' call at all. The other screens do call it: MessagesMobile.tsx:1203, messages.html:2571, _miniMessenger.js:595. Unread rule: threads/route.ts:756-767. Rows start as read (migration 20261001100000:856-857). Sending also skips last_read_at in club rooms (messages/route.ts:524-543).
- Fix: In ChannelChat, quietly POST /api/me/threads/{channelId}/read when the room opens, and again after a poll brings a newer message while the tab is visible.
- Source: old-clients-2, signals-2

**M6. The inbox now reads every club member's row; past 1,000 rows it silently cuts DMs off (names vanish, a blocked chat can come back)** (wave2)

The Messages list reads the full member list of every Board and Lounge the student is in. Past 1,000 rows (for example one 500-member club, or three clubs of about 170), the database quietly returns only the first 1,000. Some DMs then lose the other person: they show as 'Unknown' or 'Direct message', lose Seen and the Block/Report buttons, and a chat the other person blocked can reappear on the blocked person's side. Nobody hits this today, but the first big club will trigger it for every one of its members.

- Evidence: src/app/api/me/threads/route.ts:586-592: no order and no limit; only event rooms are dropped (:486). Peer at :606-611; the block filter needs a peer (:732-737); name at :775; full member list sent at :811. supabase/config.toml:18 sets max_rows = 1000. Cost note in migration 20261001100000:370-381. Contract 6.4 (wave-1-contracts.md:481) accepted the cost of this read, not the silent cut. The same read existed before wave 1 for members who joined through admitMember; wave 1 extended it to every member.
- Fix: Run the co-member read only for dm and group ids (reuse the split readLastMessages already does at :680-684), and send members: [] for club rooms. Make the DM block filter fail closed when a DM has no peer. Optionally add an index on channel_members(user_id) in the next migration.
- Source: signals-4, database-1, regressions-1

**M7. An officer's Board post can lose its unread dot and preview when the Lounge is busier** (wave2)

The Messages list checks all of a student's club rooms against one shared batch of recent messages. If about 10 Lounge messages arrive after an officer's Board post (about 20 for someone in two clubs), the Board row shows 'No messages yet', isn't bold, and sinks to the bottom. That dot is the only signal for officer announcements, so members can miss them. Desktop keeps these screens after Oct 26.

- Evidence: src/app/api/me/threads/route.ts:661-693 reads one shared window, `.limit(ids.length * 5)`. A room outside it gets last = null (:727), so unread is false (:764-767) and it sorts last (:836-838). Preview fallback at _miniMessenger.js:524-525 and MessagesMobile.tsx:823-824. Reproduced locally and rolled back: the window held 20 Lounge rows and 0 Board rows. Contract 7 defines board.unread per room.
- Fix: Read the latest top-level message per club room (DISTINCT ON channel_id, a lateral LIMIT 1, or one limit-1 read per room). Do not copy the shared-window pattern into the wave-2 inbox.
- Source: signals-1

**M8. Desktop Campus > Chat has no Report or Delete on messages, and the Officers room can't be opened anywhere else on desktop** (wave2)

On a laptop, an officer who sees abuse in the Officers room, or a member in a private room, has no way to report the message, and nobody can delete their own message there. Board, Lounge and public rooms can still be reported from the Messages page, but Officers and private rooms never appear there. Desktop keeps Campus > Chat after launch, so this safety gap stays until it is fixed.

- Evidence: ChannelChat's hover row in src/app/campus/campus-home.tsx:16520-16595 holds reactions and Reply only (ReportSheet is used elsewhere at :8339, :9313, :10312). messages.html has Report at :1346-1354 and Delete at :1386-1395, but only for threads in its list (:3651-3669). That list is built from channel_members rows (threads/route.ts:435-445), and Officers and private rooms get none (migration 20261001100000:940). Production: 5 Officers rooms, 0 rows. This predates wave 1.
- Fix: Add Report (ReportSheet with target type message, never on your own messages) and a sender-only Delete with a confirm to ChannelChat's hover row, next to Reply. Keep Report even where canPost is false.
- Source: gap-campus-chat-parity-2

**M9. A student who RSVPs to a club event before joining the club is quietly added to its event chat when they join** (wave2)

Anyone can RSVP to a club event, but only members see the line 'You'll appear in the event chat.' If a follower RSVPs Going and later joins, the database adds them to that event's chat, where the other attendees and the officers see their name, and nothing at join time tells them. Follow, then RSVP, then join is exactly the launch path, and Franky's decision b relies on this notice. It shows on screen from the week of Oct 5 (founders and SAE) and for everyone from Oct 26.

- Evidence: The Going line only shows for members: src/app/campus/campus-home.tsx:10178 (the useIsMyClub cache at :9880-9922 stays stale until a reload, accepted in B5-repair.md:14). Joining adds the rows as contract 3.4 says (wave-1-contracts.md:152; migration 20261001100000:973-1011). The join copy in src/lib/orgs/join-copy.ts:213-218 does not mention it. Contract 12.1 accepted the silent add only for the 7 RSVPs that existed before the deploy. Reproduced locally and rolled back.
- Fix: Before event-chat screens ship, add one line to the join confirmation, for example 'You'll also join the chats of events you've said you're going to', or show the Going line to followers too. Optionally reset the cached club list on join and leave.
- Source: caches-docs-12, old-clients-7

### New: low

**L1. Nobody is scheduled to run the chat health check, so a silently missed room row stays broken** (now)

When a chat trigger fails it writes only a warning to a database log nobody reads. Two writes at the same moment (joining while an officer creates a room) can miss a row with no warning at all. The check script says to run it weekly while clubs onboard, but no handoff schedules it or says who runs it. Before the new screens a missing row is mostly invisible; once event chats are on screen, a Going member could be locked out of their event chat until someone runs the repair.

- Evidence: The triggers swallow errors at migration 20261001100000:959-960, 1040-1041, 1129-1130, 1162-1163; the race note is at :1198-1201. chat_repair_club is only called from src/app/api/orgs/route.ts:895. scripts/sql/chat-v2-after-deploy.sql:12-17 asks for weekly runs; the S69 close (:48-54) does not schedule them. There is no vercel.json and no cron. Contract 3.4 and build note 16 accepted swallow-and-log without naming who repairs.
- Fix: Add a recurring line to the next handoff. Every week until Oct 26, and after big onboarding days, run chat-v2-after-deploy.sql read-only on production and scan the Postgres logs for 'chat-rooms:'. Ask Franky before any repair. Run it for certain before the flag goes on for founders and SAE, and again before Oct 26. Later, consider a small failures table or a scheduled repair.
- Source: database-3, reconcile-2

**L2. No message has been sent on production since the send route was rewritten, and a DM photo upload has not run anywhere since wave 1** (now)

The live checks after the deploy were read-only, and production has had zero messages since. The photo upload step can't run locally because storage isn't configured, so nobody has watched a real DM photo go through end to end. The code reads correctly, but if something broke, the first report would come from a real user.

- Evidence: S69 record handoffs/2026-09-29-session-69-chat-wave-0.md:79 and :92 (GET only). Production: 0 messages since 2026-09-30 00:10 UTC. Local R2 is blank, so uploads answer 503 (integration-http.md:325-329, B4-repair.md:26). A local DM send with a media key returned 200 (B4-notes.md:85). Contract gate 4 (wave-1-contracts.md:599). The check order in src/app/api/me/messages-upload-url/route.ts changed in wave 1.
- Fix: Next Mac session, with Franky's own hands or his yes: send one DM photo between two founders on desktop and on the phone, and one SAE Lounge message, on production. Record the result in the handoff.
- Source: reconcile-5

**L3. The legal review's v3 inputs still describe the old chat model** (now)

The code-facts audit behind the Terms review was taken after wave 1 went live, but it still describes the old chat, and the attacker and defender rounds never tested the new rooms. Several queued sentences would become false promises if published: 'Officers can remove messages' (they can't yet), 'who is going is shown only to you and the organizers' (people in an event chat see each other), and a Block clause with no club-chat exception. None of this is published yet, so it matters for the v3 pass.

- Evidence: handoffs/legal-2026-09-29/00-code-facts.md:1 (HEAD 5c68da1 is after e4f8916), :223, :264, :335-340, :373, :421-435. 02-terms-of-service-v2.md:163, :188. 11-defender-round1.md:159, :167, :169, :1552, :1609, :1645. 12-results.md:44. 03-companion.md:40-41. Event-room members can read each other through channel_members_select_member, as wave-0 decision b intends.
- Fix: Before writing v3, add a short 'club chat rooms (wave 1)' section to code-facts covering: the Board rule, automatic membership, the Officers room, who is in an event chat and its 7-day close, no leaving, no media, the cascades, and roster visibility. Re-check T7, T9, T11 and T14 against it. Drop officer message removal, or mark it 'coming'. Add the club-chat exception to the Block clause.
- Source: caches-docs-2, caches-docs-3, caches-docs-5, caches-docs-7

**L4. Several screens changed in wave 1 were never opened in a browser** (now)

The share sheet and pickers, the officer-only room editors, the chat bubble's quiet line and desktop Campus > Chat were changed but only typechecked. The one browser walk used a plain member's account, which can't reach the officer screens. The server still enforces the rules, so a slip would look wrong but not change data.

- Evidence: B5-notes.md:55 ('no browser walk'); B5-review-coverage.md:37 item 8; S69 record handoffs/2026-09-29-session-69-chat-wave-0.md:79; B5-repair.md:3-5 and 10-11. Server locks: src/app/api/orgs/[slug]/channels/[channelId]/route.ts:58-66 and 99-147.
- Fix: Put a short walk list in the next handoff and do it with local seed accounts before wave 2 touches the same files: the phone share sheet; the desktop share picker; club Settings > Channels and the room settings on Board, Lounge, Officers and an event room (as an officer); the chat bubble on a profile page on the Board; desktop Campus > Chat Board as a member; and a Night-mode flash check.
- Source: reconcile-6

**L5. Phone: a room opened from a club-page link briefly shows a text box on the Board, or a broken screen with 'Delete conversation' if you can't open the room** (now)

On the phone, rooms opened from the club page's Channels card start without knowing what room they are. For a moment a plain member sees a text box on the Board, and a quick send is refused. If the link points to a room they can't open any more (they left the club or were demoted), they get 'Not a member', a working text box, and a 'Delete conversation' button that claims success. On desktop the same link silently opens a different room or club with no explanation.

- Evidence: The link is built at src/app/orgs/[handle]/ChannelsSection.tsx:314. The phone opens it with name: null (src/components/mobile/CampusMobile.tsx:271, 422-434), so synthesizeChannelThread returns null (:2459-2461). entryCanPost(null) returns true (MessagesMobile.tsx:364-369) and stays true after a failed read (:1194-1195). clubRoom is false (:2280), so Delete shows (:2676-2683), and the hide route answers ok even when nothing changed. Desktop fallback: campus-home.tsx:670-689 and 720-731.
- Fix: Phone: treat ?channel= opens as club rooms (type 'org' or a flag), so the composer starts as the empty bar and no Delete row shows; hide the composer if the first read answers 403. Desktop: if the linked room or club isn't in your list, show a short note instead of switching silently.
- Source: old-clients-6, gap-campus-chat-parity-4

**L6. Officers still get 'Reply' on Board posts in the old screens, but the reply posts as a plain new announcement** (now)

An officer who clicks Reply on a Board post sees 'Replying to...' and sends. The server drops the quote, so members see a standalone post with no context; on the phone the quote shows for a moment, then disappears. Only officers hit this, and the message still posts.

- Evidence: The server ignores the quote in a Board: src/app/api/me/threads/[id]/messages/route.ts:388-396 (contract 6.2). The screens hide Reply only when canPost is false: campus-home.tsx:16560-16594, MessagesMobile.tsx:1837 (optimistic quote at :1329), messages.html:1395-1400, _miniMessenger.js:821-826.
- Fix: Hide Reply on the Board in all four old screens (roomKind === 'board'), not only when canPost is false. Real Board replies arrive with the wave-2 screens.
- Source: old-clients-4

**L7. 'Report this chat' on a club room (desktop) gives admins a card they can't act on** (now)

On desktop, any member can report a whole club room. The admin's card is titled only 'lounge' or 'board', names no club, says 'No one owns this one', and offers only Dismiss, so the admin can't tell which club to look at. Reports on individual messages still work fully, and this was already possible before wave 1.

- Evidence: public/html/messages.html:2017 counts org_channel as a group, and the button at :3088-3096 is gated only on isGroup (wave 1 gated five other actions with !clubRoom). Snapshot: src/app/api/me/reports/route.ts:326, :343. Admin card: src/app/admin/reports-client.tsx:124, 197, 230, 741, 814-815, 848. The phone never offers it (MessagesMobile.tsx:2382).
- Fix: Gate the desktop button with !clubRoom to match the phone, optionally offering 'Report this club' instead. Or have the admin queue turn the snapshot's org_id into the club's name, handle and owner.
- Source: gap-admin-moderation-3

**L8. An empty Board invites members to 'say hi', right above 'Only officers post here.'** (now)

Every new club's Board starts empty. A plain member who opens it sees 'be the first to say hi in #board' on desktop, 'Say hi to ...' on the phone, or 'Say hi' in the chat bubble, directly above the line saying they can't post. It's cosmetic, but it is the first thing members of every new club see.

- Evidence: src/app/campus/campus-home.tsx:16379-16389 (quiet line at :16733-16757). src/components/mobile/MessagesMobile.tsx:1798-1810 (quiet bar at :2089-2116). public/html/_miniMessenger.js:754-756 (quiet line at :856-873). chat_repair_club creates the empty Board (migration 20261001100000:1219-1226).
- Fix: Branch the three empty states on the canPost value that already drives the quiet line, for example 'Nothing on the Board yet. Officers post updates here.' (or 'This chat is closed.').
- Source: old-clients-3, caches-docs-10

**L9. Desktop club screens still describe the old channels (#general, 'chat in every public channel', 'rename or delete channels', #exec)** (now)

A student creating a club is promised #general and #announcements but gets a Lounge, a Board and an Officers room. The role cards tell members they can chat in every public channel, which excludes the Board, and tell officers they can rename or delete channels, which the core rooms refuse. The Channels settings tab and the Officers room's Access tab still use the old wording, including a room called #exec that no longer exists.

- Evidence: Create-org modal: src/app/campus/campus-home.tsx:1265-1268 (the orgs route now builds Lounge, Board and Officers, src/app/api/orgs/route.ts:889-897). ROLE_PERMS at :16867-16893 (shown at :1867, :1897, :2352). SettingsChannels subtitle at :2033-2036. ChannelAccess example at :3670-3674.
- Fix: Reword the four strings. Create-org: 'Your club starts with a Board (officers post, members read), a Lounge for everyone, and an Officers room.' Members and mods: 'Post in the Lounge and the club's rooms; read the Board.' Owners and admins: 'Post on the Board; create, rename and delete extra rooms.' Drop '#' and 'exec'.
- Source: caches-docs-8, caches-docs-9, gap-campus-chat-parity-5

**L10. 'Officer' means owner, admin or mod in the Terms and onboarding, but only owner and admin in chat, so mods read 'Only officers post here.'** (now)

Club mods can't post on the Board or see the Officers room, and the Board tells them 'Only officers post here.' Meanwhile the Terms draft and onboarding call mods officers. It's a wording clash, not a broken feature.

- Evidence: ToS v2: handoffs/legal-2026-09-29/02-terms-of-service-v2.md:44; 12-results.md:74. Chat roles: src/lib/chat/room-rules.ts:21 (BOARD_POSTER_ROLES). The sentence is in src/lib/chat/types.ts:117 and shown at campus-home.tsx:16754, MessagesMobile.tsx:2115, messages.html:2351 and _miniMessenger.js:873. Onboarding: onboarding.html:1036-1041.
- Fix: Pick one meaning in the v3 pass (the chat model already means owner or admin). Then align the Terms definition, results call 6, and the quiet line, for example 'Only the owner and admins post here.'
- Source: caches-docs-6

**L11. The handoff says the health check must have its comments stripped to run on production, but it runs as-is** (now)

The S69 close says the check only works on production after stripping its comments. The script header says to paste it as-is, and a Sept 30 test confirmed that works. The stale note could make someone waste time hand-editing the script or stop trusting it.

- Evidence: scripts/sql/chat-v2-after-deploy.sql:19-22 vs handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:53. Pasted unchanged into the Supabase MCP on project rqopjkimxbjkwdkpkbfq, it returned '0 findings in 0 clubs; 5 clubs, 20 club rooms checked'.
- Fix: Correct the handoff line, or record which connector needed the stripping. The script header needs no change.
- Source: gap-health-check-scripts-6

**L12. Cancelling an event, deleting an account, or deleting a Board post wipes other people's chat messages, and no page or dialog says so** (wave2)

Once event chats are on screen, an officer who cancels or deletes an event also erases its whole chat, including the week after the event. The dialog only says the event is removed. Deleting an account erases the chats of events that person created, and deleting a Board post erases everyone's replies under it; the Delete-account page mentions neither. The behaviour itself was accepted (decision 7); the missing warning is the gap. Nobody can lose chat this way yet (0 event-chat messages and 0 replies on production).

- Evidence: Cascades: migration 20261001100000:710 and :713 (comments at :729 and :733). src/app/api/events/[id]/route.ts:144-178. Cancel dialog: src/app/campus/campus-home.tsx:10392-10399. src/app/legal/delete-account/page.tsx:136-145 and 164-167. Contract wave-1-contracts.md:154, :469, :613. Ended events aren't listed (src/app/api/events/route.ts:102-103), so 'Delete event' appears only on a card left open past the event's end.
- Fix: Before event-chat screens ship: add 'Its event chat and messages are deleted too.' to the cancel and delete dialog for club events. Add the event-chat and Board-reply effects to the Delete-account page and to v3 T7 and T14. Note in 12-results call 12 that the event-room cascade overrides it.
- Source: caches-docs-4, lifecycle-3

**L13. A suspended member's club-chat messages stay up with a blank name, which tells the club who was suspended** (wave2)

When a student is suspended or banned, their posts, comments and profile disappear, but their Board, Lounge and event-chat messages stay readable to the whole club, just without a name. Those messages can even be the Lounge's preview in Messages. A deleted account's messages vanish completely while the club's Members list still shows the suspended person, so members can work out who was suspended, which the moderation design promised would not happen. Decision 1 never covered club chats, so Franky needs to decide. Nobody is restricted on production today.

- Evidence: user_visible is used by the posts, comments and users policies (supabase/migrations/20260923090000_moderation_foundation.sql:2002-2018, 2326-2334) but not by messages_select_org_member (:2244-2254). Design notes: :153-155 and :162-163. handoffs/wave-plan-moderation/plan.md:14-18. src/app/legal/community/page.tsx:175-176 and 184-186. Inbox preview: src/app/api/me/threads/route.ts:661-676. author_role is read with the service role (src/lib/chat/message-read.ts:354-374, 576). Reproduced locally and rolled back.
- Fix: Get Franky's call first. If chats follow decision 1, add `and (user_id = auth.uid() or public.user_visible(user_id))` to the club message read policy (and possibly the DM one), and give readReplyCounts the same filter. If messages stay up, send author_role null whenever the author is hidden, and write the choice into the moderation notes and the Guidelines. Until then, moderators remove messages one at a time.
- Source: gap-restricted-authors-1, gap-restricted-authors-2

**L14. The club Members list still shows a suspended or banned member's name, handle and photo to every member** (wave2)

Any club member can open the club's Members tab on desktop and see a suspended person listed as normal, even though that person's profile is hidden everywhere else. This predates wave 1. It is also what lets members link nameless chat messages to a specific person. The moderation plan said rosters read with the service role would get the same visibility check, but that was never done.

- Evidence: src/app/api/orgs/[slug]/members/route.ts:64-114 reads with the service role and answers any member. Shown via campus-home.tsx:1611 and :2274. Plan: handoffs/wave-plan-moderation/plan.md:104-106 and moderation_foundation.sql:158-161 ('Wave 2 checks each roster surface'). The Officers-room roster (channels/[channelId]/members GET) follows the same pattern, but only officers can open it.
- Fix: In both roster GETs, leave out members with a restriction in force, or label them neutrally (join on account_restrictions or call user_visible). If officers still need the rows for management, label them 'Unavailable member'.
- Source: gap-restricted-authors-5

**L15. Leaving an event chat (RSVP changed to Not going, or demoted) removes all access, so you can't report what was said to you or delete your own messages** (wave2)

A member being harassed in an event chat who taps Not going to get out loses all read access, including to their own messages. A report on the harassing message is then refused, and they can't delete what they wrote. Tapping Going again restores access, but nobody would know to do that. Not reachable until event-chat screens ship.

- Evidence: chat_rsvps_room deletes the row (migration 20261001100000:1076-1092 and 1111-1127); demotion does the same (:1027-1039); can_view_org_channel's event arm is at :1331-1334. The report route reads through the reporter's own client with no fallback for messages (src/app/api/me/reports/route.ts:286-341). The own-message delete looks the message up first (src/app/api/me/threads/[id]/messages/[messageId]/route.ts:30-42). Reproduced locally and rolled back.
- Fix: Wave 2: let the report route fall back to a service-role read for a message in an event room the reporter once held a row in (as crossBlockFallback does for posts). Let the own-message delete confirm authorship with the service role when the normal read comes back empty.
- Source: lifecycle-4

**L16. The security and feature sentinel pass and the phone walk before the Oct 15 freeze dropped out of the handoff** (wave2)

The plan schedules both sentinels and a full phone walk for Oct 10-14, before the freeze and the Oct 16 store submission. The S69 close mentions neither, so a session that follows it would ship wave 2's new tables and routes without an adversarial pass.

- Evidence: handoffs/chat-redesign/wave-plan.md:17 and :104; plan-critique.md:416; S68 close handoffs/2026-09-29-session-68-close-and-chat-redesign.md:11. Missing from handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:7-16.
- Fix: Put this back into the next handoff's START HERE and the wave-2 contract's gates: 'Oct 10-14: security-sentinel and feature-sentinel over wave 2, then the 375px phone walk as a non-admin; freeze Oct 15.'
- Source: reconcile-3

**L17. The function that decides who sees the new chat screens has no test** (wave2)

chatV2For combines the on/off switch, the 'everyone' setting, listed users and listed clubs, and it must fail closed. It was only checked once with a scratch copy. When the flag goes live for founders and SAE, a later edit could open unfinished screens to every student, and no test would catch it.

- Evidence: src/lib/chat/flag-server.ts:79-108. src/lib/chat/flag.test.ts has no chatV2For test. B0-review-logic.md:28-31 (F3); B0-repair.md:20 ('FIXED IN PART'); B0-notes.md:42 and :45.
- Fix: In wave 2's first batch, move the decision into a pure chatV2Decision({enabled, everyone, listed, inListedClub}) in flag.ts, call it from flag-server.ts, and add about 8 tests, including the fail-closed paths.
- Source: reconcile-8

**L18. A reported club-chat message reaches admins without its club, room, event, or the post it replies to** (wave2)

Admins see the reported text and its author, but not which club or room it came from, or for a Board reply, what it was answering. That was already true before wave 1 for club channels. The wave-2 plan adds reply and card details to the report snapshot, but no batch owns the admin card, so those details would be saved and never shown.

- Evidence: Snapshot: src/app/api/me/reports/route.ts:321-325 and 352-368. Card: src/app/admin/reports-client.tsx:188-199 and :758. loadLive: src/app/api/admin/reports/route.ts:447 (no thread_root_id). Wave-2 plan: wave-1-contracts.md:375, :582, :586.
- Fix: In the wave-2 snapshot hunk, also store the room kind, the room label (for example 'SAE · Board'), the club's handle and name, the event id and title, and for a reply the root post's text and author. Give reports-client.tsx SnapshotBox an owner in the wave-2 batch table and render a 'said in ..., replying to ...' line.
- Source: gap-admin-moderation-2

**L19. The admin report queue will label every event-chat message 'already out of sight', even when dozens of attendees can read it** (wave2)

Every event chat is marked private in the database, and the admin report card treats private as out of sight. Once event chats have screens, a reported message in a chat 40 attendees read would carry a grey 'already out of sight' badge, which could make an admin treat it as low priority. It's only a badge, and nobody can reach this today.

- Evidence: src/app/api/admin/reports/route.ts:491-495 treats is_private as hidden (used at :521 and :529; definition at :420-426). Badge at src/app/admin/reports-client.tsx:726-727. Event rooms are forced private by channels_closed_rooms_private (migration 20261001100000:837-838). The contract lists the admin route as needing no change (wave-1-contracts.md:586).
- Fix: In loadLive, read channels.kind and stop counting event rooms (or any club room of a visible club) as hidden. Better: return a short 'who can read this' label and show it on the card.
- Source: gap-admin-moderation-1

**L20. When admins remove a Board post, its replies stay readable through the raw database API, and a reported reply still looks live in the queue** (wave2)

The app hides replies under a removed Board post, but only in its own route; any club member querying the database directly can still list them. In the admin queue, a reported reply under a removed post shows no badge, so an admin may remove it again or think the takedown failed. Nothing new is exposed, and production has no replies yet.

- Evidence: src/lib/chat/message-read.ts:659-681 (rootState hides them in the route only). messages_select_org_member has no check on the root post. src/app/api/admin/reports/route.ts:447, 483-488, 512, 517-523 handles comments under removed posts but not replies. Reproduced locally and rolled back: 7 replies still readable.
- Fix: In loadLive, read thread_root_id and mark a reply hidden when its root post is removed. Optionally, in a later migration, have the message read policy hide replies whose root is removed.
- Source: gap-admin-moderation-4

**L21. The Officers room has no per-person settings row, so Pin, Mute and mark-read do nothing there, and wave-2 unread for it is undecided** (wave2)

By design, nobody gets a settings row on the Officers room or on private rooms. So on the phone, an owner who taps Pin sees 'Not a member', Mute says 'Muted' but saves nothing, opening the room marks nothing read, and the room never appears in the Messages list. Wave 2's unread design assumes the row exists, so it needs a decision.

- Evidence: Migration 20261001100000:940 ('Officers room ... nothing'); repair steps at :1240 and :1252. Production: 5 Officers rooms, 0 rows. src/app/api/me/threads/[id]/pin/route.ts:31-44 answers 403; mute/route.ts:55-73 answers ok after updating 0 rows; read/route.ts:19-23 is a plain UPDATE. Phone menu: MessagesMobile.tsx:2608-2630, reached via CampusMobile.tsx:1043-1052. Contract 7: wave-1-contracts.md:495 and :522.
- Fix: In the wave-2 contract, either give owners and admins a row on Officers (in the triggers and chat_repair_club), or define unread for Officers and private rooms without a row and hide Pin, Mute and Clear there. Make mute answer 403 when it updates 0 rows. Neither choice fixes the known demoted-officer allow-list item.
- Source: routes-untouched-2, reconcile-7

**L22. Losing access to an open room (demoted, removed, left in another tab) leaves the old chat on screen, and every send says 'Not a member'** (wave2)

If an admin is demoted while the Officers room is open in desktop Campus > Chat, the old messages stay on screen, the 2-second refresh fails silently, and every send shows 'Not a member' until they reload, even though they are still a member. The phone only notices when a send fails. No new messages leak; it's just confusing, and it has behaved this way since before wave 1.

- Evidence: src/app/campus/campus-home.tsx:16066-16112 ignores failed polls after the first load; the club list and rooms are fetched once (:650-736). src/lib/messages/channel-access.ts:99-100. 403 with no code: src/app/api/me/threads/[id]/messages/route.ts:94-97 and 344-347. src/lib/feedback/failure-copy.ts:186. Phone: MessagesMobile.tsx:1161-1198 and :1335.
- Fix: With the wave-2 screens, treat a 403 after a good read as 'access lost': show a plain line instead of the composer, stop polling, drop the room from the rail, and re-read the club role. Give the route's 403 a code so screens can match on it.
- Source: gap-campus-chat-parity-1

**L23. Reactions: any refusal comes back as a bare server error, and the phone keeps the emoji as if it worked** (wave2)

If someone reacts in a room they just lost access to (for example, they left the club with a desktop tab still open), the server answers a generic 500 error and logs it as a server fault. Desktop shows 'Couldn't add your reaction.' and undoes the emoji, but the phone keeps it until reload. This is an edge case today and will matter more once event chats, which come and go with RSVPs, have screens.

- Evidence: src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts:72-82 handles only a duplicate key. The rules live in the database policy message_reactions_insert_member. The phone only rolls back when fetch throws (MessagesMobile.tsx:1517-1524); desktop handles it (messages.html:1861-1865). Suspended users are already stopped by src/proxy.ts:239-245.
- Fix: In the route, check the message id is a uuid, and answer 404 or 403 with a code on a permission refusal (42501) instead of 500. On the phone, undo the emoji whenever the response is not ok.
- Source: routes-untouched-4

**L24. Group-photo upload links can still be requested for club rooms, leaving unused photos in storage** (wave2)

Any signed-in member can request a group-photo upload link for their club's Lounge or Board and upload up to 20 images every 10 minutes that nothing ever shows. Users see nothing wrong; the only cost is storage and cleanup. The same was already possible with a user's own group chat or DM.

- Evidence: src/app/api/me/group-photo-upload-url/route.ts:76-89 only checks for a membership row; :114 signs the upload. Setting the photo is refused for anything that isn't a group (src/app/api/me/threads/[id]/route.ts:67-72). The sibling messages-upload-url route got the club guard in contract 6.7.
- Fix: After the membership read, load the channel's type and org_id. Answer 403 club_media_off for a club room and 400 for anything that isn't a group, and use requireCanPublish.
- Source: routes-untouched-5

**L25. The club page's Channels card lists '# board', '# lounge' and 'officers', plus a '+ Join all public' button that now does nothing** (wave2)

On the club page (phone and desktop), the renamed rooms appear as lowercase '# lounge', '# board' and 'officers' under a 'Channels' heading, while the inbox says 'SAE · Board'. The orange '+ Join all public' button always answers 'Already in every public channel', because every member is now added automatically.

- Evidence: src/app/orgs/[handle]/ChannelsSection.tsx:155, :179, :356, :376. Rename: migration step 2.6 (set name = kind). src/app/api/orgs/[slug]/channels/subscribe-public/route.ts (toast at :103). On production, SAE's rooms are named lounge, board, events and officers. Phone About tab: OrgContent.tsx:104 and :140.
- Fix: Label rows the way clubRoomLabel does ('Board', 'Lounge', 'Officers'), drop the '#', rename the heading (for example 'Chats'), and remove the '+ Join all public' button.
- Source: old-clients-8

**L26. Club rooms get a broken 'S·' avatar on the phone and in the chat bubble, and a group icon on desktop** (wave2)

For a one-word club like SAE, the phone Messages list and the chat bubble show 'S·' as the room's picture, while desktop Messages shows a two-people group icon. The chat bubble may also show a stranger's face (M3). The three inboxes disagree, and none uses the club logo the list now sends. SAE members see this today.

- Evidence: The label 'SAE · Lounge' comes from src/lib/chat/room-rules.ts:73 and 83-93. initialsOf in src/components/mobile/MessagesMobile.tsx:297-323 (used at :817 and :1552). public/html/_miniMessenger.js:52-54 and 510-522. public/html/messages.html:2017 and 2518-2530. No client reads org.logo_url.
- Fix: When an entry has org, use org.logo_url, falling back to the initials of org.name, on the phone, the chat bubble, messages.html and _sharePicker.js. Otherwise take initials from the part before ' · '.
- Source: old-clients-9

**L27. A restricted author is labelled four different ways across the old screens, and desktop Messages merges different people into one speaker** (wave2)

Desktop Messages shows '?' with no name, the chat bubble shows '?', Campus > Chat shows 'Unknown', and the phone shows 'Member'. On desktop, two different restricted people posting back to back look like one person. This is cosmetic, and it goes away if their messages are hidden (L13).

- Evidence: public/html/messages.html:2411-2413, :1437 (groups messages by name), :1441. public/html/_miniMessenger.js:659-662 and :774. src/app/campus/campus-home.tsx:16447. src/components/mobile/MessagesMobile.tsx:4017-4024 and :1438.
- Fix: If L13 hides these messages, nothing more is needed. Otherwise use one label everywhere (for example 'Account unavailable') and group desktop messages by user_id (messages.html:1437).
- Source: gap-restricted-authors-3

**L28. The health check prints its summary at the very bottom, so a large failure hides the count** (wave2)

The check prints one row per problem and puts the summary last. If something breaks in a big club, thousands of rows come out, and a cut-off tool answer shows neither how many members are affected nor what else went wrong. Today production returns a single line.

- Evidence: scripts/sql/chat-v2-after-deploy.sql:185-203: the summary is added with UNION ALL and sorts last. Local scale test: a 2,000-member club produced 2,001 rows (452 KB) with the summary on the last line.
- Fix: Sort the summary first, make it a count per club and per problem type, and print each fix once per club. Optionally add a counts-only query for the weekly run.
- Source: gap-health-check-scripts-2

**L29. The handoff's cloud lint gate will fail on the planned MessagesMobile split, because the file already has 3 old lint errors** (wave2)

The handoff tells cloud sessions to pass lint on the files they change, with no 'no new errors' rule. MessagesMobile.tsx already carries 3 old errors, so the planned split (which must not change behaviour) will either fail its gate or tempt a session to change hook behaviour to silence them. The handoff's line count is also stale: 4,985 lines, not 4,866.

- Evidence: handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:22. `npx eslint .` reports 32 errors in 11 files; MessagesMobile.tsx has errors at 481, 534 and 3669. Contract 14.1 (wave-1-contracts.md:636) had the exemption.
- Fix: Change the gate line to 'npx eslint on changed files, no new errors vs HEAD (MessagesMobile carries 3 old ones)' and correct the line count.
- Source: reconcile-9

**L30. The local database has 20 migrations applied but not recorded, which will trip the wave-2 rehearsal** (wave2)

Locally, the migration record stops at Sept 26, although the 20 later files, the chat migration included, were applied by hand. Running the usual Supabase migrate commands locally would try to apply them again and fail. The S69 record mentioned this; the close handoff dropped it.

- Evidence: Local schema_migrations: max 20260926100000, 77 rows, against 97 files. S69 record handoffs/2026-09-29-session-69-chat-wave-0.md:41. Missing from the S69 close (:48-54). The first pending file (20260927100000:135) uses a plain create function, so re-running it would fail.
- Fix: Add one line to the handoff's Local environment section. Optionally insert the 20 missing local schema_migrations rows (local only).
- Source: reconcile-11

**L31. The phone Campus chat menu always shows 'Pin to top' and 'Mute', even for a room already pinned or muted** (after-launch)

A member who pins the Lounge or mutes the Board from the phone's Campus chat sees 'Pin to top' and 'Mute…' again the next time they open it, with no Unpin or Unmute, so undoing it means going through Messages. Since wave 1 these taps really do save. The phone Campus Chat entry goes away when the new screens turn on for everyone.

- Evidence: src/components/mobile/CampusMobile.tsx:2459-2472 passes no pinned_at or muted_until. src/components/mobile/MessagesMobile.tsx:1113-1118 and 2608-2625. src/app/api/me/threads/[id]/pin/route.ts.
- Fix: Pass the inbox entry's pinned_at and muted_until into synthesizeChannelThread, or have the thread GET return the viewer's own settings. Or leave it, since decision 8 removes the phone Campus Chat pill on Oct 26.
- Source: gap-campus-chat-parity-3

**L32. If an event chat ever ended up under the wrong club, the health check would blame the attendees, and its printed fix would remove them** (after-launch)

The check never compares an event chat's club with its event's club. A misfiled room would show up as 'not a member' rows, and running the suggested repair would remove everyone who is going. No route or user can cause this today; only a hand-written database edit could.

- Evidence: scripts/sql/chat-v2-after-deploy.sql:110-145. Reproduced locally and rolled back. PATCH refuses a club change (src/app/api/events/[id]/route.ts:310-312), and clients have no UPDATE on events.org_id, channels.org_id or channels.event_id.
- Fix: Add an event_room_club finding (room's club differs from event's club, with a by-hand fix only), and in chat_repair_club steps 4 and 5b require e.org_id = c.org_id.
- Source: gap-health-check-scripts-5

**L33. One signed-in session left open all night makes about 3,700 database calls an hour** (after-launch)

Franky's account, most likely through the gstack test browser that has been running since Sept 14, polls around the clock whenever the Mac is awake: about 480 app calls an hour, or 11,500 a day. The screens only slow down when a tab reports itself hidden, and that test browser never does. Wave 1 didn't cause this; it's a cost issue, and students leaving tabs open would add up the same way.

- Evidence: Edge logs for df5ab44e show about 3,700 requests an hour from 03:00 to 09:00 UTC. The pollers only pause on document.hidden (public/html/messages.html:2575 and :3670; _miniMessenger.js:335, :406, :608; _otto.js:916). src/proxy.ts:23-24 and src/lib/supabase/middleware.ts:38 add a getUser call per request. The gstack Chromium runs with --disable-backgrounding-occluded-windows.
- Fix: Now: close or sign out the gstack test browser when a test ends. Later: slow polling down after about 5 minutes without input, and merge the notification-count calls.
- Source: prod-health-3

### Intended by the contract, but it still bites someone: medium

**I1. Any club member can read every other member's read times and mute, hide and pin settings through the raw database API** (wave2)

Wave 1 gave every member a settings row on the Board, the Lounge and event chats, and the database lets any member read all the rows in rooms they share. With their own login and one direct API call, a member can see exactly when each classmate last read the Lounge and who muted or hid it. That is the per-person 'seen by' Franky kept out of v1. The fix was deferred on purpose, but no wave or date owns it. Today only about 3 founder accounts are affected; the exposure grows with every club that onboards.

- Evidence: channel_members_select_member = is_channel_member AND can_read_channel_roster, with no column limit. authenticated holds SELECT on last_read_at, hidden_at, muted_until, typing_until, pinned_at and cleared_at (checked on production). Deferred in wave-1-contracts.md:22 and migration 20261001100000:59-61; plan-critique.md:121-139 (#8). Not in the S69 close carry-overs. The threads route also sends peer_last_read_at for club rooms (src/app/api/me/threads/route.ts:627-629, 816). Reproduced locally as blake: 13 other members' rows.
- Fix: Make it a named wave-2 task, done before club onboarding grows and well before Oct 26, in the critique #8 order. First move the own-row reads (threads/route.ts, otto/route.ts, pin/route.ts, push/badge.ts, and the cleared_at read in channel-access.ts) to the service role. Then limit club-room reads to your own row, or revoke the settings columns from authenticated.
- Source: reconcile-1, database-4

### Intended by the contract, but it still bites someone: low

**I2. The server still lets a member hide a club room from their own inbox; only the screens prevent it** (wave2)

Current screens don't offer Delete on club rooms. But a desktop tab left open since before the deploy, or a direct API or database call, can still hide the Board or Lounge from that member's own Messages list until the next top-level post, which on a quiet Board could be weeks. Only that person is affected, the room stays in Campus > Chat, and the health check can't see hidden rows. The contract chose to enforce this in the screens only.

- Evidence: src/app/api/me/threads/[id]/hide/route.ts:23-27 has no club-room check. src/app/api/me/threads/route.ts:758-762. The screens hide Delete at public/html/messages.html:3114 and src/components/mobile/MessagesMobile.tsx:2676. hidden_at is column-granted (wave-1-asis.md:424). Contract section 11 (wave-1-contracts.md:586) and 10.3 (:564). The check ignores hidden_at (scripts/sql/chat-v2-after-deploy.sql:146-155; repair step 6 at migration :1297-1303).
- Fix: Wave 2: have the inbox ignore hidden_at on club rooms (it already ignores accepted_at at threads/route.ts:750), and optionally have the hide route refuse club rooms with club_room. Either add a hidden-row list to the check, or state that hidden rows are out of scope.
- Source: routes-untouched-3, caches-docs-13, gap-health-check-scripts-3

**I3. Desktop has no way to open an event chat or a Board reply, so a mention there will lead nowhere** (wave2)

By design, desktop keeps the old screens until after launch, and they can't list or open event chats. From Oct 26, a desktop user mentioned in an event chat or a Board reply will get an Otto notice that opens a Messages page where that room can't be reached. Nobody can hit this today on any platform.

- Evidence: public/html/messages.html:3642-3657. src/app/api/me/threads/route.ts:486. src/app/api/orgs/[slug]/channels/route.ts:105. Mention fan-out: src/app/api/me/threads/[id]/messages/route.ts:545-595. Otto links: src/components/network/OttoSidePanel.tsx:960-963 and public/html/_otto.js:880-882. Contract wave-1-contracts.md:22, :531, :558; decision 9.
- Fix: In the wave-2 contract, pick the desktop path: for example, let messages.html open any room the user can read by ?channel= even if it isn't listed, or add a read-only desktop event-chat view. Make Otto chat-mention notices carry the room id.
- Source: signals-5

**I4. The app-icon badge and the in-app Messages count disagree for club rooms** (wave2)

The Messages list counts unread Board and Lounge rooms, but the app-icon badge counts only DMs and groups, although its code promises the two always match. It's dormant for now (the icon only updates when notifications are allowed, and push is off) and belongs in the wave-2 inbox decision.

- Evidence: src/lib/push/badge.ts:10-33 and 98-103. src/app/api/me/threads/route.ts:764-767. src/components/mobile/MessagesMobile.tsx:563-571. The contract listed badge.ts as needing no change (wave-1-contracts.md:586). ServiceWorkerRegistrar.tsx:93-110.
- Fix: With the wave-2 inbox, decide whether the icon counts unread Board (and Lounge) rooms, and update loadBadgeCounts and its header comment to match. Or write down that club rooms are deliberately left out.
- Source: signals-6

**I5. Cancelling an event deletes its whole chat, including messages under an open report or already removed by moderators** (wave2)

Once event chats have screens, an officer reported for something they said in an event chat can cancel the event and erase the conversation around it. The reported line survives in the report's snapshot, but the context and any removals are gone, so the admin sees a 'gone' card. The cascade was chosen on purpose, but the contract never weighed it against open reports.

- Evidence: src/app/api/events/[id]/route.ts:144-202 has no report check. Cascades: migration 20261001100000:710 and :713. Contract wave-1-contracts.md:154, :597, :105, :469, :612-613. Contract 6.3 (:470) protects reported messages from a soft remove. Production: 0 event-room messages, 0 Board replies.
- Fix: Decide in the wave-2 contract: either refuse cancel or delete with 409 report_open while the room holds a message under an open report (and the same for a Board post with reported replies), or at least save the surrounding messages into the open reports before deleting.
- Source: lifecycle-2

**I6. Club mods can't read event chats they didn't RSVP to, so the planned mod 'remove message' can't reach them** (wave2)

Decision 27 lets mods remove messages in their club's rooms, but event chats are only open to owners, admins and people who are Going or Maybe. A mod who isn't going can't see the chat, so only the owner or an admin can act there. This follows from the contract; it just needs to be stated before the wave-2 remove route is built.

- Evidence: can_view_org_channel event arm: migration 20261001100000:1331-1334. Rows go only to owners, admins and going/maybe members (:919-931, :1016-1026, :1252-1268). Contract wave-1-contracts.md:50, :152, :470. Decision 27.
- Fix: Settle it in the wave-2 contract: either give mods read access to event rooms, or state that event chats are moderated by owners and admins only.
- Source: lifecycle-6

**I7. When an officer deletes a Board post or their account, every member's reply under that post is erased** (wave2)

Once members can reply on the Board (wave 2), an officer deleting an old announcement, or leaving Vibe, erases everyone's replies under their posts, plus the related mention notices, with no warning. The contract accepted this for v1. Nothing is at risk yet because no replies exist.

- Evidence: thread_root_id ON DELETE CASCADE: migration 20261001100000:713 (comment at :733). Own delete: src/app/api/me/threads/[id]/messages/[messageId]/route.ts:50-54. Account delete: src/app/api/me/route.ts:137. Contract wave-1-contracts.md:105, :469, :612-613. Reproduced locally and rolled back: 8 replies deleted.
- Fix: Revisit in the wave-2 contract: either turn a Board post that has replies into a 'removed' placeholder instead of deleting it, or refuse the hard delete while replies exist. Write down which Franky prefers.
- Source: database-2

**I8. The health check and the repair skip closed event chats, so a missing row there is never found** (wave2)

As the contract says, the check and the repair only look at event chats still inside their 7-day window. If a Going member's row goes missing and nobody runs the check before the chat closes, that member can't open the read-only chat afterwards, and the check reports all clear. Tapping Going again quietly fixes it, but nobody would know that. The rules also disagree: the RSVP trigger adds rows on closed chats, while the join trigger and the repair don't.

- Evidence: scripts/sql/chat-v2-after-deploy.sql:109-126 (window at :119). Repair step 4: migration 20261001100000:1252-1268 (window at :1262). Join trigger: :1006. The RSVP trigger has no window (:1065-1133). Contract 3.4. Production: 0 closed event rooms, 0 missing rows.
- Fix: In wave 2, set the rule for closed rooms (suggested: any current member with a going or maybe RSVP may read it). Then make the join trigger, repair step 4 and the check agree, and add a closed_event_room_row list to the check.
- Source: gap-health-check-scripts-1

**I9. The planned permissions clean-up on two chat tables (reactions and the Officers allow-list) was never written** (wave2)

Two chat tables still give the anonymous and signed-in roles full table permissions. Row-level rules block misuse today, so nothing is reachable through the app, but there is no second layer of protection if a rule is ever loosened. The contract moved this to its own small file, to be done 'any day', and no handoff tracks it.

- Evidence: message_reactions and org_channel_members relacl: anon=arwdDxtm, authenticated=arwdDxtm, locally and on production. Contract wave-1-contracts.md:21 and :222-224. Migration header 20261001100000:47-48. wave-1-asis.md:387-397.
- Fix: Fold the revoke into migration B: revoke everything from anon, and give authenticated only what its policies use (no TRUNCATE, and no UPDATE where there is no UPDATE policy). List it in the wave-2 contract's migrations.
- Source: reconcile-4

**I10. A new room name can clash with an old event's title, giving 'Channel name already exists' for a name you can't see** (wave2)

Event chats are named after their event and hidden from the room list, but they still count when an officer names a new room. If an event's title is a single lowercase word (such as SAE's test event 'vsdfsfs'), creating a room with that name is refused with no visible reason, permanently. This was a deliberate choice, recorded only in batch notes.

- Evidence: src/app/api/orgs/[slug]/channels/route.ts:197-203; [channelId]/route.ts:119-125. The list hides event rooms (route.ts:105). B1b-routes-notes.md:52; B1b-routes-repair.md:7 and :18.
- Fix: In the wave-2 contract, either add .neq('kind','event') to both name checks, or add a refusal sentence that names the event. Record it next to the room_locked copy item.
- Source: reconcile-10

**I11. A club whose officers are all banned is left with a Board nobody can post on, and nobody can appoint a new officer** (after-launch)

Every production club has exactly one officer. If Vibe bans that person, the club can't post on its Board, post as the club, create events or promote anyone, and members keep seeing 'Only officers post here.' Decision 7 chose to leave such a club alone, with hiding it as the admin's option. An admin tool to appoint an officer or transfer ownership is a later feature.

- Evidence: can_post_org_channel allows owner or admin only; messages_insert_org_member requires can_publish_now(). src/app/api/orgs/[slug]/members/[userId]/route.ts:90, :108, :220. Admin club tools are hide and verify only (src/app/api/admin/orgs/[slug]/). handoffs/wave-plan-moderation/plan.md:36-37. Reproduced locally and rolled back.
- Fix: After launch, add a platform-admin action to appoint an officer or transfer ownership, logged in moderation_actions. Meanwhile, the wave-2 Board could show a different message than 'Only officers post here.' when the club has no active officer.
- Source: gap-restricted-authors-4

### Already known (handoff carry-overs): low

**K1. Each poll of a club room makes 4 extra database calls** (wave2)

An old desktop Messages tab open on a club room now re-reads the room, the club, the posting rule and the viewer's role on every poll, even when nothing changed: 8 calls where there used to be 4. Confirmed on production (60 an hour from one tab, all successful). This is already on the wave-2 carry-over list.

- Evidence: src/lib/chat/rooms.ts:130-143. src/lib/chat/message-read.ts:354-362, 538-542, 1026-1041. Production edge logs: the can_post_org_channel, orgs, channels and org_members reads each run 60 times an hour in step with the polls, and were at 0 before the deploy. handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:39. Contract 6.1.
- Fix: As planned for the wave-2 thread GET: re-read the room, the club and the viewer (including the viewer's own role) only on every 5th poll, and read other senders' roles only when new senders appear.
- Source: prod-health-2

**K2. A demoted officer who was added to the Officers room by name keeps access, and the health check can't show it** (wave2)

This is the known carry-over: demoting someone does not remove them from the Officers allow-list, so they can still read Officers. The new detail is that neither the check nor the repair looks at that list, so nobody would notice.

- Evidence: can_view_org_channel allow-list arm: migration 20261001100000:1334-1337. Neither scripts/sql/chat-v2-after-deploy.sql:71-184 nor chat_repair_club (:1202-1311) reads org_channel_members. The list is only cleaned on leave or removal (20260928100000:301). Contract build note 15; decision 27. Reproduced locally and rolled back.
- Fix: Add an informational list to the check ('on the Officers allow-list but not owner or admin', with the by-hand delete) for Franky to review. Keep it out of the repair.
- Source: gap-health-check-scripts-4

### Not chat: still open: low

**N1. f2 (send mail as hello@connectvibe.app) is due Sun Oct 4 and still needs Franky to enter the Resend key** (now)

Clubs are onboarding and demo days start the week of Oct 5; without this address the founders reply from personal Gmail. It is already on the handoff's START HERE list. Whether it's done can only be checked in Franky's Gmail.

- Evidence: handoffs/2026-09-28-session-68-header-f10-officer-tools.md:12; S68 close :12; S69 record :15; S69 close handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:15.
- Fix: First thing next session, ask Franky whether f2 is done. If not, walk him through Gmail > Settings > Accounts > Add another email address, using smtp.resend.com port 465, user 'resend', and a Resend API key.
- Source: reconcile-12

**N2. f9 (Android build, due Fri Oct 9) is still blocked on the Android SDK, and the safe-area strip check fell off the list** (now)

Android Studio is installed but its SDK isn't, so the build can't start until Franky finishes the setup wizard; the steps are already listed. Separately, the reminder to look for a see-through strip above the phone's campus banner inside the app has dropped out of the handoffs, and the generic safe-area item in the store checklist won't point testers at it.

- Evidence: ~/Library/Android/sdk does not exist. S69 close :15. The last mention of the strip is the S68 header :55. The double padding comes from src/components/mobile/CampusMobile.tsx:802-806 plus src/app/globals.css:2797-2800; see also mobile/capacitor.config.ts:65. Store checklist: handoffs/wave-plan-pwa/research/critic.md:360-361.
- Fix: Ask Franky to finish the Android Studio setup wizard this week. Add one line to the f9 / store checklist pointing at CampusMobile.tsx:803 and globals.css:2800.
- Source: reconcile-13

**N3. The paperwork questions (D-U-N-S number, LLC amendment due Oct 3, EIN, outcomes of the Sept 26 meeting) have gone unanswered through five handoffs** (now)

Franky requested the D-U-N-S number on Sept 28. Apple enrollment waits on it (the roadmap says about Oct 5-7), and the Oct 16 store submission waits on Apple. Two details survive only in the S67 handoff: checking that D&B spells the name exactly 'CONNECTVIBE. LLC' (the case showed 'CONNECTVIBE.LLC'), and the next step once the number arrives, enrolling in Apple ($99) and Google Play ($25).

- Evidence: handoffs/2026-09-28-session-67-waves-2-4-and-security.md:11 and :61 (D&B case #11037991); S68 header :9; S68 close :13; S69 record :16; S69 close :16; roadmap v14 at handoffs/chat-redesign/roadmap-v14-published/page-final.html.
- Fix: Open the next session by asking Franky whether the D-U-N-S number has arrived, whether it is spelled exactly 'CONNECTVIBE. LLC', and whether James filed the Oct 3 amendment and got the EIN. Record the answers. If the number isn't in by about Oct 7, flag the risk to the Oct 16 submission.
- Source: reconcile-14

**N4. Push notifications are still off on production, and the handoff dropped that they're needed before the store apps (Oct 16)** (now)

The store apps are planned with push notifications on, but the S69 close only says push is off and its migration needs renumbering, with no date. The billing migration has the same numbering issue. Both files already tell whoever applies them to renumber first, so nothing breaks, but the date could slip without anyone noticing.

- Evidence: supabase/migrations/20260924120000_push_notifications.sql:181-187; 20260922150000_billing_stripe.sql:85-89. Production's latest version is 20261001100000, and the push and billing tables don't exist there. S68 header :16 ('needed before the store apps'); S69 close :16.
- Fix: Add to the next handoff: 'Renumber the push (and billing) migrations above the latest applied one; apply push, with Franky's yes, before the Oct 16 submission.'
- Source: reconcile-15

**N5. f11 (taken-down photos gone within 48 hours) lost its Oct 18 date in the handoff** (now)

The live legal pages promise removal within 48 hours, but a removed photo can stay in the CDN cache for a few days, and the fix waits on the Supabase Pro decision. The roadmap still shows Oct 18 and the open Pro decision. Only the session handoff lost the date, so a session that reads only the handoff won't raise it with Franky in time.

- Evidence: handoffs/2026-09-28-session-67-waves-2-4-and-security.md:35; S68 header :14; S68 close :13; S69 close :16. src/lib/moderation/media-quarantine-images.ts:88; src/app/legal/community/page.tsx:202; src/app/support/page.tsx:84. Roadmap v14 page-final.html.
- Fix: Restore 'by Oct 18 (legal: 48-hour removal)' to the f11 line, and ask Franky for the Supabase Pro decision by about Oct 10.
- Source: reconcile-16

**N6. Wave 6 is still open: no journal entries for S67-S69, no feature sentinel since Sept 9, and 'memory tidy' fell off the list** (now)

A month of shipped work (the top bar, officer tools, Night mode everywhere, chat wave 1) has no journal entry and no feature-sentinel pass. The team's own rule is to run that pass before testers and demo days.

- Evidence: journal/vibe_journal.html was last modified Sep 25; its newest entry is Session 66. The last sentinel runs were handoffs/2026-09-09-broken-features-report-2.md (a subset, S55) and the S54 full run. 'Memory tidy' appears in the S68 header :15 only. S69 close :16.
- Fix: In the next non-build slot, schedule one read-only feature-sentinel run and the S67-S69 journal entries, before demo days. Put 'memory tidy' back on the wave-6 line.
- Source: reconcile-17

**N7. Roadmap v14, which James and Rylan can see, was only checked by eye on its cover after publishing** (now)

All the structural checks passed, but nobody scrolled through the published page's chapters in a browser, so any display problem would be seen by the cofounders first. The risk is low, and the check takes five minutes.

- Evidence: handoffs/2026-09-29-session-69-chat-wave-0.md:46; handoffs/chat-redesign/roadmap-v14-published/changes-final.md:92-115 and :121.
- Fix: Franky, or a session with his yes, opens https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi, scrolls through every chapter once, and notes the result.
- Source: reconcile-18

**N8. Two S68 officer flows were never tested by hand: event Cancel/Edit on the club page, and officer Delete in the phone post viewer** (now)

Both flows are live, and no current handoff records that they were never tried; the S69 walkthrough used a plain member's account. Wave 1 added to the event card they share but didn't touch the buttons, so nothing is known to be broken.

- Evidence: handoffs/2026-09-28-session-68-header-f10-officer-tools.md:45; src/app/orgs/[handle]/OrgEventsSection.tsx:63-68 and 179-196; src/app/campus/campus-home.tsx:9910 and :10253; src/components/mobile/PostViewerMobile.tsx.
- Fix: Add both to the next local walkthrough list, next to the wave-1 screens (L4): as avery_owner on the club page, and in the phone post viewer at 375px.
- Source: reconcile-19

**N9. Most of the small 'known, not fixed' issues from S68 dropped out of the handoffs after S68** (after-launch)

The S68 list of small cosmetic and accessibility issues wasn't carried into the S69 handoffs, and several are still in the code (for example, aria-current on tabs, and PickCampusStrip showing light colours in Night mode). The one item described as a visible bug, the profile calendar hover, is actually unused CSS that no user ever sees.

- Evidence: handoffs/2026-09-28-session-68-header-f10-officer-tools.md:47-56; src/app/campus/campus-home.tsx:6192 and :4583; public/html/profile.html:2498 (unused: renderCalendar exits at :7445).
- Fix: Copy the S68 list into one tracked 'Known lows (non-chat)' backlog section. Delete the unused .cal-day rules on profile.html instead of giving them a token.
- Source: reconcile-20

### Checked and fine

- Code gates on main: typecheck is clean, and all 1,374 tests pass. Wave 1 added no lint errors; the 3 errors and 11 warnings in wave-1 files all predate it.
- Production health after the deploy: the after-deploy check found 0 problems across 5 clubs and 20 club rooms. The logs show 0 'chat-rooms: failed' warnings. Of 45.6k requests since the deploy, none failed with a 4xx/5xx on the chat tables. By hash comparison, production matches the tested local copy: 11 chat functions, 26 policies, 30 constraints and 17 indexes.
- Production data is consistent. Every club has exactly one Board, one Lounge and one Officers room. Each of SAE's 4 open events has exactly one event chat. Board and Lounge rows (7 each) match the 7 club members. There are 0 rows for ex-members, followers, pending members or hidden rooms.
- Deploy: e4f8916 is live, and the later deploys were docs only. handoffs/, scripts/ and supabase/ return 404 on the live site. Anonymous calls to the chat APIs get 401.
- DMs and group chats behave exactly as before wave 1, checked field by field: reading, sending, message requests, the block guard, photo uploads, pin/mute/unread and the icon badge.
- Database protections, tested locally and rolled back. Members cannot change a room's kind or event, cannot add themselves to event chats or Officers, cannot post top-level on the Board, cannot reply to a reply, and cannot quote across rooms. Nobody can edit a message. Anonymous users have no access to messages, channels or channel members.
- Who can read what, tested locally. Ex-members, other clubs' members and followers see 0 club messages. Mods see 0 Officers messages. Changing an RSVP to Not going removes access, and Going restores it. Closed event chats are read-only.
- Room upkeep follows events: event create, rename, cancel and delete; RSVP changes; join, request, invite, leave and kick; promote and demote; and club delete all keep rooms and rows correct, with no orphan rooms left behind.
- Security-definer functions all set search_path. chat_repair_club refuses anonymous and signed-in callers. The realtime publication holds 0 tables. The indexes cover the new policy checks.
- Event chats never show up in any old list, unread count, badge, Otto count or push. Board replies are never shown or counted as Board posts.
- @mentions only notify people who can read the room. Notifications carry no message text. The mention picker only lists people who can read the room.
- On all 5 old screens, plain members and mods get the Board's quiet line instead of a text box. Club rooms have no attach or photo button. Leave, Delete, Rename and Add are hidden. The room editors lock the core rooms. Refusal messages show as plain sentences. The share pickers leave out rooms you can't post in.
- Old browser tabs: the service worker caches only the offline page. The chat scripts are served no-cache. The store-app shell loads the live site. Old scripts show the new refusals as sentences.
- Health-check script: safe to run read-only on production. It catches 11 of the 13 problems that can actually occur, with no false alarms, and runs in 51 ms on a synthetic 2,000-member club. The repair matches the check one to one.
- An admin removing or restoring a message in a club room works, and other members stop seeing a removed message.
- Suspended users: no screen crashes on them. Their sends are refused by the proxy, the publish gate and the database. @mentions of restricted users are never resolved.
- Campus chat: a demoted officer sees the quiet line on the Board after the next refresh. Mods never see the manager controls.
- Published legal pages (privacy, Terms v1, community, child safety, delete-account) contain nothing about chat that is now false. The one exception is the Support page's block paragraph (M1).
- Items confirmed closed: the parse-reminder test failure is fixed (e085654). The half-made-club failure is fixed in f6f8878, so that integration note is stale. Franky confirmed the officer-Board-post exception (contract 12.2).

### Not checked

- Vercel runtime logs and environment variables. The Vercel MCP returns 403 and there is no CLI, so route errors that fail before reaching Supabase can't be seen. It is also unverified that the chat_v2 flag is unset on Production, and it is unknown how long the service key has been public (Supabase keeps only 24 hours of logs).
- No one walked any screen in a browser, on desktop or phone. The gstack browser is Franky's real account and next dev is off-limits, so every screen behaviour was traced from code and local SQL.
- No HTTP calls were made to a local dev server. Route answers come from reading the code and running the same queries as the authenticated role in rolled-back SQL.
- No trigger path has run on production since go-live (0 joins, RSVPs, new events or new clubs). The triggers are proven only by the local rehearsal plus the matching schema hashes.
- The full photo upload round trip (upload link, storage upload, send) was not run anywhere, because storage is blank locally. Push delivery end to end was not run either, because push is off on production.
- The 1,000-row cut (M6) and the two-writes-at-once race were reasoned from code and config, not reproduced. PostgREST's max_rows on production is assumed to be the default 1,000.
- Production reports and moderation data were not checked: whether any open reports point at club-room messages, and whether any club member is restricted today (the admin counts show 0 in force).
- How the installed PWA behaves on a real device when it holds a pre-deploy bundle, and whether Vercel skew protection is on.
- Parts of some screens were not traced: the chat bubble's refresh when it gets a 403; the phone club page's member lists; other rosters read with the service role (followers, invites, requests); the admin alert email's content; whether /api/orgs?filter=mine hides a platform-hidden club from its own members.
- Items outside the repo: whether f2 is done, the paperwork status, and whether Franky reviewed roadmap v14 before James and Rylan saw it.
- Legal documents: the 177 KB defender file was only searched, not read end to end. The Sept 7 drafts in handoffs/legal-drafts/ were not checked.

## Part 3. Wave 2 (built in the cloud, branch `claude/relaxed-davinci-9d11h3`): what the cloud missed

### New: high

**F01. Migration B's own self-test crashes whenever it really runs, and the card test script can never pass** (mac-window-1)

The migration has a built-in self-test that tries polls and sign-ups on a real club. It compares the words 'true/false' with what the database actually prints, which is 't/f'. So it always fails and cancels the whole migration. The test only runs when some club has a plain member, an officer and an upcoming event.

- Locally that is true until Oct 5, and true again after re-seeding, so rehearsal 2 will fail.
- On production it will cancel the apply as soon as SAE, or any club with an upcoming event, gets a member who can post.
- The separate card test script, which the Mac must see pass, fails the same way on every run.

Nothing is left half-done, because the apply is all-or-nothing. But no Mac gate can pass until this is fixed.

- Evidence: Postgres prints booleans as t/f inside concat_ws/format: `select concat_ws('/', true, false)` -> `t/f`. Only `true::text` gives `true`.
- Migration: supabase/migrations/20261001110000_chat_v2_cards.sql:1415 builds `concat_ws('/', p.mode, p.anonymous, p.multi, ...)` and compares it with 'signup/false/true/0:1'. Run vcdb/r1 (B plus the rehearsal-1 constants, rolled back) aborts at step 8 with 'signup_shape=signup/f/t/0:1'. Line :1418 already casts `(m.card_event_id = v_event)::text`, so only :1415 was missed.
- Check script: scripts/sql/chat-v2-cards-check.sql:352, :357-358, :373, :415, :803-809 have the same pattern. The unmodified check fails at case A2 ('got .../t/t, expected .../true/true').
- With all 6 check sites cast: 'chat-cards-check: all 164 cases passed', step 8 passes, and the 27 rehearsal-1 constants stay valid. After each run 0 tables and 0 functions remained.
- Contract 13.3 step 1 (handoffs/chat-redesign/wave-2-contracts.md:1068) expects rehearsal 2 'green to rollback' and the check 'all green'.
- No cloud note has this: rehearsal 1 stops at 7.2, before step 8.
- Production today has 0 fixture candidates, so it would skip today and abort later.
- Fix: On the branch, before the constants commit:
- Add ::text casts at migration :1415 (p.anonymous::text, p.multi::text).
- Add the same casts at check :352, :357-358, :373, :415 and :803-809.

A step-8-only edit keeps the 7.2 constants valid. Then re-seed (see F22), re-run rehearsal 2, and require two things: 'behaviour check passed' in the NOTICE, and 'all 164 cases passed' from the check.
- Source: gap-cards-db-run-local-1

### New: medium

**F02. The student whose message a club mod removes can look up exactly who removed it** (before-merge)

The new chat tells the author only 'Removed by a club officer.' But the database stores the remover's ID on the message, and the author is allowed to read their own message row. One direct read with their own login gives the mod's name and handle. In a small student club this invites retaliation against the mod.

The remove route is not behind the flag, so the API is live for everyone from the merge. Nothing has leaked yet: production has 0 removed messages.

- Evidence: - src/app/api/me/threads/[id]/messages/[messageId]/route.ts:175-181 writes removed_by: user.id. src/lib/chat/types.ts:266 says it never goes in the JSON.
- Local test in BEGIN..ROLLBACK, as blake after casey removed his Lounge message 30c56814: `select removed_by` returned casey's id. Joined to users it returned 'casey_purdue | Casey Purdue'.
- Production (read-only): authenticated has table-level SELECT on messages, and has_column_privilege(removed_by) = t. Policy messages_select_org_member has the own-row arm `removed_at IS NULL OR user_id = auth.uid()`.
- Migration B changes no grant on messages (20261001110000_chat_v2_cards.sql:400-407).
- The moderation migration 20260923090000:185-195 accepted this exposure only because removed_by was always a founder.
- Not in any cloud note.
- Fix: Fix this before B is applied, because B is the cheapest place.
- Add a service-role-only table, for example chat_removals(message_id, removed_by, removed_at): RLS on, no policy, revoke from anon/authenticated.
- The remove route writes removed_by = null on messages and inserts the remover into that table.
- A column REVOKE alone does nothing while authenticated has table-level SELECT.
- Add a local check that repeats the rolled-back read and expects no remover id.

The same table can hold the Vibe-side record F12 needs.
- Source: route-security-1, legal-vs-wave2-07

**F03. An Event card keeps the old day and time forever outside the new phone card after the event is moved or cancelled** (mac-window-1)

When someone shares an Event card, its text ('Event: Chapter meeting · Tue Oct 7, 7:00 PM') is written once and never updated. If an officer moves or deletes the event, only the new phone card shows the change. These all keep the old time:
- desktop /messages, the mini messenger and Campus › Chat;
- the old phone list;
- the Messages home preview and the Board strip.

Editing an event sends no notice, so members may show up on the wrong day. Decide the text format before the first card exists on Oct 5, because old rows won't change later.

- Evidence: - src/lib/chat/cards/fallback.ts:33-47 builds 'Event: <title> · <time> — <note>'. src/app/api/me/threads/[id]/cards/route.ts:127-153 writes it once.
- src/app/api/events/[id]/route.ts:247-272 (PATCH): 'No notice goes out on an edit (v1)'.
- Migration B's only trigger is on channel_members (:904). Nothing in src updates messages.content.
- Local rolled-back run: after the event was moved a day and renamed, the content still read 'Event: Chat Seed Game Night · Sat Oct 3, 3:20 PM — bring snacks'. After DELETE, card_event_id was NULL and the content unchanged.
- Readers of that text: src/lib/chat/reads.ts:35-43, home/home-rules.ts:106-128, club/BoardStrip.tsx:11-28, and the old renderers (integration-old-renderers.md:35).
- Contract 5.1 (:197, :645) never considers event edits.
- Fix: Cheapest, before Oct 5: drop the time (and the note) from the fallback, so it reads just 'Event: <title>'.

Better: in PATCH and DELETE /api/events/[id] (or an events trigger), rewrite content for kind='event_card' rows with that card_event_id. Use the new time, or 'Event cancelled: <title>'.
- Source: gap-cards-db-run-local-3, gap-moderation-admin-and-side-surfaces-1

**F04. Blocking a club owner or admin still shows their Board posts, even with the new chat off, while the live Block wording says you won't see their content** (mac-window-1)

Franky decided that an officer's Board post stays visible to every member, even one who blocked that officer. The code applies this for everyone, flag on or off, so it will be live at the Oct 16 App Store submission.

- The cloud's notes (17.2 L7, the Apple table, 17.5 #23/#24, the handoff) say it only matters with the flag on.
- The live support page and the in-app block confirm say 'you stop seeing theirs' / 'You also won't see their content.'
- An Apple reviewer who creates a club with one account, joins with another and blocks will see the blocked officer's Board posts.
- The old Messages list shows that Board as 'No messages yet' while the thread shows the posts.

- Evidence: - src/lib/chat/stub.ts:33-47: isHiddenFrom has no flag check.
- src/app/api/me/threads/[id]/messages/route.ts:133 reads blocks for every club room. src/lib/chat/message-read.ts:642 applies the rule.
- The old inbox skips the post: src/app/api/me/threads/route.ts:715-721.
- The cloud frames it as flag ON only: integration-security.md:118-131 vs :139-152; wave-2-contracts.md:1353 (17.2 L7) and :1421 (17.5 #23); S70 handoff :63.
- Copy: src/app/support/page.tsx:136-137, ProfileMobile.tsx:5897, CampusMobile.tsx:3620, PostViewerMobile.tsx:493, public/html/_safetyActions.js:156.
- The decision itself: wave-0-decisions.md:56.
- Fix: Franky decides 14.1 knowing it holds at the Oct 16 submission. Two options:
- Drop the third clause of isHiddenFrom (one line) before the Oct 15 freeze.
- Keep it, and change the support page, the 5 confirm strings and Terms v3 §11 to name the Board exception.

Either way, correct 17.2 L7 and handoff :63 to 'flag on or off'. Add a row to 17.5 #24: casey as ADMIN, blake blocks casey, flag OFF, open the old Board thread.
- Source: cloud-notes-2, legal-vs-wave2-04

**F05. Messages you read live in a club room still count as unread when you leave** (mac-window-1)

In the new club screens, a message is marked read only if it arrives in a 20-second full refresh. Most messages arrive in the 4-second quick checks, which never mark anything read.

So a member who watches 6 messages come in and taps Back sees 'N new' on the club row, and the club counts as unread (often all 6). On the Board, the chip they are looking at gets the unread dot within 20 seconds.

- Evidence: - src/lib/chat/use-room-poll.ts:232 and :243: markRead fires only when a full-read page brings a new id. :249-273: readAfter appends rows without marking. :301: marks on mount. :334-339: the cleanup never marks.
- grep '/read' finds only use-room-poll.ts and ConversationView.tsx:195.
- Unread is counted from last_read_at: inbox/route.ts:206-220, orgs/[slug]/space/route.ts:63-77.
- club/RoomChips.tsx:75: the dot has no exception for the active chip. ClubSpace.tsx:233-235 re-reads every 20 s.
- Contract 11.5 (:956) is followed literally. S2-review-behaviour.md:190 passed it.
- Fix: - In readAfter, when the new rows include someone else's, call markRead (throttled to about once per tick).
- Also mark read on the hook's cleanup, and when enabled turns false, while the room was visible.
- Amend 11.5's mark-read sentence to match.
- Source: screens-dataflow-1

**F06. Back or a swipe with a sheet open closes the whole club space and loses the draft** (mac-window-1)

This happens in the Android app, the iPhone app (edge swipe) and Safari. With any of these open, pressing Back closes the whole club space (or event chat), not just the sheet, and the draft is lost:
- the poll, sign-up, RSVP or Report sheet;
- the remove confirm;
- the + tray.

If a poll is still posting, Back also gets around the 'don't close while posting' guard. The card still posts, but the officer sees no confirmation and may post it again. The Mac checklist (17.5 #19) expects Back to close the sheet first, but nothing builds that.

- Evidence: - src/components/native/NativeBridge.tsx:170-174 fires NATIVE_BACK_EVENT (src/lib/native/bridge.ts:239). Nothing listens, so it falls through to history.back().
- pushState is called only at MessagesMobile.tsx:203 and :320 and ClubSpace.tsx:117. No sheet adds a history entry: compose/CardSheet.tsx:141-147 and :160, club/RsvpSheet.tsx:63, RemoveConfirm at club/RoomThread.tsx:157, and ReportSheet (nested).
- The iOS swipe is on: mobile/ios/App/App/MainViewController.swift:19.
- Contract 17.5 #19 (:1417) expects the sheet to close first.
- Fix: Give every sheet its own history entry: pushState on open, close with history.back(), and let popstate close the sheet. Re-push the entry while posting is true. This covers the iOS swipe, the browser and Android.

The Android-only alternative: listen for NATIVE_BACK_EVENT in each sheet and call preventDefault().
- Source: screens-dataflow-2, gap-store-app-shell-and-push-paths-5

**F07. Going from a club space to the club page or a profile and pressing Back lands on the Messages home, not the space** (mac-window-1)

With the new chat on, go from a club space (or a DM) to the club page, a profile or a post, then press Back. You land on the Messages home, not the space, while the address still points at the room. After that, the header's Back needs two taps to close a space.

This was reproduced in a small Next 16.3.4 copy of the same screen setup.

- Evidence: - src/components/mobile/MessagesMobile.tsx:172: useState(initialChannelId) takes the channel from the server prop and never from the live URL.
- Next's pushState patch (node_modules/next/dist/client/components/app-router.js:250-262) stores the plain /messages page tree. Back restores it from the page cache (restore-reducer.js).
- Repro in scratchpad audit2/nextrepro: after a link out and Back, the URL was /messages?channel=room1 but the screen showed HOME. A second Back left the space open (onPop at MessagesMobile.tsx:231-236).
- Links out: ClubSpace.tsx:499, ClubEmpty.tsx:92 and :101, UpNext.tsx:65, ConversationView.tsx:665, GroupSettingsView.tsx:578 and :740, MessageBubble.tsx:354.
- Fix: - On mount, MessagesMobileV2 should read the channel from the live URL (useSearchParams or window.location.search), falling back to the prop.
- Treat history.state {vibeChat, depth>=1} with nothing open as a deep link to re-open.
- Add 'link out and Back' to 17.5 step 4.
- Source: screens-dataflow-3

**F08. After the phone sits locked on a busy room, the messages sent meanwhile are silently skipped** (mac-window-1)

Say someone leaves the app on a busy Lounge or event chat and comes back after 50 or more new messages. The thread jumps from their old messages straight to the newest 50. Everything in between is missing, with no sign of a gap.

'Earlier messages' loads older history, not the gap. Leaving and reopening the room fixes it.

- Evidence: - src/lib/chat/use-room-poll.ts:323-327: on return it does one full read of the newest 50, with no catch-up.
- src/lib/chat/page-merge.ts:19-20 and :53 keep older rows and add the page, with no fill-in. loadEarlier (:342-363) pages before the oldest row. hasEarlier stays as it was (:240).
- Simulation with the branch's page-merge.ts (audit2/verify-merge-sim.mts): state m0..m9 plus page m80..m129 gives m0..m9,m80..., with m10-m79 missing.
- Contract 9.3 prescribes this schedule and mentions no gap.
- Fix: On return to visible, first read ?after=<cursor>&limit=200 in a loop until a short page, then merge.

Alternatively, when the page's oldest row is newer than the newest row on screen, replace what's on screen (keeping unsent temp_ rows) and set hasEarlier. Add a page-merge test for the gap.
- Source: screens-dataflow-4

**F09. The event chat opens on its oldest messages and never follows new ones; on a small phone with the keyboard up there is almost no room** (mac-window-1)

The event chat opens on the oldest of its last 50 messages and never scrolls to new ones. Only your own send jumps to the end. At a live event, members have to scroll down to find the conversation, and new messages land out of sight.

On an iPhone SE or a small Android with the keyboard up, the fixed blocks above the thread (header, About, Board strip) leave about one line of messages. Tapping Reply can push the text box under the keyboard.

- Evidence: - src/components/mobile/messages/club/EventChat.tsx:161 passes anchor="top".
- club/RoomThread.tsx:221-225 auto-scrolls only for anchor 'bottom'. :226-231 scrolls only on your own send.
- Heights: EventAbout.tsx:110-160 is about 204px; BoardStrip.tsx:35-37 is 48px; RoomComposer.tsx:252-262 is about 65px, plus about 54px while replying; the header is 52px plus the safe area. Estimate on an iPhone SE with the keyboard up: about 18px left for the thread.
- Contract 11.6 (:969) defines 'top-anchored' only as a layout rule for short chats.
- Not in any note.
- Fix: - In RoomThread, apply the pinned-to-bottom scroll for both anchors: scroll to the end on the first page when the content overflows, and on new rows while pinned. Keep flex-start for short chats.
- Add a ResizeObserver that re-pins when the thread shrinks.
- Put EventAbout inside the thread's scroller, or hide it while the composer has focus.
- Source: screens-dataflow-5, gap-store-app-shell-and-push-paths-4

**F10. In the store apps, chat screens stay squashed after the keyboard closes** (mac-window-1)

In the store apps, a chat screen keeps its keyboard-open height after the keyboard closes:
- the text box floats about 60% down the screen;
- the bottom band shows the dimmed page underneath;
- a tap on that band closes the chat.

Android's behaviour was reproduced in a browser copy of the same drawer, and the iPhone app most likely does the same. This already exists for DMs (Apple's reviewer path) and Campus › Chat. Wave 2 adds the club space and event chat. Nobody can hit it before the Android build (Oct 9) and the App Store review (Oct 16).

- Evidence: - vaul 1.1.2 (node_modules/vaul/dist/index.mjs:1113-1162) saves the drawer height at the first keyboard resize (:1126) and skips the reset once the input loses focus (:1117).
- Browser repro (scratchpad/vaulkb): height stays 407px in a 667px viewport, with a grey band under the composer.
- Android pads the web view for the keyboard: mobile/node_modules/@capacitor/android/.../SystemBars.java:56, :125, :193-226. iOS: Keyboard.m:169 and :195-198.
- Affected drawers: ClubSpace.tsx:334-345, EventChat.tsx:108-120, ConversationView.tsx:550-567, CampusMobile.tsx:2589.
- mobile/capacitor.config.ts:83-111 has no Keyboard block.
- critic-s2s3.md:402 lists 'The keyboard with the Messages composer' as a device check nobody ran.
- Fix: Check on one real device first: type, close the keyboard, type again.

If confirmed, pass repositionInputs={false} on those four drawers inside the app shell only (appShellOnClient() !== null). Keep today's behaviour in Safari and Chrome. Then re-test the iPhone scroll lock that the comment at ConversationView.tsx:551-561 warns about.
- Source: gap-store-app-shell-and-push-paths-1

**F11. The Terms review plans to say only organizers see who's going, which isn't true for club events** (now-unrelated-to-merge)

The Terms review on the Mac (defender round 1 and 12-results) plans to say 'who is going is shown only to you and to the event's organizers', and tells Franky everyone else sees only a count.

That is false for club events. Since wave 1, which is live now, a Going or Maybe RSVP puts you in the event chat, where every other attendee and every officer sees your name and face (up to 8). If v3 uses that line around Oct 14, the published Terms would promise less exposure than the app actually gives. The v3 Block sentence 'you stop seeing theirs' also clashes with the officer Board-post exception (F04).

- Evidence: - handoffs/legal-2026-09-29/11-defender-round1.md:159, :167, :169, :1399, :1552, :1645, :1832 (T7.3), :1844-1846 (B8/B11), :1967.
- handoffs/legal-2026-09-29/12-results.md:44 ('everyone else sees a count').
- On main: src/lib/chat/message-read.ts:873-1000 (readGoing) returns up to 8 going people (name, handle, avatar) to every event-room member. The branch's EventAbout.tsx:108-145 draws 5 faces.
- Local probe as blake (BEGIN..ROLLBACK, role authenticated): rsvps gave 1 row (his own); the event-room roster gave 4 rows, including casey (mod, Maybe).
- Franky's calls: wave-0-decisions.md:12 and :56. Contract 8.7: 'the roster is the going list, by design'.
- Fix: Before v3 is written:
- Rewrite T7.3's RSVP clause, B8 and B11 to say 'counts everywhere; names to organizers and to others going, inside that event's chat'.
- Correct 12-results.md:44.
- Word Block to cover club rooms and the Board exception, or strike the exception (F04).
- Source: cloud-notes-3, legal-vs-wave2-03

**F12. Once a club officer removes a message, nobody else can report it and Vibe keeps no record** (before-oct-26)

After an officer removes a message, only its author can see it. If the target or any other member tries to report it, they get 'That's not there anymore', and Vibe never hears about it. The poster can then delete it for good.

For a threat or grooming message, a well-meaning mod's Remove quietly shuts Vibe's own safety path. The victim can still report the account or email help@, but without a copy of the message.

The admin desk has gaps too:
- It can't tell an officer's removal from Vibe's.
- It has no Restore button (undoing needs a hand-typed API call).
- If the officer deletes their account, the record of who removed the message is gone.

- Evidence: - The remove route writes no moderation_actions row (route.ts:173-186; accepted as a decision in contract 6.1 step 10 and wave-1-contracts.md:471). The author's hard delete is unlimited (route.ts:86-99).
- src/app/api/me/reports/route.ts:521-525 answers 404 when the reporter can't see the row.
- Local rolled-back run after emery removed blake's message: casey sees 0 rows, emery 0, blake 1. Blake's delete then leaves 0 moderation_actions rows.
- The confirm dialog never mentions reporting (club/RoomThread.tsx:174). Report sits next to Remove in the officer sheet (:309-318, :341-342).
- Admin desk: src/app/api/admin/reports/route.ts:447 selects only id, user_id, channel_id, removed_at. src/app/admin/reports-client.tsx:719 shows the same badge for both kinds of removal. The admin content/remove route (:140-193) logs a Vibe takedown on an officer-removed row.
- /api/admin/content/restore has no caller in src.
- removed_by is ON DELETE SET NULL.
- Fix: - In the remove route, write a service-role snapshot or log row for every officer removal (reason 'officer_removed'). F02's new table can hold it.
- Add 'Also report it to Vibe' to the Remove confirm.
- In the admin desk, show 'removed by a club officer' vs 'removed by Vibe', and add a Restore button.
- In v3 §9/§11, tell officers to report threats, exploitation and intimate content rather than only remove it.
- Source: legal-vs-wave2-06, gap-moderation-admin-and-side-surfaces-4

**F13. A Vibe admin can't judge a reported poll or sign-up: the report shows only 'Poll: <question>', never the options** (before-oct-26)

From Oct 5, someone can post a poll with a harmless question and abusive options naming a member. When it's reported, every admin sees only 'Poll: Best costume?', with no options and no counts.

The options are saved with the report, but the admin screen never shows them, and no admin screen can open the live poll. The author can also delete the poll while the report is open. Apple checks that reported content can be reviewed and acted on.

- Evidence: - src/app/admin/reports-client.tsx:179-240: SnapshotBox reads only top-level string keys such as title, name, handle and content (:194-199). It never reads 'card'. See also :769.
- src/lib/chat/cards/snapshot.ts:50-83 stores card.{question, options[{label, capacity, count}], anonymous, closes_at} and no voter ids. src/app/api/me/reports/route.ts:534-546.
- No admin route or screen reads chat_poll* (grep of src/app/admin and src/app/api/admin).
- Local rolled-back run: a poll whose option read '@avery_owner looks like a <slur>' (3 votes) stored content 'Poll: Best costume?'.
- Production has 0 reports today.
- Foreseen in scratchpad/audit/verify-gap-admin-moderation.md:12. Not in any cloud note.
- Fix: In SnapshotBox, show snapshot.card when present:
- the question;
- each option label with its count and capacity;
- 'anonymous' and 'closes';
- for an Event card, the title and time.

Add a line saying voters are not recorded. Ask Franky whether a report on a named (non-anonymous) poll should also save voter handles.
- Source: gap-moderation-admin-and-side-surfaces-2

**F14. Tapping a push for an @mention in a club chat opens the club's page, not the chat** (before-oct-26)

When someone @mentions you in a club chat (Board reply, Lounge, event chat or Officers), tapping the notification opens the club's page. To find the message you have to open Channels, then the room, then look for it.

Both contracts say these links point at the room, and wave 2 describes it as done, but the code was never changed. This is today's behaviour, flag on or off. The phone's Otto row for a chat mention has no link at all, and on desktop it goes to a plain /messages.

- Evidence: - src/lib/push/payload.ts:400-411: a club_chat mention has url = clubPath(handle), i.e. /orgs/<handle>. threadPath is used only for DMs, groups and requests (:444-473).
- src/lib/push/dispatch.ts:764-797 (decideMention) passes no channel id.
- Tap handling: NativeBridge.tsx:48-55 and :98-103; public/sw.js:274-310.
- src/components/otto/OttoActivity.tsx:80-86 returns null. src/components/network/OttoSidePanel.tsx:960-964 links to /messages.
- Contracts: wave-2-contracts.md:186 and wave-1-contracts.md:531. plan-critique.md:323 and :330 planned the change.
- git diff 5c68da1..HEAD is empty over push, native and otto.
- Fix: In decideMention, pass the channel id (and thread_root_id for a Board reply). Set the url to /campus?tab=chat&org=<handle>&channel=<id>.

That one link works with the flag on (CampusMobile.tsx:301-311 forwards to /messages?channel=) and off (today's Campus › Chat, the Apple reviewer's path). Give the phone's Otto row the same link.
- Source: gap-store-app-shell-and-push-paths-2

**F15. On the new Messages home, one busy club can wipe other clubs' latest message and time and push them down the list** (before-oct-26)

The Messages home reads the newest Lounge lines for all your clubs in one shared batch: 5 lines per club in total, not 5 each. When one club's Lounge is busy (10 lines is enough for someone in 2 clubs), the other clubs lose their Lounge preview:
- The row falls back to an older Board post, shows an older time and sinks below DMs that are actually older.
- A club with no Board post shows no preview and no time, and drops to the bottom with only 'N new'.

Event-room activity has the same problem. The code comment says each room gets its own window; it doesn't.

- Evidence: - src/app/api/me/inbox/route.ts:152-156: the comment says 'its own window of 5 rows per room'.
- :159-175: one query, .in(channel_id, ids).order(created_at desc).limit(ids.length*5).
- :241-263: readEventActivity uses limit(E*3). :287-291 is where the results are used.
- home/home-rules.ts:46-69, :106-117, :200-202: a row with no recency sorts last.
- Local rolled-back run as a student in 20 clubs (audit2/v_run1.sql): Board 100 rows from 1 of 20 rooms; Lounge 100 from 1 of 20; event 123 from 1 of 41. Clubs 2-20 got no previews and no last-activity time.
- Contract 7.1.4 (:740) assumes per-room windows. ROUTES-M1 (wave-2-critique/routes.md:52-58) only split the Board window from the Lounge window.
- Fix: Read previews per room with one SQL function, for example chat_inbox_previews(room_ids uuid[]):
- a LATERAL (... order by created_at desc limit 5) per room, which uses idx_messages_channel_created;
- security invoker, so RLS still applies;
- limit 1 for event-room activity;
- the unread counts returned from the same call.

Add a test with one busy and one quiet room. The same function fixes F58 and part of F48.
- Source: gap-real-data-shapes-and-load-1

**F16. Once your clubs get big, the old Messages list loses DM names and shows blocked people's DMs again** (before-oct-26)

The old Messages list is used on desktop, on the phone with the flag off, and by the Share-a-post sheet even with the flag on. To find the other person in each DM, it reads every member of every room you're in. Since wave 1 every club member is in the Board and the Lounge, so this read grows with club size. The database stops at 1,000 rows without saying so.

Once your clubs total roughly 500 or more members:
- some DMs lose their name and avatar;
- a DM with someone you blocked shows up again.

It's not live yet (production has 42 room memberships), but it arrives as clubs onboard.

- Evidence: - src/app/api/me/threads/route.ts:585-591: the roster read over every non-event room has no limit and no order. :604-623 is where it's used.
- :738-745: the block filter needs a peer, so a DM with no peer isn't filtered.
- Callers: src/components/mobile/SharePostSheet.tsx:130 and MessagesMobile.tsx:499.
- supabase/config.toml:18: max_rows = 1000.
- Local rolled-back run (v_run4.sql): 52 room ids gave 12,294 rows uncapped. The first 1,000 covered 40 rooms. DMs with a peer row: 0 of 10; groups 0 of 1; requests 0 of 1.
- Production: 5 clubs, 7 memberships, 42 room memberships.
- Fix: Read the roster only for DM and group rooms: club rooms are labelled by clubRoomLabel and need no roster. Or give club-room entries members: [] without reading them.

Add a regression test with more than 1,000 roster rows.
- Source: gap-real-data-shapes-and-load-3

**F17. On the free plans, chat polling could use up the monthly Supabase data allowance, after which every API call is refused** (before-oct-26)

Supabase is on the Free plan (confirmed), which includes 5 GB of outgoing data a month. If the project keeps going over, Supabase can start refusing every API call after a grace period: login, feed, profile and chat.

The new chat polls often. With compressed responses, 200 moderately active students would probably use the allowance in weeks, and about 1,000 students in about a week.

Vercel may also be on Hobby, which has its own limits and is for non-commercial use. This isn't confirmed because the connector was refused. Supabase Pro is already on the security report's list.

- Evidence: - get_organization bjbutegxvbusnmgeiaqa: plan=free.
- Supabase docs: Free includes 5 GB uncached egress. Under Fair Use, repeated overage can bring restrictions, including '402 for all API requests'.
- src/lib/chat/use-room-poll.ts:51; src/lib/chat/message-read.ts:84-85; home/MessagesHome.tsx:42.
- A 50-row page is 33,280 bytes, 3,841 bytes gzipped (audit2/vgz.mjs).
- handoffs/2026-09-27-security-risk-report.md:424 and :794.
- Vercel get_team answered 403. 'Hobby' comes only from handoffs/2026-04-30-session-28-phase1-supabase-r2-vercel.md.
- Fix: - Confirm both plans in their dashboards.
- Before Oct 26, move Supabase to Pro (250 GB) and Vercel to Pro, and set spend limits.
- After a week of testers, read data used per active user on the Supabase usage page.
- In code: lighter full reads (skip the author embed for rows already on screen) and a smaller thread-list window.
- Source: gap-real-data-shapes-and-load-8

**F18. An officer's club space redoes work for every past event on every 20-second refresh** (after-launch)

Officers are added to every event chat, and never removed when an event ends. Every 20 seconds the club space counts unread messages in each of those rooms and looks up RSVPs for every past event, then throws the closed ones away.

Once the club's events pass about 500 RSVPs in total, it switches to a slow path that handles one event at a time. For an active club after a semester, that's about 1-2 seconds per refresh, plus database load for everyone.

- Evidence: - src/app/api/orgs/[slug]/space/route.ts:149-152 reads every room. :174-216: :209-215 makes one count per room, and :216 sends every event to eventRefsFor.
- src/lib/chat/reads.ts:201: closed rooms are dropped only afterwards.
- src/lib/chat/event-refs.ts:84-125: the per-event fallback runs one event after another. See also :155-162.
- Migration 20261001100000_chat_v2_rooms.sql:919-930: owners and admins get a row on every new event room.
- club/ClubSpace.tsx:79 and :233-235: 20-second re-read.
- B2-notes.md:130 records only that the fallback exists.
- Fix: - Drop closed event rooms (events.ends_at + 7 days < now) before the counts and eventRefsFor.
- Replace the per-event fallback with one grouped count, or an RPC.
- Batch the unread counts with F15's function.
- Source: gap-real-data-shapes-and-load-6

### New: low

**F19. The merge command in the handoff will refuse, because main moved while the cloud worked** (before-merge)

While the cloud worked, the four Terms-review commits (docs only) landed on main. The handoff still says main is at 5c68da1, so step 7's second fast-forward merge will stop with 'Not possible to fast-forward.'

Nothing breaks, and B can sit on production harmlessly. The risk is timing: the stop comes right after the production apply. Someone improvising under time pressure could force-push and wipe the four legal commits from main.

- Evidence: - `git merge-base --is-ancestor origin/main origin/claude/relaxed-davinci-9d11h3` exits 1.
- origin/main is d48ade0: 4 commits (f32420d, 2a73992, d37a605, d48ade0) touching 8 files, all under handoffs/legal-2026-09-29/. The merge-base is 5c68da1.
- In a throwaway clone, step 7 word for word gave 'fatal: Not possible to fast-forward, aborting.' (exit 128).
- `git merge-tree --write-tree` is clean (tree 08b4963), and a rebase of all 93 commits applies cleanly. The migration md5 stays 0154a6f10c3988d4202d932472773c77.
- Handoff :3 ('main is untouched at 5c68da1') and :30. Contract 13.4 step 4 (wave-2-contracts.md:1075) and SCHEDULE-M7 (:1240).
- Fix: Before step 6, on the branch run `git fetch origin && git merge origin/main`, which keeps every SHA the notes cite (a rebase also works). Push, let the Preview rebuild, and re-run typecheck and tests. Take the md5 from the pushed file. Step 7 then fast-forwards as written.

- Add `git merge-base --is-ancestor origin/main <branch>` as a pre-check.
- Fix handoff :3.
- Never force-push main.
- Source: schema-truth-1, gates-hygiene-01, cloud-notes-1, prod-readiness-1

**F20. Everyone downloads the new chat screens even with the flag off: about 38 KB more (compressed) on Campus, profiles and Messages** (before-merge)

The new phone chat screens are bundled into pages that people who can never open them still load:
- the Campus page, where the store apps start;
- both profile pages;
- Messages;
- on desktop too.

That is about 160 KB more JavaScript before compression (+14% on Campus, +37% on Messages), and Apple's reviewer pays it too. It affects speed only; nothing behaves differently. A three-line change removes it.

- Evidence: Builds of 5c68da1 and da22efa compared:
- /campus: +162,513 bytes raw / +38,592 gzip. /profile and /profile/[handle]: the same.
- /messages: +162,013 / +38,364.
- Chunk 0rl5mb1zpm3ve.js: 230,012 raw / 54,731 gzip.

The imports that pull it in: MessagesMobile.tsx:18 and :22; CampusMobile.tsx:37; ProfileMobile.tsx:10; campus/CampusSwitch.tsx:3; profile/ProfileSwitch.tsx:3. The store apps start at /campus (mobile/capacitor.config.ts:43). integration-flag-off.md:36 noted it but never measured it.

Lazy-load experiment: /campus back to its old size, /messages +24,311.
- Fix: - In MessagesMobile.tsx, load ClubSpace and MessagesHome with next/dynamic(..., {ssr:false}).
- In CampusMobile.tsx:37, import ConversationView from '@/components/mobile/messages/ConversationView'.
- Re-run typecheck, tests and eslint.
- Add 'short skeleton on first load' to the flag-ON walk.
- Source: flag-off-surface-1

**F21. Squashing the screenshot commits wouldn't make the repo lighter, and the commit list in 17.5 is wrong** (before-merge)

The handoff offers to squash the roughly 40 MB of screenshot commits to keep the repo light. That wouldn't save anything, because every screenshot ever committed is still in the final branch. Only deleting the superseded folders before the merge reduces the size: about 27 MB, keeping run3.

The commit list in 17.5 item 1 is also wrong. It misses run3's commit, and three of the commits it lists carry real code (the visual repairs), so dropping them instead of squashing would lose code. Deploys are unaffected, because handoffs/ isn't deployed.

- Evidence: - 226 unique png/woff2 blobs, 39.75 MiB; 0 of them are gone from the final tree.
- The visual/ folder at the branch head: 319 binary files, 59M on disk.
- Commits that carry binaries: 5d0e424 (75), 6adce71 (5), 4bd44ea (8), 4066fd1 (6), d2225fd (153), 542e167 (72, run3). 6592caa, 6cef6bb and b3381af add only review .md files.
- 6adce71, 4bd44ea and 4066fd1 carry 12 src files (+210/-99).
- Contract :1391 (17.5 #1); handoff :9; .vercelignore.
- Fix: - For a lighter repo: on the branch, `git rm -r` visual/*.png, run2/, run2/clip/ and repair-S1..3/ (26.58 MiB). Keep run3/, then merge.
- Otherwise merge normally.
- Never drop 6adce71, 4bd44ea or 4066fd1.
- Fix 17.5 item 1's commit list and its 'final state' line.
- Source: gates-hygiene-02

**F22. From Oct 5, the migration's self-test will quietly skip on the Mac unless the seed is re-run first** (mac-window-1)

The self-test needs a local club with an upcoming event. The seeded 'Chat Seed Game Night' ends Oct 5 01:00 UTC (Oct 4, 9 PM Eastern). A rehearsal on Oct 5-6 would therefore say 'probe: skipped', which looks like a pass.

The separate card test script still covers the same cases with its own data. Re-running the seed first fixes the skip, but only after F01's fix; without it, the self-test will crash instead of skipping.

- Evidence: - Migration :1316-1352 is the fixture query; :1278 is the default skip reason.
- Locally today: 3 candidates. With now() set to 2026-10-05 02:00Z: 0.
- scripts/local-seed.mjs:26-34 (run on the same UTC day), :524 and :790-795 (re-dates the event to +5 days at 23:00 UTC).
- Contract :1068 (13.3 step 1) and 3.8. B1-gate.md:65-68.
- scripts/sql/chat-v2-cards-check.sql:284-288 and :621-627 build their own events.
- Fix: After F01's fix, run `node scripts/local-seed.mjs` on the same UTC day, before rehearsal 2. Require 'behaviour check passed' in the NOTICE and in the local APPLY RECORD.
- Source: schema-truth-2

**F23. The local apply command in the migration header needs psql on the Mac, which isn't installed** (mac-window-1)

The migration header's local apply command runs psql on the Mac, but psql isn't installed. Only the database container has it, and the repo isn't visible inside the container.

The command fails immediately. A quick workaround that sends the md5 in a separate call would record 'file md5 NOT GIVEN'.

- Evidence: - `which psql` finds nothing: not in /opt/homebrew/bin, libpq, /usr/local or Postgres.app.
- The supabase_db_vibe container mounts only its data volume.
- Migration :178 and contract 3.9 (:563) assume psql on the host. chat-v2-cards-check.sql:6 already uses docker exec.
- Tested: `docker exec -i ... -c set_config -f -` with the file on stdin ran both in one session and showed the md5.
- Fix: Use:
`docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select set_config('chat_cards.file_md5','<md5>',false)" -f - < supabase/migrations/20261001110000_chat_v2_cards.sql`

Run the rehearsals the same way, with the rollback copy on stdin.
- Source: prod-readiness-4

**F24. One sentence about the file md5 in the contract can't be true, and the md5 in the notes is the pre-constants one** (mac-window-1)

Contract 13.3 step 1 applies B locally, then fills in the COST notes inside the file, then commits and takes the md5. It also says the local record will show the same md5 as production. It can't, because filling in COST changes the file. Nothing reads the local record, so this is a wording fix.

The md5 printed in the notes (0154a6f1...) is the pre-constants one. That file can't be applied (it stops with 'constants are empty'), and a wrong md5 on production is caught by CHECK AFTER APPLYING (4).

- Evidence: - Migration :1686-1698 records the md5 and never checks it. :1234-1243 stops on empty constants. :234-245 holds the COST placeholder.
- Contract :1068, :563 and :1396 (17.5 item 4). integration-gates.md:98.
- `git show HEAD:<file> | md5` = 0154a6f10c3988d4202d932472773c77.
- Fix: - Fill COST during rehearsal 2, before the constants commit, or delete 'so the local record reads the same'.
- Label 0154a6f1... as 'pre-constants, parse-time only'.
- For production, build the body in one step from the pushed file: git show origin/<branch>:<file> > b.sql; take M=$(md5sum < b.sql); prepend the set_config line; then jq --rawfile.
- Source: prod-readiness-5

**F25. Undoing migration B would briefly freeze reads on the busiest tables, and there's no backup to restore cards from** (mac-window-1)

The migration header says undoing B takes the same light locks as applying it. Measured locally, it doesn't. The rollback takes exclusive locks on messages, users, channels and channel_members. While it waits (up to 5 seconds), reads on almost every page queue behind it; once it runs, the block lasts only milliseconds.

Separately, production has no backups on the free plan. If B is rolled back after clubs post polls, every poll, sign-up, vote and reply under a card is gone for good. A dump taken before the apply wouldn't help, because it has no cards yet. A dump taken right before any rollback would.

- Evidence: - Local pg_locks readings (vcdb/f2.out): drop trigger takes AccessExclusive on channel_members; drop table takes AccessExclusive on channels, messages and users.
- During the apply: only ShareRowExclusive, and reads kept working (7 and 63 rows). During the rollback, reads of users and messages hit lock_timeout.
- Migration :205-232 and :218-220; contract :195 and :589.
- The probe's writes are rolled back inside the migration (:1544, :1608-1628, :1638, :1648-1650, :1660-1665).
- handoffs/legal-2026-09-29/12-results.md:87: the free plan has no backups.
- Fix: - Correct the migration header and contract :195.
- Split the rollback in two short transactions. First drop the trigger and the 5 functions; the routes then fall back to 404. Later, at a quiet hour, drop the tables with set local lock_timeout = '2s' and a retry.
- Before any rollback, dump chat_polls, chat_poll_options, chat_poll_votes, chat_event_cards, and the non-text messages with their replies.
- Source: gap-cards-db-run-local-2, cloud-notes-11

**F26. The first phone test on real data can't try anything that needs an upcoming event** (mac-window-1)

Good news first: the founders can test both roles on real data, because the flag is per person. Franky is a plain member of Rylan's hidden Kelley Floor, and James is a member of Franky's hidden Finance Club.

But every production event ends by Oct 1 00:00 UTC. On Oct 5-6 these can't be tried unless someone creates a new event:
- 'Share an event';
- Your week and Up next;
- the event chat's soon and live states.

- Evidence: - src/lib/chat/flag.ts:73-81 and flag-server.ts:75-81: the flag is per person, in every club they belong to. src/lib/chat/reads.ts:110-131; space/route.ts:137-142.
- Production (read-only):
  - Kelley Floor test-6ca4ec6e: Rylan owner, Franky member, 0 events.
  - Finance f7ae4129-3228-4f8e-9022-c93874a42369: Franky owner, James member, last event ended Sep 10.
  - SAE: owner only; its last event ends 2026-10-01 00:00Z.
- chat_create_event_card refuses ended events (P0C23).
- Fix: Before the phone test, and ideally before the apply (see F52), create one upcoming event in hidden Finance Club or Kelley Floor. CHAT_V2_CLUBS doesn't need to change.
- Source: prod-readiness-3

**F27. Row 11's darker Retry text only changed on the React pages; the static pages keep the old cream text** (mac-window-1)

Row 11 changes the Retry button's text from cream to dark 'on every LoadFailed', but only the React version changed. The static pages keep the old cream text, so desktop shows two different Retry buttons, sometimes on the same screen. Those pages are:
- desktop /messages and the mini messenger;
- the static profile and onboarding pages;
- a few others.

It's cosmetic.

- Evidence: - src/components/feedback/LoadFailed.tsx:129 changes #FAF7F2 to #140806. :15 says static pages use the twins.
- public/html/_persistence.js:527 still has 'background:#FF5C35;color:#FAF7F2', and the toast button at :354 does too.
- Used by messages.html, _miniMessenger.js, profile.html, onboarding.html, _postViewer.js, _otto.js and _sharePicker.js.
- Not mentioned in the contract or wave-2-build.
- Fix: Make this part of Franky's row-11 call.
- If he keeps row 11: change _persistence.js:527 (and :354) to #140806, add it to row 11, and add the static Retry to 17.5 item 28's check.
- If he reverts row 11: nothing else is needed.
- Source: flag-off-surface-3

**F28. Re-running the screenshot harness on the Mac talks to the real local Supabase and leaves untracked files** (mac-window-1)

Re-running the screenshot harness is optional now that run3 exists. On the Mac, though, it quietly talks to the real local Supabase instead of its fake one:
- The local stack already owns port 54321.
- The fake server binds only 127.0.0.1.
- next dev's 'localhost' resolves to the real one.

The shots come out as login pages. No data is touched. Separately, `npm install` inside visual/tools leaves node_modules and a lockfile untracked in the repo.

- Evidence: - lsof: com.docker on *:54321. `docker port supabase_kong_vibe` gives 0.0.0.0:54321 and [::]:54321.
- handoffs/chat-redesign/wave-2-build/visual/tools/fake-supabase.mjs:19 defaults to 54321; :140 binds 127.0.0.1.
- Tested on a spare port: both servers bind, and 'localhost' reaches the IPv6 one.
- visual/README.md:392-402. .gitignore:4 and :102 ignore only the root and mobile node_modules.
- harness-notes.md:191 and :215: the cloud copied tools/ to its scratchpad before installing.
- Fix: - Run with FAKE_PORT=54399 and NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399, or run `supabase stop` first.
- Copy tools/ to a scratch folder before npm install, or add handoffs/**/node_modules/ and handoffs/**/package-lock.json to .gitignore.
- Update the README.
- Source: gates-hygiene-03, cloud-notes-10

**F29. The handoff and section 17 disagree on facts session 71 will rely on** (mac-window-1)

Session 71 will read the handoff and section 17 together, and they disagree:
- 'nine' frozen rows vs eleven;
- run2 vs run3 as the final screenshots. run3 already shows the Board card, the club dot, the inverted + and the Retry ink that 17.5 says still need walking;
- main 'untouched at 5c68da1' (it's now d48ade0);
- '2cdcfbe, the last code change'. That commit is docs only; the last code commit is ebf6c3a, and the head is da22efa, not b497c2d.

Also, the Mac Terms-review session and the cloud both called themselves 'session 70'.

- Evidence: - handoffs/2026-09-30-session-70-chat-wave-2-cloud.md:3, :9, :13, and :32 vs :50.
- wave-2-contracts.md:1355 (17.2 L9), :1391 (17.5 #1), :1393.
- wave-2-build/check-run3.md; run3/23-load-failed-light.png shows the dark Retry ink.
- legal-2026-09-29/01-brief.md:1, 10-attacker-round1.md:3 and 11-defender-round1.md:3 all say 'session 70'.
- Fix: In the handoff:
- 'nine' becomes 'eleven'.
- main is at d48ade0.
- The last code commit is ebf6c3a; the head is da22efa.

In 17.5 #1 and 17.2 L9: run3 is final and already shows rows 25, 28, 30 and 31. Number the next session 71 for both threads.
- Source: cloud-notes-10, gates-hygiene-01

**F30. Calendar clash: window 1 still lands on demo-days week, and window 2 now shares days with the Terms work** (mac-window-1)

The cloud finished on Sept 30, three days early, but Mac window 1 is still Oct 5-6. Those are the same days as the f2 follow-ups, D-U-N-S and demo days.

Window 2 (Oct 12-14) now also has to hold the Terms review's 'code before the Terms publish' items and the Privacy rewrite. Neither handoff knows about the other.

- Evidence: - Contract :1021-1034 (13.0).
- Handoff :5 (closed Sept 30), :20 (window 1 on Oct 5-6), :31.
- handoffs/legal-2026-09-29/12-results.md:37 and :55.
- Launch plan: f2 Oct 4, D-U-N-S about Oct 5, Apple/Google about Oct 7-9, f9 Oct 9.
- Fix: - Move Mac window 1 to the first free day (Oct 1-3 if possible).
- Make one Oct 12-14 list that combines chat window 2 with the legal 'before publish' code items.
- The Oct 15 chat freeze list can stay chat-only.
- Source: cloud-notes-4

**F31. The Mac checklist never opens the new screens inside the store apps** (mac-window-1)

Founders and SAE members get the new chat on Oct 5-6, and the Android build arrives Oct 9. No step in the Mac checklist opens the new screens inside the store apps.

Several things behave differently there: the keyboard (F10), push taps (F14), and native Back and the edge swipe (F06, F53). The old device list with these checks was never carried into wave 2.

- Evidence: - A grep for keyboard, Capacitor, 'store app', WKWebView and webview in the contract, the handoff and wave-2-build finds 0 hits.
- 17.5 item 13 (:1411) uses a phone browser. Item 19 (:1417) uses the browser's Back.
- critic-s2s3.md:397-406: the deferred device list.
- Contract :1027 and :1029.
- NativeBridge.tsx:170-174; MainViewController.swift:19.
- mobile/package.json:22: @capacitor/keyboard 8.0.5, with no config block.
- Fix: Add an 'in the store apps' block to 17.5; the steps are in not_checked. Run it on the Oct 9 Android build and on a CAP_DEV_URL iOS build against local next dev, before the flag reaches anyone who has the app.
- Source: gap-store-app-shell-and-push-paths-7

**F32. After a block, voting on the blocked person's poll still works and returns the whole poll** (before-oct-26)

After you block someone, their poll shows up as a hidden stub. But if you kept an option ID from before the block, voting with it still works:
- It returns the full poll: question, options, counts and voters.
- The blocked person sees the count move, though never your name.

This needs the flag and a saved ID, and almost everything returned is what you saw before the block. The photo, reaction and quote routes were checked and don't leak.

- Evidence: - src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts:98-157 reads the row as the user and never calls isHiddenFrom (see :115-116 and :145-157).
- chat_cast_vote (migration :771-827) checks access, removal and closing only.
- src/lib/chat/stub.ts:57-80.
- Production has 0 club-room messages with media.
- media/route.ts:50-51 has an out-of-date comment.
- Fix: In the vote route, after step 10, answer 404 when isHiddenFrom(row, blocked, room, clubRole(author)) is true. Fix the comment in media/route.ts:50-51.
- Source: route-security-2

**F33. A refresh already in flight can briefly undo your own send, removal, vote or reaction** (before-oct-26)

If you act while a 20-second full refresh is already in flight, it can briefly undo what you just did:
- A sent message blinks out for up to 4 seconds.
- A message a mod removed comes back for up to 20 seconds, as if the removal failed.
- A vote or reaction shows the old count.

It fixes itself, and nothing is lost on the server. It needs the action to land in a window of a few hundred milliseconds.

- Evidence: - src/lib/chat/use-room-poll.ts:228-235 merges against the state at answer time. :385-430 are the local changes, with no generation counter.
- src/lib/chat/page-merge.ts:53.
- RoomComposer.tsx:220; RoomThread.tsx:251; reactions.ts:28.
- Simulation audit2/verify-merge-sim.mts: cases B-D reproduce it.
- Contract 9.3 and N18 protect only unsent temp_ rows.
- Fix: Bump a generation counter on every local change (append, replace, remove, replaceCard) and drop any full read that started before it; the next tick retries. Or keep rows changed after the read began, plus a set of removed ids.
- Source: screens-dataflow-6

**F34. The Messages home keeps refreshing underneath an open club space or conversation** (before-oct-26)

The Messages home keeps refreshing its lists every 30 seconds while a club space or conversation covers it, and each refresh redraws the open room. That's 2 extra thread-list reads and 2 extra inbox reads a minute per open room, for a screen nobody can see.

Today's list has no timer, so this cost is new. The cloud already paused the Board timer under the event layer, but not the home.

- Evidence: - src/components/mobile/MessagesMobile.tsx:371 always renders MessagesHome; the layers are at :382 and :396. There is no 'paused' prop (:45-57). setLists at :278-288 redraws everything.
- home/MessagesHome.tsx:105-112 and :115-146: the 30-second timer.
- There is no React.memo under messages/.
- The old list only re-reads when the app comes back to the front (MessagesMobile.tsx:532-540).
- S2-repair.md:32 paused the Board timer.
- Fix: Pass paused={open !== null || composeOpen} to MessagesHome and skip the timer read while paused. The refreshKey bump on close already refetches.
- Source: screens-dataflow-7

**F35. In Light mode, your own reaction count is nearly invisible, and the chips are too small to tap** (before-oct-26)

In Light mode, the count on a reaction you picked is nearly invisible: about 1.1:1 contrast, against the 4.5:1 rule for new screens. The chips are also about 22px tall, against the 44px tap-target rule.

The colours were copied from today's text bubbles, so the same unreadable count already shows on picked reactions in DMs and the Lounge.

- Evidence: - src/components/mobile/messages/cards/CardBubble.tsx:118-148 and :367-371.
- MessageBubble.tsx:733-745 has the same palette.
- Computed ratios: 1.11:1 on cream, 1.17:1 on white. Night is 9.76:1 and fine.
- S1-contrast.md has no row for the chips.
- Contract 11.0; 14.24; 17.1 row 28.
- Fix: - Draw picked chips from the palette: t.coralText on a coral tint in Light, today's look in Night.
- Give each chip a 44px hit area.
- Fix MessageBubble the same way.
- Add the row to S1-contrast.md.
- Source: screens-dataflow-9

**F36. Keeping Apple's reviewer on the old chat depends on the review accounts never joining SAE, and nobody wrote that down** (before-oct-26)

The flag turns on for every member of a club listed in CHAT_V2_CLUBS, which is SAE from Oct 5-6. The App Store notes tell Franky to have review account 1 join a live club, and SAE is the only real one.

If a review account becomes a member of SAE (following isn't enough), Apple's reviewer gets the new chat on Oct 16. There, a text Board post or reply has no Report button yet (F59).

- Evidence: - src/lib/chat/flag.ts:1-30 and flag-server.ts:75-97: every current member of a listed club gets the flag.
- handoffs/stores/review-notes.md:61-66 (step 5).
- handoffs/wave-plan-pwa/research-stores/critic.md:199-200.
- Contract :816 and :1349.
- Production: the review accounts don't exist yet, and SAE has 1 member.
- Fix: Add to review-notes.md step 5 and to 17.5: review accounts may follow SAE, but must not be members of any club in CHAT_V2_CLUBS until 17.2 L3 ships. Or move L3 into window 2.
- Source: cloud-notes-5

**F37. Removing a Board post hides a reported reply under it that the Remove button itself refuses to touch** (before-oct-26)

An owner or admin can remove someone else's Board post, and every reply under it then disappears from the app for everyone. That hiding is by design. What's new is that two rules aren't checked for the replies:
- A reply with an open report, which the Remove button itself refuses to touch, disappears.
- Replies by the club owner, who outranks the admin, disappear.

Nothing is deleted. The Vibe queue still shows the reported reply as live, and Vibe can still act on it.

- Evidence: - The remove route (:152-171) checks rank and open reports on the target message only.
- src/lib/chat/room-rules.ts:67-71: equal rank is allowed.
- src/lib/chat/message-read.ts:773-795: rootState answers 'no', and the replies read gives 404.
- BoardView.tsx:30-31 and :135-138.
- src/app/api/admin/reports/route.ts:517-523.
- Contract :715. scratchpad/audit/admin-moderation.md F4.
- Fix: - When the target is a Board post, also refuse if any reply has an open report, or was written by a higher-ranked member.
- In the admin loadLive, mark a reply whose post is removed as 'already out of sight'.
- Source: gap-moderation-admin-and-side-surfaces-3

**F38. The admin Remove form says the sender won't see the reason, but on the new phone club screens they read it word for word** (before-oct-26)

When a Vibe admin removes a message, the form says 'The sender will be shown it once the removed-message notice ships.' That is out of date. On the new phone club screens, the author reads the admin's reason word for word, and it's already in their data on production today.

An admin who writes an internal note such as 'likely alt of @x' would be showing it to the student.

- Evidence: - src/app/admin/reports-client.tsx:941-952; the sentence is at :950-951.
- On main, src/lib/chat/message-read.ts:75 and :497-505 already send the reason. On the branch: message-read.ts:548-556.
- It is rendered at RoomThread.tsx:320-324, BoardView.tsx:138 and BoardPost.tsx:270-272, and ReportSheet.tsx:698-701 prints it.
- Fix: Change the line to 'The student may read this.' Or say: 'In a club chat on the phone the sender reads it now; in a DM or on desktop they don't see it yet.'
- Source: gap-moderation-admin-and-side-surfaces-5

**F39. Poll questions and options can be made of invisible characters and look blank** (before-oct-26)

A poll question or option made only of an invisible character, such as a zero-width space or a Hangul filler, passes both checks. So a poll can show an empty question, or a blank button that people can still vote on.

The database's own check is looser than the route's: it also accepts tab-only or newline-only text from any future caller. This is prank-level.

- Evidence: - src/lib/chat/cards/body.ts:41-44 (whitespace collapse) and :82-100.
- Migration :651-664, :687-690 and :579 use btrim, which strips spaces only.
- A Node test accepted labels made only of U+200B, U+2060, U+3164, U+2800, U+115F, U+1160, U+FFA0 or U+00AD.
- Check cases B17 and B24 test spaces only.
- Fix: - In body.ts, refuse text with no visible character (only whitespace, format characters, or the blank fillers U+3164, U+2800, U+115F, U+1160, U+FFA0).
- In SQL, replace btrim checks with a visible-character regex. A CHECK change alters the 7.2 constants, so do it before the constants commit, or leave the SQL for later.
- Source: gap-cards-db-run-local-5

**F40. The live Community Guidelines and Privacy Policy don't mention that polls and sign-ups show names to the club** (before-oct-26)

The Guidelines say 'Counts are public; who did what is yours.' In club chats that isn't quite true:
- Polls show voters' names unless the poster made them anonymous.
- Sign-ups always show names.
- RSVPing Going or Maybe puts you in the event chat.

The app does warn at the right moment ('names shown' on the card, 'You'll appear in the event chat'), so this is a wording fix. The Privacy Policy also doesn't list poll votes or sign-ups. It doesn't say that anonymous polls still record who voted (so each person votes once; only Vibe can see it).

- Evidence: - src/app/legal/community/page.tsx:53-54.
- src/app/legal/privacy/page.tsx:43-46 and :84-88.
- Migration :568: anonymous defaults to false. :584-592: votes store user_id.
- src/lib/chat/cards/hydrate.ts:170-171.
- PollCardView.tsx:126-128 with card-rules.ts:87-90 show 'names shown'. Also NewPollSheet.tsx:149, NewSignupSheet.tsx:195, RsvpSheet.tsx:38-39.
- 12-results.md #9 already plans the Privacy rewrite.
- Fix: In the Oct 14 rewrite:
- Carve club chats out of the Guidelines line: polls show names unless anonymous, sign-ups always do, and Going/Maybe puts you in the event chat.
- Add poll votes and sign-up spots to Privacy §1 and §3, and to the companion's table.
- Add one sentence on anonymous polls.
- Source: legal-vs-wave2-01, legal-vs-wave2-02

**F41. The Terms review's code-facts file, its source of truth, describes chat before wave 2 and has no club-chat section** (now-unrelated-to-merge)

The Terms review audited the code at 5c68da1, and its brief says the code facts win when sources disagree. The file has no section on Boards, Lounges or event chats, which are already live from wave 1. It also has nothing on wave 2:
- officer and mod removal of messages;
- polls, sign-ups and votes shown by name;
- block stubs in club rooms;
- cards in report snapshots.

Terms v2 even says 'Officers can remove messages'. That was false at 5c68da1 and becomes true with wave 2, for mods too. Nothing is published yet.

- Evidence: - handoffs/legal-2026-09-29/00-code-facts.md:1 (audited at 5c68da1), :225-246 (D10), :328-331 (F14), :337 (F15), :361-377, :421-433.
- 01-brief.md:33: 'the code facts win'.
- 02-terms-of-service-v2.md:143 and :163.
- 03-companion.md:25, :41, :56-68.
- On main, messages/[messageId]/route.ts:43 lets only the sender delete. On the branch, route.ts:101-186 adds officer and mod removal; room-rules.ts:24.
- Fix: Before v3, add a section 'K. Club chats (wave 1 live, wave 2 on the branch)' to 00-code-facts.md. It should cover:
- the 11 rows of 17.3;
- the officer and mod remove route, and what removal means: hidden, kept, still seen by the author, not a Vibe action, no appeal;
- polls and sign-ups showing names by default;
- block stubs and the Board exception.

Also amend v2 §9 so mods can remove messages too.
- Source: gates-hygiene-04, legal-vs-wave2-10, legal-vs-wave2-05

**F42. After leaving a club you can no longer delete your own messages there, but members still see them** (now-unrelated-to-merge)

After you leave a club, or switch an RSVP to Not going, you can't delete what you wrote there anymore. The database hides the room from you, including your own messages, while current and future members can still read them. The only way out is deleting your whole account.

Terms v2 says 'You can delete your own ... messages.' This already exists on main today. Your votes and sign-ups there are removed when you leave, by design.

- Evidence: - Local rolled-back probe (v09.sql): after leaving, 13 of blake's messages remain. As blake, SELECT returns 0 rows and DELETE removes 0. The owner still sees them.
- messages_delete_own only acts on rows the user can SELECT, and can_view_org_channel requires club membership.
- Route :70-83 and :102-105 answer 403 'Not a member'; main has the same order of reads.
- Migration :865-906 (the vote trigger).
- 02-terms-of-service-v2.md:108.
- Fix: - Now: in v3 §7/§9, say that after you leave, your club-chat messages stay, and to delete your account or ask Vibe.
- Later: let the sender's own delete go through a service-role path that checks user_id, whatever the membership.
- Source: legal-vs-wave2-09

**F43. A link to an event chat waits for the club's page to load, and fails with it** (after-launch)

A push or link to an event chat waits for the club's data to load before it opens, even though the event chat itself is already loaded. If that club read is slow or fails, the member sees the club skeleton or 'Couldn't load this club.' instead of the chat.

The cloud's records count this as fixed (17.1 row 23), but that fix only removed a double read.

- Evidence: - src/components/mobile/messages/club/ClubSpace.tsx:326 (org from space.data), :350 (LoadFailed), :421-436 (mounts EventChat only when org is set).
- EventChat.tsx:126-172. types.ts:32-39 (OrgRef).
- Contract 11.3 (:938).
- S2-repair.md:50; S2-notes.md:283-285; integration-adjudicate.md:147; contract :1326.
- Fix: Pass the club to EventChat from initialPage?.room?.org when space.data isn't there yet (first open only).
- Source: cloud-notes-7

**F44. The Your week card keeps its old state: quiet after the event starts, 'Live now' after it ends** (after-launch)

On the Messages home, the Your week card for tonight's event keeps its quiet 'Fri 7 PM' look after the event starts, and keeps saying 'Live now' after it ends. It updates only when the week is read again: at most every 5 minutes, and only when you come back to the app.

The club row on the same screen flips correctly. Cosmetic, and it fixes itself.

- Evidence: - home/home-rules.ts:272-282 and :292-296; YourWeek.tsx:54: the state comes from the server's room_state.
- home/MessagesHome.tsx:159-206: the week is read on mount (:188-193) and on return after 5 minutes (:202).
- S1-repair.md:17 took it off the timer on purpose.
- Fix: Work out the state on the phone with roomState(starts_at, ends_at, now) when room_state isn't null. Or re-read the week when the clock crosses a card's start or end.
- Source: screens-dataflow-8

**F45. A long, busy room keeps every message in memory and redraws all of them often** (after-launch)

An open room keeps every message it has seen in memory, and redraws all of them:
- on each check that brings something new;
- on the 20-second full read;
- on the 60-second clock;
- on the home's 30-second list read.

In a long, busy event chat (a few hundred messages) that can make scrolling janky on a low-end Android. Quiet checks cost nothing, and this is unlikely before launch.

- Evidence: - src/lib/chat/use-room-poll.ts:265-267: new rows are appended with no cap.
- src/lib/chat/page-merge.ts:53-55.
- club/RoomThread.tsx:304-372 rebuilds every row.
- ClubSpace.tsx:248-253: the 60-second clock.
- No memo( anywhere under messages/.
- Fix: Keep only the newest ~300 rows in memory, setting hasEarlier when trimming. Memoise the row component.
- Source: screens-dataflow-11

**F46. Poll and reaction counts silently go wrong on a page with more than 1,000 votes or reactions** (after-launch)

The database returns at most 1,000 rows per read without saying so. Poll votes and reactions on a page are each read in one go. So once a page holds more than 1,000 votes (or reactions):
- counts come out too low;
- 'you voted' or 'you reacted' can show as unset;
- a full sign-up slot can look open (the database still refuses overbooking).

The reaction part is existing code that's already live in DMs. Unlikely before launch.

- Evidence: - src/lib/chat/cards/hydrate.ts:93-109 and :232-239. snapshot.ts:58.
- src/lib/chat/message-read.ts:148-172 (reactions; unchanged since 5c68da1).
- supabase/config.toml:18: max_rows 1000. Production doesn't override it.
- The RSVP cap is already handled: event-refs.ts:47, message-read.ts:277.
- Fix: Count in the database with a grouped RPC that returns per-option or per-emoji counts plus the viewer's own. Or page the reads in 1,000-row steps. Do the same in snapshot.ts.
- Source: route-security-3, gap-real-data-shapes-and-load-9

**F47. A Board post with more than 200 replies never shows the newest ones** (after-launch)

A Board post's replies are read oldest-first, capped at 200, with no paging. Past 200 replies, members never see the newest ones. Your own new reply appears, then disappears at the next 20-second refresh.

This needs a very busy post.

- Evidence: - club/BoardPost.tsx:134-151: the read is at :138-139 (limit=200), rows are replaced at :146-147, and the local append is at :180.
- src/lib/chat/message-read.ts:345-356 (cap 200) and :851 (oldest first).
- BoardView.tsx:80-88: 20-second refresh.
- Contract 11.4 (:948).
- Fix: Read the newest 200 (descending, then reverse), or add 'Show earlier replies' paging with before=. Merge re-reads by message id instead of replacing the list.
- Source: gap-real-data-shapes-and-load-10

**F48. Two chat reads get slower as the whole app grows, not just as your clubs grow** (after-launch)

Two reads slow down as the app grows, no matter what a student can see:
1. The security rule on messages checks every club room in the whole database on each full read. That's about 2 ms today (20 rooms), about 15 ms at 170 rooms, and about 150 ms at 3,000. Event rooms are never deleted, so this grows with every event ever created.
2. The Messages home scans every message ever posted in your Lounges just to show five per club.

Both are negligible at today's 58 messages. They're worth fixing before rooms reach the high hundreds.

- Evidence: - Policy messages_select_org_member (migration 20261001100000_chat_v2_rooms.sql). Its COST section (:350-381) assumed a per-message plan.
- src/lib/chat/message-read.ts:853-858; inbox/route.ts:159-175; threads/route.ts:661-667.
- Local EXPLAIN as a student:
  - Lounge read: 16.0 ms at 168 club rooms, 150.7 ms with 3,000 more (sequential scan on channels).
  - The 4-second check: 0.76 ms.
  - Inbox Lounge window: 40.9 ms at 45,690 messages, vs 5.3 ms without RLS.
- Fix: - Rewrite the policy so the viewer's visible room ids are computed once per query, for example channel_id = ANY(ARRAY(SELECT my_visible_org_channel_ids())). Wrap auth.uid() in (select ...).
- F15's per-room function fixes the inbox scan.
- Check query plans at 3,000+ rooms.
- Source: gap-real-data-shapes-and-load-4, gap-real-data-shapes-and-load-5

**F49. Leaving a club doesn't free a sign-up spot taken in a private room** (after-launch)

Leaving a club frees your sign-up spots in the Lounge, Board and event chats. It doesn't free them in a private custom room (made on desktop with an allow-list): your name stays on the spot, and the next person is told it's full.

Production has no private custom rooms today.

- Evidence: - Migration :868-906: the trigger fires only when channel_members rows are deleted. Private-room access lives in org_channel_members.
- Local rolled-back probe (vcdb/f4.out): the private-room spot was kept, the Lounge spot was freed, and can_view was false after leaving.
- Contract 3.5 (:531).
- Fix: Add the same vote-drop trigger for org_channel_members deletes, or write the private-room case into 3.5's accepted gaps.
- Source: gap-cards-db-run-local-4

**F50. Some unusual inputs get 'try again' forever instead of a clear refusal** (after-launch)

A few odd inputs get 'Something went wrong, try again' forever instead of a clear refusal:
- a close date like '2027';
- a date in the browser's long text format;
- a hidden NUL character.

The phone's sheets never send these, so only hand-made requests hit it.

- Evidence: - src/lib/chat/cards/body.ts:57-63 keeps any date string that JavaScript accepts.
- _lib/rpc-refusal.ts:79-88 maps only P0C21-P0C26.
- cards/route.ts:166-176.
- Local Postgres, passing the args the way PostgREST does: '2027' gives 22007; '+275760-...' gives 22009; the long date form gives 22023; a NUL gives 22P05.
- NewPollSheet.tsx:18: v1 sends no closes_at. Contract 4.2 (:622).
- Fix: - In readClosesAt, send new Date(ms).toISOString() and refuse years outside 2000-9999.
- In readCreateCardBody, refuse any text containing U+0000, answering 400 invalid_card with the field name.
- Source: gap-cards-db-run-local-6

**F51. The installed web app's icon count leaves out clubs, while the Messages count includes them** (after-launch)

The installed web app's icon count leaves out clubs, while the Messages count includes them, even though the badge code says the two never differ. This mismatch already exists today with the old list, and wave 2 keeps it.

The store apps show no icon count at all. That a new Board post lights nothing outside Messages is Franky's decided default.

- Evidence: - src/lib/push/badge.ts:9-12 (the promise) and :97-103 (drops club rooms).
- The old list at 5c68da1 counts club rooms: threads/route.ts:477-486 and :764-767; MessagesMobile.tsx:567-574 and :671.
- Contract :922-924.
- payload.ts:561-569; ServiceWorkerRegistrar.tsx:66-73.
- wave-0-decisions.md:26-27.
- Fix: Add unread, unmuted club rooms to loadBadgeCounts, or record in 17.x that club rooms don't light the icon.
- Source: gap-store-app-shell-and-push-paths-6

### Intended by the contract, but it still bites someone: low

**F52. On production the migration's self-test will say 'skipped', which is expected but written down nowhere** (mac-window-1)

On production, the self-test will say 'probe: skipped', because no club there has a plain member plus an upcoming event. SAE is owner-only, and its last event ends Oct 1.

The contract allows a skip, so it's not a failure. But nobody wrote down to expect it, and someone reading the record might roll back thinking the apply failed. Migration A's header had a pre-check warning for exactly this; B's doesn't. Creating an upcoming event in hidden Finance Club before the apply would let the self-test run on real accounts (after F01's fix).

- Evidence: - Migration :1313-1352 (the fixture query); :191-201 (CHECK AFTER APPLYING 1 lists 'skipped (and why)'); :1271 ('never a stop'); :129-150 (no pre-check like A's).
- Migration A's header :137-141 warned about this.
- Production (read-only) fixture count: 0.
  - SAE: 0 members below admin; its upcoming event ends 2026-10-01 00:00Z.
  - Kelley Floor: 0 events. Finance: last event ended Sep 10.
- A's production record: 'behaviour check passed' (2026-09-30 00:10 UTC).
- Contract 3.8 (:550, :554, :563).
- Fix: Add to the S71 plan: 'the production record will say probe: skipped. That is expected; the local run plus chat-v2-cards-check.sql are the proof.'

- Optional: create an upcoming event in Finance Club (f7ae4129...) before the apply.
- Make the first phone test cover a poll, a vote, a sign-up and an Event card.
- Source: schema-truth-3, prod-readiness-2

**F53. Back from a chat opened by a notification or the club page leaves Messages instead of showing the list** (mac-window-1)

With the flag on, say you open a DM or room from a notification, the club page, or a Your-week card on another page. Back returns you to the page you came from, not the Messages list. That covers the Back arrow, 'Back to Messages', Android back and the iOS swipe.

The contract chose this, but its reason ('as the old list does today') is wrong: with the flag off, Back shows the Messages list. The label 'Back to Messages' also doesn't match where the button goes.

- Evidence: - src/components/mobile/MessagesMobile.tsx:222-227 (closeLayer calls history.back()), :296-300 and :313-316 (noBackRef), :778-781 (the old list closes in place).
- NativeBridge.tsx:48-55 and :98-103 (location.assign).
- club/ClubSpace.tsx:472; ConversationView.tsx:615-618.
- Contract :184 (2.3) and :1417 (17.5 #19). S1-notes.md:97-99.
- Fix: Franky's call:
- Keep web-style Back and relabel the button.
- Or put the home underneath a deep link (replaceState the home, then pushState the layer), so Back goes layer, then home, then out.

Update 17.5 #19 either way.
- Source: gap-store-app-shell-and-push-paths-3

**F54. A mod who tries to remove a reported message learns that someone reported it** (before-oct-26)

If a mod tries to remove a message that someone has reported, they're told 'This message has an open report.' Reports are otherwise invisible to students, so in a five-person club the mod can guess who reported and tell the author.

The contract pins this exact sentence, but nobody weighed what it discloses.

- Evidence: - The remove route, :159-171.
- src/lib/chat/types.ts:135.
- Contract :124 (1.3).
- wave-1-contracts-critique.md:115.
- The reporter only ever gets {ok:true}, and the reported side is never told (contract 8.4).
- Fix: Franky's call:
- Keep 409 report_open with a neutral sentence, such as 'You can't remove this message right now.' (update room-rules.test.ts:283 and remove-route.test.ts:378).
- Or accept the disclosure in writing in 6.1 or 14.x.
- Source: route-security-4

**F55. If the session ends while a club is open, the screen goes stale silently and keeps retrying** (after-launch)

Say a student's session ends while a club is open, for example because they sign out on their laptop (sign-out is global). The room keeps showing old messages with no notice. It keeps sending about 15 failed requests a minute until they leave it. Their first sign is a send failing with 'You've been signed out.'

Staying quiet on refresh failures is the contract's rule, but a signed-out answer was never treated as final the way 'no access' is.

- Evidence: - src/lib/chat/use-room-poll.ts:168-171: only 403 and 404 stop polling. Failed reads are dropped at :222-225 and :256-260; the interval runs at :306-318.
- ClubSpace.tsx:206-227; MessagesHome.tsx:135-145.
- messages/route.ts:94-98 answers 401.
- logout/route.ts:30-33 (global sign-out). proxy.ts:242.
- Contract 11.0; LoadFailed.tsx:12-13.
- Fix: Treat 401 as final in useRoomPoll and in the space and home reads: stop polling and show the sign-in line once. Add that exception to 11.0.
- Source: screens-dataflow-10

**F56. Three more Terms v3 wording fixes: deletes that take other people's chat, club history open to later members, and a suspended person's messages** (now-unrelated-to-merge)

The product works as decided here, but Terms v2 says otherwise in three places:
1. Deleting an account, post, event or poll also deletes other people's replies under it, their messages in event chats you created, and their votes. v2 says replies to you 'are theirs' and stay. For comments, this predates wave 2.
2. You're in a club's Board and Lounge for as long as you're a member. Their whole history is open to current and future members, and any member can see when you last read a room.
3. When an account is suspended, its old chat messages stay visible without the name. The pages only promise that the profile, posts and comments are hidden.

- Evidence: 1. Deletes:
- Foreign keys events_creator_id, channels_event_id, messages_channel_id and messages_thread_root_id are ON DELETE CASCADE, locally and on production.
- Probe v08.sql: deleting avery removed 5 other people's messages. Accepted in wave-1-contracts.md:613.
- 02-terms-of-service-v2.md:104 and :246; 11-defender-round1.md:1737.

2. History:
- channel_members_delete_own_pending excludes club rooms.
- Probe v11.sql: blake reads other members' last_read_at. wave-plan.md:13.
- 02-terms-of-service-v2.md:106 and :163.

3. Suspended accounts:
- messages_select_org_member has no user_visible check.
- Probe v13.sql: suspended casey's 3 Lounge and 3 Board messages are still visible.
- community/page.tsx:171-177; account/suspended/page.tsx:320 and :339; v2 :197.
- Fix: In v3 §7/§9/§12/§14 and the Guidelines, say:
- what else goes when something is deleted;
- that Board and Lounge history is open to current and future members, and room members can see when you last read;
- that messages already sent stay visible, without the name, while an account is restricted.

The code changes (events.creator_id SET NULL, settings-columns privacy) are already on the after-launch list.
- Source: legal-vs-wave2-08, legal-vs-wave2-11, legal-vs-wave2-13

### Already known (cloud notes / contract 17): medium

**F57. Nobody has measured how much database traffic the new chat makes** (before-oct-26)

Each phone in a room checks for new messages every 4 seconds. Reading the code, one check in an event chat whose newest message is a card makes about 18-20 database calls; the contract says 9-13. The difference is that the card is re-loaded on every check. Desktop tabs that check every 2 seconds also re-load cards, adding up to 10 calls.

Per user that's roughly 60 (home) to 270 (inside a room) calls a minute, on top of about 64 an idle signed-in app already makes.

- The contract accepted the cost for now ('clubs are tiny', 14.23).
- At 200 students at once, the small free-plan instance could saturate and every screen would slow.
- If the sign-in server times out, people opening a page are sent to the login page, though not signed out.
- No load test has been run.

Also still open from wave 1, and not in the handoff: '# lounge' titles in Campus › Chat for everyone with the flag off (C6); room_locked doubling as the reserved-name refusal (C4); a demoted officer keeping the Officers room (C7).

- Evidence: - src/lib/chat/use-room-poll.ts:51-52, :286, :317.
- src/lib/chat/message-read.ts:857: the >= cursor re-sends the last row, and its card, on every check. hydrate.ts:221-264.
- messages/route.ts:92-96 and :133. middleware.ts:36-40. proxy.ts:229-234, :292, :301-306, :327-329. campus-access.ts:22-25.
- Timers: MessagesHome.tsx:42-43; ClubSpace.tsx:79.
- Desktop 2-second pollers: messages.html:1791, :2372, :2576; _miniMessenger.js:306 and :624; campus-home.tsx:16092 and :16108. CampusMobile.tsx:2510 ('# lounge').
- Contract 9.3 (:851) and 14.23 (:1109).
- Production: Free plan; max_connections 60; 9 PostgREST connections; peak 3,844 edge requests in an hour, from one user.
- Fix: In window 1: count PostgREST calls and time one ?after= check in an event chat holding a poll and an Event card (from the local API logs). Record the result in row 9 and in B's COST notes.

Then, before Oct 26:
- Skip room details, roles and the cursor row's card on quick checks (14.23's ?brief=1).
- Make one sign-in check per request (getClaims in the proxy for /api).
- Stop the home polling under a layer (F34).
- Treat a sign-in server error as 'unknown', not 'signed out'.
- Load-test 200 users on a Supabase branch before choosing the plan (F17).

List C4, C6 and C7 in the handoff under 'still open'.
- Source: gap-real-data-shapes-and-load-7, cloud-notes-9, flag-off-surface-2

**F58. One busy group chat can make your other DMs look empty and hide a message request** (before-oct-26)

All DMs and groups share one batch of 5 lines each. So one busy group chat can make your other DMs look empty ('No messages yet', no unread mark) and make a new message request disappear. The app-icon count uses the same batch.

The new home reads this list every 30 seconds, so it shows on the new screens too. This predates wave 2 and is written in the wave-1 notes, but it isn't scheduled.

- Evidence: - src/app/api/me/threads/route.ts:646-667: one shared window.
- :688-692; :745-757: the request is dropped when its last line is missing; :766-769.
- src/lib/push/badge.ts:106-129 uses the same window.
- Local rolled-back run (v_run4a.sql): 12 chats with a limit of 60. The busy group took all 60 rows; every DM and the request got 0.
- Known in wave-1-asis.md:1397.
- Fix: Use F15's per-room function (limit 1 is enough) for both the thread list and loadBadgeCounts. As a stopgap, read pending requests (accepted_at null) with their own per-room query.
- Source: gap-real-data-shapes-and-load-2

**F59. With the new chat on, text Board posts and replies can't be reported, while the live pages say any message can** (before-oct-26)

With the new chat on, a text Board post and the replies under it have no menu. So they can't be reported or removed from the phone, while the live Guidelines and Support page say you can report any message from its ⋯ menu.

This is already planned (17.2 L3) to land before the flag goes on for everyone. See F36 for the review-account angle.

- Evidence: - src/components/mobile/messages/club/BoardPost.tsx:213-225: only CardBubble gets Report and Remove.
- src/app/legal/community/page.tsx:124-133; src/app/support/page.tsx:56-60.
- Contract :1349 (17.2 L3) and :1432 (17.5 #30). Handoff :15.
- Fix: Build L3 before CHAT_V2_ALLOWLIST=*. If it lands, no page change is needed.
- Source: legal-vs-wave2-12

### Already known (cloud notes / contract 17): low

**F60. The font change costs no download but also changes the sign-in wordmark, and '213 sites' is really 161** (before-merge)

Row 10's font change costs no extra download: 0 new font files. It does change the 'Vibe' wordmark on login, signup and the other sign-in pages from weight 900 to 800. That's the first thing a new student and Apple's reviewer see.

The '213 sites' count doesn't reproduce. The real number is 161 inline sites plus the sign-in wordmark rule.

- Evidence: - src/app/layout.tsx:96.
- src/app/globals.css:1332: .vibe-auth-brand uses Fraunces 800.
- `git grep 'fontWeight: *800' 5c68da1 -- src` = 161.
- Google Fonts CSS grows from 10,117 to 12,411 bytes, with the same 8 woff2 files.
- integration-flag-off.md:49; contract 17.3 row 10; 17.5 items 2 and 27.
- Fix: When Franky makes the row-10 call, tell him it's visual only.
- Add /auth/login to 17.5 item 27's before/after check.
- Correct '213' to '161 inline sites + the sign-in wordmark'.
- Source: flag-off-surface-6

**F61. The handoff puts only 6 of 46 open decisions in front of Franky; three others change what people see** (mac-window-1)

The handoff's 'worth a look before the apply' list names 6 of the 46 open decisions. Some of the others change what people see:
- Block doesn't hide anyone inside group chats (14.42). That's unchanged from today, and Apple tests Block.
- The Officers room never shows unread (14.36).
- Text bubbles keep the old colours instead of the approved mockups (14.24).

All of these are in section 14 with defaults, and the handoff points there.

- Evidence: - Handoff :63.
- Contract :1099-1132 (section 14), including 14.42, 14.36, 14.30, 14.24, 14.37, 14.39, 14.13, 14.26 and 14.38.
- wave-0-decisions.md:13 and :17.
- Local: can_view_org_channel keeps named Officers-room access after a demotion.
- Fix: Add a second line to the handoff's list for Franky: 14.42, 14.36 and 14.24 (plus 14.30, 14.37, 14.39 and 14.13), one sentence each with its default.
- Source: cloud-notes-8

**F62. The HTTP pass should expect 403, not 404, when a mod removes a message in the Officers room** (mac-window-1)

On the Mac HTTP pass, a mod removing a message in the Officers room gets 403 'Not a member', while the contract's 6.1 step 7 says 404. The cloud's own review recorded that 403 is correct, but only in the B3 notes, which the handoff doesn't tell session 71 to read. The tester may file a false bug.

- Evidence: - Contract :710 (6.1 step 7) and :1401 (17.5 #7).
- B3-review-security.md:56-72; B3-notes.md:29; B3-repair.md:13.
- Local probe: casey sees 0 channel rows for the Officers room, and can_view is false.
- The remove route answers 403 at :102-104.
- Fix: Add 'mod + Officers room → 403 Not a member' to 17.5 #7, and fix 6.1 step 7's wording.
- Source: cloud-notes-12

**F63. An officer-removed message still looks normal to its author on desktop and the old list, and the old list's preview was never decided** (before-oct-26)

When an officer removes a member's Lounge message from the phone, the author still sees it as a normal message, with no notice, on:
- desktop /messages, the mini messenger and Campus › Chat;
- before Oct 26 with the flag off, the old phone list, which also previews it as their club's latest message.

Nobody else sees it. The old screens were left alone on purpose, but the old list's preview was flagged in review (B4-BEHAVIOUR-3) and never decided. If desktop's unused removed-notice is ever wired up, it would show the Vibe-moderator wording and help email, which is wrong for an officer removal.

- Evidence: - src/app/api/me/threads/route.ts:661-679 has no removed_at filter. The new inbox has it (inbox/route.ts:166, :213, :252; commit e4505c7).
- Local rolled-back probe (v7.sql): blake's removed row comes back first in his own list.
- Production: 0 of 58 messages removed.
- message-read.ts:548-556 and :594.
- public/html/messages.html:1402-1415 and :2472 read m.removed_at, which the API never sends.
- MessageBubble.tsx:605-606.
- B4-review-behaviour.md:57; integration-old-renderers.md:39-41 and :53-54; contract 6.2 and 12.3.
- Fix: Before the Oct 15 freeze, either:
- get Franky's yes to a one-line flag-off row (.is('removed_at', null) on the old list's club-room window only);
- or write a 17.2 line accepting it.

If messages.html is ever wired up, branch on removed.by === 'officer'.
- Source: flag-off-surface-7

**F64. After closing an event chat opened from a week card, the address still points at the event, so a reload reopens it** (before-oct-26)

Open tonight's event chat from a Your-week card, then tap Back to the Lounge. The address still points at the event chat. A browser reload, or a copied link, reopens the event chat instead of the Lounge.

Tapping a room chip corrects it. This was noted in S1 as a request to S2, then dropped.

- Evidence: - src/components/mobile/MessagesMobile.tsx:197-209, :229-237, :294-330 and :334-338.
- club/ClubSpace.tsx:113-121, :258-260, :261-282 and :293-311: only the Board-strip path rewrites the URL.
- S1-review-behaviour.md:117-128; S1-repair.md:22; S1-notes.md:270.
- Fix: When the event layer closes (Back at depth < 2, or closeEvent), and once the space read has answered, call replaceRoomHistory(pickedRoomId ?? the Lounge id). Add this to 17.5 #19.
- Source: cloud-notes-6

**F65. 'Open event chat' on an Event card inside an event chat does nothing** (before-oct-26)

An Event card shared inside an event chat, for another event or for the same one, shows an 'Open event chat' button that does nothing. Every officer sees it, and so does any member going to both events.

A review raised it and it was ratified with no change, even though 11.8 says the button opens the chat.

- Evidence: - club/EventChat.tsx:163: onOpenEventChat={() => undefined}.
- It is passed through RoomThread.tsx:340 and CardBubble.tsx:256, and drawn at EventCardView.tsx:168-178.
- CardTray.tsx:39-40; migration :718-755; event-refs.ts:210-223.
- Contract :964, :988 and :1343.
- S2-review-contract.md:83-89; S2-repair.md:22; integration-adjudicate.md:61.
- Fix: Pass an onOpenEventChat from ClubSpace that swaps eventRoomId and calls history.replaceState({vibeChat: id, depth: 2}). Or hide the button inside an event chat.
- Source: cloud-notes-13

**F66. Deleting your own message from an out-of-date desktop tab now says 'You can't remove this message.'** (after-launch)

On desktop, try deleting your own DM message from a second, out-of-date tab, after it was already deleted. You now get 'You can't remove this message.' instead of 'That's no longer available.'

The contract changed that answer knowingly, but thought no screen shows it; desktop /messages does. It's a rare copy issue.

- Evidence: - messages/[messageId]/route.ts:101-106 and :123.
- remove-route.test.ts:262 and :266.
- public/html/messages.html:3289-3296.
- _persistence.js:271.
- Contract 6.1 step 3 (:706) and 17.3 row 4.
- Fix: Answer 404 not_found when the message is gone and the room is a DM or group (a member sees every row there). Or amend row 4 to mention this case.
- Source: flag-off-surface-4

**F67. Opening Messages on the phone waits for one extra check first** (after-launch)

Opening Messages on the phone now waits for one extra 'is the new chat on for me?' request before the old list starts loading. That's about 150-250 ms, more on cellular, on every open.

This is sanctioned and written as the 17.3 footnote. The check fails safe (any error shows today's list), and a plain Campus page doesn't wait.

- Evidence: - src/lib/chat/use-chat-v2.ts:34.
- MessagesMobile.tsx:68-71; CampusMobile.tsx:296.
- middleware.ts:38.
- Production /api/me/features responded in 136-255 ms (anonymous).
- Contract 17.3 footnote; INT-FLAG-OFF-3.
- Fix: Nothing required. If it bothers Franky after Oct 26: run the check once per page load in MobileShell, or cache the last answer per tab and re-check in the background.
- Source: flag-off-surface-5

**F68. Polls and sign-ups share the 60-a-minute text limit** (after-launch)

Posting polls and sign-ups shares the 60-a-minute text limit. So a member could post 60 full-size cards a minute into their own club (not into other clubs), and each card writes up to about 12 rows.

The contract chose the shared limit. A separate, lower card limit is reasonable hardening later.

- Evidence: - cards/route.ts:76: rateLimit('message-send:<uid>', 60 per 60 s).
- rate-limit.ts:28-48: lets requests through if the limiter itself errors.
- Contract :599 (4.1 step 3); integration-security.md, 'Rate-limit keys'.
- chat_create_poll re-checks that the poster can post in that room.
- Fix: After launch, add rateLimit('card-create:<uid>', { limit: 10, windowSec: 600 }) in front of the shared limit.
- Source: route-security-5

**F69. In Light mode, the unread pill on a person's row is slightly too faint** (after-launch)

In Light mode, the plain coral unread pill on a person or group row is just under the contrast rule for marks: 2.88:1 against 3:1. Unread rows are still easy to spot, because their preview turns bold and dark.

The cloud measured and accepted this, but never moved it into section 17.

- Evidence: - home/PersonRow.tsx:110-111 (bold preview) and :121-136 (pill).
- S1-contrast.md:69 and :93-99; S1-notes.md:163-164; S1-review-design.md:136 and :139.
- Contract :1308 (17.1 row 5).
- Fix: Optional: draw the pill in t.coralMark (#B5381A, 5.54:1) in Light mode.
- Source: cloud-notes-14

**F70. Two old migration files never applied on production sort before B, and the local migration list is 20 behind** (now-unrelated-to-merge)

Two older migration files, for Stripe billing and for push, were never applied to production, and they sort before B. The local database's migration list is also 20 files behind.

This is harmless as long as B is applied with the documented recipe: the Management API plus the schema_migrations row, and psql locally. Using the Supabase CLI instead would either stop, or with --include-all push the billing and push tables to production.

- Evidence: - Production list_migrations: 95 rows, the last 20261001100000.
- Not applied: 20260922150000_billing_stripe, 20260924120000_push_notifications and 20261001110000_chat_v2_cards.
- Local schema_migrations: 77 rows, ending at 20260926100000.
- No .github workflows and no Supabase branches.
- S70 handoff :76; S69 wave-0 handoff :41.
- Fix: No change is needed for the merge. Never apply B with `supabase db push`. When push or billing go live, renumber them after 20261001110000.
- Source: gates-hygiene-05

### Not chat: still open: medium

**F71. Deleting an account erases the photos and videos that person sent in DMs, even when a report about them is open** (now-unrelated-to-merge)

Deleting an account erases the photos and videos that person sent in DMs, even when a report about them is open or a moderator already removed them. The live delete-account page promises such media is kept privately for up to a year, and the child-safety page promises records are kept.

Someone who sent an intimate image and got reported could delete their account before an admin looks, and the file would be gone. It's latent today (0 reports, 3 DMs with media), predates wave 2, and is unrelated to the merge.

- Evidence: - src/lib/profile/storage-purge.ts:198-215: listUserMessageMediaKeys has no removed or report filter. :280-330: loadEvidence covers only posts and profile images. :344-380, deletion at :371.
- src/app/api/me/route.ts:109-153.
- src/app/api/admin/content/remove/route.ts:195-198 quarantines post media only.
- src/app/legal/delete-account/page.tsx:193-204; src/app/legal/child-safety/page.tsx:125-128.
- Production (read-only): messages with media are 2 of 37 in DMs, 1 of 6 in groups, 0 of 15 in clubs. 0 reports.
- 12-results.md:48 (H21 relies on the report snapshot, whose file is still deleted).
- Fix: - In purgeUserUploads, keep (quarantine) media on messages that are removed or have an open or actioned report.
- Have admin Remove quarantine message media, as it does for posts.
- Until then, soften both pages.
- Add a line to the Terms review's H21.
- Source: gap-moderation-admin-and-side-surfaces-6

### Not chat: still open: low

**F72. Both store apps are locked to Light, so 'Auto' never shows Night inside the app** (now-unrelated-to-merge)

Both store apps are locked to Light mode, so 'Auto' never shows Night inside the app. That includes the new chat screens, which were designed Night-first.

The lock predates Night mode (Sept 24 vs Sept 29), and the comments in both native files are out of date. Picking Night by hand works on the page. Changing the lock needs new app builds.

- Evidence: - mobile/ios/App/App/Info.plist:90-93: UIUserInterfaceStyle Light.
- mobile/android/app/src/main/res/values/styles.xml: parent Theme.AppCompat.Light.NoActionBar. variables.gradle:4: targetSdk 36.
- theme.ts:25, :56 and :105: 'system' follows prefers-color-scheme.
- The lock arrived in commit 9ba375e (Sept 24; critic-s2s3.md:198) and Night mode in 73ba67d (Sept 29).
- NativeBridge.tsx:205-212.
- Fix: Decide once before the store builds:
- drop UIUserInterfaceStyle and use a DayNight parent on Android (new binaries; fits the Oct 9 Android build);
- or keep Light and write it into the night-mode rules.

For the Mac walk in the apps, set Night by hand.
- Source: gap-store-app-shell-and-push-paths-8

### Checked and fine

- Gates re-run on the Mac at da22efa: typecheck clean. Tests 1,639/1,639 in 115 files, the same as the cloud (main has 1,374 in 94). They pass in UTC, Los Angeles, Kolkata and Indianapolis time and in the German and Japanese locales; the 3 Kiritimati failures also fail on main. eslint: 7 errors and 8 warnings in src, all pre-existing. next build exits 0 with 122 pages. split-check matches 17.6 (0 missing, 0 duplicate, 5 changed, 20 added). validate-thread 18/18.
- Migration B's PRE-CHECK 1-5 and PRE-FLIGHT a-i pass on both local and production (read-only). The 3 function fingerprints match, both INSERT policy texts are byte-equal (433 and 741 chars), the SELECT policy md5 is identical (76a5397b, 220 chars), and the trigger sets are exact (0/2/5/2/1/1). Production size guards: 20 of 60 rooms, 5 of 40 clubs. Postgres 17.6 on both. Constants pasted from the local rehearsal will not make production refuse.
- Rehearsal 1 ran locally, with a 999,257-byte pg_dump taken first. It stopped exactly where designed ('constants are empty' after printing all 27 constants). The rollback left 0 tables, 0 functions and 0 triggers.
- With the F01 boolean fix, a full local run in one rolled-back transaction passed: step 8 with 52 probe results and the check 164/164. B took 72 ms and never took an exclusive lock on a live table during the apply, so reads kept working.
- 26 of the branch's new or changed database reads answered 200/206 on local PostgREST v14.5. Every column, foreign-key hint and enum value they use exists on both databases, and the 4 RPC calls match the real argument names and order.
- The flag fails closed: any error, non-200 or odd body shows today's screens, a Vercel Preview can never turn it on, and the 4 new routes check the flag before anything else. Code deployed before B is safe, because missing-table and missing-function answers (PGRST205/202) are treated as 'not there yet'.
- All 4 old renderers (desktop /messages, mini messenger, Campus › Chat, old phone thread) handle the new 503 answer and the block stubs without crashing.
- Card security: all 4 RPCs check the caller's role first and re-check room rights themselves, and the 4 new tables have RLS on, no policy and no client grants. Cross-club, Officers-room-as-mod, ex-member, follower, DM and closed-chat attempts all refuse. Card text goes through the word filter. Anonymous polls name nobody, the poster included.
- Lifecycle checks, all rolled back locally with 0 errors: deleting a voter, a poll author, an event creator, a remover, an event with cards, or a whole club cascades cleanly. Leaving frees Lounge, Board and event-chat spots. Close times store correctly across the Nov 1 2026 clock change.
- The new reply-count RPC equals the old count over 20,007 replies (1,556 removed, 1 in 10 blocked) in 8.4 ms, including a batch the old walk gave up on (9,995 replies).
- Secrets and privacy scan of 275 added or changed files: no production keys, tokens or founder emails. Nothing under handoffs/ is deployed (.vercelignore) or imported by the app.
- The font change adds 0 font downloads (the same 8 files; the CSS grows from 10,117 to 12,411 bytes).
- Everything the cloud did was read: the S70 handoff, the S69 close, the whole 1,437-line contract, all six integration files, and every repair table. Every STOPPED, DEFERRED or REJECTED item in the 11 repair files was traced to A1-A42 and section 17; all carry over except the 6 now listed as findings (F43, F62, F64, F69 and parts of F09, F31). 11 of 12 rejections hold (the exception is F65).
- Production today (read-only): 58 messages, 0 removed, 0 reports, 0 blocks, 0 card rows, 20 users, 5 clubs, 42 room memberships. The wave-1 after-deploy check shows 0 findings across 5 clubs and 20 rooms. None of the privacy findings has exposed anything yet.
- Phone basics hold: week and day labels are safe across the Nov 1 clock change, and Next 16.3.4's history patch means Back never reloads the page. In the iPhone app, vaul's scroll lock never engages, safe areas are right and inputs are 16px (no zoom).
- Wave 2 leaves these untouched (empty diff): the admin desk, moderation, push, profile storage, Otto, notifications and the events route. Search reads no messages. Push and the badge still skip club rooms and removed rows.
- Wave-1 carry-overs C2, C3 and C5 are closed.

### Not checked

- Migration B hasn't been applied anywhere, so no real RPC call went through PostgREST. Not seen: the HTTP codes for P0C2x, and the role guard under a real service-role vs student token.
- Real concurrency: the two-phone race for the last sign-up spot, and a vote racing a leave. By reading the code, a vote in flight can survive a leave.
- No signed-in HTTP pass and no browser walk on local next dev. The Back/history findings (F06, F07, F53, F64) are proven by code plus a minimal Next 16.3.4 copy and still need the Mac walk.
- No real device. The keyboard in the store apps, push taps from a killed/background/open app, the iOS edge swipe, Android back depth and Dark Mode in the apps are all unchecked. Suggested order: keyboard in the Lounge, event chat, DM and Campus › Chat; sheets with the keyboard; Reply on the smallest phone; mention and DM push taps; Android back ×4; iOS swipe, cancelled and completed; Back while posting; theme; long-press on a week card.
- No load test. The capacity numbers in F57 and F17 are counted calls and single-query timings, not measured under load. Also unknown: whether Supabase meters data before or after compression, which moves F17 by 5-10x.
- Vercel: the plan, the env vars (whether any CHAT_V2_* is already set), and whether the branch Preview is password-protected. That Preview runs flag-off wave-2 code, including the officer remove route, against the production database. The connector was refused (403).
- How the Management API runs the request (timeouts, protocol, body size), the lock window on production at a quiet hour, and production query plans (the read-only user can't act as a student).
- Whether James passes can_publish_now and has_recorded_consent as a self-test fixture on production.
- The visual PNGs weren't opened. Also unchecked: the nested drawer scroll lock on real iOS Safari, and whether a long-press on a text bubble opens the picker on a real phone.
- The admin desk was read, not clicked. Not checked: what happens to report snapshots when Vibe hides or deletes a club.
- sql-parse.mjs wasn't run (it needs libpg-query). Contract 16.1's 92-row ledger wasn't re-verified row by row. The F20 lazy-load fix was only built, not tested.
- Legal points weren't checked with a lawyer (for example the evidence-keeping duty in F71). App Store privacy labels aren't in the repo.

### Facts the Mac session needs

- Git: main and origin/main = d48ade0, which is 4 docs-only commits (f32420d, 2a73992, d37a605, d48ade0; 8 files, all under handoffs/legal-2026-09-29/) on top of 5c68da1. Branch claude/relaxed-davinci-9d11h3 head = da22efa (93 commits), merge-base 5c68da1. `git merge-tree --write-tree` is clean (tree 08b4963); `git merge origin/main` on the branch and a rebase are both conflict-free. After either one, step 7's `--ff-only` works.
- Migration B md5 at the branch head: 0154a6f10c3988d4202d932472773c77. This is the pre-constants, parse-time value; never hand it to the production apply. The check script md5 is 57b81753.... Rebasing doesn't change the file's bytes.
- F01 fix sites: migration :1415, and chat-v2-cards-check.sql :352, :357-358, :373, :415 and :803-809. After the fix, step 8 prints 'behaviour check passed', the check prints 'all 164 cases passed', and the 27 constants from rehearsal 1 (rehearsal1.out) stay valid.
- psql isn't installed on the Mac. Working local apply: `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select set_config('chat_cards.file_md5','<md5>',false)" -f - < supabase/migrations/20261001110000_chat_v2_cards.sql`. Tested: -c and stdin run in one session.
- The local seed fixture 'Chat Seed Game Night' ends 2026-10-05 01:00 UTC. Run `node scripts/local-seed.mjs` on the same UTC day, before rehearsal 2 and after the F01 fix.
- For the production apply, the Mac has jq and md5sum, SUPABASE_ACCESS_TOKEN is in .env.local, and supabase/.temp/project-ref = rqopjkimxbjkwdkpkbfq. Build the body from the pushed file: `git show origin/claude/relaxed-davinci-9d11h3:supabase/migrations/20261001110000_chat_v2_cards.sql > b.sql`, take its md5, prepend the set_config line, then `jq --rawfile`. A's ~103 KB body went through this way; B is ~105 KB.
- Production PRE-CHECK answers today, all passing: chat_polls null; fingerprints 747ee06d2e4c3e8a788129f7530ec0ae / 8d8be860d3f7077b9d6f9238705bdca7 / 0e7baa973042be8ca0decb7df1ca6407; 0 non-text messages; 0 card_event_id; no channel_members trigger; 'PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0'.
- Expect 'probe: skipped' in the production APPLY RECORD unless an upcoming event exists in a club that has a plain member (F52).
- Flag env values: CHAT_V2_ALLOWLIST = df5ab44e-174f-4c53-a8bc-261c1c67e10b (Franky), 5ecad222-7b3d-4049-9175-0b6096e38012 (James), e3afb560-217e-4448-9a13-f10756a740ef (Rylan); all three are platform admins. CHAT_V2_CLUBS = 923896fb-c21e-4727-a164-037ba4e3d606 (SAE, handle 'sae', invite-only, owner-only today). The code reads env on every request, but Vercel binds env to each deployment, so a redeploy is needed. Setting the vars before the step-7 push lets the merge build carry them.
- Real-data test clubs on production: Finance Club f7ae4129-3228-4f8e-9022-c93874a42369 (handle test-f7ae4129; Franky owner, James member; last event ended Sep 10) and Kelley Floor test-6ca4ec6e (Rylan owner, Franky member; no events). No production event ends after 2026-10-01 00:00 UTC, so create one before the phone test.
- Production scale: Free plan (org bjbutegxvbusnmgeiaqa), max_connections 60, PostgREST 14.5 with 9 connections, statement_timeout 8 s for authenticated. 20 club rooms (guard 60), 5 clubs (guard 40). 95 migrations applied, the last 20261001100000. billing_stripe and push_notifications are not applied, so never use `supabase db push`.
- Local stack: Supabase's gateway owns port 54321. next dev uses .env.development.local (127.0.0.1:54321) over .env.local (production). For the screenshot harness, use FAKE_PORT=54399 and NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399.
- Local test people: avery_owner (owner), emery_admin (admin), casey_purdue (mod, be3e2af2...) and blake_iu (member; blake blocks casey). Rooms: the chat_seed_club Lounge, Officers room 00d7087f..., and the closed event 'Chat Seed Closed Night'.
- Vercel: the Preview of da22efa is READY at https://vibe-aoz2ciyq3-fracazar-1988s-projects.vercel.app, and production runs d48ade0. The Vercel connector answers 403 for scope fracazar-1988s-projects; use the dashboard or gh for env and plan.
- Audit working files are in /private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/audit2/: rehearsal1.out, b-full.sql/.out (the patched full run), vcdb/, the merge simulations (vmerge, mergesim), nextrepro (the history repro), the run*.sql load fixtures, and per-lens notes (*.md). audit2/bld holds about 200 MB of build copies and can be deleted.
- Session numbering: the Mac Terms review and the cloud both called themselves session 70. The next session is 71 for both threads.
- Terms v3 is due around Oct 14, and 12-results.md is waiting on Franky. F11, F40, F41, F42 and F56 are inputs for v3, and F04 is a decision that needs making before the Oct 16 submission.