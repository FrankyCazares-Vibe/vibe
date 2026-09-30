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
