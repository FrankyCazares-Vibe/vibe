# S71 TS batch notes (contract Part A3, A5, B1-B4, TS half of C)

Worktree: scratchpad/wave2, branch claude/relaxed-davinci-9d11h3 @ 00e3f00. No commit, no push, no DB, no dev server.

## Plan (written first; appended as I go)

1. A3  remove route step 10: write `removed_by: null`; on exactly 1 marked row upsert `chat_removals` (service) with caller id and club role, onConflict message_id; failure logged only, never changes the answer.
2. B1  fallback.ts: `event_cancelled` variant + header comment; fallback.test.ts cases.
3. B2  new cards/refresh-event-cards.ts (+ test with stub client).
4. B3  events/[id]/route.ts: PATCH refresh when title/starts_at changed; DELETE loads cards before delete when `notify`, rewrites after confirmed delete.
5. A5/B4 tests: remove-route.test.ts extended; refresh-event-cards.test.ts; route ordering test if the harness can drive it.
6. Gates: tsc, npm test (baseline 1,639), eslint on changed files.

## Progress log
- [A3 done] remove route: `removed_by: null` in the mark; `recordRemoval()` upserts chat_removals (message_id, removed_by = caller, removed_role = caller's club role, onConflict message_id) only when the mark touched exactly 1 row; any error / missing table (isMissingChatSchema picks the log wording) / throw is console.error'd as `[messages.DELETE chat_removals] ...` with code + message only and the answer is unchanged. Header comment updated. Tests (A5) still to write.
- [A5 done] remove-route.test.ts: fake gains upsert + who(cookie/service) + chat_removals answers; 'mark' test now asserts removed_by === null; 10 new cases (section 11). 37 pass.
- [B1 done] fallback.ts event_cancelled variant + header; fallback.test.ts: 2 new tests (8 total).
- [B2 written] cards/refresh-event-cards.ts: loadEventCardMessages / rewriteEventCardTexts (groups by distinct text, batches of 100 ids, .select('id') to count) / refreshEventCardTexts. Choices beyond the contract: messages read ordered newest first; notes read chunked by 100; cap logged once per load with console.warn. Test still to write.
- [B2 test done] cards/refresh-event-cards.test.ts: in-memory fake of messages + chat_event_cards; 22 tests pass (filters, removed rows skipped, per-note rewrite, cancel, read failure, write failure keeps going, throws, 500 cap once, chunks of 100, missing schema silent).
- [B3 done] events/[id]/route.ts: PATCH refresh when title or start (Date.parse compare) changed; DELETE loads cards after the recipients read and before the delete (only when notify), rewrites after confirmed delete and before the notices. Route test (B4) src/lib/events/event-route.test.ts being written/run.
- [B4 done] src/lib/events/event-route.test.ts: 20 tests drive the real PATCH/DELETE (stubbed clients/gates, real helper + validation, Date mocked); mutation check against the HEAD route: 9 fail, with mine 20 pass. remove-route mutation check also run.
- [tsc] exit 0 after typing test helpers with TestContext.

## Gates (all run in the worktree, nothing committed or pushed, no DB, no dev server)
- `npx tsc --noEmit` -> exit 0, no output.
- `npm test` -> 1,693 tests, 1,693 pass, 0 fail (baseline 1,639; +54 = remove-route +10, fallback +2, refresh-event-cards +22, event-route +20).
- `npx eslint` on the 9 files changed or created -> exit 0, no output (no warning, no error).
- Mutation checks: the HEAD version of the events route fails 9 of the 20 route tests; the HEAD version of the remove route fails 7 of the 37.

## Files
Changed: `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, `src/app/api/events/[id]/route.ts`, `src/lib/chat/cards/fallback.ts`, `src/lib/chat/cards/fallback.test.ts`, `src/lib/chat/remove-route.test.ts`, `src/lib/chat/types.ts` (one comment sentence).
New: `src/lib/chat/cards/refresh-event-cards.ts`, `src/lib/chat/cards/refresh-event-cards.test.ts`, `src/lib/events/event-route.test.ts` (the route test: `[id]` paths cannot be globbed by node --test, so it lives in lib/events and imports the route by path, as remove-route.test.ts does; the route CAN be driven by the harness, so the ordering rule is tested through the real PATCH and DELETE, not only through the helper).

## Choices the contract left open (all inside its text)
- `loadEventCardMessages`: the messages read is ordered newest first before `.limit(500)` (so a capped event refreshes its newest cards, deterministically); the notes are read in chunks of 100 ids; the cap is logged once per load with `console.warn`.
- `rewriteEventCardTexts`: groups the cards by the exact new text and sends one `update ... where id in (<=100 ids) and kind = 'event_card'` per text and batch (a cancel = one statement; an edit = one per distinct note) with `.select("id")` to count `updated`. A failed batch is logged and the next one still runs.
- PATCH compares title by string and `starts_at` by `Date.parse` (the stored value is `+00:00`, the validated one `.000Z`; a string compare would refresh on every edit).
- DELETE: the cards are read after the recipients read (a failed recipients read still stops with 500 and no card read) and right before the delete; the rewrite runs right after the confirmed delete and BEFORE the notices (so on the no-RSVP early return it still happens). The notices, their order and every answer are untouched.
- A3 log line: `[messages.DELETE chat_removals] <upsert failed | chat_removals is not in this database yet>` + code + message; a throw logs the message only. `isMissingChatSchema` only chooses the wording; every failure is logged as the contract says.

## Documented limits (B5, not built) plus two I found
- A raw data-API edit or delete of an event, the officer raw delete (audit M2) and cascade deletes do not refresh card text; editing only a card's `note` is not a feature.
- B5 says an event chat room that already closed is not touched. The code has no room filter: it rewrites every live card with that `card_event_id`, so a card in a room that closed before the event ended WOULD be refreshed too. Harmless (and arguably better); stated so nobody expects a filter.
- Not in the contract: a card posted in the instant between the DELETE's card read and the delete itself (the room is still open) keeps its old text. Same for a card created between a PATCH's update and its card read (that one reads the new event on creation, so it is already right). Accepted: the window is milliseconds.
- `chat_removals` rows left by a restore are history; the next removal overwrites them (A4).
