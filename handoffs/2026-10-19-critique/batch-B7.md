# Batch B7: delete your own messages (Oct 19, 2026)

Built on decision 8 as CHANGED by Franky (a grey "Message deleted" note stays in the message's place) and decision 9 (officers delete their own Board posts, same note rule). Not committed. Local database only.

## What it does now

- **Everywhere you can see your own message, you can delete it:** DMs, group chats, the Lounge, extra rooms, event chats, Board posts (officers) and Board replies. Phone, desktop React, the desktop DM/group pane (`messages.html`) and the mini messenger (it frames the phone page).
- **How you find it:**
  - Phone: the ⋯ beside your bubble (it used to show only on other people's messages) or the long press. A red "Delete" row with a trash icon, last in the menu. Your own poll / event card in a room gets a ⋯ too.
  - Desktop club rooms: the hover toolbar's More menu.
  - Desktop DMs and groups: the hover pill has a labeled "Delete" (was a bare trash icon, text messages only). It is now on your photos, videos, shared posts and shared profiles too.
  - Board: the "..." on your own post's byline, and a "..." with Delete on each of your own replies.
- **The confirm:** "Delete for everyone?" / "It's removed from this chat for everyone, and a grey "Message deleted" note stays in its place. Anyone who already got a notification may still see it there." A Board post says "...a grey "Post deleted" note stays in its place. Its N replies stay." The page's own dialog everywhere: no `window.confirm()` left in this flow. Cancel has focus first, Esc and Back cancel it alone.
- **What everyone sees after:** one quiet grey italic line, "Message deleted" (with a small slashed-circle icon), on the sender's side, with the sender's name/picture and the time. No words, file, quote, reactions or menu. A reply that quoted it shows "Message deleted" in its quote. A Board post shows its byline and "Post deleted"; its replies stay readable and the reply field goes. List previews say "You: Message deleted", "Maya: Message deleted", and the club panel and Board strip say "Post deleted".
- **What goes, in one transaction:** the words, the photo/video key, a shared post link, a poll or sign-up (votes and names), an event card's note, reactions, pins, notification rows and any phone notification not sent yet. Then the photo/video **file is deleted from storage** (new: before this, a deleted message's file stayed forever).
- **The file is kept** when the Vibe team or a club removed the message, when a report about it is open or acted on (evidence), or when another message points to the same key (so nobody can erase someone else's file by planting a copy).
- Officer **Remove** on other people's messages is unchanged (hidden, not deleted).

## Database change (LOCAL ONLY UNTIL FRANKY SAYS YES)

`supabase/migrations/20261019150000_message_deleted_note.sql`
- `messages.deleted_at timestamptz` (null = live).
- CHECK `messages_deleted_is_empty`: a deleted row can hold no words, file key, shared post, card or quote. The database keeps the promise itself.
- Trigger `messages_insert_not_deleted`: no row can be inserted already "deleted" (no fake notes through the REST API).
- `public.delete_own_message(p_message_id) -> jsonb`, SECURITY DEFINER, `search_path ''`, sender only (`auth.uid()`), row locked. Answers `not_found` / `already` / `deleted` (+ `purge_key` when the file may go). EXECUTE for anon, authenticated, service_role (refuses inside, the standing rule).
- Pre-flight, catalog post-check and a self-undoing behaviour post-check, like the check-in file. The header has the production pre-check, the apply steps and the rollback.
- **Rehearsed locally:** applied; a second apply refused by the pre-flight; the rollback (`b7-browser/rollback-local.sql`, the header's block); a clean re-apply; recorded in local `schema_migrations` as `20261019150000 message_deleted_note`.
- **Without the migration** (production today, a Vercel preview) the app does what it did before: the route finds no function and hard-deletes (`{ ok: true }`), the screens drop the row, reads look for `deleted_at` only when a row has the deleted shape and treat a missing column as "no notes". So the build is safe in either order.
- **But the Privacy Policy draft describes the note.** The migration must be on production when the new policy goes live, or production behaves the old way while the policy says otherwise.

## Production steps for the main session

1. Ask Franky for his explicit yes on the migration, then: pre-check (header), `apply_migration` (body without begin/commit), rename the connector's row to `20261019150000 message_deleted_note`. Just before the push.
2. **Set the Privacy Policy date:** `EFFECTIVE_DATE` in `src/app/legal/privacy/page.tsx` and line 3 of `privacy-policy-final.md` are `<SHIP DAY>`. A Vercel production build stops on purpose until they are a real date ("October 19, 2026" if it ships today). Re-run the checker after.
3. R2: the route deletes files with the existing `deleteR2Keys`. Nothing to set up. I did NOT test a photo delete live, because the local `.env.local` has R2 keys and I couldn't rule out that they point at the real bucket. Test one photo delete on production after deploy (send a photo to yourself in a test DM, delete it, the media link should 404).

## Privacy: what is kept that wasn't before

- The deleted message's row: who sent it, when it was sent, which chat, and **when it was deleted** (`deleted_at`). No words, no file.
- Other members can't see `deleted_at` in the app, but the database's table grant lets a member's own REST read see it for rows they can see. The policy says "They may also be able to tell when it was deleted."
- Followers reading a Board see nothing for a deleted post (no note).
- Account deletion still removes everything (notes included, by the existing cascade).

## Privacy Policy change (drafted, same day, `<SHIP DAY>`)

In `privacy-policy-final.md` and the page (`page.tsx`, `sections-4-5-b.tsx`, `sections-6-8.tsx`, `sections-6-8-delete.tsx`):
- "Two words to know": adds "A message you delete leaves a "Message deleted" note in its place (section 8)."
- 5e: a new **Deleted messages** bullet (who sees the note, "Post deleted" on the Board, replies stay, followers see nothing, others may tell when).
- Section 8 table, Messages row: the note, and replies under a Board post now go only with the room, event, club or the post writer's account.
- Section 8, "Deleting one thing": the old "A message is deleted right away... for a Board post, every reply under it" becomes a 4-point list (what goes; the note and what it keeps; replies stay; the file delete and when the file is kept).
- "What Vibe does not delete yet": the line "The photo or video on a message you deleted... the file stays in our storage" is gone (we now try to delete it).
- Checker: `node handoffs/legal-2026-10-04-privacy-v3/check/check.mjs --url http://localhost:3000/legal/privacy` → **PASS** (1,248 sentences the same and in the same order; 105 section mentions, all links).

## Calls I made (Franky can overrule)

1. **A deleted Board post's replies stay** under "Post deleted" (Slack-style; they are other members' words). The plan's 8(a) copy "Its N replies go too" no longer fits a note. To make replies go too instead, the function would delete rows by `thread_root_id`, and the confirm and policy change back.
2. **No new replies under a deleted post** in the app (the field goes). The database would still accept one (`can_post_org_channel` wasn't touched).
3. **A former officer keeps Delete on their own old Board post** (the plan said "when you're an officer"). The words are theirs, and the server always allowed the sender.
4. **A removed message** (Vibe team or club) also becomes a note when its author deletes it, and its file is kept as evidence. The React screens show no Delete on the removed card (unchanged); the desktop pane keeps the trash it already had there.
5. **The ⋯ beside a card** shows only on your own card in a room (beside someone else's card, after the avatar, it would not fit a 375px phone). Others' cards keep the long press.

## Checks

- `npm test`: **3,470 / 3,470 pass**.
- `npx tsc --noEmit -p .`: **no errors**.
- `npx eslint` on every touched file: clean.
- New/changed tests: `delete-rules.test.ts` (11: own, other's, officer on someone else's, temp/note/stub/removed, Board post vs reply, former officer, confirm words with 0/1/3 replies, list after a note vs a hard delete, the note's shape), `remove-route.test.ts` (44: the sender's path now the function on the cookie client, the file purge and its folder check, storage down, already, not_found, the hard-delete fallback, failures), `message-read.test.ts` (+4: the note, its quote, shape without `deleted_at`, no extra read without a candidate, missing column, failed read), `reads.test.ts` (+1 preview), `reads-routes.test.ts` (the pinned select now has `attachment_kind`).

## Browser check (local, blake = non-admin member, avery = owner)

Named test rows were posted through the app's routes ("B7 test: ..."), deleted through the UI, and afterwards all 15 rows were deleted from the local database (back to 232 messages, 0 notes).

- Phone 390x844 (iPhone UA): DM (Night), group (Light), Lounge (Night), event chat (Light), Board reply (Light), own card menu (Night). DELETE answered `{ ok, deleted: true }` every time; the words left the screen; the note appeared in place.
- Desktop 1440x900: DM pane (Night), group pane (Light), Lounge hover menu (Night), Board post as the owner (Light, confirm said "Its 2 replies stay."), the Board seen by blake afterwards (Night: "Post deleted", replies open, no reply field), previews after.
- The reaction and the pin on the deleted DM message were gone in the database (0 / 0).
- Cancel, Back (phone) and Esc (desktop club room) close the confirm alone; the chat stays open.
- **The other person's open screen** (the plan's open question):
  - desktop DM/group pane: the note arrives by itself in about 2 s (its poll);
  - club rooms (phone and desktop): about 20 s (the every-5th-tick full read);
  - **phone DM/group: stays until the chat is reopened** (`ConversationView` loads once and never polls; new messages behave the same). Follow-up, not widened here.
- Shots in `shots/`: `B7-phone-night-dm-{menu,confirm,deleted,other-side}.png`, `B7-phone-light-group-{confirm,deleted}.png`, `B7-phone-night-lounge-{menu,deleted}.png`, `B7-phone-light-event-{menu,deleted}.png`, `B7-phone-light-board-reply-{menu,deleted}.png`, `B7-phone-night-own-card-menu.png`, `B7-phone-light-inbox-after.png`, `B7-phone-light-lounge-other-side-live.png`, `B7-desktop-night-dm-{pill,confirm,deleted,other-side-live}.png`, `B7-desktop-light-group-{pill,confirm,deleted}.png`, `B7-desktop-night-lounge-{menu,deleted}.png`, `B7-desktop-night-lounge-side-after-board-delete.png`, `B7-desktop-light-board-owner-{menu,confirm,deleted}.png`, `B7-desktop-night-board-other-side.png`, `B7-desktop-night-inbox-after.png`.
- Scripts to re-run it: `handoffs/2026-10-19-critique/b7-browser/` (`seed.sh` posts the rows; the cleanup line is in its header).

## Follow-ups (not in this batch)

- Phone DM/group: the other person's open chat doesn't update until reopened (no poll). Since the review, a Pin or a reaction on the stale bubble is refused (404), so it can't land on the note.
- DM and group unread, the Otto unread count and the app badge still count a deleted last message (club Board and Lounge counts no longer do, see the review repair).
- The database still accepts a reply under a deleted Board post (only the app hides the field), and the send route still accepts a quote of a note (it then shows "Message deleted" in the quote; harmless, not changed).

## Also applied

- `B8-handoff-card-rules.patch` (B8 → B7, `card-rules.ts` is mine): "you said maybe" → "you're interested" in three spoken strings and their test (decision 12). Plus the matching comment in `CardBubble.tsx`.

## Files

New: `supabase/migrations/20261019150000_message_deleted_note.sql`, `src/lib/chat/deleted-note.ts`, `src/lib/chat/delete-own.ts`, `src/components/mobile/messages/delete-rules.ts`, `delete-rules.test.ts`, `DeleteConfirm.tsx`, `handoffs/2026-10-19-critique/b7-browser/*`.

B7's own (plan): `ConversationView.tsx`, `MessageBubble.tsx`, `ReactionPicker.tsx`, `club/RoomThread.tsx`, `club/HoverActions.tsx`, `club/BoardView.tsx`, `club/BoardPost.tsx`, `cards/CardBubble.tsx`, `cards/card-rules.ts` + test (B8's patch), `public/html/messages.html`.

Outside the plan's list, owned by no other batch (the server needed changing once decision 8 changed): `src/app/api/me/threads/[id]/messages/[messageId]/route.ts`, `src/lib/chat/message-read.ts`, `src/lib/chat/types.ts`, `src/components/mobile/messages/types.ts`, `src/app/api/me/threads/route.ts` (DM preview), `src/app/api/me/inbox/route.ts` + `src/app/api/me/club-boards/route.ts` + `src/lib/chat/reads.ts` (club previews), `src/components/desktop/messages/ClubPanel.tsx` and `club/BoardStrip.tsx` ("Post deleted"), the tests `remove-route`, `message-read`, `reads`, `reads-routes`, and the policy files above.

## Review repair (Oct 19, 2026, later)

All 7 findings were right. Fixed, re-tested, re-shot. Still not committed; local database only.

1. **The old hard delete still worked through the REST API.** The migration now drops `messages_delete_own` (new step 5b). With no DELETE policy left, RLS refuses every browser delete, so the function is the only way and its note, file purge and kept replies always happen. Safe in either order: the route's hard-delete fallback only runs where the function is missing, which is exactly where the policy still exists. Account deletion uses the foreign-key cascade, not the policy. The fallback hard delete is now counted (`{ count: "exact" }`): a delete that touched no row answers 404 `not_found` instead of `{ ok: true }`, which covers the moment right after the file runs if PostgREST hasn't seen the function yet (`remove-route.test.ts` +1). Also added: a pre-flight check that RLS is on, a catalog post-check that no DELETE policy is left, the production pre-check line (`messages_delete_own` count = 1), and `create policy` in the header's rollback block (and in `b7-browser/rollback-local.sql`). Re-rehearsed locally: rollback, apply, second apply refused, rollback, clean apply. Local `schema_migrations` row restored.
2. **Deleted words stayed in other replies' quotes.** New `asDeletedQuote` and `withDeletedQuotes` in `src/lib/chat/deleted-note.ts`. `listAfterDelete` (ConversationView) uses them. RoomThread and BoardView rewrite every quoting row through `poll.replace`. message-read uses `asDeletedQuote` too. After a hard delete on an old database the quote goes, matching the server's `ON DELETE SET NULL`. Static twin: `__dmDeleteMessage` in `messages.html` heals quotes too, and `renderMsgs`'s signature now includes each row's quote id and deleted flag, so a poll that changes a quote redraws the row. Checked: the deleter's own pane shows "Message deleted" in the quote at once; the other person's open desktop pane healed after **516 ms** (one poll); the phone shows no trace of the words.
3. **Pin and react accepted a note.** Both routes now read the note's shape (`DELETED_SHAPE_COLUMNS`) and answer 404. A row with no words, no file and no card holds nothing to pin anyway, so no missing-column fallback is needed. `pins-read.ts`: a pin on a note is left out of the list and doesn't use a slot. Checked live: PUT pin → 404 `not_found`, POST react → 404.
4. **A follower lost the Earlier button.** `readFollowerBoardPage` (`follower-board.ts`) now leaves deleted posts out in the database read (`deleted_at is null`, retried without it when the column is missing). So a page of 50 stays 50 and `hasEarlier` stays true. The shape filter after the read stays as a backstop.
5. **Previews and unread.** `Preview` gets `deleted: true`. Board previews say "Post deleted" (`latestShownPerRoom(..., { board: true })`). The DM thread list's `last_message` gets `deleted: true`, and `PersonRow` draws "Message deleted" grey italic. The inbox's Board and Lounge counts and the club space's `unreadIn` leave notes out, with a missing-column fallback. Checked live: after Avery deleted her new Board post, Blake's inbox went from `unread: true` to `unread: false`, `text: "Post deleted"`, `deleted: true`. **ClubRow's italic needs a patch:** `ClubRow.tsx` and `home-rules.ts` carry B8's uncommitted "Interested" edits, so the change is in `B7-handoff-club-row-deleted-preview.patch` (`git apply --check` passes on today's tree). Until it's applied, the club row reads "Board: Post deleted" in plain text.
6. **Focus fell to the body after a delete.** `DeleteConfirm` takes `focusAfter`. When the control that opened it is gone (or the body has focus a frame later), focus moves to the note. The note in `MessageBubble`, a deleted Board post's `article` and a deleted reply row carry `data-chat-row` and `tabIndex={-1}`. A reply falls back to its post's replies button (`data-replies-toggle`). Checked by keyboard (Tab, Enter): in the Lounge, focus lands on the note `DIV`; on the Board it lands on the deleted post's `ARTICLE`. A focus ring shows.
7. **Tests.**
   - `message-read-followers.test.ts` +2: a full follower page stays full with the filter in the read; a deleted-shape row never reaches a follower even without the column, and no `deleted_at` read is made.
   - `follower-board-routes.test.ts` +2: club-boards skips a deleted post and previews the post before it; react on a note → 404. The react select assertion was updated.
   - `pins-routes.test.ts` +2: PUT on a note → 404 with no cap read; a pin on a note is not listed and takes no slot.
   - `reads.test.ts` +1 (flag, "Post deleted") and `reads-routes.test.ts` +1 (inbox counts retried without `deleted_at`). The count assertion now includes `deleted_at`.
   - `delete-rules.test.ts` +3. The self-comparing `deepEqual` is replaced with explicit field checks, plus quote rewriting (note, hard delete, quoted row older than the page) and `withDeletedQuotes` / `asDeletedQuote`.
   - **New `scripts/sql/message-deleted-note-check.sql`** (local only, one transaction, ROLLBACK): **40 cases pass**. It covers what goes (words, key, shared post, poll with options and votes, event card note, reactions, pins, notifications, push outbox) and what stays. It covers when the file is kept: removed, open report and actioned report keep it; a dismissed report and a plain photo let it go; a shared key is kept until the last message using it is deleted. It also covers not found, already, and signed out (42501). Board replies stay. No browser hard delete: 0 rows, also on a post with a reply and on a whole-chat delete. No browser UPDATE of `deleted_at`, no row born deleted, and a "deleted" row with words is refused (23514). Proven meaningful: with `messages_delete_own` put back, H1 fails ("got ok 1").

**Checks:** `npm test` **3,519 / 3,519 pass**. `npx tsc --noEmit -p .` clean. `npx eslint` on every touched file clean. The inline scripts of `messages.html` pass `node --check`.

**Shots (new):** `B7-rv-desk-night-pane-{blake,avery}-after.png`, `B7-rv-phone-light-dm-quote-after.png`, `B7-rv-desk-light-lounge-focus-after.png`, `B7-rv-desk-night-board-focus-after.png`, `B7-rv-phone-{light,night}-home-board-post-deleted.png`, `B7-rv-phone-{light,night}-home-dm-deleted-preview.png`. Scripts: `b7-browser/review.mjs`, `review-home.mjs`, `review-board-focus.mjs`. Their rows ("B7 rv:") and the notes they left were deleted afterwards. The database is back to 232 messages, 0 notes, no orphan pins or notifications.

**Privacy:** nothing new is kept or shown. The repair makes the policy's existing promises hold: the note always stays, files are purged, and replies stay. Unread counts and previews only drop or relabel a note. No policy change is needed beyond the `<SHIP DAY>` draft already listed.

**Production step changed:** the migration now also drops `messages_delete_own`. The pre-check expects that policy to be there (count 1). The rollback recreates it.

**Files touched in the repair:** `supabase/migrations/20261019150000_message_deleted_note.sql`, `scripts/sql/message-deleted-note-check.sql` (new), `src/lib/chat/{deleted-note,delete-own,message-read,pins-read,follower-board,reads,types}.ts`, `src/app/api/me/threads/[id]/messages/[messageId]/{pin,react}/route.ts`, `src/app/api/me/inbox/route.ts`, `src/app/api/orgs/[slug]/space/route.ts`, `src/app/api/me/threads/route.ts`, `src/components/mobile/messages/{DeleteConfirm,MessageBubble,ConversationView,delete-rules,types}.ts(x)`, `club/{RoomThread,BoardView,BoardPost}.tsx`, `home/PersonRow.tsx`, `public/html/messages.html`, the tests listed above, `b7-browser/{rollback-local.sql,review*.mjs}`, and the handoff patch `B7-handoff-club-row-deleted-preview.patch`.
