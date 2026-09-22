-- Stripe v1 / batch A: the two tables Vibe+ payments on Stripe need.
-- billing_customers says which Stripe customer belongs to which Vibe account;
-- billing_events is the webhook's ledger, one row per Stripe event.
--
-- Contract: handoffs/wave-plan-stripe/contract.md §A. Design:
-- handoffs/2026-09-12-design-paywall-monetization.md §4 and §5.
--
-- WHY THIS EXISTS
--   * Every Stripe event is resolved through Stripe's own objects:
--     subscription → customer → the Vibe account. Stripe's guidance is to
--     map on the first-class object and use metadata only as a fallback. The
--     last hop needs a table that says whose customer this is, written by the
--     server when checkout starts, before any money moves. The customer's
--     metadata.vibe_user_id is only a fallback that has to agree with it.
--   * Stripe delivers each webhook at least once and retries for days. A
--     unique provider_event_id makes a second apply of the same event a
--     conflict the database refuses, not a race the code has to win.
--   * public.entitlements (20260912101000) stays the one answer to "does this
--     account have Vibe+", and this file does not alter it. A Stripe row there
--     is source = 'stripe', provider_ref = the subscription id.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
--   1. public.billing_customers: one Stripe customer per account, and one
--      account per Stripe customer (both unique). Deleting the account
--      deletes the row (on delete cascade). DELETE /api/me deletes the
--      Stripe customer first and fails closed (contract §C), so the row is
--      never the last thing that knew about a live subscription.
--   2. public.billing_events: the event id, its type, livemode, the object it
--      is about (sub_, cs_, in_, ch_, dp_), the Vibe account it resolved to,
--      and what the webhook did with it. outcome is null while an event is
--      received but not yet processed; the webhook reprocesses such a row
--      when Stripe retries.
--   3. Row level security on both, with zero policies. Every privilege is
--      revoked from anon and authenticated, on both tables AND on
--      billing_events' identity sequence, and granted to service_role.
--
-- DOES NOT: create a function, policy, trigger or view; touch entitlements,
-- users or any existing row; revoke EXECUTE on anything (standing rule,
-- rulings.md). There is no payload column on purpose: a Stripe event carries
-- names, emails, addresses and card details (brand, last four digits), and
-- none of it needs to sit in our database. The webhook fetches what it needs
-- from Stripe when it needs it. `error` holds a short message only, never a
-- payload, a key or an email.
--
-- WHY THESE SHAPES
--   * Grants, not routes, are the boundary (20260906130000). pg_default_acl
--     for schema public (read-only psql on the local stack, 2026-09-22) gives
--     anon and authenticated arwdDxtm on every new table AND rwU on every new
--     sequence, for both postgres and supabase_admin. Revoking on the tables
--     alone would leave the sequence readable and advanceable by both roles,
--     so the sequence is revoked by name too. The post-check asserts it.
--   * service_role is granted explicitly, tables and sequence, so nothing
--     rests on the default ACL of whichever role runs this file. It has
--     BYPASSRLS (checked below), so zero policies do not stop it.
--   * RLS on with zero policies: if a grant to authenticated ever came back
--     by accident, it would still read nothing and write nothing.
--   * billing_events.user_id has NO foreign key. A refund or a dispute can
--     arrive after the account is gone, and the ledger has to outlive it
--     (design §8 flags retention for counsel). After a deletion the uuid
--     points at nothing, and no name, email or payload sits beside it.
--   * livemode on both tables: a sandbox customer id must never be taken for
--     a live one, and before billing goes live the sandbox rows are easy to
--     find and delete.
--   * No extra indexes. The primary key and the unique constraints already
--     index every lookup the code makes: a customer row by user_id or by
--     stripe_customer_id, an event row by provider_event_id.
--
-- LOCKING. Creating billing_customers' foreign key takes a SHARE ROW
-- EXCLUSIVE lock on public.users until COMMIT, which blocks writes to users
-- for those milliseconds. lock_timeout 5s makes the file fail whole instead
-- of queueing behind a long transaction and stalling every users write behind
-- it; then simply run it again.
--
-- ---------------------------------------------------------------------------
-- PRODUCTION does NOT need this file until billing goes live, and it is
-- harmless before. Billing stays off there (BILLING_ENABLED unset, no Stripe
-- keys on Vercel) until the LLC has its EIN and bank account and the Terms
-- with subscription wording are published (contract, Franky 2026-09-22).
--   * Code first, this file not yet: the webhook answers 503 while Stripe is
--     not configured, and every other read of billing_customers treats a
--     missing table (42P01 / PGRST205) as "no row". DELETE /api/me keeps
--     working.
--   * This file first, code not yet: nothing reads the tables.
-- NUMBERING. 20260922140000 is written, not applied, in production (commit
-- c898865). Per rulings H2 the orchestrator renumbers this file before any
-- production apply, to a slot above every applied version and below every
-- written-but-unapplied one, so `supabase db reset` replays the order
-- production saw. The only real dependency is public.users (the foreign key).
--
-- LOCAL APPLY (acceptance agent only; rulings H5; never `supabase db reset`):
--   export PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"
--   PSQL() { docker exec -i supabase_db_vibe psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
--   PSQL -f - < supabase/migrations/20260922150000_billing_stripe.sql
--   PSQL -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
--            VALUES ('20260922150000', 'billing_stripe');"
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes, and
-- only when billing is about to go live).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. Version gate (rulings H2): the predecessor present, this version
--         absent. Use this file's number AFTER any renumbering.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922140000', '20260922150000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260922140000.
--           -- 20260922150000 present: already applied. STOP.
--           -- 20260922140000 missing: this file does not depend on it.
--           --   Renumber this file first (NUMBERING above), then run this
--           --   gate again with the new number and its new predecessor.
--      b. The state this file was written against (the body re-checks the
--         names and aborts otherwise):
--           SELECT to_regclass('public.users');                 -- users
--           SELECT to_regclass('public.billing_customers'),
--                  to_regclass('public.billing_events'),
--                  to_regclass('public.billing_events_id_seq'); -- null x3
--           SELECT defaclrole::regrole, defaclobjtype, defaclacl
--             FROM pg_default_acl
--            WHERE defaclnamespace = 'public'::regnamespace;
--           -- anon and authenticated on 'r' and 'S': why this file revokes.
--           SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';  -- t
--      c. No long transaction to queue behind:
--           SELECT pid, now() - xact_start, state, left(query, 80)
--             FROM pg_stat_activity
--            WHERE xact_start < now() - interval '30 seconds';   -- 0 rows
--      d. The local-stack acceptance for this wave passed, log in the handoff.
--   1. Apply with the management-API curl recipe (Supabase MCP execute_sql is
--      read-only). From the repo root, SUPABASE_ACCESS_TOKEN from .env.local,
--      the project ref in supabase/.temp/project-ref. curl, not Python:
--      urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260922150000_billing_stripe.sql '{query:$q}')"
--      `[]` means success; a JSON error means nothing was applied.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922150000', 'billing_stripe');
--
-- POST-CHECK (read-only; the body also checks all of this and aborts).
--   SELECT c.relname, c.relrowsecurity,
--          (SELECT count(*) FROM pg_policies p
--            WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
--     FROM pg_class c
--    WHERE c.oid IN ('public.billing_customers'::regclass, 'public.billing_events'::regclass);
--   -- both rows: t | 0
--   SELECT r, t,
--          has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_table,
--          has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES') AS any_column
--     FROM unnest(array['anon', 'authenticated']) r,
--          unnest(array['public.billing_customers', 'public.billing_events']) t;
--   -- four rows, every one f | f
--   SELECT r, has_sequence_privilege(r, 'public.billing_events_id_seq', 'USAGE,SELECT,UPDATE')
--     FROM unnest(array['anon', 'authenticated']) r;          -- f, f
--   SELECT t, has_table_privilege('service_role', t, 'SELECT') AS sel,
--          has_table_privilege('service_role', t, 'INSERT') AS ins,
--          has_table_privilege('service_role', t, 'UPDATE') AS upd,
--          has_table_privilege('service_role', t, 'DELETE') AS del
--     FROM unnest(array['public.billing_customers', 'public.billing_events']) t;
--   -- t | t | t | t on both
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- 0 (standing rule)
--   SMOKE: none on production (rulings M8). Nothing reads these tables until
--   billing is switched on, and switching it on is its own step.
--
-- LOCAL ACCEPTANCE PROBES (acceptance agent only, local stack). No function
-- is called, so none of these can hit the EXECUTE crash.
--   Over REST with the anon key, signed out and then signed in as any seeded
--   student:
--     GET  /rest/v1/billing_customers?select=user_id
--     GET  /rest/v1/billing_events?select=id
--     POST /rest/v1/billing_events {"provider_event_id":"evt_x","type":"x","livemode":false}
--   each → 401 signed out / 403 signed in (42501), or 404 PGRST205 if
--   PostgREST leaves the table out of its schema cache. Never a 2xx.
--   With the service role key: the same GETs → 200 []. The webhook and the
--   checkout route are this wave's writers (acceptance drives them).
--
-- ROLLBACK (one transaction; restores ONLY this file's change). Copy the block
-- and strip the first five characters ("--   ") of each line. Nothing else
-- depends on these tables (no view, policy or function reads them), and the
-- identity sequence drops with its table.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DROP TABLE IF EXISTS public.billing_events;
--   DROP TABLE IF EXISTS public.billing_customers;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922150000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Only with BILLING_ENABLED off. Dropping billing_customers loses the map from
-- accounts to Stripe customers, and every webhook after that answers 500
-- until the table is back (Stripe retries for up to three days). If real
-- customers exist, first copy `SELECT user_id, stripe_customer_id, livemode
-- FROM public.billing_customers` into the (gitignored) handoff. The map can
-- also be rebuilt from Stripe: each customer carries metadata.vibe_user_id.
-- ---------------------------------------------------------------------------

begin;

-- The foreign key below takes a SHARE ROW EXCLUSIVE lock on public.users until
-- COMMIT. This makes the file fail whole instead of queueing behind a long
-- transaction and holding up every write to users behind it.
set local lock_timeout = '5s';

-- 0. Nothing to collide with, and the one table this file needs. A second run
--    stops here.
do $$
begin
  if to_regclass('public.users') is null then
    raise exception 'billing: public.users is missing; billing_customers needs it for its foreign key';
  end if;
  if to_regclass('public.billing_customers') is not null
     or to_regclass('public.billing_events') is not null
     or to_regclass('public.billing_events_id_seq') is not null then
    raise exception 'billing: a billing table or sequence already exists; stop and re-read it';
  end if;
end $$;

-- 1. billing_customers ------------------------------------------------------
-- Written once per account, by the checkout route, before the first Checkout
-- Session exists. Both keys unique: a Stripe customer can never resolve to a
-- second account, and an account never gets a second customer.
create table public.billing_customers (
  user_id            uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  livemode           boolean not null,
  created_at         timestamptz not null default now()
);

comment on table public.billing_customers is
  'Stripe v1: which Stripe customer belongs to which Vibe account. Service role only (RLS on, no policies, anon/authenticated revoked). Every Stripe event resolves subscription -> customer -> this row.';

-- 2. billing_events ---------------------------------------------------------
-- One row per Stripe event, written by the webhook before it acts. No payload
-- (no personal data at rest). user_id has no foreign key, so the row survives
-- account deletion.
create table public.billing_events (
  id                bigint generated always as identity primary key,
  provider          text not null default 'stripe' check (provider = 'stripe'),
  provider_event_id text not null unique,
  type              text not null,
  livemode          boolean not null,
  object_id         text,
  user_id           uuid,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  outcome           text check (outcome in ('applied', 'ignored', 'unmatched', 'skipped_comp', 'recorded', 'error')),
  error             text
);

comment on table public.billing_events is
  'Stripe v1: the webhook ledger. provider_event_id unique = each event applies once. No payload column; error is a short message, never a payload, key or email. user_id has no FK on purpose (outlives the account). Service role only.';
comment on column public.billing_events.object_id is
  'The sub_/cs_/in_/ch_/dp_ id the event is about.';
comment on column public.billing_events.outcome is
  'null = received, not yet processed (the webhook reprocesses it on a retry).';

-- 3. Access -----------------------------------------------------------------
-- RLS on, zero policies: service_role (BYPASSRLS) is the only way in.
alter table public.billing_customers enable row level security;
alter table public.billing_events enable row level security;

-- The default ACL handed anon and authenticated everything on both tables and
-- on the sequence (WHY THESE SHAPES). Take it all back.
revoke all on table public.billing_customers, public.billing_events from anon, authenticated;
revoke all on sequence public.billing_events_id_seq from anon, authenticated;

-- Said out loud, so nothing rests on the default ACL of whoever runs this.
grant all on table public.billing_customers, public.billing_events to service_role;
grant all on sequence public.billing_events_id_seq to service_role;

-- 4. Post-check inside the transaction: any miss aborts the whole file.
do $$
declare
  bc   regclass := to_regclass('public.billing_customers');
  be   regclass := to_regclass('public.billing_events');
  seq  regclass := to_regclass('public.billing_events_id_seq');
  cols text;
  bad  text;
  n    int;
begin
  if bc is null or be is null or seq is null then
    raise exception 'billing: a table or the identity sequence is missing';
  end if;
  if pg_get_serial_sequence('public.billing_events', 'id') is distinct from 'public.billing_events_id_seq' then
    raise exception 'billing: billing_events.id is not backed by public.billing_events_id_seq, so the revoke above missed it';
  end if;

  -- The columns the code is written against (contract §A), in order.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = bc and a.attnum > 0 and not a.attisdropped;
  if cols is distinct from 'user_id uuid not null, stripe_customer_id text not null, livemode boolean not null, created_at timestamp with time zone not null' then
    raise exception 'billing: billing_customers columns are not the contract''s: %', cols;
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = be and a.attnum > 0 and not a.attisdropped;
  if cols is distinct from 'id bigint not null, provider text not null, provider_event_id text not null, type text not null, livemode boolean not null, object_id text, user_id uuid, received_at timestamp with time zone not null, processed_at timestamp with time zone, outcome text, error text' then
    raise exception 'billing: billing_events columns are not the contract''s: %', cols;
  end if;

  -- The keys: the account row cascades with its user, both customer keys and
  -- the event id are unique, and the ledger has no foreign key at all.
  if not exists (select 1 from pg_constraint
                  where conrelid = bc and contype = 'f'
                    and confrelid = 'public.users'::regclass and confdeltype = 'c') then
    raise exception 'billing: billing_customers.user_id must reference public.users on delete cascade';
  end if;
  select count(*) into n
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where cardinality(c.conkey) = 1
     and ((c.conrelid = bc and c.contype = 'p' and a.attname = 'user_id')
       or (c.conrelid = bc and c.contype = 'u' and a.attname = 'stripe_customer_id')
       or (c.conrelid = be and c.contype = 'p' and a.attname = 'id')
       or (c.conrelid = be and c.contype = 'u' and a.attname = 'provider_event_id'));
  if n <> 4 then
    raise exception 'billing: expected the 4 primary/unique keys of contract §A, found %', n;
  end if;
  if exists (select 1 from pg_constraint where conrelid = be and contype = 'f') then
    raise exception 'billing: billing_events must have no foreign key (it outlives the account)';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = be and attname = 'id' and attidentity = 'a') then
    raise exception 'billing: billing_events.id must be GENERATED ALWAYS AS IDENTITY';
  end if;

  -- RLS on, zero policies, and the service role gets past RLS.
  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.oid in (bc, be) and not c.relrowsecurity;
  if bad is not null then
    raise exception 'billing: row level security is off on: %', bad;
  end if;
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename in ('billing_customers', 'billing_events');
  if n <> 0 then
    raise exception 'billing: expected zero policies on the billing tables, found %', n;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'billing: service_role lacks BYPASSRLS, so it could not read tables with zero policies';
  end if;

  -- anon and authenticated hold nothing: no table privilege, no column
  -- privilege, nothing on the sequence. (has_*_privilege with a list answers
  -- true when ANY one is held.)
  select string_agg(format('%s on %s', r, t), '; ') into bad
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.billing_customers', 'public.billing_events']) t
   where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES');
  if bad is not null then
    raise exception 'billing: a client role still holds a table or column privilege: %', bad;
  end if;
  select string_agg(r, ', ') into bad
    from unnest(array['anon', 'authenticated']) r
   where has_sequence_privilege(r, 'public.billing_events_id_seq', 'USAGE')
      or has_sequence_privilege(r, 'public.billing_events_id_seq', 'SELECT')
      or has_sequence_privilege(r, 'public.billing_events_id_seq', 'UPDATE');
  if bad is not null then
    raise exception 'billing: a client role still holds a privilege on billing_events_id_seq: %', bad;
  end if;
  -- The raw ACLs too, which also catch privileges the calls above don't name
  -- (MAINTAIN on Postgres 17) and anything granted to PUBLIC (grantee 0).
  select string_agg(format('%s: %s', c.relname, x.privilege_type), ', ') into bad
    from pg_class c, aclexplode(c.relacl) x
   where c.oid in (bc, be, seq)
     and x.grantee in (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid);
  if bad is not null then
    raise exception 'billing: anon, authenticated or PUBLIC is still in an ACL: %', bad;
  end if;

  -- service_role holds each of the four one by one, and the sequence.
  select string_agg(format('%s %s', p, t), '; ') into bad
    from unnest(array['public.billing_customers', 'public.billing_events']) t,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where not has_table_privilege('service_role', t, p);
  if bad is not null then
    raise exception 'billing: service_role is missing: %', bad;
  end if;
  if not (has_sequence_privilege('service_role', 'public.billing_events_id_seq', 'USAGE')
          and has_sequence_privilege('service_role', 'public.billing_events_id_seq', 'SELECT')) then
    raise exception 'billing: service_role is missing USAGE or SELECT on billing_events_id_seq';
  end if;

  -- Standing rule (rulings.md): no public, non-trigger function denies
  -- EXECUTE to anon or authenticated. This file creates and revokes none; the
  -- check makes sure the database it lands on still holds that.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'billing: % public functions deny EXECUTE (standing rule)', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
