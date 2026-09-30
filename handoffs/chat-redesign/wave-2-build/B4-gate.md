# W2-B4 gate record (contract 13.3)

Run in the cloud on branch `claude/relaxed-davinci-9d11h3` after the last code commit (208effe), with the sibling
batches' files in the shared tree (B3's modified `[messageId]/route.ts` and notes were present).

| gate | command | result |
|---|---|---|
| typecheck (repo-wide) | `npm run typecheck` | exit 0 |
| tests (all) | `npm test` | 1523 tests, 1523 pass, 0 fail (1475 before B4 + 9 `reads.test.ts` + 12 `reads-routes.test.ts` + siblings' new tests) |
| build | `npm run build` | exit 0; `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar` in the route manifest (ƒ Dynamic); one run, no collision |
| eslint (my files) | `npx eslint src/lib/chat/reads.ts src/lib/chat/reads.test.ts src/lib/chat/reads-routes.test.ts src/app/api/me/inbox/route.ts "src/app/api/orgs/[slug]/space/route.ts" src/app/api/me/calendar/route.ts` | exit 0, 0 problems (none of these files is on the old-error list, so no parity comparison was needed) |
| batch's own | `node --test src/lib/chat/reads.test.ts` / `node --test src/lib/chat/reads-routes.test.ts` | 9/9 and 12/12 |

The route harness (`reads-routes.test.ts`) resolves `next/server`, `server-only`, `@/lib/supabase/{server,service}`,
`@/lib/chat/{flag-server,event-refs,rooms,message-read}` to small data: modules answering from `globalThis`; `reads`,
`stub`, `blocks`, `room-rules`, `schema`, `org-asset-url` are the real code. No database was touched (13.3, BN:3).

## Re-run after the repair (580fff3, `fix(chat): W2-B4 repair after review`)

| gate | command | result |
|---|---|---|
| typecheck (repo-wide) | `npm run typecheck` | exit 0 |
| tests (all) | `npm test` | 1575 tests, 1575 pass, 0 fail |
| build | `npm run build` | exit 0; the three routes in the manifest (ƒ Dynamic); one run, no collision |
| eslint (B4 files) | the same six files | exit 0, 0 problems |
| batch's own | `node --test src/lib/chat/reads.test.ts src/lib/chat/reads-routes.test.ts` | 21/21 |
