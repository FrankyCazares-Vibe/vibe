-- ---------------------------------------------------------------------------
-- 20261008100000_reports_under_18_reason.sql
--
-- PLAIN ENGLISH
-- A person can report that an account belongs to someone under 18 from the
-- Report sheet, not only by email. Privacy Policy section 12 gives only an
-- address today (handoffs/legal-2026-10-04-privacy-v3/page-and-code-changes.md
-- row 38).
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: reports_reason_code_check must read exactly as
--      20260927140000 left it (the eight codes), and no row may hold a code
--      outside the new list. Anything else aborts the whole file.
--   2. Swaps the CHECK for the same list plus 'under_18'. No row changes;
--      every existing row already passes.
--   3. POST-CHECK inside the transaction: the new CHECK reads as written.
--   4. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch who may insert a report (POST /api/me/reports, service
-- role, is still the only way in), or what happens to a reported account.
--
-- LIVE STATE: NOT READ for this file. Before applying, read on production
-- (a fingerprint, allowed by the counts-only rule):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.reports'::regclass AND conname = 'reports_reason_code_check';
-- It must be the eight-code list in the pre-flight below (it is on the local
-- database, 2026-10-08).
--
-- DEPLOY ORDER. Apply BEFORE the code that offers the reason ships (local
-- branch `after-db-under18`). The code on main never sends 'under_18', so
-- applying first is safe; code first means "Couldn't send that report".
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261008100000', 'reports_under_18_reason');
--
-- ROLLBACK (only after the code that offers the reason is reverted; a row
-- holding it is re-pointed to 'other' first):
--   BEGIN;
--   UPDATE public.reports SET reason_code = 'other' WHERE reason_code = 'under_18';
--   ALTER TABLE public.reports DROP CONSTRAINT reports_reason_code_check;
--   ALTER TABLE public.reports ADD CONSTRAINT reports_reason_code_check
--     CHECK (reason_code IN ('spam', 'harassment', 'sexual', 'intimate_image',
--                            'child_safety', 'hate', 'self_harm', 'other'));
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261008100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- DROP/ADD CONSTRAINT takes an ACCESS EXCLUSIVE lock on reports until COMMIT.
-- Fail fast rather than queue every report behind it.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  got text;
  bad text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.reports'::regclass and conname = 'reports_reason_code_check';
  if got is distinct from
     'CHECK ((reason_code = ANY (ARRAY[''spam''::text, ''harassment''::text, ''sexual''::text, ''intimate_image''::text, ''child_safety''::text, ''hate''::text, ''self_harm''::text, ''other''::text])))'
  then
    raise exception 'under-18-reason: reports_reason_code_check is not the one this file widens: %',
      coalesce(got, '(missing)');
  end if;

  select string_agg(distinct reason_code, ', ') into bad
    from public.reports
   where reason_code not in
         ('spam', 'harassment', 'sexual', 'intimate_image', 'child_safety', 'under_18',
          'hate', 'self_harm', 'other');
  if bad is not null then
    raise exception 'under-18-reason: rows hold reason codes outside the new list: %', bad;
  end if;
end $$;

-- 1. the wider CHECK ---------------------------------------------------------
-- Same order as REPORT_REASON_CODES in src/lib/moderation/reports.ts.
alter table public.reports drop constraint reports_reason_code_check;
alter table public.reports
  add constraint reports_reason_code_check
  check (reason_code in
         ('spam', 'harassment', 'sexual', 'intimate_image', 'child_safety', 'under_18',
          'hate', 'self_harm', 'other'));

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.reports'::regclass and conname = 'reports_reason_code_check';
  if got is distinct from
     'CHECK ((reason_code = ANY (ARRAY[''spam''::text, ''harassment''::text, ''sexual''::text, ''intimate_image''::text, ''child_safety''::text, ''under_18''::text, ''hate''::text, ''self_harm''::text, ''other''::text])))'
  then
    raise exception 'under-18-reason: the new reports_reason_code_check does not read as written: %',
      coalesce(got, '(missing)');
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
