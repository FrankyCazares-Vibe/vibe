# W2-B1 review, lens "sql" — migration B, the check script, the parse tool, the seed addition

Reviewer: cloud session (no database), 2026-09-30. Read-only on the tree except this file.
Commits reviewed: 637f20e, bc19a18, b885119, 666f683, 632c1a4, 10346b3 (base 75500e3).
Files: `supabase/migrations/20261001110000_chat_v2_cards.sql` (1,690 lines), `scripts/sql/chat-v2-cards-check.sql`
(842), `handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs` (79), the `scripts/local-seed.mjs` addition (113),
`B1-notes.md`, `B1-gate.md`. Against: contract section 3 (3.0-3.10), 13.2, 13.3; DM sections 2, 3.4, 3.8, 4, 5.4,
5.10-5.12, 6.2, 8, 9; migration A wherever the contract says "as A does".

Method: refute. Every statement of the file read against section 3 line by line; the six SQL blocks and the nine
rollback statements diffed by a node script; the parse tool installed (libpg-query 18.1.5) and run by me over both
files, over A, and over two deliberately broken files; the probe's and the check script's vote ledgers re-tallied by hand.

## Verdict

**PASS with one MEDIUM and four LOW.** No HIGH: no wrong answer, no leak, no gate red, no contract name, code,
sentence, column or SQL statement changed. Nothing here needs a second build; the MEDIUM is a six-line addition.

## Findings

### B1-SQL-1 — MEDIUM — `supabase/migrations/20261001110000_chat_v2_cards.sql:1068-1073`
**What.** Contract 3.7 (bullet "Unchanged") says step 7 re-reads "the grants of 3.0.5". 3.0.5 has two halves: the four
table privileges AND `has_function_privilege` for the three roles on the two A functions. 7.1.e re-reads only the table
half (lines 1068-1073). The standing rule of 7.1.f covers `anon` and `authenticated` on every public non-trigger
function, so what is left unverified after the file is `service_role`'s EXECUTE on `can_view_org_channel` and
`can_post_org_channel` — the two functions every RPC of this file calls under the service role. Nothing in B revokes
anything, so this cannot fail today; it is a pinned re-read that is missing, not a wrong answer.
**Fix.** After line 1073, copy PRE-FLIGHT e's loop (lines 410-421) verbatim, with the message
`'chat-cards: % is no longer executable by anon, authenticated and service_role'`.

### B1-SQL-2 — LOW — `supabase/migrations/20261001110000_chat_v2_cards.sql:211`
**What.** The ROLLBACK section's optional statement reads `DELETE FROM public.messages WHERE kind <> 'text';` (upper
case) where 3.10 prints `delete from public.messages where kind <> 'text';`. A comment line, semantically identical;
the contract's nine live rollback statements are present in the contract's spelling (checked one by one).
**Fix.** Lower-case the line so the ROLLBACK block reads as 3.10 prints it, character for character.

### B1-SQL-3 — LOW — `supabase/migrations/20261001110000_chat_v2_cards.sql:1365`
**What.** The probe's closed-chat fixture is found with `e.ends_at + interval '7 days' <= now()` inside a DO block, which
runs in the SESSION's TimeZone; `can_post_org_channel` pins `TimeZone=UTC` (A:969-971: day arithmetic on a timestamptz
follows the session zone, so 7 days is 168 hours only in UTC). In a non-UTC session with a DST change inside the window
the query can pick a chat A still holds open for an hour, and probe 11 (`closed_event_chat`) would read `accepted`
instead of `P0C21` — a spurious red, never a wrong apply. The header prescribes a UTC session (psql and the Management
API default), so this is procedural.
**Fix.** `e.ends_at + interval '168 hours' <= now()` (the same moment A computes in UTC, in any session zone).

### B1-SQL-4 — LOW — `supabase/migrations/20261001110000_chat_v2_cards.sql:1358-1360`
**What.** 3.8.3 names "a vote by a member of another club → P0C24"; the probe uses any `users` row that is not a member
of the probe club (a person in no club qualifies). Both answer `P0C24` through the same `can_view_org_channel` arm, so
the outcome is the same; only the fixture is looser than the sentence. The check script's C22 (outsider) AND C23
(the other club's owner) cover both shapes.
**Fix.** None required. Optionally prefer a member of another club: add
`order by (exists (select 1 from public.org_members x where x.user_id = u.id)) desc` before the `limit 1`.

### B1-SQL-5 — LOW — `scripts/local-seed.mjs:650-668`
**What.** The seed carries its own copies of `eventWhen` (`eventWhenLabel`) and of `cardFallbackContent`'s collapse-and-cut
rule (`cardContent`). Checked against today's `src/lib/chat/when.ts:122-130,203-208` and `cards/fallback.ts`: identical
output (3-letter weekday and month, `:00` dropped, 300 code points with the 300th replaced by `…`, campus zone). The seed
is an `.mjs` script and cannot import the TS modules, so a copy is the only way; the risk is drift after a later change
to `when.ts`, which would leave the seed's stored `content` differing from route-made cards (the seed stays re-runnable
against itself either way).
**Fix.** None now; the comment already names both source functions. If `when.ts` changes, this is the place to update.

## STOPPED / SIBLING

The builder wrote neither. Judged right: nothing in section 3 contradicts the code or itself in a way that needed a stop.
Two tensions were resolved without changing a name, code or sentence, and recorded under "Decisions" in B1-notes.md:
(a) 3.0.4 needs `want_select` in the PRE-FLIGHT while 3.7 places the constants in the last block — declared once in the
PRE-FLIGHT and carried through `chat_cards.want_select` (the section's own set_config idiom); the NOTICE still prints
`want_select := $w$…$w$` first in paste order, and 7.2 refuses the file on an empty value. (b) 3.8.7's survival check
`content like 'chat-cards probe:%'` cannot see rows whose content 3.8.1 itself prescribes as `Poll: q`; the file keeps
the contract's check and adds `exists (select 1 from public.chat_polls) or exists (select 1 from public.chat_event_cards)`,
which catches every RPC-made row. Typecheck ran green on the first run; no SIBLING entry was needed.

## Holds (what I tried to refute and could not)

**The parse gate, run by me** (libpg-query 18.1.5 in my own scratchpad): migration B `47 statements, 5 plpgsql
functions, 5 DO blocks: all parse` exit 0; the check script with `--strip-psql` `25 / 4 / 11` exit 0; A `60 / 6 / 6`
exit 0 (calibration); `do $$ begin if x then end $$;` exit 1 naming line 2; a function body with `selec 1` exit 1.
The tool cuts each statement by `stmt_location` / `stmt_len` and parses every `LANGUAGE plpgsql` function AND every
DO block with `parsePlPgSQLSync` (13.3 asks only for the functions). `npx eslint` on the tool and the seed: exit 0.

**Section 3 verbatim.** The six SQL blocks of 3.1, 3.3, 3.4 (x2), 3.5 (x2) are in the file character for character
(node `includes` over each block). The 21 constraint names, the 9 relation names (3 indexes + 6 constraint-backed) and
the 5 function names of 3.0.6 all appear in PRE-FLIGHT f, in 7.1.b, and in 7.2's 26-row paste list, in DDL order.
`want_org` / `want_dm` are byte-identical to A:1519-1528 (node compare). The three fingerprints equal DM:4.

**Header** in A's order (DM:2.1) with two extra sections (the SQLSTATE table, the departures) inserted after DOES NOT;
PRE-CHECK 1-5 including `select version()`; APPLY ORDER with the `set_config('chat_cards.file_md5', …)` line prepended
to the same request body and the local one-psql-invocation form; the Management API note; CHECK AFTER APPLYING 1-4;
ROLLBACK with "does not undo" first, the optional DELETE, the `allow_orphans` re-apply, the lock note, then the nine
statements of 3.10 in one BEGIN/COMMIT; COST 1-5 placeholders for the Mac.

**PRE-FLIGHT** a-i in 3.0's order, every pinned sentence present (`already applied (chat_polls exists). Nothing to do`,
`<fn> drifted (md5 %); re-read it first`, `select policy unpinned`, `a trigger this file was not written against: %`,
`Stop and ask Franky`). a runs before any fingerprint. `want_select = ''` → NOTICE + `chat_cards.notes` set + continue;
h appends `orphans allowed: <n>` with `concat_ws`. The permissive-INSERT set, RLS-on and grant checks are A's idiom
(A:1676-1681, A:1760-1768). The standing-rule query is A's h (A:1770-1781) verbatim, run before and after as 3.0.9
asks. The trigger set is checked twice (by name list and by count per table), the count list carrying 1 for
`channel_members` in step 7. `channels.type = 'org_channel'` is A's own spelling.

**Step 7.1** covers every bullet of 3.7: the four tables (relrowsecurity, 0 policies, eight client privileges false,
service_role four true and TRUNCATE false); the 21 constraints on the right table, exactly 21, every FK `confdeltype = 'c'`;
the five functions in A's `(sig, vol, cfg)` loop (A:1686-1705) with `('public.chat_votes_drop_access()', 'v',
array['search_path=""'])`; EXECUTE for the three roles on the four callable ones; the trigger with `tgtype = 9`,
`tgenabled = 'O'`, empty `tgattr`, and (extra) `tgfoid`; the three A md5s, the two INSERT texts with A's
`roles = array['authenticated']::name[] and qual is null` filters, the table grants, the trigger sets plus the one new
row. **7.2 is LAST**: reads `got_select` and 26 `got_*`, sets `any_empty` on any empty want, prints all 27 NOTICE lines in
paste order (`want_select := $w$%$w$`, `want_con_<conname> := $w$%$w$`, `want_fn_<name> := '%'`) and raises ONCE
`chat-cards: constants are empty`; otherwise each mismatch raises `… does not read as written`. Every empty constant is
`''`, never `$w$$w$` (which would close the `$$` body) — the file says why, twice.

**Step 8 (P0C29).** The rollback state is `P0C29`, never a refusal code (DM:2.5). Fixture search is A:1809-1830's loop
(50 candidates, claims + `set local role authenticated`, `can_publish_now() and has_recorded_consent()`, back to `me`),
extended with the Lounge/Board/upcoming-event/officer conditions the probes need; skip = `chat_cards.probe := 'skipped: …'`
+ NOTICE + return, never a stop. Accepted probes first. All of 3.8.1-3.8.7 present: the poll shape string
(`poll/Poll: q/null/null/0:null,1:null`), the sign-up override (`true, false` sent → `signup/false/true/0:1`), the
officer's Board poll, the Event card shape with the note; the 15 refusals with the closed chat, the foreign and the ended
event left out and NAMED in the record when absent; the votes (single choice, multi, off, past `closes_at` by a direct
insert, the 1-spot slot officer → member `P0C26` → officer twice `accepted/1`, the option of another poll, the removed
message, the outsider, the member on the Board poll); the four RPCs + `select 1 from chat_polls` + `insert … kind 'poll'`
as `authenticated` → `42501`, the reply under the Board poll accepted (RETURNING under RLS is A:1893-1901's own idiom);
the trigger walk `2/1/1 → 0/1/1 → 0/1/1` (my re-tally agrees: the member's two multi-poll votes survive the removal of
that poll, the officer's slot, the member's Board vote); reply counts `1 / none / 1`. After the inner block: state =
want, `current_user = me`, no `chat-cards probe:%` row, no `chat_polls` / `chat_event_cards` row. `res` can never be
null (every branch assigns `got` or coalesces). No `messages` constraint requires `removed_reason` with `removed_at`
(only a length check, 20260923090000:2137), so the bare `removed_at`/`removed_by` update is safe; the two
`messages` triggers are INSERT / UPDATE OF media_url, channel_id only. `channel_members` re-insert uses `role 'member'`
(CHECK admin|member, DM:5.4) and the columns A's triggers write.

**Step 9.** The APPLY RECORD string equals 3.9's format token for token, appended to `chat_create_poll`'s comment with
A's `obj_description` / `execute format(… %L …)` shape (A:1941-1959), never to `chat_repair_club`'s. The md5 is read
from `chat_cards.file_md5` and never written in the file; `NOT GIVEN` on an empty setting.

**plpgsql pitfalls looked for and not found.** No variable shadows a column that a query references (`root` / `n` of
`chat_reply_counts` are unreferenced in its SELECT; `bad`, `n`, `m`, `fp`, `got`, `f` never collide). Every SELECT in a
DO block has INTO or PERFORM; a no-row SELECT INTO leaves NULL, always coalesced. `%rowtype` is schema-qualified.
`search_path ''` with every relation `public.`-qualified; only pg_catalog built-ins are unqualified. Exception blocks
only where A has them (the trigger's wrap, the probes). TimeZone pinned on the three functions that compare `now()`
(3.3/3.4 bodies); `closes_at` is a plain timestamptz compare. `set local role` / `set_config(…, true)` inside the inner
block are undone by the `P0C29` rollback and are also reset explicitly. `%` inside the two `$w$…$w$` NOTICE formats is
the single placeholder each; `''%''` prints the md5 in quotes. `raise exception using message = res` is not a format
string. `eleven jsonb := (select …)` is a legal declaration default. STABLE `chat_reply_counts` sees the block's
earlier writes (a new snapshot per outer statement).

**Grants / comments (3.6).** Four `revoke all … from anon, authenticated, service_role` + `grant select, insert, update,
delete … to service_role` (DM:6.2); RLS on, no policy; `comment on table` x4 citing 3.1; each callable function:
`comment on function` (section, SQLSTATEs, the 3.3.1 sentence) then `grant execute … to anon, authenticated,
service_role`; the trigger function commented, no grant.

**The check script.** `\set ON_ERROR_STOP on` first non-comment line (rooms-check:63 idiom), `inet_server_addr()`
guard (rooms-check:70), B-present guard, `begin;` … `rollback;`; helpers in `pg_temp`; own fixtures with the exact
`auth.users` / `handle_new_user` / `school_verified` / dm / rsvps idioms of rooms-check (212-227, 427, 478-481); every
3.8 case plus the paths the migration cannot reach (a dm, Officers, the upcoming event chat, a leave, a removal, an RSVP
withdrawn, an event cancelled as the signed-in owner — the route deletes with the caller's own client too,
`events/[id]/route.ts:176-180` — the 200/201 limit, the catalog, `for update` x2 by counting in
`pg_get_functiondef`); last NOTICE `chat-cards-check: all N cases passed`. My re-tally of E0 (`4/1/1/1/1/1/1/1`) and
B43 (`12/3`) from sections A-D agrees with the script.

**The seed (13.2).** Detection by `admin.from('chat_polls').select('message_id').limit(1)` with `42P01` / `PGRST205` =
skip; lookup by `messages.kind` + `content` in the Lounge before each RPC; one poll (B), one sign-up (E), one Event
card (A) — owner, admin and member of `chat_seed_club` (seed lines 485-492), so `can_post_org_channel` holds; content =
`Poll: …` / `Sign-up: …` / `Event: <title> · <Thu Oct 8, 7:30 PM> — <note>` as `fallback.ts` builds it; capacities
within 1-50; re-runnable the same UTC day (the Event card's date line moves with the seed's daily re-dating, which the
comment says).

**Gate record (B1-gate.md).** Reproduced here: both parse gates, the calibration on A and rooms-check, the two broken
files, eslint exit 0. The typecheck / test / build numbers are the builder's (out of this lens; the integration review
gates the tree). The Mac paragraph is right: rehearsal 1 stops in 7.2 after 27 NOTICE lines, the probe never runs
there; the paste is `want_select` into the PRE-FLIGHT and 26 into 7.2; an empty constant stays `''`.
