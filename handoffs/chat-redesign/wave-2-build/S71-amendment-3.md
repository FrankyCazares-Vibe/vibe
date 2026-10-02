# S71 amendment 3 — the screen bugs of the new chat (audit F05–F09; F06 confirmed live)

Written 2026-10-01 (Mac session 71). Franky: "fix first" (before production). Base: branch `claude/relaxed-davinci-9d11h3` at `5f19643`. Phone screens behind `chat_v2` only: `src/components/mobile/messages/**`, `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts`. **Nothing a flag-OFF user reaches may change** (the old `ConversationView`, the old list, `CampusMobile`'s old pane, the static pages): if a shared file must change, the change must be inert with the flag off, and you say so. No server route, no SQL, no migration changes. Folded into the contract as 17.10 by the orchestrator.

Source for every item: `handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md` on `main` (findings F05–F10, with file:line evidence at the audited commit; line numbers have moved, re-find by reading) and contract 17.9 (the walk that confirmed F06). The audit's scratch repro of F07 is at `scratchpad/audit2/nextrepro` (a small Next 16.3.4 copy), of F08's merge at `scratchpad/audit2/verify-merge-sim.mts`.

## A. F06 (CONFIRMED LIVE) — Back with a sheet open must close ONLY the sheet

Today: with the New poll sheet open in a club space (`history.state.depth` 1), one `history.back()` lands on the Messages home: the sheet and the space both close and the draft is lost. Same for the "+" tray, New sign-up, Share an event, the RSVP sheet, the Report sheet opened from the new screens, and the Remove confirm. A Back while a card is posting also slips past the "don't close while posting" guard.

Required (contract 17.5 item 19: back peels ONE layer: the sheet, then the event chat, then the space, then the home):
- Every one of those layers gets its own history entry: `pushState` on open; closing it by its own control (✕, Cancel, a successful post, the scrim) calls `history.back()` (never leaves a stale entry); a `popstate` that removes the entry closes that layer and nothing else.
- One shared hook (new file, e.g. `src/lib/chat/use-layer-history.ts`), used by every sheet / tray / confirm, with a module-level stack so the EXISTING `popstate` owners (`MessagesMobile` for depth 1, `ClubSpace` for the event chat at depth 2: contract 17.1 row 11) can tell "this pop was a sheet closing" and must then do nothing. The `{ vibeChat, depth }` shape of the room entries must stay exactly as it is (deep links and 17.1 row 11 depend on it); a sheet entry adds its own marker (for example `sheet: <n>`) on top of the current room state.
- While `posting` is true a Back must not close the sheet (re-push the entry, as the audit suggests) and must not navigate away.
- Unmounting with an entry still pushed (the space closed under an open sheet by a 403 / 404, 17.1 row 24) must not leave a dangling entry that later eats a Back.
- A sheet inside the event chat works the same (Back: sheet, then event chat, then space, then home).
- A page reload with a sheet entry on top (the sheet is gone after reload): the first Back must not be a dead press.
- Next's router patches `pushState` / `replaceState` (`node_modules/next/dist/client/components/app-router.js`): read how the existing code pushes its entries (`MessagesMobile.tsx` ~:195-244, `ClubSpace.tsx` ~:117, :249) and do it the same way.

## B. F07 — Back from a club page, a profile or a post must return to the room

Today: from a club space (or a DM in the new shell) tap through to the club page / a profile / a post, press Back: the URL is `/messages?channel=<room>` but the screen shows the Messages HOME (the shell reads the channel from the server prop once and never from the live URL; Next restores the cached `/messages` tree). Then the header's Back needs two taps.

Required: on mount AND on a restored history entry, the new shell opens what the live URL / `history.state` says: `?channel=<id>` or a `{ vibeChat, depth >= 1 }` state with nothing open re-opens that room (event room at depth 2 re-opens the space and the event chat layer); then one header Back closes it as usual. Links out to check: the club header's link to the club page, Up next, the empty club's links, a person's name / avatar in a DM or group, a shared post bubble.

## C. F05 — what you watched arrive is read

Today: a message is marked read only when a 20-second FULL read brings it; the 4-second quick checks (`?after=`) append rows without marking. Watch 6 messages arrive, tap Back: the club row says "6 new". On the Board the chip you are looking at gets an unread dot.

Required, in `use-room-poll.ts`: when a quick check appends at least one row by someone else while the room is on screen (the hook `enabled` and `document.visibilityState === "visible"`), mark the room read (at most one mark per tick; reuse the existing mark-read call and its error handling); also mark on the hook's cleanup / when `enabled` turns false if rows by others arrived since the last mark. Never mark while the page is hidden. `club/RoomChips.tsx`: the chip of the room being shown never draws the unread dot. Amend nothing server-side.

## D. F08 — never skip messages silently after the phone was locked

Today: back from a locked phone on a busy room, the hook reads the newest 50 and merges: rows between what was on screen and that page are missing with no sign of a gap (`page-merge.ts` keeps the older rows and adds the page).

Required: when a full page's OLDEST row is newer than the NEWEST non-`temp_` row on screen and the page is full (so rows may lie between), the on-screen list is REPLACED by the page (unsent `temp_` rows kept at the end) and `hasEarlier` becomes true, so "Earlier messages" pages back through the gap. No gap (the page overlaps or touches what is on screen, or the page is not full): today's merge. A `page-merge` unit test for both cases; the hook's existing tests stay green.

## E. F09 — the event chat opens at the newest message and follows new ones

Today: `EventChat` passes `anchor="top"`; `RoomThread` auto-scrolls only for `anchor="bottom"`: the event chat opens on the oldest of its last 50 and new messages land out of sight. On a small phone with the keyboard up the fixed blocks above the thread (header, the About block ~204px, the Board strip) leave about one line.

Required: in `RoomThread`, both anchors pin to the newest message: on the first page scroll to the end when the content overflows; follow new rows while the reader is within ~80px of the end; never yank a reader who scrolled up (today's rule for the Lounge); a short chat keeps its top-aligned layout (11.6). Re-pin when the thread's box shrinks (keyboard) if it was pinned. `EventAbout` and the Board strip move INSIDE the event chat's scroller (they scroll away with the messages) so the thread keeps its height with the keyboard up; the header stays fixed.

## F. F10 — NOT in this amendment

In the store apps a chat drawer may keep its keyboard-open height after the keyboard closes (vaul). The audit says: confirm on a real device first, then `repositionInputs={false}` inside the app shell only. No device today: left for the Android (f9) / iPhone device pass. Do not change it.

## G. Rules

- Work only in the worktree `/private/tmp/claude-501/-Users-franciscocazares-vibe/3f2b2faf-e272-43a9-b45e-25788db6edb8/scratchpad/wave2`; never touch `/Users/franciscocazares/vibe`; do not commit or push; no SQL; never production. A local dev server of this worktree may be running on http://localhost:3101 (hot reload): do not start, stop or restart it, and do not drive a browser (the orchestrator walks it afterwards).
- File ownership. **Batch POLL** (C + D): `src/lib/chat/use-room-poll.ts`, `src/lib/chat/page-merge.ts`, their tests, `src/components/mobile/messages/club/RoomChips.tsx`. **Batch NAV** (A + B + E): the new hook file, `src/components/mobile/MessagesMobile.tsx`, `src/components/mobile/messages/**` except `RoomChips.tsx` (ClubSpace, EventChat, EventAbout, RoomThread, RoomComposer, compose/*, RsvpSheet, …), `src/components/safety/ReportSheet.tsx` only if the new screens' Report needs the history entry and the change is inert for every other caller (say so), and tests. If NAV needs a line in a POLL file (or the reverse), write the request in your notes instead of editing.
- Tests: pure logic gets `node --test` tests in the repo's style (dynamic import of the `.ts` path; see `src/lib/chat/*.test.ts`). The history logic should be written so its core (the stack, "who owns this pop") is a pure module that can be tested without a DOM.
- Gates: `npx tsc --noEmit` exit 0; `npm test` all pass (baseline 1,736; report the new count); `npx eslint` on every changed file: no NEW error (the 7 legacy react-hooks errors listed in contract 17.6 stay as they are).
- Notes file first: `handoffs/chat-redesign/wave-2-build/S71c-<batch>-notes.md`, appended as you go. End with: files changed, commands and results, anything you could not do, and for NAV a precise list of what the orchestrator must walk by hand in the browser (each step and the expected result).
