# Wave 2 as-is: the database after migration A (reader "database-map", S70, 2026-09-30)

Written in a CLOUD session: no database, no docker, no `.env.local`. Every fact below comes
from the repo (migration files, `handoffs/chat-redesign/wave-1-asis.md` = "asis", the
wave-1 build notes) and is cited as `path:line`. Nothing here was run. "A" = migration
`supabase/migrations/20261001100000_chat_v2_rooms.sql` (1,964 lines), applied on production
Sept 30 00:13 UTC (`handoffs/2026-09-30-session-69-close-chat-wave-1-live.md:3,28`).
"B" = the wave-2 file `20261001110000_chat_v2_cards.sql`, pinned by
`handoffs/chat-redesign/wave-1-contracts.md:273-337` (section 4) and this map.

Sections: 1 migration files and numbering · 2 the house style A sets · 3 what A left in the
database (columns, constraints, indexes, triggers, functions, policies) · 4 the fingerprints
B's PRE-FLIGHT compares · 5 the older tables wave 2 reads (blocks, users, orgs,
channel_members, org_channel_members, message_reactions, reports, moderation_actions,
notifications, events, rsvps, org_members) · 6 idioms (refuse inside, standing rule,
search_path, TimeZone) · 7 what a direct PostgREST read returns today (D1/D2) · 8 what B's
PRE-FLIGHT must check and what its POST-CHECK can probe · 9 surprises.

---

## 1. Migration files, numbering, the local tracking table

- `supabase/migrations/` holds **97 files** (`ls | wc -l`). Files after `20260930100000`:
  **exactly one**, `20261001100000_chat_v2_rooms.sql` (`ls supabase/migrations | awk '$0 > "20260930100000"'`).
- **`20261001110000` is free** (no file matches `ls supabase/migrations | grep 20261001110000`).
  The contract names that number for B and says "renumber if another file lands first"
  (`wave-1-contracts.md:275`); nothing landed, so no renumbering.
- None of B's object names exist in any migration: `grep -n 'chat_polls\|chat_poll_options\|chat_poll_votes\|chat_votes_drop_access\|chat_create_poll\|chat_cast_vote\|chat_create_event_card\|chat_reply_counts' supabase/migrations/*.sql` is empty.
- Local `supabase_migrations.schema_migrations` (asis 6.2, `wave-1-asis.md:841-855`): columns
  `version text not null, statements text[], name text`; the local database holds objects of
  19 files that have NO row there. Consequence written into A itself: "Catalog reads only
  (never schema_migrations: the local database has the 20260927 objects without their rows)"
  (A:397-398). A PRE-FLIGHT tests the catalog (`information_schema.columns`, `pg_proc`,
  `pg_policies`, `pg_constraint`, `pg_trigger`), never `schema_migrations`.
- Production `schema_migrations` had 94 rows, max `20260930100000`, before A (asis 11.4,
  `wave-1-asis.md:1694`); A's apply then inserted `('20261001100000', 'chat_v2_rooms')`
  (A:201-203; live per the S69 close, line 3). B records itself the same way:
  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261001110000', 'chat_v2_cards');`
  as a SEPARATE Management API request after the file (apply recipe:
  `20260926100000_users_profile_layout.sql:74-85`, quoted by A:199-203 and asis 6.4).
- Local apply convention: `psql -f` into the docker container (asis 6.2 (b); the after-deploy
  script's own recipe `scripts/sql/chat-v2-after-deploy.sql:19-20`:
  `docker exec -i supabase_db_vibe psql -U postgres -d postgres -f - < ...`). Mac only.
- The read-only Supabase MCP role cannot call `can_view_org_channel` / `can_post_org_channel`
  and cannot `set role` (S69 close, "Gotchas", line 60): B's behaviour probe runs inside the
  file (as `postgres`), never through the MCP.

---

## 2. The house style A sets (copy it for B)

### 2.1 Header sections, in order (A:1-386, all `-- ` comment; anchors verified by grep)

| section | A lines | what it holds |
|---|---|---|
| title: session, batch, contract reference | 1-3 | `-- S69 club chat v1, wave 1, batch B1a (contract: section 3 of ...)` |
| `WHY THIS EXISTS.` | 5-11 | Franky's calls behind it |
| `WHAT IT DOES (statements in the order ...)` | 13-45 | numbered 0 PRE-FLIGHT .. 10 notify; one item per step |
| `DOES NOT:` | 47-64 | what is left alone (SELECT policies, grants, the allow-list, blocks) |
| `LIVE STATE (...)` | 66-122 | what was read, where, when; md5s BEFORE and AFTER; production counts; the dry run; the local rehearsal |
| `PRE-CHECK (read-only, on production, on the apply day ...)` | 124-176 | four SELECTs the applier runs first, with expected answers |
| `APPLY ORDER vs THE DEPLOY:` | 178-203 | before/after the deploy, what old code does on the new schema, locks, the curl recipe, the schema_migrations INSERT |
| Management API note | 205-208 | "everything that must stop the apply is a RAISE EXCEPTION"; a second run stops with "already applied" |
| `CHECK AFTER APPLYING (read-only, a UTC session):` | 210-227 | the APPLY RECORD query, a counts query, the after-deploy script |
| `ROLLBACK (...)` | 229-348 | one transaction; MANUAL STEPS marked; ends with the schema_migrations DELETE and `NOTIFY pgrst` |
| `COST (contract section 11, gate 3).` | 350-386 | EXPLAIN ANALYZE numbers |

### 2.2 Body skeleton (A:388-1964)

```
begin;                                            -- A:388
set local lock_timeout = '5s';                    -- A:394 (comment 390-393 names the locks)
do $$ ... end $$;                                 -- 0. PRE-FLIGHT, A:396-702
-- 1. .. 7. numbered steps, each headed "-- N. <name> (contract 3.x) ----"   A:704-1509
do $$ ... end $$;                                 -- 9.1 POST-CHECK by reading, A:1511-1781
do $$ ... end $$;                                 -- 9.2 POST-CHECK BY BEHAVIOUR, A:1783-1935
do $$ ... end $$;                                 -- 9.3 APPLY RECORD, A:1937-1959
notify pgrst, 'reload schema';                    -- A:1961-1962 (delivered at commit)
commit;                                           -- A:1964
```
(Step 8 does not exist in A: 3.8 "moved out", `wave-1-contracts.md:223`.)

### 2.3 Conventions inside the body

- **Error prefix**: every `raise exception` starts with the file tag, `'chat-rooms: ...'`
  (e.g. A:425, 432, 438). B's tag is `chat-cards:` (`wave-1-contracts.md:275`). Earlier tags:
  `event-cancel:`, `club-chat-posts:`, `mod-a:`, `blocks-rls:`, `image-actions:` (asis 6.4).
- **Already-applied guard first** (A:421-426): `if exists (select 1 from information_schema.columns where ... column_name = 'kind') then raise exception 'chat-rooms: already applied (channels.kind exists). Nothing to do; run scripts/sql/chat-v2-after-deploy.sql'`.
  It runs BEFORE the fingerprint check because a second run "would stop at check a with
  'can_view_org_channel drifted', which points the wrong way" (A:419-420). For B: test
  `to_regclass('public.chat_polls') is not null`.
- **Fingerprints** (PRE-FLIGHT a, A:428-441): `select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)')`
  (A:430-431) — "(md5(pg_get_functiondef), not md5(prosrc))" (A:429). Then
  `if fp is distinct from '<md5>' then raise exception 'chat-rooms: can_view_org_channel drifted (md5 %); re-read it first', coalesce(fp, '(missing)')` (A:432-434).
- **Policies by exact text** (PRE-FLIGHT b, A:443-495): `$w$...$w$` constants declared at A:403-413 (`was_org`, `was_dm`, `was_del`), read with `select with_check into got from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = '...' and cmd = 'INSERT'`, compared `is distinct from`; the POST-CHECK constants (`want_*`, A:1519-1537) are "copied by script from pg_policies after a local rehearsal ... never typed by hand. An empty constant = the check prints the three deparsed texts and raises 'policy constants are empty' (how the first rehearsal ran)" (A:1514-1518).
- **OR-around guard**: `string_agg(policyname, ', ')` of every other PERMISSIVE policy for the command; any = raise (inside b, A:443-495).
- **RLS on**: `pg_class.relrowsecurity` for every touched table (inside b).
- **Grants read first, then again at the end**: `has_table_privilege('authenticated', 'public.messages', 'UPDATE') or ...` (end of b; again in POST-CHECK g, A:1760-1768).
- **Every name is free** (PRE-FLIGHT c, A:497-564): columns via `information_schema.columns`; constraints via `pg_constraint ... conname in (...)` INCLUDING the auto-named FKs (`channels_event_id_fkey`, `messages_thread_root_id_fkey`, `messages_card_event_id_fkey`); indexes via `pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in (...)`; functions via `pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (...)`; triggers via `pg_trigger t where not t.tgisinternal and t.tgrelid in (...) and t.tgname in (...)`; then "the trigger chains were traced against this exact set": any trigger on the five tables outside the known list = raise, and `org_members` must have exactly 4.
- **Data-shape guards** end with `Stop and ask Franky` (d, A:566-610; g, A:684-691); **row guards** `if n > 60 then raise exception '... far more than this file was written for (60)'` (h, A:693-702; step 7: rooms > 60 or rows > 400).
- **Values carried between DO blocks**: `perform set_config('chat_rooms.<key>', <text>, true)` and `current_setting('chat_rooms.<key>', true)` (A:617-618, 645-648, 1505, 1831, 1928).
- **Step comments** cite the contract section and say what is deliberately not done (A:704-707, 738-741, 847-860).

### 2.4 POST-CHECK by reading (A:1511-1781), what it re-reads

a rooms (A:1549-1570) · b the invariant + no row that should not exist + no media (1572-1610) ·
c SAE (1612-1641) · d the three policies read as the `want_*` texts, `roles = array['authenticated']::name[]`, `qual is null` for INSERT policies, and the permissive INSERT set on `messages` is exactly `messages_insert_member, messages_insert_org_member` (1643-1681) ·
e every new function is `prosecdef`, has the expected `provolatile` ('s' / 'v') and `proconfig` (`array['search_path=""', 'TimeZone=UTC']` etc.), the two policy-called functions re-read by md5 (`want_view`, `want_post`; an empty constant prints both md5s and raises "function fingerprints are empty"), and `has_function_privilege(<role>, sig, 'execute')` for anon, authenticated, service_role (1683-1735) ·
f the five triggers exist, `tgenabled = 'O'`, and `chat_rsvps_room` has `tgtype = 29` with an empty `tgattr` (1737-1758) ·
g grants as found (1760-1768) · h the standing rule query (1770-1781, = asis 4.6).

### 2.5 POST-CHECK BY BEHAVIOUR (A:1783-1935): the subtransaction idiom

- Picks a real member below admin who passes `can_publish_now() and has_recorded_consent()` by
  setting claims and switching role: `perform set_config('request.jwt.claims', json_build_object('sub', <uid>, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; ... execute format('set local role %I', me);` (`me := current_user`).
- Skips with a NOTICE and a recorded reason when no candidate exists (A:1829-1834); never a stop.
- Fixture rows are inserted as the file's own role (no policy applies), then each probe runs as
  `authenticated` inside `begin ... exception when others then res := res || name || '=' || sqlstate || ';' end;`.
- ACCEPTED probes run first "so a refusal further down cannot be 'everything is refused'" (A:1786-1788).
- The whole inner block ends with `raise exception using errcode = 'P0C21', message = res;` caught by `exception when sqlstate 'P0C21' then state := sqlerrm;` — the subtransaction rolls back rows, claims and role (A:1913-1915). Then `state is distinct from want` = raise; `current_user <> me` = raise; a surviving probe row = raise (A:1917-1926).
- Private SQLSTATEs in use: `P0C21` (A's probe), `P0C11` (`20260930100000:208-236`, asis 6.4).
  The contract gives B's RPCs `P0C21..P0C26` as their REFUSAL codes (`wave-1-contracts.md:323-325`): B's probe must pick a DIFFERENT private state for its own rollback (e.g. `P0C29`), or the probe would catch its own RPC refusals.

### 2.6 APPLY RECORD (A:1937-1959)

`obj_description('public.chat_repair_club(uuid)'::regprocedure, 'pg_proc')` is read, and the record
(`'APPLY RECORD ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: ' || <step7> || '; SAE ...' || '; ' || <probe> || '.'`)
is appended with `execute format('comment on function public.chat_repair_club(uuid) is %L', coalesce(was, '') || ' ' || rec)`.
Reason: "NOTICE lines do not come back through the Management API" (A:1937-1940). CHECK AFTER
APPLYING query 1 reads it back (A:211-215). B should append its record to the comment of one of
ITS functions (e.g. `chat_create_poll`) so A's record is left as it is.

### 2.7 ROLLBACK section shape (A:229-348)

One `BEGIN; SET LOCAL lock_timeout = '5s'; ... COMMIT;` block in the header comment, in reverse
order: restore the previous deployment first (A:229), then "roll back migration B if it was
applied, then this" (A:229-230); ALTER POLICY back to the `was_*` texts (A:245-262); `CREATE OR
REPLACE` the previous function body "character for character: its md5 must read
269c1185295552f74930f1acffd7c170 again" (A:263-288); GRANT restated; DROP TRIGGER x5; DROP
FUNCTION x7; DROP CONSTRAINT x9; MANUAL STEPS with Franky (A:308-334); DROP INDEX; DROP COLUMN;
`DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261001100000'`;
`NOTIFY pgrst, 'reload schema'; COMMIT;` (A:340-348). What it does NOT undo is listed first.
For B: the rollback is `drop trigger chat_votes_drop_access on public.channel_members; drop function ...; drop table public.chat_poll_votes, public.chat_poll_options, public.chat_polls;` (the messages rows of kind poll / event_card STAY: A's `messages_kind_check` still allows them, A:839-845) + the schema_migrations DELETE + NOTIFY.

### 2.8 GRANT EXECUTE, the role guard, function headers

- Every callable function: `grant execute on function public.<name>(<types>) to anon, authenticated, service_role;` right after its `comment on function` (A:1311, 1348, 1399). After `CREATE OR REPLACE`: "keeps the ACL; restate it so the standing rule holds even if someone changed it by hand. Nothing is revoked." (A:1346-1348).
- Role guard at the top of a callable plpgsql function (A:1211-1213, = the rate_limit_hit idiom, section 6):
  `if current_setting('role', true) in ('anon', 'authenticated') then raise exception 'not allowed' using errcode = '42501'; end if;`
- In an sql function the guard is two CASE arms: `when current_setting('role', true) = 'anon' then false when current_setting('role', true) = 'authenticated' and uid is distinct from auth.uid() then false` (A:1372-1374; can_view A:1326-1328).
- Header of a plpgsql VOLATILE service function: `returns void language plpgsql volatile security definer set search_path to '' set timezone to 'UTC' as $$` (A:1202-1209); trigger functions: `returns trigger language plpgsql security definer set search_path to ''` (A:869-874), `set timezone to 'UTC'` where 7-day arithmetic occurs (A:973-979). Every table name fully qualified (`public.`). Each function has a `comment on function` (A:901, 965, 1046, 1135, 1168, 1308, 1396).
- AFTER triggers wrap their body in `begin ... exception when others then raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm; end; return null;` (A:959-961, 1040-1042, 1129-1131, 1162-1164); a BEFORE trigger is not wrapped (A:862-863). Each finds its rows with a join, "no row found = return, never raise" (A:853-854).

---

## 3. What A left in the database (production = local, both applied)

### 3.1 New columns (A:708-714, comments 727-736)

| table.column | type | null / default | FK |
|---|---|---|---|
| channels.kind | text | null; CHECK below | — |
| channels.event_id | uuid | null | events(id) ON DELETE CASCADE |
| messages.kind | text | **not null default 'text'** | — |
| messages.thread_root_id | uuid | null | messages(id) **ON DELETE CASCADE** |
| messages.card_event_id | uuid | null | events(id) **ON DELETE SET NULL** |

So: deleting a Board post deletes its replies; cancelling an event (a DELETE,
`20260930100000_event_cancel_notices.sql:4-9`) nulls `card_event_id` on its Event cards
(`EventCard.event: null`, `wave-1-contracts.md` 5 / `src/lib/chat/types.ts:209`) and deletes its
event room with every message in it (channels.event_id CASCADE, A:729-730).

Full `messages` column list after A (asis 1.2 + A): id, channel_id, user_id, content, created_at,
attachment_kind, attachment_id, media_url, media_kind, parent_message_id, removed_at,
removed_by, removed_reason, kind, thread_root_id, card_event_id. `removed_*` were added by
`20260923090000_moderation_foundation.sql:2134-2137` (`removed_by` → users ON DELETE SET NULL;
`removed_reason` length ≤ 2000). No length check on `content` in the database (asis 1.2).
Full `channels` column list after A: id, org_id, type, parent_channel_id, name, created_at,
photo_url, is_private, position, topic, pinned, kind, event_id (asis 1.1 + A).

### 3.2 Indexes A added (A:716-725)

`channels_event_id_key` UNIQUE (event_id) WHERE event_id IS NOT NULL ·
`channels_one_core_room` UNIQUE (org_id, kind) WHERE kind IN ('board','lounge','officers') ·
`idx_messages_thread_root` (thread_root_id, created_at) WHERE thread_root_id IS NOT NULL ·
`idx_messages_card_event` (card_event_id) WHERE card_event_id IS NOT NULL ·
`idx_rsvps_user` (user_id) · `idx_events_org` (org_id).
Still there from before: `idx_messages_channel_created` (channel_id, created_at DESC),
`idx_messages_parent`, `idx_messages_attachment` (asis 1.2). A grouped reply count
(`select thread_root_id, count(*) ... where thread_root_id = any($1) and removed_at is null group by 1`)
is served by `idx_messages_thread_root`; today's route walks the reply rows in chunks
(`src/lib/chat/message-read.ts:413-430`).

### 3.3 Constraints A added (A:826-845)

channels: `channels_kind_check` (kind null or in board/lounge/officers/event/room) ·
`channels_kind_by_type` ((type = 'org_channel') = (kind is not null)) ·
`channels_org_channel_has_org` · `channels_event_shape` (coalesce(kind='event',false) = (event_id is not null)) ·
`channels_open_rooms_public` (board/lounge → is_private false) · `channels_closed_rooms_private` (officers/event → is_private true).
messages: **`messages_kind_check` CHECK (kind in ('text', 'poll', 'event_card'))** ·
**`messages_card_event_shape` CHECK (card_event_id is null or kind = 'event_card')** ·
`messages_thread_root_not_self` (thread_root_id is distinct from id).
Nothing forbids `kind = 'poll'` with `thread_root_id` set, or `kind = 'event_card'` with a null
`card_event_id` (a cancelled event leaves exactly that shape); B's RPCs decide both.

### 3.4 The five triggers (A:1171-1185; bodies 869-1169)

| trigger | table, timing | function does |
|---|---|---|
| `chat_channels_fill_kind` | channels BEFORE INSERT | dm/group → kind null; club channel without kind: `general` → lounge (renamed, public) when the club has none, `announcements` → board likewise, else `room` (A:869-899) |
| `chat_channels_subscribe` | channels AFTER INSERT OR UPDATE OF is_private | new event room: rows for owners/admins + going/maybe RSVP holders who are members; new public board/lounge/room: rows for every member; a `room` turned public: rows for all; turned private: **`delete from public.channel_members cm where cm.channel_id = new.id`** (A:905-963) |
| `chat_org_members_rooms` | org_members AFTER INSERT OR UPDATE OF role | new member: rows on every public room + open event rooms they RSVP'd; becomes officer: every open event room; drops below admin: **deletes** their event-room rows without an RSVP (A:973-1044) |
| `chat_rsvps_room` | rsvps AFTER INSERT OR UPDATE OR DELETE (any update, `tgtype = 29`) | OLD leaves (delete unless officer or still going/maybe); NEW arrives (going/maybe by a member → row; `no` → delete under the same exceptions) (A:1065-1135) |
| `chat_events_room` | events AFTER INSERT OR UPDATE OF title | club event → `insert into public.channels (org_id, type, kind, event_id, name, is_private, position) values (org, 'org_channel', 'event', id, left(title, 80), true, 1000)`; title change renames (A:1140-1168) |

Every row they write is `(channel_id, user_id, 'member', accepted_at now(), last_read_at now()) ON CONFLICT (channel_id, user_id) DO NOTHING` (A:855-857).
**Where channel_members rows are DELETED today** (what B's `chat_votes_drop_access` AFTER DELETE trigger will see): `chat_channels_subscribe` (room turned private, A:956), `chat_org_members_rooms` (demotion, A:1028-1038), `chat_rsvps_room` (A:1076-1092, 1112-1127), `chat_repair_club` steps 5a/5b (A:1270-1295), `org_members_drop_club_access` (leave/removal, `20260928100000_club_membership_rules.sql:295-299`), the client's own delete of a PENDING dm/group row (`channel_members_delete_own_pending`, never a club room after A:1444-1449), and the FK cascades from `channels` and `users` (asis 1.3) — a cascade fires row-level triggers on the child table too, so the votes trigger must never assume the channel or user row still exists (A's rule at 853-854).
No trigger exists on `channel_members` after A (A's PRE-FLIGHT traced "none on channels, channel_members, rsvps and events", A:470-490; A added none there). `org_members` now has 5 (the four of asis 1.8 + `chat_org_members_rooms`); `channels` 2; `rsvps` 1; `events` 1; `messages` still 2 (`bump_org_activity_on_message` AFTER INSERT, `messages_check_media_ref` BEFORE INSERT OR UPDATE OF media_url, channel_id; asis 1.2).

### 3.5 `chat_repair_club(p_org uuid)` (A:1202-1311)

`returns void language plpgsql volatile security definer set search_path to '' set timezone to 'UTC'`. First statement: the 42501 role guard (A:1211-1213); null or unknown org → `return` (1214-1217). Six steps: 1 the three core rooms `(values ('lounge', false, 0), ('board', false, 1), ('officers', true, 2))` (1219-1228); 2 the room of every event with `ends_at + interval '7 days' > now()` (1229-1239); 3 every missing (member, public room) row (1240-1251); 4 every missing (officer | going/maybe member, open event room) row (1252-1268); 5a delete club-room rows of non-members, 5b delete event-room rows of people who are neither officer nor going/maybe (1270-1295); 6 `set accepted_at = now()` where null on a club room (1297-1306). Comment 1308-1309 (+ the APPLY RECORD appended at apply time, A:1941-1959). EXECUTE granted to all three roles (1311). Called by `POST /api/orgs` after club creation (contract 8) and by step 7 for every club (A:1493).

### 3.6 `can_view_org_channel` after A (A:1319-1348): md5 747ee06d2e4c3e8a788129f7530ec0ae

Same header as before (`LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'`), the t2b body with ONE new arm inserted after "not a member → false" and before "public → true":
```
    WHEN c.kind = 'event' THEN
         public.org_member_role (c.org_id, uid) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.channel_members cm
                  WHERE cm.channel_id = cid AND cm.user_id = uid)
```
(A:1331-1334). Everything else is asis 4.1 word for word: anon → false; authenticated asking about someone else → false; dm/group → false; non-member → false; public → true; owner/admin → true; else the `org_channel_members` allow-list. **No block, restriction, hidden-club or `accepted_at` test.** Returns NULL (no row) for an unknown channel (asis 4.1). Officers is reached through the allow-list arm: a planted allow-list row lets a non-officer in (B1a security review C3, `wave-1-build/B1a-review-security.md:29`; Franky's default: leave it, `wave-1-contracts.md:664`).

### 3.7 `can_post_org_channel(cid uuid, uid uuid, root uuid)` — the EXACT SQL (A:1362-1397): md5 8d8be860d3f7077b9d6f9238705bdca7

```sql
create function public.can_post_org_channel(cid uuid, uid uuid, root uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
set timezone to 'UTC'
as $$
  select coalesce((
    select case
      when current_setting('role', true) = 'anon' then false
      when current_setting('role', true) = 'authenticated'
           and uid is distinct from auth.uid() then false
      when not coalesce(public.can_view_org_channel(c.id, uid), false) then false
      when c.kind = 'board' and root is null then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
      when c.kind = 'board' then
        exists (select 1 from public.messages m
                 where m.id = root
                   and m.channel_id = c.id
                   and m.thread_root_id is null
                   and m.removed_at is null)
      when root is not null then false
      when c.kind = 'event' then
        coalesce((select now() < e.ends_at + interval '7 days'
                    from public.events e
                   where e.id = c.event_id), false)
      when c.kind in ('lounge', 'officers', 'room') then true
      else false
    end
      from public.channels c
     where c.id = cid), false);
$$;
```
Facts B's RPCs lean on: it answers **false, never NULL** (outer `coalesce`); a Board reply root must be a live top-level message OF THAT ROOM (it does not check the root's `kind`, so a reply under a poll message on a Board passes); it never looks at the caller's `channel_members` row except through the event arm of `can_view_org_channel`; under `service_role` it answers about any uid (the routes' use: `src/lib/chat/rooms.ts` `canPostAnswer`, `wave-1-contracts.md:669`). The 7 days are computed in UTC on purpose (A:1360-1362).

### 3.8 The three policies as A left them (intended texts, A:1519-1531; these are what `pg_policies` returns, character for character)

`messages_insert_org_member` WITH CHECK (INSERT, TO authenticated, `qual` null):
```
((auth.uid() = user_id) AND (kind = 'text'::text) AND (card_event_id IS NULL) AND (media_url IS NULL) AND (media_kind IS NULL) AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL) AND (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)))) AND has_recorded_consent() AND can_publish_now())
```
`messages_insert_member` WITH CHECK (dm/group):
```
((auth.uid() = user_id) AND (kind = 'text'::text) AND (card_event_id IS NULL) AND (thread_root_id IS NULL) AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL) AND (EXISTS ( SELECT 1
   FROM (channel_members cm
     JOIN channels c ON ((c.id = cm.channel_id)))
  WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM (channel_members peer
     JOIN blocks b ON ((((b.blocker_id = auth.uid()) AND (b.blocked_id = peer.user_id)) OR ((b.blocker_id = peer.user_id) AND (b.blocked_id = auth.uid())))))
  WHERE ((peer.channel_id = messages.channel_id) AND (peer.user_id <> auth.uid()))))) AND has_recorded_consent() AND can_publish_now())
```
`channel_members_delete_own_pending` USING (DELETE):
```
((auth.uid() = user_id) AND (accepted_at IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = channel_members.channel_id) AND (c.org_id IS NOT NULL))))))
```
Note the deparse: `'text'::text`, no `public.` prefix (the postgres role's search_path is `"$user", public, extensions` on both stacks, A:88-91), `( SELECT 1` on the same line, the FROM/WHERE lines indented by three and two spaces. B's constants must be copied from `pg_policies` after a rehearsal, never typed.
**A did not touch any SELECT policy** (A:47-48): `messages_select_member`, `messages_select_org_member`, `message_reactions_*`, `channel_members_select_member` read exactly as asis 2.2-2.4 (section 7 below).

---

## 4. Fingerprints B's PRE-FLIGHT compares (and what A recorded for the next file)

How A computes them: `md5(pg_get_functiondef(p.oid))` with `p.oid = to_regprocedure('<schema-qualified signature>')` (A:430-431, 1708-1711). `pg_get_functiondef` deparses the whole `CREATE OR REPLACE FUNCTION` statement (header, options, body), so a change of `search_path`, volatility or a comment inside the body changes the md5; `comment on function` does NOT (comments are not part of the definition).

| object | value after A | recorded at |
|---|---|---|
| `public.can_view_org_channel(uuid,uuid)` | `747ee06d2e4c3e8a788129f7530ec0ae` | A:72-73, 1536 (`want_view`); before A it was `269c1185295552f74930f1acffd7c170` (A:69-70, 432; asis 6.3, 11.1) |
| `public.can_post_org_channel(uuid,uuid,uuid)` | `8d8be860d3f7077b9d6f9238705bdca7` | A:73-74, 1537 (`want_post`) |
| `public.org_members_drop_club_access()` | `0e7baa973042be8ca0decb7df1ca6407` (unchanged by A) | A:71, 438; asis 6.3 |
| `public.is_blocked_either_way(uuid,uuid)` | `md5(pg_get_functiondef)` of the CURRENT body is NOT in the repo: `e21645625882ac9541fb65f870d542b4` (`20260922120000:84,369`) is the body BEFORE that file replaced it (its LIVE STATE says "the five functions this file replaces", `:80-84`; the new body is at `:484-499`). What IS pinned for the current body: `md5(prosrc)` = `11a5c6dc6e744b30bf18ecc5c515716e`, `prosecdef` true, STABLE (`20260928100000_club_membership_rules.sql:95-97,196-201`; `20260928120000_blocks_in_rls.sql:180,225-231`) | live == local on Sept 28; if B pins it, the Mac reads the `pg_get_functiondef` md5 first |
| `notifications_type_check` | `md5(pg_get_constraintdef)` = `ea05702e9a2bcf9096c2f71fa323344b` (8 types) | asis 6.3, 11.1 |

"The next file that restates one writes its PRE-FLIGHT against them" (A:74-75, 1706-1708). B restates neither function (the contract's B only ADDS tables, three RPCs and a trigger, `wave-1-contracts.md:277-325`), but its RPCs CALL both, so B's PRE-FLIGHT should still refuse a drifted `can_view_org_channel` / `can_post_org_channel` (the refusal codes and the Board reply rule are built on their exact arms).
Column-level fingerprint idiom for a CHECK constraint: `md5(pg_get_constraintdef(oid)) from pg_constraint where conrelid = 'public.<t>'::regclass and conname = '<c>'` (`20260930100000_event_cancel_notices.sql:96-112`, asis 6.4): B can pin `messages_kind_check` (`CHECK ((kind = ANY (ARRAY['text'::text, 'poll'::text, 'event_card'::text])))` — deparsed form assumed from the pattern of `20260929100000_moderation_image_actions.sql:131-137`; the md5 must be read on the Mac) and `messages_card_event_shape`.

---

## 5. The older tables wave 2 reads or writes

### 5.1 `public.blocks` and the block helper (D1 / D2)

Table (`20260506100000_safety_block_mute_report.sql:15-25`):
`id uuid PK default gen_random_uuid()`, `blocker_id uuid NOT NULL → users(id) ON DELETE CASCADE`,
`blocked_id uuid NOT NULL → users(id) ON DELETE CASCADE`, `created_at timestamptz NOT NULL default now()`,
`UNIQUE (blocker_id, blocked_id)` (auto-named `blocks_blocker_id_blocked_id_key`, `20260928120000:90`),
`CHECK (blocker_id <> blocked_id)`. Indexes: `idx_blocks_blocker (blocker_id)`, `idx_blocks_blocked (blocked_id)` (`:24-25`).
RLS on (`:27`). Policies TO authenticated: `blocks_select_either USING (auth.uid() = blocker_id OR auth.uid() = blocked_id)`
(`20260515000000_blocks_select_either_party.sql:18-20`, replaced `blocks_select_own`), `blocks_insert_own WITH CHECK (auth.uid() = blocker_id)`,
`blocks_delete_own USING (auth.uid() = blocker_id)` (`20260506100000:34-42`). So a viewer's cookie client reads every block row
they are part of, in either direction (the routes lean on that: `src/lib/safety/hidden-users.ts:30-34`, `src/lib/safety/pair-block.ts:76-80`).

`public.is_blocked_either_way(viewer_id uuid, other_id uuid) RETURNS boolean` — current body
(`20260922120000_t2_notification_writes_and_helper_grants.sql:484-499`):
```sql
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND viewer_id IS DISTINCT FROM auth.uid()
         AND other_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = viewer_id AND blocked_id = other_id)
         OR (blocker_id = other_id AND blocked_id = viewer_id)
    )
  END;
```
Reads only `public.blocks`. Under `authenticated` it answers only when the CALLER is one of the two ids
(either position); under `service_role` / `postgres` / inside a trigger it answers about anyone (`:475-479`).
EXECUTE: `GRANT ... TO anon, authenticated, service_role` (`:539`; anon re-granted by `20260922090000:241`
after `20260903100000:253` had revoked it — the crash-button history, asis 4.6). Used in policies:
`org_join_requests_select` (`20260928100000:355-361`), the `posts` / `post_comments` SELECT policies
(`20260928120000_blocks_in_rls.sql:14-21`: `NOT is_blocked_either_way(auth.uid(), user_id)` on the
non-author branch). Other block helper: `public.post_comment_block_hidden(p_comment_id uuid)`
(`20260928120000:249-274`, comments only). **No message policy calls it** (section 7).
`is_muting_now(viewer_id, other_id)` is the sibling (`20260922120000:503-519`; caller must be the muter).

### 5.2 `public.users` columns behind `Person`

`CREATE TABLE public.users` (`20260430190000_phase1_initial_schema.sql:11-33`): `id uuid PK → auth.users(id) ON DELETE CASCADE`,
**`name text NOT NULL DEFAULT ''`**, **`handle text NOT NULL UNIQUE`**, **`avatar_url text` (nullable)**, `banner_url text`,
`school_verified boolean NOT NULL DEFAULT false`, `created_at`, `last_active_at`. No later migration alters the nullability
of `handle`, `name` or `avatar_url` (grep `alter column (handle|name|avatar_url)` over `supabase/migrations/`: none).
So `Person.handle` and `Person.name` typed `string` (`src/lib/chat/types.ts:30`; contract 14.8) are safe: never null,
`name` may be `''`. `avatar_url` is `string | null`.
Column grants to `authenticated` (`20260903100000_security_hardening.sql:41-48`): SELECT on `id, school, school_verified, name,
handle, year, major, department, bio, avatar_url, banner_url, ...` (no table-wide SELECT; `email` never granted);
UPDATE on `name, avatar_url, banner_url, ...` (`:53-59`) — `handle` is service-role only. Later files revoked some SELECTs
(`recruiter_snapshot, looking_for` `20260922130000`; `is_platform_admin` `20260927141000`; `bio, skills, work_experience,
current_on` `20260928160000:90`), none of the four `Person` columns. Policy `users_select_authenticated` is unchanged by the
blocks work (`20260928120000:58`: "A block clause there would null" the joins). The gate columns the INSERT policies read:
`terms_accepted_at`, `age_attested_at`, `school_verified` (asis 4.3), plus `account_restrictions` for `is_restricted_now()`.

### 5.3 `public.orgs` columns the reads use

`CREATE TABLE public.orgs` (`20260430190000:35-46`): `id`, **`handle text NOT NULL UNIQUE`**, **`name text NOT NULL`**,
`school`, `description`, **`logo_url text`** (nullable), **`banner_url text`** (nullable), `tags text[]`, `is_public boolean`, `created_at`.
Added since: `owner_id uuid → users ON DELETE SET NULL`, `backdrop_preset text NOT NULL DEFAULT 'sand-purple'`,
`updated_at timestamptz NOT NULL DEFAULT now()` (`20260507100000_org_channels_schema.sql:11-13`);
**`verified boolean NOT NULL DEFAULT false`**, **`last_activity_at timestamptz`** (default `now()` since `20260507160000:15-16`;
backfilled to `created_at`), `links jsonb`, `philanthropy text` (`20260507150000_org_governance.sql:18-22`);
`join_policy text NOT NULL DEFAULT 'open' CHECK (open|request|invite)`, `audience text CHECK (both|iu|purdue)`,
**`hidden_at timestamptz`** (`20260916103000_org_join_policy_invites.sql:591-596`; "Set by a platform admin: the org leaves every
list ...; members keep direct access", `:602-603`); `campus_id` (`20260916100000`). **There is NO `verified_at` column**
(grep `verified_at` over the migrations: no orgs hit) — `OrgRef` must use `verified: boolean`.
`last_activity_at` is moved forward by the `bump_org_activity` AFTER INSERT trigger on `messages` for ANY club channel
(`20260507150000:43-60`: `SET last_activity_at = NEW.created_at WHERE ... last_activity_at < NEW.created_at`) — so a card insert
by B's RPC bumps it too, and it moves for rooms the viewer cannot read (why `InboxClub.last_activity_at` is computed, not read,
`wave-1-contracts.md:508`). Grants: authenticated SELECT (table-level, `20260916103000:604-605`), UPDATE on
`name, description, logo_url, banner_url, tags, is_public, backdrop_preset, updated_at, links, philanthropy, school` only
(`20260903100000:71-74`: "never verified / owner_id / handle"); INSERT revoked (`:69`). `orgs.hidden_at` gates:
`org_content_visible` / `event_visible` (asis 4.4).

### 5.4 `public.channel_members` (asis 1.3, 2.4, 3.2-3.3)

Columns: `id`, `channel_id → channels CASCADE`, `user_id → users CASCADE`, `role text NOT NULL CHECK (admin|member)`,
`created_at`, **`accepted_at`, `last_read_at`, `hidden_at`, `pinned_at`, `typing_until`, `muted_until`, `cleared_at`** (all nullable
timestamptz). UNIQUE `(channel_id, user_id)` (`channel_members_channel_id_user_id_key`, the `ON CONFLICT` target of every trigger);
partial indexes on `(user_id)` WHERE hidden_at / muted_until / accepted_at IS NULL / pinned_at.
Grants: table `authenticated = SELECT, DELETE (+DxtM)`, no INSERT (`20260903100000:179`), no table UPDATE; column
**`GRANT UPDATE (accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at) TO authenticated`**
(`20260903110000_channel_members_column_grants.sql:17-19`). Policies: `channel_members_select_member USING (is_channel_member(channel_id)
AND can_read_channel_roster(channel_id))`; `channel_members_update_own USING/WITH CHECK (auth.uid() = user_id)` (no column
restriction: the grant is the restriction); `channel_members_delete_own_pending` = section 3.8 (never a club room after A).
Consequence for the reads: `pinned_at`, `muted_until`, `last_read_at` on the viewer's own Lounge row are what `InboxClub` returns
(`wave-1-contracts.md:509`); a member can still null their own `accepted_at` on a club room (A's repair step 6 resets it; the
route rule "a row whose channel has org_id is never a request", `wave-1-contracts.md:662`). Every member reads every
co-member's settings columns on club rooms (B1a security P1/F6, `wave-1-build/B1a-review-security.md:36,68`; "the column fix
is its own file", A:59-61) — not in wave 2's scope, listed so the inbox never echoes another person's row.
After A, every member holds a row on every public room of their clubs and `last_read_at = now()` at creation (A:855-857),
so "a null last_read_at is read as the row's created_at" (`wave-1-contracts.md:495`) only matters for rows written by old code.

### 5.5 `public.org_channel_members` (asis 1.4, 2.6, 3.1)

`(channel_id, user_id) PK`, `added_at`, `added_by → users SET NULL`; index on `(user_id)`. **Grants never hardened: anon AND
authenticated hold `arwdDxtm`** (asis 3.1; "no migration contains a grant/revoke for message_reactions or org_channel_members",
asis 3.3; A left it, A:47-49, contract 3.8 moved out). Policies TO authenticated: SELECT own row or officer/mod of the club;
INSERT owner/admin and not restricted; DELETE own or owner/admin (asis 2.6). Read by `can_view_org_channel`'s last arm only;
`chat_org_members_rooms` does not touch it on demotion (A:62-65).

### 5.6 `public.message_reactions` (asis 1.5, 2.3, 3.1)

PK `(message_id, user_id, emoji)`, `created_at`; emoji allow-list of 7 (`20260927110000`); `message_id → messages CASCADE`.
Grants: **anon and authenticated hold `arwdDxtm`** (never hardened, asis 3.1). Policies: SELECT / INSERT via `is_channel_member`
(dm) or `can_view_org_channel` (club) on the message's channel, INSERT also `NOT is_restricted_now()`; DELETE own. The inner
`messages` read runs under the caller's RLS (asis 2.3 note). A reaction on a card message is allowed today (nothing checks `kind`).

### 5.7 `public.reports` (the remove route's `report_open` check)

Created `20260506100000:79-89`: `id`, `reporter_id → users SET NULL`, `target_type text NOT NULL`, `target_id uuid NOT NULL`,
`reason_code text NOT NULL CHECK (spam|harassment|sexual|hate|self_harm|other)` (+ `intimate_image`, `20260927140000`),
`reason text NOT NULL DEFAULT '' CHECK (length <= 1000)`, `created_at`. Indexes `idx_reports_reporter`, `idx_reports_target (target_type, target_id)`, `idx_reports_created`.
`20260923090000_moderation_foundation.sql:2054-2067` added **`status text NOT NULL DEFAULT 'open'`**, `resolved_by → users SET NULL`,
`resolved_at`, `resolution_note (<= 2000)`, `target_owner_id uuid` (no FK), **`target_snapshot jsonb`**, `admin_alerted_at`;
**`reports_status_check CHECK (status in ('open', 'actioned', 'dismissed'))`** (`:2069-2071`);
**`reports_target_type_check CHECK (target_type in ('user', 'post', 'comment', 'message', 'channel', 'org', 'event'))`** (`:2076-2079`);
unique partial index `reports_one_open_per_reporter_target (reporter_id, target_type, target_id) WHERE status = 'open'` (`:2109-2111`);
`reports_open_created (created_at desc) WHERE status = 'open'` (`:2113-2114`). Grants: `revoke all ... from anon, authenticated`,
INSERT policy dropped (`:2121-2122`): **service role only, both ways**. So the remove route's "an OPEN report on this message"
(`wave-1-contracts.md:470`) is `select id from reports where target_type = 'message' and target_id = <messageId> and status = 'open' limit 1`
with the service role; `snapshotCard` fills `target_snapshot` (contract 5). Snapshot comment `:2124-2125`: student text stays in the database.

### 5.8 `public.moderation_actions` (NOT written by the remove route, 6.3)

`20260923090000:1894-1919`: `id`, `actor_id uuid` (no FK), `action text NOT NULL CHECK (...)`, `target_type text NOT NULL CHECK (post|comment|message|user|org|event|channel|report)`,
`target_id uuid NOT NULL`, `report_id uuid`, `reason (<= 2000)`, `meta jsonb`, `created_at`. `action` list after `20260929100000:128-137`
(17 values): report_dismiss, report_action, post_remove, post_restore, comment_remove, comment_restore, **message_remove, message_restore**,
org_hide, org_unhide, org_verify, org_unverify, user_suspend, user_ban, user_lift, image_remove, image_restore.
Grants: `revoke all ... from anon, authenticated, service_role; grant select, insert ... to service_role` (`:1935-1936`); append-only trigger
`moderation_actions_no_change` (`:1938-1943`). The contract keeps officer removals OUT of it because "the admin user page counts every
`message_remove` row as a Vibe takedown" (`wave-1-contracts.md:471`): the record is `messages.removed_by + removed_at`.

### 5.9 `public.notifications` (asis 1.9; nothing in wave 2 writes one)

`notifications_type_check` = 8 types (`follow, connection, like, comment, mention, org_invite, org_request_approved, event_cancelled`),
md5(pg_get_constraintdef) `ea05702e9a2bcf9096c2f71fa323344b` (asis 6.3, 11.1; `20260930100000` added the eighth + `event_title`,
`event_starts_at`, `notifications_event_cancelled_shape`). `actor_id NOT NULL`. INSERT service-role only; authenticated SELECT + UPDATE (read_at).
No `poll` / `card` / `board_post` type exists: a wave-2 notice would need a CHECK change (not in scope, D10).

### 5.10 `public.events` (asis 1.7 + A)

`id`, `org_id uuid NULL → orgs CASCADE`, `creator_id NOT NULL`, `title (1..120)`, `description (<= 2000)`, `starts_at`, `ends_at`
(`ends_at >= starts_at`, duration `<= 14 days`), `location (<= 200)`, `created_at`. No status / cancelled / cover column: cancel = DELETE
(`20260930100000:4-9`) → `chat_events_room` is not involved (AFTER INSERT OR UPDATE OF title only); the room and its messages go by
cascade; `card_event_id` → NULL. Indexes: `idx_events_starts (starts_at)`, `idx_events_org (org_id)` (A:725). Policies: `events_select_visible
USING event_visible(org_id, creator_id, id)` (RSVP holders see the event even after leaving the club, asis 4.4); DELETE owner/admin;
no INSERT / UPDATE policy and no grants (service role writes, `20260928130000`, `20260923090000:2781`). Trigger after A: `chat_events_room`.
`EventRef` (types.ts:41) is built from `id, title, starts_at, ends_at, location, org_id` + counts from `event_rsvp_counts(uuid[])`
(asis 4.4: no N>=5 floor, visible events only, `(0,0)` for none).

### 5.11 `public.rsvps` (asis 1.6, 2.5 + A)

`id`, `event_id → events CASCADE`, `user_id → users CASCADE`, `status CHECK (going|maybe|no)`, `created_at`; UNIQUE `(event_id, user_id)`;
`idx_rsvps_event`, `idx_rsvps_user` (A:724). No `updated_at`. Grants: authenticated `arwd` on the whole table (asis 3.1) — a student can change
`event_id` on their own row (`rsvps_update_own`), which is why `chat_rsvps_room` fires on ANY update (A:1049-1063). Policies: SELECT own or
`can_manage_event`; INSERT / UPDATE own + `NOT is_restricted_now() AND rsvp_on_home_campus AND event_org_visible`; DELETE own (no restriction check).
The "going" list of the Event card comes from `rsvps` read with the service role and filtered by blocks (D1); "first 8 going" is a route rule.

### 5.12 `public.org_members` (asis 1.8, section 5 + A)

`id`, `org_id`, `user_id`, `role CHECK (owner|admin|mod|member)`, `joined_at`; UNIQUE `(org_id, user_id)`; index `(user_id)`.
Grants: authenticated SELECT, DELETE; no INSERT (`20260916103000:796`); UPDATE(role) revoked (`20260928100000:275`). Triggers now FIVE:
`org_members_clear_removal_on_join` (AFTER INSERT), `org_members_imply_follow` (AFTER INSERT), `org_members_drop_club_access` (AFTER DELETE,
`20260928100000:288-325`: deletes every `channel_members` and `org_channel_members` row of the person on the club's channels; a REMOVAL also
deletes their RSVPs to the club's events not yet ended, a voluntary leave keeps them), `org_members_unfollow_on_leave` (AFTER DELETE),
`chat_org_members_rooms` (AFTER INSERT OR UPDATE OF role, A:1177-1178). Same-event triggers fire in NAME order (asis 5): on a DELETE,
`org_members_drop_club_access` runs before `org_members_unfollow_on_leave`; B's `chat_votes_drop_access` on `channel_members` fires INSIDE
`org_members_drop_club_access`'s first DELETE (trigger inside trigger, both SECURITY DEFINER). `ClubRole` = `org_members.role` of the viewer
(`clubRole(orgId, userId)`, contract 14.4); "officer" = owner | admin (`BOARD_POSTER_ROLES`), "moderator" for 6.3 = `ROOM_MODERATOR_ROLES`
(owner 3, admin 2, mod 1, `wave-1-contracts.md:468`).

---

## 6. Idioms every migration copies

### 6.1 "Refuse inside" (asis 4.5) — `rate_limit_hit`, `chat_repair_club`, B's three RPCs

`public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`
(`20260922090000_guard_function_privileges.sql:203-236`): first statement
`IF current_setting('role', true) IN ('anon', 'authenticated') THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;` (`:213-215`),
then the `INSERT ... ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count` and `RETURN v_count <= p_limit`.
EXECUTE granted to anon and authenticated anyway (`:37,45`; production md5 `e77f30a2c7c0812b2c963fb85b33dbd1`, asis 11.1). A copies it word for
word in `chat_repair_club` (A:1211-1213) and documents why: "VOLATILE (PostgREST runs a STABLE function read-only). Refuses the client roles
from the inside, the rate_limit_hit idiom; EXECUTE stays granted (standing rule, 20260922090000)" (A:1190-1192). The contract makes it the
FIRST statement of `chat_create_poll`, `chat_create_event_card`, `chat_cast_vote` (`wave-1-contracts.md:319-320`). A reply-count reader can
be STABLE (no write) but must still carry the guard or answer nothing to the client roles (the guarded-helper pattern, `20260922120000:471-479`).

### 6.2 The standing rule on function privileges (asis 4.6, `20260922090000:48-51`, verbatim)

```
-- RULE FOR EVERY FUTURE MIGRATION (until Supabase fixes the image): never
-- leave a public, non-trigger function without EXECUTE for anon or
-- authenticated. Grant it and refuse inside (return false/null, or RAISE
-- ... USING ERRCODE = '42501'). A revoke is a crash button.
```
Why: calling a function the caller has no EXECUTE on segfaults the backend on image 17.6.1.111, reachable with the anon key through
`POST /rest/v1/rpc/<fn>` (`20260922090000:1-21`). Trigger functions are exempt (not reachable over REST, PGRST202). A's POST-CHECK h
(A:1770-1781) and the query in asis 4.6 (`:61-69`) are the check: expect 0 rows. Default ACLs already grant EXECUTE to all three roles
on every new function (asis 3.4), and every new TABLE gets `anon, authenticated, service_role = arwdDxtm` — so B's three tables must
`revoke all on table ... from anon, authenticated, service_role; grant select, insert, update, delete on table ... to service_role;`
(contract 4.1; the pattern `20260923090000:1935-1936`, `20260924120000:557-558`, asis 4.5) and enable RLS with no policy.

### 6.3 search_path, TimeZone, qualified names, ALTER POLICY

- Two styles coexist (asis 4): older helpers `SET search_path TO 'public'`; everything since `20260922140000` uses `set search_path to ''`
  with `public.` on every name (A's seven new functions all do, A:869-874, 1202-1209, 1362-1369). `can_view_org_channel` keeps `'public'`
  because A restates the t2b body verbatim + one arm (A:1314-1317). POST-CHECK e compares `proconfig` exactly
  (`array['search_path=""', 'TimeZone=UTC']`, A:1683-1704), so B's functions must declare the two options in that order to reuse the check.
- `set timezone to 'UTC'` on any function that does `ends_at + interval '7 days'` (A:968-972: a PostgREST client chooses the session zone
  with `Prefer: timezone=`). `chat_cast_vote`'s `closes_at` compare is a timestamptz compare (no day arithmetic), but its call into
  `can_post_org_channel` inherits that function's own UTC.
- Policies are changed with `ALTER POLICY` (keeps name, command, roles; ACCESS EXCLUSIVE until COMMIT, A:1401-1404), never DROP + CREATE.
  B changes no policy in the contract's scope.
- The apply window rule (A:178-197): B goes on BEFORE the deploy; old code on the new database must keep working. With B's tables added and
  no policy touched, wave-1 code is unaffected: `messages.kind` stays 'text' for every client insert (policy), and `readChatMessages` already
  selects `kind, thread_root_id, card_event_id` (`src/lib/chat/message-read.ts:75`).

---

## 7. What a direct PostgREST read (anon key + the member's JWT) returns today (D1 / D2)

The SELECT policies A did not touch (asis 2.2-2.4; production = local, asis 11.2), read as a club member:

| table | policy text (USING) | what a member of the club gets |
|---|---|---|
| `messages` | `messages_select_org_member`: `((removed_at IS NULL) OR (user_id = (SELECT auth.uid()))) AND EXISTS (channels c WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL AND can_view_org_channel(c.id, auth.uid()))` | **every non-removed message of every room they can view, blocked authors included**, cards included (`kind`, `card_event_id`, `thread_root_id` are plain columns under the table-level SELECT grant, asis 3.2); their own removed messages too |
| `message_reactions` | `message_reactions_select_member`: the message's channel via `is_channel_member` (dm) or `can_view_org_channel` (club) | every reaction on those messages, blocked people's included |
| `channel_members` | `channel_members_select_member`: `is_channel_member(channel_id) AND can_read_channel_roster(channel_id)` | every co-member's row on every club room they hold a row on — `user_id`, `role`, `accepted_at`, `last_read_at`, `hidden_at`, `pinned_at`, `typing_until`, `muted_until`, `cleared_at` (table-level SELECT; B1a security P1, `wave-1-build/B1a-review-security.md:36`) |
| `rsvps` | `rsvps_select_own_or_manager` | their own row only (officers: every row of their events) |
| `org_channel_members` | own row, or officer/mod of the club | — |
| B's `chat_polls` / `chat_poll_options` / `chat_poll_votes` | no policy + `revoke all` | **nothing** (a `permission denied` 42501, not an empty list) |

Proven in the B1a security review: "after mem blocks mem2, mem still reads mem2's Lounge message with a direct read (SELECT policy
untouched; 12.2 is route-level, a later wave)" (P3, `B1a-review-security.md:38`); its F6 (`:67-68`) states the fix if it is ever wanted:
"messages_select_org_member needs a block arm with the Board exception". The clause for the after-launch file (D2):
`AND (NOT public.is_blocked_either_way(auth.uid(), user_id) OR (thread_root_id IS NULL AND EXISTS (SELECT 1 FROM public.channels c2 JOIN public.org_members m ON m.org_id = c2.org_id AND m.user_id = messages.user_id WHERE c2.id = messages.channel_id AND c2.kind = 'board' AND m.role IN ('owner','admin'))))`
— `is_blocked_either_way` is callable from a policy under `authenticated` because the first argument is the caller (`20260928100000:353-354`),
and `messages_select_org_member` is "the hottest" policy (its cost is A:350-386: `can_view_org_channel` once per room when the planner
hashes the subplan, once per MESSAGE at 1,054 rooms); a block arm adds an EXISTS on `blocks` per message. That file would also restate
`message_reactions_select_member` (reactions of a stubbed message) — not `channel_members` (roster = the going list, designed, P2).
What that direct read cannot do today (A's INSERT policy, section 3.8): write a non-text kind, a card, a removal, media, or a reply
outside a Board (B1a review t1: 30 attempts, all refused, `B1a-review-security.md:18`).

How the routes ask about blocks today (for `hydrateCards` / the stub filter): the viewer's cookie client reads `blocks` in both
directions (`src/lib/safety/hidden-users.ts:30-34` → a `Set` of the other ids; `src/lib/safety/pair-block.ts:76-80` for one pair);
the service client is used only where the viewer is NOT in the pair (group adds, `pair-block.ts:175-183`), returning yes/no and never
the rows. `org-blocks.ts:142-143` is the service-role two-query pattern (`blocked_id in (ids)` / `blocker_id in (ids)`) for a list of
candidates — the shape a stub filter over a page of messages needs (one query per direction, `in (<author ids>)`).

---

## 8. Migration B: what its PRE-FLIGHT must check, what its POST-CHECK can probe

### 8.1 PRE-FLIGHT (catalog + count reads, before any lock; error prefix `chat-cards:`)

1. **Already applied?** `to_regclass('public.chat_polls') is not null` → `raise exception 'chat-cards: already applied (chat_polls exists)'` — first, before any fingerprint (A:419-426 idiom).
2. **Migration A is there** (contract 4: "PRE-FLIGHT refuses unless `messages.kind`, `messages.card_event_id` and `can_post_org_channel` exist"): `information_schema.columns` for `messages.kind`, `messages.thread_root_id`, `messages.card_event_id`, `channels.kind`, `channels.event_id`; `to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)') is not null`; `messages_kind_check` and `messages_card_event_shape` present in `pg_constraint` (pin their `md5(pg_get_constraintdef)` read on the Mac).
3. **Fingerprints** (`md5(pg_get_functiondef(p.oid))`): `can_view_org_channel(uuid,uuid)` = `747ee06d2e4c3e8a788129f7530ec0ae`, `can_post_org_channel(uuid,uuid,uuid)` = `8d8be860d3f7077b9d6f9238705bdca7` (section 4), `org_members_drop_club_access()` = `0e7baa973042be8ca0decb7df1ca6407` (its DELETE is what fires `chat_votes_drop_access`); `is_blocked_either_way` by `md5(prosrc)` = `11a5c6dc6e744b30bf18ecc5c515716e` + `prosecdef` (the only pinned value; section 4) if B or the after-launch file calls it. Each: `'chat-cards: <fn> drifted (md5 %); re-read it first'`.
4. **Policy texts, by exact `pg_policies` text** (B alters none, but the RPCs insert into `messages` with the service role and the contract's refusal codes assume these): `messages_insert_org_member` WITH CHECK = section 3.8 text; `messages_insert_member` = section 3.8 text; `messages_select_org_member` and `messages_select_member` = asis 2.2 texts (so the "hidden stub" rule is known to be route-only); permissive INSERT set on `messages` is exactly the two (A:1676-1681 idiom). RLS on for `messages`, `channels`, `channel_members`.
5. **Grants as found**: `not has_table_privilege('authenticated', 'public.messages', 'UPDATE')`, no INSERT on `channels` / `channel_members`, no anon SELECT on `messages` (A:414-420 list); `has_function_privilege` for anon, authenticated, service_role on the two functions.
6. **Every name is free**: tables `chat_polls`, `chat_poll_options`, `chat_poll_votes` (`to_regclass`); constraints `chat_polls_pkey`, `chat_polls_message_id_fkey`, `chat_polls_channel_id_fkey`, `chat_polls_created_by_fkey`, `chat_polls_mode_check`, `chat_polls_question_check`, `chat_polls_signup_shape`, `chat_poll_options_pkey`, `chat_poll_options_poll_id_fkey`, `chat_poll_options_position_check`, `chat_poll_options_label_check`, `chat_poll_options_capacity_check`, `chat_poll_options_poll_id_position_key`, `chat_poll_votes_pkey`, the three `chat_poll_votes_*_fkey` (name them explicitly in the DDL so the list is exact); index `idx_chat_poll_votes_poll_user`; functions `chat_create_poll`, `chat_create_event_card`, `chat_cast_vote`, `chat_votes_drop_access`, the reply-count function (contract name TBD, e.g. `chat_reply_counts(uuid[])`); trigger `chat_votes_drop_access` on `channel_members`.
7. **Trigger set traced**: `channel_members` has NO trigger (A:470-490 found none; A added none); `messages` has exactly `bump_org_activity_on_message`, `messages_check_media_ref`; `org_members` exactly 5; `channels` 2; `rsvps` 1; `events` 1 (section 3.4). Any other name = `'chat-cards: a trigger this file was not written against: %'`.
8. **Data shape**: `count(*) from messages where kind <> 'text'` = 0 (no card exists before B; "messages.kind is always 'text' until wave 2", A:51-52) and `card_event_id is not null` = 0; row guards (`orgs` ≤ 40, club channels ≤ 60, as A:693-702).
9. **Standing-rule query** (asis 4.6) = 0 rows before AND after.
Never read `schema_migrations` (section 1).

### 8.2 POST-CHECK by reading (same transaction)

- The three tables exist with RLS on (`relrowsecurity`) and **no policy** (`pg_policies` count = 0); `has_table_privilege('anon'|'authenticated', t, 'SELECT'|'INSERT'|...)` all false, `service_role` SELECT/INSERT/UPDATE/DELETE true, and (the trap A:1935-type comments name) `not has_table_privilege('service_role', t, 'TRUNCATE')`.
- `pg_constraint` lists every CHECK/FK/UNIQUE of 4.1 with the expected `pg_get_constraintdef` (copy the deparsed texts from a rehearsal, as A does for policies); the FK actions (`confdeltype = 'c'`).
- Each function: `prosecdef`, `provolatile` ('v' for the three RPCs and the trigger; 's' for the reply counter), `proconfig` exactly (`search_path=""` ± `TimeZone=UTC`), EXECUTE for the three roles; `md5(pg_get_functiondef)` of the three RPCs recorded as `want_*` constants (empty on the first rehearsal → NOTICE + raise, A:1712-1716 idiom) — these are what a later file fingerprints.
- Trigger `chat_votes_drop_access`: `tgenabled = 'O'`, `tgrelid = 'public.channel_members'::regclass`, `tgtype` = row + delete (1 + 8 = 9), empty `tgattr`.
- Grants on `messages`, `channels`, `channel_members` unchanged (A's list); the two A functions' md5s unchanged.
- Standing-rule query = 0 rows.

### 8.3 POST-CHECK BY BEHAVIOUR (Mac rehearsal; runs as the file's role inside a subtransaction rolled back by a private SQLSTATE other than P0C21-P0C26)

Fixtures the probe can build from real rows (A:1809-1856 idiom: a club with a member below admin who passes `can_publish_now()`, an officer of the same club, its Board and Lounge; skip with a recorded reason when none):
1. As `postgres`: `chat_create_poll(lounge, member, 'poll', 'q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')` → a uuid; the `messages` row has `kind = 'poll'`, `content = 'Poll: q'`, `card_event_id null`; two option rows with positions 0,1, `capacity null`. Then `chat_create_poll(board, member, ...)` → SQLSTATE `P0C21` (the Board rule through `can_post_org_channel`); `(board, officer, ...)` → accepted; a poll with 1 option → `P0C22`; a sign-up with 0 or 11 options → `P0C22`; a sign-up option without `capacity` → `P0C22`; a poll option with `capacity` → `P0C22`; a closed event room (needs an event with `ends_at < now() - 7 days`; the local stack has "Chat Seed Closed Night", `wave-1-contracts.md:674`) → `P0C21`.
2. `chat_create_event_card(lounge, member, <event of the club, not ended>, null)` → accepted, `kind = 'event_card'`, `card_event_id` set; an event of ANOTHER club → `P0C23`; an ended event → `P0C23`; a random uuid → `P0C23`.
3. `chat_cast_vote(poll, option_a, member, true)` → one vote; single-choice: voting option_b deletes a; `multi`: both stay; `p_on false` deletes; a vote after `closes_at` (create with `closes_at = now() - interval '1 minute'`) → `P0C25`; a sign-up slot with `capacity 1` taken by the officer, then the member → `P0C26`; an option of another poll → `P0C24`; a removed message (set `removed_at` as postgres) → `P0C24`; a vote by someone with no `can_view_org_channel` (a member of another club) → `P0C24`; on a Board poll a plain member (who cannot POST) CAN vote (contract 4.2 "in a Board any viewer may vote").
4. As `authenticated` (claims set, A:1816-1821 idiom): every RPC → `42501` "not allowed"; `select * from chat_polls` → `42501` permission denied; `insert into messages (... kind 'poll')` → `42501` (A's policy, unchanged); a reply (`thread_root_id = <the Board poll message>`) by the member → accepted (`can_post_org_channel` does not check the root's kind, section 3.7 — record this, it is the contract's call whether B's RPC or the route refuses replies under a poll).
5. `chat_votes_drop_access`: as postgres, delete the member's `channel_members` row on the Lounge → their votes on Lounge polls are gone, the officer's stay; re-insert the row (the trigger must not have raised); delete the officer's row → their votes stay (owner/admin exception).
6. Reply counter: after the fixture, the function returns `(root, 1)` for the Board post with one live reply and nothing for a root whose only reply is removed.
7. Every fixture row gone after the rollback (`not exists (select 1 from messages where content like 'chat-cards probe:%')`), `current_user` back to the starting role.
The APPLY RECORD goes into the comment of one of B's functions (section 2.6); NOTICE lines never reach the Management API.

### 8.4 What the routes may assume after B (for the contract's card/remove/read sections)

- A card's `messages` row is written ONLY by the RPCs (service role): the INSERT policies keep `kind = 'text'` for every client write; `messages_delete_own` (`auth.uid() = user_id`, no kind condition, asis 2.2) lets the author hard-delete their own card through PostgREST → the CASCADE takes `chat_polls` → options → votes.
- `removed_*` on a card: writable by the service role only (no UPDATE grant for authenticated, asis 3.1); `messages_select_*` then hide it from everyone but the author; `hydrateCards` "a removed message gets no card" (contract 5) must not rely on the policy alone (service-role reads see removed rows).
- `bump_org_activity` fires on every RPC insert (5.3); `messages_check_media_ref` sees `media_url null` and passes (asis 1.2).
- `card_event_id → events ON DELETE SET NULL`: an Event card of a cancelled event stays a message with `kind = 'event_card'` and a null event; `EventCard.event: null` is the only signal.
- Officers room has no `channel_members` rows (A:848-857 invariant covers public rooms and event rooms only; Officers is reached by role): `chat_votes_drop_access` never fires for it (contract 4.1 "known gap").

---

## 9. Surprises (short, one line each)

- `is_blocked_either_way`'s only pinned fingerprint is `md5(prosrc)`; the `e21645…` `pg_get_functiondef` md5 in `20260922120000` is the body BEFORE that file — a B PRE-FLIGHT that copies it would refuse the real database.
- `can_post_org_channel` accepts a reply whose root is a Board POLL message (it checks `thread_root_id is null` and `removed_at`, not `kind`): replies under cards are allowed at the policy level unless the route or B's RPC refuses them.
- Nothing in the schema stops `kind = 'poll'` with `thread_root_id` set (a poll as a Board reply) — B's RPC must pass `root = null` and refuse a root.
- `org_channel_members` and `message_reactions` still hand `anon` and `authenticated` the full default ACL (asis 3.1); A left them (3.8 moved out) — B does not fix them either unless the contract says so.
- `orgs` has no `verified_at`; `verified` is a boolean (`20260507150000:19`).
- `bump_org_activity` (AFTER INSERT on messages, any club channel) will move `orgs.last_activity_at` on every card insert, including in rooms the viewer cannot read — the contract's computed `InboxClub.last_activity_at` is the right call.
- A cascade delete from `channels` or `users` fires row-level AFTER DELETE triggers on `channel_members`: `chat_votes_drop_access` must tolerate a vanished channel/user (A's "no row found = return" rule) and must not raise inside `org_members_drop_club_access`.
- A's behaviour probe uses SQLSTATE `P0C21` for its own rollback; the contract assigns `P0C21` to "not allowed to post here" in B's RPCs — B's probe needs a different private state.
- Every member holds `channel_members` rows on every public club room with `last_read_at = now()` (A backfill), so "unread" for the new inbox is a comparison against a real timestamp for almost every row; the null-as-created_at rule is for legacy rows only.
- The read-only Supabase MCP cannot call the club helpers or `set role`, so none of B's behaviour checks can run through it; the Mac rehearsal (psql) is the only place the POST-CHECK can be seen.
