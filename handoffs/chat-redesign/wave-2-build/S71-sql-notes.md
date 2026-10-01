# S71 SQL batch notes (migration B gains chat_removals)

Started 2026-10-01. Contract: S71-amendment.md Part A1, A2, A6. Owner files: supabase/migrations/20261001110000_chat_v2_cards.sql, scripts/sql/chat-v2-cards-check.sql (+ scripts/local-seed.mjs only if it enumerates B tables).

## Plan
1. Read migration B whole (PRE-FLIGHT, s1, 7.1, 7.2, step 8, step 9, ROLLBACK, headers, counts).
2. Edit B: 5th table, counts 4->5, 21->25 constraints, 27->31 constants, rollback section, header prose.
3. Edit check script (A6).
4. Rehearsal 1 of new file (scratch copy, COMMIT->ROLLBACK): count constants (expect 31).
5. Scratch full run with pasted constants + check script, one transaction, rollback.
6. Before/after proof.

## Log (append below)

### Baseline (before any run), local db supabase_db_vibe, Postgres 17.6
chat_polls null=t, chat_removals null=t, chat_event_cards null=t, chat_* functions (5 names)=0, messages=63, channels=51.
Contract catch to report: A2 does not mention the 7.1b "every foreign key cascades" check (confdeltype <> 'c'); chat_removals_removed_by_fkey is ON DELETE SET NULL ('n') so that check would fail the file. Plan: keep the cascade check on the original 4 tables, add a separate chat_removals check (message_id_fkey cascades, removed_by_fkey sets null).
local-seed.mjs only detects migration B through chat_polls; no table list or count -> no change.
Step 8 probe never writes chat_removals and counts no tables -> left alone (survived-rows check only lists polls/event cards, which the probe writes).

### Edits done to B so far (originals backed up in scratchpad/s71/B-original.sql, check-original.sql)
- header: four->five tables; step 1 prose (25 constraints, 4 indexes); step 7 prose (25 texts); AMENDED IN S71 paragraph (f); LIVE STATE 21->25; LOCKS five->seven REFERENCES (2 places; chat_removals adds REFERENCES to messages and users); CHECK AFTER APPLYING tables 5; ROLLBACK drop table list (chat_removals first)
- PRE-FLIGHT f: 5 tables, 4 new constraint names, relations (idx_chat_removals_removed_by, chat_removals_pkey)
- section 1: create table + index + RLS + revoke + grant + comment
TODO: 7.1 a/b, 7.2 constants block (+4 constants, renumber ords), step 8 comment, step 9 record.

### B edits finished (7.1 a/b incl. separate chat_removals FK delete-rule check, 7.2 +4 constants with ords renumbered 22-25 con / 26-30 fn, step 9 tables 5, step 8 comment only)
### Rehearsal 1 (scratch copy s71/b-rehearsal1.sql, COMMIT->ROLLBACK): psql exit 3, ends 'ERROR: chat-cards: constants are empty'.
Printed constants: 31 (want_select + 25 want_con_* + 5 want_fn_*); the 4 new want_con_chat_removals_{pkey,message_id_fkey,removed_by_fkey,removed_role_check} are 22nd-25th con rows, after chat_event_cards_note_check and before the fns. Output in s71/b-rehearsal1.out.

### Check script edited (A6): header text, local guard for chat_removals, G2 loop +chat_removals, new section H (H1-H14).
### Before-proof recorded in s71/proof-before.txt (messages 63, channels 51, users 7, org_members 16, channel_members 56, events 9, auth_users 7, all five B tables null, 0 fns, 0 trg).
### Full run: s71/build_full.py makes s71/b-full-s71.sql (new B + 31 pasted constants + check script, ONE begin ... rollback). Running now.

### RESULTS (all on the local db, every run in one transaction ending in rollback; nothing committed or pushed)
1. Rehearsal 1 of the new file (s71/b-rehearsal1.sql, `\set ON_ERROR_STOP on`, COMMIT->ROLLBACK): psql exit 3, stops with 'chat-cards: constants are empty'. 31 constants printed (1 want_select + 25 want_con_* + 5 want_fn_*). New four in the right paste order: after chat_event_cards_note_check, before the five fns.
2. Full run (s71/b-full-s71.sql = new B + the 31 constants pasted + the check script, ONE begin ... rollback): psql exit 0; step 8 'behaviour check passed' (not probed: an ended event); APPLY RECORD 'tables 5, functions 5, trigger 1'; 'chat-cards-check: all 179 cases passed' (old 164 = +1 G2 for chat_removals +14 new H1-H14); no WARNING, no ERROR lines.
3. Before/after proof (s71/proof-before.txt vs proof-after.txt): identical (all five B tables null, 0 chat_* functions, 0 trigger, messages 63, channels 51, users 7, org_members 16, channel_members 56, events 9, auth.users 7).
4. Mutation tests (rolled back, s71/mut/): remover FK as ON DELETE CASCADE -> 7.1 b 'a foreign key of chat_removals has the wrong delete rule'; GRANT SELECT to authenticated inside B -> 7.1 a 'anon or authenticated holds a privilege on public.chat_removals'; the same grant after B -> check G2 fails for chat_removals (true/0/true/true/false).
5. Committed migration still has all 31 constants empty ('' ), verified by grep (31).

### Where the contract needed a decision (said out loud, not improvised silently)
- A2 does not mention 7.1b's 'every foreign key cascades' check; chat_removals_removed_by_fkey is ON DELETE SET NULL (A1), so that check would have failed the file. Kept it on the four old tables and added a separate pinned check for chat_removals (message_id_fkey 'c', removed_by_fkey 'n').
- A2 says 7.1 checks 'indexes +1 and the pkey index'; 7.1 has no index check at all (indexes are only enumerated in PRE-FLIGHT f). The +1 and the pkey relation landed in PRE-FLIGHT f (9 -> 11 relations: 4 indexes + 7 constraint-backed). No index check was invented for 7.1.
- Step 8 does not count tables and the probe never writes chat_removals: left alone, one comment line says why chat_removals is not in its 'a probe side row survived' check.
- The 'five REFERENCES of step 1' (LOCKS) became seven: chat_removals adds REFERENCES to messages and users.
- Additions beyond A6 (check script, all inside my file): a local guard for chat_removals, H4 (the author reads their own removed row, removed_by is null), H12/H13 (the remover's account is deleted: record stays, removed_by null), 14 H cases instead of the six A6 names.
- Documented limits unchanged: scripts/local-seed.mjs detects B through chat_polls only (no table list/count) -> no change. scripts/sql/chat-v2-after-deploy.sql was not looked at (not mine).
