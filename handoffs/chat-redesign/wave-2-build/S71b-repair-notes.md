# S71b — repair notes (amendment 2, after the second review)

Started 2026-10-01 18:50 UTC. Worktree only; no commit, no push; migration C NOT applied to the local database (every SQL run of C is one transaction ending in rollback). Scratch: `scratchpad/s71b/review/repair2/`.

## The one non-low finding

**"The users embed on the function's rows is still unproven through PostgREST, and if it fails every Messages-home preview goes blank with no fallback" (medium).**

## Log
- [18:50] Read the contract (S71-amendment-2.md, corrected grants), the helper, the four callers' diff, both builders' notes, the reviewers' notes. Local database before: function absent.
- [re-check, code] The finding's code half is RIGHT: `src/lib/chat/latest-per-room.ts` falls back only on `isMissingChatSchema`; any other RPC error is handed back, and the inbox's `readPreviews` then logs and returns `[]` (both Board and Lounge previews null, 200). An embed error (PGRST200 / PGRST201) is not a missing-schema code.
- [re-check, proof] The first reviewer's sandbox proof (`s71b/rev-sbx/`) passed the inbox's exact select through PostgREST 14.5, but its stand-in `messages` table had ONE foreign key to `users`. The real table has TWO (`messages_user_id_fkey`, `messages_removed_by_fkey`), and five more FKs. So the disambiguating hint was not exercised on the function's rows. Still open, as the finding says.
