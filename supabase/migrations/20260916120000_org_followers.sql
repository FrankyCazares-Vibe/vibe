-- Org FOLLOWING (Franky, 2026-09-16): a club gets two relationships. FOLLOWING
-- is open to any student who can see the club and puts the club's posts in
-- their feed. MEMBERSHIP is governed by orgs.join_policy (M1c) and is the only
-- thing that unlocks the chat channels.
-- Spec: handoffs/2026-09-16-org-following-spec.md. Migration M1d.
--
-- WHAT IT DOES
--   1. New table public.org_followers (id, org_id, user_id, created_at,
--      first_followed_at, source), UNIQUE (org_id, user_id), both FKs
--      ON DELETE CASCADE.
--   2. New table public.org_follow_firsts (org_id, user_id, first_followed_at):
--      a three-column durable memory of the FIRST time a user ever followed a
--      club, which an unfollow DELETE cannot reset. Critic C15. Nothing in the
--      app reads it: it exists so org_followers.first_followed_at survives an
--      unfollow/refollow cycle, and it has NO grant and NO policy at all.
--   3. M1c's grant posture: revoke all from anon + authenticated, grant SELECT
--      to authenticated only, one narrow SELECT policy. Every write -- the
--      student's follow, the student's unfollow, and an officer removing a
--      follower -- is service role, through the /api/orgs/[slug]/follow and
--      /api/orgs/[slug]/followers routes.
--   4. Three triggers:
--        org_followers_stamp_first    BEFORE INSERT ON org_followers
--          stamps first_followed_at from org_follow_firsts (C15).
--        org_members_imply_follow     AFTER INSERT ON org_members
--          becoming a member writes the follow row (member => follower).
--        org_members_unfollow_on_leave AFTER DELETE ON org_members
--          leaving removes the follow ONLY when it came from joining
--          (source = 'join'). A follow the student tapped survives.
--          FRANKY ANSWER (2) 2026-09-16; this OVERRIDES spec §2.4's
--          "leave leaves the follow behind" row and resolves critic C7.
--   5. Backfill: every existing org_members row gets a follower row
--      (source 'join', created_at = the member row's joined_at), asserted by
--      parity, not by a hardcoded count.
--
--   It does NOT touch orgs, posts, notifications, connections, org_invites or
--   any existing policy or grant. org_members gains two triggers -- one AFTER
--   INSERT, one AFTER DELETE -- and nothing else. In particular it does NOT
--   touch orgs_select: see the CONTRACT paragraph below.
--
-- FRANKY'S ANSWERS, 2026-09-16 (settled; these govern where they conflict with
-- the spec body)
--   (1) An open club shows Follow AND Join together in a row -- there is no
--       follow-before-join ladder. NO SQL HERE ASSUMES ONE. The member => follower
--       implication runs in exactly one direction: nothing requires an
--       org_followers row to exist before an org_members INSERT, no constraint
--       references the other table, and org_members_imply_follow is the only
--       edge between them on the write path. A student can join an open club
--       having never followed it and the trigger fills the follow row in the
--       same transaction. (Critic C16 is thereby answered at the UI layer, not
--       here; this file simply refuses to encode the ladder.)
--   (2) Leaving a club ALSO removes the follow when that follow came from
--       joining; a follow the student tapped survives. Implemented in the
--       DATABASE as org_members_unfollow_on_leave, mirroring the join trigger,
--       for the same reason the join side is a trigger (see CHANGES item 2).
--   (3) Officers -- owner and admin -- may read the follower list, and students
--       are told. RLS: the follower themself, OR owner/admin of that org.
--       "Students are told" is COPY, and it is the follow-up batches' job:
--       critic C14 wants one line under the Follow control on a non-open club
--       ("Officers can see who follows this club."). This migration is the half
--       of that promise that can be enforced; §1's "Following is not asking for
--       anything" is the sentence the copy batch has to revise.
--   (4) An invite means JOIN, not follow. There is NO club-follows-student edge
--       in this schema (org_followers.user_id is the STUDENT, always) and NO
--       "X followed your club" notification in v1: notifications_type_check is
--       UNCHANGED by this file and gains no 'org_follow'. Critic C8's second
--       half (does "them following you" mean a real org -> student edge?) is
--       answered NO for v1 by this answer.
--
-- SETTLED DEFAULTS FROM THE SPEC, AND WHERE THEY LIVE
--   * Any student may follow any NON-HIDDEN club regardless of audience or
--     school verification (§2.5). There is deliberately NO audience column, NO
--     school_system check and NO verification check on this table. Following is
--     not membership; audience is documented in join-state.ts as "a label, not
--     a boundary" and must not be hardened into one on a brand-new surface.
--   * Hidden clubs cannot be followed -- the ROUTE returns 404 not_found, the
--     same answer orgJoinState gives, so the 404 does not confirm the handle.
--     That is a route gate, not an SQL one, on purpose: EXISTING ROWS SURVIVE
--     HIDING. Hiding is a reversible platform-admin action and is not the
--     follower's doing, so nothing here cascades on orgs.hidden_at and an
--     unhide restores the audience intact. Feed hydration drops hidden orgs at
--     read time (§4.4.1).
--     Live proof this matters: 6 of the 7 backfilled rows belong to the four
--     HIDDEN test orgs (verified below). If hiding deleted follows, this
--     migration's own backfill would mostly evaporate.
--   * Membership implies following, including for an admin-added member. See
--     CHANGES item 5 (critic C26) -- that is a DECISION, not a side effect.
--   * The follower COUNT is suppressed below 5. That is a ROUTE and UI concern
--     and is NOT in this file; it is written down here for the follow-up
--     batches because this migration is what makes the number exist. Critic
--     C13: 19 users, SAE has 1 member, so the instant this backfill lands SAE's
--     page would read "1 follower - 1 member" -- the same person, named by the
--     member list. Below about 5 the count IS the identity, which is the exact
--     failure the S58 metrics-honesty pass cleaned up. Suppress below 5, or
--     show it to officers only until then.
--
-- CHANGES FROM THE SPEC AND THE REPORTS
--   1. Table is org_followers, not org_follows: it pairs with org_members in
--      every query written next to it, and the count field is follower_count.
--   2. Membership -> follow is a TRIGGER, not a call inside admitMember().
--      admitMember is not the only inserter: orgs/route.ts:391 writes the OWNER
--      row when a club is created, and admin/orgs/** may write directly. A
--      forgotten call is SILENT (student joins a club, feed stays empty) and
--      wave 2b run A rewrote five-plus membership write paths. A trigger cannot
--      be forgotten and cannot be edited by a parallel batch. Both writers are
--      already service-role, so it adds no grant surface. The SAME argument
--      applies to the leave side, which is why Franky's answer (2) is also a
--      trigger: org_members is deleted by self-leave (join/route.ts DELETE),
--      by an officer removing a member (members/[userId]/route.ts) and by
--      admin/orgs/**, and a rule implemented in one of those three is a rule
--      that silently does not hold in the other two.
--   3. org_followers_select admits the row's owner OR the club's owner/admin --
--      NOT `using (true)` like public.connections. A follower list on an
--      invite-only club names the students it courted; connections is
--      `using (true)` because of an un-hardened grant (live relacl
--      anon=arwdDxtm AND authenticated=arwdDxtm -- verified), not because
--      anybody decided it should be. "Counts public, identities private" is the
--      product line (S58 metrics pass), and this policy is that line in SQL.
--      owner/admin, not owner/admin/mod, matching org_invites_select (M1c
--      critic C2). Adding 'mod' later is one CREATE OR REPLACE POLICY plus one
--      constant in src/lib/orgs/following.ts -- keep those two in step.
--   4. NO orgs.follower_count column. A denormalised counter needs a second
--      trigger, and `orgs` has no table-level UPDATE grant for authenticated,
--      so a drifted counter would be service-role-only to repair. Count it the
--      way member_count is counted.
--   5. NO notification on follow (Franky answer 4). notifications.actor_id is
--      NOT NULL and FKs to users, so an org-follow notification is one row PER
--      OFFICER per follow, plus another notifications_type_check swap. Clubs
--      want the number. If Franky wants it later it is one
--      ALTER ... DROP/ADD CONSTRAINT.
--
--     >>> CONTRACT FOR THE FOLLOW BATCHES -- EVERY FOLLOW SURFACE MUST RESOLVE
--     >>> THE ORG WITH THE SERVICE CLIENT. Do not delete this paragraph: it is
--     >>> the only place the cost of M1c critic A4 is written down for this
--     >>> feature, and the consuming routes land two waves later.
--     M1c NARROWED orgs_select to (VERIFIED LIVE 2026-09-16, byte for byte)
--       ((is_public OR is_org_member(id, auth.uid()))
--        AND ((hidden_at IS NULL) OR is_org_member(id, auth.uid())))
--     SAE -- the only non-hidden club in production -- is is_public = false,
--     join_policy = 'invite'. So under the USER client a non-member SELECTs
--     nothing for SAE, and a follow route that resolves the handle with
--     `createSupabaseServerClient()` returns 404 to exactly the students the
--     feature exists to court. The failure is silent: no error, just a Follow
--     button that says "not found".
--     SO: POST/DELETE /api/orgs/[slug]/follow, GET + DELETE
--     /api/orgs/[slug]/followers, GET /api/me/followed-orgs, and the feed's
--     followed-org hydration all resolve {id, handle, name, logo_url, verified,
--     hidden_at} with createSupabaseServiceClient(). Embed NOTHING from orgs
--     under the user client. This migration does NOT widen orgs_select and must
--     not be edited to do so -- A4's reasons (authenticated holds table SELECT
--     on orgs, live relacl authenticated=rdDxtm; widening leaks owner_id, tags,
--     school and updated_at for every private club; SAE has exactly one member,
--     so widening would name him) have not changed.
--     EXISTING VIOLATION, not just a rule for new files (critic C18): the red
--     "Couldn't load this org's channels." every SAE non-member sees on
--     /orgs/sae is NOT "the fetch runs for everyone and RLS returns nothing" --
--     channels/route.ts:22-36 resolves the handle with the USER client, gets
--     nothing for SAE, and returns 404 before it ever reads `channels`. That is
--     a third orgs_select casualty of M1c, and it belongs to whichever batch
--     fixes ChannelsSection.
--
--     >>> THE COUNTS RULE, because it is the single easiest silent bug in this
--     >>> feature. follow_state MAY be read with the USER client
--     >>> (org_followers_select admits user_id = auth.uid()). follower_count
--     >>> and any follower LIST MUST be read with the SERVICE client: under the
--     >>> user client the policy narrows a non-officer's count to 1-or-0 and
--     >>> the number is a silent lie. On a failed count read return
--     >>> follower_count: null and render nothing -- do NOT copy member_count's
--     >>> `?? 0` fallback (spec §4's honesty rule; critic C27 wants the older
--     >>> member_count line fixed to match, not this one loosened).
--
--     >>> KEYSET PAGINATION (critic C5). ORDER BY first_followed_at DESC, id
--     >>> DESC -- BOTH COLUMNS, in the query and in the cursor.
--     >>> THIS OVERRIDES spec §4.1 and §4.3, which BOTH still say created_at
--     >>> (§4.1's followers route: "order created_at desc … keyset cursor on
--     >>> created_at"; §4.3's invite-candidates: "created_at desc"). Do not
--     >>> implement them literally. created_at is the STUDENT's sort key ONLY
--     >>> (their own "clubs I follow, newest first"); an officer-facing sort on
--     >>> it is attacker-rollable by a two-request unfollow/refollow, which is
--     >>> exactly what critic C15 closed. There is DELIBERATELY no
--     >>> (org_id, created_at desc, id desc) index, so an implementer who
--     >>> follows the spec literally gets a rollable sort key AND a sequential
--     >>> scan; building that index is a separate decision (see the index
--     >>> comment at the top of section 2). `first_followed_at`
--     >>> alone is not unique: the backfill below is one INSERT ... SELECT, and
--     >>> although it stamps org_members.joined_at (all 7 distinct today,
--     >>> verified) nothing guarantees two students never share a timestamp. A
--     >>> `<` cursor on a non-unique key drops the rest of a tie group; a `<=`
--     >>> cursor loops forever. `id` is a random uuid, so it is not time-ordered
--     >>> -- it does not need to be. As a TIEBREAKER inside one identical
--     >>> timestamp it only has to be total and stable, and it is.
--     >>> The index org_followers_org_first_followed below serves exactly this
--     >>> query shape; do not sort the officer list on anything else without
--     >>> adding the matching index.
--
--     >>> OFFICER REMOVAL (critic C4) -- THE GRANT POSTURE, AND WHAT IT DOES
--     >>> NOT BUY. C4 is right that there was no way to remove a follower. The
--     >>> SQL answer is deliberately NOT a DELETE policy: `authenticated` gets
--     >>> SELECT and nothing else on this table, so
--     >>>   DELETE /api/orgs/[slug]/followers/[userId]
--     >>> authorises in TypeScript against org_member_role(org_id, uid) in
--     >>> ('owner','admin') -- the same FOLLOWER_LIST_ROLES that gate the GET
--     >>> and mirror org_followers_select -- and then deletes with the SERVICE
--     >>> client, which bypasses RLS because this table is not FORCE RLS. A
--     >>> DELETE policy plus a DELETE grant would be a SECOND authorisation
--     >>> path, reachable from PostgREST, that skips the rate limit and the
--     >>> hidden_at check the route performs. Verify the posture holds with
--     >>> POST-APPLY check (c): authenticated must have DELETE = f.
--     >>> WHAT IT DOES NOT BUY: v1 removal is reversible -- a removed student
--     >>> may follow again, so removal is a mute, not a ban. It is not pure
--     >>> theatre, because org_follow_firsts is NOT deleted by the removal, so
--     >>> a re-follower still shows the officer their ORIGINAL first_followed_at
--     >>> and does not read as a new person. A real ban is a new table
--     >>>   create table public.org_follow_blocks (
--     >>>     org_id uuid not null references public.orgs(id) on delete cascade,
--     >>>     user_id uuid not null references public.users(id) on delete cascade,
--     >>>     blocked_at timestamptz not null default now(),
--     >>>     blocked_by uuid references public.users(id) on delete set null,
--     >>>     primary key (org_id, user_id));
--     >>> plus one existence check in POST /follow. DELIBERATELY NOT BUILT:
--     >>> Franky has not been asked, and the student-level lever (public.blocks,
--     >>> which exists live) already covers the officer-is-being-harassed case
--     >>> person-to-person. This is an OPEN QUESTION for the follow-up batches,
--     >>> not a discovered gap.
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only catalog SELECTs via the Supabase
-- MCP. EVERY VALUE BELOW WAS RE-RUN AND RE-CONFIRMED AGAINST PRODUCTION on
-- 2026-09-16 after wave 2b run A was committed and pushed -- nothing in it
-- moved. RE-RUN THEM AGAIN AS PRE-FLIGHT anyway: orgs_delete lets an owner
-- delete their own org, and run A's routes write org_members)
--   * max(version) in supabase_migrations.schema_migrations = 20260916103000
--     (M1c applied; M2 written but NOT yet applied -- see DEPLOY ORDER).
--     to_regclass('public.org_followers')     = NULL.
--     to_regclass('public.org_follow_firsts') = NULL.
--     to_regclass('public.org_follows')       = NULL (no earlier attempt).
--   * orgs 5 rows, 4 hidden. In created_at order:
--       f7ae4129 test-f7ae4129 open    both hidden   is_public t  2 members
--       6e881851 test-6e881851 request both hidden   is_public f  1 member
--       923896fb sae           invite  both VISIBLE  is_public f  1 member
--       a73bee3e test-a73bee3e request both hidden   is_public f  1 member
--       6ca4ec6e test-6ca4ec6e open    both hidden   is_public t  2 members
--     SAE is the ONLY visible club, it is invite-only, and it is the only one
--     with campus_id = 'indianapolis'. That is why this migration exists:
--     without following, every non-member's only control on the only live club
--     is a disabled button.
--   * org_members 7 rows; columns are (id, org_id, user_id, role, joined_at) --
--     the timestamp is JOINED_AT, not created_at, which is what the backfill
--     and the join trigger below read. All 7 joined_at values are DISTINCT
--     (min 2026-05-06 06:24:44.908587+00, max 2026-05-12 22:02:12.371512+00),
--     so the backfill does not create one giant tie group -- critic C5's
--     worst case does not exist on today's data, and the (…, id desc)
--     tiebreaker is there for tomorrow's.
--     6 of the 7 rows belong to HIDDEN orgs; only SAE's single member is on a
--     visible club. And the 7 rows are held by just THREE DISTINCT USERS out of
--     19 -- so this backfill produces 7 follower rows representing 3 people.
--     That is critic C13 in one number: a "follower count" derived from this
--     data names individuals. Suppress below 5.
--     ZERO non-internal triggers (pg_trigger) -- so the two below are the first
--     on it. relacl: postgres=arwdDxtm | authenticated=rdDxtm |
--     service_role=arwdDxtm (no 'a' -- M1c's INSERT revoke is live). RLS
--     enabled, NOT forced.
--   * org_invites 0 rows; relacl authenticated=r (the posture copied below).
--   * connections 26 rows; relacl anon=arwdDxtm AND authenticated=arwdDxtm --
--     the UN-hardened shape this file deliberately does not copy.
--   * posts 21, posts with org_id = 0. users 19 (18 when this file was first
--     drafted; a signup is the only explanation you should accept for that
--     number moving). public.blocks exists.
--   * public.org_member_role(oid uuid, uid uuid): SECURITY DEFINER, STABLE,
--     proacl {postgres=X, authenticated=X, service_role=X} -- EXECUTE granted
--     to authenticated and NOT to anon, which is what org_followers_select
--     needs (a policy expression runs as the querying role). Same dependency
--     org_invites_select already has. public.is_org_member is the same shape.
--     No database function writes org_members: the only two functions in public
--     that mention the table are those two SECURITY DEFINER read helpers
--     (verified by pg_get_functiondef regex), so the two triggers below see
--     only application writes.
--   * notifications_type_check = CHECK (type = ANY (ARRAY['follow','connection',
--     'like','comment','mention','org_invite','org_request_approved'])) -- this
--     file does NOT change it (CHANGES item 5, Franky answer 4).
--   * pg_default_acl for public TABLES =
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--      service_role=arwdDxtm}
--     and for public FUNCTIONS =
--     {postgres=X, anon=X, authenticated=X, service_role=X}
--     (there are TWO rows per objtype, one granted by `postgres` and one by
--     `supabase_admin`; they are IDENTICAL in shape, so the revokes below are
--     load-bearing whichever role ends up applying this file)
--     -- BOTH VERIFIED LIVE. A new table is auto-granted everything to anon and
--     authenticated, so the `revoke all` below is not decoration: without it
--     any signed-in client could INSERT and DELETE follow rows directly. The
--     function line is critic C22: the spec's draft revoked from `public, anon`
--     only and left the auto-granted authenticated=X in place, which is not the
--     posture its own header claimed.
--   * No table here is FORCE RLS (relforcerowsecurity = f on orgs, org_members,
--     org_invites, connections, users, posts, notifications), so the owner and
--     the service role bypass every policy -- which is why the officer-removal
--     route needs no DELETE policy, and why the negative tests switch role
--     explicitly.
--   * No publication contains orgs, org_members, connections or notifications
--     (the only publication is supabase_realtime, 0 matching tables), so the
--     new tables join no replication stream by accident.
--   * pgcrypto is installed, so gen_random_uuid() is available (org_invites
--     already defaults on it).
--
-- RUNS ONCE. Not idempotent: CREATE TABLE / CREATE TRIGGER without IF NOT
-- EXISTS, plus a one-time backfill and a DO block that raises on a mismatch. A
-- second run fails on the first statement and the whole BEGIN/COMMIT rolls
-- back, changing nothing.
--
-- DEPLOY ORDER (extends M1c's). M2 FIRST -- this file is numbered 20260916120000
-- so it sorts AFTER 20260916110000_revoke_campus_label_writes.sql. If M1d ever
-- has to ship before M2, RENUMBER IT BELOW 20260916110000 or `supabase db push`
-- will replay the two out of order.
--   1. M1 applied 2026-09-15. DONE.        2. Wave 1 live. DONE.
--   3. M1c applied 2026-09-16. DONE.       4. Wave 2 + wave 2b (run A). DONE.
--   5. M2 (20260916110000_revoke_campus_label_writes.sql) -- APPLY FIRST.
--   6. THIS FILE, with the PRE-FLIGHT and POST-APPLY checks below. Applying it
--      here -- BEFORE any follow UI exists -- is deliberate: the triggers then
--      bake against run A's live join / accept / approve / leave paths for a
--      full wave with no user-visible surface, so a trigger bug shows up as a
--      stray row in a verify query instead of as a broken Join button.
--   7. Wave 3 (B12/B13/B14/B16/B19/B26) ships.
--   8. Follow batches F1-F5a, then F5b-F7 (spec §6).
--   9. feature-sentinel + security-sentinel.
--
-- WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY
--   * NOTHING in src/ reads or writes org_followers or org_follow_firsts. Both
--     tables are new; grep for 'org_followers' and 'org_follow_firsts' returns
--     this file only. The app must behave IDENTICALLY after apply -- that is
--     the smoke test in HOW TO APPLY step 4.
--   * The only existing object touched is org_members, which gains two AFTER
--     ROW triggers. Its inserters are all SERVICE ROLE after M1c
--     (orgs/route.ts:391 owner row; [slug]/join/route.ts:63 open-policy join;
--     requests/[id]/route.ts:88 approval; run A's invite-accept via
--     admitMember). `authenticated` holds no INSERT on the table (relacl has no
--     'a') and org_members_insert was dropped, so no client can reach the
--     INSERT trigger directly. DELETE is still granted to authenticated, so the
--     DELETE trigger IS reachable from a raw PostgREST delete under the USER
--     client -- and it is reachable for OTHER PEOPLE'S rows, not only the
--     caller's. org_members_delete is (VERIFIED LIVE, byte for byte)
--       ((role <> 'owner') AND ((user_id = auth.uid())
--        OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin']))))
--     so an owner/admin may delete any non-owner member row directly, with no
--     route, no rate limit and no Terms gate in front of it. The DELETE trigger
--     therefore drops THAT student's join-sourced follow, not the caller's.
--     That is not a new power: the officer could already evict the member, and
--     the trigger's reach is bounded to exactly (old.org_id, old.user_id,
--     source = 'join') -- the follow that membership itself minted. It cannot
--     touch a deliberate follow, another club's row, or any other user. But it
--     IS a second, unmetered path to the same effect as the officer-removal
--     route, so do not describe that route as the only way a follower row can
--     be removed by somebody other than its owner.
--   * The INSERT trigger's only failure modes are an FK violation on an
--     org_id/user_id that cannot be missing inside the same transaction, and a
--     unique violation, which `on conflict do nothing` swallows. It cannot fail
--     a join. It is AFTER INSERT so it never alters the member row.
--   * The DELETE trigger cannot fail a leave: a DELETE that matches no row is a
--     no-op, and it is AFTER DELETE so it never blocks the member row going.
--     On a CASCADE (org deleted, or user deleted) it fires once per member row
--     and deletes org_followers rows that the same cascade would have removed
--     anyway -- harmless duplicate work, no error, and at 7 member rows not
--     worth a pg_trigger_depth() hatch.
--   * OFFICER AND ADMIN REMOVALS ALSO DROP THE JOIN-SOURCED FOLLOW. A DELETE
--     trigger cannot tell "the student left" from "an officer removed them"
--     from "a platform admin removed them" -- they are the same row going away.
--     Stated as a decision rather than discovered later: a member who never
--     tapped Follow should not keep an auto-subscription after being removed,
--     and it gives officer removal a real effect on the feed. A DELIBERATE
--     follow (source <> 'join') still survives every one of those three, which
--     is precisely the gap critic C4 is about -- see the OFFICER REMOVAL
--     contract above.
--   * org_members has 7 rows, so the backfill and the ACCESS EXCLUSIVE locks
--     are milliseconds; lock_timeout 5s bounds the wait if a long reader is
--     open. CREATE TRIGGER takes SHARE ROW EXCLUSIVE on org_members, which
--     blocks concurrent writes to it for the duration of this transaction and
--     is why no concurrent join can interleave with the backfill.
--   * PostgREST picks up the new tables by itself (pgrst_ddl_watch). It will
--     expose org_followers to authenticated for SELECT under the policy, which
--     is intended, and org_follow_firsts to nobody, which is also intended.
--   * Rollback drops both tables, all three triggers and all three functions
--     and restores nothing else, because nothing else changed.
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   0. PRE-FLIGHT (read-only; the MCP execute_sql is fine). Stop if any of
--      these differs in a way you can't explain. Every expected value below was
--      RE-RUN LIVE 2026-09-16 while writing this file.
--      WHICH NUMBERS ARE EXACT AND WHICH DRIFT. The exact ones -- orgs 5, the
--      two to_regclass NULLs, 0 non-internal triggers on org_members -- are
--      assertions: a difference means somebody landed something this header has
--      not read, so STOP. The row counts marked "drifting" below move on their
--      own (a signup, a join through wave 2b run A's live routes, an unfollow),
--      and a moved value there is NOT a reason to stop -- it is a reason to
--      check that the explanation is ordinary growth.
--        SELECT (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest,
--               to_regclass('public.org_followers')::text     AS followers,   -- NULL
--               to_regclass('public.org_follow_firsts')::text AS firsts,      -- NULL
--               to_regclass('public.org_follows')::text       AS legacy,      -- NULL
--               (SELECT count(*) FROM public.orgs)            AS orgs,        -- 5  EXACT
--               (SELECT count(*) FROM public.org_members)     AS members,     -- 7, drifting (run A's join/accept/approve routes are live)
--               (SELECT count(*) FROM public.connections)     AS connections, -- 26, drifting BOTH ways (an unfollow deletes a row)
--               (SELECT count(*) FROM public.posts)           AS posts,       -- 21, drifting
--               (SELECT count(*) FROM public.users)           AS users;       -- 19, drifting up only (a signup is the only cause)
--        -- `latest` must be 20260916110000 (M2 applied, per DEPLOY ORDER
--        --  step 5). 20260916103000 means M2 has NOT been applied: apply M2
--        --  first, or renumber this file below it. Anything higher means
--        --  somebody landed a migration this header has not read.
--
--        -- the trigger slots must both be empty
--        SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--         WHERE c.oid = 'public.org_members'::regclass AND NOT t.tgisinternal;   -- 0
--
--        -- org_members must still have joined_at (the backfill + trigger read it)
--        SELECT attname FROM pg_attribute
--         WHERE attrelid = 'public.org_members'::regclass
--           AND attnum > 0 AND NOT attisdropped ORDER BY attnum;
--        -- expect id, org_id, user_id, role, joined_at
--
--        -- the helper the policy leans on must still be EXECUTE-granted to
--        -- authenticated and NOT to anon
--        SELECT prosecdef, provolatile, proacl::text FROM pg_proc
--         WHERE pronamespace = 'public'::regnamespace AND proname = 'org_member_role';
--        -- expect t, s, {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
--        -- orgs_select must be M1c's, unchanged (this file must not touch it)
--        SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
--         WHERE polrelid = 'public.orgs'::regclass AND polname = 'orgs_select';
--        -- expect ((is_public OR is_org_member(id, auth.uid()))
--        --         AND ((hidden_at IS NULL) OR is_org_member(id, auth.uid())))
--
--        -- the default ACLs that make the revokes below load-bearing
--        SELECT defaclobjtype::text, defaclacl::text FROM pg_default_acl d
--          JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname = 'public';
--        -- expect r -> {postgres,anon,authenticated,service_role}=arwdDxtm
--        --    and f -> {postgres,anon,authenticated,service_role}=X
--
--        -- the five orgs must all still exist (orgs_delete lets an owner
--        -- delete their own org, so re-check immediately before applying)
--        SELECT left(id::text,8) AS id8, handle, join_policy, (hidden_at IS NOT NULL) AS hidden
--          FROM public.orgs ORDER BY created_at;
--        -- expect f7ae4129 test-f7ae4129 open t / 6e881851 test-6e881851 request t /
--        --        923896fb sae invite f / a73bee3e test-a73bee3e request t /
--        --        6ca4ec6e test-6ca4ec6e open t
--   1. Apply. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use curl,
--      not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260916120000_org_followers.sql '{query:$q}')"
--      `[]` means success. A JSON error means NOTHING was applied (single
--      transaction). "canceling statement due to lock timeout" means a long
--      reader held a lock: nothing changed, retry in a minute.
--   2. Record it so `db push` stays in sync. Send the same way: save to a
--      scratch .sql file and point --rawfile at it. No statements array,
--      because this file contains dollar-quoted function bodies:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260916120000', 'org_followers');
--   3. POST-APPLY VERIFY (read-only). Use pg_catalog and has_*_privilege, not
--      information_schema: the MCP role (supabase_read_only_user) sees 0 rows
--      in information_schema.column_privileges for these tables.
--      a. shape -- 6 columns; org_id/user_id/created_at/first_followed_at/source
--         all NOT NULL
--         SELECT attname, format_type(atttypid, atttypmod), attnotnull
--           FROM pg_attribute WHERE attrelid='public.org_followers'::regclass
--            AND attnum > 0 AND NOT attisdropped ORDER BY attnum;
--         -- expect id uuid t | org_id uuid t | user_id uuid t |
--         --        created_at timestamptz t | first_followed_at timestamptz t |
--         --        source text t
--         SELECT attname, attnotnull FROM pg_attribute
--          WHERE attrelid='public.org_follow_firsts'::regclass
--            AND attnum > 0 AND NOT attisdropped ORDER BY attnum;
--         -- expect org_id t | user_id t | first_followed_at t
--      b. constraints, all NAMED
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conrelid='public.org_followers'::regclass ORDER BY 1;
--         -- expect org_followers_org_id_fkey  (ON DELETE CASCADE),
--         --        org_followers_org_user_key (UNIQUE (org_id, user_id)),
--         --        org_followers_pkey,
--         --        org_followers_source_check (join/profile/discover/onboarding),
--         --        org_followers_user_id_fkey (ON DELETE CASCADE)
--         -- NO org_followers_check: the CHECK is NAMED so a 23514 maps by name
--         --   instead of by positional numbering that shifts the day anyone
--         --   adds another table CHECK (M1c critic B1's rule).
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conrelid='public.org_follow_firsts'::regclass ORDER BY 1;
--         -- expect org_follow_firsts_org_id_fkey (CASCADE),
--         --        org_follow_firsts_pkey (PRIMARY KEY (org_id, user_id)),
--         --        org_follow_firsts_user_id_fkey (CASCADE)
--      c. grants -- the whole point of the M1c posture, and critic C4's answer
--         SELECT has_table_privilege('authenticated','public.org_followers','SELECT') AS a_sel, -- t
--                has_table_privilege('authenticated','public.org_followers','INSERT') AS a_ins, -- f
--                has_table_privilege('authenticated','public.org_followers','UPDATE') AS a_upd, -- f
--                has_table_privilege('authenticated','public.org_followers','DELETE') AS a_del, -- f
--                has_table_privilege('anon','public.org_followers','SELECT')          AS n_sel, -- f
--                has_table_privilege('service_role','public.org_followers','INSERT')  AS s_ins, -- t
--                has_table_privilege('service_role','public.org_followers','DELETE')  AS s_del, -- t
--                has_table_privilege('authenticated','public.org_follow_firsts','SELECT') AS f_sel, -- f
--                has_table_privilege('anon','public.org_follow_firsts','SELECT')          AS f_anon,-- f
--                has_table_privilege('service_role','public.org_follow_firsts','SELECT')  AS f_svc; -- t
--      d. exactly one policy, and it is not `true`
--         SELECT policyname, cmd, qual FROM pg_policies
--          WHERE schemaname='public' AND tablename IN ('org_followers','org_follow_firsts')
--          ORDER BY 1;
--         -- expect ONE row: org_followers_select | SELECT | qual naming
--         --   auth.uid() and org_member_role(...) = ANY ('{owner,admin}').
--         --   NO insert/update/delete policy, and NOTHING on org_follow_firsts.
--         SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--          WHERE relnamespace='public'::regnamespace
--            AND relname IN ('org_followers','org_follow_firsts') ORDER BY 1;
--         -- expect both t f  (RLS on, not forced -- the service role bypasses,
--         --   which is what every write path and every count read relies on)
--      e. indexes (critics C5 + C6)
--         SELECT indexname, indexdef FROM pg_indexes
--          WHERE schemaname='public' AND tablename='org_followers' ORDER BY 1;
--         -- expect exactly 4:
--         --   org_followers_org_first_followed  (org_id, first_followed_at DESC, id DESC)
--         --   org_followers_org_user_key        UNIQUE (org_id, user_id)
--         --   org_followers_pkey                (id)
--         --   org_followers_user_created        (user_id, created_at DESC, id DESC)
--      f. triggers + functions
--         SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
--           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--          WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
--            AND c.relname IN ('org_members','org_followers','org_follow_firsts')
--          ORDER BY 1,2;
--         -- expect exactly 3 rows, all tgenabled = O:
--         --   org_followers | org_followers_stamp_first     | BEFORE INSERT ... FOR EACH ROW
--         --   org_members   | org_members_imply_follow      | AFTER INSERT  ... FOR EACH ROW
--         --   org_members   | org_members_unfollow_on_leave | AFTER DELETE  ... FOR EACH ROW
--         SELECT proname, prosecdef, proconfig::text, proacl::text FROM pg_proc
--          WHERE pronamespace='public'::regnamespace
--            AND proname IN ('org_followers_stamp_first','org_members_imply_follow',
--                            'org_members_unfollow_on_leave') ORDER BY 1;
--         -- expect all three: prosecdef t, proconfig {search_path=public},
--         --   and proacl with NO anon and NO authenticated (critic C22) --
--         --   {postgres=X/postgres,service_role=X/postgres}
--      g. backfill parity
--         SELECT (SELECT count(*) FROM public.org_members)      AS members,     -- 7 at time of writing, drifting; the PARITY below is the assertion
--                (SELECT count(*) FROM public.org_followers)    AS followers,   -- equal to members
--                (SELECT count(*) FROM public.org_follow_firsts) AS firsts,     -- equal to followers
--                (SELECT count(*) FROM public.org_followers WHERE source <> 'join') AS not_join, -- 0
--                (SELECT count(*) FROM public.org_members om
--                  WHERE NOT EXISTS (SELECT 1 FROM public.org_followers f
--                                     WHERE f.org_id=om.org_id AND f.user_id=om.user_id)) AS missing; -- 0
--         -- created_at came from joined_at, not from now(): the spread must be
--         -- the MEMBER spread, which is the whole point of critic C5's fix.
--         -- Expressed RELATIVELY, against org_members, for the same reason the
--         -- parity check above is: one join through run A's live routes between
--         -- now and apply moves all three numbers, and a hardcoded 7 /
--         -- 2026-05-06 / 2026-05-12 would make ordinary growth indistinguishable
--         -- from a real backfill failure. All four columns must read t.
--         SELECT count(DISTINCT f.created_at)
--                  = (SELECT count(DISTINCT joined_at) FROM public.org_members) AS spread_ok,
--                min(f.created_at)
--                  = (SELECT min(joined_at) FROM public.org_members)            AS earliest_ok,
--                max(f.created_at)
--                  = (SELECT max(joined_at) FROM public.org_members)            AS latest_ok,
--                count(*) FILTER (WHERE f.first_followed_at <> f.created_at) = 0 AS no_drift
--           FROM public.org_followers f;
--         -- (At time of writing that is 7 distinct values spanning
--         --  2026-05-06 06:24:44.908587+00 .. 2026-05-12 22:02:12.371512+00.
--         --  Quoted as context, NOT as the expected value.)
--         -- Most of them belong to hidden orgs, by design (rows survive
--         -- hiding). Relative again: it must equal the member count on hidden
--         -- orgs, whatever that is by apply time (6 of 7 at time of writing).
--         SELECT (SELECT count(*) FROM public.org_followers f
--                   JOIN public.orgs o ON o.id = f.org_id WHERE o.hidden_at IS NOT NULL)
--              = (SELECT count(*) FROM public.org_members m
--                   JOIN public.orgs o ON o.id = m.org_id WHERE o.hidden_at IS NOT NULL)
--             AS hidden_ok;   -- t
--      h. nothing else moved
--         SELECT (SELECT count(*) FROM public.connections) AS connections,  -- 26, drifting; must match what PRE-FLIGHT saw minutes ago
--                (SELECT count(*) FROM public.orgs)        AS orgs,         -- 5, EXACT
--                (SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
--                  WHERE polrelid='public.orgs'::regclass AND polname='orgs_select') AS orgs_select,
--                (SELECT pg_get_constraintdef(oid) FROM pg_constraint
--                  WHERE conrelid='public.notifications'::regclass
--                    AND conname='notifications_type_check') AS notif_types;
--         -- orgs_select UNCHANGED from M1c (the contract above);
--         -- notif_types UNCHANGED -- no 'org_follow' (Franky answer 4)
--      i. recorded
--         SELECT max(version) FROM supabase_migrations.schema_migrations;  -- 20260916120000
--   4. Live smoke (old code -- no follow UI is shipped yet, so the app MUST
--      look identical).
--      - Open /campus, the phone Orgs tab, /orgs/sae as a non-member, and the
--        chat rail. Every one behaves exactly as before.
--        `grep -rn "org_followers\|org_follow_firsts" src/` returns nothing.
--      - Join an open club from the phone -> the join still succeeds (the
--        trigger runs inside its transaction) and
--          SELECT * FROM org_followers WHERE source='join' ORDER BY created_at DESC LIMIT 1;
--        shows a fresh row whose created_at equals the new org_members.joined_at.
--      - LEAVE that club -> the org_members row goes AND the org_followers row
--        goes with it, because its source is 'join' (Franky answer 2). The
--        org_follow_firsts row STAYS. Confirm all three:
--          SELECT count(*) FROM org_members       WHERE org_id=? AND user_id=?;  -- 0
--          SELECT count(*) FROM org_followers     WHERE org_id=? AND user_id=?;  -- 0
--          SELECT count(*) FROM org_follow_firsts WHERE org_id=? AND user_id=?;  -- 1
--        That last row is what makes a later re-follow keep its original
--        first_followed_at (critic C15).
--   5. Negative tests: run m1d-tests/negative-tests.sql from the session
--      scratchpad on a Supabase BRANCH or local stack. NEVER on prod.
--
-- ROLLBACK. Roll back the follow batches (F1-F7) FIRST if they are live: they
-- read and write these tables. THIS LOSES EVERY FOLLOW ROW, including the
-- membership backfill and every first_followed_at -- but not membership itself,
-- and re-applying M1d re-derives every 'join' row (and its created_at) from
-- org_members.joined_at. Only deliberate Follow taps, and the first-follow
-- dates of students who had unfollowed, are unrecoverable.
-- org_members returns to ZERO non-internal triggers, matching its pre-M1d state
-- exactly. Nothing is added to orgs, posts, notifications or connections by
-- this file, so there is nothing else to restore.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DROP TRIGGER IF EXISTS org_members_unfollow_on_leave ON public.org_members;
--   DROP TRIGGER IF EXISTS org_members_imply_follow      ON public.org_members;
--   DROP TRIGGER IF EXISTS org_followers_stamp_first     ON public.org_followers;
--   DROP FUNCTION IF EXISTS public.org_members_unfollow_on_leave();
--   DROP FUNCTION IF EXISTS public.org_members_imply_follow();
--   DROP FUNCTION IF EXISTS public.org_followers_stamp_first();
--   DROP POLICY IF EXISTS org_followers_select ON public.org_followers;
--   DROP TABLE IF EXISTS public.org_followers;      -- cascades its indexes + constraints
--   DROP TABLE IF EXISTS public.org_follow_firsts;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916120000';
--   COMMIT;

begin;

-- Fail fast instead of queueing every org_members write behind M1d.
set local lock_timeout = '5s';

-- 1. durable first-follow memory (critic C15) --------------------------------
-- Unfollow is a hard DELETE from org_followers, so without this table a
-- student could unfollow and refollow to re-stamp created_at, pinning
-- themselves to the top of every officer's invite sheet and re-rolling their
-- "Follows since Mar 4" line at will. POST and DELETE /follow are both cheap
-- and idempotent inside one 60/600s budget, so that is a two-request attack.
-- This table is never deleted from by the application. It is the reason
-- org_followers.first_followed_at is unrollable, and it is the reason an
-- officer's removal of a follower stays LEGIBLE if that person follows again.
create table public.org_follow_firsts (
  org_id            uuid not null references public.orgs(id)  on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  first_followed_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

comment on table public.org_follow_firsts is
  'The first time a user ever followed an org, kept across unfollow/refollow cycles. Written only by trigger org_followers_stamp_first, never deleted by the app, and read by NOBODY outside the database: it has no grant and no policy. Its whole job is to make org_followers.first_followed_at a value the follower cannot re-roll (critic C15), which is what lets the officer follower list and the invite sheet sort on something an attacker does not control. It cascades away with the org or the user, so it retains nothing past the lifetime of either.';
comment on column public.org_follow_firsts.first_followed_at is
  'Monotonically non-increasing: the stamp trigger writes least(existing, incoming), so a clock skew, a replay or a re-run can only move this EARLIER, never later.';

alter table public.org_follow_firsts enable row level security;

-- pg_default_acl auto-grants arwdDxtm on every new public table to anon AND
-- authenticated (verified live -- see LIVE STATE). Take it all back and grant
-- NOTHING: no route reads this table, and RLS with zero policies is the second
-- lock behind the missing grant.
revoke all on table public.org_follow_firsts from anon, authenticated;

-- 2. the follow graph ---------------------------------------------------------
create table public.org_followers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id)  on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  -- Overwritten by org_followers_stamp_first on every INSERT. The default is
  -- belt and braces so the column can never be null if the trigger is ever
  -- disabled during maintenance.
  first_followed_at timestamptz not null default now(),
  source            text not null default 'profile'
                    -- NAMED ON PURPOSE (M1c critic B1's rule): a writer bug
                    -- must map to a 500 by CONSTRAINT NAME, not by positional
                    -- org_followers_check numbering that shifts the day
                    -- anybody adds another table CHECK.
                    constraint org_followers_source_check
                    check (source in ('join','profile','discover','onboarding')),
  constraint org_followers_org_user_key unique (org_id, user_id)
);

comment on table public.org_followers is
  'FOLLOWING an org: open to any student who can see it, Instagram-style. Distinct from org_members, which is MEMBERSHIP and is the only thing that unlocks chat channels. Invariant member => follower, kept by trigger org_members_imply_follow on INSERT and by DELETE /api/orgs/[slug]/follow refusing members (409 member_follows). Unfollowing never removes membership. LEAVING (or being removed) deletes the follow ONLY when source = ''join'' -- a follow the student tapped survives, one the join trigger minted does not (Franky 2026-09-16, trigger org_members_unfollow_on_leave). That rule READS symmetric and is not: under the specced routes a ''join'' row can never be upgraded to a deliberate one, so a student who joined before following always loses the subscription on leaving. See the org_members_imply_follow function comment. Service role writes only -- authenticated has SELECT under org_followers_select and nothing else, including no DELETE: an officer removing a follower goes through a service-role route gated on owner/admin.';
comment on column public.org_followers.source is
  'Which surface the follow came from. ''join'' rows are written by the membership trigger, not by a student tapping Follow, so an officer can tell an AUDIENCE from a ROSTER in the followers list and the invite sheet -- and so the leave trigger knows which follows the student never chose. NAMED CHECK so a writer bug maps by constraint name. TRIMMED to the four surfaces that actually ship a Follow control (critic C24): profile = the org page, discover = the campus Orgs tab on both viewports, onboarding = step 5, join = the trigger. The map and search surfaces have no control and suggested-clubs is an unbuilt route, so their values are gone; adding one back is one ALTER ... DROP/ADD CONSTRAINT. Routes validate the client-supplied value against this list in TypeScript and fall back to ''profile'' -- a bad client value must never reach the CHECK as a 23514.';
comment on column public.org_followers.created_at is
  'When the CURRENT follow row was made. Re-stamped by an unfollow/refollow cycle, so it is the sort key for the STUDENT''s own "clubs I follow, newest first" and must NOT be the sort key for anything an officer sees. Backfilled from org_members.joined_at, not now(), so the backfilled set carries the real member spread instead of one transaction timestamp. ONLY org_members_imply_follow and M1d''s own backfill may SUPPLY this column. Every route inserts {org_id, user_id, source} and lets the default stand -- a client-controlled timestamp flows through org_followers_stamp_first into org_follow_firsts via least(), and because least() is monotone-EARLIER-only, one backdated insert permanently lowers first_followed_at (the officer sort key and the "Follows since {Mon D}" line) and no later write can raise it again without a manual service-role UPDATE of org_follow_firsts. C15''s threat model only covered re-stamping LATER; this is the other direction and it is the one the design cannot undo. `source` is already a client-supplied field validated in TypeScript, so "add a followed_at parameter" for an import or a migrate-from-Instagram feature is a plausible next step -- do not take it without re-reading this line.';
comment on column public.org_followers.first_followed_at is
  'The first time this student EVER followed this club, carried across unfollow/refollow by public.org_follow_firsts and never reset by a DELETE. THIS is the officer-facing sort key and the "Follows since {Mon D}" line: ORDER BY first_followed_at DESC, id DESC, cursor on BOTH columns (critic C5 -- the single-column keyset drops or loops a tie group). If the student joined first and followed later, this is the join date: it means "first relationship with this club", and the source column is what separates audience from roster.';

-- Indexes. The UNIQUE (org_id, user_id) already serves the existence check and
-- the ON CONFLICT; these two serve the only two list reads the feature has.
-- The OFFICER list and the invite sheet's default list: where org_id = ?
-- order by first_followed_at desc, id desc. Critic C6 asked for
-- (org_id, created_at desc, id desc); critic C15 then moved the officer sort
-- OFF created_at, because created_at is attacker-rollable. An index on the
-- column nobody sorts by would serve nothing, so this is C6's index built
-- against C15's sort key. If an officer view ever wants "who followed this
-- week" on created_at, add that index with that view -- not now, at 0 rows.
create index org_followers_org_first_followed
  on public.org_followers (org_id, first_followed_at desc, id desc);

-- The STUDENT's own list: "clubs I follow", newest first, and the feed
-- prelude. created_at is right here -- it is the student's own row and their
-- own recency -- and id desc is C5's tiebreaker again.
create index org_followers_user_created
  on public.org_followers (user_id, created_at desc, id desc);

-- 3. grants + RLS: M1c's posture, verbatim ------------------------------------
alter table public.org_followers enable row level security;

-- pg_default_acl auto-grants arwdDxtm on every new public table to anon AND
-- authenticated (verified live, see LIVE STATE). Take it all back first: the
-- revoke is not decoration, it is the only thing stopping a signed-in client
-- from INSERTing and DELETEing follow rows straight through PostgREST,
-- skipping the rate limit, the Terms gate and the hidden_at check.
revoke all on table public.org_followers from anon, authenticated;
grant select on table public.org_followers to authenticated;

-- The row's own student (this is what drives the "Following" chip under the
-- user client) OR the club's owner/admin (Franky answer 3: officers may read
-- the follower list -- the club's own audience metric, and the invite sheet's
-- default list). Deliberately NOT `using (true)`: see CHANGES item 3.
-- Counts are read by the SERVICE role, so the narrow policy costs the product
-- nothing -- but it does mean a follower_count read under the USER client
-- silently returns 1-or-0. See THE COUNTS RULE in the header.
create policy org_followers_select on public.org_followers
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.org_member_role(org_id, auth.uid()) in ('owner','admin')
  );
-- No INSERT / UPDATE / DELETE policy, and no grant to match. Every write goes
-- through a service-role route that has already checked rate limit, Terms,
-- existence and hidden_at -- including the officer's "remove this follower"
-- DELETE, which authorises in TypeScript against org_member_role and then
-- writes with the service client. See the OFFICER REMOVAL contract in the
-- header for why that is not a DELETE policy.

-- 4. first_followed_at is unrollable (critic C15) -----------------------------
-- ONE NON-OBVIOUS SIDE EFFECT, ANALYSED RATHER THAN LEFT TO BE DISCOVERED.
-- A BEFORE INSERT trigger fires BEFORE the ON CONFLICT arbiter runs, so on an
-- `insert ... on conflict (org_id, user_id) do nothing` that ends up discarding
-- the row -- which is exactly what org_members_imply_follow does for a student
-- who ALREADY follows the club -- this function has still run and still touched
-- org_follow_firsts. That is benign in every reachable case, and it is benign
-- because of least(), not by luck:
--   * The pair already has a firsts row (any org_followers row that ever
--     existed created one), so no orphan is minted.
--   * The incoming value is the new org_members.joined_at. If they followed
--     first, joined_at is the LATER value and least() discards it: unchanged.
--   * If joined_at is somehow EARLIER than the stored first follow, least()
--     moves the stored value earlier -- which is more truthful, not less: the
--     student's first relationship with that club really did start then.
--   * THE DIVERGENCE CASE, which is the one this list used to miss. On that
--     same earlier-value path, if the OUTER insert is then discarded by
--     `on conflict do nothing`, the two stores disagree: org_follow_firsts has
--     moved earlier but the surviving org_followers row keeps its LATER
--     first_followed_at, so the officer-facing date silently jumps backwards at
--     the next unfollow/refollow. It is reachable ONLY through an org_members
--     INSERT carrying a BACKDATED joined_at, and nothing in src/ does that today
--     (every membership insert passes {org_id, user_id, role} and lets the
--     default stand -- verified). But a historical-member import is exactly the
--     script that would. ANY future import that writes a backdated joined_at
--     must re-sync org_followers.first_followed_at from org_follow_firsts in the
--     SAME transaction.
-- So the write is idempotent and monotone in the only direction that cannot
-- lie to an officer. It can never move first_followed_at LATER, which is the
-- entire property critic C15 needs.
create or replace function public.org_followers_stamp_first() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_first timestamptz;
begin
  -- DO UPDATE rather than DO NOTHING so RETURNING always fires and always
  -- hands back the row that now exists. least() makes the write idempotent and
  -- monotone: the stored value can only move earlier, never later, so an
  -- unfollow/refollow cycle returns the ORIGINAL date.
  insert into public.org_follow_firsts as f (org_id, user_id, first_followed_at)
  values (new.org_id, new.user_id, coalesce(new.created_at, now()))
  on conflict (org_id, user_id) do update
     set first_followed_at = least(f.first_followed_at, excluded.first_followed_at)
  returning f.first_followed_at into v_first;
  -- Via a local variable, not RETURNING ... INTO new.first_followed_at
  -- directly: assigning a NEW field from INTO is a plpgsql grammar corner this
  -- migration cannot test locally (no Postgres on the build machine), and a
  -- once-only production migration should not be the place to find out. The
  -- coalesce is the same reasoning -- first_followed_at is NOT NULL, and
  -- nothing here may ever hand it a null.
  new.first_followed_at := coalesce(v_first, new.created_at, now());
  return new;
end $fn$;

comment on function public.org_followers_stamp_first() is
  'BEFORE INSERT on org_followers: sets first_followed_at from the durable org_follow_firsts memory so an unfollow/refollow cycle cannot re-stamp it (critic C15). Must stay BEFORE INSERT -- an AFTER trigger cannot write NEW, and a route-side stamp would be one more thing a parallel batch can forget.';

revoke all on function public.org_followers_stamp_first() from public, anon, authenticated;

create trigger org_followers_stamp_first
  before insert on public.org_followers
  for each row execute function public.org_followers_stamp_first();

-- 5. membership implies following ---------------------------------------------
create or replace function public.org_members_imply_follow() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.org_followers (org_id, user_id, source, created_at)
  values (new.org_id, new.user_id, 'join', coalesce(new.joined_at, now()))
  on conflict (org_id, user_id) do nothing;   -- already following: keep their original source
  return new;                                  -- ignored: AFTER ROW trigger
end $fn$;

comment on function public.org_members_imply_follow() is
  'A member who does not see their club''s posts is a bug. This is a trigger and not a call inside admitMember() because admitMember is not the only inserter (orgs/route.ts:391 writes the owner row on club creation, and admin/orgs/** writes directly) and a forgotten call would be SILENT: the student joins, the feed stays empty, nothing errors. on conflict do nothing preserves the original source, so a deliberate Follow that later became a membership still reads as ''profile'' -- and therefore still survives leaving. DECISION, not a side effect (critic C26): this fires for an ADMIN-ADDED member too, so a platform admin adding somebody to a club subscribes them to its posts with no action of their own. That is the member => follower invariant applied evenly; the student can unfollow, because their row is source ''join'' only until they touch it and leaving removes it anyway. ASYMMETRY THE FOLLOW BATCHES MUST KNOW ABOUT: under the specced routes a ''join'' row can NEVER become deliberate. A student who joins BEFORE following gets source ''join''; the UI then offers a member no Follow control at all (spec §5.0 row 1 is "Joined ✓"), and a raw POST /follow hits the 23505 and returns already:true without touching source. So "a follow the student tapped survives" is unreachable for everyone who joined first -- leaving silently drops their feed subscription with no opportunity to have opted in. That is the correct DEFAULT per Franky answer 2, but it is not the symmetric rule the org_followers table comment reads like. If Franky wants the ex-member to keep the posts, the F batches pick one: upgrade source on an explicit Follow (on conflict do update set source = excluded.source where org_followers.source = ''join''), or offer Follow inside the leave confirmation.';

revoke all on function public.org_members_imply_follow() from public, anon, authenticated;

create trigger org_members_imply_follow
  after insert on public.org_members
  for each row execute function public.org_members_imply_follow();

-- 6. leaving removes the follow it minted, and only that one ------------------
-- FRANKY, 2026-09-16, settled. This OVERRIDES spec §2.4's "leave leaves the
-- follow behind" row and is critic C7's fix. The asymmetry is the point: a row
-- the student TAPPED is theirs to keep, a row the join trigger MINTED is not
-- something they ever chose, and leaving a club while silently keeping its
-- posts forever is the surprising default.
create or replace function public.org_members_unfollow_on_leave() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.org_followers
   where org_id  = old.org_id
     and user_id = old.user_id
     and source  = 'join';
  return old;                                  -- ignored: AFTER ROW trigger
end $fn$;

comment on function public.org_members_unfollow_on_leave() is
  'AFTER DELETE on org_members: drops the follow row ONLY when source = ''join'', i.e. only when the membership trigger minted it. A follow the student tapped (profile/discover/onboarding) survives leaving, so an ex-member who wants the club''s public posts keeps them -- that half of spec §2.4 still holds. A trigger and not route code for the same reason the INSERT side is: org_members is deleted by self-leave, by an officer removing a member, and by admin/orgs/**, and a rule written into one of the three silently does not hold in the other two. CONSEQUENCE, stated rather than discovered: a DELETE trigger cannot tell leaving from being removed, so an officer or admin removal also drops the join-sourced follow. That is wanted -- a removed member should not keep an auto-subscription -- but note that a DELIBERATE follow survives removal, which is exactly the gap critic C4 is about. Cannot fail a leave: a DELETE matching no row is a no-op, and AFTER DELETE never blocks the member row.';

revoke all on function public.org_members_unfollow_on_leave() from public, anon, authenticated;

create trigger org_members_unfollow_on_leave
  after delete on public.org_members
  for each row execute function public.org_members_unfollow_on_leave();

-- 7. backfill: every existing member follows their club -----------------------
-- created_at comes from org_members.joined_at, NOT now(). Critic C5's tie
-- problem is created by backfilling one transaction timestamp onto every row;
-- joined_at is the real date, all 7 live values are distinct, and it makes the
-- backfilled rows sort meaningfully on day one. The stamp trigger then derives
-- first_followed_at from the same value.
insert into public.org_followers (org_id, user_id, source, created_at)
select om.org_id, om.user_id, 'join', om.joined_at
  from public.org_members om
on conflict (org_id, user_id) do nothing;

-- Assert PARITY, not a hardcoded 7: wave 2b run A's routes are live by the time
-- this applies and the member count will have moved.
-- The spec draft also asserted `n_follow <> n_member`. DROPPED (critic C23): it
-- cannot fire. CREATE TABLE runs in this same transaction, so the table starts
-- empty, and CREATE TRIGGER takes SHARE ROW EXCLUSIVE on org_members so no
-- concurrent INSERT can interleave. It described a state the statement order
-- had already made impossible. The firsts-parity check below REPLACES it and
-- is genuinely reachable: if org_followers_stamp_first were mis-created or
-- mis-ordered, the two counts would diverge and the backfill would have
-- produced follow rows with no durable first-follow memory behind them.
do $$
declare n_member int; n_follow int; n_firsts int; n_missing int;
begin
  select count(*) into n_member  from public.org_members;
  select count(*) into n_follow  from public.org_followers;
  select count(*) into n_firsts  from public.org_follow_firsts;
  select count(*) into n_missing
    from public.org_members om
   where not exists (
     select 1 from public.org_followers f
      where f.org_id = om.org_id and f.user_id = om.user_id
   );
  if n_missing <> 0 then
    raise exception 'M1d backfill: % org_members rows have no follower row', n_missing;
  end if;
  if n_firsts <> n_follow then
    raise exception 'M1d backfill: % follower rows but % first-follow rows -- org_followers_stamp_first did not fire on every insert', n_follow, n_firsts;
  end if;
  raise notice 'M1d backfill: % members -> % followers, % first-follow rows', n_member, n_follow, n_firsts;
end $$;

commit;
