# Club chat redesign — wave 0 decisions (S69, 2026-09-29)

Franky answered every call today. These are final for v1 and feed `wave-1-contracts.md`. Where this file and `wave-plan.md` sections 2–6 disagree, this file and the critique win.

## Franky's calls

| # | Call | Decision |
|---|---|---|
| 1 | Names of the two main spaces | **Board + Lounge** |
| 2 | Replies to Board posts | **Yes, folded under the post, never notify.** An @mention inside a reply still notifies that one person (if they can read the room). |
| a / 4 | Who gets into an event room | **Members first, others if time.** v1 = club members with Going/Maybe + the club's officers. The data model must fit non-members from day one. "Anyone who RSVPs" is a **stretch goal before the Oct 15 freeze**, only if everything else is built and walked; otherwise right after launch. When it ships: an officer switch per event, **off by default**, plus all seven checks from critique #3, re-checked on read. |
| b | Who's going, inside the club's event room | **Yes, visible inside the room.** Outside the room it stays counts only, exactly as today. The Going button says "You'll appear in the event chat". (The critique's "show the count only from 5 up" would change event counts across the whole app; it is NOT in v1 — open question for after launch.) |
| c | SAE's private `general` | **Becomes the Lounge, open to all SAE members.** `exec` becomes the Officers room. Production check (Sept 29): **SAE has one member today, its owner**, so nobody new sees the 3 old messages. The heads-up to SAE's owner only matters if real members join before the switch. |
| d / 10 | Poll + sign-up names | **Sign-ups show names to the room. Polls show names by default, with an "anonymous" switch that shows counts only.** |
| 5 | Event room life | **From the event's creation until 7 days after it ends.** Soon / Live / After computed at read time; after 7 days it is read-only. No stored `opens_at` / `archives_at`. |
| 8 | Phone Campus › Chat pill | **Removed when `chat_v2` is on.** The club page's Chat button and old `?tab=chat` links open Messages (phone only). Flag off = today's chat. Desktop keeps Campus › Chat. |
| 27 | Club mods | **Owners, admins and mods can remove a message in their club's rooms** (soft remove, never on a message with an open report). The Officers room stays owner + admin + the allow-list. Only owners/admins post top-level on the Board. |
| 3, 6, 7, 9 | After launch | **Recommendations accepted as the after-launch plan:** up to 3 custom rooms per club; notifications default "Board + mentions"; "seen by" = a count for officers from 5 up; desktop Messages rebuilt as a three-column React page. Nothing built now; he can change any before we start. |
| — | Roadmap page | **Yes, update it:** f10 comes off; the chat redesign goes on with its dates. Show him the change before James and Rylan see it. |

## Defaults I set (small, no call needed — say so if any is wrong)

- **Cards (polls, sign-ups, RSVP cards) are club rooms only in v1.** Not in DMs or group chats (critique #26).
- **No Headcount card in v1**; no Bring / Rides tiles, no "I'm here", no album (critique #18).
- **No photos in club or event rooms in v1** (location stripping comes first, critique #23).
- **No `board_post` notification rows**; the inbox's coral Board dot is the signal (critique #16).
- **Push stays out of this plan** (critique #9).
- **Messages home filters: Chats · Clubs · Requests**, this week only in "Your week" (critique #20, v1 cut).

## What is left in wave 0

1. Canvas: restyle "inside a club" to Option 3, the "+" tray flows (poll, sign-up, share an event), the empty states (no clubs yet, no RSVPs this week, a club with no events).
2. `wave-1-contracts.md` from these decisions + `wave-1-asis.md` (the current state, gathered S69), then a plan critic on it.
3. Roadmap page update.

## Later the same day (S69, Sept 29) — four more calls

| Call | Decision |
|---|---|
| Roadmap page | **Published as version 14** with the fixes: the 22 edits, event chats say "for the club members who RSVP'd", the "no big new features" line names the chat redesign, the Supabase Pro row says "Not yet (Franky, Sept 28)". Source and change list: `roadmap-v14-published/`. |
| When the new chat is on for everyone | **Mon Oct 26, when doors open** (not launch day). |
| SAE's owner | **It is Franky.** The "tell SAE's owner" task came off Rylan's list; nobody new can read SAE's old messages. |
| "Your hat" | **The role in v1** (Owner, Officer, Mod, Member). Custom titles like Treasurer come after launch with the member list and roles work. The mockups were updated. |

## Where wave 0 ended

- **Canvas row 7** "Club chat v1 · the build set" is live (version 20): 13 mockups — inside a club (Lounge, Board, event chat, Lounge in Light), the "+" tray and its three sheets, the cards in the chat, Messages home v1 and three empty states. Sources: `boards/W0_*.dc.html`.
- **`wave-1-contracts.md` is DRAFT 2**, rewritten after the plan critic (`wave-1-contracts-critique.md`). Wave 1 shrank to the rooms and the Board rule; cards, the new reads and the officer remove route moved to the week of Oct 5. Draft 1 is kept as `wave-1-contracts-draft1.md`.
- **Open points with my defaults** are in section 12 of the contract. The two Franky should look at before the production apply: people who already RSVP'd join event chats without having seen the "You'll appear in the event chat" line (default: accept, all testers); and blocking inside club rooms (default: hide a blocked person's messages and name from me only).

## Evening of Sept 29 — the last two calls, and the contract is final

| Call | Decision |
|---|---|
| People who already RSVP'd (7, all testers) join event chats without having seen "You'll appear in the event chat." | **Accept** (Franky). |
| Blocking inside club rooms | **Both ways** (Franky). When either of two people blocked the other, neither sees the other's messages in club rooms, nor the other's name in polls, sign-ups and "who's going". Counts don't change. **One exception: an officer's Board post shows to every member**, so nobody misses club news. Built with the room screens; wave 1 only reserves the field. |

`wave-1-contracts.md` is **FINAL for wave 1** (draft 3): the verification pass (`wave-1-contracts-verify.md`) found all 37 critic findings taken and 22 new points; all 22 are written in. Two defaults I set from it: the four room triggers swallow their own errors so a chat bug never blocks an RSVP, an event, a join or a leave; and the "You'll appear in the event chat." line ships with wave 1.
