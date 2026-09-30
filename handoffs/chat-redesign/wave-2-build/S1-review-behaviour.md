# W2-S1 review — lens: behaviour

Reviewed at HEAD `65c38ed` (the S1 commits `7678656`, `22d920e`, `92a0810`, `005020d`,
`048cb1f`, `b47a72b`, `866ab0a`; `git diff a9355d1 -- <S1 files>`), against
`wave-2-contracts.md` 1.2, 1.4, 2, 9.3, 10.2, 11.0–11.2, 11.9, 11.10, 12, 13, 14,
the mockup `boards/W0_Home.dc.html`, S2-notes.md R1–R4 and `club/ClubSpace.tsx`
(the sibling the shell mounts). Read-only; the walk below is by reading, as a user.

Method: refute the batch — first paint with the flag unknown / true / false; a
member with 2 clubs and 3 dms; a muted club; the week with a live card, a
maybe-only day, an ended event, a non-member RSVP; a day tap; a club row tap
(Lounge vs Board); a dm tap and its close; the hardware back through two layers;
the four `?channel=` deep links; `?tab=requests`; the Requests pill; CampusMobile
with `?tab=chat` while null → true → false; hooks order, effects, popstate
closures, intervals; the four gates run here.

**Verdict: REPAIR — 1 HIGH (a deep-linked space whose event layer was opened
once cannot be closed by its Back button in a fresh tab), 2 MEDIUM, 4 LOW. Gates
green (typecheck 0, 1637/1637 tests, eslint parity exact, build below).**

## Findings

### S1-BEHAVIOUR-1 — HIGH — `src/components/mobile/MessagesMobile.tsx:211`

**What.** `closeLayer` decides between `history.back()` and the in-place close
with `window.history.length > 1`. `history.length` counts FORWARD entries too.
Walk, fresh tab (a push link, the common way into an event room, 2.3):
`/messages?channel=<event room>` → the shell `replaceState`s depth 1 on the only
entry and `pushState`s depth 2 (`:297`); `ClubSpace` mounts, the layer is on top
(`length` = 2). The layer's Back → `history.back()` → popstate depth 1 → the shell
ignores it (R1), `ClubSpace` closes the layer; the browser is now on entry 1 of 2
with a forward entry. The space's Back (`Back to Messages`) → `closeLayer`:
`depthOf(state) === 1` and `length` (2) `> 1` → `history.back()` — there is NO
entry behind entry 1, so the call is a no-op, no popstate fires, the space never
closes. Every further tap does the same. The same walk breaks a plain
deep-linked Lounge in a fresh tab once the user opens an event chip and comes
back (ClubSpace pushes depth 2 itself, `ClubSpace.tsx:108`). The hardware back
is a no-op there too (nothing to pop), so the user is stuck in the space.

**Fix.** Decide "is there an entry behind the depth-1 layer" when the layer is
opened, not at Back time: a ref `noBackRef = useRef(false)`; in the `?channel=`
effect, before the `replaceState` (`:295`), `noBackRef.current =
window.history.length <= 1`; in `openView`'s `pushState` branch and in
`closeInPlace` set it `false`; in `closeLayer`:
`if (depthOf(window.history.state) >= 1 && !noBackRef.current) window.history.back(); else closeInPlace();`.
(`closeInPlace` already `replaceState`s `/messages`, which is 2.3's "Back from a
deep-linked space leaves /messages" for a tab that has nowhere else to go.)

### S1-BEHAVIOUR-2 — MEDIUM — `src/components/mobile/messages/home/home-rules.ts:228-231`

**What.** `personPreview` infers "my own message" by elimination: in a group an
author not in `members` → `You: …`; in a dm an author `!== peer?.id` → `You: …`.
`members` are the current `channel_members` rows other than mine
(`threads/route.ts:584-592`), so the last message of a member who LEFT the group
reads `You: <their text>`; a dm whose `peer` is null (a removed account) reads
`You:` on every line. The list sends no `viewer_id`, so the row cannot know.
The old `ThreadRow` shows no prefix at all, so this is a new wrong label.

**Fix.** Assert `You:` only when it is provable, never by elimination: in a
group, an author not in `members` → the text alone (or `Someone: <text>`); in a
dm, `t.peer ? (lm.user_id === t.peer.id ? body : \`You: ${body}\`) : body`.
Update the `personPreview` test's "another group member" case to add a
departed-author case.

### S1-BEHAVIOUR-3 — MEDIUM — `src/components/mobile/messages/home/YourWeek.tsx:158`

**What.** The card row carries `className="vibe-no-scrollbar"`. 11.0: "inline
styles like the rest of the file (no `className`, MM:6)"; the old file has zero
`className`s. The class exists in `globals.css:2886` (CampusMobile uses it), so
nothing breaks — it is the pinned rule that is missed, and the inline
`scrollbarWidth: "none"` already covers every engine but WebKit's overlay bar.

**Fix.** Drop the `className` (the inline `scrollbarWidth` stays), or, if the
WebKit bar matters at 375px, keep it and write the one exception under S1-notes
STOPPED so the design review and the integration review see it.

### S1-BEHAVIOUR-4 — LOW — `src/components/mobile/MessagesMobile.tsx:189, 274-308, 311-331`

**What.** A `?channel=` resolution (or `openRoom`'s read for a week card without
a handle) in flight does not yield to a view the user opens meanwhile: the home
is on screen while the read runs (11.10 "the home is not needed for the view to
open"), a row tap `pushState`s depth 1 and mounts its view, then the read
answers, `replaceState`s that entry with the deep link's id and `setOpen`s the
deep link's view over the user's. `deepLinkSeqRef` is bumped only by deep links.

**Fix.** `deepLinkSeqRef.current += 1;` as the first line of `openView` (and of
`closeInPlace` / the popstate close), so a lookup still in flight sees a newer
owner and drops its answer.

### S1-BEHAVIOUR-5 — LOW — `src/components/mobile/CampusMobile.tsx:996-1005`

**What.** With the flag `true` and `tab === "chat"` (from `?tab=chat` or
`?channel=`), the chat `<section>` is removed and `tabOrder` loses `"chat"`, so
the scroll-sync effect (`:770-780`) returns on `idx < 0` and the pane scroller
stays at 3 × width: the Map pane (or, on a closed visited campus, nothing) is
what the user sees, under a strip with no Chat pill, until `router.replace`
lands. One frame to a few hundred ms; the skeleton 2.2 asks for shows only
while `null`.

**Fix.** Keep the section while the tab is `chat`: render
`{chatV2 === true && tab !== "chat" ? null : (<section …>{oldChatMounts ? <ChatPane …/> : <ListSkeleton />}</section>)}`
— `ChatPane`, the drawer and the view still never mount with the flag on.

### S1-BEHAVIOUR-6 — LOW — `src/components/mobile/messages/home/MessagesHome.tsx:169-181`

**What.** 11.1: the two list reads "every 30 s while visible". The tick runs on a
fixed 30-s interval AND skips when the last read is under 30 s old, so after a
read that the interval did not start (a close's `refreshKey`, a Retry, a
visibility return) the next read comes at the second tick: up to ~60 s. Not a
contract breach in letter (the visibility rule is "at most once per 30 s"), but
the cadence 11.1 names is not kept after every close.

**Fix.** Keep the gate for `visibilitychange` only; on the interval path call
`readLists()` unconditionally, or restart the interval in `readLists`
(clear + set) so the 30 s count from the last read.

### S1-BEHAVIOUR-7 — LOW — `src/components/mobile/MessagesMobile.tsx:189-197, 311-331`

**What.** A week card (and an event-room deep link) makes the depth-1 entry
`{ vibeChat: <event room>, depth: 1 }` with `?channel=<event room>`, because the
calendar entry carries no Lounge id. After the layer's Back the space shows the
Lounge under `/messages?channel=<event room>`; a reload there re-opens the
layer, and a chip tap is what corrects the URL (`ClubSpace.tsx:96-97`). Inherent
in the data; recorded so the integration review sees it.

**Fix (a request to W2-S2, not S1's file).** In `ClubSpace`'s popstate close and
`closeEvent`, `replaceRoomHistory(pickedRoomId ?? initialRoomId)` once the
layer is gone, when `pickedRoomId` is known.

## Holds (walked and confirmed against the contract, the mockup and the code)

- **First paint.** `MessagesMobile` (`:60-72`) calls one hook, `useChatV2`, then
  forks to three components: `FlagPending` on `null` (`Messages` 28px/900, the
  pencil, no pills, `ListSkeleton`, nothing else), `MessagesMobileV2` on `true`,
  `MessagesMobileV1` on `false` / a failed read (the V1 body is byte-identical to
  `a9355d1`: the diff has three hunks, all above it). No list mounts under
  another (2.1, SCREENS-L12). `useChatV2`: one `GET /api/me/features`,
  `no-store`, quiet, `true` only for `{ ok: true, chat_v2: true }`, else `false`
  logged once, no cache across mounts (2.1).
- **2 clubs + 3 dms.** `mergeHomeRows`: pinned first (newest pin first), then
  `last_activity_at` vs `last_message.created_at`, nulls last, stable
  (tested). The All badge = unread non-muted threads + clubs with
  `board.unread || lounge.unread_count > 0` whose `muted_until` is null or past,
  `99+` (11.1, SCREENS-L8; tested). Club preview (SCREENS-L8): `Board: <text>`
  + dot on `board.unread`; else the newer of the two; a Lounge line
  `<Author>: <text>`; an empty `author_name` → the text alone, no `: `
  (ROUTES-L8; `author_name` is always a string, `reads.ts:40`); nothing when
  both null. The chip `Live now · <title>` / `<eventTimeShort> · <title>` +
  Going (check) / Maybe (dot); `N new` at the right. Person rows: 44px avatar,
  the double avatar for a group, the pin icon, `rowTime` with the one `now`.
- **A muted club.** Out of the All badge, still shows its dot / `N new` in the
  row, nothing else rendered (11.1, 14.22).
- **Your week.** `weekRange` Monday–Sunday in the device zone, `from`/`to` as
  ISO (tested through a DST week and across a month / a year). A live card gets
  the live chrome and the bloom (the bloom only when a live card exists); a
  maybe-only day → the grey dot; an ended event (`room_state === "after"`) →
  `Ended` with the link kept; `room_id === null` (a non-member RSVP, a club I
  left) → a plain `role="group"` tile with the same text and no link; a null
  `org` → no club line. Day taps scroll the card row to that day's first card
  (`scrollTo` on the row, `offsetLeft - 16`); a day with nothing does nothing
  (14.35). Empty: no bloom, transparent dots, `Nothing on your week yet.` +
  `Find events` → `/campus?tab=events`. Failure: `Couldn't load your week.`
  compact in the card row's place, the strip still drawn. Labels: the strip
  `Your week, <Month D> to <D>`, day labels per SCREENS-L2 (tested), the group
  `Event rooms you RSVP'd to this week`, card labels `<title> room, <club>,
  live now, you're going`.
- **Club row tap.** `openBoard = board.unread && lounge.unread_count === 0` →
  the Board (`board.room_id`, `"board"`), else the Lounge (11.1). `ClubSpace`
  is keyed on the room id.
- **A dm row.** `ConversationView key={threadId}`, `thread` from the lists the
  home reported (`onThreads`), `onThreadsChanged` and the close both bump
  `refreshKey` → the two list reads run again (11.1 "after closing").
- **History (2.3, R1–R3).** A row tap = one `pushState({ vibeChat, depth: 1 },
  "", "/messages?channel=<id>")`; Back / the swipe = `history.back()`; the
  `popstate` handler is the one closer for depth 1 (it reads only refs and
  setters: no stale closure; it ignores `depth >= 1`, which is the event
  layer's Back — `ClubSpace` closes that one). Two hardware backs from a space
  with the event layer open: pop to depth 1 → the layer closes, the space
  stays; pop to depth 0 (Next.js's own `__NA` entry, no `vibeChat`) → the space
  closes, the home refetches, the URL is `/messages` or `/messages?tab=<f>`
  (`setFilter` keeps the depth-0 URL current while nothing is open). Next.js
  16's patched `pushState` / `replaceState` copies `__NA` and the tree onto the
  entries, so no reload on pop. A `?to=` handle resolves on the first
  `onThreads` (an existing dm, else the POST) and opens the same way.
- **Deep links (2.3, N6).** `?channel=` is read once (`useState(initialChannelId)`);
  the thread GET runs once the flag is `true` (V2 exists only then);
  `room !== null` → the space of `room.org.handle` with that room, `replaceState`
  depth 1 on the entry the browser holds; `room.kind === "event"` → plus a
  `pushState` depth 2 that `ClubSpace` recognises (`:107`) and does not push
  again; `room === null` → `ConversationView` at depth 1. Any non-200 or a
  malformed 200 → filter All, `replaceState(null, "", "/messages")`, the toast
  `asLoadFailure(r, "Couldn't open this chat.").message` (403 → its mapped
  line, 5xx → the line + Try again), nothing mounted. `?tab=requests` →
  `parseHomeFilter` → the Requests filter; `?tab=` with the flag off is ignored
  by V1. The Requests pill: `aria-label="Requests, N waiting"` when N > 0, the
  count from `requests.length`; the All pill's badge as above.
- **CampusMobile (2.2).** `useChatV2` + `useRouter` called unconditionally;
  `?tab=chat` / `?channel=` while `null` → the strip with today's tabs, the
  Chat pane a `ListSkeleton`, no `ChatPane`, no `OrgChannelsDrawer`, no
  `ConversationView` (all three gated by `oldChatMounts`), so no thread GET
  before the flag is known; `true` → the strip without Chat, one
  `router.replace("/messages" + "?channel=<id>")` (`chatRedirectedRef`),
  `?org=` dropped; `false` → today's drill-down mounts as before. A plain
  `/campus` while `null` is unchanged (14.20).
- **Hooks and effects.** Every component's hooks precede its returns; no
  setState in an effect body (the reads set state after their `await`, the
  redirect effect sets none); the 30-s interval and the `visibilitychange`
  listener are cleared on unmount; the popstate listeners are removed;
  `readLists` / `readWeek` have one identity (`onThreads` is a stable
  `useCallback` chain), so the mount effects run once and StrictMode's double
  run is absorbed by the sequence refs. `useHideTabBar` counts (first mount
  adds, last unmount removes).
- **States, every screen (11.0).** Skeleton until BOTH lists answered; the week's
  own skeleton (three 142×64 cards); `Couldn't load your clubs.` /
  `Couldn't load your messages.` / both → one box; Clubs empty → `HomeEmpty`
  (the four strings, both links to `/campus?tab=orgs`); Chats empty →
  `EmptyState tab="all"`; Requests empty → `tab="requests"`; a refetch failure
  keeps the rows and stays quiet (`*LoadedRef`). Every `LoadFailed` carries
  `tone={night ? "dark" : "light"}` and `onRetry`.
- **Ownership (13.2) and 10.2 rule 5.** S1 touched only its files
  (`MessagesMobile.tsx` flag fork, `CampusMobile.tsx` 2.2, `layout.tsx:96` one
  line, `home/*`, `v2-tokens.ts`, `avatar.ts` + test, `use-chat-v2.ts`,
  `use-hide-tabbar.ts`, `week.ts` + test, `S1-*.md`); no moved file under
  `messages/*.tsx` was edited by S1; `MessagesSwitch.tsx` untouched.
- **Copy.** Every 1.2 string of the home checked verbatim (`Messages`, `New
  message`, the four filters, `Requests, N waiting`, `Your week`, `<label> ·
  your RSVPs`, `Live now` / `Ended`, `Going` / `Maybe`, `N new`, `Board:`,
  `Nothing on your week yet.` / `Find events`, the four no-clubs strings — the
  mockup's `you’re` is what `&rsquo;` renders, `W0_EmptyClubs`). No Discord
  word in the new files.

## The builder's STOPPED and SIBLING entries, judged

- Part 1 (four club gradients, not six): **right** — the mockup sources hold
  exactly four `145deg` gradients (grep over `boards/W0_*.dc.html`); six is the
  person-colour count. Nothing invented.
- 10 (the ONE popstate handler / `initialPage` vs the pinned `ClubSpace`
  props): **right** — `ClubSpace`'s props are `{ orgHandle; initialRoomId;
  initialRoomKind; onClose }` with no history callback and no `initialPage`;
  R1–R3 are honoured line by line (checked against `ClubSpace.tsx:103-108,
  205-225`). The second read of a deep-linked room is real and belongs to the
  integration review (R4).
- 11 (the unread pill without a count): **right** — `ThreadEntry.unread` is a
  boolean, the list sends no count.
- 12 (`eventTimeShort` never answers `Sat` alone; `7 PM` for tomorrow): **right**
  — 1.4 pins the function and 1.2's `<Sat> · <title>` example contradicts it;
  building with the pinned function is the rule.
- 13 (the spoken time as the last clause): a reading the contract allows.
- 14 (the coral MARK on tinted surfaces): **right** — 11.0 names the mark token
  for exactly those surfaces; the contrast table records the pairs.
- 15 (the pencil `aria-disabled` while the flag is unknown): a reading; nothing
  can open until the flag answers.
- 16 / 17 (`?tab=` via `useSearchParams`; the failure box at the top of All):
  readings, both consistent with 2.3 and 11.1; the build proves no Suspense
  bailout for `/messages`.
- SIBLING: none — **right**; the repo-wide typecheck is clean here too.

## Gates, run by this review at `65c38ed`

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output |
| tests | `npm test` | 1637 tests, 1637 pass, 0 fail |
| build | `npm run build` | exit 0 on the first try (no sibling build running; no warning naming an S1 file, no `useSearchParams` / `server-only` complaint) |
| eslint, new files | `npx eslint src/components/mobile/messages/home src/components/mobile/messages/v2-tokens.ts src/components/mobile/messages/avatar.ts src/components/mobile/messages/avatar.test.ts src/lib/chat/use-chat-v2.ts src/lib/chat/use-hide-tabbar.ts src/lib/chat/week.ts src/lib/chat/week.test.ts src/app/layout.tsx` | exit 0; the one pre-existing `no-page-custom-font` warning at `layout.tsx:95` |
| eslint parity, `MessagesMobile.tsx` | `git show a9355d1:<path> \| npx eslint --stdin --stdin-filename <path>` vs `npx eslint <path>` | base: `react-hooks/immutability` :151, `set-state-in-effect` :204; now: the same two at :501, :554 (inside `MessagesMobileV1`); none added |
| eslint parity, `CampusMobile.tsx` | same | base: `set-state-in-effect` :282, :434, :630, :3990; now: the same four at :314, :466, :662, :4026; none added |

(`eslint -f unix` is not available in this ESLint; the default formatter was
compared rule by rule and line by line.)
