# Session 73 (Oct 3-4): Privacy Policy v2, and the new Messages on desktop

S73 started from `2026-10-03-session-72-landing-demo-waitlist.md`. Franky asked for two things: finish the Privacy Policy so the new landing page and the waitlist can go live, and build the new Messages on desktop "like we did on mobile". **Nothing from S73 is on the live site and nothing was applied to the production database.**

## START HERE: session 74

1. **Ask Franky** the privacy questions in section 1 (he has not answered them) and whether he wants recent chats in the slim list (section 2).
2. **Privacy:** with his answers, fix the three sentences that rest on him, align the pages that contradict the policy, set the date, then merge `privacy-v2` with his yes. That unblocks the landing page and waitlist runbook (`handoffs/s72-prep/waitlist/BUILD.md` 6.2, steps b to k).
3. **Desktop Messages:** built and walked on `chat-desktop`. Before it can go on: Franky's look, his yes for two database files on production, a merge, and a real-phone check (section 2).
4. **Still dated from S71/S72:** hello@ mailbox (Sun Oct 4), Terms review answers (Tue Oct 6), Android build (Fri Oct 9), the old-screen chat fixes and both sentinels before Thu Oct 15, store submission Fri Oct 16, new chat for everyone Mon Oct 26.

## 1. Privacy Policy v2 (built, on branch `privacy-v2`, not merged)

- **What it is:** a full rewrite, 15 sections, about 6,000 words, plain English, a ten-line short version on top. Section 11 is the waitlist notice (`/legal/privacy#waitlist`) with the same "up to 40 days" and "up to 30 days" the form and emails use.
- **How it was made:** seven readers went through the code on `main` and `landing-night`; a writer drafted it; six checkers re-opened the code and tried to disprove 358 sentences (79 corrected, 4 flatly wrong); two readers attacked it as a regulator, an app-store reviewer, an attacker and a first-year student.
- **Files:** `handoffs/legal-2026-10-03-privacy/` (`privacy-policy-publish.md` = the text to publish; `privacy-policy-v2.md` = the same with the open questions bracketed for James and the lawyer; `calls-for-franky.md`; `changes-after-verify.md`; `facts/`, `verify/`, `claims.md`).
- **The page:** `privacy-v2` commit `4146777` (pushed). `src/app/legal/privacy/*` and new pieces in `LegalLayout.tsx`. Matches the approved text word for word; typecheck and lint pass; looked at in Night at phone width and in Light at desktop width.
- **Franky answered one thing:** the landing preview needs no changes.
- **Waiting on Franky (asked twice, not answered):**
  1. Backups: the policy says "we keep no database backups" (from the Sept 30 notes: Supabase free plan). The live delete-account page says the opposite. Which is true?
  2. Who has access: "all three moderate; one cofounder has direct access to the database and the provider accounts". Right today?
  3. Where hello@ and help@ land. The Outlook address is left out (no page or code uses it).
  4. The AI coding tools sentence in section 6: keep, name the provider, or adopt a rule that such reads return counts only.
  5. The date (`EFFECTIVE_DATE` in `page.tsx`, a placeholder: "October 5, 2026") and the re-accept: recommended to publish as a notice now and bump `TERMS_VERSION` once, with the Terms, about Oct 14.
  6. Sign-off path: publish once James has read it, lawyer in parallel? Ten lawyer questions are in `calls-for-franky.md`.
  7. The 19 Terms calls (`handoffs/legal-2026-09-29/12-results.md`) are still unanswered; Terms v3 waits on them. `calls-for-franky.md` section 4 lists where the Terms draft must change to match the policy.
- **Found by the audit, not fixed:** 13 leaks and gaps in the app (`changes-after-verify.md` section 2: for example error reports can carry the sign-in cookie to Sentry; any signed-in account can read anyone's last-active time; club chat blocks are screen-only). A task chip was raised for them. Eight other pages now contradict the policy (same file, section 4): the privacy-related ones (delete-account, Vibe+, Support, the Settings sign-out label, the waitlist form notice) should be aligned on `privacy-v2` before it merges; Terms, Community and Child Safety wording goes with the Terms.
- **The landing film shows real people** and the new Terms promise never to use someone's photo in marketing without asking: the promise is out of the policy until Franky confirms they agreed.

## 2. Messages on desktop (built and walked, on branch `chat-desktop`, not merged)

**How the design was chosen (canvas https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ, version 27):**
- Round 1 (rows 8 to 10: three columns): Franky: "so much going on ... overwhelming when you see 3 different panels"; he liked Your week across the top and wanted the chat to grow when opened.
- Round 2 (row 11: three calmer, clickable directions): he picked **2, "Tuck away"**.
- Round 3 (row 12): option 2 plus a right-hand club panel, full-width DMs, a pinned variant, My Calendar kept in the nav. **"Yes this is the direction!, build now"**, then **"yes build pinned as well"** and "keep in mind exec only chats, ... different chats within a club/org where only certain people can type and view things, and an announcement board".
- Board sources: `handoffs/chat-redesign/boards/D_*`, `D2_*`, `D3_*`; pictures in `handoffs/chat-redesign/desktop/`.

**What was built** (contract, maps, critics' changes and the as-built notes are in `handoffs/chat-redesign/wave-3-desktop/`; as-built wins over the contract):
- A new React page for `/messages` on windows 900px or wider, behind its own switch **`chat_desktop`** (`CHAT_DESKTOP_ENABLED`, `CHAT_DESKTOP_ALLOWLIST`; it only works for people who already have `chat_v2`). With the switch off a laptop sees today's page.
- Your week across the top (folds to one line while a chat is open; the month is a popover); the wide list; a slim list of names once a chat is open; New (a person, or a group of your connections).
- A club: every room as a chip (Lounge, Board with the megaphone, Officers and private rooms with a lock, extra rooms, event chats), the thread edge to edge, a hover toolbar (react, reply, "...": Report; Remove for officers and mods), the phone's sheets as dialogs, and a right panel: the club's events, **Announcements** (the latest Board posts; never marked read from there), members, and for owners and admins **Manage club** and **Manage rooms**.
- Rooms: a new "who can post" rule for extra rooms (everyone / officers / officers plus picked people), a line in place of the composer when you may read but not post, a Rooms dialog, a cap of 5 extra rooms.
- A direct message or group chat: today's thread from `messages.html`, full width, in a thread-only mode driven by `postMessage`.
- Pinned and Shared for DMs and group chats (desktop panel; on the phone, Pin / Unpin in the long-press sheet and a Pinned messages sheet, only where `chat_v2` is on).
- With the switch on, Campus > Chat leaves the desktop and old links redirect to `/messages`.
- **Five waves, 22 batches, each built, attacked by a reviewer and repaired.** Commits on `chat-desktop` (pushed): `9dc40f4`, `9ec4a3f`, `f6ccdbb`, `48a1c81`, `65de8e9`. Gate re-run by the main session after every wave: typecheck clean, **2,059 tests pass** (1,839 before), build passes.

**Two database files, applied to the LOCAL stack only:** `20261004100000_chat_message_pins.sql` (table + trigger; check script 43 cases) and `20261004110000_chat_room_post_policy.sql` (column + two restated functions; check script 104 cases). Production steps are contract 4b.3; each needs Franky's yes. Desktop is switched on only after both.

**Walked in a browser on the local stack (pictures in `wave-3-desktop/walk/`):** home; a DM full width; Back and a deep link; New; the month; a club with its panel, the Board, an event chat; the owner's view, the Rooms dialog, creating an officers-only room and seeing it read-only as a member; pinning a message and the Pinned panel; Light; 1100px (panel closed, Board strip back); 899px (the phone app); `/campus?tab=chat` redirect; and with the switch off: today's iframe, the Chat tab, the phone unchanged. The test pin and test room were removed afterwards.

**Not walked:** a real phone (the long-press Pin, the rebuilt month sheet, the lock and megaphone on chips); keyboard-only use; a group chat; the Members dialog; the New dialog's group rule; sending in a read-only room; two browsers at once; 1280px.

**Open for Franky:**
- The slim list shows only pinned and unread chats plus the open one, so with real data it is often two or three names. Recommended: add the most recent chats (up to about eight). Not answered.
- Old pinned messages cannot be jumped to on a laptop (the old thread holds the newest 50). Recommended: ship with it.
- No unread mark for the Officers room or private rooms, phone or laptop. Recommended: fix right after launch (one small database change).
- Founders and SAE get small phone changes with the first deploy (room names as words, the lock, the megaphone, "..." on Board posts, the month sheet rebuilt): ten minutes on a real phone before desktop is turned on.
- A touch laptop or iPad wide enough for the desktop layout has no long-press and the hover toolbar needs a pointer.
- The owed old-screen fixes (M2 to M5, M8, I3) are NOT in this build; they change what people without the new chat see. One small batch before Oct 15.

**Known small things:** the empty line in a read-only room says "Say hi to Chess Club."; with 20 pins and a cleared history a person cannot unpin; strings the contract never listed are in as-built.md ("The orchestrator and the planner"); the contract text was not updated after the build (as-built.md is the truth).

## 3. Local environment

- Worktrees in the S73 scratchpad (`/private/tmp/claude-501/-Users-franciscocazares-vibe/3b0859c6-.../scratchpad/`): `chatdesk` (branch `chat-desktop`, `.env.development.local` with `CHAT_V2_*` and `CHAT_DESKTOP_*` on, preview config `vibe-chatdesk`, port 3104) and `privacy` (branch `privacy-v2`, `vibe-privacy`, port 3103). Everything in both is committed and pushed. The S72 worktree `landing` (port 3102) was still alive and was used read-only.
- The local database holds the demo cast, the waitlist tables and the two new chat migrations.
- Walk tools: `handoffs/chat-redesign/wave-3-desktop/walk/walk.mjs` (scripted clicks and screenshots, signs in with the local cookie tool) and `handoffs/chat-redesign/desktop/render.mjs`, `play.mjs`, `shot.mjs` (design boards).
- `main` has S73's docs commits locally, **not pushed**.

## 4. Gotchas learned in S73

- **An agent read production without being told it could.** A contract critic ran read-only catalog queries on the production database (function fingerprints, trigger names, the newest migration, a room count; no user data). Every build prompt after that carried an explicit "never touch production" rule. Put that rule in every agent prompt from the start.
- **A text click in a scripted walk hits the first match.** "Chess Club" matched the week band's event card and "James Andres" matched a club row's preview. Click by aria-label or a unique line.
- **The design canvas refuses a publish until the whole artifact was read in this conversation** (not only `canvas.json`).
- **Clickable boards work** (state, `onClick`, style holes, CSS transitions) and render locally with `dc-runtime.js` saved as `support.js`. A twin file with a different start state shows the second state without pressing Play.
- **`/private/tmp` survived the "restart"**: S72's scratchpad, its worktree and its dev server were still there.
- **Long workflow reports get cut** when passed to a later agent as one string; keep the cap high and have agents write notes to disk.
