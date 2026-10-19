# Map: "Your clubs" with the latest Board post (lens notes, Oct 19)

Read-only lens. Notes written in chunks as I go.

## 1. Existing endpoint for FOLLOWED clubs' Board previews

- `src/app/api/me/club-boards/route.ts` (GET, 214 lines) = the Boards I read as a FOLLOWER who is NOT a member.
  - L94-99 my follows (`org_followers`, user client, user_id filter required, newest 50 = FOLLOWS_MAX L28).
  - L115-123 memberships (user client), Boards `channels kind='board'` (user client: RLS `channels_select_org_member` = `can_view_org_channel` decides), orgs via SERVICE role (`orgs_select` hides SAE from non-member followers), `hidden_at is null`.
  - L151 listed = followed AND not member AND org visible AND Board readable.
  - L179-213 `withPreviews`: service-role read of newest 5 top-level live rows per Board via `readLatestPerRoom` (`chat_latest_per_channel` RPC), kept only if posted by a CURRENT owner/admin (`isFollowerBoardPost`, `boardPostersOf`). `author_name` forced "".
  - Gated by `chatV2For(user.id)` (L88) -> 404 when chat v2 flag off. No limiter (L71-73: deliberate, a read; bounded instead).
  - Response type `FollowedBoardsResponse` in src/lib/chat/types.ts, ordered by `orderFollowedBoards` (src/lib/chat/reads.ts).
  - NO unread signal in this response (only `latest`).

## 2. Existing endpoint for MEMBER clubs (with unread)

- `src/app/api/me/inbox/route.ts` (GET, 344 lines) = Messages home club list, one `InboxClub` per club where I hold a Board AND a Lounge `channel_members` row (`groupClubRooms`, src/lib/chat/reads.ts:121).
  - L87-96 my `channel_members` rows + `channels!inner(id, org_id, kind, name)` (cookie client).
  - L121-124 orgs + my roles (cookie client; orgs_select works for members).
  - L148 block set; L168-192 Board AND Lounge previews (cookie client, `chat_latest_per_channel` RPC via `readLatestPerRoom`, per 5, with author name embed `users!messages_user_id_fkey(name)`).
  - L196-219 officer exception for blocked authors (service role `org_members`).
  - L233-251 unread COUNT per room via service role, head:true count, `gt(created_at, last_read_at)`. Board -> `unread: boolean` (L322), Lounge -> `unread_count` cap 99 (L323).
  - L253-269 next events (service), L276-302 event room activity (cookie).
  - => Heavy: per club 2 count queries + 2 preview RPCs + events + event refs. Fine for Messages home, overkill for a feed side panel but REUSABLE as-is.
  - `InboxClub.board = { room_id, latest: Preview|null, unread: boolean }` (src/lib/chat/types.ts:457-476). `Preview = { id, text, author_name, created_at, kind }` (types.ts:448-454). `kind` = text | poll | event_card (reads.ts:41).
  - Gated by `chatV2For` (L81); chat v2 is `*` since Oct 5, so effectively on for everyone.
- Client combo already exists: `useHomeData` in `src/components/mobile/messages/home/MessagesHome.tsx:91-190` reads `/api/me/inbox` + `/api/me/club-boards` (L145-155) on a 30 s visible timer. Members' clubs = inbox; followed-not-member = club-boards (`FollowedBoardsRow.tsx`, "Boards you follow").
- Desktop `src/components/desktop/messages/MiniMessenger.tsx:37` also reads `/api/me/inbox`.

## 3. Club mark (colour / initials) — TWO systems exist

- Feed page system (campus-home only, NOT exported): `ORG_PALETTE` 8 solid hexes `src/app/campus/campus-home.tsx:267-276`, `colorForOrg(id)` (31-multiplier hash) `:278-282`, `initialsForOrg(name)` `:285-293`.
  - Feed post card org avatar: `:8006` `avatarUrl = post.org?.logo_url`, else `linear-gradient(135deg, hexToRgba(colorForOrg(id),0.95) 0%, hexToRgba(colorForOrg(id),0.6) 100%)`, 40px, radius 12 (org) / 999 (person), Fraunces 800 13px, white `:8553-8571`. Initials computed inline `:8018-8024` (same rule as initialsForOrg).
  - Also used at `:10589` (event card accent), `:13014`, `:13688`, `:15497`, `:15946` (ServerPill rail), `:16500`.
- Chat v2 system (Messages home, club space): `src/components/mobile/messages/avatar.ts:19-24` `CLUB_GRADIENTS` (4 gradients, 145deg: #C23A72/#962858, #1F7580/#155158, #337A5A/#245942, #8A6A22/#664C14), `clubGradient(id)` FNV-1a `:49-51`; `initialsOf` `src/components/mobile/messages/format.ts:18-26`; `ClubMark({org,size})` round, logo or initials, `src/components/mobile/messages/club/FollowerBoard.tsx:114-123` (exported).
- The C2 mockup's "Your clubs" marks are the chat v2 gradients (at 135deg) on a 36px, radius-10 tile, Fraunces 800 12px, white (`handoffs/2026-10-18-side-space/project/C2_Desk.dc.html:187`, data `:450-454`). The SAME mockup draws the feed post's Salsa mark with that gradient too (`:235`), but the LIVE feed uses colorForOrg. => CALL: on the feed page use the feed's own `colorForOrg` + logo (matches the post cards beside it) OR `clubGradient` (matches Messages). Recommend: logo_url first, else feed's `colorForOrg` gradient (same club = same colour on one page). Either way the same club gets a different colour on Feed vs Messages today (pre-existing inconsistency).
- Mockup row anatomy (C2_Desk.dc.html:179-197): eyebrow "Your clubs" + "See all" link, subline "Latest on each club’s Board"; row = mark, name (Fraunces 800 14px, ellipsis) + age ("3h", "20m"), Board line clamped (12.5px); footer "Find clubs on campus". aria-label `"<name>, on the Board <3 hours ago>: <text>"` (:454). NO unread dot drawn in the mockup.
- Fold (<1400px): `.cbs-fold` strip of 32px tiles inside the right column (`:307-316`), title "Your clubs" linking out; CSS `:46`, `:60-64`, `:78` (<1100 hide).

## 4. Unread signal, age text, open target

- MEMBERS: server-side `InboxClub.board.unread` (boolean) from `/api/me/inbox` (route.ts:233-251, :322) = any top-level live post by someone else newer than my Board `channel_members.last_read_at` (null -> row created_at, `readSince` reads.ts:76), blocked authors left out except current owner/admin.
- FOLLOWERS: no server read mark (no `channel_members` row). Browser-only mark already exists: `src/components/mobile/messages/home/board-seen.ts` (localStorage `vibe.followed-board-seen.v1`, `useBoardSeen()` :60, `markBoardSeen(roomId, at)` :36, fails to "seen nothing"), decided by `boardHasNew(latestAt, seenAt)` `src/components/mobile/messages/club/helpers.ts:100-105`. Same origin as /campus, so the feed panel can reuse it as-is. Used by `FollowedBoardsRow.tsx:36-45,63,85` (coral 9px dot `var(--coral)`).
- Empty Board copy: `ORG_COPY.board.followedEmpty` (src/lib/orgs/join-copy.ts), used FollowedBoardsRow.tsx:83. Spoken label helper `followedBoardLabel` helpers.ts:108-119.
- Age: the mockup's "3h / 20m" = campus-home's own `relativeTime(iso)` `src/app/campus/campus-home.tsx:6995-7013` (s/m/h/d/w then "Oct 5"). Chat's `rowTime` (src/lib/chat/when.ts:138) gives clock times ("8:44 PM"), not ages.
- Open target: `/messages?channel=<board room_id>` opens the Board for members AND followers (FollowedBoard doc, types.ts:494-495; deep link MessagesMobile.tsx:152, :720; desktop `desktop-rules.ts:336`). The Otto panel's mini frame has a FIXED src `/messages?mini=1` (MiniMessenger.tsx:27, :106-148): no API to open it on a channel today (would need `src` with `&channel=`; MessagesSwitch.tsx:58-68 handles mini + channel). Simplest v1: a plain link to `/messages?channel=<id>`; for followers call `markBoardSeen(room_id, latest.created_at)` on click.
- Feed page already polls `/api/me/inbox` (+ `/api/me/threads?scope=chats`) every 30 s while the Otto panel is closed: `useMiniMessages(!open)` in `src/components/network/OttoCorner.tsx:59` -> `readUnread()` MiniMessenger.tsx:32-45. So adding another inbox read in the panel DOUBLES that load unless shared.
- campus-home already holds member clubs from `/api/orgs?filter=mine` (campus-home.tsx:711-730, state `orgs`), no previews.

## 5. How the app knows the viewer's clubs (org model v2)

- Membership: `org_members` (my rows; cookie client can read own rows, inbox route.ts:123; service read in `/api/me/clubs` route.ts:84-88). Members also hold `channel_members` rows on their club's Board + Lounge (inbox's source, route.ts:87-96; `groupClubRooms` reads.ts:121 drops a club missing either).
- Following: `org_followers` (my rows; the `.eq("user_id", me)` is MANDATORY because `org_followers_select` also returns an officer's club followers: club-boards route.ts:92-99, /api/me/clubs doc). Members carry a join-made follow too (can't unfollow), so follow lists include member clubs; club-boards drops them (route.ts:151).
- Board readability for a follower is decided ONLY by RLS on `channels` (`channels_select_org_member` = `can_view_org_channel`): verified school email, club not hidden, `orgs.followers_read_board` on, no `org_board_bars` row, no block pair (migration `supabase/migrations/20261017110000_board_follower_read.sql:23-28,62-72`). Never re-code it: read `channels kind='board'` on the VIEWER's client.
- Message rows: `messages_select_org_member` is members-only, so a follower's preview MUST be read with the service role and filtered to current owner/admin top-level live posts (`boardPostersOf` + `isFollowerBoardPost`, `src/lib/chat/follower-board.ts:35-72`). No author name leaves the server for followers.
- Org refs: `orgs_select` hides an invite-only club (SAE) from a non-member follower, so club refs for followers are service reads with `hidden_at is null` (club-boards :118-122). Members can see their own hidden (test) clubs (inbox reads orgs on the cookie client, no hidden filter: founders will see test clubs, same as Messages).
- Other lists (no previews): `/api/orgs?filter=mine` (members, used by campus-home :715), `/api/me/clubs` (member_of + following, own profile, inline limiter 60/60s :22,:79), `/api/me/followed-orgs` (paged follows, inline limiter :29,:73).
- Card/poll posts store readable text in `messages.content` ("Poll: <q>", "Event: <title> · <when>", `src/lib/chat/cards/fallback.ts:1-14`), so `latest.text` prints as-is. A photo-only post has blank text and shows "Nothing on the Board yet" (`ORG_COPY.board.followedEmpty`, join-copy.ts:266) on Messages today: pre-existing wording gap.

## 6. Recommendation

### v1 (no new route, no DB change, no new budget): reuse the two reads Messages already uses
- Client: `Promise.all([GET /api/me/inbox, GET /api/me/club-boards])`, exactly like `useHomeData` (MessagesHome.tsx:145-155). Merge:
  - member rows from `inbox.clubs[]`: `{ org, room_id: board.room_id, latest: board.latest, unread: board.unread }`
  - follower rows from `club-boards.boards[]`: `{ org, room_id, latest, unread: boardHasNew(latest?.created_at, useBoardSeen()[room_id]) }`
  - order: newest `latest.created_at` first, nulls last, then name (`orderFollowedBoards` rule, reads.ts:351). Show ~3-5, "See all" -> `/messages`.
  - click -> `/messages?channel=<room_id>`; for follower rows `markBoardSeen(room_id, latest.created_at)` first.
  - 404 (chat flag off) or failure on either -> panel draws what answered; both fail -> hide the panel quietly (the feed must not show an error box for a side panel).
- Cost: inbox is heavy (Lounge previews, 2 head-counts per club, events, event refs) and the feed page ALREADY polls it every 30 s via OttoCorner's badge (`useMiniMessages`, MiniMessenger.tsx:32-45). Read on mount + on return to visible (>= 60 s apart), no 30 s timer; or dedupe with the badge's read via a small shared module cache.

### v2 / cheaper single call (only if a new route is wanted): `GET /api/me/club-board-latest`
Shape:
```ts
type YourClub = {
  org: OrgRef;                 // proxied logo/banner, like both routes
  room_id: string;             // the Board
  role: "member" | "follower"; // NOT the club role
  latest: { id: string; text: string; created_at: string; kind: MessageKind } | null; // no author
  unread: boolean | null;      // members: server; followers: null (client uses board-seen)
};
type YourClubsResponse = { ok: true; clubs: YourClub[] }; // newest latest first, nulls last, then name
```
Query plan (constant ~6 round trips, independent of club count):
1. cookie `auth.getUser()`; `chatV2For` -> 404 like siblings.
2. parallel, cookie client: (a) `channel_members.select("channel_id, created_at, last_read_at, channels!inner(id, org_id, kind)").eq("user_id", me).eq("channels.kind","board").not("channels.org_id","is",null)` = my member Boards + read marks; (b) `org_followers.select("org_id, created_at").eq("user_id", me).order(created_at desc).limit(50)`.
3. cookie client: `channels.select("id, org_id").in("org_id", followOnlyIds).eq("kind","board")` (RLS = can_view_org_channel decides followers). (Also cookie `org_members.eq(user_id).in(org_id, followIds)` to drop member clubs exactly as club-boards :116, if membership is taken from org_members.)
4. service: `orgs.select("id, handle, name, logo_url, banner_url, verified, hidden_at").in("id", allIds)`; drop `hidden_at` for follower rows (members keep theirs, matching inbox).
5. service: `boardPostersOf(service, allOrgIds, TAG)` (one `org_members` read, role in owner/admin).
6. service: `readLatestPerRoom(service, { ids: allBoardIds, per: 5, topLevelOnly: true, liveOnly: true, select: "id, channel_id, content, created_at, user_id, kind, thread_root_id", tag, fallbackOnAnyError: true }, sharedWindow)`; keep rows passing `isFollowerBoardPost`; `latestShownPerRoom` -> latest; strip `user_id` before answering.
- Members' unread WITHOUT a count query: `unread = keptRows(board).some(r => r.user_id !== me && Date.parse(r.created_at) > Date.parse(readSince(memberRow)))`. Exact for Boards (only owners/admins can post now); differs from Messages only for a post by a since-demoted officer. Officer posts show through blocks (officer exception), so no block read is needed.
- Same officer-only preview rule for members and followers means one service read and no author names anywhere; the trade-off is a member never previews a legacy non-officer Board row (Messages would).

### Rate limit (flag for the orchestrator)
- The two sibling reads deliberately have NO limiter: club-boards route.ts:71-73 ("a per-account count of opening Messages would be a record of when someone is on Vibe"), inbox has none, budgets.ts header lines 10-14 (views/typing/read marks/check-in have no budget on purpose, Privacy Policy 3d). The S78 handoff (`handoffs/2026-10-16-session-78-rate-limits-follow-wording.md:110-111`) says the same. A feed-load read with a per-account key would be that presence record. => The brief's "every new API route needs a budget" conflicts with this rule for a READ. v1 (reuse) sidesteps it. If v2 is built, either follow the club-boards precedent (no limiter, bounded reads: FOLLOWS_MAX 50) and say so in the route doc, or ask Franky. If a budget is forced, it goes in `src/lib/limits/budgets.ts` (never inline: S78 handoff :108).

### Mark for the panel
- Recommend `logo_url` first, else the feed's own `colorForOrg` gradient + `initialsForOrg` (campus-home.tsx:278-293, as the post card :8553-8571), 36px radius 10, Fraunces 800 12px white: the same club then matches its post cards on the same page. Mockup's literal colours are the chat `clubGradient` set (avatar.ts:19-24); using `clubGradient` matches Messages instead. Franky's call if exact mockup colours matter.
