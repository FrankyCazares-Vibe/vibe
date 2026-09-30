# Club chat v1 — wave 1 contracts (S69, 2026-09-29)

**Status: DRAFT 1, before the plan critic.** Nothing here is built yet.

Inputs, in the order they win: `wave-0-decisions.md` (Franky's calls) → `plan-critique.md` → `wave-plan.md` section 0 → the rest of `wave-plan.md`. Facts about today's code and database: `wave-1-asis.md` (sections 1–10 local, section 11 production, read Sept 29; production = local for every function md5 and every policy text).

Every batch reads this file first and may not change a name, column, route, payload field or error code in it. If a batch finds the contract wrong, it stops and says so; it does not improvise.

## 0. What wave 1 is

Backend + compatibility only. After wave 1 the app looks the same as today, with three visible differences for everyone (flag or no flag):

1. In a club's Board (the old `announcements`), only owners and admins can write a new post. Members see "Only officers post here" where the composer was.
2. Club rooms are renamed in the old screens: `general` → `lounge`, `announcements` → `board`.
3. Every member now has every public room of their clubs in the old inbox (today most members have none, asis 7.3 / 11.5).

Everything else (cards, event rooms, the new reads) exists but is reachable only with the `chat_v2` flag, and has no screen until wave 2.

**In wave 1:** B0 contracts + flag · B1 rooms (migration A, channel routes) · B2 cards (migration B, card routes, report snapshot) · B4 thread routes · B5 compatibility in the old screens.
**Pinned here, built in wave 2:** B3 reads (`/api/me/inbox`, `/api/me/calendar` additions, `/api/orgs/[slug]/space`). Their payloads are in section 7 so wave 2's screens and B3 can be built side by side.
**Not in v1 at all:** push, notification settings, `board_post` notification rows, "seen by", Realtime, typing/presence in club rooms, photos in club rooms, Headcount, Bring/Rides/"I'm here"/album, custom-room UI, message pinning, the settings-columns privacy fix (critique #8: not a v1 blocker without "seen by"), the React desktop Messages, non-member event rooms (stretch, section 9).

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
| a person's label in a club | "Your hat" | the role only: owner → "Owner", admin → "Officer", mod → "Mod", member → "Member". **Custom titles (Treasurer, President) do not exist in the database**; the mockups show them as an idea for after launch. |

Never in copy or new identifiers: channel, server, thread (user-facing), `#`. Existing identifiers (`channels`, `channel_members`, `/api/me/threads`) keep their names.

## 2. The flag `chat_v2` (B0)

Copy the push shape (asis 9.1): pure module, `env` parameter, node tests.

- Env (server only, never `NEXT_PUBLIC_`), documented in `.env.example` with empty values:
  - `CHAT_V2_ENABLED` — exactly `"true"` turns the feature on at all. Anything else = off for everyone.
  - `CHAT_V2_ALLOWLIST` — `*` = everyone; else a comma list of user ids; blank = nobody.
  - `CHAT_V2_CLUBS` — comma list of club (org) ids; every current member of a listed club is in.
- `src/lib/chat/flag.ts` (pure, no imports): `chatV2Enabled(env)`, `chatV2Everyone(env)`, `chatV2ListedUser(userId, env)`, `chatV2ClubIds(env): string[]`. Ids compared trimmed + lower-case.
- `src/lib/chat/flag-server.ts` (`server-only`): `chatV2For(userId): Promise<boolean>` = enabled AND (everyone OR listed user OR a service-role `org_members` row for the user in any listed club). A read error answers `false` (fail closed) and logs once.
- `GET /api/me/features` → `200 { ok: true, chat_v2: boolean }`, `Cache-Control: private, no-store`; 401 when signed out. This is the only way a screen learns the flag.
- What the flag gates: the card routes, the three B3 reads, and (wave 2+) the new screens. A gated route answers **404 `not_found`** when the flag is off for the caller.
- What it does NOT gate: the database (migrations A and B apply to everyone), the Board rule, event rooms existing, the new fields on the thread GET.
- Missing schema = feature off, never a 500: `src/lib/chat/schema.ts` exports `isMissingChatSchema(error)` (codes `42P01`, `42703`, `PGRST204`, `PGRST205`, `PGRST202`, `42883`) and `warnMissingChatSchemaOnce(tag)`, same idiom as `isMissingPushSchema`.
- Launch: set `CHAT_V2_ALLOWLIST=*` and redeploy. Rollout before that: the three founders' ids + `CHAT_V2_CLUBS` = SAE's id.

## 3. Migration A — rooms, Board rule, message columns (B1)

File `supabase/migrations/20261001100000_chat_v2_rooms.sql`. House style of `20260930100000_event_cancel_notices.sql` (asis 6.4): header sections, `begin; set local lock_timeout = '5s';`, PRE-FLIGHT, numbered steps, POST-CHECK in the same transaction, `notify pgrst, 'reload schema';`, `commit;`. Error prefix `chat-rooms:`. New functions use `set search_path to ''` and fully qualified names.

**B1 owns every change to existing tables, including the two new columns' policies on `messages`. No other batch writes a policy on `messages`, `channels`, `channel_members` or `rsvps`.**

### 3.0 PRE-FLIGHT (catalog reads only, never `schema_migrations`)

Refuse to run unless all hold:
- md5 of `can_view_org_channel` = `269c1185295552f74930f1acffd7c170`; of `org_members_drop_club_access` = `0e7baa973042be8ca0decb7df1ca6407`.
- `with_check` of `messages_insert_member` and of `messages_insert_org_member` equal the texts in asis 2.2, and no other permissive INSERT policy exists on `messages`.
- Names are free: columns `channels.kind`, `channels.event_id`, `messages.kind`, `messages.thread_root_id`, `messages.card_event_id`; every constraint, index, function and trigger this file adds.
- 0 rows with `type = 'org_subchannel'`; 0 org channels with `org_id` null; 0 dm/group rows with `org_id` set.
- No org channel is already named `board`, `lounge` or `officers`.
- Row guards: org channels ≤ 60, clubs ≤ 40 (production today: 12 and 5). More than that = the file was written against a different database; stop.

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

Why `thread_root_id` and not `parent_message_id` for Board replies: the parent FK is `ON DELETE SET NULL` (asis 1.2), so deleting a Board post would turn its replies into top-level Board posts (critique #12). `thread_root_id` cascades: the replies go with their post. `parent_message_id` keeps its meaning (the quoted message) and its FK.

### 3.2 Backfill of `kind` (before the constraints)

In this order, each step only touching rows whose `kind` is still null and `type = 'org_channel'`:

1. **SAE by hand** (the club with handle `sae`, skipped if it does not exist): `general` → `lounge`, **`is_private = false`**; `announcements` → `board`; `exec` → `officers`; `events` → `room`.
2. Any club: a public channel named `announcements` → `board`, if the club has no board yet.
3. Any club: a public channel named `general` → `lounge`, if the club has no lounge yet.
4. Any club with no officers room: its first private channel (by `position`, then `created_at`) → `officers`.
5. Everything left → `room`.
6. Rename: every `board` / `lounge` / `officers` row gets `name` = its kind.
7. Create what is missing, per club: `lounge` (position 0, public), `board` (position 1, public), `officers` (position 2, private). On production this creates 4 Officers rooms (the test clubs) and nothing else; locally it also gives `test_bloomington_cycling` all three.

No message is moved or deleted. The header records the dry-run counts from production (asis 11.5).

### 3.3 Constraints

```sql
alter table public.channels
  add constraint channels_kind_check check (kind is null or kind in ('board','lounge','officers','event','room')),
  add constraint channels_kind_by_type check ((type = 'org_channel') = (kind is not null)),
  add constraint channels_event_shape check (coalesce(kind = 'event', false) = (event_id is not null)),
  add constraint channels_open_rooms_public check (kind is null or kind not in ('board','lounge') or is_private = false),
  add constraint channels_closed_rooms_private check (kind is null or kind not in ('officers','event') or is_private = true);
alter table public.messages
  add constraint messages_kind_check check (kind in ('text','poll','event_card')),
  add constraint messages_card_event_shape check (card_event_id is null or kind = 'event_card'),
  add constraint messages_thread_root_not_self check (thread_root_id is distinct from id);
```

Event rooms and Officers are `is_private = true` on purpose: every old code path that does not know `kind` (`subscribePublicChannels`, `subscribe-public`, the old channel list) then treats them as private and fails closed.

### 3.4 Triggers (the invariants live in the database)

All trigger functions: `plpgsql`, `security definer`, `set search_path to ''`, read tables directly (never the guarded helpers, which answer about `auth.uid()` only). Every subscription row they write is `channel_members (channel_id, user_id, role 'member', accepted_at now())` with `on conflict (channel_id, user_id) do nothing`.

**The invariant:** every current member of a club holds a row on every public room of that club (`board`, `lounge`, public `room`), and on each event room they may enter. Rows are what the inbox, read state and the mention picker need (asis 7.3, 8.8, 8.10).

| trigger | on | does |
|---|---|---|
| `chat_channels_fill_kind` | `channels` BEFORE INSERT | `type <> 'org_channel'` → `kind` null. Org channel with `kind` null (old code): name `general` and no lounge yet → `lounge` / name `lounge` / public; name `announcements` and no board yet → `board` / name `board` / public; else `room`. For `kind = 'room'`: if the club already has 3 rooms of kind `room` → `raise exception 'chat-rooms: room limit' using errcode = '23514'`. Clubs already over 3 keep theirs. |
| `chat_channels_subscribe` | `channels` AFTER INSERT | Public org room → a row for every member of the club. `kind = 'event'` → a row for every owner/admin of the club and for every member holding a `going`/`maybe` RSVP to `event_id`. Officers and private rooms → nothing. |
| `chat_org_members_rooms` | `org_members` AFTER INSERT OR UPDATE OF role | New member → rows on the club's public rooms, and on each of the club's event rooms (event not past `ends_at + 7 days`) where the person holds a `going`/`maybe` RSVP. Role becomes owner/admin → rows on all of the club's event rooms inside the window. Role drops below admin → delete the person's rows on the club's event rooms where they hold no `going`/`maybe` RSVP. |
| `chat_rsvps_room` | `rsvps` AFTER INSERT OR UPDATE OF status OR DELETE | `going`/`maybe` and the person is a member of the event's club and the event has a room → add the row. `no` or DELETE → delete the row, unless the person is an owner/admin of the club. Covers direct PostgREST writes (`rsvps_update_own`) and the RSVP deletes issued by `org_members_drop_club_access` on a removal. |
| `chat_events_room` | `events` AFTER INSERT OR UPDATE OF title | INSERT with `org_id` set → create the room: `type 'org_channel'`, `kind 'event'`, `org_id`, `event_id`, `name left(title, 80)`, `is_private true`, `position 1000`. UPDATE OF title → update the room's `name`. Cancelling an event deletes it, and the room goes with it (FK cascade). |

`org_members_drop_club_access` (asis 5) is NOT changed: leaving or being removed deletes every room row in the club, event rooms included. For members-only v1 that is the rule. A voluntary leave keeps the RSVP on the person's calendar; the event chat disappears; re-joining re-creates the rows through `chat_org_members_rooms`.

Known limit, accepted for v1: an officer promoted AFTER an event's window closed gets no row on that closed room; they can still read it (section 3.5), only read state is not stored.

### 3.5 Functions

**`can_view_org_channel(cid uuid, uid uuid)` — restated from the t2b body (asis 4.1) with ONE new arm.** Keep `sql`, `stable`, `security definer`, `search_path 'public'`, both role guards, and restate the `GRANT EXECUTE … TO anon, authenticated, service_role`. New arm, placed after "not a club member → false" and before "public → true":

```sql
    WHEN c.kind = 'event' THEN
         public.org_member_role (c.org_id, uid) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.channel_members cm
                  WHERE cm.channel_id = cid AND cm.user_id = uid)
```

Members-only is guaranteed by the arm before it. Every policy and route that calls the function picks the change up (asis 4.1 lists the six callers). It runs once per row in `messages` RLS: B1 measures it (section 11).

**New: `can_post_org_channel(cid uuid, uid uuid, root uuid) returns boolean`** — `sql`, `stable`, `security definer`, `search_path ''`, EXECUTE granted to all three roles, same two role guards as above, then:

| room | `root` is null (a new top-level message) | `root` is set (a reply under a Board post) |
|---|---|---|
| any | false unless `can_view_org_channel(cid, uid)` is true | same |
| `board` | true only for a current owner/admin of the club | true if `root` is a message in THIS room with `thread_root_id` null and `removed_at` null (members and officers alike) |
| `event` | true while `now() < events.ends_at + interval '7 days'` | false |
| `lounge`, `officers`, `room` | true | false |

Returns false (never null) for a room that does not exist.

### 3.6 Policies on `messages` (ALTER POLICY, names and roles kept)

Both INSERT policies are restated in this file and nowhere else. SELECT and DELETE policies are not touched.

```sql
-- messages_insert_org_member  WITH CHECK
((auth.uid() = user_id)
 AND (kind = 'text') AND (card_event_id IS NULL)
 AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL)
 AND (EXISTS ( SELECT 1 FROM public.channels c
       WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL
         AND public.can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)))
 AND has_recorded_consent() AND can_publish_now())

-- messages_insert_member  WITH CHECK  = today's text (asis 2.2) plus, right after (auth.uid() = user_id):
 AND (kind = 'text') AND (card_event_id IS NULL) AND (thread_root_id IS NULL)
 AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL)
```

So a direct PostgREST insert can only ever be a plain text message, cannot forge a removal, cannot post top-level on a Board unless the sender is an officer, and cannot write into a closed event room. Cards are written only by the service-role RPCs of migration B.

### 3.7 Data steps after the functions exist

1. Event rooms for existing events: one room per event with `org_id` set and `ends_at + interval '7 days' > now()` (production: 3). Inserted as ordinary rows, so `chat_channels_subscribe` adds the officers' and RSVP'd members' rows.
2. Subscription backfill: for every (member, public org room) pair with no row, insert one. Production today: 7 memberships × their public rooms. Guard: more than 400 rows to insert = stop.
3. Nothing is deleted.

### 3.8 Grants (small, same file)

```sql
revoke all on table public.message_reactions, public.org_channel_members from anon;
revoke truncate, references, trigger, maintain on table
  public.message_reactions, public.org_channel_members,
  public.channels, public.messages, public.channel_members, public.org_members from authenticated;
```

These two tables were never hardened (asis 3.1). No client path uses anon or those four privileges. `authenticated` keeps INSERT/SELECT/DELETE on `messages`.

### 3.9 POST-CHECK (same transaction; any failure rolls everything back)

- Every club has exactly one `board`, one `lounge`, one `officers`. No org channel has `kind` null. No dm/group has `kind`.
- Every member holds a row on every public room of their clubs.
- Both INSERT policy texts equal the intended text; still exactly two permissive INSERT policies on `messages`.
- The standing-rule query (asis 4.6) returns 0 rows.
- By behaviour, inside a nested block that raises a private SQLSTATE so it rolls back, skipped with a NOTICE when the database has no suitable rows: as `authenticated` + a member's `request.jwt.claims`, a top-level insert into a Board is refused; the same insert with `thread_root_id` = an existing post succeeds; an insert with `kind = 'poll'` is refused; an officer's top-level Board insert succeeds.

### 3.10 Apply order and rollback

**BEFORE the deploy.** Old code on the new database: sends work (`kind` defaults to `text`); a member's post in a Board is refused by RLS and the old route answers its bare 500 until the deploy (accepted: production has no real club members today); creating a club still works (the BEFORE INSERT trigger fills `kind`); flipping a Board or Lounge to private in the old desktop modal is refused by the CHECK (500 in old code). New code on the old database: `isMissingChatSchema` → treated as flag off.

Production apply needs Franky's yes, at a quiet hour (ALTER POLICY and ADD COLUMN take ACCESS EXCLUSIVE locks on `messages` and `channels`; `lock_timeout 5s`), with the Management API curl recipe (`20260926100000_users_profile_layout.sql:74-85`), then a separate insert of the `schema_migrations` row. Local apply: `psql -f` (asis 6.2). The ROLLBACK section restores the two policy texts and the t2b function body, drops the five triggers and their functions, `can_post_org_channel`, the constraints, indexes and columns, and deletes the `schema_migrations` row; it does NOT undo the renames or the SAE privacy change (listed as manual steps).

## 4. Migration B — cards (B2)

File `supabase/migrations/20261001110000_chat_v2_cards.sql`, same house style, error prefix `chat-cards:`. Depends on migration A (PRE-FLIGHT refuses unless `messages.kind`, `messages.card_event_id` and `can_post_org_channel` exist). It adds tables and functions only; it writes no policy on an existing table.

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

- A sign-up is a poll with `mode = 'signup'`: the "question" is its title, each option is a slot with a `capacity`, a person may take more than one slot (`multi = true`), names always show (`anonymous = false`). A poll's options have `capacity` null.
- Options are rows, not a jsonb list, so a vote points at an option id that never shifts. **No edits in v1**: a card is created once; to change it, remove it and post a new one.
- All three tables: `enable row level security`, NO policies, and
  `revoke all on table … from anon, authenticated, service_role; grant select, insert, update, delete on table … to service_role;`
  Clients never read or write them. Names never leave the server for an anonymous poll.

### 4.2 Functions (RPCs, called by routes with the service role)

All: `plpgsql`, `volatile`, `security definer`, `set search_path to ''`, EXECUTE granted to anon, authenticated, service_role (standing rule), and the first statement refuses the client roles from inside:
`if current_setting('role', true) in ('anon','authenticated') then raise exception 'not allowed' using errcode = '42501'; end if;`

| function | does | refusals (SQLSTATE → route code) |
|---|---|---|
| `chat_create_poll(p_channel uuid, p_user uuid, p_mode text, p_question text, p_options jsonb, p_anonymous boolean, p_multi boolean, p_closes_at timestamptz, p_content text) returns uuid` | One transaction: checks `can_post_org_channel(p_channel, p_user, null)`; 2–10 options; sign-up options each carry `capacity`, poll options none; inserts the `messages` row (`kind 'poll'`, `content = p_content`), the poll, the options. Returns the message id. | `P0C21` not allowed to post here → 403 `cannot_post`; `P0C22` bad shape → 400 `invalid_card` |
| `chat_create_event_card(p_channel uuid, p_user uuid, p_event uuid, p_content text) returns uuid` | Checks `can_post_org_channel`; the event exists, belongs to the room's club, and has not ended; inserts the `messages` row (`kind 'event_card'`, `card_event_id`). | `P0C21` → 403; `P0C23` event not shareable here → 404 `event_not_found` |
| `chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean) returns void` | `select … for update` on the poll row. Checks: the message is not removed; `can_view_org_channel(channel, p_user)`; the room still accepts posts (`can_post_org_channel(channel, p_user, null)` for Lounge/rooms/event; in a Board any viewer may vote); not past `closes_at`; the option belongs to the poll. `p_on`: for a sign-up, `select … for update` on the option row and refuse when `count(votes) >= capacity`; for a single-choice poll delete the person's other votes in the poll first; insert, `on conflict do nothing`. Not `p_on`: delete the vote. | `P0C24` not found / cannot view → 404 `not_found`; `P0C25` closed → 409 `poll_closed`; `P0C26` full → 409 `slot_full` |

### 4.3 The fallback text (so old screens, previews, reports and search show something)

`messages.content` of a card is never empty. Built by `cardFallbackContent()` in `src/lib/chat/cards/fallback.ts` (pure, tested):
- poll: `Poll: <question>` · sign-up: `Sign-up: <title>` · event: `Event: <title> · <Fri Oct 9, 7:30 PM>` + (` — <note>` when a note was added). Cut to 300 characters.

### 4.4 Limits and gates for card routes (in this order)

auth 401 → `chatV2For` (404 `not_found`) → rate limit → `requireCanPublish` (create) / `requireNotRestricted` (vote) → JSON → shape → word filter on the question/title, every option label and the note (422 `content_blocked` with `field`: `question`, `options.<n>`, `note`) → `ensureMember` (403/404) → the RPC.

- Rate limits: creating a card shares the `message-send:<uid>` bucket (60 / 60 s); votes use `card-vote:<uid>` 120 / 600 s.
- Cards are for club rooms only. `ensureMember` must answer `isOrgChannel: true`, else 400 `cards_club_rooms_only`.

## 5. Card routes and payloads (B2)

New files only; B2 does not edit `messages/route.ts`.

**`POST /api/me/threads/[id]/cards`**

```ts
type CreateCardBody =
  | { type: "poll";   question: string; options: { label: string }[]; anonymous?: boolean; multi?: boolean; closes_at?: string | null }
  | { type: "signup"; question: string; options: { label: string; capacity: number }[]; closes_at?: string | null }
  | { type: "event";  event_id: string; note?: string };            // note ≤ 200
```
→ `201 { ok: true, message: ChatMessage }` (section 6.1 shape, `card` filled).

**`PUT /api/me/threads/[id]/cards/[messageId]/vote`** body `{ option_id: string; on: boolean }` → `200 { ok: true, card: PollCard }`.

The Event card's Going / Maybe buttons call the EXISTING `PUT /api/events/[id]/rsvp` and `DELETE` of the same; no new RSVP route. The screen then re-reads the message.

```ts
type Person = { id: string; handle: string; name: string; avatar_url: string | null };
type PollCard = {
  type: "poll" | "signup";
  question: string;
  anonymous: boolean; multi: boolean;
  closes_at: string | null; closed: boolean;          // closed = past closes_at OR the room no longer accepts posts
  total_voters: number;                               // distinct people
  options: { id: string; label: string; count: number; capacity: number | null; full: boolean;
             mine: boolean;                           // the viewer's own pick, always returned
             voters: Person[] }[];                    // [] when anonymous; else the first 12 by vote time
};
type EventCard = {
  type: "event";
  note: string | null;
  event: { id: string; title: string; starts_at: string; ends_at: string; location: string;
           going_count: number; maybe_count: number } | null;   // null = the event was cancelled
  viewer_status: "going" | "maybe" | null;
  room_id: string | null;                             // set only when the viewer may enter the event's chat
};
type Card = PollCard | EventCard;
```

- `src/lib/chat/cards/hydrate.ts` exports `hydrateCards(rows, viewerId): Promise<Map<messageId, Card>>`. It reads the side tables with the service role, so **it may only be given rows that came out of a viewer-scoped (cookie client) read**; it never decides visibility itself. A removed message gets no card.
- Blocks: inside club rooms blocks do not apply (existing rule, `messages/route.ts:481-486`); voter names follow the same rule.
- **Report snapshot** (`src/app/api/me/reports/route.ts`, the `message` spec at `:321-325`): add `kind`, `thread_root_id`, and `card` = `snapshotCard(messageId)` from `src/lib/chat/cards/snapshot.ts` (service role): for a poll/sign-up the question, every option label and capacity, the counts, `anonymous`; for an event card the event id, title and start. No voter names in the snapshot. This hunk belongs to B2.

## 6. Thread routes (B4)

B4 owns `src/app/api/me/threads/[id]/messages/route.ts` (both verbs), `…/messages/[messageId]/route.ts`, `src/app/api/me/threads/route.ts` and `src/app/api/users/search/route.ts`. It calls B1's and B2's helpers; it does not write SQL.

### 6.1 `GET /api/me/threads/[id]/messages` — additive only

```ts
type RoomKind = "board" | "lounge" | "officers" | "event" | "room";
type RoomState = "soon" | "live" | "after" | "closed";
type ChatMessage = /* today's message shape (asis 8.1 MESSAGE_SELECT + reactions + parent preview) plus: */ {
  kind: "text" | "poll" | "event_card";
  thread_root_id: string | null;
  card: Card | null;
  reply_count: number | null;        // Board top-level posts only, else null
  removed: boolean;                  // true only on the viewer's OWN message that was removed (RLS hides it from everyone else)
};
type ThreadMessagesResponse = {
  ok: true;
  messages: ChatMessage[];           // oldest first, as today
  viewer_id: string;                 // now also sent for club rooms
  peer_last_read_at: string | null;  // club rooms: always null (unchanged)
  peer_typing: unknown[];            // club rooms: always [] (unchanged)
  room: null | {                     // null for dm / group
    id: string; kind: RoomKind; name: string;
    org: { id: string; handle: string; name: string; logo_url: string | null };
    event: null | { id: string; title: string; starts_at: string; ends_at: string; location: string; state: RoomState };
  };
  viewer: { role: "owner" | "admin" | "mod" | "member" | null;   // null for dm / group
            can_post: boolean;       // a new top-level message (dm / group: true)
            can_reply: boolean;      // true only in a Board
            can_moderate: boolean }; // owner / admin / mod in a club room
};
```

- New query params: `?after=<iso>` → only messages with `created_at > after`, oldest first, same `limit` clamp (for polling; the screen pauses when hidden); `?root=<messageId>` → the replies under one Board post, oldest first, max 200. `before` and `limit` unchanged.
- Without `root`, every club-room read adds `thread_root_id is null`, so old screens never show replies as posts. `reply_count` is one grouped count over the page's post ids.
- `room.event.state` comes from `roomState(starts_at, ends_at, now)` in `src/lib/chat/room-state.ts`: `soon` before the start, `live` from start to end, `after` until `ends_at + 7 days`, then `closed`.
- `MESSAGE_SELECT` gains `kind, thread_root_id, card_event_id, removed_at`. The existing "retry with the bare select" fallback stays and also fires on a missing `kind` (`isMissingChatSchema`), answering without the new fields.
- `hydrateCards` is called only with the rows this read returned.

### 6.2 `POST /api/me/threads/[id]/messages`

- Body gains `thread_root_id?: string`. `kind` is never read from the body: this route only writes text messages.
- New gate, right after `ensureMember` (gate 11 in asis 8.1) and before the insert, using `can_post_org_channel` through the cookie client:

| case | answer |
|---|---|
| Board, no `thread_root_id`, sender is not owner/admin | 403 `board_officers_only` |
| Board, `thread_root_id` not found, removed, a reply itself, or in another room | 409 `board_post_missing` |
| `thread_root_id` sent outside a Board (club room or dm/group) | 400 `thread_root_not_allowed` |
| event room past its window | 403 `room_closed` |

- In a Board, `parent_message_id` is ignored (stored null). Everywhere else the parent handling is unchanged.
- The insert stays on the cookie client; the restated policy is the second wall. An RLS refusal after the gate passed is still a 500 and is logged as a contract bug.
- @mentions in a club room: targets are filtered to people who can read THAT room (`filterRoomReaders(channelId, userIds)` from B1, service role), fixing critique #15. A mention inside a Board reply still notifies that one person. No other notification is written for Board posts or replies.

### 6.3 `DELETE /api/me/threads/[id]/messages/[messageId]`

- The sender: unchanged (hard delete; the cascade takes the card rows and, for a Board post, its replies).
- Not the sender, in a club room: allowed when the caller's club role is owner, admin or mod AND the caller does not rank below the author (owner 3, admin 2, mod 1, member or no longer a member 0). Gates: auth → rate limit `message-remove:<uid>` 30 / 600 s → `requireNotRestricted` → role check (403 `not_allowed`) → an OPEN report on this message by anyone → 409 `report_open` (Vibe's moderators decide those) → service-role `update … set removed_at = now(), removed_by = <caller>, removed_reason = 'officer'`. Answer `{ ok: true, removed: true }`. Never a hard delete.
- dm / group: unchanged (sender only).

### 6.4 `GET /api/me/threads`

- `?scope=chats` → dm and group entries only (the new inbox uses this next to `/api/me/inbox`).
- No param (old screens): as today, except: event rooms (`kind = 'event'`) are left out; the last-message preview ignores Board replies (`thread_root_id is null`); for club rooms the co-member read is skipped, so the entry has `members: []`, `peer: null`, `peer_last_read_at: null` (critique #22); club-room entries gain `org: { id, handle, name, logo_url }` and `room_kind`.

### 6.5 `GET /api/users/search` (mention picker), if time

For an Officers room the picker offers the club's owners/admins + the room's allow-list (today it reads subscription rows, which private rooms do not have). Public rooms need no change once the invariant in 3.4 holds.

## 7. Reads for the new screens (B3 — built in wave 2, pinned now)

All three: auth 401 → `chatV2For` 404 → cookie client for anything RLS should decide, service role only for counts. None loads a roster.

**`GET /api/me/inbox`** → `{ ok: true, clubs: InboxClub[] }`, pinned first, then `last_activity_at` newest first.

```ts
type Preview = { id: string; text: string; author_name: string; created_at: string; kind: "text" | "poll" | "event_card" };
type InboxClub = {
  org: { id: string; handle: string; name: string; logo_url: string | null; verified: boolean };
  viewer_role: "owner" | "admin" | "mod" | "member";
  board:  { room_id: string; latest: Preview | null; unread: boolean };      // unread = a top-level post by someone else, newer than my last_read_at
  lounge: { room_id: string; latest: Preview | null; unread_count: number }; // by others, newer than my last_read_at; capped at 99
  next_event: null | { event_id: string; title: string; starts_at: string; ends_at: string;
                       viewer_status: "going" | "maybe" | null; room_id: string | null; room_state: RoomState };
  last_activity_at: string | null;
  pinned_at: string | null; muted_until: string | null;                      // from my Lounge row
};
```

**`GET /api/me/calendar`** — three new fields on `kind: "rsvp"` entries, nothing else changes: `org_id: string | null`, `room_id: string | null` (only when I may enter the room), `room_state: RoomState | null`.

**`GET /api/orgs/[slug]/space`** — inside the hidden-club sweep: a stranger to a hidden club gets 404, a non-member of a visible club 403 `members_only`.

```ts
type SpaceResponse = {
  ok: true;
  org: { id: string; handle: string; name: string; logo_url: string | null; banner_url: string | null; verified: boolean; member_count: number };
  viewer: { role: "owner" | "admin" | "mod" | "member"; can_post_board: boolean; can_moderate: boolean };
  rooms: { id: string; kind: RoomKind; name: string; unread: boolean;
           event: null | { id: string; title: string; starts_at: string; ends_at: string; state: RoomState } }[];
           // order: lounge, board, officers (only if I can enter), event rooms not closed by starts_at, then rooms by position
  board_latest: ChatMessage | null;
  up_next: { event_id: string; title: string; starts_at: string; ends_at: string; location: string;
             viewer_status: "going" | "maybe" | null; room_id: string | null; room_state: RoomState;
             going_count: number; maybe_count: number }[];   // not ended, soonest first, max 3
};
```

## 8. Channel routes and club creation (B1)

- `src/lib/messages/channel-access.ts`: `ensureMember` selects `org_id, kind, event_id`; the club variant of `ChannelAccess` gains `kind: RoomKind` and `eventId: string | null`. No behaviour change.
- `src/lib/chat/rooms.ts` (B1 fills the B0 stub): `loadRoom(channelId)`, `canPost(client, channelId, userId, rootId)`, `postRefusal(room, rootId, role)` → the code in 6.2, `filterRoomReaders(channelId, userIds)`, `clubRole(orgId, userId)`, `canModerate(role)`, `outranks(callerRole, authorRole)`.
- `src/app/api/orgs/route.ts` (the default-rooms hunk, `:882-900`): insert three rows with their kinds (`lounge` 0 public, `board` 1 public, `officers` 2 private). A failure is now FATAL: delete the club just created (service role) and answer 500 `create_failed`. The owner's rows come from the trigger.
- `GET /api/orgs/[slug]/channels` (old list): leaves out `kind = 'event'`; each row gains `kind`.
- `POST …/channels`: always `kind: 'room'`; a fourth custom room → 409 `room_limit` (checked in the route, and the trigger's `23514` maps to the same code).
- `PATCH …/channels/[channelId]`: for `board`, `lounge`, `officers`: `name` and `is_private` refused with 409 `room_locked`; `topic`, `position`, `pinned` allowed. For `event`: everything refused, 409 `room_locked`.
- `DELETE …/channels/[channelId]`: `board`, `lounge`, `officers`, `event` → 409 `room_locked`.
- `src/lib/club-routes/officer-guard.ts`: the optional channel load also selects `kind`.
- `scripts/local-seed.mjs`: add an SAE-shaped club BEFORE migration A is rehearsed (private `general` with 3 messages and 1 reply, public `announcements` with a member-written message, public `events`, private `exec`, 3 members of which 1 admin and 1 mod), one member with a `going` RSVP and one with `maybe` to an upcoming event of that club, one event that ended 3 days ago, one that ended 10 days ago.

## 9. The stretch goal: non-members who RSVP (NOT in wave 1)

Decided: only if everything else is built and walked before Oct 15; otherwise right after launch. Wave 1 must not block it, and does not: access to an event room is a stored row, so later work is (a) `events.room_open_to_rsvps boolean not null default false` + an officer switch, (b) `can_view_org_channel`'s event arm moving ahead of the membership arm with the seven checks of critique #3, re-checked on every read, (c) `chat_rsvps_room` adding rows for non-members of switched-on events, (d) `org_members_drop_club_access` and the stale-row sweep (`20260928100500`) learning that such rows are legitimate, (e) the RSVP route's gates. None of it is started in wave 1.

## 10. Compatibility in the old screens (B5)

The old screens stay for everyone without the flag, and on desktop for everyone until after launch. B5 changes only what the new rules force.

Files: `src/components/mobile/MessagesMobile.tsx` (the `ConversationView` composer and send-error handling only), `src/app/campus/campus-home.tsx` (`ChannelChat` composer and send-error handling only), `public/html/messages.html`, `public/html/_miniMessenger.js`. `MessagesMobile.tsx` has exactly one owner in wave 1: B5.

1. Composer: when the thread GET says `viewer.can_post === false`, show a quiet bar instead of the input. Board: "Only officers post here." Closed event chat: "This chat is closed." When `viewer` is missing (old database), behave as today.
2. Send errors: 403 `board_officers_only` and 403 `room_closed` show the same two lines, never "Request failed".
3. Cards render as their fallback text in an ordinary bubble. Check that no old renderer hides or crashes on a message with unknown fields, and that a message with `removed: true` is not drawn as a normal bubble (draw "Removed by an officer" to its own sender).
4. The old inbox (`messages.html`) must draw a club-room row that has `members: []` and `peer: null` (use `org.name` + the room name, the club's logo or initial).
5. Each change in Light and Night with tokens (memory `project_night_mode.md`), at 375px. No new Discord wording; the wording rename of the desktop rails is a later wave.

## 11. File ownership, order, gates

**B0 runs alone first** (pure modules, types, signatures, the flag). Then B1, B2, B4, B5 in parallel, each: implement → adversarial review → one repair. No Write/Edit over ~150 lines; findings written to disk in small pieces.

| batch | owns (nobody else edits these) |
|---|---|
| **B0** | `src/lib/chat/flag.ts` + test, `flag-server.ts`, `schema.ts`, `room-state.ts` + test, `types.ts` (every type and error code in this file), signature stubs for `rooms.ts` and `cards/{hydrate,fallback,snapshot,validate}.ts`, `src/app/api/me/features/route.ts`, `.env.example` |
| **B1** | migration A; `src/lib/chat/rooms.ts`; `src/lib/messages/channel-access.ts`; `src/app/api/orgs/route.ts` (default-rooms hunk); `src/app/api/orgs/[slug]/channels/**`; `src/lib/club-routes/officer-guard.ts`; `scripts/local-seed.mjs`; `scripts/sql/chat-v2-rooms-check.sql` |
| **B2** | migration B; `src/lib/chat/cards/**` + tests; `src/app/api/me/threads/[id]/cards/**`; the message-snapshot hunk of `src/app/api/me/reports/route.ts` |
| **B4** | `src/app/api/me/threads/[id]/messages/route.ts`; `…/messages/[messageId]/route.ts`; `src/app/api/me/threads/route.ts`; `src/app/api/users/search/route.ts` |
| **B5** | `src/components/mobile/MessagesMobile.tsx`; `src/app/campus/campus-home.tsx`; `public/html/messages.html`; `public/html/_miniMessenger.js` |

A change needed in someone else's file is a written request to that batch's owner, handled in the integration pass.

Before writing any route or proxy code, every batch reads the Next.js 16.3 guides named in asis section 10 (`context.params` is a Promise; `cookies()` / `headers()` are async; the proxy is `src/proxy.ts`).

**Gates, in order**

1. `npm run typecheck`, `npm run lint`, `npm test` (node tests for `flag`, `room-state`, `cards/fallback`, `cards/validate`, `outranks`).
2. Local rehearsal: seed the SAE-shaped club → `psql -f` migration A → POST-CHECK passes → `psql -f` migration B → `scripts/sql/chat-v2-rooms-check.sql` (as a member: Board top-level refused, reply accepted, `kind = 'poll'` refused, closed event room refused; as a non-member with an RSVP: event room invisible; after leaving the club: rows gone; after re-joining: rows back; removal deletes RSVPs and rows).
3. Cost: `EXPLAIN (ANALYZE)` of the message read for an event room with 200 messages, as `authenticated`; and of `/api/me/threads` for a member of 5 clubs. Recorded in the migration header.
4. Integration pass, then the orchestrator's browser walk at 375px as a NON-admin member on the local stack (memory `feedback_browser_pass.md`): Lounge send works; Board shows "Only officers post here."; a Board post by the officer account appears for the member; desktop Campus › Chat same; `messages.html` and the mini messenger still send DMs; nothing white-flashes in Night.
5. Production: re-read the pre-flight facts read-only → **Franky's yes** → apply A, record it, apply B, record it (quiet hour) → deploy → set `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' ids>`, `CHAT_V2_CLUBS=<SAE's id>` → redeploy → anon + member curl checks live (memory `reference_live_verification.md`).
6. Commit and push per batch group once green (memory `feedback_mobile_push.md`).

## 12. Open points for the critic (each with my default)

1. **Custom titles ("Your hat: Treasurer") do not exist**; v1 shows the role. Default: keep the role; custom titles after launch with the member-list work Franky already has planned.
2. **A removed message is still shown to its own sender** (existing RLS). Default: the new screens label it "Removed by an officer"; old screens get the same label in B5.
3. **The sender's own delete stays a hard delete**, also when a report is open (existing behaviour; the report keeps its snapshot). Default: unchanged in v1.
4. **Anonymous polls with very few voters**: counts are shown from the first vote. Default: accept for v1.
5. **Subscription backfill makes every club room appear in the OLD inbox for every member.** Production today: 7 memberships, all founders and testers. Default: accept; it is also what the new inbox needs.
6. **Club creation failing on its rooms now deletes the club** (8). Default: yes; a club without a Board and a Lounge breaks the invariant everything else relies on.
7. **Event counts "from 5 up"** (critique #4) are NOT part of v1; counts outside the room stay as they are today.
8. **The 2 messages in `test-f7ae4129 / announcements`** stay where they are even if a non-officer wrote them (hidden test club).
9. **Officers promoted after a room closed** have no read state on it (3.4). Default: accept.
10. **`closes_at` on polls** is in the model and the API but has no picker in the v1 mockups. Default: keep the column, send null from the v1 screens.
