# What clubs and officers have today (read from the code, Oct 20, 2026)

Two read-only sweeps of `main` at `17941aa`. Paths are under `~/vibe/`. "cs" = `src/app/campus/campus-home.tsx`,
"pg" = `src/app/orgs/[handle]/page.tsx`. Line numbers drift; search for the names.

## Creating a club
- Any verified student with a home campus can create one, no approval: `POST /api/orgs` (`src/app/api/orgs/route.ts`, 5 an hour). The creator is `owner` and gets the Lounge, Board and Officers rooms.
- The create UI is desktop only: `CreateOrgModal` in cs (name, handle, description, who can join, open to, backdrop; no logo or banner step). It closes without taking you to the club.
- The phone has no create screen: "Start a club" goes to `/campus?tab=orgs` (`src/components/mobile/messages/home/HomeEmpty.tsx`).
- `orgs` columns: handle (permanent), name, description, logo_url, banner_url, backdrop_preset, verified, links (Instagram goes here; up to 10), philanthropy, campus_id, join_policy (open/request/invite), audience (both/iu/purdue), hidden_at, followers_read_board (default true). Officer titles live on `org_members`. No category, no socials column.

## Roles (`src/lib/orgs/join-state.ts`)
- OFFICER_ROLES owner/admin/mod; INVITE_ROLES and SETTINGS_ROLES owner/admin.
- Owner: everything; only the owner deletes the club; can't leave; no ownership transfer ("coming soon").
- Admin: settings, invites, post as the club, delete posts, Board posts, events, check-in, roles below admin, titles, followers, the Board switch.
- Mod: approve or deny join requests (but can't reach the Requests tab), remove chat messages. Can't post on the Board, post as the club, create events or run check-in.

## Where officer tools live
1. Club page (phone + desktop, owner/admin): officer bar Invite people, Banner, Logo, Edit details, New post (`src/app/orgs/[handle]/admin-actions.tsx`); "+ Create event" (`OrgEventsSection.tsx`); Delete post; "Who came" on past events (30 days, `OrgPastEvents.tsx`).
2. Club space in Messages: Board posts (owner/admin), Up next, polls/sign-ups/event cards from the + tray; desktop only: Manage rooms (`RoomsDialog.tsx`), members dialog, "Manage club" link (`ClubPane.tsx`, `ClubPanel.tsx`).
3. Desktop settings window `/campus?manage=<handle>` (cs, tabs Overview, Channels, Members, Followers, Invites, Requests, Danger). Desktop only; needs the chat_desktop switch; no link from the club page.
4. The club page ⋯ menu (`src/components/orgs/OrgMenu.tsx`): followers-read-the-Board switch, mute, leave.
5. Campus › Events: create (desktop only, `CreateEventModal` in cs; fields title, description, location, start, end, club; no cover, capacity or audience), Start check-in (`StartCheckinAction.tsx`), Manage attendees, Mark as here, edit, cancel (a hard delete).

## Rooms and the Board (`supabase/migrations/20261017110000_board_follower_read.sql`)
- Kinds: board, lounge, officers, event, room. New Board posts: owner/admin; any member replies. Up to 5 extra rooms (desktop UI only).
- Followers (school email verified) read top-level Board posts as the club's, no replies, no reacting or voting.
- No pins in club rooms, no editing messages, no photos or videos in any club room, polls never close by hand.
- The officer composer says "Everyone in <club> sees this" (`RoomComposer.tsx`), which leaves out followers.

## Events and check-in
- `POST /api/events` needs a VERIFIED club and owner/admin, 10 an hour. No notice is sent.
- Not creatable from the phone Events tab; "Add your first event" (`UpNext.tsx`, `ClubEmpty.tsx`) dead-ends there.
- RSVP going / maybe ("Interested"); RSVP adds you to the event chat; officers get Manage attendees, "Message all" (a new group chat).
- Check-in (`src/lib/events/event-checkin.ts`): 1 hour before to 1 hour after; code changes every 30 s; mark until a day after; door `/campus/checkin/[id]/door`; count from 5 for non-officers. Only on the Campus/club-page event card, never on Up next or in the event chat.
- No event page: an event's link is `/campus?tab=events&event=<id>`. Add to calendar = ICS. No share or OG image.

## Sharing, counts, notices
- No share button, copy-link or QR for a club (the only QR is check-in). Club link previews use the generic site picture; clubs aren't in the sitemap.
- Invite links are off (`INVITE_LINKS_ENABLED = false`); invites need a verified club; one person at a time.
- FOLLOWER_COUNT_FLOOR = 5 (`src/lib/orgs/following.ts`); on the page it hides the count under 5 even from officers.
- Notification types: follow, connection, like, comment, mention, org_invite, org_request_approved, event_cancelled. Nothing for join requests, Board posts or new events; club chats never push except @mentions.
- No officer dashboard: no attendance history, growth or engagement view; post viewers are author-only.

## How officers reach their club
- No Clubs item in the desktop nav or the phone tab bar; no /orgs index. Entry points: Campus › Clubs (Yours / Following), the profile's Clubs section and flair, Messages, search, event cards, the calendar, notifications.
- The desktop Feed's "Your clubs" opens the Board in Messages, not the page. The page's back link always goes to the clubs list.
