# B0 review — lens: CONTRACT CONFORMANCE

Reviewer notes (read-only review; this is the only file I write).
Contract: handoffs/chat-redesign/wave-1-contracts.md sections 1, 2, 5, 6.0, 6.1, 6.2, 6.3, 7, 8.

## Log
- 07:4x read contract sections 1, 2, 5-8, 11, 12. Starting on the B0 files.

## Findings
- read all 12 B0 files + the two diffs. Contract codes enumerated (21 status/code pairs): every code is in RefusalCode | ChatRouteCode. .env.example block matches the PUSH_ style (commented, empty, ASCII only).
- next: run node tests, typecheck, byte-compare the sentences and the moved code.
- ran: node --test on the three B0 tests (58 pass); npx tsc --noEmit (clean); npx eslint on the B0 files (clean).
- ran: byte compare of the 8 refusal sentences against the contract table (all equal, same order), OFFICER_REMOVED_REASON equal, label separator is U+00B7 with plain spaces.
- ran: diff of the moved block (route.ts@HEAD lines 43-200) against message-read.ts lines 31-188 with `export` stripped: identical.
- .env.example: three variables, commented, empty, PUSH_ style, ASCII only. No finding.
- channel-access.ts: only the import type line and the two optional fields. No finding.
- ran: a type-level equality check (scratchpad conform.ts, tsc): the 17 contract types copied verbatim from sections 5, 6.0, 6.1, 7 against B0's exports, plus the RefusalCode and ChatErrorCode unions against the 19 codes the contract names. All equal (the only error is my deliberate self-test line). So: no missing, renamed or retyped field in types.ts.
- ran: each pure module loaded in plain node with no hook (flag, room-rules, room-state, types, schema): all load. flag.ts and schema.ts have zero imports; room-rules.ts, room-state.ts, types.ts have `import type` only.
- ran: npm test (1349, 1 fail = src/lib/otto/parse-reminder.test.ts, ERR_MODULE_NOT_FOUND, last touched 7746498 in May, not B0); npx eslint repo-wide (problems only in old files, none in a B0 file).
- read: local DB `show timezone` = UTC, so `ends_at + interval '7 days'` is exactly the 168 h roomState uses.

## Result

No high and no medium finding. Every name, signature, union member, code and sentence the contract pins for B0 is there and equal.

### F1 (low) types.ts:264 — the thread read type says `room`, `viewer` and the new message fields are always there; 3.10 and 10.1 say they are absent on a database without the chat schema
- Evidence: contract 3.10 row "thread GET, /api/me/threads → today's response, without the new fields"; 10.1 "When `viewer` is missing (old database), behave as today". types.ts:264-277 (and ChatMessage :242-252) has them required, exactly as 6.1 writes the type. B0 is faithful; the contract disagrees with itself.
- Risk: B5 builds against types.ts. `data.viewer.can_post` compiles and throws on the Vercel Preview / local-before-apply / rollback case.
- Change: no field change (the contract pins the type). Add to the doc comment of `ThreadMessagesResponse`: "On a database without the chat schema (contract 3.10) the route sends today's response: no `room`, no `viewer`, and messages without the wave-1 fields. Screens read `viewer?.can_post` (10.1)." Tell B4 and B5 in their prompts.

### F2 (low) types.ts:250 — `hidden` cannot carry the stub Franky's answer needs, and the comment says one direction only
- Evidence: 12.2 "both ways ... `{ hidden: true }` stubs with no content, author or card"; the relayed answer "you shouldn't be able to see their messages still". ChatMessage has `content: string`, `user_id: string`, `users` required, and the comment says "someone I blocked" (copied from 6.1).
- Wave 1: nothing breaks, `hidden` is always false.
- Change: comment only, types.ts:250: "Reserved for blocking in club rooms, both ways (section 12, point 2): when either person blocked the other the message arrives as a stub with no content, author or card. Always false in wave 1." The stub's exact shape (what `content`, `user_id`, `users` hold) must be pinned in the contract before the rooms' screens wave.
- For Franky, not a B0 defect: 12.2 keeps one exception (an officer's top-level Board post shows to every member, blocked or not). His sentence may rule that out. B0's notes raise the same point.

### F3 (low) message-read.ts:11 — `readChatMessages` / `readChatMessage` do not exist yet, and the contract does not say who creates them
- Evidence: 6.1 names them as living in message-read.ts, says B0 moves four pieces, and B4 "adds ... `opts`"; section 5 calls the file "B0's message-read.ts". grep: neither function is in the file.
- Change: none in B0 (its task was the move only, and the move is byte-identical). B4's prompt must say in words that B4 creates both functions.

### F4 (low) flag.ts:63 — a club id with a typo is dropped without a word
- Evidence: `chatV2ClubIds` keeps uuid-shaped entries only (flag.ts:65-68); flag-server.ts logs read failures only. `CHAT_V2_CLUBS=<SAE's id with one character missing>` reads as "no club" and nothing is logged. The contract is silent on malformed entries.
- Change (flag-server.ts, after line 52): count the non-blank entries of the raw `process.env.CHAT_V2_CLUBS`; when it is larger than `clubIds.length`, `console.warn` once: "[chat/flag] CHAT_V2_CLUBS has an entry that is not an id; it is ignored".

### F5 (low) names the contract does not pin, which the next batches will import
- Evidence: exports not in the contract: `isRoomKind`, `isClubRole` (room-rules.ts:37, :42), `ROOM_OPEN_AFTER_END_MS` and a re-export of `RoomState` (room-state.ts:29, :26), `REFUSAL_SENTENCES`, `refusalBody`, and 18 type names (types.ts). 6.0 says "the sentences are constants in B0's types.ts" without naming the constant. types.ts:17 also depends on `AttachmentRow` and `ParentPreview` from message-read.ts, which is B4's after B0.
- Change: none in code. Give B1b, B4 and B5 the list (B0-notes.md, "Decisions", point 6) and tell B4 to keep `AttachmentRow` and `ParentPreview` exported under those names. Import `RoomState` from types.ts only.

### F6 (low) room-rules.ts:67 — `outranks` is stricter than 6.3's words at rank 0
- Evidence: 6.3 "equal rank is allowed"; ran `outranks("member","member")` → false, `outranks(null,null)` → false. The role check of 6.3 runs first, so the route's answer is the same.
- Change: none. Keep; the wave-2 remove route still runs the `ROOM_MODERATOR_ROLES` check before it, in the order 6.3 gives.

### F7 (low) room-state.test.ts:8 — the header says "room-state.ts has no imports"
- Evidence: room-state.ts:24 `import type { RoomState } from "./types";`.
- Change: "room-state.ts imports a type only, which Node erases, so it loads ..."

### For the orchestrator (not B0's files)
- Gate 1 is red before B0: `npm test` fails on src/lib/otto/parse-reminder.test.ts, `npm run lint` on old files.
