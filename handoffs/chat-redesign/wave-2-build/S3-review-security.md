# W2-S3 review — lens "security"

Reviewed: commits `65c38ed`, `177974d`, `db5cb2c`, `e8435f9` (`git diff a9355d1 -- src/components/mobile/messages/cards src/components/mobile/messages/compose`), `S3-notes.md`, `S3-gate.md`, against contract 1.2 / 1.3 / 4.2 / 4.3 / 9.3 / 11.0 / 11.7 / 11.8 / 12 and the routes on the branch (`cards/route.ts:205-206` → `201 { ok, message }`; `vote/route.ts:156` → `{ ok, card }`; `events/[id]/rsvp/route.ts` → `{ ok: true }`; `space/route.ts:269` → `upcoming`). Gates re-run on the tree as found: `npx eslint cards/ compose/` exit 0; `node --test` the two rule tests 23/23; `npm run typecheck` exit 0.

Verdict: **PASS with two LOW findings.** No HIGH, no MEDIUM. Nothing optimistic, no re-submit path from a sheet, no payload rendered as HTML, no names outside the payload's `voters`, no storage, no logging, ids encoded.

## Findings

### S3-SECURITY-1 — LOW — the sheet can be closed while its POST is in flight, so a second sheet can post a second card
- where: `src/components/mobile/messages/compose/CardSheet.tsx:151-153` (`onOpenChange` → `onClose`) and `:185-189` (the X), neither reads `posting`.
- what: the CTA is disabled and `doneRef` stops a second tap from the SAME sheet (11.7, N8 — holds). But the X, the scrim and vaul's drag still close the sheet while `posting` is true. The user then reopens the tray, fills a new sheet and posts again; the first POST completes on its own (`onPosted` → `append`) and two cards exist. Within the contract's wording ("never re-submitted from the same sheet"), so LOW; a duplicate, not a leak.
- fix: in `CardSheet`, ignore a close while a request is in flight: `onOpenChange={(open) => { if (!open && !posting) onClose(); }}`, and on the X `onClick={() => { if (!posting) onClose(); }}` with `aria-disabled={posting || undefined}`. Same chrome, one extra guard.

### S3-SECURITY-2 — LOW — `maxLength` caps UTF-16 units while the counter and the route count code points
- where: `compose/NewPollSheet.tsx:93` and `:120`, `compose/NewSignupSheet.tsx:114` and `:145`, `compose/ShareEventSheet.tsx:182` (`maxLength={200|80}`); `compose/CardSheet.tsx:294` (`n > max` coral).
- what: 4.2 counts code points (`Array.from(s).length`, mirrored by `charCount`). The inputs' `maxLength` counts UTF-16 units, so 100 emoji stop the input while the counter reads `100 / 200`; the counter's `n > max` colour can never fire. Stricter than the route, never looser (no security exposure), so LOW.
- fix: drop the `maxLength` attributes and let `pollValid` / `signupValid` / `eventValid` (already enforced, the CTA disabled past 200/80) and the coral counter carry the limit; or keep `maxLength` and note the counter's overflow branch is unreachable.

## STOPPED / SIBLING judgements

- STOPPED 1 (no reaction handler in the 11.8 props): **right.** 11.8's prose ("the same picker … reactions, Reply") contradicts the pinned signature, which carries neither. A pick sends no request and changes no state (`CardBubble.tsx:282`), the safe reading; the integration review adds `onToggleReaction?` / `onReply?` or accepts none in v1.
- STOPPED 2 (the Officers tray caption): **right.** 1.2 pins four captions and `RoomKind` has five kinds; `Add to <room name>` adds no new sentence.
- STOPPED 3 (the `content_blocked` line): **right.** 1.2 pins `That includes words that aren't allowed on Vibe` (= `contentBlockedResponse`'s `error`, `access.ts:134-144`); 11.0 routes every refusal through `toastSendFailure`, whose line for the code is `failure-copy.ts:196` `… Edit it and try again.` (the code is not in `REFUSAL_SENTENCES`). Building 1.2's exact sentence from `r.error` with `CONTENT_BLOCKED_LINE` as the fallback (`CardSheet.tsx:88`) is the safe reading; the server's `error` is a fixed string rendered as toast text.
- SIBLING: none recorded; none found (typecheck 0 on the tree as reviewed).

## Holds

- No optimistic vote: `PollCardView.tsx:51-69` and `SignupCardView.tsx:70-89` only call `onCard(messageId, next)` with the server's card; `mine` / `count` / `full` are never touched locally. `poll_closed` → `closedLocally` is 11.8's own rule. RSVP: `EventCardView.tsx:68-83` sets nothing; `viewer_status` changes only through `onRefresh(created_at)` after a `{ ok: true }`.
- No re-submit after a 503: `CardSheet.tsx:66-69, 102-106` (`doneRef` before `onReload`); the sibling's `onReload` is `setSheet(null); poll.reload()` (`RoomComposer.tsx:333-336`), so the sheet closes as 11.7 says. `onPosted` closes too (`:328-331`).
- CTA disabled in flight: `CardSheet.tsx:136, 197-200, 221` (`aria-disabled`, the click guard, `Posting…`); the vote rows block every option while one is busy (`PollCardView.tsx:52, 80, 89`; `SignupCardView.tsx:71, 109, 115`); both RSVP pills while one is busy (`EventCardView.tsx:69, 123`).
- Bodies from cleaned state, 4.2's numbers: `sheet-rules.ts:60-68` (200 / 80 / 200 / 2–10 / 1–10 / 1–50), `cleanText` = the route's `collapse` (`body.ts:44`), `charCount` = its `chars`; `NewPollSheet.tsx:59-65`, `NewSignupSheet.tsx:68-72`, `ShareEventSheet.tsx:86-90` (`note` omitted when blank, as the route treats it); `event_id` only from the server's `upcoming`.
- No payload as HTML: every string is a JSX text node; no `dangerouslySetInnerHTML` / `innerHTML` in the batch (grep). `avatar_url` / `logo_url` in `url()` is the `MessageBubble.tsx:484, 649` pattern (a same-origin proxy URL; CSSOM takes one value, no declaration injection).
- Names only from `voters`: `PollCardView.tsx:81`, `SignupCardView.tsx:132`, `card-rules.ts:56-59, 150-153`; `+N` counts visible takers only; `voters_more` not drawn; the count may exceed the names (PRIVACY-L4).
- Anonymous polls: no discs (`PollCardView.tsx:81`), no names in the option label (`card-rules.ts:56`, tested `card-rules.test.ts:53-54`), none in the card label or the announcement.
- Ids encoded: `card-parts.ts:19`, `CardSheet.tsx:72`, `ShareEventSheet.tsx:66`, `EventCardView.tsx:71`.
- No `localStorage` / `sessionStorage`, no `console.*` in the batch (grep); no `name` attributes and `autoComplete="off"` on every input, no draft survives a close (11.7).
- Long-press: 500 ms, a 10 px drift cancels (`CardBubble.tsx:152-158`), `pointercancel` / `pointerup` / `pointerleave` clear it, the click that ends a fired press is swallowed in capture (`:179-184`). Never on a stub: both mounters filter `hidden` out of the array before routing by kind (`RoomThread.tsx:254, 310`; `BoardView.tsx:112`, `BoardPost.tsx:168, 192`), and a stub is `kind: "text"` (8.1) so it never reaches `CardBubble`.
- Focus trap and the tab bar: vaul `NestedRoot` (the `RsvpSheet.tsx:61` precedent) unmounts with the sheet; `useHideTabBar()` counts and releases on unmount (`use-hide-tabbar.ts:469-476`); focus returns to the "+" on unmount (`CardSheet.tsx:140-146`).
- Refusals: every code through `toastSendFailure` (`CardSheet.tsx:92-108`, `PollCardView.tsx:66`, `SignupCardView.tsx:86`, `EventCardView.tsx:78`), the one 1.2 exception under STOPPED 3.
- 11.0 shared rules in the batch: `"use client"` on every `.tsx`, inline styles only, `palette(night)` / `SERIF` / `FONT`, inputs 16px (`fieldStyle`), targets ≥ 44px (Close, X, stepper arms, Add, Switch, vote rows, pills, `Open event chat`, tray rows 72, share rows 66), no Discord words, no new dependency; ownership 13.2 respected (only `cards/*`, `compose/*`, the two docs).
