# Club chat v1 — wave 2 contracts (S70, 2026-09-30) — FINAL

**Status: FINAL for wave 2 (draft 3), written in a CLOUD session** (no database, no docker, no browser, no `.env.local`, no memory notes; repo HEAD `15a8286` on the branch `claude/relaxed-davinci-9d11h3`; `origin/main` = `5c68da1` = wave 1 live + two docs commits). Draft 1 (`wave-2-contracts-draft1.md`) → six critics (`wave-2-critique/{database,routes,screens,split,privacy,schedule}.md`: 6 HIGH, 31 MEDIUM, 55 LOW, 92 findings) → draft 2 (`wave-2-contracts-draft2.md`, every finding folded in and accounted for in 16.1) → two verification passes (`wave-2-contracts-verify-1.md`, finding by finding: 88 TAKEN, 3 DIFFERENT fine, 1 WRONG, five word-notes; `wave-2-contracts-verify-2.md`, new problems: N1–N24, 1 HIGH, 8 MEDIUM, 15 LOW, plus a `libpg-query` parse of every SQL block) → this file, with the WRONG finding fixed (7.2.3), the five notes written in, and N1–N24 each written in or answered against the code (16.2 and 16.3, one line per point; two went in DIFFERENT because the code says otherwise: N12, N13). Drafts 1 and 2 are kept beside it, untouched. Every fact about the code cites `path:line` from the five as-is maps in `wave-2-asis/` or from the code itself, read again for this draft wherever a verifier and draft 2 disagreed. Nothing was run against a database. What was run, by whom: the critics — `npm test` (1,374 green), `npm run build` (exit 0, about 40 s), `node …/split-check.mjs --base HEAD` (exit 0, 51 declarations), `npx eslint src/components/mobile/MessagesMobile.tsx` (3 errors, 1 warning, all old); the verifier — the `libpg-query` 18.1.5 parse of the seven ```sql blocks of draft 2 (all parse; the SQL is unchanged here); this draft — `npm run typecheck` (exit 0) and `npm test` (1,374 pass, 0 fail) after the one `types.ts` edit named in section 0.

Inputs, in the order they win: `wave-0-decisions.md` (Franky's calls) → `wave-1-contracts.md` (FINAL for wave 1; sections 0, 1, 4, 5, 6.3, 7 and 14–16 define what wave 2 must build; 14–16 win over older text) → `2026-09-30-session-69-close-chat-wave-1-live.md` (carry-overs, START HERE, the cloud block) → `plan-critique.md` (#11 the split) → `wave-plan.md`. Facts: `wave-1-asis.md`, `wave-1-build/*.md`, and the five wave-2 maps: `wave-2-asis/messages-mobile-map.md` (MM), `routes-map.md` (RM), `database-map.md` (DM), `mockups-map.md` (MK), `build-notes-deltas.md` (BN). Mockups: `boards/W0_*.dc.html` (canvas row 7). Shapes: `src/lib/chat/types.ts` (TY). Migration A: `supabase/migrations/20261001100000_chat_v2_rooms.sql` (A:line).

Every batch reads this file first and may not change a name, column, route, payload field, error code or copy string in it. If a batch finds the contract wrong, it stops and says so; it does not improvise. The orchestrator's defaults D1–D11 are built as written unless a critic showed one wrong (none did; four were narrowed: D1 to club rooms, D5 with a gate on `?channel=`, D6 with a stricter checker, D9 with an open point on the mod's copy); each stays in section 14 so Franky can overrule. Where a section names a verifier's point (`N7`, `SCREENS-H1`…), that is the reason the text reads as it does; 16.1–16.3 are the ledger.

**The cloud block, restated for the next session (SCHEDULE-L4):** the container has `psql` and `pg_dump` 16.13 binaries but no server (`initdb` refuses root), the npm registry through the proxy (`npm view`, `npm install` in the scratchpad), and `npm run build` runs with no env; it has no Docker, no database, no browser, no `.env.local`. Written here vs run on the Mac is section 13.3's split.

## 0. What wave 2 is, in what order, and what moved out

Wave 1 shipped the rooms and the Board rule for everyone (Sept 30, 00:13 UTC). Wave 2 ships **cards, the officer/mod remove, the three reads, and the phone's new chat screens behind `chat_v2`**. The calendar is section 13.0: cloud Sept 30 – Oct 3, Mac window 1 Oct 5–6, Mac window 2 Oct 12–14, the freeze of the flag-OFF surface Oct 15, the flag on for everyone Mon Oct 26.

**Wave 2, in this order (section 13 has the file ownership):**

1. **W2-S, the split** (ALONE, before any other batch): `src/components/mobile/MessagesMobile.tsx` (4,985 lines today, MM:1) is cut into `src/components/mobile/messages/*.tsx` with no behaviour change (plan-critique #11, D6). Proof: typecheck, tests, build, eslint, and `handoffs/chat-redesign/wave-2-build/tools/split-check.mjs` (in the repo, commit `15a8286`; W2-S tightens it, 10.3).
2. **Backend, four batches side by side** (each owns its files, section 13.2), after W2-B2's first commit (13.1): **W2-B1** migration B (SQL written and parsed in the cloud, rehearsed and applied on the Mac); **W2-B2** cards (`fallback`, `body`, `hydrate`, `snapshot`, `event-refs`, `blocks`, `stub`, `when`, the two card routes, the thread-read changes of section 9, the blocking stub of section 8, the sentences of section 1.3, the validator tool); **W2-B3** the officer/mod remove route + `RemovedContentCard` + the by-name allow-list guard (D8) + the old renderers' stub filter + the old inbox's preview filter; **W2-B4** `GET /api/me/inbox`, `GET /api/orgs/[slug]/space`, the three calendar fields.
3. **Screens, three batches side by side**, all behind the flag, phone only, 375px, Light and Night, after the three first commits of 13.1: **W2-S1** Messages home (All · Chats · Clubs · Requests, "Your week", the person rows, the two home empty states, the flag fork in `MessagesMobile.tsx`, deep links and history, the tab-bar hook, the fonts line, the `CampusMobile` changes of D5); **W2-S2** the club space (header, Up next, room chips, Board strip, the Board with folded replies, the Lounge / room thread, the event chat layer, the composer, the empty club, the polling hook, the page merge); **W2-S3** the cards (poll, sign-up, event card), the "+" tray and its three sheets.
4. **Integration review** of the whole branch (flag off = exactly the nine-row list below, nothing else; flag on = this file), then the handoff for the Mac.

Every batch: implement → adversarial reviews → one repair → gates (section 13.3). One workflow script per stage, never one for the wave (13.1). **The branch** is the one this cloud session pushes: `claude/relaxed-davinci-9d11h3` today (SCHEDULE-M7; no `chat-v2-wave-2` exists and none is created — one name everywhere; open point 14.45). It is pushed and **never merged from the cloud** (CLOSE `:24`). The contract, its two drafts, the five fact files, the six critiques and the two verify files are committed on it before W2-S starts (they are untracked today: `git status`).

**`src/lib/chat/types.ts` and this contract:** one pinned shape changed — `SpaceResponse` gained `upcoming?: EventRef[]` (7.2.6, ROUTES-M4; additive and optional, so every existing reader type-checks unchanged). That edit landed with this file (S70; `npm run typecheck` and `npm test` green after it, section 13.3's cloud gate), so W2-B4 and W2-S3 build against it from their first commit. Every other `types.ts` change — the eleven sentences and the `RefusalCode` / `ChatRouteCode` move of 1.3, `InvalidCardRefusal`, `CardSnapshot`, the `hidden` and `card` comments (the `hidden` comment's "NOT PINNED YET" is answered by 8.1) — is W2-B2's (13.1). The stub of 8.1 fits `ChatMessage` as typed; no other shape changes.

**What moved out of wave 2 (section 15 has the full list):** the month sheet and week swiping, non-member event rooms (the stretch goal, wave-1 contract 9), the custom-rooms UI and the 3-room cap, photos in club rooms, push, "seen by", Realtime, desktop, Headcount, the mention picker for the Officers room, blocking against a direct database read (D2, section 8.7), a separate code for a reserved room name (D8), notification rows for cards or Board posts, hiding blocked people inside group chats (14.42).

**What changes with the flag OFF (SCHEDULE-H1; the integration review checks exactly this list, nothing else; the Oct 15 freeze is of this surface):**

| # | change everyone meets with the switch unset | where |
|---|---|---|
| 1 | In a **club room** a message by someone in a block pair with the viewer arrives as a stub; the four old renderers filter stubs out; a quote of a blocked person's message shows no quote (`parent_preview` null; the old bubble draws nothing for a null preview, `MessagesMobile.tsx:4477-4478`; N4); the OLD inbox's club-room preview skips blocked authors. One `blocks` read per club-room thread GET (a failed read answers 503 `try_again` where today's read succeeds) and per club-room send answer (there a failed read nulls the quote and never 503s, 9.1; N3); a dm or a group never reads `blocks` and never stubs. | 8, 9.1, 12.1, 12.4 |
| 2 | `?after=` that is not a timestamp → 400 `{ ok: false, error: "Reload to catch up.", code: "invalid_after" }` (was `"Invalid after"`, no code) | 9.2 |
| 3 | `reply_count` comes from `chat_reply_counts` (the wave-1 walk when B is missing); same numbers | 3.5, 9.4 |
| 4 | `DELETE …/messages/[messageId]`: an owner/admin/mod may remove someone else's message in their club's rooms; a dm/group non-sender reads 403 `not_allowed` (was 404/403 "Only the sender can delete this message"; no screen shows it); after auth, a non-uuid `[messageId]` reads 404 `not_found` (was a 500 from the cast, `[messageId]/route.ts:36-38`; N7) | 6.1 |
| 5 | `POST …/channels/[channelId]/members` answers 409 `room_locked` for a board / lounge / event room (API only; the desktop Access tab never shows for them, `campus-home.tsx:3246-3247`) | 6.3 |
| 6 | `GET /api/me/calendar`: the RSVP select carries `org_id`; the route asks `chatV2For` (one `org_members` read when the switch is on); with the flag off the three fields are null | 7.3 |
| 7 | The report snapshot of a message carries `kind`, `thread_root_id`, `card` | 5.3 |
| 8 | Migration B's trigger `chat_votes_drop_access` fires on every `channel_members` DELETE (wrapped: never raises) | 3.5 |
| 9 | In a club room that holds a card (posted by a flag-on member from Oct 5), every reader's thread GET carries the hydrated `card` (the old screens show `content`, 12.2) and answers 503 `try_again` when the card tables cannot be read (5.2; a path that does not exist today; N4) | 5.2, 9.1 |

`room.event.going` also leaves blocked people out (8.3); no old screen draws it (no `going` read in `MessagesMobile.tsx`, `messages.html` or `_miniMessenger.js`; `campus-home.tsx:9621,9951` read `going_count` from the events feed, not the thread; N4). Nothing else: no screen, no copy, no other route answer. Reason for row 1: Apple's reviewer (submission Oct 16) is not on the allow-list and Block must hold wherever the reviewer looks (8.6, open point 14.12). Everything else — cards, the new reads, the new screens, the Campus › Chat pill going, the `?tab=chat` redirect — is behind `chat_v2`. On a Vercel Preview the flag does nothing by design (`flag.ts:46-48`), so **a Preview shows nothing behind the flag; the nine rows above are live there on production data** (SCHEDULE deploy check).

**What migration B changes for everyone (flag or no flag):** four new service-role-only tables, five functions and one trigger. No policy, grant, column or row of an existing table changes. Old code on the new database keeps working unchanged (DM:6.3): every client insert is still `kind = 'text'`, and `readChatMessages` already selects `kind, thread_root_id, card_event_id` (`message-read.ts:73-75`).

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
| the event chat opened over a club space | the event chat layer (this file only) | `EventChat` |

Never in copy or new identifiers: channel, server, thread (user-facing), `#`, "pinned" for the Board strip (MK:15), Discord blurple. Existing identifiers (`channels`, `channel_members`, `/api/me/threads`, `?channel=`) keep their names.

### 1.2 Copy strings the screens show (exact; section 11 says where)

**Messages home (W0_Home, W0_EmptyWeek, W0_EmptyClubs)**
- Title `Messages`. Compose button `aria-label="New message"`. (No search button in v1: the mockup's magnifier has no endpoint behind it; open point 14.13.)
- Filters: `All`, `Chats`, `Clubs`, `Requests`; the Requests pill's count `aria-label="Requests, N waiting"`; the All pill's unread badge as today.
- "Your week" heading `Your week`; right text `<Mon D> – <D> · your RSVPs` (an en dash with spaces; `Sep 28 – Oct 4` across a month). Day strip `aria-label="Your week, <Month D> to <D>"`; day `aria-label`s: `<Weekday>, <Month D>, nothing planned` · `<Weekday>, <Month D>, today, nothing planned` · `<Weekday>, <Month D>: <title>, going` / `, maybe` / `, going, live now` · today with events `<Weekday>, <Month D>, today: <title>, going[, live now]` (SCREENS-L2; `W0_Home:33`); a day with two events joins its clauses with `; ` (`…: Fall Formal, going; Open Practice, maybe`).
- Week cards: line 1 `Live now` (glowing dot), `Ended` when `room_state === "after"` (11.2; N5), or `<Fri 7 PM>` (`eventTimeShort`); then ` · ` + check `Going` or dot `Maybe`; line 2 the title; line 3 the club name. `aria-label="<title> room, <club>, live now, you're going"` / `"<title> room, <club>, Friday 7 PM, you said maybe"`. Group `aria-label="Event rooms you RSVP'd to this week"`. No "18 going" on a week card (no calendar field carries it; MK:1 gap).
- Empty week: `Nothing on your week yet.` and the link `Find events` → `/campus?tab=events`. Coral (`#FF8A66` in Night) as W0_EmptyWeek; W0_EmptyClubs's white variant is not used (MK:16.12).
- Club row: name; the preview line = the Board's `Board: <text>` with the coral dot when `board.unread`; else the newer of `board.latest` / `lounge.latest` (a Board line is prefixed `Board:`, a Lounge line `<Author>:`); nothing when both are null (SCREENS-L8). `author_name` empty (an author whose `users` row the viewer cannot read) → the text alone, no `: ` (ROUTES-L8). Chips `Live now · <title>` / `<Sat> · <title>` + `Going` / `Maybe`; `N new` (Lounge unread, `99+` past 99). Row `aria-label="<club>, unread Board post, <title> is live now"` / `"<club>, N new in the Lounge, <title> Saturday, you're going"` (each clause only when true); the row's time is spoken with `rowTimeSpoken` (1.4).
- Person / group rows (`home/PersonRow.tsx`, SCREENS-M7): 44px avatar (the group's double avatar), name 15px/700, the time `rowTime(last_message.created_at)` (one clock for the whole list), the 12px pin icon when `pinned_at` (`aria-label="Pinned"`), the preview `You: …` / `<Name>: …`, the unread pill. Row `aria-label="<name>, <spoken time>[, N unread][, pinned]"`.
- No clubs (the Clubs filter, `clubs: []`): `Your clubs will live here.` · `Join a club to get its Board, its Lounge and a chat for every event you're going to.` · primary `Find clubs on campus` → `/campus?tab=orgs` · secondary `Start a club` → `/campus?tab=orgs` (there is no phone create-club screen; the Orgs tab holds the desktop-style entry; open point 14.14).
- Chats empty: today's `EmptyState` with `tab="all"` (`No conversations yet` + `Find people`); Requests empty: `tab="requests"`, unchanged.
- Load failure: the `LoadFailed` box with `asLoadFailure(r, "Couldn't load your messages.")`; the Clubs section alone failing: `Couldn't load your clubs.`; the week alone failing: `Couldn't load your week.` (each in its own place; the rest of the screen stays). A `?channel=` deep link whose resolving read fails (any non-200): the home opens on `All` and the toast reads `asLoadFailure(r, "Couldn't open this chat.").message` (2.3; N6).

**Inside a club (W0_Club, W0_Club_Light, W0_Board, W0_Room, W0_EmptyClub)**
- Back `aria-label="Back to Messages"` on the space; on the event chat layer `Back to <club>` (it lands on the space, SCREENS-M1).
- Header line under the club name: `Your hat: <Owner|Officer|Mod|Member> · <N> members` (`1 member`). The header's right button is a link to the club page: `aria-label="Open <club>'s page"` → `/orgs/<handle>` (the mockup's "More" has no target; open point 14.15). The event chat layer's header has no right button.
- "Up next" heading `Up next`; no right text (the mockup's `your RSVPs` is wrong for `up_next`, MK:16.6). Card line 1: `Live now` / `Tonight · 7:30 PM` / `Tue · 7 PM` (`eventTime`) + ` · ` + `Going` / `Maybe` when the viewer RSVP'd. The `Soon` mark (ring) and the live chrome ONLY when `state === "live"` or `isSoon(starts_at, ends_at, now)` (starts within 24 h; SCREENS-M2; one signature everywhere, N11); every other card is quiet, with no `Soon` and no "soon" in its label. `aria-label="<title> room, soon, tonight 7:30 PM, you're going"` / `"<title> room, Tuesday 7 PM, you said maybe"`. Group `aria-label="<club> events"`.
- Room chips `<nav aria-label="Rooms in <club>">`: `Lounge`, `Board` (`aria-label="Board, 1 unread post"` when unread, else `Board`), `Officers` (lock, `aria-label="Officers, only officers see this room"`), event chips = the event title (calendar icon, `aria-label="<title>, event chat, <state>"` where `<state>` = `tonight` when `isSoon` and starts ≥ 17:00 · `today` when `isSoon` otherwise · `live now` on `live` · `ended` on `after` · else `eventTimeShort`, SCREENS-L13), other rooms = their name.
- Board strip: `Board · <Author> · <text>`, dot when unread, chevron; `aria-label="Latest from the Board, unread. <Author>: <text>. Open the Board"`. No strip when `board_latest` is null.
- Composer placeholders (= `aria-label`): `Message the Lounge` · `Post to the Board` · `Message the event chat` · `Message <room name>` (kind `room`). Send `aria-label="Send"`; on the Board `Post to the Board`. The "+" button `aria-label="Add a poll, sign-up or event"`, open: `Close the tray`.
- Board, officer footer line: `Everyone in <club> sees this`. Board, member footer tile: `Only officers post on the Board. You can reply to any post.` (the screen's own sentence, W0_Board:149; the refusal sentence `Only officers post here.` stays the answer to a refused send; open point 14.16).
- Board post byline: `<Name>` (`Someone` when `users` is null, SCREENS-L11) · `<Owner|Officer>` (the role word; a `null` role shows nothing); time `6:12 PM` / `Wed` (1.4). Post `aria-label="Board post from <Name>, <Role>, <spoken time>"` with `rowTimeSpoken` (`Wednesday`, SCREENS-L4). No per-post `New` mark in v1 (no payload carries it; open point 14.17).
- Replies toggle: `<N> replies` (`1 reply`; `Reply` alone when 0) + chevron; `Replies stay quiet` at the right with the bell-off icon; `aria-label="Show N replies. Replies don't notify anyone."` / `"Hide N replies. …"`. Replies group `aria-label="Replies"`. Reply field `placeholder="Reply quietly"`, `aria-label="Reply quietly to <Name>'s post"`; send `aria-label="Send reply"`. An open fold whose rows are all stubs shows the reply field only (PRIVACY-L5). The folded state shows no repliers' avatars in v1 (open point 14.18). The replies read failing: `Couldn't load replies.` (`LoadFailed compact`, Retry re-reads).
- Event chat state pill (`role="status"`): `Soon · starts <7:30 PM>` · `Live now` · `Ended · chat open <N> more days` (`1 more day`) · `Closed`. Plans: `Where` → the location (`No place yet` when empty), `When` → `Tonight · 7:30 PM` (1.4). Who's going `aria-label="Who's going: N going, M maybe"`; text `<N> going` and `· <M> maybe`. RSVP pill: `Going` (check) / `Maybe` (dot) / `RSVP` (no mark) with `aria-label="You're going. Change your RSVP"` / `"You said maybe. Change your RSVP"` / `"RSVP to this event"`; tapping opens the RSVP sheet (11.6) whose rows are `Going`, `Maybe`, `Not going` and the line `You'll appear in the event chat.` under Going and Maybe. The event chat's first read failing: `Couldn't load this event chat.`; a member whose RSVP change removed them from the room: the toast `You left the event chat.` (open point 14.25).
- Closed event chat footer tile: `This chat is closed.` (= `REFUSAL_SENTENCES.room_closed`).
- A brand new club (officer, `member_count === 1`, `up_next: []`, no messages): `It's just you so far.` · `Three things to do before people arrive.` · 1 `Post a welcome on the Board` (switches to the Board chip and focuses the composer) · 2 `Add your first event` (→ `/campus?tab=events`) · 3 `Invite your members` (→ `/orgs/<handle>`); Up next shows the dashed `Add your first event` button and `Every event gets its own chat for the people going.` A member's empty club shows the empty Lounge line `Say hi to <club>.` instead (not drawn; pinned here).
- Empty room thread (no messages, or only stubs): `Say hi to <club>.` (Lounge and `room`), `Nothing on the Board yet.` (Board), `Say hi to everyone going.` (event chat).
- First reads failing (N5; each a `LoadFailed` in the failed part's place, Retry re-reads): the space read → `Couldn't load this club.` (11.3); the Lounge or a `room` thread → `Couldn't load this chat.` (11.5); the Board → `Couldn't load the Board.` (11.4). The event chat layer's line under its title: `<club> · event chat` (11.6).
- Earlier history: a quiet 44px `Earlier messages` button (`--ink-2`) when the last earlier page was full: **above the first row in a thread (oldest first); under the last post on the Board (newest first)** (SCREENS-L7).
- Officer remove (long-press → picker): `Remove`; confirm `Remove this message for everyone in the room?` with `Remove` / `Cancel`.
- Removed message (own): `Removed by a club officer.` + `Only you can see this message.` (officer OR mod, no reason, no link, no email; D9's literal; a mod's removal reads "officer" too, open point 14.39) · `Removed by Vibe moderators` + today's lines (moderator).

**Cards (W0_Cards, W0_Club, W0_Room)**
- Header line: `<Name> · Poll` / `· Sign-up` / `· Event`; `You` for the viewer's own; `Someone` when `users` is null (`Someone · Poll`; label `Poll from someone: …`).
- Poll: the question; options with `Your pick` under a picked label; `<N> votes` in the label (`1 vote`); option `aria-label` = `<label>[, your pick]. N votes` + (`: <A> and <B>.` when the spoken names are every visible voter · `, including <A> and <B>.` when more visible voters exist · `.` alone when `anonymous` or nobody) (SCREENS-L3: `W0_Cards:57,69`); footer `<N> voted · names shown` / `<N> voted · anonymous`; closed: `Closed · <N> voted`. Card `aria-label="Poll from <Name>: <question>. N voted, names shown"` / `"Your anonymous poll: <question>. N voted"`.
- Sign-up: the title; rows `<slot>` with taker chips; `Full` · `<K> open` (`1 open`) · `Take a spot` (`aria-label="Take a spot in <slot>, K spots open"`, the raw slot label — the mockup's `on Tuesday 12 to 1` is a hand-written expansion no payload carries) · `Leave` on a slot the viewer took, full or not (`aria-label="Leave <slot>"`; `Full` is for the others, SCREENS-L11); footer `<taken> of <total> filled`; closed: `Closed · <taken> of <total> filled`. Card `aria-label="Sign-up from <Name>: <title>, K of M spots filled"`. A slot or an option may show a count larger than its visible names (a blocked or unreadable voter): the count is the truth, the names are the viewer's view; no `+N` chip is drawn for hidden people (PRIVACY-L4).
- Event card: the club band with the club name; header `<Name> · Event`; the title; `<place> · <Thu Oct 8, 7:30 PM>` (place omitted when empty); the note line when present; `Going` / `Maybe` pills (`aria-pressed`) inside `role="group" aria-label="Your RSVP"` (`W0_Cards:158`); under the pills the 12px `--ink-2` line `You'll appear in the event chat.` while `viewer_status === null && room_id === null` (Franky's call b; SCREENS-L5; open point 14.41); `<N> going`; link `Open event chat` when `room_id` is set; cancelled (`event: null`): the band and title from the fallback text, then `This event was cancelled.` and no buttons. Card `aria-label="Event shared by <Name>: <title>, <place>, <Thursday October 8, 7:30 PM>. N going, you're going"`.
- Vote / RSVP announcements (`aria-live="polite"`): `<N> voted` · `<taken> of <total> filled` · `You're going` / `You said maybe` / `RSVP removed`.

**The tray and the three sheets (W0_Tray, W0_NewPoll, W0_NewSignup, W0_ShareEvent)**
- Tray `<nav aria-label="Add to the Lounge">`, caption `Add to the Lounge` / `Add to the Board` / `Add to the event chat` / `Add to <room name>`; rows: `Poll` — `Ask the room a question` · `Sign-up` — `Shifts, rides, who brings what` · `Event` — `Share an event with Going / Maybe`.
- New poll: `New poll`; `<club> · the Lounge` (`· the Board`, `· <event title>`, `· <room>`); `Question` with the counter `<n> / 200` (`aria-label="<n> of 200 characters"`); `Options`, `Option <i>`, `Remove <label>`, `Add option`, `2 to 10 options`; `Anonymous` with help `Off: the room sees who picked what. On: counts only.`; `Allow more than one answer`; CTA `Post poll`; close `aria-label="Close"`.
- New sign-up: `New sign-up`; `Title` with the counter `<n> / 200`; `Slots` / `Spots`; `Slot <i>`, stepper `aria-label="Spots for <slot>"`, `One less spot`, `One more spot`, `<n> spots` (`1 spot`); `Remove <slot>` (down to 1); `Add slot`, `1 to 10 slots`; helper `Names show to everyone in this room.`; CTA `Post sign-up`. (`Remove <slot>`, `1 to 10 slots` and the `Title` counter are additions to W0_NewSignup for the RPC's limits, SCREENS-L13.)
- Share an event: `Share an event`; `Upcoming events` (`role="radiogroup"`), each `aria-label="<title>, <Thursday October 8>, <7:30 PM>[, <place>][, selected]"` (the place clause only when `location` is not empty); empty: `No upcoming events.`; the list failing: `Couldn't load your events.` (`LoadFailed compact`, the CTA disabled); `Add a line (optional)` (`aria-label="Add a line, optional"`, counter `<n> / 200`); helper `Members who tap Going or Maybe join the event chat.`; CTA `Share to the Lounge` / `Share to the Board` / `Share to the event chat` / `Share to <room>`. The mockup's `New event · Officers only` link is NOT built (no phone event-creation screen; open point 14.19). The CTA reads `Posting…` while a request is in flight.
- Sheet refusals (toast, 1.3): `content_blocked` with `field` → the toast line `That includes words that aren't allowed on Vibe` and the field outlined; `invalid_card` → its sentence and the named field outlined; `board_officers_only` / `room_closed` → their sentences and the sheet closes; `not_found` (B missing) → its sentence, the sheet closes; `try_again` (503, from anywhere in the POST, the read-back included) → the sheet closes, the room calls `reload()` (a full read) and the toast shows the sentence; the form is never re-submitted from the same sheet (a second tap after a 503 that followed a successful RPC would post a second card, N8).

### 1.3 Codes and sentences

Every refusal is `{ ok: false, error: <plain sentence>, code }`. Screens match on `code`, never on the status or the sentence. Wave 2 gives a sentence to every code the wave-1 contract left without one (14.9) and adds ONE new code. `RefusalCode` in `types.ts` grows by these eleven; `REFUSAL_SENTENCES` gains eleven rows; `refusalBody()` is unchanged. `ChatRouteCode` keeps `content_blocked` only (its sentence comes from `contentBlockedResponse`, `moderation/access.ts:134-144`).

| code | status (where) | sentence |
|---|---|---|
| `not_found` | 404 (a gated route with the flag off or the schema missing; a vote on a message that is not a live poll of this room; the remove route; a non-uuid `[messageId]`) | That's not there anymore. |
| `not_allowed` | 403 (the remove route: not the sender in a dm or group; below mod; outranked) | You can't remove this message. |
| `report_open` | 409 (the remove route) | This message has an open report. Vibe's moderators will handle it. |
| `invalid_card` | 400 (a card with a bad shape, from the route or the RPC's `P0C22`; the body carries `field`) | Check the card and try again. |
| `event_not_found` | 404 (an Event card for a missing, foreign or ended event) | That event isn't available. |
| `poll_closed` | 409 (a vote past `closes_at`, or in a closed event chat) | This one is closed. |
| `slot_full` | 409 (a sign-up slot at capacity) | That spot just filled. |
| `cards_club_rooms_only` | 400 (a card sent to a dm or a group) | Polls, sign-ups and events only work in club chats. |
| `members_only` | 403 (`GET /api/orgs/[slug]/space` by a non-member of a visible club) | Members only. |
| `create_failed` | 500 (club creation; the sentence for `refusalBody`, the wave-1 route keeps its own text) | Couldn't create the club. Try again. |
| **`invalid_after`** (NEW) | 400 (`?after=` that is not a timestamp the server could have sent, `message-read.ts:711` and `messages/route.ts:115`) | Reload to catch up. |

Wave-1 routes that answer `not_found`, `members_only` or `create_failed` keep the sentence they use today (14.9; `channels/route.ts:65-95`, `orgs/route.ts:912-916`). `types.ts` gains (additive, W2-B2; ROUTES-L2): `export type InvalidCardRefusal = Refusal<"invalid_card"> & { field: string };` — the only refusal with a `field` besides `content_blocked`; the sheet reads it through `VibeFailure.field` (`request.ts:37-51`).

### 1.4 Time and date labels (pure, tested)

`src/lib/chat/when.ts` (W2-B2) holds every function below but `weekRange`, which lives in `src/lib/chat/week.ts` (W2-S1; only the home uses it; SPLIT-L4). The screens format in the device's zone (as today's `relativeTime`, `MessagesMobile.tsx:282-295`). The server formats the stored fallback text in `CAMPUS_TIME_ZONE` (`"America/Indiana/Indianapolis"`; both campuses are Eastern; the server runs in UTC). The constant already has a home: `src/lib/push/event-notice.ts:51`, a pure, client-safe module (its one import is a type, `:22`); `when.ts` imports it from there and re-exports it (`export { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";`), so `fallback.ts` and the screens import `../when` only and no second copy exists (N13). `eventWhenText` beside it (`:64`, `Fri, Oct 3, 7:00 PM`) is NOT reused: the mockups' shape drops the comma after the weekday and the `:00` (`eventWhen` below). Every function takes `now` so tests are deterministic. Never re-format a `timestamptz` string before handing it back to a route (`roomState` answers `closed` for a zone-less string, contract 14.6).

| function | answers |
|---|---|
| `rowTime(iso, now)` (inbox rows, Board bylines, person rows) | same day → `8:44 PM`; yesterday → `Yesterday`; within 6 days → `Wed`; else `Oct 5`; a different year → `Oct 5, 2025` |
| `rowTimeSpoken(iso, now)` (`aria-label`s of rows and Board posts; SCREENS-L4) | `rowTime` with the weekday and month spelled out: `8:44 PM`, `Yesterday`, `Wednesday`, `October 5`, `October 5, 2025` |
| `eventTime(starts_at, now)` (Up next, Where/When) | today, starts ≥ 17:00 → `Tonight · 7:30 PM`; today otherwise → `Today · 7:30 PM`; tomorrow → `Tomorrow · 7 PM`; within 6 days → `Fri · 7 PM`; else `Oct 8 · 7:30 PM`; minutes only when not `:00` |
| `eventTimeShort(starts_at, now)` (week cards, chips, the state pill) | the same with ` · ` replaced by a space and no `Today`/`Tonight`/`Tomorrow` prefix (`7:30 PM`, `Fri 7 PM`, `Oct 8 7:30 PM`) |
| `isSoon(starts_at, ends_at, now)` (SCREENS-M2) | `roomState(starts_at, ends_at, now) === "soon"` AND `starts_at − now ≤ 24 h` (a 1 AM event tapped at 10 PM counts) |
| `eventWhen(starts_at, zone)` (the fallback text, the event card's date line) | `Thu Oct 8, 7:30 PM` |
| `eventWhenSpoken(starts_at)` (`aria-label`s) | `Thursday October 8, 7:30 PM` |
| `weekRange(now)` (`week.ts`) | `{ start, end, label: "Oct 5 – 11" | "Sep 28 – Oct 4", spoken: "October 5 to 11" | "September 28 to October 4" }`; weeks run Monday to Sunday in the device's zone |
| `moreDays(ends_at, now)` (`Ended · chat open N more days`) | `ceil((ends_at + 7 d − now) / 1 d)`, at least 1 |
| `clubGradient(id)` / `personColor(id)` (`src/components/mobile/messages/avatar.ts`, W2-S1) | initials on one of the six mockup gradients / colours, picked by a hash of the id; used only when `logo_url` / `avatar_url` is null |

## 2. The flag on the client (D5), URLs, deep links and history

### 2.1 How a screen learns the flag

- `src/lib/chat/use-chat-v2.ts` (client, W2-S1): `useChatV2(): boolean | null`. On mount it calls `GET /api/me/features` once (`vibeRequest`, `cache: "no-store"`, quiet); `null` until the answer; `true` only when the body is `{ ok: true, chat_v2: true }`; any failure or any other body → `false`, logged once. No cache across mounts (a second mount asks again). The route is `src/app/api/me/features/route.ts:24-36` (`FeaturesResponse`, TY:149).
- **`MessagesMobile`** (after the split, W2-S1): while `useChatV2()` is `null` it renders a **bare header** — `Messages` at 28px/900 as today, the pencil, NO pills, no week block — and `ListSkeleton`, nothing else (SCREENS-L12: the flag-off list mounts its pills with its list, the flag-on home mounts its week and filter row with its list; the title's step from 28px/900 to 30px/800 is accepted, one glyph, no layout jump). `true` → `MessagesHome` (11.1). `false` → today's list, unchanged. Never one list then the other. Failure = the old list (fail closed), never a blank page.
- **Desktop is untouched**: `MessagesSwitch.tsx:39-66` keeps the `messages.html` iframe and never asks the flag.
- The gated routes (`/api/me/inbox`, `/api/orgs/[slug]/space`, the card routes) answer 404 `not_found` with the flag off; a screen that reaches them with the flag on and still meets a 404 shows the `LoadFailed` line, not the old list.
- `chatV2For` is not cached (`flag-server.ts:14-16`): one home mount asks it three times (features, inbox, calendar). Accepted for v1 (one `org_members` read each, RM:21; open point 14.31).

### 2.2 `CampusMobile` with the flag on (D5, Franky's call 8)

`CampusMobile.tsx` (W2-S1 owns it in wave 2) calls `useChatV2()` too.
- **While the flag is `null` AND `?tab=chat` or `?channel=` is present** (SCREENS-M6): the Campus page renders its header and tab strip with today's tabs but mounts NOTHING for the chat tab — no `ChatPane`, no `ConversationView`, no `OrgChannelsDrawer` — with a `ListSkeleton` in the pane's place. `false` → today's drill-down mounts (`:422-435`); `true` → the redirect below. A `?channel=` never opens the old `# name` view before the flag is known (that view's thread GET is 9–13 PostgREST calls, BN:3, and its title is a Discord tell, 1.1).
- **While `null` on a plain `/campus`** (no chat param): today's tabs, pill and everything else, unchanged; the pill is removed when the answer is `true` (a flash for the allow-listed few; open point 14.20).
- **When `true`**: `TAB_ORDER` / `VISITING_CLOSED_TAB_ORDER` are rendered without `"chat"` (`TabStrip`, `:850`, `:1160-1216`); if `tab === "chat"` at that moment (from `?tab=chat`, `:166-171`, or `?channel=`, `:433-435`), the component calls `router.replace("/messages" + (initialChannelId ? "?channel=" + encodeURIComponent(initialChannelId) : ""))` once (`useRouter` is already imported, `:4`); `?org=` is dropped (the room id is enough, 2.3). `ChatPane` and `OrgChannelsDrawer` are never mounted with the flag on.
- **While `false`**: today's tabs, pill and `?channel=` drill-down, unchanged (the `# name` title of `synthesizeChannelThread`, `CampusMobile.tsx:2459-2472`, stays until after launch; C6).
- The club page's rooms list (`src/app/orgs/[handle]/ChannelsSection.tsx:314`) keeps linking to `/campus?tab=chat&org=<handle>&channel=<id>`; with the flag on the redirect above lands it on `/messages?channel=<id>`. No change to that file.

### 2.3 URLs (phone, flag on)

| URL | opens |
|---|---|
| `/messages` | the home, filter `All` |
| `/messages?tab=chats` / `clubs` / `requests` | the home with that filter (flag off: ignored; `requests` is not mapped to the old tab) |
| `/messages?channel=<id>` | the thread GET for `<id>` runs once, after the flag answered `true` (it works for any thread the viewer may read, `messages/route.ts:83-97`): `room !== null` and `room.kind !== "event"` → the club space of `room.org.handle` with that room active (11.3); `room.kind === "event"` → the space on its Lounge with the **event chat layer** on top (11.6); `room === null` → `ConversationView` as today. The resolving read's body is handed to `useRoomPoll` as `initialPage`, so the room is read once (SCREENS-L10). **The resolving read failing (any non-200: 403 `"Not a member"` for a room the viewer left or lost by an RSVP change, `messages/route.ts:94-97`; a 404; a 5xx): the home opens on `All`, the URL is `replaceState`'d to `/messages`, and the toast shows `asLoadFailure(r, "Couldn't open this chat.").message` (403 → its mapped line, 5xx → the line + Try again); nothing else is mounted** (N6; open point 14.46). Flag `false` → today's `ConversationView`. |
| `/messages?to=<handle>` | as today (a DM) |

**History (SCREENS-M5, open point 14.21; flag on only, the old list keeps today's no-history behaviour, MM:5.3):**
- Every open of a layer is one `history.pushState({ vibeChat: <id>, depth: n }, "", "/messages?channel=<id>")`: a club space from the home (depth 1), a dm from the home (depth 1), the event chat layer over a space (depth 2). Switching room chips inside a space is a `replaceState` at the same depth with the room's id.
- **Closing a layer by its Back button or by the drawer's swipe calls `history.back()`**; the `popstate` handler is the ONE place that unmounts: it reads `event.state?.depth ?? 0` and closes every layer above that depth. A `popstate` with no `vibeChat` state closes everything. After the last close the URL is `/messages` (plus `?tab=<filter>` when a filter other than All is active). So Android's hardware back (f9, Oct 9) and iOS's edge swipe peel one layer at a time.
- A deep link (`?channel=` on arrival) opens its layers on the entry the browser already holds: `replaceState({ vibeChat, depth: 1 })` for the space or the dm; for an event room, `replaceState` (depth 1, the space on its Lounge) then `pushState` (depth 2, the event chat layer). Back from a deep-linked space leaves `/messages` as the old list does today; Back from a deep-linked event chat lands on the space.
- `MessagesMobile` reads its `initialChannelId` prop once, on mount, and keeps the open state itself; the prop is never re-read after a close (the server page passes it on every render, `src/app/messages/page.tsx:26-30`).
- Push and Otto mention links keep pointing at `/messages?channel=<id>` (wave-1 contract 7); nothing in wave 2 changes them.
- `?after=`, `?before=`, `?root=`, `?limit=` on the thread GET are unchanged (9.2).

## 3. Migration B — cards (W2-B1; written and parsed in the cloud, rehearsed and applied on the Mac)

File **`supabase/migrations/20261001110000_chat_v2_cards.sql`** (nothing landed after `20261001100000`, DM:1; no renumbering). House style of migration A, copied: the header sections in A's order (DM:2.1), `begin; set local lock_timeout = '5s';`, PRE-FLIGHT, numbered steps, POST-CHECK by reading, POST-CHECK BY BEHAVIOUR, APPLY RECORD, `notify pgrst, 'reload schema';`, `commit;`. Error prefix **`chat-cards:`**. Every function: `set search_path to ''`, fully qualified names, `comment on function`, `grant execute … to anon, authenticated, service_role` right after it (the standing rule, DM:6.2), and the client roles refused from the inside. Values carried between DO blocks with `set_config('chat_cards.<key>', …, true)`.

**What B changes on existing tables: exactly one trigger on `channel_members` (3.5).** No policy, grant, column, constraint or row of `messages`, `channels`, `channel_members`, `rsvps`, `events`, `org_members` changes. `messages_kind_check` already allows `poll` and `event_card` (A:839-845). Nothing in the schema stops a card row with `thread_root_id` set; the RPCs never write one (3.3).

**Locks (DATABASE-M1; the header's APPLY ORDER section says the same):** the five `REFERENCES` of 3.1 hold **SHARE ROW EXCLUSIVE on `messages`, `channels` and `users` from step 1 to COMMIT** (chat sends, the `users.last_active_at` heartbeat write, `heartbeat/route.ts:27-30`, and a sign-up's `users` row queue; reads and RI checks proceed); `CREATE TRIGGER` the same on `channel_members`; `lock_timeout 5s`, a quiet hour, Franky's yes. The behaviour probe (3.8) runs inside that window and stays short (its fixture search is A:1809-1815's, no loops over real rows). The ROLLBACK's `DROP TABLE` takes locks of the same class on the same three tables (Postgres source; the exact mode is read from `pg_locks` during the Mac rehearsal). The header's COST section records the rehearsal's measured wall time of the whole file (the window's length).

Departures from the wave-1 contract's section 4, each said out loud: (a) a **fourth table `chat_event_cards`** holds the Event card's `note` (section 4 had nowhere to keep it; deriving it from `messages.content` breaks when the event is renamed); (b) `chat_create_event_card` takes **`p_note text`** before `p_content`; (c) a **`chat_reply_counts`** function (the carry-over C2); (d) `messages.content` for a card is built by the route with `cardFallbackContent()` and checked by the RPC (1–300 characters), as 4.3 says; (e) `chat_poll_votes` carries a **composite foreign key** `(option_id, poll_id)` so an option can never be counted under another poll (DATABASE-L7).

### 3.0 PRE-FLIGHT (catalog and count reads only; never `schema_migrations`; DM:8.1)

In this order, each a `raise exception 'chat-cards: …'` unless it holds. The PRE-FLIGHT compares only values known before the file was written; every value that must be read from a rehearsal is checked in ONE place, 3.7's last block (DATABASE-M2).
1. **Not already applied**: `to_regclass('public.chat_polls') is null` (else `already applied (chat_polls exists). Nothing to do`). First, before any fingerprint.
2. **Migration A is there**: `information_schema.columns` has `messages.kind`, `messages.thread_root_id`, `messages.card_event_id`, `channels.kind`, `channels.event_id`; `to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)') is not null`; `pg_constraint` has `messages_kind_check` and `messages_card_event_shape` on `public.messages`.
3. **Fingerprints** (`md5(pg_get_functiondef(p.oid))`, never `md5(prosrc)`): `public.can_view_org_channel(uuid,uuid)` = `747ee06d2e4c3e8a788129f7530ec0ae`; `public.can_post_org_channel(uuid,uuid,uuid)` = `8d8be860d3f7077b9d6f9238705bdca7`; `public.org_members_drop_club_access()` = `0e7baa973042be8ca0decb7df1ca6407` (A:1536-1537, A:438; DM:4). Message `<fn> drifted (md5 %); re-read it first`. `is_blocked_either_way` is not pinned (B does not call it; its only pinned value is `md5(prosrc)`, DM:9).
4. **Policy texts by exact `pg_policies` text**: `messages_insert_org_member` and `messages_insert_member` `with_check` = A's `want_org` / `want_dm` character for character (A:1519-1528 = DM:3.8; known). `messages_select_org_member` `qual` is compared to `want_select` **only when that constant is non-empty**; empty → `raise notice 'chat-cards: select policy unpinned'`, `set_config('chat_cards.notes', 'select policy unpinned', true)`, continue (3.7's last block prints the text and refuses the file). Exactly two permissive INSERT policies on `messages`; RLS on for `messages`, `channels`, `channel_members`.
5. **Grants as found**: `not has_table_privilege('authenticated', 'public.messages', 'UPDATE')`; no INSERT for `authenticated` on `channels` and `channel_members`; no `anon` SELECT on `messages`; `has_function_privilege` for the three roles on the two A functions.
6. **Every name is free** (`to_regclass`, `pg_constraint.conname`, `pg_class.relname`, `pg_proc.proname`, `pg_trigger.tgname`): the four tables; the 21 constraints named in 3.1; `pg_class.relname` in (`idx_chat_polls_channel`, `idx_chat_poll_votes_poll_user`, `idx_chat_poll_votes_user`, `chat_polls_pkey`, `chat_poll_options_pkey`, `chat_poll_options_poll_id_position_key`, `chat_poll_options_id_poll_id_key`, `chat_poll_votes_pkey`, `chat_event_cards_pkey`) (DATABASE-L3: the constraint-backed indexes are relations too); `chat_create_poll`, `chat_create_event_card`, `chat_cast_vote`, `chat_reply_counts`, `chat_votes_drop_access`; the trigger `chat_votes_drop_access` on `channel_members`.
7. **Trigger set traced**: `channel_members` has no trigger; `messages` exactly `bump_org_activity_on_message`, `messages_check_media_ref`; `org_members` exactly 5; `channels` 2; `rsvps` 1; `events` 1 (DM:3.4). Any other → `a trigger this file was not written against: %`.
8. **Data shape**: `count(*) from public.messages where kind <> 'text'` = 0 and `where card_event_id is not null` = 0 — unless `current_setting('chat_cards.allow_orphans', true) = 'yes'` (set by hand in the same session before the file, only on a re-apply after a ROLLBACK that kept the card rows, with Franky's yes on production; DATABASE-L4): then `raise notice` and `chat_cards.notes` gains `orphans allowed: <n>`. Otherwise `Stop and ask Franky`. The row guards `orgs` ≤ 40 and org channels ≤ 60 are kept so the behaviour probe's fixture search stays small; they are not a correctness guard (B has no data step; DATABASE-L10).
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
  constraint chat_poll_options_poll_id_position_key unique (poll_id, position),
  constraint chat_poll_options_id_poll_id_key unique (id, poll_id)
);
create table public.chat_poll_votes (
  option_id  uuid not null,
  poll_id    uuid not null constraint chat_poll_votes_poll_id_fkey references public.chat_polls(message_id) on delete cascade,
  user_id    uuid not null constraint chat_poll_votes_user_id_fkey references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_poll_votes_pkey primary key (option_id, user_id),
  constraint chat_poll_votes_option_fkey foreign key (option_id, poll_id)
    references public.chat_poll_options (id, poll_id) on delete cascade
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

- 21 named constraints: `chat_polls` 7, `chat_poll_options` 7, `chat_poll_votes` 4, `chat_event_cards` 3. The composite FK makes `chat_cast_vote`'s `o.poll_id = p_poll` test structural (a mismatched row cannot exist); the `poll_id → chat_polls` FK stays for the poll-level cascade and the `(poll_id, user_id)` index.
- A sign-up is a poll with `mode = 'signup'`: the "question" is its title, each option is a slot with a `capacity`, a person may take more than one slot (`multi = true` by the CHECK), names always show (`anonymous = false`). A poll's options have `capacity` null. **A poll has 2–10 options; a sign-up has 1–10.** Labels need not be unique. No edits in v1.
- All four tables: `alter table … enable row level security;` NO policy, and `revoke all on table public.<t> from anon, authenticated, service_role; grant select, insert, update, delete on table public.<t> to service_role;` (DM:6.2 — the default ACL would hand `anon` the table). `chat_poll_votes` needs no restatement in the after-launch blocking file: voter names never leak by a direct read (PRIVACY-L3).
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

Any other error from an RPC (a `PGRST202` / `42883` "function missing" = the schema is missing → 404 `not_found`, 3.10-style; anything else → 503 `try_again`, logged with the SQLSTATE). `22003` (a capacity past `integer`) cannot be raised: the capacity regex is `^[0-9]{1,3}$` (DATABASE-L11) and the route refuses first (4.2).

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
         or (v_opt ->> 'capacity') !~ '^[0-9]{1,3}$' then
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

The `messages` insert runs as the function's owner (`postgres`, table owner with BYPASSRLS, `20260928140000_profile_views_server_only.sql:36,62`), so the two INSERT policies (`TO authenticated`) are not evaluated; the BEFORE trigger `messages_check_media_ref` sees `media_url` null and passes, `bump_org_activity_on_message` moves `orgs.last_activity_at` (DM:5.3, why `InboxClub.last_activity_at` is computed, not read). The row's `thread_root_id`, `card_event_id`, `media_*`, `removed_*` stay null. The shape checks run BEFORE `can_post_org_channel` so a bad body never costs a policy call; the route checks the same shape first (4.2) and the RPC is the second wall. The capacity regex admits three digits (1–50 with room; DATABASE-L11), so the `::integer` cast can never raise `22003`.

#### 3.3.1 Gate ledger: which terms of the INSERT policies the RPCs re-check, and which they leave to the route (DATABASE-M3)

The RPCs are the routes' second wall for the **room rule and the shape**, never for the **person**: Terms, age, the verified school e-mail and an active restriction are the route's (`requireCanPublish`, `requireNotRestricted`). Nothing but a route may call them (the first statement of every RPC refuses `anon` and `authenticated` with `42501`; the routes call with the service key after their gates). The seed of 13.2 calls them for seed accounts that pass those gates. Each RPC's `comment on function` ends with: `Does not check consent, publish or restriction: the route does.`

| term of `messages_insert_org_member` WITH CHECK (A:1409-1418) | in the RPC | in the route |
|---|---|---|
| `auth.uid() = user_id` | `p_user` is inserted as `user_id`; the RPC trusts it | `p_user = user.id` from the cookie session (4.1.1, 4.3.1) |
| `kind = 'text'` | not applicable: writing `poll` / `event_card` is the reason the RPC exists | — |
| `card_event_id is null` | not applicable: set only by `chat_create_event_card` after the `P0C23` check | — |
| `media_url is null and media_kind is null` | structural: never written | — |
| `removed_at / removed_by / removed_reason null` | structural: never written | — |
| `exists (channels c … c.org_id is not null and can_post_org_channel(c.id, auth.uid(), thread_root_id))` | **re-checked**: `can_post_org_channel(p_channel, p_user, null)` → `P0C21` (false for a dm: `org_id null`, A:1329, 1375) | `ensureMember` + `isOrgChannel` (4.1.8-9, 4.3.6-7), the first wall |
| `has_recorded_consent()` | **left to the route** (reads `auth.uid()`, NULL under the service role, `20260922120500:22-24`) | `requireCanPublish` (4.1.4); `requireNotRestricted` includes the Terms half (4.3.4; `access.ts:161-206`) |
| `can_publish_now()` | **left to the route** (same reason) | `requireCanPublish` (4.1.4) |
| `messages_insert_member` (the dm policy, A:1519-1528) | refused whole: `can_post_org_channel` is false when `org_id` is null | 400 `cards_club_rooms_only` before the RPC (4.1.9) |

`chat_cast_vote` re-checks visibility (`can_view_org_channel`) and, outside a Board, the room rule (`can_post_org_channel`); the person's gates are `requireNotRestricted` in the vote route (4.3.4).

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
- A single-choice poll (`multi = false`) deletes the person's other vote on the poll first; a multi poll and a sign-up keep them. Turning a vote off is idempotent. The race on a 1-spot slot is settled by construction: `for update` on the poll row serialises every vote on one poll, then the option row; two sessions cannot both pass `v_taken >= v_cap` (DATABASE holds 9, L8).

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
       and m.thread_root_id is not null
       and m.thread_root_id = any (p_roots)
       and (m.removed_at is null or m.user_id = p_viewer)
     group by m.thread_root_id;
end $$;
```
Served by `idx_messages_thread_root (thread_root_id, created_at) where thread_root_id is not null` (DM:3.2). The explicit `thread_root_id is not null` is there so the partial index applies under plpgsql's generic plan too (a `Param` array does not prove the predicate; DATABASE-L1, Postgres source, seen for real in the COST step 3.9). It counts the viewer's OWN removed replies (B4's rule, `message-read.ts:398-403`), so a post never says "1 reply" above two rows. A root with no live reply returns no row (the caller fills 0).

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

- **Where it fires** (every DELETE path of DM:3.4 / DM `:217`): inside `org_members_drop_club_access`'s DELETE (leave / removal: the `org_members` row is already gone, so the person is not an officer and their votes go — owners too, on a removal or an account delete); inside `chat_org_members_rooms` (a demotion: event-room rows without an RSVP go, and with them the votes there); inside `chat_rsvps_room` (an RSVP withdrawn: the event-room row and the votes in that chat go); inside **`chat_repair_club` steps 5a/5b** (a non-member's rows, a stale event-room row; A:1272-1295, called by `POST /api/orgs` after creation and by the after-deploy fix; DATABASE-L5); and on every FK cascade from `channels` or `users` (the parent row is gone before the AFTER ROW trigger runs → `v_org is null → return null`; the votes are already going by cascade). "No row found = return, never raise" (A's rule); the wrap means a votes bug never blocks a leave.
- **Known gaps, accepted** (4.1 of the wave-1 contract): **the Officers room has no `channel_members` rows** (A:940: "An Officers room or a private room: nothing"), so votes there survive a demotion, a leave AND a removal (the trigger never sees a row); a `room` turned private and public again loses its members' votes (no custom-rooms UI in v1).
- **Accepted (DATABASE-L6, open point 14.38):** a vote in a CLOSED event chat goes with the RSVP too: `chat_rsvps_room` deletes the room row on `no` / a deleted RSVP at any time, also after `ends_at + 7 days` (A:1076-1092, 1112-1127: no window test), so a closed poll's `N voted` can drop after the fact and a full slot can re-open in a room nobody can act in. Alternative for after launch: skip the delete when the room is closed for everyone.

### 3.6 Grants, comments, the standing rule

- `grant execute on function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text) to anon, authenticated, service_role;` and the same for `chat_create_event_card(uuid,uuid,uuid,text,text)`, `chat_cast_vote(uuid,uuid,uuid,boolean)`, `chat_reply_counts(uuid,uuid[],uuid)`. **The trigger function gets no grant statement; the default ACL's EXECUTE for `anon` and `authenticated` is left as it is on A's five trigger functions** (asis 3.4; a trigger function is not reachable over REST, asis 4.6; DATABASE-L10). The standing-rule query excludes trigger functions.
- `comment on function` each: one line naming this section and the SQLSTATEs it raises, ending with the 3.3.1 sentence. The APPLY RECORD (3.9) is appended to the comment of **`chat_create_poll`**, never to `chat_repair_club`'s (A's record lives there, DM:2.6).
- The standing-rule query (asis 4.6) returns 0 rows after the file.

### 3.7 POST-CHECK by reading (same transaction; any failure rolls everything back)

- The four tables exist, `relrowsecurity` true, `pg_policies` count 0 each; `has_table_privilege` false for `anon` and `authenticated` on SELECT/INSERT/UPDATE/DELETE, true for `service_role` on the four, false for `service_role` on TRUNCATE.
- `pg_constraint` lists the 21 constraints of 3.1 by name on the right table; every FK `confdeltype = 'c'`.
- Each of the five functions in one loop over `(sig, vol, cfg)` (A:1686-1705 idiom): `('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)', 'v', array['search_path=""', 'TimeZone=UTC'])`, `('public.chat_create_event_card(uuid,uuid,uuid,text,text)', 'v', …the same…)`, `('public.chat_cast_vote(uuid,uuid,uuid,boolean)', 'v', …the same…)`, `('public.chat_reply_counts(uuid,uuid[],uuid)', 's', array['search_path=""'])`, **`('public.chat_votes_drop_access()', 'v', array['search_path=""'])`** (DATABASE-L10): `prosecdef`, `provolatile`, `proconfig` exactly; `has_function_privilege` for the three roles on the four callable ones.
- The trigger: `tgrelid = 'public.channel_members'::regclass`, `tgenabled = 'O'`, `tgtype = 9` (row + after delete), empty `tgattr`.
- Unchanged: the three fingerprints of 3.0.3 (`org_members_drop_club_access` stays pinned although B never calls it: its DELETE is the row path `chat_votes_drop_access` rides on, 3.5; N12); the two INSERT policy texts of 3.0.4; the grants of 3.0.5; the trigger sets of 3.0.7 plus exactly the one new trigger on `channel_members`.
- The standing-rule query = 0 rows.
- **The constants block, LAST (DATABASE-M2; one place, one raise):** it reads `got_select` (`pg_policies.qual` of `messages_select_org_member`), the 21 `pg_get_constraintdef` texts (`got_con_<conname>`) and the five `md5(pg_get_functiondef)` (`got_fn_<name>`). **If ANY of the wanted constants (`want_select`, the 21 `want_con_*`, the five `want_fn_*`) is empty**, it prints every one of them as a NOTICE in paste order — `chat-cards: want_select := $w$<text>$w$`, `chat-cards: want_con_<conname> := $w$<text>$w$`, `chat-cards: want_fn_<name> := '<md5>'` — and raises ONCE: `chat-cards: constants are empty`. Otherwise each `got_*` is compared with its `want_*` and a mismatch raises naming it (`… does not read as written`). So the first rehearsal prints every constant, the paste is one edit, and the second rehearsal can be green (13.3 Mac step 1). No real apply runs with an empty constant. The five own-function md5s are what a later file fingerprints.

### 3.8 POST-CHECK BY BEHAVIOUR (inside a nested block that raises `P0C29` so it rolls back; skips with a recorded reason when no fixture can be found)

Fixtures from real rows (A:1809-1856 idiom): a club with a Lounge, a Board, a member below admin who passes `can_publish_now() and has_recorded_consent()`, an officer, and one event of that club with `ends_at > now()`; the closed event chat when one exists (locally "Chat Seed Closed Night", CLOSE `:50`; SCHEDULE-L3: it is hand-made, a restore loses it, 13.3 says what to do). Called from psql as `postgres` with no `SET ROLE`, `current_setting('role', true)` is `'none'`, so the file's own probes pass the role guard (as A's step 7 did, A:1493). Accepted probes first, refusals after:
1. As the file's role: `chat_create_poll(lounge, member, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')` → uuid; the `messages` row has `kind = 'poll'`, `content`, `thread_root_id null`, `card_event_id null`; two options at positions 0, 1, `capacity null`. Sign-up on the Lounge with `[{"label":"s","capacity":1}]` → accepted, `anonymous false`, `multi true`. `(board, officer, …)` → accepted. Event card `(lounge, member, <event>, 'ride?', 'Event: …')` → accepted, `kind = 'event_card'`, `card_event_id` set, a `chat_event_cards` row with the note.
2. Refusals: `(board, member, …)` → `P0C21`; a poll with 1 option → `P0C22`; a sign-up with 0 or 11 → `P0C22`; a sign-up option without `capacity`, a poll option with one, a label of 81 characters, `closes_at` in the past, a content of 301, **a capacity of 1000** (DATABASE-L11) → `P0C22`; the closed event chat → `P0C21` (skipped when none exists); an event of another club, an ended event, a random uuid → `P0C23`; a note of 201 → `P0C22`.
3. Votes: `chat_cast_vote(poll, a, member, true)` → one row; `(poll, b, member, true)` → a is gone, b stays (single choice); on a `multi` poll both stay; `p_on false` deletes; a poll with a past `closes_at` (a direct insert as the file's role, since `set local` cannot move `now()`) → a vote answers `P0C25`; the 1-spot sign-up taken by the officer, then the member → `P0C26`; the same person twice → no error, one row; an option of another poll → `P0C24`; a removed message (`update messages set removed_at = now()` as the file's role) → `P0C24`; a vote by a member of another club → `P0C24`; a member (who cannot post on the Board) voting on the officer's Board poll → accepted.
4. As `authenticated` (claims set): every RPC → `42501`; `select 1 from public.chat_polls` → `42501`; `insert into messages (… kind 'poll')` → `42501` (A's policy, unchanged); a reply by the member under the officer's Board poll (`thread_root_id = <the poll message>`) → accepted (`can_post_org_channel` checks the root's `thread_root_id` and `removed_at`, not its `kind`, DM:3.7): **allowed on purpose** (a Board post may be a poll; its replies fold like any other, 11.4; open point 14.28).
5. `chat_votes_drop_access`: delete the member's `channel_members` row on the Lounge → their Lounge votes are gone, the officer's stay; re-insert the row; delete the officer's row → their votes stay.
6. `chat_reply_counts(board, array[<post>], member)` → `(post, 1)` after one live reply; nothing for a root whose only reply is removed by someone else; `(post, 1)` for the member when the removed reply is the member's own.
7. Every fixture row gone after the rollback (`not exists (select 1 from public.messages where content like 'chat-cards probe:%')`); `current_user` back to the starting role.

### 3.9 APPLY RECORD, header queries, the local check script, COST

- APPLY RECORD: `'APPLY RECORD <YYYY-MM-DD HH24:MI> UTC: tables 4, functions 5, trigger 1; file md5 <value>; probe: <result or skipped: reason>; notes: <chat_cards.notes or none>.'` appended to `obj_description('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)'::regprocedure, 'pg_proc')` (A's shape, A:1941-1959; NOTICE lines never reach the Management API, DM:2.6). **The md5 is HANDED TO the file, never written in it** (a file cannot hold its own `md5sum`: writing it in changes the file; N1). The applier runs `select set_config('chat_cards.file_md5', '<md5sum of git show origin/<branch>:supabase/migrations/20261001110000_chat_v2_cards.sql>', false);` in the same session, before the file: under the Management API that is the same request body, the line prepended to the file's text (as `chat_cards.allow_orphans` in 3.10); locally one psql invocation, `psql -v ON_ERROR_STOP=1 -c "select set_config('chat_cards.file_md5', '<md5>', false)" -f <file>` (one session, so the session-level setting reaches the file), or the line prepended to a copy. The record writes `'file md5 ' || coalesce(nullif(current_setting('chat_cards.file_md5', true), ''), 'NOT GIVEN')`; `NOT GIVEN` is not an error at apply time (a rehearsal may skip it) but fails CHECK AFTER APPLYING (4). What was applied must be what is merged (SCHEDULE-H2).
- Header PRE-CHECK queries (read-only, run on production before the apply): (1) `to_regclass('public.chat_polls')` is null; (2) the three fingerprints of 3.0.3; (3) `count(*) from messages where kind <> 'text'` = 0; (4) `select tgname from pg_trigger where tgrelid = 'public.channel_members'::regclass and not tgisinternal` = no rows; **(5) `select version()` equals the local stack's, recorded in the header by the Mac rehearsal** (SCHEDULE-L6: the deparse texts of 3.7 are server-version-dependent in principle; A's held across both, S69 `:88`). CHECK AFTER APPLYING: (1) the APPLY RECORD from the comment; (2) `select count(*) from public.chat_polls` (0 on the apply day); (3) `scripts/sql/chat-v2-after-deploy.sql` still 0 findings; (4) the `file md5` in the record equals `md5sum` of `supabase/migrations/20261001110000_chat_v2_cards.sql` on `main` after the merge (`NOT GIVEN` fails it).
- **`scripts/sql/chat-v2-cards-check.sql`** (W2-B1 writes it; LOCAL ONLY, unix-socket guard and the psql first line like `chat-v2-rooms-check.sql:1-12`): the 3.8 cases again with its own throwaway fixtures, inside one transaction ending in ROLLBACK; last line `chat-cards-check: all N cases passed`. **The vote race is proven by construction, not by the script** (DATABASE-L8): the script asserts that `pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure)` contains `for update` twice; a two-terminal walk (`begin; select chat_cast_vote(…)` in one, the same in the other, `commit` the first, the second answers `P0C26`) is an optional manual step in 13.3, not part of the script.
- **COST section of the header (the Mac fills it; DATABASE-L2):** `EXPLAIN (ANALYZE, BUFFERS)` of (1) the reply-count SELECT of 3.5 as a statement over a Board of 100 posts and 2,000 replies, once with a literal array of 100 ids and once through `prepare … ; explain execute` with a `$1` array (the generic shape), with and without the `is not null` term; (2) `select count(*) from chat_poll_votes where option_id = ?` and `delete from chat_poll_votes where poll_id = ? and user_id = ?` on a poll with 500 votes; (3) the trigger's `delete … using chat_polls` for one row; plus the wall time of one `chat_cast_vote` call (`\timing`) and the wall time of the whole file (the lock window, DATABASE-M1). Fixtures built with `generate_series` inside `BEGIN … ROLLBACK`.

### 3.10 Apply order, the window, missing schema, rollback

**Order: the branch is green (13.3) → migration B is applied on production and recorded → the branch is merged to `main` → the flag's env vars are set for Production and the project is redeployed.** Nothing from wave 2 reaches `main` before the `schema_migrations` row `('20261001110000', 'chat_v2_cards')` is written (a separate Management API request, `20260926100000_users_profile_layout.sql:74-85`). The production apply sends, in ONE Management API request, the `set_config('chat_cards.file_md5', …)` line of 3.9 followed by `git show origin/<branch>:supabase/migrations/20261001110000_chat_v2_cards.sql`, never the working tree (SCHEDULE-H2; N1). Inside the window old code (wave 1) runs on the new database and nothing changes for it (section 0). Locks: as the opening of section 3 says.

**New code on a database without B** (local before the apply, after a rollback; a Vercel Preview reads production, which has B once applied): `isMissingChatSchema` (`PGRST202` / `42883` / `42P01` / `PGRST205` / `42703` / `PGRST204`, `schema.ts:23-24`) decides.

| route / helper | when B is missing | without A (a rollback of A; A comes off after B) |
|---|---|---|
| card routes | 404 `not_found` | 404 `not_found` (`roomOf` answers `room: null` with `kind` null, 4.1.10) |
| `PUT …/vote` | 404 `not_found` | 404 `not_found` |
| `hydrateCards` | an empty map (every card null), warned once | the same |
| `snapshotCard` | null (the snapshot has `card: null`) | null |
| the report snapshot (5.3) | `card: null` | on `isMissingChatSchema` the message spec is read again with today's six columns and `card: null` (ROUTES-L5) |
| `readReplyCounts` | the wave-1 walk (`message-read.ts:390-438`), kept as the fallback | today's behaviour (no Board posts) |
| `GET /api/me/inbox` | needs only A; unaffected | `{ ok: true, clubs: [] }` (the threads route's no-`kind` retry, 7.1.1) — a deliberate departure from wave-1 3.10's 404, said out loud (SCHEDULE-M5) |
| `GET /api/orgs/[slug]/space` | needs only A; unaffected | the `channels` read's `42703` → `isMissingChatSchema` → 404 `not_found` |
| the calendar fields (7.3) | need only A | `eventRefsFor` fails on `channels.event_id` → the three fields null, one log line |
| the by-name guard (6.3) | needs only A | `kind` null → as today |
| the remove route | needs only A; unaffected | `room === null` → 404 `not_found` (6.1.5) |
| the new screens (flag on, B missing: a local `next dev` before the apply, or after a B rollback) | the tray's POST → 404 → the toast `That's not there anymore.`, the sheet closes; a vote → 404 → `onRefresh` → the fallback bubble; nothing else changes | — |

**Rollback:** restore the previous deployment FIRST (Vercel's instant rollback; it carries its own env); then, in one transaction: `drop trigger chat_votes_drop_access on public.channel_members; drop function public.chat_votes_drop_access(); drop function public.chat_reply_counts(uuid,uuid[],uuid); drop function public.chat_cast_vote(uuid,uuid,uuid,boolean); drop function public.chat_create_event_card(uuid,uuid,uuid,text,text); drop function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text); drop table public.chat_poll_votes, public.chat_poll_options, public.chat_polls, public.chat_event_cards; delete from supabase_migrations.schema_migrations where version = '20261001110000'; notify pgrst, 'reload schema';`. What it does NOT undo, listed first in the header: the `messages` rows of kind `poll` / `event_card` stay (A's CHECK allows them; old screens show their fallback text); with Franky's yes, BEFORE the tables are dropped: `delete from public.messages where kind <> 'text';` (their replies go by cascade). **Without that DELETE, B cannot be applied again: PRE-FLIGHT 3.0.8 refuses card rows with no side tables** (DATABASE-L4). Locally: run it. On production: Franky's yes, or apply B again with 3.0.8 answered by hand (`select set_config('chat_cards.allow_orphans', 'yes', false)` in the same session before the file — under the Management API "the same session" is the same request, so the line is prepended to the request body, never sent apart; verify-1's DATABASE-L4 note), never by editing the guard. Migration A's rollback comes after B's, never before. The `DROP TABLE` takes locks of the same class on `messages`, `channels` and `users` as the CREATE did.

## 4. Card routes (W2-B2)

Two new files: `src/app/api/me/threads/[id]/cards/route.ts` (POST) and `src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts` (PUT). Both `RouteCtx = { params: Promise<{ … }> }`, `await ctx.params` first (Next 16, RM:19). Both use `refuse(code, status)` = `NextResponse.json(refusalBody(code), { status })` as the messages route does (`messages/route.ts:59-61`). Bodies are parsed as the channel routes do (`members/route.ts:118-127`): JSON failure, `null`, a non-object or an array → 400 `{ ok: false, error: "Invalid JSON" }`. Ids from the path go through `isUuid` from `@/lib/pgrest` (`pgrest.ts:15`), **after auth and the flag gate** (N7: an unauthenticated call keeps its 401; the check is the vote route's gate 2b and the remove route's step 1b): **a non-uuid `[messageId]` → 404 `not_found`; a non-uuid `[id]` is not tested by the route — it falls through to `ensureMember` → 403 "Not a member"** (what the thread GET answers, `messages/route.ts:94-97`; one rule for the card routes and the remove route, ROUTES-L3).

### 4.1 `POST /api/me/threads/[id]/cards` — gates, in this order

1. auth → 401 `{ ok: false, error: "Unauthorized" }`.
2. `chatV2For(user.id)` false → 404 `not_found`.
3. `rateLimit("message-send:<uid>", { limit: 60, windowSec: 60 })` (the send bucket, shared) → `tooManyRequests(rl)`.
4. `requireCanPublish(user.id)` (Terms, restriction, verified school email) → its response. (The RPC does not re-check these: 3.3.1.)
5. JSON → 400 "Invalid JSON".
6. Shape: `readCreateCardBody(body, new Date())` (4.2) → `{ ok: false, field }` → 400 `InvalidCardRefusal` = `{ ...refusalBody("invalid_card"), field }` with `field` one of `"type" | "question" | "options" | "options.<n>" | "event_id" | "note" | "closes_at"`.
7. Word filter, `checkText` (`text-filter.ts:145-157`) on the question / title, every option label, the note, in that order → 422 `contentBlockedResponse(field)` with `field` = `question`, `options.<n>` (0-based), `note`. No @mention parsing: card text never notifies anyone (mentions are a text-message feature, 6.2 of the wave-1 contract; open point 14.32).
8. `ensureMember(supabase, channelId, user.id)` → `!ok` → `{ ok: false, error: "Not a member" }` with its status (403 or 500; never 404, RM:20.9).
9. `isOrgChannel === false` → 400 `cards_club_rooms_only`.
10. `roomOf(channelId, member)` (`message-read.ts:643-650`): `failed` → 503 `try_again`; `room === null` with `kind` set (16.2) → 503 `try_again`; `room === null` and `kind` null (a database without A) → 404 `not_found`.
11. `content = cardFallbackContent(…)` (5.1) from the cleaned body; for `type: "event"` the title and `starts_at` come from a service-role `events` read `id, title, starts_at, org_id, ends_at` — missing, `org_id !== member.orgId`, or `ends_at <= now` → 404 `event_not_found` (the RPC's `P0C23` is the second wall).
12. The RPC with the service role: `chat_create_poll(channelId, user.id, "poll" | "signup", question, options, anonymous, multi, closes_at, content)` or `chat_create_event_card(channelId, user.id, event_id, note, content)`. SQLSTATE → code by 3.2; for `P0C21` the code is `postRefusal(room, null, await clubRole(member.orgId, user.id))` with `POST_REFUSAL_STATUS` (`messages/route.ts:64-69`: 403). Missing function → 404 `not_found`; other → 503 `try_again`, logged.
13. Read back: `readChatMessage(supabase, id, { viewerId: user.id, access: member })` (`message-read.ts:797-832`; it loads the room itself at `:823` and ignores `known.room`, ROUTES-L1; the cookie client, so the card comes through 9.1's hydration and the viewer's block set, read inside `buildChatMessages`) → null → the read-back is tried once more; still null → 503 `try_again` (the row exists; the sheet then closes and the room reloads, 11.7, so no second card is posted; N8) → **`201 { ok: true, message: ChatMessage }`** (`CreateCardResponse`, TY:172). A Board card carries `reply_count: 0` (`readChatMessage` keeps `skipReplyCounts` unset, `:828`).

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

### 4.3 `PUT /api/me/threads/[id]/cards/[messageId]/vote` — gates, in this order (ROUTES-H2)

1. auth → 401. 2. `chatV2For` → 404 `not_found`. 2b. A non-uuid `[messageId]` → 404 `not_found` (4.0; N7). 3. `rateLimit("card-vote:<uid>", { limit: 120, windowSec: 600 })`. 4. `requireNotRestricted(user.id)` (includes the Terms half, `access.ts:161-206`). 5. JSON → 400; `option_id` not a uuid or `on` not a boolean → 400 `InvalidCardRefusal` (`field: "option_id" | "on"`). 6. `ensureMember` → "Not a member" (403/500). 7. `isOrgChannel === false` → 400 `cards_club_rooms_only`. 8. `roomOf` as 4.1.10.
9. **The message is re-read on the cookie client, scoped to `[id]`**: `messages` select **`id, kind, user_id, card_event_id, removed_at`** where `id = messageId and channel_id = channelId` `.limit(1)` (never `.maybeSingle()` on a read that may match twice, BN:5); no row, `kind !== "poll"`, **or `removed_at !== null`** (the viewer's own removed poll comes back through RLS) → 404 `not_found`.
10. **`blocked = await blockedIdsFor(supabase, user.id)`** (5.4) → `null` → 503 `try_again`.
11. `chat_cast_vote(messageId, option_id, user.id, on)` with the service role; SQLSTATE → code by 3.2 (`P0C24` → 404 `not_found`, `P0C25` → 409 `poll_closed`, `P0C26` → 409 `slot_full`, `P0C22` → 400 `invalid_card` with `field: "option_id"`); missing function → 404; other → 503.
12. **`hydrateCards(supabase, [row], user.id, { room, blocked })`** (5.2) with the row of step 9 → no card, or `null` → 503 `try_again` → **`200 { ok: true, card: PollCard }`** (`VoteResponse`, TY:176).

The Event card's Going / Maybe buttons call the EXISTING `PUT` / `DELETE /api/events/[id]/rsvp` (`rsvp/route.ts:130-226`: `requireTermsAccepted`, `rsvpBlocked`, 403 `campus_visiting` off campus unless a member; `{ ok: true }` only); the screen then re-reads that one message with `GET …/messages?after=<its created_at>&limit=1` (`?after=` is `>=` and oldest first, `message-read.ts:743-746`, so the card's own row comes back first) and replaces its `card` (11.8).

## 5. `cardFallbackContent`, `hydrateCards`, `snapshotCard`, `blockedIdsFor`, `eventRefsFor` (W2-B2)

### 5.1 `src/lib/chat/cards/fallback.ts` (pure, tested; imports only `../when`)

```ts
export type FallbackInput =
  | { type: "poll"; question: string }
  | { type: "signup"; question: string }
  | { type: "event"; title: string; starts_at: string; note: string | null };
export const FALLBACK_MAX = 300;
export function cardFallbackContent(input: FallbackInput, zone = CAMPUS_TIME_ZONE): string;
```
`Poll: <question>` · `Sign-up: <title>` · `Event: <title> · <Thu Oct 8, 7:30 PM>` + (` — <note>` when the note is not null). `CAMPUS_TIME_ZONE` comes through `../when` (1.4; N13). Whitespace collapsed; cut to 300 characters (the 300th replaced by `…` when cut). Never empty (a blank question cannot reach it: 4.2). Old screens, previews, search, the old inbox and reports show this text (`messages.content`).

### 5.2 `src/lib/chat/cards/hydrate.ts` (`server-only`)

```ts
export type CardRow = { id: string; kind: MessageKind; user_id: string; card_event_id: string | null };
export type HydrateOpts = { room: Room | null; blocked: ReadonlySet<string>; now?: Date };
export async function hydrateCards(client: ServerClient, rows: CardRow[], viewerId: string, opts: HydrateOpts): Promise<Map<string, Card> | null>;
```
- **`client` is the viewer's cookie client** (PRIVACY-M1). The side tables (`chat_polls`, `chat_poll_options`, `chat_poll_votes`, `chat_event_cards`) are read with the service role (no policy exists), so **it may only be given rows that came out of a viewer-scoped (cookie client) read**, never a service-role page: its callers are `buildChatMessages` (9.1) and the vote route (4.3.12, with the row of 4.3.9). Rows with `kind === "text"` are skipped. A removed message is not given to it (`buildChatMessages` filters removed rows first, `message-read.ts:533`; the vote route refuses `removed_at` first). `null` = a read failed (logged); the caller answers 503 `try_again` (never a page with a card-less poll). On a database without B (`isMissingChatSchema`): an empty map, warned once.
- Polls: `chat_polls` by `message_id in (…)` (chunks of 100), `chat_poll_options` by `poll_id in (…)` ordered by `position`, `chat_poll_votes` by `poll_id in (…)` ordered by `created_at, user_id`; **the voters' `Person`s on `client`** — `users` select `id, handle, name, avatar_url` where `id in (…)`, chunks of 100, exactly as `readGoing` does (`message-read.ts:896-906`; `users_select_authenticated` = `id = (select auth.uid()) or user_visible(id)`, `20260923090000:2330-2334`, so a restricted account's row does not come back). `name`/`handle` are NOT NULL (DM:5.2); `avatar_url` as `toPerson` does (`:478-490`): the stored value, passed through unproxied (`:488`; N23).
- **The hidden-voter rule (one rule for blocked and unreadable people):** for an option, `all` = its votes in vote order; `visible` = the voters not in `blocked` whose `Person` came back. `count` = `all.length` (counts never change, D1). `voters` = the first 12 of `visible` (a poll) or all of `visible` (a sign-up); `voters_more` = `visible.length − voters.length` (a poll) or 0 (a sign-up). `anonymous` → `voters: []`, `voters_more: 0` for everyone, the creator and officers included.

| `PollCard` field | computed |
|---|---|
| `type` | `mode` |
| `question`, `anonymous`, `multi`, `closes_at` | the row |
| `closed` | `closes_at !== null && closes_at <= now`, OR `room.kind === "event"` and `roomState(room.event.starts_at, room.event.ends_at, now) === "closed"`. Never true because the viewer cannot post on a Board. |
| `total_voters` | distinct `user_id` over the poll's votes (blocked and unreadable people included) |
| `options[].count` | votes on the option (all of them) |
| `options[].capacity`, `full` | the row; `full = capacity !== null && count >= capacity` |
| `options[].mine` | a vote by the viewer on the option |
| `options[].voters`, `voters_more` | the hidden-voter rule above |

- Event cards: `chat_event_cards.note` by `message_id in (…)`; `card_event_id` comes on the row (`MessageRow.card_event_id`, `message-read.ts:102`; the vote route never hydrates an event card). `card_event_id` null → `{ type: "event", note, event: null }` (cancelled). Else `event` = `eventRefsFor(<the events' rows>, viewerId, { now })` (5.5) for every event card of the page in one go, from a service-role `events` read `id, title, starts_at, ends_at, location, org_id` where `id in (…)`; an event that cannot be read → `event: null` too, logged.

### 5.3 `src/lib/chat/cards/snapshot.ts` (`server-only`)

```ts
export type CardSnapshot =
  | { type: "poll" | "signup"; question: string; anonymous: boolean; multi: boolean; closes_at: string | null;
      options: { label: string; capacity: number | null; count: number }[] }
  | { type: "event"; event_id: string | null; title: string | null; starts_at: string | null; note: string | null };
export async function snapshotCard(messageId: string): Promise<CardSnapshot | null>;
```
Service role. No voter names, no ids of people. `null` for a text message, a missing card row, or a database without B. **The report route** (`src/app/api/me/reports/route.ts:318-333`, the `message` spec): `columns` becomes `"id,user_id,channel_id,content,media_url,created_at,kind,thread_root_id"`; **on `isMissingChatSchema(error)` the spec is read again with today's six columns and `card: null`** (ROUTES-L5; today any read error is 500, `:295-299`); after `readTarget` the message snapshot gains `card: await snapshotCard(id)` (only when `kind !== "text"`; else `card: null`). `CardSnapshot` lives in `types.ts` (additive). `snapshotCard` runs after `readTarget` proved the reporter can read the message on their own client (`:291-301`); the snapshot never returns to the reporter.

### 5.4 Where the card routes and the reads get the pieces they share

- `src/lib/chat/blocks.ts` (`server-only`, W2-B2): `blockedIdsFor(client, viewerId): Promise<Set<string> | null>` — ONE `blocks` read on the viewer's cookie client, `.or("blocker_id.eq.<v>,blocked_id.eq.<v>")` (the `loadHiddenUsers` shape, `src/lib/safety/hidden-users.ts:30-34`; RLS `blocks_select_either` shows exactly the viewer's pairs, DM:5.1), both directions, the viewer removed; `null` on a failure. Mutes do not hide anything in club rooms. **Read once per request** (9.1: the thread GET reads it once and hands it down; the vote route once; the inbox once; `buildChatMessages` reads it itself only when no caller did).
- `src/lib/chat/stub.ts` (pure, tested, W2-B2): `isHiddenFrom(row: { user_id; thread_root_id }, blocked, room: Room | null, authorRole: ClubRole | null): boolean` — **false whenever `room` is null** (a dm or a group never stubs, ROUTES-H1; tested) — and `asStub(row): ChatMessage` (8.1).
- `src/lib/chat/event-refs.ts` (`server-only`, W2-B2), 5.5.
- `handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs` (W2-B2; SCHEDULE-M6): `node validate-thread.mjs <file> --role member|officer --room board|lounge|event|dm` reads a saved `ThreadMessagesResponse` JSON and checks every field of `ChatMessage`, `PollCard`, `EventCard`, the stub shape of 8.1 (every stub field at its pinned value), `room` and `viewer` against `types.ts`; a fixture test under `wave-2-build/tools/fixtures/` (one page per room kind, one stub, one of each card) runs in `npm test`'s glob only if placed under `src/**` — so the fixtures test is a plain `node --test tools/validate-thread.test.mjs` named in 13.3. The Mac feeds it the real answers of 13.3 steps 2 and 4.

### 5.5 `eventRefsFor` — one `EventRef` builder for every read (`src/lib/chat/event-refs.ts`)

```ts
export type EventRow = { id: string; title: string; starts_at: string; ends_at: string; location: string | null; org_id: string | null };
export async function eventRefsFor(events: EventRow[], viewerId: string, opts?: { now?: Date; counts?: boolean }): Promise<Map<string, EventRef> | null>;
```
Service role, three reads for the whole list: `rsvps` select `event_id, user_id, status` where `event_id in (…)` and `status in ('going','maybe')` (chunks of 100 events; up to 500 rows per chunk with `count: "exact"`, the counts asked apart past the cap as `readRoomEvent` does, `message-read.ts:940-969`); `channels` select `id, event_id` where `event_id in (…)`; `channel_members` select `channel_id` where `channel_id in (room ids)` and `user_id = viewer`; plus `org_members` select `org_id, role` for the viewer where `org_id in (the events' orgs)`. **With `counts: false` the `rsvps` read is skipped and `going_count` / `maybe_count` / `viewer_status` are `0` / `0` / `null`** (the calendar calls it so, 7.3: it needs `channels`, `channel_members` and `org_members` only; ROUTES-L6). Then per event: `state = roomState(starts_at, ends_at, now)`; `room_id` = the room's id when the viewer holds a row on it OR is an owner/admin of the club (the rule of `can_view_org_channel`'s event arm, DM:3.6), else null; `viewer_status` from the viewer's own RSVP row; `going_count` / `maybe_count` from all RSVPs; `location` `""` when null. `null` on any failed read. Not `event_rsvp_counts()` (it applies `event_visible` to the caller and the service role has no `auth.uid()`, DM:5.10; open point 14.33).

## 6. The officer / mod remove route and `RemovedContentCard` (W2-B3)

### 6.1 `DELETE /api/me/threads/[id]/messages/[messageId]` (`src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, 60 lines today, RM:6)

Not gated by the flag (Franky's call 27 is for everyone; no old screen has a button, so with the flag off it is an API-only change: section 0, row 4). Gates, in this order:

1. `await ctx.params`; auth → 401 `"Unauthorized"` (as today, `:17-25`). 1b. **A non-uuid `[messageId]` → 404 `not_found`** (after auth, so an unauthenticated call keeps its 401; today the cast fails and the route answers 500, `:36-38`; N7); **a non-uuid `[id]` falls through** to step 2's cookie read (0 rows) and step 3's `ensureMember` → 403 "Not a member" (ROUTES-L3, as the card routes and the thread GET).
2. **The sender's own delete, unchanged**: the row on the cookie client `id, user_id, channel_id` scoped to `[id]` (`:30-35`); a row with `user_id === user.id` → the hard delete as today (`:50-59`), also for a card (the cascade takes `chat_polls` → options → votes, `chat_event_cards`; for a Board post, its replies) and also when a report is open (12.6 of the wave-1 contract, accepted). **Answer `{ ok: true }` as today** (the new screens read `ok` only; `RemoveMessageResponse` is the moderator's answer, ROUTES-L4).
3. A row by someone else, or no row: `ensureMember(supabase, channelId, user.id)` → `!ok` → 403/500 "Not a member". `isOrgChannel === false` (a dm or a group) → **403 `not_allowed`** (today's 404 "Message not found" for no row and 403 "Only the sender can delete this message" for another's row, `:40-45`, both become the code's sentence; no screen matches on either, ROUTES-L4).
4. `rateLimit("message-remove:<uid>", { limit: 30, windowSec: 600 })` → `tooManyRequests`. `requireNotRestricted(user.id)` → its response. The two gates sit after step 2 on purpose: the sender's own delete keeps today's path, unlimited; a stranger's call still costs one cookie read and one `ensureMember` before them (wave-1 6.3 wrote them first; the order here is deliberate, N19).
5. `roomOf(channelId, member)`: `failed` → 503; `room === null` → 404 `not_found` (no chat schema: nothing to moderate).
6. `callerRole = await clubRole(member.orgId, user.id)`; not in `ROOM_MODERATOR_ROLES` → 403 `not_allowed` (**the role check runs before `outranks`**, 14.10).
7. **No row in step 2** (RLS hides someone else's removed message): one service-role read `id, user_id, removed_at` scoped to `[id]`; no row → 404 `not_found`; `removed_at` set → **`200 { ok: true, removed: true, already: true }`** (`RemoveMessageResponse`, TY:313); `removed_at` null with no cookie row = the caller cannot read it (a private room they are not in; a mod and the Officers room) → 404 `not_found`.
8. `authorRole = await clubRole(member.orgId, author)` (null when they left); `outranks(callerRole, authorRole) === false` → 403 `not_allowed` (owner 3, admin 2, mod 1, member or gone 0; equal rank allowed, `room-rules.ts:67-71`).
9. An OPEN report on this message: service role `reports` select `id` where `target_type = 'message' and target_id = messageId and status = 'open'` `.limit(1)` (the `openReportCount` shape, `reports/route.ts:419-440`; a missing `status` column → treat every row as open) → any row → 409 `report_open`.
10. Service role: `update messages set removed_at = now(), removed_by = user.id, removed_reason = OFFICER_REMOVED_REASON where id = messageId and channel_id = channelId and removed_at is null` selecting `id`; 0 rows (removed a moment ago) → `200 { ok: true, removed: true, already: true }`; else **`200 { ok: true, removed: true }`**. Never a hard delete. No `moderation_actions` row, no report closed (6.3 of the wave-1 contract; the record is `removed_by` + `removed_at`).

What the old and new readers then see: the author reads their message with `removed: { by: "officer", at, reason: null }` (`removedInfo`, `message-read.ts:497-505`; the stored marker `OFFICER_REMOVED_REASON = "Removed by a club officer."`, `room-rules.ts:31`, is a comparison key, never reworded); everyone else stops seeing it (`messages_select_org_member`); replies under a removed Board post stay in the database but `can_post_org_channel` refuses new ones and `?root=` answers 404 `board_post_missing` (`rootState`, `message-read.ts:659-681`); its card is not hydrated (5.2); its votes stay in the side tables (nothing reads them; the sender's hard delete cascades them).

### 6.2 `RemovedContentCard` gets `by` (`src/components/safety/ReportSheet.tsx:658-716`)

```ts
by?: "officer" | "moderator";   // default "moderator": every caller today keeps its copy
```
- `by === "officer"`: first line **`Removed by a club officer.`**; no reason line (an officer's `reason` is null); second line **`Only you can see this message.`**; no email, no Community Guidelines link (D9: no appeal path for a club's own moderation). A mod's removal reads the same line (the payload carries no rank; D9's literal is kept; the alternative `Removed by your club's officers.` is open point 14.39, PRIVACY-L1).
- `by === "moderator"` (or absent): today's copy, unchanged (`Removed by Vibe moderators`, the reason, `Only you can see this <kind>. Questions: help@connectvibe.app.` + the link). The four callers today (`PostViewerMobile.tsx:860,1298`, `MessagesMobile.tsx:4562`, `CampusMobile.tsx:1578`, `campus-home.tsx`) pass nothing and change nothing.
- The new room thread (11.5) renders `<RemovedContentCard kind="message" compact by={m.removed.by} removedAt={m.removed.at} removedReason={m.removed.reason} />` for `m.removed !== null`. The old `MessageBubble` branch (`MessagesMobile.tsx:4556-4569`, reads `removed_at`, unreachable) stays as it is.

### 6.3 The by-name allow-list guard (D8; `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:105-190`)

Right after `requireChannelStaff` in POST (`:113-114`; `guard.channel.kind` is loaded by `loadClubOfficer`, `officer-guard.ts:122-135`, and never read today, RM:12.1): `kind` in `("board", "lounge", "event")` → 409 `refusalBody("room_locked")`; `officers`, `room` and a null `kind` (no chat schema) → as today. The DELETE of `members/[userId]` is unchanged (removing a meaningless row is harmless). `room_locked` stays the code for a reserved name in the create / rename forms (C4; the sentence `This room can't be renamed, hidden or deleted.` is accepted for v1, open point 14.9). API-only with the flag off: the desktop Access tab never shows for event rooms or public rooms (`campus-home.tsx:3246-3247`).

## 7. The three reads and the calendar fields (W2-B4), field by field

Contract 7's rule, restated: **the cookie client for anything RLS decides** (which rooms I am in, which messages I may read, the club refs, which people I may see), **the service role only for counts** and for what no policy exposes to a member (`org_members` roles of other people, `events`, `rsvps` of others, the card side tables); **never a roster**. Every count filters `removed_at is null` and `thread_root_id is null`. A null `last_read_at` is read as the row's `created_at` (legacy rows only: A wrote `last_read_at = now()` on every row it made, DM:5.4; `channel_members.created_at` exists, `20260430190000_phase1_initial_schema.sql`). A failed cookie read that decides visibility → 500 `{ ok: false, error: "Request failed" }` (fail closed, like the threads route `:507-541`); a failed service-role count → that field at its empty value (0 / false / null) and logged, never a 500.

### 7.1 `GET /api/me/inbox` (`src/app/api/me/inbox/route.ts`) → `InboxResponse` (TY:355)

Gates: auth 401 → `chatV2For` 404 `not_found`. Then, in order:
1. **My rooms** (cookie): `channel_members` select `channel_id, created_at, last_read_at, pinned_at, muted_until, channels!inner(id, org_id, kind, name)` where `user_id = me` and `channels.org_id not null` (`created_at` for step 5's legacy rows, N10; the columns: `20260430190000:104-111`, `pinned_at` `20260505140000:5`, `muted_until` `20260506120000:15`) (the threads route's read, `threads/route.ts:436-451`, with the same no-`kind` retry → a database without A answers `{ ok: true, clubs: [] }`, 3.10). Group by `org_id`; a club with no `board` or `lounge` row for me is left out (the after-deploy check would list it).
2. **Club refs** (cookie): `orgs` select `id, handle, name, logo_url, banner_url, verified` where `id in (…)` → `OrgRef` with `orgAssetProxyUrl` (`threads/route.ts:529-536`). **My roles** (cookie): `org_members` select `org_id, role` where `user_id = me` → `viewer_role` (a club with no role row is left out).
3. **Blocked ids** (cookie, 5.4): `blockedIdsFor` → null → 500.
4. **Previews (cookie): TWO reads, one per room kind** (ROUTES-M1; the thread list's own pattern, `threads/route.ts:646-692`, so a busy Lounge never starves the Board's preview): `messages` select `id, content, created_at, user_id, kind, thread_root_id, users:users!messages_user_id_fkey(name)` (the hint is required: `messages` has two foreign keys to `users`, `user_id` and `removed_by`, `20260923090000:2146`, and a bare `users(...)` embed answers `PGRST201`; every existing read names it, `message-read.ts:66`, `:190`; N2) where `channel_id in (<the Board ids>)` and `thread_root_id is null`, order `created_at desc`, `limit(boardIds.length * 5)`; the same over the Lounge ids. Per room, the newest row that is not a stub for me: a row whose author is in `blocked` is skipped, except a Board row by a blocked author who is a CURRENT owner/admin of the club (8.3; one service-role `org_members` read `org_id, user_id, role` for the blocked authors met, when any). `Preview = { id, text: content, author_name: row.users?.name ?? "", created_at, kind }` (`author_name` is `""` when the author's `users` row is not readable — a restricted account; the row then shows the text alone, ROUTES-L8). Nothing in a room's window → `latest: null` (a room whose last 5 top-level messages are all from blocked people shows null; accepted).
5. **Unread** (service role, counts): per Board: `messages` `count: "exact", head: true` where `channel_id = board and thread_root_id is null and removed_at is null and user_id <> me and created_at > <my last_read_at ?? my row's created_at>` → `board.unread = count > 0`; per Lounge the same → `lounge.unread_count = min(count, 99)`. Blocked people's messages count (D1: counts unchanged; open point 14.37: a Lounge can say `N new` for messages the viewer will not see, opening it clears the count). Two head counts per club; clubs per member are few (production: 5 clubs in all).
6. **`next_event`** (service role): `events` select `id, title, starts_at, ends_at, location, org_id` where `org_id in (…)` and `ends_at > now()` order `starts_at asc` **`limit(clubs.length * 10)`** (ROUTES-L7) → the first per club → `eventRefsFor` (5.5, counts on) → `next_event: EventRef | null`; a club whose next event falls outside the window shows `next_event: null` (accepted).
7. **`last_activity_at`**: the newest `created_at` among `board.latest`, `lounge.latest` and, for the event rooms I hold a row on (step 1, `kind = 'event'`), one cookie read `messages` select `channel_id, created_at` where `channel_id in (<event room ids>)` and `thread_root_id is null` order desc `limit(ids.length * 3)`, newest per room. Null when all three are null. NOT `orgs.last_activity_at`.
8. **`pinned_at`, `muted_until`**: from my Lounge row (step 1). `muted_until` is sent; the home uses it for the All badge only (11.1; open point 14.22).
9. **Order**: `pinned_at` not null first (newest pin first), then `last_activity_at` desc (nulls last), then `org.name`.

### 7.2 `GET /api/orgs/[slug]/space` (`src/app/api/orgs/[slug]/space/route.ts`) → `SpaceResponse` (TY:378-390)

Gates: auth 401 `{ ok: false, error: "Unauthorized", code: "unauthorized" }` → `chatV2For` 404 `not_found` → **the channels-list sweep, copied** (`channels/route.ts:41-95`, RM:13.2): service-role `orgs` select `id, handle, name, logo_url, banner_url, verified, hidden_at` by `handle = slug` → missing → 404 `not_found`; service-role `org_members.role` for me → error 500 `load_failed`; no role → `hidden_at ? 404 not_found : 403 refusalBody("members_only")`. `unauthorized` (401, `Unauthorized`) and `load_failed` (500; here `Couldn't load this club.` in place of the channels route's `Failed to load channels`) are outside `RefusalCode` on purpose: the sweep is copied, not retyped, and no screen matches on either (N20). Then:
1. `org`: `OrgRef` + `member_count` = service-role `org_members` head count (`orgs/[slug]/route.ts:278-281`; a failed count → 0).
2. `viewer`: `{ role, can_moderate: canModerate(role) }`.
3. **`rooms`** (cookie): `channels` select `id, kind, name, event_id, position` where `org_id = org.id and type = 'org_channel'` — RLS (`can_view_org_channel`) leaves out Officers unless I may enter it, and event rooms I hold no row on unless I am an officer. My `channel_members` rows for those ids (cookie: `channel_id, last_read_at`). Per room: `unread` = the service-role head count of 7.1.5 `> 0` (for `event` and `room` kinds too); **a room with no `channel_members` row for me (Officers; a private `room` I enter by role or by the allow-list) → `unread: false`** — such rows do not exist (A:905-938) and mark-read is an `update` that cannot create one (`read/route.ts:19-23`; ROUTES-M2; open point 14.36: the Officers chip never carries a dot in v1; 11.5 does NOT skip the mark-read call for such a room — the update matches nothing and answers `{ ok: true }`; verify-1's one WRONG, N16); `can_post` = `board` → `viewer.role in BOARD_POSTER_ROLES`; `event` → `roomState(...) !== "closed"`; else `true` (a TypeScript rule as the list's, `threads/route.ts:789-803`; the thread GET's `viewer.can_post` is the database's answer and wins on the screen); `event` = `eventRefsFor` over the event rooms' events (one call, counts on) → `EventRef | null` (`room_id` = the room's own id: I can read it). **Order**: `lounge`, `board`, `officers`, event rooms with `state !== "closed"` by `starts_at` asc, then `room`s by `position` then `name`; closed event rooms are left out (they are reachable by URL, 2.3, but take no chip).
4. **`board_latest`** (cookie, ROUTES-M3): no `board` among `rooms` (a club whose Board was deleted in the wave-1 window; the after-deploy check lists it) → `board_latest: null` and one log line, never a throw (N17); else `boardRoom = await loadRoom(board.id)` (`rooms.ts:130`; null → 503 `try_again`); then `readChatMessages(supabase, board.id, { limit: 6 }, { viewerId: user.id, access: { ok: true, isOrgChannel: true, orgId: org.id, accepted_at: null, cleared_at: null, kind: "board", eventId: null }, room: boardRoom })` (`message-read.ts:700-790`: it clamps, reads roles, reply counts, cards and stubs — the block set inside `buildChatMessages`, 9.1 — and answers 503 on an incomplete page) → `!ok` → its `status` and `body`; the answer's array is **oldest first** (`:783`), so `board_latest` = the last message in it that is not `hidden`; none → null. Never `toChatMessages` (it drops the `complete` flag).
5. **`up_next`** (service role): `events` where `org_id = org.id and ends_at > now()` order `starts_at asc` limit 3 → `eventRefsFor` → `EventRef[]` (soonest first; `viewer_status` null when I did not RSVP — the card then shows no mark, 1.2).
6. **`?events=1` → `upcoming: EventRef[]`** (ROUTES-M4, the Share-an-event sheet's list; not sent otherwise): the same `events` read with `limit 50` → `eventRefsFor` (counts on; the sheet shows nothing that needs them, but `EventRef` carries them). `SpaceResponse` gains **`upcoming?: EventRef[]`** in `types.ts` — the one unavoidable shape change of wave 2, additive and optional, W2-B2's edit (13.1). Reason: `GET /api/events?org_id=` answers `[]` for a hidden club to everyone, its members included (`events/route.ts:212-216`), while the card RPC accepts the event; the space read already knows the viewer is a member. Open point 14.44.

### 7.3 `GET /api/me/calendar` — the three fields (`src/app/api/me/calendar/route.ts:56-138`; NOT gated)

- The RSVP select gains `org_id`: `event:events!inner(id,title,starts_at,ends_at,location,org_id, org:orgs(handle,name,verified))` (a plain column, cookie client; `org` stays the RLS embed, null for a private club I left, RM:8).
- After the rows: `flagOn = await chatV2For(user.id)`. Flag off → every `rsvp` entry gets `org_id: null, room_id: null, room_state: null` (`CalendarRoomFields`, TY:362-366). Flag on → **`eventRefsFor(<the rsvp events>, user.id, { counts: false })`** (service role, 5.5; no `rsvps` read — the calendar sends no counts, ROUTES-L6) → `org_id: ev.org_id`, `room_id: ref.room_id`, `room_state: ev.org_id ? ref.state : null`. A failed `eventRefsFor` → the three fields null on every entry and one log line; the calendar never answers 500 for them. `personal` entries are untouched. The `color` field and everything else stay as today (desktop "My Calendar" reads this route; section 0, row 6).

## 8. Blocking in club rooms (D1, D2): the stub, and every place a block applies

Franky (Sept 29, W0 `:56`): **both ways**; when either of two people blocked the other, neither sees the other's messages in club rooms, nor the other's name in polls, sign-ups and "who's going"; counts do not change; **one exception: a top-level Board post by a current officer shows to every member**. The B0 reviewers' worry (a relayed sentence without the exception) is answered by that later call (BN:8); it stays an open point (14.1) so Franky can strike the exception or any of its three narrowings (PRIVACY-L7): built as a top-level Board post (replies never), by someone who is an owner or admin of the club **now** (a demoted or departed officer's old posts become stubs), and the exception is for the post itself, never for a quote of it.

### 8.1 The stub (the exact shape; `asStub(row)` in `src/lib/chat/stub.ts`)

```ts
{ id, created_at, thread_root_id,           // the three fields the screens key and page on, unchanged
  kind: "text", hidden: true, content: "", user_id: "", users: null, card: null, reactions: [],
  attachment: null, attachment_id: null, attachment_kind: null, media_url: null, media_kind: null,
  parent_message_id: null, parent_preview: null, reply_count: null, author_role: null, removed: null }
```
It fits `ChatMessage` as typed today (`content: string`, `user_id: string`, `users: Person | null`, TY:231-272); no type change. `kind` is always `"text"` on a stub (a card's kind would say what the hidden thing is). `thread_root_id` is kept so a reply stub folds under the right post and `?root=` paging stays stable; `created_at` so `?after=` paging and the every-5th drop rule (9.3) work. `user_id: ""` matches no viewer (`isMine`) and no author. Screens render nothing for a stub and keep it in the array. What a stub lets the viewer infer (someone here is in a block pair with me) the profile already tells them (`bootstrap/route.ts:205-232`, "This account has restricted you").

### 8.2 The rule (`isHiddenFrom`, pure)

```
hidden = room !== null
      && blocked.has(row.user_id)
      && !(room.kind === "board" && row.thread_root_id === null && authorRole ∈ BOARD_POSTER_ROLES)
```
**`room !== null` first** (ROUTES-H1): a dm or a group never stubs and never reads `blocks` (today a group with a blocked member stays visible with all its messages, `threads/route.ts:730-738`; hiding inside group chats is open point 14.42, not a side effect). `blocked` = `blockedIdsFor(cookie client, viewerId)` (5.4). `authorRole` = the author's CURRENT role from the page's `org_members` read (`readRoles`, `message-read.ts:354-374`, already one read per page). The viewer's own rows are never stubs (`blocked` never holds the viewer).

### 8.3 Every place it applies (all in wave 2, flag-independent where the route is not gated)

| where | rule |
|---|---|
| `GET …/messages` **in a club room** (top-level page, `?after=`, `?before=`, `?root=` replies) | each row → `asStub` when hidden (9.1); a reply under a Board post by a blocked officer is a stub too (the exception is top-level only) |
| `parent_preview` of a visible message | **null whenever `parent_preview.user_id` is in `blocked` — no Board exception** (never quote a blocked person; PRIVACY-M2). Decided in `buildChatMessages` at the mapping step, after `hydrateParentPreviews`; `parent_message_id` stays as sent (the old bubble draws no quote when the preview is null, `MessagesMobile.tsx:4477-4478`). No role read for parents. |
| `reply_count`, reactions counts, `going_count`, `maybe_count`, `total_voters`, `options[].count`, `unread`, `unread_count` | **unchanged** (D1; open point 14.37) |
| `room.event.going` (`readGoing`, `message-read.ts:881-922`) | the set is handed down: `describeRoom(client, room, viewerId, blocked)` → `readRoomEvent(…, blocked)` → `readGoing(…, blocked)` (ROUTES-M5); blocked ids are left out at the per-step filter (`candidates = step.filter(id => members.has(id) && !blocked.has(id))`), and the next room member going takes their place: still "the first 8 visible" |
| `PollCard.options[].voters`, `voters_more` | 5.2's hidden-voter rule (blocked and unreadable people alike) |
| `POST …/cards` 201, `PUT …/vote` 200 | read back on the viewer's client with the viewer's block set (a card is never hidden from its author) |
| `GET /api/me/inbox` `board.latest`, `lounge.latest` | skip stubbed rows; the Board's officer exception applies (7.1.4) |
| `GET /api/orgs/[slug]/space` `board_latest` | the newest non-hidden of the latest 6 (7.2.4) |
| **`GET /api/me/threads` (the OLD inbox) club-room `last_message`** | the newest row of the room's 5-row window whose `user_id` is not in `hiddenRes.hidden.blocked`; **no Board exception** (the old list reads no roles; the officer's post still opens in the thread) (PRIVACY-H1; 12.4) |
| the old screens (12.1) | filter `hidden: true` rows out of the array before grouping; nothing else |
| the new screens | render nothing; keep the row in state; a stub never counts for "Say hi" emptiness (a room of stubs shows the empty line) |
| a dm or a group | never a stub; `hidden` stays false there, as in wave 1 |

### 8.4 What a block does NOT do in v1

- It does not change `channel_members` (both keep their rooms), the roster of a group chat, or a poll's counts.
- It does not hide the person's **name on a Board post** they wrote as an officer (the exception), nor their vote from the count.
- It does not hold against a direct PostgREST read (D2, 8.7).
- Reactions BY a blocked person on a visible message still count and still show their emoji (reactions carry no name in the JSON, `ReactionGroup`, `reaction-emoji.ts:48-52`).
- A stub's message can still be reported by its id over the API (`POST /api/me/reports`): `readTarget` reads it on the reporter's client, the answer is `{ ok: true }` whatever happened (`reports/route.ts:442, :513, :542, :574`) and the snapshot never returns to the reporter, so nothing leaks; the report route is not changed for it. No screen draws a long-press for a stub (PRIVACY-L2).

### 8.5 The DM path is unchanged

`dmSendBlocked` (`src/lib/safety/pair-block.ts:154-173`) and the dm INSERT policy still refuse a send between blocked people; the old inbox still skips a 1:1 with a blocked peer (`threads/route.ts:732-738`); a group chat with a blocked member stays visible with all its messages. Club rooms never asked about blocks before wave 2 (`messages/route.ts:415-417`), and a send into a club room is still not refused by a block (both keep posting; each stops seeing the other).

### 8.6 Why the stub applies with the flag OFF too (open point 14.12)

The App Store submission is Oct 16 and Apple's reviewer is not on the allow-list; the reviewer tests Block (plan-critique `:231`). If stubs were gated by `chat_v2`, a blocked person's club-room messages would still show to the reviewer. So the club-room thread GET stubs for everyone, the four old renderers filter stubs out (12.1), and the OLD inbox's club-room preview skips blocked authors (12.4) — the reviewer lands on that list right after Block. This is row 1 of section 0's list. **The cost everyone pays:** one `blocks` read per club-room thread GET (read once per request and handed down, 9.1; the desktop's 2-s pollers included), where a failed read answers 503 `try_again` where today's read succeeds; and one per club-room send answer, where a failed read nulls the quote and never 503s (9.1; N3). Dms and groups pay nothing. The alternative (gate it) is written in 14.12.

### 8.7 Against a direct database read: NOT in v1 (D2), written down for after launch

Today a member with the anon key and their JWT reads every non-removed message of every room they can view, blocked authors included (`messages_select_org_member`, DM:7); the routes are the app's only readers; before the block both people were club members and could read each other; `messages_select_org_member` is the hottest policy (A's COST section) and every change to it is B1a-style work that cannot be rehearsed in the cloud. After launch, its own migration restates the policy with this arm (the B1a security review's F6b clause, DM:7), in the policy's own initplan form (PRIVACY-L3):

```sql
AND (NOT public.is_blocked_either_way(( SELECT auth.uid() ), user_id)
     OR (thread_root_id IS NULL AND EXISTS (
           SELECT 1 FROM public.channels c2
             JOIN public.org_members m ON m.org_id = c2.org_id AND m.user_id = messages.user_id
            WHERE c2.id = messages.channel_id AND c2.kind = 'board' AND m.role IN ('owner', 'admin'))))
```
`is_blocked_either_way` is callable from a policy under `authenticated` because its first argument is the caller (`20260928100000:353-354`; it refuses only when BOTH ids differ from the caller). The own-row arm (`user_id = ( SELECT auth.uid() )`) is untouched: `is_blocked_either_way(uid, uid)` is false by `blocks_check (blocker_id <> blocked_id)` (DM:5.1). That file also restates `message_reactions_select_member` (reactions of a stubbed message). It does not touch `channel_members` (the roster is the going list, by design) and needs no restatement of `chat_poll_votes` (no policy, `revoke all`, 3.1).

## 9. What wave 2 changes in the thread GET (`message-read.ts`, `messages/route.ts`; W2-B2)

Additive only. The payload of 6.1 of the wave-1 contract is unchanged in shape.

### 9.1 The block set, `buildChatMessages` (`message-read.ts:531-583`) and the plumbing

- **`ReadKnown` and `MessageContext` gain `blocked?: ReadonlySet<string>`.** `readChatMessages` and `readChatMessage` pass `known?.blocked` through to the context.
- **`buildChatMessages`**: when `room === null`, `blocked` is the empty set and no read is made. When `room !== null` and `ctx.blocked` is absent, it reads `blockedIdsFor(client, viewerId)` FIRST (one extra round trip; `null` → `complete: false` → the caller's 503 / null); when the caller passed it, nothing is read (SPLIT-M6, ROUTES-M3: every caller of `toChatMessages` gets stubs — the send answer at `messages/route.ts:601`, the card read-back, the space route's `board_latest`). **`toChatMessages` (the send answer) never 503s for the block set**: it returns `.messages` and drops `complete` (`message-read.ts:522-529`; its own comment says why — a 503 for a message already stored invites a resend, `:513-517`; the POST at `:601-607` never reads `complete`). When the read fails there, the answer is the sender's own row with `hidden: false` and `parent_preview: null` (never quote a blocked person on a guess), logged once. The POST's code is unchanged; the rule lives in `buildChatMessages` (N3). Then the `Promise.all` at `:541-546`: the roles read, `readReplyCounts` (9.4), reactions, parent previews, **and `hydrateCards(client, cardRows, viewerId, { room, blocked })`** over the page's rows with `kind !== "text"`. At the mapping step (`:574-578`), with the roles in hand: `hidden` by 8.2 → the row is replaced whole by `asStub(row)` (its card, if hydrated, is dropped); else `card: cards.get(row.id) ?? null`, and `parent_preview` nulled when its `user_id` is in `blocked` (8.3). `null` from hydrate → `complete: false` → 503.
- **The thread GET** (`messages/route.ts:130-138`) reads the set ONCE: after `roomOf`, `const blocked = found.room ? await blockedIdsFor(supabase, user.id) : new Set<string>()`; `null` → 503 `try_again`; then the `Promise.all` with `readChatMessages(…, { viewerId, access: member, room: found.room, blocked })` and `describeRoom(supabase, found.room, user.id, blocked)` (ROUTES-M5). Signatures (W2-B2 owns `message-read.ts`): `describeRoom(client, room, viewerId, blocked: ReadonlySet<string>)` → `readRoomEvent(client, room, viewerId, blocked)` → `readGoing(client, service, room, goingIds, blocked)`; `readThreadRoom` (`:1066-1078`, no caller in `src` today) reads it itself.
- The vote route (4.3.10) and the inbox (7.1.3) read it once each; the card POST's read-back lets `buildChatMessages` read it.

### 9.2 `?after=` that is not a timestamp → 400 `invalid_after`

Both places: `readChatMessages` (`message-read.ts:709-713`: `failed(400, "Invalid after")` → `refusal("invalid_after", 400)`, a helper next to `postMissing` / `tryAgain` at `:629-630`; `ReadFailure.body` already admits a `Refusal`, `:606-610`) and the route's own check (`messages/route.ts:112-118`) answer `refusalBody("invalid_after")` with 400. `cleanAfterParam` itself is unchanged. `?before=` stays as today (no code). Section 0, row 2.

### 9.3 The polling rule the screens follow (contract 6.1, D7; nothing new in the route)

- `?after=<the created_at string the server sent, echoed unchanged>` every 4 s while `document.visibilityState === "visible"`; the client drops ids it already has.
- **Every 5th poll and on return from the background: the last page WITHOUT `after`** (`?limit=50`), then `mergeFullPage(state, page)` (pure, tested, `src/lib/chat/page-merge.ts`, W2-S2): rows in the page replace rows in state by id (votes, RSVP counts, reactions, reply counts, removals, stubs); a row in state whose `created_at >= page[0].created_at` (the page's oldest) and whose id is not in the page is dropped (deleted or removed since) — **except a row whose id starts with `temp_`** (an optimistic send in flight is never dropped by `mergeFullPage`; N18); rows older than the page's oldest stay; `room` and `viewer` are taken from this read only.
- A deep link hands the resolving read's body to the hook as `initialPage` (2.3), so the room is read once on arrival (SCREENS-L10).
- No `?brief=` switch in v1: the route keeps computing `room` / `viewer` on every call (C1; the 4-s polls ignore them). The cost is 9–13 PostgREST calls per club-room read (BN:3, B4 F2); clubs are tiny; a switch is an after-launch item (open point 14.23).
- `?before=<oldest created_at>&limit=50` for earlier history; never with `after` or `root` (B4 F4).

### 9.4 `readReplyCounts` calls `chat_reply_counts`

`message-read.ts:390-438`: first `service.rpc("chat_reply_counts", { p_channel, p_roots: chunk, p_viewer: viewerId })` per chunk of 100 post ids; rows → the map, missing roots 0; `isMissingChatSchema(error)` (`PGRST202` / `42883`) → the wave-1 walk as it is today, warned once; any other error → `null` (the caller answers 503, as today). `readChatMessage` keeps `skipReplyCounts` unset (a Board card read-back carries its count, `0` on a new one). Section 0, row 3.

### 9.5 Cards on a Board, replies under cards

A poll or an Event card may be a top-level Board post (an officer's) and gets `reply_count`; members reply under it as under any post (3.8.4; open point 14.28). `?root=` rows may be stubs (8.3). The send route (`POST …/messages`) is unchanged but for 9.1's block read in its answer: a text reply under a card root passes `rootState` (`message-read.ts:659-681`, checks `thread_root_id` and `removed_at`, not `kind`).

## 10. The split (W2-S, ALONE, first; D6, plan-critique #11)

**Extraction only. No behaviour change.** Every declaration of `src/components/mobile/MessagesMobile.tsx` (the table at MM:1.1) moves WHOLE — its doc comment with it — into one file under `src/components/mobile/messages/`, unchanged modulo whitespace, the added `export` keyword and import lines. Single-consumer declarations stay in their consumer's file. Every new `.tsx` (and `theme.ts`) starts with `"use client"`. Named exports only; no default export anywhere (MM:H2). The `React.` namespace in type position stays as written (it compiles through `@types/react`'s UMD namespace in a `.ts` module, SPLIT holds 7; rewriting it would fail the identical-text check, MM:H3). `isolatedModules` is on: a type re-export needs `export type { … }`; none is needed (MM:H4).

### 10.1 File plan (source lines are today's DECLARATION lines, MM:1.1; the comment lines MM:H7 names move with the declaration below them — SPLIT-L6; the seven rows N15 named are corrected here, each checked in the file; the tool keys by name, so nothing depended on them)

| new file | moves | exports | imports it needs |
|---|---|---|---|
| `messages/types.ts` | `ThreadType` :55, `ThreadPeer` :57-63, `ThreadMember` :65-71, `ThreadEntry` :73-108, `MessageReaction` :110-114, `MessageAttachment` :118-131 (comment :116-117), `ParentPreview` :136-148 (comment :133-135), `MessageRow` :150-185, `Tab` :211 | all (types) | `type RoomKind` from `@/lib/chat/types` |
| `messages/theme.ts` | `subscribeTheme` :224-227 (comments :213-223), `useNightTheme` :229-235 | `useNightTheme` | `useSyncExternalStore`; `currentTheme, THEME_EVENT` |
| `messages/sheet-styles.ts` | `vaulOverlayStyle` :237-242, `vaulContentStyle` :244-256, `vaulHandleStyle` :258-264, `visuallyHiddenStyle` :268-278 (comment :266-267) | all four | none |
| `messages/format.ts` | `relativeTime` :282-295, `initialsOf` :297-305, `threadTitle` :307-310, `threadAvatar` :312-323, `quotedBody` :327-340 (comment :325-326), `entryCanPost` :364-368 (comment :359-363) | all six | `type ThreadEntry, type ParentPreview` from `./types` |
| `messages/send-failure.ts` | `chatRefusalLine` :348-351 (comment :342-347), `toastSendFailure` :354-357 (comment :353) | both | `REFUSAL_SENTENCES, type RefusalCode`; `type VibeFailure`; `toast` |
| `messages/ThreadList.tsx` | `TabPill` :753-808, `ThreadRow` :810-951, `ListSkeleton` :953-998, `EmptyState` :1000-1053 | all four | `Link`; `./types`; `./format` |
| `messages/ConversationView.tsx` | `ATTACH_ACCEPT`…`MAX_VIDEO_BYTES` :189-197 (private), `StagedMedia` :200-205 (comment :199), `ReplyTarget` :209 (comment :207-208), `ConversationView` :1057-2338 | `ConversationView` | as MM:10 lists, **plus `type ParentPreview` from `./types`** (`ReplyTarget` references it; SPLIT-L1) |
| `messages/sheets.tsx` | `SheetRow` :2718-2782, `MuteDurationSheet` :2784-2832 | both | `Link`; `Drawer`; `./sheet-styles` |
| `messages/ConversationActionSheet.tsx` | `ConversationActionSheet` :2342-2716 | it | `./sheets`, `./sheet-styles`, `./types`, `ReportSheet` |
| `messages/GroupSettingsView.tsx` | `GroupSettingsView` :2836-3353, `MemberRow` :3355-3518 (private), `MemberActionSheet` :3520-3590 (private) | `GroupSettingsView` | `Link`; `Drawer`; `./types` (`ThreadEntry`, `ThreadMember`); `./theme`; `./format` (`initialsOf`); **`./sheet-styles` (the four styles, used by `MemberActionSheet` :3541-3546; SPLIT-L1)**; `./sheets`; `./ComposeOverlay` |
| `messages/ComposeOverlay.tsx` | `SearchUser` :3594-3601 (private), `ComposeOverlay` :3603-3883, `ComposeUserRow` :3885-3966 (private) | `ComposeOverlay` | `./theme`, `./format`, `ListSkeleton` from `./ThreadList` |
| `messages/MessageBubble.tsx` | `MessageBubble` :3968-4751 | `MessageBubble` | `Link`; `RemovedContentCard`; `./types`; `./format`; `./ReactionPicker` |
| `messages/ReactionPicker.tsx` | `REACTION_EMOJIS` :187 (private), `swallowNextClick` :4758-4778 (comment :4753-4757; private), `ReactionPicker` :4780-4965, `pickerRowStyle` :4968-4985 (comment :4967; private) | `ReactionPicker` | `./types` |
| `MessagesMobile.tsx` (stays) | `"use client"`, the header comment :32-51, `LIST_RESYNC_MS` :372-374, `MessagesMobile` :376-749 | `MessagesMobile`, and `export { ConversationView } from "./messages/ConversationView";` | `./messages/{types,theme,ThreadList,ConversationView,ComposeOverlay}` |

The two importers need no edit: `src/app/messages/MessagesSwitch.tsx:4` (`MessagesMobile`) and `src/components/mobile/CampusMobile.tsx:37` (`ConversationView`, including the type-level `Parameters<typeof ConversationView>[0]["thread"]` at `:2471`). Import graph after the split has no cycle (MM:10; SPLIT holds 3). Nothing under `messages/` imports `MessagesMobile.tsx`. 51 declarations, one home each (SPLIT holds 1).

### 10.2 Rules

1. No line of logic changes: no renamed prop, no reordered hook, no merged component, no new prop, no fixed lint error, no touched literal. **No new module-level statement of any kind in the new files: the only new lines are `"use client"`, imports and `export … from`** (SPLIT-M1). The boolean `vibe-composer-open` body class (MM:9) is pre-existing and stays.
2. Section banners (`// ---------- Types ----------`, …) may be dropped or kept; the checker ignores comment-only lines.
3. The old lint errors move with their code (`481`, `534` stay in `MessagesMobile.tsx`; `3669` → `ComposeOverlay.tsx`; the `setPhotoUrl` warning `2855` → `GroupSettingsView.tsx`). The gate compares per rule and per declaration, not per file (MM:7): a new file carrying an old error is not a new error.
4. `ListSkeleton`, `SheetRow`, `MuteDurationSheet`, the four vaul styles, `useNightTheme`, `initialsOf` have ONE home each (MM:H8).
5. After the split, W2-S1 alone edits `MessagesMobile.tsx` (the flag fork, the deep links, history); new screens go in NEW files under `messages/home/`, `messages/club/`, `messages/cards/`, `messages/compose/`. **The edits to moved files in wave 2 are exactly these (SPLIT-L3):** W2-B3's stub filter in `messages/ConversationView.tsx` and `hidden?: boolean` on `MessageRow` in `messages/types.ts` (12.1; PRIVACY-L6 — never a skip inside `MessageBubble`, whose first statements are hooks, `MessagesMobile.tsx:4027-4035`, SPLIT-M3); W2-S2's `onRemove?: () => void` on `MessageBubble` (a pass-through) and on `ReactionPicker` (a row under Report, `pickerRowStyle(darkMode, true)`), landed as W2-S2's first commit so W2-S3's `CardBubble` builds against it (SPLIT-M5). No other. The old `ConversationView` never passes `onRemove`.

### 10.3 Proof (the gate of W2-S alone; the integration review re-reads it once, 13.3)

`<sha>` = the commit W2-S starts from (`15a8286` today), written as the first line of `handoffs/chat-redesign/wave-2-build/S-split-check.txt`; the eslint baseline and the checker's `--base` both use it, never `HEAD` or `HEAD~1` (SPLIT-L2, SCHEDULE-L1).
1. `npm run typecheck` exit 0. 2. `npm test` 1,374 green (no test imports the file, MM:H14, so this proves the repo, not the split). 3. `npm run build` exit 0 (SCHEDULE-M4). 4. `npx eslint src/components/mobile/MessagesMobile.tsx src/components/mobile/messages/*.ts src/components/mobile/messages/*.tsx`: the same rule hits as `git show <sha>:src/components/mobile/MessagesMobile.tsx | npx eslint --stdin --stdin-filename src/components/mobile/MessagesMobile.tsx` (3 errors, 1 warning, MM:7), no new one. 5. **`node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base <sha>` exit 0 with MISSING, CHANGED, DUPLICATE AND ADDED all empty.** W2-S changes the tool in the same commit (SPLIT-M1, SPLIT-M2): `process.exit(missing.length || changed.length || duplicates.length || added.length ? 1 : 0)` (today `:128` ignores `added`; the file is 128 lines — draft 2 and verify-1 cited `:138`), and `listFiles` walks `--dir` without recursing (`:76-88`, the recursion at `:81`; the split creates flat files only, so later subdirectories never enter the comparison). Re-exports are never listed (`:52`), so ADDED must be exactly empty. **A non-empty MISSING, CHANGED, DUPLICATE or ADDED means the split is wrong, never the checker, the base or the original text**: W2-S restores the declaration's text from `git show <sha>:src/components/mobile/MessagesMobile.tsx`, re-runs, and repeats until the report is empty; the checker, `--base` and the normalisation are not edited to make a report pass. A declaration that cannot be moved with identical text (a name that would have to change) stops W2-S, which writes it under `S-notes.md`; it does not rename. 6. `grep -L '"use client"' src/components/mobile/messages/*.tsx src/components/mobile/messages/theme.ts` prints nothing (SPLIT-L5). 7. Every import in a new file is `./<sibling>` or one of the ten modules `MessagesMobile.tsx:3-30` imports today (`next/link`, `react`, `vaul`, `@/components/feedback/LoadFailed`, `@/components/push/PushAsk`, `@/components/safety/ReportSheet`, `@/lib/chat/types`, `@/lib/feedback/request`, `@/lib/feedback/toast`, `@/lib/theme/theme`), checked by `grep -h "^import\|^} from" src/components/mobile/messages/*.ts*` (SPLIT-L5). The output of 5 is saved to `S-split-check.txt` under the first line.

**At integration** (13.3): the tool is run once more with the same `--base <sha>`; its exit code is ignored and its report is read: MISSING empty; DUPLICATE empty; CHANGED = exactly `MessagesMobile` (W2-S1's flag fork), `ConversationView` (W2-B3's filter), `MessageRow` (`hidden?`), `MessageBubble` and `ReactionPicker` (`onRemove?`), each diff hint read and being those lines only; ADDED = what W2-S1 added to `MessagesMobile.tsx` itself plus the flat files W2-S1 adds under `messages/` (`v2-tokens.ts`, `avatar.ts`, 13.1: the tool walks every flat `.ts(x)` there) — listed, not judged; the new screens live in subdirectories the tool no longer walks (verify-1's SPLIT-M2 note).

## 11. The screens (phone, 375px, Light and Night, behind `chat_v2`)

### 11.0 Shared rules for every new screen

- **Files**: `src/components/mobile/messages/home/*` (W2-S1: `MessagesHome.tsx`, `YourWeek.tsx`, `ClubRow.tsx`, `PersonRow.tsx`, `HomeEmpty.tsx`), `messages/club/*` (W2-S2: `ClubSpace.tsx`, `UpNext.tsx`, `RoomChips.tsx`, `BoardStrip.tsx`, `BoardView.tsx`, `BoardPost.tsx`, `RoomThread.tsx`, `RoomComposer.tsx`, `EventChat.tsx`, `EventAbout.tsx`, `RsvpSheet.tsx`, `ClubEmpty.tsx`), `messages/cards/*` and `messages/compose/*` (W2-S3), `messages/v2-tokens.ts` (W2-S1, first commit), `src/lib/chat/use-hide-tabbar.ts` (W2-S1, first commit). New files only; inline styles like the rest of the file (no `className`, MM:6); fonts `Fraunces, serif` for titles and `DM Sans, sans-serif` for body via two constants `SERIF` / `FONT` in `v2-tokens.ts` (not the 56 literals of the old file). The home's filter type is a new name, `HomeFilter = "all" | "chats" | "clubs" | "requests"`, in `messages/home/`, never a widening of `messages/types.ts`'s `Tab` (SPLIT-M2).
- **Weights (SCREENS-M3)**: `src/app/layout.tsx:96` (W2-S1's first commit, one line) loads `family=Fraunces:ital,wght@0,400;0,700;0,800;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700;800` — the mockups' 800 for both families (today 800 falls back to 900 for Fraunces and 700 for DM Sans). `font-variation-settings: 'SOFT' 100` is NOT used (the axis is not loaded; MK:0.1's SOFT note is dropped). Desktop is unchanged (no desktop rule asks for 800). Alternative in open point 14.40.
- **Tokens** (`palette(night: boolean)` in `v2-tokens.ts`; MK:0.1 for every literal): page `var(--cream)`; ink `var(--charcoal)`; secondary `var(--ink-2)`; **muted `night ? "var(--ink-muted)" : "var(--ink-sub)"`** (`#5A564F` in Light, `globals.css:115`, 6.8:1; `--ink-muted` `#8A8580` is 3.5:1 on cream and is never used on the new screens in Light; SCREENS-M4); surface `var(--paper)`; hairline `var(--hairline)`; coral `#FF5C35`; **coral text** `night ? "#FF8A66" : "#C8401E"`; **coral mark on a tinted surface** (the Going check, the Soon ring, `Live` on the live/soon card chrome) `night ? "#FF8A66" : "#B5381A"`; coral button `linear-gradient(180deg, #FF7B4A, #FF5C35)` with ink `#140806`; active chip `night ? { bg: "#F6F1EA", ink: "#0C0B0B" } : { bg: "#141416", ink: "#FAF7F2" }`; ring grey `#6E6862`; live-card chrome, quiet-card chrome, picked / unpicked option chrome, bloom: the two columns of MK:0.1. The mockups' Light ink literals (`#141416 / #4A4541 / #6B645C`) are NOT adopted; the app's Light tokens stand in (MK:16.2). Contrast: every text under 18px at ≥ 4.5:1 in both themes; `--ink-2`, never muted, for a sentence (B5 F1). W2-S1 writes `handoffs/chat-redesign/wave-2-build/S1-contrast.md`: every colour pair on the new screens once, with its ratio in both themes; the design review by reading checks it.
- **Theme**: `useNightTheme()` from `messages/theme.ts`; nothing white-flashes in Night (`body`/page background from the token).
- **The tab bar (SCREENS-H1)**: `.vibe-mobile-tabbar` is `position: fixed; z-index: 9988` (`globals.css:2857-2862`), above a vaul drawer's 1100 (`MessagesMobile.tsx:1575-1592`); it is hidden only by `body.vibe-composer-open` (`:2878`), which the old views add themselves (`ConversationView`, `MessagesMobile.tsx:1157-1160`; `GroupSettingsView`, `ComposeOverlay`, `OrgChannelsDrawer`) with a boolean that breaks when two mounters overlap (MM:9). The new screens use ONE owner: **`useHideTabBar()`** (`src/lib/chat/use-hide-tabbar.ts`) keeps a module-level count; the first mount adds `vibe-composer-open`, the last unmount removes it. `ClubSpace`, `EventChat`, `CardSheet` and `RsvpSheet` call it; nothing else in the club stack touches `document.body.classList`. The old boolean mounters are untouched.
- **States, every screen**: a skeleton on first load (the `ListSkeleton` shape: discs + bars in `rgba(var(--scrim-rgb),0.06/0.08/0.05)`); an empty state (11.9 or the room's empty line); a first-load failure → `LoadFailed` (`@/components/feedback/LoadFailed`, `asLoadFailure(r, "<line>")`, `onRetry`, **`tone={night ? "dark" : "light"}`**, `compact` where 1.2 says so) IN PLACE of the failed part, the rest of the screen staying; a refetch failure keeps the rows and stays quiet (the `LoadFailed` file's own rule). Every refusal toast goes through `toastSendFailure` / `chatRefusalLine` (`messages/send-failure.ts`): the code's sentence, never "Request failed".
- **Layout**: 375px wide with 12–16px gutters, no horizontal scroll; the widest fixed element is the 292px card (fits: 375 − 12 − 8 − 28 − 12 = 315, MK:0.1); touch targets ≥ 44px (pills of 30–36px inside a 44px wrapper); the composer sits above `env(safe-area-inset-bottom)`; inputs are **16px** (iOS zoom guard, `MessagesMobile.tsx:2224-2226`), not the mockups' 15px.
- **Accessibility** (contract 7 of wave 1, MK:14): Going / Maybe / Live / Soon / picked differ by shape AND label, never colour alone; a poll's options are a **radio group** (`role="radiogroup"` + `role="radio"` `aria-checked`), checkboxes (`role="checkbox"`) when `multi`; a sign-up's rows are buttons with full labels; count changes are announced through ONE `aria-live="polite"` region per card (1.2); every icon and avatar `aria-hidden` with the name in the row's label; sheets `role="dialog" aria-modal="true" aria-labelledby`; the state pill `role="status"`; focus moves into a sheet on open and back to the "+" on close.
- **Not in v1, every screen**: month sheet, week swiping, search, mute/pin from the new screens (the old `ConversationActionSheet` is not mounted by the new views), typing, "seen by", photos in club rooms (no attach button in club rooms: `club_media_off`), custom-room creation or renaming, notification settings.

### 11.1 Messages home (`home/MessagesHome.tsx`, W2-S1) — W0_Home

- **Route**: `/messages` with the flag on (2.1); filters from `?tab=` (2.3).
- **Reads on mount, in parallel**: `GET /api/me/threads?scope=chats` (dms, groups, `requests`; `threads/route.ts:426`), `GET /api/me/inbox` (7.1), `GET /api/me/calendar?from=<Monday 00:00>&to=<Sunday 23:59:59>` (device zone; `rsvp` entries + `CalendarRoomFields`, 7.3). **Polling**: the first two every 30 s while visible and on return to visible (at most once per 30 s, the `LIST_RESYNC_MS` rule); the calendar on mount and on return to visible at most once per 5 min. Also after closing a club space or a conversation (the old `refetchThreads` habit).
- **Layout, top to bottom**: header 52px **plus `env(safe-area-inset-top)` above it** (the mockup's y 249 is measured under the status bar; on an iPhone 14 the first row is at 296; SCREENS-L1) (`Messages` 30px/800 Fraunces, the pencil 44px; no search); **Your week** (11.2, 150px, or the 126px empty line); the filter row 45px (`role="tablist"`: All · Chats · Clubs · Requests with the counts); the list (`padding-top: 2px`); the 36px bottom fade; the tab bar. Neither the header nor the filter row is sticky in v1 (the mockup scrolls as one page); the tab bar is the only fixed chrome. Nothing else grows: the week row scrolls sideways.
- **The list**: `All` = clubs and dm/group threads merged, **pinned first** (club `pinned_at`, thread `pinned_at`; newest pin first), then by recency (`InboxClub.last_activity_at` vs `ThreadEntry.last_message.created_at`; a null sorts last); `Chats` = dm/group only; `Clubs` = clubs only; `Requests` = `requests` (today's rows). Club rows (`home/ClubRow.tsx`, 1.2): 48px avatar (`logo_url` or initials on `clubGradient(org.id)`), the name 16.5px/800 Fraunces, the time (`rowTime(last_activity_at)`), the preview line (1.2's rule: SCREENS-L8), the chip line (`next_event`: `Live now · <title>` when `state === "live"`, else `<Sat> · <title>` with `eventTimeShort`; + `Going` / `Maybe` mark from `viewer_status`; `N new` from `lounge.unread_count` at the right). Tap → the club space (11.3) on the Lounge (`?channel=<lounge.room_id>`), or on the Board when `board.unread` and the Lounge has nothing new. **Person / group rows: `home/PersonRow.tsx`** (SCREENS-M7; the mockup's 66px row differs from `ThreadRow` in the avatar size, the weight, the pin icon, the double avatar and the clock); tap → `ConversationView` (unchanged, `key={threadId}`). `ThreadRow` stays with the old list.
- **The All pill's badge**: unread dm/group threads (today's rule, `MessagesMobile.tsx:570-579`: a muted thread is left out) + clubs with `board.unread || lounge.unread_count > 0` **whose `muted_until` is null or past** (a muted club counts its unread in its row — the dot, `N new` — but not in the badge, as a muted thread today; SCREENS-L8); `99+` cap.
- **States**: skeleton until BOTH `threads` and `inbox` answered (the week has its own skeleton, three grey 142×64 cards); `inbox` failing alone → `LoadFailed` (`Couldn't load your clubs.`) in the list's club position while threads still list; both failing → one `LoadFailed`; Clubs filter with `clubs: []` → 11.9.2; Chats empty → `<EmptyState tab="all" />`; Requests empty → `<EmptyState tab="requests" />` (`Tab = "all" | "requests"`, `MessagesMobile.tsx:211`).
- **Not in v1**: search, mute/pin/hide from the new list (the old list keeps them with the flag off), swipe actions, a badge on the tab bar.

### 11.2 Your week (`home/YourWeek.tsx`, W2-S1) — W0_Home top, W0_EmptyWeek

- **Data**: the calendar's `rsvp` entries between Monday and Sunday of the device's current week (`weekRange(now)`, `week.ts`); `viewer_status`, `starts_at`, `ends_at`, `title`, `org.name` (null for a private club I left: the card then shows no club line), `room_id`, `room_state`.
- **Day strip** (`<nav aria-label="Your week, October 5 to 11">`): seven 44×44 buttons, weekday 10.5px/600, day number 15px/700, a 5px dot: coral = at least one `going` that day, grey = `maybe` only, none otherwise; today `aria-current="date"` with the raised chrome; past days muted (the muted token of 11.0). **Tapping a day scrolls the card row to that day's first card** (no day sheet in v1; open point 14.35); a day with nothing does nothing. Labels per 1.2 (SCREENS-L2).
- **Card row** (`role="group" aria-label="Event rooms you RSVP'd to this week"`): horizontal scroll, 142×64 cards, sorted by `starts_at`; the live one (`room_state === "live"`) gets the live chrome and the bloom (the bloom is drawn only when a live card exists); a card is a link to the room when `room_id !== null` (→ the club space on its Lounge with the event chat layer on top, `?channel=<room_id>`, 2.3); with `room_id === null` (a non-member RSVP, or a club I left) the card is a plain tile with the same text and no link. `ends_at` past → still shown this week with `Ended` in place of the time (`room_state === "after"`) and the link kept.
- **Empty** (no `rsvp` entry this week): no bloom, every dot transparent, the 44px line `Nothing on your week yet.` + `Find events` (11.9.1).
- **Failure**: `Couldn't load your week.` in the card row's place (`LoadFailed compact`), the strip still drawn.
- **Not in v1**: swiping weeks, "This week" jump, the month sheet, `18 going` on a card, a day sheet.

### 11.3 The club space (`club/ClubSpace.tsx`, W2-S2) — W0_Club, W0_Club_Light

- **Opened by**: a club row tap, `?channel=<id>` (2.3), or underneath an event chat layer (a week card, an event-room deep link). Props: `{ orgHandle: string; initialRoomId: string | null; initialRoomKind: RoomKind | null; onClose(): void }`; `initialRoomKind === "event"` → the space on its Lounge with `EventChat` (11.6) mounted on top for `initialRoomId`. It is a full-screen view above the home: the slide comes from a `Drawer.Root direction="right"` like `ConversationView` (`MessagesMobile.tsx:1567-1592`, `zIndex` 1099/1100); **the tab bar is hidden by `useHideTabBar()` (counted), called by `ClubSpace` on mount** (SCREENS-H1; nothing comes "free" from the drawer).
- **Reads**: `GET /api/orgs/<handle>/space` (7.2) on open, on return to visible, and on every 5th poll tick of the open room (9.3); the open room's thread through the polling hook (11.5). A deep link with only a room id opens the room first (the resolving thread GET's `room.org.handle` names the club, its body is the hook's `initialPage`) and the space read follows.
- **Layout, top to bottom**: header 52px + `env(safe-area-inset-top)` (Back 44px circle, the 40px club avatar, `<h1>` name 20px/800 Fraunces one line, `Your hat: … · N members`, the club-page link button); **Up next** (`club/UpNext.tsx`; **`up_next.slice(0, 2)`** in a 2-column grid of 50px cards — the third event is reachable by its chip; a 2-row block would push the chips and the Board strip under the fold at 375×667, SCREENS-L6): line 1 `eventTime` + the RSVP mark, line 2 the title; **the `Soon` ring mark and the live chrome only on `state === "live"` or `isSoon(starts_at, ends_at, now)`** (SCREENS-M2; `roomState` says `soon` for any future event, `room-state.ts:115`, and the mockup draws next Tuesday's card quiet, `W0_Club:45-48`); every other card the quiet chrome; tap → the event chat layer (11.6) when `room_id !== null`, else nothing; the block is left out when `up_next` is empty and the viewer is a member; the officer's empty club shows the dashed button, 11.9.3); **room chips** (`club/RoomChips.tsx`, 45px `<nav>`: `rooms` in the server's order; `aria-current="page"` on the open Board / Lounge / `room`; **an event chip never becomes the active chip: it opens the event chat layer** (SCREENS-M1); the Board's dot from `rooms[board].unread`; the Officers chip carries no dot in v1 (7.2.3); every chip a 44px hit area); **the Board strip** (`club/BoardStrip.tsx`, 44px, shown on every room but the Board when `board_latest !== null`: `Board · <Author> · <text>` with the text = `content` (a card's fallback), the dot from `rooms[board].unread`; tap → the Board chip); **the room** = the Board (11.4) or a Lounge / `room` thread (11.5) — never the event chat; **the composer** (`club/RoomComposer.tsx`, 64px: the "+" 44px, the 44px pill input, the 44px gradient send; **while `viewer` is null nothing is drawn in the composer's place** (today's rule, `MessagesMobile.tsx:2085-2122`, "no composer flashes in a Board"; SCREENS-L9); the quiet tile only on `viewer.can_post === false`: the Board's member tile (1.2) or `This chat is closed.`; the "+" is shown only when `viewer.can_post` (cards go through `can_post_org_channel`)).
- **The role word** = `viewer.role` → `Owner` / `Officer` / `Mod` / `Member`.
- **States**: a skeleton of the header + chips + three bars until the space read answers; the space read failing → `LoadFailed` (`Couldn't load this club.`) with Back still working; 403 `members_only` / 404 → `LoadFailed` with `retryable: false` and its sentence (a club I left while the space was open: the next space read's 403 closes the view with the toast `Members only.`).
- **Bloom**: `rgba(255,92,53,0.36) → 0.13 → 0` behind Up next in Night, `0.22 → 0.08 → 0` in Light (MK:0.1), **only when a drawn Up next card is `live` or `isSoon`** (SCREENS-M2).
- **Not in v1**: pinning / muting a club from here, the member list (the `N members` text is not a button), custom rooms UI, a club switcher.

### 11.4 The Board with folded replies (`club/BoardView.tsx`, `club/BoardPost.tsx`, W2-S2) — W0_Board

- **Read**: the polling hook (11.5) on the Board's id: the default club-room read returns top-level rows only (`thread_root_id is null`, `message-read.ts:741`), **shown newest first** (the hook keeps oldest-first state; the view reverses for display; `reply_count` on each). Posts are `<article>`s top-anchored: byline (28px avatar, name 13.5px/700, the role word from `author_role`, the time `rowTime`), the body 15px/500 `text-wrap: pretty`, a card when `kind !== "text"` (11.8, full width inside the post), then the replies toggle.
- **Replies toggle** (44px `<button aria-expanded>`): `N replies` from `reply_count` (`Reply` alone when it is 0, so anyone can start), the chevron, `Replies stay quiet` at the right. Open → `GET …/messages?root=<postId>&limit=200` once (oldest first; a stub renders nothing; **an open fold whose rows are all stubs shows the reply field only, no line, no count change** — PRIVACY-L5); **the read failing → `LoadFailed compact` (`Couldn't load replies.`) under the toggle, Retry re-reads** (SCREENS-L9); re-read on every 5th tick while open; rows: 22px avatar + `<b>Name</b> text` 13px/18px; a reply that is a card cannot exist (cards are top-level only). Under the rows the reply field, drawn when `viewer.can_reply` (true on every Board, `types.ts:70`; this field is that flag's one reader, N24) (44px pill `Reply quietly`, a 44px send): `POST …/messages` with `{ content, thread_root_id: postId }`; on 200 append the returned message; `board_post_missing` (409) → toast + the post is dropped from the list (the next full read confirms); `thread_root_not_allowed` cannot happen from here.
- **Composer**: officers see the `Everyone in <club> sees this` line above the composer (`Post to the Board`); members see the quiet tile (1.2). A refused send (`board_officers_only`, a demotion mid-session) → the toast and `can_post` false until the next full read.
- **New posts**: a `?after=` row, an optimistic `temp_` row, or a card returned by a sheet is inserted at the TOP (newest first) and carries its own `reply_count` (`0` on a new one; the route sends one on every top-level Board row, 9.4) with `Reply` (SCREENS-L14). The `Earlier messages` button sits under the last post (SCREENS-L7).
- **States**: skeleton (three post-shaped blocks); empty → `Nothing on the Board yet.`; failure → `LoadFailed` (`Couldn't load the Board.`, 1.2; N5) in the list's place.
- **Not in v1**: a per-post `New` mark (14.17), repliers' avatars in the folded state (14.18), editing, pinning a post, `seen by`, notifications for posts or replies (an @mention inside a reply still notifies that one person: the send route, unchanged).

### 11.5 The Lounge / room thread and the polling hook (`club/RoomThread.tsx`, `src/lib/chat/use-room-poll.ts`, W2-S2) — W0_Club

- **`useRoomPoll(roomId, { enabled, initialPage? })`** returns `{ messages: ChatMessage[] | null; room: ThreadRoom | null; viewer: ViewerInRoom | null; viewerId; failure: LoadFailure | null; loadEarlier(); refreshOne(createdAt); append(message); replaceCard(id, card); reload() }`. On mount: `GET /api/me/threads/<id>/messages?limit=50` (no `after`), or `initialPage` when given (the deep link's resolving read, 2.3; then no first read); then the 9.3 schedule: `?after=<cursor>&limit=200` every 4 s while visible (`cursor` = the newest `created_at` seen; before any row exists the tick is a full read), every 5th tick and on `visibilitychange` → visible a full read merged with `mergeFullPage` (a `temp_` row in flight is never dropped, 9.3); polling pauses while hidden. Only the full reads update `room` / `viewer`. `loadEarlier` = `?before=<oldest created_at>&limit=50` prepended (the `Earlier messages` button shows while the last earlier page was full). `refreshOne(createdAt)` = `?after=<createdAt>&limit=1` and replace by id (the RSVP re-read of 4.3). A tick that fails is silent; the first read failing → `failure` (`LoadFailed` with `Couldn't load this chat.`, 1.2, N5; Retry = `reload`). Mark-read: `POST /api/me/threads/<id>/read` on mount and after a full read that brought new rows (on a room with no row for me — Officers — the update matches nothing and answers `{ ok: true }`, `read/route.ts:19-23`; the screen does not special-case it).
- **Rendering**: oldest first, bottom-anchored, the 14px top fade, `Today` / date separators (`shouldShowChatSep`'s rule from `campus-home.tsx`: the first row, a day change, a > 1 h gap; the label `Today`, `Yesterday`, `Wed`, `Oct 5`), computed over the rows that are not stubs; **text rows reuse `MessageBubble`** (`messages/MessageBubble.tsx`, unchanged palette in v1, open point 14.24) with `darkMode={night}`, **`groupMode` true and `showSender` on the first row of a sender's run** (as `ConversationView` does for a multi-party thread, `MessagesMobile.tsx:1814-1829`; SCREENS-L13), `onToggleReaction` (today's raw-fetch reaction flow, moved as is), `onReply` (quote, `parent_message_id`, as today), `onReport`, and the new optional **`onRemove`** when `viewer.can_moderate && m.user_id !== viewerId` (the picker gets a `Remove` row; confirm; `DELETE …/messages/<mid>`; 200 → drop the row; `report_open` / `not_allowed` → the toast); a stub renders nothing; a card row → `CardBubble` (11.8); `removed !== null` → `RemovedContentCard` (6.2). A `MessageRow` for `MessageBubble` is built from the `ChatMessage` (the fields match, MM:12.6; a small `toMessageRow()` in `RoomThread.tsx`).
- **Sending**: the composer posts `POST …/messages` `{ content, parent_message_id? }` (no media; `canAttach` is never true in a club room); optimistic `temp_` row as today (`MessagesMobile.tsx:1319-1354`), appended to the hook's oldest-first state (at the bottom in a thread, scrolled into view; at the top of the Board view), replaced by the answer, removed on failure with the toast; `room_closed` → `can_post` false and the closed tile.
- **Empty**: `Say hi to <club>.` (the Lounge and a `room`), `Say hi to everyone going.` (an event chat); a room whose rows are all stubs is empty.
- **Not in v1**: photos, typing, read receipts, message search, jump-to-unread.

### 11.6 The event chat layer (`club/EventChat.tsx` with `club/EventAbout.tsx` above `RoomThread`, W2-S2) — W0_Room

- **A full-screen layer over the club space** (SCREENS-M1: W0_Room has `Back to Salsa Club`, no chips, no Up next, `W0_Room:15-24`): its own `Drawer.Root direction="right"` at `zIndex` 1101/1102 above the space's 1099/1100 (the old code already nests `GroupSettingsView` over `ConversationView`, `MessagesMobile.tsx:2324-2333`); it calls `useHideTabBar()`. Opened by an event chip, an Up next card, a week card, a card's `Open event chat`, or a deep link to an event room (2.3: the space underneath on its Lounge). Its open is a `pushState` (depth 2); **Back → `history.back()` → the space on the room that was active before** (the Lounge by default); a second Back → the home.
- **Data**: the thread GET's `room` with `kind === "event"`: `room.name`, `room.org`, `room.event` = `EventRef & { going: Person[] }` (`title, starts_at, ends_at, location, state, room_id, viewer_status, going_count, maybe_count, going` = the first 8 visible people going, 8.3). Refreshed on the every-5th full read (9.3), and at once after an RSVP change (`reload()`).
- **Header**: Back `Back to <club>`, no club avatar, `<h1>` = the event title, under it the club dot + `<club> · event chat`; no right button.
- **About** (`<section aria-label="About this event">`): the 96px hero = the generated gradient (no cover image exists on `events`, DM:5.10; the bloom only on `live`); the state pill (`role="status"`, 1.2) from `state`: `soon` → `Soon · starts <7:30 PM>` (`eventTimeShort`), `live` → `Live now`, `after` → `Ended · chat open <moreDays> more days`, `closed` → `Closed`; the Plans grid: `Where` = `location` (`No place yet` when empty), `When` = `eventTime(starts_at)`.
- **Who's going** (`role="group" aria-label="Who's going: N going, M maybe"`): up to five stacked 30px avatars from `going` (initials on `personColor` when no `avatar_url`), `<N> going`, `· <M> maybe` (from the counts, blocked people included); at the right the RSVP pill (`Going` / `Maybe` / `RSVP`, 1.2) → the **RSVP sheet** (`club/RsvpSheet.tsx`, a vaul sheet that calls `useHideTabBar()`: rows `Going`, `Maybe`, `Not going`; the line `You'll appear in the event chat.` under the first two; `Going` / `Maybe` → `PUT /api/events/<id>/rsvp { status }`; `Not going` → `DELETE`; 200 → `reload()`; a refusal (`campus_visiting`, `terms_required`, 404) → the toast from `vibeRequest`'s mapped line). A `maybe` → `no` by a member removes their room row by trigger (A:1076-1092): the next read answers 403 "Not a member" → the layer closes with the toast `You left the event chat.` (open point 14.25).
- **The Board strip** below About (from the space read, still mounted underneath), then the thread (11.5) top-anchored (`justify-content: flex-start`, MK:6), the composer `Message the event chat`, or the closed tile `This chat is closed.` when `viewer.can_post === false` and `state === "closed"`.
- **States (SCREENS-L9)**: skeleton = the 96px hero block + two 50px tiles + three bars; the first read failing → `LoadFailed` (`Couldn't load this event chat.`) in the About + thread place, Back working.
- **A closed chat** (`state === "closed"`): read-only; the "+" is hidden; votes on its polls answer 409 `poll_closed` (3.4) and the cards show `closed: true`; reactions still work (accepted in wave 1).
- **Not in v1**: a cover photo, Bring / Rides / "I'm here" / album tiles, the attendee list, `N going` from 5 up, non-members in the room, opening a room early.

### 11.7 The "+" tray and its three sheets (`compose/CardTray.tsx`, `compose/CardSheet.tsx`, `compose/NewPollSheet.tsx`, `compose/NewSignupSheet.tsx`, `compose/ShareEventSheet.tsx`, W2-S3) — W0_Tray, W0_NewPoll, W0_NewSignup, W0_ShareEvent

- **The tray** opens from the composer's "+" (`aria-expanded`), in flow above the composer with the tail, the `rgba(8,7,7,0.5)` scrim over the thread (Night; `rgba(20,20,22,0.35)` in Light), three 72px rows (1.2); a row opens its sheet and closes the tray; the scrim or the X closes it. Shown only when `viewer.can_post` (a member on the Board never sees it).
- **`CardSheet`** = the shared chrome (`role="dialog" aria-modal aria-labelledby`, the 40×5 handle, the 25px/800 title, the `<club> · <room>` line, the 44px close, the 50px gradient CTA; `var(--paper)` surface, radius 28 top; a vaul `Drawer.Root` so the drag-to-close and the focus trap come with it; it calls `useHideTabBar()`). The CTA is disabled (`aria-disabled`, the muted chrome) until the body is valid; a request in flight disables it and shows `Posting…`; **the sheet closes on 201 and the room takes the returned `message` through `append(message)`** — the hook's oldest-first state; the Board view shows it as the newest post with `Reply` (`reply_count` 0), the Lounge at the bottom, scrolled into view (SCREENS-L14); refusals per 1.2 and 1.3 (`content_blocked` and `invalid_card` outline the named field: `question` / `options.<n>` / `note`); **`try_again` (503, from anywhere in the POST) → the sheet closes, the room calls `reload()` and the toast shows the sentence; the sheet never re-submits** (a 503 after the RPC succeeded means the row exists, 4.1.13; N8).
- **New poll**: `Question` (200 max, counter), `Options` (starts with two empty rows; `Add option` up to 10; `Remove <label>` down to 2), `Anonymous` switch (`role="switch"`), `Allow more than one answer` switch; valid = question 1–200 and 2–10 non-blank labels ≤ 80 → `POST …/cards { type: "poll", question, options: [{ label }], anonymous, multi }` (no `closes_at`: v1 sends none, wave-1 open point 12.13).
- **New sign-up**: `Title` (200 max, counter), `Slots` (starts with one row: a label input + the `Spots` stepper 1–50, default 2; `Add slot` up to 10; `Remove <slot>` down to 1), the helper line, `Post sign-up` → `{ type: "signup", question: title, options: [{ label, capacity }] }`.
- **Share an event**: `Upcoming events` = **`GET /api/orgs/<handle>/space?events=1` → `upcoming`** (7.2.6; ROUTES-M4: `GET /api/events?org_id=` answers `[]` for a hidden club to its own members, `events/route.ts:212-216`), read when the sheet opens; a `radiogroup` of 66px rows with the date tile (`title`, `eventWhenSpoken` parts, `location` when not empty); `No upcoming events.` when empty (the CTA stays disabled); **the read failing → `LoadFailed compact` (`Couldn't load your events.`) in the list's place, the CTA disabled** (SCREENS-L9); the note input (200 max); `Share to <room>` → `{ type: "event", event_id, note? }`. The `New event · Officers only` link is not built (14.19).
- **Not in v1**: `closes_at` pickers, editing a posted card, a Headcount, a photo row, drafts surviving a close.

### 11.8 The three card renderers (`cards/CardBubble.tsx`, `cards/PollCardView.tsx`, `cards/SignupCardView.tsx`, `cards/EventCardView.tsx`, W2-S3) — W0_Cards

- **`CardBubble`** (W2-S3's first commit, the signature W2-S2 builds against; SPLIT-M4): `{ message: ChatMessage; roomId: string; room: ThreadRoom | null; viewerId: string; isMine: boolean; night: boolean; onCard(id, card): void; onRefresh(createdAt): void; onOpenEventChat(roomId): void; onRemove?(): void; onReport?(): void }`. Draws the 292px card (theirs: 28px avatar + the left-tail radius; mine: right-aligned, no avatar) with the header line `<Name> · Poll | Sign-up | Event` (`users.name`, `You` when `isMine`, `Someone` when `users` is null — SCREENS-L11); a long-press opens the same picker as a text bubble (reactions, Reply, Report, Remove) — `MessageBubble`'s long-press logic is not reused; `CardBubble` has its own 500 ms press that opens `ReactionPicker` (with `onRemove`, W2-S2's first commit); `card === null` on a card kind (hydration answered null: cannot happen after 9.1's 503, but a stale cached answer might) → the fallback text (`content`) as a plain bubble. Its first commit renders exactly that fallback bubble.
- **Poll** (`PollCard` with `type === "poll"`): the question 15px/700; options as a `radiogroup` (`checkbox`es when `multi`), each a 44px hit area around the 36px row: the result bar `width = count / max(total_voters, 1)` (open point 14.26), the mark (coral disc + check when `mine`; the grey ring otherwise), the label, `Your pick` under a picked label, up to two 20px voter avatars (from `voters`, hidden when `anonymous`), the count; the footer `<N> voted · names shown | anonymous`, or `Closed · <N> voted` with the whole card at 70% and no taps when `closed`. Tap → `PUT …/vote { option_id, on: !mine }`; optimistic: none (the answer's `card` replaces the card through `onCard`; the row stays as it was until then, the tapped option shows a 36px spinner in the mark's place); refusals per 1.3 (`poll_closed` also marks the card closed locally); a 404 `not_found` → `onRefresh(message.created_at)`. A count larger than the visible names is the accepted look (1.2; PRIVACY-L4).
- **Sign-up** (`type === "signup"`): the title; rows (single-line 36/44px when every label ≤ 12 characters, else the two-line 56px layout of W0_Room; one rule, pinned: **two-line when any label is longer than 12 characters**, open point 14.34), each: the slot label, the taker chips (20px avatar + name 12.5px/600; `+N` when more than 3 VISIBLE takers; never for hidden people), then **`Leave` when `mine` (full or not; a 44px outlined text button)**, else `Full`, else `<K> open` + `Take a spot` (the first open row gets the coral pill, the others the outlined one, as both mockups) (SCREENS-L11); the footer progress (segments = `min(Σ capacity, 12)`; past 12 segments the bar is continuous) + `<taken> of <total> filled`. Tap `Take a spot` → `PUT …/vote { option_id, on: true }`; `Leave` → `on: false`; `slot_full` → the toast and `onRefresh`.
- **Event card** (`EventCard`): the 48px club band (`room.org.logo_url` or initials, the club name) over the gradient; `<Name> · Event`; the title 19px/700 Fraunces; `<location> · <eventWhen(starts_at)>`; the note line (13.5px/500, `--ink-2`) when `note !== null`; **`role="group" aria-label="Your RSVP"`** around the `Going` / `Maybe` pills (`aria-pressed` from `viewer_status`) → `PUT /api/events/<id>/rsvp { status }` (tapping the pressed one → `DELETE`) then `onRefresh(message.created_at)`; **under the pills the line `You'll appear in the event chat.` while `viewer_status === null && room_id === null`** (it disappears once the viewer is in; SCREENS-L5; open point 14.41); `<N> going`; `Open event chat` (a 44px button → `onOpenEventChat(room_id)`, the event chat layer over the space, 11.6) when `room_id !== null`; `event === null` → the fallback title from `content` (`Event: <title> · …` → the title between `Event: ` and ` · `), `This event was cancelled.`, no buttons. `state === "closed"` → the RSVP pills are hidden (nothing to join), `Open event chat` still shown (read-only room).
- **Announcements**: one `aria-live="polite"` `<span>` per card, `visuallyHiddenStyle`, set after each answer (1.2).
- **Old-screen fallback**: none of this reaches the old renderers; they show `content` (12.2).
- **Not in v1**: `voters_more` ("and 4 more" — not drawn; the count carries it), editing, closing a poll by hand, per-option comments.

### 11.9 The three empty states (W2-S1 for the two home ones, W2-S2 for the club) — W0_EmptyWeek, W0_EmptyClubs, W0_EmptyClub

1. **Nothing on your week** (11.2): the 44px line `Nothing on your week yet.` + `Find events` → `/campus?tab=events`. Data: no `rsvp` entry Monday–Sunday.
2. **No clubs yet** (`home/HomeEmpty.tsx`, the Clubs filter with `clubs: []`): the centred block `Your clubs will live here.` 24px/700 Fraunces, the 14.5px/500 line (max-width 306px), `Find clubs on campus` (48px gradient pill → `/campus?tab=orgs`), `Start a club` (44px underlined → `/campus?tab=orgs`). With `All` active and no clubs, the list shows threads only and no block.
3. **A brand new club** (`club/ClubEmpty.tsx`; the officer's view when `org.member_count === 1 && up_next.length === 0` and the Lounge's first page is empty): W0_EmptyClub's header variant is NOT used (one header for every club screen, 11.3; MK:16.10); Up next shows the dashed `Add your first event` button (→ `/campus?tab=events`) and the line `Every event gets its own chat for the people going.`; the Lounge area shows `It's just you so far.` / `Three things to do before people arrive.` / the three rows (1.2); the composer's send is `aria-disabled` while the input is empty (as on every room). A member's view of a club with no messages: the room's empty line (11.5).

### 11.10 Navigation, deep links, `CampusMobile` (W2-S1)

- `MessagesMobile` (flag on): state `open: null | { kind: "club"; orgHandle; roomId; roomKind } | { kind: "thread"; threadId }`, plus the event chat layer's room id inside `ClubSpace`; `?channel=` resolves through the thread GET after the flag answered (2.3): `room !== null` → `{ kind: "club", orgHandle: room.org.handle, roomId, roomKind: room.kind }`; else `{ kind: "thread" }`; the read failing → `open: null`, the home on `All`, `replaceState("/messages")` and the `Couldn't open this chat.` toast (2.3; N6); the home is not needed for the view to open (the old `?channel=` rule, MM:5.3); `initialChannelId` is read once on mount. `?to=` as today. History per 2.3 (every layer a `pushState`, Back = `history.back()`, `popstate` the one closer). Closing a view refetches the home.
- Chip taps inside the space: `replaceState` to the room's id; the thread hook is keyed by room id (a new room = a fresh first read; the previous room's rows are dropped).
- Links out of the new screens: `/orgs/<handle>` (the club page), `/campus?tab=events`, `/campus?tab=orgs`, `/profile/<handle>` (a name tap in a bubble, as today).
- `CampusMobile`: 2.2 (the `null` gate on `?tab=chat` / `?channel=`).
- The tab bar: hidden while a space, an event chat layer, a conversation or a sheet is open (`useHideTabBar` for the new stack; the old boolean mounters untouched); the counter-less class bug of MM:9 (Group info over a conversation) is pre-existing in the OLD views and not touched.

## 12. Compatibility: what must keep working with cards, stubs and the new routes present

1. **The four old renderers filter stubs out of the array, never per bubble** (W2-B3, flag-independent, 8.6; PRIVACY-L6: a stub between two rows by one person would split their run, and a stub first on a day would carry an empty date separator): `messages/ConversationView.tsx` (after the split; today `MessagesMobile.tsx:1813-1820`): `const shown = messages.filter((m) => !m.hidden);` and the map, `prev`, `showGap` and `showSender` read `shown` — three lines; `messages/types.ts`: `MessageRow` gains `hidden?: boolean` (additive; W2-B3 adds it after W2-S lands); `src/app/campus/campus-home.tsx:16391` (`ChannelChat`): the same filter before `messages.map`, so `sameAuthor` and `showDateSep` read the filtered array; `public/html/messages.html:2407` (the map that builds the objects `msgs.forEach` walks copies named fields only, `:2407-2476`, so `hidden` must be carried: `hidden: m.hidden === true` on the built object) and `:1429` (`msgs.forEach`: `if (m.hidden) return;`) — two lines (N9); `public/html/_miniMessenger.js:652` (the map at `:652-665` gains `hidden: m.hidden === true`) and `:761` (skips it) — two lines. **`MessageBubble` gets no skip** (its first statements are hooks, `:4027-4035`; an early return there is a `react-hooks/rules-of-hooks` error, SPLIT-M3). No other change to those files.
2. **Cards in the old screens**: a card row is `kind: "poll" | "event_card"` with `content` = the fallback text and no media; every old renderer shows it as a text bubble (they read `content`, `users`, `reactions`, `parent_preview` only; MM:4). Reactions and replies (quote) on a card work as on text. A shared post cannot be attached to a card (cards have no `attachment`).
3. **Desktop** (`messages.html`, `campus-home.tsx` ChannelChat, the mini messenger): untouched but 12.1; the 2-s polling stays (it pays one `blocks` read per club-room GET, 8.6); `?after=` is not used there.
4. **The old inbox** (`GET /api/me/threads`, no param; PRIVACY-H1, W2-B3, one hunk, flag-independent, section 0 row 1): a club room's `last_message` is the newest row of its 5-row window (`:661-693`, the club-room read) whose `user_id` is not in `hiddenRes.hidden.blocked` (`:716-721`; `loadHiddenUsers` moves ABOVE the `lastByChannel` fill at `:695-707`, or the fill moves below it); none in the window → `last_message: null` (the row then reads `No messages yet`, accepted; the same window rule as 7.1.4). No Board exception (the old list reads no roles; the officer's post still opens in the thread). `unread` follows the chosen row as today (`:764`). Dms and groups are untouched. A card's preview is its fallback text (`last_message.content`); club-room entries keep `org`, `room_kind`, `can_post`; event rooms stay out.
5. **Share pickers** (`SharePostSheet.tsx`, `_sharePicker.js`): unchanged (B5 filtered on `can_post`); sharing a post into a club room stays a text message with an attachment, never a card.
6. **Reports**: a reported card's snapshot carries `kind`, `thread_root_id`, `card` (5.3); the admin content pages show `content` as today.
7. **The sender's delete** of a card: today's route, the cascade takes the side rows (6.1).
8. **`chat_repair_club`, the five triggers, the after-deploy check**: untouched; `chat_votes_drop_access` rides on the rows they delete (3.5).
9. **No old renderer crashes on** `card !== null`, `hidden: true`, `removed !== null`, `reply_count`, `author_role`: checked in the integration review by reading each renderer's field reads (MM:4 for the phone; the two static files and `ChannelChat` by grep), and on the Mac in the browser walk with a Lounge that holds a poll, a sign-up, an event card and a stubbed message.

## 13. Calendar, file ownership, build order, gates (cloud vs Mac), deploy order, rollback

### 13.0 Calendar (SCHEDULE-M3; open point 14.43 for the cut line)

| when | what | who |
|---|---|---|
| Sept 30 – Oct 3 | W2-S → W2-B2's first commit → W2-B1..B4 → the three screen first commits → W2-S1..S3 → integration review → the Mac handoff pushed; the Vercel Preview build green | cloud |
| Oct 4 | f2 (mailbox) — no chat work | Franky |
| Oct 5 – 6 (window 1) | the Mac list 13.3 steps 1–4; PRE-CHECK; Franky's yes; apply B; merge; the flag for the founders + SAE; the first phone test — before demo days show SAE the chat | Mac |
| Oct 7 – 8 | cloud repairs from window 1, if any | cloud |
| Oct 9 | f9 Android — no chat work | Franky |
| Oct 12 – 14 (window 2) | repairs applied; the flag-off walk repeated; the build that will be submitted | Mac |
| Oct 15 | **freeze of the flag-OFF surface** (section 0's nine rows); flag-gated fixes may still deploy | — |
| Oct 26 | `CHAT_V2_ALLOWLIST=*` and redeploy | Franky |

**Cut line:** if window 1 slips past Oct 9, W2-S3 (cards + the tray; its backend stays merged and harmless, the composer simply shows no "+") moves to window 2; then W2-S2's event chat layer; the home and the club space (W2-S1, W2-S2's Board + Lounge) are the demo-day minimum. The split, migration B and the four backend batches are never cut (they are what window 2 repairs against).

### 13.1 Order

**W2-S (alone) → W2-B2's first commit (a short serial prelude) → W2-B1 | W2-B2 | W2-B3 | W2-B4 side by side → the three screen first commits (a second serial prelude: S1, then S2, then S3) → W2-S1 | W2-S2 | W2-S3 side by side → integration review → handoff.** A first commit lands on the branch before the sibling batches start; a sibling rebases on the branch before its own first commit (SPLIT-L7). A mount file is created by its owner, never by the batch that consumes it (SPLIT-M4).

- **W2-B2's first commit**: `when.ts`, `cards/fallback.ts`, `cards/body.ts`, `blocks.ts`, `stub.ts`, the signatures of `cards/hydrate.ts` / `cards/snapshot.ts` / `event-refs.ts` (stubs answering an empty map / null / null), `ReadKnown.blocked?` and `MessageContext.blocked?` with the absent-`blocked` rule in `buildChatMessages` (the stub decision itself may be a no-op until 9.1 lands, but the signature W2-B4 calls is final; SPLIT-M6), and the `types.ts` edits of 1.3 (`InvalidCardRefusal`) and 5.3 (`CardSnapshot`) — W2-B4 builds against them (`SpaceResponse.upcoming?` of 7.2.6 is already in `types.ts`: it landed with this contract, section 0).
- **W2-S1's first commit**: `messages/v2-tokens.ts`, `messages/avatar.ts`, `src/lib/chat/use-chat-v2.ts`, `src/lib/chat/use-hide-tabbar.ts`, the fonts line `src/app/layout.tsx:96`.
- **W2-S2's first commit**: `club/ClubSpace.tsx` with the 11.3 props rendering only the header skeleton (W2-S1 imports it), `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts`, and the `onRemove?: () => void` prop on `ReactionPicker` (a row under Report, `pickerRowStyle(darkMode, true)`) with its pass-through on `MessageBubble` (W2-S3's `CardBubble` needs it; SPLIT-M5).
- **W2-S3's first commit**: `cards/CardBubble.tsx` with the 11.8 props rendering the fallback `content` as a plain bubble (W2-S2 imports it).

A change needed in someone else's file is a written request to that batch's owner, handled in the integration review. **Every batch: implement → adversarial reviews → one repair → gates** (13.3). Reviewers: W2-S — contract (10.1's table), move (every declaration's home and imports), logic (no behaviour change: hooks order, props, literals) — the B0 set (SCHEDULE-L2); W2-B1 — sql, security, plus the parse; W2-B2 / B3 / B4 — contract, security, behaviour; W2-S1 / S2 / S3 — contract, security, behaviour, design (375px, Light + Night, by reading; the design review of W2-S2 and W2-S3 also checks that every layer under `club/*` and `compose/*` calls `useHideTabBar()` and none writes `vibe-composer-open` itself — verify-1's SCREENS-H1 note). **One workflow script per stage (split; backend; screens; integration), never one for the wave** (SCHEDULE-M8): every builder writes `<batch>-notes.md` before its first edit and appends after every commit, so a resumed builder continues from the notes; a cut-off run is finished by a NEW small script for what is left, never by editing the old prompt (editing re-runs everything after it, CLOSE `:56`); reviewers write findings to disk in small pieces. Notes, reviews, repairs and gate outputs go under `handoffs/chat-redesign/wave-2-build/<batch>-*.md` (the wave-1 naming). No Write/Edit over ~150 lines at once.

### 13.2 Ownership (nobody else edits these)

| batch | owns |
|---|---|
| **W2-S** | `src/components/mobile/MessagesMobile.tsx` (the cut only), every file it creates under `src/components/mobile/messages/*.ts(x)` (10.1), `handoffs/chat-redesign/wave-2-build/tools/split-check.mjs` (the two changes of 10.3), `handoffs/chat-redesign/wave-2-build/S-*.md`, `S-split-check.txt` |
| **W2-B1** | `supabase/migrations/20261001110000_chat_v2_cards.sql`, `scripts/sql/chat-v2-cards-check.sql`, `handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs` (13.3), a `scripts/local-seed.mjs` addition (DATABASE-L9: one poll, one sign-up, one event card in `chat_seed_club`'s Lounge; B detected by `admin.from('chat_polls').select('message_id').limit(1)` — `42P01` / `PGRST205` = not applied, skip; before each RPC the card is looked up by `messages.kind` + `content` in the Lounge (`Poll: <seed question>` …) and not re-created; the seed's accounts pass `can_publish_now()` and `has_recorded_consent()` as the route would, since the RPC does not check them, 3.3.1; re-runnable) |
| **W2-B2** | `src/lib/chat/when.ts` + test, `cards/fallback.ts` + test, `cards/body.ts` + test, `cards/hydrate.ts`, `cards/snapshot.ts`, `blocks.ts`, `stub.ts` + test, `event-refs.ts`; `src/lib/chat/types.ts` (1.3 sentences, `InvalidCardRefusal`, `CardSnapshot`, comments; `SpaceResponse.upcoming?` is already there, section 0), `src/lib/chat/message-read.ts` (9.1 incl. `ReadKnown` / `MessageContext` / `describeRoom` / `readRoomEvent` / `readGoing` signatures, 9.2, 9.4), `src/app/api/me/threads/[id]/messages/route.ts` (9.2 and the one block read of 9.1; the POST's answer at `:601` is unchanged code — its rule is 9.1's, N3), `src/app/api/me/threads/[id]/cards/**`, the report snapshot hunk in `src/app/api/me/reports/route.ts` (5.3), `handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs` + `tools/validate-thread.test.mjs` + `tools/fixtures/*` |
| **W2-B3** | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, `RemovedContentCard` in `src/components/safety/ReportSheet.tsx`, `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` (6.3), the stub filters of 12.1 (`messages/ConversationView.tsx` — the three-line filter hunk only — + `messages/types.ts` `hidden?`, `public/html/messages.html` (two lines, `:2407` and `:1429`), `public/html/_miniMessenger.js` (two lines, `:652` and `:761`), `src/app/campus/campus-home.tsx`), the old inbox's preview hunk in `src/app/api/me/threads/route.ts` (12.4) |
| **W2-B4** | `src/app/api/me/inbox/route.ts`, `src/app/api/orgs/[slug]/space/route.ts`, `src/app/api/me/calendar/route.ts` |
| **W2-S1** | `src/components/mobile/MessagesMobile.tsx` (the flag fork, deep links, history), `src/components/mobile/CampusMobile.tsx` (2.2), `src/app/layout.tsx` (line 96 only), `messages/v2-tokens.ts`, `messages/avatar.ts` + test, `src/lib/chat/use-chat-v2.ts`, `src/lib/chat/use-hide-tabbar.ts`, `src/lib/chat/week.ts` + test, `messages/home/*`, `handoffs/chat-redesign/wave-2-build/S1-contrast.md` |
| **W2-S2** | `messages/club/*`, `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts` + test, the optional `onRemove` prop in `messages/MessageBubble.tsx` and `messages/ReactionPicker.tsx` (10.2.5) |
| **W2-S3** | `messages/cards/*`, `messages/compose/*` |
| integration | `handoffs/chat-redesign/wave-2-build/integration-*.md`, the Mac handoff |

Pure modules (`when`, `week`, `cards/fallback`, `cards/body`, `stub`, `page-merge`, `avatar`) import nothing that needs a server: `npm test` is plain `node --test` over `src/**/*.test.ts`; tests import with the `.ts` extension (Node 25 on the Mac, BN:5). `server-only` modules (`cards/hydrate`, `cards/snapshot`, `blocks`, `event-refs`) are never imported by a client file (the build gate catches it). Before writing any route, a batch reads the Next.js 16.3 guides named in asis section 10 (`context.params` is a Promise; `cookies()` is async; the proxy is `src/proxy.ts`).

### 13.3 Gates

**In the cloud (every batch):** `npm run typecheck` exit 0 repo-wide; `npm test` all green (1,374 today + the new tests); **`npm run build` exit 0** (SCHEDULE-M4: about 40 s, no env needed; the only check that sees `server-only` in a client import, a bad route export or a `useSearchParams` outside Suspense) after typecheck and before the reviews; `npx eslint <the batch's files>` exit 0, where a file that carries old errors (`MessagesMobile.tsx`, `CampusMobile.tsx`, `campus-home.tsx`; the 11 files of `B0-gate.md:19-30`) is compared rule-by-rule against `git show <base>:<path> | npx eslint --stdin --stdin-filename <path>` and may add none (`<base>` = the same sha 10.3 names). **The split's proof (10.3) is W2-S's gate alone** (SPLIT-M2); the integration review re-reads it once as 10.3 says. Route batches add a **stub harness** for the 3.10 missing-schema rows and the SQLSTATE → code table (a fake client answering the codes), since no database exists here (BN:3 "same for wave 2"). W2-B2's gate includes `node --test handoffs/chat-redesign/wave-2-build/tools/validate-thread.test.mjs`. **Migration B (SCHEDULE-M1):** W2-B1 commits `handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs` (about 30 lines: `libpg-query` from a scratchpad `npm install`, never a repo dependency; `parseSync` over the whole file, then `parsePlPgSQLSync` over every `CreateFunctionStmt`'s text by `stmt_location` / `stmt_len` — the names `libpg-query` 18.1.5 exports (`parseSync`, `parsePlPgSQLSync`, and the async `parse` / `parsePlPgSQL`; read from a scratchpad install of 18.1.5 for this draft; N22); exit 1 on any error) and its gate is `node …/sql-parse.mjs supabase/migrations/20261001110000_chat_v2_cards.sql` exit 0, the same over `scripts/sql/chat-v2-cards-check.sql` with its psql first line stripped; DO-block bodies are string constants to the parser, so the **read-through by two reviewers (sql, security)** stays for the DO blocks and the catalog queries. Nothing is run against a database. **The Vercel Preview build of the pushed branch is green before the Mac starts; the handoff carries the Preview URL** — read from the cloud through the Vercel connector when the session has one (this session does: the branch's deployment state, nothing else), else by Franky before Mac step 1 (N21). A Preview shows nothing behind the flag (section 0).

**On the Mac, in this order (BN:4.3; SCHEDULE-H2 with DATABASE-M2: two rehearsals, then the apply, then a commit):**
1. `git fetch && git checkout <branch>` (section 0 names it) → `pg_dump` the local database to the scratchpad. **Do not restore a pre-wave-1 backup before the rehearsal**; if one was restored, re-add a closed event chat by hand first (an event of `chat_seed_club` ended 10 days ago, then `select public.chat_repair_club(<id>)`), or the closed-room probes of 3.8 and the HTTP rows of step 2 skip (SCHEDULE-L3). → **Rehearsal 1** (the rollback copy in the scratchpad, `diff` = the last `commit;` → `rollback;` only; expected: `chat-cards: constants are empty` AFTER every constant was printed by 3.7's last block) → paste the constants into the file (one edit: `want_select`, the 21 `want_con_*`, the five `want_fn_*`; the PRE-CHECK's `select version()` line into the header) → **Rehearsal 2** (expected: green to `rollback;`) → the real local apply (`psql -f`) → `scripts/sql/chat-v2-rooms-check.sql` still 200/200; `scripts/sql/chat-v2-after-deploy.sql` 0 findings; `scripts/sql/chat-v2-cards-check.sql` all green; the seed re-run changes nothing the second time (same UTC day); the COST section filled (3.9) → **commit `chore(chat): migration B constants from the local rehearsal` on the branch and push** → `md5sum` of that committed file is the value the production apply hands the file through `chat_cards.file_md5` (3.9; never written in the file, N1); the local apply above may hand it the same way so the local record reads the same. Optional: the two-terminal race walk (3.9).
2. The three route cases of contract 15.8 again (create an event, RSVP as a member and a non-member, cancel with 2 RSVPs and 3 messages), then the wave-1 HTTP tables (the 59 + 10 cases of `integration-http.md:41-118`) to prove text sends and reads changed nothing; then the wave-2 rows: `POST …/cards` (poll, signup, event; per role; in a dm → `cards_club_rooms_only`; on the Board as a member → `board_officers_only`; in the closed room → `room_closed`; the 400 `invalid_card` fields; 422 with `field`), `PUT …/vote` (single, multi, anonymous, closed, slot full, a blocked pair's voters, the viewer's own removed poll → 404), the remove route (sender, mod, admin, owner, rank, open report, `already`, dm → `not_allowed`), `GET /api/me/inbox` per account (the two preview windows; a blocked author's row skipped; an officer's Board row kept), `GET /api/orgs/[slug]/space` (hidden club 404, non-member 403 `members_only`, Officers listed only for owner/admin with `unread: false`, `?events=1`), `/api/me/calendar` (the three fields null with the flag off, set with it on), `GET /api/me/threads` (the club-room preview skipping a blocked author, flag off), every saved answer through `validate-thread.mjs` (`card`, `hidden` stubs: blake blocks casey in the seed, `B1a-review-seed.md:26`). The `q.sh` / `c.sh` one-liners are recreated from the handoff (they are not in the repo, BN:4.1); `cookie.mjs` is in the repo (`wave-1-build/tools/`; verify-1's SCHEDULE-M6 note).
3. `GET /api/me/features` with `CHAT_V2_ENABLED=true` locally; the 404 of the gated reads with it off.
4. The browser walk at 375px in Light and Night as a member (blake) and an officer (avery), **flag ON**: the home with the four filters and Your week; a club space with Board (folded replies open and close, a reply sent), Lounge, chips, Up next, the Board strip; the event chat layer in `soon`, `live`, `after`, `closed` and its Back landing on the space; a poll voted and un-voted, a sign-up slot taken, left, a full slot; an event card's Going → Maybe → Not going; the three sheets end to end; the three empty states; the hardware back peeling one layer; a stubbed message invisible on the phone. **Flag OFF (PRIVACY-L8; the reviewer's path), as blake after blocking casey and as casey:** the old Messages list row of the Lounge (no message of the other's), the old thread (none), Campus › Chat (none), `messages.html`, the mini messenger and desktop Campus › Chat (none), a poll's fallback text by the other (a stub), the notifications list after an @mention by the other (nothing), the other's profile (`This account has restricted you` / `You blocked …`); then the wave-1 walk list (S69 `:79`) unchanged.

### 13.4 Deploy order and the flag

1. The branch (section 0) is green in the cloud and pushed; the Preview build is green; the Mac gates pass; the constants commit is on the branch. 2. Production PRE-CHECK queries (3.9, five) read-only. 3. **Franky's yes** → apply B at a quiet hour with the Management API recipe, sending in one request the `set_config('chat_cards.file_md5', '<md5sum of that git show output>', false)` line and then `git show origin/<branch>:supabase/migrations/20261001110000_chat_v2_cards.sql` (3.9; N1) → the `schema_migrations` row → CHECK AFTER APPLYING (1)–(3). 4. **Merge to `main`**: `git fetch origin && git checkout main && git merge --ff-only origin/main && git merge --ff-only <branch> && git push` (wave 1 fast-forwarded, S69 `:89`; local `main` is behind `origin/main` today, SCHEDULE-M7) → CHECK AFTER APPLYING (4): the record's `file md5` = `md5sum` of the file on `main`. 5. The after-deploy check, **then weekly and after any `chat-rooms` / `chat-cards` warning in the database log** (SCHEDULE-L5). 6. **`CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' ids>`, `CHAT_V2_CLUBS=<SAE's id>` in Vercel, Production only, then Redeploy (required: a deployment carries the env it was built with; the value is not read live — `flag.ts:52-54` reads `process.env` at call time, but that env is the build's; SCHEDULE-M2)**; the first phone test on real data is after that. A Preview shows nothing behind the flag (`chatV2MayRunHere`) while section 0's nine rows are live on it. 7. Oct 26: `CHAT_V2_ALLOWLIST=*` and redeploy.

Between the apply (3) and the merge (4), old code runs on the new database and nothing changes for it (section 0). If the merge cannot follow the apply the same day, B stays applied (harmless) and the merge waits.

### 13.5 Rollback

Screens the problem: unset `CHAT_V2_ENABLED` **and redeploy**, or use Vercel's instant rollback to the deployment before the flag (it carries its own env); either way the database is untouched (the routes then 404 and the phone shows the old list). Code the problem: Vercel's instant rollback first (the old code never reads B's tables). Roll back B only if its objects themselves are the problem (3.10); A stays. Card rows that exist by then keep showing as their fallback text in every screen, and 3.10 says what a re-apply needs.

## 14. Open points (each with the default this file builds unless Franky says otherwise)

| # | point | default |
|---|---|---|
| 1 | **D1 — the block stub and the officer Board-post exception.** Franky's call of Sept 29 (W0 `:56`) names the exception; the B0 reviewers saw an earlier relayed sentence without it. Built as: a top-level Board post (replies never), by someone who is an owner or admin of the club **now** (a demoted or departed officer's old posts become stubs); the exception is for the post itself, never for a quote of it (8.3). Franky may strike any of the three narrowings or the exception. | Build 8.1–8.3 as written. |
| 2 | **D2 — blocking against a direct database read.** | NOT in v1; the after-launch clause is written in 8.7. |
| 3 | **D3 — migration B written in the cloud, rehearsed and applied on the Mac; adds `chat_reply_counts` and `chat_votes_drop_access`; a fifth function counts as the trigger's.** | As section 3. |
| 4 | **D4 — sentences for the ten codes and the new `invalid_after`.** | As 1.3. |
| 5 | **D5 — the flag read once per mount; a skeleton until it answers; the Campus › Chat pill gone and `?tab=chat` / `?channel=` redirected with the flag on; nothing mounted for the chat tab while unknown.** | As section 2. |
| 6 | **D6 — the extraction-only split runs alone with the mechanical proof (ADDED fatal too).** | As section 10. |
| 7 | **D7 — 4-s `?after=` polls, the every-5th full read, 30-s home re-reads.** | As 9.3 and 11.1. |
| 8 | **D8 — the by-name allow-list refuses board / lounge / event with `room_locked`.** | As 6.3. |
| 9 | **D8 — `room_locked` stays the code for a reserved room name** (the sentence reads oddly on a create/rename form). | Accepted for v1; a new code comes with the custom-rooms UI. |
| 10 | **D9 — the remove route as 6.1; `RemovedContentCard` gets `by`; the officer copy has no appeal link.** | As section 6. |
| 11 | **D10 / D11 — scope and build order.** | As sections 0, 13, 15. |
| 12 | **What changes with the flag OFF: section 0's nine rows**, of which row 1 (the club-room stub, the old renderers' filter, the old inbox's preview filter) is the one people can see. Alternative: gate the stub and the two filters by `chat_v2` and let Apple's reviewer see a blocked person's club-room messages until Oct 26. | Flag-independent, as section 0 lists. |
| 13 | The home's **search button** (W0_Home) has no endpoint behind it. | Not in v1; the header keeps the pencil only. |
| 14 | **`Start a club`** on the no-clubs screen: no phone create-club screen exists. | Links to `/campus?tab=orgs` with `Find clubs on campus`; a phone create flow is after launch. |
| 15 | The club header's **"More" button** has no pinned target (MK:4). | A link to the club page (`/orgs/<handle>`), `aria-label="Open <club>'s page"`; no sheet. |
| 16 | **Two sentences for the Board's member footer**: the mockup's `Only officers post on the Board. You can reply to any post.` vs the refusal `Only officers post here.` | The screen's tile uses the mockup's sentence; the refusal sentence stays for a refused send and for the old screens. |
| 17 | **A per-post `New` mark on the Board** needs the viewer's `last_read_at`, which no payload carries (MK:5). Alternative: add `last_read_at: string | null` (my own row) to `SpaceRoom`. | Not in v1; the room chip's dot and the inbox dot are the unread signal. |
| 18 | **Repliers' avatars in the folded replies row** need the `?root=` read per post (MK:5). | Not in v1; `N replies` + the chevron only. |
| 19 | **`New event · Officers only`** on the Share an event sheet: no phone event-creation screen exists (MK:11). | Not built; the empty club's `Add your first event` links to `/campus?tab=events`. |
| 20 | **`CampusMobile` while the flag is unknown** on a plain `/campus`: hide the pill (a flash for the flag-off majority) or show it (a flash for the allow-listed few). With `?tab=chat` / `?channel=` present nothing is mounted for the chat tab until the answer (2.2). | Show today's tabs until the answer; remove the pill when the answer is `true`. |
| 21 | **History on the phone** (2.3): one `pushState` per layer, Back = `history.back()`, `popstate` the one closer, a deep link on `replaceState`; so Android's hardware back works (f9, Oct 9). Alternative: no history writes in v1, as the old list. | pushState / popstate, flag on only. |
| 22 | **`muted_until` on a club**: no mockup shows a muted club; mutes gate notifications, none in v1. | Sent; used for the All badge only (a muted club's unread stays out of the badge, 11.1); nothing else rendered. |
| 23 | **A `?brief=1` switch** so the 4-s polls skip `describeRoom` (C1): saves 4–8 PostgREST calls per poll in an event chat. | Not in v1 (clubs are tiny); after launch with the Realtime work. |
| 24 | **`MessageBubble`'s palette vs the mockups'** (mine: white ink on coral today, `#140806` in the mockups; theirs: glass vs `#161515`, MK:16.18). Reusing the bubble keeps reactions, reply, report and long-press free. | Reuse `MessageBubble` unchanged in v1; restyle after launch. |
| 25 | **A member who changes an RSVP to `Not going` inside the event chat** loses the room by trigger; the layer closes with `You left the event chat.` (nothing draws it). | As 11.6. |
| 26 | **Result bars on a multi-choice poll** (`count / total_voters` per option can sum past 100%). | Per-option share of voters (each bar independent); the footer's `N voted` is distinct people. |
| 27 | **A fourth table `chat_event_cards` for the note** and the extra `p_note` argument (3, departure a–b). Alternative: no note in v1 (drop `note` from `CreateCardBody` and the sheet). | The table. |
| 28 | **Replies under a Board card** (a poll or an Event card posted on the Board by an officer) are allowed (3.8.4, 9.5). | Allowed; they fold like any reply. |
| 29 | **`up_next` regardless of RSVP** (the mockup's `your RSVPs` subtitle is wrong for the payload); the grid draws two cards. | The club's next 3 not-ended events, the first two drawn; no subtitle; the RSVP mark only when the viewer RSVP'd. |
| 30 | **A demoted officer keeps the Officers room when they were also added by name** (C7). | Leave it; removing them stays a by-hand step for the owner. |
| 31 | **`chatV2For` asked three times per home mount** (features, inbox, calendar; no cache). | Accept for v1. |
| 32 | **Card text is not scanned for @mentions** and never notifies. | Yes: mentions are a text-message feature. |
| 33 | **`event_rsvp_counts()` is not used** for `EventRef` counts (it applies `event_visible` to the caller; the service role has no `auth.uid()`); `eventRefsFor` counts `rsvps` itself. | As 5.5. |
| 34 | **The sign-up row layout** (single-line vs two-line, MK:16.11) and which `Take a spot` is coral. | Two-line when any slot label is longer than 12 characters; the first open row is coral. |
| 35 | **Week strip day taps** (no day sheet in v1). | Scroll the card row to that day's first card. |
| 36 | **No unread signal on the Officers room or a private `room`** (ROUTES-M2): no `channel_members` rows exist there (A:905-938), mark-read cannot create one. Alternative: rows for officers on the Officers room in a later migration. | `unread: false`, no dot, in v1. |
| 37 | **Unread counts include stubbed messages** (ROUTES-L9, D1): a Lounge can say `N new` for messages the viewer will not see; opening it clears the count. Alternative: subtract stubbed rows (one more read per club). | Accepted for v1. |
| 38 | **A vote in a closed event chat goes with a withdrawn RSVP** (DATABASE-L6): a closed poll's `N voted` can drop after the fact. Alternative: skip the delete when the room is closed for everyone. | Accepted for v1 (the trigger does not read the window). |
| 39 | **A mod's removal reads `Removed by a club officer.`** (PRIVACY-L1): the payload carries no rank; a mod is not an officer in the product's words. Alternative: `Removed by your club's officers.` for both. | D9's literal for both (the stored marker is the same string and is never reworded). |
| 40 | **Fonts at weight 800** (SCREENS-M3): the mockups use 800 for both families; the app loads neither at 800. Alternative: no font change — Fraunces titles at 900 (today's header) and every DM Sans 800 at 700. | Load 800 for both (`layout.tsx:96`, W2-S1's first commit; two more static weights). |
| 41 | **`You'll appear in the event chat.` on the Event card** (SCREENS-L5; Franky's call b names the Going button): shown under the pills while the viewer is not in the room. Alternative: the RSVP sheet only. | On the card while `viewer_status === null && room_id === null`. |
| 42 | **Blocked people inside group chats** (ROUTES-H1): today a group with a blocked member stays visible with all its messages (`threads/route.ts:730-738`); hiding them would change the old screens too. | Not in v1; club rooms only. |
| 43 | **The calendar and the cut line** (13.0): two Mac windows around f2, f9 and demo days; W2-S3 is the first batch that moves to window 2. | As 13.0. |
| 44 | **The Share-an-event list comes from the space read (`?events=1`, `SpaceResponse.upcoming?`)** (ROUTES-M4) because `GET /api/events?org_id=` hides a hidden club's events from its own members. Alternative: make the events route answer a member of a hidden club (a campus route change). | The space read; one additive optional field. |
| 45 | **The branch name** (SCHEDULE-M7): the session's `claude/relaxed-davinci-9d11h3` today; draft 1 said `chat-v2-wave-2`, which does not exist. | One name everywhere: the branch this session pushes; the handoff's first line names it and its head. |
| 46 | **A `?channel=` deep link whose resolving read fails** (a stale push link, a room lost by an RSVP change; N6): the home on `All` with the toast `Couldn't open this chat.` Alternative: mount today's `ConversationView`, which draws its own failure inline. | The home + the toast (2.3). |

## 15. Not in wave 2

- **After launch (accepted plan, W0 `:18`; plan-critique "Smallest v1"):** the month sheet and week swiping; non-member event rooms (the stretch goal of wave-1 contract 9: `events.room_open_to_rsvps`, the officer switch, the seven checks); up to 3 custom rooms per club, the custom-rooms UI, room pinning and a separate reserved-name code; photos in club and event rooms (after location stripping); notification settings, `board_post` / card notification rows, push; "seen by" (a count for officers from 5 up); Realtime, typing, presence, "here now"; the React desktop Messages page and the retirement of `messages.html`, `_miniMessenger.js` and Campus › Chat on desktop; custom titles ("Treasurer"); `events.creator_id` → SET NULL; event counts "from 5 up"; the settings-columns privacy fix; the grants clean-up on `message_reactions` and `org_channel_members`; `is_blocked_either_way` in `messages_select_org_member` (8.7); a `?brief=1` poll switch; `MessageBubble`'s restyle to the mockup palette; a phone create-club and create-event flow; message search; the `# name` title in `CampusMobile`'s drill-down (unreachable with the flag on; retired with `ChatPane`); hiding blocked people inside group chats (14.42); an unread signal on the Officers room (14.36); subtracting stubs from unread counts (14.37); a closed room keeping its votes (14.38); a per-post `New` mark and repliers' avatars on the Board (14.17, 14.18).
- **Never in v1 (W0 `:21-28`):** Headcount, Bring / Rides / "I'm here" / album tiles, cards in DMs or group chats, the mention picker for the Officers room, editing a posted card or a poll's `closes_at` from the phone (the column and the API keep it; v1 sends none).
- **Not chat, not this wave:** the half-made club on a failed owner-row insert (C11), the nested-button hydration warning in `CampusMobile`'s FeedCard (C8), the push migration's renumbering (critique #9), `rsvps_update_own` letting a student move an RSVP onto another event (B1a verify note), `tooManyRequests` bodies without a `code`, the old views' boolean `vibe-composer-open` (MM:9; the new stack has its own counted hook).

## 16. Where each finding went

### 16.0 Where each input went (carried from draft 1, updated)

**Orchestrator's defaults:** D1 → 8.1–8.3, 14.1 (narrowed to club rooms, ROUTES-H1) · D2 → 8.7, 14.2 · D3 → 3 (whole), 9.4, 14.3 · D4 → 1.3, 9.2, 14.4 · D5 → 2, 11.10, 14.5, 14.20 · D6 → 10, 14.6 · D7 → 9.3, 11.1, 11.5, 14.7 · D8 → 6.3, 14.8, 14.9 · D9 → 6.1, 6.2, 14.10, 14.39 · D10 → 0, 11, 15 · D11 → 0, 13.
**Franky's calls (W0):** 1 names → 1.1 · 2 folded quiet replies → 11.4 · a/4 members-only event rooms → 11.6, 15 · b who's going inside the room, the Going line → 11.6, 8.3, 11.8, 14.41 · c SAE → nothing new (live) · d/10 names on sign-ups, anonymous switch on polls → 3.1, 5.2, 11.7, 11.8 · 5 room life → 3.4, 11.6 · 8 the Campus › Chat pill → 2.2 · 27 owners/admins/mods remove → 6 · after-launch list → 15 · "Your hat" = the role → 1.1, 11.3 · blocking both ways with the officer exception → 8 · people who already RSVP'd → nothing (accepted) · on for everyone Oct 26 → 13.0, 13.4.
**Wave-1 contract sections:** 0 → 0 · 1 → 1.1 · 2 (the flag) → 2, 13.4 · 4.1 → 3.1 · 4.2 → 3.2–3.5 · 4.3 → 5.1 · 4.4 → 4.1, 4.3 · 5 → 4, 5.2, 5.3 · 6.0 → 1.3 · 6.1 → 9 · 6.3 → 6.1, 6.2 · 6.4 → 11.1 · 7 → 7, 2.3, 11.0 · 9 → 15 · 10 → 12 · 11 → 13.3 · 12.2 → 8 · 12.3 → 6.1 · 12.5 → 6.2 · 12.13 → 11.7 · 14.1 → 13.3 · 14.4 / 16.1 → 4.1 · 14.6 → 1.4 · 14.7 → throughout · 14.9 → 1.3 · 14.10 → 6.1 · 15.1–15.8 → 3.0, 3.5, 3.8, 13.3 · 15 "for the wave 2 contract" → 8.7 · 16.2 → 4.1, 6.1 · 16.5 → 5.2, 5.5.
**Session 69 close, carry-overs C1–C16 and the cloud block:** as draft 1 (SCHEDULE's carry-over table found every one landed; its four gaps are M6, L5, L3, M8 below).
**Build-notes deltas (BN), plan critique, the five maps:** as draft 1, section 16; plus MM:9 → 11.0 (the tab-bar hook), MK:0.1 → 11.0 (the Light muted token and the two coral marks).

### 16.1 The 92 findings

Severity as the critics defined it. TAKEN = written in as asked; DIFFERENT = taken in another form, with the reason; REJECTED = not taken, with the evidence. Counts: 88 TAKEN, 4 DIFFERENT (ROUTES-M2, SPLIT-M3, PRIVACY-L1, SCHEDULE-H2), 0 REJECTED. Where two critics met on one line the decision is in the row: SPLIT-M3 vs PRIVACY-L6 (the array filter won: no hooks question, right grouping), DATABASE-M2 vs SCHEDULE-H2 (one paste, two rehearsals), ROUTES-M3 vs SPLIT-M6 (both: the space read uses `readChatMessages`, and `buildChatMessages` reads the set when absent), ROUTES-H1 vs SCHEDULE-H1 row 1 (club rooms only).

| finding | section(s) | verdict | one line |
|---|---|---|---|
| DATABASE-M1 | 3 (opening), 3.9, 3.10 | TAKEN | The five `REFERENCES` hold SHARE ROW EXCLUSIVE on `messages`, `channels`, `users` to COMMIT; the probe stays short; the ROLLBACK's drop noted; wall time in COST. |
| DATABASE-M2 | 3.0.4, 3.7, 13.3 | TAKEN | One constants block at the end of the POST-CHECK prints every constant and raises once; the PRE-FLIGHT compares known texts only; two rehearsals, one paste. |
| DATABASE-M3 | 3.3.1, 3.6 | TAKEN | The gate ledger, term by term; the RPC comments say the route checks the person. |
| DATABASE-L1 | 3.5, 3.9 | TAKEN | `thread_root_id is not null` in the query; COST explains the literal and the `$1` shape. |
| DATABASE-L2 | 3.9 | TAKEN | COST runs the statements, not the function calls; `\timing` for one vote. |
| DATABASE-L3 | 3.0.6 | TAKEN | The nine `pg_class` names, the constraint-backed indexes included. |
| DATABASE-L4 | 3.0.8, 3.10 | TAKEN | A re-apply after a rollback that kept card rows needs the DELETE or `chat_cards.allow_orphans`; never the guard edited. |
| DATABASE-L5 | 3.5 | TAKEN | `chat_repair_club` 5a/5b in the fire list; the Officers gap covers demotion, leave and removal. |
| DATABASE-L6 | 3.5, 14.38 | TAKEN | Accepted and written down as an open point. |
| DATABASE-L7 | 3.1, 3.0.6, 3.7 | TAKEN | `chat_poll_options_id_poll_id_key` and the composite `chat_poll_votes_option_fkey`; 21 constraints. |
| DATABASE-L8 | 3.9, 13.3 | TAKEN | The race is by construction; the script asserts `for update` twice; the two-terminal walk is optional. |
| DATABASE-L9 | 13.2 | TAKEN | The seed detects B, looks each card up before creating it, and uses accounts that pass the person gates. |
| DATABASE-L10 | 3.0.8, 3.6, 3.7 | TAKEN | The row guards named as a probe convenience; the trigger function in the `(sig, vol, cfg)` loop; its ACL left as A's. |
| DATABASE-L11 | 3.3, 3.2, 3.8.2 | TAKEN | `^[0-9]{1,3}$`; a capacity of 1000 in the probe. |
| ROUTES-H1 | 8.2, 8.3, 8.5, 5.4, 9.1, 0, 14.42 | TAKEN | `room !== null` first; a dm or a group never reads `blocks` and never stubs; group chats are an open point. |
| ROUTES-H2 | 4.3 | TAKEN | Step 9 selects the five columns and refuses `removed_at`; step 10 reads the block set; step 12 hydrates the real row. |
| ROUTES-M1 | 7.1.4 | TAKEN | Two preview reads, one per room kind. |
| ROUTES-M2 | 7.2.3, 11.3, 11.5, 14.36 | DIFFERENT | `unread: false` and no dot as asked; the mark-read call is not skipped on the client (it cannot tell; the update matches nothing and answers `ok`). Draft 2's 7.2.3 said the opposite (verify-1's one WRONG, = N16); fixed here, 7.2.3 and 11.5 now agree. |
| ROUTES-M3 | 7.2.4, 9.1 | TAKEN | `board_latest` through `readChatMessages` with the built access and the loaded room; `buildChatMessages` reads the set when absent. |
| ROUTES-M4 | 7.2.6, 11.7, 14.44 | TAKEN | Option (a): `?events=1` → `upcoming`; `SpaceResponse.upcoming?` additive. |
| ROUTES-M5 | 9.1, 8.3, 13.2 | TAKEN | The thread GET reads once and hands the set to `readChatMessages` and `describeRoom` → `readRoomEvent` → `readGoing`. |
| ROUTES-L1 | 4.1.13 | TAKEN | `readChatMessage(supabase, id, { viewerId, access: member })`; it loads the room itself. |
| ROUTES-L2 | 1.3, 4.1.6, 4.3.5 | TAKEN | `InvalidCardRefusal = Refusal<"invalid_card"> & { field: string }`. |
| ROUTES-L3 | 4.0, 6.1.1 | TAKEN | One rule: a non-uuid `[messageId]` → 404; a non-uuid `[id]` falls through to `ensureMember`'s 403. |
| ROUTES-L4 | 6.1.2, 6.1.3 | TAKEN | The sender's delete keeps `{ ok: true }`; the dm no-row case moves to 403 `not_allowed`, said out loud. |
| ROUTES-L5 | 5.3, 3.10 | TAKEN | The report snapshot's missing-column retry with today's six columns. |
| ROUTES-L6 | 5.5, 7.3 | TAKEN | `counts: false` skips the `rsvps` read for the calendar. |
| ROUTES-L7 | 7.1.6 | TAKEN | `limit(clubs.length * 10)`; a club past the window shows null. |
| ROUTES-L8 | 7.1.4, 1.2 | TAKEN | `author_name: ""` → the text alone. |
| ROUTES-L9 | 7.1.5, 8.3, 14.37 | TAKEN | The visible consequence is an open point. |
| SCREENS-H1 | 11.0, 11.3, 11.6, 11.7, 11.10, 13.1, 13.2 | TAKEN | `useHideTabBar()` (counted) in `src/lib/chat/use-hide-tabbar.ts`; the four new mounters call it. |
| SCREENS-M1 | 11.3, 11.6, 2.3, 11.10, 11.8 | TAKEN | `club/EventChat.tsx` is a layer over the space; an event chip never becomes the active chip; `initialRoomKind` on `ClubSpace`. |
| SCREENS-M2 | 1.4, 1.2, 11.3 | TAKEN | `isSoon` (within 24 h) gates the ring, the live chrome, the spoken "soon" and the bloom. |
| SCREENS-M3 | 11.0, 13.2, 14.40 | TAKEN | `layout.tsx:96` loads 800 for both families (W2-S1's first commit); SOFT dropped; the alternative is an open point. |
| SCREENS-M4 | 11.0, 13.2 | TAKEN | Light muted = `--ink-sub`; the tinted-surface coral mark `#B5381A`; `S1-contrast.md`. |
| SCREENS-M5 | 2.3, 11.10, 14.21 | TAKEN | One `pushState` per layer, Back = `history.back()`, `popstate` the one closer, deep links on `replaceState`. |
| SCREENS-M6 | 2.2, 14.20 | TAKEN | Nothing mounts for the chat tab while the flag is unknown and a chat param is present. |
| SCREENS-M7 | 1.2, 11.1 | TAKEN | Option (a): `home/PersonRow.tsx`; `EmptyState tab="all"` for Chats; one clock (`rowTime`). |
| SCREENS-L1 | 11.1 | TAKEN | The safe-area inset above the header; nothing sticky; the tab bar the only fixed chrome. |
| SCREENS-L2 | 1.2 | TAKEN | The `today: <title>, going` form; `; ` between two events. |
| SCREENS-L3 | 1.2 | TAKEN | `your pick`; `:` vs `, including`; the raw slot label. |
| SCREENS-L4 | 1.4, 1.2 | TAKEN | `rowTimeSpoken`. |
| SCREENS-L5 | 1.2, 11.8, 14.41 | TAKEN | `role="group" aria-label="Your RSVP"` and the line while not in the room; an open point. |
| SCREENS-L6 | 11.3, 14.29 | TAKEN | The grid draws `up_next.slice(0, 2)`. |
| SCREENS-L7 | 1.2, 11.4 | TAKEN | `Earlier messages` under the last post on the Board. |
| SCREENS-L8 | 1.2, 11.1, 14.22 | TAKEN | The preview rule (Board when unread, else the newer); a muted club out of the badge. |
| SCREENS-L9 | 1.2, 11.3, 11.4, 11.6, 11.7, 11.0 | TAKEN | The four states pinned; `LoadFailed tone` everywhere. |
| SCREENS-L10 | 2.3, 9.3, 11.5 | TAKEN | The deep link waits for the flag; `initialPage` on the hook. |
| SCREENS-L11 | 1.2, 11.8 | TAKEN | `Someone`; `Leave` on a taken slot, full or not. |
| SCREENS-L12 | 2.1 | TAKEN | The bare header during `null`. |
| SCREENS-L13 | 1.2, 11.5 | TAKEN | The chip's spoken state; the place clause; the sign-up sheet's three additions; `groupMode` / `showSender`. |
| SCREENS-L14 | 11.4, 11.5, 11.7 | TAKEN | `append` on the oldest-first state; the Board view shows it first with `Reply`. |
| SPLIT-M1 | 10.2.1, 10.3 | TAKEN | ADDED is fatal (the tool exits 1 on it); a non-empty report means the split is wrong. |
| SPLIT-M2 | 10.3, 13.3, 11.0 | TAKEN | The proof is W2-S's alone; `listFiles` non-recursive; the integration CHANGED list (five names, incl. `MessagesMobile` and `ConversationView`); `HomeFilter`. |
| SPLIT-M3 | 12.1, 10.2.5 | DIFFERENT | No skip in `MessageBubble` at all: PRIVACY-L6's array filter in `ConversationView` (a W2-B3 hunk in a file 13.2 now names) fixes the hooks question and the grouping. |
| SPLIT-M4 | 13.1, 11.3, 11.8 | TAKEN | `ClubSpace` is W2-S2's first commit, `CardBubble` W2-S3's. |
| SPLIT-M5 | 13.1, 10.2.5 | TAKEN | `onRemove?` lands in W2-S2's first commit. |
| SPLIT-M6 | 9.1, 13.1 | TAKEN | `buildChatMessages` reads the set when absent; `MessageContext.blocked?` in W2-B2's first commit. |
| SPLIT-L1 | 10.1 | TAKEN | `./sheet-styles` for `GroupSettingsView.tsx`; `type ParentPreview` for `ConversationView.tsx`. |
| SPLIT-L2 | 10.3 | TAKEN | `<sha>` = the commit W2-S starts from, first line of `S-split-check.txt`. |
| SPLIT-L3 | 10.2.5 | TAKEN | The edits to moved files listed exactly (with PRIVACY-L6's form). |
| SPLIT-L4 | 1.4, 13.2 | TAKEN | `weekRange` lives in `week.ts` (W2-S1). |
| SPLIT-L5 | 10.3 | TAKEN | The `"use client"` grep and the import allow-list grep. |
| SPLIT-L6 | 10.1 | TAKEN | Declaration lines with the comment lines named apart (the four folded rows fixed). |
| SPLIT-L7 | 13.1 | TAKEN | First commits land as serial preludes; siblings rebase. |
| PRIVACY-H1 | 12.4, 8.3, 13.2, 13.3, 0, 14.12 | TAKEN | The old inbox's club-room preview skips blocked authors (W2-B3); in the flag-off list and the Mac walk. |
| PRIVACY-M1 | 5.2, 4.3.12, 9.1 | TAKEN | `hydrateCards(client, …)` reads voters on the cookie client; the hidden-voter rule. |
| PRIVACY-M2 | 8.3, 9.1, 14.1 | TAKEN | `parent_preview` null whenever its author is blocked; no role read for parents. |
| PRIVACY-L1 | 1.2, 6.2, 14.39 | DIFFERENT | D9's literal kept for both (the orchestrator's default); the alternative sentence is an open point. |
| PRIVACY-L2 | 8.4 | TAKEN | A stub reported by id is harmless; the report route unchanged. |
| PRIVACY-L3 | 8.7, 3.1 | TAKEN | `( SELECT auth.uid() )` form; the own-row arm; no restatement of `chat_poll_votes`. |
| PRIVACY-L4 | 1.2, 11.8 | TAKEN | A count larger than its names is the accepted look; no `+N` for hidden people. |
| PRIVACY-L5 | 1.2, 11.4 | TAKEN | An all-stub fold shows the reply field only. |
| PRIVACY-L6 | 12.1, 10.2.5, 13.2 | TAKEN | The arrays are filtered before grouping; `MessageBubble` untouched by W2-B3. |
| PRIVACY-L7 | 8, 14.1 | TAKEN | The three narrowings in one line. |
| PRIVACY-L8 | 13.3.4 | TAKEN | The flag-OFF block walk as blake and as casey. |
| SCHEDULE-H1 | 0, 13.3, 14.12, 8.6 | TAKEN | The nine-row flag-OFF table replaces "nothing, with one exception"; row 1 scoped by ROUTES-H1; the block set read once per request. |
| SCHEDULE-H2 | 13.3 step 1, 3.9, 3.10, 13.4 | DIFFERENT | Two rehearsals, not three (DATABASE-M2's one paste); the commit, the push, `git show origin/<branch>:…`, and the `file md5` in the APPLY RECORD as asked. |
| SCHEDULE-M1 | 13.3, 13.2 | TAKEN | `tools/sql-parse.mjs` over `libpg-query`; the read-through stays for DO blocks. |
| SCHEDULE-M2 | 13.4, 13.5, 3.10 | TAKEN | "and redeploy" wherever an env var changes; instant rollback named. |
| SCHEDULE-M3 | 13.0, 0, 14.43 | TAKEN | The calendar table and the cut line. |
| SCHEDULE-M4 | 13.3, 10.3, 13.2 | TAKEN | `npm run build` in every batch's cloud gate; the Preview build green before the Mac. |
| SCHEDULE-M5 | 3.10 | TAKEN | The missing-schema table gains the calendar, the guard, the snapshot, the screens and the without-A column. |
| SCHEDULE-M6 | 5.4, 13.2, 13.3 | TAKEN | `tools/validate-thread.mjs` with fixtures, W2-B2. |
| SCHEDULE-M7 | 0, 13.4, 14.45 | TAKEN | One branch name (the session's); the fact files committed; `git fetch` + `--ff-only` merge. |
| SCHEDULE-M8 | 13.1 | TAKEN | One script per stage; notes before the first edit; a cut-off finished by a new small script. |
| SCHEDULE-L1 | 10.3, 13.3 | TAKEN | `git show <base>:…` with the same sha as the checker. |
| SCHEDULE-L2 | 13.1 | TAKEN | W2-S's reviewers: contract, move, logic. |
| SCHEDULE-L3 | 13.3 step 1, 3.8 | TAKEN | No pre-wave-1 restore before the rehearsal; the closed event chat re-added by hand if so. |
| SCHEDULE-L4 | preamble | TAKEN | The cloud block restated (psql 16 binaries, npm registry, `npm run build`). |
| SCHEDULE-L5 | 13.4.5 | TAKEN | Weekly and after any `chat-rooms` / `chat-cards` warning. |
| SCHEDULE-L6 | 3.9 | TAKEN | PRE-CHECK (5): `select version()` equals the local stack's. |

### 16.2 Verification, part 1 (`wave-2-contracts-verify-1.md`): the 92 verdicts, the one WRONG, the five notes

The verifier read every one of the 92 rows of 16.1 against the text it points to: 88 TAKEN, 3 DIFFERENT fine (SPLIT-M3, PRIVACY-L1, SCHEDULE-H2), 0 DROPPED, 1 WRONG. Those verdicts stand; 16.1 is unchanged but for the ROUTES-M2 row.

| verify-1 point | verdict here | where it went |
|---|---|---|
| ROUTES-M2 WRONG — 7.2.3 said 11.5 skips the mark-read call; 11.5 and 16.1 said it does not | TAKEN (fixed) | 7.2.3 now reads "11.5 does NOT skip the mark-read call … the update matches nothing and answers `{ ok: true }`" (`read/route.ts:19-23`); 11.5 unchanged; the 16.1 row says so. (= N16.) |
| SCREENS-H1 note — the 13.3 design-review line ("every layer under `club/*` and `compose/*` calls the hook and none writes the class") | TAKEN | 13.1's reviewer list: the design review of W2-S2 and W2-S3 checks it by reading. |
| SCREENS-M2 note — 1.2 wrote `isSoon(starts_at, now)`; 11.3 cited `room-state.ts:118` for `soon` | TAKEN | 1.2: `isSoon(starts_at, ends_at, now)` (= N11); 11.3: `room-state.ts:115` (checked: `:115` is `return "soon"`, `:118` is the last `return "closed"`). |
| SPLIT-M2 note — the integration ADDED list will also hold W2-S1's flat `v2-tokens.ts` and `avatar.ts` | TAKEN | 10.3's integration paragraph names them (the tool walks every flat `.ts(x)` under `messages/`). |
| SCHEDULE-M6 note — `cookie.mjs` not named in the Mac step | TAKEN | 13.3 step 2: `cookie.mjs` is in the repo (`wave-1-build/tools/`); `q.sh` / `c.sh` are not. |
| DATABASE-L4 note — under the Management API "the same session" is the same request body | TAKEN | 3.10's re-apply sentence; 3.9 and 13.4 use the same form for `chat_cards.file_md5` (N1). |
| Two line drifts found by the verifier's cross-check (`room-state.ts:118` → `:115`) | TAKEN | 11.3. A third drift found while writing this draft: `split-check.mjs` is 128 lines; `process.exit` is at `:128` (draft 2 and verify-1 both cited `:138`) and `listFiles` at `:76-88` (`:81` recurses; cited `:79-90`). 10.3 carries the real numbers. |

### 16.3 Verification, part 2 (`wave-2-contracts-verify-2.md`): N1–N24, where each went

TAKEN = written in as asked; DIFFERENT = written in another form because the code (read again for this draft) says so; REJECTED = not taken, with the evidence. Counts: 22 TAKEN, 2 DIFFERENT (N12, N13), 0 REJECTED.

| N | severity | verdict | where it went / the code fact |
|---|---|---|---|
| N1 the APPLY RECORD's md5 was written inside the file it hashes | HIGH | TAKEN | 3.9 (the md5 is handed in through `set_config('chat_cards.file_md5', …)` in the same session / request and read back with `current_setting`, `NOT GIVEN` fails CHECK (4); A's record shape at A:1941-1959 checked), 3.10 (one request: the line, then `git show`), 13.3 step 1 (no second commit), 13.4 step 3. |
| N2 `users(name)` embed is ambiguous on `messages` | MEDIUM | TAKEN | 7.1.4: `users:users!messages_user_id_fkey(name)`, `author_name: row.users?.name ?? ""`. Checked: `messages.removed_by` references `users` (`20260923090000:2146`); `MESSAGE_JOINS` names the hint (`message-read.ts:66`), as does `hydrateParentPreviews` (`:190`). |
| N3 the send answer cannot 503 on a failed block read | MEDIUM | TAKEN | 9.1 (`toChatMessages` returns `.messages`, `:522-529`, comment `:513-517`; the POST at `:601-607` never reads `complete`): a failed read answers the sender's own row with `hidden: false`, `parent_preview: null`, logged once; section 0 row 1; 8.6; 13.2 W2-B2's `messages/route.ts` entry. |
| N4 three flag-OFF changes missing from section 0's table | MEDIUM | TAKEN | Row 1 gains the null quote (`MessagesMobile.tsx:4477-4478` draws nothing for a null preview); new row 9 (the hydrated `card` and its 503 path); the `room.event.going` sentence after the table (no `going` read in the three old renderers, grep; `campus-home.tsx:9621,9951` read `going_count` from the events feed). The table has nine rows; every "eight" became "nine" (0, 13.0, 13.4, 14.12, 16.1). |
| N5 four screen states with no copy in 1.2 | MEDIUM | TAKEN | 1.2 "Inside a club": `Couldn't load this club.`, `Couldn't load this chat.`, `Couldn't load the Board.`, `<club> · event chat`; 1.2 week cards: `Ended` when `room_state === "after"`; 11.4 and 11.5 name their line. |
| N6 the `?channel=` deep link had no failure state | MEDIUM | TAKEN | 2.3 (any non-200 → the home on `All`, `replaceState` to `/messages`, the toast `Couldn't open this chat.`; `messages/route.ts:94-97` checked), 1.2, 11.10, open point 14.46. |
| N7 the non-uuid `[messageId]` 404 sat before auth in 6.1 and nowhere in 4.3 | MEDIUM | TAKEN | 6.1 step 1 = auth (`[messageId]/route.ts:17-25` checked), 1b = the uuid check (today a 500 from the cast, `:36-38`); 4.3 gate 2b; 4.0 "after auth and the flag gate"; section 0 row 4 names the 500 → 404. |
| N8 a 503 after the RPC succeeded invited a duplicate card | MEDIUM | TAKEN | 4.1.13 (the read-back tried once more), 11.7 and 1.2 (`try_again` closes the sheet, `reload()`, the toast; never a re-submit). |
| N9 `messages.html`'s filter read a field its objects never carry | MEDIUM | TAKEN | 12.1: `:2407` (the map, `hidden: m.hidden === true`) and `:1429` (the skip) — checked: the map at `:2407-2476` copies named fields only, none is `hidden`; the same two-line form for `_miniMessenger.js` (`:652-665`, `:761`); 13.2 W2-B3. |
| N10 the inbox's step-1 select lacked `created_at` | LOW | TAKEN | 7.1.1 (`channel_members.created_at`, `20260430190000:109`; `pinned_at` `20260505140000:5`; `muted_until` `20260506120000:15`). |
| N11 `isSoon` with two arguments in 1.2 | LOW | TAKEN | 1.2: `isSoon(starts_at, ends_at, now)` everywhere (= the SCREENS-M2 note). |
| N12 3.0.3 pins three fingerprints, 3.7 and 3.9 said "the two" | LOW | DIFFERENT | "The three fingerprints of 3.0.3" in 3.7 and 3.9 (the verifier offered either form); `org_members_drop_club_access` stays pinned because its DELETE is the row path the new trigger rides on (3.5), so a drift there is a drift B cares about. |
| N13 `CAMPUS_TIME_ZONE` had no home | LOW | DIFFERENT | It has one the verifier's grep missed: `export const CAMPUS_TIME_ZONE` at `src/lib/push/event-notice.ts:51`, a pure, client-safe module (one type import, `:22`). 1.4 and 5.1: `when.ts` re-exports it from there; no second copy. `eventWhenText` (`:64`) is not reused (the mockups' shape differs). |
| N14 `hidden-users.ts` and `pair-block.ts` cited bare | LOW | TAKEN | 5.4 and 8.5: `src/lib/safety/hidden-users.ts:30-34`, `src/lib/safety/pair-block.ts:154-173` (`ls src/lib/safety/` checked; `src/lib/messages/` holds `channel-access`, `group-rules`, `reaction-emoji`). |
| N15 seven "declaration lines" were the comment line above | LOW | TAKEN | 10.1: `ParentPreview` :136, `visuallyHiddenStyle` :268, `chatRefusalLine` :348, `toastSendFailure` :354, `entryCanPost` :364, `StagedMedia` :200, `pickerRowStyle` :4968, each with its comment lines named; all seven checked in the file. |
| N16 7.2.3 vs 11.5 on the mark-read call | LOW | TAKEN | 7.2.3 (= verify-1's WRONG). |
| N17 a club with no Board would throw in 7.2.4 | LOW | TAKEN | 7.2.4: no `board` in `rooms` → `board_latest: null` and one log line (`loadRoom` at `rooms.ts:130`). |
| N18 the full-page drop rule removed an in-flight `temp_` row | LOW | TAKEN | 9.3 and 11.5: a `temp_` id is never dropped by `mergeFullPage`. |
| N19 6.1's gate order differs from wave-1 6.3 without saying so | LOW | TAKEN | 6.1 after step 4: deliberate; the sender's own delete stays unlimited, a stranger's call costs one cookie read and one `ensureMember` before the gates. |
| N20 `load_failed` and `unauthorized` are outside 1.3's table | LOW | TAKEN | 7.2: both keep the channels route's bodies (`channels/route.ts:45-49`, `:58-64`, `:79-85` checked; `load_failed` here reads `Couldn't load this club.`), outside `RefusalCode` on purpose. |
| N21 who checks the Preview build from the cloud | LOW | TAKEN | 13.3: through the Vercel connector when the session has one (this one does; the branch's deployment state only), else Franky before Mac step 1. |
| N22 `parseQuerySync` is not a `libpg-query` 18 export | LOW | TAKEN | 13.3: `parseSync` / `parsePlPgSQLSync` (checked on the scratchpad install of 18.1.5: `parse, parsePlPgSQL, parsePlPgSQLSync, parseSync, scan, scanSync, fingerprint…`). |
| N23 `toPerson` passes `avatar_url` through unproxied | LOW | TAKEN | 5.2 (`message-read.ts:488` checked). |
| N24 `ViewerInRoom.can_reply` had no reader | LOW | TAKEN | 11.4: the reply field is drawn when `viewer.can_reply` (`types.ts:70`). |

The verifier's "Asked for by name" list (a name spelled two ways, a field no read provides, a `types.ts` change unsaid, a gate order against wave 1, SQL that cannot parse, a state with no copy, a file two batches own, a step the cloud cannot do, a missing-schema case with no answer, a flag-off change unlisted) is answered by the rows above; nothing on it stays open. The one `types.ts` change this draft made itself (`SpaceResponse.upcoming?`) is said in section 0 and in 7.2.6, 13.1 and 13.2.

## 17. Amendments after the build (S70, cloud)

Written after the integration review of `claude/relaxed-davinci-9d11h3` (the build `5c68da1..b3381af`; the ten repair commits `6db5cc1..ebf6c3a`; the reviews and the repair record `e58c99f`; this section is the commit after it). Inputs: `wave-2-build/integration-adjudicate.md` (the verdict table, §2 the sentences, §3 the after-launch lines), `integration-repair.md` (§1 the outcomes, §2 the TO AMEND list, §5 the Mac notes), `integration-flag-off.md`, `integration-producer-consumer.md`, `integration-old-renderers.md`, `integration-security.md`, `integration-gates.md`, and the batch notes each item cites. **Nothing above this line was edited.** Where a sentence in this section and a sentence above it differ, this section is the contract as built; the earlier text stays as the record of what was ordered. Every amendment is additive to a name, a shape or a rule (no contract STRING, SIZE, TOKEN value, CODE, column or SQL statement changed), except where a row below says "struck".

### 17.1 The ratified items (the sentence as built, and why)

| # | section | the sentence as built (the amended wording) | why (one line; the note that raised it) |
|---|---|---|---|
| 1 | **0, row 4** | after "(was 404/403 …; no screen shows it)" the row gains: "; a caller who is not a member of the dm / group, or whose `[id]` cannot be read at all (a non-uuid), reads 403 `{ ok: false, error: "Not a member" }` from `ensureMember` (was 404 `"Message not found"`)". | Step 3's `ensureMember` runs before the `not_allowed` refusal (`[messageId]/route.ts:102-104`); a sentence the route already answers, not a new row. B3-CONTRACT-4, B3 STOPPED 1, INT-FLAG-OFF-5, adjudicate A16. |
| 2 | **0, a footnote under the table** | "On the phone, `/messages`, and `/campus` with `?tab=chat` or `?channel=`, show a skeleton for one `GET /api/me/features` round trip before today's list or pane mounts (2.1, 2.2); each mount of `MessagesMobile` / `CampusMobile` asks the features route once (one `console.warn("[chat_v2] off: …")` per page load)." | Sanctioned by 2.1 / 2.2 (SCREENS-L12, SCREENS-M6) but absent from a section that says "no screen". INT-FLAG-OFF-3. |
| 3 | **0, row 10 (NEW — see 17.3)** | "`src/app/layout.tsx:96` loads Fraunces 800 and DM Sans 800 (11.0); every existing `fontWeight: 800` (213 sites outside the new screens: desktop `LeftNav`, `UserCard`, `OrgInviteSheet`, the legal pages, …) renders at a true 800 instead of today's fallback (Fraunces → 900, DM Sans → 700), flag or no flag, desktop and phone; the static `public/html` pages load their own fonts and are unchanged." **11.0's sentence "Desktop is unchanged (no desktop rule asks for 800)" is struck.** 16.1's SCREENS-M3 row reads "TAKEN, on a false premise: 213 desktop sites carry 800; recorded as section 0 row 10". 13.3 step 4's flag-OFF walk gains one glance at desktop `LeftNav` and the club invite sheet. Option (a) stays open for Franky (17.5). | The contract ordered the line on the premise that no desktop rule asks for 800; `grep -rn "fontWeight: 800"` finds 213. The code is as ordered; the surface list was wrong. INT-FLAG-OFF-1 (option b, the reviewer's default; the repair recorded it as Franky's call). |
| 4 | **0, row 11 (NEW — see 17.3)** | "`src/components/feedback/LoadFailed.tsx:129`: the Retry pill's ink is `#140806` (11.0's coral-button ink, 6.40:1 on `#FF5C35`; was `#FAF7F2`, 2.88:1) on every `LoadFailed` in the app, both tones — the pill keeps its coral, the word goes dark like every other coral button. Cosmetic; one line." `S1-contrast.md` carries the `Retry` row. | 11.0 asks ≥ 4.5:1 for every text under 18px on the new screens and every `LoadFailed` they mount inherits the pill; the file is shared, so the change is app-wide by construction. VIS-S1-3, S1-notes Part 4, adjudicate A11 → INT-ADJUDICATE-10 (the adjudicate's "≈ 9.6:1" was off; measured 6.40:1). INT-FLAG-OFF-7's deferral was rejected because the brief's condition ("the old screens' Retry reads right with it by reading") is met. |
| 5 | **1.2**, the person / group row | "the unread pill carries no number (`GET /api/me/threads` sends `unread: boolean`); the row's label says `unread`." | The producer has no count to give; the mockup's `2` has no source. S1 STOPPED 11, adjudicate A19. |
| 6 | **1.2**, the club row labels | "the row's time is the LAST clause, after `pinned`: `Salsa Club, unread Board post, Fall Formal is live now, you're going, 8:41 PM`." | `home-rules.ts:181-195` puts `rowTimeSpoken` last; 1.2's examples omitted it and then asked for it. S1 STOPPED 13, adjudicate A21. |
| 7 | **1.2**, the tray captions | "`officers` → `Add to <room name>` (`Add to Officers`), as a custom `room`; the same for the `<nav aria-label>`." | 1.2 gave four captions for five kinds; the only reading that adds no sentence. S3 STOPPED 2, adjudicate A31. |
| 8 | **1.4** `clubGradient(id)` | "one of the FOUR club gradients the mockup sources carry (`#C23A72→#962858`, `#1F7580→#155158`, `#337A5A→#245942`, `#8A6A22→#664C14`, all `145deg`); six is the count of person colours (`PERSON_COLORS`)." | `avatar.ts:19-24` holds what the mockups carry; nothing was invented. S1 STOPPED part 1, adjudicate A25. |
| 9 | **2.1** | "While the flag is unknown the pencil is drawn with `role="button" aria-disabled="true"` and no handler (the compose overlay belongs to a list that does not exist yet)." | 2.1's "the bare header and the pencil" named no target for it. S1 STOPPED 15, adjudicate A23. |
| 10 | **2.2 / 14.20** | "`CampusMobile` decides what MOUNTS from the URL alone (`urlChatWanted` = `?tab=chat` or `?channel=`): while the flag is `null` on a plain `/campus`, a tap or swipe to Chat keeps today's `ChatPane` mounted; the flag-on REDIRECT reads the tab as well as the URL, so a tap during `null` that resolves `true` lands on `/messages`." | `chatWanted` read the `tab` state, so a fast tap during `null` unmounted the pane for a skeleton and remounted it. INT-FLAG-OFF-4, fixed `ebf6c3a` (`CampusMobile.tsx:298-300`). |
| 11 | **2.3 / 11.10**, history | replaces "the ONE `popstate` handler": "`MessagesMobile` owns the `popstate` handler for its depth-1 layers (a space or a conversation): it closes on `depth < 1` and ignores `depth >= 1`. The event chat layer (depth 2) is pushed and popped by `ClubSpace` itself, which pushes depth 2 only when `history.state` does not already read `{ vibeChat: <room>, depth: 2 }` (an event-room deep link, where the shell wrote `replaceState` 1 + `pushState` 2 first). In a fresh tab with nothing behind the deep link's entry (`history.length <= 1`) the shell closes in place and `replaceState`s `/messages`." | `MessagesMobile.tsx:195-244`, `ClubSpace.tsx:249`; the state shape `{ vibeChat, depth }` is exact. S1 STOPPED 10, adjudicate A18. |
| 12 | **6.1 step 1b** | "… a non-uuid `[id]` skips the cookie read (PostgREST answers `22P02` for a non-uuid in an `eq` on a uuid column, which today's code turns into a 500) and lands on step 3's `ensureMember` → 403 `"Not a member"`." | `[messageId]/route.ts:72` `if (isUuid(channelId)) {…}`. B3 STOPPED 1, adjudicate A15, INT-FLAG-OFF-5. |
| 13 | **7**, the opening rule, a footnote | "The two preview windows (7.1.4), the event-activity read (7.1.7) and the space's my-rows read (7.2.3) soft-fail (`latest: null` / `unread: false`, logged): they decide a preview or a dot, never visibility (the pattern 7.1.4 copies, `me/threads/route.ts:682`)." | RLS and the block set decide visibility; a failed window must not 503 the home. B4-CONTRACT-1 / -2, adjudicate A40. |
| 14 | **7.1.4** | the select reads "`id, channel_id, content, created_at, user_id, kind, thread_root_id, users:users!messages_user_id_fkey(name)`"; both windows read "… `thread_root_id is null` **and `removed_at is null`**". | `channel_id` puts the rows back on their rooms (B4 STOPPED 1, A13); the viewer's OWN removed message (RLS shows it to its author) must never head their club row (B4-SECURITY-1 / B4-BEHAVIOUR-3, INT-SECURITY-3, INT-PRODUCER-CONSUMER-5, adjudicate A9 → INT-ADJUDICATE-9, fixed `e4505c7`, `inbox/route.ts:166, :213`). |
| 15 | **7.1.7**, the event-activity read | "… and `removed_at is null`". | The same row must not move `last_activity_at`. INT-ADJUDICATE-9 (`inbox/route.ts:252`). |
| 16 | **7.2.3**, the my-rows read | the select reads "`channel_id, last_read_at, created_at`". | Section 7's null-`last_read_at` rule needs `created_at` (`readSince`). B4 STOPPED 2, adjudicate A13. |
| 17 | **7.2.4** | "`board_latest` = the last message of the read that is not `hidden` and whose `removed` is null (`lastShown`, `reads.ts:228`); none → null." | The own-removed Board post was the strip's `Board · You · <removed text>`. INT-ADJUDICATE-9 (`e4505c7`; `reads.test.ts` / `reads-routes.test.ts` gained the case). |
| 18 | **9.4** | replaces "(the caller answers 503, as today)": "any other error → `null`: the page answers 200 with `reply_count: null` on every Board post (the wave-1 rule, `message-read.ts:388`: never a wrong number); `complete` does not cover the reply-count map." | `message-read.ts:676` `complete` = room / roles / blocks / cards only; all three B2 reviews agreed. B2 STOPPED, adjudicate A12. |
| 19 | **11.0**, tokens | "coral TEXT on a tinted live surface (the live week card's line 1, the live chip) uses the coral MARK token (`#B5381A` in Light: 5.07:1 on `#FFE9E0`; `#C8401E` would be 4.27:1). `Palette` also carries `scrim` (Night `rgba(8,7,7,0.5)` from MK:0.1; Light `rgba(20,20,22,0.35)`, S1's) and four chrome tokens read by the S2 / S3 chrome instead of literals — **as built** (`v2-tokens.ts:102-105, :135-138`): `fieldBorder` Night `rgba(255,255,255,0.10)` / Light `var(--hairline)`; `chipBorder` `rgba(255,255,255,0.12)` / `rgba(20,20,22,0.12)`; `dashedBorder` `rgba(255,255,255,0.22)` / `rgba(20,20,22,0.22)`; `raisedSurface` `rgba(22,21,21,0.86)` / `var(--paper)`. No colour changed; eleven sites read them." | S1 STOPPED 14 (A22); S2 R6 / S2-DESIGN-6 (A7 → INT-ADJUDICATE-7, `eb383c6`). The values are the literals the files carried, not the adjudicate's parenthetical `.08 / .18 / .06`, which were not what the files held (repair §1). |
| 20 | **11.0**, refusal toasts | "… through `toastSendFailure` / `chatRefusalLine`, except a card sheet's 422 `content_blocked`, which shows the server's own sentence (1.2: `That includes words that aren't allowed on Vibe`) and outlines the named field." | 1.2 (the exact strings) wins over 11.0's routing rule, which would have shown `failure-copy.ts:198`'s longer line. S3 STOPPED 3, adjudicate A32. |
| 21 | **11.1**, the club row's chip | "`<eventTimeShort> · <title>` (`Sat 2 PM · Build Night`; for a tomorrow event `7 PM · Fright Night`, since `eventTimeShort` drops the `Tomorrow` prefix); the row label's event clause is `<title> <spoken time>`." | `eventTimeShort` (1.4, pinned) never answers a bare weekday. S1 STOPPED 12, adjudicate A20. |
| 22 | **11.1**, the failure placement | "`inbox` failing alone → `LoadFailed` (`Couldn't load your clubs.`) at the TOP of the list under `All` (clubs interleave with threads there) while threads still list; `threads` failing alone mirrors it (`Couldn't load your messages.` at the top, clubs still listed); both failing → one box." | Under `All` "the list's club position" is the top. S1 STOPPED 17, adjudicate A24. |
| 23 | **11.3**, props | "`{ orgHandle: string; initialRoomId: string \| null; initialRoomKind: RoomKind \| null; initialPage?: ThreadMessagesResponse; onClose(): void }` — `initialPage` is the resolving read's body (2.3), handed to `useRoomPoll` when the hook's room is `initialRoomId` (`ClubSpace.tsx:189`); for `initialRoomKind === "event"` it goes to `EventChat`'s hook once (the first open only; every later `openEvent` reads afresh, `:426`). `MessagesMobile` keeps `r.data` on the club view for both resolving reads (`OpenView`'s club arm gains `initialPage?`) and passes it. One thread GET on arrival (2.3 / 9.3 / SCREENS-L10)." | The shell dropped `r.data` and the hook read the same page again. S2 R4 / STOPPED 6, S1 STOPPED 10, S2-BEHAVIOUR-9, INT-PRODUCER-CONSUMER-1, adjudicate A5 → INT-ADJUDICATE-5 (`09ae1db`). |
| 24 | **11.3**, states | "a later 403 `members_only` OR 404 `not_found` on the space read (a club I left; a club hidden or gone while open) closes the view with the code's toast (`Members only.` / `That's not there anymore.`), the event chat layer popped first." | A club hidden or gone while open cannot stay on screen. S2 STOPPED 12, S2-SECURITY-3c, adjudicate A29. |
| 25 | **11.4**, a card post | "a card when `kind !== "text"` is `CardBubble` with `layout="post"` (11.8): full width inside the post, no second avatar, no header line; its long-press picker's reaction goes through `club/reactions.ts` (one helper for the Lounge and the Board) and its Reply OPENS THE FOLD with the reply field focused (a Board reply is never a quote). A TEXT post and a reply have no press and no picker in v1 (17.2 L3)." | VIS-S2-2 / S2 R5 / R7, INT-PRODUCER-CONSUMER-4, adjudicate A3 → INT-ADJUDICATE-3 (`09e6cc4`); the text-post gap is S2 STOPPED 11 / INT-SECURITY-1 (after launch, before Oct 26). |
| 26 | **11.5**, the hook | "`useRoomPoll(roomId, { enabled, initialPage?, line? })` returns the ten members above plus `hasEarlier: boolean` (true while the last first / earlier page was full), `replace(id, message)` (the `temp_` row → the answer; drops the temp row when the answer's id already arrived by a poll), `remove(id)` (a removed row, or an optimistic row whose send failed), and `lostAccess: boolean` (true once a read AFTER the first answered 403 / 404; the ticks stop until `reload()`; `EventChat` closes on it with `You left the event chat.`). `line` is the first read's failure line (`Couldn't load this chat.` when absent; the Board passes `Couldn't load the Board.`)." | Five additive members, each with a flow in 11.4 / 11.5 / 11.6 that needs it (`use-room-poll.ts:64-106`). S2 STOPPED 1–3, 7, adjudicate A26, INT-PRODUCER-CONSUMER "Holds". |
| 27 | **11.6**, `EventChat` | "props gain `initialPage?: ThreadMessagesResponse` — a deep-linked event room's resolving read, handed to its own `useRoomPoll` once (`EventChat.tsx:48, :81`)." | The layer's hook is the one that reads the event room. INT-ADJUDICATE-5 / INT-PRODUCER-CONSUMER-1 (`09ae1db`). |
| 28 | **11.8**, `CardBubble` props | "… `onRemove?(): void; onReport?(): void; onToggleReaction?(emoji: string): void; onReply?(): void; layout?: "bubble" \| "post" }` — an emoji picked in the picker, or a chip tapped under the card, calls `onToggleReaction` (absent → a pick only closes the picker); the Reply row is drawn only when `onReply` is passed (never for a `temp_` row); the reaction chips are drawn under a card as under a text bubble. `layout: "post"` (the Board's `BoardPost`) draws no avatar column and no header line, the card `width: 100%`, radius 14, no tail; the press, the picker, the chips and the live region as in a bubble. `RoomThread` wires the two handlers exactly as for `MessageBubble` (today's reaction flow; Reply = the quote); `BoardView` → `BoardPost` wires the reaction through `club/reactions.ts` and Reply opens the fold." | A pinned control was dead (a pick did nothing, no Reply). S3 STOPPED 1 / REQUESTS 2, S3-BEHAVIOUR-3, INT-PRODUCER-CONSUMER-2, adjudicate A2 → INT-ADJUDICATE-2 (`09e6cc4`); the layout from A3. |
| 29 | **11.8** (the Event card's line) and **14.41** | "`You'll appear in the event chat.` on the card while `viewer_status === null && room_id === null && state !== "closed"`, and never on a closed event (its pills are hidden, so the line has nothing to sit under)." | `card-rules.ts:239-241`. S3 STOPPED 4, S3-CONTRACT-3, adjudicate A33. |
| 30 | **11.7 / 11.5**, the composer's "+" | "While the tray is open the '+' disc inverts to `t.activeChip` (bg / ink, and a border of the same bg) and keeps its 45° rotation; the transition covers background and colour (`RoomComposer.tsx:~297`)." | `W0_Tray:93` inverts the disc. VIS-S3-3 / S3 REQUESTS 4, adjudicate A6 → INT-ADJUDICATE-6 (`2497417`). |
| 31 | **11.7**, the sheets' room line | "`RoomComposer` takes `orgId?: string \| null` beside `orgHandle` and hands it to `ComposeSheets`; `ClubSpace` passes `org.id`, `EventChat` `club.id`; every sheet's `<club> · <room>` line draws the 14px club dot (`CardSheet` draws it only when `orgId` is set)." | The three mockups draw the dot; nothing on the path carried the id. VIS-S3-1 / S3 REQUESTS 1, 3, INT-PRODUCER-CONSUMER-3, adjudicate A4 → INT-ADJUDICATE-4 (`9584630`). |
| 32 | **11.2**, the week bloom | "The week `<section>` carries `overflowX: "clip"` (the y axis stays visible, so the halo's top and bottom are not cut): the 340px bloom, centred on the live card, never widens the layout viewport past 375 (mobile Chromium / Safari grow it to `document.scrollWidth`, which put every fixed layer at 409 and the composer's '+' off the phone)." | `visual/README.md` run 2: 409 on 30 of 36 states, six click FAILs. VIS-X-1, S2 REQUEST R8, S3 REQUESTS 5, adjudicate A1 → INT-ADJUDICATE-1 (`6db5cc1`); `run2/clip/` is this exact rule. |
| 33 | **12.1**, `ConversationView` | the literal reads "`const shown = (messages ?? []).filter((m) => !m.hidden);`" (`messages` is `MessageRow[] \| null`). | B3 STOPPED 2, adjudicate A15. |
| 34 | **12.1**, the two static files | "`messages.html` — THREE lines (`:2474` carries `hidden`, `:1430` skips, `:1440` `const gc=gb&&lastSenderId!==null?' gt':'';`); `_miniMessenger.js` — THREE lines (`:665`, `:763`, `:771` `const gc = gb && lastSender !== null ? " gt" : "";`): the group-top margin reads the last-sender state, not the `forEach` index, so a stub first on the page leaves the first visible bubble's margin as today. `showAv` (`gb \|\| i === 0`) is right as it is (`gb` is true on the first visible row) and is not changed." 13.2's W2-B3 row reads "three lines" for each static file. | A stub first in the page gave the first visible bubble a 24px / 14px margin it never carries. B3-BEHAVIOUR-1, INT-FLAG-OFF-2, INT-OLD-RENDERERS-1 (its `showAv` half rejected), INT-PRODUCER-CONSUMER-7, adjudicate A8 → INT-ADJUDICATE-8 (`90fde7d`). Inside section 0 row 1's remit. |
| 35 | **13.3**, the eslint compare | the parenthetical after `campus-home.tsx` gains: "; and, since the split, `messages/ComposeOverlay.tsx:87` (`react-hooks/set-state-in-effect`) and `messages/GroupSettingsView.tsx:33` (`@typescript-eslint/no-unused-vars`), the two of `MessagesMobile.tsx`'s four legacy hits that moved — compared against `git show <base>:src/components/mobile/MessagesMobile.tsx`'s hits at `:3669` and `:2855`". | A later gate reading 13.3 literally would count them as new. INT-GATES-1. |
| 36 | **13.3**, sql-parse | "with its psql first line stripped" → "with `--strip-psql` (its `\set ON_ERROR_STOP on` line, `scripts/sql/chat-v2-cards-check.sql:57`; the file's first line is a comment)". | The tool's flag strips every backslash line. INT-GATES-2. |
| 37 | **13.3**, step 4 (the browser walk) | gains the lines of 17.5 step 4 (the repairs `run2/clip/` does not show; the one-GET arrival; the desktop `LeftNav` / club-invite glance for row 10). | The cloud could not walk them. Repair §5, INT-FLAG-OFF-1. |
| 38 | **13.2** | the rows of 17.4. | B4 repair, B3 repair, the visual pass, the integration repair. Adjudicate A14. |

**Recorded, no amendment (the code and the contract agree; written so nobody re-raises them):** S2 STOPPED 8 — the composer input at 16px is 11.0's own rule (A27) · S2 STOPPED 10 — `UpNext` line 1 at 11.5px/600, −0.15 tracking, so `Tonight · 9:30 PM · ● Maybe` fits the pinned 2-column 50px card (VIS-S2-1; the mockup's 12px is the one thing not adopted; A30) · S3 REQUESTS 3 — `visibleTakers` keeps 11.8's 3 + `+N` on a single-line sign-up row; the chips clip whole at the row's edge (A34) · S2-CONTRACT-5 / -6 — `officerEmpty`'s reading and `Open event chat` inside the layer being a no-op, both REJECTED by the S2 repair with evidence (A35) · S-repair MOVE-1 / MOVE-2 — comment-only (A36) · VIS-S1-5 — Requests rows stay `ThreadRow` (11.1 pins today's rows); VIS-S1-7 — the bloom token stays MK:0.1's columns (A37) · VIS-S2-7 — the empty reply arrow stays bare (A38) · S3-DESIGN-4 — a nested vaul root scales the club space under `CardSheet` and `RsvpSheet`, the app's own sheet behaviour (A39) · the visual repairs' unpinned sizes (the chips' 11px sides / 5px gaps, the 106px stepper, the 305px option pills, the 66px `HomeSkeleton` rows, the note counter inside its field, the empty club's `16px 4px 4px`) are inside 11.0–11.9 as written · the seven S2 / S3 REQUESTS to other batches (R4–R8, S3 REQUESTS 1–5) are all closed by rows 23, 25, 28, 30, 31, 32 above.

### 17.2 After launch (the lines that came out of the build; they join section 15's first list)

- **L1 — `You:` on a GROUP row of the new home.** `GET /api/me/threads` sends no viewer id and `members` omits people who left, so a group author outside `members` cannot be proven to be the viewer; v1 shows the text alone there (today's `ThreadRow` shows no prefix either). The shape to build, keeping the flag-off answer byte-identical: `viewer_id: user.id` on the `?scope=chats` answer ONLY (`threads/route.ts`, the `chatsOnly` branch, never the no-param answer the old list reads), then `home/home-rules.ts` `personPreview(t, viewerId)` → `You: <body>` when `lm.user_id === viewerId`. S1 STOPPED 18 / S1-BEHAVIOUR-2, INT-FLAG-OFF-6, INT-PRODUCER-CONSUMER-6, adjudicate A10.
- **L2 — the remove route's step 8 on a failed AUTHOR-role read.** Today a failed `org_members` read through `clubRole` ranks the author 0 (logged once; the caller's own read at step 6 fails closed), so on a transient failure a mod could remove an owner's message; not attacker-triggerable, no un-remove route. The smaller form to take (six lines, one file): read the author's role on the route's own service client, `authorErr` → 503 `try_again`, `isClubRole(authorRow?.role)` else null, then `outranks`; amend 6.1 step 8 ("a failed author-role read → 503 `try_again`, never rank 0"); add the case to `remove-route.test.ts`. B3-CONTRACT-3 / B3-SECURITY-2, INT-SECURITY-2, adjudicate A17.
- **L3 — Report / Remove on a TEXT Board post and on Board replies, BEFORE `CHAT_V2_ALLOWLIST=*` (Oct 26).** `club/BoardPost.tsx` has no press and no picker on its text branch or its reply rows (11.4 is silent; a card post has both through `CardBubble`); with the flag on the Board is reachable only through this screen, so a member cannot report an officer's text post and a mod cannot remove one — Apple's guideline 1.2 mechanism and the club's own moderation path. The fix needs an 11.4 amendment first: a shared `cards/use-long-press.ts` hook (from `CardBubble.tsx:106-175`), the same `ReactionPicker` (Report; Remove when `viewer.can_moderate && m.user_id !== viewerId && m.user_id !== ""`) on the text branch and on each reply row, `onReportReply(m)` / `onRemoveReply(m)` lifted through `BoardView`'s `confirmRemove` / `ReportSheet`, then `setRetryToken` so the fold re-reads and shows the `RemovedContentCard`; reactions on Board rows stay off in v1. The browser walk then gains "long-press a text Board post → Report; as avery → Remove; a reply → Report". Not needed for Apple's reviewer at the Oct 16 submission (flag off). S2 STOPPED 11 / S2-SECURITY-5, INT-SECURITY-1, adjudicate A28.
- **L4 — the space route's later 404 and the `?brief=1` poll switch** stay as 14.23 lists them; a later 404 closing the view (17.1 row 24) is v1's behaviour.
- **L5 — the old renderers' empty line reads the unfiltered array.** `ConversationView.tsx:794` (`Say hi`), `_miniMessenger.js` (`Say hi 👋`) and `ChannelChat`'s `No messages yet` read `messages.length`, so a club room holding only stubs shows an empty scroll area, not the line; nothing renders, nothing leaks (12.1 "filter … nothing else"). If wanted: `shown.length`. INT-OLD-RENDERERS "Holds".
- **L6 — the home bloom's stronger halo.** `W0_Home:22`'s `.56 → .20` is the mockup's own; 11.0 pins MK:0.1's `.36 → .13 → 0` / `.22 → .08 → 0`. A second `bloomHome` token is a one-line addition if Franky wants the glow. VIS-S1-7.
- **L7 — the officer exception, before any Apple review with the flag ON.** With `chat_v2` on, three visible tells remain for a blocked pair, each a contract decision (8, 14.1, 14.37, D1): an owner's / admin's top-level Board post still shows with name and avatar; `lounge.unread_count` counts blocked people's messages; `reply_count` / `total_voters` count them. If a second App Store review lands with the flag on, the first to strike or narrow is the exception (one line: `isHiddenFrom` without its third clause, `stub.ts:37-42`, and the inbox's officer read goes). INT-SECURITY "What Apple's reviewer sees".
- **L8 — the vaul-styles comment in `messages/theme.ts:7-10`** and the split's reworded header: a comment-only tidy for a later batch (S-repair MOVE-1 / MOVE-2, adjudicate A36).
- **L9 — `run3`**: `OUT_DIR=../run3 node shoot.mjs` from `wave-2-build/visual/tools/` re-shoots the branch after the repairs if a picture of rows 25, 28, 30, 31 of 17.1 is wanted (`run2/clip/` shows only the bloom clip as landed).

### 17.3 Section 0 restated — the flag-OFF surface as built (the freeze list of Oct 15)

**The list is no longer nine rows. Say it loudly: the flag-off review proved a TENTH change (row 10, the fonts line — ordered by this contract on a false premise, cosmetic, on every Next page for everyone), and the integration repair added an ELEVENTH (row 11, the Retry pill's ink — cosmetic, one line, every `LoadFailed` in the app).** Rows 1–9 are each proved by reading in `integration-flag-off.md` ("Holds" 1–14) and `integration-old-renderers.md`; the Mac's flag-OFF walk (13.3 step 4; 17.5) is the proof on real rows. Every "nine rows" above (0, 13.0, 13.4, 14.12, 16.1) now reads "the eleven rows of 17.3". Neither new row changes a route answer, a screen's structure, copy, or a database object; both are visible to a person without the flag, which is why they are rows and not footnotes.

| # | change everyone meets with the switch unset | where |
|---|---|---|
| 1 | In a **club room** a message by someone in a block pair with the viewer arrives as a stub; the four old renderers filter stubs out of the array (and the two static renderers' group-top margin reads the last-sender state, so a stub first on the page leaves the first visible bubble's margin as today — 12.1, three lines each); a quote of a blocked person's message shows no quote (`parent_preview` null); the OLD inbox's club-room preview skips blocked authors. One `blocks` read per club-room thread GET (a failed read answers 503 `try_again` where today's read succeeds) and per club-room send answer (there a failed read nulls the quote and never 503s, 9.1); a dm or a group never reads `blocks` and never stubs. | 8, 9.1, 12.1, 12.4 |
| 2 | `?after=` that is not a timestamp → 400 `{ ok: false, error: "Reload to catch up.", code: "invalid_after" }` (was `"Invalid after"`, no code) | 9.2 |
| 3 | `reply_count` comes from `chat_reply_counts` (the wave-1 walk when B is missing); same numbers; any other error → `reply_count: null` on a 200 page, as wave 1 (9.4 as amended, 17.1 row 18) | 3.5, 9.4 |
| 4 | `DELETE …/messages/[messageId]`: an owner/admin/mod may remove someone else's message in their club's rooms; a dm/group non-sender reads 403 `not_allowed` (was 404/403 "Only the sender can delete this message"; no screen shows it); **a caller who is not a member of the dm / group, or whose `[id]` is not a uuid, reads 403 `{ ok: false, error: "Not a member" }` from `ensureMember` (was 404 `"Message not found"`; a non-uuid `[id]` was a 500)**; after auth, a non-uuid `[messageId]` reads 404 `not_found` (was a 500 from the cast). The sender's own delete is today's path, unlimited. | 6.1 |
| 5 | `POST …/channels/[channelId]/members` answers 409 `room_locked` for a board / lounge / event room (API only; the desktop Access tab never shows for them) | 6.3 |
| 6 | `GET /api/me/calendar`: the RSVP select carries `org_id`; the route asks `chatV2For` (one `org_members` read when the switch is on); with the flag off the three fields are null | 7.3 |
| 7 | The report snapshot of a message carries `kind`, `thread_root_id`, `card` | 5.3 |
| 8 | Migration B's trigger `chat_votes_drop_access` fires on every `channel_members` DELETE (wrapped: never raises) | 3.5 |
| 9 | In a club room that holds a card (posted by a flag-on member from Oct 5), every reader's thread GET carries the hydrated `card` (the old screens show `content`, 12.2) and answers 503 `try_again` when the card tables cannot be read (a path that does not exist today) | 5.2, 9.1 |
| **10** | **NEW, cosmetic, contract-ordered (INT-FLAG-OFF-1, option b).** `src/app/layout.tsx:96` loads Fraunces 800 and DM Sans 800 (11.0); every existing `fontWeight: 800` — 213 sites outside the new screens: desktop `LeftNav`, `UserCard`, `OrgInviteSheet`, the legal pages, `OttoSidePanel`, `PostAudienceList`, … — renders at a true 800 instead of today's fallback (Fraunces → 900, DM Sans → 700), on every Next page, desktop and phone, from the merge; the static `public/html` pages load their own `<link>` and are unchanged. **Franky's call, open until the merge:** (b) keep it — this row (the default; the visual pass's shots are true); or (a) restore line 96 to `5c68da1`'s string (`…0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap`) and take 14.40's alternative (the new screens' 800 falls back as today) — one line, the visual pass then wrong for weight only, and this row is struck. | 11.0, 14.40, 16.1 SCREENS-M3 |
| **11** | **NEW, cosmetic, from the integration repair (INT-ADJUDICATE-10, `d3dc4f0`).** `src/components/feedback/LoadFailed.tsx:129`: the Retry pill's ink is `#140806` on `#FF5C35` (6.40:1; was `#FAF7F2`, 2.88:1) on every `LoadFailed` the app mounts — feed, campus, events, the old list, the new screens — both tones; the pill keeps its coral, the word goes dark like every other coral button. One line. | 11.0, `S1-contrast.md` |

Footnote (INT-FLAG-OFF-3): on the phone, `/messages`, and `/campus` with `?tab=chat` or `?channel=`, show a skeleton for one `GET /api/me/features` round trip before today's list or pane mounts (2.1, 2.2); a plain `/campus` keeps today's page and pane through that round trip even if Chat is tapped (17.1 row 10); each mount of `MessagesMobile` / `CampusMobile` asks the features route once. `room.event.going` leaving blocked people out, the gated routes' 404 before any read, and the rest of section 0's paragraph after its table stand as written.

### 17.4 Ownership rows amended (13.2)

| batch | the row gains |
|---|---|
| **W2-B2** | names explicitly `src/app/api/me/threads/[id]/cards/_lib/rpc-refusal.ts` (already inside its `cards/**` glob) and `src/lib/chat/cards/rpc-refusal.test.ts` |
| **W2-B3** | the two static files read "three lines" each (`:2474` / `:1430` / `:1440`; `:665` / `:763` / `:771`) |
| **W2-B4** | `src/lib/chat/reads.ts`, `src/lib/chat/reads.test.ts`, `src/lib/chat/reads-routes.test.ts` (B4's alone: `35554ab`, `580fff3`; the shared helpers of the two gated reads, imported by nothing else) |
| **W2-S2** | `messages/club/reactions.ts` (new in `09e6cc4`; inside `messages/club/*` already; a subdirectory, outside the split checker's walk) |
| **visual pass** (new row) | `handoffs/chat-redesign/wave-2-build/visual/**` (the harness, `README.md`, `review-S*.md`, `repair-S*.md`, the PNGs of run 1, `repair-S{1,2,3}/`, `run2/`, `run2/clip/`); it changed no `src/` file |
| **integration** | `handoffs/chat-redesign/wave-2-build/integration-*.md`, this section 17, the Mac handoff; the one shared line the integration repair owned: `src/components/feedback/LoadFailed.tsx:129` (row 11 of 17.3) and the `Retry` row of `S1-contrast.md` |

### 17.5 What the Mac must look at first (every DEFERRED-to-Mac or unverifiable-in-the-cloud item, in the order of 13.3)

**Before step 1 (the branch and the repo).**
1. **The branch carries ≈ 40 MB of screenshots** (`wave-2-build/visual/*.png`, `visual/repair-S{1,2,3}/`, `visual/run2/`, `visual/run2/clip/`, the woff2 fixtures — 284 binary files in the diff; `du -sh visual` = 46M). **Franky may squash the visual commits before the merge if he wants the repo light** — `5d0e424` (harness + run 1), `6592caa`, `6cef6bb`, `b3381af` (the three visual reviews), `d2225fd` (run 2) and the three `fix(chat): W2-S* visual repairs` (`6adce71`, `4bd44ea`, `4066fd1`) carry the PNGs. **`visual/run2/` (with `run2/clip/`) is the final state**; run 1's PNGs at `visual/*.png` are superseded. `run2/clip/` shows INT-ADJUDICATE-1 as landed (the harness clip is the same rule) and does NOT show the other visible repairs (the Board's full-width card post in 09 / 10, the club dot on the sheets in 15–19, the inverted "+" in 14, the dark Retry ink in 23): the browser walk covers them, or `run3` (17.2 L9).
2. **The fonts line (17.3 row 10) is Franky's call before the merge**: (b) keep and freeze it as row 10, or (a) the one-line revert with 14.40's alternative. Nothing else in the branch depends on it.
3. **The Vercel Preview URL and its build state** (13.3, N21): not read by any of the six integration reviews; the handoff reads it through the connector or Franky checks it before step 1. A Preview shows nothing behind the flag; rows 1–11 of 17.3 are live there on production data.

**Step 1 — migration B (13.3 Mac step 1).**
4. The two rehearsals, the constants paste, the real local apply, the three check scripts, the seed re-run, the constants commit — as 13.3 (the cloud parsed both SQL files, md5 `0154a6f1…` / `57b81753…`, and ran nothing against a database).
5. **The 42501 rows of 3.8's behaviour probe** (the four callable functions refusing `anon` / `authenticated` as their first statement, "as authenticated with a student's claims", `:1260`) are the proof of the role guard under a client JWT; the cloud read them, it could not run them (INT-SECURITY "Migration B").
6. Optional: the two-terminal vote race (3.9; `P0C26` on the second `commit`).

**Step 2 — the HTTP tables (13.3 Mac step 2), with the wave-2 rows the cloud's stub harness could only fake.**
7. The remove route's new row of 17.3 row 4: a non-member of a dm / group → 403 `Not a member`; a non-uuid `[id]` → 403 `Not a member` (not a 500); a non-uuid `[messageId]` after auth → 404 `not_found`; the sender's own delete unchanged and unlimited.
8. `GET /api/me/inbox` and `GET /api/orgs/[slug]/space` after the viewer's OWN message was removed by an officer (17.1 rows 14–17): the club row's `board.latest` / `lounge.latest`, `last_activity_at` and the space's `board_latest` skip it (the phone shows `Removed by a club officer. Only you can see this message.` on the row, the home must not preview it).
9. `reply_count` on a page whose `chat_reply_counts` call fails (17.1 row 18): a 200 with `reply_count: null`, never a 503 — provable only with a real database (drop the function's grant for one call, or rename it, then restore).
10. `GET /api/me/threads?scope=chats` vs the no-param answer: byte-identical shapes for the old list (row 1's preview skip on a club room, flag off), `unread: boolean` with no count (17.1 row 5).
11. Every saved answer through `validate-thread.mjs` (`card`, `hidden` stubs; blake blocks casey in the seed).

**Step 3 — the flag route (13.3 Mac step 3).**
12. `GET /api/me/features` with `CHAT_V2_ENABLED=true` locally; the four gated reads 404 with it off (`inbox`, `space`, `cards`, `vote` — after auth, before any other read).

**Step 4 — the browser walk at 375px, Light and Night, flag ON (13.3 Mac step 4), with these lines added by the build.**
13. **The layout viewport is 375 on a real phone with a live week card** (17.1 row 32): the home, then the club space, the event chat and a sheet open — the header's right disc, the second Up next card, the fifth chip, the composer's send and every sheet's right edge on screen, and **the composer's "+" tappable** (run 2 at HEAD before the fix: 409 on 30 of 36 states, six click FAILs). Safari as well as Chromium (`overflow-x: clip` is supported by both; if Safari shows 409, `overflow: hidden` is the fallback named in INT-ADJUDICATE-1).
14. **The card picker** (17.1 row 28): long-press a poll in the Lounge → pick an emoji → the chip appears under the card and toggles off on a second pick; Reply → the quote pill in the composer; Report → the sheet; as avery, Remove → the confirm. The same on a sign-up and an event card.
15. **The Board's card post** (17.1 row 25): full width inside the post, no second avatar, no `<Name> · Poll` header (the byline is the post's), radius 14; its long-press picker's reaction shows as a chip; its Reply opens the fold with the reply field focused (never a quote).
16. **The sheets' room line** (17.1 row 31): `New poll`, `New sign-up`, `Share an event` each show the 14px club dot before `<club> · <room>` — from the Lounge, the Board (as avery), the event chat, the Officers room (`Add to Officers`, 17.1 row 7).
17. **The "+" inverts while the tray is open** (17.1 row 30) and rotates back when it closes.
18. **One thread GET on arrival** (17.1 rows 23, 27): in the network tab, `/messages?channel=<lounge id>` makes ONE `GET …/messages?limit=50` for the room plus the space read; `/messages?channel=<event room id>` makes one thread GET for the event room, the space read, and the Lounge's own read underneath (three, no duplicate); a chip tap keys a fresh read; a second `Open event chat` from a card reads afresh (every later open is counted).
19. **History depths** (17.1 row 11): the hardware back peels one layer (the sheet, then the event chat, then the space, then the home); an event-room deep link in a FRESH tab (`history.length <= 1`) closes in place to `/messages` on back; the same link from inside the app pops to the space, then the home.
20. `LoadFailed`'s Retry pill on the new screens reads dark ink on coral (17.3 row 11) in both tones: the week, the clubs section, the club, the Board, the replies, the Share sheet's events, the event chat.
21. The 12.9 walk as written: a Lounge holding a poll, a sign-up, an event card and a stubbed message, opened in every old renderer (no crash, no empty bubble, a card as its fallback text).
22. The states the visual pass could not reach (`visual/README.md` "States that could not be reached"): the flag-pending header (2.1; delay `/api/me/features`), the Officers room and a custom room, the `Earlier messages` button (a first page of 50), the `content_blocked` outline on a sheet, a vote / a Take a spot / an RSVP round trip with `Posting…`, the toasts (a refused send, `You left the event chat.`), the old conversation view opened from the home (a dm / group tap), the compose overlay, the `?to=` deep link.
23. The three tells of the officer exception with the flag ON, once, with casey as an ADMIN of the club and blake blocking casey (17.2 L7; open point 14.1): casey's top-level Board post still shows to blake; `2 new` on a Lounge whose new rows are casey's; `1 reply` on a post whose reply is casey's. Seen with Franky's own eyes before Oct 26, so the decision is his.

**Step 4 — the flag-OFF walk (13.3 Mac step 4, second half; PRIVACY-L8; the App Store gate), as blake after blocking casey and as casey.**
24. The seven rows of `integration-security.md`'s "What Apple's reviewer sees" table, in that order: the old Messages list's club row (no message of the other's), the old thread (none), Campus › Chat on the phone (none), `messages.html` and the mini messenger and desktop Campus › Chat (none), a poll's fallback text by the other (a stub), the notifications list after an @mention by the other (nothing), the other's profile (`This account has restricted you` / `You blocked …`).
25. **The `gt` margin** (17.1 row 34): in `messages.html` and the mini messenger, a page whose OLDEST row is casey's (blocked) — the first visible bubble carries no extra 24px / 14px under the day separator; the sender runs and the day separators unchanged. Needs casey's message to be the oldest of the 50-row page (post it first in a fresh room, or scroll to a page boundary).
26. **The null-flag window on `/campus`** (17.1 row 10; INT-FLAG-OFF-4): open `/campus` with the network throttled, tap Chat before `/api/me/features` answers — today's `ChatPane` stays mounted (no skeleton flash, no clubs reload); `/campus?tab=chat` and `?channel=` show the skeleton for that round trip, then today's pane / drill-down (17.3 footnote).
27. **Row 10 — the true 800 weight** (INT-FLAG-OFF-1): one glance at desktop `LeftNav` and the club invite sheet (`OrgInviteSheet`'s Fraunces title) and one phone screen outside chat, before and after the branch, to see the heavier weight and decide (a) or (b) (item 2 above).
28. **Row 11 — the old Retry pill**: one `LoadFailed` on an old screen (the feed, campus, events — pull the network) in both tones: the coral pill with dark ink reads right.
29. The wave-1 walk list (S69 `:79`) unchanged.

**Before `CHAT_V2_ALLOWLIST=*` (Oct 26), not before the Mac.**
30. **17.2 L3** — Report / Remove on a text Board post and on replies: the amendment to 11.4, the code, then the browser line "long-press a text Board post → Report; as avery → Remove; a reply → Report". Until it lands, the Report path for those is a Vibe report from the old renderers (unreachable with the flag on) — so it lands first.
31. 17.2 L1 (`viewer_id` on `?scope=chats`) and L2 (the author-role 503) after the Oct 15 freeze, flag-gated / route-internal.

### 17.6 Gates at the final HEAD (13.3, cloud)

The last code change on the branch is `ebf6c3a`; `e58c99f` (the six reviews and the repair record) and this section's commit are docs only (`git diff --stat ebf6c3a..HEAD -- src public scripts supabase` is empty). Re-run by the amender at `e58c99f`: `npm run typecheck` exit 0, no output; `npm test` **1,639 / 1,639** (115 files; `# fail 0`). The repairer's gates at `ebf6c3a` therefore stand for the build and the rest (`integration-repair.md` §4): `npm run build` exit 0 (`✓ Compiled successfully in 17.1s`, no `error` / `warn` / `server-only` / `Suspense` line, the four new routes in the manifest as `ƒ`); eslint over the 104 changed `.ts/.tsx/.mjs` files 7 errors / 8 warnings, every one a legacy hit present at `5c68da1` (rule-by-rule compare: **0 new**; every repair file 0 hits); `split-check.mjs --base 507d6b4`: MISSING 0 · DUPLICATE 0 · CHANGED 5 = exactly `MessageRow`, `MessagesMobile`, `ConversationView`, `MessageBubble`, `ReactionPicker` · ADDED 20 (10.3's last paragraph holds at integration); `sql-parse.mjs` both files parse (unchanged md5s); `validate-thread.test.mjs` 18 / 18; `"use client"` on every new `.tsx` under `messages/`; no client file reaches a `server-only` module. The Mac's gates (rehearsals, the HTTP tables, the browser walk, the Preview URL) are 17.5.


### 17.7 S71 amendment (Mac, 2026-10-01): `chat_removals` in migration B; Event cards follow their event

Source: `wave-2-build/S71-amendment.md` (the order; Franky chose both audit findings F02 and F03 on Oct 1), `S71-sql-notes.md`, `S71-ts-notes.md`, `S71-repair-notes.md` (three reviews: SQL, security, regression; one repair). **Where 17.7 and any earlier section differ, 17.7 wins.** F01 (the `t/f` boolean fix of step 8 and the check script) landed just before, in `00e3f00`.

Orchestrator's own verification at the final head (not the agents' files): `npx tsc --noEmit` exit 0; `npm test` 1,700 / 1,700; a fresh rehearsal 1 of the committed file printed 31 constants and stopped with `chat-cards: constants are empty`; a full run with those 31 pasted into a scratch copy, plus the check script, in one transaction ending in rollback: exit 0, `behaviour check passed`, `APPLY RECORD … tables 5, functions 5, trigger 1`, `chat-cards-check: all 181 cases passed`, 0 chat-cards WARNING lines; the local database identical before and after. The committed file keeps all 31 constants EMPTY.

#### Final numbers (read from the files at the end of the repair; re-check with wc/grep when pasting)
- migration B `supabase/migrations/20261001110000_chat_v2_cards.sql`: 1,765 lines (was 1,704 in the S70 handoff); check script `scripts/sql/chat-v2-cards-check.sql`: 938 lines.
- tables 5 (`chat_polls`, `chat_poll_options`, `chat_poll_votes`, `chat_event_cards`, `chat_removals`); named constraints 25 (polls 7, options 7, votes 4, event_cards 3, removals 4); explicit indexes 4 (`idx_chat_polls_channel`, `idx_chat_poll_votes_poll_user`, `idx_chat_poll_votes_user`, `idx_chat_removals_removed_by`); `pg_class` relations in PRE-FLIGHT f: 11 (4 indexes + 7 constraint-backed); REFERENCES held for the lock: seven (was five; `chat_removals` adds one to `messages` and one to `users`).
- constants: **31** = `want_select` + **25** `want_con_*` + 5 `want_fn_*` (was 27 = 1 + 21 + 5). Rehearsal 1 prints 31 NOTICE lines (the four new `want_con_chat_removals_{pkey,message_id_fkey,removed_by_fkey,removed_role_check}` are the 22nd-25th constraint rows, after `chat_event_cards_note_check`, before the five functions) and stops with `chat-cards: constants are empty`. The committed file still holds all 31 empty.
- APPLY RECORD: `tables 5, functions 5, trigger 1`.
- check script: `chat-cards-check: all 181 cases passed` (164 before S71; 179 after S71's G2 + H1-H14; 181 after this repair's H15 + H16).
- `npm test`: 1,700 tests (1,639 at the S70 close; 1,693 after the S71 TS batch).

#### What changed (as built and repaired)
**What it is.** Migration B holds a FIFTH service-role-only table, `chat_removals` (who removed a club-chat message and in which role: owner, admin or mod), so an author who reads their own removed row through the data API finds no remover on it (audit F02). An Event card's stored text follows its event (audit F03). Both were taken into B and wave 2 before B was applied anywhere.

**Section 6.1 step 10 is superseded.** The officer/mod remove route writes `removed_at`, `removed_reason = OFFICER_REMOVED_REASON` and `removed_by = null` on the message; `removed_by` is never the caller. When the mark touched exactly one row it upserts into `chat_removals` with the service client: `{ message_id, removed_by: <caller>, removed_role: <caller's club role>, removed_at: <the same instant string the mark wrote> }`, `onConflict: message_id`. `removed_at` is IN the payload on purpose (repair R1/R3): PostgREST's `ON CONFLICT DO UPDATE` sets only the columns it is sent, so without it a removal after a restore would overwrite the remover and the role but keep the first removal's time (reproduced in a rolled-back transaction; the column default `now()` applies to the first insert only). A failed or impossible upsert (a database without B: `PGRST205` / `42P01`, `isMissingChatSchema`) is logged `[messages.DELETE chat_removals] ...` with code + message and never changes the answer. No upsert when the mark touched 0 rows. Founders' removals (`src/lib/moderation/actions.ts`, `/api/admin/content/remove`) still write `removed_by` (accepted, moderation migration `20260923090000:185-195`); admin restore is unchanged and leaves any `chat_removals` row as history, which the next removal overwrites whole. The old sentence "the record is `removed_by` + `removed_at` on the row" (wave-1 contract 12.6, `wave-1-contracts.md:471`; `B3-notes.md:14`; `routes-map.md:284`; `database-map.md:453`) is superseded: `removed_by` stays null and the record is `chat_removals`. Nothing else in `src/`, `scripts/` or `supabase/` reads `messages.removed_by` for a chat message.

**Section 17.3 (flag-off surface), as amended and added.**
- **Row 4 (the remove route) AMENDED.** The officer/mod removal answers the same (statuses, codes, sentences, order of the gates). Behind the answer, `messages.removed_by` stays NULL and the remover and club role go to the service-only `chat_removals` (migration B). On a database WITHOUT B each removal logs one `console.error` `[messages.DELETE chat_removals] chat_removals is not in this database yet` (`PGRST205` or `42P01`, both in `isMissingChatSchema`'s set (`src/lib/chat/schema.ts`); the reviewer's probe saw `PGRST205` from the local PostgREST where the table is absent; the repair's own test covers both codes with a stub). Still API-only: no old screen has a button.
- **NEW row 12 (live for everyone from the merge, NOT behind `chat_v2`): `PATCH` and `DELETE /api/events/[id]`** (the existing Edit event and Cancel event buttons, desktop and phone). Files: `src/app/api/events/[id]/route.ts`, `src/lib/chat/cards/refresh-event-cards.ts`, `src/lib/chat/cards/fallback.ts`.
  (a) A PATCH that changes the title or the start instant (title by string, `starts_at` by `Date.parse`) does one extra service read of `messages` (`kind = event_card`, `card_event_id = the event`, `removed_at is null`, newest first, `limit 500`, index `idx_messages_card_event`: EXPLAIN on the local database, with seqscan off because the table is tiny, shows an Index Scan on it). If cards exist it also reads `chat_event_cards` (one read per 100 ids) and updates `messages.content`, all awaited before the answer. **The update is bounded (repair R2): at most 50 update statements (one per distinct text and per 100 ids, newest cards first), 10 at a time, none started after 5 seconds.** A cancel is one text for every card (at most 5 statements); an edit keeps each card's own note, so it is one statement per distinct note. Past the bound the remaining cards keep their old text, the helper logs `[chat/refresh-event-cards] over the bounds (...)` and the route logs `[events/:id PATCH cards]`. A description-only or place-only edit does nothing extra.
  (b) A DELETE of an event that has NOT ended does one extra service read after the recipients read and before the delete. If cards exist it rewrites each live card's content to `Event cancelled: <title>` after the confirmed delete (`gone.length === 1`) and before the notices. An ended event does nothing extra and its cards keep their history text.
  (c) Statuses, codes, sentences, headers and the notice flow are unchanged: the diff only adds code; failures are logged (`[chat/refresh-event-cards]`, `[events/:id PATCH cards]`, `[events/:id DELETE cards]`) and never change an answer (20 route tests in `src/lib/events/event-route.test.ts`, 28 helper tests, mutation runs).
  (d) Visible only where a card exists, which means row 9's rooms (a card posted by a flag-on member from Oct 5). There the old screens, the old inbox and the previews read the new text after an edit or cancel. A room with no card, which is every room before the first flag-on post, sees nothing: the read returns `[]`, no write is made, and a database without migration A swallows the `42703` silently (tested with a stub client that answers `42703`; the reviewer's probe against the local PostgREST, which has A, also got an empty result: not re-run by the repair, the local service key was not at hand).
- **Row 9 gains one clause:** after an event edit or cancel, flag-OFF readers see the new text in the old Lounge.
- **Row 8 is unchanged:** `chat_removals` has no policy and no client grant, and there is no new trigger or function, so nothing a client can reach was added.

**13.3 step 2 and 17.5 (HTTP rows to add).** After an officer removal: `messages.removed_by` is null, one `chat_removals` row exists (`removed_role` = the caller's club role, `removed_at` = the message's `removed_at`), and the author's data-API read of the removed row shows no remover (no `removed_by`, no join to the mod). After a second removal of the same message (admin restore in between): the `chat_removals` row shows the new remover, the new role and the NEW `removed_at`. A title or time `PATCH` of an event with a card rewrites the Event card's `messages.content` (new title, new day and time, the card's own note kept); an event cancel (not yet ended) rewrites it to `Event cancelled: <title>`.

**Documented limits (not built).** A raw data-API edit or delete of an event, the officer raw delete (audit M2) and cascade deletes do not refresh card text; editing only a card's `note` is not a feature; the rewrite has no room filter (a card in an already-closed room is refreshed too, harmless); a card posted in the milliseconds between a DELETE's card read and the delete keeps its old text; **past the bounds above (or past 500 cards) the oldest cards keep the stale day and time, and a member who posts many Event cards with distinct notes can make older legitimate cards keep the stale text on the OLD screens (the phone card shows live data). The root fix is a per-event or per-user cap on Event cards in `POST /api/me/threads/[id]/cards`, which is outside the S71 file lists: open point for the orchestrator.**

#### For the Mac session: the old docs are superseded, not edited
- Rehearsal and paste: **31** constants (`want_select`, the **25** `want_con_*`, the five `want_fn_*`), not 27 / 21; the file is **1,765 lines**, not 1,704; B adds **5** service-role tables, not 4; the check script ends `all 181 cases passed` (not "~130"); rehearsal 1 prints 31 NOTICE lines and stops with `chat-cards: constants are empty`; APPLY RECORD reads `tables 5, functions 5, trigger 1`; the lock text says seven `REFERENCES`.
- Superseded by 17.7 (do not follow the old text): `handoffs/2026-09-30-session-70-chat-wave-2-cloud.md` lines 10 ("the 27 constants"), 25 ("1,704 lines", "the 27 constants ... the 21 want_con_*") and 42 ("4 service-role tables", "~130 cases"); `wave-2-contracts.md` 3.0.6 (line 207: four tables, 21 constraints), 3.1 (257: 21 constraints; 259: all four tables), 3.5/3.10 locks (195: five REFERENCES), 3.7 (542, 543, 548: four tables, 21 constraints, 27 constants; note the cascade check `confdeltype = 'c'` of 543 holds for the OLD four tables only: `chat_removals_removed_by_fkey` is ON DELETE SET NULL, and the file pins that separately), 3.9 (563: APPLY RECORD "tables 4"), 6.1 step 10 (713: `removed_by = user.id`, "the record is removed_by + removed_at"); `wave-1-contracts.md:471`; `wave-2-build/B3-notes.md:14`; `wave-2-asis/routes-map.md:284`; `wave-2-asis/database-map.md:453`.

#### Open points from S71 (not built)
- **A per-event or per-user cap on Event cards** in `POST /api/me/threads/[id]/cards` (repair R2's root fix): without it, a member who posts more than 50 Event cards with distinct notes for one event can leave OLDER cards with stale text on the old screens after an edit (the phone card is live). Small; before Oct 26.
- **Pin two more things in 7.1** (SQL review, low): `chat_removals.removed_role` / `removed_at` NOT NULL and the presence of `idx_chat_removals_removed_by` are created by the file but not re-read by its POST-CHECK.
- `chat_removals` rows are written only by the officer/mod route; founders' removals keep `messages.removed_by` (accepted). A `chat_removals` row is valid only while the message's `removed_reason` is `OFFICER_REMOVED_REASON`.
