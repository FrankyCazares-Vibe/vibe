# New facts in the release code: what Privacy Policy v2 never saw

2026-10-04. Job: newfacts. Skill: none was named for this job, so none was called. Not legal advice.

## How this was checked

- Code read from the release worktree `scratchpad/release` (branch `release-s74`). Its log shows the three merges done: `ab3a93c` landing-night, `5f3b8b0` chat-desktop, `fe40634` privacy-v2. Nothing there was edited.
- Paths below are from the repo root. They are the same in the worktree and on the branches.
- "Policy today" quotes `handoffs/legal-2026-10-03-privacy/privacy-policy-publish.md` (v2).
- Verdicts: RIGHT (the policy says it and it is true), WRONG (the policy says something the code does not do), SILENT (the code does it and the policy does not say).
- The waitlist code has not moved since the Oct 3 check: the last commit on `origin/landing-night` is `21af1a5` (Oct 3, 15:58), before the checkers started (16:26). So `verify/V6-waitlist.md` still describes the code. I re-read the code anyway. Part B lists only what is still wrong or missing in the publish text.
- Production was not read. Three sentences rest on a production setting. They are in part F.

Short names used below:

| Short | File |
|---|---|
| PINS-MIG | `supabase/migrations/20261004100000_chat_message_pins.sql` |
| POST-MIG | `supabase/migrations/20261004110000_chat_room_post_policy.sql` |
| PIN-PUT | `src/app/api/me/threads/[id]/messages/[messageId]/pin/route.ts` |
| PINS-GET | `src/app/api/me/threads/[id]/message-pins/route.ts` |
| SHARED | `src/app/api/me/threads/[id]/shared/route.ts` |
| ROOM-LIST | `src/app/api/orgs/[slug]/channels/[channelId]/members/route.ts` |
| ROSTER | `src/app/api/orgs/[slug]/members/route.ts` |
| SPACE | `src/app/api/orgs/[slug]/space/route.ts` |
| WL-n | `supabase/migrations/2026100310000..170000_waitlist*.sql` (100000 = WL-1 ... 170000 = WL-8) |
| STORE | `src/lib/waitlist/store.ts` |

---

## A. Messages on desktop (branch chat-desktop)

The whole new database surface is: one table (`chat_message_pins`), one trigger on `messages`, one column (`channels.post_policy`), and two functions restated. No other table or column is new.

### A1. Pinned messages

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| A1.1 | A pin is one row: the message, the chat, who pinned it, when. | PINS-MIG:307-314 | 3c: "Messages and everything in them, your settings in each chat, and poll votes and sign-ups in club chats." | SILENT |
| A1.2 | A pin holds no copy of the message. The list reads the live message each time. | `src/lib/chat/pins-read.ts`:35-37 | none | SILENT (good news: nothing lingers) |
| A1.3 | Only direct and group chats have pins. A club room answers "Pinning only works in direct messages and group chats." | PIN-PUT:59-61; PINS-GET:79-83; `src/lib/chat/types.ts`:177 | none | SILENT |
| A1.4 | Who can pin: anyone in the chat who has accepted it. Not while the chat is still a message request for them (line 70). Not a suspended or banned account, and not one that has not accepted the Terms (66-67). Not in a blocked pair (112-117). | PIN-PUT:40-73, 105-117 | none | SILENT |
| A1.5 | Up to 20 pins per chat. Two people pinning at the same instant can leave 21. | `src/lib/chat/pin-rules.ts`:25; PIN-PUT:135-149 | none | SILENT (no number needed in the policy) |
| A1.6 | Who can unpin: anyone in the chat, whoever pinned it. A blocked pair can still unpin. | PIN-PUT:165-190 | none | SILENT |
| A1.7 | Who sees pins: everyone in the chat. That includes a person whose message request is still pending and someone added to a group later. The route's own note says a suspended account may still read the list too (this route has no restriction gate; I did not test whether an earlier gate stops it), so do not write that suspension hides pins. | PINS-GET:54-57, 63-83; pins-read.ts:104-107 | 5e: "Someone added later can read the whole history." | SILENT on pins, consistent with 5e |
| A1.8 | What each person sees for a pin: the whole text of the message, its author (name, handle, photo), the message's time and the time it was pinned. An author whose profile is hidden from the viewer (suspended or banned) shows with no name. | `src/lib/chat/types.ts`:501-519; PINS-GET:104-116 | none | SILENT |
| A1.9 | Who pinned is stored but shown to nobody. The list never selects `pinned_by`. The table has row security on, no policy, and no grant to signed-in users, so no member can read it any other way. The cofounder with direct access can. | pins-read.ts:35-37; PINS-MIG:322-324 | 5h: "The cofounder with direct access (section 1) could open any message." | SILENT |
| A1.10 | Pinning is rate limited: 30 pin or unpin actions per 10 minutes, counted per account id. | PIN-PUT:63-65 | 3d: "We count how often some actions happen, mostly per account." | RIGHT |

What happens to a pin (asked for by name in the job):

| # | Event | Result | Where |
|---|---|---|---|
| A1.11 | The sender deletes the message | The pin goes with it (the delete is a real delete, and the pin row cascades). | PINS-MIG:59-61, 308-309 |
| A1.12 | The message's author deletes their account | Their messages are deleted, so the pins on them go too. | `supabase/migrations/20260430190000_phase1_initial_schema.sql`:116; PINS-MIG:308-309 |
| A1.13 | The person who pinned deletes their account | The pin stays. Only the "who pinned" field is emptied. | PINS-MIG:64-65, 312 |
| A1.14 | The Vibe team removes the message | The pin is dropped at that moment. Restoring the message does not bring the pin back. | PINS-MIG:338-351 |
| A1.15 | "Clear chat history" | Pins on messages older than your clear mark are hidden from you only. Everyone else still sees them. | `src/lib/chat/pin-rules.ts`:73-79; PINS-GET:115 |
| A1.16 | You leave a group | Pins on your messages stay (your messages stay: policy section 8). You can no longer unpin them. | PIN-PUT:58-60 (members only) |
| A1.17 | A block | Existing pins stay. Neither of you can add one. Either can unpin. | PIN-PUT:111-117, 165-170 |

Policy today on these: section 8 table, "Messages | The sender deletes the message or their account." Section 9, "Messages you sent disappear from other people's chats". Both are RIGHT and both are SILENT on pins. Nothing in "What stays after deletion" covers A1.13.

### A2. "Pinned and Shared" panel

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| A2.1 | "Shared" lists every photo, video and shared post sent in the chat, newest first. It is read with the viewer's own permissions: never a removed message, nothing from before the viewer's clear mark. | SHARED:85-100; `src/components/desktop/messages/PinsPanel.tsx`:20-41 | 5e: "Members see every message, photo, video, shared post and reaction" | RIGHT. A new view of the same things, no new data. |
| A2.2 | The phone has the same pins as a "Pinned messages" sheet. Pins are not a desktop-only thing. | `src/components/mobile/messages/PinnedSheet.tsx`:15-19 | none | Do not write "on desktop" in the pin sentence. |
| A2.3 | Rollout: every pin route needs the new-chat switch (`chat_v2`); the desktop screens also need `chat_desktop`. Both are server settings, on for the cofounders and one club today. | PIN-PUT:52-53; PINS-GET:72-73; `src/lib/chat/flag.ts`:112-159; `src/lib/chat/flag-desktop-server.ts`:24-27 | v2 already describes the new club chat the same way (as if on) | No sentence needed. |

### A3. One word now means two things

Policy 5e today: "Other members of a chat may be able to tell when you last read it and whether you muted, pinned, hid or cleared it."

"Pinned" there is "Pin to top": your own setting, `channel_members.pinned_at` (PINS-MIG:8-12 spells out the three older meanings). With pinned messages in the same section, a reader will mix them up. Verdict: RIGHT but now unclear. Fix: "whether you muted it, pinned the chat to the top of your list, hid it or cleared it".

### A4. Rooms where only some people post

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| A4.1 | One new column, `channels.post_policy`, with three values: `everyone` (the old rule and the default), `officers`, `listed`. It can only be set on a club's extra rooms. The Board, the Lounge, the Officers room, event chats, direct and group chats cannot have it. | POST-MIG:9-21, 555-556 | 5e: "Each club has a Board and a Lounge for every member, an Officers room for the club owner, club admins and people they add, and any rooms they create." | SILENT |
| A4.2 | `officers` here means the club's OWNER AND ADMINS only. A mod cannot post in such a room. The app's own line still says "Only officers post here." | POST-MIG:101-103, 618; `src/lib/chat/room-rules.ts`:66-70 | 5f: '"Officers" means a club's owner, admins and mods.' | The policy's word "officers" includes mods. A sentence "only officers post" would be WRONG. Write "the club's owner and admins". |
| A4.3 | `listed` = owner, admins, and the people on the room's by-name list. That list is the older table `org_channel_members` (room, person, when added, who added them). On a private room the same row lets the person in. | POST-MIG:13-15; `supabase/migrations/20260507130000_org_channel_pinning_and_access.sql`:24-30; ROOM-LIST:100-106, 189-193 | 3c: "Clubs: memberships and roles, clubs you follow, requests to join with your message, invites, and, if a club officer removes you, who did it and when." | SILENT on "who added you to a room, and when" |
| A4.4 | Only the club's owner and admins can read a room's list: each person's name, handle, photo, verified or not, and the date added. Who added them is stored, not shown. | ROOM-LIST:42-47, 59-65, 74-90 | 5f: "Club owners and admins see the follower list ... invites and their outcome, and who RSVP'd" | SILENT |
| A4.5 | Only the owner and admins can change a room's rule or its list, and a suspended one cannot. | ROOM-LIST:18-40, 116-117; POST-MIG:96-99 | none | SILENT, no sentence needed |
| A4.6 | What an ordinary member sees: for each room, whether it is locked and its rule; and in a room they cannot post in, one line: "Only officers post here." or "Only officers and people they picked post here." So a member can tell they are not on the list. They cannot see who is. | SPACE:321-322; `src/lib/chat/message-read.ts`:1183-1196; room-rules.ts:66-70 | none | SILENT |
| A4.7 | Reading is unchanged. Everyone who can see the room reads everything in it, and can still vote in its polls and take a sign-up slot even when they cannot post. | POST-MIG:51-61, 92-93 | 5e: "New members can read a room's whole history." and the Polls bullet | RIGHT |
| A4.8 | Leaving the club takes you off every room list (an older trigger). Deleting your account deletes your rows; rows where you added someone else stay with "who added" emptied. | `supabase/migrations/20260928100500_club_channel_members_cleanup.sql`:13-15; 20260507130000:25-28 | 9: "Club records where you acted as an officer, with your name removed." | RIGHT |

### A5. The club's right-hand panel

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| A5.1 | Members: five faces, the count, and "See all", a dialog listing every member's photo, name, handle and role, each linking to the profile. Members of the club only (a non-member gets 403, or 404 for a hidden club). | `src/components/desktop/messages/ClubPanel.tsx`:26-47; `MembersDialog.tsx`:17-35; ROSTER:78-93 | 5f: "Every member sees the club's member list: name, handle, photo, role and join date." | RIGHT. The route also sends "verified or not" (ROSTER:96-99), which is public anyway. |
| A5.2 | New: asked with `?visible=1`, the list leaves out anyone in a block with the viewer, either way. If the block check fails the route sends nothing, never the full list. Without the parameter (Campus settings, the officers' Rooms dialog) the full list is sent as before. | ROSTER:43-50, 135-142 | 5e: "Blocks in club chats. You each see a blank in place of the other's messages. This only hides them on screen" | SILENT. It is a screen filter, not a guarantee: the full list is still one request away for any member. Do not promise that a block hides you from a member list. |
| A5.3 | Announcements: the Board's three newest posts, to people who can read the Board anyway. Seeing them here does not mark the Board read. | SPACE:42, 295-300, 340; ClubPanel.tsx:43-46 | 5e Club chats | RIGHT, nothing new |
| A5.4 | Events card and the event chat's panel: the next events, "N going", your own RSVP, who is going. All of it existed on the phone. | `EventPanel.tsx`:11-17; `src/components/mobile/messages/club/RsvpSheet.tsx`:19-35 | 5e: "Each event has a chat ... and its member list names them." | RIGHT |

### A6. The dm bridge, read markers, browser storage

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| A6.1 | On desktop a direct or group chat is the old page (`public/html/messages.html`) shown in one frame on our own site. The two halves talk with `postMessage`, sent only to our own origin and accepted only from our own frame. The frame's address never carries a chat or a person. Nothing goes to another company. | `src/components/desktop/messages/dm-bridge.ts`:14-24, 104-117; `public/html/messages.html`:1177-1179 | none | SILENT, and nothing to say |
| A6.2 | Read markers: no new table or column. Desktop writes the same thing the phone does: `channel_members.last_read_at` = now, when you open or keep open a chat. | `src/app/api/me/threads/[id]/read/route.ts`:19-23; `ClubPane.tsx`:22, 648-650 | 5e: "when the other side last read it"; "Other members of a chat may be able to tell when you last read it" | RIGHT |
| A6.3 | One new note in the browser: `localStorage["vibe_chat_panel"]`, "1" or "0": whether you keep the club panel open. Not personal. It is not in the sign-out clean-up list, so it stays until browser data is cleared. | `ClubPane.tsx`:94, 137-151; `src/lib/pwa/leave-device-clean.ts`:43-54 | 7: "Your theme, the email you just signed up with and a few similar notes can stay until you clear your browser data for Vibe." | RIGHT |
| A6.4 | A chat's address is `/messages?channel=<the chat's id>`. This form is older than this release. Hosting logs and an error report can hold that id. | `src/components/desktop/messages/desktop-rules.ts`:297-299 | 3d: "A report can still include a club's handle, a post's number or search words." | Slightly short. Optional: add "or a chat's number". |

### A7. The two migrations test themselves with real account ids

Both new migration files end with a self-test that runs inside the database and rolls itself back.

- PINS-MIG:503-576: builds a throwaway chat with no members and one message "written by" the oldest account, pins it, removes it, deletes it. Rolled back. Skipped if there is no account.
- POST-MIG step 5 (described at header lines 68-86): in the oldest club that has an owner or admin and a plain member, it builds its own room, one message, one poll and one vote in those people's names. Rolled back.

Nothing is left behind, nobody sees it, and the files check that. What comes back to the person (or the AI tool) applying the file is a string of test results and fingerprints, no record (POST-MIG:995-1022). So this fits the counts-only rule as "the tool is never shown anyone's records". It would not fit a sentence like "the tool never touches anyone's records". Pick the first wording.

---

## B. The waitlist as finally built (branch landing-night)

Section 11 of v2 was checked line by line on Oct 3 and the code has not changed since. Most of it is RIGHT. Rows marked WRONG or SILENT are the ones the writer must act on.

### B1. What is stored

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B1.1 | One row per person: address, a folded copy of the address (so `a+tag@iu.edu` is the same person), university, form or founder-added, name, year (optional), major, clubs, "I run a club", which club, the one free-text line. | WL-1:163-183; `src/lib/waitlist/form.ts`:58-75, 125-193 | 11: "your school email (IU or Purdue only) and your name. If you give them: your year, major, the clubs you are in, whether you run a club and which one, and one line" | RIGHT |
| B1.2 | The `?src=` tag: 1 to 40 characters of a-z, 0-9, `_`, `-`, anything else dropped. The landing's own button always sends `src=landing`, so most entries carry one. | `src/app/waitlist/page.tsx`:36, 47; form.ts:81, 97-101; STORE:179; `src/lib/waitlist/view.ts`:58-59 | 11: "where you found us, if your link carried a tag saying so" | RIGHT |
| B1.3 | Consent times: one server time, written to "18 or older and a current student" and "Email me when it's my turn" on every submit, and to "Also send me Vibe news" only if ticked. | STORE:166, 180-182; WL-1:185-187, 209-210 | 11: "when you sent the form with each box checked" (three labels) | RIGHT |
| B1.4 | Which wording of the form's notice was on screen: `notice_version`, today "2026-10-03". | form.ts:18; STORE:183; WL-1:188 | not mentioned | SILENT |
| B1.5 | State of the entry: when the confirm email went, when you confirmed, wave name, when a code was sent, when it ends, how many were sent, which cofounder sent it or added you, and the sign-up email that used the code. Link tokens and codes are kept only as SHA-256 fingerprints. | WL-1:189-205; WL-3:118-120 | 11: "the state of your entry: when we emailed you, when you confirmed, your wave ... and when a code was sent and by which cofounder" | RIGHT |
| B1.6 | Nothing about the device: no IP address, browser or location column on the entry. | every column of WL-1:163-215 and WL-3:118-120 | 11: "The entry stores no IP address ... browser, device or location" | RIGHT |

### B2. The email log and its hashed address

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B2.1 | Each waitlist email adds a log row: kind (`waitlist_confirm` or `waitlist_invite`), a coarse domain, a keyed hash of the address, whether it worked, any error code and text with addresses stripped, the time. | `src/lib/email/send-log-core.ts`:92-102, 134-141, 147-156; `supabase/migrations/20260922104000_email_sends.sql`:143-165 | 11: "a log of each email we send you (its kind, the part of the address after the @, the time, whether it was sent), with a scrambled code in place of your address." | RIGHT |
| B2.2 | The row also keeps Resend's reference number for the message (`provider_message_id`). It stays after the hash is wiped. With it, someone with our Resend login can find the address for as long as Resend keeps its record. | send-log-core.ts:97; 20260922104000:153-155; STORE:297-307 (only `recipient_hash` is cleared) | 3d and 11 list the fields and leave this one out. 11: "What stays after an entry is deleted. Our email log, without the scrambled code." | SILENT. It was in the checked draft ("our email service's reference number") and fell out in the plain-English pass. Put it back. |
| B2.3 | The hash is wiped when the entry is deleted (leave link, clean-up, account deletion, a cofounder removing you), and in any case 38 days after the email was sent. | STORE:136, 297-318, 326-332, 363; WL-8:113-119 | 11: "Our email log, without the scrambled code." | RIGHT in the normal path. If the server-side wipe fails, the database backstop runs 38 days after the SEND, which for a code emailed late can be after the entry is gone. Rare. No change. |
| B2.4 | A second place holds a scrambled copy of the address: the form's per-address limit (3 a day), stored in the abuse-count table under `waitlist-email:<keyed hash>`. It is the same kind of code as the email log's. Nothing wipes it when the entry goes. It leaves with the table's own clean-up, which runs by chance (1 hit in 100) and removes counts older than a day. | `src/app/api/waitlist/route.ts`:123-125; send-log-core.ts:158-176; `supabase/migrations/20260922090000_guard_function_privileges.sql`:229-232 | 11: "To stop abuse they count requests by IP address, and those counts can stay for weeks." and "What stays ... Our email log, without the scrambled code." | WRONG by omission. A scrambled code of the address does outlive the entry. |
| B2.5 | Counts by network (the IPv4 address, or the first half of an IPv6 one): 30 form posts an hour, 10 confirm emails a day, and 60 an hour on the page a waitlist email link opens (status, confirm, leave). | route.ts:79-80, 165-168; `leave/route.ts`:24; `confirm/route.ts`:28; `status/route.ts`:28; `src/lib/rate-limit.ts`:62-93 | 11: "they count requests by IP address" | RIGHT |

### B3. How long, and the 38 and 28 days

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B3.1 | One deletion moment per entry: 38 days after it joined. For a form entry that never confirmed and has no code: 28 days after its last confirm email, if that is sooner. | WL-8:78-89 | 11 table: "Up to 40 days after you join the list"; "Up to 30 days after its last confirm email" | RIGHT |
| B3.2 | Three things run the same delete: Vercel's daily job (08:17 UTC), the form's background step, and the admin Waitlist tab (each at most hourly, only when someone uses them). | `vercel.json`:3-8; `src/app/api/cron/waitlist-purge/route.ts`:37-52; route.ts:121; STORE:356-382 | 11: "A daily clean-up deletes the whole entry." | RIGHT, on one condition (F1) |
| B3.3 | The margin. The daily job can be about 25 hours after the last one and is not retried. So an entry is gone by about day 39 and 1 hour. One missed daily run with nobody using the form or the admin tab would bring it to about day 40 and 1 hour. | WL-8:7-12; cron route:14-23 | "Up to 40 days" | RIGHT in normal running. Keep "up to 40 days". Do not tighten to "within 40 days, guaranteed". |
| B3.4 | Before the job reaches it, an entry past its line already counts as gone: its link says it no longer works and the form treats the person as new. | STORE:131-142, 271-274; WL-7:101-120 | not mentioned | SILENT, no sentence needed |
| B3.5 | Sending the form again restarts the clock only for an entry still unconfirmed with no code, only when a confirm email can still be sent, and at most 3 times a day per address. Anyone who types your address can do it. | WL-8:238-262; route.ts:123-141; STORE:205-239 | 11: "Sending the form again before you confirm starts the 40 days again, with your new answers." | RIGHT |
| B3.6 | A code works once and ends at the sooner of 14 days and the entry's deletion. No code is sent to an entry with under 24 hours left. | WL-8:182-185, 209 | 11 table: "Works once, for up to 14 days" | RIGHT |
| B3.7 | Confirm link: 7 days. | `src/lib/waitlist/tokens.ts`:25; STORE:280-289 | "Works for 7 days" | RIGHT |

### B4. "Take me off the list"

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B4.1 | Opening the link deletes nothing. The tap deletes the whole row, in any state, and wipes the hash on that address's waitlist email-log rows. Either email's link works (the confirm email's token or the code email's). | `src/app/api/waitlist/leave/route.ts`:12-21, 40-44; STORE:252-262, 297-318 | 11: "Open it, tap 'Yes, take me off', and your entry is deleted right away." | RIGHT |
| B4.2 | What it does not delete: the email-log rows (B2.1, B2.2), the abuse counts (B2.4, B2.5), the log of cofounder actions (it can never be deleted: WL-1 rollback note, lines 67-68), Resend's record, a reply you sent us (it sits in the inbox), and hosting logs that hold the link. | as cited | 11 "What stays after an entry is deleted" names the email log, Resend's record and the cofounder log. | Two missing: the abuse counts, and the Resend reference number. |
| B4.3 | If your code already made an account, the page stops offering the button. The account, its wave tag and its code fingerprint stay until you delete the account. | `src/app/waitlist/confirm/` (V6-45); WL-5:78-88 | 11: "After you make an account, the entry goes with the clean-up or when you delete the account." | RIGHT |

### B5. What the access code leaves on the account

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B5.1 | In the sign-in record: a SHA-256 fingerprint of the code, in place of the typed code, in two Supabase Auth tables. Only if migration WL-4 (130000) is applied; the file says the hosted project may refuse it, and then the code is kept as typed. | WL-4:1-26, 54-76, 106-114 | 11: "Your account keeps a record of the code" | RIGHT either way. Keep "a record of the code". Do not write "scrambled" unless WL-4 is confirmed applied (F2). |
| B5.2 | The wave tag `user_cohorts`: wave name, form or founder-added, the day the code was sent, the day you joined. Deleted with the account. The wave name is one of five words and a number: wave, officers, clubs, friends, test. | WL-5:78-88, 104-108; WL-6:95-98; `src/lib/waitlist/types.ts`:92-93 | 11: "a wave note (the wave, how you came, the day the code was sent and the day you joined), deleted with the account" | RIGHT. Small: the name can say "officers" or "friends" about you. |
| B5.3 | On the waitlist entry: the email you signed up with (written when the code is claimed, even if making the account then fails) and a link to the new account. Goes when the entry goes. | WL-3:188-199, 319-327 | 11: "The email you sign up with is stored on your waitlist entry, linked to your new account, until the entry is deleted." | RIGHT |
| B5.4 | Nothing from the waitlist is copied into the profile. | WL-3:263-285 | 11: "Your waitlist answers are not copied into your profile." | RIGHT |
| B5.5 | The allow list of addresses that skip the code: address, one of three reasons, an optional note, the date. Not touched by account deletion. | WL-1:153-160 | 11: "That list keeps the address and a reason, even after the account is deleted." | RIGHT (short by "a note and the date") |

### B6. What deleting an account removes

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| B6.1 | The entry whose code MADE this account is deleted, with the hash on its email-log rows; any claim on another entry by the account's sign-in address is cleared. Done twice: by the server before the delete and by a database trigger. | `src/app/api/me/route.ts`:137-147; STORE:326-332; WL-3:470-502 | 9 step 3: "... your notifications, and your waitlist entry." | OVERSTATED. An entry not tied to the account by a code is not found: someone on the list who signed up from the allow list, or without a code once sign-up opens. That entry waits for the 40-day clean-up. |
| B6.2 | The wave tag and the code fingerprint go with the account. | WL-5:79 (cascade); the fingerprint lives in the sign-in record | 11: "deleted with the account" | RIGHT |

---

## C. The landing page (branch landing-night)

| # | Fact | Where | Policy today | Verdict |
|---|---|---|---|---|
| C1 | The 30-second film is not on our site. It sits in Vercel's file storage (Vercel Blob), at `npzptkkzqxthhsnu.public.blob.vercel-storage.com`, as two files (a small and a large one). | `src/lib/landing/demo-media.ts`:25-28 | 6: "Vercel (hosting). It runs the site and our server code. Its visit logs record the web address requested, your IP address and browser." | SILENT. Same company, a different address your browser talks to. One clause fixes it. |
| C2 | When the browser asks for it: not on page load (`preload="none"`). The request goes out when the film is about to scroll into view, or when you press Play. With "reduce motion" or data-saver on, only on Play. Vercel then sees your IP address, your browser, and that you came from connectvibe.app. | `src/components/landing/day-on-vibe.tsx`:77-81; `use-day-film.ts`:51-65, 133-138; `next.config.ts`:86 | same | SILENT |
| C3 | To pick the small or large file the page reads, on your device, your screen width, the data-saver setting and the connection speed the browser reports. None of it is sent or stored. | use-day-film.ts:52-63 | 3e: "No location from your device or your IP address." | RIGHT, nothing to add |
| C4 | Who is in the film. It was recorded on a local test copy with made-up students and clubs. The real people in it are the three cofounders, as themselves, and friends in the founder's own photos. The film is kept out of the public code for that reason. Its on-page caption reads "Real app · Sample accounts". | demo-media.ts:4-8; `handoffs/2026-10-03-session-72-landing-demo-waitlist.md`:19-21; day-on-vibe.tsx:71-73 | 4: "We do not sell your personal information, share it with advertisers, or use it to train AI models." | SILENT on marketing use. The founder confirmed on Oct 4 that everyone shown agreed, so the promise held back on Oct 3 (calls-for-franky item 4) can now go in. I could not watch the film itself: it is not in the repo. |
| C5 | The poster and the three still pictures are on our own site. I looked at all three stills: made-up clubs and messages, no faces, no real names. | `public/landing/`; day-on-vibe.tsx:28, 91-95 | none | Nothing to say |
| C6 | Fonts. Every page, the landing and the waitlist included, loads Fraunces and DM Sans from Google (`fonts.googleapis.com`, `fonts.gstatic.com`). JetBrains Mono is copied into our own site at build time, and the landing's soft wordmark font is a local file. | `src/app/layout.tsx`:3, 99-101; `src/components/landing/soft-font.ts`:1 | 6: "Google (fonts). Your IP address and browser on almost every page" | RIGHT |
| C7 | No analytics. I searched the layout, the landing, the waitlist pages, `next.config.ts` and `package.json` for Google Analytics, Tag Manager, Plausible, PostHog, Segment, Mixpanel, Vercel Analytics, Speed Insights, Hotjar and Clarity: none. Sentry is the only thing that measures, as section 3d says. | `src/instrumentation-client.ts`:1-7 | 3e: "No tool that tracks what you tap, and no advertising tracker." | RIGHT |
| C8 | The landing's "Join the waitlist" button always adds `?src=landing`. | `src/lib/waitlist/view.ts`:58-59 | 11 source tag | RIGHT |
| C9 | The landing asks the database one thing: is sign-up open (a yes or no setting). Nothing about the visitor. | `src/app/page.tsx`:52-54 | none | Nothing to say |

---

## D. Cookies and browser storage, by name

### D1. Set by the landing page and the waitlist pages

None. No cookie and no browser storage is written by `src/app/page.tsx`, `src/components/landing/`, `src/lib/landing/`, `src/app/waitlist/` or `src/lib/waitlist/` (searched for `document.cookie`, `cookies.set`, `localStorage`, `sessionStorage`). The root layout's theme script reads `vibe_theme` and writes nothing (`src/lib/theme/theme.ts`:98-103). The sign-up page takes the access code out of the address bar after load and stores it nowhere (`src/app/auth/signup/signup-form.tsx`:187).

Policy 7 ("There are no advertising or tracking cookies, so there is no cookie banner") and 11 ("the waitlist pages set no cookie"): RIGHT.

### D2. Cookies, whole app

| Name | Set by | Purpose |
|---|---|---|
| `sb-<project>-auth-token` (may be split into `.0`, `.1`) | Supabase's sign-in library: `src/lib/supabase/middleware.ts`:26-30, `src/lib/supabase/server.ts`:27; copied onto redirects at `src/proxy.ts`:202 | Keeps you signed in. For an account made with a code, the first one also holds the code as typed until it is refreshed, about an hour (WL-4:20-22). |

These three places are the only cookie writes in `src/`. Policy 7: RIGHT.

### D3. Browser storage, whole app (names from the code)

New in this release:

| Key | Kind | Holds | Cleared at sign-out? |
|---|---|---|---|
| `vibe_chat_panel` | localStorage | "1" or "0": club panel open or closed | No (`ClubPane.tsx`:94; not in `leave-device-clean.ts`:43-54) |

Already there, for the writer's list (v2 covers them in general words):

| Key | Kind | Holds |
|---|---|---|
| `vibe_user_v1`, `vibe_posts_v1`, `vibe_vibes_v1`, `vibe_relationships_v1`, `vibe_otto_v1`, `vibe_otto_lastpost_v1`, `vibe_cal_events_v1`, `vibe_recent_searches_v1`, `vibe_push_ask_v1`, `vibe_first_dm_ask_v1` | localStorage | copies of your own profile card, posts, follows, Otto settings, calendar entries, recent searches, and "already asked" notes. Cleared at sign-out (`leave-device-clean.ts`:43-54). |
| `vibe_theme`, `vibe_theme_at` | localStorage | light, night or auto, and when you chose. Stays. |
| `vibe_tour_pending`, `vibe_campus_tour_seen_v1`, `vibe_network_tour_seen_v1`, `vibe_profile_tour_seen_v1` | localStorage | which intro tours you have seen. Stays. |
| `vibe_push_taps_v1` | localStorage | ids of notifications you tapped. Stays on purpose. |
| `vibe.pendingSignup.v1` | localStorage | the email you just signed up with, for the "check your inbox" page (`src/lib/auth/pending-signup.ts`:12). Stays. |
| `vibe_onb_draft_v1:<account id>` | localStorage | your half-finished profile set-up answers (`src/lib/onboarding/draft.ts`:50) |
| `vibe_campus_confirm_dismissed`, `vibe.launchUrlHandled` | sessionStorage | one-visit notes |
| `vibe.schoolEmailSent.v1`, `vibe.schoolVerifyLink.v1`, `vibe.recoveryToken.v1` | sessionStorage | the school address you just asked a code for, a verify link, a password-reset token moved out of the address bar. Gone when the tab closes. |

Policy 7 today: "Your theme, the email you just signed up with and a few similar notes can stay until you clear your browser data for Vibe." RIGHT, and it still covers the one new key.

---

## E. The changes the policy needs, ranked, with sentences

Rank 1 and 2 fix things v2 says that are not quite true. Ranks 3 to 6 add what v2 never saw. The rest is polish.

### 1. A scrambled copy of the address outlives a waitlist entry (B2.4, B4.2). WRONG by omission.

Section 11, replace "To stop abuse they count requests by IP address, and those counts can stay for weeks." with:

> To stop abuse, the waitlist pages count requests by IP address, and the form counts how often one school address is sent in. That count is kept under a scrambled code, not the address. These counts can stay for weeks.

Section 11, "What stays after an entry is deleted", replace the first sentence with:

> Our email log, without the scrambled code. It keeps our email service's reference number for each message. The abuse counts, until they are cleared.

Section 3d, Abuse limits, replace "A few counts hold an IP address or part of one." with:

> A few counts hold an IP address or part of one, and a few hold a scrambled code made from an email address.

### 2. Deleting an account does not always delete "your waitlist entry" (B6.1). OVERSTATED.

Section 9, step 3: replace "and your waitlist entry" with:

> and the waitlist entry your access code came from

Section 11, Leaving sooner: replace the last sentence with:

> After you make an account, the entry goes with the clean-up, or sooner if your access code made the account and you delete it.

### 3. Pinned messages (A1, A2). SILENT.

Section 3c, Messages bullet:

> Messages and everything in them, which messages are pinned in a chat (and who pinned each one, and when), your settings in each chat, and poll votes and sign-ups in club chats.

Section 5e, a new bullet after "Direct and group chats":

> **Pinned messages.** In a direct or group chat, anyone in the chat can pin a message for everyone in it, and anyone in the chat can unpin it. Everyone in the chat sees the pinned messages, including someone added later. Vibe does not show who pinned a message, but it stores it. A "Pinned and Shared" panel also lists the photos, videos and shared posts sent in the chat. Club rooms have no pinned messages.

Section 8, table, a new row:

> | A pin on a message | Anyone in the chat unpins it, the message is deleted, or the Vibe team removes the message |

Section 8, under "A message": add "and any pin on it" after "with its reactions".

Section 9, "What your deletion takes from other people": "Messages you sent disappear from other people's chats, with any pins on them, ..."

Section 9, "What stays after deletion", a new bullet:

> **Messages you pinned.** A message someone else wrote stays pinned. The record of who pinned it is emptied.

### 4. Rooms where only some people post (A4). SILENT, and one trap.

The trap: in these rooms "officers" means owner and admins. Policy 5f defines officers as owner, admins and mods. Use "the club's owner and admins".

Section 5e, Club chats, add after "and any rooms they create.":

> For a room they create, the club's owner and admins can choose who may post: every member, only the owner and admins, or them and people they pick. Everyone who can see the room can still read it, vote in its polls and take a sign-up spot. If you cannot post in a room, it tells you so. It does not show you who can.

Section 5f, "Club owners and admins see": add "and the list of people they added to a room, with the date each was added".

Section 3c, Clubs bullet: add ", and, if a club's owner or admin adds you to a room, who added you and when".

### 5. The email log keeps a reference number (B2.2). SILENT.

Section 3d, Email log: "... the part of the address after the @, the time, whether it worked and our email service's reference number for the message."

Section 11, the log bullet: "(its kind, the part of the address after the @, the time, whether it was sent and our email service's reference number)".

### 6. The front-page film (C1, C2, C4). SILENT.

Section 6, Vercel:

> **Vercel** (hosting). It runs the site and our server code, and it stores the short film on our front page. Your browser loads the film from Vercel's storage when it scrolls into view or you press Play. Vercel's visit logs record the web address requested, your IP address and browser.

Section 4, after "We do not sell ...":

> We do not use your name, photos or posts in our marketing unless you agree first. The film on our front page was recorded on a test copy of Vibe with made-up accounts. The real people in it are the three cofounders and friends, who agreed to appear.

### 7. "Pinned" means two things (A3).

Section 5e, Your chat settings:

> Other members of a chat may be able to tell when you last read it and whether you muted it, pinned the chat to the top of your list, hid it or cleared it.

### 8. Small ones

- Section 11, What we collect, a new bullet: "which version of the form's notice you saw;" (B1.4)
- Section 11, sign up with a code: "a wave note (the wave's name, such as "wave-2" or "officers-1", how you came ...)" (B5.2). Optional.
- Section 11, the allow list: "That list keeps the address, a reason, a short note and the date" (B5.5). Optional.
- Section 3d, Error reports: "a club's handle, a post's or chat's number, or search words" (A6.4). Optional.
- Do not add any sentence saying a block hides you from a club's member list (A5.2).
- Section 6, AI coding tools: with the counts-only rule, v2's sentence ("the database records it reads pass through that tool's provider") is no longer how it works. Word the new one as what the tool is shown ("counts, settings and code fingerprints, never anyone's records"), not as "never touches" (A7).

### What needs no change

Read markers (A6.2), the dm bridge (A6.1), the club panel's members, announcements and events (A5.1, A5.3, A5.4), the one new browser note (A6.3), cookies (D), fonts and no analytics (C6, C7), the source tag, consent times, wave tag, 40 and 30 days, 7 and 14 days (B1, B3, B5).

---

## F. Sentences that rest on a production setting (not checked: production was not read)

| # | Setting | Sentence it carries | If it is missing |
|---|---|---|---|
| F1 | `CRON_SECRET` (16+ characters) in Vercel, production | 11: "A daily clean-up deletes the whole entry." and the 40 and 30 days | The daily job is refused every time (`src/lib/cron/auth.ts`:22-31; cron route:38-44). Entries are then deleted only when someone uses the form or the admin tab. |
| F2 | Migration 130000 (code scrub) applied | 11: "Your account keeps a record of the code" | The code is kept as typed. The sentence stays true. Do not upgrade it to "scrambled" without checking. |
| F3 | `SCHOOL_EMAIL_VERIFY_SECRET` (16+ characters) | 3d: "with a secret key held on our servers we can test whether a given address matches" and rank 1's "scrambled code" | The email log stores no code at all, and the per-address count falls back to a plain SHA-256 of the address with no key (`send-log-core.ts`:158-176). |
| F4 | Migrations 20261004100000 and 110000 applied, and the `chat_v2` / `chat_desktop` switches | ranks 3 and 4 | Until then the pin buttons hide (routes answer 404) and a post rule cannot be set (503). The sentences describe a feature not yet reachable, as v2 already does for Vibe+ and notifications. Fine as written; move them under 3f only if the migrations are not applied today. |
| F5 | `app_settings.waitlist_email_viewers` | 11: "A cofounder we have set up to do it can see a full address" | Seeded empty (WL-1:147-149): nobody can see a full address until an id is added. The sentence is still not false. |
| F6 | `NEXT_PUBLIC_DEMO_MEDIA_BASE` unset | rank 6 | Set to another https folder, the film loads from that host instead (`demo-media.ts`:10-17). |

