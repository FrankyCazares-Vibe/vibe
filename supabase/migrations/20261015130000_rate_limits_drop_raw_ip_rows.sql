-- ---------------------------------------------------------------------------
-- 20261015130000_rate_limits_drop_raw_ip_rows.sql
--
-- POST-DEPLOY. APPLY ONLY AFTER THE CODE IS LIVE: the Wave 2 deploy that
-- keys every per-network limiter on the scrambled daily code (B2.1), checked
-- live on the production site. Not before: until then the old code writes
-- these rows again on the next request.
--
-- PLAIN ENGLISH
-- Ten limiters counted per network, and their keys held the network address
-- itself (IPv4 as is, IPv6 as its /64). From the Oct 15 deploy on they key on
-- a scrambled code made from the network, the UTC day and a server secret
-- (limiterNetworkCode, src/lib/tally/network-code.ts): 32 hex characters, a
-- new one each day, different for each limiter. This file deletes the counts
-- the old code left behind, so public.rate_limits holds no IP address at
-- all, as the Privacy Policy changed in that deploy says. Franky's call, Oct
-- 15: no IP address in any limiter count.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT: 20261015120000 is applied (public.rate_limits_purge()).
--   1. Deletes every row whose prefix (the key up to its first colon) is one
--      of the 11 below and whose rest is NOT a 32-hex code: an IPv4 address,
--      an IPv6 /64, a raw IPv6 address, or "unknown" (no address header).
--      A row already on a code is kept.
--   2. Runs the purge once (every count whose window started over a day ago).
--   3. POST-CHECK: stops the file if a row of step 1 is still there, or if a
--      key under ANY prefix still ends in an address shape (an IPv4 address,
--      a /64, or a rest that is a raw IPv6 address). The policy says no count
--      holds an IP address, so one left anywhere is a limiter the switch
--      missed: fix it in code, deploy, and run this file again. The error
--      names the prefixes (labels in the code), never a key.
--
-- THE 11 PREFIXES (a key is '<prefix>:<rest>')
--   pw-reset-net             forgot password (src/lib/auth/password-reset-limits.ts)
--   school-email-ip          school-email code, asked for
--   school-code-ip           school-email code, typed
--   waitlist-net             the waitlist form
--   waitlist-confirm-net     the waitlist's confirm emails
--   waitlist-token-net       the waitlist's confirm, status and leave links
--   personal-email-send-net  personal email, code sent
--   personal-email-code-net  personal email, code typed
--   school-checkin-send-net  yearly school check-in, code sent
--   school-checkin-code-net  yearly school check-in, code typed
--   pw-reset-ip              the reset form's key before Oct 12 (8291a2b);
--                            nothing writes it now
-- src/lib/rate-limit-purge-migration.test.ts checks that the first ten are
-- still limiter prefixes in src/, and that a real code is kept.
--
-- WHAT IT CHANGES FOR LIMITS: nothing. The new code's keys are codes, so it
-- never reads these rows; the switch itself already started every network's
-- count at 0 once, at deploy time.
--
-- A RACE: an old server finishing a request after the deploy can write one
-- more row between the delete and the check. The check then stops the file,
-- nothing is deleted, and running it again a minute later finishes it.
--
-- COUNTS ONLY. The file never selects a key: its notice prints how many rows
-- went, its errors how many are left and under which prefixes.
--
-- APPLIED on the local database on 2026-10-15, twice in a row, and checked
-- there (see the end of this header). Production: the main session, after
-- the deploy.
--
-- LIVE STATE: not read for this file. Before applying, read on production
-- (counts only):
--   SELECT count(*) FILTER (
--            WHERE split_part(key, ':', 1) IN ('pw-reset-net', 'school-email-ip', 'school-code-ip',
--                    'waitlist-net', 'waitlist-confirm-net', 'waitlist-token-net',
--                    'personal-email-send-net', 'personal-email-code-net',
--                    'school-checkin-send-net', 'school-checkin-code-net', 'pw-reset-ip')
--              AND substr(key, length(split_part(key, ':', 1)) + 2) !~ '^[0-9a-f]{32}$') AS address_rows,
--          count(*) AS all_rows
--     FROM public.rate_limits;
--   -- Oct 15 (the plan's reads): 0 address rows of 11 in all.
--
-- HOW TO APPLY BY HAND: as 20261015120000 (the connector's apply_migration
-- minus begin/commit, then rename its row; or the Management API recipe in
-- 20260926100000_users_profile_layout.sql), as postgres. Then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261015130000', 'rate_limits_drop_raw_ip_rows') ON CONFLICT (version) DO NOTHING;
-- A check by hand afterwards: the LIVE STATE query above answers 0 address rows.
--
-- ROLLBACK: nothing to put back. The rows held a network address, a window
-- and a count, and no limit reads them any more. To run the file again,
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261015130000';
--
-- CHECKED LOCALLY (2026-10-15): twice in a row (0 and 0: the pre-deploy file
-- had just purged). Then with made-up rows on documentation addresses
-- (192.0.2.0/24, 2001:db8::/32): an IPv4 key, a /64, "unknown" and an
-- upper-case raw IPv6 under four of the prefixes went; a 32-hex code under
-- school-email-ip, a tally-open-net code and an account-id key stayed; a
-- 2-day-old count was purged. With an IPv4 key and a raw IPv6 key under two
-- made-up prefixes, the file stopped, named the two prefixes and deleted
-- nothing (a pw-reset-net address row seeded with them was still there).
-- The test rows were removed and a last run passed.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rate_limits_purge()') is null then
    raise exception 'rate-limits-raw-ip: public.rate_limits_purge() is missing; apply 20261015120000 first';
  end if;
end $$;

-- 1-3. DELETE, PURGE, CHECK (one list, one block) ------------------------------
do $$
declare
  -- The ten per-network limiters' prefixes, and the reset form's old one.
  prefixes text[] := array[
    'pw-reset-net', 'school-email-ip', 'school-code-ip',
    'waitlist-net', 'waitlist-confirm-net', 'waitlist-token-net',
    'personal-email-send-net', 'personal-email-code-net',
    'school-checkin-send-net', 'school-checkin-code-net',
    'pw-reset-ip'];
  n_deleted integer;
  n_purged  integer;
  n_left    integer;
  shaped    text;
begin
  -- 1. Under the 11 prefixes, every rest that is not a code.
  delete from public.rate_limits
   where split_part(key, ':', 1) = any (prefixes)
     and substr(key, length(split_part(key, ':', 1)) + 2) !~ '^[0-9a-f]{32}$';
  get diagnostics n_deleted = row_count;

  -- 2. The purge, once.
  n_purged := public.rate_limits_purge();
  raise notice 'rate-limits-raw-ip: % counts keyed on an address deleted, then % old counts purged', n_deleted, n_purged;

  -- 3. Nothing of step 1 is left...
  select count(*) into n_left
    from public.rate_limits
   where split_part(key, ':', 1) = any (prefixes)
     and substr(key, length(split_part(key, ':', 1)) + 2) !~ '^[0-9a-f]{32}$';
  if n_left > 0 then
    raise exception 'rate-limits-raw-ip: % counts under the 11 prefixes are still keyed on an address (an old server still writing? run again in a minute)', n_left;
  end if;

  -- ...and no key under any prefix ends in an address shape.
  select string_agg(distinct split_part(key, ':', 1), ', ' order by split_part(key, ':', 1))
    into shaped
    from public.rate_limits
   where key ~ '[0-9]{1,3}(\.[0-9]{1,3}){3}$'
      or key ~* '::/64$'
      or substr(key, strpos(key, ':') + 1) ~* '^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}$';
  if shaped is not null then
    raise exception 'rate-limits-raw-ip: keys under these prefixes still end in an address shape: % (a limiter the switch missed)', shaped;
  end if;
end $$;

commit;
