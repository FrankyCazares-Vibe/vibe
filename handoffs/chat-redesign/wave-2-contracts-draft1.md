# Club chat v1 — wave 2 contracts (S70, 2026-09-30) — DRAFT 1

**Status: DRAFT 1, written in a CLOUD session** (no database, no browser, no `.env.local`; repo HEAD `15a8286`, `main` = wave 1 live). Every fact about the code cites `path:line` from the five as-is maps in `wave-2-asis/` or from the code itself; nothing was run. Next: a plan critic, draft 2, a verification pass, then FINAL (the S69 pattern).

Inputs, in the order they win: `wave-0-decisions.md` (Franky's calls) → `wave-1-contracts.md` (FINAL for wave 1; sections 0, 1, 4, 5, 6.3, 7 and 14–16 define what wave 2 must build; 14–16 win over older text) → `2026-09-30-session-69-close-chat-wave-1-live.md` (carry-overs, START HERE, the cloud block) → `plan-critique.md` (#11 the split) → `wave-plan.md`. Facts: `wave-1-asis.md`, `wave-1-build/*.md`, and the five wave-2 maps: `wave-2-asis/messages-mobile-map.md` (MM), `routes-map.md` (RM), `database-map.md` (DM), `mockups-map.md` (MK), `build-notes-deltas.md` (BN). Mockups: `boards/W0_*.dc.html` (canvas row 7). Shapes: `src/lib/chat/types.ts` (TY).

Every batch reads this file first and may not change a name, column, route, payload field, error code or copy string in it. If a batch finds the contract wrong, it stops and says so; it does not improvise. The orchestrator's defaults D1–D11 are built as written unless a critic shows one is wrong; each stays in section 14 so Franky can overrule.

## 0. What wave 2 is, in what order, and what moved out

Wave 1 shipped the rooms and the Board rule for everyone (Sept 30, 00:13 UTC). Wave 2 ships **cards, the officer/mod remove, the three reads, and the phone's new chat screens behind `chat_v2`**, in the week of Oct 5; freeze Oct 15; the flag on for everyone Mon Oct 26.

**Wave 2, in this order (section 13 has the file ownership):**

1. **W2-S, the split** (ALONE, before any other batch): `src/components/mobile/MessagesMobile.tsx` (4,985 lines today, MM:1) is cut into `src/components/mobile/messages/*.tsx` with no behaviour change (plan-critique #11, D6). Proof: typecheck, tests, eslint, and `handoffs/chat-redesign/wave-2-build/tools/split-check.mjs` (already in the repo, commit `15a8286`).
2. **Backend, four batches side by side** (each owns its files, section 13): **W2-B1** migration B (SQL written in the cloud, rehearsed and applied on the Mac); **W2-B2** cards (`fallback`, `hydrate`, `snapshot`, the two card routes, the thread-read changes of section 9, the blocking stub of section 8, the sentences of section 1.3); **W2-B3** the officer/mod remove route + `RemovedContentCard` + the by-name allow-list guard (D8) + the old renderers skipping stubs; **W2-B4** `GET /api/me/inbox`, `GET /api/orgs/[slug]/space`, the three calendar fields.
3. **Screens, three batches side by side**, all behind the flag, phone only, 375px, Light and Night: **W2-S1** Messages home (All · Chats · Clubs · Requests, "Your week", the two home empty states, the flag fork in `MessagesMobile.tsx`, deep links, the `CampusMobile` changes of D5); **W2-S2** the club space (header, Up next, room chips, Board strip, the Board with folded replies, the Lounge / room thread, the event chat, the composer, the empty club, the polling hook); **W2-S3** the cards (poll, sign-up, event card), the "+" tray and its three sheets.
4. **Integration review** of the whole branch (flag off = nothing changes but section 8.6; flag on = this file), then the handoff for the Mac.

Every batch: implement → adversarial reviews → one repair → gates (section 13.3). The branch is `chat-v2-wave-2`; it is pushed and **never merged from the cloud** (CLOSE `:24`).

**What moved out of wave 2 (section 15 has the full list):** the month sheet and week swiping, non-member event rooms (the stretch goal, wave-1 contract 9), the custom-rooms UI and the 3-room cap, photos in club rooms, push, "seen by", Realtime, desktop, Headcount, the mention picker for the Officers room, blocking against a direct database read (D2, section 8.7), a separate code for a reserved room name (D8), notification rows for cards or Board posts.

**What everyone sees change after wave 2 with the flag OFF: nothing**, with ONE exception, written down in 8.6 and open point 14.12: a club-room message by someone in a block pair with the viewer stops showing in the old screens too (the thread GET sends it as a stub for everyone, and the four old renderers skip stubs). Reason: Apple's reviewer (submission Oct 16) is not on the allow-list and Block must hold wherever the reviewer looks. Everything else — cards, the new reads, the new screens, the Campus › Chat pill going, the `?tab=chat` redirect — is behind `chat_v2`. On a Vercel Preview the flag does nothing by design (`flag.ts:46-48`), so a Preview never shows any of it.

**What migration B changes for everyone (flag or no flag):** four new service-role-only tables, four functions and one trigger. No policy, grant, column or row of an existing table changes. Old code on the new database keeps working unchanged (DM:6.3): every client insert is still `kind = 'text'`, and `readChatMessages` already selects `kind, thread_root_id, card_event_id` (`message-read.ts:74-75`).

## 1. Names and copy (the only words allowed)

### 1.1 Product words

| thing | in the product | in code / DB |
|---|---|---|
| where officers post | the Board | `channels.kind = 'board'` |
| where members talk | the Lounge | `kind = 'lounge'` |
| officers' private room | Officers | `kind = 'officers'` |
| an event's chat | event chat / "Fall Formal" | `kind = 'event'`, `event_id` |
| an extra room | room | `kind = 'room'` |
| a reply under a Board post | reply | `messages.thread_root_id` |
| poll | Poll | `messages.kind = 'poll'`, `chat_polls.mode = 'poll'` |
| sign-up | Sign-up | `messages.kind = 'poll'`, `chat_polls.mode = 'signup'` |
| a shared event with Going / Maybe | Event, "Event card" in this file | `messages.kind = 'event_card'`, `messages.card_event_id`, `chat_event_cards` |
| a sign-up's option | slot; its capacity: spots | `chat_poll_options.capacity` |
| "Your hat" | the role: owner → Owner, admin → Officer, mod → Mod, member → Member | `org_members.role` |
| the picker under the composer's "+" | the tray | `CardTray` |
| a message hidden by a block | a stub (never shown, never named in copy) | `ChatMessage.hidden = true` |

Never in copy or new identifiers: channel, server, thread (user-facing), `#`, "pinned" for the Board strip (MK:15), Discord blurple. Existing identifiers (`channels`, `channel_members`, `/api/me/threads`, `?channel=`) keep their names.

### 1.2 Copy strings the screens show (exact; section 11 says where)

**Messages home (W0_Home, W0_EmptyWeek, W0_EmptyClubs)**
- Title `Messages`. Compose button `aria-label="New message"`. (No search button in v1: the mockup's magnifier has no endpoint behind it; open point 14.13.)
- Filters: `All`, `Chats`, `Clubs`, `Requests`; the Requests pill's count `aria-label="Requests, N waiting"`; the All pill's unread badge as today.
- "Your week" heading `Your week`; right text `<Mon D> – <D> · your RSVPs` (an en dash with spaces; `Sep 28 – Oct 4` across a month). Day strip `aria-label="Your week, <Month D> to <D>"`; day `aria-label`s: `<Weekday>, <Month D>, nothing planned` · `<Weekday>, <Month D>, today, nothing planned` · `<Weekday>, <Month D>: <title>, going` / `, maybe` / `, going, live now` (one clause per event, comma-separated).
- Week cards: line 1 `Live now` (glowing dot) or `<Fri 7 PM>`; then ` · ` + check `Going` or dot `Maybe`; line 2 the title; line 3 the club name. `aria-label="<title> room, <club>, live now, you're going"` / `"<title> room, <club>, Friday 7 PM, you said maybe"`. Group `aria-label="Event rooms you RSVP'd to this week"`. No "18 going" on a week card (no calendar field carries it; MK:1 gap).
- Empty week: `Nothing on your week yet.` and the link `Find events` → `/campus?tab=events`. Coral (`#FF8A66` in Night) as W0_EmptyWeek; W0_EmptyClubs's white variant is not used (MK:16.12).
- Club row: name; the coral dot + `Board: <text>` when the Board is unread, else `<Author>: <text>` from the Lounge, or `Board: <text>` when the Lounge is empty; chips `Live now · <title>` / `<Sat> · <title>` + `Going` / `Maybe`; `N new` (Lounge unread, `99+` past 99). Row `aria-label="<club>, unread Board post, <title> is live now"` / `"<club>, N new in the Lounge, <title> Saturday, you're going"` (each clause only when true).
- Person / group rows: as today (`ThreadRow` unchanged); previews `You: …`, `<Name>: …`.
- No clubs (the Clubs filter, `clubs: []`): `Your clubs will live here.` · `Join a club to get its Board, its Lounge and a chat for every event you're going to.` · primary `Find clubs on campus` → `/campus?tab=orgs` · secondary `Start a club` → `/campus?tab=orgs` (there is no phone create-club screen; the Orgs tab holds the desktop-style entry; open point 14.14).
- Chats empty / Requests empty: today's `EmptyState` copy, unchanged.
- Load failure: the `LoadFailed` box with `asLoadFailure(r, "Couldn't load your messages.")`; the Clubs section alone failing: `Couldn't load your clubs.`; the week alone failing: `Couldn't load your week.` (each in its own place; the rest of the screen stays).

**Inside a club (W0_Club, W0_Club_Light, W0_Board, W0_Room, W0_EmptyClub)**
- Back `aria-label="Back to Messages"`; on the event chat `Back to <club>`.
- Header line under the club name: `Your hat: <Owner|Officer|Mod|Member> · <N> members` (`1 member`). The header's right button is a link to the club page: `aria-label="Open <club>'s page"` → `/orgs/<handle>` (the mockup's "More" has no target; open point 14.15). The event chat header has no right button.
- "Up next" heading `Up next`; no right text (the mockup's `your RSVPs` is wrong for `up_next`, MK:16.6). Card line 1: `Live now` / `Tonight 7:30 PM` / `Tue 7 PM` + ` · ` + `Going` / `Maybe` when the viewer RSVP'd; the `Soon` mark (ring) on a `soon` event. `aria-label="<title> room, soon, tonight 7:30 PM, you're going"`. Group `aria-label="<club> events"`.
- Room chips `<nav aria-label="Rooms in <club>">`: `Lounge`, `Board` (`aria-label="Board, 1 unread post"` when unread, else `Board`), `Officers` (lock, `aria-label="Officers, only officers see this room"`), event chips = the event title (calendar icon, `aria-label="<title>, event chat, <tonight|Fri 7 PM|ended>"`), other rooms = their name.
- Board strip: `Board · <Author> · <text>`, dot when unread, chevron; `aria-label="Latest from the Board, unread. <Author>: <text>. Open the Board"`. No strip when `board_latest` is null.
- Composer placeholders (= `aria-label`): `Message the Lounge` · `Post to the Board` · `Message the event chat` · `Message <room name>` (kind `room`). Send `aria-label="Send"`; on the Board `Post to the Board`. The "+" button `aria-label="Add a poll, sign-up or event"`, open: `Close the tray`.
- Board, officer footer line: `Everyone in <club> sees this`. Board, member footer tile: `Only officers post on the Board. You can reply to any post.` (the screen's own sentence, W0_Board:149; the refusal sentence `Only officers post here.` stays the answer to a refused send; open point 14.16).
- Board post byline: `<Name>` · `<Owner|Officer>` (the role word; a `null` role shows nothing); time `6:12 PM` / `Wed` (1.4). Post `aria-label="Board post from <Name>, <Role>, <time>"`. No per-post `New` mark in v1 (no payload carries it; open point 14.17).
- Replies toggle: `<N> replies` (`1 reply`) + chevron; `Replies stay quiet` at the right with the bell-off icon; `aria-label="Show N replies. Replies don't notify anyone."` / `"Hide N replies. …"`. Replies group `aria-label="Replies"`. Reply field `placeholder="Reply quietly"`, `aria-label="Reply quietly to <Name>'s post"`; send `aria-label="Send reply"`. The folded state shows no repliers' avatars in v1 (open point 14.18).
- Event chat state pill (`role="status"`): `Soon · starts <7:30 PM>` · `Live now` · `Ended · chat open <N> more days` (`1 more day`) · `Closed`. Plans: `Where` → the location (`No place yet` when empty), `When` → `Tonight · 7:30 PM` (1.4). Who's going `aria-label="Who's going: N going, M maybe"`; text `<N> going` and `· <M> maybe`. RSVP pill: `Going` (check) / `Maybe` (dot) / `RSVP` (no mark) with `aria-label="You're going. Change your RSVP"` / `"You said maybe. Change your RSVP"` / `"RSVP to this event"`; tapping opens the RSVP sheet (11.6) whose rows are `Going`, `Maybe`, `Not going` and the line `You'll appear in the event chat.` under Going and Maybe.
- Closed event chat footer tile: `This chat is closed.` (= `REFUSAL_SENTENCES.room_closed`).
- A brand new club (officer, `member_count === 1`, `up_next: []`, no messages): `It's just you so far.` · `Three things to do before people arrive.` · 1 `Post a welcome on the Board` (switches to the Board chip and focuses the composer) · 2 `Add your first event` (→ `/campus?tab=events`) · 3 `Invite your members` (→ `/orgs/<handle>`); Up next shows the dashed `Add your first event` button and `Every event gets its own chat for the people going.` A member's empty club shows the empty Lounge line `Say hi to <club>.` instead (not drawn; pinned here).
- Empty room thread (no messages): `Say hi to <club>.` (Lounge), `Nothing on the Board yet.` (Board), `Say hi to everyone going.` (event chat).
- Earlier history: a quiet `Earlier messages` button above the first row when the first page was full.
- Officer remove (long-press → picker): `Remove`; confirm `Remove this message for everyone in the room?` with `Remove` / `Cancel`.
- Removed message (own): `Removed by a club officer.` + `Only you can see this message.` (officer, no reason, no link, no email) · `Removed by Vibe moderators` + today's lines (moderator).

**Cards (W0_Cards, W0_Club, W0_Room)**
- Header line: `<Name> · Poll` / `· Sign-up` / `· Event`; `You` for the viewer's own.
- Poll: the question; options with `Your pick` under a picked label; `<N> votes` in the label (`1 vote`), `aria-label="<label>, your pick. N votes, including <A> and <B>."` / `"<label>. N votes: <A> and <B>."` / `"<label>. N votes."` (anonymous); footer `<N> voted · names shown` / `<N> voted · anonymous`; closed: `Closed · <N> voted`. Card `aria-label="Poll from <Name>: <question>. N voted, names shown"` / `"Your anonymous poll: <question>. N voted"`.
- Sign-up: the title; rows `<slot>` with taker chips; `Full` · `<K> open` (`1 open`) · `Take a spot` (`aria-label="Take a spot in <slot>, K spots open"`) · `Leave` on a slot the viewer took (`aria-label="Leave <slot>"`); footer `<taken> of <total> filled`; closed: `Closed · <taken> of <total> filled`. Card `aria-label="Sign-up from <Name>: <title>, K of M spots filled"`.
- Event card: the club band with the club name; header `<Name> · Event`; the title; `<place> · <Thu Oct 8, 7:30 PM>` (place omitted when empty); the note line when present; `Going` / `Maybe` pills (`aria-pressed`); `<N> going`; link `Open event chat` when `room_id` is set; cancelled (`event: null`): the band and title from the fallback text, then `This event was cancelled.` and no buttons. Card `aria-label="Event shared by <Name>: <title>, <place>, <Thursday October 8, 7:30 PM>. N going, you're going"`.
- Vote / RSVP announcements (`aria-live="polite"`): `<N> voted` · `<taken> of <total> filled` · `You're going` / `You said maybe` / `RSVP removed`.

**The tray and the three sheets (W0_Tray, W0_NewPoll, W0_NewSignup, W0_ShareEvent)**
- Tray `<nav aria-label="Add to the Lounge">`, caption `Add to the Lounge` / `Add to the Board` / `Add to the event chat` / `Add to <room name>`; rows: `Poll` — `Ask the room a question` · `Sign-up` — `Shifts, rides, who brings what` · `Event` — `Share an event with Going / Maybe`.
- New poll: `New poll`; `<club> · the Lounge` (`· the Board`, `· <event title>`, `· <room>`); `Question` with the counter `<n> / 200` (`aria-label="<n> of 200 characters"`); `Options`, `Option <i>`, `Remove <label>`, `Add option`, `2 to 10 options`; `Anonymous` with help `Off: the room sees who picked what. On: counts only.`; `Allow more than one answer`; CTA `Post poll`; close `aria-label="Close"`.
- New sign-up: `New sign-up`; `Title`; `Slots` / `Spots`; `Slot <i>`, stepper `aria-label="Spots for <slot>"`, `One less spot`, `One more spot`, `<n> spots` (`1 spot`); `Remove <slot>`; `Add slot`, `1 to 10 slots`; helper `Names show to everyone in this room.`; CTA `Post sign-up`.
- Share an event: `Share an event`; `Upcoming events` (`role="radiogroup"`), each `aria-label="<title>, <Thursday October 8>, <7:30 PM>, <place>[, selected]"`; empty: `No upcoming events.`; `Add a line (optional)` (`aria-label="Add a line, optional"`, counter `<n> / 200`); helper `Members who tap Going or Maybe join the event chat.`; CTA `Share to the Lounge` / `Share to the Board` / `Share to the event chat` / `Share to <room>`. The mockup's `New event · Officers only` link is NOT built (no phone event-creation screen; open point 14.19).
- Sheet refusals (toast, 1.3): `content_blocked` with `field` → the toast line `That includes words that aren't allowed on Vibe` and the field outlined; `invalid_card` → its sentence; `board_officers_only` / `room_closed` → their sentences and the sheet closes.

### 1.3 Codes and sentences

Every refusal is `{ ok: false, error: <plain sentence>, code }`. Screens match on `code`, never on the status or the sentence. Wave 2 gives a sentence to every code the wave-1 contract left without one (14.9) and adds ONE new code. `RefusalCode` in `types.ts` grows by these eleven; `REFUSAL_SENTENCES` gains eleven rows; `refusalBody()` is unchanged. `ChatRouteCode` keeps `content_blocked` only (its sentence comes from `contentBlockedResponse`, `moderation/access.ts:134-144`).

| code | status (where) | sentence |
|---|---|---|
| `not_found` | 404 (a gated route with the flag off or the schema missing; a vote on a message that is not a live poll of this room; the remove route) | That's not there anymore. |
| `not_allowed` | 403 (the remove route: not the sender in a dm or group; below mod; outranked) | You can't remove this message. |
| `report_open` | 409 (the remove route) | This message has an open report. Vibe's moderators will handle it. |
| `invalid_card` | 400 (a card with a bad shape, from the route or the RPC's `P0C22`) | Check the card and try again. |
| `event_not_found` | 404 (an Event card for a missing, foreign or ended event) | That event isn't available. |
| `poll_closed` | 409 (a vote past `closes_at`, or in a closed event chat) | This one is closed. |
| `slot_full` | 409 (a sign-up slot at capacity) | That spot just filled. |
| `cards_club_rooms_only` | 400 (a card sent to a dm or a group) | Polls, sign-ups and events only work in club chats. |
| `members_only` | 403 (`GET /api/orgs/[slug]/space` by a non-member of a visible club) | Members only. |
| `create_failed` | 500 (club creation; the sentence for `refusalBody`, the wave-1 route keeps its own text) | Couldn't create the club. Try again. |
| **`invalid_after`** (NEW) | 400 (`?after=` that is not a timestamp the server could have sent, `message-read.ts:711` and `messages/route.ts:115`) | Reload to catch up. |

Wave-1 routes that answer `not_found`, `members_only` or `create_failed` keep the sentence they use today (14.9; `channels/route.ts:65-95`, `orgs/route.ts:912-916`).

### 1.4 Time and date labels (pure, tested: `src/lib/chat/when.ts`, owned by W2-B2)

The screens format in the device's zone (as today's `relativeTime`, `MessagesMobile.tsx:282-295`). The server formats the stored fallback text in `CAMPUS_TIME_ZONE = "America/Indiana/Indianapolis"` (both campuses are Eastern; the server runs in UTC). Every function takes `now` so tests are deterministic. Never re-format a `timestamptz` string before handing it back to a route (`roomState` answers `closed` for a zone-less string, contract 14.6).

| function | answers |
|---|---|
| `rowTime(iso, now)` (inbox rows, Board bylines) | same day → `8:44 PM`; yesterday → `Yesterday`; within 6 days → `Wed`; else `Oct 5`; a different year → `Oct 5, 2025` |
| `eventTime(starts_at, now)` (week cards, Up next, chips, Where/When) | today, starts ≥ 17:00 → `Tonight · 7:30 PM`; today otherwise → `Today · 7:30 PM`; tomorrow → `Tomorrow · 7 PM`; within 6 days → `Fri · 7 PM`; else `Oct 8 · 7:30 PM`; minutes only when not `:00`. `eventTimeShort` = the same with ` · ` replaced by a space and no `Today`/`Tonight` prefix (`7:30 PM`, `Fri 7 PM`, `Oct 8 7:30 PM`) |
| `eventWhen(starts_at, zone)` (the fallback text, the event card's date line) | `Thu Oct 8, 7:30 PM` |
| `eventWhenSpoken(starts_at)` (`aria-label`s) | `Thursday October 8, 7:30 PM` |
| `weekRange(now)` | `{ start, end, label: "Oct 5 – 11" | "Sep 28 – Oct 4", spoken: "October 5 to 11" | "September 28 to October 4" }`; weeks run Monday to Sunday in the device's zone |
| `moreDays(ends_at, now)` (`Ended · chat open N more days`) | `ceil((ends_at + 7 d − now) / 1 d)`, at least 1 |
| `clubGradient(id)` / `personColor(id)` (`src/components/mobile/messages/avatar.ts`, W2-S1) | initials on one of the six mockup gradients / colours, picked by a hash of the id; used only when `logo_url` / `avatar_url` is null |

## 2. The flag on the client (D5), URLs and deep links

### 2.1 How a screen learns the flag

- `src/lib/chat/use-chat-v2.ts` (client, W2-S1): `useChatV2(): boolean | null`. On mount it calls `GET /api/me/features` once (`vibeRequest`, `cache: "no-store"`, quiet); `null` until the answer; `true` only when the body is `{ ok: true, chat_v2: true }`; any failure or any other body → `false`, logged once. No cache across mounts (a second mount asks again). The route is `src/app/api/me/features/route.ts:24-36` (`FeaturesResponse`, TY:149).
- **`MessagesMobile`** (after the split, W2-S1): while `useChatV2()` is `null` it renders today's header (`Messages` + the pencil) and `ListSkeleton`, nothing else. `true` → `MessagesHome` (11.1). `false` → today's list, unchanged. Never one then the other. Failure = the old list (fail closed), never a blank page.
- **Desktop is untouched**: `MessagesSwitch.tsx:39-66` keeps the `messages.html` iframe and never asks the flag.
- The gated routes (`/api/me/inbox`, `/api/orgs/[slug]/space`, the card routes) answer 404 `not_found` with the flag off; a screen that reaches them with the flag on and still meets a 404 shows the `LoadFailed` line, not the old list.
- `chatV2For` is not cached (`flag-server.ts:14-16`): one home mount asks it three times (features, inbox, calendar). Accepted for v1 (one `org_members` read each, RM:21).

### 2.2 `CampusMobile` with the flag on (D5, Franky's call 8)

`CampusMobile.tsx` (W2-S1 owns it in wave 2) calls `useChatV2()` too.
- While `null` or `false`: today's tabs, pill and `?channel=` drill-down, unchanged (the `# name` title of `synthesizeChannelThread`, `CampusMobile.tsx:2459-2472`, stays until after launch; C6).
- When `true`: `TAB_ORDER` / `VISITING_CLOSED_TAB_ORDER` are rendered without `"chat"` (`TabStrip`, `:850`, `:1160-1216`); if `tab === "chat"` at that moment (from `?tab=chat`, `:166-171`, or `?channel=`, `:433-435`), the component calls `router.replace("/messages" + (initialChannelId ? "?channel=" + encodeURIComponent(initialChannelId) : ""))` once (`useRouter` is already imported, `:4`); `?org=` is dropped (the room id is enough, 2.3). `ChatPane` and `OrgChannelsDrawer` are never mounted with the flag on. A flag answer that arrives after the pill was drawn removes the pill (the flag-off majority never sees a flash; the allow-listed few may see the pill for one read; open point 14.20).
- The club page's rooms list (`src/app/orgs/[handle]/ChannelsSection.tsx:314`) keeps linking to `/campus?tab=chat&org=<handle>&channel=<id>`; with the flag on the redirect above lands it on `/messages?channel=<id>`. No change to that file.

### 2.3 URLs (phone, flag on)

| URL | opens |
|---|---|
| `/messages` | the home, filter `All` |
| `/messages?tab=chats` / `clubs` / `requests` | the home with that filter (flag off: ignored; `requests` is not mapped to the old tab) |
| `/messages?channel=<id>` | the thread GET for `<id>` runs first (it works for any thread the viewer may read, `messages/route.ts:83-97`): `room !== null` → the club space of `room.org.handle` with that room active (11.3); `room === null` → `ConversationView` as today |
| `/messages?to=<handle>` | as today (a DM) |

- Opening a club space or a dm from the home does `history.pushState({ vibeChat: id }, "", "/messages?channel=<id>")`; switching room chips inside a space does `replaceState`; the Back button and a `popstate` close the open view (so Android's hardware back and iOS's edge swipe land on the home). The old list (flag off) keeps today's behaviour: no history writes (MM:5.3). Open point 14.21.
- Push and Otto mention links keep pointing at `/messages?channel=<id>` (wave-1 contract 7); nothing in wave 2 changes them.
- `?after=`, `?before=`, `?root=`, `?limit=` on the thread GET are unchanged (9.2).

## 3. Migration B — cards (W2-B1; written in the cloud, rehearsed and applied on the Mac)

File **`supabase/migrations/20261001110000_chat_v2_cards.sql`** (nothing landed after `20261001100000`, DM:1; no renumbering). House style of migration A, copied: the header sections in A's order (DM:2.1), `begin; set local lock_timeout = '5s';`, PRE-FLIGHT, numbered steps, POST-CHECK by reading, POST-CHECK BY BEHAVIOUR, APPLY RECORD, `notify pgrst, 'reload schema';`, `commit;`. Error prefix **`chat-cards:`**. Every function: `set search_path to ''`, fully qualified names, `comment on function`, `grant execute … to anon, authenticated, service_role` right after it (the standing rule, DM:6.2), and the client roles refused from the inside. Values carried between DO blocks with `set_config('chat_cards.<key>', …, true)`.

**What B changes on existing tables: exactly one trigger on `channel_members` (3.5).** No policy, grant, column, constraint or row of `messages`, `channels`, `channel_members`, `rsvps`, `events`, `org_members` changes. `messages_kind_check` already allows `poll` and `event_card` (A:839-845). Nothing in the schema stops a card row with `thread_root_id` set; the RPCs never write one (3.3).

Departures from the wave-1 contract's section 4, each said out loud: (a) a **fourth table `chat_event_cards`** holds the Event card's `note` (section 4 had nowhere to keep it; deriving it from `messages.content` breaks when the event is renamed); (b) `chat_create_event_card` takes **`p_note text`** before `p_content`; (c) a **`chat_reply_counts`** function (the carry-over C2); (d) `messages.content` for a card is built by the route with `cardFallbackContent()` and checked by the RPC (1–300 characters), as 4.3 says.

### 3.0 PRE-FLIGHT (catalog and count reads only; never `schema_migrations`; DM:8.1)

In this order, each a `raise exception 'chat-cards: …'` unless it holds:
1. **Not already applied**: `to_regclass('public.chat_polls') is null` (else `already applied (chat_polls exists). Nothing to do`). First, before any fingerprint.
2. **Migration A is there**: `information_schema.columns` has `messages.kind`, `messages.thread_root_id`, `messages.card_event_id`, `channels.kind`, `channels.event_id`; `to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)') is not null`; `pg_constraint` has `messages_kind_check` and `messages_card_event_shape` on `public.messages`.
3. **Fingerprints** (`md5(pg_get_functiondef(p.oid))`, never `md5(prosrc)`): `public.can_view_org_channel(uuid,uuid)` = `747ee06d2e4c3e8a788129f7530ec0ae`; `public.can_post_org_channel(uuid,uuid,uuid)` = `8d8be860d3f7077b9d6f9238705bdca7`; `public.org_members_drop_club_access()` = `0e7baa973042be8ca0decb7df1ca6407` (DM:4). Message `<fn> drifted (md5 %); re-read it first`. `is_blocked_either_way` is not pinned (B does not call it; its only pinned value is `md5(prosrc)`, DM:9).
4. **Policy texts by exact `pg_policies` text**: `messages_insert_org_member` and `messages_insert_member` `with_check` = the two texts of DM:3.8 (A's `want_*`); `messages_select_org_member` `qual` = `((removed_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))) AND …` as `pg_policies` prints it — **the constant is copied from `pg_policies` on the Mac after the first rehearsal, never typed** (the first rehearsal runs with the constant empty and raises `chat-cards: policy constants are empty` after printing the text); exactly two permissive INSERT policies on `messages`; RLS on for `messages`, `channels`, `channel_members`.
5. **Grants as found**: `not has_table_privilege('authenticated', 'public.messages', 'UPDATE')`; no INSERT for `authenticated` on `channels` and `channel_members`; no `anon` SELECT on `messages`; `has_function_privilege` for the three roles on the two A functions.
6. **Every name is free** (`to_regclass`, `pg_constraint.conname`, `pg_class.relname`, `pg_proc.proname`, `pg_trigger.tgname`): the four tables; every constraint named in 3.1; the indexes of 3.1; `chat_create_poll`, `chat_create_event_card`, `chat_cast_vote`, `chat_reply_counts`, `chat_votes_drop_access`; the trigger `chat_votes_drop_access` on `channel_members`.
7. **Trigger set traced**: `channel_members` has no trigger; `messages` exactly `bump_org_activity_on_message`, `messages_check_media_ref`; `org_members` exactly 5; `channels` 2; `rsvps` 1; `events` 1 (DM:3.4). Any other → `a trigger this file was not written against: %`.
8. **Data shape**: `count(*) from public.messages where kind <> 'text'` = 0 and `where card_event_id is not null` = 0 (`Stop and ask Franky` otherwise); `orgs` ≤ 40, org channels ≤ 60.
9. **Standing rule** (asis 4.6 query) = 0 rows, before and (POST-CHECK) after.

### 3.1 Tables, constraints, indexes (every constraint named, so 3.0.6 and the ROLLBACK list are exact)

```sql
create table public.chat_polls (
  message_id  uuid constraint chat_polls_pkey primary key
              constraint chat_polls_message_id_fkey references public.messages(id) on delete cascade,
  channel_id  uuid not null constraint chat_polls_channel_id_fkey references public.channels(id) on delete cascade,
  mode        text not null constraint chat_polls_mode_check check (mode in ('poll', 'signup')),
  question    text not null constraint chat_polls_question_check check (char_length(btrim(question)) between 1 and 200),
  anonymous   boolean not null default false,
  multi       boolean not null default false,
  closes_at   timestamptz,
  created_by  uuid not null constraint chat_polls_created_by_fkey references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint chat_polls_signup_shape check (mode = 'poll' or (anonymous = false and multi = true))
);
create table public.chat_poll_options (
  id        uuid constraint chat_poll_options_pkey primary key default gen_random_uuid(),
  poll_id   uuid not null constraint chat_poll_options_poll_id_fkey references public.chat_polls(message_id) on delete cascade,
  position  smallint not null constraint chat_poll_options_position_check check (position between 0 and 9),
  label     text not null constraint chat_poll_options_label_check check (char_length(btrim(label)) between 1 and 80),
  capacity  smallint constraint chat_poll_options_capacity_check check (capacity is null or capacity between 1 and 50),
  constraint chat_poll_options_poll_id_position_key unique (poll_id, position)
);
create table public.chat_poll_votes (
  option_id  uuid not null constraint chat_poll_votes_option_id_fkey references public.chat_poll_options(id) on delete cascade,
  poll_id    uuid not null constraint chat_poll_votes_poll_id_fkey references public.chat_polls(message_id) on delete cascade,
  user_id    uuid not null constraint chat_poll_votes_user_id_fkey references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_poll_votes_pkey primary key (option_id, user_id)
);
create table public.chat_event_cards (
  message_id  uuid constraint chat_event_cards_pkey primary key
              constraint chat_event_cards_message_id_fkey references public.messages(id) on delete cascade,
  note        text constraint chat_event_cards_note_check check (note is null or char_length(btrim(note)) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index idx_chat_polls_channel        on public.chat_polls (channel_id);
create index idx_chat_poll_votes_poll_user on public.chat_poll_votes (poll_id, user_id);
create index idx_chat_poll_votes_user      on public.chat_poll_votes (user_id);
```

- A sign-up is a poll with `mode = 'signup'`: the "question" is its title, each option is a slot with a `capacity`, a person may take more than one slot (`multi = true` by the CHECK), names always show (`anonymous = false`). A poll's options have `capacity` null. **A poll has 2–10 options; a sign-up has 1–10.** Labels need not be unique. No edits in v1.
- All four tables: `alter table … enable row level security;` NO policy, and `revoke all on table public.<t> from anon, authenticated, service_role; grant select, insert, update, delete on table public.<t> to service_role;` (DM:6.2 — the default ACL would hand `anon` the table).
- `comment on table` each, one line, citing this section.

### 3.2 The SQLSTATE → route-code table (every RPC raises with one of these; the routes map them)

| SQLSTATE | raised when | route answer |
|---|---|---|
| `42501` | the caller is `anon` or `authenticated` (the first statement of every RPC) | never reached by a route (routes call with the service role); over REST it is "not allowed" |
| `P0C21` | `can_post_org_channel(channel, user, null)` is false (not a member, not an officer on a Board, a closed event chat, a dm) | 403 with `postRefusal(room, null, role)`'s code (`board_officers_only` or `room_closed`) |
| `P0C22` | a bad shape (mode, counts, labels, capacity, note, content, `closes_at` in the past) | 400 `invalid_card` |
| `P0C23` | the event is missing, belongs to another club, has no club, or has ended | 404 `event_not_found` |
| `P0C24` | the poll, option or message is not there for this person (missing, removed, not viewable, option of another poll) | 404 `not_found` |
| `P0C25` | past `closes_at`, or the room no longer accepts posts (a closed event chat) | 409 `poll_closed` |
| `P0C26` | a sign-up slot at capacity | 409 `slot_full` |
| `22023` | more than 200 ids to `chat_reply_counts` | never (the route chunks by 100) |
| `P0C29` | the file's own POST-CHECK probe rolls itself back (A used `P0C21`; B may not, DM:2.5) | — |

Any other error from an RPC (a `PGRST202` / `42883` "function missing" = the schema is missing → 404 `not_found`, 3.10-style; anything else → 503 `try_again`, logged with the SQLSTATE).

### 3.3 `chat_create_poll` (exact body)

```sql
create function public.chat_create_poll(
  p_channel uuid, p_user uuid, p_mode text, p_question text, p_options jsonb,
  p_anonymous boolean, p_multi boolean, p_closes_at timestamptz, p_content text
) returns uuid
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_msg       uuid;
  v_n         integer;
  v_i         integer := 0;
  v_question  text := btrim(coalesce(p_question, ''));
  v_content   text := btrim(coalesce(p_content, ''));
  v_anonymous boolean := coalesce(p_anonymous, false);
  v_multi     boolean := coalesce(p_multi, false);
  v_opt       jsonb;
  v_label     text;
  v_cap       smallint;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_channel is null or p_user is null or p_mode not in ('poll', 'signup')
     or char_length(v_question) not between 1 and 200
     or char_length(v_content) not between 1 and 300
     or (p_closes_at is not null and p_closes_at <= now())
     or jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  v_n := jsonb_array_length(p_options);
  if (p_mode = 'poll' and v_n not between 2 and 10) or (p_mode = 'signup' and v_n not between 1 and 10) then
    raise exception 'chat-cards: bad shape (options)' using errcode = 'P0C22';
  end if;
  if not coalesce(public.can_post_org_channel(p_channel, p_user, null), false) then
    raise exception 'chat-cards: not allowed to post here' using errcode = 'P0C21';
  end if;
  if p_mode = 'signup' then v_anonymous := false; v_multi := true; end if;

  insert into public.messages (channel_id, user_id, content, kind)
  values (p_channel, p_user, v_content, 'poll') returning id into v_msg;
  insert into public.chat_polls (message_id, channel_id, mode, question, anonymous, multi, closes_at, created_by)
  values (v_msg, p_channel, p_mode, v_question, v_anonymous, v_multi, p_closes_at, p_user);

  for v_opt in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(v_opt) <> 'object' then
      raise exception 'chat-cards: bad shape (option)' using errcode = 'P0C22';
    end if;
    v_label := btrim(coalesce(v_opt ->> 'label', ''));
    if char_length(v_label) not between 1 and 80 then
      raise exception 'chat-cards: bad shape (label)' using errcode = 'P0C22';
    end if;
    if p_mode = 'signup' then
      if jsonb_typeof(v_opt -> 'capacity') is distinct from 'number'
         or (v_opt ->> 'capacity') !~ '^[0-9]+$' then
        raise exception 'chat-cards: bad shape (capacity)' using errcode = 'P0C22';
      end if;
      v_cap := (v_opt ->> 'capacity')::integer;
      if v_cap not between 1 and 50 then
        raise exception 'chat-cards: bad shape (capacity)' using errcode = 'P0C22';
      end if;
    else
      if v_opt ? 'capacity' and jsonb_typeof(v_opt -> 'capacity') <> 'null' then
        raise exception 'chat-cards: bad shape (capacity on a poll)' using errcode = 'P0C22';
      end if;
      v_cap := null;
    end if;
    insert into public.chat_poll_options (poll_id, position, label, capacity)
    values (v_msg, v_i, v_label, v_cap);
    v_i := v_i + 1;
  end loop;
  return v_msg;
end $$;
```

The `messages` insert runs as the function's owner, so the two INSERT policies (`TO authenticated`) do not apply; the BEFORE trigger `messages_check_media_ref` sees `media_url` null and passes, `bump_org_activity_on_message` moves `orgs.last_activity_at` (DM:5.3, why `InboxClub.last_activity_at` is computed, not read). The row's `thread_root_id`, `card_event_id`, `media_*`, `removed_*` stay null. The shape checks run BEFORE `can_post_org_channel` so a bad body never costs a policy call; the route checks the same shape first (4.2) and the RPC is the second wall.

### 3.4 `chat_create_event_card` and `chat_cast_vote` (exact bodies)

```sql
create function public.chat_create_event_card(
  p_channel uuid, p_user uuid, p_event uuid, p_note text, p_content text
) returns uuid
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_msg     uuid;
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_content text := btrim(coalesce(p_content, ''));
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_channel is null or p_user is null or p_event is null
     or (v_note is not null and char_length(v_note) > 200)
     or char_length(v_content) not between 1 and 300 then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  if not coalesce(public.can_post_org_channel(p_channel, p_user, null), false) then
    raise exception 'chat-cards: not allowed to post here' using errcode = 'P0C21';
  end if;
  select c.org_id into v_org from public.channels c where c.id = p_channel;
  if v_org is null or not exists (
       select 1 from public.events e
        where e.id = p_event and e.org_id = v_org and e.ends_at > now()) then
    raise exception 'chat-cards: event not found' using errcode = 'P0C23';
  end if;
  insert into public.messages (channel_id, user_id, content, kind, card_event_id)
  values (p_channel, p_user, v_content, 'event_card', p_event) returning id into v_msg;
  insert into public.chat_event_cards (message_id, note) values (v_msg, v_note);
  return v_msg;
end $$;
```

```sql
create function public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)
returns void
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_poll     public.chat_polls%rowtype;
  v_removed  timestamptz;
  v_kind     text;
  v_cap      smallint;
  v_taken    integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_poll is null or p_option is null or p_user is null or p_on is null then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  -- One vote at a time per poll: the poll row is the lock.
  select p.* into v_poll from public.chat_polls p where p.message_id = p_poll for update;
  if not found then raise exception 'chat-cards: no such poll' using errcode = 'P0C24'; end if;
  select m.removed_at, c.kind into v_removed, v_kind
    from public.messages m join public.channels c on c.id = m.channel_id
   where m.id = p_poll;
  if not found or v_removed is not null
     or not coalesce(public.can_view_org_channel(v_poll.channel_id, p_user), false) then
    raise exception 'chat-cards: no such poll' using errcode = 'P0C24';
  end if;
  select o.capacity into v_cap from public.chat_poll_options o
   where o.id = p_option and o.poll_id = p_poll for update;
  if not found then raise exception 'chat-cards: no such option' using errcode = 'P0C24'; end if;
  if (v_poll.closes_at is not null and v_poll.closes_at <= now())
     or (v_kind <> 'board' and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
    raise exception 'chat-cards: closed' using errcode = 'P0C25';
  end if;

  if p_on then
    if exists (select 1 from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user) then
      return;                                   -- already theirs: nothing to do, never "slot full"
    end if;
    if v_poll.mode = 'signup' then
      select count(*) into v_taken from public.chat_poll_votes v where v.option_id = p_option;
      if v_cap is not null and v_taken >= v_cap then
        raise exception 'chat-cards: slot full' using errcode = 'P0C26';
      end if;
    elsif not v_poll.multi then
      delete from public.chat_poll_votes v where v.poll_id = p_poll and v.user_id = p_user;
    end if;
    insert into public.chat_poll_votes (option_id, poll_id, user_id)
    values (p_option, p_poll, p_user) on conflict do nothing;
  else
    delete from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user;
  end if;
end $$;
```

- In a Board any viewer may vote (a member cannot post there, but `v_kind <> 'board'` skips the post check); in every other kind the room must still accept posts, which only an event chat past its 7 days refuses. `closes_at` is a `timestamptz` compare, no day arithmetic; the 7-day window is `can_post_org_channel`'s own UTC rule.
- `can_view_org_channel` answers about any uid under `service_role` (DM:3.6); a person who left the club, or a non-member, gets `P0C24` (the poll "is not there" for them), never a hint that it exists.
- A single-choice poll (`multi = false`) deletes the person's other vote on the poll first; a multi poll and a sign-up keep them. Turning a vote off is idempotent.

### 3.5 `chat_reply_counts` and the trigger `chat_votes_drop_access` (exact bodies)

```sql
create function public.chat_reply_counts(p_channel uuid, p_roots uuid[], p_viewer uuid)
returns table (root uuid, n integer)
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_roots), 0) > 200 then
    raise exception 'too many ids (max 200)' using errcode = '22023';
  end if;
  return query
    select m.thread_root_id, count(*)::integer
      from public.messages m
     where m.channel_id = p_channel
       and m.thread_root_id = any (p_roots)
       and (m.removed_at is null or m.user_id = p_viewer)
     group by m.thread_root_id;
end $$;
```
Served by `idx_messages_thread_root (thread_root_id, created_at) where thread_root_id is not null` (DM:3.2). It counts the viewer's OWN removed replies (B4's rule, `message-read.ts:398-403`), so a post never says "1 reply" above two rows. A root with no live reply returns no row (the caller fills 0).

```sql
create function public.chat_votes_drop_access() returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  begin
    select c.org_id into v_org from public.channels c where c.id = old.channel_id;
    if v_org is null then return null; end if;               -- a dm/group row, or the room is already gone
    if exists (select 1 from public.org_members m
                where m.org_id = v_org and m.user_id = old.user_id and m.role in ('owner', 'admin')) then
      return null;                                            -- officers keep their votes (they keep the room)
    end if;
    delete from public.chat_poll_votes v
     using public.chat_polls p
     where p.message_id = v.poll_id and p.channel_id = old.channel_id and v.user_id = old.user_id;
  exception when others then
    raise warning 'chat-cards: % failed: %', tg_name, sqlerrm;
  end;
  return null;
end $$;
create trigger chat_votes_drop_access
  after delete on public.channel_members
  for each row execute function public.chat_votes_drop_access();
```

- It fires inside `org_members_drop_club_access`'s DELETE (leave / removal: the `org_members` row is already gone, so the person is not an officer and their votes go), inside `chat_org_members_rooms` (a demotion: event-room rows without an RSVP go, and with them the votes there), inside `chat_rsvps_room` (an RSVP withdrawn: the event-room row and the votes in that chat go), and on every FK cascade from `channels` or `users` (the votes are already going by cascade; the delete finds nothing). "No row found = return, never raise" (A's rule); the wrap means a votes bug never blocks a leave.
- Known gaps, accepted (4.1 of the wave-1 contract): the Officers room has no `channel_members` rows, so a demoted officer's votes there stay; a `room` turned private and public again loses its members' votes (no custom-rooms UI in v1).

### 3.6 Grants, comments, the standing rule

- `grant execute on function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text) to anon, authenticated, service_role;` and the same for `chat_create_event_card(uuid,uuid,uuid,text,text)`, `chat_cast_vote(uuid,uuid,uuid,boolean)`, `chat_reply_counts(uuid,uuid[],uuid)`. The trigger function gets no grant (not callable over REST, DM:6.2).
- `comment on function` each: one line naming this section and the SQLSTATEs it raises. The APPLY RECORD (3.8) is appended to the comment of **`chat_create_poll`**, never to `chat_repair_club`'s (A's record lives there, DM:2.6).
- The standing-rule query (asis 4.6) returns 0 rows after the file.

### 3.7 POST-CHECK by reading (same transaction; any failure rolls everything back)

- The four tables exist, `relrowsecurity` true, `pg_policies` count 0 each; `has_table_privilege` false for `anon` and `authenticated` on SELECT/INSERT/UPDATE/DELETE, true for `service_role` on the four, false for `service_role` on TRUNCATE.
- `pg_constraint` lists every constraint of 3.1 by name with the expected `pg_get_constraintdef` (the deparsed texts are **copied from a rehearsal**, as A does for policies; empty constants print and raise on the first rehearsal); every FK `confdeltype = 'c'`.
- Each of the four callable functions: `prosecdef`, `provolatile` (`v` for the three writers, `s` for `chat_reply_counts`), `proconfig` exactly (`array['search_path=""', 'TimeZone=UTC']` for the three writers; `array['search_path=""']` for the counter and the trigger function), `has_function_privilege` for the three roles; `md5(pg_get_functiondef)` of each recorded as `want_*` constants (empty on the first rehearsal → NOTICE + raise, A:1712-1716 idiom). These are what a later file fingerprints.
- The trigger: `tgrelid = 'public.channel_members'::regclass`, `tgenabled = 'O'`, `tgtype = 9` (row + after delete), empty `tgattr`.
- Unchanged: the two A function md5s of 3.0.3; the policy texts of 3.0.4; the grants of 3.0.5; the trigger sets of 3.0.7 plus exactly the one new trigger on `channel_members`.
- The standing-rule query = 0 rows.

### 3.8 POST-CHECK BY BEHAVIOUR (inside a nested block that raises `P0C29` so it rolls back; skips with a recorded reason when no fixture can be found)

Fixtures from real rows (A:1809-1856 idiom): a club with a Lounge, a Board, a member below admin who passes `can_publish_now() and has_recorded_consent()`, an officer, and one event of that club with `ends_at > now()`; the closed event chat when one exists (locally "Chat Seed Closed Night", CLOSE `:50`). Accepted probes first, refusals after:
1. As the file's role: `chat_create_poll(lounge, member, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')` → uuid; the `messages` row has `kind = 'poll'`, `content`, `thread_root_id null`, `card_event_id null`; two options at positions 0, 1, `capacity null`. Sign-up on the Lounge with `[{"label":"s","capacity":1}]` → accepted, `anonymous false`, `multi true`. `(board, officer, …)` → accepted. Event card `(lounge, member, <event>, 'ride?', 'Event: …')` → accepted, `kind = 'event_card'`, `card_event_id` set, a `chat_event_cards` row with the note.
2. Refusals: `(board, member, …)` → `P0C21`; a poll with 1 option → `P0C22`; a sign-up with 0 or 11 → `P0C22`; a sign-up option without `capacity`, a poll option with one, a label of 81 characters, `closes_at` in the past, a content of 301 → `P0C22`; the closed event chat → `P0C21` (skipped when none exists); an event of another club, an ended event, a random uuid → `P0C23`; a note of 201 → `P0C22`.
3. Votes: `chat_cast_vote(poll, a, member, true)` → one row; `(poll, b, member, true)` → a is gone, b stays (single choice); on a `multi` poll both stay; `p_on false` deletes; a poll created with `closes_at = now() + '1 minute'` then a vote after `set local` cannot move `now()` → instead create with a past `closes_at` through a direct insert as the file's role and vote → `P0C25`; the 1-spot sign-up taken by the officer, then the member → `P0C26`; the same person twice → no error, one row; an option of another poll → `P0C24`; a removed message (`update messages set removed_at = now()` as the file's role) → `P0C24`; a vote by a member of another club → `P0C24`; a member (who cannot post on the Board) voting on the officer's Board poll → accepted.
4. As `authenticated` (claims set): every RPC → `42501`; `select 1 from public.chat_polls` → `42501`; `insert into messages (… kind 'poll')` → `42501` (A's policy, unchanged); a reply by the member under the officer's Board poll (`thread_root_id = <the poll message>`) → accepted (`can_post_org_channel` checks the root's `thread_root_id` and `removed_at`, not its `kind`, DM:3.7): **allowed on purpose** (a Board post may be a poll; its replies fold like any other, 11.4).
5. `chat_votes_drop_access`: delete the member's `channel_members` row on the Lounge → their Lounge votes are gone, the officer's stay; re-insert the row; delete the officer's row → their votes stay.
6. `chat_reply_counts(board, array[<post>], member)` → `(post, 1)` after one live reply; nothing for a root whose only reply is removed by someone else; `(post, 1)` for the member when the removed reply is the member's own.
7. Every fixture row gone after the rollback (`not exists (select 1 from public.messages where content like 'chat-cards probe:%')`); `current_user` back to the starting role.

### 3.9 APPLY RECORD, header queries, the local check script

- APPLY RECORD: `'APPLY RECORD <YYYY-MM-DD HH24:MI> UTC: tables 4, functions 4, trigger 1; probe: <result or skipped: reason>.'` appended to `obj_description('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)'::regprocedure, 'pg_proc')` (NOTICE lines never reach the Management API, DM:2.6).
- Header PRE-CHECK queries (read-only, run on production before the apply): (1) `to_regclass('public.chat_polls')` is null; (2) the two A function md5s; (3) `count(*) from messages where kind <> 'text'` = 0; (4) `select tgname from pg_trigger where tgrelid = 'public.channel_members'::regclass and not tgisinternal` = no rows. CHECK AFTER APPLYING: (1) the APPLY RECORD from the comment; (2) `select count(*) from public.chat_polls` (0 on the apply day); (3) `scripts/sql/chat-v2-after-deploy.sql` still 0 findings.
- **`scripts/sql/chat-v2-cards-check.sql`** (W2-B1 writes it; LOCAL ONLY, unix-socket guard and the psql first line like `chat-v2-rooms-check.sql:1-12`): the 3.8 cases again with its own throwaway fixtures plus the HTTP-shaped ones the migration cannot see (a vote race: two sessions on a 1-spot slot, one `P0C26`), inside one transaction ending in ROLLBACK; last line `chat-cards-check: all N cases passed`.
- COST section of the header (the Mac fills it): `EXPLAIN (ANALYZE)` of `chat_reply_counts` over a Board with 100 posts and 2,000 replies, and of `chat_cast_vote` on a poll with 500 votes, built with `generate_series` inside `BEGIN … ROLLBACK`.

### 3.10 Apply order, the window, missing schema, rollback

**Order: the branch is green (13.3) → migration B is applied on production and recorded → the branch is merged to `main` → the flag's env vars are set for Production.** Nothing from wave 2 reaches `main` before the `schema_migrations` row `('20261001110000', 'chat_v2_cards')` is written (a separate Management API request, `20260926100000_users_profile_layout.sql:74-85`). Inside the window old code (wave 1) runs on the new database and nothing changes for it (section 0). Locks: `CREATE TABLE`, `CREATE FUNCTION` and `CREATE TRIGGER` on `channel_members` (a short `SHARE ROW EXCLUSIVE` on `channel_members`); `lock_timeout 5s`; a quiet hour; Franky's yes.

**New code on a database without B** (local before the apply, a Vercel Preview, after a rollback): `isMissingChatSchema` (`PGRST202` / `42883` / `42P01` / `PGRST205`) decides.

| route / helper | when B is missing |
|---|---|
| card routes | 404 `not_found` |
| `hydrateCards` | an empty map (every card null), logged once |
| `snapshotCard` | null (the snapshot has `card: null`) |
| `readReplyCounts` | the wave-1 walk (`message-read.ts:390-438`), kept as the fallback |
| `/api/me/inbox`, `/api/orgs/[slug]/space` | they need only A; unaffected |
| the remove route | needs only A; unaffected |

**Rollback:** restore the previous deployment FIRST; then, in one transaction: `drop trigger chat_votes_drop_access on public.channel_members; drop function public.chat_votes_drop_access(); drop function public.chat_reply_counts(uuid,uuid[],uuid); drop function public.chat_cast_vote(uuid,uuid,uuid,boolean); drop function public.chat_create_event_card(uuid,uuid,uuid,text,text); drop function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text); drop table public.chat_poll_votes, public.chat_poll_options, public.chat_polls, public.chat_event_cards; delete from supabase_migrations.schema_migrations where version = '20261001110000'; notify pgrst, 'reload schema';`. What it does NOT undo, listed first in the header: the `messages` rows of kind `poll` / `event_card` stay (A's CHECK allows them; old screens show their fallback text); with Franky's yes, BEFORE the tables are dropped: `delete from public.messages where kind <> 'text';` (their replies go by cascade). Migration A's rollback comes after B's, never before.

## 4. Card routes (W2-B2)

Two new files: `src/app/api/me/threads/[id]/cards/route.ts` (POST) and `src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts` (PUT). Both `RouteCtx = { params: Promise<{ … }> }`, `await ctx.params` first (Next 16, RM:19). Both use `refuse(code, status)` = `NextResponse.json(refusalBody(code), { status })` as the messages route does (`messages/route.ts:59-61`). Bodies are parsed as the channel routes do (`members/route.ts:118-127`): JSON failure, `null`, a non-object or an array → 400 `{ ok: false, error: "Invalid JSON" }`. Ids from the path go through `isUuid` from `@/lib/pgrest` (`pgrest.ts:15`); a non-uuid `[id]` → 403 "Not a member" (what `ensureMember` answers, `channel-access.ts:59`), a non-uuid `[messageId]` → 404 `not_found`.

### 4.1 `POST /api/me/threads/[id]/cards` — gates, in this order

1. auth → 401 `{ ok: false, error: "Unauthorized" }`.
2. `chatV2For(user.id)` false → 404 `not_found`.
3. `rateLimit("message-send:<uid>", { limit: 60, windowSec: 60 })` (the send bucket, shared) → `tooManyRequests(rl)`.
4. `requireCanPublish(user.id)` (Terms, restriction, verified school email) → its response.
5. JSON → 400 "Invalid JSON".
6. Shape: `readCreateCardBody(body)` (5.4) → `{ ok: false, field }` → 400 `invalid_card` with `field` added to the body (`{ ok: false, error, code: "invalid_card", field: "question" | "options" | "options.<n>" | "event_id" | "note" | "closes_at" | "type" }`).
7. Word filter, `checkText` (`text-filter.ts:145-157`) on the question / title, every option label, the note, in that order → 422 `contentBlockedResponse(field)` with `field` = `question`, `options.<n>` (0-based), `note`. No @mention parsing: card text never notifies anyone (mentions are a text-message feature, 6.2 of the wave-1 contract).
8. `ensureMember(supabase, channelId, user.id)` → `!ok` → `{ ok: false, error: "Not a member" }` with its status (403 or 500; never 404, RM:20.9).
9. `isOrgChannel === false` → 400 `cards_club_rooms_only`.
10. `roomOf(channelId, member)` (`message-read.ts:643-650`): `failed` → 503 `try_again`; `room === null` with `kind` set (16.2) → 503 `try_again`; `room === null` and `kind` null (a database without A) → 404 `not_found`.
11. `content = cardFallbackContent(…)` (5.1) from the cleaned body; for `type: "event"` the title and `starts_at` come from a service-role `events` read `id, title, starts_at, org_id, ends_at` — missing, `org_id !== member.orgId`, or `ends_at <= now` → 404 `event_not_found` (the RPC's `P0C23` is the second wall).
12. The RPC with the service role: `chat_create_poll(channelId, user.id, "poll" | "signup", question, options, anonymous, multi, closes_at, content)` or `chat_create_event_card(channelId, user.id, event_id, note, content)`. SQLSTATE → code by 3.2; for `P0C21` the code is `postRefusal(room, null, await clubRole(member.orgId, user.id))` with `POST_REFUSAL_STATUS` (`messages/route.ts:64-69`: 403). Missing function → 404 `not_found`; other → 503 `try_again`, logged.
13. Read back: `readChatMessage(supabase, id, { viewerId: user.id, room })` (`message-read.ts:797-832`; the cookie client, so the card comes through 9.1's hydration and the viewer's own block set) → null → 503 `try_again` (the row exists; the screen's next poll shows it) → **`201 { ok: true, message: ChatMessage }`** (`CreateCardResponse`, TY:172).

No push, no mention notification, no `last_read_at` bump (those are dm/group-only in the send route too, `messages/route.ts:519-543`).

### 4.2 `readCreateCardBody` (pure, tested, `src/lib/chat/cards/body.ts`, W2-B2)

```ts
type CleanCardBody =
  | { type: "poll";   question: string; options: { label: string }[]; anonymous: boolean; multi: boolean; closes_at: string | null }
  | { type: "signup"; question: string; options: { label: string; capacity: number }[]; closes_at: string | null }
  | { type: "event";  event_id: string; note: string | null };
export function readCreateCardBody(body: unknown, now: Date): { ok: true; value: CleanCardBody } | { ok: false; field: string };
```
Rules (the RPC's 3.3 / 3.4 rules, in TypeScript so the 400 carries a `field`): `type` one of the three; `question` a string, trimmed, 1–200; `options` an array, poll 2–10, sign-up 1–10, each `{ label }` trimmed 1–80, sign-up `capacity` an integer 1–50, a poll option with `capacity` → `options.<n>`; `anonymous` / `multi` booleans or absent (false); `closes_at` absent or null → null, a string that `Date.parse`s and is after `now` → kept as sent, else `closes_at`; `event_id` a uuid; `note` absent or a string trimmed to ≤ 200, blank → null. Unknown keys are ignored. Whitespace inside labels is collapsed to single spaces.

### 4.3 `PUT /api/me/threads/[id]/cards/[messageId]/vote` — gates, in this order

1. auth → 401. 2. `chatV2For` → 404 `not_found`. 3. `rateLimit("card-vote:<uid>", { limit: 120, windowSec: 600 })`. 4. `requireNotRestricted(user.id)`. 5. JSON → 400; `option_id` not a uuid or `on` not a boolean → 400 `invalid_card` (`field: "option_id" | "on"`). 6. `ensureMember` → "Not a member" (403/500). 7. `isOrgChannel === false` → 400 `cards_club_rooms_only`. 8. `roomOf` as 4.1.10.
9. **The message is re-read on the cookie client, scoped to `[id]`**: `messages` select `id, kind, removed_at` where `id = messageId and channel_id = channelId` `.limit(1)` (never `.maybeSingle()` on a read that may match twice, BN:5); no row, or `kind !== "poll"` → 404 `not_found` (RLS already hides someone else's removed message).
10. `chat_cast_vote(messageId, option_id, user.id, on)` with the service role; SQLSTATE → code by 3.2 (`P0C24` → 404 `not_found`, `P0C25` → 409 `poll_closed`, `P0C26` → 409 `slot_full`, `P0C22` → 400 `invalid_card`); missing function → 404; other → 503.
11. `hydrateCards([{ id: messageId, kind: "poll", user_id }], user.id, { room, blocked })` (5.2) → no card → 503 `try_again` → **`200 { ok: true, card: PollCard }`** (`VoteResponse`, TY:176).

The Event card's Going / Maybe buttons call the EXISTING `PUT` / `DELETE /api/events/[id]/rsvp` (`rsvp/route.ts:130-226`: `requireTermsAccepted`, `rsvpBlocked`, 403 `campus_visiting` off campus unless a member; `{ ok: true }` only); the screen then re-reads that one message with `GET …/messages?after=<its created_at>&limit=1` (`?after=` is `>=` and oldest first, `message-read.ts:743-746`, so the card's own row comes back first) and replaces its `card` (11.8).

## 5. `cardFallbackContent`, `hydrateCards`, `snapshotCard` (W2-B2)

### 5.1 `src/lib/chat/cards/fallback.ts` (pure, tested; imports only `../when`)

```ts
export type FallbackInput =
  | { type: "poll"; question: string }
  | { type: "signup"; question: string }
  | { type: "event"; title: string; starts_at: string; note: string | null };
export const FALLBACK_MAX = 300;
export function cardFallbackContent(input: FallbackInput, zone = CAMPUS_TIME_ZONE): string;
```
`Poll: <question>` · `Sign-up: <title>` · `Event: <title> · <Thu Oct 8, 7:30 PM>` + (` — <note>` when the note is not null). Whitespace collapsed; cut to 300 characters (the 300th replaced by `…` when cut). Never empty (a blank question cannot reach it: 4.2). Old screens, previews, search, the old inbox and reports show this text (`messages.content`).

### 5.2 `src/lib/chat/cards/hydrate.ts` (`server-only`)

```ts
export type CardRow = { id: string; kind: MessageKind; user_id: string; card_event_id: string | null };
export type HydrateOpts = { room: Room | null; blocked: ReadonlySet<string>; now?: Date };
export async function hydrateCards(rows: CardRow[], viewerId: string, opts: HydrateOpts): Promise<Map<string, Card> | null>;
```
- Reads the side tables with the service role, so **it may only be given rows that came out of a viewer-scoped (cookie client) read**, never a service-role page. Rows with `kind === "text"` are skipped. A removed message is not given to it (`buildChatMessages` filters removed rows first, `message-read.ts:533`; the vote route re-reads on the cookie client). `null` = a read failed (logged); the caller answers 503 `try_again` (never a page with a card-less poll). On a database without B (`isMissingChatSchema`): an empty map, warned once.
- Polls: `chat_polls` by `message_id in (…)` (chunks of 100), `chat_poll_options` by `poll_id in (…)` ordered by `position`, `chat_poll_votes` by `poll_id in (…)` ordered by `created_at, user_id`; the voters' `Person`s in ONE `users` read `id, handle, name, avatar_url` (service role; `name`/`handle` are NOT NULL, DM:5.2; `avatar_url` proxied as `toPerson` does, `message-read.ts:478-490`).

| `PollCard` field | computed |
|---|---|
| `type` | `mode` |
| `question`, `anonymous`, `multi`, `closes_at` | the row |
| `closed` | `closes_at !== null && closes_at <= now`, OR `room.kind === "event"` and `roomState(room.event.starts_at, room.event.ends_at, now) === "closed"`. Never true because the viewer cannot post on a Board. |
| `total_voters` | distinct `user_id` over the poll's votes (blocked people included: counts never change, D1) |
| `options[].count` | votes on the option (all of them) |
| `options[].capacity`, `full` | the row; `full = capacity !== null && count >= capacity` |
| `options[].mine` | a vote by the viewer on the option |
| `options[].voters` | `[]` when `anonymous`; else the voters in vote order **minus `blocked`** (8.2): ALL of them for a sign-up; the first 12 remaining for a poll |
| `options[].voters_more` | poll, not anonymous: `count − voters.length − <blocked voters among all>`; i.e. how many more visible people exist beyond the 12 (never counts a blocked person); sign-up and anonymous: 0 |

- Event cards: `chat_event_cards.note` by `message_id in (…)`; `card_event_id` comes on the row (`MessageRow.card_event_id`, `message-read.ts:102`; the vote route never hydrates an event card). `card_event_id` null → `{ type: "event", note, event: null }` (cancelled). Else `event` = `eventRefsFor(<the events' rows>, viewerId)` (5.5) for every event card of the page in one go, from a service-role `events` read `id, title, starts_at, ends_at, location, org_id` where `id in (…)`; an event that cannot be read → `event: null` too, logged.

### 5.3 `src/lib/chat/cards/snapshot.ts` (`server-only`)

```ts
export type CardSnapshot =
  | { type: "poll" | "signup"; question: string; anonymous: boolean; multi: boolean; closes_at: string | null;
      options: { label: string; capacity: number | null; count: number }[] }
  | { type: "event"; event_id: string | null; title: string | null; starts_at: string | null; note: string | null };
export async function snapshotCard(messageId: string): Promise<CardSnapshot | null>;
```
Service role. No voter names, no ids of people. `null` for a text message, a missing card row, or a database without B. **The report route** (`src/app/api/me/reports/route.ts:318-333`, the `message` spec): `columns` becomes `"id,user_id,channel_id,content,media_url,created_at,kind,thread_root_id"`, and after `readTarget` the message snapshot gains `card: await snapshotCard(id)` (only when `kind !== "text"`; else `card: null`). `CardSnapshot` lives in `types.ts` (additive).

### 5.4 Where the card routes and the reads get the pieces they share

- `src/lib/chat/blocks.ts` (`server-only`, W2-B2): `blockedIdsFor(client, viewerId): Promise<Set<string> | null>` — ONE `blocks` read on the viewer's cookie client, `.or("blocker_id.eq.<v>,blocked_id.eq.<v>")` (the `loadHiddenUsers` shape, `hidden-users.ts:30-34`; RLS `blocks_select_either` shows exactly the viewer's pairs, DM:5.1), both directions, the viewer removed; `null` on a failure. Mutes do not hide anything in club rooms.
- `src/lib/chat/stub.ts` (pure, tested, W2-B2): `isHiddenFrom(row: { user_id; thread_root_id }, blocked, room: Room | null, authorRole: ClubRole | null): boolean` and `asStub(row): ChatMessage` (8.1).
- `src/lib/chat/event-refs.ts` (`server-only`, W2-B2), 5.5.

### 5.5 `eventRefsFor` — one `EventRef` builder for every read (`src/lib/chat/event-refs.ts`)

```ts
export type EventRow = { id: string; title: string; starts_at: string; ends_at: string; location: string | null; org_id: string | null };
export async function eventRefsFor(events: EventRow[], viewerId: string, opts?: { now?: Date }): Promise<Map<string, EventRef> | null>;
```
Service role, three reads for the whole list: `rsvps` select `event_id, user_id, status` where `event_id in (…)` and `status in ('going','maybe')` (chunks of 100 events; up to 500 rows per chunk with `count: "exact"`, the counts asked apart past the cap as `readRoomEvent` does, `message-read.ts:940-969`); `channels` select `id, event_id` where `event_id in (…)`; `channel_members` select `channel_id` where `channel_id in (room ids)` and `user_id = viewer`; plus `org_members` select `org_id, role` for the viewer where `org_id in (the events' orgs)`. Then per event: `state = roomState(starts_at, ends_at, now)`; `room_id` = the room's id when the viewer holds a row on it OR is an owner/admin of the club (the rule of `can_view_org_channel`'s event arm, DM:3.6), else null; `viewer_status` from the viewer's own RSVP row; `going_count` / `maybe_count` from all RSVPs; `location` `""` when null. `null` on any failed read. Not `event_rsvp_counts()` (it applies `event_visible` to the caller and the service role has no `auth.uid()`, DM:5.10).

## 6. The officer / mod remove route and `RemovedContentCard` (W2-B3)

### 6.1 `DELETE /api/me/threads/[id]/messages/[messageId]` (`src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, 60 lines today, RM:6)

Not gated by the flag (Franky's call 27 is for everyone; no old screen has a button, so nothing changes with the flag off). Gates, in this order:

1. `await ctx.params`; a non-uuid `[id]` or `[messageId]` → 404 `not_found`. auth → 401 `"Unauthorized"` (as today).
2. **The sender's own delete, unchanged**: the row on the cookie client `id, user_id, channel_id` scoped to `[id]` (`:30-35`); a row with `user_id === user.id` → the hard delete as today (`:50-59`), also for a card (the cascade takes `chat_polls` → options → votes, `chat_event_cards`; for a Board post, its replies) and also when a report is open (12.6 of the wave-1 contract, accepted). Answer `{ ok: true }` as today.
3. A row by someone else, or no row: `ensureMember(supabase, channelId, user.id)` → `!ok` → 403/500 "Not a member". `isOrgChannel === false` (a dm or a group) → 403 `not_allowed` (today's sentence "Only the sender can delete this message" is replaced by the code's sentence; no screen matches on it).
4. `rateLimit("message-remove:<uid>", { limit: 30, windowSec: 600 })` → `tooManyRequests`. `requireNotRestricted(user.id)` → its response.
5. `roomOf(channelId, member)`: `failed` → 503; `room === null` → 404 `not_found` (no chat schema: nothing to moderate).
6. `callerRole = await clubRole(member.orgId, user.id)`; not in `ROOM_MODERATOR_ROLES` → 403 `not_allowed` (**the role check runs before `outranks`**, 14.10).
7. **No row in step 2** (RLS hides someone else's removed message): one service-role read `id, user_id, removed_at` scoped to `[id]`; no row → 404 `not_found`; `removed_at` set → **`200 { ok: true, removed: true, already: true }`** (`RemoveMessageResponse`, TY:313); `removed_at` null with no cookie row = the caller cannot read it (a private room they are not in) → 404 `not_found`.
8. `authorRole = await clubRole(member.orgId, author)` (null when they left); `outranks(callerRole, authorRole) === false` → 403 `not_allowed` (owner 3, admin 2, mod 1, member or gone 0; equal rank allowed, `room-rules.ts:67-71`).
9. An OPEN report on this message: service role `reports` select `id` where `target_type = 'message' and target_id = messageId and status = 'open'` `.limit(1)` (the `openReportCount` shape, `reports/route.ts:419-440`; a missing `status` column → treat every row as open) → any row → 409 `report_open`.
10. Service role: `update messages set removed_at = now(), removed_by = user.id, removed_reason = OFFICER_REMOVED_REASON where id = messageId and channel_id = channelId and removed_at is null` selecting `id`; 0 rows (removed a moment ago) → `200 { ok: true, removed: true, already: true }`; else **`200 { ok: true, removed: true }`**. Never a hard delete. No `moderation_actions` row, no report closed (6.3 of the wave-1 contract; the record is `removed_by` + `removed_at`).

What the old and new readers then see: the author reads their message with `removed: { by: "officer", at, reason: null }` (`removedInfo`, `message-read.ts:497-505`); everyone else stops seeing it (`messages_select_org_member`); replies under a removed Board post stay in the database but `can_post_org_channel` refuses new ones and `?root=` answers 404 `board_post_missing` (`rootState`, `message-read.ts:659-681`); its card is not hydrated (5.2).

### 6.2 `RemovedContentCard` gets `by` (`src/components/safety/ReportSheet.tsx:658-716`)

```ts
by?: "officer" | "moderator";   // default "moderator": every caller today keeps its copy
```
- `by === "officer"`: first line **`Removed by a club officer.`**; no reason line (an officer's `reason` is null); second line **`Only you can see this message.`**; no email, no Community Guidelines link (D9: no appeal path for a club's own moderation).
- `by === "moderator"` (or absent): today's copy, unchanged (`Removed by Vibe moderators`, the reason, `Only you can see this <kind>. Questions: help@connectvibe.app.` + the link).
- The new room thread (11.5) renders `<RemovedContentCard kind="message" compact by={m.removed.by} removedAt={m.removed.at} removedReason={m.removed.reason} />` for `m.removed !== null`. The old `MessageBubble` branch (`MessagesMobile.tsx:4556-4569`, reads `removed_at`, unreachable) stays as it is.

### 6.3 The by-name allow-list guard (D8; `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:105-190`)

Right after `requireChannelStaff` in POST (`:116-117`; `guard.channel.kind` is loaded and never read today, RM:12.1): `kind` in `("board", "lounge", "event")` → 409 `refusalBody("room_locked")`; `officers`, `room` and a null `kind` (no chat schema) → as today. The DELETE of `members/[userId]` is unchanged (removing a meaningless row is harmless). `room_locked` stays the code for a reserved name in the create / rename forms (C4; the sentence `This room can't be renamed, hidden or deleted.` is accepted for v1, open point 14.9).

## 7. The three reads and the calendar fields (W2-B4), field by field

Contract 7's rule, restated: **the cookie client for anything RLS decides** (which rooms I am in, which messages I may read, the club refs), **the service role only for counts** and for what no policy exposes to a member (`org_members` roles of other people, `events`, `rsvps` of others); **never a roster**. Every count filters `removed_at is null` and `thread_root_id is null`. A null `last_read_at` is read as the row's `created_at` (legacy rows only: A wrote `last_read_at = now()` on every row it made, DM:5.4). A failed cookie read that decides visibility → 500 `{ ok: false, error: "Request failed" }` (fail closed, like the threads route `:507-541`); a failed service-role count → that field at its empty value (0 / false / null) and logged, never a 500.

### 7.1 `GET /api/me/inbox` (`src/app/api/me/inbox/route.ts`) → `InboxResponse` (TY:355)

Gates: auth 401 → `chatV2For` 404 `not_found`. Then, in order:
1. **My rooms** (cookie): `channel_members` select `channel_id, last_read_at, pinned_at, muted_until, channels!inner(id, org_id, kind, name)` where `user_id = me` and `channels.org_id not null` (the threads route's read, `threads/route.ts:436-451`, with the same no-`kind` retry → a database without A answers `{ ok: true, clubs: [] }`). Group by `org_id`; a club with no `board` or `lounge` row for me is left out (the after-deploy check would list it).
2. **Club refs** (cookie): `orgs` select `id, handle, name, logo_url, banner_url, verified` where `id in (…)` → `OrgRef` with `orgAssetProxyUrl` (`threads/route.ts:529-536`). **My roles** (cookie): `org_members` select `org_id, role` where `user_id = me` → `viewer_role` (a club with no role row is left out).
3. **Blocked ids** (cookie, 5.4): `blockedIdsFor` → null → 500.
4. **Previews** (cookie, one read): `messages` select `id, content, created_at, user_id, kind, thread_root_id, users(name)` where `channel_id in (<all board + lounge ids>)` and `thread_root_id is null`, order `created_at desc`, `limit(ids.length * 5)` (the threads route's window, `:661-693`). Per room, the newest row that is not a stub for me: a Board row by a blocked author counts when that author is a CURRENT owner/admin of the club (8.3; one service-role `org_members` read `org_id, user_id, role` for the blocked authors met, when any). `Preview = { id, text: content, author_name: users.name ?? "", created_at, kind }`. Nothing within the window → `latest: null` (a room busier than 5 messages from blocked people in a row shows null; accepted).
5. **Unread** (service role, counts): per Board: `messages` `count: "exact", head: true` where `channel_id = board and thread_root_id is null and removed_at is null and user_id <> me and created_at > <my last_read_at ?? my row's created_at>` → `board.unread = count > 0`; per Lounge the same → `lounge.unread_count = min(count, 99)`. Blocked people's messages count (D1: counts unchanged). Two head counts per club; clubs per member are few (production: 5 clubs in all).
6. **`next_event`** (service role): `events` select `id, title, starts_at, ends_at, location, org_id` where `org_id in (…)` and `ends_at > now()` order `starts_at asc` → the first per club → `eventRefsFor` (5.5) → `next_event: EventRef | null`.
7. **`last_activity_at`**: the newest `created_at` among `board.latest`, `lounge.latest` and, for the event rooms I hold a row on (step 1, `kind = 'event'`), one cookie read `messages` select `channel_id, created_at` where `channel_id in (<event room ids>)` and `thread_root_id is null` order desc `limit(ids.length * 3)`, newest per room. Null when all three are null. NOT `orgs.last_activity_at`.
8. **`pinned_at`, `muted_until`**: from my Lounge row (step 1). `muted_until` is sent but changes no rendering in v1 (open point 14.22).
9. **Order**: `pinned_at` not null first (newest pin first), then `last_activity_at` desc (nulls last), then `org.name`.

### 7.2 `GET /api/orgs/[slug]/space` (`src/app/api/orgs/[slug]/space/route.ts`) → `SpaceResponse` (TY:378-390)

Gates: auth 401 `{ ok: false, error: "Unauthorized", code: "unauthorized" }` → `chatV2For` 404 `not_found` → **the channels-list sweep, copied** (`channels/route.ts:41-95`, RM:13.2): service-role `orgs` select `id, handle, name, logo_url, banner_url, verified, hidden_at` by `handle = slug` → missing → 404 `not_found`; service-role `org_members.role` for me → error 500 `load_failed`; no role → `hidden_at ? 404 not_found : 403 refusalBody("members_only")`. Then:
1. `org`: `OrgRef` + `member_count` = service-role `org_members` head count (`orgs/[slug]/route.ts:278-281`; a failed count → 0).
2. `viewer`: `{ role, can_moderate: canModerate(role) }`.
3. **`rooms`** (cookie): `channels` select `id, kind, name, event_id, position` where `org_id = org.id and type = 'org_channel'` — RLS (`can_view_org_channel`) leaves out Officers unless I may enter it, and event rooms I hold no row on unless I am an officer. My `channel_members` rows for those ids (cookie: `channel_id, last_read_at`). Per room: `unread` = the service-role head count of 7.1.5 `> 0` (for `event`, `officers` and `room` kinds too); `can_post` = `board` → `viewer.role in BOARD_POSTER_ROLES`; `event` → `roomState(...) !== "closed"`; else `true` (a TypeScript rule as the list's, `threads/route.ts:789-803`; the thread GET's `viewer.can_post` is the database's answer and wins on the screen); `event` = `eventRefsFor` over the event rooms' events (one call) → `EventRef | null` (`room_id` = the room's own id: I can read it). **Order**: `lounge`, `board`, `officers`, event rooms with `state !== "closed"` by `starts_at` asc, then `room`s by `position` then `name`; closed event rooms are left out (they are reachable by URL, 2.3, but take no chip).
4. **`board_latest`** (cookie): `messages` select `MESSAGE_SELECT` where `channel_id = board and thread_root_id is null` order desc `limit 6`, then `toChatMessages(supabase, rows, { channelId: board, viewerId, room: <the Board's Room>, skipReplyCounts: false })` (9.1 gives cards, stubs and `reply_count`); the first message that is not `hidden` → `board_latest`; none → null.
5. **`up_next`** (service role): `events` where `org_id = org.id and ends_at > now()` order `starts_at asc` limit 3 → `eventRefsFor` → `EventRef[]` (soonest first; `viewer_status` null when I did not RSVP — the card then shows no mark, 1.2).

### 7.3 `GET /api/me/calendar` — the three fields (`src/app/api/me/calendar/route.ts:56-138`; NOT gated)

- The RSVP select gains `org_id`: `event:events!inner(id,title,starts_at,ends_at,location,org_id, org:orgs(handle,name,verified))` (a plain column, cookie client; `org` stays the RLS embed, null for a private club I left, RM:8).
- After the rows: `flagOn = await chatV2For(user.id)`. Flag off → every `rsvp` entry gets `org_id: null, room_id: null, room_state: null` (`CalendarRoomFields`, TY:362-366). Flag on → `eventRefsFor(<the rsvp events>, user.id)` (service role, 5.5) → `org_id: ev.org_id`, `room_id: ref.room_id`, `room_state: ev.org_id ? ref.state : null`. A failed `eventRefsFor` → the three fields null on every entry and one log line; the calendar never answers 500 for them. `personal` entries are untouched. The `color` field and everything else stay as today (desktop "My Calendar" reads this route).

## 8. Blocking in club rooms (D1, D2): the stub, and every place a block applies

Franky (Sept 29, W0 `:56`): **both ways**; when either of two people blocked the other, neither sees the other's messages in club rooms, nor the other's name in polls, sign-ups and "who's going"; counts do not change; **one exception: a top-level Board post by a current officer shows to every member**. The B0 reviewers' worry (a relayed sentence without the exception) is answered by that later call (BN:8); it stays an open point (14.1) so Franky can strike the exception.

### 8.1 The stub (the exact shape; `asStub(row)` in `src/lib/chat/stub.ts`)

```ts
{ id, created_at, thread_root_id,           // the three fields the screens key and page on, unchanged
  kind: "text", hidden: true, content: "", user_id: "", users: null, card: null, reactions: [],
  attachment: null, attachment_id: null, attachment_kind: null, media_url: null, media_kind: null,
  parent_message_id: null, parent_preview: null, reply_count: null, author_role: null, removed: null }
```
It fits `ChatMessage` as typed today (`content: string`, `user_id: string`, `users: Person | null`, TY:231-272); no type change. `kind` is always `"text"` on a stub (a card's kind would say what the hidden thing is). `thread_root_id` is kept so a reply stub folds under the right post and `?root=` paging stays stable; `created_at` so `?after=` paging and the every-5th drop rule (9.3) work. Screens render nothing for a stub and keep it in the array.

### 8.2 The rule (`isHiddenFrom`, pure)

```
hidden = blocked.has(row.user_id)
     && !(room?.kind === "board" && row.thread_root_id === null && authorRole ∈ BOARD_POSTER_ROLES)
```
`blocked` = `blockedIdsFor(cookie client, viewerId)` (5.4). `authorRole` = the author's CURRENT role from the page's `org_members` read (`readRoles`, `message-read.ts:354-374`, already one read per page); a demoted officer's old Board posts become stubs (the exception is for club news from today's officers). The viewer's own rows are never stubs (`blocked` never holds the viewer).

### 8.3 Every place it applies (all in wave 2, flag-independent where the route is not gated)

| where | rule |
|---|---|
| `GET …/messages` (top-level page, `?after=`, `?before=`, `?root=` replies) | each row → `asStub` when hidden (9.1); a reply under a Board post by a blocked officer is a stub too (the exception is top-level only) |
| `parent_preview` of a visible message | null when the parent's author is blocked and the parent is not an excepted Board post (never quote a blocked person) |
| `reply_count`, reactions counts, `going_count`, `maybe_count`, `total_voters`, `options[].count`, `unread`, `unread_count` | **unchanged** (D1) |
| `room.event.going` (`readGoing`, `message-read.ts:881-922`) | blocked ids are left out at the per-step filter (`candidates = step.filter(id => members.has(id) && !blocked.has(id))`), and the next room member going takes their place: still "the first 8 visible" |
| `PollCard.options[].voters`, `voters_more` | 5.2 |
| `POST …/cards` 201, `PUT …/vote` 200 | read back on the viewer's client with the viewer's block set (a card is never hidden from its author) |
| `GET /api/me/inbox` `board.latest`, `lounge.latest` | skip stubbed rows; the Board's officer exception applies (7.1.4) |
| `GET /api/orgs/[slug]/space` `board_latest` | the first non-hidden of the latest 6 (7.2.4) |
| the old screens (12.1) | skip `hidden: true` rows; nothing else |
| the new screens | render nothing; keep the row in state; a stub never counts for "Say hi" emptiness (a room of stubs shows the empty line) |

### 8.4 What a block does NOT do in v1

- It does not change `channel_members` (both keep their rooms), the roster of a group chat, or a poll's counts.
- It does not hide the person's **name on a Board post** they wrote as an officer (the exception), nor their vote from the count.
- It does not hold against a direct PostgREST read (D2, 8.7).
- Reactions BY a blocked person on a visible message still count and still show their emoji (reactions carry no name in the JSON, `ReactionGroup`, `reaction-emoji.ts:48-52`).

### 8.5 The DM path is unchanged

`dmSendBlocked` (`pair-block.ts:154-173`) and the dm INSERT policy still refuse a send between blocked people; the old inbox still skips a 1:1 with a blocked peer (`threads/route.ts:732-738`). Club rooms never asked about blocks before wave 2 (`messages/route.ts:415-417`), and a send into a club room is still not refused by a block (both keep posting; each stops seeing the other).

### 8.6 Why the stub applies with the flag OFF too (open point 14.12)

The App Store submission is Oct 16 and Apple's reviewer is not on the allow-list; the reviewer tests Block (plan-critique `:231`). If stubs were gated by `chat_v2`, a blocked person's club-room messages would still show to the reviewer. So the thread GET stubs for everyone, and the four old renderers get the one-line skip of 12.1. This is the ONE thing wave 2 changes for everyone with the flag off. The alternative (gate it) is written in 14.12.

### 8.7 Against a direct database read: NOT in v1 (D2), written down for after launch

Today a member with the anon key and their JWT reads every non-removed message of every room they can view, blocked authors included (`messages_select_org_member`, DM:7); the routes are the app's only readers; before the block both people were club members and could read each other; `messages_select_org_member` is the hottest policy (A's COST section) and every change to it is B1a-style work that cannot be rehearsed in the cloud. After launch, its own migration restates the policy with this arm (the B1a security review's F6b clause, DM:7):

```sql
AND (NOT public.is_blocked_either_way(auth.uid(), user_id)
     OR (thread_root_id IS NULL AND EXISTS (
           SELECT 1 FROM public.channels c2
             JOIN public.org_members m ON m.org_id = c2.org_id AND m.user_id = messages.user_id
            WHERE c2.id = messages.channel_id AND c2.kind = 'board' AND m.role IN ('owner', 'admin'))))
```
`is_blocked_either_way` is callable from a policy under `authenticated` because its first argument is the caller (`20260928100000:353-354`). That file also restates `message_reactions_select_member` (reactions of a stubbed message). It does not touch `channel_members` (the roster is the going list, by design).

## 9. What wave 2 changes in the thread GET (`message-read.ts`, `messages/route.ts`; W2-B2)

Additive only. The payload of 6.1 of the wave-1 contract is unchanged in shape.

### 9.1 `buildChatMessages` (`message-read.ts:531-583`)

`MessageContext` gains `blocked?: ReadonlySet<string>` (when absent the caller reads it: `readChatMessages` and `readChatMessage` call `blockedIdsFor(client, viewerId)` first; `null` → 503 `try_again`). In the `Promise.all` at `:541-546`: the roles read, `readReplyCounts` (9.4), reactions, parent previews, **and `hydrateCards(cardRows, viewerId, { room, blocked })`** over the page's rows with `kind !== "text"` that are not hidden (the roles are needed for `isHiddenFrom`, so: roles first, then the stub decision, then hydrate and the rest in parallel). `null` from hydrate → `complete: false` → 503. At `:574`: `card: cards.get(row.id) ?? null`; at `:578`: `hidden` by 8.2, and a hidden row is replaced whole by `asStub(row)`. `parent_preview` nulled by 8.3.

### 9.2 `?after=` that is not a timestamp → 400 `invalid_after`

Both places: `readChatMessages` (`message-read.ts:709-713`: `failed(400, "Invalid after")` → `refusal("invalid_after", 400)`) and the route's own check (`messages/route.ts:112-118`) answer `refusalBody("invalid_after")` with 400. `cleanAfterParam` itself is unchanged. `?before=` stays as today (no code).

### 9.3 The polling rule the screens follow (contract 6.1, D7; nothing new in the route)

- `?after=<the created_at string the server sent, echoed unchanged>` every 4 s while `document.visibilityState === "visible"`; the client drops ids it already has.
- **Every 5th poll and on return from the background: the last page WITHOUT `after`** (`?limit=50`), then `mergeFullPage(state, page)` (pure, tested, `src/lib/chat/page-merge.ts`, W2-S2): rows in the page replace rows in state by id (votes, RSVP counts, reactions, reply counts, removals, stubs); a row in state whose `created_at >= page[0].created_at` (the page's oldest) and whose id is not in the page is dropped (deleted or removed since); rows older than the page's oldest stay; `room` and `viewer` are taken from this read only.
- No `?brief=` switch in v1: the route keeps computing `room` / `viewer` on every call (C1; the 4-s polls ignore them). The cost is 9–13 PostgREST calls per club-room read (BN:3, B4 F2); clubs are tiny; a switch is an after-launch item (open point 14.23).
- `?before=<oldest created_at>&limit=50` for earlier history; never with `after` or `root` (B4 F4).

### 9.4 `readReplyCounts` calls `chat_reply_counts`

`message-read.ts:390-438`: first `service.rpc("chat_reply_counts", { p_channel, p_roots: chunk, p_viewer: viewerId })` per chunk of 100 post ids; rows → the map, missing roots 0; `isMissingChatSchema(error)` (`PGRST202` / `42883`) → the wave-1 walk as it is today, warned once; any other error → `null` (the caller answers 503, as today). `readChatMessage` keeps `skipReplyCounts` unset (a Board card read-back carries its count).

### 9.5 Cards on a Board, replies under cards

A poll or an Event card may be a top-level Board post (an officer's) and gets `reply_count`; members reply under it as under any post (3.8.4). `?root=` rows may be stubs (8.3). The send route (`POST …/messages`) is unchanged: a text reply under a card root passes `rootState` (`message-read.ts:659-681`, checks `thread_root_id` and `removed_at`, not `kind`).

## 10. The split (W2-S, ALONE, first; D6, plan-critique #11)

**Extraction only. No behaviour change.** Every declaration of `src/components/mobile/MessagesMobile.tsx` (the table at MM:1.1, ranges computed mechanically) moves WHOLE — its doc comment with it — into one file under `src/components/mobile/messages/`, unchanged modulo whitespace, the added `export` keyword and import lines. Single-consumer declarations stay in their consumer's file. Every new `.tsx` (and `theme.ts`) starts with `"use client"`. Named exports only; no default export anywhere (MM:H2). The `React.` namespace in type position stays as written (it compiles through `@types/react`'s UMD namespace; rewriting it would fail the identical-text check, MM:H3). `isolatedModules` is on: a type re-export needs `export type { … }`; none is needed (MM:H4).

### 10.1 File plan (source lines are today's, MM:1.1)

| new file | moves | exports | imports it needs |
|---|---|---|---|
| `messages/types.ts` | `ThreadType` :55, `ThreadPeer` :57-63, `ThreadMember` :65-71, `ThreadEntry` :73-108, `MessageReaction` :110-114, `MessageAttachment` :116-131, `ParentPreview` :133-148, `MessageRow` :150-185, `Tab` :211 | all (types) | `type RoomKind` from `@/lib/chat/types` |
| `messages/theme.ts` | `subscribeTheme` :224-227, `useNightTheme` :219-235 | `useNightTheme` | `useSyncExternalStore`; `currentTheme, THEME_EVENT` |
| `messages/sheet-styles.ts` | `vaulOverlayStyle` :237-242, `vaulContentStyle` :244-256, `vaulHandleStyle` :258-264, `visuallyHiddenStyle` :265-278 (+ comments :213-218) | all four | none |
| `messages/format.ts` | `relativeTime` :282-295, `initialsOf` :297-305, `threadTitle` :307-310, `threadAvatar` :312-323, `quotedBody` :325-340, `entryCanPost` :359-368 | all six | `type ThreadEntry, type ParentPreview` from `./types` |
| `messages/send-failure.ts` | `chatRefusalLine` :342-351, `toastSendFailure` :353-357 | both | `REFUSAL_SENTENCES, type RefusalCode`; `type VibeFailure`; `toast` |
| `messages/ThreadList.tsx` | `TabPill` :753-808, `ThreadRow` :810-951, `ListSkeleton` :953-998, `EmptyState` :1000-1053 | all four | `Link`; `./types`; `./format` |
| `messages/ConversationView.tsx` | `ATTACH_ACCEPT`…`MAX_VIDEO_BYTES` :189-197 (private), `StagedMedia` :199-205, `ReplyTarget` :207-209, `ConversationView` :1057-2338 | `ConversationView` | as MM:10 lists |
| `messages/sheets.tsx` | `SheetRow` :2718-2782, `MuteDurationSheet` :2784-2832 | both | `Link`; `Drawer`; `./sheet-styles` |
| `messages/ConversationActionSheet.tsx` | `ConversationActionSheet` :2342-2716 | it | `./sheets`, `./sheet-styles`, `./types`, `ReportSheet` |
| `messages/GroupSettingsView.tsx` | `GroupSettingsView` :2836-3353, `MemberRow` :3355-3518 (private), `MemberActionSheet` :3520-3590 (private) | `GroupSettingsView` | `./sheets`, `./theme`, `./format`, `./ComposeOverlay` |
| `messages/ComposeOverlay.tsx` | `SearchUser` :3594-3601 (private), `ComposeOverlay` :3603-3883, `ComposeUserRow` :3885-3966 (private) | `ComposeOverlay` | `./theme`, `./format`, `ListSkeleton` from `./ThreadList` |
| `messages/MessageBubble.tsx` | `MessageBubble` :3968-4751 | `MessageBubble` | `Link`; `RemovedContentCard`; `./types`; `./format`; `./ReactionPicker` |
| `messages/ReactionPicker.tsx` | `REACTION_EMOJIS` :187 (private), `swallowNextClick` :4752-4778 (private), `ReactionPicker` :4780-4965, `pickerRowStyle` :4967-4985 (private) | `ReactionPicker` | `./types` |
| `MessagesMobile.tsx` (stays) | `"use client"`, the header comment :32-51, `LIST_RESYNC_MS` :372-374, `MessagesMobile` :376-749 | `MessagesMobile`, and `export { ConversationView } from "./messages/ConversationView";` | `./messages/{types,theme,ThreadList,ConversationView,ComposeOverlay}` |

The two importers need no edit: `src/app/messages/MessagesSwitch.tsx:4` (`MessagesMobile`) and `src/components/mobile/CampusMobile.tsx:37` (`ConversationView`, including the type-level `Parameters<typeof ConversationView>[0]["thread"]` at `:2471`). Import graph after the split has no cycle (MM:10). Nothing under `messages/` imports `MessagesMobile.tsx`.

### 10.2 Rules

1. No line of logic changes: no renamed prop, no reordered hook, no merged component, no new prop, no fixed lint error, no touched literal. The boolean `vibe-composer-open` body class (MM:9) is pre-existing and stays.
2. Section banners (`// ---------- Types ----------`, …) may be dropped or kept; the checker ignores comment-only lines.
3. The old lint errors move with their code (`481`, `534` stay in `MessagesMobile.tsx`; `3669` → `ComposeOverlay.tsx`; the `setPhotoUrl` warning → `GroupSettingsView.tsx`). The gate compares per rule and per declaration, not per file (MM:7): a new file carrying an old error is not a new error.
4. `ListSkeleton`, `SheetRow`, `MuteDurationSheet`, the four vaul styles, `useNightTheme`, `initialsOf` have ONE home each (MM:H8).
5. After the split, W2-S1 alone edits `MessagesMobile.tsx` (the flag fork, the deep links); new screens go in NEW files under `messages/home/`, `messages/club/`, `messages/cards/`, `messages/compose/`; W2-S2 may add ONE optional prop to `MessageBubble` and `ReactionPicker` (`onRemove?`, 11.5) — the only edit to a moved file in wave 2, and it leaves the old `ConversationView` unchanged.

### 10.3 Proof (the gate of W2-S; all four must pass)

1. `npm run typecheck` exit 0. 2. `npm test` 1,374 green (no test imports the file, MM:H14, so this proves the repo, not the split). 3. `npx eslint src/components/mobile/MessagesMobile.tsx src/components/mobile/messages/*.ts src/components/mobile/messages/*.tsx`: the same rule hits as `git show HEAD~1:src/components/mobile/MessagesMobile.tsx | npx eslint --stdin --stdin-filename src/components/mobile/MessagesMobile.tsx` (3 errors, 1 warning, MM:7), no new one. 4. **`node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base <the commit before the split>`** exit 0: MISSING, CHANGED, DUPLICATE all empty (it keys every top-level statement by name with the TypeScript compiler API, strips `export` and leading JSDoc, collapses whitespace, ignores imports, `export … from`, `"use client"`; ADDED is expected to list nothing but re-exports). The output is saved to `handoffs/chat-redesign/wave-2-build/S-split-check.txt`.

## 11. The screens (phone, 375px, Light and Night, behind `chat_v2`)

### 11.0 Shared rules for every new screen

- **Files**: `src/components/mobile/messages/home/*` (W2-S1), `messages/club/*` (W2-S2), `messages/cards/*` and `messages/compose/*` (W2-S3), `messages/v2-tokens.ts` (W2-S1, first commit). New files only; inline styles like the rest of the file (no `className`, MM:6); fonts `Fraunces, serif` for titles and `DM Sans, sans-serif` for body via two constants `SERIF` / `FONT` in `v2-tokens.ts` (not the 56 literals of the old file).
- **Tokens** (`palette(night: boolean)` in `v2-tokens.ts`; MK:0.1 for every literal): page `var(--cream)`; ink `var(--charcoal)`; secondary `var(--ink-2)`; muted `var(--ink-muted)`; surface `var(--paper)`; hairline `var(--hairline)`; coral `#FF5C35`; **coral text** `night ? "#FF8A66" : "#C8401E"`; coral button `linear-gradient(180deg, #FF7B4A, #FF5C35)` with ink `#140806`; active chip `night ? { bg: "#F6F1EA", ink: "#0C0B0B" } : { bg: "#141416", ink: "#FAF7F2" }`; ring grey `#6E6862`; live-card chrome, quiet-card chrome, picked / unpicked option chrome, bloom: the two columns of MK:0.1. The mockups' Light ink literals (`#141416 / #4A4541 / #6B645C`) are NOT adopted; the app's Light tokens stand in (MK:16.2). Contrast: the quiet lines and refusal copy at ≥ 4.5:1 in both themes (B5 F1: `--ink-2`, never `--ink-muted`, for a sentence).
- **Theme**: `useNightTheme()` from `messages/theme.ts`; nothing white-flashes in Night (`body`/page background from the token).
- **States, every screen**: a skeleton on first load (the `ListSkeleton` shape: discs + bars in `rgba(var(--scrim-rgb),0.06/0.08/0.05)`); an empty state (11.9 or the room's empty line); a first-load failure → `LoadFailed` (`@/components/feedback/LoadFailed`, `asLoadFailure(r, "<line>")`, `onRetry`) IN PLACE of the failed part, the rest of the screen staying; a refetch failure keeps the rows and stays quiet (the `LoadFailed` file's own rule). Every refusal toast goes through `toastSendFailure` / `chatRefusalLine` (`messages/send-failure.ts`): the code's sentence, never "Request failed".
- **Layout**: 375px wide with 12–16px gutters, no horizontal scroll; the widest fixed element is the 292px card (fits: 375 − 12 − 8 − 28 − 12 = 315, MK:0.1); touch targets ≥ 44px (pills of 30–36px inside a 44px wrapper); the tab bar (`MobileShell`, 64px + safe area) is hidden while a club space or a conversation is open through the existing `body.vibe-composer-open` class (MM:9); the composer sits above `env(safe-area-inset-bottom)`; inputs are **16px** (iOS zoom guard, `MessagesMobile.tsx:2224-2226`), not the mockups' 15px.
- **Accessibility** (contract 7 of wave 1, MK:14): Going / Maybe / Live / Soon / picked differ by shape AND label, never colour alone; a poll's options are a **radio group** (`role="radiogroup"` + `role="radio"` `aria-checked`), checkboxes (`role="checkbox"`) when `multi`; a sign-up's rows are buttons with full labels; count changes are announced through ONE `aria-live="polite"` region per card (1.2); every icon and avatar `aria-hidden` with the name in the row's label; sheets `role="dialog" aria-modal="true" aria-labelledby`; the state pill `role="status"`; focus moves into a sheet on open and back to the "+" on close.
- **Not in v1, every screen**: month sheet, week swiping, search, mute/pin from the new screens (the old `ConversationActionSheet` is not mounted by the new views), typing, "seen by", photos in club rooms (no attach button in club rooms: `club_media_off`), custom-room creation or renaming, notification settings.

### 11.1 Messages home (`home/MessagesHome.tsx`, W2-S1) — W0_Home

- **Route**: `/messages` with the flag on (2.1); filters from `?tab=` (2.3).
- **Reads on mount, in parallel**: `GET /api/me/threads?scope=chats` (dms, groups, `requests`; `threads/route.ts:426`), `GET /api/me/inbox` (7.1), `GET /api/me/calendar?from=<Monday 00:00>&to=<Sunday 23:59:59>` (device zone; `rsvp` entries + `CalendarRoomFields`, 7.3). **Polling**: the first two every 30 s while visible and on return to visible (at most once per 30 s, the `LIST_RESYNC_MS` rule); the calendar on mount and on return to visible at most once per 5 min. Also after closing a club space or a conversation (the old `refetchThreads` habit).
- **Layout, top to bottom**: header 52px (`Messages` 30px/800 Fraunces, the pencil 44px; no search); **Your week** (11.2, 150px, or the 126px empty line); the filter row 45px (`role="tablist"`: All · Chats · Clubs · Requests with the counts); the list; the 36px bottom fade; the tab bar.
- **The list**: `All` = clubs and dm/group threads merged, **pinned first** (club `pinned_at`, thread `pinned_at`; newest pin first), then by recency (`InboxClub.last_activity_at` vs `ThreadEntry.last_message.created_at`; a null sorts last); `Chats` = dm/group only; `Clubs` = clubs only; `Requests` = `requests` (today's rows). Club rows (`home/ClubRow.tsx`, 1.2): 48px avatar (`logo_url` or initials on `clubGradient(org.id)`), the name 16.5px/800 Fraunces, the time (`rowTime(last_activity_at)`), the preview line (Board unread → dot + `Board: …`; else Lounge `Author: …`; else `Board: …`; else nothing), the chip line (`next_event`: `Live now · <title>` when `state === "live"`, else `<Sat> · <title>`; + `Going` / `Maybe` mark from `viewer_status`; `N new` from `lounge.unread_count` at the right). Tap → the club space (11.3) on the Lounge (`?channel=<lounge.room_id>`), or on the Board when `board.unread` and the Lounge has nothing new. Person / group rows: today's `ThreadRow`, unchanged; tap → `ConversationView` (unchanged, `key={threadId}`).
- **The All pill's badge**: unread dm/group threads (today's rule) + clubs with `board.unread || lounge.unread_count > 0`; `99+` cap.
- **States**: skeleton until BOTH `threads` and `inbox` answered (the week has its own skeleton, three grey 142×64 cards); `inbox` failing alone → `LoadFailed` (`Couldn't load your clubs.`) in the list's club position while threads still list; both failing → one `LoadFailed`; Clubs filter with `clubs: []` → 11.9.2; Chats / Requests empty → today's `EmptyState`.
- **Not in v1**: search, mute/pin/hide from the new list (the old list keeps them with the flag off), swipe actions, a badge on the tab bar.

### 11.2 Your week (`home/YourWeek.tsx`, W2-S1) — W0_Home top, W0_EmptyWeek

- **Data**: the calendar's `rsvp` entries between Monday and Sunday of the device's current week (`weekRange(now)`, 1.4); `viewer_status`, `starts_at`, `ends_at`, `title`, `org.name` (null for a private club I left: the card then shows no club line), `room_id`, `room_state`.
- **Day strip** (`<nav aria-label="Your week, October 5 to 11">`): seven 44×44 buttons, weekday 10.5px/600, day number 15px/700, a 5px dot: coral = at least one `going` that day, grey = `maybe` only, none otherwise; today `aria-current="date"` with the raised chrome; past days muted. **Tapping a day scrolls the card row to that day's first card** (no day sheet in v1); a day with nothing does nothing. Labels per 1.2.
- **Card row** (`role="group" aria-label="Event rooms you RSVP'd to this week"`): horizontal scroll, 142×64 cards, sorted by `starts_at`; the live one (`room_state === "live"`) gets the live chrome and the bloom (the bloom is drawn only when a live card exists); a card is a link to the room when `room_id !== null` (→ the club space with that event chat active, `?channel=<room_id>`); with `room_id === null` (flag off cannot happen here; a non-member RSVP, or a club I left) the card is a plain tile with the same text and no link. `ends_at` past → still shown this week with `Ended` in place of the time (`room_state === "after"`) and the link kept.
- **Empty** (no `rsvp` entry this week): no bloom, every dot transparent, the 44px line `Nothing on your week yet.` + `Find events` (11.9.1).
- **Failure**: `Couldn't load your week.` in the card row's place (`LoadFailed compact`), the strip still drawn.
- **Not in v1**: swiping weeks, "This week" jump, the month sheet, `18 going` on a card, a day sheet.

### 11.3 The club space (`club/ClubSpace.tsx`, W2-S2) — W0_Club, W0_Club_Light

- **Opened by**: a club row tap, a week card, `?channel=<id>` (2.3). Props: `{ orgHandle: string; initialRoomId: string | null; onClose(): void }`. It is a full-screen view above the home (a `Drawer.Root direction="right"` like `ConversationView`, `MessagesMobile.tsx:1567-1592`, so the slide and the `vibe-composer-open` body class come free).
- **Reads**: `GET /api/orgs/<handle>/space` (7.2) on open, on return to visible, and on every 5th poll tick of the open room (9.3); the open room's thread through the polling hook (11.5). A deep link with only a room id opens the room first (the thread GET's `room.org.handle` names the club) and the space read follows.
- **Layout, top to bottom**: header 52px (Back 44px circle, the 40px club avatar, `<h1>` name 20px/800 Fraunces one line, `Your hat: … · N members`, the club-page link button); **Up next** (`club/UpNext.tsx`; `up_next`, max 3, a 2-column grid of 50px cards: line 1 `eventTime` + the RSVP mark, line 2 the title + the `Soon` ring mark on `state === "soon"`, the live chrome on `live`; tap → that event chat when `room_id !== null`, else nothing; the block is left out when `up_next` is empty and the viewer is a member; the officer's empty club shows the dashed button, 11.9.3); **room chips** (`club/RoomChips.tsx`, 45px `<nav>`: `rooms` in the server's order; `aria-current="page"` on the open one; the Board's dot from `rooms[board].unread`; every chip a 44px hit area); **the Board strip** (`club/BoardStrip.tsx`, 44px, shown on every room but the Board when `board_latest !== null`: `Board · <Author> · <text>` with the text = `content` (a card's fallback), the dot from `rooms[board].unread`; tap → the Board chip); **the room** (the Board 11.4, or the thread 11.5, or the event chat 11.6); **the composer** (`club/RoomComposer.tsx`, 64px: the "+" 44px, the 44px pill input, the 44px gradient send; hidden behind the quiet tile when `viewer.can_post === false`: the Board's member tile (1.2) or `This chat is closed.`; the "+" is shown only when `viewer.can_post` (cards go through `can_post_org_channel`)).
- **The role word** = `viewer.role` → `Owner` / `Officer` / `Mod` / `Member`.
- **States**: a skeleton of the header + chips + three bars until the space read answers; the space read failing → `LoadFailed` (`Couldn't load this club.`) with Back still working; 403 `members_only` / 404 → `LoadFailed` with `retryable: false` and its sentence (a club I left while the space was open: the next space read's 403 closes the view with the toast `Members only.`).
- **Bloom**: `rgba(255,92,53,0.36) → 0.13 → 0` behind Up next in Night, `0.22 → 0.08 → 0` in Light (MK:0.1), only when `up_next` has a `live` or `soon` event.
- **Not in v1**: pinning / muting a club from here, the member list (the `N members` text is not a button), custom rooms UI, a club switcher.

### 11.4 The Board with folded replies (`club/BoardView.tsx`, `club/BoardPost.tsx`, W2-S2) — W0_Board

- **Read**: the polling hook (11.5) on the Board's id: the default club-room read returns top-level rows only (`thread_root_id is null`, `message-read.ts:741`), **shown newest first** (the hook keeps oldest-first state; the view reverses for display; `reply_count` on each). Posts are `<article>`s top-anchored: byline (28px avatar, name 13.5px/700, the role word from `author_role`, the time `rowTime`), the body 15px/500 `text-wrap: pretty`, a card when `kind !== "text"` (11.8, full width inside the post), then the replies toggle.
- **Replies toggle** (44px `<button aria-expanded>`): `N replies` from `reply_count` (`Reply` alone when it is 0, so anyone can start), the chevron, `Replies stay quiet` at the right. Open → `GET …/messages?root=<postId>&limit=200` once (oldest first; a stub renders nothing); re-read on every 5th tick while open; rows: 22px avatar + `<b>Name</b> text` 13px/18px; a reply that is a card cannot exist (cards are top-level only). Under the rows the reply field (44px pill `Reply quietly`, a 44px send): `POST …/messages` with `{ content, thread_root_id: postId }`; on 200 append the returned message; `board_post_missing` (409) → toast + the post is dropped from the list (the next full read confirms); `thread_root_not_allowed` cannot happen from here.
- **Composer**: officers see the `Everyone in <club> sees this` line above the composer (`Post to the Board`); members see the quiet tile (1.2). A refused send (`board_officers_only`, a demotion mid-session) → the toast and `can_post` false until the next full read.
- **New posts**: a `?after=` row is inserted at the top (newest first); it carries its own `reply_count` (the route sends one on every top-level Board row, 9.4).
- **States**: skeleton (three post-shaped blocks); empty → `Nothing on the Board yet.`; failure → `LoadFailed` in the list's place.
- **Not in v1**: a per-post `New` mark (14.17), repliers' avatars in the folded state (14.18), editing, pinning a post, `seen by`, notifications for posts or replies (an @mention inside a reply still notifies that one person: the send route, unchanged).

### 11.5 The Lounge / room thread and the polling hook (`club/RoomThread.tsx`, `src/lib/chat/use-room-poll.ts`, W2-S2) — W0_Club

- **`useRoomPoll(roomId, { enabled })`** returns `{ messages: ChatMessage[] | null; room: ThreadRoom | null; viewer: ViewerInRoom | null; viewerId; failure: LoadFailure | null; loadEarlier(); refreshOne(createdAt); append(message); replaceCard(id, card); reload() }`. On mount: `GET /api/me/threads/<id>/messages?limit=50` (no `after`); then the 9.3 schedule: `?after=<cursor>&limit=200` every 4 s while visible (`cursor` = the newest `created_at` seen; before any row exists the tick is a full read), every 5th tick and on `visibilitychange` → visible a full read merged with `mergeFullPage`; polling pauses while hidden. Only the full reads update `room` / `viewer`. `loadEarlier` = `?before=<oldest created_at>&limit=50` prepended (the `Earlier messages` button shows while the last earlier page was full). `refreshOne(createdAt)` = `?after=<createdAt>&limit=1` and replace by id (the RSVP re-read of 4.3). A tick that fails is silent; the first read failing → `failure` (`LoadFailed`, Retry = `reload`). Mark-read: `POST /api/me/threads/<id>/read` on mount and after a full read that brought new rows.
- **Rendering**: oldest first, bottom-anchored, the 14px top fade, `Today` / date separators (`shouldShowChatSep`'s rule from `campus-home.tsx`: the first row, a day change, a > 1 h gap; the label `Today`, `Yesterday`, `Wed`, `Oct 5`); **text rows reuse `MessageBubble`** (`messages/MessageBubble.tsx`, unchanged palette in v1, open point 14.24) with `darkMode={night}`, `onToggleReaction` (today's raw-fetch reaction flow, moved as is), `onReply` (quote, `parent_message_id`, as today), `onReport`, and the new optional **`onRemove`** when `viewer.can_moderate && m.user_id !== viewerId` (the picker gets a `Remove` row; confirm; `DELETE …/messages/<mid>`; 200 → drop the row; `report_open` / `not_allowed` → the toast); a stub renders nothing; a card row → `CardBubble` (11.8); `removed !== null` → `RemovedContentCard` (6.2). A `MessageRow` for `MessageBubble` is built from the `ChatMessage` (the fields match, MM:12.6; a small `toMessageRow()` in `RoomThread.tsx`).
- **Sending**: the composer posts `POST …/messages` `{ content, parent_message_id? }` (no media; `canAttach` is never true in a club room); optimistic `temp_` row as today (`MessagesMobile.tsx:1319-1354`), replaced by the answer, removed on failure with the toast; `room_closed` → `can_post` false and the closed tile.
- **Empty**: `Say hi to <club>.` (the Lounge and a `room`), `Say hi to everyone going.` (an event chat).
- **Not in v1**: photos, typing, read receipts, message search, jump-to-unread.

### 11.6 The event chat (`club/EventAbout.tsx` above `RoomThread`, W2-S2) — W0_Room

- **Data**: the thread GET's `room` with `kind === "event"`: `room.name`, `room.org`, `room.event` = `EventRef & { going: Person[] }` (`title, starts_at, ends_at, location, state, room_id, viewer_status, going_count, maybe_count, going` = the first 8 visible people going, 8.3). Refreshed on the every-5th full read (9.3), and at once after an RSVP change (`reload()`).
- **Header**: Back `Back to <club>`, no club avatar, `<h1>` = the event title, under it the club dot + `<club> · event chat`; no right button.
- **About** (`<section aria-label="About this event">`): the 96px hero = the generated gradient (no cover image exists on `events`, DM:5.10; the bloom only on `live`); the state pill (`role="status"`, 1.2) from `state`: `soon` → `Soon · starts <7:30 PM>` (`eventTimeShort`), `live` → `Live now`, `after` → `Ended · chat open <moreDays> more days`, `closed` → `Closed`; the Plans grid: `Where` = `location` (`No place yet` when empty), `When` = `eventTime(starts_at)`.
- **Who's going** (`role="group" aria-label="Who's going: N going, M maybe"`): up to five stacked 30px avatars from `going` (initials on `personColor` when no `avatar_url`), `<N> going`, `· <M> maybe` (from the counts, blocked people included); at the right the RSVP pill (`Going` / `Maybe` / `RSVP`, 1.2) → the **RSVP sheet** (`club/RsvpSheet.tsx`, a vaul sheet: rows `Going`, `Maybe`, `Not going`; the line `You'll appear in the event chat.` under the first two; `Going` / `Maybe` → `PUT /api/events/<id>/rsvp { status }`; `Not going` → `DELETE`; 200 → `reload()`; a refusal (`campus_visiting`, `terms_required`, 404) → the toast from `vibeRequest`'s mapped line). A `maybe` → `no` by a member removes their room row by trigger (A:1076-1092): the next read answers 403 "Not a member" → the view closes with the toast `You left the event chat.` — pinned here because nothing draws it (open point 14.25).
- **The Board strip** below About (from the space read, 11.3), then the thread (11.5) top-anchored (`justify-content: flex-start`, MK:6), the composer `Message the event chat`, or the closed tile `This chat is closed.` when `viewer.can_post === false` and `state === "closed"`.
- **A closed chat** (`state === "closed"`): read-only; the "+" is hidden; votes on its polls answer 409 `poll_closed` (3.4) and the cards show `closed: true`; reactions still work (accepted in wave 1).
- **Not in v1**: a cover photo, Bring / Rides / "I'm here" / album tiles, the attendee list, `N going` from 5 up, non-members in the room, opening a room early.

### 11.7 The "+" tray and its three sheets (`compose/CardTray.tsx`, `compose/CardSheet.tsx`, `compose/NewPollSheet.tsx`, `compose/NewSignupSheet.tsx`, `compose/ShareEventSheet.tsx`, W2-S3) — W0_Tray, W0_NewPoll, W0_NewSignup, W0_ShareEvent

- **The tray** opens from the composer's "+" (`aria-expanded`), in flow above the composer with the tail, the `rgba(8,7,7,0.5)` scrim over the thread (Night; `rgba(20,20,22,0.35)` in Light), three 72px rows (1.2); a row opens its sheet and closes the tray; the scrim or the X closes it. Shown only when `viewer.can_post` (a member on the Board never sees it).
- **`CardSheet`** = the shared chrome (`role="dialog" aria-modal aria-labelledby`, the 40×5 handle, the 25px/800 title, the `<club> · <room>` line, the 44px close, the 50px gradient CTA; `var(--paper)` surface, radius 28 top; a vaul `Drawer.Root` so the drag-to-close and the focus trap come free). The CTA is disabled (`aria-disabled`, the muted chrome) until the body is valid; a request in flight disables it and shows `Posting…` on the CTA; the sheet closes on 201 and the room appends the returned `message` (`append(message)`); refusals per 1.2 and 1.3 (`content_blocked` outlines the named field: `question` / `options.<n>` / `note`).
- **New poll**: `Question` (200 max, counter), `Options` (starts with two empty rows; `Add option` up to 10; `Remove <label>` down to 2), `Anonymous` switch (`role="switch"`), `Allow more than one answer` switch; valid = question 1–200 and 2–10 non-blank labels ≤ 80 → `POST …/cards { type: "poll", question, options: [{ label }], anonymous, multi }` (no `closes_at`: v1 sends none, wave-1 open point 12.13).
- **New sign-up**: `Title` (200 max), `Slots` (starts with one row: a label input + the `Spots` stepper 1–50, default 2; `Add slot` up to 10; `Remove <slot>` down to 1), the helper line, `Post sign-up` → `{ type: "signup", question: title, options: [{ label, capacity }] }`.
- **Share an event**: `Upcoming events` = `GET /api/events?org_id=<org.id>&limit=50` (`events/route.ts:123,156-166`: not-ended events of the club within the horizon, soonest first; `id, title, starts_at, location, going_count`), a `radiogroup` of 66px rows with the date tile; `No upcoming events.` when empty (the CTA stays disabled); the note input (200 max); `Share to <room>` → `{ type: "event", event_id, note? }`. The `New event · Officers only` link is not built (14.19).
- **Not in v1**: `closes_at` pickers, editing a posted card, a Headcount, a photo row, drafts surviving a close.

### 11.8 The three card renderers (`cards/CardBubble.tsx`, `cards/PollCardView.tsx`, `cards/SignupCardView.tsx`, `cards/EventCardView.tsx`, W2-S3) — W0_Cards

- **`CardBubble`** (W2-S3's first commit, the signature W2-S2 builds against): `{ message: ChatMessage; roomId: string; room: ThreadRoom | null; viewerId: string; isMine: boolean; night: boolean; onCard(id, card): void; onRefresh(createdAt): void; onRemove?(): void; onReport?(): void }`. Draws the 292px card (theirs: 28px avatar + the left-tail radius; mine: right-aligned, no avatar) with the header line `<Name> · Poll | Sign-up | Event` (`users.name`, `You` when `isMine`); a long-press opens the same picker as a text bubble (reactions, Reply, Report, Remove) — `MessageBubble`'s long-press logic is not reused; `CardBubble` has its own 500 ms press that opens `ReactionPicker`; `card === null` on a card kind (hydration answered null: cannot happen after 9.1's 503, but a stale cached answer might) → the fallback text (`content`) as a plain bubble.
- **Poll** (`PollCard` with `type === "poll"`): the question 15px/700; options as a `radiogroup` (`checkbox`es when `multi`), each a 44px hit area around the 36px row: the result bar `width = count / max(total_voters, 1)` (open point 14.26: a multi poll's bars are per-option shares of voters, so they may sum past 100%), the mark (coral disc + check when `mine`; the grey ring otherwise), the label, `Your pick` under a picked label, up to two 20px voter avatars (from `voters`, hidden when `anonymous`), the count; the footer `<N> voted · names shown | anonymous`, or `Closed · <N> voted` with the whole card at 70% and no taps when `closed`. Tap → `PUT …/vote { option_id, on: !mine }`; optimistic: none (the answer's `card` replaces the card through `onCard`; the row stays as it was until then, the tapped option shows a 36px spinner in the mark's place); refusals per 1.3 (`poll_closed` also marks the card closed locally); a 404 `not_found` → `onRefresh(message.created_at)`.
- **Sign-up** (`type === "signup"`): the title; rows (single-line 36/44px when every label ≤ 12 characters, else the two-line 56px layout of W0_Room; one rule, pinned: **two-line when any label is longer than 12 characters**), each: the slot label, the taker chips (20px avatar + name 12.5px/600; `+N` when more than 3), then `Full`, or `<K> open` + `Take a spot` (the first open row gets the coral pill, the others the outlined one, as both mockups), or `Leave` when `mine` (a 44px text button, outlined); the footer progress (segments = `min(Σ capacity, 12)`; past 12 segments the bar is continuous) + `<taken> of <total> filled`. Tap `Take a spot` → `PUT …/vote { option_id, on: true }`; `Leave` → `on: false`; `slot_full` → the toast and `onRefresh`.
- **Event card** (`EventCard`): the 48px club band (`room.org.logo_url` or initials, the club name) over the gradient; `<Name> · Event`; the title 19px/700 Fraunces; `<location> · <eventWhen(starts_at)>`; the note line (13.5px/500, `--ink-2`) when `note !== null`; `Going` / `Maybe` pills (`aria-pressed` from `viewer_status`) → `PUT /api/events/<id>/rsvp { status }` (tapping the pressed one → `DELETE`) then `onRefresh(message.created_at)`; `<N> going`; `Open event chat` (a 44px link → the club space with that room, `room_id`) when `room_id !== null`; `event === null` → the fallback title from `content` (`Event: <title> · …` → the title between `Event: ` and ` · `), `This event was cancelled.`, no buttons. `state === "closed"` → the RSVP pills are hidden (nothing to join), `Open event chat` still shown (read-only room).
- **Announcements**: one `aria-live="polite"` `<span>` per card, `visuallyHiddenStyle`, set after each answer (1.2).
- **Old-screen fallback**: none of this reaches the old renderers; they show `content` (12.2).
- **Not in v1**: `voters_more` ("and 4 more" — not drawn; the count carries it), editing, closing a poll by hand, per-option comments.

### 11.9 The three empty states (W2-S1 for the two home ones, W2-S2 for the club) — W0_EmptyWeek, W0_EmptyClubs, W0_EmptyClub

1. **Nothing on your week** (11.2): the 44px line `Nothing on your week yet.` + `Find events` → `/campus?tab=events`. Data: no `rsvp` entry Monday–Sunday.
2. **No clubs yet** (`home/HomeEmpty.tsx`, the Clubs filter with `clubs: []`): the centred block `Your clubs will live here.` 24px/700 Fraunces, the 14.5px/500 line (max-width 306px), `Find clubs on campus` (48px gradient pill → `/campus?tab=orgs`), `Start a club` (44px underlined → `/campus?tab=orgs`). With `All` active and no clubs, the list shows threads only and no block.
3. **A brand new club** (`club/ClubEmpty.tsx`; the officer's view when `org.member_count === 1 && up_next.length === 0` and the Lounge's first page is empty): W0_EmptyClub's header variant is NOT used (one header for every club screen, 11.3; MK:16.10); Up next shows the dashed `Add your first event` button (→ `/campus?tab=events`) and the line `Every event gets its own chat for the people going.`; the Lounge area shows `It's just you so far.` / `Three things to do before people arrive.` / the three rows (1.2); the composer's send is `aria-disabled` while the input is empty (as on every room). A member's view of a club with no messages: the room's empty line (11.5).

### 11.10 Navigation, deep links, `CampusMobile` (W2-S1)

- `MessagesMobile` (flag on): state `open: null | { kind: "club"; orgHandle; roomId } | { kind: "thread"; threadId }`; `?channel=` resolves through the thread GET (2.3): `room !== null` → `{ kind: "club", orgHandle: room.org.handle, roomId }`; else `{ kind: "thread" }`; the home is not needed for the view to open (the old `?channel=` rule, MM:5.3). `?to=` as today. History per 2.3. Closing a view refetches the home.
- Chip taps inside the space: `replaceState` to the room's id; the thread hook is keyed by room id (a new room = a fresh first read; the previous room's rows are dropped).
- Links out of the new screens: `/orgs/<handle>` (the club page), `/campus?tab=events`, `/campus?tab=orgs`, `/profile/<handle>` (a name tap in a bubble, as today).
- `CampusMobile`: 2.2.
- The tab bar: hidden while a space or a conversation is open (`vibe-composer-open`); the counter-less class bug of MM:9 (Group info over a conversation) is pre-existing and not touched.

## 12. Compatibility: what must keep working with cards, stubs and the new routes present

1. **The four old renderers skip stubs** (W2-B3, one line each, flag-independent, 8.6): `messages/MessageBubble.tsx` (after the split; `if (message.hidden) return null;` at the top of the component — `MessageRow` gains `hidden?: boolean`, an additive field the split does not add; W2-B3 adds it after W2-S lands), `public/html/messages.html:1429` (`msgs.forEach`: `if (m.hidden) return;`), `public/html/_miniMessenger.js:652` (the map keeps `hidden` and `:761` skips it), `src/app/campus/campus-home.tsx:16391` (`messages.map`: return null for `m.hidden`). No other change to those files.
2. **Cards in the old screens**: a card row is `kind: "poll" | "event_card"` with `content` = the fallback text and no media; every old renderer shows it as a text bubble (they read `content`, `users`, `reactions`, `parent_preview` only; MM:4). Reactions and replies (quote) on a card work as on text. A shared post cannot be attached to a card (cards have no `attachment`).
3. **Desktop** (`messages.html`, `campus-home.tsx` ChannelChat, the mini messenger): untouched but 12.1; the 2-s polling stays; `?after=` is not used there.
4. **The old inbox** (`GET /api/me/threads`, no param): unchanged; a card's preview is its fallback text (`last_message.content`); club-room entries keep `org`, `room_kind`, `can_post`; event rooms stay out.
5. **Share pickers** (`SharePostSheet.tsx`, `_sharePicker.js`): unchanged (B5 filtered on `can_post`); sharing a post into a club room stays a text message with an attachment, never a card.
6. **Reports**: a reported card's snapshot carries `kind`, `thread_root_id`, `card` (5.3); the admin content pages show `content` as today.
7. **The sender's delete** of a card: today's route, the cascade takes the side rows (6.1).
8. **`chat_repair_club`, the five triggers, the after-deploy check**: untouched; `chat_votes_drop_access` rides on the rows they delete (3.5).
9. **No old renderer crashes on** `card !== null`, `hidden: true`, `removed !== null`, `reply_count`, `author_role`: checked in the integration review by reading each renderer's field reads (MM:4 for the phone; the two static files and `ChannelChat` by grep), and on the Mac in the browser walk with a Lounge that holds a poll, a sign-up, an event card and a stubbed message.

## 13. File ownership, build order, gates (cloud vs Mac), deploy order, rollback

### 13.1 Order

**W2-S (alone) → W2-B1 | W2-B2 | W2-B3 | W2-B4 side by side → W2-S1 | W2-S2 | W2-S3 side by side → integration review → handoff.** First commits that unblock a sibling, before anything else in the batch: W2-B2 commits `when.ts`, `cards/fallback.ts`, `cards/body.ts`, `blocks.ts`, `stub.ts`, the signatures of `cards/hydrate.ts` / `cards/snapshot.ts` / `event-refs.ts` (stubs answering an empty map / null / null) and the `types.ts` edits of 1.3 and 5.3 — W2-B4 builds against them; W2-S1 commits `v2-tokens.ts`, `avatar.ts`, `use-chat-v2.ts` and the `ClubSpace` mount point (a props signature, 11.3) — W2-S2 fills it; W2-S2 commits `use-room-poll.ts` + `page-merge.ts` and the `CardBubble` mount (11.8's props) — W2-S3 fills it. A change needed in someone else's file is a written request to that batch's owner, handled in the integration review. Every batch: implement → adversarial reviews (contract, security, behaviour, and for screens design at 375px Light + Night by reading) → one repair → gates. Notes, reviews, repairs and gate outputs go under `handoffs/chat-redesign/wave-2-build/<batch>-*.md` (the wave-1 naming). No Write/Edit over ~150 lines at once; findings to disk in small pieces.

### 13.2 Ownership (nobody else edits these)

| batch | owns |
|---|---|
| **W2-S** | `src/components/mobile/MessagesMobile.tsx` (the cut only), every file it creates under `src/components/mobile/messages/*.ts(x)` (10.1), `handoffs/chat-redesign/wave-2-build/S-*.md` |
| **W2-B1** | `supabase/migrations/20261001110000_chat_v2_cards.sql`, `scripts/sql/chat-v2-cards-check.sql`, a `scripts/local-seed.mjs` addition (one poll, one sign-up, one event card in `chat_seed_club`'s Lounge, written only when B's tables exist; re-runnable) |
| **W2-B2** | `src/lib/chat/when.ts` + test, `cards/fallback.ts` + test, `cards/body.ts` + test, `cards/hydrate.ts`, `cards/snapshot.ts`, `blocks.ts`, `stub.ts` + test, `event-refs.ts`; `src/lib/chat/types.ts` (1.3 sentences, `CardSnapshot`, comments), `src/lib/chat/message-read.ts` (9.1, 9.2, 9.4, `readGoing`'s block filter), `src/app/api/me/threads/[id]/messages/route.ts` (9.2 only), `src/app/api/me/threads/[id]/cards/**`, the report snapshot hunk in `src/app/api/me/reports/route.ts` (5.3) |
| **W2-B3** | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, `RemovedContentCard` in `src/components/safety/ReportSheet.tsx`, `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` (6.3), the four stub skips of 12.1 (`messages/MessageBubble.tsx` + `messages/types.ts` `hidden?`, `public/html/messages.html`, `public/html/_miniMessenger.js`, `src/app/campus/campus-home.tsx`) |
| **W2-B4** | `src/app/api/me/inbox/route.ts`, `src/app/api/orgs/[slug]/space/route.ts`, `src/app/api/me/calendar/route.ts` |
| **W2-S1** | `src/components/mobile/MessagesMobile.tsx` (the flag fork, deep links, history), `src/components/mobile/CampusMobile.tsx` (2.2), `messages/v2-tokens.ts`, `messages/avatar.ts` + test, `src/lib/chat/use-chat-v2.ts`, `src/lib/chat/week.ts` + test, `messages/home/*` |
| **W2-S2** | `messages/club/*`, `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts` + test, the optional `onRemove` prop in `messages/MessageBubble.tsx` and `messages/ReactionPicker.tsx` (10.2.5) |
| **W2-S3** | `messages/cards/*`, `messages/compose/*` |
| integration | `handoffs/chat-redesign/wave-2-build/integration-*.md`, the Mac handoff |

Pure modules (`when`, `week`, `cards/fallback`, `cards/body`, `stub`, `page-merge`, `avatar`) import nothing that needs a server: `npm test` is plain `node --test`; tests import with the `.ts` extension (Node 25 on the Mac, BN:5). Before writing any route, a batch reads the Next.js 16.3 guides named in asis section 10 (`context.params` is a Promise; `cookies()` is async; the proxy is `src/proxy.ts`).

### 13.3 Gates

**In the cloud (every batch):** `npm run typecheck` exit 0 repo-wide; `npm test` all green (1,374 today + the new tests); `npx eslint <the batch's files>` exit 0, where a file that carries old errors (`MessagesMobile.tsx`, `CampusMobile.tsx`, `campus-home.tsx`; the 11 files of `B0-gate.md:19-30`) is compared rule-by-rule against `git show <base>:<path> | npx eslint --stdin --stdin-filename <path>` and may add none; the split's proof (10.3). Route batches add a **stub harness** for the 3.10-style missing-schema rows and the SQLSTATE → code table (a fake client answering the codes), since no database exists here (BN:3 "same for wave 2"). Migration B gets a **read-through review** of its SQL against 3.0–3.9 and A's idioms by two reviewers (sql, security) plus a `psql`-syntax dry parse if `pg_query`-like tooling is available offline; nothing is run.

**On the Mac, in this order (BN:4.3):**
1. `pg_dump` the local database to the scratchpad; rehearse B with the last `commit;` → `rollback;` (the rehearsal copy in the scratchpad, `diff` = that line only); paste the `want_*` constants from `pg_policies` / `pg_constraint` / `pg_proc` after the empty-constants run; the real local apply through `psql -f`; `scripts/sql/chat-v2-rooms-check.sql` still 200/200; `scripts/sql/chat-v2-after-deploy.sql` 0 findings; `scripts/sql/chat-v2-cards-check.sql` all green; the seed re-run changes nothing the second time (same UTC day).
2. The three route cases of contract 15.8 again (create an event, RSVP as a member and a non-member, cancel with 2 RSVPs and 3 messages), then the wave-1 HTTP tables (the 59 + 10 cases of `integration-http.md:41-118`) to prove text sends and reads changed nothing; then the wave-2 rows: `POST …/cards` (poll, signup, event; per role; in a dm → `cards_club_rooms_only`; on the Board as a member → `board_officers_only`; in the closed room → `room_closed`; the 400 `invalid_card` fields; 422 with `field`), `PUT …/vote` (single, multi, anonymous, closed, slot full, a blocked pair's voters), the remove route (sender, mod, admin, owner, rank, open report, `already`, dm), `GET /api/me/inbox` per account, `GET /api/orgs/[slug]/space` (hidden club 404, non-member 403 `members_only`, Officers listed only for owner/admin), `/api/me/calendar` (the three fields null with the flag off, set with it on), the thread GET validator extended for `card` and `hidden` stubs (blake blocks casey in the seed, `B1a-review-seed.md:26`).
3. `GET /api/me/features` with `CHAT_V2_ENABLED=true` locally; the 404 of the gated reads with it off.
4. The browser walk at 375px in Light and Night as a member (blake) and an officer (avery): the home with the four filters and Your week; a club space with Board (folded replies open and close, a reply sent), Lounge, chips, Up next, the Board strip; an event chat in `soon`, `live`, `after`, `closed`; a poll voted and un-voted, a sign-up slot taken, left, a full slot; an event card's Going → Maybe → Not going; the three sheets end to end; the three empty states; a stubbed message invisible on the phone AND in `messages.html`, the mini messenger and desktop Campus › Chat; with the flag off: the wave-1 walk list (S69 `:79`) unchanged.

### 13.4 Deploy order and the flag

1. The branch `chat-v2-wave-2` is green in the cloud and pushed; the Mac gates pass. 2. Production PRE-CHECK queries (3.9) read-only. 3. **Franky's yes** → apply B at a quiet hour with the Management API recipe → the `schema_migrations` row → CHECK AFTER APPLYING. 4. **Merge to `main`** (the deploy). 5. The after-deploy check. 6. **`CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' ids>`, `CHAT_V2_CLUBS=<SAE's id>` in Vercel, Production only**, and a redeploy (the env is read at request time, but a redeploy is the habit); the first phone test on real data is after that. Preview builds show nothing new (`chatV2MayRunHere`). 7. Oct 26: `CHAT_V2_ALLOWLIST=*`.

Between the apply (3) and the merge (4), old code runs on the new database and nothing changes for it (section 0). If the merge cannot follow the apply the same day, B stays applied (harmless) and the merge waits.

### 13.5 Rollback

Restore the previous deployment first (the old code never reads B's tables). Unset `CHAT_V2_ENABLED` if the screens are the problem (the routes then 404 and the phone shows the old list; nothing in the database changes). Roll back B only if its objects themselves are the problem (3.10); A stays. Card rows that exist by then keep showing as their fallback text in every screen.

## 14. Open points (each with the default this file builds unless Franky says otherwise)

| # | point | default |
|---|---|---|
| 1 | **D1 — the block stub and the officer Board-post exception.** Franky's call of Sept 29 (W0 `:56`) names the exception; the B0 reviewers saw an earlier relayed sentence without it. | Build 8.1–8.3 with the exception (a top-level Board post by a CURRENT owner/admin is never a stub). |
| 2 | **D2 — blocking against a direct database read.** | NOT in v1; the after-launch clause is written in 8.7. |
| 3 | **D3 — migration B written in the cloud, rehearsed and applied on the Mac; adds `chat_reply_counts` and `chat_votes_drop_access`.** | As section 3. |
| 4 | **D4 — sentences for the ten codes and the new `invalid_after`.** | As 1.3. |
| 5 | **D5 — the flag read once per mount; a skeleton until it answers; the Campus › Chat pill gone and `?tab=chat` redirected with the flag on.** | As section 2. |
| 6 | **D6 — the extraction-only split runs alone with the mechanical proof.** | As section 10. |
| 7 | **D7 — 4-s `?after=` polls, the every-5th full read, 30-s home re-reads.** | As 9.3 and 11.1. |
| 8 | **D8 — the by-name allow-list refuses board / lounge / event with `room_locked`.** | As 6.3. |
| 9 | **D8 — `room_locked` stays the code for a reserved room name** (the sentence reads oddly on a create/rename form). | Accepted for v1; a new code comes with the custom-rooms UI. |
| 10 | **D9 — the remove route as 6.3; `RemovedContentCard` gets `by`; the officer copy has no appeal link.** | As section 6. |
| 11 | **D10 / D11 — scope and build order.** | As sections 0, 13, 15. |
| 12 | **The stub applies with the flag OFF too** (8.6): the ONE change everyone sees after wave 2. Alternative: gate stubs by `chat_v2` and let Apple's reviewer see a blocked person's club-room messages until Oct 26. | Flag-independent, and the four old renderers skip stubs (12.1). |
| 13 | The home's **search button** (W0_Home) has no endpoint behind it. | Not in v1; the header keeps the pencil only. |
| 14 | **`Start a club`** on the no-clubs screen: no phone create-club screen exists. | Links to `/campus?tab=orgs` with `Find clubs on campus`; a phone create flow is after launch. |
| 15 | The club header's **"More" button** has no pinned target (MK:4). | A link to the club page (`/orgs/<handle>`), `aria-label="Open <club>'s page"`; no sheet. |
| 16 | **Two sentences for the Board's member footer**: the mockup's `Only officers post on the Board. You can reply to any post.` vs the refusal `Only officers post here.` | The screen's tile uses the mockup's sentence; the refusal sentence stays for a refused send and for the old screens. |
| 17 | **A per-post `New` mark on the Board** needs the viewer's `last_read_at`, which no payload carries (MK:5). Alternative: add `last_read_at: string | null` (my own row) to `SpaceRoom`. | Not in v1; the room chip's dot and the inbox dot are the unread signal. |
| 18 | **Repliers' avatars in the folded replies row** need the `?root=` read per post (MK:5). | Not in v1; `N replies` + the chevron only. |
| 19 | **`New event · Officers only`** on the Share an event sheet: no phone event-creation screen exists (MK:11). | Not built; the empty club's `Add your first event` links to `/campus?tab=events`. |
| 20 | **`CampusMobile` while the flag is unknown**: hide the pill (a flash for the flag-off majority) or show it (a flash for the allow-listed few). | Show today's tabs until the answer; remove the pill when the answer is `true`. |
| 21 | **History on the phone** (2.3): `pushState` on opening a space or a dm from the new home, `popstate` closes, so Android's hardware back works (f9, Oct 9). Alternative: no history writes in v1, as the old list. | pushState / popstate, flag on only. |
| 22 | **`muted_until` on a club** changes no rendering (no mockup shows a muted club; mutes gate notifications, none in v1). | Sent, not rendered. |
| 23 | **A `?brief=1` switch** so the 4-s polls skip `describeRoom` (C1): saves 4–8 PostgREST calls per poll in an event chat. | Not in v1 (clubs are tiny); after launch with the Realtime work. |
| 24 | **`MessageBubble`'s palette vs the mockups'** (mine: white ink on coral today, `#140806` in the mockups; theirs: glass vs `#161515`, MK:16.18). Reusing the bubble keeps reactions, reply, report and long-press free. | Reuse `MessageBubble` unchanged in v1; restyle after launch. |
| 25 | **A member who changes an RSVP to `Not going` inside the event chat** loses the room by trigger; the view closes with `You left the event chat.` (nothing draws it). | As 11.6. |
| 26 | **Result bars on a multi-choice poll** (`count / total_voters` per option can sum past 100%). | Per-option share of voters (each bar independent); the footer's `N voted` is distinct people. |
| 27 | **A fourth table `chat_event_cards` for the note** and the extra `p_note` argument (3, departure a–b). Alternative: no note in v1 (drop `note` from `CreateCardBody` and the sheet). | The table. |
| 28 | **Replies under a Board card** (a poll or an Event card posted on the Board by an officer) are allowed (3.8.4, 9.5). | Allowed; they fold like any reply. |
| 29 | **`up_next` regardless of RSVP** (the mockup's `your RSVPs` subtitle is wrong for the payload). | The club's next 3 not-ended events; no subtitle; the RSVP mark only when the viewer RSVP'd. |
| 30 | **A demoted officer keeps the Officers room when they were also added by name** (C7). | Leave it; removing them stays a by-hand step for the owner. |
| 31 | **`chatV2For` asked three times per home mount** (features, inbox, calendar; no cache). | Accept for v1. |
| 32 | **Card text is not scanned for @mentions** and never notifies. | Yes: mentions are a text-message feature. |
| 33 | **`event_rsvp_counts()` is not used** for `EventRef` counts (it applies `event_visible` to the caller; the service role has no `auth.uid()`); `eventRefsFor` counts `rsvps` itself. | As 5.5. |
| 34 | **The sign-up row layout** (single-line vs two-line, MK:16.11) and which `Take a spot` is coral. | Two-line when any slot label is longer than 12 characters; the first open row is coral. |
| 35 | **Week strip day taps** (no day sheet in v1). | Scroll the card row to that day's first card. |

## 15. Not in wave 2

- **After launch (accepted plan, W0 `:18`; plan-critique "Smallest v1"):** the month sheet and week swiping; non-member event rooms (the stretch goal of wave-1 contract 9: `events.room_open_to_rsvps`, the officer switch, the seven checks); up to 3 custom rooms per club, the custom-rooms UI, room pinning and a separate reserved-name code; photos in club and event rooms (after location stripping); notification settings, `board_post` / card notification rows, push; "seen by" (a count for officers from 5 up); Realtime, typing, presence, "here now"; the React desktop Messages page and the retirement of `messages.html`, `_miniMessenger.js` and Campus › Chat on desktop; custom titles ("Treasurer"); `events.creator_id` → SET NULL; event counts "from 5 up"; the settings-columns privacy fix; the grants clean-up on `message_reactions` and `org_channel_members`; `is_blocked_either_way` in `messages_select_org_member` (8.7); a `?brief=1` poll switch; `MessageBubble`'s restyle to the mockup palette; a phone create-club and create-event flow; message search; the `# name` title in `CampusMobile`'s drill-down (unreachable with the flag on; retired with `ChatPane`).
- **Never in v1 (W0 `:21-28`):** Headcount, Bring / Rides / "I'm here" / album tiles, cards in DMs or group chats, the mention picker for the Officers room, editing a posted card or a poll's `closes_at` from the phone (the column and the API keep it; v1 sends none).
- **Not chat, not this wave:** the half-made club on a failed owner-row insert (C11), the nested-button hydration warning in `CampusMobile`'s FeedCard (C8), the push migration's renumbering (critique #9), `rsvps_update_own` letting a student move an RSVP onto another event (B1a verify note), `tooManyRequests` bodies without a `code`.

## 16. Where each input went

**Orchestrator's defaults:** D1 → 8.1–8.3, 14.1 · D2 → 8.7, 14.2 · D3 → 3 (whole), 9.4, 14.3 · D4 → 1.3, 9.2, 14.4 · D5 → 2, 11.10, 14.5 · D6 → 10, 14.6 · D7 → 9.3, 11.1, 11.5, 14.7 · D8 → 6.3, 14.8, 14.9 · D9 → 6.1, 6.2, 14.10 · D10 → 0, 11, 15 · D11 → 0, 13.

**Franky's calls (W0):** 1 names → 1.1 · 2 folded quiet replies → 11.4 · a/4 members-only event rooms → 11.6, 15 · b who's going inside the room → 11.6, 8.3 · c SAE → nothing new (live) · d/10 names on sign-ups, anonymous switch on polls → 3.1, 5.2, 11.7, 11.8 · 5 room life → 3.4, 11.6 · 8 the Campus › Chat pill → 2.2 · 27 owners/admins/mods remove → 6 · after-launch list → 15 · "Your hat" = the role → 1.1, 11.3 · blocking both ways with the officer exception → 8 · people who already RSVP'd → nothing (accepted) · on for everyone Oct 26 → 13.4.

**Wave-1 contract sections:** 0 (what moved to wave 2) → 0 · 1 → 1.1 · 2 (the flag) → 2, 13.4 · 4.1 → 3.1 · 4.2 → 3.2–3.5 · 4.3 → 5.1 · 4.4 → 4.1, 4.3 · 5 → 4, 5.2, 5.3 · 6.0 → 1.3 · 6.1 (`?after=`, the every-5th rule, `reply_count`) → 9 · 6.3 → 6.1, 6.2 · 6.4 (`?scope=chats`) → 11.1 · 7 (the three reads, URLs, accessibility) → 7, 2.3, 11.0 · 9 (the stretch goal) → 15 · 10 (the old screens) → 12 · 11 (gates, the rehearsal rule) → 13.3 · 12.2 (blocking) → 8 · 12.3 (the rank rule) → 6.1 · 12.5 (a removed message to its sender) → 6.2 · 12.13 (`closes_at`) → 11.7 · 14.1 (the lint rule) → 13.3 · 14.4 / 16.1 (`canPostAnswer`) → 4.1 (the RPC asks the database itself; `postRefusal` names the code) · 14.6 (never re-format dates) → 1.4 · 14.7 (B0's names) → used throughout · 14.9 (the codes without a sentence) → 1.3 · 14.10 (role check before `outranks`) → 6.1 · 15.1–15.8 (A's facts) → 3.0, 3.5, 3.8, 13.3 · 15 "For the wave 2 contract" (direct read) → 8.7 · 16.2 (`loadRoom` null) → 4.1, 6.1 · 16.5 (helpers never throw) → 5.2, 5.5.

**Session 69 close, "Wave 2 carry-overs":** room/viewer on every poll → 9.3, 14.23 · the grouped reply-count function → 3.5, 9.4 · sentences + a code for `?after=` → 1.3, 9.2 · `room_locked` doubling → 14.9 · the by-name POST → 6.3 · `CampusMobile`'s `# name` → 2.2, 15 · the demoted officer → 14.30 · the hydration warning → 15 · the START HERE list (flag rollout) → 13.4 · the cloud block → 0, 13.3.

**Build-notes deltas (BN):** C1–C16 → as above plus C11 → 15, C12 → nothing (members-only stands), C13 → 7.2.3 (rooms come from a list read), C14–C15 → accepted, C16 → 13.3 · X1–X15 (where the code differs from older contract text) → 3.0 (the fingerprints are the post-A values), 4.1 (`ensureMember` never 404s), 9.2 (both "Invalid after" sites), 6.2 (`RemovedContentCard` has no `by` yet) · section 5 gotchas → 3.0.4 (constants pasted by script), 3.2 / 3.8 (`P0C29`), 4.3.9 (no `.maybeSingle()`), 13.2 (`.ts` test imports), 13.3 (same-UTC-day seed), 3.9 (the record in a comment).

**Plan critique:** #11 → 10, 13 · #12 → 9.5, 11.4 · #13 → 3 · #15 → 4.1.7 (no mentions in cards) · #16 → 7.1.5 (the dot's source) · #18 → 11.6 · #20 → 11.1 · #23 → 15 · #26 → 4.1.9 · "Smallest v1" and the timeline → 0, 15.

**The five maps:** MM:1.1 / 10 → 10.1 · MM:5 → 11.5 (what polling is new) · MM:7 → 10.2.3, 13.3 · MM:9 → 11.0 (the tab bar) · RM:1–3 → 4, 9 · RM:6 → 6.1 · RM:7–8 → 7.1, 7.3 · RM:9 → 5.3, 6.1.9 · RM:11 → 4.3, 11.6, 11.7 · RM:12–13 → 6.3, 7.2 · RM:16 → 5.4 · RM:20 (contradictions 1–12) → 9.2, 9.4, 8.1, 6.1.9, 6.2, 7.3, 7.2, 4.3, 4.1.8, 7.2.3, 9.3, (12: `peer_typing` unchanged) · DM:2 (the house style) → 3 · DM:3.7 (the exact `can_post_org_channel`) → 3.3, 3.4, 9.5 · DM:4 (fingerprints) → 3.0.3 · DM:5 (the older tables) → 3.5, 5.2, 5.4, 7 · DM:7 (the direct read) → 8.7 · DM:8 → 3.0, 3.7, 3.8 · DM:9 → 3.2 (`P0C29`), 3.0.3 (no `is_blocked_either_way` pin), 3.9 (the record's home) · MK:0 → 11.0 (tokens, chrome) · MK:1–12 → 11.1–11.9, 1.2 · MK:13 → 11.0, 11.5 (reuse) · MK:14 → 11.0 (accessibility), 11.8 (radio group, `aria-live`) · MK:15 → 1.1 · MK:16 (surprises) → 14.13–14.19, 14.24, 14.26, 14.29, 14.34.
