# Fact check, round 3: who sees what, messages, events, the waitlist, deletion

2026-10-04, third round. Independent checker of `privacy-policy-final.md` as rebuilt at 11:13 (not the writer). Read-only: nothing was edited in the release worktree or the repo, production was not touched. This is not legal advice.

**Skill.** My job names no skill, so none was loaded. The framework in the job was used: try to disprove each sentence in the code, quote file and line.

**Code read.** The release worktree, branch `release-s74` at `62a2daa` (the three merges are done; four files there carry uncommitted sign-up edits by another run, none of them bears on these sections). Paths below are from its root.

**Scope.** Short version items 1 to 7; section 1 (the admin tools); 3c; the section 5 table and 5a to 5h; section 8; section 9; section 11; the deletion half of section 12. About 180 sentences. Every sentence changed in round 3 was re-checked in code; the rest were re-read against the files named below, not taken from round 2's list.

**Result: does not pass yet. 0 high, 1 medium, 3 low.** All seven of round 2's findings are closed in the text. The one medium is a clause inside round 2's own fix: the replacement sentence dropped a qualifier that round 2's finding had ("on the new chat screens"). One clause fixes it.

## Medium

### M1. "In a club room it is marked as removed" is true only on the new chat screens

- **Where:** 5h, "Removed content", line 318: "A message they remove also stays visible to you and to nobody else. In a club room it is marked as removed. In a direct or group chat it is not marked yet, so it can look to you as if it was still sent."
- **True for:** a club room opened on the new screens: the phone with the new chat switched on (`src/components/mobile/messages/club/RoomThread.tsx:378-382`), and the new desktop Messages, which reuses those components.
- **False for:** a club room opened on the older screens, which is what an account gets when the new chat is not switched on for it, and what every laptop gets unless the desktop switch names that account (`src/app/messages/MessagesSwitch.tsx:27-41`: "Desktop → CampusAppShell + the legacy messages.html iframe"; `src/lib/chat/flag.ts:13-16, 34-40`). There the sender's own removed club-room message is an ordinary bubble, exactly as in a direct chat.
- **Code:**
  - The read sends the removal only as `removed: { by, at, reason }` and lists every field it sends; `removed_at` never reaches the screen (`src/lib/chat/message-read.ts:548-556, 559-563, 671`). The author's own removed row is kept in the page (`:594`), in a club room as in any chat.
  - The old desktop page lists club rooms (`public/html/messages.html:2411`: `/api/me/threads` with no `scope`, which includes club rooms: `src/app/api/me/threads/route.ts:404-413`) and maps only the old names (`public/html/messages.html:2615-2616`, notice at `:1505-1506`).
  - The old phone screen draws every thread with `MessageBubble`, which looks for `message.removed_at` (`src/components/mobile/messages/MessageBubble.tsx:625-628`, "Unreachable today").
  - The Vibe team can remove a message in any chat (`src/app/api/admin/content/remove/route.ts:24, 104`), and their own tool says the sender is not shown it yet (`src/app/admin/reports-client.tsx:949-951`).
- **Why it matters:** 5e itself says the new club rooms "are being switched on for a few clubs and accounts at a time, so you may not have them yet". For exactly those readers this sentence is wrong, in the one paragraph that says how a person learns of a removal. `page-and-code-changes.md` line 7 says "The policy is true before any row ships"; this clause is the exception.
- **Fix, pick one.**
  - Policy (true today): "A message they remove also stays visible to you and to nobody else. On the new club-room screens it is marked as removed. Everywhere else (a direct or group chat, and a club room on the older screens) it is not marked yet, so it can look to you as if it was still sent."
  - Code: move **row 56** into part 1 (today's deploy). It is listed as small and exact, and it edits the two files the older screens use (`messages.html`, `MessageBubble.tsx`), so it marks club rooms there too. Then line 318 can read "A message they remove also stays visible to you and to nobody else, marked as removed." Row 56's "why" should say it also covers club rooms on the older screens. Until row 56 ships, the sentence as written is not acceptable: row 56 sits in part 2, with no date.

## Low

1. **5e, Blocks: "Nothing is deleted." (line 251)** True of messages and chats. A block does delete two things: the follow each of you had on the other, and an unblock does not bring them back (`src/app/api/me/block/route.ts:151-175`: "Tear down any follow edges in either direction … an unblock later does NOT auto-restore it"). Suggested: "No message is deleted. The block does end the follows between the two of you, and unblocking does not bring them back."

2. **5e, Pinned messages: "Everyone in the chat sees the pinned messages" (line 250).** Seeing, pinning and unpinning all need the new chat to be switched on for the account (`src/app/api/me/threads/[id]/message-pins/route.ts:72-73`; `.../messages/[messageId]/pin/route.ts:51-52`). Nothing checks that the other people in the chat have it. So a person without it can have their message pinned by someone who does, and can neither see the pin nor undo it. The line at the top of 5e ("you may not have them yet") half covers this. Suggested addition: "If pinned messages are not switched on for you yet, someone who has them can still pin your message, and you cannot see or undo that pin."

3. **Section 5 table and 5e, an event's chat: "The people in an event's chat also see who is in it" (lines 198, 261).** They also see which of those people marked Going: the room's header names the first 8 who did, with the Going and Interested totals (`src/lib/chat/message-read.ts:274, 1002-1040, 1047-1124`). Suggested: "The people in an event's chat also see who is in it, and the first few who marked Going."

## Round 2's findings: all seven are closed in the text

| Round 2 | What it was | Now (line) |
|---|---|---|
| M1 | A removed direct or group chat message is not marked | Closed for direct and group chats (line 318), and row 56 lists the code fix. The club-room half of the new sentence is M1 above |
| L1 | The first-follow date stays after you unfollow | Closed: line 411, matching `supabase/migrations/20260916120000_org_followers.sql:638-650` (cascades with the club or the account) and `src/app/api/orgs/[slug]/followers/route.ts:112-121` (owner and admin see `first_followed_at`) |
| L2 | Voting where you cannot post | Closed: line 265 ("where the club chose who can post"), matching `supabase/migrations/20261004110000_chat_room_post_policy.sql:667-670` |
| L3 | Requests are for direct messages; groups add with no request | Closed: line 249, matching `src/app/api/me/threads/route.ts:266-280, 320-326, 373-391` and `.../members/route.ts:129-141, 181-186` |
| L4 | A suspended member still shows in a club's member list | Closed: line 480, matching `src/app/api/orgs/[slug]/members/route.ts:95-100` |
| L5 | Anyone who types your address restarts the waitlist clock | Closed: line 541, matching `src/lib/waitlist/store.ts:193-240` and the trigger at `supabase/migrations/20261003170000_waitlist_margin.sql:238-262` |
| L6 | Deleting by email has no tool | Closed as a hand-kept promise: line 430, `decisions.md` D15, item 20, row 57 |

## Tried to disprove this round, and could not

**Pinned messages.** Direct and group chats only (`.../pin/route.ts:60-61`). Pin needs an accepted chat, no suspension or ban, no block (`:63-70, 111-117`); unpin is open to a blocked pair (`:165-190`). Stored: who and when; sent: `pinned_at`, never who (`src/lib/chat/pins-read.ts:35-37, 163-185`). The table has no client access, a pin goes with the message or its removal, and the pinner's deletion empties `pinned_by` (`supabase/migrations/20261004100000_chat_message_pins.sql:307-324, 338-351`).

**Rooms and who can post.** Each row of the 5e table against `can_post_org_channel` (`20261004110000_chat_room_post_policy.sql:577-616`) and `can_view_org_channel` (`20261001100000_chat_v2_rooms.sql:1319-1344`). Event chat members: owner, admins, and members who marked Going or Interested (`:919-931`). The rule in words, not the names (`src/lib/chat/room-rules.ts:66-70`); "Only officers" is the app's label (`src/components/desktop/messages/rooms-dialog-rules.ts:171, 188`).

**Requests, read markers, typing.** Connected is a follow both ways (`src/lib/connections/queries.ts:112-139`). A pending person's read is stored like anyone's (`.../read/route.ts:19-23`), and the other side gets the latest read time and who is typing in a direct or group chat only (`.../messages/route.ts:154-170, 213-227`).

**Blocks.** Club rooms: both directions go into the block set (`src/lib/chat/blocks.ts:21-35`), the blank and the Board exception (`src/lib/chat/stub.ts:33-46`), and no block clause in the database rule for reading club messages (`supabase/migrations/20260923090000_moderation_foundation.sql:2244-2252`). A group never takes in someone with a block against a member (`.../members/route.ts:158-177`).

**Removal and moderation.** A club's owner, admin or mod marks a message, never deletes it; who did it goes to a table only the server reads; an open report stops them with "report_open" (`.../messages/[messageId]/route.ts:131-133, 165-181, 188-206`). The sender's own delete is a hard delete, open report or not (`:96-108`). Removed rows go to their author only (`moderation_foundation.sql:2232-2252`). A suspended or banned account's sent messages stay readable (same policy: no visibility test on the sender). Polls: anonymous names nobody, the creator included; sign-ups cannot be anonymous (`src/lib/chat/cards/hydrate.ts:153-173`; `cards/body.ts:150-166`); votes have no client access (`20261001110000_chat_v2_cards.sql:668-678`).

**Events and RSVPs.** A club event's attendee list: current owner and admins only (`supabase/migrations/20260928110000_club_events_rules.sql:342-362`; `src/app/api/events/[id]/attendees/route.ts:61-70`). Lists carry totals and your own answer (`src/app/api/events/route.ts:340-362`). Every event belongs to a club (`:466-471`). The event's chat goes with the event (`chat_v2_rooms.sql:710`).

**Who liked, saved, viewed.** Likes: own rows only, the author is told by a notice naming the liker (`supabase/migrations/20260922110000_t1_close_world_readable_selects.sql:285-287`; `src/app/api/posts/[id]/like/route.ts:122-125`). Saves: a count, never a name, Vibe+ or not (`src/app/api/me/posts/[id]/savers/route.ts:71-87`). No notice type exists for a save or a repost (`20260930100000_event_cancel_notices.sql:153`).

**The waitlist, every number and every "deleted".** 40 and 30 promised, 38 and 28 enforced (`src/lib/waitlist/types.ts:19-35`; `waitlist_margin.sql:78-89, 121-133`); 7 days (`src/lib/waitlist/tokens.ts:25`); 14 days, capped at the entry's end (`waitlist_margin.sql:185, 209`); one daily job (`vercel.json`; `src/app/api/cron/waitlist-purge/route.ts:37-52`). Both waitlist emails carry the link (`src/lib/waitlist/email-content.ts:133-135, 152, 205`). "Yes, take me off" (`src/app/waitlist/confirm/confirm-client.tsx:192`) deletes the entry after the email log forgets the address (`src/lib/waitlist/store.ts:297-318`). A new link retires the old one (`:205-240`, `waitlist_margin.sql:214`). Three sends a day per address under a scrambled key (`src/app/api/waitlist/route.ts:125-127`). The list shows a masked address, and a full one only after its log row (`src/lib/waitlist/admin-view.ts:41-53`; `src/app/api/admin/waitlist/[id]/reveal/route.ts:47-60`). The hand-added entry's fields (`store.ts:431-451`). The wave note has no personal field and goes with the account (`supabase/migrations/20261003140000_waitlist_retention.sql:78-91`).

**Deleting a post, a message, an account.** Account: Vibe+, files, waitlist entry, sign-in record, in that order, and what each failure leaves (`src/app/api/me/route.ts:110-160`). Chat photos of messages that still exist are found by their rows and deleted; a deleted message's photo cannot be found (`src/lib/profile/storage-purge.ts:46-55`). Evidence is moved before the sweep and never deleted by it (`:26-33, 57-64`). No chat is deleted by the app (the only `channels` deletes: a failed create, `src/app/api/me/threads/route.ts:331, 396`, and a club room, `src/app/api/orgs/[slug]/channels/[channelId]/route.ts:285`). Invites are marked, never deleted (`src/app/api/orgs/[slug]/invites/[id]/route.ts:94-99`); a join request cannot be taken back (`.../join/route.ts:273-311` deletes the membership only). Nothing but waitlist entries is deleted on a schedule.

## Sentences that lean on a listed change or a setting

- **5h line 318, the club-room clause:** true on every screen only after **row 56** (small, exact, but in part 2, not today's deploy). Not acceptable as written; see M1.
- Section 9 points to `connectvibe.app/legal/delete-account`. Its lines contradict sections 8 and 9 until **row 3** ships (small, exact, in today's deploy). Acceptable if row 3 goes out with the policy.
- The block dialogs and the Settings line contradict 5a and 5e until **row 48** ships (small, exact, in today's deploy; I read all five places and the row's wording is right). Same condition.
- Section 11's "a cofounder may also write to you about setting up its page" and "to learn what to build" are not in the form's notice until **row 6** ships (small, exact, in today's deploy). Same condition.
- "Up to 40 days", "up to 30 days" and "A clean-up is scheduled" hold only if `CRON_SECRET` is set (part 3, item 2, today). "keeps that count under a scrambled code" leans on `SCHOOL_EMAIL_VERIFY_SECRET` (item 3).
- Pins and post rules exist in production only after the two October 4 migrations are applied; 5e's "you may not have them yet" covers it.
- Two sentences are promises a person keeps, not code: deleting by email "by hand: its files first, then its records" (D15) and "we aim to delete the comment or the messages by hand" (D16). Both are in `decisions.md` part D.

---

# Round 2 notes (11:04, kept as written)

2026-10-04, second round. Independent checker of `privacy-policy-final.md` as rebuilt after round 1 (not the writer). Read-only: nothing was edited in the release worktree or the repo, production was not touched. This is not legal advice.

**Skill.** My job names no skill, so none was loaded. The framework in the job was used: try to disprove each sentence in the code, quote file and line.

**Code read.** The release worktree, branch `release-s74` at `62a2daa` (the three merges are done). Paths below are from its root. I read the code again for this round and did not lean on round 1's "confirmed" list.

**Scope.** Short version lines 2 to 7; section 1 (what the admin tools show); 3c; the section 5 table and 5a to 5i; section 8; section 9; section 11; section 12. About 175 sentences.

**Result: does not pass yet. 0 high, 1 medium, 6 low.** Round 1's three mediums and seven lows are all closed in the text (table below). The one medium is new: round 1 and the October 3 check both missed it. It is a one-sentence fix in the policy, or a small code fix.

## Medium

### M1. A removed message in a direct or group chat is not marked as removed, and no reason is shown

- **Where:** 5h, "Removed content": "If the Vibe team removes your post, comment or message, you still see its text, marked as removed with the reason." (line 302)
- **True for:** a post and a comment (their routes send the removal and the reason to the author), and a message in a club room on the new chat screens (`src/components/mobile/messages/club/RoomThread.tsx:378-382`, `BoardView.tsx:178-181`, `BoardPost.tsx:474-477`).
- **False for:** a message in a direct or group chat, on the phone and on desktop. The sender still sees the message as an ordinary bubble. No mark, no reason. Everyone else stops seeing it.
- **Code:**
  - The read sends the removal as one field, `removed: { by, at, reason }` (`src/lib/chat/message-read.ts:548-556, 671`), and says the old column names never reach the screens (`:559-563`: "a column that is only read (`removed_at`, `removed_reason` ...) cannot reach the JSON").
  - The direct and group chat screens only look for the old names. Phone: `src/components/mobile/messages/MessageBubble.tsx:625-628` ("Unreachable today") and `src/components/mobile/messages/types.ts:124-132` ("the card below never renders, and a student's own removed message still sits in their thread looking sent"). Desktop: `public/html/messages.html:1502-1506` ("this renders nothing on today's deploy") and `:2611-2616` (`removedAt: m.removed_at || null`).
  - The moderators' own screen says so when they remove a message: "The sender will be shown it once the removed-message notice ships." (`src/app/admin/reports-client.tsx:950-951`).
- **So:** a student whose direct message was taken down by the Vibe team is not told. To them it looks sent. The policy promises the opposite, in the one paragraph that says how a person learns of a removal.
- **Why October 3 missed it:** V1-22 checked the database rule (the author can still read the row) and the card component, not whether the chat screens ever show the card.
- **Fix, pick one.**
  - Policy (one sentence, true today): "If the Vibe team removes your post or comment, you still see its text, marked as removed with the reason. A message they remove also stays visible to you and to nobody else. In a club room it is marked as removed. In a direct or group chat it is not marked yet, so it can look to you as if it was still sent."
  - Code (small, exact, but not on the list today): in `public/html/messages.html:2615-2616` read `m.removed` (`removedAt: (m.removed && m.removed.at) || null`, `removedReason: (m.removed && m.removed.reason) || ''`); in `src/components/mobile/messages/MessageBubble.tsx:628-636` read `message.removed` the same way (type at `types.ts:124-132`); then change the moderators' line at `reports-client.tsx:950-951`. If this ships with the policy, line 302 can stay as written. It would need a new row in part 1 of `page-and-code-changes.md`.

## Low

1. **Section 8, "What Vibe does not delete yet": the record that you once followed a club is missing.** When you unfollow a club, or its owner or an admin drops you as a follower, the follow goes but a second record stays: the club, your account and the date you first followed. `supabase/migrations/20260916120000_org_followers.sql:638-646` ("This table is never deleted from by the application"); `src/app/api/orgs/[slug]/follow/route.ts:137` and `followers/[userId]/route.ts:30` ("`org_follow_firsts` is left alone"). It goes only when the club or your account is deleted. No other user is shown it after you unfollow. The October 3 text said this (V4-65, confirmed) and v3 dropped it. Short version line 2 itself says what you follow can show your religion or politics, so the line is worth keeping. Suggested bullet: "The date you first followed a club. It stays after you unfollow, until the club or your account is deleted. No other user is shown it."

2. **5e, "In a room where you cannot post, you can still read, vote in polls and take a sign-up spot." (line 258)** True for a Board and for a room where the club chose who posts. Not true for an event's chat after it closes: there you cannot post and you cannot vote or take a spot either. `supabase/migrations/20261004110000_chat_room_post_policy.sql:667-670` (`v_kind = 'event' and not can_post_org_channel(...)` raises "closed"). Suggested: "In a room where the club chose who can post, you can still read, vote in polls and take a sign-up spot."

3. **5e, "A message from someone you are not connected with arrives as a request." (line 242)** True for a direct chat. In a group chat it is not: the person who makes the group must be connected with each person they add (`src/app/api/me/threads/route.ts:266-272`), but the people added need not be connected with each other, and everyone is in at once with no request (`:320-326`, `accepted_at: now`). Suggested: "A direct message from someone you are not connected with arrives as a request. In a group chat, a person you are connected with can add you alongside people you are not connected with."

4. **Section 9, suspended or banned: "Everyone else stops seeing your profile, posts and comments". (line 455)** One place still shows the name, handle and photo: the club's member list, which members read. It is read with the service role and has no check for a suspension or ban (`src/app/api/orgs/[slug]/members/route.ts:95-100`). Suggested: add "Your name can still show in the member list of a club you are in."

5. **Section 11, "One thing starts them again: sending the form again before you confirm, which also saves your new answers." (line 511)** A reader takes "sending" and "your" to mean themselves. Anyone who types your address can do it, up to three times a day, and their answers replace yours (`src/lib/waitlist/store.ts:193-203`: "Anyone can type anyone's address, so the answers belong to the newest link"; `src/app/api/waitlist/route.ts:59-69, 126`). Row 30 of the change list is the code fix. Until it ships, suggested: "One thing starts them again: the form being sent again for your address before you confirm. That also replaces the answers, and anyone who types your address can do it."

6. **Section 9, deleting by email: "The cofounder with direct access then deletes the account's records and its files." (line 407)** No tool does this. The file clean-up runs only from the Settings button (`src/lib/profile/storage-purge.ts`, called only at `src/app/api/me/route.ts:118`; `scripts/` has no deletion script). Deleting the sign-in record by hand removes the database records and leaves every file; chat photos can no longer be found at all once the message records are gone (`storage-purge.ts:46-55`). It also skips the Vibe+ cancel and the evidence step. This is a promise a person keeps, and it is not in `decisions.md` part D. Add it there, or write the steps down (files first, then the sign-in record) before the first request arrives.

## Round 1's findings: all ten are closed in the text

| Round 1 | What it was | Now (line) |
|---|---|---|
| M1 | Waitlist "30 days" applies only with no access code | Closed: line 9 and the section 11 table ("with no access code sent"), matching `supabase/migrations/20261003170000_waitlist_margin.sql:84-89` and `src/lib/waitlist/types.ts:59-68` |
| M2 | Blocks in club rooms: the Board exception | Closed: line 261, matching `src/lib/chat/stub.ts:33-46` |
| M3 | An error or speed report can carry what you were sending | Closed in the text: 3d (line 122), 5h (line 298), section 6 (line 330), section 11 (lines 492 and 520). Row 14 would remove the sentences; the text is true without it |
| L1 | The room shows its rule, not the people picked | Closed: line 258, matching `src/lib/chat/room-rules.ts:66-70` and the owner-and-admin-only list at `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:43-57` |
| L2 | Who can pin | Closed: line 243 ("anyone who has accepted the chat") and line 244 ("neither of you can send or pin"), matching `.../messages/[messageId]/pin/route.ts:69-70, 111-117` |
| L3 | RSVPs when a club takes you out | Closed: line 362 ("upcoming events only"), matching `supabase/migrations/20260928100000_club_membership_rules.sql:307-316` |
| L4 | Events row | Closed: lines 363 and 364 |
| L5 | Short version 6 | Closed: line 26 |
| L6 | Hand-added entry; the no-code list | Closed: lines 496, 526 and 441, matching `src/lib/waitlist/store.ts:439-446` and `supabase/migrations/20261003100000_waitlist.sql:153-160` |
| L7 | Step 3 failing | Closed: line 420, matching `src/app/api/me/route.ts:148-160` |

## Tried to disprove this round, and could not

**Pinned messages.** Only a direct or group chat (`.../messages/[messageId]/pin/route.ts:58-61`). Pin needs an accepted chat, no suspension or ban and no block in the chat (`:63-70, 111-117`); unpin is open to a blocked pair (`:172-190`). The list goes to everyone in the chat, a pending request included, with `pinned_at` and never who (`src/lib/chat/pins-read.ts:35-37, 163-185`; `message-pins/route.ts:79-83, 90-95`). The table has no client access (`supabase/migrations/20261004100000_chat_message_pins.sql:322-324`). A pin goes with the message (`:308-309`), with a removal (`:338-351`), and the pinner's deletion empties `pinned_by` (`:312`). The "Pinned and Shared" list reads the same rows the thread does (`shared/route.ts:92-100`).

**Rooms and who can post.** The 5e table against `can_post_org_channel` (`supabase/migrations/20261004110000_chat_room_post_policy.sql:577-616`) and `can_view_org_channel` (`20261001100000_chat_v2_rooms.sql:1319-1344`): each row matches. An event chat's members are the club's owner, admins and members who marked Going or Interested (`chat_v2_rooms.sql:919-931`); the "going" faces there are chat members only (`src/lib/chat/message-read.ts:992-1040`). The by-name list is owner and admin only in the app, and mods can read it in the database (`supabase/migrations/20260507130000_org_channel_pinning_and_access.sql:40-50`). `added_by` and `added_at` are stored (`:24-30`).

**Blocks.** Direct chat leaves both inboxes (`src/app/api/me/threads/route.ts:704-751`). In a group, one block stops both from sending (`src/lib/safety/pair-block.ts:144-172`; `chat_v2_rooms.sql:1422-1439`). In club rooms the blank is put in by the read, on every screen, flag or no flag (`src/app/api/me/threads/[id]/messages/route.ts:131-149`; `src/lib/chat/message-read.ts:640-642`), and the chat list never previews a blocked person's message (`threads/route.ts:718-727`). The database rule for reading club messages has no block clause (`supabase/migrations/20260923090000_moderation_foundation.sql:2244-2252`), so "The blank only hides messages on screen" is right.

**When the team reads messages.** The admin tools read only `id, user_id, channel_id, removed_at` of a reported message (`src/app/api/admin/reports/route.ts:447`); the text shown is the report's copy (`src/app/api/me/reports/route.ts:65, 330-337`). A reported chat's copy holds no messages (`:339`). A reported poll's copy holds totals, no names (`src/lib/chat/cards/snapshot.ts:51-59`). The alert email holds the kind of thing, the reason's label and a link, no content (`src/lib/moderation/alerts.ts:109-121`). A mention notice stores the message's id, not its text (`threads/[id]/messages/route.ts:586-593`).

**Events and RSVPs.** Lists need sign-in (`src/app/api/events/route.ts:106-113`). Who RSVP'd goes to the club's owner and admins (`src/app/api/events/[id]/attendees/route.ts:61-70`; rule `rsvps_select_own_or_manager`, `supabase/migrations/20260922110000_t1_close_world_readable_selects.sql:306-307`). A removal by the club drops RSVPs to its events that have not ended; leaving on your own keeps them (`supabase/migrations/20260928100000_club_membership_rules.sql:307-316`).

**The waitlist, every number and every "deleted".** 40 and 30 promised, 38 and 28 enforced (`src/lib/waitlist/types.ts:19-35`; `waitlist_margin.sql:84-89, 121-133`). 7 days (`src/lib/waitlist/tokens.ts:25`; `store.ts:280-288`). 14 days, capped at the entry's end (`waitlist_margin.sql:185, 209`). One daily job (`vercel.json`; `src/app/api/cron/waitlist-purge/route.ts:37-52`). "Take me off" deletes the entry and clears the email log's scrambled code first (`store.ts:297-318`; `src/app/api/waitlist/leave/route.ts:40-44`); the page stops offering it once joined (`src/app/waitlist/confirm/confirm-client.tsx:57, 64, 115`). Account deletion takes the entry the code came from (`store.ts:326-332`; `supabase/migrations/20261003120000_waitlist_hardening.sql:477-502`). The wave note and the access-code record go with the account (`20261003140000_waitlist_retention.sql:78-87`; `20261003130000_waitlist_code_scrub.sql:12-15`). A full address is shown only after its log row is written (`src/app/api/admin/waitlist/[id]/reveal/route.ts:47-60`). The cofounder log holds a row id and small flags (`.../add/route.ts:82-88`, `[id]/send-code/route.ts:115-121`, `[id]/remove/route.ts:45-51`). The table's columns match the "We add" list (`20261003100000_waitlist.sql:163-215`).

**Deleting a post, a message, an account.** Post: a removed post cannot be deleted (`src/app/api/posts/[id]/route.ts:499-504`), the row goes first and the files after, best effort (`:508-540`). Message: the sender's delete is a hard delete (`.../messages/[messageId]/route.ts:98-108`); its file is never touched; a signed link lives an hour (`.../media/route.ts:16`). Account: Vibe+, files, waitlist entry, sign-in record, in that order (`src/app/api/me/route.ts:110-148`); evidence is moved before the sweep (`src/lib/profile/storage-purge.ts:354-381`); group pictures are never swept. No chat is ever deleted by the app (the only `channels` deletes are a failed create and a club room). Nothing but waitlist entries is deleted on a schedule (no `cron.schedule` in `supabase/migrations`).

## Sentences that lean on a listed change or a setting

- **No sentence in these sections is true only after a listed code change.** One sentence is false today and no listed row fixes it: 5h line 302 (M1 above).
- Section 9 points to `connectvibe.app/legal/delete-account`. The page exists; three of its lines contradict sections 8 and 9 until **row 3** ships (small, exact, in today's deploy). Acceptable if row 3 goes out with the policy.
- The in-app block dialogs contradict 5a and 5e until **row 48** ships (small, exact, in today's deploy). Same condition.
- "Up to 40 days", "up to 30 days" and "A daily clean-up is set to delete" hold only if `CRON_SECRET` is set in Vercel (part 3, item 2, for today). Section 11's "keeps that count under a scrambled code, not the address" leans on `SCHOOL_EMAIL_VERIFY_SECRET` (item 3): without it the email log holds no code at all, and the per-address count sits under an unkeyed code that anyone who guesses the address can match (`src/lib/email/send-log-core.ts:147-156, 165-175`).
- Pins and post rules exist in production only after the two October 4 migrations are applied. Until then the routes answer 404 and the controls hide; 5e's "you may not have them yet" covers it.

---

# Round 1 notes (10:25, kept as written)

2026-10-04. Independent checker of `privacy-policy-final.md` (not the writer). Read-only: nothing was edited in the release worktree or the repo, production was not touched. This is not legal advice.

**Skill.** My job names no skill, so none was loaded. The framework in the job was used: try to disprove each sentence in the code, quote file and line.

**Code read.** The release worktree, branch `release-s74` at `62a2daa` (the three merges are done: `ab3a93c` landing-night, `5f3b8b0` chat-desktop, `fe40634` privacy-v2, plus four small fixes). Paths below are from its root. `main` and `landing-night` have no code commit since the Oct 3 check (`git log c71e9a4..main -- src supabase public` is empty), so the new ground is the chat-desktop branch: 36 server files, two migrations. I read all of it that bears on these sections.

**Scope.** Short version lines 2 to 7; section 1 (what the admin tools show); 3c; the section 5 table and 5a, 5b, 5e, 5f, 5g, 5h; section 8; section 9 from "Delete your account"; section 11; section 12. About 150 sentences.

**Result: does not pass yet. 0 high, 3 medium, 7 low.** Each medium is a one-sentence fix. Nothing in these sections says the opposite of what the code does on the main path; the three mediums are exceptions the text leaves out.

## Medium

### M1. The waitlist's "30 days" has an exception the text does not give

- **Where:** line 9 ("or up to 30 days if you never confirm your email") and the section 11 table, row 2 ("An entry you never confirm: up to 30 days after its last confirm email").
- **Code:** the shorter line applies only to an unconfirmed entry that has NO access code. `supabase/migrations/20261003170000_waitlist_margin.sql:85-88`: `when w.origin = 'form' and w.confirmed_at is null and w.code_hash is null then least(created_at + 38 days, ... + 28 days) else created_at + 38 days`. Same rule in `src/lib/waitlist/types.ts:62-64`. A cofounder can send a code to an entry that never confirmed: `src/app/api/admin/waitlist/[id]/send-code/route.ts:26-27` ("Single mode: any row, confirmed or not"), and `waitlist_margin.sql:186-189` checks `confirmed_at` only in batch mode.
- **So:** a person who never confirms and is sent a code anyway stays up to 40 days, not 30. Example: joined day 0, code sent day 5, deleted day 38.
- **Fix (policy, both places):** "or up to 30 days if you never confirm your email and we have not sent you an access code". Table row: "An entry you never confirm, with no access code sent | Up to 30 days after its last confirm email".

### M2. Blocks in club rooms: the Board exception was dropped

- **Where:** 5e, "Blocks in club rooms. You each see a blank in place of the other's messages."
- **Code:** `src/lib/chat/stub.ts:33-46`. A top-level Board post by a CURRENT owner or admin is never blanked: `officerPost = room.kind === "board" && thread_root_id === null && authorRole in BOARD_POSTER_ROLES; return !officerPost`. The file's header says why (`:19-20`): "a top-level Board post by a current officer shows to every member".
- **So:** someone who blocks a club's owner or admin still sees that person's Board posts, and an owner or admin who blocks a member is still read by them there. The Oct 3 check confirmed the exception (V4-28); the text lost it.
- **Fix (policy):** add after that sentence: "One exception: a post on the Board by the club's owner or an admin shows to every member, block or not."

### M3. An error report can carry what you were sending: a message's text, the waitlist form

- **Where:** 3d ("We have set these reports not to carry your account or email ... can include what your browser sent with it: your sign-in cookie ... and the rough location"); it bears on 5h (who reads messages), on section 6 (the AI assistant "if it is asked to read ... error reports") and on section 11 ("error reports go to Sentry"; Sentry is not in "What stays").
- **Code:** the Sentry kit in use captures the body of every request to the server, up to 10,000 bytes, and attaches it to error events and sampled speed events. `package-lock.json:4288-4289` (`@sentry/nextjs` 10.73.0); `node_modules/@sentry/node-core/build/cjs/integrations/http/httpServerIntegration.js:17` (`maxRequestBodySize: options.maxRequestBodySize ?? "medium"`); `node_modules/@sentry/core/build/cjs/integrations/http/patch-request-to-capture-body.js:7-64`; `node_modules/@sentry/core/build/cjs/integrations/requestdata.js:25-28` (`data: true`). Vibe's own filter knows a body arrives and removes only sign-in keys and `handle` from it: `src/lib/sentry-config.ts:164-180`. Everything else stays. One in ten requests is sampled (`:202`).
- **Bodies that hold personal text:** a message being sent (`content`, `src/app/api/me/threads/[id]/messages/route.ts`), the waitlist form (email, name, answers: `src/app/api/waitlist/route.ts:89-97`), a report's words, a school email being verified.
- **Not proven on a live event** (no production access here). Same standing as the cookie sentence: `decisions.md` part E, "one live Sentry event would confirm it".
- **Fix, pick one.** Code (small, exact): extend row 14 of `page-and-code-changes.md` to also `delete event.request.data` in both hooks, and ship it today; then no new sentence is needed. Or policy: in 3d replace the last sentence's list with "your sign-in cookie, which identifies your account, the rough location our hosting company works out from your IP address, and what you were sending at that moment, such as the text of a message or the waitlist form", drop "or email" from "not to carry your account or email", and add "Sentry's reports" to section 11's "What stays".

## Low

1. **5e, "It does not show you who can."** The room shows the rule in words: "Only officers post here." or "Only officers and people they picked post here." (`src/lib/chat/room-rules.ts:66-69`, sent as `post_line` at `src/lib/chat/message-read.ts:1191-1195`). What it does not show is the names of the people picked (`src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts:43-57`, owner and admin only). Suggested: "The room tells you the rule, for example 'Only officers post here.' It does not list the people who were picked."
2. **5e, "anyone in the chat can pin a message".** Three people in a chat cannot: one whose message request is still pending, a suspended or banned account, and either side of a block (`src/app/api/me/threads/[id]/messages/[messageId]/pin/route.ts:66-70, 112-117`). Unpin is open to a blocked pair (`:166-170`). Optional: "anyone who has accepted the chat".
3. **Section 8 table, RSVPs: "the club removes you".** Only that club's events that have not ended (`supabase/migrations/20260928100000_club_membership_rules.sql:309-316`). Suggested: "the club removes you (upcoming events only)".
4. **Section 8 table, "Events, join requests, invites | The event, the club or your account is deleted".** For an event, "your account" means the account that created it; a reader who only RSVP'd will read it as theirs. Suggested split: "Events: an owner or admin cancels it, or the club or the account that made it is deleted. Join requests and invites: the club or your account is deleted."
5. **Short version line 6** says the person you looked at sees the total. The section 5 table and 5b say any signed-in account does. The table is right. Suggested: "Anyone signed in sees how many people looked; with Vibe+ ..., the person you looked at sees who."
6. **Section 11, added by a cofounder.** The entry also stores whether you help run a club, and the no-code list also holds an optional short note and the date (`supabase/migrations/20261003100000_waitlist.sql:153-160`; V6-25, V6-56). Two small omissions.
7. **Section 9, "If step 1 or 2 fails, the account is not deleted".** True. Step 3 can fail too, after the files are gone: the account stays and a retry finishes it (`src/app/api/me/route.ts:148-160`). Optional half sentence.

## Checked and true (tried to disprove, could not)

**Pinned messages (new code).** Direct and group chats only; a club room answers `pins_chats_only` (`pin/route.ts:58-61`, `message-pins/route.ts:78-83`). Anyone in the chat unpins (`pin/route.ts:166-190`). Stored: who and when (`:153-155`). Sent to the chat: `pinned_at`, never who (`src/lib/chat/pins-read.ts:35-37, 172-181`; `pinned_by` appears nowhere else in `src`). A person added later gets the list (no join-date test in the read). A pin goes when the message is deleted, the sender's account is deleted, or the message is removed (`supabase/migrations/20261004100000_chat_message_pins.sql:30-40, 59-66`); the pinner's deletion empties `pinned_by` and keeps the pin (`:31, :64-65`). Sections 3c, 5e, 8 and 9 match.

**Rooms with post rules (new code).** The table in 5e matches `can_post_org_channel` line by line: Board owner and admin post, any member replies; event chat until 7 days after the end; `officers` = owner and admin; `listed` = owner, admin and the by-name list; Lounge, Officers and open rooms = whoever can see them (`supabase/migrations/20261004110000_chat_room_post_policy.sql:585-616`). Reading, voting and taking a sign-up spot stay open where you cannot post (`:49-62`). Only owners and admins make rooms and lists (`src/lib/club-routes/officer-guard.ts:34-35`). 3c's "adds you to a room, we store who did it and when": `added_by`, `added_at` (`.../channels/[channelId]/members/route.ts:192`; `supabase/migrations/20260507130000_org_channel_pinning_and_access.sql:24-30`). 5f's "Mods can also read the list": `:40-50`.

**Messages and blocks.** One-to-one chat leaves both inboxes: `src/app/api/me/threads/route.ts:704-754`. The admin tools read only `id, user_id, channel_id, removed_at` of a reported message; the text they show is the report's copy (`src/app/api/admin/reports/route.ts:447`; no other read of `messages` under `src/app/api/admin`, `src/lib/moderation`, `src/app/admin`). The report alert email carries no reported text (`src/lib/moderation/alerts.ts:109-121`). The other chat sentences were confirmed on Oct 3 (V4) and that code is unchanged.

**Club pages and lists.** 12 posts: `src/lib/club-routes/club-posts.ts:28`. Follower count from 5: `src/lib/orgs/following.ts:89-102`. Members of an open club to any signed-in account: `supabase/migrations/20260916103000_org_join_policy_invites.sql:778-788`. Profiles do not list a person's clubs (no `org_members` read under `src/app/api/users`).

**Deleting a post, a message, an account.** Post: `src/app/api/posts/[id]/route.ts:499-504` (a removed post cannot be deleted), `:508-540` (row first, files after, best effort). No comment delete route exists (`src/app/api/comments` has only `like`). Account: order is Vibe+, files, waitlist entry, sign-in record (`src/app/api/me/route.ts:110-148`). A message's file link lives one hour: `.../messages/[messageId]/media/route.ts:16`.

**The waitlist's numbers.** 40 and 30 promised, 38 and 28 enforced (`src/lib/waitlist/types.ts:19-35`; `waitlist_margin.sql:85-88, 115-131`); 7 days (`src/lib/waitlist/tokens.ts:25`); 14 days, once (`src/lib/waitlist/access-code.ts:18`; `waitlist_margin.sql:209`); one daily job (`vercel.json`). The form gives one answer to everyone (`src/app/api/waitlist/route.ts:25, 103, 115-116`). The form's notice now names the same five companies and links to `#waitlist` (`src/app/waitlist/waitlist-form.tsx:207-213`). No cookie is set outside the sign-in ones (`src/proxy.ts:202`, `src/lib/supabase/middleware.ts:26-30` are the only writers). The cofounder log holds a row id and small flags, no name or address (`src/app/api/admin/waitlist/add/route.ts:82-88`, `[id]/remove/route.ts:45-51`).

## Sentences that lean on a listed change or a setting

- Section 9 points to `connectvibe.app/legal/delete-account`. The page exists, but three of its lines contradict sections 8 and 9 until **row 3** of `page-and-code-changes.md` (small, exact, in today's deploy). Acceptable if row 3 ships with the policy.
- "Up to 40 days", "up to 30 days" and "A daily clean-up is set to delete" hold only if `CRON_SECRET` is set in Vercel (people-and-settings item 2, for today).
- Pins and post rules exist in production only after the two October 4 migrations are applied. Until then the routes answer 404 and the controls hide; 5e's "you may not have them yet" covers it.
- No sentence in these sections is true only after a code change that is not yet made.
