# Wave 1 as-is facts pack (club chat redesign)

Collected 2026-09-29, read-only. Sources: repo at `/Users/franciscocazares/vibe` (HEAD `5cd325d`), and the LOCAL Supabase DB
(`docker exec supabase_db_vibe psql -U postgres -d postgres`, container up and healthy). Production was NOT queried.
Every "live" statement below means the LOCAL database. Local has billing (`20260922150000`) and push (`20260924120000`)
applied; per the critique production has neither, so local != production for anything touching `push_*` / billing.

Sections: 1 tables · 2 RLS policies · 3 grants · 4 functions · 5 org_members delete trigger · 6 migrations ·
7 seed counts · 8 code maps · 9 feature flags · 10 Next.js docs · Differences from the critique.

---

## 1. Tables (local DB, `\d+`)

Policies are listed in section 2, grants in section 3. "Triggers: none" means `\d+` printed no Triggers block.

### 1.1 `public.channels`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| org_id | uuid | null | |
| type | text | not null | |
| parent_channel_id | uuid | null | |
| name | text | not null | `''` |
| created_at | timestamptz | not null | now() |
| photo_url | text | null | |
| is_private | boolean | not null | false |
| position | integer | not null | 0 |
| topic | text | null | |
| pinned | boolean | not null | false |

- Indexes: `channels_pkey` (id); `channels_org_id_idx` (org_id); `channels_org_pinned_position_idx` (org_id, pinned DESC, "position", created_at).
- Check: `channels_type_check CHECK (type = ANY (ARRAY['dm','group','org_channel','org_subchannel']))`.
- FKs: `channels_org_id_fkey` → orgs(id) ON DELETE CASCADE; `channels_parent_channel_id_fkey` → channels(id) ON DELETE CASCADE.
- Referenced by (all ON DELETE CASCADE): `channel_member_mutes.channel_id`, `channel_members.channel_id`, `channels.parent_channel_id`, `messages.channel_id`, `org_channel_members.channel_id`.
- **Triggers: none.** No `kind`, `event_id`, `opens_at`, `archives_at` columns exist. No unique index on (org_id, name).
- Policies present: INSERT + 2 SELECT only. **No UPDATE or DELETE policy** (so rename / delete only work through the service role).

### 1.2 `public.messages`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| channel_id | uuid | not null | |
| user_id | uuid | not null | |
| content | text | not null | |
| created_at | timestamptz | not null | now() |
| attachment_kind | text | null | |
| attachment_id | uuid | null | |
| media_url | text | null | |
| media_kind | text | null | |
| parent_message_id | uuid | null | |
| removed_at | timestamptz | null | |
| removed_by | uuid | null | |
| removed_reason | text | null | |

- Indexes: `messages_pkey` (id); `idx_messages_attachment` (attachment_id) WHERE attachment_id IS NOT NULL; `idx_messages_channel_created` (channel_id, created_at DESC); `idx_messages_parent` (parent_message_id, created_at) WHERE parent_message_id IS NOT NULL.
- Checks: `messages_attachment_kind_check` (NULL or in `'post','clip'`); `messages_media_kind_check` (NULL or in `'image','video'`); `messages_removed_reason_check` (NULL or length <= 2000).
- **There is NO length check on `content` in the DB** (the 4000 limit is route-only, see 8.1) and no `kind` column.
- FKs: `messages_attachment_id_fkey` → posts(id) ON DELETE SET NULL; `messages_channel_id_fkey` → channels(id) ON DELETE CASCADE; **`messages_parent_message_id_fkey` → messages(id) ON DELETE SET NULL**; `messages_removed_by_fkey` → users(id) ON DELETE SET NULL; **`messages_user_id_fkey` → users(id) ON DELETE CASCADE**.
- Referenced by: `message_reactions.message_id` CASCADE; `messages.parent_message_id` SET NULL; `notifications.message_id` CASCADE; `push_outbox.message_id` CASCADE (push table is local-only per the critique).
- Triggers: `bump_org_activity_on_message AFTER INSERT ... EXECUTE FUNCTION bump_org_activity()`; `messages_check_media_ref BEFORE INSERT OR UPDATE OF media_url, channel_id ... EXECUTE FUNCTION messages_check_media_ref()`.
- Policies present: DELETE own, 2 INSERT, 2 SELECT. **No UPDATE policy.**

### 1.3 `public.channel_members`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| channel_id | uuid | not null | |
| user_id | uuid | not null | |
| role | text | not null | |
| created_at | timestamptz | not null | now() |
| accepted_at | timestamptz | null | |
| last_read_at | timestamptz | null | |
| hidden_at | timestamptz | null | |
| pinned_at | timestamptz | null | |
| typing_until | timestamptz | null | |
| muted_until | timestamptz | null | |
| cleared_at | timestamptz | null | |

- Indexes: `channel_members_pkey` (id); `channel_members_channel_id_user_id_key` UNIQUE (channel_id, user_id); partial on (user_id): `idx_channel_members_hidden` WHERE hidden_at IS NOT NULL, `idx_channel_members_muted` WHERE muted_until IS NOT NULL, `idx_channel_members_pending` WHERE accepted_at IS NULL, `idx_channel_members_pinned` WHERE pinned_at IS NOT NULL.
- **No index leading on `channel_id` alone other than the unique (channel_id, user_id)** (that one serves channel lookups).
- Check: `channel_members_role_check CHECK (role = ANY (ARRAY['admin','member']))`.
- FKs: channel_id → channels(id) CASCADE; user_id → users(id) CASCADE.
- Triggers: none.
- Policies present: DELETE own pending, SELECT, UPDATE own. **No INSERT policy** (rows are created by the service role only).

### 1.4 `public.org_channel_members` (private-channel allow-list)

| column | type | null | default |
|---|---|---|---|
| channel_id | uuid | not null | |
| user_id | uuid | not null | |
| added_at | timestamptz | not null | now() |
| added_by | uuid | null | |

- Indexes: `org_channel_members_pkey` PRIMARY KEY (channel_id, user_id); `org_channel_members_user_idx` (user_id).
- FKs: added_by → users(id) SET NULL; channel_id → channels(id) CASCADE; user_id → users(id) CASCADE.
- Triggers: none. Policies: SELECT / INSERT / DELETE (text in 2.6).

### 1.5 `public.message_reactions`

| column | type | null | default |
|---|---|---|---|
| message_id | uuid | not null | |
| user_id | uuid | not null | |
| emoji | text | not null | |
| created_at | timestamptz | not null | now() |

- Indexes: `message_reactions_pkey` PRIMARY KEY (message_id, user_id, emoji); `idx_message_reactions_message` (message_id, created_at).
- Check: `message_reactions_emoji_check` — emoji in the 7-item list (heart, thumbs up, thumbs down, joy, fire, open mouth, cry).
- FKs: message_id → messages(id) CASCADE; user_id → users(id) CASCADE. Triggers: none.

### 1.6 `public.rsvps`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| event_id | uuid | not null | |
| user_id | uuid | not null | |
| status | text | not null | |
| created_at | timestamptz | not null | now() |

- Indexes: `rsvps_pkey` (id); `idx_rsvps_event` (event_id); `rsvps_event_id_user_id_key` UNIQUE (event_id, user_id). **No index leading on `user_id`.**
- Check: `rsvps_status_check CHECK (status = ANY (ARRAY['going','maybe','no']))`.
- FKs: event_id → events(id) CASCADE; user_id → users(id) CASCADE.
- **Triggers: none** (the rsvps → channel_members sync trigger the critique recommends does not exist yet).
- No `updated_at` column.

### 1.7 `public.events`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| org_id | uuid | **null allowed** | |
| creator_id | uuid | not null | |
| title | text | not null | |
| description | text | not null | `''` |
| starts_at | timestamptz | not null | |
| ends_at | timestamptz | not null | |
| location | text | not null | `''` |
| created_at | timestamptz | not null | now() |

- Indexes: `events_pkey` (id); `idx_events_starts` (starts_at). **No index on `org_id`.**
- Checks: `events_check` (ends_at >= starts_at); `events_description_length` (<= 2000); `events_location_length` (<= 200); `events_max_duration` ((ends_at - starts_at) <= '14 days'); `events_title_length` (btrim(title) >= 1 AND title <= 120).
- FKs: creator_id → users(id) CASCADE; org_id → orgs(id) CASCADE. Referenced by `rsvps.event_id` CASCADE.
- Triggers: none.
- Confirms critique #18: **no cover image, bring, rides, status/cancelled or visibility column.**
- Policies present: DELETE manager, SELECT visible. **No INSERT and no UPDATE policy** (inserts/edits are service-role only).

### 1.8 `public.org_members`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| org_id | uuid | not null | |
| user_id | uuid | not null | |
| role | text | not null | |
| joined_at | timestamptz | not null | now() |

- Indexes: `org_members_pkey` (id); `org_members_org_id_user_id_key` UNIQUE (org_id, user_id); `org_members_user_id_idx` (user_id).
- Check: `org_members_role_check CHECK (role = ANY (ARRAY['owner','admin','mod','member']))`.
- FKs: org_id → orgs(id) CASCADE; user_id → users(id) CASCADE.
- Triggers (all enabled, FOR EACH ROW):
  - `org_members_clear_removal_on_join` AFTER INSERT → `org_members_clear_removal_on_join()`
  - `org_members_drop_club_access` AFTER DELETE → `org_members_drop_club_access()` (section 5)
  - `org_members_imply_follow` AFTER INSERT → `org_members_imply_follow()`
  - `org_members_unfollow_on_leave` AFTER DELETE → `org_members_unfollow_on_leave()`
- Policies present: SELECT, UPDATE, DELETE. No INSERT policy.

### 1.9 `public.notifications`

| column | type | null | default |
|---|---|---|---|
| id | uuid | not null | gen_random_uuid() |
| user_id | uuid | not null | |
| actor_id | uuid | **not null** | |
| type | text | not null | |
| post_id | uuid | null | |
| comment_id | uuid | null | |
| read_at | timestamptz | null | |
| created_at | timestamptz | not null | now() |
| message_id | uuid | null | |
| org_id | uuid | null | |
| event_title | text | null | |
| event_starts_at | timestamptz | null | |

- Indexes: `notifications_pkey`; `idx_notifications_actor_dedupe` (user_id, actor_id, type); `idx_notifications_message` and `idx_notifications_message_id` (both (message_id) WHERE message_id IS NOT NULL — **duplicate pair**); `idx_notifications_org` (org_id) WHERE org_id IS NOT NULL; `idx_notifications_user_recent` (user_id, created_at DESC); `idx_notifications_user_unread` (user_id, created_at DESC) WHERE read_at IS NULL.
- Checks (verbatim from `\d+`):
  ```
  "notifications_event_cancelled_shape" CHECK (type <> 'event_cancelled'::text OR org_id IS NOT NULL AND event_title IS NOT NULL AND event_starts_at IS NOT NULL)
  "notifications_event_title_length" CHECK (event_title IS NULL OR char_length(event_title) >= 1 AND char_length(event_title) <= 120)
  "notifications_type_check" CHECK (type = ANY (ARRAY['follow'::text, 'connection'::text, 'like'::text, 'comment'::text, 'mention'::text, 'org_invite'::text, 'org_request_approved'::text, 'event_cancelled'::text]))
  ```
  8 types, matches the critique (#16).
- FKs (all CASCADE): actor_id, user_id → users; comment_id → post_comments; message_id → messages; org_id → orgs; post_id → posts. Referenced by `push_outbox.notification_id` CASCADE (local-only table).
- Trigger: `trg_push_on_notification AFTER INSERT ... EXECUTE FUNCTION push_on_notification_insert()` — **exists locally only** (push migration not on production per critique #9).
- Policies: SELECT / UPDATE / DELETE own. No INSERT policy (service role writes).

### 1.10 RLS flags

`relrowsecurity = true`, `relforcerowsecurity = false` for all of: channels, messages, channel_members, org_channel_members, message_reactions, rsvps, events, org_members, notifications, channel_member_mutes. (RLS on, not forced: the table owner and service_role bypass it.)

Related table seen while checking: `channel_member_mutes` (id, channel_id, muter_id, muted_user_id, until, created_at).

---

## 2. RLS policies (local `pg_policies`; all PERMISSIVE, all `TO authenticated`; no policy names `anon`)

"Last defined" = the last migration file that CREATEs or ALTERs the policy (grep over `supabase/migrations/`). The live text below is
the `pg_policies` output; it matches the last-defining migration hunk in every case I compared.

### 2.1 `channels` (3 policies: INSERT, SELECT x2; no UPDATE/DELETE)

| policy | cmd | last defined |
|---|---|---|
| `channels_insert_authenticated` | INSERT | `20260923090000_moderation_foundation.sql:2294` (ALTER; created `20260430190000:373`, recreated `20260903100000:155-156`, altered `20260906130000:110`) |
| `channels_select_member` | SELECT | `20260903100000_security_hardening.sql:163-164` |
| `channels_select_org_member` | SELECT | `20260507110000_org_channels_helpers_rls.sql:155-156` |

```
channels_insert_authenticated  WITH CHECK:
  (((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])))
   AND has_recorded_consent() AND can_publish_now())

channels_select_member  USING:
  ((org_id IS NULL) AND (EXISTS ( SELECT 1 FROM channel_members cm
     WHERE ((cm.channel_id = channels.id) AND (cm.user_id = auth.uid())))))

channels_select_org_member  USING:
  ((org_id IS NOT NULL) AND can_view_org_channel(id, auth.uid()))
```

Note: the INSERT policy still exists, but `authenticated` holds NO INSERT grant on `channels` (section 3), so a client cannot
insert a channel through PostgREST. `20260928150000_club_chat_posts_rules.sql:228` has a pre-flight that raises on
"another INSERT policy on channels".

### 2.2 `messages` (5 policies: DELETE, INSERT x2, SELECT x2; no UPDATE)

| policy | cmd | last defined |
|---|---|---|
| `messages_delete_own` | DELETE | `20260509100000_message_delete_and_clear.sql:16-17` |
| `messages_insert_member` | INSERT | `20260923090000_moderation_foundation.sql:2257` (ALTER; earlier `20260430190000:451`, `20260903100000:195-196`, `20260906130000:117`, `20260922120000:550`) |
| `messages_insert_org_member` | INSERT | `20260923090000_moderation_foundation.sql:2279` (ALTER; earlier `20260507110000:176-177`, `20260906130000:129`) |
| `messages_select_member` | SELECT | `20260923090000_moderation_foundation.sql:2232` (ALTER; earlier `20260430190000:441`, `20260903100000:181-182`) |
| `messages_select_org_member` | SELECT | `20260923090000_moderation_foundation.sql:2244` (ALTER; earlier `20260507110000:164-165`) |

```
messages_delete_own  USING:
  (auth.uid() = user_id)

messages_insert_member  WITH CHECK:
  ((auth.uid() = user_id)
   AND (EXISTS ( SELECT 1 FROM (channel_members cm JOIN channels c ON ((c.id = cm.channel_id)))
        WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL))))
   AND (NOT (EXISTS ( SELECT 1 FROM (channel_members peer
        JOIN blocks b ON ((((b.blocker_id = auth.uid()) AND (b.blocked_id = peer.user_id))
                        OR ((b.blocker_id = peer.user_id) AND (b.blocked_id = auth.uid())))))
        WHERE ((peer.channel_id = messages.channel_id) AND (peer.user_id <> auth.uid())))))
   AND has_recorded_consent() AND can_publish_now())

messages_insert_org_member  WITH CHECK:
  ((auth.uid() = user_id)
   AND (EXISTS ( SELECT 1 FROM channels c
        WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_view_org_channel(c.id, auth.uid()))))
   AND has_recorded_consent() AND can_publish_now())

messages_select_member  USING:
  (((removed_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
   AND (EXISTS ( SELECT 1 FROM (channel_members cm JOIN channels c ON ((c.id = cm.channel_id)))
        WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL)))))

messages_select_org_member  USING:
  (((removed_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
   AND (EXISTS ( SELECT 1 FROM channels c
        WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_view_org_channel(c.id, auth.uid())))))
```

Facts the contract must carry when restating:
- `messages_insert_member` does NOT check `cm.accepted_at` (a pending request recipient passes the policy; the route is what gates it).
- Neither INSERT policy constrains `parent_message_id`, `media_url`, `attachment_*`, `removed_*` or `created_at`; a direct insert can set any of them
  (subject to the `messages_check_media_ref` trigger and column grants, section 3).
- `messages_delete_own` is a hard delete with no channel/kind condition.
- Two permissive INSERT policies OR together; they are disjoint only because one requires `c.org_id IS NULL` and the other `IS NOT NULL`.

### 2.3 `message_reactions` (3 policies)

| policy | cmd | last defined |
|---|---|---|
| `message_reactions_delete_own` | DELETE | `20260508150000_message_reactions_and_replies.sql:56-57` |
| `message_reactions_insert_member` | INSERT | `20260923090000_moderation_foundation.sql:2541` (ALTER; earlier `20260508150000:44-45`, `20260508160000:31-32`, `20260903100000:226-227`) |
| `message_reactions_select_member` | SELECT | `20260903100000_security_hardening.sql:210-211` (earlier `20260508150000:33-34`, `20260508160000:13-14`) |

```
message_reactions_delete_own  USING:  (auth.uid() = user_id)

message_reactions_insert_member  WITH CHECK:
  ((auth.uid() = user_id)
   AND (EXISTS ( SELECT 1 FROM (messages m JOIN channels c ON ((c.id = m.channel_id)))
        WHERE ((m.id = message_reactions.message_id)
           AND (((c.org_id IS NULL) AND is_channel_member(m.channel_id))
             OR ((c.org_id IS NOT NULL) AND can_view_org_channel(m.channel_id, auth.uid()))))))
   AND (NOT is_restricted_now()))

message_reactions_select_member  USING:
  (EXISTS ( SELECT 1 FROM (messages m JOIN channels c ON ((c.id = m.channel_id)))
     WHERE ((m.id = message_reactions.message_id)
        AND (((c.org_id IS NULL) AND is_channel_member(m.channel_id))
          OR ((c.org_id IS NOT NULL) AND can_view_org_channel(m.channel_id, auth.uid()))))))
```

Note: the inner `messages` read runs under the caller's RLS, so a removed message's reactions are hidden from everyone but its sender.

### 2.4 `channel_members` (3 policies; no INSERT)

| policy | cmd | last defined |
|---|---|---|
| `channel_members_delete_own_pending` | DELETE | `20260911100000_channel_members_delete_own_pending.sql:60-61` |
| `channel_members_select_member` | SELECT | `20260928150000_club_chat_posts_rules.sql:280` (ALTER; created `20260430190000:386`, recreated `20260505100000:26-27`) |
| `channel_members_update_own` | UPDATE | `20260505240000_channel_members_update_own.sql:10-11` |

```
channel_members_delete_own_pending  USING:  ((auth.uid() = user_id) AND (accepted_at IS NULL))
channel_members_select_member       USING:  (is_channel_member(channel_id) AND can_read_channel_roster(channel_id))
channel_members_update_own          USING:  (auth.uid() = user_id)     WITH CHECK:  (auth.uid() = user_id)
```

- The old INSERT policy `channel_members_insert_bootstrap_or_admin` was dropped at `20260903100000_security_hardening.sql:178`.
- `channel_members_update_own` has no column restriction in the policy; what a client can actually UPDATE is decided by the column grants (section 3).

### 2.5 `rsvps` (4 policies)

| policy | cmd | last defined |
|---|---|---|
| `rsvps_delete_own` | DELETE | `20260430190000_phase1_initial_schema.sql:493` |
| `rsvps_insert_own` | INSERT | `20260928110000_club_events_rules.sql:419` (ALTER; earlier `20260430190000:484`, `20260923090000:2317`, `20260927100000:171`) |
| `rsvps_select_own_or_manager` | SELECT | `20260922110000_t1_close_world_readable_selects.sql:307` (replaced `rsvps_select_authenticated`, dropped at `:306`) |
| `rsvps_update_own` | UPDATE | `20260928110000_club_events_rules.sql:430` (ALTER; earlier `20260430190000:488`, `20260923090000:2320`, `20260927100000:178`) |

```
rsvps_delete_own             USING:  (auth.uid() = user_id)
rsvps_insert_own             WITH CHECK:
  ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id) AND event_org_visible(event_id))
rsvps_select_own_or_manager  USING:
  ((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_event(event_id))
rsvps_update_own             USING:  (auth.uid() = user_id)
                             WITH CHECK:
  ((auth.uid() = user_id) AND (NOT is_restricted_now()) AND rsvp_on_home_campus(event_id) AND event_org_visible(event_id))
```

- Confirms critique #2: `rsvps_update_own` exists, so an RSVP can change status through PostgREST without the route. `rsvps_delete_own` has no
  restriction check (a restricted user can still delete their RSVP).
- Both migrations `20260927100000` (`:116`) and `20260928110000` (`:268`, `:282`) carry a pre-flight that RAISES if another permissive
  INSERT/UPDATE policy exists on `rsvps`. A wave-1 migration that adds a policy there will trip nothing at apply time (those files already ran),
  but the same guard idiom is the house style.

### 2.6 Also relevant (from `\d+`, not requested but wave 1 touches them)

```
org_channel_members_select  USING: ((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM channels c
   WHERE ((c.id = org_channel_members.channel_id) AND (c.org_id IS NOT NULL)
     AND (org_member_role(c.org_id, auth.uid()) = ANY (ARRAY['owner','admin','mod']))))))
org_channel_members_insert  WITH CHECK: ((EXISTS ( ... org_member_role(...) = ANY (ARRAY['owner','admin']) )) AND (NOT is_restricted_now()))
org_channel_members_delete  USING: ((user_id = auth.uid()) OR ((EXISTS ( ... ANY (ARRAY['owner','admin']) )) AND (NOT is_restricted_now())))

events_select_visible  (SELECT) USING: event_visible(org_id, creator_id, id)          -- 20260922110000:303-304
events_delete_manager  (DELETE) USING: (((org_id IS NULL) AND (auth.uid() = creator_id))
   OR ((org_id IS NOT NULL) AND (NOT is_restricted_now()) AND (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin']))))
```
Mods can READ the private allow-list but cannot add/remove; `can_view_org_channel` itself does not let a mod into a private channel (section 4.1).

---

## 3. Grants (local DB)

ACL letters: a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN. All nine tables are owned by `postgres`.

### 3.1 Table-level (`pg_class.relacl`)

| table | anon | authenticated | service_role |
|---|---|---|---|
| channels | none | `rdDxtm` (SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) | `arwdDxtm` |
| messages | none | **`ardDxtm`** (INSERT, SELECT, DELETE, + DxtM) | `arwdDxtm` |
| channel_members | none | `rdDxtm` | `arwdDxtm` |
| org_channel_members | **`arwdDxtm` (everything)** | **`arwdDxtm`** | `arwdDxtm` |
| message_reactions | **`arwdDxtm` (everything)** | **`arwdDxtm`** | `arwdDxtm` |
| rsvps | none | `arwd` | `arwdDxtm` |
| events | none | `rd` | `arwdDxtm` |
| org_members | none | `rdDxtm` | `arwdDxtm` |
| notifications | none | `rdm` | `arwdDxtm` |

Verified against the critique (#1): `authenticated` holds table-level INSERT on `messages` — TRUE. It holds NO UPDATE on `messages`.

Things the critique does not mention:
- `org_channel_members` and `message_reactions` were never hardened: `anon` and `authenticated` still hold the full default ACL, TRUNCATE included.
  Anon is stopped only by RLS (every policy is `TO authenticated`), and TRUNCATE is not reachable through PostgREST, but these two are the
  living example of "new tables are open by default".
- `authenticated` still holds TRUNCATE / REFERENCES / TRIGGER on `channels`, `messages`, `channel_members`, `org_members`.
- `authenticated` holds DELETE on `channels` with no DELETE policy, so it deletes 0 rows (noted in `20260928150000_club_chat_posts_rules.sql:85`).
- `service_role` holds TRUNCATE on all nine.

### 3.2 Column-level (`pg_attribute.attacl` — the only real column grants)

| table | column(s) | grant |
|---|---|---|
| channel_members | accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at | `authenticated=w` (UPDATE) |
| notifications | read_at | `authenticated=w` (UPDATE) |

No column-level SELECT or INSERT grants exist on any of the nine tables. `information_schema.column_privileges` lists every `messages` column as
INSERT-able and SELECT-able by `authenticated`, but that is the table-level grant showing through, not a column list. Consequences:
- A new `messages.kind` column is INSERT-able by clients the moment it is added (critique #1 TRUE), and so are `removed_at`, `removed_by`,
  `removed_reason`, `created_at`, `id` today.
- Every `channel_members` column, including `last_read_at`, `typing_until`, `muted_until`, `hidden_at`, `cleared_at`, `pinned_at`, is SELECT-able by any
  co-member who passes `channel_members_select_member` (critique #8 TRUE: the table-level SELECT is what exposes them).

### 3.3 Where each grant was set (migration evidence)

| statement | file:line |
|---|---|
| `REVOKE ALL ON TABLE public.channels / channel_members / messages FROM anon` | `20260903100000_security_hardening.sql:151-153` |
| `REVOKE INSERT ON TABLE public.channel_members FROM authenticated` | `20260903100000_security_hardening.sql:179` |
| `REVOKE UPDATE ON TABLE public.channel_members FROM authenticated` + `GRANT UPDATE (accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at)` | `20260903110000_channel_members_column_grants.sql:17-19` |
| `REVOKE UPDATE ON TABLE public.messages / public.channels FROM authenticated` | `20260903110000_channel_members_column_grants.sql:20-21` |
| `revoke insert on table public.channels from authenticated` | `20260928150000_club_chat_posts_rules.sql:314` |
| `REVOKE ALL ON TABLE public.org_members FROM anon`; `REVOKE UPDATE ... FROM authenticated` | `20260903100000_security_hardening.sql:95-96` |
| `revoke insert on table public.org_members from authenticated` | `20260916103000_org_join_policy_invites.sql:796` |
| `revoke update (role) on public.org_members from authenticated` | `20260928100000_club_membership_rules.sql:275` |
| `revoke all ... public.events, public.rsvps from anon`; `revoke truncate, references, trigger, maintain ... from authenticated` | `20260922110000_t1_close_world_readable_selects.sql:316-320` |
| `revoke update on table public.events from authenticated` | `20260923090000_moderation_foundation.sql:2781` |
| `revoke insert on public.events from authenticated` | `20260928130000_events_insert_service_only.sql:102` |
| `revoke all on table public.notifications from anon`; `revoke insert, update, truncate, references, trigger ... from authenticated`; `grant update (read_at)` | `20260922120000_t2_notification_writes_and_helper_grants.sql:395-397` |

No migration contains a grant/revoke for `message_reactions` or `org_channel_members`.

### 3.4 Default ACLs (`\ddp public`)

```
     Owner      | Schema |   Type   |           Access privileges
 postgres       | public | function | postgres=X, anon=X, authenticated=X, service_role=X
 postgres       | public | sequence | postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU
 postgres       | public | table    | postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
 supabase_admin | public | function | (same four, X)
 supabase_admin | public | sequence | (same four, rwU)
 supabase_admin | public | table    | (same four, arwdDxtm)
```

Critique #1 TRUE: any table created by `postgres` in `public` gives `anon` and `authenticated` the full `arwdDxtm`, and any new function gives
them EXECUTE. Every new wave-1 table must revoke explicitly.

---

## 4. Functions (local `pg_get_functiondef`; all owned by `postgres`)

Summary. EXECUTE = `anon`, `authenticated`, `service_role` all hold it for every function below unless noted ("+PUBLIC" means the ACL also names PUBLIC).

| function | lang | volatility | SECURITY DEFINER | search_path | EXECUTE | last defined |
|---|---|---|---|---|---|---|
| `can_view_org_channel(cid uuid, uid uuid)` → boolean | sql | STABLE | yes | `public` | all three | **`20260922120500_t2b_org_helper_guards.sql:270`** |
| `is_org_member(oid uuid, uid uuid)` → boolean | sql | STABLE | yes | `public` | all three | `20260922120500_t2b_org_helper_guards.sql:240` |
| `org_member_role(oid uuid, uid uuid)` → text | sql | STABLE | yes | `public` | all three | `20260922120500_t2b_org_helper_guards.sql:257` |
| `is_channel_member(cid uuid)` → boolean | sql | STABLE | yes | `public` | all three | `20260505100000_fix_channel_members_rls_recursion.sql:11` |
| `can_read_channel_roster(cid uuid)` → boolean | sql | STABLE | yes | `''` | all three +PUBLIC | `20260928150000_club_chat_posts_rules.sql:255` |
| `has_recorded_consent()` → boolean | sql | STABLE | yes | `public` | all three | `20260906130000_consent_db_boundary.sql:51` |
| `can_publish_now()` → boolean | sql | STABLE | yes | `public` | all three +PUBLIC | `20260923090000_moderation_foundation.sql:2028` |
| `is_restricted_now()` → boolean | sql | STABLE | yes | `public` | all three +PUBLIC | `20260923090000_moderation_foundation.sql:1974` |
| `event_visible(p_org_id, p_creator_id, p_event_id)` → boolean | sql | STABLE | yes | `''` | all three | `20260928110000_club_events_rules.sql:374` |
| `event_org_visible(p_event_id uuid)` → boolean | sql | STABLE | yes | `''` | all three +PUBLIC | `20260928110000_club_events_rules.sql:403` |
| `org_content_visible(p_org_id uuid)` → boolean | sql | STABLE | yes | `''` | all three +PUBLIC | `20260922140000_hidden_club_content_rls.sql:452` |
| `can_manage_event(p_event_id uuid)` → boolean | sql | STABLE | yes | `''` | all three | `20260928110000_club_events_rules.sql:342` |
| `rsvp_on_home_campus(p_event_id uuid)` → boolean | sql | STABLE | yes | `''` | all three +PUBLIC | `20260927100000_rsvp_home_campus_rls.sql:135` |
| `event_rsvp_counts(p_event_ids uuid[])` → table | plpgsql | STABLE | yes | `public` | all three | `20260922100000_t1_count_and_visibility_fns.sql:371` |
| `claim_push_outbox(p_limit int default 25)` → setof push_outbox | plpgsql | VOLATILE | yes | `public` | all three +PUBLIC | `20260924120000_push_notifications.sql:609` (LOCAL ONLY) |
| `org_members_drop_club_access()` → trigger | plpgsql | VOLATILE | yes | `''` | all three +PUBLIC | `20260928100000_club_membership_rules.sql:288` |
| `bump_org_activity()` → trigger | plpgsql | VOLATILE | yes | `public` | authenticated, service_role (NOT anon) | `20260507150000_org_governance.sql:43` |
| `messages_check_media_ref()` → trigger | plpgsql | VOLATILE | **no** (invoker) | `''` | service_role only | `20260927120000_media_ref_ownership.sql:310` |

Standing-rule check run locally (the POST-CHECK query from `20260922090000:61-69`): **0 rows** — no public non-trigger function denies EXECUTE to anon
or authenticated. Trigger functions are exempt from the rule (the two above lack client EXECUTE and that is fine).

Two house styles coexist: older helpers use `SET search_path TO 'public'`; everything written since `20260922140000` uses `SET search_path TO ''`
with fully qualified names. New wave-1 functions should follow the newer style.

### 4.1 `can_view_org_channel` (live body)

```sql
CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND uid IS DISTINCT FROM auth.uid() THEN false
    WHEN c.org_id IS NULL THEN false
    WHEN NOT public.is_org_member (c.org_id, uid) THEN false
    WHEN c.is_private = false THEN true
    WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.org_channel_members ocm
      WHERE ocm.channel_id = cid AND ocm.user_id = uid
    )
  END
  FROM public.channels c
  WHERE c.id = cid;
$function$
```

Facts:
- Order of arms: anon → false; `authenticated` asking about someone else → false; DM/group → false; not a club member → false; public → true;
  owner/admin → true; else the private allow-list. **Mods get no special access to private channels.**
- It returns **NULL (no row) for a channel id that does not exist**; policies treat NULL as false, TypeScript callers must treat `null` as false.
- It does NOT look at `orgs.hidden_at`, `org_removals`, blocks, restrictions, or `channel_members`. Membership in `org_members` is the whole gate.
- Under the `authenticated` role it can only answer about the caller. **The service role may ask about any uid** — that is how routes and the
  push dispatcher use it. An event-room branch must keep both guards.
- Callers in policies: `channels_select_org_member`, `messages_select_org_member`, `messages_insert_org_member`, `message_reactions_select_member`,
  `message_reactions_insert_member`, and `can_read_channel_roster` (→ `channel_members_select_member`).

### 4.2 `is_org_member`, `org_member_role`, `is_channel_member`, `can_read_channel_roster`

```sql
-- is_org_member(oid uuid, uid uuid)  STABLE SECURITY DEFINER  search_path 'public'
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND uid IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = oid AND user_id = uid
    )
  END;

-- org_member_role(oid uuid, uid uuid) RETURNS text  STABLE SECURITY DEFINER  search_path 'public'
  SELECT role FROM public.org_members
  WHERE org_id = oid AND user_id = uid
    AND current_setting('role', true) IS DISTINCT FROM 'anon'
    AND (current_setting('role', true) IS DISTINCT FROM 'authenticated'
         OR uid = auth.uid());

-- is_channel_member(cid uuid)  STABLE SECURITY DEFINER  search_path 'public'
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_members
    WHERE channel_id = cid
      AND user_id = auth.uid ()
  );

-- can_read_channel_roster(cid uuid)  STABLE SECURITY DEFINER  search_path ''
  select current_setting('role', true) is distinct from 'anon'
     and coalesce((
           select c.org_id is null
               or public.can_view_org_channel(c.id, (select auth.uid()))
             from public.channels c
            where c.id = cid),
         false);
```

- `is_channel_member` has no `accepted_at` condition and no role guard (it is about `auth.uid()` only; returns false when `auth.uid()` is null,
  so it is always false for the service role).
- `org_member_role` returns NULL for a non-member, so `org_member_role(...) = ANY(ARRAY['owner','admin'])` is NULL → treated as false.

### 4.3 Publishing gates used by the INSERT policies

```sql
-- has_recorded_consent()  STABLE SECURITY DEFINER  search_path 'public'
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.terms_accepted_at IS NOT NULL
      AND u.age_attested_at IS NOT NULL
  )

-- can_publish_now()  STABLE SECURITY DEFINER  search_path 'public'
  select exists (
           select 1 from public.users u
            where u.id = (select auth.uid())
              and u.terms_accepted_at is not null
              and u.age_attested_at is not null
              and u.school_verified)
     and not public.is_restricted_now();

-- is_restricted_now()  STABLE SECURITY DEFINER  search_path 'public'
  select auth.uid() is not null
     and exists (
       select 1 from public.account_restrictions r
        where r.user_id = (select auth.uid())
          and r.lifted_at is null
          and r.starts_at <= now()
          and (r.ends_at is null or r.ends_at > now()));
```

`can_publish_now()` already implies `has_recorded_consent()`; the policies state both.

### 4.4 Event / RSVP functions

```sql
-- event_visible(p_org_id uuid, p_creator_id uuid, p_event_id uuid)  STABLE SECURITY DEFINER  search_path ''
  select current_setting('role', true) is distinct from 'anon' and (
         (p_org_id is null and coalesce(p_creator_id = auth.uid(), false))
      or (p_org_id is not null and exists (
            select 1 from public.orgs o
             where o.id = p_org_id
               and (o.hidden_at is null
                    or exists (select 1 from public.org_members m
                                where m.org_id = o.id and m.user_id = auth.uid()))))
      or exists (select 1 from public.rsvps r
                  where r.event_id = p_event_id and r.user_id = auth.uid()));

-- event_org_visible(p_event_id uuid)  STABLE SECURITY DEFINER  search_path ''
  select public.org_content_visible(
           (select e.org_id from public.events e where e.id = p_event_id));

-- org_content_visible(p_org_id uuid)  STABLE SECURITY DEFINER  search_path ''
  select current_setting('role', true) is distinct from 'anon'
     and (p_org_id is null
          or exists (
               select 1 from public.orgs o
                where o.id = p_org_id
                  and (o.hidden_at is null
                       or exists (select 1 from public.org_members m
                                   where m.org_id = p_org_id and m.user_id = (select auth.uid()))
                       or exists (select 1 from public.users u
                                   where u.id = (select auth.uid()) and u.is_platform_admin))));

-- can_manage_event(p_event_id uuid)  STABLE SECURITY DEFINER  search_path ''
  select exists (
    select 1 from public.events e
     where e.id = p_event_id
       and (select auth.uid()) is not null
       and case
             when e.org_id is null then e.creator_id = (select auth.uid())
             else exists (select 1 from public.org_members m
                           where m.org_id = e.org_id
                             and m.user_id = (select auth.uid())
                             and m.role in ('owner', 'admin'))
           end);
```

- `event_visible` has THREE arms: own org-less event; any event of a club that is not hidden (or hidden and you are a member); **any event you hold an
  RSVP row for** (any status, `no` included, and even if the club was hidden afterwards).
- `event_visible` and `org_content_visible` differ: only `org_content_visible` has the platform-admin arm.
- `can_manage_event` for a club event = CURRENT owner/admin only (the creator is not enough). Mods are not managers.

```sql
-- rsvp_on_home_campus(p_event_id uuid)  STABLE SECURITY DEFINER  search_path ''
  select current_setting('role', true) is distinct from 'anon'
     and coalesce((
           select ev.campus_id is null
               or h.campus_id is null
               or ev.campus_id = h.campus_id
               -- Members keep their clubs wherever home is.
               or (ev.org_id is not null and exists (
                     select 1 from public.org_members m
                      where m.org_id = ev.org_id and m.user_id = h.id))
             from public.users h
            cross join lateral (
                  select e.org_id, coalesce(o.campus_id, c.campus_id) as campus_id
                    from public.events e
                    left join public.orgs o on o.id = e.org_id
                    left join public.users c on c.id = e.creator_id
                   where e.id = p_event_id) ev
            where h.id = (select auth.uid())),
         true);

-- event_rsvp_counts(p_event_ids uuid[]) RETURNS TABLE(event_id uuid, going_count integer, maybe_count integer)
-- plpgsql  STABLE SECURITY DEFINER  search_path 'public'
#variable_conflict use_column
begin
  if coalesce(cardinality(p_event_ids), 0) > 1000 then
    raise exception 'too many ids (max 1000)' using errcode = '22023';
  end if;
  return query
    select e.id,
           (count(r.id) filter (where r.status = 'going'))::int,
           (count(r.id) filter (where r.status = 'maybe'))::int
      from public.events e
      left join public.rsvps r on r.event_id = e.id
     where e.id = any(p_event_ids)
       and public.event_visible(e.org_id, e.creator_id, e.id)
     group by e.id;
end
```

- `rsvp_on_home_campus`, verified against critique #3: TRUE that `h.campus_id is null` → true (an account with no campus passes), and ALSO
  `ev.campus_id is null` → true, a club member always passes, and **a missing event or missing user row coalesces to `true`**.
  The event's campus is the club's `orgs.campus_id`, falling back to the creator's `users.campus_id`. There is no audience (iu/purdue/both) test.
- `event_rsvp_counts` returns raw counts with **no N>=5 floor**: a count of 1 is returned as 1. Any "from 5 up" rule for going faces/counts would be new.
  It returns a row (0, 0) for a visible event with no RSVPs and no row for an invisible one.

### 4.5 The "refuse inside" idiom (`claim_push_outbox`)

Source `20260924120000_push_notifications.sql:609-619` (identical to the live body):

```sql
create function public.claim_push_outbox(p_limit integer default 25)
returns setof public.push_outbox
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
```

with, at `:667`:

```sql
grant execute on function public.claim_push_outbox(integer) to anon, authenticated, service_role;
```

and for the tables (`:557-558`), the revoke idiom the critique asks new tables to copy:

```sql
revoke all on table public.push_devices, public.push_outbox from anon, authenticated, service_role;
grant select, insert, update, delete on table public.push_devices, public.push_outbox to service_role;
```

Comment at `:602-605`: "VOLATILE (PostgREST runs a STABLE function read-only and the UPDATEs would fail). Refuses the client roles from the inside,
the rate_limit_hit idiom; EXECUTE stays granted (standing rule)."

Caveat for the contract: `claim_push_outbox` exists only where `20260924120000` is applied (local yes, production no per critique #9). Cite it as the
pattern, do not CALL or depend on it. The same idiom also lives in `rate_limit_hit` (`20260922090000`, on production).

### 4.6 The standing rule (`20260922090000_guard_function_privileges.sql:48-51`, verbatim)

```
-- RULE FOR EVERY FUTURE MIGRATION (until Supabase fixes the image): never
-- leave a public, non-trigger function without EXECUTE for anon or
-- authenticated. Grant it and refuse inside (return false/null, or RAISE
-- ... USING ERRCODE = '42501'). A revoke is a crash button.
```

Why (`:1-21`): calling a public function the caller has no EXECUTE on segfaults the Postgres backend on this image (17.6.1.111), reachable with
only the anon key through `POST /rest/v1/rpc/<fn>`. Not crashing: a table permission error, an ordinary RAISE, a RAISE 42501 from inside a function
the caller may execute. "Trigger functions are not reachable over REST (PGRST202)."

Post-check query every migration reuses (`:61-69`), expect 0 rows:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
   and format_type(p.prorettype, null) not in ('trigger','event_trigger')
   and (not has_function_privilege('anon', p.oid, 'EXECUTE')
        or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
```

Note: the default ACL already grants EXECUTE to all three roles on any new function, so the rule is met by default; migrations still restate the
GRANT explicitly (e.g. `20260922120500:~296-298`, "CREATE OR REPLACE keeps the ACL; restate it so the standing rule holds").

---

## 5. The AFTER DELETE trigger on `org_members`

Defined in `20260928100000_club_membership_rules.sql`: function at **`:288-318`**, comment `:320-321`, trigger at **`:323-325`**
(the critique's "~295" is the first DELETE inside the function body, `:295-299`). Live body is identical:

```sql
create function public.org_members_drop_club_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.channel_members cm
   using public.channels c
   where c.id = cm.channel_id
     and c.org_id = old.org_id
     and cm.user_id = old.user_id;

  delete from public.org_channel_members ocm
   using public.channels c
   where c.id = ocm.channel_id
     and c.org_id = old.org_id
     and ocm.user_id = old.user_id;

  -- A removal (recorded before the delete) also drops RSVPs to the club's
  -- events that haven't ended. A voluntary leave keeps them.
  if exists (select 1 from public.org_removals r
              where r.org_id = old.org_id and r.user_id = old.user_id) then
    delete from public.rsvps rv
     using public.events e
     where e.id = rv.event_id
       and e.org_id = old.org_id
       and e.ends_at > now()
       and rv.user_id = old.user_id;
  end if;

  return old;                                  -- ignored: AFTER ROW trigger
end $$;

create trigger org_members_drop_club_access
  after delete on public.org_members
  for each row execute function public.org_members_drop_club_access();
```

Facts for the contract:
- Critique #2 TRUE: it deletes EVERY `channel_members` row the person has on ANY channel with `c.org_id = old.org_id`. An event room modelled as a
  `channels` row with `org_id` = the club is swept too.
- A **removal** (an `org_removals` row exists) also deletes the person's RSVPs to that club's events that have not ended; a **voluntary leave keeps the
  RSVPs**. So after a voluntary leave a Going/Maybe RSVP survives while the room row is gone — the member-only v1 rule needs a stated answer for that
  (the person is no longer a member, so under "members-only" they simply lose the room; the RSVP stays for the calendar).
- A future `rsvps` sync trigger will fire on the RSVP deletes issued here (trigger inside trigger). Both are SECURITY DEFINER.
- Sibling triggers on the same event: `org_members_unfollow_on_leave` (AFTER DELETE). Postgres fires same-event triggers in NAME order, so
  `org_members_drop_club_access` runs before `org_members_unfollow_on_leave`.
- The companion sweep `20260928100500_club_channel_members_cleanup.sql` defines "stale" = a `channel_members` / `org_channel_members` row on a club
  channel whose user has no `org_members` row for that club, and its POST-CHECK raises if any remain. **A non-member event-room row would be "stale"
  by that definition** (relevant after launch, not in members-only v1).

---

## 6. Migrations: numbering, local tracking table, house convention

### 6.1 Files

- `supabase/migrations/` holds **96 files**. Highest version: **`20260930100000_event_cancel_notices.sql`**. New wave-1 files must be numbered above it
  (critique #25 TRUE). Note the latest file is dated one day AHEAD of today (2026-09-29): versions are labels, not timestamps.
- Last 10 files:
  ```
  20260928110000_club_events_rules.sql
  20260928120000_blocks_in_rls.sql
  20260928130000_events_insert_service_only.sql
  20260928140000_profile_views_server_only.sql
  20260928150000_club_chat_posts_rules.sql
  20260928160000_users_profile_widgets_server_only.sql
  20260929100000_moderation_image_actions.sql
  20260929110000_post_club_deletes.sql
  20260929120000_post_tags_rules.sql
  20260930100000_event_cancel_notices.sql
  ```

### 6.2 Local `supabase_migrations.schema_migrations`

- Columns: `version text not null`, `statements text[]`, `name text`.
- **77 rows, max(version) = `20260926100000` (`users_profile_layout`).**
- **19 files have NO row locally**, yet their objects ARE in the local database (each spot-checked in the catalog, all true):
  `20260927100000`, `20260927110000`, `20260927120000`, `20260927130000`, `20260927140000`, `20260927141000`, `20260927142000`, `20260928100000`,
  `20260928100500`, `20260928110000`, `20260928120000`, `20260928130000`, `20260928140000`, `20260928150000`, `20260928160000`, `20260929100000`,
  `20260929110000`, `20260929120000`, `20260930100000`.
- The other 77 files match the 77 rows one to one (no row without a file).
- This is known and written down: `20260928150000_club_chat_posts_rules.sql` PRE-FLIGHT comment — "Catalog reads only (never schema_migrations: the
  local database has the 20260927 objects without their rows)."
- Consequences for wave 1: (a) a PRE-FLIGHT must test the CATALOG (function md5, policy text, `to_regclass`, `pg_trigger`), never
  `schema_migrations`; (b) `supabase migration up` / `db push` against local would try to re-run 19 files whose own pre-flights then abort;
  apply new files to local with `psql -f` the way those 19 were; (c) local also has `20260922150000_billing_stripe` and
  `20260924120000_push_notifications` recorded AND applied, which production lacks per critique #9/#25 (not re-verified here: production not queried).

### 6.3 Fingerprints of the live LOCAL objects (for a wave-1 PRE-FLIGHT)

`md5(pg_get_functiondef(oid))`:

| function | md5 |
|---|---|
| can_view_org_channel | `269c1185295552f74930f1acffd7c170` |
| is_org_member | `d4353094b0d0e4453d91f3892a461fea` |
| org_member_role | `1547cd733c9b990dc1f81211af321ca9` |
| is_channel_member | `c1928ee32f5438a321acf5faad728710` |
| can_read_channel_roster | `204c4e0128439646a760fc4dd18b99d5` |
| has_recorded_consent | `8223fecfa861950ea95538e53f0cbf31` |
| can_publish_now | `ba3e2bd3c0f1f8d45bfabc8a55aed18f` |
| is_restricted_now | `2babc565d2390c14add39ca9429a41fc` |
| event_visible | `49a297a8889c5e397548d1ec9691ae65` |
| event_org_visible | `ceb85263b7eef0005378de6a3152d43b` |
| org_content_visible | `765d0469e8698f0ea9a86f79511813fa` |
| can_manage_event | `297edd04c7f4c2547b99f5c6367a76ba` |
| rsvp_on_home_campus | `76dec36d8a40010a1f172a67489293da` |
| event_rsvp_counts | `eb789168315fffb9887fe813bf92d2b4` |
| org_members_drop_club_access | `0e7baa973042be8ca0decb7df1ca6407` |
| bump_org_activity | `71ef14f02ea6ac24497c68b55c79356b` |
| messages_check_media_ref | `e28bf91044a728135a88e8964214d601` |

`is_channel_member` and `has_recorded_consent` equal the PRODUCTION md5s recorded on 2026-09-22 in `20260922090000:88-91` (same bodies since).
`md5(pg_get_constraintdef(oid))` of `notifications_type_check` = **`ea05702e9a2bcf9096c2f71fa323344b`** (the 8-type list; the 7-type one was
`145524a898154df5dff9316e1373ad70`, `20260930100000:48-49`).

These are LOCAL values. The orchestrator must re-read production read-only before a file ships and either confirm the same md5 or list both
(precedent: `is_muting_now` carries two accepted md5s, `20260922090000:92-93`).

House style for POLICIES is to compare the exact `pg_policies.qual` / `with_check` TEXT, not an md5 (see 6.4); the texts are in section 2.

### 6.4 The header / PRE-FLIGHT / POST-CHECK convention (copy this)

Every recent file has, in order: a comment header with fixed sections, `begin;`, `set local lock_timeout = '5s';`, a `do $$ ... $$` PRE-FLIGHT,
the numbered changes, a `do $$ ... $$` POST-CHECK inside the same transaction, `notify pgrst, 'reload schema';`, `commit;`.

Header sections used by `20260930100000_event_cancel_notices.sql` (line numbers in that file):

| section | lines | what it holds |
|---|---|---|
| title line: session, batch, contract reference | 1-2 | `-- S68 officer tools, batch B1 (contract C1, handoffs/wave-plan-s68/officer-tools.md):` |
| `WHY THIS EXISTS.` | 4-9 | the product call behind it |
| `WHAT IT DOES` (numbered) | 11-32 | one item per step, PRE-FLIGHT and POST-CHECK included |
| `DOES NOT:` | 34-44 | what is deliberately untouched (grants, policies, indexes) |
| `LIVE STATE (...)` | 46-57 | what was read, where, when; fingerprints |
| `APPLY ORDER vs THE DEPLOY:` | 59-66 | before/after the code deploy and what each order does; how to apply and record |
| `CHECK AFTER APPLYING (read-only):` | 68-70 | a read-only query |
| `ROLLBACK (...)` | 72-85 | one transaction, ends by deleting the `schema_migrations` row |

Example header, quoted (`20260930100000_event_cancel_notices.sql:46-66`):

```
-- LIVE STATE (local stack, 2026-09-28; production was not read by this batch:
-- the orchestrator re-reads it before applying, and the PRE-FLIGHT refuses a
-- drifted definition anyway):
--   * md5(pg_get_constraintdef) of notifications_type_check =
--     145524a898154df5dff9316e1373ad70, i.e. CHECK ((type = ANY (ARRAY[
--     'follow', 'connection', 'like', 'comment', 'mention', 'org_invite',
--     'org_request_approved'])))
--   * notifications columns: id, user_id, actor_id, type, post_id,
--     comment_id, read_at, created_at, message_id, org_id.
--   * authenticated: SELECT, DELETE, UPDATE (read_at). anon: nothing.
--   * One trigger: trg_push_on_notification (AFTER INSERT).
--
-- APPLY ORDER vs THE DEPLOY: BEFORE the deploy. Old code never writes or
-- reads the new type or columns. New code before this file: the event is
-- still deleted, the notice insert is refused (23514 / missing column), the
-- route logs it and answers { ok: true, notified: 0, notify_failed: true }.
-- Apply with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260930100000', 'event_cancel_notices');
```

Example PRE-FLIGHT fingerprint check, quoted (`:96-112`):

```sql
do $$
declare
  fp  text;
  bad text;
begin
  select md5(pg_get_constraintdef(oid)) into fp
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check';
  if fp is distinct from '145524a898154df5dff9316e1373ad70' then
    raise exception 'event-cancel: notifications_type_check drifted (md5 %): %; re-read it first',
      coalesce(fp, '(missing)'),
      coalesce((select pg_get_constraintdef(oid) from pg_constraint
                 where conrelid = 'public.notifications'::regclass
                   and conname = 'notifications_type_check'), '(missing)');
  end if;
```

Policy pre-flight idiom, quoted (`20260928150000_club_chat_posts_rules.sql`, PRE-FLIGHT block starting at the `-- 0. PRE-FLIGHT` comment):

```sql
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and policyname = 'channel_members_select_member';
  if q is distinct from 'is_channel_member(channel_id)' then
    raise exception 'club-chat-posts: channel_members_select_member is not the one this file was written against: %', coalesce(q, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'channel_members_select_member';
  if bad is not null then
    raise exception 'club-chat-posts: another permissive SELECT policy on channel_members would OR around the roster rule: %', bad;
  end if;
```

Other conventions seen in these files:
- Exceptions are prefixed with a short file tag (`event-cancel:`, `club-chat-posts:`, `a4-events:`, `rsvp-home:`).
- Policies are changed with `ALTER POLICY` (keeps name and roles), not DROP + CREATE, with the comment "ALTER POLICY holds an ACCESS EXCLUSIVE lock
  on the table until COMMIT".
- POST-CHECK "BY BEHAVIOUR": probe inserts inside a nested block that raises a private SQLSTATE (`P0C11`) so the subtransaction rolls back
  (`20260930100000:208-236`); skipped with a NOTICE on an empty database.
- The name-is-free check: refuse if a column / constraint / function the file adds already exists.
- Row-count guard on data changes: `20260928100500` aborts if the stale count exceeds 25 ("far more ... than the audit counted").
- Apply recipe (`20260926100000_users_profile_layout.sql:74-85`): Management API `POST /v1/projects/<ref>/database/query` with curl + `jq --rawfile`
  ("curl, not Python: urllib gets a Cloudflare 1010 block"), then a SEPARATE request inserting the `schema_migrations` row. Production migrations
  need Franky's yes (wave-plan section 4).

---

## 7. Local seed data (counts, 2026-09-29)

**The local seed does NOT contain SAE or anything shaped like it.** The critique's "5 clubs, 12 channels, 15 club messages, 1 reply" (#7) are
PRODUCTION numbers. Local is 5 test clubs, 8 club channels, 0 club messages. See "Differences" at the end.

### 7.1 Clubs (`orgs`, 5 rows)

| handle | name | is_public | join_policy | hidden | campus_id | members | channels | events |
|---|---|---|---|---|---|---|---|---|
| test_invite_club | Test Invite Club | f | invite | no | indianapolis | 2 | 2 | 2 |
| test_open_club | Test Open Club | t | open | no | indianapolis | 1 | 2 | 1 |
| test_request_club | Test Request Club | f | request | no | indianapolis | 2 | 2 | 1 |
| test_hidden_club | Test Hidden Club | t | open | **yes** | indianapolis | 1 | 2 | 0 |
| test_bloomington_cycling | Bloomington Cycling (test) | t | open | no | iu-bloomington | **0** | **0** | 1 |

`orgs` columns that matter here: `campus_id text`, `join_policy` (open/request/invite), `audience` (both/iu/purdue, default both), `hidden_at`,
`banner_url`, `logo_url`, `backdrop_preset`, `last_activity_at`, `owner_id` (ON DELETE SET NULL).

### 7.2 Club channels (8 rows, all `type = 'org_channel'`)

Every club with channels has exactly the same two. Same for all four clubs:

| name | is_private | position | pinned | topic | parent | messages | replies |
|---|---|---|---|---|---|---|---|
| general | false | 0 | false | NULL | none | 0 | 0 |
| announcements | false | 1 | false | NULL | none | 0 | 0 |

- **No private channel, no `exec`, no `events`, no custom channel, no pinned channel, no topic, no `org_subchannel` anywhere in the local seed.**
- `org_channel_members` (private allow-list): 0 rows.
- `test_bloomington_cycling` has an event but NO channels and NO members (a "club with no Board/Lounge" case for the backfill).

All channels by type:

| type | channels | messages | channel_members rows |
|---|---|---|---|
| dm | 1 | 2 | 2 |
| org_channel | 8 | 0 | 2 |
| group | 0 | 0 | 0 |

### 7.3 `channel_members` rows on club channels (2 rows total)

| club | channel | user | cm.role | accepted_at | last_read / hidden / muted / pinned / cleared | org role |
|---|---|---|---|---|---|---|
| test_invite_club | general | emery_admin | member | set | all NULL | admin |
| test_invite_club | announcements | emery_admin | member | set | all NULL | admin |

`org_members` (6 rows) against their club-channel subscription rows:

| club | org role | user | campus | verified | club channel_members rows |
|---|---|---|---|---|---|
| test_invite_club | admin | emery_admin | indianapolis | t | 2 |
| test_invite_club | owner | avery_owner | indianapolis | t | **0** |
| test_open_club | owner | avery_owner | indianapolis | t | **0** |
| test_request_club | member | avery_owner | indianapolis | t | **0** |
| test_request_club | owner | blake_iu | indianapolis | t | **0** |
| test_hidden_club | owner | avery_owner | indianapolis | t | **0** |

So 5 of 6 memberships, every OWNER included, have no subscription row on their club's channels. A `channel_members` row is NOT a reliable
"is in this room" signal for existing members; `can_view_org_channel` does not need one. (Whether production looks the same was not checked.)

### 7.4 Events (5 rows; 0 without a club; 3 not ended, 2 ended)

| club | title | starts_at (UTC) | ends_at (UTC) | location set | rsvps |
|---|---|---|---|---|---|
| test_invite_club | Invite Club Welcome Mixer | 2026-09-16 23:00 | 2026-09-17 01:00 | yes | 0 |
| test_invite_club | Invite Club Kickoff | 2026-09-26 23:00 | 2026-09-27 01:00 | yes | 0 |
| test_bloomington_cycling | Lake Monroe ride (test) | 2026-09-30 18:31 | 2026-09-30 20:31 | yes | 0 |
| test_request_club | S68 Phone Check | 2026-10-01 03:40 | 2026-10-01 05:40 | yes | 0 |
| test_open_club | Open Club Study Night | 2026-10-03 23:00 | 2026-10-04 01:00 | yes | 1 |

With "open until 7 days after the end": the Sept 16 event's room is already past its window (ended Sept 17, +7d = Sept 24); the Sept 26 one is in
its "After" window until Oct 4.

### 7.5 RSVPs (1 row)

| status | count |
|---|---|
| going | 1 |
| maybe | 0 |
| no | 0 |

The one row: `blake_iu` going to "Open Club Study Night" (test_open_club) and **blake_iu is NOT a member of that club**. Under members-only v1 this
RSVP must NOT produce a room row. There is no seeded member-with-RSVP, no `maybe`, no `no`.

### 7.6 Other counts

users 7 (1 with no campus, 6 school-verified, 1 platform admin) · org_removals 0 · message_reactions 1 · blocks 1 · org_followers 7 ·
notifications 10 (comment 3, event_cancelled 2, follow 5; no `mention`).

Seed source: `scripts/local-seed.mjs` (named in `20260924120000_push_notifications.sql:289-290`).

---

## 8. Code maps (repo HEAD `5cd325d`)

All paths relative to `/Users/franciscocazares/vibe`.

### 8.1 `src/app/api/me/threads/[id]/messages/route.ts` (630 lines)

| lines | what |
|---|---|
| 1-28 | imports: `mentions`, `channel-access`, `reaction-emoji`, `post-media-url`, `push/dispatch`, `moderation/access`, `moderation/text-filter`, `rate-limit`, `safety/pair-block`, server + service Supabase clients |
| 30-32 | `MAX_CONTENT = 4000`, `DEFAULT_LIMIT = 50`, `MAX_LIMIT = 200` |
| 34-41 | `SendBody` (content, attachment_id, attachment_kind, media_url, media_kind, parent_message_id) |
| 43-46 | **`MESSAGE_SELECT`**: `id, content, created_at, user_id, attachment_id, attachment_kind, media_url, media_kind, parent_message_id` + `users` join + `attachment` (posts) join. **Does not select `removed_at`.** A new `kind` goes here. |
| 48-84 | types `MessageRow`, `AttachmentRow`, `ParentPreview` |
| 91-117 | `hydrateReactions()` — caller's client, reads `message_reactions`, groups through `groupMessageReactions` |
| 128-167 | `hydrateParentPreviews()` — caller's client, reads parents `id, content, user_id, media_kind, attachment_kind, author` |
| 179-200 | `prepareForClient()` — media_url → same-origin proxy URL; fills empty defaults |
| 202 | `RouteCtx = { params: Promise<{ id: string }> }` (params is a Promise, awaited) |
| **208-340** | **GET** |
| **347-630** | **POST** |

**GET, in order**

| lines | step |
|---|---|
| 209-217 | `await ctx.params`; cookie client; `auth.getUser()` → 401 `Unauthorized` |
| 219-222 | **`ensureMember(supabase, channelId, user.id)`** → `{ ok:false, error:"Not a member" }` with `member.status` (403 or 500) |
| 224-227 | `?before=<iso>`, `?limit=` clamped 1..200, default 50. **No `?after=`.** |
| 233 | `clearedAt = !member.isOrgChannel ? member.cleared_at : null` — club channels ignore `cleared_at` |
| 234-244 | `runQuery(select)`: `.eq("channel_id")`, `order created_at desc`, `limit`, `lt(before)`, `gt(clearedAt)`. **No `parent_message_id` filter and no `removed_at` filter** (removed rows are hidden by RLS only). |
| 245-258 | run `MESSAGE_SELECT`; on an error matching `/attachment|media|relationship|column|fkey/i` retry with the bare select; else 500 `Request failed` |
| 259-265 | `hydrateReactions` + `hydrateParentPreviews` in parallel, then `prepareForClient` |
| 267-278 | **club channel early return**: `{ ok, messages (oldest first), peer_last_read_at: null, peer_typing: [] }` — no `viewer_id`, no `can_post` |
| 283-313 | DM/group peer read: `channel_members` `user_id, last_read_at, typing_until, users(...)` for everyone but the viewer, **caller's client**; fallback without `typing_until` |
| 315-319 | `peer_last_read_at` = max of peers' `last_read_at` |
| 321-329 | `peer_typing` = peers whose `typing_until` is in the future |
| 332-339 | response `{ ok, messages, viewer_id, peer_last_read_at, peer_typing }` |

**POST, gates in order**

| # | lines | gate / step | refusal |
|---|---|---|---|
| 1 | 348-356 | auth | 401 `Unauthorized` |
| 2 | **358-359** | **rate limit** `rateLimit("message-send:" + user.id, { limit: 60, windowSec: 60 })` (fail-open) | 429 via `tooManyRequests` |
| 3 | **364-365** | **`requireCanPublish(user.id)`**: Terms → restriction → verified school email (service-role read) | 403 `terms_required` / `account_restricted` / `school_email_required`; 500 on read failure |
| 4 | 367-372 | JSON parse | 400 `Invalid JSON` |
| 5 | 374-390 | field extraction; `content` trimmed | |
| 6 | 392-394 | empty (no content, no attachment, no media) | 400 `Empty message` |
| 7 | 395-397 | `content.length > 4000` | 400 `Message too long` |
| 8 | **398** | **word filter** `checkText(content)` | 422 `content_blocked`, field `content` |
| 9 | 402-419 | media key must be this channel's (`isChannelMessageMediaKey`), kind image/video | 400 |
| 10 | 424-451 | attachment post must be visible to the sender (caller's client) and kind must agree | 400 / 404 |
| 11 | **453-456** | **`ensureMember`** | 403 / 500 `Not a member` |
| 12 | **461-479** | **parent check** (below) | 400 on cross-channel |
| 13 | 481-501 | block guard `dmSendBlocked` — **DM/group only**, fails closed | 403 `Couldn't send this message`; 500 `block_check_failed` |
| 14 | 503-534 | **INSERT with the CALLER's cookie client** (`supabase`), `.select(MESSAGE_SELECT).single()`; retry with bare columns on `/attachment|media|column/i` | 500 `Request failed` |
| 15 | 536-545 | push enqueue, DM/group only (`enqueueMessagePush`) | |
| 16 | 547-566 | DM/group only: implicit accept (`accepted_at`), bump own `last_read_at` | non-fatal |
| 17 | **568-619** | **@mention fan-out** (below) | best-effort |
| 18 | 621-629 | `hydrateParentPreviews` + `prepareForClient`; `{ ok: true, message }` | |

Things that follow from that order:
- The rate limit and the word filter run BEFORE the membership check; a non-member burns the sender's bucket and gets a 422 before a 403.
- **The insert is NOT service-role.** The `messages_insert_*` policies gate the route's own insert, and **any RLS refusal comes back as a bare
  500 `Request failed`** (`:531-534`). A Board rule written only in RLS would turn a member's Board post into a 500; the route needs its own
  403 first. A card kind refused for direct inserts (`kind = 'text'` only) means card rows MUST be written by the service role / an RPC.
- No `kind` is read from the body; `insertRow` (`:503-512`) lists exactly 8 columns.

**`parent_message_id` handling (`:375-378`, `:458-479`, `:511`)**
- Read from the body as a non-empty string, else null.
- Parent looked up with the caller's client: `messages.select("id, channel_id").eq("id", raw).maybeSingle()`.
- lookup error → logged, parent dropped, send continues (`:468-469`).
- parent in this channel → kept (`:470-471`). parent in another channel → 400 `Parent message belongs to a different channel` (`:472-477`).
- **parent not found → silently dropped, message is sent as a top-level message** (`:478`, comment "silently drop the parent rather than
  rejecting the send"). Critique #12 TRUE. A removed parent is invisible to non-senders under RLS, so a reply to a removed message also
  becomes top-level.
- No depth rule: a reply to a reply is allowed. No uuid shape check on the raw value (a malformed id surfaces as the lookup error path).

**Mention fan-out (`:568-619`)**
- Only when `content` is non-empty; `extractMentionHandles` → `resolveMentionedUserIds(supabase, handles, user.id)`.
- **Club channel: targets = `org_members` of `member.orgId` filtered to the mentioned ids (`:579-585`)** — every club member, NOT the channel's
  readers. Critique #15 TRUE: a mention in a private channel notifies members who cannot open it.
- DM/group: targets = `channel_members` of the channel (`:586-593`).
- Written by the service role through `insertMentionNotifications(..., { kind: "message", messageId })` (`:599-607`): type `mention`, at most
  `MAX_MENTION_NOTIFICATIONS = 20` per message, and a per-sender budget `MENTION_BUDGET = 60` per hour (`src/lib/mentions.ts:51,68-69`).
- Club channel only: `kickPushDrain()` when any row was written (`:611`). Wrapped in try/catch (`:615-617`).
- Mentions inside a REPLY are treated exactly like any other message (no parent test).

**Typing / read pieces**
- In this file only the GET peer read (`:283-329`), DM/group only. Writes live in sibling routes: `threads/[id]/typing/route.ts` (42 lines),
  `threads/[id]/read/route.ts` (30), plus `pin` (61), `hide` (34), `mute` (99), `clear` (41), `accept` (48), `decline` (68).
- Stale comments: `:267-269` and `:548` say "Org channels don't have channel_members rows". They DO have subscription rows (section 7.3,
  `src/lib/orgs/membership.ts:214`); the statement is only true as "the route does not use them".

**Other routes under `threads/[id]/messages/`**: `[messageId]/route.ts` (60, sender-only hard DELETE), `[messageId]/react/route.ts` (119),
`[messageId]/media/route.ts` (98, calls `ensureMember` at `:66`).

### 8.2 `src/lib/messages/channel-access.ts` (156 lines)

| lines | what |
|---|---|
| 1-4 | imports `isUuid` (`@/lib/pgrest`), `MESSAGE_MEDIA_KEY_PREFIX` / `MESSAGE_MEDIA_KEY_RE` (`@/lib/r2`), `isChannelMediaKey` (`@/lib/posts/media-ownership`) |
| 13 | `ServerClient` = the cookie client type |
| **15-30** | **`ChannelAccess`** union: `{ ok:true, isOrgChannel:false, orgId:null, accepted_at, cleared_at }` / `{ ok:true, isOrgChannel:true, orgId:string, accepted_at:null, cleared_at:null }` / `{ ok:false, status:number }` |
| **45-129** | **`ensureMember(supabase, channelId, userId): Promise<ChannelAccess>`** |
| 52 | malformed id → `{ ok:false, status:403 }` |
| 58-66 | reads `channels.select("org_id")` with the CALLER's client (RLS decides visibility); error → 500 |
| 73 | **no row → 403** (unreadable channel = not a member, security wave 2 #14) |
| **75-92** | club branch: `supabase.rpc("can_view_org_channel", { cid, uid })`; rpc error → 500; `canView !== true` → 403; else ok with `orgId` |
| 94-128 | DM/group branch: `channel_members.select("accepted_at, cleared_at")` for the caller's own row (fallback without `cleared_at`); no row → 403 |
| 139-147 | `isChannelMessageMediaKey(key, channelId)` |
| 154-156 | `messageMediaProxyUrl(channelId, messageId)` |

Facts:
- It selects ONLY `org_id` from `channels` (`:60`). It does not read `type`, `name`, `is_private`, nor any future `kind`. `canPostTopLevel()` and
  room helpers need a wider select or a second read.
- The return type carries no role, no `kind`, no `can_post`.
- Critique line references: "`channel-access.ts:73-80`" for the gate is `:75-84`; "`channel-access.ts:99-107` (`cleared_at`)" is correct
  (`readMember`, `:99-106`). The own-row read of `cleared_at` uses the COOKIE client, so critique #8's warning holds: revoking table SELECT on
  `channel_members` from `authenticated` breaks this read.
- Callers of `ensureMember`: `messages/route.ts:219,453`; `messages/[messageId]/media/route.ts:66`; `api/me/messages-upload-url/route.ts:92`;
  `api/users/search/route.ts:75`. Direct callers of the RPC: `src/lib/push/dispatch.ts:783` (service role, asks about the RECIPIENT).

### 8.3 `src/app/api/orgs/route.ts` — default channels on club creation (903 lines)

| lines | what |
|---|---|
| 645-654 | POST doc comment: "the org row, an `org_members` row with role='owner', and default channels `#general` + `#announcements`" |
| 656-661 | POST: cookie client, auth → 401 |
| 663-664 | rate limit `org-create:<uid>` 5 per 3600 s |
| 676-677 | `requireCanPublish` |
| 824-831 | handle clash read → 409 `handle_taken` |
| 845-867 | org INSERT with the **service role**; failure → 500 `create_failed` |
| 869-880 | owner `org_members` row (service role, `:872`); failure → 500 `create_failed` |
| **882-896** | **default channels**, service role, one INSERT of two rows |
| **897-900** | `channelsErr` is logged and **ignored** ("Non-fatal — the org exists, admins can create channels manually") |
| 902 | `201 { ok: true, org }` |

Exact block (`:882-896`):

```ts
  const defaults = [
    { name: "general", position: 0, is_private: false },
    { name: "announcements", position: 1, is_private: false },
  ];
  const { error: channelsErr } = await service.from("channels").insert(
    defaults.map((d) => ({
      org_id: org.id,
      type: "org_channel" as const,
      name: d.name,
      position: d.position,
      is_private: d.is_private,
    }))
  );
```

Facts:
- Critique #17 cites `api/orgs/route.ts:884-897`; the block is `:882-900`. Its claim is TRUE: no `kind` is sent and the error is non-fatal, so a
  NOT NULL / CHECK on `kind` applied before the code deploy would create clubs with NO channels, silently. (Both rows go in ONE insert, so one
  bad row loses both.)
- **The owner gets NO `channel_members` rows** at creation: `subscribePublicChannels` is not called here. Its only caller is `admitMember`
  (`src/lib/orgs/membership.ts:293`), and `POST /api/orgs/[slug]/channels/subscribe-public` does the same upsert for the caller on demand.
- Code-map says "created at api/orgs/route.ts:882-886" — matches.

### 8.4 `src/app/api/orgs/[slug]/channels/**` (6 files, 800 lines)

Shared guard: `src/lib/club-routes/officer-guard.ts` (103 lines). `loadClubOfficer(slug, viewerId, { channelId?, allowed? })` (`:39-103`) loads
the club and the caller's role with the SERVICE role, answers through `officerGate` (`src/lib/orgs/hidden-gate.ts`): 404 stranger on a hidden
club, 403 `Admin only` non-officer, 500 read failure; optional channel load selects **`id, org_id, is_private, name, topic`** (`:88`) and 404s a
channel of another club. `CHANNEL_ADMIN_ROLES = ["owner", "admin"]` (`:26`). The returned `channel` has no `kind`, `type`, `pinned`, `position`.

| file | verb | lines | gates in order | write |
|---|---|---|---|---|
| `channels/route.ts` (186) | GET | 31-102 | auth 401 → org by handle (service) 404 → own `org_members` role (service): non-member gets 404 if hidden else 403 `members_only` → channel list on the **cookie client** (RLS filters private) | none |
| | POST | 118-186 | auth → `requireCanPublish` (126) → JSON → name regex `^[a-z0-9][a-z0-9_-]{1,30}$` (9, 141) → word filter on name + topic (148-149) → `loadClubOfficer` (152) → name clash in the club 409 (159-167) | service INSERT `org_id, type:'org_channel', name, topic, is_private, position` (169-180); default `position` 100 (139); 201 |
| `channels/[channelId]/route.ts` (177) | PATCH | 51-153 | auth → `requireStaff` = `requireNotRestricted` + `loadClubOfficer` with channel (27-42) → JSON → per-field checks | service UPDATE of any of `name, topic, is_private, position, pinned` (127-132); **public → private flip deletes ALL `channel_members` rows of the channel** (143-151) |
| | DELETE | 160-177 | auth → `requireStaff` | service hard DELETE (171); cascades messages, reactions, channel_members, allow-list |
| `channels/reorder/route.ts` (105) | POST | 26-105 | auth → JSON/shape → `requireNotRestricted` (66) → `loadClubOfficer` (69) → ids must all belong to the club (78-91) | service UPDATE `position = index` per id (100) |
| `channels/subscribe-public/route.ts` (99) | POST | 23-99 | auth → org 404 → own `org_members` row else 403 (45-53) | service upsert of `channel_members` rows on every `is_private = false` channel (58-94) |
| `channels/[channelId]/members/route.ts` (186) | GET | 47-~100 | auth → staff guard | reads `org_channel_members` (59) |
| | POST | 105-186 | auth → staff guard → target must be a club member (149-157) | service INSERT into `org_channel_members` (172) |
| `channels/[channelId]/members/[userId]/route.ts` (47) | DELETE | 16-47 | auth → `requireNotRestricted` → `loadClubOfficer` with channel | service DELETE from `org_channel_members` (34-35) |

Verified against critique #17 (it cites `channels/[channelId]` PATCH/DELETE `:101-172`): TRUE.
- PATCH lets an owner/admin rename ANY channel, flip `is_private`, pin, move; DELETE removes ANY channel. Nothing protects `general` or
  `announcements` by name, and nothing can protect by kind (there is none).
- POST has **no cap** on the number of channels and no rate limit.
- Name uniqueness within a club is a route-level read-then-write only (`channels/route.ts:159-167`, `[channelId]/route.ts:80-89`); the DB has no
  unique index on (org_id, name), so two racing creates can both land.
- `subscribe-public` and `subscribePublicChannels` both select by `is_private = false` only; an event room stored as a public `org_channel` would
  be auto-subscribed to every member who joins or taps subscribe.
- PATCH uses `requireNotRestricted` (no school-email check); POST uses `requireCanPublish`.

### 8.5 `src/app/api/events/route.ts` — POST (528 lines; POST = `:389-528`)

| # | lines | gate / step | refusal |
|---|---|---|---|
| 1 | 390-398 | cookie client, auth | 401 `unauthorized` |
| 2 | 401-402 | rate limit `event-create:<uid>` 10 per 3600 s | 429 |
| 3 | 429-430 | `requireCanPublish` | 403 `terms_required` / `account_restricted` / `school_email_required` |
| 4 | 432-442 | JSON must parse to a plain object | 400 `invalid_json` |
| 5 | 456-463 | `checkEventFields(readEventFields(body), Date.now())` (`src/lib/events/validate.ts`): title, lengths, word filter, times | 422 `content_blocked` with `field`, or the problem's own status/code |
| 6 | 469-472 | `org_id` required and a uuid | 400 `org_required` |
| 7 | 476-493 | service-role load of `orgs (id, verified, hidden_at)` + own `org_members.role` | 500 `request_failed` |
| 8 | 494-496 | club missing or **hidden** | 404 `not_found` |
| 9 | 497-499 | **club not `verified`** | 403 `org_unverified` |
| 10 | 500-503 | role must be owner or admin | 403 `org_role_required` |
| 11 | 508-520 | **service-role INSERT** `creator_id, org_id, title, description, location, starts_at, ends_at`, `.select(EVENT_ROW_COLUMNS)` | 500 `request_failed` |
| 12 | 527 | `{ ok: true, event: row }` (status 200, not 201) | |

- `EVENT_ROW_COLUMNS` = `"id,org_id,creator_id,title,description,starts_at,ends_at,location,created_at"` (`src/lib/events/event-item.ts:17-18`).
- This route is the ONLY way to create an event (`20260928130000` revoked INSERT from `authenticated`; comment `:417-428`). So an event room created
  "with the event" has exactly one call site to hook, right after `:520`. There is no transaction: a room insert after the event insert is a
  second statement and can fail on its own.
- Every event has a club (`org_id` required since this gate) and **only VERIFIED clubs can create events**. Local seed events exist on two
  unverified clubs (`test_open_club`, `test_hidden_club` has none) because the seed script writes directly.
- Siblings: `events/[id]/route.ts` (338): DELETE `:144` (rate limit `event-delete` 30/600 s, `requireNotRestricted` `:161`, hard delete `:178`,
  cancel notices via `src/lib/events/notify-cancel.ts`), PATCH `:272` (rate limit `event-edit` 30/600 s, `requireCanPublish` `:286`, update `:324`).
  `events/[id]/attendees/route.ts` (96), `events/[id]/ics/route.ts` (134).

### 8.6 `src/app/api/events/[id]/rsvp/route.ts` (226 lines)

| lines | what |
|---|---|
| 10-11 | `RouteContext = { params: Promise<{ id: string }> }`, `RsvpBody = { status?: unknown }` |
| 13-15 | `fail(status, code, error)` → `{ ok:false, error, code }` |
| **38-116** | **`rsvpBlocked(eventId, viewerId)`** — all reads service-role, fails closed |
| 41-42 | loads `events (id, org_id, creator_id)` and the viewer's `users.campus_id` |
| 49-51 | no event → 404 `not_found` |
| 58-72 | club load `hidden_at, campus_id`; **hidden → 404 `not_found`** |
| **78-80** | **`if (!viewerCampusId) return null`** — no home campus = allowed |
| 83-95 | creator's campus, only when the club has none |
| 97 | `rsvpCampusDecision({ orgCampusId, creatorCampusId, viewerCampusId })` (`src/lib/iu/campus-request`) |
| 102-114 | away from home: a member of the event's club is still allowed |
| 115 | 403 `campus_visiting` |
| **130-180** | **PUT** |
| 132-134 | id must be a uuid → 400 `invalid_event_id` |
| 136-143 | auth → 401 |
| 147-148 | rate limit `rsvp:<uid>` 60 per 600 s |
| **150-151** | **`requireTermsAccepted`** (Terms only: no restriction check, no school-email check in the route) |
| 160-163 | **status must be `going` or `maybe`** → 400 `invalid_status`. `no` is NOT accepted by the route. |
| 165-166 | `rsvpBlocked` |
| **168-173** | **upsert on the CALLER's cookie client**, `onConflict: "event_id,user_id"` → policies `rsvps_insert_own` / `rsvps_update_own` apply (they add `NOT is_restricted_now()`) |
| 175-178 | error → 500 `request_failed` (an RLS refusal for a restricted user lands here) |
| 179 | `{ ok: true }` — **no status, no counts, no room id in the response** |
| **197-226** | **DELETE**: uuid check, auth, same rate-limit bucket, delete own row on the cookie client; deliberately no hidden/campus/Terms gate; `{ ok: true }` |

Verified against critique #3:
- "No home campus: `rsvp/route.ts:80`" — TRUE (`:78-80`), and the DB function agrees.
- "No audience check" — TRUE: `orgs.audience` is never read here or in `rsvp_on_home_campus`.
- "No officer-block check", "No removal check" — TRUE: neither `blocks` nor `org_removals` is read.
- "No school-verified check: the PUT requires Terms only (`:150`)" — TRUE.
- Not in the critique: the write is on the cookie client, so a DB trigger on `rsvps` runs as `authenticated` unless it is SECURITY DEFINER;
  and `status = 'no'` can only appear through a direct PostgREST write (`rsvps_update_own`), never through this route.

### 8.7 `src/app/api/me/calendar/route.ts` (138 lines) — response shape

- GET only (`:56-138`). Cookie client for everything. Auth → 401 `{ ok:false, error:"Unauthorized" }`.
- Query: `?from=` and `?to=` raw ISO strings, **not validated**; defaults 30 days back / 180 days ahead (`:66-72`).
- RSVP read (`:75-86`): `rsvps.select("status, event:events!inner(id,title,starts_at,ends_at,location, org:orgs(handle,name,verified))")`
  `.eq("user_id", me).in("status", ["going","maybe"]).gte("event.starts_at", from).lte("event.starts_at", to)`.
  The window tests **`starts_at` only**: an event that started before `from` and is still running is left out.
- Personal read (`:87-92`): `personal_events (id,title,starts_at,ends_at,location,notes,color)`.
- **Read errors are logged and swallowed** (`:95-100`): the answer is still 200 with whatever loaded; no error flag.
- Response: `{ ok: true, entries: CalendarEntry[] }`, sorted by `starts_at` ascending (string compare, `:133-135`).

```ts
export type CalendarEntry =
  | { kind: "rsvp"; id: string /* the EVENT id */; title: string; starts_at: string; ends_at: string;
      location: string; color: string /* "#5BD18C" going, "#FFB85A" maybe */;
      viewer_status: "going" | "maybe";
      org: { handle: string; name: string; verified: boolean } | null }
  | { kind: "personal"; id: string; title: string; starts_at: string; ends_at: string | null;
      location: string; notes: string; color: string };
```

- Not in the shape today: the club's id / logo / banner, `org_id`, RSVP counts, any room id or room state. `org` is `null` when `orgs_select`
  hides the club from the viewer (a non-member of an invite-only or hidden club), even though the RSVP row is theirs.
- The colors are hard-coded hex literals (`:114`), not tokens.
- Critique #21 TRUE: the route already takes `from`/`to` and returns RSVP'd events; adding `room_id` + `room_state` is additive.
  `/api/me/upcoming-events` also exists (not mapped here).

### 8.8 `src/app/api/me/threads/route.ts` (731 lines)

| lines | what |
|---|---|
| 57-85 | **`ThreadEntry`**: `id, type ("dm"|"group"|"org_channel"|"org_subchannel"), name, photo_url, peer, members[], last_message { content, created_at, user_id, media_kind, attachment_kind } | null, unread (boolean), accepted_at, is_request, peer_last_read_at, pinned_at, viewer_role ("admin"|"member"), muted_until` |
| 212-393 | POST (create DM / group): rate limit `thread-create:<uid>` 30 per 600 s (`:222`); channel + member rows written with the service role (`:287-323`, `:368-388`) |
| **399-731** | **GET** |
| **414-419** | **the list source**: the viewer's own `channel_members` rows, `select("channel_id, accepted_at, last_read_at, role, channels!inner(id, type, name)")`, cookie client |
| 443-445 | zero rows → `{ ok:true, threads:[], requests:[] }` |
| 451-462 | `channels (id, photo_url)` read |
| **463-488** | **own settings read**: `channel_members.select("channel_id, hidden_at, pinned_at, muted_until")` for the viewer, **cookie client** (critique #8 cites `:466`) |
| **491-498** | **peers read**: `channel_members.select("channel_id, user_id, last_read_at, role, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url, school)")` `.in("channel_id", channelIds).neq("user_id", me)`, **cookie client**, for EVERY channel in the list, club channels included |
| 512-536 | builds `peerByChannel`, `membersByChannel`, **`peerLastReadByChannel` (`:533-535`, first row wins)** |
| 545-564 | last messages: `messages` for all channel ids, newest first, `.limit(channelIds.length * 5)`, reduced in memory (`:575-587`) |
| 596-601 | block filter through `loadHiddenUsers`, fails closed (500) |
| 606-679 | per-thread loop: blocked 1:1 skipped (`:612-618`), phantom-request guard (`:625-629`), soft-hide (`:633-637`), **`unread` (`:639-642`)**, display name (`:647-658`), entry (`:660-675`) |
| 671 | `peer_last_read_at: peerLastReadByChannel.get(channel_id) ?? null` — set for club channels too |
| 684-707 | sort: pinned first, then last-message time; 1:1 deduped by peer id |
| 712-724 | group photo keys → signed URLs |
| 726-730 | `{ ok: true, threads, requests }` |

**Where club channels are listed:** nowhere special. There is NO club branch in this route. A club channel appears only because the viewer holds a
`channel_members` subscription row on it (`:414-419`), and it is emitted as an ordinary entry with `type: "org_channel"`, `name` = the channel's
name (e.g. `general`), `peer` = the first co-member, `members` = every co-member. Consequences:
- The entry carries **no `org_id`, club name, club handle, logo, `is_private`, position or kind** (`channels!inner(id, type, name)` only).
- A member with no subscription rows sees no club channel in the inbox; locally that is 5 of 6 memberships, owners included (7.3).
- A private channel has no subscription rows by design (the public → private flip deletes them, 8.4), so Officers rooms never appear here.
- There is no `hidden_at`-of-the-club check; visibility is whatever `channels` RLS lets the inner join return.

**Where peers' `last_read_at` is read:** `:491-498` (query), `:533-535` (map), `:671` (output). Critique #8's `threads/route.ts:491-534` is right.
For a club channel it exposes one arbitrary co-member's `last_read_at` as `peer_last_read_at`.

Verified against the critique:
- #22 "loads every co-member row of every club channel (`:492-498`)" — TRUE, with a users join per row.
- #8 "'Per-user unread counts computed server-side' is already true (`:639-642`)" — **PARTLY**: what is computed is a per-thread BOOLEAN
  (`unread`), from the single latest message. There is no unread COUNT anywhere, so the inbox's "Lounge N new" is new work.
- The last-message read has no `parent_message_id` filter: a Board reply would become the Board's preview line and flip `unread`.
- `.limit(channelIds.length * 5)` is shared across channels; busy channels can starve quiet ones of their preview (and a pending request with
  no loaded `last` is hidden by the phantom-request guard).

### 8.9 Report snapshot — the file is `src/app/api/me/reports/route.ts` (575 lines)

**`src/app/api/reports/route.ts` does not exist.** The critique's `reports/route.ts:321-324` means `src/app/api/me/reports/route.ts:321-325`.
Related: `src/lib/moderation/reports.ts` (269), `src/lib/moderation/report-visibility.ts`, `src/app/api/admin/reports/route.ts` (547),
`src/app/api/admin/reports/resolve/route.ts` (130), `src/app/admin/reports-client.tsx`.

| lines | what |
|---|---|
| 64 | `NEW_REPORT_COLUMNS = ["status", "target_owner_id", "target_snapshot"]` |
| 85 | `POST_SNAPSHOT_COLUMNS = "id,user_id,content,media_url,media_thumbnail_url,created_at,org_id"` |
| 285-344 | `readTarget(supabase, type, id, viewerId)` — reads the target with the **REPORTER's cookie client**, so RLS decides "may this student see it" |
| **317-336** | the per-type spec table |
| **321-325** | **message**: `{ table: "messages", columns: "id,user_id,channel_id,content,media_url,created_at", owner: "user_id" }` |
| 326 | channel: `"id,type,name,org_id,created_at"`, no owner |
| 328-332 | event: `"id,title,description,creator_id,org_id,starts_at"`, owner `creator_id` |
| 337-343 | one read `.eq("id", id).maybeSingle()`; no row → `not_found` (only comments and posts get the cross-block fallback) |
| 347-368 | `withOwnerHandle` adds `owner_handle`, `owner_name` to the snapshot |
| 461-575 | POST: auth → JSON → validate type / uuid / reason → rate limit `report:<uid>` 10 per 3600 s (`:494`) → `requireNotRestricted` (`:499`) → `readTarget` (`:502`) → own-thing refusal → `alreadyOpen` → snapshot → **service-role INSERT** into `reports` with `target_owner_id`, `target_snapshot` (`:527-531`) → admin alert email |

Facts:
- Critique #14 TRUE: the message snapshot is exactly `id, user_id, channel_id, content, media_url, created_at`. It has no `media_kind`,
  `attachment_id`/`attachment_kind`, `parent_message_id`, and would have no `kind` or card payload.
- The snapshot is a flat `pick` of one row from ONE table; a card payload in a side table needs a second read, and if that side table has zero
  client grants (critique #13) the read must be service-role, unlike the rest of `readTarget`.
- A message already removed by a moderator is invisible to everyone but its sender (RLS), so it cannot be reported again: `not_found`.
- `target_snapshot` is a jsonb-style object column; adding keys needs no migration.

### 8.10 Neighbours wave 1 will touch (short)

Thread sub-routes under `src/app/api/me/threads/[id]/`. **All eight use the cookie client only, none calls `ensureMember`, none has a rate
limit**; they rely on `channel_members_update_own` / `channel_members_delete_own_pending` plus the column grants in 3.2:

| route | lines | write |
|---|---|---|
| `typing/route.ts` | 42 | `channel_members.update({ typing_until })` (`:27-28`) |
| `read/route.ts` | 30 | `channel_members.update({ last_read_at: now })` (`:20-21`) |
| `clear/route.ts` | 41 | `update({ cleared_at: now })` (`:28-29`) |
| `hide/route.ts` | 34 | `update({ hidden_at: now })` (`:24-25`) |
| `mute/route.ts` | 99 | `update({ muted_until })` (`:56-57`, `:89-90`) |
| `pin/route.ts` | 61 | own-row read of `pinned_at` (`:31-36`), then `update({ pinned_at })` (`:51-52`) |
| `accept/route.ts` | 48 | `update({ accepted_at: now })` (`:38-39`) |
| `decline/route.ts` | 68 | deletes the caller's own pending row (`:32-33`) |

- For a club channel these only do anything when the caller HOLDS a subscription row. With no row the UPDATE matches 0 rows and the route still
  answers ok. So read state for a club room (the inbox Board dot, "N new") cannot be stored for most members today (7.3).
- `messages/[messageId]/route.ts` (60): DELETE is sender-only and HARD, on the cookie client: lookup `:30-36`, 404 `:40-42`, 403 "Only the
  sender can delete this message" `:43-48`, delete `:50-54`. Critique #14 cites `:45-52`; TRUE.
- `messages/[messageId]/react/route.ts` (119): POST `:55`, DELETE `:90`, `message_reactions` on the cookie client (`:73`, `:108`); no rate
  limit and no route-level restriction gate (the policy's `NOT is_restricted_now()` is the gate, a refusal is a bare 500).
- Other own-row `channel_members` reads on the cookie client (critique #8): `src/app/api/me/otto/route.ts:426-431`
  (`channel_id,last_read_at,accepted_at,hidden_at`, DMs only), `src/lib/push/badge.ts:87-91`
  (`channel_id, accepted_at, last_read_at, hidden_at, muted_until, channels!inner(type, org_id)`), `threads/[id]/pin/route.ts:31-36`.
- @mention PICKER vs mention FAN-OUT disagree for clubs. The picker (`src/app/api/users/search/route.ts:70-95`) gates with `ensureMember`
  (`:75`) and then reads the room's `channel_members` rows on the cookie client (`:84-88`): "A club member with no subscription row reads none:
  empty list". The fan-out (8.1) notifies any `org_members` row. So today the picker offers FEWER people than the server will notify.
- `GET /api/me/upcoming-events` exists (`src/app/api/me/upcoming-events/route.ts`), as critique #21 says. Not mapped here.
- No notification-settings table exists. Public tables (local, 45): account_restrictions, billing_customers, billing_events, blocks,
  bookmark_collections, bookmarks, campuses, channel_member_mutes, channel_members, channels, comment_likes, connections, email_sends,
  entitlements, events, message_reactions, messages, moderation_actions, mutes, notifications, org_channel_members, org_follow_firsts,
  org_followers, org_invites, org_join_requests, org_members, org_removals, orgs, otto_reminders, personal_events, post_comments, post_likes,
  post_reposts, post_views, posts, profile_views, push_devices, push_outbox, rate_limits, reminders, reports, rsvps, suggestion_dismissals,
  terms_acceptances, users. (`billing_*`, `entitlements`, `push_*` are local-only per critique #9/#25.) No `chat_*` name is taken.

---

## 9. Existing feature-flag / allowlist mechanisms

There is no flag table in the database and no flag service. Three env-driven mechanisms exist; the first is the one `chat_v2` should copy.

### 9.1 Push: switch + per-user allowlist — `src/lib/push/config.ts` (225 lines)

| lines | what |
|---|---|
| 1-20 | header: pure module, **no `server-only`, no imports at all**, so `node --test` loads it; env list |
| 22, 25 | `PUSH_SITE_ORIGIN = "https://www.connectvibe.app"`, `PUSH_DEV_ORIGIN = "http://localhost:3000"` |
| 36-40 | `pushSiteOrigin(env)`: `VERCEL_ENV === "production"` → site; `NODE_ENV === "development"` → localhost; **anything else (Preview, `next start`, tests) → null** |
| 46-48 | `pushEnabled(env)`: `env.PUSH_ENABLED === "true" && pushSiteOrigin(env) !== null` |
| **57-67** | **`pushAllowedFor(userId, env)`** |

```ts
export function pushAllowedFor(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!pushEnabled(env)) return false;
  const id = typeof userId === "string" ? userId.trim().toLowerCase() : "";
  if (!id) return false;
  const list = (env.PUSH_ALLOWLIST ?? "").trim();
  if (list === "*") return true;
  return list
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== "" && entry === id);
}
```

Shape to copy:
- Two env vars: a switch (`PUSH_ENABLED`, exactly `"true"`) and a list (`PUSH_ALLOWLIST`: `"*"` = everyone, a comma list of **user ids**, unset or
  blank = nobody). "going public is a deliberate `*`" (`:52-55`).
- Every function takes `env` as a parameter defaulting to `process.env`, so tests pass a fake env (`src/lib/push/config.test.ts:82-97`; run with
  `node --test --experimental-strip-types`).
- Server-read, never `NEXT_PUBLIC_`. Off on Preview by construction (Preview shares the production database, `.env.example:133-136`).
- Documented in `.env.example:141-146` with the value line commented out and empty ("the repo is public").
- Call sites (the flag is re-checked at every layer, not once):
  - `src/app/api/me/push-devices/route.ts:191` — GET tells the client `available: tableExists && pushAllowedFor(userId, process.env)`
  - `src/app/api/me/push-devices/route.ts:233` — POST refuses with `pushUnavailable(403)`
  - `src/lib/push/dispatch.ts:97`, `:131`, `:332` — `pushEnabled` short-circuits
  - `src/lib/push/dispatch.ts:190` — recipients filtered by `pushAllowedFor`
  - `src/lib/push/dispatch.ts:622` — re-checked per row at send time (`skip("not_allowed")`)
  - `src/app/api/health/push/route.ts:38-45` — admin-only health report of the switch and list
- Companion idiom in the same file: `isMissingPushSchema(error)` (`:198-211`, codes `42P01`, `PGRST205`, `PGRST202`, `42883`) and
  `warnMissingPushSchemaOnce(tag)` (`:219-225`) — "code ships before the migration" must read as "feature off", never a 500.

Gaps against what `chat_v2` needs ("founders + SAE", wave-plan section 0):
- The list is **per user id only**. There is no club dimension: "on for SAE" means either listing every SAE member's user id or adding a second
  list keyed by club id / handle. Decide which in the contract.
- It is an env var, so the value is fixed per deployment; on Vercel a changed env var applies to the next deployment (Vercel behaviour, not
  verified here). "Flip the flag at launch" = change the value and redeploy.
- The client learns the answer only from a route (`available` in a GET body). Nothing exposes flags to client components generically.

### 9.2 Billing switch — `src/lib/billing/config.ts:102-108`

`billingEnabled(env)` = `env.BILLING_ENABLED === "true" && isSet(env.STRIPE_SECRET_KEY) && webhookSecretSet(env)`. Same style (pure module,
`env` parameter, `config.test.ts`), switch only, no allowlist. `.env.example:125-131`.

### 9.3 Build-time public flag — `src/lib/feature-flags.ts` (13 lines)

```ts
export function isGlobalFeedSurfaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_GLOBAL_FEED === "true";
}
```

Used by `src/proxy.ts:5`, `src/app/feed/page.tsx:6`, `src/app/profile/profile-html-bridge.tsx:9`. It is `NEXT_PUBLIC_`, so it is inlined at BUILD time
and is the same for every user — the wrong shape for a per-user rollout, but it is the existing home for a flag helper file name.

### 9.4 Not flags, but existing "who is special" checks

- `users.is_platform_admin` (DB column, service-role only since `20260927141000`): read by the admin routes and by `org_content_visible`. It marks
  platform admins, not "founders who see chat_v2".
- `NEXT_PUBLIC_SW_DEV`, `NEXT_PUBLIC_SW_KILL` (`.env.example:57-61`): service-worker switches.

---

## 10. Next.js guides relevant to route handlers and proxy

Installed: `next` **16.3.4** (`node_modules/next/package.json`). Docs root `node_modules/next/dist/docs/` (452 files: `01-app`, `02-pages`,
`03-architecture`, `04-community`, `index.md`). All paths below are under `/Users/franciscocazares/vibe/node_modules/next/dist/docs/01-app/`.

Route handlers
- `01-getting-started/15-route-handlers.md` — convention, supported verbs, caching, route resolution, `RouteContext` helper.
- `03-api-reference/03-file-conventions/route.md` — full reference: verbs, `request`, `context.params` (a Promise), cookies, headers, streaming, body, segment config.
- `03-api-reference/03-file-conventions/dynamic-routes.md` — `[id]` / `[...slug]` segments and how `params` is shaped.
- `03-api-reference/03-file-conventions/02-route-segment-config/index.md` — segment config options overview.
- `03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` — `runtime` export.
- `03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` — `maxDuration` export.
- `03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md` — `preferredRegion` export.
- `03-api-reference/04-functions/next-request.md` — `NextRequest`.
- `03-api-reference/04-functions/next-response.md` — `NextResponse`.
- `03-api-reference/04-functions/cookies.md` — `cookies()` (async only).
- `03-api-reference/04-functions/headers.md` — `headers()` (async only).
- `03-api-reference/04-functions/after.md` — `after()` for work after the response (the push enqueue uses this pattern).
- `03-api-reference/04-functions/connection.md` — `connection()` to opt a handler into request time.
- `02-guides/backend-for-frontend.md` — route handlers as an API: payloads, rate limiting, security, proxying, caveats.
- `02-guides/data-security.md` — data access and server-only boundaries.
- `02-guides/authentication.md` — auth patterns in handlers and proxy.
- `01-getting-started/10-error-handling.md` — error handling.
- `01-getting-started/08-caching.md` — caching model (GET handlers).
- `02-guides/caching-without-cache-components.md` — caching when Cache Components is off.

Proxy / middleware
- `01-getting-started/16-proxy.md` — what Proxy is, use cases, convention, example.
- `03-api-reference/03-file-conventions/proxy.md` — full reference: `proxy` export, `config.matcher`, execution order, runtime, cookies/headers, "Migration to Proxy".
- `03-api-reference/03-file-conventions/middleware.md` — 21-line stub: `middleware.js` is **deprecated in Next.js 16 and renamed to `proxy.js`**.
- `03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md` — request body size limit through the proxy.

Upgrade notes (the breaking changes AGENTS.md warns about)
- `02-guides/upgrading/version-16.md` — the v16 list: async request APIs, `middleware` → `proxy`, Turbopack default, caching APIs.
- `02-guides/upgrading/version-15.md` — where async request APIs began.
- `02-guides/upgrading/codemods.md` — codemods, including `middleware-to-proxy`.
- `01-getting-started/18-upgrading.md` — upgrade entry point.
- `03-api-reference/05-config/01-next-config-js/turbopackFileSystemCache.md` — the FS cache flag (off in this repo since S65, see memory).

Three facts from those guides that bind wave-1 route code (each already followed by the existing routes):
1. `context.params` is a **Promise** and must be awaited (`route.md:82-103`; v16 removed sync access, `version-16.md:281-293`). Existing style:
   `type RouteCtx = { params: Promise<{ id: string }> }` then `const { id } = await ctx.params` (`messages/route.ts:202,209`). A global
   `RouteContext<'/path/[id]'>` helper exists after `next typegen` (`route.md:105-121`); the repo writes its own type instead.
2. The proxy file is `proxy.ts` exporting `proxy` and `config`; its **runtime is `nodejs` and cannot be configured**, the `edge` runtime is not
   supported there (`version-16.md:612-616`).
3. `cookies()`, `headers()`, `draftMode()` are async-only.

Repo facts that go with them:
- The proxy lives at **`src/proxy.ts`** (330 lines; `export async function proxy` `:222`, `export const config = { matcher }` `:326`). There is no
  `middleware.ts` at the root or in `src/`. Header comment `:7-14`: the dev server only watches `src/{proxy,middleware}.*`.
- For a suspended/banned session the proxy **refuses every non-GET/HEAD/OPTIONS request under `/api/`** with a 403, except the list in
  `restrictedApiAllowed` (`:175-181`): `/api/auth/logout`, `DELETE /api/me`, `/api/billing/portal`, `DELETE /api/me/push-devices`, `/api/me/block`,
  `/api/me/mute`. New chat write routes (cards, votes, claims) are covered by that default with no proxy change; the route gates are still
  required ("the proxy's 403 on non-GET /api/* is the fast path, not the wall", `src/app/api/orgs/route.ts:673-675`).
- `AGENTS.md` itself is re-written by `next dev` (`node_modules/next/dist/server/lib/generate-agent-files.js`).

---

## Differences from the critique

Scope: findings #1, #2, #3, #7, #8, #10, #12, #14, #15, #16, #17, #18, #21, #22, #25 were checked against the repo and the LOCAL database.
Production was not queried, so every production-only statement is listed as "not re-verified", not as confirmed.

### Confirmed as written (no difference)

- **#1** `authenticated` holds table-level INSERT on `messages` (3.1); `messages_insert_org_member` checks only `can_view_org_channel` (2.2); the
  default ACL gives `anon` + `authenticated` `arwdDxtm` on new tables (3.4); the standing rule is at `20260922090000:48-51` (4.6).
- **#2** `can_view_org_channel` returns false for a non-member (4.1); the `org_members` AFTER DELETE trigger deletes every `channel_members` row on
  the club's channels (5); `rsvps_update_own` exists (2.5).
- **#3** every listed gap in the RSVP path (no campus, no audience, no officer-block, no removal, Terms only) (8.6, 4.4).
- **#8** the settings columns are readable because of the table-level SELECT; the only column grants are UPDATE ones (3.2); the own-row reads on
  the cookie client are where it says (8.2, 8.8, 8.10).
- **#12** `messages_parent_message_id_fkey ON DELETE SET NULL`, `messages_user_id_fkey ON DELETE CASCADE` (1.2); a missing parent is dropped
  silently at `messages/route.ts:478` (8.1).
- **#14** message snapshot columns; sender-only hard delete (8.9, 8.10).
- **#15** club mention targets come from `org_members` (`messages/route.ts:579-585`).
- **#16** `notifications_type_check` has 8 types (1.9); no notification-settings table exists (8.10).
- **#17** PATCH/DELETE can change or remove any channel, POST has no cap, default channels carry no `kind` and their error is non-fatal (8.3, 8.4).
- **#18** `events` has no cover / bring / rides / status / visibility column (1.7).
- **#21** `/api/me/calendar` takes `from`/`to`; `/api/me/upcoming-events` exists (8.7, 8.10).
- **#22** the thread list loads every co-member row of every listed channel (8.8).
- **#25** new versions must be above `20260930100000` (6.1).

### Different, or missing from the critique

1. **Wrong path for the report route.** It is `src/app/api/me/reports/route.ts` (`:321-325`). `src/app/api/reports/route.ts` does not exist (8.9).
2. **`can_view_org_channel` was last defined in `20260922120500_t2b_org_helper_guards.sql:270`**, not `20260922090000:142` (that is what
   `code-map.md` cites; the critique gives no file). The t2b body adds the arm "`authenticated` asking about someone else → false". A PRE-FLIGHT
   fingerprint and the restated body must start from the t2b text (4.1, md5 in 6.3). Same for `is_org_member` (`:240`) and `org_member_role` (`:257`).
3. **The local seed cannot rehearse the backfill.** Critique #7's "5 clubs, 12 channels, 15 club messages, 1 reply" are production numbers. Local
   has 5 TEST clubs, 8 club channels (`general` + `announcements` x 4, all public), 0 club messages, 0 replies, 0 private channels, 0 allow-list
   rows, no SAE, no `exec`, no `events` channel (7.1-7.2). "Dry-run on the local seed" proves nothing about SAE until the seed gains a private
   `general`, a second private channel, a third public channel, messages and a reply. It does already have a club with NO channels
   (`test_bloomington_cycling`).
4. **Local `schema_migrations` stops at `20260926100000`; 19 later files are applied but unrecorded** (6.2). #25 mentions only that local has
   billing and push. A wave-1 PRE-FLIGHT must read the catalog, never `schema_migrations`, and local applies go through `psql -f`.
5. **"Unread counts computed server-side is already true" (#8) is a boolean, not a count.** `threads/route.ts:639-642` computes `unread: boolean`
   from the single latest message. No unread count exists anywhere; "Lounge N new" is new work (8.8).
6. **`channel_members` rows on club channels are sparse, and owners have none.** Club creation does not subscribe the owner (8.3); only
   `admitMember` and `POST .../channels/subscribe-public` create rows; the public → private flip deletes every row (8.4). Locally 5 of 6
   memberships have zero rows (7.3). #7 says new Board/Lounge rows need subscription rows; the wider fact is that EXISTING channels lack them too,
   so nothing that needs a row works for most members today: the inbox listing (8.8), read state / `last_read_at` (8.10), the mention picker
   roster (8.10).
7. **"`channel_members` is readable by co-members" (#4) needs a qualifier.** The policy is `is_channel_member(channel_id) AND
   can_read_channel_roster(channel_id)` (2.4): only someone who HOLDS a row in that channel reads its roster.
8. **The messages POST inserts with the caller's cookie client, not the service role** (`messages/route.ts:515-519`). So the restated INSERT
   policies sit in the route's own path and every RLS refusal is a bare 500. #12 notes this for the missing-parent case only. In general: the
   Board rule needs a route-level 403 BEFORE the insert, and card kinds cannot be written by this route's client once direct inserts are
   `kind = 'text'` only.
9. **Two tables were never hardened.** `message_reactions` and `org_channel_members` still give `anon` and `authenticated` the full default ACL,
   TRUNCATE included, and no migration contains a grant or revoke for them. `authenticated` also still holds TRUNCATE / REFERENCES / TRIGGER on
   `channels`, `messages`, `channel_members`, `org_members` (3.1).
10. **`event_rsvp_counts` has no floor.** It returns 1 as 1 (4.4). #4's "N going is shown from 5 up" would be a new rule, not an existing one.
11. **`event_visible` has a third arm**: anyone holding ANY `rsvps` row for the event sees it, `status = 'no'` included, even after the club is
    hidden (4.4). #3 describes only the club-not-hidden arm.
12. **Only VERIFIED clubs can create events** (`events/route.ts:497-499`). #18 says POST requires `org_id`; it also requires `orgs.verified`, so event
    rooms can exist only for verified clubs (8.5).
13. **The RSVP route never writes `status = 'no'`** (`rsvp/route.ts:160-163`); `no` is reachable only by a direct PostgREST write. The sync trigger
    in #2 must still handle it.
14. **A voluntary leave keeps the person's RSVPs but deletes their room rows** (5). With members-only rooms that is consistent, but the contract
    must say the RSVP stays on the calendar while the room disappears, and that re-joining must re-create the room row.
15. **The push allowlist has no club dimension** (9.1). #6 says "founders plus SAE allowlist, the same shape as founders-only push"; that shape is a
    comma list of USER ids. "SAE" means listing its members' ids or adding a club list.
16. **`rsvp_on_home_campus` is more permissive than #3 lists**: besides "no home campus", it also returns true when the EVENT has no campus, for any
    member of the club, and when the event or user row is missing (coalesce to true) (4.4).
17. **The mention picker and the mention fan-out disagree** for clubs (8.10). #15 covers only the fan-out.
18. **Line references that drifted** (content is right): `messages/route.ts:560-615` → `:568-619`; `api/orgs/route.ts:884-897` → `:882-900`;
    `channel-access.ts:73-80` → `:75-84`; `membership.ts:214` → `:215`; trigger "`20260928100000:295`" → function `:288-318`, trigger `:323-325`.

### Not re-verified here (production only, or outside wave 1)

- SAE's four channels, their privacy and message counts (#7); the production migration list and "applied up to `20260930100000`" (#9, #25);
  "production has neither billing nor push" (#9, #25); "0 events without a club" and "13 events" on production (#18); the production function
  ACL pre-checks (#9); "local DB, same shape as production" (#1).
- #5 (`_miniMessenger.js:841`, `messages.html`), #6 (`mobile/capacitor.config.ts`), #11 (`MessagesMobile.tsx` line ranges), #13, #19, #20, #23,
  #24, #26-#30: not part of this pack.

---

## 11. Production read (S69 orchestrator, 2026-09-29, read-only, structure and counts only)

Read through the Supabase MCP (`execute_sql`, SELECT only). No personal data was read.

**11.1 Fingerprints: production = local for every function in 6.3.** All 17 md5s match exactly (`can_view_org_channel` `269c1185…`,
`is_org_member` `d4353094…`, `org_member_role` `1547cd73…`, `org_members_drop_club_access` `0e7baa97…`, `event_rsvp_counts` `eb789168…`, and the
rest). `rate_limit_hit` on production: `e77f30a2c7c0812b2c963fb85b33dbd1`. `claim_push_outbox` does NOT exist on production (push not applied).
`notifications_type_check` md5 = `ea05702e9a2bcf9096c2f71fa323344b` (the 8-type list), same as local.

**11.2 Policies: production = local.** Every `qual` / `with_check` on `messages`, `channels`, `channel_members`, `rsvps`, `message_reactions`
is the text in section 2, character for character (19 policies, all PERMISSIVE, all `{authenticated}`).

**11.3 Grants and columns.** `messages` ACL: `authenticated=ardDxtm`, `service_role=arwdDxtm`, no anon. `messages` columns and `channels`
columns are the lists in 1.1 / 1.2 (no `kind`, `event_id`, `thread_root_id`, `card_event_id`). No `chat_*` relation exists. No `push_*` table.

**11.4 Migrations.** `schema_migrations`: 94 rows, max version `20260930100000`. (Repo has 96 files: billing `20260922150000` and push
`20260924120000` are the two not applied.)

**11.5 Clubs and club channels (5 clubs, 12 channels, all `type = 'org_channel'`, 0 `org_subchannel`, 0 org channels without a club):**

| club | verified | hidden | join | members | officers | channel | private | pos | messages | replies | subscription rows | allow-list rows |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sae | yes | no | invite | 1 | 1 | general | **yes** | 0 | 3 | 0 | 0 | 0 |
| sae | | | | | | announcements | no | 1 | 0 | 0 | 1 | 0 |
| sae | | | | | | events | no | 2 | 0 | 0 | 1 | 0 |
| sae | | | | | | exec | **yes** | 3 | 0 | 0 | 0 | 0 |
| test-6ca4ec6e | yes | yes | open | 2 | 1 | general | no | 0 | 0 | 0 | 0 | 0 |
| test-6ca4ec6e | | | | | | announcements | no | 1 | 0 | 0 | 0 | 0 |
| test-6e881851 | no | yes | request | 1 | 1 | general | no | 0 | 0 | 0 | 0 | 0 |
| test-6e881851 | | | | | | announcements | no | 1 | 0 | 0 | 0 | 0 |
| test-a73bee3e | no | yes | request | 1 | 1 | general | no | 0 | 0 | 0 | 0 | 0 |
| test-a73bee3e | | | | | | announcements | no | 1 | 0 | 0 | 0 | 0 |
| test-f7ae4129 | yes | yes | open | 2 | 1 | general | no | 0 | 10 | 1 | 0 | 0 |
| test-f7ae4129 | | | | | | announcements | no | 1 | 2 | 0 | 0 | 0 |

- Totals: 15 club messages, 1 reply (matches the critique). **SAE has exactly ONE member, its owner.** So opening `general` as the Lounge shows
  the 3 old messages to nobody new today.
- Subscription rows are missing almost everywhere on production too (2 rows in total, both SAE's): the "every member has a row on every public
  room" invariant must be created by the backfill.
- The 2 messages in `test-f7ae4129 / announcements`: if either was written by a non-officer it becomes a member's top-level Board post after the
  backfill. It is a hidden test club; the contract leaves them (no data is deleted).

**11.6 Events and RSVPs.** 13 events, 0 without a club, **0 upcoming**, 3 inside the "7 days after the end" window today. RSVPs: 7 going/maybe,
0 `no`.
