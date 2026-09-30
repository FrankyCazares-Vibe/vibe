# W2-B1 gate (migration B, the check script, the parse tool, the seed addition)

Cloud session, 2026-09-30. **Nothing was run against a database**: no docker, no psql, no
Supabase here. What a database would answer (the PRE-FLIGHT, the POST-CHECKs, the probe,
the check script, the seed's calls) is for the Mac rehearsal (contract 13.3, Mac step 1).
The DO blocks are string constants to the parser: their catalog logic is for the two
reviewers (sql, security) to read.

Base sha at the start: `75500e3`. Commits of this batch: `637f20e` (tool + notes),
`bc19a18` (migration B), `b885119` (seed addition), `666f683` (check script), plus the
gate/notes commit that carries this file.

## The batch's own gate (contract 13.3, SCHEDULE-M1)

libpg-query 18.1.5 installed in the scratchpad (never a repo dependency):
`cd <scratchpad>/pgparse && npm init -y && npm install libpg-query@18`.
`LIB=<scratchpad>/pgparse/node_modules/libpg-query`

| command | result |
|---|---|
| `node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs --lib $LIB supabase/migrations/20261001110000_chat_v2_cards.sql` | exit 0: `47 statements, 5 plpgsql functions, 5 DO blocks: all parse` |
| `node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs --lib $LIB --strip-psql scripts/sql/chat-v2-cards-check.sql` | exit 0: `25 statements, 4 plpgsql functions, 11 DO blocks: all parse` |

The tool parses DO blocks too (`parsePlPgSQLSync` accepts a `DO` statement in 18.1.5;
verified in the scratchpad) — more than 13.3 asks; the reviewers' read-through stays.

Calibration of the tool (so "exit 0" means something):

| command | result |
|---|---|
| `… sql-parse.mjs --lib $LIB supabase/migrations/20261001100000_chat_v2_rooms.sql` (A, applied on production) | exit 0: `60 statements, 6 plpgsql functions, 6 DO blocks: all parse` |
| `… sql-parse.mjs --lib $LIB --strip-psql scripts/sql/chat-v2-rooms-check.sql` | exit 0: `36 statements, 5 plpgsql functions, 18 DO blocks: all parse` |
| a file with `do $$ begin if x then end $$;` | exit 1: `PL/pgSQL in a DO block (statement at line 2): syntax error at end of input` |
| a file with `select from from;` | exit 1: `SQL (line 2): syntax error at or near "from"` |
| `LIBPG_QUERY_DIR=$LIB node … sql-parse.mjs <file>` (no `--lib`) | resolves the library the same way |

The six SQL blocks of contract section 3 (3.1 DDL, 3.3, 3.4 x2, 3.5 x2) were compared with
the migration by a node script (`f.includes(block)`): all six **VERBATIM** in the file.

## The gates every batch runs (13.3)

| command | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | 1475 tests, 1475 pass, 0 fail (this batch adds no `.test.ts`: it owns no TypeScript) |
| `npm run build` | exit 0 (one run; no collision) |
| `npx eslint handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs scripts/local-seed.mjs` | exit 0, no output |
| `git show 75500e3:scripts/local-seed.mjs \| npx eslint --stdin --stdin-filename scripts/local-seed.mjs` | exit 0 (the seed carries no old error and is not on the `B0-gate.md:19-30` list; parity holds trivially) |
| `node --check handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs && node --check scripts/local-seed.mjs` | ok |

The `.sql` files are not eslint's business. No SIBLING typecheck errors were seen (exit 0 on
the first run).

## What the Mac will see (for the handoff; contract 13.3, Mac step 1)

- Rehearsal 1 (the rollback copy): the PRE-FLIGHT prints `chat-cards: select policy unpinned`
  (NOTICE) and goes on; steps 1-5 run; 7.1 passes; **7.2 prints 27 NOTICE lines in paste
  order** — `want_select := $w$<text>$w$`, 21 x `want_con_<conname> := $w$<text>$w$`,
  5 x `want_fn_<name> := '<md5>'` — and raises `chat-cards: constants are empty`. The behaviour
  probe (8) never runs in rehearsal 1 (7.2 stops the file first).
- The paste: `want_select` goes into the PRE-FLIGHT's declaration (it is declared once and
  carried to 7.2 through `chat_cards.want_select`); the 26 others into 7.2. A text goes
  between `$w$` and `$w$`; an md5 between single quotes. An empty constant must stay `''`,
  never `$w$$w$` (that would end the DO block's `$$` quoting). Then `select version()` into
  LIVE STATE.
- Rehearsal 2: green to `rollback;`, with `chat-cards: behaviour check passed: …` in the
  NOTICE lines (or `skipped: <reason>` — the probe needs a club with a Lounge, a Board, an
  officer, an upcoming event and a member below admin who may publish; locally
  `chat_seed_club` has all of them once the seed ran). The record names the probes it left
  out when no closed event chat, ended event, foreign event or outsider exists.
- Then the real local apply, `chat-v2-rooms-check.sql` 200/200, `chat-v2-after-deploy.sql` 0
  findings, `chat-v2-cards-check.sql` all green (its last NOTICE line:
  `chat-cards-check: all N cases passed`; any `WARNING` line = a failed run), the seed twice
  (the second run changes nothing the same UTC day), the COST section.
