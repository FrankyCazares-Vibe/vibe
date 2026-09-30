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
