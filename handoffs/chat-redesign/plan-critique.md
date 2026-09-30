# Critique of `wave-plan.md` (club chat redesign), 2026-09-29

Read-only review against the real code, the local DB (`docker exec supabase_db_vibe psql`, `\d`, `pg_policies`, grants) and three read-only aggregate queries on production (migration list, channel/room counts, the push file's pre-checks). No code was changed.

**Verdict:** the product direction is sound, but wave 1 as written can't be built safely. Four things need to change before `wave-1-contracts.md` is written:
1. **The access model for event rooms.** Today's gate needs club membership, and letting non-members in breaks five existing rules.
2. **Direct database writes.** Students can still insert messages straight into the database, which gets around a Board lock and the new message kinds.
3. **The backfill.** The only real club (SAE) doesn't fit its rules.
4. **The "read-state privacy fix".** It is scoped to the wrong columns, and as written it would break read receipts in DMs.

The timeline puts desktop work and half-finished phone work live during demo days and the App Store review, with no feature flag. A slimmer v1 appears at the end.

Severity: **high** = will break something, leak something, or block the build. **medium** = real rework or a missed dependency. **low** = worth writing into the contracts.

---

## HIGH

**1. Clients can write straight to `messages`, and new tables are open by default.** (high)
- Evidence (local DB, same shape as production):
  - `authenticated` holds table-level INSERT on `messages`.
  - The `messages_insert_org_member` policy lets anyone who can view the club insert into any of its channels. The only check is `can_view_org_channel`, so there is no Board rule.
  - A new `messages.kind` column would be insertable by clients on day one. Anyone could write `kind='poll'` with no side-table row, or post top-level in the Board through PostgREST.
  - The default ACL (`\ddp public`) gives `anon` and `authenticated` `arwdDxtm` on every new table.
  - Standing rule `20260922090000_guard_function_privileges.sql:48-51`: never revoke EXECUTE on a public function. Grant it and refuse inside the function.
- Change:
  - Wave 1 restates BOTH insert policies (`messages_insert_org_member` and `messages_insert_member`). Direct inserts must be `kind = 'text'`, and in a Board they must be a reply (see #12) unless the sender is a current owner/admin.
  - ONE batch owns that policy text. B1 (Board) and B2 (kinds) would otherwise each restate it, and the second would silently drop the first one's clause.
  - Every new table: `REVOKE ALL ... FROM anon, authenticated` (plus TRUNCATE from service_role), then grant back only by name.
  - Every new SECURITY DEFINER function keeps EXECUTE and refuses `anon`/`authenticated` inside, using the `claim_push_outbox` idiom.

**2. Event rooms don't fit today's gate.** (high)
- Evidence:
  - `can_view_org_channel` (live definition) returns false unless the person is a club member (`is_org_member`).
  - That one function gates everything for org channels:
    - the `channels_select_org_member`, `messages_select_org_member` / `messages_insert_org_member` and `message_reactions_*` policies
    - `ensureMember` (`channel-access.ts:73-80`) and the upload route (`messages-upload-url/route.ts:90-92`)
    - the @mention roster (`users/search/route.ts:75-90`) and the push re-check (`dispatch.ts:783`)
  - So a non-member who RSVPs can't read, post, react or be mentioned in any org room.
  - Separately, the AFTER DELETE trigger on `org_members` (`20260928100000:295`) deletes ALL of a club's `channel_members` rows when someone leaves, event-room rows included.
- Change: pin one model in the contracts.
  - **Recommended:** event room = `channels` row with `org_id` = the event's club, `kind='event'`.
  - Access is a *materialized* `channel_members` row:
    - kept in sync by a trigger on `rsvps` (going/maybe in, `no`/delete out), plus the club's officers
    - covers direct PostgREST RSVP updates, because `rsvps_update_own` exists
  - `can_view_org_channel` gets a first branch: `WHEN c.kind='event' THEN` a `channel_members` row exists AND the club is visible AND no removal/block rule applies (#3).
  - The delete trigger skips event rooms whenever the RSVP rules still allow access.
  - This is one function edit that every policy picks up. Say so, and load-test it: it runs once per row in `messages` RLS.

**3. Letting non-members in through an RSVP (call 4) bypasses the club rules.** (high)
- Evidence: `PUT /api/events/[id]/rsvp` checks only that the club isn't hidden and that the event is on your home campus.
  - **No home campus:** `rsvp/route.ts:80` (`if (!viewerCampusId) return null`) and `rsvp_on_home_campus` (`h.campus_id is null → true`) let an account with no campus RSVP anywhere.
  - **No audience check:** Indianapolis is ONE `campus_id` for both universities (`campuses.ts:217`), so a Purdue student can RSVP to an IU-only club's event. Joining the club is gated by audience (`join-state.ts`); RSVPs aren't.
  - **No officer-block check:** see ruling 9.
  - **No removal check:** a removed member can re-RSVP as a non-member and be back in that club's room, breaking ruling 10.
  - **No school-verified check:** the PUT requires Terms only (`:150`).
  - **No "public event" concept:** every non-hidden club's events are visible to everyone (`event_visible`), invite-only SAE included, and `events` has no visibility column.
- Change: for non-member access, pin all of these, re-checked when the room is read and not only at RSVP time:
  - verified school email
  - the same non-null home campus
  - the club's audience matches
  - no `org_removals` row
  - no block pair with any officer
  - the club is visible
  - an officer toggle, e.g. `events.room_open_to_rsvps` (default off)

  Or cut non-member access from v1 (see §v1).

**4. Event rooms reveal who RSVP'd.** (high)
- Evidence: today only current owners/admins see attendee names (`events/[id]/attendees/route.ts` header, `rsvps_select_own_or_manager`); everyone else sees counts only (`event_rsvp_counts`).
  - The planned room shows "going faces".
  - Its roster (`channel_members` is readable by co-members, and so is the mention search) shows every room member who RSVP'd.
- Change: add a call for Franky.
  - Recommended: the Going button says "You'll appear in the event chat". Faces show only people who have posted or opted in.
  - "N going" is shown from 5 up, following the N=1 rule.

**5. "Wave 1 — nothing visible changes" is false.** (high)
- Evidence: the Board lock hits every chat screen that exists today, the moment wave 1 deploys:
  - the phone `ConversationView` for club threads
  - desktop Campus › Chat `ChannelChat`
  - `messages.html`, which lists club channels as groups
  - `_miniMessenger.js:841`, which sends to any `/api/me/threads` row

  After that:
  - A card message shows as an empty bubble on all of them until waves 3–4, and in Otto and inbox previews.
  - The push text and the report snapshot (`reports/route.ts:321-324` stores `content`) get no text either.
- Change:
  - (a) The contracts give every card kind a fallback `content`, e.g. `Poll: <question>` or `Sign-up: <title>`, so older screens show text.
  - (b) The thread GET returns `can_post`. A small wave-1 compat batch shows "Only officers post here" on the three older composers.
  - Or (c) turn the lock on in the same deploy as the new UI, behind the flag in #6.

**6. There is no feature flag or rollout step.** (high)
- Evidence: each wave deploys straight to the one production site. SAE officers see whatever is live during demo days (week of Oct 5).
  - The roadmap has app submission on Oct 16 and links on Oct 23. The store apps are a web view of the live site (`mobile/capacitor.config.ts`), so the reviewer tests whatever is deployed during waves 3–4.
- Change:
  - Add a server-read `chat_v2` flag (founders plus SAE allowlist, the same shape as founders-only push).
  - Freeze chat surfaces from Oct 16 through review.
  - Flip it for everyone at launch.

**7. The backfill rules don't fit SAE, the only real club.** (high)
- Evidence (production, read-only): SAE has
  - `general`: **private**, 3 messages
  - `announcements`: public
  - `events`: public
  - `exec`: private

  The plan's rules collide:
  - "#general → lounge" and "private → officers" both claim `general`.
  - Two private channels would give two Officers rooms.
  - A private Lounge would hide it from members: `can_view_org_channel` only lets owner/admin or the allow-list into a private channel, and SAE has 0 `org_channel_members` rows.

  Also:
  - New Board/Lounge rows need `channel_members` subscription rows for existing members. `subscribePublicChannels` (`membership.ts:214`) only runs when someone is admitted.
  - DM and group rows also have `is_private=false`, so "first public channel" must be scoped with `WHERE type='org_channel'`.
- Change:
  - The contracts carry an explicit mapping per club, with SAE's decided by Franky. Recommended: `general` → Lounge made public, `exec` → Officers.
  - A partial unique index allows one board, lounge and officers room per club.
  - The backfill inserts the missing subscription rows.
  - The header records the dry-run counts (5 clubs, 12 channels, 15 club messages, 1 reply today).

**8. The "read-state privacy fix" (B4) is scoped to the wrong columns.** (high)
- Evidence: the item moved out of wave A is the `channel_members` **settings** columns: `muted_until`, `hidden_at`, `cleared_at`, `pinned_at` (`waveA-build.md:41`, `approach-A5.md:73`, `critique-product.md:55`).
  - The critics said to KEEP `last_read_at` readable, because DM read receipts use it (`threads/route.ts:491-534`).
  - Typing uses `typing_until` (`messages/route.ts:290-335`).
  - B4 would hide exactly those two, which breaks "Read" and typing in DMs, and it leaves `hidden_at`, `cleared_at` and `pinned_at` exposed.
  - A column revoke does nothing while table-level SELECT exists. A table revoke silently breaks the reads of your OWN row with the signed-in (cookie) client:
    - `threads/route.ts:466`
    - `otto/route.ts:426`
    - `pin/route.ts:32`
    - `badge.ts:89`
    - `channel-access.ts:99-107` (`cleared_at`)

    Hidden chats would come back, and a cleared harassing thread would reappear.
  - "Per-user unread counts computed server-side" is already true (`threads/route.ts:639-642`).
- Change:
  - Restate B4: first move those own-row reads to the service role (or an own-settings RPC); then revoke table SELECT and grant back a column list without the settings columns.
  - The route serves peers' `last_read_at`/`typing_until` for dm/group only, through the service role. Club rooms never expose them.
  - Not a v1 blocker unless "seen by" or presence ships.
  - B4 owns all of those files (see #10).

**9. Applying the push migration in wave 1 (B5) is a separate decision with its own risks.** (high)
- What `20260924120000_push_notifications.sql` does (all additive):
  - creates `push_devices` and `push_outbox`, with RLS on and zero client grants
  - adds the `trg_push_on_notification` AFTER INSERT trigger on `notifications`, which queues every type except `connection` for anyone with a device
  - adds the `claim_push_outbox` RPC
- Risks:
  - (a) Production has applied versions up to `20260930100000`, so this lower number would land out of order. The file's own NUMBERING note (`:181-188`) says to renumber it.
  - (b) Local has it applied (and billing `20260922150000`); production has neither. A wave-1 migration tested locally could depend on `push_*` and then fail in production.
  - (c) It locks `users`, `notifications` and `messages` (lock_timeout 5s, `:160-166`), so apply it at a quiet hour.
  - (d) There is no notification-settings table, only `channel_members.muted_until`. Once devices exist, every Board post queues one outbox row per member, and "Board + mentions" can't be honored without new preferences plus dispatcher checks.
  - (e) `PUSH_ENABLED`, the keys and the founders-only allowlist belong to the PWA plan.
  - Production's own pre-checks pass today: 0 functions deny EXECUTE, and `notifications` has no triggers.
- Change: remove the push apply from the chat plan and put it back in the push plan, renumbered. The chat B5 becomes in-app only.

## MEDIUM

**10. Wave 1 batches edit the same files at the same time.** (medium)
- Evidence: `src/app/api/me/threads/[id]/messages/route.ts` is edited by four batches:
  - B1: the POST Board gate
  - B3: the GET returning kinds (`:245`)
  - B4: the GET peer reads (`:290`)
  - B5: the POST notification fan-out (`:560-615`)

  Also shared:
  - `channel-access.ts`: B1 (room helpers) and B4 (`cleared_at`)
  - the messages INSERT policies: B1 and B2 (#1)
  - `me/otto/route.ts`: B4 (settings) and B5 (new notification types)
- Change: run a **B0 contracts step** first, which writes pure helper modules and signatures only. Then:
  - **B1 rooms:**
    - owns migration A (channels `kind`/`event_id`, backfill, the `can_view_org_channel` event branch, ALL messages INSERT/SELECT policy restates)
    - owns `channel-access.ts`, `api/orgs/route.ts` default channels, `api/orgs/[slug]/channels/**` (#17), the `rsvps` sync trigger
    - exports `canPostTopLevel()`
  - **B2 cards:**
    - owns migration B (side tables and RPCs), new card routes under `api/me/threads/[id]/…`, `src/lib/messages/cards/**`
    - exports `hydrateCards(rows)`
    - does NOT touch `messages/route.ts`
  - **B3 reads:** owns only the new read routes (#21).
  - **B4 thread routes and privacy:**
    - owns `messages/route.ts` (both verbs, calling B1/B2/B5 helpers), `me/threads/route.ts` and its `pin`/`hide`/`mute`/`clear`/`typing`/`read` subroutes, `me/otto/route.ts`, `push/badge.ts`, and the grants migration
    - `channel-access.ts` changes go to B1 as a written request
  - **B5 notifications:**
    - owns the `notifications_type_check` restate, `lib/push/**`, `OttoActivity.tsx`, `OttoSidePanel.tsx`, `_otto.js`, `notification-orgs.ts`
    - exports `notifyBoardPost()`; its `otto/route.ts` hunk goes to B4

**11. Waves 2 and 3 all edit one 4,866-line file.** (medium)
- Evidence: every batch in wave 2 touches `MessagesMobile.tsx`: the thread list (`:336-1015`), Your week (the top of the list), deep links (`initialChannelId`) and states (`ListSkeleton :913`, `EmptyState :960`).
  - In wave 3, B1/B3/B4/B5 all touch:
    - `ConversationView` (`:1017`, reused for the Lounge)
    - `MessageBubble` (`:3849`, card rendering)
    - `ConversationActionSheet` (`:2229`, officer delete)
    - `canAttach` (`:1374`)
- Change:
  - Open wave 2 with an **extraction-only batch** that runs alone and changes no behavior. It moves the thread list, `ConversationView`, `MessageBubble` and the sheets into `src/components/mobile/messages/*.tsx`.
  - After that, `MessagesMobile.tsx` belongs to exactly one batch per wave: the navigation/deep-link batch. New screens go in new files: `Inbox`, `YourWeek`, `ClubSpace`, `EventRoom`, `cards/*`.
  - Drop the cross-cutting "B4 · states" batch: each batch owns its own loading, empty and error states, plus Light, Night and 375px.
  - Give its slot to the `CampusMobile` Chat retirement and the `?tab=chat` redirect.

**12. Board replies will leak into the Board as if they were posts.** (medium)
- Evidence:
  - `messages_parent_message_id_fkey ON DELETE SET NULL`: deleting a Board post (by its author, by account deletion via `messages_user_id_fkey CASCADE`, or by removal) turns members' replies into top-level Board messages.
  - The POST silently drops a parent it can't find (`route.ts:478`). In a Board with the #1 RLS, that becomes a 500; without it, a member's top-level post.
  - Board history paging would mix posts and replies.
  - `messages.kind='board_post'` repeats `channels.kind='board'`, so the two can drift apart.
- Change:
  - Drop `board_post` from `messages.kind`.
  - In a Board, the route answers 409 for a missing parent instead of dropping it.
  - Board reads filter `parent_message_id IS NULL` and return a reply count.
  - A trigger deletes the replies when their Board parent is deleted.
  - Say that @mentions inside replies still notify, or turn them off there.

**13. The side tables leak voter names and can't enforce their own rules.** (medium)
- Evidence (plan lines 37-40):
  - "Reads through RLS (`can_view_org_channel`)" lets every room member read `chat_poll_votes (poll, user, option_idx)`, which contradicts call 10.
  - "Unique per user/option" doesn't enforce single choice.
  - Claiming the last slot can race over capacity.
  - Indexes into a jsonb option or slot list shift when the poll is edited.
  - Creating a card is two inserts, not one transaction.
  - A moderator-removed poll's side rows stay readable unless reads join `messages.removed_at`.
- Change:
  - Votes and claims get zero client grants.
  - Writes go through SECURITY DEFINER RPCs (`create_card`, `cast_vote`, `claim_slot`) that refuse inside, one transaction each, `claim_slot` taking `SELECT … FOR UPDATE`.
  - Add unique(poll, user) when the poll isn't multi-choice.
  - No edits after the first vote or claim.
  - Model a sign-up as a poll with `mode='signup'` and a capacity per option: one table pair instead of two.

**14. Moderation and Apple UGC readiness for the new kinds is missing.** (medium)
- Evidence:
  - The message report snapshot is `id, user_id, channel_id, content, media_url, created_at` (`reports/route.ts:321-324`). A reported poll or sign-up has no question, options or slot labels.
  - The only DELETE is sender-only and hard (`[messageId]/route.ts:45-52`; `messages_delete_own`), so an officer tool built the same way destroys evidence.
  - Ruling 8 says mods moderate chat, but the plan says "officers".
  - Apple's UGC rule (guideline 1.2: filter, report, block) must hold before submission on Oct 16.
- Change:
  - The report snapshot adds the card payload.
  - Officer and mod delete in club rooms is a soft remove (`removed_at`, `removed_by`, a reason like `officer`), done by the service role, never on a message with an open report.
  - The word filter runs on the question, every option, the title and each slot label, with limits: question ≤200, 2–10 options, each ≤80.
  - Rate limits:
    - cards share the `message-send:` bucket
    - votes and claims get their own (e.g. 120 per 10 min)
    - restricted users can't vote or claim (the reactions precedent)

**15. Mentions in club rooms notify people who can't read them.** (medium)
- Evidence:
  - The club branch picks mention targets from all `org_members` (`route.ts:581-585`), not from the room's readers.
  - A mention in the Officers room, a private room or an event room writes an in-app notification for someone who can't open it. Push re-checks later (`dispatch.ts:783`); the notification row doesn't.
- Change: filter targets with `can_view_org_channel`, as extended in #2.

**16. B5 (notifications) is too narrow.** (medium)
- Evidence:
  - There is no notification-settings table (local DB: only `channel_member_mutes`, `mutes`, `channel_members.muted_until`).
  - A new type means restating `notifications_type_check` (8 types today, fingerprinted as in `20260930100000`).
  - It also means rendering the type everywhere `event_cancelled` needed: `otto/route.ts`, `OttoActivity.tsx`, `OttoSidePanel.tsx`, `_otto.js`, `notification-orgs.ts`, `push/payload.ts`, `dispatch.ts`.
  - A Board post writes one row per club member.
- Change:
  - v1: no `board_post` notification rows. The inbox's coral Board dot is the signal.
  - Settings and "Board + mentions" come in a later wave, with a table.

**17. The existing channel routes can break the new structure.** (medium)
- Evidence:
  - `channels/[channelId]` PATCH/DELETE (`:101-172`) lets owners and admins rename, make private or delete any channel, Board and Lounge included.
  - `channels` POST has no cap on the number of channels.
  - The desktop modals that call these stay live until wave 4.
  - `api/orgs/route.ts:884-897` creates default channels without `kind`. Its error is non-fatal, so if a NOT NULL/CHECK lands before the code, new clubs are silently created with **no channels**.
- Change:
  - Wave 1 adds `kind` guards to those routes: Board, Lounge, Officers and event rooms can't be deleted, made private or renamed away, and custom rooms are capped at 3 in POST and in a DB trigger.
  - The migration fills `kind` with a BEFORE INSERT trigger (default `room`; `general`/`announcements` on create), so old code keeps working until the deploy.

**18. The `events` table can't feed the room design.** (medium)
- Evidence: `\d events` shows no cover image, "bring", "rides" or status/cancelled column.
  - Cancelling is a DELETE plus a notice (`20260930100000`).
  - Production has 0 events without a club, and POST requires `org_id`.
  - Storing `opens_at`/`archives_at` goes stale when the event is edited.
  - "Created lazily (first open)" means a write inside a GET.
  - "I'm here" is presence data, and Rides are a safety matter.
- Change:
  - Rooms are club-only.
  - Create them in `POST /api/events`, with a one-time backfill (13 events in production) and `unique(event_id)`.
  - Compute Soon/Live/After at read time.
  - v1 tiles are Where and When from the existing columns; the cover is the club banner.
  - Cut Bring, Rides, "I'm here" and the album from v1.

**19. Wave 4 underestimates what `messages.html` carries.** (medium)
- Evidence:
  - It loads `_otto.js`, `_sw.js`, `_persistence.js`, `_profilePreview.js`, `_postViewer.js`, `_sharePicker.js`, `_safetyActions.js`, `_mentionPicker.js` and `_imageCropper.js` (`messages.html:15-25`). Together those carry requests, group settings, photo cropping, report and block, mentions and post sharing.
  - The mini messenger on `profile.html` depends on `/api/me/threads`.
  - Other ties: `proxy.ts:38,50`; `theme.test.ts:239`; the `sw.js:312-316` iframe logic.
  - Removing the rails also removes desktop's only way into `OrgSettingsModal` (members, requests, followers, delete club), which opens from `campus-home.tsx:981`/`:1040`.
  - The officers' "Message all (N)" group chat (`campus-home.tsx` ~10619-10727) duplicates event rooms.
- Change:
  - Move wave 4 after launch.
  - At launch, desktop gets compatibility only: #5 plus the Discord wording renamed.
  - Before the rails go, give `OrgSettingsModal` a home on the org page.
  - Replace "Message all" with "Open event chat".

**20. The Option 3 inbox drops message Requests.** (medium)
- Evidence: today's tabs are All and Requests (`MessagesMobile.tsx:199`, `:634`). Requests are the safety buffer for DMs from strangers.
- Change: keep Requests as a filter chip or a row above the list.

**21. The new read routes duplicate or step outside what exists.** (medium)
- Evidence:
  - `/api/me/calendar` already takes `from`/`to` and returns RSVP'd events plus personal entries, and `/api/me/upcoming-events` feeds Otto and the strip. `GET /api/me/rsvps` would be a third copy.
  - `/api/clubs/[handle]/space` sits outside the hidden-club 404 sweep on `api/orgs/[slug]/**`.
  - `/api/rooms/[id]/*` sits outside the home of `ensureMember`.
- Change:
  - Extend `/api/me/calendar` additively (room id and state).
  - Use `/api/orgs/[slug]/space` and `/api/me/threads/[id]/{cards,votes,claims}`.

**22. Polling will be expensive.** (medium)
- Evidence:
  - Every room poll costs about 5 queries: `ensureMember` (2 plus an RPC), messages, reactions, parents.
  - Today's thread list loads every co-member row of every club channel (`threads/route.ts:492-498`), which grows with club size.
- Change:
  - Room polls use `?after=<created_at>` for new messages only, and pause when the tab is hidden.
  - The new inbox counts per room and never loads rosters.

**23. Photos in club rooms would keep location data.** (medium)
- Evidence:
  - The server already allows club uploads (`messages-upload-url:90-92`), so the `canAttach` comment at `MessagesMobile.tsx:1372` is out of date.
  - But R2 chat uploads skip location stripping (`waveB-build.md` ruling 5), while the privacy page now promises photos lose their location.
- Change: strip location before turning on photos in club or event rooms, or keep them off in v1.

**24. Deep links need to change for the phone and the store apps.** (medium)
- Evidence:
  - Push links go to `/messages?channel=` (`payload.ts:322`); club mentions go to the club page (`:409`).
  - The store app's hardware back button follows browser history.
  - The org page's `/campus?tab=chat` link (`ChannelsSection.tsx:314`) is shared by phone and desktop.
  - The Otto mention link goes to bare `/messages` (`_otto.js:880`).
- Change:
  - The club space and the event room get URLs, e.g. `/messages?channel=<id>`, so back and push taps land correctly.
  - Redirect `?tab=chat` on the phone only, until desktop is done.
  - Otto and push link to the room.

## LOW

**25. Migration numbering and local-vs-production drift.** (low)
- New versions must be above `20260930100000`.
- Local has billing and push applied; production doesn't.
- Every wave-1 file carries a read-only production PRE-FLIGHT with fingerprints, as waves A and B did.

**26. Room kinds for DMs and groups.** (low)
- Leave `kind` NULL for dm/group, with `CHECK ((type='org_channel') = (kind IS NOT NULL))`.
- Pin whether cards are allowed in group chats. If yes, the card routes must run the `dmSendBlocked` block check.
- Nothing else in the plan should touch DMs or groups.

**27. Who is in the Officers room.** (low)
- A private room today means owner/admin plus the allow-list; mods are left out.
- Decide whether mods are officers there, and whether they may delete messages (#14).

**28. "Pin" (wave 3 B4) is undefined.** (low)
- `channels.pinned` pins a *channel*. Pinning a message needs a new column.
- Define it in the contracts, or cut it.

**29. Accessibility gaps.** (low)
- The week strip's coral and grey dots rely on color alone; add a shape or a label.
- Polls should be a radio group, with count changes announced to screen readers (`aria-live`).
- Tap targets of 44px.
- Wave 3 doesn't mention Light, Night or 375px checks.

**30. Call 10 goes against the chat precedent.** (low)
- Ruling 12 (reactions show who reacted) and every chat app's sign-up sheet show names.
- Recommend re-asking Franky:
  - sign-ups show names to room members, since that's the point of them
  - polls show names by default, with an "anonymous" toggle
  - anonymous polls show counts only

---

## Smallest v1 that still hits the three must-haves

**1. Announcements separate from chatter.**
- Board and Lounge room kinds, with the backfill (SAE mapped by hand).
- Top-level Board posts from owner/admin only.
- Folded replies that don't notify.
- An inbox Board dot.
- No push, no "seen by", no notification settings.

**2. Event chats.**
- Club-only rooms, created with the event.
- **Members** with Going/Maybe, plus officers. Non-member access comes after launch (#3, #4).
- Where and When tiles, with the club banner as the cover.
- Open from creation until 7 days after the end.

**3. Polls, sign-ups and RSVPs in chat.**
- One `chat_polls` model with `mode poll|signup`.
- An RSVP card that calls the existing RSVP route.
- No Headcount.

**Plus the minimum around it:**
- A compact Messages home: Chats · Clubs · Requests, and this week only (chips, no month sheet, no swiping between weeks).
- Officer and mod soft-delete in club rooms.
- Report snapshots that include cards.
- Desktop compatibility only (#5).
- Everything behind the `chat_v2` flag.

**After launch:**
- the month sheet and swiping between weeks
- non-member event rooms
- custom rooms and pinning
- photos in club rooms (after location stripping)
- notification settings and applying push
- "seen by" and Realtime
- the React desktop Messages page (wave 4)

## Timeline

The plan's cut (wave 2 by Oct 9, wave 3 by Oct 16, wave 4 by Oct 23) isn't credible:
- It overlaps f2 (Oct 4), demo days (week of Oct 5), and f9, the Android build and decision day (Oct 9), all of which are Franky's priority.
- It overlaps the Oct 16 submission and the review, with the chat changing under the reviewer and no flag.
- It overlaps the Oct 23 check on Rylan's 10 clubs.

**Proposed schedule:**

| When | What |
|---|---|
| Sept 30 – Oct 2 | Wave 0: calls 1–10 plus the new calls in #3, #4, #7, #30, and the contracts. Wave 1 slimmed to B0, B1, B2 and B4 (#10), behind the flag. |
| Oct 5 – 9 | Phone home and club space, flag on for founders and SAE. Demo days show it to SAE only. |
| Oct 10 – 14 | Event rooms and cards, the sentinels, the phone walk. |
| Oct 15 | Freeze for submission. |
| Launch | Flip the flag for everyone. |

Desktop keeps `messages.html` and the Campus › Chat tab with the compat fixes.
