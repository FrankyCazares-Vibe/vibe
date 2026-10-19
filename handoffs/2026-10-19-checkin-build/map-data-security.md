# Event check-in: data + security map (lens: data and security)

Read-only map, Oct 19 2026. Nothing applied, nothing committed.

## 1. What exists today (events, RSVPs)

- `public.events` created in `supabase/migrations/20260430190000_phase1_initial_schema.sql:121-132`
  (id, org_id, creator_id, title, description, starts_at, ends_at, location, created_at; CHECK ends_at >= starts_at).
- The RSVP table is `public.rsvps` (NOT event_rsvps): same file `:134-141`
  (id, event_id FK events ON DELETE CASCADE, user_id FK public.users ON DELETE CASCADE,
  status in going/maybe/no, UNIQUE(event_id, user_id)); index `idx_rsvps_event` `:178`.
  "Interested" in the UI = status `maybe`.
- `events.creator_id` FK public.users ON DELETE CASCADE (`:124`).
- `events.org_id` FK was SET NULL; changed to ON DELETE CASCADE in
  `20260928110000_club_events_rules.sql:487-491` (deleting a club deletes its events, and their RSVPs).
- CHECKs on events (title 1..120, description <= 2000, location <= 200, length <= 14 days):
  `20260928110000_club_events_rules.sql:475-485`; `src/lib/events/manage.test.ts` reads that file.

### can_manage_event (current body)
`20260928110000_club_events_rules.sql:342-367`: SQL, STABLE, SECURITY DEFINER, `set search_path = ''`.
Club event -> caller is a CURRENT `org_members` owner/admin; org-less event -> caller is creator.
Mods do NOT manage events (product call 8). No `is_restricted_now()` check inside it (the delete policy adds that).
Granted EXECUTE to anon, authenticated, service_role (standing rule: never revoke EXECUTE; "grant, and refuse inside" — `:81-82`).

### event_visible / event_org_visible
- `event_visible(p_org_id, p_creator_id, p_event_id)` `:374-396`: not anon AND (org-less creator, OR club not hidden,
  OR caller is a member, OR caller holds an RSVP). Used by `events_select_visible` and `event_rsvp_counts`.
- `event_org_visible(p_event_id)` `:403-417` = `org_content_visible(event's org)` read past RLS
  (the comment at `:399-402` explains why an inline subquery would fail open: NULL org -> true).
- `rsvps_insert_own` / `rsvps_update_own` WITH CHECK = own user + not restricted + `rsvp_on_home_campus(event_id)`
  + `event_org_visible(event_id)` (`:419-436`).

### events write path
- UPDATE fully revoked from authenticated + policy dropped (`:451-457`).
- DELETE: `events_delete_manager` (`:442-449`): org-less -> creator; club -> current owner/admin, not restricted.
- INSERT: later closed for good in `20260928130000_events_insert_service_only.sql` (route writes with service role).

## 2. Migration conventions (from 20260928110000 as the house model)

- File name `YYYYMMDDHHMMSS_snake_slug.sql` (14-digit version, usually HH0000 steps per day).
- Long header: WHY THIS EXISTS (with handoff refs), WHAT THIS FILE DOES (numbered), DOES NOT, LIVE STATE
  (read-only MCP counts + md5(prosrc) of functions it rewrites), APPLY ORDER vs THE DEPLOY, ROLLBACK
  (one transaction, exact old bodies), LOCAL PROBES (role-by-role, BEGIN...ROLLBACK).
- Body: `begin;` `set local lock_timeout = '5s';` -> section 0 PRE-FLIGHT `do $$` (raise exception
  '<tag>: ...' on any drift, other permissive policies, md5 of helpers) -> numbered sections -> final
  POST-CHECK `do $$` (catalog: prosecdef, provolatile, proconfig = search_path="", grants via
  has_function_privilege / has_table_privilege / has_column_privilege; then behaviour probes with
  `set_config('request.jwt.claims', json_build_object('sub', ..., 'role','authenticated')::text, true)`)
  -> `notify pgrst, 'reload schema';` -> `commit;`.
- Functions: lower-case SQL, `security definer`, `set search_path = ''`, fully qualified `public.` names,
  `(select auth.uid())`, a `comment on function` naming the session and the mirror in src/.
- Production apply: memory says the Supabase connector's `apply_migration` works on prod with the body
  WITHOUT begin/commit; rename its auto-timestamp `schema_migrations` row to the file's version.

- Grant rule (rulings.md, repeated in every file): a new function first gets `revoke all ... from public`
  then `grant execute ... to anon, authenticated, service_role`; NEVER revoke EXECUTE from those roles
  (on this Postgres image a call without EXECUTE crashes the backend). The function refuses inside
  (`20260922100000_t1_count_and_visibility_fns.sql:465-489`, `20260927100000_rsvp_home_campus_rls.sql:30-33`).
  Service-only functions refuse with `if current_setting('role', true) in ('anon','authenticated') then raise
  exception 'not allowed' using errcode = '42501'` (pattern in `20261014120000_admin_usage_summary.sql`).
- Tests read migrations as TEXT (drift tests): `src/lib/usage/migration.test.ts:16-27` (strip `--` comments,
  flatten whitespace, lower-case, assert exact function headers / grants / refusals);
  `src/lib/events/manage.test.ts:102-103` reads `20260928110000`. Run: `npm test`
  (= `node --test` over `src/**/*.test.ts`, `--experimental-strip-types` style).
- Name clash to avoid: "check-in" already means the YEARLY SCHOOL-EMAIL check-in
  (`20261008140000_school_checkin.sql`, users.school_checkin_sent_at, email kind 'school_checkin',
  `/api/cron/school-checkin`, `src/lib/auth/school-checkin-job.ts`). And "the check-in" in `src/lib/limits/budgets.ts:11-13` and `20261016120000_views_as_service.sql:6-7` is a THIRD meaning: the usage day tally (`usage_touch`, `20261014150000`). `src/lib/limits/budgets.ts:11-13`
  says "the check-in has no budget here on purpose" about THAT one. Use `event_checkin*` everywhere.

## 3. Visibility (who "may see the event")

- `events_select_visible` = `event_visible(org_id, creator_id, id)` (`20260922110000_t1_close_world_readable_selects.sql:302-304`,
  body `20260928110000:374-391`). Not anon; org-less -> creator only; club -> not hidden OR caller is a member; OR caller has an RSVP.
- Write gates on RSVPs (the model for check-in): `auth.uid() = user_id`, `not is_restricted_now()`,
  `rsvp_on_home_campus(event_id)` (`20260927100000:135-160`), `event_org_visible(event_id)` (`20260928110000:403-417`).
  `org_content_visible` lets members AND platform admins of a hidden club through (`20260922140000_hidden_club_content_rls.sql:452-481`);
  the RSVP route then 404s them (`src/app/api/events/[id]/rsvp/route.ts:61-71`), i.e. DB looser than the route there.
- Campus: event campus = club campus, else creator's; refused only if both known and differ; members of the club always pass
  (`rsvp_on_home_campus`; TS twin `rsvpCampusDecision` in `src/lib/iu/campus-request.ts`). Shared Indianapolis is ONE campus row.
- "Audience" (both / IU only / Purdue only) is a JOIN label, not a visibility gate: `20260916120000_org_followers.sql:70-73`.
- Unverified clubs cannot post events at all (`src/app/api/events/[id]/route.ts:337-338`, old INSERT policy `20260928110000:463-473`;
  INSERT now service-only, `20260928130000_events_insert_service_only.sql`). So "unverified club" events do not exist;
  hidden (test) clubs do: 3 events on hidden clubs as of Sept 27.
- There is no members-only EVENT flag in the schema (no `members_only` column on events); "members-only" today means
  club rooms/Board (`20261017110000_board_follower_read.sql`, `20261017120000_member_lists_members_only.sql`).
  If check-in must respect a future members-only event, put the gate in ONE helper (see section 5, `event_checkin_allowed`).
- Restricted (suspended/banned) accounts: `is_restricted_now()` (`20260923090000_moderation_foundation.sql:1974-1995`);
  `can_publish_now()` = terms + age + school_verified + not restricted (`:2028-2049`).
- Blocks: `20260928120000_blocks_in_rls.sql` does not touch rsvps/events; the attendee list is not block-filtered today.

## 4. Deletion paths

- Event deleted -> `rsvps_event_id_fkey ON DELETE CASCADE` (`20260430190000:136`). DELETE /api/events/[id] first reads the
  RSVPs to send `event_cancelled` notices (`20260930100000_event_cancel_notices.sql:1-9`, `src/lib/events/notify-cancel.ts`).
  An `event_checkins.event_id ... on delete cascade` rides the same delete. Club deleted -> events cascade
  (`20260928110000:487-491`) -> check-ins cascade.
- Account deleted: `DELETE /api/me` (`src/app/api/me/route.ts:26-62`, `:169` `admin.auth.admin.deleteUser`) ->
  auth.users -> `public.users` (FK ON DELETE CASCADE, `20260430190000:12`) -> every table whose user FK is
  `references public.users(id) on delete cascade`. Same path for the yearly school-email job
  (`src/lib/auth/school-checkin-job.ts`). So `event_checkins.user_id references public.users(id) on delete cascade` is enough;
  no code change in /api/me.
- TRAP (`20260923090000_moderation_foundation.sql:1875-1892`): an FK `on delete set null` plus a trigger that refuses UPDATE
  makes account deletion FAIL. Do not add a "marked_by officer" FK with SET NULL on a table that has an update-refusing
  trigger. Simplest: store only `method` ('code'|'qr'|'officer'), never which officer.

## 5. Proposal: tables

One migration, e.g. `supabase/migrations/20261019100000_event_checkins.sql` (house header + pre-flight + post-check).
pgcrypto 1.3 is in schema `extensions` on local (read-only catalog check Oct 19); bodies use `extensions.hmac`,
`extensions.gen_random_bytes` fully qualified (search_path ''). Production must be checked the same way (counts/settings only)
before the apply.

### 5a. public.event_checkins (the attendance record; kept until the club deletes it)
```sql
create table public.event_checkins (
  event_id uuid not null references public.events (id) on delete cascade,   -- event or club deleted -> gone
  user_id  uuid not null references public.users  (id) on delete cascade,   -- account deleted -> gone
  method   text not null check (method in ('code', 'qr', 'officer')),
  primary key (event_id, user_id)
);
create index event_checkins_user_idx on public.event_checkins (user_id);    -- account-delete cascade + "mine"
alter table public.event_checkins enable row level security;
revoke all on table public.event_checkins from anon, authenticated, service_role;
grant select (event_id, user_id, method) on public.event_checkins to authenticated;
grant delete on public.event_checkins to authenticated;
-- NO insert/update grant: only the two SECURITY DEFINER functions write rows.
create policy event_checkins_select_own_or_manager on public.event_checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_event(event_id));        -- mirrors rsvps_select_own_or_manager
create policy event_checkins_delete_own_or_manager on public.event_checkins
  for delete to authenticated
  using (user_id = (select auth.uid())                                                -- remove own: never gated
         or (public.can_manage_event(event_id) and not public.is_restricted_now()));  -- unmark one / clear all
```
- NO time column (recommendation): the row says THAT you came and how, not when you arrived. Officers do not need arrival
  times, and "nothing about where a person is" reads cleanest as "not when, not where". If Franky wants "arrived 7:42" on the
  officer list, add `checked_in_at timestamptz not null default now()` and a Privacy Policy line for it.
- NO "which officer marked you" column (moderation FK trap above, and minimisation). `method = 'officer'` is enough.
- Removal from a club does NOT touch check-ins (the trigger `org_members_drop_club_access`,
  `20260928100000_club_membership_rules.sql:307-316`, drops only UPCOMING RSVPs; leave it alone). Hidden club: rows stay, like RSVPs.
- Embed for the officer list (cookie client, same as attendees): `users!event_checkins_user_id_fkey!inner(id,name,handle,avatar_url,major,year)`;
  restricted accounts drop out of it exactly as they do from the attendees list.

### 5b. public.event_checkin_sessions (the rotating-code secret; nobody but the functions reads it)
```sql
create table public.event_checkin_sessions (
  event_id  uuid primary key references public.events (id) on delete cascade,
  secret    bytea not null default extensions.gen_random_bytes(32) check (octet_length(secret) = 32),
  opened_at timestamptz not null default now()
);
alter table public.event_checkin_sessions enable row level security;
revoke all on table public.event_checkin_sessions from anon, authenticated, service_role;
-- NO grant, NO policy (the usage_day_tally pattern, 20261014150000_usage_day_tally.sql:336-339).
```
- A row = check-in is open. Close = DELETE the row: the secret dies, every code/QR already shown stops working, misses reset.
- No `opened_by` column (no officer id, nothing to cascade, nothing to show).
- "Open" is also bounded by the window in every function (now() between starts_at - 1 h and ends_at + 1 h), so a session an
  officer forgets to close stops working on its own. Housekeeping: `event_checkin_open` first deletes sessions whose event
  ended more than 1 h ago (no new cron; the secret is not personal data, this is just tidiness).

### 5c. public.event_checkin_misses (wrong-code cap that fails CLOSED)
```sql
create table public.event_checkin_misses (
  event_id uuid not null references public.event_checkin_sessions (event_id) on delete cascade,  -- close -> gone
  user_id  uuid not null references public.users (id) on delete cascade,
  misses   smallint not null default 0 check (misses between 0 and 10),
  primary key (event_id, user_id)
);
-- RLS on, revoke all from anon, authenticated, service_role; no grant, no policy.
```
- WHY in the database: `rateLimit` lets everything through when it cannot count (`src/lib/rate-limit.ts:174,182`), and a
  4-digit code is 10,000 guesses. 5 misses per person per open session -> "Ask an officer to mark you as here".
  With 2 valid codes at any moment (current + previous 30 s step) that is about a 0.1% chance per account per session.
- No timestamp: it counts, it does not log when. Deleted with the session.

## 6. Proposal: functions (RPCs)

Shape chosen: CALLER = `auth.uid()` (cookie client), like `can_manage_event` / `event_rsvp_counts`, so every vetted helper is
reused as is (`can_manage_event`, `event_visible`, `event_org_visible`, `is_restricted_now`, `has_recorded_consent`, all of which
read auth.uid() and would answer "nobody" under the service role). Every bound that matters (wrong-code cap, window, open
session) lives INSIDE the database, so a direct PostgREST call gets nothing a route would refuse. (Alternative: the Oct 16
`*_as(p_user, ...)` service-only pattern, `20261016120000_views_as_service.sql:1-60`; it would need a p_user copy of each
helper above. Not recommended here: more code, more drift, and the DB caps already bound the direct path.)

All: `language plpgsql`, `security definer`, `set search_path = ''`, `public.`/`extensions.` qualified;
first line `if (select auth.uid()) is null then raise exception 'not allowed' using errcode = '42501'; end if;`
(anon AND service role refused); `revoke all ... from public; grant execute ... to anon, authenticated, service_role;`.
Outcomes come back as a TEXT status the route maps to HTTP, never a raise, because a raise would roll back the miss count.

| function | who | does |
|---|---|---|
| `event_checkin_derive(p_secret bytea, p_event_id uuid, p_step bigint) returns table(code text, token text)` | pure, plain SQL immutable, harmless without the secret | code = `lpad((('x'||encode(substring(extensions.hmac(convert_to(event_id||':'||step||':code','UTF8'), secret,'sha256') from 1 for 4),'hex'))::bit(32)::bigint % 10000)::text, 4, '0')`; token = 16 bytes of the `':qr'` HMAC, base64url, 22 chars. Both expressions tried read-only on local Oct 19 (`9129`, `b02yngxjRD5NDL30SXdXgA`). step = `floor(extract(epoch from now()) / 30)` |
| `event_checkin_open(p_event_id) returns text` | `can_manage_event` and not `is_restricted_now()` and club not hidden (`org_hidden`, as the edit route) | inside window only (`outside_window`); deletes sessions of events that ended > 1 h ago; `insert ... on conflict do nothing` (idempotent: a second officer opening keeps the first one's codes) -> `open` |
| `event_checkin_close(p_event_id) returns text` | `can_manage_event` (restriction NOT checked: closing only takes away) | deletes the session row (misses cascade) -> `closed` |
| `event_checkin_screen(p_event_id) returns table(code, token, step_ends_at timestamptz, next_code, next_token, here_count int)` | manager, not restricted, session open, inside window; else NO rows (route: 409 `not_open`) | current + next step's code/token so the screen flips on time with one fetch per 30 s; `here_count` exact |
| `event_checkin_self(p_event_id uuid, p_code text default null, p_token text default null) returns text` | any signed-in caller who may see the event | exactly one of code/token (22023 otherwise). Order: event exists and `event_visible(...) and event_org_visible(id)` else `not_found` (hidden = missing, as RSVP's 404); `is_restricted_now()` -> `restricted`; not `has_recorded_consent()` -> `terms_required`; window -> `outside_window`; session `select secret ... for key share` (close can't delete it mid-call -> no 23503/500) else `not_open`; already in -> `already`; misses >= 5 -> `locked`; code `^[0-9]{4}$` against steps {s-1, s}; token `^[A-Za-z0-9_-]{22}$` against {s-3..s} (about 2 min for camera -> browser -> app); miss -> upsert misses+1 -> `wrong_code` / `locked`; hit -> insert method 'code'/'qr' on conflict do nothing -> `checked_in` |
| `event_checkin_mark(p_event_id, p_user_id) returns text` | manager, not restricted | target must hold an RSVP (going or maybe) on this event, else `not_on_list` (an officer can't put a stranger on the record); officer window (OPEN CALL 2); works with no session open (the backup when phones die); insert 'officer' on conflict do nothing (a self check-in keeps its method) -> `marked` / `already` |
| `event_checkin_state(p_event_ids uuid[]) returns table(event_id, is_open boolean, checked_in boolean, here_count integer)` | events the caller can see (`event_visible`), max 1000 ids (22023), STABLE | `is_open` = session row and inside window; `checked_in` = caller's own row; `here_count` = exact for `can_manage_event`, else `case when n >= 5 then n end` (NULL below 5; the app shows nothing) |

Unmark one, clear all, remove own: plain DELETE through the RLS policy in 5a on the cookie client. The "clear all" route must
check `can_manage_event` FIRST: for a non-manager the same DELETE would quietly remove only their own row.

### Counts with the 5+ floor, without rows
`event_checkin_state` is the only way a non-manager learns anything, and it returns a number or NULL, never ids (same shape as
`event_rsvp_counts`, `20260922100000:370-391`). Non-managers hold no SELECT on anyone else's rows (policy 5a). Serve it inside the
existing GET /api/events and GET /api/events/[id] responses rather than a new route (no new budget, one round trip).
Known and accepted: the floor can be differenced (count is NULL at 4, 5 after I check in -> 4 others), the same as every floor in the app.

### Route budgets (house rules: `src/lib/limits/budgets.ts`, no IP, windows divide 86,400)
- Student check-in and remove-own: new `eventCheckin: { limit: 30, windowSec: 86_400 }`. A DAY window on purpose, like
  `schoolEventsRead` (`budgets.ts:43-48`): the limiter row says only that an account tried a check-in that day, never when.
- Officer open / close / screen poll / mark / unmark / clear / list: existing `orgOfficer` (300 per 600 s); a screen polling
  every 30 s uses 20 of it per 10 min.
- The limiter fails open; the DB miss cap is the real guard.

## 7. Other security notes

- QR link: `https://<app>/events/<id>/here#t=<token>` (path is the routes lens's call). Token in the FRAGMENT, so it never
  reaches Vercel request logs or a Referer; never a user id in the URL. Signed out: the fragment is lost through /login, so
  the page says "Sign in, then scan again" (the token is 2 minutes old by then anyway).
- No location, no camera inside the app: the phone's own camera opens the link. A code can still be texted to a friend who
  is not there; rotation limits that to about a minute (code) or two (QR), and officers can unmark anyone. Say it plainly in
  the officer copy; never call any of this a "safety" check.
- Build the QR on the officer's screen from an npm package bundled with the app. A QR image from an outside host would need
  a CSP entry in `src/lib/csp.ts` AND would send the token to that host. Don't.
- Restricted (suspended/banned) officers: open/screen/mark/unmark/clear refused; close allowed. Restricted students: can't
  check in, can always remove their own (the RSVP DELETE rule, `rsvp/route.ts:186-197`).
- Blocks are not applied to the attendee list today; the check-in list follows the same rule (no change).

## 8. Privacy Policy: exact places that change the same day

- `src/app/legal/privacy/sections-1-3.tsx:199` (what we collect): add check-ins: "whether you checked in to an event and how
  (the door code, the QR code, or an officer marking you as here). Not when you arrived, and nothing about where you are."
- `src/app/legal/privacy/sections-4-5-c.tsx:27` (what owners/admins see): add "who checked in to the club's events, and who
  said Going and didn't check in".
- `src/app/legal/privacy/sections-4-5.tsx:120` (who sees what): new row "Who checked in to an event" -> "The club's owner and
  admins. Anyone who can see the event sees only how many were there, from 5 up."
- `src/app/legal/privacy/sections-6-8.tsx:114` (how long): new row "Check-ins" -> "Until you remove yours, the club clears
  the event's check-ins, or the event, the club or your account is deleted. Leaving the club does not remove them."
- `src/app/legal/privacy/sections-9-10.tsx:101` and `:127`, `src/app/legal/delete-account/page.tsx:194` and `:207`
  (what account / event deletion removes): add "check-ins" next to RSVPs.
- Plus the policy's own date / change note (whoever drafts the text).

## 9. Test and apply plan

- Drift test `src/lib/events/checkin-migration.test.ts` (the `src/lib/usage/migration.test.ts` style): the three tables
  revoke all from anon/authenticated/service_role; sessions and misses have no grant and no policy; event_checkins grants
  only select(event_id,user_id,method) + delete; no time column; every function `security definer set search_path = ''`
  and refuses a null auth.uid() with 42501; EXECUTE to the three roles; `>= 5` floor; 1000-id cap; wrong code RETURNS;
  `for key share`; steps {s-1,s} for code and {s-3..s} for token.
- Local probes only (`docker exec supabase_db_vibe psql`, each in BEGIN ... ROLLBACK as `authenticated` with
  `request.jwt.claims`): stranger reads sessions/misses -> 42501; direct INSERT into event_checkins -> 42501; 5 wrong codes ->
  `locked`; code from 2 steps back refused, QR from 3 back accepted; outside window; hidden-club non-member `not_found`;
  restricted `restricted` but own DELETE works; demoted officer: screen empty, list empty, mark refused; mark on a non-RSVP
  user `not_on_list`; close kills codes and misses; event / club / account deletion cascade the rows; count NULL at 4,
  5 at 5, exact for a manager.
- Local DB caveat: `supabase_migrations.schema_migrations` there stops at 20261008140000 although later files' objects exist
  (e.g. `record_post_view_as`, `org_members.show_on_profile`). Check by catalog, not by the version table. Local helper md5s
  (Oct 19): can_manage_event f09163bbf84c24ae3c17d7922ce9c2e7, event_visible ca3d34f65cb01af1a826df053d97b384,
  event_org_visible 3e835aea7286e0048959ea491ac103d8; production must match before the apply.
- PRODUCTION: ask Franky first. Pre-read counts/settings only: the three names absent (`to_regclass`), pgcrypto in
  `extensions`, the three md5s above. Apply with the connector's `apply_migration` (body without begin/commit), rename the
  `schema_migrations` row to the file version. Order: migration BEFORE the deploy (old code never names the new tables).

## 10. Open calls for Franky (each with a recommendation)

1. Store arrival time? Recommend NO (the row says that you came and how).
2. Officer "Mark as here" window: recommend from 1 h before start until 7 days after the end (the event chat's 7 days), so the
   backup works for the officer who reconciles the next morning; students only in the 1 h window while check-in is open.
3. Campus visitors: his words were "anyone who may see the event", and visitors may see it, so recommend NO home-campus gate
   (unlike RSVP). Say so in the build notes so nobody "fixes" it.
4. Officer re-marks someone who removed their own check-in: recommend allowed (keeping a "they removed it" record would be one
   more thing stored about the student).
