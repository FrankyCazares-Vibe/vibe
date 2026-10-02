# Desktop chat revamp: scoping notes (S72 prep)

Started Fri Oct 2, 2026. Read-only research. Notes appended as I go.

## 0. Task
Scope the desktop version of the chat redesign (Option 3: one inbox, Your week, club spaces, cards).
Phone V2 is live behind chat_v2 (founders + SAE). Everyone on Mon Oct 26. Freeze Oct 15.

## Short answer
- No desktop chat mockup exists. Desktop today = the old Messages page (an iframe) + the Discord-style Campus > Chat. The flag changes nothing on desktop.
- Cards show as plain text on a laptop, event chats cannot be opened, Board replies never show, there is no Your week.
- Recommend Layout A (one inbox, three columns), built behind a separate desktop switch, aiming for Oct 26 with a go / no-go on Fri Oct 23. The full retirement of the old pages follows after launch.
- Sections: 1 docs, 2 audit bugs, 3 desktop today, 4 gaps, 5 reuse, 6 design, 7 wave plan, 8 decisions, 9 risks.

## 1. What the handoff docs say about desktop (read Oct 2)

- **No desktop chat mockup exists.** `handoffs/chat-redesign/boards/` holds 26 boards, all phone (ChatA/B/C, R2_*, R3_Month, R3_NextWeek, W0_*). `canvas-v20.json` has only two desktop boards and neither is chat: `FeedDesktopNight` and `ProfileArrangeDesktop`. `wave-plan.md:73` listed "desktop Messages (3 columns) Light + Night" as a wave-0 canvas job. It was never drawn.
- **The standing decision (Franky, S69, `wave-0-decisions.md:18`, call 9):** "desktop Messages rebuilt as a three-column React page", AFTER launch. Nothing built. "He can change any before we start."
- **The original plan (`wave-plan.md:98-99`, Wave 4):** React desktop Messages, 3 columns: inbox + Your week | room | club/event panel. Retire the `messages.html` iframe AND the Campus > Chat three-rail grid in `campus-home.tsx`. Keep `/messages?to=` and `?channel=` working.
- **The critic's warning (`plan-critique.md` #19, lines 281-292):** wave 4 underestimates what `messages.html` carries: requests, group settings, photo cropping, report and block, mentions, post sharing (it loads 9 helper scripts). The mini messenger on `profile.html` depends on `/api/me/threads`. Removing the Campus rails removes desktop's ONLY way into `OrgSettingsModal` (members, requests, followers, delete club). The officers' "Message all (N)" duplicates event rooms. Its ruling: move wave 4 after launch; give `OrgSettingsModal` a home on the org page before the rails go.
- **Contract (`wave-2-contracts.md`):** line 159 "Desktop is untouched: `MessagesSwitch.tsx:39-66` keeps the `messages.html` iframe and never asks the flag." Section 12.2: old renderers show a card as a text bubble (its fallback text). Section 12.3: desktop keeps 2-second polling. Section 15: "the React desktop Messages page and the retirement of `messages.html`, `_miniMessenger.js` and Campus > Chat on desktop" = after launch.
- **Freeze rule (13.0):** Oct 15 freezes the flag-OFF surface only. "flag-gated fixes may still deploy". So a desktop V2 behind `chat_v2` is allowed after Oct 15, as long as flag-off desktop does not change.
- **Research sketch (`research.md:262`):** three columns: inbox (clubs + DMs) -> the room (Board card docked on top) -> a club panel (Up next, Board history, People, club profile link). No icon rail. Room chips above the messages.

## 2. Known desktop bugs from the S71 audit (`handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md`)

- M3 (line 202): chat bubble shows a random member's face on a club room; Expand opens a DM with that person.
- M4 (210): "Clear chat history" on a club room does nothing and the confirm talks about the room as a person.
- M5 (216): desktop Campus > Chat never marks a club room read. `ChannelChat` has no `/read` call.
- M8 (240): Campus > Chat has no Report or Delete; Officers room opens nowhere else on desktop.
- I3 (542): desktop cannot open an event chat or a Board reply. A mention there leads nowhere. Hits real users from Oct 26.
- L7 (306), L8 (316), L9 (322), L26 (458), L27 (466), F63 (1842): wrong copy, wrong avatars, old channel wording.

## 3. What a desktop user sees today (code evidence, Oct 2, main = fa3348c)

**How phone vs desktop is chosen.** `src/lib/use-is-mobile.ts:14`: one breakpoint, 900px (`MOBILE_BREAKPOINT_PX`). Under 900px wide = the phone tree, at 900px and up = desktop. It is the window width, not the device. So a laptop window dragged narrower than 900px shows the phone chat (V2 if the flag is on).

**Desktop has three separate chat surfaces, none of them reads `chat_v2`:**

1. **`/messages`** = `src/app/messages/MessagesSwitch.tsx:39-66`: `CampusAppShell` (200px LeftNav + 1fr, `globals.css:2774-2778`) holding an **iframe of `public/html/messages.html`** (3,755 lines of plain HTML/JS, plus 9 helper scripts at `messages.html:15-25`). It never calls `useChatV2`. It lists DMs, groups, requests, and club rooms as if they were group chats (`messages.html:2017` counts `org_channel` as a group). Polls every 2 s.
2. **`/campus?tab=chat`** = the Discord-style grid in `src/app/campus/campus-home.tsx:970` (`72px 240px 1fr`): `ServerRail` (:15220) + `ChannelRail` (:15555) + `ChannelMain` (:15800) + `ChannelChat` (:15960). Still says "Text channels" (:15727), "📌 Pinned" (:15714), `Message #name` (:16784), "#" (:15510), "Discord-style channels" (:17192). Polls every 2 s (:16092).
3. **The chat bubble (mini messenger)** on the profile page: `public/html/_miniMessenger.js` (1,055 lines), loaded by `public/html/profile.html`.

**Flag ON vs flag OFF on desktop: identical screens.** The flag changes nothing on desktop. The only difference is data: once a flag-on member posts a card from a phone, desktop shows it.

**Cards on desktop: fallback text only.** No desktop renderer reads `card` or `kind` (grep of `messages.html`, `_miniMessenger.js`, `campus-home.tsx` `ChannelChat`: zero reads). A poll shows as a plain bubble "Poll: <question>", a sign-up as "Sign-up: <title>", an event card as "Event: <title> · <Thu Oct 8, 7:30 PM>" (`src/lib/chat/cards/fallback.ts:5-9`). Nobody can vote, take a spot or RSVP from a laptop. Contract 12.2 says this is by design for v1.

**Event chats on desktop: unreachable.**
- The old list drops them: `src/app/api/me/threads/route.ts:486` (`r.channels.kind !== "event"`).
- The Campus rail drops them: `src/app/api/orgs/[slug]/channels/route.ts:105` (`kind.is.null,kind.neq.event`).
- A direct link `/messages?channel=<event room id>` lands on "Couldn't open that conversation" (`messages.html:3652-3658`, the channel is not in the list).
- Push links and the phone's week cards all point at `/messages?channel=<id>` (`src/lib/push/payload.ts:322`).

**Your week on desktop: missing.** No week strip, no month sheet. Desktop has a different calendar: "My Calendar" in the left nav (`src/components/LeftNav.tsx:451` `CalendarWidget`, `:720` `CalendarModal`), which reads the same `/api/me/calendar` and also has personal events and an .ics export. It does not link a plan to its event chat.

**The Board on desktop:** shows as one more channel. No folded replies (replies carry `thread_root_id`; desktop never sends `?root=`), no Board strip, no "officers post" framing beyond the quiet line (`campus-home.tsx:16733-16757`).

**Club space on desktop:** does not exist. No Up next, no room chips, no "Your hat".

**More facts checked in code:**
- Board replies are invisible on desktop. The thread read hides replies unless asked with `?root=` (`src/lib/chat/message-read.ts:854-855`), and no desktop file sends `?root=`. A laptop user sees the officer's post and never the replies.
- Desktop Campus > Chat never marks a room read: `grep -c "/read" src/app/campus/campus-home.tsx` = 0 (audit M5).
- Club settings (members, requests, followers, rooms, delete club) open ONLY from the Campus > Chat rails on desktop: `OrgSettingsModal` is mounted at `campus-home.tsx:1050` and nowhere under `src/app/orgs/[handle]/`. So the rails cannot simply be deleted.
- The club page's room links still point at the old place: `src/app/orgs/[handle]/ChannelsSection.tsx:314` -> `/campus?tab=chat&org=&channel=`.
- Otto "mentioned you in a chat" goes to a bare `/messages`: `src/components/network/OttoSidePanel.tsx:961`, `public/html/_otto.js:881`.
- The iPhone app is iPhone only (`mobile/ios/App/App.xcodeproj/project.pbxproj:351,374` `TARGETED_DEVICE_FAMILY = 1`), so Apple's reviewer never sees the desktop tree. Android tablets and foldables at 900px or wider DO get the desktop tree inside the app (`handoffs/wave-plan-pwa/critic-s2s3.md:163`).

## 4. Gaps: desktop vs phone (flag on)

| Thing | Phone (flag on) | Desktop today |
|---|---|---|
| One inbox (DMs + groups + clubs) | Yes, with All / Chats / Clubs / Requests | Two places: Messages page and Campus > Chat |
| Your week strip, swipe, month sheet | Yes (17.11) | None. A separate "My Calendar" in the left nav |
| Club space (Up next, room chips, Your hat) | Yes | None. Discord rails with "#", "Text channels" |
| Board with folded replies | Yes | Post shows, replies never show |
| Event chats | Yes | Cannot be opened at all; deep link dead-ends |
| Polls, sign-ups, event cards | Real cards, vote / take a spot / RSVP | Plain text "Poll: ...", no action |
| "+" tray (new poll, sign-up, share event) | Yes | None |
| Officer / mod Remove | Yes | None in Campus > Chat (audit M8) |
| Report a message | Yes | Messages page only, not Campus > Chat (M8) |
| Mark read | Yes | Not in Campus > Chat (M5) |
| Club room avatar | Club gradient / logo | Group icon, or a random member's face in the bubble (M3, L26) |
| Polling | 4 s room, 30 s list | 2 s everywhere (heavier) |

**Where desktop is AHEAD of the phone (do not lose these):** in DMs and group chats, `messages.html` has typing dots and "Read" (`messages.html:1529-1538`), an @mention picker (`_mentionPicker.js`), delete your own message, photo cropping (`_imageCropper.js`) and a 2-second live refresh. The phone's React DM view (`src/components/mobile/messages/ConversationView.tsx`) has none of them: no timer at all, no typing, no Read. Rebuilding desktop DMs from the phone view would be a downgrade.

## 5. What is reusable on desktop as is

**Reusable with zero change (not phone-shaped):**
- Every route: `GET /api/me/inbox`, `GET /api/me/threads?scope=chats`, `GET /api/orgs/[slug]/space`, `GET /api/me/calendar`, `GET /api/me/features`, `GET/POST /api/me/threads/[id]/messages`, `POST .../read`, `POST .../cards`, `PUT .../cards/[messageId]/vote`, `DELETE .../messages/[messageId]`. None checks the device. All already gated by `chat_v2` on the server.
- Every pure rule in `src/lib/chat/`: `types.ts`, `room-rules.ts`, `room-state.ts`, `week.ts`, `when.ts`, `page-merge.ts`, `stub.ts`, `cards/fallback.ts`, `cards/body.ts`, plus `use-room-poll.ts` (the 4-second reader with mark-read) and `use-chat-v2.ts`.
- Pure screen rules: `home/home-rules.ts`, `cards/card-rules.ts`, `compose/sheet-rules.ts`, `club/helpers.ts`, `v2-tokens.ts` (palette, Light + Night), `theme.ts` (`useNightTheme`).
- Inner view pieces with no vaul and no history code (checked by grep): `home/ClubRow.tsx`, `home/PersonRow.tsx`, `home/HomeEmpty.tsx`, `club/UpNext.tsx`, `club/RoomChips.tsx`, `club/BoardStrip.tsx`, `club/BoardView.tsx`, `club/BoardPost.tsx`, `club/RoomThread.tsx`, `club/EventAbout.tsx`, `club/ClubEmpty.tsx`, `cards/PollCardView.tsx`, `cards/SignupCardView.tsx`, `cards/EventCardView.tsx`, `cards/card-parts.tsx`, `compose/CardTray.tsx`, `compose/NewPollSheet.tsx`, `compose/NewSignupSheet.tsx`, `compose/ShareEventSheet.tsx`.
- `club/RoomComposer.tsx`: a real form, Enter sends (`RoomComposer.tsx:297-301`). Works with a keyboard.

**Phone-shaped (needs a desktop wrapper or a small switch):**
- Full-screen drawers: `club/ClubSpace.tsx:417-428` and `club/EventChat.tsx:113-124` are vaul `Drawer.Root direction="right"`, `position: fixed; width: 100%`. Desktop needs its own pane components that mount the same inner pieces.
- Bottom sheets: `compose/CardSheet.tsx`, `club/RsvpSheet.tsx`, `home/MonthSheet.tsx`, `ConversationActionSheet.tsx`, `sheets.tsx`. On a laptop a bottom sheet spans the whole window. Need a centered dialog or popover shell.
- History layering: `src/lib/chat/layer-stack.ts`, `use-layer-history.ts` and the `popstate` code in `src/components/mobile/MessagesMobile.tsx:138-213`. Built for Back peeling one full-screen layer at a time. Desktop shows panes side by side and only needs `?channel=<id>`.
- Touch only: long-press for actions (`cards/CardBubble.tsx:160-227`, `MessageBubble.tsx:76-154`), the week swipe (`home/YourWeek.tsx:59-76`). `MessageBubble` already has a visible "..." button for other people's messages (`:559-575`); `CardBubble` and `BoardPost` do not. `YourWeek` already has real Previous / Next buttons but hides them until keyboard focus (`YourWeek.tsx:221`).
- Phone layout numbers: `home/MessagesHome.tsx:430-436, 562-565` (100dvh minus the tab bar, safe-area padding, fixed compose button), `useHideTabBar`.
- `home/YourWeek.tsx` works at any width but its bloom and card row are tuned for 375px.

## 6. Proposed desktop design (in words)

Room to work with: the desktop shell is a 200px left nav + the rest (`globals.css:2774-2778`). On a 1440px laptop that leaves 1,240px. On 1280px, 1,080px. At the 900px minimum, 700px.

### Layout A (RECOMMENDED): one inbox, three columns

This is the phone's Option 3 with more room. It is also what Franky already accepted as call 9 (`wave-0-decisions.md:18`).

- **Column 1, the inbox (about 340px).** Title "Messages" + the pencil. **Your week** on top, the same compact block as the phone: the 7-day strip, the event cards row. The arrows are always visible on hover (no swipe needed), and the left / right keys move the week. Under it the filters All / Chats / Clubs / Requests, then the same rows as the phone (club rows with the Board line and the coral dot, person rows). The open row is highlighted.
- **Column 2, the room (flexible, at least 420px).**
  - A club: a header (crest, name, "Your hat", member count), the room chips (Board, Lounge, Officers, event chats), the Board strip pinned above the messages, the thread, the composer with the "+" tray. Messages sit in a centred reading column about 680px wide. Cards keep their phone size (292px), so nothing in the cards has to be redrawn.
  - The Board: officer posts with folded replies, the same as the phone.
  - An event chat: it replaces the room in this column with a small trail "SAE > Game night" on top. No stacked layers on desktop. Its Where / When / who's going block moves to column 3.
  - A DM or group chat: the thread, with typing dots and "Read" kept (see decision 3).
  - Nothing open: a calm empty state with the next plan from Your week.
- **Column 3, details (about 300px, can be closed; hidden under about 1,180px of window and opened with an "i" button).**
  - Club: Up next (each event opens its event chat), the latest Board post, members + the club page link, and for owners / admins a "Manage club" button (the door to today's settings).
  - Event chat: Where, When, who's going, the RSVP buttons, "Back to <club>".
  - DM: the person (profile link, mute, block, report). Group: the members.
- **The month calendar:** click the "Your week" title or a day -> a popover anchored to column 1 (month grid, dots, the day's plans, a plan opens its event chat). Same rules as the phone's month sheet, drawn as a popover and not a bottom sheet.
- **Sheets become dialogs:** New poll, New sign-up, Share an event, RSVP, Report, the Remove confirm = centred dialogs about 440px wide. Esc closes.
- **Mouse instead of long-press:** hovering a message or a card shows a small row (react, reply, "..."). Right-click opens the same menu.
- **Campus > Chat with the flag on:** the Chat tab leaves the Campus tab bar, the same as the phone (call 8). Old links `/campus?tab=chat&channel=<id>` redirect to `/messages?channel=<id>`. Club settings stay reachable through "Manage club".
- **URLs:** `/messages`, `/messages?channel=<id>`, `/messages?to=<handle>`, `/messages?tab=clubs`. Same as the phone, so push links and Otto links work on both.

### Layout B: two homes (Messages for people, Campus for clubs)

- `/messages` stays today's page, DMs and group chats only (club rooms leave its list).
- Campus > Chat is rebuilt as the club space: left = Your week + your clubs, centre = the room, right = details. No rails, no "#".
- Good: nothing about DMs is touched, so the lowest risk. Bad: it is "Option 2", which Franky turned down on the phone. Your week would not live in Messages. A laptop and a phone would disagree about where chat lives, and push links (`/messages?channel=`) would need a redirect to Campus.

### Layout C: the phone screen in a column (a bridge, not a destination)

- With the flag on, desktop `/messages` shows the real phone chat in a centred column about 430px wide (an inner frame at phone width; the site already allows framing its own pages, `next.config.ts:85`).
- Good: one small batch. Every feature works on day one (cards, event chats, Your week, month sheet) because it IS the phone code. Bad: it looks like a phone on a laptop, wastes the width, and desktop DMs lose typing dots, "Read" and live refresh. Links that leave Messages need a guard so they open in the full window.
- Use: the fallback if Layout A is not walked clean by Fri Oct 23.

### Recommendation

**Layout A.** It matches the phone, matches the accepted call 9, and reuses the most code: the routes, the rules, and about 20 inner components need no change. B saves risk but breaks "one inbox". C is the safety net.

## 7. Wave plan (Layout A, staged)

### What must come first (no code)
1. **Mockups on the design canvas** (a new row, "Desktop chat"). None exists today. Draw Layout A in full: club open on the Lounge; the Board with folded replies; an event chat with the details column; the month popover; the New poll dialog; a DM open; the empty state. Light and Night, at 1440px and at about 1100px (column 3 closed). One board each for B and C so Franky can compare. Franky picks. About 1 session.
2. **A contract** `handoffs/chat-redesign/wave-3-desktop-contracts.md`: every file, prop, URL, copy string, the flag-off list (must be empty for the phone), then a plan critic. About 1 session.
3. **The phone's owed fixes land first**, because they touch the same files: 17.2 L3 (Report / Remove on text Board posts: `club/BoardPost.tsx`, a shared long-press hook from `cards/CardBubble.tsx`), wave-1 fixes M2 to M5, the Event-card cap. Do L3 with a visible "..." button so desktop gets it for free.

### Wave D0: "no dead ends on a laptop" (small; ships before Oct 26 whatever else happens)
Flag-independent, desktop-only, old screens. About half a session, one batch.
- `public/html/messages.html`: open any room the user may read by `?channel=<id>` even when it is not in the list (audit I3), so an event-chat link from a push or a mention does not land on "Couldn't open that conversation".
- `src/app/campus/campus-home.tsx` `ChannelChat`: call `POST /api/me/threads/[id]/read` (audit M5).
- `OttoSidePanel.tsx:961`, `_otto.js:881`: the mention link carries the room id.

### Wave D1: desktop chat core (behind the flag, desktop only). Six batches, file-owned.
New folder `src/components/desktop/messages/`. No route, no SQL, no migration.

| Batch | Owns | What |
|---|---|---|
| **D1-S0 (alone, first)** | new `src/components/chat-shared/SheetShell.tsx`; shell-swap edits only in `compose/CardSheet.tsx`, `club/RsvpSheet.tsx`, `home/MonthSheet.tsx`; `home/YourWeek.tsx` (a prop that shows the arrows); `cards/CardBubble.tsx` ("..." button) | Bottom sheet on the phone, centred dialog or popover on desktop. Proof: the phone walk list of 17.9 / 17.11 passes unchanged at 375px. |
| **D1-A shell** | `src/app/messages/MessagesSwitch.tsx`, new `MessagesDesktop.tsx`, `desktop-url.ts`; `src/lib/chat/flag.ts`, `flag-server.ts`, `types.ts` (`chat_v2_desktop`), `api/me/features/route.ts` | The flag fork on desktop (unknown -> skeleton, on -> the new page, off -> today's iframe, byte for byte). Three-column grid, what is open, `?channel=` / `?to=` / `?tab=`, column 3 closing under 1,180px. |
| **D1-B inbox** | new `InboxColumn.tsx`, `MonthPopover.tsx` | The three reads, Your week, filters, rows. Reuses `home-rules.ts`, `ClubRow`, `PersonRow`, `YourWeek`, `HomeEmpty`, `week.ts`. |
| **D1-C room** | new `ClubPane.tsx`, `EventPane.tsx`, `HoverActions.tsx` | The club header, chips, Board strip, thread, composer, event chat. Reuses `RoomChips`, `BoardStrip`, `BoardView`, `RoomThread`, `RoomComposer`, the cards, `use-room-poll.ts`. |
| **D1-D details + people** | new `DetailsPanel.tsx`, `LegacyThreadPane.tsx`; a "thread only" mode in `public/html/messages.html` (about 40 lines, only when `?pane=1`) | Column 3 for club, event, DM, group. DMs and group chats open in column 2 through today's desktop thread, so typing, Read, mentions and delete are kept. |
| **D1-E Campus + links** | `src/app/campus/campus-home.tsx`, `src/app/orgs/[handle]/ChannelsSection.tsx`, `public/html/_miniMessenger.js` | Flag on: the Chat tab leaves desktop Campus, old links redirect, a "Manage club" door to `OrgSettingsModal`, the chat bubble lists DMs and groups only (`?scope=chats`). Flag off: unchanged. |

Then: an integration review (flag off = nothing changed on the phone or on desktop; flag on = the contract), gates (`tsc`, `npm test`, eslint, build), and a browser walk at 1440 / 1280 / 1024 / 900px, Light and Night, as a member, an officer and a flag-off account, plus the phone list at 375px again.

**Rough size:** about 3,000 to 3,500 new lines, about 12 edited files. Close to wave 2's three screen batches, with no backend. Mockups 1 session, contract 1, build 2 to 3 cloud days, Mac walk and repairs 2 sessions.

### Wave D2: after launch
- A native React DM thread on desktop (port typing, Read, the @mention picker, delete own, photo crop, live refresh), then retire the `messages.html` iframe and `_miniMessenger.js`.
- Delete the Campus rails (`ServerRail`, `ChannelRail`, `ChannelMain`, `ChannelChat`, about 1,900 lines of `campus-home.tsx`) and move `OrgSettingsModal` to the club page.
- Merge "My Calendar" and the month popover into one calendar. Keyboard shortcuts, search, Realtime.

### How it fits the dates
| When | What |
|---|---|
| Fri Oct 2 to Sun Oct 4 | S72: mockups A / B / C on the canvas. Oct 4 is f2 (mailbox). No chat code. |
| Mon Oct 5 to Wed Oct 7 | Franky picks. Phone owed fixes (L3, M2 to M5, card cap) + wave D0. The desktop contract + critic. Demo days start. |
| Thu Oct 8 to Tue Oct 13 | Build D1 in the cloud on its own branch. Oct 9 is f9 (Android), Franky's hands, no chat. |
| Oct 12 to 14 | Mac window 2 stays for the PHONE: repairs and the build that goes to Apple. Desktop is not merged here. |
| Thu Oct 15 | Freeze of the flag-off surface. The desktop branch is flag-gated, so it may still deploy after (contract 13.0). |
| Fri Oct 16 | App Store submission (phone only; the iPhone app never shows desktop). |
| Oct 17 to 21 | Mac walk of desktop D1 on the local stack, repairs, merge behind the flag. Founders see it. |
| Oct 21 to 23 | Founders use it on production. **Fri Oct 23 = go / no-go for desktop.** |
| Mon Oct 26 | Phone chat on for everyone. Desktop goes on the same day only on a "go". |
| End of October | Launch. |

### Honest answer on Oct 26
- **The full plan (retire the old Messages page and the Campus rails) cannot make Oct 26.** It should follow after launch (wave D2). The critic said the same on Sept 29 (`plan-critique.md` #19).
- **The core (D1) can make Oct 26, but it is tight and has no slack.** It works only if the pick happens by Tue Oct 6, the build runs in the cloud while Franky does f9 and the App Store build, and Franky gives it two Mac sessions between Oct 17 and Oct 23. One slip in the phone list or the store submission eats that time.
- **So desktop must not be able to hold up the phone.** Add a second switch, `CHAT_V2_DESKTOP`, so Oct 26 turns the phone on for everyone and desktop turns on when it is ready (the same day on a "go", or the first week of November).
- **Wave D0 ships either way**, so a laptop user never hits a dead link on Oct 26. Without D1 they still see polls as plain text, which contract 12.2 already accepted for v1.

Note on slack: the phone is about 3 days ahead of the contract's calendar. Window 1 was planned for Oct 5 to 6 (`wave-2-contracts.md` 13.0) and wave 2 went to production on Oct 2. That is the only slack the desktop plan has.

## 8. Decisions for Franky (each with a recommendation)

1. **Which layout?** A (one inbox, three columns), B (Messages for people, Campus for clubs), C (phone screen in a column). **Recommend A.** It is the phone's Option 3 with more room and the call he already accepted. Pick from mockups, not from words.
2. **Does desktop aim for Oct 26?** Yes with an escape hatch, or declare it after launch now. **Recommend: aim for Oct 26, add a separate desktop switch (`CHAT_V2_DESKTOP`), decide go / no-go on Fri Oct 23.** The phone never waits for desktop.
3. **DMs and group chats inside the new desktop page.** Keep today's desktop thread in the middle column for now, or rebuild it in React now. **Recommend: keep today's thread for v1.** It has typing dots, "Read", the @mention picker, delete your own message and live refresh. The phone's React DM view has none of those, so reusing it would make desktop DMs worse. Rebuild after launch (D2).
4. **Campus > Chat on desktop when the flag is on.** Remove the tab and redirect old links (like the phone), or keep it. **Recommend: remove the tab, redirect, and add a "Manage club" button** in column 3 and on Campus > Orgs, because today the rails are the only door to club settings (`campus-home.tsx:1050`).
5. **The month calendar on desktop.** A popover from Your week (the phone's rules), or open the left nav's "My Calendar". **Recommend: the popover now.** "My Calendar" does not open event chats and also holds personal events and the .ics export. Merging the two is a D2 job. Until then desktop has two calendars; say so in the mockup.
6. **Where Your week sits.** Top of the inbox column (as on the phone), a strip across the whole page, or in column 3. **Recommend: top of the inbox column, compact.** Same place as the phone, and DMs still start high on the screen.
7. **Message and card width.** Keep the phone-size cards in a centred 680px reading column, or stretch to the full column. **Recommend: centred column.** Nothing in the cards needs a redraw, and wide chat lines read badly.
8. **The chat bubble on the profile page (mini messenger).** Leave it, or with the flag on list only DMs and groups. **Recommend: DMs and groups only.** One line (`?scope=chats`), and it removes the "random member's face on a club room" bug (audit M3) from that surface.
9. **Mouse actions.** A hover row (react, reply, "...") plus right-click, or only a "..." button. **Recommend: hover row plus "...".** The "..." also helps the phone (it is how Report became findable there).
10. **The owed phone work first?** L3 (Report / Remove on text Board posts) touches the same files as the desktop hover actions. **Recommend: L3, M2 to M5 and wave D0 before any desktop screen code.**
11. **Fallback if Oct 23 is a "no-go".** Leave laptops on the old screens with D0, or switch on Layout C (the phone in a column) as a bridge. **Recommend: old screens + D0.** C is cheap but looks unfinished on the week the doors open; keep it as a mockup only.

## 9. Risks to name in the contract
- `MessagesSwitch.tsx` is shared by phone and desktop. The phone branch must be untouched; the desktop flag-off branch must render today's iframe byte for byte.
- `campus-home.tsx` is 17,286 lines. One batch owns it alone (D1-E).
- The sheet-shell swap (D1-S0) edits three files the phone just walked. Re-walk the phone list after it.
- Android tablets and foldables (900px or wider) get the desktop tree inside the Android app. After D1 they would get the three-column page. Walk one tablet size before the desktop switch goes on.
- The desktop page still needs the "thread only" mode of `messages.html`; its own list timers keep polling while hidden unless the mode turns them off.
- No real student has used desktop chat. SAE has one member. Mockups are the only user test before the build.
