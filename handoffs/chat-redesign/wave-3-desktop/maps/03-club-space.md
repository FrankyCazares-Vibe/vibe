# Map 03: inside a club (rooms, thread, cards, composer, events)

Read on Sat Oct 3, 2026, branch `chat-desktop` (same as main). Read-only. Every path is from the repo root. `club/` means `src/components/mobile/messages/club/`, `cards/` and `compose/` the folders beside it.

## The five things the planner must know first

1. **Every club route the desktop needs is behind the PHONE's switch.** `GET /api/orgs/[slug]/space` (`src/app/api/orgs/[slug]/space/route.ts:101`), the card create route (`src/app/api/me/threads/[id]/cards/route.ts:73`) and the vote route (`.../cards/[messageId]/vote/route.ts:58`) answer 404 when `chatV2For(user)` is false. A person with the desktop switch on and `chat_v2` off gets "That's not there anymore." The thread read, send, remove, react, read and RSVP routes are not gated.
2. **Two phone sheets crash on desktop as written.** `CardSheet` and `RsvpSheet` are `Drawer.NestedRoot` (`compose/CardSheet.tsx:167`, `club/RsvpSheet.tsx:67`). vaul throws "Drawer.NestedRoot must be placed in another drawer" with no parent drawer (`node_modules/vaul/dist/index.mjs:1609-1613`). The Report sheet is mounted `variant="sheet" nested` in `club/RoomThread.tsx:418` and `club/BoardView.tsx:188`: same throw.
3. **"Who can see a room" exists. "Who can post in a room" does not.** See: `channels.is_private` plus the allow-list table `org_channel_members` (`supabase/migrations/20261001100000_chat_v2_rooms.sql:1319-1344`). Post: an extra room and the Officers room let in everyone who can see them (`:1389`). The contract must add the post rule (section 5, trap T1).
4. **Room management lives only in old Campus > Chat on desktop**, as three private functions inside `src/app/campus/campus-home.tsx` (create `:1444`, edit `:2060`, allow-list `:3582`). The phone has none. When Campus > Chat leaves the desktop, all three doors go.
5. **The club panel can be fed with no new route**: events and counts are already in the space answer; the three Board posts need one extra field (or one un-gated read that already exists); member faces come from the roster route that already exists. Details in section 1.10.

---

## 1. What exists

### 1.1 The club space shell (phone)

- **`ClubSpace`** `club/ClubSpace.tsx:170`. Props `ClubSpaceProps` (`:79-91`): `orgHandle: string`, `initialRoomId: string | null`, `initialRoomKind: RoomKind | null`, `initialPage?: ThreadMessagesResponse`, `onClose: () => void`.
  - A full-screen vaul drawer from the right (`:417-428`, `position: fixed; width: 100%`, z-index 1099/1100). Hides the phone tab bar (`useHideTabBar`, `:172`).
  - Reads the space on open, every 20 s while visible, and on return to visible (`:243-297`; `SPACE_REREAD_MS = 4000 * 5`, `:95`).
  - Picks the open room: the picked chip, else the Lounge, else the first non-event room (`:209-213`). Reads it through `useRoomPoll` (`:231-237`), paused while an event chat layer is open.
  - Draws, top to bottom (`:448-500`): `UpNext`, `RoomChips`, `BoardStrip` (every room but the Board, only when `board_latest` is not null: `:450-452`), then `BoardView` or `RoomThread`, then `RoomComposer`.
  - The event chat is a second full-screen layer on top (`EventChat`, `:504-518`).
  - History: about 150 lines of `pushState` / `replaceState` / `popstate` (`:113-150`, `:315-407`) for Back peeling one layer at a time. Phone-only logic.
  - A later 403 or 404 from the space read closes the whole view with a toast (`:256-278`).
- **`ClubHeader`** `club/ClubSpace.tsx:533`. NOT exported. Back button, 40px club mark, name, `Your hat: <role> · N members`, a link to `/orgs/<handle>` (`:582`). Height uses the phone safe area (`:554`).
- **`ClubBodySkeleton`** `club/ClubSpace.tsx:593`. Not exported.

### 1.2 Rooms and chips

- **`RoomChips`** `club/RoomChips.tsx:55`. Props (`:27-35`): `clubName`, `rooms: SpaceRoom[]`, `activeRoomId: string | null`, `night`, `now`, `onPick(room)`.
  - Draws every room the server sends, in the server's order. Lock icon on `officers` only (`:81`). Calendar icon on event rooms. Coral dot on the Board only (`:82`). No megaphone.
  - An event chip never shows as the selected chip (`:77`: `active = room.kind !== "event" && ...`).
  - The open room's chip never shows the unread dot (`:79`).
- **Server order of rooms**: lounge, board, officers, open event rooms by start, then extra rooms by position then name; closed event rooms get no chip (`src/lib/chat/reads.ts:200-219`).
- **`SpaceRoom`** `src/lib/chat/types.ts:415-422`: `{ id, kind, name, unread, can_post, event }`. No field says a room is private or who may post.
- **Room labels** `club/helpers.ts:78-91` (`chipLabel`): Lounge, Board, Officers, the event title, else the room's stored name as is. `chipAriaLabel` (`:94-105`): "Officers, only officers see this room"; nothing for an extra room.
- **Room names are slugs.** The create and rename routes accept only `^[a-z0-9][a-z0-9_-]{1,30}$` (`src/app/api/orgs/[slug]/channels/route.ts:11`, `.../channels/[channelId]/route.ts:9`). An extra room shows as `study-group` on its chip.

### 1.3 The Board

- **`BoardStrip`** `club/BoardStrip.tsx:25`. Props (`:16-23`): `latest: ChatMessage`, `unread`, `night`, `margin?`, `onOpen`. A 44px button: megaphone, "Board · author · text", dot, chevron. Already carries the megaphone path (`:54-58`).
- **`BoardView`** `club/BoardView.tsx:71`. Props (`:38-48`): `poll: RoomPoll`, `roomId`, `night`, `now`, `onOpenEventChat`, `scrollToken`, `paused?`. Posts newest first (`:125`). Owns the Remove confirm and the Report sheet for card posts (`:187-188`).
- **`BoardPost`** `club/BoardPost.tsx:117`. Props (`:47-68`). Byline (avatar, name, role word from `author_role`, time), the text or a card, the replies toggle, the folded replies (`GET .../messages?root=<postId>&limit=200`, `:140-141`), the reply field (`POST { content, thread_root_id }`, `:169-170`).
  - **A TEXT Board post has no Report and no Remove.** `onRemove` / `onReport` are handed only to `CardBubble` for a card post (`:213-235`); the text branch (`:238`) and the reply rows (`:275-280`) have no actions. This is the owed fix "17.2 L3" (`handoffs/chat-redesign/wave-2-contracts.md:1349`).

### 1.4 The thread

- **`RoomThread`** `club/RoomThread.tsx:207`. Props (`:53-70`): `poll: RoomPoll`, `roomId`, `roomKind`, `clubName`, `night`, `now`, `anchor: "bottom" | "top"`, `header?: ReactNode` (drawn inside the scroller), `onReply(target)`, `onOpenEventChat(roomId)`, `scrollToken`, `emptyBlock?`.
  - Fills its parent (`flexGrow: 1`, `:314`). No width of its own.
  - Per row it decides: Remove (`viewer.can_moderate`, not mine, `:349`), Report (not mine, `:350`), Reply (`viewer.can_post`, `:351`).
  - Text rows use `MessageBubble` (`:390-403`); cards use `CardBubble` (`:371-385`); my own removed message shows `RemovedContentCard` (`:360-367`); a blocked person's stub draws nothing (`:300`).
  - Owns the Remove confirm (`RemoveConfirm`, `:148`, a centred `alertdialog`, already fine on desktop) and the Report sheet (`:418`, phone bottom sheet).
- **`MessageBubble`** `src/components/mobile/messages/MessageBubble.tsx:12`. Shared with the phone's DM view (`ConversationView.tsx`).
  - Actions open from a 500 ms press (`:92-117`, pointer events, so a held mouse button works too) or from a "..." button that shows only on other people's messages (`:565-601`).
  - The picker's open state is private (`:75`). There is no prop to open it from outside.
  - Text bubble width: `maxWidth: "100%"` (`:254`). Photos, videos and shared-post cards cap at 260px (`:300`, `:328`, `:360`).
  - Text cannot be selected: `userSelect: "none"` (`:199-201`). Right-click is swallowed (`:145-149`).
- **`ReactionPicker`** `src/components/mobile/messages/ReactionPicker.tsx:36`. Props (`:45-58`): `darkMode`, `isMine`, `existing`, `onPick(emoji)`, `onReply?`, `onReport?`, `onRemove?`, `onClose`. Seven emojis (`:7`), then Reply, Report, Remove rows. Positioned above or below the bubble (`:67-81`). Closes on any press outside (`:91-107`).
- **`toggleReactionOn`** `club/reactions.ts:12`: optimistic count, then `POST` or `DELETE .../messages/<id>/react`.

### 1.5 Cards

- **`CardBubble`** `cards/CardBubble.tsx:150`. Props (`:40-75`): `message`, `roomId`, `room`, `viewerId`, `isMine`, `night`, `onCard`, `onRefresh`, `onOpenEventChat`, `onRemove?`, `onReport?`, `onToggleReaction?`, `onReply?`, `layout?: "bubble" | "post"`.
  - Fixed 292px wide in a room (`:305`), full width inside a Board post.
  - Its own 500 ms press opens the picker (`:180-197`). No "..." button. Picker state private (`:152`). `userSelect: "none"` (`:318-320`), right-click swallowed (`:219-222`).
- **`PollCardView`**, **`SignupCardView`**, **`EventCardView`** (`cards/*.tsx`): all inline, no sheet, no drawer (grep of `cards/` for `Drawer`: none). Votes go to `PUT .../cards/<id>/vote` (`cards/card-parts.tsx:18-26`). The Event card's Going / Maybe pills call `PUT | DELETE /api/events/<id>/rsvp` directly (`cards/EventCardView.tsx:68-75`); "Open event chat" calls `onOpenEventChat(room_id)` (`:172`).
- **`card-rules.ts`**: pure copy and number rules (`cards/card-rules.ts:14-285`), tested in `card-rules.test.ts`.

### 1.6 The composer, the "+" tray, the three sheets

- **`RoomComposer`** `club/RoomComposer.tsx:133`. Props (`:55-75`): `roomId`, `roomKind`, `roomName`, `clubName`, `orgHandle`, `orgId?`, `viewer: ViewerInRoom | null`, `viewerId`, `night`, `poll` (`append`, `replace`, `remove`, `reload`), `replyTo`, `onCancelReply`, `onSent?`, `officerLine?`, `focusToken?`.
  - A real `<form>`; Enter sends (`:297-301`). One-line `<input>` (`:323`).
  - While `viewer` is null it draws nothing (`:173`).
  - **When the viewer cannot post it shows one of exactly two lines** (`:174-179`): on the Board "Only officers post on the Board. You can reply to any post."; everywhere else "This chat is closed."
  - The officer's line on the Board, "Everyone in <club> sees this", with the megaphone (`:280-285`).
  - Mounts `CardTray` above the row (`:254-264`) and `ComposeSheets` (`:345-364`).
- **`ClosedTile`** `club/RoomComposer.tsx:104`: the quiet tile; exported; takes `text`, `night`, `board?`.
- **`CardTray`** `compose/CardTray.tsx:79`. Props (`:23-30`). In flow above the composer, with an absolute scrim over the room column (`:97-109`) and a tail pointing at the "+" (`:194-207`). Three rows: Poll, Sign-up, Event (`:47-51`). Not a vaul sheet.
- **`ComposeSheets`** `compose/ComposeSheets.tsx:41`: mounts one of `NewPollSheet`, `NewSignupSheet`, `ShareEventSheet` by `kind`.
- **`CardSheet`** `compose/CardSheet.tsx:145`: the shared chrome of the three (vaul bottom sheet, title, room line, close, CTA). Also exports the field parts (`fieldStyle :277`, `FieldLabel :296`, `Counter :311`, `AddButton :321`, `RemoveButton :344`, `Switch :359`) and `useCardPost` (`:62`), the one `POST .../cards` with its refusal table.
- **`ShareEventSheet`** reads its list from `GET /api/orgs/<handle>/space?events=1` (`compose/ShareEventSheet.tsx:66`).
- **`sheet-rules.ts`**: pure limits and labels (`compose/sheet-rules.ts:12-127`), tested.

### 1.7 Events

- **`UpNext`** `club/UpNext.tsx:52`. Props (`:35-42`): `clubName`, `events: EventRef[]`, `night`, `now`, `officerEmpty`, `onOpenEvent(roomId)`. Shows `events.slice(0, 2)` in a two-column grid of 50px cards (`:93`, `:103`). Phone-tuned type sizes (`:112`). A bloom positioned for a 375px screen (`:100`).
- **`EventChat`** `club/EventChat.tsx:82`. Props (`:48-58`). A second full-screen vaul drawer (`:113-124`). Reads the room through `useRoomPoll` (`:86`). Closes itself with "You left the event chat." when a later read answers 403/404 (`:101-106`). Passes `EventAbout` and the Board strip to `RoomThread` as `header` (`:165-170`).
- **`EventAbout`** `club/EventAbout.tsx:88`. Props (`:26-31`): `event: EventRef & { going: Person[] }`, `night`, `now`, `onRsvp`. Hero with the state pill, Where and When tiles, up to five faces, "N going · M maybe", the RSVP pill.
- **`RsvpSheet`** `club/RsvpSheet.tsx:46`. Props (`:30-36`): `eventId`, `current`, `night`, `onClose`, `onChanged`. Three rows: Going, Maybe, Not going. `PUT | DELETE /api/events/<id>/rsvp` (`:55-59`).
- **`ClubEmpty`** `club/ClubEmpty.tsx`: the officer's brand-new-club block (three steps).

### 1.8 The 4-second reader and the pure rules

- **`useRoomPoll(roomId, { enabled, initialPage?, line? })`** `src/lib/chat/use-room-poll.ts:208`. Returns `RoomPoll` (`:102-140`): `messages` (oldest first), `room`, `viewer`, `viewerId`, `failure`, `hasEarlier`, `lostAccess`, and `loadEarlier`, `refreshOne`, `append`, `replace`, `remove`, `replaceCard`, `reload`.
  - First read `?limit=50`; every 4 s `?after=<frontier>&limit=200`; every 5th tick and on return to visible a full read (`:346-409`). Pauses while the page is hidden.
  - **It marks the room read**: on mount (`:375`), after reads that bring rows by others, and on the way out (`:416-419`). `POST /api/me/threads/<id>/read` (`:238-246`).
  - No width, no touch, no history code. Device-neutral.
- **`room-rules.ts`** `src/lib/chat/room-rules.ts`: `BOARD_POSTER_ROLES` = owner, admin (`:21`); `ROOM_MODERATOR_ROLES` = owner, admin, mod (`:24`); `canModerate` (`:47`); `outranks` (`:67`); `clubRoomLabel` (`:83`); `postRefusal` (`:112`), which picks the words for a refused send.
- **`room-state.ts`**: `roomState(starts, ends, now)` → soon / live / after / closed; closed 7 days after the end.
- **`reads.ts`**: `spaceCanPost(kind, role, state)` (`:175-179`): Board by role, event by state, **every other kind `true`**. `orderSpaceRooms` (`:200`). `lastShown` (`:226`).
- **`message-read.ts`**: Board replies are left out of a room read unless `?root=` asks (`:854-855`). `describeRoom` / `viewerInRoom` (`:1151`, `:1177`) build `viewer`: `can_post` is the database's own answer, `can_reply` is true only on a Board, `can_moderate` from the role. An event room's `room.event` carries where, when, counts, my RSVP and the first 8 people going (`:274`, `:1047-1125`).
- **`helpers.ts`** `club/helpers.ts`: every label of the club screens, pure, tested (`helpers.test.ts`): `roleWord :17`, `isOfficer :33`, `hatLine :43`, `chipLabel :78`, `chipAriaLabel :94`, `upNextLine :149`, `rsvpPill :252`, `composerPlaceholder :259`, `emptyLine :279`, `boardStripLabel :286`, `postAriaLabel :222`, `statePillText :228`.

### 1.9 The routes, with their gates and shapes

| Route | Gate | What it sends | Evidence |
|---|---|---|---|
| `GET /api/orgs/[slug]/space` (+ `?events=1`) | signed in, **`chat_v2`**, club member | `SpaceResponse`: `org` (+ `member_count`), `viewer { role, can_moderate }`, `rooms`, `board_latest`, `up_next` (max 3), `upcoming?` | `space/route.ts:92-271`, `types.ts:425-443` |
| `GET /api/me/threads/[id]/messages` (`?limit`, `?before`, `?after`, `?root`) | signed in, may see the room. **Not flag-gated.** Does not mark read. | `ThreadMessagesResponse`: `messages`, `viewer_id`, `room`, `viewer { role, can_post, can_reply, can_moderate }` | `messages/route.ts:90-175`, `types.ts:342-355` |
| `POST /api/me/threads/[id]/messages` | signed in, rate limit 60/min, Terms + not restricted + verified, word filter, then the database's `can_post_org_channel` | `{ message }`; refusals `board_officers_only` 403, `room_closed` 403, `board_post_missing` 409, `thread_root_not_allowed` 400 | `messages/route.ts:248-620`, `:65-70` |
| `POST /api/me/threads/[id]/cards` | signed in, **`chat_v2`**, rate limit, can publish | 201 `{ ok, message }` | `cards/route.ts:59-207` |
| `PUT /api/me/threads/[id]/cards/[messageId]/vote` | signed in, **`chat_v2`**, 120 per 10 min, not restricted | `{ ok, card }` | `vote/route.ts:45-158` |
| `DELETE /api/me/threads/[id]/messages/[messageId]` | the sender (hard delete) or a club owner / admin / mod who is not outranked (marked removed). Not flag-gated. | `{ ok }` or `{ ok, removed: true }`; `not_allowed` 403, `report_open` 409 | `messages/[messageId]/route.ts:31-241` |
| `POST / DELETE .../messages/[messageId]/react` | signed in; the database lets anyone who can see the room react | `{ ok }` | `react/route.ts`, `20260508160000_message_reactions_org_channels.sql:31-48` |
| `POST /api/me/threads/[id]/read` | signed in | `{ ok }`; updates my row if I have one, else matches nothing | `read/route.ts:8-30` |
| `PUT / DELETE /api/events/[id]/rsvp` | signed in; home campus rule | `{ ok }`; `campus_visiting` 403 | `events/[id]/rsvp/route.ts:130-225` |
| `GET /api/orgs/[slug]/members` | signed in, club member. Not flag-gated. | the whole roster, officers first: `{ user_id, role, joined_at, name, handle, avatar_url, school_verified }` | `members/route.ts:42-123` |
| `GET / POST /api/orgs/[slug]/channels` | member to list; owner / admin to create | list leaves event rooms out (`:105`); create makes `kind: "room"` with `name`, `topic`, `is_private`, `position` | `channels/route.ts:41-254` |
| `PATCH / DELETE /api/orgs/[slug]/channels/[channelId]` | owner / admin | rename, topic, privacy, position, pinned; core rooms and event rooms locked (`room_locked` 409) | `channels/[channelId]/route.ts:70-234` |
| `GET / POST .../channels/[channelId]/members`, `DELETE .../members/[userId]` | owner / admin | the allow-list of a private room; refused on Board, Lounge, event rooms | `channels/[channelId]/members/route.ts:48-201` |

Reports go through `ReportSheet` (`src/components/safety/ReportSheet.tsx:390`), which already has a desktop form: `variant="modal"` (`:386-399`, `:461`).

### 1.10 The club panel: where each piece comes from

| The panel needs | Already sent by | Missing |
|---|---|---|
| The club's next two events, my RSVP, the going count | `space.up_next` (max 3, soonest first). Each is an `EventRef` with `viewer_status`, `going_count`, `maybe_count`, `state`, `room_id`, `location`, `starts_at` (`types.ts:41-53`, `space/route.ts:187`, `:267`) | Nothing. |
| The latest three Board posts with author, role, time, reply count | Only ONE post: `space.board_latest` (a full `ChatMessage` with `users`, `author_role`, `created_at`, `reply_count`; `space/route.ts:200-234`). The route already reads the last 6 Board posts and throws 5 away (`:218-221`, `:233`). | Either one more field on the space answer (say `board_recent: ChatMessage[]`, the last three shown, sent only with `?panel=1` the way `upcoming` is sent only with `?events=1`, `:178`, `:269`), or a plain `GET /api/me/threads/<boardId>/messages?limit=6` from the panel (exists, un-gated, does not mark read). No new route either way. |
| Whether the Board has something unread | `space.rooms[board].unread` (`space/route.ts:209-215`) | Nothing. Per-post unread is not sent; the dot goes on the newest post when the Board is unread. |
| Five member faces | `GET /api/orgs/[slug]/members` (whole roster, officers first; take five) | Nothing, but it is the full roster for five faces. Alternative: a `faces: Person[]` field on the same `?panel=1` answer. |
| The member count | `space.org.member_count` (`space/route.ts:150`, `:163`) | Nothing. |
| Whether I am an officer | `space.viewer.role` and `space.viewer.can_moderate` (`:264`); `isOfficer(role)` in `club/helpers.ts:33` | Nothing. |
| An event chat's Where / When / Who's going / my RSVP | the event room's thread read: `room.event` (`types.ts:322-328`) | Nothing. `EventAbout` draws exactly this. |
| "See all" (members) | The approved board's label is "See all 48 members on Salsa Club's page" → `/orgs/<handle>` | That page shows only a count (`src/app/orgs/[handle]/page.tsx:1085`). The only roster screen is the old settings modal's Members tab (`campus-home.tsx:1612`, `:2253`). |
| "Manage club" | `OrgSettingsModal`, mounted only at `src/app/campus/campus-home.tsx:1049-1063`, opened only by the Campus > Chat rail (`:991`, `:15779`). The mount sits outside the tab switch (`:1034-1063`), so it can show over any Campus tab once `activeOrg` and `showSettings` are set. | A door. Smallest: `/campus?tab=orgs&org=<handle>&manage=1` sets the active club by handle (the existing `?org=` reader, `:494-499`, `:672-680`) and `setShowSettings(true)`. About ten lines in one file. |

Seeing a Board post in the panel does not mark it read as long as the panel never mounts `useRoomPoll` on the Board (the hook marks on mount, `use-room-poll.ts:375`). The space read and a plain thread GET never mark.

### 1.11 Rooms: the data model, the rules, the screens (point 11)

**What a room is.** A `channels` row with `type = 'org_channel'`, `org_id`, `kind` in board / lounge / officers / event / room (`20261001100000_chat_v2_rooms.sql:709`, `:828`), `name`, `topic`, `is_private`, `position`, `pinned`. Officers and event rooms are always private (`:838`). One Board, one Lounge, one Officers room per club (`:719`).

**Who can SEE a room** (`can_view_org_channel`, `:1319-1344`): never a non-member; an event room → owner / admin or someone holding a row on it (the Going / Maybe people); a public room → every member; a private room (Officers or an extra room) → owner / admin, plus anyone on the allow-list `org_channel_members` (`20260507130000_org_channel_pinning_and_access.sql:24-30`). A mod sees Officers only if listed. A demoted officer who is on the list keeps Officers (`20261001100000_chat_v2_rooms.sql:62-64`).

**Who can POST** (`can_post_org_channel`, `:1362-1394`): must be able to see it; Board top-level → owner / admin; Board reply → any member under a live post; event → until 7 days after the end; **Lounge, Officers, extra rooms → everyone who can see them** (`:1389`). The insert policy on `messages` calls it (`:1409-1418`); so do the card functions (`20261001110000_chat_v2_cards.sql:737`, `:806`) and the vote function (`:867-870`).

**Who can post, as the screens learn it.** The thread read's `viewer.can_post` is the database's answer (`message-read.ts:1139-1183`). The space answer's per-room `can_post` is a TypeScript rule that says `true` for every extra room (`reads.ts:175-179`), and so does the thread list (`src/app/api/me/threads/route.ts:817`).

**Membership rows.** Public rooms give every member a `channel_members` row (triggers, `:932-939`, `:989-997`). Officers and private rooms give NO row (`:940`, `:956`). So for those rooms: `unread` is always false (`space/route.ts:213`), mark-read matches nothing (`read/route.ts:19-23`), they never appear in `/api/me/threads` or `/api/me/inbox` (both start from my rows), and no chip dot (`RoomChips.tsx:19-20`).

**Screens that manage rooms today.**
- Create: `CreateChannelModal` `campus-home.tsx:1444-1564` (name, topic, Public / Private "Owner / admin only"). Opened only from the Campus rail's "+" (`:990`, `:15761`).
- Rename, topic, privacy, delete: `ChannelEditorRow` `:2060` inside the settings modal's "Channels" tab (`:1611`, `:2016`).
- Per room: `ChannelSettingsModal` `:3223` with Overview, Access (`ChannelAccess` `:3582`: the allow-list, add by handle, remove) and Danger. Opened only from the rail's gear (`:992`, `:15722`).
- All are private functions of a 17,286-line file, drawn in the old dark-glass style with the old words ("channel", "#", "Text channels").
- Phone: none. `CampusMobile.tsx:2560` only lists rooms. The club page lists rooms and links to old Campus > Chat (`src/app/orgs/[handle]/ChannelsSection.tsx:314`).

**What is missing for point 11.**
1. A "who can post" rule for an extra room. Not in the table, not in the function, not in any route.
2. `is_private` (and the post rule) on `SpaceRoom`, so a chip can carry the lock.
3. The composer's line for "you can read but not post" in an extra room (today it would say "This chat is closed.", `RoomComposer.tsx:178`).
4. A lock on restricted extra-room chips and a megaphone on the Board chip (`RoomChips.tsx:81`).
5. A desktop door to create a room and to set who sees it and who posts (the three old doors leave with Campus > Chat).
6. A name a person would write. Names are slugs.

---

## 2. Reusable on desktop AS IS (no edit)

**Pure rules (no React, no DOM, all tested).** Safe because they only turn data into words and numbers.
- `club/helpers.ts`, `cards/card-rules.ts`, `compose/sheet-rules.ts`, `club/reactions.ts`.
- `src/lib/chat/room-rules.ts`, `room-state.ts`, `reads.ts`, `when.ts`, `page-merge.ts`, `types.ts`.
- `src/components/mobile/messages/v2-tokens.ts` (`palette(night)`, `SERIF`, `FONT`), `theme.ts` (`useNightTheme`, reads `data-theme` on `<html>`, `:22-28`), `avatar.ts` (`clubGradient`, `personColor`), `format.ts` (`initialsOf`, `quotedBody`).

**The reader.** `useRoomPoll` (`src/lib/chat/use-room-poll.ts:208`). No touch, width or history code. It also marks the open room read, which the old desktop club chat never did (audit M5). One instance per open room, as on the phone.

**The routes.** All of section 1.9, unchanged. None checks the device.

**Components that work at any width with a mouse, untouched.**
- `BoardStrip` (`club/BoardStrip.tsx:25`): a button that fills its row. Use it when the panel is hidden.
- `PollCardView`, `SignupCardView`, `EventCardView`, `card-parts.tsx`: inline buttons, fixed 292px card. The design keeps cards phone-size.
- `EventAbout` (`club/EventAbout.tsx:88`): fits a 300px panel as it is (hero, two tiles, faces, RSVP pill). It only needs `onRsvp`.
- `CardTray` (`compose/CardTray.tsx:79`): already a popover in flow above the "+", with its tail. It needs its parent to be `position: relative` (`RoomComposer.tsx:46-47` says so). On desktop it will be as wide as the thread pane minus 24px; cap its width in the desktop wrapper if that looks wrong.
- `RemoveConfirm` (`club/RoomThread.tsx:148`): a centred `alertdialog` over a fixed scrim, Escape and Tab handled. Already a desktop dialog.
- `ClosedTile`, `ThreadSkeleton`, `ClubEmpty` (exported, no phone layout).
- `useCardPost` (`compose/CardSheet.tsx:62`) and the field parts (`:277-400`): the whole post-a-card logic and its inputs, free of vaul.
- `ReportSheet variant="modal"` (`src/components/safety/ReportSheet.tsx:461`): the desktop report dialog exists.

**Harmless phone leftovers** inside reused pieces: `env(safe-area-inset-*)` paddings resolve to 0 on a laptop (`RoomComposer.tsx:107`, `:271`); `useHideTabBar` only adds a body class that hides `.vibe-mobile-tabbar` (`src/lib/chat/use-hide-tabbar.ts:21-35`, `src/app/globals.css:2878`).

---

## 3. Phone-shaped: what needs a wrapper or a desktop twin

One idea carries most of this section. **A tiny "which surface am I on" context** (new file, default `"phone"`), provided only by the desktop Messages page. The phone tree never provides it, so every phone screen reads the default and behaves exactly as today. The pieces below read it where they must differ. The alternative is an optional prop drilled through `RoomComposer` → `ComposeSheets` → three sheets → `CardSheet` (six files). The context touches fewer lines.

| # | Piece | Why it is phone-shaped | Smallest way |
|---|---|---|---|
| 1 | `ClubSpace` (`club/ClubSpace.tsx:170`) | Full-screen drawer, Back-button history, event chat as a stacked layer, `UpNext` on top | A desktop twin (new file, say `ClubPane`). It repeats three small things from `ClubSpace`: the space read (`:243-297`), the open-room pick (`:209-216`), the "later 403 / 404 → leave" rule (`:256-278`). It mounts `RoomChips`, `BoardStrip` (panel hidden only), `BoardView` / `RoomThread`, `RoomComposer` as they are. Do NOT refactor `ClubSpace` to share code: the phone walked it on Oct 1-2. |
| 2 | `ClubHeader` (`club/ClubSpace.tsx:533`) | Not exported; has Back and the safe-area height | A desktop header in the twin: mark, name, `Your hat: <role>`, page link. Reuse `roleWord`, `countWord`, `clubGradient`, `initialsOf`. |
| 3 | `EventChat` (`club/EventChat.tsx:82`) | A second full-screen drawer | A desktop `EventPane`: the same `useRoomPoll(roomId, { enabled: true, line })`, `RoomThread` with NO `header`, `RoomComposer` with `roomKind="event"`, and `poll.room.event` handed to the right panel for `EventAbout`. Keep the `lostAccess` rule (`:101-106`): toast, then fall back to the club's Lounge. |
| 4 | `CardSheet` (`compose/CardSheet.tsx:167`) | `Drawer.NestedRoot`: throws without a parent drawer; bottom sheet | Inside `CardSheet` only: on desktop render the same header, children and CTA inside a centred dialog (about 440px, Escape closes, focus trapped, scrim). The three sheets (`NewPollSheet`, `NewSignupSheet`, `ShareEventSheet`) then need no edit. Keep "no close while posting" (`:150-154`). |
| 5 | `RsvpSheet` (`club/RsvpSheet.tsx:67`) | `Drawer.NestedRoot`; bottom sheet | Same switch inside the file: a small dialog or a popover with the same three rows. |
| 6 | The Report sheet in `RoomThread.tsx:418` and `BoardView.tsx:188` | Hard-coded `variant="sheet" nested` → throws on desktop | One line each: `variant="modal"` (and no `nested`) on desktop. |
| 7 | Long-press actions: `MessageBubble.tsx:75-158`, `CardBubble.tsx:152-231` | Picker state is private; no prop opens it; cards have no "..." | A desktop-only hover toolbar drawn by `RoomThread` around each row. `RoomThread` already holds every handler per row (`:345-358`: `toggleReaction`, `onReply(replyTargetOf(...))`, `report`, `remove`). The toolbar: React (the seven emojis), Reply, "..." → Report, Remove. Neither bubble's press code changes. On desktop also drop `MessageBubble`'s own "..." (`:565-601`) so there are not two. |
| 8 | Text Board posts and Board replies (`BoardPost.tsx:238`, `:275-280`) | No Report, no Remove at all (owed fix L3) | Do L3 in this build with a visible control: a "..." on the post's byline and on each reply row (phone and desktop), and the hover toolbar on desktop. `BoardView` already owns the confirm and the report (`:99-114`, `:187-188`) and already passes `onRemove` / `onReport` (`:164-169`). |
| 9 | `RoomChips` (`club/RoomChips.tsx:55`) | An event chip is never drawn selected (`:77`); lock only on Officers (`:81`); no megaphone; scrolls sideways with the scrollbar hidden (`:70-72`) | Small edits: selected event chip on desktop; lock when the room is private; megaphone on the Board chip; on desktop let the chips wrap or add a "More" control, since a mouse has no way to scroll a hidden-scrollbar row. |
| 10 | `RoomComposer` (`club/RoomComposer.tsx:174-179`) | Only two "you cannot post" lines | A third line for a room where only some people post (needs the room's post rule from the thread read or the space answer). |
| 11 | `MessageBubble` text width (`:254`) | `maxWidth: "100%"`: a long message runs the whole pane | A cap on desktop. The approved board uses 520px (`handoffs/chat-redesign/boards/D3_Tuck.dc.html`, `max-width: 520px`, 14 times). |
| 12 | Text selection (`MessageBubble.tsx:199-201`, `:145-149`; `CardBubble.tsx:318-320`, `:219-222`) | `userSelect: none` and right-click swallowed, made for a thumb | On desktop: allow selection and the browser's menu. |
| 13 | `UpNext` (`club/UpNext.tsx:52`) | Phone block above the chips, 50px cards, 375px bloom | Not used on desktop. The panel draws "first event as a card with RSVP, then one row" from the same `space.up_next`, reusing `upNextLine`, `rsvpWord`, `upNextAriaLabel`, `isHot` (`club/helpers.ts:56`, `:144-165`). |
| 14 | `ClubSpace` history (`:113-150`, `:315-407`) | Layers and depths | Not reused. Desktop writes `?channel=<roomId>` when a room is picked. See trap T6. |

**New desktop pieces with no phone twin:** the club panel (events, Announcements, faces, Manage club), the event panel (wraps `EventAbout`), the hover toolbar, the rooms dialog (section 6, Q5).

---

## 4. Contracts the desktop build must not break

**Types** (`src/lib/chat/types.ts`). Additive, optional fields only. The old desktop screens and the two static pages read the thread answer too (`:330-341`).
- `SpaceRoom` (`:415-422`), `SpaceResponse` (`:425-443`), `ThreadMessagesResponse` (`:342-355`), `ViewerInRoom` (`:64-73`), `EventRef` (`:41-53`), `ChatMessage` (`:278-319`).
- `RefusalCode` and `REFUSAL_SENTENCES` (`:83-144`): one code, one sentence, "word for word". A new code for the post rule must be added in five places together: `RefusalCode`, `REFUSAL_SENTENCES`, `PostRefusalCode` + `postRefusal` (`room-rules.ts:112-126`), `POST_REFUSAL_STATUS` (`messages/route.ts:65-70`), and the two screens that match on codes (`RoomComposer.tsx:226`, `CardSheet.tsx:104-110`).

**Tests that pin behaviour** (`npm test` = `node --test` over `src/**/*.test.ts`, `package.json:11`).
- `src/lib/chat/reads-routes.test.ts:674`: a space room has EXACTLY the keys `can_post, event, id, kind, name, unread`. Any new room field changes this line.
- `reads-routes.test.ts:685`: the space route's channels select is EXACTLY `"id, kind, name, event_id, position"`.
- `reads-routes.test.ts:677-678`: no `upcoming` key without `?events=1`; the Board read is called with exactly `{ limit: 6 }`.
- `reads-routes.test.ts:629`: the space answers 404 with the flag off.
- `src/lib/chat/reads.test.ts:151-158`: `spaceCanPost` → "others always".
- `club/helpers.test.ts:76-99`, `:159-163`: chip labels and composer placeholders, including `chipAriaLabel` of an extra room = `null` (`:98`).
- `src/lib/chat/use-room-poll.test.ts:34-107`: reads the hook's SOURCE TEXT with regular expressions. Any edit to `use-room-poll.ts` can fail it. Do not edit the hook.
- Also: `cards/card-rules.test.ts`, `compose/sheet-rules.test.ts`, `room-rules.test.ts`, `room-state.test.ts`, `remove-route.test.ts`, `message-read.test.ts`, `layer-stack.test.ts`, `flag.test.ts`.

**Flag rules.**
- A gated route answers 404 `not_found` when the flag is off, before any read (`src/lib/chat/flag-server.ts:22-23`, `space/route.ts:101-103`).
- With every switch off nothing may change for anyone: the freeze list (`handoffs/chat-redesign/wave-2-contracts.md:1357-1375`). The `club/`, `cards/`, `compose/` files are mounted only when `chat_v2` is on (`src/components/mobile/MessagesMobile.tsx:538`), so an edit there cannot reach a flag-off person. `MessageBubble` and `ReactionPicker` are ALSO used by the old phone DM view (`ConversationView.tsx`): an edit there reaches everyone.

**Database rules.**
- "The database is the wall" (`room-rules.ts:9-11`): screens never decide who may post.
- Function fingerprints after migration A: `can_view_org_channel` = `747ee06d2e4c3e8a788129f7530ec0ae`, `can_post_org_channel` = `8d8be860d3f7077b9d6f9238705bdca7` (`20261001100000_chat_v2_rooms.sql:72-75`; checked again by `20261001110000_chat_v2_cards.sql:380-392`, `:1125`). "The next file that restates one writes its PRE-FLIGHT against them."
- Grants: restated to anon, authenticated, service_role; nothing revoked (`20261001100000_chat_v2_rooms.sql:1348`, `:1399`). The refusal lives inside the function (`:1326-1328`, `:1372-1374`).
- The old screens send no `kind` and no new column on create; a trigger fills `kind` (`:862-902`). A new column needs a default that means "as today".

**Copy.** The strings of contract section 1.2 live in `helpers.ts`, `card-rules.ts`, `sheet-rules.ts`. Product words (1.1): Board, Lounge, Officers, "event chat", "Your hat"; never "channel", "#", "Pinned" for the Board strip ("Latest", `BoardStrip.tsx:14`). Point 10 now uses "Pinned" for DM pins; keep it off the Board.

---

## 5. Traps

**T1. The post rule is not one change. It is five.** Adding "who can post" to an extra room touches:
1. the column or table itself (a new field on `channels`, default = everyone who can see the room);
2. `can_post_org_channel` (`20261001100000_chat_v2_rooms.sql:1362-1394`): the `'room'` arm at `:1389`. The insert policy and both card-create functions follow it with no edit (`:1409-1418`; `20261001110000_chat_v2_cards.sql:737`, `:806`);
3. **the vote function.** `chat_cast_vote` refuses a vote from anyone who cannot post in a non-Board room and reports it as "closed" (`20261001110000_chat_v2_cards.sql:867-870` → `poll_closed`, `cards/_lib/rpc-refusal.ts:75-76`). In an "officers post, members read" room a member could not vote on a poll or take a sign-up spot, and would read "This one is closed." Only the Board is exempt today;
4. the two TypeScript answers that say an extra room is always postable: `spaceCanPost` (`reads.ts:175-179`) and the thread list (`threads/route.ts:817`). The thread read's `viewer.can_post` follows the database on its own;
5. the words: `postRefusal` falls through to `room_closed` = "This chat is closed." (`room-rules.ts:125`), and the composer shows the same sentence (`RoomComposer.tsx:178`).

**T2. Private rooms and the Officers room have no membership row.** So: no unread dot, ever; mark-read does nothing; they are in neither the inbox nor the thread list (section 1.11). The desktop's slim list ("pinned and unread chats") and any "unread" mark on a restricted room's chip cannot work for them without new rows. Do not promise a dot on a locked chip in this build.

**T3. The phone's flag gates the desktop's data.** `space`, `cards`, `vote` answer 404 without `chat_v2` (section 1.9). `ShareEventSheet` reads `space?events=1` (`compose/ShareEventSheet.tsx:66`). Either the desktop switch implies `chat_v2`, or three gates change. Section 6, Q1.

**T4. vaul sheets throw outside a drawer.** `CardSheet`, `RsvpSheet`, and the Report sheet as mounted in `RoomThread` / `BoardView` (section 3, rows 4 to 6). The first click on Poll, RSVP or Report would crash the pane. A desktop walk must click all three.

**T5. `useRoomPoll` marks read on mount** (`use-room-poll.ts:375`). If the panel mounts it on the Board to get three posts, every club open marks the Board read and the coral dot never shows. Feed the panel from the space answer or a plain GET.

**T6. Sheets and the tray write browser history.** `useLayerHistory` pushes an entry when the "+" tray, a card sheet, the RSVP sheet, the Remove confirm or the Report sheet opens (`RoomComposer.tsx:171`, `CardSheet.tsx:154`, `RsvpSheet.tsx:48`, `RoomThread.tsx:152`, `:217`, `BoardView.tsx:80`) and steps back when it closes (`src/lib/chat/use-layer-history.ts:17-45`). It works without the phone shell (one module-level stack, `:50-80`). But any desktop code that listens to `popstate` or writes `?channel=` must do what the phone shell does: ignore a pop that `isLayerPop(e)` claims (`:92-94`) and wrap its own history writes in `clearLayersThen` (`:97-101`). Otherwise Back closes a dialog AND switches the chat, or a stale entry eats the next Back.

**T7. The space read is 20 s behind the thread.** `RoomChips` hides the dot on the open room for that reason (`RoomChips.tsx:22-25`, `:79`). The panel's "Announcements" list will also lag a new Board post by up to 20 s, and its dot stays up to 20 s after the Board is opened. Re-read the space right after the Board room is opened or left.

**T8. `MessageBubble` and `ReactionPicker` are shared with the old phone DM screen.** `club/`, `cards/`, `compose/` are flag-on only, but these two are not (`ConversationView.tsx` imports both). An edit that is not strictly "desktop only, default unchanged" changes the phone for people with every switch off, which the freeze forbids. Point 10's Pin row in the long-press sheet lands in `ReactionPicker`: it must be an optional prop that only the new chat passes.

**T9. A held mouse button already opens the phone picker.** The press code listens to pointer events with `button === 0` (`MessageBubble.tsx:132-140`, `CardBubble.tsx:206-214`). With a hover toolbar on top, a slow click or a text-selection drag on a bubble opens the phone picker too. On desktop the press must not arm.

**T10. The chips row cannot be scrolled with a mouse.** `overflowX: auto` with `scrollbarWidth: "none"` (`RoomChips.tsx:70-72`). Point 11 wants EVERY room shown; a club with eight rooms hides some behind an edge nobody can reach with a wheel.

**T11. A megaphone on the phone's Board chip breaks a measured fit.** The chips were cut by one pixel each so Lounge · Board · Officers · one event fit at 375px (`RoomChips.tsx:13-15`). An icon on Board adds about 17px. Put the megaphone on the desktop chip only, or accept that the fourth chip scrolls on the phone.

**T12. Room names are slugs** (`channels/route.ts:11`). "Exec only" is not a valid name; `exec-only` is. A chip reads `exec-only`. The composer reads "Message exec-only" (`helpers.ts:269`). The rooms dialog must either keep the slug rule and say so, or the route's rule changes (it is also the old desktop's rule, `campus-home.tsx:1496`, `:1506`).

**T13. Turning a room private wipes everyone's rows, and turning it public adds everyone.** The trigger does it in the same statement (`20261001100000_chat_v2_rooms.sql:942-957`). A person on the allow-list of a private room still has no row. A dialog that flips "who can see it" should say what happens.

**T14. A closed event room has no chip but opens by link** (`reads.ts:201`). The desktop event pane must work with no chip to select, and show the closed line.

**T15. The roster route sends everyone, unfiltered.** `GET /api/orgs/[slug]/members` returns the whole club with no limit and no block filter (`members/route.ts:85-123`). Fine for five faces at today's club sizes; a blocked person can be one of the five faces (the club page shows the same roster today).

**T16. `EventAbout`'s RSVP pill and the Event card's pills are two paths to one RSVP.** The pill opens `RsvpSheet` then calls `poll.reload()` (`EventChat.tsx:193`); the card writes directly then `refreshOne` (`EventCardView.tsx:68-80`). The panel's event card must refresh BOTH the space answer (`up_next[].viewer_status`, `going_count`) and the open room after an RSVP, or the panel and the thread disagree for 20 s. A "Not going" on an event chat I am in removes me from it (`EventChat.tsx:100-106`).

**T17. "Manage club" is not officers-only today.** Every member can open the settings modal (Overview, Members, Danger; `campus-home.tsx:1609-1617`); mods get Requests (`:1599`, `:1615`). If the button shows for owner / admin only, a mod loses the door to join requests and a member loses the only roster screen.

**T18. Message pins must not reuse the word or the path of chat pins.** `POST /api/me/threads/[id]/pin` already exists and pins a CHAT in my list (`src/app/api/me/threads/[id]/pin/route.ts:8-12`); `channels.pinned` pins a ROOM in the old rail (`20260507130000_org_channel_pinning_and_access.sql:18`); `InboxClub.pinned_at` is the club pin (`types.ts:397`). The new message pins need their own route name and table name.

---

## 6. Open questions for the planner, each with a recommended answer

**Q1. Does the desktop switch need `chat_v2` to be on too?**
Recommend: **yes. The new desktop Messages shows only when both are on.** Then `space`, `cards` and `vote` keep their gates and their tests (`reads-routes.test.ts:629`) untouched, and the phone still never waits for desktop. On Oct 26 `chat_v2` is on for everyone, so from then the desktop switch alone decides. The other way (three gates read "phone flag OR desktop flag") edits three routes for a state that lasts three weeks.

**Q2. Where do the three Board posts in the panel come from?**
Recommend: **one optional field on the space answer, `board_recent: ChatMessage[]` (newest first, at most 3, never a stub, never my own removed post), sent only with `?panel=1`.** The route already reads the last six posts (`space/route.ts:218-229`) and keeps one. No new request, no new route, the phone's answer stays byte-identical, and the list refreshes with the 20 s space read. It never marks the Board read. Fallback with zero server change: the panel calls `GET /api/me/threads/<boardId>/messages?limit=6` itself (one more request per refresh).

**Q3. Where do the five faces come from?**
Recommend: **`GET /api/orgs/[slug]/members`, read once when a club opens (not on the 20 s tick), first five in the route's order (owner, officers, mods, members), count from `space.org.member_count`.** No server change. If clubs grow past a few hundred, move to a `faces` field on `?panel=1`.

**Q4. Where does "See all" (members) go?**
The approved board says "on Salsa Club's page", but `/orgs/<handle>` shows only a number (`page.tsx:1085`). Recommend: **a small members dialog inside Messages** (name, role word, link to the profile), fed by the roster already read for Q3. If the planner keeps the board's wording to the letter: link to `/orgs/<handle>` and note that the page lists nobody.

**Q5. Where do officers manage rooms on desktop?**
Recommend: **a new small "Rooms" dialog in the new Messages, for owner and admin**, opened from the panel beside "Manage club" (and from a "+" after the last chip). It lists the club's rooms with their marks. "New room": a name, "Who can see it" (Everyone in the club / Only officers and people I pick), "Who can post" (Everyone who can see it / Only officers). An existing extra room: the same two choices, the people list, Delete. The Officers room: the people list only. Board, Lounge and event chats: shown, locked, one line each saying why. It uses the routes that exist (`POST /channels`, `PATCH | DELETE /channels/[id]`, the allow-list routes), plus the one new field. Do NOT move the old modals out of `campus-home.tsx` (about 2,800 lines, old words, old style). Room management as far as today's model allows = everything above except "who can post", which needs the migration.

**Q6. What shape is the post rule?**
Recommend: **one column, two values.** `channels.posting text not null default 'everyone'`, allowed values `'everyone'` (everyone who can see the room: today's rule) and `'officers'` (owner and admin, the Board's own list, `room-rules.ts:21`), and a check that only `kind = 'room'` may hold `'officers'`. Same migration: restate `can_post_org_channel` (`'room'` arm) with a pre-flight on fingerprint `8d8be860d3f7077b9d6f9238705bdca7`, and restate `chat_cast_vote` (Q8). Say it plainly in the contract: "picked people may post, everyone reads" is NOT built. "Only picked people see and type" already exists (a private room with its list), and "exec only" already exists (the Officers room). A per-person posting list would need a second table, a second picker and a second policy read.

**Q7. How does a screen learn the rule, and what does it say?**
Recommend: `SpaceRoom` gains `is_private: boolean` and `posting`; `ThreadRoom` gains `posting`; `Room` (`types.ts:56-62`, read by `loadRoom`, `rooms.ts:130`) gains `posting` so `postRefusal` can pick the words. `spaceCanPost` and the thread list's rule take the new value. Reuse the existing code `board_officers_only` ("Only officers post here.", already generic, `types.ts:124`) for a refused send in such a room: no new code, and the composer already switches to the quiet tile on it (`RoomComposer.tsx:226`). Composer line for a member in such a room: "Only officers post here." with the lock. Update the three pinned test lines in section 4.

**Q8. Can a member vote on a poll in an "only officers post" room?**
Recommend: **yes.** Restate `chat_cast_vote` so its "cannot post → closed" test applies to event rooms only (`v_kind = 'event'` in place of `v_kind <> 'board'`, `20261001110000_chat_v2_cards.sql:868`). Same behaviour as today for every existing room (Lounge, Officers and extra rooms always pass the post test today), and polls stay usable where officers announce. Without it the rule quietly kills polls and sign-ups in those rooms.

**Q9. Which marks go on which chips, on which device?**
Recommend: the lock on every room with `is_private` (phone and desktop, new chat only), with the label "<name>, only some members see this room"; the megaphone on the Board chip on desktop only (trap T11). The panel section is titled "Announcements"; the chip stays "Board" (product word, contract 1.1). One line at the top of the Board room on desktop: "Announcements from <club>'s officers. Everyone in the club sees them." (copy for Franky).

**Q10. Report and Remove on a text Board post (the owed L3)?**
Recommend: **in this build**, as a visible "..." on the post and on each reply, phone and desktop. It is owed before Oct 26 (`wave-2-contracts.md:1349`), it lives in the same file the desktop hover toolbar needs (`BoardPost.tsx`), and without it an officer's text announcement cannot be reported from the new chat at all.

**Q11. "Manage club": which door, and who sees the button?**
Recommend: `/campus?tab=orgs&org=<handle>&manage=1` opens the existing settings modal over Campus > Orgs (about ten lines in `campus-home.tsx`, owned by the batch that owns that file). Show the button to owner, admin and mod (`space.viewer.can_moderate`): mods handle join requests there (`campus-home.tsx:1615`). Members get the members dialog (Q4) and the club-page link.

**Q12. How does an event chat open on desktop?**
Recommend: like any room. `onOpenEventChat(roomId)` and an event chip both select the room in the same pane, the address becomes `/messages?channel=<eventRoomId>`, the chip is drawn selected (one small change in `RoomChips.tsx:77`), the right panel switches to `EventAbout`. One `useRoomPoll` alive at a time. A closed event room opened by link shows its thread and the closed line with no chip (trap T14).

**Q13. What does the panel show while the Board itself is the open room?**
Recommend: events and members only; the "Announcements" section is not drawn. Otherwise the same three posts are on screen twice, which the design rules out for the strip.

**Q14. Room names: slugs or words?**
Recommend: keep the stored slug (the routes and the old desktop depend on it), let the Rooms dialog take a normal name and convert it ("Exec only" → `exec-only`), and show extra-room names through one pure helper that turns `-` and `_` into spaces and capitalises the first letter. `helpers.test.ts:98-99`, `:162` keep passing ("Alumni" stays "Alumni").

**Q15. Unread marks on the Officers room and on private rooms?**
Recommend: **none in this build**, written into the contract as a known limit (trap T2). They need membership rows for allow-listed people and officers, which is a larger database change than points 10 and 11 allow.

**Q16. The RSVP control on the panel's event card?**
Recommend: the "Going" / "Maybe" / "RSVP" pill opens the desktop form of `RsvpSheet` as a popover; on success re-read the space at once and reload the open room (trap T16).
