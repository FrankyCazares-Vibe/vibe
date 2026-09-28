-- Security wave (S67), batch a: chat reactions accept only the approved emoji,
-- in the database too, not only in the route.
--
-- WHY THIS EXISTS. Report handoffs/2026-09-27-security-risk-report.md, risk #1
-- ("[High] A booby-trapped emoji reaction..."). POST
-- /api/me/threads/[id]/messages/[messageId]/react accepts only seven emoji,
-- but the browser holds the anon key, so any member of a chat can skip the
-- route and POST /rest/v1/message_reactions with their own user_id and any
-- 1-16 character string. message_reactions_insert_member checks membership
-- only, and the only limit on the value was length(emoji) BETWEEN 1 AND 16.
-- The two static chat screens (public/html/messages.html and
-- public/html/_miniMessenger.js) then put that string into innerHTML for every
-- other member: stored XSS. Those renderers now escape it and the messages GET
-- route drops unknown values; this file closes the write side at the root.
--
-- WHAT THIS FILE DOES
--   1. Replaces message_reactions_emoji_check (same name) with a CHECK that
--      emoji is EXACTLY one of the seven strings in
--      src/lib/messages/reaction-emoji.ts ALLOWED_EMOJIS. The strings are
--      written as U& escapes so no editor can quietly drop the heart's U+FE0F:
--        U&'\2764\FE0F'  ❤️   U&'\+01F44D'  👍   U&'\+01F44E'  👎
--        U&'\+01F602'    😂   U&'\+01F525'  🔥   U&'\+01F62E'  😮
--        U&'\+01F622'    😢
--      Equality under the default (deterministic) collation is byte-exact, the
--      same test the route's Set.has makes, so the route and the database give
--      one answer. The CHECK also covers UPDATE and every role, service role
--      included.
--   2. The new constraint is added VALIDATED: production holds only listed
--      values (LIVE STATE). PRE-FLIGHT aborts if that has changed, see below.
--   3. POST-CHECK proves it by behaviour inside the transaction: an insert
--      carrying markup fails the CHECK, and each listed emoji gets past the
--      CHECK (it then fails the message_id foreign key, so no row is written).
--   4. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch any grant (anon and authenticated keep arwdDxtm; RLS is what
-- limits them), any of the three policies, the primary key, the index, or any
-- row. No function, no trigger.
--
-- LIVE STATE (read-only MCP, 2026-09-27, at c72aaa2):
--   * pg_get_constraintdef of message_reactions_emoji_check:
--       CHECK (((length(emoji) >= 1) AND (length(emoji) <= 16)))
--     plus message_reactions_pkey (message_id, user_id, emoji) and the two FKs
--     (message_id -> messages ON DELETE CASCADE, user_id -> users ON DELETE
--     CASCADE).
--   * 24 rows, all on the list: ❤️ 5 (stored as e29da4 efb88f, WITH U+FE0F),
--     👍 5, 👎 5, 😂 4, 🔥 4, 😢 1. Nothing outside it, so no NOT VALID.
--   * relacl {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--     service_role=arwdDxtm}; RLS on, not forced. Policies:
--     message_reactions_select_member (SELECT), message_reactions_insert_member
--     (INSERT, membership + NOT is_restricted_now()), message_reactions_delete_own
--     (DELETE). No UPDATE policy, so a direct UPDATE already changes nothing.
--   * Latest recorded schema_migrations version: 20260927100000.
--   * Writers: only the react route inserts (grep of src/ and public/,
--     2026-09-27). campus-home.tsx and MessagesMobile.tsx post to that route.
--   Tested on the local database (supabase_db_vibe): applied cleanly; a direct
--   insert of '<b>x</b>' as a channel member is refused with 23514; a listed
--   emoji still inserts.
--
-- PRE-FLIGHT (inside the transaction; any surprise aborts the whole file):
--   * the constraint exists and still reads as the length-only CHECK above;
--   * RLS is still on;
--   * no stored row is outside the list. If this one fires, someone wrote a
--     reaction around the route after 2026-09-27: read those rows (SELECT
--     message_id, user_id, emoji FROM public.message_reactions WHERE emoji <>
--     ALL (...)), keep a copy, delete them, then re-run. The GET route already
--     hides them. Do not switch this file to NOT VALID to get past it.
--
-- HOW TO APPLY (the 20260926100000 recipe: management API with curl, then a
-- SEPARATE request for the schema_migrations row):
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260927110000', 'message_reactions_emoji_allowlist');
-- Order against the deploy doesn't matter: the route already refuses the same
-- values, and the new code works with either constraint.
--
-- POST-CHECK (read-only, after applying):
--   SELECT pg_get_constraintdef(oid), convalidated FROM pg_constraint
--    WHERE conrelid = 'public.message_reactions'::regclass
--      AND conname = 'message_reactions_emoji_check';
--   -- CHECK ((emoji = ANY (ARRAY['❤️'::text, ... '😢'::text]))) | t
--
-- ROLLBACK (one transaction; puts back the length-only check):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   ALTER TABLE public.message_reactions DROP CONSTRAINT message_reactions_emoji_check;
--   ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_emoji_check
--     CHECK (length(emoji) BETWEEN 1 AND 16);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927110000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- ALTER TABLE takes an ACCESS EXCLUSIVE lock on message_reactions; the CHECK
-- scan covers a couple of dozen rows. Fail fast rather than queue every chat
-- read behind a stuck lock.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT ---------------------------------------------------------------
do $$
declare
  def text;
  stray int;
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = 'public.message_reactions'::regclass
     and c.conname = 'message_reactions_emoji_check';
  if def is distinct from 'CHECK (((length(emoji) >= 1) AND (length(emoji) <= 16)))' then
    raise exception 'reaction-emoji: message_reactions_emoji_check is not the one this file was written against: %',
      coalesce(def, '(missing)');
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.message_reactions'::regclass) then
    raise exception 'reaction-emoji: row level security is off on message_reactions';
  end if;

  select count(*) into stray
    from public.message_reactions
   where emoji <> all (array[
           U&'\2764\FE0F', U&'\+01F44D', U&'\+01F44E', U&'\+01F602',
           U&'\+01F525', U&'\+01F62E', U&'\+01F622'
         ]::text[]);
  if stray > 0 then
    raise exception 'reaction-emoji: % stored reaction(s) are not on the list; read, keep and delete them first (see PRE-FLIGHT in the header)', stray;
  end if;
end $$;

-- 1. The allow-list CHECK -------------------------------------------------------
-- One ALTER, so the table is never without a check in between. Same name, so
-- anything that reads the constraint by name keeps working.
alter table public.message_reactions
  drop constraint message_reactions_emoji_check,
  add constraint message_reactions_emoji_check
    check (emoji = any (array[
      U&'\2764\FE0F', U&'\+01F44D', U&'\+01F44E', U&'\+01F602',
      U&'\+01F525', U&'\+01F62E', U&'\+01F622'
    ]::text[]));

comment on constraint message_reactions_emoji_check on public.message_reactions is
  'Security wave S67 (report risk #1): emoji must be exactly one of src/lib/messages/reaction-emoji.ts ALLOWED_EMOJIS (❤️ with U+FE0F, 👍, 👎, 😂, 🔥, 😮, 😢). Change both together.';

-- 2. POST-CHECK, by behaviour. Each probe runs in its own subtransaction and
-- points at a message that doesn't exist, so nothing is ever written: a bad
-- value must stop at the CHECK (23514); a listed one must get past the CHECK
-- and stop at the message_id foreign key (23503) instead.
do $$
declare
  probe text;
begin
  if not (select convalidated from pg_constraint
           where conrelid = 'public.message_reactions'::regclass
             and conname = 'message_reactions_emoji_check') then
    raise exception 'reaction-emoji: the new check is not validated';
  end if;

  foreach probe in array array[
    '<b>x</b>', '<img src=x>', '''-alert(1)-''', U&'\2764', ' ' || U&'\+01F44D', 'x'
  ]::text[] loop
    begin
      insert into public.message_reactions (message_id, user_id, emoji)
      values (gen_random_uuid(), gen_random_uuid(), probe);
      raise exception 'reaction-emoji: % was stored', probe;
    exception
      when check_violation then null;
      when foreign_key_violation then
        raise exception 'reaction-emoji: % got past the check', probe;
    end;
  end loop;

  foreach probe in array array[
    U&'\2764\FE0F', U&'\+01F44D', U&'\+01F44E', U&'\+01F602',
    U&'\+01F525', U&'\+01F62E', U&'\+01F622'
  ]::text[] loop
    begin
      insert into public.message_reactions (message_id, user_id, emoji)
      values (gen_random_uuid(), gen_random_uuid(), probe);
      raise exception 'reaction-emoji: a probe row for % was stored', probe;
    exception
      when foreign_key_violation then null;
      when check_violation then
        raise exception 'reaction-emoji: the listed emoji % is refused', probe;
    end;
  end loop;

  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'message_reactions') <> 3 then
    raise exception 'reaction-emoji: expected the three message_reactions policies, untouched';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) -------------------------------------
notify pgrst, 'reload schema';

commit;
