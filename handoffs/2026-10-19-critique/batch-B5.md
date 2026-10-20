# Batch B5: the Messages list (Oct 19, 2026)

Built on decision 14 (48px for all). Not committed. Every edit stayed inside B5's own files.

## What changed

- **`src/components/mobile/messages/home/PersonRow.tsx`**
  - New shared exports: `ROW_FRAME`, `ROW_TEXT` and `ROW_PICTURE = 48`.
    - The row is at least 66px tall, so a 48px picture always has 9px of space above and below it.
    - The text column stretches to the row's full height. That keeps its divider on the row's bottom edge, still starting where the text starts.
    - Padding of 9 + 9 keeps every two-line row at exactly 66px, including a club with an event chip.
  - Pictures go from 44px to 48px (initials 14 to 15px). The two discs of a group go from 30px to 32px (initials 10.5 to 11px).
  - Left padding and gap go from 16/14 to 14/12, the same as the club rows. The text of every row now starts at the same x (74px on the phone).
- **`ClubRow.tsx`**: uses the shared frame. When a club has no preview, no event chip and no "N new", it shows a quiet second line, "No messages yet", in muted ink. That is the same wording `personPreview` already uses for an empty DM. It's a local constant, so `home-rules.ts` was not touched.
- **`FollowedBoardsRow.tsx`**: uses the shared frame and picture size.
- **`src/components/desktop/messages/desktop-rules.ts`**: `slimRows` now returns every chat, in `mergeHomeRows` order.
  - Pinned, unread-and-not-muted and open rows ("kept" rows) keep their dot. Every other row is quiet (dot null).
  - An open chat that is in neither list is still supplied first.
  - `SLIM_TARGET` is removed. Nothing else imported it.
- **`desktop-rules.test.ts`**: the cap tests are rewritten.
  - No cap: 20 chats give 20 rows, and 10 unread plus 4 quiet give 14.
  - The order matches `mergeHomeRows` exactly.
  - Quiet rows have no dot.
  - The open chat stays in its own place. An unlisted open chat is supplied first (21 rows).
  - A muted unread chat shows quietly even with 8 unread chats above it.
  - `SLIM_TARGET` is gone.

## Checks

- `node --test src/components/desktop/messages/desktop-rules.test.ts`: 16/16 pass.
- `npm test`: 3310/3310 pass.
- `npx eslint` on the 5 files: clean.
- `npx tsc --noEmit -p .`: no errors in B5 files. The only error is `src/components/otto/metrics-count.test.ts(13,66)` TS5097 (a `.ts` import extension). That is B9's new file, not this batch's.

## Browser check (local dev, avery: 9 clubs, 5 chats; plus blake, a non-admin)

Measured in the page, not only by eye:

- **Phone 390x844, iPhone UA, Night and Light:** all 14 rows are 66px with 48x48 pictures. The text starts at x=74 on every row. No two pictures touch. Page width is 390, so nothing scrolls sideways.
- **Desktop 1440x900, Night and Light:** the wide list shows all 14 rows at 66px with 48px pictures, text aligned and no pictures touching.
- **Blake's DM open:** the narrow list shows all 14 chats (before this batch it showed 8). At 1440x560 the column scrolls (scroll height 658 in a 452 view).
- **Mini messenger** (`/messages?mini=1` in a 420x640 frame, always Night): 14 rows at 66px, width 420.
- **blake (non-admin), phone, Light:** 7 rows including "Boards you follow", all 66px with 48px pictures.

Screenshots are in `handoffs/2026-10-19-critique/shots/`:

- Phone: `B5-phone-{night,light}-{top,bottom}.png` and `B5-phone-light-blake.png`
- Desktop: `B5-desktop-{night,light}-inbox.png`, `-inbox-bottom.png`, `-dm-open-slim.png` and `-slim-short-scrolled.png`
- Mini messenger: `B5-mini-messenger-night.png`

## Left for other owners (not B5 files, so not edited)

- `src/components/desktop/messages/SlimList.tsx`
  - Its docstring still says the list fills "up to `SLIM_TARGET` rows".
  - Its `<nav aria-label="Pinned and unread chats">` now holds every chat. "Chats" or "Your chats" would be accurate.
  - It needs a two-line copy change. No behaviour changes.
- `MessagesHome.tsx` `HomeSkeleton` still draws 44px discs in 67px rows. Moving them to 48px in 66px rows would remove a 1px jump when the list loads. This is cosmetic.

---

# B5 repair after review (Oct 19, 2026)

Every edit stayed inside B5's files. `home-rules.ts` and its test count as "the copy file that holds those rows' strings" from the plan. Nothing is committed.

## Findings and what happened

1. **Club rows with both a message and an event are 87px. Kept on purpose; the comment is fixed.**
   - Franky's approved W0_Home board draws these rows with three lines: Salsa Club, Jag Robotics and Film Society.
   - Putting the chip in place of the preview would hide an unread Board post (the officers' line) behind any club's weekly event.
   - D4 was about pictures touching and pictures of two sizes. Both are fixed. In 87px rows the picture is centred, and pictures are at least 18px apart.
   - The `ROW_TEXT` comment (PersonRow.tsx) and the ClubRow doc comment now say this.
   - **Franky's call:** if he wants every row at 66px, swap the chip in for the preview in `ClubRow.tsx`. It's about a 5-line change.
   - The plan's B5 browser check says "all rows are the same height". It should say "two-line rows are 66px, a club with a message and an event is about 87px".
2. **The open chat can sit below the slim list's fold. Not applied: SlimList.tsx isn't B5's. Patch ready:** `B5-handoff-SlimList.patch`.
   - The patch adds a `useEffect` keyed on the open row's key that calls `scrollIntoView({ block: "nearest" })`, with no smooth scroll.
   - It was checked with `git apply --check`, eslint on the patched copy, and tsc on a scratch copy of `src` (canary-tested).
   - In the browser at 1440x560 Light, I clicked 'w1test club 3':
     - Before: the open row is at y 706-750 and the column ends at 560.
     - Running the patch's effect in the page: the nav scrolls 190px, the row is at 516-560, and nothing else scrolls (the window stays at 0).
   - Shots: `B5-fix-slim-open-row-before-1440x560.png`, `B5-fix-slim-open-row-patch-emulated-1440x560.png`.
3. **The slim list's label and doc comment. Same patch.** `aria-label="Your chats"`, and the comment now says "every chat of the full list, in its order".
4. **"No messages yet" beside a recent time. Fixed.**
   - New `clubQuietLine(club, now)` in `home-rules.ts`:
     - `null` when the row has a preview, a chip or "N new"
     - "No messages yet" only when `last_activity_at` is null
     - otherwise "Last message in an event chat", the only place that time can come from
   - **The wording is Franky's to change.** It's one string in `home-rules.ts`.
   - Unit test added. Browser check: with activity injected 3 hours ago, the top row reads "Test Hidden Club 5:29 PM / Last message in an event chat".
5. **Requests rows still use the old 50px ThreadRow. Rejected as a B5 change.** It's a recorded decision, not an oversight: wave-2 contract VIS-S1-5 / A37 says "Requests rows stay `ThreadRow` (11.1 pins today's rows)".
   - To change it, render `PersonRow` (with `now`) in place of `ThreadRow` at `MessagesHome.tsx` (the Requests branch, about line 402) and `InboxWide.tsx:127`. Neither file is B5's.
   - Suggest adding it to the plan's "Not in this plan" list for Franky.
6. **The loading skeleton is 44px. Not applied: MessagesHome.tsx isn't B5's. Patch ready:** `B5-handoff-HomeSkeleton.patch`.
   - The patch makes the disc 48px (`ROW_PICTURE`) in a 66px row with 14px left padding, and updates the comment. Checked the same way as 2.
   - Note: `NewChatDialog`, `RoomsDialog` and `MembersDialog` also show `HomeSkeleton`. Their rows use 40px faces, so they were already a different size (44 vs 40). After the patch it's 48 vs 40.
7. **The back disc of a group picture clipped its initials. Fixed.**
   - The back disc (`Disc tucked`) moves its initials up and left with `padding: 0 6px 6px 0`.
   - Measured in the page, the share of the initials under the front disc went from 7.4% ("BS") and 8.5% ("CP") to 0%. The values 4/6/7/8px were tried, and 6 is the smallest that clears both.
   - Shot: `B5-fix-group-initials-zoom-light.png`.

## Checks

- `npm test`: 3350/3350 pass. `home-rules.test.ts` has 18 tests, including the new `clubQuietLine` test.
- `npx tsc --noEmit -p .`: clean.
- `npx eslint` on the 7 B5 files: clean.
- Browser (local dev, avery; blake as the non-admin), measured in the page:
  - Phone 390 and desktop 1440, Night and Light, real data: every row is 66px, pictures 48x48 and centred, at least 18px between pictures, no sideways scroll, group initials 0% hidden.
  - With the inbox answer rewritten in the browser (no database writes): SAE (preview + upcoming chip + Going + 3 new) and Chat Seed Club (preview + live chip) are 87.2px with the picture centred. The event-chat-only club and the empty clubs are 66px.
  - Mini messenger (420x640) with the same rewrite: the same result.
  - blake on the phone in Light: all rows 66px, pictures 48px.
- Shots re-taken in `shots/`:
  - Phone: `B5-phone-{night,light}-{top,bottom}.png` and `B5-phone-light-blake.png`
  - Desktop: `B5-desktop-{night,light}-inbox{,-bottom}.png`
  - Mini messenger: `B5-mini-messenger-night.png`
  - New: `B5-fix-chip-rows-{phone,desk}-{night,light}.png`, `B5-fix-group-initials-zoom-light.png` and the two slim-list shots
- The scripts are in the session scratchpad: `b5fix/check.mjs`, `b5fix/slim.mjs` and `b5fix/tuck.mjs`.
