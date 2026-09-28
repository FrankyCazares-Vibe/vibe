-- Intimate-image and child-safety reports (S67 security wave, batch d;
-- security report 2026-09-27 finding #4, "No way to get an intimate photo
-- taken down", plus the repair round's "child exploitation goes first").
--
-- WHY THIS EXISTS. The TAKE IT DOWN Act makes an app like Vibe publish a way
-- to ask for an intimate image shared without consent to be taken down, and
-- remove it within 48 hours of a valid request. Until now the Report sheet had
-- no such choice: the reasons were spam, harassment, sexual, hate, self_harm
-- and other, in src/lib/moderation/reports.ts AND in this CHECK. The code now
-- offers `intimate_image` ("An intimate image shared without consent") and the
-- admin queue lifts those reports to the top; without this file every such
-- report is refused by the insert and nobody ever sees it.
--
-- `child_safety` ("Child sexual abuse or exploitation") comes in the same
-- file. /legal/community, /legal/child-safety and /support promise that
-- reports of child exploitation go first, but there was no reason for them:
-- they arrived as 'sexual', mixed in with everything else. The code now
-- offers the reason and lifts it to the very top of the admin queue.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT: reports_reason_code_check must read exactly as
--      20260506100000 created it (the six codes), and no row may hold a code
--      outside the new list. Anything else aborts the whole file.
--   2. Swaps the CHECK for the same list plus 'intimate_image' and
--      'child_safety'. No row changes; every existing row already passes (it
--      passed the narrower list).
--   3. POST-CHECK inside the transaction: the new CHECK reads as written.
--   4. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch who may insert a report. anon and authenticated hold no
-- write on public.reports since 20260923090000; POST /api/me/reports (service
-- role, signed in, school-verified, not restricted) is the only way in, and it
-- validates the code against the same list with isReportReasonCode. Someone
-- WITHOUT an account asks by email (help@connectvibe.app), as /legal/community
-- and /support now say; a founder files or handles that by hand.
--
-- LIVE STATE (read-only MCP, 2026-09-27, at c72aaa2):
--   * reports_reason_code_check =
--       CHECK ((reason_code = ANY (ARRAY['spam'::text, 'harassment'::text,
--       'sexual'::text, 'hate'::text, 'self_harm'::text, 'other'::text])))
--   * public.reports has 0 rows in production (10 in the local test DB).
--   * Latest recorded schema_migrations version: 20260927100000.
--   Re-read for the repair round (same day): all three unchanged.
--
-- DEPLOY ORDER. Apply BEFORE the code that offers the new reason ships. The
-- old code never sends either new code, so applying first is safe; pushing
-- the code first means a student who picks a new reason gets "Couldn't send
-- that report" until this lands.
--
-- HOW TO APPLY BY HAND: the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260927140000', 'reports_intimate_image_reason');
--
-- POST-CHECK (read-only, after applying):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.reports'::regclass AND conname = 'reports_reason_code_check';
--   -- ... ARRAY['spam', 'harassment', 'sexual', 'intimate_image', 'child_safety',
--   --           'hate', 'self_harm', 'other'] ...
--
-- ROLLBACK (only after the code that offers the reasons is reverted; any row
-- holding one is re-pointed to 'sexual' first, the code both used to arrive as):
--   BEGIN;
--   UPDATE public.reports SET reason_code = 'sexual'
--    WHERE reason_code IN ('intimate_image', 'child_safety');
--   ALTER TABLE public.reports DROP CONSTRAINT reports_reason_code_check;
--   ALTER TABLE public.reports ADD CONSTRAINT reports_reason_code_check
--     CHECK (reason_code IN ('spam', 'harassment', 'sexual', 'hate', 'self_harm', 'other'));
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927140000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- DROP/ADD CONSTRAINT takes an ACCESS EXCLUSIVE lock on reports until COMMIT;
-- the ADD re-checks every row (0 in production). Fail fast rather than queue
-- every report behind it.
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
     'CHECK ((reason_code = ANY (ARRAY[''spam''::text, ''harassment''::text, ''sexual''::text, ''hate''::text, ''self_harm''::text, ''other''::text])))'
  then
    raise exception 'report-reasons: reports_reason_code_check is not the one this file widens: %',
      coalesce(got, '(missing)');
  end if;

  select string_agg(distinct reason_code, ', ') into bad
    from public.reports
   where reason_code not in
         ('spam', 'harassment', 'sexual', 'intimate_image', 'child_safety', 'hate',
          'self_harm', 'other');
  if bad is not null then
    raise exception 'report-reasons: rows hold reason codes outside the new list: %', bad;
  end if;
end $$;

-- 1. the wider CHECK ---------------------------------------------------------
-- Same order as REPORT_REASON_CODES in src/lib/moderation/reports.ts.
alter table public.reports drop constraint reports_reason_code_check;
alter table public.reports
  add constraint reports_reason_code_check
  check (reason_code in
         ('spam', 'harassment', 'sexual', 'intimate_image', 'child_safety', 'hate',
          'self_harm', 'other'));

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file --------
do $$
declare
  got text;
begin
  select pg_get_constraintdef(oid) into got
    from pg_constraint
   where conrelid = 'public.reports'::regclass and conname = 'reports_reason_code_check';
  if got is distinct from
     'CHECK ((reason_code = ANY (ARRAY[''spam''::text, ''harassment''::text, ''sexual''::text, ''intimate_image''::text, ''child_safety''::text, ''hate''::text, ''self_harm''::text, ''other''::text])))'
  then
    raise exception 'report-reasons: the new reports_reason_code_check does not read as written: %',
      coalesce(got, '(missing)');
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
