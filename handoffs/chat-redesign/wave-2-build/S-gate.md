# W2-S gate — the split's proof (contract 10.3), run from the repo root

Base sha: `507d6b4` (the commit W2-S starts from; also the first line of `S-split-check.txt`). Tree: `MessagesMobile.tsx` (421 lines) + 13 flat files under `src/components/mobile/messages/`.

| # | command | result |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 (first run after the cut; no import fix was needed) |
| 2 | `npm test` | exit 0 — 1374 tests, 1374 pass, 0 fail |
| 3 | `npm run build` | exit 0 (Next.js production build, no env) |
| 4 | `npx eslint src/components/mobile/MessagesMobile.tsx src/components/mobile/messages/*.ts src/components/mobile/messages/*.tsx` vs `git show 507d6b4:src/components/mobile/MessagesMobile.tsx \| npx eslint --stdin --stdin-filename src/components/mobile/MessagesMobile.tsx` | both: 4 problems (3 errors, 1 warning). Rule by rule (listed with `-f json`): `react-hooks/immutability` old `:481:5` → `MessagesMobile.tsx:151:5`; `react-hooks/set-state-in-effect` old `:534:7` → `MessagesMobile.tsx:204:7`; `react-hooks/set-state-in-effect` old `:3669:7` → `messages/ComposeOverlay.tsx:87:7`; `@typescript-eslint/no-unused-vars` (setPhotoUrl) old `:2855:20` → `messages/GroupSettingsView.tsx:33:20`. No new hit. (ESLint 9 has no `compact` formatter; the json output was reduced to `file:line:col level rule`.) |
| 5 | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | exit 0 — 51 declarations in the base; 51 across the tree; missing 0 · changed 0 · added 0 · duplicate 0 (output in `S-split-check.txt`). The tool was edited first in this commit: ADDED fatal in the exit line; `listFiles` no longer recurses. Run on the unsplit tree before the cut: 51/51, exit 0. |
| 6 | `grep -L '"use client"' src/components/mobile/messages/*.tsx src/components/mobile/messages/theme.ts` | prints nothing |
| 7 | `grep -h "^import\|^} from" src/components/mobile/messages/*.ts*` | every module is `./<sibling>` (ComposeOverlay, ConversationActionSheet, GroupSettingsView, MessageBubble, ReactionPicker, ThreadList, format, send-failure, sheet-styles, sheets, theme, types) or one of the ten (`next/link`, `react`, `vaul`, `@/components/feedback/LoadFailed`, `@/components/push/PushAsk`, `@/components/safety/ReportSheet`, `@/lib/chat/types`, `@/lib/feedback/request`, `@/lib/feedback/toast`, `@/lib/theme/theme`) |

Also checked: the two importers are untouched (`src/app/messages/MessagesSwitch.tsx:4`, `src/components/mobile/CampusMobile.tsx:37`; `git diff 507d6b4 --stat` over them is empty); `grep "export default"` over the tree finds none; no section banner remains (dropped, 10.2 rule 2); `git status` shows only the owned files.

## Repair pass (after the three reviews; see `S-repair.md`)

Reviews: contract, move, logic — all PASS, four LOW notes, none touching a declaration. Repair changed handoff files only (`S-split-check.txt` is now the verbatim tool capture: sha line + the tool's two lines, the builder's `exit=0` annotation dropped — CONTRACT-1); `src/` and the tool are as in `91a40d7`. The seven proofs were re-run in full on the repaired tree with the same results as the table above: typecheck exit 0; 1374/1374; build exit 0; lint parity (same four rule ids at `MessagesMobile.tsx:151:5`, `:204:7`, `messages/ComposeOverlay.tsx:87:7`, `messages/GroupSettingsView.tsx:33:20`, no new hit); split-check exit 0 with missing 0 · changed 0 · added 0 · duplicate 0; `grep -L` prints nothing; imports on the allow-list only. Deferred (contract-bound, not W2-S's to change): the vaul-styles note at `theme.ts:7-10` (10.1 row 2) and the header comment `MessagesMobile.tsx:21-40` (10.1 last row; W2-S1 edits that file next).
