# Session 70 close (2026-09-30, CLOUD): club chat wave 2 is BUILT on a branch; next = the Mac

This session ran in the cloud (no Mac, no database, no browser walk). Everything of wave 2 that a cloud session may build (S69 close, "If this is a CLOUD session") is built, reviewed, gated and pushed on **branch `claude/relaxed-davinci-9d11h3`, head `b497c2d` (code; this handoff file is the commit on top of it)**, Vercel Preview of the last code change (`2cdcfbe`) **https://vibe-p0z6622vm-fracazar-1988s-projects.vercel.app** (READY; the later docs-only pushes build their own; it shows nothing behind the flag by design, and section 0's flag-OFF rows run there on production data). **`main` is untouched at `5c68da1`. Production is untouched: migration B is NOT applied, the `chat_v2` env vars are NOT set.** The branch is never merged from the cloud.

## START HERE — session 71 (the Mac, window 1: Oct 5–6)

Read, in order: `handoffs/chat-redesign/wave-2-contracts.md` sections 0, 13.3, 13.4 and **17** (the amendments after the build; where 17 and an older section disagree, 17 wins) → `handoffs/chat-redesign/wave-2-build/integration-*.md` (the six integration lenses, the repair, the gates) → `wave-2-build/visual/README.md` (the screenshots, both themes). Then the Mac list of contract 13.3, in this order:

1. `git fetch && git checkout claude/relaxed-davinci-9d11h3`; `pg_dump` the local database to the scratchpad; do NOT restore a pre-wave-1 backup before the rehearsal (or re-add the closed event chat by hand, 13.3.1).
2. **Migration B** (`supabase/migrations/20261001110000_chat_v2_cards.sql`, 1,704 lines, parsed with libpg-query in the cloud, never run): rehearsal 1 as a `rollback;` copy in the scratchpad → expected `chat-cards: constants are empty` after every constant was printed → paste the 27 constants into the file in one edit (want_select, the 21 want_con_*, the five want_fn_*) and the `select version()` value into the header's PRE-CHECK (5) → rehearsal 2 green to `rollback;` → the real local apply with `psql -f` (hand the file md5 through `chat_cards.file_md5`, 3.9) → `scripts/sql/chat-v2-rooms-check.sql` still 200/200, `scripts/sql/chat-v2-after-deploy.sql` 0 findings, `scripts/sql/chat-v2-cards-check.sql` all green, the seed (`scripts/local-seed.mjs`, the card rows) re-run changes nothing → fill the header's COST section → **commit `chore(chat): migration B constants from the local rehearsal` and push**.
3. **HTTP pass** with a local `next dev` and the seed accounts (`handoffs/chat-redesign/wave-1-build/tools/cookie.mjs`): contract 13.3 step 2's rows (the wave-1 tables unchanged; the wave-2 rows for `POST …/cards`, `PUT …/vote`, the remove route, `/api/me/inbox`, `/api/orgs/[slug]/space`, `/api/me/calendar`, `/api/me/threads`); every saved thread answer through `node handoffs/chat-redesign/wave-2-build/tools/validate-thread.mjs`.
4. `GET /api/me/features` with `CHAT_V2_ENABLED=true` locally; the 404 of the gated reads with it off.
5. **Browser walk** at 375px, Light and Night, as blake (member) and avery (officer), flag ON and flag OFF (13.3 step 4 lists every state; the cloud's screenshots under `wave-2-build/visual/` show what to expect).
6. Production PRE-CHECK queries (3.9, five, read-only) → **Franky's yes** → apply B at a quiet hour with the Management API recipe (ONE request: the `set_config('chat_cards.file_md5', …)` line + `git show origin/claude/relaxed-davinci-9d11h3:supabase/migrations/20261001110000_chat_v2_cards.sql`), then the `schema_migrations` row `('20261001110000', 'chat_v2_cards')` in a separate request, then CHECK AFTER APPLYING (1)–(3).
7. **Merge**: `git fetch origin && git checkout main && git merge --ff-only origin/main && git merge --ff-only claude/relaxed-davinci-9d11h3 && git push` → CHECK AFTER APPLYING (4) → the after-deploy check.
8. Vercel, **Production only**: `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' user ids>`, `CHAT_V2_CLUBS=<SAE's org id>`, then **Redeploy** (a deployment carries the env it was built with) → the first phone test on real data, before demo days show SAE the chat.
9. Window 2 (Oct 12–14): repairs, the flag-off walk repeated, the build that will be submitted; Oct 15 freeze of the flag-OFF surface (section 0's nine rows); Oct 26 `CHAT_V2_ALLOWLIST=*` and redeploy.

Rollback if needed: contract 13.5 / 3.10 (unset the flag and redeploy, or Vercel's instant rollback; B's rollback transaction only if its objects are the problem; A's only after B's).

## What the branch holds (92 commits on top of `5c68da1`)

| stage | what | proof in the cloud |
|---|---|---|
| contract | `wave-2-contracts.md` FINAL (draft 3), its two drafts, five fact files (`wave-2-asis/`), six critiques (`wave-2-critique/`), two verify files; 46 open points each with a default (section 14); section 17 = the amendments after the build | facts → draft → 6 critics (6 H / 31 M / 55 L) → draft 2 → 2 verifiers (1 wrong carry fixed, 24 new points) → final |
| W2-S | `MessagesMobile.tsx` (4,985 lines) cut into `src/components/mobile/messages/*` (13 files), no behaviour change | `tools/split-check.mjs`: 51/51 declarations identical; typecheck, tests, build, lint parity rule by rule; 3 reviews PASS |
| W2-B1 | migration B (4 service-role tables, `chat_create_poll`, `chat_create_event_card`, `chat_cast_vote`, `chat_reply_counts`, the `chat_votes_drop_access` trigger, PRE-FLIGHT / POST-CHECK / probe / APPLY RECORD / ROLLBACK), `scripts/sql/chat-v2-cards-check.sql` (~130 cases), the seed's card rows, `tools/sql-parse.mjs` | parsed statement by statement (libpg-query, DO blocks included); sql + security reviews PASS; **never run** |
| W2-B2 | `when`, `cards/{fallback,body,hydrate,snapshot}`, `blocks`, `stub`, `event-refs`; the thread GET with the block set, stubs, hydrated cards, `invalid_after`, `chat_reply_counts`; `POST …/cards`, `PUT …/vote`; the report's card snapshot; `tools/validate-thread.mjs` + fixtures | stub-harness tests for every gate order, SQLSTATE → code and missing-schema row; contract / security / behaviour reviews PASS |
| W2-B3 | the officer/mod remove route (6.1), `RemovedContentCard by`, the by-name guard, the four old renderers' stub filter, the old inbox's preview filter | decision-table tests; reviews PASS |
| W2-B4 | `GET /api/me/inbox`, `GET /api/orgs/[slug]/space` (+ `?events=1`), the calendar's three fields; `src/lib/chat/reads.ts` | stub-harness tests; reviews PASS |
| W2-S1 | the flag fork on `/messages`, deep links + history, `CampusMobile` with the flag on, the Messages home, Your week, club / person rows, the no-clubs state, `v2-tokens`, `avatar`, `week`, `use-chat-v2`, `use-hide-tabbar`, the fonts line, `S1-contrast.md` | 4 reviews; 1 HIGH (a fresh-tab close) fixed |
| W2-S2 | the club space, Up next, chips, Board strip, the Board with folded replies, the Lounge / room thread, composer, event chat layer, RSVP sheet, empty club, `use-room-poll`, `page-merge`, the `Remove` row | 4 reviews; 1 HIGH (own removed row's content) fixed |
| W2-S3 | `CardBubble`, poll / sign-up / event cards, the "+" tray, `CardSheet`, New poll, New sign-up, Share an event | 4 reviews PASS after repairs |
| visual pass | `wave-2-build/visual/`: the REAL app under `next dev` behind its real gates (a fake Supabase auth endpoint + the `sb-*` cookie, `tools/fake-supabase.mjs`, `harness-session.mjs`), every `/api/**` answered from typed fixtures by Playwright, the clock frozen at Thu Oct 8 18:12 ET; 36 states × 2 themes at 375×812 @2x next to the 13 mockups (`run2/` after the batch repairs, `run3/` after integration); three design reviews (S1 / S2 / S3), one repair each, a re-shoot | run 2 caught the one HIGH nobody had seen by reading: the week bloom widened the phone layout to 409px (fixed at integration, proved in run 3) |
| integration | six lenses (`integration-{flag-off,producer-consumer,old-renderers,adjudicate,security,gates}.md`), ten cross-batch repairs (`6db5cc1`…`ebf6c3a`: the bloom clip, the card picker's reactions + Reply, the Board's full-width card post, the sheets' club dot, the deep-linked room read once, four chrome tokens, the inverted "+", the static renderers' group-top margin, own removed rows never a preview, the Retry ink), contract **section 17** (38 ratified amendments, 9 after-launch lines, section 0 restated as ELEVEN rows, ownership amended, 31 Mac items, the final gates) | every gate green at the final head |

Gates at the head, run by the orchestrator: `npm run typecheck` exit 0; `npm test` 1,639 pass; `npm run build` exit 0; `npx eslint` over every changed file: 0 new errors (the 7 pre-existing react-hooks errors of `MessagesMobile.tsx` / `CampusMobile.tsx` / `ComposeOverlay.tsx` moved with their code, same rules); the split-check report exactly as contract 10.3's integration paragraph allows.

## What the cloud could NOT do (13.3's Mac half — nothing below is verified)

- Nothing was run against a database: migration B, the check script and the seed's card rows are parsed and read, not executed. The RPCs' behaviour, the trigger, the POST-CHECK probe and the constants are the rehearsal's to prove.
- No route was called over HTTP against real data: every route was proved by reading and by stub-harness tests (a fake client answering the pinned codes).
- No real browser walk: the screenshots under `wave-2-build/visual/` come from the real app under `next dev` with the API mocked by Playwright and a fake auth endpoint, so layout, tokens, copy and states are real; data flow, polling against a server, history on a real phone and the flag on production are not.
- The Vercel Preview shows the OLD chat (the flag does nothing on a Preview); it proves the build deploys.

## Open points for Franky

Contract section 14 (46 defaults) and section 17 (what the build raised). The ones worth a look before the apply: 14.1 the blocking stub and the officer-Board-post exception; 14.2 no policy-level blocking in v1; 14.12 the stub applies with the flag OFF (Apple's reviewer); 14.16 the Board's member sentence; 14.21 phone history; 14.41 the "You'll appear in the event chat." line on the Event card; **17.3 row 10** (the fonts line loads a true 800 weight on every page, desktop included — keep it (default) or restore `layout.tsx:96`); **17.3 row 11** (the Retry pill's ink is dark on coral app-wide, 6.4:1 instead of 2.9:1); **17.2 L3** (Report / Remove on a TEXT Board post and on replies is not built — 11.4 was silent; wanted before Oct 26); **17.2 L7** (the officer exception's three visible tells with the flag on).

## Gotchas learned in S70 (cloud)

- This box has 4 CPUs: a workflow runs 2 agents at a time; the contract stage took ~2.5 h, the backend ~2.2 h, the screens ~2.5 h.
- Four batches on ONE working tree worked with three rules: add files by path only, retry a commit on `index.lock`, and treat a typecheck error in a sibling's half-written file as transient (re-run after 60 s). `next build` collisions in `.next` did not happen when builders built only at the end.
- The stop hook nags about the running builders' uncommitted files; leave them to the builder, commit review reports yourself after the stage.
- `npm install` rewrites `package-lock.json` (platform `libc` entries): `git checkout -- package-lock.json` before committing.
- `libpg-query` (SQL parser) and `playwright` live in the scratchpad, never in the repo; the tools take the module path (`--lib`).
- Workflow resume replays by exact prompt text (S69's gotcha still holds); every builder wrote `<batch>-notes.md` first so a cut-off run could continue.

## Still open from before (unchanged)

f2 sending mailbox by Sun Oct 4; f9 Android build by Fri Oct 9 (Android Studio's SDK setup is Franky's click); paperwork (James's Oct 3 LLC amendment, EIN, D-U-N-S ~Oct 5, the Sept 26 meeting outcomes); wave 6 journal entry + feature sentinel; f11 parked (no Supabase Pro); push still dark on production (its migration needs renumbering).
