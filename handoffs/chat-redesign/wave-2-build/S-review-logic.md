# W2-S review — lens "logic" (no behaviour change)

Reviewed: commit `91a40d7` against base `507d6b4` (the first line of `S-split-check.txt`). Read-only on `src/` and the tool. Contract: `wave-2-contracts.md` section 10 (10.1 table, 10.2 rules, 10.3 proof) and 13.1-13.3.

## Verdict

**PASS.** No HIGH, no MEDIUM. One LOW note (a comment's placement the contract itself dictates). The split is extraction-only: every one of the 51 declarations is byte-identical to the base modulo the `export ` keyword, its leading comment travels with it, every private name stayed private and every name 10.1 exports is exported, the import graph is acyclic, no moved body references a name it does not import (so no DOM global or other binding could have silently taken a name's place), and the four lint hits point at the same source lines as before.

## Gates, run by this reviewer from the repo root

| # | command | result |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm test` | 1374 tests, 1374 pass, 0 fail |
| 3 | `npm run build` | exit 0 |
| 4 | `npx eslint -f json src/components/mobile/MessagesMobile.tsx src/components/mobile/messages/*.ts src/components/mobile/messages/*.tsx` vs `git show 507d6b4:src/components/mobile/MessagesMobile.tsx \| npx eslint -f json --stdin --stdin-filename src/components/mobile/MessagesMobile.tsx` | both 3 errors + 1 warning, same rule ids, same code (table below) |
| 5 | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | `51 declarations … 51 across`; missing 0 · changed 0 · added 0 · duplicate 0; exit 0 (matches `S-split-check.txt`) |
| 6 | `grep -L '"use client"' src/components/mobile/messages/*.tsx src/components/mobile/messages/theme.ts` | prints nothing |
| 7 | `grep -h "^import\|^} from" src/components/mobile/messages/*.ts*` | modules: `./ComposeOverlay ./ConversationActionSheet ./GroupSettingsView ./MessageBubble ./ReactionPicker ./ThreadList ./format ./send-failure ./sheet-styles ./sheets ./theme ./types` + `next/link react vaul @/components/feedback/LoadFailed @/components/push/PushAsk @/components/safety/ReportSheet @/lib/chat/types @/lib/feedback/request @/lib/feedback/toast @/lib/theme/theme` — nothing else |

### Lint parity, rule by rule, with the code each hit points at

| rule | old (507d6b4) | new | source line (identical old/new) |
|---|---|---|---|
| `react-hooks/immutability` (error) | `MessagesMobile.tsx:481:5` | `MessagesMobile.tsx:151:5` | `refetchThreadsRef.current = refetchThreads;` |
| `react-hooks/set-state-in-effect` (error) | `MessagesMobile.tsx:534:7` | `MessagesMobile.tsx:204:7` | `setOpenThreadId(existing.id);` |
| `react-hooks/set-state-in-effect` (error) | `MessagesMobile.tsx:3669:7` | `messages/ComposeOverlay.tsx:87:7` | `setResults(null);` |
| `@typescript-eslint/no-unused-vars` (warning) | `MessagesMobile.tsx:2855:20` | `messages/GroupSettingsView.tsx:33:20` | `const [photoUrl, setPhotoUrl] = useState<string \| null>(thread.photo_url);` |

No new hit in any of the 14 files; in particular no `no-unused-vars` on any new import block (every imported binding is used, checked independently below).

## Holds (what was checked, how, and found correct)

The checker (`split-check.mjs`) ignores leading trivia and collapses whitespace, so this review ran two stricter scripts of its own (scratchpad, TypeScript compiler API, not committed) over `507d6b4:MessagesMobile.tsx` vs the 14 working-tree files:

1. **Bodies byte-identical.** For each of the 51 declarations, the statement text from `getStart()` to `getEnd()` (comments excluded, only a leading `export ` stripped) is exactly equal, no whitespace normalisation. So no literal, no hook order, no prop, no default, no closure changed — including inside template/string literals where the checker's whitespace collapse could have hidden a change.
2. **Doc comments travel.** The leading trivia of each declaration (section banners `// ---------- X ----------` and blank lines removed, per 10.2 rule 2) is equal old vs new for 49 of 51. The two differences are the one the contract dictates: the header comment (old `:32-51`) was `ThreadType`'s leading trivia and is now `LIST_RESYNC_MS`'s in `MessagesMobile.tsx:21-40` — 10.1 says it stays there. The comments `:213-223` are with `subscribeTheme` in `theme.ts:7-16`; `:199` with `StagedMedia`, `:207-208` with `ReplyTarget`, `:325-326` with `quotedBody`, `:342-347` with `chatRefusalLine`, `:353` with `toastSendFailure`, `:359-363` with `entryCanPost`, `:116-117` with `MessageAttachment`, `:133-135` with `ParentPreview`, `:266-267` with `visuallyHiddenStyle`, `:4753-4757` with `swallowNextClick`, `:4967` with `pickerRowStyle`, the attach note `:189-191` with `ATTACH_ACCEPT` (`ConversationView.tsx:23-25`).
3. **Export surface = 10.1, exactly.** Stayed private: `REACTION_EMOJIS`, `ATTACH_ACCEPT`, `ATTACH_IMAGE_TYPES`, `ATTACH_VIDEO_TYPES`, `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES`, `StagedMedia`, `ReplyTarget`, `subscribeTheme`, `LIST_RESYNC_MS`, `MemberRow`, `MemberActionSheet`, `SearchUser`, `ComposeUserRow`, `swallowNextClick`, `pickerRowStyle`. Became exported: the 9 types, `useNightTheme`, the 4 styles, the 6 format functions, both send-failure functions, the 4 ThreadList components, `SheetRow`, `MuteDurationSheet`, `ConversationActionSheet`, `GroupSettingsView`, `ComposeOverlay`, `MessageBubble`, `ReactionPicker`. Unchanged: `MessagesMobile` and `ConversationView` were exported before and are now. No `export default` anywhere; no `export { … }` list statement; the only non-declaration statement in the tree beyond `"use client"` and imports is `MessagesMobile.tsx:421` `export { ConversationView } from "./messages/ConversationView";` (10.2 rule 1).
4. **No name silently rebound.** For each new file, every identifier that was a module-level name of the base file (51 declarations + the 25 import bindings) is either declared in that file or imported into it — zero unresolved. This rules out the one class of bug typecheck cannot see: a forgotten import whose name a DOM global (`name`, `status`, `event`, …) would have satisfied. Conversely every imported binding is used (no dead import).
5. **Module-level state has one home and the same consumers.** `vibe-composer-open`: `ConversationView.tsx:150-151`, `GroupSettingsView.tsx:57-58`, `ComposeOverlay.tsx:43-44` — the same three effects as old `:1158`, `:2879`, `:3625`, inside the same declarations. Theme: `theme.ts` imports `useSyncExternalStore` from `react` and `currentTheme, THEME_EVENT` from `@/lib/theme/theme`; `useNightTheme` still calls `useSyncExternalStore(subscribeTheme, …)` with the private `subscribeTheme` in the same module (`theme.ts:17-27`). `REACTION_EMOJIS` (`ReactionPicker.tsx:7`) is consumed only at `:144` in `ReactionPicker`, as at old `:4888`. The five `ATTACH_*`/`MAX_*` constants (`ConversationView.tsx:26-35`) are consumed only inside `ConversationView` (`:447`, `:449`, `:459`, `:1142`), as at old `:1455-1467`, `:2150`. `LIST_RESYNC_MS` (`MessagesMobile.tsx:44`) consumed at `:161`, as old `:491`. The four vaul style objects are shared objects as before (single home `sheet-styles.ts`), and nothing mutates them (grep for `vaul*Style.x =` / `visuallyHiddenStyle.x =` finds nothing), so sharing across four importers is the same object identity the old file had.
6. **Import graph acyclic.** Edges: `MessagesMobile → ComposeOverlay, ConversationView, theme, ThreadList, types`; `ConversationView → ConversationActionSheet, format, GroupSettingsView, MessageBubble, send-failure, sheet-styles, theme, types`; `GroupSettingsView → ComposeOverlay, format, sheet-styles, sheets, theme, types`; `ComposeOverlay → format, theme, ThreadList`; `MessageBubble → format, ReactionPicker, types`; `ConversationActionSheet → sheet-styles, sheets, types`; `ThreadList → format, types`; `ReactionPicker → types`; `sheets → sheet-styles`; `format → types`; `send-failure`, `sheet-styles`, `theme`, `types → nothing local`. DFS finds no cycle; nothing under `messages/` imports `MessagesMobile.tsx`. So module evaluation order cannot differ from the base (every module-level `const` is a plain literal/`new Set`/object, evaluated before any component runs).
7. **`React.` namespace left as written** (`sheet-styles.ts:1,8,22,32`, `MessageBubble.tsx`, `ReactionPicker.tsx:224`), no file imports `React`; typecheck and build accept it (contract section 10, MM:H3).
8. **The two importers untouched.** `git diff 507d6b4 HEAD --stat -- src/app/messages/MessagesSwitch.tsx src/components/mobile/CampusMobile.tsx` is empty; `MessagesSwitch.tsx:4` still imports `MessagesMobile`, `CampusMobile.tsx:37` still imports `ConversationView` from `@/components/mobile/MessagesMobile` (served by the re-export; `Parameters<typeof ConversationView>[0]["thread"]` typechecks).
9. **The commit touches only owned files** (18: `MessagesMobile.tsx`, the 13 new files, the tool, `S-notes.md`, `S-gate.md`, `S-split-check.txt`); no `cut.mjs` or scratch residue in the tree; `messages/` is flat (no subdirectory, no barrel, no `.d.ts`).
10. **The tool's two changes are exactly 10.3's**: `listFiles` now `continue`s on a directory (`:84`, with its two-line comment at `:82-83`), the exit line is `missing.length || changed.length || duplicates.length || added.length ? 1 : 0` (`:131`); the only other lines are the header doc comment's two sentences describing those two behaviours and a two-line inline comment. Neither `--base` nor the normalisation was touched. Run by this reviewer with `--base 507d6b4`: 51/51, all four buckets empty.
11. **`S-notes.md`**: `stopped_on` is empty and that is justified — item 1 above shows no declaration needed a text change to compile; the notes' lint mapping (481→151, 534→204, 3669→ComposeOverlay:87, 2855→GroupSettingsView:33) is what this reviewer measured. The builder did not edit any body (`git show HEAD --stat` plus the byte-exact diff above).
12. `"use client"` is the first statement, with no leading trivia, in all 8 `.tsx` files and `theme.ts`; the four plain `.ts` modules (`types`, `format`, `send-failure`, `sheet-styles`) have none, which the contract allows (only `.tsx` and `theme.ts` are required) and which changes nothing: they are imported only by client modules.

## Findings

No HIGH. No MEDIUM.

### LOGIC-1 (LOW) — the vaul-styles note sits in `theme.ts`, away from the styles it describes
- **where:** `src/components/mobile/messages/theme.ts:7-10` (old `:214-217`); the styles are in `src/components/mobile/messages/sheet-styles.ts:1-42`.
- **what:** The four-line comment "Inline styles for the bottom-sheet primitives … vaul owns the open/close animation …" was `subscribeTheme`'s leading trivia in the base (it preceded the Theme block's `subscribeTheme`, whose own note starts at old `:219`), so 10.1 routes it to `theme.ts` and the builder followed the contract to the letter (S-notes.md records the choice). A reader of `sheet-styles.ts` now finds the styles undocumented and a reader of `theme.ts` a note about sheets. Comment-only; the checker ignores trivia; no behaviour or gate is affected.
- **fix:** None in W2-S (the contract names `theme.ts`, and 10.3 forbids editing to make a report pass anyway — this is not a report). A later comment-only tidy (integration or W2-S1, which alone edits these files after the split) may move `theme.ts:7-10` to the top of `sheet-styles.ts`; the split checker will not notice either way.

## Refutation attempts that failed (for the record)

- Tried to find a body change hidden by the checker's whitespace collapse (a string literal with two spaces, a template literal): byte-exact comparison of all 51 bodies — none.
- Tried to find a lost or misplaced doc comment (the checker ignores trivia): trivia comparison — only the contract-dictated header move.
- Tried to find a private name that became exported or an exported name left private: export flags vs 10.1 — exact match.
- Tried to find a forgotten import masked by a DOM global: identifier walk vs import/declared sets — zero unresolved.
- Tried to find an import cycle that would change module evaluation order (TDZ on a `const`): DFS — acyclic.
- Tried to find a fourth `vibe-composer-open` writer, a second theme subscription, or a duplicated constant: reference map old vs new — identical consumers, one home each.
- Tried to find a new lint hit hidden behind a moved one: `-f json` on both trees, matched by rule id and source text — 4 = 4, lines identical.
- Tried to find a third change in the tool (a normalisation tweak): the diff is the flat walk, the exit line and comments.
