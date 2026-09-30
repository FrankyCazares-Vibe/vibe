# W2-S1 notes (the screens batch, Messages home)

Branch `claude/relaxed-davinci-9d11h3`, started at `a9355d1`. The contract is
`handoffs/chat-redesign/wave-2-contracts.md` (final); the facts are
`wave-2-asis/mockups-map.md` (MK) and `messages-mobile-map.md` (MM).

## Part 1 — the first commit (serial prelude, contract 13.1)

Built alone before the three screen batches run side by side. Files (13.2):

1. `src/components/mobile/messages/v2-tokens.ts` — `palette(night)`, every token of 11.0 from MK:0.1's two columns; `SERIF`, `FONT`.
2. `src/components/mobile/messages/avatar.ts` + `avatar.test.ts` — `clubGradient(id)`, `personColor(id)` (1.4).
3. `src/lib/chat/use-chat-v2.ts` — `useChatV2(): boolean | null` (2.1).
4. `src/lib/chat/use-hide-tabbar.ts` — `useHideTabBar()` with a module-level count (11.0, SCREENS-H1).
5. `src/app/layout.tsx` line 96 only — the fonts query string of 11.0.

Gates (13.3): `npm run typecheck`, `npm test`, `npm run build`, `npx eslint <files>`.
One commit: `feat(chat): wave-2 screen tokens, hooks and fonts (W2-S1 first commit)`.

### Facts read before the first edit

- MK:0.1 palette table (Night / Light columns), MK:0.2 (club avatar gradient, person colours).
- The mockup sources hold FOUR club gradients (`145deg`): `#C23A72→#962858`
  (Salsa Club), `#1F7580→#155158`, `#337A5A→#245942`, `#8A6A22→#664C14`; and
  SIX person colours (`#2E4A5A/#CFE6F2`, `#4A3A5E/#E6D8F5`, `#5E4A2A/#F5E1B8`,
  `#5A3A2E/#FFD3C2`, `#2A4550/#CFE6F2`, `#2F4A3A/#CDEBD9`). See STOPPED.
- `globals.css`: Light `--ink-sub #5A564F` (:115), `--ink-muted #8A8580`; Night
  `--ink-muted #9C958C`; `--hairline`, `--paper`, `--cream`, `--charcoal`, `--ink-2`.
- `/api/me/features` → `FeaturesResponse = { ok: true; chat_v2: boolean }` (types.ts:177).
- `vibeRequest(url, { failure, quiet, cache })` never throws; `r.ok` branches.
- `layout.tsx:96` today: `family=Fraunces:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700`.
- Old mounters of `vibe-composer-open` (boolean add/remove): ConversationView:150,
  GroupSettingsView:57, ComposeOverlay:43, PostComposerMobile:115, CampusMobile:2506/3968 — untouched.
- Tests: `node --test` over `src/**/*.test.ts`; pure tests import with the `.ts` extension.

### STOPPED (part 1)

- Contract 1.4 says `clubGradient(id)` picks one of "the six mockup gradients"
  and to "read MK for the six values". MK:0.2 names one club gradient (Salsa
  Club) and the mockup sources (`boards/W0_*.dc.html`) hold FOUR club
  gradients in all, not six; six is the count of PERSON colours. Built with the
  four real club gradients (no invented values) and the six person colours.
  Two more club gradients are a design decision, not this batch's.

### Log
- 2026-09-30T07:46:27Z notes written; starting v2-tokens.ts
- 2026-09-30T07:46:27Z v2-tokens.ts written
- 2026-09-30T07:47:01Z avatar.ts + avatar.test.ts written
- 2026-09-30T07:47:41Z use-chat-v2.ts, use-hide-tabbar.ts written; layout.tsx:96 fonts line replaced (one line)
- 2026-09-30T07:47:50Z layout.tsx:96 re-written with node after a sed & mishap; diff is the one line
- 2026-09-30T07:49:49Z gates: typecheck 0, npm test 1580/1580, build 0, eslint 0 errors (layout.tsx warning pre-existing on a9355d1); S1-gate.md written; committing
- 2026-09-30T07:49:58Z COMMITTED 7678656 feat(chat): wave-2 screen tokens, hooks and fonts (W2-S1 first commit). First-commit prelude done; the main S1 builder continues from here (MessagesMobile flag fork, home/*, week.ts, CampusMobile 2.2, S1-contrast.md).

## Part 2 — the Messages home (the main S1 batch, after the three first commits)

Resumed on `24ca304` (S3's notes commit; S1 `7678656`, S2 `3bf4695`, S3 `36a1ccd`
are on the branch). `git status` showed only this notes file modified. S2's
part-2 notes (its REQUESTS R1–R4 to S1) were read before this plan.

### Plan (files, in build order; every `.tsx` `"use client"`, inline styles, `palette(night)`)

1. `src/lib/chat/week.ts` + `week.test.ts` — `weekRange(now)` exactly as 1.4
   (`{ start, end, label, spoken }`, Monday–Sunday in the device zone); plus the
   additive helper `weekDays(start)` (the seven Dates the strip draws).
2. `messages/home/home-rules.ts` + `home-rules.test.ts` — PURE (imports
   `@/lib/chat/when` and types only): `HomeFilter`, the merged All ordering
   (`mergeHomeRows`), the All badge (`allBadgeCount`), the club preview rule
   (`clubPreview`, SCREENS-L8), the club chip text, the club / person row
   `aria-label`s, the week day labels (1.2, SCREENS-L2), `spokenShort`
   (`Fri 7 PM` → `Friday 7 PM` for the card labels), the week-card line.
3. `home/HomeEmpty.tsx` (11.9.2), `home/PersonRow.tsx`, `home/ClubRow.tsx`.
4. `home/YourWeek.tsx` (11.2).
5. `home/MessagesHome.tsx` (11.1): the three parallel reads, the 30-s / 5-min
   rules, the layout, the states.
6. `MessagesMobile.tsx`: `MessagesMobile` becomes the fork of 2.1; the old body
   moves verbatim into `MessagesMobileV1` (same file, ADDED to the checker,
   text unchanged); `MessagesMobileV2` (same file) = the flag-on shell of 11.10:
   the `open` state, `?channel=` through the thread GET, `?to=`, `?tab=`, the
   history rules of 2.3 (R1–R3 of S2-notes honoured), compose, refetch on close.
   MOVE-2: the header comment reworded. MOVE-1 (the vaul note) left where it is.
7. `CampusMobile.tsx` per 2.2 (the `null` gate, the `true` redirect, no chat
   pane / drawer / view with the flag on); lint parity against `a9355d1`.
8. `S1-contrast.md` (a node script computes every pair, both themes).
9. Gates, `S1-gate.md` part 2, the last commit.

### Decisions (each against the contract's text; STOPPED holds the contradictions)

- **History split with S2 (2.3 "the ONE popstate handler").** `ClubSpace`'s props
  are pinned to S2's first commit (`{ orgHandle; initialRoomId; initialRoomKind;
  onClose }`, no callback), so the shell cannot close the event chat layer inside
  it. Built as S2's R1–R3: the shell's `popstate` handler closes the depth-1
  layer (a space or a dm) on `depth < 1` and does nothing on `depth >= 1`; the
  event layer (depth 2) is pushed and popped by `ClubSpace` (S2's decision);
  for an event-room deep link the shell writes `replaceState` depth 1 then
  `pushState` depth 2 (R2) before mounting `ClubSpace`. The state shape is
  2.3's exactly: `{ vibeChat: <room id>, depth: n }`.
- **Back with nowhere to go.** 2.3 says Back is `history.back()`. In a fresh tab
  (a push tap with no earlier entry, `history.length <= 1`) that is a no-op and
  the view would never close; the shell then closes in place and
  `replaceState`s `/messages`. A fallback the contract does not cover, not a
  deviation from it.
- **`?tab=` on arrival** is read with `useSearchParams()` (the page is dynamic:
  it awaits `searchParams` and cookies, so no Suspense bailout; the build gate
  proves it). A filter change `replaceState`s the depth-0 entry's URL
  (`/messages` or `/messages?tab=<f>`), so the URL after the last close is 2.3's.
- **The deep link's body is read twice** until S2 adds `initialPage?` (its R4 /
  STOPPED 6): the shell's resolving GET decides the view; `ClubSpace` reads the
  room again. Recorded under REQUESTS.
- **`You:` needs no viewer id**: `members` are "all non-viewer members"
  (`threads/route.ts:68`), so in a group an author not in `members` is me; in a
  dm an author who is not `peer` is me. A dm peer's line has no name prefix (the
  mockup, `W0_Home:75,159`); a group's other member is `<Name>:`.
- **The Requests filter's rows are today's `ThreadRow`** (11.1 "today's rows").
- **The week card's club is opened by `org.handle`** from the calendar entry; a
  card with `room_id` set and `org` null (cannot happen: no room without
  membership, and `org` is null only for a private club I left) resolves through
  the thread GET like a deep link.

### Log
- 2026-09-30T08:24:00Z part-2 plan written; starting week.ts
- 2026-09-30T08:24:29Z week.ts + week.test.ts (7 pass), home/home-rules.ts + home-rules.test.ts (10 pass) written; committing step 1
- 2026-09-30T08:24:30Z COMMITTED 22d920e feat(chat): week range and the home's pure rules (wave 2, W2-S1); starting home/HomeEmpty.tsx, PersonRow.tsx, ClubRow.tsx
- 2026-09-30T08:32:40Z home/HomeEmpty, PersonRow, ClubRow, YourWeek, MessagesHome written; tsc (filtered) clean, eslint clean on home/ after wrapping the effect reads in a local async (the compiler rule flags a useCallback that sets state when called from an effect body directly). Baselines at a9355d1: CampusMobile 4 errors (set-state-in-effect 282, 434, 630, 3990), MessagesMobile 2 errors (immutability 151, set-state-in-effect 204). Starting MessagesMobile.tsx
- 2026-09-30T08:34:50Z COMMITTED 92a0810 feat(chat): Messages home, Your week, club and person rows, no-clubs state (wave 2, W2-S1)
- 2026-09-30T08:34:50Z COMMITTED 005020d feat(chat): the flag fork, deep links and history on /messages (wave 2, W2-S1); MessagesMobile.tsx eslint = the two old errors only (immutability, set-state-in-effect, both inside MessagesMobileV1); starting CampusMobile.tsx (2.2)
- 2026-09-30T08:35:47Z COMMITTED 048cb1f feat(chat): CampusMobile with the flag on (wave 2, W2-S1); eslint = the four old set-state-in-effect errors only (282→314, 434→466, 630→662, 3990→4026, +32 lines); starting S1-contrast.md and the gates
- 2026-09-30T08:50:00Z COMMITTED b47a72b feat(chat): coral mark on the live surfaces, the S1 contrast table (wave 2, W2-S1). typecheck exit 0; npm test 1614/1614; eslint over every S1 file = the baseline set only; build running

### STOPPED (part 2; each a contradiction between the contract and the code on the branch, or inside the contract; built as written here, nothing improvised beyond it)

10. **2.3 / 11.10 "the ONE `popstate` handler" and "the resolving read's body
    is handed to `useRoomPoll` as `initialPage`" vs 11.3's pinned `ClubSpace`
    props** (`{ orgHandle; initialRoomId; initialRoomKind; onClose }`, no
    history callback, no `initialPage`; S2's first commit, which S1 builds
    against). The shell cannot reach the event chat layer inside `ClubSpace`
    nor hand it the page. Built as S2-notes.md R1–R3: the shell's handler
    closes the depth-1 layer on `depth < 1` and ignores `depth >= 1`;
    `ClubSpace` pushes / pops depth 2 itself; for an event-room deep link the
    shell writes `replaceState` depth 1 + `pushState` depth 2 before mounting.
    The deep-linked room is read twice (the shell's resolving GET, then the
    hook's first read) until an `initialPage?` prop exists (REQUESTS).
11. **1.2 "the unread pill" on a person / group row.** `GET /api/me/threads`
    sends `unread: boolean` and no count (`threads/route.ts:76`, the
    `ThreadEntry` type); the mockup's `2` has no source. Built: the pill
    (coral, 20px) with no number; the row's label says `unread`.
12. **11.1's chip text `<Sat> · <title>` "with `eventTimeShort`"** —
    `eventTimeShort` answers `Sat 2 PM` (1.4), never `Sat` as the mockup
    draws (`W0_Home:130`), and for a TOMORROW event it answers `7 PM` alone
    (1.4 drops the `Tomorrow` prefix), so the chip then reads `7 PM · Fright
    Night` with no day. Built with the pinned function; the row label's
    event clause is `<title> <spoken time>` (`Build Night Saturday 2 PM`; the
    1.2 example `Build Night Saturday` names a day the function does not
    give alone).
13. **1.2's club row labels** give examples without a time clause and then
    say "the row's time is spoken with `rowTimeSpoken`". Built: the spoken
    time as the LAST clause, after `pinned` (`Salsa Club, unread Board post,
    Fall Formal is live now, you're going, 8:41 PM`); the examples' clauses
    are unchanged.
14. **Contrast (11.0) vs the coral text token on tinted surfaces.** Coral
    TEXT (`#C8401E`) on the live week card's `#FFE9E0` is 4.27:1 and on the
    live chip's `rgba(255,92,53,0.14)` tint 4.01:1 in Light. 11.0's own
    coral MARK token is "for a tinted surface", so those two texts use
    `coralMark` (`#B5381A`, 5.07 / 4.76). The coral dots on cream (a mark, not
    text) are 2.88:1 against 3:1; each sits beside its word or label.
    S1-contrast.md holds every pair.
15. **2.1's bare header "and the pencil"** while the flag is unknown: the
    compose overlay belongs to a list that does not exist yet. Built: the
    same pencil, `role="button" aria-disabled="true"`, no handler, for the
    one request's worth of time the flag takes.
16. **Not a stop, a reading:** `page.tsx` passes `to` and `channel` only, so
    `?tab=` (2.3) is read on the client with `useSearchParams()` in the
    flag-on shell (the page is dynamic; the build gate proves no Suspense
    bailout). `page.tsx` is not S1's.
17. **11.1's failure placement.** "`inbox` failing alone → `LoadFailed`
    (`Couldn't load your clubs.`) in the list's club position while threads
    still list": with `All` active clubs interleave with threads, so the box
    sits at the top of the list; threads failing alone (not written) mirrors
    it (`Couldn't load your messages.` at the top, clubs still listed); both
    failing → the one box.

### REQUESTS (to the integration review / W2-S2)

- To W2-S2: `initialPage?: ThreadMessagesResponse` on `ClubSpace` (S2's own R4
  / STOPPED 6). `MessagesMobileV2` holds the resolving read's body at the
  point it mounts `ClubSpace` (`run()` in the `?channel=` effect) and will
  pass it in one line when the prop exists.
- To W2-S2 (confirming R1–R3 are honoured here): the shell never closes on a
  `popstate` whose `depth >= 1`; for an event-room deep link it writes
  `{ vibeChat: <room>, depth: 1 }` then `{ vibeChat: <room>, depth: 2 }` on
  the same URL before mounting, so `ClubSpace` must read `history.state` and
  not push a second depth-2 entry; the space's `onClose` is the shell's
  `history.back()` (or an in-place close in a fresh tab).
- To the integration review: the props S1 defined for the siblings are
  unchanged from the first commit (`palette`, `SERIF`, `FONT`,
  `clubGradient`, `personColor`, `useChatV2`, `useHideTabBar`); the new
  `home/*` exports are consumed by `MessagesMobile` only. `MessagesHome`'s
  props: `{ filter, onFilter, refreshKey, onThreads, onOpenClub, onOpenThread,
  onOpenRoom, onCompose }`.

### SIBLING

- None: `npm run typecheck` exit 0 repo-wide on the first run.
- 2026-09-30T08:40:19Z build exit 0 (no warning naming an S1 file); S1-gate.md part 2 written; STOPPED 10-17, REQUESTS, SIBLING written; last commit

## Part 3 — the repair after review (one pass; S1-review-{contract,security,behaviour,design}.md)

Resumed on `e8435f9`. Every finding verified against the tree, the contract
and the mockup before a decision; the table is in `S1-repair.md`.

### Plan (S1 files only)

1. `home/YourWeek.tsx`: drop the `className` (CONTRACT-1 / BEHAVIOUR-3 /
   DESIGN-1); the card's line 1 truncates the time first, the RSVP mark and
   its word never shrink (DESIGN-5).
2. `home/HomeEmpty.tsx`: `you&#39;re` (CONTRACT-3 / DESIGN-2); `flexGrow: 1`
   in place of `minHeight: 380`, with the list section a flex column and the
   main's `minHeight` minus the tab bar (DESIGN-4).
3. `home/ClubRow.tsx`: the time brightens on an unread Board post only
   (DESIGN-3, the mockup's rule).
4. `home/home-rules.ts` + test: `You:` only when provable (BEHAVIOUR-2).
5. `home/MessagesHome.tsx`: the list timer counts 30 s from the last read;
   the calendar reads on mount and on return to visible only (CONTRACT-2 /
   SECURITY-1 / BEHAVIOUR-6); the Requests count pill on the active chip is
   the chip's own ink at .12 (DESIGN-6); the list section a flex column.
6. `MessagesMobile.tsx`: `noBackRef` decided when the deep link opens
   (BEHAVIOUR-1, HIGH); the seq bumped by every open / close (BEHAVIOUR-4);
   a forward `popstate` onto a stale layer entry with nothing open resets
   the URL (SECURITY-3).
7. `CampusMobile.tsx`: the redirect keys on `chatWanted` (SECURITY-2); the
   chat section stays (as a skeleton) while `tab === "chat"` so the pane
   under the strip is not the Map's for a frame (BEHAVIOUR-5).
8. `S1-contrast.md`: the active Requests pill row recomputed.
9. Gates, `S1-gate.md` part 3, `S1-repair.md`, the commit.

### Decisions (part 3)

- **`palette().scrim` in Light** (CONTRACT-4): `rgba(20,20,22,0.35)` is S1's
  own choice (the Light ink at .35; no Light tray / sheet mockup exists);
  Night's `rgba(8,7,7,0.5)` is MK:0.1's. The token is additive to 11.0's list.
- **`You:` in a group** (BEHAVIOUR-2): `GET /api/me/threads` sends no viewer
  id and `members` omits anyone who left, so an author outside `members` is
  me OR a departed member; the preview shows the text alone then (today's
  `ThreadRow` shows no prefix either). In a dm `You:` is provable when `peer`
  exists; a dm with `peer: null` shows the text alone. See STOPPED 18.
- **The Requests count on the active chip** (DESIGN-6): no mockup draws it;
  the pill is the active chip's own ink at .12, the same rule the inactive
  pill uses with the page's ink (`rgba(var(--scrim-rgb),0.12)`).

### Log
- 2026-09-30T09:59:48Z part-3 plan written; starting YourWeek.tsx
- 2026-09-30T10:01:44Z code edits done: YourWeek, HomeEmpty, ClubRow, home-rules (+test), MessagesHome, MessagesMobile, CampusMobile; running the pure tests and eslint
- 2026-09-30T10:02:52Z pure tests 22/22, eslint = the baseline six only (MessagesMobile :523 :576, CampusMobile :316 :468 :664 :4030), typecheck exit 0; S1-contrast.md row updated; build running in the background; npm test next
- (see the timestamps above) typecheck exit 0; npm test 1637/1637; npm run build exit 0 (no warning naming an S1 file); eslint parity exact

### STOPPED (part 3)

18. **1.2 "the preview `You: …`" on a GROUP row vs the list's payload.**
    `GET /api/me/threads` sends no viewer id, and `members` holds the current
    members other than me (`threads/route.ts:584-592`, `.neq("user_id",
    user.id)`), so an author outside `members` is either me or a member who
    left: `You:` cannot be proven for a group (S1-BEHAVIOUR-2). Built: `You:`
    in a dm when `peer` exists and the author is not `peer`; the text alone
    for a group author outside `members` and for a dm with `peer: null`
    (today's `ThreadRow` shows no prefix at all). A `viewer_id` (or a
    `last_message.mine` flag) on the list would restore `You:` for groups —
    a W2-B4 / integration-review question, not S1's file.

### REQUESTS (part 3)

- To W2-S2 (S1-BEHAVIOUR-7): after the event layer closes (its `popstate`
  close and `closeEvent`), `ClubSpace` should `replaceRoomHistory(pickedRoomId
  ?? initialRoomId)` once `pickedRoomId` is known, so a space reached through
  a week card or an event-room deep link is not left under
  `/messages?channel=<event room>` (a reload there re-opens the layer). The
  shell cannot do it: the calendar entry carries no Lounge id.
- 2026-09-30T10:04:26Z S1-gate.md part 3, S1-repair.md, STOPPED 18, REQUESTS written; committing
- 2026-09-30T10:04:46Z COMMITTED bcf72aa fix(chat): W2-S1 repair after review. Repair pass closed.
