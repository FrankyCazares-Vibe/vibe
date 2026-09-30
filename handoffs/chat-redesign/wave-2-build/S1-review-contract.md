# W2-S1 review — lens "contract"

Reviewed on the branch at `94bcb1d` (S1's commits `7678656`, `22d920e`, `92a0810`,
`005020d`, `048cb1f`, `b47a72b`, `866ab0a`; `git diff a9355d1 -- <S1 files>`).
Contract: `wave-2-contracts.md` 1.2 (home strings), 1.4, 2.1–2.3, 8.1, 9.3,
10.2 rule 5, 10.3, 11.0, 11.1, 11.2, 11.9.1–2, 11.10, 12, 13.1–13.3. Facts:
MK:0.1–3, the `W0_Home` / `W0_EmptyWeek` / `W0_EmptyClubs` sources. Method: refute.

## Verdict

**PASS with repairs** — no HIGH. One MEDIUM (a `className` on the card row,
against 11.0's no-`className` rule), four LOW. Every copy string and
`aria-label` of 1.2's home block is exact in the code; the reads, their
params and the two polling rules match 11.1 (one extra scheduled calendar
re-read, LOW); the All ordering and the badge rule match 11.1; the `?channel=`
resolution and its failure path match 2.3 / 11.10 word for word; the history
rules are 2.3's as narrowed by S2's R1–R3 (STOPPED 10, judged right);
CampusMobile's three flag states are 2.2's; the old list is byte-identical
under the flag `false`; 10.2 rule 5 / 10.3 hold; the tokens are MK:0.1's two
columns; `week.ts` is 1.4's row; the fonts line is 11.0's. Gates: typecheck 0,
tests 1614/1614, eslint = the baseline set only; the build is recorded below.

## Findings

### S1-CONTRACT-1 — MEDIUM — `className` on the week's card row
- where: `src/components/mobile/messages/home/YourWeek.tsx:158`
- what: `className="vibe-no-scrollbar"` on the card row. 11.0: "inline styles
  like the rest of the file (no `className`, MM:6)"; every other S1 line obeys
  it. The row already carries `scrollbarWidth: "none"` inline (:168), which is
  the mockup's own rule (`W0_Home:39`); the class only adds the WebKit
  pseudo-element, which iOS Safari does not need for a horizontal
  `overflow-x: auto` row.
- fix: delete line 158 (`className="vibe-no-scrollbar"`); nothing else changes.

### S1-CONTRACT-2 — LOW — the calendar is re-read on the 30-s timer
- where: `src/components/mobile/messages/home/MessagesHome.tsx:169-181` (the
  `tick` at :173)
- what: 11.1 pins the calendar "on mount and on return to visible at most once
  per 5 min". The interval `tick` (every 30 s) also re-reads it once 5 min have
  passed, so a home left open re-reads the calendar every 5 min without a
  visibility change. One extra read; the 5-min floor is honoured.
- fix: split `tick`: the interval calls `readLists()` only (with its 30-s
  guard); the `visibilitychange` listener calls both (the lists with the 30-s
  guard, the week with the 5-min guard).

### S1-CONTRACT-3 — LOW — a curly apostrophe in an "exact" string
- where: `src/components/mobile/messages/home/HomeEmpty.tsx:62`
- what: `you&rsquo;re going to` renders `you’re` (U+2019). 1.2's exact string
  is `Join a club to get its Board, its Lounge and a chat for every event
  you're going to.` with an ASCII apostrophe (checked by bytes); the mockup
  `W0_EmptyClubs:52` has the curly one, so the contract transcribed it. Spoken
  the same; one glyph on screen.
- fix: `you&#39;re` (ASCII, as 1.2), or the integration review amends 1.2 to
  the mockup's glyph — one or the other, so "exact" is true.

### S1-CONTRACT-4 — LOW — a `scrim` token 11.0 does not list, with a Light literal MK:0.1 does not carry
- where: `src/components/mobile/messages/v2-tokens.ts:57-58, 89, 118`
- what: `palette().scrim` is additive (11.0's token list has no scrim; S3's
  sheets will want one). Night's `rgba(8,7,7,0.5)` is MK:0.1's; Light's
  `rgba(20,20,22,0.35)` appears in no mockup (there is no Light tray/sheet
  mockup). Nothing on the home reads it, so no screen is affected.
- fix: keep it; add one line to `S1-notes.md` (STOPPED or Decisions) naming the
  Light value as S1's own choice, so the design review and S3 know it is not a
  mockup literal.

### S1-CONTRACT-5 — LOW — the build gate at review time
- where: `handoffs/chat-redesign/wave-2-build/S1-gate.md` (part 2, build row)
- what: S1's record says build exit 0 after its last code edit. At review time
  `npm run build` failed in `Running TypeScript` on two files S1 does not own
  and did not cause: `src/components/mobile/messages/cards/card-rules.test.ts:16`
  and `messages/compose/sheet-rules.test.ts:15` (TS5097, S3's uncommitted
  work in the shared tree). Retried after 90 s per 13.3; the result is under
  "Gates" below. Not an S1 defect; recorded so the integration review does not
  read S1's build row as stale.
- fix: none for S1; S3 fixes its import path (its own gate).

## STOPPED / SIBLING judged

| entry | judgement |
|---|---|
| part 1: `clubGradient` "six" vs the mockups' four | right: `grep 145deg` over `boards/W0_*.dc.html` gives exactly four gradients; six is the person-colour count. No value invented. |
| 10: the ONE `popstate` handler vs `ClubSpace`'s pinned props | right: `ClubSpace` (`club/ClubSpace.tsx:118`) takes `{ orgHandle, initialRoomId, initialRoomKind, onClose }` and no `initialPage`; S1's handler ignores `depth >= 1` and closes on `< 1`, `ClubSpace` pushes depth 2 unless `history.state` already reads `{ depth: 2, vibeChat }` (:103-108) — the two handlers partition the depths with no overlap. The room is read twice on an event deep link until `initialPage?` exists (S2's R4); the integration review owns that. |
| 11: the unread pill with no number | right: `ThreadEntry.unread?: boolean` (`messages/types.ts:39`), no count anywhere in `GET /api/me/threads`; the label says `unread`. The contract's `N unread` has no source. |
| 12: `<Sat> · <title>` vs `eventTimeShort` | right: 11.1 names the function, and the function answers `Sat 2 PM` (`when.ts:171-187`) and `7 PM` alone for tomorrow. Built with the pinned function; the contradiction is the contract's. The integration review may want `Tomorrow` back on the chip (a `when.ts` question, W2-B2's file). |
| 13: the spoken time as the last clause | right: 1.2 says the row's time is spoken with `rowTimeSpoken`; its examples omit it; last is the only placement that keeps every example's clauses. |
| 14: `coralMark` for `Live now` / `Going` on tinted surfaces | right: 11.0's own token rule ("coral mark on a tinted surface ... `Live` on the live/soon card chrome"); the table holds the pairs. |
| 15: the pencil `aria-disabled` while `null` | right: 2.1 says "the pencil"; nothing exists for it to open. Same 40px chrome as today's header (`MessagesMobileV1`), so "as today" holds. |
| 16: `?tab=` via `useSearchParams` | a reading, not a stop; the page is dynamic (`await enforceCampusAccess`, `await searchParams`); the build gate proves it (below). |
| 17: the failure box at the top of All | right: with clubs and threads interleaved there is no "club position"; both boxes at the top, the rest listing, is 11.0's "IN PLACE of the failed part, the rest of the screen staying". |
| SIBLING: none | right at its time; the typecheck is still 0 repo-wide. The build's sibling failure is S1-CONTRACT-5. |

## Holds (refuted nothing)

- **1.2 home strings, line by line**: `Messages`; `aria-label="New message"`;
  `All` / `Chats` / `Clubs` / `Requests`; `Requests, N waiting`; `Your week`;
  `<Mon D> – <D> · your RSVPs` (en dash, `Sep 28 – Oct 4` across a month:
  `week.ts:52-54`, tested); `Your week, October 5 to 11`; day labels
  `<Weekday>, <Month D>, nothing planned` / `, today, nothing planned` /
  `: <title>, going` / `, maybe` / `, going, live now` / `, today: …`, two
  events joined with `; ` (`home-rules.ts:276-285`, tested); week cards
  `Live now` / `Ended` / `eventTimeShort` + ` · ` + check `Going` / dot
  `Maybe`, title, club name; `"<title> room, <club>, live now, you're going"` /
  `"…, Friday 7 PM, you said maybe"`; group `Event rooms you RSVP'd to this
  week` (ASCII apostrophe, as 1.2); `Nothing on your week yet.` + `Find events`
  → `/campus?tab=events` in `coralText`; club row preview rule (Board dot when
  `board.unread`, else the newer, `Board:` / `<Author>:`, empty author → text
  alone, both null → nothing); chips `Live now · <title>` / `<eventTimeShort> ·
  <title>` + `Going` / `Maybe`; `N new` with `99+`; row label clauses each only
  when true; person rows: 44px avatar, 15px/700, `rowTime(last_message.created_at)`
  with the one clock (`now` set on every list read), 12px pin `aria-label="Pinned"`,
  `You: …` / `<Name>: …`, the pill; `"<name>, <spoken time>[, unread][, pinned]"`;
  no clubs: `Your clubs will live here.` 24px/700, the 14.5px/500 line at
  306px, `Find clubs on campus` 48px gradient → `/campus?tab=orgs`, `Start a
  club` 44px underlined → `/campus?tab=orgs`; Chats empty `EmptyState
  tab="all"`, Requests empty `tab="requests"`; the three `LoadFailed` lines
  `Couldn't load your messages.` / `Couldn't load your clubs.` / `Couldn't load
  your week.` each `asLoadFailure(r, …)` with `tone={night ? "dark" : "light"}`
  and `compact` on the week; the deep-link toast
  `asLoadFailure(r, "Couldn't open this chat.").message`.
- **11.1 reads and polling**: `GET /api/me/threads?scope=chats` (the route
  honours `scope`, `threads/route.ts:426`), `GET /api/me/inbox`,
  `GET /api/me/calendar?from=<Monday 00:00 local ISO>&to=<Sunday 23:59:59.999>`
  in parallel on mount; the first two every 30 s while visible and on return to
  visible at most once per 30 s; the calendar on mount and on return at most
  once per 5 min (plus the timer read of S1-CONTRACT-2); again on `refreshKey`
  after a view closes.
- **11.1 the list**: `mergeHomeRows` pinned first (newest pin first) then
  recency, null last, stable (tested); All badge = unread threads not muted +
  clubs with `board.unread || lounge.unread_count > 0` not muted, `99+`
  (tested); Requests = today's `ThreadRow`; Clubs `[]` → `HomeEmpty`; skeleton
  until both threads and inbox answered; tap → Lounge, or Board when
  `board.unread && lounge.unread_count === 0`.
- **11.2**: `weekRange(now)` Monday–Sunday in the device zone (DST week
  tested); seven 44×44 buttons, coral / grey / transparent dot, today
  `aria-current="date"` on the inverted chip, past days muted, a tap scrolls
  the row to the day's first card; 142×64 cards sorted by `starts_at`, live
  chrome + bloom only when a live card exists, a link only when `room_id !==
  null`, `Ended` on `after` with the link kept; empty line 44px; the week's
  own three-card skeleton; `LoadFailed compact` in the row's place with the
  strip drawn.
- **2.1**: `useChatV2()` one `GET /api/me/features` per mount, `no-store`,
  quiet, `true` only on `{ ok: true, chat_v2: true }`, else `false` logged
  once, no cross-mount cache; `MessagesMobile` = the one hook then the fork;
  `null` → bare header (28px/900 `Messages`, the pencil, no pills, no week) +
  `ListSkeleton`; `true` → the home; `false` → the old list; never one list
  then the other; desktop untouched.
- **2.3 / 11.10**: `?channel=` → one thread GET after the flag answered true;
  `room` non-null → the space of `room.org.handle` with that room; `event` →
  the space with the layer (replaceState 1 + pushState 2, R2); `room === null`
  → `ConversationView`; any non-200 → home on All, `replaceState("/messages")`,
  the toast, nothing mounted; `initialChannelId` read once (`useState`
  initialiser); `?to=` as today (existing dm else `POST /api/me/threads`);
  `?tab=` → the filter; a filter change `replaceState`s the depth-0 URL so the
  URL after the last close is `/messages` or `/messages?tab=<f>`; every open
  from the home one `pushState({ vibeChat, depth: 1 }, "", "/messages?channel=<id>")`;
  Back / swipe → `history.back()` (in-place close only when
  `history.length <= 1`, a fallback the contract does not cover); the
  `popstate` handler is the one unmounter of the depth-1 layer; a close bumps
  `refreshKey`.
- **2.2 CampusMobile**: `null` + (`?tab=chat` or `?channel=`) → today's tabs,
  nothing of the old chat mounts, `ListSkeleton` in the pane; `null` on a
  plain `/campus` → unchanged; `true` → the orders without `"chat"`, one
  `router.replace("/messages" + "?channel=<id>")` (`?org=` dropped), no
  `ChatPane` / `OrgChannelsDrawer` / channel `ConversationView`; `false` →
  today. `openChannel` is state only; its `ConversationView` (the 9–13-call
  read) never mounts before the flag is known.
- **The old list**: the body of `MessagesMobileV1` is byte-identical to
  `a9355d1`'s `MessagesMobile` body after the rename (13,888 chars, `diff`
  empty); `?tab=` is ignored there (never read).
- **10.2 rule 5 / 10.3**: `split-check.mjs --base 507d6b4` → MISSING 0,
  DUPLICATE 0, CHANGED = `MessageRow`, `MessagesMobile`, `ConversationView`,
  `MessageBubble`, `ReactionPicker` (each hint being the allowed lines);
  ADDED = the seven S1 declarations in `MessagesMobile.tsx` + `avatar.ts` (6)
  + `v2-tokens.ts` (7). Exactly 10.3's integration paragraph.
- **Tokens vs MK:0.1 / 11.0**: every literal of the two columns matches
  (page / ink / secondary / muted `--ink-sub` Light, `--ink-muted` Night /
  surface / hairline / coral / coralText / coralMark / coralButton /
  activeChip / ringGrey / liveCard / quietCard / picked / unpicked / bloom);
  `SERIF` / `FONT`; no `SOFT` axis; the Light mockup inks not adopted.
- **Fonts**: `layout.tsx:96` is one line, exactly 11.0's string.
- **13.2 ownership**: every S1 commit touches S1 files only (`git show --stat`).
- **Hooks / states / a11y**: no early return before a hook in any S1 file
  (the root's fork calls `useChatV2` first; each branch is its own component);
  skeleton, empty and `LoadFailed` states present on every part; `role="tablist"`,
  `aria-selected`, icons `aria-hidden`, rows are buttons with full labels,
  inputs none; no Discord word in any new copy string.

## Gates (run here)

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1614 / 1614 pass |
| `npx eslint <S1 files>` | 6 errors + 1 warning = the a9355d1 baseline exactly: `MessagesMobile.tsx` immutability 151→501, set-state-in-effect 204→554 (both in `MessagesMobileV1`); `CampusMobile.tsx` set-state-in-effect 282→314, 434→466, 630→662, 3990→4026; `layout.tsx:95` no-page-custom-font. 0 new. |
| `node …/split-check.mjs --base 507d6b4` | as 10.3's integration paragraph (above) |
| `npm run build` (first run) | FAILED in `Running TypeScript` on S3's uncommitted `cards/card-rules.test.ts:16`, `compose/sheet-rules.test.ts:15` (TS5097) — sibling; retried after 90 s (below) |
| `npm run build` (retry 2, after 90 s) | `✓ Compiled successfully in 15.3s`; `Running TypeScript` fails on the same two S3 files (TS5097) — deterministic, not a `.next` collision; not S1's. A third retry was started (background) and had not finished when this review closed. S1's own gate record (build exit 0 after its last edit, `S1-gate.md`) stands for S1's files: the compile step, which is where a `useSearchParams` Suspense bailout or a `server-only` client import would surface, passes here too, and the failing files are outside S1's ownership (13.2). |

Filed as S1-CONTRACT-5 (LOW, sibling). The integration review re-runs the build once S3 has committed.
