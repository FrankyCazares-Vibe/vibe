# V4: chats, clubs, events (fact check of privacy-policy-v2.md)

Checker 4, 2026-10-03. Read-only. Every row was checked against the code on `main` (the `landing-night` branch changes nothing under chat, club or event code: `git diff --stat main origin/landing-night` shows only the waitlist migrations in `supabase/migrations`).

Short names used below:
- `mig/` = `supabase/migrations/`
- `rooms.sql` = `mig/20261001100000_chat_v2_rooms.sql`
- `cards.sql` = `mig/20261001110000_chat_v2_cards.sql`
- `modfound.sql` = `mig/20260923090000_moderation_foundation.sql`
- `threads/` = `src/app/api/me/threads/`
- `orgs/` = `src/app/api/orgs/[slug]/`

Result: 69 sentences checked, 59 confirmed, 10 not confirmed (1 WRONG, 7 OVERSTATED, 2 RISKY-WORDING). 9 missing items at the end.

## The ten problems, first

| id | section | sentence (short) | verdict | evidence | corrected sentence |
|---|---|---|---|---|---|
| V4-16 | 5e | A block "does not hide old ones" | OVERSTATED | `threads/route.ts:746-754`: the inbox drops any one-to-one chat where the other person is in a block pair with the viewer, either way. Nothing is deleted, and group chats keep showing old messages. | "A block stops new messages both ways. A one-to-one chat with that person also leaves both of your inboxes. Nothing is deleted, and old messages in a group chat stay visible." |
| V4-27 | 5e | "Everywhere else, only totals" (who is going) | OVERSTATED | The event chat's own member list names the people who RSVP'd. `src/app/api/users/search/route.ts:75-90` (the @mention picker lists the chat's members), `mig/20260928150000_club_chat_posts_rules.sql:280-284` (any member of a chat can read its member rows), `rooms.sql:919-931` (an event chat's members are the owners, admins and every club member who said Going or Interested). Owners and admins also get the full list (`src/app/api/events/[id]/attendees/route.ts:72-95`). | "In an event's chat, members see the first eight people marked Going. Being in that chat also shows you who else is in it: the club's owners and admins, and every club member who marked Going or Interested. Outside the chat, other students see only totals." |
| V4-29 | 5e | "The app does this; the database rule behind it does not apply the block." | RISKY-WORDING | True: `rooms.sql:54-58`, `modfound.sql:2244-2252` (the read rule for club messages has no block clause), `src/lib/chat/stub.ts:33-46` (the app swaps the message for a blank). But the sentence tells a blocked person exactly where to look. | "The app does this for you. It is not yet enforced in every layer of our system, so do not treat a block as a guarantee inside a club chat." Better: add the block clause to the database rule, then delete the sentence. |
| V4-30 | 5e | "other members of a chat can read from our database when you last read it and whether you muted, pinned, hid or cleared it" | RISKY-WORDING | True: `mig/20260928150000_club_chat_posts_rules.sql:280-284` lets any co-member read the whole row, and no migration limits which columns are readable (`mig/20260903110000_channel_members_column_grants.sql:17-18` limits writes only). Since `rooms.sql:987-997` every club member holds such a row on Board and Lounge, so this reaches a whole club. The sentence is a how-to for watching someone's read and mute state. | "No screen shows other people when you last read a chat or whether you muted, pinned, hid or cleared it (the read time in direct and group chats aside). This state is not yet walled off from other members of the same chat inside our database." Better: limit the readable columns, then delete the sentence. |
| V4-40 | 5f | "Officers ... never see reports." | OVERSTATED | `threads/[id]/messages/[messageId]/route.ts:167-181` and `src/lib/chat/types.ts:135`: an owner, admin or mod who tries to remove a message that has an open report is told "This message has an open report. Vibe's moderators will handle it." They never see who filed it, the reason or the copy (`modfound.sql:2121-2122`: no client access to `reports`). | "Officers never see email addresses, and never see a report, who filed it or why. One thing they can learn: if they try to remove a chat message that already has an open report, the app tells them a report is open." |
| V4-50 | 5g | "the person you blocked is not notified, but the block record can be read from both sides" | OVERSTATED | No notification is written, true. But the app itself tells them: `public/html/profile.html:8557-8567` shows "This account has restricted you. You can't see their profile or message them." (also `src/components/mobile/ProfileMobile.tsx:585-592`, fed by `src/app/api/users/[handle]/bootstrap/route.ts:223-241`). | "A block is different: the person you blocked gets no notification, but if they open your profile while signed in they are told the account has restricted them, and the block record can be read from both sides." |
| V4-51 | 8 table | Messages are kept until "the sender deletes the message or their account, or the chat is deleted" | OVERSTATED | Two gaps. (1) A reply under a Board post is deleted when the post's author deletes the post or their account, not the reply's sender (`rooms.sql:713`). (2) No code path deletes a direct or group chat: the only `channels` deletes are a club room (`orgs/channels/[channelId]/route.ts:228`), a club (`src/app/api/orgs/[slug]/route.ts:812`) and an event's chat with its event (`rooms.sql:710`). | "The sender deletes the message or their account. In club chats also: the Board post it sits under is deleted, or the room, the event or the club is deleted. A direct or group chat itself is never deleted." |
| V4-54 | 8 table | RSVPs are kept until "the event, the club or your account is deleted" | OVERSTATED | You can take an RSVP back at any time and the row is deleted (`src/app/api/events/[id]/rsvp/route.ts:215-219`). If an officer removes you from a club, your RSVPs to that club's events that have not ended are deleted too (`mig/20260928100000_club_membership_rules.sql:309-316`). | "RSVPs: until you take the RSVP back, an officer removes you from the club (upcoming events only), or the event, the club or your account is deleted." |
| V4-59 | 8 bullets | "No link to it can be made" (the file of a deleted message) | WRONG | A new link can be made. The send route accepts any file key that sits in that chat's folder, with no check of who uploaded it or whether its message still exists (`threads/[id]/messages/route.ts:303-321`, `src/lib/messages/channel-access.ts:168-176`); the database check is the same (`mig/20260927120000_media_ref_ownership.sql:41-42`). Members can read the raw key of any message in their chat through the data API (same file, "DOES NOT ... revoke SELECT on raw media keys"). The media route then signs a fresh one-hour link for the new message (`threads/[id]/messages/[messageId]/media/route.ts:74-90`). Links signed before the delete also keep working for up to an hour (`:16`). | "Its photo or video file is not deleted, and account deletion cannot find it later. The app stops showing it, but the file stays in our storage, and a link opened before the delete can keep working for up to an hour." (Do not promise that no link can be made until the send route checks the uploader.) |
| V4-63 | 8 bullets | "Leaving a club deletes your votes there." | OVERSTATED | The clean-up fires when a chat-member row is deleted (`cards.sql:946-970`). The Officers room and private rooms have no such rows (access is by role or by the allow-list, `orgs/channels/[channelId]/members/route.ts:84-93`), so votes cast there stay with your name. The migration says so: `cards.sql:942-945`. The trigger also swallows its own errors (`cards.sql:963-965`). | "Leaving a club deletes your votes in its Board, Lounge, event chats and open rooms. Votes you cast in the Officers room or a private room stay." |

## Section 3c (messages, clubs, events, RSVPs, polls, sign-ups)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-1 | 3c | Clubs: memberships and roles | CONFIRMED | `mig/20260430190000_phase1_initial_schema.sql:84-91`; `orgs/members/route.ts:85-88` (role, joined_at) | |
| V4-2 | 3c | clubs you follow, with the date you first followed and how | CONFIRMED | `mig/20260916120000_org_followers.sql:663-680` (`first_followed_at`, `source`) | |
| V4-3 | 3c | requests to join with the message you wrote | CONFIRMED | `orgs/join/route.ts:224-229` (message, 500 characters); `mig/20260507100000_org_channels_schema.sql:55-65` | |
| V4-4 | 3c | invites and their outcome | CONFIRMED | `mig/20260916103000_org_join_policy_invites.sql:812-822` (status pending, accepted, declined, revoked, expired; who resolved it and when) | |
| V4-5 | 3c | Club events, your RSVPs (Going or Interested) | CONFIRMED | `src/app/api/events/[id]/rsvp/route.ts:160-173` (the route accepts only `going` and `maybe`; `maybe` is shown as Interested) | |
| V4-6 | 3c | personal calendar entries | CONFIRMED | `mig/20260508130000_personal_events.sql:28-51` | |
| V4-7 | 3c | Messages: text, photos, videos, shared posts, reactions, replies, @mentions, group names and pictures | CONFIRMED | `threads/[id]/messages/route.ts:448-461` (content, attachment, media, quoted parent, Board root); `mig/20260508150000_message_reactions_and_replies.sql:18-22`; `threads/[id]/messages/route.ts:564-599` (mention notices); `threads/[id]/route.ts:86-113` (name, picture) | |
| V4-8 | 3c | your state in each chat (last read, typing, mute, pin, hide, clear) | CONFIRMED | `mig/20260903110000_channel_members_column_grants.sql:18` lists exactly these columns, plus `accepted_at` (when you accepted a request) | |
| V4-9 | 3c | Poll votes and sign-ups in club chats, where a club has them | CONFIRMED | `cards.sql:609-639`; the routes answer 404 unless the new chat is on for you (`threads/[id]/cards/route.ts:72`, `.../vote/route.ts:59`) | |
| V4-10 | 3c | Every vote is stored with your account, even in an Anonymous poll; the room sees totals and no names | CONFIRMED | `cards.sql:631-636, 884-885` (the row holds `user_id` and a time, anonymous or not); `src/lib/chat/cards/hydrate.ts:171-172, 260-261` | |

## Section 5e (people in your chats)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-11 | 5e | Direct and group chats: members see every message, photo, video, shared post and reaction | CONFIRMED | `modfound.sql:2232-2241` (any member reads every message that is not removed; a removed one only its sender); `src/lib/chat/message-read.ts:850-858` (the only cut is your own "Clear chat" line). A person added to a group later reads the whole history too. | |
| V4-12 | 5e | ...who is in the chat | CONFIRMED | `mig/20260928150000_club_chat_posts_rules.sql:280-284` | |
| V4-13 | 5e | ...when the other side last read it, and who is typing | CONFIRMED | `threads/[id]/messages/route.ts:186-226` (in a group: the latest read among the others) | |
| V4-14 | 5e | A message from someone you are not connected with arrives as a request, which you can read before accepting | CONFIRMED | `threads/route.ts:373-392` (connected = you follow each other; otherwise the receiver's row has no `accepted_at`); `src/lib/messages/channel-access.ts:128-157` (reading needs the row, not acceptance). See MISSING 3. | |
| V4-15 | 5e | A block stops new messages both ways | CONFIRMED | `threads/[id]/messages/route.ts:431-446`; `rooms.sql:1433-1439`. In a group chat one block stops both people from sending anything to that group (`src/lib/safety/pair-block.ts:154-172`). See MISSING 5. | |
| V4-16 | 5e | It does not hide old ones | OVERSTATED | see the problems table | |
| V4-17 | 5e | Every member is in the club's Board and Lounge | CONFIRMED | `rooms.sql:835-836` (both are always public), `:987-997` (a new member gets a row on each), `:1335` | |
| V4-18 | 5e | The Officers room is for the owner, the admins and people they add | CONFIRMED | `rooms.sql:837-838, 1336-1340`; `orgs/channels/[channelId]/members/route.ts:17-40, 84-93` (only owners and admins add). A demoted officer who was added by name keeps the room (`rooms.sql:62-64`). | |
| V4-19 | 5e | Each event has a chat for club members who RSVP'd and for the club's owners and admins | CONFIRMED | `rooms.sql:1140-1156` (made with the event), `:919-931`, `:1331-1334`. "RSVP'd" = Going or Interested. An RSVP by a non-member gives no access (`:1102-1110`). | |
| V4-20 | 5e | New members can read a room's whole history | CONFIRMED | `modfound.sql:2244-2252` (no date in the rule); `src/lib/chat/message-read.ts:850` | |
| V4-21 | 5e | Read receipts and typing are not shown (club chats) | CONFIRMED | `threads/[id]/messages/route.ts:152-174` (`peer_last_read_at: null`, `peer_typing: []`) | |
| V4-22 | 5e | club chats take no photos or videos | CONFIRMED | `threads/[id]/messages/route.ts:366`; `rooms.sql:1413` (the database refuses it too) | |
| V4-23 | 5e | Polls with names on: the room sees who picked what | CONFIRMED | `src/lib/chat/cards/hydrate.ts:164-172` (a poll names the first 12 voters per option and counts the rest; people you blocked are left out) | |
| V4-24 | 5e | In an Anonymous poll nobody gets names through the app, officers included | CONFIRMED | `hydrate.ts:153, 171-172, 260-261` (names are not even looked up); `cards.sql:666-680` (the vote tables have no client access at all) | |
| V4-25 | 5e | Sign-ups always show names | CONFIRMED | `cards.sql:620, 740` (a sign-up can never be anonymous); `hydrate.ts:171` (all names) | |
| V4-26 | 5e | In an event's chat, members see the first few people marked Going | CONFIRMED | `src/lib/chat/message-read.ts:274` (8 people), `:1002-1044` | |
| V4-27 | 5e | Everywhere else, only totals | OVERSTATED | see the problems table | |
| V4-28 | 5e | Blocks in club chats: you each see a blank in place of the other's messages, except an officer's Board posts | CONFIRMED | `src/lib/chat/stub.ts:33-46, 57-80`; `src/lib/chat/message-read.ts:642`. "Officer" here means a current owner or admin, top-level posts only. | |
| V4-29 | 5e | The app does this; the database rule does not apply the block | RISKY-WORDING | see the problems table | |
| V4-30 | 5e | Other members can read your chat state from our database | RISKY-WORDING | see the problems table | |

## Section 5f (owners, admins, mods)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-31 | 5f | Owners and admins see the follower list: profile card, date first followed, how | CONFIRMED | `orgs/followers/route.ts:92-94, 163-174`; card = name, handle, photo, cover, major, year (`src/lib/connections/queries.ts:374-385`). It also shows the follower's club role. | |
| V4-32 | 5f | ...invites and their outcome | CONFIRMED | `mig/20260916103000_org_join_policy_invites.sql:857-860` (owners and admins can read every invite row with its status). The screen lists pending invites only (`orgs/invites/route.ts:304-309`) and says "They declined recently" on a re-invite (`:568-574`). | |
| V4-33 | 5f | ...who RSVP'd to the club's own events | CONFIRMED | `src/app/api/events/[id]/attendees/route.ts:61-95` (name, handle, photo, major, year, Going or Interested, when) | |
| V4-34 | 5f | They can remove a follower without that person being told | CONFIRMED | `orgs/followers/[userId]/route.ts:72-99` (a delete, no notice written) | |
| V4-35 | 5f | ...and delete any post made as the club | CONFIRMED | `mig/20260929110000_post_club_deletes.sql:280-287`; `src/app/api/posts/[id]/route.ts:405-415`. Not a post a moderator already removed. | |
| V4-36 | 5f | Owners, admins and mods see pending requests with your message and a "Removed before" mark | CONFIRMED | `orgs/requests/route.ts:105, 119-126, 194, 214`. They also see whether you are eligible (not verified, or the club is IU-only or Purdue-only): `:197-213`. | |
| V4-37 | 5f | They can remove someone's message in a club chat | CONFIRMED | `threads/[id]/messages/[messageId]/route.ts:131-133, 162-199`. The message is hidden from everyone but its author, not deleted; they cannot remove a message by someone who outranks them. | |
| V4-38 | 5f | We record who removed it | CONFIRMED | `threads/[id]/messages/[messageId]/route.ts:205, 221-241`; `cards.sql:649-656`. A failed write is only logged, so the record is best-effort. | |
| V4-39 | 5f | Officers never see email addresses | CONFIRMED | `mig/20260903100000_security_hardening.sql:36-48` (no signed-in account can read either email column); no officer route selects one (`orgs/requests/route.ts:122`, `orgs/members/route.ts:85-88`, `events/[id]/attendees/route.ts:76`, `orgs/invite-candidates/route.ts:100-101`) | |
| V4-40 | 5f | ...and never see reports | OVERSTATED | see the problems table | |

## Section 5g (only you)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-41 | 5g | Drafts | CONFIRMED | `mig/20260928120000_blocks_in_rls.sql:352-360` (others see only published posts) | |
| V4-42 | 5g | saved posts | CONFIRMED | `mig/20260430190000_phase1_initial_schema.sql:295-303` | |
| V4-43 | 5g | personal calendar entries | CONFIRMED | `mig/20260508130000_personal_events.sql:32-35` | |
| V4-44 | 5g | your notifications | CONFIRMED | `mig/20260504150000_notifications.sql:33-36` | |
| V4-45 | 5g | your mute list | CONFIRMED | `mig/20260506100000_safety_block_mute_report.sql:59-62`; `mig/20260506140000_channel_member_mutes.sql:28` | |
| V4-46 | 5g | Otto settings and reminders | CONFIRMED | `mig/20260903100000_security_hardening.sql:39-48` (`otto_settings` is not readable by others); `mig/20260512000000_otto_reminders_and_settings.sql:43` | |
| V4-47 | 5g | your redaction bars | CONFIRMED | `mig/20260905100000_revoke_resume_redactions_select.sql:38` | |
| V4-48 | 5g | your hidden-sections list | CONFIRMED | `mig/20260926100000_users_profile_layout.sql:141-143`; `src/app/api/users/[handle]/bootstrap/route.ts:268-269` (other people get `hidden: []`) | |
| V4-49 | 5g | your "here for" answers | CONFIRMED | `mig/20260903100000_security_hardening.sql:39-48` (`otto_answers` has no read grant) | |
| V4-50 | 5g | A block: the person is not notified, the record can be read from both sides | OVERSTATED | see the problems table | |

## Section 8 (how long we keep things)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-51 | 8 table | Messages: kept until the sender deletes the message or their account, or the chat is deleted | OVERSTATED | see the problems table | |
| V4-52 | 8 table | An event's chat stops taking messages 7 days after the event ends; it is deleted with the event | CONFIRMED | `rooms.sql:1385-1388` (the database refuses a send after `ends_at + 7 days`), `:710` (the room cascades with the event); `src/lib/chat/room-state.ts:30`. The chat stays readable after it closes. | |
| V4-53 | 8 table | Events: kept until the event, the club or your account is deleted | CONFIRMED | `src/app/api/events/[id]/route.ts:192-196` (cancel = delete); `mig/20260928110000_club_events_rules.sql:488-491` (club delete cascades); `mig/20260430190000_phase1_initial_schema.sql:124` (creator's account) | |
| V4-54 | 8 table | RSVPs: kept until the event, the club or your account is deleted | OVERSTATED | see the problems table | |
| V4-55 | 8 table | Answered requests to join, and invites: kept until the club or your account is deleted | CONFIRMED | `orgs/requests/[id]/route.ts:324-325` (answered = status change, the row stays); `orgs/invites/[id]/route.ts:96`, `src/app/api/me/org-invites/[id]/route.ts:101`; cascades at `mig/20260507100000_org_channels_schema.sql:57-58` and `mig/20260916103000_org_join_policy_invites.sql:814-815` | |
| V4-56 | 8 table | An unanswered invite expires after 30 days; its record stays | CONFIRMED | `mig/20260916103000_org_join_policy_invites.sql:820`; `src/lib/orgs/membership.ts:383` (the row is marked `expired`, not deleted) | |
| V4-57 | 8 bullets | A message is deleted at once for everyone, with its reactions and, for a Board post, every reply under it | CONFIRMED | `threads/[id]/messages/[messageId]/route.ts:98-108` (a hard delete); `mig/20260508150000_message_reactions_and_replies.sql:18`; `rooms.sql:713`. A poll or sign-up message takes everyone's votes with it (`cards.sql:611, 633`). | |
| V4-58 | 8 bullets | Its photo or video file is not deleted, and account deletion cannot find it later | CONFIRMED | The delete route never touches storage (same file, whole body); `src/lib/profile/storage-purge.ts:198-223` finds files only through message rows that still exist; `src/lib/r2.ts:327` is called from nowhere else | |
| V4-59 | 8 bullets | No link to it can be made | WRONG | see the problems table | |
| V4-60 | 8 bullets | After you leave a chat or a club, your messages stay and the app no longer lets you delete them | CONFIRMED | `threads/[id]/messages/[messageId]/route.ts:82-116` (the row can no longer be read, so the route answers 403); leaving deletes only the membership rows (`threads/[id]/members/[userId]/route.ts:108-112`, `mig/20260928100000_club_membership_rules.sql:295-305`) | |
| V4-61 | 8 bullets | "Clear chat history" and "Delete conversation" delete nothing; they hide the chat from you only | CONFIRMED | `threads/[id]/clear/route.ts:27-31` (sets `cleared_at`); `threads/[id]/hide/route.ts:23-27` (sets `hidden_at`); the labels: `src/components/mobile/messages/ConversationActionSheet.tsx:297, 348`, `public/html/messages.html:3115-3118` | |
| V4-62 | 8 bullets | Group chat pictures are never deleted by any part of Vibe today | CONFIRMED | `src/lib/r2.ts:287-290` (`groups/` is never purged); the only storage deletes in `src` are video folders, club folders and message files (`src/lib/profile/storage-purge.ts:371-375`, `src/lib/posts/delete-media-store.ts:147, 271`); replacing a picture only changes the stored key (`threads/[id]/route.ts:135-138`) | |
| V4-63 | 8 bullets | Leaving a club deletes your votes there | OVERSTATED | see the problems table | |
| V4-64 | 8 bullets | The messages you wrote stay | CONFIRMED | `mig/20260928100000_club_membership_rules.sql:295-305` (leaving removes room rows, never messages) | |
| V4-65 | 8 bullets | The date you first followed a club is kept after you unfollow | CONFIRMED | `mig/20260916120000_org_followers.sql:632-650` (`org_follow_firsts`, never deleted by the app; it goes with the club or your account) | |

## Section 9 (what your deletion takes from other people)

| id | section | sentence (short) | verdict | evidence | corrected |
|---|---|---|---|---|---|
| V4-66 | 9 | Events you made as a club are deleted | CONFIRMED | `mig/20260430190000_phase1_initial_schema.sql:124` (`creator_id ... ON DELETE CASCADE`, never changed since) | |
| V4-67 | 9 | Each event takes everyone's RSVPs and its whole chat, other people's messages included | CONFIRMED | `mig/20260430190000_phase1_initial_schema.sql:136` (RSVPs), `rooms.sql:710` (the chat room), `phase1_initial_schema.sql:115` (its messages) | |
| V4-68 | 9 | No cancel notice is sent | CONFIRMED | Notices are written only by the cancel route (`src/app/api/events/[id]/route.ts:219`); account deletion (`src/app/api/me/route.ts:109-151`) deletes the sign-in and lets the database cascade | |
| V4-69 | 9 | Messages you sent disappear from other people's chats, and so do replies under your Board posts | CONFIRMED | `phase1_initial_schema.sql:116`; `rooms.sql:713` | |

## MISSING (the code does it, a user would want to know, the policy does not say)

1. **Members of a club see the whole member list.** Every member gets each member's name, handle, photo, verified badge, role and join date (`orgs/members/route.ts:78-110`). The policy only says member lists are "not public" (5a) and mentions a database read for open clubs (5b). It never says members see each other.
2. **Being in an event chat shows who RSVP'd.** Covered by the correction to V4-27: the chat's member list is every club member who marked Going or Interested, plus owners and admins.
3. **The sender sees that you read a message request.** Opening a request marks it read (`public/html/messages.html:2573`, no check for a request), and the sender's screen gets your read time (`threads/[id]/messages/route.ts:186-216`, no check for acceptance). "You can read before accepting" is true, but it is not silent.
4. **A block does not stop reactions.** Someone you blocked can still add an emoji reaction to a message in a group chat you share: the react route has no block check (`threads/[id]/messages/[messageId]/react/route.ts`, no `block` anywhere) and neither has the database rule (`modfound.sql:2541-2553`).
5. **A block inside a group chat silences both people for that whole group.** Neither of you can send anything to the group while the block lasts, and the refusal ("Couldn't send this message") can let the other person guess (`threads/[id]/messages/route.ts:431-446`). Nobody new can be added who has a block with anyone already in it (`threads/[id]/members/route.ts:36-40`).
6. **Being removed from a club leaves a record and deletes RSVPs.** We store that an officer removed you, who did it and when, until you are let back in or the club or your account is deleted (`mig/20260928100000_club_membership_rules.sql:240-246, 331-340`). Your RSVPs to that club's upcoming events are deleted (`:309-316`), and you must ask to come back even to an open club (`orgs/join/route.ts:131-132`). Section 3c does not list this record; 5f only mentions the "Removed before" mark.
7. **You cannot withdraw a request to join.** No route cancels one (`orgs/join/route.ts` has POST and DELETE-leave only; requests are changed only by officers in `orgs/requests/[id]/route.ts`). The request, with your message, stays in front of the officers until they answer it.
8. **Clubs can have extra rooms.** Owners and admins can add rooms beyond Board, Lounge and Officers (`orgs/channels/route.ts`, POST). An open one is for every member; a private one is for owners, admins and the people they add, and only owners and admins see that access list (`orgs/channels/[channelId]/members/route.ts:43-64`). Section 5e reads as if a club has three rooms and event chats only.
9. **An officer's removal hides a message; it does not delete it.** The author still sees it marked as removed by a club officer, everyone else stops seeing it, and the row stays in the database (`threads/[id]/messages/[messageId]/route.ts:39-46, 188-195`). Section 5h says this for Vibe's moderators only.
