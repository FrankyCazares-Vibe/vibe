-- Email send log (E1a, handoffs/wave-plan-week1/E1.md; the Sebastian Penix
-- case, handoffs/2026-09-15-session-60-email-verification.md §6d item 1,
-- agreed by Franky 2026-09-17). One row per transactional send attempt, so
-- "did we try, and what did the provider say?" has an answer without the
-- Resend dashboard.
--
-- WHAT IT DOES
--   1. Creates public.email_sends: service-role only, RLS on, NO policies,
--      revoke all from anon + authenticated (the org_follow_firsts posture from
--      20260916120000_org_followers.sql). The only writer is
--      src/lib/email/send-log.ts. Every text column refuses '@', so a
--      plaintext address can never land here: the address is kept only as
--      recipient_hash, an HMAC keyed by SCHOOL_EMAIL_VERIFY_SECRET.
--   2. Adds trigger email_sends_forget_recipient. Account deletion is a hard
--      auth.admin.deleteUser (src/app/api/me/route.ts) that cascades into
--      public.users; ON DELETE SET NULL then clears user_id here, and the
--      trigger clears recipient_hash in the same statement. The row keeps only
--      kind, domain, outcome and time. This keeps Privacy §5 true ("When you
--      delete your account, we remove your data from our live systems
--      immediately", src/app/legal/privacy/page.tsx).
--   3. Deletes the plaintext-address rows 'pw-reset-email:%@%' from
--      public.rate_limits. The reset route used to key its per-address limiter
--      on the address itself; the E1 code keys it on a hash.
--   It touches no other table, policy or grant.
--
-- KNOWN RESIDUAL (accepted, review of 2026-09-22). The reset limiter keys on
-- 'pw-reset-email:' || recipientRateKey(address), which is this same keyed
-- hash (E1 A2), so the lookup hash also finds that limiter row. The trigger
-- clears the hash here but not that public.rate_limits row (key,
-- window_start, count; no address). It goes only when rate_limit_hit's
-- 1%-per-call cleanup removes windows older than a day, so on low traffic it
-- can outlive a deleted account by weeks, and someone holding both the secret
-- and the address could still see when that account asked for a reset. That
-- is far better than the plaintext key it replaces, but Privacy §5 is fully
-- true only for this table. Follow-up outside E1: have account deletion
-- (src/app/api/me/route.ts) delete that key, or purge expired rate_limits
-- windows on a schedule.
--
-- RECIPIENT DOMAIN (ruling M15). recipient_domain is NOT the raw host: a
-- personal domain (me@lastname.dev) names the student, and the row keeps its
-- domain after deletion forgets the hash. The app stores the host only when
-- it is a known school domain (school-email-domains.ts: SYSTEM_DOMAINS plus
-- the retired IU domains; a subdomain stores its school domain) or one of
-- gmail.com, outlook.com, hotmail.com, icloud.com, yahoo.com. Any other host
-- is 'other'; an address with no host is 'unknown'. The rule lives in
-- src/lib/email/send-log-core.ts (recipientDomain), not in a CHECK, so adding
-- a provider needs no migration.
--
-- LIVE STATE, 2026-09-21 (read-only MCP)
--   max(version) = 20260916130000; to_regclass('public.email_sends') = NULL.
--   users = 20 = auth.users, 0 auth rows without a public.users row, which is
--   why user_id references public.users(id) (the house pattern; users.id
--   cascades from auth.users).
--   Default ACLs in public grant r -> {postgres,anon,authenticated,
--   service_role}=arwdDxtm under both the postgres and supabase_admin owners.
--   The key is a uuid, so no sequence is created and no S grant needs revoking.
--   org_follow_firsts, rate_limits and terms_acceptances all show relacl
--   {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}, 0 policies.
--   This table must match that exactly.
--   rate_limits: 4 rows 'pw-reset-email:*', newest window_start 2026-09-14
--   03:00Z (all expired); RLS on; 0 policies.
--
-- WHY IT IS SAFE WITH THE CODE DEPLOYED TODAY. No code at HEAD reads or writes
-- email_sends. The rate_limits rows it deletes are counters in windows that
-- closed a week ago. Code and migration may deploy in either order: until the
-- table exists, each send logs one "[email-send-log] insert failed" line and
-- the send itself is unchanged. Preferred order: migration -> deploy -> the
-- POST-DEPLOY delete below.
--
-- PRE-FLIGHT (read-only; the MCP execute_sql is fine). Gate on "my predecessor
-- present, my own version absent", never on max(version) (ruling H2). The
-- planned production order is T1f1 (20260922100000) -> E1 -> P1 -> T1f2 -> T2.
-- If the real order differs, the orchestrator renumbers this file first.
-- STILL OPEN: P1's planned stamp 20260922101100 sorts BEFORE this file, so a
-- local replay would run P1 first. The two touch no shared object and
-- commute, but so that replay matches production (H2), P1 should take a
-- stamp after 20260922104000 (e.g. 20260922105000) with this file as its
-- predecessor. Either way this file's body does not change.
--     SELECT version FROM supabase_migrations.schema_migrations
--      WHERE version IN ('20260922100000', '20260922104000') ORDER BY 1;
--     -- expect exactly one row: 20260922100000
--     SELECT to_regclass('public.email_sends')::text AS email_sends,          -- NULL
--            (SELECT count(*) FROM public.rate_limits
--              WHERE key LIKE 'pw-reset-email:%@%') AS plain_keys;          -- 4, drifting up only
--
-- APPLY BY HAND. ONLY AFTER FRANKY'S EXPLICIT YES. The same curl as
-- 20260916120000_org_followers.sql step 1: POST
--   jq -n --rawfile q supabase/migrations/20260922104000_email_sends.sql '{query:$q}'
-- to https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query.
-- `[]` means applied; a JSON error means nothing was applied (one
-- transaction). Then send, the same way:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260922104000', 'email_sends');
--
-- POST-APPLY VERIFY (read-only; pg_catalog and has_*_privilege, not
-- information_schema, which the MCP role can't see into)
--     SELECT relrowsecurity, relacl::text,
--            (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policies
--       FROM pg_class c WHERE oid = 'public.email_sends'::regclass;
--     -- expect t | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres} | 0
--     SELECT has_table_privilege('anon','public.email_sends','SELECT') AS anon_sel,      -- f
--            has_table_privilege('authenticated','public.email_sends',
--                                'SELECT, INSERT, UPDATE, DELETE') AS auth_any,         -- f
--            has_table_privilege('service_role','public.email_sends','INSERT') AS svc;  -- t
--     SELECT indexname FROM pg_indexes WHERE tablename = 'email_sends' ORDER BY 1;
--     -- email_sends_created_at_idx, email_sends_pkey,
--     -- email_sends_recipient_hash_idx, email_sends_user_id_idx
--     SELECT count(*) FROM public.email_sends;
--     -- 0; also proves the read-only MCP role can run the lookup queries
--
-- POST-DEPLOY (after the new reset route is live; Franky's yes): old code can
-- write plaintext reset keys between apply and deploy, so run once more
-- through the management API (idempotent):
--     DELETE FROM public.rate_limits WHERE key LIKE 'pw-reset-email:%@%';
-- then SELECT count(*) ... with the same LIKE must be 0.
--
-- LOOKUP. scripts/email-send-lookup.mjs reads an address on stdin and prints
-- its recipient_hash plus ready-to-paste read-only queries. It needs the
-- production SCHOOL_EMAIL_VERIFY_SECRET (the Vercel value): pull it into a
-- scratch file for the one lookup and delete it afterwards; never export it
-- from a shell profile (ruling M15).
--
-- RETENTION (manual, Franky's yes, as needed):
--     DELETE FROM public.email_sends WHERE created_at < now() - interval '180 days';
--
-- ROLLBACK. The code tolerates a missing table (one logged line per send,
-- sends unchanged). The rate_limits deletion is not restorable, and there is
-- nothing worth restoring.
--     BEGIN; SET LOCAL lock_timeout = '5s';
--     DROP TRIGGER IF EXISTS email_sends_forget_recipient ON public.email_sends;
--     DROP FUNCTION IF EXISTS public.email_sends_forget_recipient();
--     DROP TABLE IF EXISTS public.email_sends;
--     DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922104000';
--     COMMIT;
--
-- ADDING A SEND KIND (org invites, digests) means extending
-- email_sends_kind_check here AND EMAIL_SEND_KINDS in send-log-core.ts
-- together; otherwise its insert fails, silently by design.

begin;
set local lock_timeout = '5s';

create table public.email_sends (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null
    constraint email_sends_kind_check check (kind in ('school_verification', 'password_reset')),
  user_id             uuid references public.users(id) on delete set null,
  recipient_domain    text not null
    constraint email_sends_domain_check
      check (char_length(recipient_domain) between 1 and 253 and strpos(recipient_domain, '@') = 0),
  recipient_hash      text
    constraint email_sends_hash_check check (recipient_hash ~ '^[0-9a-f]{64}$'),
  provider_message_id text
    constraint email_sends_message_id_check
      check (char_length(provider_message_id) <= 200 and strpos(provider_message_id, '@') = 0),
  ok                  boolean not null,
  error_code          text
    constraint email_sends_error_code_check
      check (char_length(error_code) <= 100 and strpos(error_code, '@') = 0),
  error_message       text
    constraint email_sends_error_message_check
      check (char_length(error_message) <= 500 and strpos(error_message, '@') = 0),
  http_status         smallint
    constraint email_sends_http_status_check check (http_status between 100 and 599),
  created_at          timestamptz not null default now()
);

comment on table public.email_sends is
  'One row per transactional send attempt (school verification, password reset), written only by src/lib/email/send-log.ts with the service role. Answers "did we try, and what did the provider say" without the Resend dashboard. NEVER holds a plaintext address: recipient_hash is HMAC-SHA256(SCHOOL_EMAIL_VERIFY_SECRET, ''email-send-v1|'' || lowercased address), and every text column refuses ''@''. No grant to anon/authenticated and no policy: read it through the read-only MCP or the management API only. Retention: purge rows older than 180 days by hand.';
comment on column public.email_sends.recipient_domain is
  'The school domain (school-email-domains.ts, subdomains collapsed to it) or one of gmail.com, outlook.com, hotmail.com, icloud.com, yahoo.com; ''other'' for any other host, because a personal domain names the student and this column outlives account deletion; ''unknown'' when the address had no host. Set by recipientDomain in src/lib/email/send-log-core.ts.';
comment on column public.email_sends.recipient_hash is
  'Keyed hash of the canonical recipient address. Compute it with scripts/email-send-lookup.mjs (the address goes in on stdin, never into SQL). NULL when the secret was not configured, or after the account was deleted (trigger email_sends_forget_recipient). Rotating SCHOOL_EMAIL_VERIFY_SECRET orphans every earlier hash.';
comment on column public.email_sends.error_message is
  'Provider or exception text, with addresses redacted to [address] and any remaining @ rewritten, cut to 500 chars. Never shown to students.';
comment on column public.email_sends.provider_message_id is
  'Resend email id when ok. Paste it into Resend -> Emails for delivery, bounce or suppression status, which this table does not track.';

create index email_sends_created_at_idx on public.email_sends (created_at desc);
create index email_sends_recipient_hash_idx on public.email_sends (recipient_hash, created_at desc)
  where recipient_hash is not null;
-- Covers the ON DELETE SET NULL scan on account deletion (the unindexed_foreign_keys advisor).
create index email_sends_user_id_idx on public.email_sends (user_id) where user_id is not null;

-- Account deletion: users.id cascades from auth.users, and ON DELETE SET NULL
-- runs an UPDATE of user_id here. Referential actions fire row triggers, so
-- the hash goes in the same statement and the row keeps nothing personal.
create function public.email_sends_forget_recipient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.recipient_hash := null;
  end if;
  return new;
end;
$$;
revoke all on function public.email_sends_forget_recipient() from public, anon, authenticated;

create trigger email_sends_forget_recipient
  before update of user_id on public.email_sends
  for each row execute function public.email_sends_forget_recipient();

alter table public.email_sends enable row level security;
-- pg_default_acl auto-grants arwdDxtm to anon AND authenticated (LIVE STATE).
-- Take it all back and add NO policy: RLS with zero policies is the second
-- lock behind the missing grant. service_role keeps its default grant.
revoke all on table public.email_sends from anon, authenticated;

-- The reset limiter used to key on the plaintext address (E1 A6).
delete from public.rate_limits where key like 'pw-reset-email:%@%';

do $$
begin
  -- has_table_privilege with a list is true when the role holds ANY of them,
  -- so this fails if either client role keeps even one.
  if has_table_privilege('anon', 'public.email_sends', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('authenticated', 'public.email_sends', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'email_sends: a client role still holds a grant';
  end if;
  if not has_table_privilege('service_role', 'public.email_sends', 'INSERT')
     or not has_table_privilege('service_role', 'public.email_sends', 'SELECT') then
    raise exception 'email_sends: service_role cannot read and insert';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.email_sends'::regclass) then
    raise exception 'email_sends: expected zero policies';
  end if;
  if exists (select 1 from public.rate_limits where key like 'pw-reset-email:%@%') then
    raise exception 'rate_limits: plaintext reset keys remain';
  end if;
end
$$;

commit;
