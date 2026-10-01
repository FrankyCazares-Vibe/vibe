# S71 amendment to wave 2 — migration B gains `chat_removals`; event cards follow their event

Written 2026-10-01 (Mac session 71) after the audit of the cloud branch (`handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md`, findings **F02** and **F03**). Franky chose to take BOTH into migration B / wave 2 before B is ever applied anywhere ("both"). Where this file and `wave-2-contracts.md` differ, this file wins; it is additive (no earlier text is edited). It is folded into the contract as section 17.7 afterwards by the orchestrator.

Base: branch `claude/relaxed-davinci-9d11h3` at `00e3f00` (F01, the `t/f` boolean fix, is already in). Migration B has NOT been applied to the local database, nor anywhere. The step-7 constants (`want_select`, `want_con_*`, `want_fn_*`) are still EMPTY in the file by design: the Mac rehearsal prints them and the paste happens later. **Do not paste constants into the committed file.**

## Part A — F02: who removed a message must not be readable by the author

**The problem.** The officer/mod remove route writes `messages.removed_by = <the remover>`. RLS shows a member their own removed row (`removed_at IS NULL OR user_id = auth.uid()`), `authenticated` has table-level SELECT on `messages`, so the author can read `removed_by` through the data API and join `users` for the mod's name and handle. Reproduced locally in a rolled-back transaction. Nothing in the app reads `messages.removed_by` for chat (the readers use `removed_reason`: `message-read.ts:550`).

**The design.**

A1. Migration B gets a FIFTH service-role-only table, built exactly in the style of `chat_event_cards` / `chat_polls` (RLS enabled, NO policy, `revoke all … from anon, authenticated, service_role`, then `grant select, insert, update, delete … to service_role`; no TRUNCATE):

```sql
create table public.chat_removals (
  message_id   uuid constraint chat_removals_pkey primary key
               constraint chat_removals_message_id_fkey references public.messages(id) on delete cascade,
  removed_by   uuid constraint chat_removals_removed_by_fkey references public.users(id) on delete set null,
  removed_role text not null
               constraint chat_removals_removed_role_check check (removed_role in ('owner','admin','mod')),
  removed_at   timestamptz not null default now()
);
create index idx_chat_removals_removed_by on public.chat_removals (removed_by);
```

A2. Everything in B that enumerates its tables / constraints / indexes grows by one table: the header comments and counts, PRE-FLIGHT (the table must not exist yet, like the other four), section 1 (create + RLS + revoke + grant), the 7.1 POST-CHECK by reading (tables 4 → 5; constraints 21 → 25: the four new names above; indexes +1 (`idx_chat_removals_removed_by`) and the pkey index; policies still 0 on every new table; grants), the 7.2 constants block (**four new `want_con_chat_removals_*` slots, still empty**, in the same paste order the NOTICE lines print; total constants 27 → 31), the step-8 behaviour probe only if it counts tables, the 9 APPLY RECORD ("tables 5"), the ROLLBACK section (drop `chat_removals` first), and the `notify pgrst` at the end. Rehearsal 1 must still print EVERY constant (now 31) and stop with `chat-cards: constants are empty`. `chat_removals` needs no new FUNCTION and no trigger.

A3. Route `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, step 10 (the mark): write `removed_by: null` (never the caller) together with `removed_at` and `removed_reason: OFFICER_REMOVED_REASON`. When the mark touched exactly one row, upsert into `chat_removals` with the SERVICE client: `{ message_id, removed_by: user.id, removed_role: <the caller's club role: 'owner' | 'admin' | 'mod'> }` (`onConflict: "message_id"`; a later removal overwrites a stale row left by a restore). A failure of that upsert (including a missing table: use `isMissingChatSchema` from `src/lib/chat/schema.ts` and/or the codes `42P01` / `PGRST205`) is logged with `console.error` (tag like the route's other `[... ]` tags, code + message, NEVER the caller's id in a client-visible string) and DOES NOT change the answer: the message is removed either way. No `chat_removals` write when the mark touched 0 rows. Every existing refusal order, status, code and sentence of the route is unchanged.

A4. Removals by Vibe's founders (`src/lib/moderation/actions.ts`, `/api/admin/content/remove`) keep writing `removed_by = <founder>`: unchanged and accepted (moderation migration `20260923090000:185-195`). Admin RESTORE (`/api/admin/content/restore`) is unchanged; a `chat_removals` row it leaves behind is history and is overwritten by the next removal.

A5. Tests: `src/lib/chat/remove-route.test.ts` is updated and extended: the written payload has `removed_by === null`; a `chat_removals` upsert is made with the caller's id and role; an upsert failure still answers the success answer; a missing table is tolerated; no upsert when the mark touched 0 rows; the existing cases keep passing unchanged. `src/lib/chat/types.ts` (the comment near `RemovedInfo`) may gain one sentence; no type changes.

A6. SQL checks: `scripts/sql/chat-v2-cards-check.sql` — the `G2` loop gains `public.chat_removals` (same expectation: `true/0/false/true/false`); a new small section of cases (continue the numbering style): the service role can insert a record for a real message; `authenticated` and `anon` are refused (42501) on select and on insert; a `removed_role` of `'member'` is refused (23514); deleting the message cascades the record away; a second insert for the same message is refused (23505). The final count line (`all N cases passed`) changes accordingly; report the new N.

## Part B — F03: an Event card's stored text follows its event

**The problem.** `messages.content` of an Event card is written once (`Event: <title> · <Thu Oct 8, 7:30 PM>[ — <note>]`). The new phone card shows live data, but the old screens, the old inbox, previews and reports show that text. After an officer moves, renames or cancels the event, they keep the old day and time. Event edits send no notice (v1).

**The design (route-level; no new database object).**

B1. `src/lib/chat/cards/fallback.ts`: `FallbackInput` gains `{ type: "event_cancelled"; title: string }` → `Event cancelled: <title>` (same collapse and 300-character rule as the others). Update the file's header comment. `fallback.test.ts` gains the cases.

B2. New file `src/lib/chat/cards/refresh-event-cards.ts` (pure logic plus a service-client parameter, in the style of the other `cards/*` modules and testable with a stub client like `remove-route.test.ts` / `reads-routes.test.ts`):
 - `loadEventCardMessages(service, eventId)`: the messages with `kind = 'event_card'`, `card_event_id = eventId`, `removed_at is null` (`.limit(500)`; log once when the cap is hit), plus each one's `note` from `chat_event_cards` (`message_id in (...)`). Returns `{ ids: string[]; notes: Map<string, string | null> } | null` (null on a read failure; a missing table (`isMissingChatSchema`) means no cards exist: return an empty result, silently).
 - `rewriteEventCardTexts(service, cards, change)` where `change` is `{ kind: "update"; title: string; starts_at: string } | { kind: "cancel"; title: string }`: for each message, `content = cardFallbackContent(...)` (`event` with that row's note, or `event_cancelled`), then `update messages set content where id = <id> and kind = 'event_card'` (service role; sequential or small batches). NEVER throws; each failure is logged `console.error("[chat/refresh-event-cards]", code, message)`; returns `{ ok: boolean; updated: number }`.
 - `refreshEventCardTexts(service, eventId, change)` = load + rewrite, for the PATCH case.

B3. `src/app/api/events/[id]/route.ts`:
 - **PATCH**: after the successful update, when the event's `title` or `starts_at` changed against the pre-edit event, call `refreshEventCardTexts(service, event.id, { kind: "update", title: updated.title, starts_at: updated.starts_at })`. Awaited, result only logged; the response is unchanged byte for byte.
 - **DELETE**: only when `notify` is true (the event had not ended; an ended event deletes quietly and its card keeps its history text): load the cards BEFORE the delete (the FK nulls `card_event_id` afterwards), delete as today, and only after a confirmed delete (`gone.length === 1`) call `rewriteEventCardTexts(service, cards, { kind: "cancel", title: event.title })`. A failed read or write never changes the answer, the notices or their order.
 - Every refusal, status, code, sentence and the notice flow of both handlers stays as is.

B4. Tests for B1, B2 (stub client: rewrites per note, skips removed rows, a read failure, a write failure, the 500 cap, a missing table) and the route changes where the existing test style allows (`src/lib/events/*.test.ts` hold the neighbouring tests; if the route itself cannot be driven by the repo's harness, test the ordering rule through the helper and say so in the notes).

B5. Documented limits (write them into the notes, do not build): a raw data-API edit or delete of an event, the officer raw delete (audit M2), and cascade deletes do not refresh card text; an event chat room that already closed is not touched; editing only the `note` of a card is not a feature.

## Part C — rules for every batch

- Work ONLY in the worktree `/private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/wave2` (branch `claude/relaxed-davinci-9d11h3`). Do NOT touch `/Users/franciscocazares/vibe` (it is `main`, which deploys to production). **Do not commit and do not push**: the orchestrator commits after review.
- File ownership. **SQL batch** owns `supabase/migrations/20261001110000_chat_v2_cards.sql`, `scripts/sql/chat-v2-cards-check.sql` (and `scripts/local-seed.mjs` only if a count or table list in it needs the new table). **TS batch** owns `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, `src/app/api/events/[id]/route.ts`, `src/lib/chat/cards/fallback.ts`, `src/lib/chat/cards/fallback.test.ts`, the new `src/lib/chat/cards/refresh-event-cards.ts` and its test, `src/lib/chat/remove-route.test.ts`, `src/lib/chat/types.ts` (one comment sentence at most). Nobody edits `wave-2-contracts.md` or any other file.
- Database rules: the LOCAL database only (`docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1`); every run that creates anything is ONE transaction ending in `rollback;`; afterwards prove the database equals the database before (`to_regclass('public.chat_polls')` and `to_regclass('public.chat_removals')` are null, no function named `chat_create_*`, `chat_cast_vote`, `chat_reply_counts`; same `count(*)` of `messages` and `channels`). Never touch production (Supabase project `rqopjkimxbjkwdkpkbfq`, `https://www.connectvibe.app`); never start a dev server or run `next build`.
- A scratch recipe for SQL runs that reach step 8 (the pinned constants are empty in the committed file): the audit built `scratchpad/audit2/b-full-asis.sql` = the OLD branch file with its 27 constants pasted, `\set ON_ERROR_STOP on`, a `rollback;` at the end; the new constants (31) must be regenerated from a rehearsal-1 run of the NEW file (it prints them as NOTICE lines in paste order and stops with `chat-cards: constants are empty`). Make scratch copies with constants pasted under `scratchpad/s71/`; never paste constants into the committed file. A working verification of the F01 fix lives in `scratchpad/verify1/verify.sql` (B + the check script in one transaction).
- Gates for the TS batch: `npx tsc --noEmit`, `npm test` (baseline on this branch before the batch: see the S70 handoff, 1,639 tests; report the new count), `npx eslint` on the files changed (no NEW error; legacy errors in untouched files stay).
- Each batch writes `handoffs/chat-redesign/wave-2-build/S71-<batch>-notes.md` FIRST (what it will do), then appends as it goes (a cut-off run continues from its notes), and ends with a short report: files changed, commands run with their results, anything it could not do and why.
