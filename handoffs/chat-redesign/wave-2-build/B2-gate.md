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
