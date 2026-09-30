# W2-S2 gate record — part 1 (the first commit, serial prelude)

Base for the moved-file eslint comparison: `a9355d1` (the branch head when the
screen batches started; the two moved files did not exist at `507d6b4`).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0 |
| tests | `npm test` | 1590 tests, 1590 pass, 0 fail (10 new in `src/lib/chat/page-merge.test.ts`) |
| build | `npm run build` | exit 0 |
| eslint | `npx eslint src/components/mobile/messages/club/ClubSpace.tsx src/lib/chat/use-room-poll.ts src/lib/chat/page-merge.ts src/lib/chat/page-merge.test.ts src/components/mobile/messages/ReactionPicker.tsx src/components/mobile/messages/MessageBubble.tsx` | exit 0, 0 problems |
| eslint baseline | `git show a9355d1:src/components/mobile/messages/ReactionPicker.tsx \| npx eslint --stdin --stdin-filename <path>` and the same for `MessageBubble.tsx` | exit 0 each (no old error to carry; none added) |
| split-check | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | exit 1 as expected after the split (10.3, integration reading): missing 0 · changed 4 · added 13 · duplicate 0; CHANGED = MessageRow, ConversationView (W2-B3), MessageBubble, ReactionPicker (this commit's `onRemove` lines only); the report is in S2-notes.md |

Fixed while gating: `page-merge.test.ts` imported `./page-merge.ts` statically
(TS5097 under the repo's tsconfig) → the repo's `specifier` dynamic-import
pattern; `use-room-poll.ts` wrote a ref during render (`react-hooks/refs`) →
written in an effect.

# W2-S2 gate record — part 2 (the club space, the main batch)

Head after the last code commit: `b7b8779` on `claude/relaxed-davinci-9d11h3`.
Base for the moved-file eslint comparison: `a9355d1` (as part 1).

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | exit 0 (repo-wide) |
| tests | `npm test` | 1614 tests, 1614 pass, 0 fail (7 new in `src/components/mobile/messages/club/helpers.test.ts`: the separators rule over non-stub rows, the chip state word, the labels) |
| build | `npm run build` | attempt 1: `Another next build process is already running` (a sibling's build; 13.3's collision rule) → waited 90 s → attempt 2 exit 0 |
| eslint | `npx eslint src/components/mobile/messages/club/ src/lib/chat/use-room-poll.ts src/lib/chat/page-merge.ts src/lib/chat/page-merge.test.ts src/components/mobile/messages/ReactionPicker.tsx src/components/mobile/messages/MessageBubble.tsx` | exit 0, 0 problems |
| eslint baseline | `git show a9355d1:src/components/mobile/messages/ReactionPicker.tsx \| npx eslint --stdin --stdin-filename <path>` and the same for `MessageBubble.tsx` | exit 0 each (no old error to carry; none added) |

Lint findings fixed on the way (all `react-hooks` compiler rules, errors here):
`set-state-in-effect` twice (the space read now lives inside its effect and
sets state in the read's callback; Retry bumps a token), `immutability` once
(the Board's scroll element is a ref, not state), one unused import, one
unused prop. `new Date()` in render is allowed by the rules (probed), so the
screens hold `now` in state ticked by a 60-s interval.
