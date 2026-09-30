# W2-B1 review — lens: security (migration B, the check script, the seed addition)

Reviewer: cloud session, 2026-09-30, read-only on the tree. Against: contract `wave-2-contracts.md`
section 3 (3.0-3.10), 13.2, 13.3; `wave-2-asis/database-map.md` 2.3-2.8, 4, 6.1-6.3, 8, 9; migration A
(`20261001100000_chat_v2_rooms.sql`, the `can_view_org_channel` / `can_post_org_channel` bodies A:1318-1397,
the standing-rule query A:1770-1781, the constraints A:826-845); `20260922090000:48-69` (asis 4.6 verbatim).
Commits reviewed: 637f20e, bc19a18, b885119, 666f683, 632c1a4, 10346b3 (`git show --stat` each; all files
inside 13.2's W2-B1 row; `package.json` / `package-lock.json` untouched, so libpg-query is not a dependency).

Method: refute. Every claim of the lens was checked against the file text, not the notes. Two checks were
run by node here: the six SQL blocks of contract 3.1 / 3.3 / 3.4 x2 / 3.5 x2 are VERBATIM in the migration
(`f.includes(block)` true for all six, lengths 2874 / 3286 / 1548 / 2623 / 776 / 1069), and the PRE-FLIGHT's
`want_org` / `want_dm` constants equal A's `$w$…$w$` texts character for character (so the PRE-FLIGHT cannot
refuse production on its own copy of the policy texts).

## Verdict

**PASS for the security lens. No HIGH, no MEDIUM. Two LOW.** Nothing in the batch lets a client role read or
write the four side tables over PostgREST, every callable function refuses `anon` / `authenticated` as its
first statement, the RPCs re-check the room rule the service role would otherwise bypass, the trigger
cannot raise into `org_members_drop_club_access`, the probe rolls back on `P0C29` (never A's `P0C21`), and
the standing rule is read before and after with A's exact query.

## Findings

### B1-SECURITY-1 — LOW — `supabase/migrations/20261001110000_chat_v2_cards.sql:979`
**What.** POST-CHECK 7.1.b adds a count the contract does not ask for: `count(*) from pg_constraint where
conrelid in (the four tables)` must be exactly 21. On Postgres 17 (the image the stack runs) that is true.
On Postgres 18 NOT NULL constraints are catalogued in `pg_constraint` (`contype = 'n'`), so the same file
refuses with `the four tables carry N constraints, not 21` on a stack whose 21 named constraints are all
present and correct. PRE-CHECK 5 (`select version()` equal to the local stack's) makes this a stop, never a
leak, and the Mac rehearsal will see it if the local image ever moves; it is a version-bound assertion in a
file meant to be re-applied after a rollback.
**Fix.** Restrict the count to the kinds the file creates: `and c.contype in ('p', 'u', 'f', 'c')` in the
`select count(*) into n from pg_constraint c where c.conrelid in (…)` at :975-977. (The count is the
builder's addition, not a contract statement; the 21 by-name check at :955-973 stays.)

### B1-SECURITY-2 — LOW — `scripts/local-seed.mjs:721`
**What.** The Event card is looked up by `kind = 'event_card'` + `content`, and its content carries the
event's `starts_at` label (`Event: Chat Seed Game Night · Thu Oct 8, 7 PM — …`). The seed re-dates its
events every run (`inDays: 5`), so a run on a LATER UTC day builds a different content, finds nothing, and
calls `chat_create_event_card` again: the Lounge gains a second Event card for the same event each day the
seed is run. Not an inconsistency (every card is written through the RPC, side row and all) and the notes
say "same UTC day" — but the Mac handoff should say it out loud so a duplicated card is not read as a bug
in `hydrateCards`. Contract 13.2 pins the lookup ("by `messages.kind` + `content`"), so the code stays.
**Fix.** One sentence in the Mac handoff / B1-notes: "a seed run on a later day adds one more Event card
(its content carries the date); the poll and the sign-up are found and left alone." No code change.

## Holds (each refuted against the file; line numbers are the migration's unless named)

1. **The 42501 idiom first.** `chat_create_poll` :659, `chat_create_event_card` :734, `chat_cast_vote` :784,
   `chat_reply_counts` :847: `if current_setting('role', true) in ('anon', 'authenticated') then raise
   exception 'not allowed' using errcode = '42501'` is the first statement of each, before any read. The
   STABLE reader carries it too (a PostgREST GET on `/rpc/chat_reply_counts` answers 42501, never a count).
   The trigger function has none and needs none (returns `trigger`: not callable over REST, contract 3.6).
2. **security definer + `set search_path to ''` + qualified names.** All five: `security definer`; the three
   writers `set search_path to '' set timezone to 'UTC'` (:645, :726, :775), the reader and the trigger
   `set search_path to ''` (:844, :882-885). Every relation is `public.`-qualified; every function call is
   `public.can_post_org_channel` / `public.can_view_org_channel`; the built-ins used (`btrim`, `jsonb_*`,
   `cardinality`, `now`, `count`, `nullif`) resolve in `pg_catalog`, which an empty search_path still
   implies. POST-CHECK 7.1.c (:989-1008) reads `prosecdef`, `provolatile` and `proconfig` back exactly
   (`array['search_path=""', 'TimeZone=UTC']` / `array['search_path=""']`), the trigger function included.
3. **The four tables: RLS on, no policy, revoke all, grant to service_role only.** :607-618, in that order;
   `comment on table` each (:620-627). 7.1.a (:922-952) reads back `relrowsecurity`, `pg_policies` = 0,
   `has_table_privilege` false for `anon` and `authenticated` on SELECT/INSERT/UPDATE/DELETE, true for
   `service_role` on the four, false for `service_role` on TRUNCATE. `has_table_privilege` sees PUBLIC and
   default-privilege grants too, so the Supabase default ACL (`arwdDxtm` to the three roles) is proven gone,
   not assumed gone.
4. **GRANT EXECUTE to the three roles right after each function.** :716, :760, :830, :866, each after its
   `comment on function` (A's order, DM 2.8). None for the trigger function (3.6). 7.1.c's second loop
   (:1009-1022) reads `has_function_privilege` for the three roles on the four callable signatures.
5. **The standing rule before and after.** PRE-FLIGHT i (:538-548) and POST-CHECK 7.1.f (:1108-1118) are
   A:1770-1781 word for word (`prokind = 'f'`, `format_type(prorettype) not in ('trigger','event_trigger')`,
   `not has_function_privilege('anon' | 'authenticated', oid, 'EXECUTE')`), which is the query of
   `20260922090000:61-69` (asis 4.6). Expect 0 rows both times.
6. **The RPCs re-check what RLS would have (the service role bypasses it).**
   - `chat_create_poll` / `chat_create_event_card`: `can_post_org_channel(p_channel, p_user, null)` → P0C21
     (:674, :743). Under `service_role` that function's role arms fall through to the real test (A:1372-1374),
     so "not a member", "member on a Board", "closed event chat" and "a dm (`org_id` null → `can_view` false)"
     are all refused. Shape before room (3.3.1), so a bad body never reaches the policy call.
   - `chat_create_event_card`: `c.org_id` of the room, `e.org_id = v_org and e.ends_at > now()` → P0C23
     (:745-750): another club's event, an ended one, a random uuid, a room with no club. A cancelled event
     is a deleted row here (`DELETE /api/events/[id]`; the check script's E7 proves the cascade), so it is
     "missing" → P0C23 too: no gap.
   - `chat_cast_vote`: `removed_at` (:792-798), `can_view_org_channel(v_poll.channel_id, p_user)` → P0C24
     (a non-member, someone who left, a member on a private room they are not in; A:1326-1339 — under
     `service_role` it answers about any uid), the option's `o.poll_id = p_poll` (:800-802, structural by
     the composite FK `chat_poll_votes_option_fkey (option_id, poll_id) → chat_poll_options (id, poll_id)`),
     `closes_at <= now()` and, outside a Board, `can_post_org_channel` → P0C25 (:803-806; the event chat's
     7-day window is that function's own UTC rule), capacity counted AFTER `for update` on the poll row
     (:791) and the option row (:801) → P0C26 (:813-816), single choice = delete then insert (:817-821),
     `on conflict do nothing` on the PK `(option_id, user_id)`, off = idempotent delete (:822-824). The
     `v_kind <> 'board'` arm can never see a null `kind`: a club room always has one after A
     (`channels_kind_by_type`) and a dm is refused by `can_view` first.
7. **Nothing lets a client role write the side tables over PostgREST.** No grant, no policy (3, above); the
   only writers are the four functions as their owner and the service role. A client cannot forge a card
   row in `messages` either: both INSERT policies keep `kind = 'text'` and `card_event_id is null` (the
   PRE-FLIGHT declares their exact texts at :276-290 and compares them at :362-374, equal to A's — checked by node here) and `authenticated`
   holds no UPDATE on `messages` (:403-408, read again at :1068-1073). The one client path that touches a
   card is `messages_delete_own` (the author hard-deletes their own card; the CASCADE takes the side rows,
   DM 8.4): documented, not a leak, and proven by the check script (D16-D18). Voter names never leak by a
   direct read (D5-D8 of the check script: `select count(*) from chat_poll_votes` as a student → 42501).
8. **`chat_votes_drop_access` tolerates vanished rows and never raises.** :882-903: the body is wrapped in
   `begin … exception when others then raise warning 'chat-cards: % failed: %', tg_name, sqlerrm; end;
   return null;` (A's AFTER-trigger idiom, DM 2.8). A dm/group row or a room already gone → `v_org is null →
   return null` (on a `channels` or `users` cascade the parent is gone before this AFTER ROW trigger runs;
   the check script's E7-E9 walk exactly that and count on no WARNING line). Officers keep their votes by
   the `org_members` read, and on a leave/removal the `org_members` row is already gone inside
   `org_members_drop_club_access`'s DELETE, so owners lose theirs there too (3.5, E4-E5). SECURITY DEFINER
   is what makes this safe under a student's own `channel_members_delete_own_pending` DELETE: the trigger
   deletes votes as its owner, never as `authenticated` (which holds no DELETE on `chat_poll_votes`).
9. **The lock story and `lock_timeout`.** `begin; set local lock_timeout = '5s';` (:257-263), the header's
   APPLY ORDER names SHARE ROW EXCLUSIVE on `messages`, `channels`, `users` (the five REFERENCES of step 1)
   and on `channel_members` (CREATE TRIGGER), the probe's fixture search is A:1809-1815's (`limit 50`, no
   loop over real rows, :1303-1320), and the ROLLBACK block restates `SET LOCAL lock_timeout = '5s'`. The
   probe's writes are row locks on probe rows and one `orgs` row (via `bump_org_activity_on_message`), all
   inside the subtransaction the `P0C29` raise undoes.
10. **P0C29, not A's P0C21.** :1636 `raise exception using errcode = 'P0C29', message = res;` caught at :1637
    `exception when sqlstate 'P0C29'`. Every probe is wrapped in its own `begin … exception when others then
    got := sqlstate; end`, so an RPC's P0C21..P0C26 is recorded, never caught by the outer handler. After
    the block: `state = want`, `current_user = me`, no `chat-cards probe:%` row, no `chat_polls` /
    `chat_event_cards` row (:1642-1654). The probe returns to the file's role with
    `execute format('set local role %I', me)` and clears `request.jwt.claims` (:1326-1334, :1577-1578).
11. **The probe's 42501 rows as `authenticated`** (:1550-1581): every RPC, `select 1 from chat_polls`, and
    `insert into messages (… 'poll')` → 42501 through A's unchanged policy; the reply under the Board poll
    is accepted on purpose (14.28). `vote_outsider` expects P0C24 and gets it: `can_view_org_channel` refuses
    at `NOT is_org_member` (A:1330) before the room's privacy arm, so a public Lounge does not let an outsider
    past the view check into `P0C25`.
12. **PRE-FLIGHT and POST-CHECK against the contract's list.** 3.0.1-3.0.9 in order (:266-549): already-
    applied first; A's columns / function / two CHECKs; the three `md5(pg_get_functiondef)` fingerprints
    (never `prosrc`; `is_blocked_either_way` not pinned, DM 9); the two INSERT texts, `messages_select_org_member`
    only when `want_select` is non-empty (else NOTICE + `chat_cards.notes`), exactly two permissive INSERT
    policies (`cmd in ('INSERT','ALL')`, stricter than asked), RLS on the three tables; the grants as found;
    every name free (4 tables, 21 constraints, 9 relations, 5 functions, the trigger); the trigger sets by
    name and by count; the data shape with the `allow_orphans` hand-answer and `Stop and ask Franky`; the
    standing rule. 3.7 fully (:922-1119) and the constants block LAST (:1121-1242) with the exact NOTICE
    formats and the single `constants are empty` raise. The APPLY RECORD goes on `chat_create_poll`'s
    comment, never `chat_repair_club`'s (:1661-1685); `file md5` reads `chat_cards.file_md5` or `NOT GIVEN`.
13. **The seed addition** (`scripts/local-seed.mjs:633-744`): detects B by `admin.from('chat_polls')
    .select('message_id').limit(1)` with `42P01` / `PGRST205` = skip; every card goes through the RPC with
    the service key (never a direct table write), so a production-shaped local database is consistent after
    it: a `messages` row of the card kind always has its side row. The authors (B member, E admin, A owner)
    are Lounge members of `chat_seed_club` after A's backfill; the event (`inDays: 5`) passes `ends_at >
    now()`. The content the seed stores equals `cardFallbackContent` (`Poll: …`, `Sign-up: …`, `Event: <title>
    · <Thu Oct 8, 7 PM> — <note>`; `when.ts:122-130` drops `:00`, the seed does the same; whitespace
    collapsed; 299 chars + `…` past 300). The `HAS_KIND` guard keeps it off a pre-A database.
14. **The check script** (`scripts/sql/chat-v2-cards-check.sql`): psql first line, `inet_server_addr() is
    not null` → refuse (local unix socket only), `to_regclass('public.chat_polls')` guard, one transaction
    ending in `rollback;` (:842), pg_temp helpers that set claims + `set local role` per call and restore
    both. Section G asserts `for update` twice in `pg_get_functiondef` of `chat_cast_vote` (G1), the four
    tables' catalog facts (G2), the trigger (G3), the five functions' definer/volatility/config (G4), the
    standing rule on the four (G5). Sections B/C/D cover every refusal code of 3.2 and the client-role
    refusals of 3.8.4 plus the ones the migration's probe cannot reach (a dm, Officers, a leave, a removal,
    an RSVP withdrawn, an event cancelled, the 200/201-id limit).
15. **Ownership and gates.** Only 13.2's W2-B1 files were touched; the parse tool takes the library by
    `--lib` / `LIBPG_QUERY_DIR` from a scratchpad install and adds no dependency. B1-gate.md records the
    parse gate on both files, typecheck 0, test 1475/1475, build 0, eslint 0 on the two JS files; nothing
    here contradicts it (this review ran no gate; the cloud has no database either way).

## STOPPED / SIBLING

The builder wrote neither. Right on both counts: for B1's scope the contract is consistent with the code
(every name, column, code, sentence and SQL statement it pins is in the file as written; the two A
functions it calls read as DM 3.6-3.7 describe them; nothing in A contradicts the trigger's assumptions),
and B1-gate.md reports typecheck exit 0 on the first run with no error outside its files.

## Contract observations (not findings against B1; for the integration review)

- `chat_create_event_card` does not check whether `p_user` may SEE the event (visibility rules on `events`
  are the route's; the RPC checks club and window only). The card route reads the event with the service
  role after `ensureMember`, so a member can only share their own club's events — consistent with 3.4.
- DM 8.1.2 suggested pinning `md5(pg_get_constraintdef)` of `messages_kind_check` / `messages_card_event_shape`;
  the FINAL contract 3.0.2 asks presence only, and the file does what the contract says.
