# W2-B2 repair (one pass after the three reviews; 2026-09-30)

Reviews read: `B2-review-contract.md` (1 MEDIUM, 3 LOW), `B2-review-security.md`
(1 MEDIUM, 2 LOW), `B2-review-behaviour.md` (2 MEDIUM, 4 LOW). Every finding
was checked against the tree and the contract before it was acted on. No
name, column, route, payload field, code, sentence or SQL statement of the
contract changed. Nothing outside W2-B2's row of 13.2 was edited.

## Findings

| finding | verdict | one line |
|---|---|---|
| B2-CONTRACT-1 = B2-SECURITY-1 = B2-BEHAVIOUR-1 (MEDIUM: the two card routes untested) | **FIXED** | `src/lib/chat/cards/routes.test.ts` (34 tests): POST's 13 gates and PUT's 12 in 4.1 / 4.3's order, through the routes themselves by a relative import across `[id]` (the `remove-route.test.ts` pattern); the real `readCreateCardBody`, `cardFallbackContent`, `rpcRefusal`, `blockedIdsFor`, `isMissingChatSchema`, `isUuid` underneath; every status, code, sentence and `field`; the `events` read's five columns; the RPC names of 3.3 / 3.4; P0C21-26, PGRST202 / 42883 → 404, else 503; the read-back twice; PUT's re-read (`id, kind, user_id, card_event_id, removed_at`, `eq id`, `eq channel_id`, `limit 1`, no `maybeSingle`), the three 404s plus the viewer's own removed poll, 42703 → 404 (3.10), the block set read once before the RPC and a failed read → 503 with no RPC, `hydrateCards` given the re-read row, the room and the set, the 200 / 503 answers. The reviewers were right that the `[id]` glob is no obstacle to a relative import. |
| B2-CONTRACT-2 (LOW: a caller's block set kept when `room === null`) | **FIXED** | `blocked = room === null ? NO_BLOCKS : (ctx.blocked ?? NO_BLOCKS)`; the dm test hands `new Set([OTHER])` down and asserts the quote of that member stays (8.5). |
| B2-CONTRACT-3 (LOW: `hydrateCards` skipped when the block set is unknown; the comment's reason wrong) | **FIXED (the comment)** | The skip stays — the reviewer's second option: hydrating with an empty set on a failed block read would name a blocked voter on a guess, the very thing 9.1 forbids for the quote; and nothing of it is ever sent (the page is 503; the send's answer carries the sender's own text row, which has no card). The comment now says exactly that instead of "nothing built then is sent". |
| B2-CONTRACT-4 = B2-SECURITY-2 = B2-BEHAVIOUR-3 (LOW: the viewer's own removed card hydrated) | **FIXED** | The contract's sentence is the rule, not its line citation: 6.2 (`:715`) says of a removed message "its card is not hydrated (5.2)". `cardRows` now drops `removed_at` rows; the viewer's own removed poll goes out with `removed` set and `card: null`, tested (`message-read.test.ts`: not asked of `chat_polls`); `validate-thread.mjs` no longer counts that row as a 3.10 card-less row (tested). |
| B2-SECURITY-3 (LOW: four log bullets under `## STOPPED`) | **FIXED** | Moved to the end of `## Main log` in `B2-notes.md`. |
| B2-BEHAVIOUR-2 (MEDIUM: a live event room and a two-pick multi poll untested in `hydrate.test.ts`) | **FIXED** | The `closed` table gains a live room (`closes_at` null and a future one → `closed: false`); a new test: a multi poll with the viewer on two options → `mine` true on both, `total_voters` 1. |
| B2-BEHAVIOUR-4 (LOW: the voters read for anonymous polls) | **FIXED** | `voterIds` is built from the votes of non-anonymous polls only; the anonymous test asserts the cookie client is never asked. `count`, `total_voters`, `mine` unchanged (they come from the votes). |
| B2-BEHAVIOUR-5 (LOW: `snapshotCard` before the "your own" refusal and the `alreadyOpen` dedupe) | **FIXED** | The `card` hunk sits below `alreadyOpen` and above `withOwnerHandle`, still after `readTarget` — 5.3's two rules (after the reporter's own read; never returned) hold as before. |
| B2-BEHAVIOUR-6 (LOW: `Built.blocked` read by nobody) | **FIXED** | The field and its comment dropped; `complete` still covers the block read. |

REJECTED: none. DEFERRED: none — every finding sat inside W2-B2's files.

The builder's STOPPED (9.4's parenthetical "the caller answers 503, as today")
stays as the three reviews judged it: right to stop, right in what was
built; the one-line alternative is written in `B2-notes.md` for the
integration review.

## Gates (13.3), after the repair

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 (on the second 60-s retry; see SIBLING) |
| `npm test` | 1560 / 1560 |
| `node --test src/lib/chat/cards/routes.test.ts` | 34 / 34 |
| `node --test …/tools/validate-thread.test.mjs` | 18 / 18 |
| `npx eslint` (the eight files) | exit 0 |
| `npm run build` | compiled; the type-check step failed on B3's `members-guard.test.ts` only; retry loop in flight at close (no verdict yet) |

Commits: `39ea044` fix(chat): W2-B2 repair after review; the docs commit after it.
