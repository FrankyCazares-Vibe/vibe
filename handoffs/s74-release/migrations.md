# Migrations in the release tree that are not on origin/main

Ten files. I READ the SQL (headers, pre-flights, every create / alter / drop); I applied none of them anywhere.
All ten were already on the LOCAL stack (applied in S72 and S73). Production has none of them.
origin/main's newest file is 20261001120000_chat_latest_per_room.sql.

## The list, in file-name order (= the production order)

From landing-night (the waitlist):

1. `20261003100000_waitlist.sql`: new tables `app_settings` (holds `signup_open`, seeded FALSE = closed),
   `signup_allowlist`, `waitlist`; widens three CHECKs (`email_sends_kind_check`, `moderation_actions_action_check`,
   `moderation_actions_target_type_check`); functions `signup_is_open`, `waitlist_normalize_code`,
   `waitlist_code_hash`, `waitlist_issue_code`, `waitlist_revoke_code`.
2. `20261003110000_waitlist_gate.sql`: the first sign-up hook `public.hook_waitlist_gate`, and restates
   `public.handle_new_user()` (the trigger function on `auth.users`) with the redeem-a-code block.
3. `20261003120000_waitlist_hardening.sql`: new schema `auth_hooks`; the hook moves to
   `auth_hooks.hook_waitlist_gate` and the public one is dropped; `handle_new_user()` restated again (stricter
   redeem); `waitlist` gets columns; `waitlist_issue_code` dropped and re-made with a sixth argument;
   `waitlist_revoke_code` replaced; new trigger `waitlist_forget_user` BEFORE DELETE on `public.users`.
4. `20261003130000_waitlist_code_scrub.sql`: three functions in `auth_hooks` and a trigger
   `waitlist_scrub_access_code` on `auth.users` and on `auth.identities` (keeps the typed code only as a hash).
   The runbook says: if the hosted project refuses triggers on auth tables, the other files still stand.
5. `20261003140000_waitlist_retention.sql`: new table `user_cohorts` (the wave tag); trigger
   `waitlist_tag_cohort` on `waitlist`; function `waitlist_purge_expired`. Deletes nothing when applied.
6. `20261003150000_waitlist_retention_fixes.sql`: batch-name CHECKs on `waitlist` and `user_cohorts`; replaces
   `waitlist_purge_expired` and `waitlist_issue_code`.
7. `20261003160000_waitlist_line.sql`: new functions `waitlist_deletes_at`, `waitlist_drop_if_due`; replaces
   `waitlist_purge_expired` and `waitlist_issue_code` again.
8. `20261003170000_waitlist_margin.sql`: the 38 / 28-day lines: replaces `waitlist_deletes_at`,
   `waitlist_purge_expired`, `waitlist_issue_code`; new trigger `waitlist_restart_clock` on `waitlist`.

From chat-desktop (desktop Messages):

9. `20261004100000_chat_message_pins.sql`: new table `chat_message_pins` (foreign keys to `messages`, `channels`,
   `users`), two indexes, function `chat_pins_drop_removed` and its trigger on `public.messages` (a moderator's
   removal drops the pin). Any time of day.
10. `20261004110000_chat_room_post_policy.sql`: new column `channels.post_policy` with two CHECKs; restates
    `can_post_org_channel` and `chat_cast_vote`. Takes a full lock on `channels` for milliseconds: a quiet hour.

## Do any two touch the same thing?

**Inside the waitlist set: yes, heavily, and that is by design.** It is a chain; each file's pre-flight checks the
fingerprint the file before it left and refuses otherwise. They must go in exactly this order, none skipped:
- `handle_new_user()`: files 2 and 3.
- the gate hook: file 2 makes it in `public`, file 3 moves it to `auth_hooks`.
- `waitlist_issue_code`: files 1, 3, 6, 7, 8. `waitlist_revoke_code`: 1, 3.
- `waitlist_purge_expired`: 5, 6, 7, 8. `waitlist_deletes_at`: 7, 8.
- table `waitlist`: 1 (made), 3 (columns), 5 and 8 (triggers), 6 (CHECK). table `user_cohorts`: 5, 6.

**Inside the chat set: no shared function, trigger or policy.** Both involve `channels` (file 9 adds a foreign key
that points at it; file 10 adds a column to it) and `messages` (file 9 adds a trigger; file 10's self-test inserts
one message). Their own headers say neither needs the other. File 10's pre-check list of triggers on `messages`
already expects file 9's trigger "once the pins file is in". Order 9 then 10, as contract 4b.3 says.

**Between the waitlist set and the chat set: nothing shared.** No function, trigger, policy or altered table in
common (I grepped each set for the other's object names: zero hits in SQL statements). The one table both come
near is `public.users`: file 3 hangs a BEFORE DELETE trigger on it, file 9 adds a foreign key pointing at it
(`pinned_by`, set null on delete). Different objects, no order needed between them; each only blocks writes on
`users` for milliseconds while it runs. File 9's pre-flight checks the trigger list on `messages` only (the
waitlist adds none there); file 10's fingerprints are of three chat functions the waitlist never touches.

## What this means for production order

- File-name order works for all ten and keeps `schema_migrations` in order: 1 to 8, then 9, then 10.
- The two sets are independent, so either can go first if needed. File 9's and 10's pre-check 5 ("newest applied
  row is below this file") is a read for a human, not enforced; it stays true in file-name order.
- The CODE runs without files 9 and 10 (every read falls back). The CODE does NOT behave the same without files
  1 to 8: see semantic.md, "The moment this deploys, sign-up reads as closed".
- Each file is one transaction with its own pre-flight, post-check and ROLLBACK text in its header.
- Fingerprints in the pre-flights were read on the local stack; BUILD.md 6.3 says production's
  `handle_new_user` matched on Oct 3. Nothing was re-read on production today (not allowed in this job).
