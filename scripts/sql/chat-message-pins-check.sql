-- chat-message-pins-check.sql: the check of
-- supabase/migrations/20261004100000_chat_message_pins.sql (contract
-- handoffs/chat-redesign/wave-3-desktop/contract.md 4b.1, section 9): the
-- table chat_message_pins and the trigger chat_pins_drop_removed on messages.
--
-- LOCAL ONLY. Run it AFTER the migration has been applied to the local stack
-- and its schema_migrations row recorded:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-message-pins-check.sql
-- Never on production: it writes (and rolls back) a room, room members,
-- messages and pins, and for a moment it creates functions in pg_temp. It
-- refuses any connection that is not the local unix socket (docker exec), and
-- its first line is a psql command, so the Management API and the MCP refuse
-- the file before anything runs. One builder on the local database at a time
-- (contract 4b): do not run it beside another check script or the seed.
-- Expected last line: chat-message-pins-check: all N cases passed. Nothing is
-- kept: ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK. The PEOPLE are the seed's (the two oldest users rows: A writes
-- the messages, B is the other person in the chat); the ROOM is a throwaway
-- dm holding both, with five messages of A's (m1 .. m5).
-- Cases: C the catalog again (columns, the key and the three foreign keys
-- with their delete rules, indexes, RLS on with no policy, the grants, the
-- function, the trigger, the triggers on messages, the recorded row); B a
-- pin, a second pin (23505), the defaults, the foreign key and not-null
-- refusals; G the grants by behaviour: every statement on the table as anon
-- and as a signed-in person IN the chat is refused (42501), the service role
-- reads and writes but cannot truncate; T the trigger (an update that is not a
-- removal keeps the pin; the moderator's soft removal drops that pin and no
-- other; a restore does not bring it back; a change from one removal time to
-- another fires nothing); D the deletes (the sender's own delete, as the
-- sender under RLS, takes the pin although the sender holds no right on the
-- pins table; another person's delete takes nothing; deleting the chat takes
-- its pins).
-- NOT simulated: pinned_by SET NULL when the pinner's account is deleted
-- (deleting a users row drags the whole account; the delete rule is checked
-- by catalog, C2), and a run of the trigger for a caller without rights on
-- the pins table (nobody but the service role can update messages; SECURITY
-- DEFINER is checked by catalog, C7).
-- It raises on the first expectation that fails ("chat-message-pins-check
-- FAILED: ...") and prints one NOTICE per case that passes.
--
-- HOW IT ACTS AS SOMEONE. The pin routes write with the SERVICE client: role
-- service_role, no claims. A browser could only come as anon or as
-- authenticated with the person's id in request.jwt.claims, the way
-- PostgREST runs a request: that is how the G and D cases run.
-- Answers: the number of rows the statement read or wrote, or 'E' + the
-- SQLSTATE that refused it (E42501 = "permission denied for table": a TABLE
-- refusal is an ordinary error on this image; only a refused FUNCTION call
-- crashes it, and nothing here refuses one).

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has the migration.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'chat-message-pins-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regclass('public.chat_message_pins') is null
     or to_regprocedure('public.chat_pins_drop_removed()') is null then
    raise exception 'chat-message-pins-check: chat_message_pins or chat_pins_drop_removed is missing. Apply 20261004100000_chat_message_pins.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.mp_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'chat-message-pins-check FAILED: % (got "%", expected "%")',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('chat_message_pins_check.passed',
    (coalesce(nullif(current_setting('chat_message_pins_check.passed', true), ''), '0')::int + 1)::text,
    true);
  raise notice 'chat-message-pins-check ok: %', p_case;
end $$;

-- Runs one statement as a role (and, with p_who, as that person): the number
-- of rows it read or wrote, or 'E' + the SQLSTATE that refused it.
create function pg_temp.mp_run(p_role text, p_who uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  me  text := current_user;
  n   bigint;
  got text;
begin
  perform set_config('request.jwt.claims',
    case when p_who is null then ''
         else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    got := n::text;
  exception when others then
    got := 'E' || sqlstate;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;

-- Ids travel between the blocks as transaction-local settings.
create function pg_temp.mp_keep(p_key text, p_id uuid)
returns void
language plpgsql
as $$
begin
  if p_id is null then
    raise exception 'chat-message-pins-check: fixture % was not found in the local database (the seed is needed: node scripts/local-seed.mjs)', p_key;
  end if;
  perform set_config('chat_message_pins_check.' || p_key, p_id::text, true);
end $$;

create function pg_temp.mp_id(p_key text)
returns uuid language sql
as $$ select nullif(current_setting('chat_message_pins_check.' || p_key, true), '')::uuid $$;

-- A fixture's id as a quoted uuid literal, for the statements run as a role.
create function pg_temp.mp_q(p_key text)
returns text language sql
as $$ select quote_literal(pg_temp.mp_id(p_key)::text) || '::uuid' $$;

-- How many pin rows a message has, and whether the message is still there
-- (1 or 0), read as postgres. Functions, not inline subqueries: a volatile
-- function reads with a fresh snapshot, so beside pg_temp.mp_run in ONE
-- expression they see what that statement just wrote.
create function pg_temp.mp_pins(p_key text)
returns text language sql
as $$ select count(*)::text from public.chat_message_pins p where p.message_id = pg_temp.mp_id(p_key) $$;

create function pg_temp.mp_left(p_key text)
returns text language sql
as $$ select count(*)::text from public.messages m where m.id = pg_temp.mp_id(p_key) $$;

-- Fixtures -----------------------------------------------------------------------
do $$
declare
  v_a    uuid;
  v_b    uuid;
  v_chat uuid := gen_random_uuid();
  t0     timestamptz := now();
begin
  select u.id into v_a from public.users u order by u.created_at, u.id limit 1;
  select u.id into v_b from public.users u where u.id <> v_a order by u.created_at, u.id limit 1;
  perform pg_temp.mp_keep('a', v_a);
  perform pg_temp.mp_keep('b', v_b);
  perform pg_temp.mp_keep('chat', v_chat);
  insert into public.channels (id, type, name) values (v_chat, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  values (v_chat, v_a, 'member', t0, t0), (v_chat, v_b, 'member', t0, t0);
  for i in 1 .. 5 loop
    perform pg_temp.mp_keep('m' || i, gen_random_uuid());
    insert into public.messages (id, channel_id, user_id, content, created_at)
    values (pg_temp.mp_id('m' || i), v_chat, v_a, 'chat-message-pins-check: m' || i, t0 - make_interval(mins => i));
  end loop;
  perform pg_temp.mp_keep('nobody', gen_random_uuid());   -- an id no message has
end $$;

-- C. The catalog, again ------------------------------------------------------------
do $$
declare
  t constant regclass := 'public.chat_message_pins'::regclass;
  f constant oid := to_regprocedure('public.chat_pins_drop_removed()');
begin
  perform pg_temp.mp_ok('C1 four columns: types, null rules, the one default',
    (select string_agg(format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                              case when a.attnotnull then ' not null' else '' end,
                              coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                       ', ' order by a.attnum)
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = t and a.attnum > 0 and not a.attisdropped),
    'message_id uuid not null, channel_id uuid not null, pinned_by uuid, pinned_at timestamp with time zone not null default now()');
  perform pg_temp.mp_ok('C2 the key and three foreign keys: messages cascade, channels cascade, users set null',
    (select string_agg(format('%s %s (%s) %s %s', c.conname, c.contype,
                              (select string_agg(a.attname, ',' order by k.o)
                                 from unnest(c.conkey) with ordinality k(n, o)
                                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n),
                              coalesce(rn.nspname || '.' || r.relname, '-'),
                              case when c.contype = 'f' then c.confdeltype::text else '-' end),
                       ', ' order by c.conname collate "C")
       from pg_constraint c
       left join pg_class r on r.oid = c.confrelid
       left join pg_namespace rn on rn.oid = r.relnamespace
      where c.conrelid = t and c.contype in ('p', 'f', 'u', 'c', 'x') and c.convalidated),
    'chat_message_pins_channel_id_fkey f (channel_id) public.channels c, '
    || 'chat_message_pins_message_id_fkey f (message_id) public.messages c, '
    || 'chat_message_pins_pinned_by_fkey f (pinned_by) public.users n, '
    || 'chat_message_pins_pkey p (message_id) - -');
  perform pg_temp.mp_ok('C3 three valid btree indexes: the key, (channel_id, pinned_at desc), (pinned_by)',
    (select string_agg(format('%s (%s)%s', ic.relname,
                              (select string_agg(a.attname || case when (i.indoption[k.o - 1] & 1) = 1 then ' desc' else '' end,
                                                 ',' order by k.o)
                                 from unnest(i.indkey::int2[]) with ordinality k(n, o)
                                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n),
                              case when i.indisunique then ' unique' else '' end),
                       ', ' order by ic.relname collate "C")
       from pg_index i
       join pg_class ic on ic.oid = i.indexrelid
       join pg_am am on am.oid = ic.relam
      where i.indrelid = t and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree'),
    'chat_message_pins_pkey (message_id) unique, idx_chat_message_pins_channel (channel_id,pinned_at desc), idx_chat_message_pins_pinned_by (pinned_by)');
  perform pg_temp.mp_ok('C4 RLS on, and not one policy',
    (select 'rls=' || c.relrowsecurity || ' policies=' || (select count(*) from pg_policy p where p.polrelid = c.oid)
       from pg_class c where c.oid = t),
    'rls=true policies=0');
  perform pg_temp.mp_ok('C5 beside the owner the ACL names service_role alone, with exactly the four',
    (select coalesce(string_agg(x.who || '=' || x.privs, ' ' order by x.who), '(none)')
       from (select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as who,
                    string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
               from pg_class c
               cross join lateral aclexplode(c.relacl) a
              where c.oid = t and a.grantee <> c.relowner
              group by a.grantee) x),
    'service_role=DELETE,INSERT,SELECT,UPDATE');
  perform pg_temp.mp_ok('C6 anon and authenticated hold no privilege (select, insert, update, delete, truncate, references, trigger)',
    (select coalesce(string_agg(rl.r || ' ' || pv.p, ', ' order by rl.r, pv.p), '')
       from (values ('anon'), ('authenticated')) as rl (r)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as pv (p)
      where has_table_privilege(rl.r, t, pv.p)),
    '');
  perform pg_temp.mp_ok('C7 the function: security definer, plpgsql, returns trigger, search_path ""',
    (select concat_ws(' ', case when p.prosecdef then 'definer' else 'invoker' end, l.lanname,
                      p.prorettype::regtype::text, array_to_string(p.proconfig, ';'))
       from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f),
    'definer plpgsql trigger search_path=""');
  perform pg_temp.mp_ok('C8 the trigger: enabled, AFTER UPDATE OF removed_at, FOR EACH ROW, with the WHEN clause',
    (select concat_ws(' ', g.tgenabled::text, g.tgtype::text,
                      (select string_agg(a.attname, ',') from pg_attribute a
                        where a.attrelid = g.tgrelid and a.attnum = any (g.tgattr::int2[])),
                      substring(regexp_replace(lower(pg_get_triggerdef(g.oid)), '[()\s]', '', 'g') from 'when.*executefunction'))
       from pg_trigger g
      where g.tgrelid = 'public.messages'::regclass and g.tgname = 'chat_pins_drop_removed' and g.tgfoid = f),
    'O 17 removed_at whennew.removed_atisnotnullandold.removed_atisnullexecutefunction');
  perform pg_temp.mp_ok('C9 the triggers on messages: the two that were there and this one',
    (select string_agg(g.tgname, ', ' order by g.tgname collate "C") from pg_trigger g
      where g.tgrelid = 'public.messages'::regclass and not g.tgisinternal),
    'bump_org_activity_on_message, chat_pins_drop_removed, messages_check_media_ref');
  perform pg_temp.mp_ok('C10 the table''s comment names the two other pins',
    (select (obj_description(t, 'pg_class') like 'A message pinned for everyone in a dm or group chat.%NOT channel_members.pinned_at%NOT channels.pinned%')::text),
    'true');
  perform pg_temp.mp_ok('C11 the migration''s row is recorded',
    (select string_agg(m.name, ',') from supabase_migrations.schema_migrations m where m.version = '20261004100000'),
    'chat_message_pins');
end $$;

-- B. A pin, as the routes write it (service role) ---------------------------------
do $$
declare
  ins constant text := 'insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (';
begin
  perform pg_temp.mp_ok('B1 the service role pins m1',
    pg_temp.mp_run('service_role', null,
      ins || pg_temp.mp_q('m1') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('b') || ')'), '1');
  perform pg_temp.mp_ok('B2 a second pin of m1 is a duplicate key (the route answers "already")',
    pg_temp.mp_run('service_role', null,
      ins || pg_temp.mp_q('m1') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('a') || ')'), 'E23505');
  perform pg_temp.mp_ok('B3 the row keeps who pinned and its chat, and pinned_at fills itself',
    (select concat_ws(' ', 'by=' || (p.pinned_by = pg_temp.mp_id('b')), 'chat=' || (p.channel_id = pg_temp.mp_id('chat')),
                      'at=' || (p.pinned_at is not null))
       from public.chat_message_pins p where p.message_id = pg_temp.mp_id('m1')),
    'by=true chat=true at=true');
  perform pg_temp.mp_ok('B4 a pin for a message that does not exist is refused (foreign key)',
    pg_temp.mp_run('service_role', null,
      ins || pg_temp.mp_q('nobody') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('a') || ')'), 'E23503');
  perform pg_temp.mp_ok('B5 a pin without its chat is refused (not null)',
    pg_temp.mp_run('service_role', null,
      ins || pg_temp.mp_q('m2') || ', null, ' || pg_temp.mp_q('a') || ')'), 'E23502');
  perform pg_temp.mp_ok('B6 a pin with nobody behind it is allowed (pinned_by may be null: the pinner''s account is gone)',
    pg_temp.mp_run('service_role', null,
      ins || pg_temp.mp_q('m2') || ', ' || pg_temp.mp_q('chat') || ', null)'), '1');
end $$;

-- G. The grants, by behaviour: m1 and m2 are pinned now ----------------------------
-- Every statement, as anon (no claims) and as A, who wrote both messages and
-- is in the chat: a TABLE refusal, 42501. Then the service role.
do $$
declare
  r   record;
  s   record;
  who uuid;
begin
  for r in select * from (values ('anon'), ('authenticated')) as x (role) loop
    who := case when r.role = 'authenticated' then pg_temp.mp_id('a') end;
    for s in
      select * from (values
        (1, 'select', 'select 1 from public.chat_message_pins'),
        (2, 'insert', 'insert into public.chat_message_pins (message_id, channel_id, pinned_by) values ('
                      || pg_temp.mp_q('m3') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('a') || ')'),
        (3, 'update', 'update public.chat_message_pins set pinned_at = now()'),
        (4, 'delete', 'delete from public.chat_message_pins'),
        (5, 'truncate', 'truncate public.chat_message_pins')) as y (n, verb, sql)
      order by 1
    loop
      perform pg_temp.mp_ok(format('G %s: %s is refused', r.role, s.verb),
        pg_temp.mp_run(r.role, who, s.sql), 'E42501');
    end loop;
  end loop;
  perform pg_temp.mp_ok('G nothing above changed a row: m1 and m2 are still pinned, m3 is not',
    pg_temp.mp_pins('m1') || pg_temp.mp_pins('m2') || pg_temp.mp_pins('m3'), '110');
  perform pg_temp.mp_ok('G service_role: reads the chat''s two pins',
    pg_temp.mp_run('service_role', null,
      'select 1 from public.chat_message_pins where channel_id = ' || pg_temp.mp_q('chat')), '2');
  perform pg_temp.mp_ok('G service_role: updates one',
    pg_temp.mp_run('service_role', null,
      'update public.chat_message_pins set pinned_by = ' || pg_temp.mp_q('a') || ' where message_id = ' || pg_temp.mp_q('m2')), '1');
  perform pg_temp.mp_ok('G service_role: truncate is refused (it holds select, insert, update, delete and no more)',
    pg_temp.mp_run('service_role', null, 'truncate public.chat_message_pins'), 'E42501');
end $$;

-- T. The trigger: a removed message drops its pin --------------------------------
-- The writes to messages run as the service role, as the moderator's removal
-- and restore do (src/lib/moderation/actions.ts).
do $$
declare
  upd constant text := 'update public.messages set ';
begin
  perform pg_temp.mp_ok('T1 an update that leaves removed_at null keeps the pin (the WHEN clause)',
    pg_temp.mp_run('service_role', null, upd || 'removed_at = null where id = ' || pg_temp.mp_q('m1'))
    || ' pins=' || pg_temp.mp_pins('m1'), '1 pins=1');
  perform pg_temp.mp_ok('T2 an update of another column keeps the pin',
    pg_temp.mp_run('service_role', null, upd || 'content = content || '' (edited)'' where id = ' || pg_temp.mp_q('m1'))
    || ' pins=' || pg_temp.mp_pins('m1'), '1 pins=1');
  perform pg_temp.mp_ok('T3 a soft removal drops that message''s pin and no other',
    pg_temp.mp_run('service_role', null,
      upd || 'removed_at = now(), removed_by = ' || pg_temp.mp_q('b')
          || ', removed_reason = ''chat-message-pins-check'' where removed_at is null and id = ' || pg_temp.mp_q('m1'))
    || ' m1=' || pg_temp.mp_pins('m1') || ' m2=' || pg_temp.mp_pins('m2'), '1 m1=0 m2=1');
  perform pg_temp.mp_ok('T4 a restore does not bring the pin back',
    pg_temp.mp_run('service_role', null,
      upd || 'removed_at = null, removed_by = null, removed_reason = null where id = ' || pg_temp.mp_q('m1'))
    || ' pins=' || pg_temp.mp_pins('m1'), '1 pins=0');
  perform pg_temp.mp_ok('T5 removing a message that has no pin is just the removal (the trigger finds nothing and says nothing)',
    pg_temp.mp_run('service_role', null, upd || 'removed_at = now() where id = ' || pg_temp.mp_q('m3'))
    || ' pins=' || pg_temp.mp_pins('m3'), '1 pins=0');
  perform pg_temp.mp_ok('T6 a pin put on a removed message stays when removed_at only changes from one time to another',
    pg_temp.mp_run('service_role', null,
      'insert into public.chat_message_pins (message_id, channel_id, pinned_by) values ('
      || pg_temp.mp_q('m3') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('a') || ')')
    || ' ' || pg_temp.mp_run('service_role', null,
      upd || 'removed_at = now() + interval ''1 minute'' where id = ' || pg_temp.mp_q('m3'))
    || ' pins=' || pg_temp.mp_pins('m3'), '1 1 pins=1');
end $$;

-- D. Deletes -----------------------------------------------------------------------
-- m4 and m5 get a pin first. Then the sender's own delete, as the sender:
-- role authenticated under RLS (messages_delete_own), with no right at all on
-- chat_message_pins; the cascade still takes the pin.
do $$
declare
  ins constant text := 'insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (';
begin
  perform pg_temp.mp_ok('D0 the service role pins m4 and m5',
    pg_temp.mp_run('service_role', null, ins || pg_temp.mp_q('m4') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('b') || '), ('
                                             || pg_temp.mp_q('m5') || ', ' || pg_temp.mp_q('chat') || ', ' || pg_temp.mp_q('b') || ')'), '2');
  perform pg_temp.mp_ok('D1 the sender deletes their own pinned message: the message and its pin are gone',
    pg_temp.mp_run('authenticated', pg_temp.mp_id('a'), 'delete from public.messages where id = ' || pg_temp.mp_q('m4'))
    || ' left=' || pg_temp.mp_left('m4')
    || ' pins=' || pg_temp.mp_pins('m4'), '1 left=0 pins=0');
  perform pg_temp.mp_ok('D2 the other person cannot delete it for them: the message and its pin stay',
    pg_temp.mp_run('authenticated', pg_temp.mp_id('b'), 'delete from public.messages where id = ' || pg_temp.mp_q('m5'))
    || ' left=' || pg_temp.mp_left('m5')
    || ' pins=' || pg_temp.mp_pins('m5'), '0 left=1 pins=1');
  perform pg_temp.mp_ok('D3 an unpin as the route writes it (by message and chat); a second one finds nothing and is no error',
    pg_temp.mp_run('service_role', null,
      'delete from public.chat_message_pins where message_id = ' || pg_temp.mp_q('m5') || ' and channel_id = ' || pg_temp.mp_q('chat'))
    || ' ' || pg_temp.mp_run('service_role', null,
      'delete from public.chat_message_pins where message_id = ' || pg_temp.mp_q('m5') || ' and channel_id = ' || pg_temp.mp_q('chat')),
    '1 0');
  perform pg_temp.mp_ok('D4 before the chat goes it holds two pins (m2, m3)',
    (select count(*)::text from public.chat_message_pins p where p.channel_id = pg_temp.mp_id('chat')), '2');
  delete from public.channels where id = pg_temp.mp_id('chat');
  perform pg_temp.mp_ok('D5 deleting the chat takes its messages and every pin of it',
    (select count(*) from public.messages m where m.channel_id = pg_temp.mp_id('chat'))
    || ' ' || (select count(*) from public.chat_message_pins p
                where p.channel_id = pg_temp.mp_id('chat')
                   or p.message_id in (pg_temp.mp_id('m1'), pg_temp.mp_id('m2'), pg_temp.mp_id('m3'),
                                       pg_temp.mp_id('m4'), pg_temp.mp_id('m5'))), '0 0');
end $$;

-- The end. -----------------------------------------------------------------------
do $$
begin
  if current_user <> session_user then
    raise exception 'chat-message-pins-check: the run did not return to its own role (now %)', current_user;
  end if;
  raise notice 'chat-message-pins-check: all % cases passed',
    coalesce(nullif(current_setting('chat_message_pins_check.passed', true), ''), '0');
end $$;

rollback;
