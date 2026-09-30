### CRITIC · adversarial pass over week-1 batches T1, T2, C1, P1, E1

Read-only review, 2026-09-21. The batch files anchor at `e9044cc`; the repo HEAD is now `1b5b351`, and the two commits in between (`a39df14` migration guards, `1b5b351` `scripts/local-seed.mjs`) change no `src/` file. Live facts came from the read-only MCP. Local facts came from the running stack (`supabase_db_vibe`, read-only `docker exec … psql`). Prod and local fingerprints agree on all 92 policies, all 37 table ACLs and all 69 column ACLs. They disagree on two function bodies (High 4).

**Counts:** 5 blockers, 7 high, 17 medium/low.

### Blockers

**B1. Same file owned twice: `src/app/api/posts/[id]/route.ts` (T1b and T2).**
- Evidence: T1.md:56 (T1b owns the file, GET edit at `:120-182`). T2.md:13 claims the PATCH block `:512-588` and says "nobody else edits these while T2 is open". T2.md:609 fences off the rest of the file.
- Why it breaks: the two edits don't overlap by line, but T1b's GET edit moves every line below `:182`, so T2's `:512-588`, `:532`, `:560-576` anchors go stale. Two implementers working on the same file at once produce a merge conflict.
- Fix: **T1b owns the file.** T2's PATCH mention change (A4, two call sites) lands as a sequenced fold-in after T1b merges, re-grepping `insertMentionNotifications(supabase` for the new lines. While T1b has the GET open, it also closes the hidden-club leak in the GET (High 7).

**B2. Same file owned twice: `src/app/api/users/[handle]/bootstrap/route.ts` (T1c and P1).**
- Evidence: T1.md:66 and T1.md:274 (`:204` becomes `getCountsFor(service, targetId)`). P1.md:19 (select string `:20`, anonymous strip `:164`).
- Fix: **T1c owns the file.** P1 rebases onto it and applies its two edits after T1c merges. T1 goes first because its policy migration (file 2) can't be applied until T1c is deployed, so it is on the critical path. P1's edits also depend on P1's own type changes, so they can't move into T1c.

**B3. Same file owned twice, with contradicting contracts: `src/app/api/me/profile/route.ts` (P1 and E1c).**
- Evidence: P1.md:15 (owner) and P1.md:82 add limiter key `me-profile:${id}` at 60/600. E1.md:26 and E1.md:239-247 fold in a second limiter, `profile-patch:${id}` at 30/600, on the same lines (after `:122-124`, before `:126`).
- Why it breaks: the acceptance suites can't both pass. P1 E7 (P1.md:191) expects request #61 to get 429. E1 L-C1 expects #31 to get 429, and L-C2 counts the `profile-patch:` key.
- Fix: **P1 owns the file. Drop E1c.** Pick one key and limit before the build. I recommend P1's `me-profile:` at 60/600, because it covers the avatar save, the campus card and onboarding. Then delete E1 L-C1..C3, or rewrite them to P1's numbers. E1's owned-file list and its `eslint` line lose `route.ts`.

**B4. The acceptance dev server can point at production.**
- Evidence:
  - `.claude/launch.json:5-8`: the "vibe" config runs `npm run dev` on :3000, which loads `.env.local` and `.env.development.local` (both exist). The only Supabase URL the app reads is `NEXT_PUBLIC_SUPABASE_URL`.
  - T2.md:530 ("sign in … at `http://localhost:3000`"), P1.md:176 ("orchestrator's local env"), C1.md:128 and E1.md:455 name no env recipe and require no proof that the server is local.
  - The steps behind them write data: T2 4.3-4.16 (publish, like, follow, DM, block, club post), P1 E3-E7, U2 and U5 (profile saves, pins), and E1 L-A3..A8. Only T1 gives the env override plus a seed-only-handle proof (T1.md:701-708).
- Fix:
  - Add one `vibe-local` launch config: `bash -c 'eval "$(supabase status -o env)"; [ "$API_URL" = http://127.0.0.1:54321 ] || exit 1; NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY RESEND_API_KEY=re_local_mock RESEND_BASE_URL=http://127.0.0.1:4010 NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 exec npx next dev -p 3000'`.
  - Every suite's first step: `GET /api/users/avery_owner/bootstrap` (a handle that exists only in `scripts/local-seed.mjs`) must return 200 before any write.
  - Never start acceptance with `preview_start name: vibe`.
  - R2 keys still come from `.env.local`, so any step that uploads writes to the production bucket. No week-1 step uploads today. Keep it that way, or blank `R2_*` in `vibe-local`.

**B5. The local database is one shared, mutable resource, and the suites reset it or flip its grants.**
- Evidence: resets at T1.md:597 (`supabase db reset`), E1.md:431 (`db reset` if already up) and T2.md:532-533 (optional baseline: move T2's file out, reset, then reset again). Grant flips at T2.md:594 (revoke SELECT on `blocks` from authenticated), E1.md:471 (revoke INSERT on `email_sends` from service_role) and P1.md:182 (D4 runs P1's rollback grants).
- Why it breaks:
  - A reset deletes every auth user and every seed row, including `scripts/local-seed.mjs`, under any suite running at the same moment.
  - Each grant flip breaks sibling suites while it is in effect.
  - A reset run from an implementer worktree that lacks sibling migrations rebuilds the shared DB (containers `supabase_*_vibe`, `project_id = "vibe"`) without those migrations.
- Fix:
  - Implement in parallel, but run acceptance **serially** through the orchestrator.
  - Only the orchestrator runs `supabase db reset`, from a tree that holds all five week-1 migrations. After each reset it runs `node scripts/local-seed.mjs`, then the batch seeds.
  - Grant-flipping steps run last in their suite, with the restore in a shell `trap`.
  - T2's "optional baseline" runs on a throwaway stack or not at all.

### High

**H1. Each batch's rollback undoes the other batch's security fix.**
- Evidence:
  - T1 file 2's ROLLBACK (T1.md:365-366) runs `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON <six> TO anon, authenticated`. That reopens T2 §B, the direct `post_likes`/`comment_likes` writes that skip the route limit and the Terms gate.
  - T2's ROLLBACK (T2.md:473) runs `grant all on table public.post_likes, public.comment_likes to anon, authenticated`. That reopens T1's anon, TRUNCATE and UPDATE revokes.
- Fix: each rollback restores only its own change.
  - T1 file 2: restore the six policies, plus `grant select … to anon` and `grant truncate, references, trigger, maintain … to authenticated`. Grant `update` back only on tables T2 didn't also revoke.
  - T2: `grant insert, delete on post_likes, comment_likes to authenticated`, and nothing for anon.
  - After any rollback, re-run the other batch's POST-CHECK.

**H2. Migration order: T1's version gate will stop falsely, and local replay order ≠ prod apply order.**
- Evidence:
  - T1.md:341-343 requires `max(version)` to be exactly `20260916130000` (file 1) or `20260922100000` (file 2), and says "anything higher … STOP".
  - Filename order is T1f1 `…100000` → P1 `…101100` → E1 `…104000` → T1f2 `…110000` → T2 `…120000`. But prod applies each migration when its code is Ready: E1 any time, P1 and T2 after their deploys, T1f2 after T1b–d.
  - So by the time T1f2 is due, P1 or E1 is almost certainly already applied, and T1f2's gate stops. E1's pre-flight (E1.md:264) already tolerates P1.
- What is safe: the five files commute. The only object two of them both touch is the `post_likes`/`comment_likes` grants (T1f2 and T2 §B), and both only revoke. So one migration per batch holds. T1 needs two files because its code deploys between them. C1 needs none.
- Fix:
  - Gate each file on "my predecessor is present and my own version is absent": `select version from supabase_migrations.schema_migrations where version in ('20260922100000','20260922110000')`. Don't gate on `max(version)`.
  - Record the planned prod order in the wave plan: T1f1 → E1 → P1 → T1f2 → T2, as each deploy turns Ready.
  - If the real order differs, renumber before the apply, so `supabase db reset` replays the order prod saw.

**H3. T2's pre-check and post-check will fail falsely once T1 file 1 is applied.**
- Evidence:
  - T2.md:152 lists "22 functions".
  - T2.md:459 says only seven functions may show `t` for authenticated EXECUTE.
  - T1 file 1 (T1.md:373-527) adds seven more SECURITY DEFINER functions that authenticated can call: `event_visible`, `can_manage_event`, `post_engagement_counts`, `comment_like_counts`, `event_rsvp_counts`, `mutual_follow_counts`, `second_degree_follows`.
- Fix: add T1's seven to T2's C1 table, pre-check 3 and post-check allow-list. Or check a deny-list instead: the nine T2 revokes must be `f`.

**H4. Local ≠ prod for two functions, and T2 rewrites one of them.**
- Evidence, verified today:
  - `notify_on_connection_insert`: local md5 `5a629d47…`, 1151 chars. It writes two `'connection'` rows on every mutual follow (`20260504160000_notifications_connection_type.sql:41-50`, the last migration that defines it). Prod md5 is `68d42fc0…`, 526 chars, with no `'connection'`. Prod was changed outside the migration files.
  - `is_muting_now` also differs: local `c4e594d0…`, prod `c03a7cd6…`.
  - T2.md:55 says of `connection` rows that "nothing writes it". That is true only in prod.
  - The UI still shows a "Connections" filter (`src/components/network/OttoSidePanel.tsx:564,761`), and the count route still counts `connection` rows (`src/app/api/me/notifications/count/route.ts:73`). Prod never writes one.
- Why it matters:
  - On the local stack, every mutual follow in every seed adds two rows. That skews T2's optional baseline and any notification count taken locally.
  - T2's rollback must restore the **prod** body (T2.md:490-491 says so), which the local stack has never had.
- Fix:
  - Record both drifts in T2's header.
  - Pre-check 3 compares `md5(pg_get_functiondef(...))` for the five functions T2 replaces against the header values, on prod and on local.
  - T2's `create or replace` makes both environments converge.
  - Add a note for Franky: the Connections filter is dead in prod. Either drop the filter or restore the writer; that is not a week-1 change.

**H5. `psql` is not installed, and `docker` is not on PATH, but the acceptance steps assume both.**
- Evidence:
  - `which psql` prints "psql not found". Docker lives at `~/.docker/bin/docker`.
  - `psql "$DB_URL"` appears throughout: T1.md:606 and the D probes; T2 4.2, 4.3, 4.5, 4.9, 4.12 and 4.15e; P1 seed step 3 (P1.md:174), D1 and E3-E7; E1 L-A1..A11 and L-C2.
- Fix: define `PSQL() { ~/.docker/bin/docker exec -i supabase_db_vibe psql -U postgres -v ON_ERROR_STOP=1 "$@"; }` once, in the orchestrator's acceptance preamble.
  - The container can't read host paths, so T1's `-f $S/seed-t1.sql` becomes `-f - < $S/seed-t1.sql` (psql `-v` variables still work).
  - The alternative is `brew install libpq`.
  - `jq`, `gh`, `supabase` 2.98.2 and Node 25.9 are all present.

**H6. P1 would publish students' "what are you here for?" answers on the open web.**
- Evidence:
  - P1.md:72 emits `lookingFor` to signed-out share-link visitors.
  - Today the anonymous strip blanks the only surface that ever showed the answer (`src/app/api/users/[handle]/bootstrap/route.ts:164`, `recruiter_snapshot: {}`), so anonymous visitors never saw it.
  - Nine students answered it in onboarding, where it was asked as "What are you here for? (optional)" with no mention of a profile. P1 makes those answers public retroactively.
- Fix:
  - Strip `lookingFor` in the anonymous branch (`lookingFor: []`), next to `:164`.
  - For signed-in viewers, Franky decides. Either show it (it's then new on-profile data, so tell students), or show the row only to its owner until the owner saves the chips once.
  - Update acceptance E2 (P1.md:186), which expects the same `lookingFor` with no cookie.

**H7. Hidden-club posts leak through two routes this wave already touches.**
- Evidence:
  - T1 item 9c (T1.md:250-260) re-reads repost originals under the viewer's RLS with `org:orgs(...)`. `orgs_select` nulls a hidden club for non-members, and the route then renders the post with `org: null` (`src/app/api/users/[handle]/reposts/route.ts:133,141`). The club's post shows as a personal post. T1's filter only drops originals that "did not come back" (T1.md:260), and this one does come back.
  - `GET /api/posts/[id]` (`route.ts:88-99`, the part T1b owns) doesn't select `org_id` and returns a hidden club's post to any signed-in student who has its id. T2 Risk 9 found this (T2.md:644), but no batch owns the fix.
- Fix:
  - T1 item 9d also drops a row whose `org_id` is set while `org` is null.
  - T1b adds `org_id` to the GET select. For a hidden club it answers 404 "Post not found" unless `viewerMaySeeHiddenOrg` (moved by T2 to `src/lib/orgs/hidden-org-access.ts`) says yes. Sequence T1b after T2's D3 move, or copy the check in.
  - Add a local acceptance row for each: a hidden club post reposted by a visible student, and a GET by a non-member.

### Medium/Low

**M1. T1's Do-not-touch list contradicts T2.** T1.md:736-740 freezes the like routes: their "rate limits and Terms gates stay exactly as they are". T2 B2 adds both to `posts/[id]/like` and `comments/[id]/like`. Fix: amend T1's list. T1 acceptance #21 (E likes and unlikes P3) still passes after T2: E gets consent from signup metadata through `handle_new_user`, and 4 calls sit far under the 120/600 `like:` bucket.

**M2. My re-walk of the callers found no missed screen.**
- The walk:
  - `post_likes`, `post_reposts`, `comment_likes`: 29 code sites, all in T1's tables.
  - `connections`: every `.from("connections")` in `src/` is either viewer-scoped or in T1's action list.
  - `rsvps` (9 sites) and `events` (11 sites) match T1.
  - `public/html` touches none of them. Its only hit is the comment at `_postViewer.js:1422`.
  - No client component reads the six tables. The one browser-client user outside auth, `ProfileHandleSwitch.tsx:78`, reads `users`.
  - `/api/events`, `/api/search`, `/api/posts/[id]` and `/api/feed` all return 401 to signed-out callers before they touch the tables, so T1's anon revoke empties nothing.
- Omitted but transparent: T1's walk doesn't list every caller.
  - `hydrateUserCards` has 11 callers: `me/followers:67`, `me/following:66`, `me/connections:77`, `users/[handle]/{followers:79,following:78,connections:91,mutuals:148}`, `orgs/[slug]/followers:133`, `me/posts/[id]/{savers:112,viewers:135}` and `lib/metrics/profile-viewers.ts:193`.
  - `getFollowState` is called from `me/threads/route.ts:241,326` and `me/threads/[id]/members/route.ts:91`.
  - All of these use the cookie client today, so T1's changes reach them correctly. Add them to T1's table so the reviewer checks them.

**M3. `hydrateUserCards` must never receive the service client after T1.** `mutual_follow_counts` keys on `auth.uid()`, which is NULL for the service role. With the service client, every `mutual_count` silently becomes 0. T1 item 10 (T1.md:264-273) rewrites the `getCountsFor` and `loadMutualIds` docblocks to say "pass service", which invites that mistake. Fix: add the opposite warning to `hydrateUserCards`, and a reviewer grep: `hydrateUserCards\((service|createSupabaseServiceClient)` must print nothing.

**M4. `mutual_follow_counts` is a follow-graph oracle over REST that ignores blocks.**
- How: a caller follows only Y, then calls `rpc/mutual_follow_counts {"p_user_ids":[X]}`. The answer is 1 exactly when X follows Y. It works even when X has blocked the caller, which skips the pair-block check T1 adds to the list routes (item 13). No rate limit applies.
- `second_degree_follows` similarly returns identities, although it only works through the caller's mutual follows.
- Fix: in both RPC bodies, add `and not exists (select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = <candidate>) or (b.blocker_id = <candidate> and b.blocked_id = auth.uid()))`. Add a D-probe with SEED-T1's F↔A block: `mutual_follow_counts(array[A])` as F returns no rows.

**M5. T2 bundles its riskiest change with its safest ones.** The C3 guard changes helpers that 17 policies call. It shares one transaction and one rollback (which needs five pasted function bodies) with the notification-forgery fix. I checked live: every one of the 17 policies passes `auth.uid()` (`pg_policies`), and the only other caller is `posts_stamp_campus` (`20260916103000_org_join_policy_invites.sql:695`), which the `auth.uid() IS NULL` branch covers. So C3 is correct. It should still roll back on its own. Fix: split it into its own file (T2b, `…120500`), or give C3 its own rollback block in T2's header.

**M6. Like notifications already give free accounts the "who liked" identity.** `/api/me/notifications` embeds the actor (`src/app/api/me/notifications/route.ts:51,56`) on every like row, and T2 keeps one row per (liker, post). T1's reason for keeping likes own-only (T1.md:574-577) is that "who liked" is the paid line. Product call for Franky: either the notification is the accepted free exception (as on Instagram), in which case say so in the thesis and in T1's header, or like notifications collapse to counts for free accounts later. Not a week-1 code change.

**M7. The shared seed exists, and no batch uses it.** `scripts/local-seed.mjs` (HEAD `1b5b351`) creates 5 accounts, 4 clubs (one of them hidden), posts, events and follows. It refuses any non-local API. Meanwhile three batches say "if the local-stack batch ships `supabase/seed.sql`", and `supabase/config.toml:65` names a `seed.sql` that doesn't exist.
- Fix:
  - The base seed is `node scripts/local-seed.mjs`.
  - Each batch seed becomes an additive scratch script with its own handle prefix (`t1*`, `t2*`, `p1*`, `c1*`, `e1*`). The prefixes don't collide today.
  - C1's SEED-C1 can reuse `test_invite_club`, `avery_owner` and `blake_iu` as they are.
  - T1 seeding at `iu-bloomington` keeps its campus-map counts separate from the base seed's `indianapolis`. Keep that.

**M8. The "read-only" prod smokes write to production.**
- Evidence: T1's post-apply smoke (T1.md:359-361: the feed, "one post, a visited profile's Followers tab") and T2's post-check (T2.md:464: "A DM thread opens").
- What gets written: opening a post records a `post_views` row, and visiting a student's profile records a `profile_views` row, which puts Franky in that student's paid viewer list. Opening a thread may write `last_read_at`.
- Fix: run the smokes on Franky's own posts, own profile and a thread with a cofounder. Or state in the headers that those rows are accepted.

**M9. The Vercel instant-rollback rule lives only in T1** (Risk 1). Once T2's or P1's migration is live, rolling Vercel back past that batch breaks things:
- likes return 500 (42501 on the user-client insert);
- mention notifications silently stop;
- profile saves, tag edits and pins fail with 42501.

Fix: one cross-batch rule in the wave plan. Never instant-rollback Vercel past a batch whose migration is applied; run that migration's ROLLBACK first. Preview deployments that share the prod database have the same problem, so check whether previews point at prod Supabase.

**M10. T1's migrations use `set local` outside a transaction block.** T1.md:373 and T1.md:532 start with `set local lock_timeout = '5s'` and have no `begin`/`commit`. The house files (T2, P1, E1) wrap theirs. Outside an explicit block, `SET LOCAL` only warns and has no effect. Fix: wrap both T1 files in `begin; … commit;`.

**M11. Two batches write the same block-pair helper.** T1a adds `src/lib/safety/pair-block.ts` (`pairBlockFilter`, one viewer and one target, importing `isUuid` from `@/lib/pgrest`). T2 adds `src/lib/safety/dm-block-check.ts` (`blockPairFilter`, one viewer and N peers, with the UUID regex copied inline so `node --test` loads it). That is two hand-built PostgREST `.or()` strings over `blocks`. Fix: one module owned by T1a, zero `@/` imports, exporting both shapes. T2 imports it. If both files stay, the tests should cross-check the two strings on a one-peer input.

**M12. The follow lists become an easier bulk scrape.** T1 item 13 moves `users/[handle]/{followers,following,connections}` to unpaged service reads with no read limiter. The REST dump that T1 closes reopens as a route loop over every handle. The lists also still show followers who have blocked the viewer, because only the viewer↔target pair is checked. That was already true, since the old cookie read ran under `USING (true)`. Fix: add a per-viewer GET limit (for example `follow-lists:${viewer}` at 120/60, the pattern of `src/app/api/me/profile-viewers/route.ts:47`), and drop hydrated cards that are in `loadHiddenUsers(viewer).blocked`.

**M13. The contract is missing a guard that T1's Risks require.** T1 Risk 2 (T1.md:762-763) says the feed must skip friend reposters when `SUPABASE_SERVICE_ROLE_KEY` is missing. Contract item 6b doesn't say so, so a missing key would 500 the feed. Fix: move that sentence into item 6b.

**M14. T2's like route doesn't check blocks or hidden clubs before notifying.** The POST visibility read (T2 B2 step 6) runs `posts` under `posts_select_authenticated`, which allows `published OR own`. So a blocked student can like the blocker's post, or a hidden club's post, and the trigger writes a notification. The read side filters those actors out (`me/notifications/route.ts:68-79`, `count/route.ts:35-48`), so this is Low. Fix, optional: 404 a post whose author is in a block pair with the caller, using `loadPairBlock` from T1a.

**M15. E1's send log can still identify a person.** For a password reset sent to a personal domain (`me@lastname.dev`), `recipient_domain` identifies the student, and `email_sends` keeps it after the hash is forgotten on account deletion. Fix: store the domain only when it is a known school domain (`school-email-domains.ts`) or a large public provider, and `"other"` otherwise. Also, the lookup script needs the production `SCHOOL_EMAIL_VERIFY_SECRET` on the laptop. Pull it to a scratch file and delete it after use, rather than exporting it in a shell profile.

**M16. Small harness mismatches.**
- C1 uses `127.0.0.1:3000` while T2, P1 and E1 use `localhost:3000`. Cookies don't cross between the two hosts, and the local GoTrue `site_url` is `http://127.0.0.1:3000` (`supabase/config.toml:154`). Pick one; I recommend `127.0.0.1`.
- T1's dev server uses :3100, the port `.claude/launch.json` gives `vibe-smoke`.
- C1 D writes `/tmp/c1-*.html`. Use the scratchpad.
- C1 B runs `npx next build` in the checkout. Don't run it while a `next dev` from the same tree is serving acceptance.

**M17. Old cached bundles: no break found. Two cosmetic leftovers.**
- T1: every response shape stays the same, and no client reads a table directly.
- T2: the new 404 and 429 bodies render through each caller's existing `j.error` toast.
- E1: the 503 `error` string stays byte-identical, and `attemptedTo` is additive.
- C1: no API change.
- P1: old desktop bundles (cached for weeks) still draw the empty "PROFESSIONAL SNAPSHOT" card. It renders safely because `profile.html:9285` checks `user.snapshot &&` before writing. Text a student types into it is dropped silently, as P1 Risk 4 accepts. Old `ProfileMobile` bundles keep the recruiter copy until reload.
- No action needed beyond P1's Risk 4. Re-check once a week after deploy with `grep -c recruiterCard` on the served `profile.html`.

---
