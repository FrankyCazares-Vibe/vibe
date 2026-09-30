# W2-S review — lens "contract" (10.1 table, 10.2 rules, 10.3 proof, row by row)

Reviewed commit: `91a40d7` (builder). Base: `507d6b4` (first line of `S-split-check.txt`). Read-only on `src/` and the tool; every claim in `S-notes.md` / `S-gate.md` re-run from the repo root by this reviewer on 2026-09-30.

## Verdict

**PASS.** The split matches section 10.1 row by row, 10.2 rule by rule, and 10.3 proof by proof. No HIGH, no MEDIUM. Two LOW notes (wording / file content of the handoff, not the code).

## Method (what was actually run, not read)

1. `git show --stat HEAD`: 18 files, all owned by W2-S (13 new `messages/*.ts(x)`, `MessagesMobile.tsx`, the tool, `S-gate.md`, `S-notes.md`, `S-split-check.txt`). Commit message ends with the two required trailer lines.
2. TypeScript AST walk (scratchpad script over `node_modules/typescript`) of `MessagesMobile.tsx` + every `messages/*.ts(x)`: lists every top-level statement with its kind, name and `export` modifier. Compared against 10.1's "moves" and "exports" columns (table below).
3. Line-multiset check (scratchpad script): every non-blank line of `507d6b4:MessagesMobile.tsx` (minus the import block and the nine section banners 10.2 rule 2 lets drop) versus every non-blank line of the new tree (minus `"use client"`, import lines, the one `export … from`, with a leading `export ` stripped). Result: **4,789 lines vs 4,789 lines, 0 differences**, and each new file's lines appear in the original **in order**. This covers what the checker does not: comments (every doc comment travelled, none lost, none altered), and confirms the only per-line edit is the added `export ` keyword.
4. The seven proofs of 10.3 re-run (below), plus `git diff 507d6b4 -- <the two importers>`.

## 10.1 row by row (AST walk; "private" = no `export` modifier)

| row | file | declarations found (export status) | matches table | imports found vs table's last column |
|---|---|---|---|---|
| 1 | `messages/types.ts` | ThreadType, ThreadPeer, ThreadMember, ThreadEntry, MessageReaction, MessageAttachment, ParentPreview, MessageRow, Tab — all exported (type aliases) | yes | `{ type RoomKind } from "@/lib/chat/types"` — exact |
| 2 | `messages/theme.ts` | subscribeTheme (private), useNightTheme (export) | yes | `useSyncExternalStore` from react; `currentTheme, THEME_EVENT` from `@/lib/theme/theme` — exact; starts with `"use client"` |
| 3 | `messages/sheet-styles.ts` | vaulOverlayStyle, vaulContentStyle, vaulHandleStyle, visuallyHiddenStyle — all exported | yes | none — exact (`React.CSSProperties` kept as written, MM:H3; typecheck proves it) |
| 4 | `messages/format.ts` | relativeTime, initialsOf, threadTitle, threadAvatar, quotedBody, entryCanPost — all exported | yes | `{ type ParentPreview, type ThreadEntry } from "./types"` — exact |
| 5 | `messages/send-failure.ts` | chatRefusalLine, toastSendFailure — both exported | yes | `REFUSAL_SENTENCES, type RefusalCode`; `type VibeFailure`; `toast` — exact |
| 6 | `messages/ThreadList.tsx` | TabPill, ThreadRow, ListSkeleton, EmptyState — all exported | yes | `Link`; `./format` (relativeTime, threadAvatar, threadTitle); `./types` (Tab, ThreadEntry) — exact |
| 7 | `messages/ConversationView.tsx` | ATTACH_ACCEPT, ATTACH_IMAGE_TYPES, ATTACH_VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, StagedMedia, ReplyTarget (all private), ConversationView (export) | yes | exactly MM:10's list **plus `type ParentPreview` from `./types`** (SPLIT-L1): Link; useCallback/useEffect/useRef/useState; Drawer; asLoadFailure/LoadFailed/type LoadFailure; PushAsk; ReportSheet/type ReportTargetRef; REFUSAL_SENTENCES/type RoomKind/type ThreadMessagesResponse; vibeRequest; toast; ./ConversationActionSheet; ./format (entryCanPost, quotedBody, threadAvatar, threadTitle); ./GroupSettingsView; ./MessageBubble; ./send-failure; ./sheet-styles (vaulOverlayStyle, visuallyHiddenStyle); ./theme; ./types (MessageRow, ParentPreview, ThreadEntry) — exact |
| 8 | `messages/sheets.tsx` | SheetRow, MuteDurationSheet — both exported | yes | `Link`; `Drawer`; the four styles from `./sheet-styles` — exact |
| 9 | `messages/ConversationActionSheet.tsx` | ConversationActionSheet (export) | yes | `./sheets`, `./sheet-styles` (four), `./types` (ThreadEntry), `ReportSheet, type ReportTargetRef`, plus useCallback/useEffect/useState and Drawer (MM:10) — exact |
| 10 | `messages/GroupSettingsView.tsx` | GroupSettingsView (export), MemberRow (private), MemberActionSheet (private) | yes | `Link`; `Drawer`; `./types` (ThreadEntry, ThreadMember); `./theme`; `./format` (initialsOf); **`./sheet-styles` (four, SPLIT-L1)**; `./sheets`; `./ComposeOverlay`; useCallback/useEffect/useState — exact |
| 11 | `messages/ComposeOverlay.tsx` | SearchUser (private), ComposeOverlay (export), ComposeUserRow (private) | yes | `./theme`, `./format` (initialsOf), `ListSkeleton` from `./ThreadList`, plus useEffect/useRef/useState, asLoadFailure/LoadFailed/type LoadFailure, vibeRequest (MM:10) — exact |
| 12 | `messages/MessageBubble.tsx` | MessageBubble (export) | yes | `Link`; `RemovedContentCard`; `./types` (MessageRow); `./format` (initialsOf, quotedBody); `./ReactionPicker`; useRef/useState — exact |
| 13 | `messages/ReactionPicker.tsx` | REACTION_EMOJIS (private), swallowNextClick (private), ReactionPicker (export), pickerRowStyle (private) | yes | `./types` (type MessageReaction); useEffect/useLayoutEffect/useRef/useState — exact |
| 14 | `MessagesMobile.tsx` (stays) | `"use client"` :1, header comment :21-40 (= old :32-51 verbatim, per the line check), LIST_RESYNC_MS :44 with its comment :42-43 (private), MessagesMobile :46 (export), `export { ConversationView } from "./messages/ConversationView";` :421 verbatim | yes | `./messages/{types,theme,ThreadList,ConversationView,ComposeOverlay}` + useCallback/useEffect/useMemo/useRef/useState, asLoadFailure/LoadFailed/type LoadFailure, vibeRequest, toast; drops Link, Drawer, PushAsk, ReportSheet, REFUSAL_SENTENCES, currentTheme, THEME_EVENT, useLayoutEffect, useSyncExternalStore (MM:10) — exact |

Count: 9+2+4+6+2+4+8+2+1+3+3+1+4+2 = **51**, one home each; the checker agrees (51/51, duplicate 0).

`type` modifiers: every type-only name is imported with the inline `type` modifier (`import { …, type X }`), which is the original file's own form (`507d6b4:MessagesMobile.tsx:15-28`); no `import type` rewrite, no bare type import. `@typescript-eslint/no-unused-vars` raised nothing on any new import block (only the pre-existing `setPhotoUrl` warning), so no import is extra; `tsc` exit 0, so none is missing.

## 10.2 rules

| rule | check | result |
|---|---|---|
| 1 no logic change, no new module-level statement | AST walk: the only statement kinds in the 14 files are `ImportDeclaration`, `TypeAliasDeclaration`, `FunctionDeclaration`, `VariableStatement` (const), one `ExportDeclaration` (the re-export in `MessagesMobile.tsx`) and one `ExpressionStatement` per `.tsx`/`theme.ts`, which is `"use client"`. Line-multiset 4,789 = 4,789, 0 diffs, in order. `split-check` CHANGED empty. | holds |
| 2 banners | the nine `// ---------- X ----------` banners were dropped (allowed); `grep "^// ----------" messages/` finds none | holds |
| 3 lint hits move with their code | see proof 4 below: 481→`MessagesMobile.tsx:151`, 534→`MessagesMobile.tsx:204`, 3669→`ComposeOverlay.tsx:87`, 2855 (setPhotoUrl warning)→`GroupSettingsView.tsx:33`; same four rule ids, no fifth | holds |
| 4 one home each for ListSkeleton, SheetRow, MuteDurationSheet, the four styles, useNightTheme, initialsOf | AST walk + DUPLICATE 0 | holds |
| named exports only, no default export | `grep -rn "export default"` over `MessagesMobile.tsx` + `messages/` → none; AST shows no `ExportAssignment` | holds |
| `"use client"` first on every `.tsx` and `theme.ts` | `head -1` of each; `grep -L` prints nothing; the four other `.ts` files (types, sheet-styles, format, send-failure) correctly carry none | holds |
| nothing under `messages/` imports `MessagesMobile.tsx` | grep: the only two mentions are inside comments (`ConversationView.tsx:60`, `:413`), MM:H6 | holds |
| the two importers untouched | `git diff 507d6b4 -- src/app/messages/MessagesSwitch.tsx src/components/mobile/CampusMobile.tsx` → empty; they remain the only importers of `@/components/mobile/MessagesMobile` in `src/` | holds |

## 10.3 proof, re-run by the reviewer

| # | command | reviewer's result |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm test` | pass 1374, fail 0, exit 0 |
| 3 | `npm run build` | exit 0 |
| 4 | `npx eslint -f json` new tree vs `git show 507d6b4:… \| npx eslint --stdin --stdin-filename …` | new: `MessagesMobile.tsx:151:5 react-hooks/immutability`, `MessagesMobile.tsx:204:7 react-hooks/set-state-in-effect`, `messages/ComposeOverlay.tsx:87:7 react-hooks/set-state-in-effect`, `messages/GroupSettingsView.tsx:33:20 @typescript-eslint/no-unused-vars (setPhotoUrl)`. base: `:481:5`, `:534:7`, `:3669:7`, `:2855:20`, same four rule ids. Parity, no new hit. |
| 5 | `node handoffs/chat-redesign/wave-2-build/tools/split-check.mjs --base 507d6b4` | `51 declarations … 51 across …; missing 0 · changed 0 · added 0 · duplicate 0`, exit 0 — identical to `S-split-check.txt` lines 2-3. Tool diff (`git show HEAD -- …/split-check.mjs`) is exactly the two contracted edits: exit line gains `\|\| added.length`; `listFiles` skips directories (`continue`) instead of recursing; plus the doc comment. Normalisation, `--base` handling and the re-export skip are untouched. |
| 6 | `grep -L '"use client"' src/components/mobile/messages/*.tsx src/components/mobile/messages/theme.ts` | prints nothing |
| 7 | `grep -h "^import\|^} from" src/components/mobile/messages/*.ts*` | 12 sibling modules (`./ComposeOverlay`, `./ConversationActionSheet`, `./GroupSettingsView`, `./MessageBubble`, `./ReactionPicker`, `./ThreadList`, `./format`, `./send-failure`, `./sheet-styles`, `./sheets`, `./theme`, `./types`) and exactly the ten allowed externals (`next/link`, `react`, `vaul`, `@/components/feedback/LoadFailed`, `@/components/push/PushAsk`, `@/components/safety/ReportSheet`, `@/lib/chat/types`, `@/lib/feedback/request`, `@/lib/feedback/toast`, `@/lib/theme/theme`); nothing else |

`S-split-check.txt`: first line `507d6b4`, then the tool's two output lines (matching this re-run), then `exit=0`.

## Builder's claims (S-notes.md, S-gate.md) checked

- "421 lines" for `MessagesMobile.tsx`: `wc -l` = 421. Holds.
- "stopped_on is EMPTY / no declaration body needed a change": CHANGED 0 and the 0-diff line check. Holds.
- "typecheck exit 0 on the first run, no import fix needed": not re-provable (history), but the end state has no unused and no missing import. Holds as far as checkable.
- "Comments :213-223 go to theme.ts": `theme.ts:7-16` carries the vaul-styles note (:214-217) and the Night note (:219-223) above `subscribeTheme`; banner :213 dropped. That is what 10.1 row 2 says ("comments :213-223"). Holds; see CONTRACT-2.
- "git status shows only the owned files": `git status --short` is empty after the commit; the commit's 18 files are all in W2-S's ownership. Holds.

## Findings

No HIGH. No MEDIUM.

### CONTRACT-1 (LOW) — `S-split-check.txt` carries a line the tool did not print
- where: `handoffs/chat-redesign/wave-2-build/S-split-check.txt:4`
- what: 10.3 says "the output of 5 is saved to `S-split-check.txt` under the first line". Lines 2-3 are the tool's output; line 4 (`exit=0`) is the builder's own annotation of the shell's exit status, not tool output. Harmless and accurate (this reviewer's re-run also exits 0), but the file is not the verbatim capture the sentence describes.
- fix: none required; if the integration review wants a verbatim capture, drop line 4 or label it (`# exit 0`). Do not touch the first three lines.

### CONTRACT-2 (LOW) — the contract's row 2 places a sheet-styles comment in `theme.ts`
- where: `src/components/mobile/messages/theme.ts:7-10` (old `:214-217`); contract `wave-2-contracts.md:876` (row `messages/theme.ts`, "comments :213-223")
- what: the four-line note "Inline styles for the bottom-sheet primitives so every sheet in this file gets the same iOS-native look …" describes the four vaul styles, which live in `sheet-styles.ts` (row 3), yet the FINAL contract's row 2 assigns `:213-223` to `theme.ts` (MM:10's own draft table had put `:213-218` with the styles). The builder followed the contract as written, did not rename or reinterpret it, and recorded the discrepancy in `S-notes.md` ("Comment placement to know"). Comment-only; the checker ignores comments; no line lost (line-multiset 0 diffs). This is a wording defect of the contract, not of the split.
- fix: nothing in W2-S. A later comment-only tidy (move `theme.ts:7-10` to the top of `sheet-styles.ts`) can go into W2-S1's `MessagesMobile.tsx`-adjacent work or the integration pass; it would not change any declaration text the tool compares.

## Holds (checked and found correct)

1. All 51 declarations live in exactly the file 10.1 names; none missing, none duplicated, none added (AST walk + split-check 51/51).
2. Export status per declaration exactly as 10.1's "exports" column: 38 exported, 13 private (subscribeTheme; the five ATTACH/MAX consts; StagedMedia; ReplyTarget; MemberRow; MemberActionSheet; SearchUser; ComposeUserRow; REACTION_EMOJIS; swallowNextClick; pickerRowStyle; LIST_RESYNC_MS).
3. Every new file's import list is exactly 10.1's last column (with MM:10's explicit lists where the contract points to them and the two SPLIT-L1 additions: `type ParentPreview` in ConversationView, the four styles in GroupSettingsView); `type` modifiers inline as in the original; no unused import, no missing import.
4. `MessagesMobile.tsx` keeps exactly row 14: `"use client"`, the header comment verbatim, `LIST_RESYNC_MS` with its two comment lines, `MessagesMobile`, and the re-export line `export { ConversationView } from "./messages/ConversationView";` verbatim as the last line; its import block is MM:10's kept set with the listed drops.
5. `git diff 507d6b4` over `src/app/messages/MessagesSwitch.tsx` and `src/components/mobile/CampusMobile.tsx` is empty; they are still the only importers of `@/components/mobile/MessagesMobile`; `Parameters<typeof ConversationView>` at `CampusMobile.tsx:2471` compiles through the re-export (typecheck exit 0).
6. No new module-level statement: the only non-declaration statements are imports, one `"use client"` per `.tsx`/`theme.ts`, and the one re-export.
7. Named exports only; no `export default` anywhere in the 14 files.
8. Every doc comment moved with its declaration (H7 list: :116-117, :133-135, :199, :207-208, :219-223, :265-267, :325-326, :342-347, :353, :359-363, :372-373, :4752-4757, :4967 — all found above their declaration in the new tree; line-multiset 0 diffs proves none was lost or altered). The nine banners dropped (rule 2).
9. `React.` UMD namespace references kept as written (`sheet-styles.ts`, `ReactionPicker.tsx:224`, MessageBubble); `tsc` exit 0.
10. The tool edit is exactly 10.3's two changes plus a doc comment; the base sha `507d6b4` is used everywhere (`S-split-check.txt:1`, S-gate, the eslint baseline), never HEAD.
11. Proofs 1-7 all re-run green by the reviewer (typecheck 0; 1374/1374; build 0; lint parity 3 errors + 1 warning by rule and by declaration; split-check exit 0 with an empty report; use-client grep empty; imports on the allow-list only).
12. Import graph has no cycle (leaves types/theme/sheet-styles/format/send-failure; ConversationView → {MessageBubble → ReactionPicker; ConversationActionSheet → sheets; GroupSettingsView → {sheets, ComposeOverlay → ThreadList}}) — matches MM:10; `npm run build` exit 0.
13. Commit `91a40d7` touches only W2-S-owned files (18) and ends with the two required trailer lines; no push.
