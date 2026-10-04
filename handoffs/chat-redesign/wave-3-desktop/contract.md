# Wave 3 contract: Messages on desktop, pinned messages, rooms inside a club

Written Sat Oct 3, 2026 by the planner, from the six maps in `maps/`, the approved pictures (`D3_Tuck.step0/1/2/4/5.png`) and the code in the worktree `chatdesk` (branch `chat-desktop`, same commit as main `e7869b9`). Builders code against this file. Where it names a line number, the number is today's. Short names: **the page** = `public/html/messages.html`; **the shell** = the new React desktop Messages; **pane mode** = the page shown thread-only inside the shell; `club/`, `home/`, `cards/`, `compose/` = folders under `src/components/mobile/messages/`; `dm/` = `src/components/desktop/messages/`.

Revised the same evening after two critics (27 findings). `critic.md`, beside this file, says for each batch what changed. Batch ids are now `W3-<wave>-<name>` in FIVE waves; section 8 opens with the table of old and new names. What the critics made the planner decide is 1.3; what needs Franky is 1.4.

## 0. What is being built, and what is not

1. On a window 900px wide or more, with the new switch `chat_desktop` on for the person, `/messages` shows a new React page inside today's app shell (left nav and My Calendar untouched).
2. "Your week" is a band across the top (76px; one 44px line while a chat is open). The month opens as a popover.
3. Home: a wide inbox list on the left, an empty stage on the right. Opening a chat tucks the list into a 232px column of names.
4. A club open: header, room chips for EVERY room the person may see, the thread, the composer, and a right panel (events, Announcements, members, Manage). An event chat is a selected chip with its own right panel.
5. A direct message or group chat open: today's thread from the page, shown thread-only in one iframe, driven by `postMessage`.
6. Pinned and Shared: anyone in a dm or group can pin a message; a right panel lists pins and shared media. Desktop and phone (phone only where `chat_v2` is on).
7. Rooms: the lock on every restricted room, the megaphone and the word "Announcements" for the Board, a "who can post" rule for extra rooms (new column), a line in place of the composer when you may read but not post, and a desktop Rooms dialog for officers.
8. Campus > Chat leaves the desktop for people with the switch; old links redirect to `/messages?channel=<id>`.
9. Two local-only migrations: `chat_message_pins` (table + trigger) and `channels.post_policy` (column + two restated functions). Production is applied later by the orchestrator after Franky says yes.
10. Everything is behind `chat_desktop` (laptop) or `chat_v2` (phone). With both off, every screen is today's.

NOT in this build: a React rebuild of the dm thread; retiring the page or the Campus rails for people without the switch; unread marks on the Officers room and private rooms; a phone screen to manage rooms; pinning a club from the new screens; jumping to a pinned message older than the 50 the thread holds; a link to one message (`?m=`); the owed old-screen fixes M2, M3, M4, M5, M8, I3; Otto's and the push's mention links. Section 11 has the full list.

## 1. Decisions

### 1.1 Franky's (not open)
- F1. The direction is D3 "Tuck" (Oct 3). Build now.
- F2. Pinned and Shared is in this build ("yes build pinned as well").
- F3. Rooms: exec-only chats, several chats inside a club where only some people can see or type, and a Board that reads as announcements, must all show on desktop.
- F4. Desktop ships behind its own switch; the phone never waits for it. Database changes only for pins and rooms. Local stack only until he says yes.

### 1.2 The planner's answers to the maps' open questions (one line each; the reason after the dash)

**Map 01, shell and switch**
- S1. Switch name `chat_desktop`: `CHAT_DESKTOP_ENABLED` (exactly `true`, only where `chatV2MayRunHere`) + `CHAT_DESKTOP_ALLOWLIST` (`*` or user ids, blank = nobody), no clubs list; answer = enabled AND (everyone OR listed) AND `chatV2For(user)` — the routes the page reads answer 404 without `chat_v2`.
- S2. The page learns it from a server prop (`desktopChat`) computed in `src/app/messages/page.tsx`; `enforceCampusAccess` now returns `{ userId }`; `GET /api/me/features` also gains `chat_desktop` — a client hook would put a skeleton in front of switch-off laptops.
- S3. Before the client is known (server render, hydration) and `desktopChat` is true: `CampusAppShell` + an empty stage in the page colour; then the phone tree or the shell. The shell is imported with `next/dynamic` `ssr: false` — a phone must never run the shell's mount effects, and switch-off devices must not download it.
- S4. One Back step: home -> chat is `pushState`; another name in the slim list and every room chip (event chips too) is `replaceState` at depth 1; the Messages control is `history.back()` when the home entry is underneath, else a replace in place; dialogs and the month popover take their own entry through `useLayerHistory`. Esc closes the top layer first, then the open chat (3.5 rule 9).
- S5. A twin hook (`dm/use-desktop-open.ts`) on the tested helpers; no phone file is edited for it — `MessagesMobile.tsx` was walked on a real phone days ago.
- S6. The dm pane is ONE iframe mounted once with a frozen `src`; chats switch by `postMessage` `open` (map 04 has the final word; a `key` remount reloads nine scripts per switch).
- S7. Panel state is not in the URL: the club panel is remembered per device in `localStorage` key `vibe_chat_panel` (`"1"` / `"0"`, shown by default when it fits); the Pinned and Shared panel is component state, closed on every open; a pin jump writes nothing to the address.
- S8. The Campus > Chat redirect is on the server in `src/app/campus/page.tsx` (section 7).
- S9. Yes, fix the lost query: `page.tsx` hands `enforceCampusAccess` the path with `to` / `channel` / `tab`. This is the ONE flag-off change of the build (it only changes where a sign-in or Terms redirect returns to); it is row 1 of the flag-off table in 2.5.
- S10. A window dragged across 900px swaps the tree like every other page; the address reopens the same chat; a draft is lost.
- S11. Yes: every RSVP made inside desktop Messages calls `emitCalendarChanged()`; the shell listens for `CALENDAR_CHANGED_EVENT` and re-reads the week.
- S12. No `?m=<id>` in this build; pins jump inside the open chat only.

**Map 02, home and week**
- H1. Same as S1 (the field is `chat_desktop`, not `chat_v2_desktop`).
- H2. Add `export` to `useHomeData`, `HomeSkeleton`, `FILTER_LABEL`, `LIST_LABEL` and add `export type HomeData = ReturnType<typeof useHomeData>` in `home/MessagesHome.tsx`; the shell calls the hook once. The file is not moved.
- H3. The slim dot follows the board: coral = unread dm / group or unread Board post; hollow ring = only new Lounge messages; no dot on the open row; a muted unread chat is listed only when pinned or open. Pure, tested (`slimRows`).
- H4. The month is SPLIT: `home/MonthBody.tsx` holds the calendar, `home/MonthSheet.tsx` wraps it for the phone, `dm/MonthPopover.tsx` for desktop — two copies of a calendar drift. The phone's month walk is repeated (section 10).
- H5. Search filters the loaded rows by name on the client (club, person, group, group members); no route.
- H6. Away from this week the band's title is `weekTitle(...)`, a small `This week` button follows the arrows, and opening a chat keeps the week.
- H7. Cards that do not fit: `bandFit` (pure, tested) shows what fits at a 168px minimum, then one `+N` chip that opens the month; the title, arrows and days never give way. The fixed part is MEASURED by the band, not assumed (another week's title and the `This week` pill are wider than this week's). No extra picture; walked at 1024 and 900px, on this week and on another. The group label is the phone's, by its helper: `` `Event rooms you RSVP'd to ${weekWord(offset, range)}` `` (`YourWeek.tsx:354`); a fixed "this week" is wrong on any other week.
- H8. Yes, desktop New makes group chats: one dialog, one person = dm, several = group with an optional name.
- H9. NO `other_unread` in this build. The Officers room and private rooms hold no membership row, so they could never light the club's row; lighting only public extra rooms would be half a rule. Written as a known limit (11) and as call 3 in 1.4, in plain words: officers get no sign anywhere that someone wrote in the exec room.
- H10. Same as S11.
- H11. "Pin chat" stays in the page's Chat info for a dm or group. The club header gets NO pin toggle (the first draft had one): it is not in the approved pictures, the phone has no such control, and the header row is already full (1.3 K8); a club pinned earlier stays pinned and keeps its place in both lists. In code and copy: "pin a chat" (`pinned_at`) vs "pin a message" (`chat_message_pins`).
- H12. Requests rows are not restyled (`ThreadRow`); the page reports accept / decline and the shell bumps `refreshKey`.
- H13. The phone rows are used as they are; hover and focus styles come from the wide list's wrapper `<style>`; revisit after the walk.
- H14. No cap on the slim list; the column scrolls; order is `mergeHomeRows`.
- H15. No Light board: build from tokens, walk Light next to Night, fix by eye.

**Map 03, inside a club**
- C1. Same as S1: both switches on.
- C2. Board posts for the panel: one optional field `board_recent` (max 3, newest first) on the space answer, sent only with `?panel=1`.
- C3. Faces: `GET /api/orgs/[slug]/members?visible=1` once per club open; the first five rows that have a handle, mapped to `Person` (`RosterRow`, 3.3); the count is `space.org.member_count`. `?visible=1` is new: it leaves out people in a block with the viewer, as the thread and the event's "going" already do (4.2, 1.3 K4).
- C4. "See all" opens a members dialog inside Messages (`dm/MembersDialog.tsx`) fed by the same `?visible=1` read — the club page lists nobody. This dialog is a new surface (the board's "See all" went to the club page); it is kept because the club page cannot answer "who is in this club".
- C5. Officers manage rooms in a new `dm/RoomsDialog.tsx` (owner and admin) on the existing routes; the old modals stay inside `campus-home.tsx`.
- C6. The post rule is one column `channels.post_policy` with THREE values: `everyone` (default, today), `officers` (owner and admin), `listed` (owner, admin and the room's allow list). Extra rooms only. "Certain people can type" is what Franky asked for, and `listed` costs one SQL arm and one dialog option. (Map 03's two-value `posting` is replaced by this.)
- C7. Screens learn it three ways: `SpaceRoom.locked` + `SpaceRoom.post_policy` (chips, dialog), `Room.post_policy` (server), and `viewer.post_line` on the thread read: the exact sentence, present only when the viewer may read but not post in such a room. A refused send there is the NEW code `room_posters_only` ("Only some people can post here.").
- C8. Yes, members vote in a room they cannot post in: `chat_cast_vote`'s "cannot post = closed" test applies to event rooms only.
- C9. Lock on every private room except event chats, both devices (new chat only). Megaphone on the Board chip on BOTH devices (decided, 1.3 K8: Franky's words were about people knowing the Board is for announcements, and clubs live on the phone today); the panel section is titled "Announcements"; the chip keeps the word "Board". The phone's chip row already scrolls sideways; whether four chips still sit in 375px without scrolling is a Walk item (DEFERRED), and if they do not, the fix is one surface check that makes the mark desktop-only.
- C10. Report and Remove on text Board posts and replies (owed L3) are in this build, as a visible "..." on phone and desktop.
- C11. "Manage club" is a link to `/campus?manage=<handle>` that opens the existing settings modal; shown to OWNER and ADMIN only (`BOARD_POSTER_ROLES.includes(space.viewer.role)`), never by `can_moderate`, which includes mods. The design says "for officers", and "officers" means owner and admin in every new sentence (4c.2); a mod reaches join requests from Campus as today (1.3 K3).
- C12. An event chat opens like any room: `/messages?channel=<eventRoomId>`, its chip drawn selected, the right panel becomes the event panel.
- C13. While the Board is the open room the panel shows events and members only.
- C14. Stored names stay slugs; `roomDisplayName` shows `exec-only` as `Exec only`; the dialog turns a typed name into a slug with `roomSlug`. The "+" tray's caption and the card dialogs' room line show the display name too, on both devices (4c.3).
- C15. No unread marks on the Officers room or private rooms in this build (accepted gap 14.36 stands). The pinned line `const dot = room.kind === "board" && unread;` in `RoomChips.tsx` does not change.
- C16. The panel's RSVP pill opens the desktop form of `RsvpSheet` (a centred dialog); on success the space is re-read, the open room reloaded, and `emitCalendarChanged()` called.

**Map 04, the dm thread**
- D1. The Pinned and Shared panel lives in the shell beside the frame; the page gets only the header button, Pin in the hover pill, `data-mid` and a jump handler.
- D2. The page keeps its own list fetch in pane mode, as `/api/me/threads?scope=chats`; its 30-second timer runs only while a chat is open.
- D3. Yes: in pane mode the page marks read again when a message arrives in the open chat, never while the tab is hidden.
- D4. The frame mounts hidden as soon as both list reads have SETTLED (an answer or a failure), or at once when the address names a chat; one frame for the page's life (5.4).
- D5. `/messages?to=<handle>` is resolved by the SHELL in React (find the dm in the list, else `POST /api/me/threads { handle }`), then the address becomes `?channel=<id>` and the shell sends `open`. The frame's `src` never carries `to` or `channel` (map 05 Q9 over map 04 Q5: one frozen URL is simpler than a URL built from props).
- D6. No jump to a pin older than the loaded 50: the page answers `jump-missed` and the panel shows "That message is further back in the chat." under the quote, and the quote opens to the pin's FULL text in place (`PinnedMessage.full_text`), so an old pin can always be read. The old page has no way to load older messages at all (its only thread read is `?limit=50`, `:2372`), so on a busy chat this is the common case. Call 1 in 1.4.
- D7. The old full-page Messages (switch off) gets no Pin.
- D8. Routes: `GET /api/me/threads/[id]/message-pins` (NOT `/pins`: `/pin` already pins a chat, one letter away) and `PUT` / `DELETE /api/me/threads/[id]/messages/[messageId]/pin`. Words: "Pin message", "Unpin message", "Pinned"; "Pin chat" stays.
- D9. The dm hover pill keeps today's look and gains one pin button; the picture's four-icon toolbar belongs to the React rebuild, which Franky put out of scope. Decided by that; not a call.
- D10. `_miniMessenger.js` is untouched except one line in its refusal table (C7).
- D11. Point 11 on old screens: they print `viewer.post_line` when the server sends it, and the new code is added to both static refusal tables. No lock, megaphone or room management there.
- D12. No `ready` within 8 seconds: one line "Couldn't open this chat." with Retry (reloads the frame once per click). A `ready` that arrives late clears the line by itself. No fall-back to the old layout.
- D13. `postMessage` both ways with origin, source and `data.source` checks; the cursor bridge stays as it is.
- D14. No pin inside a pending message request: the page hides Pin while `d.isRequest`; the server refuses with `pin_not_allowed`.

**Map 06, rooms, permissions, pins**
- R1. All three values of `post_policy` are built (C6).
- R2. The Board does not become a `post_policy` room: it keeps its own rule (officers post, members reply). A `post_policy` room has no replies.
- R3. A cap of 5 extra rooms per club, in the create route only (`EXTRA_ROOM_CAP`, code `room_limit`), plus `rateLimit("room-create:<user>", 10 per 600 s)`. Rooms over the cap that already exist are kept. Decided: 5 (a chip row with more rooms than that stops reading as a row; the rate limit closes a write path that had none). Said plainly: nobody asked for the cap or the limit, and both also bind old desktop's Campus > Chat (2.5 row 9); SAE has one extra room.
- R4. Same as C15.
- R5. Megaphone: the Board chip on both devices (C9), drawn by `RoomChips` from `room.kind === "board"`, so no prop is drilled.
- R6. Same as C14.
- R7. Anyone in the chat may pin and unpin, except: a pending request cannot pin, a blocked pair cannot pin (unpin stays allowed), a restricted account can do neither. Cap 20 per chat (decided: a pinned list longer than one panel stops being a list of what matters; the refusal says how to make room).
- R8. The pin routes are gated by `chat_v2` alone (`chatV2For`), because `chat_desktop` implies it. They import only `chatV2For` from `flag-server` (the test stub exports nothing else).
- R9. `chat_message_pins` is service-only (RLS on, no policy, no client grant): the `chat_removals` pattern.
- R10. "Shared" is a new route, `GET /api/me/threads/[id]/shared`; the thread GET does not change.
- R11. Same as D6.
- R12. No phone room-management screen. The phone (new chat) shows the lock and the who-can-post line.
- R13. A non-officer on the Officers room's list shows in the Rooms dialog under "Also in this room" with Remove.
- R14. Two migration files, each with its own rollback, built in different waves (pins in wave 1, post-policy in wave 2) so only one builder touches the local database at a time; pins take only short locks and can reach production first.

**Map 05, Campus, links, gates**
- L1. Same as S2 (server prop on both pages; `.env.example` says the features route is no longer the only way in).
- L2. Same as S1.
- L3. Club settings: `/campus?manage=<handle>` opens `OrgSettingsModal`. Room management is NOT routed through the old modals (C5); `&room=` and `&new_room=1` are not built.
- L4. Otto's "mentioned you in a chat" keeps opening bare `/messages` — owed (11); it needs a change to a flag-independent route.
- L5. The club-chat mention push is unchanged.
- L6. The profile page's chat bubble: no change to Expand in this build — it is the client half of owed fix M3 and belongs with it.
- L7. The owed old-screen fixes (M3, M4, M5) do NOT ride with this build: they change what switch-off people see, and the decided rule is "off = exactly today". They are a separate small batch for Franky to schedule before Oct 15 (11; call 2 in 1.4). M8 and I3 are accepted for switch-off laptops. M2 is its own migration and its own yes.
- L8. Exactly one batch owns `campus-home.tsx` for the whole build (W3-3-campus), edits capped at about 150 lines.
- L9. Same as D5.
- L10. Same as C7: the sentence comes from the server (`viewer.post_line`), so old screens show a true line.
- L11. Walk plan: section 10 (1440, 1280, 1024, 900 and 899px; Light and Night; blake, avery, casey and one switch-off account; `sae` and `chat_seed_club`; the seed re-run that day; then the phone at 375px with `chat_v2` on and off).

### 1.3 Decided after the two critics (where two findings, or a finding and a rule, pulled apart: the choice and why)
- K1. **Batch size against "4 to 5 batches per wave".** Finding 7 splits five batches; four waves could not hold them. Both rules are kept: FIVE waves, 22 batches (section 8). Wave 2 is the server alone, wave 3 the pieces, wave 4 the shell, wave 5 the club. A gain: the two migrations fall in different waves, which answers finding 6 without asking two builders to take turns on one database.
- K2. **The frame's history entries (finding 4 offers two fixes).** Chosen: in pane mode a shared post opens `/posts/<id>` in a new tab and the post viewer is never opened. The other fix (close the viewer through its own close) leaves an asynchronous `history.back()` racing the shell's own; zero entries from the frame cannot race. It also matches the Shared panel, which opens posts in a new tab.
- K3. **Manage club: finding 13 wants it in the hat line when the panel is hidden, finding 21 wants officers only.** Both: owner and admin only (the design's word; mods keep Campus for join requests), in the panel while the panel is on screen, in the hat line while it is not. Never both at once.
- K4. **The roster and blocked pairs (finding 26 against C3).** `?visible=1` on the roster read filters by the viewer's block set; the faces row and the Members dialog use it. The Rooms dialog's people picker does NOT (an officer deciding who may enter a room must see every member, as Campus settings shows them today).
- K5. **The card tray (finding 12 gives it to old W3-2C; finding 7 splits W3-2C).** `CardTray.tsx` goes to the half that turns sheets into dialogs (W3-3-forms); the thread half passes it one new pinned prop, `anchor`.
- K6. **The Rooms dialog's size (finding 7 gives a choice).** The people picker is its own file `dm/RoomPeople.tsx` with a pinned props type, built with `MembersDialog` by W3-5-people (both are a searched roster list); the dialog batch keeps the dialog, its rules and its test.
- K7. **What the live phone gets (finding 19).** ONE deploy. At that deploy `CHAT_DESKTOP_ENABLED` is unset in production, so the only thing anyone can see change is row 10 of 2.5 (founders and SAE on the phone). That list is walked on a real phone before step 5 of 4b.3 turns desktop on. A separate phone-only branch would double the merge work for the same walk.
- K8. **Things the first draft left as calls that are the planner's to decide** (finding 25): the megaphone goes on the phone's Board chip too (C9); the room cap is 5 (R3); the pin cap is 20 (R7); the club header has no pin toggle (H11); the dm hover pill keeps today's look (D9).
- K9. **Keyboard in a club thread (finding 14).** Each message row is ONE Tab stop; Enter opens its toolbar, Left / Right move inside it, Esc returns to the row. Three stops per message would be 150 in a full thread.
- K10. **Two "Unpin" rows on the phone (finding 15).** Where the new `Pinned messages` row shows, the chat-level row reads `Unpin from top`; everywhere else it stays `Unpin`.
- K11. **A column that is not there yet (finding 19).** The code remembers "no `post_policy` column" for 5 minutes per server instance instead of failing one select on every 4-second room read; the alternative (apply the file before the deploy) would tie the deploy to a database yes.
- K12. **`homeBelow` (finding 3).** True after either write made from the home, as on the phone; the first draft's "only when it pushed" left a dead Back.
- K13. **Two right panels on a dm (finding 23).** Chat info and Pinned and Shared close each other; one new message each way.
- K14. **The empty words.** Where the phone has a helper for a sentence the desktop calls the helper (6.5); where a phone sentence says "tap" or "hover" the other device gets its own line.

### 1.4 Calls for Franky (only these; each with a recommendation)
1. **Old pinned messages cannot be jumped to on a laptop.** The old thread only holds the newest 50 messages, and pins are mostly old messages. The panel still shows the whole pinned message. Recommendation: ship with this limit; the jump comes with the React thread (the server already pages with `before`).
2. **The owed old-screen fixes (M3, M4, M5).** They change what people WITHOUT the new chat see, so they are not in this build. Recommendation: one small separate batch before the Oct 15 freeze.
3. **The exec-only room has no unread mark.** Nothing lights up, on phone or laptop, when someone writes in the Officers room or a private room: no dot on its chip, nothing on the club's row. Officers only see it by opening the room. Recommendation: ship now, and right after launch add the smallest fix (a membership row for each person who may enter, one small database change), which lights the chip and the club row.
4. **The yes for the production database.** Two small files (pins, the who-can-post rule). Recommendation: yes to pins at any hour; yes to the room rule in a quiet hour; desktop is turned on only after both.
5. **Ten minutes on a real phone after the first deploy.** Founders and SAE get a short list of small phone changes with that deploy (2.5 row 10: room names as words, a lock, the megaphone, "..." on Board posts, the month rebuilt; pinning follows once its file is applied). Recommendation: walk them on your phone before desktop is switched on for anyone.

## 2. The switch

### 2.1 Names and meaning
| Thing | Value |
|---|---|
| Env (server-only, never `NEXT_PUBLIC_`) | `CHAT_DESKTOP_ENABLED` — on only when exactly `true` AND `chatV2MayRunHere(env)` (live site or `next dev`; a Vercel Preview and `next start` do nothing) |
| Env | `CHAT_DESKTOP_ALLOWLIST` — `*` as the WHOLE value = everyone; else a comma list of user ids (trimmed, lower-cased); blank or unset = nobody |
| Rule | desktop is on for a person = `CHAT_DESKTOP_ENABLED` on AND (everyone OR listed) AND `chat_v2` on for that person. `chat_desktop` never widens `chat_v2`. |
| Wire name | `chat_desktop` (a boolean on `GET /api/me/features` and the prop `desktopChat` on the two server pages) |

### 2.2 Code (W3-1-switch; the one line in `types.ts` is written by W3-1-types, who owns that file)
`src/lib/chat/flag.ts` gains four pure exports beside the existing five (same file rules: no imports, every function takes `env`, the switch is checked first):
```ts
export function chatDesktopEnabled(env: NodeJS.ProcessEnv = process.env): boolean;      // CHAT_DESKTOP_ENABLED === "true" && chatV2MayRunHere(env)
export function chatDesktopEveryone(env: NodeJS.ProcessEnv = process.env): boolean;     // enabled && (CHAT_DESKTOP_ALLOWLIST ?? "").trim() === "*"
export function chatDesktopListedUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean; // enabled && id in the list; "*" is not a name
export function chatDesktopAnswer(userId: string, chatV2On: boolean, env: NodeJS.ProcessEnv = process.env): boolean; // chatV2On && (everyone || listed)
```
New file `src/lib/chat/flag-desktop-server.ts` (`import "server-only"`), its only export:
```ts
export async function chatDesktopFor(userId: string): Promise<boolean>;
// if (!chatDesktopEveryone(env) && !chatDesktopListedUser(userId, env)) return false;   (no database read)
// return chatV2For(userId);                                                             (fails closed, never cached)
```
It lives in its OWN file: `reads-routes.test.ts:45-46` and `cards/routes.test.ts:73-74` replace `@/lib/chat/flag-server` with a stub that exports only `chatV2For`; nothing new may be exported from `flag-server.ts`, and no gated route imports `flag-desktop-server.ts`.

`src/lib/chat/types.ts`: `export type FeaturesResponse = { ok: true; chat_v2: boolean; chat_desktop: boolean };`
`src/app/api/me/features/route.ts`: `const v2 = await chatV2For(user.id); const body: FeaturesResponse = { ok: true, chat_v2: v2, chat_desktop: chatDesktopAnswer(user.id, v2) };` (one database read, as today). `useChatV2` is not edited.

`src/lib/auth/campus-access.ts`: `enforceCampusAccess(currentPath: string): Promise<{ userId: string }>` — `return { userId: user.id }` as the last line; nothing else changes. Its other callers ignore the return.

### 2.3 How the screens learn it
- `src/app/messages/page.tsx`: `searchParams` type gains `tab?: string | string[]`. Build `path` = `/messages` plus the `to`, `channel`, `tab` it was asked with (URLSearchParams, in that order, only the ones present); `const { userId } = await enforceCampusAccess(path)`; `const desktopChat = await chatDesktopFor(userId)`; pass `desktopChat` to `MessagesSwitch` beside the two props it has.
- `src/app/messages/MessagesSwitch.tsx`: props gain `desktopChat?: boolean` (default `false`).
  - `desktopChat === false`: the function returns exactly what lines 28-66 return today (same iframe `src`, class, four style lines). No new hook result is used, no request, no placeholder.
  - `desktopChat === true`: `const ready = useClientReady()`. Not ready (server render and hydration): `<CampusAppShell><div style={{ minHeight: "100vh", background: "var(--cream)" }} /></CampusAppShell>`. Ready and `isMobile`: today's phone branch, unchanged. Ready and not mobile: `<CampusAppShell><MessagesDesktop initialHandle={initialHandle} initialChannelId={initialChannelId} /></CampusAppShell>`.
  - `MessagesDesktop` is imported with `next/dynamic` (`{ ssr: false, loading: () => the same empty div }`; read `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` first). The `useClientReady` guard is the rule; `dynamic` only keeps the bundle off phones and switch-off laptops.
- New file `src/lib/use-client-ready.ts`: `export function useClientReady(): boolean` = `useSyncExternalStore(() => () => {}, () => true, () => false)`.
- `src/app/campus/page.tsx` and below: section 7.
- Static pages (`messages.html`, `_miniMessenger.js`) do not read the switch. The page is in pane mode only when its URL says `pane=1`, and only the shell builds that URL.
- `.env.example`: a block under line 188 for the two variables, with the same three warnings as `chat_v2`, and line 175 reworded: a screen learns `chat_v2` from `GET /api/me/features`; the desktop pages also receive `chat_desktop` as a server prop.

### 2.4 Tests (W3-1-switch, in `flag.test.ts`, the existing style)
The switch must be exactly `true`; off on a Preview (`VERCEL_ENV=preview`) and under `next start`; the star must be the whole value; blank list = nobody; ids trimmed and lower-cased; `chatDesktopAnswer(id, false, env)` is false for every env (the phone flag is required); `chatDesktopAnswer` true needs enabled AND (star OR listed) AND `chatV2On`; no reader touches a `NEXT_PUBLIC_` name (extend the existing guard at `:98`).

### 2.5 With the switch off: exactly today
| # | Surface | Switch off |
|---|---|---|
| 1 | `/messages` signed out or before Terms | CHANGED (the one flag-off change): the redirect's `next=` now keeps `?to=` / `?channel=` / `?tab=` |
| 2 | `/messages` on a laptop | today's full-page iframe, same `src`, no `pane` |
| 3 | `/messages` on a phone | decided by `chat_v2` alone, as today |
| 4 | `/campus` on a laptop | Chat tab, rails and the three modals as today; `?manage=` is ignored unless `desktopChat` |
| 5 | the page without `pane=1` | byte-for-byte today's behaviour: every new CSS rule is under `html.vibe-pane`, every new JS path under `IS_PANE`, except two inert lines (6) and one button that is in the markup with an inline `style="display:none"` and is only ever shown by a pane rule (`#cPinsBtn`, 5.1) |
| 6 | old screens' "cannot post" line | prints `viewer.post_line` when the server sends one; no server sends one until an officer with the new desktop makes a restricted room in that club |
| 7 | phone, `chat_v2` off | no Pin, no lock, no megaphone, no new line; `ConversationView`, `MessageBubble`, `ReactionPicker`, `ConversationActionSheet` gain only optional props that nobody passes; the chat-level row still reads `Unpin` |
| 8 | the pin and shared routes | 404 `not_found` |
| 9 | room create / edit routes | accept `post_policy` (default `everyone`); the cap of 5 and the create rate limit apply to everyone (old desktop too): decided in R3, SAE has one extra room |
| 10 | phone, `chat_v2` ON, desktop off (founders and SAE, live since Oct 2) | CHANGED with the deploy, with no switch of its own. At the deploy: (a) extra-room names read as words (`Exec only`, not `exec-only`) on the chip, the composer's placeholder, the "+" tray's caption and the card sheets' room line; (b) a lock on a private extra room's chip; (c) the megaphone on the Board chip; (d) "..." on text Board posts and on replies (Report; Remove for officers and mods: owed L3); (e) the month sheet rebuilt on a split file (must look and behave as on Oct 2). Later, each inert until its database file is applied: (f) `Pin message` / `Unpin message`, `Pinned messages` and `Unpin from top` (the pins file; before it the hook's 404 hides every pin control); (g) the who-can-post line in place of the composer (only after an officer on desktop restricts a room). 1.3 K7: one deploy, this row walked on a real phone before desktop is turned on (section 10 part G, 4b.3 step 2). |

The comment at `MessagesMobile.tsx:47` and wave-2 contract 2.1 ("desktop never asks the flag") are superseded by this section; the orchestrator notes it in the handoff, no code comment is edited in a phone file for it.

## 3. Component tree and state

### 3.1 New files (path, what it draws, who builds it)
| File | What | Batch |
|---|---|---|
| `src/components/mobile/messages/surface.ts` | `ChatSurface = "phone" \| "desktop"`, `ChatSurfaceContext` (default `"phone"`), `useChatSurface()` | W3-1-types |
| `src/lib/use-client-ready.ts` | `useClientReady()` (2.3) | W3-1-switch |
| `dm/contracts.ts` | every prop type of 3.3, and nothing else (types only) | W3-1-pure |
| `dm/desktop-rules.ts` (+ `.test.ts`) | pure rules of 3.4 | W3-1-pure |
| `dm/dm-bridge.ts` (+ `.test.ts`) | the bridge's names, guards and the frame URL (5.3) | W3-1-pure |
| `dm/DesktopDialog.tsx` | `DesktopDialog`, `DesktopPopover` (6.1) | W3-1-prep |
| `home/MonthBody.tsx` | the month's calendar, shared by sheet and popover (6.2) | W3-1-prep |
| `src/lib/chat/room-names.ts` (+ `.test.ts`) | `roomDisplayName`, `roomSlug` (4c.3) | W3-2-roomroutes |
| `src/lib/chat/room-routes.test.ts` | the room list's three-step read, create and edit with `post_policy`, the roster's `?visible=1` (4.2) | W3-2-roomroutes |
| `dm/MessagesDesktop.tsx` | the shell: one `useHomeData`, the layout, the open state, the panes | stub W3-1-switch, real W3-4-shell |
| `dm/use-desktop-open.ts` | the open state, the URL and history (3.5) | W3-4-shell |
| `dm/WeekBand.tsx`, `dm/MonthPopover.tsx` | the band (full and folded) and its month | W3-4-week |
| `dm/InboxWide.tsx`, `dm/SlimList.tsx`, `dm/NewChatDialog.tsx` | the wide list, the slim list, New (dm or group) | W3-4-lists |
| `club/HoverActions.tsx` | the hover toolbar for club messages (6.4) | W3-3-thread |
| `dm/LegacyThreadPane.tsx` | the one iframe and the bridge listener | W3-3-bridge |
| `src/lib/chat/use-message-pins.ts` | the pins hook, phone and desktop (4d.4) | W3-2-pinroutes |
| `dm/ClubPane.tsx`, `dm/EventPanel.tsx` | a club open: header, chips, thread, composer; the event's right panel | `ClubPane` placeholder W3-4-shell, real W3-5-club |
| `dm/ClubPanel.tsx` | the club's right panel | W3-5-panel |
| `dm/MembersDialog.tsx`, `dm/RoomPeople.tsx` | the roster dialog; the Rooms dialog's people list and picker (4c.5) | W3-5-people |
| `dm/RoomsDialog.tsx`, `dm/rooms-dialog-rules.ts` (+ test) | room management (4c.5) | W3-5-rooms |
| `dm/PinsPanel.tsx` | Pinned and Shared | placeholder W3-4-shell, real W3-5-pins |
| `src/components/mobile/messages/PinnedSheet.tsx` | the phone's Pinned list | W3-4-phonepins |

A placeholder is a component with the FINAL props type from `dm/contracts.ts` that returns `null`; the later batch replaces its body and nothing else imports differently.

### 3.2 Layout (all sizes in px; colours only from `palette(night)` and CSS variables)
```
CampusAppShell (unchanged: 200px LeftNav | content)
└ MessagesDesktop root: min-width 0; height 100vh; overflow hidden; display flex column; background t.page
  ├ <ChatSurfaceContext.Provider value="desktop">
  ├ WeekBand            76 tall at home, 44 tall (folded) while a chat is open; border-bottom t.hairline
  └ body row            flex 1; min-height 0; display flex; position relative
     home:  InboxWide (flex 0 1 520, min-width 360) | EmptyStage (flex 1): "Pick up where you left off." (SERIF 22) + "Choose a chat or a club from your list."
     open:  SlimList (flex 0 0 232) | pane (flex 1, min-width 0, position relative) | right panel (club 320, dm 288) when its mode is "side"
     always, inside the pane box: LegacyThreadPane (the iframe), shown only while open.kind === "dm"
```
- The pane shows `ClubPane` (`key={orgHandle}`) for a club, the frame for a dm or group, and a skeleton made of CSS variables only while `open.kind === "resolving"`.
- `contentWidth` = the body row's width, measured with one `ResizeObserver` in the shell.
- Right panels follow `panelMode` (3.4): `"side"` (a column; the pane narrows), `"overlay"` (absolute, right 0, over the pane, no scrim, closes on its own button), `"hidden"`.
- The Otto orb is already hidden on `/messages`. Nothing in `globals.css`, `campus-app-shell.tsx` or `LeftNav.tsx` is edited. Shell-wide CSS (hover styles, the slide keyframes) is a `<style>` string constant in the component that needs it.
- Board literals map to tokens as map 02 section 2.1 lists; `font-variation-settings 'SOFT'` is not used.

**The calm rules (Franky's; every batch that draws owns them, and each has an Agent line for them in section 8):**
- **Tokens only.** Every colour in a new or changed desktop component is `palette(night)` or a CSS variable; no hex, no `rgb()` literal. Known Night-only literals in REUSED phone pieces, to be looked at in Light on the walk and fixed by the batch that owns the file in this build: the "+" tray's `#1C1A1A` (`CardTray.tsx:91`, W3-3-forms: on the desktop surface the popover uses `t.surface`), `EventAbout`'s hero and pill inks (`EventAbout.tsx:45-49`: the file is not edited; record what Light shows), the page's pinned-row flash (W3-3-bridge: a CSS variable).
- **At most one glowing thing per screen.** Home: the live event's card in the band. A club or an event chat open: the folded band's live item is flat text with a plain coral dot (no glow, no pulse); in an event chat `EventAbout`'s live mark is the one glow; `ClubPanel`'s live card is flat, as the picture. A dm or group: none.
- **Nothing on screen twice.** MAY repeat: a plain coral dot (the Board chip, the newest post in the panel, a slim-list row). May NOT repeat: a card, a Board post, a count, a link. So: the Board strip is drawn only while the panel is not on screen; the member count and `Manage club` are in the hat line only while the panel is not on screen; an event's Where / When block is in the right panel OR at the top of the thread, never both.

### 3.3 Pinned prop types (`dm/contracts.ts`, word for word)
```ts
import type { ReactNode } from "react";
import type { HomeData } from "@/components/mobile/messages/home/MessagesHome";
import type { HomeFilter, WeekEntry } from "@/components/mobile/messages/home/home-rules";
import type { RoomKind, ThreadMessagesResponse } from "@/lib/chat/types";
import type { DmPageEvent } from "./dm-bridge";
import type { SlimRow } from "./desktop-rules";

export type MessagesDesktopProps = { initialHandle?: string; initialChannelId?: string };

export type WeekBandProps = { data: HomeData; folded: boolean; night: boolean; onOpenRoom: (entry: WeekEntry) => void };
export type MonthPopoverProps = { anchor: HTMLElement | null; initialDay: Date; now: Date; night: boolean; onClose: (picked: Date | null) => void; onOpenRoom: (entry: WeekEntry) => void };

export type InboxWideProps = {
  data: HomeData; filter: HomeFilter; night: boolean;
  onFilter: (filter: HomeFilter) => void;
  onOpenClub: (orgHandle: string, roomId: string, roomKind: RoomKind) => void;
  onOpenThread: (threadId: string) => void;
  onNew: () => void;
};
export type SlimListProps = { rows: SlimRow[]; night: boolean; onHome: () => void; onOpen: (row: SlimRow) => void };
export type NewChatDialogProps = { night: boolean; onClose: () => void; onCreated: (channelId: string) => void };

export type ClubPaneProps = {
  orgHandle: string;
  roomId: string;
  roomKind: RoomKind | null;                      // null until the space or the thread read names it
  initialPage: ThreadMessagesResponse | null;     // the resolving read of a deep link, reused as the room's first page
  night: boolean;
  contentWidth: number;
  onSwitchRoom: (roomId: string, roomKind: RoomKind | null) => void;  // the shell writes the address (replaceState)
  onLost: (message: string) => void;              // a later 403 / 404: the shell goes home and toasts the message
  onOrg: (org: { id: string; handle: string; name: string; logo_url: string | null }) => void; // names a club the inbox does not list
  onListsChanged: () => void;                     // the shell bumps refreshKey
  onRsvpChanged: () => void;                      // the shell calls emitCalendarChanged()
};
export type ClubPanelProps = {
  space: import("@/lib/chat/types").SpaceResponse;
  activeRoomKind: RoomKind | null;
  night: boolean; now: Date; mode: "side" | "overlay";
  faces: import("@/lib/chat/types").Person[] | null;   // null while the roster loads or after it failed
  onHide: () => void;
  onOpenRoom: (roomId: string, roomKind: RoomKind) => void;   // an event row -> its chat; a Board post -> the Board
  onRsvp: (eventId: string, current: "going" | "maybe" | null) => void;
  onSeeMembers: () => void;
  onManageRooms: (() => void) | null;             // null unless owner or admin; `Manage club` is drawn under the same condition
};
// GET /api/orgs/<handle>/members answers THIS, not Person (members/route.ts:12, :124): `user_id`, no limit, owner first.
export type RosterRow = { user_id: string; role: string; joined_at: string; name: string | null; handle: string | null; avatar_url: string | null; school_verified: boolean };
export type RosterResponse = { ok: true; members: RosterRow[] };
export type RoomPeopleProps = {
  orgHandle: string; roomId: string; night: boolean;
  title: string;                                  // "Also in this room" | "People who can see this room" | "People who can post"
  roster: RosterRow[] | null;                     // the Rooms dialog's ONE unfiltered roster read; null while it loads or after it failed
  skipRoles: readonly string[];                   // ["owner", "admin"]: officers are in every room already, never listed or offered
  onChanged: () => void;                          // after an add or a remove
};
export type EventPanelProps = { event: import("@/lib/chat/types").EventRef & { going: import("@/lib/chat/types").Person[] }; night: boolean; now: Date; mode: "side" | "overlay"; onHide: () => void; onRsvp: () => void };
export type MembersDialogProps = { orgHandle: string; clubName: string; night: boolean; onClose: () => void };
export type RoomsDialogProps = { orgHandle: string; clubName: string; night: boolean; onClose: () => void; onChanged: () => void };

export type LegacyThreadPaneHandle = { jump: (messageId: string) => void; pinsChanged: () => void; setPanel: (open: boolean) => void; focus: () => void };
export type LegacyThreadPaneProps = { threadId: string | null; night: boolean; onEvent: (event: DmPageEvent) => void };   // threadId null = hidden and told to close
export type PinsPanelProps = {
  threadId: string; title: string; night: boolean; mode: "side" | "overlay";
  refreshToken: number;            // bumped when the page says pins-changed
  missedId: string | null;         // the last message the page could not jump to
  onClose: () => void;
  onJump: (messageId: string) => void;
  onChanged: () => void;           // after an unpin made in the panel: the shell tells the page
};
export type DesktopDialogProps = { title: string; onClose: () => void; width?: number; busy?: boolean; ownsHistory?: boolean; children: ReactNode; footer?: ReactNode };   // ownsHistory default true; false when the caller already holds a useLayerHistory entry for it
export type DesktopPopoverProps = { anchor: HTMLElement | null; label: string; onClose: () => void; width?: number; align?: "start" | "end"; children: ReactNode };
```
`LegacyThreadPane` is `forwardRef<LegacyThreadPaneHandle, LegacyThreadPaneProps>`. Every other component is a plain named export with the same name as its file (`RoomPeople` in `dm/RoomPeople.tsx`).
Faces (W3-5-club): `faces` = the first five `RosterRow`s of the `?visible=1` read that have a `handle`, mapped `{ id: user_id, handle, name: name ?? handle, avatar_url }`. Nobody re-derives the roster shape: `ClubPane`, `MembersDialog`, `RoomsDialog` and `RoomPeople` all import `RosterRow`.

### 3.4 Pure rules (`dm/desktop-rules.ts`, tested; no React, no DOM)
```ts
export type KnownChat = { kind: "dm" } | { kind: "club"; orgHandle: string; roomKind: RoomKind };
export function knownChat(id: string, threads: ThreadEntry[] | null, requests: ThreadEntry[] | null, clubs: InboxClub[] | null): KnownChat | null;
// a thread or request with that id -> dm; a club whose board.room_id or lounge.room_id is the id -> club; else null (the shell does the resolving read)

export type OpenChat =
  | { kind: "club"; orgId: string | null; orgHandle: string; name: string; logoUrl: string | null; roomId: string }
  | { kind: "dm"; threadId: string; name: string; avatarUrl: string | null; group: boolean };
export type SlimRow = {
  key: string;                                   // "club:<org id>" or "thread:<id>"
  kind: "club" | "dm" | "group";
  name: string; avatarUrl: string | null; seed: string;   // seed feeds clubGradient / personColor
  open: boolean;
  dot: "coral" | "ring" | null;                  // always null on the open row
  label: string;                                 // aria-label: clubRowLabel / personRowLabel, or the name alone for a supplied row
  href: string;                                  // /messages?channel=<id>
  target: { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind } | { kind: "dm"; threadId: string };
};
export function slimRows(clubs: InboxClub[], threads: ThreadEntry[], requests: ThreadEntry[], open: OpenChat | null, now: Date): SlimRow[];
// order = mergeHomeRows(clubs, threads); keep a row when pinned, or unread and not muted, or it is the open chat;
// a club row targets the Board when only the Board is unread, else the Lounge (ClubRow's rule); the open club's row targets nothing new (it is open);
// when the open chat is in neither list (a request, an unlisted club, a new dm) one row built from `open` is put FIRST.

export function searchRows(rows: HomeRow[], query: string): HomeRow[];   // case-insensitive "includes" on club name, person name, group name, group members' names; "" returns rows
export function bandFit(bandWidth: number, fixedWidth: number, count: number): { cards: number; more: number };
// fixedWidth = the MEASURED width of the band's left block (title, arrows, the `This week` pill when it shows, seven days): the band
// reads it from the same ResizeObserver that gives bandWidth. About 560 on this week; 80 to 90 more on another week. No constant in the rule.
// A card needs 176 (168 + 8 gap); the +N chip needs 64.
// cards = min(count, floor((bandWidth - fixedWidth) / 176)), never below 0; if cards < count, re-fit with 64 less and more = count - cards; else more = 0.
export function panelMode(contentWidth: number, panelWidth: number, pref: "1" | "0" | null, openedHere: boolean): "side" | "overlay" | "hidden";
// fits = contentWidth >= 232 + 420 + panelWidth. fits: pref "0" -> hidden unless openedHere; else side.
// does not fit: overlay only when openedHere (a click in this visit), else hidden. A stored "1" never opens an overlay by itself.
export function chatEntry(id: string): { state: { vibeChat: string; depth: 1 }; url: string };   // url = "/messages?channel=" + encodeURIComponent(id)
```

### 3.5 The ONE state model (`dm/use-desktop-open.ts`, W3-4-shell)
```ts
export type DesktopOpen =
  | { kind: "home" }
  | { kind: "resolving"; id: string }
  | { kind: "club"; orgHandle: string; roomId: string; roomKind: RoomKind | null; initialPage: ThreadMessagesResponse | null }
  | { kind: "dm"; threadId: string };
export type DesktopOpenApi = {
  open: DesktopOpen;
  filter: HomeFilter;                                   // from ?tab= ; kept while a chat is open
  setFilter: (filter: HomeFilter) => void;
  openThread: (threadId: string) => void;
  openClub: (orgHandle: string, roomId: string, roomKind: RoomKind | null) => void;
  openById: (id: string) => void;                       // a week card, a panel link: known() first, else the resolving read
  switchRoom: (roomId: string, roomKind: RoomKind | null) => void;   // inside the open club
  goHome: () => void;
  fail: (message: string) => void;                      // home + replaceState("/messages") + an error toast
};
export function useDesktopOpen(args: { initialChannelId?: string; known: (id: string) => KnownChat | null }): DesktopOpenApi;
```
| What is on screen | Where it lives |
|---|---|
| which chat is open | the address `/messages?channel=<id>` + the entry state `{ vibeChat: <id>, depth: 1 }` (the phone's shape; `readMarks`, `channelOfEntry`) |
| the home filter | the address `/messages?tab=chats\|clubs\|requests` at home (`homeUrl`, `parseHomeFilter`); React state while a chat is open |
| the week on screen | `HomeData.weekOffset` (inside `useHomeData`); survives opening a chat; not in the URL |
| the search text, New dialog, month popover, Rooms / Members dialogs | component state; each dialog and the popover takes one history entry through `useLayerHistory` |
| club panel shown / hidden | `localStorage["vibe_chat_panel"]` (try/catch) + `openedHere` state; `panelMode` decides |
| Pinned and Shared open | shell state, reset to closed whenever `open` changes |

History rules (every write goes through the TOP window's patched `window.history`; never `router.push` / `router.replace` inside the page):
1. **Mount.** `if (adoptLayerEntry()) return;` (the `popstate` that follows opens what is there). Else `id = channelOfEntry(window.location.search, window.history.state)`; only if the address cannot be read fall back to `initialChannelId`. With an id: `known(id)` or the resolving read `GET /api/me/threads/<id>/messages?limit=50` (`room !== null` -> club with `room.org.handle`, `room.kind` and the body as `initialPage`; else dm; any failure -> `fail("Couldn't open this chat.")` using `asLoadFailure`'s message). Then `clearLayersThen(() => history.replaceState(chatEntry(id).state, "", chatEntry(id).url))`. `homeBelow` (a ref) = false.
2. **Home -> a chat.** `clearLayersInto((mode) => history[mode === "push" ? "pushState" : "replaceState"](state, "", url))`; `homeBelow` = true after EITHER mode, because the write was made from the home: `replace` means a layer's entry (the month popover when a plan row opens its room, the New dialog when `onCreated` opens the chat) sat ON the home's entry and has just become the chat's, so the home IS underneath. The phone treats both alike (`MessagesMobile.tsx:277-281` sets `noBackRef.current = false` after either write). "Only when it pushed" would leave `[home, home]` and a dead Back after the Messages control.
3. **A chat -> another chat, or a room chip (event chips too).** `clearLayersThen(() => history.replaceState(state, "", url))`. Depth is always 1.
4. **The Messages control (`goHome`).** `homeBelow` true: `clearLayersThen(() => history.back())`, with the phone's 600 ms fallback to rule 5's write if no `popstate` arrives. Else `clearLayersThen(() => history.replaceState(null, "", homeUrl(filter)))`. Never `back()` followed by a new entry.
5. **`popstate`.** `if (isLayerPop(e)) return;` if the path is not `/messages` return; `id = channelOfEntry(...)`; null -> home (`homeBelow` = false); an id other than the open one -> open it with no history write (reads any depth >= 1 as open).
6. **A filter at home.** `history.replaceState(null, "", homeUrl(filter))`.
7. **`?to=<handle>`** (only while the live address still carries it): the shell waits for the first `threads` answer, finds a dm whose `peer.handle` matches, else `POST /api/me/threads { handle }` -> `{ channel_id }`; bumps `refreshKey`; opens it with a `replaceState` (rule 3's write), so `?to=` leaves the address. A refusal toasts and stays home on `/messages`.
8. Deep link, refresh, Back and Forward all go through rules 1 and 5; server props are never read after mount.
9. **Esc.** One `keydown` listener on the top window, in the shell. In order: a layer is open (dialog, popover, month) -> its own handler closes it and the shell does nothing; the event's target is an `input`, `textarea` or `contenteditable` -> blur it and stop (the search field clears itself first, as today's rule); a chat is open -> `goHome()`. The shell hears no keys while focus is in the dm frame, so the page says `escape` (5.2 item 12) under the same order (its own panel or picker first, then a blur of `#msgIn`, then the message), and the shell answers `escape` with `goHome()`.
10. **The frame adds nothing to history.** In pane mode nothing inside the iframe calls `history.pushState` or `history.back()` (5.2 item 11: a shared post opens in a new tab). Without this, `goHome`'s `history.back()` would pop the frame's entry, fire no top `popstate`, and the 600 ms fallback would leave `[home, home]`. The joint history of the tab then holds only the shell's entries.

## 4. Data

### 4.1 Per pane: the reads, the timers, what marks read
| Pane | Reads (all exist unless marked NEW) | Timers | Marks read? |
|---|---|---|---|
| Shell (band, wide list, slim list) | ONE `useHomeData(refreshKey, onThreads)`: `GET /api/me/threads?scope=chats` -> `{ threads, requests }`; `GET /api/me/inbox` -> `{ clubs: InboxClub[] }`; `GET /api/me/calendar?from=&to=` -> `rsvp` entries (`rsvpEntries`) | lists every 30 s while visible and on `refreshKey`; a week at most every 5 min, on `refreshKey`, on `refreshWeek`. Never faster. | No |
| Shell, extra | listens for `CALENDAR_CHANGED_EVENT` -> `data.refreshWeek(data.range)`; `onThreads` is a `useCallback` with no changing deps (an inline arrow loops the reads) | | |
| ClubPane | `GET /api/orgs/<handle>/space?panel=1` -> `SpaceResponse` + `board_recent` (4.2); `GET /api/orgs/<handle>/members?visible=1` -> `RosterResponse` once per club open (the faces; `MembersDialog` makes the same read when it opens; the Rooms dialog reads WITHOUT `visible`) | space: on open, every 20 s while visible, on return to visible, after an RSVP, after the Board room is opened or left, after the Rooms dialog reports a change | No |
| ClubPane's open room | `useRoomPoll(roomId, { enabled: true, initialPage })` in a child keyed by `roomId` (one alive at a time): first `?limit=50`, then `?after=` every 4 s | the hook's own | YES: the hook marks the open room on mount, on arrivals, on leaving (`POST /api/me/threads/<id>/read`). The hook is not edited. |
| Club panel "Announcements" | `space.board_recent` only. It never mounts `useRoomPoll` on the Board and never calls `/read`. | with the space read | NO (design point 5) |
| Event panel | `poll.room.event` of the open event room | with the room | |
| Dm / group thread | the page, in pane mode: `GET /api/me/threads?scope=chats` (its own list, as data), `GET /api/me/threads/<id>/messages?limit=50` | thread every 2 s only while a chat is open and the tab is visible; its list every 30 s only while a chat is open | YES: on open, and again when a poll brings a new message from someone else while the tab is visible (pane mode only) |
| Pinned and Shared | NEW `GET /api/me/threads/<id>/message-pins`, NEW `GET /api/me/threads/<id>/shared?limit=30` | pins: on open, after my own pin / unpin, on `pins-changed`, every 20 s while the panel is open; shared: on open | No |
| New chat dialog | `GET /api/me/suggested-connections?limit=20`, `GET /api/users/search?q=&limit=20` (220 ms debounce), `POST /api/me/threads` (`{ handle }` for one person; `{ type: "group", name?, members }` for several: read `threads/route.ts:24-35, 220` for the exact body); `GET /api/me/connections?limit=50&offset=` (the read the old page uses, `messages.html:2256`; all pages, fetched once, the first time a SECOND person is picked: a group may only hold the creator's connections, `threads/route.ts:267-278`) | | |

`refreshKey` is bumped by the shell when: a chat is closed or switched; a dm or group is created; the page says `list-changed`, `read`, `activity` or `closed`; `ClubPane` calls `onListsChanged` (an event chat was left).
Unread on the home: the slim list never draws a dot on the open row (the list data is up to 30 s old).

### 4.2 Changes to existing routes (additive; W3-2-roomreads owns the space and thread reads, W3-2-roomroutes the room routes and the roster)
The column's absence is remembered, so production does not fail one select on every 4-second room read between the deploy and the apply (1.3 K11). Pinned, in `src/lib/chat/rooms.ts` (W3-2-roomreads; W3-2-roomroutes imports them):
```ts
export function postPolicyColumnMissing(now: number = Date.now()): boolean;      // true for 5 minutes after the last note
export function notePostPolicyColumnMissing(now: number = Date.now()): void;     // called when a select naming post_policy fails isMissingChatSchema
export function forgetPostPolicyColumnMissing(): void;                           // tests only: clears the module-level memory
```
Every read below that names `post_policy` first asks `postPolicyColumnMissing()` and goes straight to its fallback select when true. Step 5 of 4b.3 redeploys, so no instance carries the memory into the time desktop is on.
- **`GET /api/orgs/[slug]/space`** (still gated by `chat_v2`).
  - The rooms select becomes `"id, kind, name, event_id, position, is_private, post_policy"` (skipped when `postPolicyColumnMissing()`). If it fails with `isMissingChatSchema`, call `notePostPolicyColumnMissing()` and retry ONCE with `"id, kind, name, event_id, position, is_private"` and treat every room as `post_policy: "everyone"`; only if the retry also fails that way answer 404 as today. (Production runs this code before the column exists.)
  - Each `SpaceRoom` gains `locked: boolean` (= `is_private === true`; true for Officers, event chats and private extra rooms) and `post_policy: PostPolicy`. `orderSpaceRooms`' final `map` keeps both.
  - `can_post` = `spaceCanPost(kind, role, state, post_policy, listed)`. `listed` = the viewer holds an `org_channel_members` row on that room: ONE cookie read `org_channel_members.select("channel_id").eq("user_id", me).in("channel_id", roomIds)`, made only when some room's policy is `listed`.
  - With `?panel=1` the answer gains `board_recent: ChatMessage[]`: from the SAME Board page the route already reads (`{ limit: 6 }`, unchanged), the last three messages that are not hidden and not removed, newest first. Absent without `?panel=1` (as `upcoming` is absent without `?events=1`).
- **`GET /api/me/threads/[id]/messages`**: `viewer` gains the optional `post_line` (4c.3). Nothing else. `viewerInRoom(room, role, mayPost)` adds it. There are TWO exhaustive `Record<PostRefusalCode, number>` tables and both gain `room_posters_only: 403` (W3-1-types, or the wave-1 typecheck fails): `POST_REFUSAL_STATUS` in `src/app/api/me/threads/[id]/messages/route.ts:65` (the route file changes in nothing else) and the exported `POST_REFUSAL_STATUS` in `src/app/api/me/threads/[id]/cards/_lib/rpc-refusal.ts:39`. The second is the path a Poll, Sign-up or Event card takes in a restricted room: `rpcRefusal`'s `P0C21` arm calls `postRefusal(room, null, role)` and looks the status up there.
- **`GET /api/orgs/[slug]/channels`**: a THREE-step read (today it has two, `route.ts:98-117`; production has `kind` and not yet `post_policy`, so folding the new column into the kind-aware select would drop `kind` and the event filter for every old Campus > Chat rail until the apply):
  1. `${LIST_COLUMNS}, kind, post_policy` with the event filter `.or("kind.is.null,kind.neq.event")` (skipped when `postPolicyColumnMissing()`);
  2. on `isMissingChatSchema`: `notePostPolicyColumnMissing()`, then TODAY's `${LIST_COLUMNS}, kind` with the event filter; rows are answered without `post_policy`;
  3. only if that also fails as missing schema: today's bare `LIST_COLUMNS` read.
- **`POST /api/orgs/[slug]/channels`**: body gains `post_policy?` (`isPostPolicy`, else 400 "Invalid post_policy"; default `everyone`). `post_policy` goes into the insert row AND the returning select ONLY when the body sent a value other than `everyone`; otherwise the insert is today's, byte for byte. With a non-default value: an `isMissingChatSchema` failure answers 503 `refusalBody("try_again")` (never a silent `everyone` room, never the bare insert). New first gate `rateLimit("room-create:" + user.id, { limit: 10, windowSec: 600 })`. After the officer guard: count the club's `kind = 'room'` rows; `>= EXTRA_ROOM_CAP` -> 409 `refusalBody("room_limit")`; the count is SKIPPED when `hasRoomKinds` is false (`kind` cannot be read). The answer's `channel` carries `post_policy` (`"everyone"` when it was not selected).
- **`PATCH /api/orgs/[slug]/channels/[channelId]`**: body gains `post_policy?`; allowed only when the guarded room's `kind === "room"`, else 409 `room_locked`; invalid value 400; the update failing `isMissingChatSchema` with `post_policy` in the patch -> 503 `try_again`, not 500. A body without `post_policy` runs today's code unchanged.
- **`GET /api/orgs/[slug]/members`** gains `?visible=1` (1.3 K4): after the roster is built, `blockedIdsFor(supabase, user.id)` (`src/lib/chat/blocks.ts:21`, the read the thread uses); a `null` (its read failed) -> 503 `try_again`; else rows whose `user_id` is in the set are left out. Without the parameter the answer is today's, unfiltered (Campus settings and the Rooms dialog). The row shape is `RosterRow` (3.3) and does not change.
- `GET /api/me/threads` (the old list's `can_post`) is NOT edited: it keeps answering `true` for extra rooms; every screen corrects itself from the thread read's `viewer.can_post` on open (the page at `:2483`).

### 4.3 New routes (W3-2-pinroutes). All: 401 signed out; then `chatV2For(user.id)` false -> 404 `refusalBody("not_found")`; a non-uuid `[id]` or `[messageId]` -> 404 `not_found`; `ensureMember(supabase, id, user.id)` not ok -> its status; `isOrgChannel` -> 400 `pins_chats_only`; `chat_message_pins` missing (`isMissingChatSchema`) -> 404 `not_found`. Headers `Cache-Control: private, no-store` on the GETs.
```ts
// src/lib/chat/types.ts (W3-1-types)
export type PinnedMessage = {
  message_id: string;
  pinned_at: string;
  created_at: string;                 // the message's own time
  text: string;                       // pinQuote(content): one line, at most 140 characters; "" for a photo, video or post with no text
  full_text: string;                  // the whole content, trimmed; "" when there is none. The panel opens it in place when the page cannot jump (D6)
  author: Person | null;              // the message's author (not who pinned); null when the account is gone
  media_kind: "image" | "video" | null;
  has_post: boolean;
};
export type MessagePinsResponse = { ok: true; pins: PinnedMessage[]; cap: number };       // newest pin first
export type PinMessageResponse = { ok: true; pinned: boolean; already?: true };
export type SharedItem = {
  message_id: string;
  created_at: string;
  user_id: string;
  media_url: string | null;           // messageMediaProxyUrl(channelId, messageId), never the stored key
  media_kind: "image" | "video" | null;
  attachment: AttachmentRow | null;   // the shared post, exactly as the thread GET sends it for that message
};
export type SharedResponse = { ok: true; items: SharedItem[]; has_more: boolean };        // newest first
```
| Route | Gates after the common ones, in this order | Answer |
|---|---|---|
| `GET /api/me/threads/[id]/message-pins` | none (read-only, no rate limit) | Service read of the chat's pin rows joined to their messages and authors; drop rows whose message has `removed_at` set, and rows whose message `created_at <=` the viewer's `cleared_at`. `{ ok: true, pins, cap: PIN_CAP }` |
| `PUT /api/me/threads/[id]/messages/[messageId]/pin` (no body) | `rateLimit("message-pin:" + user.id, { limit: 30, windowSec: 600 })`; `requireNotRestricted`; `accepted_at === null` -> 403 `pin_not_allowed`; `dmSendBlocked(supabase, id, user.id)`: blocked -> 403 `pin_not_allowed`, its read failed -> 503 `try_again`; the message is read on the COOKIE client `.eq("id", messageId).eq("channel_id", id)` (none -> 404 `not_found`; `created_at <= cleared_at` -> 404 `not_found`); service count of the chat's pins `>= PIN_CAP` and this message not among them -> 409 `pin_limit` | service insert `(message_id, channel_id, pinned_by)`; a duplicate key (23505) -> `{ ok: true, pinned: true, already: true }`; else `{ ok: true, pinned: true }` |
| `DELETE` same path | the same rate limit key; `requireNotRestricted`; `accepted_at === null` -> 403 `pin_not_allowed` | service delete `.eq("message_id", messageId).eq("channel_id", id)`; zero rows is still `{ ok: true, pinned: false }` |
| `GET /api/me/threads/[id]/shared?before=<iso>&limit=<1..60, default 30>` | a `before` that is not a timestamp -> 400 `invalid_after` | COOKIE read of `messages` in the chat where `media_url is not null or attachment_id is not null` (`.or("media_url.not.is.null,attachment_id.not.is.null")`), `removed_at is null`, `created_at > cleared_at` when set, `created_at < before` when given, newest first, `limit + 1` rows (`has_more`), with `MESSAGE_SELECT`'s joins; a row whose post is gone or hidden AND has no media is skipped |

Both route files carry a comment naming the other "pin": `/api/me/threads/[id]/pin` pins a CHAT in my list; these pin a MESSAGE for everyone in the chat.
New refusal codes (W3-1-types adds each to `RefusalCode` and `REFUSAL_SENTENCES`, and extends the literal in `room-rules.test.ts:268-290`):
| Code | Status | Sentence |
|---|---|---|
| `pin_limit` | 409 | `This chat already has 20 pinned messages. Unpin one first.` |
| `pin_not_allowed` | 403 | `You can't pin messages in this chat.` |
| `pins_chats_only` | 400 | `Pinning only works in direct messages and group chats.` |
| `room_posters_only` | 403 | `Only some people can post here.` |
| `room_limit` | 409 | `This club already has 5 extra rooms. Delete one first.` |

## 4b. Database (two files; LOCAL stack only in this build)

Shared rules for both files (copy the shape of `supabase/migrations/20261001120000_chat_latest_per_room.sql`, "C", and of A = `20261001100000_chat_v2_rooms.sql`, B = `20261001110000_chat_v2_cards.sql`):
- Header as comments: WHY THIS EXISTS, WHAT IT DOES (numbered), DOES NOT, LIVE STATE, PRE-CHECK (read-only queries with the expected answers), APPLY ORDER, CHECK AFTER APPLYING, ROLLBACK (the exact statements, in one transaction, with the `schema_migrations` delete).
- Body: `begin;` `set local lock_timeout = '5s';` -> PRE-FLIGHT `do $$` (raises on "already applied", on a taken name, on a drifted function md5) -> the statements -> POST-CHECK by catalog -> POST-CHECK BY BEHAVIOUR in a nested block that builds its own rows and raises its own SQLSTATE so it rolls itself back (skips with a recorded reason when it finds no fixture) -> `notify pgrst, 'reload schema';` -> `commit;`.
- Never `REVOKE EXECUTE` on a public function from anon, authenticated or service_role on this Postgres image. A function that must refuse does it inside (`if current_setting('role', true) in ('anon','authenticated') then raise ... '42501'`). A trigger function needs no grant. A TABLE revoke is fine.
- The file names sort after the local stack's newest row (`20261003170000`, the waitlist files of branch `landing-night`).
- ONE builder on the local database at a time: W3-1-pinsdb is the only batch of wave 1 that runs SQL, W3-2-roomsdb the only one of wave 2, and no other batch runs a `scripts/sql/*-check.sql` or the seed while they work (their checks write `channels` and `messages` rows). A `lock_timeout` or a deadlock report during an apply or a rehearsal is therefore not expected; if one appears, it is not a defect in the file: find what else holds the lock, wait, run again.
- Apply locally, by the owning batch, once: `docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql`, then record the row as C's header shows (`insert into supabase_migrations.schema_migrations (version, name) values (...)`, through the same `docker exec`). Never `supabase db push`. Never any remote database: no builder holds or uses a production credential.
- App code must run WITHOUT both files (production, until the apply): every read of `post_policy` or `chat_message_pins` falls back on `isMissingChatSchema` as 4.2 and 4.3 say.

### 4b.1 `supabase/migrations/20261004100000_chat_message_pins.sql` (W3-1-pinsdb)
```sql
create table public.chat_message_pins (
  message_id uuid constraint chat_message_pins_pkey primary key
             constraint chat_message_pins_message_id_fkey references public.messages(id) on delete cascade,
  channel_id uuid not null
             constraint chat_message_pins_channel_id_fkey references public.channels(id) on delete cascade,
  pinned_by  uuid constraint chat_message_pins_pinned_by_fkey references public.users(id) on delete set null,
  pinned_at  timestamptz not null default now()
);
create index idx_chat_message_pins_channel   on public.chat_message_pins (channel_id, pinned_at desc);
create index idx_chat_message_pins_pinned_by on public.chat_message_pins (pinned_by);
alter table public.chat_message_pins enable row level security;            -- and NO policy
revoke all on table public.chat_message_pins from anon, authenticated, service_role;
grant select, insert, update, delete on table public.chat_message_pins to service_role;
comment on table public.chat_message_pins is
  'A message pinned for everyone in a dm or group chat. One row per message. Service role only: the three pin routes are the only readers and writers. NOT channel_members.pinned_at (my pinned chats) and NOT channels.pinned (a room pinned in the old rail).';

create function public.chat_pins_drop_removed() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  begin
    delete from public.chat_message_pins p where p.message_id = new.id;
  exception when others then
    raise warning 'chat-pins: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;
create trigger chat_pins_drop_removed
  after update of removed_at on public.messages
  for each row when (new.removed_at is not null and old.removed_at is null)
  execute function public.chat_pins_drop_removed();
```
- What each rule gives: the sender's own delete (a hard delete) drops the pin by the cascade; deleting the chat or the author's account too; a moderator's soft removal drops it by the trigger; a later restore does not bring it back; `pinned_by` set null lets the pin outlive the person who pinned.
- PRE-FLIGHT raises when: the table, either index, the function or the trigger already exists ("already applied" when all do); `public.messages.removed_at` is missing; the non-internal triggers on `public.messages` are not exactly `bump_org_activity_on_message` and `messages_check_media_ref` (read on the local stack Oct 3; if production differs the orchestrator updates the list before applying).
- POST-CHECK by catalog: four columns with those types; the primary key and three foreign keys with `confdeltype` `c`, `c`, `n`; `relrowsecurity` true and zero policies; no privilege for anon or authenticated (`has_table_privilege` false for select / insert / update / delete); the trigger exists, is AFTER UPDATE, row level, with the WHEN clause.
- POST-CHECK BY BEHAVIOUR (SQLSTATE `P0C49`): pick any message of a dm or group (skip with the reason when there is none); pin it; a second insert of the same `message_id` raises 23505; set `removed_at = now()` -> zero pin rows; clear `removed_at`, pin again, `delete` the message -> zero pin rows; raise `P0C49` so every row written here rolls back.
- Lock (corrected): the three foreign keys take SHARE ROW EXCLUSIVE on `messages`, `channels` AND `users`, and `CREATE TRIGGER` the same on `messages`, all held until `commit`, which includes the behaviour check (the push file says this of its own foreign keys, `20260924120000:160-165`). That lock blocks writes, not reads: every message send, every new chat and every profile save waits those milliseconds; nothing is rewritten and the new table is empty. "Any time of day" still holds for that reason, and the header's Lock note must say exactly this, not "none on channels".
- Local check script: `scripts/sql/chat-message-pins-check.sql`, ending `chat-message-pins-check: all N cases passed` (the catalog checks again, plus the grants seen from `set role anon` / `authenticated`: every statement on the table is refused). It refuses to run when `inet_server_addr()` is not local.
- ROLLBACK: `drop trigger chat_pins_drop_removed on public.messages; drop function public.chat_pins_drop_removed(); drop table public.chat_message_pins;` + the `schema_migrations` delete + `notify pgrst`.

### 4b.2 `supabase/migrations/20261004110000_chat_room_post_policy.sql` (W3-2-roomsdb)
```sql
alter table public.channels
  add column post_policy text not null default 'everyone',
  add constraint channels_post_policy_check
    check (post_policy in ('everyone', 'officers', 'listed')),
  add constraint channels_post_policy_rooms_only
    check (post_policy = 'everyone' or coalesce(kind = 'room', false));
comment on column public.channels.post_policy is
  'Who may post a new message in an extra room (kind = room): everyone who can see it (default, the rule before this column), officers (owner and admin), or listed (owner, admin and the people in org_channel_members). Every other kind is always everyone here; the Board, event chats and dms keep their own rules.';
```
`can_post_org_channel(cid uuid, uid uuid, root uuid)` is restated whole with `create or replace` (same signature, `language sql stable security definer set search_path to '' set timezone to 'UTC'`). The body is A's (`:1362-1394`) with exactly two arms added between `when c.kind = 'event' then ...` and `when c.kind in ('lounge', 'officers', 'room') then true`:
```sql
      when c.kind = 'room' and c.post_policy = 'officers' then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
      when c.kind = 'room' and c.post_policy = 'listed' then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
        or exists (select 1 from public.org_channel_members ocm
                    where ocm.channel_id = c.id and ocm.user_id = uid)
```
They sit after `when root is not null then false`, so such a room has no replies. Restate the comment (add "Rooms: by post_policy.") and the grant `to anon, authenticated, service_role`.

`chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)` is restated whole with `create or replace`: B's body (`:836` on) copied verbatim with ONE change, in the "closed" test:
```sql
-- before:  or (v_kind <> 'board' and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
-- after:   or (v_kind = 'event'  and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
```
Identical for every room that exists today (the function has already required `can_view_org_channel`, and Lounge, Officers and `everyone` rooms post when they can view); it lets a reader vote in a room where only some people post. Signature, lock order and SQLSTATEs (P0C22, P0C24, P0C25, P0C26) unchanged; grant restated.

- PRE-FLIGHT raises when: the column or either constraint exists ("already applied"); `md5(pg_get_functiondef('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure))` is not `8d8be860d3f7077b9d6f9238705bdca7`; the same for `chat_cast_vote(uuid,uuid,uuid,boolean)` is not `a8f2efe48f8c892b609a188deb132551` (read on the local stack Oct 3; the first equals A's recorded value); `can_view_org_channel` is not `747ee06d2e4c3e8a788129f7530ec0ae` (it is NOT touched; its md5 must be the same after); `public.org_channel_members` is missing.
- POST-CHECK by catalog: the column is `text not null default 'everyone'`; both constraints exist and are validated; `select count(*) from public.channels where post_policy <> 'everyone'` is 0; the two restated functions' md5s differ from the old ones and `can_view_org_channel`'s is unchanged; all three have EXECUTE for anon, authenticated and service_role. After the first local apply the builder reads the two NEW md5s and writes them into the header (LIVE STATE AFTER), as A did at `:72-75`.
- POST-CHECK BY BEHAVIOUR (SQLSTATE `P0C59`), on rows it creates itself in an existing club with an owner or admin and at least one plain member (skip with the reason when none): a public `room` with `everyone` -> member can post; set `officers` -> member cannot, admin can; set `listed` -> member cannot, after an `org_channel_members` row the member can, admin can; a non-member never can; `update channels set post_policy = 'officers' where kind = 'lounge'` raises the check violation; a reply (`root` set) in a `room` is false under every policy; a member's vote on a poll in the `officers` room passes the closed test (when no poll fixture can be built: skip, recorded). Raise `P0C59`.
- Lock: `ADD COLUMN` with a constant default does not rewrite the table but takes ACCESS EXCLUSIVE on `channels` until commit: every chat read waits for those milliseconds. Production = a quiet hour, like A.
- Local check script: `scripts/sql/chat-room-post-policy-check.sql` (the behaviour cases again through `set role authenticated` + `request.jwt.claims`, the way `chat-v2-rooms-check.sql` does). ALSO re-run `scripts/sql/chat-v2-rooms-check.sql` and `scripts/sql/chat-v2-cards-check.sql` locally after the apply: both must end "all N cases passed" unchanged.
- ROLLBACK: restore `can_post_org_channel` with A's exact text and `chat_cast_vote` with B's exact text (both md5s back to the PRE-FLIGHT values: check them), then `alter table public.channels drop constraint channels_post_policy_rooms_only, drop constraint channels_post_policy_check, drop column post_policy;` + the `schema_migrations` delete + `notify pgrst`. Code keeps working: every reader falls back.

### 4b.3 Production steps (the orchestrator, only after Franky says yes; nothing here is run by a builder)
1. Deploy the code first (it runs without both files; `CHAT_DESKTOP_ENABLED` is still unset, so what people can see change is exactly row 10 of 2.5).
2. Franky walks row 10 on a real phone (founders' accounts, SAE): items (a) to (e) now, (f) after the pins file. Nothing below waits for it except step 5.
3. Pins file: PRE-CHECK queries from its header on production; apply with the Management API curl recipe (`20260926100000_users_profile_layout.sql:76-78`), the file's text from `git show <branch>:<file>`; then the `schema_migrations` row in a SEPARATE request; then CHECK AFTER APPLYING. Any time of day.
4. Post-policy file: the same steps, in a quiet hour; compare the three md5s on production with the header's before applying; after it, run `scripts/sql/chat-v2-after-deploy.sql`.
5. Only then, and only after step 2's walk, put ids in `CHAT_DESKTOP_ALLOWLIST` and set `CHAT_DESKTOP_ENABLED=true` on Vercel Production (never Preview), and redeploy (env is read at build).

## 4c. Rooms inside a club

### 4c.1 What exists today and what was missing (the finding Franky asked for)
- EXISTS: extra rooms (`kind = 'room'`, created by owner or admin; only on old desktop's Campus > Chat). EXISTS: a room only some members see (`is_private` + the by-name list `org_channel_members`; owners and admins always see it). EXISTS: the exec-only room (Officers: owners and admins, plus anyone added by name). The new phone chat already shows all of them as chips and opens them.
- MISSING before this build: "read by many, typed in by a few" outside the Board (the database said: can see = can post); a lock on private extra rooms; a true line when you cannot post; any way to manage rooms outside old Campus > Chat; names a person would write.
- ADDED: `channels.post_policy` (4b.2), `SpaceRoom.locked` / `post_policy`, `viewer.post_line`, the code `room_posters_only`, `roomDisplayName` / `roomSlug`, the Rooms dialog, a cap of 5.

### 4c.2 Every room kind
| Room | Who sees it | Who posts a new message | Replies | Enforced by (database) | App copy of the rule | Chip |
|---|---|---|---|---|---|---|
| Lounge | every member | every member | no | `can_view_org_channel`, `can_post_org_channel` | `spaceCanPost` -> true | `Lounge` |
| Board | every member | owner, admin | any member, under a live post | `can_post_org_channel` (board arms) | `BOARD_POSTER_ROLES` | megaphone + `Board` + coral dot when unread |
| Officers | owner, admin, + people added by name | everyone who sees it | no | private-room arm of `can_view_org_channel` | true | lock + `Officers` |
| Event chat | owner, admin, + Going / Maybe | the same, until the event's end + 7 days | no | event arms | `state !== "closed"` | calendar + the event's title; drawn selected on desktop when open |
| Extra room, public, `everyone` | every member | every member | no | last arm | true | the display name |
| Extra room, public, `officers` | every member | owner, admin | no | NEW arm | role in `BOARD_POSTER_ROLES` | the display name |
| Extra room, public, `listed` | every member | owner, admin, + the room's list | no | NEW arm | officer or `listed` | the display name |
| Extra room, private, `everyone` | owner, admin, + the room's list | everyone who sees it | no | private-room arm | true | lock + the display name |
| Extra room, private, `officers` | owner, admin, + the room's list | owner, admin | no | NEW arm | officer | lock + the display name |
| Extra room, private, `listed` | the same people as `everyone` | the same as `everyone` | | | | the dialog never offers it (it equals `everyone` there) |

"The database is the wall": the insert policy on `messages`, both card functions and the vote function ask `can_post_org_channel`; screens only choose what to draw. "Officers" in every new sentence means owner and admin; `OFFICER_ROLES` (which includes mods) is never imported by chat code.

### 4c.3 Types and words (W3-1-types: types and rules; W3-2-roomreads and W3-2-roomroutes: server; W3-3-thread and W3-3-forms: screens)
```ts
// src/lib/chat/types.ts
export type PostPolicy = "everyone" | "officers" | "listed";
export type Room = { id: string; kind: RoomKind; name: string; org_id: string; event: ... | null; post_policy?: PostPolicy };  // OPTIONAL (absent = "everyone") so the typed `Room` literals in five test files keep compiling; loadRoom always sets it ("everyone" when the column is missing or holds anything else)
export type ViewerInRoom = { role: ...; can_post: boolean; can_reply: boolean; can_moderate: boolean; post_line?: string };
export type SpaceRoom = { id: string; kind: RoomKind; name: string; unread: boolean; can_post: boolean; event: EventRef | null; locked: boolean; post_policy: PostPolicy };
export type SpaceResponse = { ...; board_recent?: ChatMessage[] };
export type PostRefusalCode = "board_officers_only" | "board_post_missing" | "thread_root_not_allowed" | "room_closed" | "room_posters_only";

// src/lib/chat/room-rules.ts (W3-1-types)
export const EXTRA_ROOM_CAP = 5;
export const POST_POLICIES = ["everyone", "officers", "listed"] as const;
export function isPostPolicy(value: unknown): value is PostPolicy;
export function postRuleLine(policy: PostPolicy): string | null;
//   "officers" -> "Only officers post here."      "listed" -> "Only officers and people they picked post here."      "everyone" -> null
// postRefusal(room, rootId, role): one new row, checked before the final `return "room_closed"`:
//   no root, room.kind === "room", (room.post_policy ?? "everyone") !== "everyone"  ->  "room_posters_only"

// src/lib/chat/room-names.ts (W3-2-roomroutes; pure, tested; roomDisplayName(roomDisplayName(x)) === roomDisplayName(x))
export function roomDisplayName(slug: string): string;    // "-" and "_" -> one space, first letter upper-cased, the rest untouched: "exec-only" -> "Exec only", "Alumni" -> "Alumni", "" -> ""
export function roomSlug(input: string): string | null;   // trim, lower-case, runs of anything outside [a-z0-9_-] -> "-", trim "-" at both ends, cut to 31; null unless it matches ^[a-z0-9][a-z0-9_-]{1,30}$
```
- `loadRoom` (`rooms.ts:130`): select `"id, kind, name, org_id, event_id, post_policy"` (skipped when `postPolicyColumnMissing()`, 4.2); on `isMissingChatSchema` call `notePostPolicyColumnMissing()` and retry once with today's select and `post_policy: "everyone"`. A missing column must never become "the read failed" (that is a 503 on every club room in production).
- `viewerInRoom(room, role, mayPost)`: adds `post_line: postRuleLine(room.post_policy)` only when `!mayPost && room.kind === "room" && room.post_policy !== "everyone"`. Otherwise the key is absent (existing tests on the `viewer` object keep passing).
- `spaceCanPost(kind, role, state, policy: PostPolicy = "everyone", listed = false)`: Board and event as today; `kind === "room"`: `officers` -> officer; `listed` -> officer or `listed`; else true. The two defaults keep the three-argument tests green.
- `chipLabel` (`club/helpers.ts:78`): the default arm returns `roomDisplayName(room.name)`. `chipAriaLabel` takes `Pick<SpaceRoom, "kind" | "name" | "unread" | "event"> & { locked?: boolean }` and adds one arm: an extra room with `locked` -> `` `${chipLabel(room)}, only some members see this room` ``. `helpers.test.ts` is updated on purpose (`:98` now covers both `locked` values).
- The same name everywhere a room is named, fixed at the ONE place that hands the name on (W3-3-thread, `club/RoomComposer.tsx`): `const shownName = roomKind === "room" || roomKind === "officers" ? roomDisplayName(roomName) : roomName;` (never on an event's title), then `composerPlaceholder(roomKind, shownName)` (`:182`), `<CardTray roomName={shownName}>` (`:256`) and `<ComposeSheets roomName={shownName}>` (`:349`). So the placeholder, the tray's caption (`trayCaption`, `CardTray.tsx:42`: `Add to Exec only`, not `Add to exec-only`) and the three card sheets' room line (`sheetRoomLine(clubName, roomKind, roomName)`) all read as words, on both devices. `composerPlaceholder`, `trayCaption` and `sheetRoomLine` themselves are not edited (`helpers.test.ts:159-163` stay as they are); the phone's `ClubSpace.tsx:486` keeps passing the stored slug and is not edited. This is item (a) of 2.5 row 10.

### 4c.4 What the screens show
- **Chips** (`club/RoomChips.tsx`; both devices unless said): every room of `space.rooms`, in the server's order. Lock when `room.kind === "officers" || (room.locked && room.kind !== "event")`. The two pinned lines stay word for word: `const unread = room.unread && !active;` and `const dot = room.kind === "board" && unread;`. Both devices: the megaphone before the word `Board` (the path of `BoardStrip.tsx:54-58`, 12px, `aria-hidden`; the chip's spoken name stays `chipAriaLabel`'s). Desktop only (`useChatSurface() === "desktop"`): an event chip is `active` when it is the open room; the row wraps (`flexWrap: "wrap"`, `height: "auto"`, `minHeight: 45`, no horizontal scroll) so every room is reachable with a mouse; and the `<nav>` draws NO top border and NO side padding (`borderTop: "none"`, `padding: 0`; the phone's hairline and its 12px, `RoomChips.tsx:61-72`, would put a stray line inside the desktop header, where `ClubPane` places the chips).
- **The composer's place when you may read but not post** (`club/RoomComposer.tsx:174-179`, both devices): Board -> today's tile; else `viewer.post_line` present -> `<ClosedTile night={night} text={viewer.post_line} />` (the lock icon is its default); else `This chat is closed.` The refused-send list at `:226` gains `room_posters_only`; `compose/CardSheet.tsx:104-110` gains the same code.
- **The Board as announcements**: megaphone on the chip (both devices); on desktop the panel section titled `Announcements` with the megaphone; one line at the top of the Board room, above the posts (`club/BoardView.tsx`, desktop surface only): `Announcements from <club>'s officers. Everyone in the club sees them.` (`<club>` = `poll.room?.org.name`). The officer's composer line "Everyone in <club> sees this" and the member's tile stay.
- **Old screens** (the page `:2351-2353` and `:2483`, `campus-home.tsx:16736-16757`, `ConversationView.tsx:1108-1112`): when the thread read's `viewer.post_line` is a non-empty string, print it in place of `room_closed`'s sentence. `room_posters_only: 'Only some people can post here.'` is added to `__DM_CHAT_REFUSALS` (the page) and `CHAT_REFUSALS` (`_miniMessenger.js:133-139`).
- **An event chat when the right panel is not on screen** (desktop; under about 1172px the panel is hidden until clicked, so the 1100 and 1024 laptops): `ClubPane` passes `header={<EventAbout event night now onRsvp />}` to `RoomThread` with `anchor="top"`, exactly as the phone does (`EventChat.tsx:165-171`), so Where, When, Who's going and the RSVP button are never off screen. When the panel's mode is `"side"` or `"overlay"`: no `header`, `anchor="bottom"` (the block is in the panel; nothing twice).
- **Known limits, written so the walk does not report them**: no unread dot on Officers, private rooms or extra rooms' chips; a message there does not light the club on the home or the slim list; mark-read, mute and "pin chat" do nothing on Officers and private rooms (no membership row; wave-2 contract 14.36).

### 4c.5 Room management: `dm/RoomsDialog.tsx` (W3-5-rooms; desktop; owner and admin only)
Doors: a 30px round `+` button after the chips in the club header (`aria-label="Manage rooms"`), and `Manage rooms` in the club panel. Both only when `space.viewer.role` is `owner` or `admin`. A `DesktopDialog` titled `Rooms in <club>`, width 520.
| In the dialog | Route (all exist; `post_policy` is the only new field) |
|---|---|
| The list: every room from `GET /api/orgs/<handle>/channels` (event chats are not in it), each with its marks (lock, megaphone) and one line: who sees it, who posts | GET channels |
| Board, Lounge: shown, not editable: `Every club has this room. It can't be renamed or removed.` | |
| Officers: the people list only, titled `Also in this room` (officers are in automatically), each with Remove; `Add someone` | GET / POST / DELETE `.../channels/<id>/members` |
| `New room` (hidden at the cap, with the `room_limit` sentence in its place): Name (any words; the slug is shown under it: `Saved as exec-only`); What it's for (topic, 200); **Who can see it**: `Everyone in the club` / `Only officers and people you pick`; **Who can post**: `Everyone who can see it` / `Only officers` / `Officers and people you pick` (the third only when everyone can see it) | POST channels `{ name: roomSlug(...), topic, is_private, post_policy }` |
| An extra room: the same fields, the people list (titled `People who can see this room` when private, `People who can post` when public + `listed`; hidden otherwise), Delete (a confirm: `Delete <name>? Its messages are deleted too.`) | PATCH / DELETE channels/<id>; members routes |
| People are picked from the club roster, search by name (placeholder `Search members`), never by typing a handle. The dialog makes ONE roster read, `GET /api/orgs/<handle>/members` WITHOUT `visible` (an officer sees every member here, 1.3 K4), and hands the rows to `RoomPeople` (`dm/RoomPeople.tsx`, W3-5-people, `RoomPeopleProps` in 3.3), which draws each people list of this table, reads and writes the room's own list, and offers only roster rows not already on it and not in `skipRoles` | GET / POST `{ user_id }` / DELETE `.../channels/<id>/members` (the builder reads the route file for the row shape) |
Rules: flipping "Who can see it" to private asks first: `Make this room private? Members who are not officers or on the list lose it, and their unread marks and votes in it are cleared.`; under `listed` on a public room one line says `Everyone in the club can read. Only officers and the people below can post.`; a refusal shows its sentence (`room_locked`, `room_limit`, `content_blocked` with its field, 409 "Channel name already exists" -> `A room with that name already exists.`); after every successful write call `onChanged()` (ClubPane re-reads the space at once). Pure parts (`rooms-dialog-rules.ts`: the line under each room, which post options are offered, the form's validity) are tested.
WAITS (not built): a phone screen for any of this; reordering rooms; "some listed people read only" in a private room; unread for private rooms.

## 4d. Pinned and Shared

1. **Data**: `chat_message_pins` (4b.1). One row per message; a message is pinned or not, for everyone in the chat. "Shared" reads `messages` rows that already exist (`media_url`, `attachment_id`).
2. **Routes**: 4.3. Gate: `chat_v2` for the caller (`chat_desktop` implies it).
3. **Rules** (`src/lib/chat/pin-rules.ts`, W3-1-pinsdb, pure, tested): `export const PIN_CAP = 20;` `export function pinQuote(content: string | null): string` (whitespace runs -> one space, trim, at most 140 characters, a cut ends with `…`); `export function afterCleared(createdAt: string, clearedAt: string | null): boolean`; `export function pinnedIds(pins: { message_id: string }[] | null): ReadonlySet<string>`.
   - Who: anyone in the chat pins and unpins. Not while the caller's message request is pending. Not in a blocked pair or a group holding one for the caller (the send's own rule, `dmSendBlocked`); unpin stays allowed. A restricted account: neither.
   - Cap 20 per chat (two racing pins may leave 21: accepted).
   - A deleted message drops its pin (cascade); a removed one drops it (trigger) and the list filters `removed_at` anyway; "Clear chat history" hides older pins and shared items for that person only.
   - Dms and groups only; a club room answers `pins_chats_only`.
4. **The hook** (`src/lib/chat/use-message-pins.ts`, W3-2-pinroutes; used by the desktop panel and the phone):
```ts
export type MessagePins = {
  pins: PinnedMessage[] | null;          // null until the first answer
  available: boolean;                    // false after a 404: every pin control hides
  failure: LoadFailure | null;
  isPinned: (messageId: string) => boolean;
  pin: (messageId: string) => Promise<boolean>;     // optimistic; a refusal toasts its sentence and reverts
  unpin: (messageId: string) => Promise<boolean>;
  reload: () => void;
};
export function useMessagePins(threadId: string | null, options: { enabled: boolean; pollMs?: number }): MessagePins;   // reads when enabled; pollMs (20000 on the open panel) only while visible
```
5. **Desktop** (switch `chat_desktop`): the page's header gains a pin button (`#cPinsBtn`, `aria-label="Pinned and shared"`), hidden in a pending request and when pins are unavailable; it says `pins-toggle`; the shell opens `PinsPanel` (288 wide, `panelMode`). Pin / Unpin is one icon button in the page's hover pill, on every row including your own photos and shared posts (5.2). `PinsPanel`: `Pinned` (each pin a quote card: `text` or `Photo` / `Video` / `Shared post`, then `<author name> · <rowTime(created_at)>`; newest pin first; a click calls `onJump`; a small `Unpin` shows on hover and focus), the empty line `Nothing pinned yet. Hover a message and press the pin.`; then `Shared` (a two-column grid: photos as `<img>`, videos as `<video preload="metadata">` with a play mark, posts as a tile with the thumbnail, the author and the first line; a click on a photo or video opens the proxy URL in a new tab, on a post opens `/posts/<id>` in a new tab), the empty line `Photos, videos and posts sent here will show up in this spot.`, `Show more` while `has_more`. A jump the page could not make (`jump-missed`) shows under that quote: `That message is further back in the chat.` and the quote card opens in place to `full_text` (the whole message, wrapping, no cut), so the pin can be read where it is. A quote whose `text` was cut (`full_text.length > text.length`) also opens the same way from a small `Show all` under it, without a jump.
   - One right panel at a time on a dm (design point 6): when the page opens its Chat info it says `info-opened` and the shell closes Pinned and Shared; when the shell opens Pinned and Shared it sends `panel-state { open: true }` and the page closes Chat info (5.3).
   - By keyboard: the pin button is in the page's hover pill, which today shows on mouse hover only (`:1233`, the delegated `mouseover`). In pane mode each `.dm-bubble-wrap` gets `tabindex="0"` and the pill also shows while the wrap or anything in it has focus (`focusin` / `focusout` beside the mouse pair, pane mode only), so Tab reaches a message and then its pin button. In the panel every quote, `Unpin`, `Show all`, tile and `Show more` is a real `<button>` or `<a>`.
6. **Phone** (switch `chat_v2`, W3-4-phonepins): `ConversationView` gains `messagePins?: boolean`; ONLY `MessagesMobileV2` passes it (`MessagesMobile.tsx:552`), never `MessagesMobileV1` (`:925`) or `CampusMobile` (`:1089`). When true and the thread is a dm or group: `useMessagePins(threadId, { enabled: true })`; `MessageBubble` and `ReactionPicker` each gain `onPin?: () => void` and `pinLabel?: string` and draw one row (`Pin message` / `Unpin message`) between Reply and Report when `onPin` is passed (not on a `temp_` message, not in a pending request); `ConversationActionSheet` gains `onOpenPinned?: () => void` and draws the row `Pinned messages` under `Pin to top` when it is passed; it opens `PinnedSheet` (a sheet built on `sheets.tsx` / `sheet-styles.ts`), title `Pinned messages`: the same quote cards; a tap closes the sheet and scrolls to the message when it is among the loaded ones (each bubble wrapper gets `data-mid` only when `messagePins`), else the card opens to `full_text` with the same "further back" line; each row has `Unpin`. Its empty line is the PHONE's own, never the desktop's "Hover..." line: `Nothing pinned yet. Press and hold a message to pin it.` A failed load: `LoadFailed` with Retry. The phone gets no "Shared" in this build. Words: the chat-level row stays `Pin to top`; when `onOpenPinned` is passed its other state reads `Unpin from top` instead of `Unpin` (`ConversationActionSheet.tsx:279`), so it cannot be taken for unpinning a message; without the prop it stays `Unpin` (1.3 K10). A bare "Pin" never appears on the phone.

## 5. The dm bridge (W3-3-bridge owns `public/html/messages.html`)

### 5.1 The flag and the CSS
- The frame's URL is always exactly `paneSrc()` = `/html/messages.html?app=1&embedded=1&pane=1&v=1` (`app=1` is required by the proxy; `v` is `DM_BRIDGE_VERSION`, the cache-buster: a protocol change bumps it and with it the URL). It NEVER carries `to` or `channel` and never changes after mount.
- Head: a SECOND inline script on the blank line after the theme boot script (line 4 is not touched; `theme.test.ts:236-258` pins it; the three PWA head lines are not touched): `<script>try{if(/[?&]pane=1(&|$)/.test(location.search))document.documentElement.classList.add('vibe-pane')}catch(e){}</script>`
- One CSS block after line 30, every selector starting `html.vibe-pane`. The rules WORD FOR WORD (map 04 section 3.2's table, with its `!important`s: without them the block loses to rules that exist. `:30` is `body.vibe-embedded .shell { grid-template-columns: 300px 1fr !important; }` and `_persistence.js:120` puts that class on every framed page; `:944` is `*{cursor:none!important}` and the `:949` media block answers with `cursor: auto !important`):
```css
html.vibe-pane .left-nav, html.vibe-pane .thread-col { display:none !important; }
html.vibe-pane .shell { grid-template-columns:1fr !important; }
html.vibe-pane .convo { background:var(--cream); }
html.vibe-pane #emptyState > * { display:none; }
html.vibe-pane .msg-row > div:not(.msg-av):not(.mv) { max-width:min(70%, 520px); }      /* map 04 said 560; 520 matches the club bubbles */
@media (max-width:760px) and (pointer:fine) {
  html.vibe-pane *, html.vibe-pane *::before, html.vibe-pane *::after { cursor:none !important; }
  html.vibe-pane input, html.vibe-pane textarea, html.vibe-pane [contenteditable="true"] { cursor:text !important; }
}
html.vibe-pane #cPinsBtn:not([data-off]) { display:flex !important; }
```
  plus the pin button's own look, the pill-on-focus rule (4d.5) and the pinned-row flash (its colour a CSS variable, so Light and Night both read). The frame is narrower than 760px on most laptops; without the media block both cursors draw.
- `#cPinsBtn` in the markup: `<button class="c-btn" id="cPinsBtn" style="display:none" aria-label="Pinned and shared" aria-pressed="false">`. The `hidden` attribute would NOT hide it (`.c-btn{display:flex}` at `:249` beats the browser's `[hidden]` rule), and a rule outside `html.vibe-pane` is not allowed, so it is hidden inline and shown by the one `!important` pane rule. JS hides it in pane mode by setting `data-off` (a pending request, pins unavailable), never by `style.display`.
- Rule for the builder and the reviewer: every new declaration that must beat an existing `!important` rule carries `!important`; list each such pair in the batch report.

### 5.2 JS spots (every new path returns at once unless `IS_PANE`; no existing function is renamed)
1. `:1120`: `const IS_PANE = IS_EMBEDDED && document.documentElement.classList.contains('vibe-pane');` and `function __paneSay(type, extra)` -> `window.parent.postMessage(Object.assign({ source: 'vibe-dm', v: 1, type: type }, extra || {}), location.origin)` in try / catch.
2. A `message` listener: returns unless `IS_PANE && e.origin === location.origin && e.source === window.parent && e.data && e.data.source === 'vibe-shell' && e.data.v === 1`; then handles the five commands of 5.3.
3. `__dmLoadList` (`:2290`): in pane mode it asks `/api/me/threads?scope=chats`; takes `opts.fromTimer`; after a good load says `list-changed` unless `fromTimer`.
4. `__dmOpenChannel` (`:2573`): the `/read` POST's success says `read`; then `opened` (`kind` from the thread record, `isRequest`); focus `#msgIn`; load the chat's pinned ids (`GET /api/me/threads/<id>/message-pins`; a 404 sets pins unavailable and hides every pin control).
5. `__dmLoadMessages` (`:2488`): from the timer, when the newest message id changed and it is not mine and `!document.hidden`: POST `/read` again, say `activity { reason: 'received' }`, then `read` on success.
6. `__dmSend` success (`:2653`): `activity { reason: 'sent' }`.
7. `closed` at decline (`:2787`), block (`:3105`), delete conversation (`:3350`), leave group (`:3375`).
8. Init: skip `__dmLoadConnections()` (`:3622`); never strip `to` / `channel` from the top URL (`:3634-3639`, `:3663-3668` are skipped; in pane mode neither parameter is present anyway); IN PANE MODE ONLY the 30-second list timer (`:3671-3674`) passes `{ fromTimer: true }` and returns when `!active` (outside pane mode the timer's body is today's, word for word: the old full page keeps refreshing its list with no chat open); the last line of init says `ready`.
9. Pins: `data-mid="<id>"` on the four `.msg-row` templates (`:1456`, `:1494`, `:1509`, `:1522`), written only when `IS_PANE` (outside pane mode the markup is today's); the pinned-id set lives in `__realDM` and is part of the render signature (`:1299-1305`) in pane mode only; one pin icon button in `actionsFor` (`:1376-1401`) and in `reportPillFor` (`:1361-1364`), and your OWN photo / video / post rows get a pill holding only that button (`withReportPill`, `:1368-1371`); the emoji array at `:1377` is not changed (`reaction-emoji.test.ts`). The button calls `PUT` or `DELETE .../messages/<id>/pin` through `vibeRequest`, a refusal shows its sentence with `vibeToast`, success updates the set, re-renders and says `pins-changed`. No pin control while `d.isRequest` or pins unavailable. `#cPinsBtn` is a third `.c-btn` after `:1080` (markup in 5.1); it says `pins-toggle`.
10. Point 11, the two inert lines that also run outside pane mode: `:2483` stores `j.viewer.post_line` on the thread record; `__dmPaintComposer` (`:2351-2353`) prints it when it is a non-empty string; `__DM_CHAT_REFUSALS` gains `room_posters_only`.
11. **No history entry from the frame (3.5 rule 10).** In pane mode a tap on a shared post does NOT call `window.openPostViewer` (`_postViewer.js:777`; its `:682` does `history.pushState({ vpv })` inside the frame): it opens `/posts/<id>` with `window.open(url, '_blank', 'noopener')`. `_postViewer.js` is not edited. The builder greps the page and the scripts it loads (`:15-25`) for `history.pushState`, `history.replaceState` and `history.back`, lists every caller in the report, and proves none is reachable in pane mode (today the post viewer is the only one). `open` and `close` also close whatever overlay the page owns (Chat info, the emoji and mention pickers, the report sheet) before doing their work, so a switch from the slim list never leaves one over the next chat.
12. **Esc (3.5 rule 9).** In pane mode a `keydown` for Escape: a panel, picker or sheet of the page is open -> close it (today's behaviour where there is one); else focus is in `#msgIn` -> blur it; else say `escape`. The page has no Esc handler today; outside pane mode none is added.
13. **A chat lost while open.** In pane mode, for the ACTIVE chat only: a 403 or 404 from `__dmLoadMessages`, or the active id missing from the list after a list reload, says `closed { reason: 'lost' }` once, clears the poll timer and sets `active = null`. Without it the page falls to its empty state, which pane mode hides: a blank pane under a highlighted row.
14. **The last `open` wins.** The page keeps `wantedId` = the `channelId` of the last `open` received (`close` clears it). The "unknown id: one `__dmLoadList()` then retry" path checks `wantedId === id` when its reload returns and drops the retry otherwise, so a slow retry for chat A can never open A after the shell asked for B.
15. **Chat info and the shell's panel (4d.5).** `__dmPanelOpen` (the `:1080` button) says `info-opened` in pane mode; the `panel-state` command with `open: true` closes Chat info, and sets `aria-pressed` on `#cPinsBtn` either way.
16. **Names for the two header buttons** (`:1079-1080` have none). Set by JS in `__dmOpenChannel`, pane mode only, so the old page's markup is untouched: the first button `aria-label="Open <name>'s profile"` in a dm (the board's words); in a group the builder reads what that button does today and names it by that (it is never left unnamed); the second `aria-label="Chat info"`.

### 5.3 The protocol (`dm/dm-bridge.ts`, W3-1-pure; pure, tested)
```ts
export const DM_BRIDGE_VERSION = 1;
export function paneSrc(): string;
export type DmPageEvent =                                   // page -> shell: { source: "vibe-dm", v: 1, type, ... }
  | { type: "ready" }
  | { type: "opened"; channelId: string; kind: "dm" | "group"; isRequest: boolean }
  | { type: "open-failed"; channelId: string; message: string }   // not in the list after one reload, or the server refused
  | { type: "read"; channelId: string }
  | { type: "activity"; channelId: string; reason: "sent" | "received" }
  | { type: "list-changed" }
  | { type: "closed"; channelId: string; reason: "declined" | "blocked" | "deleted" | "left" | "lost" }   // "lost": not the viewer's doing (removed from the group, the read began to answer 403 / 404)
  | { type: "escape" }                                      // Esc in the page with nothing of its own to close (5.2 item 12)
  | { type: "info-opened" }                                 // the page opened its Chat info: the shell closes Pinned and Shared
  | { type: "pins-toggle"; channelId: string }
  | { type: "pins-changed"; channelId: string }
  | { type: "jump-missed"; messageId: string };
export type DmShellCommand =                                // shell -> page: { source: "vibe-shell", v: 1, type, ... }
  | { type: "open"; channelId: string }                     // wantedId = id; close the page's own overlays; openT(id); unknown id: one __dmLoadList() then retry ONLY if wantedId is still id, then open-failed
  | { type: "close" }                                       // wantedId = null, active = null, clear pollTimer, hide #cContent, close Chat info and every other overlay
  | { type: "jump"; messageId: string }                     // scroll [data-mid] into view and flash it, else jump-missed
  | { type: "pins-changed"; channelId: string }             // an unpin made in the panel: refetch the pinned ids
  | { type: "panel-state"; open: boolean };                 // the header button shows pressed while the panel is open; open: true also closes the page's Chat info
export function parsePageEvent(data: unknown): DmPageEvent | null;                          // null unless source === "vibe-dm", v === 1 and the fields have the right types
export function shellMessage(command: DmShellCommand): { source: "vibe-shell"; v: 1 } & DmShellCommand;
export function fromFrame(event: { origin: string; source: unknown }, ownOrigin: string, frameWindow: unknown): boolean;   // origin === ownOrigin && source === frameWindow
```
### 5.4 `dm/LegacyThreadPane.tsx` (W3-3-bridge)
- ONE `<iframe title="Messages" src={src}>` with `const [src] = useState(paneSrc)`; mounted by the shell as soon as BOTH list reads have settled (an answer OR a failure: a failed inbox must not leave a dm deep link without a frame), or at once when the address names a chat or carries `to`; never unmounted; style `width: 100%; height: 100%; border: none; display: block; background: var(--cream); colorScheme: "normal"` (the two lines that stop the white flash in Night). Hidden with `visibility: hidden; pointer-events: none` (never `display: none`: the page pins its scroll to the bottom by layout) inside an absolutely positioned box that fills the pane.
- A `window` `message` listener: `fromFrame(e, window.location.origin, iframe.contentWindow)` then `parsePageEvent(e.data)`; valid events go to `onEvent`. `postMessage` to the frame always uses target origin `window.location.origin`.
- A queue: commands wait until `ready`. `threadId` changes: a string -> `open` (and `iframe.contentWindow.focus()`); null -> `close`.
- No `ready` within 8 s of mount (or of Retry): the pane shows `Couldn't open this chat.` and a `Retry` button that remounts the iframe (a new `key`); never the old full layout. The line and Retry are offered only while NO `ready` has arrived: the page's init awaits the profile bootstrap and its list before `ready`, which can pass 8 s on a slow connection, so a `ready` that arrives after the line clears the line and flushes the queue (the listener stays on; nothing is torn down at 8 s).
- The shell's reactions: `opened` -> nothing to write (the address already says it); `open-failed` -> `fail(message)`; `read` / `activity` / `list-changed` -> bump `refreshKey`; `closed` -> `goHome()` + bump, and for `reason: "lost"` also the toast `That chat isn't available anymore.`; `escape` -> `goHome()`; `info-opened` -> close Pinned and Shared (and send `panel-state { open: false }`); `pins-toggle` -> toggle the panel and send `panel-state`; `pins-changed` -> bump the panel's `refreshToken`; `jump-missed` -> `missedId`.
- Focus trap 5.7 of map 04: once focus is inside the frame the shell hears no keys and no clicks; every `DesktopPopover` therefore also closes on the window's `blur`.

## 6. Desktop forms of the phone's pieces

The rule for every file below: read `useChatSurface()`; when it is `"phone"` (the default, and the only value the phone tree ever sees) the component renders and behaves exactly as today. `club/`, `cards/`, `compose/` are mounted only under `chat_v2`; `MessageBubble`, `ReactionPicker`, `ConversationView` are ALSO used by switch-off phones, so there a change is either desktop-surface-only or an optional prop nobody else passes.

### 6.1 `dm/DesktopDialog.tsx` (W3-1-prep)
- `DesktopDialog`: a fixed scrim (`rgba(var(--scrim-rgb), 0.45)`) and a centred card (`width` default 440, `max-height: 86vh`, radius 20, `t.surface`, the title in SERIF 18, a 32px close button `aria-label="Close"`); `role="dialog"`, `aria-modal="true"`, `aria-label={title}`; focus moves in on open and returns on close; Tab is trapped; Esc, the scrim and the close button call `onClose` unless `busy`; `useLayerHistory(ownsHistory !== false, onClose)` so Back closes it first. `CardSheet` (`:154`) and `RsvpSheet` (`:48`) already hold their own entry: they pass `ownsHistory={false}`, so one dialog is never two Back steps.
- `DesktopPopover`: positioned under `anchor` (`getBoundingClientRect`, kept inside the window), `role="dialog"`, `aria-label={label}`, default width 336; closes on Esc, a press outside, the window's `blur`, and Back (`useLayerHistory`). Focus: on open it moves INTO the popover (the first focusable element, else the popover box with `tabIndex={-1}`); on every close it returns to `anchor` (the phone's month returns focus to the week title the same way, `MessagesHome.tsx:557`). Tab is not trapped (a popover is not modal), but Tab out of the last element closes it. Both components stop the Esc they handle (`stopPropagation`), so the shell's Esc rule (3.5 rule 9) never also closes the chat.
### 6.2 The month (W3-1-prep splits, W3-4-week wraps)
`home/MonthBody.tsx` exports `MonthBody` with props `{ initialDay: Date; now: Date; night: boolean; onPicked: (day: Date) => void; onOpenRoom: (entry: WeekEntry) => void; renderTitle: (monthLabel: string) => ReactNode; cell?: number }` (`cell` default 42, the day chip's size). It holds everything `MonthSheet.tsx:89-171` and `:229-274` hold today (the month on screen, the per-month cache and read, the grid, the picked day's plans, the footer line). `MonthSheet` keeps its props, its vaul shell, `CloseHandle`, `useHideTabBar`, `useLayerHistory`, and passes `renderTitle={(label) => <Drawer.Title ...>}` so the phone renders the SAME nodes in the same order. `dm/MonthPopover.tsx` = `DesktopPopover` (width 336) around `MonthBody` with an `<h2>` title; on close the band does what `MessagesHome.tsx:353-358` does (move to the picked day's week, re-read that week).
### 6.3 Per file (two batches; the owners are named under the table)
| File | On the desktop surface |
|---|---|
| `club/RoomChips.tsx` | 4c.4: the lock rule and the megaphone on BOTH surfaces; desktop: the selected event chip, the wrap, no top border, no side padding |
| `club/RoomComposer.tsx` | both surfaces: the `post_line` tile, `room_posters_only`, `shownName` (4c.3); it passes `anchorRef={plusRef}` to `CardTray` (the "+" button's ref, `:159`); nothing else |
| `club/RoomThread.tsx` | each row is wrapped in `HoverActions` (6.4); `ReportSheet` is mounted `variant="modal"` without `nested` |
| `club/helpers.ts` (+ test) | both surfaces: 4c.3's `chipLabel` and `chipAriaLabel` |
| `club/BoardView.tsx` | the Announcements line (4c.4); `ReportSheet variant="modal"` without `nested` |
| `club/BoardPost.tsx` | BOTH surfaces (owed L3): a visible "..." (`aria-label="More"`) on a text post's byline and on each reply row, opening Report (not on my own) and Remove (when `can_moderate`, not my own) through the handlers `BoardView` already passes |
| `MessageBubble.tsx` | the 500 ms press does not arm; its own "..." is not drawn; text bubbles get `maxWidth: 520`; `userSelect` is not set to none and the context menu is not swallowed |
| `cards/CardBubble.tsx` | the press does not arm; selection and the context menu allowed. The card stays 292px. |
| `compose/CardSheet.tsx` | the same title, room line, children and CTA inside `DesktopDialog` (width 440, `busy` while posting); no `Drawer.NestedRoot`. The three sheets using it are not edited. |
| `club/RsvpSheet.tsx` | the same three rows inside `DesktopDialog` (width 360, title `Your RSVP`); no `Drawer.NestedRoot` |
| `cards/EventCardView.tsx` | after a successful RSVP write also call `emitCalendarChanged()` |
| `compose/CardTray.tsx` | design point 8 names the card tray FIRST among the sheets that change. `CardTrayProps` gains `anchorRef?: React.RefObject<HTMLButtonElement \| null>` (pinned; only `RoomComposer` passes it). Desktop surface: the same caption and the same three rows inside `DesktopPopover` (`anchor={anchorRef?.current ?? null}`, `label` = the caption, `width` 320, `align="start"`), opening upward from the "+"; no scrim over the thread; Esc and a press outside close it; focus returns to the "+"; its background is `t.surface` (the Night literal `#1C1A1A` at `:91` stays on the phone surface only). Phone surface: today's in-flow block and scrim, unchanged (`:103-128`). On the phone it would otherwise be three 72px rows stretched across a pane 528 to 1008px wide with the whole thread dimmed. |
| `ReactionPicker.tsx` | only `export` added to `REACTION_EMOJIS` (`:7`) so the toolbar shows the same seven |
Owners. W3-3-thread: `RoomChips`, `RoomComposer`, `RoomThread`, `helpers.ts` (+ test), `HoverActions`, `MessageBubble`, `ReactionPicker`, `CardBubble`. W3-3-forms: `BoardView`, `BoardPost`, `CardSheet`, `RsvpSheet`, `EventCardView`, `CardTray`. `ComposeSheets`, the three card sheets and the three card views, `EventAbout`, `BoardStrip`, `ClosedTile`, `RemoveConfirm`, `useRoomPoll`, `ClubSpace`, `EventChat`, `UpNext` are NOT edited.
### 6.4 The hover toolbar: `club/HoverActions.tsx` (W3-3-thread)
```ts
export type HoverActionsProps = {
  night: boolean; isMine: boolean;
  onReact?: (emoji: string) => void; onReply?: () => void; onReport?: () => void; onRemove?: () => void;
  children: ReactNode;
};
export function HoverActions(props: HoverActionsProps): JSX.Element;
```
A `position: relative` wrapper; a `role="toolbar"` `aria-label="Message actions"` pill (30px tall, `t.surface`, 1px `t.chipBorder`, radius 999) at the bubble's outer top corner, never on a removed-content card or a `temp_` row. Buttons, each only when its handler is passed: React (`aria-label="React"`; opens the seven `REACTION_EMOJIS` in a row), Reply (`aria-label="Reply"`), "..." (`aria-label="More"`, `aria-haspopup="menu"`; a small menu: `Report`, `Remove`). `RoomThread` passes the handlers it already builds per row (`:345-358`).
- **How it hides.** ONLY with `opacity: 0; pointer-events: none`, shown (`opacity: 1; pointer-events: auto`) on the wrapper's `:hover` and `:focus-within`, with a 150 ms hide delay (CSS). Never `display: none` or `visibility: hidden`: nothing inside could take focus and the toolbar would never open by keyboard.
- **Keyboard (1.3 K9).** The wrapper is the row's ONE Tab stop: `tabIndex={0}`, `role="group"`, `aria-label` = the row's spoken line (what the bubble already says; else `Message from <name>`), with a visible focus ring from tokens. The toolbar's buttons are `tabIndex={-1}`. Enter or Space on the focused row moves focus to the first button; Left / Right move between buttons; Enter presses; Esc closes the emoji row or the menu if one is open, else returns focus to the row; Tab goes to the next row. Every Esc handled here is stopped (`stopPropagation`), so it never reaches the shell's "Esc closes the chat".
- Phone surface: `RoomThread` does not mount `HoverActions` at all (the long-press stays).

### 6.5 The words and the spoken names (every string quoted; where the phone has a helper, CALL it; no builder writes a sentence of their own)
| Where | The words | Source |
|---|---|---|
| Band, group label | `` aria-label={`Event rooms you RSVP'd to ${weekWord(offset, range)}`} `` | `YourWeek.tsx:354`; `weekWord` is in `src/lib/chat/week.ts:142`: call it |
| Band, empty | `Nothing on your week yet.` on this week, `Nothing that week yet.` on another; then the link `Find events` to `/campus?tab=events` | `YourWeek.tsx:337-341`; copied as text (`dm/` may not import `YourWeek`) |
| Band, arrows | `aria-label="Previous week"`, `aria-label="Next week"` | `YourWeek.tsx:221, 240` |
| Band, the pill | text `This week`; `` aria-label={`Back to this week, ${weekRangeAt(now, 0).spoken}`} `` | `YourWeek.tsx:245` |
| Band, the title | visible `weekTitle(offset, range)`, spoken `weekSpoken(offset, range)`, `aria-haspopup="dialog"` | `YourWeek.tsx:224-236`, `week.ts` |
| Wide list, search | the button `aria-label="Search your chats"`; the field's placeholder `Search your chats` | new |
| Wide list, filters | the row `role="tablist" aria-label="Show"`, each pill `role="tab"` with `aria-selected`; Requests with a count: `` aria-label={`Requests, ${count} waiting`} `` | `MessagesHome.tsx:486, 496` |
| Wide list, no chats yet | `EmptyState` is reused for `requests` ONLY. Where the phone shows `<EmptyState tab="all" />` the wide list draws its own line: `No chats yet. Find someone in Network, or press New.` with the same `/network` link | `ThreadList.tsx:286` says "tap message": wrong on a laptop |
| New dialog | title `New message`; placeholder `Search people`; `` `No matches for "${q}"` ``; `Search above to start a new message.`; the group name's placeholder `Group name (optional)`; the button `Message` for one person, `Create group` for several | `ComposeOverlay.tsx:120, 166, 206, 262-264`; `messages.html:3705, 3715` |
| New dialog, the group rule | under a person who cannot be picked: `Group chats are for people you're connected with.`; after a `not_connected` refusal: `` `${names} can't be added. Group chats are for people you're connected with.` `` | new; the rule is `threads/route.ts:267-278` |
| Club header, hat line | panel on screen: `` `Your hat: ${roleWord(role)}` ``; panel not on screen: `hatLine(role, member_count)`, and for owner and admin ` · ` + the link `Manage club` | `helpers.ts:43-45` returns the count too; the board: `hatLine: '...' + (clubPanel ? '' : ' · 48 members')`, `headerManage: officer && !clubPanel` |
| Panel, no Board posts | `emptyLine("board", clubName)` = `Nothing on the Board yet.` | `helpers.ts:278`; call it (the first draft's "No announcements yet." is dropped) |
| Members dialog | title `` `Members of ${club}` ``; search placeholder `Search members`; each row links to `/profile/<handle>` | `ConversationActionSheet.tsx:271`; there is no `/u/` route |
| Hover toolbar | `aria-label`s `React`, `Reply`, `More`; menu items `Report`, `Remove` | the board; 6.4 |
| Dm header in pane mode | `Open <name>'s profile`, `Chat info`, `Pinned and shared` | the board; 5.2 item 16 |
| Pinned panel, empty (desktop) | `Nothing pinned yet. Hover a message and press the pin.` | 4d.5 |
| Pinned sheet (phone) | title `Pinned messages`; empty `Nothing pinned yet. Press and hold a message to pin it.` | 4d.6 |
| Chat-level pin row (phone, only with `onOpenPinned`) | `Pin to top` / `Unpin from top` | `ConversationActionSheet.tsx:279` |
| A chat lost while open | toast `That chat isn't available anymore.` | 5.4 |

## 7. Campus > Chat and links (W3-3-campus owns `src/app/campus/page.tsx`, `CampusSwitch.tsx`, `campus-home.tsx`)

- `src/app/campus/page.tsx`: `searchParams` type gains `tab?`, `channel?`; `const { userId } = await enforceCampusAccess("/campus"); const desktopChat = await chatDesktopFor(userId);` if `desktopChat` and (`tab === "chat"` or a non-empty `channel`): `redirect("/messages" + (channel ? "?channel=" + encodeURIComponent(channel) : ""))` (`org=` is dropped). Right on both screens: `chat_desktop` implies `chat_v2`, and the phone already redirects these. Pass `desktopChat` to `CampusSwitch`, which passes it ONLY to `CampusHome` (`CampusMobile` is untouched).
- `CampusHome({ showSchoolVerifiedBanner, desktopChat = false })`. When true: `CampusTabs` gets `hideChat` (filter beside `hideMap`, `:6166`); the initial tab can never be `"chat"` (`parseInitialTab`'s answer is mapped to `"feed"`), so the rails, the dark backdrop, the `100dvh` lock and the hidden Otto orb never appear. When false: every line as today.
- The `?manage=<handle>` door (only when `desktopChat`): read once on mount beside `?org=` (`:494-499`); when the clubs load (`:672-681`) select that club and `setShowSettings(true)`; the modal already mounts outside the tab body (`:1049-1063`). A handle that is not one of my clubs does nothing.
- The old composer's line (`:16736-16757`): print `roomRules.viewer.post_line` when present (4c.4).
- Links, with the switch on: rows 1, 2, 6, 8, 9, 10, 11, 15, 16 of map 05's table 1.6 land on the new page by the address they already use; row 7 (the club page's rooms list) is caught by the redirect above; rows 3, 4, 5, 12, 13 are unchanged (owed, section 11). `ChannelsSection.tsx`, `payload.ts`, `OttoSidePanel.tsx`, `_otto.js`, `profile.html`, `src/proxy.ts`, `next.config.ts`, `public/sw.js` are not edited.

## 8. Waves and batches

Rules for every batch: work in the worktree `chatdesk` on branch `chat-desktop`; edit ONLY the files you own; no Write or Edit over about 150 lines (write a long file in several Edits); never Read a file over about 1,500 lines whole (`campus-home.tsx`, `messages.html`: grep, then read ranges); read the Next guide under `node_modules/next/dist/docs/` for any Next API you touch; nothing changes for a phone outside what this file says; no production credential, no remote database. A same-wave import is allowed only against an interface pinned word for word in sections 2 to 6; code against the pinned text, not against the sibling's file. Read `critic.md` for the items under your batch's name before you start.
Size: a batch is at most about 600 new or changed lines, and about 6 files unless the extra files are one-line edits. That is why there are five waves (1.3 K1).
Wave gate (run once, after every batch of the wave has finished, by the orchestrator or the last batch): `npm run typecheck` exit 0; `npm test` 0 failures (baseline 1,839 tests); `npm run build` exit 0; `npx eslint <each touched file>` adds no problem to the baselines of map 05 section 4.4. A batch runs `npx tsc --noEmit` itself and may ignore only errors inside files another batch of the same wave owns.
Each batch's checks are split: **Agent** = provable with typecheck, lint, `node --test` and reading code; **Walk** = DEFERRED to the browser walk (section 10). No builder opens a browser.
**Calm** (an Agent line for EVERY batch that draws; it is not repeated in full below): in the batch's diff no hex colour and no `rgb(` / `rgba(` literal except `rgba(var(--scrim-rgb), a)`: every colour is `palette(night)` or a CSS variable; at most one glow per screen and nothing on screen twice, as 3.2 lists them; every string is one of 6.5's or of the section the batch builds, word for word.

| Old name | New name | Wave |
|---|---|---|
| W3-1A (types half) | W3-1-types | 1 |
| W3-1A (switch half) | W3-1-switch | 1 |
| W3-1B | W3-1-pinsdb | 1 |
| W3-1E (pure files) | W3-1-pure | 1 |
| W3-1E (phone-file prep, the dialog) | W3-1-prep | 1 |
| W3-1C | W3-2-roomsdb | 2 |
| W3-1D (space and thread reads) | W3-2-roomreads | 2 |
| W3-1D (room routes, names) + the roster filter | W3-2-roomroutes | 2 |
| W3-2E | W3-2-pinroutes | 2 |
| W3-2C (thread half) | W3-3-thread | 3 |
| W3-2C (dialogs half) + the card tray | W3-3-forms | 3 |
| W3-2D | W3-3-bridge | 3 |
| W3-4A | W3-3-campus | 3 |
| W3-2A | W3-4-shell | 4 |
| W3-2B (band, month) | W3-4-week | 4 |
| W3-2B (lists, New) | W3-4-lists | 4 |
| W3-3E | W3-4-phonepins | 4 |
| W3-3A | W3-5-club | 5 |
| W3-3B (panel) | W3-5-panel | 5 |
| W3-3B (members dialog) + the people picker of W3-3C | W3-5-people | 5 |
| W3-3C | W3-5-rooms | 5 |
| W3-3D | W3-5-pins | 5 |

### Wave 1: foundations (no new screen is visible yet)

**W3-1-types Shared types and room rules.** Owns `src/lib/chat/types.ts`, `src/lib/chat/room-rules.ts`, `src/lib/chat/room-rules.test.ts`, `src/app/api/me/threads/[id]/messages/route.ts` (only `POST_REFUSAL_STATUS`, `:65`), `src/app/api/me/threads/[id]/cards/_lib/rpc-refusal.ts` (only `POST_REFUSAL_STATUS`, `:39`, and its "same four rows" comment), `src/lib/chat/cards/rpc-refusal.test.ts`, `src/components/mobile/messages/surface.ts` (new). Depends on nothing.
- Builds: in `types.ts` the `FeaturesResponse` line of 2.2, the types of 4.3 (`PinnedMessage` with `full_text`) and of 4c.3; the five codes with their sentences; `EXTRA_ROOM_CAP`, `POST_POLICIES`, `isPostPolicy`, `postRuleLine`, the new `postRefusal` row; `room_posters_only: 403` in BOTH status tables (4.2); `surface.ts`.
- Exports (pinned): 4.3's types, 4c.3's types and functions, `ChatSurfaceContext` / `useChatSurface` / `ChatSurface`.
- Agent: `room-rules.test.ts` covers the five sentences, `postRuleLine`, `isPostPolicy`, and `postRefusal` for a `room` under each policy; `rpc-refusal.test.ts:54` deep-equals FIVE rows and gains one case (a `room` with `post_policy: "officers"`, a member, `P0C21` -> `{ status: 403, body: { ok: false, error: "Only some people can post here.", code: "room_posters_only" } }`); `grep -rn "Record<PostRefusalCode" src` finds exactly two tables, both with five rows; `cards/routes.test.ts` untouched and green; `npx tsc --noEmit` shows no error outside W3-1-switch's `features/route.ts`.
- Walk: none.

**W3-1-switch The switch.** Owns `src/lib/chat/flag.ts`, `src/lib/chat/flag.test.ts`, `src/lib/chat/flag-desktop-server.ts` (new), `src/app/api/me/features/route.ts`, `src/lib/auth/campus-access.ts`, `src/app/messages/page.tsx`, `src/app/messages/MessagesSwitch.tsx`, `src/lib/use-client-ready.ts` (new), `dm/MessagesDesktop.tsx` (new stub: `export function MessagesDesktop(_props: { initialHandle?: string; initialChannelId?: string }) { return null; }`), `.env.example`. Ten files, each a small edit. Consumes (same wave, pinned in 2.2) `FeaturesResponse`.
- Builds: section 2 (2.2 without the `types.ts` line, 2.3, 2.4).
- Agent: `flag.test.ts` cases of 2.4 pass; `flag-server.ts` is unchanged (`git diff` empty) and no gated route imports `flag-desktop-server`; with `desktopChat` false `MessagesSwitch` returns the same JSX as before (read the diff: the old lines are intact inside the `!desktopChat` path); `enforceCampusAccess`'s other callers compile unchanged.
- Walk: a switch-off laptop's first paint is today's iframe with no placeholder; a switch-on phone never shows the desktop shell.

**W3-1-pinsdb Pins: migration and rules.** Owns `supabase/migrations/20261004100000_chat_message_pins.sql`, `scripts/sql/chat-message-pins-check.sql`, `src/lib/chat/pin-rules.ts`, `src/lib/chat/pin-rules.test.ts`. The ONLY batch of wave 1 that runs SQL on the local stack. Depends on nothing.
- Builds 4b.1 and 4d.3's pure file; applies the migration to the LOCAL stack and records the row; runs the check script.
- Agent: the file applies cleanly once and a second run stops at "already applied"; the check script ends "all N cases passed"; `pin-rules.test.ts` passes (`pinQuote` cuts, the cleared rule, `pinnedIds`); the header's ROLLBACK was rehearsed locally (rollback, then apply again) and says so; the header's Lock note is 4b.1's corrected one (SHARE ROW EXCLUSIVE on `messages`, `channels` and `users` until commit), not "none on channels".
- Walk: none.

**W3-1-pure The pure desktop files.** Owns `dm/contracts.ts`, `dm/desktop-rules.ts`, `dm/desktop-rules.test.ts`, `dm/dm-bridge.ts`, `dm/dm-bridge.test.ts` (all new). Consumes (same wave, pinned in H2) `HomeData` from `home/MessagesHome.tsx`.
- Builds 3.3 (with `RosterRow`, `RosterResponse`, `RoomPeopleProps`; no `pinnedAt`), 3.4 (`bandFit` takes the measured `fixedWidth`), 5.3 (with `lost`, `escape`, `info-opened`).
- Agent: `desktop-rules.test.ts` covers `knownChat` (thread, request, board id, lounge id, unknown), `slimRows` (order equals `mergeHomeRows`; pinned kept; muted unread dropped unless pinned or open; coral vs ring; no dot on the open row; the supplied row for an unlisted open chat comes first), `searchRows`, `bandFit` (band 700, 1000 and 1240 with fixed 560 and 0, 1, 3, 6 events; AND another week: band 824 and 700 with fixed 650: never more cards than the same band on this week, never below 0, `+N` counted), `panelMode` (every branch), `chatEntry`; `dm-bridge.test.ts` covers `parsePageEvent` (every type; `closed` with each of its five reasons and an unknown reason -> null; `escape`; `info-opened`; wrong `source`, wrong `v`, missing or mistyped fields -> null), `shellMessage`, `fromFrame`, `paneSrc()` contains `app=1`, `embedded=1`, `pane=1`; no React and no DOM import in the three non-test files except `ReactNode` as a type.
- Walk: none.

**W3-1-prep Phone-file preparations and the dialog.** Owns `home/MessagesHome.tsx` (only: `export` on `useHomeData`, `HomeSkeleton`, `FILTER_LABEL`, `LIST_LABEL`, and the new `export type HomeData`), `home/MonthSheet.tsx`, `home/MonthBody.tsx` (new), `dm/DesktopDialog.tsx` (new). Consumes (same wave, pinned in 3.3) `DesktopDialogProps`, `DesktopPopoverProps`.
- Builds H2's exports, 6.2's split, 6.1 (dialog and popover, with the focus rules).
- Agent: `git diff home/MessagesHome.tsx` shows five added keywords / one added line and nothing else; `MonthSheet` after the split renders the same elements in the same order (read both versions side by side and list any difference in the report: there must be none); `home-rules.test.ts` and `layer-stack.test.ts` untouched and green; in `DesktopDialog.tsx`, by reading: the dialog traps Tab, returns focus on close, and one dialog is one Back step; the popover moves focus in on open, returns it to `anchor` on every close path (Esc, outside press, window `blur`, Back, Tab out), and both stop the Esc they handle; Calm.
- Walk: the phone's month (375px, `chat_v2` on): open from the title and from a day, change month, Today, pick a day, open a plan, close by the handle, by Back, by a drag: all as on Oct 2 (section 10 part G; it is item (e) of 2.5 row 10).

### Wave 2: the server (rooms and pins; still no new screen)

**W3-2-roomsdb Rooms: the post-policy migration.** Owns `supabase/migrations/20261004110000_chat_room_post_policy.sql`, `scripts/sql/chat-room-post-policy-check.sql`. The ONLY batch of wave 2 that runs SQL on the local stack (W3-1-pinsdb finished in wave 1; the pins table must already be there: check it first). Depends on W3-1-pinsdb (the database's turn, not code).
- Builds 4b.2; applies locally; writes the two new md5s into the header; runs its check script AND `scripts/sql/chat-v2-rooms-check.sql` + `scripts/sql/chat-v2-cards-check.sql` (unchanged, still all passing).
- Agent: the file applies cleanly once and a second run stops at "already applied"; its check script ends "all N cases passed"; `can_view_org_channel`'s md5 is still `747ee06d…` after the apply; the rollback rehearsal (rollback, then apply again) brings both function md5s back to `8d8be860…` and `a8f2efe4…` and the header says it was done; `scripts/sql/chat-message-pins-check.sql` still passes after the last apply.
- Walk: none.

**W3-2-roomreads Rooms in the space and thread reads.** Owns `src/lib/chat/rooms.ts`, `src/lib/chat/reads.ts`, `src/lib/chat/reads.test.ts`, `src/lib/chat/message-read.ts`, `src/lib/chat/message-read.test.ts`, `src/app/api/orgs/[slug]/space/route.ts`, `src/lib/chat/reads-routes.test.ts`. Depends on W3-1-types.
- Builds 4.2's memory trio and the space route's changes; 4c.3's server half (`loadRoom`, `viewerInRoom`, `spaceCanPost`, `orderSpaceRooms`, `board_recent`).
- Exports (pinned in 4.2): `postPolicyColumnMissing`, `notePostPolicyColumnMissing`, `forgetPostPolicyColumnMissing`.
- Agent: `reads-routes.test.ts` updated ON PURPOSE: the room keys are exactly `can_post, event, id, kind, locked, name, post_policy, unread`; the select string is the new one; a case where the first select fails as missing schema and the retry succeeds (rooms come back `everyone`), and the NEXT request then makes one select only (the memory), with `forgetPostPolicyColumnMissing()` in every test's setup; the memory ends after 5 minutes (pass `now`); no `board_recent` without `?panel=1`, at most 3 newest-first with it, the Board read still called with exactly `{ limit: 6 }`; flag off still 404. `reads.test.ts`: the three-argument `spaceCanPost` cases unchanged, plus `room` under each policy for member / admin / listed. `message-read.test.ts`: `post_line` present only for a `room` with a policy the viewer fails; absent in every existing case.
- Walk: none of its own (section 10 part C2 exercises it).

**W3-2-roomroutes Room routes, room names, the roster filter.** Owns `src/app/api/orgs/[slug]/channels/route.ts`, `src/app/api/orgs/[slug]/channels/[channelId]/route.ts`, `src/app/api/orgs/[slug]/members/route.ts` (GET only: `?visible=1`), `src/lib/chat/room-names.ts` + `src/lib/chat/room-names.test.ts` (new), `src/lib/chat/room-routes.test.ts` (new). Depends on W3-1-types; consumes (same wave, pinned in 4.2) the memory trio from `rooms.ts`.
- Builds 4.2's four route bullets (GET / POST channels, PATCH, the roster) and `room-names.ts` (4c.3).
- Agent: `room-routes.test.ts`, in the style of `reads-routes.test.ts` (stubbed clients): GET, first select fails 42703 and the second succeeds -> every row still carries `kind`, no event room is listed, no row has `post_policy`; GET, both fail -> the bare read; POST with no `post_policy` or with `everyone` -> the insert row has no `post_policy` key and the returning select is today's string; POST `officers` when the insert fails as missing schema -> 503 `try_again` and NO second insert; the 6th room -> 409 `room_limit`; no count is made when `hasRoomKinds` is false; the gate order is rate limit, publish gate, body, name rule, officer guard, cap (read from the code and asserted by call order); PATCH `post_policy` on a Lounge -> 409 `room_locked`; PATCH on a missing column -> 503 `try_again`; the roster without `visible` is today's list; with `visible=1` it leaves out the blocked ids; a failed block read -> 503. `room-names.test.ts`: the examples of 4c.3, a slug round trip, and `roomDisplayName` applied twice equals once.
- Walk: creating a 6th extra room answers the `room_limit` sentence (part C2); a switch-off laptop's Campus > Chat rail lists the same rooms as before the build, with no event chats (part F).

**W3-2-pinroutes Pin and shared routes, and the hook.** Owns `src/app/api/me/threads/[id]/message-pins/route.ts`, `src/app/api/me/threads/[id]/messages/[messageId]/pin/route.ts`, `src/app/api/me/threads/[id]/shared/route.ts`, `src/lib/chat/pins-read.ts` (server-only mappers: rows -> `PinnedMessage[]` / `SharedItem[]`, written so a test can call them with plain objects), `src/lib/chat/pins-routes.test.ts`, `src/lib/chat/use-message-pins.ts` (all new). Depends on W3-1-types, W3-1-pinsdb.
- Builds 4.3 and 4d.4.
- Agent: `pins-routes.test.ts` in the style of `remove-route.test.ts` (stubbed clients and gates): the exact gate ORDER of each route; flag off 404; a club room 400 `pins_chats_only`; a pending request 403; a blocked pair 403 on PUT and allowed on DELETE; the cap (20 -> 409; re-pinning an already pinned message at the cap -> `already`); a message of another chat 404; a cleared message 404; a missing table 404; the list drops removed and cleared rows, is newest pin first, and carries `full_text` whole while `text` is cut at 140; `shared` proxies `media_url`, skips a media-less row whose post is gone, sets `has_more`. The routes import only `chatV2For` from `flag-server`.
- Walk: section 10 part E.

### Wave 3: the pieces (nothing mounts them on desktop until waves 4 and 5; on the phone, `chat_v2` screens change as 2.5 row 10 says)

**W3-3-thread The thread's desktop form.** Owns `club/RoomChips.tsx`, `club/RoomComposer.tsx`, `club/RoomThread.tsx`, `club/HoverActions.tsx` (new), `club/helpers.ts`, `club/helpers.test.ts`, `src/components/mobile/messages/MessageBubble.tsx`, `src/components/mobile/messages/ReactionPicker.tsx` (one `export`), `cards/CardBubble.tsx`. Depends on W3-1-types (`surface.ts`, `SpaceRoom.locked`, `post_line`), W3-2-roomroutes (`roomDisplayName`); consumes (same wave, pinned in 6.3) `CardTrayProps.anchorRef`.
- Builds its rows of 6.3, all of 6.4, and of 4c.3 / 4c.4: `chipLabel` / `chipAriaLabel`, the lock rule, the megaphone (both surfaces), `shownName`, the `post_line` tile and `room_posters_only` in the refused-send list.
- Agent: in every file the new behaviour is inside `surface === "desktop"` except the both-surface items 6.3 names (lock rule, megaphone, `post_line` tile, `room_posters_only`, `shownName`); `use-room-poll.test.ts` passes untouched (the two pinned `RoomChips` lines are intact); `helpers.test.ts` updated on purpose and green, `:159-163` unchanged; `use-room-poll.ts` not edited; the desktop `<nav>` of `RoomChips` has no `borderTop` and no side padding; `HoverActions` hides with `opacity` and `pointer-events` only (grep: no `display: "none"`, no `visibility` in the file), the wrapper is the one Tab stop, the buttons are `tabIndex={-1}` with the three names of 6.5, and its Esc is stopped; `RoomThread` mounts `HoverActions` only on the desktop surface; `ReportSheet` is `variant="modal"` without `nested` there; Calm.
- Walk: section 10 part C on desktop (hover toolbar, selection, slow click), part H (the toolbar by keyboard), part G on the phone (chips at 375px with the megaphone, the lock on a private room, room names as words).

**W3-3-forms Sheets become dialogs and popovers.** Owns `club/BoardView.tsx`, `club/BoardPost.tsx`, `club/RsvpSheet.tsx`, `compose/CardSheet.tsx`, `compose/CardTray.tsx`, `cards/EventCardView.tsx`. Depends on W3-1-types (`surface.ts`), W3-1-prep (`DesktopDialog`, `DesktopPopover`).
- Builds its rows of 6.3: the Announcements line and the modal `ReportSheet` in `BoardView`; the Board "..." (both surfaces, owed L3); `CardSheet` and `RsvpSheet` inside `DesktopDialog`; `CardTray` inside `DesktopPopover` (with `anchorRef`); `emitCalendarChanged()` after an RSVP; `room_posters_only` in `CardSheet.tsx:104-110`.
- Agent: the phone surface of `CardSheet`, `RsvpSheet` and `CardTray` renders today's nodes (read the diff: the old JSX is intact in the phone path); no `Drawer.NestedRoot` is reachable on the desktop surface (read `CardSheet`, `RsvpSheet` and `BoardView`'s `ReportSheet` mount); the three card sheets, `ComposeSheets` and the three card views are not edited; on the desktop surface `CardTray` draws no scrim, its background is `t.surface` (the literal `#1C1A1A` is only in the phone path), its popover's `anchor` is the "+" and focus returns there; `BoardPost`'s "..." has `aria-label="More"` and opens Report (not on my own) and Remove (`can_moderate`, not my own); Calm.
- Walk: section 10 part C on desktop (the three card dialogs, the "+" popover, the RSVP dialog, the Board "..."), part G on the phone (the "+" tray and its three sheets still slide up, the RSVP sheet, the Board "...").

**W3-3-bridge The dm bridge.** Owns `public/html/messages.html`, `public/html/_miniMessenger.js` (one line in `CHAT_REFUSALS`), `dm/LegacyThreadPane.tsx` (new). Depends on W3-1-pure (`dm-bridge.ts`, `contracts.ts`), W3-2-pinroutes (the routes the page calls).
- Builds 5.1, 5.2 (sixteen items), 5.4.
- Agent: `theme.test.ts`, `reaction-emoji.test.ts`, `failure-copy.test.ts` green; line 4 of the page and its three PWA head lines unchanged; `grep -n "IS_PANE\|vibe-pane"` accounts for every new branch, and the only new things that exist without it are 5.2 item 10's two lines and the inline-hidden `#cPinsBtn`; no global function renamed (`git diff` shows no removed `function` line); the CSS block is 5.1's word for word, and the report lists each new declaration that overrides an existing `!important` rule (each carries `!important`); `src/proxy.ts`, `public/sw.js` and `public/html/_postViewer.js` are not edited (`git diff` empty); the report lists every caller of `history.pushState` / `replaceState` / `back` in the page and its scripts and shows none is reachable in pane mode; the 30-second timer's body outside pane mode is today's; `LegacyThreadPane` keeps its `message` listener after the 8 s line and clears the line on a late `ready`; Calm (the flash colour is a CSS variable).
- Walk: section 10 part D; `node scripts/check-pwa.mjs` against `next dev` (it makes requests to `http://localhost:3000`, so it is a Walk item, run by the orchestrator).

**W3-3-campus Campus > Chat leaves the desktop.** Owns `src/app/campus/page.tsx`, `src/app/campus/CampusSwitch.tsx`, `src/app/campus/campus-home.tsx` (edits capped at about 150 lines in total; the file is 17,286 lines: grep, then read ranges). Depends on W3-1-switch (`chatDesktopFor`, `enforceCampusAccess`'s return), W3-1-types (`post_line`). No dependency on the other batches of this wave.
- Builds section 7.
- Agent: with `desktopChat` false, `CampusHome`'s diff changes no executed line except the `post_line` one (read it); `CampusMobile.tsx` not edited; `npx eslint src/app/campus/campus-home.tsx` still 6 warnings, 0 errors; `redirect` is imported from `next/navigation` and called before any JSX.
- Walk: section 10 part F. (Until wave 4 lands, a switch-on laptop on the local branch is redirected to a `/messages` that is still the stub: expected, nothing is deployed between waves.)

### Wave 4: the shell, the home, the phone's pins

**W3-4-shell The shell and its state.** Owns `dm/MessagesDesktop.tsx`, `dm/use-desktop-open.ts` (new), `dm/ClubPane.tsx` (placeholder), `dm/PinsPanel.tsx` (placeholder). Depends on W3-1-switch (the stub it replaces), W3-1-pure, W3-1-prep (`useHomeData`), W3-3-bridge (`LegacyThreadPane`, a real file by now); consumes (same wave, pinned in 3.3) `WeekBand`, `InboxWide`, `SlimList`, `NewChatDialog`.
- Builds 3.2 and 3.5 whole (ten rules); the `?to=` rule; the `CALENDAR_CHANGED_EVENT` listener and `emitCalendarChanged()`; `contentWidth`; the `refreshKey` bumps of 4.1; the shell's reactions of 5.4 (with `lost`, `escape`, `info-opened`); the frame's mount rule (both list reads settled, or the address names a chat); `OpenChat` for the slim list (from the lists, else from `ClubPane`'s `onOrg` or the page's `opened`); the Pinned panel's open state (closed on every change of `open`, closed by `info-opened`) and its `panelMode` with width 288; the resolving skeleton (CSS variables only); the toast calls (`toast` from `@/lib/feedback/toast`, as the phone shell).
- Agent: no `router.push` / `router.replace` / `useRouter` in either file; every `history.pushState` / `replaceState` / `back` sits inside `clearLayersThen` or `clearLayersInto` (rule 6's filter write excepted); the `popstate` handler's first line is the `isLayerPop` return; `homeBelow` is set true in BOTH branches of rule 2's callback; the Esc listener follows rule 9's order and does nothing while a layer is open; `useHomeData` is called exactly once under `dm/`; `onThreads` is a stable callback; `LegacyThreadPane` is rendered once the two list reads have settled OR at once for an address that names a chat, never behind "the lists answered"; Calm.
- Walk: section 10 parts A, B, F (history), H (Esc).

**W3-4-week The band and the month.** Owns `dm/WeekBand.tsx`, `dm/MonthPopover.tsx` (both new). Depends on W3-1-pure, W3-1-prep (`MonthBody`, `DesktopPopover`).
- Builds the band. Full: the title button with a chevron that opens the month, Previous / Next week buttons always drawn and disabled at the bounds, the `This week` pill when the offset is not 0, seven day buttons packed with a 2px gap and their dots and labels from `home-rules`, cards 50px tall with two lines per `weekCardLine` and the club's name, `bandFit(bandWidth, fixedWidth, count)` with BOTH widths measured by one `ResizeObserver` (the band's box and its left block) + the `+N` chip that opens the month, the empty line and `Find events`, the failure line with Retry, three grey cards while loading, the week slide. Folded: the title button, then `<line text> <title>` links on one line, cut with `+N`; the live item is flat text with a plain coral dot. Cards and folded items are `<a href="/messages?channel=<room_id>">` that cancel ONLY a plain left click (Cmd / Ctrl / middle click open a tab) and are plain text when `room_id` is null. The month popover (6.2). Every word and spoken name is 6.5's (group label by `weekWord`, the two empty lines, the arrows, the pill).
- Agent: neither file imports `vaul`, `MonthSheet` or `YourWeek`; no `position: fixed` except through `DesktopPopover`; no `560` constant feeds `bandFit`; the live card's glow is drawn only when `folded` is false; the 6.5 strings appear exactly, and `weekWord` / `weekTitle` / `weekSpoken` / `weekRangeAt` are imported, not re-written; Calm.
- Walk: section 10 part A (this week and another week at 1024 and 900).

**W3-4-lists The lists and New.** Owns `dm/InboxWide.tsx`, `dm/SlimList.tsx`, `dm/NewChatDialog.tsx` (all new). Depends on W3-1-pure, W3-1-prep (`HomeData`, `HomeSkeleton`, `FILTER_LABEL`, `LIST_LABEL`, `DesktopDialog`).
- Builds the wide list: title `Messages` in SERIF, the search button and field (6.5; Esc clears, then closes the field), `New`, the four filter pills as 6.5's tablist with the two counts from `allBadgeCount` / `badgeText` and the requests count, the list switch of `MessagesHome.tsx:360-425` built from `ClubRow`, `PersonRow`, `ThreadRow`, `HomeEmpty`, `HomeSkeleton`, `LoadFailed`, and `EmptyState` for requests only (6.5), in a column that scrolls by itself; hover and focus styles from a wrapper `<style>`; no fixed bottom fade. The slim list: the `Messages` control with a back chevron, `aria-label="Messages. Show the full list"`; a `<nav aria-label="Pinned and unread chats">` of 44px `<a>` rows: a 26px mark, the name on one line, the dot; the open row highlighted with `aria-current="page"`. New: a `DesktopDialog` with 6.5's words: suggested people, search, pick one or several, the group name field once two are picked, `Message` / `Create group`.
- The group rule in New (a group may only hold the creator's connections, `threads/route.ts:267-278`): the first time a second person is picked, read `GET /api/me/connections` (all pages, once, kept for the dialog's life). While two or more are picked: in the lists a person who is not a connection is shown unpickable (`aria-disabled`, the line of 6.5 under the name); an already-picked person who is not a connection gets the same line and `Create group` is disabled until they are removed. A `not_connected` refusal names the people from its `not_connected` ids (6.5's sentence) and keeps the dialog open. If the connections read fails, nobody is greyed out and the refusal's sentence is the safety net.
- Agent: none of the three files imports `vaul`; no `position: fixed` except through `DesktopDialog`; row components are imported, not copied; the string "tap" appears in none of the three files; the 6.5 strings appear exactly; Calm.
- Walk: section 10 parts A and B (a group with a non-connection).

**W3-4-phonepins The phone's pins and the old-screen line.** Owns `src/components/mobile/messages/ConversationView.tsx`, `src/components/mobile/messages/MessageBubble.tsx`, `src/components/mobile/messages/ReactionPicker.tsx`, `src/components/mobile/messages/ConversationActionSheet.tsx`, `src/components/mobile/messages/PinnedSheet.tsx` (new), `src/components/mobile/MessagesMobile.tsx` (ONE added prop at `:552`: `messagePins`). Depends on W3-2-pinroutes (`useMessagePins`), W3-3-thread (it edited `MessageBubble` and `ReactionPicker` in wave 3: build on that version).
- Builds 4d.6 (with `PinnedSheet`'s title and its own empty line, `full_text` in place for a pin that is further back, and `Unpin from top`), and in `ConversationView.tsx:1108-1112` the `viewer.post_line` line of 4c.4.
- Agent: `grep -n "messagePins"`: passed only in `MessagesMobileV2`; with the prop absent `ConversationView` calls no pin route, adds no `data-mid`, passes no `onPin` and no `onOpenPinned` (read the diff: every new line sits behind the prop, the `post_line` line excepted); `ReactionPicker` and `MessageBubble` draw nothing new without `onPin`; without `onOpenPinned` the chat-level row still reads `Unpin`; the word "Hover" is not in `PinnedSheet.tsx`; `MessagesMobile.tsx`'s diff is one line; `layer-stack.test.ts` green; `PinnedSheet` uses `useLayerHistory` like the other sheets; Calm.
- Walk: section 10 part G.

### Wave 5: the club and the panels

**W3-5-club The club pane.** Owns `dm/ClubPane.tsx` (replaces the placeholder), `dm/EventPanel.tsx` (new). Depends on W3-4-shell, W3-3-thread, W3-3-forms, W3-2-roomreads, W3-2-roomroutes (`?visible=1`); consumes (same wave, pinned in 3.3) `ClubPanel`, `MembersDialog`, `RoomsDialog`.
- The header is ONE row, as the approved board draws it (steps 1 and 2). LEFT: a 40px club mark; the name as a link to `/orgs/<handle>` (`aria-label="Open <club>'s page"`); under it the hat line BY STATE (6.5): a right panel on screen (its mode is `"side"` or `"overlay"`) -> `` `Your hat: ${roleWord(role)}` ``; no panel on screen -> `hatLine(role, space.org.member_count)` and, for owner and admin only, ` · ` + the link `Manage club` (`/campus?manage=<handle>`). So the member count and `Manage club` are never on screen twice, and an officer on a 1024 laptop (panel hidden by default) still has the link. RIGHT, in the same row (`margin-left: auto`, `flex-shrink: 0`, `gap: 6`): `RoomChips` (every room; `onPick` -> `onSwitchRoom(room.id, room.kind)`), the `+` Manage rooms button for owner and admin (4c.5), the panel toggle (`aria-label="Show the club panel"` / `Hide this panel`, `aria-pressed`). When the chips do not fit beside the name they drop to their own row under it, by CSS wrap (no extra measuring); the `+` and the toggle stay top right. There is NO pin toggle (H11).
- Under the header: `BoardStrip` only when no right panel is on screen, the open room is not the Board, and `space.board_latest` is not null (its `onOpen` switches to the Board); a child `RoomView` keyed by `roomId` holding `useRoomPoll(roomId, { enabled: true, initialPage })` and drawing `BoardView` (Board) or `RoomThread` (every other kind) and `RoomComposer` (`viewer`, `viewerId`, `poll` from the hook; `roomKind` from the thread read's `room.kind`, else the prop; `roomName` = the stored name, `RoomComposer` makes it words). `RoomThread` gets `anchor="bottom"` and no `header`, EXCEPT an event chat with no panel on screen: `anchor="top"` and `header={<EventAbout ... />}` (4c.4). The right panel: `EventPanel` when the open room is an event chat (from `poll.room.event`), else `ClubPanel`; panel mode from `panelMode(contentWidth, 320, stored pref, openedHere)`. The faces: one `?visible=1` roster read per club open, mapped as 3.3 says.
- Rules repeated from the phone's `ClubSpace` (not imported, not refactored): the space read and its timers (4.1; `SPACE_REREAD_MS` 20 s); "a later 403 or 404 from the space read -> `onLost(...)`" with the phone's words; an event room whose poll reports `lostAccess` -> toast `You left the event chat.`, `onListsChanged()` and `onSwitchRoom(<lounge id>, "lounge")`; a closed event room opened by link has no chip, shows its thread and the closed tile; a room id that the space does not list and the thread read refuses -> `onLost`. `onOrg(space.org)` after the first space answer. `RsvpSheet` (desktop form) opens from the panels and from `EventAbout`; on change: re-read the space, `poll.reload()`, `onRsvpChanged()`.
- `EventPanel`: the panel chrome (the hide button) around `EventAbout` unchanged (`event`, `night`, `now`, `onRsvp`).
- Agent: `ClubSpace.tsx`, `EventChat.tsx`, `UpNext.tsx`, `EventAbout.tsx`, `use-room-poll.ts` not edited; exactly one `useRoomPoll` call under `dm/`, in the keyed child; no `useRoomPoll` or `/read` call on the Board unless the Board is the open room; no `pushState` / `replaceState` in the file (the shell writes history); the hat line, `Manage club` and `BoardStrip` each read the SAME "panel on screen" boolean; `EventAbout` is mounted in exactly one place at a time (the panel or the thread's header); `Manage club` and the `+` are behind `BOARD_POSTER_ROLES`, not `can_moderate`; no `/pin` call in the file; Calm.
- Walk: section 10 part C (1440 and 1024).

**W3-5-panel The club panel.** Owns `dm/ClubPanel.tsx`. Depends on W3-1-pure (`ClubPanelProps`), W3-2-roomreads (`board_recent`).
- Builds `ClubPanel` (320 wide; sections in order): header `<club> events` + the hide button; the first `space.up_next` event as a FLAT card, no glow (state line from `upNextLine` / `statePillText`, title in SERIF, `location · time`, `N going`, an RSVP pill from `rsvpPill(viewer_status)` that calls `onRsvp`; the card body is a link to its event chat when `room_id` is set), the second as one row (title, `upNextLine`, chevron); for a club with no events one muted line `No events coming up.`; then, unless `activeRoomKind === "board"`, `Announcements` with the megaphone and `See all` (-> the Board): up to three `space.board_recent` posts, each a button (`aria-label` from `postAriaLabel` + `Open the Board`) with the author's mark and name, the role word (`roleWord(author_role)`), `rowTime`, two lines of text or the card's one-line summary (`cardFallbackContent`-style text already in `content`), `N replies` when `reply_count > 0`; a plain coral dot on the newest post only, when `space.rooms`' Board is unread; empty: `emptyLine("board", space.org.name)`; then `Members`: five faces from `faces` (overlapping 28px marks, `aria-label` listing the names "and N more"), `<member_count> members`, `See all` (-> `onSeeMembers`); then, when `onManageRooms` is not null (owner and admin), `Manage club` (a link to `/campus?manage=<handle>`) and `Manage rooms` (`onManageRooms`). A mod sees neither.
- Agent: the panel never fetches (its data is props); no `useRoomPoll`; every string above appears exactly; `Announcements` is not drawn when `activeRoomKind === "board"`; no `can_moderate` in the file; no `boxShadow` glow on the live card; Calm.
- Walk: section 10 part C.

**W3-5-people The members dialog and the room people list.** Owns `dm/MembersDialog.tsx`, `dm/RoomPeople.tsx` (both new). Depends on W3-1-pure (`RosterRow`, `MembersDialogProps`, `RoomPeopleProps`), W3-1-prep (`DesktopDialog`), W3-2-roomroutes.
- `MembersDialog`: `DesktopDialog` titled `Members of <club>`; ONE read `GET /api/orgs/<handle>/members?visible=1` -> `RosterResponse`; a search field (`Search members`); rows = mark, name, `@handle`, the role word, each a link to `/profile/<handle>` (rows with no handle are plain); `LoadFailed` on failure.
- `RoomPeople` (`RoomPeopleProps`): the room's own list from `GET .../channels/<roomId>/members` under `title`, each row with `Remove` (DELETE); `Add someone` opens a searched list of `roster` rows not already listed and not in `skipRoles` (POST `{ user_id }`); `roster === null` shows the list without the picker and one muted line; a refusal shows its sentence; `onChanged()` after each write. It makes no roster read of its own.
- Agent: both files import `RosterRow` from `dm/contracts.ts` and neither declares a row shape of its own; the string `/u/` is in neither file; `MembersDialog`'s URL carries `visible=1`, `RoomPeople` makes no `/members` roster request (only the room's `channels/<id>/members`); Calm.
- Walk: section 10 parts C and C2.

**W3-5-rooms The Rooms dialog.** Owns `dm/RoomsDialog.tsx`, `dm/rooms-dialog-rules.ts`, `dm/rooms-dialog-rules.test.ts` (new). Depends on W3-2-roomroutes, W3-1-prep; consumes (same wave, pinned in 3.3) `RoomPeople`. Build order: the rules and their test first, then the dialog in Edits of at most 150 lines.
- Builds 4c.5 whole except the people lists, which are `RoomPeople` with the three titles of 4c.5; the dialog makes the one unfiltered roster read and hands `roster` down.
- Agent: `rooms-dialog-rules.test.ts`: the line under each kind of room (4c.2's words), the offered post options (three for a public room, two for a private one), the form's validity through `roomSlug` (too short, core names `board` / `lounge` / `officers` refused before the request, 31 characters), the cap line at 5; the dialog calls only the routes of 4c.5; its roster URL has no `visible`; `Board`, `Lounge` have no input; the private-flip confirm exists; Calm.
- Walk: section 10 part C2 (officer).

**W3-5-pins The Pinned and Shared panel.** Owns `dm/PinsPanel.tsx` (replaces the placeholder). Depends on W3-4-shell, W3-2-pinroutes.
- Builds 4d.5's panel on `useMessagePins(threadId, { enabled: true, pollMs: 20000 })` and its own `shared` read with `Show more` (`before` = the last item's `created_at`); a quote opens in place to `full_text` when `missedId` is its message or from `Show all`.
- Agent: every string of 4d.5 appears exactly; `refreshToken` triggers `reload()`; an unpin calls `onChanged()`; `available === false` renders one line `Pinned messages aren't available yet.` and no controls; every control is a `<button>` or an `<a>`; Calm.
- Walk: section 10 part E.

## 9. Tests the build adds (all `src/**/*.test.ts`, `node:test`, the style of `home-rules.test.ts`: pure imports, no DOM)
| File | Batch | Pins |
|---|---|---|
| `src/lib/chat/flag.test.ts` (extended) | W3-1-switch | the desktop switch (2.4) |
| `src/lib/chat/room-rules.test.ts` (extended) | W3-1-types | the five new sentences, `postRuleLine`, `isPostPolicy`, `postRefusal` for rooms |
| `src/lib/chat/cards/rpc-refusal.test.ts` (extended ON PURPOSE) | W3-1-types | the FIVE statuses; a card refused in a restricted room answers 403 `room_posters_only` |
| `src/lib/chat/pin-rules.test.ts` | W3-1-pinsdb | `PIN_CAP`, `pinQuote`, `afterCleared`, `pinnedIds` |
| `src/lib/chat/reads.test.ts`, `reads-routes.test.ts`, `message-read.test.ts` (extended) | W3-2-roomreads | `spaceCanPost` by policy; the space answer's new keys, the select, its fallback and the 5-minute memory of a missing column, `board_recent`; `post_line` |
| `src/lib/chat/room-routes.test.ts` (new) | W3-2-roomroutes | the room list's three-step read (rows keep `kind`, no event room, when only `post_policy` is missing); create and edit with `post_policy`; the cap; the roster's `?visible=1` |
| `src/lib/chat/room-names.test.ts` | W3-2-roomroutes | `roomDisplayName`, `roomSlug` |
| `dm/desktop-rules.test.ts` | W3-1-pure | `knownChat`, `slimRows`, `searchRows`, `bandFit` (this week and another week's wider fixed part), `panelMode`, `chatEntry` |
| `dm/dm-bridge.test.ts` | W3-1-pure | the protocol's guards (with `lost`, `escape`, `info-opened`) and the frame URL |
| `club/helpers.test.ts` (extended) | W3-3-thread | display names on chips and placeholders; the locked label |
| `src/lib/chat/pins-routes.test.ts` | W3-2-pinroutes | the three pin routes and `shared`: gate order, every refusal, the mappers |
| `dm/rooms-dialog-rules.test.ts` | W3-5-rooms | the dialog's lines, options and validity |
| SQL, local only (not in `npm test`): `scripts/sql/chat-message-pins-check.sql`, `scripts/sql/chat-room-post-policy-check.sql` | W3-1-pinsdb, W3-2-roomsdb | the tables, grants, trigger and the three policies by behaviour |
Tests that must stay green UNTOUCHED: `use-room-poll.test.ts`, `layer-stack.test.ts`, `home-rules.test.ts`, `week.test.ts`, `when.test.ts`, `theme.test.ts`, `reaction-emoji.test.ts`, `payload.test.ts`, `cards/routes.test.ts`, `remove-route.test.ts`, `threads-list-route.test.ts`, `group-rules.test.ts`, `pair-block*.test.ts`. (`rpc-refusal.test.ts` is NOT in this list: its four-row assertion at `:54` must change with the type.)

## 10. The browser walk (the orchestrator; after wave 5's gate; everything here is DEFERRED from the batches)

Setup: the local stack with both migrations applied; `node scripts/local-seed.mjs` and `node scripts/demo-seed.mjs` re-run THAT day (event states follow the seed's clock); `.env.development.local` with `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<avery, blake, casey, emery ids>`, `CHAT_DESKTOP_ENABLED=true`, `CHAT_DESKTOP_ALLOWLIST=<avery, blake, casey ids>` (emery = `chat_v2` on, desktop off; drew or a demo account = both off); restart `next dev` after any env change; sign in with `node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs <who>` and prove who is signed in with `GET /api/me/profile-bootstrap`; reload the tab before judging (a static page edit does not hot-reload). Sizes: 1440, 1280, 1024, 900 wide (desktop) and 899 (the phone tree must appear). Night first; then parts A, C, D and E are REPEATED IN LIGHT at 1440 (A also at 1024). In Light look hard at the known Night-only literals and the new surfaces: the "+" popover (`CardTray`), the event hero and pill (`EventAbout`), the pinned-row flash, the hover toolbar, both right panels, the focus rings. On every screen also check the calm rules of 3.2: at most one glow, nothing twice. `node scripts/check-pwa.mjs` is run here, against `next dev`. Clubs: `sae` (the extra room `events`, the Officers room `exec`), `chat_seed_club` (cards, three event-chat states).

**A. Home (blake, 1440, Night then Light).** `/messages`: left nav and My Calendar unchanged; the band with title, two arrows, seven days, cards; the wide list; the empty stage line. Click each filter (address `?tab=`; refresh keeps it). Search a club and a person; Esc clears. Previous / Next week, `This week`, the bounds disable the arrows. Title and a day open the month popover; pick a day in another week (the band moves); Esc, outside click and Back each close it. A card with a room opens its event chat; Cmd-click opens a tab. At 1024 and 900: cards give way to `+N`, nothing overlaps, no horizontal scroll; then press Next week at 1024 and at 900 (the title grows and the `This week` pill appears): still no overflow and no cut card. The live card in the band is the ONLY glow on the home. With no chats: the wide list's own line, no "tap". The empty band reads `Nothing on your week yet.` on this week and `Nothing that week yet.` on another.
**B. Opening and switching.** Click a club row: the list tucks to 232px, the band folds, the address is `?channel=<id>`. Click three other names: Back returns to the home in ONE step. The Messages control returns home. Paste `/messages?channel=<lounge id>`, `<board id>`, `<event room id>`, `<dm id>`, `<exec room id>` in a new tab: each opens straight into the open state; the Messages control then goes home in place; Back leaves the page. A bad id: home + a toast. `/messages?to=<handle>` for an existing dm and for a new person: the address becomes `?channel=`. Refresh in every state. New: one person (dm), three people with a name (group); the new chat opens and shows in the slim list; then pick one connection and one person who is NOT a connection: the second is unpickable with the line `Group chats are for people you're connected with.` (and, picked first, blocks `Create group` until removed). The dead-Back check, twice: from the home open a chat from a plan row inside the month popover, press Messages, press Back ONCE: the page is left (not a second home); the same after opening a chat made in New. With a chat open and nothing else: Esc goes home. Drag the window across 900px with a chat open: the other tree opens the same chat.
**C. A club (blake = member, casey = mod, avery = owner; `chat_seed_club` and `sae`).** Header in ONE row: mark, name, hat line at the left; chips, the `+` (avery), the panel toggle at the right, with no stray hairline above the chips; chips for every room; the megaphone on Board; the lock on Officers (avery) and on a private extra room; with many rooms the chips drop under the name and wrap. Hat line with the panel shown: `Your hat: Member`, no count; with the panel hidden: `Your hat: Member · 48 members`, and for avery ` · Manage club` (not for casey, a mod). Lounge: send, reply, react, hover toolbar (React, Reply, "..."), Report opens a centred dialog, Remove (casey) confirms; text can be selected; a slow click does not open the phone picker. "+": a small popover anchored to the "+" (about 320 wide, three rows, the thread NOT dimmed, the caption with the room's name as words; Esc and an outside click close it and focus returns to "+"); Poll, Sign-up, Event each open a centred dialog and post; vote; RSVP from an Event card (My Calendar and the band update). Board: the Announcements line; member sees the Board tile; officer posts; "..." on a text post and on a reply (Report, Remove); replies fold. Panel: first event card with the RSVP pill (opens the RSVP dialog; changing it updates panel, thread, band, My Calendar), second event row, Announcements (three posts, the dot on the newest when unread, a click opens the Board, and seeing them did NOT clear the Board's dot: check the home row), faces, `See all` (members dialog, search, rows open `/profile/<handle>`), `Manage club` and `Manage rooms` (avery only: Manage club lands on Campus with the settings modal open; casey, a mod, sees neither). Block casey as blake (by hand): casey is gone from blake's faces row and members dialog, and still listed for avery in the Rooms dialog. The panel's live event card does not glow; the folded band's live item is flat text with a plain dot. Hide the panel: the Board strip appears; show: it goes. With the Board open the panel has no Announcements. Event chat: its chip selected, the right panel shows Where, When, Who's going, RSVP; "Not going" leaves the chat with the toast and lands on the Lounge; a closed event chat by link shows the closed tile. At 1024 and 900 the panel opens as an overlay only on a click; and at 1024, an event chat with the panel NOT opened shows Where, When, Who's going and the RSVP button at the top of the thread (never nowhere, never twice once the panel is opened). In an event chat exactly one thing glows (the event block's live mark).
**C2. Rooms dialog (avery, owner of `chat_seed_club`: emery admin, casey mod, blake member; local `sae` has only avery, so it is used for looking at the seeded extra room `events` and the Officers room `exec`).** Create `Study Group` (saved as `study-group`, public, everyone); make it `Only officers`: blake and casey (a mod is not an officer for posting) see the thread and the line `Only officers post here.`, cannot send, CAN vote on a poll avery posts there; emery (admin) can post; make it `Officers and people you pick`, add blake: blake can post, casey reads the line `Only officers and people they picked post here.`; make it private (the confirm), add blake: only blake and the officers see the chip, with the lock; casey no longer sees it; delete it. Officers room: add and remove casey under "Also in this room" (casey sees the Officers chip while listed). Create rooms up to five: the sixth shows the `room_limit` sentence. On an OLD screen (take blake out of `CHAT_DESKTOP_ALLOWLIST`, restart, open Campus > Chat on a laptop) a room blake may read but not post in shows the server's sentence, not "This chat is closed."
**D. A dm and a group (blake with avery).** No right panel; theirs left, yours right, the composer spanning; one coral cursor (not two) at 1024 and 900; typing dots, "Read", @mention picker, delete your own, photo upload, reply, Chat info (Pin chat, Mute, Clear, Delete), a message request's Accept / Decline (the list refreshes; decline goes home). A message arriving while the chat is open does not light its row after switching away. Switching between two dms is instant (no reload flash, Night). Tap a shared post: it opens in a NEW tab and the chat stays as it was; back in the chat press Messages, then Back once: the page is left; open Chat info, click another name in the slim list: the next chat opens with no panel left over it. Switch quickly A -> B -> A -> B with a throttled network: the chat on screen is always the last one clicked. As avery remove blake from a group blake has open (and, separately, make the read answer 404): blake lands on the home with `That chat isn't available anymore.`, never a blank pane. Go home and wait 10 s: the network tab shows no 2-second thread reads. Kill the frame's load (block the URL) -> the Retry line after 8 s; with "Slow 3G" instead, the line may show and then clears by itself when the page says ready. Make `/api/me/inbox` fail (block it) and paste a dm link: the chat still opens.
**E. Pinned and Shared.** Hover a message: the pin button; pin a text, your own photo, a shared post; the header button opens the panel (side at 1440, overlay at 1024); newest pin first; click a quote: the thread scrolls and flashes; unpin from the panel and from the pill (both stay in step); pin 20, the 21st shows the `pin_limit` sentence; a pin older than the loaded 50 shows "That message is further back in the chat." and opens to its whole text in place; a long pin has `Show all`; with the panel open, open Chat info: the panel closes; open the panel again: Chat info closes (never two right panels); delete a pinned message: its pin goes; as the other person (avery) the same pins show; Shared lists photos, videos, posts, `Show more`; "Clear chat history" as blake hides old pins and shared items for blake only; block avery as blake (by hand): Pin is refused with its sentence, Unpin works; a pending request shows no pin controls; a club room has none.
**F. Campus and links (avery; then a switch-off account).** No Chat tab on `/campus`; `/campus?tab=chat` and the club page's room links land on `/messages[?channel=]`; Back from there returns to the page before, not to Campus > Chat; `/campus?manage=sae` opens the settings modal over the Feed. Switch-off laptop (emery): `/messages` is today's full-page iframe (no pin button, the list column present, the address loses `?channel=` as today), `/campus` has the Chat tab and rails (the same rooms as before the build, no event chat in the rail, the list still refreshing with no chat open), `/campus?manage=sae` does nothing. Signed out, `/messages?channel=<id>`: after sign-in the same chat opens.
**G. The phone (375px; emery and blake = `chat_v2` on; a both-off account).** This part is 2.5 row 10, item by item; Franky repeats it on a real phone after the first deploy (4b.3 step 2). `chat_v2` on: the home, the month (W3-1-prep's list), a club (the megaphone on the Board chip; do Lounge, Board, Officers and one event chip still sit in 375px without scrolling? If not, record it: the fix is to make the megaphone desktop-only; the lock on a private extra room; an extra room reads as words on its chip, in the composer's placeholder, in the "+" tray's caption and in a card sheet's room line; the who-can-post line in a restricted room; the Board "..."; the "+" tray is today's in-flow tray and its three sheets slide up; RSVP sheet; Report sheet), a dm: long-press -> `Pin message` / `Unpin message`; chat info -> `Pinned messages` -> the sheet titled `Pinned messages`, empty: `Nothing pinned yet. Press and hold a message to pin it.`; tap -> scrolls, or opens the whole text for a message further back; `Pin to top` still pins the chat and then reads `Unpin from top`. `chat_v2` off: the old list and the old conversation exactly as before: long-press shows no Pin, chat info has no Pinned row and still says `Unpin`, a club room shows today's line.
**H. Keyboard only (blake, then avery; 1440; Night and Light; no mouse).** Tab order: the band (title, arrows, days, cards), the list (search, New, filters, rows), then the open chat, then the right panel; every stop has a visible focus ring in both themes. Home: Enter on a row opens it. Esc order with a chat open: a dialog or popover closes first and the chat stays; a second Esc in a text field only leaves the field; the next Esc goes home; the same from INSIDE a dm (focus in the frame): Esc closes Chat info first, then leaves the composer, then goes home. Focus returns to what opened it for every dialog and popover: New, the month (to the title), the "+" popover (to "+"), a card dialog, RSVP, Report, Members, Rooms. A club thread: Tab lands on a message (one stop per message), Enter opens its toolbar, Left / Right move, Enter on React / Reply / More works, Esc returns to the message WITHOUT closing the chat. A dm: Tab reaches a message, its pill shows, the pin button pins; the header's three buttons speak `Open <name>'s profile`, `Chat info`, `Pinned and shared`. The Pinned panel: every quote, Unpin, Show all and tile is reachable and works with Enter. The search button speaks `Search your chats`; the filters are a tablist.
Record every pass and failure in `handoffs/chat-redesign/wave-3-desktop/walk.md`.

## 11. Out of scope, known limits, after launch

Not built here, by decision:
- The React rebuild of the dm thread; retiring `messages.html` and the Campus rails for switch-off people; restyling the dm hover pill to the picture's four icons.
- Jumping to a pinned message older than the loaded 50 (call 1 in 1.4). The server is ready: the thread GET already pages with `?before=<iso>` (`messages/route.ts:74, :108`); what is missing is paging in the old page, which has none (`:2372` is its only thread read), or the React thread. Until then the panel shows the pin's whole text in place.
- Pinning a club from the new screens (H11; a club pinned earlier stays pinned). Opening a shared post in place inside a dm on desktop (it opens in a new tab, 1.3 K2). One Tab stop for a whole club thread with arrow keys between messages (this build: one stop per message). The Rooms dialog's roster is not filtered by blocks, on purpose (1.3 K4), and neither is the roster in Campus settings.
- Also not built: `?m=<id>` links; "Shared" on the phone; pins in club rooms (the table already allows them).
- Unread marks, mute and mark-read on the Officers room and private rooms (they hold no membership row; wave-2 contract 14.36), and the home / slim list lighting for ANY room other than Board, Lounge and event chats. This is call 3 in 1.4: the exec-only room Franky asked for by name gives officers no sign that someone wrote in it. The smallest fix, after launch: a membership row for each person who may enter such a room (one small migration), which gives the chip its dot and lights the club's row; it covers both.
- A phone screen to create or edit rooms; reordering rooms; a per-person "read only" inside a private room.
- Otto's "mentioned you in a chat" opening the room (needs `channel_id` on `/api/me/notifications`); the club-chat mention push opening the room; the profile chat bubble's Expand for groups and rooms.
- The owed old-screen fixes: M3 (`peer: null` unless dm), M4 (Clear on club rooms), M5 (`/read` in Campus > Chat) as ONE separate small batch before the Oct 15 freeze if Franky wants them; M8 and I3 accepted for switch-off laptops; M2 its own migration and its own yes.
- `GET /api/me/threads`'s `can_post` guess for extra rooms (old lists show the composer until the thread read corrects it).
- Old words inside the Campus settings modal ("Channels", "Create a channel") reached through `Manage club`.
- Merging `use-desktop-open.ts` with the phone's open-state code; moving `useHomeData` to its own file; a second `CHAT_DESKTOP_CLUBS` list.
Flag-off surface this build adds to the Oct 15 freeze list: 2.5 rows 1, 6 and 9 (the redirect's `next=`, the inert `post_line` line on three old screens and the new refusal code in two static tables, the room cap and create rate limit). Everything else is behind `chat_desktop` or `chat_v2`. Not flag-off but live: 2.5 row 10, the changes founders and SAE get on the phone with the deploy; it goes on the same list so the freeze walk covers it.
