> **Superseded for starting session 71:** read `2026-09-30-session-70-chat-wave-2-cloud.md` first. This file is the state at the end of S69 and the brief that S70 (cloud) worked from.

# Session 69 close (2026-09-30): club chat wave 1 is LIVE; next = wave 2

Full detail of S69 is in `2026-09-29-session-69-chat-wave-0.md` (decisions, mockups, the build, the go-live record). This file is the short state and where to start. **`main` = `e4f8916`, deployed (Vercel success), migration `20261001100000_chat_v2_rooms` applied on production and recorded. Working tree clean.**

## START HERE — session 70

**Build wave 2 of the club chat redesign** (plan: week of Oct 5; freeze Oct 15; on for everyone Mon Oct 26).

1. **Read, in order:** `handoffs/chat-redesign/wave-0-decisions.md` (Franky's calls, final) → `handoffs/chat-redesign/wave-1-contracts.md` sections 0, 1, 4, 5, 6.3, 7 and **14–16** (build notes that win over older text) → the "Wave 2 carry-overs" below. Mockups: design canvas https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ **row 7** (sources `handoffs/chat-redesign/boards/W0_*.dc.html`).
2. **First write `handoffs/chat-redesign/wave-2-contracts.md` and run a plan critic on it** (the pattern that worked in S69: contract → critic → draft 2 → verify). Wave 2 scope, from the wave-1 contract:
   - **Backend:** migration B (`chat_polls` / `chat_poll_options` / `chat_poll_votes`, the three RPCs, `chat_votes_drop_access`), the card routes (`POST …/cards`, `PUT …/vote`), `hydrateCards`, `snapshotCard` in the report route, the officer/mod remove route (6.3, needs `RemovedContentCard` `by` prop), `GET /api/me/inbox`, `GET /api/orgs/[slug]/space`, the three new fields on `/api/me/calendar`.
   - **Phone screens behind `chat_v2`:** first an extraction-only batch that splits `MessagesMobile.tsx` (4,866 lines) into `src/components/mobile/messages/*` with no behaviour change (plan critique #11), then Messages home (All · Chats · Clubs · Requests + "Your week", this week only), club space (Board + Lounge + room chips + Up next + "+" tray), event chat, the card renderers, empty states. Light + Night, 375px.
   - **Blocking in club rooms (Franky, decided):** both ways; a blocked person's messages arrive as `{ hidden: true }` stubs and they are left out of voters / going; counts unchanged; **exception: an officer's top-level Board post shows to every member.** Pin the stub's exact shape in the wave-2 contract, and decide whether it must also hold against a direct database read.
3. **Flag rollout:** set `CHAT_V2_ENABLED=true`, `CHAT_V2_ALLOWLIST=<the three founders' user ids>`, `CHAT_V2_CLUBS=<SAE's org id>` in Vercel **Production only** when the first new screen is ready. The switch does nothing on Preview builds by design.
4. **Dated items alongside (Franky's hands):** **f2** sending @connectvibe.app mailbox by **Sun Oct 4** (Resend key in Gmail "Send mail as"); **f9** Android build by **Fri Oct 9**: Android Studio is installed, its SDK is NOT (`~/Library/Android/sdk` missing): Franky opens it once, runs the setup wizard, accepts the licenses; then the first build. Demo days week of Oct 5; App Store submission Oct 16.
5. **Still open from before:** paperwork (James's Oct 3 LLC amendment, EIN, D-U-N-S ~Oct 5, the Sept 26 meeting outcomes); wave 6 journal entry (private file) + feature sentinel; f11 parked (no Supabase Pro); push still dark on production (its migration needs renumbering).

## If this is a CLOUD session (no Mac)

Franky runs some sessions in the cloud to use cloud credits. A cloud session has the repo and these handoffs, but NOT the memory notes, the local Supabase stack (Docker), the seed accounts, the signed-in gstack browser, Android Studio, or `.env.local` (no production access key). So:

- **Do in the cloud:** the wave 2 contract + plan critic (docs); the `MessagesMobile.tsx` split with no behaviour change; new screens, card renderers and pure logic built against `src/lib/chat/types.ts`; route code; migration B's SQL **written** but not run. Gates: `npm install`, `npm run typecheck`, `npm test`, `npx eslint <changed files>`.
- **Leave for the Mac:** running or rehearsing any migration, HTTP tests against a database, browser walks, the production apply, the merge to `main`.
- **Work on a branch** (e.g. `chat-v2-wave-2`), push it, and **never merge to `main`** from the cloud: `main` deploys to production, and code that needs migration B must not go live before migration B is applied.
- A Vercel Preview of the branch will not show the new screens: the `chat_v2` switch is off on Preview builds by design (Preview uses the production database).
- End the cloud session by updating this handoff (or a new one) with what was built, what is left for the Mac, and the branch name; commit and push it.

## What wave 1 changed for everyone (live since Sept 30, 00:13 UTC)

- Only owners/admins post top-level on a club's **Board**; members see "Only officers post here." Replies (`thread_root_id`) exist in the API but no screen sends them yet.
- Club rooms are named "Club · Room" in the old inbox; event rooms are left out of old lists; club rooms can't be left, declined or given photos (`club_media_off`).
- Every club event has a private event room (members going/maybe + owners/admins), open until 7 days after it ends; kept in sync by five triggers; `chat_repair_club(org_id)` repairs a club (service role).
- "You'll appear in the event chat." under Going, for members of the event's club only.
- SAE: `general` → public Lounge (3 old messages), `exec` → Officers.
- The `chat_v2` flag is unset: no new screens yet.

## Wave 2 carry-overs (from the wave-1 reviews)

- The thread GET re-reads `room` / `viewer` on every poll; in the new screens read them on the every-5th re-read only (contract 6.1).
- Add a grouped reply-count function in migration B (today `reply_count` walks reply rows).
- Pin sentences for the codes that have none (contract 14.9) and a code for `?after=` that is not a timestamp (answers 400 "Invalid after" today).
- `room_locked` doubles as the reserved-name refusal; the create/rename screens may want their own line.
- `POST …/channels/[channelId]/members` (the by-name list) has no rule for event rooms / Board / Lounge.
- `CampusMobile.tsx` still titles club rooms `# name` in its own drill-down (retired when the phone Chat pill goes, call 8).
- A demoted officer added to Officers by name keeps that room (decision 27; default leave).
- Old nested-button hydration warning in `CampusMobile` FeedCard (not wave 1).

## Local environment (for testing)

- The LOCAL database is migrated and holds test rows named `w1test…` plus a hand-made closed event ("Chat Seed Closed Night").
- Backups from before wave 1: `handoffs/chat-redesign/wave-1-build/local-db-backups/` (restore with `pg_restore` into the local container).
- Signed-in requests to a local dev server: `node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake` prints a Cookie header (accounts avery, blake, casey, drew, emery; local stack only). Browser sign-in without a password: memory `reference_live_verification.md`.
- Behaviour check (local only): `scripts/sql/chat-v2-rooms-check.sql` (200 cases, rolls back). After-deploy check (read-only, works on production through the Supabase MCP after stripping comments): `scripts/sql/chat-v2-after-deploy.sql`.
- Live GET checks as Franky: the gstack browser (`~/.claude/skills/gstack/browse/dist/browse`, `eval <file>`), memory `reference_live_verification.md`.

## Gotchas learned in S69

- **Workflow resume replays by exact prompt text:** editing a prompt (even one blank line) re-runs that agent and can re-run everything after it. To finish a half-done run, write a new small script for what's left instead of resuming an edited one.
- Usage limits cut two workflow runs mid-way; builders that were told "an earlier attempt was cut off, read your notes and continue" picked up cleanly.
- The read-only Supabase MCP role cannot call `can_view_org_channel` / `can_post_org_channel` (permission denied, no crash) and cannot `set role`; check member rules over HTTP instead.
- The design canvas: re-read `project/canvas.json` right before a publish (Franky edits it too).
