# Integration repair (wave 2, 2026-09-30)

Repairer: cloud session (no database, no browser); branch
`claude/relaxed-davinci-9d11h3`, from `b3381af` (main `5c68da1`). One pass
over the six integration reviews (`integration-adjudicate.md`,
`-flag-off.md`, `-producer-consumer.md`, `-old-renderers.md`,
`-security.md`, `-gates.md`). Rule applied: every HIGH / MEDIUM verified in
the code and fixed where the contract's stated outcome was not met (a
contract STRING / SIZE / TOKEN / CODE never changed); LOW fixed when it was
one edit; a finding whose only remedy is contract text → TO AMEND (no code);
DEFERRED only what `integration-adjudicate.md` marked AFTER LAUNCH; REJECTED
with evidence. Ten code commits, each named for its finding (§3), then this
record with the six reviews.

## 1. Finding → outcome (one line each)

### integration-adjudicate.md (§7, the FIX NOW rows; §1, the decisions)

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-ADJUDICATE-1 (VIS-X-1, the week bloom) | HIGH | **FIXED** `6db5cc1` | `home/YourWeek.tsx`: `overflowX: "clip"` on the week `<section>` (the y axis stays visible); the layout viewport stays 375 wide, the composer's "+" is on the phone. The harness clip of `visual/run2/clip/` is this exact rule. |
| INT-ADJUDICATE-2 (S3 STOPPED 1, the card picker) | HIGH | **FIXED** `09e6cc4` · TO AMEND 11.8 | `cards/CardBubble.tsx` gains `onToggleReaction?(emoji)` / `onReply?()` (additive): a pick toggles the reaction, Reply shows; the chips under a card as under a text bubble (INT-PRODUCER-CONSUMER-2's first option, so a placed reaction is visible). `RoomThread` passes the text bubble's two (a quote); `BoardView` → `BoardPost` passes the reaction (today's flow moved to `club/reactions.ts`, one helper for both) and Reply OPENS THE FOLD with the field focused (a Board reply is never a quote). |
| INT-ADJUDICATE-3 (VIS-S2-2, the Board's card) | MEDIUM | **FIXED** `09e6cc4` · TO AMEND 11.8 | `layout?: "bubble" \| "post"` (default bubble); `"post"`: no avatar column, no header line, `width: 100%`, radius 14, no tail; press, picker, chips, live region unchanged. `BoardPost` passes `layout="post"`. |
| INT-ADJUDICATE-4 (VIS-S3-1, the club dot) | MEDIUM | **FIXED** `9584630` | `RoomComposer` gains `orgId?: string \| null` and hands it to `ComposeSheets`; `ClubSpace` passes `org.id`, `EventChat` `club.id`; every sheet's `<club> · <room>` line draws the 14px dot. |
| INT-ADJUDICATE-5 (S2 R4, the room read twice) | MEDIUM | **FIXED** `09ae1db` · TO AMEND 11.3, 11.6 | `ClubSpaceProps.initialPage?` (additive); `MessagesMobile` keeps `r.data` on the club view (both resolving reads; `openRoom` only when `messages` is an array) and passes it; `ClubSpace` hands it to `useRoomPoll` when the hook's room is `initialRoomId` (the hook reads it once, at its mount); a deep-linked event room's page goes to `EventChat`'s hook (`EventChatProps.initialPage?`) ONCE — every later `openEvent` is counted and reads afresh. One thread GET on arrival (2.3 / 9.3 / SCREENS-L10). |
| INT-ADJUDICATE-6 (VIS-S3-3, the "+") | LOW | **FIXED** `2497417` | Open: the disc takes `t.activeChip` (bg / ink and border), the rotation kept; the transition covers background and colour. |
| INT-ADJUDICATE-7 (S2 R6, four tokens) | LOW | **FIXED** `eb383c6` · TO AMEND 11.0 | `Palette` gains `fieldBorder`, `chipBorder`, `dashedBorder`, `raisedSurface`. **Values as built** (the code's own literals, S2-DESIGN-6 — not the adjudicate's parenthetical `.08 / .18 / .06`, which were not what the files carried): Night `rgba(255,255,255,0.10)` / `rgba(255,255,255,0.12)` / `rgba(255,255,255,0.22)` / `rgba(22,21,21,0.86)`; Light `var(--hairline)` / `rgba(20,20,22,0.12)` / `rgba(20,20,22,0.22)` / `var(--paper)`. Eleven sites read them (`ClubSpace`, `EventChat`, `EventAbout`, `RoomComposer` ×2, `BoardPost`, `RoomChips`, `UpNext`, `CardTray`, `CardSheet`, `MessagesHome` ×2). No colour changed. |
| INT-ADJUDICATE-8 (B3-BEHAVIOUR-1, the `gt` margin) | LOW | **FIXED** `90fde7d` · TO AMEND 12.1 | `messages.html:1440` `const gc=gb&&lastSenderId!==null?' gt':'';`; `_miniMessenger.js:771` `const gc = gb && lastSender !== null ? " gt" : "";` (`lastSenderId` / `lastSender` are written on every visible row, `:1527` / `:842`). Flag-off surface: row 1's remit; 12.1 → three lines per static file. |
| INT-ADJUDICATE-9 (B4-SECURITY-1, own removed row as a preview) | LOW | **FIXED** `e4505c7` · TO AMEND 7.1.4, 7.1.7, 7.2.4 | `inbox/route.ts`: `.is("removed_at", null)` on the two preview windows and the event-activity read; `reads.ts` `lastShown` skips `removed !== null`. Tests: the filters asked on all three reads; an own-removed last Board post is not `board_latest`. |
| INT-ADJUDICATE-10 (VIS-S1-3, the Retry ink) | LOW | **FIXED** `d3dc4f0` · TO AMEND section 0 (a footnote) | `LoadFailed.tsx:126` `color: "#140806"` (11.0's coral-button ink). **Ratio 6.40:1** on `#FF5C35` (the adjudicate's "≈ 9.6:1" was off; `#FAF7F2` was 2.88); a `Retry` note in `S1-contrast.md`. App-wide, both tones — the old screens' Retry keeps its coral pill with dark ink like every other coral button. |
| A10 (`You:` on a group row; INT-FLAG-OFF-6, INT-PRODUCER-CONSUMER-6) | LOW | **DEFERRED** (§3 L1) | The adjudicate marked it AFTER LAUNCH. The after-launch shape that keeps the flag-off answer byte-identical is INT-FLAG-OFF-6's: `viewer_id` on the `?scope=chats` answer only. |
| A17 (`clubRole` on a failed author-role read; INT-SECURITY-2, B3-CONTRACT-3) | LOW | **DEFERRED** (§3 L2) | The adjudicate marked it AFTER LAUNCH; the change amends 6.1 step 8. INT-SECURITY-2's six-line form (the author's role on the route's own service client, `authorErr` → 503 `try_again`) is the smaller shape and the one to take then. |
| A28 (a TEXT Board post / a reply has no picker; INT-SECURITY-1, S2 STOPPED 11) | MEDIUM | **DEFERRED** (§3 L3, before Oct 26) | The adjudicate marked it AFTER LAUNCH — before `CHAT_V2_ALLOWLIST=*`; 11.4 is silent, so the fix needs an amendment first (a long-press hook shared with `CardBubble`, the picker on the text branch and the reply rows, Report / Remove lifted through `BoardView`; INT-SECURITY-1's exact text). Not needed for Apple's reviewer (flag off). |
| A11 → INT-ADJUDICATE-10 | — | see above | — |
| A12–A16, A18–A27, A29–A40 (RATIFY) | — | **TO AMEND** (no code) | The code is right as each batch described; the exact sentences are `integration-adjudicate.md` §2, carried to the Amend stage unchanged: 9.4 (`reply_count: null`, never 503); 7.1.4 / 7.2.3 selects (`channel_id`, `created_at`); 13.2 ownership rows (`reads.ts` + tests → W2-B4; `rpc-refusal.ts` → W2-B2; `visual/**` → the visual pass; `integration-*.md` → the integration review); 6.1 step 1b (a non-uuid `[id]` → `ensureMember` 403); 12.1's `(messages ?? [])`; section 0 row 4 (403 `Not a member`, was 404); 2.3 / 11.10 history depths; 1.2 (no unread count on a person row; the club row's time last; `Add to Officers`); 11.1 (`Sat 2 PM · Build Night`; the failed box at the top under All); 11.0 (`coralMark` on tinted live surfaces; `scrim`; the `content_blocked` toast is the server's sentence); 2.1 (the pencil `aria-disabled`); 1.4 (four club gradients); 11.3 (a later 404 closes the view); 11.5 (`line?`, `hasEarlier`, `replace`, `remove`, `lostAccess`); 14.41 / 11.8 (`state !== "closed"`); section 7's soft-fail footnote. A27, A30, A34–A39: no amendment, recorded. |

### integration-flag-off.md

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-FLAG-OFF-1 (the fonts line, `layout.tsx:96`) | HIGH (cosmetic) | **TO AMEND** (option b; Franky's call recorded) | Verified: 213 old `fontWeight: 800` sites now render at a true 800 on every Next page. The contract itself orders the line (11.0, 13.1, 14.40), so the code is not reverted here; the Amend stage adds section 0 row 10 (the reviewer's sentence), strikes 11.0's "Desktop is unchanged (no desktop rule asks for 800)", adds the `LeftNav` / club-invite glance to 13.3 step 4, and 16.1's SCREENS-M3 row records the correction. If Franky wants (a) instead: restore `:96` to `5c68da1`'s string (`…0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap`) and take 14.40's alternative — the visual pass's shots are then wrong for weight only. |
| INT-FLAG-OFF-2 (= B3-BEHAVIOUR-1) | MEDIUM | **FIXED** `90fde7d` | = INT-ADJUDICATE-8. |
| INT-FLAG-OFF-3 (the null-flag skeleton, the features call) | LOW | **TO AMEND** | The footnote under section 0's table, as written by the reviewer. No code. |
| INT-FLAG-OFF-4 (`chatWanted` reads the `tab` state) | LOW | **FIXED** `ebf6c3a` | `CampusMobile.tsx`: the MOUNT decision reads the URL alone (`urlChatWanted` = `?tab=chat` \|\| `?channel=`), so a tap to Chat on a plain `/campus` while the flag is `null` keeps today's `ChatPane` mounted; the flag-on REDIRECT keeps reading the tab as well as the URL (a superset of the reviewer's line: a tap during `null` that resolves `true` still lands on `/messages` instead of a tab the order dropped). Flag `false` unchanged either way. |
| INT-FLAG-OFF-5 (row 4 wording) | LOW | **TO AMEND** | = A16. No code. |
| INT-FLAG-OFF-6 (`viewer_id` on `?scope=chats` only) | LOW | **DEFERRED** (L1) | The adjudicate's AFTER LAUNCH stands; this is the shape to build then (no flag-off answer changes). |
| INT-FLAG-OFF-7 (`LoadFailed` ink → AFTER LAUNCH) | LOW | **REJECTED** as a deferral → FIXED under INT-ADJUDICATE-10 | The adjudicate marked the line FIX NOW and the brief's condition ("allowed if the old screens' Retry reads right with it by reading") is met by the adjudicate's reading (the pill keeps its coral, the word goes dark as every other coral button). The reviewer's point that section 0 lists no such change is right: TO AMEND — a footnote under section 0 ("the `LoadFailed` Retry pill's ink is `#140806` on every screen, 6.4:1; cosmetic"). |

### integration-producer-consumer.md

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-PRODUCER-CONSUMER-1 (`initialPage` has no producer) | MEDIUM | **FIXED** `09ae1db` | = INT-ADJUDICATE-5, including the `EventChat` arm. |
| INT-PRODUCER-CONSUMER-2 (the picked emoji dropped, no Reply, no chips) | MEDIUM | **FIXED** `09e6cc4` | = INT-ADJUDICATE-2; the chips ARE drawn (the review's first option); the Board's cards get reactions through the shared helper (its "lift it" option) and a Reply that opens the fold (not "no `onReply` on the Board": the row exists in the picker and does the Board's own reply). |
| INT-PRODUCER-CONSUMER-3 (`ComposeSheets.orgId` has no producer) | MEDIUM | **FIXED** `9584630` | = INT-ADJUDICATE-4 (`orgId?: string \| null`, the review's shape). |
| INT-PRODUCER-CONSUMER-4 (the Board's card in the Lounge chrome) | MEDIUM | **FIXED** `09e6cc4` | = INT-ADJUDICATE-3; radius 14 (the adjudicate's number), not 16. |
| INT-PRODUCER-CONSUMER-5 (own removed row as a preview) | LOW | **FIXED** `e4505c7` | = INT-ADJUDICATE-9. |
| INT-PRODUCER-CONSUMER-6 (`viewer_id`) | LOW | **DEFERRED** (L1) | = A10. |
| INT-PRODUCER-CONSUMER-7 (the `gt` margin) | LOW | **FIXED** `90fde7d` | = INT-ADJUDICATE-8. |

### integration-old-renderers.md

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-OLD-RENDERERS-1 (`gc` from the unfiltered index) | LOW | **FIXED** `90fde7d` (the `gc` token) · the `showAv` half **REJECTED** | The review's fix also rewrote `showAv` to `gb\|\|lastSenderId===null`. Not taken: on the first VISIBLE row `lastSenderId` is `null`, so `gb` (`senderKey !== lastSenderId`, or `last !== mine` with `last` null) is already true and `showAv` is right — `i===0` is redundant there, not wrong (the flag-off review says the same). One token per file; 12.1 amended to three lines, not four. |

### integration-security.md

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-SECURITY-1 (no Report / Remove on a text Board post or a reply) | MEDIUM | **DEFERRED** (L3, before Oct 26) | = A28: the adjudicate marked it AFTER LAUNCH (before the flag goes on for everyone) and 11.4 must be amended first; the review's exact fix (the shared long-press hook, the picker on the text branch and the reply rows, `onReportReply` / `onRemoveReply` through `BoardView`, the browser-walk line) is the text for L3. The Mac note in §4 carries it. |
| INT-SECURITY-2 (step 8 fails open on a failed author-role read) | LOW | **DEFERRED** (L2) | = A17; the review's six-line form is the one to take after launch (smaller than `{ role, failed }`). |
| INT-SECURITY-3 (own removed row as a preview) | LOW | **FIXED** `e4505c7` | = INT-ADJUDICATE-9, the review's exact lines. |

### integration-gates.md

| finding | sev | outcome | one line |
|---|---|---|---|
| INT-GATES-1 (13.3 names `MessagesMobile.tsx` alone for the four legacy hits) | LOW | **TO AMEND** 13.3 | Two of the four live in `messages/ComposeOverlay.tsx:87` and `messages/GroupSettingsView.tsx:33` since the split; the reviewer's parenthetical. No code. |
| INT-GATES-2 ("its psql first line stripped") | LOW | **TO AMEND** 13.3 | `--strip-psql` (the `\set ON_ERROR_STOP on` at `:57`). No code. |

## 2. TO AMEND — the list for the Amend stage (nothing here changed code beyond what §1 says)

1. **11.8** — `CardBubble` props gain `onToggleReaction?(emoji: string)`, `onReply?()`, `layout?: "bubble" | "post"` (the adjudicate's sentence, with: radius 14; the reaction chips under a card as under a text bubble; `RoomThread` wires the two as for `MessageBubble`; `BoardView` / `BoardPost` wire the reaction through `club/reactions.ts` and Reply opens the fold with the reply field focused).
2. **11.3** — props gain `initialPage?: ThreadMessagesResponse` (the adjudicate's sentence); **11.6** — `EventChat` takes `initialPage?` for a deep-linked event room, once.
3. **11.0** — the four tokens with the values of §1 (INT-ADJUDICATE-7); the Retry pill's ink (`LoadFailed`, app-wide, 6.4:1); the `coralMark` / `scrim` / `content_blocked` sentences of the adjudicate's §2.
4. **12.1** — three lines per static file (the `gt` line reads the last-sender state); `ConversationView`'s literal `(messages ?? [])`.
5. **7.1.4, 7.1.7, 7.2.4** — `removed_at is null` on the two windows and the event-activity read; `board_latest` = not `hidden` and `removed === null`; the 7.1.4 / 7.2.3 selects (`channel_id`; `created_at`); section 7's soft-fail footnote.
6. **Section 0** — row 4's clause (403 `Not a member`); the null-flag footnote (INT-FLAG-OFF-3); **row 10, the fonts line** (INT-FLAG-OFF-1 option b) with 11.0's "Desktop is unchanged" sentence struck and 13.3 step 4's glance; a footnote for the `LoadFailed` Retry ink (cosmetic, app-wide).
7. **6.1 step 1b**, **9.4**, **13.2**, **2.1**, **2.3 / 11.10**, **1.2**, **1.4**, **11.1**, **11.5**, **14.41 / 11.8** — the adjudicate's §2 sentences, verbatim.
8. **13.3** — INT-GATES-1 and INT-GATES-2's wording.
9. **Section 15 / after launch** — L1 (`viewer_id`, the `?scope=chats` shape), L2 (`clubRole` / the six-line form), L3 (Report / Remove on a text Board post and on replies, before Oct 26), L4 (the space route's later 404 and `?brief=1`, as 14.23).

## 3. The commits (all on the branch, none pushed)

| sha | subject |
|---|---|
| `6db5cc1` | fix(chat): wave-2 integration repairs — clip the week bloom to its section (INT-ADJUDICATE-1) |
| `09e6cc4` | fix(chat): wave-2 integration repairs — the card picker's reactions and Reply, the Board's post layout (INT-ADJUDICATE-2, -3) |
| `9584630` | fix(chat): wave-2 integration repairs — the club dot on the sheets' room line (INT-ADJUDICATE-4) |
| `09ae1db` | fix(chat): wave-2 integration repairs — the deep-linked room is read once (INT-ADJUDICATE-5) |
| `eb383c6` | fix(chat): wave-2 integration repairs — four chrome tokens on Palette (INT-ADJUDICATE-7) |
| `2497417` | fix(chat): wave-2 integration repairs — the "+" inverts while the tray is open (INT-ADJUDICATE-6) |
| `90fde7d` | fix(chat): wave-2 integration repairs — the static renderers' group-top margin reads the last sender (INT-ADJUDICATE-8) |
| `e4505c7` | fix(chat): wave-2 integration repairs — the viewer's own removed message is never a preview (INT-ADJUDICATE-9) |
| `d3dc4f0` | fix(chat): wave-2 integration repairs — the Retry pill's ink is the coral-button ink (INT-ADJUDICATE-10) |
| `ebf6c3a` | fix(chat): wave-2 integration repairs — CampusMobile keeps today's pane while the flag is unknown (INT-FLAG-OFF-4) |
| (this commit) | docs(chat): the six integration reviews and the repair record (wave 2) |

Files touched by the repair: `home/YourWeek.tsx`, `cards/CardBubble.tsx`, `club/{RoomThread,BoardView,BoardPost,RoomComposer,ClubSpace,EventChat,EventAbout,RoomChips,UpNext}.tsx`, `club/reactions.ts` (new; a subdirectory, outside the split checker's walk), `compose/{CardTray,CardSheet}.tsx`, `home/MessagesHome.tsx`, `messages/v2-tokens.ts`, `src/components/mobile/{MessagesMobile,CampusMobile}.tsx`, `src/components/feedback/LoadFailed.tsx`, `public/html/{messages.html,_miniMessenger.js}`, `src/app/api/me/inbox/route.ts`, `src/lib/chat/{reads.ts,reads.test.ts,reads-routes.test.ts}`, `S1-contrast.md`. Flag-off surface after the repair: rows 1 (the `gt` token, inside the stub filter's remit) plus the two cosmetic app-wide items the Amend stage records in section 0 (the fonts line, already on the branch; the Retry ink). `MessagesMobileV1` untouched; `MessageBubble.tsx` / `ReactionPicker.tsx` untouched.

## 4. The gates at `ebf6c3a` (13.3, cloud)

| gate | result |
|---|---|
| `npm run typecheck` | exit 0, no output |
| `npm test` | **1,639 / 1,639** green (115 files; the repair added assertions inside existing tests, no new test) |
| `npm run build` | exit 0, `✓ Compiled successfully in 17.1s`; no `error` / `warn` / `server-only` / `Suspense` line; the four new routes in the manifest (`/api/me/inbox`, `/api/me/threads/[id]/cards`, `…/cards/[messageId]/vote`, `/api/orgs/[slug]/space`), all `ƒ` |
| eslint over `git diff --name-only 5c68da1..HEAD` (104 `.ts/.tsx/.mjs` files) | 7 errors / 8 warnings, every one a legacy hit present at `5c68da1`: `CampusMobile.tsx` `react-hooks/set-state-in-effect` ×4 (lines 322/474/670/4036, moved by the repair's six comment lines; base ×4), `MessagesMobile.tsx` `react-hooks/immutability` 1 + `set-state-in-effect` 1 (base: 1 + 2, the other one in `ComposeOverlay.tsx:87` since the split) + `GroupSettingsView.tsx:33` warn (base `MessagesMobile.tsx:2855`), `campus-home.tsx` 6 warnings (base 6), `layout.tsx:95` `no-page-custom-font` (base). Rule-by-rule compare against `git show 5c68da1:<path> \| npx eslint --stdin`: `MessagesMobile.tsx` base `{immutability 1, set-state-in-effect 2, no-unused-vars(warn) 1}` → now `{1, 1}` + the two split children; `CampusMobile.tsx` base `{set-state-in-effect 4}` → now `{4}`. **0 new hits**; every repair file 0 hits. |
| `node tools/split-check.mjs --base 507d6b4` (exit 1 ignored, 10.3) | `51 declarations … 71 across`; **MISSING 0 · DUPLICATE 0 · CHANGED 5 = exactly `MessageRow`, `MessagesMobile`, `ConversationView`, `MessageBubble`, `ReactionPicker`** (the diff hints unchanged from the gates review: `hidden?`, the flag fork, the `shown` filter, `onRemove` ×2) · ADDED 20 = the same seven of `MessagesMobile.tsx` + `avatar.ts` (6) + `v2-tokens.ts` (7; `Palette` / `NIGHT` / `LIGHT` carry four more fields — ADDED is listed, not judged). The repair added no flat file under `messages/` (`club/reactions.ts` is in a subdirectory). |
| `sql-parse.mjs` (libpg-query 18.1.5 from the scratchpad) | migration `47 statements, 5 plpgsql functions, 5 DO blocks: all parse` (md5 `0154a6f10c3988d4202d932472773c77`); check script with `--strip-psql` `25 statements, 4 plpgsql functions, 11 DO blocks: all parse` (md5 `57b81753b99957b335d34f369de947e6`) — neither file changed |
| `node --test tools/validate-thread.test.mjs` | 18 / 18 |
| `"use client"` over the new `.tsx` under `messages/` | nothing listed (`reactions.ts` is a `.ts` helper with type imports only; no `server-only` module reachable from it) |

## 5. Notes for section 17 ("What the Mac must look at first")

- The branch carries ≈ 40 MB of screenshots (`visual/`, `visual/run2/`, `visual/run2/clip/`, `visual/repair-S{1,2,3}/`, the woff2 fixtures — 284 binary files in the diff). **Franky may squash the visual commits (`5d0e424`, `6592caa`, `6cef6bb`, `d2225fd`, `b3381af` and the three `fix(chat): W2-S* visual repairs`) before the merge if he wants the repo light; `visual/run2/` (with `run2/clip/`) is the final state** — run 1's PNGs at `visual/*.png` are superseded.
- `run2/clip/` shows INT-ADJUDICATE-1 as landed (the harness clip is the same rule). It does NOT show the other visible repairs: the Board's full-width card post (shots 09 / 10 still carry the Lounge bubble), the club dot on the sheets (15–19), the inverted "+" (14), the dark Retry ink (23). The browser walk covers them; `OUT_DIR=../run3 node shoot.mjs` re-shoots if wanted.
- The browser walk (13.3 step 4) gains: long-press a poll in the Lounge → pick an emoji → the chip appears under the card and toggles; Reply → the quote pill; on the Board, a card post is full width with no second avatar, its Reply opens the fold with the field focused; a `?channel=<room>` arrival makes ONE thread GET (the network tab) and the space read; a `?channel=<event room>` arrival makes one thread GET for the room, the space read, and the Lounge's own read.
- INT-SECURITY-1 (L3) before Oct 26, not before the Mac: a text Board post and a reply still have no long-press; the Report path for those is the after-launch line.
- INT-FLAG-OFF-1 is Franky's call at the Amend stage: (b) keep the fonts line and write section 0 row 10 (the default), or (a) the one-line revert with the visual pass wrong for weight only.
