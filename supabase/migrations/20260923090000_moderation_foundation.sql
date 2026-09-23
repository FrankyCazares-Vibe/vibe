-- Moderation v1 / batch A: the database side of reports, removed content and
-- restricted accounts.
--
-- WHY THIS EXISTS. Vibe can be reported to but not moderated. `reports` has no
-- status, nobody reads it, and there is no way to take a post down or stop an
-- account. Three things have to exist in the database before any screen or
-- route can be honest about them:
--   * a report that can be closed, with the reported thing captured at report
--     time, so an admin sees what was reported and not what has since been
--     edited;
--   * a removal that keeps the row as evidence and shows its author why, and
--     hides it from everyone else;
--   * a restriction that outlives the account it was put on, so deleting and
--     re-signing-up does not undo a ban.
--
-- And `reports` itself is a hole. relacl says anon AND authenticated both hold
-- arwdDxtm on it: full INSERT, SELECT, UPDATE and DELETE. Row level security
-- with a single INSERT policy is the only thing standing between a student and
-- every report ever filed, so the day anyone adds a SELECT policy the whole
-- inbox opens. The report route's rate limit and Terms gate are skippable the
-- same way the notification and like writes were (20260922120000): the browser
-- holds the anon key, so a signed-in student can POST /rest/v1/reports as often
-- as they like. This file takes the table away from the client entirely; the
-- rewritten route inserts with the service role.
--
-- TWO LAYERS, AND WHAT EACH ONE IS ACTUALLY FOR. Say it plainly, because the
-- policy changes below look like more protection than they are:
--   * The ROUTE GATES (batches C, D, E) are the live boundary for the app's own
--     traffic. Profile writes (src/app/api/me/profile/route.ts:323-326,
--     src/app/api/me/profile-sync/route.ts:679), channel and DM creation
--     (src/app/api/me/threads/route.ts:257-261 and :332) and the rewritten
--     report route all write with createSupabaseServiceClient(), where RLS does
--     not apply at all. `users_update_self AND NOT is_restricted_now()` never
--     fires on the app's own path. It is not dead, it is just not the gate.
--   * The POLICY ANDs below are defence against a direct PostgREST call with
--     the anon key — the attack this project already documented in
--     supabase/migrations/20260922140000_hidden_club_content_rls.sql:6-22 — and
--     they are the ONLY thing covering the session a restricted student is
--     already holding, and that is not a short window any more. Franky decided
--     on 2026-09-22 that A BAN DOES NOT STOP SIGN-IN: GoTrue's own
--     `ban_duration` is never set, for a ban or a suspension
--     (src/lib/moderation/actions.ts:33-43), because a banned student has to be
--     able to sign in, read what happened, write to the appeal address and
--     delete their own account and data. Nobody is signed out either. So their
--     token keeps working for as long as they keep it, and these policies are
--     not covering an hour — they are the permanent floor under the proxy's
--     app_metadata check and the route gates in src/lib/moderation/access.ts.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
--   1. Three policy helpers, all STABLE SECURITY DEFINER, all granted to anon,
--      authenticated and service_role and refusing inside (standing rule,
--      handoffs/wave-plan-week1/rulings.md):
--        public.is_restricted_now()   -- auth.uid() has a restriction in force
--        public.can_publish_now()     -- Terms + age + school_verified + not restricted
--        public.user_visible(uid)     -- that account is not restricted right now
--   2. `reports` grows a life cycle: status ('open'|'actioned'|'dismissed'),
--      resolved_by / resolved_at / resolution_note, target_owner_id,
--      target_snapshot (what was reported, captured then) and admin_alerted_at.
--      target_type widens from user/post/message/channel to add comment, org and
--      event. One open report per person per thing (unique partial index).
--   3. `reports` stops being client-writable: policy reports_insert_authenticated
--      is dropped and ALL privileges are revoked from anon and authenticated.
--   4. `moderation_actions`: one row per thing a moderator did. RLS on, no
--      policies, no client grants, SELECT and INSERT only for the service role,
--      and a BEFORE UPDATE OR DELETE trigger that refuses. Append-only means
--      append-only, for the service role too — by grant and by trigger.
--   5. `account_restrictions`: suspensions and bans, keyed on identity_key (an
--      HMAC of the canonical school email) as well as user_id, so a restriction
--      survives the account being deleted. Service role only.
--   6. removed_at / removed_by / removed_reason on posts, post_comments and
--      messages, and the SELECT policies that go with them: the author still
--      sees their own removed row (so the client can show "Removed by Vibe
--      moderators" and the reason); nobody else sees it at all.
--   7. The same for restricted people: posts, comments and the users row of a
--      restricted student stop coming back to anyone but themselves.
--   8. can_publish_now() ANDed into the write policies of posts, post_comments,
--      post_reposts, messages, channels and events — events on INSERT and on
--      UPDATE both, because editing an event is publishing it again; NOT
--      is_restricted_now() into users_update_self, rsvps, connections, the club
--      writes a restricted officer must not reach (orgs, org_members,
--      org_channel_members), the delete of a club's event and
--      message_reactions. events also learns WHO an event is for: org_id is
--      writable by any authenticated caller, so both events write policies now
--      ask org_member_role() the question the route has always asked. Section
--      11b carries the whole sweep of every table a student can write through
--      PostgREST, with the reason beside each one that is deliberately left
--      open.
--   9. post_engagement_counts, comment_like_counts and record_post_view keep
--      their own copy of the visibility rule in SQL, so each one gains the same
--      removed / user_visible clause. Without this a removed post keeps its
--      like and repost counts and keeps counting views.
--  10. email_sends learns a third kind, 'moderation_alert'. The admin alert
--      (src/lib/moderation/alerts.ts:44) logs its send under that name, and
--      email_sends_kind_check allows only 'school_verification' and
--      'password_reset' (20260922104000_email_sends.sql:146), so today every
--      alert's log row is refused: the email goes out and nothing records that
--      it did. The constraint is dropped and recreated by name with the third
--      kind added; nothing else about that table moves.
--  11. THE WORD FILTER STOPS BEING BYPASSABLE. Six free-text profile columns
--      on `users` — name, bio, tagline, headline, location_text, major — lose
--      UPDATE for `authenticated`. Verified live before this file was written:
--      an ordinary student PATCHed /rest/v1/users?id=eq.<self> with their own
--      token and stored headline='Campus tr4nny guy', 204. The filter runs in
--      the route, and the route was never the only door. Every writer of these
--      six is the SERVICE role already (the walk is in MEASURED), so the
--      revoke costs the app nothing and makes the filter the real boundary —
--      the same move, on the same table, as
--      20260922130000_users_profile_detail_server_only.sql.
--  12. AND AN EVENT'S TEXT STOPS BEING REWRITABLE PAST IT. Same probe, same
--      answer: PATCH /rest/v1/events?id=eq.<id> as the creator set
--      title='tr4nny Kickoff', 200. There is no event edit route in the app at
--      all (src/app/api/events/[id]/ holds attendees, ics and rsvp, and
--      nothing in src/ or public/ updates events), so title, description and
--      location lose UPDATE for `authenticated` too. The mechanics differ from
--      item 11 and the difference matters: events grants UPDATE at TABLE level,
--      where a column REVOKE is a silent no-op, so the table grant is taken
--      back and the six columns that are NOT text are granted by name in its
--      place. events_update_creator stays exactly as section 11b writes it.
--      The day an edit route exists it must write with the service role and
--      run the filter, exactly like the profile routes — or re-grant these
--      three deliberately, in a migration that says why.
--  13. THE APPEND-ONLY LOG CARRIES NO FOREIGN KEY. moderation_actions.actor_id
--      and .report_id are plain uuid, not references. An FK with ON DELETE SET
--      NULL is a cascading UPDATE, the append-only trigger refuses every
--      UPDATE with 42501, and the two together mean a platform admin who had
--      ever moderated anything could not delete their own account: the whole
--      deletion failed. billing_events.user_id already makes this exact choice
--      for the same reason, and target_id in this file's own section 2 already
--      says it in so many words. The log outlives what it points at.
--
-- THE ONE THAT WILL SURPRISE SOMEBODY. post_comments_select_authenticated is
-- "your own comments, OR the post exists", and that EXISTS runs posts' own
-- policy. So removing a POST also hides every comment on it from everyone but
-- each comment's author. That is the behaviour, it is not a bug, and the admin
-- screen will be asked about it: taking down a post takes its whole thread with
-- it. Restoring the post brings the thread back untouched.
--
-- WHAT A RESTRICTED STUDENT LOOKS LIKE TO EVERYONE ELSE (decided here, because
-- the policy decides it). Their users row simply does not come back, which is
-- exactly what a deleted account looks like. Measured consequences on the
-- caller's own client:
--   * The feed drops their posts whole, because it joins the author with
--     `author:users!posts_user_id_fkey!inner` (src/app/api/feed/route.ts:280-285).
--     Intended.
--   * A comment thread drops a restricted student's comments whole, because
--     the list read joins the author with
--     `author:users!post_comments_user_id_fkey!inner`
--     (src/app/api/posts/[id]/comments/route.ts:90, and the same embed on the
--     insert-and-return at :287). Intended, and belt-and-braces: the comment
--     SELECT policy below already hides them. The author keeps seeing their
--     own, because their own users row stays visible to them.
--   * A DM thread keeps its messages and loses the peer's card: the member read
--     is a LEFT join (src/app/api/me/threads/route.ts:460), so the thread shows
--     a nameless peer rather than disappearing.
--   * An event's attendee list uses !inner (src/app/api/events/[id]/attendees/
--     route.ts:71), so a restricted attendee drops out of the list.
--   * A restricted club officer vanishes from any roster built on the caller's
--     client until the restriction lifts. Franky's decision 7 says the club is
--     left alone and the other officers keep running it; this is the cost of
--     that. Wave 2 checks each roster surface and decides per screen whether it
--     wants a "this member is unavailable" row instead of a gap.
-- Restricted and deleted looking identical is a feature, not an accident: no
-- screen announces that a named student was suspended.
--
-- DOES NOT
--   * Touch org_followers or post_likes. §Database listed both; both are
--     decoration. authenticated holds SELECT only on each
--     (information_schema.role_table_grants), and org_followers has no INSERT
--     policy at all. Writing an AND nobody can reach makes it look like
--     protection shipped when nothing did.
--   * Touch mutual_follow_counts or second_degree_follows. They return ids and
--     counts; every People card built from them is hydrated from `users` on the
--     caller's own client (rulings M3 forbids the service client there), so a
--     restricted student's card drops out when the row comes back empty. A
--     stale number in the ranking is not a leak. If any surface ever hydrates
--     those ids with the service role, this decision has to be revisited.
--   * Revoke EXECUTE on any function (standing rule: on this Postgres image a
--     call without EXECUTE crashes the backend). Nothing is dropped and
--     recreated either — every function change is CREATE OR REPLACE with the
--     identical signature, which keeps the owner and the ACL, and every one is
--     re-granted anyway.
--   * Grant or revoke anything on the three new removal columns, and it is
--     worth saying exactly why, because the wrong reason is easy to believe.
--     SELECT on all three tables is a TABLE-level grant to authenticated
--     (pg_class.relacl, measured below: posts `rdDxtm`, post_comments
--     `arwdDxtm`, messages `ardDxtm` — the `r` is SELECT, and it is not a
--     column list on any of them), so removed_at, removed_by and
--     removed_reason come along automatically.
--     What keeps them from leaking is the SELECT policies below: only the row's
--     own author can read a removed row at all, so removed_by (a founder's
--     uuid) reaches the author of the removed thing and nobody else. Nothing in
--     src/ or public/ selects "*" from these tables (grep, 2026-09-22), so no
--     client starts rendering the new columns by accident, and the author's
--     "Removed by Vibe moderators" notice still comes from the route.
--     What stops a student CLEARING their own removed_at over REST is the WRITE
--     grants, and they are not the same road on every table: posts' UPDATE for
--     authenticated is a column ACL (content, status and tags only, so the new
--     columns are simply not writable), while post_comments and messages have
--     no UPDATE policy at all. Both are closed; they are closed differently.
--   * Stop an author deleting their own removed row. posts_delete_own,
--     post_comments_delete_own and messages_delete_own are untouched, and
--     posts_update_own still lets an author edit a post of theirs that has been
--     removed. So a student looking at "Removed by Vibe moderators" can still
--     delete or reword the thing. The evidence that survives that is the
--     report's target_snapshot (captured at report time) and the
--     moderation_actions row, neither of which a student can reach. Locking an
--     author out of their own removed row would be the first time Vibe refuses
--     to let someone delete their own words: that is Franky's call to make out
--     loud, not this file's to make quietly.
--   * Move, delete or rewrite any row other than the duplicate open reports it
--     collapses (see PRE-FLIGHT d). On the day it lands nothing is removed and
--     nobody is restricted, so no post, comment, message or profile changes
--     visibility.
--   * Take UPDATE off any users column the app still writes with the CALLER'S
--     OWN client, and there is exactly one: last_active_at
--     (src/app/api/me/heartbeat/route.ts:29, on createSupabaseServerClient).
--     Revoking it would break the heartbeat on every page. The other eleven
--     that keep UPDATE — website, year, department, current_on,
--     work_order_manual, otto_settings, voice_samples, resume_url,
--     resume_docs, resume_redactions and last_active_at — keep it because
--     item 11 above is scoped to the columns the word
--     filter actually covers, not because anything says they are safe: today
--     every one of them is written by the service role too, and taking those
--     is a separate, deliberate file. Section 16k asserts a sample of them is
--     still writable, so an over-broad revoke here fails loudly instead of
--     emptying a screen.
--   * Narrow `events` past the three text columns. id, created_at and
--     creator_id come back in the re-grant only because table-level UPDATE
--     already carried them: "the table grant minus three columns" is exactly
--     the status quo minus three, and adds no exposure that was not there this
--     morning. Nothing in the app updates any of them. Taking them is right,
--     and it is a different decision from closing the filter bypass; it is in
--     FOLLOW-UP with the reason.
--   * Take SELECT off anything. Both revokes below are UPDATE only. A profile
--     and an event still read exactly as they did.
--
-- EVERY TABLE A STUDENT CAN WRITE THROUGH POSTGREST, AND WHAT IT GOT. Measured
-- 2026-09-23 on the local copy: every table where `anon` or `authenticated`
-- holds INSERT, UPDATE or DELETE — table-level OR column-level — crossed with
-- the permissive write policies that let a write through. A grant with no write
-- policy is already shut, and a policy with no grant is unreachable; both kinds
-- are named below so nobody has to take that on trust.
--
-- Acceptance proved two of these live with nothing but the public anon key and
-- a student's own token: a BANNED account POSTed /rest/v1/events and got 201,
-- and a SUSPENDED club officer PATCHed /rest/v1/orgs and rewrote the club's
-- name and description. Both are closed in section 11b, and so is a third of
-- the same shape that review found on the same table: `events` grants
-- authenticated every column including org_id, so ANY signed-in student could
-- post an event under ANY club's name. The route had always refused that; the
-- policy had never asked.
--
-- WHICH CHECK GOES WHERE. The two are not interchangeable, and the difference
-- is the whole reason `events` waited a day:
--   * can_publish_now() also refuses an ordinary, unrestricted student who has
--     not verified a school email — six of twenty production accounts — so it
--     may only be added where a ROUTE already answers that student with a
--     friendly 403 first. events has one now
--     (src/app/api/events/route.ts:425), which is what changed.
--   * NOT is_restricted_now() refuses nobody but a suspended or banned account,
--     and every page one of those can load is the suspended notice. A direct
--     PostgREST call from one of them meeting a bare 42501 is the right answer,
--     so this one needs no route change to ship ahead of it.
--
-- CLOSED HERE (section 11b)
--   events                insert, update  can_publish_now(). Putting an event in
--                         front of a campus is publishing, and so is editing
--                         one. The update policy had no consent check at all
--                         either; can_publish_now() carries Terms and age, so
--                         that older gap closes with it.
--                         AND who the event is for: authenticated holds arwd on
--                         events at TABLE level, so org_id is writable on both,
--                         and event_visible() shows an org-attributed event to
--                         every signed-in caller. Without the officer check a
--                         student in no club could post "SAE Rush Party" under
--                         SAE's name — club page, campus feed, Otto's "Heads
--                         up" panel and the .ics file — or re-point a personal
--                         event at a club after the fact. The route has always
--                         checked it (src/app/api/events/route.ts:487-520); the
--                         policy did not.
--   events                delete          NOT is_restricted_now() on the
--                         org-attributed arm. A club's events are its published
--                         calendar and the RSVPs cascade off them, so a
--                         suspended officer must not be able to wipe the lot on
--                         their way out — and there is no deadline on "on their
--                         way out", because their token keeps working. An event
--                         with no club behind it stays theirs to delete.
--   orgs                  update          NOT is_restricted_now(), and NOT
--                         can_publish_now(): an officer whose school email
--                         lapsed must still be able to run their club.
--                         authenticated holds column UPDATE on name,
--                         description, tags, links, philanthropy, logo_url,
--                         banner_url, backdrop_preset and updated_at — the
--                         club's whole public face.
--   orgs                  delete          NOT is_restricted_now(). Deleting a
--                         club is not deleting your own words: it cascades to
--                         members, channels, invites and requests, so it is
--                         other people's home. One of the two deletes in the
--                         file that a restriction stops; the club's events are
--                         the other, and they are the same argument.
--   org_members           update, delete  NOT is_restricted_now() on the
--                         OFFICER arm only. A suspended officer stops changing
--                         roles and stops removing people; anyone, restricted
--                         or not, keeps the `user_id = auth.uid()` arm and can
--                         still leave a club.
--   org_channel_members   insert, delete  the same shape: the officer arm is
--                         gated, leaving a channel yourself is not.
--   message_reactions     insert          NOT is_restricted_now(). A reaction
--                         is a thing another person sees, sent into a DM or a
--                         club channel. Not can_publish_now(): reacting is not
--                         publishing, and an unverified student may already
--                         react today.
--
-- THE LAPSED OFFICER, AND IT IS A REAL TENSION RATHER THAN AN OVERSIGHT — say
-- it here so the next reader does not have to work it out. orgs_update
-- deliberately omits can_publish_now() so an officer whose school email lapsed
-- keeps running their club, and the post-check aborts the file if anyone ever
-- adds it. But events CARRIES can_publish_now(), so that same officer keeps the
-- club page and loses the ability to post or edit a club event — which, before
-- launch, is most of what running a club means. Franky's decision 4 put
-- can_publish_now() on events, so that is what shipped, and it is ACCEPTED, not
-- inherited from a list. If the lapsed-officer rule should win instead, the
-- shape is `case when org_id is null then public.can_publish_now() else not
-- public.is_restricted_now() end` in both events write policies: personal
-- events keep asking for a verified school email, club events ask only about
-- the restriction. One line each, and Franky's to say.
--
-- DELIBERATELY LEFT OPEN, each with its reason
--   blocks, mutes, channel_member_mutes — a restricted student can still
--     protect themselves from someone. Franky's decision, and the same one
--     src/lib/moderation/access.ts records for the route gates.
--   bookmarks, bookmark_collections, reminders, otto_reminders,
--     personal_events, suggestion_dismissals — private to one student. Nobody
--     else ever sees a row of theirs.
--   notifications (update, delete) — marking your own notification read.
--   channel_members (update, delete) — the writable columns are accepted_at,
--     last_read_at, cleared_at, hidden_at, muted_until, pinned_at and
--     typing_until: a student's own view of their own threads. Accepting an
--     invite lets them READ a conversation; messages_insert_member is where
--     writing into it is stopped.
--   connections delete (unfollow), rsvps delete, posts, post_comments,
--     messages, post_reposts and message_reactions delete — taking your own
--     thing back down. The file's standing line: refusing someone their own
--     delete would be Franky's call to make out loud. It is made out loud
--     TWICE, and only twice: deleting a club (orgs_delete) and deleting a
--     club's event (events_delete_creator), because both are other people's
--     home rather than your own words. An event with no club behind it is on
--     this list, not that one.
--   post_views, profile_views — authenticated holds the grant and there is NO
--     write policy on either, so RLS refuses every client write already.
--     Views are recorded by record_post_view(), which section 12 gates.
--   orgs insert, users insert — authenticated holds no INSERT grant on either
--     (orgs is rdDxtm, users is dDxtm), so the policy is unreachable from a
--     client. Creating a club and creating a users row both run server-side.
--   org_channel_members, message_reactions, blocks, mutes, bookmarks and the
--     rest of the anon-granted list also hand `anon` the same privileges, which
--     is Supabase's default and not this file's to unpick. RLS is on everywhere
--     and every policy on them is TO authenticated, so a keyless caller passes
--     no policy at all; the pre-check asserts exactly that for the five tables
--     section 11b touches.
--
-- EVERY READER THAT KEEPS SEEING REMOVED ROWS AND RESTRICTED AUTHORS, because
-- it reads with the service role and RLS does not apply to it. None of these is
-- a bug in this file; each one is a route that batches C, E and F have to gate
-- themselves. Listed so nobody reads the policies below and assumes the job is
-- done:
--   * src/app/api/users/[handle]/posts/route.ts:35 —
--     `reader = user ? supabase : createSupabaseServiceClient()`. A SIGNED-OUT
--     visitor reads a public profile's post grid with the service role, so a
--     removed post and a restricted student's grid both still come back to
--     anonymous visitors until the route filters. The sharpest one on this list.
--   * src/app/posts/[id]/page.tsx:114 (the server-rendered post page)
--   * src/app/orgs/[handle]/page.tsx:217 and
--     src/app/api/orgs/[slug]/posts/route.ts:172 and
--     src/app/api/orgs/[slug]/profile/route.ts:162 (club pages and club posts)
--   * src/app/api/me/threads/route.ts:257-261 and :332 (channel and DM creation)
--   * src/app/api/me/profile/route.ts:323-326 and
--     src/app/api/me/profile-sync/route.ts:679 (profile writes)
--
-- REPORT FIELD NAMES, so nobody renames them. `reports` already has BOTH a
-- picker code and free text, and they keep the names they have had since
-- 20260506100000_safety_block_mute_report.sql:78-104:
--     reason_code  the picker  CHECK (spam|harassment|sexual|hate|self_harm|other)
--     reason       free text   CHECK (length(reason) <= 1000), DEFAULT ''
-- This file adds columns and renames nothing. There is no `details` column and
-- there must not be one; a route or a client that speaks `details` maps it to
-- `reason`.
--
-- ORG AND EVENT REPORTS CARRY A UUID. reports.target_id is `uuid NOT NULL`
-- (same file, :83) and this file does not widen it. Widening target_type to
-- 'org' and 'event' therefore does NOT make handles storable: an org is keyed
-- on orgs.id (uuid) and its human key is orgs.handle — there is no slug column,
-- which is why src/app/api/admin/orgs/[slug]/hide/route.ts:88 does
-- `.eq('handle', slug)`. The report route resolves a handle to the uuid before
-- inserting, and the admin screen resolves it back for display.
--
-- key_kind = 'personal' IS EVIDENCE, NOT ENFORCEMENT, in v1. Sign-up runs in
-- the browser straight against GoTrue (src/lib/supabase/browser.ts, used by
-- src/app/auth/signup/page.tsx), so no Vibe route ever sees an account being
-- created and nothing can refuse a banned personal email at signup. The only
-- place an identity key is actually tested is school-email verification, which
-- is why key_kind 'school' is the one that stops anybody. The admin screen must
-- not imply otherwise.
--
-- AND THE SAME BOUNDARY, SAID ONCE FOR THE POLICIES. is_restricted_now() and
-- user_visible() match on r.user_id ONLY. account_restrictions.user_id is `on
-- delete set null` and identity_key carries no FK precisely so a restriction
-- outlives the account — but a row whose user_id has gone null is invisible to
-- every policy in this file, and so is a row written against an identity that
-- has no account yet. A banned student may delete their account (Franky's
-- decision), which nulls their user_id, so this is a shape that happens rather
-- than a hypothetical. The route layer has exactly the same blind spot:
-- getActiveRestriction (src/lib/moderation/access.ts) queries `.eq('user_id',
-- userId)`. THIS IS DELIBERATE IN V1 AND IT IS A BOUNDARY, NOT A FLOOR:
-- identity_key is enforced at school-email verification and nowhere else, so a
-- restriction with no user_id stops the identity re-verifying and does not stop
-- a live session. Closing it means giving the helpers an identity arm, which
-- needs the HMAC pepper reachable from SQL — a separate decision, written into
-- FOLLOW-UP. Until then: re-banning an identity must also set user_id, and the
-- acceptance probe below proves what a null-user_id row does and does not do.
--
-- ---------------------------------------------------------------------------
-- MEASURED ON THE LOCAL STACK (read-only psql, 2026-09-22). Production was NOT
-- read by this batch; PRE-FLIGHT b and d re-read it and the body aborts on any
-- difference.
--
--   * The 18 policies this file drops or rewrites, verbatim. md5 of the
--     aggregate (the body's pre-check compares this and prints the real one on
--     a mismatch): b28be6423753fe4ad7a3493cd0b29cae
--
--     channels.channels_insert_authenticated INSERT
--       WITH CHECK (((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) =
--         ANY (ARRAY['owner'::text, 'admin'::text]))) AND has_recorded_consent())
--     connections.connections_insert_follower INSERT
--       WITH CHECK (auth.uid() = follower_id)
--     messages.messages_insert_member INSERT
--       WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
--          FROM (channel_members cm JOIN channels c ON ((c.id = cm.channel_id)))
--         WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid())
--           AND (c.org_id IS NULL)))) AND (NOT (EXISTS ( SELECT 1
--          FROM (channel_members peer JOIN blocks b ON ((((b.blocker_id = auth.uid())
--            AND (b.blocked_id = peer.user_id)) OR ((b.blocker_id = peer.user_id)
--            AND (b.blocked_id = auth.uid())))))
--         WHERE ((peer.channel_id = messages.channel_id)
--           AND (peer.user_id <> auth.uid()))))) AND has_recorded_consent())
--     messages.messages_insert_org_member INSERT
--       WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM channels c
--         WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL)
--           AND can_view_org_channel(c.id, auth.uid())))) AND has_recorded_consent())
--     messages.messages_select_member SELECT
--       USING (EXISTS ( SELECT 1
--          FROM (channel_members cm JOIN channels c ON ((c.id = cm.channel_id)))
--         WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid())
--           AND (c.org_id IS NULL))))
--     messages.messages_select_org_member SELECT
--       USING (EXISTS ( SELECT 1 FROM channels c
--         WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL)
--           AND can_view_org_channel(c.id, auth.uid()))))
--     post_comments.post_comments_insert_own INSERT
--       WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent()
--         AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id = post_comments.post_id))))
--     post_comments.post_comments_select_authenticated SELECT
--       USING ((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
--          FROM posts p WHERE (p.id = post_comments.post_id))))
--     post_reposts.post_reposts_insert_own INSERT
--       WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent()
--         AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id = post_reposts.post_id))))
--     post_reposts.post_reposts_update_own UPDATE
--       USING (auth.uid() = user_id)
--       WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM posts p
--         WHERE (p.id = post_reposts.post_id))))
--     posts.posts_insert_authenticated INSERT
--       WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent())
--     posts.posts_select_authenticated SELECT
--       USING (((status = 'published'::text) AND ((org_id IS NULL)
--         OR org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid() AS uid)))
--     posts.posts_update_own UPDATE
--       USING (auth.uid() = user_id)
--       WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent())
--     reports.reports_insert_authenticated INSERT
--       WITH CHECK (auth.uid() = reporter_id)
--     rsvps.rsvps_insert_own INSERT   WITH CHECK (auth.uid() = user_id)
--     rsvps.rsvps_update_own UPDATE   USING (auth.uid() = user_id)
--                                     WITH CHECK (auth.uid() = user_id)
--     users.users_select_authenticated SELECT  USING (true)
--     users.users_update_self UPDATE  USING (auth.uid() = id)
--                                     WITH CHECK (auth.uid() = id)
--
--   * 31 policies in total on the nine tables this file touches. Every one of
--     the 18 is TO authenticated and PERMISSIVE, and RLS is on everywhere.
--
--   * The 10 policies section 11b rewrites, verbatim (measured 2026-09-23, same
--     formula, its own md5 so the two sets fail apart and the exception says
--     which): a844c6e9c30279936613bded897a6d72
--
--     events.events_delete_creator DELETE  USING (auth.uid() = creator_id)
--     events.events_insert_authenticated INSERT
--       WITH CHECK ((auth.uid() = creator_id) AND has_recorded_consent())
--     events.events_update_creator UPDATE
--       USING (auth.uid() = creator_id)
--       WITH CHECK (auth.uid() = creator_id)
--     message_reactions.message_reactions_insert_member INSERT
--       WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
--          FROM (messages m JOIN channels c ON ((c.id = m.channel_id)))
--         WHERE ((m.id = message_reactions.message_id)
--           AND (((c.org_id IS NULL) AND is_channel_member(m.channel_id))
--             OR ((c.org_id IS NOT NULL)
--               AND can_view_org_channel(m.channel_id, auth.uid())))))))
--     org_channel_members.org_channel_members_delete DELETE
--       USING ((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM channels c
--         WHERE ((c.id = org_channel_members.channel_id) AND (c.org_id IS NOT NULL)
--           AND (org_member_role(c.org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--             'admin'::text]))))))
--     org_channel_members.org_channel_members_insert INSERT
--       WITH CHECK (EXISTS ( SELECT 1 FROM channels c
--         WHERE ((c.id = org_channel_members.channel_id) AND (c.org_id IS NOT NULL)
--           AND (org_member_role(c.org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--             'admin'::text])))))
--     org_members.org_members_delete DELETE
--       USING ((role <> 'owner'::text) AND ((user_id = auth.uid())
--         OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--           'admin'::text]))))
--     org_members.org_members_update UPDATE
--       USING ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--         'admin'::text])) AND (role <> 'owner'::text))
--       WITH CHECK ((role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text]))
--         AND ((role <> 'admin'::text)
--           OR (org_member_role(org_id, auth.uid()) = 'owner'::text)))
--     orgs.orgs_delete DELETE   USING (auth.uid() = owner_id)
--     orgs.orgs_update UPDATE
--       USING ((auth.uid() = owner_id) OR (org_member_role(id, auth.uid()) =
--         ANY (ARRAY['owner'::text, 'admin'::text])))
--       WITH CHECK ((auth.uid() = owner_id) OR (org_member_role(id, auth.uid()) =
--         ANY (ARRAY['owner'::text, 'admin'::text])))
--
--   * 17 policies in total on those five tables (events 4, orgs 4, org_members
--     3, org_channel_members 3, message_reactions 3). Every one is TO
--     authenticated and PERMISSIVE, and RLS is on for all five. The SELECT and
--     the two DELETE policies this file leaves alone are counted so an 11th
--     permissive write policy cannot appear and OR around section 11b.
--   * Write grants on the five: events authenticated=arwd (table-level, with no
--     column ACL on any column, so a creator can write and rewrite EVERY column
--     of their own event — org_id included, which is why section 11b has to ask
--     who the event is for and not only who is asking); orgs
--     authenticated=rdDxtm plus column UPDATE on name, description, tags,
--     links, philanthropy, logo_url, banner_url, backdrop_preset, updated_at;
--     org_members authenticated=rdDxtm plus column UPDATE on `role`;
--     org_channel_members and message_reactions authenticated=arwdDxtm (and
--     anon=arwdDxtm, Supabase's default — RLS is the only thing holding those,
--     and every policy on them is TO authenticated).
--   * reports: relacl `postgres=arwdDxtm/postgres anon=arwdDxtm/postgres
--     authenticated=arwdDxtm/postgres service_role=arwdDxtm/postgres`. No
--     column ACLs (pg_attribute.attacl is null on every column), so one
--     REVOKE ALL ON TABLE takes the whole thing back.
--     reports_target_type_check: CHECK ((target_type = ANY (ARRAY['user'::text,
--     'post'::text, 'message'::text, 'channel'::text])))
--   * email_sends_kind_check on public.email_sends:
--     CHECK ((kind = ANY (ARRAY['school_verification'::text,
--     'password_reset'::text]))). That table has no policies and no grant to
--     anon or authenticated, and this file changes its CHECK and nothing else.
--   * The three count/view functions this file replaces, md5 of
--     pg_get_functiondef:
--       post_engagement_counts(uuid[], timestamptz)  04181f65eac63a2fade27bc559720434
--       comment_like_counts(uuid[])                  6e5c73ded4b1e8a7b7bc5f417df5c65e
--       record_post_view(uuid)                       be0f6bf244dbca7991500c01a02e4124
--     All three are SECURITY DEFINER with SET search_path TO 'public', and all
--     three keep their own copy of the visibility rule in SQL, which is exactly
--     why they each need the same clause added.
--   * Free names, all of them: is_restricted_now, can_publish_now, user_visible,
--     moderation_actions_append_only, account_restrictions, moderation_actions.
--     No column anywhere in public starts with "removed".
--   * pg_class.relacl on the three tables that grow removal columns, because
--     which grants are table-level and which are column ACLs decides who can
--     read and clear them:
--       posts          authenticated=rdDxtm/postgres  (SELECT is table-level;
--                      INSERT and UPDATE are column ACLs, see below)
--       post_comments  authenticated=arwdDxtm/postgres (all table-level; the
--                      missing UPDATE policy is what closes UPDATE)
--       messages       authenticated=ardDxtm/postgres  (no `w` at all)
--   * Write grants that make the new policy ANDs bite immediately:
--       posts          authenticated: column INSERT (content, media_url,
--                      media_thumbnail_url, status, tags, type, user_id) and
--                      column UPDATE (content, status, tags)
--       post_comments  authenticated: table INSERT/UPDATE/DELETE/SELECT
--       messages       authenticated: table INSERT/DELETE/SELECT
--       post_reposts, rsvps, events, connections, channels: table INSERT
--       users          authenticated: column UPDATE on 17 profile fields
--       org_followers, post_likes: authenticated has SELECT only
--   * THE GRANTS SECTION 14 TAKES OFF `users`, and the walk that says taking
--     them costs nothing. pg_class.relacl is `authenticated=dDxtm/postgres`:
--     no table-level `w` and no table-level `r`, so the column ACL is the ONLY
--     UPDATE path and revoking it is a real boundary — the same shape
--     20260922130000 relied on. authenticated holds column UPDATE on 17
--     columns today (20260903100000 granted 28; 20260912100000,
--     20260912102000, 20260916110000 and 20260922130000 have each taken some
--     back): bio, current_on, department, headline, last_active_at,
--     location_text, major, name, otto_settings, resume_docs,
--     resume_redactions, resume_url, tagline, voice_samples, website,
--     work_order_manual, year. `anon` holds NO column privilege of any kind on
--     users (information_schema.column_privileges, 0 rows for anon). Six of
--     the 17 go: name, bio, tagline, headline, location_text, major — exactly
--     the free text the word filter covers.
--     THE WRITE WALK, per column, because "the route uses the service role" is
--     the whole justification and it has to be true of every writer, not the
--     first one found. Every `.from("users").update(...)` in src/ (20 call
--     sites, grep 2026-09-23) and every PostgREST write in public/ (0: no file
--     under public/ talks to PostgREST at all):
--       - all six are written by exactly two routes, PATCH /api/me/profile and
--         POST /api/me/profile-sync, and both write with
--         createSupabaseServiceClient() (profile route.ts:353 and :367,
--         profile-sync route.ts:702 and :734). Both check the patch against
--         the closed list in src/lib/profile/self-write-columns.ts first, and
--         all six are on that list.
--       - onboarding writes `name` and `major` among others at
--         src/app/api/me/onboarding-complete/route.ts:177 and :268 and
--         src/app/api/me/onboarding-step/route.ts:260 — `service` on all three.
--       - src/lib/auth/school-email-apply.ts:228, :239, :246 and :151 — `admin`
--         on all four. It writes none of the six, only school columns.
--       - THE ONE WRITER ON THE CALLER'S OWN CLIENT, and the reason this list
--         exists: src/app/api/me/heartbeat/route.ts:29 updates last_active_at
--         on createSupabaseServerClient(). last_active_at is NOT one of the
--         six and keeps its grant. Nothing else in src/ writes users with the
--         caller's client.
--       - the remaining sites (pinned:55 and :98, otto/settings:99,
--         accept-terms:81, handle-change.ts:149, profile-sync:190) are all
--         service or admin, and none of them names one of the six.
--     No policy, view or non-trigger function in `public` names tagline,
--     headline, location_text or major (pg_policies, pg_views, pg_proc, regex
--     with word boundaries: 0 rows). The only function that UPDATEs users at
--     all is record_profile_view, SECURITY DEFINER, and it writes
--     profile_view_count. So nothing in the database depends on these grants
--     either.
--   * THE GRANTS SECTION 15 TAKES OFF `events`, AND WHY IT CANNOT BE A PLAIN
--     COLUMN REVOKE. pg_class.relacl is `authenticated=arwd/postgres` — a
--     TABLE-level grant — and pg_attribute.attacl is null on all nine columns
--     (0 rows). Postgres treats a table-level UPDATE as covering every column,
--     so `REVOKE UPDATE (title) ON events FROM authenticated` removes a column
--     entry that does not exist: it raises a WARNING, changes nothing, and
--     leaves the hole open while the migration reads as if it closed it. The
--     only way to say "these three and not the others" is to take the table
--     grant back and re-grant the rest by name. The nine columns are id,
--     org_id, creator_id, title, description, starts_at, ends_at, location,
--     created_at; the three that go are title, description and location.
--     `anon` holds nothing on events.
--     THE WRITE WALK. src/ touches `events` at seven places (grep 2026-09-23):
--     six reads (route.ts:175, [id]/attendees:41, [id]/rsvp:31, [id]/ics:39,
--     search:164, admin/reports:392) and ONE write — the INSERT at
--     src/app/api/events/route.ts:537, on the caller's own client, which needs
--     INSERT and not UPDATE. INSERT stays table-level and is untouched, so the
--     create path is unaffected. There is no UPDATE of events anywhere in src/
--     or public/, and src/app/api/events/[id]/ has no route but attendees, ics
--     and rsvp. The grant is what the live PATCH used; nothing else wanted it.
--   * THE FOREIGN-KEY SWEEP BEHIND SECTION 13 OF "WHAT THIS FILE DOES", taken
--     against the schema this file produces. 54 foreign keys reference
--     public.users. Nine of them are ON DELETE SET NULL, and SET NULL is an
--     UPDATE on the referencing row, so any BEFORE UPDATE trigger there fires
--     on account deletion. Cross-joining the nine against pg_trigger:
--       - moderation_actions.actor_id -> moderation_actions_no_change, which
--         raises 42501 on every UPDATE. THE TRAP. A platform admin who had
--         moderated anything could never delete their account: the cascade
--         raised, the whole DELETE /api/me failed, and the log being correct
--         cost someone their right to leave. Fixed by dropping the FK, not by
--         softening the trigger — section 2 keeps refusing UPDATE for every
--         role, service_role and postgres included.
--       - moderation_actions.report_id -> the same trigger, the same 42501,
--         and the same fix. Nothing deletes a report today, so it is a
--         landmine rather than a live break; it is on the append-only table
--         and it is the same contradiction, so it goes with actor_id.
--       - account_restrictions.user_id, .created_by, .lifted_by -> no trigger
--         at all on that table. SET NULL is not just safe here, it is the
--         mechanism the plan needs: user_id going null when the student
--         deletes their account is what leaves identity_key standing alone,
--         and identity_key carries no FK, so the restriction survives. Kept
--         deliberately, and section 16m asserts it.
--       - reports.reporter_id, .resolved_by -> no trigger on reports. Safe.
--       - posts.removed_by -> posts_stamp_campus and posts_stamp_edited both
--         fire BEFORE UPDATE. Read in full: stamp_campus re-pins school_system
--         and campus_id to OLD and returns NEW; stamp_edited raises ONLY when
--         a published post's status changes, and a SET NULL touches neither
--         status nor content, so it takes the `else` arm and copies old
--         edited_at forward. Neither refuses, and neither marks the post
--         edited. Safe, and checked rather than assumed.
--       - post_comments.removed_by, messages.removed_by -> no BEFORE UPDATE
--         trigger on either. Safe.
--     The other three SET NULL FKs to users outside this file's tables
--     (email_sends.user_id, orgs.owner_id, and the org_invites /
--     org_join_requests resolver columns) sit under triggers that were read
--     too: email_sends_forget_recipient nulls recipient_hash and returns NEW
--     (20260922104000 wrote it for exactly this cascade), orgs_sync_join_policy
--     rewrites join_policy and returns NEW. Neither refuses. Nothing outside
--     this file needs changing.
--     No table in `public` has FORCE ROW LEVEL SECURITY (0 rows), so RLS never
--     filters a referential-action UPDATE: the trigger was the only obstacle.
--   * Local data: 5 users, 0 platform admins, 0 reports, 0 blocks, 0 mutes.
--     A green local run proves the SQL parses and the post-check passes. It
--     proves NOTHING about the duplicate-report collapse, which is why
--     PRE-FLIGHT d measures that on production instead.
--
-- ---------------------------------------------------------------------------
-- DEPLOY ORDER IS PART OF THE CONTRACT: CODE FIRST, MIGRATION SECOND.
-- Unlike 20260922140000, the order here is not a matter of taste.
--   * Batches C and D live, this file not yet: everything works as it does
--     today, and a student who should be gated is refused by the route with the
--     friendly 403. Direct PostgREST stays open until this file lands. This is
--     the order to ship in.
--   * This file live, C and D not: posts, post_comments and messages all carry
--     write grants for authenticated, so `can_publish_now()` bites at once. An
--     unverified student's post fails inside the insert with 42501 and the
--     route answers 500 "Request failed"
--     (src/app/api/me/publish-post/route.ts:199) instead of
--     "Verify your school email to post." Six of twenty production accounts are
--     unverified today. Refused either way, but with a message that tells them
--     nothing and a console error that says nothing either.
--   * Both live: they agree, and the route's 403 arrives before the insert is
--     ever attempted.
-- `events` is on that list now too, and it is the sharpest case: the insert at
-- src/app/api/events/route.ts:511 runs on the CALLER'S client, so section 11b's
-- can_publish_now() bites there the moment this file lands. The friendly 403 at
-- :425 has to be live first or an unverified officer gets a bare 500 with
-- nothing to act on. The is_restricted_now() ANDs in the same section carry no
-- such condition: they refuse only suspended and banned accounts, and those
-- accounts see the suspended notice on every page they can load.
-- Once this file is applied, rulings M9 applies: never instant-roll Vercel back
-- past batches C and D, because old code has no 403 to give.
--
-- LOCKS. ALTER POLICY and ALTER TABLE ... ADD COLUMN each take an ACCESS
-- EXCLUSIVE lock until COMMIT on posts, post_comments, messages, users,
-- channels, connections, rsvps, post_reposts, reports and — section 11b —
-- events, orgs, org_members, org_channel_members and message_reactions. Adding a nullable
-- column with no default is a catalogue-only change, so it is milliseconds, but
-- it still queues behind a long reader. `lock_timeout = '5s'` makes the file
-- fail whole rather than stall the feed; then simply run it again. CREATE INDEX
-- (not CONCURRENTLY) on reports is fine: production has a handful of rows. The
-- same goes for email_sends: ADD CONSTRAINT takes ACCESS EXCLUSIVE and scans
-- every row to validate, and that table holds one row per email ever sent.
--
-- ---------------------------------------------------------------------------
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes; the
-- implementer applies this nowhere, to no database).
--   0. PRE-FLIGHT, read-only. STOP on anything you cannot explain.
--      a. Version gate (rulings H2): my predecessors present, my own version
--         absent. Gate on 20260922104000 (email_sends — section 13 widens its
--         CHECK, so this file has nothing to widen without it) and on
--         20260922140000, NOT on 20260922150000 — the billing migration is
--         test-copy-only today, so gating on it would block production forever.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922104000', '20260922140000', '20260923090000')
--            ORDER BY 1;
--           -- expect exactly TWO rows: 20260922104000 and 20260922140000.
--           -- 20260922104000 missing: apply it first, or this file aborts at
--           --   pre-check 0c having written nothing.
--           -- 20260923090000 present: already applied. STOP.
--           -- The real production order of this file against 20260922150000
--           --   (billing) is decided at apply time; if billing goes first,
--           --   nothing here conflicts, and if it never goes, nothing here
--           --   waits on it. Renumber only if this file has to land BELOW an
--           --   already-applied version, so `supabase db reset` replays the
--           --   order production saw.
--      b. The state this file was written against; the body re-checks all of it
--         and aborts otherwise:
--           -- the 18 policies, as one md5 (see MEASURED for the text):
--           SELECT md5(replace(string_agg(format('%s.%s %s %s | %s', tablename,
--                    policyname, cmd, coalesce(qual,'-'), coalesce(with_check,'-')),
--                    E'\n' ORDER BY tablename::text COLLATE "C",
--                                   policyname::text COLLATE "C"), 'public.', ''))
--             FROM pg_policies WHERE schemaname = 'public'
--              AND (tablename, policyname) IN (
--                ('posts','posts_select_authenticated'),('posts','posts_insert_authenticated'),
--                ('posts','posts_update_own'),
--                ('post_comments','post_comments_select_authenticated'),
--                ('post_comments','post_comments_insert_own'),
--                ('post_reposts','post_reposts_insert_own'),
--                ('post_reposts','post_reposts_update_own'),
--                ('messages','messages_select_member'),('messages','messages_select_org_member'),
--                ('messages','messages_insert_member'),('messages','messages_insert_org_member'),
--                ('channels','channels_insert_authenticated'),
--                ('connections','connections_insert_follower'),
--                ('rsvps','rsvps_insert_own'),('rsvps','rsvps_update_own'),
--                ('users','users_select_authenticated'),('users','users_update_self'),
--                ('reports','reports_insert_authenticated'));
--           -- b28be6423753fe4ad7a3493cd0b29cae
--           -- the 10 policies section 11b rewrites, the same formula again:
--           --   ('events','events_insert_authenticated'),
--           --   ('events','events_update_creator'),
--           --   ('events','events_delete_creator'),
--           --   ('orgs','orgs_update'),('orgs','orgs_delete'),
--           --   ('org_members','org_members_update'),
--           --   ('org_members','org_members_delete'),
--           --   ('org_channel_members','org_channel_members_insert'),
--           --   ('org_channel_members','org_channel_members_delete'),
--           --   ('message_reactions','message_reactions_insert_member')
--           -- a844c6e9c30279936613bded897a6d72
--           -- and the grant the events AND leans on, which is a TABLE-level
--           -- one and therefore easy to lose sight of:
--           SELECT has_column_privilege('authenticated','public.events','org_id','INSERT'),
--                  has_column_privilege('authenticated','public.events','org_id','UPDATE');
--           -- t | t. Both false would mean the club-attribution AND guards
--           -- nothing; the body asserts this and aborts.
--           SELECT pg_get_constraintdef(oid) FROM pg_constraint
--            WHERE conrelid = 'public.reports'::regclass
--              AND conname = 'reports_target_type_check';
--           -- CHECK ((target_type = ANY (ARRAY['user'::text, 'post'::text,
--           --   'message'::text, 'channel'::text])))
--           SELECT pg_get_constraintdef(oid) FROM pg_constraint
--            WHERE conrelid = 'public.email_sends'::regclass
--              AND conname = 'email_sends_kind_check';
--           -- CHECK ((kind = ANY (ARRAY['school_verification'::text,
--           --   'password_reset'::text])))
--           -- "relation does not exist" means 20260922104000 was never applied
--           -- here: STOP and apply it first. The body aborts on that too.
--           SELECT relname, array_to_string(relacl, ' ') FROM pg_class
--            WHERE oid IN ('public.reports'::regclass, 'public.posts'::regclass,
--                          'public.post_comments'::regclass, 'public.messages'::regclass);
--           -- reports        anon AND authenticated arwdDxtm (the hole)
--           -- posts          authenticated=rdDxtm   (SELECT table-level,
--           --                INSERT/UPDATE are column ACLs)
--           -- post_comments  authenticated=arwdDxtm
--           -- messages       authenticated=ardDxtm  (no `w`)
--           -- Anything wider on posts, post_comments or messages means a
--           -- student could clear their own removed_at: STOP, and read the
--           -- DOES NOT block in the header before going on. The body asserts
--           -- both locks and aborts on either.
--           SELECT md5(pg_get_functiondef('public.post_engagement_counts(uuid[],timestamptz)'::regprocedure)),
--                  md5(pg_get_functiondef('public.comment_like_counts(uuid[])'::regprocedure)),
--                  md5(pg_get_functiondef('public.record_post_view(uuid)'::regprocedure));
--           -- 04181f65eac63a2fade27bc559720434 |
--           -- 6e5c73ded4b1e8a7b7bc5f417df5c65e | be0f6bf244dbca7991500c01a02e4124
--           -- A different md5 on production: STOP, re-read the body, and
--           -- rebuild this file's copy AND the ROLLBACK copy from it.
--           SELECT to_regclass('public.account_restrictions'),
--                  to_regclass('public.moderation_actions');   -- null | null
--           -- and the two grant shapes sections 14 and 15 change. Both are
--           -- asserted by the body (pre-check 0e) and both are easy to get
--           -- wrong by eye, so read them before you run anything:
--           SELECT array_to_string(relacl, ' ') FROM pg_class
--            WHERE oid IN ('public.users'::regclass, 'public.events'::regclass);
--           -- users   authenticated=dDxtm  (no table-level `w`: the column ACL
--           --         is the only UPDATE path, so a column REVOKE bites)
--           -- events  authenticated=arwd   (table-level `w`: a column REVOKE
--           --         would be a WARNING and a no-op, which is why section 15
--           --         takes the table grant back and re-grants six by name)
--           -- Anything else on either: STOP. If `users` has grown a
--           -- table-level `w`, section 14's revoke is theatre; if `events` has
--           -- LOST its table-level `w`, someone has been here already.
--           SELECT c.col,
--                  has_column_privilege('authenticated','public.users',c.col,'UPDATE')
--             FROM unnest(ARRAY['name','bio','tagline','headline','location_text',
--                               'major','last_active_at','website']) AS c(col);
--           -- t on all eight. The first six are what section 14 takes; the last
--           -- two are the control, and they must still be t afterwards.
--           SELECT c.col,
--                  has_column_privilege('authenticated','public.events',c.col,'UPDATE'),
--                  has_column_privilege('authenticated','public.events',c.col,'INSERT')
--             FROM unnest(ARRAY['title','description','location','org_id']) AS c(col);
--           -- t | t on all four. After section 15: title, description and
--           -- location are f on UPDATE and STILL t on INSERT (the create route
--           -- at src/app/api/events/route.ts:537 runs on the caller's client
--           -- and needs INSERT), and org_id stays t on both.
--      c. No long transaction to queue behind:
--           SELECT pid, now() - xact_start, state, left(query, 80)
--             FROM pg_stat_activity
--            WHERE xact_start < now() - interval '30 seconds';   -- 0 rows
--      d. THE ONE MEASUREMENT THAT CAN ONLY BE TAKEN ON PRODUCTION. Every
--         existing report gets status 'open' in this same transaction, and the
--         new unique partial index is (reporter_id, target_type, target_id)
--         WHERE status = 'open'. So one person who reported the same thing twice
--         aborts the whole migration. The local copy has 0 reports, so a green
--         local run proves nothing here. Run BOTH:
--           SELECT count(*) FROM public.reports;
--           SELECT reporter_id, target_type, target_id, count(*)
--             FROM public.reports
--            WHERE reporter_id IS NOT NULL
--            GROUP BY 1, 2, 3 HAVING count(*) > 1;
--         The body carries the collapse decision and applies it before the index
--         is built: for each (reporter, target) the OLDEST report stays open and
--         the rest become 'dismissed' with a resolution_note that says a
--         migration did it. Nothing is deleted. Rows with a null reporter_id
--         (the reporter deleted their account) are left alone, because a btree
--         unique index treats nulls as distinct and they cannot collide.
--         If step d returns rows, read them first and confirm the collapse is
--         what Franky wants for those particular reports.
--      e. The local-stack acceptance for this batch passed, log in the handoff.
--   1. Apply with the management-API curl recipe
--      (20260912102000_users_media_url_host_lock.sql:92-104), --rawfile at this
--      file. `[]` means success; a JSON error means nothing was applied.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260923090000_moderation_foundation.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260923090000', 'moderation_foundation');
--   3. Set RESTRICTION_PEPPER in Vercel BEFORE batch E's admin routes ship, or
--      the restrict endpoint is dead in production (it fails closed with "not
--      configured"). It does not exist in this project today, and ruling B4
--      pins .env.development.local, so it has to be added there too or the
--      local acceptance cannot exercise the happy path. Say it once here
--      because it is permanent: the pepper CAN NEVER BE ROTATED. Every
--      identity_key is an HMAC under it, and there is no re-derivation path
--      from a key back to an email, so rotating orphans every restriction ever
--      written. Generate it once, keep it, back it up.
--
-- POST-CHECK (read-only; the body checks all of this inside the transaction and
-- aborts on a miss, so this is the second pair of eyes, not the first).
--   SELECT tablename, policyname, qual, with_check FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('posts','post_comments','post_reposts','messages',
--                        'channels','connections','rsvps','users','reports')
--    ORDER BY 1, 2;
--   -- 30 rows, one fewer than the 31 before: reports_insert_authenticated is
--   -- gone and no policy replaces it. Every other policy reads as written.
--   SELECT tablename, policyname, qual, with_check FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('events','orgs','org_members','org_channel_members',
--                        'message_reactions')
--    ORDER BY 1, 2;
--   -- still 17 rows: section 11b rewrites ten of them and adds none. events
--   -- insert and update both name can_publish_now() AND org_member_role(org_id,
--   -- ...); events_delete_creator names is_restricted_now() with an
--   -- `org_id IS NULL` arm in front of it; orgs_update names
--   -- is_restricted_now() and must NOT name can_publish_now().
--   SELECT array_to_string(relacl, ' ') FROM pg_class
--    WHERE oid IN ('public.reports'::regclass, 'public.moderation_actions'::regclass,
--                  'public.account_restrictions'::regclass);
--   -- no anon= and no authenticated= entry on any of the three, and
--   -- moderation_actions reads service_role=ar/postgres (SELECT and INSERT
--   -- only — no UPDATE, no DELETE, which is the log being append-only by
--   -- grant and not only by trigger).
--   SELECT has_function_privilege(r, f, 'EXECUTE')
--     FROM unnest(ARRAY['anon','authenticated','service_role']) r,
--          unnest(ARRAY['public.is_restricted_now()','public.can_publish_now()',
--                       'public.user_visible(uuid)']) f;   -- nine t
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- 0 (standing rule)
--   SELECT status, count(*) FROM public.reports GROUP BY 1;
--   -- every pre-existing report is 'open' except the duplicates the body
--   -- collapsed, which are 'dismissed' with the migration's note.
--   SELECT count(*) FROM public.posts WHERE removed_at IS NOT NULL;   -- 0
--   SELECT count(*) FROM public.account_restrictions;                 -- 0
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.email_sends'::regclass
--      AND conname = 'email_sends_kind_check';
--   -- all three kinds now, 'moderation_alert' included, and the two it already
--   -- took still there.
--   SELECT array_to_string(relacl, ' ') FROM pg_class
--    WHERE oid IN ('public.users'::regclass, 'public.events'::regclass);
--   -- users   authenticated=dDxtm  (unchanged: sections 14 and 15 touch no
--   --         table-level grant on users, only its column ACL)
--   -- events  authenticated=ard    (the `w` is gone; `a` — INSERT — stays, so
--   --         the create route is untouched)
--   SELECT c.col,
--          has_column_privilege('authenticated','public.users',c.col,'UPDATE')
--     FROM unnest(ARRAY['name','bio','tagline','headline','location_text','major',
--                       'last_active_at','website','year','otto_settings']) AS c(col);
--   -- f on the first six, t on the last four. All f would mean the revoke was
--   -- written too wide and the profile save is now the only way to set a
--   -- website; all t would mean it did not land at all.
--   SELECT c.col,
--          has_column_privilege('authenticated','public.events',c.col,'UPDATE'),
--          has_column_privilege('authenticated','public.events',c.col,'INSERT')
--     FROM unnest(ARRAY['title','description','location',
--                       'org_id','starts_at','ends_at']) AS c(col);
--   -- f | t on title, description and location. t | t on the other three:
--   -- org_id in particular, or section 11b's club-attribution AND on
--   -- events_update_creator would be guarding a grant nobody holds.
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE contype = 'f'
--      AND conrelid IN ('public.moderation_actions'::regclass,
--                       'public.account_restrictions'::regclass);
--   -- moderation_actions: 0 rows. Any FK here is the account-deletion trap
--   -- coming back (SET NULL is an UPDATE; the append-only trigger raises
--   -- 42501; DELETE /api/me fails whole for any admin who ever moderated).
--   -- account_restrictions: three rows, all confdeltype 'n' (SET NULL), on
--   -- user_id, created_by and lifted_by. user_id going null is the mechanism,
--   -- not a leak: identity_key carries no FK and keeps the restriction
--   -- standing after the account is gone.
--   ONE LIVE PROBE, and it is the one worth doing by hand, because it is the
--   bug this batch was told about: signed in as an ordinary student, with that
--   student's own token and the public anon key,
--     PATCH /rest/v1/users?id=eq.<self>  {"headline":"Campus tr4nny guy"}
--   -- was 204 with the slur stored. Must now be 403, SQLSTATE 42501,
--   -- "permission denied for table users". Then save the same profile through
--   -- the app: the route answers with the filter's own message. And
--     PATCH /rest/v1/events?id=eq.<an event they created>  {"title":"..."}
--   -- was 200. Must now be 403 / 42501 as well, while POST /rest/v1/events
--   -- still creates one.
--   SMOKE, GET-only (rulings M8), with Franky's session cookie, compared with
--   the same GETs taken just before applying: GET /api/feed (the same number of
--   posts), a post and its /comments (200, the same comment count), the SAE
--   club page, GET /api/me/threads (the same threads with the same peers), a
--   profile page. Nothing is removed and nobody is restricted yet, so ANY
--   difference means a policy is wrong: ROLLBACK at once.
--
-- LOCAL ACCEPTANCE PROBES (acceptance agent only, local stack; the implementer
-- runs none of these). Every function involved is granted to every calling
-- role, so none of them can hit the EXECUTE crash. Seed first: one platform
-- admin (there are 0 locally, so every admin route is otherwise untested), one
-- verified student V with a published post, one UNVERIFIED student U with
-- Terms accepted, and a handful of reports (there are 0 locally, so every
-- report path means nothing without them).
--   READ THE EXPECTED OUTCOME CAREFULLY, because this file uses both shapes on
--   purpose and they do not look alike from the outside. A clause in WITH CHECK
--   lets the row be selected and then refuses the RESULT: PostgREST answers 403
--   with SQLSTATE 42501, "new row violates row-level security policy". A clause
--   in USING filters the row out before anything is written: no error at all,
--   just 0 rows changed. Reading a 42501 as a failure where the probe says
--   "0 rows" (or the other way round) would report a closed hole as open.
--   As U, over REST with the anon key:
--     POST /rest/v1/posts, /post_comments, /post_reposts, /messages,
--       /channels, /events → 403 (42501). The same calls as V → 201. That is
--       can_publish_now() doing its job. (For /events, V has to be an owner or
--       admin of the club named in org_id, or the 403 is the club check rather
--       than the one being tested — make V an officer of a club first.)
--       PATCH /rest/v1/events?id=eq.<own> as U → 403 (42501): the update policy
--       asks the same question, in WITH CHECK, so U's own row IS selected by
--       USING and the refusal lands on the result.
--     POST /rest/v1/connections (follow) → 201. Following is NOT gated on
--       school verification; only NOT is_restricted_now() applies here.
--     POST /rest/v1/reports → 403 (42501), where it used to be 201.
--   After seeding a restriction row for V (service role):
--     As anyone else: GET users?id=eq.V → [], posts?user_id=eq.V → [],
--       post_comments?user_id=eq.V → [].
--     As V: GET users?id=eq.V → their own row (the own-row arm), and
--       DELETE /api/me still works end to end — that route reads users.handle
--       on the CALLER'S client (src/app/api/me/route.ts:84-97) and answers
--       400 "Handle confirmation didn't match" if the row is invisible.
--       This is the probe that catches a users_select_authenticated written
--       without the own-row escape.
--     As V: POST /rest/v1/connections → 403; POST /rest/v1/blocks and /mutes
--       → 201 (a restricted student can still protect themselves).
--     THE TWO ACCEPTANCE PROVED, re-run: as restricted V, POST /rest/v1/events
--       → 403 (42501), where it used to be 201. Make V an owner or admin of a
--       club first, then PATCH /rest/v1/orgs?handle=eq.<h> with a new name or
--       description → 403 (42501), where it used to be 200 with the club
--       renamed. That clause is in orgs_update's WITH CHECK and the USING arm
--       still selects V's own club, so this one raises rather than changing 0
--       rows; the four probes below it are USING clauses and really do come
--       back 0 rows. Unrestrict V and both work again — the second half
--       matters, because a policy that refuses everyone is not a fix.
--     THE THIRD, which acceptance did not try and the policy now refuses: as
--       UNRESTRICTED, verified W who is a member of NO club, POST
--       /rest/v1/events with org_id = <SAE's uuid> and title "SAE Rush Party"
--       → 403 (42501), where it used to be 201 and the forged event rendered
--       on SAE's club page, in the feed, in Otto's "Heads up" panel and in the
--       .ics file. Then the same thing the long way round: as W, POST an event
--       with org_id NULL → 201 (a personal event is still theirs), and PATCH
--       that row with org_id = <SAE's uuid> → 403 (42501). As an SAE officer,
--       both calls with SAE's uuid → 201 / 200.
--     As restricted V, still an officer: DELETE /rest/v1/events?id=eq.<a club
--       event V created> → 0 rows (USING), and the RSVPs on it survive. The
--       same DELETE on an event of V's with org_id NULL → 1 row, because that
--       arm is deliberately open. Unrestrict V and the club event deletes.
--     As restricted V, still an officer: PATCH /rest/v1/org_members (a role
--       change) and DELETE /rest/v1/org_members?user_id=eq.<someone else> → 0
--       rows; DELETE /rest/v1/org_members?user_id=eq.V (leaving the club
--       themselves) → 1 row, because the self arm is deliberately open. Same
--       pair on /org_channel_members. POST /rest/v1/message_reactions → 403.
--     As restricted V, owner of a club: DELETE /rest/v1/orgs?id=eq.<theirs>
--       → 0 rows. Deleting a club takes its members and channels with it.
--     THE BOUNDARY PROBE, which must FAIL to refuse and that is the point.
--       With V still restricted, null out that restriction's user_id (service
--       role) and leave identity_key standing — the shape a banned student
--       leaves behind when they delete their account. Re-run any two of the
--       probes above as V: they go back to succeeding, because
--       is_restricted_now() matches on user_id and nothing else. Record it,
--       do NOT report it as a regression: it is the v1 boundary written into
--       the header ("AND THE SAME BOUNDARY, SAID ONCE FOR THE POLICIES") and
--       into FOLLOW-UP. What must still hold is the other half: school-email
--       verification for that identity is refused, which is the one place
--       identity_key is enforced (src/lib/moderation/access.ts:294).
--   After setting removed_at on V's post P (service role):
--     As anyone else: GET posts?id=eq.P → [], and GET
--       post_comments?post_id=eq.P → only the caller's own comments.
--     As V: P comes back with removed_at and removed_reason server-side.
--     rpc/post_engagement_counts with P → no row. rpc/record_post_view on P
--       → false, and posts.view_count does not move.
--   moderation_actions: INSERT as service_role → 1 row. UPDATE or DELETE that
--     row as service_role (or as postgres) → 42501 "append-only".
--
-- FOLLOW-UP (not in this file, each with the reason it is not)
--   * events and orgs are NO LONGER follow-ups: acceptance proved both open
--     with the anon key and section 11b closes them here. The condition this
--     file set for events has been met — src/app/api/events/route.ts:425 now
--     answers an unverified student with a friendly 403 before the insert is
--     attempted — and the events UPDATE policy, which had no consent check at
--     all, gets Terms and age along with can_publish_now().
--   * THE HALF OF THE EVENTS RULE THAT IS STILL ROUTE-ONLY. The route refuses
--     an event for a club that is unverified or hidden
--     (src/app/api/events/route.ts:487-520); section 11b asks only whether the
--     caller is an officer of the named club. A bare subquery on public.orgs
--     inside the policy would read under the caller's own orgs_select and so
--     could NOT see a hidden club, which is the whole reason it is not written
--     there: mirroring that half needs a new STABLE SECURITY DEFINER helper,
--     the same shape as event_visible() and org_member_role(). Worth doing;
--     not worth guessing at inside a line that has to hold.
--   * THE IDENTITY ARM, and it is the limit of the sentence "the database is
--     the real floor". is_restricted_now() and user_visible() match on user_id,
--     so a restriction whose user_id has gone null — exactly what a banned
--     student deleting their account leaves behind — stops nobody's live
--     session. Closing it means an `or exists (... r.identity_key =
--     restriction_identity_key(u.school_email) ...)` arm inside the helpers,
--     which needs the HMAC pepper reachable from SQL. That is a decision about
--     where the pepper lives, not a line of policy. Until it is made, the admin
--     screen must not say a ban follows the person: it follows the school
--     email, at verification time, and nowhere else.
--   * ROUTE SIDE, not this file's to change: the club PATCH gate is
--     src/app/api/orgs/[slug]/route.ts:405, and it calls requireCanPublish,
--     which also demands a verified school email. The policy below deliberately
--     does NOT: Franky's rule is that an officer whose school email lapsed
--     keeps running their club. Until that route uses requireNotRestricted
--     instead, the route is the stricter of the two and the lapsed officer is
--     still locked out — by the route, not by the database.
--   * ROUTE SIDE: src/app/api/orgs/[slug]/route.ts:663 (DELETE) has no
--     moderation gate at all and deletes with the service client, so a
--     suspended owner can still delete their club through the app even though
--     the policy below refuses it over PostgREST. Same shape as the readers
--     listed above: the database floor does not reach service-role traffic.
--   * Signed-out reads. src/app/api/users/[handle]/posts/route.ts:35 and the
--     server-rendered post and club pages read with the service role, so they
--     are the routes' job, not the database's.
--   * A RULE FOR WAVE 2, not a curiosity. Any signed-out surface that needs
--     like, repost, comment-like or view counts must read them with the SERVICE
--     client, never with the anon client. post_engagement_counts,
--     comment_like_counts and record_post_view now call user_visible(), which
--     answers false to role 'anon', so an anon-key call to any of the three
--     comes back empty rather than wrong-and-loud: no error, no log line,
--     nothing pointing at moderation. The mechanism and the call sites that are
--     safe today are written out above the three functions ("ONE CONSEQUENCE TO
--     KNOW ABOUT"). A new public post page or shared profile grid is exactly
--     the shape that would trip it.
--   * A removed post's row is still countable through any DEFINER function this
--     file did not touch. The three that matter are handled; a new one must
--     carry the same clause.
--   * email_sends kinds. The database half is done HERE: the CHECK is widened
--     below to the three kinds. EMAIL_SEND_KINDS has already been widened to
--     the same three (src/lib/email/send-log-core.ts:39-43) by the batch that
--     owns src/lib/email/*. The one thing still lagging is its paired assertion,
--     send-log-core.test.ts:71, which still expects the two-kind array and FAILS
--     today — it has to be widened in that same batch, in this wave. Note that
--     none of this gates the fix: sendLogged passes `kind` straight into the
--     insert and checks it against no list (src/lib/email/send-log.ts:31 and
--     :50-58), so the CHECK below is the whole database-side fix. Tidying that
--     is left: src/lib/moderation/alerts.ts:44 still types the kind as `string`
--     and casts it at :166.
--   * THE REST OF THE `events` GRANT. Section 15 re-grants UPDATE on id,
--     created_at and creator_id because table-level UPDATE already carried
--     them and this file changes only the three text columns. Nothing in the
--     app updates any of the six it re-grants, so the honest end state is
--     `REVOKE UPDATE ON TABLE public.events FROM authenticated` and no
--     re-grant at all — no client writes an event after it is created.
--     Two things have to be decided first, out loud: whether the day-one event
--     edit route writes with the service role (then authenticated needs
--     nothing back) or with the caller's client (then it needs starts_at,
--     ends_at and org_id by name), and whether events_update_creator should
--     survive a grant nobody holds. Both are one line of migration when the
--     answer exists; guessing at them today would be inventing a route.
--   * THE REST OF THE `users` GRANT, the same shape. Eleven columns keep
--     UPDATE for authenticated and today the service role writes every one of
--     them too; only last_active_at has a caller's-client writer. Taking the
--     other ten is a real narrowing and it is not this file's subject, which
--     is the word filter. It wants its own file, its own walk and its own
--     acceptance — website and year are rendered on the public profile and a
--     wrong revoke there empties a screen rather than closing a hole.
--   * THE OTHER APPEND-ONLY FK, if one is ever added. The rule section 13 of
--     "WHAT THIS FILE DOES" writes down is general: a table whose trigger
--     refuses UPDATE must carry no foreign key with a referential ACTION
--     (SET NULL, SET DEFAULT or CASCADE), because every one of those is a
--     write the trigger will refuse, and the failure surfaces three tables
--     away as a 42501 on an unrelated DELETE. Section 16m asserts
--     moderation_actions has none; it cannot assert the rule for a table that
--     does not exist yet.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (one transaction; restores ONLY this file's change). Copy the block
-- and strip the first five characters ("--   ") of each line. Order matters,
-- and RUN IT AS ONE BLOCK — never a step at a time. Every POLICY stops naming
-- the helpers and the new columns before they are dropped, and there the DROP
-- really would fail if you got it wrong, because a policy is a catalogue
-- dependency. FUNCTIONS are not: step 3 drops removed_at / removed_by /
-- removed_reason while post_engagement_counts, comment_like_counts and
-- record_post_view still name removed_at and user_visible in their bodies, and
-- those bodies are only restored at step 5. Postgres does not dependency-track
-- a plpgsql body, so that DROP COLUMN succeeds in silence — no error is coming
-- to catch you. It is safe only because the whole block is one transaction.
-- The policy texts are the MEASURED ones and the three function bodies
-- are their pg_get_functiondef output verbatim, so afterwards the three md5s in
-- PRE-FLIGHT b read the same again. Nothing here revokes EXECUTE on anything
-- (standing rule); DROP FUNCTION is not a revoke, and a call to a function that
-- no longer exists is a plain "does not exist" error, no crash.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- 1. the policies, back to their measured text
--   ALTER POLICY posts_select_authenticated ON public.posts
--     USING (((status = 'published'::text) AND ((org_id IS NULL)
--       OR public.org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid())));
--   ALTER POLICY posts_insert_authenticated ON public.posts
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent());
--   ALTER POLICY posts_update_own ON public.posts
--     USING (auth.uid() = user_id)
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent());
--   ALTER POLICY post_comments_select_authenticated ON public.post_comments
--     USING ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1
--       FROM public.posts p WHERE (p.id = post_comments.post_id))));
--   ALTER POLICY post_comments_insert_own ON public.post_comments
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent()
--       AND (EXISTS ( SELECT 1 FROM public.posts p WHERE (p.id = post_comments.post_id))));
--   ALTER POLICY post_reposts_insert_own ON public.post_reposts
--     WITH CHECK ((auth.uid() = user_id) AND public.has_recorded_consent()
--       AND (EXISTS ( SELECT 1 FROM public.posts p WHERE (p.id = post_reposts.post_id))));
--   ALTER POLICY post_reposts_update_own ON public.post_reposts
--     USING (auth.uid() = user_id)
--     WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
--       FROM public.posts p WHERE (p.id = post_reposts.post_id))));
--   ALTER POLICY messages_select_member ON public.messages
--     USING (EXISTS ( SELECT 1
--        FROM public.channel_members cm JOIN public.channels c ON c.id = cm.channel_id
--       WHERE cm.channel_id = messages.channel_id AND cm.user_id = auth.uid()
--         AND c.org_id IS NULL));
--   ALTER POLICY messages_select_org_member ON public.messages
--     USING (EXISTS ( SELECT 1 FROM public.channels c
--       WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL
--         AND public.can_view_org_channel(c.id, auth.uid())));
--   ALTER POLICY messages_insert_member ON public.messages
--     WITH CHECK ((auth.uid() = user_id)
--       AND (EXISTS ( SELECT 1
--          FROM public.channel_members cm JOIN public.channels c ON c.id = cm.channel_id
--         WHERE cm.channel_id = messages.channel_id AND cm.user_id = auth.uid()
--           AND c.org_id IS NULL))
--       AND (NOT (EXISTS ( SELECT 1
--          FROM public.channel_members peer JOIN public.blocks b
--               ON ((b.blocker_id = auth.uid() AND b.blocked_id = peer.user_id)
--                OR (b.blocker_id = peer.user_id AND b.blocked_id = auth.uid()))
--         WHERE peer.channel_id = messages.channel_id AND peer.user_id <> auth.uid())))
--       AND public.has_recorded_consent());
--   ALTER POLICY messages_insert_org_member ON public.messages
--     WITH CHECK ((auth.uid() = user_id)
--       AND (EXISTS ( SELECT 1 FROM public.channels c
--         WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL
--           AND public.can_view_org_channel(c.id, auth.uid())))
--       AND public.has_recorded_consent());
--   ALTER POLICY channels_insert_authenticated ON public.channels
--     WITH CHECK (((org_id IS NULL) OR (public.org_member_role(org_id, auth.uid())
--       = ANY (ARRAY['owner'::text, 'admin'::text]))) AND public.has_recorded_consent());
--   ALTER POLICY connections_insert_follower ON public.connections
--     WITH CHECK (auth.uid() = follower_id);
--   ALTER POLICY rsvps_insert_own ON public.rsvps
--     WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY rsvps_update_own ON public.rsvps
--     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   ALTER POLICY users_select_authenticated ON public.users USING (true);
--   ALTER POLICY users_update_self ON public.users
--     USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--   -- 1b. the ten of section 11b, back to their measured text
--   ALTER POLICY events_insert_authenticated ON public.events
--     WITH CHECK ((auth.uid() = creator_id) AND public.has_recorded_consent());
--   ALTER POLICY events_update_creator ON public.events
--     USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
--   ALTER POLICY events_delete_creator ON public.events
--     USING (auth.uid() = creator_id);
--   ALTER POLICY orgs_update ON public.orgs
--     USING ((auth.uid() = owner_id) OR (public.org_member_role(id, auth.uid())
--       = ANY (ARRAY['owner'::text, 'admin'::text])))
--     WITH CHECK ((auth.uid() = owner_id) OR (public.org_member_role(id, auth.uid())
--       = ANY (ARRAY['owner'::text, 'admin'::text])));
--   ALTER POLICY orgs_delete ON public.orgs USING (auth.uid() = owner_id);
--   ALTER POLICY org_members_update ON public.org_members
--     USING ((public.org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--       'admin'::text])) AND (role <> 'owner'::text))
--     WITH CHECK ((role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text]))
--       AND ((role <> 'admin'::text)
--         OR (public.org_member_role(org_id, auth.uid()) = 'owner'::text)));
--   ALTER POLICY org_members_delete ON public.org_members
--     USING ((role <> 'owner'::text) AND ((user_id = auth.uid())
--       OR (public.org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--         'admin'::text]))));
--   ALTER POLICY org_channel_members_insert ON public.org_channel_members
--     WITH CHECK (EXISTS ( SELECT 1 FROM public.channels c
--       WHERE c.id = org_channel_members.channel_id AND c.org_id IS NOT NULL
--         AND public.org_member_role(c.org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--           'admin'::text])));
--   ALTER POLICY org_channel_members_delete ON public.org_channel_members
--     USING ((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM public.channels c
--       WHERE c.id = org_channel_members.channel_id AND c.org_id IS NOT NULL
--         AND public.org_member_role(c.org_id, auth.uid()) = ANY (ARRAY['owner'::text,
--           'admin'::text]))));
--   ALTER POLICY message_reactions_insert_member ON public.message_reactions
--     WITH CHECK ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
--        FROM public.messages m JOIN public.channels c ON c.id = m.channel_id
--       WHERE m.id = message_reactions.message_id
--         AND ((c.org_id IS NULL AND public.is_channel_member(m.channel_id))
--          OR (c.org_id IS NOT NULL
--              AND public.can_view_org_channel(m.channel_id, auth.uid()))))));
--   -- 2. reports, back to a client-writable table with four target types
--   DROP INDEX IF EXISTS public.reports_one_open_per_reporter_target;
--   DROP INDEX IF EXISTS public.reports_open_created;
--   ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
--   ALTER TABLE public.reports
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS resolved_by,
--     DROP COLUMN IF EXISTS resolved_at,
--     DROP COLUMN IF EXISTS resolution_note,
--     DROP COLUMN IF EXISTS target_owner_id,
--     DROP COLUMN IF EXISTS target_snapshot,
--     DROP COLUMN IF EXISTS admin_alerted_at;
--   ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
--   ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check
--     CHECK (target_type = ANY (ARRAY['user'::text, 'post'::text,
--                                     'message'::text, 'channel'::text]));
--   GRANT ALL ON TABLE public.reports TO anon, authenticated;
--   CREATE POLICY reports_insert_authenticated ON public.reports
--     FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
--   -- The collapsed duplicates keep their dismissal. Dropping `status` throws
--   -- it away, which is the honest answer: without a status column there is no
--   -- such thing as a dismissed report. Copy them out first if you want them:
--   --   CREATE TABLE report_collapse_backup AS
--   --     SELECT id, status, resolution_note FROM public.reports
--   --      WHERE resolution_note LIKE 'Collapsed by the moderation-foundation%';
--   -- 3. the three content tables, back to three columns fewer
--   ALTER TABLE public.posts
--     DROP COLUMN IF EXISTS removed_at, DROP COLUMN IF EXISTS removed_by,
--     DROP COLUMN IF EXISTS removed_reason;
--   ALTER TABLE public.post_comments
--     DROP COLUMN IF EXISTS removed_at, DROP COLUMN IF EXISTS removed_by,
--     DROP COLUMN IF EXISTS removed_reason;
--   ALTER TABLE public.messages
--     DROP COLUMN IF EXISTS removed_at, DROP COLUMN IF EXISTS removed_by,
--     DROP COLUMN IF EXISTS removed_reason;
--   -- Any removal recorded while this file was live is lost with the columns.
--   -- The moderation_actions rows that describe those removals are dropped in
--   -- step 4. Copy both out first if the rollback is not immediate.
--   -- 4. the two new tables (CASCADE takes the append-only trigger with them)
--   DROP TABLE IF EXISTS public.moderation_actions CASCADE;
--   DROP TABLE IF EXISTS public.account_restrictions CASCADE;
--   DROP FUNCTION IF EXISTS public.moderation_actions_append_only();
--   -- 5. the three SECURITY DEFINER readers, back to the bodies PRE-FLIGHT b
--   --    pinned by md5. CREATE OR REPLACE keeps each one's owner and ACL, so
--   --    nothing is granted or revoked here either.
--   CREATE OR REPLACE FUNCTION public.post_engagement_counts(p_post_ids uuid[], p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
--    RETURNS TABLE(post_id uuid, like_count integer, repost_count integer)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   #variable_conflict use_column
--   begin
--     if coalesce(cardinality(p_post_ids), 0) > 1000 then
--       raise exception 'too many ids (max 1000)' using errcode = '22023';
--     end if;
--     return query
--       select p.id,
--              (select count(*)::int from public.post_likes l
--                where l.post_id = p.id and (p_since is null or l.created_at >= p_since)),
--              (select count(*)::int from public.post_reposts r
--                where r.post_id = p.id and (p_since is null or r.created_at >= p_since))
--         from public.posts p
--        where p.id = any(p_post_ids)
--          and (p.status = 'published' or p.user_id = auth.uid())
--          and (p_since is null or p.user_id = auth.uid())
--          -- a hidden club's post answers only for its author and the club's
--          -- members: to everyone else the club does not exist.
--          and (p.org_id is null or p.user_id = auth.uid() or exists (
--                select 1 from public.orgs o
--                 where o.id = p.org_id
--                   and (o.hidden_at is null
--                        or exists (select 1 from public.org_members m
--                                    where m.org_id = o.id and m.user_id = auth.uid()))));
--   end $function$;
--
--   CREATE OR REPLACE FUNCTION public.comment_like_counts(p_comment_ids uuid[])
--    RETURNS TABLE(comment_id uuid, like_count integer)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   #variable_conflict use_column
--   begin
--     if coalesce(cardinality(p_comment_ids), 0) > 1000 then
--       raise exception 'too many ids (max 1000)' using errcode = '22023';
--     end if;
--     return query
--       select c.id, count(cl.user_id)::int
--         from public.post_comments c
--         join public.posts p on p.id = c.post_id
--         left join public.comment_likes cl on cl.comment_id = c.id
--        where c.id = any(p_comment_ids)
--          and (p.status = 'published' or p.user_id = auth.uid())
--          and (p.org_id is null or p.user_id = auth.uid() or exists (
--                select 1 from public.orgs o
--                 where o.id = p.org_id
--                   and (o.hidden_at is null
--                        or exists (select 1 from public.org_members m
--                                    where m.org_id = o.id and m.user_id = auth.uid()))))
--        group by c.id;
--   end $function$;
--
--   CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
--    RETURNS boolean
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_user_id uuid := auth.uid();
--     v_author uuid;
--     v_org_id uuid;
--     v_inserted boolean := false;
--   BEGIN
--     IF v_user_id IS NULL THEN
--       RETURN false;
--     END IF;
--
--     SELECT user_id, org_id INTO v_author, v_org_id
--       FROM public.posts
--      WHERE id = p_post_id;
--
--     IF v_author IS NULL THEN
--       -- Deleted or never-existed post. The FK would have rejected the insert.
--       RETURN false;
--     END IF;
--
--     IF v_author = v_user_id THEN
--       -- Looking at your own post doesn't count. Mirrors record_profile_view.
--       RETURN false;
--     END IF;
--
--     IF v_org_id IS NOT NULL AND NOT public.org_content_visible(v_org_id) THEN
--       -- A hidden club's post, and the club is hidden from this viewer: to them
--       -- the post doesn't exist, so it answers like a missing one.
--       RETURN false;
--     END IF;
--
--     INSERT INTO public.post_views (post_id, user_id)
--     VALUES (p_post_id, v_user_id)
--     ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
--     RETURNING true INTO v_inserted;
--
--     IF v_inserted THEN
--       UPDATE public.posts
--          SET view_count = view_count + 1
--        WHERE id = p_post_id;
--     END IF;
--
--     RETURN COALESCE(v_inserted, false);
--   END;
--   $function$;
--
--   -- 6. email_sends, back to two kinds. Any 'moderation_alert' row written
--   --    while this file was live has to go first or the constraint will not
--   --    validate. Nothing is lost that matters: a send-log row says an alert
--   --    was attempted, and with the alert itself rolled back there is no
--   --    alert for it to describe.
--   DELETE FROM public.email_sends WHERE kind = 'moderation_alert';
--   ALTER TABLE public.email_sends DROP CONSTRAINT email_sends_kind_check;
--   ALTER TABLE public.email_sends ADD CONSTRAINT email_sends_kind_check
--     CHECK (kind IN ('school_verification', 'password_reset'));
--   -- 7. the grants sections 14 and 15 took, back to the measured shape.
--   --    Nothing here is a policy or a function, so it has no ordering
--   --    relationship with the six steps above; it is last because it is the
--   --    one part of the rollback that RE-OPENS something. Running it means
--   --    deciding, deliberately, that a student may write their own headline
--   --    and their own event's title straight through PostgREST again, with
--   --    the word filter bypassed. If the rollback is because a POLICY is
--   --    wrong, stop at step 6: these two grants are independent of every
--   --    policy in this file and can stay shut on their own.
--   GRANT UPDATE (name, bio, tagline, headline, location_text, major)
--     ON public.users TO authenticated;
--   -- events goes back to a TABLE-level grant, so the column entries have to
--   -- come off first: a column ACL left standing beside a table grant is
--   -- harmless but it makes relacl/attacl read differently from the measured
--   -- state, and the next file's pre-check compares against that state.
--   REVOKE UPDATE (id, org_id, creator_id, starts_at, ends_at, created_at)
--     ON public.events FROM authenticated;
--   GRANT UPDATE ON TABLE public.events TO authenticated;
--   -- Afterwards: users authenticated=dDxtm with 17 column UPDATE grants
--   -- again, events authenticated=arwd with attacl null on all nine columns.
--   -- 8. the three helpers, now that nothing names them
--   DROP FUNCTION IF EXISTS public.can_publish_now();
--   DROP FUNCTION IF EXISTS public.is_restricted_now();
--   DROP FUNCTION IF EXISTS public.user_visible(uuid);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260923090000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Afterwards: 31 policies on the nine tables again, reports back to
-- anon=arwdDxtm/authenticated=arwdDxtm with its INSERT policy, the three md5s
-- in PRE-FLIGHT b read 04181f65..., 6e5c73de... and be0f6bf2... again, the two
-- policy md5s read b28be642... and 35242fa7... again, and
-- email_sends_kind_check reads its two-kind form again. Rolling back reopens
-- both holes acceptance proved: a banned account can create events and a
-- suspended officer can rewrite their club, over PostgREST, until the routes
-- are the only gate again.
-- ---------------------------------------------------------------------------

begin;

-- ALTER POLICY and ADD COLUMN each hold an ACCESS EXCLUSIVE lock on their table
-- until COMMIT. This makes the file fail whole instead of queueing behind a
-- long reader and stalling the feed; then simply run it again.
set local lock_timeout = '5s';

-- 0a. The 18 policies this file drops or rewrites must be the MEASURED ones,
--     word for word. A 19th permissive policy on one of these tables would OR
--     around every check below, and a changed text would make the ROLLBACK
--     restore the wrong thing. Any difference aborts the whole file (and a
--     second run stops here). The comparison is on an md5 because two of the
--     messages policies are twelve lines each; the exception prints the real
--     text so the difference is readable.
do $$
declare
  want text := 'b28be6423753fe4ad7a3493cd0b29cae';
  got text;
  bad text;
begin
  select replace(string_agg(format('%s.%s %s %s | %s', tablename, policyname, cmd,
                                   coalesce(qual, '-'), coalesce(with_check, '-')),
                            E'\n' order by tablename::text collate "C",
                                           policyname::text collate "C"), 'public.', '')
    into got
    from pg_policies
   where schemaname = 'public'
     and (tablename, policyname) in (
       ('posts', 'posts_select_authenticated'), ('posts', 'posts_insert_authenticated'),
       ('posts', 'posts_update_own'),
       ('post_comments', 'post_comments_select_authenticated'),
       ('post_comments', 'post_comments_insert_own'),
       ('post_reposts', 'post_reposts_insert_own'),
       ('post_reposts', 'post_reposts_update_own'),
       ('messages', 'messages_select_member'), ('messages', 'messages_select_org_member'),
       ('messages', 'messages_insert_member'), ('messages', 'messages_insert_org_member'),
       ('channels', 'channels_insert_authenticated'),
       ('connections', 'connections_insert_follower'),
       ('rsvps', 'rsvps_insert_own'), ('rsvps', 'rsvps_update_own'),
       ('users', 'users_select_authenticated'), ('users', 'users_update_self'),
       ('reports', 'reports_insert_authenticated'));
  if md5(coalesce(got, '')) is distinct from want then
    raise exception 'mod-a: the 18 policies are not the ones this file was written against (md5 %); stop and re-read them:%',
      md5(coalesce(got, '')), E'\n' || coalesce(got, '(none)');
  end if;

  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments', 'post_reposts', 'messages',
                       'channels', 'connections', 'rsvps', 'users', 'reports')
     and (roles <> array['authenticated']::name[] or permissive <> 'PERMISSIVE');
  if bad is not null then
    raise exception 'mod-a: expected every policy on these tables to be TO authenticated and PERMISSIVE: %', bad;
  end if;

  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('posts', 'post_comments', 'post_reposts', 'messages',
                       'channels', 'connections', 'rsvps', 'users', 'reports')
     and not c.relrowsecurity;
  if bad is not null then
    raise exception 'mod-a: row level security is off on: %', bad;
  end if;
end $$;

-- 0b. reports is the table this file takes away from the client, so its CHECK
--     and its ACL must be the ones the REVOKE and the widened CHECK were
--     written against. The three DEFINER readers must be the bodies the
--     ROLLBACK restores. And every name this file creates must be free.
do $$
declare
  got text;
  bad text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.reports'::regclass and conname = 'reports_target_type_check';
  if got is distinct from
     'CHECK ((target_type = ANY (ARRAY[''user''::text, ''post''::text, ''message''::text, ''channel''::text])))'
  then
    raise exception 'mod-a: reports_target_type_check is not the one this file widens: %', coalesce(got, '(missing)');
  end if;

  -- anon and authenticated hold everything on reports today; the REVOKE below
  -- takes it all back. If they already hold less, someone else has been here.
  if not (has_table_privilege('anon', 'public.reports', 'INSERT')
          and has_table_privilege('anon', 'public.reports', 'SELECT')
          and has_table_privilege('authenticated', 'public.reports', 'INSERT')
          and has_table_privilege('authenticated', 'public.reports', 'SELECT')) then
    raise exception 'mod-a: reports no longer grants anon/authenticated INSERT and SELECT; stop and re-read its ACL';
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.reports'::regclass and a.attnum > 0
                and a.attacl is not null) then
    raise exception 'mod-a: reports has column-level grants; REVOKE ALL ON TABLE would not describe the whole change';
  end if;

  select string_agg(x.sig || ' = ' || md5(pg_get_functiondef(x.sig::regprocedure)), '; ') into bad
    from (values
      ('public.post_engagement_counts(uuid[],timestamptz)', '04181f65eac63a2fade27bc559720434'),
      ('public.comment_like_counts(uuid[])',                '6e5c73ded4b1e8a7b7bc5f417df5c65e'),
      ('public.record_post_view(uuid)',                     'be0f6bf244dbca7991500c01a02e4124')
    ) as x(sig, want)
   where md5(pg_get_functiondef(x.sig::regprocedure)) is distinct from x.want;
  if bad is not null then
    raise exception 'mod-a: a count/view function has an unexpected body; stop and rebuild this file AND its ROLLBACK from it: %', bad;
  end if;

  select string_agg(n, ', ') into bad from unnest(array[
    'is_restricted_now', 'can_publish_now', 'user_visible', 'moderation_actions_append_only'
  ]) as n
   where exists (select 1 from pg_proc p
                  where p.pronamespace = 'public'::regnamespace and p.proname = n);
  if bad is not null then
    raise exception 'mod-a: these function names are already taken: %', bad;
  end if;
  if to_regclass('public.account_restrictions') is not null
     or to_regclass('public.moderation_actions') is not null then
    raise exception 'mod-a: account_restrictions or moderation_actions already exists; stop and re-read it';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name in ('posts', 'post_comments', 'messages')
                and column_name in ('removed_at', 'removed_by', 'removed_reason')) then
    raise exception 'mod-a: a removed_* column already exists on posts, post_comments or messages';
  end if;
end $$;

-- 0c. email_sends has to be the table 20260922104000 created, carrying the CHECK
--     section 13 widens. Checked up here with the rest, so the file refuses
--     before it writes anything rather than in the middle.
do $$
declare
  got text;
begin
  if to_regclass('public.email_sends') is null then
    raise exception 'mod-a: public.email_sends is missing; apply 20260922104000_email_sends.sql first';
  end if;
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  if got is distinct from
     'CHECK ((kind = ANY (ARRAY[''school_verification''::text, ''password_reset''::text])))'
  then
    raise exception 'mod-a: email_sends_kind_check is not the one this file widens: %', coalesce(got, '(missing)');
  end if;
end $$;

-- 0d. The five tables section 11b reaches. Acceptance proved two of these open
--     with nothing but the public anon key: a banned account created an event,
--     and a suspended officer renamed their club. The ANDs below are written
--     against the exact policies measured on 2026-09-23, so a changed text
--     would make the ROLLBACK restore the wrong thing, and an eleventh
--     permissive write policy would simply OR around every check. Either
--     aborts the file.
do $$
declare
  want text := 'a844c6e9c30279936613bded897a6d72';
  got text;
  bad text;
  n int;
begin
  select replace(string_agg(format('%s.%s %s %s | %s', tablename, policyname, cmd,
                                   coalesce(qual, '-'), coalesce(with_check, '-')),
                            E'\n' order by tablename::text collate "C",
                                           policyname::text collate "C"), 'public.', '')
    into got
    from pg_policies
   where schemaname = 'public'
     and (tablename, policyname) in (
       ('events', 'events_insert_authenticated'), ('events', 'events_update_creator'),
       ('events', 'events_delete_creator'),
       ('orgs', 'orgs_update'), ('orgs', 'orgs_delete'),
       ('org_members', 'org_members_update'), ('org_members', 'org_members_delete'),
       ('org_channel_members', 'org_channel_members_insert'),
       ('org_channel_members', 'org_channel_members_delete'),
       ('message_reactions', 'message_reactions_insert_member'));
  if md5(coalesce(got, '')) is distinct from want then
    raise exception 'mod-a: the 10 policies of section 11b are not the ones this file was written against (md5 %); stop and re-read them:%',
      md5(coalesce(got, '')), E'\n' || coalesce(got, '(none)');
  end if;

  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('events', 'orgs', 'org_members', 'org_channel_members',
                       'message_reactions')
     and (roles <> array['authenticated']::name[] or permissive <> 'PERMISSIVE');
  if bad is not null then
    raise exception 'mod-a: expected every policy on the five 11b tables to be TO authenticated and PERMISSIVE: %', bad;
  end if;

  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('events', 'orgs', 'org_members', 'org_channel_members',
                       'message_reactions');
  if n <> 17 then
    raise exception 'mod-a: expected 17 policies on the five 11b tables, found %', n;
  end if;

  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('events', 'orgs', 'org_members', 'org_channel_members',
                       'message_reactions')
     and not c.relrowsecurity;
  if bad is not null then
    raise exception 'mod-a: row level security is off on: %', bad;
  end if;

  -- What an officer may rewrite on `orgs` is a COLUMN ACL, and that is the
  -- reason the AND below is worth anything: authenticated holds UPDATE on the
  -- club's public face (name, description, tags, links, philanthropy, the two
  -- images, the backdrop, updated_at) and on nothing else. If it ever held
  -- table-level UPDATE there, the same PATCH would reach hidden_at, verified,
  -- owner_id and handle — an officer undoing an admin's hide with one curl.
  select string_agg('orgs.' || c.col, ', ') into bad
    from unnest(array['hidden_at', 'verified', 'owner_id', 'handle', 'is_public']) as c(col)
   where has_column_privilege('authenticated', 'public.orgs', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: authenticated can write an admin-only column on orgs: %', bad;
  end if;
  if not has_column_privilege('authenticated', 'public.orgs', 'name', 'UPDATE') then
    raise exception 'mod-a: authenticated cannot update orgs.name, so the club PATCH this file gates is already shut; stop and re-read the grants';
  end if;

  -- `events` is the opposite case and the reason the officer AND below is worth
  -- writing: authenticated holds arwd at TABLE level, so org_id is writable on
  -- both INSERT and UPDATE and a student can name any club as the event's
  -- author. If that ever stops being true the AND is dead weight rather than a
  -- gate, and this file should say so out loud instead of looking protected.
  select string_agg('events.org_id ' || g.priv, ', ') into bad
    from unnest(array['INSERT', 'UPDATE']) as g(priv)
   where not has_column_privilege('authenticated', 'public.events', 'org_id', g.priv);
  if bad is not null then
    raise exception 'mod-a: authenticated cannot write events.org_id (%), so the club-attribution AND in section 11b guards nothing; stop and re-read the grants', bad;
  end if;
end $$;

-- 0e. The two grant shapes sections 14 and 15 change. Both revokes were written
--     against a measured ACL and each one is worthless — silently — if that ACL
--     has moved, so both are checked before anything is written. The failure
--     mode is the dangerous kind: a REVOKE against the wrong shape does not
--     error, it warns, and the file would read as though it had closed a hole
--     it left wide open.
do $$
declare
  bad text;
begin
  -- users: the column ACL is the only UPDATE path, and has_table_privilege
  -- answers about the TABLE grant alone (it is false on users today, with 17
  -- column grants standing). So a true here means a `w` has appeared in
  -- relacl, and a table-level UPDATE covers every column: section 14's column
  -- revoke would close nothing while reading as though it had.
  if has_table_privilege('authenticated', 'public.users', 'UPDATE') then
    raise exception 'mod-a: public.users now grants UPDATE at TABLE level, so revoking six columns would close nothing; stop and re-read its ACL';
  end if;
  -- The six must actually be writable today, or the live bypass this batch was
  -- sent to close is already closed by someone else and this file is guessing.
  select string_agg('users.' || c.col, ', ') into bad
    from unnest(array['name', 'bio', 'tagline', 'headline', 'location_text', 'major']) as c(col)
   where not has_column_privilege('authenticated', 'public.users', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: authenticated already cannot update % on users; someone has been here, stop and re-read the grants', bad;
  end if;
  -- And the control columns section 16k asserts afterwards: the revoke must be
  -- exactly six wide, so these have to be open going in.
  select string_agg('users.' || c.col, ', ') into bad
    from unnest(array['last_active_at', 'website', 'year', 'otto_settings']) as c(col)
   where not has_column_privilege('authenticated', 'public.users', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: % is already unwritable on users, so the "exactly six wide" check after the revoke would pass for the wrong reason; stop and re-read the grants', bad;
  end if;

  -- events is the mirror image: UPDATE is TABLE-level with no column ACL
  -- anywhere, which is the one shape where a column REVOKE is a no-op. Section
  -- 15 therefore takes the table grant back and re-grants six columns by name,
  -- and that rewrite only describes reality if reality is still this.
  if not has_table_privilege('authenticated', 'public.events', 'UPDATE') then
    raise exception 'mod-a: authenticated no longer holds UPDATE on public.events; section 15 was written against a table-level grant, stop and re-read it';
  end if;
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'public.events'::regclass and a.attnum > 0
                and a.attacl is not null) then
    raise exception 'mod-a: public.events has column-level grants; section 15 re-grants a fixed list of six and would drop whatever else is there. Stop and re-read attacl';
  end if;
  -- INSERT must be table-level too: section 15 touches UPDATE only, and the
  -- create route (src/app/api/events/route.ts:537) writes every column on the
  -- caller's own client. If INSERT were a column ACL the REVOKE below would
  -- still be correct, but this file's claim that "the create path is
  -- unaffected" would need re-checking rather than restating.
  if not has_table_privilege('authenticated', 'public.events', 'INSERT') then
    raise exception 'mod-a: authenticated no longer holds INSERT on public.events; the create route would already be broken, stop and re-read the grants';
  end if;
  -- The nine columns this file expects. A tenth would be silently left with no
  -- UPDATE grant by the re-grant below, which is a change nobody asked for.
  select string_agg(a.attname, ', ') into bad
    from pg_attribute a
   where a.attrelid = 'public.events'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname <> all (array['id', 'org_id', 'creator_id', 'title', 'description',
                                 'starts_at', 'ends_at', 'location', 'created_at']);
  if bad is not null then
    raise exception 'mod-a: public.events has grown a column this file does not know about (%); section 15 would leave it with no UPDATE grant. Decide about it first', bad;
  end if;
end $$;

-- 1. account_restrictions -----------------------------------------------------
-- A suspension or a ban. The row is keyed on identity_key, an HMAC of the
-- canonical school email, as well as on user_id, because the whole point is
-- that it outlives the account: user_id goes null when the student deletes
-- their account (DELETE /api/me has to keep working for a restricted student,
-- and every users FK cascades), while identity_key carries NO foreign key at
-- all and keeps standing. That is the part school-email verification tests, so
-- deleting the account and signing up again cannot re-verify the same school
-- email. key_kind 'personal' is written as evidence; nothing tests it, because
-- sign-up never passes through a Vibe route (see the header).
--
-- THE THREE FKs BELOW KEEP THEIR ON DELETE SET NULL, and that is a decision,
-- not the default falling through. SET NULL performs an UPDATE on this row
-- during the account deletion, so it is refused by any BEFORE UPDATE trigger
-- on this table — which is exactly the trap moderation_actions walked into.
-- This table has no trigger at all (checked; the FK sweep is in MEASURED), so
-- the UPDATE lands, and for user_id landing IS the mechanism: it going null is
-- what leaves identity_key standing on its own, and identity_key carries no
-- foreign key, so the restriction survives the account. Never add a trigger
-- here that refuses UPDATE — it would make a banned student undeletable.
create table public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null,
  key_kind text not null check (key_kind in ('school', 'personal')),
  user_id uuid references public.users (id) on delete set null,
  kind text not null check (kind in ('suspension', 'ban')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason_code text not null,
  note text check (note is null or length(note) <= 2000),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.users (id) on delete set null,
  -- A suspension always ends; a ban is permanent (ends_at null).
  constraint account_restrictions_suspension_has_end
    check (kind <> 'suspension' or ends_at is not null),
  constraint account_restrictions_ends_after_start
    check (ends_at is null or ends_at > starts_at)
);

-- The only two questions ever asked of this table: "is this account restricted
-- right now" and "is this school identity restricted right now". Both run over
-- the rows that have not been lifted, so both indexes are partial.
create index account_restrictions_active_user
  on public.account_restrictions (user_id) where lifted_at is null;
create index account_restrictions_active_identity
  on public.account_restrictions (identity_key) where lifted_at is null;

alter table public.account_restrictions enable row level security;
-- RLS on with no policies, AND the grants taken back. Supabase's default
-- privileges (pg_default_acl) hand anon, authenticated and service_role
-- arwdDxtm on every new table in public, which is exactly how reports ended up
-- world-writable behind RLS. Revoking is the boundary; RLS is the second lock.
-- service_role is revoked and re-granted by name so the grant line below says
-- something true instead of restating a default: the four the admin API needs
-- (lifting a restriction is an UPDATE), and not TRUNCATE.
revoke all on table public.account_restrictions from anon, authenticated, service_role;
grant select, insert, update, delete on table public.account_restrictions to service_role;

comment on table public.account_restrictions is
  'Suspensions and bans. identity_key (HMAC of the canonical school email, RESTRICTION_PEPPER) carries no FK on purpose, so a restriction survives the account being deleted. Service role only.';

-- 2. moderation_actions --------------------------------------------------------
-- One row per thing a moderator did, and it is never edited. The row outlives
-- everything it points at — the moderator, the report, the thing acted on —
-- because the log is the record of what was DONE, not of who still exists.
--
-- SO IT CARRIES NO FOREIGN KEY AT ALL, and the reason is not tidiness. An FK
-- with ON DELETE SET NULL performs an UPDATE on this row when the referenced
-- row goes; moderation_actions_no_change below refuses every UPDATE with
-- 42501; and Postgres runs a referential action inside the DELETE, so the
-- refusal aborts the DELETE. Written the obvious way, `actor_id uuid
-- references public.users (id) on delete set null` means A PLATFORM ADMIN WHO
-- HAS EVER MODERATED ANYTHING CAN NEVER DELETE THEIR ACCOUNT: DELETE /api/me
-- calls auth.admin.deleteUser, that cascades into public.users, the cascade
-- reaches here, the trigger raises, and the whole deletion fails with a
-- permission error three tables from anything the student did. Keeping the log
-- honest is not worth taking away someone's right to leave, and softening the
-- trigger is the wrong half to give up: append-only has to mean append-only
-- for service_role and postgres too, or the log is worth nothing in an appeal.
-- So the FK goes and the uuid stays. billing_events.user_id already makes this
-- exact choice for this exact reason, and target_id below has always said it.
-- The cost is real and small: actor_id and report_id can point at a row that
-- no longer exists, so every reader must LEFT JOIN and render a missing
-- moderator as "a former admin" rather than dropping the row.
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  -- No FK (see above): the account may be deleted and the log still has to say
  -- who did it. Nulled by nothing; it simply stops resolving.
  actor_id uuid,
  action text not null check (action in (
    'report_dismiss', 'report_action',
    'post_remove', 'post_restore',
    'comment_remove', 'comment_restore',
    'message_remove', 'message_restore',
    'org_hide', 'org_unhide', 'org_verify', 'org_unverify',
    'user_suspend', 'user_ban', 'user_lift')),
  target_type text not null check (target_type in (
    'post', 'comment', 'message', 'user', 'org', 'event', 'channel', 'report')),
  -- No FK: the thing acted on may be deleted later, and the log still has to
  -- say what happened to it. Same reasoning as reports.target_id.
  target_id uuid not null,
  -- No FK either, and for the same reason as actor_id rather than as target_id.
  -- Nothing deletes a report today (they are closed, never removed), so this is
  -- a landmine rather than a live break — but `references reports on delete set
  -- null` on an append-only table is the same contradiction, and the day
  -- somebody adds a report purge it would fail as a 42501 on the purge.
  report_id uuid,
  reason text not null default '' check (length(reason) <= 2000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index moderation_actions_created on public.moderation_actions (created_at desc);
create index moderation_actions_target on public.moderation_actions (target_type, target_id);
create index moderation_actions_actor on public.moderation_actions (actor_id);
create index moderation_actions_report on public.moderation_actions (report_id)
  where report_id is not null;

alter table public.moderation_actions enable row level security;
-- The REVOKE has to name service_role too, and that is not belt and braces.
-- pg_default_acl hands anon, authenticated AND service_role arwdDxtm on every
-- new table in public, so a bare `grant select, insert to service_role` would
-- be a no-op and the log would be quietly editable by the admin API. Take it
-- all back first, then grant exactly the two the admin API needs: INSERT and
-- SELECT. No UPDATE, no DELETE, for anybody but the owner.
revoke all on table public.moderation_actions from anon, authenticated, service_role;
grant select, insert on table public.moderation_actions to service_role;

-- Append-only, and it means everyone. A trigger is not row level security: it
-- fires for the service role and for postgres too, which is the point. To
-- correct a genuine mistake by hand:
--   ALTER TABLE public.moderation_actions DISABLE TRIGGER moderation_actions_no_change;
--   ... the fix ...
--   ALTER TABLE public.moderation_actions ENABLE TRIGGER moderation_actions_no_change;
-- A trigger function returns trigger, so the standing EXECUTE-grant rule does
-- not apply to it and the post-check's function count does not include it.
create function public.moderation_actions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'moderation_actions is append-only; % is refused', tg_op
    using errcode = '42501';
end;
$$;

create trigger moderation_actions_no_change
  before update or delete on public.moderation_actions
  for each row execute function public.moderation_actions_append_only();

comment on table public.moderation_actions is
  'Append-only moderation log: one row per admin action. RLS on with no policies, no client grants, and a trigger that refuses UPDATE and DELETE for every role. NO foreign keys on purpose: a referential action (ON DELETE SET NULL) is an UPDATE, the trigger refuses it, and the refusal would abort the DELETE that triggered it — an admin who had moderated anything could not delete their account. actor_id, report_id and target_id are plain uuids that may stop resolving; read them with a LEFT JOIN.';

-- 3. The three policy helpers ---------------------------------------------------
-- All three are SECURITY DEFINER because account_restrictions is service-role
-- only: a policy that read it under the caller's own RLS would see nothing and
-- everyone would look unrestricted. All three use `set search_path to 'public'`
-- with schema-qualified names, the idiom of has_recorded_consent and the count
-- functions this file also replaces. auth.uid() is schema-qualified either way,
-- which is the part that silently returns null if you get it wrong.
-- Standing rule (rulings.md): every role that could reach them may call them,
-- and they refuse inside. Nothing is revoked, here or anywhere in this file.

-- Is the caller restricted right now? Anon: no caller, so false.
create function public.is_restricted_now()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.account_restrictions r
        where r.user_id = (select auth.uid())
          and r.lifted_at is null
          and r.starts_at <= now()
          and (r.ends_at is null or r.ends_at > now()));
$$;

grant execute on function public.is_restricted_now() to anon, authenticated, service_role;

comment on function public.is_restricted_now() is
  'Moderation v1: true when the caller (auth.uid()) has a suspension or ban in force; false for anon. Used by the write policies and by user-facing gates that must not depend on a route.';

-- May this account be seen by other people at all? A restricted student's
-- profile, posts and comments are hidden from everyone else while the
-- restriction lasts (Franky's decision 1). A null id is "nobody in
-- particular", which is visible, so a policy can pass a nullable column
-- straight in. Anon gets false: no policy that calls this is TO anon, and
-- failing closed is the right way round.
create function public.user_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select current_setting('role', true) is distinct from 'anon'
     and (p_user_id is null
          or not exists (
            select 1
              from public.account_restrictions r
             where r.user_id = p_user_id
               and r.lifted_at is null
               and r.starts_at <= now()
               and (r.ends_at is null or r.ends_at > now())));
$$;

grant execute on function public.user_visible(uuid) to anon, authenticated, service_role;

comment on function public.user_visible(uuid) is
  'Moderation v1: false while that account has a restriction in force, true otherwise (and for a null id). ACCEPTED LEAK, the same one as org_content_visible: a signed-in student can ask rpc/user_visible about any uuid. It tells them nothing the policies do not already tell them — a restricted account''s users row simply stops coming back, exactly like a deleted one.';

-- May the caller publish? Terms and age recorded, school email verified, and
-- no restriction in force. This is the question behind requireCanPublish in
-- src/lib/moderation/access.ts, so a route and the database give one answer.
create function public.can_publish_now()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
           select 1
             from public.users u
            where u.id = (select auth.uid())
              and u.terms_accepted_at is not null
              and u.age_attested_at is not null
              and u.school_verified)
     and not public.is_restricted_now();
$$;

grant execute on function public.can_publish_now() to anon, authenticated, service_role;

comment on function public.can_publish_now() is
  'Moderation v1: true when the caller has recorded consent, has a verified school email and has no restriction in force; false for anon. The database half of requireCanPublish.';

-- 4. reports gets a life cycle -------------------------------------------------
-- reason_code (the picker) and reason (the free text, <= 1000) keep the names
-- they have had since 20260506100000. Nothing is renamed and there is no
-- `details` column.
alter table public.reports
  add column status text not null default 'open',
  add column resolved_by uuid references public.users (id) on delete set null,
  add column resolved_at timestamptz,
  add column resolution_note text check (resolution_note is null or length(resolution_note) <= 2000),
  -- Who owns the reported thing, as it stood at report time. No FK: the owner
  -- may delete their account, and the report still has to say who it was about.
  add column target_owner_id uuid,
  -- The reported words, handles and media urls at report time, so an admin
  -- reviews what was reported rather than what has since been edited away.
  -- It holds student text and stays in the database: the alert email carries
  -- type, reason, open count and a link only.
  add column target_snapshot jsonb,
  add column admin_alerted_at timestamptz;

alter table public.reports
  add constraint reports_status_check
  check (status in ('open', 'actioned', 'dismissed'));

-- Comments, clubs and events become reportable. target_id stays uuid NOT NULL,
-- so an org or event report carries the UUID and the route resolves the handle
-- (orgs has no slug column; its human key is orgs.handle).
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('user', 'post', 'comment', 'message', 'channel', 'org', 'event'));

-- Collapse repeat reports BEFORE the unique index exists, or the index build
-- aborts the whole migration. Every pre-existing row just got status 'open' in
-- this same transaction, so any two reports of the same thing by the same
-- person now collide. The decision: the OLDEST one stays open, the rest are
-- dismissed with a note that says a migration did it. Nothing is deleted.
-- Rows whose reporter deleted their account (reporter_id null) are left alone,
-- because a btree unique index treats nulls as distinct and they cannot
-- collide. PRE-FLIGHT d measures this on production; the local copy has 0
-- reports, so a green local run proves nothing about it.
with ranked as (
  select id,
         row_number() over (partition by reporter_id, target_type, target_id
                            order by created_at, id) as rn
    from public.reports
   where status = 'open'
     and reporter_id is not null
)
update public.reports r
   set status = 'dismissed',
       resolved_at = now(),
       resolution_note = 'Collapsed by the moderation-foundation migration: the same person reported the same thing more than once before reports had a status. The oldest of those reports stayed open.'
  from ranked
 where ranked.id = r.id
   and ranked.rn > 1;

-- One open report per person per thing. Reporting the same thing again while a
-- report is open is a no-op the route answers with success; once a report is
-- resolved, the same person can report the thing again.
create unique index reports_one_open_per_reporter_target
  on public.reports (reporter_id, target_type, target_id)
  where status = 'open';

create index reports_open_created on public.reports (created_at desc)
  where status = 'open';

-- The client stops writing reports. The route inserts with the service role,
-- which is where the rate limit and the "can you even see this target" check
-- live. Dropping the policy is not enough on its own: anon AND authenticated
-- both hold arwdDxtm here, so the grants are the boundary and the policy was
-- only ever the second lock.
drop policy reports_insert_authenticated on public.reports;
revoke all on table public.reports from anon, authenticated;

comment on column public.reports.target_snapshot is
  'What was reported, captured at report time (text, handles, media urls). Student text: it stays in the database and never goes into an email.';

-- 5. Soft removal on posts, comments and messages -------------------------------
-- Soft, because the row is evidence: an admin can restore it, and the author is
-- shown "Removed by Vibe moderators" and the reason rather than finding a hole.
-- removed_by goes null if that founder's account is ever deleted; the removal
-- still stands. No index on removed_at: removals are rare and the policies read
-- `removed_at is null`, which matches nearly every row, so an index would never
-- be chosen.
alter table public.posts
  add column removed_at timestamptz,
  add column removed_by uuid references public.users (id) on delete set null,
  add column removed_reason text check (removed_reason is null or length(removed_reason) <= 2000);

alter table public.post_comments
  add column removed_at timestamptz,
  add column removed_by uuid references public.users (id) on delete set null,
  add column removed_reason text check (removed_reason is null or length(removed_reason) <= 2000);

alter table public.messages
  add column removed_at timestamptz,
  add column removed_by uuid references public.users (id) on delete set null,
  add column removed_reason text check (removed_reason is null or length(removed_reason) <= 2000);

-- 6. posts ----------------------------------------------------------------------
-- A published post is visible when it has not been removed, its author is not
-- restricted, and the club (if any) is not hidden from the caller. The author's
-- own arm is untouched and comes last, so they keep seeing their own removed
-- post — that is what carries the notice — and keep seeing their own drafts.
-- Conditions kept from the old policy are restated word for word, because
-- ALTER POLICY replaces the whole expression.
alter policy posts_select_authenticated on public.posts
  using (
    (status = 'published'
      and removed_at is null
      and public.user_visible(user_id)
      and (org_id is null or public.org_content_visible(org_id)))
    or user_id = (select auth.uid())
  );

-- Publishing and editing a post both need a verified school email and no
-- restriction. has_recorded_consent() stays in the text so the ROLLBACK is a
-- straight subtraction; can_publish_now() asks it again, which costs one more
-- primary-key probe of the same users row on a write that is not hot.
alter policy posts_insert_authenticated on public.posts
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
  );

alter policy posts_update_own on public.posts
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
  );

-- 7. post_comments ---------------------------------------------------------------
-- Your own comments always, so post_comments_delete_own keeps working on a
-- comment of yours that was removed or whose post was taken down. For everyone
-- else: not removed, author not restricted, and the post itself still visible —
-- and that EXISTS runs posts' policy just above, which is why removing a POST
-- also takes its whole comment thread out of everyone else's view.
alter policy post_comments_select_authenticated on public.post_comments
  using (
    user_id = (select auth.uid())
    or (removed_at is null
        and public.user_visible(user_id)
        and exists (select 1 from public.posts p where p.id = post_comments.post_id))
  );

alter policy post_comments_insert_own on public.post_comments
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
    and exists (select 1 from public.posts p where p.id = post_comments.post_id)
  );

-- 8. post_reposts -----------------------------------------------------------------
-- A repost is publishing. The EXISTS needs no new clause: a removed post and a
-- restricted author's post both stop coming back from posts' own policy, so
-- neither can be reposted or re-quoted.
alter policy post_reposts_insert_own on public.post_reposts
  with check (
    (auth.uid() = user_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
    and exists (select 1 from public.posts p where p.id = post_reposts.post_id)
  );

alter policy post_reposts_update_own on public.post_reposts
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and public.can_publish_now()
    and exists (select 1 from public.posts p where p.id = post_reposts.post_id)
  );

-- 9. messages ---------------------------------------------------------------------
-- The unambiguous rule, the same shape as posts and comments: the sender still
-- sees their own removed message, so the client can show "Removed by Vibe
-- moderators"; nobody else sees it at all. (If it should be hidden from the
-- sender too, that is a one-word change here — drop the `or user_id` arm — but
-- the file must not be vague about which it is.)
alter policy messages_select_member on public.messages
  using (
    (removed_at is null or user_id = (select auth.uid()))
    and exists (
      select 1
        from public.channel_members cm
        join public.channels c on c.id = cm.channel_id
       where cm.channel_id = messages.channel_id
         and cm.user_id = auth.uid()
         and c.org_id is null)
  );

alter policy messages_select_org_member on public.messages
  using (
    (removed_at is null or user_id = (select auth.uid()))
    and exists (
      select 1
        from public.channels c
       where c.id = messages.channel_id
         and c.org_id is not null
         and public.can_view_org_channel(c.id, auth.uid()))
  );

-- Sending a message needs a verified school email and no restriction. The
-- block check and the membership check are restated word for word.
alter policy messages_insert_member on public.messages
  with check (
    (auth.uid() = user_id)
    and exists (
      select 1
        from public.channel_members cm
        join public.channels c on c.id = cm.channel_id
       where cm.channel_id = messages.channel_id
         and cm.user_id = auth.uid()
         and c.org_id is null)
    and not exists (
      select 1
        from public.channel_members peer
        join public.blocks b
          on ((b.blocker_id = auth.uid() and b.blocked_id = peer.user_id)
           or (b.blocker_id = peer.user_id and b.blocked_id = auth.uid()))
       where peer.channel_id = messages.channel_id
         and peer.user_id <> auth.uid())
    and public.has_recorded_consent()
    and public.can_publish_now()
  );

alter policy messages_insert_org_member on public.messages
  with check (
    (auth.uid() = user_id)
    and exists (
      select 1
        from public.channels c
       where c.id = messages.channel_id
         and c.org_id is not null
         and public.can_view_org_channel(c.id, auth.uid()))
    and public.has_recorded_consent()
    and public.can_publish_now()
  );

-- 10. channels ----------------------------------------------------------------------
-- Starting a chat, a group or a club channel is publishing too.
alter policy channels_insert_authenticated on public.channels
  with check (
    ((org_id is null)
      or (public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
    and public.has_recorded_consent()
    and public.can_publish_now()
  );

-- 11. connections, rsvps, users ------------------------------------------------------
-- `connections` is the FOLLOW graph (follower_id, following_id), written by
-- src/app/api/me/follow/route.ts:91-92. There is no connection-request feature
-- in this codebase. Following must stay open to students who have not verified
-- a school email yet — six of twenty production accounts, and browsing and
-- following clubs is exactly what §Franky's decision 4 keeps open for them — so
-- this gets NOT is_restricted_now() and nothing else. can_publish_now() here
-- would quietly stop every unverified student from following anyone.
alter policy connections_insert_follower on public.connections
  with check (
    (auth.uid() = follower_id)
    and not public.is_restricted_now()
  );

-- RSVPs the same: open to unverified students, closed to restricted ones.
alter policy rsvps_insert_own on public.rsvps
  with check ((auth.uid() = user_id) and not public.is_restricted_now());

alter policy rsvps_update_own on public.rsvps
  using (auth.uid() = user_id)
  with check ((auth.uid() = user_id) and not public.is_restricted_now());

-- A restricted student's profile stops coming back to anyone but themselves.
-- The own-row arm is not a courtesy: without it a restricted student cannot
-- read their own users row, and DELETE /api/me reads users.handle on the
-- CALLER'S client (src/app/api/me/route.ts:84-97) and answers 400 "Handle
-- confirmation didn't match" — which would take away the one thing Franky's
-- decision 1 says a restricted student must still be able to do.
alter policy users_select_authenticated on public.users
  using (
    id = (select auth.uid())
    or public.user_visible(id)
  );

-- Profile edits while restricted. The app's own profile writes go through
-- createSupabaseServiceClient() (src/app/api/me/profile/route.ts:323-326,
-- src/app/api/me/profile-sync/route.ts:679), where RLS does not apply, so this
-- never fires on the app's path. It is here for a direct PostgREST PATCH with
-- the anon key, and for as long as a restricted student keeps the session they
-- already hold — which is not an hour, it is indefinite: a ban does not set
-- ban_duration and nobody is signed out (src/lib/moderation/actions.ts:33-43),
-- so that token keeps working until they drop it. Do not read this AND as an
-- hour-long patch and drop it to save the per-row DEFINER call; it is the only
-- thing stopping a restricted student editing their own profile over PostgREST.
alter policy users_update_self on public.users
  using (auth.uid() = id)
  with check ((auth.uid() = id) and not public.is_restricted_now());

-- 11b. events, orgs and the club-officer writes ---------------------------------
-- The two holes acceptance proved, the third review found beside them, and the
-- sweep around all three. Most of what follows is the same two ANDs the
-- sections above use and only the WHERE is new; the exception is `events`,
-- which also has to ask WHO an event is for and not only who is asking. The
-- header block "EVERY TABLE A STUDENT CAN WRITE THROUGH POSTGREST" lists every
-- other client-writable table with the reason it is left open.

-- Putting an event in front of a campus is publishing, and editing one is
-- publishing it again — the title, the time and the place a student reads are
-- all on the row the update rewrites. A BANNED account POSTed /rest/v1/events
-- with the anon key and got 201 (acceptance, 2026-09-23): the policy asked for
-- Terms and nothing else, and the token of a banned student keeps working
-- indefinitely, because a ban does not set ban_duration and nobody is signed
-- out (src/lib/moderation/actions.ts:33-43).
-- The reason this waited a day and ships now: can_publish_now() also refuses an
-- unrestricted student who has not verified a school email, and the insert runs
-- on the CALLER'S client (src/app/api/events/route.ts:511), so before the route
-- had a friendly 403 this AND would have turned "verify your school email" into
-- a bare 500. src/app/api/events/route.ts:425 answers them properly now.
--
-- AND WHO THE EVENT IS FOR, which is the half the first draft of this section
-- missed. `events` grants authenticated arwd at TABLE level — every column,
-- org_id included — and events_select_visible calls
-- event_visible(org_id, creator_id, id), which answers true to every signed-in
-- caller as soon as the named club is not hidden. So a student in no club at
-- all could POST an event with org_id = <SAE's uuid> and have "SAE Rush Party"
-- render on SAE's club page, in the campus feed, in Otto's "Heads up" panel and
-- in the .ics file, under the club's name. The route has always checked this
-- (src/app/api/events/route.ts:487-520: the club exists, is verified, is not
-- hidden, and the caller is owner or admin); the policy never did, which is the
-- same shape of hole as the two acceptance proved and on the same table.
-- org_member_role() is the existing STABLE SECURITY DEFINER helper, so the club
-- lookup does not run under the caller's own orgs RLS and cannot be starved by
-- it. `org_id is null` stays open: the column is nullable, and an event with no
-- club is nobody's but its creator's — event_visible shows it to them and to
-- whoever RSVP'd, and to nobody else.
-- The verified / not-hidden half of the route's rule is deliberately NOT
-- mirrored here. A bare subquery on public.orgs inside a policy reads under the
-- caller's own orgs_select and would miss a hidden club, so it needs a new
-- STABLE SECURITY DEFINER helper; that is written into FOLLOW-UP rather than
-- guessed at in the line that has to hold.
alter policy events_insert_authenticated on public.events
  with check (
    (auth.uid() = creator_id)
    and public.has_recorded_consent()
    and public.can_publish_now()
    and (org_id is null
         or public.org_member_role(org_id, auth.uid())
              = any (array['owner'::text, 'admin'::text]))
  );

-- The update policy asked only "is this your event" — no Terms, no age, no
-- verification, and no restriction check. can_publish_now() carries Terms and
-- age with it, so the older consent gap closes here too. USING is restated
-- unchanged: a creator still selects only their own rows to edit, and the
-- refusal lands on the result instead.
-- The officer check is the same one the insert grew, and this is the road with
-- one more turn on it: authenticated holds UPDATE on org_id as well, so without
-- this AND a student could create a personal event that passes every check and
-- then re-attribute it to a club they have nothing to do with.
alter policy events_update_creator on public.events
  using (auth.uid() = creator_id)
  with check (
    (auth.uid() = creator_id)
    and public.can_publish_now()
    and (org_id is null
         or public.org_member_role(org_id, auth.uid())
              = any (array['owner'::text, 'admin'::text]))
  );

-- Deleting a club's event is the second delete this file stops, and it passes
-- the same test orgs_delete is gated on: whose thing is it. A club event is the
-- club's published calendar and every RSVP cascades off it, so a suspended
-- officer could wipe every event they ever created for that club and every
-- student's commitment to it on their way out — and "on their way out" has no
-- deadline, because their token keeps working indefinitely. That is not taking
-- your own words back down. An event with no club still is, so `org_id is null`
-- stays open: the same shape the insert above uses, and the same self arm
-- org_members_delete keeps.
-- Nothing in the app meets this policy either way. There is no DELETE and no
-- PATCH route for an event at all — the only write in src/ is the insert at
-- src/app/api/events/route.ts:537 — so events UPDATE and DELETE are PostgREST-
-- only surfaces and no screen changes when these two tighten.
-- AND IT DOES NOT TOUCH ACCOUNT DELETION, which is the thing a ban must never
-- cost anybody: DELETE /api/me deletes the auth user with the service client
-- (src/app/api/me/route.ts:136-137) and the events go with it down the foreign
-- key, where RLS does not apply at all. A restricted student can still leave
-- and take everything of theirs with them.
alter policy events_delete_creator on public.events
  using (
    (auth.uid() = creator_id)
    and (org_id is null or not public.is_restricted_now())
  );

-- A SUSPENDED club officer PATCHed /rest/v1/orgs?handle=eq.<h> and rewrote the
-- club's name and description (acceptance, 2026-09-23). authenticated holds
-- column UPDATE on exactly the club's public face, so that one call reaches
-- everything a visitor reads.
-- NOT is_restricted_now() and deliberately NOT can_publish_now(): an officer
-- whose school email has lapsed must still be able to run their club (Franky's
-- rule). Note that the app's own club PATCH is stricter than this line —
-- src/app/api/orgs/[slug]/route.ts:405 calls requireCanPublish, which does
-- demand a verified school email — so until that route moves, the route is what
-- a lapsed officer meets, not this policy. Written down in FOLLOW-UP as well,
-- because reading the database alone would give you the wrong answer.
alter policy orgs_update on public.orgs
  using (
    (auth.uid() = owner_id)
    or (public.org_member_role(id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
  )
  with check (
    ((auth.uid() = owner_id)
      or (public.org_member_role(id, auth.uid()) = any (array['owner'::text, 'admin'::text])))
    and not public.is_restricted_now()
  );

-- Deleting a club is the one delete in this file a restriction stops, and the
-- difference is whose thing it is: a club cascades to its members, channels,
-- invites and join requests, so it is other people's home and not the owner's
-- own words. Their own posts, comments, messages, events and RSVPs all stay
-- deletable while restricted, and so does their whole account.
alter policy orgs_delete on public.orgs
  using ((auth.uid() = owner_id) and not public.is_restricted_now());

-- Officer powers over the roster. A suspended officer stops changing roles and
-- stops removing people; the `user_id = auth.uid()` arm is left alone, so
-- anyone — restricted or not — can still leave a club. The WITH CHECK is about
-- which role may be set, never about who is asking, so it is restated word for
-- word and the new clause goes in USING.
-- Nothing in the app meets these four ANDs: every roster and club-channel write
-- runs with the service client (src/app/api/orgs/[slug]/members/[userId]/
-- route.ts:12, .../channels/[channelId]/members/route.ts:175), where RLS does
-- not apply. So there is no 500 to worry about here, and no gate either until
-- those routes grow one — these lines are the PostgREST floor and nothing more.
alter policy org_members_update on public.org_members
  using (
    (public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
    and (role <> 'owner'::text)
    and not public.is_restricted_now()
  )
  with check (
    (role = any (array['member'::text, 'mod'::text, 'admin'::text]))
    and ((role <> 'admin'::text)
      or (public.org_member_role(org_id, auth.uid()) = 'owner'::text))
  );

alter policy org_members_delete on public.org_members
  using (
    (role <> 'owner'::text)
    and ((user_id = auth.uid())
      or ((public.org_member_role(org_id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
        and not public.is_restricted_now()))
  );

-- The same shape on club channels: a restricted officer stops adding people to
-- a channel and stops removing them, and leaving a channel yourself stays open.
alter policy org_channel_members_insert on public.org_channel_members
  with check (
    exists (
      select 1
        from public.channels c
       where c.id = org_channel_members.channel_id
         and c.org_id is not null
         and public.org_member_role(c.org_id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
    and not public.is_restricted_now()
  );

alter policy org_channel_members_delete on public.org_channel_members
  using (
    (user_id = auth.uid())
    or (exists (
          select 1
            from public.channels c
           where c.id = org_channel_members.channel_id
             and c.org_id is not null
             and public.org_member_role(c.org_id, auth.uid()) = any (array['owner'::text, 'admin'::text]))
        and not public.is_restricted_now())
  );

-- A reaction is small and it is still a thing another person sees, sent into
-- their DM or their club channel — the one write left that lets a suspended
-- student put something in front of the person who reported them. NOT
-- can_publish_now(): reacting is not publishing, and an unverified student may
-- react today; taking that away is a different decision than this one.
-- The route inserts on the caller's client with no gate of its own
-- (src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts:79-81), so a
-- restricted student meets a bare 500 there. That is the right answer for them:
-- can_publish_now() would need a friendly 403 first because it refuses ordinary
-- students, but is_restricted_now() refuses nobody except a suspended or banned
-- account, and every page one of those can load is the suspended notice.
alter policy message_reactions_insert_member on public.message_reactions
  with check (
    (auth.uid() = user_id)
    and exists (
      select 1
        from public.messages m
        join public.channels c on c.id = m.channel_id
       where m.id = message_reactions.message_id
         and ((c.org_id is null and public.is_channel_member(m.channel_id))
           or (c.org_id is not null
               and public.can_view_org_channel(m.channel_id, auth.uid()))))
    and not public.is_restricted_now()
  );

-- 12. The three SECURITY DEFINER readers -----------------------------------------
-- Counts do NOT follow the SELECT policies. These three skip RLS and keep their
-- own copy of the visibility rule in SQL, which is why each one needs the same
-- clause spelled out again: without it a removed post keeps its like and repost
-- counts, a removed comment keeps its likes, and a removed post keeps counting
-- views. Each is CREATE OR REPLACE with the identical signature, which keeps
-- the owner and the ACL — never DROP and recreate, because that loses EXECUTE
-- for anon and authenticated and the next anon call crashes the backend
-- (standing rule). Every one is re-granted below anyway.
-- The rule used here is the plain one: a removed row counts for nobody, and a
-- restricted author's row counts for nobody. There is no own-row arm, because a
-- restricted student sees /account/suspended and nothing else, so their own
-- counts are moot.
-- ONE CONSEQUENCE TO KNOW ABOUT. user_visible() answers false to a caller whose
-- role is literally `anon` — the same shape as org_content_visible, which these
-- functions already live beside. So a call to any of these three with the anon
-- key, signed out, now comes back with no counts at all rather than the
-- published ones. Nothing does that today: every call site is a server route
-- using the caller's client or the service role (src/lib/posts/engagement-
-- counts.ts, src/app/api/posts/[id]/comments/route.ts:119, /view/route.ts:52),
-- and a service-role call reports role 'service_role', so it gets the real
-- answer. If a signed-out surface ever calls one of these RPCs directly, it
-- will look like the counts broke, and nothing in the stack will say why. This
-- is a standing rule for anything built on top of this file, not a curiosity:
-- it is carried in FOLLOW-UP above as "A RULE FOR WAVE 2".

CREATE OR REPLACE FUNCTION public.post_engagement_counts(p_post_ids uuid[], p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(post_id uuid, like_count integer, repost_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_post_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select p.id,
           (select count(*)::int from public.post_likes l
             where l.post_id = p.id and (p_since is null or l.created_at >= p_since)),
           (select count(*)::int from public.post_reposts r
             where r.post_id = p.id and (p_since is null or r.created_at >= p_since))
      from public.posts p
     where p.id = any(p_post_ids)
       and (p.status = 'published' or p.user_id = auth.uid())
       and (p_since is null or p.user_id = auth.uid())
       -- moderation v1: a removed post and a restricted author's post have no
       -- counts, the same way they have no rows.
       and p.removed_at is null
       and public.user_visible(p.user_id)
       -- a hidden club's post answers only for its author and the club's
       -- members: to everyone else the club does not exist.
       and (p.org_id is null or p.user_id = auth.uid() or exists (
             select 1 from public.orgs o
              where o.id = p.org_id
                and (o.hidden_at is null
                     or exists (select 1 from public.org_members m
                                 where m.org_id = o.id and m.user_id = auth.uid()))));
end $function$;

grant execute on function public.post_engagement_counts(uuid[], timestamptz)
  to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.comment_like_counts(p_comment_ids uuid[])
 RETURNS TABLE(comment_id uuid, like_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_comment_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select c.id, count(cl.user_id)::int
      from public.post_comments c
      join public.posts p on p.id = c.post_id
      left join public.comment_likes cl on cl.comment_id = c.id
     where c.id = any(p_comment_ids)
       and (p.status = 'published' or p.user_id = auth.uid())
       -- moderation v1: the comment itself, and the post it hangs off, both
       -- have to be standing, and both authors have to be unrestricted.
       and c.removed_at is null
       and p.removed_at is null
       and public.user_visible(c.user_id)
       and public.user_visible(p.user_id)
       and (p.org_id is null or p.user_id = auth.uid() or exists (
             select 1 from public.orgs o
              where o.id = p.org_id
                and (o.hidden_at is null
                     or exists (select 1 from public.org_members m
                                 where m.org_id = o.id and m.user_id = auth.uid()))))
     group by c.id;
end $function$;

grant execute on function public.comment_like_counts(uuid[])
  to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_author uuid;
  v_org_id uuid;
  v_removed_at timestamptz;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT user_id, org_id, removed_at INTO v_author, v_org_id, v_removed_at
    FROM public.posts
   WHERE id = p_post_id;

  IF v_author IS NULL THEN
    -- Deleted or never-existed post. The FK would have rejected the insert.
    RETURN false;
  END IF;

  IF v_author = v_user_id THEN
    -- Looking at your own post doesn't count. Mirrors record_profile_view.
    RETURN false;
  END IF;

  IF v_removed_at IS NOT NULL OR NOT public.user_visible(v_author) THEN
    -- Removed by moderators, or its author is restricted: to everyone but the
    -- author the post is not there, so it answers like a missing one.
    RETURN false;
  END IF;

  IF v_org_id IS NOT NULL AND NOT public.org_content_visible(v_org_id) THEN
    -- A hidden club's post, and the club is hidden from this viewer: to them
    -- the post doesn't exist, so it answers like a missing one.
    RETURN false;
  END IF;

  INSERT INTO public.post_views (post_id, user_id)
  VALUES (p_post_id, v_user_id)
  ON CONFLICT (post_id, user_id, viewed_on) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.posts
       SET view_count = view_count + 1
     WHERE id = p_post_id;
  END IF;

  RETURN COALESCE(v_inserted, false);
END;
$function$;

grant execute on function public.record_post_view(uuid) to anon, authenticated, service_role;

-- 13. email_sends learns the alert kind -----------------------------------------
-- src/lib/moderation/alerts.ts logs the "new report" email as kind
-- 'moderation_alert', and sendLogged hands `kind` straight to the insert
-- without testing it against any list (src/lib/email/send-log.ts:31 and
-- :50-58), so this CHECK is the only thing refusing it. Left as it is, every
-- alert costs one `[email-send-log] insert failed:` line and leaves no record
-- that the alert was sent — which is the one question that table exists to
-- answer. Dropped and recreated by NAME, not renamed, so the header, the
-- ROLLBACK and 20260922104000 all keep calling it the same thing. Nothing else
-- about the table moves: no grant, no policy, no column. Adding a fourth kind
-- later means this CHECK and EMAIL_SEND_KINDS together, as 20260922104000 says.
alter table public.email_sends drop constraint email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check
  check (kind in ('school_verification', 'password_reset', 'moderation_alert'));

-- 14. The word filter stops being bypassable ------------------------------------
-- Six free-text columns on `users` lose UPDATE for `authenticated`. Verified
-- live first: an ordinary student PATCHed /rest/v1/users?id=eq.<self> with
-- nothing but their own token and the public anon key and stored
-- headline='Campus tr4nny guy', 204 with `Prefer: return=minimal`. Every route
-- that writes these six writes with the SERVICE role and runs the filter on the
-- way (PATCH /api/me/profile and POST /api/me/profile-sync, both through the
-- closed list in src/lib/profile/self-write-columns.ts; onboarding through
-- `service`), so the grant is not load-bearing for anything the app does — it
-- is only the door round the filter. The walk that establishes that, column by
-- column and call site by call site, is in MEASURED; the one users writer on
-- the caller's own client is heartbeat's last_active_at, which is not here.
--
-- This is exactly the move 20260922130000_users_profile_detail_server_only.sql
-- made on the same table for the same reason, and it works for the same reason
-- too: pg_class.relacl on users is `authenticated=dDxtm`, with no table-level
-- `w`, so the column ACL is the whole UPDATE path and taking it away is a real
-- boundary rather than a second lock. Pre-check 0e refuses the file if that has
-- stopped being true. SELECT is untouched: a profile still reads as it did.
revoke update (name, bio, tagline, headline, location_text, major)
  on public.users from authenticated;

-- 15. An event's text stops being rewritable past it ----------------------------
-- Same probe, same answer: as the event's creator, PATCH
-- /rest/v1/events?id=eq.<id> set title='tr4nny Kickoff' and answered 200. There
-- is no event edit route in the app at all — src/app/api/events/[id]/ holds
-- attendees, ics and rsvp, and nothing in src/ or public/ UPDATEs events — so
-- the only thing that grant has ever carried is the bypass.
--
-- AND IT CANNOT BE WRITTEN AS A COLUMN REVOKE, which is the part worth reading
-- twice. events grants UPDATE at TABLE level (`authenticated=arwd`) with
-- pg_attribute.attacl null on all nine columns. A table-level privilege covers
-- every column, so `revoke update (title) on public.events from authenticated`
-- finds no column entry to remove: it raises a WARNING, changes nothing, and
-- leaves this file reading as though it had closed the hole. The only way to
-- say "these three and not the others" is to take the table grant back and name
-- the rest. INSERT stays table-level and untouched, because the create route
-- (src/app/api/events/route.ts:537) runs on the caller's own client and writes
-- every column.
--
-- The six that come back are the status quo minus three: id, created_at and
-- creator_id are re-granted only because the table grant already carried them,
-- and narrowing further is a separate decision, in FOLLOW-UP with its reason.
-- org_id is re-granted deliberately and not by inertia — section 11b's
-- club-attribution AND on events_update_creator asks who the event is FOR, and
-- a policy guarding a grant nobody holds is dead weight pretending to be a
-- gate. events_update_creator itself is left exactly as section 11b writes it,
-- for the day an edit route exists. THAT ROUTE MUST WRITE WITH THE SERVICE ROLE
-- AND RUN THE FILTER, the same as the profile routes — or re-grant these three
-- deliberately, in a migration that says why.
revoke update on table public.events from authenticated;
grant update (id, org_id, creator_id, starts_at, ends_at, created_at)
  on public.events to authenticated;

-- 16. Post-check inside the transaction: any miss aborts the whole file --------
-- The pre-checks at the top said the database was the one this file was written
-- against. This says the file did what it claims. Everything here is cheap, and
-- a failure here is worth far more than a half-applied moderation system.
do $$
declare
  isr  regprocedure := to_regprocedure('public.is_restricted_now()');
  cpn  regprocedure := to_regprocedure('public.can_publish_now()');
  uvis regprocedure := to_regprocedure('public.user_visible(uuid)');
  n int;
  bad text;
  probe uuid;
begin
  -- a. The three helpers: STABLE SECURITY DEFINER with search_path 'public'
  --    (the idiom of has_recorded_consent and the count functions this file
  --    also replaces), and callable by all three roles. Nothing in this file
  --    revokes EXECUTE from anything; this proves the grants landed.
  select string_agg(f.name, ', ') into bad
    from (values ('public.is_restricted_now()'), ('public.can_publish_now()'),
                 ('public.user_visible(uuid)')) as f(name)
   where to_regprocedure(f.name) is null;
  if bad is not null then
    raise exception 'mod-a: helper function missing: %', bad;
  end if;

  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.oid in (isr::oid, cpn::oid, uvis::oid)
     and not (p.prosecdef and p.provolatile = 's'
              and p.proconfig = array['search_path=public']);
  if bad is not null then
    raise exception 'mod-a: helper is not STABLE SECURITY DEFINER with search_path public: %', bad;
  end if;

  select string_agg(p.proname || ' / ' || r.role, ', ') into bad
    from pg_proc p,
         unnest(array['anon', 'authenticated', 'service_role']) as r(role)
   where p.oid in (isr::oid, cpn::oid, uvis::oid)
     and not has_function_privilege(r.role, p.oid, 'EXECUTE');
  if bad is not null then
    raise exception 'mod-a: a helper is not executable by a role that reaches it (standing rule): %', bad;
  end if;

  -- b. Behaviour, as the role running this file. auth.uid() is null here, so
  --    the caller is nobody: not restricted, and not allowed to publish. A null
  --    id is "nobody in particular" and is visible, which is what lets a policy
  --    pass a nullable column straight in.
  if public.is_restricted_now() is not false then
    raise exception 'mod-a: is_restricted_now() must be false when there is no caller';
  end if;
  if public.can_publish_now() is not false then
    raise exception 'mod-a: can_publish_now() must be false when there is no caller';
  end if;
  if public.user_visible(null) is not true then
    raise exception 'mod-a: user_visible(null) must be true';
  end if;
  -- Nobody is restricted on the day this lands, so every real account is still
  -- visible. This is the probe that catches a helper wired inside out.
  select u.id into probe from public.users u limit 1;
  if probe is not null and public.user_visible(probe) is not true then
    raise exception 'mod-a: nobody is restricted yet, so user % must still be visible', probe;
  end if;

  -- c. The two new tables: RLS on, no policies, and anon and authenticated
  --    hold nothing at all. The REVOKE is the boundary — Supabase's default
  --    privileges hand them everything on a new public table, which is exactly
  --    how reports ended up world-writable behind RLS.
  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.oid in ('public.account_restrictions'::regclass,
                   'public.moderation_actions'::regclass)
     and not c.relrowsecurity;
  if bad is not null then
    raise exception 'mod-a: row level security is off on: %', bad;
  end if;
  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('account_restrictions', 'moderation_actions');
  if bad is not null then
    raise exception 'mod-a: these tables must have no policies at all: %', bad;
  end if;
  select string_agg(t.tbl || ' / ' || r.role || ' / ' || g.priv, ', ') into bad
    from unnest(array['public.account_restrictions', 'public.moderation_actions']) as t(tbl),
         unnest(array['anon', 'authenticated']) as r(role),
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as g(priv)
   where has_table_privilege(r.role, t.tbl, g.priv);
  if bad is not null then
    raise exception 'mod-a: anon or authenticated still holds a privilege on a moderation table: %', bad;
  end if;
  if not (has_table_privilege('service_role', 'public.account_restrictions', 'SELECT')
          and has_table_privilege('service_role', 'public.account_restrictions', 'INSERT')
          and has_table_privilege('service_role', 'public.moderation_actions', 'SELECT')
          and has_table_privilege('service_role', 'public.moderation_actions', 'INSERT')) then
    raise exception 'mod-a: service_role cannot read or write the moderation tables';
  end if;
  -- The log is append-only for the service role too, so it must NOT hold
  -- UPDATE or DELETE. The trigger is the second lock, not the first.
  if has_table_privilege('service_role', 'public.moderation_actions', 'UPDATE')
     or has_table_privilege('service_role', 'public.moderation_actions', 'DELETE') then
    raise exception 'mod-a: moderation_actions must not grant UPDATE or DELETE to service_role';
  end if;

  -- d. The append-only trigger, tested rather than assumed. Each probe runs in
  --    its own subtransaction: catching the exception rolls the test row back,
  --    so the log is still empty when this file commits.
  begin
    insert into public.moderation_actions (action, target_type, target_id)
    values ('report_dismiss', 'report', '00000000-0000-0000-0000-000000000000')
    returning id into probe;
    update public.moderation_actions set reason = 'probe' where id = probe;
    raise exception 'mod-a: UPDATE on moderation_actions was NOT refused';
  exception when insufficient_privilege then
    null;  -- refused, as it must be
  end;
  begin
    insert into public.moderation_actions (action, target_type, target_id)
    values ('report_dismiss', 'report', '00000000-0000-0000-0000-000000000000')
    returning id into probe;
    delete from public.moderation_actions where id = probe;
    raise exception 'mod-a: DELETE on moderation_actions was NOT refused';
  exception when insufficient_privilege then
    null;
  end;
  if exists (select 1 from public.moderation_actions) then
    raise exception 'mod-a: an append-only probe row survived; the log must commit empty';
  end if;

  -- e. reports is no longer a client-writable table. The policy is gone AND the
  --    grants are gone; the grants are the part that mattered.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'reports') then
    raise exception 'mod-a: reports must have no policies left; the route inserts with the service role';
  end if;
  select string_agg(r.role || ' / ' || g.priv, ', ') into bad
    from unnest(array['anon', 'authenticated']) as r(role),
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as g(priv)
   where has_table_privilege(r.role, 'public.reports', g.priv);
  if bad is not null then
    raise exception 'mod-a: anon or authenticated still holds a privilege on reports: %', bad;
  end if;
  if not has_table_privilege('service_role', 'public.reports', 'INSERT') then
    raise exception 'mod-a: service_role cannot insert reports; the report route would be dead';
  end if;

  -- The life-cycle columns, the widened target types, and the one-open-report
  -- index. reason_code and reason keep the names they have had since
  -- 20260506100000 and are not touched here; a `details` column must not exist.
  select string_agg(c.name, ', ') into bad
    from (values ('status'), ('resolved_by'), ('resolved_at'), ('resolution_note'),
                 ('target_owner_id'), ('target_snapshot'), ('admin_alerted_at')) as c(name)
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'reports'
                        and column_name = c.name);
  if bad is not null then
    raise exception 'mod-a: reports is missing a column this file adds: %', bad;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'reports'
                and column_name = 'details') then
    raise exception 'mod-a: reports.details must not exist; free text is `reason`';
  end if;
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'reports'
     and column_name in ('reason', 'reason_code');
  if n <> 2 then
    raise exception 'mod-a: reports.reason (free text) and reports.reason_code (the picker) must both survive untouched; found %', n;
  end if;
  select pg_get_constraintdef(oid) into bad
    from pg_constraint
   where conrelid = 'public.reports'::regclass and conname = 'reports_target_type_check';
  -- `bad is null` first: a missing constraint makes every `!~` answer NULL, and
  -- a NULL `if` is simply not taken, which would pass this check by accident.
  if bad is null or bad !~ 'comment' or bad !~ 'org' or bad !~ 'event' then
    raise exception 'mod-a: reports_target_type_check was not widened to comment, org and event: %',
      coalesce(bad, '(missing)');
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public'
                    and indexname = 'reports_one_open_per_reporter_target') then
    raise exception 'mod-a: the one-open-report-per-target index is missing';
  end if;
  -- The collapse worked: no reporter has two open reports on the same thing.
  -- On the local copy there are no reports at all, so this proves nothing here
  -- and everything on production (PRE-FLIGHT d).
  select count(*) into n
    from (select 1 from public.reports
           where status = 'open' and reporter_id is not null
           group by reporter_id, target_type, target_id having count(*) > 1) d;
  if n <> 0 then
    raise exception 'mod-a: % duplicate open reports survived the collapse', n;
  end if;

  -- f. Soft removal exists on all three content tables.
  select string_agg(t.tbl || '.' || c.col, ', ') into bad
    from unnest(array['posts', 'post_comments', 'messages']) as t(tbl),
         unnest(array['removed_at', 'removed_by', 'removed_reason']) as c(col)
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = t.tbl
                        and column_name = c.col);
  if bad is not null then
    raise exception 'mod-a: a removal column is missing: %', bad;
  end if;
  -- No student may clear their own removed_at over REST, and the lock is a
  -- different one on each table (see DOES NOT in the header). On posts it is
  -- the column ACL: UPDATE for authenticated is content, status and tags, so
  -- the three new columns are simply not writable. On post_comments and
  -- messages it is RLS: neither has an UPDATE policy at all, so no UPDATE ever
  -- passes. Both are asserted, because both are load-bearing and neither is
  -- obvious from reading the file.
  select string_agg('posts.' || c.col, ', ') into bad
    from unnest(array['removed_at', 'removed_by', 'removed_reason']) as c(col)
   where has_column_privilege('authenticated', 'public.posts', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: authenticated can write a removal column on posts: %', bad;
  end if;
  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('post_comments', 'messages')
     and cmd in ('UPDATE', 'ALL');
  if bad is not null then
    raise exception 'mod-a: post_comments/messages gained an UPDATE policy, so removed_at is now clearable: %', bad;
  end if;
  -- Nothing is removed on the day this lands. If this is not zero, the ALTERs
  -- above did more than add columns.
  select (select count(*) from public.posts where removed_at is not null)
       + (select count(*) from public.post_comments where removed_at is not null)
       + (select count(*) from public.messages where removed_at is not null)
       + (select count(*) from public.account_restrictions) into n;
  if n <> 0 then
    raise exception 'mod-a: this file must not remove content or restrict anyone; found % such rows', n;
  end if;

  -- g. The policies read as written. Patterns allow for pg_policies printing
  --    `public.` or the table name in front, or not.
  select string_agg(w.tbl || '.' || w.pol || ' ~ ' || w.pattern, '; ') into bad
    from (values
      ('posts',         'posts_select_authenticated', 'qual',       'removed_at IS NULL'),
      ('posts',         'posts_select_authenticated', 'qual',       'user_visible\(user_id\)'),
      ('posts',         'posts_select_authenticated', 'qual',       'user_id = \( SELECT auth\.uid\(\)'),
      ('posts',         'posts_insert_authenticated', 'with_check', 'can_publish_now\(\)'),
      ('posts',         'posts_update_own',           'with_check', 'can_publish_now\(\)'),
      ('post_comments', 'post_comments_select_authenticated', 'qual', 'removed_at IS NULL'),
      ('post_comments', 'post_comments_select_authenticated', 'qual', 'user_visible\(user_id\)'),
      ('post_comments', 'post_comments_select_authenticated', 'qual', 'user_id = \( SELECT auth\.uid\(\)'),
      ('post_comments', 'post_comments_insert_own',   'with_check', 'can_publish_now\(\)'),
      ('post_reposts',  'post_reposts_insert_own',    'with_check', 'can_publish_now\(\)'),
      ('post_reposts',  'post_reposts_update_own',    'with_check', 'can_publish_now\(\)'),
      ('messages',      'messages_select_member',     'qual',       'removed_at IS NULL'),
      ('messages',      'messages_select_member',     'qual',       'user_id = \( SELECT auth\.uid\(\)'),
      ('messages',      'messages_select_org_member', 'qual',       'removed_at IS NULL'),
      ('messages',      'messages_select_org_member', 'qual',       'user_id = \( SELECT auth\.uid\(\)'),
      ('messages',      'messages_insert_member',     'with_check', 'can_publish_now\(\)'),
      ('messages',      'messages_insert_member',     'with_check', '(public\.)?blocks b'),
      ('messages',      'messages_insert_org_member', 'with_check', 'can_publish_now\(\)'),
      ('channels',      'channels_insert_authenticated', 'with_check', 'can_publish_now\(\)'),
      ('connections',   'connections_insert_follower', 'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      ('rsvps',         'rsvps_insert_own',           'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      ('rsvps',         'rsvps_update_own',           'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      ('users',         'users_select_authenticated', 'qual',       'user_visible\(id\)'),
      ('users',         'users_select_authenticated', 'qual',       'id = \( SELECT auth\.uid\(\)'),
      ('users',         'users_update_self',          'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      -- section 11b: the two acceptance proved, and the sweep around them
      ('events',        'events_insert_authenticated', 'with_check', 'can_publish_now\(\)'),
      ('events',        'events_update_creator',      'with_check', 'can_publish_now\(\)'),
      -- and who the event is FOR: without these two a student in no club could
      -- post "SAE Rush Party" under SAE's name, or re-point one of their own
      -- events at a club after the fact. org_id is writable on both.
      ('events',        'events_insert_authenticated', 'with_check', '(public\.)?org_member_role\(org_id'),
      ('events',        'events_update_creator',      'with_check', '(public\.)?org_member_role\(org_id'),
      ('events',        'events_delete_creator',      'qual',       'NOT (public\.)?is_restricted_now\(\)'),
      -- the arm that must NOT have been gated: an event with no club behind it
      -- is the creator's own thing and stays theirs to delete.
      ('events',        'events_delete_creator',      'qual',       'org_id IS NULL'),
      ('orgs',          'orgs_update',                'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      ('orgs',          'orgs_delete',                'qual',       'NOT (public\.)?is_restricted_now\(\)'),
      ('org_members',   'org_members_update',         'qual',       'NOT (public\.)?is_restricted_now\(\)'),
      ('org_members',   'org_members_delete',         'qual',       'NOT (public\.)?is_restricted_now\(\)'),
      -- and the arm that must NOT have been gated: leaving a club yourself
      ('org_members',   'org_members_delete',         'qual',       'user_id = auth\.uid\(\)'),
      ('org_channel_members', 'org_channel_members_insert', 'with_check', 'NOT (public\.)?is_restricted_now\(\)'),
      ('org_channel_members', 'org_channel_members_delete', 'qual',       'NOT (public\.)?is_restricted_now\(\)'),
      ('org_channel_members', 'org_channel_members_delete', 'qual',       'user_id = auth\.uid\(\)'),
      ('message_reactions', 'message_reactions_insert_member', 'with_check', 'NOT (public\.)?is_restricted_now\(\)')
    ) as w(tbl, pol, side, pattern)
   where not exists (
     select 1 from pg_policies pp
      where pp.schemaname = 'public' and pp.tablename = w.tbl and pp.policyname = w.pol
        and coalesce(case w.side when 'qual' then pp.qual else pp.with_check end, '') ~ w.pattern);
  if bad is not null then
    raise exception 'mod-a: a policy does not read as written: %', bad;
  end if;

  -- Following must stay open to students who have not verified a school email
  -- yet. can_publish_now() here would quietly stop six of twenty production
  -- accounts from following anyone, which is the plan error this file refused.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'connections'
                and policyname = 'connections_insert_follower'
                and coalesce(with_check, '') ~ 'can_publish_now')
  then
    raise exception 'mod-a: connections_insert_follower must NOT ask can_publish_now(); following is open to unverified students';
  end if;

  -- The same kind of guard on the club: running a club must NOT need a verified
  -- school email. An officer whose school address lapsed keeps their club
  -- (Franky's rule), so orgs_update asks about the restriction and nothing
  -- else. Writing can_publish_now() here would lock that officer out of their
  -- own club with a 42501 and no way to fix it.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'orgs'
                and policyname = 'orgs_update'
                and coalesce(with_check, '') ~ 'can_publish_now')
  then
    raise exception 'mod-a: orgs_update must NOT ask can_publish_now(); a lapsed school email must not cost an officer their club';
  end if;

  -- 17 policies on the five tables section 11b touches: the 17 measured, ten
  -- rewritten, none added and none dropped. An eleventh permissive write policy
  -- here would OR around every check above.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('events', 'orgs', 'org_members', 'org_channel_members',
                       'message_reactions');
  if n <> 17 then
    raise exception 'mod-a: expected 17 policies on events, orgs, org_members, org_channel_members and message_reactions, found %', n;
  end if;

  -- 30 policies on the nine tables: the 31 measured, minus
  -- reports_insert_authenticated, and nothing new snuck in.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('posts', 'post_comments', 'post_reposts', 'messages',
                       'channels', 'connections', 'rsvps', 'users', 'reports');
  if n <> 30 then
    raise exception 'mod-a: expected 30 policies on the nine tables, found %', n;
  end if;

  -- h. The three SECURITY DEFINER readers carry the same rule the policies do,
  --    and kept EXECUTE for every role (CREATE OR REPLACE keeps the ACL; this
  --    proves it, because losing it crashes the backend on the next anon call).
  select string_agg(f.sig, ', ') into bad
    from (values ('public.post_engagement_counts(uuid[],timestamptz)'),
                 ('public.comment_like_counts(uuid[])'),
                 ('public.record_post_view(uuid)')) as f(sig)
   where not exists (select 1 from pg_proc p
                      where p.oid = f.sig::regprocedure::oid
                        and p.prosrc ~ 'removed_at'
                        and p.prosrc ~ 'user_visible');
  if bad is not null then
    raise exception 'mod-a: a count/view function does not ask about removal or restriction: %', bad;
  end if;
  select string_agg(f.sig || ' / ' || r.role, ', ') into bad
    from (values ('public.post_engagement_counts(uuid[],timestamptz)'),
                 ('public.comment_like_counts(uuid[])'),
                 ('public.record_post_view(uuid)')) as f(sig),
         unnest(array['anon', 'authenticated', 'service_role']) as r(role)
   where not has_function_privilege(r.role, f.sig::regprocedure::oid, 'EXECUTE');
  if bad is not null then
    raise exception 'mod-a: a count/view function lost EXECUTE for a role: %', bad;
  end if;

  -- i. Standing rule (rulings.md): no public, non-trigger function denies
  --    EXECUTE to anon or authenticated — on this Postgres image such a call
  --    crashes the backend. This file revokes nothing; the check makes sure the
  --    database it lands on still holds that, the three new helpers included.
  --    moderation_actions_append_only() returns trigger and is exempt.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'mod-a: % public functions deny EXECUTE (standing rule)', n;
  end if;

  -- j. email_sends takes the alert kind now. The two it already took are
  --    asserted as well: widening must not have quietly dropped one. Same
  --    `bad is null` first as the reports CHECK above, because a missing
  --    constraint makes every `!~` answer NULL and a NULL `if` is not taken.
  select pg_get_constraintdef(oid) into bad
    from pg_constraint
   where conrelid = 'public.email_sends'::regclass and conname = 'email_sends_kind_check';
  if bad is null or bad !~ 'moderation_alert' or bad !~ 'school_verification'
     or bad !~ 'password_reset' then
    raise exception 'mod-a: email_sends_kind_check does not name all three send kinds: %',
      coalesce(bad, '(missing)');
  end if;

  -- k. The word filter is now the boundary on `users`. Both halves are
  --    asserted, because a revoke that is too wide is as wrong as one that did
  --    not land: too narrow leaves the slur in a headline, too wide takes a
  --    student's website away and empties a row on their own profile.
  select string_agg('users.' || c.col, ', ') into bad
    from unnest(array['name', 'bio', 'tagline', 'headline', 'location_text', 'major']) as c(col)
   where has_column_privilege('authenticated', 'public.users', c.col, 'UPDATE')
      or has_column_privilege('anon', 'public.users', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: a filtered profile column is still client-writable, so the word filter is still bypassable over PostgREST: %', bad;
  end if;
  select string_agg('users.' || c.col, ', ') into bad
    from unnest(array['last_active_at', 'website', 'year', 'department', 'current_on',
                      'otto_settings', 'voice_samples', 'work_order_manual',
                      'resume_url', 'resume_docs', 'resume_redactions']) as c(col)
   where not has_column_privilege('authenticated', 'public.users', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: the revoke was wider than the six filtered columns and took %; last_active_at in particular is written on the caller''s own client (heartbeat)', bad;
  end if;
  -- And the revoke only means anything while there is no table-level UPDATE.
  if has_table_privilege('authenticated', 'public.users', 'UPDATE')
     or has_table_privilege('anon', 'public.users', 'UPDATE') then
    raise exception 'mod-a: public.users grants UPDATE at TABLE level, which covers every column and undoes the six-column revoke';
  end if;
  -- SELECT is untouched by this file. A profile must read exactly as it did.
  select string_agg('users.' || c.col, ', ') into bad
    from unnest(array['name', 'bio', 'tagline', 'headline', 'location_text', 'major']) as c(col)
   where not has_column_privilege('authenticated', 'public.users', c.col, 'SELECT');
  if bad is not null then
    raise exception 'mod-a: this file must not touch SELECT on users, and % lost it', bad;
  end if;

  -- l. The same on `events`, where the mechanics were different and so the
  --    ways to get it wrong are different: a no-op column revoke, a lost
  --    INSERT that breaks the create route, or a re-grant that forgets org_id
  --    and leaves section 11b's club-attribution AND guarding nothing.
  select string_agg('events.' || c.col, ', ') into bad
    from unnest(array['title', 'description', 'location']) as c(col)
   where has_column_privilege('authenticated', 'public.events', c.col, 'UPDATE')
      or has_column_privilege('anon', 'public.events', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: an event text column is still client-writable (%); if this file used a plain column REVOKE against the table-level grant it warned and changed nothing', bad;
  end if;
  select string_agg('events.' || c.col, ', ') into bad
    from unnest(array['id', 'org_id', 'creator_id', 'title', 'description',
                      'starts_at', 'ends_at', 'location', 'created_at']) as c(col)
   where not has_column_privilege('authenticated', 'public.events', c.col, 'INSERT');
  if bad is not null then
    raise exception 'mod-a: authenticated lost INSERT on % ; this file touches UPDATE only and the create route writes every column on the caller''s own client', bad;
  end if;
  select string_agg('events.' || c.col, ', ') into bad
    from unnest(array['org_id', 'starts_at', 'ends_at', 'creator_id']) as c(col)
   where not has_column_privilege('authenticated', 'public.events', c.col, 'UPDATE');
  if bad is not null then
    raise exception 'mod-a: the events re-grant dropped % ; org_id in particular must stay writable or events_update_creator''s org_member_role AND guards a grant nobody holds', bad;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'events'
                    and policyname = 'events_update_creator') then
    raise exception 'mod-a: events_update_creator must survive this file; the grant narrowed, the policy did not move';
  end if;

  -- m. The append-only log carries no foreign key, and account_restrictions
  --    keeps the three it needs. This is the check that stops the
  --    account-deletion trap being reintroduced by a later hand: an FK with a
  --    referential ACTION on a table whose trigger refuses UPDATE turns any
  --    DELETE of the referenced row into a 42501, three tables away.
  select string_agg(conname || ' (' || confdeltype::text || ')', ', ') into bad
    from pg_constraint
   where contype = 'f' and conrelid = 'public.moderation_actions'::regclass;
  if bad is not null then
    raise exception 'mod-a: moderation_actions must carry NO foreign key — the append-only trigger refuses the UPDATE a referential action performs, so an admin who had moderated anything could not delete their account. Found: %', bad;
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'public.account_restrictions'::regclass
                and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16) then
    raise exception 'mod-a: account_restrictions has gained a BEFORE UPDATE trigger; if it ever refuses, the ON DELETE SET NULL on user_id makes a restricted student undeletable';
  end if;
  select string_agg(a.attname || ' -> ' || c.confdeltype::text, ', ') into bad
    from pg_constraint c
    join unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.contype = 'f' and c.conrelid = 'public.account_restrictions'::regclass
     and c.confdeltype <> 'n';
  if bad is not null then
    raise exception 'mod-a: every account_restrictions FK must be ON DELETE SET NULL; user_id going null is how the restriction outlives the account. Found: %', bad;
  end if;
  -- Exactly three, on exactly those columns. identity_key must NOT be among
  -- them: it is the half of the restriction that survives the account, so a
  -- foreign key there would cascade the ban away with the student who earned
  -- it — delete the account, re-verify the same school email, start again.
  select string_agg(a.attname, ', ' order by a.attname) into bad
    from pg_constraint c
    join unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.contype = 'f' and c.conrelid = 'public.account_restrictions'::regclass;
  if bad is distinct from 'created_by, lifted_by, user_id' then
    raise exception 'mod-a: account_restrictions must carry exactly three foreign keys (created_by, lifted_by, user_id) and none on identity_key; found: %',
      coalesce(bad, '(none)');
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
