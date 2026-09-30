# W2-B1 repair — after B1-review-sql.md and B1-review-security.md

Repairer: cloud session (no database), 2026-09-30, one pass. Base of the batch `75500e3`; the batch's commits
`637f20e`, `bc19a18`, `b885119`, `666f683`, `632c1a4`, `10346b3`; this repair `f4c0c95` (code + notes + gate) and
the docs commit that carries this file. Every finding was verified against the file and the contract before a
verdict; no contract name, column, route, code, sentence or SQL statement was changed (the six SQL blocks of 3.1,
3.3, 3.4 x2, 3.5 x2 are still VERBATIM by node `includes`).

## Findings → verdicts

| finding | severity | verdict | one line |
|---|---|---|---|
| B1-SQL-1 | MEDIUM | **FIXED** | Confirmed: 3.7 "Unchanged: … the grants of 3.0.5" and 3.0.5 has the `has_function_privilege` half; 7.1.e (:1068-1073) re-read only the table half. PRE-FLIGHT e's loop (:410-421) is copied after it with the message `chat-cards: % is no longer executable by anon, authenticated and service_role` (`f record` is already declared in the 7.1 block). |
| B1-SQL-2 | LOW | **FIXED** | Confirmed: :211 `DELETE FROM public.messages WHERE kind <> 'text';` in a comment vs 3.10's lower case; the line now reads as 3.10 prints it. |
| B1-SQL-3 | LOW | **FIXED** | Confirmed against A:969-971 (day arithmetic on a timestamptz follows the session zone; A's functions pin UTC): the probe's closed-chat fixture (:1365) now uses `interval '168 hours'`, the same moment A computes, in any session zone. The check script's event fixtures sit 1 and 10 days from the boundary and were left alone. |
| B1-SQL-4 | LOW | **FIXED** (optional, cheap) | 3.8.3 says "a member of another club"; the fixture now prefers one: `order by (exists (select 1 from public.org_members x where x.user_id = u.id)) desc, u.id` before the `limit 1`. Same `P0C24` either way; the fixture matches the sentence and is deterministic. |
| B1-SQL-5 | LOW | **REJECTED** (no change; the reviewer asks none) | The seed's copies of `eventWhen` / the fallback cut rule are the only way in an `.mjs` script; verified identical output today, and the seed's comment already names both source functions as the place to update. Nothing to fix now. |
| B1-SECURITY-1 | LOW | **FIXED** | Confirmed: Postgres 18 catalogues NOT NULL constraints in `pg_constraint` (`contype = 'n'`), so the builder's bare 21-count (:975-977) would refuse a correct stack there. The count is now `and c.contype in ('p', 'u', 'f', 'c')`; the by-name check of the 21 stays. |
| B1-SECURITY-2 | LOW | **FIXED** (docs only) | 13.2 pins the lookup by `messages.kind` + `content`, so the code stays; B1-gate.md's Mac paragraph now says a seed run on a later UTC day adds one more Event card (its content carries the re-dated event's date), the poll and the sign-up are found and left alone, and two Event cards are the seed's doing, not a `hydrateCards` bug. |

No finding was DEFERRED: none needed another batch's file or a contract change. STOPPED: nothing (the contract is
consistent with the code for B1's scope, as both reviewers also found). SIBLING: none (typecheck exit 0 on the
first re-run).

## Gates after the repair (13.3)

`LIB=<scratchpad>/pgparse/node_modules/libpg-query` (libpg-query 18.1.5, never a repo dependency).

| command | result |
|---|---|
| `node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs --lib $LIB supabase/migrations/20261001110000_chat_v2_cards.sql` | exit 0: `47 statements, 5 plpgsql functions, 5 DO blocks: all parse` |
| `node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs --lib $LIB --strip-psql scripts/sql/chat-v2-cards-check.sql` | exit 0: `25 statements, 4 plpgsql functions, 11 DO blocks: all parse` |
| the six contract SQL blocks by node `includes` | 6/6 VERBATIM |
| `npm run typecheck` | exit 0 |
| `npm test` | 1523 tests, 1523 pass, 0 fail |
| `npm run build` | exit 0 (one run; no collision) |
| `npx eslint handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs scripts/local-seed.mjs` | exit 0 |
| `git show 75500e3:scripts/local-seed.mjs \| npx eslint --stdin --stdin-filename scripts/local-seed.mjs` | exit 0 (parity) |
| `node --check` on the tool and the seed | ok |

Nothing was run against a database (cloud session): the PRE-FLIGHT, the POST-CHECKs, the probe, the check script
and the seed remain the Mac's rehearsal (contract 13.3, Mac step 1).
