# B4 review — lens: EDGES AND FALLBACKS (read-only reviewer)

Reviewer notes, written as I go. Files judged: messages/route.ts, lib/chat/message-read.ts, me/threads/route.ts,
threads/[id]/members/[userId]/route.ts, threads/[id]/decline/route.ts, me/messages-upload-url/route.ts.

## Log

- read contract 0, 1, 2, 3.10, 6.0-6.7, 14, 15, 16 and the builder's notes (B4-notes.md).
- second run: re-read contract 0/1/3.10/6/14/15/16, B4-notes.md, message-read.ts (858 lines), messages/route.ts (595), rooms.ts, ensureMember, the committed route (HEAD) for the before-count.

## Findings (written as found)

F1 (low) ?after= that has the shape but not a real time reaches the database and answers 500.
  GET /api/me/threads/d3c31eb8-.../messages?after=2026-13-45T25:61:08%2B00:00 as blake -> 500 {"ok":false,"error":"Request failed"}
  (no zone -> 400 "Invalid after", date only -> 400, as built). message-read.ts:296-312 cleanAfterParam checks the shape only;
  route.ts:109-118 says "Anything else never reaches the database". Change: in cleanAfterParam, after the regex match, also
  require Number.isFinite(Date.parse(<the cleaned string>)) and answer null otherwise (the string itself still goes out unchanged).

F2 (medium) Polling cost of a club-room thread GET doubles (Lounge/Board) and roughly quadruples (event chat); every 2 s poll
  re-reads the room description. Counted from the Kong log of one GET each (auth/v1/user not counted):
    dm (blake, c1fd3fec)              before 5-6 PostgREST calls, after 5-6 (unchanged: channels, channel_members, messages,
                                      reactions, [parents], channel_members peers)
    Lounge/Board (emery, d3c31eb8)    before 3-4 (channels, rpc can_view, messages, reactions, [parents])
                                      after 10-11: + channels (loadRoom), org_members role (clubRole), orgs (readOrgRef),
                                      rpc can_post_org_channel, org_members authors, messages id,thread_root_id (reply counts, Board)
    event chat (casey, bed10830)      after 17-18: + events (loadRoom), events location, rsvps going page, HEAD going,
                                      HEAD maybe, rsvps own, channel_members (readGoing), users (going people)
  Old screens poll this GET every 2 s (public/html/_miniMessenger.js:306 CHAT_POLL_MS 2000, messages.html:1790 POLL_MS 2000,
  campus-home.tsx:16003 setInterval(fetchOnce, 2000)), so an open event chat is ~9 PostgREST calls/s per viewer (was ~2).
  Changes inside B4's files that keep the contract's payload:
   (a) message-read.ts readRoomEvent/readGoing: replace the two HEAD counts, the own-RSVP read and the going page with ONE
       service read `rsvps?select=user_id,status,created_at&event_id=eq.X&status=in.(going,maybe)&order=created_at.asc,id.asc`
       (limit ~500): going_count / maybe_count / viewer_status / the ordered going ids all come from it (4 calls -> 1);
   (b) readThreadRoom's clubRole(org, viewer) and toChatMessages' readAuthorRoles(org, authors) read the same org_members rows:
       add the viewer to the authors' read and take the viewer's role from it (1 call less on every club-room poll);
   (c) say in the notes / wave-2 contract that the pinned "every 5th poll" re-read is where a cheaper room description belongs.

F3 (low) reply_count is not "one grouped count": message-read.ts:341-371 downloads every live reply row of the page's posts
  (`select id, thread_root_id ... range 0..999`, up to 5 pages per 100 posts) on every Board poll, and stops at 5,000 rows per
  100 posts without saying so: past that the counts are silently low, although the comment at 339 promises "never a wrong 0".
  PostgREST aggregates are off here (authenticator rolconfig has no pgrst.db_aggregates_enabled), so a real grouped count needs
  SQL (an RPC in migration B). Change now: when the last allowed page is full, return null (the "could not be read" answer)
  instead of the partial map; and ask for the grouped-count RPC in the wave-2 migration.

F4 (low) `before` changes meaning when `root` or `after` is also sent. message-read.ts:603 sets oldestFirst for after/root, so
  `before` then gives the OLDEST rows older than T, not the page right before T (what `before` means everywhere else).
  GET .../d3c31eb8/messages?root=ef155ab8-...&before=2026-09-29T23:02:39.629484%2B00:00&limit=1 as blake -> 1d1e30c0 (the first
  reply, 22:56:21.509) instead of ea0f1139 (22:56:21.664, the one right before T). Without root, before+limit=1 -> 2e5ebf8b, the
  newest before T (correct). Change: `const oldestFirst = (Boolean(opts.after) || root !== undefined) && !opts.before;`
  (a `before` page is always the newest rows before T, reversed to oldest first), or answer 400 when `before` is sent with
  `after` or `root`. No wave-1 screen sends the pair; the card routes and wave-2 screens will call readChatMessages.
  F2 correction after recounting: club room BEFORE = 4-5 (channels, rpc can_view, messages, reactions, [parents]);
  AFTER Lounge 9-10, Board 10-11 (measured 10 as emery), event chat 17-18 (measured 17 as casey); dm 5-6 before and after.

F5 (low) readChatMessages trusts its options: message-read.ts:579-612 sends opts.limit, opts.after and opts.before to the
  database as given. The route clamps limit (route.ts:105-107) and cleans after (route.ts:111-118), but the contract names
  readChatMessages as the shared read the wave-2 card routes will call, and 6.1 says "same limit clamp". Change: inside
  readChatMessages, clamp `limit` to 1..200 (non-finite -> 50, or 200 with root) and run `after` through cleanAfterParam
  (null -> ReadFailure 400 "Invalid after"), so a second caller cannot skip either.

F6 (low) rootIsThere compares ids as strings: message-read.ts:565 `row.channel_id === channelId`. The channel id comes from
  the URL as typed; the database sends lower case. GET /api/me/threads/D3C31EB8-01AF-4654-9B47-034DDAEA8B3F/messages?root=
  ef155ab8-... as blake -> 404 board_post_missing, while the lower-case path -> 200 with the 3 replies (ensureMember and every
  other filter accept the upper-case id, since Postgres compares uuids). Change: compare `row.channel_id.toLowerCase() ===
  channelId.toLowerCase()`.
  F3 addendum: the "page full" test (rows.length < 1000) also assumes PostgREST max_rows >= 1000 (supabase/config.toml:18 is
  1000 locally); a lower production max_rows would stop after page 1 and undercount the same silent way.

## Checked, nothing to report under this lens
- 3.10 fallbacks: every new column/function B4 touches has one (MESSAGE_SELECT -> MESSAGE_SELECT_BEFORE_ROOMS, identical to the
  committed select; the top-level filter dropped with it; ?root -> 404; insert -> 503 for a reply, whole-row resend otherwise;
  thread list kind + thread_root_id retries; readChatMessage retry). Bare retries keep the thread_root_id filter.
- ?after exact echo: %2B, bare "+" (restored), Z form all 200 with gte (the post AT the time is included); no zone / date only 400.
- ?root: removed / reply / other room / Lounge / dm / "abc" -> 404 (builder + code); limit 0 -> 1, abc -> default, >200 -> 200.
- dm GET/POST query count and JSON unchanged; ?scope=chats keeps requests (casey: 1 request, 0 threads).
- eslint on the six files exit 0.
- Test writes by this reviewer: none (reads only).
