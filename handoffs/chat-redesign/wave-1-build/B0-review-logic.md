# B0 review — lens: LOGIC AND TESTS (S69)

Running log, newest at the bottom. Read-only review; this file is the only file written.

- Read contract sections 0, 1, 2, 3.10, 6.0-6.4, 8, 11, 12 and B0-notes.md.
- Ran `npm run typecheck`: green. `npm test`: 1349 tests, 1348 pass, 1 fail (src/lib/otto/parse-reminder.test.ts, not a B0 file). B0's three test files pass.
- Attacked flag.ts, room-state.ts, schema.ts with scratch scripts (scratchpad, not in the repo).

## Findings so far

### F1 (medium) schema.ts:36-47 — the message fallback runs even when the error carries a DIFFERENT code
Evidence (ran): `isMissingChatSchema({ code: "22P02", message: 'invalid input syntax for type uuid: "column does not exist"' })` → true.
Also true for P0001 / 3F000 / 42704 errors whose text holds "function|relation|column" + "does not exist".
Postgres echoes the caller's text in 22P02, so a body value such as `thread_root_id: "function does not exist"` can make a real
failure read as "schema missing", and 3.10 then answers "allowed" at the send gate (the policy is still the second wall).
Change: only read the message when there is no usable code:
`if (typeof code === "string" && code.trim() !== "") return MISSING_SCHEMA_CODES.has(code.trim().toUpperCase());` then the message fallback.

### F2 (low) room-state.ts:47-51 — "a date that cannot be read answers closed" is not true for what V8 reads leniently
Evidence (ran, mid-event clock): starts_at "12", "1", "0", "2026", "Fall Formal 2026" → "live" (not "closed").
A string with no offset ("2026-10-08T23:30:00") is read in the machine's time zone: on this Mac it is 4 hours off and answers "soon" mid-event; on Vercel (UTC) it answers "live".
Change: accept only an ISO timestamp with an explicit zone before Date.parse, e.g.
`/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i`; anything else → null → "closed". Add those cases to room-state.test.ts.
- Exercised chatV2For through a scratch copy with a stubbed service client (20 cases): read error, rejected promise, createClient throwing, missing key, data null → all `false`; one console.error for the whole run. No fault found in its order or its fail-closed paths.
- Moved block in message-read.ts compared to the lines removed from the route: identical apart from `export` and one trailing blank line. eslint on B0 files: clean.
- Full matrices run for outranks (5x5) and postRefusal (6 kinds x root x 5 roles): every cell matches the contract's 6.2 and 6.3.

### F3 (low) no committed test for two things routes lean on
- schema.ts has no test file (B0 notes: checked with a one-off script only). Nine route fallbacks in 3.10 hang on `isMissingChatSchema`.
- flag-server.ts:45-77 `chatV2For` (the only full answer) cannot be loaded by `node --test` (`server-only`, `@/` alias), so "enabled AND (…)" and "fails closed" have no test.
Change: add `src/lib/chat/schema.test.ts` (the six codes in both cases, five non-matching codes, the F1 case, the message fallbacks, warn-once). For the flag, move the part that needs no database into flag.ts as one pure function (answer on / off / ask the clubs) that `chatV2For` calls, and test it in flag.test.ts. Both are new names or a new file: the orchestrator decides.

### F4 (low) flag.ts:39-70 — the three list readers answer without the switch; flag.test.ts:42-44 tests nothing
Evidence (ran): with CHAT_V2_ENABLED unset, `chatV2Everyone({CHAT_V2_ALLOWLIST:"*"})` → true and `chatV2ListedUser(id, …)` → true.
The push function this copies (`pushAllowedFor`, push/config.ts:57-67) checks the switch itself. A route that calls a reader directly turns the feature on with the switch off.
The test "the lists never turn the switch on by themselves" only asserts `chatV2Enabled` (which never reads the lists), so it cannot fail.
Change: first line of each reader `if (!chatV2Enabled(env)) return false;` (`[]` for the clubs), and replace the test with the three reader assertions under a switch that is off.

### F5 (low) flag.ts:39-41 — a star inside a list is silently nobody
Evidence (ran): CHAT_V2_ALLOWLIST `*,`, `,*`, `<founder ids>,*` → `chatV2Everyone` false. flag.test.ts:60-64 pins this.
The contract says "`*` = everyone; else a comma list". On Oct 26 `<ids>,*` would leave the launch off with no log line.
Change: keep it (it is the push shape) but say it in .env.example ("the star must be the whole value"), or treat an entry equal to `*` as everyone. Orchestrator's call.

### F6 (low) types.ts:135-137 — refusalBody on a code with no sentence sends a body without `error`
Evidence (ran): `refusalBody("not_found")` → `{"ok":false,"code":"not_found"}`; `refusalBody("constructor").error` is a function.
Types forbid it, a cast or a plain-JS caller does not. Change: `const error = Object.hasOwn(REFUSAL_SENTENCES, code) ? REFUSAL_SENTENCES[code] : REFUSAL_SENTENCES.try_again;`

### F7 (low, contract gap, no B0 change without the orchestrator) flag.ts:34-36 — nothing refuses the flag on Vercel Preview
The contract says "copy the push shape" and "set for the Production environment only". Push is off on Preview by construction
(`pushEnabled` also needs `pushSiteOrigin(env) !== null`, push/config.ts:46-48); `chatV2Enabled` is the env string alone.
If the three values are ever copied to Preview, unreviewed screens open on production data. The contract's text for CHAT_V2_ENABLED does not ask for the check, so B0 followed it.
Change (if the orchestrator agrees): `return env.CHAT_V2_ENABLED === "true" && (env.VERCEL_ENV === "production" || env.NODE_ENV === "development");` plus two test lines.

### F8 (note for the orchestrator, not a B0 defect) contract 12.2 against Franky's relayed answer
Franky's answer to point 2: agreed, "but you shouldn't be able to see their messages still". Contract 12.2 keeps one exception (an officer's top-level Board post shows to every member, blocked or not).
B0 only reserves `hidden` (types.ts:250-251, always false in wave 1), so no B0 file changes. Confirm the exception with Franky before the wave that builds the rooms' screens.

## Checked and found no fault (one line each, for the record)
- flag parsing: blank, star, spaces, upper case, empty entries, quoted values, enabled not exactly "true".
- chatV2For order and fail-closed paths; features route 401 / 200 / `Cache-Control: private, no-store` on both answers.
- roomState boundaries (start, end, end + 7 days to the millisecond), reversed dates, unreadable clock.
- outranks 5x5, canModerate, postRefusal for every kind with and without a root, clubRoomLabel.
- isMissingChatSchema: the six codes, any case, with spaces.
- message-read.ts move, ChannelAccess type change, rooms.ts stub signatures and message, .env.example block.

## Gate 1 state on the branch (not caused by B0)
- `npm test` is red: src/lib/otto/parse-reminder.test.ts (ERR_MODULE_NOT_FOUND). `npm run lint` is red repo-wide per B0's notes. Both need an owner before gate 1 can pass.
