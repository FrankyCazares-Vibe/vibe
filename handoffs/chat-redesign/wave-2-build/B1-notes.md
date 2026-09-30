# W2-B1 notes — migration B (cards), the local check script, the parse tool, the seed addition

Builder: cloud session (no database, no docker, no browser). Branch `claude/relaxed-davinci-9d11h3`.
Contract: `handoffs/chat-redesign/wave-2-contracts.md` section 3 (FINAL), 13.2 (ownership), 13.3 (gates).
Facts: `wave-2-asis/database-map.md` (DM), migration A `supabase/migrations/20261001100000_chat_v2_rooms.sql`.

## Owns (13.2)

- `supabase/migrations/20261001110000_chat_v2_cards.sql`
- `scripts/sql/chat-v2-cards-check.sql`
- `handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs`
- the `scripts/local-seed.mjs` addition (one poll, one sign-up, one event card in `chat_seed_club`'s Lounge)
- `handoffs/chat-redesign/wave-2-build/B1-*.md`

## Plan

1. Read: contract 3, 13; A in full (1,964 lines); DM in full; `chat-v2-rooms-check.sql` head + helpers; the seed's wave-1 shape. DONE.
2. `npm install libpg-query@18` in the scratchpad (`…/scratchpad/pgparse`, 18.1.5; exports `loadModule`, `parseSync`, `parsePlPgSQLSync`). DONE.
3. Write `tools/sql-parse.mjs`; calibrate it over migration A (known good: applied on production). Commit.
4. Write migration B in pieces (header in A's order; PRE-FLIGHT 3.0.1-9; step 1 tables; steps 3-5 the exact bodies;
   grants + comments after each function; step 7 POST-CHECK by reading with the constants block LAST;
   step 8 BY BEHAVIOUR under `P0C29`; step 9 APPLY RECORD; notify; commit). Parse gate. Commit.
5. Write `scripts/sql/chat-v2-cards-check.sql` (psql first line, local-only guard, pg_temp helpers, own fixtures,
   the 3.8 cases, the `for update` x2 assertion, last line `chat-cards-check: all N cases passed`, ROLLBACK). Parse gate
   with the psql line stripped. Commit.
6. Seed addition (`seedClubCards`): B detected by `admin.from('chat_polls').select('message_id').limit(1)`
   (`42P01` / `PGRST205` = skip); each card looked up by `messages.kind` + `content` in the Lounge before its RPC;
   re-runnable. `node --check`, eslint. Commit.
7. Gates 13.3: typecheck, test, build, eslint on my files (the seed has no old errors: not on the B0 list), the parse gate.
   Write `B1-gate.md`. Final commit.

## Decisions taken while building (each checked against the contract; none changes a name, column, code or sentence)

- `want_select` is declared ONCE, in the PRE-FLIGHT block (3.0.4 needs it first), and carried to step 7's constants block
  through `chat_cards.want_select` (the set_config idiom of section 3). The Mac's paste is still one edit per constant.
- `want_org` / `want_dm` (A's texts, known) are declared in the PRE-FLIGHT and carried to step 7 the same way, so the
  long texts live in one place.
- `chat_cards.notes` is appended with `concat_ws('; ', …)` so "select policy unpinned" and "orphans allowed: n" can both
  be in the record (3.0.8 says the setting "gains" the note).
- The tool also runs `parsePlPgSQLSync` over DO blocks (libpg-query 18.1.5 accepts a `DO` statement; verified in the
  scratchpad). More than 13.3 asks; the two reviewers' read-through of the DO blocks stays.

## Log
- 2026-09-30T05:50:49Z notes written; no file edited yet
- 2026-09-30T05:51:43Z tools/sql-parse.mjs written (79 lines); calibrated: A = 60 statements, 6 plpgsql functions, 6 DO blocks parse; rooms-check with --strip-psql parses; two broken files exit 1 with the line
