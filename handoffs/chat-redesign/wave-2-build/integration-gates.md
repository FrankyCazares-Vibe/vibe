# Integration review — lens "gates" (wave 2, branch `claude/relaxed-davinci-9d11h3` at `b3381af`)

Re-run of every 13.3 cloud gate at `b3381af` (tree clean: `git status --porcelain | grep -v '^??'` empty; the only untracked files are the sibling reviewers' `integration-*.md`). Base for the eslint compare = `5c68da1` (main); base for the split-check = `507d6b4` (the first line of `S-split-check.txt`, 10.3). Node v22.22.2, Next.js 16.3.4 (Turbopack). Scratch logs under `<scratchpad>/intg/`.

Verdict: **every gate green**. Two LOW contract-wording amendments (INT-GATES-1, INT-GATES-2), no code change asked.

## 1. `npm run typecheck`

```
$ npm run typecheck
> tsc --noEmit
EXIT=0
```
No output. **Green.**

## 2. `npm test` (all; count)

```
$ npm test          # node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')  → 115 test files
# tests 1639
# suites 0
# pass 1639
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 11450
EXIT=0
```
**1,639 / 1,639 green** (contract 13.3: 1,374 at the split + the new ones). Cross-reference: `S-gate.md:8` 1,374 → `B4-gate.md:23` 1,575 → `S1-gate.md:28` 1,614 → `S3-gate.md:32` 1,637 → `S3-gate.md:51` / `S3-repair.md:54` 1,639 (the 2 last ones: `cardWord`, `cardAuthorName` in `cards/card-rules.test.ts`, commit `673c25b`). No test file changed after `673c25b`; the count is the recorded one. **Green.**

## 3. `npm run build`

```
$ npm run build
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 23.7s
✓ Generating static pages using 3 workers (122/122) in 1626ms
EXIT=0
```
`grep -n -i "error\|warn\|server-only\|Suspense"` over the log: nothing. **Green.**

**New routes in the manifest** (the four route files `git diff --diff-filter=A 5c68da1..b3381af -- 'src/app/**/route.ts'` adds; every one present, all `ƒ (Dynamic)`):

| route file added | manifest line |
|---|---|
| `src/app/api/me/inbox/route.ts` | `├ ƒ /api/me/inbox` |
| `src/app/api/me/threads/[id]/cards/route.ts` | `├ ƒ /api/me/threads/[id]/cards` |
| `src/app/api/me/threads/[id]/cards/[messageId]/vote/route.ts` | `├ ƒ /api/me/threads/[id]/cards/[messageId]/vote` |
| `src/app/api/orgs/[slug]/space/route.ts` | `├ ƒ /api/orgs/[slug]/space` |

No page added (`git diff --diff-filter=A … 'src/app/**/page.tsx'` empty). Routes modified, all already in the manifest: `me/calendar`, `me/reports`, `me/threads`, `me/threads/[id]/messages`, `me/threads/[id]/messages/[messageId]`, `orgs/[slug]/channels/[channelId]/members`.

## 4. eslint over the wave's diff

```
$ git diff --name-only 5c68da1..b3381af -- 'src/**/*.ts' 'src/**/*.tsx' 'scripts/*.mjs'   → 102 files (changed.txt)
$ npx eslint $(cat changed.txt) -f json -o eslint.json ; EXIT=1
errors 7, warnings 8
```
Every hit, by file and rule:

| file | severity | rule | line | status vs `5c68da1` |
|---|---|---|---|---|
| `src/components/mobile/CampusMobile.tsx` | ERROR ×4 | `react-hooks/set-state-in-effect` | 316, 468, 664, 4030 | **old** (base: same rule ×4) |
| `src/components/mobile/MessagesMobile.tsx` | ERROR | `react-hooks/immutability` | 523 | **old** (base `:481`, same statement `refetchThreadsRef.current = refetchThreads`) |
| `src/components/mobile/MessagesMobile.tsx` | ERROR | `react-hooks/set-state-in-effect` | 576 | **old** (base `:534`, same statement `setOpenThreadId(existing.id)`) |
| `src/components/mobile/messages/ComposeOverlay.tsx` | ERROR | `react-hooks/set-state-in-effect` | 87 | **old, moved by the split** (base `MessagesMobile.tsx:3669`, same statement `setResults(null)`) |
| `src/components/mobile/messages/GroupSettingsView.tsx` | warn | `@typescript-eslint/no-unused-vars` (`setPhotoUrl`) | 33 | **old, moved by the split** (base `MessagesMobile.tsx:2855`, same statement) |
| `src/app/campus/campus-home.tsx` | warn ×4 | `@next/next/no-location-assign-relative-destination` | 5633, 5636, 10763, 10790 | **old** (base ×4) |
| `src/app/campus/campus-home.tsx` | warn ×2 | `@typescript-eslint/no-unused-vars` (`GlassCard`, `handleShare`) | 6258, 7680 | **old** (base ×2) |
| `src/app/layout.tsx` | warn | `@next/next/no-page-custom-font` | 95:9 | **old** (base: same line 95:9) |

Every other file of the 102 (the 4 new routes, `src/lib/chat/**`, `messages/{home,club,cards,compose}/**`, `scripts/local-seed.mjs`, `ReportSheet.tsx`, …): **0 hits**. The exit 1 is the legacy files' errors alone, which 13.3 handles by the compare below.

**Rule-by-rule compare** (`git show 5c68da1:<path> | npx eslint --stdin --stdin-filename <path> -f json`):

| file | base (`5c68da1`) | now (`b3381af`) | new hits |
|---|---|---|---|
| `MessagesMobile.tsx` | immutability 1, set-state-in-effect 2, no-unused-vars(warn) 1 | immutability 1, set-state-in-effect 1 — plus `ComposeOverlay.tsx` set-state-in-effect 1 and `GroupSettingsView.tsx` no-unused-vars(warn) 1 | **none** (3 errors + 1 warning, the same four statements, two moved by the split) |
| `CampusMobile.tsx` | set-state-in-effect 4 | set-state-in-effect 4 | **none** |
| `campus-home.tsx` | no-location-assign 4, no-unused-vars 2 (warnings; exit 0) | the same 6 | **none** |

Of `B0-gate.md:19-30`'s 11 legacy-error files, only `CampusMobile.tsx` and `MessagesMobile.tsx` are in the wave's diff (both compared above). **Green.**

## 5. sql-parse (W2-B1's gate)

libpg-query 18.1.5 was already in the scratchpad (`<scratchpad>/pgparse/node_modules/libpg-query`, the header's install); nothing installed in the repo.

```
$ node handoffs/chat-redesign/wave-2-build/tools/sql-parse.mjs --lib <scratchpad>/pgparse/node_modules/libpg-query supabase/migrations/20261001110000_chat_v2_cards.sql
sql-parse: supabase/migrations/20261001110000_chat_v2_cards.sql: 47 statements, 5 plpgsql functions, 5 DO blocks: all parse
EXIT=0
$ node …/sql-parse.mjs --lib <same> --strip-psql scripts/sql/chat-v2-cards-check.sql
sql-parse: scripts/sql/chat-v2-cards-check.sql: 25 statements, 4 plpgsql functions, 11 DO blocks: all parse
EXIT=0
```
md5: migration `0154a6f10c3988d4202d932472773c77`, check script `57b81753b99957b335d34f369de947e6`. The check script's one psql line is `:57` `\set ON_ERROR_STOP on` (its first line is a comment); without `--strip-psql` the parser stops there (`syntax error at or near "\"`, exit 1), as the tool's header says — so `--strip-psql` is the gate's form (INT-GATES-2 on 13.3's wording). **Green.**

## 6. `node --test handoffs/chat-redesign/wave-2-build/tools/validate-thread.test.mjs`

```
# tests 18 / # pass 18 / # fail 0   EXIT=0
```
**Green.**

## 7. The split-check report at integration (10.3's last paragraph)

```
$ node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4        (exit 1, ignored per 10.3)
split-check: 51 declarations in 507d6b4:src/components/mobile/MessagesMobile.tsx; 71 across MessagesMobile.tsx + src/components/mobile/messages
  missing 0 · changed 5 · added 20 · duplicate 0
```
- MISSING **empty**; DUPLICATE **empty**.
- CHANGED = exactly `MessagesMobile`, `ConversationView`, `MessageRow`, `MessageBubble`, `ReactionPicker` — the five 10.3 names. Each diff read in full (a scratch script with the tool's own extraction, raw text, `diff -u`; `<scratchpad>/intg/decl/`):
  - `MessageRow` (`messages/types.ts:98`): + the `hidden?: boolean` field and its 8.1 comment. Those lines only.
  - `ConversationView` (`ConversationView.tsx:49`): + `const shown = (messages ?? []).filter((m) => !m.hidden);` with its comment; `messages.map` → `shown.map`, `messages[i - 1]` → `shown[i - 1]`. Those lines only (12.1; B3 STOPPED 2's literal).
  - `MessageBubble` (`MessageBubble.tsx:12`): + `onRemove` param, its prop type/comment, and the guarded `onRemove={…}` pass-through. Those lines only.
  - `ReactionPicker` (`ReactionPicker.tsx:36`): + `onRemove` param/prop, `|| onRemove` in the two shape conditions, and the "Remove" button. Those lines only.
  - `MessagesMobile` (`MessagesMobile.tsx:59`): now the 13-line flag fork (`useChatV2()` → `FlagPending` / `MessagesMobileV2` / `MessagesMobileV1`, 2.1). The base body moved to `MessagesMobileV1` verbatim: 373 lines vs 373, the only diff line is the declaration's name.
- ADDED = 20, listed not judged: in `MessagesMobile.tsx` itself `FlagPending`, `OpenView`, `HistoryMark`, `depthOf`, `channelUrl`, `MessagesMobileV2`, `MessagesMobileV1` (7); in `messages/avatar.ts` `CLUB_GRADIENTS`, `PersonColor`, `PERSON_COLORS`, `hashId`, `clubGradient`, `personColor` (6); in `messages/v2-tokens.ts` `SERIF`, `FONT`, `Palette`, `CORAL`, `NIGHT`, `LIGHT`, `palette` (7). Exactly W2-S1's own additions plus the two flat files 10.3 names; the screens' subdirectories are not walked. **Green.**

## 8. `"use client"` over the new `.tsx` under `src/components/mobile/messages` (recursive)

```
$ git diff --name-only --diff-filter=A 5c68da1..b3381af -- 'src/components/mobile/messages/**/*.tsx' 'src/components/mobile/messages/*.tsx' | xargs grep -L '"use client"'
(nothing)   — 36 new .tsx files
$ find src/components/mobile/messages -name '*.tsx' | xargs grep -L '"use client"'
(nothing)
```
`messages/theme.ts` (10.3 item 6) and the three hooks `src/lib/chat/use-chat-v2.ts`, `use-hide-tabbar.ts`, `use-room-poll.ts` carry it too. **Green.**

## 9. `server-only` import graph

Directive present: `src/lib/chat/blocks.ts:17`, `event-refs.ts:21`, `cards/hydrate.ts:29`, `cards/snapshot.ts:15`.

What the four import (all server side or type-only):
- `blocks.ts` → `type SupabaseClient` only.
- `event-refs.ts` → `@/lib/supabase/service`, `./room-rules`, `./room-state`, `./schema`, `type EventRef`.
- `cards/hydrate.ts` → `type createSupabaseServerClient`, `@/lib/supabase/service`, `../event-refs`, `../room-state`, `../schema`, types.
- `cards/snapshot.ts` → `@/lib/supabase/service`, `../schema`, `type CardSnapshot`.

Who imports them (non-test; none carries `"use client"`):
- `blocks` ← `me/threads/[id]/cards/[messageId]/vote/route.ts`, `me/threads/[id]/messages/route.ts`, `me/inbox/route.ts`, `src/lib/chat/message-read.ts`.
- `event-refs` ← `me/inbox/route.ts`, `me/calendar/route.ts`, `orgs/[slug]/space/route.ts`, `cards/hydrate.ts`.
- `cards/hydrate` ← `…/vote/route.ts`, `message-read.ts`.
- `cards/snapshot` ← `me/reports/route.ts`.
- One level up, `message-read.ts` / `reads.ts` (no directive, but they import `blocks`/`hydrate`) ← only the API routes (`cards`, `vote`, `messages`, `messages/[messageId]`, `inbox`, `space`) and `src/lib/chat/types.ts:17` as `import type { AttachmentRow, ParentPreview } from "./message-read"` (erased).

The client side imports only `@/lib/chat/{types, room-rules, when, week, use-chat-v2, use-hide-tabbar, use-room-poll}` (33/1/8/3/2/4/6 imports across `messages/**`, `MessagesMobile.tsx`, `CampusMobile.tsx`, `src/app/campus`); each is pure or a hook: `when.ts` → `@/lib/push/event-notice` (one `import type`) + `./room-state` (types only); `use-room-poll.ts` → `./page-merge` (no imports), `LoadFailed`, `request`. No client file reaches a `server-only` module (the build, the one check that sees it, agrees: exit 0). **Green.**

## Findings

- **INT-GATES-1 (LOW, contract wording)** — `wave-2-contracts.md` 13.3 (and 10.3 step 4) names `MessagesMobile.tsx` alone as the carrier of its 3 errors + 1 warning, but two of those four now live in split children: `src/components/mobile/messages/ComposeOverlay.tsx:87` (`react-hooks/set-state-in-effect`, was `MessagesMobile.tsx:3669`) and `src/components/mobile/messages/GroupSettingsView.tsx:33` (`@typescript-eslint/no-unused-vars` `setPhotoUrl`, was `:2855`). A later gate reading 13.3 literally ("`npx eslint <the batch's files>` exit 0") counts them as new. Fix: in 13.3's parenthetical after `campus-home.tsx` add "; and, since the split, `messages/ComposeOverlay.tsx:87` (`react-hooks/set-state-in-effect`) and `messages/GroupSettingsView.tsx:33` (`@typescript-eslint/no-unused-vars`), the two of `MessagesMobile.tsx`'s four that moved — compared against `git show <base>:src/components/mobile/MessagesMobile.tsx`'s hits at `:3669` and `:2855`".
- **INT-GATES-2 (LOW, contract wording)** — 13.3 says the check script is parsed "with its psql first line stripped"; the psql line is `scripts/sql/chat-v2-cards-check.sql:57` (`\set ON_ERROR_STOP on`), the first line is a comment, and the tool's flag is `--strip-psql` (every backslash line). Fix: replace "with its psql first line stripped" with "with `--strip-psql` (its `\set ON_ERROR_STOP on` line, `:57`)".

## Holds

- typecheck exit 0; tests 1,639/1,639 (115 files; matches `S3-gate.md:51`); build exit 0 with the four new routes in the manifest and no warning; eslint 0 new hits (7 errors / 8 warnings, every one present at `5c68da1`, rule-by-rule) and 0 hits on every new or lib file; sql-parse exit 0 on both files; validate-thread 18/18; split-check MISSING/DUPLICATE empty, CHANGED the five named declarations and those lines only, ADDED the 20 of W2-S1; `"use client"` on all 36 new `.tsx`; `server-only` reachable from API routes only.
- 13.3's cloud gate list is satisfied at `b3381af` with the tree clean. The Mac's gates (rehearsals, the HTTP tables, the browser walk, the Preview URL) are not run here.
- Not this lens: the adjudication items the harness listed (the sibling `integration-adjudicate.md`), section 0's nine-row check (`integration-flag-off.md`), the old renderers, producer/consumer.
- **Final HEAD after the repair (re-run by the amender, S70):** the last code change is `ebf6c3a` (INT-FLAG-OFF-4); `e58c99f` and the section-17 commit are docs only (`git diff --stat ebf6c3a..HEAD -- src public scripts supabase` empty). At `e58c99f`: `npm run typecheck` exit 0, no output; `npm test` 1,639 / 1,639 (115 files, `# fail 0`, 8.4 s). Build not re-run (no `src/` change after the repairer's build at `ebf6c3a`: exit 0, `✓ Compiled successfully in 17.1s`, the four new routes `ƒ`, no `error` / `warn` / `server-only` / `Suspense` line); eslint 0 new hits, split-check MISSING 0 · DUPLICATE 0 · CHANGED 5 · ADDED 20, sql-parse both files parse, validate-thread 18 / 18 — all as `integration-repair.md` §4 records at `ebf6c3a`. Every cloud gate of 13.3 is green at the final HEAD; the amendments are `wave-2-contracts.md` section 17.
