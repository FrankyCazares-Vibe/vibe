# W2-S1 gates (contract 13.3)

## First commit (the serial prelude of 13.1)

Files: `src/components/mobile/messages/v2-tokens.ts`, `messages/avatar.ts`,
`messages/avatar.test.ts`, `src/lib/chat/use-chat-v2.ts`,
`src/lib/chat/use-hide-tabbar.ts`, `src/app/layout.tsx` (line 96 only).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output |
| tests | `npm test` | 1580 tests, 1580 pass, 0 fail (1575 + the 5 of `avatar.test.ts`) |
| build | `npm run build` | exit 0 (`○ (Static)` / `ƒ (Dynamic)` summary; no warning naming a batch file) |
| eslint | `npx eslint src/components/mobile/messages/v2-tokens.ts src/components/mobile/messages/avatar.ts src/components/mobile/messages/avatar.test.ts src/lib/chat/use-chat-v2.ts src/lib/chat/use-hide-tabbar.ts src/app/layout.tsx` | exit 0; 0 errors, 1 warning `@next/next/no-page-custom-font` at `layout.tsx:95` — pre-existing: `git show a9355d1:src/app/layout.tsx \| npx eslint --stdin --stdin-filename src/app/layout.tsx` reports the same one warning; none added |

`git diff a9355d1 -- src/app/layout.tsx` is one line (`:96`), the fonts query
string of 11.0: `family=Fraunces:ital,wght@0,400;0,700;0,800;0,900;1,400&family=DM+Sans:wght@300;400;500;600;700;800`.

## Part 2 (the main S1 batch: the home, the flag fork, CampusMobile 2.2)

Files: `src/lib/chat/week.ts` + `week.test.ts`, `src/components/mobile/messages/home/{home-rules.ts,home-rules.test.ts,HomeEmpty.tsx,PersonRow.tsx,ClubRow.tsx,YourWeek.tsx,MessagesHome.tsx}`,
`src/components/mobile/MessagesMobile.tsx`, `src/components/mobile/CampusMobile.tsx`, `handoffs/chat-redesign/wave-2-build/S1-contrast.md`.
Commits `22d920e`, `92a0810`, `005020d`, `048cb1f`, `b47a72b` (+ the notes/gate commit).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0, no output (repo-wide, first run; no SIBLING entry needed) |
| tests | `npm test` | 1614 tests, 1614 pass, 0 fail (1590 before this batch + 7 `week.test.ts` + 10 `home-rules.test.ts` + the siblings' new tests landing meanwhile) |
| build | `npm run build` | exit 0 after the last code edit (`○ (Static)` / `ƒ (Dynamic)` summary; no warning naming a batch file; no `useSearchParams` Suspense complaint for `/messages`) |
| eslint | `npx eslint src/components/mobile/MessagesMobile.tsx src/components/mobile/CampusMobile.tsx src/components/mobile/messages/v2-tokens.ts src/components/mobile/messages/avatar.ts src/components/mobile/messages/avatar.test.ts src/lib/chat/use-chat-v2.ts src/lib/chat/use-hide-tabbar.ts src/lib/chat/week.ts src/lib/chat/week.test.ts src/components/mobile/messages/home src/app/layout.tsx` | 6 errors, 1 warning — EXACTLY the baseline set (below); 0 new |

**Old-error parity** (`git show a9355d1:<path> \| npx eslint --stdin --stdin-filename <path>`, rule by rule and declaration by declaration):

| file | baseline at `a9355d1` | now | verdict |
|---|---|---|---|
| `MessagesMobile.tsx` | `react-hooks/immutability` :151 (`refetchThreadsRef.current = …`), `react-hooks/set-state-in-effect` :204 (`setOpenThreadId(existing.id)` in the `?to=` effect) | the same two, at :501 and :554, both inside `MessagesMobileV1` (the old body moved verbatim under a new name; `MessagesMobile` is now the fork) | no new error |
| `CampusMobile.tsx` | `react-hooks/set-state-in-effect` :282, :434, :630, :3990 | the same four at :314, :466, :662, :4026 (+32 lines: the imports, the two tab orders, the flag/router/gate block) | no new error |
| `layout.tsx` | 1 warning `@next/next/no-page-custom-font` :95 | the same | no new warning |
| every other S1 file | new file | 0 problems | — |

Pure tests: `node --test src/lib/chat/week.test.ts` (7 pass), `node --test src/components/mobile/messages/home/home-rules.test.ts` (10 pass; the `when.test.ts` resolve-hook pattern for the `@/` alias).
