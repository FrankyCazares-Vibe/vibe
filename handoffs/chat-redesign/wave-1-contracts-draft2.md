# Club chat v1 — wave 1 contracts (S69, 2026-09-29)

**Status: DRAFT 2, after the plan critic.** Draft 1 is kept as `wave-1-contracts-draft1.md`; the critic's report is `wave-1-contracts-critique.md` (5 high, 15 medium, 16 low). Every finding is answered here: taken, or listed in section 12 with the reason. Nothing is built yet.

Inputs, in the order they win: `wave-0-decisions.md` (Franky's calls) → `wave-1-contracts-critique.md` → `plan-critique.md` → `wave-plan.md` section 0 → the rest of `wave-plan.md`. Facts about today's code and database: `wave-1-asis.md` (sections 1–10 local, section 11 production, read Sept 29; production = local for every function md5 and every policy text).

Every batch reads this file first and may not change a name, column, route, payload field or error code in it. If a batch finds the contract wrong, it stops and says so; it does not improvise.

## 0. What wave 1 is, and what moved out of it

The critic's verdict on draft 1: the database design holds, the wave was too big for three days and the batches could not run side by side. So wave 1 is now **the rooms and the Board rule, safely, and nothing else**.

**Wave 1 (Sept 30 – Oct 2), in this order:**

1. **B0** — pure modules, types, the flag, the shared read helper (alone).
2. **B1a** — migration A + the seed, applied to the local database, POST-CHECK green (alone).
3. **B1b, B4, B5** side by side — B1b: channel routes + club creation; B4: thread routes + the leave and media guards; B5: the old screens.

**Moved to the week of Oct 5 (wave 2), pinned here so the screens can be built against them:** all of cards (migration B, the card routes, `hydrate`, `snapshot`, `fallback` — sections 4 and 5), the three reads (section 7), the officer/mod remove route (section 6.3).
**Moved to after launch:** the mention picker for the Officers room, the 3-room cap (Franky put custom rooms after launch).
**Its own small file, any day, not chat:** the grants clean-up on `message_reactions` and `org_channel_members`.
**Not in v1 at all:** push, notification settings, `board_post` notification rows, "seen by", Realtime, typing/presence in club rooms, photos in club rooms, Headcount, Bring/Rides/"I'm here"/album, custom-room UI, message pinning, the settings-columns privacy fix, the React desktop Messages, non-member event rooms (stretch, section 9).

**What everyone sees change after wave 1 (flag or no flag):**

1. In a club's Board (the old `announcements`) only owners and admins can write a new post. Members see "Only officers post here."
2. Club rooms are named by their club in the old inbox: "Salsa Club · Lounge", "Salsa Club · Board".
3. Every member has every public room of their clubs in the old inbox (today most have none, asis 7.3 / 11.5).
4. A club room cannot be left, renamed or added to from the old inbox, and has no attach button (no photos in club rooms in v1).
5. Under Going / Maybe on a club's event: "You'll appear in the event chat."

Cards stay invisible: `messages.kind` exists and is always `text`.

## 1. Names (the only words allowed)

| thing | in the product | in code / DB |
|---|---|---|
| where officers post | the Board | `channels.kind = 'board'`, name `board` |
| where members talk | the Lounge | `kind = 'lounge'`, name `lounge` |
| officers' private room | Officers | `kind = 'officers'`, name `officers`, `is_private = true` |
| an event's chat | event chat / "Fall Formal" | `kind = 'event'`, `event_id` set, `is_private = true` |
| an extra room (exists today, no new UI in v1) | room | `kind = 'room'` |
| a reply under a Board post | reply | `messages.thread_root_id` = the Board post |
| poll | Poll | `messages.kind = 'poll'`, `chat_polls.mode = 'poll'` |
| sign-up | Sign-up | `messages.kind = 'poll'`, `chat_polls.mode = 'signup'` |
| shared event with Going / Maybe | Event | `messages.kind = 'event_card'`, `messages.card_event_id` |
| a person's label in a club | "Your hat" | **the role** (Franky, Sept 29): owner → "Owner", admin → "Officer", mod → "Mod", member → "Member". Custom titles come after launch. |

- Never in copy or new identifiers: channel, server, thread (user-facing), `#`. Existing identifiers (`channels`, `channel_members`, `/api/me/threads`) keep their names.
- "Officer" means two different lists in the repo today (`OFFICER_ROLES` has mods, `CHANNEL_ADMIN_ROLES` does not). Chat code never imports `OFFICER_ROLES`. B0 exports the two lists chat uses: `BOARD_POSTER_ROLES = ["owner","admin"]` and `ROOM_MODERATOR_ROLES = ["owner","admin","mod"]`.

## 2. The flag `chat_v2` (B0)

Copy the push shape (asis 9.1): pure module, `env` parameter, node tests.

- Env (server only, never `NEXT_PUBLIC_`), documented in `.env.example` with empty values, **set for the Production environment only** (Vercel Preview builds run against the production database):
  - `CHAT_V2_ENABLED` — exactly `"true"` turns the feature on at all. Anything else = off for everyone.
  - `CHAT_V2_ALLOWLIST` — `*` = everyone; else a comma list of user ids; blank = nobody.
  - `CHAT_V2_CLUBS` — comma list of club (org) ids; every current member of a listed club is in.
- `src/lib/chat/flag.ts` (pure, no imports): `chatV2Enabled(env)`, `chatV2Everyone(env)`, `chatV2ListedUser(userId, env)`, `chatV2ClubIds(env): string[]`. Ids compared trimmed + lower-case.
- `src/lib/chat/flag-server.ts` (`server-only`): `chatV2For(userId): Promise<boolean>` = enabled AND (everyone OR listed user OR a service-role `org_members` row for the user in any listed club). A read error answers `false` (fail closed) and logs once.
- `GET /api/me/features` → `200 { ok: true, chat_v2: boolean }`, `Cache-Control: private, no-store`; 401 when signed out. The only way a screen learns the flag.
- What the flag gates: the card routes, the two NEW reads (`/api/me/inbox`, `/api/orgs/[slug]/space`), and the new screens. A gated route answers **404 `not_found`** when the flag is off for the caller.
- What it does NOT gate: the database, the Board rule, event rooms existing, the new fields on the thread GET, and **`/api/me/calendar`** (an existing route that desktop "My Calendar" uses; with the flag off its three new fields are `null`).
- Missing schema = feature off, never a 500: `src/lib/chat/schema.ts` exports `isMissingChatSchema(error)` (codes `42P01`, `42703`, `PGRST204`, `PGRST205`, `PGRST202`, `42883`) and `warnMissingChatSchemaOnce(tag)`. Section 3.10 says what each changed route does then.
- Rollout: the three founders' ids + `CHAT_V2_CLUBS` = SAE's id from the week of Oct 5. **On for everyone Mon Oct 26, when doors open** (Franky, Sept 29): set `CHAT_V2_ALLOWLIST=*` and redeploy.

## 3. Migration A — rooms, Board rule, message columns (B1a)

File `supabase/migrations/20261001100000_chat_v2_rooms.sql`. House style of `20260930100000_event_cancel_notices.sql` (asis 6.4): header sections, `begin; set local lock_timeout = '5s';`, PRE-FLIGHT, numbered steps, POST-CHECK in the same transaction, `notify pgrst, 'reload schema';`, `commit;`. Error prefix `chat-rooms:`. New functions use `set search_path to ''` and fully qualified names.

**B1a owns every change to existing tables. No other batch writes a policy, constraint or trigger on `messages`, `channels`, `channel_members`, `rsvps`, `events` or `org_members`.** (One exception, in wave 2: `chat_votes_drop_access`, section 4.1.)

**Statements appear in the file in the order 3.1 → 3.9.** The triggers and functions do not exist during 3.2 and 3.3; the rooms and rows that are missing are created in 3.7, after them.

### 3.0 PRE-FLIGHT (catalog reads only, never `schema_migrations`)

Refuse to run unless all hold:
- md5 of `can_view_org_channel` = `269c1185295552f74930f1acffd7c170`; of `org_members_drop_club_access` = `0e7baa973042be8ca0decb7df1ca6407`.
- `with_check` of `messages_insert_member` and of `messages_insert_org_member`, and `qual` of `channel_members_delete_own_pending`, equal the texts in asis 2.2 / 2.4; no other permissive INSERT policy on `messages`; no other permissive DELETE policy on `channel_members`.
- Names are free: columns `channels.kind`, `channels.event_id`, `messages.kind`, `messages.thread_root_id`, `messages.card_event_id`; every constraint, index, function and trigger this file adds.
- 0 rows with `type = 'org_subchannel'`; 0 org channels with `org_id` null; 0 dm/group rows with `org_id` set.
- No org channel is already named `board`, `lounge` or `officers`. No club has two org channels with the same name among `general`, `announcements`.
- No private channel that step 3.2.4 would pick has an allow-list row for someone who is not an owner/admin (they would land in "Officers").
- **SAE (handle `sae`) has at most 1 member.** Franky's call c was made on that fact. More than 1 → stop and ask him.
- 0 club-room messages with `media_url` set (local: 0; the production count is read before the apply and written in the header). Not 0 → stop and ask Franky.
- Row guards: org channels ≤ 60, clubs ≤ 40 (production today: 12 and 5).

### 3.1 New columns and indexes

```sql
alter table public.channels add column kind text, add column event_id uuid references public.events(id) on delete cascade;
alter table public.messages
  add column kind text not null default 'text',
  add column thread_root_id uuid references public.messages(id) on delete cascade,
  add column card_event_id uuid references public.events(id) on delete set null;
create unique index channels_event_id_key on public.channels (event_id) where event_id is not null;
create unique index channels_one_core_room on public.channels (org_id, kind) where kind in ('board','lounge','officers');
create index idx_messages_thread_root on public.messages (thread_root_id, created_at) where thread_root_id is not null;
create index idx_messages_card_event on public.messages (card_event_id) where card_event_id is not null;
create index idx_rsvps_user on public.rsvps (user_id);      -- none leads on user_id today
create index idx_events_org on public.events (org_id);      -- none on org_id today
```

Why `thread_root_id` and not `parent_message_id` for Board replies: the parent FK is `ON DELETE SET NULL` (asis 1.2), so deleting a Board post would turn its replies into top-level Board posts. `thread_root_id` cascades: the replies go with their post. The critic verified the pair in a scratch table (a post with three replies, one quoting another, deleted in one statement: all gone, no error). `parent_message_id` keeps its meaning and its FK.

### 3.2 Backfill of `kind` (before the constraints; the triggers do not exist yet)

In this order, each step only touching rows whose `kind` is still null and `type = 'org_channel'`:

1. **SAE by hand** (the club with handle `sae`, skipped if it does not exist): `general` → `lounge`, **`is_private = false`**; `announcements` → `board`; `exec` → `officers`; `events` → `room`.
2. Any club: a public channel named `announcements` → `board`, if the club has no board yet.
3. Any club: a public channel named `general` → `lounge`, if the club has no lounge yet.
4. Any club with no officers room: its first private channel (by `position`, then `created_at`) → `officers`.
5. Everything left → `room`.
6. Rename: every `board` / `lounge` / `officers` row gets `name` = its kind.

No message is moved or deleted. No room is created here (that is 3.7). The header records the production dry-run counts (asis 11.5).

### 3.3 Constraints

```sql
alter table public.channels
  add constraint channels_kind_check check (kind is null or kind in ('board','lounge','officers','event','room')),
  add constraint channels_kind_by_type check ((type = 'org_channel') = (kind is not null)),
  add constraint channels_org_channel_has_org check (type <> 'org_channel' or org_id is not null),
  add constraint channels_event_shape check (coalesce(kind = 'event', false) = (event_id is not null)),
  add constraint channels_open_rooms_public check (kind is null or kind not in ('board','lounge') or is_private = false),
  add constraint channels_closed_rooms_private check (kind is null or kind not in ('officers','event') or is_private = true);
alter table public.messages
  add constraint messages_kind_check check (kind in ('text','poll','event_card')),
  add constraint messages_card_event_shape check (card_event_id is null or kind = 'event_card'),
  add constraint messages_thread_root_not_self check (thread_root_id is distinct from id);
```

Event rooms and Officers are `is_private = true` on purpose: every old code path that does not know `kind` (`subscribePublicChannels`, `subscribe-public`, the old channel list) then treats them as private and fails closed (verified by the critic).

### 3.4 Triggers and the repair function (the invariants live in the database)

All trigger functions: `plpgsql`, `security definer`, `set search_path to ''`, read tables directly (never the guarded helpers, which answer about `auth.uid()` only). **Every trigger finds its club and room with a join; no row found = return, never raise** (an event, club or user may already be gone when a cascade fires the trigger).

Every subscription row they write is `channel_members (channel_id, user_id, role 'member', accepted_at now(), last_read_at now())` with `on conflict (channel_id, user_id) do nothing`. `last_read_at = now()` so a room does not start as "unread" or "99 new".

**The invariant:** every current member of a club holds a row on every public room of that club (`board`, `lounge`, public `room`), and on each event room they may enter.

| trigger | on | does |
|---|---|---|
| `chat_channels_fill_kind` | `channels` BEFORE INSERT | `type <> 'org_channel'` → `kind` null. Org channel with `kind` null (old code): name `general` and no lounge yet → `lounge` / name `lounge` / public; name `announcements` and no board yet → `board` / name `board` / public; else `room`. **No room cap, it never raises.** |
| `chat_channels_subscribe` | `channels` AFTER INSERT OR UPDATE OF is_private | Public org room (new, or a `room` turned public) → a row for every member of the club. A `room` turned private → delete its rows (B1b removes the same purge from the route). `kind = 'event'` on insert → a row for every owner/admin of the club and for every member holding a `going`/`maybe` RSVP to `event_id`. Officers room → nothing. |
| `chat_org_members_rooms` | `org_members` AFTER INSERT OR UPDATE OF role | New member → rows on the club's public rooms, and on each of the club's event rooms (event not past `ends_at + 7 days`) where the person holds a `going`/`maybe` RSVP. Role becomes owner/admin → rows on all of the club's event rooms inside the window. Role drops below admin → delete the person's rows on the club's event rooms where they hold no `going`/`maybe` RSVP. |
| `chat_rsvps_room` | `rsvps` AFTER INSERT OR UPDATE OF status OR DELETE | `going`/`maybe` and the person is a member of the event's club and the event has a room → add the row. `no` or DELETE → delete the row, unless the person is an owner/admin of the club. Covers direct PostgREST writes and the RSVP deletes issued by `org_members_drop_club_access`. |
| `chat_events_room` | `events` AFTER INSERT OR UPDATE OF title | INSERT with `org_id` set → create the room: `type 'org_channel'`, `kind 'event'`, `org_id`, `event_id`, `name left(title, 80)`, `is_private true`, `position 1000`. UPDATE OF title → update the room's `name`. Cancelling an event deletes it, and the room goes with it (FK cascade). |

**`public.chat_repair_club(p_org uuid) returns void`** — `plpgsql`, `volatile`, `security definer`, `search_path ''`, EXECUTE granted to all three roles, refuses `anon` / `authenticated` from inside (the `rate_limit_hit` idiom, asis 4.5). It makes one club whole, and can be run any number of times:
1. creates a missing `lounge` (position 0, public), `board` (position 1, public), `officers` (position 2, private);
2. inserts every missing (member, public room) row;
3. inserts every missing (owner/admin, open event room) and (member with a `going`/`maybe` RSVP, open event room) row.

It is the backfill (3.7), what club creation calls (section 8), and the repair after the apply window (3.10).

`org_members_drop_club_access` (asis 5) is NOT changed: leaving or being removed deletes every room row in the club, event rooms included. For members-only v1 that is the rule. A voluntary leave keeps the RSVP on the person's calendar; the event chat disappears; re-joining re-creates the rows.

Accepted for v1, written down: reactions and late RSVPs still work in an event room after its 7 days (only new messages are refused); an officer promoted after a room closed has no read state on it.

### 3.5 Functions

**`can_view_org_channel(cid uuid, uid uuid)` — restated from the t2b body (asis 4.1) with ONE new arm.** Keep `sql`, `stable`, `security definer`, `search_path 'public'`, both role guards, and restate the `GRANT EXECUTE … TO anon, authenticated, service_role`. New arm, placed after "not a club member → false" and before "public → true":

```sql
    WHEN c.kind = 'event' THEN
         public.org_member_role (c.org_id, uid) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.channel_members cm
                  WHERE cm.channel_id = cid AND cm.user_id = uid)
```

Members-only is guaranteed by the arm before it. Every policy and route that calls the function picks the change up (asis 4.1 lists the six callers). It runs once per row in `messages` RLS: B1a measures it (section 11, gate 3).

**New: `can_post_org_channel(cid uuid, uid uuid, root uuid) returns boolean`** — `sql`, `stable`, `security definer`, `search_path ''`, EXECUTE granted to all three roles, same two role guards as above, then:

| room | `root` is null (a new top-level message) | `root` is set (a reply under a Board post) |
|---|---|---|
| any | false unless `can_view_org_channel(cid, uid)` is true | same |
| `board` | true only for a current owner/admin of the club | true if `root` is a message in THIS room with `thread_root_id` null and `removed_at` null (members and officers alike) |
| `event` | true while `now() < events.ends_at + interval '7 days'` | false |
| `lounge`, `officers`, `room` | true | false |

Returns false (never null) for a room that does not exist.

### 3.6 Policies (ALTER POLICY, names and roles kept)

Restated in this file and nowhere else. SELECT policies are not touched.

```sql
-- messages_insert_org_member  WITH CHECK
((auth.uid() = user_id)
 AND (kind = 'text') AND (card_event_id IS NULL)
 AND (media_url IS NULL) AND (media_kind IS NULL)            -- no photos in club rooms in v1
 AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL)
 AND (EXISTS ( SELECT 1 FROM public.channels c
       WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL
         AND public.can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)))
 AND has_recorded_consent() AND can_publish_now())

-- messages_insert_member  WITH CHECK  = today's text (asis 2.2) plus, right after (auth.uid() = user_id):
 AND (kind = 'text') AND (card_event_id IS NULL) AND (thread_root_id IS NULL)
 AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL)

-- channel_members_delete_own_pending  USING  = today's text plus:
 AND (NOT (EXISTS ( SELECT 1 FROM public.channels c
       WHERE c.id = channel_members.channel_id AND c.org_id IS NOT NULL)))
```

So a direct PostgREST write can only ever be a plain text message, cannot forge a removal, cannot post top-level on a Board unless the sender is an officer, cannot write into a closed event room, cannot attach media in a club room, and cannot delete its own club-room row (the path "set my `accepted_at` to null, then delete my pending row"). The critic verified the insert policy shape through `INSERT … RETURNING` as `authenticated`, and that `authenticated` has no UPDATE on `messages`.

### 3.7 Data steps (after the triggers and functions exist)

1. `select public.chat_repair_club(o.id) from public.orgs o;` — creates the missing core rooms (production: 4 Officers rooms, for the test clubs) and every missing row (production: 7 memberships × their public rooms). Guards: more than 60 rooms or 400 rows to create = stop.
2. Event rooms for existing events: one room per event with `org_id` set and `ends_at + interval '7 days' > now()` (production: 3). Inserted as ordinary rows, so `chat_channels_subscribe` adds the officers' and the RSVP'd members' rows.
3. Nothing is deleted.

### 3.8 (moved out) Grants

The clean-up on `message_reactions` and `org_channel_members` is sound but is not chat v2. It gets its own small migration, any day.

### 3.9 POST-CHECK (same transaction; any failure rolls everything back)

- Every club has exactly one `board`, one `lounge`, one `officers`. No org channel has `kind` null. No dm/group has `kind`.
- Every member holds a row on every public room of their clubs.
- The three policy texts equal the intended texts. **The intended-text constants are copied from `pg_policies` after a local apply, never typed by hand** (Postgres prints `(kind = 'text'::text)` and its own parentheses). Still exactly two permissive INSERT policies on `messages`.
- The standing-rule query (asis 4.6) returns 0 rows.
- By behaviour, inside a nested block that raises a private SQLSTATE so it rolls back. **The probe builds its own fixtures:** it picks a club with a non-officer member who passes `can_publish_now()` (checked with that member's claims) and inserts a Board post as the postgres role. The positive probes run FIRST (officer top-level Board insert, member reply under that post, member Lounge message), then the refusals (member top-level on the Board, `kind = 'poll'`, a forged `removed_at`, media in a club room, a reply to a missing root, a root sent to the Lounge). It skips only when no club has such a member, and the NOTICE says which condition failed.

### 3.10 Apply order, the window, missing schema, rollback

**Order: the branch is green → migration A is applied on production and recorded → the branch is merged to `main` (the deploy).** Nothing from wave 1 reaches `main` before the `schema_migrations` row is written. Target: under 15 minutes between the apply and the merge.

**Inside that window, old code runs on the new database.** What it does:

| old code | result in the window |
|---|---|
| sending a message | works (`kind` defaults to `text`) |
| a member posting in a Board | refused by RLS; the old route answers its bare 500 |
| the old inbox (`/api/me/threads`) | lists event rooms too, with the people who RSVP'd (production: 3 rooms, 7 RSVPs, all testers) |
| creating a club | gets Lounge + Board from the BEFORE INSERT trigger, but **no Officers room** |
| deleting a room in the old desktop modal | can still delete a Board or a Lounge |
| flipping a Board to private in the old modal | refused by the CHECK before anything is deleted (500) |

After the deploy, one read-only check lists clubs without exactly one board / lounge / officers and rooms deleted since the apply; for any club listed: `select public.chat_repair_club('<id>')`.

**New code on a database without the columns** (local before the apply, or after a rollback). Each changed route has a stated answer:

| route / helper | when the schema is missing (`isMissingChatSchema`) |
|---|---|
| `ensureMember` | retries with `org_id` only; `kind: null`, `eventId: null` |
| the send gate (`can_post_org_channel` missing) | answers "allowed" (today's rule) |
| the send itself | the existing bare retry **never runs when `thread_root_id` was sent**; that case answers 503 `try_again` |
| thread GET, `/api/me/threads` | today's response, without the new fields |
| club creation | falls back to today's two rows (`general`, `announcements`); not fatal |
| card routes, `/api/me/inbox`, `/api/orgs/[slug]/space` | 404 `not_found` |
| `/api/me/calendar` | today's response; the three new fields are `null` |
| report snapshot | today's columns |

**Production apply** needs Franky's yes, at a quiet hour (ALTER POLICY and ADD COLUMN take ACCESS EXCLUSIVE locks on `messages` and `channels`; `lock_timeout 5s`), with the Management API curl recipe (`20260926100000_users_profile_layout.sql:74-85`), then a separate insert of the `schema_migrations` row. Local apply: `psql -f` (asis 6.2), by the orchestrator only (section 11).

**Rollback:** restore the previous deployment FIRST, then roll back migration B if it was applied, then A. A's ROLLBACK section restores the three policy texts and the t2b function body, drops the five triggers and their functions, `chat_repair_club`, `can_post_org_channel`, the constraints, indexes and columns, and deletes the `schema_migrations` row. It does NOT undo the renames, the rows or the SAE privacy change (listed as manual steps).

## 4. Migration B — cards (WAVE 2, week of Oct 5; pinned now)

File `supabase/migrations/20261001110000_chat_v2_cards.sql` (renumber if another file lands first), same house style, error prefix `chat-cards:`. Depends on migration A (PRE-FLIGHT refuses unless `messages.kind`, `messages.card_event_id` and `can_post_org_channel` exist).

### 4.1 Tables (one model for polls and sign-ups)

```sql
create table public.chat_polls (
  message_id  uuid primary key references public.messages(id) on delete cascade,
  channel_id  uuid not null references public.channels(id) on delete cascade,
  mode        text not null check (mode in ('poll','signup')),
  question    text not null check (char_length(btrim(question)) between 1 and 200),
  anonymous   boolean not null default false,
  multi       boolean not null default false,
  closes_at   timestamptz,
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint chat_polls_signup_shape check (mode = 'poll' or (anonymous = false and multi = true))
);
create table public.chat_poll_options (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.chat_polls(message_id) on delete cascade,
  position  smallint not null check (position between 0 and 9),
  label     text not null check (char_length(btrim(label)) between 1 and 80),
  capacity  smallint check (capacity is null or capacity between 1 and 50),
  unique (poll_id, position)
);
create table public.chat_poll_votes (
  option_id  uuid not null references public.chat_poll_options(id) on delete cascade,
  poll_id    uuid not null references public.chat_polls(message_id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index idx_chat_poll_votes_poll_user on public.chat_poll_votes (poll_id, user_id);
```

- A sign-up is a poll with `mode = 'signup'`: the "question" is its title, each option is a slot with a `capacity`, a person may take more than one slot, names always show. A poll's options have `capacity` null.
- **A poll has 2–10 options; a sign-up has 1–10** (the approved event room has a one-slot sign-up, "Rides from Lot 69").
- Options are rows, not a jsonb list, so a vote points at an option id that never shifts. **No edits in v1.**
- All three tables: `enable row level security`, NO policies, and
  `revoke all on table … from anon, authenticated, service_role; grant select, insert, update, delete on table … to service_role;`
- **Trigger `chat_votes_drop_access`** AFTER DELETE ON `public.channel_members` (the one trigger migration B puts on an existing table): deletes that person's votes on polls of that room, unless they are still an owner/admin of the club. So a slot taken by someone who left the club or changed their RSVP becomes free. Known gap: the Officers room has no rows, so a demoted officer's votes there stay.

### 4.2 Functions (RPCs, called by routes with the service role)

All: `plpgsql`, `volatile`, `security definer`, `set search_path to ''`, EXECUTE granted to anon, authenticated, service_role, and the FIRST statement refuses the client roles:
`if current_setting('role', true) in ('anon','authenticated') then raise exception 'not allowed' using errcode = '42501'; end if;`

| function | does | refusals (SQLSTATE → route code) |
|---|---|---|
| `chat_create_poll(p_channel uuid, p_user uuid, p_mode text, p_question text, p_options jsonb, p_anonymous boolean, p_multi boolean, p_closes_at timestamptz, p_content text) returns uuid` | One transaction: checks `can_post_org_channel(p_channel, p_user, null)`; the option counts above; sign-up options each carry `capacity`, poll options none; inserts the `messages` row (`kind 'poll'`, `content = p_content`), the poll, the options. | `P0C21` not allowed to post here → 403 `cannot_post`; `P0C22` bad shape → 400 `invalid_card` |
| `chat_create_event_card(p_channel uuid, p_user uuid, p_event uuid, p_content text) returns uuid` | Checks `can_post_org_channel`; the event exists, belongs to the room's club, and has not ended; inserts the `messages` row (`kind 'event_card'`, `card_event_id`). | `P0C21` → 403; `P0C23` → 404 `event_not_found` |
| `chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean) returns void` | `select … for update` on the poll row. Checks: the message is not removed; `can_view_org_channel(channel, p_user)`; in every room kind but `board` the room must still accept posts (`can_post_org_channel(channel, p_user, null)`), in a Board any viewer may vote; not past `closes_at`; the option belongs to the poll. `p_on`: for a sign-up, `select … for update` on the option row and refuse when `count(votes) >= capacity`; for a single-choice poll delete the person's other votes first; insert, `on conflict do nothing`. Not `p_on`: delete the vote. | `P0C24` → 404 `not_found`; `P0C25` → 409 `poll_closed`; `P0C26` → 409 `slot_full` |

### 4.3 The fallback text

`messages.content` of a card is never empty. Built by `cardFallbackContent()` in `src/lib/chat/cards/fallback.ts` (pure, tested): `Poll: <question>` · `Sign-up: <title>` · `Event: <title> · <Thu Oct 8, 7:30 PM>` + (` — <note>`). Cut to 300 characters. Old screens, previews, search and reports show this text.

### 4.4 Limits and gates for card routes (in this order)

auth 401 → `chatV2For` (404) → rate limit → `requireCanPublish` (create) / `requireNotRestricted` (vote) → JSON → shape → word filter on the question/title, every option label and the note (422 `content_blocked` with `field`: `question`, `options.<n>`, `note`) → `ensureMember` (403/404) → **the message is re-read on the cookie client, scoped to `[id]` (vote only)** → the RPC.

- Rate limits: creating a card shares the `message-send:<uid>` bucket (60 / 60 s); votes use `card-vote:<uid>` 120 / 600 s.
- Cards are for club rooms only: `ensureMember` must answer `isOrgChannel: true`, else 400 `cards_club_rooms_only`.

## 5. Card routes and payloads (WAVE 2; pinned now)

**`POST /api/me/threads/[id]/cards`**

```ts
type CreateCardBody =
  | { type: "poll";   question: string; options: { label: string }[]; anonymous?: boolean; multi?: boolean; closes_at?: string | null }
  | { type: "signup"; question: string; options: { label: string; capacity: number }[]; closes_at?: string | null }
  | { type: "event";  event_id: string; note?: string };            // note ≤ 200
```
→ `201 { ok: true, message: ChatMessage }` (section 6.1 shape), read back through `readChatMessage()` from B0's `message-read.ts`.

**`PUT /api/me/threads/[id]/cards/[messageId]/vote`** body `{ option_id: string; on: boolean }` → `200 { ok: true, card: PollCard }`.

The Event card's Going / Maybe buttons call the EXISTING `PUT` / `DELETE /api/events/[id]/rsvp`; the screen then re-reads the message.

```ts
type Person = { id: string; handle: string; name: string; avatar_url: string | null };
type PollCard = {
  type: "poll" | "signup";
  question: string;
  anonymous: boolean; multi: boolean;
  closes_at: string | null;
  closed: boolean;                 // past closes_at, or an event room past its 7 days. Never "closed" just because the viewer cannot post on a Board.
  total_voters: number;            // distinct people
  options: { id: string; label: string; count: number; capacity: number | null; full: boolean;
             mine: boolean;        // the viewer's own pick, always returned
             voters: Person[];     // [] when anonymous; ALL of them for a sign-up; the first 12 by vote time for a poll
             voters_more: number   // how many more a poll has beyond the 12
           }[];
};
type EventCard = { type: "event"; note: string | null; event: EventRef | null /* null = the event was cancelled */ };
type Card = PollCard | EventCard;
```

- `src/lib/chat/cards/hydrate.ts` exports `hydrateCards(rows, viewerId): Promise<Map<messageId, Card>>`. It reads the side tables with the service role, so **it may only be given rows that came out of a viewer-scoped (cookie client) read**. A removed message gets no card.
- **Report snapshot** (`src/app/api/me/reports/route.ts`, the `message` spec at `:321-325`): add `kind`, `thread_root_id`, and `card` = `snapshotCard(messageId)` from `src/lib/chat/cards/snapshot.ts` (service role): for a poll/sign-up the question, every option label and capacity, the counts, `anonymous`; for an event card the event id, title and start. No voter names in the snapshot.

## 6. Thread routes (B4)

B4 owns `src/app/api/me/threads/[id]/messages/route.ts` (both verbs), `src/app/api/me/threads/route.ts`, `src/app/api/me/threads/[id]/members/[userId]/route.ts` and `src/app/api/me/messages-upload-url/route.ts`. It calls B0's and B1's helpers; it does not write SQL. (`…/messages/[messageId]/route.ts` and `src/app/api/users/search/route.ts` are NOT touched in wave 1.)

### 6.0 Shared shapes (B0's `src/lib/chat/types.ts`; every payload reuses these, nothing is renamed per route)

```ts
type RoomKind = "board" | "lounge" | "officers" | "event" | "room";
type RoomState = "soon" | "live" | "after" | "closed";
type ClubRole = "owner" | "admin" | "mod" | "member";
type Person = { id: string; handle: string; name: string; avatar_url: string | null };
type OrgRef = { id: string; handle: string; name: string; logo_url: string | null; banner_url: string | null; verified: boolean };
type EventRef = { id: string; title: string; starts_at: string; ends_at: string; location: string;
                  state: RoomState; room_id: string | null;        // room_id only when the viewer may enter
                  viewer_status: "going" | "maybe" | null; going_count: number; maybe_count: number };
type ViewerInRoom = { role: ClubRole | null;       // null for dm / group
                      can_post: boolean;           // a new top-level message (dm / group: true)
                      can_reply: boolean;          // true only in a Board
                      can_moderate: boolean };     // owner / admin / mod in a club room
```

`state` comes from `roomState(starts_at, ends_at, now)` in `src/lib/chat/room-state.ts` (pure): `soon` before the start, `live` from start to end, `after` until `ends_at + 7 days`, then `closed`.

### 6.1 `GET /api/me/threads/[id]/messages` — additive only

```ts
type ChatMessage = /* today's message shape (asis 8.1 MESSAGE_SELECT + reactions + parent preview) plus: */ {
  kind: "text" | "poll" | "event_card";
  thread_root_id: string | null;
  card: Card | null;                 // always null in wave 1
  reply_count: number | null;        // Board top-level posts only, else null
  author_role: ClubRole | null;      // club rooms; null = no longer a member, and null in dm / group
  hidden: boolean;                   // reserved for "someone I blocked" (section 12); always false in wave 1
  removed: null | { by: "officer" | "moderator"; at: string; reason: string | null };
                                     // only on the viewer's OWN removed message (RLS hides it from everyone else)
};
type ThreadMessagesResponse = {
  ok: true;
  messages: ChatMessage[];           // oldest first, as today
  viewer_id: string;                 // now also sent for club rooms
  peer_last_read_at: string | null;  // club rooms: always null (unchanged)
  peer_typing: unknown[];            // club rooms: always [] (unchanged)
  room: null | {                     // null for dm / group
    id: string; kind: RoomKind; name: string; org: OrgRef;
    event: null | (EventRef & { going: Person[] });   // the first 8 by RSVP time, room members only
  };
  viewer: ViewerInRoom;
};
```

- `removed_at`, `removed_by`, `removed_reason` never appear in the JSON (the old screens have a dormant "Removed by Vibe moderators" card that reads those names; it stays dormant). `removed.by` is `"officer"` when the stored reason equals `OFFICER_REMOVED_REASON`, else `"moderator"`; `reason` is null for an officer's removal.
- New query params: `?after=<the created_at string the server sent, echoed unchanged>` → messages with `created_at >= after`, oldest first, same `limit` clamp; the client drops ids it already has (a JavaScript `Date` loses the microseconds, so the string is never re-formatted). `?root=<messageId>` → the replies under one Board post, oldest first, max 200; the root is read first on the cookie client, and a root that is not visible, removed, or not a top-level Board post of this room answers 404 `board_post_missing`. `before` and `limit` unchanged.
- **`?after=` only brings new messages.** Votes, RSVP counts, reactions, reply counts and removals change older rows. Pinned for the wave-2 screens: every 5th poll, and on return from the background, the screen re-reads the last page WITHOUT `after` and replaces by id; a message missing from that page that is newer than the page's oldest row is dropped from the screen. Polling pauses while the tab is hidden.
- Without `root`, every club-room read adds `thread_root_id is null`, so old screens never show replies as posts. `reply_count` is one grouped count over the page's post ids; `author_role` is one `org_members` read per page (service role).
- The message read moves to B0's `src/lib/chat/message-read.ts` (`MESSAGE_SELECT`, `readChatMessages(client, channelId, opts)`, `readChatMessage(client, id)`, with the reaction and parent hydration), with no behaviour change, so the card routes can use it in wave 2. `MESSAGE_SELECT` gains `kind, thread_root_id, card_event_id, removed_at, removed_reason`.

### 6.2 `POST /api/me/threads/[id]/messages`

- Body gains `thread_root_id?: string`. `kind` is never read from the body: this route only writes text messages.
- New gate, right after `ensureMember` (gate 11 in asis 8.1) and before the insert:

| case | answer |
|---|---|
| `media_url` sent to a club room | 400 `club_media_off` |
| Board, no `thread_root_id`, sender is not owner/admin | 403 `board_officers_only` |
| Board, `thread_root_id` not found, removed, a reply itself, or in another room | 409 `board_post_missing` |
| `thread_root_id` sent outside a Board (club room or dm/group) | 400 `thread_root_not_allowed` |
| event room past its window | 403 `room_closed` |

- The refusal code comes from `postRefusal(room, rootId, role)` (pure, B0); the yes/no comes from `can_post_org_channel` through the cookie client.
- In a Board, `parent_message_id` is ignored (stored null). Everywhere else the parent handling is unchanged.
- The insert stays on the cookie client; the restated policy is the second wall. An RLS refusal after the gate passed is still a 500 and is logged as a contract bug. The bare retry rule is in 3.10.
- @mentions in a club room: targets are filtered to people who can read THAT room (`filterRoomReaders(channelId, userIds)` from B1b, service role), fixing critique #15. A mention inside a Board reply still notifies that one person. No other notification is written for Board posts or replies.

### 6.3 Officer / mod remove (WAVE 2 or 3, with the button; pinned now)

`DELETE /api/me/threads/[id]/messages/[messageId]`:
- The sender: unchanged (hard delete; the cascade takes the card rows and, for a Board post, its replies).
- Not the sender, in a club room, gates in this order: auth → rate limit `message-remove:<uid>` 30 / 600 s → `requireNotRestricted` → **the message is looked up on the cookie client, scoped to `[id]`; no row → 404** (a mod cannot remove what they cannot read) → role in `ROOM_MODERATOR_ROLES` and `outranks(caller, author)` is not false (owner 3, admin 2, mod 1, member or gone 0; equal rank is allowed) → else 403 `not_allowed` → already removed → `200 { ok: true, removed: true, already: true }` → an OPEN report on this message → 409 `report_open` → service-role `update … set removed_at = now(), removed_by = <caller>, removed_reason = OFFICER_REMOVED_REASON` (`'Removed by a club officer.'`). Never a hard delete.
- No `moderation_actions` row is written (the admin user page counts every `message_remove` row as a Vibe takedown). The record is `removed_by` + `removed_at` on the row; an author who hard-deletes their own removed message erases it. Accepted for v1.
- The screen that shows it: `RemovedContentCard` (`src/components/safety/ReportSheet.tsx:658`) gets a `by` prop; the officer copy has no appeal link.

### 6.4 `GET /api/me/threads`

- `?scope=chats` → dm and group entries only, **and still `requests`** (the new inbox uses this next to `/api/me/inbox`). For `scope` calls the co-member read is skipped for club rooms.
- No param (old screens): as today, except:
  - event rooms (`kind = 'event'`) are left out;
  - the last-message preview ignores Board replies (`thread_root_id is null`);
  - **for a club room the server sends `name` = `<club name> · <Board | Lounge | Officers | the room's name>`**, so every old list shows a usable label with no code change;
  - club-room entries gain `org: OrgRef`, `room_kind: RoomKind` and `can_post: boolean`. The co-member read stays as it is (clubs are tiny today; the new inbox never loads rosters).

### 6.5 (after launch) The mention picker for the Officers room

### 6.6 `DELETE /api/me/threads/[id]/members/[userId]` — the leave guard

Load `channels.org_id` first. A club room answers 400 `club_room`, for self and for others. Group chats are unchanged. (Today the old inbox draws "Leave group" on club rooms and this route deletes the row; nothing would bring it back.)

### 6.7 `POST /api/me/messages-upload-url` — the media guard

`ensureMember` answers `isOrgChannel: true` → 403 `club_media_off`. DMs and groups unchanged.

## 7. Reads for the new screens (WAVE 2; pinned now)

Cookie client for anything RLS should decide, service role only for counts. None loads a roster. Counts read with the service role always filter `removed_at is null` and `thread_root_id is null`. A null `last_read_at` is read as the row's `created_at`.

**`GET /api/me/inbox`** (gated: auth 401 → `chatV2For` 404) → `{ ok: true, clubs: InboxClub[] }`, pinned first, then `last_activity_at` newest first.

```ts
type Preview = { id: string; text: string; author_name: string; created_at: string; kind: "text" | "poll" | "event_card" };
type InboxClub = {
  org: OrgRef;
  viewer_role: ClubRole;
  board:  { room_id: string; latest: Preview | null; unread: boolean };      // unread = a top-level post by someone else, newer than my last_read_at
  lounge: { room_id: string; latest: Preview | null; unread_count: number }; // by others, newer than my last_read_at; capped at 99
  next_event: EventRef | null;                                               // the club's next event that has not ended
  last_activity_at: string | null;   // the newest of board.latest, lounge.latest and the latest message of event rooms I hold a row on.
                                     // NOT orgs.last_activity_at (that one moves for rooms I cannot read).
  pinned_at: string | null; muted_until: string | null;                      // from my Lounge row
};
```

**`GET /api/me/calendar`** — NOT gated (desktop "My Calendar" uses it today). Three new fields on `kind: "rsvp"` entries, nothing else changes: `org_id: string | null`, `room_id: string | null` (only when I may enter the room), `room_state: RoomState | null`. With the flag off for the caller, or the schema missing, all three are `null`.

**`GET /api/orgs/[slug]/space`** (gated) — inside the hidden-club sweep: a stranger to a hidden club gets 404, a non-member of a visible club 403 `members_only`.

```ts
type SpaceResponse = {
  ok: true;
  org: OrgRef & { member_count: number };
  viewer: { role: ClubRole; can_moderate: boolean };
  rooms: { id: string; kind: RoomKind; name: string; unread: boolean; can_post: boolean; event: EventRef | null }[];
         // order: lounge, board, officers (only if I can enter), event rooms not closed by starts_at, then rooms by position
  board_latest: ChatMessage | null;
  up_next: EventRef[];               // not ended, soonest first, max 3
};
```

**Also pinned for wave 2, so they are not lost:**
- The Messages home keeps **Requests** (the safety buffer for DMs from strangers): filters All · Chats · Clubs · Requests.
- **URLs:** the club space and every room open by URL (`/messages?channel=<id>`), so the phone's back button and a notification tap land in the right place. Push and Otto mention links point at the room. `?tab=chat` redirects to Messages on the phone only, and only with the flag on.
- **Accessibility:** the week strip's Going / Maybe marks differ by shape and label, not colour alone; a poll is a radio group (checkboxes when `multi`), and count changes are announced (`aria-live="polite"`); touch targets ≥ 44px; every new screen in Light and Night at 375px.

## 8. Channel routes and club creation (B1b)

- `src/lib/messages/channel-access.ts`: `ensureMember` selects `org_id, kind, event_id` and fills the two new fields of `ChannelAccess` (B0 added them to the type as optional). Missing schema: retry with `org_id` only (3.10). No other behaviour change.
- `src/lib/chat/rooms.ts` (only the functions that need a database client; B1b fills the B0 stub): `loadRoom(channelId)`, `canPost(client, channelId, userId, rootId)`, `filterRoomReaders(channelId, userIds)`, `clubRole(orgId, userId)`.
- `src/app/api/orgs/route.ts` (the default-rooms hunk, `:882-900`): after the club row and the owner's membership row, call `chat_repair_club(org.id)` with the service role: it creates Lounge, Board, Officers and the owner's rows. Missing schema → today's two-row insert, not fatal. Any other failure → delete the club just created (service role) and answer 500 `create_failed`.
- `GET /api/orgs/[slug]/channels` (old list): leaves out `kind = 'event'`; each row gains `kind`.
- `POST …/channels`: always sends `kind: 'room'`. No cap in v1.
- `PATCH …/channels/[channelId]`: for `board`, `lounge`, `officers`: `name` and `is_private` refused with 409 `room_locked`; `topic`, `position`, `pinned` allowed. For `event`: everything refused, 409 `room_locked`. The route's own row purge on public → private (`:143-151`) is removed; the trigger does it.
- `DELETE …/channels/[channelId]`: `board`, `lounge`, `officers`, `event` → 409 `room_locked`.
- `POST …/channels/reorder`: an id of `kind = 'event'` → 409 `room_locked`.
- `src/lib/club-routes/officer-guard.ts`: the optional channel load also selects `kind`.

**The seed (`scripts/local-seed.mjs`, owned by B1a):** it detects `channels.kind`.
- Column absent (before migration A): today's behaviour plus an SAE-shaped club: private `general` with 3 messages and 1 reply, public `announcements` with one member-written message, public `events`, private `exec`, 3 members of which 1 admin and 1 mod, one member with a `going` RSVP and one with `maybe` to an upcoming event of that club, one event that ended 3 days ago, one that ended 10 days ago.
- Column present: it looks rooms up by `kind`, sends `kind` on insert, and skips the pre-migration shape (prints "already migrated").
- Re-running it on either database changes nothing.
- Because the local SAE-shaped club has 3 members, the local rehearsal uses handle `sae_seed`, and the migration's step 3.2.1 takes the handle from a constant at the top of the file that the rehearsal copy sets to `sae_seed`. The production file says `sae`.

## 9. The stretch goal: non-members who RSVP (NOT in wave 1)

Decided: only if everything else is built and walked before Oct 15; otherwise right after launch. Wave 1 must not block it, and does not: access to an event room is a stored row, so later work is (a) `events.room_open_to_rsvps boolean not null default false` + an officer switch, (b) `can_view_org_channel`'s event arm moving ahead of the membership arm with the seven checks of critique #3, re-checked on every read, (c) `chat_rsvps_room` adding rows for non-members of switched-on events, (d) `org_members_drop_club_access` and the stale-row sweep (`20260928100500`) learning that such rows are legitimate, (e) the RSVP route's gates.

## 10. Compatibility in the old screens (B5)

The old screens stay for everyone without the flag, and on desktop for everyone until after launch. B5 changes only what the new rules force.

B5 owns: `src/components/mobile/MessagesMobile.tsx` (the `ConversationView` composer, send-error handling, the thread list rows, `MessageBubble`), `src/app/campus/campus-home.tsx`, `public/html/messages.html`, `public/html/_miniMessenger.js`, `src/components/mobile/SharePostSheet.tsx`, `public/html/_sharePicker.js`. `MessagesMobile.tsx` and `campus-home.tsx` each have exactly one owner in wave 1.

1. **Composer:** when the thread GET says `viewer.can_post === false`, show a quiet bar instead of the input. Board: "Only officers post here." Closed event chat: "This chat is closed." When `viewer` is missing (old database), behave as today.
2. **Send errors:** 403 `board_officers_only`, 403 `room_closed` and 400 `club_media_off` show plain lines, never "Request failed".
3. **Club rooms in the old inbox and the mini messenger** (a thread with `room_kind` set): hide Leave group, + Add, rename, photo edit, Delete conversation, and the attach button.
4. **Share pickers** (`SharePostSheet.tsx`, `_sharePicker.js`): rows with `can_post === false` are left out, so nobody shares a post into a Board they cannot write on.
5. **The Going line:** under the Going / Maybe buttons of a club's event (`campus-home.tsx:9860-9865`, the only RSVP call site): "You'll appear in the event chat." It ships in the same deploy as migration A.
6. **The two desktop room modals** (`ChannelSettingsModal`, `CreateChannelModal` in `campus-home.tsx`): on 409 `room_locked` show "This room can't be renamed, hidden or deleted."
7. Check that no old renderer hides or crashes on a message with the new fields.
8. Each change in Light and Night with tokens (memory `project_night_mode.md`), at 375px. No new Discord wording; renaming the desktop rails' wording is a later wave.

## 11. File ownership, order, gates

**Order: B0 (alone) → B1a (alone: migration A + seed, applied locally, POST-CHECK green) → B1b, B4, B5 side by side.** Each batch: implement → adversarial review → one repair. No Write/Edit over ~150 lines; findings written to disk in small pieces; keep the Mac awake.

| batch | owns (nobody else edits these) |
|---|---|
| **B0** | `src/lib/chat/flag.ts` + test, `flag-server.ts`, `schema.ts`, `room-state.ts` + test, `types.ts` (every type and error code in this file), `room-rules.ts` + test (PURE: `postRefusal`, `canModerate`, `outranks`, `BOARD_POSTER_ROLES`, `ROOM_MODERATOR_ROLES`, `OFFICER_REMOVED_REASON`, `clubRoomLabel`), `message-read.ts` (moved out of `messages/route.ts`, no behaviour change), the TYPE change of `ChannelAccess` in `src/lib/messages/channel-access.ts` (two optional fields, nothing else), a signature stub for `rooms.ts`, `src/app/api/me/features/route.ts`, `.env.example` |
| **B1a** | migration A; `scripts/local-seed.mjs`; `scripts/sql/chat-v2-rooms-check.sql` |
| **B1b** | `src/lib/chat/rooms.ts`; `src/lib/messages/channel-access.ts` (after B0's type change); `src/app/api/orgs/route.ts` (default-rooms hunk); `src/app/api/orgs/[slug]/channels/**`; `src/lib/club-routes/officer-guard.ts` |
| **B4** | `src/app/api/me/threads/[id]/messages/route.ts`; `src/app/api/me/threads/route.ts`; `src/app/api/me/threads/[id]/members/[userId]/route.ts`; `src/app/api/me/messages-upload-url/route.ts` |
| **B5** | the six files in section 10 |
| wave 2 | migration B; `src/lib/chat/cards/**`; `src/app/api/me/threads/[id]/cards/**`; the report snapshot hunk; `…/messages/[messageId]/route.ts`; `RemovedContentCard`; the three reads |

Pure modules (`flag`, `room-state`, `room-rules`, `cards/fallback`, `cards/validate`) import nothing that needs a server, because `npm test` is plain `node --test`.

Checked by the critic and needing NO change: `push/badge.ts`, `push/dispatch.ts`, `me/otto/route.ts`, `profile/storage-purge.ts`, `me/block/route.ts`, `safety/pair-block.ts`, `admin/reports/route.ts`, `admin/content/{remove,restore}/route.ts`, the eight `threads/[id]/*` setting routes.

A change needed in someone else's file is a written request to that batch's owner, handled in the integration pass.

Before writing any route or proxy code, every batch reads the Next.js 16.3 guides named in asis section 10 (`context.params` is a Promise; `cookies()` / `headers()` are async; the proxy is `src/proxy.ts`).

**Rehearsal rule (one local database):** before the first apply, `pg_dump` the local database to the scratchpad. Every rehearsal first runs a copy of the migration whose last `commit;` is replaced by `rollback;`. Only the orchestrator runs the real local apply. The rehearsal copy sets the SAE handle constant to `sae_seed` (section 8); the "SAE has at most 1 member" pre-flight is tied to the production handle `sae` and is skipped for `sae_seed`.

**Gates, in order**

1. `npm run typecheck`, `npm run lint`, `npm test`.
2. Local rehearsal: seed the SAE-shaped club → rehearse A with `rollback;` → real apply → POST-CHECK passes → `scripts/sql/chat-v2-rooms-check.sql` (as a member: Board top-level refused, reply accepted, `kind = 'poll'` refused, media refused, closed event room refused, own club-room row cannot be deleted; as a non-member with an RSVP: event room invisible; after leaving the club: rows gone; after re-joining: rows back; a removal deletes RSVPs and rows; `chat_repair_club` run twice changes nothing the second time).
3. Cost: `EXPLAIN (ANALYZE)` of the message read for an event room with 200 messages, as `authenticated`, and of `/api/me/threads` for a member of 5 clubs. The rows are built with `generate_series` inside `BEGIN … ROLLBACK`, not in the seed. Recorded in the migration header.
4. Integration pass, then the orchestrator's browser walk at 375px as a NON-admin member on the local stack (memory `feedback_browser_pass.md`): Lounge send works; Board shows "Only officers post here."; a Board post by the officer account appears for the member; no Leave group and no attach button on a club room; the Going line shows; desktop Campus › Chat the same; `messages.html` and the mini messenger still send DMs with photos; nothing white-flashes in Night.
5. **Wave-1 commits stay on a branch (`chat-v2-wave-1`).** Production: re-read the pre-flight facts read-only → **Franky's yes** → apply A at a quiet hour, record it → merge the branch to `main` right away (the deploy) → the after-deploy check and `chat_repair_club` where needed (3.10) → anon + member curl checks live (memory `reference_live_verification.md`).
6. The flag's env vars are set for Production only, with the three founders' ids and SAE's id, when wave 2's first screen is ready (week of Oct 5). Until then `CHAT_V2_ENABLED` is unset.

## 12. Open points (each with the default I will build unless Franky says otherwise)

| # | point | default |
|---|---|---|
| 1 | **People who already RSVP'd join event rooms without having seen "You'll appear in the event chat."** Production: 7 RSVPs, 3 events inside the window, all testers. | Accept; Franky says yes before the apply. |
| 2 | **Blocking inside club rooms.** Today a block changes nothing in a club room, and v1 adds names to polls, sign-ups and "going". Apple's reviewer will try Block. | In club rooms a person I blocked is hidden from ME only: their messages arrive as `{ hidden: true }` stubs with no content, author or card; they are left out of `voters` and `going`; counts are unchanged; they still see mine. Built in the wave that ships the rooms' screens. Wave 1 only reserves `hidden`. |
| 3 | **The rank rule for removing messages** (a mod cannot remove an owner's or admin's message; an admin cannot remove the owner's). Franky's call only said owners, admins and mods can remove. | Keep the rank rule. |
| 4 | **The 3-room cap.** | Out of v1 (custom rooms are an after-launch decision). |
| 5 | **A removed message is still shown to its own sender** (existing RLS). | The new screens label it "Removed by a club officer." or "Removed by Vibe moderators". |
| 6 | **The sender's own delete stays a hard delete**, also when a report is open (the report keeps its snapshot), and it erases the trace of an officer's removal. | Unchanged in v1. |
| 7 | **Deleting an account deletes other people's chat:** an officer who created an event takes the event, its room and its messages with them (`events.creator_id` cascades today); a Board post's author takes the replies. | Accept for v1; after launch `events.creator_id` becomes SET NULL. |
| 8 | **Anonymous polls with very few voters** show counts from the first vote. | Accept for v1. |
| 9 | **Every club room appears in the OLD inbox for every member** after the backfill. | Accept; the rows are also what the new inbox needs. |
| 10 | **Club creation failing on its rooms deletes the club.** | Yes, now that the missing-schema case falls back safely. |
| 11 | **Event counts "from 5 up"** (critique #4). | Not in v1; counts outside the room stay as today. |
| 12 | **The 2 messages in `test-f7ae4129 / announcements`** stay even if a non-officer wrote them (hidden test club). | Leave them. |
| 13 | **`closes_at` on polls** is in the model and the API but has no picker in the v1 mockups. | Keep the column; the v1 screens send null. |
| 14 | **Custom titles ("Treasurer")** | After launch (Franky, Sept 29); v1 shows the role. |

## 13. Where each critic finding went

H1 → 3.4 (`chat_repair_club`), 3.6, 6.6, 10.3 · H2 → 2, 7 · H3 → 3.0, 3.6, 6.2, 6.7, 10.3 · H4 → 0, 11 · H5 → 3.10, 6.2, 11 gate 5 · M1 → 3.10 · M2 → 3.4 · M3 → 6.1, 6.3 · M4 → 6.3 · M5 → 10.5, 12.1 · M6 → 4.1 · M7 → 6.1 · M8 → 6.0, 6.1, 5 · M9 → 6.4, 10.4 · M10 → 3.4, 8, 12.4 · M11 → 8 · M12 → 3.4, 7 · M13 → 3.9 · M14 → 6.0 · M15 → 12.2 · L1 → 3 · L2 → 3.0 · L3 → 3.3 · L4 → 3.9 · L5 → 3.4 · L6 → 12.7 · L7 → 6.1 · L8 → 3.4 · L9 → 1 · L10 → 4.2, 5, 4.4 · L11 → 12.3, 12.4, 3.8, 12.10 · L12 → 7, 10.5, 6.4 · L13 → 7 · L14 → 8, 10.6 · L15 → 2 · L16 → 11 gate 3 · Schedule → 0.
