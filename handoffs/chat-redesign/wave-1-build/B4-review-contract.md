# B4 review — lens: PAYLOADS (contract 6.0 to 6.7, types.ts)

Reviewer, read-only. Files judged: messages/route.ts, lib/chat/message-read.ts, me/threads/route.ts,
threads/[id]/members/[userId]/route.ts, threads/[id]/decline/route.ts, me/messages-upload-url/route.ts.

## Log

- read contract 0, 1, 3.10, 6.0-6.7, 14, 15, 16; types.ts; rooms.ts; room-rules.ts; channel-access.ts; the six files; B4-notes.md.
- second run (resumed): re-read contract 0, 3.10, 6.x, 14-16, types.ts, B4-notes.md, message-read.ts. Next: the route files, then HTTP.
- read the six files and their diffs against HEAD, rooms.ts, room-rules.ts. Next: HTTP payloads as the seed accounts.
- HTTP GET shape check (scratchpad b4rev/check.mjs: exact key sets vs types.ts, no removed_/card_event_id/channel_id keys, order, card null, hidden false):
  avery/blake/casey/emery x Board, Lounge, Officers, Game Night, Closed Night, Cookout + DM c1fd3fec as blake and avery: every 200 answer SHAPE OK.
  403s where expected (blake/casey Officers, blake/casey Cookout, casey Closed). ?root, ?after (encoded and bare +), after+root: SHAPE OK; bad after 400, bad root 404.
- Next: POST answers (a few w1rev writes), the thread list, leave/decline/upload.
- POST answers (writes: fe6edfef emery Board post "w1test B4rev ...", cd2c0a22 blake reply under it, 20719f2a blake DM): ChatMessage shape exact; Board post reply_count 0,
  reply reply_count null + parent_message_id dropped, DM author_role/reply_count null. Refusals: board_officers_only 403, thread_root_not_allowed 400, room_closed 403,
  club_media_off 400, board_post_missing 409, all with the 6.0 sentences.
- Thread list for 5 accounts, both scopes: names "<club> · <Board|Lounge|room name>", no event rooms, org/room_kind/can_post on every club entry, OrgRef keys exact,
  scope=chats dms only, casey's request kept. Leave/decline club_room 400; upload 503 (storage check first; orchestrator decision, not a finding).
- Next: policies behind readOrgRef / going people for non-officer members of hidden clubs; failure paths.
- eslint on the six files exit 0. Policies read: orgs (members read hidden clubs), users (user_visible), rsvps (own or manager), messages (own removed visible), can_view_org_channel.
- Candidate findings so far (all low/medium, failure paths): rootIsThere failure -> 404; author_role null on a failed read; viewer.role null on a failed clubRole;
  reply_count vs ?root for an own removed reply; going < 8 when a person is unreadable; reply-count cap silently short. Verifying each next.

## Findings (payload lens; every 200 body matched types.ts exactly, so these are all failure-path or consistency items)

P1 (low) A failed read of the ?root= post answers 404 board_post_missing ("That post is no longer there."), not 503 try_again.
  message-read.ts:553-566 rootIsThere: `if (error) { ...log; return false; }` -> readChatMessages:600 postMissing(). Section 16.2's rule
  (a failed read is 503 try_again, never an answer about the data) is applied everywhere else in the read (readThreadRoom null -> 503).
  A wave-2 screen that drops a thread on board_post_missing would drop a live post on a transient failure.
  Change: rootIsThere returns "yes" | "no" | "failed"; on an error that is not isMissingChatSchema return "failed", and readChatMessages
  answers tryAgain() for "failed" (missing schema stays 404, as built).

P2 (low) A failed author-role read sends author_role null on every message, which 6.1 defines as "no longer a member".
  message-read.ts:324-328 readAuthorRoles `if (error) { log; continue; }` and :479 `roles ? (roles.get(...) ?? null) : null`.
  The room read otherwise refuses to send "a room with holes in it" (readThreadRoom doc, :828-830). Change: readAuthorRoles returns null
  when any chunk fails; toChatMessages reports it (e.g. returns { messages, complete: false } or takes an onIncomplete callback);
  readChatMessages answers tryAgain() for a club room when it is incomplete. The send (POST answer, row already stored) keeps null, as now.

P3 (low) viewer.role can be null in a club room: readThreadRoom (message-read.ts:842-857) takes clubRole's null as is, but clubRole
  (rooms.ts) answers null on a failed read, and every viewer of a club room is a club member (can_view_org_channel starts with
  `WHEN NOT is_org_member(...) THEN false`). Result on a failed read: { role: null, can_post: true, can_reply: .., can_moderate: false },
  a shape 6.0 reserves for dm / group. Change: in readThreadRoom, `if (role === null) return null;` (the route answers 503 try_again).

P4 (low) reply_count and the ?root= list disagree for the author of a removed reply. readReplyCounts counts with the service role and
  `.is("removed_at", null)` (message-read.ts:351-358), while ?root= reads on the viewer's client, where RLS (messages_select_org_member:
  `removed_at IS NULL OR user_id = auth.uid()`) still returns the viewer's own removed reply, sent with `removed`.
  Evidence: the builder's own run (B4-notes.md, "removed" bullet): after blake's reply 1d1e30c0 was removed, blake's ?root read showed it
  (with removed {...}) and the post's reply_count went 2 -> 1, so blake saw "1 reply" over two rows. Change: count what the viewer can
  open: `.or(\`removed_at.is.null,user_id.eq.${viewerId}\`)` in place of `.is("removed_at", null)` (pass viewerId in from toChatMessages).

P5 (low) room.event.going can hold fewer than 8 people while more members are going. readGoing (message-read.ts:728-777) picks the first 8
  room members by RSVP time with the service role, THEN reads them on the viewer's client (users_select_authenticated -> user_visible hides
  anyone with a live account_restrictions row) and drops the unreadable ones without looking further. Change: read the users inside the
  loop (per step, on the viewer's client) and fill `first` only with people who come back, so the 8 are the first 8 the viewer can see.

P6 (low) GET /api/me/threads: a failed orgs or org_members read is served as data. route.ts:512-513 only log; then :777 leaves the club rooms
  with the raw names "board" / "lounge" and no org / room_kind / can_post (the shape 3.10 reserves for a database WITHOUT the schema), and a
  failed roles read alone makes :785 send can_post false on the Board to its owner and admins, so the share pickers (contract 10.4) drop the
  Board for the officers. The same route already fails closed on its other reads (:589 others, :702 hidden users -> 500 "Request failed").
  Change: when orgsRes.error or rolesRes.error, answer 500 { ok: false, error: "Request failed" } like :589 and :702.

## Checked and not reported (orchestrator decisions or contract text)
- upload url answers 503 "Media storage not configured" before the club_media_off guard (decision: move the guard; repair).
- RLS refusal after a yes still 500 (decision: ask canPostAnswer again; repair). "Invalid after" 400 without code; ?root default 200.
- going_count / maybe_count count every RSVP (service role) while going lists room members only: as 6.1 writes it.
- list entries: accepted_at stays null on a club room whose is_request is false; the screens read is_request only (grep), so harmless.

## Writes made by this review (local, over HTTP)
- fe6edfef (emery, Board post "w1test B4rev Board post by emery"), cd2c0a22 (blake, reply under it, parent_message_id sent and dropped),
  20719f2a (blake, DM c1fd3fec "w1test B4rev DM from blake").

## Gates seen
- npm run typecheck exit 0; npx eslint on the six files exit 0 (npm test not rerun; builder's run 1374 pass).

DONE: 6 findings, all low (P1-P6).
