# Critique of `wave-2-contracts-draft1.md` — lens: SCHEDULE (2026-09-30, S70)

Read-only review from a CLOUD session (no database, no browser, no `.env.local`; repo HEAD `15a8286` on branch `claude/relaxed-davinci-9d11h3`). Scope of this lens: scope, order, gates, the cloud/Mac hand-over, the deploy and rollback order, what changes for people without the flag, the "not in wave 2" list, the carry-over table, the open-point defaults, and the Mac handoff. Other lenses' ground (database, routes, screens, split, privacy) is touched only where this lens adds evidence.

What was actually run here (nothing else): `npm test` (1,374 / 1,374 green, matching 13.3); `npm view libpg-query version` (the npm registry answers through the proxy: 18.1.5) and a scratchpad install of `libpg-query` that parsed migration A whole (60 statements, 8 plpgsql bodies) and caught a broken plpgsql body in a 3-line test file; `initdb` from the container's PostgreSQL 16.13 binaries (refuses: "cannot be run as root"); `npm run build` (see M4). No source file, migration or handoff other than this one was changed.

## Verdict

**Buildable in the week, with the changes below; not deployable as written.** The order (split alone → four backend batches → three screen batches → integration) and the deploy order (B applied and recorded → merge → flag, Production only) are right, the open points all carry a default, and every carry-over from the S69 close and from contract 14–16 has a home (table below). What fails is around the hand-over: the draft says the flag-off surface changes in ONE place when it changes in eight; the migration file the cloud pushes is not the file the Mac applies and nothing says who commits the difference; the only parse of ~1,000 lines of SQL is the Mac's first rehearsal although a parser is one `npm install` away; the flag rollback relies on an env var being "read at request time", which Vercel does not do; and the calendar is one sentence ("week of Oct 5; freeze Oct 15") for a build that starts today, needs the Mac on two of the four days Franky has promised elsewhere, and has no cut line.

Counts: 2 HIGH, 8 MEDIUM, 6 LOW.

**The top changes**

1. **Replace "nothing changes with the flag off, with ONE exception" by the eight-row table of H1**, and make it the integration review's flag-off checklist.
2. **Write the Mac's migration steps as a numbered list that ends in a commit** (H2): three rehearsals (constants → md5s → green), the local apply, the commit of the pasted constants on the branch, the push, and a "file applied = file merged" check in the APPLY RECORD.
3. **Add a SQL parse gate in the cloud** (M1): a 30-line tool over `libpg-query` under `wave-2-build/tools/`, exit 0 on migration B and the check script.
4. **Say "and redeploy" wherever an env var changes** (M2), and make the screens' rollback "unset + redeploy, or Vercel's instant rollback".
5. **Pin the calendar and the cut line** (M3): cloud Sept 30–Oct 3, Mac window 1 Oct 5–6 (before f9 on Oct 9), Mac window 2 Oct 12–14, Oct 15 freeze = the flag-OFF surface only; W2-S3 (cards + tray) is the first batch that moves to window 2 if window 1 slips.

Severity: **HIGH** = built literally it breaks something, leaks something, or a batch cannot finish. **MEDIUM** = real rework, a missed file, a payload a screen cannot use. **LOW** = wording to pin.

---

## HIGH

**SCHEDULE-H1. The flag-off surface changes in eight places, not one; the integration review would check against a false baseline.**
- Evidence:
  - Draft 0 `:24`: "What everyone sees change after wave 2 with the flag OFF: nothing, with ONE exception" (the stub, 8.6); 13.1 `:943` sends the integration review to check "flag off = nothing changes but section 8.6".
  - The draft itself builds these flag-independent changes, each reachable by every signed-in person with the switch unset:
    1. The stub in every thread GET plus `blockedIdsFor` — a NEW `blocks` read on EVERY thread read for EVERY viewer, club room or dm (9.1 `:768`: "readChatMessages and readChatMessage call blockedIdsFor first; null → 503 try_again"). The old screens poll the thread GET every 2 s in three places (BN 8, `B4-review-edges.md:19-36`): one more PostgREST call per poll for the flag-off majority and desktop, and a new 503 path on a failed `blocks` read where today's read succeeds.
    2. `?after=` that is not a timestamp: body `{ ok: false, error: "Invalid after" }` becomes `refusalBody("invalid_after")` with the sentence "Reload to catch up." (9.2; today `message-read.ts:711`, `messages/route.ts:115`).
    3. `reply_count` computed by `chat_reply_counts` (9.4) — same numbers on a database with B, the walk without it; a different code path for every Board read, flag or no flag.
    4. `DELETE …/messages/[messageId]` (6.1, "Not gated by the flag"): an owner/admin/mod can now remove someone else's message over the API; a non-sender in a dm gets 403 `not_allowed` "You can't remove this message." instead of "Only the sender can delete this message" (`[messageId]/route.ts:45`). No old screen shows that text (grep over `public/html`, `MessagesMobile.tsx`, `campus-home.tsx`: no match), so it is API-only.
    5. `POST …/channels/[channelId]/members` (6.3, D8): board / lounge / event → 409 `room_locked`. API-only: the desktop Access tab is hidden for event rooms and for public rooms (`campus-home.tsx:3246-3247`, `show: channel.is_private && canManage && !eventRoom`), and Board / Lounge are public.
    6. `/api/me/calendar` (7.3): the RSVP select gains `org_id` and the route calls `chatV2For` on every request (one `org_members` read when the switch is on and the caller is not listed); with the flag off the three fields are null. Desktop "My Calendar" reads this route.
    7. The report snapshot (5.3): `kind, thread_root_id` added to the `message` spec's columns (`reports/route.ts:318-322` today) and `card: await snapshotCard(id)`.
    8. Migration B's trigger `chat_votes_drop_access` fires on every `channel_members` DELETE for everyone (leave, demotion, RSVP withdrawn, cascades; DM `:217`), wrapped so it cannot raise.
  - The task's own expectation for this lens ("must be nothing, except the reply-count function and the ?after= code") is contradicted by D1 (the stub), D8 and D9 as the draft builds them; Franky has not seen that list.
- Change (replace the sentence at 0 `:24` and the criterion at 13.1 `:943`):
  > **What changes with the flag OFF (the integration review checks exactly this list, nothing else):** (1) a club-room message from a block pair arrives as a stub and the four old renderers skip it (8.6; one `blocks` read per thread GET, a failed read = 503 `try_again`); (2) `?after=` not a timestamp → 400 `invalid_after` "Reload to catch up." (was "Invalid after", no code); (3) `reply_count` comes from `chat_reply_counts` (the walk when B is missing); (4) the remove route: officers/mods may remove in their club's rooms; a dm/group non-sender reads 403 `not_allowed`; (5) the by-name allow-list POST answers 409 `room_locked` on board / lounge / event (API only; no desktop tab reaches it); (6) the calendar's RSVP select carries `org_id` and the route asks `chatV2For`; (7) the report snapshot carries `kind`, `thread_root_id`, `card`; (8) migration B's trigger on `channel_members`. Nothing else: no screen, no copy, no route answer.
  And in 8.6: "The `blocks` read is the one new cost every reader pays; the desktop 2-s pollers included (open point: cache the viewer's block set per request in `MessageContext` so a GET reads it once, never per row or per helper)."

**SCHEDULE-H2. The migration file the cloud pushes is not the file the Mac applies, and nobody is told to commit the difference or to check that the file applied is the file merged.**
- Evidence:
  - 3.0.4 `:174`: the `messages_select_org_member` policy text "is copied from `pg_policies` on the Mac after the first rehearsal, never typed (the first rehearsal runs with the constant empty and raises)". 3.7 `:489`: the `md5(pg_get_functiondef)` of B's four functions are "`want_*` constants (empty on the first rehearsal → NOTICE + raise, A:1712-1716 idiom)". That is two edit-and-rehearse rounds on the Mac before a rehearsal can pass, so the committed file changes on the Mac.
  - 13.3 Mac step 1 `:966` says "paste the `want_*` constants … after the empty-constants run" and stops there. 13.4 `:973` opens with "The branch `chat-v2-wave-2` is green in the cloud and pushed; the Mac gates pass", then "apply B … merge to `main`": no commit of the pasted constants, no push, no check that `supabase/migrations/20261001110000_chat_v2_cards.sql` on `main` equals what the Management API received.
  - In wave 1 the same machine wrote, pasted, applied and merged (A's `want_*` at `20261001100000_chat_v2_rooms.sql:1519-1537`), so the gap never showed. In wave 2 the cloud writes and the Mac pastes; CLOSE `:24` forbids the cloud from merging, so the Mac must own the last commit of the branch.
  - The APPLY RECORD (3.9 `:507`) records counts and the probe, not the file's digest.
- Change (13.3 Mac step 1 becomes):
  > 1. `git fetch && git checkout <branch>` (M7 names it) → `pg_dump` local → **rehearsal 1** (the rollback copy; expected: `chat-cards: policy constants are empty` after the policy text is printed) → paste the text into 3.0.4's constant → **rehearsal 2** (expected: the md5 NOTICE + raise of 3.7) → paste the four md5s → **rehearsal 3** passes to `rollback;` → the real local apply (`psql -f`) → the three check scripts → **commit `chore(chat): migration B constants from the local rehearsal` on the branch and push** → the APPLY RECORD text gains `file md5 <md5sum of the committed file>` → the production apply sends `git show origin/<branch>:supabase/migrations/20261001110000_chat_v2_cards.sql` (never the working tree) → CHECK AFTER APPLYING (4): the md5 in the record equals `md5sum` of the file on `main` after the merge.

---

## MEDIUM

**SCHEDULE-M1. Migration B gets no parse in the cloud although a parser is one install away; a typo costs a Mac round trip.**
- Evidence:
  - 13.3 `:963`: "Migration B gets a read-through review … plus a `psql`-syntax dry parse if `pg_query`-like tooling is available offline; nothing is run." Nothing in `node_modules` parses SQL (`ls node_modules | grep -iE '^(pg|libpg|pgsql)'` is empty); `psql` 16.13 and `pg_dump` exist in the container (`/usr/bin/psql`, `/usr/lib/postgresql/16/bin/*`) but `initdb` refuses to run as root, so no throwaway server either.
  - The npm registry answers through the proxy (`npm view libpg-query version` → 18.1.5; `npm install` is already a listed cloud gate, CLOSE `:22`). Installed in the scratchpad, `libpg-query`'s `parseQuerySync` parsed migration A whole (60 statements) and `parsePlPgSQLSync` parsed its 8 function bodies; a deliberately broken body (`if x then end`) was reported as `syntax error at end of input`. DO-block bodies are string constants to the SQL parser and are not checked by it — they are the part reviewers must still read.
  - The Mac has two dated blocks in the week (f9 Android on Oct 9, demo days), so each cloud → Mac → cloud round is a day.
- Change (13.3, the cloud gate of W2-B1):
  > W2-B1 commits `handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs` (about 30 lines: `libpg-query` from a scratchpad `npm install`, never a repo dependency; `parseQuerySync` over the whole file, then `parsePlPgSQLSync` over every `CreateFunctionStmt`'s text by `stmt_location` / `stmt_len`; exit 1 on any error) and its gate is `node …/sql-parse.mjs supabase/migrations/20261001110000_chat_v2_cards.sql` exit 0, the same over `scripts/sql/chat-v2-cards-check.sql` with its psql first line stripped. The read-through by two reviewers stays for the DO blocks and the catalog queries the parser cannot judge.

**SCHEDULE-M2. "The env is read at request time" is wrong for Vercel; the screens' rollback (unset the switch) does nothing without a redeploy.**
- Evidence:
  - 13.4.6 `:973`: "…in Vercel, Production only, and a redeploy (the env is read at request time, but a redeploy is the habit)". 13.5 `:979`: "Unset `CHAT_V2_ENABLED` if the screens are the problem (the routes then 404 and the phone shows the old list)" — no redeploy named.
  - `flag.ts:52-54` reads `process.env` at call time, but on Vercel a deployment's serverless bundles carry the env captured when that deployment was built; a changed value reaches the next deployment (Vercel's documented behaviour; not verifiable from here, so labelled as such). The wave-1 contract already wrote it right: "set `CHAT_V2_ALLOWLIST=*` and redeploy" (`wave-1-contracts.md:66`).
- Change: 13.4.6 → "…Production only, then **Redeploy** (required: a deployment carries the env it was built with; the value is not read live)". 13.5 → "Screens the problem: unset `CHAT_V2_ENABLED` **and redeploy**, or use Vercel's instant rollback to the deployment before the flag (it carries its own env); either way the database is untouched." 13.4.7 → "Oct 26: `CHAT_V2_ALLOWLIST=*` and redeploy."

**SCHEDULE-M3. The calendar is one sentence for a build that starts today and needs the Mac on days Franky has promised elsewhere; there is no cut line.**
- Evidence:
  - Draft 0 `:11`: "in the week of Oct 5; freeze Oct 15; the flag on for everyone Mon Oct 26" — the only dates in 1,041 lines; `grep -n "demo day\|Oct 9\|Oct 4\|f9"` finds nothing but open point 21's aside. The session is Sept 30 and the cloud can start the split today (CLOSE `:22`).
  - Fixed points around it: f2 Oct 4 (Mac, CLOSE `:15`); demo days the week of Oct 5, where the plan shows the new chat to SAE (CLOSE `:14` "when the first new screen is ready"; `plan-critique.md:412-416`); f9 Android build Oct 9 (Mac + Android Studio, CLOSE `:15`); App Store submission Oct 16 with the freeze Oct 15 (CLOSE `:7`).
  - Size: wave 1's five batches were committed between 13:46 and 20:08 on Sept 29 (`git log`: B0 13:46, B1a 16:42, B1b-1 18:44, B1b+B4 and B5 20:08) with the local database beside the builders and the go-live at 00:10; wave 2 has nine batches and ~26 reviewer runs (table below) in the cloud, then ONE serial Mac day: three rehearsals + the local apply + the seed + three check scripts + the 59 + 10 wave-1 HTTP rows + about 60 new rows + the browser walk at 375px × 2 themes × 2 roles + PRE-CHECK + the production apply + merge + flag (13.3–13.4). Any contract bug the HTTP pass finds goes cloud → push → Mac again.
  - The freeze's meaning is unsaid: the reviewer sees the flag-OFF surface (8.6), so after Oct 15 only flag-gated code may deploy, and the H1 list is what the reviewed build carries.
- Change (a new 13.0 "Calendar", before 13.1):
  > | when | what | who |
  > |---|---|---|
  > | Sept 30 – Oct 3 | W2-S → W2-B1..B4 → W2-S1..S3 → integration review → the Mac handoff pushed | cloud |
  > | Oct 4 | f2 (mailbox) — no chat work | Franky |
  > | Oct 5 – 6 (window 1) | the Mac list 13.3 steps 1–4; PRE-CHECK; Franky's yes; apply B; merge; flag for the founders + SAE; the first phone test — before demo days show SAE the chat | Mac |
  > | Oct 7 – 8 | cloud repairs from window 1, if any | cloud |
  > | Oct 9 | f9 Android — no chat work | Franky |
  > | Oct 12 – 14 (window 2) | repairs applied; the flag-off walk repeated; the build that will be submitted | Mac |
  > | Oct 15 | **freeze of the flag-OFF surface** (the H1 list); flag-gated fixes may still deploy | — |
  > | Oct 26 | `CHAT_V2_ALLOWLIST=*` + redeploy | Franky |
  >
  > **Cut line:** if window 1 slips past Oct 9, W2-S3 (cards + the tray; its backend stays merged and harmless, the composer simply shows no "+") moves to window 2; then W2-S2's event chat; the home and the club space (W2-S1, W2-S2's Board + Lounge) are the demo-day minimum. The split, migration B and the four backend batches are never cut (they are what window 2 repairs against).

**SCHEDULE-M4. No `next build` in the cloud gates; typecheck and eslint do not catch what breaks a Next 16 build.**
- Evidence:
  - 13.3 cloud gates: typecheck, `npm test`, eslint, the split proof, stub harnesses, the SQL read-through. Wave 1 never ran a build either (`grep "next build\|npm run build"` over `B0-gate.md`, `integration-http.md`, `wave-1-contracts.md`: nothing); its first build was the production deploy at 00:12 (S69 `:91`).
  - Wave 2 adds four `server-only` modules (`cards/hydrate.ts`, `cards/snapshot.ts`, `blocks.ts`, `event-refs.ts`, 5.2–5.5) next to client files that import from the same folder (`stub.ts`, `when.ts`, `page-merge.ts`); a client component importing a `server-only` module type-checks and fails only at build. Route files with a stray non-handler export, and a `useSearchParams` outside Suspense on a static page (2.3 reads `?tab=` / `?channel=`), fail the same way.
  - `npm run build` RUNS in this container with no env: exit 0, "Compiled successfully in 17.1s", 121 static pages generated, `.next/` is git-ignored (run once for this critique; about 40 s in all). So the gate is available in the cloud today.
- Change (13.3 cloud gates): "**`npm run build` exit 0** in the cloud, after typecheck and before the reviews (about 40 s; it is the only check that sees `server-only` in a client import, a bad route export or a `useSearchParams` outside Suspense). The Vercel Preview build of the pushed branch must also be green before the Mac starts; the handoff carries the Preview URL."

**SCHEDULE-M5. The missing-schema table (3.10) has no row for the screens, the calendar fields, the allow-list guard or the report snapshot, and contradicts wave 1 on "without A".**
- Evidence:
  - 3.10 `:516-527` lists six rows: card routes, `hydrateCards`, `snapshotCard`, `readReplyCounts`, the two reads ("need only A; unaffected"), the remove route. The lens asks for every card route, `hydrateCards`, the reads, the calendar fields, the screens.
  - The screens with the flag on and B missing (a Vercel Preview cannot reach this, but a local `next dev` before the apply, or after a B rollback, can): `POST …/cards` → 404 `not_found` → the sheet toasts "That's not there anymore." (1.3) — acceptable, unsaid; `PUT …/vote` → 404 → 11.8 calls `onRefresh`, which re-reads a row whose `card` is null → the fallback bubble — acceptable, unsaid.
  - Without A: 7.1.1 `:673` says the inbox answers `{ ok: true, clubs: [] }` while `wave-1-contracts.md` 3.10 (`:262`) pins "card routes, `/api/me/inbox`, `/api/orgs/[slug]/space` → 404 `not_found`"; 7.2.3 `:688` selects `kind` from `channels` and says nothing for the `42703` that column read gives on a database without A. 7.3 `:692-695` needs only A (`channels.event_id`), unsaid in the table.
- Change: add to 3.10's table the rows
  > | the calendar fields | need only A: `org_id` / `room_id` / `room_state` as 7.3; without A `eventRefsFor` fails on `channels.event_id` → the three fields null, one log line |
  > | the by-name guard (6.3) | `kind` null → as today |
  > | the report snapshot | `card: null` (`snapshotCard`) |
  > | the new screens (flag on, B missing) | the tray's POST → 404 → the toast "That's not there anymore."; a vote → 404 → `onRefresh` → the fallback bubble; nothing else changes |
  > | `/api/me/inbox`, `/api/orgs/[slug]/space` **without A** | inbox `{ ok: true, clubs: [] }` (the threads route's no-`kind` retry, 7.1.1) — a deliberate departure from wave-1 3.10's 404, said out loud; space: the `channels` read's `42703` → `isMissingChatSchema` → 404 `not_found` |

**SCHEDULE-M6. The thread-GET validator the Mac step relies on is not in the repo, and nobody is told to write it.**
- Evidence:
  - 13.3 Mac step 2 `:967`: "the thread GET validator extended for `card` and `hidden` stubs (blake blocks casey in the seed…)". BN 4.1: wave 1's `validate.mjs`, `q.sh`, `c.sh` and every raw answer live in the Mac session's scratchpad `wave1/integration/`, "NOT in the repo"; `git ls-files | grep -i validate` finds only `src/lib/events/validate*`; `handoffs/chat-redesign/wave-1-build/tools/` holds `cookie.mjs` alone.
  - The Mac session that runs step 2 is a new session (the S69 scratchpad may or may not survive); "extend" has nothing to extend from the repo, and writing a validator for `PollCard` / `EventCard` / the stub shape from scratch on the Mac spends window-1 time on what the cloud can do against `types.ts` today.
- Change (13.2 W2-B2's row and 13.3): "W2-B2 commits `handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs`: reads a saved `ThreadMessagesResponse` JSON (`node validate-thread.mjs <file> --role member|officer --room board|lounge|event|dm`) and checks every field of `ChatMessage`, `PollCard`, `EventCard`, the stub shape of 8.1 (every stub field at its pinned value), `room`, `viewer`; with a fixture test under `wave-2-build/tools/fixtures/`. The Mac feeds it the real answers of step 2 and 4; the handoff names the two tools (`cookie.mjs`, `validate-thread.mjs`) and the `q.sh` / `c.sh` one-liners to recreate."

**SCHEDULE-M7. The branch in the draft does not exist; the contract and the fact files are untracked; local `main` is behind `origin/main`.**
- Evidence:
  - Draft 0 `:20` and 13.4 `:973`: "the branch `chat-v2-wave-2`". `git branch -a`: `claude/relaxed-davinci-9d11h3`, `main`, `remotes/origin/claude/relaxed-davinci-9d11h3`, `remotes/origin/main` — no `chat-v2-wave-2` anywhere. HEAD `15a8286` is on the `claude/…` branch, pushed.
  - `git status --short`: `?? handoffs/chat-redesign/wave-2-asis/`, `?? handoffs/chat-redesign/wave-2-contracts-draft1.md`, `?? handoffs/chat-redesign/wave-2-critique/` — the documents every batch "reads first" (draft `:7`) are not in git; a builder in a fresh worktree or a Mac checkout would not find them.
  - `git log --oneline main -1` = `e4f8916`; `origin/main` = `5c68da1` (the two docs commits). A Mac session merging "main" must fetch first (13.4.4 says only "Merge to `main`").
- Change: (a) before W2-S starts: `git checkout -b chat-v2-wave-2` from HEAD (or keep the `claude/…` name and write THAT name in 0, 13.4 and the handoff — one name, everywhere), commit `wave-2-asis/`, the contract and the critiques, push with `-u`; (b) 13.4.4 → "`git fetch origin && git checkout main && git merge --ff-only origin/main && git merge --ff-only <branch> && git push`" (wave 1 fast-forwarded, S69 `:89`); (c) the handoff's first line names the branch and its head commit.

**SCHEDULE-M8. The batch and reviewer budget is twice wave 1's and the draft has no rule for a run cut off by usage limits.**
- Evidence:
  - The count, from 13.1 `:943` ("adversarial reviews (contract, security, behaviour, and for screens design…)") and 13.3 `:963` (W2-B1: "two reviewers (sql, security)"); the split's reviewers are unsaid (wave-1 B0 had contract, logic, move: 3):

    | batch | reviewers | repair | gates | runs |
    |---|---|---|---|---|
    | W2-S (alone) | 3 (contract, logic, move — unsaid in the draft) | 1 | 1 | 6 |
    | W2-B1 | 2 (sql, security) + the M1 parse | 1 | 1 | 5 |
    | W2-B2, W2-B3, W2-B4 | 3 each (contract, security, behaviour) | 1 each | 1 each | 15 |
    | W2-S1, W2-S2, W2-S3 | 4 each (contract, security, behaviour, design) | 1 each | 1 each | 18 |
    | integration review + handoff | 1 + 1 | — | 1 | 3 |
    | **total** | **26 reviews** | **8** | **9** | **47 agent runs + 8 builders** |

    Wave 1: 5 batches, 14 reviews (`wave-1-build/*-review-*.md`), 5 repairs, and two workflow runs cut mid-way by usage limits (CLOSE `:57`); "builders that were told 'an earlier attempt was cut off, read your notes and continue' picked up cleanly", and "editing a prompt (even one blank line) re-runs that agent and can re-run everything after it" (CLOSE `:56`).
  - The draft says nothing about how a cut-off is resumed, and 13.1 runs the four backend batches "side by side" and the three screen batches "side by side": a cut-off in one script loses up to four batches' progress unless each builder's notes are written as it goes.
- Change (13.1, after "Every batch: implement → …"): "One workflow script per stage (split; backend; screens; integration), never one for the wave. Every builder writes `<batch>-notes.md` before its first edit and appends after every commit, so a resumed builder continues from the notes. A cut-off run is finished by a NEW small script for what is left, never by editing the old prompt. Reviewers write findings to disk in pieces (13.1's rule) for the same reason."

---

## LOW

**SCHEDULE-L1. 10.3 compares lint against `HEAD~1`; the base is whatever commit precedes the split, which may not be `HEAD~1` after the batch's own commits.**
- Evidence: 10.3 `:824` "`git show HEAD~1:src/components/mobile/MessagesMobile.tsx | npx eslint --stdin …`" next to "`--base <the commit before the split>`" in the same sentence; 13.3 `:963` uses `<base>`.
- Change: "`git show <base>:…`", with `<base>` the same commit the split-check tool is given, written into `S-split-check.txt`.

**SCHEDULE-L2. The split's reviewer set is unsaid.**
- Evidence: 13.1 names the reviews for backend and screens; nothing for W2-S; wave 1's B0 had `B0-review-contract.md`, `B0-review-logic.md`, `B0-review-move.md`.
- Change: 13.1: "W2-S: contract (10.1's table), move (every declaration's home and imports), logic (no behaviour change: hooks order, props, literals) — the B0 set."

**SCHEDULE-L3. The local closed event chat is hand-made and not in the seed; a restore loses it and 3.8's probe then skips.**
- Evidence: 3.8 `:496` "the closed event chat when one exists (locally 'Chat Seed Closed Night', CLOSE `:50`)"; BN 3 (B1a row): "added by hand; the seed does not recreate it after a restore"; CLOSE `:51` offers a `pg_restore` of the pre-wave-1 backups.
- Change (13.3 Mac step 1): "Do not restore a pre-wave-1 backup before wave 2's rehearsal; if one is restored, re-add a closed event chat by hand first (an event of `chat_seed_club` ended 10 days ago, then `select public.chat_repair_club(<id>)`), or the closed-room probes of 3.8 and the HTTP rows of 13.3.2 skip."

**SCHEDULE-L4. The container's PostgreSQL 16 binaries and the reachable npm registry are unsaid in the cloud block; the next cloud session re-discovers them.**
- Evidence: `/usr/bin/psql` 16.13, `/usr/lib/postgresql/16/bin/{initdb,postgres,pg_ctl,pg_dump,pg_restore}` exist; `initdb` refuses root; `npm view` and `npm install` reach the registry through the proxy; `npm run build` runs (M4).
- Change (0, the cloud block, and the S70 close handoff): "The cloud has `psql` / `pg_dump` 16 (no server: `initdb` refuses root), the npm registry, `npm run build`; it has no Docker, no database, no browser."

**SCHEDULE-L5. The weekly after-deploy check and the "after any `chat-rooms` warning" rule are not in 13.4.**
- Evidence: `B1a-repair.md:59` (BN 3, B1a row): "the after-deploy check is run weekly and after any `chat-rooms` warning"; 13.4.5 runs it once after the merge.
- Change: 13.4.5 → "The after-deploy check, then weekly and after any `chat-rooms` / `chat-cards` warning in the database log."

**SCHEDULE-L6. 3.7 pins the md5 of B's own functions as a raise inside the production transaction; a deparse difference between the local and the production server would roll the apply back after the quiet hour was spent.**
- Evidence: 3.7 `:489` (`md5(pg_get_functiondef)` of the four functions "recorded as `want_*` constants"; a miss raises). A's identical idiom held on production (S69 `:88`: "`can_view_org_channel` md5 now `747ee06d…` (the file's 'after' value)"), so the two servers deparse alike today; the header's PRE-CHECK (3.9) does not record `select version()`.
- Change: 3.9 PRE-CHECK (5): "`select version()` on production equals the local stack's (recorded in the header)"; or make the four own-function md5s a NOTICE + APPLY RECORD entry rather than a raise. Uncertain: labelled as a guard, not a known break.

---

## The carry-over table (every item from the S69 close, contract 14–16 and BN 1–3, and where the draft put it)

| # | carry-over | source | landed at | status |
|---|---|---|---|---|
| C1 | room / viewer re-read only on the every-5th poll | CLOSE `:39` | 9.3, 14.23 (no `?brief=` in v1) | landed |
| C2 | grouped reply-count function in B; counts the viewer's own removed replies | CLOSE `:40`; `B4-repair.md:12` | 3.5 (`p_viewer`), 9.4 | landed |
| C3 | sentences for the ten codes + a code for `?after=` | CLOSE `:41`; contract 14.9 | 1.3, 9.2 | landed |
| C4 | `room_locked` doubles as the reserved-name refusal | CLOSE `:42` | 6.3, 14.9 (accepted for v1) | landed |
| C5 | by-name allow-list POST has no rule for board / lounge / event | CLOSE `:43` | 6.3 (D8) | landed; flag-off, H1 row 5 |
| C6 | `CampusMobile` `# name` drill-down | CLOSE `:44` | 2.2, 15 | landed (unreachable with the flag on) |
| C7 | demoted officer keeps Officers when added by name | CLOSE `:45`; contract 15 | 14.30 | landed |
| C8 | nested-button hydration warning | CLOSE `:46` | 15 | landed (not chat) |
| C9 | blocking against a direct database read | contract 15; S69 `:85` | 8.7 (after launch, clause written), 14.2 | landed |
| C10 | the stub's exact shape + the officer exception | contract 12.2; B0 reviews | 8.1–8.3, 14.1 | landed |
| C11 | half-made club on a failed owner-row insert | `B1b-routes-review-security.md:43-46` | 15 ("not chat, not this wave") | landed |
| C12 | Going line members-only until the stretch goal | `B5-repair.md:14` | nothing needed (stretch goal out) | landed |
| C13 | 201 / 200 of the channel writes carry no `kind` | `B1b-routes-notes.md:50` | 7.2.3 (rooms from a list read) | landed |
| C14 | event titles count in the name clash | accepted | 15 by omission | accepted, unsaid — fine |
| C15 | `/api/me/threads` non-member texts | accepted | 7.2 (`members_only` on the new reads) | landed |
| C16 | the three route cases after any migration | contract 15.8; `B1a-verify.md:102` | 13.3 Mac step 2 | landed |
| — | flag rollout: Production only, founders + SAE, Oct 26 `*` | CLOSE `:14`; START HERE 3 | 13.4 | landed; needs "redeploy" (M2) |
| — | the cloud block: written vs run; never merge from the cloud; end with a handoff | CLOSE `:18-26` | 0, 13.3 | landed; the handoff's content is 13.3 + H2 + M6 + M7 |
| — | contract 14.1 lint rule (per batch, no new errors in the 11 files) | contract `:636` | 13.3 | landed |
| — | 14.4 / 16.1 `canPostAnswer`; 16.2 `loadRoom` null; 16.5 helpers never throw | contract `:668-672` | 4.1, 6.1, 5.2, 5.5 | landed |
| — | 14.6 never re-format `timestamptz` strings | contract `:641` | 1.4 | landed |
| — | 14.10 role check before `outranks` | contract `:645` | 6.1 step 6 | landed |
| — | 15.1–15.8 A's facts (UTC days, six-step repair, eight lists, query-not-NOTICE, probe may skip) | contract `:649-657` | 3.0, 3.5, 3.8, 3.9 | landed |
| — | B0 F3: uuid rule for ids the card routes receive (`isUuid`) | `B1b-core-review-contract.md:61-65` | 4 (`isUuid` from `@/lib/pgrest`) | landed |
| — | B4: `before` never with `after` / `root` | `B4-repair.md:21` | 9.3 | landed |
| — | B4 F1: the thread-GET validator for `card` / stubs | `integration-http.md:275-300` | 13.3 step 2 | **gap: the tool is not in the repo (M6)** |
| — | B1a: after-deploy check weekly + after warnings | `B1a-repair.md:59` | 13.4.5 once | **gap: L5** |
| — | B1a seed: the closed event is hand-made | `B1a-review-seed.md:73-75`; CLOSE `:50` | 3.8 | **gap: a restore loses it (L3)** |
| — | Gotchas: resume replays prompts; usage limits cut runs | CLOSE `:56-57` | nowhere | **gap: M8** |
| — | `chat_repair_club`'s comment holds A's APPLY RECORD; B must not overwrite it | BN 8 | 3.6, 3.9 (B's record goes on `chat_create_poll`) | landed |

## The cloud / Mac split, deliverable by deliverable (what the draft says, and what it must add)

| deliverable | written | run / proven | walked | gap |
|---|---|---|---|---|
| the split (W2-S) | cloud | cloud: typecheck, tests, eslint compare, `split-check.mjs`; **+ `npm run build` (M4)** | Mac: the flag-off walk (13.3.4) | L1, L2 |
| migration B | cloud | cloud: read-through ×2 **+ the parse (M1)**; Mac: rehearsals ×3, local apply, the three checks, COST, **commit of the constants (H2)** | — | H2, M1, L6 |
| `chat-v2-cards-check.sql`, the seed addition | cloud | Mac | — | L3 |
| card routes, hydrate, snapshot, event-refs, blocks, stub | cloud (+ node tests for the pure parts, a stub harness for 3.10 / 3.2) | Mac: the HTTP rows of 13.3.2 | — | M5 (table), M6 (validator) |
| the remove route + `RemovedContentCard` `by` | cloud | Mac: HTTP rows | Mac: the removed card in the room thread | — |
| the three reads + the calendar fields | cloud | Mac: HTTP rows per account | — | M5 |
| the screens (S1–S3) | cloud; Light + Night + 375px "by reading" | cloud: typecheck, tests, eslint, **build (M4)** | Mac: 13.3.4 at 375px × 2 themes × 2 roles | M3 (the cut line) |
| the Preview build | Vercel on push | green before the Mac starts | nobody signs off on it (production data, H1's list live) | M3/M4 |
| the production apply, the merge, the flag | — | Mac only (CLOSE `:23-24`) | Mac: the first phone test | M2 (redeploy), M7 (branch) |
| the Mac handoff | cloud (integration batch) | — | — | it must carry 13.3 + H2's list + M6's tools + M7's branch + the Preview URL |

## Deploy and rollback order, checked

- **B before the merge, recorded in `schema_migrations` by a separate Management API request** (3.10 `:514`, 13.4 `:973`; recipe `20260926100000_users_profile_layout.sql:73-85`): holds.
- **Old code on the new database in the window**: B adds four tables no wave-1 code reads, four functions nothing calls, and one AFTER DELETE trigger on `channel_members` wrapped in `exception when others` (3.5); no policy, grant or column changes (3 `:164`). Holds; the only behaviour old code meets is the trigger's read of `org_members` + `channels` on a leave, RSVP withdrawal or demotion.
- **New code on a database without B**: card routes 404, `hydrateCards` empty map, `snapshotCard` null, `readReplyCounts` the walk, the reads and the remove route unaffected (3.10): holds for the six rows; the missing rows are M5.
- **Preview shows nothing new**: false as worded (M5's sibling): the flag-gated surface is hidden, the H1 list is live on production data. The draft's "a Preview never shows any of it" (0 `:24`) and "Preview builds show nothing new" (13.4) must say "nothing behind the flag".
- **Rollback order**: deployment first, then B, then A; B's drop list names every object of 3.1 and 3.5; the card rows stay and show as fallback text (3.10 `:519`, 13.5): holds. The screens-only rollback needs "and redeploy" (M2).
- **Not in wave 2 (15)**: every item of D10's exclusion list is present (month sheet, week swiping, non-member event rooms, custom rooms UI, photos, push, "seen by", Realtime, desktop, Headcount, the mention picker) plus search, mute/pin from the new screens, the `closes_at` picker, `?brief=`, the direct-read block, the reserved-name code. Complete.
- **Open points**: 35 rows, each with a default (14). Holds.

## Holds (checked and found correct)

1. The order W2-S alone → B1 | B2 | B3 | B4 → S1 | S2 | S3 → integration (13.1) and the "first commits that unblock a sibling" rule; the ownership table has no file in two batches of the same stage (`MessageBubble.tsx` is B3's in the backend stage and gets S2's one optional prop in the screens stage: sequential).
2. `MessagesMobile.tsx` is 4,985 lines (`wc -l`), as the draft says at 0 `:15`; `CampusMobile.tsx` 4,434; `message-read.ts` 1,078; the messages route 609 lines.
3. `npm test` = 1,374 / 1,374 green today (run here), 94 test files by `git ls-files`; `package.json` scripts `typecheck` = `tsc --noEmit`, `test` = `node --test …`, `lint` = `eslint` (ESLint 9, so `--stdin --stdin-filename` in 13.3 is valid).
4. The split-check tool exists at `handoffs/chat-redesign/wave-2-build/tools/split-check.mjs` (commit `15a8286`), keys top-level statements with the TypeScript compiler API, strips `export` and JSDoc, ignores imports and `"use client"` — as 10.3 describes it.
5. `.env.example:176-185` documents `CHAT_V2_ENABLED`, `CHAT_V2_ALLOWLIST`, `CHAT_V2_CLUBS`; `flag.ts:46-48` (`chatV2MayRunHere`) makes the switch inert on a Vercel Preview (`VERCEL_ENV !== "production"` and not `next dev`); `flag-server.ts:75-113` fails closed and is not cached (2.1's "asked three times per home mount" is a true cost).
6. `isMissingChatSchema` (`schema.ts:40-62`) judges by code alone: `42P01`, `42703`, `PGRST204`, `PGRST205`, `PGRST202`, `42883` — the codes 3.2 and 3.10 rely on for "function missing → 404" and "table missing → empty map".
7. The `?after=` change touches exactly the two sites 9.2 names (`message-read.ts:709-713`, `messages/route.ts:112-118`, both `"Invalid after"` today).
8. `readReplyCounts` (`message-read.ts:390-438`) is the walk 9.4 replaces, already carries the viewer's own-removed rule (`openable`, `:403`) that 3.5's `p_viewer` keeps, and its comment says "Wave 2: a grouped count in the database replaces the walk".
9. `channel_members` has no non-internal trigger today (DM `:218`), so 3.9's PRE-CHECK (4) and 3.0.7 are right; DM `:217` lists every DELETE path B's trigger will see, and 3.5 covers each.
10. The report route's `message` spec is `id,user_id,channel_id,content,media_url,created_at` today (`reports/route.ts:318-322`); 5.3's addition is additive.
11. `RemovedContentCard` (`ReportSheet.tsx:658-716`) has no `by` prop today and hard-codes "Removed by Vibe moderators" — 6.2 is a real addition with a default that keeps its four callers (`PostViewerMobile.tsx:860,1298`, `MessagesMobile.tsx:4562`, `CampusMobile.tsx:1578`, `campus-home.tsx`) unchanged.
12. D8 is API-only with the flag off: the desktop Access tab never shows for event rooms or public rooms (`campus-home.tsx:3246-3247`); Officers stays as today. The sender-only delete text ("Only the sender can delete this message", `[messageId]/route.ts:45`) is displayed by no old screen.
13. `chatV2For` is called today only by `/api/me/features` (grep): the calendar's new call (7.3) is the first on an existing route, and it is guarded (flag off → nulls, no 500).
14. Migration A's APPLY RECORD lives in `chat_repair_club`'s comment (S69 `:88`, DM:2.6); 3.6 and 3.9 put B's on `chat_create_poll`, so A's record survives.
15. Wave 1's timing (commits 13:46 → 20:08 on Sept 29, live 00:10 Sept 30) supports "buildable in the week" for the cloud part; the risk is the serial Mac day (M3), not the cloud.
