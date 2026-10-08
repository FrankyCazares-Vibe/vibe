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

## Evening of Oct 7: the mini messenger, second pass (Franky: "it shouldnt directly send you to the messages tab, it should allow you to send messages from when youre in your own profile, on feed, etc")

The first pass opened every chat in `/messages`. He wants to read and answer in the small window, and to have the window on the feed and the other pages too.

- **Chats open in the window.** The frame is now `/messages?mini=1`: the phone's whole Messages (`MessagesMobile` with `mini`), inbox and chat views with their composers, no shell and no tab bar. `/messages/mini` and `MiniInbox.tsx` are gone. `MessagesSwitch` also treats any framed `/messages` as mini, because opening a chat rewrites the frame's address without `mini`.
- **Only Messages stays in the frame.** `src/components/desktop/messages/MiniFrame.tsx` sends the whole tab for any link or router push that leaves `/messages` (a profile, a club page, an event).
- **On the feed, Network, Otto, Settings:** `src/components/desktop/messages/MiniMessenger.tsx`, mounted in `CampusAppShell`: a `Messages` button at the bottom right, left of Otto, with the unread number; laptops with `chat_v2` only, never on `/messages`. The static profile keeps `public/html/_miniMessenger.js`. The two are twins: change one, change the other.
- **Window title bar:** a pencil (new message, sent to the frame as `{ source: "vibe-mini", type: "compose" }`), `Open` (the chat on screen, in full Messages), close.
- The window carries `data-holds-reload` while open, so the new-build check never reloads a page under a draft typed in the frame.

**Checked locally at 1280 as Blake:** the button on the feed, the inbox, a person's chat (sent a message, it arrived, the inbox preview updated), a club's Lounge, Back inside the window, the club's page arrow taking the whole tab, and the same on the static profile. 2,226 tests pass.

**Known:** each chat opened in the window adds an entry to the tab's history, and closing the window does not take it out, so the browser's Back can need an extra press afterwards. Not seen on the live site signed in, in Safari, or in Light for this pass.

## Oct 8: Messages as a tab of Otto's panel (Franky: "maybe we should make otto be the messages tab aswell in some way ... lets try the first one")

A try, his words: he is not sure what he is picturing. Of three choices he picked the lightest: one corner, one button.

- The separate `Messages` button on the shelled pages is gone. Otto's orb is the only button; **Otto's panel has two tabs, `Otto` and `Messages`** (`PanelTabs` in `src/components/network/OttoSidePanel.tsx`). The Messages tab is the same frame (`/messages?mini=1`), with the pencil and `Open` in the tab row. The panel opens on the tab it was left on.
- **The orb's number is Otto's news plus unread chats**; the Messages tab carries the chat count.
- `src/components/desktop/messages/MiniMessenger.tsx` is now the shared pieces: `useMiniMessages` (is it available, the unread number) and `MiniMessagesFrame`. Laptops with `chat_v2` only; a phone's Otto panel is unchanged.
- **The static desktop profile has the same** (later on Oct 8, Franky: "i like this direction, lets do same thing to profile"): `_otto.js` announces its panel opening and closing (`vibe:otto-panel`), and `_miniMessenger.js` adds the two tabs and the frame to `#ottoPanel`. The top-bar Messages icon opens Otto's panel on the Messages tab (and closes it); Otto's ring lights for unread chats (`.has-chats`). The old floating window only runs without `chat_v2`.

**Checked locally at 1280 as Blake:** two tabs, the inbox, a person's chat with its composer, at 380 wide. 2,226 tests pass.

**For Franky to judge:** Otto's panel dims and blurs the page behind it, so chatting there is not "on the side" of the feed the way the small window was; the panel is always dark, so in Light the Messages tab is a light inbox inside a dark panel; If the try is kept, those two are the follow-ups (he said he likes the direction). If not, the corner button is one commit back.

**Light fixed (Oct 8, his yes):** the Messages frame is always Night, on the feed and on the profile, because Otto's panel is dark in both themes. `MiniFrame` renders `NIGHT_LOCK_SCRIPT` (sets `<html data-theme-lock="dark">` before the first paint) and `applyTheme` keeps a locked document Night (`src/lib/theme/theme.ts`). Seen locally with the page in Light: the frame's page is Night. Still open: the page behind dims while the panel is open.

## Privacy follow-ups done in S75 (rows of `legal-2026-10-04-privacy-v3/page-and-code-changes.md` part 2)

| Row | What | Policy change, same deploy |
|---|---|---|
| 56 | A sender sees their removed message marked, in direct and group chats (phone and desktop) | 5h: one sentence instead of three |
| 50 | Profile views no longer send or store the page you came from | 3d: "Until October 7, 2026 we also recorded…". Old values still stored: clearing them is `update public.profile_views set referrer = null;` on production, NOT run (needs Franky's yes); then the sentence can go |
| 36 | A block also stops new reactions on the blocked person's messages (taking one back is never refused) | 5e Blocks: "new messages and new reactions" |
| 28 | Deleting an account also deletes a waitlist entry under its sign-in or school email, not only the one its code came from | Section 9: "your waitlist entry" |
| 52 | Deleting an account takes its sign-in address off the no-code sign-up list | Section 9 bullet removed; section 11 says so; delete-account page in line |
| 39 | Sign-up: "Good to know: people can see that you viewed their profile or post." under the checkbox | none |
| 40 | Sign-in screen: Privacy Policy and Terms links | none |

Checked: page = text 1,081 of 1,081; 2,230 tests (three new for rows 28 and 52, one for the Night lock); the reaction block walked locally (403 with a block, 200 without, take-back always 200). **Not walked end to end:** account deletion, because the local setup has no file storage and the route stops at the file step before the new lines; rows 28 and 52 rest on their unit tests.

**Changes to the by-hand steps (part 3):** item 20 (deleting an account by email, by hand) now needs one more step, because only the Settings route does it: take the address off `signup_allowlist` and delete any waitlist entry under the account's addresses. The policy says "If we delete your account for you, we take it off by hand."

**Looked at and left:** row 33 (a deleted message's file cannot be attached again) is not small: a deleted message leaves no record to check against. Row 29 (the email service's reference number) needs a database change for the account-deletion half. Rows 24, 51, 58, 21 to 23 are database changes on production: Franky's yes first.
