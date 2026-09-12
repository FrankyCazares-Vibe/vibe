-- Vibe+ entitlements — the store that answers "does this account have Vibe+
-- right now", and nothing else.
--
-- Design: handoffs/2026-09-12-design-paywall-monetization.md §4.
-- Decision: handoffs/2026-09-12-decisions.md §2 and §4.
--
-- WHY A TABLE AND NOT COLUMNS ON public.users
-- `users_select_authenticated USING (true)` means every signed-in student can
-- SELECT every users row for whatever columns are granted. An entitlement
-- column on `users` would need its own REVOKE to stay private, and it would
-- put billing state on the profile row the whole campus reads. A separate
-- table keeps the blast radius at one object.
--
-- WHAT IT HOLDS
--   user_id               the account (PK — one entitlement per account)
--   tier                  'free' | 'plus'
--   status                'active' | 'past_due' | 'canceled' | 'expired'
--   source                'stripe' | 'apple' | 'comp'   — where it came from
--   provider_ref          ONE opaque provider reference. No card data, no
--                         customer/subscription/transaction field zoo: no
--                         payment code is being written in this wave, and a
--                         column added before its writer exists is a column
--                         nobody knows the semantics of. The webhook wave
--                         adds what it actually needs (and its own
--                         append-only billing_events ledger — deliberately
--                         NOT in this migration, since nothing writes it yet).
--   started_at            when this entitlement began
--   current_period_end    when it expires (NULL = no scheduled end, e.g. comp)
--   grace_until           past_due keeps access until this instant
--   cancel_at_period_end  canceled but still paid up through the period
--   updated_at            stamped by the writer; no trigger, nothing to drift
--
-- EXPIRY IS A READ-TIME COMPARISON. There is NO cron job and none is needed:
-- `current_period_end > now()` is evaluated on every check, so a
-- cancel-at-period-end subscriber keeps access until the period actually
-- ends and nothing expires late because a job did not run. Do not add a
-- scheduler for this.
--
-- ACCESS — grants, not routes, are the boundary
-- (supabase/migrations/20260906130000_consent_db_boundary.sql:6-10).
--   * WRITES: service role only. ALL privileges are revoked from anon and
--     authenticated, so a student cannot grant themselves Vibe+ with a
--     `POST /rest/v1/entitlements` straight through PostgREST, no matter what
--     any route does or fails to do. service_role bypasses RLS; postgres owns
--     the table.
--   * READS: the account may read its own row, and only the columns that
--     describe the subscription's state. `provider_ref` is NOT in the SELECT
--     grant — the owner has no use for it and it is the one column that
--     points at a payment provider.
--     Note this is narrower than the users' own profile row: the SELECT grant
--     is column-level, so `select=*` through PostgREST is denied for
--     `authenticated`. Callers must name columns (the server helper uses the
--     service role and is unaffected).
--
-- The self-read is a CONVENIENCE FOR RENDERING, NOT AN ACCESS DECISION. A
-- client claim of "I have Vibe+" is never trusted: src/lib/premium/require-plus.ts
-- re-reads this table server-side with the service role on every gate, and the
-- paid data is simply absent from the response for a free account rather than
-- hidden by the client. See public/html/_persistence.js:526-528 — the client's
-- cached user blob is editable in devtools.
--
-- No has_plus() SECURITY DEFINER for RLS policies in v1, on purpose. Consent
-- needed one because consent gates WRITES on tables users write directly.
-- Vibe+ gates READS on tables users already cannot read (`post_views` has RLS
-- on and zero policies; `profile_views` is owner-only; `bookmarks` is
-- owner-only — all verified live 2026-09-12). The route gate plus the
-- service-role read IS the boundary; a second copy in SQL would be a second
-- thing to keep in sync.
--
-- DEPLOY ORDER: safe to apply BEFORE or AFTER the code deploys, in either
-- order, and safe to leave unapplied for a while.
--   * Before the deploy: the previous build never references this table.
--   * After the deploy: require-plus.ts treats "relation does not exist" as
--     "no entitlement store, therefore nobody has Vibe+" — every account
--     reads as free, which is the correct state before payments exist. The
--     lock is on and honest either way; applying this only makes it possible
--     to turn Vibe+ ON for someone.
--
-- NOT APPLIED as of 2026-09-12. Verified live the same day with read-only
-- SQL: `SELECT to_regclass('public.entitlements')` returns NULL — nothing
-- below has run against the shared production database. Until it does,
-- getEntitlement() reads EVERY account as free (the missing-table branch at
-- src/lib/premium/require-plus.ts:157), which is the correct pre-payments
-- state, so leaving this unapplied is safe. What is NOT safe is applying it
-- without step 2: `supabase db push` would then try to replay it, and the
-- migration history drifts from the database.
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260912101000_entitlements.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync. Same transport; jq builds the
--      INSERT with this file as the single statement. This file defines no
--      functions and contains no dollar-quoting, so the $m$ tags cannot
--      collide with anything inside it:
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260912101000_entitlements.sql \
--            '{query: ("INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($$20260912101000$$, $$entitlements$$, ARRAY[$m$" + $q + "$m$]);")}')"
--
-- HOW TO VERIFY (all read-only; the MCP execute_sql is fine for 1-4):
--   1. The table exists:
--        SELECT to_regclass('public.entitlements');
--      Expect `entitlements`. It is NULL today — that is the whole point of
--      this block.
--   2. RLS is on, with exactly one policy:
--        SELECT relrowsecurity FROM pg_class
--         WHERE oid = 'public.entitlements'::regclass;
--        -- expect true
--        SELECT policyname, cmd, qual FROM pg_policies
--         WHERE schemaname = 'public' AND tablename = 'entitlements';
--        -- expect exactly one row:
--        --   entitlements_owner_select | SELECT | (auth.uid() = user_id)
--   3. The column grant is real: a student can read the state columns and
--      CANNOT read the one column that points at a payment provider:
--        SELECT has_column_privilege('authenticated','public.entitlements','provider_ref','SELECT');
--        -- expect false
--        SELECT has_column_privilege('authenticated','public.entitlements','tier','SELECT');
--        -- expect true
--   4. Students cannot write their own Vibe+ through PostgREST:
--        SELECT has_table_privilege('authenticated','public.entitlements','INSERT') AS ins,
--               has_table_privilege('authenticated','public.entitlements','UPDATE') AS upd,
--               has_table_privilege('authenticated','public.entitlements','DELETE') AS del;
--      Expect false, false, false.
--   5. Live: comp yourself with the INSERT at the bottom of this file, then
--      open /plus. It must read "You have Vibe+ on a complimentary account."
--      Set tier back to 'free' afterwards unless you meant to keep it.
--
-- ROLLBACK (safe at any time in this wave: no payment code exists, so every
-- account goes back to reading as free — exactly what they read today):
--   DROP TABLE IF EXISTS public.entitlements;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260912101000';

CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'expired')),
  source text NOT NULL CHECK (source IN ('stripe', 'apple', 'comp')),
  provider_ref text,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  grace_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One provider reference maps to at most one account, so a replayed webhook
-- cannot attach the same subscription to a second user. Partial: comp rows
-- carry no reference.
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_source_provider_ref_idx
  ON public.entitlements (source, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- "Who is currently paid" — the only query a future admin view needs.
CREATE INDEX IF NOT EXISTS entitlements_active_idx
  ON public.entitlements (tier, status, current_period_end);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Writes: service role only. This REVOKE is the boundary; the route gate is
-- defence in depth, not the fence.
REVOKE ALL ON TABLE public.entitlements FROM anon, authenticated;

-- Reads: own row, state columns only. provider_ref is intentionally absent.
GRANT SELECT (
  user_id,
  tier,
  status,
  source,
  started_at,
  current_period_end,
  grace_until,
  cancel_at_period_end,
  updated_at
) ON public.entitlements TO authenticated;

DROP POLICY IF EXISTS "entitlements_owner_select" ON public.entitlements;
CREATE POLICY "entitlements_owner_select"
  ON public.entitlements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Comping an account (design §7.7): how Franky turns Vibe+ on for himself or
-- a tester before Stripe exists. Run by hand with the service role; there is
-- deliberately no route that does this.
--
--   INSERT INTO public.entitlements (user_id, tier, status, source, current_period_end)
--   VALUES ('<uuid>', 'plus', 'active', 'comp', now() + interval '90 days')
--   ON CONFLICT (user_id) DO UPDATE
--     SET tier = 'plus', status = 'active', source = 'comp',
--         current_period_end = EXCLUDED.current_period_end,
--         cancel_at_period_end = false, updated_at = now();
--
-- Turning it back off is the same row: SET tier = 'free', status = 'canceled'.
-- ---------------------------------------------------------------------------
