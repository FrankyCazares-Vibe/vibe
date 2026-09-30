# Session 63 — A test copy of Vibe, a crash hole closed, and the privacy lock

**Dates:** 2026-09-21 → 2026-09-22 · **Continues:** session 62 (launch planning, the roadmap artifact) · **HEAD at close:** `8786180` (deployed)

Read this file first. It replaces the running log in `2026-09-15-session-60-email-verification.md` §6e–§6f for everything after Sept 21.

---

## §1 — What happened, in plain English (the version to tell Rylan and James)

1. **We built a private practice copy of Vibe on Franky's Mac.** Until now, the only way to check that a button actually works (follow a club, send an invite, edit a post) was to press it on the real site with real accounts — so most of those checks were skipped. The practice copy has its own database, fake test students and fake clubs, and it cannot reach the real site, real email, or real photos. Every change this session was pressed and checked there before it went live.
2. **The practice copy found a way anyone could knock Vibe offline.** On the version of the database our provider (Supabase) runs, one specific kind of request — sendable by anyone, using a key that is public by design — made the database crash and drop every connection. Eleven of our functions were open to it. Nobody had triggered it. **Fixed on the live site the same day.** It is a bug in Supabase's own software; we worked around it and made a rule so we never reopen it.
3. **"Who liked what" was readable by anyone signed in.** Six tables — likes, comment likes, reposts, follows, events and RSVPs — could be downloaded in full by any signed-in student who knew how, bypassing the app. That broke our promise that *counts are public, identities are private* (and the paid tier sells "who viewed you"). Every screen was moved to ask the database for **numbers only**, then the tables were locked. The screens look exactly the same; the numbers match the database exactly.
4. **Spam and impersonation tricks were closed.** Anyone could send fake "so-and-so mentioned you" notifications to anyone, flood likes (each one pinging the author), ask the database "has A blocked B?" about any two people, and a direct message went through if the block check failed. All closed.
5. **Club pages got the phone navigation bar.** That page is where all club outreach sends people; before, the only way out was the back button.
6. **Email and passwords.** Every verification email we try to send is now recorded (without storing the address), so "I never got my code" — Sebastian's problem — has an answer. Passwords can be up to 72 characters instead of 20, so password managers work.
7. **Profiles.** The professional snapshot is gone (Franky's call: it doesn't fit a student app). "What are you here for?" has its own row, visible only to its owner for now. And a quiet bug is fixed: the desktop profile used to re-save itself every time it opened, which is how junk like "Biology · Year 2" and copies of people's bios ended up written into their profiles.

**One line for the team:** *"We built a safe practice copy of the app, used it to find and close a hole that could knock the site offline, locked down who-liked-what data so only counts are visible, shut the spam and impersonation tricks, and cleaned up profiles — nothing looks different to students."*

---

## §2 — What shipped (all deployed; Vercel success)

| Commit | What |
|---|---|
| `a39df14` | Two old migrations guarded so the whole history rebuilds a fresh database (they assumed things only production had). |
| `1b5b351` | `scripts/local-seed.mjs` — test accounts, clubs, posts, events for the local stack. |
| `a7dc1b8` | **Migration `20260922090000_guard_function_privileges.sql`** — the database-crash fix (see §4). |
| `c5eb7bb` | Count/visibility functions + the table-lock migration + `src/lib/posts/engagement-counts.ts`, `src/lib/safety/pair-block.ts`. |
| `3fe65c4` | Phone tab bar on `/orgs/[handle]` and `/plus` (signed-in viewers only). |
| `5386b72` | `email_sends` log + louder failure line on the school-email screen + 72-char passwords + `scripts/email-send-lookup.mjs`. |
| `a15de44` | Feed, post, comments, creator stats, Reposts tab → counts via RPC; hidden-club posts invisible to non-members everywhere. |
| `2f7eda7` | Follower/following/connections/mutuals lists + profile counts → server reads; blocked pairs dropped; 120 list loads/min/viewer. |
| `dd7d008` | Map, map zone, suggestions, events → count RPCs. |
| `cdb62fe` | Server-written mentions; likes through routes only (120/10 min, Terms gate, one notification per liker per post, 404 across blocks/hidden clubs); DM send fails closed; hidden-club media/asset 404. |
| `e3587a9` | Profile routes: snapshot out, `lookingFor` owner-only, one service-role write path with limits (me-profile 60/600, profile-sync 300/600, pinned 60/600 + Terms). |
| `8786180` | Desktop + phone profile: snapshot card and RECRUITER VIEW gone, owner-only "Here for" row, **no save on load**. |

---

## §3 — Production database changes (each with Franky's explicit yes, 2026-09-22)

Applied through the management API, each recorded in `supabase_migrations.schema_migrations`, each with a pre-flight and post-check. Live max version: **`20260922120500`**.

| Order | Migration | Verified after |
|---|---|---|
| 1 | `20260922090000_guard_function_privileges` | 0 public functions deny EXECUTE; 7 guards present; no restart (checkpointer still from Sept 2); live GETs 200 |
| 2 | `20260922100000_t1_count_and_visibility_fns` | 7 functions exist, granted to anon/authenticated |
| 3 | `20260922104000_email_sends` | table exists, no client grants; 0 plaintext emails left in rate-limit keys |
| — | *(stage 2 code pushed and deployed between 3 and 4)* | baseline: feed 10, followers 8, following 6, reposts 2, suggestions 6, notifications 5 |
| 4 | `20260922110000_t1_close_world_readable_selects` | 0 open SELECT policies on the six tables, 0 anon SELECT; same live numbers; feed like/repost sums (8/5) = database truth |
| 5 | `20260922120000_t2_notification_writes_and_helper_grants` | all 5 function md5s matched first; students can't INSERT notifications or INSERT/DELETE likes directly |
| 6 | `20260922120500_t2b_org_helper_guards` | all 3 md5s matched first; 0 functions deny EXECUTE |

**NOT applied — waiting for Franky's yes:** `20260922130000_users_profile_detail_server_only.sql` (revokes browser UPDATE on `skills, interests, work_experience, pinned_post_id, looking_for, recruiter_snapshot` and SELECT on `recruiter_snapshot, looking_for`). Code that depends on it is already live and works with or without it. Tested 22/22 locally. Pre-flight: live max version must be `20260922120500`, the column privileges still granted, 0 long transactions.

**Vercel rollback rule:** once a batch's migration is live, never instant-roll Vercel back past that batch's code (the old code reads the tables the new policies close).

---

## §4 — The database-crash finding, and the standing rule

- **What:** on Supabase's Postgres **17.6.1.111** image (production's), calling a `public` non-trigger function the caller has **no EXECUTE** on crashes the backend (signal 11) and drops every connection. Reproduced on the local stack through REST with only the anon key. Table permission errors, ordinary errors, and a `RAISE ... ERRCODE '42501'` from *inside* a callable function do **not** crash. Trigger functions aren't reachable over REST. Likely cause: the `supautils` "hint_roles" permission-hint path (unconfirmed — can't change it per session).
- **Production:** 11 functions were exposed (e.g. `rate_limit_hit`, `is_org_member`, `is_blocked_either_way`). No sign it was ever triggered (auxiliary processes all from Sept 2; no crash lines in logs). Fixed by migration 1 above.
- **STANDING RULE (also in memory `project_security_model` and `handoffs/wave-plan-week1/rulings.md`):** never `REVOKE EXECUTE` on a public function. Grant it to anon/authenticated/service_role and refuse **inside** (return false/null, or `RAISE ... USING ERRCODE = '42501'`). Every migration's post-check runs:
  ```sql
  select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
    and format_type(p.prorettype,null) not in ('trigger','event_trigger')
    and (not has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'));
  -- must be 0
  ```
  And local tests must never call a function as a role lacking EXECUTE (it crashes the shared local DB).
- **Franky chose not to report it to Supabase for now** (2026-09-22).

---

## §5 — The local test stack (how to use it)

- **Start/stop:** Docker Desktop must be running. `supabase start` / `supabase stop`. Put Docker on PATH in scripts: `export PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"`.
- **Rebuild from scratch:** `supabase db reset` (replays every migration) then `node scripts/local-seed.mjs`.
- **Accounts** (password `vibe-local-1234`): `avery@example.test` (owns test_invite_club, test_open_club, test_hidden_club) · `blake@example.test` (IU, member of nothing, follows test_open_club, owns test_request_club) · `casey@example.test` (Purdue) · `drew@example.test` (brand-new: unverified, no campus) · `emery@example.test` (admin of test_invite_club).
- **Dev server:** Browser preview "vibe" (`npm run dev`, port 3000). `.env.development.local` (gitignored) makes it use the local stack and **blanks** Resend, R2, Sentry and the management token — verified with `@next/env`. Proof step before any write: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/users/avery_owner/bootstrap` → 200 (that handle exists only locally).
- **psql:** not installed; use `docker exec -i supabase_db_vibe psql -U postgres ...`.
- **Safety:** the local dashboard binds to 0.0.0.0 with default keys — `supabase stop` on public Wi-Fi. Local `SUPABASE_*` keys are the CLI's standard local defaults, not secrets.
- **Gotchas:** the CLI is old (2.98.2 vs 2.117.0). Two cached pins were set aside to make storage start: `supabase/.temp/storage-migration.bak`, `supabase/.temp/storage-version.bak`. The Turbopack dev cache can serve stale CSS — `.next/dev/cache/turbopack.stale-c1` (1.3 GB) was moved aside and can be deleted.

---

## §6 — Waiting on Franky

1. **Yes/no on the profile-lock migration** (§3). Safe either way; profiles work without it.
2. **Phone test on the live site:** like a post, unlike it, publish a post with an @mention of James. Likes now go through the server (tested locally, not yet by a human on production).
3. **Decisions still open** (none block engineering):
   - Should "Here for" answers become public on profiles? (Owner-only today; 9 students answered in onboarding without being told it'd show.)
   - Should signed-out visitors see the phone tab bar on club pages (sign-up funnel)?
   - The "Connections" notification filter is dead in production (nothing writes those rows since an out-of-band change) — drop the filter or bring the notifications back?
   - Like notifications show free accounts who liked their post (Instagram does too) — accepted as the free exception unless Franky says otherwise.
   - Optional data cleanup: old rows hold values the save-on-load bug wrote (tagline = bio text, headline "Major · Year N", location_text = campus). Needs his OK to touch student data.
4. From session 62, still open: seeding (a second real account, SAE's first tapped follow/invite/club post), Rylan's club outreach, James's lawyer + bank chain, the Oct 31 deadline.

---

## §7 — Next up (engineering)

In roughly this order (the roadmap artifact https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi has the full week-by-week plan):
1. Apply the profile-lock migration once Franky says yes.
2. **Moderation you can use:** a screen that reads `reports`, hide/unhide a club from the UI, suspend/ban that survives re-signup, an admin action log. (App stores require this; nothing reads reports today.)
3. **Legal pages:** Franky answers the 50 `[DECISION]` markers (Marion County is settled), lawyer answers the 7 questions, then publish + bump `TERMS_VERSION` in one deploy — before the campus invite.
4. **Installable app (PWA):** manifest, service worker, iOS add-to-home-screen coach card, push notifications — ~3 weeks, fits Oct 31. Store apps in November.
5. **Re-run both sentinels** (security + feature) over everything since Sept 3.
6. Journal: add session 63 to `public/journal/vibe_journal.html` (not done this session).

## §8 — Known follow-ups (small, not done)

- `src/app/api/posts/[id]/route.ts` copies the hidden-club check; switch it to `src/lib/orgs/hidden-org-access.ts`.
- `GET /api/posts/[id]/comments` still returns a hidden club post's comments (`post_comments` is still `USING true`).
- Two like buttons roll back silently on refusal: `src/app/campus/campus-home.tsx:~6400`, `src/components/mobile/PostViewerMobile.tsx:~305`.
- Mentions have no per-sender budget.
- Desktop profile: a student whose cached copy predates the deploy sees "Here for" from their second load; profile-sync bodies send `avatar_url:null` etc. when those are empty in the local cache — check a stale cache can't clear a real avatar.
- Supabase CLI upgrade; delete `.next/dev/cache/turbopack.stale-c1`.

## §9 — Where things are

- Week-one plan and contracts: `handoffs/wave-plan-week1/` — **`rulings.md` first** (overrides the batch files), then `orchestrator-notes.md`, `T1.md`, `T2.md`, `C1.md`, `P1.md`, `E1.md`, `critic.md`.
- Launch decisions: `2026-09-15-session-60-email-verification.md` §6e (Oct 31 deadline, Marion County, club pipeline, native apps, marketing teasers, owners) and §6d (email to-dos).
- Roadmap for the team: https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi (private until Franky shares it).
- Workflow scripts used: scratchpad `week1-stage1.js`, `week1-stage2.js`, `week1-stage3.js` (session-local).
