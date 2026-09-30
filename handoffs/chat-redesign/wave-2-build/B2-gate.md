# W2-B2 gates

## Prelude (W2-B2's first commit, 13.1; built alone)

Files: `src/lib/chat/types.ts`, `when.ts` + `when.test.ts`, `cards/fallback.ts`
+ test, `cards/body.ts` + test, `stub.ts` + `stub.test.ts`, `blocks.ts`,
`cards/hydrate.ts`, `cards/snapshot.ts`, `event-refs.ts` (signature stubs),
`message-read.ts` (9.1 plumbing only), `room-rules.test.ts` (the wave-1
sentence-table assertion extended by the eleven rows; the "no sentence"
example codes swapped for `content_blocked`).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output (repo-wide) |
| tests | `npm test` | 1409 tests, 1409 pass, 0 fail (1,374 before + 35 new: when 12, fallback 6, body 11, stub 6) |
| tests, other zones | `TZ=Asia/Tokyo node --test src/lib/chat/when.test.ts`; `TZ=America/Los_Angeles …` | 12/12 each |
| build | `npm run build` | exit 0 (no `server-only` reached a client file; no route export complaint) |
| eslint | `npx eslint <the 15 files above>` | exit 0, no output; none of them carries old errors, so no rule-by-rule comparison was needed |

Not run here (no database, 13.3): nothing of the prelude touches a database.
`validate-thread.mjs` and its fixtures are the main W2-B2 builder's (5.4).

## Main W2-B2 (the four batches side by side; commits 7a5e9e5 … 885612f)

Files: `src/lib/chat/event-refs.ts` + test, `cards/hydrate.ts` + test,
`cards/snapshot.ts` + test, `cards/rpc-refusal.test.ts`, `message-read.ts`
+ `message-read.test.ts`, `src/app/api/me/threads/[id]/messages/route.ts`,
`src/app/api/me/threads/[id]/cards/route.ts`,
`cards/[messageId]/vote/route.ts`, `cards/_lib/rpc-refusal.ts`,
`src/app/api/me/reports/route.ts` (the 5.3 hunk),
`handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs` +
`validate-thread.test.mjs` + `fixtures/*.json` (8).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output (repo-wide, with the siblings' files in the tree) |
| tests | `npm test` | 1475 tests, 1475 pass, 0 fail (1,409 after the prelude + 66 new: event-refs 12, hydrate 21, snapshot 14, message-read 12, rpc-refusal 7) |
| stub harness (13.3) | inside `npm test`: `event-refs.test.ts`, `cards/hydrate.test.ts`, `cards/snapshot.test.ts`, `cards/rpc-refusal.test.ts`, `message-read.test.ts` | fake cookie / service clients answer every SQLSTATE of 3.2 and the missing-schema codes: the 3.10 rows for the card routes (404 `not_found` on a missing function), `hydrateCards` (empty map), `snapshotCard` (null), `readReplyCounts` (the wave-1 walk); the code mapping P0C21-P0C26 |
| build | `npm run build` | exit 0 (once, after typecheck; `/api/me/threads/[id]/cards` and `…/cards/[messageId]/vote` in the manifest; no `server-only` reached a client file) |
| eslint | `npx eslint <the 26 files above>` | exit 0, no output; none of them is on the old-errors list, so no rule-by-rule comparison was needed |
| the batch's own gate | `node --test handoffs/chat-redesign/wave-2-build/tools/validate-thread.test.mjs` | 17 tests, 17 pass; every fixture (`node …/validate-thread.mjs fixtures/<name>.json --role … --room …`) exit 0 |

Not run here (no database, 13.3): the routes against Postgres; the Mac's
step 2 feeds the real answers through `validate-thread.mjs`.

STOPPED (in B2-notes.md): 9.4's parenthetical "(the caller answers 503, as
today)" contradicts the code; built as today (`reply_count: null`, 200).

## Repair (one pass after the three reviews; commit 39ea044)

Files: `src/lib/chat/message-read.ts` + `message-read.test.ts`,
`cards/hydrate.ts` + `hydrate.test.ts`, `cards/routes.test.ts` (new, 34 tests),
`src/app/api/me/reports/route.ts` (the 5.3 hunk moved), `tools/validate-thread.mjs`
+ `validate-thread.test.mjs`. See `B2-repair.md` for finding → verdict.

| gate | command | result |
|---|---|---|
| tests | `npm test` | 1560 tests, 1560 pass, 0 fail (1523 at review time + 37: routes 34, hydrate 1, message-read 1, and B3's own additions in the tree) |
| stub harness (13.3) | `node --test src/lib/chat/cards/routes.test.ts` | 34/34: the routes' own 3.10 rows (PGRST202 / 42883 → 404 from the RPC; 42703 on the vote's re-read → 404) and every SQLSTATE of 3.2 through the routes, in 4.1 / 4.3's order |
| eslint | `npx eslint` over the eight files above | exit 0, no output; none is on the old-errors list |
| the batch's own gate | `node --test handoffs/chat-redesign/wave-2-build/tools/validate-thread.test.mjs` | 18 tests, 18 pass (one new: a removed own card row is not a 3.10 row) |
| typecheck | `npm run typecheck` | exit 0 on the second 60-s retry (the first runs were red in `src/lib/chat/members-guard.test.ts:142,220,221`, B3's untracked file mid-edit; none of W2-B2's files ever appeared) |
| build | `npm run build` | first run: "Compiled successfully in 16.5s", then "Failed to type check" on the same sibling file only; the 90-s retry loop was still in flight when this record closed (no verdict yet); the sibling's file is fixed (typecheck green), so the integration review's build is the proof |
