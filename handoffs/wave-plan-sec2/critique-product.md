# Wave-plan sec2 critique: product (what students, officers, moderators will notice)

Reviewer: product critic. Read-only. Sources: plan.md, security-lenses-authz-dataexp report, code at HEAD, live DB via read-only MCP (policies, grants, counts only).

## Status log
- done: A1-A5, moderators, ownership, decisions. Verdict go-with-changes.

## A1 profile privacy
Live: 1 account hides experience, 1 hides resume, 1 hides skills (0 hide bio). authenticated can SELECT users.bio/skills/work_experience/current_on; profile_layout + resume_url are service-only.
- Student (owner) notices: nothing on their own page. Visitors notice: hidden widgets are really gone (not just undrawn). Good.
- Visitor with a Gmail-only (not school-verified) account: the resume card disappears for them. Needs a sane empty state, not a broken "Download" that 404s. 6 of 20 accounts are unverified today, founders' testers among them.
- Owner who gets suspended: their resume stops downloading for everyone. Fine.
- BIO CANNOT BE REVOKED: `src/app/api/me/threads/route.ts:465` reads other members' `bio` with the cookie client and `public/html/messages.html:2014` shows `peer.school || peer.bio` as the DM subtitle. Revoking SELECT on bio would error the inbox's member hydration. So the builder must take the "change the copy" branch for bio at least.
- Copy is the real decision: "hidden · only you see it" is a promise the database can't keep for bio/skills/experience/working-on while they stay column-readable (and bio shows in the DM list subtitle, link previews). Recommend: "Hidden from your profile" / "hidden · not shown on your profile", and keep the strong "only you" wording ONLY for the resume (which really will be server-enforced).
- LINK PREVIEW GAP: `src/app/profile/[handle]/page.tsx:71` uses bio as og:description. A1 owns this file; it should also drop bio from the preview when bio is hidden (not only for restricted users). Otherwise an iMessage unfurl shows the "hidden" bio.
- Phone header skills row already honours hidden skills (ProfileMobile 1445); after server blanking the owner still needs the real values (owner bootstrap path is separate: `me/profile-bootstrap`). Make sure blanking is visitor-only or the owner's edit sheet empties.

## A2 blocks in the database
Live: 0 blocks today. Block route already drops follows both ways and hides 1:1 DMs on the blocker's side; it does NOT touch comments, reposts, likes, bookmarks.
- Student who blocks: nothing new in normal screens (routes already filter). What changes is that the blocked person can no longer get around it with dev tools, and a shared link to the other's post / by-id profile now says "not found".
- Blocked person notices: the blocker's posts, comments on third-party posts, and profile vanish everywhere (incl. their own Saved list and their own reposts of the blocker's posts). Checked: `me/bookmarks` drops null posts (:63) and the reposts tab already filters hidden authors (:145), so these vanish quietly, no crash. Only the direct link (`/posts/<id>`) needs a friendly "This post isn't available" instead of a bare 404.
- OLD COMMENTS (decision): today B's existing comments on A's posts stay visible to everyone except A, so A can't even report them. A2's WITH CHECK only stops NEW ones. Recommend: the SELECT rule hides a comment from everyone when its author and the POST's author are a blocked pair (A owns their comment section; this is what Instagram-style users expect). Replies under it drop with it (the orphan rule already exists). Comment count stays the public RPC number (counts public).
- USERS SELECT: do NOT add the block check to `users_select_authenticated`. Comments use an `!inner` users embed (a blocked author silently drops, fine) but DMs, club chat, members, followers, group chats embed users without `!inner`, so names/avatars would turn to null ("Unknown") inside existing threads. Hide via search, by-id, bootstrap (routes) instead.
- Stalking signal the plan leaves open: `last_active_at` and `location_text` stay readable by the blocked person via the data API. Nothing in the app shows another person's last-active; only `api/stats/campus` filters on it (cookie client, head count) and `heartbeat` writes it. Recommend a follow-up: serve the campus "active" count through a count RPC, then revoke SELECT on last_active_at from authenticated. No visible change for anyone.
- Club posts written by a blocked officer vanish for the blocker (the feed already does this at feed/route.ts:358). Keep it: consistent and simple; the gap on the club page is an acceptable cost.
- GROUP CHATS (existing behaviour worth knowing): `messages_insert_member` refuses a send when ANY other member is in a block pair with the sender, so one block in a friend group chat silently freezes BOTH people in that group. A2's "add refuses blocked pairs" is consistent with that. The refusal copy must be neutral ("Couldn't add @x to this chat"), because the adder is a third party and must not learn who blocked whom.
- Group rename now runs the word filter: renames with a slur get the same "try different words" answer as create. Fine.

## A3 Vibe+ and counts
Live: `profile_views_owner_select` = `auth.uid() = profile_user_id` (only policy on profile_views); `post_views` has RLS and no read policy; 43 profile_views rows, 1 entitlement; billing off in prod.
- BIGGEST VISIBLE RISK: `src/app/api/me/profile-views/route.ts` (the FREE "Today / 7 days / N people" tiles) reads profile_views rows, including viewer ids for the distinct count, with the COOKIE client under that exact policy. Drop or narrow the policy without moving this route to the service role / a count RPC and every student's profile-view tiles read 0 silently (RLS filters to zero rows, it does not error, so the route's "a refused count is a 500" guard never fires). Counts-public is a core promise; this would look like "nobody looks at my profile". A3 must convert this route in the same batch, and the browser walk must check the tiles are non-zero for an account with views.
- Students (free) notice: nothing, if done right. Vibe+ owners notice: nothing.
- #18 is a visible IMPROVEMENT: today the savers sheet heading (`total`, filtered by the author's blocks/mutes) can sit below the card's save count (`counts.saves`, unfiltered), which reads as a bug. After A3 both numbers agree.
- Vibe+ viewer LIST stays filtered by the owner's blocks/mutes, so "12 people saw this" above 11 names will happen. Recommend one quiet line under the list when they differ: "People you've blocked or muted aren't listed." It leaks nothing the owner doesn't already know and stops "is this broken?" reports.
- Not in wave A but must be decided before billing turns on: the people being NAMED to Vibe+ owners get no notice today. Safety angle: a harassment target who checks the harasser's profile gets named in the harasser's paid list. "Safety features are never paid" argues for a free private-browsing switch.

## A4 club events
Live: 13 events, 0 personal (org_id null), 12 already in the past; 0 over the route's length caps (120/2000/200); 0 events whose creator is no longer an officer. Roles: owner/admin/mod/member (code treats mod as an "officer" for approvals but not for invites). events has NO removed_at column and no route edits or deletes an event today (only GET/POST + attendees/ics/rsvp).
- Officers notice: nothing when posting (the route already refuses unverified/hidden clubs, back-dated starts beyond 5 min, over-long text). The DB rule only stops the dev-tools path.
- PAST-START GUARD MUST BE INSERT-ONLY with the same 5-minute grace as `events/route.ts:498`. A CHECK like `starts_at > now()` would reject 12 of 13 existing rows and any later UPDATE to a started event (fixing a typo mid-event). Use a BEFORE INSERT trigger.
- "Current officers can edit/delete any of the club's events" is DB-only: there is no edit/cancel route or button, so officers still cannot fix a typo or cancel. For a clubs-first launch this is the gap officers will actually hit. See decisions.
- The events list flags `viewer_can_manage = isCreator || isOrgAdmin` (`events/route.ts:390`). After A4 a demoted creator still sees "manage"/attendees and then hits a 403. A4 owns this file: make it `isOrgAdmin` for club events.
- Dropping the creator embed from the campus list: today it is `creator:users!events_creator_id_fkey!inner(...)`, so a club event silently DISAPPEARS when the officer who made it is suspended/banned (user_visible false). Removing the embed brings those back. Decide which you want (below); don't let it change by accident.
- Students notice: nothing (RSVP hidden-club gap is dev-tools only). No creator name was shown in the UI, so removing it costs nothing.
- Moderators: no way to take down an event (not in the remove tool, no removed_at). After A4 only current officers (via the API) can delete. Flag for wave B1 or a follow-up.
- Account deletion cascades events (and club posts) with the creator (`events_creator_id_fkey ON DELETE CASCADE`): an officer who graduates and deletes their account wipes the club's events and RSVPs. Not wave A, but it is the same "club content follows the club" principle A4/A5 adopt.

## A5 club membership + chat roster
Live: 1 visible club (verified, 1 owner); every officer is school-verified; 0 admins/mods; 10 public + 2 private club channels with only 2 member rows; 0 stale club-chat rows today (the `_cleanup.sql` is a no-op now, still worth shipping as a guard).
- Club post edits by ex-officers: the PATCH route already refuses (`posts/[id]/route.ts:554`), so the policy change is invisible. "Officers can delete a former officer's club posts" is DB-only in wave A: there is no button until B2 wires the DELETE route. Say so in the wave A notes so nobody reports it as broken.
- Ex-officer keeps DELETE on club posts they wrote (`posts_delete_own` is author-only and the plan doesn't change it). Recommend keeping that: an author can always take their own words down, they just can't rewrite the club's voice.
- Leaving / removal now deletes club-chat rows: the ex-member notices the club chat vanish from their inbox (today it can linger). Their old messages stay in the chat with their name. Rejoining re-subscribes public channels but mute/pin settings reset. Fine.
- Demotion is not deletion: a demoted officer stays in PRIVATE officer channels (2 exist). The trigger only fires on DELETE. Recommend a follow-up: demotion drops private club channels.
- RSVPs outlive membership: `event_visible` lets anyone with an RSVP (and the event's creator) keep seeing a hidden club's event after leaving/removal, and they stay on the attendee list. Officers will notice "I removed him and he's still on Friday's list". See decisions.
- CHAT SETTINGS COLUMNS - DO NOT COLUMN-REVOKE: column grants are not row-scoped, and the user's OWN settings are read with the cookie client: `me/threads/route.ts:434-438` (hidden_at, pinned_at, muted_until) and `lib/messages/channel-access.ts:77` (cleared_at). Both fail soft: threads swallows the error, channel-access's retry regex matches "cleared_at" in a permission error and re-reads without it. Result: every student's hidden chats reappear, pins and mutes vanish, and a cleared chat shows its old messages again (a student who cleared a harassing thread sees it all come back). Use a row-scoped path instead (service-role read of own row, or an own-settings RPC); keep `last_read_at` readable (read receipts use it).
- Club name/description writes: the PATCH route already writes with the service role + word filter, and the legacy pages never write orgs directly, so revoking the column UPDATE grants is invisible to officers.
- `orgs/[slug]/posts` gains restriction + school-verified + word-filter checks: all current officers are verified, so the only visible change is the word filter, which now answers club posts the same way as personal posts. Make sure the error names the field and reads as the same "try different words" line.

## Moderators (all three founders), across wave A
- Report review reads `target_snapshot` with the service role (`api/admin/reports/route.ts:119`), so none of the new policies hide reported content from the admin screen. Good.
- The "open profile" link in reports (`reports-client.tsx:719`) goes through the normal profile page: a founder who has personally blocked the reported user, or a suspended user, gets "not found" there. Rule of thumb for the founders: moderate from the admin screen, don't personally block people you moderate.
- After A1 a hidden resume can't be opened from the app by anyone but its owner, moderators included. If a report is about a resume, the snapshot is the only view. Small, but worth a line in the moderator notes.
- No event takedown exists (no removed_at on events, not in the remove tool). With A4 the only deleters are current officers. Add to B1 or a follow-up.

## Ownership notes
- A3 must explicitly own `src/app/api/me/profile-views/route.ts` + `src/lib/metrics/profile-viewers.ts` (free tiles read identities via the cookie client).
- A5's "channel_members settings not readable by others" needs `src/app/api/me/threads/route.ts`, which no batch owns. Recommend: drop that Low from wave A (defer to a later chat batch that owns threads/route.ts); ship the rest of A5.
- A5 changes `ensureMember` (channel-access.ts); A2's group routes (`threads/[id]/members`, `threads/[id]`) may call it. Coordinate: A2 reviews the new 403 path.
- If Franky takes the RSVP decision below, the org_members DELETE trigger (A5) touches rsvps (A4's table): A5 writes it, A4 reviews.
- A4 owns `event_visible` changes: drop the "creator always sees it" clause for club events so an ex-officer of a hidden club stops seeing its events.
- A1 check: desktop visitors never see an empty widget (`profile.html:677` hides `.widget-empty` in viewer mode), so blanking the fields and dropping the hidden list makes a hidden widget look exactly like one never filled in. No visible regression, and a privacy win: visitors can't tell "hidden" from "empty".

## Decisions for Franky (each with a recommendation)
1. Hidden-widget wording (A1). Recommend: "Hidden from your profile" for bio/skills/experience/working-on; keep "only you see it" only for the resume, the one thing the server will truly lock.
2. A blocked person's OLD comments on your posts (A2). Recommend: they disappear for everyone, not just you (your comment section, your rule).
3. Blocks and clubs, which direction (A5 #15). Recommend: if an officer blocked the student, their join/request quietly goes nowhere (looks like an unanswered request; open clubs show "Request to join"). If the STUDENT blocked an officer, let them join anyway with a heads-up, and hide their request from that officer. Never lock a victim out of a club because their harasser is an officer.
4. Removed members (A5). Recommend: a removal lasts until an owner/admin lets them back (accepting a request or sending an invite); officers see a small "Removed before" tag on the request; mods can't approve those. Keep mods out of invites for launch.
5. Who manages club events and deletes club posts (A4/A5). Recommend: owner + admins only (mods moderate chat, not content), matching the existing club-post edit rule.
6. Officer "Edit / Cancel event" (A4). Recommend: yes, as its own small batch right after wave A (not inside A4), and a cancel notifies everyone who RSVP'd. Clubs are the launch path; they will hit this first.
7. Events made by a now-suspended officer (A4). Recommend: keep today's behaviour (they drop off the campus list, like that officer's club posts) and don't let the creator-name cleanup change it by accident.
8. Removal and RSVPs (A5). Recommend: a removal drops that person's RSVPs to the club's upcoming events; a voluntary leave drops them only for hidden clubs.
9. Before Vibe+ billing turns on (A3 follow-up). Recommend: a FREE "browse privately" switch (LinkedIn-style: private browsers don't see names either) plus a privacy-policy line that profile views can be seen by Vibe+ members.
