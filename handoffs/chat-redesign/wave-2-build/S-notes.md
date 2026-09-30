# W2-S notes — the split of MessagesMobile.tsx (builder's log)

Base sha: 507d6b4 (branch claude/relaxed-davinci-9d11h3). Contract: wave-2-contracts.md section 10 (10.1 file plan, 10.2 rules, 10.3 proof). Facts: wave-2-asis/messages-mobile-map.md (MM:1.1 table, H1-H17, 7, 10).

## Plan

1. (A) Read contract 10 + 13.1-13.3, MM:1.1, 7, 10, hazards; list the 51 declarations with the TS compiler (done: 62 statements = "use client" + 10 imports + 51 declarations, ThreadType :55 … pickerRowStyle :4968-4985; matches MM:1.1).
2. (B) Edit tools/split-check.mjs: ADDED fatal in the exit line; listFiles non-recursive. Run on the unsplit tree: expect 51/51, exit 0.
3. (C) Write scratchpad/split/cut.mjs: reads `git show 507d6b4:src/components/mobile/MessagesMobile.tsx`, slices each declaration from the line after the previous statement's end (= fullStart's line, so doc comments travel; ThreadType starts at :53 so the header comment :32-51 stays in MessagesMobile.tsx), drops section-banner lines (`// ---------- X ----------`, allowed by 10.2.2), adds `export ` where 10.1 says, writes 13 files under src/components/mobile/messages/ with "use client" (all .tsx + theme.ts) + the import lines of 10.1, and rewrites MessagesMobile.tsx (header, imports, LIST_RESYNC_MS + its comment, MessagesMobile, the re-export line). Import lists are hard-coded from 10.1 / MM:10; typecheck + eslint no-unused-vars then tune imports only.
4. (C) npm run typecheck; fix imports/exports only. A body change demanded → STOP on that declaration, record under "stopped_on".
5. (D) The seven proof steps; S-split-check.txt (first line 507d6b4) and S-gate.md.
6. (E) One commit; no push.

Per 10.1 the comments :213-223 (the vaul-styles note :214-217 and the Night note :219-223) go to theme.ts with subscribeTheme (they are its leading trivia); comments are not compared by the checker.

## Log
- Step A done: contract 10 / 13, MM:1.1, 7, 10, H1-H17 read; 51 declarations listed (ranges match MM:1.1).
- Step B done: tools/split-check.mjs — exit line now `|| added.length`; listFiles skips directories (flat walk); doc comment updated. Run on the unsplit tree with --base 507d6b4: 51/51, missing 0 changed 0 added 0 duplicate 0, exit 0.
- Step C done: cut.mjs (scratchpad/split/cut.mjs) run once. 13 files under messages/ + MessagesMobile.tsx rewritten (421 lines: "use client", 5 external + 5 ./messages imports, header comment :32-51, LIST_RESYNC_MS with its comment, MessagesMobile, the re-export). `npm run typecheck` exit 0 on the first run — no import fix needed; eslint's no-unused-vars raised nothing on the new import blocks either. No declaration body needed a change: stopped_on is EMPTY.
- Step D done: the seven proofs all pass (S-gate.md has each command and result; S-split-check.txt holds step 5 under the first line 507d6b4). Lint parity holds rule by rule: 481→MessagesMobile:151, 534→MessagesMobile:204, 3669→ComposeOverlay:87, 2855 warning→GroupSettingsView:33.
- Comment placement to know: per 10.1, theme.ts carries the comments :213-223 as subscribeTheme's leading trivia, which includes the four-line vaul-styles note (:214-217) that describes sheet-styles.ts. Comment-only (the checker ignores comments); moving those four lines to sheet-styles.ts would be a legal comment-only tidy for a later batch, not done here because the contract names theme.ts.
- Step E: commit next (no push).
- Repair pass (one, after the reviews): all three PASS with LOW notes only. Fixed CONTRACT-1 (`S-split-check.txt` now holds only the sha line and the tool's verbatim output). The vaul-styles comment in `theme.ts:7-10` (CONTRACT-2 / MOVE-1 / LOGIC-1) and the stale header (MOVE-2) are real but placed where 10.1 puts them; left as is, deferred to W2-S1 / integration as comment-only tidies. No body, import, export or tool line changed. Proof re-run green (`S-repair.md`). stopped_on still EMPTY.
