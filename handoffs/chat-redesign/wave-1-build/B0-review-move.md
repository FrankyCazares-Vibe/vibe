# B0 review: behaviour preservation of the move (reviewer notes, S69)

Read-only review. Running log, newest at the bottom.

- Ran `git diff` on `src/app/api/me/threads/[id]/messages/route.ts` and `src/lib/messages/channel-access.ts`.
- Moved block check: extracted HEAD route lines 43-201 (MESSAGE_SELECT .. prepareForClient) and compared with
  `src/lib/chat/message-read.ts` from `export const MESSAGE_SELECT` down, with the leading `export ` stripped.
  Result: identical, the only difference is the one trailing blank line. Same select string, same parent-preview
  select, same reactions select, same fallbacks, same defaults in prepareForClient.
- Rest of the route: HEAD route with the moved block cut out vs the working-tree route differ ONLY in the import
  block (new import from `@/lib/chat/message-read`; `messageMediaProxyUrl`, the reaction-emoji import and
  `postMediaProxyUrl` dropped; `ensureMember, isChannelMessageMediaKey` collapsed to one line). No handler line changed.
- channel-access.ts: diff is one `import type { RoomKind }` line plus the two optional fields with doc comments.
  No behaviour line changed. `git diff --check` clean.
- Route call sites unchanged: GET runQuery(MESSAGE_SELECT) + same fallback select; hydrateReactions(supabase, rows, user.id),
  hydrateParentPreviews(supabase, rows), prepareForClient(rows, channelId); POST insert .select(MESSAGE_SELECT), then
  hydrateParentPreviews + prepareForClient. All on the cookie client, as before. No new param, no new column.
- `npm run typecheck`: green.
- `npm run lint`: exit 1, 88 problems (32 errors, 56 warnings). None in a B0 file; every failing file is unchanged from HEAD
  (public/html/_*.js, campus-home.tsx, CampusMobile/MessagesMobile/ProfileMobile, components/ui/*, ...).
  `npx eslint` on the B0 files alone: exit 0, no output.
- `npm test`: 1349 tests, 1348 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (not B0, file unchanged from HEAD).
- No test reads the messages route's source text (group-rules.test.ts reads threads/route.ts and members/route.ts only).
- tsc --listFiles confirms every B0 file is inside the typecheck. No CRLF, files end with a newline.
- Importers of channel-access.ts are four server routes + message-read.ts; none is a client file. The new import in
  channel-access.ts is `import type`, erased at build. message-read.ts reaches `server-only` through channel-access -> r2.ts.
- Type-only loop channel-access -> chat/types -> chat/message-read -> channel-access: two of the three edges are
  `import type`, so there is no runtime cycle.

## Verdict on the lens
The move changed no behaviour. No finding of severity high. Nothing in the two existing files was edited beyond the
import block of the route and the type + its import in channel-access.ts.

## Findings

### F1 (medium, the contract, NOT a B0 file): 12.2's exception may go against Franky's sentence
- Where: handoffs/chat-redesign/wave-1-contracts.md line 607 (section 12, point 2); wave-0-decisions.md "Evening of Sept 29".
- Evidence: the relayed answer is "2. agreed but yu shouldnt be able to see their messages still". The contract adds
  "One exception ...: a top-level Board post by an officer shows to every member". With that exception a person who
  blocked an officer still sees that officer's Board posts. The exception is not in Franky's words.
- Wave 1 effect: none. `hidden` is reserved and always false (types.ts:250-251 matches contract 6.1 word for word).
  The moved read has no block filter today and has none after the move (unchanged).
- Change: no B0 edit. Before the wave that builds the rooms' screens, ask Franky one question ("If you blocked a club
  officer, do their Board posts still show to you?") and treat the exception as not confirmed until he answers.
  B0's own notes raised the same point.

### F2 (low, handoff): line references to the two edited files are now off
- Where: src/app/api/me/threads/[id]/messages/route.ts (everything after line 42), src/lib/messages/channel-access.ts.
- Evidence: GET moved from line 208 to 46, POST from 347 to 185 (630 -> 468 lines): every asis reference past the old
  line 42 is 162 too high (asis lines 1198, 1582, 1614, 1616, 1646, 1667). channel-access.ts: +1 after line 1, +5 after
  the type (asis 1195, 1668).
- Change: no code change. Put one line in B4's and B1b's task text: "asis line numbers for messages/route.ts are 162 too
  high after B0's move; the four pieces are at src/lib/chat/message-read.ts:31-188; channel-access.ts is 5 lines lower
  after the ChannelAccess type".

## Gates, for the orchestrator (not B0 defects)
- `npm run lint` is red at HEAD (88 problems, all in files B0 did not touch). Gate on `npx eslint <changed files>`.
- `npm test` has one red file at HEAD (src/lib/otto/parse-reminder.test.ts, ERR_MODULE_NOT_FOUND). Gate on "no new failure".
- Not checked: `next build` and a live request (no dev server allowed in this batch).
