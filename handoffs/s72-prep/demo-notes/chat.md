# The new chat on a phone: map for the demo video (S72, 2026-10-02)

Scope: read-only. Nothing was sent, voted, RSVP'd or written. Database reads ran inside
`set default_transaction_read_only = on` against the LOCAL container `supabase_db_vibe`
(helper: `notes/chat/q.sh`). The live function bodies were dumped to `notes/chat/functions.sql`.

Legend: **[ran]** = verified by running it (browser walk as franky, or a local SQL read).
**[code]** = read in the source only.

## 0. What is in the local database right now [ran]

People (public.users.handle, NOT the email's first name):
franky, jamesandres, rylanconaway, mayaokafor, theolindqvist, priyaraman, jonahreyes, amaradiallo,
lucasferreira, hanasato, devonbrooks, noorhaddad, elicarter. Test accounts: avery_owner ("Avery Owner"),
blake_iu, casey_purdue, drew_new, emery_admin, vibe_review, vibe_review_pal.

| id | who |
|---|---|
| c5ee853a-6bdb-4af6-ac7e-e13f0cd02156 | franky (campus_id iu-bloomington) |
| 481c2a8f-f5d2-48fb-b7a0-fcf5d40e9ea5 | jamesandres |
| a5f98f97-eff8-4b8c-9a4e-2f6bff2c05d5 | priyaraman (Chess Club owner) |
| 1bf171d3-629a-4a3e-a7f0-8f93fa8a5fb5 | noorhaddad |
| 79002b01-6276-4691-9565-70674299dccd | theolindqvist |
| 219950e5-dd5c-4400-b81f-b36f9cd2ed5b | mayaokafor |
| 831d8827-0cfb-47ad-b91b-6566f1bcfe7c | elicarter |
| c3b9dbb5-df1f-4674-9a9b-134a487ae1a2 | avery_owner |

Clubs: sae 928c04bb-a5b6-45a8-84ed-e5bb77070134 (join_policy invite, is_public false),
chess_club ccf2d5e3-8b69-49ce-a0bc-50bf1bff5fec (open, public), finance_club, tower_floor_3, north_hall.

Membership (public.org_members):
- sae: avery_owner **owner**, franky **admin**, jamesandres member.
- chess_club: priyaraman **owner**; noorhaddad, elicarter, lucasferreira members.
  **Franky, Theo and Maya are NOT members** (Franky follows it: org_followers.source = 'discover').
- finance_club: jonahreyes owner; devonbrooks, noorhaddad. tower_floor_3: amaradiallo owner; elicarter,
  theolindqvist. north_hall: lucasferreira owner; hanasato, noorhaddad.

Rooms (public.channels, type 'org_channel'):

| club | kind | name | id | member rows | messages |
|---|---|---|---|---|---|
| chess_club | lounge | lounge | ddc59d34-1086-4c78-9dea-ce297f7ea25f | 4 | 4 |
| chess_club | board | board | ba765e49-8ba6-4be0-a035-85ce0dbfb173 | 4 | 0 |
| chess_club | officers | officers | b75c64bb-e9b6-455c-8387-70619f860b3a | 0 | 0 |
| chess_club | event | Blitz Night | b6a3a2ea-7b89-4ba1-8041-725d6f43f4c5 (event a293de28-2ba2-424d-a50c-704f75485fac) | 3 | 0 |
| sae | lounge | lounge | cf3f77a9-0c41-45c1-af6b-0c8de49f9305 | 3 | 6 |
| sae | board | board | 777b3219-ab06-43d3-880f-f2050d8cd88f | 3 | 0 |
| sae | room | events | b23ab8e2-3a32-46b5-afc5-3d047be188c4 | 3 | 2 |
| sae | officers | officers | 908bd027-59db-49f4-883e-42aeaf9800b2 | 0 | 0 |
| sae | event | Cookout on the Lawn | 23b0bc36-9a84-47ac-a7ac-258c6f766d9c | 3 | 0 |

Chess Club Lounge today (4 lines, written by demo-seed CLUB_MESSAGES, `scripts/demo-seed.mjs:976-984`):
priya "Boards are booked for tonight. Doors open at 6:45." · noor "I'll be there. Is it ok if I bring a
friend who has never played?" · priya "Always. Beginners get the comfy table." · eli "Can someone teach
me what a fork is before I embarrass myself".

SAE today: Lounge = 3 lines by avery_owner (2026-09-29) then james / franky / james (today);
room "events" = 1 line by avery_owner ("w1test int SAE events room by avery", 2026-09-29) then one by
franky. The Board is empty. That is the "four test lines by Avery Owner": 3 in the Lounge, 1 in `events`.

Franky's DMs (channels.type 'dm', name ''): james 3560dfef-08d0-44ac-9138-7dc2b1afbbd0 (3 messages),
maya 02b6bcfd-a0ba-4b50-a213-47fb699633b7 (3), theo 62a3cd24-395c-43d1-90a2-52fb9d19f510 (2),
rylan 0d8a4fbb-f007-4caf-9d67-cce6b68c434c (2). All accepted, all read, none pinned.

## 1. Messages home

Files: `src/components/mobile/messages/home/MessagesHome.tsx` (the screen), `home-rules.ts` (every label and
ordering rule), `ClubRow.tsx`, `PersonRow.tsx`, `YourWeek.tsx`, `MonthSheet.tsx`; shell `src/components/mobile/MessagesMobile.tsx`.
With chat_v2 on, `/campus` has only Feed / Events / Orgs / Map (no Chat chip) **[ran]**; `CampusMobile.tsx:94` says why.

Three GET reads on mount (`MessagesHome.tsx:120-131, 167-181`):
- `GET /api/me/threads?scope=chats` → `{threads, requests}`: dms and groups only (`src/app/api/me/threads/route.ts:408, 427`).
  A row is a **request** when my `channel_members.accepted_at IS NULL` (`route.ts:766`); else it is in `threads`.
- `GET /api/me/inbox` → `{clubs: InboxClub[]}` (`src/app/api/me/inbox/route.ts`). One entry per club where I hold a
  `channel_members` row on BOTH its board and its lounge (`src/lib/chat/reads.ts:110` groupClubRooms) and have an
  `org_members` role. No membership = no club row. Following a club gives nothing here.
- `GET /api/me/calendar?from=<Mon>&to=<Sun>` → entries of `kind: "rsvp"` feed "Your week" (`home-rules.ts:447`).
  The lists re-read every 30 s; the week every 5 min.

**Your week** strip: seven day buttons, a coral dot under a day with a `going` RSVP (grey for `maybe`), and one
card per RSVP'd event of the week on screen. Source table: `rsvps` (status going/maybe) joined to `events`.
The card is a LINK (`<a href="/messages?channel=<event room id>">`, `YourWeek.tsx:499-504`) only when the calendar
entry has `room_id`, which the server sets only when I may enter the event room (= I am a member of the club and
hold a row on the event room). Otherwise it is a plain tile (`role="group"`).
**[ran]** For Franky today: `Blitz Night … status=going room=null state=soon org=chess_club` → the tile says
"7 PM · Going / Blitz Night / Chess Club" and is NOT tappable (he is not a Chess Club member). For Noor (a member)
the same card is a link (`aria "Blitz Night room, Chess Club, 7 PM, you're going"`).
The strip swipes left/right between weeks (−4 … +26); `Previous week` / `Next week` buttons exist but are 1×1 px
(screen-reader only). Tapping the "Your week" title or a day opens the month sheet (a bottom drawer).

**Filter chips** = `role="tab"` inside `role="tablist" aria-label="Show"` (`MessagesHome.tsx:486-551`):
All (default, `/messages`), Chats (`/messages?tab=chats`), Clubs (`?tab=clubs`), Requests (`?tab=requests`) **[ran]**.
- All: clubs and dm/group threads merged, pinned first, then newest activity (`home-rules.ts:49` mergeHomeRows).
  A coral count badge on All = unread threads + clubs with something unread (muted ones left out).
- Chats: dm/group rows only. Clubs: club rows only. Requests: pending dms (count pill when > 0).

**Club row** (`ClubRow.tsx`): 48px disc (logo or initials on a gradient), name, time of `last_activity_at`,
preview line, then a chip line `<when> · <next event title>` + `Going`/`Maybe` + `N new`.
- Preview (`home-rules.ts:109` clubPreview): if the Board has an unread post → coral dot + `Board: <text>`; else the
  newer of board.latest / lounge.latest (`Board: …` or `<Author name>: …`). The text is `messages.content`, so a
  card previews as its stored fallback text (`Event: Blitz Night · Fri Oct 2, 7 PM — note`, `Poll: question`).
- `N new` = Lounge messages by others newer than my `channel_members.last_read_at` (null → the row's created_at),
  capped 99 (`inbox/route.ts:221-236`). Board unread = same rule on the board row, as a boolean.
- Next-event chip = the club's soonest event with `ends_at > now` (`inbox/route.ts:240-254`), with my RSVP.
- **Tap target**: opens the club on the Lounge, EXCEPT when `board.unread && lounge.unread_count === 0` → it opens on
  the Board (`ClubRow.tsx:37, 66`).
- Its accessible name is a whole sentence that changes with state (`home-rules.ts:187` clubRowLabel), e.g. today
  **[ran]** `"SAE, Cookout on the Lawn Tuesday 5 PM, you're going, 5:01 AM"`.

**Person row** (`PersonRow.tsx`, `home-rules.ts:221-248`): 44px disc, name, time, preview (`You: …` for my own last
line; `Shared a post` when the last message has an attachment and no text). Accessible name
`"<Name>, <spoken time>[, unread][, pinned]"`, e.g. **[ran]** `"James Andres, Yesterday"`.

**What Franky sees today [ran]** (still `01-home-all.png`): Your week with Fri 2 selected and the Blitz Night tile;
All selected; rows in this order: SAE ("James Andres: I'm in.", chip "Tue 5 PM · Cookout on the Lawn", Going, 5:01 AM);
James Andres ("nice, let's get food after the meeting", Yesterday); Rylan Conaway ("You: good to hear. thanks for
setting up"); Maya Okafor ("I'll come by, thank you", Wed); Theo Lindqvist ("You: open to everyone, bring a friend", Wed).
No unread badge anywhere, Requests is empty (`02-home-requests.png`). SAE has no logo (teal disc with "S").
Note the times: the DM rows read "Yesterday"/"Wed" because the seed wrote them 20–47 hours ago; they are not from today.

## 2. A club space

Files: `club/ClubSpace.tsx` (the full-screen view, a right-side vaul drawer, `role="dialog"` named after the club),
`club/UpNext.tsx`, `club/RoomChips.tsx`, `club/BoardStrip.tsx`, `club/BoardView.tsx` + `club/BoardPost.tsx`,
`club/RoomThread.tsx`, `club/RoomComposer.tsx`, `club/EventChat.tsx` + `club/EventAbout.tsx`, `club/helpers.ts` (all copy),
`cards/CardBubble.tsx` + `PollCardView` / `SignupCardView` / `EventCardView` + `cards/card-rules.ts`.
Reads: `GET /api/orgs/<handle>/space` (rooms, viewer role, up_next, board_latest; 403 `members_only` for a non-member)
and `GET /api/me/threads/<roomId>/messages` polled every 4 s (`src/lib/chat/use-room-poll.ts:80`).
Opening a room POSTs `/api/me/threads/<roomId>/read` (sets my `channel_members.last_read_at = now`).
The bottom tab bar is hidden while a club space or a DM is open **[ran]**.

Top to bottom **[ran]** (stills `03-sae-lounge.png`, `17-noor-chess-lounge.png`):
1. **Header** (`ClubSpace.tsx:533`): Back (`aria-label="Back to Messages"`), 40px club disc, `<h1>` club name,
   `Your hat: Owner|Officer|Mod|Member · N members` (org_members.role: owner→Owner, admin→Officer), and a link
   `aria-label="Open <club>'s page"` → `/orgs/<handle>`.
2. **Up next** (`UpNext.tsx`): up to 3 not-ended events of the club, soonest first. A card is a button only when I can
   enter its event room. Label e.g. `"Blitz Night room, soon, tonight 7 PM, you're going"`. Inside 3 h of start it gets
   the glowing "Soon" chrome; while running, "Live now".
3. **Room chips** (`RoomChips.tsx`, `<nav aria-label="Rooms in <club>">`): order = Lounge, Board, Officers (officers
   only), event rooms not closed (by start), then other rooms by position (`reads.ts:200`). Visible text `Lounge`,
   `Board`, `Officers`, the event title, or a room's name. aria-labels (`helpers.ts:94`): Lounge = none (text);
   Board = `"Board"` or `"Board, 1 unread post"`; Officers = `"Officers, only officers see this room"`;
   event = `"<title>, event chat, tonight|today|live now|ended|Tue 5 PM"`. The row scrolls sideways when it
   overflows (SAE has 5 chips; Chess Club has 3 and fits). A chip tap `replaceState`s `/messages?channel=<roomId>`.
4. **Board strip** (`BoardStrip.tsx`): on every room except the Board, when the Board has a post: one line
   `Board · <Author> · <text>` → opens the Board. Absent when the Board is empty (SAE, Chess Club today).
5. **The room**:
   - Lounge / `room` / officers: `RoomThread.tsx`. Oldest first, pinned to the newest row. Date separators
     (`Today`, `Yesterday`, `Tue`, …) before the first row, on a day change, **and after any gap over one hour**
     (`helpers.ts:173`). Others' rows: 28px avatar + `Name @handle` on the first row of a run, then bubbles, each
     with a round "⋯" button (`aria-label="Message actions"`) beside it. Mine: right-aligned coral glass, no "⋯".
   - Board: `BoardView.tsx` (`section aria-label="Board posts, newest first"`), each post an `<article
     aria-label="Board post from <Name>, <Role>, <time>">` with a byline (avatar, name, role word, time), the body
     or a card, and a 44px toggle `Reply` / `1 reply` / `N replies` + "Replies stay quiet". Unfolding reads
     `GET …/messages?root=<postId>&limit=200` and shows the replies and a `Reply quietly` field.
     A member sees a tile instead of a composer: "Only officers post on the Board. You can reply to any post."
     (`18-noor-chess-board-member-view.png`); an officer sees "Everyone in <club> sees this" + `Post to the Board`.
   - Event chat: a second layer over the space (`EventChat.tsx`), header `Back to <club>`, an About block (banner
     with the state pill `Soon · starts 7 PM` / `Live now`, Where, When, "N going · M maybe" with up to 8 avatars of
     ROOM MEMBERS who are going, and my RSVP pill), then the thread. Stills `08-sae-event-chat.png`,
     `19-noor-blitz-event-chat.png`.
6. **Composer** (`RoomComposer.tsx`): "+" (`aria-label="Add a poll, sign-up or event"`; opens a tray with Poll /
   Sign-up / Event, still `20-sae-plus-tray.png`), a one-line `<input>` whose placeholder and aria-label are
   `Message the Lounge` / `Post to the Board` / `Message the event chat` / `Message <room name>`, and a submit
   button `aria-label="Send"` (`"Post to the Board"` on the Board). Enter submits.

**Cards** (stills `12-`, `13-`, `14-cards-lounge-*.png`, seen as blake in chat_seed_club) **[ran]**:
- Event card: a banner with the club disc and name, `<Author> · Event`, the title, `<place> · <Thu Oct 8, 7 PM>`, the
  note, two buttons `Going` / `Maybe` (group "Your RSVP"), `N going`, and `Open event chat` (only when I may enter).
  RSVP here writes `rsvps` through the events RSVP route.
- Poll: `<Author> · Poll`, the question, one row per option (`role="radio"`, or checkbox-like when multi), each with
  its count and up to 12 voter discs when names are shown, footer `N voted · names shown|anonymous`.
  Vote = `PUT /api/me/threads/<room>/cards/<messageId>/vote {option_id, on}` → RPC `chat_cast_vote`.
- Sign-up ("take a spot"): `<Author> · Sign-up`, the title, one row per slot with `K open` and a `Take a spot` button
  (coral on the first open row; `Leave` when mine; `Full`), footer dots + `X of Y filled`. Same vote route.
- Created by `POST /api/me/threads/<room>/cards` → RPC `chat_create_poll` / `chat_create_event_card`. Cards are club
  rooms only (a dm answers 400 `cards_club_rooms_only`).

**Where each thing lives in the database**

| Thing | Table.column |
|---|---|
| A room | `channels` (type 'org_channel', `org_id`, `kind` board/lounge/officers/event/room, `name`, `is_private`, `position`, `event_id` for kind event) |
| Who is in a room, read marker, pin, mute | `channel_members` (channel_id, user_id, role 'member'/'admin', accepted_at, `last_read_at`, pinned_at, muted_until) |
| A Lounge line | `messages` (channel_id, user_id, content, created_at, kind 'text') |
| A quote-reply in the Lounge | `messages.parent_message_id` |
| A Board post | a top-level `messages` row in the kind='board' channel (`thread_root_id` null) |
| A Board reply | `messages.thread_root_id` = the post's id (count via RPC `chat_reply_counts`) |
| A poll or sign-up | `messages` (kind 'poll', content = `Poll: <q>` / `Sign-up: <title>`) + `chat_polls` (message_id PK, channel_id, mode 'poll'/'signup', question, anonymous, multi, closes_at, created_by) + `chat_poll_options` (id, poll_id, position 0-9, label ≤80, capacity 1-50 for a sign-up) |
| A vote / a taken spot | `chat_poll_votes` (option_id, poll_id, user_id, created_at); PK (option_id, user_id) |
| An event card | `messages` (kind 'event_card', `card_event_id` → events.id, content = `Event: <title> · <Thu Oct 8, 7 PM>[ — <note>]`) + `chat_event_cards` (message_id PK, note ≤200) |
| Reactions | `message_reactions` |
| Going / Maybe | `rsvps` (event_id, user_id, status) |
| Club membership and hat | `org_members` (org_id, user_id, role owner/admin/mod/member) |

RPCs (service role only; each raises 42501 for anon/authenticated): `chat_repair_club(p_org)`,
`chat_create_event_card(p_channel, p_user, p_event, p_note, p_content)`,
`chat_create_poll(p_channel, p_user, p_mode, p_question, p_options jsonb, p_anonymous, p_multi, p_closes_at, p_content)`,
`chat_cast_vote(p_poll, p_option, p_user, p_on)`. Bodies in `notes/chat/functions.sql` **[ran: dumped from the local DB]**.

**How `scripts/local-seed.mjs` seeds this [code]**
- `ensureMember` (`:397`): upsert `org_members`, then upsert a `channel_members` row per public room
  (`ignoreDuplicates`). On a migrated database the `chat_org_members_rooms` trigger has already written those rows.
- `ensureMessage(channelId, userId, content, parentId)` (`:549`): keyed on (room, author, content); a plain insert
  with the service role, `kind: "text"`; never re-written. demo-seed's copy (`scripts/demo-seed.mjs:1053`) adds
  `created_at: at`.
- `chat_repair_club` (`:626-629`, and `demo-seed.mjs:1361, 1381`): creates the three core rooms and every open
  event's room, adds every missing (member, public room) row and (officer or RSVP'd member, event room) row, deletes
  room rows of non-members. Changes nothing when nothing is missing.
- `seedClubCards` (`:697-743`): for each card, build the fallback `content` (`cardContent`, `eventWhenLabel` in the
  campus zone), look for an existing card by (channel, kind, content) (`findCard`, `:688`), else call the RPC:
  `admin.rpc("chat_create_poll", { p_channel, p_user, p_mode: "poll"|"signup", p_question, p_options: [{label}] or
  [{label, capacity}], p_anonymous, p_multi, p_closes_at: null, p_content })` or
  `admin.rpc("chat_create_event_card", { p_channel, p_user, p_event, p_note, p_content })`.
  It seeds NO votes and NO Board posts (its one Board line is skipped on a migrated database, `:519, 607`).

## 3. Making Chess Club's chat look alive for Franky

Nothing below was written; it is the plan. "[db-fn]" = I asked the database's own function, read-only.

**Today [ran]**: `GET /api/orgs/chess_club/space` as franky → 403 `{"error":"Members only.","code":"members_only"}`;
`GET /api/me/threads/<chess lounge>/messages` → 403 "Not a member"; `/messages?channel=<chess lounge>` falls back to
the Messages home (still `11-chess-deeplink-as-franky-nonmember.png`). Chess Club is not in his inbox.
[db-fn] `can_post_org_channel(lounge, theo|maya, null)` = false (not members); `(board, priya, null)` = true;
`(board, noor, null)` = false; Blitz Night `ends_at > now()` = true at 2:10 PM campus time.

### The rows, in the order to write them (service-role client, like demo-seed's `admin`)

**Step 1. Membership** — `org_members`, one row each, org_id `ccf2d5e3-8b69-49ce-a0bc-50bf1bff5fec`:
`(user_id franky c5ee853a…, role 'member')`, `(theo 79002b01…, 'member')`, `(maya 219950e5…, 'member')`.
In demo-seed terms: three entries in `MEMBERS` (`scripts/demo-seed.mjs:494`), written by `ensureMember` (`:514`).
What the INSERT fires (function bodies in `notes/chat/functions.sql`):
- `chat_org_members_rooms` (AFTER INSERT): `channel_members` rows on the club's public rooms — Lounge `ddc59d34…`
  and Board `ba765e49…` — plus the open event room of every event the person holds a going/maybe RSVP for:
  **Franky and Maya get the Blitz Night room `b6a3a2ea…`** (both RSVP'd going); Theo does not (no RSVP).
  Each row: role 'member', `accepted_at = now()`, **`last_read_at = now()`**.
- `org_members_imply_follow`: an `org_followers` row with source 'join', `ON CONFLICT DO NOTHING` (Franky's
  existing 'discover' follow stays as it is).
- `org_members_clear_removal_on_join`: deletes any `org_removals` row.
Then `ensureMember` upserts the public-room rows again with `ignoreDuplicates` (a no-op after the trigger).
Result on screen: Chess Club appears in Franky's inbox; the header reads "Your hat: Member · 7 members"; the
"Your week" Blitz Night tile becomes a tappable link; the event card shows `Open event chat`.

**Step 2. Board post** — one `messages` row, plain insert:
`channel_id = ba765e49-8ba6-4be0-a035-85ce0dbfb173` (board), `user_id = a5f98f97…` (**Priya, the owner**),
`content = '…'`, `kind = 'text'`, `thread_root_id = null`, `created_at = <today, e.g. 3 h ago>`.
Optional, to show "2 replies": two more rows in the same channel with `thread_root_id = <that post's id>`,
authors Noor and Theo, later `created_at`.

**Step 3. Event card for Blitz Night** — RPC, not a hand-made row:
`admin.rpc("chat_create_event_card", { p_channel, p_user, p_event: "a293de28-2ba2-424d-a50c-704f75485fac",
p_note: "<≤200 chars or null>", p_content: "Event: Blitz Night · Fri Oct 2, 7 PM — <note>" })` → returns the message id.
It writes `messages` (kind 'event_card', card_event_id) + `chat_event_cards` (message_id, note).
`p_channel` = the Lounge with any member as `p_user`, or the Board with Priya (owner/admin only).
`p_content` must be the stored fallback text (`src/lib/chat/cards/fallback.ts:40`; local-seed's `eventWhenLabel`
+ `cardContent`, `scripts/local-seed.mjs:650-668`, reproduce it), 1–300 characters.
Then backdate: `update messages set created_at = <when> where id = <returned id>` (the RPC stamps `now()`).

**Step 4. Poll** — RPC:
`admin.rpc("chat_create_poll", { p_channel: "ddc59d34-…" (lounge), p_user: <priya or noor>, p_mode: "poll",
p_question: "<≤200>", p_options: [{label:"…"},{label:"…"},{label:"…"}], p_anonymous: false, p_multi: false,
p_closes_at: null, p_content: "Poll: <question>" })` → message id. Writes `messages` (kind 'poll') + `chat_polls`
+ `chat_poll_options` (position 0..n). Backdate `messages.created_at` the same way.
Votes: read the option ids (`select id, position, label from chat_poll_options where poll_id = <msg id>`), then
per voter `admin.rpc("chat_cast_vote", { p_poll: <msg id>, p_option: <option id>, p_user: <voter>, p_on: true })`.
Voters must be club members (Noor, Eli, Lucas, Priya, and Theo / Maya once they are). A single-choice poll keeps
one vote per person (a second vote replaces the first). Vote time is `now()`; only the order shows (voter discs).

**Step 5. Lounge lines** — plain `messages` rows in the Lounge `ddc59d34…`, `kind 'text'`, explicit `created_at`,
via `ensureMessage`. Four exist already (Priya, Noor, Priya, Eli; see section 0). Add four to six from Theo, Maya,
Noor and Priya so the thread is 8–10 lines around the event card and the poll.

**Step 6. Read markers** — `update channel_members set last_read_at = <ts> where user_id = franky and channel_id in
(lounge, board, event room)`: an explicit UPDATE, every run (see the trap below).

**Step 7.** `chat_repair_club(chess_club)` — the seed already calls it last (`demo-seed.mjs:1381`). Harmless here.

### Timestamps that read well
- All `created_at` in the past and on TODAY's campus day; a line dated in the future sorts under whatever is sent
  on camera and counts as unread.
- A separator is drawn after any gap over one hour (`club/helpers.ts:173`). Today's four lines sit at −6 h, −5.5 h,
  −5.4 h, −3 h, so the Lounge shows "Today" twice **[ran: `17-noor-chess-lounge.png`]**. Keep consecutive rows under
  60 minutes apart for one "Today", or accept two clusters (morning / just now).
- `hoursAgo` is applied once, when a row is first written (`demo-seed.mjs:936`); rows from an earlier day keep that
  day and will read "Yesterday". Seed and film on the same campus day (the seed header already says so).
- Order inside the Lounge is `created_at` only, cards included. Suggested: Priya's two existing lines → event card
  → Noor / Priya / Eli → poll → Theo, Maya, Noor, Priya, the last one a few minutes old.

### Traps: what would refuse or quietly spoil those rows

Database (constraints and triggers read from the live local schema **[ran: `\d` and `pg_get_functiondef`]**):
1. **`messages_check_media_ref`** (BEFORE INSERT/UPDATE OF media_url, channel_id): `media_url` must be empty or a
   key inside `messages/<that channel id>/` (`media_key_in_folder`), else 23514 "messages.media_url must be empty or
   a file uploaded to this chat". This is the chat twin of `posts_check_media_refs`. Club rooms take no media at all
   (policy `messages_insert_org_member` requires media null; the route answers `club_media_off`). → Seed text only.
2. **Cards must come from the RPCs.** `messages_card_event_shape`: `card_event_id` only with kind 'event_card'.
   A hand-written kind 'poll' / 'event_card' row with no side-table row hydrates to `card: null` and draws as a
   plain bubble holding the fallback text.
3. **`chat_create_event_card` refuses** with P0C23 "event not found" when the event is not the same club's or
   **`ends_at <= now()`**: Blitz Night ends at 10 PM campus time, so a seed run after that cannot make the card.
   P0C21 when `p_user` may not post in `p_channel` (on the Board: owner/admin only). P0C22 for a note over 200 or
   content outside 1–300 characters.
4. **`chat_create_poll` refuses** with P0C22 for: fewer than 2 or more than 10 options, a label outside 1–80,
   a question outside 1–200, `p_closes_at` in the past, and **a `capacity` key on a poll option** (capacity is for
   sign-ups, where it is required and 1–50). P0C21 as above.
5. **`chat_cast_vote` refuses** with P0C24 when the voter cannot view the room (not a member) and P0C25 when the poll
   is closed or, outside the Board, the voter cannot post there. So Theo / Maya can vote only after step 1.
6. **All four RPCs raise 42501 for the anon and authenticated roles**: call them with the service-role client.
7. **The room triggers swallow their own errors** (`chat_org_members_rooms`, `chat_channels_subscribe`,
   `chat_events_room`, `chat_rsvps_room` all `exception when others then raise warning`). A failure there is
   silent: the member row lands and the room rows do not. `chat_repair_club` afterwards is the safety net.
8. **`chat_repair_club` deletes** every room row held by a non-member of the club (step 5a) and every event-room row
   of someone who is neither owner/admin nor going/maybe (5b). Never write room rows for someone before their
   `org_members` row. And `chat_votes_drop_access` (AFTER DELETE on channel_members) deletes that person's votes
   in that room — so un-joining Franky later also removes his vote.
9. **Board rule is not a constraint.** Only RLS and the route stop a plain member from a top-level Board post; a
   service-role insert by a member goes in and shows as a member's Board post. Keep the Board author Priya.
10. Unique / check constraints to respect: `org_members (org_id, user_id)` unique, role in owner/admin/mod/member;
    `channel_members (channel_id, user_id)` unique, role in admin/member; `channels_one_core_room` (one board,
    lounge, officers per club: never insert rooms by hand); `chat_poll_options (poll_id, position)` unique,
    position 0–9; `chat_event_cards.note` null or 1–200 (pass null, not ""); `messages_thread_root_not_self`.
11. `bump_org_activity` (AFTER INSERT on messages) only moves `orgs.last_activity_at` forward. No effect on chat.

App behaviour that changes what is on camera:
12. **Idempotency of the event card.** local-seed finds an existing card by its `content`, and the content carries
    the DATE. demo-seed re-dates Blitz Night to "today" on every run, so a run on another day would add a second
    card. Key the lookup on `(channel_id, kind = 'event_card', card_event_id)` instead. The card itself always
    shows the event's live title and time; only the stored text (inbox preview, Board strip) would be stale.
13. **Read markers decide the home row.** Joining stamps `last_read_at = now()`, so backdated lines are all read: no
    "N new". Opening a room on camera POSTs `/read` and stamps it again. For a repeatable take, the seed (or the
    recorder's cleanup) must UPDATE Franky's `last_read_at` each run. And mind the row's tap rule: Board unread +
    Lounge nothing new → the row opens on the BOARD and the preview becomes `● Board: <text>`.
14. **The inbox preview is the stored text.** If a card is the newest row, the home row reads
    "Priya Raman: Poll: …" or "Board: Event: Blitz Night · Fri Oct 2, 7 PM — …". Make a plain line the newest.
15. **Voters are named from the viewer's own read of `users`**; counts never change. All cast accounts are readable.
16. **Membership shows elsewhere.** As a member Franky's Chess Club page, the Orgs pane and anything that says
    Join / Follow will change; the cast notes (`handoffs/s72-prep/demo-cast.md`, demo-seed's comment at `:490-493`:
    "Franky is in SAE only", "Maya is in no club") go stale. Theo and Maya as members is a cast change to confirm;
    without it their lines can still be inserted and would draw (the Lounge shows no role), but the data would say
    a non-member spoke, and they could not vote.
17. Sent on camera, typed text passes the word filter (`checkText`) and a 60-per-minute send limit per user
    (`messages/route.ts:259, 299`). Neither matters for one line per take.

## 4. A DM thread (Franky ↔ James)

File: `src/components/mobile/messages/ConversationView.tsx` (the old conversation view, restyled for Night; also a
right-side drawer, `role="dialog"`), bubbles in `MessageBubble.tsx`. Thread id `3560dfef-08d0-44ac-9138-7dc2b1afbbd0`.
Stills `09-dm-james.png`, `10-dm-james-typed-not-sent.png`, `21-dm-longpress-picker.png`.

**What it looks like [ran]**: header = Back (`aria-label="Back"`), avatar disc "JA", the name as a link to
`/profile/jamesandres`, `@jamesandres`, and a "⋯" (`aria-label="More actions"`). Three bubbles: James's are dark
glass on the left, each with a small "⋯" (`aria-label="Message actions"`); Franky's is coral glass on the right.
There are NO timestamps, NO date separators and NO sender names in a DM. Composer: an attach button
(`aria-label="Attach a photo or video"`), a `<textarea placeholder="Message…">` that grows up to 120px, a submit
button `aria-label="Send"` (grey and `disabled` until there is text, coral after). Enter sends; Shift+Enter is a new line.

**Typing indicator and read receipts: there are none on the phone.** The server has both — `POST …/typing`
(`src/app/api/me/threads/[id]/typing/route.ts`) and `peer_last_read_at` / `peer_typing` in the thread GET
(`messages/route.ts:178-236`; **[ran]** the GET answered `peer_last_read_at: 2026-10-02T17:37:05.761Z, peer_typing: []`)
— but no component reads those fields or calls `/typing` (grep over `src/`: only the routes and `types.ts`).
The DM view also does not poll: it reads `GET …/messages?limit=50` once on open (`ConversationView.tsx:157-190`),
so a line James sends while the thread is open does not appear until it is reopened. (Club rooms poll every 4 s.)

**A shared post inside a DM** (`MessageBubble.tsx:339-520`) **[code]**: a 260px card that links to `/posts/<id>`. Its
top is a fixed 150px block painted `linear-gradient(135deg,#2D1B4E,#1A3A5C)`; a picture is drawn over it only when
the post has `media_thumbnail_url` or (for a non-video post) `media_url`. Under it: the label "POST", two lines of
the post's text, then "by <Name> @handle". A caption typed in the share sheet is the same message's `content` and
is drawn as a bubble ABOVE the card.
- **Why the empty colour block**: Priya's "Blitz Night is tonight…" post is text only (`posts.media_url` is null
  **[ran: SQL]**; `scripts/demo-seed.mjs:596`, `image: null`), so nothing covers the purple-blue gradient.
- **A post with a picture renders the picture**: the attachment's `media_url` goes through `postMediaProxyUrl`
  (`src/lib/post-media-url.ts:10`), which passes an `http(s)://` value through unchanged, and the demo pictures are
  stored as `http://127.0.0.1:54321/storage/v1/object/public/profiles/<uid>/posts/demo-*.jpg` **[ran: SQL; one
  fetched with curl → 200 image/jpeg]**. Not proven by sending one (read-only). Posts with pictures today: Franky's
  SAE "Letters are up on the lawn. Cookout is this week:" (`8b55b764-…`, demo-sae-letters.jpg), Hana's campus at
  night, Maya's fog, Franky's turtle / field / dunes, Rylan's three, James's kitten. To share Blitz Night with a
  picture, Priya's post needs an `image` in demo-seed's POSTS.
- An event cannot be shared into a DM (`cards_club_rooms_only`); only a post can.

**What happens on send** (`ConversationView.tsx:246-365`, `src/app/api/me/threads/[id]/messages/route.ts:248-620`):
1. Optimistic row `{ id: "temp_<ms>", content, created_at: now, user_id: me }` appended at once; the draft clears.
2. `POST /api/me/threads/<id>/messages` with `{ content }` (plus `parent_message_id` for a quote reply; the share
   sheet sends `{ content: <caption>, attachment_id: <postId>, attachment_kind: "post" }` — ONE message, from
   `src/components/mobile/SharePostSheet.tsx:187-197`).
3. Server: rate limit 60/min, publish gate (Terms + verified school email + not restricted), word filter, member
   check, block check, then an INSERT into `messages` on the sender's own client (RLS `messages_insert_member`).
4. Server also: queues a push per other member (`enqueueMessagePush`, does nothing while push is off), sets the
   sender's `channel_members.last_read_at = now` (and `accepted_at` if the thread was a request), writes mention
   notifications only if the text has an @handle.
5. Answer `{ ok: true, message }` replaces the temp row. On failure the temp row is removed, the draft comes back
   and a toast says why.
6. After a send from inside the DM view, `PushAsk` mounts above the composer (`ConversationView.tsx:361, 930`). In
   a phone browser tab it shows only "Get the app", and only when a store listing URL is configured
   (`src/components/push/push-ask-view.ts:134-166`). `/get` on the demo server shows no store link **[ran]**, so it
   should stay invisible; not proven by sending.

**Cleaning up after a take**: `delete from public.messages where user_id = <franky> and created_at >= '<take start>'`
(what `scripts/demo-video/record.mjs:85-93` already does). The delete cascades to `push_outbox`, `notifications`,
`message_reactions`, `chat_polls` / `chat_event_cards`. Left behind, harmless: Franky's `last_read_at` on that
thread and the rate-limit counter. If a take also VOTES or RSVPs, that cleanup does not cover it
(`delete from chat_poll_votes where user_id = <franky> and created_at >= …`; restore the `rsvps` row), and if a take
OPENS a club room, Franky's `last_read_at` there has moved (section 3, trap 13).

## 5. Avery Owner's four test lines in SAE

Where Franky can see them **[ran]**:
- **SAE → Lounge**: three lines at the top ("Welcome to the chapter chat." / "Chapter meeting is Sunday at 7." /
  "Dues are due by the end of the month."), under a "Tue" separator, with "Avery Owner @avery_owner". The Lounge has
  only six lines, so they are on screen the moment the room opens (`03-sae-lounge.png`).
- **SAE → `events` chip** (a leftover test room, the fifth chip): "w1test int SAE events room by avery" above
  Franky's own line (`06-sae-events-room.png`).
- Not on the Messages home: the SAE row previews the newest line, James's "I'm in.".
- Not in the Board (empty), Officers (empty) or the Cookout event chat (empty; its "3 going" discs are JA and FC).
- Avery is also SAE's `owner` in `org_members` ("3 members" in the header counts her), so she can appear on SAE's
  club page member list — outside chat, for whoever films `/orgs/sae`.

Least invasive ways to keep them off camera, mildest first:
1. **Do not open SAE in the take.** Film club chat in Chess Club (section 3); SAE is then only a row on the home,
   which shows the cast. Nothing is changed in the database. This is my recommendation.
2. **Push them above the fold, additive only.** The Lounge is pinned to its newest row. About seven short bubbles
   fit under the chips, so ten or so more cast lines in SAE's Lounge (and never scrolling up) keeps Avery's three
   off screen. Does nothing for the `events` room: do not tap that chip.
3. **Hide them reversibly**: `update messages set removed_at = now() where id in (<the four ids in section 0>)`.
   RLS shows a removed message only to its author, so Franky no longer gets them; `set removed_at = null` puts
   them back. It edits local-seed's fixture rows (wave-1 tests may count them), so only if SAE must be filmed.
Not recommended: deleting the rows (local-seed re-creates them on its next run) or removing Avery from SAE.

## 6. Selectors for the recorder

All **[ran]** as franky at 390×844 with `lib.mjs`'s `open()` and `tap()` unless marked [code]. `exact: true` matters.

| What | Selector |
|---|---|
| Messages tab (bottom bar, from any tab page) | `page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Messages", exact: true })` (or `a[href="/messages"]`) then `page.waitForURL("**/messages")` |
| The home is up | `page.getByRole("heading", { name: "Messages", exact: true })` |
| Filter chips | `page.getByRole("tab", { name: "All" \| "Chats" \| "Clubs" \| "Requests", exact: true })` (URL becomes `/messages?tab=clubs` etc.) |
| A club row | `page.getByRole("button", { name: /^Chess Club,/ })` (the name is a sentence that changes with unread / time / RSVP; anchor on the start) |
| A DM row | `page.getByRole("button", { name: /^James Andres,/ })` |
| Your-week event card (a link only once Franky is a member) | `page.getByRole("link", { name: /^Blitz Night room/ })`; today it is `getByRole("group", …)` and not tappable |
| The open club space | `const space = page.getByRole("dialog", { name: "Chess Club", exact: true })` — scope everything inside it |
| Back from a club | `space.getByRole("button", { name: "Back to Messages", exact: true })` |
| Room chips | `space.getByRole("navigation", { name: "Rooms in Chess Club" })` then `.getByRole("button", { name: "Lounge", exact: true })`, `.getByRole("button", { name: /^Board/ })` (it is "Board, 1 unread post" when unread), `.getByRole("button", { name: /^Blitz Night, event chat/ })` |
| Up next card | `space.getByRole("button", { name: /^Blitz Night room/ })` (opens the event chat) |
| Board strip (in the Lounge, when the Board has a post) | `space.getByRole("button", { name: /^Latest from the Board/ })` |
| The Board list / a post | `space.getByRole("region", { name: "Board posts, newest first" })` [code for the role]; `space.getByRole("article", { name: /^Board post from Priya Raman/ })` [code] |
| Unfold Board replies | `space.getByRole("button", { name: /^Show 2 replies/ })` (0 replies: `/^Reply\./`) [code: `club/helpers.ts:215`] |
| Lounge composer field | `space.getByRole("textbox", { name: "Message the Lounge" })` (an `<input>`; Board: "Post to the Board"; event chat: "Message the event chat") |
| Send in a club room | `space.getByRole("button", { name: "Send", exact: true })` (Board: "Post to the Board") |
| "+" tray | `space.getByRole("button", { name: "Add a poll, sign-up or event", exact: true })`; close: `"Close the tray"` |
| Poll option | `space.getByRole("radio", { name: /^Pizza/ })` (name carries the count: "Pizza. 0 votes.") |
| Event card buttons | `space.getByRole("button", { name: "Going", exact: true })`, `"Maybe"`, `"Open event chat"` |
| Event chat back | `page.getByRole("button", { name: "Back to Chess Club", exact: true })` |
| The open DM | `const dm = page.getByRole("dialog")` (one dialog at a time) |
| DM composer | `dm.getByPlaceholder("Message…")` (a `<textarea>`; the ellipsis is one character, U+2026) |
| DM send | `dm.getByRole("button", { name: "Send", exact: true })`, or press Enter |
| DM back | `dm.getByRole("button", { name: "Back", exact: true })` |
| Direct entry without taps | `/messages?channel=<room id or dm id>` opens that room or thread; `/messages?tab=clubs` |

Traps for the recorder:
- **The home stays mounted under an open club space or DM.** Home rows and chips are still in the DOM and still
  match; scope to the dialog once one is open, and to `page` only on the home.
- **`page.locator("button", { hasText: "James Andres" })` matches TWO buttons**: the DM row and the SAE club row,
  whose preview reads "James Andres: I'm in." (`scripts/demo-video/record.mjs:81` uses this with `.first()`; it works
  today only because the just-sent message sorts the DM above SAE). Use the role + `/^James Andres,/` form.
- **The share sheet lists every thread Franky can post in**, club rooms included (`SharePostSheet.tsx:127-143`). Once
  he is in Chess Club the list grows (Chess Club · Lounge, the Blitz Night chat …); keep picking James by `@jamesandres`.
- The tab bar is hidden (`display: none`) while a space or a DM is open: go Back first.
- Every other person's bubble carries a "⋯" button; Franky's own do not.
- `glide()` picks the scroller under the point (195, 500): inside a club space that is the room's thread, good.

Needs a long-press or a swipe:
- **Reactions / Reply / Report**: hold a bubble 500 ms without moving more than 10 px (`MessageBubble.tsx:92-125`), or
  tap its "⋯" (others' messages only). `page.touchscreen.tap` cannot hold; a CDP session works:
  `Input.dispatchTouchEvent` touchStart → wait 750 ms → touchEnd (`walk5.mjs`, still `21-dm-longpress-picker.png`).
  Cards have their own 500 ms hold (`cards/CardBubble.tsx`).
- **Your week**: swiping the strip left/right changes the week; the Previous / Next week buttons are 1×1 px.
- **Room chips**: the row scrolls sideways only when it overflows (SAE yes, Chess Club no).
- Nothing else. Both full-screen views are drawers with `handleOnly`; use their Back buttons.

## 7. Stills and files saved (all in `notes/chat/`)

`01-home-all.png` Messages home, All · `02-home-chats.png` · `02-home-clubs.png` · `02-home-requests.png` (empty) ·
`03-sae-lounge.png` SAE Lounge as it opens (Avery's lines visible) · `04-sae-lounge-top.png` · `05-sae-board.png`
empty Board, officer composer · `06-sae-events-room.png` Avery's test line · `07-sae-officers.png` ·
`08-sae-event-chat.png` Cookout event chat · `09-dm-james.png` · `10-dm-james-typed-not-sent.png` composer with
text, NOT sent · `11-chess-deeplink-as-franky-nonmember.png` falls back to the home ·
`12-`, `13-`, `14-`, `15-cards-lounge-*.png` poll, sign-up and event cards (blake in chat_seed_club) ·
`16-noor-home.png` a home with three club rows · `17-noor-chess-lounge.png` Chess Club Lounge as a member sees it
today · `18-noor-chess-board-member-view.png` the member's Board tile · `19-noor-blitz-event-chat.png` ·
`20-sae-plus-tray.png` the "+" tray (opened, nothing posted) · `21-dm-longpress-picker.png`.
JSON answers: `api-inbox.json`, `api-threads.json`, `api-calendar.json`, `api-features.json`, `api-space-sae.json`,
`api-room-sae-*.json`, `api-dm-james.json`, `api-space-chess-as-franky.json` (the 403), `api-space-chess-as-noor.json`,
`api-inbox-as-noor.json`, `api-space-chatseed-as-blake.json`, `api-room-chatseed-lounge-as-blake.json` (card shapes).
Also `functions.sql` (live bodies of the chat functions), `q.sh` (read-only psql), `walk-lib.mjs`, `walk1`–`walk5.mjs`.
The walks aborted every non-GET request to the app, so not even a read marker moved (the app tried
`POST /api/me/threads/<id>/read` and `/api/me/heartbeat`; both were blocked).

## 8. Not determined

- Section 3 was not executed (read-only): the row plan comes from the function bodies, constraints and the
  database's own `can_post_org_channel` answers, not from a trial write.
- A shared post WITH a picture inside a DM: read in code and the picture URL fetched; not seen on screen.
- Whether `PushAsk` shows after a send from inside the DM view on this server: reasoned from code and from `/get`
  showing no store link; `.env.local` was not read.
- How a Board post with two replies and a card on the Board look for Chess Club specifically: seen only in
  chat_seed_club's test data (cards in its Lounge), not on a Board.
- Light theme: every still is Night.

## 9. End-of-run check [ran]

Counts after my walks: 212 messages (newest 2026-10-02 14:02:27 UTC, a seed row), 17 poll votes, Franky in one club:
nothing was sent, voted or joined. The repo is clean (`git status`).
Two of Franky's read markers moved while I worked — SAE Lounge to 18:10:06 UTC and the James DM to 18:11:52 UTC.
My last walk as franky finished at 18:08:37 UTC and my browser contexts aborted every `POST …/read`, so those came
from another session opening the same rooms as franky (other agents of this run share the account). It changes
nothing on screen (both were already read), but it is the live proof of trap 13: anyone who opens a room as franky
moves his marker, so "N new" on a club row cannot be relied on unless the seed sets `last_read_at` right before a take.
