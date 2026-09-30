# B0 gate (read-only) — 2026-09-29

Branch chat-v2-wave-1, Node v25.9.0. No file changed except this one.

## Verdict: FAIL by the letter of the gate rule, B0 itself is clean

Two of the three commands exit 1. Neither failure is in a B0 file, and neither is in a
file another batch is editing (scripts/, supabase/migrations/). Both come from old,
tracked, unmodified files, so the narrow exemption in the gate rule does not cover them.
No B0 repair can fix them (B0 may not touch those files). Needs the orchestrator's call.

## Commands, in order

1. `npm run typecheck` (tsc --noEmit): exit 0, no errors.
2. `npm run lint` (eslint): exit 1. 88 problems (32 errors, 56 warnings).
   - No B0 file appears in the output.
   - `npx eslint` on the B0 files alone (src/lib/chat, api/me/features/route.ts,
     channel-access.ts, threads/[id]/messages/route.ts): exit 0, no output.
   - Files with errors (all tracked, unmodified vs HEAD):
     - src/components/mobile/CampusMobile.tsx (4)
     - src/components/mobile/MessagesMobile.tsx (3)
     - src/components/mobile/ProfileMobile.tsx (7)
     - src/components/the-map/LyraConstellation.tsx (1)
     - src/components/ui/card-hover-effect.tsx (2)
     - src/components/ui/glare-card.tsx (1)
     - src/components/ui/mouse-spotlight.tsx (1)
     - src/components/ui/moving-border.tsx (3)
     - src/components/ui/particles.tsx (3)
     - src/components/ui/sparkles.tsx (1)
     - src/components/ui/wavy-background.tsx (6)
   - Warnings only: public/html/_*.js, campus-home.tsx, layout.tsx, OrgPostsList.tsx,
     OttoSidePanel.tsx, UserCard.tsx, SettingsClient.tsx, PostViewerMobile.tsx,
     suspended-actions.tsx, accept-terms-form.tsx.
3. `npm test` (node --test): exit 1. tests 1362, pass 1361, fail 1.
   - The one failure: src/lib/otto/parse-reminder.test.ts, ERR_MODULE_NOT_FOUND
     "Cannot find module .../src/lib/otto/parse-reminder" (extension-less import at
     line 17). Tracked, unmodified, last changed in 7746498. Not B0's.
   - B0's own tests alone (flag, room-state, room-rules): 71 tests, 71 pass, 0 fail.

## git status --short

     M .env.example
     M scripts/local-seed.mjs
     M src/app/api/me/threads/[id]/messages/route.ts
     M src/lib/messages/channel-access.ts
    ?? scripts/sql/chat-v2-after-deploy.sql
    ?? scripts/sql/chat-v2-rooms-check.sql
    ?? src/app/api/me/features/        (route.ts)
    ?? src/lib/chat/                   (flag.ts, flag.test.ts, flag-server.ts, schema.ts,
                                        room-state.ts, room-state.test.ts, types.ts,
                                        room-rules.ts, room-rules.test.ts, message-read.ts,
                                        rooms.ts)
    ?? supabase/migrations/20261001100000_chat_v2_rooms.sql

Stray-file check: PASS. Every changed or new file is in B0's list or under scripts/ or
supabase/migrations/. handoffs/ is gitignored. src/lib/chat holds exactly the 11 files
of B0's list, nothing extra.

## git diff --stat

    .env.example                                  |  20 ++
    scripts/local-seed.mjs                        | 288 ++++++++++++++++++++++++--
    src/app/api/me/threads/[id]/messages/route.ts | 178 +---------------
    src/lib/messages/channel-access.ts            |   5 +
    4 files changed, 298 insertions(+), 193 deletions(-)

---

# B0 gate, re-run after repair round 2 (read-only) — 2026-09-29

Same branch, same HEAD (5cd325d), Node v25.9.0. No file changed except this one.

## Verdict: FAIL by the letter of the gate rule; nothing in B0 is red

Same two red commands as the first gate, same counts, same files. Repair round 2 changed
no B0 file (it could not: the fixes live in files B0 does not own). Another repair round
will give the same result. This needs the orchestrator's call, not a B0 repair.

## Commands, in order

1. `npm run typecheck` (tsc --noEmit): exit 0, no errors.
2. `npm run lint` (eslint): exit 1. 88 problems (32 errors, 56 warnings), 27 files, errors in 11.
   - B0 files in the eslint JSON report: 14 files, each 0 errors 0 warnings.
   - `npx eslint` on the B0 files alone: exit 0, no output.
   - The 11 files with errors (same list as above) are tracked and unchanged vs HEAD
     (`git status --short` on them, on eslint.config.mjs, package.json, tsconfig.json: empty).
3. `npm test` (node --test): exit 1. tests 1362, pass 1361, fail 1.
   - The one failure: src/lib/otto/parse-reminder.test.ts, ERR_MODULE_NOT_FOUND on its
     extension-less import of "./parse-reminder". Tracked, unchanged, last changed in 7746498.
   - B0's tests alone (flag.test.ts, room-state.test.ts, room-rules.test.ts): 71 of 71 pass.

## git status --short / git diff --stat

Identical to the first gate (see above): 4 modified, 5 untracked entries,
"4 files changed, 298 insertions(+), 193 deletions(-)".

Stray-file check: PASS. src/lib/chat holds exactly the 11 files of B0's list;
src/app/api/me/features holds route.ts only; everything else changed is under scripts/
or supabase/migrations/ (another batch). handoffs/ is gitignored.

## Scope spot-checks (not part of the pass rule, all fine)

- channel-access.ts: +5 lines, a type-only import of RoomKind and the two optional fields
  on the club variant. No behaviour change.
- threads/[id]/messages/route.ts: imports swapped, 162 lines of the four moved pieces removed.
  No other hunk.
- .env.example: +20 lines, the three CHAT_V2_ variables, commented out, no values.
- rooms.ts: four exported functions (loadRoom, canPost, filterRoomReaders, clubRole), each
  throws. Note: the message is held in a constant (NOT_BUILT = "rooms.ts: not built yet (B1b)")
  rather than written inline in each throw; the thrown text is the same.

## For the orchestrator

The rule "pass only if all three commands succeed" cannot go green for any batch on this
branch until the baseline is fixed, because both red results come from files identical to
HEAD. Either fix the baseline in its own owned change (one import in parse-reminder.test.ts;
32 lint errors in 11 old component files, 3 auto-fixable) or judge batches on "no new
problem": repo-wide typecheck + eslint on the batch's files + no new failing test.

---

# B0 gate, re-run after repair round 3 (read-only) — 2026-09-29

Same branch (chat-v2-wave-1), same HEAD (5cd325d), Node v25.9.0. No file changed except this one.

## Verdict: FAIL by the letter of the gate rule; nothing in B0 is red

Third gate, same result as the first two. Two of the three commands exit 1, both because of
files that are identical to HEAD, outside B0's list, and not being edited by another batch.
New in this run: the red baseline is now PROVEN on an untouched copy of HEAD (below), not
only inferred from "unchanged vs HEAD".

## Commands, in order

1. `npm run typecheck` (tsc --noEmit): exit 0, no errors.
2. `npm run lint` (eslint): exit 1. 88 problems (32 errors, 56 warnings), 27 files, errors in 11.
   - The 14 B0 files in the eslint JSON report: each 0 errors, 0 warnings.
   - `npx eslint` on the B0 files alone: exit 0, no output.
   - Errors: CampusMobile.tsx 4, MessagesMobile.tsx 3, ProfileMobile.tsx 7,
     LyraConstellation.tsx 1, card-hover-effect.tsx 2, glare-card.tsx 1, mouse-spotlight.tsx 1,
     moving-border.tsx 3, particles.tsx 3, sparkles.tsx 1, wavy-background.tsx 6.
     `git status --short` on those folders, eslint.config.mjs, package.json, tsconfig.json: empty.
3. `npm test` (node --test): exit 1. tests 1362, pass 1361, fail 1.
   - The one failure: src/lib/otto/parse-reminder.test.ts line 17, ERR_MODULE_NOT_FOUND on
     `from "./parse-reminder"` (no extension). Unchanged vs HEAD, last changed in 7746498.
   - B0's tests alone (flag, room-state, room-rules): 71 of 71 pass.

## Proof that the baseline itself is red

`git archive HEAD` unpacked into the session scratchpad (outside the repo, node_modules
linked, copy deleted afterwards), none of the branch's uncommitted work in it:
- eslint: 88 problems (32 errors, 56 warnings). Same numbers.
- node --test on HEAD's test files: tests 1291, pass 1290, fail 1 = parse-reminder.test.ts.
  (1291 + B0's 71 new tests = 1362.)
So B0 added 0 lint problems and 0 failing tests, and 71 passing tests.

## git status --short / git diff --stat

Identical to the first gate: 4 modified (.env.example, scripts/local-seed.mjs,
threads/[id]/messages/route.ts, channel-access.ts), untracked: scripts/sql/ (2 files),
src/app/api/me/features/route.ts, src/lib/chat/ (exactly the 11 files of B0's list),
supabase/migrations/20261001100000_chat_v2_rooms.sql.
"4 files changed, 298 insertions(+), 193 deletions(-)".

Stray-file check: PASS. Nothing changed or new outside B0's list, scripts/,
supabase/migrations/ and handoffs/ (gitignored).

## Scope spot-checks (not part of the pass rule, all fine)

- channel-access.ts: +5 lines, type-only import of RoomKind and the two optional fields.
- threads/[id]/messages/route.ts: one import block added, the moved pieces removed, no other hunk.
- .env.example: +20 lines, three CHAT_V2_ variables, commented out, no values.
- rooms.ts: four exported functions, each throws "rooms.ts: not built yet (B1b)" (held in a
  constant NOT_BUILT, same thrown text).

## For the orchestrator

- Do not send this back to B0 repair: three rounds changed nothing because nothing B0 owns
  can change either exit code. Pick one: (a) judge batches on "no new problem" (repo-wide
  typecheck, eslint on the batch's files, no new failing test), under which B0 PASSES; or
  (b) fix the baseline in its own owned change first (one import in parse-reminder.test.ts;
  32 lint errors in 11 component files, 3 auto-fixable).
- Still open from Franky's relayed answer ("2. agreed but you shouldn't be able to see their
  messages still"): the officer Board-post exception in contract 12.2. B0 encodes neither
  reading (`hidden` is only reserved). Needs his yes or no before the screens wave.
