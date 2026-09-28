-- The moderator log can record a photo takedown (S67 security wave 2, wave B,
-- batch B1; security report 2026-09-27 finding #2, "moderators can't take down
-- a profile photo, cover, club logo/banner or group-chat photo").
--
-- WHY THIS EXISTS. The new admin tool (POST /api/admin/images/remove and
-- /restore) clears an image column with the service role and moves the
-- student's own file into the private `quarantine` bucket. Unlike a post
-- removal, the row keeps NO trace of what was there: the column is cleared.
-- So the log row's `meta.previous` is the only record of the old value, and
-- the route writes that row FIRST, before it touches anything. Today
-- moderation_actions_action_check lists 15 actions and none of them is a
-- photo, so that first insert is refused (23514) and the route answers
-- "Nothing was changed." for every press. This file adds two values.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: moderation_actions_action_check and
--      moderation_actions_target_type_check read exactly as LIVE STATE says
--      (by fingerprint), and no row holds an action outside the new list.
--   2. Swaps the action CHECK for the same 15 values, same order, plus
--      'image_remove' and 'image_restore'. No row changes; every existing row
--      already passes the narrower list.
--   3. POST-CHECK: the new CHECK reads as written, target_type is untouched,
--      and BY BEHAVIOUR inside a subtransaction that rolls itself back: an
--      'image_remove' row inserts, an 'image_bogus' row is refused (23514).
--      Neither probe row survives (the table refuses DELETE, so the probe
--      undoes itself by raising a private SQLSTATE that the block catches).
--   4. notify pgrst, 'reload schema' (harmless; a CHECK doesn't change the API).
--
-- DOES NOT: touch moderation_actions_target_type_check (it already allows
-- 'user', 'org' and 'channel', the three targets a photo lives on), grants,
-- policies (the table has none; service role only), the append-only trigger,
-- storage, or any row. No function EXECUTE is revoked. No notification type
-- is added: there is no notice to the student this wave (waveB-build call 4).
--
-- LIVE STATE (read-only MCP, 2026-09-28, prod at c0b0533, latest recorded
-- migration 20260928160000):
--   * md5(pg_get_constraintdef) of moderation_actions_action_check =
--     b413bf4c519a9eef8fb6c4c1717e0516 (the 15 values below, in this order).
--   * moderation_actions_target_type_check = dbb1ba407960c58e045f56391b5262fa
--     (post, comment, message, user, org, event, channel, report).
--   * moderation_actions_reason_check = 311a4b558caaddabad38e5122f5f8bb5.
--   * RLS on, 0 policies, anon/authenticated hold no INSERT; one trigger,
--     moderation_actions_no_change (BEFORE UPDATE OR DELETE, refuses both).
--   * 2 rows: user_suspend 1, user_lift 1.
--   The local database matches (same three fingerprints; 3 rows, + post_remove).
--
-- DEPLOY ORDER: BEFORE the deploy. The old code never writes image_*, so a
-- wider CHECK is harmless to it. The new code before this file = every
-- Remove photo press answers 500 "Nothing was changed." (safe, but broken).
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260929100000', 'moderation_image_actions');
--
-- CHECK AFTER APPLYING (read-only):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.moderation_actions'::regclass
--      AND conname = 'moderation_actions_action_check';
--   -- ... 'user_lift'::text, 'image_remove'::text, 'image_restore'::text])))
--
-- ROLLBACK (after reverting the code that writes image_*). image_* rows can
-- never be deleted (append-only trigger), so the narrow CHECK comes back
-- NOT VALID: old rows stay, new image inserts are refused, and the image
-- routes answer "Nothing was changed." Without NOT VALID the rollback fails
-- the moment one image row exists.
--   BEGIN;
--   ALTER TABLE public.moderation_actions DROP CONSTRAINT moderation_actions_action_check;
--   ALTER TABLE public.moderation_actions
--     ADD CONSTRAINT moderation_actions_action_check CHECK (action = ANY (ARRAY[
--       'report_dismiss', 'report_action', 'post_remove', 'post_restore',
--       'comment_remove', 'comment_restore', 'message_remove', 'message_restore',
--       'org_hide', 'org_unhide', 'org_verify', 'org_unverify',
--       'user_suspend', 'user_ban', 'user_lift'])) NOT VALID;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- (Re-applying this file after that rollback works: its PRE-FLIGHT strips a
-- trailing ' NOT VALID' before the fingerprint, and the ADD below validates
-- every row, image rows included.)
-- ---------------------------------------------------------------------------

begin;

-- DROP/ADD CONSTRAINT takes an ACCESS EXCLUSIVE lock on moderation_actions
-- until COMMIT and re-checks every row (2 in production). Fail fast.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  fp  text;
  bad text;
begin
  -- A rolled-back file leaves the narrow CHECK NOT VALID (see ROLLBACK);
  -- that prints the same definition plus ' NOT VALID', so strip it.
  select md5(regexp_replace(pg_get_constraintdef(oid), ' NOT VALID$', '')) into fp
    from pg_constraint
   where conrelid = 'public.moderation_actions'::regclass
     and conname = 'moderation_actions_action_check';
  if fp is distinct from 'b413bf4c519a9eef8fb6c4c1717e0516' then
    raise exception 'image-actions: moderation_actions_action_check drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;

  select md5(pg_get_constraintdef(oid)) into fp
    from pg_constraint
   where conrelid = 'public.moderation_actions'::regclass
     and conname = 'moderation_actions_target_type_check';
  if fp is distinct from 'dbb1ba407960c58e045f56391b5262fa' then
    raise exception 'image-actions: moderation_actions_target_type_check drifted (md5 %); the routes log user/org/channel targets',
      coalesce(fp, '(missing)');
  end if;

  select string_agg(distinct action, ', ') into bad
    from public.moderation_actions
   where action not in
         ('report_dismiss', 'report_action', 'post_remove', 'post_restore',
          'comment_remove', 'comment_restore', 'message_remove', 'message_restore',
          'org_hide', 'org_unhide', 'org_verify', 'org_unverify',
          'user_suspend', 'user_ban', 'user_lift', 'image_remove', 'image_restore');
  if bad is not null then
    raise exception 'image-actions: rows hold actions outside the new list: %', bad;
  end if;
end $$;

-- 1. the wider CHECK: the 15 values word for word, same order, + two ---------
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions
  add constraint moderation_actions_action_check
  check (action = any (array[
    'report_dismiss'::text, 'report_action'::text, 'post_remove'::text, 'post_restore'::text,
    'comment_remove'::text, 'comment_restore'::text, 'message_remove'::text, 'message_restore'::text,
    'org_hide'::text, 'org_unhide'::text, 'org_verify'::text, 'org_unverify'::text,
    'user_suspend'::text, 'user_ban'::text, 'user_lift'::text,
    'image_remove'::text, 'image_restore'::text]));

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got   text;
  fp    text;
  state text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.moderation_actions'::regclass
     and conname = 'moderation_actions_action_check';
  if got is distinct from
     'CHECK ((action = ANY (ARRAY[''report_dismiss''::text, ''report_action''::text, ''post_remove''::text, ''post_restore''::text, ''comment_remove''::text, ''comment_restore''::text, ''message_remove''::text, ''message_restore''::text, ''org_hide''::text, ''org_unhide''::text, ''org_verify''::text, ''org_unverify''::text, ''user_suspend''::text, ''user_ban''::text, ''user_lift''::text, ''image_remove''::text, ''image_restore''::text])))'
  then
    raise exception 'image-actions: the new action CHECK does not read as written: %',
      coalesce(got, '(missing)');
  end if;

  select md5(pg_get_constraintdef(oid)) into fp
    from pg_constraint
   where conrelid = 'public.moderation_actions'::regclass
     and conname = 'moderation_actions_target_type_check';
  if fp is distinct from 'dbb1ba407960c58e045f56391b5262fa' then
    raise exception 'image-actions: target_type CHECK changed underneath this file (md5 %)', fp;
  end if;

  -- BY BEHAVIOUR. The table refuses DELETE, so the probe rows are undone by
  -- raising a private SQLSTATE at the end of the inner block: the handler
  -- rolls the whole subtransaction back, both inserts included.
  begin
    insert into public.moderation_actions (actor_id, action, target_type, target_id, meta)
    values (null, 'image_remove', 'user', gen_random_uuid(), '{"probe": true}'::jsonb);
    insert into public.moderation_actions (actor_id, action, target_type, target_id, meta)
    values (null, 'image_restore', 'channel', gen_random_uuid(), '{"probe": true}'::jsonb);
    begin
      insert into public.moderation_actions (actor_id, action, target_type, target_id)
      values (null, 'image_bogus', 'user', gen_random_uuid());
      state := 'accepted';
    exception when check_violation then
      state := 'refused';
    end;
    raise exception using errcode = 'P0B11', message = coalesce(state, 'none');
  exception when sqlstate 'P0B11' then
    state := sqlerrm;
  end;
  if state is distinct from 'refused' then
    raise exception 'image-actions: an unknown action was % by the new CHECK', state;
  end if;
  if exists (select 1 from public.moderation_actions where meta ? 'probe') then
    raise exception 'image-actions: a probe row survived the post-check';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
