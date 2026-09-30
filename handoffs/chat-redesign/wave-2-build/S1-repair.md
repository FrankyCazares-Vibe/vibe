# W2-S1 repair after review (one pass)

Repaired on the branch at `e8435f9` against `S1-review-contract.md`,
`S1-review-security.md`, `S1-review-behaviour.md`, `S1-review-design.md`.
Every finding was checked against the tree, the contract
(`wave-2-contracts.md`) and the mockup before the decision. Files touched:
S1's only (13.2). Commit: `fix(chat): W2-S1 repair after review`.

## Findings

| finding | severity | decision | one line |
|---|---|---|---|
| S1-BEHAVIOUR-1 (`closeLayer` uses `history.length`) | HIGH | FIXED | Real: after the event layer's Back the forward entry keeps `length` at 2, so a fresh-tab deep link's space could never close. `noBackRef` is decided when the deep link opens (`history.length <= 1`), cleared by every `pushState` open and by `closeInPlace`; `closeLayer` goes back only when the ref is false. `MessagesMobile.tsx`. |
| S1-BEHAVIOUR-2 (`You:` by elimination) | MEDIUM | FIXED | Real: `members` omits anyone who left (`threads/route.ts:584-592`), a dm with `peer: null` read `You:` on every line. `personPreview` asserts `You:` only in a dm with a `peer`; a group author outside `members` and a null-peer dm show the text alone. Test cases added (departed member, null peer). STOPPED 18 records the contract gap for groups. |
| S1-CONTRACT-1 / S1-BEHAVIOUR-3 / S1-DESIGN-1 (`className` on the card row) | MEDIUM | FIXED | Real (11.0 "no `className`"); the line is deleted, the inline `scrollbarWidth: "none"` stays. `YourWeek.tsx`. |
| S1-CONTRACT-3 / S1-DESIGN-2 (curly apostrophe) | LOW / MEDIUM | FIXED | Real: 1.2 line 79 has the ASCII apostrophe (checked by bytes); `you&#39;re` now renders exactly 1.2's string. `HomeEmpty.tsx`. |
| S1-CONTRACT-2 / S1-SECURITY-1 / S1-BEHAVIOUR-6 (the calendar on the 30-s tick; the list cadence) | LOW ×3 | FIXED | Real: the interval's `tick` also read the week, and a close's refetch pushed the next list read to the second tick. The week reads on mount and on return to visible (5-min guard) only; the list timer is a timeout re-armed by every list read, so the 30 s count from the last read. `MessagesHome.tsx`. |
| S1-SECURITY-2 (redirect keyed on `tab`) | LOW | FIXED | Plausible race (the track's `onScroll` after the pane leaves the order); the effect now keys on `chatWanted` (the URL), which is 2.2's own condition. `CampusMobile.tsx`. |
| S1-SECURITY-3 (Forward onto a stale layer entry) | LOW | FIXED | Real: the URL showed `?channel=<id>` with nothing open. `onPop` with `depth >= 1` and nothing open `replaceState`s the home's URL. `MessagesMobile.tsx`. |
| S1-BEHAVIOUR-4 (a resolving read lands over a user's open) | LOW | FIXED | Real: `deepLinkSeqRef` is now bumped by `openView`, `closeInPlace` and the `popstate` close, so an older lookup drops its answer. `MessagesMobile.tsx`. |
| S1-BEHAVIOUR-5 (the Map pane under the strip for a frame) | LOW | FIXED | Real: with `tab === "chat"` and the flag `true` the chat section vanished before the redirect landed. The section stays (a `ListSkeleton`, never `ChatPane`) while `tab === "chat"`; with the flag `true` on any other tab it is not rendered, as 2.2 says. `CampusMobile.tsx`. |
| S1-BEHAVIOUR-7 (the space left under `?channel=<event room>`) | LOW | DEFERRED | Real, but the fix is in `ClubSpace.tsx` (W2-S2): written under REQUESTS (part 3) in `S1-notes.md`. |
| S1-DESIGN-3 (the club row's time brightens for `N new`) | LOW | FIXED | Real: the mockup brightens the time for an unread Board post only (`W0_Home:101,126` vs `:141`); `color: club.board.unread ? secondary : muted`. `ClubRow.tsx`. |
| S1-DESIGN-4 (the no-clubs block is a 380px box) | LOW | FIXED | Real: the mockup's section is `flex-grow: 1` in a column that ends at the (in-flow) tab bar. `HomeEmpty` is `flexGrow: 1`, the list section a flex column, the main's `minHeight` is `100dvh` minus the fixed tab bar (64px + the safe area, `globals.css:2811`); the body is `var(--cream)` so nothing shows through. `MessagesHome.tsx`, `HomeEmpty.tsx`. |
| S1-DESIGN-5 (the RSVP mark clips before the time) | LOW | FIXED | Real: `Sat 11:30 PM · ✓ Going` overflows 122px. The time is a `minWidth: 0` + ellipsis span; the separator and the RSVP mark are `flexShrink: 0`. `YourWeek.tsx`. |
| S1-DESIGN-6 (the count pill on the active chip) | LOW | FIXED | Real (a same-colour tint); no mockup draws it, so the pill is the active chip's own ink at .12 — the rule the inactive pill already uses with the page's ink. Ratios recomputed in `S1-contrast.md` (13.48 / 12.48 for the number). `MessagesHome.tsx`. |
| S1-CONTRACT-4 (the `scrim` token's Light literal) | LOW | FIXED (docs) | Recorded under Decisions (part 3) in `S1-notes.md`: Night is MK:0.1's, Light `rgba(20,20,22,0.35)` is S1's choice, the token is additive. No code change. |
| S1-CONTRACT-5 (the build at review time) | LOW | REJECTED (nothing to fix) | The failure was S3's uncommitted test imports (TS5097), outside S1; S3 committed since (`177974d`), and this pass's build is exit 0 on the first run. |

REJECTED as wrong: none — every finding held on inspection (CONTRACT-5 is
rejected only as an S1 defect; the review itself says so).

## Gates (this pass; `S1-gate.md` part 3 has the commands)

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1637 / 1637 pass |
| `node --test` (week, home-rules, avatar) | 22 pass |
| `npm run build` | exit 0, first run, nothing naming an S1 file |
| `npx eslint` new files | exit 0 (the one pre-existing `layout.tsx:95` warning) |
| `npx eslint` `MessagesMobile.tsx` + `CampusMobile.tsx` vs `a9355d1` | the baseline six only (523, 576; 316, 468, 664, 4030); 0 new |
