# W2-S repair — one pass after the three reviews (contract, move, logic)

Repaired commit: `91a40d7` (the split). Base sha: `507d6b4` (first line of `S-split-check.txt`). Reviews read: `S-review-contract.md`, `S-review-move.md`, `S-review-logic.md` — all three PASS, no HIGH, no MEDIUM, four LOW notes (two of them the same comment). Every finding was re-checked against the tree before deciding. Repair scope per 10.2: imports / exports / comments / `"use client"` / the tool only; no declaration body was touched (none needed to be: `stopped_on` stays empty).

## Findings

| finding | verdict | one line |
|---|---|---|
| CONTRACT-1 (LOW) — `S-split-check.txt:4` carries `exit=0`, a line the tool did not print | **FIXED** | Verified: `grep -n "exit=" tools/split-check.mjs` finds nothing, so line 4 was the builder's annotation. The file is now the verbatim capture 10.3 describes: line 1 the sha, lines 2-3 the tool's two output lines, nothing else; the exit status (0) is recorded in `S-gate.md` row 5 instead. |
| CONTRACT-2 / MOVE-1 / LOGIC-1 (LOW, one finding seen through three lenses) — the vaul-styles note (old `:214-217`) sits at `theme.ts:7-10`, away from the styles in `sheet-styles.ts` | **REJECTED as a W2-S repair** (finding real, placement contract-bound) | Verified: `theme.ts:7-10` is the four-line "Inline styles for the bottom-sheet primitives…" note, verbatim from the base, above `subscribeTheme`. Contract 10.1 row 2 is explicit — `subscribeTheme :224-227 (comments :213-223)` → `messages/theme.ts` — and the contract is FINAL; a batch may not reinterpret its table. All three reviewers say "fix: none in W2-S". Deferred: a comment-only move of `theme.ts:7-11` to the top of `sheet-styles.ts` for W2-S1 / the integration pass (the checker ignores trivia, no gate is affected). Recorded in `S-notes.md` since the split. |
| MOVE-2 (LOW) — the header comment `MessagesMobile.tsx:21-40` ("Two screens, one component") is partly stale after the split | **REJECTED as a W2-S repair** (finding real, text contract-bound) | Verified: the header is old `:32-51` verbatim, as 10.1's last row requires ("the header comment :32-51"). Rewording is a comment-only edit but 10.2 rule 5 gives the next edit of `MessagesMobile.tsx` to W2-S1 alone (the flag fork), which may reword it then. Reviewer's own fix line: "None in W2-S". |

Fixed: 1. Rejected (real but contract-bound, deferred with a named owner): 2. Wrong findings: 0 — every reviewer claim held against the tree.

## Proof (10.3), re-run after the repair from the repo root, base `507d6b4`

| # | command | result |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm test` | exit 0 — 1374 tests, 1374 pass, 0 fail |
| 3 | `npm run build` | exit 0 |
| 4 | `npx eslint -f json src/components/mobile/MessagesMobile.tsx src/components/mobile/messages/*.ts src/components/mobile/messages/*.tsx` vs `git show 507d6b4:src/components/mobile/MessagesMobile.tsx \| npx eslint -f json --stdin --stdin-filename src/components/mobile/MessagesMobile.tsx` | both 3 errors + 1 warning, same four rule ids: `react-hooks/immutability` `:481:5` → `MessagesMobile.tsx:151:5`; `react-hooks/set-state-in-effect` `:534:7` → `MessagesMobile.tsx:204:7`; `react-hooks/set-state-in-effect` `:3669:7` → `messages/ComposeOverlay.tsx:87:7`; `@typescript-eslint/no-unused-vars` (setPhotoUrl) `:2855:20` → `messages/GroupSettingsView.tsx:33:20`. No new hit. |
| 5 | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | exit 0 — `51 declarations … 51 across …`; `missing 0 · changed 0 · added 0 · duplicate 0`. Saved verbatim under the sha line in `S-split-check.txt`. |
| 6 | `grep -L '"use client"' src/components/mobile/messages/*.tsx src/components/mobile/messages/theme.ts` | prints nothing |
| 7 | `grep -h "^import\|^} from" src/components/mobile/messages/*.ts*` | 12 sibling modules (`./ComposeOverlay ./ConversationActionSheet ./GroupSettingsView ./MessageBubble ./ReactionPicker ./ThreadList ./format ./send-failure ./sheet-styles ./sheets ./theme ./types`) + exactly the ten allowed externals (`next/link`, `react`, `vaul`, `@/components/feedback/LoadFailed`, `@/components/push/PushAsk`, `@/components/safety/ReportSheet`, `@/lib/chat/types`, `@/lib/feedback/request`, `@/lib/feedback/toast`, `@/lib/theme/theme`); nothing else |

Proof green: yes, all seven. Files changed by the repair: `S-split-check.txt` (line 4 dropped), `S-gate.md`, `S-notes.md`, this file; the three review files are committed alongside. `src/` and the tool are untouched by the repair (`git diff 91a40d7 --stat -- src handoffs/chat-redesign/wave-2-build/tools` is empty). No push.
