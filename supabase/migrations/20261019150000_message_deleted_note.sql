-- ---------------------------------------------------------------------------
-- 20261019150000_message_deleted_note.sql
--
-- LOCAL ONLY UNTIL FRANKY SAYS YES. During the build this file is applied to
-- the local stack only. Production waits for Franky's explicit OK; then the
-- main session applies it JUST BEFORE THE PUSH. Either order is safe: the
-- old build never calls delete_own_message (it hard-deletes as before), and
-- the new build falls back to that same hard delete when the function is
-- missing. The Privacy Policy wording of the same day describes the note, so
-- the migration must be on production when that policy goes live.
--
-- PLAIN ENGLISH (decision 8, Franky, Oct 19 2026, handoffs/2026-10-19-critique/
-- DECISIONS.md): deleting your own message leaves a grey "Message deleted"
-- line in its place, in DMs, group chats, club rooms, event chats and on the
-- Board. Its words and attachments go for everyone: the text, the photo or
-- video, a shared post, a poll or event card, its reactions, any pin on it,
-- the notification rows about it and any phone notification not sent yet.
-- What stays is that a message was there, who sent it, when it was sent, and
-- when it was deleted. A Board post's replies stay under its "Post deleted"
-- note (they are other people's words). A message the Vibe team or a club
-- removed stays hidden from everyone but its author; deleting it leaves the
-- note for them too, and its file is kept as evidence.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet; every table and column
--      the function touches is there; chat_polls' options and votes cascade.
--   1. messages.deleted_at timestamptz (null = a live message).
--   2. CHECK messages_deleted_is_empty: a deleted row holds no words, no file
--      key, no shared post, no card and no quote. The database itself keeps
--      the promise, whoever writes.
--   3. Trigger messages_insert_not_deleted: a new row can never arrive
--      already "deleted" (no fake notes through the REST API).
--   4. public.delete_own_message(p_message_id) -> jsonb, SECURITY DEFINER,
--      search_path '': the sender only (auth.uid()), one transaction, the row
--      locked. Answers {status}:
--        not_found  no such message, or not the caller's
--        already    deleted before (deleted_at)
--        deleted    the note is in place (deleted_at, purge_key)
--      purge_key is the photo or video's storage key when nothing else needs
--      it: no other message names it, the message was not removed by the
--      Vibe team or a club, and no report about it is open or acted on
--      (evidence, as with posts and account deletion). The route deletes that
--      file from storage after the answer; a failure there is only logged.
--   5. Grants: revoke all from public, EXECUTE to anon, authenticated and
--      service_role (the standing rule, 20260922090000: never revoke EXECUTE;
--      refuse inside: no caller id, 42501).
--   5b. DROP POLICY messages_delete_own (review of Oct 19, 2026): with it,
--      a sender's own login could still hard-delete the row straight through
--      the REST API, skip the function, leave no note, keep the file, and
--      take a Board post's replies with it (thread_root_id ON DELETE
--      CASCADE), which is the opposite of what the Privacy Policy now says.
--      With no DELETE policy left, RLS refuses every browser delete; the
--      function is the only way. Safe in either order: the route's hard
--      delete runs only when the function is missing, i.e. when this file
--      is not applied and the policy is still there. Account deletion does
--      not use the policy (the foreign keys cascade as the table owner), and
--      the service role bypasses RLS.
--   6. POST-CHECK by catalog (no DELETE policy is left on messages), then by
--      behaviour in a block that raises P0C91 and so undoes itself.
--
-- DOES NOT: change can_post_org_channel (a reply under a deleted Board post
-- is still allowed by the database; the app hides the reply field there);
-- touch storage (the route does); delete anything on a schedule.
--
-- LIVE STATE (LOCAL stack, Oct 19 2026, read-only): messages has 16 columns,
-- no deleted_at; 232 rows. chat_poll_options and chat_poll_votes cascade from
-- chat_polls. Local schema_migrations ends at 20261019120000.
--
-- PRE-CHECK on PRODUCTION (read-only; catalog only), after Franky's yes:
--   select count(*) from pg_attribute where attrelid = 'public.messages'::regclass
--      and attname = 'deleted_at' and not attisdropped;                          [0]
--   select to_regprocedure('public.delete_own_message(uuid)');                  [null]
--   select count(*) from pg_attribute where attrelid = 'public.reports'::regclass
--      and attname in ('status', 'target_type', 'target_id') and not attisdropped; [3]
--   select count(*) from pg_policy where polrelid = 'public.messages'::regclass
--      and polname = 'messages_delete_own';                                       [1]
--
-- LOCK. ADD COLUMN (no default), ADD CONSTRAINT and DROP POLICY take ACCESS
-- EXCLUSIVE on messages for a moment (the CHECK scans the table once). lock_timeout 5s
-- makes the file fail whole instead of queueing behind a long read.
--
-- HOW TO APPLY. Locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261019150000_message_deleted_note.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261019150000', 'message_deleted_note') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the Supabase connector's apply_migration (the body
-- without begin; and commit;), then renames the row the connector records:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261019150000', 'message_deleted_note') ON CONFLICT (version) DO NOTHING;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (one transaction). Roll the build back FIRST: the new build calls
-- the function, and without it falls back to the hard delete, which is fine.
-- The notes already left stay as empty rows; delete them so nothing shows an
-- empty bubble (they hold no words, so nothing is lost):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   delete from public.messages where deleted_at is not null;
--   create policy "messages_delete_own" on public.messages
--     for delete to authenticated using (auth.uid() = user_id);
--   drop function if exists public.delete_own_message(uuid);
--   drop trigger if exists messages_insert_not_deleted on public.messages;
--   drop function if exists public.messages_insert_not_deleted();
--   alter table public.messages drop constraint if exists messages_deleted_is_empty;
--   alter table public.messages drop column if exists deleted_at;
--   delete from supabase_migrations.schema_migrations where version = '20261019150000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED (local, Oct 19 2026): see handoffs/2026-10-19-critique/batch-B7.md.
-- Again after the review (5b added): rolled back, applied, refused a second
-- apply, rolled back, applied clean. The behaviour tests on real rows (what
-- goes, when the file is kept, no browser hard delete) are
-- scripts/sql/message-deleted-note-check.sql (local only, rolls back).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
begin
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.messages'::regclass
              and a.attname = 'deleted_at' and not a.attisdropped)
     or to_regprocedure('public.delete_own_message(uuid)') is not null then
    raise exception 'message-deleted-note: already applied (deleted_at or the function exists); read the catalog first';
  end if;
  if to_regclass('public.messages') is null or to_regclass('public.message_reactions') is null
     or to_regclass('public.chat_polls') is null or to_regclass('public.chat_event_cards') is null
     or to_regclass('public.chat_message_pins') is null or to_regclass('public.notifications') is null
     or to_regclass('public.reports') is null then
    raise exception 'message-deleted-note: a table the function touches is missing';
  end if;
  if (select count(*) from pg_attribute a where a.attrelid = 'public.messages'::regclass and not a.attisdropped
        and a.attname in ('id', 'user_id', 'channel_id', 'content', 'media_url', 'media_kind', 'attachment_id',
                          'attachment_kind', 'card_event_id', 'parent_message_id', 'kind', 'removed_at')) <> 12
     or (select count(*) from pg_attribute a where a.attrelid = 'public.reports'::regclass and not a.attisdropped
        and a.attname in ('target_type', 'target_id', 'status')) <> 3
     or (select count(*) from pg_attribute a where a.attrelid = 'public.notifications'::regclass and not a.attisdropped
        and a.attname = 'message_id') <> 1
     -- push_outbox is optional: production doesn't have it until push ships
     -- (parked until Apple accepts; found by the production pre-flight, Oct 19).
     or (to_regclass('public.push_outbox') is not null
         and (select count(*) from pg_attribute a where a.attrelid = to_regclass('public.push_outbox') and not a.attisdropped
               and a.attname = 'message_id') <> 1) then
    raise exception 'message-deleted-note: a column this file reads is missing (messages, reports, notifications or push_outbox)';
  end if;
  -- 5b leans on RLS: with no DELETE policy, every browser delete is refused.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.messages'::regclass) then
    raise exception 'message-deleted-note: row level security is off on messages';
  end if;
  -- Deleting the poll row must take its options and votes with it.
  if exists (select 1 from pg_constraint c
              where c.contype = 'f' and c.confrelid = 'public.chat_polls'::regclass and c.confdeltype <> 'c') then
    raise exception 'message-deleted-note: a foreign key to chat_polls does not cascade';
  end if;
  raise notice 'message-deleted-note: pre-flight ok';
end $$;

-- 1. When the sender deleted it. Null: a live message. -------------------------
alter table public.messages add column deleted_at timestamptz;

comment on column public.messages.deleted_at is
  'When the sender deleted this message (delete_own_message). The row stays as a "Message deleted" note: content '''' and every attachment column null (messages_deleted_is_empty).';

-- 2. A deleted row holds nothing anyone wrote or shared. -----------------------
alter table public.messages add constraint messages_deleted_is_empty check (
  deleted_at is null or (
    content = ''
    and media_url is null and media_kind is null
    and attachment_id is null and attachment_kind is null
    and card_event_id is null and parent_message_id is null
    and kind = 'text'
  )
);

-- 3. No row is born deleted. ----------------------------------------------------
create function public.messages_insert_not_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.deleted_at := null;
  return new;
end;
$$;

create trigger messages_insert_not_deleted
  before insert on public.messages
  for each row execute function public.messages_insert_not_deleted();

-- 4. The sender's delete. -------------------------------------------------------
create function public.delete_own_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  stamp timestamptz := now();
  m     record;
  purge text := null;
begin
  if uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select msg.id, msg.user_id, msg.media_url, msg.removed_at, msg.deleted_at
    into m
    from public.messages msg
   where msg.id = p_message_id
   for update;
  -- Someone else's message reads the same as no message: nothing to learn here.
  if not found or m.user_id is distinct from uid then
    return jsonb_build_object('status', 'not_found');
  end if;
  if m.deleted_at is not null then
    return jsonb_build_object('status', 'already', 'deleted_at', m.deleted_at);
  end if;

  -- The file may go only when nothing else needs it: no other message names
  -- the same key, the Vibe team or a club did not remove the message, and no
  -- report about it is open or acted on (the report's copy names the file;
  -- it is evidence, as with posts and with account deletion). A removed
  -- message still becomes the note: its removal keeps it hidden from
  -- everyone but its author, who now sees the note too.
  if m.media_url is not null
     and m.removed_at is null
     and not exists (select 1 from public.messages o
                      where o.media_url = m.media_url and o.id <> p_message_id)
     and not exists (select 1 from public.reports r
                      where r.target_type = 'message' and r.target_id = p_message_id
                        and r.status in ('open', 'actioned')) then
    purge := m.media_url;
  end if;

  -- What hangs off the message goes with its words (the cascade a hard
  -- delete ran): reactions, a poll or sign-up (its options and votes
  -- cascade), an event card's note, pins, notification rows and any phone
  -- notification not sent yet.
  delete from public.message_reactions x where x.message_id = p_message_id;
  delete from public.chat_polls x where x.message_id = p_message_id;
  delete from public.chat_event_cards x where x.message_id = p_message_id;
  delete from public.chat_message_pins x where x.message_id = p_message_id;
  delete from public.notifications x where x.message_id = p_message_id;
  -- Only where push is installed (production has no push_outbox yet).
  if to_regclass('public.push_outbox') is not null then
    execute 'delete from public.push_outbox x where x.message_id = $1' using p_message_id;
  end if;

  update public.messages msg
     set content = '',
         media_url = null, media_kind = null,
         attachment_id = null, attachment_kind = null,
         card_event_id = null, parent_message_id = null,
         kind = 'text',
         deleted_at = stamp
   where msg.id = p_message_id;

  return jsonb_build_object('status', 'deleted', 'deleted_at', stamp, 'purge_key', purge);
end;
$$;

comment on function public.delete_own_message(uuid) is
  'The sender deletes their own message (Oct 19 2026): words, files, cards, reactions, pins and notifications go; a "Message deleted" note stays (deleted_at). A removed message keeps its file as evidence.';

-- 5. Grants: never revoke EXECUTE; the function refuses inside. -----------------
revoke all on function public.delete_own_message(uuid) from public;
grant execute on function public.delete_own_message(uuid) to anon, authenticated, service_role;
revoke all on function public.messages_insert_not_deleted() from public;

-- 5b. No browser delete of a message any more (review of Oct 19, 2026). -------
-- The sender's old hard delete skipped the note, kept the file and took a
-- Board post's replies with it; delete_own_message is now the only way.
drop policy if exists "messages_delete_own" on public.messages;

-- 6a. POST-CHECK BY CATALOG -------------------------------------------------------
do $$
declare
  p record;
  r text;
begin
  if not exists (select 1 from pg_attribute a where a.attrelid = 'public.messages'::regclass
                  and a.attname = 'deleted_at' and not a.attisdropped
                  and a.atttypid = 'timestamptz'::regtype and not a.attnotnull) then
    raise exception 'message-deleted-note post-check: messages.deleted_at must be a nullable timestamptz';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.messages'::regclass
                  and c.conname = 'messages_deleted_is_empty' and c.contype = 'c' and c.convalidated) then
    raise exception 'message-deleted-note post-check: messages_deleted_is_empty is missing or not validated';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.messages'::regclass
                  and t.tgname = 'messages_insert_not_deleted' and not t.tgisinternal) then
    raise exception 'message-deleted-note post-check: the insert trigger is missing';
  end if;
  select pr.prosecdef, pr.proconfig into p from pg_proc pr
   where pr.oid = to_regprocedure('public.delete_own_message(uuid)');
  if not found then
    raise exception 'message-deleted-note post-check: delete_own_message(uuid) is missing';
  end if;
  if not p.prosecdef or p.proconfig is distinct from array['search_path=""'] then
    raise exception 'message-deleted-note post-check: delete_own_message must be SECURITY DEFINER with search_path ''''';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not has_function_privilege(r, 'public.delete_own_message(uuid)', 'execute') then
      raise exception 'message-deleted-note post-check: % lacks EXECUTE (a revoke is a crash button)', r;
    end if;
  end loop;
  if exists (select 1 from public.messages where deleted_at is not null) then
    raise exception 'message-deleted-note post-check: a row is deleted already';
  end if;
  -- 5b: RLS on, and no policy that lets anyone delete a row (polcmd 'd' is
  -- DELETE, '*' is ALL). The service role bypasses RLS; the cascades run as
  -- the table owner.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.messages'::regclass)
     or exists (select 1 from pg_policy pol where pol.polrelid = 'public.messages'::regclass
                 and pol.polcmd in ('d', '*')) then
    raise exception 'message-deleted-note post-check: a DELETE policy is left on messages (the hard delete would skip the note)';
  end if;
  raise notice 'message-deleted-note: catalog post-check ok';
end $$;

-- 6b. POST-CHECK BY BEHAVIOUR. Every probe is refused or finds nothing (no
-- real row is read or touched), and the block ends by raising P0C91, which
-- undoes its role switches.
do $$
declare
  stranger constant uuid := gen_random_uuid();
  nowhere  constant uuid := gen_random_uuid();
  got jsonb;
begin
  begin
    -- A signed-in student, straight from the database's web interface.
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    got := public.delete_own_message(nowhere);
    if got is distinct from '{"status": "not_found"}'::jsonb then
      raise exception 'message-deleted-note behaviour: a missing message answered %', got;
    end if;
    begin
      update public.messages set deleted_at = now() where id = nowhere;
      raise exception 'message-deleted-note behaviour: authenticated could update messages';
    exception when insufficient_privilege then null;
    end;

    -- Signed out: refused inside, not by a revoke.
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin
      perform public.delete_own_message(nowhere);
      raise exception 'message-deleted-note behaviour: anon called delete_own_message';
    exception when insufficient_privilege then null;
    end;

    raise exception 'message-deleted-note: behaviour post-check passed' using errcode = 'P0C91';
  exception when sqlstate 'P0C91' then
    raise notice 'message-deleted-note: behaviour post-check ok (undone)';
  end;
end $$;

notify pgrst, 'reload schema';

commit;
