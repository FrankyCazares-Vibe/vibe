-- The header's ROLLBACK block of 20261019150000_message_deleted_note.sql,
-- for the LOCAL stack only (docker exec ... psql < this file). Since the
-- review of Oct 19, 2026 it also puts messages_delete_own back (5b dropped
-- it). "if not exists" style: it runs on a stack that still has the policy.
BEGIN;
SET LOCAL lock_timeout = '5s';
delete from public.messages where deleted_at is not null;
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (auth.uid() = user_id);
drop function if exists public.delete_own_message(uuid);
drop trigger if exists messages_insert_not_deleted on public.messages;
drop function if exists public.messages_insert_not_deleted();
alter table public.messages drop constraint if exists messages_deleted_is_empty;
alter table public.messages drop column if exists deleted_at;
delete from supabase_migrations.schema_migrations where version = '20261019150000';
notify pgrst, 'reload schema';
COMMIT;
