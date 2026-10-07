# Session 75 (Oct 7): the mini messenger is the new inbox

S75 started from `2026-10-05-session-74-go-live-landing-waitlist-privacy.md`. Its "START HERE" list still stands except items 1 and 2, answered or done below.

## What Franky answered

- Live sign-up test: **not done yet** (S74 section 4, still his).
- Vercel Cron Run: **not sure**. The session could not read the logs (the Vercel connector answers 403 on runtime logs). Still his: Vercel > Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run, 200 = good.
- A tab left open reloaded onto a newer build by itself: **yes, once**. The new-build check works on his machine.
- Mini messenger: choice 1, a small version of the new inbox that opens chats in `/messages`.

## What shipped (`0c387a4`, live Oct 7, build `dpl_2zmkeb89…`)

The small Messages window over the desktop profile now shows the real inbox, not a copy of it.

- `public/html/_miniMessenger.js` asks `/api/me/features` once. With `chat_v2` the panel frames **`/messages/mini`**; without it (the off button) the old list and chat run as before, untouched.
- `/messages/mini` (`src/app/messages/mini/page.tsx`, `src/components/desktop/messages/MiniInbox.tsx`) is the phone's `MessagesHome` with a new `mini` prop: no header, no tab-bar gap. So: Your week, one row per club with its logo, unread marks, pinned first, one date format. Nothing to keep in step by hand.
- Every tap takes the whole tab: a row or a week card to `/messages?channel=<id>`, a link (`Find clubs`) to its own address. `openMiniMessenger(handle)` goes to `/messages?to=<handle>`.
- The unread dot on the profile's Messages icon now counts clubs too. It is `allBadgeCount` (home-rules.ts) written by hand in the script: change one, change the other.
- The frame exists only while the panel is open (its page polls every 30 s).
- If the framed page is redirected (sign-in, Terms), the whole tab follows it.

**Checked:** typecheck clean, 2,225 tests pass, walked locally at 1280 wide as Blake (a plain member) in Night and Light: the panel, a club row, a person row, the dot, close and reopen. Live: the new script is served and `/messages/mini` signed out goes to sign-in. **Not seen:** a signed-in account on the live site.

**Known:** a hidden test club still shows for its own members (Franky), as it does in full Messages: the database lets a member see a hidden club. Hiding them from members is an inbox-route decision, not a mini one. No search box in the mini any more (the inbox has none).

## Local environment

- `.env.development.local` now turns the new chat on for everyone locally (`CHAT_V2_*`, `CHAT_DESKTOP_*`); before, the main checkout ran the old chat.
- This handoff is committed but NOT pushed on purpose: a docs-only push redeploys and reloads everyone's open tabs. It goes out with the next code push.

## Next

S74's list from item 3: the blocked-pair traces, the store review note and the providers' terms before Oct 16; the privacy follow-ups; James's lawyer file; Android build Fri Oct 9; both sentinels before Oct 15.

## Later on Oct 7: the blocked-pair traces, decided (Franky said yes to the recommendation)

Two people in one club who blocked each other used to leave three traces. Decided:

| Trace | Decision | State |
|---|---|---|
| A blocked owner's or admin's Board post still shows | **Keep**: members need club announcements. Say so in the store review note. | Unchanged |
| Unread counts included the blocked person's messages | **Fix** | Shipped, `f10758f` |
| Reply and vote counts include theirs | **Leave**: a bare number names nobody. | Unchanged |

**The fix:** `/api/me/inbox` (the Lounge number, the Board dot) and `/api/orgs/[slug]/space` (each room's dot) leave out authors blocked either way; a blocked current owner or admin still counts on the Board, where their post still shows. The rule is `unreadLeftOut` in `src/lib/chat/reads.ts` (tested). Checked on the local database: a member with 16 unread Lounge messages blocked the owner (9 of them) and the number became 7; the Board dot stayed. 2,226 tests pass. The Privacy Policy says nothing about unread counts, so no policy change.

**For the store review note (draft line):** "Blocking hides a person's messages and replies everywhere, including club chats. One exception: a club's official announcements, posted by its owner or admins on the club's Board, stay visible to every member."

**Not covered:** the old thread list (`/api/me/threads` without `scope=chats`) for an account with the new chat switched off; nobody is in that state.
