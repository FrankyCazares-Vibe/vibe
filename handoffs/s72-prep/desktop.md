# Desktop chat: where it stands and how to build it

## 1. What a laptop user sees today

Desktop has three old chat surfaces. **None reads the `chat_v2` flag, so flag on and flag off look the same.**

- **`/messages`**: an iframe of the old page (`src/app/messages/MessagesSwitch.tsx:39-66` loads `public/html/messages.html`, 3,755 lines). Club rooms are listed as if they were group chats (`messages.html:2017`).
- **`/campus?tab=chat`**: the Discord-style rails (`src/app/campus/campus-home.tsx:970`), still saying "Text channels", "Pinned" and `Message #name` (`:15727`, `:15714`, `:16784`).
- **The chat bubble** on the profile page (`public/html/_miniMessenger.js`).

Phone or desktop is chosen by window width only: under 900px is the phone (`src/lib/use-is-mobile.ts:14`).

**Gaps against the phone:**
- **Cards are plain text.** A poll shows as "Poll: question" (`src/lib/chat/cards/fallback.ts:5-9`). No desktop file reads `card`. Nobody can vote, take a spot or RSVP from a laptop.
- **Event chats cannot be opened.** Both lists drop them (`src/app/api/me/threads/route.ts:486`, `src/app/api/orgs/[slug]/channels/route.ts:105`), and a direct link lands on "Couldn't open that conversation" (`messages.html:3652-3658`). Push links point there (`src/lib/push/payload.ts:322`).
- **Board replies never show** (`src/lib/chat/message-read.ts:854-855`; desktop never asks with `?root=`).
- **No Your week, no month calendar, no club space, no "+" tray.**
- **Campus › Chat never marks a room read** (zero `/read` calls in `campus-home.tsx`; audit M5) and has no Report or Remove (audit M8).
- **No desktop chat mockup exists.** All 26 boards in `handoffs/chat-redesign/boards/` are phone.

**Where desktop is ahead (do not lose it):** desktop DMs have typing dots, "Read", an @mention picker, delete-your-own and a 2-second refresh (`messages.html:1529-1538`). The phone's DM view has none (`src/components/mobile/messages/ConversationView.tsx` has no timer).

## 2. What can be reused

- **As is:** every route (`/api/me/inbox`, `/api/me/threads?scope=chats`, `/api/orgs/[slug]/space`, the card and vote routes, `/api/me/calendar`), all rules in `src/lib/chat/` including `use-room-poll.ts`, and about 20 inner pieces (`ClubRow`, `PersonRow`, `RoomChips`, `BoardView`, `RoomThread`, `RoomComposer`, the three card views, `EventAbout`). Enter already sends (`RoomComposer.tsx:297`).
- **Phone-shaped, needs a wrapper:** the full-screen drawers (`club/ClubSpace.tsx:417`, `club/EventChat.tsx:113`), the bottom sheets (`CardSheet`, `RsvpSheet`, `MonthSheet`), the Back-button layering (`src/lib/chat/layer-stack.ts`), long-press actions and the week swipe.

## 3. Proposed design

**Layout A (recommended): one inbox, three columns.** The phone's Option 3 with more room, and the call already accepted (`wave-0-decisions.md:18`).
- **Left (about 340px):** Messages title, **Your week** on top with visible arrows, the filters All / Chats / Clubs / Requests, the same rows as the phone.
- **Middle:** the open room. A club shows its header, room chips (Board, Lounge, Officers, event chats), the Board strip, the thread, the composer with "+". An event chat replaces the room here, with a "SAE › Game night" trail. Cards keep their phone size in a centred reading column.
- **Right (about 300px, closable):** details. Club: Up next, latest Board post, members, "Manage club". Event: Where, When, who's going, RSVP. DM: the person.
- **Month calendar:** a popover from Your week. Sheets become centred dialogs. Hover shows react, reply and "...".
- **Campus › Chat:** the tab leaves desktop with the flag on; old links redirect to `/messages?channel=`.

**Layout B:** Messages keeps DMs only; Campus › Chat is rebuilt as the club space. Lowest risk, but it is the "Option 2" Franky turned down, and it splits the inbox.

**Layout C:** the phone screen in a 430px column on desktop. One small batch, every feature works, but it looks like a phone on a laptop. A fallback only.

## 4. Wave plan

**First, no code:** (1) mockups of A on the design canvas, Light and Night, plus one board each for B and C; Franky picks. (2) A contract `wave-3-desktop-contracts.md` and a plan critic. (3) The owed phone fixes (17.2 L3, M2 to M5), which touch the same files.

**Wave D0, small, ships whatever happens:** old desktop opens any readable room by link (audit I3), Campus › Chat marks read (M5), Otto mention links carry the room.

**Wave D1, the core, behind the flag, six file-owned batches (implement, adversarial review, repair):**
- **S0 (alone, first):** a sheet shell (bottom sheet on phone, dialog on desktop) in `CardSheet`, `RsvpSheet`, `MonthSheet`; a "..." on cards.
- **A shell:** `MessagesSwitch.tsx`, new `MessagesDesktop.tsx`, a `chat_v2_desktop` switch.
- **B inbox:** `InboxColumn.tsx`, `MonthPopover.tsx`.
- **C room:** `ClubPane.tsx`, `EventPane.tsx`, hover actions.
- **D details + people:** `DetailsPanel.tsx`, and DMs shown through today's desktop thread.
- **E Campus + links:** `campus-home.tsx` alone, `ChannelsSection.tsx`, the chat bubble.

Size: about 3,000 to 3,500 new lines, 12 edited files, no database work. One session for mockups, one for the contract, two to three cloud build days, two Mac sessions to walk and repair.

**Wave D2, after launch:** a native React DM thread, retire `messages.html` and the Campus rails, move club settings to the club page, one calendar.

**Dates:** Oct 2 to 4 mockups. Oct 5 to 7 pick, phone fixes, D0, contract. Oct 8 to 13 build in the cloud (Oct 9 is Android). Oct 12 to 16 belong to the phone and the App Store build. Oct 17 to 21 walk and merge behind the flag. **Fri Oct 23 go or no-go.** Oct 26 everyone.

## 5. Honest answer on Oct 26

- **The full job cannot make Oct 26.** Retiring the old pages follows after launch.
- **The core (D1) can, but with no slack.** It needs the pick by Tue Oct 6 and two Mac sessions between Oct 17 and 23. The only slack is that the phone is three days ahead of plan.
- **Desktop must never hold up the phone.** A separate desktop switch lets Oct 26 go ahead either way.
- The Oct 15 freeze does not block it: it covers the flag-off surface, and the iPhone app never shows desktop.

Full notes with every file reference are in the notes file.

## Decisions
- Q: Which desktop layout: A (one inbox, three columns), B (Messages for people, Campus for clubs), or C (the phone screen in a column)?
  R: A. It is the phone's Option 3 with more room and the call you already accepted on Sept 29. Pick from mockups on the canvas, not from words. None exists yet.
- Q: Does desktop aim for Mon Oct 26, or do we say now that it follows launch?
  R: Aim for Oct 26 with an escape hatch: add a separate desktop switch (CHAT_V2_DESKTOP) and decide go or no-go on Fri Oct 23. The phone never waits for desktop. The pick must happen by Tue Oct 6 for this to work.
- Q: DMs and group chats inside the new desktop page: keep today's desktop thread in the middle column, or rebuild it in React now?
  R: Keep today's thread for v1. It has typing dots, Read, the @mention picker, delete-your-own and live refresh. The phone's React DM view has none of those, so reusing it would make desktop DMs worse. Rebuild after launch.
- Q: With the flag on, does Campus › Chat leave desktop (like the phone)?
  R: Yes: remove the tab, redirect old links to /messages?channel=, and add a Manage club button in the details column and on Campus › Orgs. Today the rails are the only door to club settings (campus-home.tsx:1050), so the door must exist first.
- Q: The month calendar on desktop: a popover from Your week, or the left nav's My Calendar?
  R: The popover now. My Calendar does not open event chats and also holds personal events and the .ics export. Merge the two after launch. Until then desktop has two calendars; show that in the mockup.
- Q: Where does Your week sit on desktop: top of the inbox column, a strip across the whole page, or the right column?
  R: Top of the inbox column, compact, same place as the phone. DMs still start high on the screen.
- Q: Message and card width: phone-size cards in a centred reading column (about 680px), or stretched to the full column?
  R: Centred column. No card needs a redraw and wide chat lines read badly.
- Q: The chat bubble on the profile page with the flag on: leave it, or list DMs and groups only?
  R: DMs and groups only. It is a one-line change (?scope=chats) and it removes the bug where a club room shows a random member's face and opens a DM with them (audit M3).
- Q: Do the owed phone fixes come before any desktop screen code?
  R: Yes. 17.2 L3 (Report and Remove on text Board posts) touches the same files as the desktop hover actions, and M2 to M5 plus the small desktop no-dead-ends wave (D0) are needed for Oct 26 whatever happens to the big build.
- Q: If Fri Oct 23 is a no-go, what do laptops get on Oct 26?
  R: The old screens plus wave D0 (event-chat links open, rooms mark read). Polls show as text, which the contract already accepted for v1. Do not ship Layout C as a bridge; it looks unfinished on the week doors open.