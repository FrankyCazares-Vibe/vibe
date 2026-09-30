# Orchestrator rulings on critic.md — week one (2026-09-21)

## NEW STANDING RULE (2026-09-22) — never revoke EXECUTE on a public function

On this Postgres image (17.6.1.111, production's too) calling a public function the caller has no EXECUTE on CRASHES the backend (signal 11) and drops every connection — reproducible over REST with only the anon key. Migration `20260922090000_guard_function_privileges.sql` fixed the 11 production functions (APPLIED to production 2026-09-22 with Franky's yes; post-check: 0 public non-trigger functions deny EXECUTE to anon or authenticated). T1 file 1 was amended the same way.

So in EVERY migration from now on: a public, non-trigger function is GRANTed to anon, authenticated and service_role, and refuses inside — return false/null, or `RAISE ... USING ERRCODE = '42501'` from within the function (verified not to crash). **T2 must NOT revoke is_blocked_either_way / is_muting_now / the org helpers**; it makes them answer only about `auth.uid()` (null/false otherwise) with the grants left in place. Every migration's post-check includes: `select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and format_type(p.prorettype,null) not in ('trigger','event_trigger') and (not has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'))` → 0. Local-stack acceptance must NEVER call a function as a role that lacks EXECUTE (it crashes the shared local DB); use `has_function_privilege` instead.

Every item below OVERRIDES the batch files (T1.md, T2.md, C1.md, P1.md, E1.md) where they conflict. Read orchestrator-notes.md too.

## Build order (same-wave imports are not allowed)

- **Stage 1 (parallel):** T1a (migrations + shared libs, incl. the single pair-block module), C1 (club page + /plus phone shell), E1 (email send log, password cap — WITHOUT E1c, see B3).
- **Stage 2 (parallel, after T1a is on disk):** T1b, T1c, T1d, T2. T2 imports T1a's `src/lib/safety/pair-block.ts`.
- **Stage 3 (after T1c):** P1.
- **Acceptance** on the local stack runs SERIALLY after each stage, one batch at a time, by a dedicated acceptance agent — implementers never run `supabase db reset`, never flip grants, never apply migrations to the shared local DB. Implementers run unit tests, tsc and eslint only.

## Blockers

- **B1** `src/app/api/posts/[id]/route.ts` is **T1b's**. T2's PATCH mention change (T2 A4: service-role mention inserts at the two call sites) is implemented **by T1b** per T2's contract, re-grepping `insertMentionNotifications(supabase`. T1b also fixes the GET hidden-club leak (H7). T2 does not touch this file.
- **B2** `src/app/api/users/[handle]/bootstrap/route.ts` is **T1c's** in stage 2. P1 edits it in stage 3 (select string + anonymous strip), rebased on T1c.
- **B3** `src/app/api/me/profile/route.ts` is **P1's**, with ONE limiter: key `me-profile:${id}`, 60 per 600 s. **E1c is dropped**; E1 removes that file from its owned list and its L-C1..C3 checks.
- **B4** Resolved by the orchestrator: `.env.development.local` (gitignored) makes `next dev` resolve NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 with the LOCAL service key, and RESEND_API_KEY, R2_*, NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN and SUPABASE_ACCESS_TOKEN all EMPTY (verified with @next/env loadEnvConfig). Every acceptance suite's FIRST step: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/users/avery_owner/bootstrap` must print 200 (the handle exists only in the local seed) before any write. Uploads stay out of acceptance anyway.
- **B5** Acceptance is serial (see Build order). Grant-flipping steps run last in their suite with the restore in a shell `trap`. No "optional baseline" resets.

## High

- **H1** Each rollback restores only its own change (T1 file 2: its six policies + the grants it revoked that T2 does not also revoke; T2: `grant insert, delete on post_likes, comment_likes to authenticated`, nothing for anon). After any rollback, re-run the other batch's post-check.
- **H2** Gate each migration on "my predecessor present and my own version absent", never on `max(version)`. Planned production order: T1f1 → E1 → P1 → T1f2 → T2, each after its code deploy is Ready. If the real order differs, the orchestrator renumbers before applying.
- **H3** T2's function allow-lists include T1's seven new SECURITY DEFINER functions (`event_visible`, `can_manage_event`, `post_engagement_counts`, `comment_like_counts`, `event_rsvp_counts`, `mutual_follow_counts`, `second_degree_follows`); or check a deny-list of the nine T2 revokes.
- **H4** Record the prod drift in T2's header (`notify_on_connection_insert` and `is_muting_now` differ between prod and the migration files); pre-check compares md5 of `pg_get_functiondef` for the functions T2 replaces; T2's `create or replace` converges both. Franky note: the Connections notification filter is dead in prod (nothing writes 'connection' rows).
- **H5** No `psql` on the host. Use: `export PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"; PSQL() { docker exec -i supabase_db_vibe psql -U postgres -v ON_ERROR_STOP=1 "$@"; }` and feed files as `PSQL -f - < file.sql`.
- **H6** `looking_for` ("what are you here for?"): strip it for anonymous viewers (`lookingFor: []` in the anonymous branch). For signed-in viewers, **show the "Here for" row ONLY to the profile owner**, with a small "Only you can see this" note, until Franky decides whether it becomes public. Nine students answered it in onboarding without being told it would be shown.
- **H7** T1b: GET `/api/posts/[id]` selects `org_id` and answers 404 "Post not found" for a hidden club's post unless the viewer may see the hidden org; T1 item 9d drops a repost row whose original has `org_id` set while `org` came back null.

## Medium / Low

- **M1** T1's do-not-touch list no longer freezes the like routes; T2 adds their limits and Terms gate.
- **M3** Add a warning to `hydrateUserCards` never to pass the service client (`mutual_follow_counts` keys on `auth.uid()`); reviewers grep `hydrateUserCards\((service|createSupabaseServiceClient)` → nothing.
- **M4** `mutual_follow_counts` must exclude blocked pairs if it is a small change in T1a's SQL; otherwise note it.
- **M5** T2's C3 guard (the org helpers that answer only about the caller) goes in its own file `20260922120500_t2b_org_helper_guards.sql` with its own rollback.
- **M6** Product note for Franky, no code: like notifications show free accounts who liked their post (Instagram does the same). Treated as the accepted free exception.
- **M7** Base seed for every suite is `node scripts/local-seed.mjs`; batch seeds add rows on top.
- **M8** No production smoke writes anything. Post-deploy production checks are GET-only and run by the orchestrator.
- **M9** Vercel rollback rule (goes in the wave notes): once a batch's migration is live, never instant-roll Vercel back past that batch's code.
- **M10** Wrap both T1 migrations in `begin; … commit;` (a bare `set local` does nothing).
- **M11** One block-pair module, owned by T1a, zero `@/` imports, exporting both shapes (one viewer/one target, and one viewer/N peers). T2 imports it; no second module.
- **M12** Follow-list routes get a per-viewer GET limit (`follow-lists:${viewer}`, 120 per 60 s) and drop cards in `loadHiddenUsers(viewer).blocked`.
- **M13** The feed skips friend reposters (not 500s) when the service key is missing.
- **M14** T2's like route 404s a post whose author is in a block pair with the caller, or a hidden club's post the caller may not see.
- **M15** `email_sends.recipient_domain` stores the domain only for known school domains (from `school-email-domains.ts`) or a short list of large public providers (gmail.com, outlook.com, hotmail.com, icloud.com, yahoo.com); anything else is `"other"`.
- **T1 open question** (follower lists): keep today's behavior — other students' follower/following lists stay visible to signed-in students, like Instagram.
