# Event check-in: build contract (Oct 19, 2026)

Architect pass over the four maps in this folder (`map-*.md`), with the
load-bearing claims re-read in the code and the local catalog (read-only).
Line numbers are at `6bb6c04` (main). Batch 0 is written verbatim by the
orchestrator; batches 1 to 5 then run in parallel and never touch the same
file (section 9).

Checked in the code for this contract: `can_manage_event` / `event_visible` /
`event_org_visible` bodies (`20260928110000:342-417`) and their local md5s;
`is_restricted_now` and `has_recorded_consent` bodies and md5s; `rsvps` and
its policies; every FK on `events`, `rsvps`, `users` (all cascade, `users.id`
cascades from `auth.users`); pgcrypto 1.3 in `extensions` with
`hmac(bytea,bytea,text)` and `gen_random_bytes(int)`, EXECUTE for anon and
authenticated; the code and token expressions and the step-loop (run
read-only); `proconfig` format; the crash rule (`20260922090000:1-51`);
`budgets.ts`, `rateLimit`/`tooManyRequests`; the events list, PATCH
`itemFor`, attendees and RSVP routes; `toEventListItem`; EventCard,
AttendeesModal, AttendeeList, ConfirmDialog line numbers; OrgEventsSection
and its mount; SettingsClient mount; `enforceCampusAccess`;
`getSiteOriginForRequest`; Sentry's scrubbed keys; supabase-js's PKCE
detection (`_isPKCECallback`: `params.code` + a stored verifier, hash or
query); the proxy's restricted rules; Permissions-Policy (wake lock allowed,
geolocation off); every policy sentence quoted in section 6.

## 0. Decisions

### Franky's (Oct 19), restated

1. **Door code + QR for officers.** An officer is whoever
   `public.can_manage_event()` lets in: a club event's current owners and
   admins, an org-less event's creator. "Start check-in" on their event shows
   a big QR and a 4-digit code that change every 30 seconds. The QR holds an
   https link the phone's own camera opens (no in-app scanner). The code is
   typed into the event by people at the door.
2. **Manual backup:** officers tick "Mark as here" on the Going and
   Interested lists.
3. **Anyone at the event can check in**: any signed-in student who may see
   the event, RSVP or not. Officers see who checked in, and who said Going
   but didn't. Everyone else sees only a count, from 5 up.
4. **Only while check-in is open AND inside the window**: 1 h before the
   start to 1 h after the end.
5. **Kept until the club deletes them**: an officer clears an event's
   check-ins, or the event is deleted. Each student removes their own.
   Deleting an account removes that student's check-ins.
6. **Production database waits for Franky's yes.** Build and test against the
   local stack only. The Privacy Policy update ships the same day.

### Mine, with reasons (Franky can overrule any)

- **D1. The code is made in the database (pgcrypto HMAC), not the route.**
  The secret never leaves Postgres, so no new Vercel variable. "Stop" deletes
  one row and every code already shown dies with it. The check and the insert
  are one atomic call.
- **D2. A student's check-in goes through a service-role-only function,**
  `event_checkin_self_as(p_user, ...)`, called after the route's limiter,
  which fails closed. A function the browser could call would let anyone skip
  the limiter over the database's web interface and guess freely. Keeping the
  cap in the limiter, not in a "wrong tries" table, means nothing is stored
  per person per event. The cost is restating four helper rules for `p_user`,
  pinned by md5 in the pre-flight. Officer functions use `auth.uid()`: a
  manager calling them directly can only do what the route does.
- **D3. A check-in stores `(event_id, user_id)` and nothing else.** No time,
  no method, no officer id, no IP, no location. It records that you came, not
  when or how. Leaving out the officer id also avoids the moderation trap
  (`20260923090000:1875-1892`), where a SET NULL key plus a trigger can block
  account deletion.
- **D4. Code timing.** 4 digits. A typed code works for its 30-second step
  and the step before (30 to 60 s). The QR token is 22 characters (128 bits)
  and works for its step and the three before (90 to 120 s), which covers
  camera, browser and a tap.
  - At most 2 of the 10,000 codes work at once.
  - Budget: 20 tries per account per UTC day, failing closed. That caps
    guessing at 0.4% per account per day.
  - An Indiana evening event crosses UTC midnight (8 pm EDT), so it can see
    two day windows: 0.8%.
  - Officers can take any check-in off.
- **D5. The QR link is `<site>/campus/checkin/<eventId>?checkin=<token>`.**
  - Under `/campus` because Android App Links already claim it
    (`AndroidManifest.xml:46-64`), so the Android app needs no new build.
  - The parameter is not `code`. supabase-js treats `?code=` or `#code=` as a
    sign-in code when a code verifier is stored (`GoTrueClient._isPKCECallback`).
  - `checkin` joins Sentry's scrubbed keys, and the page removes it from the
    address bar on load.
  - No cookie and no pass. A signed-out student signs in, comes back to the
    same page, and the code box takes over (the token is dead by then).
- **D6. One tap, never automatic.** The link shows "I'm here". A link preview
  or a forwarded link can't check anyone in by itself.
- **D7. The officer screen is its own page, `/campus/checkin/<id>/door`, not
  an overlay.**
  - It survives the events list dropping the card at the end time
    (`api/events/route.ts:164`).
  - It works in the hour after the end.
  - It opens on a second device.
  - It needs no tab-bar or z-index work.
  - The card's "Start check-in" button starts check-in and goes there.
- **D8. "Mark as here" rules.**
  - Only people with a Going or Interested RSVP.
  - From 1 h before the start to 24 h after the end, so an officer can catch
    up that night or the next morning.
  - Works with check-in stopped.
  - Taking one off, or clearing all, works any time.
  - A suspended officer can't start, mark or stop (the proxy blocks suspended accounts; no codes show for them). Amended Oct 19 after the audit.
- **D9. No campus rule on check-in** (unlike RSVP). Franky said "anyone who
  may see the event", and the code proves they were at the door. At a hidden
  club, nobody can check in (the RSVP route's 404 rule).
- **D10. The from-5 floor sits inside `event_checkin_state`.** Officers get
  the exact number. The count shows as "N checked in" on live cards and "N
  were there" in a new Past events block on the club page (events ended in
  the last 30 days, via `GET /api/events?org_id=…&when=past`).
- **D11. Students remove their own check-in** on the card (during the window)
  and in Settings under "Event check-ins" (any time).
- **D12. What doesn't change.**
  - No new cookie, schedule or notification.
  - Checking in doesn't open the event chat.
  - Blocks don't hide check-ins from officers (the same as the RSVP list
    today, `attendees/route.ts:73-77`).
  - The proxy is unchanged: suspended students can't reach any page anyway,
    and RSVP DELETE isn't allowlisted either.
- **D13. The QR is drawn on the device with `uqr` `0.1.3`, pinned exactly.**
  - It has no dependencies, an MIT license and TypeScript types.
  - Dark modules on a white tile in every theme: the one deliberate exception
    to the theme tokens, because cameras misread inverted codes.
  - Error correction level M.
  - Never an outside QR service, so the CSP doesn't change.
- **D14. Names.** `event_checkin*` / `eventCheckin*` everywhere. "Check-in"
  already means the yearly school-email check and the usage heartbeat. The
  policy says "check in at an event" or "event check-ins".
- **D15. Ship day = effective date.** The policy draft says `<SHIP DAY>`.
  Write the real date (for example `October 20, 2026`) in the push that
  carries it, after the production apply.

**Calls Franky may want to change (my pick first):**
1. "Mark as here" runs until 24 h after the end, or exactly the check-in
   window.
2. Past events with "N were there" go to every signed-in viewer of the club
   page, or to officers only.
3. 4 digits at 20 tries a day (≤ 0.4%), or 6 digits.
4. No email or in-app notice about the policy change (the new date only), or
   a notice.

## 1. The migration (Batch 0, written verbatim)

File: `supabase/migrations/20261019120000_event_checkins.sql` (sorts after
`20261017120000`).

- **Local only during the build.** The orchestrator applies it to the local
  stack right after writing it, with the two commands in its header, and
  records the row. If the in-file post-checks fail, the orchestrator fixes
  this file, re-applies, and notes the change at the end of this contract.
- **Production waits for Franky's explicit yes** (section 9, "Before
  production"). The new events list treats a missing check-in function as
  "no check-in", so the order of the apply and the deploy can't break the
  list. The new check-in routes do need the functions: apply the migration
  first, then push.
- **Tables:**
  - `event_checkins (event_id, user_id)`. Both keys cascade. RLS: select your
    own rows or the event's managers'. Delete your own. No insert or update
    grant.
  - `event_checkin_sessions (event_id, secret)`. RLS on, all grants revoked,
    no policy.
- **Functions:** 10, all SECURITY DEFINER with `search_path ''`.
  - EXECUTE is granted to anon, authenticated and service_role, and each
    function refuses unwanted callers inside.
  - `event_checkin_self_as` is service-only.
  - `event_checkin_state` carries the from-5 floor.
- **Code and token math:** step = `floor(epoch / 30)`, HMAC-SHA256 with the
  session secret.
  - code: `'<event>:<step>:code'`, then the first 4 bytes as an unsigned
    number mod 10000, zero-padded to 4 digits. Accepted for steps {s-1, s}.
  - token: `'<event>:<step>:link'`, then the first 16 bytes as base64url
    (22 characters). Accepted for steps {s-3 … s}.
- **Event window:** `now() between starts_at - 1 h and ends_at + 1 h`.
  "Mark as here" runs to `ends_at + 24 h`.
- **Removal:** you can always remove your own check-in. An officer can take
  one off or clear all at any time.
- **Account deletion:** the FK cascades handle it. `/api/me` doesn't change.

```sql
-- ---------------------------------------------------------------------------
-- 20261019120000_event_checkins.sql
--
-- LOCAL ONLY UNTIL FRANKY SAYS YES. During the build this file is applied to
-- the local stack only. Production waits for Franky's explicit OK; then the
-- main session applies it JUST BEFORE THE PUSH (the old build never names
-- these tables or functions, and the new build's events list treats a
-- missing check-in function as "no check-in", so either order is safe).
--
-- PLAIN ENGLISH
-- Event check-in (Franky, Oct 19 2026; handoffs/2026-10-19-checkin-build/
-- CONTRACT.md). A club officer taps "Start check-in": their screen shows a QR
-- code and a 4-digit code that change every 30 seconds. Anyone at the event
-- who may see it checks in by typing the code or opening the QR's link with
-- their phone's camera; officers can also tick "Mark as here" for people who
-- said Going or Interested. Officers see who checked in; everyone else sees
-- only how many, from 5 up. A check-in stays until the student removes it,
-- an officer takes it off or clears the event's check-ins, or the event, the
-- club or the account is deleted. Nothing about where a person is: no
-- location, no IP address, not even the time someone checked in.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet; the tables and
--      columns it reads are there; pgcrypto sits in schema `extensions`;
--      can_manage_event, event_visible, is_restricted_now and
--      has_recorded_consent read as on Oct 19 (md5 of prosrc), because
--      event_checkin_self_as copies the last three's rules for p_user.
--   1. public.event_checkins (event_id, user_id): the record. Both keys
--      cascade (event or club deleted, account deleted). RLS: you read your
--      own rows, the event's managers read all of them; you delete your own.
--      No insert or update grant: only the functions below write.
--   2. public.event_checkin_sessions (event_id, secret): one row while
--      check-in is open. 32 random bytes; nobody but the functions reads it
--      (RLS on, every grant revoked, no policy). Stop = delete the row, so
--      every code and link already shown dies with it.
--   3. Ten functions, SECURITY DEFINER, search_path '':
--        event_checkin_derive(secret, event, step) -> (code, token)
--        event_checkin_open / _close / _door        officers (auth.uid())
--        event_checkin_mark / _unmark / _clear     officers (auth.uid())
--        event_checkin_self_as(user, event, code, token)  SERVICE ROLE ONLY
--        event_checkin_state(event ids)            anyone signed in
--        event_checkin_mine()                      the caller's own list
--   4. Grants: revoke all from public, EXECUTE to anon, authenticated and
--      service_role (the standing rule, 20260922090000: never revoke EXECUTE;
--      refuse inside).
--   5. POST-CHECK by catalog, then by behaviour in a block that raises
--      P0C91 and so undoes itself (writes nothing: every probe is refused).
--
-- THE CODE. step = floor(unix seconds / 30). For a step, HMAC-SHA256 with the
-- session secret over '<event id>:<step>:code' gives the code (first 4 bytes
-- as an unsigned number, mod 10000, 4 digits with leading zeros), and over
-- '<event id>:<step>:link' the QR token (first 16 bytes, base64url, 22
-- characters). A typed code is accepted for its step and the one before (30
-- to 60 s); the QR token for its step and the three before (90 to 120 s:
-- camera, browser, a tap). At most 2 of the 10,000 codes work at any moment.
-- The guessing bound is the route's limiter (eventCheckin, 20 tries per
-- account per UTC day, fails closed): event_checkin_self_as refuses every
-- browser role, so the limiter can't be gone around over the REST API.
--
-- THE WINDOW. Check-in works from 1 hour before the start to 1 hour after the
-- end, and only while a session row exists. Officers may mark people from
-- 1 hour before the start to 24 hours after the end; taking a check-in off
-- and clearing are allowed at any time.
--
-- THE COUNT. event_checkin_state gives the event's managers the exact number
-- and everyone else the number only from 5 up (null below). The floor is
-- here, not in TypeScript, so the REST API can't read under it.
--
-- DOES NOT: store a time, a method, an officer's id, an IP address or a
-- location; count wrong tries in the database (the limiter does); touch
-- rsvps, events, orgs or any existing function; change /api/me's account
-- deletion (the cascades do it); delete anything on a schedule.
--
-- LIVE STATE (LOCAL stack, Oct 19 2026, read-only): no event_checkin* table;
-- pgcrypto 1.3 in schema extensions; md5(prosrc): can_manage_event
-- f09163bbf84c24ae3c17d7922ce9c2e7, event_visible
-- ca3d34f65cb01af1a826df053d97b384, is_restricted_now
-- b98aa3d1c7e1cbb55b8d4aa95e0def02, has_recorded_consent
-- 23121c3d37d2a99826699353fd13036d. Local schema_migrations stops at
-- 20261008140000 although later files' objects exist: check by catalog.
--
-- PRE-CHECK on PRODUCTION (read-only; counts, catalog and md5 only), after
-- Franky's yes:
--   select to_regclass('public.event_checkins'), to_regclass('public.event_checkin_sessions');   [null | null]
--   select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto';               [extensions]
--   select p.proname, md5(p.prosrc) from pg_proc p
--    where p.oid in ('public.can_manage_event(uuid)'::regprocedure, 'public.event_visible(uuid,uuid,uuid)'::regprocedure,
--                    'public.is_restricted_now()'::regprocedure, 'public.has_recorded_consent()'::regprocedure);
--   [the four md5s above; any other answer: stop and read that body first]
--
-- LOCK. CREATE TABLE with a foreign key takes SHARE ROW EXCLUSIVE on events
-- and users for milliseconds. lock_timeout 5s makes the file fail whole
-- instead of queueing.
--
-- HOW TO APPLY. Locally (one builder on the local database at a time):
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261019120000_event_checkins.sql
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('20261019120000', 'event_checkins') on conflict (version) do nothing;"
-- Never `supabase db push` (the CLI is linked to production), `db reset` or
-- `migration up`. On production only the main session applies it, after
-- Franky's yes, with the Supabase connector's apply_migration (the body
-- without begin; and commit;), then renames the row the connector records:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261019120000', 'event_checkins') ON CONFLICT (version) DO NOTHING;
--   (and delete the connector's own auto-timestamped row for this body)
--
-- ROLLBACK (one transaction; deletes every check-in; run it only after the
-- build that calls these functions is rolled back, or its routes answer 500):
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   drop function if exists public.event_checkin_mine();
--   drop function if exists public.event_checkin_state(uuid[]);
--   drop function if exists public.event_checkin_self_as(uuid, uuid, text, text);
--   drop function if exists public.event_checkin_clear(uuid);
--   drop function if exists public.event_checkin_unmark(uuid, uuid);
--   drop function if exists public.event_checkin_mark(uuid, uuid);
--   drop function if exists public.event_checkin_door(uuid);
--   drop function if exists public.event_checkin_close(uuid);
--   drop function if exists public.event_checkin_open(uuid);
--   drop function if exists public.event_checkin_derive(bytea, uuid, bigint);
--   drop table if exists public.event_checkin_sessions;
--   drop table if exists public.event_checkins;
--   delete from supabase_migrations.schema_migrations where version = '20261019120000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED: (the builder fills this in after the local apply, a second
-- apply refused by the pre-flight, the ROLLBACK, and a clean re-apply).
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  got text;
begin
  if to_regclass('public.event_checkins') is not null
     or to_regclass('public.event_checkin_sessions') is not null then
    raise exception 'event-checkins: already applied (a table exists); read the catalog first';
  end if;
  if to_regclass('public.events') is null or to_regclass('public.rsvps') is null
     or to_regclass('public.orgs') is null or to_regclass('public.users') is null
     or to_regclass('public.account_restrictions') is null then
    raise exception 'event-checkins: events, rsvps, orgs, users or account_restrictions is missing';
  end if;
  if not exists (select 1 from pg_extension x
                  where x.extname = 'pgcrypto' and x.extnamespace = 'extensions'::regnamespace) then
    raise exception 'event-checkins: pgcrypto is not installed in schema extensions';
  end if;
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'event-checkins: extensions.hmac(bytea,bytea,text) or extensions.gen_random_bytes(integer) is missing';
  end if;
  -- The helpers this file calls (can_manage_event, event_visible,
  -- is_restricted_now) or copies for p_user (event_visible,
  -- is_restricted_now, has_recorded_consent) must read as on Oct 19.
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.can_manage_event(uuid)');
  if got is distinct from 'f09163bbf84c24ae3c17d7922ce9c2e7' then
    raise exception 'event-checkins: can_manage_event drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.event_visible(uuid,uuid,uuid)');
  if got is distinct from 'ca3d34f65cb01af1a826df053d97b384' then
    raise exception 'event-checkins: event_visible drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.is_restricted_now()');
  if got is distinct from 'b98aa3d1c7e1cbb55b8d4aa95e0def02' then
    raise exception 'event-checkins: is_restricted_now drifted (md5 %); read it first', got;
  end if;
  select md5(p.prosrc) into got from pg_proc p where p.oid = to_regprocedure('public.has_recorded_consent()');
  if got is distinct from '23121c3d37d2a99826699353fd13036d' then
    raise exception 'event-checkins: has_recorded_consent drifted (md5 %); read it first', got;
  end if;
  if (select count(*) from pg_attribute a where a.attrelid = 'public.events'::regclass and not a.attisdropped
        and a.attname in ('id', 'org_id', 'creator_id', 'title', 'starts_at', 'ends_at')) <> 6
     or (select count(*) from pg_attribute a where a.attrelid = 'public.orgs'::regclass and not a.attisdropped
        and a.attname in ('id', 'name', 'handle', 'hidden_at')) <> 4
     or (select count(*) from pg_attribute a where a.attrelid = 'public.rsvps'::regclass and not a.attisdropped
        and a.attname in ('event_id', 'user_id', 'status')) <> 3
     or (select count(*) from pg_attribute a where a.attrelid = 'public.users'::regclass and not a.attisdropped
        and a.attname in ('id', 'terms_accepted_at', 'age_attested_at')) <> 3
     or (select count(*) from pg_attribute a where a.attrelid = 'public.account_restrictions'::regclass and not a.attisdropped
        and a.attname in ('user_id', 'lifted_at', 'starts_at', 'ends_at')) <> 4 then
    raise exception 'event-checkins: a column this file reads is missing (events, orgs, rsvps, users or account_restrictions)';
  end if;
  raise notice 'event-checkins: pre-flight ok';
end $$;

-- 1. The record: who checked in at which event. Nothing else. -------------------
create table public.event_checkins (
  event_id uuid not null,
  user_id  uuid not null,
  constraint event_checkins_pkey primary key (event_id, user_id),
  -- Event deleted (or its club, which deletes its events): gone.
  constraint event_checkins_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  -- Account deleted: gone. No trigger on this table, so the cascade can't
  -- be refused (the moderation_actions trap, 20260923090000:1875-1892).
  constraint event_checkins_user_id_fkey foreign key (user_id)
    references public.users (id) on delete cascade
);

-- The account-delete cascade and "my check-ins" read by user.
create index event_checkins_user_id_idx on public.event_checkins (user_id);

alter table public.event_checkins enable row level security;
revoke all on table public.event_checkins from anon, authenticated, service_role;
-- Read (own rows, or the event's managers') and delete (own rows) only.
-- Inserts come from event_checkin_self_as and event_checkin_mark; officer
-- removals from event_checkin_unmark and event_checkin_clear.
grant select, delete on table public.event_checkins to authenticated;

create policy event_checkins_select_own_or_manager on public.event_checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_event(event_id));

-- Removing your own check-in is never gated: not on Terms, a restriction,
-- the window or a hidden club (the RSVP DELETE rule, rsvp/route.ts:186-196).
create policy event_checkins_delete_own on public.event_checkins
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.event_checkins is
  'Event check-in (20261019120000): one row per person who checked in at an event, by the door code, the QR link or an officer''s Mark as here. No time, no method, no officer, no location. Kept until the person removes it, an officer takes it off or clears the event, or the event, the club or the account is deleted.';

-- 2. The open check-in's secret. Nobody but the functions reads it. --------------
create table public.event_checkin_sessions (
  event_id uuid not null,
  secret   bytea not null,
  constraint event_checkin_sessions_pkey primary key (event_id),
  constraint event_checkin_sessions_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_checkin_sessions_secret_len check (octet_length(secret) = 32)
);

alter table public.event_checkin_sessions enable row level security;
revoke all on table public.event_checkin_sessions from anon, authenticated, service_role;
-- NO grant and NO policy (the usage_day_tally pattern, 20261014150000:336-339).

comment on table public.event_checkin_sessions is
  'Event check-in (20261019120000): a row means an officer started check-in for the event. secret = 32 random bytes the codes and QR tokens are made from; read only by the event_checkin_* functions as their owner. Stop deletes the row, so every code already shown stops working. Holds nothing about a person.';

-- 3a. The code and the QR token for one 30-second step. --------------------------
-- Pure arithmetic on what it is given: without a session's secret it makes
-- nothing anyone can use, so every API role may call it. SECURITY DEFINER
-- so a browser role's call never depends on its own EXECUTE on pgcrypto.
create function public.event_checkin_derive(p_secret bytea, p_event_id uuid, p_step bigint)
returns table (code text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':code', 'UTF8'), p_secret, 'sha256') as hc,
           extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':link', 'UTF8'), p_secret, 'sha256') as hl
  )
  select lpad(((get_byte(h.hc, 0)::bigint * 16777216
               + get_byte(h.hc, 1)::bigint * 65536
               + get_byte(h.hc, 2)::bigint * 256
               + get_byte(h.hc, 3)::bigint) % 10000)::text, 4, '0'),
         translate(rtrim(encode(substring(h.hl from 1 for 16), 'base64'), '='), '+/', '-_')
    from h;
$$;

comment on function public.event_checkin_derive(bytea, uuid, bigint) is
  'Event check-in (20261019120000): the 4-digit code and the 22-character QR token for one 30-second step (step = floor(unix seconds / 30)), HMAC-SHA256 with the session secret. Harmless without a secret, which only the event_checkin_* functions read.';

-- 3b. Start check-in (an officer). ------------------------------------------------
create function public.event_checkin_open(p_event_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  if public.is_restricted_now() then
    return 'restricted';
  end if;
  if v_hidden is not null then
    return 'org_hidden';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '1 hour' then
    return 'outside_window';
  end if;
  -- Tidy: a session whose event's window has passed holds a dead secret.
  delete from public.event_checkin_sessions s
   using public.events e
   where e.id = s.event_id
     and e.ends_at < now() - interval '1 hour';
  -- Already open: keep the codes on screen (a second officer's device shows
  -- the same ones). Not open: a new secret, so no old photo of a code works.
  insert into public.event_checkin_sessions (event_id, secret)
  values (p_event_id, extensions.gen_random_bytes(32))
  on conflict (event_id) do nothing;
  if found then
    return 'open';
  end if;
  return 'already_open';
end
$fn$;

comment on function public.event_checkin_open(uuid) is
  'Event check-in (20261019120000): start check-in. Caller = auth.uid(); 42501 without one. Answers open | already_open | not_found | not_manager | restricted | org_hidden | outside_window (1 h before the start to 1 h after the end).';

-- 3c. Stop check-in (an officer). Taking away only: no restriction check. ---------
create function public.event_checkin_close(p_event_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  delete from public.event_checkin_sessions s where s.event_id = p_event_id;
  return 'closed';
end
$fn$;

comment on function public.event_checkin_close(uuid) is
  'Event check-in (20261019120000): stop check-in (deletes the session; check-ins stay). Caller = auth.uid(); 42501 without one. Answers closed | not_found | not_manager.';

-- 3d. The door screen's feed (an officer): this step's and the next step's ------
-- code and token, so one read every 10 s keeps the screen right.
create function public.event_checkin_door(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_now    timestamptz := now();
  v_step   bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
  v_secret bytea;
  v_open   boolean;
  v_count  integer;
  c1 text; t1 text; c2 text; t2 text;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_manage_event(p_event_id) then
    return jsonb_build_object('status', 'not_manager');
  end if;
  if public.is_restricted_now() then
    return jsonb_build_object('status', 'restricted');
  end if;
  if v_hidden is not null then
    return jsonb_build_object('status', 'org_hidden');
  end if;
  select s.secret into v_secret from public.event_checkin_sessions s where s.event_id = p_event_id;
  v_open := v_secret is not null
            and v_now >= v_starts - interval '1 hour'
            and v_now <= v_ends + interval '1 hour';
  if v_open then
    select d.code, d.token into c1, t1 from public.event_checkin_derive(v_secret, p_event_id, v_step) d;
    select d.code, d.token into c2, t2 from public.event_checkin_derive(v_secret, p_event_id, v_step + 1) d;
  end if;
  select count(*)::integer into v_count from public.event_checkins c where c.event_id = p_event_id;
  return jsonb_build_object(
    'status', 'ok',
    'is_open', v_open,
    'opens_at', v_starts - interval '1 hour',
    'closes_at', v_ends + interval '1 hour',
    'server_now', v_now,
    'step_starts_at', case when v_open then to_timestamp(v_step * 30) end,
    'step_ends_at', case when v_open then to_timestamp((v_step + 1) * 30) end,
    'next_ends_at', case when v_open then to_timestamp((v_step + 2) * 30) end,
    'code', c1,
    'token', t1,
    'next_code', c2,
    'next_token', t2,
    'here_count', v_count);
end
$fn$;

comment on function public.event_checkin_door(uuid) is
  'Event check-in (20261019120000): the officer screen''s feed as jsonb {status, is_open, opens_at, closes_at, server_now, step_starts_at, step_ends_at, next_ends_at, code, token, next_code, next_token, here_count}. Codes only while open and inside the window. status: ok | not_found | not_manager | restricted | org_hidden. Caller = auth.uid(); 42501 without one.';

-- 3e. "Mark as here" (an officer), for people who said Going or Interested. ------
create function public.event_checkin_mark(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_starts timestamptz;
  v_ends   timestamptz;
  v_hidden timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select e.starts_at, e.ends_at, o.hidden_at
    into v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  if public.is_restricted_now() then
    return 'restricted';
  end if;
  if v_hidden is not null then
    return 'org_hidden';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '24 hours' then
    return 'outside_window';
  end if;
  -- An officer can't put a stranger on the record: only someone who said
  -- Going or Interested. (Walk-ins check themselves in with the code.)
  if not exists (select 1 from public.rsvps r
                  where r.event_id = p_event_id and r.user_id = p_user_id
                    and r.status in ('going', 'maybe')) then
    return 'not_on_list';
  end if;
  insert into public.event_checkins (event_id, user_id)
  values (p_event_id, p_user_id)
  on conflict (event_id, user_id) do nothing;
  if found then
    return 'marked';
  end if;
  return 'already';
end
$fn$;

comment on function public.event_checkin_mark(uuid, uuid) is
  'Event check-in (20261019120000): an officer marks someone with a going/maybe RSVP as here, from 1 h before the start to 24 h after the end; works with check-in stopped. Answers marked | already | not_found | not_manager | restricted | org_hidden | outside_window | not_on_list. Caller = auth.uid(); 42501 without one.';

-- 3f. Take one person's check-in off (an officer). Any time. ---------------------
create function public.event_checkin_unmark(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return 'not_found';
  end if;
  if not public.can_manage_event(p_event_id) then
    return 'not_manager';
  end if;
  delete from public.event_checkins c
   where c.event_id = p_event_id and c.user_id = p_user_id;
  return 'removed';
end
$fn$;

comment on function public.event_checkin_unmark(uuid, uuid) is
  'Event check-in (20261019120000): an officer takes one check-in off (idempotent). Answers removed | not_found | not_manager. Caller = auth.uid(); 42501 without one.';

-- 3g. Clear every check-in of an event (an officer). Any time. -------------------
create function public.event_checkin_clear(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.can_manage_event(p_event_id) then
    return jsonb_build_object('status', 'not_manager');
  end if;
  delete from public.event_checkins c where c.event_id = p_event_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('status', 'cleared', 'cleared', v_n);
end
$fn$;

comment on function public.event_checkin_clear(uuid) is
  'Event check-in (20261019120000): an officer deletes all of an event''s check-ins. jsonb {status: cleared | not_found | not_manager, cleared}. Caller = auth.uid(); 42501 without one.';

-- 3h. A student checks in: SERVICE ROLE ONLY. ------------------------------------
-- The route calls it after its limiter (eventCheckin, fails closed), which is
-- the bound on guessing; a browser role is refused so the REST API can't go
-- around that limiter. Under the service role auth.uid() is null, so this
-- restates for p_user the rules of event_visible + event_org_visible,
-- is_restricted_now and has_recorded_consent (pinned by the pre-flight's md5s).
-- Every outcome is a word, never an error: nothing to tell a near miss from a
-- far one.
create function public.event_checkin_self_as(p_user uuid, p_event_id uuid, p_code text, p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_step    bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_org     uuid;
  v_creator uuid;
  v_starts  timestamptz;
  v_ends    timestamptz;
  v_hidden  timestamptz;
  v_secret  bytea;
  v_hit     boolean := false;
  i         integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (p_code is null) = (p_token is null) then
    raise exception 'exactly one of p_code and p_token' using errcode = '22023';
  end if;
  if p_user is null then
    return 'not_found';
  end if;
  select e.org_id, e.creator_id, e.starts_at, e.ends_at, o.hidden_at
    into v_org, v_creator, v_starts, v_ends, v_hidden
    from public.events e
    left join public.orgs o on o.id = e.org_id
   where e.id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  -- Who may see it: a club event whose club isn't hidden (no check-in at a
  -- hidden club, for anyone: the RSVP route's 404); an org-less event, its
  -- creator or someone holding an RSVP (event_visible's other arms).
  -- No campus rule: being at the door is the point (Franky: "anyone at the
  -- event"); RSVP stays home-campus only. Don't add one.
  if v_org is not null and v_hidden is not null then
    return 'not_found';
  end if;
  if v_org is null and v_creator is distinct from p_user
     and not exists (select 1 from public.rsvps r where r.event_id = p_event_id and r.user_id = p_user) then
    return 'not_found';
  end if;
  -- is_restricted_now(), for p_user.
  if exists (select 1 from public.account_restrictions r
              where r.user_id = p_user
                and r.lifted_at is null
                and r.starts_at <= now()
                and (r.ends_at is null or r.ends_at > now())) then
    return 'restricted';
  end if;
  -- has_recorded_consent(), for p_user.
  if not exists (select 1 from public.users u
                  where u.id = p_user
                    and u.terms_accepted_at is not null
                    and u.age_attested_at is not null) then
    return 'terms_required';
  end if;
  if now() < v_starts - interval '1 hour' or now() > v_ends + interval '1 hour' then
    return 'outside_window';
  end if;
  select s.secret into v_secret from public.event_checkin_sessions s where s.event_id = p_event_id;
  if v_secret is null then
    return 'not_open';
  end if;
  if exists (select 1 from public.event_checkins c where c.event_id = p_event_id and c.user_id = p_user) then
    return 'already';
  end if;
  if p_code is not null then
    if p_code ~ '^[0-9]{4}$' then
      for i in 0..1 loop
        if exists (select 1 from public.event_checkin_derive(v_secret, p_event_id, v_step - i) d
                    where d.code = p_code) then
          v_hit := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_hit then
      return 'wrong_code';
    end if;
  else
    if p_token ~ '^[A-Za-z0-9_-]{22}$' then
      for i in 0..3 loop
        if exists (select 1 from public.event_checkin_derive(v_secret, p_event_id, v_step - i) d
                    where d.token = p_token) then
          v_hit := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_hit then
      return 'link_expired';
    end if;
  end if;
  insert into public.event_checkins (event_id, user_id)
  values (p_event_id, p_user)
  on conflict (event_id, user_id) do nothing;
  return 'checked_in';
end
$fn$;

comment on function public.event_checkin_self_as(uuid, uuid, text, text) is
  'Event check-in (20261019120000): SERVICE ROLE ONLY (anon and authenticated get 42501; the route''s eventCheckin limiter bounds guessing). Exactly one of p_code (4 digits, this step or the one before) or p_token (22 chars, this step or the three before), else 22023. Answers checked_in | already | wrong_code | link_expired | not_open | outside_window | not_found | restricted | terms_required.';

-- 3i. Per event: open?, am I in?, how many (exact for its managers, else from --
-- 5 up). For events the caller can see (event_visible), like event_rsvp_counts.
create function public.event_checkin_state(p_event_ids uuid[])
returns table (event_id uuid, is_open boolean, viewer_checked_in boolean, checked_in_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if coalesce(cardinality(p_event_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  -- Anon and the service role: nothing (event_rsvp_counts answers the same).
  if (select auth.uid()) is null then
    return;
  end if;
  return query
    select e.id,
           (s.event_id is not null
              and o.hidden_at is null
              and now() >= e.starts_at - interval '1 hour'
              and now() <= e.ends_at + interval '1 hour'),
           exists (select 1 from public.event_checkins mine
                    where mine.event_id = e.id and mine.user_id = (select auth.uid())),
           (select case when n.total >= 5 or public.can_manage_event(e.id) then n.total end
              from (select count(*)::integer as total
                      from public.event_checkins c
                     where c.event_id = e.id) n)
      from public.events e
      left join public.orgs o on o.id = e.org_id
      left join public.event_checkin_sessions s on s.event_id = e.id
     where e.id = any(p_event_ids)
       and public.event_visible(e.org_id, e.creator_id, e.id);
end
$fn$;

comment on function public.event_checkin_state(uuid[]) is
  'Event check-in (20261019120000): per visible event (event_visible), is_open (started and inside the window, club not hidden), viewer_checked_in, and checked_in_count: exact for the event''s managers (can_manage_event), else the number from 5 up and null below. Numbers only. Max 1000 ids (22023). Nothing for anon or the service role.';

-- 3j. My check-ins, for Settings: newest event first, at most 200. --------------
create function public.event_checkin_mine()
returns table (event_id uuid, title text, starts_at timestamptz, ends_at timestamptz, org_name text, org_handle text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.starts_at, e.ends_at, o.name, o.handle
    from public.event_checkins c
    join public.events e on e.id = c.event_id
    left join public.orgs o on o.id = e.org_id
   where c.user_id = (select auth.uid())
   order by e.starts_at desc, e.id
   limit 200;
$$;

comment on function public.event_checkin_mine() is
  'Event check-in (20261019120000): the caller''s own check-ins (auth.uid()), newest event first, max 200, with the event''s title and times and its club''s name and handle. Read past RLS on purpose: a student can always see and remove their own, even at a club hidden since. Nothing for anon or the service role.';

-- 4. Grants (the standing rule: grant to every API role, refuse inside) ----------
revoke all on function public.event_checkin_derive(bytea, uuid, bigint)         from public;
revoke all on function public.event_checkin_open(uuid)                          from public;
revoke all on function public.event_checkin_close(uuid)                         from public;
revoke all on function public.event_checkin_door(uuid)                          from public;
revoke all on function public.event_checkin_mark(uuid, uuid)                    from public;
revoke all on function public.event_checkin_unmark(uuid, uuid)                  from public;
revoke all on function public.event_checkin_clear(uuid)                         from public;
revoke all on function public.event_checkin_self_as(uuid, uuid, text, text)     from public;
revoke all on function public.event_checkin_state(uuid[])                       from public;
revoke all on function public.event_checkin_mine()                              from public;
grant execute on function public.event_checkin_derive(bytea, uuid, bigint)      to anon, authenticated, service_role;
grant execute on function public.event_checkin_open(uuid)                       to anon, authenticated, service_role;
grant execute on function public.event_checkin_close(uuid)                      to anon, authenticated, service_role;
grant execute on function public.event_checkin_door(uuid)                       to anon, authenticated, service_role;
grant execute on function public.event_checkin_mark(uuid, uuid)                 to anon, authenticated, service_role;
grant execute on function public.event_checkin_unmark(uuid, uuid)               to anon, authenticated, service_role;
grant execute on function public.event_checkin_clear(uuid)                      to anon, authenticated, service_role;
grant execute on function public.event_checkin_self_as(uuid, uuid, text, text)  to anon, authenticated, service_role;
grant execute on function public.event_checkin_state(uuid[])                    to anon, authenticated, service_role;
grant execute on function public.event_checkin_mine()                           to anon, authenticated, service_role;

-- 5. POST-CHECK by catalog ---------------------------------------------------------
do $$
declare
  fns constant text[] := array[
    'public.event_checkin_derive(bytea,uuid,bigint)',
    'public.event_checkin_open(uuid)',
    'public.event_checkin_close(uuid)',
    'public.event_checkin_door(uuid)',
    'public.event_checkin_mark(uuid,uuid)',
    'public.event_checkin_unmark(uuid,uuid)',
    'public.event_checkin_clear(uuid)',
    'public.event_checkin_self_as(uuid,uuid,text,text)',
    'public.event_checkin_state(uuid[])',
    'public.event_checkin_mine()'];
  f text;
  r text;
  p record;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.event_checkins'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.event_checkin_sessions'::regclass) then
    raise exception 'event-checkins post-check: RLS is off on a new table';
  end if;
  -- event_checkins holds two columns and nothing else (no time, no method).
  if (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
       where a.attrelid = 'public.event_checkins'::regclass and a.attnum > 0 and not a.attisdropped)
     is distinct from array['event_id', 'user_id'] then
    raise exception 'event-checkins post-check: event_checkins must hold exactly event_id and user_id';
  end if;
  if (select count(*) from pg_constraint k
       where k.contype = 'f' and k.confdeltype = 'c'
         and k.conname in ('event_checkins_event_id_fkey', 'event_checkins_user_id_fkey', 'event_checkin_sessions_event_id_fkey')) <> 3 then
    raise exception 'event-checkins post-check: the three foreign keys must cascade on delete';
  end if;
  -- Table grants: authenticated reads and deletes event_checkins, nothing else.
  if not has_table_privilege('authenticated', 'public.event_checkins', 'select')
     or not has_table_privilege('authenticated', 'public.event_checkins', 'delete')
     or has_table_privilege('authenticated', 'public.event_checkins', 'insert')
     or has_table_privilege('authenticated', 'public.event_checkins', 'update') then
    raise exception 'event-checkins post-check: authenticated must hold exactly SELECT and DELETE on event_checkins';
  end if;
  foreach r in array array['anon', 'service_role'] loop
    if has_table_privilege(r, 'public.event_checkins', 'select, insert, update, delete') then
      raise exception 'event-checkins post-check: % holds a privilege on event_checkins', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(r, 'public.event_checkin_sessions', 'select, insert, update, delete') then
      raise exception 'event-checkins post-check: % holds a privilege on event_checkin_sessions', r;
    end if;
  end loop;
  if (select array_agg(pl.polname::text order by pl.polname) from pg_policy pl
       where pl.polrelid = 'public.event_checkins'::regclass)
     is distinct from array['event_checkins_delete_own', 'event_checkins_select_own_or_manager'] then
    raise exception 'event-checkins post-check: event_checkins must carry exactly its two policies';
  end if;
  if exists (select 1 from pg_policy pl where pl.polrelid = 'public.event_checkin_sessions'::regclass) then
    raise exception 'event-checkins post-check: event_checkin_sessions must carry no policy';
  end if;
  foreach f in array fns loop
    select pr.prosecdef, pr.proconfig into p from pg_proc pr where pr.oid = to_regprocedure(f);
    if not found then
      raise exception 'event-checkins post-check: % is missing', f;
    end if;
    if not p.prosecdef or p.proconfig is distinct from array['search_path=""'] then
      raise exception 'event-checkins post-check: % must be SECURITY DEFINER with search_path ''''', f;
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(r, f, 'execute') then
        raise exception 'event-checkins post-check: % lacks EXECUTE on % (a revoke is a crash button)', r, f;
      end if;
    end loop;
  end loop;
  raise notice 'event-checkins: catalog post-check ok';
end $$;

-- 5b. POST-CHECK BY BEHAVIOUR. Every probe is refused or reads nothing, and the
-- block ends by raising P0C91, which undoes its role switches.
do $$
declare
  stranger constant uuid := gen_random_uuid();
  nowhere  constant uuid := gen_random_uuid();
  got text;
  n integer;
begin
  begin
    -- The code math, on a fixed secret (computed on the local stack, Oct 19).
    select d.code || '/' || d.token into got
      from public.event_checkin_derive(decode(repeat('ab', 32), 'hex'), '00000000-0000-0000-0000-000000000001'::uuid, 0) d;
    if got is distinct from '7710/UVxxReBJ3ewsgZRtrv3ISQ' then
      raise exception 'event-checkins behaviour: derive step 0 gave %', got;
    end if;
    select d.code || '/' || d.token into got
      from public.event_checkin_derive(decode(repeat('ab', 32), 'hex'), '00000000-0000-0000-0000-000000000001'::uuid, 1) d;
    if got is distinct from '5852/qlMyCJLtE-U9y9KYwGZWXQ' then
      raise exception 'event-checkins behaviour: derive step 1 gave %', got;
    end if;

    -- A signed-in student, straight from the database's web interface.
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform 1 from public.event_checkin_sessions;
      raise exception 'event-checkins behaviour: authenticated read event_checkin_sessions';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.event_checkins (event_id, user_id) values (nowhere, stranger);
      raise exception 'event-checkins behaviour: authenticated inserted a check-in';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.event_checkins set user_id = stranger where event_id = nowhere;
      raise exception 'event-checkins behaviour: authenticated could update event_checkins';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.event_checkin_self_as(stranger, nowhere, '1234', null);
      raise exception 'event-checkins behaviour: authenticated called event_checkin_self_as';
    exception when insufficient_privilege then null;
    end;
    if public.event_checkin_open(nowhere) is distinct from 'not_found' then
      raise exception 'event-checkins behaviour: open on a missing event did not answer not_found';
    end if;
    select count(*) into n from public.event_checkin_state(array[nowhere]);
    if n <> 0 then
      raise exception 'event-checkins behaviour: state answered for a missing event';
    end if;
    select count(*) into n from public.event_checkin_mine();
    if n <> 0 then
      raise exception 'event-checkins behaviour: a new account has check-ins';
    end if;

    -- Signed out.
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    begin
      perform public.event_checkin_open(nowhere);
      raise exception 'event-checkins behaviour: anon called event_checkin_open';
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from public.event_checkins;
      raise exception 'event-checkins behaviour: anon read event_checkins';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from public.event_checkin_state(array[nowhere]);
    if n <> 0 then
      raise exception 'event-checkins behaviour: anon got check-in state';
    end if;

    -- The server.
    perform set_config('request.jwt.claims', '', true);
    set local role service_role;
    if public.event_checkin_self_as(stranger, nowhere, '1234', null) is distinct from 'not_found' then
      raise exception 'event-checkins behaviour: self_as on a missing event did not answer not_found';
    end if;
    begin
      perform public.event_checkin_self_as(stranger, nowhere, null, null);
      raise exception 'event-checkins behaviour: self_as took neither a code nor a token';
    exception when invalid_parameter_value then null;
    end;
    begin
      perform 1 from public.event_checkin_sessions;
      raise exception 'event-checkins behaviour: service_role read event_checkin_sessions';
    exception when insufficient_privilege then null;
    end;

    raise exception 'event-checkins: behaviour post-check passed' using errcode = 'P0C91';
  exception when sqlstate 'P0C91' then
    raise notice 'event-checkins: behaviour post-check ok (undone)';
  end;
end $$;

notify pgrst, 'reload schema';

commit;
```

## 2. The shared file (Batch 0, written verbatim)

File: `src/lib/events/event-checkin.ts`.

- **What's in it:** the wire types of every new or changed route, the numbers,
  every student-facing sentence, and the pure helpers. The routes and both UI
  batches code against it.
- **Imports:** no React and nothing server-only.
- **Checked:** it typechecks under `strict` + `noUncheckedIndexedAccess`, and
  its helpers were run against probe values.
- **Changing it:** a batch that needs a change asks the orchestrator. Nobody
  edits it in place.

```ts
/**
 * Event check-in, the half both sides share (Oct 19 2026; contract:
 * handoffs/2026-10-19-checkin-build/CONTRACT.md): the numbers, the wire
 * types of every check-in route, the student-facing words and the pure
 * helpers the cards, the check-in page, the door screen and the routes use.
 * No React and nothing server-only: the routes and the browser both load it.
 *
 * The database half is supabase/migrations/20261019120000_event_checkins.sql
 * (the codes, the window, the from-5 floor); the numbers here mirror it and
 * src/lib/events/checkin-migration.test.ts keeps the two equal.
 *
 * "Check-in" here always means checking in AT AN EVENT. The yearly
 * school-email check (src/lib/auth/school-checkin-job.ts) and the usage
 * heartbeat (Privacy Policy 3d) are other things; never mix the names.
 */

// ── The numbers ─────────────────────────────────────────────────────────────

/** A code and a QR token last one 30-second step (the database's `step`). */
export const CHECKIN_STEP_SEC = 30;
export const CHECKIN_CODE_DIGITS = 4;
export const CHECKIN_TOKEN_LENGTH = 22;
/** Check-in works from an hour before the start ... */
export const CHECKIN_OPENS_BEFORE_MS = 60 * 60 * 1000;
/** ... to an hour after the end. */
export const CHECKIN_CLOSES_AFTER_MS = 60 * 60 * 1000;
/** Officers can mark people as here until a day after the end. */
export const CHECKIN_MARK_CLOSES_AFTER_MS = 24 * 60 * 60 * 1000;
/** Below this, nobody but the event's officers is told how many checked in. */
export const CHECKIN_PUBLIC_FLOOR = 5;
/** The query parameter the door's QR link carries its token in (Sentry strips it). */
export const CHECKIN_LINK_PARAM = "checkin";
/** How often the door screen re-reads its feed while it is visible. */
export const DOOR_POLL_MS = 10_000;
/** How often the officers' attendee list re-reads while check-in can happen. */
export const ATTENDEES_POLL_MS = 20_000;

// ── Wire types ──────────────────────────────────────────────────────────────

/** Every `code` a check-in route can answer with (plus the shared gates'). */
export type CheckinErrorCode =
  | "invalid_event_id"
  | "invalid_user_id"
  | "invalid_json"
  | "invalid_body"
  | "unauthorized"
  | "terms_required"
  | "account_restricted"
  | "not_found"
  | "org_role_required"
  | "org_hidden"
  | "checkin_code_format"
  | "checkin_code_wrong"
  | "checkin_link_expired"
  | "checkin_closed"
  | "checkin_outside_window"
  | "checkin_mark_window"
  | "checkin_not_on_list"
  | "checkin_too_many_tries"
  | "checkin_unavailable"
  | "request_failed";

/** A refusal: `{ ok: false, code, error }`, `error` a sentence a person can read. */
export type CheckinFailureBody = { ok: false; code: CheckinErrorCode; error: string };

/** What the viewer knows about one event's check-in. */
export type CheckinViewerState = {
  event_id: string;
  /** An officer started check-in and the window is on (club not hidden). */
  open: boolean;
  /** The viewer checked in (or was marked as here). */
  checked_in: boolean;
  /** Exact for the event's officers; for everyone else null below 5. */
  count: number | null;
  /** ISO times: an hour before the start, an hour after the end. */
  opens_at: string;
  closes_at: string;
};

/** GET /api/events/[id]/checkin */
export type CheckinStateResponse = { ok: true; state: CheckinViewerState };
/** POST /api/events/[id]/checkin: exactly one of the two. */
export type CheckinPostBody = { code: string } | { token: string };
export type CheckinPostResponse = { ok: true; already: boolean; state: CheckinViewerState };
/** DELETE /api/events/[id]/checkin. `state` is null when the event can no longer be seen. */
export type CheckinDeleteResponse = { ok: true; state: CheckinViewerState | null };

/** One 30-second step on the door screen. `link` is what the QR holds. */
export type DoorStep = { code: string; link: string; starts_at: string; ends_at: string };

/** GET / POST / DELETE /api/events/[id]/checkin/door (officers). */
export type DoorFeed = {
  event_id: string;
  /** Started, and inside the window. */
  open: boolean;
  opens_at: string;
  closes_at: string;
  /** The database's clock, for the countdown (the screen's own may drift). */
  server_now: string;
  /** Null unless open. */
  current: DoorStep | null;
  /** The step after `current`, so one missed read never blanks the screen. */
  next: DoorStep | null;
  /** Exact: everyone checked in so far. */
  count: number;
};
export type DoorResponse = { ok: true; door: DoorFeed };

/** PUT / DELETE /api/events/[id]/checkin/marks/[userId] (officers). */
export type MarkResponse = { ok: true; user_id: string; checked_in: boolean };
/** DELETE /api/events/[id]/checkin/marks (officers): clear all. */
export type ClearResponse = { ok: true; cleared: number };

export type AttendeeUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: number | null;
};

/** One row of the officers' attendee list. A walk-in has `status: null`. */
export type EventAttendee = {
  status: "going" | "maybe" | null;
  created_at: string | null;
  checked_in: boolean;
  user: AttendeeUser;
};

export type AttendeesCheckin = {
  open: boolean;
  /** Exact: every check-in row, walk-ins included. */
  count: number;
  starts_at: string;
  ends_at: string;
};

/** GET /api/events/[id]/attendees (officers), extended. */
export type AttendeesResponse = {
  ok: true;
  going: EventAttendee[];
  interested: EventAttendee[];
  /** Checked in without a Going or Interested RSVP. */
  walk_ins: EventAttendee[];
  checkin: AttendeesCheckin;
};

/** GET /api/me/event-checkins: the viewer's own, for Settings. */
export type MyEventCheckin = {
  event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  org: { name: string; handle: string } | null;
};
export type MyEventCheckinsResponse = { ok: true; checkins: MyEventCheckin[] };

/** The three fields every GET /api/events item (and PATCH's `event`) gains. */
export type EventCheckinListFields = {
  checkin_open: boolean;
  checked_in_count: number | null;
  viewer_checked_in: boolean;
};

/** What a card needs to draw check-in (a CampusEvent fits it). */
export type CheckinCardEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  viewer_can_manage?: boolean;
} & Partial<EventCheckinListFields>;

/** One parsed row of `event_checkin_state`. */
export type CheckinStateRow = { open: boolean; count: number | null; viewerCheckedIn: boolean };

// ── Words ───────────────────────────────────────────────────────────────────
// Plain English, no blame. Never the word "safety", nothing about location.

export const CHECKIN_ERRORS: Record<CheckinErrorCode, string> = {
  invalid_event_id: "That event is no longer available.",
  invalid_user_id: "That person isn't on this event's list.",
  invalid_json: "Something went wrong. Try again.",
  invalid_body: "Something went wrong. Try again.",
  unauthorized: "Sign in to check in.",
  terms_required: "Accept the Terms to continue.",
  account_restricted: "Your account is restricted.",
  not_found: "That event is no longer available.",
  org_role_required: "Only the club's owner and admins can run check-in.",
  org_hidden: "You can't change this club's events right now.",
  checkin_code_format: "Enter the 4-digit code on the screen at the door.",
  checkin_code_wrong: "That code didn't match. It changes every 30 seconds, so check the screen and try again.",
  checkin_link_expired: "That link has expired. Type the 4-digit code on the screen instead.",
  checkin_closed: "Check-in isn't open right now.",
  checkin_outside_window: "Check-in works from an hour before the event until an hour after it ends.",
  checkin_mark_window: "You can mark people as here from an hour before the event until a day after it ends.",
  checkin_not_on_list: "You can mark people who said Going or Interested.",
  checkin_too_many_tries: "Too many tries today. Ask someone running check-in to mark you as here.",
  checkin_unavailable: "Check-in is busy right now. Try again in a minute.",
  request_failed: "Something went wrong. Try again.",
};

export const CHECKIN_COPY = {
  checkIn: "Check in",
  imHere: "I'm here",
  checkedIn: "You're checked in",
  remove: "Remove my check-in",
  removeConfirm: "Remove it? Check-in has closed, so you can't add it back.",
  removeYes: "Remove",
  removeKeep: "Keep",
  codeLabel: "4-digit code from the screen at the door",
  sheetTitle: "Check in",
  sheetLead: "Type the 4 numbers on the club's check-in screen.",
  startCheckin: "Start check-in",
  showCheckin: "Show check-in",
  stopCheckin: "Stop check-in",
  done: "Done",
  doorLead: "Scan with your phone's camera, or type the code in Vibe.",
  doorBefore: "You can start check-in from an hour before the event.",
  doorAfter: "Check-in has ended.",
  doorStartLead: "People check in by scanning this screen or typing the 4 numbers under the code. The code changes every 30 seconds.",
  doorNotOfficer: "Only the club's owner and admins can run check-in.",
  markHere: "Mark as here",
  here: "Here",
  clearAll: "Clear check-ins",
  checkedInHeading: "Checked in",
  goingNotInHeading: "Said Going, didn't check in",
  interestedHeading: "Interested",
  settingsTitle: "Event check-ins",
  settingsLead: "The events you checked in at. Each club's owner and admins can see who checked in at its events.",
  settingsEmpty: "You haven't checked in at any events.",
  goToEvent: "Go to the event",
  goToCampus: "Go to Campus",
  pastHeading: "Past events",
  whoCame: "Who came",
  seeWhoCame: "See who came",
  typeCodeInstead: "Type the code instead",
  checking: "Checking…",
  starting: "Starting…",
  stopping: "Stopping…",
  tryAgain: "Try again",
  loading: "Loading…",
  eventGone: "That event isn't available.",
  landingClosed: "Check-in for this event has closed.",
  landingNotOpen: "Check-in isn't open right now. When the club starts it, the code shows on their screen at the door.",
  doorGettingCode: "Getting the code…",
  doorLoadFailed: "Couldn't load check-in.",
  doorReconnecting: "Reconnecting…",
  doorNobodyYet: "Nobody has checked in yet.",
  clearing: "Clearing…",
  keepThem: "Keep them",
} as const;

/** "Check in to Fall Formal?" (the QR's one-tap line). */
export function checkInToLine(title: string): string {
  return `Check in to ${title}?`;
}

/** "Check-in opens at 6:00 PM, an hour before the event." */
export function opensAtLine(timeLabel: string): string {
  return `Check-in opens at ${timeLabel}, an hour before the event.`;
}

/** "New code in 12 s" (the door's countdown; never announced). */
export function newCodeInLine(seconds: number): string {
  return `New code in ${Math.max(0, Math.trunc(seconds))} s`;
}

/** The officers' confirm before clearing every check-in of an event. */
export function clearConfirmLine(title: string): string {
  return `Clear all check-ins for ${title}? This can't be undone.`;
}

// ── Helpers (pure) ──────────────────────────────────────────────────────────

export type CheckinPhase = "before" | "open" | "after";

/**
 * Where `nowMs` sits against the check-in window (the database's rule:
 * outside when now < start - 1 h or now > end + 1 h). Null when a time is
 * unreadable or `nowMs` is 0 (useCampusNow before hydration): draw nothing.
 */
export function checkinPhase(
  startsAt: string,
  endsAt: string,
  nowMs: number,
  closesAfterMs: number = CHECKIN_CLOSES_AFTER_MS,
): CheckinPhase | null {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(nowMs) || nowMs <= 0) return null;
  if (nowMs < start - CHECKIN_OPENS_BEFORE_MS) return "before";
  if (nowMs > end + closesAfterMs) return "after";
  return "open";
}

/** The same for an officer's "Mark as here" (until a day after the end). */
export function markPhase(startsAt: string, endsAt: string, nowMs: number): CheckinPhase | null {
  return checkinPhase(startsAt, endsAt, nowMs, CHECKIN_MARK_CLOSES_AFTER_MS);
}

/** What the code box keeps of what was typed or pasted: digits, at most 4. */
export function sanitizeDoorCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CHECKIN_CODE_DIGITS);
}

export function isDoorCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export function isCheckinToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** The student's check-in page. */
export function checkinPagePath(eventId: string): string {
  return `/campus/checkin/${encodeURIComponent(eventId)}`;
}

/** The officers' door screen. */
export function doorPagePath(eventId: string): string {
  return `/campus/checkin/${encodeURIComponent(eventId)}/door`;
}

/** The event's card on the Events tab (contract C2's anchor). */
export function eventAnchorPath(eventId: string): string {
  return `/campus?tab=events&event=${encodeURIComponent(eventId)}`;
}

/** What the door's QR holds. `origin` has no trailing slash. */
export function checkinLink(origin: string, eventId: string, token: string): string {
  return `${origin}${checkinPagePath(eventId)}?${CHECKIN_LINK_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * The count line on a card or a past-event row: "12 checked in" while it can
 * still happen, "12 were there" once the event has ended. Null for nothing to
 * show: no number, 0, or under 5 for anyone but the event's officers (the
 * server already sends them null; this keeps a stale number from showing).
 */
export function checkinCountLine(
  count: number | null | undefined,
  ended: boolean,
  isManager: boolean,
): string | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const n = Math.trunc(count);
  if (n <= 0) return null;
  if (!isManager && n < CHECKIN_PUBLIC_FLOOR) return null;
  if (ended) return n === 1 ? "1 was there" : `${n} were there`;
  return `${n} checked in`;
}

/** Spaced digits, so a screen reader says "4 8 1 2", not "four thousand...". */
export function spokenCode(code: string): string {
  return code.split("").join(" ");
}

/** Whole seconds until `endsAtIso`, by the server's clock (`skewMs` = server - device). */
export function secondsLeft(endsAtIso: string, deviceNowMs: number, skewMs: number): number {
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - (deviceNowMs + skewMs)) / 1000));
}

/**
 * The step the door should show right now: `current` until it ends, then
 * `next`, then nothing (the feed is stale: read it again).
 */
export function doorStepNow(
  feed: Pick<DoorFeed, "current" | "next">,
  deviceNowMs: number,
  skewMs: number,
): DoorStep | null {
  const now = deviceNowMs + skewMs;
  for (const step of [feed.current, feed.next]) {
    if (step && now < Date.parse(step.ends_at)) return step;
  }
  return null;
}

/**
 * The officers' list once check-in matters: everyone checked in first
 * (Going, then Interested, then walk-ins, each in the route's order), then
 * who said Going and didn't check in, then Interested who didn't.
 */
export function splitAttendees(lists: {
  going: EventAttendee[];
  interested: EventAttendee[];
  walk_ins: EventAttendee[];
}): { checkedIn: EventAttendee[]; goingNotIn: EventAttendee[]; interestedNotIn: EventAttendee[] } {
  return {
    checkedIn: [
      ...lists.going.filter((a) => a.checked_in),
      ...lists.interested.filter((a) => a.checked_in),
      ...lists.walk_ins,
    ],
    goingNotIn: lists.going.filter((a) => !a.checked_in),
    interestedNotIn: lists.interested.filter((a) => !a.checked_in),
  };
}

/**
 * Whether the officers' list shows the check-in split: once the window has
 * opened, or as soon as anyone is checked in. Before that it stays the plain
 * Going / Interested list.
 */
export function showCheckinSplit(phase: CheckinPhase | null, checkedInCount: number): boolean {
  return checkedInCount > 0 || phase === "open" || phase === "after";
}

/** `event_checkin_state` rows by event id. Anything malformed is skipped. */
export function parseCheckinStateRows(data: unknown): Map<string, CheckinStateRow> {
  const out = new Map<string, CheckinStateRow>();
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.event_id !== "string") continue;
    const n = r.checked_in_count;
    out.set(r.event_id, {
      open: r.is_open === true,
      viewerCheckedIn: r.viewer_checked_in === true,
      count: typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null,
    });
  }
  return out;
}

/** The list fields from a parsed row; "nothing known" when there is none. */
export function checkinListFields(row: CheckinStateRow | undefined): EventCheckinListFields {
  return {
    checkin_open: row?.open ?? false,
    checked_in_count: row?.count ?? null,
    viewer_checked_in: row?.viewerCheckedIn ?? false,
  };
}
```

## 3. Routes

### 3.0 Shared rules for every route below

- **Parameters.** `params` is a Promise (Next 16). `isUuid` comes from
  `@/lib/pgrest`. A bad event id gets 400 `invalid_event_id`; a bad
  `[userId]` gets 400 `invalid_user_id`. Both are checked before anything
  else.
- **Sign-in.** `createSupabaseServerClient().auth.getUser()`; no user gets
  401 `unauthorized`.
- **The limiter runs right after getUser,** before any database read or
  Terms check (the social-limits order).
- **Refusals** are `{ ok: false, code, error }` with
  `error = CHECKIN_ERRORS[code]`, built by
  `checkinFail(status, code)` in `src/lib/events/checkin-route.ts`.
  - The shared gates keep their own bodies: `requireNotRestricted` answers
    403 `terms_required` or `account_restricted`.
  - A 500 is `request_failed`. Log `[events/:id/checkin <step>]` with the
    error code only: never a code, a token or a user id.
- **429s.**
  - The `eventCheckin` budget answers
    `tooManyRequests(rl, CHECKIN_ERRORS[c], c)`, where `c` is
    `"checkin_unavailable"` when `rl.reason === "unavailable"` and
    `"checkin_too_many_tries"` otherwise.
  - Every other budget answers `tooManyRequests(rl, "Too many check-in requests. Try again in a few minutes.")`,
    with no code.
- **Caching.** Every GET answers with `Cache-Control: no-store`.
- **What never shows up:**
  - No location of any kind and no geolocation call.
  - No campus gate.
  - Nothing that tells a near miss from a far one: any wrong code is
    `checkin_code_wrong`, and any bad or old token is
    `checkin_link_expired`.

### 3.1 Budgets (`src/lib/limits/budgets.ts`, applied in Batch 0, diff in section 8)

All windows divide 86,400, and keys are `budget-<name>:<account id>` (no IP,
no event id).

- **Type change:** `BUDGETS`'s `satisfies` becomes
  `Record<string, Pick<RateLimitOptions, "limit" | "windowSec" | "failClosed">>`.
  `limitFor` already passes the whole entry to `rateLimit`.
- **Comment change:** in the header comment, "the check-in" becomes "the
  usage check-in (the heartbeat)".

| Name | Limit / window | failClosed | Used by |
|---|---|---|---|
| `eventCheckin` | 20 / 86_400 | **true** | POST checkin (code or token). The only bound on guessing (D4). A day window, so the count says only that an account tried that day, never when or where. |
| `eventCheckinRemove` | 60 / 86_400 | no | DELETE checkin (own) |
| `eventCheckinRead` | 1000 / 86_400 | no | GET checkin, GET /api/me/event-checkins |
| `eventCheckinDoor` | 180 / 600 | no | GET checkin/door. One read per 10 s per screen is 60 per 10 min, so two screens fit. |
| `eventAttendeesRead` | 240 / 600 | no | GET attendees (no limit today). It re-reads every 20 s while check-in can happen. |
| `orgOfficer` (existing, 300 / 600) | | no | POST/DELETE checkin/door, PUT/DELETE marks/[userId], DELETE marks |

### 3.2 Student: `src/app/api/events/[id]/checkin/route.ts` (Batch 1)

**GET** returns the viewer's state.
1. Run the checks in this order: id, getUser, `limitFor("eventCheckinRead")`.
2. Viewer client: `events.select("id,starts_at,ends_at").eq("id", id).maybeSingle()`.
   If nothing comes back (RLS hides it), 404 `not_found`.
3. Viewer client: `rpc("event_checkin_state", { p_event_ids: [id] })`, then
   `parseCheckinStateRows`. If the row is missing, 404 `not_found`; on an RPC
   error, 500.
4. 200 `CheckinStateResponse`:
   `{ ok: true, state: { event_id, open, checked_in, count, opens_at, closes_at } }`.
   `opens_at` = `starts_at` − 1 h and `closes_at` = `ends_at` + 1 h, both ISO.

**POST** checks you in. Body `CheckinPostBody`.
1. Validate the id, then getUser.
2. Parse the JSON body (400 `invalid_json`). Exactly one of `code` or `token`
   must be a string, else 400 `invalid_body`.
3. Check the shape **before the limiter**, so a malformed try costs nothing:
   - `code`: drop spaces and dashes; it must pass `isDoorCode`, else 400
     `checkin_code_format`.
   - `token`: it must pass `isCheckinToken`, else 409
     `checkin_link_expired`.
4. `limitFor("eventCheckin", user.id)`. It fails closed; see the 429 rule.
5. `requireNotRestricted(user.id)`. Not `requireCanPublish`: checking in isn't
   publishing.
6. If `isSupabaseServiceConfigured()` is false, 500. Otherwise call, on the
   SERVICE client,
   `rpc("event_checkin_self_as", { p_user: user.id, p_event_id: id, p_code, p_token })`
   with the unused one as `null`.
7. Map the word:

| word | answer |
|---|---|
| `checked_in` | 200 `{ ok: true, already: false, state }` |
| `already` | 200 `{ ok: true, already: true, state }` |
| `wrong_code` | 400 `checkin_code_wrong` |
| `link_expired` | 409 `checkin_link_expired` |
| `not_open` | 409 `checkin_closed` |
| `outside_window` | 409 `checkin_outside_window` |
| `not_found` | 404 `not_found` |
| `restricted` | 403 `account_restricted` (`accountRestrictedResponse()`) |
| `terms_required` | 403 `terms_required` |
| anything else, or an RPC error | 500 `request_failed` |

   `state` is re-read the way GET reads it, on the viewer client. If that
   read fails after a success, answer 200 with
   `state: { event_id, open: true, checked_in: true, count: null, opens_at: "", closes_at: "" }`.
   The check-in did happen.

**DELETE** removes your own check-in. It's idempotent.
1. Validate the id, getUser, then `limitFor("eventCheckinRemove")`.
2. Viewer client: `from("event_checkins").delete().eq("event_id", id).eq("user_id", user.id)`.
   On an error, 500.
3. 200 `CheckinDeleteResponse`: `{ ok: true, state }`. `state` is the GET
   read, or `null` when the event can't be seen any more.

There's no Terms, window, hidden-club or restriction gate here. Taking your
own record back is never what those gates protect (the
`rsvp/route.ts:186-196` rule).

### 3.3 Officer door: `src/app/api/events/[id]/checkin/door/route.ts` (Batch 1)

All three answer `DoorResponse`: `{ ok: true, door: DoorFeed }`, built by
`doorFeedFrom(json, origin, eventId)`:
- `origin = getSiteOriginForRequest(req)` (`@/lib/auth/site-url`): localhost
  in dev, otherwise the canonical site. Never the Host header.
- `door` = `{ event_id, open: j.is_open === true, opens_at, closes_at, server_now, current, next, count }`.
- `count` is `toCount(j.here_count)`.
- When open and `j.code` and `j.token` are strings:
  - `current = { code: j.code, link: checkinLink(origin, id, j.token), starts_at: j.step_starts_at, ends_at: j.step_ends_at }`.
  - `next = { code: j.next_code, link: checkinLink(origin, id, j.next_token), starts_at: j.step_ends_at, ends_at: j.next_ends_at }`.
- Otherwise both are `null`.

The door JSON's `status` maps to: `ok` → the feed; `not_found` → 404
`not_found`; `not_manager` → 403 `org_role_required`; `restricted` → 403
`account_restricted`; `org_hidden` → 403 `org_hidden`.

- **GET** (the screen's 10-second read): id → getUser →
  `limitFor("eventCheckinDoor")` → viewer client
  `rpc("event_checkin_door", { p_event_id: id })`.
- **POST** (Start check-in): id → getUser → `limitFor("orgOfficer")` →
  `requireNotRestricted` → viewer client `rpc("event_checkin_open")`. Then:
  - `open` or `already_open`: read the door JSON and answer the feed.
  - `outside_window`: 409 `checkin_outside_window`.
  - `org_hidden`, `not_manager`, `not_found`, `restricted`: as above.
- **DELETE** (Stop check-in): id → getUser → `limitFor("orgOfficer")` →
  viewer client `rpc("event_checkin_close")`. `closed` → read the door JSON
  and answer the feed (`open: false`). `not_found` / `not_manager` as above.
  There's no restriction gate: stopping only takes something away.

### 3.4 Officer marks (Batch 1)

`src/app/api/events/[id]/checkin/marks/[userId]/route.ts`:
- **PUT** ("Mark as here"): ids → getUser → `limitFor("orgOfficer")` →
  `requireNotRestricted` → viewer client
  `rpc("event_checkin_mark", { p_event_id, p_user_id })`.
  - `marked` / `already` → 200 `MarkResponse` `{ ok: true, user_id, checked_in: true }`.
  - `outside_window` → 409 `checkin_mark_window`.
  - `not_on_list` → 409 `checkin_not_on_list`.
  - `not_found`, `not_manager`, `restricted`, `org_hidden` → as 3.3.
- **DELETE** (take one off): ids → getUser → `limitFor("orgOfficer")` →
  `rpc("event_checkin_unmark")`.
  - `removed` → 200 `{ ok: true, user_id, checked_in: false }`.
  - `not_found` / `not_manager` → as 3.3.

`src/app/api/events/[id]/checkin/marks/route.ts`:
- **DELETE** (clear all): id → getUser → `limitFor("orgOfficer")` →
  `rpc("event_checkin_clear")` (jsonb).
  - `cleared` → 200 `ClearResponse` `{ ok: true, cleared }`.
  - `not_found` / `not_manager` → as 3.3.

### 3.5 Mine: `src/app/api/me/event-checkins/route.ts` (Batch 1)

**GET**: getUser → `limitFor("eventCheckinRead")` → viewer client
`rpc("event_checkin_mine")` → 200 `MyEventCheckinsResponse`:
`{ ok: true, checkins: [{ event_id, title, starts_at, ends_at, org: { name, handle } | null }] }`.
`org` is null when `org_handle` is null. On an error, 500.

### 3.6 Existing routes (Batch 2)

**`src/app/api/events/[id]/attendees/route.ts`** (GET, officers):
1. Add `limitFor("eventAttendeesRead")` right after getUser.
2. The event read selects `"id,starts_at,ends_at"`.
3. After the existing `can_manage_event` gate and the RSVP read, two more
   reads run together on the viewer client:
   - `event_checkins` with
     `"user_id,user:users!event_checkins_user_id_fkey!inner(id,name,handle,avatar_url,major,year)"`,
     `.eq("event_id", id).limit(1000)`;
   - `rpc("event_checkin_state", { p_event_ids: [id] })`.
4. Build the answer:
   - Every `going` and `interested` row gains `checked_in` (whether its user
     id is in the check-in set).
   - `walk_ins` = the check-ins whose user isn't in going ∪ interested, as
     `{ status: null, created_at: null, checked_in: true, user }`.
   - `checkin` = `{ open, count, starts_at, ends_at }`. `count` is the
     state's exact `checked_in_count`, and falls back to the number of
     check-in rows read.
5. Response: `AttendeesResponse`. Existing errors keep today's shape. A
   failed check-in read is a 500, the way a failed RSVP read is.

**`src/app/api/events/route.ts`** (GET list):
- **The `when=past` view.** `const past = !!orgIdFilter && url.searchParams.get("when") === "past";`.
  - `baseQuery` takes `past`. When true it uses
    `.lt("ends_at", nowIso).gte("ends_at", <now − 30 days ISO>).order("starts_at", { ascending: false }).limit(Math.min(limit, 20))`.
  - Otherwise it's today's chain, unchanged.
  - Without `org_id`, `when` is ignored. The hidden-club and uuid rules of
    the org branch apply as today.
- **The state read.** Next to `event_rsvp_counts` (`:341-348`), add the
  viewer-client `rpc("event_checkin_state", { p_event_ids: eventIds })` to
  the same `Promise.all`, then `parseCheckinStateRows`.
  - On an error, log `[events GET checkin state]` (`error.code` only) and go
    on with an empty map.
  - Never a 500: "no check-in shown" is honest; a broken list isn't.
- Pass `checkin: stateById.get(row.id)` into `toEventListItem`.

**`src/lib/events/event-item.ts`**:
- `ctx` gains `checkin?: CheckinStateRow` (imported from
  `@/lib/events/event-checkin`).
- The returned object gains `...checkinListFields(ctx.checkin)` **after**
  `org`, so the old key order holds and the three new keys come last.
- Update the header comment's key-order line.

**`src/app/api/events/[id]/route.ts`** (PATCH `itemFor`, `:240-274`):
- Add the same state RPC for `[row.id]` to its `Promise.all`.
- An error there gives `checkin: undefined`, not `null`: the edit is saved
  and the fields read "nothing known".
- Nothing else in the file changes.

### 3.7 The QR landing page (Batch 3) and the door page (Batch 4)

`src/app/campus/checkin/[id]/page.tsx` is a server component:
`metadata = { title: "Check in · Vibe", robots: { index: false } }`.

1. `const { id } = await params; const sp = await searchParams;`
2. If the id isn't a uuid, render `<CheckinLanding event={null} … />`
   ("That event isn't available.") with no database call.
3. `await enforceCampusAccess(checkinPagePath(id))`. The path goes **without
   the token**, so it never enters login URLs or logs.
4. Read the event, then the club, then the state:
   - Viewer client: `events.select("id,title,starts_at,ends_at,location,org_id")`.
     If nothing comes back, `event = null`.
   - When `org_id` is set, service client: `orgs.select("name,handle,hidden_at")`.
     A hidden club gives `event = null`, the same words as a missing event.
   - Viewer client: `rpc("event_checkin_state", { p_event_ids: [id] })`, then
     `initial` (a `CheckinViewerState` built like 3.2's GET, or `null` on an
     error).
5. `token = isCheckinToken(first(sp[CHECKIN_LINK_PARAM])) ? that : null`.
6. Render `<CheckinLanding event={…} initial={…} token={token} />`.

**Signed out:**
- `/campus/checkin/<id>?checkin=<t>` sends you to
  `/auth/login?next=%2Fcampus%2Fcheckin%2F<id>` (via `enforceCampusAccess`).
- After sign-in (plus Terms, school email and onboarding if they're owed), you
  land on the same page with no token. The code box shows: "Type the 4
  numbers on the club's check-in screen."
- A suspended account: the proxy sends every page to `/account/suspended`, as
  today.

**Signed in:**
- **Valid token:** one "I'm here" button (D6), which POSTs `{ token }`.
- **Expired token:** the expired line, then the code box.
- **No token:** the code box.
- **Already checked in:** the success state.

`src/app/campus/checkin/[id]/door/page.tsx` is a server component:
`metadata = { title: "Check-in screen · Vibe", robots: { index: false } }`.
1. If the id isn't a uuid, call `notFound()`.
2. `await enforceCampusAccess(doorPagePath(id))`.
3. Viewer client: the event row (`id,title,starts_at,ends_at,org_id`), or
   `notFound()`. Then `rpc("can_manage_event", { p_event_id: id })`. Then the
   club's name and handle with the service client.
4. Render `<DoorView event={{ id, title, starts_at, ends_at, org }} canManage={canManage === true} />`.

## 4. UI per surface

### 4.0 Rules for every new component

- **Words.** Every student-facing sentence comes from `CHECKIN_COPY` or
  `CHECKIN_ERRORS`. Never "safety", and nothing about where anyone is.
- **Colors.**
  - Pieces inside an event card or the officers' attendee modal sit on the
    always-dark Events scene. They copy the card's dark values
    (`eventCardSubtleLink` `campus-home.tsx:11021`, the Manage attendees
    coral tint `:11101`) as local constants, each with a comment naming the
    source line.
  - Everything else is a page, sheet or dialog of its own and uses theme
    tokens only: `--cream`, `--charcoal`, `--ink-2`, `--ink-muted`,
    `--hairline`, `--coral`, `--on-coral`, `--tag-ink`, `--ok-ink`,
    `--error-ink`, `rgba(var(--scrim-rgb), a)`. That way Night mode follows.
  - The QR tile is the one fixed pair: `#fff` paper and `#000` ink.
- **Motion** comes only from `src/lib/motion`.
  - `SPRING_SOFT` + `RISE_PX`: arrivals and the new-code crossfade.
  - `SPRING_POP`: the success tick and the count bump.
  - `SPRING_SNAPPY`: presses.
  - Only `transform` and `opacity`; `.vibe-press` on tappable pills.
  - MotionRoot already handles reduced motion. Add no CSS keyframes and no
    width or offset animation.
- **Clock.** `useCampusNow(60_000)` (0 until hydrated: draw nothing that
  depends on time) and `checkinPhase` / `markPhase`. The door screen keeps
  its own one-second tick, set by the server's clock.
- **Requests** go through `vibeRequest`. The code form passes `quiet: true`
  and words refusals by `code` from `CHECKIN_ERRORS`. Officer actions are not
  quiet: the server's sentence shows as the toast.
- **Hit areas:** at least 32 px; 44 px for primary buttons.
- **Overlays** (sheet, dialog) are portalled to `document.body`. Stop
  `onPointerMove` from bubbling, or MouseSpotlight tilts the card behind
  them.

### 4.1 Desktop Events, phone Events and the club page's upcoming list: EventCard

All three render the one `EventCard` (`campus-home.tsx:10685`). Phone:
`CampusMobile.tsx:2622-2629`. Club page: `OrgEventsSection.tsx:183-202`.
CampusMobile and OrgEventsSection need no edits.

**Wiring in `src/app/campus/campus-home.tsx` (Batch 4 owns the file):**
1. `CampusEvent` (`:10274-10302`): after `viewer_can_manage: boolean;` add
   `checkin_open?: boolean; checked_in_count?: number | null; viewer_checked_in?: boolean;`.
   They're optional, so existing fixtures (`tonight-view.test.ts:105`) and
   lists still type.
2. Right after the RSVP row's closing `</div>` (`:10941`), before the
   `EVENT_CHAT_LINE` block (`:10942`), add `<CheckinSlot ev={ev} />`. It goes
   in its own slot, never in the action row: `:10957` hides that row from a
   creator who neither RSVP'd nor manages.
3. In the action row, right after the `ManageAttendeesAction` block
   (`:10976-10981`), add `{ev.viewer_can_manage ? <StartCheckinAction ev={ev} /> : null}`.
   Gate it on `viewer_can_manage` only, so an org-less event's creator gets
   it too.

**`CheckinSlot`** (`src/components/events/checkin/CheckinSlot.tsx`, Batch 3)
takes `{ ev: CheckinCardEvent }`. It renders nothing until `now > 0`, and
nothing at all outside phase `open`. Inside the window:
1. **Count line**, when `checkinCountLine(count, false, !!ev.viewer_can_manage)`
   isn't null. DM Sans 12, `rgba(255,255,255,0.6)`, `marginTop: 8`.
2. **Checked in:** a 20 px coral disc with a white tick (pops once with
   `SPRING_POP` from scale 0.6) and "You're checked in" (13, 600, `#fff`).
   Beside it, a subtle pill "Remove my check-in":
   - While check-in is open: DELETE straight away.
   - Once it has closed: an inline confirm first, `removeConfirm` with
     "Remove" and "Keep" buttons. Never a modal: no import from campus-home.
3. **Open and not checked in:** a coral pill "Check in" (coral fill,
   `--on-coral`-like dark ink: copy `OrgEventsSection.tsx:140-143`, min-height
   32). It opens `CheckinSheet`.
4. **Not open and not checked in:** nothing (most clubs never start
   check-in).

State comes from `useCheckinState(ev)` (`use-checkin-state.ts`, Batch 3):
- It starts from the list fields.
- While the phase is `open`, it reads `GET /api/events/[id]/checkin` once on
  mount and again on `visibilitychange` back to visible, at most once every
  30 s. The list doesn't poll, so a student who walks up to the door and
  opens the app sees "Check in".
- It exposes `{ state, refresh, set }`.

**`CheckinSheet`** (`CheckinSheet.tsx`, Batch 3) takes
`{ eventId, eventTitle, onClose, onCheckedIn(state) }`. `useIsMobile()`
picks the shape (the `EventReportAction` split, `:11058-11086`):
- **Phone:** a vaul `Drawer.Root`, styled with the overlay, content and
  handle styles from `src/components/mobile/messages/sheet-styles.ts`.
  Overlay z 10400, content z 10401, above the tab bar at 9988. Title
  `sheetTitle`.
- **Desktop:** a portalled dialog: fixed, `inset: 0`, z 10400.
  - Scrim `rgba(var(--scrim-rgb),0.45)`, fading in with `SPRING_SOFT`.
  - Panel: `--cream` background, `--charcoal` ink, max-width 400, radius 20,
    padding 22. It enters with `{ initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, transition: SPRING_SOFT }`.
  - `role="dialog"`, `aria-modal`, `aria-labelledby` pointing at the title.
    Escape or a backdrop tap closes it. Focus goes to the input on open and
    back to the opener on close.
- **Body:** `sheetLead`, then `<CheckinCodeForm autoFocus … />`. On
  success it calls `onCheckedIn`, closes, and the slot flips to "You're
  checked in".

**`CheckinCodeForm`** (`CheckinCodeForm.tsx`, Batch 3) takes
`{ eventId: string; eventTitle: string; token?: string | null; autoFocus?: boolean; onCheckedIn: (s: CheckinViewerState, already: boolean) => void }`.
It uses tokens only.
- **Token mode** (`token` set):
  - The line `checkInToLine(eventTitle)`.
  - A primary button "I'm here": `--coral` fill, `--on-coral` ink, min-height
    48, full width. It POSTs `{ token }`.
  - A text button `typeCodeInstead`.
  - On `checkin_link_expired` it switches to code mode and shows that line.
- **Code mode:**
  - A visible `<label>` reading `codeLabel`.
  - The input: `type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" autoCapitalize="off" spellCheck={false}`.
    Not `one-time-code`: iOS would offer an unrelated SMS code.
  - `onChange` keeps `sanitizeDoorCode(value)`, with no `maxLength` (a paste
    of "12 34" survives).
  - Look: 32 px, tabular numbers, letter-spacing 0.3em, centred, height 56.
  - It submits by itself at 4 digits; the "Check in" button is disabled below
    4.
  - While busy: `checking`.
- **Errors:**
  - A line under the field with `role="alert"` and `--error-ink`.
  - On `checkin_code_wrong` the field clears and takes focus again.
  - On `checkin_too_many_tries` or `checkin_unavailable` the field disables.
- **Reload guard:** the root carries `data-holds-reload` while the field has
  digits or a request is out. Otherwise it's `"false"`.

**`StartCheckinAction`** (`StartCheckinAction.tsx`, Batch 4) takes
`{ ev: CheckinCardEvent }`. It renders only when `ev.viewer_can_manage` and
the phase is `open`.
- **The pill:** the Manage attendees coral tint.
- **Not open:** the label is `startCheckin`. The click calls
  `vibeRequest(POST /api/events/[id]/checkin/door, { failure: "Couldn't start check-in." })`,
  and on ok `window.location.assign(doorPagePath(id))`. While busy the label
  is `starting`.
- **Already open (`ev.checkin_open`):** an `<a href={doorPagePath(id)}>`
  labelled `showCheckin`.

### 4.2 Officers' attendee list (inside EventCard, and from the club page's Past events)

Batch 4 changes `campus-home.tsx` `:11473-11823`:

1. **Exports.** `type Attendee` becomes `EventAttendee` from
   `@/lib/events/event-checkin`; replace the local type, keeping the name as
   an alias. `function AttendeesModal` becomes `export function AttendeesModal`,
   with the same props `{ eventId, eventTitle, onClose }`.
2. **The fetch** reads `AttendeesResponse`: `going`, `interested`,
   `walk_ins`, `checkin`.
   - It keeps re-reading every `ATTENDEES_POLL_MS` while
     `markPhase(checkin.starts_at, checkin.ends_at, now) === "open"` and the
     tab is visible.
   - It uses `useCampusNow(60_000)` for `now`.
3. **Two layouts.**
   - `showCheckinSplit(checkinPhase(...), checkin.count)` true:
     `splitAttendees(...)` gives three `AttendeeList`s, in this order:
     1. `${checkedInHeading} · n`, accent `#5BD18C`;
     2. `${goingNotInHeading} · n`, accent `#FFB85A`;
     3. `${interestedHeading} · n`, accent `rgba(255,255,255,0.55)`.
   - Otherwise, today's Going / Interested lists, unchanged.
   - "Message all (N)" keeps using the whole `going` list.
4. **`AttendeeList`** gains an optional prop
   `here?: { eventId: string; canMark: boolean; onChange: (userId: string, next: boolean) => void }`.
   When it's set, each row renders
   `<HereToggle eventId userId name checkedIn={a.checked_in} canMark={here.canMark && a.status !== null} onChange={(next) => here.onChange(a.user.id, next)} />`
   **before** the Message button (`:11800`). `onChange` flips `checked_in`
   in the modal's state, moving the row between sections without a re-read.
   `checkin.count` then follows the rows. `canMark` =
   `markPhase(...) === "open"`.
5. **"Clear check-ins".** When `checkin.count > 0`, a danger pill in the
   footer, left of Close (`:11676-11694`), styled like `eventCardDangerLink`.
   - It confirms through `ConfirmDialog` with:
     - message `clearConfirmLine(eventTitle)`;
     - `confirmLabel` `clearAll`, `busyLabel` `clearing`, `cancelLabel`
       `keepThem`.
   - Then `DELETE /api/events/[id]/checkin/marks`, and every row's
     `checked_in` goes false.

**`HereToggle`** (`HereToggle.tsx`, Batch 4) takes
`{ eventId, userId, name, checkedIn, canMark, onChange(next) }`.
- **The button:** `aria-pressed={checkedIn}`. `aria-label`:
  `${checkedIn ? "Checked in" : "Mark as here"}: ${name}`.
  - Pressed: a small green disc with a tick and the word "Here".
  - Not pressed: the outline pill "Mark as here".
  - Min 32 × 32.
- **When it hides:** not checked in and `!canMark` renders nothing (a
  walk-in can't be unchecked into the list).
- **Click:** optimistic `onChange(!checkedIn)`, then PUT or DELETE
  `/api/events/[id]/checkin/marks/[userId]`. On failure: `onChange` back,
  plus the request's toast.
- **Motion:** `SPRING_POP` on the disc when it turns on.

### 4.3 Officer door screen (phone and desktop, one page)

`src/app/campus/checkin/[id]/door/page.tsx` (3.7), drawn by `DoorView`
(`DoorView.tsx`, Batch 4).

**The root** is a `<main>`:
- `minHeight: 100dvh`, `--cream` background, `--charcoal` ink.
- Padding `max(16px, env(safe-area-inset-*))`.
- `data-holds-reload=""` while open, else `"false"`, so a deploy never
  reloads the door.
- No tab bar (CampusSwitch isn't mounted) and no portal.

**Header row:**
- Left: the event title (Fraunces 20, one line with an ellipsis) and the
  club name (13, `--ink-2`).
- Right: a "Done" link to `eventAnchorPath(id)`. Done hides the screen;
  check-in stays open.

**States:**

| State | Shows |
|---|---|
| `!canManage` | `doorNotOfficer` and "Go to the event". No feed is read. |
| loading (no feed yet) | `doorGettingCode` (`--ink-muted`) |
| failed read, no feed | `doorLoadFailed` and a `tryAgain` button |
| failed read, feed on screen | Keep the codes (still valid for up to 60 s); a small `doorReconnecting` line |
| before (`server_now < opens_at`) | `doorBefore` and `opensAtLine(time)` (local time, `toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })`) |
| in window, not open | `doorStartLead` and a big `startCheckin` button (min-height 56, coral) |
| open | the QR, the code, the countdown, the count and two buttons (below) |
| after (`server_now > closes_at`) | `doorAfter`, the count (`checkinCountLine(n, true, true)`, or `doorNobodyYet` at 0), and `seeWhoCame` linking to `/orgs/<handle>` (where Past events opens the list). Org-less: `goToEvent`. |

**Open layout:**
- **Phone (under 760 px),** one column:
  1. The QR tile: `#fff`, radius 16, padding 12, side
     `min(78vw, 46dvh, 420px)`.
  2. The code: `clamp(64px, 20vw, 128px)`, weight 800, `fontVariantNumeric: "tabular-nums"`,
     letter-spacing 0.12em.
  3. `newCodeInLine(s)` (15 px, `--ink-muted`).
  4. The count: `checkinCountLine(n, false, true)`, or `doorNobodyYet` at 0
     (20 px, 700).
  5. `doorLead` (14 px, `--ink-2`).
  6. The buttons: "Done" (outline) and "Stop check-in" (outline
     `--error-ink`). Stop has no confirm: Start again gives a fresh code.
- **760 px and wider:** two columns (QR left, the rest right), max-width 960,
  centred.
- **Arm's length:** the code at 64 px or more in `--charcoal` on `--cream`,
  and the QR at least 300 px on desktop.

**Accessibility:**
- **The code** sits in an element with `aria-live="polite"`,
  `aria-atomic="true"` and `aria-label={`Code ${spokenCode(code)}`}`, so each
  new code is read out digit by digit (one announcement per 30 s).
- **The countdown** isn't announced.
- **The count** isn't live: it's readable on focus.
- **The QR** is an `<svg role="img" aria-label="QR code to check in at {title}">`.
- **Escape** does nothing destructive.

**Motion:**
- The QR and the code are keyed by `step.starts_at` and enter with
  `initial={{ opacity: 0, y: RISE_PX }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SOFT}`
  (enter only, no exit animation).
- The count is keyed by `n`, scale 0.92 → 1 with `SPRING_POP`.

**Keeping the screen awake:** `useWakeLock(open)` (`use-wake-lock.ts`).
- Feature-detect `navigator.wakeLock`.
- `request("screen")` on open and again on `visibilitychange` back to
  visible.
- `release()` on close or unmount.
- Fail silently. Permissions-Policy already allows it (`next.config.ts:153-156`
  lists no `screen-wake-lock`).

**`useDoorFeed(eventId, enabled)`** (`use-door-feed.ts`, Batch 4) returns
`{ feed, failed, step, secondsLeft, busy, start, stop, reload }`.
- **Reads:** GET the door on mount, every `DOOR_POLL_MS` while
  `document.visibilityState === "visible"`, right away when the screen comes
  back into view, and right away when `doorStepNow` moves from `current` to
  `next` (to refill `next`).
- **Clock:** `skewMs = Date.parse(feed.server_now) - Date.now()`, taken at
  receipt. A one-second tick drives `step = doorStepNow(feed, Date.now(), skewMs)`
  and `secondsLeft = secondsLeft(step.ends_at, Date.now(), skewMs)`.
- **`start()`** POSTs the door and **`stop()`** DELETEs it. Each sets the
  feed from the answer, with `vibeRequest` not quiet:
  `failure: "Couldn't start check-in."` / `"Couldn't stop check-in."`.

**`QrCode`** (`QrCode.tsx`, Batch 4) takes `{ text: string; size: string; label: string }`.
- `qrPathFromMatrix` (`qr-path.ts`) turns `uqr`'s
  `encode(text, { ecc: "M", border: 4 })` matrix into one path: an `h1v1h-1z`
  square per dark module.
- It renders `<svg viewBox="0 0 N N" shapeRendering="crispEdges">` with a
  white `<rect>` and a black `<path>`. No `dangerouslySetInnerHTML` and no
  `data:` URL.
- Check `encode`'s result fields (`data: boolean[][]`, `size`) against
  `node_modules/uqr/dist/index.d.mts` after the install, and adapt
  `qr-path.ts` only.

### 4.4 The student's check-in page (the QR's landing)

`CheckinLanding.tsx` (Batch 3) takes
`{ event: { id; title; starts_at; ends_at; location: string; org: { name; handle } | null } | null; initial: CheckinViewerState | null; token: string | null }`.

**Layout:**
- One centred column, max-width 420, 16 px gutters, `--cream` / `--charcoal`.
- At the top: the eyebrow "Check in" (11 px uppercase `--tag-ink`), the
  title (Fraunces 26), "{club} · {time}" (14, `--ink-2`).
- **On mount:** if `token` is set,
  `history.replaceState(null, "", checkinPagePath(id))`, so the token leaves
  the address bar and a shared or screenshotted URL carries nothing.

**States** (`now` from `useCampusNow(15_000)`; 0 draws only the header):
1. **`event === null`:** `eventGone` and a `goToCampus` link (`/campus`).
2. **`state.checked_in`:**
   - A 56 px coral disc with a tick (pops once).
   - "You're checked in" in an element with `role="status"`.
   - The count line (from 5 up).
   - A primary link `goToEvent` (`eventAnchorPath`) and a subtle "Remove my
     check-in" (the same rules as the card).
3. **Phase `before`:** `opensAtLine(time)` and `goToEvent`.
4. **Phase `after`:** `landingClosed` and `goToEvent`.
5. **Phase `open`, `!state.open`:** `landingNotOpen`, and a `tryAgain` button.
   It re-reads GET, with a 3 s cool-down.
6. **Phase `open`, open:** `<CheckinCodeForm token={token} autoFocus={!token} …/>`.
   Success flips to state 2.

It never shows who else is there.

### 4.5 Settings: "Event check-ins" (any time)

`src/components/settings/CheckinsCard.tsx` (Batch 3) takes
`{ cardStyle: React.CSSProperties; title: React.ReactNode }`, like
`NotificationsCard`.
- **Mount:** in `SettingsClient.tsx`, right after `<BlockedUsersCard />`
  (`:151`):
  `<CheckinsCard cardStyle={CARD_GLASS} title={<SectionTitle>{CHECKIN_COPY.settingsTitle}</SectionTitle>} />`.
- **Reads** `GET /api/me/event-checkins` with `quiet: true`.
- **Shows:**
  - `settingsLead`, then one row per check-in: the title (14, 600) and
    "{club} · {Mon, Oct 20}" (12, `--ink-2`;
    `toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })`).
  - On each row, a "Remove" button. It turns into an inline "Remove" /
    "Keep" pair, then DELETEs `/api/events/[id]/checkin`, and the row
    leaves.
- **Empty:** `settingsEmpty`. **Failed:** `LoadFailed` with a retry.
  **Loading:** `loading`.

### 4.6 Club page: Past events

`src/app/orgs/[handle]/OrgPastEvents.tsx` (Batch 4) takes `{ orgId, orgHandle }`.
- **Mount:** in `page.tsx` `:522-529`, wrap `eventsColumn` in a fragment:
  `<OrgEventsSection … />` then `<OrgPastEvents orgId={org.id} orgHandle={org.handle} />`.
- **Reads** `GET /api/events?org_id=<id>&when=past&limit=10`, quietly.
  - It renders **nothing** on 401, on an error, or with no rows.
  - Otherwise: a section styled like `OrgEventsSection.tsx:99-130`, with the
    heading `pastHeading`.
- **One row per event:**
  - The title (14, 600, `#fff`) and the date (12,
    `rgba(255,255,255,0.6)`).
  - `checkinCountLine(ev.checked_in_count, true, ev.viewer_can_manage)`,
    when that isn't null.
  - For `viewer_can_manage`: a "Who came" pill that opens the exported
    `AttendeesModal` from `@/app/campus/campus-home` (the file already
    imports from there).
- This is where "N were there" lives after an event, and how officers reach
  "who came" once the card has gone.

### 4.7 Desktop Messages club panel: no change in v1

- **Why no change:** the club panel draws its own private card
  (`ClubPanel.tsx:164-219`, from `EventRef` in `src/lib/chat/types.ts:49-61`),
  not EventCard. During the event a student checks in from the door's QR,
  the Events card, or the code page.
- **Wave 2:** a "Check in" link pill beside the RSVP pill while
  `checkinPhase(...) === "open"`, pointing at `checkinPagePath(id)`. That
  needs no data change.
- **Also unchanged:** Tonight, LeftNav My Calendar, WeekBand and the static
  `/html` twins (they render no campus events).

## 5. Privacy Policy: the same-day update (Batch 5; Franky reviews before it ships)

**Order.**
1. Change the text first: `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`.
2. Then the page, word for word: `src/app/legal/privacy/*.tsx` (`page.tsx:1-3`).
   - In the TSX, "section 3c" becomes `<Sec to="3c">section 3c</Sec>`.
   - An apostrophe is `&apos;`.
   - Table rows are the `rows={[...]}` arrays.
3. Then the delete-account page.
4. Run the word-for-word checker against `next dev`:
   `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs --url http://localhost:3000/legal/privacy`.
   Commit its `report.txt` and `report.json`.
   - New dates: none besides the effective date, so `check/checks.mjs:99`
     doesn't change.
   - Table 1 (section 5) and table 4 (section 8) each gain one row, in both
     copies.

**Effective date:** `<SHIP DAY>`. Two places: `src/app/legal/privacy/page.tsx:24`
(`const EFFECTIVE_DATE = "<SHIP DAY>";`) and md line 3
(`Effective <SHIP DAY>`). Write the real date in the push that ships check-in.
- **No version bump:** `TERMS_VERSION` stays (no policy change since Oct 5
  has bumped it).
- **No email or in-app notice:** the new date at the top is enough (section
  13), the same as the Oct 18 club-model change. Franky's call.

**Changes, in the policy's words:**

1. **3c** (md:103, `sections-1-3.tsx:198-201`). Add a new bullet right after
   "Club events, your RSVPs (Going or Interested) and personal calendar
   entries.":
   > - Event check-ins: the club events you checked in at. You check in yourself, with the 4-digit code or the QR code on the club's check-in screen, or the club's owner or an admin marks you as here. We do not store the time you checked in or which way you did it.

2. **3e** (md:147, `sections-1-3-c.tsx:22-31`).
   - Replace "Three things come close." with "Four things come close."
   - Replace "And each report your browser sends to Sentry carries the
     browser's language and time zone." with:
   > Each report your browser sends to Sentry carries the browser's language and time zone. And an event check-in records that you were at that event while it was on (section 3c). Vibe does not ask your device where it is to check you in.

3. **Section 5 table** (md:212, `sections-4-5.tsx:119-122`).
   - In the left cell, "A club's follower list, and who RSVP'd to its events"
     becomes **"A club's follower list, who RSVP'd to its events and who
     checked in at them"**. The right cell doesn't change.
   - Add a new row right after it:
     **"How many people checked in at an event"** |
     **"Any signed-in account that can see the event, once at least 5 have
     checked in. The club's owner and admins see the exact number"**.

4. **5a** (md:228, `sections-4-5-a.tsx:52-55`). "…chats, RSVP lists and
   member lists." becomes **"…chats, RSVP lists, event check-in lists and
   member lists."**

5. **5b** (md:238, `sections-4-5-a.tsx:80`). "Club events, with Going and
   Interested totals." becomes **"Club events, with Going and Interested
   totals and, once at least 5 people have checked in at one, how many
   did."**

6. **5f** (md:290-296, `sections-4-5-c.tsx:20-37`).
   - "see four more lists:" becomes **"see five more lists:"**.
   - Add a new list item after "who RSVP'd to the club's events;":
   > - who checked in at the club's events, including people who are not members or did not RSVP, and who marked Going but did not check in;
   - In the paragraph after the list, insert this sentence right before "And
     they can delete any post made as the club.":
   > They can mark a person who marked Going or Interested as here, take one person's check-in off, and clear all of an event's check-ins.

7. **Section 6, Vercel** (md:354, `sections-6-8-companies.tsx:30-38`). After
   "Some web addresses carry personal details, such as search words or the
   link in one of our emails.", add:
   > Opening the link on a club's check-in screen puts that event in the log, with the time and your IP address.

8. **Section 8 table** (md:399-400, `sections-6-8.tsx:113-120`). Add a new
   row right after "RSVPs":
   **"Event check-ins"** |
   **"You remove yours, the club's owner or an admin takes it off or clears
   the event's check-ins, or the event, the club or your account is deleted.
   Leaving the club does not remove them"**.

9. **Section 9, "See and change"** (md:440, `sections-9-10.tsx`). After "If
   you do, you can read its Board as a follower can (section 5e).", add:
   > Settings lists the events you checked in at, and you can remove any of your check-ins there.

10. **Section 9, step 3** (md:461, `sections-9-10.tsx:100-103`). "your
    follows, club memberships and titles, RSVPs, blocks and mutes, club mutes
    included;" becomes **"your follows, club memberships and titles, RSVPs,
    event check-ins, blocks and mutes, club mutes included;"**.

11. **Section 9, "What do other people lose"** (md:469,
    `sections-9-10.tsx:122-128`). "…and each event takes everyone's RSVPs and
    its whole chat with it." becomes **"…and each event takes everyone's
    RSVPs, check-ins and its whole chat with it."**

12. **Delete-account page** (`src/app/legal/delete-account/page.tsx`).
    - `:194-195`: "Each event takes everyone's RSVPs and its whole chat with
      it." becomes **"Each event takes everyone's RSVPs, check-ins and its
      whole chat with it."**
    - `:207`: "RSVPs and personal calendar entries," becomes **"RSVPs,
      event check-ins and personal calendar entries,"**.

**Unchanged, on purpose:**
- **The short version, Start here, 4, 5e, 5g and 5h.** Checking in opens no
  chat, and only the people who run the club see the list.
- **3d "Abuse counts".** The new limiter counts are per account and day,
  deleted within three days.
- **3d "Error reports"** stays true because Batch 1 adds `checkin` to
  Sentry's scrubbed keys.
- **Section 7 (cookies):** no new cookie.
- **Section 8's lead-in:** nothing is deleted on a schedule.
- **The Terms** (`src/app/legal/terms/page.tsx` has no event or RSVP line).

**Tests that must change or be added:**
- None of the existing ones breaks. `cookie-notice.test.ts:114-125` and
  `leave-device-clean.test.ts:45-49` pin section 7 sentences, which don't
  change.
- **New:** `src/lib/legal/event-checkin-policy.test.ts`. Read both copies
  with whitespace folded (the `oneLine` idiom of `cookie-notice.test.ts`) and
  assert each one contains these apostrophe-free phrases:
  - "Event check-ins: the club events you checked in at"
  - "Four things come close"
  - "who checked in at them"
  - "once at least 5 have checked in"
  - "event check-in lists"
  - "see five more lists"
  - "including people who are not members or did not RSVP"
  - "Leaving the club does not remove them"
  - "RSVPs, event check-ins, blocks and mutes"
  - "you can remove any of your check-ins there"

  Also assert that no sentence containing "check-in" or "checked in" also
  contains "safety". Split on `. `; the policy already uses "safety"
  elsewhere, on purpose.

## 6. Tests to add

How to run them:
- **Unit and route tests:** `npm test` runs every `src/**/*.test.ts` with
  `node --test`.
  - Route tests live under `src/lib/...`, not next to the routes: a path
    with `[id]` never matches the glob.
  - They use the resolve-hook stub pattern of
    `src/lib/limits/social-limits.test.ts` / `src/lib/chat/pins-routes.test.ts`.
- **Database checks** run on the local stack only.
- **Every batch runs** `npm run typecheck`, `npm run lint` and `npm test`
  before it hands in.

| File | Batch | What it proves |
|---|---|---|
| `src/lib/events/event-checkin.test.ts` | 2 | Each item below. |
| `src/lib/events/checkin-migration.test.ts` | 2 | Each item below, read from the migration as text (the `src/lib/usage/migration.test.ts:16-27` idiom). |
| `scripts/sql/event-checkins-check.sql` | 2 | Each item below. |
| `src/lib/events/event-item.test.ts` | 2 | Each item below. |
| `src/lib/events/attendees-route.test.ts` | 2 | Each item below. |
| `src/lib/events/checkin-routes.test.ts` | 1 | Each item below. |
| `src/lib/sentry-config.test.ts` (edit) | 1 | Each item below. |
| `src/components/events/checkin/qr-path.test.ts` | 4 | Each item below. |
| `src/lib/legal/event-checkin-policy.test.ts` | 5 | Section 5's phrases in both copies, and no "safety" in a check-in sentence. |

**`event-checkin.test.ts`:**
- `checkinPhase` at each edge: start − 1 h − 1 ms is before; start − 1 h is
  open; end + 1 h is open; end + 1 h + 1 ms is after. A bad ISO or `now = 0`
  gives null.
- `markPhase` goes to end + 24 h.
- `sanitizeDoorCode`: a paste of " 12-3 4", and 5 digits cut to 4.
- `isDoorCode` / `isCheckinToken` shapes.
- `checkinLink` and the three paths.
- `checkinCountLine`: null, 0, 4 for a student vs an officer, 1 for an ended
  event ("1 was there"), and 5.
- `secondsLeft` with skew; `doorStepNow` picks current, then next, then null.
- `splitAttendees` ordering; `showCheckinSplit`.
- `parseCheckinStateRows` skips malformed rows; `checkinListFields`
  defaults.
- `CHECKIN_ERRORS` and `CHECKIN_COPY` never contain "safety", "location"
  or "where you are".

**`checkin-migration.test.ts`:**
- Exactly the two tables and the ten functions, each with `security definer`
  and `set search_path = ''`.
- `revoke all … from public` and `grant execute … to anon, authenticated, service_role`
  for each function; no `revoke execute` anywhere.
- `event_checkins`: `revoke all … from anon, authenticated, service_role`,
  then `grant select, delete … to authenticated` only.
- Sessions: a revoke, and no grant or policy.
- The three foreign keys use `on delete cascade`.
- `event_checkins`' create table holds no `timestamptz` and no `method`.
- `self_as` refuses `('anon', 'authenticated')` with `42501`.
- Every officer function refuses a null `auth.uid()` with `42501`.
- The numbers equal the TS constants:
  - `interval '1 hour'` against `CHECKIN_OPENS_BEFORE_MS` and
    `CHECKIN_CLOSES_AFTER_MS`;
  - `interval '24 hours'` against `CHECKIN_MARK_CLOSES_AFTER_MS`;
  - `/ 30` against `CHECKIN_STEP_SEC`;
  - `>= 5` against `CHECKIN_PUBLIC_FLOOR`;
  - `{4}` and `{22}` against the code and token lengths;
  - `for i in 0..1` (code) and `for i in 0..3` (token).
- The pre-flight's four md5s are present.

**`scripts/sql/event-checkins-check.sql`.** Copy the shape of
`scripts/sql/club-model-check.sql`:
- `\set ON_ERROR_STOP on` first.
- One transaction ending in ROLLBACK.
- The `inet_server_addr() is null` guard.
- Its own throwaway accounts through `auth.users`:
  - owner, admin, member;
  - 6 strangers, for both sides of 5;
  - one restricted (an `account_restrictions` row);
  - one officer who is then restricted.
- A verified live club with events:
  - a live one (start now − 30 min, end now + 2 h);
  - a future one (+1 day);
  - one that ended 3 h ago;
  - one that ended 25 h ago;
  - a hidden club's live event;
  - an org-less live event.
- `pg_temp.ok` / `pg_temp.run` helpers. Codes are derived as postgres from
  the session's secret at `floor(epoch(now())/30)` (`now()` is fixed inside
  one transaction, so steps never drift).

Cases:
- **open:** open / already_open / not_manager (member) / outside_window
  (future) / org_hidden / restricted officer; 42501 as anon.
- **self_as as service_role:**
  - checked_in with step s's code, then already;
  - wrong_code with step s−2's code, and with a code made to differ from
    both live ones. The secret is random per run, so skip the s−2 case if
    that code happens to equal derive(s) or derive(s−1);
  - checked_in with step s−3's token (a second account); link_expired with
    step s−4's;
  - outside_window (future); not_found (hidden club, missing event, an
    org-less event for a stranger); restricted; not_open after close;
    22023 for both or neither.
  - 42501 when called as authenticated.
- **door:** an officer gets codes equal to derive(s) and derive(s+1) and an
  exact here_count; a member gets not_manager.
- **state:**
  - non-manager count null at 4 check-ins, 5 at 5;
  - manager exact at 4;
  - viewer_checked_in true only for the viewer;
  - is_open false after close and false for the ended event.
- **RLS:**
  - a stranger reads only their own row; the owner reads all;
  - sessions read → 42501;
  - insert / update into event_checkins → 42501;
  - a stranger's DELETE of another's row touches 0 rows; their own touches 1.
- **mark:**
  - marked (going member), not_on_list (stranger without an RSVP), already;
  - allowed for the event that ended 3 h ago, outside_window at 25 h;
  - not_manager (member).
- **unmark and clear:** removed / cleared n / not_manager.
- **Cascades:** delete the event, and its check-ins and session are gone;
  delete one stranger from `auth.users`, and their check-ins are gone;
  delete the club, and its events' check-ins are gone.
- **mine:** lists only the caller's rows, newest event first.

The last line reads `event-checkins-check: all N cases passed`. Run it with
`docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/event-checkins-check.sql`.

**`event-item.test.ts`:** `toEventListItem` keeps the old keys in their old
order, then `checkin_open`, `checked_in_count`, `viewer_checked_in` last;
defaults are false / null / false without `checkin`.

**`attendees-route.test.ts`:**
- The limiter `eventAttendeesRead` comes right after getUser.
- A non-manager gets 403 before any RSVP or check-in read.
- `checked_in` flags are right; walk-ins exclude RSVP holders.
- `checkin.count` comes from the state RPC.
- A failed check-in read gives 500.

**`checkin-routes.test.ts`:**
- **POST:**
  - A malformed code gives 400 `checkin_code_format` with **no limiter in the
    log**; a malformed token gives 409 `checkin_link_expired`, also with no
    limiter.
  - Both or neither field: 400 `invalid_body`.
  - The order is limiter, then `requireNotRestricted`, then the service RPC.
  - The limiter key is `budget-eventCheckin:<uid>` with
    `{ limit: 20, windowSec: 86400, failClosed: true }`.
  - A refusal gives 429 `checkin_too_many_tries`; `reason: "unavailable"`
    gives 429 `checkin_unavailable`.
  - The service RPC gets `p_user` = the user's id, never anything from the
    body.
  - Each self word maps per 3.2.
- **DELETE:** goes through the viewer client with `.eq("user_id", uid)`, and
  has no Terms or restriction gate.
- **Door:**
  - GET uses `eventCheckinDoor`; its links are built from
    `http://localhost:3000` on a localhost request and from the site URL
    otherwise.
  - Each `status` maps per 3.3.
  - POST runs `orgOfficer`, then `requireNotRestricted`, then open, then the
    door read.
  - DELETE has no restriction gate.
- **Marks:** PUT and DELETE map per 3.4; clear gives `{ cleared }`.
- **Me** maps `org`.
- Every GET carries `cache-control: no-store`.
- No response body or log line ever holds a code or a token.

**`sentry-config.test.ts`:**
- `redactAuthTokens("https://www.connectvibe.app/campus/checkin/<uuid>?checkin=UVxxReBJ3ewsgZRtrv3ISQ")`
  ends `?checkin=[redacted]`.
- The encoded `next=` form is redacted too.
- `/api/me/school-checkin` is unchanged.

**`qr-path.test.ts`:**
- `encode(checkinLink("https://www.connectvibe.app", <uuid>, <22 chars>), { ecc: "M", border: 4 })`
  gives a square matrix.
- The path has one `M` per dark module, and the finder corners are dark at
  [4][4], [4][N−5] and [N−5][4].

## 7. What v1 leaves out (one line each)

- Arrival times, check-in methods and which officer marked someone: none of
  them is stored.
- Push or in-app notifications about check-in (none sent, either way).
- A check-in pill in the desktop Messages club panel, Tonight, My Calendar or
  the event chat header (wave 2; 4.7).
- Officer CSV export or attendance history across events.
- Store-app universal links for `/campus/checkin/*` (parked with the store
  work; Android already claims `/campus`).
- An in-app camera scanner (the phone's own camera opens the link).
- Location of any kind, and any "are you nearby" check.
- A per-network limiter (a whole party can share one campus Wi-Fi address).
- Check-in for events of hidden clubs.
- A "who came" list for org-less legacy events after their card has gone.
- Auto-closing a forgotten session: the window ends it, and the next start
  anywhere tidies it.
- Officers marking people who never RSVP'd (walk-ins check themselves in).

## 8. Batches

Nobody edits a file another batch owns. Every batch:
- reads `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/`;
- keeps each Write or Edit under about 150 lines;
- writes its notes to `handoffs/2026-10-19-checkin-build/batch-<n>.md` in
  small chunks;
- runs `npm run typecheck`, `npm run lint` and `npm test` before handing in;
- never writes to production, and never runs `supabase db push`, `db reset`
  or `migration up`.

### Batch 0: shared files (the orchestrator, verbatim, before anything else)

1. Write `supabase/migrations/20261019120000_event_checkins.sql` exactly as in
   section 1.
2. Write `src/lib/events/event-checkin.ts` exactly as in section 2.
3. Apply this change to `src/lib/limits/budgets.ts`. It's here, not in a
   batch, because batches 1 and 2 both call these budgets.

```diff
@@ -8,10 +8,11 @@
  *
  * Every number sits well above normal use: a student who pins, mutes and
  * reacts all evening never meets one. They stop a script looping one
- * account. Views, typing, read marks and the check-in have no budget here
- * on purpose: a per-account count of those would be an hour-by-hour record
- * of when someone is on Vibe (Privacy Policy 3d). They are bounded in the
- * database instead.
+ * account. Views, typing, read marks and the usage check-in (the heartbeat)
+ * have no budget here on purpose: a per-account count of those would be an
+ * hour-by-hour record of when someone is on Vibe (Privacy Policy 3d). They
+ * are bounded in the database instead. (Event check-in, below, is another
+ * thing: checking in AT AN EVENT.)
  *
  * Windows divide the day (src/lib/rate-limit.ts refuses any other).
  */
@@ -46,7 +47,24 @@
    * when (Privacy Policy, abuse counts). Normal use is a few dozen a day.
    */
   schoolEventsRead: { limit: 2000, windowSec: 86_400 },
-} as const satisfies Record<string, Pick<RateLimitOptions, "limit" | "windowSec">>;
+  /**
+   * Check in at an event with the door code or the QR link (POST
+   * /api/events/[id]/checkin). THE bound on guessing a 4-digit code: at most
+   * 2 codes work at once, so 20 tries is at most a 0.4% chance a day. Fails
+   * closed: a limiter that can't count must not mean unlimited guesses. A
+   * DAY window on purpose: the count says only that an account tried to
+   * check in that day, never when or where.
+   */
+  eventCheckin: { limit: 20, windowSec: 86_400, failClosed: true },
+  /** Remove your own event check-in. Day window, as above. */
+  eventCheckinRemove: { limit: 60, windowSec: 86_400 },
+  /** Read event check-in state: a card, the check-in page, Settings' list. Day window, as above. */
+  eventCheckinRead: { limit: 1000, windowSec: 86_400 },
+  /** The officers' door screen: one read every 10 s per open screen, so two screens fit. */
+  eventCheckinDoor: { limit: 180, windowSec: 600 },
+  /** An event's attendee list for its officers (re-read every 20 s while check-in can happen). */
+  eventAttendeesRead: { limit: 240, windowSec: 600 },
+} as const satisfies Record<string, Pick<RateLimitOptions, "limit" | "windowSec" | "failClosed">>;
 
 export type BudgetName = keyof typeof BUDGETS;
 
@@ -55,7 +73,10 @@
   return `budget-${budget}:${userId}`;
 }
 
-/** One count against an account's named budget. Lets through if the limiter can't count, as before. */
+/**
+ * One count against an account's named budget. Lets through if the limiter
+ * can't count, as before, unless the budget says `failClosed`.
+ */
 export function limitFor(budget: BudgetName, userId: string): Promise<RateLimitResult> {
   return rateLimit(budgetKey(budget, userId), BUDGETS[budget]);
 }
```

4. Apply the migration to the LOCAL stack (the two commands in its header).
   Expect three notices: `pre-flight ok`, `catalog post-check ok` and
   `behaviour post-check ok (undone)`. Then record the
   `schema_migrations` row.
5. Run `npm run typecheck` and `npm test` (the new file is pure; nothing
   should change). Then launch batches 1 to 5.

### Batch 1: server, new check-in routes

- **Owns:**
  - `src/lib/events/checkin-route.ts` (new, `import "server-only"`):
    `checkinFail`, the word maps of 3.2 to 3.4, `doorFeedFrom`,
    `readViewerState`, `parseCheckinBody`;
  - `src/app/api/events/[id]/checkin/route.ts`;
  - `src/app/api/events/[id]/checkin/door/route.ts`;
  - `src/app/api/events/[id]/checkin/marks/route.ts`;
  - `src/app/api/events/[id]/checkin/marks/[userId]/route.ts`;
  - `src/app/api/me/event-checkins/route.ts`;
  - `src/lib/sentry-config.ts`: add `checkin` to `AUTH_PARAM_KEYS` and name
    it in both doc comments;
  - `src/lib/sentry-config.test.ts`;
  - `src/lib/events/checkin-routes.test.ts`.
- **Needs:** Batch 0.
- **Done when:** the route tests pass, and a curl check against the local
  stack passes. Run `next dev` and use the session cookie; no production
  calls.
  - **The event:** as `avery@example.test`, create one through
    `POST /api/events` on `chat_seed_club` (verified, not hidden), starting
    10 minutes from now. The window is already open, and a new event may not
    start in the past (`validate.ts:118-126`).
  - **The check:** door POST gives a feed; POST checkin with the feed's code,
    as `blake@example.test`, gives `checked_in`; DELETE works.

### Batch 2: existing event routes, lists and the data checks

- **Owns:**
  - `src/app/api/events/route.ts`;
  - `src/app/api/events/[id]/route.ts` (only `itemFor` and its imports);
  - `src/app/api/events/[id]/attendees/route.ts`;
  - `src/lib/events/event-item.ts`;
  - `src/lib/events/event-checkin.test.ts`;
  - `src/lib/events/checkin-migration.test.ts`;
  - `src/lib/events/event-item.test.ts`;
  - `src/lib/events/attendees-route.test.ts`;
  - `scripts/sql/event-checkins-check.sql`;
  - `src/lib/events/event-route.test.ts`, edited only if its fake RPC needs
    to answer the new call.
- **Needs:** Batch 0, including the local apply, for the SQL check.
- **Done when:** the SQL check prints `all N cases passed` on the local
  stack, and every test is green.

### Batch 3: student UI

- **Owns:**
  - `src/components/events/checkin/use-checkin-state.ts`;
  - `src/components/events/checkin/CheckinCodeForm.tsx`;
  - `src/components/events/checkin/CheckinSheet.tsx`;
  - `src/components/events/checkin/CheckinSlot.tsx`, exporting
    `CheckinSlot({ ev }: { ev: CheckinCardEvent })` exactly;
  - `src/components/events/checkin/CheckinLanding.tsx`;
  - `src/app/campus/checkin/[id]/page.tsx`;
  - `src/components/settings/CheckinsCard.tsx`;
  - `src/components/settings/SettingsClient.tsx` (the import and the one
    mount line).
- **Needs:** Batch 0. At runtime, Batch 1's routes.

### Batch 4: officer UI and the card wiring

- **Owns:**
  - `package.json` and `package-lock.json`, through
    `npm install --save-exact uqr@0.1.3`: the one new dependency (D13);
  - `src/components/events/checkin/qr-path.ts`;
  - `src/components/events/checkin/qr-path.test.ts`;
  - `src/components/events/checkin/QrCode.tsx`;
  - `src/components/events/checkin/use-door-feed.ts`;
  - `src/components/events/checkin/use-wake-lock.ts`;
  - `src/components/events/checkin/DoorView.tsx`;
  - `src/app/campus/checkin/[id]/door/page.tsx`;
  - `src/components/events/checkin/StartCheckinAction.tsx`;
  - `src/components/events/checkin/HereToggle.tsx`;
  - `src/app/campus/campus-home.tsx` (only 4.1's three edits and 4.2's);
  - `src/app/orgs/[handle]/OrgPastEvents.tsx`;
  - `src/app/orgs/[handle]/page.tsx` (the `eventsColumn` mount only).
- **Needs:** Batch 0. `campus-home.tsx` imports Batch 3's `CheckinSlot`, so
  Batch 4 makes that edit last and runs its final typecheck once Batch 3 has
  handed in.
- **If it runs long,** the orchestrator can split it with no shared file:
  - 4a: the door, `package*.json` through `DoorView` and the door page;
  - 4b: `StartCheckinAction`, `HereToggle`, `campus-home.tsx`,
    `OrgPastEvents` and the org page.

### Batch 5: Privacy Policy (draft; Franky reviews)

- **Owns:**
  - `handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md`;
  - `src/app/legal/privacy/page.tsx`: the date line only, which keeps
    `<SHIP DAY>` until the ship push;
  - `src/app/legal/privacy/sections-1-3.tsx`;
  - `src/app/legal/privacy/sections-1-3-c.tsx`;
  - `src/app/legal/privacy/sections-4-5.tsx`;
  - `src/app/legal/privacy/sections-4-5-a.tsx`;
  - `src/app/legal/privacy/sections-4-5-c.tsx`;
  - `src/app/legal/privacy/sections-6-8-companies.tsx`;
  - `src/app/legal/privacy/sections-6-8.tsx`: the section 8 table only;
  - `src/app/legal/privacy/sections-9-10.tsx`;
  - `src/app/legal/delete-account/page.tsx`;
  - `src/lib/legal/event-checkin-policy.test.ts`;
  - `handoffs/legal-2026-10-04-privacy-v3/check/report.txt` and
    `report.json`.
- **Needs:** nothing but this contract.
- **The placeholder:** `<SHIP DAY>` makes the checker's date rule fail by
  design until the real date goes in. Run the checker once with a
  provisional date to prove everything else passes, then put
  `<SHIP DAY>` back. Note this in `batch-5.md`.

### After the batches (the orchestrator)

1. `npm run typecheck && npm run lint && npm test`. Then run the local SQL
   check again.
2. **The browser pass is not optional.**
   - **Setup:** `next dev` on the local stack, and an event created as
     avery on `chat_seed_club` starting 10 minutes from now
     (`?tonight_now=` won't do: the database's clock decides). Sign in at
     375 px wide as a non-admin student and, separately, as the club's
     owner.
   - **Owner:** Start check-in → the door page shows a QR, a code and a
     countdown. The code flips at :00 and :30. Stop works.
   - **Student, by code:** "Check in" on the card → the sheet → type the code
     → "You're checked in". Remove works.
   - **Student, by link:** paste the QR's link → "I'm here" → checked in. An
     old link, then the code box.
   - **Owner, after:** Manage attendees → the split lists, Mark as here,
     take one off, Clear check-ins.
   - **Elsewhere:** Settings shows the check-in, and removing it works.
   - **Past events:** the club page's block lists the seed's ended events
     (they ended 3, 5 and 10 days ago, with no count). The officer's "Who
     came" opens the list. The SQL check proves the from-5 count.
   - **Night mode,** on the door, landing and sheet.
   - **Never:** the word "safety", or any location prompt.
3. The phone-camera test can only happen on production (a phone can't open
   a localhost QR, and a Vercel preview can't sign in). It goes on Franky's
   list for after the ship.

### Before production: ask Franky, in plain words (do not apply before he says yes)

> Check-in is built and tested on the local database. To ship it I need to make one change to the live database: two new tables (who checked in at which event, and the secret that makes the door codes) and ten new functions. It doesn't touch any existing table or function, and nothing is deleted. I'll first run read-only checks (counts and fingerprints only), then apply it, then push the code and the Privacy Policy dated today in the same push. OK to apply it now?

On his yes, the main session only:
1. Run the PRE-CHECK reads in the migration header (connector `execute_sql`:
   catalog and md5s, never anyone's records).
2. Apply with the Supabase connector's `apply_migration`, sending the body
   without `begin;` / `commit;`.
3. Rename the connector's `schema_migrations` row to
   `20261019120000` / `event_checkins`.
4. Set `<SHIP DAY>` in `page.tsx:24` and md line 3. Re-run the policy
   checker until it passes.
5. Push. Commit and push without asking: Franky tests on the deploy.
6. Afterwards: a phone-camera check on a real event, and the handoff note.
