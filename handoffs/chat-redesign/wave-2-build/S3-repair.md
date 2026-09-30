# W2-S3 repair after the four reviews (one pass)

Repairer of `65c38ed`, `177974d`, `db5cb2c`, `e8435f9` (W2-S3), after
`S3-review-contract.md`, `S3-review-security.md`, `S3-review-behaviour.md`
and `S3-review-design.md`. Every finding was checked against the tree, the
contract (1.2, 1.3, 11.0, 11.7, 11.8, 14.34, 14.41) and the mockups before a
verdict; the D1 / D3 contrast claims were recomputed with a node script
(WCAG relative luminance, translucent layers blended over the surface).
Edits only in `messages/cards/*` and `messages/compose/*` (13.2); no moved
file touched (10.2 rule 5); no contract string, size, token, route, payload
field or code changed.

## Findings → verdicts

| finding | verdict | one line |
|---|---|---|
| S3-CONTRACT-1 / S3-DESIGN-2 (MEDIUM, `aria-modal`) | FIXED | Confirmed: `grep -c aria-modal` is 0 in Radix dialog's and vaul's dist. `aria-modal="true"` on `<Drawer.Content>` (`CardSheet.tsx`). |
| S3-CONTRACT-2 / S3-BEHAVIOUR-1 (MEDIUM, `poll_closed` at 70 %) | FIXED | `closedLocally` dropped in both views; `poll_closed` → `onCard(messageId, { ...card, closed: true })`, so the footer, the label, the taps and the bubble's 70 % all read `card.closed`. |
| S3-CONTRACT-3 (LOW, `showAppearLine`'s third clause) | FIXED (docs) | The clause stays; the entry moved from "Decisions read from the contract" to STOPPED 4 (S3-notes part 3) for the integration review. |
| S3-CONTRACT-4 (LOW, `try_again` closes) | FIXED | `useCardPost` calls `onClose()` before `onReload()` on `try_again` (both `setSheet(null)` on the branch; the close is now the hook's own). |
| S3-SECURITY-1 (LOW, a close while posting) | FIXED | `CardSheet`: the X, the scrim and the drag are ignored while `posting` (the X `aria-disabled`); a second sheet cannot be opened over an in-flight POST. |
| S3-SECURITY-2 (LOW, `maxLength` in UTF-16 units) | FIXED | The five `maxLength` attributes dropped; the counter (coral past the limit) and `pollValid` / `signupValid` / `eventValid` (the CTA disabled) carry the code-point limit, as the route counts. |
| S3-BEHAVIOUR-2 (MEDIUM, timer not cleared on unmount) | FIXED | `useEffect` cleanup clears `longPressTimer` in `CardBubble` (hooks order unchanged, above the handlers). |
| S3-BEHAVIOUR-3 (MEDIUM, the picker's emoji row is dead) | DEFERRED | = STOPPED 1: the pinned 11.8 props carry no `onToggleReaction` / `onReply`; a contract change (REQUESTS 2). Until then a reaction on a card does nothing (named in the notes). |
| S3-BEHAVIOUR-4 / S3-DESIGN-5 (LOW, an identical text is not re-read) | FIXED | The one span stays; its text ends in a zero-width space on every other answer (`announce.n`), so `12 voted` → `12 voted` is a DOM change the reader speaks. No timers, no keyed re-mount of the live region. |
| S3-BEHAVIOUR-5 (LOW, `<n> spots` on a generic span) | FIXED | The number `aria-hidden` beside a visually hidden `spotsWord(n)` (`2 spots` / `1 spot`, 1.2's string unchanged). |
| S3-BEHAVIOUR-6 (LOW, `maxLength={80}` literal) | FIXED | Gone with S3-SECURITY-2 (no `maxLength` attribute remains). |
| S3-BEHAVIOUR-7 (LOW, `cardWord` / `cardAuthorName` untested) | FIXED | Both moved to `cards/card-rules.ts` (pure); two tests (16 in the file, 25 in the batch); `CardBubble` imports them. Nothing else imported them from `CardBubble` (grep). |
| S3-DESIGN-1 (MEDIUM, `Your pick` / the picked count in Light) | FIXED | Recomputed: `#C8401E` on the `.16` bar over white (`#FFE5DF`) = 4.16:1; `t.coralMark` `#B5381A` = 4.94:1 on the bar, 5.92:1 on white; Night unchanged (`#FF8A66`, 5.61:1). Both spans now `t.coralMark`. |
| S3-DESIGN-3 (MEDIUM, the band name runs into the coral end) | FIXED, wider than asked | Real, and the review's 176px is not enough: with the peach radial (`rgba(255,196,128,0.55)` at 92 % 0 %, 150×90) blended in, `#FAF7F2` at y = 24 is 4.84:1 at x = 200, 3.97:1 at x = 217 (the review's end), 2.68:1 at 268. The name now ends by 197px (`maxWidth: 156` from x = 41) ≥ 4.9:1. `Salsa Club` (the mockup) is unaffected. |
| S3-DESIGN-4 (LOW, the nested root scales the club space) | DEFERRED | Accepted on `RsvpSheet` by the S2 design review; the integration review records one answer for both sheets. No S3 change. |
| S3-DESIGN-6 (LOW, a Light border literal) | FIXED | The card border is `t.hairline` (11.0's token; `.09` / `rgba(28,28,30,0.08)` against the mockup's `.08`, indistinguishable). The two Light shadows stay (Light is not drawn, MK:8). |
| S3-DESIGN-7 (LOW, chips clipped mid-name) | FIXED (layout) + DEFERRED (rule) | Chips now sit on one 20px line with `flex-wrap` and the overflow hidden: a chip that does not fit drops whole to a hidden line, so nothing is cut mid-name, in both layouts. The count rule (`+N` past 3 visible) is pinned; the "2 then `+N` on a single-line row" question goes to the integration review (REQUESTS 3). |
| S3-DESIGN-8 (LOW, the poll CTA 4px low) | FIXED | `ctaGap` on `CardSheet` (default 14); `NewPollSheet` passes 10 (`W0_NewPoll:156`). |
| S3-DESIGN-9 (LOW, the club dot never draws) | DEFERRED | REQUESTS 1 stands: `RoomComposer` (W2-S2) passes no `orgId`; not an S3 file. |

Rejected: none — every finding was verified as real (S3-DESIGN-3's number was
too small, not wrong).

## STOPPED / REQUESTS after the repair

- STOPPED 1–3 stand (a reaction on a card has no handler in the pinned
  props; the Officers caption; the `content_blocked` line).
- STOPPED 4 (new, from S3-CONTRACT-3): `showAppearLine`'s `state !== "closed"`
  clause is a change to a pinned rule; kept, for the integration review.
- REQUESTS 1 (`orgId` from `RoomComposer`), 2 (= STOPPED 1), 3 (new, from
  S3-DESIGN-7: the chip count on a single-line row).

## Gates (13.3), re-run on the repaired tree

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` (repo-wide) | exit 0 |
| tests | `npm test` | 1639 tests, 1639 pass, 0 fail (2 new in `cards/card-rules.test.ts`) |
| build | `npm run build` | exit 0, first attempt, no collision |
| eslint | `npx eslint --max-warnings 0 src/components/mobile/messages/cards/ src/components/mobile/messages/compose/` | exit 0, 0 errors, 0 warnings |

No moved file edited, so no rule-by-rule baseline compare against `a9355d1`
was owed; no SIBLING entry (typecheck was clean repo-wide on this run). No
new npm dependency.
