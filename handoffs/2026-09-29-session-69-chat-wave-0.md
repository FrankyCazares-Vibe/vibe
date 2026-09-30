> **Superseded for starting session 70:** read `2026-09-30-session-69-close-chat-wave-1-live.md` first. This file is the full record of S69.

# Session 69 (2026-09-29): club chat wave 0 done — calls, mockups, contract; roadmap v14 live

No app code changed this session. `main` is still at `5cd325d`, working tree clean, nothing to deploy. Everything produced is in `handoffs/chat-redesign/` (gitignored) and on two artifacts.

## START HERE — session 70

**Build wave 1 of the club chat redesign from `handoffs/chat-redesign/wave-1-contracts.md` (FINAL for wave 1, draft 3).** *(Update, same evening: the verification pass is applied and Franky answered the two open calls — RSVP'd testers: accept; blocking in club rooms: both ways, officers' Board posts excepted. The build of B0 + migration A started in S69; see the end of this file.)*

1. **Read, in order:** `wave-0-decisions.md` (Franky's calls, final) → `wave-1-contracts.md` (final; `wave-1-contracts-verify.md` is already written in) → `wave-1-asis.md` only when a batch needs a fact (sections 1–10 local, section 11 production).
2. **Wave 1 is small on purpose** (the critic's verdict on draft 1: the database design holds, the wave was too big): rooms + the Board rule + the old screens staying correct. Order: **B0** alone (pure modules, types, flag, `message-read.ts`) → **B1a** alone (migration A `20261001100000_chat_v2_rooms.sql` + the seed, applied locally by the orchestrator) → **B1b, B4, B5** side by side. Cards, the three new reads and the officer remove route are the week of Oct 5.
3. **Rules that bite:** wave-1 commits stay on branch `chat-v2-wave-1`; nothing reaches `main` before migration A is applied on production and recorded (this overrides the usual "push every time" for this wave only); `pg_dump` the local database before the first apply; rehearse with `rollback;` first; production apply needs **Franky's yes**, quiet hour, Management API curl recipe.
4. **Both open calls are answered** (contract section 12, points 1 and 2): RSVP'd testers joining event chats = accept; blocking inside club rooms = both ways, except an officer's Board posts. The production apply of migration A still needs **Franky's yes** on the day.
5. **Dated items alongside:** **f2** sending @connectvibe.app mailbox by Sun Oct 4 (Franky enters the Resend key in Gmail "Send mail as"); **f9** Android build by Fri Oct 9 — Android Studio is installed but **its SDK is not set up** (`~/Library/Android/sdk` does not exist): Franky opens Android Studio once, runs the setup wizard, accepts the licenses; then the first build can run. Demo days week of Oct 5; freeze Oct 15; submission Oct 16; **new chat on for everyone Mon Oct 26**.
6. Still unanswered from S68: paperwork (James's Oct 3 LLC amendment, EIN, D-U-N-S ~Oct 5, Sept 26 meeting outcomes); wave 6 journal entry (private file) + feature sentinel; f11 parked (no Supabase Pro yet); push still dark on production (its migration needs renumbering).

## What was decided (all in `wave-0-decisions.md`)

Board + Lounge · Board replies folded and quiet · event chats for club members first ("anyone who RSVPs" only if there is time before the freeze, officer switch off by default) · who's going is visible inside the room, counts only outside · SAE's `general` becomes the Lounge, `exec` the Officers room (SAE has one member, its owner, and that is Franky) · sign-ups show names, polls have an Anonymous switch · a room lives from the event's creation to 7 days after it ends · the phone's Campus › Chat pill goes away with the flag on · club mods can remove messages but are not in Officers · the four after-launch recommendations accepted · "Your hat" = the role in v1 · new chat on for everyone Mon Oct 26.

## What exists now

| thing | where |
|---|---|
| Canvas row 7, "Club chat v1 · the build set", 13 mockups (version 20) | https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ · sources `handoffs/chat-redesign/boards/W0_*.dc.html` |
| Roadmap **version 14**, live (shared link: James and Rylan see it) | https://claude.ai/artifact/6QfJfD1QSPYu8qn9FvsRzi · source + change list `handoffs/chat-redesign/roadmap-v14-published/` |
| Today's code and database, with evidence (1,700 lines) | `handoffs/chat-redesign/wave-1-asis.md` |
| The contract, draft 2 | `handoffs/chat-redesign/wave-1-contracts.md` (draft 1 kept beside it) |
| The critic's report on draft 1 (5 high, 15 medium, 16 low) | `handoffs/chat-redesign/wave-1-contracts-critique.md` |
| The check of draft 2 | `handoffs/chat-redesign/wave-1-contracts-verify.md` |

## Facts found this session that change how to build

- **The messages POST inserts with the caller's cookie client**, so the restated RLS policies sit in the route's own path; a Board rule in RLS alone would be a bare 500. The route gets its own 403 first.
- **Production = local** for every function md5 and every policy text on the chat tables (read Sept 29). Production has 5 clubs, 12 club channels, 15 club messages, 13 events (0 upcoming, 3 inside the 7-day window), 7 RSVPs, 94 migration rows (max `20260930100000`).
- **Subscription rows are missing almost everywhere** (club creation never subscribes the owner): the backfill creates them, and one function, `chat_repair_club`, is the backfill, what club creation calls, and the repair tool.
- **The old desktop inbox can destroy those rows** ("Leave group" on a club room) and **shows an attach button on club rooms**; wave 1 closes both on the server and in the policy.
- **`/api/me/calendar` is used by desktop "My Calendar"** and must never be behind the flag.
- **Custom titles (Treasurer, President) do not exist in the database**; only four roles.
- Local `schema_migrations` stops at `20260926100000` (19 later files applied but unrecorded): pre-flights read the catalog; local applies go through `psql -f`.

## Gotchas

- The design canvas: re-read `project/canvas.json` right before each publish (Franky resized a note mid-session; the second publish was merged onto his version).
- The roadmap page: rebuild from `#page-source`, never from the rendered page; the published page sits in a cross-origin frame, so the browser pane can look at it but cannot scroll or click inside it. Only the cover was checked by eye after publishing; Chapters 1, 4, 5, 11, 12 were checked structurally and in a local copy of the first draft.
- Subagents leave local preview tabs open in the browser pane; close them when the tab cap is hit.

## Build state at the end of S69 (wave 1 started the same day)

Branch **`chat-v2-wave-1`** (local only, NOT pushed; `main` is untouched at `5cd325d`):

| commit | what |
|---|---|
| `e085654` | an old test (`parse-reminder.test.ts`) fixed so `npm test` is fully green (1,374) |
| `74de1cd` | **B0**: the `chat_v2` switch (off on Preview builds, fails closed), `GET /api/me/features`, shared types and refusal sentences, pure room rules, the message read moved into `src/lib/chat/message-read.ts` |
| `f599bac` | **B1a**: migration A `20261001100000_chat_v2_rooms.sql`, the seed (both shapes), a 200-case behaviour check, the after-deploy check |

- **Migration A is applied to the LOCAL database** (backups of the local database from before: scratchpad `dumps/`, session-only). All 200 checks pass, the after-deploy check finds nothing, re-running the seed changes nothing. **Production is untouched.**
- Review of migration A: five lenses, one serious finding (an RSVP moved to another event kept the old event chat), fixed; what the file does beyond the contract text is in contract section 15.
- **Running when this was written:** the second half of wave 1 as one workflow (`wf_b7b7d30d-f40`): B1b (room helpers, channel routes, club creation), B4 (thread routes, leave / decline / media guards), B5 (old screens), then an HTTP integration pass. Notes land in `handoffs/chat-redesign/wave-1-build/`. If the run was cut off: resume it with its script path and run id (both are in the session's workflow folder), or read the notes and finish by hand.
- **Then, in this order:** the orchestrator's browser walk at 375px as a non-admin (gate 4) → commit → push the branch → **Franky's yes** → the four PRE-CHECK queries in the migration header on production → apply A at a quiet hour and record it → merge to `main` right away → the after-deploy check on production.
- Local helpers: a dev server runs on `http://localhost:3100`; `scratchpad/wave1/http/cookie.mjs <account>` prints a signed-in cookie for a seed account (avery, blake, casey, drew, emery; password in the seed script).
- Lint: the repo has 32 old lint errors in 11 component files; wave-1 gates judge lint on the batch's files only (contract 14.1).

## Wave 1 BUILT (same session, finished on Opus 5.5)

Branch `chat-v2-wave-1` is complete and **pushed** (`e4f8916`); `main` is untouched at `5cd325d`; production has NOT been changed.

| commit | what |
|---|---|
| `74de1cd` | B0 shared foundation + flag |
| `f599bac` | B1a migration A (applied LOCALLY only) |
| `02f45a8` | B1b room helpers + `ensureMember` kind |
| `23a8732` | a types comment |
| `f6f8878` | B1b channel routes + club creation, B4 thread routes and guards |
| `e4f8916` | B5 old screens |

Proof: every batch had 2–5 independent reviewers, a repair and a gate; typecheck and all 1,374 tests green; lint clean on every wave-1 file (two old component files keep their old errors, none added). HTTP test pass: 186 route cases, 27 thread reads validated field by field, the event create → RSVP → cancel flow over the real routes, DMs unchanged; migration checks 200/200; after-deploy check 0 findings. **Browser walk (orchestrator, as Blake, a plain member):** phone inbox names club rooms "Club · Room"; Board shows "Only officers post here." with no input, in Night and Light; ⋯ menu on a club room has no Delete / Leave; Lounge send works, no attach button; DMs keep the photo button; "You'll appear in the event chat." shows only on events of clubs you're in; desktop Messages matches; `?channel=` deep link opens the Board. Two console items seen are old and outside wave 1 (a nested button in `CampusMobile` FeedCard; a 500 for a test photo with no file, because R2 is blank locally).

**Production pre-checks, read Sept 29 evening (all as expected):** SAE 1 member / 1 general / 1 exec; members who may publish 2, officers 5 (the behaviour probe should run); events inside their 7-day window 4 (4 event rooms will be made); triggers on the four tables 0, on org_members 4; club messages with media 0; reserved names 0; doubled names 0; rows of non-members 0; grants as expected; both function fingerprints match; `channels.kind` absent; max migration `20260930100000`.

**Next (needs Franky's yes):** at a quiet hour, apply migration A on production with the Management API curl recipe (`20260926100000_users_profile_layout.sql:74-85`), insert its `schema_migrations` row, run CHECK AFTER APPLYING 1–2, merge `chat-v2-wave-1` to `main` right away (the deploy), run `scripts/sql/chat-v2-after-deploy.sql` on production, then anon + member curl checks live. The `chat_v2` flag stays unset until wave 2's first screen (week of Oct 5).

**Wave 2 carry-overs (from the reviews):** re-read `room` / `viewer` only on the every-5th poll; a grouped reply-count function in migration B; `CampusMobile` still titles club rooms `# name` in its own drill-down; the reserved-name refusal reuses the `room_locked` sentence; the by-name access list route has no rule for event rooms / Board / Lounge; blocking against a direct database read (contract 15).

## WAVE 1 IS LIVE (Sept 30, 00:10–00:13 UTC; Franky said "Yes, now")

- Migration A applied on production at 00:10:51 UTC via the Management API (201, empty result) and recorded (`schema_migrations` max = `20261001100000`). APPLY RECORD: 8 rooms and 17 rows created, 0 deleted; SAE's `general` → public Lounge (3 messages), `exec` → Officers; the behaviour probe PASSED on production. Standing-rule check 0. `can_view_org_channel` md5 now `747ee06d…` (the file's "after" value).
- `main` fast-forwarded to `e4f8916` and pushed 25 s later; Vercel production deploy success at 00:12:40 UTC.
- After-deploy check on production: **0 findings** (5 clubs, 20 club rooms).
- Live checks: signed out → 401 on every chat route, home 200. Signed in as Franky (gstack browser, GET only): `chat_v2` false; thread list names club rooms "Club · Room", no event rooms, DMs unchanged; Kelley Floor Board `can_post: false` (Franky is a plain member there), SAE Board true (owner); SAE Lounge reads its 3 old messages with room / viewer filled; DM read has the defaults, no `removed_*` keys; SAE channel list = lounge, board, events (room), officers (private).
- The `chat_v2` flag is still unset: nobody sees the new screens until wave 2.

**Session 70 starts with WAVE 2** (week of Oct 5): migration B (cards) + card routes, the three reads, the officer remove route, then the phone Messages home, club space and event room screens behind `chat_v2` (founders + SAE first). Carry-overs are listed above. f2 mailbox by Oct 4 and f9 Android by Oct 9 (Android Studio's SDK setup is still Franky's click).
