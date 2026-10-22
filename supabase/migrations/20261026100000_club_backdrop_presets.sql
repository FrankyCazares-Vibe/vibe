-- ---------------------------------------------------------------------------
-- 20261026100000_club_backdrop_presets.sql
--
-- PLAIN ENGLISH
-- Five more backgrounds for a club's page (Franky, Oct 22, 2026: "one shared
-- list of the 10 tuned backgrounds"; handoffs/2026-10-22-club-tools-arc/
-- PLAN-4.md, batch K3, and SETTINGS-MAP.md section B). Officers pick a
-- club's background in the Edit page's Look section. The database keeps one
-- rule about which background names a club may hold
-- (orgs_backdrop_preset_check), today the six of 20260508140000. This file
-- lets five more names be saved: rose, cardinal, lantern, canal, onyx.
-- Nothing else changes: no club's background, no column, no grant, no
-- function. The colours live in code (src/lib/orgs/backdrops.ts); the
-- database holds only the name, never CSS (a CSS string in a column can
-- beacon a reader's address: 20260912100000's lesson). No Privacy Policy
-- change: a club's background is its page's setting, not a person's data.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT, catalog reads and one count: orgs exists; backdrop_preset
--      is text not null default 'sand-purple' (as 20260507100000 made it);
--      anon and authenticated hold no UPDATE on orgs (PATCH /api/orgs/[slug],
--      with the service role, stays the only writer); the rule reads exactly
--      as 20260508140000 left it, or exactly as this file leaves it (a
--      second run: nothing changes), and no other CHECK names the column; no
--      club holds a name outside the new eleven.
--   2. THE RULE: orgs_backdrop_preset_check dropped and added again with the
--      six names in the same order, then the five new ones. Both happen in
--      the pre-flight's own DO block, one statement, so even run as plain
--      statements there is never a moment without the rule. Adding it again
--      checks every club's row (one scan of a small table).
--   3. A comment on the rule naming the code list it must match.
--   4. POST-CHECK: the rule reads as written and is validated (so no club is
--      outside it) and is the only CHECK on the column; the column and the
--      grants as before.
--   5. notify pgrst.
--
-- THE LIST must equal storableBackdropKeys(true) in src/lib/orgs/backdrops.ts
-- ("cream" stays: an old light background a club may still hold, never
-- offered again). src/lib/orgs/backdrop-migration.test.ts reads this file
-- and fails when the two drift.
--
-- NO DATA CHANGE, NO GRANT, NO REVOKE. No row is written; every club keeps
-- the background it has. Nothing here touches a function or a policy.
--
-- SAFE TO RUN AGAIN, inside a transaction or as plain statements (the
-- connector's apply_migration runs the body without begin/commit): a rule
-- that already reads as this file's is left alone. LOCK: ACCESS EXCLUSIVE on
-- orgs for milliseconds (the drop, the add and its scan); lock_timeout 5s
-- makes the file fail whole instead of queueing behind a long read; run it
-- again.
--
-- PRE-FLIGHT on PRODUCTION (read-only; catalog and counts only, never a
-- club's row). Expected answers in brackets; any other answer: STOP, ask.
--   1. Every rule on the column today [ONE row: orgs_backdrop_preset_check |
--      CHECK ((backdrop_preset = ANY (ARRAY['cream'::text,
--      'sand-purple'::text, 'ember'::text, 'deep-violet'::text,
--      'forest'::text, 'midnight'::text]))) | t]:
--     select c.conname, pg_get_constraintdef(c.oid), c.convalidated
--       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
--      where c.conrelid = 'public.orgs'::regclass and c.contype = 'c' and a.attname = 'backdrop_preset';
--   2. Clubs per background [one row per name, every name one of the six;
--      17 clubs on the local stack: deep-violet 1, ember 1, forest 1,
--      midnight 1, sand-purple 13]:
--     select backdrop_preset, count(*) from public.orgs group by 1 order by 1;
--   3. Nothing outside the new list [0]:
--     select count(*) from public.orgs
--      where backdrop_preset not in ('cream', 'sand-purple', 'ember', 'deep-violet', 'forest',
--                                    'midnight', 'rose', 'cardinal', 'lantern', 'canal', 'onyx');
--   4. The column [text | t | 'sand-purple'::text]:
--     select format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.orgs'::regclass and a.attname = 'backdrop_preset' and not a.attisdropped;
--   5. Who may write orgs [anon f, authenticated f]:
--     select r, has_any_column_privilege(r, 'public.orgs', 'update')
--       from (values ('anon'), ('authenticated')) as v (r);
--      (A t there: do NOT apply, ask why first.)
--
-- HOW TO APPLY. Locally, through the unix socket (one builder at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261026100000_club_backdrop_presets.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261026100000', 'club_backdrop_presets') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the connector's apply_migration (the body between begin
-- and commit), then renames the connector's auto-timestamp row in
-- supabase_migrations.schema_migrations to '20261026100000' /
-- 'club_backdrop_presets'.
--
-- DEPLOY ORDER: THIS FILE FIRST, then the code flip in its own deploy:
-- NEW_BACKDROPS_LIVE = true in src/lib/orgs/backdrops.ts (and its test's
-- "flip only after" line in backdrops.test.ts). Before the flip the code
-- offers and saves only the five older backgrounds, so it is right on either
-- database. The flip on a database WITHOUT this file: the picker offers the
-- five new ones and saving one answers 409 backdrop_not_ready (the database
-- refuses it, 23514 on orgs_backdrop_preset_check); nothing else breaks.
--
-- POST-CHECK (read-only, right after applying). Expected in brackets.
--   1. The rule [ONE row: orgs_backdrop_preset_check |
--      CHECK ((backdrop_preset = ANY (ARRAY['cream'::text,
--      'sand-purple'::text, 'ember'::text, 'deep-violet'::text,
--      'forest'::text, 'midnight'::text, 'rose'::text, 'cardinal'::text,
--      'lantern'::text, 'canal'::text, 'onyx'::text]))) | t]: PRE-FLIGHT 1.
--   2. Clubs per background [the same rows as PRE-FLIGHT 2]: PRE-FLIGHT 2.
--   3. Still nothing outside it, the column and the grants as before
--      [0 | text t 'sand-purple'::text | anon f, authenticated f]:
--      PRE-FLIGHT 3, 4 and 5.
--
-- ROLLBACK (one transaction). FIRST put NEW_BACKDROPS_LIVE back to false and
-- deploy, so no picker offers a new background. Then count who is on one
-- [a count: those clubs go back to Dusk, their officers may want a word]:
--   select count(*) from public.orgs where backdrop_preset in ('rose', 'cardinal', 'lantern', 'canal', 'onyx');
-- and run:
--   begin;
--   set local lock_timeout = '5s';
--   update public.orgs set backdrop_preset = 'sand-purple'
--    where backdrop_preset in ('rose', 'cardinal', 'lantern', 'canal', 'onyx');
--   alter table public.orgs drop constraint if exists orgs_backdrop_preset_check;
--   alter table public.orgs add constraint orgs_backdrop_preset_check
--     check (backdrop_preset in ('cream', 'sand-purple', 'ember', 'deep-violet', 'forest', 'midnight'));
--   delete from supabase_migrations.schema_migrations where version = '20261026100000';
--   notify pgrst, 'reload schema';
--   commit;
--   (The update first, or adding the old rule back fails on those rows. It
--   writes only backdrop_preset: no trigger on orgs fires for that column.
--   Dropping the rule drops this file's comment with it. PRE-FLIGHT 1 then
--   reads the six-key answer again.)
--
-- REHEARSED on the local stack on Oct 22, 2026 (batch K3): PRE-FLIGHT 1-5
-- [the six-name rule, t | 17 clubs: deep-violet 1, ember 1, forest 1,
-- midnight 1, sand-purple 13 | 0 | text t 'sand-purple'::text | anon f,
-- authenticated f]; before applying, 'rose' on a club refused (23514,
-- constraint orgs_backdrop_preset_check, the code K1's route turns into 409
-- backdrop_not_ready), rolled back. Applied: pre-flight ok (widening it),
-- post-check ok; the schema_migrations row; POST-CHECK 1-3 [the eleven-name
-- rule, t | the same rows | 0, the column and grants as before], the comment
-- there. Applied again: pre-flight ok (applied before, the rule left alone),
-- post-check ok. Probes inside BEGIN ... ROLLBACK: the five new names,
-- cream and midnight saved; 'nonsense', 'Rose', '' and 'url(x)' refused
-- (23514); authenticated's UPDATE refused (permission denied); counts
-- unchanged after. The pre-flight stopped the file, changing nothing, on a
-- drifted rule (a 'teal' list), a missing rule and an UPDATE granted to
-- authenticated (each set up inside a transaction that rolled back). The
-- ROLLBACK above, with one Dusk club put on rose first [count 1]: that club
-- back on sand-purple, the six-name rule, the comment and the row gone,
-- PRE-FLIGHT 1-5 as before. Then the body without begin/commit as plain
-- statements (one WARNING: SET LOCAL outside a transaction, harmless), the
-- row, POST-CHECK as before. The local stack keeps it applied, with its row.
-- Re-rehearsed by the K3 review the same day, after the one-rule guard was
-- added: a second CHECK on the column (set up inside a transaction that
-- rolled back) stopped the file on the six-name rule and on the eleven, and
-- failed the post-check run alone; the ROLLBACK for real [count 0]; then the
-- body as ONE query string without begin/commit, the connector's shape (an
-- implicit transaction: lock_timeout took, no warning), the row, POST-CHECK
-- 1-3 as before, the same probes; the whole file once more: left alone.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 1. PRE-FLIGHT and 2. THE RULE (one statement: the drop and the add land together)
do $$
declare
  old_def constant text :=
    'CHECK ((backdrop_preset = ANY (ARRAY[''cream''::text, ''sand-purple''::text, ''ember''::text, '
    '''deep-violet''::text, ''forest''::text, ''midnight''::text])))';
  new_def constant text :=
    'CHECK ((backdrop_preset = ANY (ARRAY[''cream''::text, ''sand-purple''::text, ''ember''::text, '
    '''deep-violet''::text, ''forest''::text, ''midnight''::text, ''rose''::text, ''cardinal''::text, '
    '''lantern''::text, ''canal''::text, ''onyx''::text])))';
  got text;
  outside bigint;
begin
  if to_regclass('public.orgs') is null then
    raise exception 'club-backdrop-presets: public.orgs is missing';
  end if;

  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.orgs'::regclass and a.attname = 'backdrop_preset' and not a.attisdropped;
  if got is distinct from 'text not null default ''sand-purple''::text' then
    raise exception 'club-backdrop-presets: orgs.backdrop_preset reads "%"', coalesce(got, '(missing)');
  end if;

  if has_any_column_privilege('anon', 'public.orgs', 'update')
     or has_any_column_privilege('authenticated', 'public.orgs', 'update') then
    raise exception 'club-backdrop-presets: a browser role can UPDATE orgs; the route must stay the only writer';
  end if;

  select count(*) into outside from public.orgs
   where backdrop_preset not in ('cream', 'sand-purple', 'ember', 'deep-violet', 'forest',
                                 'midnight', 'rose', 'cardinal', 'lantern', 'canal', 'onyx');
  if outside > 0 then
    raise exception 'club-backdrop-presets: % club(s) hold a background outside the new list', outside;
  end if;

  -- One rule speaks for the column (Oct 22, 2026, K3 review): a second CHECK
  -- naming it would still refuse the five after this file, under a name the
  -- route doesn't turn into a 409, and the post-check alone wouldn't see it.
  select string_agg(c.conname, ', ' order by c.conname) into got
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.orgs'::regclass and c.contype = 'c' and a.attname = 'backdrop_preset'
     and c.conname <> 'orgs_backdrop_preset_check';
  if got is not null then
    raise exception 'club-backdrop-presets: another CHECK names backdrop_preset: %', got;
  end if;

  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.orgs'::regclass and c.conname = 'orgs_backdrop_preset_check';
  if got = new_def then
    raise notice 'club-backdrop-presets: pre-flight ok (applied before; the rule is left alone)';
    return;
  end if;
  if got is distinct from old_def then
    raise exception 'club-backdrop-presets: orgs_backdrop_preset_check reads "%", not the six of 20260508140000',
      coalesce(got, '(missing)');
  end if;
  raise notice 'club-backdrop-presets: pre-flight ok (the six-name rule; widening it)';

  alter table public.orgs drop constraint orgs_backdrop_preset_check;
  alter table public.orgs add constraint orgs_backdrop_preset_check
    check (backdrop_preset in ('cream', 'sand-purple', 'ember', 'deep-violet', 'forest',
                               'midnight', 'rose', 'cardinal', 'lantern', 'canal', 'onyx'));
end $$;

-- 3. THE COMMENT ------------------------------------------------------------------
comment on constraint orgs_backdrop_preset_check on public.orgs is
  'The background names a club may hold: storableBackdropKeys(true) in src/lib/orgs/backdrops.ts, which holds the CSS (the database never does). "cream" is an old light one, kept for clubs still on it and never offered. Five added Oct 22, 2026 (20261026100000): rose, cardinal, lantern, canal, onyx. Change this rule and that list together.';

-- 4. POST-CHECK -------------------------------------------------------------------
do $$
declare
  new_def constant text :=
    'CHECK ((backdrop_preset = ANY (ARRAY[''cream''::text, ''sand-purple''::text, ''ember''::text, '
    '''deep-violet''::text, ''forest''::text, ''midnight''::text, ''rose''::text, ''cardinal''::text, '
    '''lantern''::text, ''canal''::text, ''onyx''::text])))';
  got text;
  bad text := '';
begin
  select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' (not validated)' end
    into got
    from pg_constraint c
   where c.conrelid = 'public.orgs'::regclass and c.conname = 'orgs_backdrop_preset_check';
  if got is distinct from new_def then
    bad := bad || format(' orgs_backdrop_preset_check reads "%s";', coalesce(got, '(missing)'));
  end if;

  select string_agg(c.conname, ', ' order by c.conname) into got
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.orgs'::regclass and c.contype = 'c' and a.attname = 'backdrop_preset'
     and c.conname <> 'orgs_backdrop_preset_check';
  if got is not null then
    bad := bad || format(' another CHECK names backdrop_preset: %s;', got);
  end if;

  select format('%s%s%s', format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.orgs'::regclass and a.attname = 'backdrop_preset' and not a.attisdropped;
  if got is distinct from 'text not null default ''sand-purple''::text' then
    bad := bad || format(' the column reads "%s";', coalesce(got, '(missing)'));
  end if;

  if has_any_column_privilege('anon', 'public.orgs', 'update')
     or has_any_column_privilege('authenticated', 'public.orgs', 'update') then
    bad := bad || ' a browser role can UPDATE orgs;';
  end if;

  if bad <> '' then
    raise exception 'club-backdrop-presets post-check failed:%', bad;
  end if;
  raise notice 'club-backdrop-presets: post-check ok';
end $$;

-- 5. ------------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
