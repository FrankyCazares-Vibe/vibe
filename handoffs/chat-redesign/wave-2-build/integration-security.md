# Integration review — lens "security" (wave 2, 2026-09-30)

Reviewer: cloud session (no database, no browser), read-only on the tree; branch
`claude/relaxed-davinci-9d11h3` at `b3381af` (main `5c68da1`). The whole diff
`5c68da1..b3381af` was read attacker-first: every new or changed route under
`src/app/api`, every `createSupabaseServiceClient` in the diff and where its rows
can travel, the blocking stub end to end, migration B's five functions and four
tables, the report snapshot, the remove route, the card routes' word filter, the
screens' URL building / HTML / storage / logging, and the seven batch security
reviews (B1–B4, S1–S3) with their repairs, so nothing already closed is re-raised.

## Verdict

**PASS for the security lens, with one MEDIUM to fix now and two LOW decisions.**
No route lets a caller read what RLS would refuse them; every service-role read
either produces a count, a row the viewer already read on their cookie client, or
a field the contract names; the stub applies with the flag off wherever the old
screens read; migration B's tables are unreachable by client roles and its RPCs
refuse `anon` / `authenticated` as their first statement. The one thing to fix
before the Mac is not a leak but a missing control: **a text Board post and every
Board reply cannot be reported or removed from the new Board** (the picker exists
only on cards), which is both the officer's main moderation path and Apple's
guideline 1.2 mechanism for flagging content.

## Findings

### INT-SECURITY-1 — MEDIUM — `src/components/mobile/messages/club/BoardPost.tsx:201` (the text branch) and `:232-252` (the reply rows)

- **what.** `BoardView.tsx:143-162` computes `canRemove` / `canReport` and hands
  `onRemove` / `onReport` to `BoardPost`, but `BoardPost` passes them only to
  `CardBubble` (`:198`, the `kind !== "text"` branch). The text branch is a bare
  `<p>{post.content}</p>` with no gesture, and the reply rows (`visibleReplies.map`)
  render an avatar and a `<p>` with no gesture either. So in the new Board: a member
  cannot Report a text post or a reply; an owner / admin / mod cannot Remove one
  (the remove route of section 6, built for exactly this, is unreachable for the
  commonest Board content). Every old renderer has Report on every bubble, and the
  new Lounge (`RoomThread.tsx:332-383`) has both. Recorded by S2 as
  S2-SECURITY-5 / STOPPED 11 for this review to decide; 11.4 lists a post's parts
  without a picker (contract-silent, not contract-forbidden).
- **why the security lens.** Apple's guideline 1.2 (UGC) requires "a mechanism to
  report offensive content" on every surface that shows it; with the flag on for
  everyone (Oct 26) and any later submission, the reviewer long-presses a Board
  post and finds nothing. Second, the club's own moderation (Franky's call 27) does
  not reach text posts, so an officer's only answer to an abusive Board post is a
  Vibe report.
- **fix (exact).** In `BoardPost.tsx`: (1) move `CardBubble`'s 500 ms long-press
  handlers (`CardBubble.tsx:106-175`: the timer, `longPressFired`, the
  `onContextMenu` swallow, the cancel on scroll / layer close) into a small hook
  `cards/use-long-press.ts` (`useLongPress(onFire): { onPointerDown, onPointerUp,
  onPointerCancel, onPointerMove, onContextMenu }`) and use it from both files;
  (2) wrap the text branch's `<p>` in a `div` carrying the hook, with a
  `pickerOpen` state that renders the same `<ReactionPicker … onPick={() =>
  setPickerOpen(false)} onReport={onReport} onRemove={onRemove}>` as
  `CardBubble.tsx:267-290`; (3) give each reply row the same hook and picker with
  `onReport = () => setReportMessage({ type: "message", id: m.id, authorId: m.users?.id
  ?? m.user_id, authorName: …, noun: "message" })` and `onRemove` when
  `viewer?.can_moderate && m.user_id !== viewerId && m.user_id !== ""` — the reply's
  remove calls the same `DELETE /api/me/threads/<roomId>/messages/<m.id>` through
  `BoardView`'s `confirmRemove` (lift `removeTarget` / `reportMessage` setters into
  `BoardPost`'s props as `onReportReply(m)` / `onRemoveReply(m)`, or mount a second
  `ReportSheet` / `RemoveConfirm` inside `BoardPost`), then `setRetryToken` so the
  fold re-reads and shows the `RemovedContentCard`. Amend 11.4: "a long-press on a
  text post or on a reply opens the picker with Report and, for an officer or a
  mod, Remove (reactions on Board rows stay as they are: none in v1)". Tests: a
  `home-rules`-style pure test is not possible for a gesture; the Mac's browser
  walk (13.3 step 4) gains "long-press a text Board post → Report; as avery →
  Remove; a reply → Report".

### INT-SECURITY-2 — LOW — `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:154-155` (B3-SECURITY-2 / B3-CONTRACT-3; decision: FIX NOW, six lines)

- **what.** Step 8 reads the author's rank through `clubRole`, which answers `null`
  for "left the club" AND for a failed or thrown service read (`rooms.ts:339-348`).
  A null rank is 0, so `outranks(callerRole, null)` is true: on a transient failure
  of the author's read a mod removes an owner's message. Step 6 (the caller's read)
  fails closed; step 8 fails open. Not attacker-triggerable (the two reads hit the
  same table with the same client milliseconds apart) and there is no un-remove
  route, so a wrong removal is permanent until Franky fixes the row by hand.
- **fix (exact).** Step 8 reads the author's role on the route's own `service`
  client so a failure is a failure: replace `:154-155` with
  `const { data: authorRow, error: authorErr } = await service.from("org_members")
  .select("role").eq("org_id", member.orgId).eq("user_id", msg.user_id).maybeSingle();
  if (authorErr) { console.error(`[${LOG} author role]`, authorErr.code, authorErr.message);
  return refuse("try_again", 503); } const authorRole = isClubRole(authorRow?.role) ?
  authorRow.role : null; if (!outranks(callerRole, authorRole)) return refuse("not_allowed", 403);`
  (`isClubRole` from `@/lib/chat/room-rules`; `service` is created at `:129`, so
  move the `isSupabaseServiceConfigured` block above step 8 — it already is).
  Amend 6.1 step 8: "a failed author-role read → 503 `try_again`, never rank 0".
  Add the case to `remove-route.test.ts` ("the author's role read fails → 503; no
  update"). If the repair window cannot take it, ratify B3-CONTRACT-3 as AFTER
  LAUNCH with this exact text — but the change is smaller than the after-launch
  `{ role, failed }` shape and touches one file.

### INT-SECURITY-3 — LOW — `src/app/api/me/inbox/route.ts:163, :248`, `src/lib/chat/reads.ts:222`, `src/app/api/orgs/[slug]/space/route.ts:233` (B4-SECURITY-1 / B4-BEHAVIOUR-3; decision: FIX NOW, amend 7.1.4 / 7.1.7 / 7.2.4)

- **what.** The two preview windows and the event-activity read filter
  `thread_root_id is null` only; RLS (`messages_select_org_member`) hides everyone
  else's removed rows but keeps the viewer's own, so the viewer's own officer-removed
  message can be `board.latest` / `lounge.latest` (its raw text on the home row),
  move `last_activity_at`, and in the space `lastShown` skips `hidden` only, so the
  viewer's own removed Board post can be `board_latest` on the strip. Own text, own
  timestamps: not a leak. It is a wrong row on the author's own screen — the home
  previews a message the Board shows as `Removed by a club officer.`
- **fix (exact).** `.is("removed_at", null)` after the `.is("thread_root_id", null)`
  at `inbox/route.ts:163` and `:248` (the counts at `:209` already have it);
  `lastShown` becomes `<T extends { hidden: boolean; removed: unknown }>` with
  `if (!messages[i].hidden && messages[i].removed === null) return messages[i];`
  (`reads.ts:222-227`; `reads.test.ts` gains "a removed last row is skipped").
  Amend 7.1.4 ("… and `removed_at is null`"), 7.1.7 (the event-activity read, the
  same) and 7.2.4 ("the last message that is not `hidden` and whose `removed` is
  null").

## What Apple's reviewer sees after Block (walked by reading)

The reviewer holds two accounts, both club members, and blocks one from the
other. `blocks_select_either` lets each cookie client read the pair; `blockedIdsFor`
(`blocks.ts:21-35`) and `loadHiddenUsers` (`hidden-users.ts:29-61`) read it both
ways and never fail open (`null` → 503 / 500).

**Flag OFF (the submission of Oct 16; the reviewer is not on the allow-list):**

| where the reviewer looks | what the code does | holds? |
|---|---|---|
| the old Messages list, a club row | `threads/route.ts:715-728`: the club-room preview skips `blockedPeerIds`; a window of only blocked rows → `No messages yet` | yes |
| the old club thread (phone) | `messages/route.ts:133-134` reads the set once → `buildChatMessages` `:640-642` stubs the row whole (`asStub`: no content, no user, no card) → `ConversationView.tsx:548` filters `hidden` before grouping; a quote of the blocked person's message → `parent_preview: null` (`:653`); the going list leaves them out (`readGoing` `:1021`) | yes |
| Campus › Chat (phone, desktop) | `campus-home.tsx:16391` filters `hidden` before the map | yes |
| `messages.html`, the mini messenger | the objects carry `hidden` (`:2474`, `:665`) and the renderers skip them (`:1430`, `:763`); the DELETE path (`:3300-3303`) keeps the field; a sent message is the sender's own | yes |
| a poll / sign-up / event card by the blocked person (posted by a flag-on member) | its row is a stub like any other (a stub's `kind` is always `"text"`, `card: null`, so not even the card's kind is told) | yes |
| the notifications list after an @mention by the blocked person | the row is written (`messages/route.ts:571-596`, club rooms never refuse a send, 8.5) but `notifications/route.ts:72` reads `loadHiddenUsers` and hides it; the push drain skips a blocked actor (`push/dispatch.ts:633`) | yes |
| the blocked person's profile | unchanged (`bootstrap/route.ts`, "This account has restricted you") | yes |
| a direct PostgREST read with the anon key and a JWT | still reads the blocked person's club-room rows (D2, 8.7: after launch); not a path a reviewer takes | accepted |

What the blocked pair can still infer with the flag off: the stub's `created_at`
and `thread_root_id` (someone in a block pair with me posted then, here), a
visible message's `parent_message_id` pointing at a stub, `reply_count` on a Board
post counting the blocked person's replies, a reaction count that includes theirs.
All inside 8.4's accepted list; nothing beyond it was found.

**Flag ON (Oct 26 for everyone; any later review):** everything above, plus the
new screens render nothing for a stub (`RoomThread.tsx:254`, `BoardView.tsx:121`,
`BoardPost.tsx` `visibleReplies`), the home previews skip stubbed rows with the
officer exception (`inbox/route.ts:172-197`), poll voters and "who's going" leave
the blocked person out with counts unchanged (`hydrate.ts:150-153`,
`message-read.ts:1021`). Three visible tells remain, each a contract decision, not
a defect, written here so Franky sees them before the flag goes on for everyone:
(1) **the officer exception (8, open point 14.1)** — if the reviewer's blocked
account is an owner or admin of the club, its top-level Board posts still show
with name and avatar; a reviewer who created the club with one account and joined
with the other is exactly that case; (2) **`lounge.unread_count` counts blocked
people's messages (7.1.5, open point 14.37)** — the row says `2 new`, the Lounge
shows nothing new; (3) **`reply_count` and `total_voters` count them (D1)** — a
post says `1 reply`, the fold opens on nothing. If Apple's second review lands
with the flag on, (1) is the one to strike or narrow first (a one-line change:
`isHiddenFrom` without its third clause, `stub.ts:37-42`, and the inbox's officer
read goes).

## Holds (each tried against the code; nothing to fix)

**Routes, gates in order.**
- `POST …/cards` (`cards/route.ts`): auth → flag → the shared send bucket →
  `requireCanPublish` → JSON → shape (`body.ts`, code-point lengths, unknown keys
  dropped) → word filter over question, every label (poll and sign-up alike), the
  note → `ensureMember` → club room only → `roomOf` → the event read (service role,
  `org_id === member.orgId && ends_at > now`, one 404 for "missing" and "another
  club's": no oracle) → the RPC → read-back on the cookie client. The route's
  service-role reads produce only what the RPC re-checks (P0C23) or the caller's
  own new row.
- `PUT …/vote`: auth → flag → uuid → its own bucket → `requireNotRestricted` →
  body → `ensureMember` → club room → `roomOf` → **the message on the cookie
  client scoped to `[id]` with `removed_at` checked** (`:97-116`) → the block set →
  the RPC (which re-checks `can_view_org_channel(channel, p_user)` and
  `removed_at`) → `hydrateCards` with the viewer's set. A poll in a room the viewer
  left, in the Officers room, or of another poll's option: 404 / P0C24, never a hint.
- `DELETE …/messages/[messageId]`: the sender's path unchanged; `ensureMember`
  (`channels_select_org_member` = `can_view_org_channel`) refuses every room the
  caller cannot view with 403 before step 7, so the step-7 service read only ever
  tells "removed already" for a room the caller views (a boolean about a uuid they
  hold; the B3 review's hold stands); the update is scoped `channel_id` +
  `removed_at is null`; the report check fails closed (`:165-170`); the caller's
  rank fails closed (`:118`). The gates' order (the two reads before the bucket,
  N19) costs one cookie read and one RPC per stranger's call and answers 403 for a
  missing and an unviewable channel alike: no enumeration.
- `GET /api/me/inbox`: the cookie client for rooms, refs, roles, the block set,
  previews (`users!messages_user_id_fkey(name)`, RLS decides the name), event
  activity; the service role for two head counts per club, the events of the
  viewer's own clubs, and ONE `org_members` read scoped to the blocked authors met
  in the viewer's own Board windows (what it reveals — "this blocked author is a
  current officer" — is the exception itself). `serviceOrNull()` failing leaves the
  officer exception OFF (rows hidden): fail closed.
- `GET /api/orgs/[slug]/space`: the channels list's sweep copied (`orgs` by
  handle + `org_members.role` with the service role; hidden club → 404 to
  outsiders, a visible club → 403 `members_only`; the rooms on the cookie client so
  Officers and event rooms stay behind `can_view_org_channel`); `board_latest`
  through `readChatMessages` on the cookie client with the block set read inside;
  `member_count` and the events are the club's own, to a proven member.
- `GET /api/me/calendar`: `org_id` is a plain column of an `events!inner` embed
  the cookie client already reads; `room_id` only when the viewer holds a row or
  is an officer (`event-refs.ts:210-212`); flag off → the three fields null (row 6).
- `GET …/messages`: `invalid_after` never reaches the database; the block set is
  read once and handed to the page and to `describeRoom`.
- Rate-limit keys: `message-send:<uid>` (shared with the send, so a card costs a
  send), `card-vote:<uid>` 120/10 min, `message-remove:<uid>` 30/10 min,
  `report:<uid>` unchanged. All keyed on `user.id` from auth.

**Service-role reads and where their rows go.** `hydrateCards` is called only
with rows from a viewer-scoped read (`buildChatMessages` `:625-627`, the vote
route `:141`), never with a removed row (B2-SECURITY-2 fixed: `!row.removed_at`),
never when the block set is unknown (`blocksRead`); its voters come back through
the cookie `users` read (a restricted account is not named) and the blocked ones
are dropped before naming. `snapshotCard` selects `option_id` only from the votes
(no `user_id`), runs after `readTarget` proved the reporter reads the message, and
its answer goes to the report row, never to the reporter. `eventRefsFor` reads
`rsvps` for counts and the viewer's own status only; `channels` / `channel_members`
for the viewer's own row. `clubRole` and `chatV2For` read one `org_members` row
about the caller (or the author, INT-SECURITY-2). `readReplyCounts` counts, with
`p_viewer` for the viewer's own removed replies.

**Migration B.** The four tables: RLS on, no policy, `revoke all` from the three
roles, CRUD to `service_role` only, and the POST-CHECK refuses if `anon` /
`authenticated` hold any privilege (`:939-947`) — nothing reachable over
PostgREST. The four callable functions: `security definer`, `set search_path to
''`, every name qualified, and `if current_setting('role', true) in ('anon',
'authenticated') then raise … 42501` as the first statement (`:659, :734, :784,
:847`) — the grant to the client roles exists only so a call is a 403, not a crash
(the standing-rule query, asis 4.6); the behaviour probe runs the 42501 rows "as
authenticated with a student's claims" (`:1260`) on the Mac, where it can be
proved. The writers re-check the room rule with `can_post_org_channel(p_channel,
p_user, null)` (the second wall the route cannot bypass), the event's club and
end (`P0C23`), the shape (`P0C22`), and insert with `thread_root_id` null (a card is
never a reply). `chat_cast_vote` locks the poll row `for update`, re-checks
`removed_at` and `can_view_org_channel` for `p_user`, and answers P0C24 for
missing, removed, unviewable and another poll's option alike. The trigger:
`security definer`, `set search_path to ''`, its whole body inside `begin …
exception when others then raise warning … end` — it cannot raise into
`org_members_drop_club_access` or a leave; officers keep their votes only while
their `org_members` row still says so (a leave deletes that row first).

**The report snapshot.** `MESSAGE_SNAPSHOT_COLUMNS` adds `kind, thread_root_id`
on the reporter's own client; the missing-schema retry uses today's six columns;
`card` is added after `alreadyOpen` (a duplicate never pays the side-table reads)
and after the ownership refusal. A stub's message can be reported by id (8.4,
accepted; the answer is `{ ok: true }` either way).

**The screens.** No `dangerouslySetInnerHTML` / `innerHTML` in any new file (the
one in `layout.tsx:94` is the pre-existing theme boot script; the fonts line is the
only change there). No `localStorage` / `sessionStorage` / IndexedDB in any new file
(`CampusMobile.tsx:1155` is the pre-existing tour key). Every id and handle in a
URL goes through `encodeURIComponent` (the grep over `home/`, `club/`, `compose/`,
`cards/`, the hooks and `MessagesMobile.tsx`: 30 sites, none bare); `?after=` and
`?before=` go through `URLSearchParams` (`use-room-poll.ts:145`); history state
carries ids only. `avatar_url` / `logo_url` inside inline `url(…)` backgrounds:
`avatar_url` is validated to the viewer's own storage path on write
(`profile/route.ts:84-95, :333-337`), `logo_url` / `banner_url` are proxied
(`orgAssetProxyUrl`), and a CSSOM shorthand assignment cannot smuggle a second
declaration. Logs: `use-chat-v2.ts:45` warns once with the features body (flags,
no PII); no `console.*` in any S2 / S3 file; the routes log `code` and `message`,
never a row or a query (`errorSummary` in `flag-server.ts`, `rooms.ts`). The
Report / Remove pickers exist on every Lounge / event-chat row and on cards
(INT-SECURITY-1 for the Board's text rows). `canRemove` excludes stubs
(`m.user_id !== ""`). The RSVP sheet and the event card call the existing
`/api/events/[id]/rsvp` only.

**Compatibility (12.9).** Read for the field reads: `ConversationView.tsx` reads
`hidden` (`:548`) and nothing of `card` / `author_role` / `reply_count`;
`MessageBubble.tsx` reads none of the four; `campus-home.tsx` `ChannelChat` reads
`hidden` in its filter only; the two static files copy `hidden` and skip it. No
old renderer dereferences `card`.

**Ownership rows to ratify (13.2), as the batches disclosed:** `src/lib/chat/reads.ts`
+ its two tests → W2-B4; `cards/_lib/rpc-refusal.ts` → W2-B2; `visual/**` → the
visual pass. None collides.

## Note for section 17 ("What the Mac must look at first")

- INT-SECURITY-1 before the browser walk: long-press a text Board post as blake
  (Report) and as avery (Remove), then a reply.
- The 42501 rows of migration B's behaviour probe (3.8) are the proof of the
  role guard under a client JWT; the cloud read them, it could not run them.
- The Block walk of 13.3 step 4 (flag OFF, blake ↔ casey) is the App Store
  gate: the seven rows of the table above, in that order, then the flag-ON walk
  once with casey as an admin of the club to see the officer exception with
  their own eyes (open point 14.1).
- The branch carries ~40 MB of screenshots (`visual/`, `run2/`, `run2/clip`,
  `repair-S3`); `run2/` is the final state. Franky may squash the visual commits
  before the merge if he wants the repo light.
